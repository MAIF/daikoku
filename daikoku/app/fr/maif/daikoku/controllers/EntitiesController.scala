package fr.maif.daikoku.controllers

import cats.syntax.option._
import fr.maif.daikoku.actions.DaikokuAction
import fr.maif.daikoku.audit.AuditTrailEvent
import fr.maif.daikoku.controllers.authorizations.sync.PublicUserAccess
import fr.maif.daikoku.domain._
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.login.AuthProvider
import fr.maif.daikoku.utils.IdGenerator
import fr.maif.daikoku.utils.StringImplicits._
import org.joda.time.DateTime
import org.mindrot.jbcrypt.BCrypt
import play.api.libs.json.Json
import play.api.mvc._

import scala.concurrent.ExecutionContext

class EntitiesController(
    DaikokuAction: DaikokuAction,
    env: Env,
    cc: ControllerComponents
) extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  def newTenant() =
    DaikokuAction.async { ctx =>
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
    DaikokuAction.async { ctx =>
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
    DaikokuAction.async { ctx =>
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
    DaikokuAction.async { ctx =>
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
    DaikokuAction.async { ctx =>
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
    DaikokuAction.async { ctx =>
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
    DaikokuAction.async { ctx =>
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
    DaikokuAction.async { ctx =>
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
    DaikokuAction.async { ctx =>
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
    DaikokuAction.async { ctx =>
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
            subscriptionProcess = Seq.empty,
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
