package fr.maif.daikoku.services.catalog

import fr.maif.daikoku.controllers.{
  ApiAdminApiController,
  ApiSubscriptionAdminApiController,
  CmsPagesAdminApiController,
  KeyringAdminApiController,
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
  ReconcileFinalIds,
  Yaml
}
import org.apache.pekko.stream.connectors.file.ArchiveMetadata
import org.apache.pekko.stream.connectors.file.scaladsl.Archive
import org.apache.pekko.stream.scaladsl.Source
import org.apache.pekko.util.ByteString
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future}

case class ReconcileResult(
    kind: String,
    created: Seq[String],
    updated: Seq[String],
    deleted: Seq[String],
    detached: Seq[String],
    errors: Seq[String]
) {
  def json: JsValue = Json.obj(
    "kind" -> kind,
    "created" -> created.size,
    "updated" -> updated.size,
    "deleted" -> deleted.size,
    "detached" -> detached.size,
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

object RemoteCatalogEngine {
  val kindOrder: Seq[String] =
    Seq("team", "usage-plan", "api", "keyring", "api-subscription", "cms-page")
}

class RemoteCatalogEngine(
    env: Env,
    apiController: ApiAdminApiController,
    usagePlanController: UsagePlansAdminApiController,
    teamController: TeamAdminApiController,
    cmsPageController: CmsPagesAdminApiController,
    apiSubscriptionController: ApiSubscriptionAdminApiController,
    keyringController: KeyringAdminApiController
) {

  private implicit val ec: ExecutionContext = env.defaultExecutionContext

  private val logger = Logger("daikoku-remote-catalog-engine")

  private val controllers: Map[String, AdminApiController[?, ? <: ValueType]] =
    Map(
      apiController.entityName -> apiController,
      usagePlanController.entityName -> usagePlanController,
      teamController.entityName -> teamController,
      cmsPageController.entityName -> cmsPageController,
      apiSubscriptionController.entityName -> apiSubscriptionController,
      keyringController.entityName -> keyringController
    )

  import RemoteCatalogEngine.kindOrder

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
    logger.info(
      s"deploying catalog ${catalog.id.value} / ${catalog.source.kind} on tenant ${tenant.id.value}"
    )
    Future.unit
      .flatMap(_ => doFetchAndReconcile(tenant, catalog, dryRun = false))
      .flatMap(result => saveRun(tenant, catalog, result).map(_ => result))
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
        RemoteContentParser
          .parseRawContent(file.content, file.path)
          .map(_.map(_.copy(path = file.path)))
      )
    )

    checkAndReconcile(tenant, catalog, parsed, dryRun = true)
      .map(result => toRun(tenant, catalog, result))
  }

  def undeploy(
      tenant: Tenant,
      catalog: RemoteCatalog
  ): Future[Either[JsValue, DeployReport]] = {
    logger.info(
      s"undeploying catalog ${catalog.id.value} on tenant ${tenant.id.value}"
    )
    Future.unit
      .flatMap(_ => doUndeploy(tenant, catalog))
      .flatMap(result => saveRun(tenant, catalog, result).map(_ => result))
  }

  // the deployed entities stay in Daikoku, no longer managed by any catalog
  def detach(tenant: Tenant, catalog: RemoteCatalog): Future[Unit] =
    Future
      .sequence(kindOrder.map { kind =>
        val repo = controllers(kind).entityStore(tenant, env.dataStore)

        repo.execute(
          s"UPDATE ${repo.tableName} SET content = content #- '{metadata,created_by}' " +
            "WHERE content->>'_tenant' = $1 AND content->'metadata'->>'created_by' = $2",
          Seq(tenant.id.value, s"remote_catalog=${catalog.id.value}")
        )
      })
      .map(_ => ())

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
          checkTeamFolders(tenant, catalog, entities).flatMap { teamErrors =>
            if (teamErrors.isEmpty) reconcile(tenant, catalog, entities, dryRun)
            else
              Future.successful(
                Left(
                  errorsJson(
                    s"Catalog ${catalog.id.value} is invalid, nothing was applied",
                    teamErrors
                  )
                )
              )
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

  // folderPerTeam: teams/<teamId>/ may only declare the entities of that team
  // e.g. [teams/team-mobile/sub.yaml (team: team-weather)]
  //   -> Seq(RemoteCatalogError(".../sub.yaml", "api-subscription sub-1: belongs to team 'team-weather', not to 'teams/team-mobile'"))
  //      Seq.empty when folderPerTeam is off, the source is not GitHub / GitLab or nothing is under teams/
  private def checkTeamFolders(
      tenant: Tenant,
      catalog: RemoteCatalog,
      entities: Seq[RemoteEntity]
  ): Future[Seq[RemoteCatalogError]] = {
    val isGitSource = Set("github", "gitlab").contains(catalog.source.kind)

    val inTeamFolders = entities
        .flatMap(entity => teamFolderOf(entity).map(entity -> _))

    if (catalog.folderPerTeam && isGitSource && inTeamFolders.nonEmpty) {
      checkEachTeamFolder(tenant, entities, inTeamFolders)
    } else {
      Future.successful(Seq.empty)
    }
  }

  // e.g. inTeamFolders = Seq(api-weather -> "team-weather", sub-1 -> "team-mobile")
  //   -> the errors of the entities that do not belong to their folder team
  private def checkEachTeamFolder(
      tenant: Tenant,
      entities: Seq[RemoteEntity],
      inTeamFolders: Seq[(RemoteEntity, String)]
  ): Future[Seq[RemoteCatalogError]] = {
    val runPlans = runPlanTeams(entities)

    val plansToRead = inTeamFolders
      .map { case (entity, _) => entity }
      .filter(_.kind == "usage-plan")
      .map(_.id)
      .filterNot(runPlans.contains)
      .toSet

    for {
      dbTeams <- controllers("team").readExistingEntities(tenant)
      dbPlans <- dbPlanTeams(tenant, plansToRead)
    } yield {
      val runTeams = entities.filter(_.kind == "team").map(_.id)
      val knownTeams = dbTeams.keySet ++ runTeams
      val planTeams = dbPlans ++ runPlans

      inTeamFolders.flatMap { case (entity, folder) =>
        teamFolderError(entity, folder, knownTeams, planTeams)
          .map(message => RemoteCatalogError(entity.source, message))
      }
    }
  }

  // e.g. api-weather (team: team-weather) in "team-weather" -> None
  //      api-weather (team: team-weather) in "team-mobile"  -> Some("... belongs to team 'team-weather', not to 'teams/team-mobile'")
  //      anything in "unknown-team"                          -> Some("... folder 'teams/unknown-team' does not match any team")
  private def teamFolderError(
      entity: RemoteEntity,
      folder: String,
      knownTeams: Set[String],
      planTeams: Map[String, String]
  ): Option[String] = {
    val prefix = s"${entity.kind} ${entity.id}"
    val owner = ownerTeam(entity, planTeams)

    if (!knownTeams.contains(folder)) {
      Some(s"$prefix: folder 'teams/$folder' does not match any team")
    } else if (entity.kind == "cms-page") {
      Some(s"$prefix: a cms-page cannot be declared in a team folder")
    } else if (!owner.contains(folder)) {
      Some(
        s"$prefix: belongs to team '${owner.getOrElse("none")}', not to 'teams/$folder'"
      )
    } else {
      None
    }
  }

  // e.g. "teams/team-a/api.yaml" -> Some("team-a"),
  //      "teams/team-a/apis/api.yaml" -> Some("team-a"),
  //      "pages/home.yaml" -> None, "api.yaml" -> None
  private def teamFolderOf(entity: RemoteEntity): Option[String] =
    entity.path.split("/").toSeq match {
      case "teams" +: team +: _ +: _ => Some(team)
      case _                         => None
    }

  // e.g. team team-weather -> Some("team-weather")
  //      usage-plan plan-free with planTeams(plan-free -> team-weather) -> Some("team-weather")
  //      api / keyring / api-subscription -> their "team" field
  private def ownerTeam(
      entity: RemoteEntity,
      planTeams: Map[String, String]
  ): Option[String] =
    entity.kind match {
      case "team"       => Some(entity.id)
      case "usage-plan" => planTeams.get(entity.id)
      case _            => (entity.content \ "team").asOpt[String]
    }

  // e.g. Map("plan-free" -> "team-weather")
  private def runPlanTeams(entities: Seq[RemoteEntity]): Map[String, String] =
    entities
      .filter(_.kind == "api")
      .flatMap { api =>
        val team = (api.content \ "team").asOpt[String]

        (api.content \ "possibleUsagePlans")
          .asOpt[Seq[String]]
          .getOrElse(Seq.empty)
          .flatMap(plan => team.map(plan -> _))
      }
      .toMap

  // one query for every plan, e.g. Map("plan-gold" -> "team-weather")
  private def dbPlanTeams(
      tenant: Tenant,
      planIds: Set[String]
  ): Future[Map[String, String]] =
    if (planIds.isEmpty) {
      Future.successful(Map.empty)
    } else {
      val repo = env.dataStore.apiRepo.forTenant(tenant)

      repo
        .query(
          s"SELECT content FROM ${repo.tableName} " +
            "WHERE content->>'_tenant' = $1 AND content->'possibleUsagePlans' ?| $2",
          Seq(tenant.id.value, planIds.toArray)
        )
        .map(apis =>
          apis.flatMap { api =>
            api.possibleUsagePlans
              .map(_.value)
              .filter(planIds.contains)
              .map(_ -> api.team.value)
          }.toMap
        )
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
      val finalIds = computeFinalIds(tenant, databaseState, toDelete, entities)
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
          prepareAllWrites(
            tenant,
            metadataKey,
            entities,
            finalIds,
            catalog.adoptExisting
          ).flatMap {
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
    val limitIsActive = catalog.allowDeletions &&
      catalog.maxDeletionPercent != -1 && managedCount >= 5

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
      tenant: Tenant,
      databaseState: DatabaseState,
      toDelete: Seq[(String, String)],
      entities: Seq[RemoteEntity]
  ): ReconcileFinalIds = {
    val deleted = toDelete.toSet

    ReconcileFinalIds(
      kindOrder.map { kind =>
        val keptInDb =
          databaseState(kind).keySet.filterNot(id =>
            deleted.contains((kind, id))
          )
        val fromRun = entities.filter(_.kind == kind).map(_.id).toSet

        kind -> (keptInDb ++ fromRun)
      }.toMap +
        ("tenant" -> Set(tenant.id.value)) +
        ("otoroshi-settings" -> tenant.otoroshiSettings.map(_.id.value))
    )
  }

  private def prepareAllWrites(
      tenant: Tenant,
      metadataKey: String,
      entities: Seq[RemoteEntity],
      finalIds: ReconcileFinalIds,
      adoptExisting: Boolean
  ): Future[Either[Seq[RemoteCatalogError], Seq[CatalogWrite]]] = {
    Future
      .sequence(kindOrder.map { kind =>
        val kindEntities = entities.filter(_.kind == kind)
        val raws =
          kindEntities.map(e => withCreatedByMetadata(e.content, metadataKey))

        controllers(kind)
          .prepareWrites(tenant, raws, metadataKey, finalIds, adoptExisting)
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
        val removeEntity =
          if (catalog.allowDeletions) deleteEntity(tenant, dryRun)
          else detachEntity(tenant, dryRun)

        runOneByOne(toDelete)(removeEntity)
          .map(removals => buildReport(tenant, catalog, Seq(upserts, removals)))
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

  // allowDeletions off: the entity stays, without its catalog tag
  private def detachEntity(tenant: Tenant, dryRun: Boolean)(
      kindAndId: (String, String)
  ): Future[Either[WriteError, WrittenEntity]] = {
    val (kind, id) = kindAndId
    val detached = WrittenEntity(kind, id, "detached")

    if (dryRun) {
      Future.successful(Right(detached))
    } else {
      val repo = controllers(kind).entityStore(tenant, env.dataStore)

      repo
        .execute(
          s"UPDATE ${repo.tableName} SET content = content #- '{metadata,created_by}' " +
            "WHERE _id = $1 AND content->>'_tenant' = $2",
          Seq(id, tenant.id.value)
        )
        .map(_ => Right(detached))
        .recover { case e: Throwable =>
          Left(WriteError(kind, s"Error detaching $id: ${e.getMessage}"))
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
        detached = idsOf(kind, "detached"),
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
  // Export
  // ---------------------------------------------------------------------------

  // a zip with one folder per kind and one file per entity, e.g. api/api-weather.yaml
  def exportTenant(
      tenant: Tenant,
      includeManaged: Boolean
  ): Source[ByteString, ?] =
    Source(kindOrder)
      .flatMapConcat(kind =>
        exportOf(kind, controllers(kind), tenant, includeManaged)
      )
      .via(Archive.zip())

  private def exportOf[Of, Id <: ValueType](
      kind: String,
      controller: AdminApiController[Of, Id],
      tenant: Tenant,
      includeManaged: Boolean
  ): Source[(ArchiveMetadata, Source[ByteString, Any]), ?] =
    controller
      .entityStore(tenant, env.dataStore)
      .streamAllRawFormatted()
      .filter(entity =>
        includeManaged || !controller.readMetadata(entity).contains("created_by")
      )
      .map { entity =>
        val spec = controller.toJson(entity).as[JsObject]
        val exported =
          if (kind == "keyring")
            KeyringAdminApiController.secretFields.foldLeft(spec)(_ - _)
          else spec
        val document = Json.obj(
          "apiVersion" -> "daikoku.io/v1",
          "kind" -> kind,
          "spec" -> exported
        )

        ArchiveMetadata(s"$kind/${controller.getId(entity).value}.yaml") ->
          Source.single(ByteString(Yaml.write(document)))
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
          detached = report.results.flatMap(_.detached),
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
    env.dataStore.remoteCatalogRunRepo
      .findByCatalog(tenant.id, catalog.id)
      .flatMap { newestFirst =>
        val oldIds = newestFirst.drop(runsKept).map(_.id)

        if (oldIds.isEmpty) {
          Future.unit
        } else {
          env.dataStore.remoteCatalogRunRepo
            .forTenant(tenant)
            .deleteByIds(oldIds)
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
