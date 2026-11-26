package fr.maif.daikoku.jobs

import fr.maif.daikoku.domain.*
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import fr.maif.daikoku.utils.OtoroshiClient
import org.joda.time.DateTime
import org.scalatest.BeforeAndAfter
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.{JsObject, Json}

import java.util.concurrent.ConcurrentLinkedQueue
import scala.concurrent.{Await, Future}
import scala.concurrent.duration.*
import scala.jdk.CollectionConverters.*

class ApiKeyStatsJobSpec
    extends PlaySpec
    with DaikokuSpecHelper
    with BeforeAndAfter {

  private val createdAt = DateTime.parse("2026-01-01T00:00:00Z")

  private def subscription(index: Int): ApiSubscription =
    adminApiSubscription.copy(
      id = ApiSubscriptionId(f"stats-$index%03d"),
      createdAt = createdAt.plusSeconds(index)
    )

  private class TestJob(failedIds: Set[ApiSubscriptionId] = Set.empty)
      extends ApiKeyStatsJob(
        daikokuComponents.otoroshiClient,
        daikokuComponents.paymentClient,
        daikokuComponents.env
      ) {
    val seen = new ConcurrentLinkedQueue[ApiSubscriptionId]()
    val cursors = new ConcurrentLinkedQueue[Long]()

    override def syncForSubscription(
        subscription: ApiSubscription,
        tenant: Tenant,
        completed: Boolean
    ): Future[Seq[ApiKeyConsumption]] = {
      seen.add(subscription.id)
      if (failedIds.contains(subscription.id))
        Future.failed(new IllegalStateException("collection failed"))
      else Future.successful(Seq.empty)
    }

    def collect(
        input: ApiKeyStatsJobInput = ApiKeyStatsJobInput.SyncAll,
        fromCursor: Option[Long] = None,
        checkpoint: Long => Future[Boolean] = cursor => {
          cursors.add(cursor)
          Future.successful(true)
        }
    ): JobRunResult =
      Await.result(
        process(tenant, input, 2, checkpoint, fromCursor),
        15.seconds
      )
  }

  before {
    setupEnvBlocking(tenants = Seq(tenant, tenant2))
    Await.result(
      daikokuComponents.env.dataStore.JobInformationRepo
        .forAllTenant()
        .deleteAll(),
      10.seconds
    )
  }

  private def seed(subscriptions: Seq[ApiSubscription]): Unit =
    Await.result(
      daikokuComponents.env.dataStore.apiSubscriptionRepo
        .forAllTenant()
        .insertMany(subscriptions),
      10.seconds
    )

  private class StatsClient extends OtoroshiClient(daikokuComponents.env) {
    val requestedDays = new ConcurrentLinkedQueue[Long]()
    var failedFrom: Option[Long] = None
    var hits = 10L

    override def getApiKeyConsumption(
        clientId: String,
        from: String,
        to: String,
        failOnError: Boolean
    )(implicit settings: OtoroshiSettings): Future[JsObject] = {
      requestedDays.add(from.toLong)
      if (failedFrom.contains(from.toLong))
        Future.failed(new IllegalStateException("Otoroshi unavailable"))
      else Future.successful(Json.obj("hits" -> Json.obj("count" -> hits)))
    }

    override def getApiKeyQuotas(clientId: String)(implicit
        settings: OtoroshiSettings
    ): Future[JsObject] =
      Future.successful(
        ApiKeyQuotas(100, 0, 100, 100, 0, 100, 100, 0, 100).asJson.as[JsObject]
      )
  }

  private def seedCollection(): ApiSubscription = {
    val selected = subscription(1).copy(
      createdAt = DateTime.now().minusDays(2).withTimeAtStartOfDay()
    )
    setupEnvBlocking(
      tenants = Seq(tenant),
      apis = Seq(adminApi),
      subscriptions = Seq(selected),
      keyrings = Seq(adminApiKeyring),
      usagePlans = Seq(
        adminApiPlan.copy(
          otoroshiTarget = Some(
            OtoroshiTarget(
              tenant.otoroshiSettings.head.id,
              Some(AuthorizedEntities())
            )
          )
        )
      )
    )
    selected
  }

  "ApiKeyStatsJob" should {
    "return an empty result without checkpointing when there are no subscriptions" in {
      val job = new TestJob()
      job.collect() mustBe JobRunResult.empty
      job.cursors.isEmpty mustBe true
    }

    "count subscriptions rather than daily consumption rows and checkpoint every batch" in {
      val subscriptions = (1 to 103).map(subscription)
      seed(subscriptions)
      val job = new TestJob()

      job.collect() mustBe JobRunResult(
        103L,
        103L,
        Seq.empty,
        Some(subscriptions.last.createdAt.getMillis)
      )
      job.seen.asScala.toSeq must contain theSameElementsAs subscriptions.map(
        _.id
      )
      job.cursors.asScala.toSeq mustBe Seq(50, 100, 103)
        .map(index => subscription(index).createdAt.getMillis)
    }

    "page through subscriptions sharing a timestamp without losing or duplicating them" in {
      val subscriptions =
        (1 to 103).map(i => subscription(i).copy(createdAt = createdAt))
      seed(subscriptions)
      val job = new TestJob()

      job.collect().succeeded mustBe 103L
      job.seen.asScala.toSeq must contain theSameElementsAs subscriptions.map(
        _.id
      )
      job.cursors.size() mustBe 3
    }

    "resume inclusively and isolate the tenant" in {
      val subscriptions = (1 to 3).map(subscription)
      seed(subscriptions :+ subscription(4).copy(tenant = tenant2.id))
      val job = new TestJob()

      job
        .collect(fromCursor = Some(subscription(2).createdAt.getMillis))
        .processed mustBe 2L
      job.seen.asScala.toSeq must contain theSameElementsAs subscriptions
        .drop(1)
        .map(_.id)
    }

    "report individual failures and never checkpoint past them in later batches" in {
      seed((1 to 103).map(subscription))
      val job = new TestJob(Set(subscription(2).id))

      val result = job.collect()
      result.processed mustBe 103L
      result.succeeded mustBe 102L
      result.failures mustBe Seq(
        JobItemFailure(subscription(2).id.value, "collection failed")
      )
      result.lastCursor mustBe Some(subscription(2).createdAt.getMillis)
      job.cursors.asScala.toSeq mustBe Seq.fill(3)(
        subscription(2).createdAt.getMillis
      )
    }

    "surface checkpoint failures rather than report successful completion" in {
      seed((1 to 60).map(subscription))
      val job = new TestJob()

      intercept[IllegalStateException] {
        job.collect(checkpoint = _ => Future.successful(false))
      }.getMessage must include("cursor")
      job.seen.size() mustBe 50
    }

    "resume a failed run from its last persisted batch checkpoint" in {
      seed((1 to 103).map(subscription))
      val failingJob = new TestJob() {
        override protected def process(
            tenant: Tenant,
            input: ApiKeyStatsJobInput,
            parallelism: Int,
            saveCursor: Long => Future[Boolean],
            fromCursor: Option[Long]
        ): Future[JobRunResult] =
          super.process(
            tenant,
            input,
            parallelism,
            cursor =>
              if (cursor >= subscription(100).createdAt.getMillis)
                Future.failed(
                  new IllegalStateException("checkpoint unavailable")
                )
              else saveCursor(cursor),
            fromCursor
          )
      }

      Await.result(failingJob.run(tenant, Runner.Api), 15.seconds) mustBe
        JobOutcome.Failed("checkpoint unavailable")

      val resumed = new TestJob()
      Await.result(resumed.run(tenant, Runner.Api), 15.seconds) match {
        case JobOutcome.Completed(result) =>
          result.processed mustBe 54L
          resumed.seen.asScala.toSeq must contain theSameElementsAs
            (50 to 103).map(i => subscription(i).id)
        case outcome => fail(s"Expected resumed completion, got $outcome")
      }
    }

    "select only the requested API, subscription, subscriber or producer" in {
      val selected = subscription(1)
      val other =
        subscription(2).copy(api = cmsApi.id, team = TeamId("other-subscriber"))
      seed(Seq(selected, other))
      Await.result(
        daikokuComponents.env.dataStore.apiRepo
          .forTenant(tenant)
          .insertMany(Seq(adminApi, cmsApi.copy(team = TeamId("other-owner")))),
        10.seconds
      )

      Seq(
        ApiKeyStatsJobInput.Api(adminApi),
        ApiKeyStatsJobInput.ApiSubscription(selected),
        ApiKeyStatsJobInput.TeamSubscriber(selected.team),
        ApiKeyStatsJobInput.TeamOwner(adminApi.team)
      ).foreach { input =>
        val job = new TestJob()
        val result =
          job.collect(input, Some(subscription(100).createdAt.getMillis))
        result.processed mustBe 1L
        result.lastCursor mustBe None
        job.seen.asScala.toSeq mustBe Seq(selected.id)
        job.cursors.asScala.toSeq mustBe Seq(0L)
      }
    }

    "integrate individual failures with the shared partial-completion outcome" in {
      seed(Seq(subscription(1), subscription(2)))
      val job = new TestJob(Set(subscription(1).id))

      Await.result(job.run(tenant, Runner.Api), 15.seconds) match {
        case JobOutcome.PartiallyCompleted(result) =>
          result.processed mustBe 2L
          result.succeeded mustBe 1L
          result.failures.map(_.itemId) mustBe Seq(subscription(1).id.value)
        case outcome => fail(s"Expected partial completion, got $outcome")
      }
    }

    "count one collected subscription while storing multiple days and refreshing today in place" in {
      val selected = seedCollection()
      val client = new StatsClient()
      val job = new ApiKeyStatsJob(
        client,
        daikokuComponents.paymentClient,
        daikokuComponents.env
      )

      Await.result(job.run(tenant, Runner.Api), 15.seconds) match {
        case JobOutcome.Completed(result) =>
          result.processed mustBe 1L
          result.succeeded mustBe 1L
        case outcome => fail(s"Expected completion, got $outcome")
      }
      val repo =
        daikokuComponents.env.dataStore.consumptionRepo.forTenant(tenant)
      val initial = Await.result(repo.findAll(), 10.seconds)
      initial.size mustBe 3
      val today = initial.find(!_.isComplete).get

      client.hits = 20L
      val refreshed =
        Await.result(job.syncForSubscription(selected, tenant), 15.seconds)
      refreshed.map(_.id) mustBe Seq(today.id)
      refreshed.head.hits mustBe 20L
      Await.result(repo.findAll(), 10.seconds).size mustBe 3
    }

    "retry a failed historical day before collecting later days" in {
      val selected = seedCollection()
      val client = new StatsClient()
      val firstDay = selected.createdAt.getMillis
      val secondDay = selected.createdAt.plusDays(1).getMillis
      val thirdDay = selected.createdAt.plusDays(2).getMillis
      client.failedFrom = Some(secondDay)
      val job = new ApiKeyStatsJob(
        client,
        daikokuComponents.paymentClient,
        daikokuComponents.env
      )

      intercept[IllegalStateException] {
        Await.result(job.syncForSubscription(selected, tenant), 15.seconds)
      }
      val repo =
        daikokuComponents.env.dataStore.consumptionRepo.forTenant(tenant)
      Await.result(repo.findAll(), 10.seconds).map(_.from.getMillis) mustBe Seq(
        firstDay
      )

      client.failedFrom = None
      Await.result(job.syncForSubscription(selected, tenant), 15.seconds)
      client.requestedDays.asScala.toSeq mustBe Seq(
        firstDay,
        secondDay,
        secondDay,
        thirdDay
      )
      Await.result(repo.findAll(), 10.seconds).size mustBe 3
    }
  }
}
