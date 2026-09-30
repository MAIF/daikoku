package fr.maif.daikoku.controllers

import cats.data.EitherT
import cats.implicits.*
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
import fr.maif.daikoku.storage.{DataStore, Repo}
import fr.maif.daikoku.utils.{
  AdminApiController,
  DaikokuApiAction,
  UpdateOrCreate
}
import play.api.libs.json._
import play.api.mvc.{ControllerComponents, Result}

import scala.concurrent.Future

class RemoteCatalogAdminApiController(
    DaikokuApiAction: DaikokuApiAction,
    engine: RemoteCatalogEngine,
    env: Env,
    cc: ControllerComponents
) extends AdminApiController[RemoteCatalog, RemoteCatalogId](
      DaikokuApiAction,
      env,
      cc
    ) {
  override def entityClass = classOf[RemoteCatalog]
  override def entityName: String = "remote-catalog"
  override def pathRoot: String = s"/admin-api/${entityName}s"
  override def entityStore(
      tenant: Tenant,
      ds: DataStore
  ): Repo[RemoteCatalog, RemoteCatalogId] =
    ds.remoteCatalogRepo.forTenant(tenant)
  override def toJson(entity: RemoteCatalog): JsValue = entity.asJson
  override def fromJson(entity: JsValue): Either[String, RemoteCatalog] =
    RemoteCatalogFormat
      .reads(entity)
      .asEither
      .leftMap(_.flatMap(_._2).map(_.message).mkString(", "))

  override def validate(
      entity: RemoteCatalog,
      updateOrCreate: UpdateOrCreate
  ): EitherT[Future, AppError, RemoteCatalog] =
    for {
      _ <- EitherT.fromOptionF[Future, AppError, Tenant](
        env.dataStore.tenantRepo.findById(entity.tenant),
        AppError.ParsingPayloadError("Tenant not found")
      )
      // ids are unique across tenants: the table primary key is global
      existing <- EitherT.liftF[Future, AppError, Option[RemoteCatalog]](
        env.dataStore.remoteCatalogRepo
          .forAllTenant()
          .findById(entity.id.value)
      )
      isDuplicateCreation =
        updateOrCreate == UpdateOrCreate.Create && existing.isDefined
      _ <- EitherT.cond[Future](
        !isDuplicateCreation,
        (),
        AppError.EntityConflict(s"$entityName ${entity.id.value}")
      )
    } yield entity

  override def getId(entity: RemoteCatalog): RemoteCatalogId = entity.id

  // no soft delete for catalogs: the table has no _deleted column
  override def doDelete(
      tenant: Tenant,
      entity: RemoteCatalog,
      logically: Boolean
  ): EitherT[Future, AppError, Unit] =
    EitherT.liftF[Future, AppError, Unit](
      entityStore(tenant, env.dataStore)
        .deleteById(entity.id)
        .map(_ => ())
    )

  def deploy(id: String) =
    DaikokuApiAction.async { ctx =>
      withCatalog(ctx.tenant, id) { catalog =>
        auditAdminApiWrite(ctx, "deploy", id)

        engine.deploy(ctx.tenant, catalog).map(toResult)
      }
    }

  def test(id: String) =
    DaikokuApiAction.async { ctx =>
      withCatalog(ctx.tenant, id) { catalog =>
        auditAdminApiWrite(ctx, "test", id)

        engine.dryRun(ctx.tenant, catalog).map(dryRunResult)
      }
    }

  def undeploy(id: String) =
    DaikokuApiAction.async { ctx =>
      withCatalog(ctx.tenant, id) { catalog =>
        auditAdminApiWrite(ctx, "undeploy", id)

        engine.undeploy(ctx.tenant, catalog).map(toResult)
      }
    }

  private def withCatalog(tenant: Tenant, id: String)(
      f: RemoteCatalog => Future[Result]
  ): Future[Result] =
    entityStore(tenant, env.dataStore).findById(id).flatMap {
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
