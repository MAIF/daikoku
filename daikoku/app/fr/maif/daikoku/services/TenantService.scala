package fr.maif.daikoku.services

import cats.data.EitherT
import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.logger.AppLogger
import fr.maif.daikoku.utils.IdGenerator
import play.api.libs.json.*

import scala.concurrent.{ExecutionContext, Future}
import scala.util.Using

class TenantService(
    env: Env,
    deletionService: DeletionService
) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  def createTenant(tenant: Tenant): EitherT[Future, AppError, Tenant] = {
    val adminTeam = Team(
      id = TeamId(IdGenerator.token),
      tenant = tenant.id,
      `type` = TeamType.Admin,
      name = s"${tenant.humanReadableId}-admin-team",
      description = s"The admin team for the default tenant",
      avatar = tenant.style.flatMap(_.logo),
      users = Set.empty,
      authorizedOtoroshiEntities = None,
      contact = tenant.contact,
      apisCreationPermission = true.some
    )
    val (adminApi, adminApiPlan) = ApiTemplate.adminApi(adminTeam, tenant)

    val tenantForCreation = tenant.copy(
      adminApi = adminApi.id,
      authProvider = env.config.init.authProviderConfig.defaultprovider,
      authProviderSettings = env.config.init.authProviderConfig.oauth2config
        .map(_.asJson)
        .getOrElse(Json.obj("sessionMaxAge" -> 86400))
    )

    val (cmsApi, cmsPlan) = ApiTemplate.cmsApi(adminTeam, tenant)

    EitherT.liftF[Future, AppError, Tenant](for {
      _ <- env.dataStore.tenantRepo.save(tenantForCreation)
      _ <-
        env.dataStore.teamRepo
          .forTenant(tenantForCreation)
          .save(adminTeam)
      _ <-
        env.dataStore.apiRepo
          .forTenant(tenantForCreation)
          .save(adminApi)
      _ <-
        env.dataStore.apiRepo
          .forTenant(tenantForCreation)
          .save(cmsApi)
      _ <-
        env.dataStore.usagePlanRepo
          .forTenant(tenantForCreation)
          .save(cmsPlan)
      _ <-
        env.dataStore.usagePlanRepo
          .forTenant(tenantForCreation)
          .save(adminApiPlan)

      defaultThemeBody = env.environment
        .resourceAsStream("public/themes/default.css")
        .map(stream =>
          Using.resource(stream)(s =>
            scala.io.Source.fromInputStream(s).mkString
          )
        )
        .getOrElse {
          AppLogger.warn(
            "public/themes/default.css not found, using empty default color theme"
          )
          ""
        }

      colorThemePage = Tenant.getCustomizationCmsPage(
        tenantId = tenant.id,
        pageId = "color-theme",
        contentType = "text/css",
        body = defaultThemeBody
      )

      _ <- env.dataStore.cmsRepo
        .forTenant(tenant.id)
        .save(colorThemePage)
    } yield tenantForCreation)
  }

  def updateTenant(
      oldTenant: Tenant,
      updatedTenant: Tenant,
      excludedSessionId: Option[UserSessionId]
  ): EitherT[Future, AppError, Tenant] = {
    // Going to maintenance or construction disconnects everybody but the
    // administrator performing the change.
    val disconnectUsers = updatedTenant.tenantMode match {
      case Some(TenantMode.Maintenance) | Some(TenantMode.Construction) =>
        env.dataStore.userSessionRepo.deleteAllExceptSession(excludedSessionId)
      case _ => Future.successful(0L)
    }

    for {
      _ <- checkRemovedSettingsAreUnused(oldTenant, updatedTenant)
      _ <- EitherT.liftF[Future, AppError, Long](disconnectUsers)
      adminTeam <- EitherT.fromOptionF(
        env.dataStore.teamRepo.findAdminTeam(updatedTenant.id),
        AppError.EntityNotFound("admin team")
      )
      _ <- deleteUnusedEnvironments(oldTenant, updatedTenant)
      _ <- EitherT.liftF[Future, AppError, Boolean](
        env.dataStore.tenantRepo.save(updatedTenant)
      )
      _ <- EitherT.liftF[Future, AppError, Boolean](
        env.dataStore.teamRepo
          .forTenant(updatedTenant)
          .save(
            adminTeam.copy(
              name = s"${updatedTenant.humanReadableId}-admin-team",
              contact = updatedTenant.contact,
              avatar = updatedTenant.style.flatMap(_.logo)
            )
          )
      )
    } yield updatedTenant
  }

  def deleteTenant(tenant: Tenant): EitherT[Future, AppError, Tenant] = {
    EitherT.liftF[Future, AppError, Tenant](for {
      _ <- env.dataStore.apiRepo.forTenant(tenant).deleteAll()
      _ <-
        env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .deleteAll()
      _ <-
        env.dataStore.apiDocumentationPageRepo
          .forTenant(tenant)
          .deleteAll()
      _ <-
        env.dataStore.notificationRepo
          .forTenant(tenant)
          .deleteAll()
      _ <- env.dataStore.teamRepo.forTenant(tenant).deleteAll()
      _ <- env.dataStore.tenantRepo.save(tenant.copy(deleted = true))
      _ <- env.dataStore.userRepo.execute(
        s"UPDATE ${env.dataStore.userRepo.tableName} " +
          "SET content = content || '{\"lastTenant\": null}' " +
          "WHERE content->>'lastTenant' = $1",
        Seq(tenant.id.value)
      )
    } yield tenant.copy(deleted = true))
  }

  private def checkRemovedSettingsAreUnused(
      oldTenant: Tenant,
      updatedTenant: Tenant
  ): EitherT[Future, AppError, Unit] = {
    val removedOtoroshiSettings = oldTenant.otoroshiSettings
      .map(_.id)
      .diff(updatedTenant.otoroshiSettings.map(_.id))
    val removedPaymentSettings = oldTenant.thirdPartyPaymentSettings
      .map(_.id)
      .diff(updatedTenant.thirdPartyPaymentSettings.map(_.id))

    for {
      _ <-
        if (removedOtoroshiSettings.isEmpty)
          EitherT.pure[Future, AppError](())
        else
          EitherT.liftF[Future, AppError, Seq[UsagePlan]](
            env.dataStore.usagePlanRepo
              .findByOtoroshiSettings(
                updatedTenant.id,
                removedOtoroshiSettings.map(_.value).toSeq
              )
          ).flatMap(plans =>
            EitherT.cond[Future][AppError, Unit](
              plans.isEmpty,
              (),
              AppError.EntityConflict(
                s"otoroshi settings still used by plans ${plans.map(_.id.value).mkString(", ")}"
              )
            )
          )
      _ <-
        if (removedPaymentSettings.isEmpty)
          EitherT.pure[Future, AppError](())
        else
          EitherT.liftF[Future, AppError, Seq[UsagePlan]](
            env.dataStore.usagePlanRepo
              .findByPaymentSettings(
                updatedTenant.id,
                removedPaymentSettings.map(_.value).toSeq
              )
          ).flatMap(plans =>
            EitherT.cond[Future][AppError, Unit](
              plans.isEmpty,
              (),
              AppError.EntityConflict(
                s"payment settings still used by plans ${plans.map(_.id.value).mkString(", ")}"
              )
            )
          )
    } yield ()
  }

  private def deleteUnusedEnvironments(
      oldTenant: Tenant,
      updatedTenant: Tenant
  ): EitherT[Future, AppError, Unit] = {
    updatedTenant.display match {
      case TenantDisplay.Environment =>
        val deletedEnvs =
          oldTenant.environments.diff(updatedTenant.environments)
        EitherT.liftF(
          Future
            .sequence(deletedEnvs.map(name => {
              for {
                plans <-
                  env.dataStore.usagePlanRepo
                    .findByCustomName(updatedTenant.id, name)
                _ <- Future.sequence(
                  plans
                    .map(plan => {
                      for {
                        api <- EitherT.fromOptionF(
                          env.dataStore.apiRepo
                            .findByPlan(updatedTenant.id, plan.id),
                          AppError.ApiNotFound
                        )
                        _ <- deletionService.deleteUsagePlanByQueue(
                          plan.id,
                          api.id,
                          updatedTenant.id
                        )
                      } yield api
                    })
                    .map(_.value)
                )
              } yield ()
            }))
            .map(_ -> ())
        )
      case TenantDisplay.Default => EitherT.pure[Future, AppError](())
    }
  }
}
