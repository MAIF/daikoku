package fr.maif.daikoku.controllers

import com.sun.net.httpserver.HttpServer
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.jobs.{
  JobOutcome,
  Runner,
  SubscriptionBatchMaterializationJob
}
import fr.maif.daikoku.login.AuthProvider
import fr.maif.daikoku.services.SubscriptionBatchService
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import fr.maif.daikoku.utils.IdGenerator
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.Json

import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentLinkedQueue
import scala.concurrent.{Await, Future}
import scala.concurrent.duration.*
import scala.jdk.CollectionConverters.*

class SubscriptionBatchStorageSpec
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience {

  private def newBatch() = {
    val token = IdGenerator.token(32)
    SubscriptionBatchDemand(
      id = SubscriptionBatchDemandId(token),
      tenant = TenantId(s"batch-storage-$token"),
      team = TeamId(s"consumer-$token"),
      from = UserId(s"requester-$token"),
      idempotencyKey = "submission",
      items = Seq(
        SubscriptionBatchItem(
          id = SubscriptionBatchItemId("item"),
          api = ApiId("api"),
          plan = UsagePlanId("plan"),
          process = SubscriptionProcess(),
          keyringChoice =
            SubscriptionBatchKeyringChoice.Existing(KeyringId("keyring"))
        )
      )
    )
  }

  private def persistEligibilityFixtures(
      store: fr.maif.daikoku.storage.DataStore,
      batch: SubscriptionBatchDemand,
      requesterIsDaikokuAdmin: Boolean = false,
      apiVisibility: ApiVisibility = ApiVisibility.Public
  ): Unit = {
    val template = Await
      .result(store.tenantRepo.findAll(), 5.seconds)
      .headOption
      .getOrElse(
        throw new IllegalStateException(
          "The test database must contain a tenant fixture"
        )
      )
    val tenant = template.copy(
      id = batch.tenant,
      name = s"Batch test ${batch.id.value}",
      domain = s"${batch.id.value.toLowerCase}.example.test",
      contact = "batch@example.test",
      adminApi = ApiId("admin"),
      subscriptionSecurity = Some(false)
    )
    val requester = User(
      id = batch.from,
      tenants = Set(batch.tenant),
      origins = Set(AuthProvider.Local),
      name = "Batch requester",
      email = s"${batch.from.value}@example.test",
      lastTenant = None,
      defaultLanguage = Some("en"),
      isDaikokuAdmin = requesterIsDaikokuAdmin
    )
    val consumer = Team(
      id = batch.team,
      tenant = batch.tenant,
      `type` = TeamType.Organization,
      name = "Batch consumer",
      description = "",
      contact = requester.email,
      users = Set(UserWithPermission(batch.from, TeamPermission.TeamUser))
    )
    val producer = Team(
      id = TeamId("producer"),
      tenant = batch.tenant,
      `type` = TeamType.Organization,
      name = "Batch producer",
      description = "",
      contact = requester.email,
      users = Set(
        UserWithPermission(batch.from, TeamPermission.Administrator)
      )
    )
    val apis = batch.items.groupBy(_.api).map { case (apiId, items) =>
      Api(
        id = apiId,
        tenant = batch.tenant,
        team = TeamId("producer"),
        name = s"API ${apiId.value}",
        smallDescription = "",
        description = "",
        documentation = ApiDocumentation(
          ApiDocumentationId(s"docs-${apiId.value}"),
          batch.tenant,
          Seq.empty,
          org.joda.time.DateTime.now
        ),
        visibility = apiVisibility,
        possibleUsagePlans = items.map(_.plan).distinct,
        defaultUsagePlan = items.headOption.map(_.plan),
        authorizedTeams = Seq(batch.team),
        state = ApiState.Published,
        lastUpdate = org.joda.time.DateTime.now
      )
    }
    val plans = batch.items
      .map(item =>
        UsagePlan(item.plan, batch.tenant, s"Plan ${item.plan.value}")
          .copy(subscriptionProcess = item.process)
      )
      .distinctBy(_.id)
    val existingKeyrings = batch.items.flatMap(_.keyringChoice match {
      case SubscriptionBatchKeyringChoice.Existing(id) =>
        Some(
          (
            id,
            "Consumer key",
            KeyringOtoroshiBinding.Internal,
            Option.empty[KeyringShellProvenance]
          )
        )
      case _ => None
    })
    val newKeyrings = batch.newKeyrings.flatMap { creation =>
      creation.keyring.map { id =>
        val references = batch.items.collect {
          case item
              if item.keyringChoice == SubscriptionBatchKeyringChoice.New(
                creation.id
              ) =>
            SubscriptionBatchReference(batch.id, item.id)
        }
        (
          id,
          creation.customName,
          creation.binding,
          Some(KeyringShellProvenance(batch.id, creation.id, references))
        )
      }
    }
    val keyrings = (existingKeyrings ++ newKeyrings).distinctBy(_._1).map {
      case (id, name, binding, shell) =>
        Keyring(
          id = id,
          tenant = batch.tenant,
          team = batch.team,
          customName = name,
          apiKey = OtoroshiApiKey(name, s"client-${id.value}", "secret"),
          otoroshiSettings = binding,
          createdAt = org.joda.time.DateTime.now,
          integrationToken = s"integration-${id.value}",
          enabled = shell.isEmpty,
          shell = shell
        )
    }
    Await.result(store.tenantRepo.save(tenant), 5.seconds)
    Await.result(store.userRepo.save(requester), 5.seconds)
    Await.result(
      store.teamRepo.forTenant(batch.tenant).save(consumer),
      5.seconds
    )
    Await.result(
      store.teamRepo.forTenant(batch.tenant).save(producer),
      5.seconds
    )
    apis.foreach(api =>
      Await.result(store.apiRepo.forTenant(batch.tenant).save(api), 5.seconds)
    )
    plans.foreach(plan =>
      Await.result(
        store.usagePlanRepo.forTenant(batch.tenant).save(plan),
        5.seconds
      )
    )
    keyrings.foreach(keyring =>
      Await.result(
        store.keyringRepo.forTenant(batch.tenant).save(keyring),
        5.seconds
      )
    )
  }

  private def deleteEligibilityFixtures(
      store: fr.maif.daikoku.storage.DataStore,
      batch: SubscriptionBatchDemand
  ): Unit = {
    Await.result(store.apiRepo.forTenant(batch.tenant).deleteAll(), 5.seconds)
    Await.result(
      store.usagePlanRepo.forTenant(batch.tenant).deleteAll(),
      5.seconds
    )
    Await.result(store.teamRepo.forTenant(batch.tenant).deleteAll(), 5.seconds)
    Await.result(
      store.keyringRepo.forTenant(batch.tenant).deleteAll(),
      5.seconds
    )
    Await.result(store.userRepo.deleteById(batch.from), 5.seconds)
    Await.result(store.tenantRepo.deleteById(batch.tenant), 5.seconds)
  }

  private def awaitMaterialization(
      service: SubscriptionBatchService,
      tenant: TenantId,
      limit: Int
  ): Seq[(SubscriptionBatchReference, Either[AppError, SubscriptionDemand])] =
    Await
      .result(service.materializePendingItems(tenant, limit).value, 10.seconds)
      .fold(error => fail(error.getErrorMessage()), identity)

  private def newChild(
      batch: SubscriptionBatchDemand,
      item: SubscriptionBatchItem
  ) =
    SubscriptionDemand(
      id = DemandId(IdGenerator.token(32)),
      tenant = batch.tenant,
      api = item.api,
      plan = item.plan,
      steps = Seq.empty,
      team = batch.team,
      from = batch.from
    )

  "Subscription batch producer workflow" should {
    "reject every plan in one grouped notification through the producer route" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val env = daikokuComponents.env
      val store = env.dataStore
      val initial = newBatch()
      val process = SubscriptionProcess(
        Seq(ValidationStep.TeamAdmin("producer", TeamId("producer")))
      )
      val firstItem = initial.items.head.copy(process = process)
      val parent = initial.copy(items =
        Seq(
          firstItem,
          firstItem.copy(
            id = SubscriptionBatchItemId("second"),
            plan = UsagePlanId("second-plan")
          )
        )
      )
      val job = new SubscriptionBatchMaterializationJob(
        env,
        daikokuComponents.subscriptionBatchService,
        daikokuComponents.apiService
      )
      var producer: Option[User] = None
      try {
        persistEligibilityFixtures(
          store,
          parent,
          requesterIsDaikokuAdmin = true
        )
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        val tenant = Await
          .result(store.tenantRepo.findById(parent.tenant), 5.seconds)
          .get
        val producerUser = Await
          .result(store.userRepo.findById(parent.from), 5.seconds)
          .get
        producer = Some(producerUser)

        Await.result(
          job.run(tenant, Runner.Api, input = Some(parent.id), parallelism = 2),
          10.seconds
        ) match {
          case JobOutcome.Completed(result) =>
            result.failures mustBe empty
          case other => fail(s"Unexpected producer workflow outcome: $other")
        }

        val notifications = Await
          .result(
            store.notificationRepo.findPendingByTeam(
              parent.tenant,
              TeamId("producer")
            ),
            5.seconds
          )
          .collect {
            case notification: Notification
                if notification.action.isInstanceOf[
                  NotificationAction.ApiSubscriptionBatchDemand
                ] =>
              notification
          }
        notifications must have size 1
        notifications.head.action match {
          case action: NotificationAction.ApiSubscriptionBatchDemand =>
            action.items.map(_.plan).toSet mustBe parent.items.map(_.plan).toSet
          case _ => fail("Expected a grouped subscription notification")
        }

        val session = loginWithBlocking(producerUser, tenant)
        val rejectedResponse = httpJsonCallBlocking(
          s"/api/notifications/${notifications.head.id.value}/reject",
          method = "PUT",
          body = Some(Json.obj("message" -> "Not approved"))
        )(using tenant, session)
        rejectedResponse.status mustBe 200
        (rejectedResponse.json \ "done").as[Boolean] mustBe true

        val rejectedNotification = Await
          .result(
            store.notificationRepo
              .forTenant(parent.tenant)
              .findById(notifications.head.id),
            5.seconds
          )
          .get
        rejectedNotification.status mustBe a[NotificationStatus.Rejected]

        parent.items.foreach { item =>
          val child = Await
            .result(
              store.subscriptionDemandRepo.findByBatchItem(
                parent.tenant,
                SubscriptionBatchReference(parent.id, item.id)
              ),
              5.seconds
            )
            .get
          child.state mustBe SubscriptionDemandState.Refused
        }
        val savedBatch = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
        savedBatch.items.map(_.state) mustBe Seq.fill(2)(
          SubscriptionBatchItemState.Refused
        )
        savedBatch.state mustBe SubscriptionBatchDemandState.Failed
        Await
          .result(
            store.apiSubscriptionRepo.forTenant(parent.tenant).findAll(),
            5.seconds
          ) mustBe empty
      } finally {
        producer.foreach(user =>
          Await.result(
            store.userSessionRepo.deleteByUserEmail(user.email),
            5.seconds
          )
        )
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.apiSubscriptionRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.notificationRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(store, parent)
      }
    }

    "accept one grouped notification and process each plan independently" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val env = daikokuComponents.env
      val store = env.dataStore
      val initial = newBatch()
      val acceptedPlan = initial.items.head.plan
      val refusedPlan = UsagePlanId("refused-plan")
      val callbackRequests = new ConcurrentLinkedQueue[String]()
      val callback = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0)
      callback.createContext(
        "/validate",
        exchange => {
          val request = Json.parse(
            new String(
              exchange.getRequestBody.readAllBytes(),
              StandardCharsets.UTF_8
            )
          )
          val planId = (request \ "plan" \ "_id").as[String]
          callbackRequests.add(planId)
          val accepted = planId == acceptedPlan.value
          val response = Json.obj(
            "accept" -> accepted,
            "message" -> "Rejected by the plan-specific test callback"
          )
          val bytes = Json.stringify(response).getBytes(StandardCharsets.UTF_8)
          exchange.getResponseHeaders.add("Content-Type", "application/json")
          exchange.sendResponseHeaders(200, bytes.length.toLong)
          exchange.getResponseBody.write(bytes)
          exchange.getResponseBody.close()
          exchange.close()
        }
      )
      callback.start()
      val process = SubscriptionProcess(
        Seq(
          ValidationStep.TeamAdmin("producer", TeamId("producer")),
          ValidationStep.HttpRequest(
            "plan-validation",
            "Plan validation",
            s"http://127.0.0.1:${callback.getAddress.getPort}/validate"
          )
        )
      )
      val firstItem = initial.items.head.copy(process = process)
      val parent = initial.copy(items =
        Seq(
          firstItem,
          firstItem.copy(
            id = SubscriptionBatchItemId("refused"),
            plan = refusedPlan
          )
        )
      )
      val job = new SubscriptionBatchMaterializationJob(
        env,
        daikokuComponents.subscriptionBatchService,
        daikokuComponents.apiService
      )
      var requester: Option[User] = None
      try {
        persistEligibilityFixtures(
          store,
          parent,
          requesterIsDaikokuAdmin = true,
          apiVisibility = ApiVisibility.AdminOnly
        )
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        val tenant = Await
          .result(store.tenantRepo.findById(parent.tenant), 5.seconds)
          .get
        val producer = Await
          .result(store.userRepo.findById(parent.from), 5.seconds)
          .get
        requester = Some(producer)

        Await.result(
          job.run(tenant, Runner.Api, input = Some(parent.id), parallelism = 2),
          10.seconds
        ) match {
          case JobOutcome.Completed(result) =>
            result.failures mustBe empty
          case other => fail(s"Unexpected producer approval outcome: $other")
        }

        val groupedNotifications = Await
          .result(
            store.notificationRepo.findPendingByTeam(
              parent.tenant,
              TeamId("producer")
            ),
            5.seconds
          )
          .collect {
            case notification: Notification
                if notification.action.isInstanceOf[
                  NotificationAction.ApiSubscriptionBatchDemand
                ] =>
              notification
          }
        groupedNotifications must have size 1
        groupedNotifications.head.action match {
          case action: NotificationAction.ApiSubscriptionBatchDemand =>
            action.items.map(_.plan).toSet mustBe Set(
              acceptedPlan,
              refusedPlan
            )
          case _ => fail("Expected a grouped subscription notification")
        }

        val session = loginWithBlocking(producer, tenant)
        val acceptedResponse = httpJsonCallBlocking(
          s"/api/notifications/${groupedNotifications.head.id.value}/accept",
          method = "PUT",
          body = Some(Json.obj())
        )(using tenant, session)
        acceptedResponse.status mustBe 200

        Await.result(
          job.run(tenant, Runner.Api, input = Some(parent.id), parallelism = 2),
          10.seconds
        ) match {
          case JobOutcome.Completed(result) =>
            result.failures mustBe empty
          case other => fail(s"Unexpected post-approval outcome: $other")
        }

        callbackRequests.asScala.toSeq.sorted mustBe Seq(
          acceptedPlan.value,
          refusedPlan.value
        ).sorted
        val savedBatch = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
        savedBatch.items.map(_.state) mustBe Seq(
          SubscriptionBatchItemState.Accepted,
          SubscriptionBatchItemState.Refused
        )
        savedBatch.state mustBe SubscriptionBatchDemandState.PartiallyAccepted
        val children = parent.items.map { item =>
          Await
            .result(
              store.subscriptionDemandRepo.findByBatchItem(
                parent.tenant,
                SubscriptionBatchReference(parent.id, item.id)
              ),
              5.seconds
            )
            .get
        }
        children.map(_.state) mustBe Seq(
          SubscriptionDemandState.Accepted,
          SubscriptionDemandState.Refused
        )
        Await
          .result(
            store.apiSubscriptionRepo
              .findByKeyring(parent.tenant, KeyringId("keyring")),
            5.seconds
          )
          .map(_.plan) mustBe Seq(acceptedPlan)
      } finally {
        callback.stop(0)
        requester.foreach(user =>
          Await.result(
            store.userSessionRepo.deleteByUserEmail(user.email),
            5.seconds
          )
        )
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.apiSubscriptionRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.notificationRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(store, parent)
      }
    }
  }

  "Atomic batch submission" should {
    "submit a consumer batch through HTTP without materializing child demands" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val template = newBatch()
      val selection = SubscriptionBatchSubmission(
        team = template.team,
        idempotencyKey = template.idempotencyKey,
        items = template.items.map(item =>
          SubscriptionBatchItemSelection(
            item.api,
            item.plan,
            item.keyringChoice
          )
        )
      )
      var requester: Option[User] = None
      try {
        persistEligibilityFixtures(store, template)
        val plan = Await
          .result(
            store.usagePlanRepo
              .forTenant(template.tenant)
              .findById(template.items.head.plan),
            5.seconds
          )
          .get
        Await.result(
          store.usagePlanRepo
            .forTenant(template.tenant)
            .save(plan.copy(aggregationApiKeysSecurity = Some(true))),
          5.seconds
        )
        val tenant = Await
          .result(store.tenantRepo.findById(template.tenant), 5.seconds)
          .get
        val consumer = Await
          .result(store.userRepo.findById(template.from), 5.seconds)
          .get
        requester = Some(consumer)
        val session = loginWithBlocking(consumer, tenant)
        val requestBody =
          fr.maif.daikoku.domain.json.SubscriptionBatchSubmissionFormat
            .writes(selection)
        val response = httpJsonCallBlocking(
          s"/api/subscription/team/${template.team.value}/batches",
          method = "POST",
          body = Some(requestBody)
        )(using tenant, session)

        response.status mustBe 201
        val receipt = response.json
          .validate(using
            fr.maif.daikoku.domain.json.SubscriptionBatchSubmissionReceiptFormat
          )
          .get
        receipt.replayed mustBe false
        receipt.state mustBe SubscriptionBatchDemandState.Pending
        val pendingPlans = httpJsonCallBlocking(
          s"/api/subscription/team/${template.team.value}/pending-plans",
          method = "GET"
        )(using tenant, session)
        pendingPlans.status mustBe 200
        pendingPlans.json mustBe play.api.libs.json.Json.arr(
          play.api.libs.json.Json.obj(
            "api" -> template.items.head.api.value,
            "plan" -> template.items.head.plan.value
          )
        )
        val persisted = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(template.tenant)
              .findById(receipt.batch),
            5.seconds
          )
          .get
        persisted.items.map(_.state) mustBe Seq(
          SubscriptionBatchItemState.Pending
        )
        persisted.items.foreach(_.demand mustBe None)
        Await.result(
          store.subscriptionDemandRepo.forTenant(template.tenant).count(),
          5.seconds
        ) mustBe 0L

        val replay = httpJsonCallBlocking(
          s"/api/subscription/team/${template.team.value}/batches",
          method = "POST",
          body = Some(requestBody)
        )(using tenant, session)
        replay.status mustBe 201
        val replayReceipt = replay.json
          .validate(using
            fr.maif.daikoku.domain.json.SubscriptionBatchSubmissionReceiptFormat
          )
          .get
        replayReceipt mustBe receipt.copy(replayed = true)
        val closed = persisted.copy(items =
          persisted.items.map(_.copy(state = SubscriptionBatchItemState.Canceled))
        )
        Await.result(
          store.subscriptionBatchDemandRepo.updateIfRevisionMatches(closed),
          5.seconds
        ) mustBe defined
        val afterCancellation = httpJsonCallBlocking(
          s"/api/subscription/team/${template.team.value}/pending-plans",
          method = "GET"
        )(using tenant, session)
        afterCancellation.status mustBe 200
        afterCancellation.json mustBe play.api.libs.json.Json.arr()
        val unitDemand = newChild(template, template.items.head)
          .copy(state = SubscriptionDemandState.Waiting)
        Await.result(
          store.subscriptionDemandRepo
            .forTenant(template.tenant)
            .save(unitDemand),
          5.seconds
        ) mustBe true
        Await.result(
          store.subscriptionDemandRepo
            .forTenant(template.tenant)
            .save(
              unitDemand.copy(
                id = DemandId(IdGenerator.token(32)),
                team = TeamId("another-consumer"),
                plan = UsagePlanId("another-plan")
              )
            ),
          5.seconds
        ) mustBe true
        val pendingUnit = httpJsonCallBlocking(
          s"/api/subscription/team/${template.team.value}/pending-plans",
          method = "GET"
        )(using tenant, session)
        pendingUnit.status mustBe 200
        pendingUnit.json mustBe pendingPlans.json
        Await.result(
          store.subscriptionDemandRepo.forTenant(template.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo.forTenant(template.tenant).count(),
          5.seconds
        ) mustBe 1L
        Await.result(
          store.subscriptionDemandRepo.forTenant(template.tenant).count(),
          5.seconds
        ) mustBe 0L
      } finally {
        requester.foreach(user =>
          Await.result(
            store.userSessionRepo.deleteByUserEmail(user.email),
            5.seconds
          )
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(template.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(store, template)
      }
    }

    "validate the selection, persist it once and replay its original receipt" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val template = newBatch()
      val selection = SubscriptionBatchSubmission(
        team = template.team,
        idempotencyKey = template.idempotencyKey,
        items = template.items.map(item =>
          SubscriptionBatchItemSelection(
            item.api,
            item.plan,
            item.keyringChoice
          )
        )
      )
      try {
        persistEligibilityFixtures(store, template)
        val plan = Await
          .result(
            store.usagePlanRepo
              .forTenant(template.tenant)
              .findById(template.items.head.plan),
            5.seconds
          )
          .get
        Await.result(
          store.usagePlanRepo
            .forTenant(template.tenant)
            .save(plan.copy(aggregationApiKeysSecurity = Some(true))),
          5.seconds
        )

        val first = Await.result(
          service
            .submit(
              template.tenant,
              Await
                .result(store.userRepo.findById(template.from), 5.seconds)
                .get,
              selection
            )
            .value,
          5.seconds
        )
        first.isRight mustBe true
        val receipt = first.toOption.get
        receipt.replayed mustBe false

        val persisted = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(template.tenant)
              .findById(receipt.batch),
            5.seconds
          )
          .get
        persisted.items.map(_.process) mustBe Seq(plan.subscriptionProcess)

        val replay = Await.result(
          service
            .submit(
              template.tenant,
              Await
                .result(store.userRepo.findById(template.from), 5.seconds)
                .get,
              selection
            )
            .value,
          5.seconds
        )
        replay mustBe Right(receipt.copy(replayed = true))
        val duplicateSelection =
          selection.copy(idempotencyKey = "another-submission")
        val duplicate = Await.result(
          service
            .submit(
              template.tenant,
              Await
                .result(store.userRepo.findById(template.from), 5.seconds)
                .get,
              duplicateSelection
            )
            .value,
          5.seconds
        )
        duplicate.isLeft mustBe true
        Await.result(
          store.subscriptionBatchDemandRepo.forTenant(template.tenant).count(),
          5.seconds
        ) mustBe 1L
      } finally {
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(template.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(store, template)
      }
    }

    "reject an invalid selection without persisting a partial batch" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val template = newBatch()
      val creationId = SubscriptionBatchKeyringId("new-shared-keyring")
      val newKeyringChoice = SubscriptionBatchKeyringChoice.New(creationId)
      val invalidSelection = SubscriptionBatchSubmission(
        team = template.team,
        idempotencyKey = template.idempotencyKey,
        items = Seq(
          SubscriptionBatchItemSelection(
            template.items.head.api,
            template.items.head.plan,
            newKeyringChoice
          ),
          SubscriptionBatchItemSelection(
            ApiId("missing-api"),
            template.items.head.plan,
            newKeyringChoice
          )
        ),
        newKeyrings = Seq(
          SubscriptionBatchNewKeyringSelection(creationId, "Shared key")
        )
      )
      try {
        persistEligibilityFixtures(store, template)
        val result = Await.result(
          service
            .submit(
              template.tenant,
              Await
                .result(store.userRepo.findById(template.from), 5.seconds)
                .get,
              invalidSelection
            )
            .value,
          5.seconds
        )
        result.isLeft mustBe true
        Await.result(
          store.subscriptionBatchDemandRepo.forTenant(template.tenant).count(),
          5.seconds
        ) mustBe 0L
      } finally {
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(template.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(store, template)
      }
    }
  }

  "Atomic batch child materialization" should {
    "link concurrent children without losing sibling updates or replacing existing progress" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val initial = newBatch()
      val parent = initial.copy(items =
        initial.items :+ initial.items.head.copy(
          id = SubscriptionBatchItemId("second"),
          plan = UsagePlanId("second-plan")
        )
      )
      try {
        persistEligibilityFixtures(store, parent)
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        val attempts = for {
          item <- parent.items
          _ <- 1 to 3
        } yield service.materializeItem(parent.tenant, parent.id, item.id).value
        val results = Await.result(Future.sequence(attempts), 10.seconds)
        results.forall(_.isRight) mustBe true
        results.flatMap(_.toOption.map(_.id)).distinct.size mustBe 2
        val reloaded = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
        reloaded.revision mustBe 2L
        reloaded.items.forall(item =>
          item.demand.isDefined && item.state == SubscriptionBatchItemState.Waiting
        ) mustBe true
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).count(),
          5.seconds
        ) mustBe 2L

        val first = results.head.toOption.get
        first.keyring mustBe Some(KeyringId("keyring"))
        val progressed = first.copy(state = SubscriptionDemandState.InProgress)
        Await.result(
          store.subscriptionDemandRepo
            .forTenant(parent.tenant)
            .save(progressed),
          5.seconds
        ) mustBe true
        Await.result(
          service
            .materializeItem(
              parent.tenant,
              parent.id,
              parent.items.head.id
            )
            .value,
          5.seconds
        ) mustBe Right(progressed)
      } finally {
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(store, parent)
      }
    }

    "reject missing items, wrong scopes and canceled items without inserting children" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val parent = newBatch()
      val item = parent.items.head
      val child = newChild(parent, item)
      val reference = SubscriptionBatchReference(parent.id, item.id)
      try {
        Await
          .result(store.materializeBatchChild(child, reference), 5.seconds)
          .isLeft mustBe true
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        val invalidChildren = Seq(
          child.copy(team = TeamId("other")),
          child.copy(from = UserId("other")),
          child.copy(api = ApiId("other")),
          child.copy(plan = UsagePlanId("other")),
          child.copy(batch =
            Some(reference.copy(item = SubscriptionBatchItemId("other")))
          )
        )
        invalidChildren.foreach { invalid =>
          Await
            .result(store.materializeBatchChild(invalid, reference), 5.seconds)
            .isLeft mustBe true
        }
        Await
          .result(
            store.materializeBatchChild(
              child,
              reference.copy(item = SubscriptionBatchItemId("missing"))
            ),
            5.seconds
          )
          .isLeft mustBe true
        val canceled = parent.copy(items =
          Seq(item.copy(state = SubscriptionBatchItemState.Canceled))
        )
        Await.result(
          store.subscriptionBatchDemandRepo.updateIfRevisionMatches(canceled),
          5.seconds
        ) mustBe defined
        Await
          .result(store.materializeBatchChild(child, reference), 5.seconds)
          .isLeft mustBe true
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).count(),
          5.seconds
        ) mustBe 0L
      } finally {
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
      }
    }

    "surface an inconsistent parent link rather than replacing or executing its child" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val parent = newBatch()
      val child = newChild(parent, parent.items.head)
      val reference =
        SubscriptionBatchReference(parent.id, parent.items.head.id)
      try {
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        Await.result(
          store.subscriptionDemandRepo
            .insertBatchChildIfAbsent(child, reference),
          5.seconds
        )
        intercept[IllegalStateException] {
          Await.result(store.materializeBatchChild(child, reference), 5.seconds)
        }
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .findById(parent.id),
          5.seconds
        ) mustBe Some(parent)
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).count(),
          5.seconds
        ) mustBe 1L
      } finally {
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
      }
    }

    "roll back the inserted child when updating its parent fails" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val parent = newBatch()
      val repo = store.subscriptionBatchDemandRepo.forTenant(parent.tenant)
      val physicalId = SubscriptionBatchDemandId(IdGenerator.token(32))
      val reference =
        SubscriptionBatchReference(physicalId, parent.items.head.id)
      try {
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        // Simulate a corrupt record whose physical key differs from its JSON identifier.
        Await.result(
          repo.execute(
            s"UPDATE ${repo.tableName} SET _id = $$1 WHERE _id = $$2 AND content->>'_tenant' = $$3",
            Seq(physicalId.value, parent.id.value, parent.tenant.value)
          ),
          5.seconds
        ) mustBe 1L
        intercept[IllegalStateException] {
          Await.result(
            store.materializeBatchChild(
              newChild(parent, parent.items.head),
              reference
            ),
            5.seconds
          )
        }
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).count(),
          5.seconds
        ) mustBe 0L
        Await.result(repo.findById(physicalId), 5.seconds) mustBe Some(parent)
      } finally {
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(repo.deleteAll(), 5.seconds)
      }
    }
  }

  "SubscriptionBatchService" should {
    "materialize only the requested slice when the durable worker runs" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val env = daikokuComponents.env
      val store = env.dataStore
      val initial = newBatch()
      val process = SubscriptionProcess(
        Seq(
          ValidationStep.Form("form", "Motivation"),
          ValidationStep.TeamAdmin("admin", TeamId("producer"))
        )
      )
      val parent = initial.copy(items =
        (1 to 6).map(index =>
          initial.items.head.copy(
            id = SubscriptionBatchItemId(s"worker-$index"),
            plan = UsagePlanId(s"worker-plan-$index"),
            process = process,
            state =
              if (index == 6) SubscriptionBatchItemState.RetryableError
              else SubscriptionBatchItemState.Pending,
            error =
              if (index == 6)
                Some(
                  SubscriptionBatchItemError(
                    "external_outcome_unknown",
                    "The previous external result must be reconciled"
                  )
                )
              else None
          )
        )
      )
      val otherBatch = initial.copy(
        id = SubscriptionBatchDemandId(IdGenerator.token(32)),
        idempotencyKey = "another-batch",
        items = Seq(
          initial.items.head.copy(
            id = SubscriptionBatchItemId("other-batch-item"),
            api = ApiId("other-api"),
            plan = UsagePlanId("other-plan")
          )
        )
      )
      val job = new SubscriptionBatchMaterializationJob(
        env,
        daikokuComponents.subscriptionBatchService,
        daikokuComponents.apiService
      )
      try {
        persistEligibilityFixtures(
          store,
          parent.copy(items = parent.items ++ otherBatch.items)
        )
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(otherBatch),
          5.seconds
        )

        val outcome = Await.result(
          job.run(
            Await
              .result(store.tenantRepo.findById(parent.tenant), 5.seconds)
              .get,
            Runner.Api,
            input = Some(parent.id),
            parallelism = 3
          ),
          10.seconds
        )
        outcome match {
          case JobOutcome.Completed(result) =>
            result.processed mustBe 3L
            result.succeeded mustBe 3L
            result.failures mustBe empty
          case other => fail(s"Unexpected batch worker outcome: $other")
        }
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).count(),
          5.seconds
        ) mustBe 3L
        val afterFirstSlice = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
        afterFirstSlice.items.take(3).map(_.state) mustBe Seq.fill(3)(
          SubscriptionBatchItemState.Waiting
        )
        afterFirstSlice.items.take(3).foreach(_.reservation mustBe None)
        Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(otherBatch.id),
            5.seconds
          )
          .get
          .items
          .head
          .state mustBe SubscriptionBatchItemState.Pending

        val resumed = Await.result(
          job.run(
            Await
              .result(store.tenantRepo.findById(parent.tenant), 5.seconds)
              .get,
            Runner.Api,
            input = Some(parent.id),
            parallelism = 3
          ),
          10.seconds
        )
        resumed match {
          case JobOutcome.Completed(result) =>
            result.processed mustBe 2L
            result.succeeded mustBe 2L
            result.failures mustBe empty
          case other => fail(s"Unexpected resumed batch worker outcome: $other")
        }
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).count(),
          5.seconds
        ) mustBe 5L
        val savedParent = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
        savedParent.items.last.state mustBe SubscriptionBatchItemState.RetryableError
        savedParent.items.last.error.map(_.code) mustBe Some(
          "external_outcome_unknown"
        )
      } finally {
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(
          store,
          parent.copy(items = parent.items ++ otherBatch.items)
        )
      }
    }

    "stop automatically after recording an uncertain child workflow result" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val env = daikokuComponents.env
      val store = env.dataStore
      val service = new SubscriptionBatchService(store)
      val parent = newBatch()
      val reference =
        SubscriptionBatchReference(parent.id, parent.items.head.id)
      try {
        persistEligibilityFixtures(store, parent)
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        awaitMaterialization(service, parent.tenant, 1).size mustBe 1
        Await
          .result(
            store.subscriptionBatchDemandRepo.findRunnableChildren(
              parent.tenant,
              10
            ),
            5.seconds
          )
          .toOption
          .get mustBe Seq(reference)

        val reservation = Await
          .result(
            service.reserveItem(parent.tenant, reference, 5.minutes).value,
            5.seconds
          )
          .toOption
          .get
        val marked = Await
          .result(
            store.markBatchItemRetryableError(
              parent.tenant,
              reference,
              reservation.token,
              SubscriptionBatchItemError(
                "workflow_execution_failed",
                "The external result needs reconciliation"
              )
            ),
            5.seconds
          )
          .toOption
          .get
        marked.items.head.state mustBe SubscriptionBatchItemState.RetryableError
        marked.items.head.reservation mustBe Some(reservation)
        marked.items.head.error.map(_.code) mustBe Some(
          "workflow_execution_failed"
        )
        Await
          .result(
            store.subscriptionBatchDemandRepo.findRunnableChildren(
              parent.tenant,
              10
            ),
            5.seconds
          )
          .toOption
          .get mustBe empty

        val reconciled = Await
          .result(
            service.reconcileFailure(parent.tenant, reference).value,
            5.seconds
          )
          .toOption
          .get
        reconciled.items.head.state mustBe SubscriptionBatchItemState.Waiting
        reconciled.items.head.error mustBe None
        reconciled.items.head.reservation mustBe None
        Await
          .result(
            store.subscriptionBatchDemandRepo.findRunnableChildren(
              parent.tenant,
              10
            ),
            5.seconds
          )
          .toOption
          .get mustBe Seq(reference)

        val retriedReservation = Await
          .result(
            service.reserveItem(parent.tenant, reference, 5.minutes).value,
            5.seconds
          )
          .toOption
          .get
        retriedReservation.token must not be reservation.token
        Await
          .result(
            service
              .releaseReservation(
                parent.tenant,
                reference,
                retriedReservation.token
              )
              .value,
            5.seconds
          )
          .isRight mustBe true
      } finally {
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(store, parent)
      }
    }

    "persist an automatic email step as started so the worker does not send it twice" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val env = daikokuComponents.env
      val store = env.dataStore
      val service = daikokuComponents.subscriptionBatchService
      val initial = newBatch()
      val parent = initial.copy(items =
        initial.items.map(
          _.copy(
            process = SubscriptionProcess(
              Seq(ValidationStep.Email("email", Seq.empty, None, "Email"))
            )
          )
        )
      )
      val job = new SubscriptionBatchMaterializationJob(
        env,
        service,
        daikokuComponents.apiService
      )
      try {
        persistEligibilityFixtures(store, parent)
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        val tenant = Await
          .result(store.tenantRepo.findById(parent.tenant), 5.seconds)
          .get
        val firstRun = Await.result(
          job.run(tenant, Runner.Api, input = Some(parent.id), parallelism = 1),
          10.seconds
        )
        firstRun match {
          case JobOutcome.Completed(result) =>
            result.processed mustBe 2L
            result.succeeded mustBe 2L
            result.failures mustBe empty
          case other => fail(s"Unexpected email workflow outcome: $other")
        }
        val child = Await
          .result(
            store.subscriptionDemandRepo.findByBatchItem(
              parent.tenant,
              SubscriptionBatchReference(parent.id, parent.items.head.id)
            ),
            5.seconds
          )
          .get
        child.state mustBe SubscriptionDemandState.InProgress

        val secondRun = Await.result(
          job.run(tenant, Runner.Api, input = Some(parent.id), parallelism = 1),
          10.seconds
        )
        secondRun match {
          case JobOutcome.Completed(result) =>
            result.processed mustBe 0L
            result.succeeded mustBe 0L
            result.failures mustBe empty
          case other =>
            fail(s"Unexpected repeated email workflow outcome: $other")
        }
      } finally {
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(store, parent)
      }
    }

    "hold an API phase barrier until every participating child resolves that phase" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val env = daikokuComponents.env
      val store = env.dataStore
      val service = daikokuComponents.subscriptionBatchService
      val initial = newBatch()
      val process = SubscriptionProcess(
        Seq(
          ValidationStep.Form("form", "Motivation"),
          ValidationStep.TeamAdmin("admin", TeamId("producer")),
          ValidationStep.Email("email", Seq.empty, None, "Email")
        )
      )
      val firstItem = initial.items.head.copy(process = process)
      val parent = initial.copy(items =
        Seq(
          firstItem,
          firstItem.copy(
            id = SubscriptionBatchItemId("second"),
            plan = UsagePlanId("second-plan")
          )
        )
      )
      try {
        persistEligibilityFixtures(store, parent)
        val tenant = Await
          .result(store.tenantRepo.findById(parent.tenant), 5.seconds)
          .get
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        val children = parent.items.map { item =>
          Await
            .result(
              service
                .materializeItem(parent.tenant, parent.id, item.id)
                .value,
              5.seconds
            )
            .toOption
            .get
        }
        val first = children.head
        val firstAfterAdmin = first.copy(
          state = SubscriptionDemandState.InProgress,
          steps = first.steps.map(step =>
            if (step.step.id == "admin")
              step.copy(state = SubscriptionDemandState.Accepted)
            else step
          )
        )
        Await.result(
          store.subscriptionDemandRepo
            .forTenant(parent.tenant)
            .save(firstAfterAdmin),
          5.seconds
        )
        Await
          .result(
            daikokuComponents.apiService.canRunBatchChild(first.id, tenant),
            5.seconds
          ) mustBe false

        val second = children(1)
        val secondAfterAdmin = second.copy(
          state = SubscriptionDemandState.InProgress,
          steps = second.steps.map(step =>
            if (step.step.id == "admin")
              step.copy(state = SubscriptionDemandState.Accepted)
            else step
          )
        )
        Await.result(
          store.subscriptionDemandRepo
            .forTenant(parent.tenant)
            .save(secondAfterAdmin),
          5.seconds
        )
        Await
          .result(
            daikokuComponents.apiService.canRunBatchChild(first.id, tenant),
            5.seconds
          ) mustBe true
      } finally {
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(store, parent)
      }
    }

    "notify producer admins once for all plans at the same API phase" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val env = daikokuComponents.env
      val store = env.dataStore
      val service = daikokuComponents.subscriptionBatchService
      val initial = newBatch()
      val process = SubscriptionProcess(
        Seq(
          ValidationStep.TeamAdmin("admin", TeamId("producer")),
          ValidationStep.TeamAdmin("second-admin", TeamId("producer"))
        )
      )
      val firstItem = initial.items.head.copy(process = process)
      val parent = initial.copy(items =
        Seq(
          firstItem,
          firstItem.copy(
            id = SubscriptionBatchItemId("second"),
            plan = UsagePlanId("second-plan")
          )
        )
      )
      try {
        persistEligibilityFixtures(store, parent)
        val tenant = Await
          .result(store.tenantRepo.findById(parent.tenant), 5.seconds)
          .get
        val requester = Await
          .result(store.userRepo.findById(parent.from), 5.seconds)
          .get
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        val children = parent.items.map { item =>
          Await
            .result(
              service
                .materializeItem(parent.tenant, parent.id, item.id)
                .value,
              5.seconds
            )
            .toOption
            .get
        }

        Await
          .result(
            daikokuComponents.apiService
              .runSubscriptionProcess(children.head.id, tenant)(using
                "en",
                requester
              )
              .value,
            10.seconds
          )
          .isRight mustBe true

        val firstNotifications = Await
          .result(
            store.notificationRepo.findPendingByTeam(
              parent.tenant,
              TeamId("producer")
            ),
            5.seconds
          )
          .collect {
            case notification: Notification
                if notification.action.isInstanceOf[
                  NotificationAction.ApiSubscriptionBatchDemand
                ] =>
              notification
          }
        firstNotifications must have size 1
        firstNotifications.head.action match {
          case action: NotificationAction.ApiSubscriptionBatchDemand =>
            action.phase mustBe 0
            action.items.map(_.item).toSet mustBe parent.items.map(_.id).toSet
            val resolved = Await.result(
              store.resolveBatchApproval(
                parent.tenant,
                firstNotifications.head.id,
                action,
                accepted = true,
                actor = requester.asNotificationSender,
                message = None
              ),
              5.seconds
            )
            resolved.isRight mustBe true
            resolved.toOption.get.status mustBe a[NotificationStatus.Accepted]
            val replay = Await.result(
              store.resolveBatchApproval(
                parent.tenant,
                firstNotifications.head.id,
                action,
                accepted = true,
                actor = requester.asNotificationSender,
                message = None
              ),
              5.seconds
            )
            replay.isLeft mustBe true
          case _ => fail("Expected a grouped subscription notification")
        }

        Await
          .result(
            daikokuComponents.apiService
              .runSubscriptionProcess(children.head.id, tenant)(using
                "en",
                requester
              )
              .value,
            10.seconds
          )
          .isRight mustBe true
        val secondNotifications = Await
          .result(
            store.notificationRepo.findPendingByTeam(
              parent.tenant,
              TeamId("producer")
            ),
            5.seconds
          )
          .collect {
            case notification: Notification
                if notification.action.isInstanceOf[
                  NotificationAction.ApiSubscriptionBatchDemand
                ] =>
              notification
          }
        secondNotifications must have size 1
        secondNotifications.head.action match {
          case action: NotificationAction.ApiSubscriptionBatchDemand =>
            action.phase mustBe 1
            val rejected = Await.result(
              store.resolveBatchApproval(
                parent.tenant,
                secondNotifications.head.id,
                action,
                accepted = false,
                actor = requester.asNotificationSender,
                message = Some("Not approved")
              ),
              5.seconds
            )
            rejected.isRight mustBe true
            rejected.toOption.get.status mustBe a[NotificationStatus.Rejected]
            val replay = Await.result(
              store.resolveBatchApproval(
                parent.tenant,
                secondNotifications.head.id,
                action,
                accepted = false,
                actor = requester.asNotificationSender,
                message = Some("Not approved")
              ),
              5.seconds
            )
            replay.isLeft mustBe true
          case _ => fail("Expected the second grouped subscription phase")
        }

        parent.items.foreach { item =>
          val child = Await
            .result(
              store.subscriptionDemandRepo.findByBatchItem(
                parent.tenant,
                SubscriptionBatchReference(parent.id, item.id)
              ),
              5.seconds
            )
            .get
          child.steps.head.state mustBe SubscriptionDemandState.Accepted
          child.steps(1).state mustBe SubscriptionDemandState.Refused
          child.state mustBe SubscriptionDemandState.Refused
        }
      } finally {
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.notificationRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(store, parent)
      }
    }

    "cancel unmaterialized items atomically and leave reserved work untouched" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val initial = newBatch()
      val parent = initial.copy(items =
        initial.items :+ initial.items.head.copy(
          id = SubscriptionBatchItemId("second-item"),
          plan = UsagePlanId("second-plan"),
          reservation = Some(
            SubscriptionBatchItemReservation(
              "active-reservation",
              org.joda.time.DateTime.now,
              org.joda.time.DateTime.now.plusMinutes(5)
            )
          )
        )
      )
      try {
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )

        Await
          .result(
            store.cancelBatch(parent.tenant, parent.id),
            5.seconds
          )
          .isLeft mustBe true
        Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
          .items
          .map(_.state) mustBe Seq(
          SubscriptionBatchItemState.Pending,
          SubscriptionBatchItemState.Pending
        )

        val unlocked = parent.copy(
          items = parent.items.map(_.copy(reservation = None))
        )
        Await
          .result(
            store.subscriptionBatchDemandRepo.updateIfRevisionMatches(unlocked),
            5.seconds
          )
          .isDefined mustBe true
        val canceled = Await.result(
          store.cancelBatch(parent.tenant, parent.id),
          5.seconds
        )
        canceled.toOption.get.items.forall(
          _.state == SubscriptionBatchItemState.Canceled
        ) mustBe true
        canceled.toOption.get.state mustBe SubscriptionBatchDemandState.Canceled
      } finally {
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
      }
    }

    "remove batch records when deleting their tenant without touching another tenant" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val parent = newBatch()
      val foreign = parent.copy(
        id = SubscriptionBatchDemandId(IdGenerator.token(32)),
        tenant = TenantId(s"${parent.tenant.value}-other")
      )
      val tenant = Tenant(
        id = parent.tenant,
        name = "Batch storage cleanup",
        domain = s"${parent.tenant.value}.test",
        contact = "admin@example.com",
        style = None,
        defaultLanguage = None,
        otoroshiSettings = Set.empty,
        mailerSettings = None,
        bucketSettings = None,
        authProvider = AuthProvider.Local,
        authProviderSettings = play.api.libs.json.Json.obj(),
        adminApi = ApiId("none")
      )
      try {
        Await.result(store.tenantRepo.save(tenant), 5.seconds) mustBe true
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(foreign),
          5.seconds
        )
        val reservationAt = org.joda.time.DateTime.now
        Await
          .result(
            store.reserveBatchItem(
              parent.tenant,
              SubscriptionBatchReference(parent.id, parent.items.head.id),
              SubscriptionBatchItemReservation(
                IdGenerator.token(32),
                reservationAt,
                reservationAt.plusMinutes(5)
              )
            ),
            5.seconds
          )
          .isRight mustBe true
        Await.result(
          daikokuComponents.tenantService.deleteTenant(tenant).value,
          10.seconds
        ) mustBe Right(tenant)
        Await.result(
          store.subscriptionBatchDemandRepo.forTenant(parent.tenant).count(),
          5.seconds
        ) mustBe 0L
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(foreign.tenant)
            .findById(foreign.id),
          5.seconds
        ) mustBe Some(foreign)
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .execute(
              "SELECT _id FROM subscription_batch_keyring_locks " +
                "WHERE content->>'_tenant' = $1",
              Seq(parent.tenant.value)
            ),
          5.seconds
        ) mustBe 0L
      } finally {
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(foreign.tenant)
            .deleteAll(),
          5.seconds
        )
        Await.result(store.tenantRepo.deleteById(tenant.id), 5.seconds)
      }
    }

    "persist and export a 300-plan selection while creating only a requested slice" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val env = daikokuComponents.env
      val store = env.dataStore
      val initial = newBatch()
      val parent = initial.copy(items =
        (1 to 300).map(index =>
          initial.items.head.copy(
            id = SubscriptionBatchItemId(s"large-$index"),
            plan = UsagePlanId(s"large-$index")
          )
        )
      )
      try {
        persistEligibilityFixtures(store, parent)
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).count(),
          5.seconds
        ) mustBe 0L
        val results = Await
          .result(
            daikokuComponents.subscriptionBatchService
              .materializePendingItems(parent.tenant, 7)
              .value,
            10.seconds
          )
          .toOption
          .get
        results.size mustBe 7
        results.forall(_._2.isRight) mustBe true
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).count(),
          5.seconds
        ) mustBe 7L
        val saved = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
        saved.items.size mustBe 300
        saved.items.count(_.demand.isDefined) mustBe 7
        saved.items.count(
          _.state == SubscriptionBatchItemState.Pending
        ) mustBe 293
        val exported = Await.result(
          store
            .exportAsStream(pretty = false, exportAuditTrail = false)(using
              ec,
              env.defaultMaterializer,
              env
            )
            .map(bytes => play.api.libs.json.Json.parse(bytes.utf8String))
            .filter(record =>
              (record \ "type").as[String] == "subscription_batch_demands" &&
                (record \ "payload" \ "_tenant")
                  .asOpt[String]
                  .contains(parent.tenant.value)
            )
            .runWith(org.apache.pekko.stream.scaladsl.Sink.seq)(using
              env.defaultMaterializer
            ),
          10.seconds
        )
        exported.size mustBe 1
        val restored = json.SubscriptionBatchDemandFormat
          .reads((exported.head \ "payload").get)
          .get
        restored mustBe saved
      } finally {
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(store, parent)
      }
    }

    "persist expired-work errors without replaying work or changing sibling outcomes" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val initial = newBatch()
      val expired = SubscriptionBatchItemReservation(
        "old-worker",
        new org.joda.time.DateTime(1000L),
        new org.joda.time.DateTime(2000L)
      )
      val active = SubscriptionBatchItemReservation(
        "active-worker",
        org.joda.time.DateTime.now,
        org.joda.time.DateTime.now.plusMinutes(5)
      )
      val parent = initial.copy(items =
        Seq(
          initial.items.head.copy(reservation = Some(expired)),
          initial.items.head.copy(
            id = SubscriptionBatchItemId("active"),
            plan = UsagePlanId("active"),
            reservation = Some(active)
          ),
          initial.items.head.copy(
            id = SubscriptionBatchItemId("ready"),
            plan = UsagePlanId("ready")
          ),
          initial.items.head.copy(
            id = SubscriptionBatchItemId("closed"),
            plan = UsagePlanId("closed"),
            state = SubscriptionBatchItemState.Canceled,
            reservation = Some(expired)
          )
        )
      )
      val reference =
        SubscriptionBatchReference(parent.id, parent.items.head.id)
      try {
        persistEligibilityFixtures(store, parent)
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        val results = Await.result(
          Future.sequence((1 to 3).map { _ =>
            service.reportExpiredReservation(parent.tenant, reference).value
          }),
          10.seconds
        )
        results.forall(_.isRight) mustBe true
        val saved = results.head.toOption.get
        results.forall(_ == Right(saved)) mustBe true
        saved.revision mustBe 1L
        saved.items.head.error.map(_.code) mustBe Some("reservation_expired")
        saved.items.head.reservation mustBe Some(expired)
        saved.items.head.state mustBe parent.items.head.state
        saved.items.tail mustBe parent.items.tail
        Await
          .result(
            service.reserveItem(parent.tenant, reference, 1.minute).value,
            5.seconds
          )
          .isLeft mustBe true
        for (item <- parent.items.tail) {
          Await
            .result(
              service
                .reportExpiredReservation(
                  parent.tenant,
                  reference.copy(item = item.id)
                )
                .value,
              5.seconds
            )
            .isLeft mustBe true
        }
        Await.result(
          store.subscriptionBatchDemandRepo.findMaterializableItems(
            parent.tenant,
            10
          ),
          5.seconds
        ) mustBe Right(Seq(reference.copy(item = parent.items(2).id)))
        val prepared = awaitMaterialization(service, parent.tenant, 10)
        prepared.map(_._1) mustBe Seq(reference.copy(item = parent.items(2).id))
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).count(),
          5.seconds
        ) mustBe 1L
        Await.result(
          service.materializePendingItems(parent.tenant, 0).value,
          5.seconds
        ) mustBe
          Left(
            AppError.BadRequestError(
              "The materialization limit must be positive"
            )
          )
        Await.result(
          store.subscriptionBatchDemandRepo
            .findMaterializableItems(parent.tenant, 0),
          5.seconds
        ) mustBe Left(
          AppError.BadRequestError("The materialization limit must be positive")
        )
      } finally {
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(store, parent)
      }
    }

    "renew and release only the active owner's reservation and reject old tokens after reacquisition" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val parent = newBatch()
      val reference =
        SubscriptionBatchReference(parent.id, parent.items.head.id)
      try {
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        val reservation = Await
          .result(
            service
              .reserveItem(
                parent.tenant,
                reference,
                5.minutes
              )
              .value,
            5.seconds
          )
          .toOption
          .get
        Await
          .result(
            service
              .releaseReservation(
                parent.tenant,
                reference,
                "wrong"
              )
              .value,
            5.seconds
          )
          .isLeft mustBe true
        Await
          .result(
            service
              .renewReservation(
                parent.tenant,
                reference,
                "wrong",
                reservation.expiresAt.plusMinutes(1)
              )
              .value,
            5.seconds
          )
          .isLeft mustBe true
        Await
          .result(
            service
              .renewReservation(
                parent.tenant,
                reference,
                reservation.token,
                reservation.expiresAt
              )
              .value,
            5.seconds
          )
          .isLeft mustBe true
        val extended =
          reservation.copy(expiresAt = reservation.expiresAt.plusMinutes(1))
        Await.result(
          service
            .renewReservation(
              parent.tenant,
              reference,
              reservation.token,
              extended.expiresAt
            )
            .value,
          5.seconds
        ) mustBe Right(Some(extended))
        Await.result(
          service
            .releaseReservation(
              parent.tenant,
              reference,
              reservation.token
            )
            .value,
          5.seconds
        ) mustBe Right(None)
        val replacement = Await
          .result(
            service
              .reserveItem(
                parent.tenant,
                reference,
                5.minutes
              )
              .value,
            5.seconds
          )
          .toOption
          .get
        replacement.token must not be reservation.token
        Await
          .result(
            service
              .releaseReservation(
                parent.tenant,
                reference,
                reservation.token
              )
              .value,
            5.seconds
          )
          .isLeft mustBe true
        Await
          .result(
            service
              .renewReservation(
                parent.tenant,
                reference,
                reservation.token,
                replacement.expiresAt.plusMinutes(1)
              )
              .value,
            5.seconds
          )
          .isLeft mustBe true
        val saved = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
        saved.items.head.reservation mustBe Some(replacement)
        saved.revision mustBe 4L
      } finally {
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
      }
    }

    "preserve expired reservations even when their former owner requests renewal or release" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val initial = newBatch()
      val expired = SubscriptionBatchItemReservation(
        "old-token",
        new org.joda.time.DateTime(1000L),
        new org.joda.time.DateTime(2000L)
      )
      val parent = initial.copy(items =
        Seq(initial.items.head.copy(reservation = Some(expired)))
      )
      val reference =
        SubscriptionBatchReference(parent.id, parent.items.head.id)
      try {
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        Await
          .result(
            service
              .releaseReservation(
                parent.tenant,
                reference,
                expired.token
              )
              .value,
            5.seconds
          )
          .isLeft mustBe true
        Await
          .result(
            service
              .renewReservation(
                parent.tenant,
                reference,
                expired.token,
                org.joda.time.DateTime.now.plusMinutes(1)
              )
              .value,
            5.seconds
          )
          .isLeft mustBe true
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .findById(parent.id),
          5.seconds
        ) mustBe Some(parent)
      } finally {
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
      }
    }

    "reserve an item for only one worker while preserving sibling reservations" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val initial = newBatch()
      val parent = initial.copy(items =
        Seq(
          initial.items.head,
          initial.items.head.copy(
            id = SubscriptionBatchItemId("second"),
            plan = UsagePlanId("second"),
            keyringChoice = SubscriptionBatchKeyringChoice.Existing(
              KeyringId("other-keyring")
            )
          )
        )
      )
      val reference =
        SubscriptionBatchReference(parent.id, parent.items.head.id)
      try {
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        Await
          .result(
            service.reserveItem(parent.tenant, reference, 0.seconds).value,
            5.seconds
          )
          .isLeft mustBe true
        val results = Await.result(
          Future.sequence((1 to 5).map { _ =>
            service.reserveItem(parent.tenant, reference, 30.seconds).value
          }),
          10.seconds
        )
        results.count(_.isRight) mustBe 1
        results.count(_.isLeft) mustBe 4
        val winner = results.flatMap(_.toOption).head
        val other = Await
          .result(
            service
              .reserveItem(
                parent.tenant,
                reference.copy(item = parent.items(1).id),
                30.seconds
              )
              .value,
            5.seconds
          )
          .toOption
          .get
        other.token must not be winner.token
        val saved = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
        saved.revision mustBe 2L
        saved.items.map(_.reservation) mustBe Seq(Some(winner), Some(other))
        saved.items.map(_.state) mustBe parent.items.map(_.state)
        Await
          .result(
            service
              .reserveItem(
                TenantId("wrong"),
                reference,
                30.seconds
              )
              .value,
            5.seconds
          )
          .isLeft mustBe true
        Await
          .result(
            service
              .reserveItem(
                parent.tenant,
                reference.copy(item = SubscriptionBatchItemId("missing")),
                30.seconds
              )
              .value,
            5.seconds
          )
          .isLeft mustBe true
      } finally {
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
      }
    }

    "serialize reservations for the same keyring across batches" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val first = newBatch()
      val second = first.copy(
        id = SubscriptionBatchDemandId(IdGenerator.token(32)),
        idempotencyKey = "second-batch"
      )
      val firstReference =
        SubscriptionBatchReference(first.id, first.items.head.id)
      val secondReference =
        SubscriptionBatchReference(second.id, second.items.head.id)
      try {
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(first),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(second),
          5.seconds
        )
        val firstReservation = Await
          .result(
            service
              .reserveItem(first.tenant, firstReference, 1.minute)
              .value,
            5.seconds
          )
          .toOption
          .get
        Await
          .result(
            service
              .reserveItem(second.tenant, secondReference, 1.minute)
              .value,
            5.seconds
          )
          .isLeft mustBe true
        Await.result(
          service
            .releaseReservation(
              first.tenant,
              firstReference,
              firstReservation.token
            )
            .value,
          5.seconds
        ) mustBe Right(None)
        Await
          .result(
            service
              .reserveItem(second.tenant, secondReference, 1.minute)
              .value,
            5.seconds
          )
          .isRight mustBe true
      } finally {
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(first.tenant)
            .deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(second.tenant)
            .deleteAll(),
          5.seconds
        )
      }
    }

    "never take over an expired reservation or reserve a closed item" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val initial = newBatch()
      val expired = SubscriptionBatchItemReservation(
        "previous-worker",
        new org.joda.time.DateTime(1000L),
        new org.joda.time.DateTime(2000L)
      )
      val parent = initial.copy(items =
        Seq(
          initial.items.head.copy(reservation = Some(expired)),
          initial.items.head.copy(
            id = SubscriptionBatchItemId("closed"),
            plan = UsagePlanId("closed"),
            state = SubscriptionBatchItemState.Canceled
          )
        )
      )
      try {
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        parent.items.foreach { item =>
          Await
            .result(
              service
                .reserveItem(
                  parent.tenant,
                  SubscriptionBatchReference(parent.id, item.id),
                  30.seconds
                )
                .value,
              5.seconds
            )
            .isLeft mustBe true
        }
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .findById(parent.id),
          5.seconds
        ) mustBe Some(parent)
      } finally {
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
      }
    }

    "commit terminal outcomes with notifications and roll back a mismatched notification" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val parent = newBatch()
      val service = new SubscriptionBatchService(store)
      val notification = Notification(
        id = NotificationId(IdGenerator.token(32)),
        tenant = parent.tenant,
        team = Some(parent.team),
        sender = NotificationSender(
          "Requester",
          "requester@example.com",
          Some(parent.from)
        ),
        notificationType = NotificationType.AcceptOnly,
        action = NotificationAction.ApiSubscriptionAccept(
          parent.items.head.api,
          parent.items.head.plan,
          parent.team
        )
      )
      val subscription = ApiSubscription(
        id = ApiSubscriptionId(IdGenerator.token(32)),
        tenant = parent.tenant,
        plan = parent.items.head.plan,
        createdAt = org.joda.time.DateTime.now,
        team = parent.team,
        api = parent.items.head.api,
        by = parent.from,
        customName = None,
        keyring = KeyringId("keyring")
      )
      try {
        persistEligibilityFixtures(store, parent)
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        val child = Await
          .result(
            service
              .materializeItem(
                parent.tenant,
                parent.id,
                parent.items.head.id
              )
              .value,
            5.seconds
          )
          .toOption
          .get
        child.steps mustBe empty
        child.batch mustBe Some(
          SubscriptionBatchReference(parent.id, parent.items.head.id)
        )
        val reservationToken = "acceptance-reservation"
        val linkedBatch = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
        val lockedAt = org.joda.time.DateTime.now()
        Await.result(
          store.subscriptionBatchDemandRepo.updateIfRevisionMatches(
            linkedBatch.copy(items =
              linkedBatch.items.map(
                _.copy(
                  reservation = Some(
                    SubscriptionBatchItemReservation(
                      reservationToken,
                      lockedAt,
                      lockedAt.plusSeconds(60)
                    )
                  )
                )
              )
            )
          ),
          5.seconds
        ) mustBe defined
        val accepted = child.copy(state = SubscriptionDemandState.Accepted)
        Await.result(
          store.saveBatchChildProgress(
            accepted,
            child,
            Some(subscription.id),
            Some(notification),
            Some("wrong-token")
          ),
          5.seconds
        ) mustBe Left(AppError.EntityConflict("Subscription batch reservation"))
        Await.result(
          store.saveBatchChildProgress(
            accepted,
            child,
            Some(subscription.id),
            Some(notification),
            Some(reservationToken)
          ),
          5.seconds
        ) mustBe Left(AppError.SubscriptionNotFound)
        Await.result(
          store.apiSubscriptionRepo.forTenant(parent.tenant).save(subscription),
          5.seconds
        ) mustBe true
        intercept[IllegalArgumentException] {
          Await.result(
            store.saveBatchChildProgress(
              accepted,
              child,
              Some(subscription.id),
              Some(notification.copy(tenant = TenantId("wrong"))),
              Some(reservationToken)
            ),
            5.seconds
          )
        }
        Await.result(
          store.subscriptionDemandRepo
            .forTenant(parent.tenant)
            .findById(child.id),
          5.seconds
        ) mustBe Some(child)
        val unchanged = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
        unchanged.items.head.state mustBe SubscriptionBatchItemState.Waiting
        Await.result(
          store.saveBatchChildProgress(
            accepted,
            child,
            Some(subscription.id),
            Some(notification),
            Some(reservationToken)
          ),
          5.seconds
        ) mustBe Right(())
        val saved = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
        saved.items.head.subscription mustBe Some(subscription.id)
        saved.items.head.demand mustBe Some(child.id)
        saved.items.head.state mustBe SubscriptionBatchItemState.Accepted
        saved.items.head.reservation mustBe None
        saved.state mustBe SubscriptionBatchDemandState.Accepted
        Await.result(
          store.notificationRepo
            .forTenant(parent.tenant)
            .findById(notification.id),
          5.seconds
        ) mustBe Some(notification)
        Await
          .result(
            store.saveBatchChildProgress(
              accepted,
              child,
              Some(subscription.id),
              Some(notification),
              Some(reservationToken)
            ),
            5.seconds
          )
          .isLeft mustBe true
        Await.result(
          store.notificationRepo.forTenant(parent.tenant).count(),
          5.seconds
        ) mustBe 1L
      } finally {
        Await.result(
          store.notificationRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.apiSubscriptionRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(store, parent)
      }
    }

    "cancel a batch child without breaking its parent link or leaving workflow artifacts" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val initial = newBatch()
      val item = initial.items.head.copy(
        process = SubscriptionProcess(
          Seq(
            ValidationStep.TeamAdmin(
              "admin",
              TeamId("producer")
            )
          )
        )
      )
      val parent = initial.copy(items = Seq(item))
      var demandForCleanup = Option.empty[DemandId]
      try {
        persistEligibilityFixtures(store, parent)
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        val child = Await
          .result(
            service
              .materializeItem(
                parent.tenant,
                parent.id,
                item.id
              )
              .value,
            5.seconds
          )
          .toOption
          .get
        demandForCleanup = Some(child.id)
        val linkedBatch = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
        val lockedAt = org.joda.time.DateTime.now()
        Await.result(
          store.subscriptionBatchDemandRepo.updateIfRevisionMatches(
            linkedBatch.copy(items =
              linkedBatch.items.map(
                _.copy(
                  reservation = Some(
                    SubscriptionBatchItemReservation(
                      "cancel-token",
                      lockedAt,
                      lockedAt.plusSeconds(60)
                    )
                  )
                )
              )
            )
          ),
          5.seconds
        ) mustBe defined
        val step = child.steps.head
        val validator = StepValidator(
          id = DatastoreId(IdGenerator.token(32)),
          tenant = parent.tenant,
          token = IdGenerator.token(32),
          step = step.id,
          subscriptionDemand = child.id
        )
        val notification = Notification(
          id = NotificationId(IdGenerator.token(32)),
          tenant = parent.tenant,
          team = Some(parent.team),
          sender = NotificationSender(
            "Requester",
            "requester@example.test",
            Some(parent.from)
          ),
          notificationType = NotificationType.AcceptOnly,
          action = NotificationAction.ApiSubscriptionDemand(
            item.api,
            item.plan,
            parent.team,
            child.id,
            step.id,
            child.keyring,
            None
          )
        )
        Await.result(
          store.stepValidatorRepo.forTenant(parent.tenant).save(validator),
          5.seconds
        ) mustBe true
        Await.result(
          store.notificationRepo.forTenant(parent.tenant).save(notification),
          5.seconds
        ) mustBe true

        Await.result(
          store.cancelBatchChild(
            parent.tenant,
            SubscriptionBatchReference(parent.id, item.id)
          ),
          5.seconds
        ) mustBe Left(
          AppError.EntityConflict(
            "A reserved subscription batch item cannot be canceled"
          )
        )
        Await.result(
          store.subscriptionDemandRepo
            .forTenant(parent.tenant)
            .findById(child.id),
          5.seconds
        ) mustBe Some(child)
        Await.result(
          service
            .releaseReservation(
              parent.tenant,
              SubscriptionBatchReference(parent.id, item.id),
              "cancel-token"
            )
            .value,
          5.seconds
        ) mustBe Right(None)
        Await.result(
          store.cancelBatchChild(
            parent.tenant,
            SubscriptionBatchReference(parent.id, item.id)
          ),
          5.seconds
        ) mustBe Right(())
        val canceled = Await
          .result(
            store.subscriptionDemandRepo
              .forTenant(parent.tenant)
              .findById(child.id),
            5.seconds
          )
          .get
        canceled.state mustBe SubscriptionDemandState.Canceled
        canceled.steps.map(_.state) mustBe Seq(SubscriptionDemandState.Canceled)
        val savedParent = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
        savedParent.items.head.state mustBe SubscriptionBatchItemState.Canceled
        savedParent.items.head.demand mustBe Some(child.id)
        savedParent.items.head.reservation mustBe None
        Await.result(
          store.stepValidatorRepo
            .forTenant(parent.tenant)
            .findById(validator.id),
          5.seconds
        ) mustBe None
        Await.result(
          store.notificationRepo
            .forTenant(parent.tenant)
            .findById(notification.id),
          5.seconds
        ) mustBe None

        Await.result(
          store.cancelBatchChild(
            parent.tenant,
            SubscriptionBatchReference(parent.id, item.id)
          ),
          5.seconds
        ) mustBe Right(())
        Await.result(
          store.subscriptionDemandRepo
            .forTenant(parent.tenant)
            .findById(child.id),
          5.seconds
        ) mustBe Some(canceled)
      } finally {
        demandForCleanup.foreach(id =>
          Await.result(
            store.stepValidatorRepo.deleteByDemand(parent.tenant, id),
            5.seconds
          )
        )
        Await.result(
          store.notificationRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(store, parent)
      }
    }

    "block matching materialized and unmaterialized items when their resource is deleted" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val initial = newBatch()
      val parent = initial.copy(items =
        (1 to 3).map(index =>
          initial.items.head.copy(
            id = SubscriptionBatchItemId(s"delete-$index"),
            plan = UsagePlanId(s"delete-plan-$index")
          )
        )
      )
      var childForCleanup = Option.empty[DemandId]
      try {
        persistEligibilityFixtures(store, parent)
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        val child = Await
          .result(
            service
              .materializeItem(
                parent.tenant,
                parent.id,
                parent.items.head.id
              )
              .value,
            5.seconds
          )
          .toOption
          .get
        childForCleanup = Some(child.id)
        val linkedBatch = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
        val reserved = linkedBatch.copy(items =
          linkedBatch.items.map(item =>
            if (item.id == parent.items.last.id)
              item.copy(reservation =
                Some(
                  SubscriptionBatchItemReservation(
                    "resource-delete-token",
                    org.joda.time.DateTime.now(),
                    org.joda.time.DateTime.now().plusSeconds(60)
                  )
                )
              )
            else item
          )
        )
        Await.result(
          store.subscriptionBatchDemandRepo.updateIfRevisionMatches(reserved),
          5.seconds
        ) mustBe defined
        Await.result(
          store.blockBatchItems(
            Some(parent.tenant),
            apiIds = Set(parent.items.head.api)
          ),
          5.seconds
        ) mustBe Left(
          AppError.EntityConflict(
            "A resource with reserved subscription batch work cannot be deleted"
          )
        )
        Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
          .items
          .map(_.state) mustBe Seq(
          SubscriptionBatchItemState.Waiting,
          SubscriptionBatchItemState.Pending,
          SubscriptionBatchItemState.Pending
        )

        val latest = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
        Await.result(
          store.subscriptionBatchDemandRepo.updateIfRevisionMatches(
            latest.copy(items = latest.items.map(_.copy(reservation = None)))
          ),
          5.seconds
        ) mustBe defined
        Await.result(
          store.blockBatchItems(
            Some(parent.tenant),
            apiIds = Set(parent.items.head.api)
          ),
          5.seconds
        ) mustBe Right(())

        val blocked = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
        blocked.items.map(_.state) mustBe Seq.fill(3)(
          SubscriptionBatchItemState.Blocked
        )
        blocked.items.map(_.error.map(_.code)) mustBe Seq.fill(3)(
          Some("resource_deleted")
        )
        blocked.items.head.demand mustBe Some(child.id)
        val savedChild = Await
          .result(
            store.subscriptionDemandRepo
              .forTenant(parent.tenant)
              .findById(child.id),
            5.seconds
          )
          .get
        savedChild.state mustBe SubscriptionDemandState.Blocked
        savedChild.batch mustBe Some(
          SubscriptionBatchReference(parent.id, parent.items.head.id)
        )
      } finally {
        childForCleanup.foreach(id =>
          Await.result(
            store.stepValidatorRepo.deleteByDemand(parent.tenant, id),
            5.seconds
          )
        )
        Await.result(
          store.notificationRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(store, parent)
      }
    }

    "save child and parent progress together and reject stale callback snapshots" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val parent = newBatch()
      val service = new SubscriptionBatchService(store)
      try {
        persistEligibilityFixtures(store, parent)
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        val child = Await
          .result(
            service
              .materializeItem(
                parent.tenant,
                parent.id,
                parent.items.head.id
              )
              .value,
            5.seconds
          )
          .toOption
          .get
        val updates = Seq(
          child.copy(state = SubscriptionDemandState.InProgress),
          child.copy(customMaxPerDay = Some(42L))
        )
        val results = Await.result(
          Future.sequence(
            updates.map(update => store.saveBatchChildProgress(update, child))
          ),
          10.seconds
        )
        results.count(_.isRight) mustBe 1
        results.count(_.isLeft) mustBe 1
        val savedChild = Await
          .result(
            store.subscriptionDemandRepo
              .forTenant(parent.tenant)
              .findById(child.id),
            5.seconds
          )
          .get
        val refused = savedChild.copy(state = SubscriptionDemandState.Refused)
        val rejection = Notification(
          id = NotificationId(IdGenerator.token(32)),
          tenant = parent.tenant,
          team = Some(parent.team),
          sender = NotificationSender(
            "Requester",
            "requester@example.com",
            Some(parent.from)
          ),
          notificationType = NotificationType.AcceptOnly,
          action = NotificationAction.ApiSubscriptionReject(
            None,
            refused.api,
            refused.plan,
            refused.team
          )
        )
        Await.result(
          store.saveBatchChildProgress(
            refused,
            savedChild,
            notification = Some(rejection)
          ),
          5.seconds
        ) mustBe Right(())
        Await.result(
          store.notificationRepo
            .forTenant(parent.tenant)
            .findById(rejection.id),
          5.seconds
        ) mustBe Some(rejection)
        val savedParent = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
        savedParent.items.head.state mustBe SubscriptionBatchItemState.Refused
        Await
          .result(
            store.saveBatchChildProgress(
              child.copy(state = SubscriptionDemandState.InProgress),
              refused
            ),
            5.seconds
          )
          .isLeft mustBe true
        Await.result(
          store.subscriptionDemandRepo
            .forTenant(parent.tenant)
            .findById(child.id),
          5.seconds
        ) mustBe Some(refused)
      } finally {
        Await.result(
          store.notificationRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(store, parent)
      }
    }

    "reflect persisted waiting, running, blocked and canceled child states" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val initial = newBatch()
      val parent = initial.copy(items =
        (1 to 4).map(index =>
          initial.items.head.copy(
            id = SubscriptionBatchItemId(s"state-$index"),
            plan = UsagePlanId(s"state-$index")
          )
        )
      )
      try {
        persistEligibilityFixtures(store, parent)
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        val children = awaitMaterialization(service, parent.tenant, 4)
          .map(_._2.toOption.get)
        val states = Seq(
          SubscriptionDemandState.Waiting,
          SubscriptionDemandState.InProgress,
          SubscriptionDemandState.Blocked,
          SubscriptionDemandState.Canceled
        )
        for ((child, state) <- children.zip(states)) {
          Await.result(
            store.subscriptionDemandRepo
              .forTenant(parent.tenant)
              .save(
                child.copy(state = state)
              ),
            5.seconds
          ) mustBe true
          Await
            .result(
              service
                .synchronizeItem(
                  parent.tenant,
                  child.batch.get
                )
                .value,
              5.seconds
            )
            .isRight mustBe true
        }
        val saved = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
        saved.items.map(_.state) mustBe Seq(
          SubscriptionBatchItemState.Waiting,
          SubscriptionBatchItemState.InProgress,
          SubscriptionBatchItemState.Blocked,
          SubscriptionBatchItemState.Canceled
        )
        saved.state mustBe SubscriptionBatchDemandState.InProgress
      } finally {
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(store, parent)
      }
    }

    "synchronize independent child results without reopening closed items" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val initial = newBatch()
      val parent = initial.copy(items =
        Seq(
          initial.items.head,
          initial.items.head.copy(
            id = SubscriptionBatchItemId("second"),
            plan = UsagePlanId("second")
          )
        )
      )
      val subscription = ApiSubscription(
        id = ApiSubscriptionId(IdGenerator.token(32)),
        tenant = parent.tenant,
        plan = parent.items(1).plan,
        createdAt = org.joda.time.DateTime.now,
        team = parent.team,
        api = parent.items(1).api,
        by = parent.from,
        customName = None,
        keyring = KeyringId("keyring")
      )
      try {
        persistEligibilityFixtures(store, parent)
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        val children = awaitMaterialization(service, parent.tenant, 2)
          .map(_._2.toOption.get)
        val refused =
          children.head.copy(state = SubscriptionDemandState.Refused)
        val accepted =
          children(1).copy(state = SubscriptionDemandState.Accepted)
        for (child <- Seq(refused, accepted)) {
          Await.result(
            store.subscriptionDemandRepo.forTenant(parent.tenant).save(child),
            5.seconds
          ) mustBe true
        }
        Await
          .result(
            service
              .synchronizeItem(
                parent.tenant,
                accepted.batch.get
              )
              .value,
            5.seconds
          )
          .isLeft mustBe true
        val wrong = subscription.copy(plan = UsagePlanId("wrong"))
        Await.result(
          store.apiSubscriptionRepo.forTenant(parent.tenant).save(wrong),
          5.seconds
        ) mustBe true
        Await
          .result(
            service
              .synchronizeItem(
                parent.tenant,
                accepted.batch.get,
                Some(wrong.id)
              )
              .value,
            5.seconds
          )
          .isLeft mustBe true
        Await.result(
          store.apiSubscriptionRepo.forTenant(parent.tenant).save(subscription),
          5.seconds
        ) mustBe true
        val results = Await.result(
          Future.sequence(
            Seq(
              service.synchronizeItem(parent.tenant, refused.batch.get).value,
              service
                .synchronizeItem(
                  parent.tenant,
                  accepted.batch.get,
                  Some(subscription.id)
                )
                .value
            )
          ),
          10.seconds
        )
        results.forall(_.isRight) mustBe true
        val saved = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
        saved.items.map(_.state) mustBe Seq(
          SubscriptionBatchItemState.Refused,
          SubscriptionBatchItemState.Accepted
        )
        saved.items(1).subscription mustBe Some(subscription.id)
        saved.state mustBe SubscriptionBatchDemandState.PartiallyAccepted
        Await.result(
          service
            .synchronizeItem(
              parent.tenant,
              accepted.batch.get
            )
            .value,
          5.seconds
        ) mustBe Right(saved)

        Await.result(
          store.subscriptionDemandRepo
            .forTenant(parent.tenant)
            .save(
              refused.copy(state = SubscriptionDemandState.InProgress)
            ),
          5.seconds
        ) mustBe true
        Await
          .result(
            service
              .synchronizeItem(
                parent.tenant,
                refused.batch.get
              )
              .value,
            5.seconds
          )
          .isLeft mustBe true
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .findById(parent.id),
          5.seconds
        ) mustBe Some(saved)
      } finally {
        Await.result(
          store.apiSubscriptionRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(store, parent)
      }
    }

    "prepare bounded slices and resume remaining items from storage" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val initial = newBatch()
      val parent = initial.copy(items =
        (1 to 5).map(index =>
          initial.items.head.copy(
            id = SubscriptionBatchItemId(s"item-$index"),
            plan = UsagePlanId(s"plan-$index")
          )
        )
      )
      val foreign = parent.copy(
        id = SubscriptionBatchDemandId(IdGenerator.token(32)),
        tenant = TenantId(s"${parent.tenant.value}-other")
      )
      try {
        persistEligibilityFixtures(store, parent)
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(foreign),
          5.seconds
        )
        val first = awaitMaterialization(service, parent.tenant, 2)
        first.size mustBe 2
        first.forall(_._2.isRight) mustBe true
        first.map(_._1.item) mustBe parent.items.take(2).map(_.id)
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).count(),
          5.seconds
        ) mustBe 2L

        val resumed = new SubscriptionBatchService(store)
        val second = awaitMaterialization(resumed, parent.tenant, 2)
        second.map(_._1.item) mustBe parent.items.slice(2, 4).map(_.id)
        val last = awaitMaterialization(resumed, parent.tenant, 2)
        last.map(_._1.item) mustBe Seq(parent.items.last.id)
        awaitMaterialization(resumed, parent.tenant, 2) mustBe empty
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).count(),
          5.seconds
        ) mustBe 5L
        Await.result(
          store.subscriptionDemandRepo.forTenant(foreign.tenant).count(),
          5.seconds
        ) mustBe 0L
      } finally {
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(foreign.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(store, parent)
      }
    }

    "skip unresolved keyrings and closed items without blocking ready work" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val initial = newBatch()
      val creation = SubscriptionBatchKeyringCreation(
        id = SubscriptionBatchKeyringId("new"),
        customName = "New keyring",
        binding = KeyringOtoroshiBinding.Internal
      )
      val pending = initial.items.head.copy(
        keyringChoice = SubscriptionBatchKeyringChoice.New(creation.id)
      )
      val ready = pending.copy(
        id = SubscriptionBatchItemId("ready"),
        plan = UsagePlanId("ready"),
        keyringChoice =
          SubscriptionBatchKeyringChoice.Existing(KeyringId("existing"))
      )
      val closed = ready.copy(
        id = SubscriptionBatchItemId("closed"),
        plan = UsagePlanId("closed"),
        state = SubscriptionBatchItemState.Canceled
      )
      val parent = initial.copy(
        items = Seq(pending, closed, ready),
        newKeyrings = Seq(creation)
      )
      try {
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        val repo = store.subscriptionBatchDemandRepo
        Await.result(
          repo.findPendingKeyringCreations(parent.tenant, 10),
          5.seconds
        ) mustBe Right(Seq(parent.id -> creation.id))
        Await.result(
          repo.findMaterializableItems(parent.tenant, 1),
          5.seconds
        ) mustBe
          Right(Seq(SubscriptionBatchReference(parent.id, ready.id)))
        val resolved = parent.copy(newKeyrings =
          Seq(
            creation.copy(keyring = Some(KeyringId("resolved")), ready = true)
          )
        )
        Await.result(
          repo.updateIfRevisionMatches(resolved),
          5.seconds
        ) mustBe defined
        Await.result(
          repo.findMaterializableItems(parent.tenant, 10),
          5.seconds
        ) mustBe
          Right(
            Seq(pending, ready).map(item =>
              SubscriptionBatchReference(parent.id, item.id)
            )
          )
        Await.result(
          repo.findPendingKeyringCreations(parent.tenant, 10),
          5.seconds
        ) mustBe Right(Seq.empty)
      } finally {
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
      }
    }

    "reserve one disabled shared internal keyring and mark it ready idempotently" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val initial = newBatch()
      val creation = SubscriptionBatchKeyringCreation(
        SubscriptionBatchKeyringId("shared-internal"),
        "Shared internal keyring",
        KeyringOtoroshiBinding.Internal
      )
      val first = initial.items.head.copy(
        keyringChoice = SubscriptionBatchKeyringChoice.New(creation.id)
      )
      val second = first.copy(
        id = SubscriptionBatchItemId("second"),
        api = ApiId("second-api"),
        plan = UsagePlanId("second-plan")
      )
      val parent = initial.copy(
        items = Seq(first, second),
        newKeyrings = Seq(creation)
      )

      try {
        persistEligibilityFixtures(store, parent)
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        ) mustBe defined
        val tenant = Await
          .result(store.tenantRepo.findById(parent.tenant), 5.seconds)
          .get

        val prepared = Await.result(
          daikokuComponents.apiService.prepareBatchKeyring(
            tenant,
            parent.id,
            creation.id
          ),
          10.seconds
        )
        prepared.isRight mustBe true
        val keyringId = prepared.toOption.get
        val savedBatch = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
        val savedCreation = savedBatch.newKeyrings.find(_.id == creation.id).get
        savedCreation.keyring mustBe Some(keyringId)
        savedCreation.ready mustBe true
        savedCreation.finalized mustBe false

        val shell = Await
          .result(
            store.keyringRepo.forTenant(parent.tenant).findById(keyringId),
            5.seconds
          )
          .get
        shell.enabled mustBe false
        shell.shell.map(_.pendingItems) mustBe Some(
          Seq(first, second).map(item =>
            SubscriptionBatchReference(parent.id, item.id)
          )
        )
        Await.result(
          daikokuComponents.apiService.prepareBatchKeyring(
            tenant,
            parent.id,
            creation.id
          ),
          10.seconds
        ) mustBe Right(keyringId)
        Await.result(
          store.subscriptionBatchDemandRepo
            .findMaterializableItems(parent.tenant, 10),
          5.seconds
        ) mustBe Right(
          Seq(first, second).map(item =>
            SubscriptionBatchReference(parent.id, item.id)
          )
        )
      } finally {
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(store, parent)
      }
    }

    "clear pending shell references when canceling the remaining items of an activated keyring" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val initial = newBatch()
      val keyringId = KeyringId("activated-shared-keyring")
      val creation = SubscriptionBatchKeyringCreation(
        id = SubscriptionBatchKeyringId("activated-shared"),
        customName = "Activated shared keyring",
        binding = KeyringOtoroshiBinding.Internal,
        keyring = Some(keyringId),
        ready = true,
        finalized = true
      )
      val accepted = initial.items.head.copy(
        keyringChoice = SubscriptionBatchKeyringChoice.New(creation.id),
        state = SubscriptionBatchItemState.Accepted,
        subscription = Some(ApiSubscriptionId("accepted-subscription"))
      )
      val pending = accepted.copy(
        id = SubscriptionBatchItemId("pending"),
        plan = UsagePlanId("pending-plan"),
        state = SubscriptionBatchItemState.Pending,
        subscription = None
      )
      val parent = initial.copy(
        items = Seq(accepted, pending),
        newKeyrings = Seq(creation)
      )
      val pendingReference =
        SubscriptionBatchReference(parent.id, pending.id)

      try {
        persistEligibilityFixtures(store, parent)
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        ) mustBe defined

        val shell = Await
          .result(
            store.keyringRepo.forTenant(parent.tenant).findById(keyringId),
            5.seconds
          )
          .get
        Await.result(
          store.keyringRepo
            .forTenant(parent.tenant)
            .save(
              shell.copy(
                enabled = true,
                shell = shell.shell.map(
                  _.copy(
                    pendingItems = Seq(pendingReference),
                    activatedAt = Some(org.joda.time.DateTime.now())
                  )
                )
              )
            ),
          5.seconds
        ) mustBe true

        val canceled = Await.result(
          store.cancelBatch(parent.tenant, parent.id),
          5.seconds
        )
        canceled.toOption.get.items.map(_.state) mustBe Seq(
          SubscriptionBatchItemState.Accepted,
          SubscriptionBatchItemState.Canceled
        )

        val tenant = Await
          .result(store.tenantRepo.findById(parent.tenant), 5.seconds)
          .get
        Await.result(
          daikokuComponents.apiService.prepareBatchKeyring(
            tenant,
            parent.id,
            creation.id
          ),
          10.seconds
        ) mustBe Right(keyringId)

        val reconciled = Await
          .result(
            store.keyringRepo.forTenant(parent.tenant).findById(keyringId),
            5.seconds
          )
          .get
        reconciled.enabled mustBe true
        reconciled.shell.map(_.pendingItems) mustBe Some(Seq.empty)
        reconciled.shell.flatMap(_.activatedAt) mustBe defined
      } finally {
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(store, parent)
      }
    }

    "wait for a shared keyring and prepare only the requested item once it is ready" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val initial = newBatch()
      val creation = SubscriptionBatchKeyringCreation(
        id = SubscriptionBatchKeyringId("shared"),
        customName = "Shared keyring",
        binding = KeyringOtoroshiBinding.Internal
      )
      val first = initial.items.head.copy(
        keyringChoice = SubscriptionBatchKeyringChoice.New(creation.id),
        process = SubscriptionProcess(
          Seq(
            ValidationStep.Form(
              id = "form",
              title = "Motivation",
              formKeysToMetadata = Some(Seq("reason"))
            )
          )
        )
      )
      val parent = initial.copy(
        items = Seq(
          first,
          first.copy(
            id = SubscriptionBatchItemId("second"),
            plan = UsagePlanId("second")
          )
        ),
        newKeyrings = Seq(creation),
        motivation = Some(
          play.api.libs.json.Json
            .obj("reason" -> "access", "private" -> "hidden")
        )
      )
      try {
        persistEligibilityFixtures(store, parent)
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(parent),
          5.seconds
        )
        Await
          .result(
            service
              .materializeItem(
                TenantId("other-tenant"),
                parent.id,
                first.id
              )
              .value,
            5.seconds
          )
          .isLeft mustBe true
        Await
          .result(
            service
              .materializeItem(
                parent.tenant,
                parent.id,
                SubscriptionBatchItemId("missing")
              )
              .value,
            5.seconds
          )
          .isLeft mustBe true
        Await.result(
          service
            .materializeItem(
              parent.tenant,
              parent.id,
              first.id
            )
            .value,
          5.seconds
        ) mustBe Left(
          AppError.EntityConflict("Subscription batch keyring is not ready")
        )
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).count(),
          5.seconds
        ) mustBe 0L
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .findById(parent.id),
          5.seconds
        ) mustBe Some(parent)

        val ready = parent.copy(newKeyrings =
          Seq(
            creation.copy(keyring = Some(KeyringId("resolved")), ready = true)
          )
        )
        Await.result(
          store.subscriptionBatchDemandRepo.updateIfRevisionMatches(ready),
          5.seconds
        ) mustBe defined
        persistEligibilityFixtures(store, ready)
        val child = Await
          .result(
            service
              .materializeItem(
                parent.tenant,
                parent.id,
                first.id
              )
              .value,
            5.seconds
          )
          .toOption
          .get
        child.keyring mustBe Some(KeyringId("resolved"))
        child.keyringCustomName mustBe Some(creation.customName)
        child.customMetadata mustBe Some(
          play.api.libs.json.Json.obj("reason" -> "access")
        )
        child.steps.map(_.state) mustBe Seq(SubscriptionDemandState.Accepted)
        child.state mustBe SubscriptionDemandState.Waiting
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).count(),
          5.seconds
        ) mustBe 1L
        val reloaded = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(parent.tenant)
              .findById(parent.id),
            5.seconds
          )
          .get
        reloaded.items.head.demand mustBe Some(child.id)
        reloaded.items(1) mustBe parent.items(1)
      } finally {
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(),
          5.seconds
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(parent.tenant)
            .deleteAll(),
          5.seconds
        )
        deleteEligibilityFixtures(store, parent)
      }
    }
  }

  "SubscriptionBatchDemandRepo" should {

    "keep the first submission and its progress when the request is repeated" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val repo = daikokuComponents.env.dataStore.subscriptionBatchDemandRepo
      val original = newBatch()

      try {
        Await.result(repo.insertIfAbsent(original), 5.seconds) mustBe Some(
          original
        )
        val progressed = original.copy(items =
          original.items.map(
            _.copy(
              state = SubscriptionBatchItemState.Waiting,
              demand = Some(DemandId("child"))
            )
          )
        )
        val saved =
          Await.result(repo.updateIfRevisionMatches(progressed), 5.seconds).get
        saved.revision mustBe 1L

        val repeated =
          original.copy(id = SubscriptionBatchDemandId(IdGenerator.token(32)))
        Await.result(repo.insertIfAbsent(repeated), 5.seconds) mustBe None
        Await.result(
          repo.findBySubmission(
            original.tenant,
            original.team,
            original.from,
            original.idempotencyKey
          ),
          5.seconds
        ) mustBe Some(saved)
        Await.result(
          repo.forTenant(original.tenant).count(),
          5.seconds
        ) mustBe 1L
      } finally {
        Await.result(repo.forTenant(original.tenant).deleteAll(), 5.seconds)
      }
    }

    "SubscriptionDemandRepo batch children" should {

      "create one child per batch item under concurrent attempts" in {
        Await.result(waitForDaikokuSetup(), 10.seconds)
        val repo = daikokuComponents.env.dataStore.subscriptionDemandRepo
        val parent = newBatch()
        val reference =
          SubscriptionBatchReference(parent.id, parent.items.head.id)
        val child = SubscriptionDemand(
          id = DemandId(IdGenerator.token(32)),
          tenant = parent.tenant,
          api = parent.items.head.api,
          plan = parent.items.head.plan,
          steps = Seq.empty,
          team = parent.team,
          from = parent.from
        )

        try {
          val results = Await.result(
            Future.sequence((1 to 5).map { _ =>
              repo.insertBatchChildIfAbsent(
                child.copy(id = DemandId(IdGenerator.token(32))),
                reference
              )
            }),
            10.seconds
          )

          results.count(_.isDefined) mustBe 1
          val saved = results.flatten.head
          saved.batch mustBe Some(reference)
          Await.result(
            repo.findByBatchItem(parent.tenant, reference),
            5.seconds
          ) mustBe Some(saved)

          val progressed =
            saved.copy(state = SubscriptionDemandState.InProgress)
          Await.result(
            repo.forTenant(parent.tenant).save(progressed),
            5.seconds
          ) mustBe true
          Await.result(
            repo.insertBatchChildIfAbsent(child, reference),
            5.seconds
          ) mustBe None
          Await.result(
            repo.findByBatchItem(parent.tenant, reference),
            5.seconds
          ) mustBe Some(progressed)

          val otherItem =
            reference.copy(item = SubscriptionBatchItemId("other"))
          Await.result(
            repo.insertBatchChildIfAbsent(
              child.copy(id = DemandId(IdGenerator.token(32))),
              otherItem
            ),
            5.seconds
          ) mustBe defined
          Await.result(
            repo.forTenant(parent.tenant).count(),
            5.seconds
          ) mustBe 2L
          Await.result(
            repo.findByBatchItem(TenantId("other-tenant"), reference),
            5.seconds
          ) mustBe None
        } finally {
          Await.result(repo.forTenant(parent.tenant).deleteAll(), 5.seconds)
        }
      }

      "allow the same batch item reference in another tenant and standalone demands" in {
        Await.result(waitForDaikokuSetup(), 10.seconds)
        val repo = daikokuComponents.env.dataStore.subscriptionDemandRepo
        val parent = newBatch()
        val otherTenant = TenantId(s"${parent.tenant.value}-other")
        val reference =
          SubscriptionBatchReference(parent.id, parent.items.head.id)
        val child = SubscriptionDemand(
          id = DemandId(IdGenerator.token(32)),
          tenant = parent.tenant,
          api = parent.items.head.api,
          plan = parent.items.head.plan,
          steps = Seq.empty,
          team = parent.team,
          from = parent.from
        )

        try {
          Await.result(
            repo.insertBatchChildIfAbsent(child, reference),
            5.seconds
          ) mustBe defined
          val other = child.copy(
            id = DemandId(IdGenerator.token(32)),
            tenant = otherTenant
          )
          Await.result(
            repo.insertBatchChildIfAbsent(other, reference),
            5.seconds
          ) mustBe
            Some(other.copy(batch = Some(reference)))
          for (_ <- 1 to 2) {
            Await.result(
              repo
                .forTenant(parent.tenant)
                .save(
                  child.copy(id = DemandId(IdGenerator.token(32)))
                ),
              5.seconds
            ) mustBe true
          }
          Await.result(
            repo.forTenant(parent.tenant).count(),
            5.seconds
          ) mustBe 3L
        } finally {
          Await.result(repo.forTenant(parent.tenant).deleteAll(), 5.seconds)
          Await.result(repo.forTenant(otherTenant).deleteAll(), 5.seconds)
        }
      }
    }

    "isolate the submission key by tenant, consumer team and requester" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val repo = daikokuComponents.env.dataStore.subscriptionBatchDemandRepo
      val original = newBatch()
      val batches = Seq(
        original,
        original.copy(
          id = SubscriptionBatchDemandId(IdGenerator.token(32)),
          tenant = TenantId(s"${original.tenant.value}-other")
        ),
        original.copy(
          id = SubscriptionBatchDemandId(IdGenerator.token(32)),
          team = TeamId("other-consumer")
        ),
        original.copy(
          id = SubscriptionBatchDemandId(IdGenerator.token(32)),
          from = UserId("other-requester")
        )
      )

      try {
        batches.foreach { batch =>
          Await.result(repo.insertIfAbsent(batch), 5.seconds) mustBe Some(batch)
          Await.result(
            repo.findBySubmission(
              batch.tenant,
              batch.team,
              batch.from,
              batch.idempotencyKey
            ),
            5.seconds
          ) mustBe Some(batch)
        }
        Await.result(
          repo.forTenant(batches(1).tenant).findById(original.id),
          5.seconds
        ) mustBe None
      } finally {
        batches.map(_.tenant).distinct.foreach { tenant =>
          Await.result(repo.forTenant(tenant).deleteAll(), 5.seconds)
        }
      }
    }

    "insert only one parent when identical submissions arrive concurrently" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val repo = daikokuComponents.env.dataStore.subscriptionBatchDemandRepo
      val original = newBatch()

      try {
        val attempts = (1 to 5).map { _ =>
          repo.insertIfAbsent(
            original.copy(
              id = SubscriptionBatchDemandId(IdGenerator.token(32))
            )
          )
        }
        val results = Await.result(Future.sequence(attempts), 10.seconds)

        results.count(_.isDefined) mustBe 1
        Await.result(
          repo.findBySubmission(
            original.tenant,
            original.team,
            original.from,
            original.idempotencyKey
          ),
          5.seconds
        ) mustBe results.flatten.headOption
        Await.result(
          repo.forTenant(original.tenant).count(),
          5.seconds
        ) mustBe 1L
      } finally {
        Await.result(repo.forTenant(original.tenant).deleteAll(), 5.seconds)
      }
    }

    "reject stale updates and allow the losing caller to merge after reloading" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val repo = daikokuComponents.env.dataStore.subscriptionBatchDemandRepo
      val initial = newBatch()
      val original = initial.copy(items =
        initial.items :+ initial.items.head.copy(
          id = SubscriptionBatchItemId("second"),
          plan = UsagePlanId("second-plan")
        )
      )

      try {
        Await.result(repo.insertIfAbsent(original), 5.seconds)
        val changes = original.items.map { target =>
          original.copy(items = original.items.map { item =>
            if (item.id == target.id)
              item.copy(state = SubscriptionBatchItemState.Waiting)
            else item
          })
        }
        val results = Await.result(
          Future.sequence(changes.map(repo.updateIfRevisionMatches)),
          10.seconds
        )
        results.count(_.isDefined) mustBe 1
        val saved = results.flatten.head
        saved.revision mustBe 1L
        saved.items.count(
          _.state == SubscriptionBatchItemState.Waiting
        ) mustBe 1

        val reloaded = Await
          .result(
            repo.forTenant(original.tenant).findById(original.id),
            5.seconds
          )
          .get
        val merged = reloaded.copy(items =
          reloaded.items.map(
            _.copy(state = SubscriptionBatchItemState.Waiting)
          )
        )
        val updated =
          Await.result(repo.updateIfRevisionMatches(merged), 5.seconds).get
        updated.revision mustBe 2L
        updated.items.forall(
          _.state == SubscriptionBatchItemState.Waiting
        ) mustBe true
        Await.result(
          repo.updateIfRevisionMatches(original),
          5.seconds
        ) mustBe None
        Await.result(
          repo.forTenant(original.tenant).findById(original.id),
          5.seconds
        ) mustBe Some(updated)
      } finally {
        Await.result(repo.forTenant(original.tenant).deleteAll(), 5.seconds)
      }
    }

    "never create a missing batch or change its submission scope through an update" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val repo = daikokuComponents.env.dataStore.subscriptionBatchDemandRepo
      val original = newBatch()

      try {
        Await.result(
          repo.updateIfRevisionMatches(original),
          5.seconds
        ) mustBe None
        Await.result(repo.insertIfAbsent(original), 5.seconds)
        val invalidChanges = Seq(
          original.copy(tenant = TenantId("other-tenant")),
          original.copy(team = TeamId("other-team")),
          original.copy(from = UserId("other-user")),
          original.copy(idempotencyKey = "other-submission")
        )
        invalidChanges.foreach { changed =>
          Await.result(
            repo.updateIfRevisionMatches(changed),
            5.seconds
          ) mustBe None
        }
        Await.result(
          repo.forTenant(original.tenant).findById(original.id),
          5.seconds
        ) mustBe Some(original)
      } finally {
        Await.result(repo.forTenant(original.tenant).deleteAll(), 5.seconds)
      }
    }
  }
}
