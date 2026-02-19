package fr.maif.daikoku.jobs

import org.apache.pekko.actor.Cancellable
import fr.maif.daikoku.env.Env
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json._

import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.ExecutionContext
import scala.concurrent.duration._

class AuditTrailPurgeJob(env: Env) {

  private val logger = Logger("AuditTrailPurgeJob")

  private val ref = new AtomicReference[Cancellable]()

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  def start(): Unit = {
    logger.info("Start audit trail purge job")
    logger.info(
      s"audit by cron ==> ${env.config.auditTrailPurgeByCron} every ${env.config.auditTrailPurgeInterval}"
    )
    if (env.config.auditTrailPurgeByCron && ref.get() == null) {
      ref.set(
        env.defaultActorSystem.scheduler
          .scheduleAtFixedRate(10.seconds, env.config.auditTrailPurgeInterval) {
            () =>
              purge()
          }
      )
    }
  }

  def stop(): Unit = {
    Option(ref.get()).foreach(_.cancel())
  }

  def purge() = {
    logger.info(
      s"Run audit trail purge for last ${env.config.auditTrailPurgeMaxDate}"
    )
    env.dataStore.auditTrailRepo
      .forAllTenant()
      .delete(
        Json.obj(
          "@timestamp" -> Json.obj(
            "$lt" -> DateTime
              .now()
              .minus(env.config.auditTrailPurgeMaxDate.toMillis)
              .getMillis
          )
        )
      )
  }
}
