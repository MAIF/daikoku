package fr.maif.daikoku.jobs

import fr.maif.daikoku.domain.{JobName, Tenant}
import org.apache.pekko.actor.Cancellable
import fr.maif.daikoku.env.Env
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json.*

import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration.*

class AuditTrailPurgeJob(override protected val env: Env)
    extends AbstractJob[Unit] {

  override protected def logger: Logger = Logger("audit-trail-purge-job")

  override protected def jobName: JobName = JobName.AuditTrailPurge

  override protected def lockedBy: String = "audit-trail-purge-job"

  override protected def jobConfig: JobConfig = JobConfig(
    enabled = env.config.auditTrailPurgeJobEnabled,
    schedulingMode = env.config.auditTrailPurgeJobSchedulingMode,
    cronExpression = env.config.auditTrailPurgeJobCronExpr,
    interval = env.config.auditTrailPurgeJobInterval
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
      s"Run audit trail purge for last ${env.config.auditTrailPurgeJobMaxDate}"
    )
    val repo = env.dataStore.auditTrailRepo.forTenant(tenant)
    val purgeBefore = DateTime
      .now()
      .minus(env.config.auditTrailPurgeJobMaxDate.toMillis)
      .getMillis

    repo.execute(
        s"""DELETE FROM ${repo.tableName}
           |WHERE (content->>'@timestamp')::bigint < $$1""".stripMargin,
        Seq(java.lang.Long.valueOf(purgeBefore))
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
