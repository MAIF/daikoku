package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import akka.util.ByteString
import cats.implicits._
import fr.maif.otoroshi.daikoku.actions.{DaikokuAction, DaikokuActionContext}
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async.DaikokuAdminOnly
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.OtoroshiClient
import fr.maif.otoroshi.daikoku.utils.admin._
import play.api.http.HttpEntity
import play.api.libs.json.{JsArray, JsObject, JsValue, Json}
import play.api.libs.streams.Accumulator
import play.api.mvc._
import storage.drivers.postgres.PostgresDataStore
import storage.{DataStore, Repo}

class StateController(DaikokuAction: DaikokuAction,
                      env: Env,
                      otoroshiClient: OtoroshiClient,
                      cc: ControllerComponents)
    extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext
  implicit val mat = env.defaultMaterializer
  implicit val ev = env

  val bodyParser = BodyParser("Import parser") { _ =>
    Accumulator.source[ByteString].map(Right.apply)
  }

  def exportState() = DaikokuAction.async { ctx =>
    DaikokuAdminOnly(AuditTrailEvent(s"@{user.name} has exported state"))(ctx) {
      val source = env.dataStore.exportAsStream(false) //(ctx.request.getQueryString("pretty").exists(_ == "true"))
      val disposition = ("Content-Disposition" -> s"""attachment; filename="daikoku-export-${System.currentTimeMillis}.ndjson"""")
      val future =
        if (ctx.request.getQueryString("download").exists(_ == "true")) {
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

  def importState() = DaikokuAction.async(bodyParser) { ctx =>
    DaikokuAdminOnly(AuditTrailEvent(s"@{user.name} has imported state"))(ctx) {
      env.dataStore
        .importFromStream(ctx.request.body)
        .map(_ => Ok(Json.obj("done" -> true)))
    }
  }

  def migrateStateToPostgres(): Action[AnyContent] = DaikokuAction.async {
    ctx =>
      DaikokuAdminOnly(
        AuditTrailEvent(s"@{user.name} has migrated state to postgres"))(ctx) {
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
                )))
          case _ =>
            val postgresStore = new PostgresDataStore(env.rawConfiguration, env)
            (for {
              _ <- postgresStore.checkIfTenantsTableExists()
              _ <- env.dataStore.tenantRepo.findAllNotDeleted().map { tenants =>
                tenants.map(tenant =>
                  env.dataStore.tenantRepo.save(
                    tenant.copy(tenantMode = TenantMode.Maintenance.some)))
              }
              _ <- removeAllUserSessions(ctx)
              _ <- postgresStore.checkDatabase()
              source = env.dataStore.exportAsStream(pretty = false)
              _ <- postgresStore.importFromStream(source)
            } yield {
              env.updateDataStore(postgresStore)
              Ok(
                Json.obj(
                  "done" -> true,
                  "message" -> "You're now running on postgres - Don't forget to switch your storage environment variable to postgres on the next reboot"
                ))
            }).recoverWith {
                case e: Throwable => {
                  postgresStore.stop()
                  FastFuture.successful(
                    BadRequest(Json.obj("error" -> e.getMessage)))
                }
              }
        }
      }
  }

  private def removeAllUserSessions(ctx: DaikokuActionContext[AnyContent]) = {
    env.dataStore.userSessionRepo
      .findNotDeleted(
        Json.obj("_id" -> Json.obj("$ne" -> ctx.session.sessionId.asJson)))
      .flatMap(seq =>
        env.dataStore.userSessionRepo
          .delete(Json.obj(
            "_id" -> Json.obj("$in" -> JsArray(seq.map(_.sessionId.asJson))))))
  }

  def enableMaintenanceMode(): Action[AnyContent] = DaikokuAction.async { ctx =>
    DaikokuAdminOnly(
      AuditTrailEvent(
        s"@{user.name} has enabled maintenance mode on all tenants"))(ctx) {
      removeAllUserSessions(ctx)
        .flatMap { _ =>
          env.dataStore.tenantRepo
            .findAllNotDeleted()
            .map(_.map(tenant =>
              env.dataStore.tenantRepo.save(
                tenant.copy(tenantMode = TenantMode.Maintenance.some))))
        }
        .map(_ =>
          Ok(ctx.tenant
            .copy(tenantMode = TenantMode.Maintenance.some)
            .toUiPayload(env)))
    }
  }

  def disableMaintenanceMode(): Action[AnyContent] = DaikokuAction.async {
    ctx =>
      DaikokuAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has disabled maintenance mode on all tenants"))(ctx) {
        env.dataStore.tenantRepo
          .findAllNotDeleted()
          .map(_.map(tenant =>
            env.dataStore.tenantRepo.save(tenant.copy(tenantMode = None))))
          .map(_ => Ok(ctx.tenant.copy(tenantMode = None).toUiPayload(env)))
      }
  }

  def isMaintenanceMode: Action[AnyContent] = DaikokuAction.async { ctx =>
    DaikokuAdminOnly(
      AuditTrailEvent(s"@{user.name} has accessed to maintenance mode"))(ctx) {
      env.dataStore.tenantRepo
        .findAllNotDeleted()
        .map { tenants =>
          tenants.forall(tenant =>
            tenant.tenantMode.isDefined && tenant.tenantMode.get.equals(
              TenantMode.Maintenance))
        }
        .map(locked => Ok(Json.obj("isMaintenanceMode" -> locked)))
    }
  }
}

class StateAdminApiController(
    DaikokuApiAction: DaikokuApiAction,
    DaikokuApiActionWithoutTenant: DaikokuApiActionWithoutTenant,
    env: Env,
    cc: ControllerComponents)
    extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext
  implicit val mat = env.defaultMaterializer
  implicit val ev = env

  val bodyParser = BodyParser("Import parser") { _ =>
    Accumulator.source[ByteString].map(Right.apply)
  }

  def exportState() = DaikokuApiAction.async { ctx =>
    val source = env.dataStore.exportAsStream(false) //(ctx.request.getQueryString("pretty").exists(_ == "true"))
    val disposition = ("Content-Disposition" -> s"""attachment; filename="daikoku-export-${System.currentTimeMillis}.ndjson"""")
    val future =
      if (ctx.request.getQueryString("download").exists(_ == "true")) {
        Ok.sendEntity(HttpEntity.Streamed(source, None, Some("")))
          .withHeaders(disposition)
          .as("application/x-ndjson")
      } else {
        Ok.sendEntity(HttpEntity.Streamed(source, None, Some("")))
          .as("application/x-ndjson")
      }
    FastFuture.successful(future)
  }

  def importState() = DaikokuApiActionWithoutTenant.async(bodyParser) { req =>
    env.dataStore
      .importFromStream(req.body)
      .map(_ => Ok(Json.obj("done" -> true)))
  }
}

class TenantAdminApiController(daa: DaikokuApiAction,
                               env: Env,
                               cc: ControllerComponents)
    extends AdminApiController[Tenant, TenantId](daa, env, cc) {
  override def entityClass = classOf[Tenant]
  override def entityName: String = "tenant"
  override def pathRoot: String = s"/admin-api/${entityName}s"
  override def entityStore(tenant: Tenant,
                           ds: DataStore): Repo[Tenant, TenantId] =
    ds.tenantRepo
  override def toJson(entity: Tenant): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, Tenant] =
    TenantFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))
}

class UserAdminApiController(daa: DaikokuApiAction,
                             env: Env,
                             cc: ControllerComponents)
    extends AdminApiController[User, UserId](daa, env, cc) {
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
}

class TeamAdminApiController(daa: DaikokuApiAction,
                             env: Env,
                             cc: ControllerComponents)
    extends AdminApiController[Team, TeamId](daa, env, cc) {
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
}

class ApiAdminApiController(daa: DaikokuApiAction,
                            env: Env,
                            cc: ControllerComponents)
    extends AdminApiController[Api, ApiId](daa, env, cc) {
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
}

class ApiSubscriptionAdminApiController(daa: DaikokuApiAction,
                                        env: Env,
                                        cc: ControllerComponents)
    extends AdminApiController[ApiSubscription, ApiSubscriptionId](daa, env, cc) {
  override def entityClass = classOf[ApiSubscription]
  override def entityName: String = "api-subscription"
  override def pathRoot: String = s"/admin-api/subscriptions"
  override def entityStore(
      tenant: Tenant,
      ds: DataStore): Repo[ApiSubscription, ApiSubscriptionId] =
    ds.apiSubscriptionRepo.forTenant(tenant)
  override def toJson(entity: ApiSubscription): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, ApiSubscription] =
    ApiSubscriptionFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))
}

class ApiDocumentationPageAdminApiController(daa: DaikokuApiAction,
                                             env: Env,
                                             cc: ControllerComponents)
    extends AdminApiController[ApiDocumentationPage, ApiDocumentationPageId](
      daa,
      env,
      cc) {
  override def entityClass = classOf[ApiDocumentationPage]
  override def entityName: String = "api-documentation-page"
  override def pathRoot: String = s"/admin-api/pages"
  override def entityStore(
      tenant: Tenant,
      ds: DataStore): Repo[ApiDocumentationPage, ApiDocumentationPageId] =
    ds.apiDocumentationPageRepo.forTenant(tenant)
  override def toJson(entity: ApiDocumentationPage): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, ApiDocumentationPage] =
    ApiDocumentationPageFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))
}

class NotificationAdminApiController(daa: DaikokuApiAction,
                                     env: Env,
                                     cc: ControllerComponents)
    extends AdminApiController[Notification, NotificationId](daa, env, cc) {
  override def entityClass = classOf[Notification]
  override def entityName: String = "notification"
  override def pathRoot: String = s"/admin-api/${entityName}s"
  override def entityStore(tenant: Tenant,
                           ds: DataStore): Repo[Notification, NotificationId] =
    ds.notificationRepo.forTenant(tenant)
  override def toJson(entity: Notification): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, Notification] =
    NotificationFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))
}

class UserSessionAdminApiController(daa: DaikokuApiAction,
                                    env: Env,
                                    cc: ControllerComponents)
    extends AdminApiController[UserSession, DatastoreId](daa, env, cc) {
  override def entityClass = classOf[UserSession]
  override def entityName: String = "user-session"
  override def pathRoot: String = s"/admin-api/sessions"
  override def entityStore(tenant: Tenant,
                           ds: DataStore): Repo[UserSession, DatastoreId] =
    ds.userSessionRepo
  override def toJson(entity: UserSession): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, UserSession] =
    UserSessionFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))
}

class ApiKeyConsumptionAdminApiController(daa: DaikokuApiAction,
                                          env: Env,
                                          cc: ControllerComponents)
    extends AdminApiController[ApiKeyConsumption, DatastoreId](daa, env, cc) {
  override def entityClass = classOf[ApiKeyConsumption]
  override def entityName: String = "api-key-consumption"
  override def pathRoot: String = s"/admin-api/consumptions"
  override def entityStore(
      tenant: Tenant,
      ds: DataStore): Repo[ApiKeyConsumption, DatastoreId] =
    ds.consumptionRepo.forTenant(tenant)
  override def toJson(entity: ApiKeyConsumption): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, ApiKeyConsumption] =
    ConsumptionFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))
}

class AuditEventAdminApiController(daa: DaikokuApiAction,
                                   env: Env,
                                   cc: ControllerComponents)
    extends AdminApiController[JsObject, DatastoreId](daa, env, cc) {
  override def entityClass = classOf[JsObject]
  override def entityName: String = "audit-event"
  override def pathRoot: String = s"/admin-api/${entityName}s"
  override def entityStore(tenant: Tenant,
                           ds: DataStore): Repo[JsObject, DatastoreId] =
    ds.auditTrailRepo.forTenant(tenant)
  override def toJson(entity: JsObject): JsValue = entity
  override def fromJson(entity: JsValue): Either[String, JsObject] =
    entity.asOpt[JsObject] match {
      case Some(v) => Right(v)
      case None    => Left("Not an object")
    }
}

class CredentialsAdminApiController(DaikokuApiAction: DaikokuApiAction,
                                    env: Env,
                                    cc: ControllerComponents)
    extends AbstractController(cc) {
  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  def getCredentials(token: String) = DaikokuApiAction.async { ctx =>
    env.dataStore.apiSubscriptionRepo
      .forAllTenant()
      .findOne(Json.obj("integrationToken" -> token))
      .map {
        case None      => NotFound(Json.obj("error" -> "Subscription not found"))
        case Some(sub) => Ok(sub.apiKey.asJson)
      }
  }
}

class MessagesAdminApiController(daa: DaikokuApiAction,
                                 env: Env,
                                 cc: ControllerComponents)
    extends AdminApiController[Message, DatastoreId](daa, env, cc) {
  override def entityClass = classOf[Message]
  override def entityName: String = "message"
  override def pathRoot: String = s"/admin-api/${entityName}s"
  override def entityStore(tenant: Tenant,
                           ds: DataStore): Repo[Message, DatastoreId] =
    ds.messageRepo.forTenant(tenant)
  override def toJson(entity: Message): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, Message] =
    entity.asOpt[JsObject] match {
      case Some(v) => Right(entity.as(json.MessageFormat))
      case None    => Left("Not an object")
    }
}

class AdminApiSwaggerController(
    env: Env,
    cc: ControllerComponents,
    ctrl1: TenantAdminApiController,
    ctrl2: UserAdminApiController,
    ctrl3: TeamAdminApiController,
    ctrl4: ApiAdminApiController,
    ctrl5: ApiSubscriptionAdminApiController,
    ctrl6: ApiDocumentationPageAdminApiController,
    ctrl7: NotificationAdminApiController,
    ctrl8: UserSessionAdminApiController,
    ctrl9: ApiKeyConsumptionAdminApiController,
    ctrl10: AuditEventAdminApiController,
    ctrl11: MessagesAdminApiController
) extends AbstractController(cc) {

  def schema[A, B <: ValueType](
      controller: AdminApiController[A, B]): JsObject =
    controller.openApiComponent(env)
  def path[A, B <: ValueType](controller: AdminApiController[A, B]): JsObject =
    controller.openApiPath(env)

  def schemas: JsValue =
    schema(ctrl1) ++
      schema(ctrl2) ++
      schema(ctrl3) ++
      schema(ctrl4) ++
      schema(ctrl5) ++
      schema(ctrl6) ++
      schema(ctrl7) ++
      schema(ctrl8) ++
      schema(ctrl9) ++
      schema(ctrl10) ++
      schema(ctrl11)

  def paths: JsValue =
    path(ctrl1) ++
      path(ctrl2) ++
      path(ctrl3) ++
      path(ctrl4) ++
      path(ctrl5) ++
      path(ctrl6) ++
      path(ctrl7) ++
      path(ctrl8) ++
      path(ctrl9) ++
      path(ctrl10) ++
      path(ctrl11)

  def swagger() = Action {
    Ok(
      Json.obj(
        "openapi" -> "3.0.1",
        "externalDocs" -> Json.obj(
          "description" -> "Find out more about Daikoku",
          "url" -> "https://maif.github.io/Daikoku/"
        ),
        "info" -> Json.obj(
          "license" -> Json.obj(
            "name" -> "Apache 2.0",
            "url" -> "http://www.apache.org/licenses/LICENSE-2.0.html"
          ),
          "contact" -> Json.obj(
            "name" -> "Daikoku Team",
            "email" -> "oss@maif.fr"
          ),
          "description" -> "Admin API of Daikoku",
          "title" -> "Daikoku Admin API",
          "version" -> "1.0.0-dev"
        ),
        "tags" -> Json.arr(),
        "components" -> Json.obj(
          "schemas" -> schemas
        ),
        "paths" -> paths
      )).withHeaders(
      "Access-Control-Allow-Origin" -> "*"
    )
  }
}
