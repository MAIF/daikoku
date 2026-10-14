package fr.maif.daikoku.services.catalog

import fr.maif.daikoku.controllers.{
  ApiAdminApiController,
  ApiDocumentationPageAdminApiController,
  ApiSubscriptionAdminApiController,
  CmsPagesAdminApiController,
  KeyringAdminApiController,
  TeamAdminApiController,
  UsagePlansAdminApiController
}
import fr.maif.daikoku.domain.{
  DatastoreId,
  RemoteCatalog,
  RemoteCatalogError,
  RemoteCatalogId,
  RemoteCatalogRun,
  RemoteCatalogRunEntity,
  RemoteCatalogRunStatus,
  Tenant,
  ValueType
}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.storage.drivers.postgres.{Col, PostgresDataStore}
import fr.maif.daikoku.utils.{
  AdminApiController,
  ExistingEntities,
  ExistingEntity,
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

enum ExportSelection:
  case WholeTenant(includeManaged: Boolean)
  case OneEntity(kind: String, id: String, withChildren: Boolean)

enum ExportFormat:
  case Zip, MultiDocument

object RemoteCatalogEngine {
  val kindOrder: Seq[String] =
    Seq(
      "team",
      "cms-page",
      "api-documentation-page",
      "usage-plan",
      "api",
      "keyring",
      "api-subscription"
    )
}

class RemoteCatalogEngine(
    env: Env,
    apiController: ApiAdminApiController,
    usagePlanController: UsagePlansAdminApiController,
    teamController: TeamAdminApiController,
    cmsPageController: CmsPagesAdminApiController,
    apiSubscriptionController: ApiSubscriptionAdminApiController,
    keyringController: KeyringAdminApiController,
    apiDocumentationPageController: ApiDocumentationPageAdminApiController
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
      keyringController.entityName -> keyringController,
      apiDocumentationPageController.entityName -> apiDocumentationPageController
    )

  import RemoteCatalogEngine.kindOrder

  // kind -> existing entities, e.g. Map("team" -> Map("team-a" -> Some("remote_catalog=cat-git")))
  private type DatabaseState = Map[String, ExistingEntities]

  // e.g. (Seq("content->>'api' = $1"), Seq("api-weather"))
  private type SqlFilter = (Seq[String], Seq[AnyRef])

  private case class CatalogWrite(entity: RemoteEntity, prepared: PreparedWrite)

  private case class WrittenEntity(
      entity: RemoteCatalogRunEntity,
      action: String
  )

  private case class WriteOutcome(
      written: Seq[WrittenEntity],
      error: Option[RemoteCatalogError]
  )

  private type RunResult = Either[Seq[RemoteCatalogError], WriteOutcome]

  // ---------------------------------------------------------------------------
  // Entry points
  // ---------------------------------------------------------------------------

  def deploy(
      tenant: Tenant,
      catalog: RemoteCatalog
  ): Future[RemoteCatalogRun] = {
    logger.info(
      s"deploying catalog ${catalog.id.value} / ${catalog.source.kind} on tenant ${tenant.id.value}"
    )
    Future.unit
      .flatMap(_ => doFetchAndReconcile(tenant, catalog, dryRun = false))
      .map(result => toRun(tenant, catalog.id, result))
      .flatMap(run => saveRun(tenant, catalog, run).map(_ => run))
  }

  def dryRun(
      tenant: Tenant,
      catalog: RemoteCatalog
  ): Future[RemoteCatalogRun] =
    doFetchAndReconcile(tenant, catalog, dryRun = true)
      .map(result => toRun(tenant, catalog.id, result))

  def validate(
      tenant: Tenant,
      catalog: RemoteCatalog,
      files: Seq[CatalogFile]
  ): Future[RemoteCatalogRun] =
    checkAndReconcile(tenant, Some(catalog), parseFiles(files), dryRun = true)
      .map(result => toRun(tenant, catalog.id, result))

  // writes without any catalog ownership: back office only, never on the admin API
  def loadResources(
      tenant: Tenant,
      files: Seq[CatalogFile],
      dryRun: Boolean
  ): Future[RemoteCatalogRun] =
    checkAndReconcile(tenant, None, parseFiles(files), dryRun)
      .map(result => toRun(tenant, resourceLoaderId, result))

  private val resourceLoaderId = RemoteCatalogId("resource-loader")

  private def runIdOf(catalog: Option[RemoteCatalog]): RemoteCatalogId =
    catalog.fold(resourceLoaderId)(_.id)

  private def parseFiles(
      files: Seq[CatalogFile]
  ): Either[Seq[RemoteCatalogError], Seq[RemoteEntity]] =
    RemoteCatalogError.collect(
      files.map(file =>
        RemoteContentParser
          .parseRawContent(file.content, file.path)
          .map(_.map(_.copy(path = file.path)))
      )
    )

  def undeploy(
      tenant: Tenant,
      catalog: RemoteCatalog
  ): Future[RemoteCatalogRun] = {
    logger.info(
      s"undeploying catalog ${catalog.id.value} on tenant ${tenant.id.value}"
    )
    Future.unit
      .flatMap(_ => doUndeploy(tenant, catalog))
      .map(result => toRun(tenant, catalog.id, result))
      .flatMap(run => saveRun(tenant, catalog, run).map(_ => run))
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
  ): Future[RunResult] = {
    CatalogSources.get(catalog.source.kind) match {
      case None =>
        Future.successful(
          Left(
            Seq(
              RemoteCatalogError(
                s"catalog ${catalog.id.value}",
                s"Unknown source kind: ${catalog.source.kind}"
              )
            )
          )
        )
      case Some(source) =>
        source
          .fetch(catalog)(using ec, env)
          .flatMap(fetched =>
            checkAndReconcile(tenant, Some(catalog), fetched, dryRun)
          )
    }
  }

  private def checkAndReconcile(
      tenant: Tenant,
      catalog: Option[RemoteCatalog],
      fetched: Either[Seq[RemoteCatalogError], Seq[RemoteEntity]],
      dryRun: Boolean
  ): Future[RunResult] =
    fetched match {
      case Left(errors) =>
        Future.successful(Left(errors))
      case Right(entities) =>
        val validationErrors = entities.flatMap(entity =>
          checkKind(catalog.fold(Set.empty[String])(_.allowedKinds), entity) ++
            checkTenant(tenant, entity)
        )

        if (validationErrors.nonEmpty) {
          Future.successful(Left(validationErrors))
        } else {
          reconcile(tenant, catalog, entities, dryRun)
        }
    }

  private def checkKind(
      allowedKinds: Set[String],
      entity: RemoteEntity
  ): Option[RemoteCatalogError] = {
    val kindIsAllowed =
      allowedKinds.isEmpty || allowedKinds.contains(entity.kind)

    if (!controllers.contains(entity.kind)) {
      Some(
        RemoteCatalogError(
          entity.source,
          s"Unknown kind: ${entity.kind}",
          Some(entity.runEntity)
        )
      )
    } else if (!kindIsAllowed) {
      Some(
        RemoteCatalogError(
          entity.source,
          s"Kind '${entity.kind}' not allowed for this catalog",
          Some(entity.runEntity)
        )
      )
    } else {
      None
    }
  }

  private def checkTenant(
      tenant: Tenant,
      entity: RemoteEntity
  ): Option[RemoteCatalogError] =
    (entity.content \ "_tenant").asOpt[String] match {
      case None =>
        Some(
          RemoteCatalogError(
            entity.source,
            "Missing required field '_tenant'",
            Some(entity.runEntity)
          )
        )
      case Some(value) if value != tenant.id.value =>
        Some(
          RemoteCatalogError(
            entity.source,
            s"_tenant '$value' is not the catalog tenant '${tenant.id.value}'",
            Some(entity.runEntity)
          )
        )
      case Some(_) => None
    }

  // folderPerTeam: teams/<teamId>/ may only declare the entities of that team
  // e.g. [teams/team-mobile/sub.yaml (team: team-weather)]
  //   -> Seq(RemoteCatalogError(".../sub.yaml", "Belongs to team 'team-weather', not to 'teams/team-mobile'", Some(sub-1)))
  //      Seq.empty when folderPerTeam is off, the source is not GitHub / GitLab or nothing is under teams/
  private def checkTeamFolders(
      tenant: Tenant,
      catalog: Option[RemoteCatalog],
      entities: Seq[RemoteEntity],
      dbTeams: ExistingEntities
  ): Future[Seq[RemoteCatalogError]] = {
    val isGitSource =
      catalog.exists(c => Set("github", "gitlab").contains(c.source.kind))

    val inTeamFolders = entities
        .flatMap(entity => teamFolderOf(entity).map(entity -> _))

    if (catalog.exists(_.folderPerTeam) && isGitSource && inTeamFolders.nonEmpty) {
      checkEachTeamFolder(tenant, entities, inTeamFolders, dbTeams)
    } else {
      Future.successful(Seq.empty)
    }
  }

  // e.g. inTeamFolders = Seq(api-weather -> "team-weather", sub-1 -> "team-mobile")
  //   -> the errors of the entities that do not belong to their folder team
  private def checkEachTeamFolder(
      tenant: Tenant,
      entities: Seq[RemoteEntity],
      inTeamFolders: Seq[(RemoteEntity, String)],
      dbTeams: ExistingEntities
  ): Future[Seq[RemoteCatalogError]] = {
    val runPlans = runPlanTeams(entities)

    val plansToRead = inTeamFolders
      .map { case (entity, _) => entity }
      .filter(_.kind == "usage-plan")
      .map(_.id)
      .filterNot(runPlans.contains)
      .toSet

    dbPlanTeams(tenant, plansToRead).map { dbPlans =>
      val runTeams = entities.filter(_.kind == "team").map(_.id)
      val knownTeams = dbTeams.keySet ++ runTeams
      val planTeams = dbPlans ++ runPlans
      val pageTeams = runPageTeams(entities, planTeams)

      inTeamFolders.flatMap { case (entity, folder) =>
        teamFolderError(entity, folder, knownTeams, planTeams, pageTeams)
          .map(message =>
            RemoteCatalogError(entity.source, message, Some(entity.runEntity))
          )
      }
    }
  }

  // e.g. api-weather (team: team-weather) in "team-weather" -> None
  //      api-weather (team: team-weather) in "team-mobile"  -> Some("Belongs to team 'team-weather', not to 'teams/team-mobile'")
  //      anything in "unknown-team"                          -> Some("Folder 'teams/unknown-team' does not match any team")
  private def teamFolderError(
      entity: RemoteEntity,
      folder: String,
      knownTeams: Set[String],
      planTeams: Map[String, String],
      pageTeams: Map[String, String]
  ): Option[String] = {
    val owner = ownerTeam(entity, planTeams, pageTeams)
    val isUnusedPage =
      entity.kind == "api-documentation-page" && owner.isEmpty

    if (!knownTeams.contains(folder)) {
      Some(s"Folder 'teams/$folder' does not match any team")
    } else if (entity.kind == "cms-page") {
      Some("A cms-page cannot be declared in a team folder")
    } else if (isUnusedPage) {
      Some(
        "A documentation page in a team folder must be used by an api or a plan of the catalog"
      )
    } else if (!owner.contains(folder)) {
      Some(
        s"Belongs to team '${owner.getOrElse("none")}', not to 'teams/$folder'"
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
  //      api-documentation-page page-1 with pageTeams(page-1 -> team-weather) -> Some("team-weather")
  //      api / keyring / api-subscription -> their "team" field
  private def ownerTeam(
      entity: RemoteEntity,
      planTeams: Map[String, String],
      pageTeams: Map[String, String]
  ): Option[String] =
    entity.kind match {
      case "team"                   => Some(entity.id)
      case "usage-plan"             => planTeams.get(entity.id)
      case "api-documentation-page" => pageTeams.get(entity.id)
      case _                        => (entity.content \ "team").asOpt[String]
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

  // e.g. api-weather (team-weather) with page-1, plan-free (team-weather) with page-2
  //   -> Map("page-1" -> "team-weather", "page-2" -> "team-weather")
  private def runPageTeams(
      entities: Seq[RemoteEntity],
      planTeams: Map[String, String]
  ): Map[String, String] =
    entities.flatMap { entity =>
      val team = entity.kind match {
        case "api"        => (entity.content \ "team").asOpt[String]
        case "usage-plan" => planTeams.get(entity.id)
        case _            => None
      }
      val pageIds =
        documentationPageIds(entity.content \ "documentation" \ "pages")

      team.toSeq.flatMap(owner => pageIds.map(_ -> owner))
    }.toMap

  // e.g. [{ "id": "page-1", "children": [{ "id": "page-1-1", "children": [] }] }] -> Seq("page-1", "page-1-1")
  private def documentationPageIds(pages: JsLookupResult): Seq[String] =
    pages.asOpt[Seq[JsObject]].getOrElse(Seq.empty).flatMap { page =>
      (page \ "id").asOpt[String].toSeq ++
        documentationPageIds(page \ "children")
    }

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

  // ---------------------------------------------------------------------------
  // Orchestration — phase 2 then phase 3
  // ---------------------------------------------------------------------------

  private def reconcile(
      tenant: Tenant,
      catalog: Option[RemoteCatalog],
      entities: Seq[RemoteEntity],
      dryRun: Boolean
  ): Future[RunResult] = {
    val metadataKey = catalog.map(c => s"remote_catalog=${c.id.value}")

    val databaseReads =
      readDatabaseState(tenant).zip(readKnownUsers(entities))

    databaseReads.flatMap { (databaseState, knownUsers) =>
      val toDelete =
        computeEntitiesToDelete(databaseState, metadataKey, entities)
      val finalIds =
        computeFinalIds(tenant, databaseState, toDelete, entities, knownUsers)
      val deletionLimitError =
        catalog.flatMap(c => checkDeletionLimit(c, databaseState, toDelete))
      val checkErrors =
        checkDuplicateIds(catalog, entities).toSeq ++
          deletionLimitError ++
          checkApiNames(databaseState, toDelete, entities)
      val teamFolderErrors =
        checkTeamFolders(tenant, catalog, entities, databaseState("team"))

      teamFolderErrors.flatMap { teamErrors =>
        val allErrors = checkErrors ++ teamErrors

        if (allErrors.nonEmpty) {
          Future.successful(Left(allErrors))
        } else {
          prepareAllWrites(
            tenant,
            metadataKey,
            entities,
            finalIds,
            catalog.exists(_.adoptExisting)
          ).flatMap {
            case Left(errors) =>
              Future.successful(Left(errors))
            case Right(writes) =>
              writeAll(tenant, catalog, writes, toDelete, dryRun).map(Right(_))
          }
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

  // one query for every user of the catalog
  // e.g. team-a (members user-1, user-2), sub-1 (by user-3), user-2 unknown -> Set("user-1", "user-3")
  private def readKnownUsers(
      entities: Seq[RemoteEntity]
  ): Future[Set[String]] = {
    val referenced = entities.flatMap(referencedUsers).distinct

    if (referenced.isEmpty) {
      Future.successful(Set.empty)
    } else {
      val table = env.dataStore.userRepo.tableName

      env.dataStore
        .asInstanceOf[PostgresDataStore]
        .queryRawMapped(
          s"SELECT _id FROM $table WHERE _id = ANY($$1::text[])",
          Seq(Col.str("_id")),
          Seq(referenced.toArray)
        )
        .map(_.map(row => (row \ "_id").as[String]).toSet)
    }
  }

  // e.g. team -> its members, api-subscription -> its "by"
  private def referencedUsers(entity: RemoteEntity): Seq[String] =
    entity.kind match {
      case "team" =>
        (entity.content \ "users")
          .asOpt[Seq[JsObject]]
          .getOrElse(Seq.empty)
          .flatMap(member => (member \ "userId").asOpt[String])
      case "api-subscription" =>
        (entity.content \ "by").asOpt[String].toSeq
      case _ =>
        Seq.empty
    }

  private def computeEntitiesToDelete(
      databaseState: DatabaseState,
      metadataKey: Option[String],
      entities: Seq[RemoteEntity]
  ): Seq[RemoteCatalogRunEntity] = {
    val remoteIds = entities.map(e => (e.kind, e.id)).toSet

    kindOrder.reverse.flatMap { kind =>
      databaseState(kind).toSeq.collect {
        case (id, existing)
            if metadataKey.exists(key => existing.createdBy.contains(key)) &&
              !remoteIds.contains((kind, id)) =>
          RemoteCatalogRunEntity(kind, id, existing.name)
      }
    }
  }

  private def checkDeletionLimit(
      catalog: RemoteCatalog,
      databaseState: DatabaseState,
      toDelete: Seq[RemoteCatalogRunEntity]
  ): Option[RemoteCatalogError] = {
    val metadataKey = s"remote_catalog=${catalog.id.value}"
    val managedCount = databaseState.values
      .flatMap(_.values)
      .count(_.createdBy.contains(metadataKey))
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

  // e.g. plan-free declared in two files
  //   -> Some(RemoteCatalogError("catalog cat-git", "Declared more than once: usage-plan 'plan-free'"))
  private def checkDuplicateIds(
      catalog: Option[RemoteCatalog],
      entities: Seq[RemoteEntity]
  ): Option[RemoteCatalogError] = {
    val keys = entities.map(entity => (entity.kind, entity.id))

    if (keys.toSet.size == keys.size) {
      None
    } else {
      val duplicates = keys
        .diff(keys.distinct)
        .distinct
        .map { case (kind, id) => s"$kind '$id'" }
        .mkString(", ")

      Some(
        RemoteCatalogError(
          s"catalog ${runIdOf(catalog).value}",
          s"Declared more than once: $duplicates"
        )
      )
    }
  }

  // final apis = the catalog apis + the database apis it neither replaces nor deletes
  // e.g. api-a "Weather" in the catalog, api-b "Weather" kept in database -> an error on api-a
  //      api-a and api-b swapping their names -> Seq.empty
  //      api-a "Weather" and its version api-a-v2 "Weather" -> Seq.empty
  private def checkApiNames(
      databaseState: DatabaseState,
      toDelete: Seq[RemoteCatalogRunEntity],
      entities: Seq[RemoteEntity]
  ): Seq[RemoteCatalogError] = {
    val catalogApis = entities
      .filter(_.kind == "api")
      .map(api =>
        api -> ExistingEntity(
          createdBy = None,
          name = (api.content \ "name").asOpt[String],
          parent = (api.content \ "parent").asOpt[String]
        )
      )
    val replacedOrDeleted =
      catalogApis.map { case (api, _) => api.id }.toSet ++
        toDelete.filter(_.kind == "api").map(_.id)
    val keptApis = databaseState("api").toSeq.filterNot { case (id, _) =>
      replacedOrDeleted.contains(id)
    }
    val finalApis =
      keptApis ++ catalogApis.map { case (api, existing) => api.id -> existing }
    val finalApisByName = finalApis.groupBy { case (_, api) => api.name }

    catalogApis.flatMap {
      case (api, ExistingEntity(_, Some(name), None)) =>
        val conflict = finalApisByName
          .getOrElse(Some(name), Seq.empty)
          .collectFirst {
            case (id, other) if id != api.id && !other.parent.contains(api.id) =>
              id
          }

        conflict.map(id =>
          RemoteCatalogError(
            api.source,
            s"Api name '$name' is already used by '$id'",
            Some(api.runEntity)
          )
        )
      case _ =>
        None
    }
  }

  private def computeFinalIds(
      tenant: Tenant,
      databaseState: DatabaseState,
      toDelete: Seq[RemoteCatalogRunEntity],
      entities: Seq[RemoteEntity],
      knownUsers: Set[String]
  ): ReconcileFinalIds = {
    val deleted = toDelete.map(entity => (entity.kind, entity.id)).toSet

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
        ("otoroshi-settings" -> tenant.otoroshiSettings.map(_.id.value)) +
        ("user" -> knownUsers)
    )
  }

  private def prepareAllWrites(
      tenant: Tenant,
      metadataKey: Option[String],
      entities: Seq[RemoteEntity],
      finalIds: ReconcileFinalIds,
      adoptExisting: Boolean
  ): Future[Either[Seq[RemoteCatalogError], Seq[CatalogWrite]]] = {
    Future
      .sequence(kindOrder.map { kind =>
        val kindEntities = entities.filter(_.kind == kind)
        val raws = kindEntities.map(e =>
          metadataKey.fold(e.content)(withCreatedByMetadata(e.content, _))
        )

        controllers(kind)
          .prepareWrites(tenant, raws, metadataKey, finalIds, adoptExisting)
          .map(results => kindEntities.zip(results))
      })
      .map { perKind =>
        val results = perKind.flatten
        val errors = results.collect { case (entity, Left(message)) =>
          RemoteCatalogError(entity.source, message, Some(entity.runEntity))
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
      catalog: Option[RemoteCatalog],
      writes: Seq[CatalogWrite],
      toDelete: Seq[RemoteCatalogRunEntity],
      dryRun: Boolean
  ): Future[WriteOutcome] = {
    runOneByOne(writes)(writeEntity(dryRun)).flatMap { upserts =>
      if (upserts.error.isDefined) {
        Future.successful(upserts)
      } else {
        val source = s"catalog ${runIdOf(catalog).value}"
        val removeEntity =
          if (catalog.exists(_.allowDeletions)) {
            deleteEntity(tenant, source, dryRun)
          } else {
            detachEntity(tenant, source, dryRun)
          }

        runOneByOne(toDelete, upserts.written)(removeEntity)
      }
    }
  }

  private def runOneByOne[A](
      items: Seq[A],
      written: Seq[WrittenEntity] = Seq.empty
  )(
      runOne: A => Future[Either[RemoteCatalogError, WrittenEntity]]
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
  ): Future[Either[RemoteCatalogError, WrittenEntity]] = {
    val entity = write.entity
    val written = WrittenEntity(entity.runEntity, write.prepared.action)

    def writeError(message: String): RemoteCatalogError =
      RemoteCatalogError(
        entity.source,
        s"Write failed: $message",
        Some(entity.runEntity)
      )

    if (dryRun) {
      Future.successful(Right(written))
    } else {
      write.prepared
        .write()
        .value
        .map {
          case Left(error) => Left(writeError(error.getErrorMessage()))
          case Right(_)    => Right(written)
        }
        .recover { case e: Throwable =>
          Left(writeError(e.getMessage))
        }
    }
  }

  private def deleteEntity(tenant: Tenant, source: String, dryRun: Boolean)(
      entity: RemoteCatalogRunEntity
  ): Future[Either[RemoteCatalogError, WrittenEntity]] = {
    def deleteError(message: String): RemoteCatalogError =
      RemoteCatalogError(source, s"Delete failed: $message", Some(entity))

    if (dryRun) {
      Future.successful(Right(WrittenEntity(entity, "deleted")))
    } else {
      controllers(entity.kind)
        .doDeleteById(tenant, entity.id)
        .map {
          case Left(error)   => Left(deleteError(error))
          case Right(action) => Right(WrittenEntity(entity, action))
        }
        .recover { case e: Throwable =>
          Left(deleteError(e.getMessage))
        }
    }
  }

  // allowDeletions off: the entity stays, without its catalog tag
  private def detachEntity(tenant: Tenant, source: String, dryRun: Boolean)(
      entity: RemoteCatalogRunEntity
  ): Future[Either[RemoteCatalogError, WrittenEntity]] = {
    val detached = WrittenEntity(entity, "detached")

    if (dryRun) {
      Future.successful(Right(detached))
    } else {
      val repo = controllers(entity.kind).entityStore(tenant, env.dataStore)

      repo
        .execute(
          s"UPDATE ${repo.tableName} SET content = content #- '{metadata,created_by}' " +
            "WHERE _id = $1 AND content->>'_tenant' = $2",
          Seq(entity.id, tenant.id.value)
        )
        .map(_ => Right(detached))
        .recover { case e: Throwable =>
          Left(
            RemoteCatalogError(
              source,
              s"Detach failed: ${e.getMessage}",
              Some(entity)
            )
          )
        }
    }
  }

  private def doUndeploy(
      tenant: Tenant,
      catalog: RemoteCatalog
  ): Future[RunResult] = {
    val metadataKey = s"remote_catalog=${catalog.id.value}"
    val source = s"catalog ${catalog.id.value}"

    readDatabaseState(tenant)
      .flatMap { databaseState =>
        val managed =
          computeEntitiesToDelete(databaseState, Some(metadataKey), Seq.empty)

        runOneByOne(managed)(deleteEntity(tenant, source, dryRun = false))
      }
      .map(Right(_))
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  def exportEntities(
      tenant: Tenant,
      selection: ExportSelection,
      format: ExportFormat
  ): Source[ByteString, ?] = {
    val filters = exportFilters(tenant, selection)
    val documents = Source(kindOrder.filter(filters.contains))
      .flatMapConcat(kind =>
        documentsOf(kind, controllers(kind), tenant, filters(kind))
      )

    format match {
      case ExportFormat.Zip =>
        documents
          .map { case (path, document) =>
            ArchiveMetadata(path) ->
              Source.single(ByteString(Yaml.write(document)))
          }
          .via(Archive.zip())
      case ExportFormat.MultiDocument =>
        documents
          .map { case (_, document) => ByteString(Yaml.write(document)) }
          .intersperse(ByteString("---\n"))
    }
  }

  // e.g. keyring-1 with children -> Map("keyring" -> _id = keyring-1, "api-subscription" -> keyring = keyring-1)
  private def exportFilters(
      tenant: Tenant,
      selection: ExportSelection
  ): Map[String, SqlFilter] =
    selection match {
      case ExportSelection.WholeTenant(includeManaged) =>
        val predicates =
          if (includeManaged) {
            Seq.empty
          } else {
            Seq("content->'metadata'->>'created_by' IS NULL")
          }

        kindOrder.map(kind => kind -> (predicates, Seq.empty)).toMap

      case ExportSelection.OneEntity(kind, id, withChildren) =>
        val root: Map[String, SqlFilter] = Map(kind -> (Seq("_id = $1"), Seq(id)))

        if (withChildren) {
          root ++ childrenFilters(tenant, kind, id)
        } else {
          root
        }
    }

  private def childrenFilters(
      tenant: Tenant,
      kind: String,
      id: String
  ): Map[String, SqlFilter] = {
    val apiTable = env.dataStore.apiRepo.forTenant(tenant).tableName

    def byField(field: String): SqlFilter =
      (Seq(s"content->>'$field' = $$1"), Seq(id))

    def plansOfApis(apisWhere: String): SqlFilter =
      (
        Seq(
          "_id IN (SELECT jsonb_array_elements_text(content->'possibleUsagePlans') " +
            s"FROM $apiTable WHERE $apisWhere AND content->>'_tenant' = $$2)"
        ),
        Seq(id, tenant.id.value)
      )

    val planTable = env.dataStore.usagePlanRepo.forTenant(tenant).tableName
    val pageIds =
      "jsonb_path_query(content, 'lax $.documentation.pages.**.id') #>> '{}'"

    // the documentation pages, children included, of the apis and of their plans
    def pagesOfApis(apisWhere: String): SqlFilter = {
      val apis =
        s"FROM $apiTable WHERE $apisWhere AND content->>'_tenant' = $$2"
      val apiPages = s"SELECT $pageIds $apis"
      val planPages =
        s"SELECT $pageIds FROM $planTable WHERE _id IN " +
          s"(SELECT jsonb_array_elements_text(content->'possibleUsagePlans') $apis)"

      (Seq(s"_id IN ($apiPages UNION $planPages)"), Seq(id, tenant.id.value))
    }

    def pagesOfPlan: SqlFilter =
      (
        Seq(
          s"_id IN (SELECT $pageIds FROM $planTable " +
            "WHERE _id = $1 AND content->>'_tenant' = $2)"
        ),
        Seq(id, tenant.id.value)
      )

    kind match {
      case "team" =>
        Map(
          "api-documentation-page" -> pagesOfApis("content->>'team' = $1"),
          "usage-plan" -> plansOfApis("content->>'team' = $1"),
          "api" -> byField("team"),
          "keyring" -> byField("team"),
          "api-subscription" -> byField("team")
        )
      case "api" =>
        Map(
          "api-documentation-page" -> pagesOfApis("_id = $1"),
          "usage-plan" -> plansOfApis("_id = $1"),
          "api-subscription" -> byField("api")
        )
      case "usage-plan" =>
        Map(
          "api-documentation-page" -> pagesOfPlan,
          "api-subscription" -> byField("plan")
        )
      case "keyring"    => Map("api-subscription" -> byField("keyring"))
      case _            => Map.empty
    }
  }

  // e.g. ("api/api-weather.yaml", { "apiVersion": "daikoku.io/v1", "kind": "api", "spec": {...} })
  private def documentsOf[Of, Id <: ValueType](
      kind: String,
      controller: AdminApiController[Of, Id],
      tenant: Tenant,
      filter: SqlFilter
  ): Source[(String, JsObject), ?] = {
    val (predicates, params) = filter

    controller
      .entityStore(tenant, env.dataStore)
      .streamAllRawFormatted(predicates, params)
      .map(entity =>
        s"$kind/${controller.getId(entity).value}.yaml" ->
          exportDocument(kind, controller, entity)
      )
  }

  // e.g. { "apiVersion": "daikoku.io/v1", "kind": "keyring", "spec": { ... } }
  private def exportDocument[Of, Id <: ValueType](
      kind: String,
      controller: AdminApiController[Of, Id],
      entity: Of
  ): JsObject =
    Json.obj(
      "apiVersion" -> "daikoku.io/v1",
      "kind" -> kind,
      "spec" -> controller.toJson(entity)
    )

  // ---------------------------------------------------------------------------
  // Run history
  // ---------------------------------------------------------------------------

  private def saveRun(
      tenant: Tenant,
      catalog: RemoteCatalog,
      run: RemoteCatalogRun
  ): Future[Unit] = {
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
      catalogId: RemoteCatalogId,
      result: RunResult
  ): RemoteCatalogRun = {
    val (status, written, errors) = result match {
      case Left(errors) =>
        (RemoteCatalogRunStatus.Failed, Seq.empty[WrittenEntity], errors)
      case Right(WriteOutcome(written, Some(error))) =>
        (RemoteCatalogRunStatus.Partial, written, Seq(error))
      case Right(WriteOutcome(written, None)) =>
        (
          RemoteCatalogRunStatus.Completed,
          written,
          Seq.empty[RemoteCatalogError]
        )
    }

    def entitiesWith(action: String): Seq[RemoteCatalogRunEntity] =
      written.filter(_.action == action).map(_.entity)

    RemoteCatalogRun(
      id = DatastoreId(IdGenerator.token(32)),
      tenant = tenant.id,
      catalog = catalogId,
      at = DateTime.now(),
      status = status,
      created = entitiesWith("created"),
      updated = entitiesWith("updated"),
      deleted = entitiesWith("deleted"),
      detached = entitiesWith("detached"),
      errors = errors
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
}
