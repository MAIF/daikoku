package fr.maif.daikoku.domain

import cats.implicits.catsSyntaxOptionId
import com.auth0.jwt.JWT
import fr.maif.daikoku.audit.KafkaConfig
import fr.maif.daikoku.audit.{ElasticAnalyticsConfig, Webhook}
import fr.maif.daikoku.domain.ApiVisibility._
import fr.maif.daikoku.domain.NotificationAction._
import fr.maif.daikoku.domain.NotificationStatus.{
  Accepted,
  Pending,
  Rejected
}
import fr.maif.daikoku.domain.TeamPermission._
import fr.maif.daikoku.domain.TeamType.{Organization, Personal}
import fr.maif.daikoku.domain.ThirdPartyPaymentSettings.StripeSettings
import fr.maif.daikoku.domain.ThirdPartySubscriptionInformations.StripeSubscriptionInformations
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.logger.AppLogger
import fr.maif.daikoku.login.AuthProvider
import fr.maif.daikoku.utils.StringImplicits._
import fr.maif.daikoku.utils._
import org.joda.time.DateTime
import play.api.libs.json._
import fr.maif.daikoku.services.{CmsFile, CmsPage, CmsRequestRendering}

import java.util.concurrent.TimeUnit
import scala.concurrent.duration.FiniteDuration
import scala.util.{Failure, Success, Try}

object json {
  implicit class RegexOps(sc: StringContext) {
    def r = new scala.util.matching.Regex(sc.parts.mkString)
  }

  val BillingTimeUnitFormat = new Format[BillingTimeUnit] {
    override def reads(json: JsValue): JsResult[BillingTimeUnit] =
      Try {
        json.asOpt[String].flatMap(BillingTimeUnit.apply) match {
          case Some(tu) => JsSuccess(tu)
          case None     => JsError("Bad time unit")
        }
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: BillingTimeUnit): JsValue = JsString(o.name)
  }

  val BillingDurationFormat = new Format[BillingDuration] {
    override def reads(json: JsValue): JsResult[BillingDuration] =
      Try {
        JsSuccess(
          BillingDuration(
            value = (json \ "value").as(using LongFormat),
            unit = (json \ "unit").as(using BillingTimeUnitFormat)
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: BillingDuration): JsValue =
      Json.obj(
        "value" -> o.value,
        "unit" -> o.unit.asJson
      )
  }

  val LongFormat = new Format[Long] {
    override def reads(json: JsValue): JsResult[Long] =
      Try {
        val long: Long =
          ((json \ "$long").asOpt[Long]).getOrElse(json.as[Long])
        JsSuccess(long)
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: Long): JsValue = JsNumber(o)
  }

  val DateTimeFormat = new Format[DateTime] {
    override def reads(json: JsValue): JsResult[DateTime] =
      Try {
        JsSuccess(new DateTime(json.as[Long]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: DateTime): JsValue = JsNumber(o.getMillis)
  }

  val OtoroshiSettingsFormat = new Format[OtoroshiSettings] {
    override def reads(json: JsValue): JsResult[OtoroshiSettings] =
      Try {
        JsSuccess(
          OtoroshiSettings(
            id = (json \ "_id").as(using OtoroshiSettingsIdFormat),
            url = (json \ "url").as[String],
            host = (json \ "host").as[String],
            clientId = (json \ "clientId")
              .asOpt[String]
              .getOrElse("admin-api-apikey-id"),
            clientSecret = (json \ "clientSecret")
              .asOpt[String]
              .getOrElse("admin-api-apikey-secret"),
            elasticConfig =
              (json \ "elasticConfig").asOpt(using ElasticAnalyticsConfig.format)
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: OtoroshiSettings): JsValue =
      Json.obj(
        "_id" -> o.id.asJson,
        "url" -> o.url,
        "host" -> o.host,
        "clientId" -> o.clientId,
        "clientSecret" -> o.clientSecret,
        "elasticConfig" -> o.elasticConfig
          .map(ElasticAnalyticsConfig.format.writes)
          .getOrElse(JsNull)
          .as[JsValue]
      )
  }

  val TestingConfigFormat = new Format[TestingConfig] {
    override def reads(json: JsValue): JsResult[TestingConfig] =
      Try {
        JsSuccess(
          TestingConfig(
            otoroshiSettings =
              (json \ "otoroshiSettings").as(using OtoroshiSettingsIdFormat),
            authorizedEntities =
              (json \ "authorizedEntities").as(using AuthorizedEntitiesFormat),
            clientName = (json \ "clientName").as[String],
            tag = (json \ "tag").as[String],
            customMetadata = (json \ "customMetadata").asOpt[JsObject],
            customMaxPerSecond = (json \ "customMaxPerSecond").asOpt[Long],
            customMaxPerDay = (json \ "customMaxPerDay").asOpt[Long],
            customMaxPerMonth = (json \ "customMaxPerMonth").asOpt[Long],
            customReadOnly = (json \ "customReadOnly").asOpt[Boolean]
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: TestingConfig): JsValue =
      Json.obj(
        "otoroshiSettings" -> OtoroshiSettingsIdFormat.writes(
          o.otoroshiSettings
        ),
        "authorizedEntities" -> AuthorizedEntitiesFormat.writes(
          o.authorizedEntities
        ),
        "clientName" -> o.clientName,
        "tag" -> o.tag,
        "customMetadata" -> o.customMetadata
          .getOrElse(JsNull)
          .as[JsValue],
        "customMaxPerSecond" -> o.customMaxPerSecond
          .map(JsNumber(_))
          .getOrElse(JsNull)
          .as[JsValue],
        "customMaxPerDay" -> o.customMaxPerDay
          .map(JsNumber(_))
          .getOrElse(JsNull)
          .as[JsValue],
        "customMaxPerMonth" -> o.customMaxPerMonth
          .map(JsNumber(_))
          .getOrElse(JsNull)
          .as[JsValue],
        "customReadOnly" -> o.customReadOnly
          .map(JsBoolean.apply)
          .getOrElse(JsNull)
          .as[JsValue]
      )
  }

  val SpecificationTypeFormat = new Format[SpecificationType] {
    override def reads(json: JsValue): JsResult[SpecificationType] =
      json.as[String] match {
        case "openapi"  => JsSuccess(SpecificationType.OpenApi)
        case "asyncapi" => JsSuccess(SpecificationType.AsyncApi)
        case str        => JsError(s"Bad specification type value: $str")
      }

    override def writes(o: SpecificationType): JsValue = JsString(o.name)
  }

  val TestingFormat = new Format[Testing] {
    override def reads(json: JsValue): JsResult[Testing] = {
      json match {
        case JsObject(_) =>
          Try {
            JsSuccess(
              Testing(
                url = (json \ "url").asOpt[String],
                enabled = (json \ "enabled").asOpt[Boolean].getOrElse(false),
                auth =
                  (json \ "auth").asOpt[String].filter(_.trim.nonEmpty) match {
                    case Some("ApiKey") => TestingAuth.ApiKey
                    case Some("Basic")  => TestingAuth.Basic
                    case _              => TestingAuth.Basic
                  },
                name = (json \ "name").asOpt[String].filter(_.trim.nonEmpty),
                username =
                  (json \ "username").asOpt[String].filter(_.trim.nonEmpty),
                password =
                  (json \ "password").asOpt[String].filter(_.trim.nonEmpty),
                config = (json \ "config").asOpt(using TestingConfigFormat)
              )
            )
          } recover { case e =>
            JsError(e.getMessage)
          } get
        case _ => JsError()
      }

    }

    override def writes(o: Testing): JsValue =
      Json.obj(
        "url" -> o.url
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue],
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
        "config" -> o.config
          .map(TestingConfigFormat.writes)
          .getOrElse(JsNull)
          .as[JsValue]
      )
  }

  val UsagePlanIdFormat = new Format[UsagePlanId] {
    override def reads(json: JsValue): JsResult[UsagePlanId] =
      Try {
        JsSuccess(UsagePlanId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: UsagePlanId): JsValue = JsString(o.value)
  }
  val UserIdFormat = new Format[UserId] {
    override def reads(json: JsValue): JsResult[UserId] =
      Try {
        JsSuccess(UserId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: UserId): JsValue = JsString(o.value)
  }
  val DatastoreIdFormat = new Format[DatastoreId] {
    override def reads(json: JsValue): JsResult[DatastoreId] =
      Try {
        JsSuccess(DatastoreId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: DatastoreId): JsValue = JsString(o.value)
  }
  val ChatIdFormat = new Format[ChatId] {
    override def reads(json: JsValue): JsResult[ChatId] =
      Try {
        JsSuccess(ChatId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ChatId): JsValue = JsString(o.value)
  }
  val TeamIdFormat = new Format[TeamId] {
    override def reads(json: JsValue): JsResult[TeamId] =
      Try {
        JsSuccess(TeamId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: TeamId): JsValue = JsString(o.value)
  }
  val ApiIdFormat = new Format[ApiId] {
    override def reads(json: JsValue): JsResult[ApiId] =
      Try {
        JsSuccess(ApiId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiId): JsValue = JsString(o.value)
  }

  val TenantModeFormat = new Format[TenantMode] {
    override def reads(json: JsValue): JsResult[TenantMode] =
      json.asOpt[String].map(_.toLowerCase) match {
        case Some("maintenance")  => JsSuccess(TenantMode.Maintenance)
        case Some("construction") => JsSuccess(TenantMode.Construction)
        case Some("default")      => JsSuccess(TenantMode.Default)
        case Some("translation")  => JsSuccess(TenantMode.Translation)
        case None                 => JsSuccess(TenantMode.Default)
        case Some(str) => JsError(s"Bad value for tenant mode : $str")
      }

    override def writes(o: TenantMode): JsValue = JsString(o.name)
  }
  val TenantDisplayFormat = new Format[TenantDisplay] {
    override def reads(json: JsValue): JsResult[TenantDisplay] =
      json.asOpt[String].map(_.toLowerCase) match {
        case Some("environment") => JsSuccess(TenantDisplay.Environment)
        case Some("default")     => JsSuccess(TenantDisplay.Default)
        case None                => JsSuccess(TenantDisplay.Default)
        case Some(str) => JsError(s"Bad value for tenant display : $str")
      }

    override def writes(o: TenantDisplay): JsValue = JsString(o.name)
  }
  val ApiSubscriptionIdFormat = new Format[ApiSubscriptionId] {
    override def reads(json: JsValue): JsResult[ApiSubscriptionId] =
      Try {
        JsSuccess(ApiSubscriptionId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiSubscriptionId): JsValue = JsString(o.value)
  }
  val ApiDocumentationIdFormat = new Format[ApiDocumentationId] {
    override def reads(json: JsValue): JsResult[ApiDocumentationId] =
      Try {
        JsSuccess(ApiDocumentationId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiDocumentationId): JsValue = JsString(o.value)
  }
  val ApiDocumentationPageIdFormat = new Format[ApiDocumentationPageId] {
    override def reads(json: JsValue): JsResult[ApiDocumentationPageId] =
      Try {
        JsSuccess(ApiDocumentationPageId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiDocumentationPageId): JsValue = JsString(o.value)
  }
  val ApiPostIdFormat = new Format[ApiPostId] {
    override def reads(json: JsValue): JsResult[ApiPostId] =
      Try {
        JsSuccess(ApiPostId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiPostId): JsValue = JsString(o.value)
  }
  val ApiIssueIdFormat = new Format[ApiIssueId] {
    override def reads(json: JsValue): JsResult[ApiIssueId] =
      Try {
        JsSuccess(ApiIssueId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiIssueId): JsValue = JsString(o.value)
  }
  val ApiTagFormat = new Format[ApiIssueTag] {
    override def reads(json: JsValue): JsResult[ApiIssueTag] =
      Try {
        JsSuccess(
          ApiIssueTag(
            id = (json \ "id")
              .asOpt[ApiIssueTagId](using ApiIssueTagIdFormat)
              .getOrElse(ApiIssueTagId(IdGenerator.token(32))),
            name = (json \ "name").as[String],
            color = (json \ "color").as[String]
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiIssueTag): JsValue =
      Json.obj(
        "id" -> ApiIssueTagIdFormat.writes(o.id),
        "name" -> o.name,
        "color" -> o.color
      )
  }
  val ApiIssueCommentFormat = new Format[ApiIssueComment] {
    override def reads(json: JsValue): JsResult[ApiIssueComment] =
      Try {
        JsSuccess(
          ApiIssueComment(
            by = (json \ "by").as(using UserIdFormat),
            createdAt = (json \ "createdAt")
              .asOpt(using DateTimeFormat)
              .getOrElse(DateTime.now()),
            lastModificationAt = (json \ "lastModificationAt")
              .asOpt(using DateTimeFormat)
              .getOrElse(DateTime.now()),
            content = (json \ "content").as[String]
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiIssueComment): JsValue =
      Json.obj(
        "by" -> UserIdFormat.writes(o.by),
        "createdAt" -> DateTimeFormat.writes(o.createdAt),
        "lastModificationAt" -> DateTimeFormat.writes(o.lastModificationAt),
        "content" -> o.content
      )
  }
  val TenantIdFormat = new Format[TenantId] {
    override def reads(json: JsValue): JsResult[TenantId] =
      Try {
        JsSuccess(TenantId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: TenantId): JsValue = JsString(o.value)
  }
  val PostIdFormat = new Format[ApiPostId] {
    override def reads(json: JsValue): JsResult[ApiPostId] =
      Try {
        JsSuccess(ApiPostId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiPostId): JsValue = JsString(o.value)
  }
  val IssueIdFormat = new Format[ApiIssueId] {
    override def reads(json: JsValue): JsResult[ApiIssueId] =
      Try {
        JsSuccess(ApiIssueId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiIssueId): JsValue = JsString(o.value)
  }
  val OtoroshiGroupFormat = new Format[OtoroshiGroup] {
    override def reads(json: JsValue): JsResult[OtoroshiGroup] =
      Try {
        JsSuccess(OtoroshiGroup(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: OtoroshiGroup): JsValue = JsString(o.value)
  }
  val OtoroshiServiceGroupIdFormat = new Format[OtoroshiServiceGroupId] {
    override def reads(json: JsValue): JsResult[OtoroshiServiceGroupId] =
      Try {
        JsSuccess(OtoroshiServiceGroupId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: OtoroshiServiceGroupId): JsValue = JsString(o.value)
  }
  val OtoroshiServiceIdFormat = new Format[OtoroshiServiceId] {
    override def reads(json: JsValue): JsResult[OtoroshiServiceId] =
      Try {
        JsSuccess(OtoroshiServiceId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: OtoroshiServiceId): JsValue = JsString(o.value)
  }
  val OtoroshiRouteIdFormat = new Format[OtoroshiRouteId] {
    override def reads(json: JsValue): JsResult[OtoroshiRouteId] =
      Try {
        JsSuccess(OtoroshiRouteId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: OtoroshiRouteId): JsValue = JsString(o.value)
  }
  val VersionFormat = new Format[Version] {
    override def reads(json: JsValue): JsResult[Version] =
      Try {
        JsSuccess(Version(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: Version): JsValue = JsString(o.value)
  }
  val OtoroshiSettingsIdFormat = new Format[OtoroshiSettingsId] {
    override def reads(json: JsValue): JsResult[OtoroshiSettingsId] =
      Try {
        JsSuccess(OtoroshiSettingsId(json.as[String]))
      } recover { case e =>
        AppLogger.error(e.getMessage, e)
        JsError(e.getMessage)
      } get

    override def writes(o: OtoroshiSettingsId): JsValue = JsString(o.value)
  }
  val ThirdPartyPaymentSettingsIdFormat =
    new Format[ThirdPartyPaymentSettingsId] {
      override def reads(json: JsValue): JsResult[ThirdPartyPaymentSettingsId] =
        Try {
          JsSuccess(ThirdPartyPaymentSettingsId(json.as[String]))
        } recover { case e =>
          JsError(e.getMessage)
        } get

      override def writes(o: ThirdPartyPaymentSettingsId): JsValue =
        JsString(o.value)
    }
  val SubscriptionDemandIdFormat = new Format[DemandId] {
    override def reads(json: JsValue): JsResult[DemandId] =
      Try {
        JsSuccess(DemandId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: DemandId): JsValue = JsString(o.value)
  }
  val SubscriptionDemandStepIdFormat = new Format[SubscriptionDemandStepId] {
    override def reads(json: JsValue): JsResult[SubscriptionDemandStepId] =
      Try {
        JsSuccess(SubscriptionDemandStepId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: SubscriptionDemandStepId): JsValue =
      JsString(o.value)
  }
  val TeamTypeFormat = new Format[TeamType] {
    override def reads(json: JsValue) =
      json.as[String] match {
        case "Personal"     => JsSuccess(Personal)
        case "Organization" => JsSuccess(Organization)
        case "Admin"        => JsSuccess(TeamType.Admin)
        case str            => JsError(s"Bad TeamType value: $str")
      }

    override def writes(o: TeamType): JsValue = JsString(o.name)
  }
  val ApiVisibilityFormat = new Format[ApiVisibility] {
    override def reads(json: JsValue) =
      json.as[String] match {
        case "Public"                   => JsSuccess(Public)
        case "Private"                  => JsSuccess(Private)
        case "PublicWithAuthorizations" => JsSuccess(PublicWithAuthorizations)
        case "AdminOnly"                => JsSuccess(AdminOnly)
        case str => JsError(s"Bad ApiVisibility value: $str")
      }

    override def writes(o: ApiVisibility): JsValue = JsString(o.name)
  }
  val ApiStateFormat = new Format[ApiState] {
    override def reads(json: JsValue) =
      json.as[String] match {
        case "created"    => JsSuccess(ApiState.Created)
        case "published"  => JsSuccess(ApiState.Published)
        case "blocked"    => JsSuccess(ApiState.Blocked)
        case "deprecated" => JsSuccess(ApiState.Deprecated)
        case str          => JsError(s"Bad ApiState value: $str")
      }

    override def writes(o: ApiState): JsValue = JsString(o.name)
  }
  val UsagePlanVisibilityFormat = new Format[UsagePlanVisibility] {
    override def reads(json: JsValue) =
      json.as[String] match {
        case "Public"  => JsSuccess(UsagePlanVisibility.Public)
        case "Private" => JsSuccess(UsagePlanVisibility.Private)
        case "Admin"   => JsSuccess(UsagePlanVisibility.Admin)
        case str       => JsError(s"Bad UsagePlanVisibility value: $str")
      }

    override def writes(o: UsagePlanVisibility): JsValue = JsString(o.name)
  }

  val ValidationStepFormat = new Format[ValidationStep] {
    override def writes(o: ValidationStep): JsValue =
      o match {
        case ValidationStep.Email(id, emails, message, title) =>
          Json.obj(
            "type" -> "email",
            "id" -> id,
            "emails" -> emails,
            "title" -> title,
            "message" -> message.map(JsString.apply).getOrElse(JsNull).as[JsValue]
          )
        case ValidationStep.TeamAdmin(id, team, title) =>
          Json.obj(
            "type" -> "teamAdmin",
            "id" -> id,
            "team" -> team.asJson,
            "title" -> title
          )
        case ValidationStep.Form(
              id,
              title,
              schema,
              formatter,
              formKeysToMetadata,
              info
            ) =>
          Json.obj(
            "type" -> "form",
            "id" -> id,
            "title" -> title,
            "schema" -> schema.getOrElse(JsNull).as[JsValue],
            "formatter" -> formatter
              .map(JsString.apply)
              .getOrElse(JsNull)
              .as[JsValue],
            "formKeysToMetadata" -> formKeysToMetadata
              .map(keys => JsArray(keys.map(JsString.apply)))
              .getOrElse(JsNull)
              .as[JsValue],
            "info" -> info
              .map(JsString.apply)
              .getOrElse(JsNull)
              .as[JsValue]
          )
        case ValidationStep.Payment(id, thirdPartyPaymentSettingsId, title) =>
          Json.obj(
            "type" -> "payment",
            "id" -> id,
            "thirdPartyPaymentSettingsId" -> thirdPartyPaymentSettingsId.asJson,
            "title" -> title
          )
        case ValidationStep.HttpRequest(id, title, url, headers) =>
          Json.obj(
            "type" -> "httpRequest",
            "id" -> id,
            "title" -> title,
            "url" -> url,
            "headers" -> headers
          )
      }

    override def reads(json: JsValue): JsResult[ValidationStep] =
      (json \ "type").as[String] match {
        case "email" =>
          JsSuccess(
            ValidationStep.Email(
              id = (json \ "id").as[String],
              emails = (json \ "emails").as[Seq[String]],
              message = (json \ "message").asOpt[String],
              title = (json \ "title").as[String]
            )
          )
        case "teamAdmin" =>
          JsSuccess(
            ValidationStep.TeamAdmin(
              id = (json \ "id").as[String],
              team = (json \ "team").as(using TeamIdFormat),
              title = (json \ "title").as[String]
            )
          )
        case "form" =>
          JsSuccess(
            ValidationStep.Form(
              id = (json \ "id").as[String],
              title = (json \ "title").as[String],
              schema = (json \ "schema")
                .asOpt[JsObject]
                .orElse(
                  Json
                    .obj(
                      "motivation" -> Json.obj(
                        "type" -> "string",
                        "format" -> "textarea",
                        "constraints" -> Json.arr(
                          Json
                            .obj("type" -> "required")
                        )
                      )
                    )
                    .some
                ),
              formatter = (json \ "formatter")
                .asOpt[String]
                .orElse("[[motivation]]".some),
              formKeysToMetadata = (json \ "formKeysToMetadata")
                .asOpt[Seq[String]],
              info = (json \ "info").asOpt[String]
            )
          )
        case "payment" =>
          JsSuccess(
            ValidationStep.Payment(
              id = (json \ "id").as[String],
              thirdPartyPaymentSettingsId =
                (json \ "thirdPartyPaymentSettingsId")
                  .as(using ThirdPartyPaymentSettingsIdFormat),
              title = (json \ "title").as[String]
            )
          )
        case "httpRequest" =>
          JsSuccess(
            ValidationStep.HttpRequest(
              id = (json \ "id").as[String],
              title = (json \ "title").as[String],
              url = (json \ "url").as[String],
              headers = (json \ "headers")
                .asOpt[Map[String, String]]
                .getOrElse(Map.empty[String, String])
            )
          )
        case str => JsError(s"Bad UsagePlanVisibility value: $str")
      }
  }

  val IntegrationProcessFormat = new Format[IntegrationProcess] {
    override def reads(json: JsValue) =
      json.as[String] match {
        case "Automatic" => JsSuccess(IntegrationProcess.Automatic)
        case "ApiKey"    => JsSuccess(IntegrationProcess.ApiKey)
        case str         => JsError(s"Bad SubscriptionProcess value: $str")
      }

    override def writes(o: IntegrationProcess): JsValue = JsString(o.name)
  }

  val BasePaymentInformationFormat = new Format[BasePaymentInformation] {
    override def reads(json: JsValue): JsResult[BasePaymentInformation] =
      Try {
        JsSuccess(
          BasePaymentInformation(
            costPerMonth = (json \ "costPerMonth").as[BigDecimal],
            trialPeriod = (json \ "trialPeriod").asOpt(using BillingDurationFormat),
            billingDuration =
              (json \ "billingDuration").as(using BillingDurationFormat),
            currency = (json \ "currency").as(using CurrencyFormat)
          )
        )
      } recover { case e =>
        AppLogger.error(e.getMessage, e)
        JsError(e.getMessage)
      } get

    override def writes(o: BasePaymentInformation): JsValue =
      Json.obj(
        "costPerMonth" -> o.costPerMonth,
        "trialPeriod" -> o.trialPeriod
          .map(_.asJson)
          .getOrElse(JsNull)
          .as[JsValue],
        "billingDuration" -> o.billingDuration.asJson,
        "currency" -> o.currency.asJson
      )
  }

  val UsagePlanFormat = new Format[UsagePlan] {
    override def reads(json: JsValue): JsResult[UsagePlan] =
      Try {
        JsSuccess(
          UsagePlan(
            id = (json \ "_id").as(using UsagePlanIdFormat),
            tenant = (json \ "_tenant").as(using TenantIdFormat),
            deleted = (json \ "_deleted").asOpt[Boolean].getOrElse(false),
            maxPerSecond = (json \ "maxPerSecond").asOpt(using LongFormat),
            maxPerDay = (json \ "maxPerDay").asOpt(using LongFormat),
            maxPerMonth = (json \ "maxPerMonth").asOpt(using LongFormat),
            costPerMonth = (json \ "costPerMonth").asOpt[BigDecimal],
            costPerRequest = (json \ "costPerRequest").asOpt[BigDecimal],
            trialPeriod = (json \ "trialPeriod").asOpt(using BillingDurationFormat),
            billingDuration =
              (json \ "billingDuration").asOpt(using BillingDurationFormat),
            currency = (json \ "currency").asOpt(using CurrencyFormat),
            customName = (json \ "customName").as[String],
            customDescription = (json \ "customDescription").asOpt[String],
            otoroshiTarget =
              (json \ "otoroshiTarget").asOpt(using OtoroshiTargetFormat),
            allowMultipleKeys = (json \ "allowMultipleKeys").asOpt[Boolean],
            visibility = (json \ "visibility")
              .asOpt(using UsagePlanVisibilityFormat)
              .getOrElse(UsagePlanVisibility.Public),
            authorizedTeams = (json \ "authorizedTeams")
              .asOpt(using SeqTeamIdFormat)
              .getOrElse(Seq.empty),
            autoRotation = (json \ "autoRotation")
              .asOpt[Boolean],
            subscriptionProcess =
              (json \ "subscriptionProcess").as(using SeqValidationStepFormat),
            integrationProcess = (json \ "integrationProcess")
              .asOpt(using IntegrationProcessFormat)
              .getOrElse(IntegrationProcess.ApiKey),
            aggregationApiKeysSecurity =
              (json \ "aggregationApiKeysSecurity").asOpt[Boolean],
            paymentSettings =
              (json \ "paymentSettings").asOpt(using PaymentSettingsFormat),
            swagger = (json \ "swagger").asOpt(using SwaggerAccessFormat),
            testing = (json \ "testing").asOpt(using TestingFormat),
            documentation =
              (json \ "documentation").asOpt(using ApiDocumentationFormat),
            metadata = (json \ "metadata")
              .asOpt[Map[String, String]]
              .getOrElse(Map.empty)
          )
        )
      } recover { case e =>
        AppLogger.warn("Quotas with limits")
        AppLogger.error(e.getMessage, e)
        JsError(e.getMessage)
      } get

    override def writes(o: UsagePlan): JsValue =
      Json.obj(
        "_id" -> UsagePlanIdFormat.writes(o.id),
        "_tenant" -> TenantIdFormat.writes(o.tenant),
        "_deleted" -> o.deleted,
        "maxPerSecond" -> o.maxPerSecond,
        "maxPerDay" -> o.maxPerDay,
        "maxPerMonth" -> o.maxPerMonth
          .map(JsNumber(_))
          .getOrElse(JsNull)
          .as[JsValue],
        "costPerMonth" -> o.costPerMonth
          .map(JsNumber(_))
          .getOrElse(JsNull)
          .as[JsValue],
        "costPerRequest" -> o.costPerRequest
          .map(JsNumber(_))
          .getOrElse(JsNull)
          .as[JsValue],
        "billingDuration" -> o.billingDuration
          .map(_.asJson)
          .getOrElse(JsNull)
          .as[JsValue],
        "trialPeriod" -> o.trialPeriod
          .map(_.asJson)
          .getOrElse(JsNull)
          .as[JsValue],
        "currency" -> o.currency.map(_.asJson).getOrElse(JsNull).as[JsValue],
        "customName" -> o.customName,
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
        "subscriptionProcess" -> SeqValidationStepFormat.writes(
          o.subscriptionProcess
        ),
        "integrationProcess" -> IntegrationProcessFormat.writes(
          o.integrationProcess
        ),
        "aggregationApiKeysSecurity" -> o.aggregationApiKeysSecurity
          .map(JsBoolean.apply)
          .getOrElse(JsBoolean(false))
          .as[JsValue],
        "paymentSettings" -> o.paymentSettings
          .map(PaymentSettingsFormat.writes)
          .getOrElse(JsNull)
          .as[JsValue],
        "testing" -> o.testing
          .map(TestingFormat.writes)
          .getOrElse(JsNull)
          .as[JsValue],
        "documentation" -> o.documentation
          .map(ApiDocumentationFormat.writes)
          .getOrElse(JsNull)
          .as[JsValue],
        "swagger" -> o.swagger
          .map(SwaggerAccessFormat.writes)
          .getOrElse(JsNull)
          .as[JsValue],
        "metadata" -> JsObject(
          o.metadata.view.mapValues(JsString.apply).toSeq
        )
      )
  }
  val ConsoleSettingsFormat = new Format[ConsoleMailerSettings] {
    override def reads(json: JsValue): JsResult[ConsoleMailerSettings] =
      Try {
        JsSuccess(
          ConsoleMailerSettings(
            template = (json \ "template").asOpt[String]
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ConsoleMailerSettings): JsValue =
      Json.obj(
        "type" -> "console",
        "template" -> o.template
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue]
      )
  }
  val MailgunSettingsFormat = new Format[MailgunSettings] {
    override def reads(json: JsValue): JsResult[MailgunSettings] =
      Try {
        JsSuccess(
          MailgunSettings(
            domain = (json \ "domain").as[String],
            eu = (json \ "eu").asOpt[Boolean].getOrElse(false),
            key = (json \ "key").as[String],
            fromTitle = (json \ "fromTitle").as[String],
            fromEmail = (json \ "fromEmail").as[String],
            template = (json \ "template").asOpt[String],
            testingEmail = (json \ "testingEmail").asOpt[String]
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: MailgunSettings): JsValue =
      Json.obj(
        "type" -> "mailgun",
        "domain" -> o.domain,
        "eu" -> o.eu,
        "key" -> o.key,
        "fromTitle" -> o.fromTitle,
        "fromEmail" -> o.fromEmail,
        "template" -> o.template
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue],
        "testingEmail" -> o.testingEmail
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
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: MailjetSettings): JsValue =
      Json.obj(
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
  val SimpleSMTPClientSettingsFormat = new Format[SimpleSMTPSettings] {
    override def reads(json: JsValue): JsResult[SimpleSMTPSettings] = {
      Try {
        JsSuccess(
          SimpleSMTPSettings(
            host = (json \ "host").as[String],
            port = (json \ "port")
              .asOpt[String]
              .getOrElse((json \ "port").as[Int].toString),
            fromTitle = (json \ "fromTitle").as[String],
            fromEmail = (json \ "fromEmail").as[String],
            template = (json \ "template").asOpt[String],
            username = (json \ "username")
              .asOpt[String]
              .map(_.trim)
              .filterNot(_.isEmpty),
            password = (json \ "password")
              .asOpt[String]
              .map(_.trim)
              .filterNot(_.isEmpty)
          )
        )
      } recover { case e =>
        AppLogger.error(e.getMessage)
        JsError(e.getMessage)
      } get
    }

    override def writes(o: SimpleSMTPSettings): JsValue =
      Json.obj(
        "type" -> "smtpClient",
        "host" -> o.host,
        "port" -> o.port,
        "fromTitle" -> o.fromTitle,
        "fromEmail" -> o.fromEmail,
        "template" -> o.template
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue],
        "username" -> o.username
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue],
        "password" -> o.password
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue]
      )
  }
  val SendGridSettingsFormat = new Format[SendgridSettings] {
    override def reads(json: JsValue): JsResult[SendgridSettings] =
      Try {
        JsSuccess(
          SendgridSettings(
            apikey = (json \ "apikey").as[String],
            fromEmail = (json \ "fromEmail").as[String],
            fromTitle = (json \ "fromTitle").as[String],
            template = (json \ "template").asOpt[String]
          )
        )
      } recover { case e =>
        AppLogger.error(e.getMessage, e)
        JsError(e.getMessage)
      } get

    override def writes(o: SendgridSettings): JsValue =
      Json.obj(
        "type" -> "sendgrid",
        "apikey" -> o.apikey,
        "fromTitle" -> o.fromTitle,
        "fromEmail" -> o.fromEmail,
        "template" -> o.template
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue]
      )
  }

  val StripePriceIdsFormat = new Format[StripePriceIds] {
    override def reads(json: JsValue): JsResult[StripePriceIds] =
      Try {
        JsSuccess(
          StripePriceIds(
            basePriceId = (json \ "basePriceId").as[String],
            additionalPriceId = (json \ "additionalPriceId").asOpt[String]
          )
        )
      } recover { case e =>
        AppLogger.error(e.getMessage, e)
        JsError(e.getMessage)
      } get

    override def writes(o: StripePriceIds): JsValue =
      Json.obj(
        "basePriceId" -> o.basePriceId,
        "additionalPriceId" -> o.additionalPriceId
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue]
      )
  }

  val PaymentSettingsFormat = new Format[PaymentSettings] {
    override def reads(json: JsValue): JsResult[PaymentSettings] =
      (json \ "type").asOpt[String] match {
        case Some("Stripe") => StripePaymentSettingsFormat.reads(json)
        case Some(str) =>
          JsError(s"Bad notification payment settings value: $str")
        case None => JsError(s"No notification payment settings value")
      }

    override def writes(o: PaymentSettings): JsValue =
      o match {
        case s: PaymentSettings.Stripe =>
          StripePaymentSettingsFormat.writes(s).as[JsObject] ++ Json.obj(
            "type" -> "Stripe"
          )
      }
  }

  val StripePaymentSettingsFormat = new Format[PaymentSettings.Stripe] {
    override def reads(json: JsValue): JsResult[PaymentSettings.Stripe] =
      Try {
        JsSuccess(
          PaymentSettings.Stripe(
            thirdPartyPaymentSettingsId = (json \ "thirdPartyPaymentSettingsId")
              .as(using ThirdPartyPaymentSettingsIdFormat),
            productId = (json \ "productId").as[String],
            priceIds = (json \ "priceIds").as(using StripePriceIdsFormat)
          )
        )
      } recover { case e =>
        AppLogger.warn("Stripe Settings")
        AppLogger.error(e.getMessage, e)
        JsError(e.getMessage)
      } get

    override def writes(o: PaymentSettings.Stripe): JsValue =
      Json.obj(
        "thirdPartyPaymentSettingsId" -> o.thirdPartyPaymentSettingsId.asJson,
        "productId" -> o.productId,
        "priceIds" -> StripePriceIdsFormat.writes(o.priceIds)
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
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: OtoroshiApiKey): JsValue =
      Json.obj(
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
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: Currency): JsValue =
      Json.obj(
        "code" -> o.code
      )
  }
  val CustomMetadataFormat = new Format[CustomMetadata] {
    override def reads(json: JsValue): JsResult[CustomMetadata] =
      Try {
        JsSuccess(
          CustomMetadata(
            key = (json \ "key").as[String],
            possibleValues = (json \ "possibleValues")
              .asOpt[Seq[String]]
              .map(_.toSet)
              .getOrElse(Set.empty)
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: CustomMetadata): JsValue =
      Json.obj(
        "key" -> o.key,
        "possibleValues" -> JsArray(o.possibleValues.map(JsString.apply).toSeq)
      )

  }
  val ApikeyCustomizationFormat = new Format[ApikeyCustomization] {
    override def reads(json: JsValue): JsResult[ApikeyCustomization] =
      Try {
        JsSuccess(
          ApikeyCustomization(
            clientIdOnly =
              (json \ "clientIdOnly").asOpt[Boolean].getOrElse(false),
            readOnly = (json \ "readOnly").asOpt[Boolean].getOrElse(false),
            constrainedServicesOnly = (json \ "constrainedServicesOnly")
              .asOpt[Boolean]
              .getOrElse(false),
            metadata =
              (json \ "metadata").asOpt[JsObject].getOrElse(Json.obj()),
            customMetadata = (json \ "customMetadata")
              .asOpt(using SeqCustomMetadataFormat)
              .getOrElse(Seq.empty),
            tags = (json \ "tags").asOpt[JsArray].getOrElse(Json.arr()),
            restrictions = (json \ "restrictions").as(using ApiKeyRestrictionsFormat)
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApikeyCustomization): JsValue =
      Json.obj(
        "clientIdOnly" -> o.clientIdOnly,
        "constrainedServicesOnly" -> o.constrainedServicesOnly,
        "readOnly" -> o.readOnly,
        "metadata" -> o.metadata,
        "customMetadata" -> JsArray(
          o.customMetadata.map(CustomMetadataFormat.writes)
        ),
        "tags" -> o.tags,
        "restrictions" -> o.restrictions.asJson
      )
  }
  val ApiKeyRestrictionsFormat = new Format[ApiKeyRestrictions] {
    override def writes(o: ApiKeyRestrictions): JsValue =
      Json.obj(
        "enabled" -> o.enabled,
        "allowLast" -> o.allowLast,
        "allowed" -> JsArray(o.allowed.map(_.asJson)),
        "forbidden" -> JsArray(o.forbidden.map(_.asJson)),
        "notFound" -> JsArray(o.notFound.map(_.asJson))
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
                  .collect { case JsSuccess(rp, _) =>
                    rp
                  }
                  .toSeq
              )
              .getOrElse(Seq.empty),
            forbidden = (json \ "forbidden")
              .asOpt[JsArray]
              .map(
                _.value
                  .map(p => ApiKeyRestrictionPathFormat.reads(p))
                  .collect { case JsSuccess(rp, _) =>
                    rp
                  }
                  .toSeq
              )
              .getOrElse(Seq.empty),
            notFound = (json \ "notFound")
              .asOpt[JsArray]
              .map(
                _.value
                  .map(p => ApiKeyRestrictionPathFormat.reads(p))
                  .collect { case JsSuccess(rp, _) =>
                    rp
                  }
                  .toSeq
              )
              .getOrElse(Seq.empty)
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get
  }
  val ApiKeyRestrictionPathFormat = new Format[ApiKeyRestrictionPath] {
    override def writes(o: ApiKeyRestrictionPath): JsValue =
      Json.obj(
        "method" -> o.method,
        "path" -> o.path
      )

    override def reads(json: JsValue): JsResult[ApiKeyRestrictionPath] =
      Try {
        JsSuccess(
          ApiKeyRestrictionPath(
            method = (json \ "method").as[String],
            path = (json \ "path").as[String]
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get
  }
  val OtoroshiTargetFormat = new Format[OtoroshiTarget] {
    override def reads(json: JsValue): JsResult[OtoroshiTarget] = {
      Try {
        JsSuccess(
          OtoroshiTarget(
            otoroshiSettings =
              (json \ "otoroshiSettings").as(using OtoroshiSettingsIdFormat),
            authorizedEntities =
              (json \ "authorizedEntities").asOpt(using AuthorizedEntitiesFormat),
            apikeyCustomization = (json \ "apikeyCustomization")
              .asOpt(using ApikeyCustomizationFormat)
              .getOrElse(ApikeyCustomization())
          )
        )
      } recover { case e =>
//          AppLogger.error(e.getMessage, e)
        JsError(e.getMessage)
      } get
    }

    override def writes(o: OtoroshiTarget): JsValue =
      Json.obj(
        "otoroshiSettings" -> o.otoroshiSettings.asJson,
        "authorizedEntities" -> o.authorizedEntities
          .map(_.asJson)
          .getOrElse(JsNull)
          .as[JsValue],
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
              (json \ "otoroshiSettings").as(using OtoroshiSettingsIdFormat),
            service = (json \ "service").as(using OtoroshiServiceIdFormat)
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: OtoroshiService): JsValue =
      Json.obj(
        "name" -> o.name,
        "otoroshiSettings" -> o.otoroshiSettings.asJson,
        "service" -> o.service.asJson
      )
  }
  val SwaggerAccessFormat = new Format[SwaggerAccess] {
    override def reads(json: JsValue): JsResult[SwaggerAccess] = {
      json match {
        case JsObject(_) =>
          Try {
            JsSuccess(
              SwaggerAccess(
                url = (json \ "url").asOpt[String],
                content = (json \ "content").asOpt[String],
                headers = (json \ "headers")
                  .asOpt[Map[String, String]]
                  .getOrElse(Map.empty[String, String]),
                additionalConf = (json \ "additionalConf").asOpt[JsObject],
                specificationType = (json \ "specificationType")
                  .asOpt(using SpecificationTypeFormat)
                  .getOrElse(SpecificationType.OpenApi)
              )
            )
          } recover { case e =>
            AppLogger.error(e.getMessage, e)
            JsError(e.getMessage)
          } get
        case _ => JsError()
      }

    }

    override def writes(o: SwaggerAccess): JsValue =
      Json.obj(
        "url" -> o.url,
        "content" -> o.content,
        "headers" -> o.headers,
        "additionalConf" -> o.additionalConf.getOrElse(JsNull).as[JsValue],
        "specificationType" -> o.specificationType.name
      )
  }
  val ApiDocumentationPageFormat = new Format[ApiDocumentationPage] {
    override def reads(json: JsValue): JsResult[ApiDocumentationPage] =
      Try {
        JsSuccess(
          ApiDocumentationPage(
            id = (json \ "_id").as(using ApiDocumentationPageIdFormat),
            tenant = (json \ "_tenant").as(using TenantIdFormat),
            deleted = (json \ "_deleted").asOpt[Boolean].getOrElse(false),
            title = (json \ "title").as[String],
            lastModificationAt =
              (json \ "lastModificationAt").as(using DateTimeFormat),
            content = (json \ "content").asOpt[String].getOrElse(""),
            cmsPage = (json \ "cmsPage").asOpt[String],
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
      } recover { case e =>
        AppLogger.warn(e.getMessage)
        JsError(e.getMessage)
      } get

    override def writes(o: ApiDocumentationPage): JsValue =
      Json.obj(
        "_id" -> ApiDocumentationPageIdFormat.writes(o.id),
        "_humanReadableId" -> ApiDocumentationPageIdFormat.writes(o.id),
        "_tenant" -> o.tenant.asJson,
        "_deleted" -> o.deleted,
        "title" -> o.title,
        "lastModificationAt" -> DateTimeFormat.writes(o.lastModificationAt),
        "content" -> o.content,
        "cmsPage" -> o.cmsPage,
        "remoteContentEnabled" -> o.remoteContentEnabled,
        "contentType" -> o.contentType,
        "remoteContentUrl" -> o.remoteContentUrl
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue],
        "remoteContentHeaders" -> JsObject(
          o.remoteContentHeaders.view.mapValues(JsString.apply).toSeq
        )
      )
  }
  val ApiPostFormat = new Format[ApiPost] {
    override def reads(json: JsValue): JsResult[ApiPost] =
      Try {
        JsSuccess(
          ApiPost(
            id = (json \ "_id")
              .asOpt(using ApiPostIdFormat)
              .getOrElse(ApiPostId(IdGenerator.token(32))),
            tenant = (json \ "_tenant").as(using TenantIdFormat),
            deleted = (json \ "_deleted").asOpt[Boolean].getOrElse(false),
            title = (json \ "title").as[String],
            lastModificationAt =
              (json \ "lastModificationAt").as(using DateTimeFormat),
            content = (json \ "content").asOpt[String].getOrElse("")
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiPost): JsValue =
      Json.obj(
        "_id" -> ApiPostIdFormat.writes(o.id),
        "_humanReadableId" -> o.humanReadableId,
        "_tenant" -> o.tenant.asJson,
        "_deleted" -> o.deleted,
        "title" -> o.title,
        "lastModificationAt" -> DateTimeFormat.writes(o.lastModificationAt),
        "content" -> o.content
      )
  }
  val ApiIssueFormat = new Format[ApiIssue] {
    override def reads(json: JsValue): JsResult[ApiIssue] =
      Try {
        JsSuccess(
          ApiIssue(
            id = (json \ "_id")
              .asOpt(using ApiIssueIdFormat)
              .getOrElse(ApiIssueId(IdGenerator.token(32))),
            seqId = (json \ "seqId").asOpt[Int].getOrElse(0),
            tenant = (json \ "_tenant").as(using TenantIdFormat),
            deleted = (json \ "_deleted").asOpt[Boolean].getOrElse(false),
            title = (json \ "title").as[String],
            lastModificationAt = (json \ "lastModificationAt")
              .asOpt(using DateTimeFormat)
              .getOrElse(DateTime.now()),
            tags = (json \ "tags")
              .asOpt[Set[ApiIssueTagId]](using Reads.set(using ApiIssueTagIdFormat))
              .getOrElse(Set.empty),
            open = (json \ "open").asOpt[Boolean].getOrElse(true),
            createdAt = (json \ "createdAt")
              .asOpt(using DateTimeFormat)
              .getOrElse(DateTime.now()),
            by = (json \ "by").as(using UserIdFormat),
            comments = (json \ "comments")
              .asOpt[Seq[ApiIssueComment]](
                using Reads.seq(using ApiIssueCommentFormat)
              )
              .getOrElse(Seq.empty),
            closedAt = (json \ "closedAt")
              .asOpt(using DateTimeFormat),
            apiVersion = (json \ "apiVersion").asOpt[String]
          )
        )
      } recover { case e =>
        AppLogger.warn(e.getMessage)
        JsError(e.getMessage)
      } get

    override def writes(o: ApiIssue): JsValue =
      Json.obj(
        "_id" -> o.id.asJson,
        "_humanReadableId" -> o.humanReadableId,
        "seqId" -> o.seqId,
        "_tenant" -> o.tenant.asJson,
        "_deleted" -> o.deleted,
        "title" -> o.title,
        "lastModificationAt" -> DateTimeFormat.writes(o.lastModificationAt),
        "tags" -> o.tags.map(ApiIssueTagIdFormat.writes),
        "open" -> o.open,
        "createdAt" -> DateTimeFormat.writes(o.createdAt),
        "closedAt" -> o.closedAt
          .map(DateTimeFormat.writes)
          .getOrElse(JsNull)
          .as[JsValue],
        "by" -> o.by.asJson,
        "comments" -> o.comments.map(ApiIssueCommentFormat.writes),
        "apiVersion" -> o.apiVersion
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue]
      )
  }
  val ApiIssueTagIdFormat = new Format[ApiIssueTagId] {
    override def reads(json: JsValue): JsResult[ApiIssueTagId] =
      Try {
        JsSuccess(ApiIssueTagId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiIssueTagId): JsValue = JsString(o.value)
  }

  val ApiDocumentationDetailPageFormat =
    new Format[ApiDocumentationDetailPage] {
      override def reads(json: JsValue): JsResult[ApiDocumentationDetailPage] =
        Try {
          JsSuccess(
            ApiDocumentationDetailPage(
              id = (json \ "id").as(using ApiDocumentationPageIdFormat),
              title = (json \ "title").as[String],
              children =
                (json \ "children").as(using SeqApiDocumentationDetailPageFormat)
            )
          )
        } recover { case e =>
          JsError(e.getMessage)
        } get

      override def writes(o: ApiDocumentationDetailPage): JsValue =
        Json.obj(
          "id" -> o.id.asJson,
          "title" -> o.title,
          "children" -> SeqApiDocumentationDetailPageFormat.writes(o.children)
        )

    }

  val ApiDocumentationFormat = new Format[ApiDocumentation] {
    override def reads(json: JsValue): JsResult[ApiDocumentation] =
      Try {
        JsSuccess(
          ApiDocumentation(
            id = (json \ "_id").as(using ApiDocumentationIdFormat),
            tenant = (json \ "_tenant").as(using TenantIdFormat),
            // api = (json \ "api").as(ApiIdFormat),
            pages = (json \ "pages")
              .asOpt(using SeqApiDocumentationDetailPageFormat)
              .getOrElse(Seq.empty[ApiDocumentationDetailPage]),
            lastModificationAt =
              (json \ "lastModificationAt").as(using DateTimeFormat)
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiDocumentation): JsValue =
      Json.obj(
        "_id" -> ApiDocumentationIdFormat.writes(o.id),
        "_tenant" -> o.tenant.asJson,
        "pages" -> SeqApiDocumentationDetailPageFormat.writes(o.pages),
        "lastModificationAt" -> DateTimeFormat.writes(o.lastModificationAt)
      )
  }
  val DaikokuStyleFormat = new Format[DaikokuStyle] {
    override def reads(json: JsValue): JsResult[DaikokuStyle] =
      Try {
        JsSuccess(
          DaikokuStyle(
            jsCmsPage = (json \ "jsCmsPage").as[String],
            cssCmsPage = (json \ "cssCmsPage").as[String],
            colorThemeCmsPage = (json \ "colorThemeCmsPage").as[String],
            jsUrl = (json \ "jsUrl").asOpt[String],
            cssUrl = (json \ "cssUrl").asOpt[String],
            faviconUrl = (json \ "faviconUrl").asOpt[String],
            fontFamilyUrl = (json \ "fontFamilyUrl").asOpt[String],
            title =
              (json \ "title").asOpt[String].getOrElse("New Organization"),
            description = (json \ "description")
              .asOpt[String]
              .getOrElse("A new organization to host very fine APIs"),
            unloggedHome = (json \ "unloggedHome").asOpt[String].getOrElse(""),
            homePageVisible =
              (json \ "homePageVisible").asOpt[Boolean].getOrElse(false),
            homeCmsPage = (json \ "homeCmsPage").asOpt[String],
            notFoundCmsPage = (json \ "notFoundCmsPage").asOpt[String],
            authenticatedCmsPage =
              (json \ "authenticatedCmsPage").asOpt[String],
            logo = (json \ "logo")
              .asOpt[String],
            logoDark = (json \ "logoDark")
              .asOpt[String],
            logoMin = (json \ "logoMin")
              .asOpt[String],
            logoMinDark = (json \ "logoMinDark")
              .asOpt[String]
          )
        )
      } recover { case e =>
        AppLogger.error(e.getMessage, e)
        JsError(e.getMessage)
      } get

    override def writes(o: DaikokuStyle): JsValue =
      Json.obj(
        "cssCmsPage" -> o.cssCmsPage,
        "colorThemeCmsPage" -> o.colorThemeCmsPage,
        "jsCmsPage" -> o.jsCmsPage,
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
        "homeCmsPage" -> o.homeCmsPage
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue],
        "notFoundCmsPage" -> o.notFoundCmsPage
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue],
        "authenticatedCmsPage" -> o.authenticatedCmsPage
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue],
        "homePageVisible" -> o.homePageVisible,
        "logo" -> o.logo
          .filter(_.trim.nonEmpty)
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue],
        "logoMin" -> o.logoMin
          .filter(_.trim.nonEmpty)
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue],
        "logoDark" -> o.logoDark
          .filter(_.trim.nonEmpty)
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue],
        "logoMinDark" -> o.logoMinDark
          .filter(_.trim.nonEmpty)
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue]
      )
  }
  val TenantFormat = new Format[Tenant] {
    override def reads(json: JsValue): JsResult[Tenant] =
      Try {
        JsSuccess(
          Tenant(
            id = (json \ "_id").as(using TenantIdFormat),
            enabled = (json \ "enabled").as[Boolean],
            deleted = (json \ "_deleted").asOpt[Boolean].getOrElse(false),
            name = (json \ "name").as[String],
            domain = (json \ "domain").asOpt[String].getOrElse("localhost"),
            defaultLanguage = (json \ "defaultLanguage").asOpt[String],
            contact = (json \ "contact").as[String],
            style = (json \ "style").asOpt(using DaikokuStyleFormat),
            otoroshiSettings = (json \ "otoroshiSettings")
              .asOpt(using SeqOtoroshiSettingsFormat)
              .map(_.toSet)
              .getOrElse(Set.empty),
            mailerSettings =
              (json \ "mailerSettings").asOpt(using MailerSettingsFormat),
            bucketSettings =
              (json \ "bucketSettings").asOpt[JsObject].flatMap { settings =>
                S3Configuration.format.reads(settings).asOpt
              },
            authProvider = (json \ "authProvider")
              .asOpt[String]
              .flatMap(AuthProvider.apply)
              .getOrElse(AuthProvider.Otoroshi),
            auditTrailConfig = (json \ "auditTrailConfig")
              .asOpt(using AuditTrailConfigFormat)
              .getOrElse(AuditTrailConfig()),
            authProviderSettings = (json \ "authProviderSettings")
              .asOpt[JsObject]
              .getOrElse(
                Json.obj(
                  "claimSecret" -> Option(
                    System.getenv("DAIKOKU_OTOROSHI_CLAIM_SECRET")
                  ).orElse(Option(System.getenv("CLAIM_SHAREDKEY")))
                    .getOrElse("secret")
                    .asInstanceOf[String],
                  "claimHeaderName" -> Option(
                    System.getenv("DAIKOKU_OTOROSHI_CLAIM_HEADER_NAME")
                  ).getOrElse("Otoroshi-Claim")
                    .asInstanceOf[String]
                )
              ),
            isPrivate = (json \ "isPrivate").asOpt[Boolean].getOrElse(true),
            adminApi = (json \ "adminApi").as(using ApiIdFormat),
            adminSubscriptions = (json \ "adminSubscriptions")
              .asOpt(using SeqApiSubscriptionIdFormat)
              .getOrElse(Seq.empty),
            creationSecurity = (json \ "creationSecurity")
              .asOpt[Boolean],
            subscriptionSecurity = (json \ "subscriptionSecurity")
              .asOpt[Boolean],
            apiReferenceHideForGuest = (json \ "apiReferenceHideForGuest")
              .asOpt[Boolean],
            defaultMessage = (json \ "defaultMessage")
              .asOpt[String],
            tenantMode = (json \ "tenantMode").asOpt(using TenantModeFormat),
            aggregationApiKeysSecurity = (json \ "aggregationApiKeysSecurity")
              .asOpt[Boolean],
            environmentAggregationApiKeysSecurity =
              (json \ "environmentAggregationApiKeysSecurity")
                .asOpt[Boolean],
            robotTxt = (json \ "robotTxt").asOpt[String],
            thirdPartyPaymentSettings = (json \ "thirdPartyPaymentSettings")
              .asOpt(using SeqThirdPartyPaymentSettingsFormat)
              .getOrElse(Seq.empty),
            display = (json \ "display")
              .asOpt(using TenantDisplayFormat)
              .getOrElse(TenantDisplay.Default),
            environments = (json \ "environments")
              .asOpt[Set[String]]
              .getOrElse(Set.empty),
            clientNamePattern = (json \ "clientNamePattern")
              .asOpt[String],
            accountCreationProcess = (json \ "accountCreationProcess")
              .asOpt(using SeqValidationStepFormat)
              .getOrElse(Seq.empty),
            defaultAuthorizedOtoroshiEntities =
              (json \ "defaultAuthorizedOtoroshiEntities")
                .asOpt(using SeqTeamAuthorizedEntitiesFormat),
            teamCreationSecurity =
              (json \ "teamCreationSecurity").asOpt[Boolean]
          )
        )
      } recover { case e: Throwable =>
        AppLogger.warn(e.getMessage)
        JsError(e.getMessage)
      } get

    override def writes(o: Tenant): JsValue =
      Json.obj(
        "_id" -> TenantIdFormat.writes(o.id),
        "_humanReadableId" -> o.name.urlPathSegmentSanitized,
        "_deleted" -> o.deleted,
        "name" -> o.name,
        "domain" -> o.domain,
        "defaultLanguage" -> o.defaultLanguage
          .fold(JsNull.as[JsValue])(JsString.apply),
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
          o.adminSubscriptions.map(ApiSubscriptionIdFormat.writes)
        ),
        "creationSecurity" -> o.creationSecurity
          .map(JsBoolean)
          .getOrElse(JsBoolean(false))
          .as[JsValue],
        "subscriptionSecurity" -> o.subscriptionSecurity
          .map(JsBoolean)
          .getOrElse(JsBoolean(true))
          .as[JsValue],
        "apiReferenceHideForGuest" -> o.apiReferenceHideForGuest
          .map(JsBoolean)
          .getOrElse(JsBoolean(true))
          .as[JsValue],
        "defaultMessage" -> o.defaultMessage
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue],
        "tenantMode" -> o.tenantMode
          .map(TenantModeFormat.writes)
          .getOrElse(JsNull)
          .as[JsValue],
        "aggregationApiKeysSecurity" -> o.aggregationApiKeysSecurity
          .map(JsBoolean)
          .getOrElse(JsBoolean(false))
          .as[JsValue],
        "environmentAggregationApiKeysSecurity" -> o.environmentAggregationApiKeysSecurity
          .map(JsBoolean)
          .getOrElse(JsBoolean(false))
          .as[JsValue],
        "robotTxt" -> o.robotTxt
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue],
        "thirdPartyPaymentSettings" -> SeqThirdPartyPaymentSettingsFormat
          .writes(o.thirdPartyPaymentSettings),
        "display" -> TenantDisplayFormat.writes(o.display),
        "environments" -> JsArray(o.environments.map(JsString.apply).toSeq),
        "clientNamePattern" -> o.clientNamePattern,
        "accountCreationProcess" -> SeqValidationStepFormat.writes(
          o.accountCreationProcess
        ),
        "defaultAuthorizedOtoroshiEntities" -> o.defaultAuthorizedOtoroshiEntities
          .map(SeqTeamAuthorizedEntitiesFormat.writes)
          .getOrElse(JsNull)
          .as[JsValue],
        "teamCreationSecurity" -> o.teamCreationSecurity
          .map(JsBoolean)
          .getOrElse(JsBoolean(false))
          .as[JsValue]
      )
  }

  val MailerSettingsFormat = new Format[MailerSettings] {
    override def reads(settings: JsValue): JsResult[MailerSettings] =
      (settings \ "type").as[String] match {
        case "mailgun" => MailgunSettingsFormat.reads(settings)
        case "mailjet" => MailjetSettingsFormat.reads(settings)
        case "sendgrid" =>
          SendGridSettingsFormat.reads(settings)
        case "smtpClient" =>
          SimpleSMTPClientSettingsFormat.reads(settings)
        case "console" => ConsoleSettingsFormat.reads(settings)
      }
    override def writes(o: MailerSettings): JsValue = o.asJson
  }

  val AuditTrailConfigFormat = new Format[AuditTrailConfig] {
    override def reads(json: JsValue): JsResult[AuditTrailConfig] =
      Try {
        JsSuccess(
          AuditTrailConfig(
            elasticConfigs = (json \ "elasticConfigs")
              .asOpt[ElasticAnalyticsConfig](using ElasticAnalyticsConfig.format),
            auditWebhooks = (json \ "auditWebhooks")
              .asOpt[Seq[Webhook]](using Reads.seq(using Webhook.format))
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
                  (config \ "auditTopic").asOpt[String].filter(_.nonEmpty),
                  (config \ "hostValidation").asOpt[Boolean]
                ) match {
                  case (
                        Some(servers),
                        keyPass,
                        keystore,
                        truststore,
                        Some(auditTopic),
                        hostValidation
                      ) =>
                    Some(
                      KafkaConfig(
                        servers,
                        keyPass,
                        keystore,
                        truststore,
                        auditTopic,
                        hostValidation
                      )
                    )
                  case e => None
                }
              }
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: AuditTrailConfig): JsValue =
      Json.obj(
        "elasticConfigs" -> o.elasticConfigs.map(_.toJson),
        "auditWebhooks" -> JsArray(o.auditWebhooks.map(_.toJson)),
        "alertsEmails" -> JsArray(o.alertsEmails.map(JsString.apply)),
        "kafkaConfig" -> o.kafkaConfig.map(KafkaConfig.format.writes)
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
            id = (json \ "_id").as(using UserIdFormat),
            deleted = (json \ "_deleted").asOpt[Boolean].getOrElse(false),
            tenants = (json \ "tenants")
              .asOpt(using SeqTenantIdFormat)
              .map(_.toSet)
              .getOrElse(Set.empty),
            origins = (json \ "origins")
              .asOpt[Seq[String]]
              .map(seq =>
                seq
                  .map(AuthProvider.apply)
                  .filter(_.isDefined)
                  .map(_.get)
                  .toSet
              )
              .getOrElse(Set.empty),
            name = (json \ "name").as[String],
            email = (json \ "email").as[String],
            picture = (json \ "picture")
              .asOpt[String]
              .getOrElse((json \ "email").as[String].gravatar),
            pictureFromProvider =
              (json \ "pictureFromProvider").asOpt[Boolean].getOrElse(true),
            password = (json \ "password").asOpt[String],
            hardwareKeyRegistrations = (json \ "hardwareKeyRegistrations")
              .asOpt[Seq[JsObject]]
              .getOrElse(Seq.empty[JsObject]),
            isDaikokuAdmin =
              (json \ "isDaikokuAdmin").asOpt[Boolean].getOrElse(false),
            personalToken = (json \ "personalToken").asOpt[String],
            lastTenant = (json \ "lastTenant").asOpt(using TenantIdFormat),
            metadata = (json \ "metadata")
              .asOpt[Map[String, String]]
              .getOrElse(Map.empty),
            defaultLanguage = (json \ "defaultLanguage").asOpt[String],
            starredApis =
              (json \ "starredApis").asOpt(using SetApiIdFormat).getOrElse(Set.empty),
            twoFactorAuthentication = (json \ "twoFactorAuthentication").asOpt(
              using TwoFactorAuthenticationFormat
            ),
            invitation = (json \ "invitation").asOpt(using UserInvitationFormat)
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: User): JsValue =
      Json.obj(
        "_id" -> UserIdFormat.writes(o.id),
        "_humanReadableId" -> o.email.urlPathSegmentSanitized,
        "_deleted" -> o.deleted,
        "tenants" -> SeqTenantIdFormat.writes(o.tenants.toSeq),
        "origins" -> JsArray(o.origins.toSeq.map(o => JsString(o.name))),
        "name" -> o.name,
        "email" -> o.email,
        "picture" -> o.picture,
        "pictureFromProvider" -> o.pictureFromProvider,
        "password" -> o.password,
        "isDaikokuAdmin" -> o.isDaikokuAdmin,
        "personalToken" -> o.personalToken
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue],
        "hardwareKeyRegistrations" -> JsArray(o.hardwareKeyRegistrations),
        "lastTenant" -> o.lastTenant
          .map(_.asJson)
          .getOrElse(JsNull)
          .as[JsValue],
        "metadata" -> JsObject(o.metadata.view.mapValues(JsString.apply).toSeq),
        "defaultLanguage" -> o.defaultLanguage
          .fold(JsNull.as[JsValue])(JsString.apply),
        "isGuest" -> o.isGuest,
        "starredApis" -> SetApiIdFormat.writes(o.starredApis),
        "twoFactorAuthentication" -> o.twoFactorAuthentication
          .map(TwoFactorAuthenticationFormat.writes)
          .getOrElse(JsNull)
          .as[JsValue],
        "invitation" -> o.invitation
          .map(UserInvitationFormat.writes)
          .getOrElse(JsNull)
          .as[JsValue]
      )
  }

  val TeamFormat = new Format[Team] {
    override def reads(json: JsValue): JsResult[Team] = {
      Try {
        JsSuccess(
          Team(
            id = (json \ "_id").as(using TeamIdFormat),
            tenant = (json \ "_tenant").as(using TenantIdFormat),
            deleted = (json \ "_deleted").asOpt[Boolean].getOrElse(false),
            `type` = (json \ "type").as(using TeamTypeFormat),
            name = (json \ "name").as[String],
            contact = (json \ "contact").as[String],
            description = (json \ "description").asOpt[String].getOrElse(""),
            avatar = (json \ "avatar").asOpt[String],
            users = (json \ "users")
              .asOpt(using SetUserWithPermissionFormat)
              .map(_.toSet)
              .getOrElse(Set.empty[UserWithPermission]),
            authorizedOtoroshiEntities = (json \ "authorizedOtoroshiEntities")
              .asOpt(using SeqTeamAuthorizedEntitiesFormat),
            metadata = (json \ "metadata")
              .asOpt[Map[String, String]]
              .getOrElse(Map.empty),
            apiKeyVisibility = (json \ "apiKeyVisibility")
              .asOpt[String]
              .flatMap(TeamApiKeyVisibility.apply),
            apisCreationPermission = (json \ "apisCreationPermission")
              .asOpt[Boolean],
            verified = (json \ "verified").as[Boolean]
          )
        )
      } recover { case e =>
        AppLogger.error(e.getMessage, e)
        JsError(e.getMessage)
      } get
    }

    override def writes(o: Team): JsValue =
      Json.obj(
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
        "authorizedOtoroshiEntities" -> o.authorizedOtoroshiEntities
          .map(SeqTeamAuthorizedEntitiesFormat.writes)
          .getOrElse(JsNull)
          .as[JsValue],
        "apiKeyVisibility" -> o.apiKeyVisibility
          .map(_.asJson)
          .getOrElse(JsNull)
          .as[JsValue],
        "metadata" -> JsObject(o.metadata.view.mapValues(JsString.apply).toSeq),
        "apisCreationPermission" -> o.apisCreationPermission
          .map(JsBoolean)
          .getOrElse(JsNull)
          .as[JsValue],
        "verified" -> o.verified
      )
  }

  def TeamAuthorizedEntitiesFormat =
    new Format[TeamAuthorizedEntities] {
      override def writes(o: TeamAuthorizedEntities): JsValue =
        Json.obj(
          "otoroshiSettingsId" -> o.otoroshiSettingsId.asJson,
          "authorizedEntities" -> o.authorizedEntities.asJson
        )

      override def reads(json: JsValue): JsResult[TeamAuthorizedEntities] = {
        Try {
          JsSuccess(
            TeamAuthorizedEntities(
              otoroshiSettingsId =
                (json \ "otoroshiSettingsId").as(using OtoroshiSettingsIdFormat),
              authorizedEntities =
                (json \ "authorizedEntities").as(using AuthorizedEntitiesFormat)
            )
          )
        } recover { case e =>
          println("Team AuthorizedEntities format error")
          JsError(e.getMessage)
        } get
      }
    }

  val ApiFormat = new Format[Api] {
    override def reads(json: JsValue): JsResult[Api] = {
      Try {
        JsSuccess(
          Api(
            id = (json \ "_id").as(using ApiIdFormat),
            tenant = (json \ "_tenant").as(using TenantIdFormat),
            team = (json \ "team").as(using TeamIdFormat),
            deleted = (json \ "_deleted").asOpt[Boolean].getOrElse(false),
            name = (json \ "name").as[String],
            lastUpdate = (json \ "lastUpdate").as(using DateTimeFormat),
            createdAt = (json \ "createdAt").asOpt(using DateTimeFormat).getOrElse(DateTime.now()),
            description = (json \ "description").asOpt[String].getOrElse(""),
            smallDescription =
              (json \ "smallDescription").asOpt[String].getOrElse(""),
            customHeaderCmsPage = (json \ "customHeaderCmsPage").asOpt[String],
            descriptionCmsPage = (json \ "descriptionCmsPage").asOpt[String],
            header = (json \ "header").asOpt[String],
            image = (json \ "image").asOpt[String],
            currentVersion = (json \ "currentVersion").as(using VersionFormat),
            supportedVersions = (json \ "supportedVersions")
              .asOpt(using SeqVersionFormat)
              .map(_.toSet)
              .getOrElse(Set.empty),
            testing = (json \ "testing").asOpt(using TestingFormat),
            documentation = (json \ "documentation")
              .as(using ApiDocumentationFormat),
            swagger = (json \ "swagger").asOpt(using SwaggerAccessFormat),
            tags = (json \ "tags")
              .asOpt[Seq[String]]
              .map(_.toSet)
              .getOrElse(Set.empty),
            categories = (json \ "categories")
              .asOpt[Seq[String]]
              .map(_.toSet)
              .getOrElse(Set.empty),
            visibility = (json \ "visibility").as(using ApiVisibilityFormat),
            possibleUsagePlans = (json \ "possibleUsagePlans")
              .as(using SeqUsagePlanIdFormat),
            defaultUsagePlan =
              (json \ "defaultUsagePlan").asOpt(using UsagePlanIdFormat),
            authorizedTeams = (json \ "authorizedTeams")
              .asOpt(using SeqTeamIdFormat)
              .getOrElse(Seq.empty),
            posts = (json \ "posts")
              .asOpt(using SeqPostIdFormat)
              .getOrElse(Seq.empty),
            issues = (json \ "issues")
              .asOpt(using SeqIssueIdFormat)
              .getOrElse(Seq.empty),
            issuesTags = (json \ "issuesTags")
              .asOpt(using SetApiTagFormat)
              .getOrElse(Set.empty),
            stars = (json \ "stars").asOpt[Int].getOrElse(0),
            parent = (json \ "parent").asOpt(using ApiIdFormat),
            isDefault = (json \ "isDefault").asOpt[Boolean].getOrElse(false),
            apis = (json \ "apis").asOpt(using SetApiIdFormat),
            state = (json \ "state").as(using ApiStateFormat),
            metadata = (json \ "metadata")
              .asOpt[Map[String, String]]
              .getOrElse(Map.empty)
          )
        )
      } recover { case e =>
        AppLogger.error("API format error")
        AppLogger.error(e.toString, e)
        JsError(e.getMessage)
      } get
    }

    override def writes(o: Api): JsValue =
      Json.obj(
        "_id" -> ApiIdFormat.writes(o.id),
        "_humanReadableId" -> o.name.urlPathSegmentSanitized,
        "_tenant" -> o.tenant.asJson,
        "team" -> TeamIdFormat.writes(o.team),
        "_deleted" -> o.deleted,
        "lastUpdate" -> DateTimeFormat.writes(o.lastUpdate),
        "createdAt" -> DateTimeFormat.writes(o.createdAt),
        "name" -> o.name,
        "smallDescription" -> o.smallDescription,
        "customHeaderCmsPage" -> o.customHeaderCmsPage,
        "descriptionCmsPage" -> o.descriptionCmsPage,
        "header" -> o.header.map(JsString.apply).getOrElse(JsNull).as[JsValue],
        "image" -> o.image.map(JsString.apply).getOrElse(JsNull).as[JsValue],
        "description" -> o.description,
        "currentVersion" -> VersionFormat.writes(o.currentVersion),
        "supportedVersions" -> JsArray(o.supportedVersions.map(_.asJson).toSeq),
        "testing" -> o.testing.map(_.asJson).getOrElse(JsNull).as[JsValue],
        "documentation" -> o.documentation.asJson,
        "swagger" -> o.swagger
          .map(SwaggerAccessFormat.writes)
          .getOrElse(JsNull)
          .as[JsValue],
        // "serviceGroup" -> o.serviceGroup.map(_.asJson).getOrElse(JsNull).as[JsValue],
        "tags" -> JsArray(o.tags.map(JsString.apply).toSeq),
        "categories" -> JsArray(o.categories.map(JsString.apply).toSeq),
        "visibility" -> ApiVisibilityFormat.writes(o.visibility),
        "possibleUsagePlans" -> SeqUsagePlanIdFormat.writes(
          o.possibleUsagePlans
        ),
        "defaultUsagePlan" -> o.defaultUsagePlan
          .map(UsagePlanIdFormat.writes)
          .getOrElse(JsNull)
          .as[JsValue],
        "authorizedTeams" -> JsArray(
          o.authorizedTeams.map(TeamIdFormat.writes)
        ),
        "posts" -> SeqPostIdFormat.writes(o.posts),
        "issues" -> SeqIssueIdFormat.writes(o.issues),
        "issuesTags" -> SetApiTagFormat.writes(o.issuesTags),
        "stars" -> o.stars,
        "parent" -> o.parent
          .map(ApiIdFormat.writes)
          .getOrElse(JsNull)
          .as[JsValue],
        "isDefault" -> o.isDefault,
        "apis" -> o.apis
          .map(SetApiIdFormat.writes)
          .getOrElse(JsNull)
          .as[JsValue],
        "state" -> ApiStateFormat.writes(o.state),
        "metadata" -> JsObject(
          o.metadata.view.mapValues(JsString.apply).toSeq
        )
      )
  }

  val ApiKeyRotationFormat: Format[ApiKeyRotation] =
    new Format[ApiKeyRotation] {
      override def reads(json: JsValue): JsResult[ApiKeyRotation] =
        Try {
          JsSuccess(
            ApiKeyRotation(
              enabled = (json \ "enabled").as[Boolean],
              rotationEvery = (json \ "rotationEvery").as(using LongFormat),
              gracePeriod = (json \ "gracePeriod").as(using LongFormat),
              nextSecret = (json \ "nextSecret").asOpt[String]
            )
          )
        } recover { case e =>
          JsError(e.getMessage)
        } get

      override def writes(o: ApiKeyRotation): JsValue =
        Json.obj(
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
            rotationEvery = (json \ "rotationEvery").as(using LongFormat),
            gracePeriod = (json \ "gracePeriod").as(using LongFormat),
            pendingRotation = (json \ "pendingRotation").as[Boolean]
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiSubscriptionRotation): JsValue =
      Json.obj(
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
            id = (json \ "_id").as(using ApiSubscriptionIdFormat),
            tenant = (json \ "_tenant").as(using TenantIdFormat),
            deleted = (json \ "_deleted").asOpt[Boolean].getOrElse(false),
            apiKey = (json \ "apiKey").as(using OtoroshiApiKeyFormat),
            plan = (json \ "plan").as(using UsagePlanIdFormat),
            team = (json \ "team").as(using TeamIdFormat),
            api = (json \ "api").as(using ApiIdFormat),
            createdAt = (json \ "createdAt").as(using DateTimeFormat),
            validUntil = (json \ "validUntil").asOpt(using DateTimeFormat),
            by = (json \ "by").as(using UserIdFormat),
            customName = (json \ "customName").asOpt[String],
            adminCustomName = (json \ "adminCustomName").asOpt[String],
            enabled = (json \ "enabled").asOpt[Boolean].getOrElse(true),
            rotation =
              (json \ "rotation").asOpt(using ApiSubscriptionyRotationFormat),
            integrationToken = (json \ "integrationToken").as[String],
            bearerToken = (json \ "bearerToken").asOpt[String],
            metadata = (json \ "metadata").asOpt[JsObject],
            customMetadata = (json \ "customMetadata").asOpt[JsObject],
            tags = (json \ "tags").asOpt[Set[String]],
            customMaxPerSecond =
              (json \ "customMaxPerSecond").asOpt(using LongFormat),
            customMaxPerDay = (json \ "customMaxPerDay").asOpt(using LongFormat),
            customMaxPerMonth = (json \ "customMaxPerMonth").asOpt(using LongFormat),
            customReadOnly = (json \ "customReadOnly").asOpt[Boolean],
            parent = (json \ "parent").asOpt(using ApiSubscriptionIdFormat),
            thirdPartySubscriptionInformations =
              (json \ "thirdPartySubscriptionInformations") match {
                case JsDefined(value) =>
                  value match {
                    case JsNull => None
                    case _ =>
                      ThirdPartySubscriptionInformationsFormat
                        .reads(value)
                        .get
                        .some
                  }
                case _: JsUndefined => None
              }
          )
        )
      } recover { case e =>
        AppLogger.error("ApiSubscriptionFormat error")
        AppLogger.error(e.getMessage, e)
        JsError(e.getMessage)
      } get

    override def writes(o: ApiSubscription): JsValue =
      Json.obj(
        "_id" -> ApiSubscriptionIdFormat.writes(o.id),
        "_tenant" -> o.tenant.asJson,
        "_deleted" -> o.deleted,
        "apiKey" -> OtoroshiApiKeyFormat.writes(o.apiKey),
        "plan" -> UsagePlanIdFormat.writes(o.plan),
        "team" -> TeamIdFormat.writes(o.team),
        "api" -> ApiIdFormat.writes(o.api),
        "createdAt" -> DateTimeFormat.writes(o.createdAt),
        "validUntil" -> o.validUntil
          .map(DateTimeFormat.writes)
          .getOrElse(JsNull)
          .as[JsValue],
        "by" -> UserIdFormat.writes(o.by),
        "customName" -> o.customName
          .map(id => JsString(id))
          .getOrElse(JsNull)
          .as[JsValue],
        "adminCustomName" -> o.adminCustomName
          .map(id => JsString(id))
          .getOrElse(JsNull)
          .as[JsValue],
        "enabled" -> o.enabled,
        "rotation" -> o.rotation
          .map(ApiSubscriptionyRotationFormat.writes)
          .getOrElse(JsNull)
          .as[JsValue],
        "integrationToken" -> o.integrationToken,
        "bearerToken" -> o.bearerToken,
        "metadata" -> o.metadata,
        "customMetadata" -> o.customMetadata,
        "tags" -> JsArray(
          o.tags.getOrElse(Set.empty).toSeq.map(JsString.apply)
        ),
        "customMaxPerSecond" -> o.customMaxPerSecond
          .map(JsNumber(_))
          .getOrElse(JsNull)
          .as[JsValue],
        "customMaxPerDay" -> o.customMaxPerDay
          .map(JsNumber(_))
          .getOrElse(JsNull)
          .as[JsValue],
        "customMaxPerMonth" -> o.customMaxPerMonth
          .map(JsNumber(_))
          .getOrElse(JsNull)
          .as[JsValue],
        "customReadOnly" -> o.customReadOnly
          .map(JsBoolean.apply)
          .getOrElse(JsNull)
          .as[JsValue],
        "parent" -> o.parent
          .map(ApiSubscriptionIdFormat.writes)
          .getOrElse(JsNull)
          .as[JsValue],
        "thirdPartySubscriptionInformations" -> o.thirdPartySubscriptionInformations
          .map(ThirdPartySubscriptionInformationsFormat.writes)
          .getOrElse(JsNull)
          .as[JsValue]
      )
  }

  val ThirdPartySubscriptionInformationsFormat =
    new Format[ThirdPartySubscriptionInformations] {
      override def reads(
          json: JsValue
      ): JsResult[ThirdPartySubscriptionInformations] = {
        (json \ "type").as[String] match {
          case "stripe" => StripeSubscriptionInformationsFormat.reads(json)
        }
      }

      override def writes(o: ThirdPartySubscriptionInformations): JsValue =
        o match {
          case i: StripeSubscriptionInformations =>
            StripeSubscriptionInformationsFormat
              .writes(i)
              .as[JsObject] + ("type" -> JsString("stripe"))
        }
    }
  val StripeSubscriptionInformationsFormat =
    new Format[StripeSubscriptionInformations] {
      override def reads(
          json: JsValue
      ): JsResult[StripeSubscriptionInformations] =
        Try {
          JsSuccess(
            StripeSubscriptionInformations(
              subscriptionId = (json \ "subscriptionId").as[String],
              primaryElementId = (json \ "primaryElementId").asOpt[String],
              meteredElementId = (json \ "meteredElementId").asOpt[String]
            )
          )
        } recover { case e =>
          AppLogger.error(e.getMessage, e)
          JsError(e.getMessage)
        } get

      override def writes(o: StripeSubscriptionInformations): JsValue =
        Json.obj(
          "subscriptionId" -> o.subscriptionId,
          "primaryElementId" -> o.primaryElementId,
          "meteredElementId" -> o.meteredElementId
        )
    }

  val SubscriptionDemandStateFormat = new Format[SubscriptionDemandState] {
    override def reads(json: JsValue) =
      json.as[String] match {
        case "waiting"    => JsSuccess(SubscriptionDemandState.Waiting)
        case "inProgress" => JsSuccess(SubscriptionDemandState.InProgress)
        case "canceled"   => JsSuccess(SubscriptionDemandState.Canceled)
        case "accepted"   => JsSuccess(SubscriptionDemandState.Accepted)
        case "refused"    => JsSuccess(SubscriptionDemandState.Refused)
        case "blocked"    => JsSuccess(SubscriptionDemandState.Blocked)
        case str          => JsError(s"Bad SubscriptionDemandState value: $str")
      }

    override def writes(o: SubscriptionDemandState): JsValue = JsString(o.name)
  }

  val SubscriptionDemandFormat = new Format[SubscriptionDemand] {
    override def writes(o: SubscriptionDemand): JsValue =
      Json.obj(
        "_id" -> o.id.asJson,
        "_tenant" -> o.tenant.asJson,
        "_deleted" -> o.deleted,
        "api" -> o.api.asJson,
        "plan" -> o.plan.asJson,
        "steps" -> SeqSubscriptionDemanStepFormat.writes(o.steps),
        "state" -> o.state.name,
        "team" -> o.team.asJson,
        "from" -> o.from.asJson,
        "date" -> DateTimeFormat.writes(o.date),
        "motivation" -> o.motivation
          .getOrElse(JsNull)
          .as[JsValue],
        "parentSubscription" -> o.parentSubscriptionId
          .map(_.asJson)
          .getOrElse(JsNull)
          .as[JsValue],
        "customMetadata" -> o.customMetadata
          .getOrElse(JsNull)
          .as[JsValue],
        "customMaxPerSecond" -> o.customMaxPerSecond
          .map(JsNumber(_))
          .getOrElse(JsNull)
          .as[JsValue],
        "customMaxPerDay" -> o.customMaxPerDay
          .map(JsNumber(_))
          .getOrElse(JsNull)
          .as[JsValue],
        "customMaxPerMonth" -> o.customMaxPerMonth
          .map(JsNumber(_))
          .getOrElse(JsNull)
          .as[JsValue],
        "customReadOnly" -> o.customReadOnly
          .map(JsBoolean.apply)
          .getOrElse(JsNull)
          .as[JsValue],
        "adminCustomName" -> o.adminCustomName
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue],
        "customName" -> o.customName
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue],
        "tags" -> o.tags
          .map(t => JsArray(t.toSeq.map(JsString.apply)))
          .getOrElse(JsNull)
          .as[JsValue]
      )

    override def reads(json: JsValue): JsResult[SubscriptionDemand] =
      Try {
        JsSuccess(
          SubscriptionDemand(
            id = (json \ "_id").as(using SubscriptionDemandIdFormat),
            tenant = (json \ "_tenant").as(using TenantIdFormat),
            deleted = (json \ "_deleted").asOpt[Boolean].getOrElse(false),
            api = (json \ "api").as(using ApiIdFormat),
            plan = (json \ "plan").as(using UsagePlanIdFormat),
            steps = (json \ "steps").as(using SeqSubscriptionDemanStepFormat),
            state = (json \ "state").as(using SubscriptionDemandStateFormat),
            team = (json \ "team").as(using TeamIdFormat),
            from = (json \ "from").as(using UserIdFormat),
            date = (json \ "date").as(using DateTimeFormat),
            motivation = (json \ "motivation")
              .asOpt[String]
              .map(m => Json.obj("motivation" -> m))
              .orElse((json \ "motivation").asOpt[JsObject]),
            parentSubscriptionId =
              (json \ "parentSubscription").asOpt(using ApiSubscriptionIdFormat),
            customMetadata = (json \ "customMetadata").asOpt[JsObject],
            customMaxPerSecond = (json \ "customMaxPerSecond").asOpt[Long],
            customMaxPerDay = (json \ "customMaxPerDay").asOpt[Long],
            customMaxPerMonth = (json \ "customMaxPerMonth").asOpt[Long],
            customReadOnly = (json \ "customReadOnly").asOpt[Boolean],
            adminCustomName = (json \ "adminCustomName").asOpt[String],
            customName = (json \ "customName").asOpt[String],
            tags = (json \ "tags").asOpt[Set[String]]
          )
        )
      } recover { case e =>
        AppLogger.error(e.getMessage, e)
        JsError(e.getMessage)
      } get
  }

  val SubscriptionDemandStepFormat = new Format[SubscriptionDemandStep] {
    override def writes(o: SubscriptionDemandStep): JsValue =
      Json.obj(
        "_id" -> o.id.asJson,
        "state" -> o.state.name,
        "step" -> ValidationStepFormat.writes(o.step),
        "metadata" -> o.metadata
      )

    override def reads(json: JsValue): JsResult[SubscriptionDemandStep] =
      Try {
        JsSuccess(
          SubscriptionDemandStep(
            id = (json \ "_id").as(using SubscriptionDemandStepIdFormat),
            state = (json \ "state").as(using SubscriptionDemandStateFormat),
            step = (json \ "step").as(using ValidationStepFormat),
            metadata = (json \ "metadata").as[JsObject]
          )
        )
      } recover { case e =>
        AppLogger.error(e.getMessage, e)
        JsError(e.getMessage)
      } get
  }

  val StepValidatorFormat = new Format[StepValidator] {
    override def writes(o: StepValidator): JsValue =
      Json.obj(
        "_id" -> o.id.asJson,
        "_tenant" -> o.tenant.asJson,
        "_deleted" -> o.deleted,
        "token" -> o.token,
        "step" -> o.step.asJson,
        "subscriptionDemand" -> o.subscriptionDemand.asJson,
        "metadata" -> o.metadata
      )

    override def reads(json: JsValue): JsResult[StepValidator] =
      Try {
        JsSuccess(
          StepValidator(
            id = (json \ "_id").as(using DatastoreIdFormat),
            tenant = (json \ "_tenant").as(using TenantIdFormat),
            deleted = (json \ "_deleted").as[Boolean],
            token = (json \ "token").as[String],
            step = (json \ "step").as(using SubscriptionDemandStepIdFormat),
            subscriptionDemand =
              (json \ "subscriptionDemand").as(using SubscriptionDemandIdFormat),
            metadata = (json \ "metadata").as[JsObject]
          )
        )
      } recover { case e =>
        AppLogger.error(e.getMessage, e)
        JsError(e.getMessage)
      } get
  }

  // just because otoroshi do not use the actual entities format ;)
  val AuthorizedEntitiesOtoroshiFormat: Format[AuthorizedEntities] =
    new Format[AuthorizedEntities] {
      override def writes(o: AuthorizedEntities): JsValue =
        JsArray(
          o.groups.map(g => s"group_${g.value}").map(JsString.apply).toSeq ++
            o.services
              .map(g => s"service_${g.value}")
              .map(JsString.apply)
              .toSeq ++
            o.routes.map(g => s"route_${g.value}").map(JsString.apply).toSeq
        )

      override def reads(json: JsValue): JsResult[AuthorizedEntities] =
        Try {
          JsSuccess(
            json
              .as[JsArray]
              .value
              .map(_.as[String])
              .foldLeft(AuthorizedEntities()) { (entities, value) =>
                {
                  value match {
                    case r"group_.*" =>
                      entities.copy(
                        groups = entities.groups + OtoroshiServiceGroupId(
                          value.replaceFirst("group_", "")
                        )
                      )
                    case r"route_.*" =>
                      entities.copy(routes =
                        entities.routes + OtoroshiRouteId(
                          value.replaceFirst("route_", "")
                        )
                      )
                    case r"service_.*" =>
                      entities.copy(
                        services = entities.services + OtoroshiServiceId(
                          value.replaceFirst("service_", "")
                        )
                      )
                    case _ => entities
                  }
                }
              }
          )
        } recover { case e =>
          JsError(e.getMessage)
        } get
    }

  val AuthorizedEntitiesFormat: Format[AuthorizedEntities] =
    new Format[AuthorizedEntities] {
      override def writes(o: AuthorizedEntities): JsValue =
        Json.obj(
          "groups" -> SetOtoroshiServiceGroupsIdFormat.writes(o.groups),
          "services" -> SetOtoroshiServicesIdFormat.writes(o.services),
          "routes" -> SetOtoroshiRoutesIdFormat.writes(o.routes)
        )

      override def reads(json: JsValue): JsResult[AuthorizedEntities] =
        Try {
          JsSuccess(
            AuthorizedEntities(
              groups = (json \ "groups").as(using SetOtoroshiServiceGroupsIdFormat),
              services = (json \ "services").as(using SetOtoroshiServicesIdFormat),
              routes = (json \ "routes").as(using SetOtoroshiRoutesIdFormat)
            )
          )
        } recover { case e =>
          AppLogger.error(e.getMessage, e)
          JsError(e.getMessage)
        } get
    }

  val ActualOtoroshiApiKeyFormat: Format[ActualOtoroshiApiKey] =
    new Format[ActualOtoroshiApiKey] {
      override def writes(apk: ActualOtoroshiApiKey): JsValue =
        Json.obj(
          "clientId" -> apk.clientId,
          "clientSecret" -> apk.clientSecret,
          "clientName" -> apk.clientName,
          "authorizedEntities" -> AuthorizedEntitiesOtoroshiFormat.writes(
            apk.authorizedEntities
          ),
          "enabled" -> apk.enabled,
          "allowClientIdOnly" -> apk.allowClientIdOnly,
          "constrainedServicesOnly" -> apk.constrainedServicesOnly,
          "readOnly" -> apk.readOnly,
          "throttlingQuota" -> apk.throttlingQuota,
          "dailyQuota" -> apk.dailyQuota,
          "monthlyQuota" -> apk.monthlyQuota,
          "metadata" -> JsObject(
            apk.metadata.view.mapValues(JsString.apply).toSeq
          ),
          "tags" -> JsArray(apk.tags.toSeq.map(JsString.apply)),
          "restrictions" -> apk.restrictions.asJson,
          "rotation" -> apk.rotation
            .map(ApiKeyRotationFormat.writes)
            .getOrElse(JsNull)
            .as[JsValue],
          "validUntil" -> apk.validUntil,
          "bearer" -> apk.bearer
        )

      override def reads(json: JsValue): JsResult[ActualOtoroshiApiKey] =
        Try {
          ActualOtoroshiApiKey(
            clientId = (json \ "clientId").as[String],
            clientSecret = (json \ "clientSecret").as[String],
            clientName = (json \ "clientName").as[String],
            authorizedEntities = (json \ "authorizedEntities").as(
              using AuthorizedEntitiesOtoroshiFormat
            ),
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
              .asOpt[Set[String]]
              .getOrElse(Set.empty[String]),
            restrictions = (json \ "restrictions").as(using ApiKeyRestrictionsFormat),
            rotation = (json \ "rotation").asOpt(using ApiKeyRotationFormat),
            validUntil = (json \ "validUntil").asOpt[Long],
            bearer = (json \ "bearer").asOpt[String]
          )
        } map { case sd =>
          JsSuccess(sd)
        } recover { case t =>
          JsError(t.getMessage)
        } get
    }

  val NotificationIdFormat: Format[NotificationId] =
    new Format[NotificationId] {
      override def reads(json: JsValue): JsResult[NotificationId] =
        Try {
          JsSuccess(NotificationId(json.as[String]))
        } recover { case e =>
          AppLogger.error(e.getMessage, e)
          JsError(e.getMessage)
        } get

      override def writes(o: NotificationId): JsValue = JsString(o.value)
    }

  val UserSessionIdFormat: Format[UserSessionId] = new Format[UserSessionId] {
    override def reads(json: JsValue): JsResult[UserSessionId] =
      Try {
        JsSuccess(UserSessionId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: UserSessionId): JsValue = JsString(o.value)
  }

  val NotificationActionFormat: Format[NotificationAction] =
    new Format[NotificationAction] {
      override def reads(json: JsValue) =
        (json \ "type").as[String] match {
          case "ApiAccess" => ApiAccessFormat.reads(json)
          case "AccountCreationAttempt" =>
            accountCreationAttemptFormat.reads(json)
          case "ApiSubscription" => ApiSubscriptionDemandFormat.reads(json)
          case "ApiSubscriptionReject" =>
            ApiSubscriptionRejectFormat.reads(json)
          case "ApiSubscriptionAccept" =>
            ApiSubscriptionAcceptFormat.reads(json)
          case "OtoroshiSyncSubscriptionError" =>
            OtoroshiSyncSubscriptionErrorFormat.reads(json)
          case "OtoroshiSyncApiError" => OtoroshiSyncApiErrorFormat.reads(json)
          case "ApiKeyDeletionInformation" =>
            ApiKeyDeletionInformationFormat.reads(json)
          case "ApiKeyDeletionInformationV2" =>
            ApiKeyDeletionInformationV2Format.reads(json)
          case "ApiKeyRotationInProgress" =>
            ApiKeyRotationInProgressFormat.reads(json)
          case "ApiKeyRotationInProgressV2" =>
            ApiKeyRotationInProgressV2Format.reads(json)
          case "ApiKeyRotationEnded" => ApiKeyRotationEndedFormat.reads(json)
          case "ApiKeyRotationEndedV2" =>
            ApiKeyRotationEndedV2Format.reads(json)
          case "TeamInvitation"       => TeamInvitationFormat.reads(json)
          case "ApiKeyRefresh"        => ApiKeyRefreshFormat.reads(json)
          case "ApiKeyRefreshV2"      => ApiKeyRefreshV2Format.reads(json)
          case "NewPostPublished"     => NewPostPublishedFormat.reads(json)
          case "NewPostPublishedV2"   => NewPostPublishedV2Format.reads(json)
          case "NewIssueOpen"         => NewIssueOpenFormat.reads(json)
          case "NewIssueOpenV2"       => NewIssueOpenV2Format.reads(json)
          case "NewCommentOnIssue"    => NewCommentOnIssueFormat.reads(json)
          case "NewCommentOnIssueV2"  => NewCommentOnIssueV2Format.reads(json)
          case "TransferApiOwnership" => TransferApiOwnershipFormat.reads(json)
          case "ApiSubscriptionTransferSuccess" =>
            ApiSubscriptionTransferSuccessFormat.reads(json)
          case "CheckoutForSubscription" =>
            CheckoutForSubscriptionFormat.reads(json)
          case str => JsError(s"Bad notification value: $str")
        }

      override def writes(o: NotificationAction) =
        o match {
          case p: ApiAccess =>
            ApiAccessFormat.writes(p).as[JsObject] ++ Json.obj(
              "type" -> "ApiAccess"
            )
          case p: ApiSubscriptionDemand =>
            ApiSubscriptionDemandFormat.writes(p).as[JsObject] ++ Json.obj(
              "type" -> "ApiSubscription"
            )
          case p: AccountCreationAttempt =>
            accountCreationAttemptFormat.writes(p).as[JsObject] ++ Json.obj(
              "type" -> "AccountCreationAttempt"
            )
          case p: ApiSubscriptionTransferSuccess =>
            ApiSubscriptionTransferSuccessFormat.writes(p).as[JsObject] ++ Json
              .obj(
                "type" -> "ApiSubscriptionTransferSuccess"
              )
          case p: ApiSubscriptionReject =>
            ApiSubscriptionRejectFormat.writes(p).as[JsObject] ++ Json.obj(
              "type" -> "ApiSubscriptionReject"
            )
          case p: ApiSubscriptionAccept =>
            ApiSubscriptionAcceptFormat.writes(p).as[JsObject] ++ Json.obj(
              "type" -> "ApiSubscriptionAccept"
            )
          case p: OtoroshiSyncSubscriptionError =>
            OtoroshiSyncSubscriptionErrorFormat.writes(p).as[JsObject] ++ Json
              .obj("type" -> "OtoroshiSyncSubscriptionError")
          case p: OtoroshiSyncApiError =>
            OtoroshiSyncApiErrorFormat.writes(p).as[JsObject] ++ Json.obj(
              "type" -> "OtoroshiSyncApiError"
            )
          case p: ApiKeyDeletionInformation =>
            ApiKeyDeletionInformationFormat.writes(p).as[JsObject] ++ Json.obj(
              "type" -> "ApiKeyDeletionInformation"
            )
          case p: ApiKeyDeletionInformationV2 =>
            ApiKeyDeletionInformationV2Format.writes(p).as[JsObject] ++ Json
              .obj(
                "type" -> "ApiKeyDeletionInformationV2"
              )
          case p: ApiKeyRotationInProgress =>
            ApiKeyRotationInProgressFormat.writes(p).as[JsObject] ++ Json.obj(
              "type" -> "ApiKeyRotationInProgress"
            )
          case p: ApiKeyRotationInProgressV2 =>
            ApiKeyRotationInProgressV2Format.writes(p).as[JsObject] ++ Json.obj(
              "type" -> "ApiKeyRotationInProgressV2"
            )
          case p: ApiKeyRotationEnded =>
            ApiKeyRotationEndedFormat.writes(p).as[JsObject] ++ Json.obj(
              "type" -> "ApiKeyRotationEnded"
            )
          case p: ApiKeyRotationEndedV2 =>
            ApiKeyRotationEndedV2Format.writes(p).as[JsObject] ++ Json.obj(
              "type" -> "ApiKeyRotationEndedV2"
            )
          case p: TeamInvitation =>
            TeamInvitationFormat.writes(p).as[JsObject] ++ Json.obj(
              "type" -> "TeamInvitation"
            )
          case p: ApiKeyRefresh =>
            ApiKeyRefreshFormat.writes(p).as[JsObject] ++ Json.obj(
              "type" -> "ApiKeyRefresh"
            )
          case p: ApiKeyRefreshV2 =>
            ApiKeyRefreshV2Format.writes(p).as[JsObject] ++ Json.obj(
              "type" -> "ApiKeyRefreshV2"
            )
          case p: NewPostPublished =>
            NewPostPublishedFormat.writes(p).as[JsObject] ++ Json.obj(
              "type" -> "NewPostPublished"
            )
          case p: NewPostPublishedV2 =>
            NewPostPublishedV2Format.writes(p).as[JsObject] ++ Json.obj(
              "type" -> "NewPostPublishedV2"
            )
          case p: NewIssueOpen =>
            NewIssueOpenFormat.writes(p).as[JsObject] ++ Json.obj(
              "type" -> "NewIssueOpen"
            )
          case p: NewIssueOpenV2 =>
            NewIssueOpenV2Format.writes(p).as[JsObject] ++ Json.obj(
              "type" -> "NewIssueOpenV2"
            )
          case p: NewCommentOnIssue =>
            NewCommentOnIssueFormat.writes(p).as[JsObject] ++ Json.obj(
              "type" -> "NewCommentOnIssue"
            )
          case p: NewCommentOnIssueV2 =>
            NewCommentOnIssueV2Format.writes(p).as[JsObject] ++ Json.obj(
              "type" -> "NewCommentOnIssueV2"
            )
          case p: TransferApiOwnership =>
            TransferApiOwnershipFormat.writes(p).as[JsObject] ++ Json.obj(
              "type" -> "TransferApiOwnership"
            )
          case p: CheckoutForSubscription =>
            CheckoutForSubscriptionFormat.writes(p).as[JsObject] ++ Json.obj(
              "type" -> "CheckoutForSubscription"
            )
        }
    }

  val NewCommentOnIssueFormat = new Format[NewCommentOnIssue] {
    override def reads(json: JsValue): JsResult[NewCommentOnIssue] =
      Try {
        JsSuccess(
          NewCommentOnIssue(
            apiName = (json \ "apiName").asOpt[String].getOrElse(""),
            teamId = (json \ "teamId").as(using TeamIdFormat).value,
            linkTo = (json \ "linkTo").asOpt[String].getOrElse("")
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: NewCommentOnIssue): JsValue =
      Json.obj(
        "apiName" -> o.apiName,
        "teamId" -> o.teamId,
        "linkTo" -> o.linkTo
      )
  }
  val NewCommentOnIssueV2Format = new Format[NewCommentOnIssueV2] {
    override def reads(json: JsValue): JsResult[NewCommentOnIssueV2] =
      Try {
        JsSuccess(
          NewCommentOnIssueV2(
            api = (json \ "api").as(using ApiIdFormat),
            issue = (json \ "issue").as(using ApiIssueIdFormat),
            user = (json \ "user").as(using UserIdFormat)
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: NewCommentOnIssueV2): JsValue =
      Json.obj(
        "api" -> o.api.asJson,
        "issue" -> o.issue.asJson,
        "user" -> o.user.asJson
      )
  }

  val TransferApiOwnershipFormat = new Format[TransferApiOwnership] {
    override def reads(json: JsValue): JsResult[TransferApiOwnership] =
      Try {
        JsSuccess(
          TransferApiOwnership(
            api = (json \ "api").as(using ApiIdFormat),
            team = (json \ "team").as(using TeamIdFormat)
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: TransferApiOwnership): JsValue =
      Json.obj(
        "api" -> o.api.value,
        "team" -> o.team.value
      )

  }

  val CheckoutForSubscriptionFormat = new Format[CheckoutForSubscription] {
    override def reads(json: JsValue): JsResult[CheckoutForSubscription] =
      Try {
        JsSuccess(
          CheckoutForSubscription(
            demand = (json \ "demand").as(using SubscriptionDemandIdFormat),
            api = (json \ "api").as(using ApiIdFormat),
            plan = (json \ "plan").as(using UsagePlanIdFormat),
            step = (json \ "step").as(using SubscriptionDemandStepIdFormat)
          )
        )
      } recover { case e =>
        AppLogger.error(e.getMessage, e)
        JsError(e.getMessage)
      } get

    override def writes(o: CheckoutForSubscription): JsValue =
      Json.obj(
        "demand" -> o.demand.value,
        "api" -> o.api.asJson,
        "plan" -> o.plan.asJson,
        "step" -> o.step.asJson
      )
  }

  val NewIssueOpenFormat = new Format[NewIssueOpen] {
    override def reads(json: JsValue): JsResult[NewIssueOpen] =
      Try {
        JsSuccess(
          NewIssueOpen(
            apiName = (json \ "apiName").asOpt[String].getOrElse(""),
            teamId = (json \ "teamId").as(using TeamIdFormat).value,
            linkTo = (json \ "linkTo").asOpt[String].getOrElse("")
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: NewIssueOpen): JsValue =
      Json.obj(
        "apiName" -> o.apiName,
        "teamId" -> o.teamId,
        "linkTo" -> o.linkTo
      )
  }
  val NewIssueOpenV2Format = new Format[NewIssueOpenV2] {
    override def reads(json: JsValue): JsResult[NewIssueOpenV2] =
      Try {
        JsSuccess(
          NewIssueOpenV2(
            api = (json \ "api").as(using ApiIdFormat),
            issue = (json \ "issue").as(using IssueIdFormat)
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: NewIssueOpenV2): JsValue =
      Json.obj(
        "api" -> o.api.asJson,
        "issue" -> o.issue.asJson
      )
  }

  val NewPostPublishedFormat = new Format[NewPostPublished] {
    override def reads(json: JsValue): JsResult[NewPostPublished] =
      Try {
        JsSuccess(
          NewPostPublished(
            apiName = (json \ "apiName").asOpt[String].getOrElse(""),
            teamId = (json \ "teamId").as(using TeamIdFormat).value
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: NewPostPublished): JsValue =
      Json.obj(
        "apiName" -> o.apiName,
        "teamId" -> o.teamId
      )
  }
  val NewPostPublishedV2Format = new Format[NewPostPublishedV2] {
    override def reads(json: JsValue): JsResult[NewPostPublishedV2] =
      Try {
        JsSuccess(
          NewPostPublishedV2(
            api = (json \ "api").as(using ApiIdFormat),
            post = (json \ "post").as(using PostIdFormat)
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: NewPostPublishedV2): JsValue =
      Json.obj(
        "api" -> o.api.value,
        "post" -> o.post.value
      )
  }

  val ApiAccessFormat = new Format[ApiAccess] {
    override def reads(json: JsValue): JsResult[ApiAccess] =
      Try {
        JsSuccess(
          ApiAccess(
            api = (json \ "api").as(using ApiIdFormat),
            team = (json \ "team").as(using TeamIdFormat)
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiAccess): JsValue =
      Json.obj(
        "api" -> ApiIdFormat.writes(o.api),
        "team" -> TeamIdFormat.writes(o.team)
      )
  }
  val ApiSubscriptionDemandFormat = new Format[ApiSubscriptionDemand] {
    override def reads(json: JsValue): JsResult[ApiSubscriptionDemand] =
      Try {
        JsSuccess(
          ApiSubscriptionDemand(
            api = (json \ "api").as(using ApiIdFormat),
            plan = (json \ "plan").as(using UsagePlanIdFormat),
            team = (json \ "team").as(using TeamIdFormat),
            demand = (json \ "demand").as(using SubscriptionDemandIdFormat),
            step = (json \ "step").as(using SubscriptionDemandStepIdFormat),
            parentSubscriptionId =
              (json \ "parentSubscriptionId").asOpt(using ApiSubscriptionIdFormat),
            motivation = (json \ "motivation").asOpt[String]
          )
        )
      } recover { case e =>
        AppLogger.error(e.getMessage, e)
        JsError(e.getMessage)
      } get

    override def writes(o: ApiSubscriptionDemand): JsValue =
      Json.obj(
        "api" -> ApiIdFormat.writes(o.api),
        "plan" -> UsagePlanIdFormat.writes(o.plan),
        "team" -> TeamIdFormat.writes(o.team),
        "demand" -> SubscriptionDemandIdFormat.writes(o.demand),
        "step" -> SubscriptionDemandStepIdFormat.writes(o.step),
        "parentSubscriptionId" -> o.parentSubscriptionId
          .map(ApiSubscriptionIdFormat.writes)
          .getOrElse(JsNull)
          .as[JsValue],
        "motivation" -> o.motivation
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue]
      )
  }
  val accountCreationAttemptFormat = new Format[AccountCreationAttempt] {
    override def reads(json: JsValue): JsResult[AccountCreationAttempt] =
      Try {
        JsSuccess(
          AccountCreationAttempt(
            demand = (json \ "demand").as(using SubscriptionDemandIdFormat),
            step = (json \ "step").as(using SubscriptionDemandStepIdFormat),
            motivation = (json \ "motivation").as[String]
          )
        )
      } recover { case e =>
        AppLogger.error(e.getMessage, e)
        JsError(e.getMessage)
      } get

    override def writes(o: AccountCreationAttempt): JsValue =
      Json.obj(
        "demand" -> o.demand.value,
        "step" -> o.step.value,
        "motivation" -> o.motivation
      )
  }
  val ApiSubscriptionTransferSuccessFormat =
    new Format[ApiSubscriptionTransferSuccess] {

      override def reads(
          json: JsValue
      ): JsResult[ApiSubscriptionTransferSuccess] =
        Try {
          JsSuccess(
            ApiSubscriptionTransferSuccess(
              subscription = (json \ "subscription").as(using ApiSubscriptionIdFormat)
            )
          )
        } recover { case e =>
          JsError(e.getMessage)
        } get

      override def writes(o: ApiSubscriptionTransferSuccess): JsValue =
        Json.obj(
          "subscription" -> o.subscription.asJson
        )
    }
  val ApiSubscriptionRejectFormat = new Format[ApiSubscriptionReject] {
    override def reads(json: JsValue): JsResult[ApiSubscriptionReject] =
      Try {
        JsSuccess(
          ApiSubscriptionReject(
            api = (json \ "api").as(using ApiIdFormat),
            plan = (json \ "plan").as(using UsagePlanIdFormat),
            team = (json \ "team").as(using TeamIdFormat),
            message = (json \ "message").asOpt[String]
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiSubscriptionReject): JsValue =
      Json.obj(
        "api" -> ApiIdFormat.writes(o.api),
        "plan" -> UsagePlanIdFormat.writes(o.plan),
        "team" -> TeamIdFormat.writes(o.team),
        "message" -> o.message
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue]
      )
  }

  val ApiSubscriptionAcceptFormat = new Format[ApiSubscriptionAccept] {
    override def reads(json: JsValue): JsResult[ApiSubscriptionAccept] =
      Try {
        JsSuccess(
          ApiSubscriptionAccept(
            api = (json \ "api").as(using ApiIdFormat),
            plan = (json \ "plan").as(using UsagePlanIdFormat),
            team = (json \ "team").as(using TeamIdFormat)
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiSubscriptionAccept): JsValue =
      Json.obj(
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
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiKeyDeletionInformation): JsValue =
      Json.obj(
        "api" -> o.api,
        "clientId" -> o.clientId
      )
  }
  val ApiKeyDeletionInformationV2Format =
    new Format[ApiKeyDeletionInformationV2] {
      override def reads(json: JsValue): JsResult[ApiKeyDeletionInformationV2] =
        Try {
          JsSuccess(
            ApiKeyDeletionInformationV2(
              api = (json \ "api").as(using ApiIdFormat),
              clientId = (json \ "clientId").as[String],
              subscription = (json \ "subscription").as(using ApiSubscriptionIdFormat)
            )
          )
        } recover { case e =>
          JsError(e.getMessage)
        } get

      override def writes(o: ApiKeyDeletionInformationV2): JsValue =
        Json.obj(
          "api" -> o.api.value,
          "clientId" -> o.clientId,
          "subscription" -> o.subscription.value
        )
    }

  val OtoroshiSyncSubscriptionErrorFormat =
    new Format[OtoroshiSyncSubscriptionError] {
      override def reads(
          json: JsValue
      ): JsResult[OtoroshiSyncSubscriptionError] =
        Try {
          JsSuccess(
            OtoroshiSyncSubscriptionError(
              subscription = (json \ "subscription").as(using ApiSubscriptionFormat),
              message = (json \ "message").as[String]
            )
          )
        } recover { case e =>
          JsError(e.getMessage)
        } get

      override def writes(o: OtoroshiSyncSubscriptionError): JsValue =
        Json.obj(
          "subscription" -> ApiSubscriptionFormat.writes(o.subscription),
          "message" -> o.message
        )
    }

  val OtoroshiSyncApiErrorFormat = new Format[OtoroshiSyncApiError] {
    override def reads(json: JsValue): JsResult[OtoroshiSyncApiError] =
      Try {
        JsSuccess(
          OtoroshiSyncApiError(
            api = (json \ "api").as(using ApiFormat),
            message = (json \ "message").as[String]
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: OtoroshiSyncApiError): JsValue =
      Json.obj(
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
            plan = (json \ "plan").as[String]
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiKeyRotationInProgress): JsValue =
      Json.obj(
        "clientId" -> o.clientId,
        "api" -> o.api,
        "plan" -> o.plan
      )
  }
  val ApiKeyRotationInProgressV2Format =
    new Format[ApiKeyRotationInProgressV2] {
      override def reads(json: JsValue): JsResult[ApiKeyRotationInProgressV2] =
        Try {
          JsSuccess(
            ApiKeyRotationInProgressV2(
              subscription =
                (json \ "subscription").as(using ApiSubscriptionIdFormat),
              api = (json \ "api").as(using ApiIdFormat),
              plan = (json \ "plan").as(using UsagePlanIdFormat)
            )
          )
        } recover { case e =>
          JsError(e.getMessage)
        } get

      override def writes(o: ApiKeyRotationInProgressV2): JsValue =
        Json.obj(
          "subscription" -> o.subscription.value,
          "api" -> o.api.value,
          "plan" -> o.plan.value
        )
    }

  val ApiKeyRotationEndedFormat = new Format[ApiKeyRotationEnded] {
    override def reads(json: JsValue): JsResult[ApiKeyRotationEnded] =
      Try {
        JsSuccess(
          ApiKeyRotationEnded(
            clientId = (json \ "clientId").as[String],
            api = (json \ "api").as[String],
            plan = (json \ "plan").as[String]
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiKeyRotationEnded): JsValue =
      Json.obj(
        "clientId" -> o.clientId,
        "api" -> o.api,
        "plan" -> o.plan
      )
  }

  val ApiKeyRotationEndedV2Format = new Format[ApiKeyRotationEndedV2] {
    override def reads(json: JsValue): JsResult[ApiKeyRotationEndedV2] =
      Try {
        JsSuccess(
          ApiKeyRotationEndedV2(
            subscription = (json \ "subscription").as(using ApiSubscriptionIdFormat),
            api = (json \ "api").as(using ApiIdFormat),
            plan = (json \ "plan").as(using UsagePlanIdFormat)
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiKeyRotationEndedV2): JsValue =
      Json.obj(
        "subscription" -> o.subscription.value,
        "api" -> o.api.value,
        "plan" -> o.plan.value
      )
  }
  val TeamInvitationFormat = new Format[TeamInvitation] {
    override def reads(json: JsValue): JsResult[TeamInvitation] =
      Try {
        JsSuccess(
          TeamInvitation(
            team = (json \ "team").as(using TeamIdFormat),
            user = (json \ "user").as(using UserIdFormat)
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: TeamInvitation): JsValue =
      Json.obj(
        "team" -> TeamIdFormat.writes(o.team),
        "user" -> UserIdFormat.writes(o.user)
      )
  }
  val ApiKeyRefreshFormat = new Format[ApiKeyRefresh] {
    override def reads(json: JsValue): JsResult[ApiKeyRefresh] =
      Try {
        JsSuccess(
          ApiKeyRefresh(
            subscription = (json \ "subscription").as[String],
            api = (json \ "api").as[String],
            plan = (json \ "plan").as[String]
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiKeyRefresh): JsValue =
      Json.obj(
        "subscription" -> o.subscription,
        "api" -> o.api,
        "plan" -> o.plan
      )
  }
  val ApiKeyRefreshV2Format = new Format[ApiKeyRefreshV2] {
    override def reads(json: JsValue): JsResult[ApiKeyRefreshV2] =
      Try {
        JsSuccess(
          ApiKeyRefreshV2(
            subscription = (json \ "subscription").as(using ApiSubscriptionIdFormat),
            api = (json \ "api").as(using ApiIdFormat),
            plan = (json \ "plan").as(using UsagePlanIdFormat),
            message = (json \ "message").asOpt[String]
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiKeyRefreshV2): JsValue =
      Json.obj(
        "subscription" -> o.subscription.value,
        "api" -> o.api.value,
        "plan" -> o.plan.value,
        "message" -> o.message
      )
  }

  val NotificationStatusFormat: Format[NotificationStatus] =
    new Format[NotificationStatus] {
      override def reads(json: JsValue): JsResult[NotificationStatus] =
        (json \ "status").as[String] match {
          case "Pending"  => NotificationStatusPendingFormat.reads(json)
          case "Accepted" => NotificationStatusAcceptedFormat.reads(json)
          case "Rejected" => NotificationStatusRejectedFormat.reads(json)
          case str =>
            AppLogger.error(s"Bad notification status value: $str")
            JsError(s"Bad notification status value: $str")
        }

      override def writes(o: NotificationStatus): JsValue =
        o match {
          case status: Pending =>
            NotificationStatusPendingFormat.writes(status).as[JsObject]
          case status: Accepted =>
            NotificationStatusAcceptedFormat.writes(status).as[JsObject]
          case status: Rejected =>
            NotificationStatusRejectedFormat.writes(status).as[JsObject]
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

      override def writes(o: NotificationType): JsValue =
        o match {
          case NotificationType.AcceptOrReject => JsString("AcceptOrReject")
          case NotificationType.AcceptOnly     => JsString("AcceptOnly")
        }
    }

  val NotificationStatusPendingFormat: Format[Pending] =
    new Format[Pending] {
      override def reads(json: JsValue): JsResult[Pending] =
        Try {
          JsSuccess(
            Pending()
          )
        } recover { case e =>
          JsError(e.getMessage)
        } get

      override def writes(o: Pending): JsValue =
        Json.obj(
          "status" -> o.status
        )
    }

  val NotificationStatusAcceptedFormat: Format[Accepted] =
    new Format[Accepted] {
      override def reads(json: JsValue): JsResult[Accepted] =
        Try {
          JsSuccess(
            Accepted(
              date = (json \ "date").as(using DateTimeFormat)
            )
          )
        } recover { case e =>
          JsError(e.getMessage)
        } get

      override def writes(o: Accepted): JsValue =
        Json.obj(
          "date" -> DateTimeFormat.writes(o.date),
          "status" -> o.status
        )
    }

  val NotificationStatusRejectedFormat: Format[Rejected] =
    new Format[Rejected] {
      override def reads(json: JsValue): JsResult[Rejected] =
        Try {
          JsSuccess(
            Rejected(
              date = (json \ "date").as(using DateTimeFormat)
            )
          )
        } recover { case e =>
          JsError(e.getMessage)
        } get

      override def writes(o: Rejected): JsValue =
        Json.obj(
          "date" -> DateTimeFormat.writes(o.date),
          "status" -> o.status
        )
    }

  val NotificationSenderFormat: Format[NotificationSender] =
    new Format[NotificationSender] {
      override def reads(json: JsValue): JsResult[NotificationSender] =
        Try {
          JsSuccess(
            NotificationSender(
              name = (json \ "name").as[String],
              email = (json \ "email").as[String],
              id = (json \ "id").asOpt(using UserIdFormat)
            )
          )
        } recover { case e =>
          AppLogger.error(e.getMessage, e)
          JsError(e.getMessage)
        } get

      override def writes(o: NotificationSender): JsValue =
        Json.obj(
          "name" -> o.name,
          "email" -> o.email,
          "id" -> o.id.map(_.asJson).getOrElse(JsNull).as[JsValue]
        )
    }
  val NotificationFormat: Format[Notification] = new Format[Notification] {
    override def reads(json: JsValue): JsResult[Notification] =
      Try {
        JsSuccess(
          Notification(
            id = (json \ "_id").as(using NotificationIdFormat),
            tenant = (json \ "_tenant").as(using TenantIdFormat),
            deleted = (json \ "_deleted").asOpt[Boolean].getOrElse(false),
            team = (json \ "team").asOpt(using TeamIdFormat),
            sender = (json \ "sender").as(using NotificationSenderFormat),
            date =
              (json \ "date").asOpt(using DateTimeFormat).getOrElse(DateTime.now()),
            status = (json \ "status").as(using NotificationStatusFormat),
            action = (json \ "action").as(using NotificationActionFormat),
            notificationType = (json \ "notificationType")
              .asOpt(using NotificationTypeFormat)
              .getOrElse(NotificationType.AcceptOrReject)
          )
        )
      } recover { case e =>
        AppLogger.error(e.getMessage, e)
        JsError(e.getMessage)
      } get

    override def writes(o: Notification): JsValue =
      Json.obj(
        "_id" -> NotificationIdFormat.writes(o.id),
        "_tenant" -> TenantIdFormat.writes(o.tenant),
        "_deleted" -> o.deleted,
        "team" -> o.team
          .map(id => JsString(id.value))
          .getOrElse(JsNull)
          .as[JsValue],
        "sender" -> NotificationSenderFormat.writes(o.sender),
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
            id = (json \ "_id").as(using DatastoreIdFormat),
            sessionId = (json \ "sessionId").as(using UserSessionIdFormat),
            userId = (json \ "userId").as(using UserIdFormat),
            userName = (json \ "userName").as[String],
            userEmail = (json \ "userEmail").as[String],
            impersonatorId = (json \ "impersonatorId").asOpt(using UserIdFormat),
            impersonatorName = (json \ "impersonatorName").asOpt[String],
            impersonatorEmail = (json \ "impersonatorEmail").asOpt[String],
            impersonatorSessionId =
              (json \ "impersonatorSessionId").asOpt(using UserSessionIdFormat),
            created = (json \ "created")
              .asOpt(using DateTimeFormat)
              .getOrElse(DateTime.now()),
            expires = (json \ "expires")
              .asOpt(using DateTimeFormat)
              .getOrElse(DateTime.now()),
            ttl = (json \ "ttl")
              .asOpt[Long]
              .map(v => FiniteDuration(v, TimeUnit.MILLISECONDS))
              .getOrElse(FiniteDuration(0, TimeUnit.MILLISECONDS)),
            providerSessionId = (json \ "providerSessionId")
              .asOpt[String]
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get
    }

    override def writes(o: UserSession): JsValue =
      Json.obj(
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
        "providerSession" -> o.providerSessionId
          .map(JsString(_))
          .getOrElse(JsNull)
          .as[JsValue]
      )
  }

  val ApiKeyConsumptionStateFormat: Format[ApiKeyConsumptionState] =
    new Format[ApiKeyConsumptionState] {
      override def reads(json: JsValue): JsResult[ApiKeyConsumptionState] =
        json.as[String] match {
          case "completed"  => JsSuccess(ApiKeyConsumptionState.Completed)
          case "inProgress" => JsSuccess(ApiKeyConsumptionState.InProgress)
          case str => JsError(s"Bad ApiKeyConsumptionState value: $str")
        }

      override def writes(o: ApiKeyConsumptionState): JsValue = JsString(o.name)
    }

  val ConsumptionFormat: Format[ApiKeyConsumption] =
    new Format[ApiKeyConsumption] {
      override def reads(json: JsValue): JsResult[ApiKeyConsumption] =
        Try {
          JsSuccess(
            ApiKeyConsumption(
              id = (json \ "_id").as(using DatastoreIdFormat),
              deleted = (json \ "_deleted").asOpt[Boolean].getOrElse(false),
              tenant = (json \ "_tenant").as(using TenantIdFormat),
              team = (json \ "team").as(using TeamIdFormat),
              api = (json \ "api").as(using ApiIdFormat),
              plan = (json \ "plan").as(using UsagePlanIdFormat),
              clientId = (json \ "clientId").as[String],
              hits = (json \ "hits").as[Long],
              globalInformations = (json \ "globalInformations").as(
                using GlobalConsumptionInformationsFormat
              ),
              quotas = (json \ "quotas").as(using ApiKeyQuotasFormat),
              billing = (json \ "billing").as(using ApiKeyBillingFormat),
              from = (json \ "from").as(using DateTimeFormat),
              to = (json \ "to").as(using DateTimeFormat),
              state = (json \ "state").as(using ApiKeyConsumptionStateFormat)
            )
          )
        } recover { case e =>
          AppLogger.error("Error from ConsumptionFormat")
          AppLogger.error(e.getMessage, e)
          JsError(e.getMessage)
        } get

      override def writes(o: ApiKeyConsumption): JsValue =
        Json.obj(
          "_id" -> DatastoreIdFormat.writes(o.id),
          "_deleted" -> o.deleted,
          "_tenant" -> TenantIdFormat.writes(o.tenant),
          "team" -> TeamIdFormat.writes(o.team),
          "api" -> ApiIdFormat.writes(o.api),
          "plan" -> UsagePlanIdFormat.writes(o.plan),
          "clientId" -> o.clientId,
          "hits" -> o.hits,
          "globalInformations" -> GlobalConsumptionInformationsFormat.writes(
            o.globalInformations
          ),
          "quotas" -> ApiKeyQuotasFormat.writes(o.quotas),
          "billing" -> ApiKeyBillingFormat.writes(o.billing),
          "from" -> DateTimeFormat.writes(o.from),
          "to" -> DateTimeFormat.writes(o.to),
          "state" -> ApiKeyConsumptionStateFormat.writes(o.state)
        )
    }
  val GlobalConsumptionInformationsFormat
      : Format[ApiKeyGlobalConsumptionInformations] =
    new Format[ApiKeyGlobalConsumptionInformations] {
      override def reads(
          json: JsValue
      ): JsResult[ApiKeyGlobalConsumptionInformations] =
        Try {
          JsSuccess(
            ApiKeyGlobalConsumptionInformations(
              hits = (json \ "hits").as(using LongFormat),
              dataIn = (json \ "dataIn").as(using LongFormat),
              dataOut = (json \ "dataOut").as(using LongFormat),
              avgDuration = (json \ "avgDuration").asOpt[Double],
              avgOverhead = (json \ "avgOverhead").asOpt[Double]
            )
          )
        } recover { case e =>
          JsError(e.getMessage)
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
            authorizedCallsPerSec = (json \ "authorizedCallsPerWindow")
              .asOpt(using LongFormat)
              .getOrElse((json \ "authorizedCallsPerSec").as(using LongFormat)),
            currentCallsPerSec = (json \ "throttlingCallsPerWindow")
              .asOpt(using LongFormat)
              .getOrElse((json \ "currentCallsPerSec").as(using LongFormat)),
            remainingCallsPerSec = (json \ "remainingCallsPerWindow")
              .asOpt(using LongFormat)
              .getOrElse((json \ "remainingCallsPerSec").as(using LongFormat)),
            authorizedCallsPerDay =
              (json \ "authorizedCallsPerDay").as(using LongFormat),
            currentCallsPerDay = (json \ "currentCallsPerDay").as(using LongFormat),
            remainingCallsPerDay =
              (json \ "remainingCallsPerDay").as(using LongFormat),
            authorizedCallsPerMonth =
              (json \ "authorizedCallsPerMonth").as(using LongFormat),
            currentCallsPerMonth =
              (json \ "currentCallsPerMonth").as(using LongFormat),
            remainingCallsPerMonth =
              (json \ "remainingCallsPerMonth").as(using LongFormat)
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiKeyQuotas): JsValue =
      Json.obj(
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
            hits = (json \ "hits").as(using LongFormat),
            total = (json \ "total").as[BigDecimal]
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: ApiKeyBilling): JsValue =
      Json.obj(
        "hits" -> o.hits,
        "total" -> o.total
      )
  }

  val PasswordResetFormat: Format[PasswordReset] = new Format[PasswordReset] {
    override def reads(json: JsValue): JsResult[PasswordReset] =
      Try {
        JsSuccess(
          PasswordReset(
            id = (json \ "_id").as(using DatastoreIdFormat),
            deleted = (json \ "_deleted").as[Boolean],
            randomId = (json \ "randomId").as[String],
            email = (json \ "email").as[String],
            password = (json \ "password").as[String],
            user = (json \ "user").as(using UserIdFormat),
            creationDate = (json \ "creationDate").as(using DateTimeFormat),
            validUntil = (json \ "validUntil").as(using DateTimeFormat)
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: PasswordReset): JsValue =
      Json.obj(
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
              id = (json \ "_id").as(using SubscriptionDemandIdFormat),
              deleted = (json \ "_deleted").as[Boolean],
              randomId = (json \ "randomId").as[String],
              email = (json \ "email").as[String],
              name = (json \ "name").as[String],
              avatar = (json \ "avatar").as[String],
              password = (json \ "password").as[String],
              creationDate = (json \ "creationDate").as(using DateTimeFormat),
              validUntil = (json \ "validUntil").as(using DateTimeFormat),
              steps = (json \ "steps").as(using SeqSubscriptionDemanStepFormat),
              state = (json \ "state").as(using SubscriptionDemandStateFormat),
              value = (json \ "value").as[JsObject],
              fromTenant = (json \ "fromTenant").as(using TenantIdFormat)
            )
          )
        } recover { case e =>
          JsError(e.getMessage)
        } get

      override def writes(o: AccountCreation): JsValue =
        Json.obj(
          "_id" -> o.id.value,
          "_deleted" -> o.deleted,
          "randomId" -> o.randomId,
          "email" -> o.email,
          "name" -> o.name,
          "avatar" -> o.avatar,
          "password" -> o.password,
          "creationDate" -> DateTimeFormat.writes(o.creationDate),
          "validUntil" -> DateTimeFormat.writes(o.validUntil),
          "steps" -> SeqSubscriptionDemanStepFormat.writes(o.steps),
          "state" -> SubscriptionDemandStateFormat.writes(o.state),
          "value" -> o.value,
          "fromTenant" -> o.fromTenant.value
        )
    }

  val EmailVerificationFormat: Format[EmailVerification] =
    new Format[EmailVerification] {
      override def reads(json: JsValue): JsResult[EmailVerification] =
        Try {
          JsSuccess(
            EmailVerification(
              id = (json \ "_id").as(using DatastoreIdFormat),
              deleted = (json \ "_deleted").as[Boolean],
              randomId = (json \ "randomId").as[String],
              tenant = (json \ "_tenant").as(using TenantIdFormat),
              team = (json \ "teamId").as(using TeamIdFormat),
              creationDate = (json \ "creationDate").as(using DateTimeFormat),
              validUntil = (json \ "validUntil").as(using DateTimeFormat)
            )
          )
        } recover { case e =>
          JsError(e.getMessage)
        } get

      override def writes(o: EmailVerification): JsValue =
        Json.obj(
          "_id" -> o.id.value,
          "_deleted" -> o.deleted,
          "randomId" -> o.randomId,
          "_tenant" -> o.tenant.value,
          "teamId" -> o.team.value,
          "creationDate" -> DateTimeFormat.writes(o.creationDate),
          "validUntil" -> DateTimeFormat.writes(o.validUntil)
        )
    }

  val TranslationFormat: Format[Translation] = new Format[Translation] {
    override def reads(json: JsValue): JsResult[Translation] =
      Try {
        JsSuccess(
          Translation(
            id = (json \ "_id").as(using DatastoreIdFormat),
            tenant = (json \ "_tenant").as(using TenantIdFormat),
            language = (json \ "language").as[String],
            key = (json \ "key").as[String],
            value = (json \ "value").as[String],
            lastModificationAt =
              (json \ "lastModificationAt").asOpt(using DateTimeFormat)
          )
        )
      } recover { case e =>
        AppLogger.warn(e.getMessage)
        JsError(e.getMessage)
      } get

    override def writes(o: Translation): JsValue =
      Json.obj(
        "_id" -> o.id.value,
        "_tenant" -> TenantIdFormat.writes(o.tenant),
        "language" -> o.language,
        "key" -> o.key,
        "value" -> o.value,
        "lastModificationAt" -> o.lastModificationAt
          .map(DateTimeFormat.writes)
          .getOrElse(JsNull)
          .as[JsValue]
      )
  }

  val IntlTranslationFormat: Format[IntlTranslation] =
    new Format[IntlTranslation] {
      override def reads(json: JsValue): JsResult[IntlTranslation] =
        Try {
          JsSuccess(
            IntlTranslation(
              id = (json \ "_id").as[String],
              translations = (json \ "translations")
                .asOpt(using SeqTranslationFormat)
                .getOrElse(Seq.empty),
              content = (json \ "content").asOpt[String].getOrElse("")
            )
          )
        } recover { case e =>
          AppLogger.warn(e.getMessage)
          JsError(e.getMessage)
        } get

      override def writes(o: IntlTranslation): JsValue =
        Json.obj(
          "_id" -> o.id,
          "translations" -> SeqTranslationFormat.writes(o.translations),
          "content" -> o.content
        )
    }

  val TeamPermissionFormat = new Format[TeamPermission] {
    override def reads(json: JsValue) =
      json.as[String] match {
        case "Administrator" => JsSuccess(Administrator)
        case "ApiEditor"     => JsSuccess(ApiEditor)
        case "User"          => JsSuccess(TeamUser)
        case str             => JsError(s"Bad TeamPermission value: $str")
      }

    override def writes(o: TeamPermission): JsValue = JsString(o.name)
  }

  val UserWithPermissionFormat: Format[UserWithPermission] =
    new Format[UserWithPermission] {
      override def reads(json: JsValue): JsResult[UserWithPermission] =
        Try {
          JsSuccess(
            UserWithPermission(
              userId = (json \ "userId").as(using UserIdFormat),
              teamPermission =
                (json \ "teamPermission").as(using TeamPermissionFormat)
            )
          )
        } recover { case e =>
          JsError(e.getMessage)
        } get

      override def writes(o: UserWithPermission): JsValue =
        Json.obj(
          "userId" -> UserIdFormat.writes(o.userId),
          "teamPermission" -> TeamPermissionFormat.writes(o.teamPermission)
        )
    }

  val MessageFormat: Format[Message] =
    new Format[Message] {
      override def reads(json: JsValue): JsResult[Message] =
        Try {
          JsSuccess(
            Message(
              id = (json \ "_id").as(using DatastoreIdFormat),
              tenant = (json \ "_tenant").as(using TenantIdFormat),
              messageType = (json \ "messageType").as(using MessageTypeFormat),
              chat = (json \ "chat").as(using UserIdFormat),
              date = (json \ "date").as(using DateTimeFormat),
              sender = (json \ "sender").as(using UserIdFormat),
              participants = (json \ "participants").as(using SetUserIdFormat),
              readBy = (json \ "readBy").as(using SetUserIdFormat),
              message = (json \ "message").as[String],
              send = (json \ "send").asOpt[Boolean].getOrElse(false),
              closed = (json \ "closed").asOpt(using DateTimeFormat)
            )
          )
        } recover { case e =>
          JsError(e.getMessage)
        } get

      override def writes(o: Message): JsValue =
        Json.obj(
          "_id" -> o.id.value,
          "_tenant" -> o.tenant.value,
          "messageType" -> MessageTypeFormat.writes(o.messageType),
          "chat" -> o.chat.value,
          "date" -> DateTimeFormat.writes(o.date),
          "sender" -> UserIdFormat.writes(o.sender),
          "participants" -> SetUserIdFormat.writes(o.participants),
          "readBy" -> SetUserIdFormat.writes(o.readBy),
          "message" -> o.message,
          "send" -> o.send,
          "closed" -> o.closed
            .map(DateTimeFormat.writes)
            .getOrElse(JsNull)
            .as[JsValue]
        )
    }

  val MessageTypeFormat: Format[MessageType] =
    new Format[MessageType] {
      override def reads(json: JsValue): JsResult[MessageType] =
        (json \ "type").as[String] match {
          case "tenant" =>
            TenantIdFormat
              .reads((json \ "value").as[JsValue])
              .map(value => MessageType.Tenant(value))
          case str => JsError(s"Bad message type value: $str")
        }

      override def writes(o: MessageType): JsValue =
        o match {
          case t: MessageType.Tenant =>
            Json.obj(
              "type" -> "tenant",
              "value" -> TenantIdFormat.writes(t.value)
            )
        }
    }

  val TwoFactorAuthenticationFormat = new Format[TwoFactorAuthentication] {
    override def reads(json: JsValue): JsResult[TwoFactorAuthentication] =
      Try {
        JsSuccess(
          TwoFactorAuthentication(
            enabled = (json \ "enabled").as[Boolean],
            secret = (json \ "secret").as[String],
            token = (json \ "token").as[String],
            backupCodes = (json \ "backupCodes").as[String]
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: TwoFactorAuthentication): JsValue =
      Json.obj(
        "enabled" -> o.enabled,
        "secret" -> o.secret,
        "token" -> o.token,
        "backupCodes" -> o.backupCodes
      )
  }

  val UserInvitationFormat = new Format[UserInvitation] {
    override def reads(json: JsValue): JsResult[UserInvitation] =
      Try {
        JsSuccess(
          UserInvitation(
            token = (json \ "token").as[String],
            createdAt = (json \ "createdAt")
              .asOpt(using DateTimeFormat)
              .getOrElse(DateTime.now()),
            team = (json \ "team").asOpt[String].getOrElse("team"),
            notificationId =
              (json \ "notificationId").asOpt[String].getOrElse(""),
            registered = (json \ "registered").asOpt[Boolean].getOrElse(false)
          )
        )
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: UserInvitation): JsValue =
      Json.obj(
        "token" -> o.token,
        "createdAt" -> DateTimeFormat.writes(o.createdAt),
        "team" -> o.team,
        "notificationId" -> o.notificationId,
        "registered" -> o.registered
      )
  }

  val EvolutionFormat: Format[Evolution] =
    new Format[Evolution] {
      override def reads(json: JsValue): JsResult[Evolution] =
        Try {
          JsSuccess(
            Evolution(
              id = (json \ "_id").as(using DatastoreIdFormat),
              version = (json \ "version").as[String],
              applied = (json \ "applied").as[Boolean],
              date = (json \ "date").as(using DateTimeFormat)
            )
          )
        } recover { case e =>
          JsError(e.getMessage)
        } get

      override def writes(o: Evolution): JsValue =
        Json.obj(
          "_id" -> DatastoreIdFormat.writes(o.id),
          "version" -> o.version,
          "applied" -> o.applied,
          "date" -> DateTimeFormat.writes(o.date)
        )
    }

  val ReportsInfoFormat: Format[ReportsInfo] =
    new Format[ReportsInfo] {
      override def reads(json: JsValue): JsResult[ReportsInfo] =
        Try {
          JsSuccess(
            ReportsInfo(
              (json \ "_id").as(using DatastoreIdFormat),
              (json \ "activated").as[Boolean],
              (json \ "date").asOpt[Long]
            )
          )
        } recover { case e =>
          JsError(e.getMessage)
        } get

      override def writes(o: ReportsInfo): JsValue =
        Json.obj(
          "_id" -> DatastoreIdFormat.writes(o.id),
          "activated" -> o.activated,
          "date" -> o.date
        )
    }

  val JobStatusFormat: Format[JobStatus] = new Format[JobStatus] {
    override def reads(json: JsValue): JsResult[JobStatus] =
      json.validate[String].flatMap { str =>
        JobStatus.values.find(_.value == str) match {
          case Some(status) => JsSuccess(status)
          case None => JsError(s"enum fr.maif.daikoku.domain.JobStatus has no case with value: $str")
        }
      }

    override def writes(o: JobStatus): JsValue =
      JsString(o.value)
  }

  val JobInformationFormat: Format[JobInformation] =
    new Format[JobInformation] {
      override def reads(json: JsValue): JsResult[JobInformation] =
        Try {
          JsSuccess(
            JobInformation(
              id = (json \ "_id").as(using DatastoreIdFormat),
              tenant = (json \ "_tenant").as(using TenantIdFormat),
              deleted = (json \ "_deleted").as[Boolean],
              jobName = JobName.valueOf((json \ "jobName").as[String]),
              lockedBy = (json \ "lockedBy").as[String],
              lockedAt = (json \ "lockedAt").as(using DateTimeFormat),
              expiresAt = (json \ "expiresAt").as(using DateTimeFormat),
              cursor = (json \ "cursor").as[Long],
              batchSize = (json \ "batchSize").as[Int],
              totalProcessed = (json \ "totalProcessed").as[BigDecimal],
              startedAt = (json \ "startedAt").as(using DateTimeFormat),
              lastBatchAt = (json \ "lastBatchAt").as(using DateTimeFormat),
              status = (json \ "status").as(using JobStatusFormat)
            )
          )
        } recover { case e =>
          JsError(e.getMessage)
        } get

      override def writes(o: JobInformation): JsValue =
        Json.obj(
          "_id" -> o.id.asJson,
          "_tenant" -> o.tenant.asJson,
          "_deleted" -> o.deleted,
          "jobName" -> o.jobName.value,
          "lockedBy" -> o.lockedBy,
          "lockedAt" -> DateTimeFormat.writes(o.lockedAt),
          "expiresAt" -> DateTimeFormat.writes(o.expiresAt),
          "cursor" -> o.cursor,
          "batchSize" -> o.batchSize,
          "totalProcessed" -> o.totalProcessed,
          "startedAt" -> DateTimeFormat.writes(o.startedAt),
          "lastBatchAt" -> DateTimeFormat.writes(o.lastBatchAt),
          "status" -> o.status.value,
        )
    }

  val ApiSubscriptionDetailFormat: Format[ApiSubscriptionDetail] = new Format[ApiSubscriptionDetail] {
    override def reads(json: JsValue): JsResult[ApiSubscriptionDetail] =
      Try {
        JsSuccess(
          ApiSubscriptionDetail(
            apiSubscription =
              (json \ "apiSubscription").as(using ApiSubscriptionFormat),
            parentSubscription =
              (json \ "parentSubscription").asOpt(using ApiSubscriptionFormat),
            accessibleResources = (json \ "accessibleResources").as(
              using SeqApiSubscriptionAccessibleResourceFormat
            )
          )
        )
      } recover { case e =>
        AppLogger.error(e.getMessage, e)
        JsError(e.getMessage)
      } get

    override def writes(o: ApiSubscriptionDetail): JsValue =
      Json.obj(
        "apiSubscription" -> o.apiSubscription.asJson,
        "parentSubscription" -> o.parentSubscription
          .map(_.asJson)
          .getOrElse(JsNull)
          .as[JsValue],
        "accessibleResources" -> SeqApiSubscriptionAccessibleResourceFormat
          .writes(o.accessibleResources)
      )
  }

  val ApiSubscriptionAccessibleResourceFormat =
    new Format[ApiSubscriptionAccessibleResource] {
      override def reads(
          json: JsValue
      ): JsResult[ApiSubscriptionAccessibleResource] =
        Try {
          JsSuccess(
            ApiSubscriptionAccessibleResource(
              apiSubscription =
                (json \ "apiSubscription").as(using ApiSubscriptionFormat),
              api = (json \ "api").as(using ApiFormat),
              usagePlan = (json \ "usagePlan").as(using UsagePlanFormat)
            )
          )
        } recover { case e =>
          AppLogger.error(e.getMessage, e)
          JsError(e.getMessage)
        } get

      override def writes(o: ApiSubscriptionAccessibleResource): JsValue =
        Json.obj(
          "apiSubscription" -> o.apiSubscription.asJson,
          "api" -> o.api.asJson,
          "usagePlan" -> o.usagePlan.asJson
        )
    }

  val SeqApiSubscriptionAccessibleResourceFormat = Format(
    Reads.seq(using ApiSubscriptionAccessibleResourceFormat),
    Writes.seq(using ApiSubscriptionAccessibleResourceFormat)
  )

  val SeqOtoroshiSettingsFormat = Format(
    Reads.seq(using OtoroshiSettingsFormat),
    Writes.seq(using OtoroshiSettingsFormat)
  )
  val SeqVersionFormat =
    Format(Reads.seq(using VersionFormat), Writes.seq(using VersionFormat))
  val SeqTeamIdFormat =
    Format(Reads.seq(using TeamIdFormat), Writes.seq(using TeamIdFormat))
  val SeqPostIdFormat =
    Format(Reads.seq(using PostIdFormat), Writes.seq(using PostIdFormat))
  val SeqIssueIdFormat =
    Format(Reads.seq(using IssueIdFormat), Writes.seq(using IssueIdFormat))
  val SeqOtoroshiGroupFormat =
    Format(Reads.seq(using OtoroshiGroupFormat), Writes.seq(using OtoroshiGroupFormat))
  val SeqTenantIdFormat =
    Format(Reads.seq(using TenantIdFormat), Writes.seq(using TenantIdFormat))
  val SeqTenantFormat =
    Format(Reads.seq(using TenantFormat), Writes.seq(using TenantFormat))
  val SeqUserFormat = Format(Reads.seq(using UserFormat), Writes.seq(using UserFormat))
  val SeqUserIdFormat =
    Format(Reads.seq(using UserIdFormat), Writes.seq(using UserIdFormat))
  val SetUserIdFormat =
    Format(Reads.set(using UserIdFormat), Writes.set(using UserIdFormat))
  val SeqApiSubscriptionIdFormat = Format(
    Reads.seq(using ApiSubscriptionIdFormat),
    Writes.seq(using ApiSubscriptionIdFormat)
  )
  val SeqApiDocumentationPageIdFormat =
    Format(
      Reads.seq(using ApiDocumentationPageIdFormat),
      Writes.seq(using ApiDocumentationPageIdFormat)
    )
  val SeqApiDocumentationFormat = Format(
    Reads.seq(using ApiDocumentationFormat),
    Writes.seq(using ApiDocumentationFormat)
  )
  val SeqApiDocumentationPageFormat =
    Format(
      Reads.seq(using ApiDocumentationPageFormat),
      Writes.seq(using ApiDocumentationPageFormat)
    )
  val SeqUsagePlanFormat =
    Format(Reads.seq(using UsagePlanFormat), Writes.seq(using UsagePlanFormat))
  val SeqUsagePlanIdFormat =
    Format(Reads.seq(using UsagePlanIdFormat), Writes.seq(using UsagePlanIdFormat))
  val SeqTeamFormat =
    Format(Reads.seq(using TeamFormat), Writes.seq(using TeamFormat))
  val SeqApiFormat =
    Format(Reads.seq(using ApiFormat), Writes.seq(using ApiFormat))
  val SetApiIdFormat =
    Format(Reads.set(using ApiIdFormat), Writes.set(using ApiIdFormat))
  val SetApiTagFormat =
    Format(Reads.set(using ApiTagFormat), Writes.set(using ApiTagFormat))
  val SetUserWithPermissionFormat =
    Format(
      Reads.set(using UserWithPermissionFormat),
      Writes.set(using UserWithPermissionFormat)
    )
  val SeqNotificationFormat =
    Format(Reads.seq(using NotificationFormat), Writes.seq(using NotificationFormat))
  val SeqConsumptionFormat =
    Format(Reads.seq(using ConsumptionFormat), Writes.seq(using ConsumptionFormat))
  val SeqApiSubscriptionFormat =
    Format(Reads.seq(using ApiSubscriptionFormat), Writes.seq(using ApiSubscriptionFormat))
  val SeqTranslationFormat =
    Format(Reads.seq(using TranslationFormat), Writes.seq(using TranslationFormat))
  val SeqCustomMetadataFormat =
    Format(Reads.seq(using CustomMetadataFormat), Writes.seq(using CustomMetadataFormat))
  val SeqMessagesFormat =
    Format(Reads.seq(using MessageFormat), Writes.seq(using MessageFormat))

  val DefaultFormat = new Format[JsObject] {
    override def reads(json: JsValue): JsResult[JsObject] =
      JsSuccess(json.as[JsObject])

    override def writes(o: JsObject): JsValue = o
  }

  val CmsPageIdFormat = new Format[CmsPageId] {
    override def reads(json: JsValue): JsResult[CmsPageId] =
      Try {
        JsSuccess(CmsPageId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: CmsPageId): JsValue = JsString(o.value)
  }

  val AssetIdFormat = new Format[AssetId] {
    override def reads(json: JsValue): JsResult[AssetId] =
      Try {
        JsSuccess(AssetId(json.as[String]))
      } recover { case e =>
        JsError(e.getMessage)
      } get

    override def writes(o: AssetId): JsValue = JsString(o.value)
  }

  val CmsFileFormat = new Format[CmsFile] {
    override def writes(o: CmsFile): JsValue =
      Json.obj(
        "name" -> o.name,
        "content" -> o.content,
        "metadata" -> o.metadata,
        "daikoku_data" -> o.daikokuData
      )
    override def reads(json: JsValue): JsResult[CmsFile] =
      Try {
        CmsFile(
          name = (json \ "name").as[String],
          content = (json \ "content").as[String],
          metadata = (json \ "metadata")
            .asOpt[Map[String, JsValue]]
            .getOrElse(Map.empty),
          daikokuData = (json \ "daikoku_data").asOpt[Map[String, String]]
        )
      } match {
        case Failure(exception) => JsError(exception.getMessage)
        case Success(page)      => JsSuccess(page)
      }
  }

  val CmsRequestRenderingFormat = new Format[CmsRequestRendering] {
    override def writes(o: CmsRequestRendering): JsValue =
      Json.obj(
        "content" -> o.content.map(CmsFileFormat.writes),
        "current_page" -> o.current_page,
        "fields" -> o.fields
      )
    override def reads(json: JsValue): JsResult[CmsRequestRendering] =
      Try {
        CmsRequestRendering(
          content = (json \ "content").as(using Reads.seq(using CmsFileFormat)),
          current_page = (json \ "current_page").as[String],
          fields = (json \ "fields").as[Map[String, JsValue]]
        )
      } match {
        case Failure(exception) => JsError(exception.getMessage)
        case Success(page)      => JsSuccess(page)
      }
  }

  val AssetFormat = new Format[Asset] {
    override def writes(o: Asset): JsValue =
      Json.obj(
        "_id" -> o.id.value,
        "slug" -> o.slug,
        "_tenant" -> o.tenant.value
      )
    override def reads(json: JsValue): JsResult[Asset] =
      Try {
        Asset(
          id = (json \ "_id").as(using AssetIdFormat),
          slug = (json \ "slug").as[String],
          tenant = (json \ "_tenant").as(using TenantIdFormat)
        )
      } match {
        case Failure(exception) => JsError(exception.getMessage)
        case Success(page)      => JsSuccess(page)
      }
  }

  val CmsPageFormat = new Format[CmsPage] {
    override def writes(o: CmsPage): JsValue =
      Json.obj(
        "_id" -> o.id.value,
        "_tenant" -> o.tenant.value,
        "_deleted" -> o.deleted,
        "visible" -> o.visible,
        "authenticated" -> o.authenticated,
        "name" -> o.name,
        "picture" -> o.picture
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue],
        "tags" -> o.tags,
        "metadata" -> o.metadata,
        "contentType" -> o.contentType,
        "forwardRef" -> o.forwardRef
          .map(v => v.asJson)
          .getOrElse(JsNull)
          .as[JsValue],
        "body" -> o.body,
        "path" -> o.path.map(JsString.apply).getOrElse(JsNull).as[JsValue],
        "exact" -> o.exact,
        "lastPublishedDate" -> o.lastPublishedDate.map(DateTimeFormat.writes)
      )
    override def reads(json: JsValue): JsResult[CmsPage] =
      Try {
        CmsPage(
          id = (json \ "_id").as(using CmsPageIdFormat),
          tenant = (json \ "_tenant").as(using TenantIdFormat),
          deleted = (json \ "_deleted").asOpt[Boolean].getOrElse(false),
          visible = (json \ "visible").asOpt[Boolean].getOrElse(false),
          authenticated =
            (json \ "authenticated").asOpt[Boolean].getOrElse(false),
          name = (json \ "name").as[String],
          picture = (json \ "picture").asOpt[String].filter(_.trim.nonEmpty),
          tags = (json \ "tags").asOpt[List[String]].getOrElse(List.empty),
          metadata =
            (json \ "metadata").asOpt[Map[String, String]].getOrElse(Map.empty),
          body = (json \ "body").asOpt[String].getOrElse(""),
          contentType =
            (json \ "contentType").asOpt[String].getOrElse("text/html"),
          forwardRef = (json \ "forwardRef")
            .asOpt[String]
            .filter(_.trim.nonEmpty)
            .map(v => CmsPageId(v)),
          path = (json \ "path").asOpt[String],
          exact = (json \ "exact").asOpt[Boolean].getOrElse(false),
          lastPublishedDate =
            (json \ "lastPublishedDate").asOpt(using DateTimeFormat)
        )
      } match {
        case Failure(exception) => JsError(exception.getMessage)
        case Success(page)      => JsSuccess(page)
      }
  }

  val OperationActionFormat = new Format[OperationAction] {
    override def reads(json: JsValue): JsResult[OperationAction] =
      OperationAction.apply(json.as[String]) match {
        case Some(action) => JsSuccess(action)
        case None =>
          JsError(s"Bad OperationAction value: ${Json.stringify(json)}")
      }

    override def writes(o: OperationAction): JsValue = JsString(o.name)
  }

  val OperationStatusFormat = new Format[OperationStatus] {
    override def reads(json: JsValue): JsResult[OperationStatus] =
      OperationStatus.apply(json.as[String]) match {
        case Some(action) => JsSuccess(action)
        case None =>
          JsError(s"Bad OperationStatus value: ${Json.stringify(json)}")
      }

    override def writes(o: OperationStatus): JsValue = JsString(o.name)
  }

  val ItemTypeFormat = new Format[ItemType] {
    override def reads(json: JsValue): JsResult[ItemType] =
      ItemType.apply(json.as[String]) match {
        case Some(action) => JsSuccess(action)
        case None => JsError(s"Bad ItemType value: ${Json.stringify(json)}")
      }

    override def writes(o: ItemType): JsValue = JsString(o.name)
  }

  val OperationFormat = new Format[Operation] {
    override def reads(json: JsValue): JsResult[Operation] =
      Try {
        Operation(
          id = (json \ "_id").as(using DatastoreIdFormat),
          tenant = (json \ "_tenant").as(using TenantIdFormat),
          itemId = (json \ "itemId").as[String],
          itemType = (json \ "itemType").as(using ItemTypeFormat),
          action = (json \ "action").as(using OperationActionFormat),
          payload = (json \ "payload").asOpt[JsObject],
          status = (json \ "status").as(using OperationStatusFormat)
        )
      } match {
        case Failure(exception) => JsError(exception.getMessage)
        case Success(operation) => JsSuccess(operation)
      }

    override def writes(o: Operation): JsValue =
      Json.obj(
        "_id" -> o.id.asJson,
        "_tenant" -> o.tenant.asJson,
        "itemId" -> o.itemId,
        "itemType" -> ItemTypeFormat.writes(o.itemType),
        "action" -> OperationActionFormat.writes(o.action),
        "payload" -> o.payload.getOrElse(JsNull).as[JsValue],
        "status" -> OperationStatusFormat.writes(o.status)
      )
  }

  val ThirdPartyPaymentSettingsFormat = new Format[ThirdPartyPaymentSettings] {
    override def reads(json: JsValue): JsResult[ThirdPartyPaymentSettings] =
      (json \ "type").as[String] match {
        case "Stripe" => StripeSettingsFormat.reads(json)
        case str      => JsError(s"Bad ThirdPartyPaymentSettings value: $str")
      }

    override def writes(o: ThirdPartyPaymentSettings): JsValue =
      o match {
        case s: StripeSettings =>
          StripeSettingsFormat.writes(s).as[JsObject] ++ Json.obj(
            "type" -> "Stripe"
          )
      }
  }

  val StripeSettingsFormat = new Format[StripeSettings] {
    override def reads(json: JsValue): JsResult[StripeSettings] =
      Try {
        StripeSettings(
          id = (json \ "_id").as(using ThirdPartyPaymentSettingsIdFormat),
          name = (json \ "name").as[String],
          publicKey = (json \ "publicKey").as[String],
          secretKey = (json \ "secretKey").as[String]
        )
      } match {
        case Failure(e) =>
          AppLogger.warn("Stripe Settings")
          AppLogger.error(e.getMessage, e)
          JsError(e.getMessage)
        case Success(value) => JsSuccess(value)
      }

    override def writes(o: StripeSettings): JsValue =
      Json.obj(
        "_id" -> ThirdPartyPaymentSettingsIdFormat.writes(o.id),
        "name" -> o.name,
        "publicKey" -> o.publicKey,
        "secretKey" -> o.secretKey
      )
  }

  val ApiSubscriptionTransferFormat = new Format[ApiSubscriptionTransfer] {

    override def reads(json: JsValue): JsResult[ApiSubscriptionTransfer] =
      Try {
        ApiSubscriptionTransfer(
          id = (json \ "_id").as(using DatastoreIdFormat),
          tenant = (json \ "_tenant").as(using TenantIdFormat),
          deleted = (json \ "_deleted").as[Boolean],
          token = (json \ "token").as[String],
          subscription = (json \ "subscription").as(using ApiSubscriptionIdFormat),
          by = (json \ "by").as(using UserIdFormat),
          date = (json \ "date").as(using DateTimeFormat)
        )
      } match {
        case Failure(e) =>
          AppLogger.error(e.getMessage, e)
          JsError(e.getMessage)
        case Success(value) => JsSuccess(value)
      }

    override def writes(o: ApiSubscriptionTransfer): JsValue =
      Json.obj(
        "_id" -> o.id.asJson,
        "_tenant" -> o.tenant.asJson,
        "_deleted" -> o.deleted,
        "token" -> o.token,
        "subscription" -> o.subscription.asJson,
        "by" -> o.by.asJson,
        "date" -> DateTimeFormat.writes(o.date)
      )
  }

  val AuthorizationApiFormat = new Format[AuthorizationApi] {
    override def reads(json: JsValue): JsResult[AuthorizationApi] =
      Try {
        AuthorizationApi(
          team = (json \ "team").as[String],
          authorized = (json \ "authorized").as[Boolean],
          pending = (json \ "pending").as[Boolean]
        )
      } match {
        case Failure(e) =>
          AppLogger.error(e.getMessage, e)
          JsError(e.getMessage)
        case Success(value) => JsSuccess(value)
      }

    override def writes(o: AuthorizationApi): JsValue =
      Json.obj(
        "team" -> o.team,
        "authorized" -> o.authorized,
        "pending" -> o.pending
      )
  }

  val ApiWithAuthorizationsFormat = new Format[ApiWithAuthorizations] {
    override def reads(json: JsValue): JsResult[ApiWithAuthorizations] =
      Try {
        ApiWithAuthorizations(
          api = (json \ "api").as(using ApiFormat),
          plans = (json \ "plans").as(using SeqUsagePlanFormat),
          authorizations =
            (json \ "authorizations").as(using SeqAuthorizationApiFormat),
          subscriptionDemands =
            (json \ "subscriptionDemands").as(using SeqSubscriptionDemandFormat),
          subscriptionCount = (json \ "subscriptionCount").as[Int],
          expireCount = (json \ "expireCount").as[Int]
        )
      } match {
        case Failure(e) =>
          AppLogger.error(e.getMessage, e)
          JsError(e.getMessage)
        case Success(value) => JsSuccess(value)
      }

    override def writes(o: ApiWithAuthorizations): JsValue =
      Json.obj(
        "api" -> o.api.asJson,
        "plans" -> SeqUsagePlanFormat.writes(o.plans),
        "authorizations" -> SeqAuthorizationApiFormat.writes(o.authorizations),
        "subscriptionDemands" -> SeqSubscriptionDemandFormat.writes(
          o.subscriptionDemands
        ),
        "subscriptionCount" -> o.subscriptionCount,
        "expireCount" -> o.expireCount
      )
  }

  val TeamCountFormat = new Format[TeamCount] {
    override def reads(json: JsValue): JsResult[TeamCount] =
      Try {
        TeamCount(
          team = (json \ "team").as(using TeamFormat),
          total = (json \ "total").as[Int]
        )
      } match {
        case Failure(e) =>
          AppLogger.error(e.getMessage, e)
          JsError(e.getMessage)
        case Success(value) => JsSuccess(value)
      }

    override def writes(o: TeamCount): JsValue =
      Json.obj(
        "team" -> o.team.asJson,
        "total" -> o.total
      )
  }

  val ValueCountFormat = new Format[ValueCount] {
    override def reads(json: JsValue): JsResult[ValueCount] =
      Try {
        ValueCount(
          value = (json \ "value").as[String],
          total = (json \ "total").as[Int]
        )
      } match {
        case Failure(e) =>
          AppLogger.error(e.getMessage, e)
          JsError(e.getMessage)
        case Success(value) => JsSuccess(value)
      }

    override def writes(o: ValueCount): JsValue =
      Json.obj(
        "value" -> o.value,
        "total" -> o.total
      )
  }

  val ApiWithCountFormat = new Format[ApiWithCount] {
    override def reads(json: JsValue): JsResult[ApiWithCount] =
      Try {
        ApiWithCount(
          apis = (json \ "apis").as(using SeqApiWithAuthorizationsFormat),
          producers = (json \ "producers").as(using SeqTeamCountFormat),
          tags = (json \ "tags").as(using SeqValueCountFormat),
          categories = (json \ "categories").as(using SeqValueCountFormat),
          total = (json \ "total").as[Long],
          totalFiltered = (json \ "totalFiltered").as[Long]
        )
      } match {
        case Failure(e) =>
          AppLogger.error(e.getMessage, e)
          JsError(e.getMessage)
        case Success(value) => JsSuccess(value)
      }

    override def writes(o: ApiWithCount): JsValue =
      Json.obj(
        "apis" -> SeqApiWithAuthorizationsFormat.writes(o.apis),
        "producers" -> SeqTeamCountFormat.writes(o.producers),
        "tags" -> SeqValueCountFormat.writes(o.tags),
        "categories" -> SeqValueCountFormat.writes(o.categories),
        "total" -> o.total,
        "totalFiltered" -> o.totalFiltered
      )
  }

  val SeqTeamCountFormat = Format(
    Reads.seq(using TeamCountFormat),
    Writes.seq(using TeamCountFormat)
  )
  val SeqValueCountFormat = Format(
    Reads.seq(using ValueCountFormat),
    Writes.seq(using ValueCountFormat)
  )
  val SeqAuthorizationApiFormat = Format(
    Reads.seq(using AuthorizationApiFormat),
    Writes.seq(using AuthorizationApiFormat)
  )

  val SeqApiWithAuthorizationsFormat = Format(
    Reads.seq(using ApiWithAuthorizationsFormat),
    Writes.seq(using ApiWithAuthorizationsFormat)
  )

  val SetOtoroshiServicesIdFormat =
    Format(
      Reads.set(using OtoroshiServiceIdFormat),
      Writes.set(using OtoroshiServiceIdFormat)
    )
  val SetOtoroshiRoutesIdFormat =
    Format(Reads.set(using OtoroshiRouteIdFormat), Writes.set(using OtoroshiRouteIdFormat))
  val SetOtoroshiServiceGroupsIdFormat =
    Format(
      Reads.set(using OtoroshiServiceGroupIdFormat),
      Writes.set(using OtoroshiServiceGroupIdFormat)
    )
  val SeqApiDocumentationDetailPageFormat
      : Format[Seq[ApiDocumentationDetailPage]] =
    Format(
      Reads.seq(using ApiDocumentationDetailPageFormat),
      Writes.seq(using ApiDocumentationDetailPageFormat)
    )
  val SeqThirdPartyPaymentSettingsFormat
      : Format[Seq[ThirdPartyPaymentSettings]] =
    Format(
      Reads.seq(using ThirdPartyPaymentSettingsFormat),
      Writes.seq(using ThirdPartyPaymentSettingsFormat)
    )
  val SeqValidationStepFormat: Format[Seq[ValidationStep]] =
    Format(Reads.seq(using ValidationStepFormat), Writes.seq(using ValidationStepFormat))
  val SeqSubscriptionDemanStepFormat =
    Format(
      Reads.seq(using SubscriptionDemandStepFormat),
      Writes.seq(using SubscriptionDemandStepFormat)
    )
  val SeqSubscriptionDemandFormat =
    Format(
      Reads.seq(using SubscriptionDemandFormat),
      Writes.seq(using SubscriptionDemandFormat)
    )
  val SeqTeamAuthorizedEntitiesFormat =
    Format(
      Reads.seq(using TeamAuthorizedEntitiesFormat),
      Writes.seq(using TeamAuthorizedEntitiesFormat)
    )

}
