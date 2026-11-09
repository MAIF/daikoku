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
import fr.maif.daikoku.jobs.RemoteCatalogJob
import fr.maif.daikoku.services.catalog.{
  CatalogFile,
  CatalogSources,
  ExportFormat,
  ExportSelection,
  RemoteCatalogEngine
}
import fr.maif.daikoku.storage.{DataStore, Repo}
import fr.maif.daikoku.utils.{
  AdminApiController,
  DaikokuApiAction,
  IdGenerator,
  UpdateOrCreate
}
import org.apache.pekko.stream.scaladsl.Source
import org.apache.pekko.util.ByteString
import play.api.libs.json._
import play.api.libs.streams.Accumulator
import play.api.mvc.{BodyParser, ControllerComponents, Result}

import scala.concurrent.Future

class RemoteCatalogAdminApiController(
    DaikokuApiAction: DaikokuApiAction,
    engine: RemoteCatalogEngine,
    job: RemoteCatalogJob,
    env: Env,
    cc: ControllerComponents
) extends AdminApiController[RemoteCatalog, RemoteCatalogId](
      DaikokuApiAction,
      env,
      cc
    ) {
  private val streamedBody: BodyParser[Source[ByteString, ?]] =
    BodyParser("Catalog files") { _ =>
      Accumulator.source[ByteString].map(Right.apply)
    }

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
      _ <- EitherT
        .fromEither[Future](CatalogSources.disabledReason(entity).toLeft(()))
        .leftMap[AppError](AppError.BadRequestError.apply)
    } yield entity

  override def getId(entity: RemoteCatalog): RemoteCatalogId = entity.id

  override def doCreate(
      tenant: Tenant,
      entity: RemoteCatalog
  ): EitherT[Future, AppError, RemoteCatalog] =
    super.doCreate(tenant, entity.copy(token = IdGenerator.token(64)))

  override def doUpdate(
      tenant: Tenant,
      oldEntity: RemoteCatalog,
      newEntity: RemoteCatalog
  ): EitherT[Future, AppError, RemoteCatalog] =
    super.doUpdate(tenant, oldEntity, newEntity.copy(token = oldEntity.token))

  override def doDelete(
      tenant: Tenant,
      entity: RemoteCatalog
  ): EitherT[Future, AppError, Unit] =
    EitherT
      .liftF[Future, AppError, Unit](engine.detach(tenant, entity))
      .flatMap(_ => super.doDelete(tenant, entity))

  def deploy(id: String) =
    DaikokuApiAction.async { ctx =>
      withCatalog(ctx.tenant, id) { catalog =>
        auditAdminApiWrite(ctx, "deploy", id)

        job.deploy(ctx.tenant, catalog).map(toResult)
      }
    }

  def exportTenant(all: Boolean) =
    DaikokuApiAction.async { ctx =>
      auditAdminApiWrite(ctx, "export", ctx.tenant.id.value)

      Future.successful(
        Ok.chunked(
          engine.exportEntities(
            ctx.tenant,
            ExportSelection.WholeTenant(includeManaged = all),
            ExportFormat.Zip
          )
        ).as("application/zip")
          .withHeaders(
            CONTENT_DISPOSITION -> s"attachment; filename=${ctx.tenant.humanReadableId}.zip"
          )
      )
    }

  def test(id: String) =
    DaikokuApiAction.async { ctx =>
      withCatalog(ctx.tenant, id) { catalog =>
        auditAdminApiWrite(ctx, "test", id)

        engine.dryRun(ctx.tenant, catalog).map(runResult)
      }
    }

  def validate(id: String) =
    DaikokuApiAction.async(streamedBody) { ctx =>
      withCatalog(ctx.tenant, id) { catalog =>
        auditAdminApiWrite(ctx, "validate", id)

        val read =
          CatalogFile.fromBody(ctx.request.contentType, ctx.request.body)

        read.flatMap {
          case Left(error) =>
            Future.successful(BadRequest(Json.obj("error" -> error)))
          case Right(files) =>
            engine.validate(ctx.tenant, catalog, files).map(runResult)
        }
      }
    }

  def undeploy(id: String) =
    DaikokuApiAction.async { ctx =>
      withCatalog(ctx.tenant, id) { catalog =>
        auditAdminApiWrite(ctx, "undeploy", id)

        job.undeploy(ctx.tenant, catalog).map(toResult)
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

  private def runResult(run: RemoteCatalogRun): Result =
    if (run.status == RemoteCatalogRunStatus.Failed) BadRequest(run.asJson)
    else Ok(run.asJson)

  private def toResult(result: Either[JsValue, RemoteCatalogRun]): Result =
    result match {
      case Left(err)  => BadRequest(err)
      case Right(run) => runResult(run)
    }
}
