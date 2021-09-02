package domain

import akka.http.scaladsl.util.FastFuture
import fr.maif.otoroshi.daikoku.actions.DaikokuActionContext
import fr.maif.otoroshi.daikoku.audit._
import fr.maif.otoroshi.daikoku.audit.config._
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async._UberPublicUserAccess
import fr.maif.otoroshi.daikoku.domain.NotificationAction._
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json.{TenantIdFormat, UserIdFormat}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.login.AuthProvider
import fr.maif.otoroshi.daikoku.utils.S3Configuration
import org.joda.time.{DateTime, DateTimeZone}
import org.joda.time.format.ISODateTimeFormat
import play.api.libs.json._
import sangria.ast.{ObjectValue, StringValue}
import sangria.execution.deferred.{DeferredResolver, Fetcher, HasId}
import sangria.macros.derive._
import sangria.schema._
import sangria.validation.ValueCoercionViolation
import storage._

import java.util.concurrent.TimeUnit
import scala.concurrent.Future
import scala.concurrent.duration.FiniteDuration
import scala.util.{Failure, Success, Try}

object SchemaDefinition {
  case object JsArrayCoercionViolation extends ValueCoercionViolation("Can't parse string to js array")
  case object JsonCoercionViolation extends ValueCoercionViolation("Not valid JSON")
  case object DateCoercionViolation extends ValueCoercionViolation("Date value expected")
  case object MapCoercionViolation extends ValueCoercionViolation("Map value can't be parsed")

  implicit val TimeUnitType = ScalarType[TimeUnit]("TimeUnit",
    description = Some("TimeUnit type"),
    coerceOutput = (value, _) => value,
    coerceUserInput = {
      case s: String => Right(TimeUnit.valueOf(s))
      case _ => Left(JsArrayCoercionViolation)
    },
    coerceInput = {
      case StringValue(s, _, _, _, _) => Right(TimeUnit.valueOf(s))
      case _ => Left(JsArrayCoercionViolation)
    })

  implicit val JsArrayType = ScalarType[JsArray]("JsArray",
    description = Some("JsArray type"),
    coerceOutput = (value, _) => value,
    coerceUserInput = {
      case s: String => Right(Json.parse(s).as[JsArray])
      case _ => Left(JsArrayCoercionViolation)
    },
    coerceInput = {
      case StringValue(s, _, _, _, _) => Right(Json.parse(s).as[JsArray])
      case _ => Left(JsArrayCoercionViolation)
    })

  implicit val JsonType = ScalarType[JsValue]("Json",
    description = Some("Raw JSON value"),
    coerceOutput = (value, _) => value,
    coerceUserInput = {
      case v: String => Right(JsString(v))
      case v: Boolean => Right(JsBoolean(v))
      case v: Int => Right(JsNumber(v))
      case v: Long => Right(JsNumber(v))
      case v: Float => Right(JsNumber(v))
      case v: Double => Right(JsNumber(v))
      case v: BigInt => Right(JsNumber(v.toInt))
      case v: BigDecimal => Right(JsNumber(v))
      case v: JsValue => Right(v)
    },
    coerceInput = {
      case StringValue(jsonStr, _, _, _, _) => Right(JsString(jsonStr))
      case _ => Left(JsonCoercionViolation)
    })

  def parseDate(s: String) = Try(new DateTime(s, DateTimeZone.UTC)) match {
    case Success(date) => Right(date)
    case Failure(_) => Left(DateCoercionViolation)
  }

  val DateTimeType = ScalarType[DateTime]("DateTime",
    coerceOutput = (date, _) => StringValue(ISODateTimeFormat.dateTime().print(date)),
    coerceUserInput = {
      case s: String => parseDate(s)
      case _ => Left(DateCoercionViolation)
    },
    coerceInput = {
      case StringValue(s, _, _, _, _) => parseDate(s)
      case _ => Left(DateCoercionViolation)
    })

  val MapType = ScalarType[Map[String, String]]("Map",
    coerceOutput = (data, _) => JsObject(data.view.mapValues(JsString.apply).toSeq),
    coerceUserInput = e => {
      e.asInstanceOf[Map[String, String]] match {
        case r: Map[String, String] => Right(r)
        case _ => Left(MapCoercionViolation)
      }
    },
    coerceInput = {
      case ObjectValue(fields, _, _) => {
        val tuples = fields.map(f => (f.name, f.value.toString))
        Right(tuples.toMap)
      }
      case _ => Left(MapCoercionViolation)
    })

  case class NotAuthorizedError(message: String) extends Exception(message)

  def getSchema(env: Env) = {
    implicit val e = env.defaultExecutionContext
    implicit val en = env

    val AuthProviderType: InterfaceType[Unit, AuthProvider] = InterfaceType(
      "AuthProvider",
      "Auth provider description",
      () => fields[Unit, AuthProvider](
        Field("name", StringType, Some("The name of auth provider"), resolve = _.value.name),
        Field("asJson", JsonType, resolve = _.value.asJson))
    )

    val DaikokuStyleType = deriveObjectType[Unit, DaikokuStyle]()

    val ElasticAnalyticsConfigType = deriveObjectType[Unit, ElasticAnalyticsConfig](
      ReplaceField("headers",
        Field("headers", MapType, resolve = _.value.headers)
      )
    )
    val WebhookType = deriveObjectType[Unit, Webhook](
      ReplaceField("headers",
        Field("headers", MapType, resolve = _.value.headers)
      )
    )
    val KafkaConfigType = deriveObjectType[Unit, KafkaConfig]()
    val AuditTrailConfigType = deriveObjectType[Unit, AuditTrailConfig](
      ReplaceField("elasticConfigs",
        Field("elasticConfigs", OptionType(ElasticAnalyticsConfigType), resolve = _.value.elasticConfigs)
      ),
      ReplaceField("auditWebhooks",
        Field("auditWebhooks", ListType(WebhookType), resolve = _.value.auditWebhooks)
      ),
      ReplaceField("kafkaConfig",
        Field("kafkaConfig", OptionType(KafkaConfigType), resolve = _.value.kafkaConfig)
      )
    )

    val OtoroshiSettingsType = deriveObjectType[Unit, OtoroshiSettings](
      ReplaceField("id",
        Field("id", StringType /*OtoroshiSettingsIdType*/, resolve = _.value.id.value)
      )
    )
    val MailerSettingsType: InterfaceType[Unit, MailerSettings] = InterfaceType(
      "MailerSettings",
      "The mailer settings type",
      () => fields[Unit, MailerSettings](
        Field("mailerType", StringType, resolve = _.value.mailerType)
      )
    )
    val BucketSettingsType = deriveObjectType[Unit, S3Configuration]()
    val TenantModeType: InterfaceType[Unit, TenantMode] = InterfaceType(
      "TenantMode",
      "The tenant mode",
      () => fields[Unit, TenantMode](
        Field("name", StringType, resolve = _.value.name)
      )
    )
    val TenantType = deriveObjectType[Unit, Tenant](
      ReplaceField("id",
        Field("id", StringType /*TenantIdType*/, resolve = _.value.id.value)
      ),
      ReplaceField("style",
        Field("style", OptionType(DaikokuStyleType), resolve = _.value.style)
      ),
      ReplaceField("otoroshiSettings",
        Field("otoroshiSettings", ListType(OtoroshiSettingsType), resolve = _.value.otoroshiSettings.toSeq)
      ),
      ReplaceField("mailerSettings",
        Field("mailerSettings", OptionType(MailerSettingsType), resolve = _.value.mailerSettings)
      ),
      ReplaceField("bucketSettings",
        Field("bucketSettings", OptionType(BucketSettingsType), resolve = _.value.bucketSettings)
      ),
      ReplaceField("authProvider",
        Field("authProvider", AuthProviderType, resolve = _.value.authProvider)
      ),
      ReplaceField("adminApi",
        Field("adminApi", StringType /*ApiIdType*/, resolve = _.value.adminApi.value)
      ),
      ReplaceField("adminSubscriptions",
        Field("adminSubscriptions", ListType(StringType /*ApiSubscriptionIdType*/), resolve = _.value.adminSubscriptions.map(_.value))
      ),
      ReplaceField("tenantMode",
        Field("tenantMode", OptionType(TenantModeType), resolve = _.value.tenantMode)
      ),
      ReplaceField("authProviderSettings",
        Field("authProviderSettings", JsonType, resolve = _.value.authProviderSettings)
      ),
      ReplaceField("auditTrailConfig",
        Field("auditTrailConfig", AuditTrailConfigType, resolve = _.value.auditTrailConfig)
      )
    )

    val ApiKeyRestrictionPathType = deriveObjectType[Unit, ApiKeyRestrictionPath]()
    val ApiKeyRestrictionsType = deriveObjectType[Unit, ApiKeyRestrictions](
      ReplaceField("allowed",
        Field("allowed", ListType(ApiKeyRestrictionPathType), resolve = _.value.allowed)
      ),
      ReplaceField("forbidden",
        Field("forbidden", ListType(ApiKeyRestrictionPathType), resolve = _.value.forbidden)
      ),
      ReplaceField("notFound",
        Field("notFound", ListType(ApiKeyRestrictionPathType), resolve = _.value.notFound)
      )
    )

    val CustomMetadataType = deriveObjectType[Unit, CustomMetadata](
      ReplaceField("possibleValues",
        Field("possibleValues", ListType(StringType), resolve = _.value.possibleValues.toSeq)
      )
    )
    val ApikeyCustomizationType = deriveObjectType[Unit, ApikeyCustomization](
      ReplaceField("metadata",
        Field("metadata", JsonType, resolve = _.value.metadata)
      ),
      ReplaceField("customMetadata",
        Field("customMetadata", ListType(CustomMetadataType), resolve = _.value.customMetadata)
      ),
      ReplaceField("tags",
        Field("tags", JsArrayType, resolve = _.value.tags)
      ),
      ReplaceField("restrictions",
        Field("restrictions", ApiKeyRestrictionsType, resolve =_.value.restrictions)
      )
    )

    val AuthorizedEntitiesType = deriveObjectType[Unit, AuthorizedEntities](
      ReplaceField("services",
        Field("services", ListType(StringType /*OtoroshiServiceIdType*/), resolve = _.value.services.toSeq.map(_.value))
      ),
      ReplaceField("groups",
        Field("groups", ListType(StringType /*OtoroshiServiceGroupIdType*/), resolve = _.value.groups.toSeq.map(_.value))
      )
    )

    val OtoroshiTargetType = deriveObjectType[Unit, OtoroshiTarget](
      ReplaceField("otoroshiSettings",
        Field("otoroshiSettings", StringType /*OtoroshiSettingsIdType*/, resolve = _.value.otoroshiSettings.value)
      ),
      ReplaceField("authorizedEntities",
        Field("authorizedEntities", OptionType(AuthorizedEntitiesType), resolve = _.value.authorizedEntities)
      ),
      ReplaceField("apikeyCustomization",
        Field("apikeyCustomization", ApikeyCustomizationType, resolve = _.value.apikeyCustomization)
      ),
    )

    val OtoroshiServiceType = deriveObjectType[Unit, OtoroshiService](
      ReplaceField("otoroshiSettings",
        Field("otoroshiSettings", StringType /*OtoroshiSettingsIdType*/, resolve = _.value.otoroshiSettings.value)
      ),
      ReplaceField("service",
        Field("service", StringType /*OtoroshiServiceIdType*/, resolve = _.value.service.value)
      )
    )

    val BillingTimeUnitInterfaceType = InterfaceType(
      "BillingTimeUnit",
      "BillingTimeUnit description",
      () => fields[Unit, BillingTimeUnit](
        Field("name", StringType, resolve = _.value.name)
      )
    )

    val BillingDurationType = deriveObjectType[Unit, BillingDuration](
      ReplaceField("unit",
        Field("unit", BillingTimeUnitInterfaceType, resolve = _.value.unit)
      )
    )

    /*val TeamInterfaceType = InterfaceType(
      "TeamType",
      "TeamType description",
      () => fields[Unit, TeamType](
        Field("name", StringType, resolve = _.value.name)
      )
    )*/

    val ApiVisibilityType = InterfaceType(
      "ApiVisibility",
      "ApiVisibility description",
      () => fields[Unit, ApiVisibility](
        Field("name", StringType, resolve = _.value.name)
      )
    )

    val UsagePlanVisibilityType = InterfaceType(
      "UsagePlanVisibility",
      "UsagePlanVisibility description",
      () => fields[Unit, UsagePlanVisibility](
        Field("name", StringType, resolve = _.value.name)
      )
    )

    val SubscriptionProcessType = InterfaceType(
      "SubscriptionProcess",
      "SubscriptionProcess description",
      () => fields[Unit, SubscriptionProcess](
        Field("name", StringType, resolve = _.value.name)
      )
    )

    val IntegrationProcessType = InterfaceType(
      "IntegrationProcess",
      "IntegrationProcess description",
      () => fields[Unit, IntegrationProcess](
        Field("name", StringType, resolve = _.value.name)
      )
    )

    val CurrencyType = deriveObjectType[Unit, Currency]()

    val UsagePlanInterfaceType = InterfaceType(
      name = "UsagePlan",
      description = "Usage Plan description",
      fields = fields[Unit, UsagePlan](
        Field("_id", StringType, resolve = _.value.id.value),
        Field("costPerMonth", BigDecimalType, resolve = _.value.costPerMonth),
        Field("maxRequestPerSecond", OptionType(LongType), resolve = _.value.maxRequestPerSecond),
        Field("maxRequestPerDay", OptionType(LongType), resolve = _.value.maxRequestPerDay),
        Field("maxRequestPerMonth", OptionType(LongType), resolve = _.value.maxRequestPerMonth),
        Field("allowMultipleKeys", OptionType(BooleanType), resolve = _.value.allowMultipleKeys),
        Field("autoRotation", OptionType(BooleanType), resolve = _.value.autoRotation),
        Field("currency", CurrencyType, resolve = _.value.currency),
        Field("customName", OptionType(StringType), resolve = _.value.customName),
        Field("customDescription", OptionType(StringType), resolve = _.value.customDescription),
        Field("otoroshiTarget", OptionType(OtoroshiTargetType), resolve = _.value.otoroshiTarget),
        Field("trialPeriod", OptionType(BillingDurationType), resolve = _.value.trialPeriod),
        Field("billingDuration", BillingDurationType, resolve = _.value.billingDuration),
        Field("typeName", StringType, resolve = _.value.typeName),
        Field("visibility", UsagePlanVisibilityType, resolve = _.value.visibility),
        Field("authorizedTeams", ListType(StringType /*TeamIdType*/), resolve = _.value.authorizedTeams.map(_.value)),
        Field("subscriptionProcess", SubscriptionProcessType, resolve = _.value.subscriptionProcess),
        Field("integrationProcess", IntegrationProcessType, resolve = _.value.integrationProcess),
        Field("aggregationApiKeysSecurity", OptionType(BooleanType), resolve = _.value.aggregationApiKeysSecurity)
      )
    )

    val AdminUsagePlanType = deriveObjectType[Unit, UsagePlan.Admin](
      Interfaces(UsagePlanInterfaceType),
      ReplaceField("id",
        Field("id", StringType /*UsagePlanIdType*/, resolve = _.value.id.value)
      ),
      ReplaceField("otoroshiTarget",
        Field("otoroshiTarget", OptionType(OtoroshiTargetType), resolve = _.value.otoroshiTarget)
      ),
      ReplaceField("authorizedTeams",
        Field("authorizedTeams", ListType(StringType /*TeamIdType*/), resolve = _.value.authorizedTeams.map(_.value))
      )
    )

    val FreeWithoutQuotasUsagePlanType = deriveObjectType[Unit, UsagePlan.FreeWithoutQuotas](
      Interfaces(UsagePlanInterfaceType),
      ReplaceField("currency", Field("currency", CurrencyType, resolve = _.value.currency)),
      ReplaceField("id", Field("_id", StringType /*UsagePlanIdType*/, resolve = _.value.id.value)),
      ReplaceField("billingDuration", Field("billingDuration", BillingDurationType, resolve = _.value.billingDuration)),
      ReplaceField("subscriptionProcess", Field("subscriptionProcess", SubscriptionProcessType, resolve = _.value.subscriptionProcess)),
      ReplaceField("integrationProcess", Field("integrationProcess", IntegrationProcessType, resolve = _.value.integrationProcess)),
      ReplaceField("otoroshiTarget",
        Field("otoroshiTarget", OptionType(OtoroshiTargetType), resolve = _.value.otoroshiTarget)),
      ReplaceField("visibility",
        Field("visibility", UsagePlanVisibilityType, resolve = _.value.visibility)),
      ReplaceField("authorizedTeams",
        Field("authorizedTeams", ListType(StringType /*TeamIdType*/), resolve = _.value.authorizedTeams.map(_.value)))
    )

    val FreeWithQuotasUsagePlanType = deriveObjectType[Unit, UsagePlan.FreeWithQuotas](
      Interfaces(UsagePlanInterfaceType),
      ReplaceField("currency", Field("currency", CurrencyType, resolve = _.value.currency)),
      ReplaceField("id", Field("_id", StringType /*UsagePlanIdType*/, resolve = _.value.id.value)),
      ReplaceField("billingDuration", Field("billingDuration", BillingDurationType, resolve = _.value.billingDuration)),
      ReplaceField("subscriptionProcess", Field("subscriptionProcess", SubscriptionProcessType, resolve = _.value.subscriptionProcess)),
      ReplaceField("integrationProcess", Field("integrationProcess", IntegrationProcessType, resolve = _.value.integrationProcess)),
      ReplaceField("otoroshiTarget",
        Field("otoroshiTarget", OptionType(OtoroshiTargetType), resolve = _.value.otoroshiTarget)),
      ReplaceField("visibility",
        Field("visibility", UsagePlanVisibilityType, resolve = _.value.visibility)),
      ReplaceField("authorizedTeams",
        Field("authorizedTeams", ListType(StringType /*TeamIdType*/), resolve = _.value.authorizedTeams.map(_.value)))
    )

    val QuotasWithLimitsType = deriveObjectType[Unit, UsagePlan.QuotasWithLimits](
      Interfaces(UsagePlanInterfaceType),
      ReplaceField("currency", Field("currency", CurrencyType, resolve = _.value.currency)),
      ReplaceField("id", Field("_id", StringType /*UsagePlanIdType*/, resolve = _.value.id.value)),
      ReplaceField("trialPeriod", Field("trialPeriod", OptionType(BillingDurationType), resolve = _.value.trialPeriod)),
      ReplaceField("billingDuration", Field("billingDuration", BillingDurationType, resolve = _.value.billingDuration)),
      ReplaceField("subscriptionProcess", Field("subscriptionProcess", SubscriptionProcessType, resolve = _.value.subscriptionProcess)),
      ReplaceField("integrationProcess", Field("integrationProcess", IntegrationProcessType, resolve = _.value.integrationProcess)),
      ReplaceField("otoroshiTarget",
        Field("otoroshiTarget", OptionType(OtoroshiTargetType), resolve = _.value.otoroshiTarget)),
      ReplaceField("visibility",
        Field("visibility", UsagePlanVisibilityType, resolve = _.value.visibility)),
      ReplaceField("authorizedTeams",
        Field("authorizedTeams", ListType(StringType /*TeamIdType*/), resolve = _.value.authorizedTeams.map(_.value)))
    )

    val QuotasWithoutLimitsType = deriveObjectType[Unit, UsagePlan.QuotasWithoutLimits](
      Interfaces(UsagePlanInterfaceType),
      ReplaceField("currency", Field("currency", CurrencyType, resolve = _.value.currency)),
      ReplaceField("id", Field("_id", StringType /*UsagePlanIdType*/, resolve = _.value.id.value)),
      ReplaceField("trialPeriod", Field("trialPeriod", OptionType(BillingDurationType), resolve = _.value.trialPeriod)),
      ReplaceField("billingDuration", Field("billingDuration", BillingDurationType, resolve = _.value.billingDuration)),
      ReplaceField("subscriptionProcess", Field("subscriptionProcess", SubscriptionProcessType, resolve = _.value.subscriptionProcess)),
      ReplaceField("integrationProcess", Field("integrationProcess", IntegrationProcessType, resolve = _.value.integrationProcess)),
      ReplaceField("otoroshiTarget",
        Field("otoroshiTarget", OptionType(OtoroshiTargetType), resolve = _.value.otoroshiTarget)),
      ReplaceField("visibility",
        Field("visibility", UsagePlanVisibilityType, resolve = _.value.visibility)),
      ReplaceField("authorizedTeams",
        Field("authorizedTeams", ListType(StringType /*TeamIdType*/), resolve = _.value.authorizedTeams.map(_.value)))
    )

    val PayPerUseType = deriveObjectType[Unit, UsagePlan.PayPerUse](
      Interfaces(UsagePlanInterfaceType),
      ReplaceField("currency", Field("currency", CurrencyType, resolve = _.value.currency)),
      ReplaceField("id", Field("_id", StringType /*UsagePlanIdType*/, resolve = _.value.id.value)),
      ReplaceField("trialPeriod", Field("trialPeriod", OptionType(BillingDurationType), resolve = _.value.trialPeriod)),
      ReplaceField("billingDuration", Field("billingDuration", BillingDurationType, resolve = _.value.billingDuration)),
      ReplaceField("subscriptionProcess", Field("subscriptionProcess", SubscriptionProcessType, resolve = _.value.subscriptionProcess)),
      ReplaceField("integrationProcess", Field("integrationProcess", IntegrationProcessType, resolve = _.value.integrationProcess)),
      ReplaceField("otoroshiTarget",
        Field("otoroshiTarget", OptionType(OtoroshiTargetType), resolve = _.value.otoroshiTarget)),
      ReplaceField("visibility",
        Field("visibility", UsagePlanVisibilityType, resolve = _.value.visibility)),
      ReplaceField("authorizedTeams",
        Field("authorizedTeams", ListType(StringType /*TeamIdType*/), resolve = _.value.authorizedTeams.map(_.value)))
    )

    val OtoroshiApiKeyType = deriveObjectType[Unit, OtoroshiApiKey]()
    val SwaggerAccessType = deriveObjectType[Unit, SwaggerAccess](
      ReplaceField("headers",
        Field("headers", MapType, resolve = _.value.headers))
    )
    val ApiDocumentationType = ObjectType(
      "ApiDocumentation",
      "ApiDocumentation description",
      fields[Unit, ApiDocumentation](
        Field("id", StringType /*ApiDocumentationIdType*/, resolve = _.value.id.value),
        Field("tenant", StringType /*TenantIdType*/, resolve = _.value.tenant.value),
        Field("pages", ListType(StringType /*ApiDocumentationPageIdType*/), resolve = _.value.pages.map(_.value)),
        Field("lastModificationAt", DateTimeType, resolve = _.value.lastModificationAt)
      )
    )
    val ApiDocumentationPageType = deriveObjectType[Unit, ApiDocumentationPage](
      ReplaceField("id", Field("_id", StringType /*ApiDocumentationPageIdType*/, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", StringType /*TenantIdType*/, resolve = _.value.tenant.value)),
      ReplaceField("lastModificationAt", Field("lastModificationAt", DateTimeType, resolve = _.value.lastModificationAt)),
      ReplaceField("remoteContentHeaders", Field("remoteContentHeaders", MapType, resolve = _.value.remoteContentHeaders)),
      AddFields(
        Field("_humanReadableId", StringType, resolve = _.value.humanReadableId)
      )
    )
    val ApiPostType = deriveObjectType[Unit, ApiPost](
      ReplaceField("id", Field("_id", StringType /*ApiPostIdType*/, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", StringType /*TenantIdType*/, resolve = _.value.tenant.value)),
      ReplaceField("lastModificationAt", Field("lastModificationAt", DateTimeType, resolve = _.value.lastModificationAt)),
      AddFields(
        Field("_humanReadableId", StringType, resolve = _.value.humanReadableId)
      )
    )
    val TwoFactorAuthenticationType = deriveObjectType[Unit, TwoFactorAuthentication]()
    val ApiIssueTagType = deriveObjectType[Unit, ApiIssueTag](
      ReplaceField("id", Field("_id", StringType /*ApiIssueTagIdType*/, resolve = _.value.id.value))
    )
    val ApiIssueCommentType = deriveObjectType[Unit, ApiIssueComment](
      ReplaceField("by", Field("by", StringType /*UserIdType*/, resolve = _.value.by.value)),
      ReplaceField("createdAt", Field("createdAt", DateTimeType, resolve = _.value.createdAt)),
      ReplaceField("lastModificationAt", Field("lastModificationAt", DateTimeType, resolve = _.value.lastModificationAt))
    )
    val ApiIssueType = deriveObjectType[Unit, ApiIssue](
      ReplaceField("id", Field("_id", StringType /*ApiIssueIdType*/, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", StringType /*TenantIdType*/, resolve = _.value.tenant.value)),
      ReplaceField("tags", Field("tags", ListType(StringType /*ApiIssueTagIdType*/), resolve = _.value.tags.toSeq.map(_.value))),
      ReplaceField("createdAt", Field("createdAt", DateTimeType, resolve = _.value.createdAt)),
      ReplaceField("closedAt", Field("closedAt", OptionType(DateTimeType), resolve = _.value.closedAt)),
      ReplaceField("by", Field("by", StringType /*UserIdType*/, resolve = _.value.by.value)),
      ReplaceField("comments", Field("comments", ListType(ApiIssueCommentType), resolve = _.value.comments)),
      ReplaceField("lastModificationAt", Field("lastModificationAt", DateTimeType, resolve = _.value.lastModificationAt)),
      AddFields(
        Field("_humanReadableId", StringType, resolve = _.value.humanReadableId)
      )
    )
    val UserInvitationType = deriveObjectType[Unit, UserInvitation](
      ReplaceField("createdAt", Field("createdAt", DateTimeType, resolve = _.value.createdAt)),
    )
    val UserType: ObjectType[Unit, User] =
      deriveObjectType[Unit, User](
        ObjectTypeName("User"),
        ObjectTypeDescription("A user of daikoku"),
        ReplaceField("id",
          Field("id", StringType /*UserIdType*/, resolve = _.value.id.value)),
        ReplaceField("tenants",
          Field("tenants", ListType(StringType /*TenantIdType*/), resolve = ctx => ctx.value.tenants.toSeq.map(_.value))),
        ReplaceField("origins",
          Field("origins", ListType(AuthProviderType), resolve = _.value.origins.toSeq)),
        ReplaceField("lastTenant",
          Field("lastTenant", OptionType(StringType /*TenantIdType*/), resolve = _.value.lastTenant.map(_.value))),
        ReplaceField("hardwareKeyRegistrations",
          Field("hardwareKeyRegistrations", ListType(JsonType), resolve = _.value.hardwareKeyRegistrations)),
        ReplaceField("starredApis",
          Field("starredApis", ListType(StringType /*ApiIdType*/), resolve = _.value.starredApis.toSeq.map(_.value))),
        ReplaceField("twoFactorAuthentication",
          Field("twoFactorAuthentication", OptionType(TwoFactorAuthenticationType), resolve = _.value.twoFactorAuthentication)),
        ReplaceField("invitation",
          Field("invitation", OptionType(UserInvitationType), resolve = _.value.invitation)),
        ReplaceField("metadata",
          Field("metadata", MapType, resolve = _.value.metadata)),
        AddFields(
          Field("_humanReadableId", StringType, resolve = _.value.humanReadableId)
        )
      )

    val TeamPermissionType = InterfaceType(
      "TeamPermission",
      "TeamPermission description",
      () => fields[Unit, TeamPermission](
        Field("name", StringType, resolve = _.value.name)
      )
    )

    val UserWithPermissionType = ObjectType(
      "UserWithPermission",
      "UserWithPermission description",
      fields[Unit, UserWithPermission](
        Field("userId", StringType /*UserIdType*/, resolve = _.value.userId.value),
        Field("teamPermission", TeamPermissionType, resolve = _.value.teamPermission)
      )
    )

    val TeamApiKeyVisibilityType = InterfaceType(
      "TeamApiKeyVisibility",
      "TeamApiKeyVisibility description",
      () => fields[Unit, TeamApiKeyVisibility](
        Field("name", StringType, resolve = _.value.name)
      )
    )

    val TeamObjectType = deriveObjectType[Unit, Team](
      ReplaceField("id", Field("_id", StringType /*TeamIdType*/, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", StringType /*TenantIdType*/, resolve = _.value.tenant.value)),
      ReplaceField("users", Field("users", ListType(UserWithPermissionType), resolve = _.value.users.toSeq)),
      ReplaceField("subscriptions", Field("subscriptions", ListType(StringType /*ApiSubscriptionIdType*/), resolve = _.value.subscriptions.map(_.value))),
      ReplaceField("authorizedOtoroshiGroups", Field("authorizedOtoroshiGroups", ListType(StringType /*OtoroshiGroupType*/), resolve = _.value.authorizedOtoroshiGroups.toSeq.map(_.value))),
      ReplaceField("apiKeyVisibility", Field("apiKeyVisibility", OptionType(TeamApiKeyVisibilityType), resolve = _.value.apiKeyVisibility)),
      ReplaceField("metadata", Field("metadata", MapType, resolve = _.value.metadata)),
      ReplaceField("type", Field("type", StringType, resolve = _.value.`type`.name)),
      AddFields(
        Field("_humanReadableId", StringType, resolve = _.value.humanReadableId)
      )
    )

    val TestingAuthType = InterfaceType(
      "TestingAuth",
      "TestingAuth description",
      () => fields[Unit, TestingAuth](
        Field("name", StringType, resolve = _.value.name)
      )
    )

    val TestingConfigType = deriveObjectType[Unit, TestingConfig](
      ReplaceField("otoroshiSettings", Field("otoroshiSettings", StringType /*OtoroshiSettingsIdType*/, resolve = _.value.otoroshiSettings.value)),
      ReplaceField("serviceGroup", Field("serviceGroup", StringType /*OtoroshiServiceGroupIdType*/, resolve = _.value.serviceGroup.value)),
      ReplaceField("api", Field("api", StringType /*ApiIdType*/, resolve = _.value.api.value)),
      ReplaceField("customMetadata", Field("customMetadata", OptionType(JsonType), resolve = _.value.customMetadata))
    )

    val TestingType = deriveObjectType[Unit, Testing](
      ReplaceField("auth", Field("auth", TestingAuthType, resolve = _.value.auth)),
      ReplaceField("config", Field("config", OptionType(TestingConfigType), resolve = _.value.config))
    )

    val teamsFetcher = Fetcher(
      (ctx: (DataStore, DaikokuActionContext[JsValue]), teams: Seq[TeamId]) => Future.sequence(teams.map(teamId =>
        ctx._1.teamRepo.forTenant(ctx._2.tenant).findById(teamId)))
        .map(teams => teams.flatten)
      )(HasId[Team, TeamId](_.id))

    val ApiType = deriveObjectType[Unit, Api](
      ReplaceField("id", Field("_id", StringType /*ApiIdType*/, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", StringType /*TenantIdType*/, resolve = _.value.tenant.value)),
      ReplaceField("team", Field("team", TeamObjectType, resolve = ctx => teamsFetcher.defer(ctx.value.team))),
      ReplaceField("currentVersion", Field("currentVersion", StringType /*VersionType*/, resolve = _.value.currentVersion.value)),
      ReplaceField("supportedVersions", Field("supportedVersions", ListType(StringType /*VersionType*/), resolve = _.value.supportedVersions.toSeq.map(_.value))),
      ReplaceField("lastUpdate", Field("lastUpdate", DateTimeType, resolve = _.value.lastUpdate)),
      ReplaceField("testing", Field("testing", TestingType, resolve = _.value.testing)),
      ReplaceField("documentation", Field("documentation", ApiDocumentationType, resolve = _.value.documentation)),
      ReplaceField("swagger", Field("swagger", OptionType(SwaggerAccessType), resolve = _.value.swagger)),
      ReplaceField("visibility", Field("visibility", ApiVisibilityType, resolve = _.value.visibility)),
      ReplaceField("possibleUsagePlans",
        Field("possibleUsagePlans", ListType(UsagePlanInterfaceType), resolve = _.value.possibleUsagePlans,
          possibleTypes = List(AdminUsagePlanType, FreeWithQuotasUsagePlanType, FreeWithoutQuotasUsagePlanType,
            PayPerUseType, QuotasWithLimitsType, QuotasWithoutLimitsType))),
      ReplaceField("defaultUsagePlan", Field("defaultUsagePlan", StringType /*UsagePlanIdType*/, resolve = _.value.defaultUsagePlan.value)),
      ReplaceField("authorizedTeams", Field("authorizedTeams", ListType(StringType /*TeamIdType*/), resolve = _.value.authorizedTeams.map(_.value))),
      ReplaceField("posts", Field("posts", ListType(StringType /*ApiPostIdType*/), resolve = _.value.posts.map(_.value))),
      ReplaceField("issues", Field("issues", ListType(StringType /*ApiIssueIdType*/), resolve = _.value.issues.map(_.value))),
      ReplaceField("issuesTags", Field("issuesTags", ListType(ApiIssueTagType), resolve = _.value.issuesTags.toSeq)),
      ReplaceField("parent", Field("parent", OptionType(StringType /*ApiIdType*/), resolve = _.value.parent.map(_.value))),
      ReplaceField("tags", Field("tags", ListType(StringType), resolve = _.value.tags.toSeq)),
      ReplaceField("categories", Field("categories", ListType(StringType), resolve = _.value.categories.toSeq)),
      AddFields(
        Field("_humanReadableId", StringType, resolve = _.value.humanReadableId)
      )
    )

    case class AuthorizationApi(team: String, authorized: Boolean, pending: Boolean)
    val AuthorizationApiType = deriveObjectType[Unit, AuthorizationApi]()

    case class GraphQLApi(api: Api, authorizations: Seq[AuthorizationApi] = Seq.empty)

    val GraphQLApiType = deriveObjectType[Unit, GraphQLApi](
      ReplaceField("api", Field("api", ApiType, resolve = _.value.api)),
      ReplaceField("authorizations", Field("authorizations", ListType(AuthorizationApiType), resolve = _.value.authorizations))
    )

    val ApiKeyRotationType = deriveObjectType[Unit, ApiKeyRotation]()
    val ApiSubscriptionRotationType = deriveObjectType[Unit, ApiSubscriptionRotation]()
    val ApiSubscriptionType = deriveObjectType[Unit, ApiSubscription](
      ReplaceField("id", Field("_id", StringType /*ApiSubscriptionIdType*/, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", StringType /*TenantIdType*/, resolve = _.value.tenant.value)),
      ReplaceField("apiKey", Field("apiKey", OtoroshiApiKeyType, resolve = _.value.apiKey)),
      ReplaceField("plan", Field("plan", StringType /*UsagePlanIdType*/, resolve = _.value.plan.value)),
      ReplaceField("createdAt", Field("createdAt", DateTimeType, resolve = _.value.createdAt)),
      ReplaceField("team", Field("team", StringType /*TeamIdType*/, resolve = _.value.team.value)),
      ReplaceField("api", Field("api", StringType /*ApiIdType*/, resolve = _.value.api.value)),
      ReplaceField("by", Field("by", StringType /*UserIdType*/, resolve = _.value.by.value)),
      ReplaceField("rotation", Field("rotation", OptionType(ApiSubscriptionRotationType), resolve = _.value.rotation)),
      ReplaceField("customMetadata", Field("customMetadata", OptionType(JsonType), resolve = _.value.customMetadata)),
      ReplaceField("parent", Field("parent", OptionType(StringType /*ApiSubscriptionIdType*/), resolve = _.value.parent.map(_.value))),
    )

    val ActualOtoroshiApiKey = deriveObjectType[Unit, ActualOtoroshiApiKey](
      ReplaceField("authorizedEntities", Field("authorizedEntities", AuthorizedEntitiesType, resolve = _.value.authorizedEntities)),
      ReplaceField("tags", Field("tags", ListType(StringType), resolve = _.value.tags)),
      ReplaceField("metadata", Field("metadata", MapType, resolve = _.value.metadata)),
      ReplaceField("restrictions", Field("restrictions", ApiKeyRestrictionsType, resolve = _.value.restrictions)),
      ReplaceField("rotation", Field("rotation", OptionType(ApiKeyRotationType), resolve = _.value.rotation))
    )

    val NotificationStatusType: InterfaceType[Unit, NotificationStatus] = InterfaceType(
      "NotificationStatus",
      "NotificationStatus description",
      () => fields[Unit, NotificationStatus](
        Field("_generated", StringType, resolve = _.value.toString) // TODO - can't generate interface without fields
      )
    )

    val NotificationStatusAcceptedType = deriveObjectType[Unit, NotificationStatus.Accepted](
      Interfaces(NotificationStatusType),
      ReplaceField("date",
        Field("date", DateTimeType, resolve = _.value.date)
      )
    )

    val NotificationStatusRejectedType = deriveObjectType[Unit, NotificationStatus.Rejected](
      Interfaces(NotificationStatusType),
      ReplaceField("date",
        Field("date", DateTimeType, resolve = _.value.date)
      )
    )

    val NotificationStatusPendingType = deriveObjectType[Unit, NotificationStatus.Pending](
      Interfaces(NotificationStatusType),
      AddFields(
        Field("_generated", StringType, resolve = _.value.toString) // TODO - can't generate interface without fields
      )
    )

    val NotificationActionType: InterfaceType[Unit, NotificationAction] = InterfaceType(
      "NotificationAction",
      "NotificationAction description",
      () => fields[Unit, NotificationAction](
        Field("_generated", StringType, resolve = _.value.toString) // TODO - can't generate interface without fields
      )
    )
    val OtoroshiSyncNotificationActionType: InterfaceType[Unit, OtoroshiSyncNotificationAction] = InterfaceType(
      "OtoroshiSyncNotificationAction",
      "OtoroshiSyncNotificationAction description",
      () => fields[Unit, OtoroshiSyncNotificationAction](
        Field("message", StringType, resolve = _.value.message)
      )
    )

    val ApiAccessType = ObjectType(
      "ApiAccess",
      "ApiAccess description",
      interfaces[Unit, ApiAccess](NotificationActionType),
      fields[Unit, ApiAccess](
        Field("api", StringType /*ApiIdType*/, resolve = _.value.api.value),
        Field("team", StringType /*TeamIdType*/, resolve = _.value.team.value)
      )
    )
    val TeamAccessType = ObjectType(
      "TeamAccess",
      "TeamAccess description",
      interfaces[Unit, TeamAccess](NotificationActionType),
      fields[Unit, TeamAccess](
        Field("team", StringType /*TeamIdType*/, resolve = _.value.team.value)
      )
    )
    val TeamInvitationType = ObjectType(
      "TeamInvitation",
      "TeamInvitation description",
      interfaces[Unit, TeamInvitation](NotificationActionType),
      fields[Unit, TeamInvitation](
        Field("team", StringType /*TeamIdType*/, resolve = _.value.team.value),
        Field("user", StringType /*UserIdType*/, resolve = _.value.user.value)
      )
    )
    val ApiSubscriptionDemandType = ObjectType(
      "ApiSubscriptionDemand",
      "ApiSubscriptionDemand description",
      interfaces[Unit, ApiSubscriptionDemand](NotificationActionType),
      fields[Unit, ApiSubscriptionDemand](
        Field("api", StringType /*ApiIdType*/, resolve = _.value.api.value),
        Field("team", StringType /*TeamIdType*/, resolve = _.value.team.value),
        Field("plan", StringType /*UsagePlanIdType*/, resolve = _.value.plan.value),
        Field("parentSubscriptionId", OptionType(StringType /*ApiSubscriptionIdType*/), resolve = _.value.parentSubscriptionId.map(_.value))
      )
    )
    val OtoroshiSyncSubscriptionErrorType = ObjectType(
      "OtoroshiSyncSubscriptionError",
      "OtoroshiSyncSubscriptionError description",
      interfaces[Unit, OtoroshiSyncSubscriptionError](OtoroshiSyncNotificationActionType),
      fields[Unit, OtoroshiSyncSubscriptionError](
        Field("subscription", ApiSubscriptionType, resolve = _.value.subscription),
        Field("message", StringType, resolve = _.value.message)
      )
    )
    val OtoroshiSyncApiErrorType = ObjectType(
      "OtoroshiSyncApiError",
      "OtoroshiSyncApiError description",
      interfaces[Unit, OtoroshiSyncApiError](OtoroshiSyncNotificationActionType),
      fields[Unit, OtoroshiSyncApiError](
        Field("api", ApiType, resolve = _.value.api),
        Field("message", StringType, resolve = _.value.message)
      )
    )
    val ApiKeyDeletionInformationType = deriveObjectType[Unit, ApiKeyDeletionInformation](
      Interfaces(NotificationActionType)
    )
    val ApiKeyRotationInProgressType = deriveObjectType[Unit, ApiKeyRotationInProgress](
      Interfaces(NotificationActionType)
    )
    val ApiKeyRotationEndedType = deriveObjectType[Unit, ApiKeyRotationEnded](
      Interfaces(NotificationActionType)
    )
    val ApiKeyRefreshType = deriveObjectType[Unit, ApiKeyRefresh](
      Interfaces(NotificationActionType)
    )
    val NewPostPublishedType = deriveObjectType[Unit, NewPostPublished](
      Interfaces(NotificationActionType)
    )
    val NewIssueOpenType = deriveObjectType[Unit, NewIssueOpen](
      Interfaces(NotificationActionType)
    )
    val NewCommentOnIssueType = deriveObjectType[Unit, NewCommentOnIssue](
      Interfaces(NotificationActionType)
    )

    val NotificationInterfaceType: InterfaceType[Unit, NotificationType] = InterfaceType(
      "NotificationType",
      "NotificationType description",
      () => fields[Unit, NotificationType](
        Field("value", StringType, resolve = _.value.value)
      )
    )

    val NotificationType = deriveObjectType[Unit, Notification](
      ReplaceField("id", Field("_id", StringType /*NotificationIdType*/, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", StringType /*TenantIdType*/, resolve = _.value.tenant.value)),
      ReplaceField("team", Field("team", OptionType(StringType /*TeamIdType*/), resolve = _.value.team.map(_.value))),
      ReplaceField("sender", Field("sender", UserType, resolve = _.value.sender)),
      ReplaceField("date", Field("date", DateTimeType, resolve = _.value.date)),
      ReplaceField("notificationType", Field("notificationType", NotificationInterfaceType, resolve = _.value.notificationType)),
      ReplaceField("status", Field("status", NotificationStatusType, resolve = _.value.status, possibleTypes = List(NotificationStatusAcceptedType, NotificationStatusRejectedType, NotificationStatusPendingType))),
      ReplaceField("action", Field("action", NotificationActionType, resolve = _.value.action, possibleTypes = List(ApiAccessType, TeamAccessType, TeamInvitationType, ApiSubscriptionDemandType, OtoroshiSyncSubscriptionErrorType, OtoroshiSyncApiErrorType,
        ApiKeyDeletionInformationType, ApiKeyRotationInProgressType, ApiKeyRotationEndedType, ApiKeyRefreshType, NewPostPublishedType, NewIssueOpenType, NewCommentOnIssueType
      ))),
    )

    val FiniteDurationType = ObjectType(
      "FiniteDuration",
      "FiniteDuration description",
      fields[Unit, FiniteDuration](
        Field("length", LongType, resolve = _.value.length),
        Field("unit", TimeUnitType, resolve = _.value.unit),
      )
    )

    val UserSessionType = deriveObjectType[Unit, UserSession](
      ReplaceField("id", Field("_id", StringType /*DatastoreIdType*/, resolve = _.value.id.value)),
      ReplaceField("userId", Field("userId", StringType /*UserIdType*/, resolve = _.value.userId.value)),
      ReplaceField("sessionId", Field("sessionId", StringType /*UserSessionIdType*/, resolve = _.value.sessionId.value)),
      ReplaceField("impersonatorId", Field("impersonatorId", OptionType(StringType /*UserIdType*/), resolve = _.value.impersonatorId.map(_.value))),
      ReplaceField("impersonatorSessionId", Field("impersonatorSessionId", OptionType(StringType /*UserSessionIdType*/), resolve = _.value.impersonatorSessionId.map(_.value))),
      ReplaceField("created", Field("created", DateTimeType, resolve = _.value.created)),
      ReplaceField("ttl", Field("ttl", FiniteDurationType, resolve = _.value.ttl)),
      ReplaceField("expires", Field("expires", DateTimeType, resolve = _.value.expires))
    )

    val ApiKeyGlobalConsumptionInformationsType = deriveObjectType[Unit, ApiKeyGlobalConsumptionInformations]()
    val ApiKeyQuotasType = deriveObjectType[Unit, ApiKeyQuotas]()
    val ApiKeyBillingType = deriveObjectType[Unit, ApiKeyBilling]()

    val ApiKeyConsumptionType = deriveObjectType[Unit, ApiKeyConsumption](
      ReplaceField("id", Field("_id", StringType /*DatastoreIdType*/, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", StringType /*TenantIdType*/, resolve = _.value.tenant.value)),
      ReplaceField("team", Field("team", StringType /*TeamIdType*/, resolve = _.value.team.value)),
      ReplaceField("api", Field("api", StringType /*ApiIdType*/, resolve = _.value.api.value)),
      ReplaceField("plan", Field("plan", StringType /*UsagePlanIdType*/, resolve = _.value.plan.value)),
      ReplaceField("globalInformations", Field("globalInformations", ApiKeyGlobalConsumptionInformationsType, resolve = _.value.globalInformations)),
      ReplaceField("quotas", Field("quotas", ApiKeyQuotasType, resolve = _.value.quotas)),
      ReplaceField("billing", Field("billing", ApiKeyBillingType, resolve = _.value.billing)),
      ReplaceField("from", Field("from", DateTimeType, resolve = _.value.from)),
      ReplaceField("to", Field("to", DateTimeType, resolve = _.value.to))
    )

    val PasswordResetType = deriveObjectType[Unit, PasswordReset](
      ReplaceField("id", Field("_id", StringType /*DatastoreIdType*/, resolve = _.value.id.value)),
      ReplaceField("user", Field("user", StringType /*UserIdType*/, resolve = _.value.user.value)),
      ReplaceField("creationDate", Field("creationDate", DateTimeType, resolve = _.value.creationDate)),
      ReplaceField("validUntil", Field("validUntil", DateTimeType, resolve = _.value.validUntil))
    )
    val AccountCreationType = deriveObjectType[Unit, AccountCreation](
      ReplaceField("id", Field("_id", StringType /*DatastoreIdType*/, resolve = _.value.id.value)),
      ReplaceField("creationDate", Field("creationDate", DateTimeType, resolve = _.value.creationDate)),
      ReplaceField("validUntil", Field("validUntil", DateTimeType, resolve = _.value.validUntil))
    )
    val TranslationType = deriveObjectType[Unit, Translation](
      ReplaceField("id", Field("_id", StringType /*DatastoreIdType*/, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", StringType /*TenantIdType*/, resolve = _.value.tenant.value)),
      ReplaceField("lastModificationAt", Field("lastModificationAt", OptionType(DateTimeType), resolve = _.value.lastModificationAt))
    )
    val EvolutionType = deriveObjectType[Unit, Evolution](
      ReplaceField("id", Field("_id", StringType /*DatastoreIdType*/, resolve = _.value.id.value)),
      ReplaceField("date", Field("date", DateTimeType, resolve = _.value.date))
    )

    val MessageIntefaceType: InterfaceType[Unit, MessageType] = InterfaceType(
      "MessageType",
      "MessageType description",
      () => fields[Unit, MessageType](
        Field("name", StringType, resolve = _.value.value.value)
      ))

    val MessageType = deriveObjectType[Unit, Message](
      ReplaceField("id", Field("_id", StringType /*DatastoreIdType*/, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", StringType /*TenantIdType*/, resolve = _.value.tenant.value)),
      ReplaceField("messageType", Field("messageType", MessageIntefaceType, resolve = _.value.messageType)),
      ReplaceField("participants", Field("participants", ListType(StringType /*UserIdType*/), resolve = _.value.participants.toSeq.map(_.value))),
      ReplaceField("readBy", Field("readBy", ListType(StringType /*UserIdType*/), resolve = _.value.readBy.toSeq.map(_.value))),
      ReplaceField("chat", Field("chat", StringType /*UserIdType*/, resolve = _.value.chat.value)),
      ReplaceField("date", Field("date", DateTimeType, resolve = _.value.date)),
      ReplaceField("sender", Field("sender", StringType /*UserIdType*/, resolve = _.value.sender.value)),
      ReplaceField("closed", Field("closed", OptionType(DateTimeType), resolve = _.value.closed)),
    )

    val AuthorizationLevelType: InterfaceType[Unit, AuthorizationLevel] = InterfaceType(
      "AuthorizationLevel",
      "AuthorizationLevel description",
      () => fields[Unit, AuthorizationLevel](
        Field("value", StringType, resolve = _.value.value)
      )
    )

    /*val AuthorizationLevelEnum = EnumType(
      "AuthorizationLevelEnum",
      Some("AuthorizationLevel enum description"),
      List(
        EnumValue(AuthorizationLevel.NotAuthorized.value, value = AuthorizationLevel.NotAuthorized.value),
        EnumValue(AuthorizationLevel.AuthorizedUberPublic.value, value = AuthorizationLevel.AuthorizedUberPublic.value),
        EnumValue(AuthorizationLevel.AuthorizedPublic.value, value = AuthorizationLevel.AuthorizedPublic.value),
        EnumValue(AuthorizationLevel.AuthorizedTeamMember.value, value = AuthorizationLevel.AuthorizedTeamMember.value),
        EnumValue(AuthorizationLevel.AuthorizedTeamApiEditor.value, value = AuthorizationLevel.AuthorizedTeamApiEditor.value),
        EnumValue(AuthorizationLevel.AuthorizedTeamAdmin.value, value = AuthorizationLevel.AuthorizedTeamAdmin.value),
        EnumValue(AuthorizationLevel.AuthorizedTenantAdmin.value, value = AuthorizationLevel.AuthorizedTenantAdmin.value),
        EnumValue(AuthorizationLevel.AuthorizedDaikokuAdmin.value, value = AuthorizationLevel.AuthorizedDaikokuAdmin.value),
        EnumValue(AuthorizationLevel.AuthorizedSelf.value, value = AuthorizationLevel.AuthorizedSelf.value),
        EnumValue(AuthorizationLevel.AuthorizedJob.value, value = AuthorizationLevel.AuthorizedJob.value)
      ))

    val AuditEventType: InterfaceType[Unit, AuditEvent] = InterfaceType(
      "AuditEvent",
      "AuditEvent description",
      () => fields[Unit, AuditEvent](
        Field("message", StringType, resolve = _.value.message)
      )
    )
    val AuditTrailEventType = deriveObjectType[Unit, AuditTrailEvent](
      Interfaces(AuditEventType)
    )
    val JobEventType = deriveObjectType[Unit, JobEvent](
      Interfaces(AuditEventType)
    )
    val AlertEventType = deriveObjectType[Unit, AlertEvent](
      Interfaces(AuditEventType)
    )
    val ApiKeyRotationEventType = deriveObjectType[Unit, ApiKeyRotationEvent](
      Interfaces(AuditEventType),
      ReplaceField("subscription",
        Field("subscription", ApiSubscriptionIdType, resolve = _.value.subscription)
      )
    )
    val TenantAuditEventType = deriveObjectType[Unit, TenantAuditEvent](
      ReplaceField("evt", Field("evt", AuditEventType, resolve = _.value.evt, possibleTypes = List(
        AuditTrailEventType, JobEventType, AlertEventType, ApiKeyRotationEventType
      ))),
      ReplaceField("tenant", Field("tenant", TenantType, resolve = _.value.tenant)),
      ReplaceField("user", Field("user", UserType, resolve = _.value.user)),
      ReplaceField("impersonator", Field("impersonator", OptionType(UserType), resolve = _.value.impersonator)),
      ReplaceField("ctx", Field("ctx", MapType, resolve = _.value.ctx.toMap.asInstanceOf[Map[String, String]])),
      ReplaceField("authorized", Field("authorized", AuthorizationLevelType, resolve = _.value.authorized)),
      ReplaceField("details", Field("details", JsonType, resolve = _.value.details))
    )*/

    case class UserAuditEvent(id: UserId, name: String, email: String, isDaikokuAdmin: Boolean)
    val UserAuditEventType = deriveObjectType[Unit, UserAuditEvent](
      ReplaceField("id", Field("_id", StringType /*UserIdType*/, resolve = _.value.id.value))
    )

    val UserAuditEventTypeReader = new Format[UserAuditEvent] {
      override def reads(json: JsValue): JsResult[UserAuditEvent] = JsSuccess(
            UserAuditEvent(
              id = (json \ "id").as(UserIdFormat),
              name = (json \ "name").as[String],
              email = (json \ "email").as[String],
              isDaikokuAdmin = (json \ "isDaikokuAdmin").asOpt[Boolean].getOrElse(false)
            ))
      override def writes(o: UserAuditEvent): JsValue = Json.obj()
    }

    case class TenantAuditEvent(id: TenantId, name: String)
    val TenantAuditEventType = deriveObjectType[Unit, TenantAuditEvent](
      ReplaceField("id", Field("_id", StringType /*TenantIdType*/, resolve = _.value.id.value))
    )

    val TenantAuditEventTypeReader = new Format[TenantAuditEvent] {
      override def reads(json: JsValue): JsResult[TenantAuditEvent] = JsSuccess(
        TenantAuditEvent(
          id = (json \ "id").as(TenantIdFormat),
          name = (json \ "name").as[String]
        ))
      override def writes(o: TenantAuditEvent): JsValue = Json.obj()
    }

    val AuditEventType = ObjectType[Unit, JsObject](
      "AuditEvent",
      () => fields[Unit, JsObject](
        Field("event_id", OptionType(StringType), resolve = ctx => (ctx.value \ "@id").asOpt[String]),
        Field("event_type", OptionType(StringType), resolve = ctx => (ctx.value \ "@type").asOpt[String]),
        Field("event_userId", OptionType(StringType), resolve = ctx => (ctx.value \ "@userId").asOpt[String]),
        Field("event_tenantId", OptionType(StringType), resolve = ctx => (ctx.value \ "@tenantId").asOpt[String]),
        Field("event_timestamp", OptionType(StringType), resolve = ctx => (ctx.value \ "@timestamp").asOpt[String]),
        Field("id", OptionType(StringType), resolve = ctx => (ctx.value \ "_id").asOpt[String]),
        Field("url", OptionType(StringType), resolve = ctx => (ctx.value \ "url").asOpt[String]),
        Field("user", OptionType(UserAuditEventType), resolve = ctx => (ctx.value \ "user").asOpt(UserAuditEventTypeReader)),
        Field("verb", OptionType(StringType), resolve = ctx => (ctx.value \ "verb").asOpt[String]),
        Field("tenant", OptionType(TenantAuditEventType), resolve = ctx => (ctx.value \ "tenant").asOpt(TenantAuditEventTypeReader)),
        Field("_tenant", OptionType(StringType), resolve = ctx => (ctx.value \ "_tenant").asOpt[String]),
        Field("message", OptionType(StringType), resolve = ctx => (ctx.value \ "message").asOpt[String]),
        Field("authorized", OptionType(StringType), resolve = ctx => (ctx.value \ "authorized").asOpt[String])
      )
    )

    val ID: Argument[String] = Argument("id", StringType, description = "id of element")
    val TEAM_ID: Argument[String] = Argument("teamId", StringType, description = "id of the team")

    def teamFields(): List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] = List(
      Field("team", OptionType(TeamObjectType), arguments = List(ID),
        resolve = ctx => ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant).findById(ctx arg ID)),
      Field("teams", ListType(TeamObjectType), resolve = ctx => ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant).findAll()),
      Field("myTeams", ListType(TeamObjectType),
        resolve = ctx =>
          _UberPublicUserAccess(AuditTrailEvent("@{user.name} has accessed his team list"))(ctx.ctx._2) {
            ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant)
              .findNotDeleted(Json.obj("users.userId" -> (ctx.ctx._2.user.id.value)))
              .map(teams => teams.sortWith((a, b) => a.name.compareToIgnoreCase(b.name) < 0))
          }.map {
            case Left(value) => value
            case Right(r) => throw NotAuthorizedError(r.toString)
          })
    )

    def getVisibleApis(ctx: Context[(DataStore, DaikokuActionContext[JsValue]), Unit], teamId: Option[String] = None) = {
      _UberPublicUserAccess(AuditTrailEvent(s"@{user.name} has accessed the list of visible apis"))(ctx.ctx._2) {
        val teamRepo = env.dataStore.teamRepo.forTenant(ctx.ctx._2.tenant)
        (teamId match {
          case None => teamRepo.findAllNotDeleted()
          case Some(id) => teamRepo.find(Json.obj("id" -> id))
        })
          .map(teams => if (ctx.ctx._2.user.isDaikokuAdmin) teams else teams.filter(team => team.users.exists(u => u.userId == ctx.ctx._2.user.id)))
          .flatMap(teams => {
            val teamFilter = Json.obj("team" -> Json.obj("$in" -> JsArray(teams.map(_.id.asJson))))
            val tenant = ctx.ctx._2.tenant
            val user = ctx.ctx._2.user
            for {
              myTeams <- env.dataStore.teamRepo.myTeams(tenant, user)
              apiRepo <- env.dataStore.apiRepo.forTenantF(tenant.id)
              myCurrentRequests <- if (user.isGuest) FastFuture.successful(Seq.empty) else env.dataStore.notificationRepo
                .forTenant(tenant.id)
                .findNotDeleted(
                  Json.obj("action.type" -> "ApiAccess",
                    "action.team" -> Json.obj("$in" -> JsArray(teams.map(_.id.asJson))),
                    "status.status" -> "Pending")
                )
              publicApis <- apiRepo.findNotDeleted(Json.obj("visibility" -> "Public"))
              almostPublicApis <- if (user.isGuest) FastFuture.successful(Seq.empty) else apiRepo.findNotDeleted(Json.obj("visibility" -> "PublicWithAuthorizations"))
              privateApis <- if (user.isGuest) FastFuture.successful(Seq.empty) else apiRepo.findNotDeleted(
                Json.obj(
                  "visibility" -> "Private",
                  "$or" -> Json.arr(
                    Json.obj("authorizedTeams" -> Json.obj("$in" -> JsArray(teams.map(_.id.asJson)))),
                    teamFilter
                  )))
              adminApis <- if (!user.isDaikokuAdmin) FastFuture.successful(Seq.empty) else apiRepo.findNotDeleted(
                Json.obj("visibility" -> ApiVisibility.AdminOnly.name) ++ teamFilter
              )
            } yield {
              val sortedApis: Seq[GraphQLApi] = (publicApis ++ almostPublicApis ++ privateApis).filter(api => api.published || myTeams.exists(api.team == _.id))
                .sortWith((a, b) => a.name.compareToIgnoreCase(b.name) < 0)
                .map(api => api
                  .copy(possibleUsagePlans = api.possibleUsagePlans.filter(p => p.visibility == UsagePlanVisibility.Public || myTeams.exists(_.id == api.team))))
                .map(api => {
                  val authorizations = teams
                    .filter(t => t.`type` != TeamType.Admin)
                    .map(team =>
                      AuthorizationApi(
                        team = team.id.value,
                        authorized = api.authorizedTeams.contains(team.id) || api.team == team.id,
                        pending = myCurrentRequests.exists(notif =>
                          notif.action.asInstanceOf[ApiAccess].team == team.id && notif.action.asInstanceOf[ApiAccess].api == api.id)
                      ))

                  api.visibility.name match {
                    case "PublicWithAuthorizations" | "Private" => GraphQLApi(api, authorizations)
                    case _ => GraphQLApi(api)
                  }
                })

              if (user.isDaikokuAdmin)
                adminApis.map(api => GraphQLApi(api, teams.map(team =>
                  AuthorizationApi(
                    team = team.id.value,
                    authorized = user.isDaikokuAdmin && team.`type` == TeamType.Personal && team.users.exists(u => u.userId == user.id),
                    pending = false
                  )
                ))) ++ sortedApis
              else
                sortedApis
            }
          })
      }.map {
        case Left(value) => value
        case Right(r) => throw NotAuthorizedError(r.toString)
      }
    }

    def apiFields(): List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] = List(
      Field("api", OptionType(ApiType), arguments = List(ID), resolve = ctx => ctx.ctx._1.apiRepo.forTenant(ctx.ctx._2.tenant).findById(ctx arg ID)),
      Field("apis", ListType(ApiType), resolve = ctx => ctx.ctx._1.apiRepo.forTenant(ctx.ctx._2.tenant).findAll()),
      Field("visibleApis", ListType(GraphQLApiType), resolve = ctx => {
        getVisibleApis(ctx)
      }),
      Field("visibleApisOfTeam", ListType(GraphQLApiType), arguments = TEAM_ID :: Nil, resolve = ctx => {
        getVisibleApis(ctx, Some(ctx.arg(TEAM_ID)))
      })
    )

    def allFields(): List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] = List(
      Field("user", OptionType(UserType), arguments = List(ID), resolve = ctx => ctx.ctx._1.userRepo.findById(ctx arg ID)),
      Field("users", ListType(UserType), resolve = ctx => ctx.ctx._1.userRepo.findAll()),

      Field("userSession", OptionType(UserSessionType), arguments = List(ID), resolve = ctx => ctx.ctx._1.userSessionRepo.findById(ctx arg ID)),
      Field("userSessions", ListType(UserSessionType), resolve = ctx => ctx.ctx._1.userSessionRepo.findAll()),

      Field("tenant", OptionType(TenantType), arguments = List(ID), resolve = ctx => ctx.ctx._1.tenantRepo.findById(ctx arg ID)),
      Field("tenants", ListType(TenantType), resolve = ctx => ctx.ctx._1.tenantRepo.findAll()),

      Field("passwordReset", OptionType(PasswordResetType), arguments = List(ID), resolve = ctx => ctx.ctx._1.passwordResetRepo.findById(ctx arg ID)),
      Field("passwordResets", ListType(PasswordResetType), resolve = ctx => ctx.ctx._1.passwordResetRepo.findAll()),

      Field("accountCreation", OptionType(AccountCreationType), arguments = List(ID), resolve = ctx => ctx.ctx._1.accountCreationRepo.findById(ctx arg ID)),
      Field("accountCreations", ListType(AccountCreationType), resolve = ctx => ctx.ctx._1.accountCreationRepo.findAll()),

      Field("translation", OptionType(TranslationType), arguments = List(ID), resolve = ctx => ctx.ctx._1.translationRepo.forTenant(ctx.ctx._2.tenant).findById(ctx arg ID)),
      Field("translations", ListType(TranslationType), resolve = ctx => ctx.ctx._1.translationRepo.forTenant(ctx.ctx._2.tenant).findAll()),

      Field("message", OptionType(MessageType), arguments = List(ID), resolve = ctx => ctx.ctx._1.messageRepo.forTenant(ctx.ctx._2.tenant).findById(ctx arg ID)),
      Field("messages", ListType(MessageType), resolve = ctx => ctx.ctx._1.messageRepo.forTenant(ctx.ctx._2.tenant).findAll()),

      Field("apiSubscription", OptionType(ApiSubscriptionType), arguments = List(ID), resolve = ctx => ctx.ctx._1.apiSubscriptionRepo.forTenant(ctx.ctx._2.tenant).findById(ctx arg ID)),
      Field("apiSubscriptions", ListType(ApiSubscriptionType), resolve = ctx => ctx.ctx._1.apiSubscriptionRepo.forTenant(ctx.ctx._2.tenant).findAll()),

      Field("apiDocumentationPage", OptionType(ApiDocumentationPageType), arguments = List(ID), resolve = ctx => ctx.ctx._1.apiDocumentationPageRepo.forTenant(ctx.ctx._2.tenant).findById(ctx arg ID)),
      Field("apiDocumentationPages", ListType(ApiDocumentationPageType), resolve = ctx => ctx.ctx._1.apiDocumentationPageRepo.forTenant(ctx.ctx._2.tenant).findAll()),

      Field("notification", OptionType(NotificationType), arguments = List(ID), resolve = ctx => ctx.ctx._1.notificationRepo.forTenant(ctx.ctx._2.tenant).findById(ctx arg ID)),
      Field("notifications", ListType(NotificationType), resolve = ctx => ctx.ctx._1.notificationRepo.forTenant(ctx.ctx._2.tenant).findAll()),

      Field("consumption", OptionType(ApiKeyConsumptionType), arguments = List(ID), resolve = ctx => ctx.ctx._1.consumptionRepo.forTenant(ctx.ctx._2.tenant).findById(ctx arg ID)),
      Field("consumptions", ListType(ApiKeyConsumptionType), resolve = ctx => ctx.ctx._1.consumptionRepo.forTenant(ctx.ctx._2.tenant).findAll()),

      Field("apiPost", OptionType(ApiPostType), arguments = List(ID), resolve = ctx => ctx.ctx._1.apiPostRepo.forTenant(ctx.ctx._2.tenant).findById(ctx arg ID)),
      Field("apiPosts", ListType(ApiPostType), resolve = ctx => ctx.ctx._1.apiPostRepo.forTenant(ctx.ctx._2.tenant).findAll()),

      Field("apiIssue", OptionType(ApiIssueType), arguments = List(ID), resolve = ctx => ctx.ctx._1.apiIssueRepo.forTenant(ctx.ctx._2.tenant).findById(ctx arg ID)),
      Field("apiIssues", ListType(ApiIssueType), resolve = ctx => ctx.ctx._1.apiIssueRepo.forTenant(ctx.ctx._2.tenant).findAll()),

      Field("evolution", OptionType(EvolutionType), arguments = List(ID), resolve = ctx => ctx.ctx._1.evolutionRepo.findById(ctx arg ID)),
      Field("evolutions", ListType(EvolutionType), resolve = ctx => ctx.ctx._1.evolutionRepo.findAll()),

      Field("auditEvent", OptionType(AuditEventType), arguments = List(ID),
        resolve = ctx => ctx.ctx._1.auditTrailRepo.forTenant(ctx.ctx._2.tenant).findById(ctx arg ID)),
      Field("auditEvents", ListType(AuditEventType),
        resolve = ctx => ctx.ctx._1.auditTrailRepo.forTenant(ctx.ctx._2.tenant).findAll())
    )

    val resolver = DeferredResolver.fetchers(teamsFetcher)

    val Query: ObjectType[(DataStore, DaikokuActionContext[JsValue]), Unit] = ObjectType(
      "Query", fields[(DataStore, DaikokuActionContext[JsValue]), Unit](
        (allFields() ++ teamFields() ++ apiFields()):_*
      )
    )

    (Schema(Query), resolver)
  }
}
