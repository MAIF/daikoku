package fr.maif.daikoku.jobs

import fr.maif.daikoku.domain.*
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import org.joda.time.DateTime
import org.scalatest.{BeforeAndAfter, OptionValues}
import org.scalatest.concurrent.{Eventually, IntegrationPatience}
import org.scalatestplus.play.PlaySpec
import play.api.Logger
import play.api.libs.json.*

import java.util.concurrent.atomic.{AtomicBoolean, AtomicReference}
import scala.concurrent.duration.*
import scala.concurrent.{Await, Future, Promise}

/** Coordination coverage for [[AbstractJob]] driven through a programmable fake
  * job, DB-only (no Otoroshi needed). What is proven here is the behaviour the
  * base gives every job for free: the single-instance claim, the run state
  * machine (skip / resume / interval gate) and the Completed / PartiallyCompleted
  * / Failed reporting.
  */
class AbstractJobSpec
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with Eventually
    with OptionValues
    with BeforeAndAfter {

  // A JobName not otherwise exercised in this DB-only suite.
  private val testJobName = JobName.OtoroshiEntitiesVerifier
  private def stableId = DatastoreId(s"${testJobName.value}-${tenant.id.value}")

  private def jobRepo =
    daikokuComponents.env.dataStore.JobInformationRepo.forTenant(tenant.id)

  before {
    setupEnvBlocking(tenants = Seq(tenant))
    // flush() does not touch JobInformation, so we reset it ourselves.
    Await.result(
      daikokuComponents.env.dataStore.JobInformationRepo
        .forAllTenant()
        .deleteAll(),
      10.seconds
    )
  }

  // ============================================================
  // Helpers
  // ============================================================

  /** A job on top of AbstractJob whose work is fully driven by the test. */
  private class TestJob(
      behavior: (Option[Long], Long => Future[Boolean]) => Future[JobRunResult],
      mode: SchedulingMode = SchedulingMode.Interval,
      interval: FiniteDuration = 1.hour,
      jobNameOverride: JobName = testJobName
  ) extends AbstractJob[Unit] {
    val invoked = new AtomicBoolean(false)
    val seenCursor = new AtomicReference[Option[Long]](None)

    override protected val env: Env = daikokuComponents.env
    override protected val logger: Logger = Logger("test-job")
    override protected val jobName: JobName = jobNameOverride
    override protected val lockedBy: String = "test-job"
    override protected val defaultInput: Unit = ()
    override protected val jobConfig: JobConfig = JobConfig(
      enabled = true,
      schedulingMode = mode,
      cronExpression = None,
      interval = interval
    )

    override protected def process(
        tenant: Tenant,
        input: Unit,
        parallelism: Int,
        saveCursor: Long => Future[Boolean],
        fromCursor: Option[Long]
    ): Future[JobRunResult] = {
      invoked.set(true)
      seenCursor.set(fromCursor)
      behavior(fromCursor, saveCursor)
    }
  }

  private def succeed(
      cursor: Long = 0L
  ): (Option[Long], Long => Future[Boolean]) => Future[JobRunResult] =
    (_, _) =>
      Future.successful(
        JobRunResult(
          processed = 1,
          succeeded = 1,
          failures = Seq.empty,
          lastCursor = Some(cursor)
        )
      )

  private def seedJob(
      status: JobStatus,
      cursor: Long = 0L,
      expiresAt: DateTime = DateTime.now().plusMinutes(5),
      lastBatchAt: DateTime = DateTime.now()
  ): Unit =
    Await.result(
      jobRepo.save(
        JobInformation(
          id = stableId,
          tenant = tenant.id,
          jobName = testJobName,
          lockedBy = "seed",
          lockedAt = DateTime.now(),
          expiresAt = expiresAt,
          cursor = cursor,
          startedAt = DateTime.now(),
          lastBatchAt = lastBatchAt,
          status = status
        )
      ),
      10.seconds
    )

  private def reload(): Option[JobInformation] =
    Await.result(jobRepo.findById(stableId), 10.seconds)

  private def outcomeName(o: JobOutcome): String = o match {
    case _: JobOutcome.Skipped            => "skipped"
    case _: JobOutcome.Completed          => "completed"
    case _: JobOutcome.PartiallyCompleted => "partial"
    case _: JobOutcome.Failed             => "failed"
  }

  private def runNow(job: TestJob, runBy: Runner): JobOutcome =
    Await.result(job.run(tenant, runBy), 15.seconds)

  // A JobName used only by the audit test, so its events are not mixed with the
  // start/end events every other test in this suite also emits.
  private val auditJobName = JobName.KeyringSubscriptionExpiration

  private def jobAuditEvents(jobName: JobName, phase: String): Seq[JsValue] =
    Await
      .result(
        daikokuComponents.env.dataStore.auditTrailRepo
          .forTenant(tenant.id)
          .findRaw(Json.obj()),
        10.seconds
      )
      .filter { e =>
        (e \ "@type").asOpt[String].contains("JobEvent") &&
        (e \ "details" \ "jobName").asOpt[String].contains(jobName.value) &&
        (e \ "details" \ "phase").asOpt[String].contains(phase)
      }

  // ============================================================
  // Tests
  // ============================================================

  "AbstractJob" should {

    "run a fresh job to completion and persist the JobInformation" in {
      val job = new TestJob(succeed(cursor = 5))

      outcomeName(runNow(job, Runner.Scheduler)) mustBe "completed"
      job.invoked.get() mustBe true

      val info = reload().value
      info.id mustBe stableId
      info.status mustBe JobStatus.Completed
    }

    "report a partial completion when some items fail" in {
      val job = new TestJob((_, _) =>
        Future.successful(
          JobRunResult(
            processed = 2,
            succeeded = 1,
            failures = Seq(JobItemFailure("toto", "boom")),
            lastCursor = Some(0L)
          )
        )
      )

      runNow(job, Runner.Scheduler) match {
        case JobOutcome.PartiallyCompleted(r) =>
          r.failures.map(_.itemId) mustBe Seq("toto")
        case other => fail(s"expected PartiallyCompleted, got $other")
      }

      reload().value.status mustBe JobStatus.PartiallyCompleted
    }

    "mark the job as Failed and keep the persisted cursor when the work throws" in {
      val job = new TestJob((_, saveCursor) =>
        saveCursor(42L).flatMap(_ => Future.failed(new RuntimeException("boom")))
      )

      outcomeName(runNow(job, Runner.Scheduler)) mustBe "failed"

      val info = reload().value
      info.status mustBe JobStatus.Failed
      info.cursor mustBe 42L
    }

    "skip when a non-expired run is already in progress" in {
      seedJob(JobStatus.Running, expiresAt = DateTime.now().plusMinutes(5))
      val job = new TestJob(succeed())

      outcomeName(runNow(job, Runner.Scheduler)) mustBe "skipped"
      job.invoked.get() mustBe false
    }

    "treat a stale running job as recoverable and resume from its cursor" in {
      seedJob(
        JobStatus.Running,
        cursor = 5L,
        expiresAt = DateTime.now().minusMinutes(1)
      )
      val job = new TestJob(succeed())

      outcomeName(runNow(job, Runner.Scheduler)) mustBe "completed"
      job.seenCursor.get() mustBe Some(5L)
    }

    "resume from the cursor of a previously failed job" in {
      seedJob(JobStatus.Failed, cursor = 7L)
      val job = new TestJob(succeed())

      outcomeName(runNow(job, Runner.Scheduler)) mustBe "completed"
      job.seenCursor.get() mustBe Some(7L)
    }

    "skip a scheduled run when the interval has not elapsed" in {
      seedJob(JobStatus.Completed, lastBatchAt = DateTime.now())
      val job = new TestJob(succeed(), interval = 1.hour)

      outcomeName(runNow(job, Runner.Scheduler)) mustBe "skipped"
      job.invoked.get() mustBe false
    }

    "run a manual (api) trigger even within the interval" in {
      seedJob(JobStatus.Completed, lastBatchAt = DateTime.now())
      val job = new TestJob(succeed(), interval = 1.hour)

      outcomeName(runNow(job, Runner.Api)) mustBe "completed"
      job.invoked.get() mustBe true
    }

    "not apply the interval gate in Cron mode (a fresh scheduled run always executes)" in {
      // Same setup as the interval-gate skip test above, but in Cron mode the
      // interval barrier is bypassed: cron scheduling decides when a run happens,
      // so a scheduled run must never be skipped for "interval not elapsed".
      seedJob(JobStatus.Completed, lastBatchAt = DateTime.now())
      val job = new TestJob(succeed(), mode = SchedulingMode.Cron)

      outcomeName(runNow(job, Runner.Scheduler)) mustBe "completed"
      job.invoked.get() mustBe true
    }

    "let a single instance win when two runs race" in {
      val gate = Promise[Unit]()
      // the winner blocks in process until the gate opens, so the other run
      // necessarily observes it as running and steps aside.
      val job = new TestJob((_, _) =>
        gate.future.map(_ =>
          JobRunResult(1, 1, Seq.empty, Some(0L))
        )
      )

      val a = job.run(tenant, Runner.Scheduler)
      val b = job.run(tenant, Runner.Scheduler)

      // one run is gated (still pending), the other resolved to a skip
      eventually {
        Seq(a, b).count(_.isCompleted) mustBe 1
      }
      val loser = Seq(a, b).find(_.isCompleted).value
      outcomeName(Await.result(loser, 1.second)) mustBe "skipped"

      gate.success(())

      val outcomes = Await.result(Future.sequence(Seq(a, b)), 15.seconds)
      outcomes.map(outcomeName).count(_ == "completed") mustBe 1
      outcomes.map(outcomeName).count(_ == "skipped") mustBe 1
    }

    "write an audit event when a job starts (state + who ran it) and, on failure, why" in {
      val job = new TestJob(
        (_, _) => Future.failed(new RuntimeException("kaboom")),
        jobNameOverride = auditJobName
      )

      outcomeName(runNow(job, Runner.Api)) mustBe "failed"

      // the audit actor batches writes (groupedWithin ~10s), hence eventually
      eventually {
        val started = jobAuditEvents(auditJobName, "started")
        started must not be empty
        (started.head \ "details" \ "runBy").asOpt[String] mustBe Some("api")
        (started.head \ "details" \ "status")
          .asOpt[String] mustBe Some("running")

        val failed = jobAuditEvents(auditJobName, "failed")
        failed must not be empty
        (failed.head \ "details" \ "status").asOpt[String] mustBe Some("failed")
        (failed.head \ "details" \ "error").asOpt[String] mustBe Some("kaboom")
      }
    }
  }
}
