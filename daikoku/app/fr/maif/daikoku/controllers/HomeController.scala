package fr.maif.daikoku.controllers

import cats.implicits.catsSyntaxOptionId
import controllers.Assets
import fr.maif.daikoku.BuildInfo
import fr.maif.daikoku.actions.{DaikokuAction, DaikokuActionMaybeWithGuest, DaikokuUnauthenticatedAction, DaikokuUnauthenticatedActionContext}
import fr.maif.daikoku.audit.AuditTrailEvent
import fr.maif.daikoku.controllers.authorizations.async.TenantAdminOnly
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.domain.json.CmsRequestRenderingFormat
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.logger.AppLogger
import fr.maif.daikoku.utils.{Errors, OtoroshiClient, S3Configuration}
import fr.maif.daikoku.utils.future.EnhancedObject
import org.apache.pekko.http.scaladsl.util.FastFuture
import play.api.i18n.{I18nSupport, MessagesApi}
import play.api.libs
import play.api.libs.json.*
import play.api.mvc.*
import fr.maif.daikoku.services.{CmsPage, CmsRequestRendering}

import scala.collection.mutable
import scala.concurrent.{ExecutionContext, Future}
import scala.util.matching.Regex
import fr.maif.daikoku.storage.drivers.postgres.PostgresDataStore
import io.vertx.core.json.JsonObject
import org.apache.pekko.stream.connectors.s3.BucketAccess

enum ServiceStatus(val value: String):
  case Up extends ServiceStatus("UP")
  case Down extends ServiceStatus("DOWN")
  case Absent extends ServiceStatus("ABSENT")


class HomeController(
    DaikokuUnauthenticatedAction: DaikokuUnauthenticatedAction,
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
    DaikokuUnauthenticatedAction.async { ctx =>
      ctx.tenant.style match {
        case Some(value) if value.homePageVisible =>
          (value.homeCmsPage, value.notFoundCmsPage) match {
            case (Some(pageId), _) =>
              cmsPageByIdWithoutAction(ctx, entity = CmsPageId(pageId))
            case (_, Some(notFoundPage)) =>
              cmsPageByIdWithoutAction(ctx, entity = CmsPageId(notFoundPage))
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

  // todo: handle case of maintenance mode
  def indexForRobots() =
    DaikokuUnauthenticatedAction.async { ctx =>
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
    DaikokuUnauthenticatedAction.async { ctx =>
      assets.at("index.html").apply(ctx.request)
    }
  def indexWithoutPath() =
    DaikokuUnauthenticatedAction.async { ctx =>
      assets.at("index.html").apply(ctx.request)
    }

  def health(): Action[AnyContent] = {
    Action.async { ctx =>
      ctx.headers.get("Otoroshi-Health-Check-Logic-Test") match {
        case Some(value) => Ok.withHeaders(
          "Otoroshi-Health-Check-Logic-Test-Result" -> (value.toLong + 42L).toString
        ).future
        case None => (env.dataStore match {
          case dataStore: PostgresDataStore =>
            dataStore
              .checkDatabase()
              .map(_ => ServiceStatus.Up)
        })
          .recover { case _ => ServiceStatus.Down }
          .map(status => Ok(Json.obj("status" -> (status match {
            case ServiceStatus.Up => "ready"
            case _ => "initializing"
          }))))
      }
    }
  }

  def healthDetailed(): Action[AnyContent] = {
    Action.async { ctx =>
      println(env.config.detailedHealthAccessKey)
      ctx.getQueryString("access_key") match {
        case Some(key) if env.config.detailedHealthAccessKey.contains(key) => {
          val datastoreHealth = env.dataStore match {
            case dataStore: PostgresDataStore =>
              dataStore
                .checkDatabase()
                .map(_ => ServiceStatus.Up)
          }
          env.dataStore.tenantRepo
            .findAll()
            .flatMap(tenantList =>
              datastoreHealth
                .zip(
                  Future.sequence(
                    tenantList.map { (tenant: Tenant) =>
                      for {
                        mailerHealth <- tenant.mailer
                          .testConnection(tenant) map (b =>
                          if (b) ServiceStatus.Up else ServiceStatus.Down
                          )

                        s3HealthFuture =
                          tenant.bucketSettings match {
                            case None =>
                              Future.successful(ServiceStatus.Absent)
                            case Some(cfg: S3Configuration) =>
                              env.assetsStore.checkBucket()(using cfg).map {
                                case BucketAccess.AccessDenied => ServiceStatus.Down
                                case BucketAccess.AccessGranted => ServiceStatus.Up
                                case BucketAccess.NotExists => ServiceStatus.Absent
                              }
                          }
                        s3Health <- s3HealthFuture

                        otoroshiHealth <- {
                          val checks =
                            tenant.otoroshiSettings.map { otoSettings =>
                              OtoroshiClient(env)
                                .getApikey(otoSettings.clientId)(using otoroshiSettings =
                                  otoSettings
                                )
                                .map { _ =>
                                  (otoSettings, ServiceStatus.Up)
                                }
                                .recover { case _ => (otoSettings, ServiceStatus.Down)}
                            }
                          Future.sequence(checks)
                        }

                      } yield Json.obj(
                        "tenantName" -> tenant.name,
                        "tenantMode" -> tenant.tenantMode.map(_.name).getOrElse(TenantMode.Default.name),
                        "status" -> Json.obj(
                          "mailer" -> mailerHealth.value,
                          "S3" -> s3Health.value,
                          "otoroshi" -> JsArray(otoroshiHealth.map(oto => Json.obj(s"${oto._1.url} (${oto._1.host})" -> oto._2.value )).toSeq)
                        )
                      )
                    }
                  )
                )
                .map { case (datastore, results) =>
                  val resultObj = results.foldLeft(Json.obj()) { (acc, item) =>
                    val tenantName = (item \ "tenantName").as[String]
                    val withoutNom = item.as[JsObject] - "tenantName"
                    acc + (tenantName -> withoutNom)
                  }
                  Ok(Json.obj(
                    "status" -> datastore.value,
                    "datastore" -> datastore.value,
                    "version" -> BuildInfo.version,
                  ) ++ resultObj)
                }
                .recover { case _ => Ok(Json.obj("status" -> ServiceStatus.Down.value)) }
            )
        }
        case _ => AppError.Unauthorized.renderF()
      }






    }
  }

  def getDaikokuVersion() =
    Action.async { _ =>
      Ok(Json.obj("version" -> BuildInfo.version)).future
    }

  def getConnectedUser(): Action[AnyContent] = {
    DaikokuActionMaybeWithGuest.async { ctx =>
      Ok(
        Json.obj(
          "connectedUser" -> ctx.user
            .toUiPayload(),
          "impersonator" -> ctx.session.impersonatorJson(),
          "session" -> ctx.session.asSimpleJson,
          "tenant" -> ctx.tenant.toUiPayload(env),
          "isTenantAdmin" -> ctx.isTenantAdmin,
          "apiCreationPermitted" -> ctx.apiCreationPermitted,
          "loginAction" -> fr.maif.daikoku.controllers.routes.LoginController
            .login(ctx.tenant.authProvider.name)
            .url,
          "graphQLEndpoint" -> env.getDaikokuUrl(
            ctx.tenant,
            fr.maif.daikoku.controllers.routes.GraphQLController
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
    DaikokuUnauthenticatedAction.async(parse.json) { ctx =>
      val req = ctx.request.body.as[JsObject].as(using CmsRequestRenderingFormat)

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
      ctx: DaikokuUnauthenticatedActionContext[A],
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

  def cmsMaintenancePage(): Unit = {
    DaikokuUnauthenticatedAction.async { ctx =>
      Ok(
        Json.obj("version" -> BuildInfo.version)
      ).future
    }
  }

  def cmsPageByPath(path: String, page: Option[CmsPage] = None) =
    DaikokuUnauthenticatedAction.async {
      (ctx: DaikokuUnauthenticatedActionContext[AnyContent]) =>
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
                .flatMap(cmsPages => {
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
      ctx: DaikokuUnauthenticatedActionContext[A]
  ) =
    FastFuture.successful(
      Redirect(
        s"/auth/${ctx.tenant.authProvider.name}/login?redirect=${ctx.request.path}"
      )
    )

  private def cmsPageNotFound[A](
      ctx: DaikokuUnauthenticatedActionContext[A]
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
      ctx: DaikokuUnauthenticatedActionContext[A],
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
                                           ctx: DaikokuUnauthenticatedActionContext[A],
                                           entity: CmsPageId | Path,
                                           fields: Map[String, JsValue] = Map.empty) = {
    val maybePage = entity match {
      case id: CmsPageId => env.dataStore.cmsRepo.forTenant(ctx.tenant).findByIdNotDeleted(id)
      case path: Path => env.dataStore.cmsRepo.forTenant(ctx.tenant).findOneNotDeleted(Json.obj("path" -> path))
    }

    maybePage.flatMap {
      case None => cmsPageNotFound(ctx)
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

  type Path = String
  def getCmsPageById(id: String) =
    DaikokuUnauthenticatedAction.async { ctx =>
      cmsPageByIdWithoutAction(ctx, entity = CmsPageId(id))
    }

  def getCmsPageByPath(path: Option[String] = None) =
    DaikokuUnauthenticatedAction.async { ctx =>
      path match {
        case Some(_path) => cmsPageByIdWithoutAction(ctx, _path)
        case None => AppError.EntityNotFound("cms page").renderF()
      }
    }

  def advancedRenderCmsPageById(id: String) =
    DaikokuUnauthenticatedAction.async(parse.json) { ctx =>
      cmsPageByIdWithoutAction(
        ctx,
        entity = CmsPageId(id),
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
