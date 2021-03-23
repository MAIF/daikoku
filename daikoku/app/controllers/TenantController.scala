package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import com.nimbusds.jose.jwk.KeyType
import fr.maif.otoroshi.daikoku.actions.{DaikokuAction, DaikokuActionMaybeWithGuest}
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async._
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain.UsagePlan.FreeWithoutQuotas
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json.TenantFormat
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.login.OAuth2Config
import fr.maif.otoroshi.daikoku.utils._
import fr.maif.otoroshi.daikoku.utils.jwt.JWKSAlgoSettings
import org.joda.time.DateTime
import play.api.i18n._
import play.api.libs.json._
import play.api.mvc.{AbstractController, ControllerComponents, Result, Results}
import reactivemongo.bson.BSONObjectID

import java.util.concurrent.TimeUnit
import scala.concurrent.Future
import scala.util.Try

class TenantController(DaikokuAction: DaikokuAction,
                       DaikokuActionMaybeWithGuest: DaikokuActionMaybeWithGuest,
                       apiService: ApiService,
                       env: Env,
                       otoroshiClient: OtoroshiClient,
                       cc: ControllerComponents)
    extends AbstractController(cc)
    with I18nSupport {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  def namesOfTenants() = DaikokuAction.async(parse.json) { ctx =>
    val tenantIdsJs: JsArray = ctx.request.body.as[JsArray]
    val tenantIds = ctx.request.body.as[JsArray].value.map(_.as[String])
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
    TenantAdminOnly(
      AuditTrailEvent(
        s"@{user.name} has accessed one tenant @{tenant.name} - @{tenant.id}"))(
      tenantId,
      ctx) { (tenant, _) =>
      env.dataStore.translationRepo
        .forTenant(ctx.tenant)
        .find(Json.obj("element.id" -> tenant.id.asJson))
        .map(translations => {
          val translationAsJsObject = translations
            .groupBy(t => t.language)
            .map {
              case (k, v) =>
                Json.obj(k -> JsObject(v.map(t => t.key -> JsString(t.value))))
            }
            .fold(Json.obj())(_ deepMerge _)
          val translation = Json.obj("translation" -> translationAsJsObject)
          Ok(tenant.asJsonWithJwt.as[JsObject] ++ translation)
        })
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
            avatar = tenant.style.map(_.logo),
            users = Set.empty,
            subscriptions = Seq.empty,
            authorizedOtoroshiGroups = Set.empty,
            contact = tenant.contact
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
            _ <- env.dataStore.tenantRepo.save(tenantForCreation)
            _ <- env.dataStore.teamRepo
              .forTenant(tenantForCreation)
              .save(adminTeam)
            _ <- env.dataStore.apiRepo
              .forTenant(tenantForCreation)
              .save(adminApi)
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
            _ <- env.dataStore.userRepo.updateMany(
              Json.obj("lastTenant" -> tenant.id.asJson),
              Json.obj("lastTenant" -> JsNull))
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
    TenantAdminOnly(
      AuditTrailEvent(
        s"@{user.name} has updated tenant @{tenant.name} - @{tenant.id}"))(
      tenantId,
      ctx) { (_, adminTeam) =>
      TenantFormat.reads(ctx.request.body) match {
        case JsError(e) =>
          FastFuture.successful(
            BadRequest(Json.obj("error" -> "Error while parsing payload",
                                "msg" -> e.toString)))
        case JsSuccess(tenant, _) =>
          ctx.setCtxValue("tenant.name", tenant.name)
          ctx.setCtxValue("tenant.id", tenant.id)

          tenant.tenantMode match {
            case Some(value) =>
              value match {
                case TenantMode.Maintenance | TenantMode.Construction =>
                  env.dataStore.userSessionRepo.find(Json.obj("_id" -> Json.obj("$ne" -> ctx.session.sessionId.asJson)))
                    .map(seq => env.dataStore.userSessionRepo.delete(Json.obj("_id" -> Json.obj("$in" -> JsArray(seq.map(_.sessionId.asJson))))))
                case _ =>
              }
            case _ =>
          }

          for {
            _ <- env.dataStore.tenantRepo.save(tenant)
            _ <- env.dataStore.teamRepo
              .forTenant(tenant)
              .save(
                adminTeam.copy(
                  name = s"${tenant.humanReadableId}-admin-team",
                  contact = tenant.contact,
                  avatar = tenant.style.map(_.logo)
                ))
          } yield {
            Ok(
              Json.obj("tenant" -> tenant.asJsonWithJwt,
                       "uiPayload" -> tenant.toUiPayload(env)))
          }
      }
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

  def contact(tenantId: String) =
    DaikokuActionMaybeWithGuest.async(parse.json) { ctx =>
      UberPublicUserAccess(
        AuditTrailEvent(
          s"@{name} - @{email} send a contact email to @{contact}"))(ctx) {

        val tenantLanguage = ctx.tenant.defaultLanguage
          .getOrElse("en")

        val currentLanguage = ctx.request.headers.toSimpleMap
          .find(test => test._1 == "X-contact-language")
          .map(h => h._2)
          .orElse(ctx.tenant.defaultLanguage)
          .getOrElse("en")

        val body = ctx.request.body

        val name = (body \ "name").as[String]
        val email = (body \ "email").as[String]
        val subject = (body \ "subject").as[String]
        val mailBody = (body \ "body").as[String]
        val teamId = (body \ "teamId").asOpt[String]
        val apiId = (body \ "apiId").asOpt[String]

        ctx.setCtxValue("email", email)
        ctx.setCtxValue("name", name)

        val sanitizeBody = HtmlSanitizer.sanitize(mailBody)

        val titleToSender: String =
          messagesApi("mail.contact.title")(Lang(currentLanguage))
        val titleToContact: String =
          messagesApi("mail.contact.title")(Lang(tenantLanguage))
        val mailToSender: String =
          messagesApi("mail.contact.sender",
                      name,
                      email,
                      subject,
                      sanitizeBody)(Lang(currentLanguage))
        val mailToContact: String =
          messagesApi("mail.contact.contact",
                      name,
                      email,
                      subject,
                      sanitizeBody)(Lang(tenantLanguage))

        def sendMail: String => Future[Result] = (contact: String) => {
          for {
            _ <- ctx.tenant.mailer.send(titleToSender, Seq(email), mailToSender)
            _ <- ctx.tenant.mailer.send(titleToContact,
                                        Seq(contact),
                                        mailToContact)
          } yield {
            ctx.setCtxValue("contact", contact)
            Ok(Json.obj("send" -> true))
          }
        }

        (teamId, apiId) match {
          case (Some(id), _) =>
            env.dataStore.teamRepo
              .forTenant(ctx.tenant)
              .findByIdNotDeleted(id)
              .flatMap {
                case Some(team) => sendMail(team.contact)
                case None =>
                  FastFuture.successful(
                    NotFound(Json.obj("error" -> "team not found")))
              }
          case (_, Some(id)) =>
            env.dataStore.apiRepo
              .forTenant(ctx.tenant)
              .findByIdNotDeleted(id)
              .flatMap {
                case Some(api) =>
                  env.dataStore.teamRepo
                    .forTenant(ctx.tenant)
                    .findByIdNotDeleted(api.team)
                    .flatMap {
                      case Some(team) => sendMail(team.contact)
                      case None =>
                        FastFuture.successful(
                          NotFound(Json.obj("error" -> "team not found")))
                    }
                case None =>
                  FastFuture.successful(
                    NotFound(Json.obj("error" -> "api not found")))
              }
          case (None, None) => sendMail(ctx.tenant.contact)
        }
      }
    }

  def admins(tenantId: String) = DaikokuAction.async { ctx =>
    TenantAdminOnly(
      AuditTrailEvent(s"@{user.name} has accessed the current tenant admins"))(
      tenantId,
      ctx) { (tenant, adminTeam) =>
      env.dataStore.userRepo
        .findNotDeleted(Json.obj("_id" -> Json.obj(
          "$in" -> JsArray(adminTeam.users.map(_.userId.asJson).toList))))
        .map(admins =>
          Ok(Json.obj("team" -> adminTeam.asSimpleJson,
                      "admins" -> JsArray(admins.map(_.asSimpleJson).toList))))
    }
  }

  def addableAdmins(tenantId: String) = DaikokuAction.async { ctx =>
    TenantAdminOnly(
      AuditTrailEvent(s"@{user.name} has accessed the current tenant admins"))(
      tenantId,
      ctx) { (tenant, adminTeam) =>
      env.dataStore.userRepo
        .findNotDeleted(Json.obj("_id" -> Json.obj(
          "$nin" -> JsArray(adminTeam.users.map(_.userId.asJson).toSeq))))
        .map(addableAdmins =>
          Ok(JsArray(addableAdmins.map(_.asSimpleJson).toList)))
    }
  }

  def addAdminsToTenant(tenantId: String) = DaikokuAction.async(parse.json) {
    ctx =>
      TenantAdminOnly(
        AuditTrailEvent(s"@{user.name} has added a new tenant admin - @{ids}"))(
        tenantId,
        ctx) { (tenant, adminTeam) =>
        val admins = (ctx.request.body)
          .as[JsArray]
          .value
          .map(id =>
            UserWithPermission(UserId(id.as[String]),
                               TeamPermission.Administrator))
        val updatedTeam = adminTeam.copy(users = adminTeam.users ++ admins)

        env.dataStore.teamRepo
          .forTenant(tenant)
          .save(updatedTeam)
          .map(done => {
            if (done) {
              Ok(updatedTeam.asSimpleJson)
            } else {
              BadRequest(Json.obj("error" -> "Failure"))
            }
          })

      }
  }

  def removeAdminFromTenant(tenantId: String, adminId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(AuditTrailEvent(
        s"@{user.name} has added a new tenant admins - @{admin.id}"))(tenantId,
                                                                      ctx) {
        (tenant, adminTeam) =>
          if (adminTeam.users.size == 1 && adminTeam.users.exists(u =>
                u.userId.value == adminId)) {
            FastFuture.successful(Conflict(Json.obj(
              "error" -> "There must be at least one administrator on the team")))
          } else if (adminId == ctx.user.id.value) {
            FastFuture.successful(Conflict(Json.obj(
              "error" -> "You can't remove yourself your tenant admin rights")))
          } else {
            val updatedTeam = adminTeam.copy(
              users = adminTeam.users.filterNot(_.userId.value == adminId))
            env.dataStore.teamRepo
              .forTenant(tenant)
              .save(updatedTeam)
              .map(done => {
                if (done) {
                  Ok(updatedTeam.asSimpleJson)
                } else {
                  BadRequest(Json.obj("error" -> "Failure"))
                }
              })
          }
      }
    }
}
