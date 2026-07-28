package fr.maif.daikoku.jobs

import cron4s.*
import cron4s.lib.joda.*
import fr.maif.daikoku.audit.JobEvent
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.env.Env
import org.apache.pekko.actor.Cancellable
import org.apache.pekko.stream.Materializer
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json.*

import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.duration.*
import scala.concurrent.{ExecutionContext, Future}

enum Runner(val value: String):
  case Scheduler extends Runner("scheduler")
  case Api extends Runner("api")

final case class JobItemFailure(itemId: String, error: String)
object JobItemFailure {
  def asJson(f: JobItemFailure): JsObject =
    Json.obj("itemId" -> f.itemId, "error" -> f.error)
}

final case class JobRunResult(
    processed: Long,
    succeeded: Long,
    failures: Seq[JobItemFailure],
    lastCursor: Option[Long]
)

object JobRunResult {
  val empty: JobRunResult = JobRunResult(0L, 0L, Seq.empty, None)
}

enum JobOutcome:
  case Skipped(reason: String)
  case Completed(result: JobRunResult)
  case PartiallyCompleted(result: JobRunResult)
  case Failed(error: String)

final case class JobConfig(
    enabled: Boolean,
    schedulingMode: SchedulingMode,
    cronExpression: Option[String],
    interval: FiniteDuration,
    leaseDuration: FiniteDuration = 5.minutes,
    parallelism: Int = 25,
    maxReportedFailures: Int = 50
)

/** Shared skeleton for Daikoku scheduled jobs.
  *
  * Absorbs everything that used to be duplicated across the Otoroshi sync and
  * apikey rotation jobs: Cron/Interval scheduling, the per-tenant loop, and the
  * `JobInformation`-based coordination (atomic single-instance claim, heartbeat
  * lease, cursor resume, final status + audit reporting).
  *
  * `Input` is what a run operates on. The scheduled loop uses `defaultInput`
  * (typically "everything"); on-demand callers may pass a narrower value — this
  * is how `OtoroshiSynchronizerJob`'s `entryPoint` fits (`Input =
  * ApiId | UsagePlanId | ApiSubscriptionId | KeyringId | SyncAllSubscription`).
  * Jobs with nothing to target use `AbstractJob[Unit]`.
  *
  * A concrete job only supplies its identity/config and the actual work
  * (`process`), and may override `onOutcome` to react (e.g. notify) once a run
  * finished.
  */
abstract class AbstractJob[Input] {

  protected def env: Env
  protected def logger: Logger
  protected def jobName: JobName
  protected def lockedBy: String
  protected def jobConfig: JobConfig

  /** What the scheduled per-tenant loop operates on. */
  protected def defaultInput: Input

  /** The actual work. The base supplies `saveCursor` (heartbeat) and the resume
    * cursor, and expects a rich [[JobRunResult]] rather than `Future[Unit]`.
    */
  protected def process(
      tenant: Tenant,
      input: Input,
      parallelism: Int,
      saveCursor: Long => Future[Boolean],
      fromCursor: Option[Long]
  ): Future[JobRunResult]

  /** React to a job-level outcome (e.g. send a summary notification). No-op by
    * default; per-item notifications stay inside `process`.
    */
  protected def onOutcome(tenant: Tenant, outcome: JobOutcome): Future[Unit] =
    Future.successful(())

  protected implicit def ec: ExecutionContext = env.defaultExecutionContext
  protected implicit def mat: Materializer = env.defaultMaterializer
  private implicit def implicitEnv: Env = env

  private val ref = new AtomicReference[Cancellable]()
  private def logPrefix = s"[${jobName.value}]"

  private def leaseFromNow(): DateTime =
    DateTime.now().plusSeconds(jobConfig.leaseDuration.toSeconds.toInt)

  // ---------------------------------------------------------------------------
  // Scheduling
  // ---------------------------------------------------------------------------

  def start(): Unit = {
    if (jobConfig.enabled && ref.get() == null) {
      jobConfig.schedulingMode match {
        case SchedulingMode.Cron =>
          val cronExpr = jobConfig.cronExpression.map(Cron.unsafeParse)

          def scheduleNext(): Unit = {
            val now = DateTime.now()
            cronExpr.flatMap(_.next[DateTime](now)) match {
              case Some(nextRun) =>
                val delay =
                  Math.max(nextRun.getMillis - now.getMillis, 1000).millis
                logger.info(
                  s"$logPrefix next cron run scheduled at $nextRun (in ${delay.toSeconds}s)"
                )
                ref.set(
                  env.defaultActorSystem.scheduler.scheduleOnce(delay) {
                    val _ = runForAllTenants()
                      .recover { case e: Throwable =>
                        logger.error(s"$logPrefix cron run failed", e)
                      }
                      .andThen { case _ => scheduleNext() }
                    ()
                  }
                )
              case None =>
                logger.error(
                  s"$logPrefix could not compute next run from cron expression: ${jobConfig.cronExpression
                      .getOrElse("")}"
                )
            }
          }

          scheduleNext()

        case SchedulingMode.Interval =>
          ref.set(
            env.defaultActorSystem.scheduler
              .scheduleAtFixedRate(10.seconds, jobConfig.interval) { () =>
                runForAllTenants()
                  .recover { case e: Throwable =>
                    logger.error(s"$logPrefix interval run failed", e)
                  }
              }
          )
      }
    }
  }

  def stop(): Unit = Option(ref.get()).foreach(_.cancel())

  private def runForAllTenants(): Future[Unit] =
    env.dataStore.tenantRepo
      .findAllNotDeleted()
      .flatMap(tenants =>
        Future.sequence(tenants.map(run(_, Runner.Scheduler)))
      )
      .map(_ => ())

  // ---------------------------------------------------------------------------
  // Coordination (single-instance claim + state machine)
  // ---------------------------------------------------------------------------

  def run(
      tenant: Tenant,
      runBy: Runner,
      input: Input = defaultInput,
      parallelism: Int = jobConfig.parallelism
  ): Future[JobOutcome] = {
    val jobRepo = env.dataStore.JobInformationRepo.forTenant(tenant)
    // Stable id => a single row per (tenant, jobName), updated in place.
    val jobId = DatastoreId(s"${jobName.value}-${tenant.id.value}")
    val startedAt = DateTime.now()

    def runningInfo(cursor: Long): JobInformation =
      JobInformation(
        id = jobId,
        tenant = tenant.id,
        jobName = jobName,
        lockedBy = lockedBy,
        lockedAt = startedAt,
        expiresAt = leaseFromNow(),
        cursor = cursor,
        startedAt = startedAt,
        lastBatchAt = DateTime.now(),
        status = JobStatus.Running
      )

    // expiresAt doubles as a heartbeat: refreshed on every cursor save so a
    // crashed instance eventually lets the row become claimable again.
    def saveCursor(cursor: Long): Future[Boolean] =
      jobRepo.save(runningInfo(cursor))

    // Atomic single-instance guard: only the instance whose conditional upsert
    // affects a row (RETURNING non-empty) wins the lock; the others skip.
    def claim(cursor: Long): Future[Boolean] = {
      val content = Json.stringify(runningInfo(cursor).asJson)
      val nowMillis = DateTime.now().getMillis
      val sql =
        """INSERT INTO job_informations (_id, content) VALUES ($1, $2::jsonb)
          |ON CONFLICT (_id) DO UPDATE SET content = $2::jsonb
          |WHERE (job_informations.content ->> 'status') <> 'running'
          |   OR (job_informations.content ->> 'expiresAt')::bigint < $3
          |RETURNING job_informations._id""".stripMargin
      env.dataStore
        .queryString(
          sql,
          "_id",
          Seq(jobId.value, content, java.lang.Long.valueOf(nowMillis))
        )
        .map(_.nonEmpty)
    }

    def emitAudit(
        phase: String,
        status: JobStatus,
        result: Option[JobRunResult],
        error: Option[String]
    ): Unit = {
      val failures = result.map(_.failures).getOrElse(Seq.empty)
      JobEvent(s"${jobName.value} $phase").logJobEvent(
        tenant,
        JobUtils.jobUser,
        Json.obj(
          "jobName" -> jobName.value,
          "runBy" -> runBy.value,
          "phase" -> phase,
          "status" -> status.value,
          "processed" -> result.map(_.processed).getOrElse(0L),
          "succeeded" -> result.map(_.succeeded).getOrElse(0L),
          "failedCount" -> failures.size,
          "failures" -> JsArray(
            failures
              .take(jobConfig.maxReportedFailures)
              .map(JobItemFailure.asJson)
          ),
          "error" -> error
        )
      )
    }

    def doRun(fromCursor: Option[Long]): Future[JobOutcome] =
      process(tenant, input, parallelism, saveCursor, fromCursor)
        .flatMap { result =>
          val (status, outcome) =
            if (result.failures.isEmpty)
              (JobStatus.Completed, JobOutcome.Completed(result))
            else
              (
                JobStatus.PartiallyCompleted,
                JobOutcome.PartiallyCompleted(result)
              )
          logger.info(
            s"$logPrefix tenant ${tenant.id.value}: $status — processed=${result.processed}, succeeded=${result.succeeded}, failed=${result.failures.size}"
          )
          jobRepo
            .save(
              runningInfo(result.lastCursor.getOrElse(0L)).copy(
                status = status,
                lastBatchAt = DateTime.now(),
                totalProcessed = BigDecimal(result.processed)
              )
            )
            .map(_ => emitAudit("ended", status, Some(result), None))
            .flatMap(_ => onOutcome(tenant, outcome))
            .map(_ => outcome)
        }
        .recoverWith { case e: Throwable =>
          logger.error(s"$logPrefix tenant ${tenant.id.value}: run failed", e)
          val outcome = JobOutcome.Failed(e.getMessage)
          // keep the cursor already persisted by saveCursor so the next run resumes
          jobRepo
            .findByIdNotDeleted(jobId)
            .flatMap { current =>
              val info = current
                .getOrElse(runningInfo(fromCursor.getOrElse(0L)))
                .copy(status = JobStatus.Failed, lastBatchAt = DateTime.now())
              jobRepo.save(info)
            }
            .map(_ =>
              emitAudit("failed", JobStatus.Failed, None, Some(e.getMessage))
            )
            .flatMap(_ => onOutcome(tenant, outcome))
            .map(_ => outcome)
        }

    def skip(reason: String): Future[JobOutcome] = {
      logger.info(s"$logPrefix tenant ${tenant.id.value}: skipped — $reason")
      Future.successful(JobOutcome.Skipped(reason))
    }

    // The atomic claim is the real single-instance guard; the pre-check above
    // only avoids doing useless work in the common case.
    def attempt(fromCursor: Option[Long]): Future[JobOutcome] =
      claim(fromCursor.getOrElse(0L)).flatMap {
        case false => skip("not the elected instance")
        case true =>
          emitAudit("started", JobStatus.Running, None, None)
          doRun(fromCursor)
      }

    def intervalElapsed(lastBatchAt: DateTime): Boolean =
      runBy == Runner.Api ||
        jobConfig.schedulingMode != SchedulingMode.Interval ||
        lastBatchAt.plusSeconds(jobConfig.interval.toSeconds.toInt).isBeforeNow

    // Cheap business pre-check: decides skip / resume cursor before claiming.
    jobRepo
      .find(
        Json.obj("jobName" -> jobName.value),
        sort = Some(Json.obj("startedAt" -> -1)),
        maxDocs = 1
      )
      .map(_.headOption)
      .flatMap {
        case Some(last)
            if last.status == JobStatus.Running && last.expiresAt.isAfterNow =>
          skip("already running")

        case Some(last)
            if last.status == JobStatus.Running && last.expiresAt.isBeforeNow =>
          logger.info(
            s"$logPrefix stale running job (expiresAt=${last.expiresAt}), resuming from cursor ${last.cursor}"
          )
          attempt(Some(last.cursor))

        case Some(last) if last.status == JobStatus.Failed =>
          logger.info(
            s"$logPrefix previous job failed, resuming from cursor ${last.cursor}"
          )
          attempt(Some(last.cursor))

        case Some(last) if !intervalElapsed(last.lastBatchAt) =>
          skip("interval not elapsed")

        case _ =>
          attempt(None)
      }
  }
}
