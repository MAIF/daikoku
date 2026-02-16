package fr.maif.services

import com.github.jknack.handlebars.{Context, Handlebars, Options}
import fr.maif.actions.{
  DaikokuActionContext,
  DaikokuInternalActionMaybeWithoutUserContext
}
import fr.maif.audit.AuditTrailEvent
import fr.maif.controllers.AppError
import fr.maif.controllers.AppError.toJson
import fr.maif.controllers.authorizations.async.{
  _TeamMemberOnly,
  _UberPublicUserAccess
}
import fr.maif.domain.*
import fr.maif.env.Env
import fr.maif.storage.TenantCapableRepo
import fr.maif.utils.IdGenerator
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.joda.time.DateTime
import play.api.i18n.MessagesApi
import play.api.libs.json.*
import play.api.mvc.Request

import java.util.concurrent.Executors
import scala.collection.concurrent.TrieMap
import scala.concurrent.duration.DurationInt
import scala.concurrent.{
  Await,
  ExecutionContext,
  ExecutionContextExecutor,
  Future
}

object CmsPage {
  val pageRenderingEc = ExecutionContext.fromExecutor(
    Executors.newWorkStealingPool(Runtime.getRuntime.availableProcessors() + 1)
  )
}

case class CmsFile(
    name: String,
    content: String,
    metadata: Map[String, JsValue] = Map.empty,
    daikokuData: Option[Map[String, String]] = None
) {
  def path(): String = metadata.getOrElse("_path", JsString("")).as[String]
  def contentType(): String =
    metadata.getOrElse("_content_type", JsString("")).as[String]

  def authenticated(): Boolean =
    Json
      .parse(metadata.getOrElse("_authenticated", JsString("false")).as[String])
      .as[Boolean]
  def visible(): Boolean =
    Json
      .parse(metadata.getOrElse("_visible", JsString("true")).as[String])
      .as[Boolean]
  def exact(): Boolean =
    Json
      .parse(metadata.getOrElse("_exact", JsString("false")).as[String])
      .as[Boolean]

  def id(): String = {
    val defaultId = path().replaceAll("/", "-")
    daikokuData
      .map(data => data.getOrElse("id", defaultId))
      .getOrElse(defaultId)
  }

  def toCmsPage(tenantId: TenantId): CmsPage = {
    CmsPage(
      id = CmsPageId(id()),
      tenant = tenantId,
      visible = visible(),
      authenticated = authenticated(),
      exact = exact(),
      name = name,
      forwardRef = None,
      tags = List.empty,
      metadata = metadata.map { case (key, value) =>
        (key, value.toString.replaceAll("\"", ""))
      },
      contentType = contentType(),
      body = content,
      path = Some(path())
    )
  }
}

case class CmsRequestRendering(
    content: Seq[CmsFile],
    current_page: String,
    fields: Map[String, JsValue]
)

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
    path: Option[String] = None,
    exact: Boolean = false,
    lastPublishedDate: Option[DateTime] = None
) extends CanJson[CmsPage] {
  override def asJson: JsValue = json.CmsPageFormat.writes(this)

  private def enrichHandlebarsWithPublicUserEntity(
      ctx: DaikokuInternalActionMaybeWithoutUserContext[JsValue],
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
          case None => AppError.render(AppError.UserNotFound())
        }
      }
    )
  }

  private def enrichHandlebarsWithOwnedApis[A](
      ctx: DaikokuInternalActionMaybeWithoutUserContext[JsValue],
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
    val ctxUserContext = maybeWithoutUserToUserContextConverter(ctx)
    val name = "owned-api"

    handlebars.registerHelper(
      s"daikoku-${name}s",
      (_: CmsPage, options: Options) => {
        val visibility =
          options.hash.getOrDefault("visibility", "All").asInstanceOf[String]
        Await.result(
          CommonServices.getVisibleApis(
            limit = Int.MaxValue,
            offset = 0
          )(ctxUserContext, env, ec),
          10.seconds
        ) match {
          case Right(ApiWithCount(apis, _, _, _, _, _)) =>
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
                  ctxUserContext,
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
                      jsonToCombine = jsonToCombine ++ Map("api" -> api.asJson),
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
                  case Right(api)  => api.asJson
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
            .getVisibleApis(limit = Int.MaxValue, offset = 0)(
              maybeWithoutUserToUserContextConverter(ctx),
              env,
              ec
            )
            .map {
              case Right(ApiWithCount(apis, _, _, _, _, _)) =>
                JsArray(apis.map(_.api.asJson))
              case Left(error) => toJson(error)
            },
          10.seconds
        )
    )
  }

  private def maybeWithoutUserToUserContextConverter(
      ctx: DaikokuInternalActionMaybeWithoutUserContext[_]
  ): DaikokuActionContext[JsValue] = {
    DaikokuActionContext(
      request = null,
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
  }

  def maybeWithoutUserToUserContext(
      tenant: Tenant,
      request: Option[Request[JsValue]] = None,
      user: Option[User] = None,
      session: Option[UserSession] = None,
      impersonator: Option[User] = None,
      isTenantAdmin: Boolean = false,
      apiCreationPermitted: Boolean = false,
      ctx: TrieMap[String, String] = TrieMap.empty
  ): DaikokuInternalActionMaybeWithoutUserContext[JsValue] =
    DaikokuInternalActionMaybeWithoutUserContext(
      user = user,
      tenant = tenant,
      session = session,
      impersonator = impersonator,
      isTenantAdmin = isTenantAdmin,
      apiCreationPermitted = apiCreationPermitted,
      ctx = ctx,
      requestPath = request.map(_.uri).getOrElse(""),
      requestQueryString = request.map(_.queryString).getOrElse(Map.empty),
      requestMethod = request.map(_.method).getOrElse("GET"),
      requestHeaders = request.map(_.headers.toSimpleMap).getOrElse(Map.empty)
    )

  private def enrichHandlebarsWithOwnedTeams(
      ctx: DaikokuInternalActionMaybeWithoutUserContext[JsValue],
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
    val ctxUserContext = maybeWithoutUserToUserContextConverter(ctx)

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
                )
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
      (id: String, _: Options) => {
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

  private def enrichHandlebarsWithEntity[A](
      ctx: DaikokuInternalActionMaybeWithoutUserContext[JsValue],
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
      ctx: DaikokuInternalActionMaybeWithoutUserContext[JsValue],
      parentId: Option[String],
      str: String,
      fields: Map[String, Any],
      jsonToCombine: Map[String, JsValue],
      req: Option[CmsRequestRendering]
  )(implicit env: Env, messagesApi: MessagesApi) =
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
          path = Some("/")
        ).render(
          ctx,
          parentId,
          fields = fields,
          jsonToCombine = jsonToCombine,
          req = req
        ),
        10.seconds
      )
      ._1

  private def cmsFindByIdNotDeleted(
      ctx: DaikokuInternalActionMaybeWithoutUserContext[JsValue],
      id: String,
      req: Option[CmsRequestRendering]
  )(implicit env: Env, ec: ExecutionContext): Option[CmsPage] = {
    req match {
      case Some(value) =>
        value.content
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

  private def findCmsPageByTheId(
      ctx: DaikokuInternalActionMaybeWithoutUserContext[JsValue],
      id: String
  )(implicit env: Env, ec: ExecutionContext): Option[CmsPage] = {
    Await.result(
      env.dataStore.cmsRepo
        .forTenant(ctx.tenant)
        .findOne(
          Json.obj(
            "$or" -> Json.arr(
              Json.obj("_id" -> cleanPath(id)),
              Json.obj("_id" -> cleanPath(id).replace("/", "-")),
              Json.obj("_id" -> cleanPath(id).replace("/", "-").substring(1))
            )
          )
        ),
      10.seconds
    )
  }

  private def cmsFindById(
      ctx: DaikokuInternalActionMaybeWithoutUserContext[JsValue],
      id: String,
      req: Option[CmsRequestRendering]
  )(implicit env: Env, ec: ExecutionContext): Option[CmsPage] = {
    req match {
      case Some(value) =>
        value.content
          .find(_.path() == id)
          .map(_.toCmsPage(ctx.tenant.id))
      case None => findCmsPageByTheId(ctx, id)
    }
  }

  private def cmsFindOneNotDeleted(
      ctx: DaikokuInternalActionMaybeWithoutUserContext[_],
      id: String,
      req: Option[CmsRequestRendering]
  )(implicit env: Env, ec: ExecutionContext): Option[CmsPage] = {
    req match {
      case Some(value) =>
        value.content
          .find(p => cleanPath(p.path()) == cleanPath(id))
          .map(_.toCmsPage(ctx.tenant.id))
      case None =>
        Await.result(
          env.dataStore.cmsRepo
            .forTenant(ctx.tenant)
            .findOneNotDeleted(
              Json.obj(
                "$or" -> Json.arr(
                  Json.obj("path" -> cleanPath(id)),
                  Json.obj("_id" -> cleanPath(id)),
                  Json.obj("_id" -> cleanPath(id).replace("/", "-"))
                )
              )
            ),
          10.seconds
        )
    }
  }

  private def daikokuIncludeBlockHelper(
      ctx: DaikokuInternalActionMaybeWithoutUserContext[JsValue],
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
        cmsFindOneNotDeleted(
          ctx,
          renderString(ctx, parentId, id, outFields, jsonToCombine, req),
          req
        ) match {
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
      ctx: DaikokuInternalActionMaybeWithoutUserContext[JsValue],
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
        val tmpFields =
          getAttrs(ctx, parentId, options, fields, jsonToCombine, req)
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

  private def daikokuPageUrl(
      ctx: DaikokuInternalActionMaybeWithoutUserContext[JsValue],
      id: String,
      req: Option[CmsRequestRendering]
  )(implicit env: Env, ec: ExecutionContext) = {
    cmsFindByIdNotDeleted(ctx, id, req) match {
      case None => "#not-found"
      case Some(page) =>
        var path = page.path.getOrElse("")

        if (!path.startsWith("/"))
          path = s"/$path"

        s"/_$path"
    }
  }

  private def daikokuLinks(
      ctx: DaikokuInternalActionMaybeWithoutUserContext[_],
      handlebars: Handlebars
  ) = {
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
    links.map { case (name, link) =>
      handlebars.registerHelper(
        s"daikoku-links-$name",
        (_: Object, _: Options) => link
      )
    }
  }

  private def getAttrs(
      ctx: DaikokuInternalActionMaybeWithoutUserContext[JsValue],
      parentId: Option[String],
      options: Options,
      fields: Map[String, Any],
      jsonToCombine: Map[String, JsValue],
      req: Option[CmsRequestRendering]
  )(implicit
      env: Env,
      messagesApi: MessagesApi
  ): Map[String, Any] = {
    import scala.jdk.CollectionConverters.*
    fields ++ options.hash.asScala.map { case (k, v) =>
      (
        k,
        renderString(
          ctx,
          parentId,
          if (v == null) "" else v.toString,
          fields,
          jsonToCombine = jsonToCombine,
          req = req
        )
      )
    }.toMap
  }

  private def enrichHandlebarWithPlanEntity(
      ctx: DaikokuInternalActionMaybeWithoutUserContext[JsValue],
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
                env.dataStore.usagePlanRepo
                  .findByApi(tenant, api)
                  .map(s => s.sortBy(_.customName))
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
      ctx: DaikokuInternalActionMaybeWithoutUserContext[JsValue],
      parentId: Option[String],
      id: String,
      fields: Map[String, Any],
      jsonToCombine: Map[String, JsValue],
      req: Option[CmsRequestRendering]
  )(implicit env: Env, ec: ExecutionContext, messagesApi: MessagesApi) =
    env.dataStore.apiRepo
      .forTenant(tenant)
      .findByIdOrHrId(
        renderString(
          ctx,
          parentId,
          id,
          fields,
          jsonToCombine = jsonToCombine,
          req
        )
      )

  private def enrichHandlebarWithDocumentationEntity(
      ctx: DaikokuInternalActionMaybeWithoutUserContext[JsValue],
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
                      .map(
                        env.dataStore.apiDocumentationPageRepo
                          .forTenant(ctx.tenant)
                          .findById(_)
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
                    .map(
                      env.dataStore.apiDocumentationPageRepo
                        .forTenant(ctx.tenant)
                        .findById(_)
                    )
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

  private def combineFieldsToContext(
      ctx: DaikokuInternalActionMaybeWithoutUserContext[JsValue],
      context: Context.Builder,
      fields: Map[String, Any],
      jsonToCombine: Map[String, JsValue]
  )(implicit env: Env, messagesApi: MessagesApi): Context.Builder =
    (fields ++ jsonToCombine.map { case (key, value) =>
      (
        key,
        value match {
          case JsNull                   => null
          case boolean: JsBoolean       => boolean
          case JsNumber(value)          => value
          case JsString(value)          => value
          case JsArray(value)           => value
          case o @ JsObject(_) => o
        }
      )
    }).foldLeft(context) { (acc, item) =>
      if (item._1 == "email") {
        val content = Await.result(
          CmsPage(
            id = CmsPageId(IdGenerator.token(32)),
            tenant = tenant,
            visible = true,
            authenticated = false,
            name = "#generated",
            forwardRef = None,
            tags = List(),
            metadata = Map(),
            contentType = "text/html",
            body = item._2.toString,
            path = Some("/")
          ).render(
            ctx,
            fields = fields - "email",
            jsonToCombine = jsonToCombine - "email",
            req = None
          ),
          10.seconds
        )
        acc.combine(item._1, content._1)
      } else {
        acc.combine(item._1, item._2)
      }
    }

  private def searchCmsFile(
      req: CmsRequestRendering,
      page: CmsPage
  ): Option[CmsFile] = {
    req.content.find(p => p.path() == page.path.getOrElse(""))
  }

  def render(
      ctx: DaikokuInternalActionMaybeWithoutUserContext[JsValue],
      parentId: Option[String] = None,
      fields: Map[String, Any] = Map.empty,
      jsonToCombine: Map[String, JsValue] = Map.empty,
      req: Option[CmsRequestRendering]
  )(implicit env: Env, messagesApi: MessagesApi): Future[(String, String)] = {
    implicit val ec: ExecutionContext = env.defaultExecutionContext

    val page = forwardRef match {
      case Some(ref) => cmsFindByIdNotDeleted(ctx, ref.value, req).getOrElse(this)
      case None     => this
    }
    try {
      import com.github.jknack.handlebars.EscapingStrategy
      implicit val ec: ExecutionContextExecutor = CmsPage.pageRenderingEc

      if (
        page.authenticated && (ctx.user.isEmpty || ctx.user.exists(_.isGuest))
      )
        ctx.tenant.style.flatMap(_.authenticatedCmsPage) match {
          case Some(value) =>
            cmsFindById(ctx, value, req) match {
              case Some(value) =>
                value.render(ctx, parentId, fields, jsonToCombine, req)
              case None =>
                FastFuture.successful(("Need to be logged", page.contentType))
            }
          case None =>
            FastFuture.successful(("Need to be logged", page.contentType))
        }
      else if (parentId.nonEmpty && page.id.value == parentId.get)
        FastFuture.successful(("", page.contentType))
      else {
        val template = req match {
          case Some(value) if page.name != "#generated" =>
            searchCmsFile(value, page).map(_.content).getOrElse("")
          case _ => page.body
        }

        var contextBuilder = Context
          .newBuilder(this)
          .resolver(JsonNodeValueResolver.INSTANCE)
          .combine("tenant", ctx.tenant.asJson)
          .combine("is_admin", ctx.isTenantAdmin)
          .combine("connected", ctx.user.exists(!_.isGuest))
          .combine("user", ctx.user.map(u => u.asSimpleJson).getOrElse(""))
          .combine(
            "request",
            Json.obj(
              "path" -> ctx.requestPath,
              "method" -> ctx.requestMethod,
              "headers" -> ctx.requestHeaders
            )
          )
          .combine(
            "daikoku-css", {
              if (env.config.isDev)
                s"http://localhost:3000/daikoku.css"
              else if (env.config.isProd)
                s"${env.getDaikokuUrl(ctx.tenant, "/assets/react-app/daikoku.min.css")}"
            }
          )

        if (template.contains("{{apis}}")) {
          contextBuilder = contextBuilder.combine(
            "apis",
            Json.stringify(
              JsArray(
                Await
                  .result(
                    env.dataStore.apiRepo
                      .forTenant(ctx.tenant)
                      .findAllNotDeleted(),
                    10.seconds
                  )
                  .map(a => {
                    a.copy(
                      description = a.description.replaceAll("\n", "\\n"),
                      smallDescription =
                        a.smallDescription.replaceAll("\n", "\\n")
                    ).asJson
                  })
              )
            )
          )
        }

        if (template.contains("{{teams}}")) {
          contextBuilder = contextBuilder.combine(
            "teams",
            Json.stringify(
              JsArray(
                Await
                  .result(
                    env.dataStore.teamRepo
                      .forTenant(ctx.tenant)
                      .findAllNotDeleted(),
                    10.seconds
                  )
                  .map(a => {
                    a.copy(description = a.description.replaceAll("\n", "\\n"))
                      .asJson
                  })
              )
            )
          )
        }

        if (template.contains("{{users}}")) {
          contextBuilder = contextBuilder.combine(
            "users",
            Json.stringify(
              JsArray(
                Await
                  .result(
                    env.dataStore.userRepo.findAllNotDeleted(),
                    10.seconds
                  )
                  .map(_.toUiPayload())
              )
            )
          )
        }

        val context = combineFieldsToContext(
          ctx,
          contextBuilder,
          fields.map { case (key, value) =>
            (
              key,
              value match {
                case JsString(value) =>
                  value // remove quotes framing string
                case value => value
              }
            )
          },
          jsonToCombine
        )

        req match {
          case Some(value) if page.name != "#generated" =>
            searchCmsFile(value, page)
              .foreach(_.metadata.foreach(p => {
                context.combine(
                  p._1,
                  p._2 match {
                    case JsString(value) =>
                      value // remove quotes framing string
                    case value => value
                  }
                )
              }))
          case _ =>
        }

        val handlebars = new Handlebars().`with`(new EscapingStrategy() {
          override def escape(value: CharSequence): String = {
            value.toString
          }
        })

        handlebars.registerHelper(
          "for",
          (variable: String, options: Options) => {
            val s =
              renderString(ctx, parentId, variable, fields, jsonToCombine, req)
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
            val s =
              renderString(ctx, parentId, variable, fields, jsonToCombine, req)
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
              renderString(
                ctx,
                parentId,
                variable,
                fields,
                jsonToCombine,
                req
              ) ==
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
              renderString(
                ctx,
                parentId,
                variable,
                fields,
                jsonToCombine,
                req
              ) !=
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
            val str =
              renderString(ctx, parentId, variable, fields, jsonToCombine, req)
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
          "daikoku-query-param",
          (id: String, _: Options) =>
            ctx.requestQueryString
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

        val result = handlebars.compileInline(template).apply(c)
        c.destroy()

        FastFuture.successful((result, page.contentType))
      }
    } catch {
      case t: Throwable =>
        t.printStackTrace()
        FastFuture.successful(
          (
            s"""
          <!DOCTYPE html>
          <html>
            <body>
             <h1 style="text-align: center">Server error</h1>
             <div>
              <pre><code style="white-space: pre-line;font-size: 18px">${t.getMessage}</code></pre>
             <div>
           </body>
          </html>
          """,
            "text/html"
          )
        )
    }
  }
}
