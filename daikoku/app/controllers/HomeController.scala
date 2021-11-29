package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import daikoku.BuildInfo
import fr.maif.otoroshi.daikoku.actions.{DaikokuAction, DaikokuActionMaybeWithGuest, DaikokuActionMaybeWithoutUser, DaikokuActionMaybeWithoutUserContext}
import fr.maif.otoroshi.daikoku.domain.{CmsPage, CmsPageId, TenantId}
import fr.maif.otoroshi.daikoku.env.Env
import play.api.libs.json.Json
import play.api.mvc._

class HomeController(
    DaikokuActionMaybeWithoutUser: DaikokuActionMaybeWithoutUser,
    DaikokuActionMaybeWithGuest: DaikokuActionMaybeWithGuest,
    env: Env,
    cc: ControllerComponents)
    extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext

  def actualIndex[A](ctx: DaikokuActionMaybeWithoutUserContext[A]): Result = {
    ctx.user match {
      case Some(_) =>
        Ok(
          views.html.index(ctx.user.get,
                           ctx.session.get,
                           ctx.tenant,
                           ctx.request.domain,
                           env,
                           ctx.isTenantAdmin,
                           ctx.apiCreationPermitted))
      case None if ctx.request.uri.startsWith("/signup") =>
        Ok(views.html.unauthenticatedindex(ctx.tenant, ctx.request.domain, env))
      case None if ctx.request.uri.startsWith("/reset") =>
        Ok(views.html.unauthenticatedindex(ctx.tenant, ctx.request.domain, env))
      case None if ctx.request.uri.startsWith("/2fa") =>
        Ok(views.html.unauthenticatedindex(ctx.tenant, ctx.request.domain, env))
      case None if ctx.request.uri == "/" =>
        Ok(views.html.unauthenticatedindex(ctx.tenant, ctx.request.domain, env))
      case _ => Redirect("/")
    }
  }

  def index() = DaikokuActionMaybeWithoutUser { ctx =>
    actualIndex(ctx)
  }

  def indexWithPath(path: String) = DaikokuActionMaybeWithoutUser { ctx =>
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

  def cmsPageByPath(path: String) = DaikokuActionMaybeWithoutUser.async { ctx =>
    val actualPath = s"/$path"
    env.dataStore.cmsRepo.forTenant(ctx.tenant).findOneNotDeleted(Json.obj("path" -> actualPath)).flatMap {
      case None => FastFuture.successful(NotFound(Json.obj("error" -> "page not found !")))
      case Some(page) if !page.visible => FastFuture.successful(NotFound(Json.obj("error" -> "page not found !")))
      case Some(page) if page.authenticated && ctx.user.isEmpty => FastFuture.successful(Redirect(s"/auth/${ctx.tenant.authProvider.name}/login?redirect=${ctx.request.path}"))
      case Some(page) => page.render(ctx)(env).map(res => Ok(res._1).as(res._2))
    }
  }

  def cmsPageById(id: String) = DaikokuActionMaybeWithoutUser.async { ctx =>
    env.dataStore.cmsRepo.forTenant(ctx.tenant).findByIdNotDeleted(id).flatMap {
      case None => FastFuture.successful(NotFound(Json.obj("error" -> "page not found !")))
      case Some(page) if !page.visible => FastFuture.successful(NotFound(Json.obj("error" -> "page not found !")))
      case Some(page) if page.authenticated && ctx.user.isEmpty => FastFuture.successful(Redirect(s"/auth/${ctx.tenant.authProvider.name}/login?redirect=${ctx.request.path}"))
      case Some(page) => page.render(ctx)(env).map(res => Ok(res._1).as(res._2))
    }
  }
}
