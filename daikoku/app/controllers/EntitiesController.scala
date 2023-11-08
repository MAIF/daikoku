package fr.maif.otoroshi.daikoku.ctrls

import cats.syntax.option._
import fr.maif.otoroshi.daikoku.actions.DaikokuAction
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.sync.PublicUserAccess
import fr.maif.otoroshi.daikoku.domain.UsagePlanVisibility.Private
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.login.AuthProvider
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import fr.maif.otoroshi.daikoku.utils.StringImplicits._
import org.joda.time.DateTime
import org.mindrot.jbcrypt.BCrypt
import play.api.libs.json.Json
import play.api.mvc._

class EntitiesController(DaikokuAction: DaikokuAction,
                         env: Env,
                         cc: ControllerComponents)
    extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  def newTenant() = DaikokuAction.async { ctx =>
    PublicUserAccess(
      AuditTrailEvent(
        s"@{user.name} has asked for a template entity of type Tenant"))(ctx) {
      Ok(
        Tenant(
          id = TenantId(IdGenerator.token(32)),
          name = "New organization",
          domain = "organization.foo.bar",
          contact = "contact@foo.bar",
          defaultLanguage = None,
          style = Some(DaikokuStyle()),
          mailerSettings = Some(ConsoleMailerSettings()),
          bucketSettings = None,
          authProvider = AuthProvider.Local,
          authProviderSettings = Json.obj(
            "sessionMaxAge" -> 86400
          ),
          otoroshiSettings = Set(),
          adminApi = ApiId("no-api")
        ).asJson)
    }
  }

  def newTeam() = DaikokuAction.async { ctx =>
    PublicUserAccess(
      AuditTrailEvent(
        s"@{user.name} has asked for a template entity of type Team"))(ctx) {
      Ok(
        Team(
          id = TeamId(IdGenerator.token(32)),
          tenant = ctx.tenant.id,
          `type` = TeamType.Organization,
          name = "New Team",
          description = "A new team",
          apiKeyVisibility = env.config.defaultApiKeyVisibility.some
        ).asJson)
    }
  }

  def newOtoroshi() = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(
      s"@{user.name} has asked for a template entity of type OtoroshiSettings"))(
      ctx) {
      Ok(
        OtoroshiSettings(
          id = OtoroshiSettingsId(IdGenerator.token(32)),
          url = s"https://otoroshi-api.foo.bar",
          host = "otoroshi-api.foo.bar",
          clientId = "admin-api-apikey-id",
          clientSecret = "admin-api-apikey-id"
        ).asJson)
    }
  }

  def newApi() = DaikokuAction.async { ctx =>
    PublicUserAccess(
      AuditTrailEvent(
        s"@{user.name} has asked for a template entity of type Api"))(ctx) {
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
          defaultUsagePlan = UsagePlanId("default")
        ).asJson)
    }
  }

  def newApiDocumentation() = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(
      s"@{user.name} has asked for a template entity of type ApiDocumentationr"))(
      ctx) {
      Ok(
        ApiDocumentation(
          id = ApiDocumentationId(IdGenerator.token(32)),
          tenant = ctx.tenant.id,
          lastModificationAt = DateTime.now(),
          pages = Seq.empty
        ).asJson)
    }
  }

  def newApiGroup() = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(
      s"@{user.name} has asked for a template entity of type ApiGroup"))(ctx) {
      Ok(
        Api(
          id = ApiId(IdGenerator.token(32)),
          tenant = ctx.tenant.id,
          team = TeamId("none"),
          name = "New API",
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
          defaultUsagePlan = UsagePlanId("default")
        ).asJson)
    }
  }

  def newUser() = DaikokuAction.async { ctx =>
    PublicUserAccess(
      AuditTrailEvent(
        s"@{user.name} has asked for a template entity of type User"))(ctx) {
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
        ).asJson)
    }
  }

  def newIssue(): Action[AnyContent] = DaikokuAction.async { ctx =>
    PublicUserAccess(
      AuditTrailEvent(
        s"@{user.name} has asked for a template entity of type Issue"))(ctx) {
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
            )),
          by = ctx.user.id,
          createdAt = DateTime.now(),
          lastModificationAt = DateTime.now(),
          closedAt = None
        ).asJson)
    }
  }

  def newPlan(planType: String): Action[AnyContent] = DaikokuAction.async {
    ctx =>
      PublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} has asked for a template entity of type Plan"))(ctx) {
        planType match {
          case "Admin" =>
            Ok(
              UsagePlan
                .Admin(id = UsagePlanId(IdGenerator.token(32)),
                       tenant = ctx.tenant.id,
                       otoroshiTarget = None)
                .asJson)
          case "PayPerUse" =>
            Ok(
              UsagePlan
                .PayPerUse(
                  id = UsagePlanId(IdGenerator.token(32)),
                  tenant = ctx.tenant.id,
                  costPerRequest = BigDecimal(0),
                  costPerMonth = BigDecimal(0),
                  billingDuration = BillingDuration(1, BillingTimeUnit.Month),
                  trialPeriod = None,
                  currency = Currency("EUR"),
                  customName = None,
                  customDescription = None,
                  otoroshiTarget = None,
                  allowMultipleKeys = Some(false),
                  visibility = Private,
                  autoRotation = Some(false),
                  subscriptionProcess = Seq.empty,
                  integrationProcess = IntegrationProcess.ApiKey
                )
                .asJson)
          case "FreeWithQuotas" =>
            Ok(
              UsagePlan
                .FreeWithQuotas(
                  id = UsagePlanId(IdGenerator.token(32)),
                  tenant = ctx.tenant.id,
                  maxPerSecond = 0,
                  maxPerDay = 0,
                  maxPerMonth = 0,
                  billingDuration = BillingDuration(1, BillingTimeUnit.Month),
                  currency = Currency("EUR"),
                  customName = None,
                  customDescription = None,
                  otoroshiTarget = None,
                  allowMultipleKeys = Some(false),
                  subscriptionProcess = Seq.empty,
                  integrationProcess = IntegrationProcess.ApiKey,
                  autoRotation = Some(false)
                )
                .asJson)
          case "FreeWithoutQuotas" =>
            Ok(
              UsagePlan
                .FreeWithoutQuotas(
                  id = UsagePlanId(IdGenerator.token(32)),
                  tenant = ctx.tenant.id,
                  billingDuration = BillingDuration(1, BillingTimeUnit.Month),
                  currency = Currency("EUR"),
                  customName = None,
                  customDescription = None,
                  otoroshiTarget = None,
                  allowMultipleKeys = Some(false),
                  subscriptionProcess = Seq.empty,
                  integrationProcess = IntegrationProcess.ApiKey,
                  autoRotation = Some(false)
                )
                .asJson)
          case "QuotasWithLimits" =>
            Ok(
              UsagePlan
                .QuotasWithLimits(
                  id = UsagePlanId(IdGenerator.token(32)),
                  tenant = ctx.tenant.id,
                  maxPerSecond = 0,
                  maxPerDay = 0,
                  maxPerMonth = 0,
                  costPerMonth = BigDecimal(0),
                  billingDuration = BillingDuration(1, BillingTimeUnit.Month),
                  trialPeriod = None,
                  currency = Currency("EUR"),
                  customName = None,
                  customDescription = None,
                  otoroshiTarget = None,
                  allowMultipleKeys = Some(false),
                  subscriptionProcess = Seq.empty,
                  integrationProcess = IntegrationProcess.ApiKey,
                  autoRotation = Some(false)
                )
                .asJson)
          case "QuotasWithoutLimits" =>
            Ok(
              UsagePlan
                .QuotasWithoutLimits(
                  id = UsagePlanId(IdGenerator.token(32)),
                  tenant = ctx.tenant.id,
                  maxPerSecond = 0,
                  maxPerDay = 0,
                  maxPerMonth = 0,
                  costPerMonth = BigDecimal(0),
                  costPerAdditionalRequest = BigDecimal(0),
                  billingDuration = BillingDuration(1, BillingTimeUnit.Month),
                  trialPeriod = None,
                  currency = Currency("EUR"),
                  customName = None,
                  customDescription = None,
                  otoroshiTarget = None,
                  allowMultipleKeys = Some(true),
                  subscriptionProcess = Seq.empty,
                  integrationProcess = IntegrationProcess.ApiKey,
                  autoRotation = Some(false)
                )
                .asJson)
          case _ => BadRequest(Json.obj("error" -> "Unrecognized type of plan"))
        }
      }
  }
}
