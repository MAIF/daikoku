package fr.maif.otoroshi.daikoku.ctrls

import fr.maif.otoroshi.daikoku.actions.{
  DaikokuAction,
  DaikokuActionMaybeWithGuest,
  DaikokuActionMaybeWithoutUser,
  DaikokuActionMaybeWithoutUserContext
}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
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
}
