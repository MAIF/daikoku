package fr.maif.daikoku.jobs

import cron4s._
import cron4s.lib.joda._
import fr.maif.daikoku.domain.{RemoteCatalog, SchedulingMode, Tenant, TenantId}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.services.catalog.{CatalogSources, RemoteCatalogEngine}
import org.apache.pekko.actor.Cancellable
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json.Json

import java.util.concurrent.atomic.AtomicReference
import scala.collection.concurrent.TrieMap
import scala.concurrent.duration._
import scala.concurrent.{ExecutionContext, Future}

class RemoteCatalogJob(env: Env, engine: RemoteCatalogEngine) {

  private val logger     = Logger("daikoku-remote-catalog-job")
  private val refreshRef = new AtomicReference[Cancellable]()
  private val timers     = TrieMap.empty[String, (String, Cancellable)]
  @volatile private var stopped = false

  implicit val ec: ExecutionContext = env.defaultExecutionContext

  def start(): Unit = {
    CatalogSources.initDefaults()
    stopped = false
    if (env.config.remoteCatalogEnabled && env.config.otoroshiSyncMaster && refreshRef.get() == null) {
      refreshRef.set(
        env.defaultActorSystem.scheduler.scheduleAtFixedRate(5.seconds, env.config.remoteCatalogInterval) { () =>
          if (!stopped) {
            val _ = refresh()
            ()
          }
        }
      )
    }
  }

  def stop(): Unit = {
    stopped = true
    Option(refreshRef.getAndSet(null)).foreach(_.cancel())
    timers.values.foreach { case (_, c) => c.cancel() }
    timers.clear()
  }

  private def keyOf(tenant: Tenant, catalog: RemoteCatalog): String =
    s"${tenant.id.value}:${catalog.id}"

  private def signatureOf(catalog: RemoteCatalog): String =
    s"${catalog.scheduling.mode.value}|${catalog.scheduling.interval.map(_.toMillis)}|${catalog.scheduling.cronExpression}"

  private def refresh(): Future[Unit] =
    env.dataStore.tenantRepo
      .findAllNotDeleted()
      .map { tenants =>
        val active: Map[String, (TenantId, String, RemoteCatalog)] =
          tenants.flatMap { tenant =>
            tenant.remoteCatalogs
              .filter(c => c.enabled && c.scheduling.enabled)
              .map(c => keyOf(tenant, c) -> ((tenant.id, c.id, c)))
          }.toMap

        active.foreach { case (k, (tenantId, catalogId, catalog)) =>
          val sig = signatureOf(catalog)
          if (!timers.get(k).exists(_._1 == sig)) {
            timers.remove(k).foreach { case (_, c) => c.cancel() }
            scheduleCatalog(k, sig, tenantId, catalogId, catalog)
          }
        }

        timers.keys.toSeq.filterNot(active.contains).foreach { k =>
          timers.remove(k).foreach { case (_, c) => c.cancel() }
        }
      }
      .recover { case e: Throwable =>
        logger.error("[RemoteCatalog] refresh failed", e)
      }

  private def scheduleCatalog(
      k: String,
      sig: String,
      tenantId: TenantId,
      catalogId: String,
      catalog: RemoteCatalog
  ): Unit =
    catalog.scheduling.mode match {
      case SchedulingMode.Interval =>
        val interval = catalog.scheduling.interval.getOrElse(env.config.remoteCatalogInterval)
        val cancellable = env.defaultActorSystem.scheduler.scheduleAtFixedRate(interval, interval) { () =>
          if (!stopped) {
            val _ = runOne(tenantId, catalogId)
            ()
          }
        }
        timers.put(k, (sig, cancellable))

      case SchedulingMode.Cron =>
        catalog.scheduling.cronExpression.map(Cron.unsafeParse) match {
          case Some(cronExpr) =>
            def scheduleNext(): Unit =
              if (!stopped && timers.get(k).exists(_._1 == sig)) {
                val now = DateTime.now()
                cronExpr.next[DateTime](now).foreach { nextRun =>
                  val delay = Math.max(nextRun.getMillis - now.getMillis, 1000).millis
                  val cancellable = env.defaultActorSystem.scheduler.scheduleOnce(delay) {
                    val _ = runOne(tenantId, catalogId).andThen { case _ => scheduleNext() }
                    ()
                  }
                  timers.put(k, (sig, cancellable))
                }
              }
            scheduleNext()
          case None           =>
            logger.warn(s"[RemoteCatalog] catalog $catalogId in cron mode without cronExpression, skipped")
        }
    }

  private def runOne(tenantId: TenantId, catalogId: String): Future[Unit] =
    env.dataStore.tenantRepo
      .findByIdNotDeleted(tenantId.value)
      .flatMap {
        case Some(tenant) =>
          tenant.remoteCatalogs.find(c => c.id == catalogId && c.enabled && c.scheduling.enabled) match {
            case Some(catalog) =>
              engine.deploy(tenant, catalog, catalog.scheduling.deployArgs).map {
                case Left(err)     =>
                  logger.error(
                    s"[RemoteCatalog] deploy $catalogId on tenant ${tenant.id.value} failed: ${Json.stringify(err)}"
                  )
                case Right(report) =>
                  logger.info(
                    s"[RemoteCatalog] deployed $catalogId on tenant ${tenant.id.value}: ${Json.stringify(report.json)}"
                  )
              }
            case None          => Future.successful(())
          }
        case None         => Future.successful(())
      }
      .recover { case e: Throwable =>
        logger.error(s"[RemoteCatalog] deploy $catalogId crashed", e)
      }
}
