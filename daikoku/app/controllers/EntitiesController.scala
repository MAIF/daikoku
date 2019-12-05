package fr.maif.otoroshi.daikoku.ctrls

import fr.maif.otoroshi.daikoku.actions.DaikokuAction
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.sync.PublicUserAccess
import fr.maif.otoroshi.daikoku.domain.UsagePlan.FreeWithQuotas
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.login.AuthProvider
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import fr.maif.otoroshi.daikoku.utils.StringImplicits._
import org.joda.time.DateTime
import org.mindrot.jbcrypt.BCrypt
import play.api.libs.json.Json
import play.api.mvc._
import reactivemongo.bson.BSONObjectID

class EntitiesController(DaikokuAction: DaikokuAction, env: Env, cc: ControllerComponents) extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  def newTenant() = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(s"@{user.name} has asked for a template entity of type Tenant"))(ctx) {
      Ok(Tenant(
        id = TenantId(BSONObjectID.generate().stringify),
        deleted = false,
        enabled = true,
        name = "New organization",
        domain = "organization.foo.bar",
        defaultLanguage = None,
        style = Some(DaikokuStyle()),
        mailerSettings = Some(ConsoleMailerSettings()),
        bucketSettings = None,
        authProvider = AuthProvider.Local,
        authProviderSettings = Json.obj(
          "sessionMaxAge" -> 86400
        ),
        otoroshiSettings = Set()
      ).asJson)
    }
  }

  def newTeam() = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(s"@{user.name} has asked for a template entity of type Team"))(ctx) {
      Ok(Team(
        id = TeamId(BSONObjectID.generate().stringify),
        tenant = ctx.tenant.id,
        `type` = TeamType.Organization,
        name = "New Team",
        description = "A new team"
      ).asJson)
    }
  }

  def newOtoroshi() = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(s"@{user.name} has asked for a template entity of type OtoroshiSettings"))(ctx) {
      Ok(OtoroshiSettings(
        id = OtoroshiSettingsId(BSONObjectID.generate().stringify),
        url = s"https://otoroshi-api.foo.bar",
        host = "otoroshi-api.foo.bar",
        clientId = "admin-api-apikey-id",
        clientSecret = "admin-api-apikey-id"
      ).asJson)
    }
  }

  def newApi() = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(s"@{user.name} has asked for a template entity of type Api"))(ctx) {
      Ok(Api(
        id = ApiId(BSONObjectID.generate().stringify),
        tenant = ctx.tenant.id,
        team = TeamId("none"),
        deleted = false,
        name = "New API",
        smallDescription = "A new API",
        description = "A new API",
        lastUpdate = DateTime.now(),
        documentation = ApiDocumentation(
          id = ApiDocumentationId(BSONObjectID.generate().stringify),
          tenant = ctx.tenant.id,
          lastModificationAt = DateTime.now(),
          pages = Seq.empty
        ),
        visibility = ApiVisibility.Public,
        subscriptionProcess = SubscriptionProcess.Automatic,
        possibleUsagePlans = Seq(FreeWithQuotas(
          id = UsagePlanId("default"),
          maxPerSecond = 10,
          maxPerDay = 500,
          maxPerMonth = 10000,
          currency = Currency(
            code = "EUR"
          ),
          billingDuration = BillingDuration(
            value = 1,
            unit = BillingTimeUnit.Month
          ),
          customName = Some("Free plan"),
          customDescription = Some("Free plan with limited number of calls per day and per month"),
          otoroshiTarget = None,
          allowMultipleKeys = Some(false)
        )),
        defaultUsagePlan = UsagePlanId("default")
      ).asJson)
    }
  }

  def newUser() = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(s"@{user.name} has asked for a template entity of type User"))(ctx) {
      Ok(User(
        id = UserId(BSONObjectID.generate().stringify),
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

}
