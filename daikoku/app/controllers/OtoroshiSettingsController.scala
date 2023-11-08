package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.model.Uri
import akka.http.scaladsl.util.FastFuture
import akka.stream.scaladsl.Source
import akka.util.ByteString
import cats.data.EitherT
import cats.implicits.catsSyntaxOptionId
import com.google.common.base.Charsets
import controllers.AppError
import fr.maif.otoroshi.daikoku.actions.DaikokuAction
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async._
import fr.maif.otoroshi.daikoku.domain.json.{AuthorizedEntitiesFormat, OtoroshiSettingsFormat, OtoroshiSettingsIdFormat, TestingConfigFormat}
import fr.maif.otoroshi.daikoku.domain.{ActualOtoroshiApiKey, Api, ApiKeyRestrictions, AuthorizedEntities, OtoroshiSettings, Testing, TestingAuth, UsagePlan}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.utils.{IdGenerator, OtoroshiClient}
import org.apache.commons.codec.binary.Base64
import org.joda.time.DateTime
import play.api.http.HttpEntity
import play.api.libs.json._
import play.api.libs.streams.Accumulator
import play.api.mvc.{AbstractController, BodyParser, ControllerComponents, Request, Result}

import scala.concurrent.{ExecutionContext, Future}

class OtoroshiSettingsController(DaikokuAction: DaikokuAction,
                                 env: Env,
                                 otoroshiClient: OtoroshiClient,
                                 cc: ControllerComponents)
    extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  def otoroshisSettings(tenantId: String) = DaikokuAction.async { ctx =>
    TenantAdminOnly(
      AuditTrailEvent(s"@{user.name} has accessed otoroshi settings list"))(
      tenantId,
      ctx) { (tenant, _) =>
      FastFuture.successful(
        Ok(JsArray(tenant.otoroshiSettings.map(_.asJson).toSeq)))
    }
  }

  def otoroshisSettingsSimple(tenantId: String) = DaikokuAction.async { ctx =>
    PublicUserAccess(
      AuditTrailEvent(
        s"@{user.name} has accessed otoroshi settings simple list"))(ctx) {
      FastFuture.successful(
        Ok(JsArray(ctx.tenant.otoroshiSettings.map(_.toUiPayload()).toSeq)))
    }
  }

  def otoroshiSettings(tenantId: String, otoroshiId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has accessed one otoroshi settings ($otoroshiId)"))(
        tenantId,
        ctx) { (tenant, _) =>
        tenant.otoroshiSettings.find(_.id.value == otoroshiId) match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "OtoroshiSettings not found")))
          case Some(oto) => FastFuture.successful(Ok(oto.asJson))
        }
      }
    }

  def deleteOtoroshiSettings(tenantId: String, otoroshiId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has deleted one otoroshi settings ($otoroshiId)"))(
        tenantId,
        ctx) { (tenant, _) =>
        ctx.tenant.otoroshiSettings.find(_.id.value == otoroshiId) match {
          case Some(otoroshiSettings) =>
            env.dataStore.tenantRepo
              .save(tenant.copy(otoroshiSettings =
                tenant.otoroshiSettings.filterNot(_.id == otoroshiSettings.id)))
              .map { _ =>
                Ok(Json.obj("done" -> true))
              }
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "Otoroshi not found")))
        }
      }
    }

  def saveOtoroshiSettings(tenantId: String,
                           otoroshiId: String,
                           skipValidation: Boolean = false) =
    DaikokuAction.async(parse.json) { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has updated one otoroshi settings ($otoroshiId)"))(
        tenantId,
        ctx) { (tenant, _) =>
        tenant.otoroshiSettings.find(_.id.value == otoroshiId) match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "OtoroshiSettings not found")))
          case Some(_) =>
            OtoroshiSettingsFormat.reads(ctx.request.body) match {
              case JsError(_) =>
                FastFuture.successful(
                  BadRequest(
                    Json.obj("error" -> "Error while parsing payload")))
              case JsSuccess(settings, _) =>
                def saveSettings() =
                  env.dataStore.tenantRepo
                    .save(tenant.copy(otoroshiSettings = tenant.otoroshiSettings
                      .filterNot(_.id == settings.id) + settings))
                    .map { _ =>
                      Ok(settings.asJson)
                    }
                if (skipValidation)
                  saveSettings()
                else
                  otoroshiClient
                    .getServices()(settings)
                    .flatMap { _ =>
                      saveSettings()
                    }
                    .recover { _ =>
                      BadRequest(
                        Json.obj(
                          "error" -> "Failed to join otoroshi instances"))
                    }
            }
        }
      }
    }

  def createOtoroshiSettings(tenantId: String,
                             skipValidation: Boolean = false) =
    DaikokuAction.async(parse.json) { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has created one otoroshi settings (@{otoroshi.id})"))(
        tenantId,
        ctx) { (tenant, _) =>
        OtoroshiSettingsFormat.reads(ctx.request.body) match {
          case JsError(_) =>
            FastFuture.successful(
              BadRequest(Json.obj("error" -> "Error while parsing payload")))
          case JsSuccess(settings, _) =>
            def createOtoroshi() = {
              ctx.setCtxValue("otoroshi.id", settings.id)
              env.dataStore.tenantRepo
                .save(tenant.copy(
                  otoroshiSettings = tenant.otoroshiSettings + settings))
                .map { _ =>
                  Created(settings.asJson)
                }
            }
            if (skipValidation)
              createOtoroshi()
            else
              otoroshiClient
                .getServices()(settings)
                .flatMap { _ =>
                  createOtoroshi()
                }
                .recover {
                  case _ =>
                    BadRequest(
                      Json.obj("error" -> "Failed to join otoroshi instances"))
                }
        }
      }
    }

  def otoroshiGroupsFor(teamId: String, oto: String) = DaikokuAction.async {
    ctx =>
      TeamApiEditorOnly(AuditTrailEvent(
        s"@{user.name} has accessed groups of one otoroshi settings ($oto) for team @{team.name} - @{team.id}"))(
        teamId,
        ctx) { _ =>
        ctx.tenant.otoroshiSettings.find(s => s.id.value == oto) match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> s"Settings $oto not found")))
          case Some(settings) =>
            otoroshiClient
              .getServiceGroups()(settings)
              .map { groups =>
                Ok(groups)
              }
              .recover {
                case error => BadRequest(Json.obj("error" -> error.getMessage))
              }
        }
      }
  }

  def otoroshiGroupsForTenant(tenantId: String, oto: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has accessed groups of one otoroshi settings ($oto)"))(
        tenantId,
        ctx) { (tenant, _) =>
        tenant.otoroshiSettings.find(s => s.id.value == oto) match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> s"Settings $oto not found")))
          case Some(settings) =>
            otoroshiClient
              .getServiceGroups()(settings)
              .map(Ok(_))
              .recover {
                case error => BadRequest(Json.obj("error" -> error.getMessage))
              }
        }
      }
    }

  def otoroshiServicesFor(teamId: String, oto: String) = DaikokuAction.async {
    ctx =>
      TeamApiEditorOnly(AuditTrailEvent(
        s"@{user.name} has accessed services of one otoroshi settings ($oto) for team @{team.name} - @{team.id}"))(
        teamId,
        ctx) { _ =>
        ctx.tenant.otoroshiSettings.find(s => s.id.value == oto) match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> s"Settings $oto not found")))
          case Some(settings) =>
            otoroshiClient
              .getServices()(settings)
              .map(Ok(_))
              .recover {
                case error => BadRequest(Json.obj("error" -> error.getMessage))
              }
        }
      }
  }

  def otoroshiRoutesFor(teamId: String, oto: String) = DaikokuAction.async {
    ctx =>
      TeamApiEditorOnly(AuditTrailEvent(
        s"@{user.name} has accessed routes of one otoroshi settings ($oto) for team @{team.name} - @{team.id}"))(
        teamId,
        ctx) { _ =>
        ctx.tenant.otoroshiSettings.find(s => s.id.value == oto) match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> s"Settings $oto not found")))
          case Some(settings) =>
            otoroshiClient
              .getRoutes()(settings)
              .map(Ok(_))
              .recover {
                case error => BadRequest(Json.obj("error" -> error.getMessage))
              }
        }
      }
  }

  def otoroshiServicesForTenant(tenantId: String, oto: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(AuditTrailEvent(
        s"@{user.name} has accessed services of one otoroshi settings ($oto)"))(
        tenantId,
        ctx) { (tenant, _) =>
        tenant.otoroshiSettings.find(s => s.id.value == oto) match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> s"Settings $oto not found")))
          case Some(settings) =>
            otoroshiClient
              .getServices()(settings)
              .map(Ok(_))
              .recover {
                case error => BadRequest(Json.obj("error" -> error.getMessage))
              }
        }
      }
    }

  def otoroshiRoutesForTenant(tenantId: String, oto: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has accessed routes of one otoroshi settings ($oto)"))(
        tenantId,
        ctx) { (tenant, _) =>
        tenant.otoroshiSettings.find(s => s.id.value == oto) match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> s"Settings $oto not found")))
          case Some(settings) =>
            otoroshiClient
              .getRoutes()(settings)
              .map(Ok(_))
              .recover {
                case error => BadRequest(Json.obj("error" -> error.getMessage))
              }
        }
      }
    }

  def otoroshiApiKeysForTenant(tenantId: String, oto: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has accessed groups of one otoroshi settings ($oto)"))(
        tenantId,
        ctx) { (tenant, _) =>
        tenant.otoroshiSettings.find(s => s.id.value == oto) match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> s"Settings $oto not found")))
          case Some(settings) =>
            otoroshiClient
              .getApiKeys()(settings)
              .map(Ok(_))
              .recover {
                case error => BadRequest(Json.obj("error" -> error.getMessage))
              }
        }
      }
    }

  def createTestingApiKey(teamId: String) = DaikokuAction.async(parse.json) {
    ctx =>
      TeamApiEditorOnly(AuditTrailEvent(
        s"@{user.name} create a testing apikey for team @{team.name} - @{team.id}"))(
        teamId,
        ctx) { team =>
        val otoroshiSettingsOpt =
          (ctx.request.body \ "otoroshiSettings").asOpt[String]
        val authorizedEntitiesOpt = (ctx.request.body \ "authorizedEntities")
          .asOpt(AuthorizedEntitiesFormat)
        val clientNameOpt = (ctx.request.body \ "clientName").asOpt[String]
        val tagOpt = (ctx.request.body \ "tag").asOpt[String]
        val metadataOpt = (ctx.request.body \ "customMetadata").asOpt[JsObject]
        val readOnlyOpt = (ctx.request.body \ "customReadOnly").asOpt[Boolean]
        val maxPerSecondOpt =
          (ctx.request.body \ "customMaxPerSecond").asOpt[Long]
        val maxPerDayOpt = (ctx.request.body \ "customMaxPerDay").asOpt[Long]
        val maxPerMonthOpt =
          (ctx.request.body \ "customMaxPerMonth").asOpt[Long]

        def createApiKey(clientName: String,
                         authorizedEntities: AuthorizedEntities,
                         tag: String) = {
          val tenant = ctx.tenant
          val user = ctx.user
          val createdAt = DateTime.now().toString()
          val clientId = IdGenerator.token(32)
          val clientSecret = IdGenerator.token(64)
          ActualOtoroshiApiKey(
            clientId = clientId,
            clientSecret = clientSecret,
            clientName = clientName,
            authorizedEntities = authorizedEntities,
            throttlingQuota = maxPerSecondOpt.getOrElse(10L),
            dailyQuota = maxPerDayOpt.getOrElse(10000L),
            monthlyQuota = maxPerMonthOpt.getOrElse(300000L),
            constrainedServicesOnly = true,
            tags = Set(tag),
            restrictions = ApiKeyRestrictions(),
            metadata = Map(
              "daikoku_created_by" -> user.email,
              "daikoku_created_from" -> "daikoku",
              "daikoku_created_at" -> createdAt,
              "daikoku_created_with_type" -> (ctx.request.body \ "entity" \ "type")
                .as[String],
              "daikoku_created_with_id" -> (ctx.request.body \ "entity" \ "_id")
                .as[String],
              "daikoku_created_with" -> (ctx.request.body \ "entity" \ "name")
                .as[String],
              "daikoku_created_for_team_id" -> team.id.value,
              "daikoku_created_for_team" -> team.name,
              "daikoku_created_on_tenant" -> tenant.id.value,
              "daikoku_testing_only" -> "true",
              "daikoku_routing" -> clientName
            ) ++ metadataOpt
              .flatMap(_.asOpt[Map[String, String]])
              .getOrElse(Map.empty[String, String]),
            rotation = None,
            readOnly = readOnlyOpt.getOrElse(false)
          )
        }

        (for {
          otoroshiSettings <- EitherT.fromOption[Future](
            otoroshiSettingsOpt,
            AppError.EntityNotFound("Otoroshi settings"))
          authorizedEntities <- EitherT.fromOption[Future](
            authorizedEntitiesOpt,
            AppError.EntityNotFound("authorized entities"))
          clientName <- EitherT.fromOption[Future](
            clientNameOpt,
            AppError.EntityNotFound("client name"))
          tag <- EitherT.fromOption[Future](tagOpt,
                                            AppError.EntityNotFound("tag"))
          settings <- EitherT.fromOption[Future](
            ctx.tenant.otoroshiSettings.find(s =>
              s.id.value == otoroshiSettings),
            AppError.EntityNotFound("Otoroshi settings"))
          apiKey = createApiKey(clientName, authorizedEntities, tag)
          createdKey <- EitherT(otoroshiClient.createApiKey(apiKey)(settings))
        } yield Ok(createdKey.asJson))
          .leftMap(_.render())
          .merge
      }
  }

  def updateTestingApiKey(teamId: String) = DaikokuAction.async(parse.json) {
    ctx =>
      TeamApiEditorOnly(AuditTrailEvent(
        s"@{user.name} update testing @{apikey.id} apikey for team @{team.name} - @{team.id}"))(
        teamId,
        ctx) { _ =>
        val entityType = (ctx.request.body \ "entity" \ "type").as[String]
        val entityId = (ctx.request.body \ "entity" \ "_id").as[String]

        val testingConfig = ctx.request.body.as(TestingConfigFormat)

        def handleKeyJob(previousSettings: OtoroshiSettings,
                         actualSettings: OtoroshiSettings,
                         key: ActualOtoroshiApiKey)
          : EitherT[Future, AppError, ActualOtoroshiApiKey] = {
          if (previousSettings != actualSettings) {
            for {
              _ <- EitherT.liftF(
                otoroshiClient.deleteApiKey(key.clientId)(previousSettings))
              newKey <- EitherT(
                otoroshiClient.createApiKey(key)(actualSettings))
            } yield newKey
          } else {
            EitherT(otoroshiClient.updateApiKey(key)(previousSettings))
          }

        }

        (for {
          testing <- EitherT.fromOptionF[Future, AppError, Testing](
            entityType match {
              case "api" =>
                env.dataStore.apiRepo
                  .forTenant(ctx.tenant)
                  .findByIdNotDeleted(entityId)
                  .map(api => api.map(_.testing))
              case "plan" =>
                env.dataStore.usagePlanRepo
                  .forTenant(ctx.tenant)
                  .findByIdNotDeleted(entityId)
                  .map(plan => plan.flatMap(_.testing))
              case _ => FastFuture.successful(None)
            },
            AppError.EntityNotFound("Otoroshi settings")
          )

          otoroshiSettings <- EitherT.fromOption[Future](
            ctx.tenant.otoroshiSettings.find(
              _.id == testingConfig.otoroshiSettings),
            AppError.EntityNotFound("Otoroshi settings"))
          previousSettings <- EitherT.fromOption[Future](
            ctx.tenant.otoroshiSettings.find(s =>
              testing.config.map(_.otoroshiSettings).contains(s.id)),
            AppError.EntityNotFound("Otoroshi settings"))
          apiKey <- EitherT(
            otoroshiClient.getApikey(testingConfig.clientName)(
              previousSettings))
          lastMetadata: Map[String, String] = testing.config
            .flatMap(_.customMetadata)
            .flatMap(_.asOpt[Map[String, String]])
            .getOrElse(Map.empty[String, String])

          updatedKey = apiKey.copy(
            authorizedEntities = testingConfig.authorizedEntities,
            metadata = (apiKey.metadata -- lastMetadata.keySet) ++ testingConfig.customMetadata
              .flatMap(_.asOpt[Map[String, String]])
              .getOrElse(Map.empty[String, String]),
            throttlingQuota = testingConfig.customMaxPerSecond
              .getOrElse(apiKey.throttlingQuota),
            dailyQuota =
              testingConfig.customMaxPerDay.getOrElse(apiKey.dailyQuota),
            monthlyQuota =
              testingConfig.customMaxPerMonth.getOrElse(apiKey.monthlyQuota),
            readOnly = testingConfig.customReadOnly.getOrElse(apiKey.readOnly)
          )
          key <- handleKeyJob(previousSettings, otoroshiSettings, updatedKey)
        } yield Ok(key.asJson))
          .leftMap(_.render())
          .merge
      }
  }

  def deleteTestingApiKey(teamId: String) = DaikokuAction.async(parse.json) {
    ctx =>
      TeamApiEditorOnly(AuditTrailEvent(
        s"@{user.name} delete testing @{apikey.id} apikey for team @{team.name} - @{team.id}"))(
        teamId,
        ctx) { _ =>
        val otoroshiSettingsOpt =
          (ctx.request.body \ "otoroshiSettings").asOpt[String]
        val clientIdOpt = (ctx.request.body \ "clientId").asOpt[String]
        (otoroshiSettingsOpt, clientIdOpt) match {
          case (
              Some(otoroshiSettings),
              Some(clientId)
              ) =>
            ctx.tenant.otoroshiSettings
              .find(s => s.id.value == otoroshiSettings) match {
              case None =>
                FastFuture.successful(NotFound(
                  Json.obj("error" -> s"Settings $otoroshiSettings not found")))
              case Some(settings) =>
                otoroshiClient
                  .deleteApiKey(clientId)(settings)
                  .map(_ => Ok(Json.obj("done" -> true)))
            }
          case _ =>
            FastFuture.successful(
              BadRequest(Json.obj("error" -> "Bad request")))
        }
      }
  }

  private def hasBody(request: Request[_]): Boolean =
    (request.method, request.headers.get("Content-Length")) match {
      case ("GET", Some(_))    => true
      case ("GET", None)       => false
      case ("HEAD", Some(_))   => true
      case ("HEAD", None)      => false
      case ("PATCH", _)        => true
      case ("POST", _)         => true
      case ("PUT", _)          => true
      case ("DELETE", Some(_)) => true
      case ("DELETE", None)    => false
      case _                   => true
    }

  def __fakeApiCall(teamId: String, apiId: String) =
    DaikokuAction.async(parse.json) { ctx =>
      import scala.concurrent.duration._

      env.dataStore.teamRepo
        .forTenant(ctx.tenant)
        .findByIdOrHrId(teamId)
        .flatMap {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "Team not found")))
          case Some(team) => {
            env.dataStore.apiRepo
              .forTenant(ctx.tenant)
              .findByIdOrHrId(apiId)
              .flatMap {
                case Some(api) if !api.testing.enabled => ???
                case Some(api) if api.testing.enabled => {
                  val url = (ctx.request.body \ "url").as[String]
                  val headers = (ctx.request.body \ "headers")
                    .asOpt[Map[String, String]]
                    .getOrElse(Map.empty[String, String])
                  val method =
                    (ctx.request.body \ "method").asOpt[String].getOrElse("GET")
                  val body = (ctx.request.body \ "body").asOpt[String]
                  val credentials = (ctx.request.body \ "credentials")
                    .asOpt[String]
                    .getOrElse("same-origin")
                  val uri = Uri(url)
                  val queryOpt = uri
                    .query()
                    .toIndexedSeq
                    .find(_._2 == s"fake-${api.id.value}")
                  val headerOpt = headers.find(_._2 == s"fake-${api.id.value}")
                  val username = api.testing.username.get
                  val password = api.testing.password.get
                  val finalUrl = api.testing.auth match {
                    case TestingAuth.ApiKey if queryOpt.isDefined =>
                      url
                        .replace(s"&${queryOpt.get._1}=fake-${api.id.value}",
                                 s"&${queryOpt.get._1}=${username}")
                        .replace(s"?${queryOpt.get._1}=fake-${api.id.value}",
                                 s"?${queryOpt.get._1}=${username}")
                    // case TestingAuth.ApiKey if queryOpt.isDefined && url.contains("?") => (url + "&" + queryOpt.get._1 + "=" + username).replace(s"&${queryOpt.get._1}=fake-${api.id.value}", "").replace(s"?${queryOpt.get._1}=fake-${api.id.value}", "")
                    // case TestingAuth.ApiKey if queryOpt.isDefined && !url.contains("?") => (url + "?" + queryOpt.get._1 + "=" + username).replace(s"&${queryOpt.get._1}=fake-${api.id.value}", "").replace(s"?${queryOpt.get._1}=fake-${api.id.value}", "")
                    case _ => url
                  }
                  val finalHeaders: Map[String, String] =
                    api.testing.auth match {
                      case TestingAuth.ApiKey if headerOpt.isDefined =>
                        headers - headerOpt.get._1 + (headerOpt.get._1 -> username)
                      case TestingAuth.Basic =>
                        headers - "Authorization" + ("Authorization" -> s"Basic ${Base64.encodeBase64String(
                          s"${username}:${password}".getBytes(Charsets.UTF_8))}")
                      case _ => headers
                    }
                  val builder = env.wsClient
                    .url(finalUrl)
                    .withHttpHeaders(finalHeaders.toSeq: _*)
                    .withFollowRedirects(false)
                    .withMethod(method)
                    .withRequestTimeout(30.seconds)
                  body
                    .map(b =>
                      builder.withBody(
                        play.api.libs.ws.InMemoryBody(ByteString(b))))
                    .getOrElse(builder)
                    .stream()
                    .map { res =>
                      val ctype = res.headers
                        .get("Content-Type")
                        .flatMap(_.headOption)
                        .getOrElse("application/json")
                      Status(res.status)
                        .sendEntity(
                          HttpEntity.Streamed(
                            Source.lazySource(() => res.bodyAsSource),
                            res.headers
                              .get("Content-Length")
                              .flatMap(_.lastOption)
                              .map(_.toInt),
                            res.headers
                              .get("Content-Type")
                              .flatMap(_.headOption)
                          )
                        )
                        .withHeaders(
                          res.headers.view
                            .mapValues(_.head)
                            .toSeq
                            .filter(_._1 != "Content-Type")
                            .filter(_._1 != "Content-Length")
                            .filter(_._1 != "Transfer-Encoding"): _*
                        )
                        .as(ctype)
                    }
                    .recover {
                      case e =>
                        InternalServerError(Json.obj("error" -> e.getMessage))
                    }
                }
                case _ =>
                  FastFuture.successful(
                    NotFound(Json.obj("error" -> "Api not found")))

              }
          }
        }
    }

  def fakeApiCall(teamId: String, apiId: String) =
    DaikokuAction.async(parse.json) { ctx =>
      import scala.concurrent.duration._

      def makeCall(api: Api): Future[Either[AppError, Result]] = {
        val url = (ctx.request.body \ "url").as[String]
        val headers = (ctx.request.body \ "headers")
          .asOpt[Map[String, String]]
          .getOrElse(Map.empty[String, String])
        val method =
          (ctx.request.body \ "method").asOpt[String].getOrElse("GET")
        val body = (ctx.request.body \ "body").asOpt[String]
        val credentials = (ctx.request.body \ "credentials")
          .asOpt[String]
          .getOrElse("same-origin")
        val uri = Uri(url)
        val queryOpt = uri
          .query()
          .toIndexedSeq
          .find(_._2 == s"fake-${api.id.value}")
        val headerOpt = headers.find(_._2 == s"fake-${api.id.value}")
        val username = api.testing.username.get
        val password = api.testing.password.get
        val finalUrl = api.testing.auth match {
          case TestingAuth.ApiKey if queryOpt.isDefined =>
            url
              .replace(s"&${queryOpt.get._1}=fake-${api.id.value}",
                       s"&${queryOpt.get._1}=${username}")
              .replace(s"?${queryOpt.get._1}=fake-${api.id.value}",
                       s"?${queryOpt.get._1}=${username}")
          // case TestingAuth.ApiKey if queryOpt.isDefined && url.contains("?") => (url + "&" + queryOpt.get._1 + "=" + username).replace(s"&${queryOpt.get._1}=fake-${api.id.value}", "").replace(s"?${queryOpt.get._1}=fake-${api.id.value}", "")
          // case TestingAuth.ApiKey if queryOpt.isDefined && !url.contains("?") => (url + "?" + queryOpt.get._1 + "=" + username).replace(s"&${queryOpt.get._1}=fake-${api.id.value}", "").replace(s"?${queryOpt.get._1}=fake-${api.id.value}", "")
          case _ => url
        }
        val finalHeaders: Map[String, String] =
          api.testing.auth match {
            case TestingAuth.ApiKey if headerOpt.isDefined =>
              headers - headerOpt.get._1 + (headerOpt.get._1 -> username)
            case TestingAuth.Basic =>
              headers - "Authorization" + ("Authorization" -> s"Basic ${Base64.encodeBase64String(
                s"${username}:${password}".getBytes(Charsets.UTF_8))}")
            case _ => headers
          }
        val builder = env.wsClient
          .url(finalUrl)
          .withHttpHeaders(finalHeaders.toSeq: _*)
          .withFollowRedirects(false)
          .withMethod(method)
          .withRequestTimeout(30.seconds)
        body
          .map(b =>
            builder.withBody(play.api.libs.ws.InMemoryBody(ByteString(b))))
          .getOrElse(builder)
          .stream()
          .map { res =>
            val ctype = res.headers
              .get("Content-Type")
              .flatMap(_.headOption)
              .getOrElse("application/json")
            Status(res.status)
              .sendEntity(
                HttpEntity.Streamed(
                  Source.lazySource(() => res.bodyAsSource),
                  res.headers
                    .get("Content-Length")
                    .flatMap(_.lastOption)
                    .map(_.toInt),
                  res.headers
                    .get("Content-Type")
                    .flatMap(_.headOption)
                )
              )
              .withHeaders(
                res.headers.view
                  .mapValues(_.head)
                  .toSeq
                  .filter(_._1 != "Content-Type")
                  .filter(_._1 != "Content-Length")
                  .filter(_._1 != "Transfer-Encoding"): _*
              )
              .as(ctype)
          }
          .map(Right(_))
          .recover {
            case e => Left(AppError.InternalServerError(e.getMessage))
          }
      }

      (for {
        team <- EitherT.fromOptionF(env.dataStore.teamRepo
                                      .forTenant(ctx.tenant)
                                      .findByIdNotDeleted(teamId),
                                    AppError.TeamNotFound)
        api <- EitherT.fromOptionF(
          env.dataStore.apiRepo
            .forTenant(ctx.tenant)
            .findOneNotDeleted(
              Json.obj("_id" -> apiId, "team" -> team.id.asJson)),
          AppError.ApiNotFound)
        _ <- EitherT.cond[Future][AppError, Unit](api.testing.enabled,
                                                  (),
                                                  AppError.ForbiddenAction)
        result <- EitherT(makeCall(api))
      } yield result)
        .leftMap(_.render())
        .merge
    }

  def fakePlanCall(teamId: String, apiId: String, planId: String) =
    DaikokuAction.async(parse.json) { ctx =>
      import scala.concurrent.duration._

      def makeCall(plan: UsagePlan): Future[Either[AppError, Result]] = {
        //todo: pattern matching on plan.testing

        val url = (ctx.request.body \ "url").as[String]
        val headers = (ctx.request.body \ "headers")
          .asOpt[Map[String, String]]
          .getOrElse(Map.empty[String, String])
        val method =
          (ctx.request.body \ "method").asOpt[String].getOrElse("GET")
        val body = (ctx.request.body \ "body").asOpt[String]
        val credentials = (ctx.request.body \ "credentials")
          .asOpt[String]
          .getOrElse("same-origin")
        val uri = Uri(url)
        val queryOpt = uri
          .query()
          .toIndexedSeq
          .find(_._2 == s"fake-${plan.id.value}")
        val headerOpt = headers.find(_._2 == s"fake-${plan.id.value}")
        val username = plan.testing.flatMap(_.username).get
        val password = plan.testing.flatMap(_.password).get
        val finalUrl = plan.testing.map(_.auth).get match {
          case TestingAuth.ApiKey if queryOpt.isDefined =>
            url
              .replace(s"&${queryOpt.get._1}=fake-${plan.id.value}",
                       s"&${queryOpt.get._1}=$username")
              .replace(s"?${queryOpt.get._1}=fake-${plan.id.value}",
                       s"?${queryOpt.get._1}=$username")
          // case TestingAuth.ApiKey if queryOpt.isDefined && url.contains("?") => (url + "&" + queryOpt.get._1 + "=" + username).replace(s"&${queryOpt.get._1}=fake-${api.id.value}", "").replace(s"?${queryOpt.get._1}=fake-${api.id.value}", "")
          // case TestingAuth.ApiKey if queryOpt.isDefined && !url.contains("?") => (url + "?" + queryOpt.get._1 + "=" + username).replace(s"&${queryOpt.get._1}=fake-${api.id.value}", "").replace(s"?${queryOpt.get._1}=fake-${api.id.value}", "")
          case _ => url
        }
        val finalHeaders: Map[String, String] =
          plan.testing.map(_.auth).get match {
            case TestingAuth.ApiKey if headerOpt.isDefined =>
              headers - headerOpt.get._1 + (headerOpt.get._1 -> username)
            case TestingAuth.Basic =>
              headers - "Authorization" + ("Authorization" -> s"Basic ${Base64.encodeBase64String(
                s"${username}:${password}".getBytes(Charsets.UTF_8))}")
            case _ => headers
          }
        val builder = env.wsClient
          .url(finalUrl)
          .withHttpHeaders(finalHeaders.toSeq: _*)
          .withFollowRedirects(false)
          .withMethod(method)
          .withRequestTimeout(30.seconds)
        body
          .map(b =>
            builder.withBody(play.api.libs.ws.InMemoryBody(ByteString(b))))
          .getOrElse(builder)
          .stream()
          .map { res =>
            val ctype = res.headers
              .get("Content-Type")
              .flatMap(_.headOption)
              .getOrElse("application/json")
            Status(res.status)
              .sendEntity(
                HttpEntity.Streamed(
                  Source.lazySource(() => res.bodyAsSource),
                  res.headers
                    .get("Content-Length")
                    .flatMap(_.lastOption)
                    .map(_.toInt),
                  res.headers
                    .get("Content-Type")
                    .flatMap(_.headOption)
                )
              )
              .withHeaders(
                res.headers.view
                  .mapValues(_.head)
                  .toSeq
                  .filter(_._1 != "Content-Type")
                  .filter(_._1 != "Content-Length")
                  .filter(_._1 != "Transfer-Encoding"): _*
              )
              .as(ctype)
          }
          .map(Right(_))
          .recover {
            case e => Left(AppError.InternalServerError(e.getMessage))
          }
      }

      (for {
        team <- EitherT.fromOptionF(env.dataStore.teamRepo
                                      .forTenant(ctx.tenant)
                                      .findByIdNotDeleted(teamId),
                                    AppError.TeamNotFound)
        api <- EitherT.fromOptionF(
          env.dataStore.apiRepo
            .forTenant(ctx.tenant)
            .findOneNotDeleted(
              Json.obj("_id" -> apiId, "team" -> team.id.asJson)),
          AppError.ApiNotFound)
        _ <- EitherT.cond[Future][AppError, Unit](
          api.possibleUsagePlans.exists(_.value == planId),
          (),
          AppError.PlanNotFound)
        plan <- EitherT.fromOptionF(env.dataStore.usagePlanRepo
                                      .forTenant(ctx.tenant)
                                      .findByIdNotDeleted(planId),
                                    AppError.PlanNotFound)
        _ <- EitherT.cond[Future][AppError, Unit](
          plan.testing.exists(_.enabled),
          (),
          AppError.ForbiddenAction)
        result <- EitherT(makeCall(plan))
      } yield result)
        .leftMap(_.render())
        .merge
    }
}
