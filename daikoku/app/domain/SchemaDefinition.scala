package fr.maif.otoroshi.daikoku.domain

import akka.http.scaladsl.util.FastFuture
import fr.maif.otoroshi.daikoku.actions.DaikokuActionContext
import fr.maif.otoroshi.daikoku.audit._
import fr.maif.otoroshi.daikoku.audit.config._
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async._UberPublicUserAccess
import fr.maif.otoroshi.daikoku.domain.NotificationAction._
import fr.maif.otoroshi.daikoku.domain.TeamPermission._
import fr.maif.otoroshi.daikoku.domain.json.{TenantIdFormat, UserIdFormat}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.login.AuthProvider
import fr.maif.otoroshi.daikoku.utils.S3Configuration
import org.joda.time.format.ISODateTimeFormat
import org.joda.time.{DateTime, DateTimeZone}
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
    coerceOutput = (value, _) => Json.stringify(value),
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

  val DateTimeUnitype = ScalarType[DateTime]("DateTime",
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
    coerceOutput = (data, _) => Json.stringify(JsObject(data.view.mapValues(JsString.apply).toSeq)),
    coerceUserInput = e => e.asInstanceOf[Map[String, String]] match {
      case r: Map[String, String] => Right(r)
      case _ => Left(MapCoercionViolation)
    },
    coerceInput = {
      case ObjectValue(fields, _, _) => Right(fields.map(f => (f.name, f.value.toString)).toMap)
      case _ => Left(MapCoercionViolation)
    })

  case class NotAuthorizedError(message: String) extends Exception(message)

  def getSchema(env: Env) = {
    implicit val e = env.defaultExecutionContext
    implicit val en = env

    var ApiType: ObjectType[(DataStore, DaikokuActionContext[JsValue]), Api] = null
    var TenantType: ObjectType[(DataStore, DaikokuActionContext[JsValue]), Tenant] = null

    val DaikokuStyleType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), DaikokuStyle]()
    val ElasticAnalyticsConfigType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ElasticAnalyticsConfig](
      ReplaceField("headers", Field("headers", MapType, resolve = _.value.headers))
    )
    val WebhookType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), Webhook](
      ReplaceField("headers", Field("headers", MapType, resolve = _.value.headers))
    )
    val  KafkaConfigType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), KafkaConfig]()

    val  AuditTrailConfigType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), AuditTrailConfig](
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

    val OtoroshiSettingsType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), OtoroshiSettings](
      ReplaceField("id", Field("id", StringType, resolve = _.value.id.value))
    )
    val MailerSettingsType: InterfaceType[(DataStore, DaikokuActionContext[JsValue]), MailerSettings] = InterfaceType(
      "MailerSettings",
      "The mailer settings type",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), MailerSettings](
        Field("mailerType", StringType, resolve = _.value.mailerType)
      )
    )
    val ConsoleMailerSettingsType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ConsoleMailerSettings](
      Interfaces(MailerSettingsType)
    ))
    val MailgunSettingsType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), MailgunSettings](
      Interfaces(MailerSettingsType)
    ))
    val MailjetSettingsType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), MailjetSettings](
      Interfaces(MailerSettingsType)
    ))
    val SimpleSMTPSettingsType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), SimpleSMTPSettings](
      Interfaces(MailerSettingsType)
    ))
    val SendgridSettingsType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), SendgridSettings](
      Interfaces(MailerSettingsType)
    ))

    val  BucketSettingsType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), S3Configuration]()

    val  ApiKeyRestrictionPathType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiKeyRestrictionPath]()
    val  ApiKeyRestrictionsType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiKeyRestrictions](
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

    val  CustomMetadataType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), CustomMetadata](
      ReplaceField("possibleValues",
        Field("possibleValues", ListType(StringType), resolve = _.value.possibleValues.toSeq)
      )
    )
    val  ApikeyCustomizationType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApikeyCustomization](
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

    val  AuthorizedEntitiesType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), AuthorizedEntities](
      ReplaceField("services",
        Field("services", ListType(StringType), resolve = _.value.services.toSeq.map(_.value))
      ),
      ReplaceField("groups",
        Field("groups", ListType(StringType), resolve = _.value.groups.toSeq.map(_.value))
      )
    )

    val  OtoroshiTargetType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), OtoroshiTarget](
      ReplaceField("otoroshiSettings",
        Field("otoroshiSettings", StringType, resolve = _.value.otoroshiSettings.value)
      ),
      ReplaceField("authorizedEntities",
        Field("authorizedEntities", OptionType(AuthorizedEntitiesType), resolve = _.value.authorizedEntities)
      ),
      ReplaceField("apikeyCustomization",
        Field("apikeyCustomization", ApikeyCustomizationType, resolve = _.value.apikeyCustomization)
      ),
    )

    val  OtoroshiServiceType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), OtoroshiService](
      ReplaceField("otoroshiSettings",
        Field("otoroshiSettings", StringType, resolve = _.value.otoroshiSettings.value)
      ),
      ReplaceField("service",
        Field("service", StringType, resolve = _.value.service.value)
      )
    )

    val  BillingTimeUnitInterfaceType = InterfaceType(
      "BillingTimeUnit",
      "BillingTimeUnit description",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), BillingTimeUnit](
        Field("name", StringType, resolve = _.value.name)
      )
    )

    val  BillingDurationType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), BillingDuration](
      ReplaceField("unit",
        Field("unit", BillingTimeUnitInterfaceType, resolve = _.value.unit)
      )
    )

    val  UsagePlanVisibilityType = InterfaceType(
      "UsagePlanVisibility",
      "UsagePlanVisibility description",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), UsagePlanVisibility](
        Field("name", StringType, resolve = _.value.name)
      )
    )

    val  SubscriptionProcessType = InterfaceType(
      "SubscriptionProcess",
      "SubscriptionProcess description",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), SubscriptionProcess](
        Field("name", StringType, resolve = _.value.name)
      )
    )

    val  IntegrationProcessType = InterfaceType(
      "IntegrationProcess",
      "IntegrationProcess description",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), IntegrationProcess](
        Field("name", StringType, resolve = _.value.name)
      )
    )

    val  CurrencyType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), Currency]()

    val  UsagePlanInterfaceType = InterfaceType(
      name = "UsagePlan",
      description = "Usage Plan description",
      fields = fields[(DataStore, DaikokuActionContext[JsValue]), UsagePlan](
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

    val  AdminUsagePlanType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), UsagePlan.Admin](
      Interfaces(UsagePlanInterfaceType),
      ReplaceField("id",
        Field("id", StringType /*UsagePlanIdType*/, resolve = ctx => ctx.value.id.value)
      ),
      ReplaceField("otoroshiTarget",
        Field("otoroshiTarget", OptionType(OtoroshiTargetType), resolve = ctx => ctx.value.otoroshiTarget)
      ),
      ReplaceField("authorizedTeams",
        Field("authorizedTeams", ListType(StringType /*TeamIdType*/), resolve = ctx => ctx.value.authorizedTeams.map(_.value))
      )
    ))

    val  FreeWithoutQuotasUsagePlanType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), UsagePlan.FreeWithoutQuotas](
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
    ))

    val  FreeWithQuotasUsagePlanType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), UsagePlan.FreeWithQuotas](
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
    ))

    val  QuotasWithLimitsType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), UsagePlan.QuotasWithLimits](
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
    ))

    val  QuotasWithoutLimitsType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), UsagePlan.QuotasWithoutLimits](
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
    ))

    val  PayPerUseType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), UsagePlan.PayPerUse](
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
    ))

    val  OtoroshiApiKeyType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), OtoroshiApiKey]()
    val  SwaggerAccessType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), SwaggerAccess](
      ReplaceField("headers",
        Field("headers", MapType, resolve = _.value.headers))
    )
    val  ApiDocumentationType = ObjectType(
      "ApiDocumentation",
      "ApiDocumentation description",
      fields[(DataStore, DaikokuActionContext[JsValue]), ApiDocumentation](
        Field("id", StringType /*ApiDocumentationIdType*/, resolve = _.value.id.value),
        Field("tenant", StringType /*TenantIdType*/, resolve = _.value.tenant.value),
        Field("pages", ListType(StringType /*ApiDocumentationPageIdType*/), resolve = _.value.pages.map(_.value)),
        Field("lastModificationAt", DateTimeUnitype, resolve = _.value.lastModificationAt)
      )
    )
    val  ApiDocumentationPageType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiDocumentationPage](
      ReplaceField("id", Field("_id", StringType /*ApiDocumentationPageIdType*/, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", StringType /*TenantIdType*/, resolve = _.value.tenant.value)),
      ReplaceField("lastModificationAt", Field("lastModificationAt", DateTimeUnitype, resolve = _.value.lastModificationAt)),
      ReplaceField("remoteContentHeaders", Field("remoteContentHeaders", MapType, resolve = _.value.remoteContentHeaders)),
      AddFields(
        Field("_humanReadableId", StringType, resolve = _.value.humanReadableId)
      )
    )
    val  ApiPostType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiPost](
      ReplaceField("id", Field("_id", StringType /*ApiPostIdType*/, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", StringType /*TenantIdType*/, resolve = _.value.tenant.value)),
      ReplaceField("lastModificationAt", Field("lastModificationAt", DateTimeUnitype, resolve = _.value.lastModificationAt)),
      AddFields(
        Field("_humanReadableId", StringType, resolve = _.value.humanReadableId)
      )
    )
    val  TwoFactorAuthenticationType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), TwoFactorAuthentication]()
    val  ApiIssueTagType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiIssueTag](
      ReplaceField("id", Field("_id", StringType /*ApiIssueTagIdType*/, resolve = _.value.id.value))
    )
    val  ApiIssueCommentType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiIssueComment](
      ReplaceField("by", Field("by", StringType /*UserIdType*/, resolve = _.value.by.value)),
      ReplaceField("createdAt", Field("createdAt", DateTimeUnitype, resolve = _.value.createdAt)),
      ReplaceField("lastModificationAt", Field("lastModificationAt", DateTimeUnitype, resolve = _.value.lastModificationAt))
    )
    val  ApiIssueType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiIssue](
      ReplaceField("id", Field("_id", StringType /*ApiIssueIdType*/, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", StringType /*TenantIdType*/, resolve = _.value.tenant.value)),
      ReplaceField("tags", Field("tags", ListType(StringType /*ApiIssueTagIdType*/), resolve = _.value.tags.toSeq.map(_.value))),
      ReplaceField("createdAt", Field("createdAt", DateTimeUnitype, resolve = _.value.createdAt)),
      ReplaceField("closedAt", Field("closedAt", OptionType(DateTimeUnitype), resolve = _.value.closedAt)),
      ReplaceField("by", Field("by", StringType /*UserIdType*/, resolve = _.value.by.value)),
      ReplaceField("comments", Field("comments", ListType(ApiIssueCommentType), resolve = _.value.comments)),
      ReplaceField("lastModificationAt", Field("lastModificationAt", DateTimeUnitype, resolve = _.value.lastModificationAt)),
      AddFields(
        Field("_humanReadableId", StringType, resolve = _.value.humanReadableId)
      )
    )
    val  UserInvitationType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), UserInvitation](
      ReplaceField("createdAt", Field("createdAt", DateTimeUnitype, resolve = _.value.createdAt)),
    )
    val  UserType: ObjectType[(DataStore, DaikokuActionContext[JsValue]), User] =
      deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), User](
        ObjectTypeName("User"),
        ObjectTypeDescription("A user of daikoku"),
        ReplaceField("id",
          Field("id", StringType /*UserIdType*/, resolve = _.value.id.value)),
        ReplaceField("tenants",
          Field("tenants", ListType(StringType /*TenantIdType*/), resolve = ctx => ctx.value.tenants.toSeq.map(_.value))),
        ReplaceField("origins",
          Field("origins", ListType(StringType), resolve = _.value.origins.map(_.name).toSeq)),
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

    val  TeamPermissionEnum = EnumType(
      "TeamPermission",
      Some("TeamPermission"),
      List(
        EnumValue("Administrator", value = "Administrator"),
        EnumValue("ApiEditor", value = "ApiEditor"),
        EnumValue("User", value = "User")
      )
    )

    val  UserWithPermissionType = ObjectType(
      "UserWithPermission",
      "UserWithPermission description",
      fields[(DataStore, DaikokuActionContext[JsValue]), UserWithPermission](
        Field("user", OptionType(UserType), resolve = ctx => ctx.ctx._1.userRepo.findById(ctx.value.userId)),
        Field("teamPermission", TeamPermissionEnum, resolve = _.value.teamPermission.name)
      )
    )

    val TeamApiKeyVisibilityType = InterfaceType(
      "TeamApiKeyVisibility",
      "TeamApiKeyVisibility description",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), TeamApiKeyVisibility](
        Field("name", StringType, resolve = _.value.name)
      )
    )

    val  ApiSubscriptionRotationType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiSubscriptionRotation]()

    val  ApiSubscriptionType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiSubscription](
      ReplaceField("id", Field("_id", StringType /*ApiSubscriptionIdType*/, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", StringType /*TenantIdType*/, resolve = _.value.tenant.value)),
      ReplaceField("apiKey", Field("apiKey", OtoroshiApiKeyType, resolve = _.value.apiKey)),
      ReplaceField("plan", Field("plan", StringType /*UsagePlanIdType*/, resolve = _.value.plan.value)),
      ReplaceField("createdAt", Field("createdAt", DateTimeUnitype, resolve = _.value.createdAt)),
      ReplaceField("team", Field("team", StringType /*TeamIdType*/, resolve = _.value.team.value)),
      ReplaceField("api", Field("api", StringType /*ApiIdType*/, resolve = _.value.api.value)),
      ReplaceField("by", Field("by", StringType /*UserIdType*/, resolve = _.value.by.value)),
      ReplaceField("rotation", Field("rotation", OptionType(ApiSubscriptionRotationType), resolve = _.value.rotation)),
      ReplaceField("customMetadata", Field("customMetadata", OptionType(JsonType), resolve = _.value.customMetadata)),
      ReplaceField("parent", Field("parent", OptionType(StringType /*ApiSubscriptionIdType*/), resolve = _.value.parent.map(_.value))),
    )

    lazy val TeamObjectType = ObjectType[(DataStore, DaikokuActionContext[JsValue]), Team](
      "Team",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), Team](
        Field("_id", StringType, resolve = _.value.id.value),
        Field("tenant", OptionType(TenantType), resolve = ctx => ctx.ctx._1.tenantRepo.findById(ctx.value.tenant)),
        Field("deleted", BooleanType, resolve = _.value.deleted),
        Field("name", StringType, resolve = _.value.name),
        Field("type", StringType, resolve = _.value.`type`.name),
        Field("description", StringType, resolve = _.value.description),
        Field("contact", StringType, resolve = _.value.contact),
        Field("avatar", OptionType(StringType), resolve = _.value.avatar),
        Field("users", ListType(UserWithPermissionType), resolve = _.value.users.toSeq),
        Field("subscriptions", ListType(ApiSubscriptionType),
            resolve = ctx => ctx.ctx._1.apiSubscriptionRepo.forTenant(ctx.ctx._2.tenant)
              .find(Json.obj(
                "_id" -> Json.obj("$in" -> JsArray(ctx.value.subscriptions.map(_.asJson)))
              ))),
        Field("authorizedOtoroshiGroups", ListType(StringType), resolve = _.value.authorizedOtoroshiGroups.toSeq.map(_.value)),
        Field("apiKeyVisibility", OptionType(StringType), resolve = _.value.apiKeyVisibility.map(_.name)),
        Field("metadata", MapType, resolve = _.value.metadata),
        Field("_humanReadableId", StringType, resolve = _.value.humanReadableId)
      )
    )

    val TestingAuthType = InterfaceType(
      "TestingAuth",
      "TestingAuth description",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), TestingAuth](
        Field("name", StringType, resolve = _.value.name)
      )
    )

    val TestingConfigType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), TestingConfig](
      ReplaceField("otoroshiSettings", Field("otoroshiSettings", StringType, resolve = _.value.otoroshiSettings.value)),
      ReplaceField("serviceGroup", Field("serviceGroup", StringType /*OtoroshiServiceGroupIdType*/, resolve = _.value.serviceGroup.value)),
      ReplaceField("api", Field("api", StringType /*ApiIdType*/, resolve = _.value.api.value)),
      ReplaceField("customMetadata", Field("customMetadata", OptionType(JsonType), resolve = _.value.customMetadata))
    )

    val TestingType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), Testing](
      ReplaceField("auth", Field("auth", TestingAuthType, resolve = _.value.auth)),
      ReplaceField("config", Field("config", OptionType(TestingConfigType), resolve = _.value.config))
    )

    val teamsFetcher = Fetcher(
      (ctx: (DataStore, DaikokuActionContext[JsValue]), teams: Seq[TeamId]) => Future.sequence(teams.map(teamId =>
        ctx._1.teamRepo.forTenant(ctx._2.tenant).findById(teamId)))
        .map(teams => teams.flatten)
      )(HasId[Team, TeamId](_.id))

    ApiType = ObjectType[(DataStore, DaikokuActionContext[JsValue]), Api](
      "Api",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), Api](
        Field("_id", StringType, resolve = _.value.id.value),
        Field("tenant", OptionType(TenantType), resolve = ctx => ctx.ctx._1.tenantRepo.findById(ctx.ctx._2.tenant.id)),
        Field("deleted", BooleanType, resolve = _.value.deleted),
        Field("team", TeamObjectType, resolve = ctx => teamsFetcher.defer(ctx.value.team)),
        Field("name", StringType, resolve = _.value.name),
        Field("smallDescription", StringType, resolve = _.value.smallDescription),
        Field("header", OptionType(StringType), resolve = _.value.header),
        Field("image", OptionType(StringType), resolve = _.value.image),
        Field("description", StringType, resolve = _.value.description),
        Field("currentVersion", StringType, resolve = _.value.currentVersion.value),
        Field("supportedVersions", ListType(StringType), resolve = _.value.supportedVersions.toSeq.map(_.value)),
        Field("isDefault", BooleanType, resolve = _.value.isDefault),
        Field("lastUpdate", DateTimeUnitype, resolve = _.value.lastUpdate),
        Field("published", BooleanType, resolve = _.value.published),
        Field("testing", TestingType, resolve = _.value.testing),
        Field("documentation", ApiDocumentationType, resolve = _.value.documentation),
        Field("swagger", OptionType(SwaggerAccessType), resolve = _.value.swagger),
        Field("visibility", StringType, resolve = _.value.visibility.name),
        Field("possibleUsagePlans", ListType(UsagePlanInterfaceType),
            resolve = _.value.possibleUsagePlans,
            possibleTypes = List(AdminUsagePlanType, FreeWithQuotasUsagePlanType, FreeWithoutQuotasUsagePlanType,
              PayPerUseType, QuotasWithLimitsType, QuotasWithoutLimitsType)),
        Field("defaultUsagePlan", OptionType(UsagePlanInterfaceType), resolve = ctx => ctx.value.possibleUsagePlans
          .find(a => a.id == ctx.value.defaultUsagePlan)),
        Field("authorizedTeams", ListType(TeamObjectType), resolve = ctx => ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant).find(Json.obj(
          "_id" -> Json.obj("$in" -> JsArray(ctx.value.authorizedTeams.map(_.asJson)))
        ))),
        Field("posts", ListType(ApiPostType), resolve = ctx => ctx.ctx._1.apiPostRepo.forTenant(ctx.ctx._2.tenant).find(Json.obj(
          "_id" -> Json.obj("$in" -> JsArray(ctx.value.posts.map(_.asJson)))
        ))),
        Field("issues", ListType(ApiIssueType), resolve = ctx => ctx.ctx._1.apiIssueRepo.forTenant(ctx.ctx._2.tenant).find(Json.obj(
          "_id" -> Json.obj("$in" -> JsArray(ctx.value.issues.map(_.asJson)))
        ))),
        Field("issuesTags", ListType(ApiIssueTagType), resolve = _.value.issuesTags.toSeq),
        Field("parent", OptionType(StringType /*ApiIdType*/), resolve = _.value.parent.map(_.value)),
        Field("tags", ListType(StringType), resolve = _.value.tags.toSeq),
        Field("categories", ListType(StringType), resolve = _.value.categories.toSeq),
        Field("stars", IntType, resolve = _.value.stars),
        Field("_humanReadableId", StringType, resolve = _.value.humanReadableId)
      )
    )

    case class AuthorizationApi(team: String, authorized: Boolean, pending: Boolean)
    val  AuthorizationApiType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), AuthorizationApi]()

    case class GraphQLApi(api: Api, authorizations: Seq[AuthorizationApi] = Seq.empty)

    val  GraphQLApiType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), GraphQLApi](
      ReplaceField("api", Field("api", ApiType, resolve = _.value.api)),
      ReplaceField("authorizations", Field("authorizations", ListType(AuthorizationApiType), resolve = _.value.authorizations))
    )

    val  ApiKeyRotationType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiKeyRotation]()



    val  ActualOtoroshiApiKey = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ActualOtoroshiApiKey](
      ReplaceField("authorizedEntities", Field("authorizedEntities", AuthorizedEntitiesType, resolve = _.value.authorizedEntities)),
      ReplaceField("tags", Field("tags", ListType(StringType), resolve = _.value.tags)),
      ReplaceField("metadata", Field("metadata", MapType, resolve = _.value.metadata)),
      ReplaceField("restrictions", Field("restrictions", ApiKeyRestrictionsType, resolve = _.value.restrictions)),
      ReplaceField("rotation", Field("rotation", OptionType(ApiKeyRotationType), resolve = _.value.rotation))
    )

    val  NotificationStatusType: InterfaceType[(DataStore, DaikokuActionContext[JsValue]), NotificationStatus] = InterfaceType(
      "NotificationStatus",
      "NotificationStatus description",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), NotificationStatus](
        Field("_generated", StringType, resolve = _.value.toString) // TODO - can't generate interface without fields
      )
    )

    val  NotificationStatusAcceptedType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), NotificationStatus.Accepted](
      Interfaces(NotificationStatusType),
      ReplaceField("date",
        Field("date", DateTimeUnitype, resolve = _.value.date)
      )
    ))

    val  NotificationStatusRejectedType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), NotificationStatus.Rejected](
      Interfaces(NotificationStatusType),
      ReplaceField("date",
        Field("date", DateTimeUnitype, resolve = _.value.date)
      )
    ))

    val  NotificationStatusPendingType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), NotificationStatus.Pending](
      Interfaces(NotificationStatusType),
      AddFields(
        Field("_generated", StringType, resolve = _.value.toString) // TODO - can't generate interface without fields
      )
    ))

    val  NotificationActionType: InterfaceType[(DataStore, DaikokuActionContext[JsValue]), NotificationAction] = InterfaceType(
      "NotificationAction",
      "NotificationAction description",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), NotificationAction](
        Field("_generated", StringType, resolve = _.value.toString) // TODO - can't generate interface without fields
      )
    )
    val  OtoroshiSyncNotificationActionType: InterfaceType[(DataStore, DaikokuActionContext[JsValue]), OtoroshiSyncNotificationAction] = InterfaceType(
      "OtoroshiSyncNotificationAction",
      "OtoroshiSyncNotificationAction description",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), OtoroshiSyncNotificationAction](
        Field("message", StringType, resolve = _.value.message)
      )
    )

    val  ApiAccessType = new PossibleObject(ObjectType(
      "ApiAccess",
      "ApiAccess description",
      interfaces[(DataStore, DaikokuActionContext[JsValue]), ApiAccess](NotificationActionType),
      fields[(DataStore, DaikokuActionContext[JsValue]), ApiAccess](
        Field("api", StringType /*ApiIdType*/, resolve = _.value.api.value),
        Field("team", StringType /*TeamIdType*/, resolve = _.value.team.value)
      )
    ))
    val  TeamAccessType = new PossibleObject(ObjectType(
      "TeamAccess",
      "TeamAccess description",
      interfaces[(DataStore, DaikokuActionContext[JsValue]), TeamAccess](NotificationActionType),
      fields[(DataStore, DaikokuActionContext[JsValue]), TeamAccess](
        Field("team", StringType /*TeamIdType*/, resolve = _.value.team.value)
      )
    ))
    val  TeamInvitationType = new PossibleObject(ObjectType(
      "TeamInvitation",
      "TeamInvitation description",
      interfaces[(DataStore, DaikokuActionContext[JsValue]), TeamInvitation](NotificationActionType),
      fields[(DataStore, DaikokuActionContext[JsValue]), TeamInvitation](
        Field("team", StringType /*TeamIdType*/, resolve = _.value.team.value),
        Field("user", StringType /*UserIdType*/, resolve = _.value.user.value)
      )
    ))
    val  ApiSubscriptionDemandType = new PossibleObject(ObjectType(
      "ApiSubscriptionDemand",
      "ApiSubscriptionDemand description",
      interfaces[(DataStore, DaikokuActionContext[JsValue]), ApiSubscriptionDemand](NotificationActionType),
      fields[(DataStore, DaikokuActionContext[JsValue]), ApiSubscriptionDemand](
        Field("api", StringType /*ApiIdType*/, resolve = _.value.api.value),
        Field("team", StringType /*TeamIdType*/, resolve = _.value.team.value),
        Field("plan", StringType /*UsagePlanIdType*/, resolve = _.value.plan.value),
        Field("parentSubscriptionId", OptionType(StringType /*ApiSubscriptionIdType*/), resolve = _.value.parentSubscriptionId.map(_.value))
      )
    ))
    val  OtoroshiSyncSubscriptionErrorType = new PossibleObject(ObjectType(
      "OtoroshiSyncSubscriptionError",
      "OtoroshiSyncSubscriptionError description",
      interfaces[(DataStore, DaikokuActionContext[JsValue]), OtoroshiSyncSubscriptionError](OtoroshiSyncNotificationActionType),
      fields[(DataStore, DaikokuActionContext[JsValue]), OtoroshiSyncSubscriptionError](
        Field("subscription", ApiSubscriptionType, resolve = _.value.subscription),
        Field("message", StringType, resolve = _.value.message)
      )
    ))
    val  OtoroshiSyncApiErrorType = new PossibleObject(ObjectType(
      "OtoroshiSyncApiError",
      "OtoroshiSyncApiError description",
      interfaces[(DataStore, DaikokuActionContext[JsValue]), OtoroshiSyncApiError](OtoroshiSyncNotificationActionType),
      fields[(DataStore, DaikokuActionContext[JsValue]), OtoroshiSyncApiError](
        Field("api", ApiType, resolve = _.value.api),
        Field("message", StringType, resolve = _.value.message)
      )
    ))
    val  ApiKeyDeletionInformationType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiKeyDeletionInformation](
      Interfaces(NotificationActionType)
    ))
    val  ApiKeyRotationInProgressType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiKeyRotationInProgress](
      Interfaces(NotificationActionType)
    ))
    val  ApiKeyRotationEndedType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiKeyRotationEnded](
      Interfaces(NotificationActionType)
    ))
    val  ApiKeyRefreshType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiKeyRefresh](
      Interfaces(NotificationActionType)
    ))
    val  NewPostPublishedType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), NewPostPublished](
      Interfaces(NotificationActionType)
    ))
    val  NewIssueOpenType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), NewIssueOpen](
      Interfaces(NotificationActionType)
    ))
    val  NewCommentOnIssueType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), NewCommentOnIssue](
      Interfaces(NotificationActionType)
    ))

    val  NotificationInterfaceType: InterfaceType[(DataStore, DaikokuActionContext[JsValue]), NotificationType] = InterfaceType(
      "NotificationType",
      "NotificationType description",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), NotificationType](
        Field("value", StringType, resolve = _.value.value)
      )
    )

    val  NotificationType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), Notification](
      ReplaceField("id", Field("_id", StringType /*NotificationIdType*/, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", StringType /*TenantIdType*/, resolve = _.value.tenant.value)),
      ReplaceField("team", Field("team", OptionType(StringType /*TeamIdType*/), resolve = _.value.team.map(_.value))),
      ReplaceField("sender", Field("sender", UserType, resolve = _.value.sender)),
      ReplaceField("date", Field("date", DateTimeUnitype, resolve = _.value.date)),
      ReplaceField("notificationType", Field("notificationType", NotificationInterfaceType, resolve = _.value.notificationType)),
      ReplaceField("status", Field("status", NotificationStatusType, resolve = _.value.status, possibleTypes = List(NotificationStatusAcceptedType, NotificationStatusRejectedType, NotificationStatusPendingType))),
      ReplaceField("action", Field("action", NotificationActionType, resolve = _.value.action, possibleTypes = List(ApiAccessType, TeamAccessType, TeamInvitationType, ApiSubscriptionDemandType, OtoroshiSyncSubscriptionErrorType, OtoroshiSyncApiErrorType,
        ApiKeyDeletionInformationType, ApiKeyRotationInProgressType, ApiKeyRotationEndedType, ApiKeyRefreshType, NewPostPublishedType, NewIssueOpenType, NewCommentOnIssueType
      ))),
    )

    val  FiniteDurationType = ObjectType(
      "FiniteDuration",
      "FiniteDuration description",
      fields[(DataStore, DaikokuActionContext[JsValue]), FiniteDuration](
        Field("length", LongType, resolve = _.value.length),
        Field("unit", TimeUnitType, resolve = _.value.unit),
      )
    )

    val  UserSessionType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), UserSession](
      ReplaceField("id", Field("_id", StringType /*DatastoreIdType*/, resolve = _.value.id.value)),
      ReplaceField("userId", Field("userId", StringType /*UserIdType*/, resolve = _.value.userId.value)),
      ReplaceField("sessionId", Field("sessionId", StringType /*UserSessionIdType*/, resolve = _.value.sessionId.value)),
      ReplaceField("impersonatorId", Field("impersonatorId", OptionType(StringType /*UserIdType*/), resolve = _.value.impersonatorId.map(_.value))),
      ReplaceField("impersonatorSessionId", Field("impersonatorSessionId", OptionType(StringType /*UserSessionIdType*/), resolve = _.value.impersonatorSessionId.map(_.value))),
      ReplaceField("created", Field("created", DateTimeUnitype, resolve = _.value.created)),
      ReplaceField("ttl", Field("ttl", FiniteDurationType, resolve = _.value.ttl)),
      ReplaceField("expires", Field("expires", DateTimeUnitype, resolve = _.value.expires))
    )

    val  ApiKeyGlobalConsumptionInformationsType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiKeyGlobalConsumptionInformations]()
    val  ApiKeyQuotasType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiKeyQuotas]()
    val  ApiKeyBillingType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiKeyBilling]()

    val  ApiKeyConsumptionType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiKeyConsumption](
      ReplaceField("id", Field("_id", StringType /*DatastoreIdType*/, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", StringType /*TenantIdType*/, resolve = _.value.tenant.value)),
      ReplaceField("team", Field("team", StringType /*TeamIdType*/, resolve = _.value.team.value)),
      ReplaceField("api", Field("api", StringType /*ApiIdType*/, resolve = _.value.api.value)),
      ReplaceField("plan", Field("plan", StringType /*UsagePlanIdType*/, resolve = _.value.plan.value)),
      ReplaceField("globalInformations", Field("globalInformations", ApiKeyGlobalConsumptionInformationsType, resolve = _.value.globalInformations)),
      ReplaceField("quotas", Field("quotas", ApiKeyQuotasType, resolve = _.value.quotas)),
      ReplaceField("billing", Field("billing", ApiKeyBillingType, resolve = _.value.billing)),
      ReplaceField("from", Field("from", DateTimeUnitype, resolve = _.value.from)),
      ReplaceField("to", Field("to", DateTimeUnitype, resolve = _.value.to))
    )

    val  PasswordResetType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), PasswordReset](
      ReplaceField("id", Field("_id", StringType /*DatastoreIdType*/, resolve = _.value.id.value)),
      ReplaceField("user", Field("user", StringType /*UserIdType*/, resolve = _.value.user.value)),
      ReplaceField("creationDate", Field("creationDate", DateTimeUnitype, resolve = _.value.creationDate)),
      ReplaceField("validUntil", Field("validUntil", DateTimeUnitype, resolve = _.value.validUntil))
    )
    val  AccountCreationType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), AccountCreation](
      ReplaceField("id", Field("_id", StringType /*DatastoreIdType*/, resolve = _.value.id.value)),
      ReplaceField("creationDate", Field("creationDate", DateTimeUnitype, resolve = _.value.creationDate)),
      ReplaceField("validUntil", Field("validUntil", DateTimeUnitype, resolve = _.value.validUntil))
    )
    val  TranslationType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), Translation](
      ReplaceField("id", Field("_id", StringType /*DatastoreIdType*/, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", StringType /*TenantIdType*/, resolve = _.value.tenant.value)),
      ReplaceField("lastModificationAt", Field("lastModificationAt", OptionType(DateTimeUnitype), resolve = _.value.lastModificationAt))
    )
    val  EvolutionType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), Evolution](
      ReplaceField("id", Field("_id", StringType /*DatastoreIdType*/, resolve = _.value.id.value)),
      ReplaceField("date", Field("date", DateTimeUnitype, resolve = _.value.date))
    )

    val  MessageIntefaceType: InterfaceType[(DataStore, DaikokuActionContext[JsValue]), MessageType] = InterfaceType(
      "MessageType",
      "MessageType description",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), MessageType](
        Field("name", StringType, resolve = _.value.value.value)
      ))

    val  MessageType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), Message](
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", OptionType(TenantType), resolve = ctx => ctx.ctx._1.tenantRepo.findById(ctx.ctx._2.tenant.id))),
      ReplaceField("messageType", Field("messageType", MessageIntefaceType, resolve = _.value.messageType)),
      ReplaceField("participants", Field("participants", ListType(UserType), resolve = ctx =>
        ctx.ctx._1.userRepo.find(Json.obj("_id" -> Json.obj("$in" -> JsArray(ctx.value.participants.toSeq.map(_.asJson)))))
      )),
      ReplaceField("readBy", Field("readBy", ListType(UserType), resolve = ctx =>
        ctx.ctx._1.userRepo.find(Json.obj("_id" -> Json.obj("$in" -> JsArray(ctx.value.readBy.toSeq.map(_.asJson)))))
      )),
      ReplaceField("chat", Field("chat", OptionType(UserType), resolve = ctx => ctx.ctx._1.userRepo.findById(ctx.value.chat))),
      ReplaceField("date", Field("date", DateTimeUnitype, resolve = _.value.date)),
      ReplaceField("sender", Field("sender", OptionType(UserType), resolve = ctx => ctx.ctx._1.userRepo.findById(ctx.value.sender))),
      ReplaceField("closed", Field("closed", OptionType(DateTimeUnitype), resolve = _.value.closed)),
      ReplaceField("send", Field("send", BooleanType, resolve = _.value.send)),
    )

    val  AuthorizationLevelType: InterfaceType[(DataStore, DaikokuActionContext[JsValue]), AuthorizationLevel] = InterfaceType(
      "AuthorizationLevel",
      "AuthorizationLevel description",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), AuthorizationLevel](
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

    val AuditEventType: InterfaceType[(DataStore, DaikokuActionContext[JsValue]), AuditEvent] = InterfaceType(
      "AuditEvent",
      "AuditEvent description",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), AuditEvent](
        Field("message", StringType, resolve = _.value.message)
      )
    )
    val AuditTrailEventType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), AuditTrailEvent](
      Interfaces(AuditEventType)
    )
    val JobEventType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), JobEvent](
      Interfaces(AuditEventType)
    )
    val AlertEventType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), AlertEvent](
      Interfaces(AuditEventType)
    )
    val ApiKeyRotationEventType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiKeyRotationEvent](
      Interfaces(AuditEventType),
      ReplaceField("subscription",
        Field("subscription", ApiSubscriptionIdType, resolve = _.value.subscription)
      )
    )
    val TenantAuditEventType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), TenantAuditEvent](
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
    val UserAuditEventType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), UserAuditEvent](
      ReplaceField("id", Field("_id", StringType /*UserIdType*/, resolve = _.value.id.value))
    )

    val  UserAuditEventTypeReader = new Format[UserAuditEvent] {
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
    val  TenantAuditEventType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), TenantAuditEvent](
      ReplaceField("id", Field("_id", StringType /*TenantIdType*/, resolve = _.value.id.value))
    )

    val  TenantAuditEventTypeReader = new Format[TenantAuditEvent] {
      override def reads(json: JsValue): JsResult[TenantAuditEvent] = JsSuccess(
        TenantAuditEvent(
          id = (json \ "id").as(TenantIdFormat),
          name = (json \ "name").as[String]
        ))
      override def writes(o: TenantAuditEvent): JsValue = Json.obj()
    }

    val  AuditEventType = ObjectType[(DataStore, DaikokuActionContext[JsValue]), JsObject](
      "AuditEvent",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), JsObject](
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

    TenantType = ObjectType[(DataStore, DaikokuActionContext[JsValue]), Tenant](
      "Tenant",
      "Tenant description",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), Tenant](
        Field("id", StringType, resolve = _.value.id.value),
        Field("enabled", BooleanType, resolve = _.value.enabled),
        Field("deleted", BooleanType, resolve = _.value.deleted),
        Field("name", StringType, resolve = _.value.name),
        Field("domain", StringType, resolve = _.value.domain),
        Field("exposedPort", OptionType(IntType), resolve = _.value.exposedPort),
        Field("contact", StringType, resolve = _.value.contact),
        Field("style", OptionType(DaikokuStyleType), resolve = _.value.style),
        Field("defaultLanguage", OptionType(StringType), resolve = _.value.defaultLanguage),
        Field("otoroshiSettings", ListType(OtoroshiSettingsType), resolve = _.value.otoroshiSettings.toSeq),
        Field("mailerSettings", OptionType(MailerSettingsType), resolve = _.value.mailerSettings,
          possibleTypes = List(
            ConsoleMailerSettingsType, MailgunSettingsType, MailjetSettingsType, SimpleSMTPSettingsType, SendgridSettingsType
          )),
        Field("bucketSettings", OptionType(BucketSettingsType), resolve = _.value.bucketSettings),
        Field("authProvider", StringType, resolve = _.value.authProvider.name),
        Field("authProviderSettings", JsonType, resolve = _.value.authProviderSettings),
        Field("auditTrailConfig", AuditTrailConfigType, resolve = _.value.auditTrailConfig),
        Field("isPrivate", BooleanType, resolve = _.value.isPrivate),
        Field("adminApi", OptionType(ApiType), resolve = ctx => ctx.ctx._1.apiRepo.forTenant(ctx.ctx._2.tenant).findById(ctx.value.adminApi)),
        Field("adminSubscriptions", ListType(ApiSubscriptionType), resolve = ctx => ctx.ctx._1.apiSubscriptionRepo.forTenant(ctx.ctx._2.tenant)
          .find(Json.obj(
            "_id" -> Json.obj("$in" -> JsArray(ctx.value.adminSubscriptions.map(_.asJson)))
          ))),
        Field("creationSecurity", OptionType(BooleanType), resolve = _.value.creationSecurity),
        Field("subscriptionSecurity", OptionType(BooleanType), resolve = _.value.subscriptionSecurity),
        Field("apiReferenceHideForGuest", OptionType(BooleanType), resolve = _.value.apiReferenceHideForGuest),
        Field("hideTeamsPage", OptionType(BooleanType), resolve = _.value.hideTeamsPage),
        Field("defaultMessage", OptionType(StringType), resolve = _.value.defaultMessage),
        Field("tenantMode", OptionType(StringType), resolve = _.value.tenantMode.map(_.name)),
        Field("aggregationApiKeysSecurity", OptionType(BooleanType), resolve = _.value.aggregationApiKeysSecurity)
      )
    )

    val  ID: Argument[String] = Argument("id", StringType, description = "id of element")
    val  TEAM_ID: Argument[String] = Argument("teamId", StringType, description = "id of the team")

    def teamQueryFields(): List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] = List(
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

    def apiQueryFields(): List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] = List(
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

      Field("api", OptionType(ApiType), arguments = List(ID), resolve = ctx => ctx.ctx._1.apiRepo.forTenant(ctx.ctx._2.tenant).findById(ctx arg ID)),
      Field("apis", ListType(ApiType), resolve = ctx => ctx.ctx._1.apiRepo.forTenant(ctx.ctx._2.tenant).findAll()),

      Field("team", OptionType(TeamObjectType), arguments = List(ID),
        resolve = ctx => ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant).findById(ctx arg ID)),
      Field("teams", ListType(TeamObjectType), resolve = ctx => ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant).findAll()),

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
        (allFields() ++ teamQueryFields() ++ apiQueryFields()):_*
      )
    )

    (Schema(Query), resolver)
  }
}
