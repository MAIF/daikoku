package fr.maif.daikoku.controllers

import fr.maif.daikoku.actions.DaikokuAction
import fr.maif.daikoku.audit.AuditTrailEvent
import fr.maif.daikoku.controllers.authorizations.async._
import fr.maif.daikoku.domain.json.SeqRemoteCatalogFormat
import fr.maif.daikoku.domain.{RemoteCatalog, Tenant}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.services.catalog.{DeployReport, RemoteCatalogEngine}
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
  implicit val ev: Env              = env

  private val auditUserId = "remote-catalog-job"

  def list(tenantId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(AuditTrailEvent("@{user.name} has accessed remote catalogs"))(tenantId, ctx) { (tenant, _) =>
        Future.successful(Ok(SeqRemoteCatalogFormat.writes(tenant.remoteCatalogs)))
      }
    }

  def config(tenantId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(AuditTrailEvent("@{user.name} has accessed remote catalog config"))(tenantId, ctx) { (_, _) =>
        Future.successful(
          Ok(
            Json.obj(
              "defaultInterval" -> env.config.remoteCatalogInterval.toMillis
            )
          )
        )
      }
    }

  def deploy(tenantId: String, catalogId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(AuditTrailEvent(s"@{user.name} has deployed remote catalog $catalogId"))(tenantId, ctx) {
        (tenant, _) =>
          withCatalog(tenant, catalogId)(catalog => engine.deploy(tenant, catalog, Json.obj()).map(toResult))
      }
    }

  def test(tenantId: String, catalogId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(AuditTrailEvent(s"@{user.name} has tested remote catalog $catalogId"))(tenantId, ctx) {
        (tenant, _) =>
          withCatalog(tenant, catalogId)(catalog => engine.dryRun(tenant, catalog, Json.obj()).map(toResult))
      }
    }

  def undeploy(tenantId: String, catalogId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(AuditTrailEvent(s"@{user.name} has undeployed remote catalog $catalogId"))(tenantId, ctx) {
        (tenant, _) =>
          withCatalog(tenant, catalogId)(catalog => engine.undeploy(tenant, catalog).map(toResult))
      }
    }

  def history(tenantId: String, catalogId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(AuditTrailEvent(s"@{user.name} has accessed remote catalog history $catalogId"))(tenantId, ctx) {
        (tenant, _) =>
          env.dataStore.auditTrailRepo
            .forTenant(tenant.id)
            .find(Json.obj("@userId" -> auditUserId), Some(Json.obj("@timestamp" -> -1)))
            .map { events =>
              val runs = events
                .filter(e => (e \ "details" \ "catalog_id").asOpt[String].contains(catalogId))
                .take(10)
                .map(e =>
                  Json.obj(
                    "at"      -> (e \ "@timestamp").toOption.getOrElse(JsNull),
                    "created" -> (e \ "details" \ "created").asOpt[JsArray].getOrElse(Json.arr()),
                    "updated" -> (e \ "details" \ "updated").asOpt[JsArray].getOrElse(Json.arr()),
                    "deleted" -> (e \ "details" \ "deleted").asOpt[JsArray].getOrElse(Json.arr())
                  )
                )
              Ok(JsArray(runs))
            }
      }
    }

  private def withCatalog(tenant: Tenant, catalogId: String)(
      f: RemoteCatalog => Future[Result]
  ): Future[Result] =
    tenant.remoteCatalogs.find(_.id == catalogId) match {
      case None          => Future.successful(NotFound(Json.obj("error" -> "Remote catalog not found")))
      case Some(catalog) => f(catalog)
    }

  private def toResult(result: Either[JsValue, DeployReport]): Result =
    result match {
      case Left(err)     => BadRequest(err)
      case Right(report) => Ok(report.json)
    }
}
