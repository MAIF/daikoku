package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import daikoku.BuildInfo
import fr.maif.otoroshi.daikoku.actions.{DaikokuAction, DaikokuActionMaybeWithGuest, DaikokuActionMaybeWithoutUser, DaikokuActionMaybeWithoutUserContext}
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async.TenantAdminOnly
import fr.maif.otoroshi.daikoku.domain.{CmsPage, CmsPageId, DaikokuStyle, json}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.Errors
import play.api.libs.json.{JsError, JsObject, JsString, JsSuccess, Json}
import play.api.mvc._
import reactivemongo.bson.BSONObjectID

import scala.concurrent.Future

class HomeController(
    DaikokuActionMaybeWithoutUser: DaikokuActionMaybeWithoutUser,
    DaikokuActionMaybeWithGuest: DaikokuActionMaybeWithGuest,
    DaikokuAction: DaikokuAction,
    env: Env,
    cc: ControllerComponents)
    extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext
  implicit val e = env

  def actualIndex[A](ctx: DaikokuActionMaybeWithoutUserContext[A]): Future[Result] = {
    ctx.user match {
      case _ if ctx.request.uri.startsWith("/robots.txt") =>
        ctx.tenant.robotTxt match {
          case Some(robotTxt) => FastFuture.successful(Ok(views.txt.robot.render(robotTxt)))
          case None           => FastFuture.successful(NotFound(Json.obj("error" -> "robots.txt not found")))
        }
      case Some(_) =>
        if (ctx.request.uri == "/") {
          manageCmsHome(ctx,
            Ok(
              views.html.index(ctx.user.get,
                ctx.session.get,
                ctx.tenant,
                ctx.request.domain,
                env,
                ctx.isTenantAdmin,
                ctx.apiCreationPermitted))
          )
        } else
          FastFuture.successful(Ok(views.html.index(ctx.user.get, ctx.session.get, ctx.tenant,
              ctx.request.domain, env, ctx.isTenantAdmin, ctx.apiCreationPermitted)))
      case None if ctx.request.uri.startsWith("/signup") =>
        FastFuture.successful(Ok(views.html.unauthenticatedindex(ctx.tenant, ctx.request.domain, env)))
      case None if ctx.request.uri.startsWith("/reset") =>
        FastFuture.successful(Ok(views.html.unauthenticatedindex(ctx.tenant, ctx.request.domain, env)))
      case None if ctx.request.uri.startsWith("/2fa") =>
        FastFuture.successful(Ok(views.html.unauthenticatedindex(ctx.tenant, ctx.request.domain, env)))
      case None if ctx.request.uri == "/" =>
        manageCmsHome(ctx, Ok(views.html.unauthenticatedindex(ctx.tenant, ctx.request.domain, env)))
      case _ => manageCmsHome(ctx, Redirect("/"))
    }
  }

  private def manageCmsHome[A](ctx: DaikokuActionMaybeWithoutUserContext[A], redirectTo: Result) = {
    ctx.tenant.style match {
      case Some(value) if value.homePageVisible =>
        value.homeCmsPage match {
          case Some(pageId) => cmsPageByIdWithoutAction(ctx, pageId)
          case _ => FastFuture.successful(redirectTo)
        }
      case _ => FastFuture.successful(redirectTo)
    }
  }

  def index() = DaikokuActionMaybeWithoutUser.async { ctx =>
      actualIndex(ctx)
  }

  def indexWithPath(path: String) = DaikokuActionMaybeWithoutUser.async { ctx =>
    actualIndex(ctx)
  }

  def health() = DaikokuActionMaybeWithGuest { ctx =>
    ctx.request.headers.get("Otoroshi-Health-Check-Logic-Test") match {
      //todo: better health check
      case Some(value) =>
        Ok.withHeaders(
          "Otoroshi-Health-Check-Logic-Test-Result" -> (value.toLong + 42L).toString)
      case None => BadRequest
    }
  }

  def getDaikokuVersion() = DaikokuActionMaybeWithoutUser { ctx =>
    Ok(Json.obj("version" -> BuildInfo.version))
  }

  private def getMatchingRoutes(path: String, cmsPaths: Seq[(String, CmsPage)], strictMode: Boolean = false): Seq[CmsPage] = {
    val paths = path
      .replace("/_", "")
      .split("/")
      .filter(_.nonEmpty)

    println("Search for : " + paths.mkString("|"))

    var matched = false

    paths.foldLeft(cmsPaths.map(r => (
      r._1.replace("/_/", "").split("/") ++ Array(if(r._2.exact) "" else "*"),
      r._2
    ))
      .map(p => (p._1.filter(_.nonEmpty), p._2))
      .filter(p => p._1.nonEmpty)
    ) { (paths, path) => {
      println(
        "Loop",
        paths.map(p => "(" + p._1.mkString("|") + ")")
      )
        if (paths.isEmpty || matched)
          paths
        else {
          val matchingRoutes = paths.filter(p => p._1.nonEmpty && (p._1.head == path || p._1.head == "*"))
          println("matchingRoutes", paths.map(p => "(" + p._1.mkString("|") + ")"), path)
          if (matchingRoutes.nonEmpty)
            matchingRoutes.map(p => (p._1.tail, p._2))
          else  {
            val matchingRoute = paths.find(p => p._1.isEmpty)
            println("acc : " + paths.map(p => "(" + p._1.mkString("|") + ")"), paths.length, path)
            if(matchingRoute.nonEmpty && !strictMode) {
              matched = true
              Seq(matchingRoute.get)
            } else
              Seq()
          }
        }
    }}.map(_._2)
  }

  def cmsPageByPath(path: String) = DaikokuActionMaybeWithoutUser.async { ctx =>
    val actualPath = if (path.startsWith("/")) {
      path
    } else {
      s"/$path"
    }
    env.dataStore.cmsRepo.forTenant(ctx.tenant).findOneNotDeleted(Json.obj("path" -> actualPath)).flatMap {
      case None =>
        env.dataStore.cmsRepo.forTenant(ctx.tenant).findAllNotDeleted()
          .map(cmsPages => cmsPages.filter(p => p.path.exists(_.nonEmpty)))
          .flatMap(cmsPages => {
            val strictPage = getMatchingRoutes(ctx.request.path, cmsPages.filter(p => p.exact && p.path.nonEmpty).map(p => (p.path.get, p)), true)

            val page = if(strictPage.nonEmpty)
              strictPage
            else
              getMatchingRoutes(ctx.request.path, cmsPages
                .filter(p => !p.exact && p.path.nonEmpty).map(p => (p.path.get, p)))

            println("Matched strict route : " + strictPage.headOption.map(_.path.get).getOrElse("null"))
            println("Matched non strict route : " + page.headOption.map(_.path.get).getOrElse("null"))

            page.headOption match {
              case Some(r) if r.authenticated && ctx.user.isEmpty => redirectToLoginPage(ctx)
              case Some(r) => r.render(ctx, None, ctx.request.getQueryString("draft").contains("true"))(env).map(res => Ok(res._1).as(res._2))
              case None => cmsPageNotFound(ctx)
            }
          })
      case Some(page) if !page.visible => cmsPageNotFound(ctx)
      case Some(page) if page.authenticated && ctx.user.isEmpty => redirectToLoginPage(ctx)
      case Some(page) => page.render(ctx, None, ctx.request.getQueryString("draft").contains("true"))(env).map(res => Ok(res._1).as(res._2))
    }
  }

  private def redirectToLoginPage[A](ctx: DaikokuActionMaybeWithoutUserContext[A]) =
    FastFuture.successful(Redirect(s"/auth/${ctx.tenant.authProvider.name}/login?redirect=${ctx.request.path}"))

  private def cmsPageNotFound[A](ctx: DaikokuActionMaybeWithoutUserContext[A]): Future[Result] = {
    val optionFoundPage: Option[DaikokuStyle] = ctx.tenant.style
      .find(p => p.homePageVisible && p.notFoundCmsPage.nonEmpty)

      optionFoundPage match {
        case Some(p) => env.dataStore.cmsRepo.forTenant(ctx.tenant).findById(p.notFoundCmsPage.get).flatMap {
          case Some(page) =>
            page.render(ctx).map(res => Ok(res._1).as(res._2))
          case _ => Errors.craftResponseResult("Page not found !", Results.NotFound, ctx.request, None, env)
        }
        case _ => Errors.craftResponseResult("Page not found !", Results.NotFound, ctx.request, None, env)
      }
  }

  private def cmsPageByIdWithoutAction[A](ctx: DaikokuActionMaybeWithoutUserContext[A], id: String) = {
    env.dataStore.cmsRepo.forTenant(ctx.tenant).findByIdNotDeleted(id).flatMap {
      case None => FastFuture.successful(NotFound(Json.obj("error" -> "page not found !")))
      case Some(page) if !page.visible => FastFuture.successful(NotFound(Json.obj("error" -> "page not found !")))
      case Some(page) if page.authenticated && ctx.user.isEmpty => FastFuture.successful(Redirect(s"/auth/${ctx.tenant.authProvider.name}/login?redirect=${ctx.request.path}"))
      case Some(page) => page.render(ctx, None, ctx.request.getQueryString("draft").contains("true"))(env).map(res => Ok(res._1).as(res._2))
    }
  }

  def cmsPageById(id: String) = DaikokuActionMaybeWithoutUser.async { ctx =>
    cmsPageByIdWithoutAction(ctx, id)
  }

  def createCmsPageWithName(name: String) = DaikokuAction.async { ctx =>
    TenantAdminOnly(
      AuditTrailEvent("@{user.name} has created a cms page with name"))(
      ctx.tenant.id.value,
      ctx) { (tenant, _) => {
        val page = CmsPage(
          id = CmsPageId(BSONObjectID.generate().stringify),
          tenant = tenant.id,
          visible = true,
          authenticated = false,
          name = name,
          forwardRef = None,
          tags = List(),
          metadata = Map(),
          contentType = "text/html",
          body = "<DOCTYPE html>\n<html>\n<head></head>\n<body>\n</body>\n</html>",
          path = Some("/" + BSONObjectID.generate().stringify)
        )
        env.dataStore.cmsRepo.forTenant(tenant)
          .save(page)
          .map {
            case true => Created(page.asJson)
            case false => BadRequest(Json.obj("error" -> "Error when creating cms page"))
          }
      }
    }
  }

  def createCmsPage() = DaikokuAction.async(parse.json) { ctx =>
    TenantAdminOnly(
      AuditTrailEvent("@{user.name} has created a cms page"))(
      ctx.tenant.id.value,
      ctx) { (tenant, _) => {
        val body =  ctx.request.body.as[JsObject]
        val cmsPage = body ++
          Json.obj("_id" -> JsString((body \ "id").asOpt[String].getOrElse(BSONObjectID.generate().stringify))) ++
          Json.obj("_tenant" -> tenant.id.value)
        json.CmsPageFormat.reads(cmsPage) match {
          case JsSuccess(page, _) =>
           env.dataStore.cmsRepo.forTenant(tenant)
              .save(page)
              .map {
                case true => Created(Json.obj("created" -> true))
                case false => BadRequest(Json.obj("error" -> "Error when creating cms page"))
              }
          case e: JsError => FastFuture.successful(BadRequest(JsError.toJson(e)))
        }
      }
    }
  }

  def updateCmsPage(id: String) = DaikokuAction.async(parse.json) { ctx =>
    TenantAdminOnly(
      AuditTrailEvent("@{user.name} has updated a cms page"))(
      ctx.tenant.id.value,
      ctx) { (_, _) =>
      FastFuture.successful(Ok(Json.obj("" -> "")))
    }
  }

  def deleteCmsPage(id: String) = DaikokuAction.async { ctx =>
    TenantAdminOnly(
      AuditTrailEvent("@{user.name} has removed a cms page"))(
      ctx.tenant.id.value,
      ctx) { (tenant, _) =>
      env.dataStore.cmsRepo.forTenant(tenant)
        .deleteByIdLogically(id)
        .map {
          case true => Ok(Json.obj("created" -> true))
          case false => BadRequest(Json.obj("error" -> "Unable to remove the cms page"))
        }
    }
  }
}
