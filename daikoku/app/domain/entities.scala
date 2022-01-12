package fr.maif.otoroshi.daikoku.domain

import akka.http.scaladsl.util.FastFuture
import cats.syntax.option._
import com.github.jknack.handlebars.{Context, Handlebars, Helper, Options}
import fr.maif.otoroshi.daikoku.actions.DaikokuActionMaybeWithoutUserContext
import fr.maif.otoroshi.daikoku.audit.KafkaConfig
import fr.maif.otoroshi.daikoku.audit.config.{ElasticAnalyticsConfig, Webhook}
import fr.maif.otoroshi.daikoku.domain.NotificationStatus.Pending
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain.json._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.login.AuthProvider
import fr.maif.otoroshi.daikoku.utils.StringImplicits._
import fr.maif.otoroshi.daikoku.utils._
import org.joda.time.DateTime
import play.api.libs.json._
import play.api.mvc.Request
import play.twirl.api.Html
import reactivemongo.bson.BSONObjectID
import storage.TenantCapableRepo

import java.util.concurrent.{Executors, TimeUnit}
import scala.collection.immutable.{AbstractMap, SeqMap, SortedMap}
import scala.concurrent.duration.{DurationInt, FiniteDuration}
import scala.concurrent.{Await, ExecutionContext, Future}

trait CanJson[A] {
  def asJson: JsValue
}

/**
  * Entity representing the UI style of the tenant
  * @param js Javascript code injected in each page
  * @param css CSS code injected in each page
  * @param colorTheme CSS code to customize colors of the current tenant
  */
case class DaikokuStyle(
    js: String = "",
    css: String = "",
    colorTheme: String = s""":root {
  --error-color: #ff6347;
  --error-color: #ffa494;
  --success-color: #4F8A10;
  --success-color: #76cf18;

  --link-color: #7f96af;
  --link--hover-color: #8fa6bf;

  --body-bg-color: #fff;
  --body-text-color: #212529;
  --navbar-bg-color: #7f96af;
  --navbar-brand-color: #fff;
  --menu-bg-color: #fff;
  --menu-text-color: #212529;
  --menu-text-hover-bg-color: #9bb0c5;
  --menu-text-hover-color: #fff;
  --section-bg-color: #f8f9fa;
  --section-text-color: #6c757d;
  --section-bottom-color: #eee;
  --addContent-bg-color: #e9ecef;
  --addContent-text-color: #000;
  --sidebar-bg-color: #f8f9fa;

  --btn-bg-color: #fff;
  --btn-text-color: #495057;
  --btn-border-color: #97b0c7;

  --badge-tags-bg-color: #ffc107;
  --badge-tags-bg-color: #ffe1a7;
  --badge-tags-text-color: #212529;

  --pagination-text-color: #586069;
  --pagination-border-color: #586069;

  --table-bg-color: #f8f9fa;

  --apicard-visibility-color: #586069;
  --apicard-visibility-border-color: rgba(27,31,35,.15);
  --modal-selection-bg-color: rgba(27,31,35,.15);
}""",
    jsUrl: Option[String] = None,
    cssUrl: Option[String] = None,
    faviconUrl: Option[String] = None,
    fontFamilyUrl: Option[String] = None,
    title: String = "New Organization",
    description: String = "A new organization to host very fine APIs",
    unloggedHome: String = "",
    homePageVisible: Boolean = false,
    logo: String = "/assets/images/daikoku.svg",
    footer: Option[String] = None
) extends CanJson[DaikokuStyle] {
  override def asJson: JsValue = json.DaikokuStyleFormat.writes(this)
}

case class AuditTrailConfig(
    elasticConfigs: Option[ElasticAnalyticsConfig] = None,
    auditWebhooks: Seq[Webhook] = Seq.empty[Webhook],
    alertsEmails: Seq[String] = Seq.empty[String],
    kafkaConfig: Option[KafkaConfig] = None,
) extends CanJson[AuditTrailConfig] {
  override def asJson: JsValue = json.AuditTrailConfigFormat.writes(this)
}

sealed trait TenantMode {
  def name: String
}

object TenantMode {
  case object Maintenance extends TenantMode {
    def name: String = "Maintenance"
  }
  case object Construction extends TenantMode {
    def name: String = "Construction"
  }
  case object Default extends TenantMode {
    def name: String = "Default"
  }
  case object Translation extends TenantMode {
    def name: String = "Translation"
  }
  def apply(name: String): Option[TenantMode] = name.toLowerCase() match {
    case "maintenance"  => Some(Maintenance)
    case "construction" => Some(Construction)
    case "default"      => Some(Default)
    case "translation"  => Some(Translation)
    case _              => Some(Default)
  }
}

case class Tenant(
    id: TenantId,
    enabled: Boolean = true,
    deleted: Boolean = false,
    name: String,
    domain: String,
    contact: String,
    style: Option[DaikokuStyle],
    defaultLanguage: Option[String],
    otoroshiSettings: Set[OtoroshiSettings],
    mailerSettings: Option[MailerSettings],
    bucketSettings: Option[S3Configuration],
    authProvider: AuthProvider,
    authProviderSettings: JsObject,
    auditTrailConfig: AuditTrailConfig = AuditTrailConfig(),
    isPrivate: Boolean = true,
    adminApi: ApiId,
    adminSubscriptions: Seq[ApiSubscriptionId] = Seq.empty,
    creationSecurity: Option[Boolean] = None,
    subscriptionSecurity: Option[Boolean] = None,
    apiReferenceHideForGuest: Option[Boolean] = Some(true),
    hideTeamsPage: Option[Boolean] = None,
    defaultMessage: Option[String] = None,
    tenantMode: Option[TenantMode] = None,
    aggregationApiKeysSecurity: Option[Boolean] = None,
    robotTxt: Option[String] = None
) extends CanJson[Tenant] {

  override def asJson: JsValue = json.TenantFormat.writes(this)
  def asJsonWithJwt(implicit env: Env): JsValue =
    json.TenantFormat.writes(this).as[JsObject] ++ json.DaikokuHeader
      .jsonHeader(id)
  def mailer(implicit env: Env): Mailer =
    mailerSettings.map(_.mailer).getOrElse(ConsoleMailer())
  def humanReadableId = name.urlPathSegmentSanitized
  def toUiPayload(env: Env): JsValue = {
    Json.obj(
      "_id" -> id.value,
      "_humanReadableId" -> name.urlPathSegmentSanitized,
      "name" -> name,
      "title" -> style
        .map(a => JsString(a.title))
        .getOrElse(JsNull)
        .as[JsValue],
      "description" -> style
        .map(a => JsString(a.description))
        .getOrElse(JsNull)
        .as[JsValue],
      "contact" -> contact,
      "unloggedHome" -> style
        .map(a => JsString(a.unloggedHome))
        .getOrElse(JsNull)
        .as[JsValue],
      "footer" -> style
        .flatMap(_.footer)
        .map(f => JsString(f))
        .getOrElse(JsNull)
        .as[JsValue],
      "logo" -> style.map(a => JsString(a.logo)).getOrElse(JsNull).as[JsValue],
      "mode" -> env.config.mode.name,
      "authProvider" -> authProvider.name,
      "defaultLanguage" -> defaultLanguage.fold(JsNull.as[JsValue])(
        JsString.apply),
      "homePageVisible" -> style.exists(_.homePageVisible),
      "creationSecurity" -> creationSecurity
        .map(JsBoolean)
        .getOrElse(JsBoolean(false))
        .as[JsValue],
      "subscriptionSecurity" -> subscriptionSecurity
        .map(JsBoolean)
        .getOrElse(JsBoolean(true))
        .as[JsValue],
      "apiReferenceHideForGuest" -> apiReferenceHideForGuest
        .map(JsBoolean)
        .getOrElse(JsBoolean(true))
        .as[JsValue],
      "hideTeamsPage" -> hideTeamsPage
        .map(JsBoolean)
        .getOrElse(JsBoolean(false))
        .as[JsValue],
      "defaultMessage" -> defaultMessage
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "tenantMode" -> tenantMode
        .map(mode => JsString.apply(mode.name))
        .getOrElse(JsNull)
        .as[JsValue],
      "aggregationApiKeysSecurity" -> aggregationApiKeysSecurity
        .map(JsBoolean)
        .getOrElse(JsBoolean(false))
        .as[JsValue]
    )
  }
  def colorTheme(): Html = {
    style.map { s =>
      Html(s"""<style>${s.colorTheme}</style>""")
    } getOrElse Html("")
  }
  def moareStyle(): Html = {
    style.map { s =>
      val moreCss = s.cssUrl
        .map(u => s"""<link rel="stylesheet" media="screen" href="${u}">""")
        .getOrElse("")

      val moreFontFamily = s.fontFamilyUrl
        .map(u => s"""<style>
             |@font-face{
             |font-family: "Custom";
             |src: url("$u")
             |}
             |</style>""".stripMargin)
        .getOrElse("")

      if (s.css.startsWith("http")) {
        Html(
          s"""<link rel="stylesheet" media="screen" href="${s.css}">\n$moreCss\n$moreFontFamily""")
      } else if (s.css.startsWith("/")) {
        Html(
          s"""<link rel="stylesheet" media="screen" href="${s.css}">\n$moreCss\n$moreFontFamily""")
      } else {
        Html(s"""<style>${s.css}</style>\n$moreCss\n$moreFontFamily""")
      }
    } getOrElse Html("")
  }
  def moareJs(): Html = {
    style.map { s =>
      val moreJs =
        s.jsUrl.map(u => s"""<script" src="${u}"></script>""").getOrElse("")
      if (s.js.startsWith("http")) {
        Html(s"""<script" src="${s.js}"></script>\n$moreJs""")
      } else if (s.js.startsWith("<script")) {
        Html(s"""${s.js}\n$moreJs""")
      } else {
        Html(s"""<script>${s.js}</script>\n$moreJs""")
      }
    } getOrElse Html("")
  }
  def favicon(): String = {
    style.flatMap(_.faviconUrl).getOrElse("/assets/images/favicon.png")
  }
}

object Tenant {
  val Default = TenantId("default")
}

object Team {
  val Default = TeamId("none")
}

sealed trait MailerSettings {
  def mailerType: String
  def mailer(implicit env: Env): Mailer
  def asJson: JsValue
  def template: Option[String]
}

case class ConsoleMailerSettings(template: Option[String] = None)
    extends MailerSettings
    with CanJson[ConsoleMailerSettings] {
  def mailerType: String = "console"
  def asJson: JsValue = json.ConsoleSettingsFormat.writes(this)
  def mailer(implicit env: Env): Mailer = {
    new ConsoleMailer(this)
  }
}

case class MailgunSettings(domain: String,
                           eu: Boolean = false,
                           key: String,
                           fromTitle: String,
                           fromEmail: String,
                           template: Option[String])
    extends MailerSettings
    with CanJson[MailgunSettings] {
  def mailerType: String = "mailgun"
  def asJson: JsValue = json.MailgunSettingsFormat.writes(this)
  def mailer(implicit env: Env): Mailer = {
    new MailgunSender(env.wsClient, this)
  }
}

case class MailjetSettings(apiKeyPublic: String,
                           apiKeyPrivate: String,
                           fromTitle: String,
                           fromEmail: String,
                           template: Option[String])
    extends MailerSettings
    with CanJson[MailjetSettings] {
  def mailerType: String = "mailjet"
  def asJson: JsValue = json.MailjetSettingsFormat.writes(this)
  def mailer(implicit env: Env): Mailer = {
    new MailjetSender(env.wsClient, this)
  }
}

case class SimpleSMTPSettings(host: String,
                              port: String = "25",
                              fromTitle: String,
                              fromEmail: String,
                              template: Option[String])
    extends MailerSettings
    with CanJson[SimpleSMTPSettings] {
  def mailerType: String = "smtpClient"
  def asJson: JsValue = json.SimpleSMTPClientSettingsFormat.writes(this)
  def mailer(implicit env: Env): Mailer = {
    new SimpleSMTPSender(this)
  }
}

case class SendgridSettings(apikey: String,
                            fromEmail: String,
                            template: Option[String])
    extends MailerSettings
    with CanJson[SendgridSettings] {
  def mailerType: String = "sendgrid"
  def asJson: JsValue = json.SendGridSettingsFormat.writes(this)
  def mailer(implicit env: Env): Mailer = {
    new SendgridSender(env.wsClient, this)
  }
}

// case class IdentitySettings(
//   identityThroughOtoroshi: Boolean,
//   stateHeaderName: String = "Otoroshi-State",
//   stateRespHeaderName: String = "Otoroshi-State-Resp",
//   claimHeaderName: String = "Otoroshi-Claim",
//   claimSecret: String = "secret",
// ) extends CanJson[OtoroshiSettings] {
//   def asJson: JsValue = json.IdentitySettingsFormat.writes(this)
// }

case class OtoroshiSettings(id: OtoroshiSettingsId,
                            url: String,
                            host: String,
                            clientId: String = "admin-api-apikey-id",
                            clientSecret: String = "admin-api-apikey-secret")
    extends CanJson[OtoroshiSettings] {
  def asJson: JsValue = json.OtoroshiSettingsFormat.writes(this)
  def toUiPayload(): JsValue = {
    Json.obj(
      "_id" -> id.value,
      "url" -> url,
      "host" -> host
    )
  }
}

case class ApiKeyRestrictionPath(method: String, path: String)
    extends CanJson[ApiKeyRestrictionPath] {
  def asJson: JsValue = json.ApiKeyRestrictionPathFormat.writes(this)
}

case class ApiKeyRestrictions(
    enabled: Boolean = false,
    allowLast: Boolean = true,
    allowed: Seq[ApiKeyRestrictionPath] = Seq.empty,
    forbidden: Seq[ApiKeyRestrictionPath] = Seq.empty,
    notFound: Seq[ApiKeyRestrictionPath] = Seq.empty,
) extends CanJson[ApiKeyRestrictions] {
  def asJson: JsValue = json.ApiKeyRestrictionsFormat.writes(this)
}

case class CustomMetadata(key: String, possibleValues: Set[String] = Set.empty)
    extends CanJson[CustomMetadata] {
  def asJson: JsValue = json.CustomMetadataFormat.writes(this)
}
case class ApikeyCustomization(
    dynamicPrefix: Option[String] = None,
    clientIdOnly: Boolean = false,
    readOnly: Boolean = false,
    constrainedServicesOnly: Boolean = false,
    metadata: JsObject = play.api.libs.json.Json.obj(),
    customMetadata: Seq[CustomMetadata] = Seq.empty,
    tags: JsArray = play.api.libs.json.Json.arr(),
    restrictions: ApiKeyRestrictions = ApiKeyRestrictions()
) extends CanJson[ApikeyCustomization] {
  def asJson: JsValue = json.ApikeyCustomizationFormat.writes(this)
}

object OtoroshiTarget {
  val expressionReplacer = ReplaceAllWith("\\$\\{([^}]*)\\}")
  val logger = play.api.Logger("OtoroshiTarget")

  def processValue(value: String, context: Map[String, String]): String = {
    value match {
      case v if v.contains("${") =>
        scala.util.Try {
          OtoroshiTarget.expressionReplacer.replaceOn(value) { expression =>
            context.get(expression).getOrElse("--")
          }
        } recover {
          case e =>
            OtoroshiTarget.logger.error(
              s"Error while parsing expression, returning raw value: $value",
              e)
            value
        } get
      case _ => value
    }
  }
}

case class OtoroshiTarget(
    otoroshiSettings: OtoroshiSettingsId,
    authorizedEntities: Option[AuthorizedEntities],
    apikeyCustomization: ApikeyCustomization = ApikeyCustomization()
) extends CanJson[OtoroshiTarget] {
  def asJson: JsValue = json.OtoroshiTargetFormat.writes(this)
  def processedMetadata(context: Map[String, String]): Map[String, String] = {
    apikeyCustomization.metadata
      .asOpt[Map[String, String]]
      .getOrElse(Map.empty[String, String])
      .view
      .mapValues(v => OtoroshiTarget.processValue(v, context))
      .toMap
  }
  def processedTags(context: Map[String, String]): Seq[String] = {
    apikeyCustomization.tags
      .asOpt[Seq[String]]
      .getOrElse(Seq.empty[String])
      .map(v => OtoroshiTarget.processValue(v, context))
  }
}

case class OtoroshiService(name: String,
                           otoroshiSettings: OtoroshiSettingsId,
                           service: OtoroshiServiceId)
    extends CanJson[OtoroshiService] {
  def asJson: JsValue = json.OtoroshiServiceFormat.writes(this)
}

sealed trait ValueType {
  def value: String
}
case class OtoroshiServiceId(value: String)
    extends ValueType
    with CanJson[OtoroshiServiceId] {
  def asJson: JsValue = JsString(value)
}
case class OtoroshiSettingsId(value: String)
    extends ValueType
    with CanJson[OtoroshiSettingsId] {
  def asJson: JsValue = JsString(value)
}
case class UsagePlanId(value: String)
    extends ValueType
    with CanJson[UsagePlanId] {
  def asJson: JsValue = JsString(value)
}
case class UserId(value: String) extends ValueType with CanJson[UserId] {
  def asJson: JsValue = JsString(value)
}
case class TeamId(value: String) extends ValueType with CanJson[TeamId] {
  def asJson: JsValue = JsString(value)
}
case class ApiId(value: String) extends ValueType with CanJson[ApiId] {
  def asJson: JsValue = JsString(value)
}
case class ApiSubscriptionId(value: String)
    extends ValueType
    with CanJson[ApiSubscriptionId] {
  def asJson: JsValue = JsString(value)
}
case class ApiDocumentationId(value: String)
    extends ValueType
    with CanJson[ApiDocumentationId] {
  def asJson: JsValue = JsString(value)
}
case class ApiDocumentationPageId(value: String)
    extends ValueType
    with CanJson[ApiDocumentationPageId] {
  def asJson: JsValue = JsString(value)
}
case class Version(value: String) extends ValueType with CanJson[Version] {
  def asJson: JsValue = JsString(value)
}
case class TenantId(value: String) extends ValueType with CanJson[TenantId] {
  def asJson: JsValue = JsString(value)
}
case class AssetId(value: String) extends ValueType with CanJson[AssetId] {
  def asJson: JsValue = JsString(value)
}
case class OtoroshiGroup(value: String)
    extends ValueType
    with CanJson[OtoroshiGroup] {
  def asJson: JsValue = JsString(value)
}
case class OtoroshiServiceGroupId(value: String)
    extends ValueType
    with CanJson[OtoroshiServiceGroupId] {
  def asJson: JsValue = JsString(value)
}
case class NotificationId(value: String)
    extends ValueType
    with CanJson[NotificationId] {
  def asJson: JsValue = JsString(value)
}
case class UserSessionId(value: String)
    extends ValueType
    with CanJson[UserSessionId] {
  def asJson: JsValue = JsString(value)
}
case class DatastoreId(value: String)
    extends ValueType
    with CanJson[DatastoreId] {
  def asJson: JsValue = JsString(value)
}
case class ChatId(value: String) extends ValueType with CanJson[ChatId] {
  def asJson: JsValue = JsString(value)
}
case class ApiPostId(value: String) extends ValueType with CanJson[ApiPostId] {
  def asJson: JsValue = JsString(value)
}
case class ApiIssueId(value: String)
    extends ValueType
    with CanJson[ApiIssueId] {
  def asJson: JsValue = JsString(value)
}
case class ApiIssueTagId(value: String)
    extends ValueType
    with CanJson[ApiIssueTagId] {
  def asJson: JsValue = JsString(value)
}

trait BillingTimeUnit extends CanJson[BillingTimeUnit] {
  def name: String
  def asJson: JsValue = JsString(name)
}

object BillingTimeUnit {
  case object Hour extends BillingTimeUnit {
    def name: String = "Hour"
  }
  case object Day extends BillingTimeUnit {
    def name: String = "Day"
  }
  case object Month extends BillingTimeUnit {
    def name: String = "Month"
  }
  case object Year extends BillingTimeUnit {
    def name: String = "Year"
  }
  val values: Seq[BillingTimeUnit] =
    Seq(Hour, Day, Month, Year)
  def apply(name: String): Option[BillingTimeUnit] = name.toLowerCase() match {
    case "hour"   => Hour.some
    case "hours"  => Hour.some
    case "day"    => Day.some
    case "days"   => Day.some
    case "month"  => Month.some
    case "months" => Month.some
    case "year"   => Year.some
    case "years"  => Year.some
    case _        => None
  }
}

case class BillingDuration(value: Long, unit: BillingTimeUnit)
    extends CanJson[BillingDuration] {
  def asJson: JsValue = json.BillingDurationFormat.writes(this)
}

sealed trait TeamType {
  def name: String
}

object TeamType {
  case object Personal extends TeamType {
    def name: String = "Personal"
  }
  case object Organization extends TeamType {
    def name: String = "Organization"
  }
  case object Admin extends TeamType {
    def name: String = "Admin"
  }
  val values: Seq[TeamType] =
    Seq(Personal, Organization, Admin)
  def apply(name: String): Option[TeamType] = name match {
    case "Organization" => Organization.some
    case "Personal"     => Personal.some
    case "Admin"        => Admin.some
    case _              => None
  }
}

sealed trait ApiVisibility {
  def name: String
}

object ApiVisibility {
  case object Public extends ApiVisibility {
    def name: String = "Public"
  }
  case object PublicWithAuthorizations extends ApiVisibility {
    def name: String = "PublicWithAuthorizations"
  }
  case object Private extends ApiVisibility {
    def name: String = "Private"
  }
  case object AdminOnly extends ApiVisibility {
    def name: String = "AdminOnly"
  }
  val values: Seq[ApiVisibility] =
    Seq(Public, Private, PublicWithAuthorizations)
  def apply(name: String): Option[ApiVisibility] = name match {
    case "Public"                   => Public.some
    case "Private"                  => Private.some
    case "PublicWithAuthorizations" => PublicWithAuthorizations.some
    case "AdminOnly"                => AdminOnly.some
    case _                          => None
  }
}

sealed trait UsagePlanVisibility {
  def name: String
}

object UsagePlanVisibility {
  case object Public extends UsagePlanVisibility {
    def name: String = "Public"
  }

  case object Private extends UsagePlanVisibility {
    def name: String = "Private"
  }
  val values: Seq[UsagePlanVisibility] =
    Seq(Public, Private)
  def apply(name: String): Option[UsagePlanVisibility] = name match {
    case "Public"  => Public.some
    case "Private" => Private.some
    case _         => None
  }
}

sealed trait SubscriptionProcess {
  def name: String
}

object SubscriptionProcess {
  case object Automatic extends SubscriptionProcess {
    def name: String = "Automatic"
  }
  case object Manual extends SubscriptionProcess {
    def name: String = "Manual"
  }
  val values: Seq[SubscriptionProcess] = Seq(Automatic, Manual)
  def apply(name: String): Option[SubscriptionProcess] = name match {
    case "Automatic" => Automatic.some
    case "Manual"    => Manual.some
    case _           => None
  }
}

sealed trait IntegrationProcess {
  def name: String
}

object IntegrationProcess {
  case object Automatic extends IntegrationProcess {
    def name: String = "Automatic"
  }
  case object ApiKey extends IntegrationProcess {
    def name: String = "ApiKey"
  }
  val values: Seq[IntegrationProcess] = Seq(Automatic, ApiKey)
  def apply(name: String): Option[IntegrationProcess] = name match {
    case "Automatic" => Automatic.some
    case "ApiKey"    => ApiKey.some
    case _           => None
  }
}

case class Currency(code: String) extends CanJson[Currency] {
  def asJson: JsValue = json.CurrencyFormat.writes(this)
}

sealed trait UsagePlan {
  def id: UsagePlanId
  def costPerMonth: BigDecimal
  def maxRequestPerSecond: Option[Long]
  def maxRequestPerDay: Option[Long]
  def maxRequestPerMonth: Option[Long]
  def allowMultipleKeys: Option[Boolean]
  def autoRotation: Option[Boolean]
  def costFor(requests: Long): BigDecimal
  def currency: Currency
  def customName: Option[String]
  def customDescription: Option[String]
  def otoroshiTarget: Option[OtoroshiTarget]
  def trialPeriod: Option[BillingDuration]
  def billingDuration: BillingDuration
  def typeName: String
  def visibility: UsagePlanVisibility
  def authorizedTeams: Seq[TeamId]
  def asJson: JsValue = UsagePlanFormat.writes(this)
  def addAutorizedTeam(teamId: TeamId): UsagePlan
  def addAutorizedTeams(teamIds: Seq[TeamId]): UsagePlan
  def removeAuthorizedTeam(teamId: TeamId): UsagePlan
  def removeAllAuthorizedTeams(): UsagePlan
  def subscriptionProcess: SubscriptionProcess
  def integrationProcess: IntegrationProcess
  def aggregationApiKeysSecurity: Option[Boolean]
}

case object UsagePlan {
  case class Admin(
      id: UsagePlanId,
      customName: Option[String] = Some("Administration plan"),
      customDescription: Option[String] = Some("access to admin api"),
      otoroshiTarget: Option[OtoroshiTarget],
      aggregationApiKeysSecurity: Option[Boolean] = Some(false),
      override val authorizedTeams: Seq[TeamId] = Seq.empty
  ) extends UsagePlan {
    override def costPerMonth: BigDecimal = BigDecimal(0)
    override def maxRequestPerSecond: Option[Long] = None
    override def maxRequestPerDay: Option[Long] = None
    override def maxRequestPerMonth: Option[Long] = None
    override def allowMultipleKeys: Option[Boolean] = Some(true)
    override def autoRotation: Option[Boolean] = Some(false)
    override def costFor(requests: Long): BigDecimal = BigDecimal(0)
    override def currency: Currency = Currency(code = "Eur")
    override def trialPeriod: Option[BillingDuration] = None
    override def billingDuration: BillingDuration =
      BillingDuration(1, BillingTimeUnit.Year)
    override def typeName: String = "Admin"
    override def visibility: UsagePlanVisibility = UsagePlanVisibility.Private
    override def addAutorizedTeam(teamId: TeamId): UsagePlan =
      this.copy(authorizedTeams = authorizedTeams :+ teamId)
    override def removeAuthorizedTeam(teamId: TeamId): UsagePlan =
      this.copy(authorizedTeams = authorizedTeams.filter(up => up != teamId))
    override def removeAllAuthorizedTeams(): UsagePlan =
      this.copy(authorizedTeams = Seq.empty)
    override def addAutorizedTeams(teamIds: Seq[TeamId]): UsagePlan =
      this.copy(authorizedTeams = teamIds)
    override def subscriptionProcess: SubscriptionProcess =
      SubscriptionProcess.Automatic
    override def integrationProcess: IntegrationProcess =
      IntegrationProcess.ApiKey
  }
  case class FreeWithoutQuotas(
      id: UsagePlanId,
      currency: Currency,
      billingDuration: BillingDuration,
      customName: Option[String],
      customDescription: Option[String],
      otoroshiTarget: Option[OtoroshiTarget],
      allowMultipleKeys: Option[Boolean],
      autoRotation: Option[Boolean],
      subscriptionProcess: SubscriptionProcess,
      integrationProcess: IntegrationProcess,
      aggregationApiKeysSecurity: Option[Boolean] = Some(false),
      override val visibility: UsagePlanVisibility = UsagePlanVisibility.Public,
      override val authorizedTeams: Seq[TeamId] = Seq.empty
  ) extends UsagePlan {
    override def typeName: String = "FreeWithoutQuotas"
    override def costPerMonth: BigDecimal = BigDecimal(0)
    override def maxRequestPerSecond: Option[Long] = None
    override def maxRequestPerDay: Option[Long] = None
    override def maxRequestPerMonth: Option[Long] = None
    override def costFor(requests: Long): BigDecimal = BigDecimal(0)
    override def trialPeriod: Option[BillingDuration] = None
    override def addAutorizedTeam(teamId: TeamId): UsagePlan =
      this.copy(authorizedTeams = authorizedTeams :+ teamId)
    override def removeAuthorizedTeam(teamId: TeamId): UsagePlan =
      this.copy(authorizedTeams = authorizedTeams.filter(up => up != teamId))
    override def removeAllAuthorizedTeams(): UsagePlan =
      this.copy(authorizedTeams = Seq.empty)
    override def addAutorizedTeams(teamIds: Seq[TeamId]): UsagePlan =
      this.copy(authorizedTeams = teamIds)
  }
  case class FreeWithQuotas(
      id: UsagePlanId,
      maxPerSecond: Long,
      maxPerDay: Long,
      maxPerMonth: Long,
      currency: Currency,
      billingDuration: BillingDuration,
      customName: Option[String],
      customDescription: Option[String],
      otoroshiTarget: Option[OtoroshiTarget],
      allowMultipleKeys: Option[Boolean],
      autoRotation: Option[Boolean],
      subscriptionProcess: SubscriptionProcess,
      integrationProcess: IntegrationProcess,
      aggregationApiKeysSecurity: Option[Boolean] = Some(false),
      override val visibility: UsagePlanVisibility = UsagePlanVisibility.Public,
      override val authorizedTeams: Seq[TeamId] = Seq.empty
  ) extends UsagePlan {
    override def typeName: String = "FreeWithQuotas"
    override def costPerMonth: BigDecimal = BigDecimal(0)
    override def maxRequestPerSecond: Option[Long] = maxPerSecond.some
    override def maxRequestPerDay: Option[Long] = maxPerDay.some
    override def maxRequestPerMonth: Option[Long] = maxPerMonth.some
    override def costFor(requests: Long): BigDecimal = BigDecimal(0)
    override def trialPeriod: Option[BillingDuration] = None
    override def addAutorizedTeam(teamId: TeamId): UsagePlan =
      this.copy(authorizedTeams = authorizedTeams :+ teamId)
    override def removeAuthorizedTeam(teamId: TeamId): UsagePlan =
      this.copy(authorizedTeams = authorizedTeams.filter(up => up != teamId))
    override def removeAllAuthorizedTeams(): UsagePlan =
      this.copy(authorizedTeams = Seq.empty)
    override def addAutorizedTeams(teamIds: Seq[TeamId]): UsagePlan =
      this.copy(authorizedTeams = teamIds)
  }
  case class QuotasWithLimits(
      id: UsagePlanId,
      maxPerSecond: Long,
      maxPerDay: Long,
      maxPerMonth: Long,
      costPerMonth: BigDecimal,
      trialPeriod: Option[BillingDuration],
      currency: Currency,
      billingDuration: BillingDuration,
      customName: Option[String],
      customDescription: Option[String],
      otoroshiTarget: Option[OtoroshiTarget],
      allowMultipleKeys: Option[Boolean],
      autoRotation: Option[Boolean],
      subscriptionProcess: SubscriptionProcess,
      integrationProcess: IntegrationProcess,
      aggregationApiKeysSecurity: Option[Boolean] = Some(false),
      override val visibility: UsagePlanVisibility = UsagePlanVisibility.Public,
      override val authorizedTeams: Seq[TeamId] = Seq.empty
  ) extends UsagePlan {
    override def typeName: String = "QuotasWithLimits"
    override def maxRequestPerSecond: Option[Long] = maxPerSecond.some
    override def maxRequestPerDay: Option[Long] = maxPerDay.some
    override def maxRequestPerMonth: Option[Long] = maxPerMonth.some
    override def costFor(requests: Long): BigDecimal = costPerMonth
    override def addAutorizedTeam(teamId: TeamId): UsagePlan =
      this.copy(authorizedTeams = authorizedTeams :+ teamId)
    override def removeAuthorizedTeam(teamId: TeamId): UsagePlan =
      this.copy(authorizedTeams = authorizedTeams.filter(up => up != teamId))
    override def removeAllAuthorizedTeams(): UsagePlan =
      this.copy(authorizedTeams = Seq.empty)
    override def addAutorizedTeams(teamIds: Seq[TeamId]): UsagePlan =
      this.copy(authorizedTeams = teamIds)
  }
  case class QuotasWithoutLimits(
      id: UsagePlanId,
      maxPerSecond: Long,
      maxPerDay: Long,
      maxPerMonth: Long,
      costPerAdditionalRequest: BigDecimal,
      costPerMonth: BigDecimal,
      trialPeriod: Option[BillingDuration],
      currency: Currency,
      billingDuration: BillingDuration,
      customName: Option[String],
      customDescription: Option[String],
      otoroshiTarget: Option[OtoroshiTarget],
      allowMultipleKeys: Option[Boolean],
      autoRotation: Option[Boolean],
      subscriptionProcess: SubscriptionProcess,
      integrationProcess: IntegrationProcess,
      aggregationApiKeysSecurity: Option[Boolean] = Some(false),
      override val visibility: UsagePlanVisibility = UsagePlanVisibility.Public,
      override val authorizedTeams: Seq[TeamId] = Seq.empty
  ) extends UsagePlan {
    override def typeName: String = "QuotasWithoutLimits"
    override def maxRequestPerSecond: Option[Long] = maxPerSecond.some
    override def maxRequestPerDay: Option[Long] = maxPerDay.some
    override def maxRequestPerMonth: Option[Long] = maxPerMonth.some
    override def costFor(requests: Long): BigDecimal =
      costPerMonth + (Math.max(requests - maxPerMonth, 0) * costPerAdditionalRequest)
    override def addAutorizedTeam(teamId: TeamId): UsagePlan =
      this.copy(authorizedTeams = authorizedTeams :+ teamId)
    override def removeAuthorizedTeam(teamId: TeamId): UsagePlan =
      this.copy(authorizedTeams = authorizedTeams.filter(up => up != teamId))
    override def removeAllAuthorizedTeams(): UsagePlan =
      this.copy(authorizedTeams = Seq.empty)
    override def addAutorizedTeams(teamIds: Seq[TeamId]): UsagePlan =
      this.copy(authorizedTeams = teamIds)
  }
  case class PayPerUse(
      id: UsagePlanId,
      costPerMonth: BigDecimal,
      costPerRequest: BigDecimal,
      trialPeriod: Option[BillingDuration],
      currency: Currency,
      billingDuration: BillingDuration,
      customName: Option[String],
      customDescription: Option[String],
      otoroshiTarget: Option[OtoroshiTarget],
      allowMultipleKeys: Option[Boolean],
      autoRotation: Option[Boolean],
      subscriptionProcess: SubscriptionProcess,
      integrationProcess: IntegrationProcess,
      aggregationApiKeysSecurity: Option[Boolean] = Some(false),
      override val visibility: UsagePlanVisibility = UsagePlanVisibility.Public,
      override val authorizedTeams: Seq[TeamId] = Seq.empty
  ) extends UsagePlan {
    override def typeName: String = "PayPerUse"
    override def costFor(requests: Long): BigDecimal =
      costPerMonth + (requests * costPerRequest)
    override def maxRequestPerMonth: Option[Long] = None
    override def maxRequestPerSecond: Option[Long] = None
    override def maxRequestPerDay: Option[Long] = None
    override def addAutorizedTeam(teamId: TeamId): UsagePlan =
      this.copy(authorizedTeams = authorizedTeams :+ teamId)
    override def removeAuthorizedTeam(teamId: TeamId): UsagePlan =
      this.copy(authorizedTeams = authorizedTeams.filter(up => up != teamId))
    override def removeAllAuthorizedTeams(): UsagePlan =
      this.copy(authorizedTeams = Seq.empty)
    override def addAutorizedTeams(teamIds: Seq[TeamId]): UsagePlan =
      this.copy(authorizedTeams = teamIds)
  }
}

case class OtoroshiApiKey(
    clientName: String,
    clientId: String,
    clientSecret: String
) extends CanJson[OtoroshiApiKey] {
  override def asJson: JsValue = json.OtoroshiApiKeyFormat.writes(this)
}

case class SwaggerAccess(url: String,
                         content: Option[String] = None,
                         headers: Map[String, String] =
                           Map.empty[String, String]) {
  def swaggerContent()(implicit ec: ExecutionContext,
                       env: Env): Future[JsValue] = {
    content match {
      case Some(c) => FastFuture.successful(Json.parse(c))
      case None => {
        val finalUrl =
          if (url.startsWith("/")) s"http://127.0.0.1:${env.config.port}${url}"
          else url
        env.wsClient
          .url(finalUrl)
          .withHttpHeaders(headers.toSeq: _*)
          .get()
          .map { resp =>
            Json.parse(resp.body)
          }
      }
    }
  }
}

case class ApiDocumentation(id: ApiDocumentationId,
                            tenant: TenantId,
                            pages: Seq[ApiDocumentationPageId],
                            lastModificationAt: DateTime)
    extends CanJson[ApiDocumentation] {
  override def asJson: JsValue = json.ApiDocumentationFormat.writes(this)
  def fetchPages(tenant: Tenant)(implicit ec: ExecutionContext, env: Env) = {
    env.dataStore.apiDocumentationPageRepo
      .forTenant(tenant.id)
      .findWithProjection(
        Json.obj(
          "_deleted" -> false,
          "_id" -> Json.obj(
            "$in" -> JsArray(pages.map(_.value).map(JsString.apply).toSeq))),
        Json.obj(
          "_id" -> true,
          "_humanReadableId" -> true,
          "title" -> true,
          "level" -> true,
          "lastModificationAt" -> true,
          "content" -> true,
          "contentType" -> true
        )
      )
      .map { list =>
        // TODO: fetch remote content
        pages
          .map(id => list.find(o => (o \ "_id").as[String] == id.value))
          .collect { case Some(e) => e }
      }
  }
}

// "https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf"
case class ApiDocumentationPage(id: ApiDocumentationPageId,
                                tenant: TenantId,
                                deleted: Boolean = false,
                                // api: ApiId,
                                title: String,
                                //index: Double,
                                level: Int = 0,
                                lastModificationAt: DateTime,
                                content: String,
                                contentType: String = "text/markdown",
                                remoteContentEnabled: Boolean = false,
                                remoteContentUrl: Option[String] = None,
                                remoteContentHeaders: Map[String, String] =
                                  Map.empty[String, String])
    extends CanJson[ApiDocumentationPage] {
  //def humanReadableId = s"$index-$level-${title.urlPathSegmentSanitized}"
  def humanReadableId = s"$level-${title.urlPathSegmentSanitized}"
  override def asJson: JsValue = json.ApiDocumentationPageFormat.writes(this)
  def asWebUiJson: JsValue =
    json.ApiDocumentationPageFormat.writes(this).as[JsObject]
}

case class ApiPost(id: ApiPostId,
                   tenant: TenantId,
                   deleted: Boolean = false,
                   title: String,
                   lastModificationAt: DateTime,
                   content: String)
    extends CanJson[ApiPost] {
  def humanReadableId: String = title.urlPathSegmentSanitized
  override def asJson: JsValue = json.ApiPostFormat.writes(this)
}

case class TwoFactorAuthentication(enabled: Boolean = false,
                                   secret: String,
                                   token: String,
                                   backupCodes: String)
    extends CanJson[TwoFactorAuthentication] {
  override def asJson: JsValue = json.TwoFactorAuthenticationFormat.writes(this)
}

case class ApiIssueTag(id: ApiIssueTagId, name: String, color: String)

case class ApiIssueComment(by: UserId,
                           createdAt: DateTime,
                           lastModificationAt: DateTime,
                           content: String)

case class ApiIssue(id: ApiIssueId,
                    seqId: Int,
                    tenant: TenantId,
                    deleted: Boolean = false,
                    title: String,
                    tags: Set[ApiIssueTagId],
                    open: Boolean,
                    createdAt: DateTime,
                    closedAt: Option[DateTime],
                    by: UserId,
                    comments: Seq[ApiIssueComment],
                    lastModificationAt: DateTime,
                    apiVersion: Option[String] = Some("1.0.0"))
    extends CanJson[ApiIssue] {
  def humanReadableId: String = seqId.toString
  override def asJson: JsValue = json.ApiIssueFormat.writes(this)
}

case class UserInvitation(registered: Boolean,
                          token: String,
                          createdAt: DateTime,
                          team: String,
                          notificationId: String)
    extends CanJson[UserInvitation] {
  override def asJson: JsValue = json.UserInvitationFormat.writes(this)
}

object User {
  val DEFAULT_IMAGE = "/assets/images/anonymous.jpg"
}

case class User(
    id: UserId,
    deleted: Boolean = false,
    tenants: Set[TenantId],
    origins: Set[AuthProvider],
    name: String,
    email: String,
    picture: String = User.DEFAULT_IMAGE,
    pictureFromProvider: Boolean = true,
    personalToken: Option[String],
    isDaikokuAdmin: Boolean = false,
    password: Option[String] = None,
    hardwareKeyRegistrations: Seq[JsObject] = Seq.empty,
    lastTenant: Option[TenantId],
    metadata: Map[String, String] = Map.empty,
    defaultLanguage: Option[String],
    isGuest: Boolean = false,
    starredApis: Set[ApiId] = Set.empty[ApiId],
    twoFactorAuthentication: Option[TwoFactorAuthentication] = None,
    invitation: Option[UserInvitation] = None
) extends CanJson[User] {
  override def asJson: JsValue = json.UserFormat.writes(this)
  def humanReadableId = email.urlPathSegmentSanitized
  def asSimpleJson: JsValue = {
    Json.obj(
      "_id" -> id.value,
      "_humanReadableId" -> email.urlPathSegmentSanitized,
      "name" -> name,
      "email" -> email,
      "picture" -> picture,
      "isDaikokuAdmin" -> isDaikokuAdmin,
      "starredApis" -> starredApis.map(_.value),
      "twoFactorAuthentication" -> twoFactorAuthentication
        .map(_.asJson)
        .getOrElse(JsNull)
        .as[JsValue]
    )
  }
  def toUiPayload(): JsValue = {
    Json.obj(
      "_id" -> id.value,
      "_humanReadableId" -> email.urlPathSegmentSanitized,
      "name" -> name,
      "email" -> email,
      "picture" -> picture,
      "isDaikokuAdmin" -> isDaikokuAdmin,
      "defaultLanguage" -> defaultLanguage.fold(JsNull.as[JsValue])(
        JsString.apply),
      "isGuest" -> isGuest,
      "starredApis" -> starredApis.map(_.value),
      "twoFactorAuthentication" -> twoFactorAuthentication
        .map(_.asJson)
        .getOrElse(JsNull)
        .as[JsValue]
    )
  }
}

object GuestUser {
  def apply(tenantId: TenantId): User = User(
    id = UserId("anonymous"),
    tenants = Set(tenantId),
    origins = Set.empty,
    name = "anonymous",
    email = "",
    lastTenant = None,
    defaultLanguage = None,
    personalToken = None,
    isGuest = true
  )
}

object GuestUserSession {
  def apply(user: User, tenant: Tenant): UserSession = {
    val sessionMaxAge =
      tenant.authProviderSettings.\("sessionMaxAge").asOpt[Int].getOrElse(86400)
    UserSession(
      id = DatastoreId(BSONObjectID.generate().stringify),
      userId = user.id,
      userName = user.name,
      userEmail = user.email,
      impersonatorId = None,
      impersonatorName = None,
      impersonatorEmail = None,
      impersonatorSessionId = None,
      sessionId = UserSessionId(IdGenerator.token),
      created = DateTime.now(),
      expires = DateTime.now().plusSeconds(sessionMaxAge),
      ttl = FiniteDuration(sessionMaxAge, TimeUnit.SECONDS)
    )
  }
}

sealed trait TeamPermission {
  def name: String
}

object TeamPermission {
  case object Administrator extends TeamPermission {
    def name: String = "Administrator"
  }
  case object ApiEditor extends TeamPermission {
    def name: String = "ApiEditor"
  }
  case object TeamUser extends TeamPermission {
    def name: String = "User"
  }
  val values: Seq[TeamPermission] =
    Seq(Administrator, ApiEditor, TeamUser)
  def apply(name: String): Option[TeamPermission] = name match {
    case "Administrator" => Administrator.some
    case "ApiEditor"     => ApiEditor.some
    case "User"          => TeamUser.some
    case _               => None
  }
}

case class UserWithPermission(
    userId: UserId,
    teamPermission: TeamPermission
) extends CanJson[UserWithPermission] {
  override def asJson: JsValue = json.UserWithPermissionFormat.writes(this)
}

sealed trait TeamApiKeyVisibility extends CanJson[TeamApiKeyVisibility] {
  def name: String
  def asJson: JsValue = JsString(name)
}

object TeamApiKeyVisibility {
  case object Administrator extends TeamApiKeyVisibility {
    def name: String = "Administrator"
  }
  case object ApiEditor extends TeamApiKeyVisibility {
    def name: String = "ApiEditor"
  }
  case object User extends TeamApiKeyVisibility {
    def name: String = "User"
  }
  val values: Seq[TeamApiKeyVisibility] =
    Seq(Administrator, ApiEditor, User)
  def apply(name: String): Option[TeamApiKeyVisibility] =
    name.toLowerCase() match {
      case "administrator" => Administrator.some
      case "apieditor"     => ApiEditor.some
      case "user"          => User.some
      case _               => None
    }
}

case class Team(
    id: TeamId,
    tenant: TenantId,
    deleted: Boolean = false,
    `type`: TeamType,
    name: String,
    description: String,
    contact: String = "contact@foo.bar",
    avatar: Option[String] = Some("/assets/images/daikoku.svg"),
    users: Set[UserWithPermission] = Set.empty,
    subscriptions: Seq[ApiSubscriptionId] = Seq.empty,
    authorizedOtoroshiGroups: Set[OtoroshiGroup] = Set.empty,
    apiKeyVisibility: Option[TeamApiKeyVisibility] = Some(
      TeamApiKeyVisibility.User),
    metadata: Map[String, String] = Map.empty,
    apisCreationPermission: Option[Boolean] = None,
) extends CanJson[User] {
  override def asJson: JsValue = json.TeamFormat.writes(this)
  def humanReadableId = name.urlPathSegmentSanitized
  def asSimpleJson(implicit env: Env): JsValue = toUiPayload()
  def toUiPayload()(implicit env: Env): JsValue = {
    Json.obj(
      "_id" -> id.value,
      "_humanReadableId" -> humanReadableId,
      "_tenant" -> json.TenantIdFormat.writes(tenant),
      "tenant" -> json.TenantIdFormat.writes(tenant),
      "type" -> json.TeamTypeFormat.writes(`type`),
      "name" -> name,
      "description" -> description,
      "avatar" -> JsString(avatar.getOrElse("/assets/images/daikoku.svg")),
      "contact" -> contact,
      "users" -> json.SetUserWithPermissionFormat.writes(users),
      "apiKeyVisibility" -> apiKeyVisibility
        .getOrElse(env.config.defaultApiKeyVisibility)
        .asJson,
      "apisCreationPermission" -> apisCreationPermission
        .map(JsBoolean)
        .getOrElse(JsNull)
        .as[JsValue]
    )
  }
  def includeUser(userId: UserId): Boolean = {
    users.exists(_.userId == userId)
  }
  def admins(): Set[UserId] =
    users.filter(u => u.teamPermission == Administrator).map(_.userId)
}

sealed trait TestingAuth {
  def name: String
}

object TestingAuth {
  case object ApiKey extends TestingAuth {
    def name: String = "ApiKey"
  }
  case object Basic extends TestingAuth {
    def name: String = "Basic"
  }
}

case class TestingConfig(
    otoroshiSettings: OtoroshiSettingsId,
    authorizedEntities: AuthorizedEntities,
    clientName: String,
    api: ApiId,
    tag: String,
    customMetadata: Option[JsObject],
    customMaxPerSecond: Option[Long],
    customMaxPerDay: Option[Long],
    customMaxPerMonth: Option[Long],
    customReadOnly: Option[Boolean]
) extends CanJson[TestingConfig] {
  override def asJson: JsValue = json.TestingConfigFormat.writes(this)
}

case class Testing(
    enabled: Boolean = false,
    auth: TestingAuth = TestingAuth.Basic,
    name: Option[String] = None,
    username: Option[String] = None,
    password: Option[String] = None,
    config: Option[TestingConfig] = None,
) extends CanJson[Testing] {
  override def asJson: JsValue = json.TestingFormat.writes(this)
}

case class Api(
    id: ApiId,
    tenant: TenantId,
    deleted: Boolean = false,
    team: TeamId,
    name: String,
    smallDescription: String,
    header: Option[String] = None,
    image: Option[String] = None,
    description: String,
    currentVersion: Version = Version("1.0.0"),
    supportedVersions: Set[Version] = Set(Version("1.0.0")),
    isDefault: Boolean = false,
    lastUpdate: DateTime,
    published: Boolean = false,
    testing: Testing = Testing(),
    documentation: ApiDocumentation,
    swagger: Option[SwaggerAccess] = Some(
      SwaggerAccess(url = "/assets/swaggers/petstore.json")),
    tags: Set[String] = Set.empty,
    categories: Set[String] = Set.empty,
    visibility: ApiVisibility,
    possibleUsagePlans: Seq[UsagePlan],
    defaultUsagePlan: UsagePlanId,
    authorizedTeams: Seq[TeamId] = Seq.empty,
    posts: Seq[ApiPostId] = Seq.empty,
    issues: Seq[ApiIssueId] = Seq.empty,
    issuesTags: Set[ApiIssueTag] = Set.empty,
    stars: Int = 0,
    parent: Option[ApiId] = None
) extends CanJson[User] {
  def humanReadableId = name.urlPathSegmentSanitized
  override def asJson: JsValue = json.ApiFormat.writes(this)
  def asSimpleJson: JsValue = Json.obj(
    "_id" -> id.asJson,
    "_humanReadableId" -> name.urlPathSegmentSanitized,
    "_tenant" -> tenant.asJson,
    "team" -> team.value,
    "name" -> name,
    "smallDescription" -> smallDescription,
    "header" -> header.map(JsString).getOrElse(JsNull).as[JsValue],
    "image" -> image.map(JsString).getOrElse(JsNull).as[JsValue],
    "description" -> description,
    "currentVersion" -> currentVersion.asJson,
    "supportedVersions" -> JsArray(supportedVersions.map(_.asJson).toSeq),
    "tags" -> JsArray(tags.map(JsString.apply).toSeq),
    "categories" -> JsArray(categories.map(JsString.apply).toSeq),
    "visibility" -> visibility.name,
    "possibleUsagePlans" -> JsArray(possibleUsagePlans.map(_.asJson).toSeq),
    "posts" -> SeqPostIdFormat.writes(posts),
    "issues" -> SeqIssueIdFormat.writes(issues),
    "issuesTags" -> SetApiTagFormat.writes(issuesTags),
    "stars" -> stars,
    "parent" -> parent.map(_.asJson).getOrElse(JsNull).as[JsValue],
    "isDefault" -> isDefault
  )
  def asIntegrationJson(teams: Seq[Team]): JsValue = {
    val t = teams.find(_.id == team).get.name.urlPathSegmentSanitized
    Json.obj(
      "id" -> s"${t}/${name.urlPathSegmentSanitized}",
      "team" -> t,
      "name" -> name,
      "smallDescription" -> smallDescription,
      "currentVersion" -> currentVersion.asJson,
      "supportedVersions" -> JsArray(supportedVersions.map(_.asJson).toSeq),
      "tags" -> JsArray(tags.map(JsString.apply).toSeq),
      "categories" -> JsArray(categories.map(JsString.apply).toSeq),
      "visibility" -> visibility.name,
      "stars" -> stars
    )
  }
  def asPublicWithAuthorizationsJson(): JsValue = Json.obj(
    "_id" -> id.value,
    "_humanReadableId" -> name.urlPathSegmentSanitized,
    "tenant" -> tenant.asJson,
    "team" -> team.value,
    "name" -> name,
    "smallDescription" -> smallDescription,
    "description" -> description,
    "currentVersion" -> currentVersion.asJson,
    "isDefault" -> isDefault,
    "published" -> published,
    "tags" -> JsArray(tags.map(JsString.apply).toSeq),
    "categories" -> JsArray(categories.map(JsString.apply).toSeq),
    "authorizedTeams" -> SeqTeamIdFormat.writes(authorizedTeams),
    "stars" -> stars,
    "parent" -> parent.map(_.asJson).getOrElse(JsNull).as[JsValue]
  )
}

case class ApiKeyRotation(
    enabled: Boolean = true,
    rotationEvery: Long = 31 * 24,
    gracePeriod: Long = 7 * 24,
    nextSecret: Option[String] = None
)

case class ApiSubscriptionRotation(
    enabled: Boolean = true,
    rotationEvery: Long = 31 * 24,
    gracePeriod: Long = 7 * 24,
    pendingRotation: Boolean = false
)

case class ApiSubscription(
    id: ApiSubscriptionId,
    tenant: TenantId,
    deleted: Boolean = false,
    apiKey: OtoroshiApiKey, // TODO: add the actual plan at the time of the subscription
    plan: UsagePlanId,
    createdAt: DateTime,
    team: TeamId,
    api: ApiId,
    by: UserId,
    customName: Option[String],
    enabled: Boolean = true,
    rotation: Option[ApiSubscriptionRotation],
    integrationToken: String,
    customMetadata: Option[JsObject] = None,
    customMaxPerSecond: Option[Long] = None,
    customMaxPerDay: Option[Long] = None,
    customMaxPerMonth: Option[Long] = None,
    customReadOnly: Option[Boolean] = None,
    parent: Option[ApiSubscriptionId] = None
) extends CanJson[ApiSubscription] {
  override def asJson: JsValue = json.ApiSubscriptionFormat.writes(this)
  def asAuthorizedJson(permission: TeamPermission,
                       planIntegration: IntegrationProcess,
                       isDaikokuAdmin: Boolean): JsValue =
    (permission, planIntegration) match {
      case (_, _) if isDaikokuAdmin => json.ApiSubscriptionFormat.writes(this)
      case (Administrator, _)       => json.ApiSubscriptionFormat.writes(this)
      case (_, IntegrationProcess.ApiKey) =>
        json.ApiSubscriptionFormat.writes(this)
      case (_, IntegrationProcess.Automatic) =>
        json.ApiSubscriptionFormat.writes(this).as[JsObject] - "apiKey"
    }
  def asSafeJson: JsValue =
    json.ApiSubscriptionFormat
      .writes(this)
      .as[JsObject] - "apiKey" - "integrationToken" ++ Json.obj(
      "apiKey" -> Json.obj("clientName" -> apiKey.clientName))
  def asSimpleJson: JsValue = Json.obj(
    "_id" -> json.ApiSubscriptionIdFormat.writes(id),
    "_tenant" -> json.TenantIdFormat.writes(tenant),
    "_deleted" -> deleted,
    "plan" -> json.UsagePlanIdFormat.writes(plan),
    "team" -> json.TeamIdFormat.writes(team),
    "api" -> json.ApiIdFormat.writes(api),
    "createdAt" -> json.DateTimeFormat.writes(createdAt),
    "customName" -> customName
      .map(id => JsString(id))
      .getOrElse(JsNull)
      .as[JsValue],
    "enabled" -> JsBoolean(enabled)
  )
}

object RemainingQuotas {
  val MaxValue: Long = 10000000L
}

case class AuthorizedEntities(services: Set[OtoroshiServiceId] = Set.empty,
                              groups: Set[OtoroshiServiceGroupId] = Set.empty)
    extends CanJson[AuthorizedEntities] {
  def asJson: JsValue = json.AuthorizedEntitiesFormat.writes(this)
  def asOtoroshiJson: JsValue =
    json.AuthorizedEntitiesOtoroshiFormat.writes(this)
  def isEmpty: Boolean = services.isEmpty && groups.isEmpty
  def equalsAuthorizedEntities(a: AuthorizedEntities): Boolean =
    services.forall(s => a.services.contains(s)) && groups.forall(g =>
      a.groups.contains(g))
}

case class ActualOtoroshiApiKey(
    clientId: String = IdGenerator.token(16),
    clientSecret: String = IdGenerator.token(64),
    clientName: String,
    authorizedEntities: AuthorizedEntities,
    enabled: Boolean = true,
    allowClientIdOnly: Boolean = false,
    readOnly: Boolean = false,
    constrainedServicesOnly: Boolean = false,
    throttlingQuota: Long = RemainingQuotas.MaxValue,
    dailyQuota: Long = RemainingQuotas.MaxValue,
    monthlyQuota: Long = RemainingQuotas.MaxValue,
    tags: Seq[String] = Seq.empty[String],
    metadata: Map[String, String] = Map.empty[String, String],
    restrictions: ApiKeyRestrictions = ApiKeyRestrictions(),
    rotation: Option[ApiKeyRotation])
    extends CanJson[OtoroshiApiKey] {
  override def asJson: JsValue = json.ActualOtoroshiApiKeyFormat.writes(this)
}

sealed trait NotificationStatus

object NotificationStatus {
  case class Pending() extends NotificationStatus with Product with Serializable
  case class Accepted(date: DateTime = DateTime.now())
      extends NotificationStatus
      with Product
      with Serializable
  case class Rejected(date: DateTime = DateTime.now())
      extends NotificationStatus
      with Product
      with Serializable
}

sealed trait NotificationAction
sealed trait OtoroshiSyncNotificationAction extends NotificationAction {
  def message: String
  def json: JsValue
}

object NotificationAction {
  case class ApiAccess(api: ApiId, team: TeamId) extends NotificationAction

  case class TeamAccess(team: TeamId) extends NotificationAction

  case class TeamInvitation(team: TeamId, user: UserId)
      extends NotificationAction

  case class ApiSubscriptionDemand(
      api: ApiId,
      plan: UsagePlanId,
      team: TeamId,
      parentSubscriptionId: Option[ApiSubscriptionId] = None)
      extends NotificationAction

  case class OtoroshiSyncSubscriptionError(subscription: ApiSubscription,
                                           message: String)
      extends OtoroshiSyncNotificationAction {
    def json: JsValue =
      Json.obj("errType" -> "OtoroshiSyncSubscriptionError",
               "errMessage" -> message,
               "subscription" -> subscription.asJson)
  }
  case class OtoroshiSyncApiError(api: Api, message: String)
      extends OtoroshiSyncNotificationAction {
    def json: JsValue =
      Json.obj("errType" -> "OtoroshiSyncApiError",
               "errMessage" -> message,
               "api" -> api.asJson)
  }
  case class ApiKeyDeletionInformation(api: String, clientId: String)
      extends NotificationAction

  case class ApiKeyRotationInProgress(clientId: String,
                                      api: String,
                                      plan: String)
      extends NotificationAction

  case class ApiKeyRotationEnded(clientId: String, api: String, plan: String)
      extends NotificationAction

  case class ApiKeyRefresh(subscription: String, api: String, plan: String)
      extends NotificationAction

  case class NewPostPublished(teamId: String, apiName: String)
      extends NotificationAction

  case class NewIssueOpen(teamId: String, apiName: String, linkTo: String)
      extends NotificationAction

  case class NewCommentOnIssue(teamId: String, apiName: String, linkTo: String)
      extends NotificationAction
}

sealed trait NotificationType {
  def value: String
}

object NotificationType {
  case object AcceptOrReject extends NotificationType {
    override def value: String = "AcceptOrReject"
  }
  case object AcceptOnly extends NotificationType {
    override def value: String = "AcceptOnly"
  }
}

case class Notification(
    id: NotificationId,
    tenant: TenantId,
    deleted: Boolean = false,
    team: Option[TeamId],
    sender: User,
    date: DateTime = DateTime.now(),
    notificationType: NotificationType = NotificationType.AcceptOrReject,
    status: NotificationStatus = Pending(),
    action: NotificationAction
) extends CanJson[Notification] {
  override def asJson: JsValue = json.NotificationFormat.writes(this)
}

case class UserSession(id: DatastoreId,
                       sessionId: UserSessionId,
                       userId: UserId,
                       userName: String,
                       userEmail: String,
                       impersonatorId: Option[UserId],
                       impersonatorName: Option[String],
                       impersonatorEmail: Option[String],
                       impersonatorSessionId: Option[UserSessionId],
                       created: DateTime,
                       ttl: FiniteDuration,
                       expires: DateTime)
    extends CanJson[UserSession] {
  override def asJson: JsValue = json.UserSessionFormat.writes(this)
  def invalidate()(implicit ec: ExecutionContext, env: Env): Future[Unit] = {
    env.dataStore.userSessionRepo.deleteById(id).map(_ => ())
  }
  def asSimpleJson: JsValue = Json.obj(
    "created" -> created.toDate.getTime,
    "expires" -> expires.toDate.getTime,
    "ttl" -> ttl.toMillis,
  )
  def impersonatorJson(): JsValue = {
    impersonatorId.map { _ =>
      Json.obj(
        "_id" -> impersonatorId.get.value,
        "name" -> impersonatorName.get,
        "email" -> impersonatorEmail.get
      )
    } getOrElse {
      JsNull
    }
  }
}

case class ApiKeyConsumption(
    id: DatastoreId,
    tenant: TenantId,
    team: TeamId,
    api: ApiId,
    plan: UsagePlanId,
    clientId: String,
    hits: Long,
    globalInformations: ApiKeyGlobalConsumptionInformations,
    quotas: ApiKeyQuotas,
    billing: ApiKeyBilling,
    from: DateTime,
    to: DateTime)
    extends CanJson[ApiKeyConsumption] {
  override def asJson: JsValue = json.ConsumptionFormat.writes(this)
}

case class ApiKeyGlobalConsumptionInformations(hits: Long,
                                               dataIn: Long,
                                               dataOut: Long,
                                               avgDuration: Option[Double],
                                               avgOverhead: Option[Double])
    extends CanJson[ApiKeyGlobalConsumptionInformations] {
  override def asJson: JsValue =
    json.GlobalConsumptionInformationsFormat.writes(this)
}

case class ApiKeyQuotas(authorizedCallsPerSec: Long,
                        currentCallsPerSec: Long,
                        remainingCallsPerSec: Long,
                        authorizedCallsPerDay: Long,
                        currentCallsPerDay: Long,
                        remainingCallsPerDay: Long,
                        authorizedCallsPerMonth: Long,
                        currentCallsPerMonth: Long,
                        remainingCallsPerMonth: Long)
    extends CanJson[ApiKeyQuotas] {
  override def asJson: JsValue = json.ApiKeyQuotasFormat.writes(this)
}

case class ApiKeyBilling(hits: Long, total: BigDecimal)
    extends CanJson[ApiKeyBilling] {
  override def asJson: JsValue = json.ApiKeyBillingFormat.writes(this)
}

case class PasswordReset(
    id: DatastoreId,
    deleted: Boolean = false,
    randomId: String,
    email: String,
    password: String,
    user: UserId,
    creationDate: DateTime,
    validUntil: DateTime,
) extends CanJson[PasswordReset] {
  override def asJson: JsValue = json.PasswordResetFormat.writes(this)
}

case class AccountCreation(
    id: DatastoreId,
    deleted: Boolean = false,
    randomId: String,
    email: String,
    name: String,
    avatar: String,
    password: String,
    creationDate: DateTime,
    validUntil: DateTime,
) extends CanJson[AccountCreation] {
  override def asJson: JsValue = json.AccountCreationFormat.writes(this)
}

case class Translation(id: DatastoreId,
                       tenant: TenantId,
                       language: String,
                       key: String,
                       value: String,
                       lastModificationAt: Option[DateTime] = None)
    extends CanJson[Translation] {
  override def asJson: JsValue = json.TranslationFormat.writes(this)
  def asUiTranslationJson: JsValue = {
    Json.obj(
      key -> value,
    )
  }
}

case class Evolution(id: DatastoreId,
                     version: String,
                     applied: Boolean,
                     date: DateTime = new DateTime())
    extends CanJson[Evolution] {
  override def asJson: JsValue = json.EvolutionFormat.writes(this)
}

sealed trait MessageType {
  def value: ValueType
}
object MessageType {
  case class Tenant(value: TenantId) extends MessageType
}

case class Message(id: DatastoreId,
                   tenant: TenantId,
                   messageType: MessageType,
                   participants: Set[UserId],
                   readBy: Set[UserId],
                   chat: UserId,
                   date: DateTime,
                   sender: UserId,
                   message: String,
                   closed: Option[DateTime] = None,
                   send: Boolean = false)
    extends CanJson[Message] {
  override def asJson: JsValue = json.MessageFormat.writes(this)
}

case class CmsPageId(value: String) extends ValueType with CanJson[CmsPageId] {
  def asJson: JsValue = JsString(value)
}

object CmsPage {
  val pageRenderingEc = ExecutionContext.fromExecutor(Executors.newWorkStealingPool(Runtime.getRuntime.availableProcessors() + 1))
}

case class CmsPage(
  id: CmsPageId,
  tenant: TenantId,
  deleted: Boolean = false,
  visible: Boolean,
  authenticated: Boolean,
  name: String,
  picture: Option[String] = None,
  forwardRef: Option[CmsPageId],
  tags: List[String],
  metadata: Map[String, String],
  contentType: String,
  body: String,
  draft: Option[String] = None,
  path: String
) extends CanJson[CmsPage] {

  /*
    tested with
    {
      "_id": "03013ab7-18cf-4b7e-bcc3-6d1ab6ea315c",
      "body": "<h1>Hello {{user.email}} - {{tenant.name}} !</h1><br/><a href=\"{{daikoku-asset-url \"fifou\"}}\">foo</a><br/><ul>{{#daikoku-apis}}<li>{{name}}</li>{{/daikoku-apis}}</ul><br/>{{#daikoku-api \"admin-api-tenant-default\"}}first api: {{name}}{{/daikoku-api}}",
      "name": "fifou page",
      "path": "/fifou",
      "tags": [],
      "_tenant": "default",
      "picture": null,
      "visible": true,
      "_deleted": false,
      "metadata": {},
      "contentType": "text/html",
      "authenticated": false
    }
   */

  override def asJson: JsValue = json.CmsPageFormat.writes(this)

  def enrichHandlebarsWithEntity[A](handlebars: Handlebars, env: Env, tenant: Tenant, name: String, getRepo: Env => TenantCapableRepo[A, _], makeBean: A => AnyRef)(implicit ec: ExecutionContext): Handlebars = {
    val repo: TenantCapableRepo[A, _] = getRepo(env)
    handlebars.registerHelper(s"daikoku-${name}s", (_: CmsPage, options: Options) => {
      val apis = Await.result(repo.forTenant(tenant).findAllNotDeleted(), 10.seconds)
      apis.map(api => makeBean(api)).map(api => options.fn.apply(Context.newBuilder(api).combine(name, api).build())).mkString("\n")
    })
    handlebars.registerHelper(s"daikoku-${name}", (id: String, options: Options) => {
      Await.result(repo.forTenant(tenant).findByIdNotDeleted(id), 10.seconds) match {
        case None => ""
        case Some(api) => options.fn.apply(Context.newBuilder(makeBean(api)).combine(name, api).build())
      }
    })
  }

  def render(ctx: DaikokuActionMaybeWithoutUserContext[_], additionalContext: Option[Map[String, String]] = None)(implicit env: Env): Future[(String, String)] = {
    (forwardRef match {
      case Some(id) => env.dataStore.cmsRepo.forTenant(ctx.tenant).findByIdNotDeleted(id)(env.defaultExecutionContext).map(_.getOrElse(this))(env.defaultExecutionContext)
      case None => FastFuture.successful(this)
    }).flatMap { page =>
      try {
        import com.github.jknack.handlebars.EscapingStrategy
        import scala.jdk.CollectionConverters._
        implicit val ec = CmsPage.pageRenderingEc

        val wantDraft = ctx.request.getQueryString("draft").contains("true")
        val template = if (wantDraft) page.draft.getOrElse(page.body) else page.body

        val staticContext = Context
          .newBuilder(this)
          .combine("tenant", new JavaBeanTenant(ctx.tenant))
          .combine("admin", ctx.isTenantAdmin)
          .combine("connected", ctx.user.isDefined)
          .combine("user", ctx.user.map(u => new JavaBeanUser(u)).orNull)
          .combine("request", new JavaBeanRequest(ctx.request))

        val context = (additionalContext match {
          case Some(value) => value.foldLeft(staticContext) { (acc, item) => acc.combine(item._1, item._2) }
          case None => staticContext
        }).build()

        val handlebars = new Handlebars().`with`(
          new EscapingStrategy() {
            override def escape(value: CharSequence): String = value.toString
          })
        handlebars.registerHelper("daikoku-asset-url", (context: String, _: Options) => s"/tenant-assets/${context}")
        handlebars.registerHelper("daikoku-page-url", (id: String, _: Options) => {
          Await.result(env.dataStore.cmsRepo.forTenant(ctx.tenant).findByIdNotDeleted(id), 10.seconds) match {
            case None => "#not-found"
            case Some(page) => s"/_${page.path}"
          }
        })

        val links = Map(
          "login" -> s"/auth/${ctx.tenant.authProvider.name}/login",
          "logout" -> "/logout",
          "language" -> ctx.user.map(_.defaultLanguage).getOrElse(ctx.tenant.defaultLanguage.getOrElse("en")),
          "signup" -> (if(ctx.tenant.authProvider.name == "Local") "/signup" else s"/auth/${ctx.tenant.authProvider.name}/login"),
          "backoffice" -> "/apis",
          "notifications" -> "/notifications"
        )
        links.map { case (name, link) => handlebars.registerHelper(s"daikoku-links-$name", (_: Object, _: Options) => link) }

        handlebars.registerHelper("daikoku-generic-page-url", (id: String, _: Options) => s"/cms/pages/$id")
        handlebars.registerHelper("daikoku-page-preview-url", (id: String, _: Options) => s"/cms/pages/$id?draft=true")
        handlebars.registerHelper("daikoku-include-block", (id: String, _: Options) => {
          Await.result(env.dataStore.cmsRepo.forTenant(ctx.tenant).findByIdNotDeleted(id), 10.seconds) match {
            case None => Await.result(env.dataStore.cmsRepo.forTenant(ctx.tenant).findOneNotDeleted(Json.obj("path" -> id)), 10.seconds) match {
              case None => s"block '$id' not found"
              case Some(page) => Await.result(page.render(ctx).map(t => t._1), 10.seconds)
            }
            case Some(page) => Await.result(page.render(ctx).map(t => t._1), 10.seconds)
          }
        })
        handlebars.registerHelper(s"daikoku-template-wrapper", (id: String, options: Options) => {
          Await.result(env.dataStore.cmsRepo.forTenant(ctx.tenant).findByIdNotDeleted(id), 10.seconds) match {
            case None => "page not found"
            case Some(page) =>
              val attrs = options.hash.asScala.map { case (k, v) => (k, v.toString) }
              Await.result(page.render(ctx, Some(
                Map("children" -> options.fn.apply(ctx)) ++ attrs)).map(t => t._1), 10.seconds)
          }
        })
        enrichHandlebarsWithEntity(handlebars, env, ctx.tenant, "api", _.dataStore.apiRepo, (api: Api) => new JavaBeanApi(api))
        enrichHandlebarsWithEntity(handlebars, env, ctx.tenant, "team", _.dataStore.teamRepo, (team: Team) => new JavaBeanTeam(team))

        val result = handlebars.compileInline(template).apply(context)
        context.destroy()
        FastFuture.successful((result, page.contentType))
      } catch {
        case t: Throwable =>
          t.printStackTrace()
          FastFuture.successful((s"""
          <!DOCTYPE html>
          <html>
            <body>
             <h1 style="text-align: center">Server error</h1>
             <div>
              <pre><code style="white-space: pre-line;font-size: 18px">${t.getMessage}</code></pre>
             <div>
           </body>
          </html>
          """, "text/html"))
      }
    }(env.defaultExecutionContext)
  }
}

class JavaBeanApi(api: Api) {
  def getName(): String = api.name
  def getId(): String = api.id.value
}

class JavaBeanTeam(team: Team) {
  def getName(): String = team.name
  def getId(): String = team.id.value
}

class JavaBeanUser(user: User) {
  def getName(): String = user.name
  def getEmail(): String = user.email
}

class JavaBeanRequest(req: Request[_]) {

  import scala.jdk.CollectionConverters._

  def getPath(): String = req.path
  def getMethod(): String = req.method
  def getHeaders(): java.util.Map[String, String] = req.headers.toSimpleMap.asJava
}

class JavaBeanTenant(tenant: Tenant) {
  def getName(): String = tenant.name
}