package fr.maif.otoroshi.daikoku.domain

import cats.implicits.catsSyntaxOptionId
import com.github.jknack.handlebars.{Context, Handlebars, Options}
import controllers.AppError.toJson
import controllers.{AppError, Assets}
import domain.JsonNodeValueResolver
import fr.maif.otoroshi.daikoku.actions.{
  DaikokuActionContext,
  DaikokuActionMaybeWithoutUserContext
}
import fr.maif.otoroshi.daikoku.audit.config.{ElasticAnalyticsConfig, Webhook}
import fr.maif.otoroshi.daikoku.audit.{AuditTrailEvent, KafkaConfig}
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async.{
  _TeamMemberOnly,
  _UberPublicUserAccess
}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.login.AuthProvider
import fr.maif.otoroshi.daikoku.utils.StringImplicits.BetterString
import fr.maif.otoroshi.daikoku.utils._
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.joda.time.DateTime
import play.api.i18n.MessagesApi
import play.api.libs.json._
import play.api.mvc.Request
import services.CmsPage
import storage.TenantCapableRepo

import java.util
import java.util.concurrent.Executors
import scala.concurrent.duration.DurationInt
import scala.concurrent.{Await, ExecutionContext, Future}

object Tenant {
  val Default: TenantId = TenantId("default")
  val jsCmsPageId = "tenant-js"
  val cssCmsPageId = "tenant-css"
  val colorThemePageId = "tenant-color-theme"
  val colorTheme: String = s""":root {
  --error-color: #dc3545;
  --info-color: #17a2b8;
  --success-color: #65B741;
  --warning-color: #ffc107;
  --danger-color: #dc3545;

  --body_bg-color: #f1f3f6;
  --body_text-color: #8a8a8a;
  --body_link-color: #4c4c4d;
  --body_link-hover-color: orange;

  --level2_bg-color: #e5e7ea;
  --level2_text-color: #4c4c4d;
  --level2_link-color: #605c5c;
  --level2_link-hover-color: #000;


  --level3_bg-color: #fff;
  --level3_text-color: #222;
  --level3_link-color: #4c4c4d;
  --level3_link-hover-color: #000;
  --level3_link-hover-bg-color: grey;

  --sidebar-bg-color: #e5e7ea;
  --sidebar-text-color: #4c4c4d;
  --sidebar-text-hover-color: orange;

  --menu-bg-color: #fff;
  --menu-text-color: #aaa;
  --menu-text-hover-bg-color: #444;
  --menu-text-hover-color: #fff;
  --menu-link-color: #666;


  --card_header-bg-color: #404040;
  --card_header-text-color: #fff;
  --card_bg-color: #282828;
  --card_text-color: #fff;
  --card_link-color: #97b0c7;
  --card_link-hover-color : #a9cbea;

  --btn-bg-color: #fff;
  --btn-text-color: #495057;
  --btn-border-color: #97b0c7;

  --badge-tags-bg-color: #ffc107;
  --badge-tags-bg-hover-color: #ffe1a7;
  --badge-tags-text-color: #212529;

  --form-text-color: #000;
  --form-border-color: #586069;
  --form-bg-color: #fff;

  --form-select-focused-color: lightgrey;
  --form-select-focused-text-color: white;
  --form-select-heading-color: yellow;
  --form-select-hover-color: lightgrey;
  --form-select-hover-text-color: white;
}


:root[data-theme="DARK"] {
  --error-color: #dc3545;
  --info-color: #17a2b8;
  --success-color: #65B741;
  --warning-color: #ffc107;
  --danger-color: #dc3545;

  --body_bg-color: #000;
  --body_text-color: #b3b3b3;
  --body_link-color: #b3b3b3;
  --body_link-hover-color: orange;

  --level2_bg-color: #121212;
  --level2_text-color: #b3b3b3;
  --level2_link-color: #9f9e9e;
  --level2_link-hover-color: #fff;

  --level3_bg-color: #242424;
  --level3_text-color: #e8e8e8;
  --level3_link-color: #9f9e9e;
  --level3_link-hover-color: #fff;
  --level3_link-hover-bg-color: grey;

  --sidebar-bg-color: #121212;
  --sidebar-text-color: #b3b3b3;
  --sidebar-text-hover-color: orange;

  --menu-bg-color: #242424;
  --menu-text-color: #fff;
  --menu-text-hover-bg-color: #121212;
  --menu-text-hover-color: #fff;
  --menu-link-color: #b3b3b3;

  --card_header-bg-color: #404040;
  --card_header-text-color: #fff;
  --card_bg-color: #282828;
  --card_text-color: #fff;
  --card_link-color: #97b0c7;
  --card_link-hover-color : #a9cbea;


  --btn-bg-color: #fff;
  --btn-text-color: #495057;
  --btn-border-color: #97b0c7;

  --badge-tags-bg-color: #ffc107;
  --badge-tags-bg-hover-color: #ffe1a7;
  --badge-tags-text-color: #212529;

  --form-text-color: #000;
  --form-border-color: #586069;
  --form-bg-color: #fff;

  --form-select-focused-color: grey;
  --form-select-focused-text-color: white;
  --form-select-heading-color: yellow;
  --form-select-hover-color: grey;
  --form-select-hover-text-color: white;
}"""

  def getCustomizationCmsPage(
      tenantId: TenantId,
      pageId: String,
      contentType: String,
      body: String
  ) = CmsPage(
      id = CmsPageId(s"${tenantId.value}-$pageId"),
      tenant = tenantId,
      visible = true,
      authenticated = false,
      name = pageId,
      forwardRef = None,
      tags = List(),
      metadata = Map(),
      contentType = contentType,
      body = body,
      path = s"/customization/$pageId.${if (contentType.contains("css")) "css"
      else "javascript"}".some
    )

}

object DaikokuStyle {
  def template(tenantId: TenantId) =
    DaikokuStyle(
      jsCmsPage = s"${tenantId.value}-script",
      cssCmsPage = s"${tenantId.value}-style",
      colorThemeCmsPage = s"${tenantId.value}-color-theme"
    )
}

/**
  * Entity representing the UI style of the tenant
  *
  * @param js Javascript code injected in each page
  * @param css CSS code injected in each page
  * @param colorTheme CSS code to customize colors of the current tenant
  */
case class DaikokuStyle(
    jsCmsPage: String,
    cssCmsPage: String,
    colorThemeCmsPage: String,
    jsUrl: Option[String] = None,
    cssUrl: Option[String] = None,
    faviconUrl: Option[String] = None,
    fontFamilyUrl: Option[String] = None,
    title: String = "New Organization",
    description: String = "A new organization to host very fine APIs",
    unloggedHome: String = "",
    homePageVisible: Boolean = false,
    homeCmsPage: Option[String] = None,
    notFoundCmsPage: Option[String] = None,
    authenticatedCmsPage: Option[String] = None,
    logo: String = "/assets/images/daikoku.svg",
    footer: Option[String] = None
) extends CanJson[DaikokuStyle] {
  override def asJson: JsValue = {
    json.DaikokuStyleFormat.writes(this)
  }
}
sealed trait ItemType {
  def name: String
}
object ItemType {
  case object User extends ItemType {
    def name: String = "User"
  }
  case object Team extends ItemType {
    def name: String = "Team"
  }
  case object Api extends ItemType {
    def name: String = "Api"
  }
  case object Subscription extends ItemType {
    def name: String = "Subscription"
  }
  case object ApiKeyConsumption extends ItemType {
    def name: String = "ApiKeyConsumption"
  }
  case object ThirdPartySubscription extends ItemType {
    def name: String = "ThirdPartySubscription"
  }
  case object ThirdPartyProduct extends ItemType {
    def name: String = "ThirdPartyProduct"
  }
  val values: Seq[ItemType] =
    Seq(User, Team, Api, Subscription)
  def apply(name: String): Option[ItemType] =
    name match {
      case "User"                   => User.some
      case "Team"                   => Team.some
      case "Api"                    => Api.some
      case "Subscription"           => Subscription.some
      case "ApiKeyConsumption"      => ApiKeyConsumption.some
      case "ThirdPartySubscription" => ThirdPartySubscription.some
      case "ThirdPartyProduct"      => ThirdPartyProduct.some
      case _                        => None
    }
}

sealed trait OperationAction {
  def name: String
}

object OperationAction {
  case object Delete extends OperationAction {
    def name: String = "DELETE"
  }

  case object Sync extends OperationAction {
    def name: String = "SYNC"
  }

  val values: Seq[OperationAction] = Seq(Delete, Sync)

  def apply(name: String): Option[OperationAction] =
    name match {
      case "DELETE" => Delete.some
      case "SYNC"   => Sync.some
      case _        => None
    }
}

sealed trait OperationStatus {
  def name: String
}

object OperationStatus {
  case object Idle extends OperationStatus {
    def name: String = "IDLE"
  }
  case object InProgress extends OperationStatus {
    def name: String = "IN_PROGRESS"
  }
  case object Success extends OperationStatus {
    def name: String = "SUCCESS"
  }
  case object Error extends OperationStatus {
    def name: String = "ERROR"
  }

  def values: Seq[OperationStatus] =
    Seq(Idle, InProgress, Success, Error)

  def apply(name: String): Option[OperationStatus] =
    name match {
      case "IDLE"        => Idle.some
      case "IN_PROGRESS" => InProgress.some
      case "SUCCESS"     => Success.some
      case "ERROR"       => Error.some
      case _             => None
    }
}
case class Operation(
    id: DatastoreId,
    tenant: TenantId,
    itemId: String,
    itemType: ItemType,
    action: OperationAction,
    payload: Option[JsObject] = None,
    status: OperationStatus = OperationStatus.Idle
) extends CanJson[Operation] {
  override def asJson: JsValue = json.OperationFormat.writes(this)
}

case class AuditTrailConfig(
    elasticConfigs: Option[ElasticAnalyticsConfig] = None,
    auditWebhooks: Seq[Webhook] = Seq.empty[Webhook],
    alertsEmails: Seq[String] = Seq.empty[String],
    kafkaConfig: Option[KafkaConfig] = None
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
  def apply(name: String): Option[TenantMode] =
    name.toLowerCase() match {
      case "maintenance"  => Some(Maintenance)
      case "construction" => Some(Construction)
      case "default"      => Some(Default)
      case "translation"  => Some(Translation)
      case _              => Some(Default)
    }
}
sealed trait TenantDisplay {
  def name: String
}

object TenantDisplay {
  case object Environment extends TenantDisplay {
    def name: String = "environment"
  }
  case object Default extends TenantDisplay {
    def name: String = "default"
  }
  def apply(name: String): TenantDisplay =
    name.toLowerCase() match {
      case "environment" => Environment
      case _             => Default
    }
}

sealed trait ThirdPartyPaymentSettings {
  def id: ThirdPartyPaymentSettingsId

  def typeName: String

  def name: String

  def asJson: JsValue = json.ThirdPartyPaymentSettingsFormat.writes(this)
}

case object ThirdPartyPaymentSettings {
  case class StripeSettings(
      id: ThirdPartyPaymentSettingsId,
      name: String,
      publicKey: String,
      secretKey: String
  ) extends ThirdPartyPaymentSettings {
    override def typeName: String = "Stripe"
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
    defaultMessage: Option[String] = None,
    tenantMode: Option[TenantMode] = None,
    aggregationApiKeysSecurity: Option[Boolean] = None,
    environmentAggregationApiKeysSecurity: Option[Boolean] = None,
    robotTxt: Option[String] = None,
    thirdPartyPaymentSettings: Seq[ThirdPartyPaymentSettings] = Seq.empty,
    display: TenantDisplay = TenantDisplay.Default,
    environments: Set[String] = Set.empty
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
      "defaultLanguage" -> defaultLanguage
        .fold(JsNull.as[JsValue])(JsString.apply),
      "homePageVisible" -> style.exists(_.homePageVisible),
      "homeCmsPage" -> style
        .flatMap(_.homeCmsPage)
        .map(JsString)
        .getOrElse(JsNull)
        .as[JsValue],
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
        .as[JsValue],
      "environmentAggregationApiKeysSecurity" -> environmentAggregationApiKeysSecurity
        .map(JsBoolean)
        .getOrElse(JsBoolean(false))
        .as[JsValue],
      "display" -> display.name,
      "environments" -> JsArray(environments.map(JsString.apply).toSeq),
      "loginProvider" -> authProvider.name,
      "cssUrl" -> style
        .flatMap(_.cssUrl)
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "jsUrl" -> style
        .flatMap(_.jsUrl)
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "faviconUrl" -> favicon(),
      "fontFamilyUrl" -> style
        .flatMap(_.fontFamilyUrl)
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue]
    )
  }
  def favicon(): String = {
    style.flatMap(_.faviconUrl).getOrElse("/assets/images/daikoku.svg")
  }
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

case class MailgunSettings(
    domain: String,
    eu: Boolean = false,
    key: String,
    fromTitle: String,
    fromEmail: String,
    template: Option[String]
) extends MailerSettings
    with CanJson[MailgunSettings] {
  def mailerType: String = "mailgun"
  def asJson: JsValue = json.MailgunSettingsFormat.writes(this)
  def mailer(implicit env: Env): Mailer = {
    new MailgunSender(env.wsClient, this)
  }
}

case class MailjetSettings(
    apiKeyPublic: String,
    apiKeyPrivate: String,
    fromTitle: String,
    fromEmail: String,
    template: Option[String]
) extends MailerSettings
    with CanJson[MailjetSettings] {
  def mailerType: String = "mailjet"
  def asJson: JsValue = json.MailjetSettingsFormat.writes(this)
  def mailer(implicit env: Env): Mailer = {
    new MailjetSender(env.wsClient, this)
  }
}

case class SimpleSMTPSettings(
    host: String,
    port: String = "25",
    fromTitle: String,
    fromEmail: String,
    template: Option[String]
) extends MailerSettings
    with CanJson[SimpleSMTPSettings] {
  def mailerType: String = "smtpClient"
  def asJson: JsValue = json.SimpleSMTPClientSettingsFormat.writes(this)
  def mailer(implicit env: Env): Mailer = {
    new SimpleSMTPSender(this)
  }
}

case class SendgridSettings(
    apikey: String,
    fromTitle: String,
    fromEmail: String,
    template: Option[String]
) extends MailerSettings
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

case class OtoroshiSettings(
    id: OtoroshiSettingsId,
    url: String,
    host: String,
    clientId: String = "admin-api-apikey-id",
    clientSecret: String = "admin-api-apikey-secret",
    elasticConfig: Option[ElasticAnalyticsConfig] = None
) extends CanJson[OtoroshiSettings] {
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
    notFound: Seq[ApiKeyRestrictionPath] = Seq.empty
) extends CanJson[ApiKeyRestrictions] {
  def asJson: JsValue = json.ApiKeyRestrictionsFormat.writes(this)
}

case class Asset(id: AssetId, tenant: TenantId, slug: String)
    extends CanJson[Asset] {
  override def asJson: JsValue = json.AssetFormat.writes(this)
}
