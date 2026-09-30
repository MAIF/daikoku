package fr.maif.daikoku.controllers

import fr.maif.daikoku.actions.DaikokuAction
import fr.maif.daikoku.audit.AuditTrailEvent
import fr.maif.daikoku.controllers.authorizations.async._
import fr.maif.daikoku.domain.json.RemoteCatalogFormat
import fr.maif.daikoku.domain.{
  RemoteCatalog,
  RemoteCatalogId,
  RemoteCatalogRun,
  RemoteCatalogRunStatus,
  Tenant
}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.services.catalog.{DeployReport, RemoteCatalogEngine}
import fr.maif.daikoku.utils.IdGenerator
import play.api.libs.json._
import play.api.mvc.{AbstractController, ControllerComponents, Result}

import scala.concurrent.{ExecutionContext, Future}

class RemoteCatalogController(
    DaikokuAction: DaikokuAction,
    engine: RemoteCatalogEngine,
    env: Env,
    cc: ControllerComponents
) extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  def list(tenantId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(s"@{user.name} has accessed remote catalogs")
      )(tenantId, ctx) { (tenant, _) =>
        env.dataStore.remoteCatalogRepo
          .forTenant(tenant)
          .findAll()
          .map(catalogs => Ok(JsArray(catalogs.map(_.asJson))))
      }
    }

  def create(tenantId: String) =
    DaikokuAction.async(parse.json) { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(s"@{user.name} has created a remote catalog")
      )(tenantId, ctx) { (tenant, _) =>
        val body = ctx.request.body.asOpt[JsObject].getOrElse(Json.obj()) ++
          Json.obj(
            "_id" -> IdGenerator.token(32),
            "_tenant" -> tenant.id.value,
            "token" -> IdGenerator.token(64)
          )

        RemoteCatalogFormat.reads(body) match {
          case JsError(_) =>
            Future.successful(
              BadRequest(Json.obj("error" -> "Bad remote catalog format"))
            )
          case JsSuccess(catalog, _) =>
            env.dataStore.remoteCatalogRepo
              .forTenant(tenant)
              .save(catalog)
              .map(_ => Created(catalog.asJson))
        }
      }
    }

  def update(tenantId: String, catalogId: String) =
    DaikokuAction.async(parse.json) { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(s"@{user.name} has updated remote catalog $catalogId")
      )(tenantId, ctx) { (tenant, _) =>
        withCatalog(tenant, catalogId) { existing =>
          val body =
            ctx.request.body.asOpt[JsObject].getOrElse(Json.obj()) ++
              Json.obj(
                "_id" -> existing.id.value,
                "_tenant" -> tenant.id.value,
                "token" -> existing.token
              )

          RemoteCatalogFormat.reads(body) match {
            case JsError(_) =>
              Future.successful(
                BadRequest(Json.obj("error" -> "Bad remote catalog format"))
              )
            case JsSuccess(catalog, _) =>
              env.dataStore.remoteCatalogRepo
                .forTenant(tenant)
                .save(catalog)
                .map(_ => Ok(catalog.asJson))
          }
        }
      }
    }

  def delete(tenantId: String, catalogId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(s"@{user.name} has deleted remote catalog $catalogId")
      )(tenantId, ctx) { (tenant, _) =>
        withCatalog(tenant, catalogId) { existing =>
          env.dataStore.remoteCatalogRepo
            .forTenant(tenant)
            .deleteById(existing.id)
            .map(_ => NoContent)
        }
      }
    }

  def regenerateToken(tenantId: String, catalogId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has regenerated the token of remote catalog $catalogId"
        )
      )(tenantId, ctx) { (tenant, _) =>
        withCatalog(tenant, catalogId) { existing =>
          val regenerated = existing.copy(token = IdGenerator.token(64))

          env.dataStore.remoteCatalogRepo
            .forTenant(tenant)
            .save(regenerated)
            .map(_ => Ok(regenerated.asJson))
        }
      }
    }

  def deploy(tenantId: String, catalogId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(s"@{user.name} has deployed remote catalog $catalogId")
      )(tenantId, ctx) { (tenant, _) =>
        withCatalog(tenant, catalogId)(catalog =>
          engine.deploy(tenant, catalog).map(toResult)
        )
      }
    }

  def test(tenantId: String, catalogId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(s"@{user.name} has tested remote catalog $catalogId")
      )(tenantId, ctx) { (tenant, _) =>
        withCatalog(tenant, catalogId)(catalog =>
          engine.dryRun(tenant, catalog).map(dryRunResult)
        )
      }
    }

  def undeploy(tenantId: String, catalogId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has undeployed remote catalog $catalogId"
        )
      )(tenantId, ctx) { (tenant, _) =>
        withCatalog(tenant, catalogId)(catalog =>
          engine.undeploy(tenant, catalog).map(toResult)
        )
      }
    }

  def history(tenantId: String, catalogId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has accessed remote catalog history $catalogId"
        )
      )(tenantId, ctx) { (tenant, _) =>
        env.dataStore.remoteCatalogRunRepo
          .findByCatalog(tenant.id, RemoteCatalogId(catalogId))
          .map { runs =>
            Ok(JsArray(runs.map(_.asJson)))
          }
      }
    }

  private def withCatalog(tenant: Tenant, catalogId: String)(
      f: RemoteCatalog => Future[Result]
  ): Future[Result] =
    env.dataStore.remoteCatalogRepo
      .forTenant(tenant)
      .findById(catalogId)
      .flatMap {
        case None =>
          Future.successful(
            NotFound(Json.obj("error" -> "Remote catalog not found"))
          )
        case Some(catalog) => f(catalog)
      }

  private def dryRunResult(run: RemoteCatalogRun): Result =
    if (run.status == RemoteCatalogRunStatus.Failed) BadRequest(run.asJson)
    else Ok(run.asJson)

  private def toResult(result: Either[JsValue, DeployReport]): Result =
    result match {
      case Left(err)     => BadRequest(err)
      case Right(report) => Ok(report.json)
    }
}
