package fr.maif.daikoku.services

import cats.data.EitherT
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.jobs.OtoroshiSynchronizerJob
import fr.maif.daikoku.utils.StringImplicits.BetterString
import fr.maif.daikoku.utils.Translator
import org.apache.pekko.http.scaladsl.util.FastFuture
import play.api.i18n.MessagesApi
import play.api.libs.json.*

import scala.concurrent.{ExecutionContext, Future}

class ApiCrudService(
    env: Env,
    apiLifeCycleService: ApiLifeCycleService,
    otoroshiSynchronisator: OtoroshiSynchronizerJob,
    deletionService: DeletionService,
    translator: Translator,
    messagesApi: MessagesApi
) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env
  implicit val tr: Translator = translator
  implicit val ma: MessagesApi = messagesApi

  def checkApiNameUniqueness(
      maybeApiId: Option[String],
      name: String,
      tenant: TenantId
  ): Future[Boolean] = {
    val apiRepo = env.dataStore.apiRepo.forTenant(tenant)
    val maybeHumanReadableId = name.urlPathSegmentSanitized

    def taken(excludedId: Option[String]): Future[Boolean] =
      env.dataStore.apiRepo
        .existsRootWithHumanReadableId(tenant, maybeHumanReadableId, excludedId)

    maybeApiId match {
      case Some(apiId) =>
        apiRepo.findById(apiId).flatMap {
          case None => taken(None)
          case Some(api) =>
            taken(api.parent.map(_.value).orElse(Some(apiId)))
        }

      case None => taken(None)
    }
  }

  def createApi(
      tenant: Tenant,
      team: Team,
      api: Api
  ): EitherT[Future, AppError, Api] = {
    for {
      _ <- EitherT.cond[Future][AppError, Unit](
        !(tenant.creationSecurity
          .getOrElse(false) && !team.apisCreationPermission
          .getOrElse(false)),
        (),
        AppError.Forbidden("Team forbidden to create api on current tenant")
      )
      nameAlreadyExists <- EitherT.liftF[Future, AppError, Boolean](
        checkApiNameUniqueness(
          Some(api.id.value),
          api.name.toLowerCase.trim,
          tenant.id
        )
      )
      _ <- EitherT.cond[Future][AppError, Unit](
        !nameAlreadyExists,
        (),
        AppError.NameAlreadyExists
      )
      _ <- EitherT.liftF[Future, AppError, Boolean](
        env.dataStore.apiRepo.forTenant(tenant.id).save(api)
      )
    } yield api
  }

  def updateApi(
      tenant: Tenant,
      user: User,
      oldApi: Api,
      newApi: Api
  ): EitherT[Future, AppError, Api] = {
    for {
      anotherApiHasSameName <- EitherT.liftF[Future, AppError, Boolean](
        checkApiNameUniqueness(
          Some(newApi.id.value),
          newApi.name,
          tenant.id
        )
      )
      _ <- EitherT.cond[Future][AppError, Unit](
        !anotherApiHasSameName,
        (),
        AppError.NameAlreadyExists
      )
      _ <- EitherT.cond[Future][AppError, Unit](
        newApi.state.checkPreviousState(oldApi.state),
        (),
        AppError.EntityConflict("api state")
      )
      hasSubscriptions <-
        if (
          newApi.state == ApiState.Created && oldApi.state != ApiState.Created
        )
          EitherT.liftF[Future, AppError, Boolean](
            env.dataStore.apiSubscriptionRepo
              .countByApi(tenant.id, newApi.id)
              .map(_ > 0)
          )
        else EitherT.pure[Future, AppError](false)
      _ <- EitherT.cond[Future][AppError, Unit](
        !hasSubscriptions,
        (),
        AppError.EntityConflict("api subscriptions")
      )
      anotherApiHasSameVersion <- EitherT.liftF[Future, AppError, Boolean](
        env.dataStore.apiRepo
          .existsOtherVersion(
            tenant.id,
            newApi.humanReadableId,
            newApi.currentVersion.value,
            newApi.id
          )
      )
      _ <- EitherT.cond[Future][AppError, Unit](
        !anotherApiHasSameVersion,
        (),
        AppError.ApiVersionConflict
      )
      _ <- EitherT.liftF[Future, AppError, Boolean](
        env.dataStore.apiRepo
          .forTenant(tenant.id)
          .save(newApi)
      )
      _ <- apiLifeCycleService.handleApiLifeCycle(oldApi, newApi, tenant, user)
      _ <- EitherT.liftF[Future, AppError, Unit](
        otoroshiSynchronisator.run(newApi.id, tenant)
      )
      _ <- EitherT.liftF[Future, AppError, Seq[Boolean]](
        updateTagsOfIssues(tenant.id, newApi)
      )
      _ <- EitherT.liftF[Future, AppError, Long](
        updateAllHumanReadableId(tenant, newApi, oldApi)
      )
      _ <- EitherT.liftF[Future, AppError, Long](
        turnOffDefaultVersion(tenant, newApi, oldApi)
      )
    } yield newApi
  }

  def deleteApi(
      tenant: Tenant,
      api: Api,
      nextCurrentVersion: Option[String] = None
  ): EitherT[Future, AppError, Unit] = {
    for {
      _ <- EitherT.cond[Future][AppError, Unit](
        api.visibility != ApiVisibility.AdminOnly,
        (),
        AppError.ForbiddenAction
      )
      _ <- deletionService.deleteApiByQueue(id = api.id, tenant = tenant.id)
      _ <- processNextCurrentVersion(tenant, api, nextCurrentVersion)
    } yield ()
  }

  private def processNextCurrentVersion(
      tenant: Tenant,
      api: Api,
      nextVersion: Option[String]
  ): EitherT[Future, AppError, Unit] = {
    nextVersion match {
      case None => EitherT.pure[Future, AppError](())
      case Some(version) =>
        for {
          nextCurrentApi <- EitherT.fromOptionF[Future, AppError, Api](
            env.dataStore.apiRepo
              .findByVersion(tenant.id, api.humanReadableId, version),
            AppError.ApiNotFound
          )
          _ <- EitherT.liftF[Future, AppError, Boolean](
            env.dataStore.apiRepo
              .forTenant(tenant)
              .save(nextCurrentApi.copy(isDefault = true, parent = None))
          )
          _ <- EitherT.liftF[Future, AppError, Long](
            env.dataStore.apiRepo
              .reparentVersions(
                tenant.id,
                api.humanReadableId,
                api.id,
                nextCurrentApi.id
              )
          )
        } yield ()
    }
  }

  private def updateAllHumanReadableId(
      tenant: Tenant,
      apiToSave: Api,
      oldApi: Api
  ): Future[Long] = {
    if (oldApi.name != apiToSave.name) {
      env.dataStore.apiRepo
        .renameHumanReadableId(
          tenant.id,
          oldApi.humanReadableId,
          apiToSave.humanReadableId
        )
    } else
      FastFuture.successful(0L)
  }

  private def turnOffDefaultVersion(
      tenant: Tenant,
      apiToSave: Api,
      oldApi: Api
  ): Future[Long] = {
    if (apiToSave.isDefault && !oldApi.isDefault)
      env.dataStore.apiRepo
        .clearDefaultVersionExceptVersion(
          tenant.id,
          apiToSave.humanReadableId,
          apiToSave.currentVersion.value
        )
    else
      FastFuture.successful(0L)
  }

  private def updateTagsOfIssues(
      tenantId: TenantId,
      api: Api
  ): Future[Seq[Boolean]] = {
    env.dataStore.apiIssueRepo
      .forTenant(tenantId)
      .findAllIncludingDeleted()
      .flatMap { issues =>
        Future.sequence(issues.map(issue => {
          env.dataStore.apiIssueRepo
            .forTenant(tenantId)
            .save(
              issue.copy(tags =
                issue.tags
                  .filter(tag => api.issuesTags.exists(t => t.id == tag))
              )
            )
        }))
      }
  }
}
