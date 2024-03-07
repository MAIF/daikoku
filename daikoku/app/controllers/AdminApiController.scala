package fr.maif.otoroshi.daikoku.ctrls

import cats.data.EitherT
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.Materializer
import org.apache.pekko.util.ByteString
import cats.implicits._
import controllers.AppError
import fr.maif.otoroshi.daikoku.actions.{DaikokuAction, DaikokuActionContext}
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async.DaikokuAdminOnly
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.utils.OtoroshiClient
import fr.maif.otoroshi.daikoku.utils.admin._
import io.vertx.pgclient.PgPool
import org.apache.pekko.Done
import org.apache.pekko.stream.scaladsl.Source
import play.api.http.HttpEntity
import play.api.libs.json.{JsArray, JsNull, JsObject, JsValue, Json}
import play.api.libs.streams.Accumulator
import play.api.mvc._
import storage.drivers.postgres.PostgresDataStore
import storage.{DataStore, Repo}

import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success, Using}

class StateController(
    DaikokuAction: DaikokuAction,
    env: Env,
    otoroshiClient: OtoroshiClient,
    cc: ControllerComponents,
    pgPool: PgPool
) extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val mat: Materializer = env.defaultMaterializer
  implicit val ev: Env = env

  val bodyParser: BodyParser[Source[ByteString, _]] =
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
        ) //(ctx.request.getQueryString("pretty").exists(_ == "true"))
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

  def migrateStateToPostgres(): Action[AnyContent] =
    DaikokuAction.async { ctx =>
      DaikokuAdminOnly(
        AuditTrailEvent(s"@{user.name} has migrated state to postgres")
      )(ctx) {
        // 1 - Check if postgres instance is present
        // 2 - Switch all tenants in TenantMode.Maintenance
        // 3 - Delete all user sessions except current one
        // 4 - Create schema and tables
        // 5 - Migrate data

        env.dataStore match {
          case _: PostgresDataStore =>
            FastFuture.successful(
              Ok(
                Json.obj(
                  "done" -> true,
                  "message" -> "You're already on postgres"
                )
              )
            )
          case _ =>
            val postgresStore =
              new PostgresDataStore(env.rawConfiguration, env, pgPool)
            (for {
              _ <- postgresStore.checkIfTenantsTableExists()
              _ <- env.dataStore.tenantRepo.findAllNotDeleted().map { tenants =>
                tenants.map(tenant =>
                  env.dataStore.tenantRepo
                    .save(tenant.copy(tenantMode = TenantMode.Maintenance.some))
                )
              }
              _ <- removeAllUserSessions(ctx)
              _ <-
                env.dataStore.notificationRepo
                  .forAllTenant()
                  .delete(
                    Json.obj("status.status" -> Json.obj("$ne" -> "Pending"))
                  )
              _ <- postgresStore.checkDatabase()
              source = env.dataStore.exportAsStream(pretty = false)
              _ <- postgresStore.importFromStream(source)
            } yield {
              env.updateDataStore(postgresStore)
              Ok(
                Json.obj(
                  "done" -> true,
                  "message" -> "You're now running on postgres - Don't forget to switch your storage environment variable to postgres on the next reboot"
                )
              )
            }).recoverWith {
              case e: Throwable => {
                postgresStore.stop()
                FastFuture.successful(
                  BadRequest(Json.obj("error" -> e.getMessage))
                )
              }
            }
        }
      }
    }

  private def removeAllUserSessions(ctx: DaikokuActionContext[AnyContent]) = {
    env.dataStore.userSessionRepo
      .findNotDeleted(
        Json.obj("_id" -> Json.obj("$ne" -> ctx.session.sessionId.asJson))
      )
      .flatMap(seq =>
        env.dataStore.userSessionRepo
          .delete(
            Json.obj(
              "_id" -> Json.obj("$in" -> JsArray(seq.map(_.sessionId.asJson)))
            )
          )
      )
  }

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
              .findAllNotDeleted()
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
          .findAllNotDeleted()
          .map(
            _.map(tenant =>
              env.dataStore.tenantRepo.save(tenant.copy(tenantMode = None))
            )
          )
          .map(_ => Ok(ctx.tenant.copy(tenantMode = None).toUiPayload(env)))
      }
    }

  def isMaintenanceMode: Action[AnyContent] =
    DaikokuAction.async { ctx =>
      DaikokuAdminOnly(
        AuditTrailEvent(s"@{user.name} has accessed to maintenance mode")
      )(ctx) {
        env.dataStore.tenantRepo
          .findAllNotDeleted()
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

  val bodyParser: BodyParser[Source[ByteString, _]] =
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
      ) //(ctx.request.getQueryString("pretty").exists(_ == "true"))
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
    DaikokuApiAction.async { _ =>
      (for {
        _ <- EitherT.cond[Future][AppError, Unit](env.config.isDev, (), AppError.SecurityError("Action not avalaible"))
        _ <- EitherT.liftF[Future, AppError, Unit](env.dataStore.clear())
        _ <- EitherT.liftF[Future, AppError, Done](env.initDatastore())
      } yield Ok(Json.obj("done" -> true)))
        .leftMap(_.render())
        .merge
    }
}

class TenantAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents
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

  override def validate(entity: Tenant): EitherT[Future, AppError, Tenant] =
    EitherT(
      env.dataStore.tenantRepo
        .findOne(
          Json.obj(
            "_id" -> Json.obj("$ne" -> entity.id.asJson),
            "domain" -> entity.domain
          )
        )
        .map {
          case Some(_) =>
            Left(AppError.ParsingPayloadError("tenant.domain already used"))
          case None => Right(entity)
        }
    )

  override def getId(entity: Tenant): TenantId = entity.id
}

class UserAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents
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

  override def validate(entity: User): EitherT[Future, AppError, User] =
    EitherT(
      env.dataStore.userRepo
        .findOne(
          Json.obj(
            "_id" -> Json.obj("$ne" -> entity.id.asJson),
            "email" -> entity.email
          )
        )
        .map {
          case Some(_) =>
            Left(AppError.ParsingPayloadError("user.email already used"))
          case None => Right(entity)
        }
    )

  override def getId(entity: User): UserId = entity.id
}

class TeamAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents
) extends AdminApiController[Team, TeamId](daa, env, cc) {
  override def entityClass = classOf[Team]

  override def entityName: String = "team"

  override def pathRoot: String = s"/admin-api/${entityName}s"

  override def entityStore(tenant: Tenant, ds: DataStore): Repo[Team, TeamId] =
    ds.teamRepo.forTenant(tenant)

  override def toJson(entity: Team): JsValue = entity.asJson

  override def fromJson(entity: JsValue): Either[String, Team] =
    TeamFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))

  override def validate(entity: Team): EitherT[Future, AppError, Team] = {
    import cats.implicits._
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findById(entity.tenant),
        AppError.ParsingPayloadError("Tenant not found")
      )
      _ <-
        entity.users
          .map(u =>
            EitherT.fromOptionF[Future, AppError, User](
              env.dataStore.userRepo.findById(u.userId),
              AppError.ParsingPayloadError(s"User ${u.userId.value} not found")
            )
          )
          .toList
          .sequence
    } yield entity
  }

  override def getId(entity: Team): TeamId = entity.id
}

class ApiAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents
) extends AdminApiController[Api, ApiId](daa, env, cc) {
  override def entityClass = classOf[Api]
  override def entityName: String = "api"
  override def pathRoot: String = s"/admin-api/${entityName}s"
  override def entityStore(tenant: Tenant, ds: DataStore): Repo[Api, ApiId] =
    ds.apiRepo.forTenant(tenant)
  override def toJson(entity: Api): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, Api] =
    ApiFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))

  override def validate(entity: Api): EitherT[Future, AppError, Api] = {
    import cats.implicits._
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findById(entity.tenant),
        AppError.ParsingPayloadError("Tenant not found")
      )
      _ <-
        entity.possibleUsagePlans
          .map(planId =>
            EitherT.fromOptionF[Future, AppError, UsagePlan](
              env.dataStore.usagePlanRepo
                .forTenant(entity.tenant)
                .findById(planId),
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
        env.dataStore.teamRepo.forTenant(entity.tenant).findById(entity.team),
        AppError.ParsingPayloadError("Team not found")
      )
      _ <- EitherT(
        env.dataStore.apiRepo
          .forTenant(entity.tenant)
          .findOne(
            Json.obj(
              "_id" -> Json.obj("$ne" -> entity.id.asJson),
              "$or" -> Json.arr(
                Json.obj(
                  "_id" -> Json.obj(
                    "$ne" -> entity.parent
                      .map(_.asJson)
                      .getOrElse(JsNull)
                      .as[JsValue]
                  )
                ),
                Json.obj("parent" -> Json.obj("$ne" -> entity.id.asJson)),
                Json.obj(
                  "parent" -> Json.obj(
                    "$ne" -> entity.parent
                      .map(_.asJson)
                      .getOrElse(entity.id.asJson)
                      .as[JsValue]
                  )
                )
              ),
              "name" -> entity.name
            )
          )
          .map {
            case Some(_) =>
              Left(AppError.ParsingPayloadError("Api name already exists"))
            case None => Right(())
          }
      )
      _ <-
        entity.documentation.pages
          .map(_.id)
          .map(pageId =>
            EitherT.fromOptionF[Future, AppError, ApiDocumentationPage](
              env.dataStore.apiDocumentationPageRepo
                .forTenant(entity.tenant)
                .findById(pageId),
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
            env.dataStore.apiRepo.forTenant(entity.tenant).findById(api),
            AppError.ParsingPayloadError("Parent API not found")
          )
        case None => EitherT.pure[Future, AppError](())
      }
      _ <- entity.apis match {
        case Some(apis) =>
          apis
            .map(api =>
              EitherT.fromOptionF[Future, AppError, Api](
                env.dataStore.apiRepo.forTenant(entity.tenant).findById(api),
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
}

class ApiSubscriptionAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents
) extends AdminApiController[ApiSubscription, ApiSubscriptionId](
      daa,
      env,
      cc
    ) {
  override def entityClass = classOf[ApiSubscription]
  override def entityName: String = "api-subscription"
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
      entity: ApiSubscription
  ): EitherT[Future, AppError, ApiSubscription] = {
    import cats.implicits._
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findById(entity.tenant),
        AppError.ParsingPayloadError("Tenant not found")
      )
      _ <- EitherT.fromOptionF[Future, AppError, UsagePlan](
        env.dataStore.usagePlanRepo
          .forTenant(entity.tenant)
          .findById(entity.plan),
        AppError.ParsingPayloadError("Plan not found")
      )
      _ <- EitherT.fromOptionF[Future, AppError, Team](
        env.dataStore.teamRepo.forTenant(entity.tenant).findById(entity.team),
        AppError.ParsingPayloadError("Team not found")
      )
      _ <- EitherT.fromOptionF[Future, AppError, User](
        env.dataStore.userRepo.findById(entity.by),
        AppError.ParsingPayloadError("By not found")
      )
      _ <- entity.parent match {
        case Some(parent) =>
          EitherT
            .fromOptionF[Future, AppError, ApiSubscription](
              env.dataStore.apiSubscriptionRepo
                .forTenant(entity.tenant)
                .findById(parent),
              AppError.ParsingPayloadError(s"Parent subscription not found")
            )
            .map(_ => ())
        case None => EitherT.pure[Future, AppError](())
      }

    } yield entity
  }

  override def getId(entity: ApiSubscription): ApiSubscriptionId = entity.id
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
      entity: ApiDocumentationPage
  ): EitherT[Future, AppError, ApiDocumentationPage] =
    EitherT.pure[Future, AppError](entity)

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
      entity: Notification
  ): EitherT[Future, AppError, Notification] =
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findById(entity.tenant),
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
      entity: UserSession
  ): EitherT[Future, AppError, UserSession] =
    for {
      _ <- EitherT.fromOptionF[Future, AppError, User](
        env.dataStore.userRepo.findById(entity.userId),
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
      entity: ApiKeyConsumption
  ): EitherT[Future, AppError, ApiKeyConsumption] = {
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findById(entity.tenant),
        AppError.ParsingPayloadError("Tenant not found")
      )
      _ <- EitherT.fromOptionF[Future, AppError, UsagePlan](
        env.dataStore.usagePlanRepo
          .forTenant(entity.tenant)
          .findById(entity.plan),
        AppError.ParsingPayloadError("Plan not found")
      )
      _ <- EitherT.fromOptionF[Future, AppError, Api](
        env.dataStore.apiRepo.forTenant(entity.tenant).findById(entity.api),
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

  override def validate(entity: JsObject): EitherT[Future, AppError, JsObject] =
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
      env.dataStore.apiSubscriptionRepo
        .forAllTenant()
        .findOne(Json.obj("integrationToken" -> token))
        .map {
          case None      => NotFound(Json.obj("error" -> "Subscription not found"))
          case Some(sub) => Ok(sub.apiKey.asJson)
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
      case Some(v) => Right(entity.as(json.MessageFormat))
      case None    => Left("Not an object")
    }

  override def validate(entity: Message): EitherT[Future, AppError, Message] =
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findById(entity.tenant),
        AppError.ParsingPayloadError("Tenant not found")
      )
      _ <- EitherT.fromOptionF[Future, AppError, User](
        env.dataStore.userRepo.findById(entity.sender),
        AppError.ParsingPayloadError(
          s"Sender (${entity.sender.value}) not found"
        )
      )
      _ <-
        entity.participants
          .map(u =>
            EitherT.fromOptionF[Future, AppError, User](
              env.dataStore.userRepo.findById(u),
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

  override def validate(entity: ApiIssue): EitherT[Future, AppError, ApiIssue] =
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findById(entity.tenant),
        AppError.ParsingPayloadError("Tenant not found")
      )
      _ <- EitherT.fromOptionF[Future, AppError, User](
        env.dataStore.userRepo.findById(entity.by),
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

  override def validate(entity: ApiPost): EitherT[Future, AppError, ApiPost] =
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findById(entity.tenant),
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

  override def validate(entity: CmsPage): EitherT[Future, AppError, CmsPage] =
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findById(entity.tenant),
        AppError.ParsingPayloadError("Tenant not found")
      )
    } yield entity

  override def getId(entity: CmsPage): CmsPageId = entity.id
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
      entity: Translation
  ): EitherT[Future, AppError, Translation] =
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findById(entity.tenant),
        AppError.ParsingPayloadError("Tenant not found")
      )
    } yield entity

  override def getId(entity: Translation): DatastoreId = entity.id
}

class UsagePlansAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents
) extends AdminApiController[UsagePlan, UsagePlanId](daa, env, cc) {
  override def entityClass = classOf[UsagePlan]
  override def entityName: String = "usage-plan"
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
      entity: UsagePlan
  ): EitherT[Future, AppError, UsagePlan] =
    for {
      tenant <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findById(entity.tenant),
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
}

class SubscriptionDemandsAdminApiController(
    daa: DaikokuApiAction,
    env: Env,
    cc: ControllerComponents
) extends AdminApiController[SubscriptionDemand, SubscriptionDemandId](
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
  ): Repo[SubscriptionDemand, SubscriptionDemandId] =
    ds.subscriptionDemandRepo.forTenant(tenant)
  override def toJson(entity: SubscriptionDemand): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, SubscriptionDemand] =
    SubscriptionDemandFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))

  override def validate(
      entity: SubscriptionDemand
  ): EitherT[Future, AppError, SubscriptionDemand] =
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findById(entity.tenant),
        AppError.ParsingPayloadError("Tenant not found")
      )
      _ <- EitherT.fromOptionF[Future, AppError, Api](
        env.dataStore.apiRepo.forTenant(entity.tenant).findById(entity.api),
        AppError.ParsingPayloadError("Api not found")
      )
      _ <- EitherT.fromOptionF[Future, AppError, UsagePlan](
        env.dataStore.usagePlanRepo
          .forTenant(entity.tenant)
          .findById(entity.plan),
        AppError.ParsingPayloadError("Plan not found")
      )
      _ <- EitherT.fromOptionF[Future, AppError, Team](
        env.dataStore.teamRepo.forTenant(entity.tenant).findById(entity.team),
        AppError.ParsingPayloadError("Team not found")
      )
      _ <- EitherT.fromOptionF[Future, AppError, User](
        env.dataStore.userRepo.findById(entity.from),
        AppError.ParsingPayloadError("From not found")
      )
    } yield entity

  override def getId(entity: SubscriptionDemand): SubscriptionDemandId =
    entity.id
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
