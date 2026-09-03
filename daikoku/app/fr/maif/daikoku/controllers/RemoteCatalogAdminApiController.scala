package fr.maif.daikoku.controllers

import fr.maif.daikoku.domain.json.{RemoteCatalogFormat, SeqRemoteCatalogFormat}
import fr.maif.daikoku.domain.{RemoteCatalog, Tenant}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.services.catalog.{DeployReport, RemoteCatalogEngine}
import fr.maif.daikoku.utils.DaikokuApiAction
import play.api.libs.json._
import play.api.mvc.{AbstractController, ControllerComponents, Result}

import scala.concurrent.{ExecutionContext, Future}

class RemoteCatalogAdminApiController(
    DaikokuApiAction: DaikokuApiAction,
    engine: RemoteCatalogEngine,
    env: Env,
    cc: ControllerComponents
) extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext

  def list() =
    DaikokuApiAction.async { ctx =>
      Future.successful(Ok(SeqRemoteCatalogFormat.writes(ctx.tenant.remoteCatalogs)))
    }

  def get(id: String) =
    DaikokuApiAction.async { ctx =>
      withCatalog(ctx.tenant, id)(catalog => Future.successful(Ok(RemoteCatalogFormat.writes(catalog))))
    }

  def deploy(id: String) =
    DaikokuApiAction.async(parse.json) { ctx =>
      withCatalog(ctx.tenant, id) { catalog =>
        engine.deploy(ctx.tenant, catalog, argsOf(ctx.request.body)).map(toResult)
      }
    }

  def test(id: String) =
    DaikokuApiAction.async(parse.json) { ctx =>
      withCatalog(ctx.tenant, id) { catalog =>
        engine.dryRun(ctx.tenant, catalog, argsOf(ctx.request.body)).map(toResult)
      }
    }

  def undeploy(id: String) =
    DaikokuApiAction.async { ctx =>
      withCatalog(ctx.tenant, id) { catalog =>
        engine.undeploy(ctx.tenant, catalog).map(toResult)
      }
    }

  private def withCatalog(tenant: Tenant, id: String)(
      f: RemoteCatalog => Future[Result]
  ): Future[Result] =
    tenant.remoteCatalogs.find(_.id == id) match {
      case None          => Future.successful(NotFound(Json.obj("error" -> "Remote catalog not found")))
      case Some(catalog) => f(catalog)
    }

  private def argsOf(body: JsValue): JsObject =
    (body \ "args").asOpt[JsObject].getOrElse(Json.obj())

  private def toResult(result: Either[JsValue, DeployReport]): Result =
    result match {
      case Left(err)     => BadRequest(err)
      case Right(report) => Ok(report.json)
    }
}
