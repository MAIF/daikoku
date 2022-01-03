package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import akka.stream.scaladsl.{Flow, GraphDSL, JsonFraming, Merge, Partition, Sink, Source}
import akka.stream.{FlowShape, Materializer}
import akka.util.ByteString
import akka.{Done, NotUsed}
import cats.data.EitherT
import controllers.AppError
import controllers.AppError._
import fr.maif.otoroshi.daikoku.actions.{DaikokuAction, DaikokuActionContext, DaikokuActionMaybeWithGuest}
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async._
import fr.maif.otoroshi.daikoku.domain.NotificationAction.{ApiAccess, ApiSubscriptionDemand}
import fr.maif.otoroshi.daikoku.domain.UsagePlanVisibility.{Private, Public}
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.utils.StringImplicits.BetterString
import fr.maif.otoroshi.daikoku.utils.{ApiService, IdGenerator, OtoroshiClient, Translator}
import jobs.{ApiKeyStatsJob, OtoroshiVerifierJob}
import org.joda.time.DateTime
import play.api.Logger
import play.api.http.HttpEntity
import play.api.i18n.{I18nSupport, Lang}
import play.api.libs.json._
import play.api.libs.streams.Accumulator
import play.api.mvc._
import reactivemongo.bson.BSONObjectID

import scala.concurrent.Future
import scala.util.hashing.MurmurHash3
import scala.util.{Failure, Success, Try}

class ApiController(DaikokuAction: DaikokuAction,
                    DaikokuActionMaybeWithGuest: DaikokuActionMaybeWithGuest,
                    apiService: ApiService,
                    apiKeyStatsJob: ApiKeyStatsJob,
                    env: Env,
                    otoroshiClient: OtoroshiClient,
                    cc: ControllerComponents,
                    otoroshiSynchronisator: OtoroshiVerifierJob,
                    translator: Translator)
  extends AbstractController(cc)
    with I18nSupport {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env
  implicit val tr = translator

  val logger = Logger("ApiController")

  def getDaikokuUrl(tenant: Tenant, path: String) = env.config.exposedPort match {
    case 80 => s"http://${tenant.domain}$path"
    case 443 => s"https://${tenant.domain}$path"
    case _ => s"http://${tenant.domain}:${env.config.exposedPort}$path"
  }

  def me() = DaikokuAction.async { ctx =>
    authorizations.sync.PublicUserAccess(AuditTrailEvent("@{user.name} has accessed his own profile"))(ctx) {
        ctx.user.asJson
          .transform((JsPath \ "twoFactorAuthentication" \ "secret").json.prune) match {
          case JsSuccess(user, _) => Ok(user)
          case JsError(_) => Ok(ctx.user.asJson)
        }
    }
  }

  def apiSwagger(teamId: String, apiId: String, version: String) = DaikokuActionMaybeWithGuest.async { ctx =>
    UberPublicUserAccess(AuditTrailEvent("@{user.name} has accessed swagger of api @{api.name} on team @{team.name}"))(ctx) {

      def fetchSwagger(api: Api): Future[Result] = {
        api.swagger match {
          case Some(SwaggerAccess(_, Some(content), _)) => FastFuture.successful(Ok(content).as("application/json"))
          case Some(SwaggerAccess(url, None, headers)) => {
            val finalUrl = if (url.startsWith("/")) getDaikokuUrl(ctx.tenant, url) else url
            Try {
              env.wsClient.url(finalUrl).withHttpHeaders(headers.toSeq: _*).get().map { resp =>
                Ok(resp.body).as(resp.header("Content-Type").getOrElse("application/json"))
              }
            }.recover {
              case _: Exception => FastFuture.successful(BadRequest(Json.obj("error" -> "Can't retrieve swagger")))
            }.get
          }
          case None => FastFuture.successful(NotFound(Json.obj("error" -> "swagger access not found")))
        }
      }

      (ctx.tenant.apiReferenceHideForGuest, ctx.user.isGuest) match {
        case (None, true) => FastFuture.successful(Forbidden(Json.obj("error" -> "Tenant is set up for hide api reference for Guest user")))
        case (Some(true), true) => FastFuture.successful(Forbidden(Json.obj("error" -> "Tenant is set up for hide api reference for Guest user")))
        case (_, _) => env.dataStore.teamRepo.forTenant(ctx.tenant.id).findByIdOrHrIdNotDeleted(teamId).flatMap {
          case Some(team) =>
            ctx.setCtxValue("team.name", team.name)
            env.dataStore.apiRepo.findByVersion(ctx.tenant, apiId, version).flatMap {
              case None => FastFuture.successful(NotFound(Json.obj("error" -> "Api not found")))
              case Some(api) if api.visibility == ApiVisibility.Public =>
                ctx.setCtxValue("api.name", api.name)
                fetchSwagger(api)
              case Some(api) if api.team == team.id =>
                ctx.setCtxValue("api.name", api.name)
                fetchSwagger(api)
              case Some(api) if api.visibility != ApiVisibility.Public && api.authorizedTeams.contains(team.id) =>
                ctx.setCtxValue("api.name", api.name)
                fetchSwagger(api)
              case _ => FastFuture.successful(Unauthorized(Json.obj("error" -> "You're not authorized on this api", "status" -> 403)))
            }
          case None => FastFuture.successful(NotFound(Json.obj("error" -> "Team not found")))
        }
      }
    }
  }

  def myTeams() = DaikokuActionMaybeWithGuest.async { ctx =>
    UberPublicUserAccess(AuditTrailEvent("@{user.name} has accessed his team list"))(ctx) {
      env.dataStore.teamRepo
        .myTeams(ctx.tenant, ctx.user)
        .map { teams =>
          Ok(JsArray(teams.sortWith((a, b) => a.name.compareToIgnoreCase(b.name) < 0).map(_.asSimpleJson)))
        }
    }
  }

  def oneOfMyTeam(teamId: String) = DaikokuAction.async { ctx =>
    TeamMemberOnly(
      AuditTrailEvent("@{user.name} has accessed on of his team @{team.name} - @{team.id}")
    )(teamId, ctx) { team =>
      ctx.setCtxValue("team.name", team.name)
      ctx.setCtxValue("team.id", team.id)

      FastFuture.successful(Ok(team.toUiPayload))
    }
  }

  def myOwnTeam() = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(s"@{user.name} has accessed its first team on @{tenant.name}"))(ctx) {
      env.dataStore.teamRepo
        .forTenant(ctx.tenant.id)
        .findOne(
          Json.obj(
            "_deleted" -> false,
            "type" -> TeamType.Personal.name,
            "users.userId" -> ctx.user.id.asJson
          )
        )
        .map {
          case None => NotFound(Json.obj("error" -> "Team not found"))
          case Some(team) if team.includeUser(ctx.user.id) => Ok(team.asSimpleJson)
          case _ => Unauthorized(Json.obj("error" -> "You're not authorized on this team"))
        }
    }
  }

  def subscribedApis(teamId: String) = DaikokuAction.async { ctx =>
    TeamMemberOnly(
      AuditTrailEvent(s"@{user.name} has accessed the subscribed api list of team @{team.name} - @{team.id}")
    )(teamId, ctx) { team =>
      env.dataStore.apiSubscriptionRepo
        .forTenant(ctx.tenant.id)
        .findNotDeleted(
          Json.obj(
            "_id" -> Json.obj("$in" -> JsArray(team.subscriptions.map(_.asJson)))
          )
        )
        .flatMap { subscriptions =>
          env.dataStore.apiSubscriptionRepo
            .forTenant(ctx.tenant.id)
            .find(Json.obj("_id" -> Json.obj(
              "$in" -> subscriptions.flatMap(s => s.parent).map(_.value)
            )))
            .flatMap { s =>
                env.dataStore.apiRepo
                  .forTenant(ctx.tenant.id)
                  .findNotDeleted(
                    Json.obj(
                      "_id" -> Json.obj("$in" -> JsArray((s ++ subscriptions).map(_.api.asJson)))
                    )
                  )
                  .flatMap(apis => FastFuture.successful(Ok(JsArray(apis.map(_.asJson)))))
            }
        }
    }
  }

  def getTeamVisibleApis(teamId: String, apiId: String, version: String) = DaikokuAction.async { ctx =>
    import cats.implicits._

    TeamMemberOnly(AuditTrailEvent(s"@{user.name} is accessing team @{team.name} visible api @{api.name} ($version)"))(teamId, ctx) {
      team =>
        val r: EitherT[Future, Result, Result] = for {
          api <- EitherT.fromOptionF(env.dataStore.apiRepo.findByVersion(ctx.tenant, apiId, version),
            NotFound(Json.obj("error" -> "Api not found")))
          pendingRequests <- if (api.team == team.id) EitherT.liftF(FastFuture.successful(Seq.empty[Notification]))
          else if (!ctx.user.isDaikokuAdmin && api.visibility != ApiVisibility.Public && !api.authorizedTeams.contains(team.id))
            EitherT.leftT[Future, Seq[Notification]](
              Unauthorized(Json.obj("error" -> "You're not authorized on this api", "status" -> 403))
            )
          else
            EitherT.liftF(
              env.dataStore.notificationRepo
                .forTenant(ctx.tenant.id)
                .findNotDeleted(
                  Json.obj("action.type" -> "ApiSubscription",
                    "status.status" -> "Pending",
                    "action.api" -> api.id.asJson,
                    "action.team" -> team.id.value)
                )
            )
          subscriptions <- EitherT.liftF(
            env.dataStore.apiSubscriptionRepo
              .forTenant(ctx.tenant.id)
              .findNotDeleted(Json.obj("api" -> api.id.value, "team" -> team.id.value))
          )
        } yield {
          val betterApis = api.asSimpleJson.as[JsObject] ++ Json.obj(
            "possibleUsagePlans" -> JsArray(
              api.possibleUsagePlans
                .map(p => p.asJson.as[JsObject] ++ Json.obj("otoroshiTarget" -> p.otoroshiTarget.isDefined))
            )
          ) ++ Json.obj(
            "pendingRequestPlan" -> JsArray(
              pendingRequests.map(r => r.action.asInstanceOf[ApiSubscriptionDemand].plan.asJson)
            )
          ) ++ Json.obj("subscriptions" -> JsArray(subscriptions.map(_.asSimpleJson)))
          ctx.setCtxValue("api.name", api.name)
          ctx.setCtxValue("team.name", team.name)
          Ok(betterApis)
        }

        r.value.map(_.merge)
    }
  }

  def getApi(api: Api, ctx: DaikokuActionContext[AnyContent]) = {
    import cats.implicits._

    val r: EitherT[Future, Result, Result] = for {
      myTeams <- EitherT.liftF(env.dataStore.teamRepo.myTeams(ctx.tenant, ctx.user))
      error: EitherT[Future, Result, Seq[Notification]] = EitherT.leftT[Future, Seq[Notification]](AppError.render(ApiNotFound))
      value: EitherT[Future, Result, Seq[Notification]] = EitherT.liftF(
        env.dataStore.notificationRepo
          .forTenant(ctx.tenant.id)
          .findNotDeleted(
            Json.obj(
              "action.type" -> "ApiSubscription",
              "status.status" -> "Pending",
              "action.api" -> api.id.asJson,
              "action.team" -> Json.obj("$in" -> JsArray(myTeams.map(_.id.asJson)))
            )
          )
      )
      pendingRequests <- value
      subscriptions <- EitherT.liftF(
        env.dataStore.apiSubscriptionRepo
          .forTenant(ctx.tenant.id)
          .findNotDeleted(
            Json.obj("api" -> api.id.value,
              "team" -> Json.obj("$in" -> JsArray(myTeams.map(_.id.asJson))))
          )
      )
    } yield {
      if ((api.visibility == ApiVisibility.Public || ctx.user.isDaikokuAdmin || (api.authorizedTeams :+ api.team)
        .intersect(myTeams.map(_.id))
        .nonEmpty) && (api.published || myTeams.exists(_.id == api.team))) {
        val betterApi = api
          .copy(possibleUsagePlans = api.possibleUsagePlans.filter(p => p.visibility == UsagePlanVisibility.Public || p.typeName == "Admin" || myTeams.exists(_.id == api.team)))
          .asJson.as[JsObject] ++ Json.obj(
          "pendingRequests" -> JsArray(
            pendingRequests.map(_.asJson)
          )
        ) ++ Json.obj(
          "subscriptions" -> JsArray(subscriptions.map(_.asSimpleJson))
        )
        ctx.setCtxValue("api.name", api.name)
        Ok(if(ctx.tenant.apiReferenceHideForGuest.getOrElse(true) && ctx.user.isGuest) betterApi - "swagger" else  betterApi)
      } else {
        Unauthorized(Json.obj(
          "error" -> "You're not authorized on this api",
          "status" -> 401,
          "visibility" -> api.visibility.name
        ))
      }
    }

    r.value.map(_.merge)
  }

  def getVisibleApiWithId(apiId: String) = DaikokuActionMaybeWithGuest.async { ctx =>
    UberPublicUserAccess(AuditTrailEvent("@{user.name} is accessing visible api @{api.name}"))(ctx) {
      env.dataStore.apiRepo
        .forTenant(ctx.tenant)
        .findById(apiId)
        .flatMap {
          case None => FastFuture.successful(AppError.render(ApiNotFound))
          case Some(api) => getApi(api, ctx)
        }
    }
  }

  def getVisibleApi(humanReadableId: String, version: String) = DaikokuActionMaybeWithGuest.async { ctx =>
    UberPublicUserAccess(AuditTrailEvent("@{user.name} is accessing visible api @{api.name}"))(ctx) {
      env.dataStore.apiRepo
        .findByVersion(ctx.tenant, humanReadableId, version)
        .flatMap {
          case None => FastFuture.successful(AppError.render(ApiNotFound))
          case Some(api) => getApi(api, ctx)
        }
    }
  }

  def getDocumentationPage(apiId: String, pageId: String) = DaikokuActionMaybeWithGuest.async { ctx =>
    UberPublicUserAccess(
      AuditTrailEvent(s"@{user.name} has accessed documentation page for @{api.name} - @{api.id} - $pageId")
    )(ctx) {
      env.dataStore.apiRepo.forTenant(ctx.tenant.id).findByIdNotDeleted(apiId).flatMap {
        case None => FastFuture.successful(NotFound(Json.obj("error" -> "Api not found")))
        case Some(api) =>
          ctx.setCtxValue("api.id", api.id)
          ctx.setCtxValue("api.name", api.name)
          env.dataStore.apiDocumentationPageRepo.forTenant(ctx.tenant.id).findByIdOrHrId(pageId).map {
            case None => NotFound(Json.obj("error" -> "Page not found"))
            case Some(page) =>
              api.documentation match {
                case doc if !doc.pages.contains(page.id) =>
                  NotFound(Json.obj("error" -> "Page not found"))
                case doc if doc.pages.contains(page.id) && page.remoteContentEnabled =>
                  //Ok(page.asWebUiJson.as[JsObject] ++ Json.obj("contentUrl" -> s"/api/apis/$apiId/pages/$pageId/content"))
                  val url: String = page.remoteContentUrl.getOrElse(s"/api/apis/$apiId/pages/$pageId/content")
                  Ok(page.asWebUiJson.as[JsObject] ++ Json.obj("contentUrl" -> url))
                case doc if doc.pages.contains(page.id) =>
                  Ok(page.asWebUiJson)
              }
          }
      }
    }
  }

  private val extensions: Map[String, String] = Map(
    ".adoc" -> "text/asciidoc",
    ".avi" -> "video/x-msvideo",
    ".doc" -> "application/msword",
    ".docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".gif" -> "image/gif",
    ".html" -> "text/html",
    ".jpg" -> "image/jpeg",
    ".md" -> "text/markdown",
    ".mpeg" -> "video/mpeg",
    ".odp" -> "application/vnd.oasis.opendocument.presentation",
    ".ods" -> "application/vnd.oasis.opendocument.spreadsheet",
    ".odt" -> "application/vnd.oasis.opendocument.text",
    ".png" -> "image/png",
    ".pdf" -> "application/pdf",
    ".webm" -> "video/webm",
    ".css" -> "text/css",
    ".js" -> "text/javascript"
  ).map(t => (t._2, t._1))

  def getDocumentationPageRemoteContent(apiId: String, pageId: String) = DaikokuActionMaybeWithGuest.async { ctx =>
    import fr.maif.otoroshi.daikoku.utils.RequestImplicits._

    import scala.concurrent.duration._

    UberPublicUserAccess(
      AuditTrailEvent(
        s"@{user.name} has accessed documentation page remote content for @{api.name} - @{api.id} - $pageId"
      )
    )(ctx) {
      env.dataStore.apiRepo.forTenant(ctx.tenant.id).findByIdNotDeleted(apiId).flatMap {
        case None => FastFuture.successful(NotFound(Json.obj("error" -> "Api not found")))
        case Some(api) =>
          ctx.setCtxValue("api.id", api.id)
          ctx.setCtxValue("api.name", api.name)
          env.dataStore.apiDocumentationPageRepo.forTenant(ctx.tenant.id).findByIdOrHrId(pageId).flatMap {
            case None => FastFuture.successful(NotFound(Json.obj("error" -> "Page not found")))
            case Some(page) =>
              api.documentation match {
                case doc if doc.pages.contains(page.id) && page.remoteContentEnabled => {
                  val disposition = ("Content-Disposition" -> s"""attachment; filename="content${extensions.getOrElse(page.contentType, ".txt")}"""")
                  var url = page.remoteContentUrl
                    .getOrElse("https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf")
                  if (url.startsWith("/")) {
                    val host = ctx.request.headers
                      .get("Otoroshi-Proxied-Host")
                      .orElse(ctx.request.headers.get("X-Forwarded-Host"))
                      .getOrElse(ctx.request.host)
                    url = s"${ctx.request.theProtocol}://${host}$url"
                  }
                  if (url.contains("?")) {
                    url = s"$url&sessionId=${ctx.session.sessionId.value}"
                  } else {
                    url = s"$url?sessionId=${ctx.session.sessionId.value}"
                  }
                  logger.info(s"Calling document url $url")
                  env.wsClient
                    .url(url)
                    .withMethod("GET")
                    .withRequestTimeout(30.seconds)
                    .withHttpHeaders(page.remoteContentHeaders.toSeq: _*)
                    .stream()
                    .map { r =>
                      Status(r.status)
                        .sendEntity(
                          HttpEntity.Streamed(r.bodyAsSource,
                            r.header("Content-Length").map(_.toLong),
                            r.header("Content-Type"))
                        )
                        .withHeaders(r.headers.view.mapValues(_.head).toSeq: _*)
                        .as(page.contentType) //r.header("Content-Type").getOrElse(page.contentType))
                    }
                }
                case _ =>
                  FastFuture.successful(NotFound(Json.obj("error" -> "Page not found")))
              }
          }
      }
    }
  }

  private def getDocumentationDetailsImpl(tenant: Tenant, apiId: String, version: String): Future[Either[JsValue, JsValue]] = {
    env.dataStore.apiRepo
        .findByVersion(tenant, apiId, version).flatMap {
      case None => FastFuture.successful(Left(Json.obj("error" -> "Api not found")))
      case Some(api) =>
        val doc = api.documentation
        env.dataStore.apiDocumentationPageRepo
          .forTenant(tenant.id)
          .findWithProjection(
            Json.obj(
              "_deleted" -> false,
              "_id" -> Json.obj("$in" -> JsArray(doc.pages.map(_.value).map(JsString.apply).toSeq))
            ),
            Json.obj(
              "_id" -> true,
              "_humanReadableId" -> true,
              "title" -> true,
              // "index" -> true,
              "level" -> true,
              "lastModificationAt" -> true
            )
          )
          .map { list =>
            val pages: Seq[JsObject] =
              api.documentation.pages.map(id => list.find(o => (o \ "_id").as[String] == id.value)).collect {
                case Some(e) => e
              }
            Right(
              Json.obj(
                "pages" -> JsArray(pages.map(p => JsString((p \ "_id").as[String]))),
                "titles" -> JsArray(pages)
              )
            )
          }
    }
  }

  def getRootApi(apiId: String)  = DaikokuActionMaybeWithGuest.async { ctx =>
    UberPublicUserAccess(AuditTrailEvent(s"@{user.name} has requested root api @{api.id}"))(ctx) {
      env.dataStore.apiRepo.forTenant(ctx.tenant.id)
        .findOne(Json.obj(
          "_humanReadableId" -> apiId,
          "parent" -> JsNull
        ))
        .map {
          case None => AppError.render(ApiNotFound)
          case Some(api) => Ok(ApiFormat.writes(api))
        }
    }
  }

  def getDocumentationDetails(apiId: String, version: String) = DaikokuActionMaybeWithGuest.async { ctx =>
    UberPublicUserAccess(AuditTrailEvent(s"@{user.name} has accessed documentation details for @{api.id}"))(
      ctx
    ) {
      ctx.setCtxValue("api.id", apiId)
      getDocumentationDetailsImpl(ctx.tenant, apiId, version).map {
        case Left(r) => NotFound(r)
        case Right(r) => Ok(r)
      }
    }
  }

  case class subscriptionData(apiKey: OtoroshiApiKey, plan: UsagePlanId, team: TeamId, api: ApiId)

  def byteStringToApiSubscription: Flow[ByteString, subscriptionData, NotUsed] =
    Flow[ByteString]
      .via(JsonFraming.objectScanner(Int.MaxValue))
      .map(_.utf8String)
      .filterNot(_.isEmpty)
      .map(Json.parse)
      .map(value => subscriptionData(
        apiKey = (value \ "apikey").as(OtoroshiApiKeyFormat),
        plan = (value \ "plan").as(UsagePlanIdFormat),
        team = (value \ "team").as(TeamIdFormat),
        api = (value \ "api").as(ApiIdFormat)
      ))

  val sourceApiSubscriptionsDataBodyParser: BodyParser[Source[subscriptionData, _]] =
    BodyParser("Streaming BodyParser") { req =>
      req.contentType match {
        case Some("application/json") => Accumulator.source[ByteString].map(s => Right(s.via(byteStringToApiSubscription)))
        case _ => Accumulator.source[ByteString].map(_ => Left(UnsupportedMediaType))
      }
    }

  def initSubscriptions() = DaikokuAction.async(sourceApiSubscriptionsDataBodyParser) { ctx =>
    TenantAdminOnly(AuditTrailEvent(s"@{user.name} has init an apikey for @{api.name} - @{api.id}"))(ctx.tenant.id.value, ctx) { (tenant, _) =>
      val parallelism = 10;
      val subSource = ctx.request.body
        .map(data => ApiSubscription(
          id = ApiSubscriptionId(BSONObjectID.generate().stringify),
          tenant = tenant.id,
          apiKey = data.apiKey,
          plan = data.plan,
          createdAt = DateTime.now(),
          team = data.team,
          api = data.api,
          by = ctx.user.id,
          customName = Some(data.apiKey.clientName),
          rotation = None,
          integrationToken = IdGenerator.token(64)
        ))

      val UpdateTeamsFlow: Flow[ApiSubscription, ApiSubscription, NotUsed] = Flow[ApiSubscription]
        .mapAsync(1)(sub => {
          for {
            team <- env.dataStore.teamRepo.forTenant(tenant.id).findById(sub.team) if team.isDefined
            _ <- env.dataStore.teamRepo
              .forTenant(tenant.id)
              .save(team.get.copy(subscriptions = team.get.subscriptions :+ sub.id))
          } yield {
            sub
          }
        })
      val updateTeamConcurrentFlow: Flow[ApiSubscription, ApiSubscription, NotUsed] = Flow.fromGraph(GraphDSL.create() { implicit b: GraphDSL.Builder[NotUsed] =>
        import GraphDSL.Implicits._

        val merge = b.add(Merge[ApiSubscription](parallelism))
        val partition = b.add(Partition[ApiSubscription](parallelism, sub => {
          Math.abs(MurmurHash3.stringHash(sub.team.value)) % parallelism
        }))

        for (i <- 0 until parallelism) {
          partition.out(i) ~> UpdateTeamsFlow.async ~> merge.in(i)
        }

        FlowShape(partition.in, merge.out)
      })

      val createSubFlow: Flow[ApiSubscription, ApiSubscription, NotUsed] = Flow[ApiSubscription]
        .mapAsync(10)(sub => env.dataStore.apiSubscriptionRepo.forTenant(tenant.id)
          .save(sub)
          .map(done => sub -> done))
        .filter(_._2)
        .map(_._1)

      val source = subSource
        .via(createSubFlow)
        .via(updateTeamConcurrentFlow)

      val transformFlow = Flow[ApiSubscription]
        .map(_.apiKey.clientName)
        .map(json => ByteString(Json.stringify(JsString(json))))
        .intersperse(ByteString("["), ByteString(","), ByteString("]"))
        .watchTermination() { (mt, d) =>
          d.onComplete {
            case Success(done) => AppLogger.debug(s"init subscirptions for tenant ${tenant.id.value} is $done")
            case Failure(exception) =>
              AppLogger.error("Error processing stream", exception)
          }
          mt
        }


      FastFuture.successful(Created.sendEntity(HttpEntity.Streamed(source.via(transformFlow), None, Some("application/json"))))
    }
  }

  def byteStringToApi: Flow[ByteString, Api, NotUsed] =
    Flow[ByteString]
      .via(JsonFraming.objectScanner(Int.MaxValue))
      .map(_.utf8String)
      .filterNot(_.isEmpty)
      .map(Json.parse)
      .map(value => json.ApiFormat.reads(value))
      .filterNot(_.isError)
      .map(_.get)

  val sourceApiBodyParser: BodyParser[Source[Api, _]] =
    BodyParser("Streaming BodyParser") { req =>
      req.contentType match {
        case Some("application/json") => Accumulator.source[ByteString].map(s => Right(s.via(byteStringToApi)))
        case _ => Accumulator.source[ByteString].map(_ => Left(UnsupportedMediaType))
      }
    }

  def initApis() = DaikokuAction.async(sourceApiBodyParser) { ctx =>
    TenantAdminOnly(AuditTrailEvent(s"@{user.name} has init apis"))(ctx.tenant.id.value, ctx) { (_, _) => {
      val source = ctx.request.body
        .filter(api => api.tenant == ctx.tenant.id)
        .grouped(10)
        .alsoTo(Sink.foreach(seq => AppLogger.debug(s"${seq.length} apis process")))
        .flatMapConcat(seq => {
          Source(seq)
            .mapAsync(10) { api =>
              env.dataStore.apiRepo.forTenant(ctx.tenant.id)
                .save(api).map { done =>
                Json.obj("name" -> api.name, "done" -> done)
              }
            }
        })
        .map(json => ByteString(Json.stringify(json)))
        .intersperse(ByteString("["), ByteString(","), ByteString("]"))
        .watchTermination() { (mt, d) =>
          d.onComplete {
            case Success(done) => AppLogger.debug(s"$done")
            case Failure(exception) =>
              AppLogger.error("Error processing stream", exception)
          }
          mt
        }

      FastFuture.successful(Created.sendEntity(HttpEntity.Streamed(source, None, Some("application/json"))))
    }
    }
  }

  def extendApiKey(apiId: String, apiKeyId: String) = DaikokuAction.async(parse.json) { ctx =>
    _createOrExtendApiKey(apiId, ctx, Some(ApiSubscriptionId(apiKeyId)))
  }

  def askForApiKey(apiId: String) = DaikokuAction.async(parse.json) { ctx =>
    _createOrExtendApiKey(apiId, ctx)
  }

  def _createOrExtendApiKey(apiId: String, ctx: DaikokuActionContext[JsValue], parentSubscriptionId: Option[ApiSubscriptionId] = None)= {
    import cats.implicits._

    implicit val c = ctx;
    PublicUserAccess(AuditTrailEvent(s"@{user.name} has asked for an apikey for @{api.name} - @{api.id}"))(ctx) {
      val teams: Seq[String] = (ctx.request.body \ "teams").as[Seq[String]]
      val planId: String = (ctx.request.body \ "plan").as[String]

      val results: EitherT[Future, Result, Result] = for {
        api <- EitherT.fromOptionF(env.dataStore.apiRepo.forTenant(ctx.tenant.id).findByIdNotDeleted(apiId),
          NotFound(Json.obj("error" -> "api not found")))
        plan <- EitherT.fromOption[Future](api.possibleUsagePlans.find(pp => pp.id.value == planId),
          NotFound(Json.obj("error" -> "plan not found")))
        unpublishedError: EitherT[Future, Result, Result] = EitherT.leftT[Future, Result](Forbidden(Json.obj("error" -> "You're not authorized to subscribed to an unpublished api")))
        adminError: EitherT[Future, Result, Result] = EitherT.leftT[Future, Result](Forbidden(Json.obj("error" -> "You're not authorized to subscribed to an admin api")))
        value: EitherT[Future, Result, Result] = EitherT
          .liftF(
            Future
              .sequence(
                teams
                  .map(
                    teamId =>
                      env.dataStore.teamRepo
                        .forTenant(ctx.tenant.id)
                        .findByIdNotDeleted(teamId)
                        .flatMap {
                          case Some(team) if !ctx.user.isDaikokuAdmin && !team.includeUser(ctx.user.id) =>
                            Future.successful(
                              Json.obj("error" -> s"You're not authorized on the team ${team.name}")
                            )
                          case Some(team) if plan.visibility == Private && team.id != api.team =>
                            Future.successful(
                              Json.obj("error" -> s"${team.name} is not authorized on this plan")
                            )
                          case Some(team) if ctx.tenant.subscriptionSecurity.forall(t => t) && team.`type` == TeamType.Personal =>
                            Future.successful(
                              Json.obj("error" -> s"${team.name} is not authorized to subscribe to an api")
                            )
                          case Some(team) =>
                            env.dataStore.apiSubscriptionRepo
                              .forTenant(ctx.tenant)
                              .findOneNotDeleted(
                                Json.obj("team" -> team.id.asJson,
                                  "api" -> api.id.asJson,
                                  "plan" -> plan.id.asJson)
                              )
                              .flatMap {
                                case Some(_) if !plan.allowMultipleKeys.getOrElse(false) =>
                                  Future.successful(AppError.toJson(SubscriptionConflict))
                                case _ =>
                                  def process() = applyProcessForApiSubscription(ctx.tenant,
                                      ctx.user,
                                      api,
                                      plan.id.value,
                                      team,
                                      parentSubscriptionId).leftMap(AppError.toJson).merge

                                  parentSubscriptionId match {
                                    case Some(apiKey) => env.dataStore.apiSubscriptionRepo
                                      .forTenant(ctx.tenant)
                                      .findByIdNotDeleted(apiKey.value)
                                      .flatMap {
                                        case Some(sub) if sub.parent.isDefined =>
                                          FastFuture.successful(AppError.toJson(SubscriptionParentExisted))
                                        case Some(_) if (plan.aggregationApiKeysSecurity.isEmpty || plan.aggregationApiKeysSecurity.exists(a => !a)) =>
                                          FastFuture.successful(AppError.toJson(SubscriptionAggregationDisabled))
                                        case Some(_) => process()
                                        case None => FastFuture.successful(AppError.toJson(SubscriptionNotFound))
                                      }
                                    case _ => process()
                                  }
                              }
                          case None => Future.successful(Json.obj(teamId -> "team not found"))
                        }
                  )
              )
              .map(objs => Ok(JsArray(objs)))
          )
        result <- if (!api.published) unpublishedError
        else if (api.visibility == ApiVisibility.AdminOnly && !ctx.user.isDaikokuAdmin) adminError
        else value
      } yield result

      results.value
        .map(_.merge)
    }
  }

  def applyProcessForApiSubscription(tenant: Tenant,
                                     user: User,
                                     api: Api,
                                     planId: String,
                                     team: Team,
                                     apiKeyId: Option[ApiSubscriptionId])(implicit ctx: DaikokuActionContext[JsValue]): EitherT[Future, AppError, JsObject] = {
    import cats.implicits._

    api.possibleUsagePlans.find(_.id.value == planId) match {
      case None => EitherT.leftT[Future, JsObject](PlanNotFound)
      case Some(_)
        if api.visibility != ApiVisibility.Public && !api.authorizedTeams.contains(team.id) && !user.isDaikokuAdmin => EitherT.leftT[Future, JsObject](ApiUnauthorized)
      case Some(_) if api.visibility == ApiVisibility.AdminOnly && !user.isDaikokuAdmin => EitherT.leftT[Future, JsObject](ApiUnauthorized)
      case Some(plan) if plan.visibility == UsagePlanVisibility.Private && api.team != team.id => EitherT.leftT[Future, JsObject](PlanUnauthorized)
      case Some(plan) => plan.subscriptionProcess match {
        case SubscriptionProcess.Manual => EitherT(notifyApiSubscription(tenant, user, api, planId, team, apiKeyId))
        case SubscriptionProcess.Automatic => EitherT(apiService.subscribeToApi(tenant, user, api, planId, team, apiKeyId))
      }
    }
  }

  def notifyApiSubscription(tenant: Tenant,
                            user: User,
                            api: Api,
                            planId: String,
                            team: Team,
                            apiKeyId: Option[ApiSubscriptionId])(implicit ctx: DaikokuActionContext[JsValue]): Future[Either[AppError, JsObject]] = {
    import cats.implicits._

    val defaultPlanOpt = api.possibleUsagePlans.find(p => p.id == api.defaultUsagePlan)
    val askedUsagePlan = api.possibleUsagePlans.find(p => p.id.value == planId)
    val plan: UsagePlan = askedUsagePlan.orElse(defaultPlanOpt).getOrElse(api.possibleUsagePlans.head)

    val notification = Notification(
      id = NotificationId(BSONObjectID.generate().stringify),
      tenant = tenant.id,
      team = Some(api.team),
      sender = user,
      action = NotificationAction.ApiSubscriptionDemand(api.id, plan.id, team.id, apiKeyId)
    )

    val tenantLanguage: String = tenant.defaultLanguage.getOrElse("en")
    val notificationUrl = getDaikokuUrl(tenant, "/notifications")
    for {
      _ <- env.dataStore.notificationRepo.forTenant(tenant.id).save(notification)
      maybeApiTeam <- env.dataStore.teamRepo.forTenant(tenant.id).findByIdNotDeleted(api.team)
      maybeAdmins <- maybeApiTeam.traverse(
        apiTeam =>
          env.dataStore.userRepo
            .find(
              Json.obj(
                "_deleted" -> false,
                "_id" -> Json.obj("$in" -> JsArray(apiTeam.admins().map(_.asJson).toSeq))
              )
            )
      )
      _ <- maybeAdmins.traverse(
        admins => Future.sequence(admins.map(admin => {
          implicit val language: String = admin.defaultLanguage.getOrElse(tenantLanguage)
          (for {
            title <- translator.translate("mail.apikey.demand.title", tenant)
            body <- translator.translate("mail.apikey.demand.body", tenant, Map(
              "user" -> user.name,
              "apiName" -> api.name,
              "link" -> notificationUrl))
          } yield {
            tenant.mailer.send(title, Seq(admin.email), body, tenant)
          }).flatten
        }))
      )
    } yield {
      Right(Json.obj("creation" -> "waiting", "subscription" -> Json.obj("team" -> team.id.asJson, "plan" -> planId)))
    }

  }

  def getMyTeamsApiSubscriptions(apiId: String, version: String) = DaikokuActionMaybeWithGuest.async { ctx =>
    UberPublicUserAccess(AuditTrailEvent(s"@{user.name} has accessed subscriptions for @{api.name} - @{api.id}"))(ctx) {

      def findSubscriptions(api: Api, teams: Seq[Team]): Future[Result] = {
        for {
          subscriptions <- env.dataStore.apiSubscriptionRepo
            .forTenant(ctx.tenant.id)
            .findNotDeleted(
              Json.obj("api" -> api.id.value,
                "team" -> Json.obj("$in" -> JsArray(teams.map(_.id.asJson))))
            )
          pendingRequests <- env.dataStore.notificationRepo
            .forTenant(ctx.tenant.id)
            .findNotDeleted(
              Json.obj(
                "action.type" -> "ApiSubscription",
                "status.status" -> "Pending",
                "action.api" -> api.id.value,
                "action.team" -> Json.obj("$in" -> JsArray(teams.map(_.id.asJson)))
              )
            )
        } yield {
          Ok(
            Json.obj(
              "subscriptions" -> JsArray(
                subscriptions
                  .map(subscription => {
                    val apiKeyVisible = teams
                      .find(_.id == subscription.team)
                      .exists(authorizations.isTeamApiKeyVisible(_, ctx.user))

                    if (apiKeyVisible) {
                      subscription.asJson
                    } else {
                      subscription.asJson.as[JsObject] - "apiKey"
                    }
                  })
              ),
              "requests" -> JsArray(pendingRequests.map(_.asJson))
            )
          )
        }
      }

      env.dataStore.teamRepo
        .myTeams(ctx.tenant, ctx.user)
        .flatMap(
          myTeams => {
            env.dataStore.apiRepo
              .findByVersion(ctx.tenant, apiId, version)
              .flatMap {
                case None => FastFuture.successful(NotFound(Json.obj("error" -> "Api not found")))
                case Some(api)
                  if api.visibility == ApiVisibility.Public || api.authorizedTeams.intersect(myTeams.map(_.id)).nonEmpty || myTeams.exists(t => t.id == api.team) =>
                  findSubscriptions(api, myTeams)
                case _ => FastFuture.successful(Unauthorized(Json.obj("error" -> "You're not authorized on this api", "status" -> 401)))
              }
          }
        )
    }
  }

  def updateApiSubscriptionCustomName(teamId: String, subscriptionId: String) = DaikokuAction.async(parse.json) { ctx =>
    TeamApiKeyAction(AuditTrailEvent(s"@{user.name} has update custom name for subscription @{subscription._id}"))(teamId,
      ctx) {
      _ =>
        val customName = (ctx.request.body.as[JsObject] \ "customName").as[String].trim
        env.dataStore.apiSubscriptionRepo
          .forTenant(ctx.tenant)
          .findOneNotDeleted(Json.obj("_id" -> subscriptionId, "team" -> teamId))
          .flatMap {
            case None => FastFuture.successful(NotFound(Json.obj("error" -> "apiSubscription not found")))
            case Some(subscription) =>
              env.dataStore.apiSubscriptionRepo
                .forTenant(ctx.tenant)
                .save(subscription.copy(customName = Some(customName)))
                .map(done => Ok(Json.obj("done" -> done)))
          }
    }
  }

  def updateApiSubscription(teamId: String, subscriptionId: String) = DaikokuAction.async(parse.json) { ctx =>
    TeamAdminOnly(AuditTrailEvent(s"@{user.name} has updated subscription for @{subscription.id}"))(teamId, ctx) { team =>
      env.dataStore.apiSubscriptionRepo.forTenant(ctx.tenant).findByIdNotDeleted(subscriptionId).flatMap {
        case None => FastFuture.successful(NotFound(Json.obj("error" -> "Subscription not found")))
        case Some(sub) => env.dataStore.apiRepo.forTenant(ctx.tenant).findByIdNotDeleted(sub.api).flatMap {
          case None => FastFuture.successful(NotFound(Json.obj("error" -> "Api not found")))
          case Some(api) if api.team != team.id => FastFuture.successful(Forbidden(Json.obj("error" -> "Subscription api is not your")))
          case Some(api) =>
            val body = ctx.request.body.as[JsObject]
            val subToSave = sub.copy(
              customMetadata = (body \ "customMetadata").asOpt[JsObject],
              customMaxPerSecond = (body \ "customMaxPerSecond").asOpt[Long],
              customMaxPerDay = (body \ "customMaxPerDay").asOpt[Long],
              customMaxPerMonth = (body \ "customMaxPerMonth").asOpt[Long],
              customReadOnly = (body \ "customReadOnly").asOpt[Boolean]
            )
            apiService.updateSubscription(ctx.tenant, subToSave, api)
              .map {
                case Left(err) => AppError.render(err)
                case Right(sub) => Ok(sub)
              }
        }
      }
    }
  }

  def getApiSubscriptionsForTeam(apiId: String, teamId: String, version: String) = DaikokuAction.async { ctx =>
    TeamApiKeyAction(AuditTrailEvent(s"@{user.name} has accessed subscriptions for @{api.name} - @{api.id}"))(teamId, ctx) {
      team =>
        val teamPermission = team.users
          .find(u => u.userId == ctx.user.id)
          .map(_.teamPermission)
          .getOrElse(TeamPermission.TeamUser)

        val repo = env.dataStore.apiSubscriptionRepo
          .forTenant(ctx.tenant.id)

        def subscriptionToJson(api: Api, sub: ApiSubscription, parentSub: Option[ApiSubscription]): Future[JsValue] = {
          val planIntegrationProcess = api.possibleUsagePlans
            .find(p => p.id == sub.plan)
            .map(_.integrationProcess)
            .getOrElse(IntegrationProcess.Automatic)

          val r = sub.asAuthorizedJson(teamPermission, planIntegrationProcess, ctx.user.isDaikokuAdmin).as[JsObject] ++
            api.possibleUsagePlans
              .find(p => p.id == sub.plan)
              .map { plan => Json.obj("planType" -> plan.typeName) }
              .getOrElse(Json.obj("planType" -> "")) ++
            Json.obj("apiName" -> api.name) ++
            Json.obj("_humanReadableId" -> api.humanReadableId) ++
            Json.obj("parentUp" -> false)


          sub.parent match {
            case None => FastFuture.successful(r)
            case Some(parentId) =>
              parentSub match {
                case Some(parent) => FastFuture.successful(r ++ Json.obj("parentUp" -> parent.enabled))
                case None => env.dataStore.apiSubscriptionRepo.forTenant(ctx.tenant.id)
                  .findById(parentId.value)
                  .map {
                    case None => r
                    case Some(p) => r ++ Json.obj("parentUp" -> p.enabled)
                  }
              }

          }
        }

        def findSubscriptions(api: Api, team: Team): Future[Result] = {
          repo
            .findNotDeleted(Json.obj("api" -> api.id.value, "team" -> team.id.value))
            .flatMap { subscriptions =>
              repo
                .find(Json.obj(
                  "parent" -> Json.obj("$in" -> subscriptions.map(s => s.id.value))
                ))
                .flatMap { subs =>
                  Future.sequence((subscriptions ++ subs)
                    .filter(s => team.subscriptions.contains(s.id))
                    .map(sub => {
                      (sub.parent match {
                        case Some(_) => env.dataStore.apiRepo.forTenant(ctx.tenant.id).findById(sub.api.value)
                        case None => FastFuture.successful(Some(api))
                      })
                        .flatMap {
                          case Some(api) => subscriptionToJson(api, sub,
                            sub.parent.flatMap(p => subscriptions.find(s => s.id == p)))
                          case None => FastFuture.successful(Json.obj())
                        }
                    }))
                    .map(values => Ok(JsArray(values)))
                }
            }
        }

        env.dataStore.apiRepo.findByVersion(ctx.tenant, apiId, version).flatMap {
          case None => FastFuture.successful(NotFound(Json.obj("error" -> "Api not found")))
          case Some(api) if ctx.user.isDaikokuAdmin || api.visibility == ApiVisibility.Public => findSubscriptions(api, team)
          case Some(api) if api.team == team.id => findSubscriptions(api, team)
          case Some(api) if api.visibility != ApiVisibility.Public && api.authorizedTeams.contains(team.id) =>
            findSubscriptions(api, team)
          case _ => FastFuture.successful(Unauthorized(Json.obj("error" -> "You're not authorized on this api", "status" -> 403)))
        }
    }
  }

  def getSubscriptionsOfTeam(teamId: String) = DaikokuAction.async { ctx =>
    TeamApiKeyAction(AuditTrailEvent(s"@{user.name} has accessed subscriptions of team : - $teamId"))(teamId, ctx) {
      team =>
        def findSubscriptions(api: Api, team: Team) =
          env.dataStore.apiSubscriptionRepo
            .forTenant(ctx.tenant.id)
            .findNotDeleted(Json.obj("api" -> api.id.value, "team" -> team.id.value))
            .flatMap { subscriptions =>
              val teamPermission = team.users
                .find(u => u.userId == ctx.user.id)
                .map(_.teamPermission).getOrElse(TeamPermission.TeamUser)

              env.dataStore.apiSubscriptionRepo
                .forTenant(ctx.tenant.id)
                .find(Json.obj(
                    "parent" -> Json.obj("$in" -> subscriptions.map(s => s.id.value))
                ))
                .flatMap { subs =>
                  FastFuture.successful(
                    (subscriptions ++ subs)
                      .filter(s => team.subscriptions.contains(s.id) && s.parent.isEmpty)
                      .map(sub => {
                        val planIntegrationProcess = api.possibleUsagePlans
                          .find(p => p.id == sub.plan)
                          .map(_.integrationProcess)
                          .getOrElse(IntegrationProcess.Automatic)

                        sub.asAuthorizedJson(teamPermission, planIntegrationProcess, ctx.user.isDaikokuAdmin).as[JsObject] ++
                          api.possibleUsagePlans
                            .find(p => p.id == sub.plan)
                            .map { plan => Json.obj("planType" -> plan.typeName) }
                            .getOrElse(Json.obj("planType" -> "")) ++
                          Json.obj("apiName" -> api.name)
                      })
                  )
                }
            }

        env.dataStore.apiRepo
          .forTenant(ctx.tenant.id)
          .findAll()
          .flatMap { apis =>
            Future.sequence(apis.map { api =>
              env.dataStore.apiRepo.forTenant(ctx.tenant.id).findByIdOrHrId(api.id.value).flatMap {
                case Some(api) if api.visibility == ApiVisibility.Public => findSubscriptions(api, team)
                case Some(api) if api.team == team.id => findSubscriptions(api, team)
                case Some(api) if api.visibility != ApiVisibility.Public && api.authorizedTeams.contains(team.id) =>
                  findSubscriptions(api, team)
              case _ => FastFuture.successful(Seq.empty)
              }
            })
          }
          .map(_.flatten)
          .map(subs => Ok(JsArray(subs)))
    }
  }

  def getSubscriptionInformations(teamId: String, subscriptionId: String) = DaikokuAction.async { ctx =>
    TeamAdminOnly(AuditTrailEvent(s"@{user.name} has accessed to plan informations for subscription @{subscriptionId}"))(teamId,
      ctx) {
      team =>
        ctx.setCtxValue("subscriptionId", subscriptionId)

        env.dataStore.apiSubscriptionRepo
          .forTenant(ctx.tenant.id)
          .findById(subscriptionId)
          .flatMap {
            case None => FastFuture.successful(NotFound(Json.obj("error" -> "Subscription not found")))
            case Some(subscription) if subscription.team != team.id => FastFuture.successful(Unauthorized(Json.obj("error" -> "You're not authorized on this subscription")))
            case Some(subscription) =>
              env.dataStore.apiRepo
                .forTenant(ctx.tenant.id)
                .findById(subscription.api)
                .map {
                  case None => NotFound(Json.obj("error" -> "Subscription not found"))
                  case Some(api) =>
                    api.possibleUsagePlans.find(pp => pp.id == subscription.plan) match {
                      case None => NotFound(Json.obj("error" -> "plan not found"))
                      case Some(plan) =>
                        Ok(Json.obj("api" -> api.asSimpleJson, "subscription" -> subscription.asSimpleJson, "plan" -> plan.asJson))
                    }
                }
          }
    }
  }

  def toggleApiSubscription(teamId: String, subscriptionId: String, enabled: Option[Boolean]) = DaikokuAction.async { ctx =>
    TeamApiKeyAction(
      AuditTrailEvent(s"@{user.name} has archived api subscription @{subscription.id} of @{team.name} - @{team.id}")
    )(teamId, ctx) { team =>
      apiSubscriptionAction(ctx.tenant, team, subscriptionId, (api: Api, plan: UsagePlan, subscription: ApiSubscription) => {
        ctx.setCtxValue("subscription", subscription)
        toggleSubscription(plan, subscription, ctx.tenant, enabled.getOrElse(false))
      })
    }
  }

  def makeUniqueSubscription(teamId: String, subscriptionId: String) = DaikokuAction.async { ctx =>
    TeamApiKeyAction(
      AuditTrailEvent(s"@{user.name} has made unique aggregate api subscription @{subscription.id} of @{team.name} - @{team.id}")
    )(teamId, ctx) { team =>
      apiSubscriptionAction(ctx.tenant, team, subscriptionId, (api: Api, plan: UsagePlan, subscription: ApiSubscription) => {
        /*if (subscription.parent.isEmpty)
            FastFuture.successful(Left(MissingParentSubscription))
        else*/
          plan.otoroshiTarget.map(_.otoroshiSettings).flatMap { id =>
            ctx.tenant.otoroshiSettings.find(_.id == id)
          } match {
            case None => FastFuture.successful(Left(OtoroshiSettingsNotFound))
            case Some(otoroshiSettings) =>
              implicit val o = otoroshiSettings
              import cats.implicits._

              (for {
                apiKey        <- EitherT(otoroshiClient.getApikey(subscription.apiKey.clientId)(o))
                _             <- EitherT(toggleSubscription(plan, subscription, ctx.tenant, enabled = false))
                createdApiKey <- EitherT(otoroshiClient.createApiKey(apiKey.copy(
                  clientId = IdGenerator.token(32),
                  clientSecret = IdGenerator.token(64),
                  clientName = s"daikoku-api-key-${api.humanReadableId}-${
                    plan.customName
                      .getOrElse(plan.typeName)
                      .urlPathSegmentSanitized
                  }-${team.humanReadableId}-${System.currentTimeMillis()}"))(o))
                _             <- EitherT.right[AppError](env.dataStore.apiSubscriptionRepo.forTenant(ctx.tenant.id)
                  .save(subscription.copy(
                    parent = None,
                    apiKey = subscription.apiKey.copy(
                      clientId = createdApiKey.clientId,
                      clientSecret = createdApiKey.clientSecret,
                      clientName = createdApiKey.clientName)
                  )))
              } yield {
                Json.obj("created" -> true)
              }).value
          }
      })
    }
  }

  def toggleApiSubscriptionByApiOwner(teamId: String, subscriptionId: String, enabled: Option[Boolean]) = DaikokuAction.async { ctx =>
    TeamApiEditorOnly(
      AuditTrailEvent(s"@{user.name} has archived api subscription @{subscription.id} of @{team.name} - @{team.id}")
    )(teamId, ctx) { team =>
      import cats.implicits._

      env.dataStore.apiSubscriptionRepo.forTenant(ctx.tenant).findByIdOrHrIdNotDeleted(subscriptionId).flatMap {
        case Some(sub) => env.dataStore.apiRepo.forTenant(ctx.tenant).findByIdNotDeleted(sub.api).flatMap {
          case Some(api) if api.team != team.id => FastFuture.successful(Forbidden(Json.obj("error" -> "You'r not authorized to access to this subscription")))
          case Some(api) => EitherT(toggleSubscription(api.possibleUsagePlans.find(p => p.id == sub.plan).get, sub, ctx.tenant, enabled.getOrElse(false)))
            .leftMap(appError => AppError.render(appError))
            .map(r => Ok(r))
            .merge

          case None => FastFuture.successful(NotFound(Json.obj("error" -> "Subscribed AIP not found")))
        }
        case None => FastFuture.successful(NotFound(Json.obj("error" -> "ApiSubscription not found")))
      }
    }
  }

  def toggleApiKeyRotation(teamId: String, subscriptionId: String) = DaikokuAction.async(parse.json) { ctx =>
    TeamApiKeyAction(
      AuditTrailEvent(s"@{user.name} has toggle api subscription rotation @{subscription.id} of @{team.name} - @{team.id}")
    )(teamId, ctx) { team =>
      apiSubscriptionAction(ctx.tenant, team, subscriptionId, (api: Api, plan: UsagePlan, subscription: ApiSubscription) => {
        ctx.setCtxValue("subscription", subscription)
        apiService.toggleApiKeyRotation(ctx.tenant, subscription, plan, api, team, (ctx.request.body.as[JsObject] \ "rotationEvery").as[Long], (ctx.request.body.as[JsObject] \ "gracePeriod").as[Long])
      })
    }
  }

  def regenerateApiKeySecret(teamId: String, subscriptionId: String) = DaikokuAction.async { ctx =>
    TeamApiKeyAction(
      AuditTrailEvent(s"@{user.name} has regenerate apikey secret @{subscription.id} of @{team.name} - @{team.id}")
    )(teamId, ctx) { team =>
      apiSubscriptionAction(ctx.tenant, team, subscriptionId, (api: Api, plan: UsagePlan, subscription: ApiSubscription) => {
        ctx.setCtxValue("subscription", subscription)
        apiService.regenerateApiKeySecret(ctx.tenant, subscription, plan, api, team, ctx.user)
      })
    }
  }

  def deleteApiSubscription(teamId: String, subscriptionId: String) = DaikokuAction.async { ctx =>

    TeamAdminOnly(
      AuditTrailEvent(s"@{user.name} has deleted api subscription @{subscription.id} of @{team.name} - @{team.id}")
    )(teamId, ctx) { team =>
      apiSubscriptionAction(ctx.tenant, team, subscriptionId, (api: Api, plan: UsagePlan, subscription: ApiSubscription) => {
        ctx.setCtxValue("subscription", subscription)

        for {
          _ <- apiKeyStatsJob.syncForSubscription(subscription, ctx.tenant)
          delete <- apiService.deleteApiKey(ctx.tenant, subscription, plan, api, team)
            .flatMap(delete => {
              if (plan.visibility == Private) {
                env.dataStore.apiRepo.forTenant(ctx.tenant)
                  .save(api.copy(possibleUsagePlans = api.possibleUsagePlans.diff(Seq(plan)) :+ plan.removeAuthorizedTeam(team.id)))
                  .map(_ => delete)
              } else {
                FastFuture.successful(delete)
              }
            })
        } yield delete
      })
    }
  }

  private def apiSubscriptionAction(tenant: Tenant, team: Team, subscriptionId: String, action: (Api, UsagePlan, ApiSubscription) => Future[Either[AppError, JsObject]]) = {
    import cats.implicits._

    env.dataStore.apiSubscriptionRepo
      .forTenant(tenant)
      .findByIdNotDeleted(subscriptionId)
      .flatMap {
        case Some(subscription) =>
          env.dataStore.apiRepo
            .forTenant(tenant)
            .findByIdNotDeleted(subscription.api)
            .flatMap {
              case Some(api) if api.team != team.id && subscription.team != team.id => FastFuture.successful(Unauthorized(Json.obj("error" -> "You're not authorized on this subscription")))
              case Some(api) =>
                val r: EitherT[Future, Result, Result] = for {
                  plan <- EitherT.fromOption[Future](api.possibleUsagePlans.find(_.id == subscription.plan),
                    NotFound(Json.obj("error" -> "plan not found")))
                  result <- EitherT(action(api, plan, subscription))
                    .leftMap(appError => AppError.render(appError))
                } yield Ok(result)
                r.merge
              case None => FastFuture.successful(NotFound(Json.obj("error" -> "Api not found")))
            }
        case None => FastFuture.successful(NotFound(Json.obj("error" -> "ApiSubscription not found")))
      }
  }

  def toggleSubscription(plan: UsagePlan,
                         subscription: ApiSubscription,
                         tenant: Tenant,
                         enabled: Boolean): Future[Either[AppError, JsObject]] = {
    for {
      _ <- apiKeyStatsJob.syncForSubscription(subscription, tenant)
      delete <- apiService.archiveApiKey(tenant, subscription, plan, enabled)
    } yield delete
  }

  def cleanArchivedSubscriptions(teamId: String) = DaikokuAction.async { ctx =>
    TeamAdminOnly(AuditTrailEvent(s"@{user.name} has cleaned api subscription of @{team.name} - @{team.id}"))(teamId, ctx) { team =>
      for {
        subRepo <- env.dataStore.apiSubscriptionRepo.forTenantF(ctx.tenant)
        archivedSubs <- subRepo.findNotDeleted(Json.obj("team" -> team.id.asJson, "enabled" -> false))
        _ <- env.dataStore.apiSubscriptionRepo.forTenant(ctx.tenant).deleteLogically(Json.obj("team" -> team.id.asJson, "enabled" -> false))
        done <- env.dataStore.teamRepo.forTenant(ctx.tenant).save(team.copy(subscriptions = team.subscriptions.diff(archivedSubs.map(_.id))))
      } yield {
        Ok(Json.obj("done" -> done, "apiSubscriptions" -> JsArray(archivedSubs.map(_.id.asJson))))
      }
    }
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  def apiOfTeam(teamId: String, apiId: String, version: String) = DaikokuAction.async { ctx =>
    TeamMemberOnly(
      AuditTrailEvent(s"@{user.name} has accessed one api @{api.name} - @{api.id} of @{team.name} - @{team.id}")
    )(teamId, ctx) { team =>
      var query = Json.obj(
        "team" -> team.id.value,
        "$or" -> Json.arr(
          Json.obj("_id" -> apiId),
          Json.obj("_humanReadableId" -> apiId),
        ),
        "currentVersion" -> version
      )

      env.dataStore.apiRepo
        .forTenant(ctx.tenant.id)
        .findOneNotDeleted(query)
        .flatMap {
          case Some(api) =>
            ctx.setCtxValue("api.id", api.id)
            ctx.setCtxValue("api.name", api.name)

            env.dataStore.translationRepo.forTenant(ctx.tenant)
              .find(Json.obj("element.id" -> api.id.asJson))
              .map(translations => {
                val translationAsJsObject = translations
                  .groupBy(t => t.language)
                  .map {
                    case (k, v) => Json.obj(k -> JsObject(v.map(t => t.key -> JsString(t.value))))
                  }.fold(Json.obj())(_ deepMerge _)
                val translation = Json.obj("translation" -> translationAsJsObject)
                Ok(api.asJson.as[JsObject] ++ translation)
              })
          case None => FastFuture.successful(NotFound(Json.obj("error" -> "Api not found")))
        }
    }
  }

  def apisOfTeam(teamId: String) = DaikokuAction.async { ctx =>
    TeamMemberOnly(AuditTrailEvent(s"@{user.name} has accessed apis of team @{team.name} - @{team.id}"))(teamId, ctx) {
      team =>
        env.dataStore.apiRepo
          .forTenant(ctx.tenant.id)
          .findNotDeleted(
            Json.obj(
              "team" -> team.id.value
            )
          )
          .map { apis =>
            Ok(JsArray(apis.map(_.asJson)))
          }
    }
  }

  def verifyNameUniqueness() = DaikokuAction.async(parse.json) { ctx =>
    PublicUserAccess(
      AuditTrailEvent(s"@{user.name} is checking if api name (@{api.name}) is unique")
    )(ctx) {
      import fr.maif.otoroshi.daikoku.utils.StringImplicits._

      val name = (ctx.request.body.as[JsObject] \ "name").as[String].toLowerCase.trim
      val id = (ctx.request.body.as[JsObject] \ "id").asOpt[String].map(_.trim)
      ctx.setCtxValue("api.name", name)

      val maybeHumanReadableId = name.urlPathSegmentSanitized

      val apiRepo = env.dataStore.apiRepo.forTenant(ctx.tenant.id)

      id match {
        case Some(value) =>
          apiRepo.findByIdNotDeleted(value)
            .flatMap {
              case None => FastFuture.successful(Ok(Json.obj("exists" -> false)))
              case Some(api) =>
                val v = api.parent match {
                  case Some(parent) => parent.value
                  case None => value
                }
                apiRepo
                  .exists(Json.obj("parent" -> JsNull, "_humanReadableId" -> maybeHumanReadableId, "_id" -> Json.obj("$ne" -> v)))
                  .map(exists => Ok(Json.obj("exists" -> exists)))
            }
        case None => apiRepo
          .exists(Json.obj("parent" -> JsNull, "_humanReadableId" -> maybeHumanReadableId))
          .map(exists => Ok(Json.obj("exists" -> exists)))
      }
    }
  }

  def getAllApiDocumentation(teamId: String, apiId: String, version: String) = DaikokuAction.async { ctx =>
    TeamApiEditorOnly(AuditTrailEvent(s"@{user.name} has requested all pages of @{api.name} - @{team.id}"))(teamId, ctx) {
      team => {
        env.dataStore.apiRepo.forTenant(ctx.tenant.id)
          .find(Json.obj("_humanReadableId" -> apiId, "currentVersion" -> Json.obj("$ne" -> version)))
          .flatMap(apis => Future.sequence(
            apis.map { api =>
              env.dataStore.apiDocumentationPageRepo
                .forTenant(ctx.tenant.id)
                .find(Json.obj("_id" -> Json.obj("$in" -> JsArray(api.documentation.pages.map(_.asJson)))))
                .map { pages => Json.obj(
                  "currentVersion" -> api.currentVersion.value,
                  "apiId" -> api.id.asJson,
                  "pages" -> pages.map(page => Json.obj(
                    "_id" -> page.id.asJson,
                    "title" -> JsString(page.title)
                  ))
                )}
            })
          )
        .map(v => Ok(JsArray(v)))
      }
    }
  }

  def cloneDocumentation(teamId: String, apiId: String, version: String) = DaikokuAction.async(parse.json) { ctx =>
    TeamApiEditorOnly(AuditTrailEvent(s"@{user.name} has imported pages from $version in @{api.name} @{team.id}"))(teamId, ctx) {
      team => {
        val pages = (ctx.request.body \ "pages").as[Seq[JsObject]]

        (for {
          fromPages <- env.dataStore.apiDocumentationPageRepo.forTenant(ctx.tenant.id)
            .find(Json.obj(
              "_id" -> Json.obj("$in" -> JsArray(pages.map(page => (page \ "pageId").as[JsString])))
            ))
          createdPages <- Future.sequence(
            fromPages.map(page => {
              val generatedId = BSONObjectID.generate().stringify
              env.dataStore.apiDocumentationPageRepo.forTenant(ctx.tenant.id)
                .save(page.copy(id = ApiDocumentationPageId(generatedId)))
                .flatMap(_ => FastFuture.successful(ApiDocumentationPageId(generatedId)))
            }))
          api <- env.dataStore.apiRepo.findByVersion(ctx.tenant, apiId, version)
        } yield {
          api match {
            case None => FastFuture.successful(AppError.render(ApiNotFound))
            case Some(api) => env.dataStore.apiRepo.forTenant(ctx.tenant.id).save(
              api.copy(documentation = api.documentation.copy(pages = api.documentation.pages ++ createdPages))
            ).map { _ =>
              Ok(Json.obj("cloned" -> true))
            }
          }
        }).flatten
      }
    }
  }

  def askForApiAccess(apiId: String) = DaikokuAction.async(parse.json) { ctx =>
    val teamIds: Seq[String] = (ctx.request.body \ "teams").as[Seq[String]]

    PublicUserAccess(AuditTrailEvent(s"@{user.name} has asked access to api @{api.name} - @{api.id}"))(ctx) {

      env.dataStore.apiRepo
        .forTenant(ctx.tenant.id)
        .findByIdNotDeleted(apiId)
        .flatMap {
          case Some(api) =>
            Future
              .sequence(
                teamIds.map(
                  teamId =>
                    env.dataStore.teamRepo.forTenant(ctx.tenant.id).findByIdNotDeleted(teamId).flatMap {
                      case Some(team) => askOwnerForApiAccess(api, team, ctx)
                      case None => FastFuture.successful(Json.obj(teamId -> "Team not found"))
                    }
                )
              )
              .map(jsResults => Right(Ok(Json.arr(jsResults))))
          case None => FastFuture.successful(Left(NotFound(Json.obj("error" -> "Api not found"))))
        }
        .map(_.merge)
    }
  }

  def askOwnerForApiAccess(api: Api, team: Team, ctx: DaikokuActionContext[JsValue]): Future[JsObject] = {
    import cats.implicits._

    val notification = Notification(
      id = NotificationId(BSONObjectID.generate().stringify),
      tenant = ctx.tenant.id,
      team = Some(api.team),
      sender = ctx.user,
      action = NotificationAction.ApiAccess(api.id, team.id)
    )

    val tenantLanguage: String = ctx.tenant.defaultLanguage.getOrElse("en")

    for {
      notificationRepo <- env.dataStore.notificationRepo.forTenantF(ctx.tenant.id)
      saved <- notificationRepo.save(notification)
      maybeOwnerteam <- env.dataStore.teamRepo.forTenant(ctx.tenant.id).findByIdNotDeleted(api.team)
      maybeAdmins <- maybeOwnerteam.traverse { ownerTeam =>
        env.dataStore.userRepo
          .find(
            Json
              .obj(
                "_deleted" -> false,
                "_id" -> Json.obj("$in" -> JsArray(ownerTeam.admins().map(_.asJson).toSeq))
              )
          )
      }
      _ <- maybeAdmins.traverse { admins =>
        Future.sequence(
          admins.map { admin =>
            implicit val language: String = admin.defaultLanguage.getOrElse(tenantLanguage)
            (for {
              title <- translator.translate("mail.api.access.title", ctx.tenant)
              body <- translator.translate("mail.api.access.body", ctx.tenant, Map(
                "user" -> ctx.user.name,
                "apiName" -> api.name,
                "teamName" -> team.name,
                "link" -> s"${ctx.tenant.domain}/notifications"
              ))
            } yield {
              ctx.tenant.mailer.send(title, Seq(admin.email), body, ctx.tenant)
            }).flatten
          })
        }
    } yield {
      Json.obj(s"${team.id.value}" -> saved)
    }
  }

  def deleteApiOfTeam(teamId: String, apiId: String) = DaikokuAction.async { ctx =>
    implicit val mat: Materializer = env.defaultMaterializer

    TeamApiEditorOnly(
      AuditTrailEvent(s"@{user.name} has delete api @{api.name} - @{api.id} of team @{team.name} - @{team.id}")
    )(teamId, ctx) { team =>
      env.dataStore.apiRepo
        .forTenant(ctx.tenant.id)
        .findOneNotDeleted(Json.obj("_id" -> apiId, "team" -> team.id.asJson)) flatMap {
        case Some(api) if api.visibility == ApiVisibility.AdminOnly => FastFuture.successful(Forbidden(Json.obj("error" -> "You're not authorized to delete this api")))
        case Some(api) =>
          Source(api.possibleUsagePlans.toList)
            .mapAsync(1)(plan => {
              env.dataStore.apiSubscriptionRepo
                .forTenant(ctx.tenant)
                .findNotDeleted(Json.obj("api" -> api.id.asJson, "plan" -> plan.id.asJson))
                .map(subs => (plan, subs))
            })
            .via(deleteApiSubscriptionsAsFlow(tenant = ctx.tenant, api = api, user = ctx.user))
            .runWith(Sink.ignore)
            .flatMap(_ => env.dataStore.apiRepo.forTenant(ctx.tenant.id).deleteByIdLogically(apiId))
            .map(_ => Ok(Json.obj("done" -> true)))
        case None => FastFuture.successful(NotFound(Json.obj("error" -> "Api not found")))
      }
    }
  }

  def createApiOfTeam(teamId: String) = DaikokuAction.async(parse.json) { ctx =>
    val body = ctx.request.body.as[JsObject]
    val finalBody = (body \ "_id").asOpt[String] match {
      case Some(_) => body
      case None => body ++ Json.obj("_id" -> BSONObjectID.generate().stringify)
    }

    val name = (finalBody \ "name").as[String].toLowerCase.trim

    TeamApiEditorOnly(
      AuditTrailEvent(s"@{user.name} want to create an api on @{team.name} - @{team.id} (@{api.name} - @{api.id})")
    )(teamId, ctx) { team =>
      ctx.tenant.creationSecurity match {
        case Some(true) if !team.apisCreationPermission.getOrElse(false) =>
          FastFuture.successful(Forbidden(Json.obj("error" -> "Team forbidden to create api on current tenant")))
        case _ => env.dataStore.apiRepo
          .forTenant(ctx.tenant.id)
          .findAllNotDeleted()
          .map { apis =>
            val withSameName = apis.filter(api => api.name.toLowerCase.trim == name)
            withSameName.nonEmpty
          }
          .flatMap {
            case true => FastFuture.successful(Conflict("Resource with same name already exists ..."))
            case false =>
              ApiFormat.reads(finalBody) match {
                case JsError(e) =>
                  FastFuture
                    .successful(BadRequest(Json.obj("error" -> "Error while parsing payload", "msg" -> e.toString())))
                case JsSuccess(api, _) => {
                  ctx.setCtxValue("api.id", api.id)
                  ctx.setCtxValue("api.name", api.name)
                  env.dataStore.apiRepo.forTenant(ctx.tenant.id).save(api).map { _ =>
                    Created(api.asJson)
                  }
                }
              }
          }
      }
    }
  }

  def updateApiOfTeam(teamId: String, apiId: String, version: String) = DaikokuAction.async(parse.json) { ctx =>
    val finalBody = ctx.request.body
    TeamApiEditorOnly(
      AuditTrailEvent(s"@{user.name} has updated an api on @{team.name} - @{team.id} (@{api.name} - @{api.id})")
    )(teamId, ctx) { team =>
      env.dataStore.apiRepo
        .findByVersion(ctx.tenant, apiId, version) flatMap {
        case None => FastFuture.successful(NotFound(Json.obj("error" -> "Api not found")))
        case Some(oldApi) =>
          if(oldApi.team != team.id)
            FastFuture.successful(AppError.render(ApiNotFound))
          else
            ApiFormat.reads(finalBody) match {
              case JsError(e) =>
                FastFuture
                  .successful(BadRequest(Json.obj("error" -> "Error while parsing payload", "msg" -> e.toString())))
              case JsSuccess(api, _) if !ctx.tenant.aggregationApiKeysSecurity.exists(identity) &&
                api.possibleUsagePlans.exists(plan => plan.aggregationApiKeysSecurity.exists(identity)) =>
                FastFuture.successful(BadRequest(AppError.toJson(SubscriptionAggregationDisabled)))
              case JsSuccess(api, _) if oldApi.visibility == ApiVisibility.AdminOnly =>
                val oldAdminPlan = oldApi.possibleUsagePlans.head
                val planToSave = api.possibleUsagePlans.find(_.id == oldAdminPlan.id)
                ctx.setCtxValue("api.name", api.name)
                ctx.setCtxValue("api.id", api.id)
                planToSave match {
                  case None => FastFuture.successful(NotFound(Json.obj("error" -> "Api Plan not found")))
                  case Some(plan) =>
                    val apiToSave = oldApi.copy(possibleUsagePlans = Seq(plan), issuesTags = api.issuesTags)
                    for {
                      _ <- env.dataStore.apiRepo.forTenant(ctx.tenant.id).save(apiToSave)
                      _ <- updateTagsOfIssues(ctx.tenant.id, apiToSave)
                    } yield {
                      Ok(apiToSave.asJson)
                    }
                }
              case JsSuccess(api, _) =>
                val flippedPlans = api.possibleUsagePlans.filter(pp => oldApi.possibleUsagePlans.exists(oldPp => pp.id == oldPp.id && oldPp.visibility != pp.visibility))
                val untouchedPlans = api.possibleUsagePlans.diff(flippedPlans)

                val newPlans = api.possibleUsagePlans.map(_.id)
                val oldPlans = oldApi.possibleUsagePlans.map(_.id)
                val deletedPlansId = oldPlans.diff(newPlans)
                val deletedPlans = oldApi.possibleUsagePlans.filter(pp => deletedPlansId.contains(pp.id))

                env.dataStore.apiRepo.forTenant(ctx.tenant.id)
                   .exists(Json.obj(
                     "_humanReadableId" -> api.humanReadableId,
                     "currentVersion" -> api.currentVersion.asJson,
                     "_id" -> Json.obj("$ne" -> api.id.value)
                   ))
                   .flatMap {
                     case true  => FastFuture.successful(AppError.render(ApiVersionConflict))
                     case false =>
                       for {
                         plans <- changePlansVisibility(flippedPlans, api, ctx.tenant)
                         _ <- deleteApiPlansSubscriptions(deletedPlans, oldApi, ctx.tenant, ctx.user)
                         apiToSave = api.copy(possibleUsagePlans = untouchedPlans ++ plans)
                         _ <- env.dataStore.apiRepo.forTenant(ctx.tenant.id).save(apiToSave)
                         _ <- otoroshiSynchronisator.verify(Json.obj("api" -> api.id.value)) //launch synhro to maybe update customeMetadata & authorizedEntities
                         _ <- updateTagsOfIssues(ctx.tenant.id, apiToSave)
                         _ <- updateAllHumanReadableId(ctx, apiToSave, oldApi)
                         _ <- turnOffDefaultVersion(ctx, apiToSave, oldApi, apiToSave.humanReadableId, apiToSave.currentVersion.value)
                         _ <- checkIssuesVersion(ctx, apiToSave, oldApi)
                       } yield {
                         ctx.setCtxValue("api.name", api.name)
                         ctx.setCtxValue("api.id", api.id)

                         Ok(apiToSave.asJson)
                       }
                   }
            }
      }
    }
  }

  private def checkIssuesVersion(ctx: DaikokuActionContext[JsValue], apiToSave: Api, oldApi: Api) = {
    if(oldApi.currentVersion != oldApi.currentVersion) {
      env.dataStore.apiIssueRepo.forTenant(ctx.tenant.id)
        .find(Json.obj("_id" -> Json.obj("$in" -> apiToSave.issues.map(_.value))))
        .map { issues =>
          Future.sequence(issues
              .filter(issue => issue.apiVersion match {
                case None => true
                case Some(version) => version == apiToSave.currentVersion.value
              })
              .map(issue => env.dataStore.apiIssueRepo
            .forTenant(ctx.tenant.id)
            .save(issue.copy(apiVersion = Some(apiToSave.currentVersion.value)))))
        }
    } else
      FastFuture.successful(())
  }

  private def updateAllHumanReadableId(ctx: DaikokuActionContext[JsValue], apiToSave: Api, oldApi: Api) = {
    if(oldApi.name != apiToSave.name) {
      env.dataStore.apiRepo.forTenant(ctx.tenant.id)
        .find(Json.obj("_humanReadableId" -> oldApi.humanReadableId))
        .flatMap { apis =>
          Future
            .sequence(apis.map(api => env.dataStore.apiRepo.forTenant(ctx.tenant.id)
              .save(api.copy(name = apiToSave.name))))
        }
    } else
      FastFuture.successful(())
  }

  private def turnOffDefaultVersion(ctx: DaikokuActionContext[JsValue], apiToSave: Api, oldApi: Api, humanReadableId: String, version: String) = {
    if (apiToSave.isDefault && !oldApi.isDefault)
      env.dataStore.apiRepo.forTenant(ctx.tenant.id)
        .find(Json.obj("_humanReadableId" -> humanReadableId, "currentVersion" -> Json.obj("$ne" -> version)))
        .map { apis => Future.sequence(apis.map(api => env.dataStore.apiRepo.forTenant(ctx.tenant.id)
          .save(api.copy(isDefault = false))))
        }
    else
      FastFuture.successful(())
  }

  private def updateTagsOfIssues(tenantId: TenantId, api: Api) = {
    env.dataStore.apiIssueRepo.forTenant(tenantId)
      .findAll()
      .flatMap { issues =>
        Future.sequence(issues.map(issue => {
          env.dataStore.apiIssueRepo
            .forTenant(tenantId)
            .save(issue.copy(tags = issue.tags.filter(tag => api.issuesTags.exists(t => t.id == tag))))
        }))
      }
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  def createDocPage(teamId: String) = DaikokuAction.async(parse.json) { ctx =>
    TeamApiEditorOnly(
      AuditTrailEvent(s"@{user.name} has created a doc page on @{team.name} - @{team.id} (@{page.id})")
    )(
      teamId,
      ctx
    ) { team =>
      ApiDocumentationPageFormat.reads(ctx.request.body) match {
        case JsError(e) =>
          FastFuture.successful(BadRequest(Json.obj("error" -> "Error while parsing payload", "msg" -> e.toString)))
        case JsSuccess(page, _) => {
          ctx.setCtxValue("page.id", page.id)
          env.dataStore.apiDocumentationPageRepo.forTenant(ctx.tenant.id).save(page).map { _ =>
            Ok(page.asJson)
          }
        }
      }
    }
  }

  def deleteDocPage(teamId: String, pageId: String) = DaikokuAction.async { ctx =>
    TeamApiEditorOnly(
      AuditTrailEvent(s"@{user.name} has deleted a doc page on @{team.name} - @{team.id} (@{page.id})")
    )(
      teamId,
      ctx
    ) { team =>
      ctx.setCtxValue("page.id", pageId)

      env.dataStore.apiDocumentationPageRepo.forTenant(ctx.tenant.id).deleteByIdLogically(pageId).map { _ =>
        Ok(Json.obj("done" -> true))
      }
    }
  }

  def saveDocPage(teamId: String, pageId: String) = DaikokuAction.async(parse.json) { ctx =>
    TeamApiEditorOnly(AuditTrailEvent(s"@{user.name} has saved a doc page on @{team.name} - @{team.id} (@{page.id})"))(
      teamId,
      ctx
    ) { team =>
      env.dataStore.apiDocumentationPageRepo.forTenant(ctx.tenant.id).findByIdNotDeleted(pageId).flatMap {
        case None => FastFuture.successful(NotFound(Json.obj("error" -> "Page not found")))
        case Some(p) => {
          ApiDocumentationPageFormat.reads(ctx.request.body) match {
            case JsError(e) =>
              FastFuture
                .successful(BadRequest(Json.obj("error" -> "Error while parsing payload", "msg" -> e.toString)))
            case JsSuccess(page, _) => {
              env.dataStore.apiDocumentationPageRepo.forTenant(ctx.tenant.id).save(page).map { _ =>
                Ok(page.asJson)
              }
            }
          }
        }
      }
    }
  }

  def search() = DaikokuAction.async(parse.json) { ctx =>
    PublicUserAccess(AuditTrailEvent(s"@{user.name} has searched @{search}"))(ctx) {
      val body = ctx.request.body.as[JsObject]
      val search = (body \ "search").asOpt[String].getOrElse("")
      ctx.setCtxValue("search", search)

      val searchAsRegex = Json.obj("$regex" -> s".*$search.*", "$options" -> "-i")

      for {
        myTeams <- env.dataStore.teamRepo.myTeams(ctx.tenant, ctx.user)
        teams <- env.dataStore.teamRepo
          .forTenant(ctx.tenant.id)
          .findNotDeleted(Json.obj("name" -> searchAsRegex), 5)
        apis <- env.dataStore.apiRepo
          .forTenant(ctx.tenant.id)
          .findNotDeleted(
            Json.obj(
              "name" -> searchAsRegex,
              "$or" -> Json.arr(
                Json.obj("visibility" -> "Public"),
                Json.obj(
                  "$or" -> Json.arr(
                    Json.obj("authorizedTeams" -> Json.obj("$in" -> JsArray(myTeams.map(_.id.asJson)))),
                    Json.obj("team" -> Json.obj("$in" -> JsArray(myTeams.map(_.id.asJson))))
                  )
                ),
              )
            ),
            5
          )
      } yield {
        Ok(
          Json.arr(
            Json.obj("label" -> "Teams",
              "options" -> JsArray(
                teams.map(t => Json.obj("value" -> t.humanReadableId, "label" -> t.name, "type" -> "team"))
              )),
            Json.obj(
              "label" -> "Apis",
              "options" -> JsArray(
                apis.map(
                  a =>
                    Json.obj("value" -> a.humanReadableId, "team" -> a.team.value, "label" -> a.name, "type" -> "api")
                )
              )
            )
          )
        )
      }
    }
  }

  def categories() = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(s"@{user.name} get categories"))(ctx) {
      env.dataStore.apiRepo
        .forTenant(ctx.tenant.id)
        .findWithProjection(Json.obj(), Json.obj("categories" -> true))
        .map(
          tags =>
            tags.map(
              tag =>
                (tag \ "categories")
                  .asOpt[Seq[String]]
                  .map(_.toSet)
                  .getOrElse(Set.empty)
            )
        )
        .map(_.toSet)
        .map(_.flatten)
        .map(categories => Ok(JsArray(categories.map(JsString.apply).toSeq)))
    }
  }

  def changePlansVisibility(plans: Seq[UsagePlan], api: Api, tenant: Tenant): Future[Seq[UsagePlan]] = {
    Future.sequence(plans.map(plan => {
      plan.visibility match {
        case Public => FastFuture.successful(plan.removeAllAuthorizedTeams())
        case Private => for {
          subs <- env.dataStore.apiSubscriptionRepo.forTenant(tenant).findNotDeleted(Json.obj("api" -> api.id.asJson, "plan" -> plan.id.asJson))
        } yield {
          plan.addAutorizedTeams(subs.map(_.team).distinct)
        }
      }
    }))
  }

  def deleteApiSubscriptionsAsFlow(tenant: Tenant, api: Api, user: User) = Flow[(UsagePlan, Seq[ApiSubscription])]
    .map(tuple => {
      tuple._2.map(subscription => {
        (tuple._1, subscription, Notification(
          id = NotificationId(BSONObjectID.generate().stringify),
          tenant = tenant.id,
          team = Some(subscription.team),
          sender = user,
          notificationType = NotificationType.AcceptOnly,
          action = NotificationAction.ApiKeyDeletionInformation(api.name, subscription.apiKey.clientId)
        ))
      })
    })
    .flatMapConcat(seq => Source(seq.toList))
    .mapAsync(5)(sub => {
      val plan = sub._1
      val subscription = sub._2
      val notification = sub._3
      env.dataStore.teamRepo.forTenant(tenant).findByIdNotDeleted(subscription.team).flatMap {
        case None => FastFuture.successful(false) //todo: change it !!!
        case Some(subscriberTeam) => env.dataStore.notificationRepo.forTenant(tenant).save(notification)
          .flatMap(_ => apiKeyStatsJob.syncForSubscription(subscription, tenant))
          .flatMap(_ => apiService.deleteApiKey(tenant, subscription, plan, api, subscriberTeam))
          .flatMap(_ => env.dataStore.apiSubscriptionRepo.forTenant(tenant).deleteByIdLogically(subscription.id))
      }
    })

  def deleteApiPlansSubscriptions(plans: Seq[UsagePlan], api: Api, tenant: Tenant, user: User): Future[Done] = {
    implicit val mat: Materializer = env.defaultMaterializer

    Source(plans.toList)
      .mapAsync(1)(plan =>
        env.dataStore.apiSubscriptionRepo.forTenant(tenant)
          .findNotDeleted(Json.obj("api" -> api.id.asJson, "plan" -> Json.obj("$in" -> JsArray(plans.map(_.id).map(_.asJson)))))
          .map(seq => (plan, seq)))
      .via(deleteApiSubscriptionsAsFlow(tenant, api, user))
      .runWith(Sink.ignore)
      .recover {
        case e =>
          AppLogger.error(s"Error while deleting api subscriptions", e)
          Done
      }
  }

  def getApiSubscriptions(teamId: String, apiId: String, version: String) = DaikokuAction.async { ctx =>
    TeamApiEditorOnly(AuditTrailEvent(s"@{user.name} has acceeded to team (@{team.id}) subscription for api @{api.id}"))(teamId, ctx) { team =>
      env.dataStore.apiRepo.findByVersion(ctx.tenant, apiId, version).flatMap {
        case Some(api) if api.team != team.id => FastFuture.successful(Unauthorized(Json.obj("error" -> "Unauthorized to access to this api")))
        case Some(api) => env.dataStore.apiSubscriptionRepo.forTenant(ctx.tenant)
          .findNotDeleted(Json.obj("api" -> api.id.asJson))
          .map(subs => Ok(JsArray(subs.map(_.asSafeJson))))
        case None => FastFuture.successful(NotFound(Json.obj("error" -> "Api not found")))
      }
    }
  }

  def getPosts(apiId: String, version: String, offset: Option[Int], limit: Option[Int]) = DaikokuActionMaybeWithGuest.async { ctx =>
    UberPublicUserAccess(AuditTrailEvent(s"@{user.name} has accessed posts for @{api.id}"))(ctx) {
      ctx.setCtxValue("api.id", apiId)

      getPostsImpl(ctx.tenant, apiId, version, limit.getOrElse(10), offset.getOrElse(0)).map {
        case Left(r) => NotFound(r)
        case Right(r) => Ok(r)
      }
    }
  }

  private def getPostsImpl(tenant: Tenant, apiId: String, version: String, limit: Int, offset: Int):
  Future[Either[JsValue, JsValue]] = {
    env.dataStore.apiRepo.findByVersion(tenant, apiId, version).flatMap {
      case None => FastFuture.successful(Left(Json.obj("error" -> "Api not found")))
      case Some(api) =>
        env.dataStore.apiPostRepo
          .forTenant(tenant.id)
          .findWithPagination(Json.obj(
            "_id" -> Json.obj(
              "$in" -> JsArray(api.posts.map(_.asJson))
            )
          ), offset, limit)
          .map(data => Right(Json.obj(
            "posts" -> JsArray(data._1.map(_.asJson)),
            "total" -> data._2
          )))
    }
  }

  def createPost(teamId: String, apiId: String) = DaikokuAction.async(parse.json) { ctx =>
    TeamApiEditorOnly(AuditTrailEvent(s"@{user.name} has accessed posts for @{api.id}"))(teamId, ctx) { _ =>

      val postId = ApiPostId(BSONObjectID.generate().stringify)

      val body = ApiPost(
        id = postId,
        tenant = ctx.tenant.id,
        lastModificationAt = DateTime.now(),
        title = (ctx.request.body \ "title").as[String],
        content = (ctx.request.body \ "content").as[String]
      )

      env.dataStore.apiPostRepo
        .forTenant(ctx.tenant.id)
        .save(body)
        .flatMap {
          case true =>
            env.dataStore.apiRepo
              .forTenant(ctx.tenant.id)
              .findByIdNotDeleted(apiId)
              .flatMap {
                case Some(api) =>
                  env.dataStore.apiRepo.forTenant(ctx.tenant.id)
                    .save(api.copy(posts = api.posts ++ Seq(postId)))
                    .flatMap {
                      case true =>
                        for {
                          subs <- env.dataStore.apiSubscriptionRepo
                            .forTenant(ctx.tenant.id)
                            .find(Json.obj("api" -> apiId))
                          api <- env.dataStore.apiRepo.forTenant(ctx.tenant.id).findByIdNotDeleted(apiId)
                          _ <- {
                            Future.sequence(subs.toSet[ApiSubscription].map(sub =>
                              env.dataStore.notificationRepo
                                .forTenant(ctx.tenant.id)
                                .save(Notification(
                                  id = NotificationId(BSONObjectID.generate().stringify),
                                  tenant = ctx.tenant.id,
                                  sender = ctx.user,
                                  action = NotificationAction.NewPostPublished(teamId, api.map(_.name).getOrElse("")),
                                  notificationType = NotificationType.AcceptOnly,
                                  team = Some(sub.team)
                                ))
                            ))
                          }
                        } yield {
                          Ok(Json.obj("created" -> true))
                        }
                      case false => FastFuture.successful(BadRequest(Json.obj("error" -> "Failed to create post")))
                    }
                case None =>
                  AppLogger.error("Api not found after post creation")
                  FastFuture.successful(NotFound(Json.obj("error" -> "Failed to create post : Api not found")))
              }
          case false => FastFuture.successful(BadRequest(Json.obj("error" -> "Failed to create post")))
        }
    }
  }

  def updatePost(teamId: String, apiId: String, postId: String) = DaikokuAction.async(parse.json) { ctx =>
    TeamApiEditorOnly(AuditTrailEvent(s"@{user.name} has updated posts for @{api.id}"))(teamId, ctx) { _ =>
      env.dataStore.apiPostRepo
        .forTenant(ctx.tenant.id)
        .findByIdNotDeleted(postId)
        .flatMap {
          case Some(post) =>
            env.dataStore.apiPostRepo
              .forTenant(ctx.tenant.id)
              .save(post.copy(
                content = (ctx.request.body \ "content").as[String],
                title = (ctx.request.body \ "title").as[String]
              ))
              .flatMap {
                case true => FastFuture.successful(Ok(Json.obj("message" -> "Post saved")))
                case false => FastFuture.successful(BadRequest(Json.obj("error" -> "Something went wrong")))
              }
          case None => FastFuture.successful(NotFound(Json.obj("error" -> "Post not found")))
        }
    }
  }

  def removePost(teamId: String, apiId: String, postId: String) = DaikokuAction.async { ctx =>
    TeamApiEditorOnly(AuditTrailEvent(s"@{user.name} has removed posts for @{api.id}"))(teamId, ctx) { _ =>
      env.dataStore.apiPostRepo
        .forTenant(ctx.tenant.id)
        .deleteById(postId)
        .flatMap {
          case true => FastFuture.successful(Ok(Json.obj("message" -> "Post removed")))
          case false => FastFuture.successful(BadRequest(Json.obj("error" -> "Something went wrong")))
        }
    }
  }

  def toggleStar(apiId: String) = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(s"@{user.name} has starred @{api.name} - @{api.id}"))(ctx) {
      env.dataStore.apiRepo
        .forTenant(ctx.tenant.id)
        .findByIdNotDeleted(apiId)
        .flatMap {
          case Some(api) =>
            val starred = ctx.user.starredApis.contains(api.id)
            val newStars = api.stars + (if (starred) -1 else 1)
            for {
              _ <- env.dataStore.userRepo.save(ctx.user.copy(starredApis =
                if (starred) ctx.user.starredApis.filter(id => id != api.id) else ctx.user.starredApis ++ Seq(api.id)
              ))
              _ <- env.dataStore.apiRepo.forTenant(ctx.tenant.id).save(api.copy(stars = newStars))
            } yield {
              Ok(Json.obj("done" -> true))
            }
          case None => FastFuture.successful(NotFound(Json.obj("error" -> "Api not found")))
        }
    }
  }

  def getIssue(apiId: String, issueId: String) = DaikokuActionMaybeWithGuest.async { ctx =>
    UberPublicUserAccess(AuditTrailEvent(s"@{user.name} has accessed issues for @{api.id}"))(ctx) {
      ctx.setCtxValue("api.id", apiId)

      env.dataStore.apiIssueRepo.forTenant(ctx.tenant.id).findOne(Json.obj(
        "_id" -> issueId
      )).flatMap {
        case None => FastFuture.successful(NotFound(Json.obj("error" -> "Issue not found")))
        case Some(issue) =>
          for {
            creators      <- Future.sequence(issue.comments.map(comment => env.dataStore.userRepo.findById(comment.by.value)))
            issueCreator  <- env.dataStore.userRepo.findById(issue.by.value)
            api           <- env.dataStore.apiRepo.forTenant(ctx.tenant.id).findOne(Json.obj(
              "_humanReadableId" -> apiId,
              "parent" -> JsNull
            ))
          } yield {
            issueCreator
              .map { creator =>
                val issuesTags = api.map(_.issuesTags).getOrElse(Set.empty)
                Ok(
                  (issue.asJson.as[JsObject] ++
                    Json.obj(
                      "by" -> creator.asSimpleJson,
                      "tags" -> Json.toJson(issue.tags
                      .map(tagId => issuesTags.find(_.id == tagId).map(tag => ApiTagFormat.writes(tag)))),
                      "comments" -> Json.toJson(issue.comments.zipWithIndex
                        .map { case (comment, i) =>
                          ApiIssueCommentFormat.writes(comment) + ("by" -> creators(i).map(_.asSimpleJson).getOrElse(Json.obj()))
                        }))
                  ))
              }
              .getOrElse(BadRequest(Json.obj("error" -> "The issue creator is missing")))
          }
      }
    }
  }

  def getIssues(apiId: String) = DaikokuActionMaybeWithGuest.async { ctx =>
    UberPublicUserAccess(AuditTrailEvent(s"@{user.name} has accessed issues for @{api.id}"))(ctx) {
      ctx.setCtxValue("api.id", apiId)

      env.dataStore.apiRepo.forTenant(ctx.tenant.id).findOne(Json.obj(
        "_humanReadableId" -> apiId,
        "parent" -> JsNull
      )).flatMap {
        case None => FastFuture.successful(NotFound(Json.obj("error" -> "Api not found")))
        case Some(api) =>
          env.dataStore.apiIssueRepo
            .forTenant(ctx.tenant.id)
            .find(Json.obj(
              "_id" -> Json.obj("$in" -> JsArray(api.issues.map(_.asJson)))
            ))
            .map(issues => issues.filter(!_.deleted))
            .flatMap(issues =>
              for {
                creators <- Future.sequence(issues.map(issue => env.dataStore.userRepo.findById(issue.by.value)))
              } yield {
                Ok(
                  JsArray(
                    issues
                      .zipWithIndex
                      .map {
                        case (issue, i) =>
                          issue.asJson.as[JsObject] +
                            ("by" -> creators(i).map(_.asSimpleJson).getOrElse(Json.obj())) +
                            ("tags" -> Json.toJson(issue.tags
                              .map(tagId => api.issuesTags.find(_.id == tagId).map(tag => ApiTagFormat.writes(tag)).getOrElse(Json.obj()))))
                      }
                  )
                )
              }
            )
      }
    }
  }

  def createIssue(teamId: String, apiId: String) = DaikokuAction.async(parse.json) { ctx =>
    PublicUserAccess(AuditTrailEvent(s"@{user.name} has accessed issues for @{api.id}"))(ctx) {
      ApiIssueFormat.reads(ctx.request.body) match {
        case JsError(_) => FastFuture.successful(BadRequest(Json.obj("error" -> "Body can't be parse to issue")))
        case JsSuccess(issue, _) =>
          env.dataStore.apiRepo.forTenant(ctx.tenant.id).findOne(Json.obj(
            "_humanReadableId" -> apiId,
            "parent" -> JsNull
          )).flatMap {
            case None => FastFuture.successful(AppError.render(ApiNotFound))
            case Some(api) =>
              env.dataStore.apiIssueRepo.forTenant(ctx.tenant.id)
                .save(issue.copy(seqId = api.issues.size))
                .flatMap {
                  case false => FastFuture.successful(BadRequest(Json.obj("error" -> "failed to create issue")))
                  case true =>
                    env.dataStore.apiRepo.forTenant(ctx.tenant.id)
                        .save(api.copy(issues = api.issues ++ Seq(issue.id)))
                        .flatMap {
                          case false => FastFuture.successful(BadRequest(Json.obj("error" -> "Failed to save new issue in api issues list")))
                          case true =>
                            for {
                              subs <- env.dataStore.apiSubscriptionRepo
                                .forTenant(ctx.tenant.id)
                                .find(Json.obj(
                                  "api" -> api.id.value
                                ))
                              optTeam <- env.dataStore.teamRepo.forTenant(ctx.tenant.id).findById(teamId)
                              _ <- {
                                Future.sequence(subs.distinctBy(_.team)
                                  .map(sub =>
                                    env.dataStore.notificationRepo
                                      .forTenant(ctx.tenant.id)
                                      .save(Notification(
                                        id = NotificationId(BSONObjectID.generate().stringify),
                                        tenant = ctx.tenant.id,
                                        sender = ctx.user,
                                        action = NotificationAction.NewIssueOpen(teamId,
                                          api.name,
                                          s"${optTeam.map(_.humanReadableId).getOrElse("")}/${api.humanReadableId}/${api.currentVersion.value}/issues/${issue.id.value}"
                                        ),
                                        notificationType = NotificationType.AcceptOnly,
                                        team = Some(sub.team)
                                      ))
                                  ))
                              }
                            } yield {
                              Created(Json.obj("created" -> true))
                            }
                        }
                }
          }
      }
    }
  }

  def updateIssue(teamId: String, apiId: String, issueId: String) = DaikokuAction.async(parse.json) { ctx =>
    PublicUserAccess(AuditTrailEvent(s"@{user.name} has updated issues for @{api.id}"))(ctx) {

      def commentsHasBeenRemovedWithoutRights(isDaikokuAdmin: Boolean, a: Seq[ApiIssueComment], b: Seq[ApiIssueComment]) = !isDaikokuAdmin &&
        a.size < b.size &&
        b.filterNot { comment => a.exists(c => c.createdAt.getMillis == comment.createdAt.getMillis) }
          .exists(comment => comment.by != ctx.user.id)

      def commentsHasBeenUpdatedWithoutRights(isDaikokuAdmin: Boolean, a: Seq[ApiIssueComment], b: Seq[ApiIssueComment]) = !isDaikokuAdmin &&
        a.size == b.size &&
        b.filterNot { comment => a.exists(c => c.content == comment.content) }
          .exists(comment => comment.by != ctx.user.id)

      def notifyTeam(apiName: String, linkTo: String, team: TeamId) = env.dataStore.notificationRepo
        .forTenant(ctx.tenant.id)
        .save(Notification(
          id = NotificationId(BSONObjectID.generate().stringify),
          tenant = ctx.tenant.id,
          sender = ctx.user,
          action = NotificationAction.NewCommentOnIssue(teamId, apiName, linkTo),
          notificationType = NotificationType.AcceptOnly,
          team = Some(team)
        ))

      ApiIssueFormat.reads(ctx.request.body) match {
        case JsError(_) => FastFuture.successful(BadRequest(Json.obj("error" -> "Body can't be parse to issue")))
        case JsSuccess(issue, _) =>
          (for {
            optIssue  <- env.dataStore.apiIssueRepo.forTenant(ctx.tenant.id).findOne(Json.obj("_id" -> issueId))
            optTeam   <- env.dataStore.teamRepo.forTenant(ctx.tenant.id).findById(teamId)
          } yield {
            (optIssue, optTeam) match {
              case (Some(existingIssue), Some(team)) =>
                val isTeamMember    = team.users.find(_.userId == ctx.user.id)
                val isDaikokuAdmin  = ctx.user.isDaikokuAdmin

                val sortedExistingComments  = existingIssue.comments.sortBy(_.createdAt.getMillis)
                val sortedEntryComments     = issue.comments.sortBy(_.createdAt.getMillis)

                if (!existingIssue.tags.equals(issue.tags) && isTeamMember.isEmpty && !isDaikokuAdmin)
                  FastFuture.successful(Unauthorized(Json.obj("error" -> "You're not authorized to edit tags")))
                else if (commentsHasBeenRemovedWithoutRights(isDaikokuAdmin, sortedEntryComments, sortedExistingComments))
                  FastFuture.successful(Unauthorized(Json.obj("error" -> "You're not allowed to delete a comment that does not belong to you")))
                else if (commentsHasBeenUpdatedWithoutRights(isDaikokuAdmin, sortedEntryComments, sortedExistingComments))
                  FastFuture.successful(Unauthorized(Json.obj("error" -> "You're not allowed to edit a comment that does not belong to you")))
                else if (existingIssue.open != issue.open && isTeamMember.isEmpty && !isDaikokuAdmin)
                  FastFuture.successful(Unauthorized(Json.obj("error" -> "You're not authorized to close or re-open an issue")))
                else if (existingIssue.title != issue.title && !isDaikokuAdmin && (issue.by != ctx.user.id || (issue.by != ctx.user.id && isTeamMember.isEmpty)))
                    FastFuture.successful(Unauthorized(Json.obj("error" -> "You're not authorized to edit issue")))
                else
                  env.dataStore.apiIssueRepo
                    .forTenant(ctx.tenant.id)
                    .save(issue)
                    .flatMap { updated =>
                      if (updated) {
                        if (existingIssue.comments.size < issue.comments.size)
                          for {
                            subs <- env.dataStore.apiSubscriptionRepo.forTenant(ctx.tenant.id).find(Json.obj(
                              "_humanReadableId" -> apiId
                            ))
                            api <- env.dataStore.apiRepo.forTenant(ctx.tenant.id).findOne(Json.obj(
                              "_humanReadableId" -> apiId,
                              "parent" -> JsNull
                            ))
                            _ <- {
                              Future.sequence(subs.distinctBy(_.team)
                                .map(sub => notifyTeam(
                                  api.map(_.name).getOrElse(""),
                                  s"${team.humanReadableId}/${api.map(_.humanReadableId).getOrElse("")}/${api.map(_.currentVersion.value).getOrElse("1.0.0")}/issues/${issue.id.value}",
                                  sub.team)
                                ))
                            }
                          } yield Ok(Json.obj("message" -> "Issue saved"))
                        else
                          FastFuture.successful(Ok(Json.obj("message" -> "Issue saved")))
                      } else
                        FastFuture.successful(BadRequest(Json.obj("error" -> "Something went wrong")))
                    }
              case _ => FastFuture.successful(NotFound(Json.obj("error" -> "Team or issue not found")))
            }
          })
            .flatMap(_.asInstanceOf[Future[Result]])
      }
    }
  }

  def getComments(apiId: String, issueId: String) = DaikokuActionMaybeWithGuest.async { ctx =>
    UberPublicUserAccess(AuditTrailEvent(s"@{user.name} has accessed comments for @{api.id}"))(ctx) {
      ctx.setCtxValue("api.id", apiId)

      env.dataStore.apiRepo.forTenant(ctx.tenant.id).findOne(Json.obj(
        "_humanReadableId" -> apiId,
        "parent" -> JsNull
      )).flatMap {
        case None => FastFuture.successful(NotFound(Json.obj("error" -> "Api not found")))
        case Some(_) =>
          env.dataStore.apiIssueRepo
            .forTenant(ctx.tenant.id)
            .findById(issueId)
            .flatMap(issue => FastFuture.successful(
              Ok(
                JsArray(
                  issue
                    .map(_.comments)
                    .getOrElse(Seq.empty[ApiIssueComment])
                    .map(ApiIssueCommentFormat.writes)
                )
              )
            ))
      }
    }
  }

  def createVersion(teamId: String, apiId: String) = DaikokuAction.async(parse.json) { ctx =>
    TeamApiEditorOnly(
      AuditTrailEvent(s"@{user.name} has created new version (@{newVersion}) of api @{api.id} with @{team.name} - @{team.id}")
    )(teamId, ctx) { team =>
      val newVersion = (ctx.request.body \ "version").asOpt[String]

      ctx.setCtxValue("newVersion", newVersion)

      newVersion match {
        case None => FastFuture.successful(BadRequest(Json.obj("error" -> "Missing parameters")))
        case Some(newVersion) if newVersion.isEmpty => FastFuture.successful(BadRequest(Json.obj("error" -> "Version number is too short")))
        case Some(newVersion) =>
          val apiRepo = env.dataStore.apiRepo.forTenant(ctx.tenant.id)
          val generatedApiId = ApiId(BSONObjectID.generate().stringify)
          apiRepo
            .findOne(Json.obj("$or" -> Json.arr(Json.obj("_humanReadableId" -> apiId), Json.obj("_id" -> apiId)), "parent" -> JsNull))
            .flatMap {
              case None => FastFuture.successful(AppError.render(ApiNotFound))
              case Some(api) if api.currentVersion.value == newVersion => FastFuture.successful(AppError.render(ApiVersionConflict))
              case Some(api) =>
                apiRepo.exists(Json.obj("currentVersion" -> newVersion, "_humanReadableId" -> api.humanReadableId))
                  .flatMap {
                    case true => FastFuture.successful(AppError.render(ApiVersionConflict))
                    case false =>
                      apiRepo.save(api.copy(
                        id = generatedApiId,
                        parent = Some(api.id),
                        currentVersion = Version(newVersion),
                        published = false,
                        isDefault = true,
                        testing = Testing(),
                        documentation = ApiDocumentation(
                          id = ApiDocumentationId(BSONObjectID.generate().stringify),
                          tenant = ctx.tenant.id,
                          lastModificationAt = DateTime.now(),
                          pages = Seq.empty
                        ),
                        swagger = Some(SwaggerAccess(url = "/assets/swaggers/petstore.json")),
                        possibleUsagePlans = Seq.empty,
                        defaultUsagePlan = UsagePlanId(""),
                        posts = Seq.empty,
                        issues = Seq.empty
                      ))
                        .flatMap {
                          case true   =>
                            apiRepo.updateManyByQuery(
                              Json.obj(
                                "_humanReadableId" -> api.humanReadableId,
                                "_id" -> Json.obj("$ne" -> generatedApiId.value)
                              ),
                              Json.obj("$set" -> Json.obj("isDefault" -> false))
                            )
                              .map(_ => Created(Json.obj("created" -> true)))
                          case false  => FastFuture.successful(BadRequest(Json.obj("error" -> "The creation of api has failed")))
                        }
                  }
            }
      }
    }
  }

  def getAllApiVersions(teamId: String, apiId: String) = DaikokuActionMaybeWithGuest.async { ctx =>
    UberPublicUserAccess(AuditTrailEvent(s"@{user.name} has requested all versions of api @{api.id}"))(ctx) {
      val repo = env.dataStore.apiRepo
        .forTenant(ctx.tenant.id)

      repo.find(Json.obj("_humanReadableId" -> apiId))
        .map { apis =>
          Ok(SeqVersionFormat.writes(apis
            .filter(api => !ctx.user.isGuest || api.visibility.name == ApiVisibility.Public.name)
            .map(_.currentVersion)
            .sortWith((a, b) => a.value.compareToIgnoreCase(b.value) < 0)))
        }
    }
  }

  def getDefaultApiVersion(apiId: String) = DaikokuActionMaybeWithGuest.async { ctx =>
    UberPublicUserAccess(AuditTrailEvent("@{user.name} has accessed to default version of api @{api.name}"))(ctx) {
      for {
        myTeams <- env.dataStore.teamRepo.myTeams(ctx.tenant, ctx.user)
        apis <- env.dataStore.apiRepo
          .forTenant(ctx.tenant.id)
          .find(Json.obj(
            "_humanReadableId" -> apiId
          ))
      } yield {
        val filteredApis = apis
          .filter(api => api.authorizedTeams.exists(t => myTeams.exists(a => a.id == t)) || myTeams.exists(a => a.id == api.team))

        filteredApis.find(api => api.isDefault) match {
            case None => Ok(Json.obj("defaultVersion" -> apis.find(api => api.parent.isEmpty).get.currentVersion.asJson))
            case Some(api) => Ok(Json.obj("defaultVersion" -> api.currentVersion.asJson))
          }
      }
    }
  }

  def getAllPlan(teamId: String, apiId: String, version: String) = DaikokuAction.async { ctx =>
    TeamApiEditorOnly(
      AuditTrailEvent(s"@{user.name} has requested all plan of api @{api.id} with @{team.name} - @{team.id}")
    )(teamId, ctx) { _ =>
      env.dataStore.apiRepo
        .forTenant(ctx.tenant.id)
        .find(Json.obj("_humanReadableId" -> apiId, "currentVersion" -> Json.obj("$ne" -> version)))
        .flatMap { apis => FastFuture.successful(Ok(SeqApiFormat.writes(apis))) }
    }
  }

  def clonePlan(teamId: String, apiId: String) = DaikokuAction.async(parse.json) { ctx =>
    TeamApiEditorOnly(
      AuditTrailEvent(s"@{user.name} has cloned plan of api @{api.id} with @{team.name} - @{team.id}")
    )(teamId, ctx) { _ =>
      val planId = (ctx.request.body \ "plan").as[String]
      val fromApiId = (ctx.request.body \ "api").as[String]

      val apiRepo = env.dataStore.apiRepo.forTenant(ctx.tenant.id)

      for {
        fromApi <- apiRepo.findById(fromApiId)
        api <- apiRepo.findById(apiId)
      } yield {
        fromApi match {
          case None if api.isEmpty || fromApi.isEmpty => AppError.render(ApiNotFound)
          case Some(fromApi) =>
            fromApi.possibleUsagePlans.find(_.id.value == planId) match {
              case None => AppError.render(PlanNotFound)
              case Some(originalPlan) =>
                val id = UsagePlanId(BSONObjectID.generate().stringify)
                val customName = Some(s"Imported plan from ${fromApi.currentVersion} - ${originalPlan.typeName}")
                apiRepo.save(api.get.copy(
                  possibleUsagePlans = api.get.possibleUsagePlans ++ Seq((originalPlan match {
                    case u: UsagePlan.Admin => u.copy(id = id, customName = customName)
                    case u: UsagePlan.PayPerUse => u.copy(id = id, customName = customName)
                    case u: UsagePlan.FreeWithQuotas => u.copy(id = id, customName = customName)
                    case u: UsagePlan.FreeWithoutQuotas => u.copy(id = id, customName = customName)
                    case u: UsagePlan.QuotasWithLimits => u.copy(id = id, customName = customName)
                    case u: UsagePlan.QuotasWithoutLimits => u.copy(id = id, customName = customName)
                  }).asInstanceOf[UsagePlan])
                ))
                .map(_ => Created(Json.obj("done" -> true)))
            }
        }
      }

      FastFuture.successful(Ok(Json.obj()))
    }
  }

  def getMyTeamsStatusAccess(teamId: String, apiId: String, version: String) = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(
      s"@{user.name} has requested status of own teams requests for api @{api.name}"))(
      ctx) {
      env.dataStore.apiRepo
        .findByVersion(ctx.tenant, apiId, version)
        .flatMap {
          case None => FastFuture.successful(AppError.render(ApiNotFound))
          case Some(api) =>
            ctx.setCtxValue("api.name", api.name)

            (for {
              myTeams <- env.dataStore.teamRepo.myTeams(ctx.tenant, ctx.user)
              pendingRequests <- env.dataStore.notificationRepo
                  .forTenant(ctx.tenant.id)
                  .findNotDeleted(
                    Json.obj(
                      "action.type" -> "ApiAccess",
                      "status.status" -> "Pending",
                      "action.api" -> api.id.asJson,
                      "action.team" -> Json.obj("$in" -> JsArray(myTeams.map(_.id.asJson)))
                    )
                  )
              subscriptions <-
                env.dataStore.apiSubscriptionRepo
                  .forTenant(ctx.tenant.id)
                  .findNotDeleted(
                    Json.obj("api" -> api.id.value,
                      "team" -> Json.obj("$in" -> JsArray(myTeams.map(_.id.asJson))))
                  )
            } yield {
                api.asPublicWithAuthorizationsJson()
                  .as[JsObject] ++ Json.obj(
                  "pendingRequests" -> JsArray(pendingRequests.map(_.asJson)),
                  "subscriptions" -> JsArray(subscriptions.map(_.asSimpleJson)),
                  "myTeams" -> SeqTeamFormat.writes(myTeams),
                  "authorizations" -> JsArray(myTeams
                    .filter(t => t.`type` != TeamType.Admin)
                    .map(
                      team =>
                        Json.obj(
                          "team" -> team.id.asJson,
                          "authorized" -> (api.authorizedTeams.contains(team.id) || api.team == team.id),
                          "pending" -> pendingRequests.exists(notif => {
                            val accessApi = notif.action.asInstanceOf[ApiAccess]
                            accessApi.team == team.id && accessApi.api == api.id
                          })
                        )
                    )
                ))
            })
              .map(p => Ok(p))
        }
    }
  }
}



