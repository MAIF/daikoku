package fr.maif.daikoku.services.catalog

import fr.maif.daikoku.audit.JobEvent
import fr.maif.daikoku.controllers.{
  ApiAdminApiController,
  ApiSubscriptionAdminApiController,
  CmsPagesAdminApiController,
  TeamAdminApiController,
  UsagePlansAdminApiController
}
import fr.maif.daikoku.domain.{
  RemoteCatalog,
  Tenant,
  TenantId,
  User,
  UserId,
  ValueType
}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.utils.{
  AdminApiController,
  ExistingEntities,
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
  private val auditUserId = "remote-catalog-job"
  private val auditKeep = 10

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
      catalog: RemoteCatalog,
      args: JsObject
  ): Future[Either[JsValue, DeployReport]] = {
    val key = s"${tenant.id.value}:${catalog.id}"
    if (deployingCatalogs.contains(key)) {
      Future.successful(
        Left(
          Json.obj(
            "error" -> s"Catalog ${catalog.id} is already being deployed"
          )
        )
      )
    } else {
      deployingCatalogs.put(key, true)
      logger.info(
        s"deploying catalog ${catalog.id} / ${catalog.source.kind} on tenant ${tenant.id.value}"
      )
      doFetchAndReconcile(tenant, catalog, args, dryRun = false)
        .andThen { case scala.util.Success(Right(report)) =>
          audit(tenant, catalog, report)
        }
        .andThen { case _ => deployingCatalogs.remove(key) }
    }
  }

  def dryRun(
      tenant: Tenant,
      catalog: RemoteCatalog,
      args: JsObject
  ): Future[Either[JsValue, DeployReport]] =
    doFetchAndReconcile(tenant, catalog, args, dryRun = true)

  def undeploy(
      tenant: Tenant,
      catalog: RemoteCatalog
  ): Future[Either[JsValue, DeployReport]] = {
    val key = s"${tenant.id.value}:${catalog.id}"
    if (deployingCatalogs.contains(key)) {
      Future.successful(
        Left(
          Json.obj(
            "error" -> s"Catalog ${catalog.id} is currently being deployed"
          )
        )
      )
    } else {
      deployingCatalogs.put(key, true)
      logger.info(
        s"undeploying catalog ${catalog.id} on tenant ${tenant.id.value}"
      )
      doUndeploy(tenant, catalog)
        .andThen { case scala.util.Success(Right(report)) =>
          audit(tenant, catalog, report)
        }
        .andThen { case _ => deployingCatalogs.remove(key) }
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 1 — fetch and parse the catalog (no database access)
  // ---------------------------------------------------------------------------

  private def doFetchAndReconcile(
      tenant: Tenant,
      catalog: RemoteCatalog,
      args: JsObject,
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
        source.fetch(catalog, args)(using ec, env).flatMap {
          case Left(errors) =>
            Future.successful(
              Left(
                errorsJson(
                  s"Catalog ${catalog.id} could not be read, nothing was applied",
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
                    s"Catalog ${catalog.id} is invalid, nothing was applied",
                    validationErrors
                  )
                )
              )
            } else {
              reconcile(tenant, catalog, entities, dryRun)
            }
        }
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
    val metadataKey = s"remote_catalog=${catalog.id}"

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
                s"Catalog ${catalog.id} would delete too many entities, nothing was applied",
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
                    s"Catalog ${catalog.id} is invalid, nothing was applied",
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
          s"catalog ${catalog.id}",
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

    DeployReport(catalog.id, tenant.id.value, results, DateTime.now())
  }

  private def doUndeploy(
      tenant: Tenant,
      catalog: RemoteCatalog
  ): Future[Either[JsValue, DeployReport]] = {
    val metadataKey = s"remote_catalog=${catalog.id}"

    readDatabaseState(tenant)
      .flatMap { databaseState =>
        val managed =
          computeEntitiesToDelete(databaseState, metadataKey, Seq.empty)

        runOneByOne(managed)(deleteEntity(tenant, dryRun = false))
      }
      .map(deletions => Right(buildReport(tenant, catalog, Seq(deletions))))
  }

  // ---------------------------------------------------------------------------
  // Audit
  // ---------------------------------------------------------------------------

  private def jobUser(tenantId: TenantId): User =
    User(
      id = UserId(auditUserId),
      tenants = Set(tenantId),
      origins = Set.empty,
      name = "Remote Catalog Job",
      email = "",
      lastTenant = None,
      defaultLanguage = None,
      isGuest = true
    )

  private def audit(
      tenant: Tenant,
      catalog: RemoteCatalog,
      report: DeployReport
  ): Unit = {
    JobEvent(s"remote catalog ${catalog.id}")
      .logJobEvent(
        tenant,
        jobUser(tenant.id),
        Json.obj(
          "event" -> "remote_catalog_run",
          "catalog_id" -> catalog.id,
          "created" -> report.results.flatMap(_.created),
          "updated" -> report.results.flatMap(_.updated),
          "deleted" -> report.results.flatMap(_.deleted)
        )
      )(using env)
    pruneAudit(tenant, catalog)
  }

  private def pruneAudit(tenant: Tenant, catalog: RemoteCatalog): Unit = {
    val repo = env.dataStore.auditTrailRepo.forTenant(tenant.id)
    repo
      .find(
        Json.obj("@userId" -> auditUserId),
        Some(Json.obj("@timestamp" -> -1))
      )
      .map { events =>
        val mine = events.filter(e =>
          (e \ "details" \ "catalog_id").asOpt[String].contains(catalog.id)
        )
        val toDelete =
          mine.drop(auditKeep).flatMap(e => (e \ "_id").asOpt[String])
        if (toDelete.nonEmpty) {
          repo.delete(
            Json.obj(
              "_id" -> Json.obj("$in" -> JsArray(toDelete.map(JsString.apply)))
            )
          )
        }
      }
  }
}
