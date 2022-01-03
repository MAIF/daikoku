package fr.maif.otoroshi.daikoku.domain

import akka.http.scaladsl.util.FastFuture
import fr.maif.otoroshi.daikoku.actions.DaikokuActionContext
import fr.maif.otoroshi.daikoku.audit._
import fr.maif.otoroshi.daikoku.audit.config._
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async._UberPublicUserAccess
import fr.maif.otoroshi.daikoku.domain.NotificationAction._
import fr.maif.otoroshi.daikoku.domain.ValueType
import fr.maif.otoroshi.daikoku.domain.json.{TenantIdFormat, UserIdFormat}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.S3Configuration
import org.joda.time.format.ISODateTimeFormat
import org.joda.time.{DateTime, DateTimeZone}
import play.api.libs.json._
import sangria.ast.{ObjectValue, StringValue}
import sangria.execution.deferred.{DeferredResolver, Fetcher, HasId}
import sangria.macros.derive._
import sangria.schema.{Context, _}
import sangria.validation.ValueCoercionViolation
import storage.{DataStore, _}

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

    lazy val TenantType: ObjectType[(DataStore, DaikokuActionContext[JsValue]), Tenant] = ObjectType[(DataStore, DaikokuActionContext[JsValue]), Tenant]("Tenant",
      "A tenant object",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), Tenant](
        Field("id", StringType, resolve = _.value.id.value),
        Field("enabled", BooleanType, resolve = _.value.enabled),
        Field("deleted", BooleanType, resolve = _.value.deleted),
        Field("name", StringType, resolve = _.value.name),
        Field("domain", StringType, resolve = _.value.domain),
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

    lazy val DaikokuStyleType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), DaikokuStyle](
      ObjectTypeDescription("A set of css, js and colors to customize Daikoku elements")
    )
    lazy val ElasticAnalyticsConfigType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ElasticAnalyticsConfig](
      ObjectTypeDescription("A configuration to connect with elasticsearch cluster"),
      ReplaceField("headers", Field("headers", MapType, resolve = _.value.headers))
    )
    lazy val WebhookType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), Webhook](
      ObjectTypeDescription("A configuration of a Kakfa web hook"),
      ReplaceField("headers", Field("headers", MapType, resolve = _.value.headers))
    )
    lazy val  KafkaConfigType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), KafkaConfig](
      ObjectTypeDescription("A configuration to connect with a kafka"),
    )

    lazy val  AuditTrailConfigType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), AuditTrailConfig](
      ObjectTypeDescription("A configuration to push audit trails inside ES/Kafka/..."),
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

    lazy val OtoroshiSettingsType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), OtoroshiSettings](
      ObjectTypeDescription("Settings to communicate with an instance of Otoroshi"),
      ReplaceField("id", Field("id", StringType, resolve = _.value.id.value))
    )
    lazy val MailerSettingsType: InterfaceType[(DataStore, DaikokuActionContext[JsValue]), MailerSettings] = InterfaceType(
      "MailerSettings",
      "A template of mailer",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), MailerSettings](
        Field("mailerType", StringType, resolve = _.value.mailerType)
      )
    )
    lazy val ConsoleMailerSettingsType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ConsoleMailerSettings](
      ObjectTypeDescription("A mailer to write mails on the standard output"),
      Interfaces(MailerSettingsType)
    ))
    lazy val MailgunSettingsType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), MailgunSettings](
      ObjectTypeDescription("A mailer to send mails with a Mailgun service"),
      Interfaces(MailerSettingsType)
    ))
    lazy val MailjetSettingsType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), MailjetSettings](
      ObjectTypeDescription("A mailer to send mails with a Mailjet service"),
      Interfaces(MailerSettingsType)
    ))
    lazy val SimpleSMTPSettingsType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), SimpleSMTPSettings](
      ObjectTypeDescription("A STMP mailer configuration"),
      Interfaces(MailerSettingsType)
    ))
    lazy val SendgridSettingsType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), SendgridSettings](
      ObjectTypeDescription("A mailer to send mails with a Sendgrid service"),
      Interfaces(MailerSettingsType)
    ))

    lazy val  BucketSettingsType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), S3Configuration](
      ObjectTypeDescription("A S3 configuration to manage assets inside Daikoku"),
    )

    lazy val  ApiKeyRestrictionPathType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiKeyRestrictionPath]()
    lazy val  ApiKeyRestrictionsType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiKeyRestrictions](
      ObjectTypeDescription("A set of restrictions apply on an api key"),
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

    lazy val  CustomMetadataType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), CustomMetadata](
      ObjectTypeDescription("Custom metadata attached to an api key"),
      ReplaceField("possibleValues",
        Field("possibleValues", ListType(StringType), resolve = _.value.possibleValues.toSeq)
      )
    )
    lazy val  ApikeyCustomizationType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApikeyCustomization](
      ObjectTypeDescription("Additional information of an api key"),
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

    lazy val  AuthorizedEntitiesType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), AuthorizedEntities](
      ObjectTypeDescription("Groups and services allowed to be reached with an api key"),
      ReplaceField("services",
        Field("services", ListType(StringType), resolve = _.value.services.toSeq.map(_.value))
      ),
      ReplaceField("groups",
        Field("groups", ListType(StringType), resolve = _.value.groups.toSeq.map(_.value))
      )
    )

    lazy val  OtoroshiTargetType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), OtoroshiTarget](
      ObjectTypeDescription("Complete configuration to communicate with an instance of Otoroshi"),
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

    lazy val  BillingTimeUnitInterfaceType = InterfaceType(
      "BillingTimeUnit",
      "Interface of billing Time : hour, day, month or year",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), BillingTimeUnit](
        Field("name", StringType, resolve = _.value.name)
      )
    )

    lazy val  BillingDurationType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), BillingDuration](
      ObjectTypeDescription("A possible value of billing duration"),
      ReplaceField("unit",
        Field("unit", BillingTimeUnitInterfaceType, resolve = _.value.unit)
      )
    )

    lazy val  UsagePlanVisibilityType = InterfaceType(
      "UsagePlanVisibility",
      "Interface of Usage Plan Visibility",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), UsagePlanVisibility](
        Field("name", StringType, resolve = _.value.name)
      )
    )

    lazy val  SubscriptionProcessType = InterfaceType(
      "SubscriptionProcess",
      "Interface of SubscriptionProcess",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), SubscriptionProcess](
        Field("name", StringType, resolve = _.value.name)
      )
    )

    lazy val  IntegrationProcessType = InterfaceType(
      "IntegrationProcess",
      "Interface of IntegrationProcess",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), IntegrationProcess](
        Field("name", StringType, resolve = _.value.name)
      )
    )

    lazy val TeamObjectType: ObjectType[(DataStore, DaikokuActionContext[JsValue]), Team] = ObjectType[(DataStore, DaikokuActionContext[JsValue]), Team](
      "Team",
      "A Daikoku Team object",
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
        Field("_humanReadableId", StringType, resolve = _.value.humanReadableId),
        Field("apisCreationPermission", OptionType(BooleanType), resolve = _.value.apisCreationPermission)
      )
    )

    lazy val UsagePlanInterfaceType = InterfaceType(
      name = "UsagePlan",
      description = "A plan of api in Daikoku",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), UsagePlan](
        Field("_id", StringType, resolve = _.value.id.value),
        Field("costPerMonth", BigDecimalType, resolve = _.value.costPerMonth),
        Field("maxRequestPerSecond", OptionType(LongType), resolve = _.value.maxRequestPerSecond),
        Field("maxRequestPerDay", OptionType(LongType), resolve = _.value.maxRequestPerDay),
        Field("maxRequestPerMonth", OptionType(LongType), resolve = _.value.maxRequestPerMonth),
        Field("allowMultipleKeys", OptionType(BooleanType), resolve = _.value.allowMultipleKeys),
        Field("autoRotation", OptionType(BooleanType), resolve = _.value.autoRotation),
        Field("currency", StringType, resolve = _.value.currency.code),
        Field("customName", OptionType(StringType), resolve = _.value.customName),
        Field("customDescription", OptionType(StringType), resolve = _.value.customDescription),
        Field("otoroshiTarget", OptionType(OtoroshiTargetType), resolve = _.value.otoroshiTarget),
        Field("trialPeriod", OptionType(BillingDurationType), resolve = _.value.trialPeriod),
        Field("billingDuration", BillingDurationType, resolve = _.value.billingDuration),
        Field("typeName", StringType, resolve = _.value.typeName),
        Field("visibility", UsagePlanVisibilityType, resolve = _.value.visibility),
        Field("authorizedTeams", ListType(OptionType(TeamObjectType)), resolve = ctx =>
            Future.sequence(ctx.value.authorizedTeams.map(team => ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant).findById(team)))
        ),
        Field("subscriptionProcess", SubscriptionProcessType, resolve = _.value.subscriptionProcess),
        Field("integrationProcess", IntegrationProcessType, resolve = _.value.integrationProcess),
        Field("aggregationApiKeysSecurity", OptionType(BooleanType), resolve = _.value.aggregationApiKeysSecurity),
        Field("type", StringType, resolve = _.value.typeName)
      )
    )

    lazy val  AdminUsagePlanType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), UsagePlan.Admin](
      Interfaces(UsagePlanInterfaceType),
      ObjectTypeDescription("An Api plan visible only by admins"),
      ReplaceField("id", Field("id", StringType, resolve = ctx => ctx.value.id.value)),
      ReplaceField("otoroshiTarget",
        Field("otoroshiTarget", OptionType(OtoroshiTargetType), resolve = ctx => ctx.value.otoroshiTarget)
      ),
      ReplaceField("authorizedTeams",
        Field("authorizedTeams", ListType(OptionType(TeamObjectType)), resolve = ctx =>
          Future.sequence(ctx.value.authorizedTeams.map(team => ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant).findById(team)))
        )),
      AddFields(
        Field("type", StringType, resolve = _.value.typeName)
      )
    ))

    lazy val  FreeWithoutQuotasUsagePlanType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), UsagePlan.FreeWithoutQuotas](
      Interfaces(UsagePlanInterfaceType),
      ObjectTypeDescription("An Api plan which generate api key without quotas"),
      ReplaceField("currency", Field("currency", StringType, resolve = _.value.currency.code)),
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value)),
      ReplaceField("billingDuration", Field("billingDuration", BillingDurationType, resolve = _.value.billingDuration)),
      ReplaceField("subscriptionProcess", Field("subscriptionProcess", SubscriptionProcessType, resolve = _.value.subscriptionProcess)),
      ReplaceField("integrationProcess", Field("integrationProcess", IntegrationProcessType, resolve = _.value.integrationProcess)),
      ReplaceField("otoroshiTarget",
        Field("otoroshiTarget", OptionType(OtoroshiTargetType), resolve = _.value.otoroshiTarget)),
      ReplaceField("visibility",
        Field("visibility", UsagePlanVisibilityType, resolve = _.value.visibility)),
      ReplaceField("authorizedTeams",
        Field("authorizedTeams", ListType(OptionType(TeamObjectType)), resolve = ctx =>
          Future.sequence(ctx.value.authorizedTeams.map(team => ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant).findById(team)))
        )),
      AddFields(
        Field("type", StringType, resolve = _.value.typeName)
      )
    ))

    lazy val  FreeWithQuotasUsagePlanType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), UsagePlan.FreeWithQuotas](
      Interfaces(UsagePlanInterfaceType),
      ObjectTypeDescription("An Api plan which generate api key with quotas"),
      ReplaceField("currency", Field("currency", StringType, resolve = _.value.currency.code)),
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value)),
      ReplaceField("billingDuration", Field("billingDuration", BillingDurationType, resolve = _.value.billingDuration)),
      ReplaceField("subscriptionProcess", Field("subscriptionProcess", SubscriptionProcessType, resolve = _.value.subscriptionProcess)),
      ReplaceField("integrationProcess", Field("integrationProcess", IntegrationProcessType, resolve = _.value.integrationProcess)),
      ReplaceField("otoroshiTarget",
        Field("otoroshiTarget", OptionType(OtoroshiTargetType), resolve = _.value.otoroshiTarget)),
      ReplaceField("visibility",
        Field("visibility", UsagePlanVisibilityType, resolve = _.value.visibility)),
      ReplaceField("authorizedTeams",
        Field("authorizedTeams", ListType(OptionType(TeamObjectType)), resolve = ctx =>
          Future.sequence(ctx.value.authorizedTeams.map(team => ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant).findById(team)))
        )),
      AddFields(
        Field("type", StringType, resolve = _.value.typeName)
      )
    ))

    lazy val  QuotasWithLimitsType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), UsagePlan.QuotasWithLimits](
      Interfaces(UsagePlanInterfaceType),
      ObjectTypeDescription("An Api plan which generate api key with limited quotas"),
      ReplaceField("currency", Field("currency", StringType, resolve = _.value.currency.code)),
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value)),
      ReplaceField("trialPeriod", Field("trialPeriod", OptionType(BillingDurationType), resolve = _.value.trialPeriod)),
      ReplaceField("billingDuration", Field("billingDuration", BillingDurationType, resolve = _.value.billingDuration)),
      ReplaceField("subscriptionProcess", Field("subscriptionProcess", SubscriptionProcessType, resolve = _.value.subscriptionProcess)),
      ReplaceField("integrationProcess", Field("integrationProcess", IntegrationProcessType, resolve = _.value.integrationProcess)),
      ReplaceField("otoroshiTarget",
        Field("otoroshiTarget", OptionType(OtoroshiTargetType), resolve = _.value.otoroshiTarget)),
      ReplaceField("visibility",
        Field("visibility", UsagePlanVisibilityType, resolve = _.value.visibility)),
      ReplaceField("authorizedTeams",
        Field("authorizedTeams", ListType(OptionType(TeamObjectType)), resolve = ctx =>
          Future.sequence(ctx.value.authorizedTeams.map(team => ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant).findById(team)))
        )),
      AddFields(
        Field("type", StringType, resolve = _.value.typeName)
      )
    ))

    lazy val  QuotasWithoutLimitsType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), UsagePlan.QuotasWithoutLimits](
      Interfaces(UsagePlanInterfaceType),
      ObjectTypeDescription("An Api plan which generate api key with quotas but not limited"),
      ReplaceField("currency", Field("currency", StringType, resolve = _.value.currency.code)),
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value)),
      ReplaceField("trialPeriod", Field("trialPeriod", OptionType(BillingDurationType), resolve = _.value.trialPeriod)),
      ReplaceField("billingDuration", Field("billingDuration", BillingDurationType, resolve = _.value.billingDuration)),
      ReplaceField("subscriptionProcess", Field("subscriptionProcess", SubscriptionProcessType, resolve = _.value.subscriptionProcess)),
      ReplaceField("integrationProcess", Field("integrationProcess", IntegrationProcessType, resolve = _.value.integrationProcess)),
      ReplaceField("otoroshiTarget",
        Field("otoroshiTarget", OptionType(OtoroshiTargetType), resolve = _.value.otoroshiTarget)),
      ReplaceField("visibility",
        Field("visibility", UsagePlanVisibilityType, resolve = _.value.visibility)),
      ReplaceField("authorizedTeams",
          Field("authorizedTeams", ListType(OptionType(TeamObjectType)), resolve = ctx =>
            Future.sequence(ctx.value.authorizedTeams.map(team => ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant).findById(team)))
          )),
      AddFields(
        Field("type", StringType, resolve = _.value.typeName)
      )
    ))

    lazy val  PayPerUseType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), UsagePlan.PayPerUse](
      Interfaces(UsagePlanInterfaceType),
      ObjectTypeDescription("An Api plan which generate api key where you need to pay per use"),
      ReplaceField("currency", Field("currency", StringType, resolve = _.value.currency.code)),
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value)),
      ReplaceField("trialPeriod", Field("trialPeriod", OptionType(BillingDurationType), resolve = _.value.trialPeriod)),
      ReplaceField("billingDuration", Field("billingDuration", BillingDurationType, resolve = _.value.billingDuration)),
      ReplaceField("subscriptionProcess", Field("subscriptionProcess", SubscriptionProcessType, resolve = _.value.subscriptionProcess)),
      ReplaceField("integrationProcess", Field("integrationProcess", IntegrationProcessType, resolve = _.value.integrationProcess)),
      ReplaceField("otoroshiTarget",
        Field("otoroshiTarget", OptionType(OtoroshiTargetType), resolve = _.value.otoroshiTarget)),
      ReplaceField("visibility",
        Field("visibility", UsagePlanVisibilityType, resolve = _.value.visibility)),
      ReplaceField("authorizedTeams",
        Field("authorizedTeams", ListType(OptionType(TeamObjectType)), resolve = ctx =>
          Future.sequence(ctx.value.authorizedTeams.map(team => ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant).findById(team)))
        )),
      AddFields(
        Field("type", StringType, resolve = _.value.typeName)
      )
    ))

    lazy val  OtoroshiApiKeyType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), OtoroshiApiKey](
      ObjectTypeDescription("A representation of an Otoroshi api key"),
    )
    lazy val  SwaggerAccessType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), SwaggerAccess](
      ObjectTypeDescription("A configuration to display content of a swagger"),
      ReplaceField("headers",
        Field("headers", MapType, resolve = _.value.headers))
    )
    lazy val ApiDocumentationPageType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiDocumentationPage](
      ObjectTypeDescription("A page of documentation"),
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", OptionType(TenantType), resolve = ctx =>
        ctx.ctx._1.tenantRepo.findById(ctx.value.tenant))),
      ReplaceField("lastModificationAt", Field("lastModificationAt", DateTimeUnitype, resolve = _.value.lastModificationAt)),
      ReplaceField("remoteContentHeaders", Field("remoteContentHeaders", MapType, resolve = _.value.remoteContentHeaders)),
      AddFields(
        Field("_humanReadableId", StringType, resolve = _.value.humanReadableId)
      )
    )

    lazy val ApiDocumentationType = ObjectType(
      "ApiDocumentation",
      "The documentation of an api composed of multiples pages",
      fields[(DataStore, DaikokuActionContext[JsValue]), ApiDocumentation](
        Field("id", StringType, resolve = _.value.id.value),
        Field("tenant", OptionType(TenantType), resolve = ctx =>
          ctx.ctx._1.tenantRepo.findById(ctx.value.tenant)),
        Field("pages", ListType(OptionType(ApiDocumentationPageType)), resolve = ctx => Future.sequence(
          ctx.value.pages.map(page => ctx.ctx._1.apiDocumentationPageRepo.forTenant(ctx.ctx._2.tenant).findById(page))
        )),
        Field("lastModificationAt", DateTimeUnitype, resolve = _.value.lastModificationAt)
      )
    )
    lazy val  ApiPostType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiPost](
      ObjectTypeDescription("A post of an api used to communicate with consumers"),
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", OptionType(TenantType), resolve = ctx =>
        ctx.ctx._1.tenantRepo.findById(ctx.value.tenant))),
      ReplaceField("lastModificationAt", Field("lastModificationAt", DateTimeUnitype, resolve = _.value.lastModificationAt)),
      AddFields(
        Field("_humanReadableId", StringType, resolve = _.value.humanReadableId)
      )
    )
    lazy val  TwoFactorAuthenticationType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), TwoFactorAuthentication](
      ObjectTypeDescription("A two factor authentication configuration of an user account"),
    )
    lazy val  ApiIssueTagType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiIssueTag](
      ObjectTypeDescription("A tag used on issues"),
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value))
    )
    lazy val  ApiIssueCommentType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiIssueComment](
      ObjectTypeDescription("A comment on an issue"),
      ReplaceField("by", Field("by", OptionType(UserType), resolve = ctx => ctx.ctx._1.userRepo.findById(ctx.value.by))),
      ReplaceField("createdAt", Field("createdAt", DateTimeUnitype, resolve = _.value.createdAt)),
      ReplaceField("lastModificationAt", Field("lastModificationAt", DateTimeUnitype, resolve = _.value.lastModificationAt))
    )
    lazy val  ApiIssueType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiIssue](
      ObjectTypeDescription("An issue on an api"),
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", OptionType(TenantType), resolve = ctx =>
        ctx.ctx._1.tenantRepo.findById(ctx.value.tenant)
      )),
      ReplaceField("tags", Field("tags", ListType(StringType), resolve = _.value.tags.map(_.value).toSeq)),
      ReplaceField("createdAt", Field("createdAt", DateTimeUnitype, resolve = _.value.createdAt)),
      ReplaceField("closedAt", Field("closedAt", OptionType(DateTimeUnitype), resolve = _.value.closedAt)),
      ReplaceField("by", Field("by", OptionType(UserType), resolve = ctx => ctx.ctx._1.userRepo.findById(ctx.value.by))),
      ReplaceField("comments", Field("comments", ListType(ApiIssueCommentType), resolve = _.value.comments)),
      ReplaceField("lastModificationAt", Field("lastModificationAt", DateTimeUnitype, resolve = _.value.lastModificationAt)),
      AddFields(
        Field("_humanReadableId", StringType, resolve = _.value.humanReadableId)
      )
    )
    lazy val UserInvitationType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), UserInvitation](
      ObjectTypeDescription("An user invitation sended by authenticated user to ask to join his team"),
      ReplaceField("createdAt", Field("createdAt", DateTimeUnitype, resolve = _.value.createdAt)),
    )

    lazy val UserType = ObjectType[(DataStore, DaikokuActionContext[JsValue]), User](
        "User",
        "A Daikoku user",
        () => fields[(DataStore, DaikokuActionContext[JsValue]), User](
          Field("id", StringType, resolve = _.value.id.value),
          Field("deleted", BooleanType, resolve = _.value.deleted),
          Field("tenants", ListType(OptionType(TenantType)), resolve = ctx => Future.sequence(
              ctx.value.tenants.toSeq.map(_.value).map(tenant => ctx.ctx._1.tenantRepo.findById(tenant)))),
          Field("origins", ListType(StringType), resolve = _.value.origins.map(_.name).toSeq),
          Field("name", StringType, resolve = _.value.name),
          Field("email", StringType, resolve = _.value.email),
          Field("picture", StringType, resolve = _.value.picture),
          Field("pictureFromProvider", BooleanType, resolve = _.value.pictureFromProvider),
          Field("personalToken", OptionType(StringType), resolve = _.value.personalToken),
          Field("isDaikokuAdmin", BooleanType, resolve = _.value.isDaikokuAdmin),
          Field("password", OptionType(StringType), resolve = _.value.password),
          Field("hardwareKeyRegistrations", ListType(JsonType), resolve = _.value.hardwareKeyRegistrations),
          Field("lastTenant", OptionType(TenantType), resolve = ctx => ctx.value.lastTenant match {
            case Some(tenant) => ctx.ctx._1.tenantRepo.findById(tenant)
            case None => None
          }),
          Field("metadata", MapType, resolve = _.value.metadata),
          Field("defaultLanguage", OptionType(StringType), resolve = _.value.defaultLanguage),
          Field("isGuest", BooleanType, resolve = _.value.isGuest),
          Field("starredApis", ListType(OptionType(ApiType)), resolve = ctx =>
              Future.sequence(ctx.value.starredApis.toSeq.map(_.value).map(api => ctx.ctx._1.apiRepo.forTenant(ctx.ctx._2.tenant).findById(api)))),
          Field("twoFactorAuthentication", OptionType(TwoFactorAuthenticationType), resolve = _.value.twoFactorAuthentication),
          Field("invitation", OptionType(UserInvitationType), resolve = _.value.invitation),
          Field("_humanReadableId", StringType, resolve = _.value.humanReadableId)
        )
      )

    lazy val TeamPermissionEnum = EnumType(
      "TeamPermission",
      Some("Type of permissions assigned to each member of a team"),
      List(
        EnumValue("Administrator", value = "Administrator"),
        EnumValue("ApiEditor", value = "ApiEditor"),
        EnumValue("User", value = "User")
      )
    )

    lazy val UserWithPermissionType = ObjectType(
      "UserWithPermission",
      "A user permission on a specific team",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), UserWithPermission](
        Field("user", OptionType(UserType), resolve = ctx => ctx.ctx._1.userRepo.findById(ctx.value.userId)),
        Field("teamPermission", TeamPermissionEnum, resolve = _.value.teamPermission.name)
      )
    )

    lazy val ApiSubscriptionRotationType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiSubscriptionRotation](
      ObjectTypeDescription("A configuration to cover the rotation of the credentials of an api key")
    )

    lazy val ApiSubscriptionType: ObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiSubscription] = ObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiSubscription](
      "ApiSubscriptionType",
      "A subscription on an api plan",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), ApiSubscription](
        Field("_id", StringType, resolve = _.value.id.value),
        Field("tenant", OptionType(TenantType), resolve =
          ctx => ctx.ctx._1.tenantRepo.findById(ctx.value.tenant.value)),
        Field("deleted", BooleanType, resolve = _.value.deleted),
        Field("apiKey", OtoroshiApiKeyType, resolve = _.value.apiKey),
        Field("plan", OptionType(UsagePlanInterfaceType), resolve = ctx =>
          ctx.ctx._1.apiRepo.forTenant(ctx.ctx._2.tenant).findById(ctx.value.api.value)
            .map {
              case Some(api) => api.possibleUsagePlans.find(p => p.id == ctx.value.plan)
              case None => None
            },
          possibleTypes = List(AdminUsagePlanType, FreeWithQuotasUsagePlanType, FreeWithoutQuotasUsagePlanType,
            PayPerUseType, QuotasWithLimitsType, QuotasWithoutLimitsType)),
        Field("createdAt", DateTimeUnitype, resolve = _.value.createdAt),
        Field("team", OptionType(TeamObjectType), resolve = ctx =>
          ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant).findById(ctx.value.team)),
        Field("api", OptionType(ApiType), resolve = ctx =>
          ctx.ctx._1.apiRepo.forTenant(ctx.ctx._2.tenant).findById(ctx.value.api)),
        Field("by", OptionType(UserType), resolve = ctx => ctx.ctx._1.userRepo.findById(ctx.value.by)),
        Field("customName", OptionType(StringType), resolve = _.value.customName),
        Field("enabled", BooleanType, resolve = _.value.enabled),
        Field("rotation", OptionType(ApiSubscriptionRotationType), resolve = _.value.rotation),
        Field("integrationToken", StringType, resolve = _.value.integrationToken),
        Field("customMetadata", OptionType(JsonType), resolve = _.value.customMetadata),
        Field("customMaxPerSecond", OptionType(LongType), resolve = _.value.customMaxPerSecond),
        Field("customMaxPerDay", OptionType(LongType), resolve = _.value.customMaxPerDay),
        Field("customMaxPerMonth", OptionType(LongType), resolve = _.value.customMaxPerMonth),
        Field("customReadOnly", OptionType(BooleanType), resolve = _.value.customReadOnly),
        Field("parent", OptionType(ApiSubscriptionType), resolve = ctx => ctx.value.parent match {
          case Some(parent) => ctx.ctx._1.apiSubscriptionRepo.forTenant(ctx.ctx._2.tenant).findById(parent)
          case None => None
        })
      )
    )

    lazy val TestingAuthType = EnumType(
      "TestingAuth",
      Some("TestingAuth"),
      List(
        EnumValue("ApiKey", value = "ApiKey"),
        EnumValue("Basic", value = "Basic")
      )
    )

    lazy val TestingConfigType = ObjectType[(DataStore, DaikokuActionContext[JsValue]), TestingConfig](
      "TestingConfig",
      "A configuration to try to call an api on Otorshi from the Daikoku UI",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), TestingConfig](
        Field("otoroshiSettings", StringType, resolve = _.value.otoroshiSettings.value),
        Field("authorizedEntities", OptionType(AuthorizedEntitiesType), resolve = _.value.authorizedEntities),
        Field("api", OptionType(ApiType),
          resolve = ctx => ctx.ctx._1.apiRepo.forTenant(ctx.ctx._2.tenant).findById(ctx.value.api.value)),
        Field("customMetadata", OptionType(JsonType), resolve = _.value.customMetadata)
      )
    )

    lazy val TestingType: ObjectType[(DataStore, DaikokuActionContext[JsValue]), Testing] = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), Testing](
      ObjectTypeName("Testing"),
      ObjectTypeDescription("Credentials used to test an api from UI"),
      ReplaceField("auth", Field("auth", TestingAuthType, resolve = _.value.auth.name)),
      ReplaceField("config", Field("config", OptionType(TestingConfigType), resolve = _.value.config))
    )

    lazy val teamsFetcher = Fetcher(
      (ctx: (DataStore, DaikokuActionContext[JsValue]), teams: Seq[TeamId]) => Future.sequence(teams.map(teamId =>
        ctx._1.teamRepo.forTenant(ctx._2.tenant).findById(teamId)))
        .map(teams => teams.flatten)
      )(HasId[Team, TeamId](_.id))

    lazy val ApiType: ObjectType[(DataStore, DaikokuActionContext[JsValue]), Api] = ObjectType[(DataStore, DaikokuActionContext[JsValue]), Api](
      "Api",
      "A Daikoku Api",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), Api](
        Field("_id", StringType, resolve = _.value.id.value),
        Field("tenant", OptionType(TenantType), resolve = ctx => ctx.ctx._1.tenantRepo.findById(ctx.ctx._2.tenant.id)),
        Field("deleted", BooleanType, resolve = _.value.deleted),
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
        Field("tags", ListType(StringType), resolve = _.value.tags.toSeq),
        Field("categories", ListType(StringType), resolve = _.value.categories.toSeq),
        Field("stars", IntType, resolve = _.value.stars),
        Field("_humanReadableId", StringType, resolve = _.value.humanReadableId),
        Field("team", TeamObjectType, resolve = ctx => teamsFetcher.defer(ctx.value.team)),
        Field("parent", OptionType(ApiType), resolve = ctx =>
          ctx.value.parent match {
            case Some(p) => ctx.ctx._1.apiRepo.forTenant(ctx.ctx._2.tenant).findById(p)
            case None => None
          }
        ),
      )
    )

    case class AuthorizationApi(team: String, authorized: Boolean, pending: Boolean)
    lazy val  AuthorizationApiType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), AuthorizationApi]()

    case class GraphQLApi(api: Api, authorizations: Seq[AuthorizationApi] = Seq.empty)

    lazy val GraphQLApiType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), GraphQLApi](
      ObjectTypeDescription("A Daikoku api with the list of teams authorizations"),
      ReplaceField("api", Field("api", ApiType, resolve = _.value.api)),
      ReplaceField("authorizations", Field("authorizations", ListType(AuthorizationApiType), resolve = _.value.authorizations))
    )

    lazy val  NotificationStatusType: InterfaceType[(DataStore, DaikokuActionContext[JsValue]), NotificationStatus] = InterfaceType(
      "NotificationStatus",
      "The status of a notification",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), NotificationStatus](
        Field("_generated", StringType, resolve = _.value.toString) // TODO - can't generate interface without fields
      )
    )

    lazy val  NotificationStatusAcceptedType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), NotificationStatus.Accepted](
      Interfaces(NotificationStatusType),
      ObjectTypeDescription("An accepted notification status"),
      ReplaceField("date",
        Field("date", DateTimeUnitype, resolve = _.value.date)
      )
    ))

    lazy val  NotificationStatusRejectedType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), NotificationStatus.Rejected](
      Interfaces(NotificationStatusType),
      ObjectTypeDescription("A rejected notification status"),
      ReplaceField("date",
        Field("date", DateTimeUnitype, resolve = _.value.date)
      )
    ))

    lazy val  NotificationStatusPendingType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), NotificationStatus.Pending](
      Interfaces(NotificationStatusType),
      ObjectTypeDescription("A pending notification status"),
      AddFields(
        Field("_generated", StringType, resolve = _.value.toString) // TODO - can't generate interface without fields
      )
    ))

    lazy val  NotificationActionType: InterfaceType[(DataStore, DaikokuActionContext[JsValue]), NotificationAction] = InterfaceType(
      "NotificationAction",
      "An action of notification",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), NotificationAction](
        Field("_generated", StringType, resolve = _.value.toString) // TODO - can't generate interface without fields
      )
    )
    lazy val  OtoroshiSyncNotificationActionType: InterfaceType[(DataStore, DaikokuActionContext[JsValue]), OtoroshiSyncNotificationAction] = InterfaceType(
      "OtoroshiSyncNotificationAction",
      "A Otoroshi notification triggered when the synchronization with an otoroshi is done",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), OtoroshiSyncNotificationAction](
        Field("message", StringType, resolve = _.value.message)
      )
    )

    lazy val ApiAccessType = new PossibleObject(ObjectType(
      "ApiAccess",
      "A api access notification action",
      interfaces[(DataStore, DaikokuActionContext[JsValue]), ApiAccess](NotificationActionType),
      fields[(DataStore, DaikokuActionContext[JsValue]), ApiAccess](
        Field("api", OptionType(ApiType),
          resolve = ctx => ctx.ctx._1.apiRepo.forTenant(ctx.ctx._2.tenant).findById(ctx.value.api)),
        Field("team", OptionType(TeamObjectType),
          resolve = ctx => ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant).findById(ctx.value.team))
      )
    ))
    lazy val  TeamAccessType = new PossibleObject(ObjectType(
      "TeamAccess",
      "A team access notification action",
      interfaces[(DataStore, DaikokuActionContext[JsValue]), TeamAccess](NotificationActionType),
      fields[(DataStore, DaikokuActionContext[JsValue]), TeamAccess](
        Field("team", OptionType(TeamObjectType),
          resolve = ctx => ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant).findById(ctx.value.team))
      )
    ))
    lazy val  TeamInvitationType = new PossibleObject(ObjectType(
      "TeamInvitation",
      "A team invitation notification action",
      interfaces[(DataStore, DaikokuActionContext[JsValue]), TeamInvitation](NotificationActionType),
      fields[(DataStore, DaikokuActionContext[JsValue]), TeamInvitation](
        Field("team", OptionType(TeamObjectType),
          resolve = ctx => ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant).findById(ctx.value.team)),
        Field("user", OptionType(UserType),
          resolve = ctx => ctx.ctx._1.userRepo.findById(ctx.value.user))
      )
    ))
    lazy val  ApiSubscriptionDemandType = new PossibleObject(ObjectType(
      "ApiSubscriptionDemand",
      "A api subscription notification action",
      interfaces[(DataStore, DaikokuActionContext[JsValue]), ApiSubscriptionDemand](NotificationActionType),
      fields[(DataStore, DaikokuActionContext[JsValue]), ApiSubscriptionDemand](
        Field("api", OptionType(ApiType),
          resolve = ctx => ctx.ctx._1.apiRepo.forTenant(ctx.ctx._2.tenant).findById(ctx.value.api)),
        Field("team", OptionType(TeamObjectType),
          resolve = ctx => ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant).findById(ctx.value.team)),
        Field("plan", OptionType(UsagePlanInterfaceType), resolve = ctx =>
          ctx.ctx._1.apiRepo.forTenant(ctx.ctx._2.tenant).findById(ctx.value.api.value)
            .map {
              case Some(api) => api.possibleUsagePlans.find(p => p.id == ctx.value.plan)
              case None => None
            },
          possibleTypes = List(AdminUsagePlanType, FreeWithQuotasUsagePlanType, FreeWithoutQuotasUsagePlanType,
            PayPerUseType, QuotasWithLimitsType, QuotasWithoutLimitsType)),
        Field("parentSubscriptionId", OptionType(ApiSubscriptionType), resolve = ctx => ctx.value.parentSubscriptionId match {
          case Some(parent) => ctx.ctx._1.apiSubscriptionRepo.forTenant(ctx.ctx._2.tenant).findById(parent)
          case None => None
        })
      )
    ))
    lazy val  OtoroshiSyncSubscriptionErrorType = new PossibleObject(ObjectType(
      "OtoroshiSyncSubscriptionError",
      "A Otoroshi notification triggered when the synchronization with an otoroshi had failed",
      interfaces[(DataStore, DaikokuActionContext[JsValue]), OtoroshiSyncSubscriptionError](OtoroshiSyncNotificationActionType),
      fields[(DataStore, DaikokuActionContext[JsValue]), OtoroshiSyncSubscriptionError](
        Field("subscription", ApiSubscriptionType, resolve = _.value.subscription),
        Field("message", StringType, resolve = _.value.message)
      )
    ))
    lazy val  OtoroshiSyncApiErrorType = new PossibleObject(ObjectType(
      "OtoroshiSyncApiError",
      "An Otoroshi notification triggered when syncing an API with an otoroshi failed",
      interfaces[(DataStore, DaikokuActionContext[JsValue]), OtoroshiSyncApiError](OtoroshiSyncNotificationActionType),
      fields[(DataStore, DaikokuActionContext[JsValue]), OtoroshiSyncApiError](
        Field("api", ApiType, resolve = _.value.api),
        Field("message", StringType, resolve = _.value.message)
      )
    ))
    lazy val  ApiKeyDeletionInformationType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiKeyDeletionInformation](
      ObjectTypeDescription("An Otoroshi notification triggered when an api key has been deleted"),
      Interfaces(NotificationActionType)
    ))
    lazy val  ApiKeyRotationInProgressType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiKeyRotationInProgress](
      ObjectTypeDescription("An Otoroshi notification triggered when the credentials of an api key is in rotation progress"),
      Interfaces(NotificationActionType)
    ))
    lazy val  ApiKeyRotationEndedType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiKeyRotationEnded](
      ObjectTypeDescription("An Otoroshi notification triggered when the credentials of an api key has been rotated"),
      Interfaces(NotificationActionType)
    ))
    lazy val  ApiKeyRefreshType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiKeyRefresh](
      ObjectTypeDescription("An Otoroshi notification triggered when an api key has been refreshed"),
      Interfaces(NotificationActionType)
    ))
    lazy val  NewPostPublishedType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), NewPostPublished](
      ObjectTypeDescription("An Otoroshi notification triggered when a new post has been pusblished"),
      Interfaces(NotificationActionType)
    ))
    lazy val  NewIssueOpenType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), NewIssueOpen](
      ObjectTypeDescription("An Otoroshi notification triggered when a new issue has been created"),
      Interfaces(NotificationActionType)
    ))
    lazy val  NewCommentOnIssueType = new PossibleObject(deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), NewCommentOnIssue](
      ObjectTypeDescription("An Otoroshi notification triggered when a new comment has been written"),
      Interfaces(NotificationActionType)
    ))

    lazy val  NotificationInterfaceType: InterfaceType[(DataStore, DaikokuActionContext[JsValue]), NotificationType] = InterfaceType(
      "NotificationType",
      "Interface of a notification",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), NotificationType](
        Field("value", StringType, resolve = _.value.value)
      )
    )

    lazy val  NotificationType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), Notification](
      ObjectTypeDescription("A default notification object"),
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", OptionType(TenantType), resolve = ctx =>
        ctx.ctx._1.tenantRepo.findById(ctx.value.tenant.value)
      )),
      ReplaceField("team", Field("team", OptionType(TeamObjectType), resolve = ctx => ctx.value.team match {
        case Some(team) => ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant).findById(team)
        case None => None
      })),
      ReplaceField("sender", Field("sender", UserType, resolve = _.value.sender)),
      ReplaceField("date", Field("date", DateTimeUnitype, resolve = _.value.date)),
      ReplaceField("notificationType", Field("notificationType", NotificationInterfaceType, resolve = _.value.notificationType)),
      ReplaceField("status", Field("status", NotificationStatusType, resolve = _.value.status, possibleTypes = List(NotificationStatusAcceptedType, NotificationStatusRejectedType, NotificationStatusPendingType))),
      ReplaceField("action", Field("action", NotificationActionType, resolve = _.value.action, possibleTypes = List(ApiAccessType, TeamAccessType, TeamInvitationType, ApiSubscriptionDemandType, OtoroshiSyncSubscriptionErrorType, OtoroshiSyncApiErrorType,
        ApiKeyDeletionInformationType, ApiKeyRotationInProgressType, ApiKeyRotationEndedType, ApiKeyRefreshType, NewPostPublishedType, NewIssueOpenType, NewCommentOnIssueType
      ))),
    )

    lazy val  FiniteDurationType = ObjectType(
      "FiniteDuration",
      "A finite duration",
      fields[(DataStore, DaikokuActionContext[JsValue]), FiniteDuration](
        Field("length", LongType, resolve = _.value.length),
        Field("unit", TimeUnitType, resolve = _.value.unit),
      )
    )

    lazy val UserSessionType: ObjectType[(DataStore, DaikokuActionContext[JsValue]), UserSession] = ObjectType[(DataStore, DaikokuActionContext[JsValue]), UserSession](
      "UserSession",
      "A user session",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), UserSession](
        Field("_id", StringType, resolve = _.value.id.value),
        Field("userId", OptionType(UserType), resolve = ctx => ctx.ctx._1.userRepo.findById(ctx.value.userId)),
        Field("sessionId", StringType, resolve = _.value.sessionId.value),
        Field("userName", StringType, resolve = _.value.userName),
        Field("userEmail", StringType, resolve = _.value.userEmail),
        Field("impersonatorId", OptionType(UserType), resolve = ctx => ctx.value.impersonatorId match {
          case Some(u) => ctx.ctx._1.userRepo.findById(u)
          case None => None
        }),
        Field("impersonatorName", OptionType(StringType), resolve = _.value.impersonatorName),
        Field("impersonatorEmail", OptionType(StringType), resolve = _.value.impersonatorEmail),
        Field("impersonatorSessionId", OptionType(UserSessionType), resolve = ctx =>
          ctx.value.impersonatorSessionId match {
            case Some(imp) => ctx.ctx._1.userSessionRepo.findById(imp.value)
            case None => None
          }),
        Field("created", DateTimeUnitype, resolve = _.value.created),
        Field("ttl", FiniteDurationType, resolve = _.value.ttl),
        Field("expires", DateTimeUnitype, resolve = _.value.expires)
      )
    )

    val  ApiKeyGlobalConsumptionInformationsType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiKeyGlobalConsumptionInformations](
      ObjectTypeDescription("Consumptions of an api key")
    )
    val  ApiKeyQuotasType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiKeyQuotas](
      ObjectTypeDescription("Quotas of an api key")
    )
    val  ApiKeyBillingType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiKeyBilling](
      ObjectTypeDescription("Billing of an api key")
    )

    val  ApiKeyConsumptionType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiKeyConsumption](
      ObjectTypeDescription("Quotas and information about an api key"),
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value)),
      ReplaceField("tenant", Field("tenant", OptionType(TenantType), resolve = ctx =>
        ctx.ctx._1.tenantRepo.findById(ctx.value.tenant.value)
      )),
      ReplaceField("team", Field("team", OptionType(TeamObjectType), resolve = ctx =>
        ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant).findById(ctx.value.team.value)
      )),
      ReplaceField("api", Field("api", OptionType(ApiType), resolve = ctx =>
        ctx.ctx._1.apiRepo.forTenant(ctx.ctx._2.tenant).findById(ctx.value.api)
      )),
      ReplaceField("plan", Field("plan", OptionType(UsagePlanInterfaceType), resolve = ctx =>
        ctx.ctx._1.apiRepo.forTenant(ctx.ctx._2.tenant)
          .findById(ctx.value.api.value)
          .map {
            case Some(api) => api.possibleUsagePlans.find(p => p.id == ctx.value.plan)
            case None => None
          },
        possibleTypes = List(AdminUsagePlanType, FreeWithQuotasUsagePlanType, FreeWithoutQuotasUsagePlanType,
          PayPerUseType, QuotasWithLimitsType, QuotasWithoutLimitsType))),
      ReplaceField("globalInformations", Field("globalInformations", ApiKeyGlobalConsumptionInformationsType, resolve = _.value.globalInformations)),
      ReplaceField("quotas", Field("quotas", ApiKeyQuotasType, resolve = _.value.quotas)),
      ReplaceField("billing", Field("billing", ApiKeyBillingType, resolve = _.value.billing)),
      ReplaceField("from", Field("from", DateTimeUnitype, resolve = _.value.from)),
      ReplaceField("to", Field("to", DateTimeUnitype, resolve = _.value.to))
    )

    val  PasswordResetType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), PasswordReset](
      ObjectTypeDescription("Information to reset the account password of an user."),
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value)),
      ReplaceField("user", Field("user", OptionType(UserType), resolve = ctx =>
        ctx.ctx._1.userRepo.findById(ctx.value.user.value)
      )),
      ReplaceField("creationDate", Field("creationDate", DateTimeUnitype, resolve = _.value.creationDate)),
      ReplaceField("validUntil", Field("validUntil", DateTimeUnitype, resolve = _.value.validUntil))
    )
    val  AccountCreationType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), AccountCreation](
      ObjectTypeDescription("A new user awaiting confirmation of their account."),
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value)),
      ReplaceField("creationDate", Field("creationDate", DateTimeUnitype, resolve = _.value.creationDate)),
      ReplaceField("validUntil", Field("validUntil", DateTimeUnitype, resolve = _.value.validUntil))
    )
    lazy val TranslationType = ObjectType[(DataStore, DaikokuActionContext[JsValue]), Translation](
      "Translation",
      "A translation of Daikoku elements like (mail, notification, buttons, title ...).",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), Translation](
        Field("_id", StringType, resolve = _.value.id.value),
        Field("tenant", OptionType(TenantType), resolve = ctx =>
          ctx.ctx._1.tenantRepo.findById(ctx.value.tenant.value)
        ),
        Field("language", StringType, resolve = _.value.language),
        Field("key", StringType, resolve = _.value.key),
        Field("value", StringType, resolve = _.value.value),
        Field("lastModificationAt", OptionType(DateTimeUnitype), resolve = _.value.lastModificationAt)
      ))

    /*val  EvolutionType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), Evolution](
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value)),
      ReplaceField("date", Field("date", DateTimeUnitype, resolve = _.value.date))
    )*/

    val  MessageIntefaceType: InterfaceType[(DataStore, DaikokuActionContext[JsValue]), MessageType] = InterfaceType(
      "MessageInterface",
      "An in-app message interface.",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), MessageType](
        Field("name", StringType, resolve = _.value.value.value)
      ))

    val  MessageType = ObjectType[(DataStore, DaikokuActionContext[JsValue]), Message](
      "Message",
      "An in-app message.",
      () => fields[(DataStore, DaikokuActionContext[JsValue]), Message](
        Field("_id", StringType, resolve = _.value.id.value),
        Field("tenant", OptionType(TenantType), resolve = ctx => ctx.ctx._1.tenantRepo.findById(ctx.ctx._2.tenant.id)),
        Field("messageType", MessageIntefaceType, resolve = _.value.messageType),
        Field("participants", ListType(UserType), resolve = ctx =>
          ctx.ctx._1.userRepo.find(Json.obj("_id" -> Json.obj("$in" -> JsArray(ctx.value.participants.toSeq.map(_.asJson)))))
        ),
        Field("readBy", ListType(UserType), resolve = ctx =>
          ctx.ctx._1.userRepo.find(Json.obj("_id" -> Json.obj("$in" -> JsArray(ctx.value.readBy.toSeq.map(_.asJson)))))
        ),
        Field("chat", OptionType(UserType), resolve = ctx => ctx.ctx._1.userRepo.findById(ctx.value.chat)),
        Field("date", DateTimeUnitype, resolve = _.value.date),
        Field("sender", OptionType(UserType), resolve = ctx => ctx.ctx._1.userRepo.findById(ctx.value.sender)),
        Field("message", StringType, resolve = _.value.message),
        Field("closed", OptionType(DateTimeUnitype), resolve = _.value.closed),
        Field("send", BooleanType, resolve = _.value.send)
      )
    )

    case class UserAuditEvent(id: UserId, name: String, email: String, isDaikokuAdmin: Boolean)
    val UserAuditEventType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), UserAuditEvent](
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value))
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
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value))
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
      "An audit event",
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

    val ID: Argument[String] = Argument("id", StringType, description = "The id of element")
    val TEAM_ID: Argument[String] = Argument("teamId", StringType, description = "The id of the team")
    val LIMIT: Argument[Int] = Argument("limit", IntType,
      description = "The maximum number of entries to return. If the value exceeds the maximum, then the maximum value will be used.", defaultValue = -1)
    val OFFSET: Argument[Int] = Argument("offset", IntType,
      description = "The (zero-based) offset of the first item in the collection to return", defaultValue = 0)

    def teamQueryFields(): List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] = List(
      Field("myTeams", ListType(TeamObjectType),
        resolve = ctx =>
          _UberPublicUserAccess(AuditTrailEvent("@{user.name} has accessed his team list"))(ctx.ctx._2) {
            (if (ctx.ctx._2.user.isDaikokuAdmin)
              ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant)
                .findAllNotDeleted()
            else
              ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant)
                .findNotDeleted(Json.obj("users.userId" -> ctx.ctx._2.user.id.value))
            )
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
          case Some(id) => teamRepo.find(Json.obj("_humanReadableId" -> id))
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

              (if (user.isDaikokuAdmin)
                adminApis.map(api => GraphQLApi(api, teams.map(team =>
                  AuthorizationApi(
                    team = team.id.value,
                    authorized = user.isDaikokuAdmin && team.`type` == TeamType.Personal && team.users.exists(u => u.userId == user.id),
                    pending = false
                  )
                ))) ++ sortedApis
              else
                sortedApis)
                .groupBy(p => (p.api.currentVersion, p.api.humanReadableId))
                .map(res => res._2.head)
                .toSeq
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

    def getRepoFields[Out, Of, Id <: ValueType](
                                               fieldName: String,
                                               fieldType: OutputType[Out],
                                               repo: Context[(DataStore, DaikokuActionContext[JsValue]), Unit] => Repo[Of, Id]): List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] =
      List(
        Field(fieldName, OptionType(fieldType), arguments = List(ID),
          resolve = ctx => repo(ctx).findById(ctx arg ID).asInstanceOf[Option[Out]]),
        Field(s"${fieldName}s", ListType(fieldType), arguments = LIMIT :: OFFSET :: Nil,
          resolve = ctx => {
            (ctx.arg(LIMIT), ctx.arg(OFFSET)) match {
              case (-1, _) => repo(ctx).findAll().map(_.asInstanceOf[Seq[Out]])
              case (limit, offset) => repo(ctx).findWithPagination(Json.obj(), offset, limit).map(_._1.asInstanceOf[Seq[Out]])
            }
          })
      )

    def getTenantFields[Out, Of, Id <: ValueType](
                                               fieldName: String,
                                               fieldType: OutputType[Out],
                                               repo: Context[(DataStore, DaikokuActionContext[JsValue]), Unit] => TenantCapableRepo[Of, Id]): List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] =
      getRepoFields(fieldName, fieldType, ctx => repo(ctx).forTenant(ctx.ctx._2.tenant))

    def allFields(): List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] =
      List(getRepoFields("user", UserType, ctx => ctx.ctx._1.userRepo) ++
      getRepoFields("userSession", UserSessionType, ctx => ctx.ctx._1.userSessionRepo) ++
      getRepoFields("tenant", TenantType, ctx => ctx.ctx._1.tenantRepo) ++
      getRepoFields("passwordReset", PasswordResetType, ctx => ctx.ctx._1.passwordResetRepo) ++
      getRepoFields("accountCreation", AccountCreationType, ctx => ctx.ctx._1.accountCreationRepo) ++
      // getRepoFields("evolution", EvolutionType, ctx => ctx.ctx._1.evolutionRepo) ++

      getTenantFields("api", ApiType, ctx => ctx.ctx._1.apiRepo) ++
      getTenantFields("team", TeamObjectType, ctx => ctx.ctx._1.teamRepo) ++
      getTenantFields("translation", TranslationType, ctx => ctx.ctx._1.translationRepo) ++
      getTenantFields("message", MessageType, ctx => ctx.ctx._1.messageRepo) ++
      getTenantFields("apiSubscription", ApiSubscriptionType, ctx => ctx.ctx._1.apiSubscriptionRepo) ++
      getTenantFields("apiDocumentationPage", ApiDocumentationPageType, ctx => ctx.ctx._1.apiDocumentationPageRepo) ++
      getTenantFields("notification", NotificationType, ctx => ctx.ctx._1.notificationRepo) ++
      getTenantFields("consumption", ApiKeyConsumptionType, ctx => ctx.ctx._1.consumptionRepo) ++
      getTenantFields("post", ApiPostType, ctx => ctx.ctx._1.apiPostRepo) ++
      getTenantFields("issue", ApiIssueType, ctx => ctx.ctx._1.apiIssueRepo) ++
      getTenantFields("auditEvent", AuditEventType, ctx => ctx.ctx._1.auditTrailRepo):_*)

    (
      Schema(ObjectType("Query",
        () => fields[(DataStore, DaikokuActionContext[JsValue]), Unit](allFields() ++ teamQueryFields() ++ apiQueryFields():_*)
      )),
      DeferredResolver.fetchers(teamsFetcher)
    )
  }
}
