package fr.maif.otoroshi.daikoku.domain

import cats.data.EitherT
import cats.implicits.catsSyntaxOptionId
import controllers.AppError
import fr.maif.otoroshi.daikoku.actions.DaikokuActionContext
import fr.maif.otoroshi.daikoku.audit._
import fr.maif.otoroshi.daikoku.audit.config._
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async.{
  _TeamMemberOnly,
  _TenantAdminAccessTenant
}
import fr.maif.otoroshi.daikoku.domain.NotificationAction._
import fr.maif.otoroshi.daikoku.domain.json.{TenantIdFormat, UserIdFormat}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.{OtoroshiClient, S3Configuration}
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.joda.time.{DateTime, DateTimeZone}
import play.api.libs.json._
import sangria.ast.{BigDecimalValue, ObjectValue, StringValue}
import sangria.execution.deferred.{DeferredResolver, Fetcher, HasId}
import sangria.macros.derive._
import sangria.schema.{Context, _}
import sangria.validation.ValueCoercionViolation
import services.CmsPage
import storage._

import java.util.concurrent.TimeUnit
import scala.concurrent.Future
import scala.concurrent.duration.FiniteDuration
import scala.util.{Failure, Success, Try}

object SchemaDefinition {
  case object JsArrayCoercionViolation
      extends ValueCoercionViolation("Can't parse string to js array")
  case object JsonCoercionViolation
      extends ValueCoercionViolation("Not valid JSON")
  case object DateCoercionViolation
      extends ValueCoercionViolation("Date value expected")
  case object MapCoercionViolation
      extends ValueCoercionViolation("Map value can't be parsed")

  implicit val TimeUnitType: ScalarType[TimeUnit] = ScalarType[TimeUnit](
    "TimeUnit",
    description = Some("TimeUnit type"),
    coerceOutput = (value, _) => value,
    coerceUserInput = {
      case s: String => Right(TimeUnit.valueOf(s))
      case _         => Left(JsArrayCoercionViolation)
    },
    coerceInput = {
      case StringValue(s, _, _, _, _) => Right(TimeUnit.valueOf(s))
      case _                          => Left(JsArrayCoercionViolation)
    }
  )

  implicit val JsArrayType: ScalarType[JsArray] = ScalarType[JsArray](
    "JsArray",
    description = Some("JsArray type"),
    coerceOutput = (value, _) => value,
    coerceUserInput = {
      case s: String => Right(Json.parse(s).as[JsArray])
      case _         => Left(JsArrayCoercionViolation)
    },
    coerceInput = {
      case StringValue(s, _, _, _, _) => Right(Json.parse(s).as[JsArray])
      case _                          => Left(JsArrayCoercionViolation)
    }
  )

  implicit val JsonType: ScalarType[JsValue] = ScalarType[JsValue](
    "Json",
    description = Some("Raw JSON value"),
    coerceOutput = (value, _) => value,
    coerceUserInput = {
      case v: String     => Right(JsString(v))
      case v: Boolean    => Right(JsBoolean(v))
      case v: Int        => Right(JsNumber(v))
      case v: Long       => Right(JsNumber(v))
      case v: Float      => Right(JsNumber(v))
      case v: Double     => Right(JsNumber(v))
      case v: BigInt     => Right(JsNumber(v.toInt))
      case v: BigDecimal => Right(JsNumber(v))
      case v: JsValue    => Right(v)
    },
    coerceInput = {
      case StringValue(jsonStr, _, _, _, _) => Right(JsString(jsonStr))
      case _                                => Left(JsonCoercionViolation)
    }
  )

  def parseDate(s: String) =
    Try(new DateTime(s, DateTimeZone.UTC)) match {
      case Success(date) => Right(date)
      case Failure(_)    => Left(DateCoercionViolation)
    }

  val DateTimeUnitype = ScalarType[DateTime](
    "DateTime",
    coerceOutput = (date, _) => BigDecimalValue(BigDecimal(date.getMillis)),
    coerceUserInput = {
      case s: String => parseDate(s)
      case _         => Left(DateCoercionViolation)
    },
    coerceInput = {
      case StringValue(s, _, _, _, _) => parseDate(s)
      case _                          => Left(DateCoercionViolation)
    }
  )

  val MapType = ScalarType[Map[String, String]](
    "Map",
    coerceOutput = (data, _) =>
      Json.stringify(JsObject(data.view.mapValues(JsString.apply).toSeq)),
    coerceUserInput = e =>
      e.asInstanceOf[Map[String, String]] match {
        case r: Map[String, String] => Right(r)
        case _                      => Left(MapCoercionViolation)
      },
    coerceInput = {
      case ObjectValue(fields, _, _) =>
        Right(fields.map(f => (f.name, f.value.toString)).toMap)
      case _ => Left(MapCoercionViolation)
    }
  )

  case class NotAuthorizedError(message: String) extends Exception(message)

  def getSchema(env: Env, otoroshiClient: OtoroshiClient) = {
    implicit val e = env.defaultExecutionContext
    implicit val en = env

    lazy val TenantType
        : ObjectType[(DataStore, DaikokuActionContext[JsValue]), Tenant] =
      ObjectType[(DataStore, DaikokuActionContext[JsValue]), Tenant](
        "Tenant",
        "A tenant object",
        () =>
          fields[(DataStore, DaikokuActionContext[JsValue]), Tenant](
            Field("id", StringType, resolve = _.value.id.value),
            Field("enabled", BooleanType, resolve = _.value.enabled),
            Field("deleted", BooleanType, resolve = _.value.deleted),
            Field("name", StringType, resolve = _.value.name),
            Field("domain", StringType, resolve = _.value.domain),
            Field("contact", StringType, resolve = _.value.contact),
            Field(
              "style",
              OptionType(DaikokuStyleType),
              resolve = _.value.style
            ),
            Field(
              "defaultLanguage",
              OptionType(StringType),
              resolve = _.value.defaultLanguage
            ),
            Field(
              "otoroshiSettings",
              ListType(OtoroshiSettingsType),
              resolve = _.value.otoroshiSettings.toSeq
            ),
            Field(
              "mailerSettings",
              OptionType(MailerSettingsType),
              resolve = _.value.mailerSettings,
              possibleTypes = List(
                ConsoleMailerSettingsType,
                MailgunSettingsType,
                MailjetSettingsType,
                SimpleSMTPSettingsType,
                SendgridSettingsType
              )
            ),
            Field(
              "bucketSettings",
              OptionType(BucketSettingsType),
              resolve = _.value.bucketSettings
            ),
            Field(
              "authProvider",
              StringType,
              resolve = _.value.authProvider.name
            ),
            Field(
              "authProviderSettings",
              JsonType,
              resolve = _.value.authProviderSettings
            ),
            Field(
              "auditTrailConfig",
              AuditTrailConfigType,
              resolve = _.value.auditTrailConfig
            ),
            Field("isPrivate", BooleanType, resolve = _.value.isPrivate),
            Field(
              "adminApi",
              OptionType(ApiType),
              resolve = ctx =>
                ctx.ctx._1.apiRepo
                  .forTenant(ctx.ctx._2.tenant)
                  .findById(ctx.value.adminApi)
            ),
            Field(
              "adminSubscriptions",
              ListType(ApiSubscriptionType),
              resolve = ctx =>
                ctx.ctx._1.apiSubscriptionRepo
                  .forTenant(ctx.ctx._2.tenant)
                  .find(
                    Json.obj(
                      "_id" -> Json.obj(
                        "$in" -> JsArray(
                          ctx.value.adminSubscriptions.map(_.asJson)
                        )
                      )
                    )
                  )
            ),
            Field(
              "creationSecurity",
              OptionType(BooleanType),
              resolve = _.value.creationSecurity
            ),
            Field(
              "subscriptionSecurity",
              OptionType(BooleanType),
              resolve = _.value.subscriptionSecurity
            ),
            Field(
              "apiReferenceHideForGuest",
              OptionType(BooleanType),
              resolve = _.value.apiReferenceHideForGuest
            ),
            Field(
              "defaultMessage",
              OptionType(StringType),
              resolve = _.value.defaultMessage
            ),
            Field(
              "tenantMode",
              OptionType(StringType),
              resolve = _.value.tenantMode.map(_.name)
            ),
            Field(
              "aggregationApiKeysSecurity",
              OptionType(BooleanType),
              resolve = _.value.aggregationApiKeysSecurity
            ),
            Field(
              "environmentAggregationApiKeysSecurity",
              OptionType(BooleanType),
              resolve = _.value.environmentAggregationApiKeysSecurity
            ),
            Field(
              "display",
              OptionType(StringType),
              resolve = _.value.display.name
            )
          )
      )

    lazy val DaikokuStyleType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      DaikokuStyle
    ](
      ObjectTypeDescription(
        "A set of css, js and colors to customize Daikoku elements"
      )
    )
    lazy val ElasticAnalyticsConfigType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      ElasticAnalyticsConfig
    ](
      ObjectTypeDescription(
        "A configuration to connect with elasticsearch cluster"
      ),
      ReplaceField(
        "headers",
        Field("headers", MapType, resolve = _.value.headers)
      )
    )
    lazy val WebhookType =
      deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), Webhook](
        ObjectTypeDescription("A configuration of a Kakfa web hook"),
        ReplaceField(
          "headers",
          Field("headers", MapType, resolve = _.value.headers)
        )
      )
    lazy val KafkaConfigType =
      deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), KafkaConfig](
        ObjectTypeDescription("A configuration to connect with a kafka")
      )

    lazy val AuditTrailConfigType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      AuditTrailConfig
    ](
      ObjectTypeDescription(
        "A configuration to push audit trails inside ES/Kafka/..."
      ),
      ReplaceField(
        "elasticConfigs",
        Field(
          "elasticConfigs",
          OptionType(ElasticAnalyticsConfigType),
          resolve = _.value.elasticConfigs
        )
      ),
      ReplaceField(
        "auditWebhooks",
        Field(
          "auditWebhooks",
          ListType(WebhookType),
          resolve = _.value.auditWebhooks
        )
      ),
      ReplaceField(
        "kafkaConfig",
        Field(
          "kafkaConfig",
          OptionType(KafkaConfigType),
          resolve = _.value.kafkaConfig
        )
      )
    )

    lazy val OtoroshiSettingsType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      OtoroshiSettings
    ](
      ObjectTypeDescription(
        "Settings to communicate with an instance of Otoroshi"
      ),
      ReplaceField("id", Field("id", StringType, resolve = _.value.id.value)),
      ReplaceField(
        "elasticConfig",
        Field(
          "elasticConfig",
          OptionType(ElasticAnalyticsConfigType),
          resolve = _.value.elasticConfig
        )
      )
    )
    lazy val MailerSettingsType: InterfaceType[
      (DataStore, DaikokuActionContext[JsValue]),
      MailerSettings
    ] = InterfaceType(
      "MailerSettings",
      "A template of mailer",
      () =>
        fields[(DataStore, DaikokuActionContext[JsValue]), MailerSettings](
          Field("mailerType", StringType, resolve = _.value.mailerType)
        )
    )
    lazy val ConsoleMailerSettingsType = new PossibleObject(
      deriveObjectType[
        (DataStore, DaikokuActionContext[JsValue]),
        ConsoleMailerSettings
      ](
        ObjectTypeDescription("A mailer to write mails on the standard output"),
        Interfaces(MailerSettingsType)
      )
    )
    lazy val MailgunSettingsType = new PossibleObject(
      deriveObjectType[
        (DataStore, DaikokuActionContext[JsValue]),
        MailgunSettings
      ](
        ObjectTypeDescription("A mailer to send mails with a Mailgun service"),
        Interfaces(MailerSettingsType)
      )
    )
    lazy val MailjetSettingsType = new PossibleObject(
      deriveObjectType[
        (DataStore, DaikokuActionContext[JsValue]),
        MailjetSettings
      ](
        ObjectTypeDescription("A mailer to send mails with a Mailjet service"),
        Interfaces(MailerSettingsType)
      )
    )
    lazy val SimpleSMTPSettingsType = new PossibleObject(
      deriveObjectType[
        (DataStore, DaikokuActionContext[JsValue]),
        SimpleSMTPSettings
      ](
        ObjectTypeDescription("A STMP mailer configuration"),
        Interfaces(MailerSettingsType)
      )
    )
    lazy val SendgridSettingsType = new PossibleObject(
      deriveObjectType[
        (DataStore, DaikokuActionContext[JsValue]),
        SendgridSettings
      ](
        ObjectTypeDescription("A mailer to send mails with a Sendgrid service"),
        Interfaces(MailerSettingsType)
      )
    )

    lazy val BucketSettingsType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      S3Configuration
    ](
      ObjectTypeDescription(
        "A S3 configuration to manage assets inside Daikoku"
      )
    )

    lazy val ApiKeyRestrictionPathType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      ApiKeyRestrictionPath
    ]()
    lazy val ApiKeyRestrictionsType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      ApiKeyRestrictions
    ](
      ObjectTypeDescription("A set of restrictions apply on an api key"),
      ReplaceField(
        "allowed",
        Field(
          "allowed",
          ListType(ApiKeyRestrictionPathType),
          resolve = _.value.allowed
        )
      ),
      ReplaceField(
        "forbidden",
        Field(
          "forbidden",
          ListType(ApiKeyRestrictionPathType),
          resolve = _.value.forbidden
        )
      ),
      ReplaceField(
        "notFound",
        Field(
          "notFound",
          ListType(ApiKeyRestrictionPathType),
          resolve = _.value.notFound
        )
      )
    )

    lazy val CustomMetadataType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      CustomMetadata
    ](
      ObjectTypeDescription("Custom metadata attached to an api key"),
      ReplaceField(
        "possibleValues",
        Field(
          "possibleValues",
          ListType(StringType),
          resolve = _.value.possibleValues.toSeq
        )
      )
    )
    lazy val ApikeyCustomizationType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      ApikeyCustomization
    ](
      ObjectTypeDescription("Additional information of an api key"),
      ReplaceField(
        "metadata",
        Field("metadata", JsonType, resolve = _.value.metadata)
      ),
      ReplaceField(
        "customMetadata",
        Field(
          "customMetadata",
          ListType(CustomMetadataType),
          resolve = _.value.customMetadata
        )
      ),
      ReplaceField("tags", Field("tags", JsArrayType, resolve = _.value.tags)),
      ReplaceField(
        "restrictions",
        Field(
          "restrictions",
          ApiKeyRestrictionsType,
          resolve = _.value.restrictions
        )
      )
    )

    lazy val AuthorizedEntitiesType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      AuthorizedEntities
    ](
      ObjectTypeDescription(
        "Groups and services allowed to be reached with an api key"
      ),
      ReplaceField(
        "services",
        Field(
          "services",
          ListType(StringType),
          resolve = _.value.services.toSeq.map(_.value)
        )
      ),
      ReplaceField(
        "groups",
        Field(
          "groups",
          ListType(StringType),
          resolve = _.value.groups.toSeq.map(_.value)
        )
      ),
      ReplaceField(
        "routes",
        Field(
          "routes",
          ListType(StringType),
          resolve = _.value.routes.toSeq.map(_.value)
        )
      )
    )

    lazy val OtoroshiTargetType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      OtoroshiTarget
    ](
      ObjectTypeDescription(
        "Complete configuration to communicate with an instance of Otoroshi"
      ),
      ReplaceField(
        "otoroshiSettings",
        Field(
          "otoroshiSettings",
          StringType,
          resolve = _.value.otoroshiSettings.value
        )
      ),
      ReplaceField(
        "authorizedEntities",
        Field(
          "authorizedEntities",
          OptionType(AuthorizedEntitiesType),
          resolve = _.value.authorizedEntities
        )
      ),
      ReplaceField(
        "apikeyCustomization",
        Field(
          "apikeyCustomization",
          ApikeyCustomizationType,
          resolve = _.value.apikeyCustomization
        )
      )
    )

    lazy val BillingTimeUnitInterfaceType = InterfaceType(
      "BillingTimeUnit",
      "Interface of billing Time : hour, day, month or year",
      () =>
        fields[(DataStore, DaikokuActionContext[JsValue]), BillingTimeUnit](
          Field("name", StringType, resolve = _.value.name)
        )
    )

    lazy val BillingDurationType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      BillingDuration
    ](
      ObjectTypeDescription("A possible value of billing duration"),
      ReplaceField(
        "unit",
        Field("unit", BillingTimeUnitInterfaceType, resolve = _.value.unit)
      )
    )

    lazy val ValidationStepInterfaceType = InterfaceType(
      "ValidationStep",
      "Interface of a validation step: email, admin or payment",
      () =>
        fields[(DataStore, DaikokuActionContext[JsValue]), ValidationStep](
          Field("name", StringType, resolve = _.value.name),
          Field("title", StringType, resolve = _.value.title),
          Field("id", StringType, resolve = _.value.id)
        )
    )

    lazy val ValidationStepEmail = new PossibleObject(
      deriveObjectType[
        (DataStore, DaikokuActionContext[JsValue]),
        ValidationStep.Email
      ](
        Interfaces(ValidationStepInterfaceType),
        ObjectTypeDescription("A validation Step by email"),
        ReplaceField(
          "id",
          Field("id", StringType, resolve = ctx => ctx.value.id)
        ),
        ReplaceField(
          "title",
          Field("title", StringType, resolve = ctx => ctx.value.title)
        ),
        ReplaceField(
          "emails",
          Field(
            "emails",
            ListType(StringType),
            resolve = ctx => ctx.value.emails
          )
        )
      )
    )
    lazy val ValidationStepAdmin = new PossibleObject(
      deriveObjectType[
        (DataStore, DaikokuActionContext[JsValue]),
        ValidationStep.TeamAdmin
      ](
        Interfaces(ValidationStepInterfaceType),
        ObjectTypeDescription("A validation Step by team admins"),
        ReplaceField(
          "id",
          Field("id", StringType, resolve = ctx => ctx.value.id)
        ),
        ReplaceField(
          "title",
          Field("title", StringType, resolve = ctx => ctx.value.title)
        ),
        ReplaceField(
          "team",
          Field("team", StringType, resolve = ctx => ctx.value.team.value)
        ),
        ReplaceField(
          "schema",
          Field(
            "schema",
            OptionType(JsonType),
            resolve = ctx => ctx.value.schema
          )
        ),
        ReplaceField(
          "formatter",
          Field(
            "formatter",
            OptionType(StringType),
            resolve = ctx => ctx.value.formatter
          )
        )
      )
    )
    lazy val ValidationStepHttRequest = new PossibleObject(
      deriveObjectType[
        (DataStore, DaikokuActionContext[JsValue]),
        ValidationStep.HttpRequest
      ](
        Interfaces(ValidationStepInterfaceType),
        ObjectTypeDescription("A validation Step by team admins"),
        ReplaceField(
          "id",
          Field("id", StringType, resolve = ctx => ctx.value.id)
        ),
        ReplaceField(
          "title",
          Field("title", StringType, resolve = ctx => ctx.value.title)
        ),
        ReplaceField(
          "url",
          Field("url", StringType, resolve = ctx => ctx.value.url)
        ),
        ReplaceField(
          "headers",
          Field("headers", MapType, resolve = _.value.headers)
        )
      )
    )
    lazy val ValidationStepPayment = new PossibleObject(
      deriveObjectType[
        (DataStore, DaikokuActionContext[JsValue]),
        ValidationStep.Payment
      ](
        Interfaces(ValidationStepInterfaceType),
        ObjectTypeDescription("A validation Step by payment"),
        ReplaceField(
          "id",
          Field("id", StringType, resolve = ctx => ctx.value.id)
        ),
        ReplaceField(
          "title",
          Field("title", StringType, resolve = ctx => ctx.value.title)
        ),
        ReplaceField(
          "thirdPartyPaymentSettingsId",
          Field(
            "thirdPartyPaymentSettingsId",
            StringType,
            resolve = ctx => ctx.value.thirdPartyPaymentSettingsId.value
          )
        )
      )
    )

    lazy val StripePriceIdsType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      StripePriceIds
    ](
      ObjectTypeDescription("Ids of stripe prices for a product"),
      ReplaceField(
        "basePriceId",
        Field("basePriceId", StringType, resolve = _.value.basePriceId)
      ),
      ReplaceField(
        "additionalPriceId",
        Field(
          "additionalPriceId",
          OptionType(StringType),
          resolve = _.value.additionalPriceId
        )
      )
    )

    lazy val UsagePlanVisibilityType = InterfaceType(
      "UsagePlanVisibility",
      "Interface of Usage Plan Visibility",
      () =>
        fields[(DataStore, DaikokuActionContext[JsValue]), UsagePlanVisibility](
          Field("name", StringType, resolve = _.value.name)
        )
    )

    lazy val IntegrationProcessType = InterfaceType(
      "IntegrationProcess",
      "Interface of IntegrationProcess",
      () =>
        fields[(DataStore, DaikokuActionContext[JsValue]), IntegrationProcess](
          Field("name", StringType, resolve = _.value.name)
        )
    )

    lazy val TeamAuthorizedEntitiesType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      TeamAuthorizedEntities
    ](
      ObjectTypeDescription(
        "Groups, services and routes allowed to be reached by team"
      ),
      ReplaceField(
        "otoroshiSettingsId",
        Field(
          "otoroshiSettingsId",
          StringType,
          resolve = _.value.otoroshiSettingsId.value
        )
      ),
      ReplaceField(
        "authorizedEntities",
        Field(
          "authorizedEntities",
          AuthorizedEntitiesType,
          resolve = _.value.authorizedEntities
        )
      )
    )

    lazy val TeamObjectType
        : ObjectType[(DataStore, DaikokuActionContext[JsValue]), Team] =
      ObjectType[(DataStore, DaikokuActionContext[JsValue]), Team](
        "Team",
        "A Daikoku Team object",
        () =>
          fields[(DataStore, DaikokuActionContext[JsValue]), Team](
            Field("_id", StringType, resolve = _.value.id.value),
            Field(
              "tenant",
              OptionType(TenantType),
              resolve = ctx => ctx.ctx._1.tenantRepo.findById(ctx.value.tenant)
            ),
            Field("deleted", BooleanType, resolve = _.value.deleted),
            Field("name", StringType, resolve = _.value.name),
            Field("type", StringType, resolve = _.value.`type`.name),
            Field("description", StringType, resolve = _.value.description),
            Field("contact", StringType, resolve = _.value.contact),
            Field("avatar", OptionType(StringType), resolve = _.value.avatar),
            Field(
              "users",
              ListType(UserWithPermissionType),
              resolve = _.value.users.toSeq
            ),
            Field(
              "authorizedOtoroshiEntities",
              OptionType(ListType(TeamAuthorizedEntitiesType)),
              resolve = _.value.authorizedOtoroshiEntities
            ),
            Field(
              "apiKeyVisibility",
              OptionType(StringType),
              resolve = _.value.apiKeyVisibility.map(_.name)
            ),
            Field(
              "metadata",
              JsonType,
              resolve = _.value.metadata.foldLeft(Json.obj())((obj, entry) =>
                obj + (entry._1 -> JsString(entry._2))
              )
            ),
            Field(
              "_humanReadableId",
              StringType,
              resolve = _.value.humanReadableId
            ),
            Field(
              "apisCreationPermission",
              OptionType(BooleanType),
              resolve = _.value.apisCreationPermission
            ),
            Field("verified", BooleanType, resolve = _.value.verified)
          )
      )
    lazy val CurrencyType = ObjectType(
      name = "Currency",
      description = "Currency for a plan of an api",
      () =>
        fields[(DataStore, DaikokuActionContext[JsValue]), Currency](
          Field("code", StringType, resolve = _.value.code)
        )
    )

    lazy val PaymentSettingsInterfaceType = InterfaceType(
      name = "PaymentSettings",
      description = "a payment settings for usage plan",
      () =>
        fields[(DataStore, DaikokuActionContext[JsValue]), PaymentSettings](
          Field(
            "thirdPartyPaymentSettingsId",
            StringType,
            resolve = _.value.thirdPartyPaymentSettingsId.value
          )
        )
    )

    lazy val StripePaymentSettingsType = new PossibleObject(
      deriveObjectType[
        (DataStore, DaikokuActionContext[JsValue]),
        PaymentSettings.Stripe
      ](
        Interfaces(PaymentSettingsInterfaceType),
        ObjectTypeDescription("Stripe settings - productId and PriceIds"),
        ReplaceField(
          "thirdPartyPaymentSettingsId",
          Field(
            "thirdPartyPaymentSettingsId",
            StringType,
            resolve = ctx => ctx.value.thirdPartyPaymentSettingsId.value
          )
        ),
        ReplaceField(
          "productId",
          Field("productId", StringType, resolve = ctx => ctx.value.productId)
        ),
        ReplaceField(
          "priceIds",
          Field(
            "priceIds",
            StripePriceIdsType,
            resolve = ctx => ctx.value.priceIds
          )
        ),
        AddFields(
          Field("type", StringType, resolve = _.value.typeName)
        )
      )
    )

    lazy val UsagePlanType = ObjectType(
      name = "UsagePlan",
      description = "A plan of api in Daikoku",
      () =>
        fields[(DataStore, DaikokuActionContext[JsValue]), UsagePlan](
          Field("_id", StringType, resolve = _.value.id.value),
          Field(
            "costPerMonth",
            OptionType(BigDecimalType),
            resolve = _.value.costPerMonth
          ),
          Field(
            "maxPerSecond",
            OptionType(LongType),
            resolve = _.value.maxPerSecond
          ),
          Field(
            "maxPerDay",
            OptionType(LongType),
            resolve = _.value.maxPerDay
          ),
          Field(
            "maxPerMonth",
            OptionType(LongType),
            resolve = _.value.maxPerMonth
          ),
          Field(
            "allowMultipleKeys",
            OptionType(BooleanType),
            resolve = _.value.allowMultipleKeys
          ),
          Field(
            "autoRotation",
            OptionType(BooleanType),
            resolve = _.value.autoRotation
          ),
          Field(
            "currency",
            OptionType(CurrencyType),
            resolve = _.value.currency
          ),
          Field(
            "customName",
            OptionType(StringType),
            resolve = _.value.customName
          ),
          Field(
            "customDescription",
            OptionType(StringType),
            resolve = _.value.customDescription
          ),
          Field(
            "otoroshiTarget",
            OptionType(OtoroshiTargetType),
            resolve = _.value.otoroshiTarget
          ),
          Field(
            "trialPeriod",
            OptionType(BillingDurationType),
            resolve = _.value.trialPeriod
          ),
          Field(
            "billingDuration",
            OptionType(BillingDurationType),
            resolve = _.value.billingDuration
          ),
          Field("visibility", StringType, resolve = _.value.visibility.name),
          Field(
            "authorizedTeams",
            ListType(OptionType(TeamObjectType)),
            resolve = ctx =>
              Future.sequence(
                ctx.value.authorizedTeams.map(team =>
                  ctx.ctx._1.teamRepo
                    .forTenant(ctx.ctx._2.tenant)
                    .findById(team)
                )
              )
          ),
          Field(
            "subscriptionProcess",
            ListType(ValidationStepInterfaceType),
            resolve = _.value.subscriptionProcess,
            possibleTypes = List(
              ValidationStepEmail,
              ValidationStepAdmin,
              ValidationStepPayment,
              ValidationStepHttRequest
            )
          ),
          Field(
            "integrationProcess",
            StringType,
            resolve = _.value.integrationProcess.name
          ),
          Field(
            "paymentSettings",
            OptionType(PaymentSettingsInterfaceType),
            resolve = _.value.paymentSettings,
            possibleTypes = List(StripePaymentSettingsType)
          ),
          Field(
            "aggregationApiKeysSecurity",
            OptionType(BooleanType),
            resolve = _.value.aggregationApiKeysSecurity
          )
        )
    )

    lazy val OtoroshiApiKeyType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      OtoroshiApiKey
    ](
      ObjectTypeDescription("A representation of an Otoroshi api key")
    )
    lazy val SwaggerAccessType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      SwaggerAccess
    ](
      ObjectTypeDescription("A configuration to display content of a swagger"),
      ReplaceField(
        "headers",
        Field("headers", MapType, resolve = _.value.headers)
      ),
      ReplaceField(
        "additionalConf",
        Field(
          "additionalConf",
          OptionType(JsonType),
          resolve = _.value.additionalConf
        )
      ),
      ReplaceField(
        "specificationType",
        Field(
          "specificationType",
          StringType,
          resolve = _.value.specificationType.name
        )
      )
    )
    lazy val ApiDocumentationPageType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      ApiDocumentationPage
    ](
      ObjectTypeDescription("A page of documentation"),
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value)),
      ReplaceField(
        "tenant",
        Field(
          "tenant",
          OptionType(TenantType),
          resolve = ctx => ctx.ctx._1.tenantRepo.findById(ctx.value.tenant)
        )
      ),
      ReplaceField(
        "lastModificationAt",
        Field(
          "lastModificationAt",
          DateTimeUnitype,
          resolve = _.value.lastModificationAt
        )
      ),
      ReplaceField(
        "remoteContentHeaders",
        Field(
          "remoteContentHeaders",
          MapType,
          resolve = _.value.remoteContentHeaders
        )
      ),
      AddFields(
        Field("_humanReadableId", StringType, resolve = _.value.humanReadableId)
      )
    )

    lazy val ApiDocumentationType = ObjectType(
      "ApiDocumentation",
      "The documentation of an api composed of multiples pages",
      fields[(DataStore, DaikokuActionContext[JsValue]), ApiDocumentation](
        Field("id", StringType, resolve = _.value.id.value),
        Field(
          "tenant",
          OptionType(TenantType),
          resolve = ctx => ctx.ctx._1.tenantRepo.findById(ctx.value.tenant)
        ),
        Field(
          "pages",
          ListType(OptionType(ApiDocumentationPageType)),
          resolve = ctx =>
            Future.sequence(
              ctx.value.pages.map(page =>
                ctx.ctx._1.apiDocumentationPageRepo
                  .forTenant(ctx.ctx._2.tenant)
                  .findById(page.id)
              )
            )
        ),
        Field(
          "lastModificationAt",
          DateTimeUnitype,
          resolve = _.value.lastModificationAt
        )
      )
    )
    lazy val ApiPostType =
      deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiPost](
        ObjectTypeDescription(
          "A post of an api used to communicate with consumers"
        ),
        ReplaceField(
          "id",
          Field("_id", StringType, resolve = _.value.id.value)
        ),
        ReplaceField(
          "tenant",
          Field(
            "tenant",
            OptionType(TenantType),
            resolve = ctx => ctx.ctx._1.tenantRepo.findById(ctx.value.tenant)
          )
        ),
        ReplaceField(
          "lastModificationAt",
          Field(
            "lastModificationAt",
            DateTimeUnitype,
            resolve = _.value.lastModificationAt
          )
        ),
        AddFields(
          Field(
            "_humanReadableId",
            StringType,
            resolve = _.value.humanReadableId
          )
        )
      )
    lazy val TwoFactorAuthenticationType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      TwoFactorAuthentication
    ](
      ObjectTypeDescription(
        "A two factor authentication configuration of an user account"
      )
    )
    lazy val ApiIssueTagType =
      deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiIssueTag](
        ObjectTypeDescription("A tag used on issues"),
        ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value))
      )
    lazy val ApiIssueCommentType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      ApiIssueComment
    ](
      ObjectTypeDescription("A comment on an issue"),
      ReplaceField(
        "by",
        Field(
          "by",
          OptionType(UserType),
          resolve = ctx => ctx.ctx._1.userRepo.findById(ctx.value.by)
        )
      ),
      ReplaceField(
        "createdAt",
        Field("createdAt", DateTimeUnitype, resolve = _.value.createdAt)
      ),
      ReplaceField(
        "lastModificationAt",
        Field(
          "lastModificationAt",
          DateTimeUnitype,
          resolve = _.value.lastModificationAt
        )
      )
    )
    lazy val ApiIssueType =
      deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiIssue](
        ObjectTypeDescription("An issue on an api"),
        ReplaceField(
          "id",
          Field("_id", StringType, resolve = _.value.id.value)
        ),
        ReplaceField(
          "tenant",
          Field(
            "tenant",
            OptionType(TenantType),
            resolve = ctx => ctx.ctx._1.tenantRepo.findById(ctx.value.tenant)
          )
        ),
        ReplaceField(
          "tags",
          Field(
            "tags",
            ListType(StringType),
            resolve = _.value.tags.map(_.value).toSeq
          )
        ),
        ReplaceField(
          "createdAt",
          Field("createdAt", DateTimeUnitype, resolve = _.value.createdAt)
        ),
        ReplaceField(
          "closedAt",
          Field(
            "closedAt",
            OptionType(DateTimeUnitype),
            resolve = _.value.closedAt
          )
        ),
        ReplaceField(
          "by",
          Field(
            "by",
            OptionType(UserType),
            resolve = ctx => ctx.ctx._1.userRepo.findById(ctx.value.by)
          )
        ),
        ReplaceField(
          "comments",
          Field(
            "comments",
            ListType(ApiIssueCommentType),
            resolve = _.value.comments
          )
        ),
        ReplaceField(
          "lastModificationAt",
          Field(
            "lastModificationAt",
            DateTimeUnitype,
            resolve = _.value.lastModificationAt
          )
        ),
        AddFields(
          Field(
            "_humanReadableId",
            StringType,
            resolve = _.value.humanReadableId
          )
        )
      )
    lazy val UserInvitationType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      UserInvitation
    ](
      ObjectTypeDescription(
        "An user invitation sended by authenticated user to ask to join his team"
      ),
      ReplaceField(
        "createdAt",
        Field("createdAt", DateTimeUnitype, resolve = _.value.createdAt)
      )
    )

    lazy val UserType =
      ObjectType[(DataStore, DaikokuActionContext[JsValue]), User](
        "User",
        "A Daikoku user",
        () =>
          fields[(DataStore, DaikokuActionContext[JsValue]), User](
            Field("id", StringType, resolve = _.value.id.value),
            Field("deleted", BooleanType, resolve = _.value.deleted),
            Field(
              "tenants",
              ListType(OptionType(TenantType)),
              resolve = ctx =>
                Future.sequence(
                  ctx.value.tenants.toSeq
                    .map(_.value)
                    .map(tenant => ctx.ctx._1.tenantRepo.findById(tenant))
                )
            ),
            Field(
              "origins",
              ListType(StringType),
              resolve = _.value.origins.map(_.name).toSeq
            ),
            Field("name", StringType, resolve = _.value.name),
            Field("email", StringType, resolve = _.value.email),
            Field("picture", StringType, resolve = _.value.picture),
            Field(
              "pictureFromProvider",
              BooleanType,
              resolve = _.value.pictureFromProvider
            ),
            Field(
              "personalToken",
              OptionType(StringType),
              resolve = _.value.personalToken
            ),
            Field(
              "isDaikokuAdmin",
              BooleanType,
              resolve = _.value.isDaikokuAdmin
            ),
            Field(
              "password",
              OptionType(StringType),
              resolve = _.value.password
            ),
            Field(
              "hardwareKeyRegistrations",
              ListType(JsonType),
              resolve = _.value.hardwareKeyRegistrations
            ),
            Field(
              "lastTenant",
              OptionType(TenantType),
              resolve = ctx =>
                ctx.value.lastTenant match {
                  case Some(tenant) => ctx.ctx._1.tenantRepo.findById(tenant)
                  case None         => None
                }
            ),
            Field("metadata", MapType, resolve = _.value.metadata),
            Field(
              "defaultLanguage",
              OptionType(StringType),
              resolve = _.value.defaultLanguage
            ),
            Field("isGuest", BooleanType, resolve = _.value.isGuest),
            Field(
              "starredApis",
              ListType(OptionType(ApiType)),
              resolve = ctx =>
                Future.sequence(
                  ctx.value.starredApis.toSeq
                    .map(_.value)
                    .map(api =>
                      ctx.ctx._1.apiRepo
                        .forTenant(ctx.ctx._2.tenant)
                        .findById(api)
                    )
                )
            ),
            Field(
              "twoFactorAuthentication",
              OptionType(TwoFactorAuthenticationType),
              resolve = _.value.twoFactorAuthentication
            ),
            Field(
              "invitation",
              OptionType(UserInvitationType),
              resolve = _.value.invitation
            ),
            Field(
              "_humanReadableId",
              StringType,
              resolve = _.value.humanReadableId
            )
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
      () =>
        fields[(DataStore, DaikokuActionContext[JsValue]), UserWithPermission](
          Field(
            "user",
            OptionType(UserType),
            resolve = ctx => ctx.ctx._1.userRepo.findById(ctx.value.userId)
          ),
          Field(
            "teamPermission",
            TeamPermissionEnum,
            resolve = _.value.teamPermission.name
          )
        )
    )

    lazy val ApiSubscriptionRotationType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      ApiSubscriptionRotation
    ](
      ObjectTypeDescription(
        "A configuration to cover the rotation of the credentials of an api key"
      )
    )

    lazy val ApiSubscriptionType: ObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      ApiSubscription
    ] = ObjectType[(DataStore, DaikokuActionContext[JsValue]), ApiSubscription](
      "ApiSubscriptionType",
      "A subscription on an api plan",
      () =>
        fields[(DataStore, DaikokuActionContext[JsValue]), ApiSubscription](
          Field("_id", StringType, resolve = _.value.id.value),
          Field(
            "tenant",
            OptionType(TenantType),
            resolve =
              ctx => ctx.ctx._1.tenantRepo.findById(ctx.value.tenant.value)
          ),
          Field("deleted", BooleanType, resolve = _.value.deleted),
          Field("apiKey", OtoroshiApiKeyType, resolve = _.value.apiKey),
          Field(
            "plan",
            OptionType(UsagePlanType),
            resolve = ctx =>
              ctx.ctx._1.usagePlanRepo
                .forTenant(ctx.ctx._2.tenant)
                .findById(ctx.value.plan)
          ),
          Field("createdAt", DateTimeUnitype, resolve = _.value.createdAt),
          Field(
            "validUntil",
            OptionType(DateTimeUnitype),
            resolve = _.value.validUntil
          ),
          Field(
            "team",
            OptionType(TeamObjectType),
            resolve = ctx =>
              ctx.ctx._1.teamRepo
                .forTenant(ctx.ctx._2.tenant)
                .findById(ctx.value.team)
          ),
          Field(
            "api",
            OptionType(ApiType),
            resolve = ctx =>
              ctx.ctx._1.apiRepo
                .forTenant(ctx.ctx._2.tenant)
                .findById(ctx.value.api)
          ),
          Field(
            "by",
            OptionType(UserType),
            resolve = ctx => ctx.ctx._1.userRepo.findById(ctx.value.by)
          ),
          Field(
            "customName",
            OptionType(StringType),
            resolve = _.value.customName
          ),
          Field(
            "adminCustomName",
            OptionType(StringType),
            resolve = _.value.adminCustomName
          ),
          Field("enabled", BooleanType, resolve = _.value.enabled),
          Field(
            "rotation",
            OptionType(ApiSubscriptionRotationType),
            resolve = _.value.rotation
          ),
          Field(
            "integrationToken",
            StringType,
            resolve = _.value.integrationToken
          ),
          Field(
            "customMetadata",
            OptionType(JsonType),
            resolve = _.value.customMetadata
          ),
          Field("metadata", OptionType(JsonType), resolve = _.value.metadata),
          Field(
            "tags",
            OptionType(ListType(StringType)),
            resolve = _.value.tags
          ),
          Field(
            "customMaxPerSecond",
            OptionType(LongType),
            resolve = _.value.customMaxPerSecond
          ),
          Field(
            "customMaxPerDay",
            OptionType(LongType),
            resolve = _.value.customMaxPerDay
          ),
          Field(
            "customMaxPerMonth",
            OptionType(LongType),
            resolve = _.value.customMaxPerMonth
          ),
          Field(
            "customReadOnly",
            OptionType(BooleanType),
            resolve = _.value.customReadOnly
          ),
          Field(
            "parent",
            OptionType(ApiSubscriptionType),
            resolve = ctx =>
              ctx.value.parent match {
                case Some(parent) =>
                  ctx.ctx._1.apiSubscriptionRepo
                    .forTenant(ctx.ctx._2.tenant)
                    .findById(parent)
                case None => None
              }
          ),
          Field(
            "lastUsage",
            OptionType(DateTimeUnitype),
            resolve = ctx => getOtoroshiUsage(ctx.value)(ctx.ctx._2.tenant)
          )
        )
    )

    def getOtoroshiUsage(
        subscription: ApiSubscription
    )(implicit tenant: Tenant): Future[Option[DateTime]] = {

      val maybeLastUsage = for {
        plan <- EitherT.fromOptionF[Future, Option[DateTime], UsagePlan](
          env.dataStore.usagePlanRepo
            .forTenant(tenant)
            .findById(subscription.plan),
          None
        )
        otoroshi <-
          EitherT.fromOption[Future][Option[DateTime], OtoroshiSettings](
            tenant.otoroshiSettings.find(oto =>
              plan.otoroshiTarget.exists(_.otoroshiSettings == oto.id)
            ),
            None
          )
        value: EitherT[Future, Option[DateTime], JsArray] =
          otoroshiClient
            .getSubscriptionLastUsage(Seq(subscription))(
              otoroshi,
              tenant
            )
            .leftMap(_ => None)
        usages <- value
      } yield {
        usages.value.headOption
      }

      maybeLastUsage
        .map(_.map(r => (r \ "date").as(json.DateTimeFormat)))
        .merge
    }

    lazy val TestingAuthType = EnumType(
      "TestingAuth",
      Some("TestingAuth"),
      List(
        EnumValue("ApiKey", value = "ApiKey"),
        EnumValue("Basic", value = "Basic")
      )
    )

    lazy val TestingConfigType =
      ObjectType[(DataStore, DaikokuActionContext[JsValue]), TestingConfig](
        "TestingConfig",
        "A configuration to try to call an api on Otorshi from the Daikoku UI",
        () =>
          fields[(DataStore, DaikokuActionContext[JsValue]), TestingConfig](
            Field(
              "otoroshiSettings",
              StringType,
              resolve = _.value.otoroshiSettings.value
            ),
            Field(
              "authorizedEntities",
              OptionType(AuthorizedEntitiesType),
              resolve = _.value.authorizedEntities
            ),
            Field(
              "customMetadata",
              OptionType(JsonType),
              resolve = _.value.customMetadata
            ),
            Field(
              "customMaxPerSecond",
              OptionType(LongType),
              resolve = _.value.customMaxPerSecond
            ),
            Field(
              "customMaxPerDay",
              OptionType(LongType),
              resolve = _.value.customMaxPerDay
            ),
            Field(
              "customMaxPerMonth",
              OptionType(LongType),
              resolve = _.value.customMaxPerMonth
            ),
            Field(
              "customReadOnly",
              OptionType(BooleanType),
              resolve = _.value.customReadOnly
            ),
            Field("tag", StringType, resolve = _.value.tag),
            Field("clientName", StringType, resolve = _.value.clientName)
          )
      )

    lazy val TestingType
        : ObjectType[(DataStore, DaikokuActionContext[JsValue]), Testing] =
      deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), Testing](
        ObjectTypeName("Testing"),
        ObjectTypeDescription("Credentials used to test an api from UI"),
        ReplaceField(
          "auth",
          Field("auth", TestingAuthType, resolve = _.value.auth.name)
        ),
        ReplaceField(
          "config",
          Field(
            "config",
            OptionType(TestingConfigType),
            resolve = _.value.config
          )
        )
      )

    lazy val teamsFetcher = Fetcher(
      (ctx: (DataStore, DaikokuActionContext[JsValue]), teams: Seq[TeamId]) =>
        Future
          .sequence(
            teams.map(teamId =>
              ctx._1.teamRepo.forTenant(ctx._2.tenant).findById(teamId)
            )
          )
          .map(teams => teams.flatten)
    )(HasId[Team, TeamId](_.id))
    lazy val apisFetcher = Fetcher(
      (ctx: (DataStore, DaikokuActionContext[JsValue]), apis: Seq[ApiId]) =>
        Future
          .sequence(
            apis.map(apiId =>
              ctx._1.apiRepo.forTenant(ctx._2.tenant).findById(apiId)
            )
          )
          .map(apis => apis.flatten)
    )(HasId[Api, ApiId](_.id))
    lazy val usersFetcher = Fetcher(
      (ctx: (DataStore, DaikokuActionContext[JsValue]), users: Seq[UserId]) =>
        Future
          .sequence(users.map(userId => ctx._1.userRepo.findById(userId)))
          .map(users => users.flatten)
    )(HasId[User, UserId](_.id))

    lazy val ApiType
        : ObjectType[(DataStore, DaikokuActionContext[JsValue]), Api] =
      ObjectType[(DataStore, DaikokuActionContext[JsValue]), Api](
        "Api",
        "A Daikoku Api",
        () =>
          fields[(DataStore, DaikokuActionContext[JsValue]), Api](
            Field("_id", StringType, resolve = _.value.id.value),
            Field(
              "tenant",
              OptionType(TenantType),
              resolve =
                ctx => ctx.ctx._1.tenantRepo.findById(ctx.ctx._2.tenant.id)
            ),
            Field("deleted", BooleanType, resolve = _.value.deleted),
            Field("name", StringType, resolve = _.value.name),
            Field(
              "smallDescription",
              StringType,
              resolve = _.value.smallDescription
            ),
            Field("header", OptionType(StringType), resolve = _.value.header),
            Field("image", OptionType(StringType), resolve = _.value.image),
            Field("description", StringType, resolve = _.value.description),
            Field(
              "currentVersion",
              StringType,
              resolve = _.value.currentVersion.value
            ),
            Field(
              "supportedVersions",
              ListType(StringType),
              resolve = _.value.supportedVersions.toSeq.map(_.value)
            ),
            Field("isDefault", BooleanType, resolve = _.value.isDefault),
            Field("lastUpdate", DateTimeUnitype, resolve = _.value.lastUpdate),
            Field(
              "testing",
              OptionType(TestingType),
              resolve = _.value.testing
            ),
            Field(
              "documentation",
              ApiDocumentationType,
              resolve = _.value.documentation
            ),
            Field(
              "swagger",
              OptionType(SwaggerAccessType),
              resolve = _.value.swagger
            ),
            Field("visibility", StringType, resolve = _.value.visibility.name),
            Field(
              "possibleUsagePlans",
              ListType(UsagePlanType),
              resolve = ctx =>
                ctx.ctx._1.usagePlanRepo.findByApi(ctx.value.tenant, ctx.value)
            ),
            Field(
              "defaultUsagePlan",
              OptionType(UsagePlanType),
              resolve = ctx =>
                ctx.value.defaultUsagePlan match {
                  case Some(value) =>
                    ctx.ctx._1.usagePlanRepo
                      .forTenant(ctx.ctx._2.tenant)
                      .findById(value)
                  case None => FastFuture.successful(None)
                }
            ),
            Field(
              "authorizedTeams",
              ListType(TeamObjectType),
              resolve = ctx =>
                ctx.ctx._1.teamRepo
                  .forTenant(ctx.ctx._2.tenant)
                  .find(
                    Json.obj(
                      "_id" -> Json.obj(
                        "$in" -> JsArray(
                          ctx.value.authorizedTeams.map(_.asJson)
                        )
                      )
                    )
                  )
            ),
            Field(
              "posts",
              ListType(ApiPostType),
              resolve = ctx =>
                ctx.ctx._1.apiPostRepo
                  .forTenant(ctx.ctx._2.tenant)
                  .find(
                    Json.obj(
                      "_id" -> Json
                        .obj("$in" -> JsArray(ctx.value.posts.map(_.asJson)))
                    )
                  )
            ),
            Field(
              "issues",
              ListType(ApiIssueType),
              resolve = ctx =>
                ctx.ctx._1.apiIssueRepo
                  .forTenant(ctx.ctx._2.tenant)
                  .find(
                    Json.obj(
                      "_id" -> Json
                        .obj("$in" -> JsArray(ctx.value.issues.map(_.asJson)))
                    )
                  )
            ),
            Field(
              "issuesTags",
              ListType(ApiIssueTagType),
              resolve = _.value.issuesTags.toSeq
            ),
            Field("tags", ListType(StringType), resolve = _.value.tags.toSeq),
            Field(
              "categories",
              ListType(StringType),
              resolve = _.value.categories.toSeq
            ),
            Field("stars", IntType, resolve = _.value.stars),
            Field(
              "_humanReadableId",
              StringType,
              resolve = _.value.humanReadableId
            ),
            Field(
              "team",
              TeamObjectType,
              resolve = ctx => teamsFetcher.defer(ctx.value.team)
            ),
            Field(
              "parent",
              OptionType(ApiType),
              resolve = ctx =>
                ctx.value.parent match {
                  case Some(p) =>
                    ctx.ctx._1.apiRepo.forTenant(ctx.ctx._2.tenant).findById(p)
                  case None => None
                }
            ),
            Field(
              "apis",
              OptionType(ListType(ApiWithAuthorizationType)),
              resolve = ctx => {
                ctx.value.apis match {
                  case None => FastFuture.successful(None)
                  case Some(apis) =>
                    CommonServices
                      .getApisByIds(apis.toSeq.map(_.value))(ctx.ctx._2, env, e)
                      .map {
                        case Right(apis) => Some(apis)
                        case Left(_)     => None
                      }
                }
              }
            ),
            Field("state", StringType, resolve = _.value.state.name)
          )
      )

    lazy val AuthorizationApiType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      AuthorizationApi
    ]()

    lazy val ApiWithAuthorizationType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      ApiWithAuthorizations
    ](
      ObjectTypeDescription(
        "A Daikoku api with the list of teams authorizations"
      ),
      ReplaceField("api", Field("api", ApiType, resolve = _.value.api)),
      ReplaceField(
        "plans",
        Field(
          "plans",
          ListType(UsagePlanType),
          resolve = _.value.plans
        )
      ),
      ReplaceField(
        "authorizations",
        Field(
          "authorizations",
          ListType(AuthorizationApiType),
          resolve = _.value.authorizations
        )
      )
    )
    lazy val ApiWithCountType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      ApiWithCount
    ](
      ObjectTypeDescription(
        "An object composed of an array of apis with autho and the total count of them"
      ),
      ReplaceField(
        "apis",
        Field(
          "apis",
          ListType(ApiWithAuthorizationType),
          resolve = _.value.apis
        )
      ),
      ReplaceField(
        "producers",
        Field(
          "producers",
          ListType(TeamObjectType),
          resolve = _.value.producers
        )
      ),
      ReplaceField("total", Field("total", LongType, resolve = _.value.total))
    )

    lazy val AccessibleResourceType: ObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      ApiSubscriptionAccessibleResource
    ] =
      ObjectType[
        (DataStore, DaikokuActionContext[JsValue]),
        ApiSubscriptionAccessibleResource
      ](
        "ApiSubscriptionAccessibleResource",
        "A Daikoku Api Subscription accessible resource",
        () =>
          fields[
            (DataStore, DaikokuActionContext[JsValue]),
            ApiSubscriptionAccessibleResource
          ](
            Field(
              "apiSubscription",
              ApiSubscriptionType,
              resolve = _.value.apiSubscription
            ),
            Field("api", ApiType, resolve = _.value.api),
            Field("usagePlan", UsagePlanType, resolve = _.value.usagePlan)
          )
      )

    lazy val ApiSubscriptionDetailType: ObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      ApiSubscriptionDetail
    ] =
      ObjectType[
        (DataStore, DaikokuActionContext[JsValue]),
        ApiSubscriptionDetail
      ](
        "ApiSubscriptionDetail",
        "A Daikoku Api Subscription detail (with parent and accessible resources)",
        () =>
          fields[
            (DataStore, DaikokuActionContext[JsValue]),
            ApiSubscriptionDetail
          ](
            Field(
              "apiSubscription",
              ApiSubscriptionType,
              resolve = _.value.apiSubscription
            ),
            Field(
              "parentSubscription",
              OptionType(ApiSubscriptionType),
              resolve = _.value.parentSubscription
            ),
            Field(
              "accessibleResources",
              ListType(AccessibleResourceType),
              resolve = _.value.accessibleResources
            )
          )
      )

    lazy val NotificationWithCountType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      NotificationWithCount
    ](
      ObjectTypeDescription(
        "An object composed of an array of notification and a total count of them"
      ),
      ReplaceField(
        "notifications",
        Field(
          "notifications",
          ListType(NotificationType),
          resolve = _.value.notifications
        )
      ),
      ReplaceField("total", Field("total", LongType, resolve = _.value.total)),
      ReplaceField(
        "totalSelectable",
        Field("totalSelectable", LongType, resolve = _.value.totalSelectable)
      ),
      ReplaceField(
        "totalFiltered",
        Field("totalFiltered", LongType, resolve = _.value.totalFiltered)
      ),
      ReplaceField(
        "totalByTypes",
        Field("totalByTypes", JsonType, resolve = _.value.totalByTypes)
      ),
      ReplaceField(
        "totalByTeams",
        Field("totalByTeams", JsonType, resolve = _.value.totalByTeams)
      ),
      ReplaceField(
        "totalByApis",
        Field("totalByApis", JsonType, resolve = _.value.totalByApis)
      )
    )

    lazy val TeamWithCountType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      TeamWithCount
    ](
      ObjectTypeDescription(
        "An object composed of an array of teams with the total count of them"
      ),
      ReplaceField(
        "teams",
        Field("teams", ListType(TeamObjectType), resolve = _.value.teams)
      ),
      ReplaceField("total", Field("total", LongType, resolve = _.value.total))
    )

    lazy val subscriptionsWithPlanType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      SubscriptionsWithPlan
    ]()

    lazy val GraphQLAccessibleApiType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      ApiWithSubscriptions
    ](
      ObjectTypeDescription(
        "A Daikoku api with the list of plans and his state of subscription"
      ),
      ReplaceField("api", Field("api", ApiType, resolve = _.value.api)),
      ReplaceField(
        "plans",
        Field(
          "plans",
          ListType(UsagePlanType),
          resolve = _.value.plans
        )
      ),
      ReplaceField(
        "subscriptionsWithPlan",
        Field(
          "subscriptionsWithPlan",
          ListType(subscriptionsWithPlanType),
          resolve = _.value.subscriptionsWithPlan
        )
      )
    )

    lazy val GraphQlAccessibleApisWithNumberOfApis = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      AccessibleApisWithNumberOfApis
    ](
      ObjectTypeDescription(
        "A limited list of Daikoku apis with the count of all the apis for pagination"
      ),
      ReplaceField(
        "apis",
        Field(
          "apis",
          ListType(GraphQLAccessibleApiType),
          resolve = _.value.apis
        )
      ),
      ReplaceField("total", Field("total", LongType, resolve = _.value.total))
    )

    lazy val NotificationStatusType: InterfaceType[
      (DataStore, DaikokuActionContext[JsValue]),
      NotificationStatus
    ] = InterfaceType(
      "NotificationStatus",
      "The status of a notification",
      () =>
        fields[(DataStore, DaikokuActionContext[JsValue]), NotificationStatus](
          Field(
            "_generated",
            StringType,
            resolve = _.value.toString
          ) // TODO - can't generate interface without fields
        )
    )

    lazy val NotificationStatusAcceptedType = new PossibleObject(
      ObjectType(
        "NotificationStatusAccepted",
        "An accepted notification status",
        interfaces[
          (DataStore, DaikokuActionContext[JsValue]),
          NotificationStatus.Accepted
        ](NotificationStatusType),
        fields[
          (DataStore, DaikokuActionContext[JsValue]),
          NotificationStatus.Accepted
        ](
          Field("date", DateTimeUnitype, resolve = _.value.date),
          Field("status", StringType, resolve = _.value.status)
        )
      )
    )

    lazy val NotificationStatusRejectedType = new PossibleObject(
      ObjectType(
        "NotificationStatusRejected",
        "A rejected notification status",
        interfaces[
          (DataStore, DaikokuActionContext[JsValue]),
          NotificationStatus.Rejected
        ](NotificationStatusType),
        fields[
          (DataStore, DaikokuActionContext[JsValue]),
          NotificationStatus.Rejected
        ](
          Field("date", DateTimeUnitype, resolve = _.value.date),
          Field("status", StringType, resolve = _.value.status)
        )
      )
    )

    lazy val NotificationStatusPendingType = new PossibleObject(
      ObjectType(
        "NotificationStatusPending",
        "A pending notification status",
        interfaces[
          (DataStore, DaikokuActionContext[JsValue]),
          NotificationStatus.Pending
        ](NotificationStatusType),
        fields[
          (DataStore, DaikokuActionContext[JsValue]),
          NotificationStatus.Pending
        ](
          Field("status", StringType, resolve = _.value.status)
        )
      )
    )

    lazy val NotificationActionType: InterfaceType[
      (DataStore, DaikokuActionContext[JsValue]),
      NotificationAction
    ] = InterfaceType(
      "NotificationAction",
      "An action of notification",
      () =>
        fields[(DataStore, DaikokuActionContext[JsValue]), NotificationAction](
          Field(
            "_generated",
            StringType,
            resolve = _.value.toString
          ) // TODO - can't generate interface without fields
        )
    )

    lazy val OtoroshiSyncNotificationActionType: InterfaceType[
      (DataStore, DaikokuActionContext[JsValue]),
      OtoroshiSyncNotificationAction
    ] = InterfaceType(
      "OtoroshiSyncNotificationAction",
      "A Otoroshi notification triggered when the synchronization with an otoroshi is done",
      () =>
        fields[
          (DataStore, DaikokuActionContext[JsValue]),
          OtoroshiSyncNotificationAction
        ](
          Field(
            "message",
            OptionType(StringType),
            resolve = _.value.message.some
          )
        ),
      interfaces[
        (DataStore, DaikokuActionContext[JsValue]),
        OtoroshiSyncNotificationAction
      ](NotificationActionType)
    )

    lazy val ApiAccessType = new PossibleObject(
      ObjectType(
        "ApiAccess",
        "A api access notification action",
        interfaces[(DataStore, DaikokuActionContext[JsValue]), ApiAccess](
          NotificationActionType
        ),
        fields[(DataStore, DaikokuActionContext[JsValue]), ApiAccess](
          Field(
            "api",
            OptionType(ApiType),
            resolve = ctx =>
              ctx.ctx._1.apiRepo
                .forTenant(ctx.ctx._2.tenant)
                .findById(ctx.value.api)
          ),
          Field(
            "team",
            OptionType(TeamObjectType),
            resolve = ctx =>
              ctx.ctx._1.teamRepo
                .forTenant(ctx.ctx._2.tenant)
                .findById(ctx.value.team)
          )
        )
      )
    )
    lazy val TeamInvitationType = new PossibleObject(
      ObjectType(
        "TeamInvitation",
        "A team invitation notification action",
        interfaces[(DataStore, DaikokuActionContext[JsValue]), TeamInvitation](
          NotificationActionType
        ),
        fields[(DataStore, DaikokuActionContext[JsValue]), TeamInvitation](
          Field(
            "team",
            OptionType(TeamObjectType),
            resolve = ctx =>
              ctx.ctx._1.teamRepo
                .forTenant(ctx.ctx._2.tenant)
                .findById(ctx.value.team)
          ),
          Field(
            "user",
            OptionType(UserType),
            resolve = ctx => ctx.ctx._1.userRepo.findById(ctx.value.user)
          )
        )
      )
    )

    lazy val SubscriptionDemandStepType: ObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      SubscriptionDemandStep
    ] = ObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      SubscriptionDemandStep
    ](
      "SubscriptionDemandStep",
      "A subscription demand step",
      () =>
        fields[
          (DataStore, DaikokuActionContext[JsValue]),
          SubscriptionDemandStep
        ](
          Field("id", StringType, resolve = _.value.id.value),
          Field("step", ValidationStepInterfaceType, resolve = _.value.step),
          Field("state", StringType, resolve = _.value.state.name),
          Field("medatada", JsonType, resolve = _.value.metadata)
        )
    )

    lazy val SubscriptionDemandType: ObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      SubscriptionDemand
    ] = ObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      SubscriptionDemand
    ](
      "SubscriptionDemand",
      "A subscription demand",
      () =>
        fields[(DataStore, DaikokuActionContext[JsValue]), SubscriptionDemand](
          Field("_id", StringType, resolve = _.value.id.value),
          Field("tenant", StringType, resolve = _.value.id.value),
          Field("deleted", BooleanType, resolve = _.value.deleted),
          Field(
            "api",
            ApiType,
            resolve = ctx => apisFetcher.defer(ctx.value.api)
          ),
          Field(
            "plan",
            OptionType(UsagePlanType),
            resolve = ctx =>
              ctx.ctx._1.usagePlanRepo
                .forTenant(ctx.ctx._2.tenant)
                .findById(ctx.value.plan)
          ),
          Field(
            "steps",
            ListType(SubscriptionDemandStepType),
            resolve = _.value.steps
          ),
          Field("state", StringType, resolve = _.value.state.name),
          Field(
            "team",
            TeamObjectType,
            resolve = ctx => teamsFetcher.defer(ctx.value.team)
          ),
          Field(
            "from",
            UserType,
            resolve = ctx => usersFetcher.defer(ctx.value.from)
          ),
          Field("date", DateTimeUnitype, resolve = _.value.date),
          Field(
            "motivation",
            OptionType(JsonType),
            resolve = _.value.motivation
          ),
          Field(
            "parentSubscriptionId",
            OptionType(StringType),
            resolve = _.value.parentSubscriptionId.map(_.value)
          )
        )
    )

    lazy val ApiSubscriptionDemandType = new PossibleObject(
      ObjectType(
        "ApiSubscription",
        "A api subscription notification action",
        interfaces[
          (DataStore, DaikokuActionContext[JsValue]),
          ApiSubscriptionDemand
        ](NotificationActionType),
        fields[
          (DataStore, DaikokuActionContext[JsValue]),
          ApiSubscriptionDemand
        ](
          Field(
            "api",
            OptionType(ApiType),
            resolve = ctx =>
              ctx.ctx._1.apiRepo
                .forTenant(ctx.ctx._2.tenant)
                .findById(ctx.value.api)
          ),
          Field(
            "team",
            OptionType(TeamObjectType),
            resolve = ctx =>
              ctx.ctx._1.teamRepo
                .forTenant(ctx.ctx._2.tenant)
                .findById(ctx.value.team)
          ),
          Field(
            "plan",
            OptionType(UsagePlanType),
            resolve = ctx =>
              ctx.ctx._1.usagePlanRepo
                .forTenant(ctx.ctx._2.tenant)
                .findById(ctx.value.plan)
          ),
          Field(
            "parentSubscriptionId",
            OptionType(ApiSubscriptionType),
            resolve = ctx =>
              ctx.value.parentSubscriptionId match {
                case Some(parent) =>
                  ctx.ctx._1.apiSubscriptionRepo
                    .forTenant(ctx.ctx._2.tenant)
                    .findById(parent)
                case None => None
              }
          ),
          Field(
            "motivation",
            OptionType(StringType),
            resolve = ctx => ctx.value.motivation
          ),
          Field(
            "demand",
            OptionType(SubscriptionDemandType),
            resolve = ctx =>
              ctx.ctx._1.subscriptionDemandRepo
                .forTenant(ctx.ctx._2.tenant)
                .findById(ctx.value.demand)
          )
        )
      )
    )
    lazy val TransferApiOwnershipType = new PossibleObject(
      ObjectType(
        "TransferApiOwnership",
        "A transfer ownership for API notification action",
        interfaces[
          (DataStore, DaikokuActionContext[JsValue]),
          TransferApiOwnership
        ](NotificationActionType),
        fields[
          (DataStore, DaikokuActionContext[JsValue]),
          TransferApiOwnership
        ](
          Field(
            "team",
            OptionType(TeamObjectType),
            resolve = ctx =>
              ctx.ctx._1.teamRepo
                .forTenant(ctx.ctx._2.tenant)
                .findById(ctx.value.team)
          ),
          Field(
            "api",
            OptionType(ApiType),
            resolve = ctx =>
              ctx.ctx._1.apiRepo
                .forTenant(ctx.ctx._2.tenant)
                .findById(ctx.value.api)
          )
        )
      )
    )
    lazy val OtoroshiSyncSubscriptionErrorType = new PossibleObject(
      ObjectType(
        "OtoroshiSyncSubscriptionError",
        "A Otoroshi notification triggered when the synchronization with an otoroshi had failed",
        interfaces[
          (DataStore, DaikokuActionContext[JsValue]),
          OtoroshiSyncSubscriptionError
        ](OtoroshiSyncNotificationActionType),
        fields[
          (DataStore, DaikokuActionContext[JsValue]),
          OtoroshiSyncSubscriptionError
        ](
          Field(
            "subscription",
            ApiSubscriptionType,
            resolve = _.value.subscription
          ),
          Field(
            "message",
            OptionType(StringType),
            resolve = _.value.message.some
          )
        )
      )
    )
    lazy val ApiSubscriptionRejectType = new PossibleObject(
      ObjectType(
        "ApiSubscriptionReject",
        "A notification triggered when a when your api subscription is reject",
        interfaces[
          (DataStore, DaikokuActionContext[JsValue]),
          ApiSubscriptionReject
        ](NotificationActionType),
        fields[
          (DataStore, DaikokuActionContext[JsValue]),
          ApiSubscriptionReject
        ](
          Field("message", OptionType(StringType), resolve = _.value.message),
          Field(
            "team",
            OptionType(TeamObjectType),
            resolve = ctx =>
              ctx.ctx._1.teamRepo
                .forTenant(ctx.ctx._2.tenant)
                .findById(ctx.value.team)
          ),
          Field(
            "api",
            OptionType(ApiType),
            resolve = ctx =>
              ctx.ctx._1.apiRepo
                .forTenant(ctx.ctx._2.tenant)
                .findById(ctx.value.api)
          ),
          Field(
            "plan",
            OptionType(UsagePlanType),
            resolve = ctx =>
              ctx.ctx._1.usagePlanRepo
                .forTenant(ctx.ctx._2.tenant)
                .findById(ctx.value.plan)
          )
        )
      )
    )
    lazy val ApiSubscriptionAcceptType = new PossibleObject(
      ObjectType(
        "ApiSubscriptionAccept",
        "A notification triggered when a when your api subscription is reject",
        interfaces[
          (DataStore, DaikokuActionContext[JsValue]),
          ApiSubscriptionAccept
        ](NotificationActionType),
        fields[
          (DataStore, DaikokuActionContext[JsValue]),
          ApiSubscriptionAccept
        ](
          Field(
            "team",
            OptionType(TeamObjectType),
            resolve = ctx =>
              ctx.ctx._1.teamRepo
                .forTenant(ctx.ctx._2.tenant)
                .findById(ctx.value.team)
          ),
          Field(
            "api",
            OptionType(ApiType),
            resolve = ctx =>
              ctx.ctx._1.apiRepo
                .forTenant(ctx.ctx._2.tenant)
                .findById(ctx.value.api)
          ),
          Field(
            "plan",
            OptionType(UsagePlanType),
            resolve = ctx =>
              ctx.ctx._1.usagePlanRepo
                .forTenant(ctx.ctx._2.tenant)
                .findById(ctx.value.plan)
          )
        )
      )
    )

    lazy val NewIssueOpenType = new PossibleObject(
      ObjectType(
        "NewIssueOpen",
        "An Otoroshi notification triggered when a new issue has been created",
        interfaces[(DataStore, DaikokuActionContext[JsValue]), NewIssueOpen](
          NotificationActionType
        ),
        fields[(DataStore, DaikokuActionContext[JsValue]), NewIssueOpen](
          Field("apiName", StringType, resolve = _.value.apiName),
          Field("linkTo", StringType, resolve = _.value.linkTo)
        )
      )
    )
    lazy val NewIssueOpenV2Type = new PossibleObject(
      ObjectType(
        "NewIssueOpenV2",
        "A notification triggered when a new issue has been created",
        interfaces[(DataStore, DaikokuActionContext[JsValue]), NewIssueOpenV2](
          NotificationActionType
        ),
        fields[(DataStore, DaikokuActionContext[JsValue]), NewIssueOpenV2](
          Field(
            "api",
            OptionType(ApiType),
            resolve = ctx =>
              ctx.ctx._1.apiRepo
                .forTenant(ctx.ctx._2.tenant)
                .findByIdNotDeleted(ctx.value.api)
          ),
          Field(
            "issue",
            OptionType(ApiIssueType),
            resolve = ctx =>
              ctx.ctx._1.apiIssueRepo
                .forTenant(ctx.ctx._2.tenant)
                .findByIdNotDeleted(ctx.value.issue)
          )
        )
      )
    )

    lazy val OtoroshiSyncApiErrorType = new PossibleObject(
      ObjectType(
        "OtoroshiSyncApiError",
        "An Otoroshi notification triggered when syncing an API with an otoroshi failed",
        interfaces[
          (DataStore, DaikokuActionContext[JsValue]),
          OtoroshiSyncApiError
        ](NotificationActionType),
        fields[
          (DataStore, DaikokuActionContext[JsValue]),
          OtoroshiSyncApiError
        ](
          Field(
            "api",
            OptionType(ApiType),
            resolve = ctx => Some(ctx.value.api)
          ),
          Field(
            "message",
            OptionType(StringType),
            resolve = _.value.message.some
          )
        )
      )
    )

    lazy val NewPostPublishedType = new PossibleObject(
      ObjectType(
        "NewPostPublished",
        "An Otoroshi notification triggered when a new post has been pusblished",
        interfaces[
          (DataStore, DaikokuActionContext[JsValue]),
          NewPostPublished
        ](NotificationActionType),
        fields[(DataStore, DaikokuActionContext[JsValue]), NewPostPublished](
          Field("apiName", StringType, resolve = _.value.apiName),
          Field(
            "team",
            OptionType(TeamObjectType),
            resolve = ctx =>
              ctx.ctx._1.teamRepo
                .forTenant(ctx.ctx._2.tenant)
                .findById(ctx.value.teamId)
          )
        )
      )
    )
    lazy val NewPostPublishedV2Type = new PossibleObject(
      ObjectType(
        "NewPostPublishedV2",
        "A notification triggered when a new post has been pusblished",
        interfaces[
          (DataStore, DaikokuActionContext[JsValue]),
          NewPostPublishedV2
        ](NotificationActionType),
        fields[(DataStore, DaikokuActionContext[JsValue]), NewPostPublishedV2](
          Field(
            "api",
            OptionType(ApiType),
            resolve = ctx =>
              ctx.ctx._1.apiRepo
                .forTenant(ctx.ctx._2.tenant)
                .findByIdNotDeleted(ctx.value.api)
          ),
          Field(
            "post",
            OptionType(ApiPostType),
            resolve = ctx =>
              ctx.ctx._1.apiPostRepo
                .forTenant(ctx.ctx._2.tenant)
                .findByIdNotDeleted(ctx.value.post)
          )
        )
      )
    )

    lazy val ApiKeyRefreshType = new PossibleObject(
      ObjectType(
        "ApiKeyRefresh",
        "An Otoroshi notification triggered when an api key has been refreshed",
        interfaces[(DataStore, DaikokuActionContext[JsValue]), ApiKeyRefresh](
          NotificationActionType
        ),
        fields[(DataStore, DaikokuActionContext[JsValue]), ApiKeyRefresh](
          Field("subscriptionName", StringType, resolve = _.value.subscription),
          Field("apiName", StringType, resolve = _.value.api),
          Field("planName", StringType, resolve = _.value.plan)
        )
      )
    )
    lazy val ApiKeyRefreshV2Type = new PossibleObject(
      ObjectType(
        "ApiKeyRefreshV2",
        "An Otoroshi notification triggered when an api key has been refreshed",
        interfaces[(DataStore, DaikokuActionContext[JsValue]), ApiKeyRefreshV2](
          NotificationActionType
        ),
        fields[(DataStore, DaikokuActionContext[JsValue]), ApiKeyRefreshV2](
          Field(
            "api",
            OptionType(ApiType),
            resolve = ctx =>
              ctx.ctx._1.apiRepo
                .forTenant(ctx.ctx._2.tenant)
                .findByIdNotDeleted(ctx.value.api)
          ),
          Field(
            "subscription",
            OptionType(ApiSubscriptionType),
            resolve = ctx =>
              ctx.ctx._1.apiSubscriptionRepo
                .forTenant(ctx.ctx._2.tenant)
                .findByIdNotDeleted(ctx.value.subscription)
          ),
          Field(
            "plan",
            OptionType(UsagePlanType),
            resolve = ctx =>
              ctx.ctx._1.usagePlanRepo
                .forTenant(ctx.ctx._2.tenant)
                .findByIdNotDeleted(ctx.value.plan)
          ),
          Field("message", OptionType(StringType), resolve = _.value.message)
        )
      )
    )

    lazy val ApiKeyDeletionInformationType = new PossibleObject(
      ObjectType(
        "ApiKeyDeletionInformation",
        "An Otoroshi notification triggered when an api key has been refreshed",
        interfaces[
          (DataStore, DaikokuActionContext[JsValue]),
          ApiKeyDeletionInformation
        ](NotificationActionType),
        fields[
          (DataStore, DaikokuActionContext[JsValue]),
          ApiKeyDeletionInformation
        ](
          Field("clientId", StringType, resolve = _.value.clientId),
          Field("apiName", StringType, resolve = _.value.api)
        )
      )
    )

    lazy val ApiKeyDeletionInformationV2Type = new PossibleObject(
      ObjectType(
        "ApiKeyDeletionInformationV2",
        "An notification triggered when an api key has been deleted",
        interfaces[
          (DataStore, DaikokuActionContext[JsValue]),
          ApiKeyDeletionInformationV2
        ](NotificationActionType),
        fields[
          (DataStore, DaikokuActionContext[JsValue]),
          ApiKeyDeletionInformationV2
        ](
          Field("clientId", StringType, resolve = _.value.clientId),
          Field(
            "api",
            OptionType(ApiType),
            resolve = ctx =>
              ctx.ctx._1.apiRepo
                .forTenant(ctx.ctx._2.tenant)
                .findById(ctx.value.api)
          ),
          Field(
            "subscription",
            OptionType(ApiSubscriptionType),
            resolve = ctx =>
              ctx.ctx._1.apiSubscriptionRepo
                .forTenant(ctx.ctx._2.tenant)
                .findById(ctx.value.subscription)
          )
        )
      )
    )

    lazy val ApiKeyRotationInProgressType = new PossibleObject(
      ObjectType(
        "ApiKeyRotationInProgress",
        "An Otoroshi notification triggered when the credentials of an api key is in rotation progress",
        interfaces[
          (DataStore, DaikokuActionContext[JsValue]),
          ApiKeyRotationInProgress
        ](NotificationActionType),
        fields[
          (DataStore, DaikokuActionContext[JsValue]),
          ApiKeyRotationInProgress
        ](
          Field("clientId", StringType, resolve = _.value.clientId),
          Field("apiName", StringType, resolve = _.value.api),
          Field("planName", StringType, resolve = _.value.plan)
        )
      )
    )

    lazy val ApiKeyRotationInProgressV2Type = new PossibleObject(
      ObjectType(
        "ApiKeyRotationInProgressV2",
        "An Otoroshi notification triggered when the credentials of an api key is in rotation progress",
        interfaces[
          (DataStore, DaikokuActionContext[JsValue]),
          ApiKeyRotationInProgressV2
        ](NotificationActionType),
        fields[
          (DataStore, DaikokuActionContext[JsValue]),
          ApiKeyRotationInProgressV2
        ](
          Field(
            "api",
            OptionType(ApiType),
            resolve = ctx =>
              ctx.ctx._1.apiRepo
                .forTenant(ctx.ctx._2.tenant)
                .findByIdNotDeleted(ctx.value.api)
          ),
          Field(
            "subscription",
            OptionType(ApiSubscriptionType),
            resolve = ctx =>
              ctx.ctx._1.apiSubscriptionRepo
                .forTenant(ctx.ctx._2.tenant)
                .findByIdNotDeleted(ctx.value.subscription)
          ),
          Field(
            "plan",
            OptionType(UsagePlanType),
            resolve = ctx =>
              ctx.ctx._1.usagePlanRepo
                .forTenant(ctx.ctx._2.tenant)
                .findByIdNotDeleted(ctx.value.plan)
          )
        )
      )
    )

    lazy val ApiKeyRotationEndedType = new PossibleObject(
      ObjectType(
        "ApiKeyRotationEnded",
        "An Otoroshi notification triggered when the credentials of an api key has been rotated",
        interfaces[
          (DataStore, DaikokuActionContext[JsValue]),
          ApiKeyRotationEnded
        ](NotificationActionType),
        fields[(DataStore, DaikokuActionContext[JsValue]), ApiKeyRotationEnded](
          Field("clientId", StringType, resolve = _.value.clientId),
          Field("apiName", StringType, resolve = _.value.api),
          Field("planName", StringType, resolve = _.value.plan)
        )
      )
    )
    lazy val ApiKeyRotationEndedV2Type = new PossibleObject(
      ObjectType(
        "ApiKeyRotationEndedV2",
        "An Otoroshi notification triggered when the credentials of an api key has been rotated",
        interfaces[
          (DataStore, DaikokuActionContext[JsValue]),
          ApiKeyRotationEndedV2
        ](NotificationActionType),
        fields[
          (DataStore, DaikokuActionContext[JsValue]),
          ApiKeyRotationEndedV2
        ](
          Field(
            "api",
            OptionType(ApiType),
            resolve = ctx =>
              ctx.ctx._1.apiRepo
                .forTenant(ctx.ctx._2.tenant)
                .findByIdNotDeleted(ctx.value.api)
          ),
          Field(
            "subscription",
            OptionType(ApiSubscriptionType),
            resolve = ctx =>
              ctx.ctx._1.apiSubscriptionRepo
                .forTenant(ctx.ctx._2.tenant)
                .findByIdNotDeleted(ctx.value.subscription)
          ),
          Field(
            "plan",
            OptionType(UsagePlanType),
            resolve = ctx =>
              ctx.ctx._1.usagePlanRepo
                .forTenant(ctx.ctx._2.tenant)
                .findByIdNotDeleted(ctx.value.plan)
          )
        )
      )
    )
    lazy val NewCommentOnIssueType = new PossibleObject(
      deriveObjectType[
        (DataStore, DaikokuActionContext[JsValue]),
        NewCommentOnIssue
      ](
        ObjectTypeDescription(
          "An Otoroshi notification triggered when a new comment has been written"
        ),
        Interfaces(NotificationActionType)
      )
    )
    lazy val NewCommentOnIssueV2Type = new PossibleObject(
      ObjectType(
        "NewCommentOnIssueV2",
        "A notification triggered when a new comment on an issue has been written",
        interfaces[
          (DataStore, DaikokuActionContext[JsValue]),
          NewCommentOnIssueV2
        ](NotificationActionType),
        fields[(DataStore, DaikokuActionContext[JsValue]), NewCommentOnIssueV2](
          Field(
            "api",
            OptionType(ApiType),
            resolve = ctx =>
              ctx.ctx._1.apiRepo
                .forTenant(ctx.ctx._2.tenant)
                .findByIdNotDeleted(ctx.value.api)
          ),
          Field(
            "issue",
            OptionType(ApiIssueType),
            resolve = ctx =>
              ctx.ctx._1.apiIssueRepo
                .forTenant(ctx.ctx._2.tenant)
                .findByIdNotDeleted(ctx.value.issue)
          ),
          Field(
            "user",
            OptionType(UserType),
            resolve = ctx =>
              ctx.ctx._1.userRepo
                .findByIdNotDeleted(ctx.value.user)
          )
        )
      )
    )
    lazy val CheckoutForSubscriptionType = new PossibleObject(
      ObjectType(
        "CheckoutForSubscription",
        "A notification triggered when a checkout session is available",
        interfaces[
          (DataStore, DaikokuActionContext[JsValue]),
          CheckoutForSubscription
        ](NotificationActionType),
        fields[
          (DataStore, DaikokuActionContext[JsValue]),
          CheckoutForSubscription
        ](
          Field(
            "plan",
            OptionType(UsagePlanType),
            resolve = ctx =>
              ctx.ctx._1.usagePlanRepo
                .forTenant(ctx.ctx._2.tenant)
                .findByIdNotDeleted(ctx.value.plan)
          ),
          Field("step", StringType, resolve = _.value.step.value),
          Field(
            "demand",
            OptionType(SubscriptionDemandType),
            resolve = ctx =>
              ctx.ctx._1.subscriptionDemandRepo
                .forTenant(ctx.ctx._2.tenant)
                .findByIdNotDeleted(ctx.value.demand)
          ),
          Field(
            "api",
            OptionType(ApiType),
            resolve = ctx =>
              ctx.ctx._1.apiRepo
                .forTenant(ctx.ctx._2.tenant)
                .findByIdNotDeleted(ctx.value.api)
          )
        )
      )
    )
    lazy val ApiSubscriptionTransferSuccessType = new PossibleObject(
      ObjectType(
        "ApiSubscriptionTransferSuccess",
        "A notification triggered when a checkout session is available",
        interfaces[
          (DataStore, DaikokuActionContext[JsValue]),
          ApiSubscriptionTransferSuccess
        ](NotificationActionType),
        fields[
          (DataStore, DaikokuActionContext[JsValue]),
          ApiSubscriptionTransferSuccess
        ](
          Field(
            "subscription",
            OptionType(ApiSubscriptionType),
            resolve = ctx =>
              ctx.ctx._1.apiSubscriptionRepo
                .forTenant(ctx.ctx._2.tenant)
                .findByIdNotDeleted(ctx.value.subscription)
          )
        )
      )
    )

    lazy val NotificationInterfaceType: ObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      NotificationType
    ] =
      ObjectType[(DataStore, DaikokuActionContext[JsValue]), NotificationType](
        "NotificationType",
        "Interface of a notification",
        () =>
          fields[(DataStore, DaikokuActionContext[JsValue]), NotificationType](
            Field("value", StringType, resolve = _.value.value)
          )
      )

    lazy val NotificationSenderType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      NotificationSender
    ](
      ObjectTypeDescription("A notification sender object"),
      ReplaceField(
        "id",
        Field("id", OptionType(StringType), resolve = _.value.id.map(_.value))
      ),
      ReplaceField(
        "email",
        Field("email", StringType, resolve = _.value.email)
      ),
      ReplaceField("name", Field("name", StringType, resolve = _.value.name))
    )

    lazy val NotificationType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      Notification
    ](
      ObjectTypeDescription("A default notification object"),
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value)),
      ReplaceField(
        "tenant",
        Field(
          "tenant",
          OptionType(TenantType),
          resolve =
            ctx => ctx.ctx._1.tenantRepo.findById(ctx.value.tenant.value)
        )
      ),
      ReplaceField(
        "team",
        Field(
          "team",
          OptionType(TeamObjectType),
          resolve = ctx =>
            ctx.value.team match {
              case Some(team) =>
                ctx.ctx._1.teamRepo.forTenant(ctx.ctx._2.tenant).findById(team)
              case None => None
            }
        )
      ),
      ReplaceField(
        "sender",
        Field("sender", NotificationSenderType, resolve = _.value.sender)
      ),
      ReplaceField(
        "date",
        Field("date", DateTimeUnitype, resolve = _.value.date)
      ),
      ReplaceField(
        "notificationType",
        Field(
          "notificationType",
          NotificationInterfaceType,
          resolve = _.value.notificationType
        )
      ),
      ReplaceField(
        "status",
        Field(
          "status",
          NotificationStatusType,
          resolve = _.value.status,
          possibleTypes = List(
            NotificationStatusAcceptedType,
            NotificationStatusRejectedType,
            NotificationStatusPendingType
          )
        )
      ),
      ReplaceField(
        "action",
        Field(
          "action",
          NotificationActionType,
          resolve = _.value.action,
          possibleTypes = List(
            ApiAccessType,
            TeamInvitationType,
            ApiSubscriptionDemandType,
            OtoroshiSyncSubscriptionErrorType,
            OtoroshiSyncApiErrorType,
            ApiKeyDeletionInformationType,
            ApiKeyDeletionInformationV2Type,
            ApiKeyRotationInProgressType,
            ApiKeyRotationInProgressV2Type,
            ApiKeyRotationEndedType,
            ApiKeyRotationEndedV2Type,
            ApiKeyRefreshType,
            ApiKeyRefreshV2Type,
            NewPostPublishedType,
            NewPostPublishedV2Type,
            NewIssueOpenType,
            NewIssueOpenV2Type,
            NewCommentOnIssueType,
            NewCommentOnIssueV2Type,
            TransferApiOwnershipType,
            ApiSubscriptionRejectType,
            ApiSubscriptionAcceptType,
            CheckoutForSubscriptionType,
            ApiSubscriptionTransferSuccessType
          )
        )
      )
    )

    lazy val FiniteDurationType = ObjectType(
      "FiniteDuration",
      "A finite duration",
      fields[(DataStore, DaikokuActionContext[JsValue]), FiniteDuration](
        Field("length", LongType, resolve = _.value.length),
        Field("unit", TimeUnitType, resolve = _.value.unit)
      )
    )

    lazy val UserSessionType
        : ObjectType[(DataStore, DaikokuActionContext[JsValue]), UserSession] =
      ObjectType[(DataStore, DaikokuActionContext[JsValue]), UserSession](
        "UserSession",
        "A user session",
        () =>
          fields[(DataStore, DaikokuActionContext[JsValue]), UserSession](
            Field("_id", StringType, resolve = _.value.id.value),
            Field(
              "userId",
              OptionType(UserType),
              resolve = ctx => ctx.ctx._1.userRepo.findById(ctx.value.userId)
            ),
            Field("sessionId", StringType, resolve = _.value.sessionId.value),
            Field("userName", StringType, resolve = _.value.userName),
            Field("userEmail", StringType, resolve = _.value.userEmail),
            Field(
              "impersonatorId",
              OptionType(UserType),
              resolve = ctx =>
                ctx.value.impersonatorId match {
                  case Some(u) => ctx.ctx._1.userRepo.findById(u)
                  case None    => None
                }
            ),
            Field(
              "impersonatorName",
              OptionType(StringType),
              resolve = _.value.impersonatorName
            ),
            Field(
              "impersonatorEmail",
              OptionType(StringType),
              resolve = _.value.impersonatorEmail
            ),
            Field(
              "impersonatorSessionId",
              OptionType(UserSessionType),
              resolve = ctx =>
                ctx.value.impersonatorSessionId match {
                  case Some(imp) =>
                    ctx.ctx._1.userSessionRepo.findById(imp.value)
                  case None => None
                }
            ),
            Field("created", DateTimeUnitype, resolve = _.value.created),
            Field("ttl", FiniteDurationType, resolve = _.value.ttl),
            Field("expires", DateTimeUnitype, resolve = _.value.expires)
          )
      )

    val ApiKeyGlobalConsumptionInformationsType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      ApiKeyGlobalConsumptionInformations
    ](
      ObjectTypeDescription("Consumptions of an api key")
    )
    val ApiKeyQuotasType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      ApiKeyQuotas
    ](
      ObjectTypeDescription("Quotas of an api key")
    )
    val ApiKeyBillingType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      ApiKeyBilling
    ](
      ObjectTypeDescription("Billing of an api key")
    )

    val ApiKeyConsumptionType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      ApiKeyConsumption
    ](
      ObjectTypeDescription("Quotas and information about an api key"),
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value)),
      ReplaceField(
        "tenant",
        Field(
          "tenant",
          OptionType(TenantType),
          resolve =
            ctx => ctx.ctx._1.tenantRepo.findById(ctx.value.tenant.value)
        )
      ),
      ReplaceField(
        "team",
        Field(
          "team",
          OptionType(TeamObjectType),
          resolve = ctx =>
            ctx.ctx._1.teamRepo
              .forTenant(ctx.ctx._2.tenant)
              .findById(ctx.value.team.value)
        )
      ),
      ReplaceField(
        "api",
        Field(
          "api",
          OptionType(ApiType),
          resolve = ctx =>
            ctx.ctx._1.apiRepo
              .forTenant(ctx.ctx._2.tenant)
              .findById(ctx.value.api)
        )
      ),
      ReplaceField(
        "plan",
        Field(
          "plan",
          OptionType(UsagePlanType),
          resolve = ctx =>
            ctx.ctx._1.usagePlanRepo
              .forTenant(ctx.ctx._2.tenant)
              .findById(ctx.value.plan)
        )
      ),
      ReplaceField(
        "globalInformations",
        Field(
          "globalInformations",
          ApiKeyGlobalConsumptionInformationsType,
          resolve = _.value.globalInformations
        )
      ),
      ReplaceField(
        "quotas",
        Field("quotas", ApiKeyQuotasType, resolve = _.value.quotas)
      ),
      ReplaceField(
        "billing",
        Field("billing", ApiKeyBillingType, resolve = _.value.billing)
      ),
      ReplaceField(
        "from",
        Field("from", DateTimeUnitype, resolve = _.value.from)
      ),
      ReplaceField("to", Field("to", DateTimeUnitype, resolve = _.value.to)),
      ReplaceField(
        "clientId",
        Field("clientId", StringType, resolve = _.value.clientId)
      ),
      ReplaceField(
        "state",
        Field("state", StringType, resolve = _.value.state.name)
      )
    )

    val PasswordResetType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      PasswordReset
    ](
      ObjectTypeDescription(
        "Information to reset the account password of an user."
      ),
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value)),
      ReplaceField(
        "user",
        Field(
          "user",
          OptionType(UserType),
          resolve = ctx => ctx.ctx._1.userRepo.findById(ctx.value.user.value)
        )
      ),
      ReplaceField(
        "creationDate",
        Field("creationDate", DateTimeUnitype, resolve = _.value.creationDate)
      ),
      ReplaceField(
        "validUntil",
        Field("validUntil", DateTimeUnitype, resolve = _.value.validUntil)
      )
    )
    val AccountCreationType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      AccountCreation
    ](
      ObjectTypeDescription(
        "A new user awaiting confirmation of their account."
      ),
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value)),
      ReplaceField(
        "creationDate",
        Field("creationDate", DateTimeUnitype, resolve = _.value.creationDate)
      ),
      ReplaceField(
        "validUntil",
        Field(
          "validUntil",
          OptionType(DateTimeUnitype),
          resolve = _.value.validUntil
        )
      )
    )
    lazy val TranslationType =
      ObjectType[(DataStore, DaikokuActionContext[JsValue]), Translation](
        "Translation",
        "A translation of Daikoku elements like (mail, notification, buttons, title ...).",
        () =>
          fields[(DataStore, DaikokuActionContext[JsValue]), Translation](
            Field("_id", StringType, resolve = _.value.id.value),
            Field(
              "tenant",
              OptionType(TenantType),
              resolve =
                ctx => ctx.ctx._1.tenantRepo.findById(ctx.value.tenant.value)
            ),
            Field("language", StringType, resolve = _.value.language),
            Field("key", StringType, resolve = _.value.key),
            Field("value", StringType, resolve = _.value.value),
            Field(
              "lastModificationAt",
              OptionType(DateTimeUnitype),
              resolve = _.value.lastModificationAt
            )
          )
      )

    /*val  EvolutionType = deriveObjectType[(DataStore, DaikokuActionContext[JsValue]), Evolution](
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value)),
      ReplaceField("date", Field("date", DateTimeUnitype, resolve = _.value.date))
    )*/

    val MessageIntefaceType: InterfaceType[
      (DataStore, DaikokuActionContext[JsValue]),
      MessageType
    ] = InterfaceType(
      "MessageInterface",
      "An in-app message interface.",
      () =>
        fields[(DataStore, DaikokuActionContext[JsValue]), MessageType](
          Field("name", StringType, resolve = _.value.value.value)
        )
    )

    val MessageType =
      ObjectType[(DataStore, DaikokuActionContext[JsValue]), Message](
        "Message",
        "An in-app message.",
        () =>
          fields[(DataStore, DaikokuActionContext[JsValue]), Message](
            Field("_id", StringType, resolve = _.value.id.value),
            Field(
              "tenant",
              OptionType(TenantType),
              resolve =
                ctx => ctx.ctx._1.tenantRepo.findById(ctx.ctx._2.tenant.id)
            ),
            Field(
              "messageType",
              MessageIntefaceType,
              resolve = _.value.messageType
            ),
            Field(
              "participants",
              ListType(UserType),
              resolve = ctx =>
                ctx.ctx._1.userRepo.find(
                  Json.obj(
                    "_id" -> Json.obj(
                      "$in" -> JsArray(
                        ctx.value.participants.toSeq.map(_.asJson)
                      )
                    )
                  )
                )
            ),
            Field(
              "readBy",
              ListType(UserType),
              resolve = ctx =>
                ctx.ctx._1.userRepo.find(
                  Json.obj(
                    "_id" -> Json.obj(
                      "$in" -> JsArray(ctx.value.readBy.toSeq.map(_.asJson))
                    )
                  )
                )
            ),
            Field(
              "chat",
              OptionType(UserType),
              resolve = ctx => ctx.ctx._1.userRepo.findById(ctx.value.chat)
            ),
            Field("date", DateTimeUnitype, resolve = _.value.date),
            Field(
              "sender",
              OptionType(UserType),
              resolve = ctx => ctx.ctx._1.userRepo.findById(ctx.value.sender)
            ),
            Field("message", StringType, resolve = _.value.message),
            Field(
              "closed",
              OptionType(DateTimeUnitype),
              resolve = _.value.closed
            ),
            Field("send", BooleanType, resolve = _.value.send)
          )
      )

    case class UserAuditEvent(
        id: UserId,
        name: String,
        email: String,
        isDaikokuAdmin: Boolean
    )
    val UserAuditEventType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      UserAuditEvent
    ](
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value))
    )

    val UserAuditEventTypeReader = new Format[UserAuditEvent] {
      override def reads(json: JsValue): JsResult[UserAuditEvent] =
        JsSuccess(
          UserAuditEvent(
            id = (json \ "id").as(UserIdFormat),
            name = (json \ "name").as[String],
            email = (json \ "email").as[String],
            isDaikokuAdmin =
              (json \ "isDaikokuAdmin").asOpt[Boolean].getOrElse(false)
          )
        )
      override def writes(o: UserAuditEvent): JsValue = Json.obj()
    }

    case class TenantAuditEvent(id: TenantId, name: String)
    val TenantAuditEventType = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      TenantAuditEvent
    ](
      ReplaceField("id", Field("_id", StringType, resolve = _.value.id.value))
    )

    val TenantAuditEventTypeReader = new Format[TenantAuditEvent] {
      override def reads(json: JsValue): JsResult[TenantAuditEvent] =
        JsSuccess(
          TenantAuditEvent(
            id = (json \ "id").as(TenantIdFormat),
            name = (json \ "name").as[String]
          )
        )
      override def writes(o: TenantAuditEvent): JsValue = Json.obj()
    }

    val AuditEventType =
      ObjectType[(DataStore, DaikokuActionContext[JsValue]), JsObject](
        "AuditEvent",
        "An audit event",
        () =>
          fields[(DataStore, DaikokuActionContext[JsValue]), JsObject](
            Field(
              "event_id",
              OptionType(StringType),
              resolve = ctx => (ctx.value \ "@id").asOpt[String]
            ),
            Field(
              "event_type",
              OptionType(StringType),
              resolve = ctx => (ctx.value \ "@type").asOpt[String]
            ),
            Field(
              "event_userId",
              OptionType(StringType),
              resolve = ctx => (ctx.value \ "@userId").asOpt[String]
            ),
            Field(
              "event_tenantId",
              OptionType(StringType),
              resolve = ctx => (ctx.value \ "@tenantId").asOpt[String]
            ),
            Field(
              "event_timestamp",
              OptionType(LongType),
              resolve = ctx => (ctx.value \ "@timestamp").asOpt[Long]
            ),
            Field(
              "id",
              OptionType(StringType),
              resolve = ctx => (ctx.value \ "_id").asOpt[String]
            ),
            Field(
              "url",
              OptionType(StringType),
              resolve = ctx => (ctx.value \ "url").asOpt[String]
            ),
            Field(
              "user",
              OptionType(UserAuditEventType),
              resolve =
                ctx => (ctx.value \ "user").asOpt(UserAuditEventTypeReader)
            ),
            Field(
              "impersonator",
              OptionType(UserAuditEventType),
              resolve = ctx =>
                (ctx.value \ "impersonator").toOption.flatMap {
                  case JsNull => None
                  case value  => UserAuditEventTypeReader.reads(value).asOpt
                }
            ),
            Field(
              "verb",
              OptionType(StringType),
              resolve = ctx => (ctx.value \ "verb").asOpt[String]
            ),
            Field(
              "tenant",
              OptionType(TenantAuditEventType),
              resolve =
                ctx => (ctx.value \ "tenant").asOpt(TenantAuditEventTypeReader)
            ),
            Field(
              "_tenant",
              OptionType(StringType),
              resolve = ctx => (ctx.value \ "_tenant").asOpt[String]
            ),
            Field(
              "message",
              OptionType(StringType),
              resolve = ctx => (ctx.value \ "message").asOpt[String]
            ),
            Field(
              "authorized",
              OptionType(StringType),
              resolve = ctx => (ctx.value \ "authorized").asOpt[String]
            )
          )
      )

    lazy val AuditTrailType: ObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      (Seq[JsObject], Long)
    ] =
      ObjectType[
        (DataStore, DaikokuActionContext[JsValue]),
        (Seq[JsObject], Long)
      ](
        "AuditTrail",
        "audit trail as a collection of audit event and the total of event",
        () =>
          fields[
            (DataStore, DaikokuActionContext[JsValue]),
            (Seq[JsObject], Long)
          ](
            Field("events", ListType(AuditEventType), resolve = _.value._1),
            Field("total", LongType, resolve = _.value._2)
          )
      )
    lazy val ApiSubscriptionListType: ObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      (Seq[ApiSubscription], Long)
    ] =
      ObjectType[
        (DataStore, DaikokuActionContext[JsValue]),
        (Seq[ApiSubscription], Long)
      ](
        "ApiSubscriptions",
        "Api Subscriptions as a collection of subscriptions and the total of",
        () =>
          fields[
            (DataStore, DaikokuActionContext[JsValue]),
            (Seq[ApiSubscription], Long)
          ](
            Field(
              "subscriptions",
              ListType(ApiSubscriptionType),
              resolve = _.value._1
            ),
            Field("total", LongType, resolve = _.value._2)
          )
      )

    lazy val CmsPageType
        : ObjectType[(DataStore, DaikokuActionContext[JsValue]), CmsPage] =
      ObjectType[(DataStore, DaikokuActionContext[JsValue]), CmsPage](
        "CmsPage",
        "A CMS page",
        () =>
          fields[(DataStore, DaikokuActionContext[JsValue]), CmsPage](
            Field("id", StringType, resolve = _.value.id.value),
            Field(
              "tenant",
              OptionType(TenantType),
              resolve = ctx => ctx.ctx._1.tenantRepo.findById(ctx.value.tenant)
            ),
            Field(
              "forwardRef",
              OptionType(CmsPageType),
              resolve = ctx =>
                ctx.value.forwardRef match {
                  case Some(ref) =>
                    ctx.ctx._1.cmsRepo.forTenant(ctx.value.tenant).findById(ref)
                  case None => None
                }
            ),
            Field("deleted", BooleanType, resolve = _.value.deleted),
            Field("visible", BooleanType, resolve = _.value.visible),
            Field(
              "authenticated",
              BooleanType,
              resolve = _.value.authenticated
            ),
            Field("name", StringType, resolve = _.value.name),
            Field("picture", OptionType(StringType), resolve = _.value.picture),
            Field("tags", ListType(StringType), resolve = _.value.tags),
            Field("metadata", MapType, resolve = _.value.metadata),
            Field("contentType", StringType, resolve = _.value.contentType),
            Field("body", StringType, resolve = _.value.body),
            Field("path", OptionType(StringType), resolve = _.value.path),
            Field("exact", BooleanType, resolve = _.value.exact),
            Field(
              "lastPublishedDate",
              OptionType(LongType),
              resolve = _.value.lastPublishedDate.map(p => p.getMillis)
            )
          )
      )

    case class SubscriptionDemandWithCount(
        subscriptionDemands: Seq[SubscriptionDemand],
        total: Long
    )
    lazy val graphQlSubscriptionDemandWithCount = deriveObjectType[
      (DataStore, DaikokuActionContext[JsValue]),
      SubscriptionDemandWithCount
    ](
      ObjectTypeDescription(
        "A limited list of Daikoku apis with the count of all the apis for pagination"
      ),
      ReplaceField(
        "subscriptionDemands",
        Field(
          "subscriptionDemands",
          ListType(SubscriptionDemandType),
          resolve = _.value.subscriptionDemands
        )
      ),
      ReplaceField("total", Field("total", LongType, resolve = _.value.total))
    )

    val ID: Argument[String] =
      Argument("id", StringType, description = "The id of element")
    val LIMIT: Argument[Int] = Argument(
      "limit",
      IntType,
      description =
        "The maximum number of entries to return. If the value exceeds the maximum, then the maximum value will be used.",
      defaultValue = -1
    )
    val OFFSET: Argument[Int] = Argument(
      "offset",
      IntType,
      description =
        "The (zero-based) offset of the first item in the collection to return",
      defaultValue = 0
    )
    val GROUP_ID = Argument(
      "groupId",
      OptionInputType(StringType),
      description = "The id of API group"
    )
    val API_SUB_ONLY: Argument[Boolean] = Argument(
      "apiSubOnly",
      BooleanType,
      description = "The condition if you want to see only subscribed Apis.",
      defaultValue = false
    )
    val RESEARCH: Argument[String] = Argument(
      "research",
      StringType,
      description = "This is a the string of a research",
      defaultValue = ""
    )
    val FILTER: Argument[String] = Argument(
      "filter",
      StringType,
      description = "This is a the string for filtering request",
      defaultValue = ""
    )
    val FILTER_TABLE: Argument[JsArray] = Argument(
      "filterTable",
      JsArrayType,
      description = "This is a the json for filtering request",
      defaultValue = "[]"
    )
    val SORTING_TABLE: Argument[JsArray] = Argument(
      "sortingTable",
      JsArrayType,
      description = "This is a the json for sorting request",
      defaultValue = "[]"
    )

    val SELECTED_TAG = Argument(
      "selectedTag",
      OptionInputType(StringType),
      description = "A tag of an Api"
    )
    val SELECTED_TEAM = Argument(
      "selectedTeam",
      OptionInputType(StringType),
      description = "An API owner"
    )
    val SELECTED_CAT = Argument(
      "selectedCategory",
      OptionInputType(StringType),
      description = "A category of an Api"
    )
    val DELETED: Argument[Boolean] = Argument(
      "deleted",
      BooleanType,
      description = "If enabled, the page is considered deleted",
      defaultValue = false
    )
    val IDS = Argument(
      "ids",
      OptionInputType(ListInputType(StringType)),
      description = "List of filtered ids (if empty, no filter)"
    )
    val TEAM_ID = Argument(
      "teamId",
      OptionInputType(StringType),
      description = "The id of the team"
    )
    val SUBSCRIPTION_ID = Argument(
      "subscriptionId",
      StringType,
      description = "The id of the subscription"
    )
    val TEAM_ID_NOT_OPT =
      Argument("teamId", StringType, description = "The id of the team")
    val PLAN_ID_OPT = Argument(
      "planIdOpt",
      OptionInputType(StringType),
      description = "The optional id of a plan"
    )
    val FROM =
      Argument("from", OptionInputType(LongType), description = "Date from")
    val PAGE_NUMBER = Argument(
      "pageNumber",
      OptionInputType(IntType),
      description = "The number of the current page",
      defaultValue = 0
    )
    val PAGE_SIZE = Argument(
      "pageSize",
      OptionInputType(IntType),
      description = "The number of items displayed on the current page",
      defaultValue = 10
    )
    val TO = Argument("to", OptionInputType(LongType), description = "Date to")
    val VERSION = Argument("version", StringType, description = "a version")
    val API_IDS = Argument(
      "apiIds",
      OptionInputType(ListInputType(StringType)),
      description = "The ids of apis to filter request (optional)"
    )
    def teamQueryFields()
        : List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] =
      List(
        Field(
          "myTeams",
          ListType(TeamObjectType),
          resolve = ctx =>
            CommonServices.myTeams()(ctx.ctx._2, env, e).map {
              case Right(value) => value
              case Left(r)      => throw NotAuthorizedError(r.toString)
            }
        )
      )

    def allTeams(
        ctx: Context[(DataStore, DaikokuActionContext[JsValue]), Unit],
        research: String,
        limit: Int,
        offset: Int
    ) = {
      CommonServices.allTeams(research, limit, offset)(ctx.ctx._2, env, e).map {
        case Left(value)  => throw NotAuthorizedError(value.toString)
        case Right(value) => value

      }
    }
    def allTeamsQuery()
        : List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] =
      List(
        Field(
          "teamsPagination",
          TeamWithCountType,
          arguments = RESEARCH :: LIMIT :: OFFSET :: Nil,
          resolve = ctx => {
            allTeams(ctx, ctx.arg(RESEARCH), ctx.arg(LIMIT), ctx.arg(OFFSET))
          }
        )
      )

    def getApiConsumption(
        ctx: Context[(DataStore, DaikokuActionContext[JsValue]), Unit],
        apiId: String,
        teamId: String,
        from: Option[Long],
        to: Option[Long],
        planId: Option[String]
    ) = {
      CommonServices
        .getApiConsumption(apiId, teamId, from, to, planId)(ctx.ctx._2, env, e)
        .map {
          case Left(value)  => throw NotAuthorizedError(value.toString)
          case Right(value) => value
        }
    }

    def apiConsumptionQuery()
        : List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] =
      List(
        Field(
          "apiConsumptions",
          ListType(ApiKeyConsumptionType),
          arguments = ID :: TEAM_ID_NOT_OPT :: FROM :: TO :: PLAN_ID_OPT :: Nil,
          resolve = ctx => {
            getApiConsumption(
              ctx,
              ctx.arg(ID),
              ctx.arg(TEAM_ID_NOT_OPT),
              ctx.arg(FROM),
              ctx.arg(TO),
              ctx.arg(PLAN_ID_OPT)
            )

          }
        )
      )

    def getTeamIncome(
        ctx: Context[(DataStore, DaikokuActionContext[JsValue]), Unit],
        teamId: String,
        from: Option[Long],
        to: Option[Long]
    ) = {
      CommonServices.getTeamIncome(teamId, from, to)(ctx.ctx._2, env, e).map {
        case Left(value)  => throw NotAuthorizedError(value.toString)
        case Right(value) => value
      }
    }

    def teamIncomeQuery()
        : List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] =
      List(
        Field(
          "teamIncomes",
          ListType(ApiKeyConsumptionType),
          arguments = TEAM_ID_NOT_OPT :: FROM :: TO :: Nil,
          resolve = ctx => {
            getTeamIncome(
              ctx,
              ctx.arg(TEAM_ID_NOT_OPT),
              ctx.arg(FROM),
              ctx.arg(TO)
            )
          }
        )
      )

    def getMyNotification(
        ctx: Context[(DataStore, DaikokuActionContext[JsValue]), Unit],
        filter: JsArray,
        sort: JsArray,
        limit: Int,
        offset: Int
    ) = {
      CommonServices
        .getMyNotification(filter, sort, limit, offset)(ctx.ctx._2, env, e)
        .map {
          case Left(value)  => throw NotAuthorizedError(value.toString)
          case Right(value) => value
        }
    }

    def myNotificationQuery()
        : List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] =
      List(
        Field(
          "myNotifications",
          NotificationWithCountType,
          arguments = FILTER_TABLE :: SORTING_TABLE :: LIMIT :: OFFSET :: Nil,
          resolve = ctx => {
            getMyNotification(
              ctx,
              ctx.arg(FILTER_TABLE),
              ctx.arg(SORTING_TABLE),
              ctx.arg(LIMIT),
              ctx.arg(OFFSET)
            )
          }
        )
      )

    def getApiSubscriptions(
        ctx: Context[(DataStore, DaikokuActionContext[JsValue]), Unit],
        apiId: String,
        teamId: String,
        version: String,
        filter: JsArray,
        sorting: JsArray,
        limit: Int,
        offset: Int
    ) = {
      CommonServices
        .getApiSubscriptions(
          teamId,
          apiId,
          version,
          filter,
          sorting,
          limit,
          offset
        )(ctx.ctx._2, env, e)
        .map {
          case Left(value)  => throw NotAuthorizedError(value.toString)
          case Right(value) => value
        }
    }

    def getAuditTrail(
        ctx: Context[(DataStore, DaikokuActionContext[JsValue]), Unit],
        from: Long,
        to: Long,
        filter: JsArray,
        sorting: JsArray,
        limit: Int,
        offset: Int
    ) = {
      CommonServices
        .getAuditTrail(
          from,
          to,
          filter,
          sorting,
          limit,
          offset
        )(ctx.ctx._2, env, e)
        .map {
          case Left(value)  => throw NotAuthorizedError(value.toString)
          case Right(value) => value
        }
    }

    def apiSubscriptionsQueryFields()
        : List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] =
      List(
        Field(
          "apiApiSubscriptions",
          ApiSubscriptionListType,
          arguments =
            ID :: TEAM_ID_NOT_OPT :: VERSION :: FILTER_TABLE :: SORTING_TABLE :: LIMIT :: OFFSET :: Nil,
          resolve = ctx => {
            getApiSubscriptions(
              ctx,
              ctx.arg(ID),
              ctx.arg(TEAM_ID_NOT_OPT),
              ctx.arg(VERSION),
              ctx.arg(FILTER_TABLE),
              ctx.arg(SORTING_TABLE),
              ctx.arg(LIMIT),
              ctx.arg(OFFSET)
            )
          }
        )
      )

    def getAuditTrailQueryFields()
        : List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] =
      List(
        Field(
          "auditTrail",
          AuditTrailType,
          arguments =
            FROM :: TO :: FILTER_TABLE :: SORTING_TABLE :: LIMIT :: OFFSET :: Nil,
          resolve = ctx => {
            getAuditTrail(
              ctx,
              ctx.arg(FROM).getOrElse(DateTime.now().minusDays(1).getMillis),
              ctx.arg(TO).getOrElse(DateTime.now().getMillis),
              ctx.arg(FILTER_TABLE),
              ctx.arg(SORTING_TABLE),
              ctx.arg(LIMIT),
              ctx.arg(OFFSET)
            )
          }
        )
      )

    def getVisibleApis(
        ctx: Context[(DataStore, DaikokuActionContext[JsValue]), Unit],
        teamId: Option[String] = None,
        research: String,
        selectedTeam: Option[String] = None,
        selectedTag: Option[String] = None,
        selectedCat: Option[String] = None,
        limit: Int,
        offset: Int,
        groupOpt: Option[String] = None
    ) = {
      CommonServices
        .getVisibleApis(
          teamId,
          research,
          selectedTeam,
          selectedTag,
          selectedCat,
          limit,
          offset,
          groupOpt
        )(ctx.ctx._2, env, e)
        .map {
          case Right(value) => value
          case Left(r)      => throw NotAuthorizedError(r.toString)
        }
    }
    def getSubscriptionDetails(
        ctx: Context[(DataStore, DaikokuActionContext[JsValue]), Unit],
        subscriptionId: String,
        teamId: String
    ) = {
      CommonServices.getApiSubscriptionDetails(subscriptionId, teamId)(
        ctx.ctx._2,
        env,
        e
      )
    }

    def apiQueryFields()
        : List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] =
      List(
        Field(
          "visibleApis",
          ApiWithCountType,
          arguments =
            TEAM_ID :: RESEARCH :: SELECTED_TEAM :: SELECTED_TAG :: SELECTED_CAT :: LIMIT :: OFFSET :: GROUP_ID :: Nil,
          resolve = ctx => {
            getVisibleApis(
              ctx,
              ctx.arg(TEAM_ID),
              ctx.arg(RESEARCH),
              ctx.arg(SELECTED_TEAM),
              ctx.arg(SELECTED_TAG),
              ctx.arg(SELECTED_CAT),
              ctx.arg(LIMIT),
              ctx.arg(OFFSET),
              ctx.arg(GROUP_ID)
            )
          }
        )
      )

    def getAllTagsQueryFields()
        : List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] =
      List(
        Field(
          "allTags",
          ListType(StringType),
          arguments =
            RESEARCH :: SELECTED_TEAM :: SELECTED_TAG :: SELECTED_CAT :: GROUP_ID :: FILTER :: LIMIT :: OFFSET :: Nil,
          resolve = ctx => {
            CommonServices.getAllTags(
              research = ctx.arg(RESEARCH),
              selectedTeam = ctx.arg(SELECTED_TEAM),
              selectedTag = ctx.arg(SELECTED_TAG),
              selectedCat = ctx.arg(SELECTED_CAT),
              groupOpt = ctx.arg(GROUP_ID),
              filter = ctx.arg(FILTER),
              limit = ctx.arg(LIMIT),
              offset = ctx.arg(OFFSET)
            )(ctx.ctx._2, env, e)
          }
        )
      )

    def getAllCategoriesQueryFields()
        : List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] =
      List(
        Field(
          "allCategories",
          ListType(StringType),
          arguments =
            RESEARCH :: SELECTED_TEAM :: SELECTED_TAG :: SELECTED_CAT :: GROUP_ID :: FILTER :: LIMIT :: OFFSET :: Nil,
          resolve = ctx => {
            CommonServices
              .getAllCategories(
                research = ctx.arg(RESEARCH),
                selectedTeam = ctx.arg(SELECTED_TEAM),
                selectedTag = ctx.arg(SELECTED_TAG),
                selectedCat = ctx.arg(SELECTED_CAT),
                groupOpt = ctx.arg(GROUP_ID),
                filter = ctx.arg(FILTER),
                limit = ctx.arg(LIMIT),
                offset = ctx.arg(OFFSET)
              )(ctx.ctx._2, env, e)
          }
        )
      )

    def getApisWithSubscriptions(
        ctx: Context[(DataStore, DaikokuActionContext[JsValue]), Unit],
        teamId: String,
        research: String,
        apiSubOnly: Boolean,
        limit: Int,
        offset: Int
    ) = {
      CommonServices
        .getApisWithSubscriptions(teamId, research, limit, offset, apiSubOnly)(
          ctx.ctx._2,
          env,
          e
        )
        .map {
          case Right(value) => value
          case Left(r)      => throw NotAuthorizedError(r.toString)
        }
    }

    def apiWithSubscriptionsQueryFields()
        : List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] =
      List(
        Field(
          "accessibleApis",
          GraphQlAccessibleApisWithNumberOfApis,
          arguments =
            TEAM_ID_NOT_OPT :: RESEARCH :: API_SUB_ONLY :: LIMIT :: OFFSET :: Nil,
          resolve = ctx => {
            getApisWithSubscriptions(
              ctx,
              ctx.arg(TEAM_ID_NOT_OPT),
              ctx.arg(RESEARCH),
              ctx.arg(API_SUB_ONLY),
              ctx.arg(LIMIT),
              ctx.arg(OFFSET)
            )
          }
        )
      )

    def cmsPageFields()
        : List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] =
      List(
        Field(
          "pages",
          ListType(CmsPageType),
          arguments = DELETED :: Nil,
          resolve = ctx => {
            _TenantAdminAccessTenant(
              AuditTrailEvent(s"@{user.name} has accessed the list of cms page")
            )(ctx.ctx._2) {
              ctx.ctx._1.cmsRepo
                .forTenant(ctx.ctx._2.tenant)
                .find(
                  Json.obj(
                    "_deleted" -> ctx.arg(DELETED)
                  )
                )
            }.map {
              case Right(value) => value
              case Left(r)      => throw NotAuthorizedError(r.toString)
            }
          }
        )
      )

    def subscriptionDemandsForTeamAdmin()
        : List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] =
      List(
        Field(
          "subscriptionDemandsForAdmin",
          graphQlSubscriptionDemandWithCount,
          arguments = TEAM_ID_NOT_OPT :: API_IDS :: LIMIT :: OFFSET :: Nil,
          resolve = ctx => {
            _TeamMemberOnly(
              ctx.arg(TEAM_ID_NOT_OPT),
              AuditTrailEvent("*** TODO ***")
            )(ctx.ctx._2) { team =>
              val tenant = ctx.ctx._2.tenant
              val dataStore = ctx.ctx._1
              val apiIds = ctx.arg(API_IDS)

              def testApisTeam(
                  apis: Seq[Api],
                  team: Team
              ): EitherT[Future, AppError, Unit] = {
                if (apis.exists(_.team != team.id))
                  EitherT.leftT[Future, Unit](AppError.ForbiddenAction)
                else EitherT.pure[Future, AppError](())
              }

              val apiFilter =
                if (apiIds.isEmpty) Json.obj()
                else Json.obj("_id" -> Json.obj("$in" -> apiIds.get))

              val value
                  : EitherT[Future, AppError, (Seq[SubscriptionDemand], Long)] =
                for {
                  apis <- EitherT.liftF(
                    dataStore.apiRepo
                      .forTenant(tenant)
                      .findNotDeleted(
                        Json.obj("team" -> team.id.asJson) ++ apiFilter
                      )
                  )
                  _ <- testApisTeam(apis, team)
                  demands <- EitherT.liftF(
                    dataStore.subscriptionDemandRepo
                      .forTenant(tenant)
                      .findWithPagination(
                        Json.obj(
                          "_deleted" -> false,
                          "$or" -> Json.arr(
                            Json.obj(
                              "state" -> SubscriptionDemandState.InProgress.name
                            ),
                            Json.obj(
                              "state" -> SubscriptionDemandState.Waiting.name
                            )
                          ),
                          "api" -> Json
                            .obj("$in" -> JsArray(apis.map(_.id.asJson)))
                        ),
                        ctx.arg(OFFSET),
                        ctx.arg(LIMIT)
                      )
                  )
                } yield demands

              value.value

            }.map {
              case Left(error) =>
                throw NotAuthorizedError((error.toJson() \ "error").as[String])
              case Right(demands) =>
                SubscriptionDemandWithCount(demands._1, demands._2)
            }
          }
        )
      )

    def teamSubscriptionDemands()
        : List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] =
      List(
        Field(
          "teamSubscriptionDemands",
          graphQlSubscriptionDemandWithCount,
          arguments = TEAM_ID_NOT_OPT :: LIMIT :: OFFSET :: Nil,
          resolve = ctx => {
            _TeamMemberOnly(
              ctx.arg(TEAM_ID_NOT_OPT),
              AuditTrailEvent("*** TODO ***")
            )(ctx.ctx._2) { team =>
              val tenant = ctx.ctx._2.tenant
              val dataStore = ctx.ctx._1

              dataStore.subscriptionDemandRepo
                .forTenant(tenant)
                .findWithPagination(
                  Json.obj(
                    "_deleted" -> false,
                    "team" -> team.id.asJson,
                    "$or" -> Json.arr(
                      Json.obj(
                        "state" -> SubscriptionDemandState.InProgress.name
                      ),
                      Json.obj("state" -> SubscriptionDemandState.Waiting.name)
                    )
                  ),
                  ctx.arg(OFFSET),
                  ctx.arg(LIMIT)
                )
                .map {
                  case (demands, count) =>
                    SubscriptionDemandWithCount(demands, count)
                }
                .map(Right(_))
            }.map {
              case Right(demands) => demands
              case Left(error) =>
                throw NotAuthorizedError((error.toJson() \ "error").as[String])
            }
          }
        )
      )

    def getRepoFields[Out, Of, Id <: ValueType](
        fieldName: String,
        fieldType: OutputType[Out],
        repo: Context[(DataStore, DaikokuActionContext[JsValue]), Unit] => Repo[
          Of,
          Id
        ]
    ): List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] = {
      def toQuery(
          maybeIds: Option[Seq[String]],
          maybeTeamId: Option[String]
      ): JsObject = {
        (maybeIds, maybeTeamId) match {
          case (None, None) => Json.obj()
          case (Some(ids), None) =>
            Json.obj(
              "$or" -> Json.arr(
                Json
                  .obj("_id" -> Json.obj("$in" -> JsArray(ids.map(JsString)))),
                Json.obj(
                  "_humanReadableId" -> Json
                    .obj("$in" -> JsArray(ids.map(JsString)))
                )
              )
            )
          case (None, Some(teamId)) => Json.obj("team" -> teamId)
          case (Some(ids), Some(teamId)) =>
            Json.obj(
              "$or" -> Json.arr(
                Json.obj(
                  "_id" -> Json.obj("$in" -> JsArray(ids.map(JsString)))
                ),
                Json.obj(
                  "_humanReadableId" -> Json
                    .obj("$in" -> JsArray(ids.map(JsString)))
                )
              ),
              "team" -> teamId
            )
        }
      }

      List(
        Field(
          fieldName,
          OptionType(fieldType),
          arguments = ID :: Nil,
          resolve = ctx =>
            repo(ctx)
              .findByIdOrHrId(ctx.arg(ID))
              .asInstanceOf[Future[Option[Out]]]
        ),
        Field(
          s"${fieldName}s",
          ListType(fieldType),
          arguments = LIMIT :: OFFSET :: IDS :: TEAM_ID :: Nil,
          resolve = ctx => {
            (
              ctx.arg(LIMIT),
              ctx.arg(OFFSET),
              ctx.arg(IDS),
              ctx.arg(TEAM_ID)
            ) match {
              case (-1, _, ids, teamId) =>
                repo(ctx)
                  .find(toQuery(ids, teamId))
                  .map(_.asInstanceOf[Seq[Out]])
              case (limit, offset, ids, teamId) =>
                repo(ctx)
                  .findWithPagination(toQuery(ids, teamId), offset, limit)
                  .map(_._1.asInstanceOf[Seq[Out]])
            }
          }
        )
      )
    }

    def getTenantFields[Out, Of, Id <: ValueType](
        fieldName: String,
        fieldType: OutputType[Out],
        repo: Context[
          (DataStore, DaikokuActionContext[JsValue]),
          Unit
        ] => TenantCapableRepo[Of, Id]
    ): List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] =
      getRepoFields(
        fieldName,
        fieldType,
        ctx => repo(ctx).forTenant(ctx.ctx._2.tenant)
      )

    def getSubscriptionDetailsFields()
        : List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] =
      List(
        Field(
          "apiSubscriptionDetails",
          ApiSubscriptionDetailType,
          arguments =
            SUBSCRIPTION_ID :: TEAM_ID_NOT_OPT :: Nil,
          resolve = ctx => {
            getSubscriptionDetails(
              ctx,
              ctx.arg(SUBSCRIPTION_ID),
              ctx.arg(TEAM_ID_NOT_OPT)
            ).map {
              case Right(details) => details
              case Left(error) =>
                throw NotAuthorizedError(error.getErrorMessage())
            }
          }
        )
      )

    def allFields()
        : List[Field[(DataStore, DaikokuActionContext[JsValue]), Unit]] =
      List(
        getRepoFields("user", UserType, ctx => ctx.ctx._1.userRepo) ++
          getRepoFields(
            "userSession",
            UserSessionType,
            ctx => ctx.ctx._1.userSessionRepo
          ) ++
          getRepoFields("tenant", TenantType, ctx => ctx.ctx._1.tenantRepo) ++
          getRepoFields(
            "passwordReset",
            PasswordResetType,
            ctx => ctx.ctx._1.passwordResetRepo
          ) ++
          getRepoFields(
            "accountCreation",
            AccountCreationType,
            ctx => ctx.ctx._1.accountCreationRepo
          ) ++
          // getRepoFields("evolution", EvolutionType, ctx => ctx.ctx._1.evolutionRepo) ++
          getTenantFields("api", ApiType, ctx => ctx.ctx._1.apiRepo) ++
          getTenantFields("team", TeamObjectType, ctx => ctx.ctx._1.teamRepo) ++
          // format: off
      getTenantFields("translation", TranslationType, ctx => ctx.ctx._1.translationRepo) ++
      getTenantFields("message", MessageType, ctx => ctx.ctx._1.messageRepo) ++
      // format: off
      getTenantFields("apiSubscription", ApiSubscriptionType, ctx => ctx.ctx._1.apiSubscriptionRepo) ++ getTenantFields("apiDocumentationPage", ApiDocumentationPageType, ctx => ctx.ctx._1.apiDocumentationPageRepo) ++
      getTenantFields("notification", NotificationType, ctx => ctx.ctx._1.notificationRepo) ++
      getTenantFields("consumption", ApiKeyConsumptionType, ctx => ctx.ctx._1.consumptionRepo) ++
      getTenantFields("post", ApiPostType, ctx => ctx.ctx._1.apiPostRepo) ++
      getTenantFields("issue", ApiIssueType, ctx => ctx.ctx._1.apiIssueRepo) ++
      getTenantFields("cmsPage", CmsPageType, ctx => ctx.ctx._1.cmsRepo) ++
      getTenantFields("auditEvent", AuditEventType, ctx => ctx.ctx._1.auditTrailRepo):_*
      )

    (
      Schema(ObjectType("Query",
        () => fields[(DataStore, DaikokuActionContext[JsValue]), Unit](allFields() ++
          teamQueryFields() ++
          apiQueryFields() ++
          apiWithSubscriptionsQueryFields() ++
          subscriptionDemandsForTeamAdmin() ++
          teamSubscriptionDemands() ++
          getAllTagsQueryFields() ++
          getAllCategoriesQueryFields() ++
          apiConsumptionQuery() ++
          apiSubscriptionsQueryFields() ++
          teamIncomeQuery() ++
          myNotificationQuery() ++
          allTeamsQuery() ++
          getSubscriptionDetailsFields() ++
          getAuditTrailQueryFields() ++
          cmsPageFields():_*)
      )),
      DeferredResolver.fetchers(teamsFetcher, usersFetcher, apisFetcher)
    )
  }
}
