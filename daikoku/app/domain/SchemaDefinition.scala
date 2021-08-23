package domain

import fr.maif.otoroshi.daikoku.audit.KafkaConfig
import fr.maif.otoroshi.daikoku.audit.config.{ElasticAnalyticsConfig, Webhook}
import fr.maif.otoroshi.daikoku.domain.NotificationAction._
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.login.AuthProvider
import fr.maif.otoroshi.daikoku.utils.S3Configuration
import org.joda.time.{DateTime, DateTimeZone}
import org.joda.time.format.ISODateTimeFormat
import play.api.libs.json._
import sangria.ast.{ObjectValue, StringValue}
import sangria.macros.derive.{ReplaceField, _}
import sangria.schema._
import sangria.validation.ValueCoercionViolation
import storage.DataStore

import java.util.concurrent.TimeUnit
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

  val OtoroshiServiceIdType   = deriveObjectType[Unit, OtoroshiServiceId]()
  val OtoroshiSettingsIdType  = deriveObjectType[Unit, OtoroshiSettingsId]()
  val UsagePlanIdType         = deriveObjectType[Unit, UsagePlanId]()
  val UserIdType          = deriveObjectType[Unit, UserId]()
  val TeamIdType          = deriveObjectType[Unit, TeamId]()
  val ApiIdType           = deriveObjectType[Unit, ApiId]()
  val ApiSubscriptionIdType         = deriveObjectType[Unit, ApiSubscriptionId]()
  val ApiDocumentationIdType        = deriveObjectType[Unit, ApiDocumentationId]()
  val ApiDocumentationPageIdType    = deriveObjectType[Unit, ApiDocumentationPageId]()
  val VersionType         = deriveObjectType[Unit, Version]()
  val TenantIdType        = deriveObjectType[Unit, TenantId]()
  val AssetIdType         = deriveObjectType[Unit, AssetId]()
  val OtoroshiGroupType             = deriveObjectType[Unit, OtoroshiGroup]()
  val OtoroshiServiceGroupIdType    = deriveObjectType[Unit, OtoroshiServiceGroupId]()
  val NotificationIdType            = deriveObjectType[Unit, NotificationId]()
  val UserSessionIdType             = deriveObjectType[Unit, UserSessionId]()
  val DatastoreIdType               = deriveObjectType[Unit, DatastoreId]()
  val ChatIdType                    = deriveObjectType[Unit, ChatId]()
  val ApiPostIdType                 = deriveObjectType[Unit, ApiPostId]()
  val ApiIssueIdType                = deriveObjectType[Unit, ApiIssueId]()
  val ApiIssueTagIdType             = deriveObjectType[Unit, ApiIssueTagId]()

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
      Field("id", OtoroshiSettingsIdType, resolve = _.value.id)
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
      Field("id", TenantIdType, resolve = _.value.id)
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
      Field("adminApi", ApiIdType, resolve = _.value.adminApi)
    ),
    ReplaceField("adminSubscriptions",
      Field("adminSubscriptions", ListType(ApiSubscriptionIdType), resolve = _.value.adminSubscriptions)
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
      Field("services", ListType(OtoroshiServiceIdType), resolve = _.value.services.toSeq)
    ),
    ReplaceField("groups",
      Field("groups", ListType(OtoroshiServiceGroupIdType), resolve = _.value.groups.toSeq)
    )
  )

  val OtoroshiTargetType = deriveObjectType[Unit, OtoroshiTarget](
    ReplaceField("otoroshiSettings",
      Field("otoroshiSettings", OtoroshiSettingsIdType, resolve = _.value.otoroshiSettings)
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
      Field("otoroshiSettings", OtoroshiSettingsIdType, resolve = _.value.otoroshiSettings)
    ),
    ReplaceField("service",
      Field("service", OtoroshiServiceIdType, resolve = _.value.service)
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

  val TeamInterfaceType = InterfaceType(
    "TeamType",
    "TeamType description",
    () => fields[Unit, TeamType](
      Field("name", StringType, resolve = _.value.name)
    )
  )

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
    "UsagePlan trait",
    "UsagePlan description",
    () => fields[Unit, UsagePlan](
      Field("id",           UsagePlanIdType, resolve = _.value.id),
      Field("costPerMonth", BigDecimalType, resolve = _.value.costPerMonth),
      Field("maxRequestPerSecond", OptionType(LongType), resolve = _.value.maxRequestPerSecond),
      Field("maxRequestPerDay", OptionType(LongType), resolve = _.value.maxRequestPerDay),
      Field("maxRequestPerMonth", OptionType(LongType), resolve = _.value.maxRequestPerMonth),
      Field("allowMultipleKeys", OptionType(BooleanType), resolve = _.value.allowMultipleKeys),
      Field("autoRotation", OptionType(BooleanType), resolve = _.value.autoRotation),
      Field("customName", OptionType(StringType), resolve = _.value.customName),
      Field("customDescription", OptionType(StringType), resolve = _.value.customDescription),
      Field("otoroshiTarget", OptionType(OtoroshiTargetType), resolve = _.value.otoroshiTarget),
      Field("trialPeriod", OptionType(BillingDurationType), resolve = _.value.trialPeriod),
      Field("typeName", StringType, resolve = _.value.typeName),
      Field("visibility", UsagePlanVisibilityType, resolve = _.value.visibility),
      Field("authorizedTeams", ListType(TeamIdType), resolve = _.value.authorizedTeams),
      Field("aggregationApiKeysSecurity", OptionType(BooleanType), resolve = _.value.aggregationApiKeysSecurity)
    )
  )

  val AdminUsagePlanType = deriveObjectType[Unit, UsagePlan.Admin](
    Interfaces(UsagePlanInterfaceType),
    ReplaceField("id",
      Field("id", UsagePlanIdType, resolve = _.value.id)
    ),
    ReplaceField("otoroshiTarget",
      Field("otoroshiTarget", OptionType(OtoroshiTargetType), resolve = _.value.otoroshiTarget)
    ),
    ReplaceField("authorizedTeams",
      Field("authorizedTeams", ListType(TeamIdType), resolve = _.value.authorizedTeams)
    )
  )

  val FreeWithoutQuotasUsagePlanType = deriveObjectType[Unit, UsagePlan.FreeWithoutQuotas](
    Interfaces(UsagePlanInterfaceType),
    ReplaceField("currency", Field("currency", CurrencyType, resolve = _.value.currency)),
    ReplaceField("id", Field("id", UsagePlanIdType, resolve = _.value.id)),
    ReplaceField("billingDuration", Field("billingDuration", BillingDurationType, resolve = _.value.billingDuration)),
    ReplaceField("subscriptionProcess", Field("subscriptionProcess", SubscriptionProcessType, resolve = _.value.subscriptionProcess)),
    ReplaceField("integrationProcess", Field("integrationProcess", IntegrationProcessType, resolve = _.value.integrationProcess)),
    ReplaceField("otoroshiTarget",
      Field("otoroshiTarget", OptionType(OtoroshiTargetType), resolve = _.value.otoroshiTarget)),
    ReplaceField("visibility",
      Field("visibility", UsagePlanVisibilityType, resolve = _.value.visibility)),
    ReplaceField("authorizedTeams",
      Field("authorizedTeams", ListType(TeamIdType), resolve = _.value.authorizedTeams))
  )

  val FreeWithQuotasUsagePlanType = deriveObjectType[Unit, UsagePlan.FreeWithQuotas](
    Interfaces(UsagePlanInterfaceType),
    ReplaceField("currency", Field("currency", CurrencyType, resolve = _.value.currency)),
    ReplaceField("id", Field("id", UsagePlanIdType, resolve = _.value.id)),
    ReplaceField("billingDuration", Field("billingDuration", BillingDurationType, resolve = _.value.billingDuration)),
    ReplaceField("subscriptionProcess", Field("subscriptionProcess", SubscriptionProcessType, resolve = _.value.subscriptionProcess)),
    ReplaceField("integrationProcess", Field("integrationProcess", IntegrationProcessType, resolve = _.value.integrationProcess)),
    ReplaceField("otoroshiTarget",
      Field("otoroshiTarget", OptionType(OtoroshiTargetType), resolve = _.value.otoroshiTarget)),
    ReplaceField("visibility",
      Field("visibility", UsagePlanVisibilityType, resolve = _.value.visibility)),
    ReplaceField("authorizedTeams",
      Field("authorizedTeams", ListType(TeamIdType), resolve = _.value.authorizedTeams))
  )

  val QuotasWithLimitsType = deriveObjectType[Unit, UsagePlan.QuotasWithLimits](
    Interfaces(UsagePlanInterfaceType),
    ReplaceField("currency", Field("currency", CurrencyType, resolve = _.value.currency)),
    ReplaceField("id", Field("id", UsagePlanIdType, resolve = _.value.id)),
    ReplaceField("trialPeriod", Field("trialPeriod", OptionType(BillingDurationType), resolve = _.value.trialPeriod)),
    ReplaceField("billingDuration", Field("billingDuration", BillingDurationType, resolve = _.value.billingDuration)),
    ReplaceField("subscriptionProcess", Field("subscriptionProcess", SubscriptionProcessType, resolve = _.value.subscriptionProcess)),
    ReplaceField("integrationProcess", Field("integrationProcess", IntegrationProcessType, resolve = _.value.integrationProcess)),
    ReplaceField("otoroshiTarget",
      Field("otoroshiTarget", OptionType(OtoroshiTargetType), resolve = _.value.otoroshiTarget)),
    ReplaceField("visibility",
      Field("visibility", UsagePlanVisibilityType, resolve = _.value.visibility)),
    ReplaceField("authorizedTeams",
      Field("authorizedTeams", ListType(TeamIdType), resolve = _.value.authorizedTeams))
  )

  val QuotasWithoutLimitsType = deriveObjectType[Unit, UsagePlan.QuotasWithoutLimits](
    Interfaces(UsagePlanInterfaceType),
    ReplaceField("currency", Field("currency", CurrencyType, resolve = _.value.currency)),
    ReplaceField("id", Field("id", UsagePlanIdType, resolve = _.value.id)),
    ReplaceField("trialPeriod", Field("trialPeriod", OptionType(BillingDurationType), resolve = _.value.trialPeriod)),
    ReplaceField("billingDuration", Field("billingDuration", BillingDurationType, resolve = _.value.billingDuration)),
    ReplaceField("subscriptionProcess", Field("subscriptionProcess", SubscriptionProcessType, resolve = _.value.subscriptionProcess)),
    ReplaceField("integrationProcess", Field("integrationProcess", IntegrationProcessType, resolve = _.value.integrationProcess)),
    ReplaceField("otoroshiTarget",
      Field("otoroshiTarget", OptionType(OtoroshiTargetType), resolve = _.value.otoroshiTarget)),
    ReplaceField("visibility",
      Field("visibility", UsagePlanVisibilityType, resolve = _.value.visibility)),
    ReplaceField("authorizedTeams",
      Field("authorizedTeams", ListType(TeamIdType), resolve = _.value.authorizedTeams))
  )

  val PayPerUseType = deriveObjectType[Unit, UsagePlan.PayPerUse](
    Interfaces(UsagePlanInterfaceType),
    ReplaceField("currency", Field("currency", CurrencyType, resolve = _.value.currency)),
    ReplaceField("id", Field("id", UsagePlanIdType, resolve = _.value.id)),
    ReplaceField("trialPeriod", Field("trialPeriod", OptionType(BillingDurationType), resolve = _.value.trialPeriod)),
    ReplaceField("billingDuration", Field("billingDuration", BillingDurationType, resolve = _.value.billingDuration)),
    ReplaceField("subscriptionProcess", Field("subscriptionProcess", SubscriptionProcessType, resolve = _.value.subscriptionProcess)),
    ReplaceField("integrationProcess", Field("integrationProcess", IntegrationProcessType, resolve = _.value.integrationProcess)),
    ReplaceField("otoroshiTarget",
      Field("otoroshiTarget", OptionType(OtoroshiTargetType), resolve = _.value.otoroshiTarget)),
    ReplaceField("visibility",
      Field("visibility", UsagePlanVisibilityType, resolve = _.value.visibility)),
    ReplaceField("authorizedTeams",
      Field("authorizedTeams", ListType(TeamIdType), resolve = _.value.authorizedTeams))
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
      Field("id", ApiDocumentationIdType, resolve = _.value.id),
      Field("tenant", TenantIdType, resolve = _.value.tenant),
      Field("pages", ListType(ApiDocumentationPageIdType), resolve = _.value.pages),
      Field("lastModificationAt", DateTimeType, resolve = _.value.lastModificationAt)
    )
  )
  val ApiDocumentationPageType = deriveObjectType[Unit, ApiDocumentationPage](
    ReplaceField("id", Field("id", ApiDocumentationPageIdType, resolve = _.value.id)),
    ReplaceField("tenant", Field("tenant", TenantIdType, resolve = _.value.tenant)),
    ReplaceField("lastModificationAt", Field("lastModificationAt", DateTimeType, resolve = _.value.lastModificationAt)),
    ReplaceField("remoteContentHeaders", Field("remoteContentHeaders", MapType, resolve = _.value.remoteContentHeaders)),
  )
  val ApiPostType = deriveObjectType[Unit, ApiPost](
    ReplaceField("id", Field("id", ApiPostIdType, resolve = _.value.id)),
    ReplaceField("tenant", Field("tenant", TenantIdType, resolve = _.value.tenant)),
    ReplaceField("lastModificationAt", Field("lastModificationAt", DateTimeType, resolve = _.value.lastModificationAt)),
  )
  val TwoFactorAuthenticationType = deriveObjectType[Unit, TwoFactorAuthentication]()
  val ApiIssueTagType = deriveObjectType[Unit, ApiIssueTag](
    ReplaceField("id", Field("id", ApiIssueTagIdType, resolve = _.value.id))
  )
  val ApiIssueCommentType = deriveObjectType[Unit, ApiIssueComment](
    ReplaceField("by", Field("by", UserIdType, resolve = _.value.by)),
    ReplaceField("createdAt", Field("createdAt", DateTimeType, resolve = _.value.createdAt)),
    ReplaceField("lastModificationAt", Field("lastModificationAt", DateTimeType, resolve = _.value.lastModificationAt))
  )
  val ApiIssue = deriveObjectType[Unit, ApiIssue](
    ReplaceField("id", Field("id", ApiIssueIdType, resolve = _.value.id)),
    ReplaceField("tenant", Field("tenant", TenantIdType, resolve = _.value.tenant)),
    ReplaceField("tags", Field("tags", ListType(ApiIssueTagIdType), resolve = _.value.tags.toSeq)),
    ReplaceField("createdAt", Field("createdAt", DateTimeType, resolve = _.value.createdAt)),
    ReplaceField("closedAt", Field("closedAt", OptionType(DateTimeType), resolve = _.value.closedAt)),
    ReplaceField("by", Field("by", UserIdType, resolve = _.value.by)),
    ReplaceField("comments", Field("comments", ListType(ApiIssueCommentType), resolve = _.value.comments)),
    ReplaceField("lastModificationAt", Field("lastModificationAt", DateTimeType, resolve = _.value.lastModificationAt))
  )
  val UserInvitationType = deriveObjectType[Unit, UserInvitation](
    ReplaceField("createdAt", Field("createdAt", DateTimeType, resolve = _.value.createdAt)),
  )
  val UserType: ObjectType[Unit, User] =
    deriveObjectType[Unit, User](
      ObjectTypeName("User"),
      ObjectTypeDescription("A user of daikoku"),
      ReplaceField("id",
        Field("id", UserIdType, resolve = _.value.id)),
      ReplaceField("tenants",
        Field("tenants", ListType(TenantIdType), resolve = ctx => ctx.value.tenants.toSeq)),
      ReplaceField("origins",
        Field("origins", ListType(AuthProviderType), resolve = _.value.origins.toSeq)),
      ReplaceField("lastTenant",
        Field("lastTenant", OptionType(TenantIdType), resolve = _.value.lastTenant)
      ),
      ReplaceField("hardwareKeyRegistrations",
        Field("hardwareKeyRegistrations", ListType(JsonType), resolve = _.value.hardwareKeyRegistrations)
      ),
      ReplaceField("starredApis",
        Field("starredApis", ListType(ApiIdType), resolve = _.value.starredApis.toSeq)
      ),
      ReplaceField("twoFactorAuthentication",
        Field("twoFactorAuthentication", OptionType(TwoFactorAuthenticationType), resolve = _.value.twoFactorAuthentication)
      ),
      ReplaceField("invitation",
        Field("invitation", OptionType(UserInvitationType), resolve = _.value.invitation)
      ),
      ReplaceField("metadata",
        Field("metadata", MapType, resolve = _.value.metadata)
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
      Field("userId", UserIdType, resolve = _.value.userId),
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

  val teamType = deriveObjectType[Unit, Team](
    ReplaceField("id", Field("id", TeamIdType, resolve = _.value.id)),
    ReplaceField("tenant", Field("tenant", TenantIdType, resolve = _.value.tenant)),
    ReplaceField("type", Field("type", TeamInterfaceType, resolve = _.value.`type`)),
    ReplaceField("users", Field("users", ListType(UserWithPermissionType), resolve = _.value.users.toSeq)),
    ReplaceField("subscriptions", Field("subscriptions", ListType(ApiSubscriptionIdType), resolve = _.value.subscriptions)),
    ReplaceField("authorizedOtoroshiGroups", Field("authorizedOtoroshiGroups", ListType(OtoroshiGroupType), resolve = _.value.authorizedOtoroshiGroups.toSeq)),
    ReplaceField("apiKeyVisibility", Field("apiKeyVisibility", OptionType(TeamApiKeyVisibilityType), resolve = _.value.apiKeyVisibility)),
    ReplaceField("metadata", Field("metadata", MapType, resolve = _.value.metadata)),
  )

  val TestingAuthType = InterfaceType(
    "TestingAuth",
    "TestingAuth description",
    () => fields[Unit, TestingAuth](
      Field("name", StringType, resolve = _.value.name)
    )
  )

  val TestingConfigType = deriveObjectType[Unit, TestingConfig](
    ReplaceField("otoroshiSettings", Field("otoroshiSettings", OtoroshiSettingsIdType, resolve = _.value.otoroshiSettings)),
    ReplaceField("serviceGroup", Field("serviceGroup", OtoroshiServiceGroupIdType, resolve = _.value.serviceGroup)),
    ReplaceField("api", Field("api", ApiIdType, resolve = _.value.api)),
    ReplaceField("customMetadata", Field("customMetadata", OptionType(JsonType), resolve = _.value.customMetadata))
  )

  val TestingType = deriveObjectType[Unit, Testing](
    ReplaceField("auth", Field("auth", TestingAuthType, resolve = _.value.auth)),
    ReplaceField("config", Field("config", OptionType(TestingConfigType), resolve = _.value.config))
  )

  val ApiType = deriveObjectType[Unit, Api](
    ReplaceField("id", Field("id", ApiIdType, resolve = _.value.id)),
    ReplaceField("tenant", Field("tenant", TenantIdType, resolve = _.value.tenant)),
    ReplaceField("team", Field("team", TeamIdType, resolve = _.value.team)),
    ReplaceField("currentVersion", Field("currentVersion", VersionType, resolve = _.value.currentVersion)),
    ReplaceField("supportedVersions", Field("supportedVersions", ListType(VersionType), resolve = _.value.supportedVersions.toSeq)),
    ReplaceField("lastUpdate", Field("lastUpdate", DateTimeType, resolve = _.value.lastUpdate)),
    ReplaceField("testing", Field("testing", TestingType, resolve = _.value.testing)),
    ReplaceField("documentation", Field("documentation", ApiDocumentationType, resolve = _.value.documentation)),
    ReplaceField("swagger", Field("swagger", OptionType(SwaggerAccessType), resolve = _.value.swagger)),
    ReplaceField("visibility", Field("visibility", ApiVisibilityType, resolve = _.value.visibility)),
    ReplaceField("possibleUsagePlans", Field("possibleUsagePlans", ListType(UsagePlanInterfaceType), resolve = _.value.possibleUsagePlans)),
    ReplaceField("defaultUsagePlan", Field("defaultUsagePlan", UsagePlanIdType, resolve = _.value.defaultUsagePlan)),
    ReplaceField("authorizedTeams", Field("authorizedTeams", ListType(TeamIdType), resolve = _.value.authorizedTeams)),
    ReplaceField("posts", Field("posts", ListType(ApiPostIdType), resolve = _.value.posts)),
    ReplaceField("issues", Field("issues", ListType(ApiIssueIdType), resolve = _.value.issues)),
    ReplaceField("issuesTags", Field("issuesTags", ListType(ApiIssueTagType), resolve = _.value.issuesTags.toSeq)),
    ReplaceField("parent", Field("parent", OptionType(ApiIdType), resolve = _.value.parent)),
    ReplaceField("tags", Field("tags", ListType(StringType), resolve = _.value.tags.toSeq)),
    ReplaceField("categories", Field("categories", ListType(StringType), resolve = _.value.categories.toSeq))
  )

  val ApiKeyRotationType = deriveObjectType[Unit, ApiKeyRotation]()
  val ApiSubscriptionRotationType = deriveObjectType[Unit, ApiSubscriptionRotation]()
  val ApiSubscriptionType = deriveObjectType[Unit, ApiSubscription](
    ReplaceField("id", Field("id", ApiSubscriptionIdType, resolve = _.value.id)),
    ReplaceField("tenant", Field("tenant", TenantIdType, resolve = _.value.tenant)),
    ReplaceField("apiKey", Field("apiKey", OtoroshiApiKeyType, resolve = _.value.apiKey)),
    ReplaceField("plan", Field("plan", UsagePlanIdType, resolve = _.value.plan)),
    ReplaceField("createdAt", Field("createdAt", DateTimeType, resolve = _.value.createdAt)),
    ReplaceField("team", Field("team", TeamIdType, resolve = _.value.team)),
    ReplaceField("api", Field("api", ApiIdType, resolve = _.value.api)),
    ReplaceField("by", Field("by", UserIdType, resolve = _.value.by)),
    ReplaceField("rotation", Field("rotation", OptionType(ApiSubscriptionRotationType), resolve = _.value.rotation)),
    ReplaceField("customMetadata", Field("customMetadata", OptionType(JsonType), resolve = _.value.customMetadata)),
    ReplaceField("parent", Field("parent", OptionType(ApiSubscriptionIdType), resolve = _.value.parent)),
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
    () => fields[Unit, NotificationStatus]()
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

  val NotificationActionType: InterfaceType[Unit, NotificationAction] = InterfaceType(
    "NotificationAction",
    "NotificationAction description",
    () => fields[Unit, NotificationAction]()
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
      Field("api", ApiIdType, resolve = _.value.api),
      Field("team", TeamIdType, resolve = _.value.team)
    )
  )
  val TeamAccessType = ObjectType(
    "TeamAccess",
    "TeamAccess description",
    interfaces[Unit, TeamAccess](NotificationActionType),
    fields[Unit, TeamAccess](
      Field("team", TeamIdType, resolve = _.value.team)
    )
  )
  val TeamInvitationType = ObjectType(
    "TeamInvitation",
    "TeamInvitation description",
    interfaces[Unit, TeamInvitation](NotificationActionType),
    fields[Unit, TeamInvitation](
      Field("team", TeamIdType, resolve = _.value.team),
      Field("user", UserIdType, resolve = _.value.user)
    )
  )
  val ApiSubscriptionDemandType = ObjectType(
    "ApiSubscriptionDemand",
    "ApiSubscriptionDemand description",
    interfaces[Unit, ApiSubscriptionDemand](NotificationActionType),
    fields[Unit, ApiSubscriptionDemand](
      Field("api", ApiIdType, resolve = _.value.api),
      Field("team", TeamIdType, resolve = _.value.team),
      Field("plan", UsagePlanIdType, resolve = _.value.plan),
      Field("parentSubscriptionId", OptionType(ApiSubscriptionIdType), resolve = _.value.parentSubscriptionId)
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
    ReplaceField("id", Field("id", NotificationIdType, resolve = _.value.id)),
    ReplaceField("tenant", Field("tenant", TenantIdType, resolve = _.value.tenant)),
    ReplaceField("team", Field("team", OptionType(TeamIdType), resolve = _.value.team)),
    ReplaceField("sender", Field("sender", UserType, resolve = _.value.sender)),
    ReplaceField("date", Field("date", DateTimeType, resolve = _.value.date)),
    ReplaceField("notificationType", Field("notificationType", NotificationInterfaceType, resolve = _.value.notificationType)),
    ReplaceField("status", Field("status", NotificationStatusType, resolve = _.value.status)),
    ReplaceField("action", Field("action", NotificationActionType, resolve = _.value.action)),
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
    ReplaceField("id", Field("id", DatastoreIdType, resolve = _.value.id)),
    ReplaceField("userId", Field("userId", UserIdType, resolve = _.value.userId)),
    ReplaceField("sessionId", Field("sessionId", UserSessionIdType, resolve = _.value.sessionId)),
    ReplaceField("impersonatorId", Field("impersonatorId", OptionType(UserIdType), resolve = _.value.impersonatorId)),
    ReplaceField("impersonatorSessionId", Field("impersonatorSessionId", OptionType(UserSessionIdType), resolve = _.value.impersonatorSessionId)),
    ReplaceField("created", Field("created", DateTimeType, resolve = _.value.created)),
    ReplaceField("ttl", Field("ttl", FiniteDurationType, resolve = _.value.ttl)),
    ReplaceField("expires", Field("expires", DateTimeType, resolve = _.value.expires))
  )

  val ApiKeyConsumptionUserSessionType = deriveObjectType[Unit, ApiKeyConsumption](
    ReplaceField("id", Field("id", DatastoreIdType, resolve = _.value.id)),
    ReplaceField("tenant", Field("tenant", TenantIdType, resolve = _.value.tenant)),
    ReplaceField("team", Field("team", TeamIdType, resolve = _.value.team)),
    ReplaceField("api", Field("api", ApiIdType, resolve = _.value.api)),
    ReplaceField("plan", Field("plan", UsagePlanIdType, resolve = _.value.plan)),
    ReplaceField("globalInformations", Field("globalInformations", ApiKeyGlobalConsumptionInformationsType, resolve = _.value.globalInformations)),
    ReplaceField("quotas", Field("quotas", ApiKeyQuotasType, resolve = _.value.quotas)),
    ReplaceField("billing", Field("billing", ApiKeyBillingType, resolve = _.value.billing)),
    ReplaceField("from", Field("from", DateTimeType, resolve = _.value.from)),
    ReplaceField("to", Field("to", DateTimeType, resolve = _.value.to))
  )

  val ApiKeyGlobalConsumptionInformationsType = deriveObjectType[Unit, ApiKeyGlobalConsumptionInformations]()
  val ApiKeyQuotasType = deriveObjectType[Unit, ApiKeyQuotas]()
  val ApiKeyBillingType = deriveObjectType[Unit, ApiKeyBilling]()

  val PasswordResetType = deriveObjectType[Unit, PasswordReset](
    ReplaceField("id", Field("id", DatastoreIdType, resolve = _.value.id)),
    ReplaceField("user", Field("user", UserIdType, resolve = _.value.user)),
    ReplaceField("creationDate", Field("creationDate", DateTimeType, resolve = _.value.creationDate)),
    ReplaceField("validUntil", Field("validUntil", DateTimeType, resolve = _.value.validUntil))
  )
  val AccountCreationType = deriveObjectType[Unit, AccountCreation](
    ReplaceField("id", Field("id", DatastoreIdType, resolve = _.value.id)),
    ReplaceField("creationDate", Field("creationDate", DateTimeType, resolve = _.value.creationDate)),
    ReplaceField("validUntil", Field("validUntil", DateTimeType, resolve = _.value.validUntil))
  )
  val TranslationnType = deriveObjectType[Unit, Translation](
    ReplaceField("id", Field("id", DatastoreIdType, resolve = _.value.id)),
    ReplaceField("tenant", Field("tenant", TenantIdType, resolve = _.value.tenant)),
    ReplaceField("lastModificationAt", Field("lastModificationAt", OptionType(DateTimeType), resolve = _.value.lastModificationAt))
  )
  val EvolutionType = deriveObjectType[Unit, Evolution](
    ReplaceField("id", Field("id", DatastoreIdType, resolve = _.value.id)),
    ReplaceField("date", Field("date", DateTimeType, resolve = _.value.date))
  )

  val MessageIntefaceType: InterfaceType[Unit, MessageType] = InterfaceType(
    "MessageType",
    "MessageType description",
    () => fields[Unit, MessageType](
      Field("name", StringType, resolve = _.value.value.value)
    ))

  val MessageType = deriveObjectType[Unit, Message](
    ReplaceField("id", Field("id", DatastoreIdType, resolve = _.value.id)),
    ReplaceField("tenant", Field("tenant", TenantIdType, resolve = _.value.tenant)),
    ReplaceField("messageType", Field("messageType", MessageIntefaceType, resolve = _.value.messageType)),
    ReplaceField("participants", Field("participants", ListType(UserIdType), resolve = _.value.participants.toSeq)),
    ReplaceField("readBy", Field("readBy", ListType(UserIdType), resolve = _.value.readBy.toSeq)),
    ReplaceField("chat", Field("chat", UserIdType, resolve = _.value.chat)),
    ReplaceField("date", Field("date", DateTimeType, resolve = _.value.date)),
    ReplaceField("sender", Field("sender", UserIdType, resolve = _.value.sender)),
    ReplaceField("closed", Field("closed", OptionType(DateTimeType), resolve = _.value.closed)),
  )


  val AuthProviderType: InterfaceType[Unit, AuthProvider] = InterfaceType(
    "AuthProvider",
    "Auth provider description",
    () => fields[Unit, AuthProvider](
      Field("name", StringType, Some("The name of auth provider"), resolve = _.value.name),
      Field("asJson", JsonType, resolve = _.value.asJson))
  )

  val ID: Argument[String] = Argument("id", StringType, description = "id of the character")

  def getSchema(env: Env): Schema[DataStore, Unit] = {
    implicit val e = env.defaultExecutionContext

    val Query: ObjectType[DataStore, Unit] = ObjectType(
      "Query", fields[DataStore, Unit](
        Field("user", OptionType(UserType),
          arguments = ID :: Nil,
          resolve = ctx => ctx.ctx.userRepo.findById(ctx arg ID)
        ),
        Field("users", ListType(UserType),
          resolve = ctx => ctx.ctx.userRepo.findAll())
      )
    )

    Schema(Query)
  }
}
