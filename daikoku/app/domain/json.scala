package fr.maif.otoroshi.daikoku.domain

import java.util.concurrent.TimeUnit

import com.auth0.jwt.JWT
import fr.maif.otoroshi.daikoku.audit.KafkaConfig
import fr.maif.otoroshi.daikoku.audit.config.{ElasticAnalyticsConfig, Webhook}
import fr.maif.otoroshi.daikoku.domain.ApiVisibility._
import fr.maif.otoroshi.daikoku.domain.NotificationAction._
import fr.maif.otoroshi.daikoku.domain.NotificationStatus.{
  Accepted,
  Pending,
  Rejected
}
import fr.maif.otoroshi.daikoku.domain.SubscriptionProcess.{Automatic, Manual}
import fr.maif.otoroshi.daikoku.domain.TeamPermission._
import fr.maif.otoroshi.daikoku.domain.TeamType.{Organization, Personal}
import fr.maif.otoroshi.daikoku.domain.TranslationElement._
import fr.maif.otoroshi.daikoku.domain.UsagePlan._
import fr.maif.otoroshi.daikoku.utils._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.login.AuthProvider
import fr.maif.otoroshi.daikoku.utils.StringImplicits._
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json._

import scala.concurrent.duration.FiniteDuration
import scala.util.Try

object json {
  val BillingTimeUnitFormat = new Format[BillingTimeUnit] {
    override def reads(json: JsValue): JsResult[BillingTimeUnit] =
      Try {
        json.asOpt[String].flatMap(BillingTimeUnit.apply) match {
          case Some(tu) => JsSuccess(tu)
          case None     => JsError("Bad time unit")
        }
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: BillingTimeUnit): JsValue = JsString(o.name)
  }

  val BillingDurationFormat = new Format[BillingDuration] {
    override def reads(json: JsValue): JsResult[BillingDuration] =
      Try {
        JsSuccess(
          BillingDuration(
            value = (json \ "value").as[Long],
            unit = (json \ "unit").as(BillingTimeUnitFormat)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: BillingDuration): JsValue = Json.obj(
      "value" -> o.value,
      "unit" -> o.unit.asJson,
    )
  }

  val DateTimeFormat = new Format[DateTime] {
    override def reads(json: JsValue) =
      Try {
        val longDate: Long =
          ((json \ "$long").asOpt[Long]).getOrElse(json.as[Long])
        JsSuccess(new DateTime(longDate))
      } recover {
        case e => JsError(e.getMessage)
      } get

    override def writes(o: DateTime) = JsNumber(o.toDate.getTime)
  }
  val OtoroshiSettingsFormat = new Format[OtoroshiSettings] {
    override def reads(json: JsValue): JsResult[OtoroshiSettings] =
      Try {
        JsSuccess(
          OtoroshiSettings(
            id = (json \ "_id").as(OtoroshiSettingsIdFormat),
            url = (json \ "url").as[String],
            host = (json \ "host").as[String],
            clientId = (json \ "clientId")
              .asOpt[String]
              .getOrElse("admin-api-apikey-id"),
            clientSecret = (json \ "clientSecret")
              .asOpt[String]
              .getOrElse("admin-api-apikey-sectet")
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: OtoroshiSettings): JsValue = Json.obj(
      "_id" -> o.id.asJson,
      "url" -> o.url,
      "host" -> o.host,
      "clientId" -> o.clientId,
      "clientSecret" -> o.clientSecret
    )
  }
  val TestingFormat = new Format[Testing] {
    override def reads(json: JsValue): JsResult[Testing] =
      Try {
        JsSuccess(
          Testing(
            enabled = (json \ "enabled").asOpt[Boolean].getOrElse(false),
            auth = (json \ "auth").asOpt[String].filter(_.trim.nonEmpty) match {
              case Some("ApiKey") => TestingAuth.ApiKey
              case Some("Basic")  => TestingAuth.Basic
              case _              => TestingAuth.Basic
            },
            name = (json \ "name").asOpt[String].filter(_.trim.nonEmpty),
            username = (json \ "username").asOpt[String].filter(_.trim.nonEmpty),
            password = (json \ "password").asOpt[String].filter(_.trim.nonEmpty),
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: Testing): JsValue = Json.obj(
      "enabled" -> o.enabled,
      "auth" -> o.auth.name,
      "name" -> o.name.map(JsString.apply).getOrElse(JsNull).as[JsValue],
      "username" -> o.username
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "password" -> o.password
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
    )
  }
//  val IdentitySettingsFormat  = new Format[IdentitySettings] {
//    override def reads(json: JsValue): JsResult[IdentitySettings] =
//      Try {
//        JsSuccess(
//          IdentitySettings(
//            identityThroughOtoroshi =
//              (json \ "identityThroughOtoroshi").asOpt[Boolean].getOrElse(true),
//            stateHeaderName = (json \ "stateHeaderName")
//              .asOpt[String]
//              .getOrElse("Otoroshi-State"),
//            stateRespHeaderName = (json \ "stateRespHeaderName")
//              .asOpt[String]
//              .getOrElse("Otoroshi-State-Resp"),
//            claimHeaderName = (json \ "claimHeaderName")
//              .asOpt[String]
//              .getOrElse("Otoroshi-Claim"),
//            claimSecret =
//              (json \ "claimSecret").asOpt[String].getOrElse("secret")
//          ))
//      } recover {
//        case e => JsError(e.getMessage)
//      } get
//    override def writes(o: IdentitySettings): JsValue = Json.obj(
//      "identityThroughOtoroshi" -> o.identityThroughOtoroshi,
//      "stateHeaderName" -> o.stateHeaderName,
//      "stateRespHeaderName" -> o.stateRespHeaderName,
//      "claimHeaderName" -> o.claimHeaderName,
//      "claimSecret" -> o.claimSecret,
//    )
//  }
  val UsagePlanIdFormat = new Format[UsagePlanId] {
    override def reads(json: JsValue): JsResult[UsagePlanId] =
      Try {
        JsSuccess(UsagePlanId(json.as[String]))
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: UsagePlanId): JsValue = JsString(o.value)
  }
  val UserIdFormat = new Format[UserId] {
    override def reads(json: JsValue): JsResult[UserId] =
      Try {
        JsSuccess(UserId(json.as[String]))
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: UserId): JsValue = JsString(o.value)
  }
  val MongoIdFormat = new Format[MongoId] {
    override def reads(json: JsValue): JsResult[MongoId] =
      Try {
        JsSuccess(MongoId(json.as[String]))
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: MongoId): JsValue = JsString(o.value)
  }
  val TeamIdFormat = new Format[TeamId] {
    override def reads(json: JsValue): JsResult[TeamId] =
      Try {
        JsSuccess(TeamId(json.as[String]))
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: TeamId): JsValue = JsString(o.value)
  }
  val ApiIdFormat = new Format[ApiId] {
    override def reads(json: JsValue): JsResult[ApiId] =
      Try {
        JsSuccess(ApiId(json.as[String]))
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: ApiId): JsValue = JsString(o.value)
  }
  val ApiSubscriptionIdFormat = new Format[ApiSubscriptionId] {
    override def reads(json: JsValue): JsResult[ApiSubscriptionId] =
      Try {
        JsSuccess(ApiSubscriptionId(json.as[String]))
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: ApiSubscriptionId): JsValue = JsString(o.value)
  }
  val ApiDocumentationIdFormat = new Format[ApiDocumentationId] {
    override def reads(json: JsValue): JsResult[ApiDocumentationId] =
      Try {
        JsSuccess(ApiDocumentationId(json.as[String]))
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: ApiDocumentationId): JsValue = JsString(o.value)
  }
  val ApiDocumentationPageIdFormat = new Format[ApiDocumentationPageId] {
    override def reads(json: JsValue): JsResult[ApiDocumentationPageId] =
      Try {
        JsSuccess(ApiDocumentationPageId(json.as[String]))
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: ApiDocumentationPageId): JsValue = JsString(o.value)
  }
  val TenantIdFormat = new Format[TenantId] {
    override def reads(json: JsValue): JsResult[TenantId] =
      Try {
        JsSuccess(TenantId(json.as[String]))
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: TenantId): JsValue = JsString(o.value)
  }
  val OtoroshiGroupFormat = new Format[OtoroshiGroup] {
    override def reads(json: JsValue): JsResult[OtoroshiGroup] =
      Try {
        JsSuccess(OtoroshiGroup(json.as[String]))
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: OtoroshiGroup): JsValue = JsString(o.value)
  }
  val OtoroshiServiceGroupIdFormat = new Format[OtoroshiServiceGroupId] {
    override def reads(json: JsValue): JsResult[OtoroshiServiceGroupId] =
      Try {
        JsSuccess(OtoroshiServiceGroupId(json.as[String]))
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: OtoroshiServiceGroupId): JsValue = JsString(o.value)
  }
  val OtoroshiServiceIdFormat = new Format[OtoroshiServiceId] {
    override def reads(json: JsValue): JsResult[OtoroshiServiceId] =
      Try {
        JsSuccess(OtoroshiServiceId(json.as[String]))
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: OtoroshiServiceId): JsValue = JsString(o.value)
  }
  val VersionFormat = new Format[Version] {
    override def reads(json: JsValue): JsResult[Version] =
      Try {
        JsSuccess(Version(json.as[String]))
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: Version): JsValue = JsString(o.value)
  }
  val OtoroshiSettingsIdFormat = new Format[OtoroshiSettingsId] {
    override def reads(json: JsValue): JsResult[OtoroshiSettingsId] =
      Try {
        JsSuccess(OtoroshiSettingsId(json.as[String]))
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: OtoroshiSettingsId): JsValue = JsString(o.value)
  }
  val TeamTypeFormat = new Format[TeamType] {
    override def reads(json: JsValue) = json.as[String] match {
      case "Personal"     => JsSuccess(Personal)
      case "Organization" => JsSuccess(Organization)
      case "Admin"        => JsSuccess(TeamType.Admin)
      case str            => JsError(s"Bad TeamType value: $str")
    }
    override def writes(o: TeamType) = JsString(o.name)
  }
  val ApiVisibilityFormat = new Format[ApiVisibility] {
    override def reads(json: JsValue) = json.as[String] match {
      case "Public"                   => JsSuccess(Public)
      case "Private"                  => JsSuccess(Private)
      case "PublicWithAuthorizations" => JsSuccess(PublicWithAuthorizations)
      case "AdminOnly"                => JsSuccess(AdminOnly)
      case str                        => JsError(s"Bad ApiVisibility value: $str")
    }
    override def writes(o: ApiVisibility) = JsString(o.name)
  }
  val UsagePlanVisibilityFormat = new Format[UsagePlanVisibility] {
    override def reads(json: JsValue) = json.as[String] match {
      case "Public"  => JsSuccess(UsagePlanVisibility.Public)
      case "Private" => JsSuccess(UsagePlanVisibility.Private)
      case str       => JsError(s"Bad UsagePlanVisibility value: $str")
    }
    override def writes(o: UsagePlanVisibility) = JsString(o.name)
  }
  val SubscriptionProcessFormat = new Format[SubscriptionProcess] {
    override def reads(json: JsValue) = json.as[String] match {
      case "Automatic" => JsSuccess(SubscriptionProcess.Automatic)
      case "Manual"    => JsSuccess(SubscriptionProcess.Manual)
      case str         => JsError(s"Bad SubscriptionProcess value: $str")
    }
    override def writes(o: SubscriptionProcess) = JsString(o.name)
  }
  val IntegrationProcessFormat = new Format[IntegrationProcess] {
    override def reads(json: JsValue) = json.as[String] match {
      case "Automatic" => JsSuccess(IntegrationProcess.Automatic)
      case "ApiKey"    => JsSuccess(IntegrationProcess.ApiKey)
      case str         => JsError(s"Bad SubscriptionProcess value: $str")
    }
    override def writes(o: IntegrationProcess) = JsString(o.name)
  }
  val UsagePlanFormat = new Format[UsagePlan] {
    override def reads(json: JsValue) = (json \ "type").as[String] match {
      case "FreeWithoutQuotas"   => FreeWithoutQuotasFormat.reads(json)
      case "FreeWithQuotas"      => FreeWithQuotasFormat.reads(json)
      case "QuotasWithLimits"    => QuotasWithLimitsFormat.reads(json)
      case "QuotasWithoutLimits" => QuotasWithoutLimitsFormat.reads(json)
      case "PayPerUse"           => PayPerUseFormat.reads(json)
      case "Admin"               => AdminFormat.reads(json)
      case str                   => JsError(s"Bad UsagePlan value: $str")
    }
    override def writes(o: UsagePlan) = o match {
      case p: Admin =>
        AdminFormat.writes(p).as[JsObject] ++ Json.obj("type" -> "Admin")
      case p: FreeWithoutQuotas =>
        FreeWithoutQuotasFormat.writes(p).as[JsObject] ++ Json.obj(
          "type" -> "FreeWithoutQuotas")
      case p: FreeWithQuotas =>
        FreeWithQuotasFormat.writes(p).as[JsObject] ++ Json.obj(
          "type" -> "FreeWithQuotas")
      case p: QuotasWithLimits =>
        QuotasWithLimitsFormat.writes(p).as[JsObject] ++ Json.obj(
          "type" -> "QuotasWithLimits")
      case p: QuotasWithoutLimits =>
        QuotasWithoutLimitsFormat.writes(p).as[JsObject] ++ Json.obj(
          "type" -> "QuotasWithoutLimits")
      case p: PayPerUse =>
        PayPerUseFormat.writes(p).as[JsObject] ++ Json.obj(
          "type" -> "PayPerUse")
    }
  }
  val MailgunSettingsFormat = new Format[MailgunSettings] {
    override def reads(json: JsValue): JsResult[MailgunSettings] =
      Try {
        JsSuccess(
          MailgunSettings(
            domain = (json \ "domain").as[String],
            key = (json \ "key").as[String],
            fromTitle = (json \ "fromTitle").as[String],
            fromEmail = (json \ "fromEmail").as[String],
            template = (json \ "template").asOpt[String]
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: MailgunSettings): JsValue = Json.obj(
      "type" -> "mailgun",
      "domain" -> o.domain,
      "key" -> o.key,
      "fromTitle" -> o.fromTitle,
      "fromEmail" -> o.fromEmail,
      "template" -> o.template
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue]
    )
  }
  val MailjetSettingsFormat = new Format[MailjetSettings] {
    override def reads(json: JsValue): JsResult[MailjetSettings] =
      Try {
        JsSuccess(
          MailjetSettings(
            apiKeyPublic = (json \ "apiKeyPublic").as[String],
            apiKeyPrivate = (json \ "apiKeyPrivate").as[String],
            fromTitle = (json \ "fromTitle").as[String],
            fromEmail = (json \ "fromEmail").as[String],
            template = (json \ "template").asOpt[String]
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: MailjetSettings): JsValue = Json.obj(
      "type" -> "mailjet",
      "apiKeyPublic" -> o.apiKeyPublic,
      "apiKeyPrivate" -> o.apiKeyPrivate,
      "fromTitle" -> o.fromTitle,
      "fromEmail" -> o.fromEmail,
      "template" -> o.template
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue]
    )
  }
  val AdminFormat = new Format[Admin] {
    override def reads(json: JsValue): JsResult[Admin] =
      Try {
        JsSuccess(
          Admin(
            id = (json \ "_id").as(UsagePlanIdFormat),
            otoroshiTarget =
              (json \ "otoroshiTarget").asOpt(OtoroshiTargetFormat),
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: Admin): JsValue = Json.obj(
      "_id" -> UsagePlanIdFormat.writes(o.id),
      "customDescription" -> o.customDescription,
      "customName" -> o.customName,
      "allowMultipleKeys" -> o.allowMultipleKeys
        .map(JsBoolean.apply)
        .getOrElse(JsBoolean(false))
        .as[JsValue],
      "otoroshiTarget" -> o.otoroshiTarget
        .map(_.asJson)
        .getOrElse(JsNull)
        .as[JsValue],
    )
  }
  val FreeWithoutQuotasFormat = new Format[FreeWithoutQuotas] {
    override def reads(json: JsValue): JsResult[FreeWithoutQuotas] =
      Try {
        JsSuccess(
          FreeWithoutQuotas(
            id = (json \ "_id").as(UsagePlanIdFormat),
            currency = (json \ "currency").as(CurrencyFormat),
            customName = (json \ "customName").asOpt[String],
            customDescription = (json \ "customDescription").asOpt[String],
            otoroshiTarget =
              (json \ "otoroshiTarget").asOpt(OtoroshiTargetFormat),
            billingDuration =
              (json \ "billingDuration").as(BillingDurationFormat),
            allowMultipleKeys = (json \ "allowMultipleKeys").asOpt[Boolean],
            visibility = (json \ "visibility")
              .asOpt(UsagePlanVisibilityFormat)
              .getOrElse(UsagePlanVisibility.Public),
            authorizedTeams = (json \ "authorizedTeams")
              .asOpt(SeqTeamIdFormat)
              .getOrElse(Seq.empty),
            autoRotation = (json \ "autoRotation")
              .asOpt[Boolean],
            subscriptionProcess =
              (json \ "subscriptionProcess").as(SubscriptionProcessFormat),
            integrationProcess =
              (json \ "integrationProcess").as(IntegrationProcessFormat),
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: FreeWithoutQuotas): JsValue = Json.obj(
      "_id" -> UsagePlanIdFormat.writes(o.id),
      "currency" -> o.currency.asJson,
      "billingDuration" -> o.billingDuration.asJson,
      "customName" -> o.customName
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "customDescription" -> o.customDescription
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "otoroshiTarget" -> o.otoroshiTarget
        .map(_.asJson)
        .getOrElse(JsNull)
        .as[JsValue],
      "allowMultipleKeys" -> o.allowMultipleKeys
        .map(JsBoolean.apply)
        .getOrElse(JsBoolean(false))
        .as[JsValue],
      "visibility" -> UsagePlanVisibilityFormat.writes(o.visibility),
      "authorizedTeams" -> SeqTeamIdFormat.writes(o.authorizedTeams),
      "autoRotation" -> o.autoRotation
        .map(JsBoolean.apply)
        .getOrElse(JsBoolean(false))
        .as[JsValue],
      "subscriptionProcess" -> SubscriptionProcessFormat.writes(
        o.subscriptionProcess),
      "integrationProcess" -> IntegrationProcessFormat.writes(
        o.integrationProcess)
    )
  }
  val FreeWithQuotasFormat = new Format[FreeWithQuotas] {
    override def reads(json: JsValue): JsResult[FreeWithQuotas] =
      Try {
        JsSuccess(
          FreeWithQuotas(
            id = (json \ "_id").as(UsagePlanIdFormat),
            maxPerSecond = (json \ "maxPerSecond").as[Long],
            maxPerDay = (json \ "maxPerDay").as[Long],
            maxPerMonth = (json \ "maxPerMonth").as[Long],
            currency = (json \ "currency").as(CurrencyFormat),
            customName = (json \ "customName").asOpt[String],
            customDescription = (json \ "customDescription").asOpt[String],
            otoroshiTarget =
              (json \ "otoroshiTarget").asOpt(OtoroshiTargetFormat),
            billingDuration =
              (json \ "billingDuration").as(BillingDurationFormat),
            allowMultipleKeys = (json \ "allowMultipleKeys").asOpt[Boolean],
            visibility = (json \ "visibility")
              .asOpt(UsagePlanVisibilityFormat)
              .getOrElse(UsagePlanVisibility.Public),
            authorizedTeams = (json \ "authorizedTeams")
              .asOpt(SeqTeamIdFormat)
              .getOrElse(Seq.empty),
            autoRotation = (json \ "autoRotation")
              .asOpt[Boolean],
            subscriptionProcess =
              (json \ "subscriptionProcess").as(SubscriptionProcessFormat),
            integrationProcess =
              (json \ "integrationProcess").as(IntegrationProcessFormat)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: FreeWithQuotas): JsValue = Json.obj(
      "_id" -> UsagePlanIdFormat.writes(o.id),
      "maxPerSecond" -> o.maxPerSecond,
      "maxPerDay" -> o.maxPerDay,
      "maxPerMonth" -> o.maxPerMonth,
      "currency" -> o.currency.asJson,
      "billingDuration" -> o.billingDuration.asJson,
      "customName" -> o.customName
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "customDescription" -> o.customDescription
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "otoroshiTarget" -> o.otoroshiTarget
        .map(_.asJson)
        .getOrElse(JsNull)
        .as[JsValue],
      "allowMultipleKeys" -> o.allowMultipleKeys
        .map(JsBoolean.apply)
        .getOrElse(JsBoolean(false))
        .as[JsValue],
      "visibility" -> UsagePlanVisibilityFormat.writes(o.visibility),
      "authorizedTeams" -> SeqTeamIdFormat.writes(o.authorizedTeams),
      "autoRotation" -> o.autoRotation
        .map(JsBoolean.apply)
        .getOrElse(JsBoolean(false))
        .as[JsValue],
      "subscriptionProcess" -> SubscriptionProcessFormat.writes(
        o.subscriptionProcess),
      "integrationProcess" -> IntegrationProcessFormat.writes(
        o.integrationProcess)
    )
  }
  val QuotasWithLimitsFormat = new Format[QuotasWithLimits] {
    override def reads(json: JsValue): JsResult[QuotasWithLimits] =
      Try {
        JsSuccess(
          QuotasWithLimits(
            id = (json \ "_id").as(UsagePlanIdFormat),
            maxPerSecond = (json \ "maxPerSecond").as[Long],
            maxPerDay = (json \ "maxPerDay").as[Long],
            maxPerMonth = (json \ "maxPerMonth").as[Long],
            costPerMonth = (json \ "costPerMonth").as[BigDecimal],
            trialPeriod = (json \ "trialPeriod").asOpt(BillingDurationFormat),
            billingDuration =
              (json \ "billingDuration").as(BillingDurationFormat),
            currency = (json \ "currency").as(CurrencyFormat),
            customName = (json \ "customName").asOpt[String],
            customDescription = (json \ "customDescription").asOpt[String],
            otoroshiTarget =
              (json \ "otoroshiTarget").asOpt(OtoroshiTargetFormat),
            allowMultipleKeys = (json \ "allowMultipleKeys").asOpt[Boolean],
            visibility = (json \ "visibility")
              .asOpt(UsagePlanVisibilityFormat)
              .getOrElse(UsagePlanVisibility.Public),
            authorizedTeams = (json \ "authorizedTeams")
              .asOpt(SeqTeamIdFormat)
              .getOrElse(Seq.empty),
            autoRotation = (json \ "autoRotation")
              .asOpt[Boolean],
            subscriptionProcess =
              (json \ "subscriptionProcess").as(SubscriptionProcessFormat),
            integrationProcess =
              (json \ "integrationProcess").as(IntegrationProcessFormat)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: QuotasWithLimits): JsValue = Json.obj(
      "_id" -> UsagePlanIdFormat.writes(o.id),
      "maxPerSecond" -> o.maxPerSecond,
      "maxPerDay" -> o.maxPerDay,
      "maxPerMonth" -> o.maxPerMonth,
      "costPerMonth" -> o.costPerMonth,
      "billingDuration" -> o.billingDuration.asJson,
      "trialPeriod" -> o.trialPeriod
        .map(_.asJson)
        .getOrElse(JsNull)
        .as[JsValue],
      "currency" -> o.currency.asJson,
      "customName" -> o.customName
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "customDescription" -> o.customDescription
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "otoroshiTarget" -> o.otoroshiTarget
        .map(_.asJson)
        .getOrElse(JsNull)
        .as[JsValue],
      "allowMultipleKeys" -> o.allowMultipleKeys
        .map(JsBoolean.apply)
        .getOrElse(JsBoolean(false))
        .as[JsValue],
      "visibility" -> UsagePlanVisibilityFormat.writes(o.visibility),
      "authorizedTeams" -> SeqTeamIdFormat.writes(o.authorizedTeams),
      "autoRotation" -> o.autoRotation
        .map(JsBoolean.apply)
        .getOrElse(JsBoolean(false))
        .as[JsValue],
      "subscriptionProcess" -> SubscriptionProcessFormat.writes(
        o.subscriptionProcess),
      "integrationProcess" -> IntegrationProcessFormat.writes(
        o.integrationProcess)
    )
  }
  val QuotasWithoutLimitsFormat = new Format[QuotasWithoutLimits] {
    override def reads(json: JsValue): JsResult[QuotasWithoutLimits] =
      Try {
        JsSuccess(
          QuotasWithoutLimits(
            id = (json \ "_id").as(UsagePlanIdFormat),
            maxPerSecond = (json \ "maxPerSecond").as[Long],
            maxPerDay = (json \ "maxPerDay").as[Long],
            maxPerMonth = (json \ "maxPerMonth").as[Long],
            costPerMonth = (json \ "costPerMonth").as[BigDecimal],
            costPerAdditionalRequest =
              (json \ "costPerAdditionalRequest").as[BigDecimal],
            trialPeriod = (json \ "trialPeriod").asOpt(BillingDurationFormat),
            billingDuration =
              (json \ "billingDuration").as(BillingDurationFormat),
            currency = (json \ "currency").as(CurrencyFormat),
            customName = (json \ "customName").asOpt[String],
            customDescription = (json \ "customDescription").asOpt[String],
            otoroshiTarget =
              (json \ "otoroshiTarget").asOpt(OtoroshiTargetFormat),
            allowMultipleKeys = (json \ "allowMultipleKeys").asOpt[Boolean],
            visibility = (json \ "visibility")
              .asOpt(UsagePlanVisibilityFormat)
              .getOrElse(UsagePlanVisibility.Public),
            authorizedTeams = (json \ "authorizedTeams")
              .asOpt(SeqTeamIdFormat)
              .getOrElse(Seq.empty),
            autoRotation = (json \ "autoRotation")
              .asOpt[Boolean],
            subscriptionProcess =
              (json \ "subscriptionProcess").as(SubscriptionProcessFormat),
            integrationProcess =
              (json \ "integrationProcess").as(IntegrationProcessFormat)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: QuotasWithoutLimits): JsValue = Json.obj(
      "_id" -> UsagePlanIdFormat.writes(o.id),
      "maxPerSecond" -> o.maxPerSecond,
      "maxPerDay" -> o.maxPerDay,
      "maxPerMonth" -> o.maxPerMonth,
      "costPerMonth" -> o.costPerMonth,
      "costPerAdditionalRequest" -> o.costPerAdditionalRequest,
      "billingDuration" -> o.billingDuration.asJson,
      "trialPeriod" -> o.trialPeriod
        .map(_.asJson)
        .getOrElse(JsNull)
        .as[JsValue],
      "currency" -> o.currency.asJson,
      "customName" -> o.customName
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "customDescription" -> o.customDescription
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "otoroshiTarget" -> o.otoroshiTarget
        .map(_.asJson)
        .getOrElse(JsNull)
        .as[JsValue],
      "allowMultipleKeys" -> o.allowMultipleKeys
        .map(JsBoolean.apply)
        .getOrElse(JsBoolean(false))
        .as[JsValue],
      "visibility" -> UsagePlanVisibilityFormat.writes(o.visibility),
      "authorizedTeams" -> SeqTeamIdFormat.writes(o.authorizedTeams),
      "autoRotation" -> o.autoRotation
        .map(JsBoolean.apply)
        .getOrElse(JsBoolean(false))
        .as[JsValue],
      "subscriptionProcess" -> SubscriptionProcessFormat.writes(
        o.subscriptionProcess),
      "integrationProcess" -> IntegrationProcessFormat.writes(
        o.integrationProcess)
    )
  }
  val PayPerUseFormat = new Format[PayPerUse] {
    override def reads(json: JsValue): JsResult[PayPerUse] =
      Try {
        JsSuccess(
          PayPerUse(
            id = (json \ "_id").as(UsagePlanIdFormat),
            costPerMonth = (json \ "costPerMonth").as[BigDecimal],
            costPerRequest = (json \ "costPerRequest").as[BigDecimal],
            trialPeriod = (json \ "trialPeriod").asOpt(BillingDurationFormat),
            billingDuration =
              (json \ "billingDuration").as(BillingDurationFormat),
            currency = (json \ "currency").as(CurrencyFormat),
            customName = (json \ "customName").asOpt[String],
            customDescription = (json \ "customDescription").asOpt[String],
            otoroshiTarget =
              (json \ "otoroshiTarget").asOpt(OtoroshiTargetFormat),
            allowMultipleKeys = (json \ "allowMultipleKeys").asOpt[Boolean],
            visibility = (json \ "visibility")
              .asOpt(UsagePlanVisibilityFormat)
              .getOrElse(UsagePlanVisibility.Public),
            authorizedTeams = (json \ "authorizedTeams")
              .asOpt(SeqTeamIdFormat)
              .getOrElse(Seq.empty),
            autoRotation = (json \ "autoRotation")
              .asOpt[Boolean],
            subscriptionProcess =
              (json \ "subscriptionProcess").as(SubscriptionProcessFormat),
            integrationProcess =
              (json \ "integrationProcess").as(IntegrationProcessFormat)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: PayPerUse): JsValue = Json.obj(
      "_id" -> UsagePlanIdFormat.writes(o.id),
      "costPerMonth" -> o.costPerMonth,
      "costPerRequest" -> o.costPerRequest,
      "trialPeriod" -> o.trialPeriod
        .map(_.asJson)
        .getOrElse(JsNull)
        .as[JsValue],
      "billingDuration" -> o.billingDuration.asJson,
      "currency" -> o.currency.asJson,
      "customName" -> o.customName
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "customDescription" -> o.customDescription
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "otoroshiTarget" -> o.otoroshiTarget
        .map(_.asJson)
        .getOrElse(JsNull)
        .as[JsValue],
      "allowMultipleKeys" -> o.allowMultipleKeys
        .map(JsBoolean.apply)
        .getOrElse(JsBoolean(false))
        .as[JsValue],
      "visibility" -> UsagePlanVisibilityFormat.writes(o.visibility),
      "authorizedTeams" -> SeqTeamIdFormat.writes(o.authorizedTeams),
      "autoRotation" -> o.autoRotation
        .map(JsBoolean.apply)
        .getOrElse(JsBoolean(false))
        .as[JsValue],
      "subscriptionProcess" -> SubscriptionProcessFormat.writes(
        o.subscriptionProcess),
      "integrationProcess" -> IntegrationProcessFormat.writes(
        o.integrationProcess)
    )
  }
  val OtoroshiApiKeyFormat = new Format[OtoroshiApiKey] {
    override def reads(json: JsValue): JsResult[OtoroshiApiKey] =
      Try {
        JsSuccess(
          OtoroshiApiKey(
            clientName = (json \ "clientName").as[String],
            clientId = (json \ "clientId").as[String],
            clientSecret = (json \ "clientSecret").as[String]
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: OtoroshiApiKey): JsValue = Json.obj(
      "clientName" -> o.clientName,
      "clientId" -> o.clientId,
      "clientSecret" -> o.clientSecret
    )
  }
  val CurrencyFormat = new Format[Currency] {
    override def reads(json: JsValue): JsResult[Currency] =
      Try {
        JsSuccess(
          Currency(
            code = (json \ "code").as[String]
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: Currency): JsValue = Json.obj(
      "code" -> o.code,
    )
  }
  val AskedMetadataFormat = new Format[AskedMetadata] {
    override def reads(json: JsValue): JsResult[AskedMetadata] =
      Try {
        JsSuccess(
          AskedMetadata(
            key = (json \ "key").as[String],
            possibleValues = (json \ "possibleValues")
              .asOpt[Seq[String]]
              .map(_.toSet)
              .getOrElse(Set.empty)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: AskedMetadata): JsValue = Json.obj(
      "key" -> o.key,
      "possibleValues" -> JsArray(o.possibleValues.map(JsString.apply).toSeq)
    )

  }
  val ApikeyCustomizationFormat = new Format[ApikeyCustomization] {
    override def reads(json: JsValue): JsResult[ApikeyCustomization] =
      Try {
        JsSuccess(
          ApikeyCustomization(
            dynamicPrefix = (json \ "dynamicPrefix").asOpt[String],
            clientIdOnly =
              (json \ "clientIdOnly").asOpt[Boolean].getOrElse(false),
            readOnly = (json \ "readOnly").asOpt[Boolean].getOrElse(false),
            constrainedServicesOnly = (json \ "constrainedServicesOnly")
              .asOpt[Boolean]
              .getOrElse(false),
            metadata = (json \ "metadata").asOpt[JsObject].getOrElse(Json.obj()),
            askedMetadata = (json \ "askedMetadata").as(SeqAskedMetadataFormat),
            tags = (json \ "tags").asOpt[JsArray].getOrElse(Json.arr()),
            restrictions = (json \ "restrictions").as(ApiKeyRestrictionsFormat),
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: ApikeyCustomization): JsValue = Json.obj(
      "dynamicPrefix" -> o.dynamicPrefix
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "clientIdOnly" -> o.clientIdOnly,
      "constrainedServicesOnly" -> o.constrainedServicesOnly,
      "readOnly" -> o.readOnly,
      "metadata" -> o.metadata,
      "askedMetadata" -> JsArray(o.askedMetadata.map(AskedMetadataFormat.writes)),
      "tags" -> o.tags,
      "restrictions" -> o.restrictions.asJson
    )
  }
  val ApiKeyRestrictionsFormat = new Format[ApiKeyRestrictions] {
    override def writes(o: ApiKeyRestrictions): JsValue = Json.obj(
      "enabled" -> o.enabled,
      "allowLast" -> o.allowLast,
      "allowed" -> JsArray(o.allowed.map(_.asJson)),
      "forbidden" -> JsArray(o.forbidden.map(_.asJson)),
      "notFound" -> JsArray(o.notFound.map(_.asJson)),
    )
    override def reads(json: JsValue): JsResult[ApiKeyRestrictions] =
      Try {
        JsSuccess(
          ApiKeyRestrictions(
            enabled = (json \ "enabled").asOpt[Boolean].getOrElse(false),
            allowLast = (json \ "allowLast").asOpt[Boolean].getOrElse(true),
            allowed = (json \ "allowed")
              .asOpt[JsArray]
              .map(
                _.value
                  .map(p => ApiKeyRestrictionPathFormat.reads(p))
                  .collect {
                    case JsSuccess(rp, _) => rp
                  }
                  .toSeq)
              .getOrElse(Seq.empty),
            forbidden = (json \ "forbidden")
              .asOpt[JsArray]
              .map(
                _.value
                  .map(p => ApiKeyRestrictionPathFormat.reads(p))
                  .collect {
                    case JsSuccess(rp, _) => rp
                  }
                  .toSeq)
              .getOrElse(Seq.empty),
            notFound = (json \ "notFound")
              .asOpt[JsArray]
              .map(
                _.value
                  .map(p => ApiKeyRestrictionPathFormat.reads(p))
                  .collect {
                    case JsSuccess(rp, _) => rp
                  }
                  .toSeq)
              .getOrElse(Seq.empty)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
  }
  val ApiKeyRestrictionPathFormat = new Format[ApiKeyRestrictionPath] {
    override def writes(o: ApiKeyRestrictionPath): JsValue = Json.obj(
      "method" -> o.method,
      "path" -> o.path,
    )
    override def reads(json: JsValue): JsResult[ApiKeyRestrictionPath] =
      Try {
        JsSuccess(
          ApiKeyRestrictionPath(
            method = (json \ "method").as[String],
            path = (json \ "path").as[String]
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
  }
  val OtoroshiTargetFormat = new Format[OtoroshiTarget] {
    override def reads(json: JsValue): JsResult[OtoroshiTarget] = {
      Try {
        JsSuccess(
          OtoroshiTarget(
            otoroshiSettings =
              (json \ "otoroshiSettings").as(OtoroshiSettingsIdFormat),
            serviceGroup =
              (json \ "serviceGroup").as(OtoroshiServiceGroupIdFormat),
            apikeyCustomization = (json \ "apikeyCustomization")
              .asOpt(ApikeyCustomizationFormat)
              .getOrElse(ApikeyCustomization())
          )
        )
      } recover {
        case e =>
          JsError(e.getMessage)
      } get
    }
    override def writes(o: OtoroshiTarget): JsValue = Json.obj(
      "otoroshiSettings" -> o.otoroshiSettings.asJson,
      "serviceGroup" -> o.serviceGroup.asJson,
      "apikeyCustomization" -> o.apikeyCustomization.asJson
    )
  }
  val OtoroshiServiceFormat = new Format[OtoroshiService] {
    override def reads(json: JsValue): JsResult[OtoroshiService] =
      Try {
        JsSuccess(
          OtoroshiService(
            name = (json \ "name").as[String],
            otoroshiSettings =
              (json \ "otoroshiSettings").as(OtoroshiSettingsIdFormat),
            service = (json \ "service").as(OtoroshiServiceIdFormat)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: OtoroshiService): JsValue = Json.obj(
      "name" -> o.name,
      "otoroshiSettings" -> o.otoroshiSettings.asJson,
      "service" -> o.service.asJson
    )
  }
  val SwaggerAccessFormat = new Format[SwaggerAccess] {
    override def reads(json: JsValue): JsResult[SwaggerAccess] =
      Try {
        JsSuccess(
          SwaggerAccess(
            url = (json \ "url").as[String],
            content = (json \ "content").asOpt[String],
            headers = (json \ "headers")
              .asOpt[Map[String, String]]
              .getOrElse(Map.empty[String, String])
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: SwaggerAccess): JsValue = Json.obj(
      "url" -> o.url,
      "content" -> o.content,
      "headers" -> o.headers
    )
  }
  val ApiDocumentationPageFormat = new Format[ApiDocumentationPage] {
    override def reads(json: JsValue): JsResult[ApiDocumentationPage] =
      Try {
        JsSuccess(
          ApiDocumentationPage(
            id = (json \ "_id").as(ApiDocumentationPageIdFormat),
            tenant = (json \ "_tenant").as(TenantIdFormat),
            deleted = (json \ "_deleted").asOpt[Boolean].getOrElse(false),
            // api = (json \ "api").as(ApiIdFormat),
            title = (json \ "title").as[String],
            // index = (json \ "index").as[Double],
            level = (json \ "level").as[Int],
            lastModificationAt =
              (json \ "lastModificationAt").as(DateTimeFormat),
            content = (json \ "content").asOpt[String].getOrElse(""),
            remoteContentEnabled =
              (json \ "remoteContentEnabled").asOpt[Boolean].getOrElse(false),
            contentType =
              (json \ "contentType").asOpt[String].getOrElse("text/markdown"),
            remoteContentUrl = (json \ "remoteContentUrl").asOpt[String],
            remoteContentHeaders = (json \ "remoteContentHeaders")
              .asOpt[Map[String, String]]
              .getOrElse(Map.empty[String, String])
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: ApiDocumentationPage): JsValue = Json.obj(
      "_id" -> ApiDocumentationPageIdFormat.writes(o.id),
      "_humanReadableId" -> o.humanReadableId,
      "_tenant" -> o.tenant.asJson,
      "_deleted" -> o.deleted,
      "title" -> o.title,
      // "index"              -> o.index,
      "level" -> o.level,
      "lastModificationAt" -> DateTimeFormat.writes(o.lastModificationAt),
      "content" -> o.content,
      "remoteContentEnabled" -> o.remoteContentEnabled,
      "contentType" -> o.contentType,
      "remoteContentUrl" -> o.remoteContentUrl
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "remoteContentHeaders" -> JsObject(
        o.remoteContentHeaders.view.mapValues(JsString.apply).toSeq),
      // "api" -> o.api.asJson,
    )
  }
  val ApiDocumentationFormat = new Format[ApiDocumentation] {
    override def reads(json: JsValue): JsResult[ApiDocumentation] =
      Try {
        JsSuccess(
          ApiDocumentation(
            id = (json \ "_id").as(ApiDocumentationIdFormat),
            tenant = (json \ "_tenant").as(TenantIdFormat),
            //api = (json \ "api").as(ApiIdFormat),
            pages = (json \ "pages")
              .asOpt(SeqApiDocumentationPageIdFormat)
              .getOrElse(Seq.empty[ApiDocumentationPageId]),
            lastModificationAt =
              (json \ "lastModificationAt").as(DateTimeFormat)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: ApiDocumentation): JsValue = Json.obj(
      "_id" -> ApiDocumentationIdFormat.writes(o.id),
      "_tenant" -> o.tenant.asJson,
      //"api" -> o.api.asJson,
      "pages" -> JsArray(o.pages.map(ApiDocumentationPageIdFormat.writes)),
      "lastModificationAt" -> DateTimeFormat.writes(o.lastModificationAt),
    )
  }
  val DaikokuStyleFormat = new Format[DaikokuStyle] {
    override def reads(json: JsValue): JsResult[DaikokuStyle] =
      Try {
        JsSuccess(
          DaikokuStyle(
            js = (json \ "js").asOpt[String].getOrElse(""),
            css = (json \ "css").asOpt[String].getOrElse(""),
            colorTheme = (json \ "colorTheme")
              .asOpt[String]
              .getOrElse(DaikokuStyle().colorTheme),
            jsUrl = (json \ "jsUrl").asOpt[String],
            cssUrl = (json \ "cssUrl").asOpt[String],
            faviconUrl = (json \ "faviconUrl").asOpt[String],
            fontFamilyUrl = (json \ "fontFamilyUrl").asOpt[String],
            title = (json \ "title").asOpt[String].getOrElse("New Organization"),
            description = (json \ "description")
              .asOpt[String]
              .getOrElse("A new organization to host very fine APIs"),
            unloggedHome = (json \ "unloggedHome").asOpt[String].getOrElse(""),
            homePageVisible =
              (json \ "homePageVisible").asOpt[Boolean].getOrElse(false),
            logo = (json \ "logo")
              .asOpt[String]
              .getOrElse("/assets/images/daikoku.svg"),
            footer = (json \ "footer")
              .asOpt[String]
          ))
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: DaikokuStyle): JsValue = Json.obj(
      "css" -> o.css,
      "colorTheme" -> o.colorTheme,
      "js" -> o.js,
      "jsUrl" -> o.jsUrl.map(JsString.apply).getOrElse(JsNull).as[JsValue],
      "cssUrl" -> o.cssUrl.map(JsString.apply).getOrElse(JsNull).as[JsValue],
      "faviconUrl" -> o.faviconUrl
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "fontFamilyUrl" -> o.fontFamilyUrl
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "title" -> o.title,
      "description" -> o.description,
      "unloggedHome" -> o.unloggedHome,
      "homePageVisible" -> o.homePageVisible,
      "logo" -> o.logo,
      "footer" -> o.footer
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
    )
  }
  val TenantFormat = new Format[Tenant] {
    override def reads(json: JsValue): JsResult[Tenant] =
      Try {
        JsSuccess(
          Tenant(
            id = (json \ "_id").as(TenantIdFormat),
            enabled = (json \ "enabled").as[Boolean],
            deleted = (json \ "_deleted").asOpt[Boolean].getOrElse(false),
            name = (json \ "name").as[String],
            domain = (json \ "domain").asOpt[String].getOrElse("localhost"),
            defaultLanguage = (json \ "defaultLanguage").asOpt[String],
            contact = (json \ "contact").as[String],
            style = (json \ "style").asOpt(DaikokuStyleFormat),
            otoroshiSettings = (json \ "otoroshiSettings")
              .asOpt(SeqOtoroshiSettingsFormat)
              .map(_.toSet)
              .getOrElse(Set.empty),
            mailerSettings =
              (json \ "mailerSettings").asOpt[JsObject].flatMap { settings =>
                (settings \ "type").as[String] match {
                  case "mailgun" => MailgunSettingsFormat.reads(settings).asOpt
                  case "mailjet" => MailjetSettingsFormat.reads(settings).asOpt
                  case _         => Some(ConsoleMailerSettings())
                }
              },
            bucketSettings =
              (json \ "bucketSettings").asOpt[JsObject].flatMap { settings =>
                S3Configuration.format.reads(settings).asOpt
              },
            authProvider = (json \ "authProvider")
              .asOpt[String]
              .flatMap(AuthProvider.apply)
              .getOrElse(AuthProvider.Otoroshi),
            auditTrailConfig = (json \ "auditTrailConfig")
              .asOpt(AuditTrailConfigFormat)
              .getOrElse(AuditTrailConfig()),
            authProviderSettings = (json \ "authProviderSettings")
              .asOpt[JsObject]
              .getOrElse(
                Json.obj(
                  "claimSecret" -> Option(
                    System.getenv("DAIKOKU_OTOROSHI_CLAIM_SECRET"))
                    .orElse(Option(System.getenv("CLAIM_SHAREDKEY")))
                    .getOrElse("secret")
                    .asInstanceOf[String],
                  "claimHeaderName" -> Option(
                    System.getenv("DAIKOKU_OTOROSHI_CLAIM_HEADER_NAME"))
                    .getOrElse("Otoroshi-Claim")
                    .asInstanceOf[String]
                )
              ),
            isPrivate = (json \ "isPrivate").asOpt[Boolean].getOrElse(true),
            adminApi = (json \ "adminApi").as(ApiIdFormat),
            adminSubscriptions = (json \ "adminSubscriptions")
              .asOpt(SeqApiSubscriptionIdFormat)
              .getOrElse(Seq.empty)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: Tenant): JsValue = Json.obj(
      "_id" -> TenantIdFormat.writes(o.id),
      "_humanReadableId" -> o.name.urlPathSegmentSanitized,
      "_deleted" -> o.deleted,
      "name" -> o.name,
      "domain" -> o.domain,
      "defaultLanguage" -> o.defaultLanguage.fold(JsNull.as[JsValue])(
        JsString.apply),
      "enabled" -> o.enabled,
      "contact" -> o.contact,
      "style" -> o.style.map(_.asJson).getOrElse(JsNull).as[JsValue],
      "otoroshiSettings" -> JsArray(o.otoroshiSettings.map(_.asJson).toSeq),
      "mailerSettings" -> o.mailerSettings
        .map(_.asJson)
        .getOrElse(JsNull)
        .as[JsValue],
      "bucketSettings" -> o.bucketSettings
        .map(_.asJson)
        .getOrElse(JsNull)
        .as[JsValue],
      "authProvider" -> o.authProvider.name,
      "authProviderSettings" -> o.authProviderSettings,
      "auditTrailConfig" -> o.auditTrailConfig.asJson,
      "isPrivate" -> o.isPrivate,
      "adminApi" -> o.adminApi.asJson,
      "adminSubscriptions" -> JsArray(
        o.adminSubscriptions.map(ApiSubscriptionIdFormat.writes))
    )
  }
  val AuditTrailConfigFormat = new Format[AuditTrailConfig] {
    override def reads(json: JsValue): JsResult[AuditTrailConfig] =
      Try {
        JsSuccess(
          AuditTrailConfig(
            elasticConfigs = (json \ "elasticConfigs")
              .asOpt[Seq[ElasticAnalyticsConfig]](
                Reads.seq(ElasticAnalyticsConfig.format))
              .getOrElse(Seq.empty[ElasticAnalyticsConfig]),
            auditWebhooks = (json \ "auditWebhooks")
              .asOpt[Seq[Webhook]](Reads.seq(Webhook.format))
              .getOrElse(Seq.empty[Webhook]),
            alertsEmails = (json \ "alertsEmails")
              .asOpt[Seq[String]]
              .getOrElse(Seq.empty[String]),
            kafkaConfig =
              (json \ "kafkaConfig").asOpt[JsValue].flatMap { config =>
                (
                  (config \ "servers").asOpt[Seq[String]].filter(_.nonEmpty),
                  (config \ "keyPass").asOpt[String],
                  (config \ "keystore").asOpt[String],
                  (config \ "truststore").asOpt[String],
                  (config \ "auditTopic").asOpt[String].filter(_.nonEmpty)
                ) match {
                  case (Some(servers),
                        keyPass,
                        keystore,
                        truststore,
                        Some(auditTopic)) =>
                    Some(
                      KafkaConfig(servers,
                                  keyPass,
                                  keystore,
                                  truststore,
                                  auditTopic))
                  case e => None
                }
              }
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: AuditTrailConfig): JsValue = Json.obj(
      "elasticConfigs" -> JsArray(o.elasticConfigs.map(_.toJson)),
      "auditWebhooks" -> JsArray(o.auditWebhooks.map(_.toJson)),
      "alertsEmails" -> JsArray(o.alertsEmails.map(JsString.apply)),
      "kafkaConfig" -> o.kafkaConfig,
    )
  }

  object DaikokuHeader {
    def jsonHeader(tenantId: TenantId)(implicit env: Env): JsObject = {
      Json.obj(
        "daikokuHeader" -> Json.obj(
          "name" -> "Daikoku-Tenant",
          "value" -> JWT
            .create()
            .withClaim("value", tenantId.value)
            .sign(env.config.hmac512Alg)
        )
      )
    }
  }

  val UserFormat = new Format[User] {
    override def reads(json: JsValue): JsResult[User] =
      Try {
        JsSuccess(
          User(
            id = (json \ "_id").as(UserIdFormat),
            deleted = (json \ "_deleted").asOpt[Boolean].getOrElse(false),
            tenants = (json \ "tenants")
              .asOpt(SeqTenantIdFormat)
              .map(_.toSet)
              .getOrElse(Set.empty),
            origins = (json \ "origins")
              .asOpt[Seq[String]]
              .map(
                seq =>
                  seq
                    .map(AuthProvider.apply)
                    .filter(_.isDefined)
                    .map(_.get)
                    .toSet)
              .getOrElse(Set.empty),
            name = (json \ "name").as[String],
            email = (json \ "email").as[String],
            picture = (json \ "picture")
              .asOpt[String]
              .getOrElse((json \ "email").as[String].gravatar),
            password = (json \ "password").asOpt[String],
            hardwareKeyRegistrations = (json \ "hardwareKeyRegistrations")
              .asOpt[Seq[JsObject]]
              .getOrElse(Seq.empty[JsObject]),
            isDaikokuAdmin =
              (json \ "isDaikokuAdmin").asOpt[Boolean].getOrElse(false),
            personalToken = (json \ "personalToken").asOpt[String],
            lastTenant = (json \ "lastTenant").asOpt(TenantIdFormat),
            metadata = (json \ "metadata")
              .asOpt[Map[String, String]]
              .getOrElse(Map.empty),
            defaultLanguage = (json \ "defaultLanguage").asOpt[String]
            //lastTeams = (json \ "lastTeams").asOpt[Map[String, String]].map(_.map(value => (TenantId(value._1), TeamId(value._2)))).getOrElse(Map.empty)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: User): JsValue = Json.obj(
      "_id" -> UserIdFormat.writes(o.id),
      "_humanReadableId" -> o.email.urlPathSegmentSanitized,
      "_deleted" -> o.deleted,
      "tenants" -> SeqTenantIdFormat.writes(o.tenants.toSeq),
      "origins" -> JsArray(o.origins.toSeq.map(o => JsString(o.name))),
      // "ownTeam" -> TeamIdFormat.writes(o.ownTeam),
      "name" -> o.name,
      "email" -> o.email,
      "picture" -> o.picture,
      "password" -> o.password,
      "isDaikokuAdmin" -> o.isDaikokuAdmin,
      "personalToken" -> o.personalToken
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue],
      "hardwareKeyRegistrations" -> JsArray(o.hardwareKeyRegistrations),
      "lastTenant" -> o.lastTenant.map(_.asJson).getOrElse(JsNull).as[JsValue],
      "metadata" -> JsObject(o.metadata.view.mapValues(JsString.apply).toSeq),
      "defaultLanguage" -> o.defaultLanguage.fold(JsNull.as[JsValue])(
        JsString.apply),
      "isGuest" -> o.isGuest
      //"lastTeams"                -> o.lastTeams.map(item => (item._1.value, item._2.value))
    )
  }

  val TeamFormat = new Format[Team] {
    override def reads(json: JsValue): JsResult[Team] =
      Try {
        JsSuccess(
          Team(
            id = (json \ "_id").as(TeamIdFormat),
            tenant = (json \ "_tenant").as(TenantIdFormat),
            deleted = (json \ "_deleted").asOpt[Boolean].getOrElse(false),
            `type` = (json \ "type").as(TeamTypeFormat),
            name = (json \ "name").as[String],
            contact = (json \ "contact").as[String],
            description = (json \ "description").asOpt[String].getOrElse(""),
            avatar = (json \ "avatar").asOpt[String],
            users = (json \ "users")
              .asOpt(SetUserWithPermissionFormat)
              .map(_.toSet)
              .getOrElse(Set.empty[UserWithPermission]),
            subscriptions = (json \ "subscriptions")
              .asOpt(SeqApiSubscriptionIdFormat)
              .getOrElse(Seq.empty[ApiSubscriptionId]),
            authorizedOtoroshiGroups = (json \ "authorizedOtoroshiGroups")
              .asOpt(SeqOtoroshiGroupFormat)
              .map(_.toSet)
              .getOrElse(Set.empty[OtoroshiGroup]),
            metadata = (json \ "metadata")
              .asOpt[Map[String, String]]
              .getOrElse(Map.empty),
            showApiKeyOnlyToAdmins = (json \ "showApiKeyOnlyToAdmins")
              .asOpt[Boolean]
              .getOrElse(true)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: Team): JsValue = Json.obj(
      "_id" -> TeamIdFormat.writes(o.id),
      "_humanReadableId" -> o.name.urlPathSegmentSanitized,
      "_tenant" -> o.tenant.asJson,
      "_deleted" -> o.deleted,
      "type" -> TeamTypeFormat.writes(o.`type`),
      "name" -> o.name,
      "description" -> o.description,
      "contact" -> o.contact,
      "avatar" -> o.avatar.map(JsString.apply).getOrElse(JsNull).as[JsValue],
      "users" -> JsArray(o.users.map(UserWithPermissionFormat.writes).toSeq),
      "subscriptions" -> JsArray(
        o.subscriptions.map(ApiSubscriptionIdFormat.writes)),
      "authorizedOtoroshiGroups" -> JsArray(
        o.authorizedOtoroshiGroups.map(OtoroshiGroupFormat.writes).toSeq),
      "showApiKeyOnlyToAdmins" -> o.showApiKeyOnlyToAdmins,
      "metadata" -> JsObject(o.metadata.view.mapValues(JsString.apply).toSeq),
    )
  }

  val ApiFormat = new Format[Api] {
    override def reads(json: JsValue): JsResult[Api] =
      Try {
        JsSuccess(
          Api(
            id = (json \ "_id").as(ApiIdFormat),
            tenant = (json \ "_tenant").as(TenantIdFormat),
            team = (json \ "team").as(TeamIdFormat),
            deleted = (json \ "_deleted").asOpt[Boolean].getOrElse(false),
            name = (json \ "name").as[String],
            lastUpdate = (json \ "lastUpdate").as(DateTimeFormat),
            description = (json \ "description").asOpt[String].getOrElse(""),
            smallDescription =
              (json \ "smallDescription").asOpt[String].getOrElse(""),
            currentVersion = (json \ "currentVersion").as(VersionFormat),
            supportedVersions = (json \ "supportedVersions")
              .asOpt(SeqVersionFormat)
              .map(_.toSet)
              .getOrElse(Set.empty),
            published = (json \ "published").asOpt[Boolean].getOrElse(false),
            testing =
              (json \ "testing").asOpt(TestingFormat).getOrElse(Testing()),
            documentation = (json \ "documentation")
              .as(ApiDocumentationFormat),
            swagger = (json \ "swagger").asOpt(SwaggerAccessFormat),
            //serviceGroup = (json \ "serviceGroup").asOpt(OtoroshiServiceGroupIdFormat),
            tags = (json \ "tags")
              .asOpt[Seq[String]]
              .map(_.toSet)
              .getOrElse(Set.empty),
            categories = (json \ "categories")
              .asOpt[Seq[String]]
              .map(_.toSet)
              .getOrElse(Set.empty),
            visibility = (json \ "visibility").as(ApiVisibilityFormat),
            possibleUsagePlans = (json \ "possibleUsagePlans")
              .as(SeqUsagePlanFormat),
            defaultUsagePlan = (json \ "defaultUsagePlan").as(UsagePlanIdFormat),
            subscriptions = (json \ "subscriptions")
              .asOpt(SeqApiSubscriptionIdFormat)
              .getOrElse(Seq.empty),
            authorizedTeams = (json \ "authorizedTeams")
              .asOpt(SeqTeamIdFormat)
              .getOrElse(Seq.empty)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: Api): JsValue = Json.obj(
      "_id" -> ApiIdFormat.writes(o.id),
      "_humanReadableId" -> o.name.urlPathSegmentSanitized,
      "_tenant" -> o.tenant.asJson,
      "team" -> TeamIdFormat.writes(o.team),
      "_deleted" -> o.deleted,
      "lastUpdate" -> DateTimeFormat.writes(o.lastUpdate),
      "name" -> o.name,
      "smallDescription" -> o.smallDescription,
      "description" -> o.description,
      "currentVersion" -> VersionFormat.writes(o.currentVersion),
      "supportedVersions" -> JsArray(o.supportedVersions.map(_.asJson).toSeq),
      "published" -> o.published,
      "testing" -> o.testing.asJson,
      "documentation" -> o.documentation.asJson,
      "swagger" -> o.swagger
        .map(SwaggerAccessFormat.writes)
        .getOrElse(JsNull)
        .as[JsValue],
      //"serviceGroup" -> o.serviceGroup.map(_.asJson).getOrElse(JsNull).as[JsValue],
      "tags" -> JsArray(o.tags.map(JsString.apply).toSeq),
      "categories" -> JsArray(o.categories.map(JsString.apply).toSeq),
      "visibility" -> ApiVisibilityFormat.writes(o.visibility),
      "possibleUsagePlans" -> JsArray(
        o.possibleUsagePlans.map(UsagePlanFormat.writes)),
      "defaultUsagePlan" -> UsagePlanIdFormat.writes(o.defaultUsagePlan),
      "subscriptions" -> JsArray(
        o.subscriptions.map(ApiSubscriptionIdFormat.writes)),
      "authorizedTeams" -> JsArray(o.authorizedTeams.map(TeamIdFormat.writes))
    )
  }

  val ApiKeyRotationFormat: Format[ApiKeyRotation] =
    new Format[ApiKeyRotation] {
      override def reads(json: JsValue): JsResult[ApiKeyRotation] =
        Try {
          JsSuccess(
            ApiKeyRotation(
              enabled = (json \ "enabled").as[Boolean],
              rotationEvery = (json \ "rotationEvery").as[Long],
              gracePeriod = (json \ "gracePeriod").as[Long],
              nextSecret = (json \ "nextSecret").asOpt[String]
            )
          )
        } recover {
          case e => JsError(e.getMessage)
        } get

      override def writes(o: ApiKeyRotation): JsValue = Json.obj(
        "enabled" -> o.enabled,
        "rotationEvery" -> o.rotationEvery,
        "gracePeriod" -> o.gracePeriod,
        "nextSecret" -> o.nextSecret
      )
    }

  val ApiSubscriptionyRotationFormat = new Format[ApiSubscriptionRotation] {
    override def reads(json: JsValue): JsResult[ApiSubscriptionRotation] =
      Try {
        JsSuccess(
          ApiSubscriptionRotation(
            enabled = (json \ "enabled").as[Boolean],
            rotationEvery = (json \ "rotationEvery").as[Long],
            gracePeriod = (json \ "gracePeriod").as[Long],
            pendingRotation = (json \ "pendingRotation").as[Boolean]
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get

    override def writes(o: ApiSubscriptionRotation): JsValue = Json.obj(
      "enabled" -> o.enabled,
      "rotationEvery" -> o.rotationEvery,
      "gracePeriod" -> o.gracePeriod,
      "pendingRotation" -> o.pendingRotation
    )
  }

  val ApiSubscriptionFormat = new Format[ApiSubscription] {
    override def reads(json: JsValue): JsResult[ApiSubscription] =
      Try {
        JsSuccess(
          ApiSubscription(
            id = (json \ "_id").as(ApiSubscriptionIdFormat),
            tenant = (json \ "_tenant").as(TenantIdFormat),
            deleted = (json \ "_deleted").asOpt[Boolean].getOrElse(false),
            apiKey = (json \ "apiKey").as(OtoroshiApiKeyFormat),
            plan = (json \ "plan").as(UsagePlanIdFormat),
            team = (json \ "team").as(TeamIdFormat),
            api = (json \ "api").as(ApiIdFormat),
            createdAt = (json \ "createdAt").as(DateTimeFormat),
            by = (json \ "by").as(UserIdFormat),
            customName = (json \ "customName").asOpt[String],
            enabled = (json \ "enabled").asOpt[Boolean].getOrElse(true),
            rotation = (json \ "rotation").asOpt(ApiSubscriptionyRotationFormat),
            integrationToken = (json \ "integrationToken").as[String]
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: ApiSubscription): JsValue = Json.obj(
      "_id" -> ApiSubscriptionIdFormat.writes(o.id),
      "_tenant" -> o.tenant.asJson,
      "_deleted" -> o.deleted,
      "apiKey" -> OtoroshiApiKeyFormat.writes(o.apiKey),
      "plan" -> UsagePlanIdFormat.writes(o.plan),
      "team" -> TeamIdFormat.writes(o.team),
      "api" -> ApiIdFormat.writes(o.api),
      "createdAt" -> DateTimeFormat.writes(o.createdAt),
      "by" -> UserIdFormat.writes(o.by),
      "customName" -> o.customName
        .map(id => JsString(id))
        .getOrElse(JsNull)
        .as[JsValue],
      "enabled" -> o.enabled,
      "rotation" -> o.rotation
        .map(ApiSubscriptionyRotationFormat.writes)
        .getOrElse(JsNull)
        .as[JsValue],
      "integrationToken" -> o.integrationToken
    )
  }

  val ActualOtoroshiApiKeyFormat: Format[ActualOtoroshiApiKey] =
    new Format[ActualOtoroshiApiKey] {
      override def writes(apk: ActualOtoroshiApiKey): JsValue = Json.obj(
        "clientId" -> apk.clientId,
        "clientSecret" -> apk.clientSecret,
        "clientName" -> apk.clientName,
        "authorizedGroup" -> apk.authorizedGroup,
        "enabled" -> apk.enabled,
        "allowClientIdOnly" -> apk.allowClientIdOnly,
        "constrainedServicesOnly" -> apk.constrainedServicesOnly,
        "readOnly" -> apk.readOnly,
        "throttlingQuota" -> apk.throttlingQuota,
        "dailyQuota" -> apk.dailyQuota,
        "monthlyQuota" -> apk.monthlyQuota,
        "metadata" -> JsObject(
          apk.metadata.view.mapValues(JsString.apply).toSeq),
        "tags" -> JsArray(apk.tags.map(JsString.apply)),
        "restrictions" -> apk.restrictions.asJson,
        "rotation" -> apk.rotation
          .map(ApiKeyRotationFormat.writes)
          .getOrElse(JsNull)
          .as[JsValue]
      )
      override def reads(json: JsValue): JsResult[ActualOtoroshiApiKey] =
        Try {
          ActualOtoroshiApiKey(
            clientId = (json \ "clientId").as[String],
            clientSecret = (json \ "clientSecret").as[String],
            clientName = (json \ "clientName").as[String],
            authorizedGroup = (json \ "authorizedGroup").as[String],
            enabled = (json \ "enabled").asOpt[Boolean].getOrElse(true),
            allowClientIdOnly =
              (json \ "allowClientIdOnly").asOpt[Boolean].getOrElse(false),
            readOnly = (json \ "readOnly").asOpt[Boolean].getOrElse(false),
            throttlingQuota = (json \ "throttlingQuota")
              .asOpt[Long]
              .getOrElse(RemainingQuotas.MaxValue),
            dailyQuota = (json \ "dailyQuota")
              .asOpt[Long]
              .getOrElse(RemainingQuotas.MaxValue),
            monthlyQuota = (json \ "monthlyQuota")
              .asOpt[Long]
              .getOrElse(RemainingQuotas.MaxValue),
            metadata = (json \ "metadata")
              .asOpt[Map[String, String]]
              .getOrElse(Map.empty[String, String]),
            constrainedServicesOnly = (json \ "constrainedServicesOnly")
              .asOpt[Boolean]
              .getOrElse(false),
            tags = (json \ "tags")
              .asOpt[JsArray]
              .map(_.value.map(_.as[String]).toSeq)
              .getOrElse(Seq.empty[String]),
            restrictions = (json \ "restrictions").as(ApiKeyRestrictionsFormat),
            rotation = (json \ "rotation").asOpt(ApiKeyRotationFormat)
          )
        } map {
          case sd => JsSuccess(sd)
        } recover {
          case t => JsError(t.getMessage)
        } get
    }

  val NotificationIdFormat: Format[NotificationId] =
    new Format[NotificationId] {
      override def reads(json: JsValue): JsResult[NotificationId] =
        Try {
          JsSuccess(NotificationId(json.as[String]))
        } recover {
          case e => JsError(e.getMessage)
        } get
      override def writes(o: NotificationId): JsValue = JsString(o.value)
    }

  val UserSessionIdFormat: Format[UserSessionId] = new Format[UserSessionId] {
    override def reads(json: JsValue): JsResult[UserSessionId] =
      Try {
        JsSuccess(UserSessionId(json.as[String]))
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: UserSessionId): JsValue = JsString(o.value)
  }

  val NotificationActionFormat: Format[NotificationAction] =
    new Format[NotificationAction] {
      override def reads(json: JsValue) = (json \ "type").as[String] match {
        case "ApiAccess"       => ApiAccessFormat.reads(json)
        case "TeamAccess"      => TeamAccessFormat.reads(json)
        case "ApiSubscription" => ApiSubscriptionDemandFormat.reads(json)
        case "OtoroshiSyncSubscriptionError" =>
          OtoroshiSyncSubscriptionErrorFormat.reads(json)
        case "OtoroshiSyncApiError" => OtoroshiSyncApiErrorFormat.reads(json)
        case "ApiKeyDeletionInformation" =>
          ApiKeyDeletionInformationFormat.reads(json)
        case "ApiKeyRotationInProgress" =>
          ApiKeyRotationInProgressFormat.reads(json)
        case "ApiKeyRotationEnded" => ApiKeyRotationEndedFormat.reads(json)
        case "TeamInvitation"      => TeamInvitationFormat.reads(json)
        case str                   => JsError(s"Bad notification value: $str")
      }
      override def writes(o: NotificationAction) = o match {
        case p: ApiAccess =>
          ApiAccessFormat.writes(p).as[JsObject] ++ Json.obj(
            "type" -> "ApiAccess")
        case p: TeamAccess =>
          TeamAccessFormat.writes(p).as[JsObject] ++ Json.obj(
            "type" -> "TeamAccess")
        case p: ApiSubscriptionDemand =>
          ApiSubscriptionDemandFormat.writes(p).as[JsObject] ++ Json.obj(
            "type" -> "ApiSubscription")
        case p: OtoroshiSyncSubscriptionError =>
          OtoroshiSyncSubscriptionErrorFormat.writes(p).as[JsObject] ++ Json
            .obj("type" -> "OtoroshiSyncSubscriptionError")
        case p: OtoroshiSyncApiError =>
          OtoroshiSyncApiErrorFormat.writes(p).as[JsObject] ++ Json.obj(
            "type" -> "OtoroshiSyncApiError")
        case p: ApiKeyDeletionInformation =>
          ApiKeyDeletionInformationFormat.writes(p).as[JsObject] ++ Json.obj(
            "type" -> "ApiKeyDeletionInformation")
        case p: ApiKeyRotationInProgress =>
          ApiKeyRotationInProgressFormat.writes(p).as[JsObject] ++ Json.obj(
            "type" -> "ApiKeyRotationInProgress")
        case p: ApiKeyRotationEnded =>
          ApiKeyRotationEndedFormat.writes(p).as[JsObject] ++ Json.obj(
            "type" -> "ApiKeyRotationEnded")
        case p: TeamInvitation =>
          TeamInvitationFormat.writes(p).as[JsObject] ++ Json.obj(
            "type" -> "TeamInvitation")
      }
    }

  val ApiAccessFormat = new Format[ApiAccess] {
    override def reads(json: JsValue): JsResult[ApiAccess] =
      Try {
        JsSuccess(
          ApiAccess(
            api = (json \ "api").as(ApiIdFormat),
            team = (json \ "team").as(TeamIdFormat)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: ApiAccess): JsValue = Json.obj(
      "api" -> ApiIdFormat.writes(o.api),
      "team" -> TeamIdFormat.writes(o.team)
    )
  }
  val TeamAccessFormat = new Format[TeamAccess] {
    override def reads(json: JsValue): JsResult[TeamAccess] =
      Try {
        JsSuccess(
          TeamAccess(
            team = (json \ "team").as(TeamIdFormat)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: TeamAccess): JsValue = Json.obj(
      "team" -> TeamIdFormat.writes(o.team)
    )
  }
  val ApiSubscriptionDemandFormat = new Format[ApiSubscriptionDemand] {
    override def reads(json: JsValue): JsResult[ApiSubscriptionDemand] =
      Try {
        JsSuccess(
          ApiSubscriptionDemand(
            api = (json \ "api").as(ApiIdFormat),
            plan = (json \ "plan").as(UsagePlanIdFormat),
            team = (json \ "team").as(TeamIdFormat)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: ApiSubscriptionDemand): JsValue = Json.obj(
      "api" -> ApiIdFormat.writes(o.api),
      "plan" -> UsagePlanIdFormat.writes(o.plan),
      "team" -> TeamIdFormat.writes(o.team)
    )
  }
  val ApiKeyDeletionInformationFormat = new Format[ApiKeyDeletionInformation] {
    override def reads(json: JsValue): JsResult[ApiKeyDeletionInformation] =
      Try {
        JsSuccess(
          ApiKeyDeletionInformation(
            api = (json \ "api").as[String],
            clientId = (json \ "clientId").as[String]
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: ApiKeyDeletionInformation): JsValue = Json.obj(
      "api" -> o.api,
      "clientId" -> o.clientId
    )
  }

  val OtoroshiSyncSubscriptionErrorFormat =
    new Format[OtoroshiSyncSubscriptionError] {
      override def reads(
          json: JsValue): JsResult[OtoroshiSyncSubscriptionError] =
        Try {
          JsSuccess(
            OtoroshiSyncSubscriptionError(
              subscription = (json \ "subscription").as(ApiSubscriptionFormat),
              message = (json \ "message").as[String]
            )
          )
        } recover {
          case e => JsError(e.getMessage)
        } get
      override def writes(o: OtoroshiSyncSubscriptionError): JsValue = Json.obj(
        "subscription" -> ApiSubscriptionFormat.writes(o.subscription),
        "message" -> o.message
      )
    }

  val OtoroshiSyncApiErrorFormat = new Format[OtoroshiSyncApiError] {
    override def reads(json: JsValue): JsResult[OtoroshiSyncApiError] =
      Try {
        JsSuccess(
          OtoroshiSyncApiError(
            api = (json \ "api").as(ApiFormat),
            message = (json \ "message").as[String]
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: OtoroshiSyncApiError): JsValue = Json.obj(
      "api" -> ApiFormat.writes(o.api),
      "message" -> o.message
    )
  }
  val ApiKeyRotationInProgressFormat = new Format[ApiKeyRotationInProgress] {
    override def reads(json: JsValue): JsResult[ApiKeyRotationInProgress] =
      Try {
        JsSuccess(
          ApiKeyRotationInProgress(
            clientId = (json \ "clientId").as[String],
            api = (json \ "api").as[String],
            plan = (json \ "plan").as[String],
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get

    override def writes(o: ApiKeyRotationInProgress): JsValue = Json.obj(
      "clientId" -> o.clientId,
      "api" -> o.api,
      "plan" -> o.plan,
    )
  }
  val ApiKeyRotationEndedFormat = new Format[ApiKeyRotationEnded] {
    override def reads(json: JsValue): JsResult[ApiKeyRotationEnded] =
      Try {
        JsSuccess(
          ApiKeyRotationEnded(
            clientId = (json \ "clientId").as[String],
            api = (json \ "api").as[String],
            plan = (json \ "plan").as[String],
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get

    override def writes(o: ApiKeyRotationEnded): JsValue = Json.obj(
      "clientId" -> o.clientId,
      "api" -> o.api,
      "plan" -> o.plan
    )
  }
  val TeamInvitationFormat = new Format[TeamInvitation] {
    override def reads(json: JsValue): JsResult[TeamInvitation] =
      Try {
        JsSuccess(
          TeamInvitation(
            team = (json \ "team").as(TeamIdFormat),
            user = (json \ "user").as(UserIdFormat)
          )
        )
      } recover {
        case e =>
          JsError(e.getMessage)
      } get

    override def writes(o: TeamInvitation): JsValue = Json.obj(
      "team" -> TeamIdFormat.writes(o.team),
      "user" -> UserIdFormat.writes(o.user),
    )
  }

  val NotificationStatusFormat: Format[NotificationStatus] =
    new Format[NotificationStatus] {
      override def reads(json: JsValue): JsResult[NotificationStatus] =
        (json \ "status").as[String] match {
          case "Pending"  => JsSuccess(Pending)
          case "Accepted" => NotificationStatusAcceptedFormat.reads(json)
          case "Rejected" => NotificationStatusRejectedFormat.reads(json)
          case str        => JsError(s"Bad notification status value: $str")
        }

      override def writes(o: NotificationStatus): JsValue = o match {
        case Pending => Json.obj("status" -> "Pending")
        case status: Accepted =>
          NotificationStatusAcceptedFormat.writes(status).as[JsObject] ++ Json
            .obj("status" -> "Accepted")
        case status: Rejected =>
          NotificationStatusRejectedFormat.writes(status).as[JsObject] ++ Json
            .obj("status" -> "Rejected")
      }
    }

  val NotificationTypeFormat: Format[NotificationType] =
    new Format[NotificationType] {
      override def reads(json: JsValue): JsResult[NotificationType] =
        json.as[String] match {
          case "AcceptOrReject" => JsSuccess(NotificationType.AcceptOrReject)
          case "AcceptOnly"     => JsSuccess(NotificationType.AcceptOnly)
          case str              => JsError(s"Bad notification type value: $str")
        }

      override def writes(o: NotificationType): JsValue = o match {
        case NotificationType.AcceptOrReject => JsString("AcceptOrReject")
        case NotificationType.AcceptOnly     => JsString("AcceptOnly")
      }
    }

  val NotificationStatusAcceptedFormat: Format[Accepted] =
    new Format[Accepted] {
      override def reads(json: JsValue): JsResult[Accepted] =
        Try {
          JsSuccess(
            Accepted(
              date = (json \ "date").as(DateTimeFormat)
            )
          )
        } recover {
          case e => JsError(e.getMessage)
        } get

      override def writes(o: Accepted): JsValue = Json.obj(
        "date" -> DateTimeFormat.writes(o.date)
      )
    }

  val NotificationStatusRejectedFormat: Format[Rejected] =
    new Format[Rejected] {
      override def reads(json: JsValue): JsResult[Rejected] =
        Try {
          JsSuccess(
            Rejected(
              date = (json \ "date").as(DateTimeFormat)
            )
          )
        } recover {
          case e => JsError(e.getMessage)
        } get

      override def writes(o: Rejected): JsValue = Json.obj(
        "date" -> DateTimeFormat.writes(o.date)
      )
    }

  val NotificationFormat: Format[Notification] = new Format[Notification] {
    override def reads(json: JsValue): JsResult[Notification] =
      Try {
        JsSuccess(
          Notification(
            id = (json \ "_id").as(NotificationIdFormat),
            tenant = (json \ "_tenant").as(TenantIdFormat),
            deleted = (json \ "_deleted").asOpt[Boolean].getOrElse(false),
            team = (json \ "team").asOpt(TeamIdFormat),
            sender = (json \ "sender").as(UserFormat),
            date =
              (json \ "date").asOpt(DateTimeFormat).getOrElse(DateTime.now()),
            status = (json \ "status").as(NotificationStatusFormat),
            action = (json \ "action").as(NotificationActionFormat),
            notificationType = (json \ "notificationType")
              .asOpt(NotificationTypeFormat)
              .getOrElse(NotificationType.AcceptOrReject)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get

    override def writes(o: Notification): JsValue = Json.obj(
      "_id" -> NotificationIdFormat.writes(o.id),
      "_tenant" -> TenantIdFormat.writes(o.tenant),
      "_deleted" -> o.deleted,
      "team" -> o.team
        .map(id => JsString(id.value))
        .getOrElse(JsNull)
        .as[JsValue],
      "sender" -> UserFormat.writes(o.sender),
      "date" -> DateTimeFormat.writes(o.date),
      "action" -> NotificationActionFormat.writes(o.action),
      "status" -> NotificationStatusFormat.writes(o.status),
      "notificationType" -> NotificationTypeFormat.writes(o.notificationType)
    )
  }

  val UserSessionFormat = new Format[UserSession] {

    override def reads(json: JsValue): JsResult[UserSession] = {

      Try {
        JsSuccess(
          UserSession(
            id = (json \ "_id").as(MongoIdFormat),
            sessionId = (json \ "sessionId").as(UserSessionIdFormat),
            userId = (json \ "userId").as(UserIdFormat),
            userName = (json \ "userName").as[String],
            userEmail = (json \ "userEmail").as[String],
            impersonatorId = (json \ "impersonatorId").asOpt(UserIdFormat),
            impersonatorName = (json \ "impersonatorName").asOpt[String],
            impersonatorEmail = (json \ "impersonatorEmail").asOpt[String],
            impersonatorSessionId =
              (json \ "impersonatorSessionId").asOpt(UserSessionIdFormat),
            created = (json \ "created")
              .asOpt(DateTimeFormat)
              .getOrElse(DateTime.now()),
            expires = (json \ "expires")
              .asOpt(DateTimeFormat)
              .getOrElse(DateTime.now()),
            ttl = (json \ "ttl")
              .asOpt[Long]
              .map(v => FiniteDuration(v, TimeUnit.MILLISECONDS))
              .getOrElse(FiniteDuration(0, TimeUnit.MILLISECONDS))
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    }

    override def writes(o: UserSession): JsValue = Json.obj(
      "_id" -> o.id.asJson,
      "sessionId" -> UserSessionIdFormat.writes(o.sessionId),
      "userId" -> o.userId.asJson,
      "userName" -> o.userName,
      "userEmail" -> o.userEmail,
      "impersonatorId" -> o.impersonatorId
        .map(id => id.asJson)
        .getOrElse(JsNull)
        .as[JsValue],
      "impersonatorName" -> o.impersonatorName
        .map(id => JsString(id))
        .getOrElse(JsNull)
        .as[JsValue],
      "impersonatorEmail" -> o.impersonatorEmail
        .map(id => JsString(id))
        .getOrElse(JsNull)
        .as[JsValue],
      "impersonatorSessionId" -> o.impersonatorSessionId
        .map(id => JsString(id.value))
        .getOrElse(JsNull)
        .as[JsValue],
      "created" -> DateTimeFormat.writes(o.created),
      "expires" -> DateTimeFormat.writes(o.expires),
      "ttl" -> o.ttl.toMillis,
    )
  }

  val ConsumptionFormat: Format[ApiKeyConsumption] =
    new Format[ApiKeyConsumption] {
      override def reads(json: JsValue): JsResult[ApiKeyConsumption] =
        Try {
          JsSuccess(
            ApiKeyConsumption(
              id = (json \ "_id").as(MongoIdFormat),
              tenant = (json \ "_tenant").as(TenantIdFormat),
              team = (json \ "team").as(TeamIdFormat),
              api = (json \ "api").as(ApiIdFormat),
              plan = (json \ "plan").as(UsagePlanIdFormat),
              clientId = (json \ "clientId").as[String],
              hits = (json \ "hits").as[Int],
              globalInformations = (json \ "globalInformations").as(
                GlobalConsumptionInformationsFormat),
              quotas = (json \ "quotas").as(ApiKeyQuotasFormat),
              billing = (json \ "billing").as(ApiKeyBillingFormat),
              from = (json \ "from").as(DateTimeFormat),
              to = (json \ "to").as(DateTimeFormat)
            )
          )
        } recover {
          case e => JsError(e.getMessage)
        } get

      override def writes(o: ApiKeyConsumption): JsValue = Json.obj(
        "_id" -> MongoIdFormat.writes(o.id),
        "_tenant" -> TenantIdFormat.writes(o.tenant),
        "team" -> TeamIdFormat.writes(o.team),
        "api" -> ApiIdFormat.writes(o.api),
        "plan" -> UsagePlanIdFormat.writes(o.plan),
        "clientId" -> o.clientId,
        "hits" -> o.hits,
        "globalInformations" -> GlobalConsumptionInformationsFormat.writes(
          o.globalInformations),
        "quotas" -> ApiKeyQuotasFormat.writes(o.quotas),
        "billing" -> ApiKeyBillingFormat.writes(o.billing),
        "from" -> DateTimeFormat.writes(o.from),
        "to" -> DateTimeFormat.writes(o.to)
      )
    }
  val GlobalConsumptionInformationsFormat
    : Format[ApiKeyGlobalConsumptionInformations] =
    new Format[ApiKeyGlobalConsumptionInformations] {
      override def reads(
          json: JsValue): JsResult[ApiKeyGlobalConsumptionInformations] =
        Try {
          JsSuccess(
            ApiKeyGlobalConsumptionInformations(
              hits = (json \ "hits").as[Long],
              dataIn = (json \ "dataIn").as[Long],
              dataOut = (json \ "dataOut").as[Long],
              avgDuration = (json \ "avgDuration").asOpt[Double],
              avgOverhead = (json \ "avgOverhead").asOpt[Double],
            )
          )
        } recover {
          case e => JsError(e.getMessage)
        } get

      override def writes(o: ApiKeyGlobalConsumptionInformations): JsValue =
        Json.obj(
          "hits" -> o.hits,
          "dataIn" -> o.dataIn,
          "dataOut" -> o.dataOut,
          "avgDuration" -> o.avgDuration
            .map(JsNumber(_))
            .getOrElse(JsNull)
            .as[JsValue],
          "avgOverhead" -> o.avgOverhead
            .map(JsNumber(_))
            .getOrElse(JsNull)
            .as[JsValue]
        )
    }

  val ApiKeyQuotasFormat: Format[ApiKeyQuotas] = new Format[ApiKeyQuotas] {
    override def reads(json: JsValue): JsResult[ApiKeyQuotas] =
      Try {
        JsSuccess(
          ApiKeyQuotas(
            authorizedCallsPerSec = (json \ "authorizedCallsPerSec").as[Long],
            currentCallsPerSec = (json \ "currentCallsPerSec").as[Long],
            remainingCallsPerSec = (json \ "remainingCallsPerSec").as[Long],
            authorizedCallsPerDay = (json \ "authorizedCallsPerDay").as[Long],
            currentCallsPerDay = (json \ "currentCallsPerDay").as[Long],
            remainingCallsPerDay = (json \ "remainingCallsPerDay").as[Long],
            authorizedCallsPerMonth =
              (json \ "authorizedCallsPerMonth").as[Long],
            currentCallsPerMonth = (json \ "currentCallsPerMonth").as[Long],
            remainingCallsPerMonth = (json \ "remainingCallsPerMonth").as[Long],
          ))
      } recover {
        case e => JsError(e.getMessage)
      } get

    override def writes(o: ApiKeyQuotas): JsValue = Json.obj(
      "authorizedCallsPerSec" -> o.authorizedCallsPerSec,
      "currentCallsPerSec" -> o.currentCallsPerSec,
      "remainingCallsPerSec" -> o.remainingCallsPerSec,
      "authorizedCallsPerDay" -> o.authorizedCallsPerDay,
      "currentCallsPerDay" -> o.currentCallsPerDay,
      "remainingCallsPerDay" -> o.remainingCallsPerDay,
      "authorizedCallsPerMonth" -> o.authorizedCallsPerMonth,
      "currentCallsPerMonth" -> o.currentCallsPerMonth,
      "remainingCallsPerMonth" -> o.remainingCallsPerMonth
    )
  }

  val ApiKeyBillingFormat: Format[ApiKeyBilling] = new Format[ApiKeyBilling] {
    override def reads(json: JsValue): JsResult[ApiKeyBilling] =
      Try {
        JsSuccess(
          ApiKeyBilling(
            hits = (json \ "hits").as[Long],
            total = (json \ "total").as[BigDecimal]
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get

    override def writes(o: ApiKeyBilling): JsValue = Json.obj(
      "hits" -> o.hits,
      "total" -> o.total
    )
  }

  val PasswordResetFormat: Format[PasswordReset] = new Format[PasswordReset] {
    override def reads(json: JsValue): JsResult[PasswordReset] =
      Try {
        JsSuccess(
          PasswordReset(
            id = (json \ "_id").as(MongoIdFormat),
            deleted = (json \ "_deleted").as[Boolean],
            randomId = (json \ "randomId").as[String],
            email = (json \ "email").as[String],
            password = (json \ "password").as[String],
            user = (json \ "user").as(UserIdFormat),
            creationDate = (json \ "creationDate").as(DateTimeFormat),
            validUntil = (json \ "validUntil").as(DateTimeFormat)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get

    override def writes(o: PasswordReset): JsValue = Json.obj(
      "_id" -> o.id.value,
      "_deleted" -> o.deleted,
      "randomId" -> o.randomId,
      "email" -> o.email,
      "password" -> o.password,
      "user" -> o.user.asJson,
      "creationDate" -> DateTimeFormat.writes(o.creationDate),
      "validUntil" -> DateTimeFormat.writes(o.validUntil)
    )
  }

  val AccountCreationFormat: Format[AccountCreation] =
    new Format[AccountCreation] {
      override def reads(json: JsValue): JsResult[AccountCreation] =
        Try {
          JsSuccess(
            AccountCreation(
              id = (json \ "_id").as(MongoIdFormat),
              deleted = (json \ "_deleted").as[Boolean],
              randomId = (json \ "randomId").as[String],
              email = (json \ "email").as[String],
              name = (json \ "name").as[String],
              avatar = (json \ "avatar").as[String],
              password = (json \ "password").as[String],
              creationDate = (json \ "creationDate").as(DateTimeFormat),
              validUntil = (json \ "validUntil").as(DateTimeFormat)
            )
          )
        } recover {
          case e => JsError(e.getMessage)
        } get

      override def writes(o: AccountCreation): JsValue = Json.obj(
        "_id" -> o.id.value,
        "_deleted" -> o.deleted,
        "randomId" -> o.randomId,
        "email" -> o.email,
        "name" -> o.name,
        "avatar" -> o.avatar,
        "password" -> o.password,
        "creationDate" -> DateTimeFormat.writes(o.creationDate),
        "validUntil" -> DateTimeFormat.writes(o.validUntil)
      )
    }

  val ApiTranslationElementFormat = new Format[ApiTranslationElement] {
    override def reads(json: JsValue): JsResult[ApiTranslationElement] =
      Try {
        JsSuccess(
          ApiTranslationElement(
            api = (json \ "id").as(ApiIdFormat)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: ApiTranslationElement): JsValue =
      Json.obj(
        "id" -> ApiIdFormat.writes(o.api)
      ) ++ Json.obj("type" -> "Api")
  }

  val TenantTranslationElementFormat = new Format[TenantTranslationElement] {
    override def reads(json: JsValue): JsResult[TenantTranslationElement] =
      Try {
        JsSuccess(
          TenantTranslationElement(
            tenant = (json \ "id").as(TenantIdFormat)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: TenantTranslationElement): JsValue =
      Json.obj(
        "id" -> TenantIdFormat.writes(o.tenant)
      ) ++ Json.obj("type" -> "Tenant")
  }

  val TeamTranslationElementFormat = new Format[TeamTranslationElement] {
    override def reads(json: JsValue): JsResult[TeamTranslationElement] =
      Try {
        JsSuccess(
          TeamTranslationElement(
            team = (json \ "id").as(TeamIdFormat)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: TeamTranslationElement): JsValue =
      Json.obj(
        "id" -> TeamIdFormat.writes(o.team)
      ) ++ Json.obj("type" -> "Team")
  }

  val TranslationElementFormat: Format[TranslationElement] =
    new Format[TranslationElement] {
      override def reads(json: JsValue): JsResult[TranslationElement] =
        (json \ "type").as[String] match {
          case "Api"    => ApiTranslationElementFormat.reads(json)
          case "Team"   => TeamTranslationElementFormat.reads(json)
          case "Tenant" => TenantTranslationElementFormat.reads(json)
          case str      => JsError(s"Bad notification value: $str")
        }
      override def writes(o: TranslationElement): JsValue = o match {
        case p: ApiTranslationElement => ApiTranslationElementFormat.writes(p)
        case p: TenantTranslationElement =>
          TenantTranslationElementFormat.writes(p)
        case p: TeamTranslationElement => TeamTranslationElementFormat.writes(p)
      }
    }

  val TranslationFormat: Format[Translation] = new Format[Translation] {
    override def reads(json: JsValue): JsResult[Translation] =
      Try {
        JsSuccess(
          Translation(
            id = (json \ "_id").as(MongoIdFormat),
            tenant = (json \ "_tenant").as(TenantIdFormat),
            element = (json \ "element").as(TranslationElementFormat),
            language = (json \ "language").as[String],
            key = (json \ "key").as[String],
            value = (json \ "value").as[String]
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get

    override def writes(o: Translation): JsValue = Json.obj(
      "_id" -> o.id.value,
      "_tenant" -> TenantIdFormat.writes(o.tenant),
      "element" -> TranslationElementFormat.writes(o.element),
      "language" -> o.language,
      "key" -> o.key,
      "value" -> o.value
    )
  }

  val TeamPermissionFormat = new Format[TeamPermission] {
    override def reads(json: JsValue) = json.as[String] match {
      case "Administrator" => JsSuccess(Administrator)
      case "ApiEditor"     => JsSuccess(ApiEditor)
      case "User"          => JsSuccess(TeamUser)
      case str             => JsError(s"Bad TeamPermission value: $str")
    }
    override def writes(o: TeamPermission) = JsString(o.name)
  }

  val UserWithPermissionFormat: Format[UserWithPermission] =
    new Format[UserWithPermission] {
      override def reads(json: JsValue): JsResult[UserWithPermission] =
        Try {
          JsSuccess(
            UserWithPermission(
              userId = (json \ "userId").as(UserIdFormat),
              teamPermission =
                (json \ "teamPermission").as(TeamPermissionFormat)
            )
          )
        } recover {
          case e => JsError(e.getMessage)
        } get

      override def writes(o: UserWithPermission): JsValue = Json.obj(
        "userId" -> UserIdFormat.writes(o.userId),
        "teamPermission" -> TeamPermissionFormat.writes(o.teamPermission)
      )
    }

  val SeqOtoroshiSettingsFormat = Format(Reads.seq(OtoroshiSettingsFormat),
                                         Writes.seq(OtoroshiSettingsFormat))
  val SeqVersionFormat =
    Format(Reads.seq(VersionFormat), Writes.seq(VersionFormat))
  val SeqTeamIdFormat =
    Format(Reads.seq(TeamIdFormat), Writes.seq(TeamIdFormat))
  val SeqOtoroshiGroupFormat =
    Format(Reads.seq(OtoroshiGroupFormat), Writes.seq(OtoroshiGroupFormat))
  val SeqTenantIdFormat =
    Format(Reads.seq(TenantIdFormat), Writes.seq(TenantIdFormat))
  val SeqTenantFormat =
    Format(Reads.seq(TenantFormat), Writes.seq(TenantFormat))
  val SeqUserFormat = Format(Reads.seq(UserFormat), Writes.seq(UserFormat))
  val SeqUserIdFormat =
    Format(Reads.seq(UserIdFormat), Writes.seq(UserIdFormat))
  val SetUserIdFormat =
    Format(Reads.set(UserIdFormat), Writes.set(UserIdFormat))
  val SeqApiSubscriptionIdFormat = Format(Reads.seq(ApiSubscriptionIdFormat),
                                          Writes.seq(ApiSubscriptionIdFormat))
  val SeqApiDocumentationPageIdFormat =
    Format(Reads.seq(ApiDocumentationPageIdFormat),
           Writes.seq(ApiDocumentationPageIdFormat))
  val SeqApiDocumentationFormat = Format(Reads.seq(ApiDocumentationFormat),
                                         Writes.seq(ApiDocumentationFormat))
  val SeqApiDocumentationPageFormat =
    Format(Reads.seq(ApiDocumentationPageFormat),
           Writes.seq(ApiDocumentationPageFormat))
  val SeqUsagePlanFormat =
    Format(Reads.seq(UsagePlanFormat), Writes.seq(UsagePlanFormat))
  val SeqTeamFormat =
    Format(Reads.seq(TeamFormat), Writes.seq(TeamFormat))
  val SeqApiFormat =
    Format(Reads.seq(ApiFormat), Writes.seq(ApiFormat))
  val SetUserWithPermissionFormat =
    Format(Reads.set(UserWithPermissionFormat),
           Writes.set(UserWithPermissionFormat))
  val SeqNotificationFormat =
    Format(Reads.seq(NotificationFormat), Writes.seq(NotificationFormat))
  val SeqConsumptionFormat =
    Format(Reads.seq(ConsumptionFormat), Writes.seq(ConsumptionFormat))
  val SeqApiSubscriptionFormat =
    Format(Reads.seq(ApiSubscriptionFormat), Writes.seq(ApiSubscriptionFormat))
  val SeqTranslationFormat =
    Format(Reads.seq(TranslationFormat), Writes.seq(TranslationFormat))
  val SeqAskedMetadataFormat =
    Format(Reads.seq(AskedMetadataFormat), Writes.seq(AskedMetadataFormat))
}
