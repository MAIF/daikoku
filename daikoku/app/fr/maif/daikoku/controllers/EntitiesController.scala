package fr.maif.daikoku.controllers

import cats.syntax.option.*
import com.google.common.base.Charsets
import fr.maif.daikoku.actions.{
  DaikokuAction,
  DaikokuActionContext,
  tenantSecurity
}
import fr.maif.daikoku.audit.AuditTrailEvent
import fr.maif.daikoku.controllers.authorizations.sync.PublicUserAccess
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.env.{Env, LocalAdminApiConfig, OtoroshiAdminApiConfig}
import fr.maif.daikoku.login.{AuthProvider, IdentityAttrs, TenantHelper}
import fr.maif.daikoku.utils.{Errors, IdGenerator}
import fr.maif.daikoku.utils.StringImplicits.*
import com.auth0.jwt.JWT
import org.joda.time.DateTime
import org.mindrot.jbcrypt.BCrypt
import play.api.Logger
import play.api.libs.json.Json
import play.api.mvc.*

import java.util.Base64
import scala.collection.concurrent.TrieMap
import scala.concurrent.duration.DurationInt
import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Success, Try}

class DaikokuActionOrApiKey(val parser: BodyParser[AnyContent], env: Env)
    extends ActionBuilder[DaikokuActionContext, AnyContent]
    with ActionFunction[Request, DaikokuActionContext] {

  implicit lazy val ec: ExecutionContext = env.defaultExecutionContext
  private val logger = Logger("daikoku-action-or-apikey")

  private val systemUser = User(
    id = UserId("admin-api-user"),
    tenants = Set.empty,
    origins = Set(AuthProvider.Local),
    name = "Admin API User",
    email = "admin-api@daikoku.io",
    isDaikokuAdmin = true,
    lastTenant = None,
    defaultLanguage = None,
    personalToken = Some(IdGenerator.token(32))
  )

  private def decodeBase64(encoded: String): String =
    new String(Base64.getUrlDecoder.decode(encoded), Charsets.UTF_8)

  private def extractUsernamePassword(
      header: String
  ): Option[(String, String)] = {
    val base64 = header.replace("Basic ", "").replace("basic ", "")
    Option(base64)
      .map(decodeBase64)
      .map(_.split(":").toSeq)
      .flatMap(a =>
        a.headOption.flatMap(head => a.lastOption.map(last => (head, last)))
      )
  }

  private def buildContext[A](
      request: Request[A],
      tenant: Tenant
  ): DaikokuActionContext[A] = {
    DaikokuActionContext(
      request = request,
      user = systemUser.copy(tenants = Set(tenant.id)),
      tenant = tenant,
      session = UserSession(
        id = DatastoreId("admin-api-session"),
        userId = systemUser.id,
        userName = systemUser.name,
        userEmail = systemUser.email,
        impersonatorId = None,
        impersonatorName = None,
        impersonatorEmail = None,
        impersonatorSessionId = None,
        sessionId = UserSessionId("admin-api-session"),
        created = DateTime.now(),
        expires = DateTime.now().plusHours(1),
        ttl = 3600.seconds
      ),
      impersonator = None,
      isTenantAdmin = true,
      apiCreationPermitted = true
    )
  }

  private def tryApiKeyAuth[A](
      request: Request[A],
      block: DaikokuActionContext[A] => Future[Result]
  ): Future[Result] = {
    TenantHelper.withTenant(request, env) { tenant =>
      env.config.adminApiConfig match {
        case OtoroshiAdminApiConfig(headerName, algo) =>
          request.headers.get(headerName) match {
            case Some(value) =>
              Try(JWT.require(algo).build().verify(value)) match {
                case Success(decoded) if !decoded.getClaim("apikey").isNull =>
                  block(buildContext(request, tenant))
                case _ =>
                  Errors.craftResponseResultF(
                    "No api key provided",
                    Results.Unauthorized
                  )
              }
            case _ =>
              Errors.craftResponseResultF(
                "No api key provided",
                Results.Unauthorized
              )
          }
        case LocalAdminApiConfig(_) =>
          request.headers.get("Authorization") match {
            case Some(auth) if auth.startsWith("Basic ") =>
              extractUsernamePassword(auth) match {
                case Some((clientId, clientSecret)) =>
                  env.dataStore.apiSubscriptionRepo
                    .forTenant(tenant)
                    .findNotDeleted(
                      Json.obj(
                        "apiKey.clientId" -> clientId,
                        "apiKey.clientSecret" -> clientSecret
                      )
                    )
                    .map(_.length == 1)
                    .flatMap {
                      case true => block(buildContext(request, tenant))
                      case _ =>
                        Errors.craftResponseResultF(
                          "Invalid api key",
                          Results.Unauthorized
                        )
                    }
                case None =>
                  Errors.craftResponseResultF(
                    "No api key provided",
                    Results.Unauthorized
                  )
              }
            case _ =>
              Errors.craftResponseResultF(
                "No api key provided",
                Results.Unauthorized
              )
          }
      }
    }
  }

  override def invokeBlock[A](
      request: Request[A],
      block: DaikokuActionContext[A] => Future[Result]
  ): Future[Result] = {
    // Try session auth first
    (
      request.attrs.get(IdentityAttrs.TenantKey),
      request.attrs.get(IdentityAttrs.SessionKey),
      request.attrs.get(IdentityAttrs.ImpersonatorKey),
      request.attrs.get(IdentityAttrs.UserKey),
      request.attrs.get(IdentityAttrs.TenantAdminKey)
    ) match {
      case (Some(tenant), _, _, Some(user), isTenantAdmin)
          if !tenantSecurity.canAccessInCurrentMode(
            tenant,
            user.some,
            isTenantAdmin,
            request.path
          ) =>
        Errors.craftResponseResultF(
          s"${tenant.tenantMode.get.toString} mode enabled",
          Results.ServiceUnavailable
        )
      case (
            Some(tenant),
            Some(session),
            Some(imper),
            Some(user),
            Some(isTenantAdmin)
          ) =>
        if (user.tenants.contains(tenant.id)) {
          tenantSecurity
            .userCanCreateApi(tenant, user)(using env, ec)
            .flatMap(permission =>
              block(
                DaikokuActionContext(
                  request,
                  user,
                  tenant,
                  session,
                  imper,
                  isTenantAdmin,
                  permission
                )
              )
            )
        } else {
          // No session for this tenant, try API key
          tryApiKeyAuth(request, block)
        }
      // No session at all, try API key
      case _ =>
        tryApiKeyAuth(request, block)
    }
  }

  override protected def executionContext: ExecutionContext = ec
}

class EntitiesController(
    DaikokuAction: DaikokuAction,
    env: Env,
    cc: ControllerComponents
) extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  private val DaikokuActionOrApiKey =
    new DaikokuActionOrApiKey(cc.parsers.default, env)

  def newTenant() =
    DaikokuActionOrApiKey.async { ctx =>
      PublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} has asked for a template entity of type Tenant"
        )
      )(ctx) {
        val tenantId = TenantId(IdGenerator.token(32))
        Ok(
          Tenant(
            id = tenantId,
            name = "New organization",
            domain = "organization.foo.bar",
            contact = "contact@foo.bar",
            defaultLanguage = None,
            style = Some(DaikokuStyle.template(tenantId)),
            mailerSettings = Some(ConsoleMailerSettings()),
            bucketSettings = None,
            authProvider = AuthProvider.Local,
            authProviderSettings = Json.obj(
              "sessionMaxAge" -> 86400
            ),
            otoroshiSettings = Set(),
            adminApi = ApiId("no-api")
          ).asJson
        )
      }
    }

  def newTeam() =
    DaikokuActionOrApiKey.async { ctx =>
      PublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} has asked for a template entity of type Team"
        )
      )(ctx) {
        Ok(
          Team(
            id = TeamId(IdGenerator.token(32)),
            tenant = ctx.tenant.id,
            `type` = TeamType.Organization,
            name = "New Team",
            description = "A new team",
            apiKeyVisibility = env.config.defaultApiKeyVisibility.some,
            contact = "contact@foo.bar"
          ).asJson
        )
      }
    }

  def newOtoroshi() =
    DaikokuActionOrApiKey.async { ctx =>
      PublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} has asked for a template entity of type OtoroshiSettings"
        )
      )(ctx) {
        Ok(
          OtoroshiSettings(
            id = OtoroshiSettingsId(IdGenerator.token(32)),
            url = s"https://otoroshi-api.foo.bar",
            host = "otoroshi-api.foo.bar",
            clientId = "admin-api-apikey-id",
            clientSecret = "admin-api-apikey-id"
          ).asJson
        )
      }
    }

  def newApi() =
    DaikokuActionOrApiKey.async { ctx =>
      PublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} has asked for a template entity of type Api"
        )
      )(ctx) {
        Ok(
          Api(
            id = ApiId(IdGenerator.token(32)),
            tenant = ctx.tenant.id,
            team = TeamId("none"),
            name = "New API",
            smallDescription = "A new API",
            description = "A new API",
            lastUpdate = DateTime.now(),
            documentation = ApiDocumentation(
              id = ApiDocumentationId(IdGenerator.token(32)),
              tenant = ctx.tenant.id,
              lastModificationAt = DateTime.now(),
              pages = Seq.empty
            ),
            visibility = ApiVisibility.Public,
            possibleUsagePlans = Seq.empty,
            defaultUsagePlan = None
          ).asJson
        )
      }
    }

  def newApiDocumentation() =
    DaikokuActionOrApiKey.async { ctx =>
      PublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} has asked for a template entity of type ApiDocumentation"
        )
      )(ctx) {
        Ok(
          ApiDocumentation(
            id = ApiDocumentationId(IdGenerator.token(32)),
            tenant = ctx.tenant.id,
            lastModificationAt = DateTime.now(),
            pages = Seq.empty
          ).asJson
        )
      }
    }

  def newApiDocumentationPage() =
    DaikokuActionOrApiKey.async { ctx =>
      PublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} has asked for a template entity of type ApiDocumentationPage"
        )
      )(ctx) {
        Ok(
          ApiDocumentationPage(
            id = ApiDocumentationPageId(IdGenerator.token(32)),
            tenant = ctx.tenant.id,
            title = "New page",
            lastModificationAt = DateTime.now(),
            content = "# New page"
          ).asJson
        )
      }
    }

  def newApiGroup() =
    DaikokuActionOrApiKey.async { ctx =>
      PublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} has asked for a template entity of type ApiGroup"
        )
      )(ctx) {
        Ok(
          Api(
            id = ApiId(IdGenerator.token(32)),
            tenant = ctx.tenant.id,
            team = TeamId("none"),
            name = "New API group",
            apis = Some(Set.empty),
            smallDescription = "A new API group",
            description = "A new API group",
            lastUpdate = DateTime.now(),
            documentation = ApiDocumentation(
              id = ApiDocumentationId(IdGenerator.token(32)),
              tenant = ctx.tenant.id,
              lastModificationAt = DateTime.now(),
              pages = Seq.empty
            ),
            visibility = ApiVisibility.Public,
            possibleUsagePlans = Seq.empty,
            defaultUsagePlan = None
          ).asJson
        )
      }
    }

  def newUser() =
    DaikokuActionOrApiKey.async { ctx =>
      PublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} has asked for a template entity of type User"
        )
      )(ctx) {
        Ok(
          User(
            id = UserId(IdGenerator.token(32)),
            deleted = false,
            tenants = Set(ctx.tenant.id),
            origins = Set(AuthProvider.Local),
            name = "John Doe",
            email = "john.doe@foo.bar",
            picture = "john.doe@foo.bar".gravatar,
            isDaikokuAdmin = false,
            password = Some(BCrypt.hashpw("password", BCrypt.gensalt())),
            lastTenant = Some(ctx.tenant.id),
            personalToken = Some(IdGenerator.token(32)),
            defaultLanguage = None
            // lastTeams = Map(ctx.tenant.id -> Team.Default)
          ).asJson
        )
      }
    }

  def newIssue(): Action[AnyContent] =
    DaikokuActionOrApiKey.async { ctx =>
      PublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} has asked for a template entity of type Issue"
        )
      )(ctx) {
        Ok(
          ApiIssue(
            id = ApiIssueId(IdGenerator.token(32)),
            tenant = ctx.tenant.id,
            title = "",
            tags = Set.empty,
            seqId = 0,
            open = true,
            comments = Seq(
              ApiIssueComment(
                by = ctx.user.id,
                createdAt = DateTime.now(),
                lastModificationAt = DateTime.now(),
                content = ""
              )
            ),
            by = ctx.user.id,
            createdAt = DateTime.now(),
            lastModificationAt = DateTime.now(),
            closedAt = None
          ).asJson
        )
      }
    }

  def newPlan(): Action[AnyContent] =
    DaikokuActionOrApiKey.async { ctx =>
      PublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} has asked for a template entity of type Plan"
        )
      )(ctx) {
        Ok(
          UsagePlan(
            id = UsagePlanId(IdGenerator.token(32)),
            tenant = ctx.tenant.id,
            maxPerSecond = None,
            maxPerDay = None,
            maxPerMonth = None,
            costPerMonth = None,
            costPerRequest = None,
            billingDuration = None,
            trialPeriod = None,
            currency = None,
            customName = "new usage plan",
            customDescription = None,
            otoroshiTarget = None,
            allowMultipleKeys = Some(false),
            integrationProcess = IntegrationProcess.ApiKey,
            autoRotation = Some(false),
            documentation =
              if (ctx.tenant.display == TenantDisplay.Environment)
                ApiDocumentation(
                  id = ApiDocumentationId(IdGenerator.token(32)),
                  tenant = ctx.tenant.id,
                  lastModificationAt = DateTime.now(),
                  pages = Seq.empty
                ).some
              else None
          ).asJson
        )
      }
    }
}
