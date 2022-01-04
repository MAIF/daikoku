package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import daikoku.BuildInfo
import fr.maif.otoroshi.daikoku.actions.{DaikokuAction, DaikokuActionMaybeWithGuest, DaikokuActionMaybeWithoutUser, DaikokuActionMaybeWithoutUserContext}
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async.TenantAdminOnly
import fr.maif.otoroshi.daikoku.domain.{CmsPage, CmsPageId, TenantId, json}
import fr.maif.otoroshi.daikoku.env.Env
import org.mindrot.jbcrypt.BCrypt
import play.api.libs.json.{JsError, JsObject, JsSuccess, Json}
import play.api.mvc._
import reactivemongo.bson.BSONObjectID

class HomeController(
    DaikokuActionMaybeWithoutUser: DaikokuActionMaybeWithoutUser,
    DaikokuActionMaybeWithGuest: DaikokuActionMaybeWithGuest,
    DaikokuAction: DaikokuAction,
    env: Env,
    cc: ControllerComponents)
    extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext
  implicit val e = env

  def actualIndex[A](ctx: DaikokuActionMaybeWithoutUserContext[A]): Result = {
    ctx.user match {
      case _ if ctx.request.uri.startsWith("/robots.txt") =>
        ctx.tenant.robotTxt match {
          case Some(robotTxt) => Ok(views.txt.robot.render(robotTxt));
          case None           => NotFound(Json.obj("error" -> "robots.txt not found"))
        }
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

  def createCmsPage() = DaikokuAction.async(parse.json) { ctx =>
    TenantAdminOnly(
      AuditTrailEvent("@{user.name} has created a cms page"))(
      ctx.tenant.id.value,
      ctx) { (tenant, _) => {
        val cmsPage = ctx.request.body.as[JsObject] ++
          Json.obj("_id" -> BSONObjectID.generate().stringify) ++
          Json.obj("_tenant" -> tenant.id.value)
        json.CmsPageFormat.reads(cmsPage) match {
          case JsSuccess(user, _) =>
            env.dataStore.cmsRepo.forTenant(tenant)
              .save(user)
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
