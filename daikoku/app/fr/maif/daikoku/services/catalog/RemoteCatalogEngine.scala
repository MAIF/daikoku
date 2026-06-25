package fr.maif.daikoku.services.catalog

import fr.maif.daikoku.audit.JobEvent
import fr.maif.daikoku.controllers.{
  ApiAdminApiController,
  ApiSubscriptionAdminApiController,
  CmsPagesAdminApiController,
  TeamAdminApiController,
  UsagePlansAdminApiController
}
import fr.maif.daikoku.domain.{RemoteCatalog, Tenant, TenantId, User, UserId, ValueType}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.utils.AdminApiController
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
    "kind"    -> kind,
    "created" -> created.size,
    "updated" -> updated.size,
    "deleted" -> deleted.size,
    "errors"  -> JsArray(errors.map(JsString.apply))
  )
}

case class DeployReport(catalogId: String, tenant: String, results: Seq[ReconcileResult], timestamp: DateTime) {
  def json: JsValue = Json.obj(
    "catalog_id" -> catalogId,
    "tenant"     -> tenant,
    "results"    -> JsArray(results.map(_.json)),
    "timestamp"  -> timestamp.toString
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

  private val logger            = Logger("daikoku-remote-catalog-engine")
  private val deployingCatalogs = TrieMap.empty[String, Boolean]
  private val auditUserId       = "remote-catalog-job"
  private val auditKeep         = 10

  private val controllers: Map[String, AdminApiController[?, ? <: ValueType]] =
    Map(
      apiController.entityName             -> apiController,
      usagePlanController.entityName       -> usagePlanController,
      teamController.entityName            -> teamController,
      cmsPageController.entityName         -> cmsPageController,
      apiSubscriptionController.entityName -> apiSubscriptionController
    )

  private def jobUser(tenantId: TenantId): User =
    User(
      id = UserId(auditUserId),
      tenants = Set(tenantId),
      origins = Set.empty,
      name = "Remote Catalog Job",
      email = "",
      lastTenant = None,
      defaultLanguage = None,
      personalToken = None,
      isGuest = true
    )

  private def audit(tenant: Tenant, catalog: RemoteCatalog, report: DeployReport): Unit = {
    JobEvent(s"remote catalog ${catalog.id}")
      .logJobEvent(
        tenant,
        jobUser(tenant.id),
        Json.obj(
          "event"      -> "remote_catalog_run",
          "catalog_id" -> catalog.id,
          "created"    -> report.results.flatMap(_.created),
          "updated"    -> report.results.flatMap(_.updated),
          "deleted"    -> report.results.flatMap(_.deleted)
        )
      )(env)
    pruneAudit(tenant, catalog)
  }

  private def pruneAudit(tenant: Tenant, catalog: RemoteCatalog): Unit = {
    val repo = env.dataStore.auditTrailRepo.forTenant(tenant.id)
    repo
      .find(Json.obj("@userId" -> auditUserId), Some(Json.obj("@timestamp" -> -1)))
      .map { events =>
        val mine     = events.filter(e => (e \ "details" \ "catalog_id").asOpt[String].contains(catalog.id))
        val toDelete = mine.drop(auditKeep).flatMap(e => (e \ "_id").asOpt[String])
        if (toDelete.nonEmpty) {
          repo.delete(Json.obj("_id" -> Json.obj("$in" -> JsArray(toDelete.map(JsString.apply)))))
        }
      }
  }

  def deploy(tenant: Tenant, catalog: RemoteCatalog, args: JsObject): Future[Either[JsValue, DeployReport]] = {
    val key = s"${tenant.id.value}:${catalog.id}"
    if (deployingCatalogs.contains(key)) {
      Future.successful(Left(Json.obj("error" -> s"Catalog ${catalog.id} is already being deployed")))
    } else {
      deployingCatalogs.put(key, true)
      logger.info(s"deploying catalog ${catalog.id} / ${catalog.source.kind} on tenant ${tenant.id.value}")
      doFetchAndReconcile(tenant, catalog, args, dryRun = false)
        .andThen { case scala.util.Success(Right(report)) => audit(tenant, catalog, report) }
        .andThen { case _ => deployingCatalogs.remove(key) }
    }
  }

  def dryRun(tenant: Tenant, catalog: RemoteCatalog, args: JsObject): Future[Either[JsValue, DeployReport]] =
    doFetchAndReconcile(tenant, catalog, args, dryRun = true)

  def undeploy(tenant: Tenant, catalog: RemoteCatalog): Future[Either[JsValue, DeployReport]] = {
    val key = s"${tenant.id.value}:${catalog.id}"
    if (deployingCatalogs.contains(key)) {
      Future.successful(Left(Json.obj("error" -> s"Catalog ${catalog.id} is currently being deployed")))
    } else {
      deployingCatalogs.put(key, true)
      logger.info(s"undeploying catalog ${catalog.id} on tenant ${tenant.id.value}")
      doUndeploy(tenant, catalog)
        .andThen { case scala.util.Success(Right(report)) => audit(tenant, catalog, report) }
        .andThen { case _ => deployingCatalogs.remove(key) }
    }
  }

  private def doFetchAndReconcile(
      tenant: Tenant,
      catalog: RemoteCatalog,
      args: JsObject,
      dryRun: Boolean
  ): Future[Either[JsValue, DeployReport]] = {
    CatalogSources.get(catalog.source.kind) match {
      case None         =>
        Future.successful(Left(Json.obj("error" -> s"Unknown source kind: ${catalog.source.kind}")))
      case Some(source) =>
        source.fetch(catalog, args)(ec, env).flatMap {
          case Left(err)       => Future.successful(Left(err))
          case Right(entities) => reconcile(tenant, catalog, entities, dryRun).map(Right(_))
        }
    }
  }

  private def reconcile(
      tenant: Tenant,
      catalog: RemoteCatalog,
      entities: Seq[RemoteEntity],
      dryRun: Boolean
  ): Future[DeployReport] = {
    val metadataKey  = s"remote_catalog=${catalog.id}"
    val kindOrder    = Seq("team", "usage-plan", "api", "api-subscription", "cms-page")
    val grouped      = entities.groupBy(_.kind)
    val orderedKinds = kindOrder.filter(grouped.contains) ++ grouped.keySet.diff(kindOrder.toSet).toSeq
    orderedKinds
      .foldLeft(Future.successful(Seq.empty[ReconcileResult])) { (acc, kind) =>
        acc.flatMap { results =>
          val kindEntities = grouped(kind)
          val resultF      =
            if (catalog.allowedKinds.nonEmpty && !catalog.allowedKinds.contains(kind)) {
              Future.successful(ReconcileResult(kind, Nil, Nil, Nil, Seq(s"Kind '$kind' not allowed for this catalog")))
            } else {
              controllers.get(kind) match {
                case None             =>
                  Future.successful(ReconcileResult(kind, Nil, Nil, Nil, Seq(s"Unknown kind: $kind")))
                case Some(controller) =>
                  reconcileKind(tenant, metadataKey, kind, controller, kindEntities, dryRun)
              }
            }
          resultF.map(r => results :+ r)
        }
      }
      .map(results => DeployReport(catalog.id, tenant.id.value, results, DateTime.now()))
  }

  private def reconcileKind(
      tenant: Tenant,
      metadataKey: String,
      kind: String,
      controller: AdminApiController[?, ? <: ValueType],
      entities: Seq[RemoteEntity],
      dryRun: Boolean
  ): Future[ReconcileResult] = {
    val remoteIds = entities.map(_.id).toSet
    Future
      .sequence(entities.map { entity =>
        val raw = enrichWithMetadata(entity.content, metadataKey)
        controller
          .reconcileUpsert(tenant, raw, dryRun)
          .map {
            case Left(err)        =>
              (Option.empty[String], Option.empty[String], Some(s"Error upserting ${entity.id} of kind $kind: $err"))
            case Right("created") => (Some(entity.id), None, None)
            case Right("updated") => (None, Some(entity.id), None)
            case Right(_)         => (None, None, None)
          }
          .recover { case e: Throwable =>
            (Option.empty[String], Option.empty[String], Some(s"Error on ${entity.id} of kind $kind: ${e.getMessage}"))
          }
      })
      .flatMap { outcomes =>
        val created = outcomes.flatMap(_._1)
        val updated = outcomes.flatMap(_._2)
        val errors  = outcomes.flatMap(_._3)
        handleDeletions(tenant, metadataKey, controller, remoteIds, dryRun).map { case (deleted, delErrors) =>
          ReconcileResult(kind, created, updated, deleted, errors ++ delErrors)
        }
      }
  }

  private def handleDeletions(
      tenant: Tenant,
      metadataKey: String,
      controller: AdminApiController[?, ? <: ValueType],
      remoteIds: Set[String],
      dryRun: Boolean
  ): Future[(Seq[String], Seq[String])] = {
    controller.reconcileListManaged(tenant).flatMap { managed =>
      val toDelete = managed.collect {
        case (id, metadata) if metadata.get("created_by").contains(metadataKey) && !remoteIds.contains(id) => id
      }
      if (toDelete.isEmpty) Future.successful((Seq.empty[String], Seq.empty[String]))
      else if (dryRun) Future.successful((toDelete, Seq.empty[String]))
      else
        Future
          .sequence(toDelete.map(id => controller.reconcileDelete(tenant, id)))
          .map(_ => (toDelete, Seq.empty[String]))
    }.recover { case e: Throwable =>
      logger.warn(s"handleDeletions failed: ${e.getMessage}")
      (Seq.empty[String], Seq(s"Deletion failed: ${e.getMessage}"))
    }
  }

  private def doUndeploy(tenant: Tenant, catalog: RemoteCatalog): Future[Either[JsValue, DeployReport]] = {
    val metadataKey = s"remote_catalog=${catalog.id}"
    Future
      .sequence(controllers.toSeq.map { case (kind, controller) =>
        controller.reconcileListManaged(tenant).flatMap { managed =>
          val ids = managed.collect {
            case (id, metadata) if metadata.get("created_by").contains(metadataKey) => id
          }
          if (ids.isEmpty) Future.successful(ReconcileResult(kind, Nil, Nil, Nil, Nil))
          else
            Future
              .sequence(ids.map(id => controller.reconcileDelete(tenant, id)))
              .map(_ => ReconcileResult(kind, Nil, Nil, ids, Nil))
        }.recover { case e: Throwable =>
          ReconcileResult(kind, Nil, Nil, Nil, Seq(s"Error undeploying kind $kind: ${e.getMessage}"))
        }
      })
      .map { results =>
        Right(
          DeployReport(
            catalog.id,
            tenant.id.value,
            results.filter(r => r.deleted.nonEmpty || r.errors.nonEmpty),
            DateTime.now()
          )
        )
      }
  }

  private def enrichWithMetadata(json: JsObject, metadataKey: String): JsObject = {
    val current = (json \ "metadata").asOpt[Map[String, String]].getOrElse(Map.empty)
    json ++ Json.obj("metadata" -> (current + ("created_by" -> metadataKey)))
  }
}
