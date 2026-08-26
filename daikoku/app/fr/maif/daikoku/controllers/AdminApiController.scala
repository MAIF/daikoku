package fr.maif.daikoku.controllers

import cats.data.EitherT
import cats.implicits.*
import fr.maif.daikoku.actions.{DaikokuAction, DaikokuActionContext}
import fr.maif.daikoku.audit.AuditTrailEvent
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.controllers.authorizations.async.DaikokuAdminOnly
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.domain.json.*
import fr.maif.daikoku.env.{DaikokuMode, Env}
import fr.maif.daikoku.jobs.OtoroshiSynchronizerJob
import fr.maif.daikoku.logger.AppLogger
import fr.maif.daikoku.services.*
import fr.maif.daikoku.storage.{DataStore, Repo}
import fr.maif.daikoku.utils.*
import io.vertx.sqlclient.Pool
import org.apache.pekko.Done
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.Source
import org.apache.pekko.util.ByteString
import org.joda.time.DateTime
import play.api.http.HttpEntity
import play.api.libs.json.*
import play.api.libs.streams.Accumulator
import play.api.mvc.*

import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success, Using}

class StateController(
    DaikokuAction: DaikokuAction,
    env: Env,
    otoroshiClient: OtoroshiClient,
    cc: ControllerComponents,
    pgPool: Pool
) extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val mat: Materializer = env.defaultMaterializer
  implicit val ev: Env = env

  val bodyParser: BodyParser[Source[ByteString, ?]] =
    BodyParser("Import parser") { _ =>
      Accumulator.source[ByteString].map(Right.apply)
    }

  def exportState() =
    DaikokuAction.async { ctx =>
      DaikokuAdminOnly(AuditTrailEvent(s"@{user.name} has exported state"))(
        ctx
      ) {
        val source = env.dataStore.exportAsStream(
          pretty = false,
          exportAuditTrail = ctx.request
            .getQueryString("export-audit-trail")
            .contains("true")
        ) // (ctx.request.getQueryString("pretty").exists(_ == "true"))
        val disposition =
          ("Content-Disposition" -> s"""attachment; filename="daikoku-export-${System.currentTimeMillis}.ndjson"""")
        val future =
          if (ctx.request.getQueryString("download").contains("true")) {
            Ok.sendEntity(HttpEntity.Streamed(source, None, Some("")))
              .withHeaders(disposition)
              .as("application/x-ndjson")
          } else {
            Ok.sendEntity(HttpEntity.Streamed(source, None, Some("")))
              .as("application/x-ndjson")
          }
        FastFuture.successful(future)
      }
    }

  def importState() =
    DaikokuAction.async(bodyParser) { ctx =>
      DaikokuAdminOnly(AuditTrailEvent(s"@{user.name} has imported state"))(
        ctx
      ) {
        env.dataStore
          .importFromStream(ctx.request.body)
          .map(_ => Ok(Json.obj("done" -> true)))
      }
    }

  def getAnonymousState: Action[AnyContent] =
    DaikokuAction.async { ctx =>
      DaikokuAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has accessed state of anonymous reporting"
        )
      )(ctx) {
        env.dataStore.reportsInfoRepo
          .findAllIncludingDeleted()
          .map(info => {
            val date: Long = info.headOption
              .flatMap(_.date)
              .getOrElse(DateTime.now().getMillis)
            Ok(
              Json.obj(
                "activated" -> info.headOption.exists(_.activated),
                "id" -> info.headOption
                  .map(_.id.asJson)
                  .getOrElse(JsNull)
                  .as[JsValue],
                "date" -> date,
                "message" -> "info fetched correctly"
              )
            )
          })
      }
    }

  def updateAnonymousState(): Action[JsValue] =
    DaikokuAction.async(parse.json) { ctx =>
      DaikokuAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has set anonymous reporting to ${ctx.request.body}"
        )
      )(ctx) {
        val body = ctx.request.body.as[JsObject]
        for {
          maybeDate <-
            env.dataStore.reportsInfoRepo
              .findAllIncludingDeleted()
              .map(info => info.head.date)
          _ <- env.dataStore.reportsInfoRepo.save(
            ReportsInfo(
              DatastoreId((body \ "id").as[String]),
              (body \ "value").as[Boolean],
              (body \ "currentDate").asOpt[Long] match {
                case Some(value) => Some(value)
                case None        => maybeDate
              }
            )
          )
        } yield (Ok(Json.obj("message" -> "anonymous reporting updated")))
      }
    }

  private def removeAllUserSessions(ctx: DaikokuActionContext[AnyContent]) =
    env.dataStore.userSessionRepo
      .deleteAllExceptSession(ctx.session.sessionId.some)

  def enableMaintenanceMode(): Action[AnyContent] =
    DaikokuAction.async { ctx =>
      DaikokuAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has enabled maintenance mode on all tenants"
        )
      )(ctx) {
        removeAllUserSessions(ctx)
          .flatMap { _ =>
            env.dataStore.tenantRepo
              .findAll()
              .map(
                _.map(tenant =>
                  env.dataStore.tenantRepo
                    .save(tenant.copy(tenantMode = TenantMode.Maintenance.some))
                )
              )
          }
          .map(_ =>
            Ok(
              ctx.tenant
                .copy(tenantMode = TenantMode.Maintenance.some)
                .toUiPayload(env)
            )
          )
      }
    }

  def disableMaintenanceMode(): Action[AnyContent] =
    DaikokuAction.async { ctx =>
      DaikokuAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has disabled maintenance mode on all tenants"
        )
      )(ctx) {
        env.dataStore.tenantRepo
          .findAll()
          .map(
            _.map(tenant =>
              env.dataStore.tenantRepo
                .save(tenant.copy(tenantMode = TenantMode.Default.some))
            )
          )
          .map(_ =>
            Ok(
              ctx.tenant
                .copy(tenantMode = TenantMode.Default.some)
                .toUiPayload(env)
            )
          )
      }
    }

  def isMaintenanceMode: Action[AnyContent] =
    DaikokuAction.async { ctx =>
      DaikokuAdminOnly(
        AuditTrailEvent(s"@{user.name} has accessed to maintenance mode")
      )(ctx) {
        env.dataStore.tenantRepo
          .findAll()
          .map { tenants =>
            tenants.forall(tenant =>
              tenant.tenantMode.isDefined && tenant.tenantMode.get
                .equals(TenantMode.Maintenance)
            )
          }
          .map(locked => Ok(Json.obj("isMaintenanceMode" -> locked)))
      }
    }
}

class StateAdminApiController(
    DaikokuApiAction: DaikokuApiAction,
    DaikokuApiActionWithoutTenant: DaikokuApiActionWithoutTenant,
    env: Env,
    cc: ControllerComponents
) extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val mat: Materializer = env.defaultMaterializer
  implicit val ev: Env = env

  val bodyParser: BodyParser[Source[ByteString, ?]] =
    BodyParser("Import parser") { _ =>
      Accumulator.source[ByteString].map(Right.apply)
    }

  def exportState() =
    DaikokuApiAction.async { ctx =>
      val source = env.dataStore.exportAsStream(
        pretty = false,
        exportAuditTrail = ctx.request
          .getQueryString("export-audit-trail")
          .contains("true")
      ) // (ctx.request.getQueryString("pretty").exists(_ == "true"))
      val disposition =
        ("Content-Disposition" -> s"""attachment; filename="daikoku-export-${System.currentTimeMillis}.ndjson"""")
      val future =
        if (ctx.request.getQueryString("download").contains("true")) {
          Ok.sendEntity(HttpEntity.Streamed(source, None, Some("")))
            .withHeaders(disposition)
            .as("application/x-ndjson")
        } else {
          Ok.sendEntity(HttpEntity.Streamed(source, None, Some("")))
            .as("application/x-ndjson")
        }
      FastFuture.successful(future)
    }

  def importState() =
    DaikokuApiActionWithoutTenant.async(bodyParser) { req =>
      env.dataStore
        .importFromStream(req.body)
        .map(_ => Ok(Json.obj("done" -> true)))
    }

  def reset() =
    DaikokuApiAction.async { ctx =>
      (for {
        _ <- EitherT.cond[Future][AppError, Unit](
          env.config.isDev || env.config.mode == DaikokuMode.Test,
          (),
          AppError.SecurityError("Action not avalaible")
        )
        log = AppLogger.warn("##############  RESET ################")
        _ <- EitherT.liftF[Future, AppError, Unit](env.dataStore.clear())
        _ <- EitherT.liftF[Future, AppError, Done](
          env.initDatastore(ctx.request.getQueryString("path"))
        )
      } yield Ok(Json.obj("done" -> true)))
        .leftMap(_.render())
        .merge
    }
}

class TenantAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents,
    tenantService: TenantService
) extends AdminApiController[Tenant, TenantId](daa, env, cc) {
  override def entityClass = classOf[Tenant]
  override def entityName: String = "tenant"
  override def pathRoot: String = s"/admin-api/${entityName}s"
  override def entityStore(
      tenant: Tenant,
      ds: DataStore
  ): Repo[Tenant, TenantId] =
    ds.tenantRepo
  override def toJson(entity: Tenant): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, Tenant] =
    TenantFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))

  override def validate(
      entity: Tenant,
      updateOrCreate: UpdateOrCreate
  ): EitherT[Future, AppError, Tenant] =
    EitherT(
      env.dataStore.tenantRepo
        .existsAnotherWithDomain(entity.id, entity.domain)
        .map {
          case true =>
            Left(AppError.ParsingPayloadError("tenant.domain already used"))
          case false => Right(entity)
        }
    )

  override def getId(entity: Tenant): TenantId = entity.id

  override def doCreate(
      tenant: Tenant,
      entity: Tenant
  ): EitherT[Future, AppError, Tenant] =
    tenantService.createTenant(entity)

  override def doUpdate(
      tenant: Tenant,
      oldEntity: Tenant,
      newEntity: Tenant
  ): EitherT[Future, AppError, Tenant] =
    tenantService.updateTenant(oldEntity, newEntity, None)

  override def doDelete(
      tenant: Tenant,
      entity: Tenant,
      logically: Boolean
  ): EitherT[Future, AppError, Unit] =
    tenantService.deleteTenant(entity).map(_ => ())
}

class UserAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents,
    deletionService: DeletionService,
    userService: UserService
) extends AdminApiController[User, UserId](daa, env, cc) {
  override def entityClass = classOf[User]
  override def entityName: String = "user"
  override def pathRoot: String = s"/admin-api/${entityName}s"
  override def entityStore(tenant: Tenant, ds: DataStore): Repo[User, UserId] =
    ds.userRepo
  override def toJson(entity: User): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, User] =
    UserFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))

  override def validate(
      entity: User,
      updateOrCreate: UpdateOrCreate
  ): EitherT[Future, AppError, User] =
    EitherT(
      env.dataStore.userRepo
        .existsAnotherWithEmail(entity.id, entity.email)
        .map {
          case true =>
            Left(AppError.ParsingPayloadError("user.email already used"))
          case false => Right(entity)
        }
    )

  override def getId(entity: User): UserId = entity.id

  override def doCreate(
      tenant: Tenant,
      entity: User
  ): EitherT[Future, AppError, User] =
    userService.createUser(entity, hashPassword = false)

  override def doUpdate(
      tenant: Tenant,
      oldEntity: User,
      newEntity: User
  ): EitherT[Future, AppError, User] =
    userService.updateUser(
      tenant,
      oldEntity,
      newEntity,
      elevatedRights = true,
      hashPassword = false
    )

  override def doDelete(
      tenant: Tenant,
      entity: User,
      logically: Boolean
  ): EitherT[Future, AppError, Unit] =
    deletionService
      .deleteCompleteUserByQueue(entity.id.value, tenant)
}

class TeamAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents,
    deletionService: DeletionService,
    teamService: TeamService
) extends AdminApiController[Team, TeamId](daa, env, cc) {
  override def entityClass = classOf[Team]

  override def entityName: String = "team"

  override def readMetadata(e: Team): Map[String, String] = e.metadata

  override def pathRoot: String = s"/admin-api/${entityName}s"

  override def entityStore(tenant: Tenant, ds: DataStore): Repo[Team, TeamId] =
    ds.teamRepo.forTenant(tenant)

  override def toJson(entity: Team): JsValue = entity.asJson

  override def fromJson(entity: JsValue): Either[String, Team] =
    TeamFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))

  override def validate(
      entity: Team,
      updateOrCreate: UpdateOrCreate
  ): EitherT[Future, AppError, Team] = {
    import cats.implicits.*
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findByIdIncludingDeleted(entity.tenant),
        AppError.ParsingPayloadError("Tenant not found")
      )
      _ <-
        entity.users
          .map(u =>
            EitherT.fromOptionF[Future, AppError, User](
              env.dataStore.userRepo.findByIdIncludingDeleted(u.userId),
              AppError.ParsingPayloadError(s"User ${u.userId.value} not found")
            )
          )
          .toList
          .sequence
    } yield entity
  }

  override def getId(entity: Team): TeamId = entity.id

  override def doCreate(
      tenant: Tenant,
      entity: Team
  ): EitherT[Future, AppError, Team] = {
    implicit val language: String = tenant.defaultLanguage.getOrElse("en")
    teamService.createTeam(tenant, entity, None)
  }

  override def doUpdate(
      tenant: Tenant,
      oldEntity: Team,
      newEntity: Team
  ): EitherT[Future, AppError, Team] = {
    implicit val language: String = tenant.defaultLanguage.getOrElse("en")
    teamService.updateTeam(
      tenant,
      User.system,
      oldEntity,
      newEntity,
      elevatedRights = true
    )
  }

  override def doDelete(
      tenant: Tenant,
      entity: Team,
      logically: Boolean
  ): EitherT[Future, AppError, Unit] =
    teamService.deleteTeam(tenant, entity)
}

class ApiAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents,
    deletionService: DeletionService,
    apiCrudService: ApiCrudService
) extends AdminApiController[Api, ApiId](daa, env, cc) {
  override def entityClass = classOf[Api]
  override def entityName: String = "api"

  override def readMetadata(e: Api): Map[String, String] = e.metadata

  override def reconcileMerge(existing: Api, incoming: Api): Api =
    incoming.copy(
      createdAt = existing.createdAt,
      lastUpdate = existing.lastUpdate,
      documentation =
        if (incoming.documentation.pages.isEmpty) existing.documentation
        else incoming.documentation,
      posts = existing.posts,
      issues = existing.issues,
      issuesTags = existing.issuesTags,
      stars = existing.stars
    )

  override def pathRoot: String = s"/admin-api/${entityName}s"
  override def entityStore(tenant: Tenant, ds: DataStore): Repo[Api, ApiId] =
    ds.apiRepo.forTenant(tenant)
  override def toJson(entity: Api): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, Api] =
    ApiFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))

  override def validate(
      entity: Api,
      updateOrCreate: UpdateOrCreate
  ): EitherT[Future, AppError, Api] = {
    import cats.implicits.*
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findByIdIncludingDeleted(entity.tenant),
        AppError.ParsingPayloadError("Tenant not found")
      )
      _ <-
        entity.possibleUsagePlans
          .map(planId =>
            EitherT.fromOptionF[Future, AppError, UsagePlan](
              env.dataStore.usagePlanRepo
                .forTenant(entity.tenant)
                .findByIdIncludingDeleted(planId),
              AppError.ParsingPayloadError(
                s"Usage Plan (${planId.value}) not found"
              )
            )
          )
          .toList
          .sequence
      _ <- EitherT.cond[Future][AppError, Unit](
        entity.defaultUsagePlan.forall(entity.possibleUsagePlans.contains),
        (),
        AppError.ParsingPayloadError(
          s"Default Usage Plan (${entity.defaultUsagePlan.get.value}) not found"
        )
      )
      _ <- EitherT.fromOptionF[Future, AppError, Team](
        env.dataStore.teamRepo
          .forTenant(entity.tenant)
          .findByIdIncludingDeleted(entity.team),
        AppError.ParsingPayloadError("Team not found")
      )
      _ <- updateOrCreate match {
        case UpdateOrCreate.Update =>
          EitherT(
            env.dataStore.apiRepo
              .findAnotherWithName(
                entity.tenant,
                entity.id,
                entity.name,
                entity.parent
              )
              .map {
                case Some(api)
                    if entity.parent.contains(api.id) || api.parent
                      .contains(entity.id) =>
                  Right(())
                case Some(_) =>
                  Left(AppError.ParsingPayloadError("Api name already exists"))
                case None => Right(())
              }
          )
        case UpdateOrCreate.Create =>
          EitherT(
            env.dataStore.apiRepo
              .findAnotherWithName(
                entity.tenant,
                entity.id,
                entity.name,
                entity.parent
              )
              .map {
                case None =>
                  Right(())
                // case Some(api) if entity.parent == api.parent => Right(())
                case Some(api) if entity.parent.contains(api.id) =>
                  Right(())
                case Some(_) =>
                  Left(AppError.ParsingPayloadError("Api name already exists"))
              }
          )
      }
      _ <-
        entity.documentation.pages
          .map(_.id)
          .map(pageId =>
            EitherT.fromOptionF[Future, AppError, ApiDocumentationPage](
              env.dataStore.apiDocumentationPageRepo
                .forTenant(entity.tenant)
                .findByIdIncludingDeleted(pageId),
              AppError.ParsingPayloadError(
                s"Documentation page (${pageId.value}) not found"
              )
            )
          )
          .toList
          .sequence
      _ <- entity.parent match {
        case Some(api) =>
          EitherT.fromOptionF[Future, AppError, Api](
            env.dataStore.apiRepo
              .forTenant(entity.tenant)
              .findByIdIncludingDeleted(api),
            AppError.ParsingPayloadError("Parent API not found")
          )
        case None => EitherT.pure[Future, AppError](())
      }
      _ <- entity.apis match {
        case Some(apis) =>
          apis
            .map(api =>
              EitherT.fromOptionF[Future, AppError, Api](
                env.dataStore.apiRepo
                  .forTenant(entity.tenant)
                  .findByIdIncludingDeleted(api),
                AppError.ParsingPayloadError(
                  s"Children API (${api.value}) not found"
                )
              )
            )
            .toList
            .sequence
        case None => EitherT.pure[Future, AppError](Seq.empty[Api])
      }
    } yield entity
  }

  override def getId(entity: Api): ApiId = entity.id

  override def doCreate(
      tenant: Tenant,
      entity: Api
  ): EitherT[Future, AppError, Api] =
    entity.parent match {
      case Some(_) => super.doCreate(tenant, entity)
      case None =>
        for {
          team <- EitherT.fromOptionF[Future, AppError, Team](
            env.dataStore.teamRepo
              .forTenant(tenant)
              .findByIdIncludingDeleted(entity.team),
            AppError.TeamNotFound
          )
          created <- apiCrudService.createApi(tenant, team, entity)
        } yield created
    }

  override def doUpdate(
      tenant: Tenant,
      oldEntity: Api,
      newEntity: Api
  ): EitherT[Future, AppError, Api] =
    apiCrudService.updateApi(tenant, User.system, oldEntity, newEntity)

  override def doDelete(
      tenant: Tenant,
      entity: Api,
      logically: Boolean
  ): EitherT[Future, AppError, Unit] =
    apiCrudService.deleteApi(tenant, entity)
}

class ApiSubscriptionAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents,
    apiService: ApiService,
    deletionService: DeletionService,
    otoroshiSynchronisator: OtoroshiSynchronizerJob
) extends AdminApiController[ApiSubscription, ApiSubscriptionId](
      daa,
      env,
      cc
    ) {
  override def entityClass = classOf[ApiSubscription]
  override def entityName: String = "api-subscription"

  override def readMetadata(e: ApiSubscription): Map[String, String] =
    e.metadata.flatMap(_.asOpt[Map[String, String]]).getOrElse(Map.empty)

  override def pathRoot: String = s"/admin-api/subscriptions"
  override def entityStore(
      tenant: Tenant,
      ds: DataStore
  ): Repo[ApiSubscription, ApiSubscriptionId] =
    ds.apiSubscriptionRepo.forTenant(tenant)
  override def toJson(entity: ApiSubscription): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, ApiSubscription] =
    ApiSubscriptionFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))

  override def validate(
      entity: ApiSubscription,
      updateOrCreate: UpdateOrCreate
  ): EitherT[Future, AppError, ApiSubscription] = {
    import cats.implicits.*
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findByIdIncludingDeleted(entity.tenant),
        AppError.ParsingPayloadError("Tenant not found")
      )
      _ <- EitherT.fromOptionF[Future, AppError, UsagePlan](
        env.dataStore.usagePlanRepo
          .forTenant(entity.tenant)
          .findByIdIncludingDeleted(entity.plan),
        AppError.ParsingPayloadError("Plan not found")
      )
      _ <- EitherT.fromOptionF[Future, AppError, Team](
        env.dataStore.teamRepo
          .forTenant(entity.tenant)
          .findByIdIncludingDeleted(entity.team),
        AppError.ParsingPayloadError("Team not found")
      )
      _ <- EitherT.fromOptionF[Future, AppError, User](
        env.dataStore.userRepo.findByIdIncludingDeleted(entity.by),
        AppError.ParsingPayloadError("By not found")
      )
      _ <- EitherT
        .fromOptionF[Future, AppError, Keyring](
          env.dataStore.keyringRepo
            .forTenant(entity.tenant)
            .findByIdIncludingDeleted(entity.keyring),
          AppError.ParsingPayloadError(s"Keyring not found")
        )

    } yield entity
  }

  override def getId(entity: ApiSubscription): ApiSubscriptionId = entity.id

  override def doCreate(
      tenant: Tenant,
      entity: ApiSubscription
  ): EitherT[Future, AppError, ApiSubscription] =
    for {
      created <- super.doCreate(tenant, entity)
      _ <- EitherT.liftF[Future, AppError, Unit](
        otoroshiSynchronisator.run(created.id, tenant)
      )
    } yield created

  override def doUpdate(
      tenant: Tenant,
      oldEntity: ApiSubscription,
      newEntity: ApiSubscription
  ): EitherT[Future, AppError, ApiSubscription] = {
    val structuralChange =
      oldEntity.api != newEntity.api ||
        oldEntity.plan != newEntity.plan ||
        oldEntity.team != newEntity.team ||
        oldEntity.keyring != newEntity.keyring ||
        oldEntity.by != newEntity.by
    val oldOwnerBlock =
      oldEntity.blockedBy.contains(SubscriptionBlockReason.Owner)
    val newOwnerBlock =
      newEntity.blockedBy.contains(SubscriptionBlockReason.Owner)

    for {
      _ <- EitherT.cond[Future][AppError, Unit](
        !structuralChange,
        (),
        AppError.EntityConflict("subscription structural field")
      )
      plan <- EitherT.fromOptionF[Future, AppError, UsagePlan](
        env.dataStore.usagePlanRepo
          .forTenant(tenant)
          .findByIdIncludingDeleted(oldEntity.plan),
        AppError.PlanNotFound
      )
      base = oldEntity.copy(
        customName = newEntity.customName,
        metadata = newEntity.metadata,
        tags = newEntity.tags
      )
      customized <- apiService.updateSubscriptionCustomization(
        tenant,
        base,
        newEntity
      )
      _ <-
        if (newEntity.enabled != oldEntity.enabled)
          EitherT(
            apiService.archiveApiKey(
              tenant,
              customized,
              plan,
              enabled = newEntity.enabled
            )
          )
        else EitherT.pure[Future, AppError](Json.obj())
      _ <-
        if (newOwnerBlock != oldOwnerBlock)
          EitherT(
            apiService.archiveApiKey(
              tenant,
              customized.copy(enabled = newEntity.enabled),
              plan,
              enabled = !newOwnerBlock,
              byOwner = true
            )
          )
        else EitherT.pure[Future, AppError](Json.obj())
    } yield customized.copy(
      enabled = newEntity.enabled,
      blockedBy =
        if (newOwnerBlock)
          oldEntity.blockedBy + SubscriptionBlockReason.Owner
        else oldEntity.blockedBy - SubscriptionBlockReason.Owner
    )
  }

  override def doDelete(
      tenant: Tenant,
      entity: ApiSubscription,
      logically: Boolean
  ): EitherT[Future, AppError, Unit] =
    for {
      api <- EitherT.fromOptionF[Future, AppError, Api](
        env.dataStore.apiRepo
          .forTenant(tenant)
          .findByIdIncludingDeleted(entity.api),
        AppError.ApiNotFound
      )
      _ <- deletionService.deleteSubscriptions(Seq(entity), api, tenant)
    } yield ()
}

class ApiDocumentationPageAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents
) extends AdminApiController[ApiDocumentationPage, ApiDocumentationPageId](
      daa,
      env,
      cc
    ) {
  override def entityClass = classOf[ApiDocumentationPage]
  override def entityName: String = "api-documentation-page"
  override def pathRoot: String = s"/admin-api/pages"
  override def entityStore(
      tenant: Tenant,
      ds: DataStore
  ): Repo[ApiDocumentationPage, ApiDocumentationPageId] =
    ds.apiDocumentationPageRepo.forTenant(tenant)
  override def toJson(entity: ApiDocumentationPage): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, ApiDocumentationPage] =
    ApiDocumentationPageFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))

  override def validate(
      entity: ApiDocumentationPage,
      updateOrCreate: UpdateOrCreate
  ): EitherT[Future, AppError, ApiDocumentationPage] =
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findByIdIncludingDeleted(entity.tenant),
        AppError.ParsingPayloadError("Tenant not found")
      )
      _ <- EitherT.cond[Future][AppError, Unit](
        entity.title.trim.nonEmpty,
        (),
        AppError.ParsingPayloadError("Documentation page title is empty")
      )
      _ <- EitherT.cond[Future][AppError, Unit](
        entity.remoteContentEnabled || entity.content.trim.nonEmpty,
        (),
        AppError.ParsingPayloadError("Documentation page content is empty")
      )
      _ <- EitherT.cond[Future][AppError, Unit](
        entity.contentType.trim.nonEmpty,
        (),
        AppError.ParsingPayloadError("Documentation page contentType is empty")
      )
    } yield entity

  override def getId(entity: ApiDocumentationPage): ApiDocumentationPageId =
    entity.id
}

class NotificationAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents
) extends AdminApiController[Notification, NotificationId](daa, env, cc) {
  override def entityClass = classOf[Notification]
  override def entityName: String = "notification"
  override def pathRoot: String = s"/admin-api/${entityName}s"
  override def entityStore(
      tenant: Tenant,
      ds: DataStore
  ): Repo[Notification, NotificationId] =
    ds.notificationRepo.forTenant(tenant)
  override def toJson(entity: Notification): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, Notification] =
    NotificationFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))

  override def validate(
      entity: Notification,
      updateOrCreate: UpdateOrCreate
  ): EitherT[Future, AppError, Notification] =
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findByIdIncludingDeleted(entity.tenant),
        AppError.ParsingPayloadError("tenant not found")
      )
    } yield entity

  override def getId(entity: Notification): NotificationId = entity.id
}

class UserSessionAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents
) extends AdminApiController[UserSession, DatastoreId](daa, env, cc) {
  override def entityClass = classOf[UserSession]
  override def entityName: String = "user-session"
  override def pathRoot: String = s"/admin-api/sessions"
  override def entityStore(
      tenant: Tenant,
      ds: DataStore
  ): Repo[UserSession, DatastoreId] =
    ds.userSessionRepo
  override def toJson(entity: UserSession): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, UserSession] =
    UserSessionFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))

  override def validate(
      entity: UserSession,
      updateOrCreate: UpdateOrCreate
  ): EitherT[Future, AppError, UserSession] =
    for {
      _ <- EitherT.fromOptionF[Future, AppError, User](
        env.dataStore.userRepo.findByIdIncludingDeleted(entity.userId),
        AppError.ParsingPayloadError("User not found")
      )
    } yield entity

  override def getId(entity: UserSession): DatastoreId = entity.id
}

class ApiKeyConsumptionAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents
) extends AdminApiController[ApiKeyConsumption, DatastoreId](daa, env, cc) {
  override def entityClass = classOf[ApiKeyConsumption]
  override def entityName: String = "api-key-consumption"
  override def pathRoot: String = s"/admin-api/consumptions"
  override def entityStore(
      tenant: Tenant,
      ds: DataStore
  ): Repo[ApiKeyConsumption, DatastoreId] =
    ds.consumptionRepo.forTenant(tenant)
  override def toJson(entity: ApiKeyConsumption): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, ApiKeyConsumption] =
    ConsumptionFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))

  override def validate(
      entity: ApiKeyConsumption,
      updateOrCreate: UpdateOrCreate
  ): EitherT[Future, AppError, ApiKeyConsumption] = {
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findByIdIncludingDeleted(entity.tenant),
        AppError.ParsingPayloadError("Tenant not found")
      )
      _ <- EitherT.fromOptionF[Future, AppError, UsagePlan](
        env.dataStore.usagePlanRepo
          .forTenant(entity.tenant)
          .findByIdIncludingDeleted(entity.plan),
        AppError.ParsingPayloadError("Plan not found")
      )
      _ <- EitherT.fromOptionF[Future, AppError, Api](
        env.dataStore.apiRepo
          .forTenant(entity.tenant)
          .findByIdIncludingDeleted(entity.api),
        AppError.ParsingPayloadError("Api not found")
      )
      _ <- EitherT.cond[Future][AppError, Unit](
        entity.from.isBefore(entity.to),
        (),
        AppError.ParsingPayloadError("From date must be before to date")
      )
    } yield entity
  }

  override def getId(entity: ApiKeyConsumption): DatastoreId = entity.id
}

class AuditEventAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents
) extends AdminApiController[JsObject, DatastoreId](daa, env, cc) {
  override def entityClass = classOf[JsObject]
  override def entityName: String = "audit-event"
  override def pathRoot: String = s"/admin-api/${entityName}s"
  override def entityStore(
      tenant: Tenant,
      ds: DataStore
  ): Repo[JsObject, DatastoreId] =
    ds.auditTrailRepo.forTenant(tenant)
  override def toJson(entity: JsObject): JsValue = entity
  override def fromJson(entity: JsValue): Either[String, JsObject] =
    entity.asOpt[JsObject] match {
      case Some(v) => Right(v)
      case None    => Left("Not an object")
    }

  override def validate(
      entity: JsObject,
      updateOrCreate: UpdateOrCreate
  ): EitherT[Future, AppError, JsObject] =
    EitherT.pure[Future, AppError](entity)

  override def getId(entity: JsObject): DatastoreId =
    DatastoreId((entity \ "_id").as[String])
}

class CredentialsAdminApiController(
    DaikokuApiAction: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents
) extends AbstractController(cc) {
  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  def getCredentials(token: String) =
    DaikokuApiAction.async { ctx =>
      env.dataStore.keyringRepo
        .findByIntegrationTokenForAllTenants(token)
        .map {
          case None => NotFound(Json.obj("error" -> "Keyring not found"))
          case Some(keyring) => Ok(keyring.apiKey.asJson)
        }
    }
}

class MessagesAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents
) extends AdminApiController[Message, DatastoreId](daa, env, cc) {
  override def entityClass = classOf[Message]
  override def entityName: String = "message"
  override def pathRoot: String = s"/admin-api/messages"
  override def entityStore(
      tenant: Tenant,
      ds: DataStore
  ): Repo[Message, DatastoreId] =
    ds.messageRepo.forTenant(tenant)
  override def toJson(entity: Message): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, Message] =
    entity.asOpt[JsObject] match {
      case Some(v) => Right(entity.as(using json.MessageFormat))
      case None    => Left("Not an object")
    }

  override def validate(
      entity: Message,
      updateOrCreate: UpdateOrCreate
  ): EitherT[Future, AppError, Message] =
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findByIdIncludingDeleted(entity.tenant),
        AppError.ParsingPayloadError("Tenant not found")
      )
      _ <- EitherT.fromOptionF[Future, AppError, User](
        env.dataStore.userRepo.findByIdIncludingDeleted(entity.sender),
        AppError.ParsingPayloadError(
          s"Sender (${entity.sender.value}) not found"
        )
      )
      _ <-
        entity.participants
          .map(u =>
            EitherT.fromOptionF[Future, AppError, User](
              env.dataStore.userRepo.findByIdIncludingDeleted(u),
              AppError.ParsingPayloadError(
                s"Participant (${u.value}) not found"
              )
            )
          )
          .toList
          .sequence
      _ <- EitherT.cond[Future][AppError, Unit](
        entity.participants.contains(entity.sender),
        (),
        AppError.ParsingPayloadError("Sender must included in participants")
      )
    } yield entity

  override def getId(entity: Message): DatastoreId = entity.id
}

class IssuesAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents
) extends AdminApiController[ApiIssue, ApiIssueId](daa, env, cc) {
  override def entityClass = classOf[ApiIssue]
  override def entityName: String = "issue"
  override def pathRoot: String = s"/admin-api/${entityName}s"
  override def entityStore(
      tenant: Tenant,
      ds: DataStore
  ): Repo[ApiIssue, ApiIssueId] =
    ds.apiIssueRepo.forTenant(tenant)
  override def toJson(entity: ApiIssue): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, ApiIssue] =
    ApiIssueFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))

  override def validate(
      entity: ApiIssue,
      updateOrCreate: UpdateOrCreate
  ): EitherT[Future, AppError, ApiIssue] =
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findByIdIncludingDeleted(entity.tenant),
        AppError.ParsingPayloadError("Tenant not found")
      )
      _ <- EitherT.fromOptionF[Future, AppError, User](
        env.dataStore.userRepo.findByIdIncludingDeleted(entity.by),
        AppError.ParsingPayloadError("By not found")
      )
    } yield entity

  override def getId(entity: ApiIssue): ApiIssueId = entity.id
}

class PostsAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents
) extends AdminApiController[ApiPost, ApiPostId](daa, env, cc) {
  override def entityClass = classOf[ApiPost]
  override def entityName: String = "post"
  override def pathRoot: String = s"/admin-api/${entityName}s"
  override def entityStore(
      tenant: Tenant,
      ds: DataStore
  ): Repo[ApiPost, ApiPostId] =
    ds.apiPostRepo.forTenant(tenant)
  override def toJson(entity: ApiPost): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, ApiPost] =
    ApiPostFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))

  override def validate(
      entity: ApiPost,
      updateOrCreate: UpdateOrCreate
  ): EitherT[Future, AppError, ApiPost] =
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findByIdIncludingDeleted(entity.tenant),
        AppError.ParsingPayloadError("Tenant not found")
      )
    } yield entity

  override def getId(entity: ApiPost): ApiPostId = entity.id
}

class CmsPagesAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents
) extends AdminApiController[CmsPage, CmsPageId](daa, env, cc) {
  override def entityClass = classOf[CmsPage]
  override def entityName: String = "cms-page"

  override def readMetadata(e: CmsPage): Map[String, String] = e.metadata

  override def pathRoot: String = s"/admin-api/${entityName}s"
  override def entityStore(
      tenant: Tenant,
      ds: DataStore
  ): Repo[CmsPage, CmsPageId] =
    ds.cmsRepo.forTenant(tenant)
  override def toJson(entity: CmsPage): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, CmsPage] =
    CmsPageFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))

  override def validate(
      entity: CmsPage,
      updateOrCreate: UpdateOrCreate
  ): EitherT[Future, AppError, CmsPage] =
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findByIdIncludingDeleted(entity.tenant),
        AppError.ParsingPayloadError("Tenant not found")
      )
    } yield entity

  override def getId(entity: CmsPage): CmsPageId = entity.id

  def sync() =
    daa.async(parse.json) { ctx =>
      val body = ctx.request.body

      (for {
        _ <- env.dataStore.cmsRepo.forTenant(ctx.tenant).deleteAll()
      } yield {
        Future
          .sequence(
            body
              .as(using Reads.seq(using CmsFileFormat))
              .map(page => {
                env.dataStore.cmsRepo
                  .forTenant(ctx.tenant)
                  .save(page.toCmsPage(ctx.tenant.id))
              })
          )
          .map(_ => NoContent)
          .recover { case e: Throwable =>
            BadRequest(Json.obj("error" -> e.getMessage))
          }
      }).flatten
    }
}

class TranslationsAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents
) extends AdminApiController[Translation, DatastoreId](daa, env, cc) {
  override def entityClass = classOf[Translation]
  override def entityName: String = "translation"
  override def pathRoot: String = s"/admin-api/${entityName}s"
  override def entityStore(
      tenant: Tenant,
      ds: DataStore
  ): Repo[Translation, DatastoreId] =
    ds.translationRepo.forTenant(tenant)
  override def toJson(entity: Translation): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, Translation] =
    TranslationFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))

  override def validate(
      entity: Translation,
      updateOrCreate: UpdateOrCreate
  ): EitherT[Future, AppError, Translation] =
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findByIdIncludingDeleted(entity.tenant),
        AppError.ParsingPayloadError("Tenant not found")
      )
    } yield entity

  override def getId(entity: Translation): DatastoreId = entity.id
}

class UsagePlansAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents,
    deletionService: DeletionService,
    usagePlanService: UsagePlanService
) extends AdminApiController[UsagePlan, UsagePlanId](daa, env, cc) {
  override def entityClass = classOf[UsagePlan]
  override def entityName: String = "usage-plan"

  override def readMetadata(e: UsagePlan): Map[String, String] = e.metadata

  override def pathRoot: String = s"/admin-api/${entityName}s"
  override def entityStore(
      tenant: Tenant,
      ds: DataStore
  ): Repo[UsagePlan, UsagePlanId] =
    ds.usagePlanRepo.forTenant(tenant)
  override def toJson(entity: UsagePlan): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, UsagePlan] =
    UsagePlanFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))

  override def validate(
      entity: UsagePlan,
      updateOrCreate: UpdateOrCreate
  ): EitherT[Future, AppError, UsagePlan] =
    for {
      tenant <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findByIdIncludingDeleted(entity.tenant),
        AppError.ParsingPayloadError("Tenant not found")
      )
      _ <- entity.otoroshiTarget match {
        case Some(target) =>
          EitherT.cond[Future][AppError, Unit](
            tenant.otoroshiSettings.map(_.id).contains(target.otoroshiSettings),
            (),
            AppError.ParsingPayloadError(s"Otoroshi setting not found")
          )
        case None => EitherT.pure[Future, AppError](())
      }
      _ <- entity.paymentSettings match {
        case Some(target) =>
          EitherT.cond[Future][AppError, Unit](
            tenant.thirdPartyPaymentSettings
              .map(_.id)
              .contains(target.thirdPartyPaymentSettingsId),
            (),
            AppError.ParsingPayloadError(s"Payment setting not found")
          )
        case None => EitherT.pure[Future, AppError](())
      }
    } yield entity

  override def getId(entity: UsagePlan): UsagePlanId = entity.id

  private def findOwningApi(
      tenant: Tenant,
      planId: UsagePlanId
  ): Future[Option[Api]] =
    env.dataStore.apiRepo.findByPlan(tenant.id, planId)

  override def createEntity(): Action[JsValue] =
    daa.async(parse.json) { ctx =>
      fromJson(ctx.request.body) match {
        case Left(e) =>
          logger.error(s"Bad $entityName format", new RuntimeException(e))
          Errors.craftResponseResultF(
            s"Bad $entityName format",
            Results.BadRequest
          )
        case Right(newEntity) =>
          entityStore(ctx.tenant, env.dataStore)
            .findById(newEntity.id.value)
            .flatMap {
              case Some(_) =>
                AppError
                  .EntityConflict("entity with same id already exists")
                  .renderF()
              case None =>
                (for {
                  validated <- validate(newEntity, UpdateOrCreate.Create)
                  created <- ctx.request.getQueryString("apiId") match {
                    case None => super.doCreate(ctx.tenant, validated)
                    case Some(apiId) =>
                      for {
                        api <- EitherT.fromOptionF[Future, AppError, Api](
                          env.dataStore.apiRepo
                            .forTenant(ctx.tenant)
                            .findById(apiId),
                          AppError.ApiNotFound
                        )
                        team <- EitherT.fromOptionF[Future, AppError, Team](
                          env.dataStore.teamRepo
                            .forTenant(ctx.tenant)
                            .findByIdIncludingDeleted(api.team),
                          AppError.TeamNotFound
                        )
                        result <- usagePlanService.createPlan(
                          ctx.tenant,
                          team,
                          api,
                          validated
                        )
                      } yield result._2
                  }
                } yield {
                  auditAdminApiWrite(ctx, "create", created.id.value)
                  Created(toJson(created))
                })
                  .leftMap(_.render())
                  .merge
            }
      }
    }

  override def doUpdate(
      tenant: Tenant,
      oldEntity: UsagePlan,
      newEntity: UsagePlan
  ): EitherT[Future, AppError, UsagePlan] =
    EitherT
      .liftF[Future, AppError, Option[Api]](
        findOwningApi(tenant, oldEntity.id)
      )
      .flatMap {
        case None => super.doUpdate(tenant, oldEntity, newEntity)
        case Some(api) =>
          implicit val language: String =
            tenant.defaultLanguage.getOrElse("en")
          for {
            team <- EitherT.fromOptionF[Future, AppError, Team](
              env.dataStore.teamRepo
                .forTenant(tenant)
                .findByIdIncludingDeleted(api.team),
              AppError.TeamNotFound
            )
            updated <- usagePlanService.updatePlan(
              tenant,
              User.system,
              team,
              api,
              oldEntity,
              newEntity
            )
          } yield updated
      }

  override def doDelete(
      tenant: Tenant,
      entity: UsagePlan,
      logically: Boolean
  ): EitherT[Future, AppError, Unit] =
    for {
      api <- EitherT.fromOptionF[Future, AppError, Api](
        findOwningApi(tenant, entity.id),
        AppError.ApiNotFound
      )
      _ <- usagePlanService.deletePlan(tenant, api, entity)
    } yield ()
}

class SubscriptionDemandsAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents,
    deletionService: DeletionService
) extends AdminApiController[SubscriptionDemand, DemandId](
      daa,
      env,
      cc
    ) {
  override def entityClass = classOf[SubscriptionDemand]
  override def entityName: String = "subscription-demand"
  override def pathRoot: String = s"/admin-api/${entityName}s"
  override def entityStore(
      tenant: Tenant,
      ds: DataStore
  ): Repo[SubscriptionDemand, DemandId] =
    ds.subscriptionDemandRepo.forTenant(tenant)
  override def toJson(entity: SubscriptionDemand): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, SubscriptionDemand] =
    SubscriptionDemandFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))

  override def validate(
      entity: SubscriptionDemand,
      updateOrCreate: UpdateOrCreate
  ): EitherT[Future, AppError, SubscriptionDemand] =
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findByIdIncludingDeleted(entity.tenant),
        AppError.ParsingPayloadError("Tenant not found")
      )
      _ <- EitherT.fromOptionF[Future, AppError, Api](
        env.dataStore.apiRepo
          .forTenant(entity.tenant)
          .findByIdIncludingDeleted(entity.api),
        AppError.ParsingPayloadError("Api not found")
      )
      _ <- EitherT.fromOptionF[Future, AppError, UsagePlan](
        env.dataStore.usagePlanRepo
          .forTenant(entity.tenant)
          .findByIdIncludingDeleted(entity.plan),
        AppError.ParsingPayloadError("Plan not found")
      )
      _ <- EitherT.fromOptionF[Future, AppError, Team](
        env.dataStore.teamRepo
          .forTenant(entity.tenant)
          .findByIdIncludingDeleted(entity.team),
        AppError.ParsingPayloadError("Team not found")
      )
      _ <- EitherT.fromOptionF[Future, AppError, User](
        env.dataStore.userRepo.findByIdIncludingDeleted(entity.from),
        AppError.ParsingPayloadError("From not found")
      )
    } yield entity

  override def getId(entity: SubscriptionDemand): DemandId =
    entity.id

  override def doDelete(
      tenant: Tenant,
      entity: SubscriptionDemand,
      logically: Boolean
  ): EitherT[Future, AppError, Unit] =
    deletionService
      .cancelSubscriptionDemand(entity.id.value, tenant)
      .map(_ => ())
}

class AdminApiSwaggerController(
    cc: ControllerComponents
) extends AbstractController(cc) {

  def swagger() =
    Action {
      Using(
        scala.io.Source.fromResource("public/swaggers/admin-api-openapi.json")
      ) { source =>
        source.mkString
      } match {
        case Failure(e) =>
          AppLogger.error(e.getMessage, e)
          BadRequest(Json.obj("error" -> e.getMessage))
        case Success(value) =>
          Ok(Json.parse(value)).withHeaders(
            "Access-Control-Allow-Origin" -> "*"
          )
      }
    }
}
