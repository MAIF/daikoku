package fr.maif.daikoku.jobs

import fr.maif.daikoku.domain.{JobName, NotificationType, Tenant}
import fr.maif.daikoku.env.Env
import org.apache.pekko.actor.Cancellable
import org.joda.time.DateTime
import play.api.Logger

import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.Future

class NotificationsPurgeJob(override protected val env: Env)
    extends AbstractJob[Unit] {

  override protected def logger: Logger = Logger("notifications-purge-job")
  override protected def jobName: JobName = JobName.NotificationPurge
  override protected def lockedBy: String = "notifications-purge-job"
  override protected def jobConfig: JobConfig = JobConfig(
    enabled = env.config.notificationsPurgeJobEnabled,
    schedulingMode = env.config.notificationsPurgeJobSchedulingMode,
    cronExpression = env.config.notificationsPurgeJobCronExpr,
    interval = env.config.notificationsPurgeJobInterval
  )

  override protected def defaultInput: Unit = ()
  private val ref = new AtomicReference[Cancellable]()


  override def start(): Unit = {
    super.start()
  }

  override protected def process(
      tenant: Tenant,
      input: Unit,
      parallelism: Int,
      saveCursor: Long => Future[Boolean],
      fromCursor: Option[Long]
  ): Future[JobRunResult] = {
    logger.info(
      s"Run notifications purge for last ${env.config.notificationsBasePurgeMaxDate}/${env.config.notificationsToTreatPurgeMaxDate}"
    )
    val repo = env.dataStore.notificationRepo.forTenant(tenant)
    val basePurgeBefore = DateTime
      .now()
      .minus(env.config.notificationsBasePurgeMaxDate.toMillis)
      .getMillis
    val toTreatPurgeBefore = DateTime
      .now()
      .minus(env.config.notificationsToTreatPurgeMaxDate.toMillis)
      .getMillis

    repo
      .execute(
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
      .map(count =>
        JobRunResult(
          processed = count,
          succeeded = count,
          failures = Seq.empty,
          lastCursor = None
        )
      )
      .recover { case e =>
        JobRunResult(
          succeeded = 0L,
          processed = 0L,
          failures = Seq.empty,
          lastCursor = None
        )
      }
  }

}
