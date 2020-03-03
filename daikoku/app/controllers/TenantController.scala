package fr.maif.otoroshi.daikoku.ctrls

import java.util.concurrent.TimeUnit

import akka.http.scaladsl.util.FastFuture
import com.nimbusds.jose.jwk.KeyType
import fr.maif.otoroshi.daikoku.actions.DaikokuAction
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async._
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain.UsagePlan.FreeWithoutQuotas
import fr.maif.otoroshi.daikoku.domain.json.TenantFormat
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.login.OAuth2Config
import fr.maif.otoroshi.daikoku.utils.StringImplicits._
import fr.maif.otoroshi.daikoku.utils.jwt.JWKSAlgoSettings
import fr.maif.otoroshi.daikoku.utils.{ApiService, Errors, IdGenerator, OtoroshiClient}
import org.joda.time.DateTime
import play.api.libs.json._
import play.api.mvc.{AbstractController, ControllerComponents, Results}
import reactivemongo.bson.BSONObjectID

import scala.concurrent.Future
import scala.util.Try

class TenantController(DaikokuAction: DaikokuAction,
                       apiService: ApiService,
                       env: Env,
                       otoroshiClient: OtoroshiClient,
                       cc: ControllerComponents)
    extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  def namesOfTenants() = DaikokuAction.async(parse.json) { ctx =>
    val tenantIdsJs: JsArray = ctx.request.body.as[JsArray]
    val tenantIds: Seq[String] =
      ctx.request.body.as[JsArray].value.map(_.as[String])
    PublicUserAccess(AuditTrailEvent(
      s"@{user.name} has accessed tenant names for ${tenantIds.mkString(", ")}"))(
      ctx) {
      env.dataStore.tenantRepo
        .find(
          Json.obj(
            "_deleted" -> false,
            "_id" -> Json.obj(
              "$in" -> tenantIdsJs
            )
          )
        )
        .map { tenants =>
          Ok(JsArray(tenants.map(t => JsString(t.name))))
        }
    }
  }

  def allTenants() = DaikokuAction.async { ctx =>
    DaikokuAdminOnly(
      AuditTrailEvent(s"@{user.name} has accessed list of all tenants"))(ctx) {
      env.dataStore.tenantRepo.findAllNotDeleted().map { tenants =>
        Ok(JsArray(tenants.map(_.asJson)))
      }
    }
  }

  def tenantList() = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(
      "@{user.name} has accessed simplified tenant list"))(ctx) {
      env.dataStore.tenantRepo.findAllNotDeleted().map { tenants =>
        Ok(JsArray(tenants.map { tenant =>
          val status: String =
            if (ctx.user.tenants.contains(tenant.id)) "ALREADY_JOINED"
            else "CAN_JOIN"
          Json.obj(
            "_id" -> tenant.id.value,
            "name" -> tenant.name,
            "desc" -> tenant.style
              .map(_.description)
              .getOrElse("")
              .asInstanceOf[String],
            "title" -> tenant.style
              .map(_.title)
              .getOrElse(tenant.name)
              .asInstanceOf[String],
            "status" -> status,
            "style" -> tenant.style.map(_.asJson).getOrElse(JsNull).as[JsValue]
          )
        }))
      }
    }
  }

  def redirectToTenant(id: String) = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(
      s"@{user.name} has accessed tenant redirection to @{dest.name} - ${id}"))(
      ctx) {
      val newTeamId = TeamId(BSONObjectID.generate().stringify)
      env.dataStore.tenantRepo.findByIdNotDeleted(id).flatMap {
        case Some(tenant) => {
          ctx.setCtxValue("dest.name", tenant.name)
          val wasInTenant = ctx.user.tenants.contains(tenant.id)
          env.dataStore.teamRepo
            .myTeams(tenant, ctx.user)
            .flatMap { teams =>
              env.dataStore.userRepo.save(
                ctx.user.copy(
                  lastTenant = Some(tenant.id),
                  // lastTeams = ctx.user.lastTeams + (tenant.id -> teams.headOption.map(_.id).getOrElse(newTeamId)),
                  tenants = ctx.user.tenants + tenant.id
                )
              )
            }
            .flatMap { _ =>
              val fu: Future[Unit] = if (!wasInTenant) {
                env.dataStore.teamRepo
                  .forTenant(tenant)
                  .save(
                    Team(
                      id = newTeamId,
                      tenant = tenant.id,
                      `type` = TeamType.Personal,
                      name = s"${ctx.user.name}",
                      description = s"The personal team of ${ctx.user.name}",
                      users =
                        Set(UserWithPermission(ctx.user.id, Administrator)),
                      subscriptions = Seq.empty,
                      authorizedOtoroshiGroups = Set.empty
                    )
                  )
                  .map(_ => ())
              } else {
                FastFuture.successful(())
              }
              fu.map { _ =>
                env.config.exposedPort match {
                  case 80    => Redirect(s"http://${tenant.domain}/")
                  case 443   => Redirect(s"https://${tenant.domain}/")
                  case value => Redirect(s"http://${tenant.domain}:$value/")
                }
              }
            }
        }
        case None =>
          Errors.craftResponseResult("Tenant not found",
                                     Results.NotFound,
                                     ctx.request,
                                     env = env,
                                     tenant = ctx.tenant)
      }
    }
  }

  def oneTenant(tenantId: String) = DaikokuAction.async { ctx =>
    DaikokuAdminOnly(
      AuditTrailEvent(
        s"@{user.name} has accessed one tenant @{tenant.name} - @{tenant.id}"))(
      ctx) {
      env.dataStore.tenantRepo.findByIdOrHrId(tenantId).flatMap {
        case Some(tenant) =>
          ctx.setCtxValue("tenant.name", tenant.name)
          ctx.setCtxValue("tenant.id", tenant.id)

          env.dataStore.translationRepo
            .forTenant(ctx.tenant)
            .find(Json.obj("element.id" -> tenant.id.asJson))
            .map(translations => {
              val translationAsJsObject = translations
                .groupBy(t => t.language)
                .map {
                  case (k, v) =>
                    Json.obj(
                      k -> JsObject(v.map(t => t.key -> JsString(t.value))))
                }
                .fold(Json.obj())(_ deepMerge _)
              val translation = Json.obj("translation" -> translationAsJsObject)
              Ok(tenant.asJsonWithJwt.as[JsObject] ++ translation)
            })
        case None =>
          FastFuture.successful(
            NotFound(Json.obj("error" -> "Tenant not found")))
      }
    }
  }

  def createTenant() = DaikokuAction.async(parse.json) { ctx =>
    DaikokuAdminOnly(
      AuditTrailEvent(
        s"@{user.name} has created a tenant @{tenant.name} - @{tenant.id}"))(
      ctx) {
      TenantFormat.reads(ctx.request.body) match {
        case JsError(e) =>
          FastFuture.successful(
            BadRequest(Json.obj("error" -> "Error while parsing payload",
                                "msg" -> e.toString)))
        case JsSuccess(tenant, _) => {
          ctx.setCtxValue("tenant.name", tenant.name)
          ctx.setCtxValue("tenant.id", tenant.id)
          val adminTeam = Team(
            id = TeamId(IdGenerator.token),
            tenant = tenant.id,
            `type` = TeamType.Admin,
            name = s"${tenant.humanReadableId}-admin-team",
            description = s"The admin team for the default tenant",
            avatar = Some(
              s"https://www.gravatar.com/avatar/${tenant.humanReadableId.md5}?size=128&d=robohash"),
            users = Set.empty,
            subscriptions = Seq.empty,
            authorizedOtoroshiGroups = Set.empty
          )
          val adminApi = Api(
            id = ApiId(s"admin-api-tenant-${tenant.humanReadableId}"),
            tenant = tenant.id,
            team = adminTeam.id,
            name = s"admin-api-tenant-${tenant.humanReadableId}",
            lastUpdate = DateTime.now(),
            smallDescription = "admin api",
            description = "admin api",
            currentVersion = Version("1.0.0"),
            published = true,
            visibility = ApiVisibility.AdminOnly,
            documentation = ApiDocumentation(
              id = ApiDocumentationId(BSONObjectID.generate().stringify),
              tenant = tenant.id,
              pages = Seq.empty[ApiDocumentationPageId],
              lastModificationAt = DateTime.now()
            ),
            swagger = None,
            possibleUsagePlans = Seq(
              FreeWithoutQuotas(
                id = UsagePlanId("admin"),
                billingDuration = BillingDuration(1, BillingTimeUnit.Month),
                currency = Currency("EUR"),
                customName = Some("admin"),
                customDescription = None,
                otoroshiTarget = None,
                allowMultipleKeys = Some(true),
                autoRotation = None,
                subscriptionProcess = SubscriptionProcess.Automatic,
                integrationProcess = IntegrationProcess.ApiKey
              )
            ),
            defaultUsagePlan = UsagePlanId("admin"),
            authorizedTeams = Seq.empty
          )
          val tenantForCreation = tenant.copy(adminApi = adminApi.id)

          for {
            admins  <-  env.dataStore.userRepo.findNotDeleted(Json.obj("isDaikokuAdmin" -> true))
            _       <- env.dataStore.tenantRepo.save(tenantForCreation)
            _       <- env.dataStore.teamRepo.forTenant(tenantForCreation).save(adminTeam.copy(users = admins.map(u => UserWithPermission(u.id, TeamPermission.Administrator)).toSet))
            _       <- env.dataStore.apiRepo.forTenant(tenantForCreation).save(adminApi)
          } yield {
            Created(tenantForCreation.asJsonWithJwt)
          }
        }
      }
    }
  }

  def deleteTenant(id: String) = DaikokuAction.async { ctx =>
    DaikokuAdminOnly(AuditTrailEvent(
      "@{user.name} has logically deleted tenant @{tenant.name} - @{tenant.id}"))(
      ctx) {
      env.dataStore.tenantRepo.findByIdNotDeleted(id).flatMap {
        case Some(tenant) => {
          ctx.setCtxValue("tenant.name", tenant.name)
          ctx.setCtxValue("tenant.id", tenant.id)
          for {
            _ <- env.dataStore.apiRepo.forTenant(tenant).deleteAllLogically()
            _ <- env.dataStore.apiSubscriptionRepo
              .forTenant(tenant)
              .deleteAllLogically()
            _ <- env.dataStore.apiDocumentationPageRepo
              .forTenant(tenant)
              .deleteAllLogically()
            _ <- env.dataStore.notificationRepo
              .forTenant(tenant)
              .deleteAllLogically()
            _ <- env.dataStore.teamRepo.forTenant(tenant).deleteAllLogically()
            _ <- env.dataStore.tenantRepo.save(tenant.copy(deleted = true))
          } yield {
            Ok(tenant.copy(deleted = true).asJson)
          }
        }
        case None =>
          FastFuture.successful(
            NotFound(Json.obj("error" -> "Tenant not found")))
      }
    }
  }

  def saveTenant(tenantId: String) = DaikokuAction.async(parse.json) { ctx =>
    DaikokuAdminOnly(AuditTrailEvent(
      s"@{user.name} has updated tenant @{tenant.name} - @{tenant.id}"))(ctx) {
      env.dataStore.tenantRepo.findByIdNotDeleted(tenantId).flatMap {
        case Some(t) => {
          TenantFormat.reads(ctx.request.body) match {
            case JsError(e) =>
              FastFuture.successful(
                BadRequest(Json.obj("error" -> "Error while parsing payload",
                                    "msg" -> e.toString)))
            case JsSuccess(tenant, _) => {
              ctx.setCtxValue("tenant.name", tenant.name)
              ctx.setCtxValue("tenant.id", tenant.id)
              env.dataStore.tenantRepo.save(tenant).map { _ =>
                Ok(tenant.asJsonWithJwt)
              }
            }
          }
        }
        case None =>
          FastFuture.successful(
            NotFound(Json.obj("error" -> "Tenant not found")))
      }
    }
  }

  def currentTenant(teamId: String) = DaikokuAction.async { ctx =>
    TeamAdminOnly(
      AuditTrailEvent(s"@{user.name} has accessed the current tenant"))(teamId,
                                                                        ctx) {
      team =>
        FastFuture.successful(Ok(ctx.tenant.asJson))
    }
  }

  def fetchOpenIdConfiguration() = DaikokuAction.async(parse.json) { ctx =>
    val _url = (ctx.request.body \ "url").asOpt[String].getOrElse("--")
    DaikokuAdminOnly(AuditTrailEvent(
      s"@{user.name} has fetch OIDC config from ${_url}"))(ctx) {

      import scala.concurrent.duration._

      (ctx.request.body \ "url").asOpt[String] match {
        case None =>
          FastFuture.successful(
            Ok(
              OAuth2Config().asJson
            )
          )
        case Some(url) => {
          env.wsClient.url(url).withRequestTimeout(10.seconds).get().map {
            resp =>
              if (resp.status == 200) {
                Try {
                  val config = OAuth2Config()
                  val body = Json.parse(resp.body)
                  val issuer = (body \ "issuer")
                    .asOpt[String]
                    .getOrElse("http://localhost:8082/")
                  val tokenUrl = (body \ "token_endpoint")
                    .asOpt[String]
                    .getOrElse(config.tokenUrl)
                  val authorizeUrl = (body \ "authorization_endpoint")
                    .asOpt[String]
                    .getOrElse(config.authorizeUrl)
                  val userInfoUrl = (body \ "userinfo_endpoint")
                    .asOpt[String]
                    .getOrElse(config.userInfoUrl)
                  val loginUrl = (body \ "authorization_endpoint")
                    .asOpt[String]
                    .getOrElse(authorizeUrl)
                  val logoutUrl = (body \ "end_session_endpoint")
                    .asOpt[String]
                    .getOrElse(
                      (issuer + "/logout").replace("//logout", "/logout"))
                  val jwksUri = (body \ "jwks_uri").asOpt[String]
                  Ok(
                    config
                      .copy(
                        tokenUrl = tokenUrl,
                        authorizeUrl = authorizeUrl,
                        userInfoUrl = userInfoUrl,
                        loginUrl = loginUrl,
                        logoutUrl = logoutUrl,
                        accessTokenField = jwksUri
                          .map(_ => "id_token")
                          .getOrElse("access_token"),
                        useJson = true,
                        readProfileFromToken = jwksUri.isDefined,
                        jwtVerifier = jwksUri.map(
                          url =>
                            JWKSAlgoSettings(
                              url = url,
                              headers = Map.empty[String, String],
                              timeout =
                                FiniteDuration(2000, TimeUnit.MILLISECONDS),
                              ttl = FiniteDuration(60 * 60 * 1000,
                                                   TimeUnit.MILLISECONDS),
                              kty = KeyType.RSA
                          )
                        )
                      )
                      .asJson
                  )
                } getOrElse {
                  Ok(OAuth2Config().asJson)
                }
              } else {
                Ok(OAuth2Config().asJson)
              }
          }
        }
      }
    }
  }
}
