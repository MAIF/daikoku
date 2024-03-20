package fr.maif.otoroshi.daikoku.domain

import org.apache.pekko.http.scaladsl.util.FastFuture
import cats.implicits.catsSyntaxOptionId
import com.github.jknack.handlebars.{Context, Handlebars, Options}
import controllers.AppError
import controllers.AppError.toJson
import domain.JsonNodeValueResolver
import fr.maif.otoroshi.daikoku.actions.{DaikokuActionContext, DaikokuActionMaybeWithoutUserContext}
import fr.maif.otoroshi.daikoku.audit.config.{ElasticAnalyticsConfig, Webhook}
import fr.maif.otoroshi.daikoku.audit.{AuditTrailEvent, KafkaConfig}
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async.{_TeamMemberOnly, _UberPublicUserAccess}
import fr.maif.otoroshi.daikoku.domain.json.CmsPageFormat
import fr.maif.otoroshi.daikoku.env.{DaikokuMode, Env}
import fr.maif.otoroshi.daikoku.login.AuthProvider
import fr.maif.otoroshi.daikoku.utils.StringImplicits.BetterString
import fr.maif.otoroshi.daikoku.utils._
import org.joda.time.DateTime
import play.api.i18n.MessagesApi
import play.api.libs.json._
import play.api.mvc.Request
import play.twirl.api.Html
import storage.TenantCapableRepo

import java.util
import java.util.concurrent.Executors
import scala.concurrent.duration.DurationInt
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.util.{Failure, Success, Try}

object Tenant {
  val Default: TenantId = TenantId("default")
}

/**
  * Entity representing the UI style of the tenant
  *
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
    homeCmsPage: Option[String] = None,
    notFoundCmsPage: Option[String] = None,
    authenticatedCmsPage: Option[String] = None,
    cacheTTL: Int = 60000,
    cmsHistoryLength: Int = 10,
    logo: String = "/assets/images/daikoku.svg",
    footer: Option[String] = None
) extends CanJson[DaikokuStyle] {
  override def asJson: JsValue = json.DaikokuStyleFormat.writes(this)
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
      "display" -> display.name,
      "environments" -> JsArray(environments.map(JsString.apply).toSeq)
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
          s"""<link rel="stylesheet" media="screen" href="${s.css}">\n$moreCss\n$moreFontFamily"""
        )
      } else if (s.css.startsWith("/")) {
        Html(
          s"""<link rel="stylesheet" media="screen" href="${s.css}">\n$moreCss\n$moreFontFamily"""
        )
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

// ########### CMS #############

object CmsPage {
  val pageRenderingEc = ExecutionContext.fromExecutor(
    Executors.newWorkStealingPool(Runtime.getRuntime.availableProcessors() + 1)
  )
}

case class CmsFile(name: String, content: String, metadata: Map[String, JsValue] = Map.empty) {
    def path(): String = metadata.getOrElse("_path", JsString("")).as[String]
    def contentType(): String = metadata.getOrElse("_content_type", JsString("")).as[String]

    def authenticated(): Boolean = Json.parse(metadata.getOrElse("_authenticated", JsString("false")).as[String]).as[Boolean]
    def visible(): Boolean = Json.parse(metadata.getOrElse("_visible", JsString("true")).as[String]).as[Boolean]
    def exact(): Boolean = Json.parse(metadata.getOrElse("_exact", JsString("true")).as[String]).as[Boolean]

    def toCmsPage(tenantId: TenantId): CmsPage = {
      CmsPage(
        id = CmsPageId(path().replaceAll("/", "-")),
        tenant = tenantId,
        visible = visible(),
        authenticated = authenticated(),
        name = name,
        forwardRef = None,
        tags = List.empty,
        metadata = Map.empty,
        contentType = contentType(),
        body= content,
        draft = content,
        path = Some(path())
      )
    }
}


case class CmsRequestRendering(content: Seq[CmsFile], current_page: String)
case class CmsHistory(id: String, date: DateTime, diff: String, user: UserId)

case class Asset(id: AssetId, tenant: TenantId, slug: String) extends CanJson[Asset] {
  override def asJson: JsValue = json.AssetFormat.writes(this)
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
    draft: String,
    path: Option[String] = None,
    exact: Boolean = false,
    lastPublishedDate: Option[DateTime] = None,
    history: Seq[CmsHistory] = Seq.empty
) extends CanJson[CmsPage] {
  override def asJson: JsValue = json.CmsPageFormat.writes(this)

  def enrichHandlebarsWithPublicUserEntity[A](
      ctx: DaikokuActionMaybeWithoutUserContext[_],
      parentId: Option[String],
      handlebars: Handlebars,
      fields: Map[String, Any],
      jsonToCombine: Map[String, JsValue],
      req: Option[CmsRequestRendering]
  )(implicit
      env: Env,
      ec: ExecutionContext,
      messagesApi: MessagesApi
  ): Handlebars = {
    handlebars.registerHelper(
      s"daikoku-user",
      (id: String, options: Options) => {
        val userId = renderString(ctx, parentId, id, fields, jsonToCombine, req)
        val optUser =
          Await.result(env.dataStore.userRepo.findById(userId), 10.seconds)

        optUser match {
          case Some(user) =>
            renderString(
              ctx,
              parentId,
              options.fn.text(),
              fields = fields,
              jsonToCombine = jsonToCombine ++ Map(
                "user" -> Json.obj(
                  "_id" -> user.id.value,
                  "name" -> user.name,
                  "email" -> user.email,
                  "picture" -> user.picture
                )
              ),
              req
            )
          case None => AppError.render(AppError.UserNotFound)
        }
      }
    )
  }

  def enrichHandlebarsWithOwnedApis[A](
      ctx: DaikokuActionMaybeWithoutUserContext[_],
      parentId: Option[String],
      handlebars: Handlebars,
      fields: Map[String, Any],
      jsonToCombine: Map[String, JsValue],
      req: Option[CmsRequestRendering]
  )(implicit
      env: Env,
      ec: ExecutionContext,
      messagesApi: MessagesApi
  ): Handlebars = {
    val ctxUserContext = maybeWithoutUserToUserContext(ctx)
    val name = "owned-api"

    handlebars.registerHelper(
      s"daikoku-${name}s",
      (_: CmsPage, options: Options) => {
        val visibility =
          options.hash.getOrDefault("visibility", "All").asInstanceOf[String]
        Await.result(
          CommonServices.getVisibleApis(
            research = "",
            limit = Int.MaxValue,
            offset = 0
          )(ctxUserContext, env, ec),
          10.seconds
        ) match {
          case Right(ApiWithCount(apis, _)) =>
            apis
              .filter(api =>
                if (visibility == "All") true
                else api.api.visibility.name == visibility
              )
              .map(api =>
                renderString(
                  ctx,
                  parentId,
                  options.fn.text(),
                  fields = fields,
                  jsonToCombine = jsonToCombine ++ Map("api" -> api.api.asJson),
                  req
                )
              )
              .mkString("\n")
          case Left(error) => AppError.render(error)
        }
      }
    )
    handlebars.registerHelper(
      s"daikoku-$name",
      (id: String, options: Options) => {
        val renderedParameter =
          renderString(ctx, parentId, id, fields, jsonToCombine, req)
        val version =
          options.hash.getOrDefault("version", "1.0.0").asInstanceOf[String]
        val optApi = Await.result(
          env.dataStore.apiRepo
            .findByVersion(ctx.tenant, renderedParameter, version),
          10.seconds
        )

        optApi match {
          case Some(api) =>
            Await.result(
              CommonServices
                .apiOfTeam(api.team.value, api.id.value, version)(
                  ctx.asInstanceOf[DaikokuActionContext[Any]],
                  env,
                  ec
                )
                .map {
                  case Right(api) =>
                    renderString(
                      ctx,
                      parentId,
                      options.fn.text(),
                      fields = fields,
                      jsonToCombine =
                        jsonToCombine ++ Map("api" -> api.api.asJson),
                      req = req
                    )
                  case Left(error) => AppError.render(error)
                },
              10.seconds
            )
          case None => AppError.render(AppError.ApiNotFound)
        }
      }
    )
    handlebars.registerHelper(
      s"daikoku-json-$name",
      (id: String, options: Options) => {
        val renderedParameter = renderString(ctx, parentId, id, fields, jsonToCombine, req)
        val version = options.hash.getOrDefault("version", "1.0.0").asInstanceOf[String]
        val optApi = Await.result(
          env.dataStore.apiRepo
            .findByVersion(ctx.tenant, renderedParameter, version),
          10.seconds
        )

        optApi match {
          case Some(api) =>
            Await.result(
              CommonServices
                .apiOfTeam(api.team.value, api.id.value, version)(
                  ctx.asInstanceOf[DaikokuActionContext[Any]],
                  env,
                  ec
                )
                .map {
                  case Right(api)  => api.api.asJson
                  case Left(error) => AppError.render(error)
                },
              10.seconds
            )
          case None => toJson(AppError.ApiNotFound)
        }
      }
    )
    handlebars.registerHelper(
      s"daikoku-json-${name}s",
      (_: CmsPage, _: Options) =>
        Await.result(
          CommonServices
            .getVisibleApis(research = "", limit = Int.MaxValue, offset = 0)(
              ctxUserContext,
              env,
              ec
            )
            .map {
              case Right(ApiWithCount(apis, _)) =>
                JsArray(apis.map(_.api.asJson))
              case Left(error) => toJson(error)
            },
          10.seconds
        )
    )
  }

  private def maybeWithoutUserToUserContext(
      ctx: DaikokuActionMaybeWithoutUserContext[_]
  ): DaikokuActionContext[JsValue] =
    DaikokuActionContext(
      request = ctx.request.asInstanceOf[Request[JsValue]],
      user = ctx.user.getOrElse(
        User(
          UserId("Unauthenticated user"),
          tenants = Set.empty,
          origins = Set.empty,
          name = "Unauthenticated user",
          email = "unauthenticated@foo.bar",
          personalToken = None,
          lastTenant = None,
          defaultLanguage = None
        )
      ),
      tenant = ctx.tenant,
      session = ctx.session.orNull,
      impersonator = ctx.impersonator,
      isTenantAdmin = ctx.isTenantAdmin,
      apiCreationPermitted = ctx.apiCreationPermitted,
      ctx = ctx.ctx
    )

  def enrichHandlebarsWithOwnedTeams[A](
      ctx: DaikokuActionMaybeWithoutUserContext[_],
      parentId: Option[String],
      handlebars: Handlebars,
      fields: Map[String, Any],
      jsonToCombine: Map[String, JsValue],
      req: Option[CmsRequestRendering]
  )(implicit
      env: Env,
      ec: ExecutionContext,
      messagesApi: MessagesApi
  ): Handlebars = {
    val ctxUserContext = maybeWithoutUserToUserContext(ctx)

    handlebars.registerHelper(
      s"daikoku-owned-teams",
      (_: CmsPage, options: Options) => {
        Await.result(
          CommonServices.myTeams()(ctxUserContext, env, ec),
          10.seconds
        ) match {
          case Right(teams) =>
            teams
              .map(team =>
                renderString(
                  ctx,
                  parentId,
                  options.fn.text(),
                  fields = fields,
                  jsonToCombine = jsonToCombine ++ Map("team" -> team.asJson),
                  req = req
                )(env, ec, messagesApi)
              )
              .mkString("\n")
          case Left(error) => AppError.render(error)
        }
      }
    )
    handlebars.registerHelper(
      s"daikoku-owned-team",
      (_: String, options: Options) => {
        Await.result(
          _UberPublicUserAccess(
            AuditTrailEvent(
              s"@{user.name} has accessed its first team on @{tenant.name}"
            )
          )(ctxUserContext) {
            env.dataStore.teamRepo
              .forTenant(ctx.tenant.id)
              .findOne(
                Json.obj(
                  "_deleted" -> false,
                  "type" -> TeamType.Personal.name,
                  "users.userId" -> ctx.user.get.id.value
                )
              )
              .map {
                case None => AppError.TeamNotFound
                case Some(team) if team.includeUser(ctx.user.get.id) =>
                  renderString(
                    ctx,
                    parentId,
                    options.fn.text(),
                    fields = fields,
                    jsonToCombine =
                      jsonToCombine ++ Map("team" -> team.asSimpleJson),
                    req = req
                  )
                case _ => AppError.TeamUnauthorized
              }
          },
          10.seconds
        ) match {
          case Right(e)    => e
          case Left(error) => toJson(error)
        }
      }
    )
    handlebars.registerHelper(
      s"daikoku-json-owned-team",
      (id: String, options: Options) => {
        val teamId = renderString(ctx, parentId, id, fields, jsonToCombine, req)

        Await.result(
          _TeamMemberOnly(
            teamId,
            AuditTrailEvent(
              "@{user.name} has accessed on of his team @{team.name} - @{team.id}"
            )
          )(ctxUserContext) { team =>
            ctx.setCtxValue("team.name", team.name)
            ctx.setCtxValue("team.id", team.id)

            FastFuture.successful(Right(team.toUiPayload()))
          },
          10.seconds
        ) match {
          case Right(jsonTeam) => jsonTeam
          case Left(error)     => toJson(error)
        }
      }
    )
    handlebars.registerHelper(
      s"daikoku-json-owned-teams",
      (_: CmsPage, _: Options) =>
        Await.result(
          CommonServices.myTeams()(ctxUserContext, env, ec).map {
            case Right(teams) => JsArray(teams.map(_.asJson))
            case Left(error)  => toJson(error)
          },
          10.seconds
        )
    )
  }

  def enrichHandlebarsWithEntity[A](
      ctx: DaikokuActionMaybeWithoutUserContext[_],
      parentId: Option[String],
      handlebars: Handlebars,
      name: String,
      getRepo: Env => TenantCapableRepo[A, _],
      stringify: A => JsValue,
      fields: Map[String, Any],
      jsonToCombine: Map[String, JsValue],
      req: Option[CmsRequestRendering]
  )(implicit
      ec: ExecutionContext,
      messagesApi: MessagesApi,
      env: Env
  ): Handlebars = {
    val repo: TenantCapableRepo[A, _] = getRepo(env)
    handlebars.registerHelper(
      s"daikoku-${name}s",
      (_: CmsPage, options: Options) => {
        val apis = Await
          .result(repo.forTenant(ctx.tenant).findAllNotDeleted(), 10.seconds)
        apis
          .map(api =>
            renderString(
              ctx,
              parentId,
              options.fn.text(),
              fields = fields,
              jsonToCombine = jsonToCombine ++ Map(name -> stringify(api)),
              req
            )
          )
          .mkString("\n")
      }
    )
    handlebars.registerHelper(
      s"daikoku-$name",
      (id: String, options: Options) => {
        Await
          .result(
            repo
              .forTenant(ctx.tenant)
              .findByIdOrHrIdNotDeleted(
                renderString(ctx, parentId, id, fields, jsonToCombine, req)
              ),
            10.seconds
          )
          .map(api =>
            renderString(
              ctx,
              parentId,
              options.fn.text(),
              fields = fields,
              jsonToCombine = jsonToCombine ++ Map(name -> stringify(api)),
              req
            )
          )
          .getOrElse(s"$name not found")
      }
    )
    handlebars.registerHelper(
      s"daikoku-json-$name",
      (id: String, _: Options) =>
        Await
          .result(repo.forTenant(ctx.tenant).findByIdNotDeleted(id), 10.seconds)
          .map(stringify)
          .getOrElse("")
    )
    handlebars.registerHelper(
      s"daikoku-json-${name}s",
      (_: CmsPage, _: Options) =>
        JsArray(
          Await
            .result(repo.forTenant(ctx.tenant).findAllNotDeleted(), 10.seconds)
            .map(stringify)
        )
    )
  }

  private def renderString(
      ctx: DaikokuActionMaybeWithoutUserContext[_],
      parentId: Option[String],
      str: String,
      fields: Map[String, Any],
      jsonToCombine: Map[String, JsValue],
      req: Option[CmsRequestRendering]
  )(implicit env: Env, ec: ExecutionContext, messagesApi: MessagesApi) =
    Await
      .result(
        CmsPage(
          id = CmsPageId(IdGenerator.token(32)),
          tenant = ctx.tenant.id,
          visible = true,
          authenticated = false,
          name = "#generated",
          forwardRef = None,
          tags = List(),
          metadata = Map(),
          contentType = "text/html",
          body = str,
          draft = str,
          path = Some("/")
        ).render(ctx, parentId, fields = fields, jsonToCombine = jsonToCombine, req = req),
        10.seconds
      )
      ._1

  private def cmsFindByIdNotDeleted(ctx: DaikokuActionMaybeWithoutUserContext[_],
                        id: String,
                        req: Option[CmsRequestRendering])(implicit env: Env, ec: ExecutionContext): Option[CmsPage] = {
    req match {
      case Some(value) => value.content
        .find(p => cleanPath(p.path()) == cleanPath(id))
        .map(_.toCmsPage(ctx.tenant.id))
      case None => findCmsPageByTheId(ctx, id)
    }
  }

  private def cleanPath(path: String) = {
    val out = path.replace("/_/", "/").replace(".html", "")
    if (!path.startsWith("/"))
      s"/$out"
    else
      out
  }

  private def findCmsPageByTheId(ctx: DaikokuActionMaybeWithoutUserContext[_], id: String)(implicit env: Env, ec: ExecutionContext): Option[CmsPage] = {

    Await.result(
        env.dataStore.cmsRepo.forTenant(ctx.tenant).findOne(Json.obj("$or" -> Json.arr(
          Json.obj("_id" -> cleanPath(id)),
          Json.obj("_id" -> cleanPath(id).replace("/", "-")),
          Json.obj("_id" -> cleanPath(id).replace("/", "-").substring(1))
        ))),
        10.seconds
      )
  }

  private def cmsFindById(ctx: DaikokuActionMaybeWithoutUserContext[_],
                        id: String,
                        req: Option[CmsRequestRendering])(implicit env: Env, ec: ExecutionContext): Option[CmsPage] = {
    req match {
      case Some(value) => value.content
        .find(_.path() == id)
        .map(_.toCmsPage(ctx.tenant.id))
      case None => findCmsPageByTheId(ctx, id)
    }
  }

  private def cmsFindOneNotDeleted(ctx: DaikokuActionMaybeWithoutUserContext[_],
                        id: String,
                        req: Option[CmsRequestRendering])(implicit env: Env, ec: ExecutionContext): Option[CmsPage] = {
    req match {
      case Some(value) => value.content
        .find(p => cleanPath(p.path()) == cleanPath(id))
        .map(_.toCmsPage(ctx.tenant.id))
      case None => Await.result(
        env.dataStore.cmsRepo.forTenant(ctx.tenant).findOneNotDeleted(Json.obj("$or" -> Json.arr(
          Json.obj("path" -> cleanPath(id)),
          Json.obj("_id" -> cleanPath(id)),
          Json.obj("_id" -> cleanPath(id).replace("/", "-"))))),
        10.seconds
      )
    }
  }

  private def daikokuIncludeBlockHelper(
      ctx: DaikokuActionMaybeWithoutUserContext[_],
      parentId: Option[String],
      id: String,
      options: Options,
      fields: Map[String, Any],
      jsonToCombine: Map[String, JsValue],
      req: Option[CmsRequestRendering]
  )(implicit env: Env, ec: ExecutionContext, messagesApi: MessagesApi) = {
    val outFields = getAttrs(ctx, parentId, options, fields, jsonToCombine, req)

    cmsFindByIdNotDeleted(ctx, id, req) match {
      case None =>
        cmsFindOneNotDeleted(ctx, renderString(ctx, parentId, id, outFields, jsonToCombine, req), req) match {
          case None => s"block '$id' not found"
          case Some(page) =>
            Await.result(
              page
                .render(
                  ctx,
                  parentId,
                  fields = outFields,
                  jsonToCombine = jsonToCombine,
                  req = req
                )
                .map(t => t._1),
              10.seconds
            )
        }
      case Some(page) =>
        Await.result(
          page
            .render(
              ctx,
              parentId,
              fields = outFields,
              jsonToCombine = jsonToCombine,
              req
            )
            .map(t => t._1),
          10.seconds
        )
    }
  }

  private def daikokuTemplateWrapper(
      ctx: DaikokuActionMaybeWithoutUserContext[_],
      parentId: Option[String],
      id: String,
      options: Options,
      fields: Map[String, Any],
      jsonToCombine: Map[String, JsValue],
      req: Option[CmsRequestRendering]
  )(implicit env: Env, ec: ExecutionContext, messagesApi: MessagesApi) = {
    cmsFindByIdNotDeleted(ctx, id, req) match {
      case None => "wrapper component not found"
      case Some(page) =>
        val tmpFields = getAttrs(ctx, parentId, options, fields, jsonToCombine, req)
        val outFields = getAttrs(
          ctx,
          parentId,
          options,
          tmpFields ++ Map(
            "children" -> Await
              .result(
                CmsPage(
                  id = CmsPageId(IdGenerator.token(32)),
                  tenant = ctx.tenant.id,
                  visible = true,
                  authenticated = false,
                  name = "#generated",
                  forwardRef = None,
                  tags = List(),
                  metadata = Map(),
                  contentType = "text/html",
                  draft = options.fn.text(),
                  body = options.fn.text(),
                  path = Some("/")
                ).render(
                  ctx,
                  parentId,
                  fields = tmpFields,
                  jsonToCombine = jsonToCombine,
                  req = req
                )(env, messagesApi),
                10.seconds
              )
              ._1
          ),
          jsonToCombine,
          req = req
        )
        Await.result(
          page
            .render(
              ctx,
              parentId,
              fields = outFields,
              jsonToCombine = jsonToCombine,
              req = req
            )
            .map(t => t._1),
          10.seconds
        )
    }
  }

  private def daikokuPathParam(
      ctx: DaikokuActionMaybeWithoutUserContext[_],
      id: String,
      req: Option[CmsRequestRendering]
  )(implicit env: Env, ec: ExecutionContext) = {
    val pages = req match {
      case Some(value) => value.content
        .filter(p => p.path().nonEmpty)
        .map(r => s"/_${r.path()}")
      case None => Await
      .result(
        env.dataStore.cmsRepo
          .forTenant(ctx.tenant)
          .findWithProjection(Json.obj(), Json.obj("path" -> true)),
        10.seconds
      ).map(r => s"/_${(r \ "path").as[String]}")
    }

    pages
      .sortBy(_.length)(Ordering[Int].reverse)
      .find(p => ctx.request.path.startsWith(p))
      .map(r => {
        val params = ctx.request.path.split(r).filter(f => f.nonEmpty)
        try {
          if (params.length > 0)
            params(0).split("/").filter(_.nonEmpty)(Integer.parseInt(id))
          else
            s"path param $id not found"
        } catch {
          case _: Throwable => s"path param $id not found"
        }
      })
      .getOrElse(s"path param $id not found")
  }

  private def daikokuPageUrl(
      ctx: DaikokuActionMaybeWithoutUserContext[_],
      id: String,
      req: Option[CmsRequestRendering]
  )(implicit env: Env, ec: ExecutionContext, messagesApi: MessagesApi) = {
   cmsFindByIdNotDeleted(ctx, id, req) match {
      case None => "#not-found"
      case Some(page) =>
        val wantDraft = ctx.request.getQueryString("draft").contains("true")
        var path = page.path.getOrElse("")

        if (!path.startsWith("/"))
          path = s"/$path"

        if (wantDraft)
          s"/_${path}?draft=true"
        else
          s"/_${path}"
    }
  }

  private def daikokuLinks(
      ctx: DaikokuActionMaybeWithoutUserContext[_],
      handlebars: Handlebars ) = {
    val links = Map(
      "login" -> s"/auth/${ctx.tenant.authProvider.name}/login",
      "logout" -> "/logout",
      "language" -> ctx.user
        .map(_.defaultLanguage)
        .getOrElse(ctx.tenant.defaultLanguage.getOrElse("en")),
      "signup" -> (if (ctx.tenant.authProvider.name == "Local") "/signup"
                   else s"/auth/${ctx.tenant.authProvider.name}/login"),
      "backoffice" -> "/apis",
      "notifications" -> "/notifications",
      "home" -> "/"
    )
    links.map {
      case (name, link) =>
        handlebars.registerHelper(
          s"daikoku-links-$name",
          (_: Object, _: Options) => link
        )
    }
  }

  private def getAttrs(
      ctx: DaikokuActionMaybeWithoutUserContext[_],
      parentId: Option[String],
      options: Options,
      fields: Map[String, Any],
      jsonToCombine: Map[String, JsValue],
      req: Option[CmsRequestRendering]
  )(implicit
      env: Env,
      ec: ExecutionContext,
      messagesApi: MessagesApi
  ): Map[String, Any] = {
    import scala.jdk.CollectionConverters._
    fields ++ options.hash.asScala.map {
      case (k, v) =>
        (
          k,
          renderString(
            ctx,
            parentId,
            v.toString,
            fields,
            jsonToCombine = jsonToCombine,
            req = req
          )(env, ec, messagesApi)
        )
    }.toMap
  }

  private def enrichHandlebarWithPlanEntity(
      ctx: DaikokuActionMaybeWithoutUserContext[_],
      parentId: Option[String],
      handlebars: Handlebars,
      name: String,
      fields: Map[String, Any],
      jsonToCombine: Map[String, JsValue],
      req: Option[CmsRequestRendering]
  )(implicit
      ec: ExecutionContext,
      messagesApi: MessagesApi,
      env: Env
  ): Handlebars = {
    handlebars.registerHelper(
      s" ${name}s-json",
      (id: String, _: Options) => {
        Await
          .result(
            getApi(ctx, parentId, id, fields, jsonToCombine, req).flatMap {
              case Some(api) =>
                env.dataStore.usagePlanRepo.findByApi(tenant, api)
              case None => FastFuture.successful(Seq.empty)
            },
            10.seconds
          )
          .map(_.asJson)
      }
    )

    handlebars.registerHelper(
      s"daikoku-${name}s",
      (id: String, options: Options) => {
        Await
          .result(
            getApi(ctx, parentId, id, fields, jsonToCombine, req).flatMap {
              case Some(api) =>
                env.dataStore.usagePlanRepo.findByApi(tenant, api)
              case None => FastFuture.successful(Seq.empty)
            },
            10.seconds
          )
          .map(p =>
            renderString(
              ctx,
              parentId,
              options.fn.text(),
              fields = fields,
              jsonToCombine = jsonToCombine ++ Map(name -> p.asJson),
              req = req
            )
          )
          .mkString("\n")
      }
    )
  }

  private def getApi(
      ctx: DaikokuActionMaybeWithoutUserContext[_],
      parentId: Option[String],
      id: String,
      fields: Map[String, Any],
      jsonToCombine: Map[String, JsValue],
      req: Option[CmsRequestRendering]
  )(implicit env: Env, ec: ExecutionContext, messagesApi: MessagesApi) =
    env.dataStore.apiRepo
      .forTenant(tenant)
      .findByIdOrHrId(
        renderString(ctx, parentId, id, fields, jsonToCombine = jsonToCombine, req)(
          env,
          ec,
          messagesApi
        )
      )

  private def enrichHandlebarWithDocumentationEntity(
      ctx: DaikokuActionMaybeWithoutUserContext[_],
      parentId: Option[String],
      handlebars: Handlebars,
      name: String,
      fields: Map[String, Any],
      jsonToCombine: Map[String, JsValue],
      req: Option[CmsRequestRendering]
  )(implicit
      ec: ExecutionContext,
      messagesApi: MessagesApi,
      env: Env
  ): Handlebars = {

    def jsonToFields(pages: Seq[ApiDocumentationPage], options: Options) =
      pages
        .map(doc =>
          renderString(
            ctx,
            parentId,
            options.fn.text(),
            fields,
            jsonToCombine = jsonToCombine ++ Map(name -> doc.asJson),
            req = req
          )
        )
        .mkString("\n")

    handlebars.registerHelper(
      s"daikoku-$name",
      (id: String, options: Options) => {
        val pages = Await
          .result(
            getApi(ctx, parentId, id, fields, jsonToCombine, req)
              .flatMap {
                case Some(api) =>
                  Future.sequence(
                    api.documentation
                      .docIds()
                      .map(pageId =>
                        env.dataStore.apiDocumentationPageRepo
                          .forTenant(ctx.tenant)
                          .findById(pageId)
                      )
                  )
                case _ => FastFuture.successful(Seq())
              },
            10.seconds
          )
          .flatten

        jsonToFields(pages, options)
      }
    )

    handlebars.registerHelper(
      s"daikoku-$name-json",
      (id: String, options: Options) => {
        Await
          .result(
            getApi(ctx, parentId, id, fields, jsonToCombine, req)
              .flatMap {
                case Some(api) =>
                  Future.sequence(
                    api.documentation
                      .docIds()
                      .map(pageId =>
                        env.dataStore.apiDocumentationPageRepo.forTenant(ctx.tenant).findById(pageId)
                      )
                  )
                case _ => FastFuture.successful(Seq())
              },
            10.seconds
          )
          .flatten
          .map(_.asJson)
      }
    )

    handlebars.registerHelper(
      s"daikoku-$name-page",
      (id: String, options: Options) => {
        val attrs = getAttrs(ctx, parentId, options, fields, jsonToCombine, req)

        val page: Int =
          attrs.get("page").map(n => n.toString.toInt).getOrElse(0)
        val pages = Await
          .result(
            getApi(ctx, parentId, id, fields, jsonToCombine, req)
              .flatMap {
                case Some(api) =>
                  Future.sequence(
                    api.documentation
                      .docIds()
                      .slice(page, page + 1)
                      .map(env.dataStore.apiDocumentationPageRepo.forTenant(ctx.tenant).findById(_))
                  )
                case _ => FastFuture.successful(Seq())
              },
            10.seconds
          )
          .flatten

        jsonToFields(pages, options)
      }
    )

    handlebars.registerHelper(
      s"daikoku-$name-page-id",
      (id: String, options: Options) => {
        val attrs = getAttrs(ctx, parentId, options, fields, jsonToCombine, req)
        val page = attrs.getOrElse("page", "")
        Await
          .result(
            getApi(ctx, parentId, id, fields, jsonToCombine, req)
              .flatMap {
                case Some(api) =>
                  api.documentation
                    .docIds()
                    .find(_ == page)
                    .map(env.dataStore.apiDocumentationPageRepo.forTenant(ctx.tenant).findById(_))
                    .getOrElse(FastFuture.successful(None))
                case _ => FastFuture.successful(None)
              },
            10.seconds
          )
          .map(doc =>
            renderString(
              ctx,
              parentId,
              options.fn.text(),
              fields = fields,
              jsonToCombine = jsonToCombine ++ Map(name -> doc.asJson),
              req = req
            )
          )
          .getOrElse("")
      }
    )
  }

  def combineFieldsToContext(
      context: Context.Builder,
      fields: Map[String, Any],
      jsonToCombine: Map[String, JsValue]
  ): Context.Builder =
    (fields ++ jsonToCombine).foldLeft(context) { (acc, item) =>
      acc.combine(item._1, item._2)
    }

  private def searchCmsFile(req: CmsRequestRendering, page: CmsPage): Option[CmsFile] = {
     req.content.find(p => p.path() == page.path.getOrElse(""))
  }

  def render(
      ctx: DaikokuActionMaybeWithoutUserContext[_],
      parentId: Option[String] = None,
      fields: Map[String, Any] = Map.empty,
      jsonToCombine: Map[String, JsValue] = Map.empty,
      req: Option[CmsRequestRendering]
  )(implicit env: Env, messagesApi: MessagesApi): Future[(String, String)] = {
    implicit val ec: ExecutionContext = env.defaultExecutionContext

    val page = forwardRef match {
      case Some(id) => cmsFindByIdNotDeleted(ctx, id.value, req).getOrElse(this)
      case None => this
    }
    try {
      import com.github.jknack.handlebars.EscapingStrategy
      implicit val ec = CmsPage.pageRenderingEc

      if (page.authenticated && (ctx.user.isEmpty || ctx.user.exists(_.isGuest)))
        ctx.tenant.style.flatMap(_.authenticatedCmsPage) match {
          case Some(value) =>
            cmsFindById(ctx, value, req) match {
              case Some(value) => value.render(ctx, parentId, fields, jsonToCombine, req)
              case None => FastFuture.successful(("Need to be logged", page.contentType))
            }
          case None => FastFuture.successful(("Need to be logged", page.contentType))
        }
      else if (parentId.nonEmpty && page.id.value == parentId.get)
        FastFuture.successful(("", page.contentType))
      else {
        val context = combineFieldsToContext(
          Context
            .newBuilder(this)
            .resolver(JsonNodeValueResolver.INSTANCE)
            .combine("tenant", ctx.tenant.asJson)
            .combine("is_admin", ctx.isTenantAdmin)
            .combine("connected", ctx.user.map(!_.isGuest).getOrElse(false))
            .combine("user", ctx.user.map(u => u.asSimpleJson).getOrElse(""))
            .combine("request", EntitiesToMap.request(ctx.request))
            .combine(
              "daikoku-css", {
                if (env.config.mode == DaikokuMode.Dev)
                  s"http://localhost:3000/daikoku.css"
                else if (env.config.mode == DaikokuMode.Prod)
                  s"${env.getDaikokuUrl(ctx.tenant, "/assets/react-app/daikoku.min.css")}"
              }
            ),
          fields,
          jsonToCombine
        )

        req match {
          case Some(value) if page.name != "#generated" =>
            searchCmsFile(value, page)
              .foreach(_.metadata.foreach(p => {
                context.combine(p._1, p._2 match {
                  case JsString(value) => value  // remove quotes framing string
                  case value => value
                })
              }))
          case _ =>
        }

        val handlebars = new Handlebars().`with`(new EscapingStrategy() {
          override def escape(value: CharSequence): String = value.toString
        })

        handlebars.registerHelper(
          "for",
          (variable: String, options: Options) => {
            val s = renderString(ctx, parentId, variable, fields, jsonToCombine, req)
            val field = options.hash.getOrDefault("field", "object").toString

            try {
              Json
                .parse(s)
                .as[JsArray]
                .value
                .map(p => {
                  renderString(
                    ctx,
                    parentId,
                    options.fn.text(),
                    fields,
                    jsonToCombine ++ Map(field -> p),
                    req = req
                  )
                })
                .mkString("\n")
            } catch {
              case _: Throwable => Json.obj()
            }
          }
        )
        handlebars.registerHelper(
          "size",
          (variable: String, _: Options) => {
            val s = renderString(ctx, parentId, variable, fields, jsonToCombine, req)
            try {
              String.valueOf(Json.parse(s).asInstanceOf[JsArray].value.length)
            } catch {
              case _: Throwable => "0"
            }
          }
        )
        handlebars.registerHelper(
          "ifeq",
          (variable: String, options: Options) => {
            if (
              renderString(ctx, parentId, variable, fields, jsonToCombine, req) ==
                renderString(
                  ctx,
                  parentId,
                  options.params(0).toString,
                  fields,
                  jsonToCombine,
                  req
                )
            )
              options.fn.apply(
                renderString(
                  ctx,
                  parentId,
                  options.fn.text(),
                  fields,
                  jsonToCombine,
                  req = req
                )
              )
            else
              ""
          }
        )
        handlebars.registerHelper(
          "ifnoteq",
          (variable: String, options: Options) => {
            if (
              renderString(ctx, parentId, variable, fields, jsonToCombine, req) !=
                renderString(
                  ctx,
                  parentId,
                  options.params(0).toString,
                  fields,
                  jsonToCombine,
                  req
                )
            )
              options.fn.apply(
                renderString(
                  ctx,
                  parentId,
                  options.fn.text(),
                  fields,
                  jsonToCombine,
                  req
                )
              )
            else
              ""
          }
        )
        handlebars.registerHelper(
          "getOrElse",
          (variable: String, options: Options) => {
            val str = renderString(ctx, parentId, variable, fields, jsonToCombine, req)
            if (str != "null" && str.nonEmpty)
              str
            else
              renderString(
                ctx,
                parentId,
                options.params(0).toString,
                fields,
                jsonToCombine,
                req
              )
          }
        )
        handlebars.registerHelper(
          "translate",
          (variable: String, _: Options) => {
            val str =
              renderString(ctx, parentId, variable, fields, jsonToCombine, req)
            Await.result(
              env.translator.translate(str, ctx.tenant)(
                messagesApi,
                ctx.user
                  .map(
                    _.defaultLanguage
                      .getOrElse(ctx.tenant.defaultLanguage.getOrElse("en"))
                  )
                  .getOrElse("en"),
                env
              ),
              10.seconds
            )
          }
        )
        handlebars.registerHelper(
          "daikoku-asset-url",
          (context: String, _: Options) => s"/tenant-assets/$context"
        )
        handlebars.registerHelper(
          "daikoku-page-url",
          (id: String, _: Options) => daikokuPageUrl(ctx, id, req)
        )
        handlebars.registerHelper(
          "daikoku-generic-page-url",
          (id: String, _: Options) => s"/cms/pages/$id"
        )
        handlebars.registerHelper(
          "daikoku-page-preview-url",
          (id: String, _: Options) => s"/cms/pages/$id?draft=true"
        )
        handlebars.registerHelper(
          "daikoku-path-param",
          (id: String, _: Options) => daikokuPathParam(ctx, id, req)
        )
        handlebars.registerHelper(
          "daikoku-query-param",
          (id: String, _: Options) =>
            ctx.request.queryString
              .get(id)
              .map(_.head)
              .getOrElse("id param not found")
        )
        daikokuLinks(ctx, handlebars)

        handlebars.registerHelper(
          "daikoku-include-block",
          (id: String, options: Options) =>
            daikokuIncludeBlockHelper(
              ctx,
              Some(page.id.value),
              id,
              options,
              fields,
              jsonToCombine,
              req
            )
        )
        handlebars.registerHelper(
          "daikoku-template-wrapper",
          (id: String, options: Options) =>
            daikokuTemplateWrapper(
              ctx,
              Some(page.id.value),
              id,
              options,
              fields,
              jsonToCombine,
              req
            )
        )

        enrichHandlebarsWithOwnedApis(
          ctx,
          Some(page.id.value),
          handlebars,
          fields,
          jsonToCombine,
          req
        )
        enrichHandlebarsWithOwnedTeams(
          ctx,
          Some(page.id.value),
          handlebars,
          fields,
          jsonToCombine,
          req
        )

        enrichHandlebarsWithEntity(
          ctx,
          Some(page.id.value),
          handlebars,
          "api",
          _.dataStore.apiRepo,
          (api: Api) => api.asJson,
          fields,
          jsonToCombine,
          req
        )
        enrichHandlebarsWithEntity(
          ctx,
          Some(page.id.value),
          handlebars,
          "team",
          _.dataStore.teamRepo,
          (team: Team) => team.asJson,
          fields,
          jsonToCombine,
          req
        )
        enrichHandlebarWithDocumentationEntity(
          ctx,
          Some(page.id.value),
          handlebars,
          "documentation",
          fields,
          jsonToCombine,
          req
        )
        enrichHandlebarWithPlanEntity(
          ctx,
          Some(page.id.value),
          handlebars,
          "plan",
          fields,
          jsonToCombine,
          req
        )
        enrichHandlebarsWithPublicUserEntity(
          ctx,
          Some(page.id.value),
          handlebars,
          fields,
          jsonToCombine,
          req
        )

        val c = context.build()

        val template = req match {
          case Some(value) if page.name != "#generated" => searchCmsFile(value, page).map(_.content).getOrElse("")
          case _ => if (ctx.request.getQueryString("draft").contains("true")) page.draft
            else page.body
        }

        if (template == "") {
          println("missing rendering", page.name)
        } else
          println("starting rendering", page.path, page.name)

        val result = handlebars.compileInline(template).apply(c)
        c.destroy()
        FastFuture.successful((result, page.contentType))
      }
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
  }
}

object EntitiesToMap {
  def request(req: Request[_]) =
    Json.obj(
      "path" -> req.path,
      "method" -> req.method,
      "headers" -> req.headers.toSimpleMap
    )
}
