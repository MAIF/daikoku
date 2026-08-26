package fr.maif.daikoku.jobs

import fr.maif.daikoku.domain.NotificationType
import fr.maif.daikoku.env.Env
import org.apache.pekko.actor.Cancellable
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json._

import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.ExecutionContext
import scala.concurrent.duration._

class NotificationsPurgeJob(env: Env) {

  private val logger = Logger("NotificationsPurgeJob")

  private val ref = new AtomicReference[Cancellable]()

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  def start(): Unit = {
    logger.info("Start notifications purge job")
    logger.info(
      s"audit by cron ==> ${env.config.notificationsPurgeByCron} every ${env.config.notificationsPurgeInterval}"
    )
    if (env.config.notificationsPurgeByCron && ref.get() == null) {
      ref.set(
        env.defaultActorSystem.scheduler
          .scheduleAtFixedRate(
            10.seconds,
            env.config.notificationsPurgeInterval
          ) { () =>
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
      s"Run notifications purge for last ${env.config.notificationsBasePurgeMaxDate}/${env.config.notificationsToTreatPurgeMaxDate}"
    )
    val repo = env.dataStore.notificationRepo.forAllTenant()
    val basePurgeBefore = DateTime
      .now()
      .minus(env.config.notificationsBasePurgeMaxDate.toMillis)
      .getMillis
    val toTreatPurgeBefore = DateTime
      .now()
      .minus(env.config.notificationsToTreatPurgeMaxDate.toMillis)
      .getMillis

    repo.execute(
      s"""DELETE FROM ${repo.tableName} WHERE
         |  (content->>'notificationType' = '${NotificationType.AcceptOnly.value}'
         |    AND content->'status'->>'status' = 'Pending'
         |    AND (content->>'date')::bigint < $$1)
         |  OR (content->'status'->>'status' = 'Accepted'
         |    AND (content->'status'->>'date')::bigint < $$1)
         |  OR (content->>'notificationType' = '${NotificationType.AcceptOrReject.value}'
         |    AND content->'status'->>'status' = 'Pending'
         |    AND (content->>'date')::bigint < $$2)
         |""".stripMargin,
      Seq(
        java.lang.Long.valueOf(basePurgeBefore),
        java.lang.Long.valueOf(toTreatPurgeBefore)
      )
    )
  }
}
