package fr.maif.daikoku.domain

import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.audit.KafkaConfig
import fr.maif.daikoku.audit.{ElasticAnalyticsConfig, Webhook}
import fr.maif.daikoku.domain.json.SeqValidationStepFormat
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.login.AuthProvider
import fr.maif.daikoku.utils.StringImplicits.BetterString
import fr.maif.daikoku.utils.*
import org.joda.time.DateTime
import play.api.libs.json.*
import fr.maif.daikoku.services.CmsPage

import scala.concurrent.duration.FiniteDuration

object Tenant {
  val Default: TenantId = TenantId("default")

  def getCustomizationCmsPage(
      tenantId: TenantId,
      pageId: String,
      contentType: String,
      body: String
  ) =
    CmsPage(
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
      path = s"/customization/$pageId.${
          if (contentType.contains("css")) "css"
          else "js"
        }".some
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

/** Entity representing the UI style of the tenant
  *
  * @param js
  *   Javascript code injected in each page
  * @param css
  *   CSS code injected in each page
  * @param colorTheme
  *   CSS code to customize colors of the current tenant
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
    logo: Option[String] = None,
    logoMin: Option[String] = None,
    logoDark: Option[String] = None,
    logoMinDark: Option[String] = None
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
  case object UsagePlan extends ItemType {
    def name: String = "UsagePlan"
  }
  case object Keyring extends ItemType {
    def name: String = "Keyring"
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
      case "UsagePlan"              => UsagePlan.some
      case "Keyring"                => Keyring.some
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

enum KeyringQuotaConflictStrategy(val value: String):
  case LowestValue extends KeyringQuotaConflictStrategy("LowestValue")
  case HighestValue extends KeyringQuotaConflictStrategy("HighestValue")

object KeyringQuotaConflictStrategy {
  def fromValue(v: String): Option[KeyringQuotaConflictStrategy] =
    KeyringQuotaConflictStrategy.values.find(_.value == v)
}

sealed trait ThirdPartyPaymentSettings {
  def id: ThirdPartyPaymentSettingsId

  def typeName: String

  def name: String

  def asJson: JsValue = json.ThirdPartyPaymentSettingsFormat.writes(this)

  def toUiPayload: JsValue
}

case object ThirdPartyPaymentSettings {
  case class StripeSettings(
      id: ThirdPartyPaymentSettingsId,
      name: String,
      publicKey: String,
      secretKey: String
  ) extends ThirdPartyPaymentSettings {
    override def typeName: String = "Stripe"

    override def toUiPayload: JsValue =
      json.StripeSettingsFormat.writes(this).as[JsObject] ++ Json.obj(
        "type" -> "Stripe"
      ) - "publicKey" - "privateKey"
  }
}

case class Tenant(
    id: TenantId,
    enabled: Boolean = true,
    name: String,
    domain: String,
    additionalDomains: Set[String] = Set.empty,
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
    teamCreationSecurity: Option[Boolean] = None,
    subscriptionSecurity: Option[Boolean] = None,
    apiReferenceHideForGuest: Option[Boolean] = Some(true),
    defaultMessage: Option[String] = None,
    tenantMode: Option[TenantMode] = None,
    aggregationApiKeysSecurity: Option[Boolean] = None,
    environmentAggregationApiKeysSecurity: Option[Boolean] = None,
    keyringQuotaConflictStrategy: KeyringQuotaConflictStrategy =
      KeyringQuotaConflictStrategy.LowestValue,
    robotTxt: Option[String] = None,
    thirdPartyPaymentSettings: Seq[ThirdPartyPaymentSettings] = Seq.empty,
    display: TenantDisplay = TenantDisplay.Default,
    environments: Set[String] = Set.empty,
    clientNamePattern: Option[String] = None,
    accountCreationProcess: Seq[ValidationStep] = Seq.empty,
    defaultAuthorizedOtoroshiEntities: Option[Seq[TeamAuthorizedEntities]] =
      None
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
      "logo" -> style
        .flatMap(a => a.logo)
        .filter(_.trim.nonEmpty)
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "logoMin" -> style
        .flatMap(a => a.logoMin)
        .filter(_.trim.nonEmpty)
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "logoDark" -> style
        .flatMap(a => a.logoDark)
        .filter(_.trim.nonEmpty)
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "logoMinDark" -> style
        .flatMap(a => a.logoMinDark)
        .filter(_.trim.nonEmpty)
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "mode" -> env.config.mode.name,
      "authProvider" -> authProvider.name,
      "defaultLanguage" -> defaultLanguage
        .fold(JsNull.as[JsValue])(JsString.apply),
      "homePageVisible" -> style.exists(_.homePageVisible),
      "homeCmsPage" -> style
        .flatMap(_.homeCmsPage)
        .map(JsString.apply)
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
        .as[JsValue],
      "otoroshiSettings" -> JsArray(
        otoroshiSettings.map(_.toUiPayload()).toSeq
      ),
      "thirdPartyPaymentSettings" -> JsArray(
        thirdPartyPaymentSettings.map(_.toUiPayload)
      ),
      "accountCreationProcess" -> SeqValidationStepFormat.writes(
        accountCreationProcess
      ),
      "isPrivate" -> isPrivate,
      "teamCreationSecurity" -> teamCreationSecurity
        .map(JsBoolean)
        .getOrElse(JsBoolean(false))
        .as[JsValue]
    )
  }
  def favicon(): String = {
    style.flatMap(_.faviconUrl).getOrElse("/assets/images/daikoku.svg")
  }
  def allDomains: Set[String] = additionalDomains + domain
  def hostFor(candidate: Option[String]): String =
    candidate.filter(allDomains.contains).getOrElse(domain)
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
    template: Option[String],
    testingEmail: Option[String] = None
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
enum GrantType(val name: String) {
  case ClientCredential extends GrantType("client-credential")
  case RefreshToken extends GrantType("refresh-token")
}
case class SMTPOauth2Settings(
    host: String,
    port: Int = 25,
    username: String,
    fromTitle: String,
    fromEmail: String,
    template: Option[String],
    clientId: String,
    clientSecret: String,
    scope: String,
    tokenUrl: String,
    starttls: Option[Boolean] = None,
    ssl: Option[Boolean] = None,
    grantType: GrantType = GrantType.ClientCredential
) extends MailerSettings
    with CanJson[SMTPOauth2Settings] {

  override def mailerType: String = "smtpOAuthClient"

  override def mailer(implicit env: Env): Mailer = new SMTPOauth2Sender(this)

  override def asJson: JsValue = json.SMTPOauth2SettingsFormat.writes(this)
}
case class SimpleSMTPSettings(
    host: String,
    port: String = "25",
    fromTitle: String,
    fromEmail: String,
    template: Option[String],
    username: Option[String],
    password: Option[String],
    starttls: Option[Boolean] = None,
    ssl: Option[Boolean] = None
) extends MailerSettings
    with CanJson[SimpleSMTPSettings] {
  def mailerType: String = "smtpClient"
  def asJson: JsValue = json.SimpleSMTPClientSettingsFormat.writes(this)
  def mailer(implicit env: Env): Mailer = {
    new SimpleSMTPSender(this)
  }

  // Effective TLS settings: explicit value wins, otherwise deduced from the port
  // (587 => STARTTLS, 465 => implicit SSL/TLS).
  def useStartTls: Boolean = starttls.getOrElse(port == "587")
  def useSsl: Boolean = ssl.getOrElse(port == "465")
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

enum OtoroshiEntityKind(val value: String):
  case Api extends OtoroshiEntityKind("api")
  case Group extends OtoroshiEntityKind("group")
  case Route extends OtoroshiEntityKind("route")

object OtoroshiEntityKind {
  def fromValue(v: String): Option[OtoroshiEntityKind] =
    OtoroshiEntityKind.values.find(_.value == v)
}

case class OtoroshiEntity(kind: OtoroshiEntityKind, id: String)
    extends CanJson[OtoroshiEntity] {
  def asJson: JsValue = json.OtoroshiEntityFormat.writes(this)
}

case class ApiKeyRestrictionPath(
    method: String,
    path: String,
    authorizedEntity: Option[OtoroshiEntity] = None
) extends CanJson[ApiKeyRestrictionPath] {
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

  /** Scope every restriction line to the given Otoroshi entities: each line is
    * duplicated once per entity, with its `authorizedEntity` set. This keeps a
    * plan's restrictions confined to that plan's entities once several
    * subscriptions share a single keyring api key. When no entity is scopable,
    * the lines are left untouched.
    */
  def scopedTo(entities: Seq[OtoroshiEntity]): ApiKeyRestrictions = {
    def scope(
        paths: Seq[ApiKeyRestrictionPath]
    ): Seq[ApiKeyRestrictionPath] =
      if (entities.isEmpty) paths
      else
        paths.flatMap(p =>
          entities.map(e => p.copy(authorizedEntity = Some(e)))
        )

    copy(
      allowed = scope(allowed),
      forbidden = scope(forbidden),
      notFound = scope(notFound)
    )
  }
}

case class Asset(id: AssetId, tenant: TenantId, slug: String)
    extends CanJson[Asset] {
  override def asJson: JsValue = json.AssetFormat.writes(this)
}

enum SchedulingMode(val value: String):
  case Interval extends SchedulingMode("interval")
  case Cron extends SchedulingMode("cron")

object SchedulingMode {
  def fromValue(v: String): Option[SchedulingMode] =
    SchedulingMode.values.find(_.value == v)
}

case class RemoteCatalogScheduling(
    enabled: Boolean = false
)

case class RemoteCatalogSource(
    kind: String = "http",
    config: JsObject = Json.obj()
)

case class RemoteCatalog(
    id: RemoteCatalogId,
    tenant: TenantId,
    name: String,
    enabled: Boolean = true,
    source: RemoteCatalogSource = RemoteCatalogSource(),
    scheduling: RemoteCatalogScheduling = RemoteCatalogScheduling(),
    allowedKinds: Set[String] = Set.empty,
    maxDeletionPercent: Int = 30,
    adoptExisting: Boolean = false,
    folderPerTeam: Boolean = false,
    allowDeletions: Boolean = true,
    token: String = IdGenerator.token(64)
) extends CanJson[RemoteCatalog] {
  def asJson: JsValue = json.RemoteCatalogFormat.writes(this)
}

enum RemoteCatalogRunStatus(val value: String):
  case Completed extends RemoteCatalogRunStatus("completed")
  case Partial extends RemoteCatalogRunStatus("partial")
  case Failed extends RemoteCatalogRunStatus("failed")

object RemoteCatalogRunStatus {
  def fromValue(v: String): Option[RemoteCatalogRunStatus] =
    RemoteCatalogRunStatus.values.find(_.value == v)
}

case class RemoteCatalogRunEntity(
    kind: String,
    id: String,
    name: Option[String],
    changes: Option[JsArray] = None
)

case class RemoteCatalogError(
    source: String,
    message: String,
    entity: Option[RemoteCatalogRunEntity] = None
)

object RemoteCatalogError {

  def collect[A](
      results: Seq[Either[Seq[RemoteCatalogError], Seq[A]]]
  ): Either[Seq[RemoteCatalogError], Seq[A]] = {
    val errors = results.collect { case Left(errs) => errs }.flatten

    if (errors.nonEmpty) {
      Left(errors)
    } else {
      Right(results.collect { case Right(values) => values }.flatten)
    }
  }
}

case class RemoteCatalogRun(
    id: DatastoreId,
    tenant: TenantId,
    catalog: RemoteCatalogId,
    at: DateTime,
    status: RemoteCatalogRunStatus,
    created: Seq[RemoteCatalogRunEntity],
    updated: Seq[RemoteCatalogRunEntity],
    deleted: Seq[RemoteCatalogRunEntity],
    detached: Seq[RemoteCatalogRunEntity],
    errors: Seq[RemoteCatalogError]
) extends CanJson[RemoteCatalogRun] {
  def asJson: JsValue = json.RemoteCatalogRunFormat.writes(this)
}
