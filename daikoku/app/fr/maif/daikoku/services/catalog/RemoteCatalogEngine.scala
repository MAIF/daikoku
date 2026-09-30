package fr.maif.daikoku.services.catalog

import fr.maif.daikoku.controllers.{
  ApiAdminApiController,
  ApiSubscriptionAdminApiController,
  CmsPagesAdminApiController,
  TeamAdminApiController,
  UsagePlansAdminApiController
}
import fr.maif.daikoku.domain.{
  DatastoreId,
  RemoteCatalog,
  RemoteCatalogRun,
  RemoteCatalogRunStatus,
  Tenant,
  ValueType
}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.utils.{
  AdminApiController,
  ExistingEntities,
  IdGenerator,
  PreparedWrite,
  ReconcileFinalIds
}
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json._

import scala.collection.concurrent.TrieMap
import scala.concurrent.{ExecutionContext, Future}

case class ReconcileResult(
    kind: String,
    created: Seq[String],
    updated: Seq[String],
    deleted: Seq[String],
    errors: Seq[String]
) {
  def json: JsValue = Json.obj(
    "kind" -> kind,
    "created" -> created.size,
    "updated" -> updated.size,
    "deleted" -> deleted.size,
    "errors" -> JsArray(errors.map(JsString.apply))
  )
}

case class DeployReport(
    catalogId: String,
    tenant: String,
    results: Seq[ReconcileResult],
    timestamp: DateTime
) {
  def errors: Seq[String] = results.flatMap(_.errors)

  def isPartial: Boolean = errors.nonEmpty

  def status: String = if (isPartial) "partial" else "completed"

  def json: JsValue = Json.obj(
    "catalog_id" -> catalogId,
    "tenant" -> tenant,
    "status" -> status,
    "results" -> JsArray(results.map(_.json)),
    "timestamp" -> timestamp.toString
  )
}

class RemoteCatalogEngine(
    env: Env,
    apiController: ApiAdminApiController,
    usagePlanController: UsagePlansAdminApiController,
    teamController: TeamAdminApiController,
    cmsPageController: CmsPagesAdminApiController,
    apiSubscriptionController: ApiSubscriptionAdminApiController
) {

  private implicit val ec: ExecutionContext = env.defaultExecutionContext

  private val logger = Logger("daikoku-remote-catalog-engine")
  private val deployingCatalogs = TrieMap.empty[String, Boolean]

  private val controllers: Map[String, AdminApiController[?, ? <: ValueType]] =
    Map(
      apiController.entityName -> apiController,
      usagePlanController.entityName -> usagePlanController,
      teamController.entityName -> teamController,
      cmsPageController.entityName -> cmsPageController,
      apiSubscriptionController.entityName -> apiSubscriptionController
    )

  private val kindOrder =
    Seq("team", "usage-plan", "api", "api-subscription", "cms-page")

  // kind -> existing entities, e.g. Map("team" -> Map("team-a" -> Some("remote_catalog=cat-git")))
  private type DatabaseState = Map[String, ExistingEntities]

  private case class CatalogWrite(entity: RemoteEntity, prepared: PreparedWrite)

  private case class WrittenEntity(kind: String, id: String, action: String)

  private case class WriteError(kind: String, message: String)

  private case class WriteOutcome(
      written: Seq[WrittenEntity],
      error: Option[WriteError]
  )

  // ---------------------------------------------------------------------------
  // Entry points
  // ---------------------------------------------------------------------------

  def deploy(
      tenant: Tenant,
      catalog: RemoteCatalog
  ): Future[Either[JsValue, DeployReport]] = {
    val key = s"${tenant.id.value}:${catalog.id.value}"
    if (deployingCatalogs.contains(key)) {
      Future.successful(
        Left(
          Json.obj(
            "error" -> s"Catalog ${catalog.id.value} is already being deployed"
          )
        )
      )
    } else {
      deployingCatalogs.put(key, true)
      logger.info(
        s"deploying catalog ${catalog.id.value} / ${catalog.source.kind} on tenant ${tenant.id.value}"
      )
      Future.unit
        .flatMap(_ => doFetchAndReconcile(tenant, catalog, dryRun = false))
        .flatMap(result => saveRun(tenant, catalog, result).map(_ => result))
        .andThen { case _ => deployingCatalogs.remove(key) }
    }
  }

  def dryRun(
      tenant: Tenant,
      catalog: RemoteCatalog
  ): Future[RemoteCatalogRun] =
    doFetchAndReconcile(tenant, catalog, dryRun = true)
      .map(result => toRun(tenant, catalog, result))

  def validate(
      tenant: Tenant,
      catalog: RemoteCatalog,
      files: Seq[CatalogFile]
  ): Future[RemoteCatalogRun] = {
    val parsed = RemoteCatalogError.collect(
      files.map(file =>
        RemoteContentParser.parseRawContent(file.content, file.path)
      )
    )

    checkAndReconcile(tenant, catalog, parsed, dryRun = true)
      .map(result => toRun(tenant, catalog, result))
  }

  def undeploy(
      tenant: Tenant,
      catalog: RemoteCatalog
  ): Future[Either[JsValue, DeployReport]] = {
    val key = s"${tenant.id.value}:${catalog.id.value}"
    if (deployingCatalogs.contains(key)) {
      Future.successful(
        Left(
          Json.obj(
            "error" -> s"Catalog ${catalog.id.value} is currently being deployed"
          )
        )
      )
    } else {
      deployingCatalogs.put(key, true)
      logger.info(
        s"undeploying catalog ${catalog.id.value} on tenant ${tenant.id.value}"
      )
      Future.unit
        .flatMap(_ => doUndeploy(tenant, catalog))
        .flatMap(result => saveRun(tenant, catalog, result).map(_ => result))
        .andThen { case _ => deployingCatalogs.remove(key) }
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 1 — fetch and parse the catalog (no database access)
  // ---------------------------------------------------------------------------

  private def doFetchAndReconcile(
      tenant: Tenant,
      catalog: RemoteCatalog,
      dryRun: Boolean
  ): Future[Either[JsValue, DeployReport]] = {
    CatalogSources.get(catalog.source.kind) match {
      case None =>
        Future.successful(
          Left(
            Json.obj("error" -> s"Unknown source kind: ${catalog.source.kind}")
          )
        )
      case Some(source) =>
        source
          .fetch(catalog)(using ec, env)
          .flatMap(fetched =>
            checkAndReconcile(tenant, catalog, fetched, dryRun)
          )
    }
  }

  private def checkAndReconcile(
      tenant: Tenant,
      catalog: RemoteCatalog,
      fetched: Either[Seq[RemoteCatalogError], Seq[RemoteEntity]],
      dryRun: Boolean
  ): Future[Either[JsValue, DeployReport]] =
    fetched match {
      case Left(errors) =>
        Future.successful(
          Left(
            errorsJson(
              s"Catalog ${catalog.id.value} could not be read, nothing was applied",
              errors
            )
          )
        )
      case Right(entities) =>
        val validationErrors = entities.flatMap(entity =>
          checkKind(catalog, entity) ++ checkTenant(tenant, entity)
        )

        if (validationErrors.nonEmpty) {
          Future.successful(
            Left(
              errorsJson(
                s"Catalog ${catalog.id.value} is invalid, nothing was applied",
                validationErrors
              )
            )
          )
        } else {
          reconcile(tenant, catalog, entities, dryRun)
        }
    }

  private def checkKind(
      catalog: RemoteCatalog,
      entity: RemoteEntity
  ): Option[RemoteCatalogError] = {
    val kindIsAllowed =
      catalog.allowedKinds.isEmpty || catalog.allowedKinds.contains(entity.kind)

    if (!controllers.contains(entity.kind)) {
      Some(RemoteCatalogError(entity.source, s"Unknown kind: ${entity.kind}"))
    } else if (!kindIsAllowed) {
      Some(
        RemoteCatalogError(
          entity.source,
          s"Kind '${entity.kind}' not allowed for this catalog"
        )
      )
    } else {
      None
    }
  }

  private def checkTenant(
      tenant: Tenant,
      entity: RemoteEntity
  ): Option[RemoteCatalogError] = {
    val prefix = s"${entity.kind} ${entity.id}"

    (entity.content \ "_tenant").asOpt[String] match {
      case None =>
        Some(
          RemoteCatalogError(
            entity.source,
            s"$prefix: missing required field '_tenant'"
          )
        )
      case Some(value) if value != tenant.id.value =>
        Some(
          RemoteCatalogError(
            entity.source,
            s"$prefix: _tenant '$value' is not the catalog tenant '${tenant.id.value}'"
          )
        )
      case Some(_) => None
    }
  }

  private def errorsJson(
      message: String,
      errors: Seq[RemoteCatalogError]
  ): JsValue =
    Json.obj("error" -> message, "errors" -> JsArray(errors.map(_.json)))

  // ---------------------------------------------------------------------------
  // Orchestration — phase 2 then phase 3
  // ---------------------------------------------------------------------------

  private def reconcile(
      tenant: Tenant,
      catalog: RemoteCatalog,
      entities: Seq[RemoteEntity],
      dryRun: Boolean
  ): Future[Either[JsValue, DeployReport]] = {
    val metadataKey = s"remote_catalog=${catalog.id.value}"

    readDatabaseState(tenant).flatMap { databaseState =>
      val toDelete =
        computeEntitiesToDelete(databaseState, metadataKey, entities)
      val finalIds = computeFinalIds(databaseState, toDelete, entities)
      val deletionLimitError =
        checkDeletionLimit(catalog, databaseState, metadataKey, toDelete)

      deletionLimitError match {
        case Some(error) =>
          Future.successful(
            Left(
              errorsJson(
                s"Catalog ${catalog.id.value} would delete too many entities, nothing was applied",
                Seq(error)
              )
            )
          )
        case None =>
          prepareAllWrites(tenant, metadataKey, entities, finalIds).flatMap {
            case Left(errors) =>
              Future.successful(
                Left(
                  errorsJson(
                    s"Catalog ${catalog.id.value} is invalid, nothing was applied",
                    errors
                  )
                )
              )
            case Right(writes) =>
              writeAll(tenant, catalog, writes, toDelete, dryRun).map(Right(_))
          }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 2 — validate everything (reads the database, never writes)
  // ---------------------------------------------------------------------------

  private def readDatabaseState(
      tenant: Tenant
  ): Future[DatabaseState] = {
    Future
      .sequence(kindOrder.map { kind =>
        controllers(kind).readExistingEntities(tenant).map(kind -> _)
      })
      .map(_.toMap)
  }

  private def computeEntitiesToDelete(
      databaseState: DatabaseState,
      metadataKey: String,
      entities: Seq[RemoteEntity]
  ): Seq[(String, String)] = {
    val remoteIds = entities.map(e => (e.kind, e.id)).toSet

    kindOrder.reverse.flatMap { kind =>
      databaseState(kind).toSeq.collect {
        case (id, createdBy)
            if createdBy
              .contains(metadataKey) && !remoteIds.contains((kind, id)) =>
          (kind, id)
      }
    }
  }

  private def checkDeletionLimit(
      catalog: RemoteCatalog,
      databaseState: DatabaseState,
      metadataKey: String,
      toDelete: Seq[(String, String)]
  ): Option[RemoteCatalogError] = {
    val managedCount = databaseState.values
      .flatMap(_.values)
      .count(_.contains(metadataKey))
    val deletedPercent =
      if (managedCount == 0) 0.0 else toDelete.size * 100.0 / managedCount
    val limitIsActive = catalog.maxDeletionPercent != -1 && managedCount >= 5

    if (limitIsActive && deletedPercent > catalog.maxDeletionPercent) {
      Some(
        RemoteCatalogError(
          s"catalog ${catalog.id.value}",
          f"${toDelete.size} of $managedCount managed entities would be deleted ($deletedPercent%.0f%% > ${catalog.maxDeletionPercent}%%): fix the source or raise maxDeletionPercent (-1 for no limit)"
        )
      )
    } else {
      None
    }
  }

  private def computeFinalIds(
      databaseState: DatabaseState,
      toDelete: Seq[(String, String)],
      entities: Seq[RemoteEntity]
  ): ReconcileFinalIds = {
    val deleted = toDelete.toSet

    ReconcileFinalIds(kindOrder.map { kind =>
      val keptInDb =
        databaseState(kind).keySet.filterNot(id => deleted.contains((kind, id)))
      val fromRun = entities.filter(_.kind == kind).map(_.id).toSet

      kind -> (keptInDb ++ fromRun)
    }.toMap)
  }

  private def prepareAllWrites(
      tenant: Tenant,
      metadataKey: String,
      entities: Seq[RemoteEntity],
      finalIds: ReconcileFinalIds
  ): Future[Either[Seq[RemoteCatalogError], Seq[CatalogWrite]]] = {
    Future
      .sequence(kindOrder.map { kind =>
        val kindEntities = entities.filter(_.kind == kind)
        val raws =
          kindEntities.map(e => withCreatedByMetadata(e.content, metadataKey))

        controllers(kind)
          .prepareWrites(tenant, raws, metadataKey, finalIds)
          .map(results => kindEntities.zip(results))
      })
      .map { perKind =>
        val results = perKind.flatten
        val errors = results.collect { case (entity, Left(message)) =>
          RemoteCatalogError(
            entity.source,
            s"${entity.kind} ${entity.id}: $message"
          )
        }

        if (errors.nonEmpty) {
          Left(errors)
        } else {
          Right(results.collect { case (entity, Right(write)) =>
            CatalogWrite(entity, write)
          })
        }
      }
  }

  // e.g. "metadata": { "created_by": "remote_catalog=my-catalog" }
  private def withCreatedByMetadata(
      json: JsObject,
      metadataKey: String
  ): JsObject = {
    val current = (json \ "metadata").asOpt[JsObject].getOrElse(Json.obj())

    json ++ Json.obj(
      "metadata" -> (current ++ Json.obj("created_by" -> metadataKey))
    )
  }

  // ---------------------------------------------------------------------------
  // Phase 3 — write (only when phase 2 found no error)
  // ---------------------------------------------------------------------------

  private def writeAll(
      tenant: Tenant,
      catalog: RemoteCatalog,
      writes: Seq[CatalogWrite],
      toDelete: Seq[(String, String)],
      dryRun: Boolean
  ): Future[DeployReport] = {
    runOneByOne(writes)(writeEntity(dryRun)).flatMap { upserts =>
      if (upserts.error.isDefined) {
        Future.successful(buildReport(tenant, catalog, Seq(upserts)))
      } else {
        runOneByOne(toDelete)(deleteEntity(tenant, dryRun))
          .map(deletions =>
            buildReport(tenant, catalog, Seq(upserts, deletions))
          )
      }
    }
  }

  private def runOneByOne[A](
      items: Seq[A],
      written: Seq[WrittenEntity] = Seq.empty
  )(
      runOne: A => Future[Either[WriteError, WrittenEntity]]
  ): Future[WriteOutcome] = {
    items match {
      case Seq() => Future.successful(WriteOutcome(written, None))
      case item +: rest =>
        runOne(item).flatMap {
          case Left(error) =>
            Future.successful(WriteOutcome(written, Some(error)))
          case Right(entity) =>
            runOneByOne(rest, written :+ entity)(runOne)
        }
    }
  }

  private def writeEntity(dryRun: Boolean)(
      write: CatalogWrite
  ): Future[Either[WriteError, WrittenEntity]] = {
    val kind = write.entity.kind
    val written = WrittenEntity(kind, write.entity.id, write.prepared.action)
    val errorPrefix =
      s"Error writing ${write.entity.id} (${write.entity.source})"

    if (dryRun) {
      Future.successful(Right(written))
    } else {
      write.prepared
        .write()
        .value
        .map {
          case Left(error) =>
            Left(WriteError(kind, s"$errorPrefix: ${error.getErrorMessage()}"))
          case Right(_) => Right(written)
        }
        .recover { case e: Throwable =>
          Left(WriteError(kind, s"$errorPrefix: ${e.getMessage}"))
        }
    }
  }

  private def deleteEntity(tenant: Tenant, dryRun: Boolean)(
      kindAndId: (String, String)
  ): Future[Either[WriteError, WrittenEntity]] = {
    val (kind, id) = kindAndId
    val errorPrefix = s"Error deleting $id"

    if (dryRun) {
      Future.successful(Right(WrittenEntity(kind, id, "deleted")))
    } else {
      controllers(kind)
        .doDeleteById(tenant, id)
        .map {
          case Left(err)     => Left(WriteError(kind, s"$errorPrefix: $err"))
          case Right(action) => Right(WrittenEntity(kind, id, action))
        }
        .recover { case e: Throwable =>
          Left(WriteError(kind, s"$errorPrefix: ${e.getMessage}"))
        }
    }
  }

  private def buildReport(
      tenant: Tenant,
      catalog: RemoteCatalog,
      outcomes: Seq[WriteOutcome]
  ): DeployReport = {
    val written = outcomes.flatMap(_.written)
    val errors = outcomes.flatMap(_.error)

    def idsOf(kind: String, action: String): Seq[String] =
      written.filter(w => w.kind == kind && w.action == action).map(_.id)

    val results = kindOrder.map { kind =>
      ReconcileResult(
        kind = kind,
        created = idsOf(kind, "created"),
        updated = idsOf(kind, "updated"),
        deleted = idsOf(kind, "deleted"),
        errors = errors.filter(_.kind == kind).map(_.message)
      )
    }

    DeployReport(catalog.id.value, tenant.id.value, results, DateTime.now())
  }

  private def doUndeploy(
      tenant: Tenant,
      catalog: RemoteCatalog
  ): Future[Either[JsValue, DeployReport]] = {
    val metadataKey = s"remote_catalog=${catalog.id.value}"

    readDatabaseState(tenant)
      .flatMap { databaseState =>
        val managed =
          computeEntitiesToDelete(databaseState, metadataKey, Seq.empty)

        runOneByOne(managed)(deleteEntity(tenant, dryRun = false))
      }
      .map(deletions => Right(buildReport(tenant, catalog, Seq(deletions))))
  }

  // ---------------------------------------------------------------------------
  // Run history
  // ---------------------------------------------------------------------------

  private def saveRun(
      tenant: Tenant,
      catalog: RemoteCatalog,
      result: Either[JsValue, DeployReport]
  ): Future[Unit] = {
    val run = toRun(tenant, catalog, result)

    env.dataStore.remoteCatalogRunRepo
      .forTenant(tenant)
      .save(run)
      .flatMap(_ => pruneRuns(tenant, catalog))
      .recover { case e =>
        logger.error(s"cannot save the run of catalog ${catalog.id.value}", e)
      }
  }

  private def toRun(
      tenant: Tenant,
      catalog: RemoteCatalog,
      result: Either[JsValue, DeployReport]
  ): RemoteCatalogRun =
    result match {
      case Right(report) =>
        val status =
          if (report.isPartial) RemoteCatalogRunStatus.Partial
          else RemoteCatalogRunStatus.Completed

        RemoteCatalogRun(
          id = DatastoreId(IdGenerator.token(32)),
          tenant = tenant.id,
          catalog = catalog.id,
          at = report.timestamp,
          status = status,
          created = report.results.flatMap(_.created),
          updated = report.results.flatMap(_.updated),
          deleted = report.results.flatMap(_.deleted),
          errors = report.errors
        )
      case Left(error) =>
        RemoteCatalogRun(
          id = DatastoreId(IdGenerator.token(32)),
          tenant = tenant.id,
          catalog = catalog.id,
          at = DateTime.now(),
          status = RemoteCatalogRunStatus.Failed,
          created = Seq.empty,
          updated = Seq.empty,
          deleted = Seq.empty,
          errors = failureMessages(error)
        )
    }

  private val runsKept = 20

  private def pruneRuns(
      tenant: Tenant,
      catalog: RemoteCatalog
  ): Future[Unit] = {
    val repo = env.dataStore.remoteCatalogRunRepo.forTenant(tenant)

    repo
      .find(Json.obj("catalog" -> catalog.id.value))
      .flatMap { runs =>
        val newestFirst = runs.sortBy(_.at.getMillis).reverse
        val oldIds = newestFirst.drop(runsKept).map(_.id.value)

        if (oldIds.isEmpty) {
          Future.unit
        } else {
          repo
            .delete(Json.obj("_id" -> Json.obj("$in" -> oldIds)))
            .map(_ => ())
        }
      }
  }

  // e.g. Seq("file:///catalog/teams.yaml: document 2: Missing required field '_id'")
  private def failureMessages(error: JsValue): Seq[String] =
    (error \ "errors").asOpt[Seq[JsObject]] match {
      case Some(details) if details.nonEmpty =>
        details.map(d =>
          s"${(d \ "source").as[String]}: ${(d \ "message").as[String]}"
        )
      case _ => (error \ "error").asOpt[String].toSeq
    }
}
