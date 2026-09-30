package fr.maif.daikoku.controllers

import fr.maif.daikoku.actions.DaikokuTenantAction
import fr.maif.daikoku.audit.AuditTrailEvent
import fr.maif.daikoku.domain.{
  RemoteCatalog,
  RemoteCatalogRun,
  RemoteCatalogRunStatus,
  Tenant,
  User
}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.services.catalog.{
  CatalogFile,
  DeployReport,
  RemoteCatalogEngine
}
import play.api.libs.json._
import play.api.mvc.{
  AbstractController,
  ControllerComponents,
  RequestHeader,
  Result
}

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import scala.concurrent.{ExecutionContext, Future}

class RemoteCatalogTokenController(
    DaikokuTenantAction: DaikokuTenantAction,
    engine: RemoteCatalogEngine,
    env: Env,
    cc: ControllerComponents
) extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  def validate(catalogId: String) =
    DaikokuTenantAction.async(parse.json) { ctx =>
      withCatalogToken(ctx.tenant, catalogId, ctx.request) { catalog =>
        auditTokenAction(ctx.tenant, ctx.request, catalogId, "validate")

        CatalogFile.readAll(ctx.request.body) match {
          case None =>
            Future.successful(
              BadRequest(
                Json.obj("error" -> "Expected an array of {path, content}")
              )
            )
          case Some(files) =>
            engine.validate(ctx.tenant, catalog, files).map(runResult)
        }
      }
    }

  def test(catalogId: String) =
    DaikokuTenantAction.async { ctx =>
      withCatalogToken(ctx.tenant, catalogId, ctx.request) { catalog =>
        auditTokenAction(ctx.tenant, ctx.request, catalogId, "test")

        engine.dryRun(ctx.tenant, catalog).map(runResult)
      }
    }

  def deploy(catalogId: String) =
    DaikokuTenantAction.async { ctx =>
      withCatalogToken(ctx.tenant, catalogId, ctx.request) { catalog =>
        auditTokenAction(ctx.tenant, ctx.request, catalogId, "deploy")

        engine.deploy(ctx.tenant, catalog).map(toResult)
      }
    }

  def undeploy(catalogId: String) =
    DaikokuTenantAction.async { ctx =>
      withCatalogToken(ctx.tenant, catalogId, ctx.request) { catalog =>
        auditTokenAction(ctx.tenant, ctx.request, catalogId, "undeploy")

        engine.undeploy(ctx.tenant, catalog).map(toResult)
      }
    }

  private def toResult(result: Either[JsValue, DeployReport]): Result =
    result match {
      case Left(err)     => BadRequest(err)
      case Right(report) => Ok(report.json)
    }

  private def runResult(run: RemoteCatalogRun): Result =
    if (run.status == RemoteCatalogRunStatus.Failed) BadRequest(run.asJson)
    else Ok(run.asJson)

  private def withCatalogToken(
      tenant: Tenant,
      catalogId: String,
      request: RequestHeader
  )(f: RemoteCatalog => Future[Result]): Future[Result] = {
    val presented = request.headers
      .get("Authorization")
      .map(_.stripPrefix("Bearer ").trim)

    env.dataStore.remoteCatalogRepo
      .forTenant(tenant)
      .findById(catalogId)
      .flatMap { maybeCatalog =>
        maybeCatalog.filter(catalog => tokenMatches(catalog, presented)) match {
          case Some(catalog) => f(catalog)
          case None =>
            Future.successful(
              Unauthorized(Json.obj("error" -> "Invalid remote catalog token"))
            )
        }
      }
  }

  private def auditTokenAction(
      tenant: Tenant,
      request: RequestHeader,
      catalogId: String,
      action: String
  ): Unit =
    AuditTrailEvent(
      s"Remote catalog $catalogId $action with its token"
    ).logAdminApiAuditEvent(
      tenant,
      User.system,
      request,
      Json.obj("catalog" -> catalogId, "action" -> action)
    )

  private def tokenMatches(
      catalog: RemoteCatalog,
      presented: Option[String]
  ): Boolean =
    presented.exists(token =>
      MessageDigest.isEqual(
        catalog.token.getBytes(StandardCharsets.UTF_8),
        token.getBytes(StandardCharsets.UTF_8)
      )
    )
}
