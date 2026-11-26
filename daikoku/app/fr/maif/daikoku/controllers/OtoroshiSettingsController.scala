package fr.maif.daikoku.controllers

import cats.data.EitherT
import com.google.common.base.Charsets
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.actions.{DaikokuAction, DaikokuActionContext}
import fr.maif.daikoku.audit.AuditTrailEvent
import fr.maif.daikoku.controllers.authorizations.async.*
import fr.maif.daikoku.domain.json.{
  AuthorizedEntitiesFormat,
  OtoroshiSettingsFormat,
  TestingConfigFormat
}
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.logger.AppLogger
import fr.maif.daikoku.utils.future.EnhancedObject
import fr.maif.daikoku.utils.{IdGenerator, OtoroshiClient}
import org.apache.commons.codec.binary.Base64
import org.apache.pekko.http.scaladsl.model.Uri
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.scaladsl.Source
import org.apache.pekko.util.ByteString
import org.joda.time.DateTime
import play.api.http.HttpEntity
import play.api.libs.json.*
import play.api.libs.ws.DefaultBodyWritables.writeableOf_WsBody
import play.api.mvc.{AbstractController, ControllerComponents, Result}

import java.nio.charset.StandardCharsets
import scala.concurrent.duration.DurationInt
import scala.concurrent.{ExecutionContext, Future}

class OtoroshiSettingsController(
    DaikokuAction: DaikokuAction,
    env: Env,
    otoroshiClient: OtoroshiClient,
    cc: ControllerComponents
) extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  def otoroshisSettings(tenantId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(s"@{user.name} has accessed otoroshi settings list")
      )(tenantId, ctx) { (tenant, _) =>
        FastFuture.successful(
          Ok(JsArray(tenant.otoroshiSettings.map(_.asJson).toSeq))
        )
      }
    }

  def otoroshisSettingsSimple(
      tenantId: String,
      maybeTeam: Option[String] = None
  ) =
    DaikokuAction.async { ctx =>
      maybeTeam match {
        case Some(team) =>
          TeamAdminOnly(
            AuditTrailEvent(
              s"@{user.name} has accessed otoroshi settings simple list"
            )
          )(team, ctx) { team =>
            team.authorizedOtoroshiEntities match {
              case Some(authorizedEntities) if authorizedEntities.nonEmpty =>
                Ok(
                  JsArray(
                    ctx.tenant.otoroshiSettings
                      .filter(o =>
                        authorizedEntities
                          .map(_.otoroshiSettingsId)
                          .contains(o.id)
                      )
                      .map(_.toUiPayload())
                      .toSeq
                  )
                ).future
              case _ =>
                Ok(
                  JsArray(
                    ctx.tenant.otoroshiSettings.map(_.toUiPayload()).toSeq
                  )
                ).future
            }
          }
        case None =>
          PublicUserAccess(
            AuditTrailEvent(
              s"@{user.name} has accessed otoroshi settings simple list"
            )
          )(ctx) {
            Ok(
              JsArray(ctx.tenant.otoroshiSettings.map(_.toUiPayload()).toSeq)
            ).future
          }
      }
    }

  def otoroshiSettings(tenantId: String, otoroshiId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has accessed one otoroshi settings ($otoroshiId)"
        )
      )(tenantId, ctx) { (tenant, _) =>
        tenant.otoroshiSettings.find(_.id.value == otoroshiId) match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "OtoroshiSettings not found"))
            )
          case Some(oto) => FastFuture.successful(Ok(oto.asJson))
        }
      }
    }

  def deleteOtoroshiSettings(tenantId: String, otoroshiId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has deleted one otoroshi settings ($otoroshiId)"
        )
      )(tenantId, ctx) { (tenant, _) =>
        ctx.tenant.otoroshiSettings.find(_.id.value == otoroshiId) match {
          case Some(otoroshiSettings) =>
            env.dataStore.tenantRepo
              .save(
                tenant.copy(otoroshiSettings =
                  tenant.otoroshiSettings.filterNot(_.id == otoroshiSettings.id)
                )
              )
              .map { _ =>
                Ok(Json.obj("done" -> true))
              }
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "Otoroshi not found"))
            )
        }
      }
    }

  def saveOtoroshiSettings(
      tenantId: String,
      otoroshiId: String,
      skipValidation: Boolean = false
  ) =
    DaikokuAction.async(parse.json) { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has updated one otoroshi settings ($otoroshiId)"
        )
      )(tenantId, ctx) { (tenant, _) =>
        tenant.otoroshiSettings.find(_.id.value == otoroshiId) match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "OtoroshiSettings not found"))
            )
          case Some(_) =>
            OtoroshiSettingsFormat.reads(ctx.request.body) match {
              case JsError(_) =>
                FastFuture.successful(
                  BadRequest(Json.obj("error" -> "Error while parsing payload"))
                )
              case JsSuccess(settings, _) =>
                def saveSettings() =
                  env.dataStore.tenantRepo
                    .save(
                      tenant.copy(otoroshiSettings =
                        tenant.otoroshiSettings
                          .filterNot(_.id == settings.id) + settings
                      )
                    )
                    .map { _ =>
                      Ok(settings.asJson)
                    }
                if (skipValidation)
                  saveSettings()
                else
                  otoroshiClient
                    .getRoutes()(using settings)
                    .flatMap { _ =>
                      saveSettings()
                    }
                    .recover { _ =>
                      BadRequest(
                        Json.obj("error" -> "Failed to join otoroshi instances")
                      )
                    }
            }
        }
      }
    }

  def createOtoroshiSettings(
      tenantId: String,
      skipValidation: Boolean = false
  ) =
    DaikokuAction.async(parse.json) { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has created one otoroshi settings (@{otoroshi.id})"
        )
      )(tenantId, ctx) { (tenant, _) =>
        OtoroshiSettingsFormat.reads(ctx.request.body) match {
          case JsError(_) =>
            FastFuture.successful(
              BadRequest(Json.obj("error" -> "Error while parsing payload"))
            )
          case JsSuccess(settings, _) =>
            def createOtoroshi() = {
              ctx.setCtxValue("otoroshi.id", settings.id)
              env.dataStore.tenantRepo
                .save(
                  tenant
                    .copy(otoroshiSettings = tenant.otoroshiSettings + settings)
                )
                .map { _ =>
                  Created(settings.asJson)
                }
            }
            if (skipValidation)
              createOtoroshi()
            else
              otoroshiClient
                .getRoutes()(using settings)
                .flatMap { _ =>
                  createOtoroshi()
                }
                .recover { case _ =>
                  BadRequest(
                    Json.obj("error" -> "Failed to join otoroshi instances")
                  )
                }
        }
      }
    }

  def otoroshiGroupsFor(teamId: String, oto: String) =
    DaikokuAction.async { ctx =>
      TeamApiEditorOnly(
        AuditTrailEvent(
          s"@{user.name} has accessed groups of one otoroshi settings ($oto) for team @{team.name} - @{team.id}"
        )
      )(teamId, ctx) { team =>
        ctx.tenant.otoroshiSettings.find(s => s.id.value == oto) match {
          case None =>
            NotFound(Json.obj("error" -> s"Settings $oto not found")).future
          case Some(settings) =>
            otoroshiClient
              .getServiceGroups()(using settings)
              .map { groups =>
                team.authorizedOtoroshiEntities match {
                  case Some(authorizedEntities)
                      if authorizedEntities.nonEmpty =>
                    authorizedEntities
                      .find(x => x.otoroshiSettingsId.value == oto) match {
                      case Some(entities) =>
                        Ok(JsArray(groups.value.filter(g => {
                          val _id = (g \ "id").as[String]
                          entities.authorizedEntities.groups
                            .exists(_.value == _id)
                        })))
                      case None =>
                        NotFound(
                          Json.obj("error" -> s"Settings $oto not found")
                        )
                    }
                  case _ => Ok(groups)
                }
              }
              .recover { case error =>
                BadRequest(Json.obj("error" -> error.getMessage))
              }
        }
      }
    }

  def otoroshiGroupsForTenant(tenantId: String, oto: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has accessed groups of one otoroshi settings ($oto)"
        )
      )(tenantId, ctx) { (tenant, _) =>
        tenant.otoroshiSettings.find(s => s.id.value == oto) match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> s"Settings $oto not found"))
            )
          case Some(settings) =>
            otoroshiClient
              .getServiceGroups()(using settings)
              .map(Ok(_))
              .recover { case error =>
                BadRequest(Json.obj("error" -> error.getMessage))
              }
        }
      }
    }

  def otoroshiServicesFor(teamId: String, oto: String) =
    DaikokuAction.async { ctx =>
      TeamApiEditorOnly(
        AuditTrailEvent(
          s"@{user.name} has accessed services of one otoroshi settings ($oto) for team @{team.name} - @{team.id}"
        )
      )(teamId, ctx) { team =>
        ctx.tenant.otoroshiSettings.find(s => s.id.value == oto) match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> s"Settings $oto not found"))
            )
          case Some(settings) =>
            otoroshiClient
              .getServices()(using settings)
              .map { services =>
                team.authorizedOtoroshiEntities match {
                  case Some(authorizedEntities)
                      if authorizedEntities.nonEmpty =>
                    authorizedEntities
                      .find(x => x.otoroshiSettingsId.value == oto) match {
                      case Some(entities) =>
                        Ok(JsArray(services.value.filter(g => {
                          val _id = (g \ "id").as[String]
                          entities.authorizedEntities.services
                            .exists(_.value == _id)
                        })))
                      case None =>
                        NotFound(
                          Json.obj("error" -> s"Settings $oto not found")
                        )
                    }
                  case _ => Ok(services)
                }
              }
              .recover { case error =>
                BadRequest(Json.obj("error" -> error.getMessage))
              }
        }
      }
    }

  def otoroshiRoutesFor(teamId: String, oto: String) =
    DaikokuAction.async { ctx =>
      TeamApiEditorOnly(
        AuditTrailEvent(
          s"@{user.name} has accessed routes of one otoroshi settings ($oto) for team @{team.name} - @{team.id}"
        )
      )(teamId, ctx) { team =>
        ctx.tenant.otoroshiSettings.find(s => s.id.value == oto) match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> s"Settings $oto not found"))
            )
          case Some(settings) =>
            otoroshiClient
              .getRoutes()(using settings)
              .map { routes =>
                team.authorizedOtoroshiEntities match {
                  case Some(authorizedEntities)
                      if authorizedEntities.nonEmpty =>
                    authorizedEntities
                      .find(x => x.otoroshiSettingsId.value == oto) match {
                      case Some(entities) =>
                        Ok(JsArray(routes.value.filter(g => {
                          val _id = (g \ "id").as[String]
                          entities.authorizedEntities.routes
                            .exists(_.value == _id)
                        })))
                      case None =>
                        NotFound(
                          Json.obj("error" -> s"Settings $oto not found")
                        )
                    }
                  case _ => Ok(routes)
                }
              }
              .recover { case error =>
                BadRequest(Json.obj("error" -> error.getMessage))
              }
        }
      }
    }

  def otoroshiServicesForTenant(tenantId: String, oto: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has accessed services of one otoroshi settings ($oto)"
        )
      )(tenantId, ctx) { (tenant, _) =>
        tenant.otoroshiSettings.find(s => s.id.value == oto) match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> s"Settings $oto not found"))
            )
          case Some(settings) =>
            otoroshiClient
              .getServices()(using settings)
              .map(Ok(_))
              .recover { case error =>
                BadRequest(Json.obj("error" -> error.getMessage))
              }
        }
      }
    }

  def otoroshiRoutesForTenant(tenantId: String, oto: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has accessed routes of one otoroshi settings ($oto)"
        )
      )(tenantId, ctx) { (tenant, _) =>
        tenant.otoroshiSettings.find(s => s.id.value == oto) match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> s"Settings $oto not found"))
            )
          case Some(settings) =>
            otoroshiClient
              .getRoutes()(using settings)
              .map(Ok(_))
              .recover { case error =>
                BadRequest(Json.obj("error" -> error.getMessage))
              }
        }
      }
    }

  def otoroshiApiKeysForTenant(tenantId: String, oto: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has accessed groups of one otoroshi settings ($oto)"
        )
      )(tenantId, ctx) { (tenant, _) =>
        tenant.otoroshiSettings.find(s => s.id.value == oto) match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> s"Settings $oto not found"))
            )
          case Some(settings) =>
            otoroshiClient
              .getApiKeys()(using settings)
              .map(Ok(_))
              .recover { case error =>
                BadRequest(Json.obj("error" -> error.getMessage))
              }
        }
      }
    }

  def createTestingApiKey(teamId: String) =
    DaikokuAction.async(parse.json) { ctx =>
      TeamApiEditorOnly(
        AuditTrailEvent(
          s"@{user.name} create a testing apikey for team @{team.name} - @{team.id}"
        )
      )(teamId, ctx) { team =>
        val otoroshiSettingsOpt =
          (ctx.request.body \ "otoroshiSettings").asOpt[String]
        val authorizedEntitiesOpt = (ctx.request.body \ "authorizedEntities")
          .asOpt(using AuthorizedEntitiesFormat)
        val clientNameOpt = (ctx.request.body \ "clientName").asOpt[String]
        val tagOpt = (ctx.request.body \ "tag").asOpt[String]
        val metadataOpt = (ctx.request.body \ "customMetadata").asOpt[JsObject]
        val readOnlyOpt = (ctx.request.body \ "customReadOnly").asOpt[Boolean]
        val maxPerSecondOpt =
          (ctx.request.body \ "customMaxPerSecond").asOpt[Long]
        val maxPerDayOpt = (ctx.request.body \ "customMaxPerDay").asOpt[Long]
        val maxPerMonthOpt =
          (ctx.request.body \ "customMaxPerMonth").asOpt[Long]

        def createApiKey(
            clientName: String,
            authorizedEntities: AuthorizedEntities,
            tag: String
        ) = {
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
            readOnly = readOnlyOpt.getOrElse(false),
            validUntil = None
          )
        }

        (for {
          otoroshiSettings <- EitherT.fromOption[Future](
            otoroshiSettingsOpt,
            AppError.EntityNotFound("Otoroshi settings")
          )
          authorizedEntities <- EitherT.fromOption[Future](
            authorizedEntitiesOpt,
            AppError.EntityNotFound("authorized entities")
          )
          clientName <- EitherT.fromOption[Future](
            clientNameOpt,
            AppError.EntityNotFound("client name")
          )
          tag <-
            EitherT.fromOption[Future](tagOpt, AppError.EntityNotFound("tag"))
          settings <- EitherT.fromOption[Future](
            ctx.tenant.otoroshiSettings.find(s =>
              s.id.value == otoroshiSettings
            ),
            AppError.EntityNotFound("Otoroshi settings")
          )
          apiKey = createApiKey(clientName, authorizedEntities, tag)
          createdKey <- EitherT(
            otoroshiClient.createApiKey(apiKey)(using settings)
          )
        } yield Ok(createdKey.asJson))
          .leftMap(_.render())
          .merge
      }
    }

  private def findTestingOfTeam(
      tenant: Tenant,
      team: Team,
      entityType: String,
      entityId: String
  ): Future[Option[Testing]] =
    entityType match {
      case "api" =>
        env.dataStore.apiRepo
          .findByIdAndTeam(tenant.id, ApiId(entityId), team.id)
          .map(_.flatMap(_.testing))

      case "plan" =>
        for {
          api <- env.dataStore.apiRepo
            .findByPlan(tenant.id, UsagePlanId(entityId))
          plan <- env.dataStore.usagePlanRepo
            .forTenant(tenant)
            .findById(entityId)
        } yield api
          .filter(_.team == team.id)
          .flatMap(_ => plan)
          .flatMap(_.testing)

      case _ => FastFuture.successful(None)
    }

  def updateTestingApiKey(teamId: String) =
    DaikokuAction.async(parse.json) { ctx =>
      TeamApiEditorOnly(
        AuditTrailEvent(
          s"@{user.name} update testing @{apikey.id} apikey for team @{team.name} - @{team.id}"
        )
      )(teamId, ctx) { team =>
        val body = ctx.request.body

        def handleKeyJob(
            previousSettings: OtoroshiSettings,
            actualSettings: OtoroshiSettings,
            key: ActualOtoroshiApiKey
        ): EitherT[Future, AppError, ActualOtoroshiApiKey] = {
          if (previousSettings != actualSettings) {
            for {
              _ <- otoroshiClient.deleteApiKey(key.clientId)(using
                previousSettings
              )
              newKey <-
                EitherT(otoroshiClient.createApiKey(key)(using actualSettings))
            } yield newKey
          } else {
            EitherT(otoroshiClient.updateApiKey(key)(using previousSettings))
          }

        }

        (for {
          entityType <- EitherT.fromOption[Future](
            (body \ "entity" \ "type").asOpt[String],
            AppError.ParsingPayloadError("entity type is missing")
          )
          entityId <- EitherT.fromOption[Future](
            (body \ "entity" \ "_id").asOpt[String],
            AppError.ParsingPayloadError("entity id is missing")
          )
          testingConfig <- EitherT.fromOption[Future](
            body.asOpt(using TestingConfigFormat),
            AppError.ParsingPayloadError("invalid testing configuration")
          )

          testing <- EitherT.fromOptionF[Future, AppError, Testing](
            findTestingOfTeam(ctx.tenant, team, entityType, entityId),
            AppError.EntityNotFound("testing configuration")
          )

          otoroshiSettings <- EitherT.fromOption[Future](
            ctx.tenant.otoroshiSettings
              .find(_.id == testingConfig.otoroshiSettings),
            AppError.EntityNotFound("Otoroshi settings")
          )
          previousSettings <- EitherT.fromOption[Future](
            ctx.tenant.otoroshiSettings.find(s =>
              testing.config.map(_.otoroshiSettings).contains(s.id)
            ),
            AppError.EntityNotFound("Otoroshi settings")
          )
          clientId <- EitherT.fromOption[Future](
            testing.username,
            AppError.EntityNotFound("testing apikey")
          )
          apiKey <- EitherT(
            otoroshiClient.getApikey(clientId)(using previousSettings)
          )
          lastMetadata: Map[String, String] =
            testing.config
              .flatMap(_.customMetadata)
              .flatMap(_.asOpt[Map[String, String]])
              .getOrElse(Map.empty[String, String])

          updatedKey = apiKey.copy(
            authorizedEntities = testingConfig.authorizedEntities,
            metadata =
              (apiKey.metadata -- lastMetadata.keySet) ++ testingConfig.customMetadata
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

  def deleteTestingApiKey(teamId: String) =
    DaikokuAction.async(parse.json) { ctx =>
      TeamApiEditorOnly(
        AuditTrailEvent(
          s"@{user.name} delete testing @{apikey.id} apikey for team @{team.name} - @{team.id}"
        )
      )(teamId, ctx) { team =>
        val otoroshiSettingsOpt =
          (ctx.request.body \ "otoroshiSettings").asOpt[String]

        val clientIdOpt = (ctx.request.body \ "clientId").asOpt[String]

        def isTestingKeyOfTeam(key: ActualOtoroshiApiKey) =
          key.metadata.get("daikoku_testing_only").contains("true") &&
            key.metadata
              .get("daikoku_created_for_team_id")
              .contains(team.id.value)

        (for {
          otoroshiSettingsId <- EitherT.fromOption[Future](
            otoroshiSettingsOpt,
            AppError.EntityNotFound("Otoroshi settings")
          )
          clientId <- EitherT.fromOption[Future](
            clientIdOpt,
            AppError.EntityNotFound("clientId settings")
          )
          otoroshiSettings <- EitherT.fromOption[Future](
            ctx.tenant.otoroshiSettings
              .find(s => s.id.value == otoroshiSettingsId),
            AppError.EntityNotFound("Otoroshi settings")
          )
          existingKey <- otoroshiClient.getApikeyOpt(clientId)(using
            otoroshiSettings
          )
          _ <- EitherT.cond[Future][AppError, Unit](
            existingKey.forall(isTestingKeyOfTeam),
            (),
            AppError.ForbiddenAction
          )
          _ <- existingKey match {
            case Some(_) =>
              otoroshiClient.deleteApiKey(clientId)(using otoroshiSettings)
            case None => EitherT.pure[Future, AppError](())
          }
        } yield Ok(Json.obj("done" -> true)))
          .leftMap(_.render())
          .merge
      }
    }

  private def makeCall(
      _body: JsValue,
      testing: Testing,
      credentials: Option[(String, String)],
      id: String
  ): Future[Either[AppError, Result]] = {
    val headers = (_body \ "headers")
      .asOpt[Map[String, String]]
      .getOrElse(Map.empty[String, String])
    val method =
      (_body \ "method").asOpt[String].getOrElse("GET")
    val body = (_body \ "body").asOpt[String]
    val swaggerUrl = (_body \ "url").as[String]

    val headerOpt = headers.find(_._2 == s"fake-$id")
    val maybeUrl =
      testing.url.map(u => s"$u${Uri(swaggerUrl).path.toString()}")

    val finalHeaders: Map[String, String] = (testing.auth, credentials) match {
      case (TestingAuth.ApiKey, Some((clientId, _))) if headerOpt.isDefined =>
        headers - headerOpt.get._1 + (headerOpt.get._1 -> clientId)
      case (TestingAuth.Basic, Some((clientId, clientSecret))) =>
        headers - "Authorization" + ("Authorization" -> s"Basic ${Base64
            .encodeBase64String(
              s"$clientId:$clientSecret".getBytes(StandardCharsets.UTF_8)
            )}")
      case _ => headers
    }

    maybeUrl match {
      case Some(finalUrl) =>
        val builder = env.wsClient
          .url(finalUrl)
          .withHttpHeaders(finalHeaders.toSeq*)
          .withFollowRedirects(false)
          .withMethod(method)
          .withRequestTimeout(30.seconds)

        body
          .map(b =>
            builder.withBody(play.api.libs.ws.InMemoryBody(ByteString(b)))
          )
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
                  None,
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
                  .filter(_._1 != "Transfer-Encoding")*
              )
              .as(ctype)
          }
          .map(Right(_))
          .recover { case e =>
            Left(AppError.InternalServerError(e.getMessage))
          }
      case None =>
        FastFuture.successful(Left(AppError.EntityNotFound("test server url")))
    }
  }

  private def canSeeApi(api: Api, myTeams: Seq[Team], user: User): Boolean =
    api.visibility == ApiVisibility.Public ||
      user.isDaikokuAdmin ||
      myTeams.exists(team => team.id == api.team || api.authorizedTeams.contains(team.id))

  private def resolveCredentials(
      ctx: DaikokuActionContext[JsValue],
      testing: Testing,
      apiId: ApiId,
      planId: Option[UsagePlanId],
      myTeams: Seq[Team]
  ): EitherT[Future, AppError, Option[(String, String)]] =
    (ctx.request.body \ "subscription").asOpt[String] match {
      case None =>
        EitherT.pure[Future, AppError](
          testing.username.map(_ -> testing.password.getOrElse(""))
        )
      case Some(subscriptionId) =>
        for {
          _ <- EitherT.cond[Future][AppError, Unit](
            testing.allowSubscriberKeys,
            (),
            AppError.ForbiddenAction
          )
          subscription <- EitherT.fromOptionF(
            env.dataStore.apiSubscriptionRepo
              .forTenant(ctx.tenant)
              .findById(subscriptionId),
            AppError.SubscriptionNotFound
          )
          _ <- EitherT.cond[Future][AppError, Unit](
            subscription.api == apiId &&
              planId.forall(_ == subscription.plan) &&
              subscription.state == ApiSubscriptionState.Active &&
              myTeams.exists(_.id == subscription.team),
            (),
            AppError.ForbiddenAction
          )
          keyring <- EitherT.fromOptionF(
            env.dataStore.keyringRepo
              .forTenant(ctx.tenant)
              .findById(subscription.keyring),
            AppError.SubscriptionNotFound
          )
        } yield Some(keyring.apiKey.clientId -> keyring.apiKey.clientSecret)
    }

  def fakeApiCall(teamId: String, apiId: String) =
    DaikokuAction.async(parse.json) { ctx =>
      (for {
        team <- EitherT.fromOptionF(
          env.dataStore.teamRepo
            .forTenant(ctx.tenant)
            .findById(teamId),
          AppError.TeamNotFound
        )
        api <- EitherT.fromOptionF(
          env.dataStore.apiRepo
            .findByIdAndTeam(ctx.tenant.id, ApiId(apiId), team.id),
          AppError.ApiNotFound
        )
        myTeams <- EitherT.liftF[Future, AppError, Seq[Team]](
          env.dataStore.teamRepo.myTeams(ctx.tenant, ctx.user)
        )
        _ <- EitherT.cond[Future][AppError, Unit](
          canSeeApi(api, myTeams, ctx.user),
          (),
          AppError.ApiNotFound
        )
        testing <- EitherT.fromOption[Future](
          api.testing.filter(_.enabled),
          AppError.ForbiddenAction
        )
        credentials <- resolveCredentials(ctx, testing, api.id, None, myTeams)
        result <- EitherT(
          makeCall(ctx.request.body, testing, credentials, api.id.value)
        )
      } yield result)
        .leftMap(_.render())
        .merge
    }

  def fakePlanCall(teamId: String, apiId: String, planId: String) =
    DaikokuAction.async(parse.json) { ctx =>
      (for {
        team <- EitherT.fromOptionF(
          env.dataStore.teamRepo
            .forTenant(ctx.tenant)
            .findById(teamId),
          AppError.TeamNotFound
        )
        api <- EitherT.fromOptionF(
          env.dataStore.apiRepo
            .findByIdAndTeam(ctx.tenant.id, ApiId(apiId), team.id),
          AppError.ApiNotFound
        )
        myTeams <- EitherT.liftF[Future, AppError, Seq[Team]](
          env.dataStore.teamRepo.myTeams(ctx.tenant, ctx.user)
        )
        _ <- EitherT.cond[Future][AppError, Unit](
          canSeeApi(api, myTeams, ctx.user),
          (),
          AppError.ApiNotFound
        )
        _ <- EitherT.cond[Future][AppError, Unit](
          api.possibleUsagePlans.exists(_.value == planId),
          (),
          AppError.PlanNotFound
        )
        plan <- EitherT.fromOptionF(
          env.dataStore.usagePlanRepo
            .forTenant(ctx.tenant)
            .findById(planId),
          AppError.PlanNotFound
        )
        testing <- EitherT.fromOption[Future](
          plan.testing.filter(_.enabled),
          AppError.ForbiddenAction
        )
        credentials <- resolveCredentials(
          ctx,
          testing,
          api.id,
          Some(plan.id),
          myTeams
        )
        result <- EitherT(
          makeCall(ctx.request.body, testing, credentials, plan.id.value)
        )
      } yield result)
        .leftMap(_.render())
        .merge
    }
}
