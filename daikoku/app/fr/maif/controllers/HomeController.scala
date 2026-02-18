package fr.maif.controllers

import cats.implicits.catsSyntaxOptionId
import controllers.Assets
import fr.maif.daikoku.BuildInfo
import fr.maif.actions.{DaikokuAction, DaikokuActionMaybeWithGuest, DaikokuActionMaybeWithoutUser, DaikokuActionMaybeWithoutUserContext}
import fr.maif.audit.AuditTrailEvent
import fr.maif.controllers.authorizations.async.TenantAdminOnly
import fr.maif.domain._
import fr.maif.domain.json.CmsRequestRenderingFormat
import fr.maif.env.Env
import fr.maif.utils.Errors
import fr.maif.utils.future.EnhancedObject
import org.apache.pekko.http.scaladsl.util.FastFuture
import play.api.i18n.{I18nSupport, MessagesApi}
import play.api.libs
import play.api.libs.json._
import play.api.mvc._
import fr.maif.services.{CmsPage, CmsRequestRendering}

import scala.collection.mutable
import scala.concurrent.{ExecutionContext, Future}
import scala.util.matching.Regex

import fr.maif.controllers.{routes => daikokuRoutes}

class HomeController(
    DaikokuActionMaybeWithoutUser: DaikokuActionMaybeWithoutUser,
    DaikokuActionMaybeWithGuest: DaikokuActionMaybeWithGuest,
    DaikokuAction: DaikokuAction,
    env: Env,
    cc: ControllerComponents,
    assets: Assets
) extends AbstractController(cc)
    with I18nSupport {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val e: Env = env
  implicit val m: MessagesApi = messagesApi

  def index() =
    DaikokuActionMaybeWithoutUser.async { ctx =>
      ctx.tenant.style match {
        case Some(value) if value.homePageVisible =>
          (value.homeCmsPage, value.notFoundCmsPage) match {
            case (Some(pageId), _) =>
              cmsPageByIdWithoutAction(ctx, pageId)
            case (_, Some(notFoundPage)) =>
              cmsPageByIdWithoutAction(ctx, notFoundPage)
            case _ if env.config.isDev =>
              FastFuture.successful(
                Redirect(env.getDaikokuUrl(ctx.tenant, "/apis"))
              )
            case _ =>
              assets.at("index.html").apply(ctx.request)
          }
        case _ if env.config.isDev =>
          FastFuture.successful(
            Redirect(env.getDaikokuUrl(ctx.tenant, "/apis"))
          )
        case _ =>
          assets.at("index.html").apply(ctx.request)
      }
    }

  def indexForRobots() =
    DaikokuActionMaybeWithoutUser.async { ctx =>
      ctx.tenant.robotTxt match {
        case Some(robotTxt) =>
          FastFuture.successful(Ok(views.txt.robot.render(robotTxt)))
        case None =>
          FastFuture.successful(
            NotFound(Json.obj("error" -> "robots.txt not found"))
          )
      }
    }

  def indexWithPath(path: String) =
    DaikokuActionMaybeWithoutUser.async { ctx =>
      assets.at("index.html").apply(ctx.request)
    }
  def indexWithoutPath() =
    DaikokuActionMaybeWithoutUser.async { ctx =>
      assets.at("index.html").apply(ctx.request)
    }

  def status() =
    DaikokuActionMaybeWithoutUser.async { ctx =>
      for {
        maybeTenant <- env.dataStore.tenantRepo.findById(ctx.tenant.id)
      } yield {
        val isReady = maybeTenant.isDefined
        val databaseStatus = maybeTenant.map(_ => "OK").getOrElse("KO")
        val responseJson = Json.obj(
          "status" -> (if (isReady) "ready" else "initializing"),
          "version" -> BuildInfo.version,
          "database" -> Json.obj(
            "status" -> databaseStatus
          ),
          "timestamp" -> java.time.Instant.now().toString
        )

        if (isReady)
          Ok(responseJson)
        else
          ServiceUnavailable(responseJson)
      }
    }

  def health() =
    DaikokuActionMaybeWithGuest.async { ctx =>
      ctx.request.headers.get("Otoroshi-Health-Check-Logic-Test") match {
        // todo: better health check
        case Some(value) =>
          Ok.withHeaders(
            "Otoroshi-Health-Check-Logic-Test-Result" -> (value.toLong + 42L).toString
          ).future
        case None =>
          Ok(
            Json.obj(
              "tenantMode" -> ctx.tenant.tenantMode
                .getOrElse(TenantMode.Default)
                .name
            )
          ).future
      }
    }

  def getDaikokuVersion() =
    DaikokuActionMaybeWithoutUser.async { ctx =>
      Ok(Json.obj("version" -> BuildInfo.version)).future
    }

  def getConnectedUser() = {
    DaikokuActionMaybeWithoutUser.async { ctx =>
      Ok(
        Json.obj(
          "connectedUser" -> ctx.user
            .map(_.toUiPayload())
            .getOrElse(JsNull)
            .as[JsValue],
          "impersonator" -> ctx.session
            .map(_.impersonatorJson())
            .getOrElse(JsNull)
            .as[JsValue],
          "session" -> ctx.session
            .map(_.asSimpleJson)
            .getOrElse(JsNull)
            .as[JsValue],
          "tenant" -> ctx.tenant.toUiPayload(env),
          "isTenantAdmin" -> ctx.isTenantAdmin,
          "apiCreationPermitted" -> ctx.apiCreationPermitted,
          "loginAction" -> fr.maif.controllers.routes.LoginController
            .login(ctx.tenant.authProvider.name)
            .url,
          "graphQLEndpoint" -> env.getDaikokuUrl(
            ctx.tenant,
            fr.maif.controllers.routes.GraphQLController
              .search()
              .url
          )
        )
      ).future
    }
  }

  private def getMatchingRoutes(
      path: String,
      cmsPaths: Seq[(String, CmsPage)],
      strictMode: Boolean = false
  ): (Seq[CmsPage], Map[String, JsValue]) = {
    val paths = path
      .replace("/_", "")
      .split("/")
      .filter(_.nonEmpty)

    if (paths.isEmpty)
      (Seq(), Map.empty)
    else {
      var matched = false

      val formatted_paths: Seq[(Array[String], CmsPage)] = cmsPaths
        .map(r =>
          (
            r._1.replace("/_/", "").split("/") ++ Array(
              if (r._2.exact) "" else "*"
            ),
            r._2
          )
        )
        .map(p => (p._1.filter(_.nonEmpty), p._2))
        .filter(p => p._1.nonEmpty)
        .sortBy(_._1.length)

      val params = mutable.Map[String, JsValue]()

      (
        paths
          .foldLeft(
            formatted_paths
          ) { (paths, path) =>
            {
              if (paths.isEmpty || matched)
                paths
              else {
                val matchingRoutes: Seq[(Array[String], CmsPage)] =
                  paths.filter(p => {
                    if (p._1.isEmpty) {
                      false
                    } else {
                      val path_path = p._1.head
                      if (path_path == path || path_path == "*") {
                        true
                      } else {
                        val pattern = new Regex("\\[\\w+\\]")

                        pattern.findFirstMatchIn(path_path) match {
                          case Some(matched) =>
                            val key = matched.matched
                              .substring(1, matched.matched.length - 1)
                            params += (key -> JsString(path))

                            true
                          case None =>
                            false
                        }
                      }
                    }
                  })

                if (matchingRoutes.nonEmpty)
                  matchingRoutes.map(p => (p._1.tail, p._2))
                else {
                  val matchingRoute = paths.find(p => p._1.isEmpty)
                  if (matchingRoute.nonEmpty && !strictMode) {
                    matched = true
                    Seq(matchingRoute.get)
                  } else
                    Seq()
                }
              }
            }
          }
          .map(_._2),
        params.toMap
      )
    }
  }

  def renderCmsPageFromBody(path: String) =
    DaikokuActionMaybeWithoutUser.async(parse.json) { ctx =>
      val req = ctx.request.body.as[JsObject].as(CmsRequestRenderingFormat)

      val currentPage = req.content.find(_.path() == req.current_page)

      currentPage match {
        case Some(r)
            if r.authenticated() && (ctx.user.isEmpty || ctx.user.exists(
              _.isGuest
            )) =>
          redirectToLoginPage(ctx)
        case Some(r) if !r.visible() => cmsPageNotFound(ctx)
        case Some(page) =>
          render(ctx, page.toCmsPage(ctx.tenant.id), Some(req), req.fields)
        case None => cmsPageNotFound(ctx)
      }
    }

  private def renderCmsPage[A](
      ctx: DaikokuActionMaybeWithoutUserContext[A],
      page: Option[CmsPage],
      fields: Map[String, JsValue]
  ) = {
    page match {
      case Some(r)
          if r.authenticated && (ctx.user.isEmpty || ctx.user
            .exists(_.isGuest)) =>
        redirectToLoginPage(ctx)
      case Some(r) => render(ctx, r, fields = fields)
      case None    => cmsPageNotFound(ctx)
    }
  }

  def cmsPageByPath(path: String, page: Option[CmsPage] = None) =
    DaikokuActionMaybeWithoutUser.async {
      (ctx: DaikokuActionMaybeWithoutUserContext[AnyContent]) =>
        val actualPath = if (path.startsWith("/")) {
          path
        } else {
          s"/$path"
        }

        env.dataStore.cmsRepo
          .forTenant(ctx.tenant)
          .findOneNotDeleted(Json.obj("path" -> actualPath))
          .flatMap {
            case None =>
              env.dataStore.cmsRepo
                .forTenant(ctx.tenant)
                .findAllNotDeleted()
                .map(cmsPages =>
                  cmsPages.filter(p => p.path.exists(_.nonEmpty))
                )
                .flatMap((cmsPages) => {
                  val strictPage =
                    getMatchingRoutes(
                      ctx.request.path,
                      cmsPages
                        .filter(p => p.exact && p.path.nonEmpty)
                        .map(p => (p.path.get, p)),
                      strictMode = true
                    )

                  val (page, urlSearchParams) =
                    if (strictPage._1.nonEmpty)
                      strictPage
                    else
                      getMatchingRoutes(
                        ctx.request.path,
                        cmsPages
                          .filter(p => !p.exact && p.path.nonEmpty)
                          .map(p => (p.path.get, p))
                      )

                  renderCmsPage(ctx, page.headOption, urlSearchParams)
                })
            case Some(page) if !page.visible => cmsPageNotFound(ctx)
            case Some(page) if page.authenticated && ctx.user.isEmpty =>
              redirectToLoginPage(ctx)
            case Some(page) =>
              val uri = ctx.request.uri
              if (
                uri.contains("/mails/") && !uri.contains(
                  "/mails/root/tenant-mail-template"
                )
              ) {
                env.dataStore.cmsRepo
                  .forTenant(ctx.tenant)
                  .findById("-mails-root-tenant-mail-template-fr")
                  .flatMap {
                    case None => render(ctx, page)
                    case Some(layout) =>
                      val fields = Map("email" -> JsString(page.body))
                      render(ctx, layout, fields = fields)
                  }
              } else {
                render(ctx, page)
              }
          }
    }

  private def redirectToLoginPage[A](
      ctx: DaikokuActionMaybeWithoutUserContext[A]
  ) =
    FastFuture.successful(
      Redirect(
        s"/auth/${ctx.tenant.authProvider.name}/login?redirect=${ctx.request.path}"
      )
    )

  private def cmsPageNotFound[A](
      ctx: DaikokuActionMaybeWithoutUserContext[A]
  ): Future[Result] = {
    val optionFoundPage: Option[DaikokuStyle] = ctx.tenant.style
      .find(p => p.homePageVisible && p.notFoundCmsPage.nonEmpty)

    optionFoundPage match {
      case Some(p) =>
        env.dataStore.cmsRepo
          .forTenant(ctx.tenant)
          .findById(p.notFoundCmsPage.get)
          .flatMap {
            case Some(page) =>
              page
                .render(
                  page.maybeWithoutUserToUserContext(
                    ctx.tenant,
                    ctx.request.asInstanceOf[Request[libs.json.JsValue]].some,
                    ctx.user,
                    ctx.session,
                    ctx.impersonator,
                    ctx.isTenantAdmin,
                    ctx.apiCreationPermitted,
                    ctx.ctx
                  ),
                  req = None
                )
                .map(res => Ok(res._1).as(res._2))
            case _ =>
              Errors.craftResponseResultF(
                "Page not found !",
                Results.NotFound
              )
          }
      case _ =>
        Errors.craftResponseResultF(
          "Page not found !",
          Results.NotFound
        )
    }
  }

  private def render[A](
      ctx: DaikokuActionMaybeWithoutUserContext[A],
      r: CmsPage,
      req: Option[CmsRequestRendering] = None,
      fields: Map[String, JsValue] = Map.empty[String, JsValue]
  ) = {
    r.render(
      r.maybeWithoutUserToUserContext(
        ctx.tenant,
        ctx.request.asInstanceOf[Request[libs.json.JsValue]].some,
        ctx.user,
        ctx.session,
        ctx.impersonator,
        ctx.isTenantAdmin,
        ctx.apiCreationPermitted,
        ctx.ctx
      ),
      None,
      req = req,
      fields = fields,
      jsonToCombine = fields
    ).map(res => {
      Ok(res._1).as(res._2)
    })
  }

  private def cmsPageByIdWithoutAction[A](
      ctx: DaikokuActionMaybeWithoutUserContext[A],
      id: String,
      fields: Map[String, JsValue] = Map.empty
  ) = {
    env.dataStore.cmsRepo.forTenant(ctx.tenant).findByIdNotDeleted(id).flatMap {
      case None                        => cmsPageNotFound(ctx)
      case Some(page) if !page.visible => cmsPageNotFound(ctx)
      case Some(page) if page.authenticated && ctx.user.isEmpty =>
        FastFuture.successful(
          Redirect(
            s"/auth/${ctx.tenant.authProvider.name}/login?redirect=${ctx.request.path}"
          )
        )
      case Some(page) => render(ctx, page, fields = fields)
    }
  }

  def cmsPageById(id: String) =
    DaikokuActionMaybeWithoutUser.async { ctx =>
      cmsPageByIdWithoutAction(ctx, id)
    }

  def advancedRenderCmsPageById(id: String) =
    DaikokuActionMaybeWithoutUser.async(parse.json) { ctx =>
      cmsPageByIdWithoutAction(
        ctx,
        id,
        fields = ctx.request.body
          .asOpt[JsObject]
          .flatMap(body => (body \ "fields").asOpt[Map[String, JsValue]])
          .getOrElse(Map.empty[String, JsValue])
      )
    }

  def deleteCmsPage(id: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(AuditTrailEvent("@{user.name} has removed a cms page"))(
        ctx.tenant.id.value,
        ctx
      ) { (tenant, _) =>
        env.dataStore.cmsRepo
          .forTenant(tenant)
          .deleteByIdLogically(id)
          .map {
            case true => Ok(Json.obj("created" -> true))
            case false =>
              BadRequest(Json.obj("error" -> "Unable to remove the cms page"))
          }
      }
    }

  def getCmsPage(id: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent("@{user.name} get the cms page @{pageName}")
      )(ctx.tenant.id.value, ctx) { (tenant, _) =>
        {
          env.dataStore.cmsRepo
            .forTenant(tenant)
            .findById(id)
            .map {
              case None => NotFound(Json.obj("error" -> "cms page not found"))
              case Some(page) => Ok(page.asJson)
            }
        }
      }
    }
}
