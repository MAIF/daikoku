package fr.maif.daikoku.controllers

import fr.maif.daikoku.domain.*
import fr.maif.daikoku.login.AuthProvider
import fr.maif.daikoku.services.SubscriptionBatchService
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import fr.maif.daikoku.utils.IdGenerator
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec

import scala.concurrent.{Await, Future}
import scala.concurrent.duration.*

class SubscriptionBatchStorageSpec
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience {

  private def newBatch() = {
    val token = IdGenerator.token(32)
    SubscriptionBatchDemand(
      id = SubscriptionBatchDemandId(token),
      tenant = TenantId(s"batch-storage-$token"),
      team = TeamId("consumer"),
      from = UserId("requester"),
      idempotencyKey = "submission",
      items = Seq(SubscriptionBatchItem(
        id = SubscriptionBatchItemId("item"),
        api = ApiId("api"),
        plan = UsagePlanId("plan"),
        process = SubscriptionProcess(),
        keyringChoice = SubscriptionBatchKeyringChoice.Existing(KeyringId("keyring"))
      ))
    )
  }

  private def newChild(batch: SubscriptionBatchDemand, item: SubscriptionBatchItem) =
    SubscriptionDemand(
      id = DemandId(IdGenerator.token(32)),
      tenant = batch.tenant,
      api = item.api,
      plan = item.plan,
      steps = Seq.empty,
      team = batch.team,
      from = batch.from
    )

  "Atomic batch child materialization" should {
    "link concurrent children without losing sibling updates or replacing existing progress" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val initial = newBatch()
      val parent = initial.copy(items = initial.items :+ initial.items.head.copy(
        id = SubscriptionBatchItemId("second"),
        plan = UsagePlanId("second-plan")
      ))
      try {
        Await.result(store.subscriptionBatchDemandRepo.insertIfAbsent(parent), 5.seconds)
        val attempts = for {
          item <- parent.items
          _ <- 1 to 3
        } yield service.materializeItem(parent.tenant, parent.id, item.id).value
        val results = Await.result(Future.sequence(attempts), 10.seconds)
        results.forall(_.isRight) mustBe true
        results.flatMap(_.toOption.map(_.id)).distinct.size mustBe 2
        val reloaded = Await.result(
          store.subscriptionBatchDemandRepo.forTenant(parent.tenant).findById(parent.id),
          5.seconds
        ).get
        reloaded.revision mustBe 2L
        reloaded.items.forall(item =>
          item.demand.isDefined && item.state == SubscriptionBatchItemState.Waiting
        ) mustBe true
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).count(), 5.seconds) mustBe 2L

        val first = results.head.toOption.get
        first.keyring mustBe Some(KeyringId("keyring"))
        val progressed = first.copy(state = SubscriptionDemandState.InProgress)
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).save(progressed), 5.seconds) mustBe true
        Await.result(service.materializeItem(
          parent.tenant, parent.id, parent.items.head.id
        ).value, 5.seconds) mustBe Right(progressed)
      } finally {
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
        Await.result(store.subscriptionBatchDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
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
        Await.result(store.materializeBatchChild(child, reference), 5.seconds).isLeft mustBe true
        Await.result(store.subscriptionBatchDemandRepo.insertIfAbsent(parent), 5.seconds)
        val invalidChildren = Seq(
          child.copy(team = TeamId("other")),
          child.copy(from = UserId("other")),
          child.copy(api = ApiId("other")),
          child.copy(plan = UsagePlanId("other")),
          child.copy(batch = Some(reference.copy(item = SubscriptionBatchItemId("other"))))
        )
        invalidChildren.foreach { invalid =>
          Await.result(store.materializeBatchChild(invalid, reference), 5.seconds).isLeft mustBe true
        }
        Await.result(store.materializeBatchChild(
          child, reference.copy(item = SubscriptionBatchItemId("missing"))
        ), 5.seconds).isLeft mustBe true
        val canceled = parent.copy(items = Seq(item.copy(state = SubscriptionBatchItemState.Canceled)))
        Await.result(store.subscriptionBatchDemandRepo.updateIfRevisionMatches(canceled), 5.seconds) mustBe defined
        Await.result(store.materializeBatchChild(child, reference), 5.seconds).isLeft mustBe true
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).count(), 5.seconds) mustBe 0L
      } finally {
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
        Await.result(store.subscriptionBatchDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
      }
    }

    "surface an inconsistent parent link rather than replacing or executing its child" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val parent = newBatch()
      val child = newChild(parent, parent.items.head)
      val reference = SubscriptionBatchReference(parent.id, parent.items.head.id)
      try {
        Await.result(store.subscriptionBatchDemandRepo.insertIfAbsent(parent), 5.seconds)
        Await.result(store.subscriptionDemandRepo.insertBatchChildIfAbsent(child, reference), 5.seconds)
        intercept[IllegalStateException] {
          Await.result(store.materializeBatchChild(child, reference), 5.seconds)
        }
        Await.result(
          store.subscriptionBatchDemandRepo.forTenant(parent.tenant).findById(parent.id),
          5.seconds
        ) mustBe Some(parent)
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).count(), 5.seconds) mustBe 1L
      } finally {
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
        Await.result(store.subscriptionBatchDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
      }
    }

    "roll back the inserted child when updating its parent fails" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val parent = newBatch()
      val repo = store.subscriptionBatchDemandRepo.forTenant(parent.tenant)
      val physicalId = SubscriptionBatchDemandId(IdGenerator.token(32))
      val reference = SubscriptionBatchReference(physicalId, parent.items.head.id)
      try {
        Await.result(store.subscriptionBatchDemandRepo.insertIfAbsent(parent), 5.seconds)
        // Simulate a corrupt record whose physical key differs from its JSON identifier.
        Await.result(repo.execute(
          s"UPDATE ${repo.tableName} SET _id = $$1 WHERE _id = $$2 AND content->>'_tenant' = $$3",
          Seq(physicalId.value, parent.id.value, parent.tenant.value)
        ), 5.seconds) mustBe 1L
        intercept[IllegalStateException] {
          Await.result(store.materializeBatchChild(
            newChild(parent, parent.items.head), reference
          ), 5.seconds)
        }
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).count(), 5.seconds) mustBe 0L
        Await.result(repo.findById(physicalId), 5.seconds) mustBe Some(parent)
      } finally {
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
        Await.result(repo.deleteAll(), 5.seconds)
      }
    }
  }

  "SubscriptionBatchService" should {
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
        Await.result(store.subscriptionBatchDemandRepo.insertIfAbsent(parent), 5.seconds)
        Await.result(store.subscriptionBatchDemandRepo.insertIfAbsent(foreign), 5.seconds)
        Await.result(daikokuComponents.tenantService.deleteTenant(tenant).value, 10.seconds) mustBe Right(tenant)
        Await.result(store.subscriptionBatchDemandRepo.forTenant(parent.tenant).count(), 5.seconds) mustBe 0L
        Await.result(
          store.subscriptionBatchDemandRepo.forTenant(foreign.tenant).findById(foreign.id), 5.seconds
        ) mustBe Some(foreign)
      } finally {
        Await.result(store.subscriptionBatchDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
        Await.result(store.subscriptionBatchDemandRepo.forTenant(foreign.tenant).deleteAll(), 5.seconds)
        Await.result(store.tenantRepo.deleteById(tenant.id), 5.seconds)
      }
    }

    "persist and export a 300-plan selection while creating only a requested slice" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val env = daikokuComponents.env
      val store = env.dataStore
      val initial = newBatch()
      val parent = initial.copy(items = (1 to 300).map(index =>
        initial.items.head.copy(
          id = SubscriptionBatchItemId(s"large-$index"),
          plan = UsagePlanId(s"large-$index")
        )
      ))
      try {
        Await.result(store.subscriptionBatchDemandRepo.insertIfAbsent(parent), 5.seconds)
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).count(), 5.seconds) mustBe 0L
        val results = Await.result(
          daikokuComponents.subscriptionBatchService.materializePendingItems(parent.tenant, 7), 10.seconds
        )
        results.size mustBe 7
        results.forall(_._2.isRight) mustBe true
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).count(), 5.seconds) mustBe 7L
        val saved = Await.result(
          store.subscriptionBatchDemandRepo.forTenant(parent.tenant).findById(parent.id), 5.seconds
        ).get
        saved.items.size mustBe 300
        saved.items.count(_.demand.isDefined) mustBe 7
        saved.items.count(_.state == SubscriptionBatchItemState.Pending) mustBe 293
        val exported = Await.result(
          store.exportAsStream(pretty = false, exportAuditTrail = false)(
            using ec, env.defaultMaterializer, env
          ).map(bytes => play.api.libs.json.Json.parse(bytes.utf8String))
            .filter(record =>
              (record \ "type").as[String] == "subscription_batch_demands" &&
                (record \ "payload" \ "_tenant").asOpt[String].contains(parent.tenant.value)
            )
            .runWith(org.apache.pekko.stream.scaladsl.Sink.seq)(using env.defaultMaterializer),
          10.seconds
        )
        exported.size mustBe 1
        val restored = json.SubscriptionBatchDemandFormat.reads((exported.head \ "payload").get).get
        restored mustBe saved
      } finally {
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
        Await.result(store.subscriptionBatchDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
      }
    }

    "persist expired-work errors without replaying work or changing sibling outcomes" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val initial = newBatch()
      val expired = SubscriptionBatchItemReservation(
        "old-worker", new org.joda.time.DateTime(1000L), new org.joda.time.DateTime(2000L)
      )
      val active = SubscriptionBatchItemReservation(
        "active-worker", org.joda.time.DateTime.now, org.joda.time.DateTime.now.plusMinutes(5)
      )
      val parent = initial.copy(items = Seq(
        initial.items.head.copy(reservation = Some(expired)),
        initial.items.head.copy(
          id = SubscriptionBatchItemId("active"), plan = UsagePlanId("active"), reservation = Some(active)
        ),
        initial.items.head.copy(
          id = SubscriptionBatchItemId("ready"), plan = UsagePlanId("ready")
        ),
        initial.items.head.copy(
          id = SubscriptionBatchItemId("closed"), plan = UsagePlanId("closed"),
          state = SubscriptionBatchItemState.Canceled, reservation = Some(expired)
        )
      ))
      val reference = SubscriptionBatchReference(parent.id, parent.items.head.id)
      try {
        Await.result(store.subscriptionBatchDemandRepo.insertIfAbsent(parent), 5.seconds)
        val results = Await.result(Future.sequence((1 to 3).map { _ =>
          service.reportExpiredReservation(parent.tenant, reference).value
        }), 10.seconds)
        results.forall(_.isRight) mustBe true
        val saved = results.head.toOption.get
        results.forall(_ == Right(saved)) mustBe true
        saved.revision mustBe 1L
        saved.items.head.error.map(_.code) mustBe Some("reservation_expired")
        saved.items.head.reservation mustBe Some(expired)
        saved.items.head.state mustBe parent.items.head.state
        saved.items.tail mustBe parent.items.tail
        Await.result(service.reserveItem(parent.tenant, reference, 1.minute).value, 5.seconds)
          .isLeft mustBe true
        for (item <- parent.items.tail) {
          Await.result(service.reportExpiredReservation(
            parent.tenant, reference.copy(item = item.id)
          ).value, 5.seconds).isLeft mustBe true
        }
        Await.result(store.subscriptionBatchDemandRepo.findMaterializableItems(
          parent.tenant, 10
        ), 5.seconds) mustBe Seq(reference.copy(item = parent.items(2).id))
        val prepared = Await.result(service.materializePendingItems(parent.tenant, 10), 10.seconds)
        prepared.map(_._1) mustBe Seq(reference.copy(item = parent.items(2).id))
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).count(), 5.seconds) mustBe 1L
      } finally {
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
        Await.result(store.subscriptionBatchDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
      }
    }

    "renew and release only the active owner's reservation and reject old tokens after reacquisition" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val parent = newBatch()
      val reference = SubscriptionBatchReference(parent.id, parent.items.head.id)
      try {
        Await.result(store.subscriptionBatchDemandRepo.insertIfAbsent(parent), 5.seconds)
        val reservation = Await.result(service.reserveItem(
          parent.tenant, reference, 5.minutes
        ).value, 5.seconds).toOption.get
        Await.result(service.releaseReservation(
          parent.tenant, reference, "wrong"
        ).value, 5.seconds).isLeft mustBe true
        Await.result(service.renewReservation(
          parent.tenant, reference, "wrong", reservation.expiresAt.plusMinutes(1)
        ).value, 5.seconds).isLeft mustBe true
        Await.result(service.renewReservation(
          parent.tenant, reference, reservation.token, reservation.expiresAt
        ).value, 5.seconds).isLeft mustBe true
        val extended = reservation.copy(expiresAt = reservation.expiresAt.plusMinutes(1))
        Await.result(service.renewReservation(
          parent.tenant, reference, reservation.token, extended.expiresAt
        ).value, 5.seconds) mustBe Right(Some(extended))
        Await.result(service.releaseReservation(
          parent.tenant, reference, reservation.token
        ).value, 5.seconds) mustBe Right(None)
        val replacement = Await.result(service.reserveItem(
          parent.tenant, reference, 5.minutes
        ).value, 5.seconds).toOption.get
        replacement.token must not be reservation.token
        Await.result(service.releaseReservation(
          parent.tenant, reference, reservation.token
        ).value, 5.seconds).isLeft mustBe true
        Await.result(service.renewReservation(
          parent.tenant, reference, reservation.token, replacement.expiresAt.plusMinutes(1)
        ).value, 5.seconds).isLeft mustBe true
        val saved = Await.result(
          store.subscriptionBatchDemandRepo.forTenant(parent.tenant).findById(parent.id), 5.seconds
        ).get
        saved.items.head.reservation mustBe Some(replacement)
        saved.revision mustBe 4L
      } finally {
        Await.result(store.subscriptionBatchDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
      }
    }

    "preserve expired reservations even when their former owner requests renewal or release" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val initial = newBatch()
      val expired = SubscriptionBatchItemReservation(
        "old-token", new org.joda.time.DateTime(1000L), new org.joda.time.DateTime(2000L)
      )
      val parent = initial.copy(items = Seq(initial.items.head.copy(reservation = Some(expired))))
      val reference = SubscriptionBatchReference(parent.id, parent.items.head.id)
      try {
        Await.result(store.subscriptionBatchDemandRepo.insertIfAbsent(parent), 5.seconds)
        Await.result(service.releaseReservation(
          parent.tenant, reference, expired.token
        ).value, 5.seconds).isLeft mustBe true
        Await.result(service.renewReservation(
          parent.tenant, reference, expired.token, org.joda.time.DateTime.now.plusMinutes(1)
        ).value, 5.seconds).isLeft mustBe true
        Await.result(
          store.subscriptionBatchDemandRepo.forTenant(parent.tenant).findById(parent.id), 5.seconds
        ) mustBe Some(parent)
      } finally {
        Await.result(store.subscriptionBatchDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
      }
    }

    "reserve an item for only one worker while preserving sibling reservations" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val initial = newBatch()
      val parent = initial.copy(items = Seq(
        initial.items.head,
        initial.items.head.copy(id = SubscriptionBatchItemId("second"), plan = UsagePlanId("second"))
      ))
      val reference = SubscriptionBatchReference(parent.id, parent.items.head.id)
      try {
        Await.result(store.subscriptionBatchDemandRepo.insertIfAbsent(parent), 5.seconds)
        Await.result(service.reserveItem(parent.tenant, reference, 0.seconds).value, 5.seconds)
          .isLeft mustBe true
        val results = Await.result(Future.sequence((1 to 5).map { _ =>
          service.reserveItem(parent.tenant, reference, 30.seconds).value
        }), 10.seconds)
        results.count(_.isRight) mustBe 1
        results.count(_.isLeft) mustBe 4
        val winner = results.flatMap(_.toOption).head
        val other = Await.result(service.reserveItem(
          parent.tenant, reference.copy(item = parent.items(1).id), 30.seconds
        ).value, 5.seconds).toOption.get
        other.token must not be winner.token
        val saved = Await.result(
          store.subscriptionBatchDemandRepo.forTenant(parent.tenant).findById(parent.id), 5.seconds
        ).get
        saved.revision mustBe 2L
        saved.items.map(_.reservation) mustBe Seq(Some(winner), Some(other))
        saved.items.map(_.state) mustBe parent.items.map(_.state)
        Await.result(service.reserveItem(
          TenantId("wrong"), reference, 30.seconds
        ).value, 5.seconds).isLeft mustBe true
        Await.result(service.reserveItem(
          parent.tenant, reference.copy(item = SubscriptionBatchItemId("missing")), 30.seconds
        ).value, 5.seconds).isLeft mustBe true
      } finally {
        Await.result(store.subscriptionBatchDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
      }
    }

    "never take over an expired reservation or reserve a closed item" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val initial = newBatch()
      val expired = SubscriptionBatchItemReservation(
        "previous-worker", new org.joda.time.DateTime(1000L), new org.joda.time.DateTime(2000L)
      )
      val parent = initial.copy(items = Seq(
        initial.items.head.copy(reservation = Some(expired)),
        initial.items.head.copy(
          id = SubscriptionBatchItemId("closed"),
          plan = UsagePlanId("closed"),
          state = SubscriptionBatchItemState.Canceled
        )
      ))
      try {
        Await.result(store.subscriptionBatchDemandRepo.insertIfAbsent(parent), 5.seconds)
        parent.items.foreach { item =>
          Await.result(service.reserveItem(
            parent.tenant, SubscriptionBatchReference(parent.id, item.id), 30.seconds
          ).value, 5.seconds).isLeft mustBe true
        }
        Await.result(
          store.subscriptionBatchDemandRepo.forTenant(parent.tenant).findById(parent.id), 5.seconds
        ) mustBe Some(parent)
      } finally {
        Await.result(store.subscriptionBatchDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
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
        sender = NotificationSender("Requester", "requester@example.com", Some(parent.from)),
        notificationType = NotificationType.AcceptOnly,
        action = NotificationAction.ApiSubscriptionAccept(
          parent.items.head.api, parent.items.head.plan, parent.team
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
        Await.result(store.subscriptionBatchDemandRepo.insertIfAbsent(parent), 5.seconds)
        val child = Await.result(service.materializeItem(
          parent.tenant, parent.id, parent.items.head.id
        ).value, 5.seconds).toOption.get
        val accepted = child.copy(state = SubscriptionDemandState.Accepted)
        Await.result(store.saveBatchChildProgress(
          accepted, child, Some(subscription.id), Some(notification)
        ), 5.seconds) mustBe Left(AppError.SubscriptionNotFound)
        Await.result(store.apiSubscriptionRepo.forTenant(parent.tenant).save(subscription), 5.seconds) mustBe true
        intercept[IllegalArgumentException] {
          Await.result(store.saveBatchChildProgress(
            accepted, child, Some(subscription.id),
            Some(notification.copy(tenant = TenantId("wrong")))
          ), 5.seconds)
        }
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).findById(child.id), 5.seconds
        ) mustBe Some(child)
        val unchanged = Await.result(
          store.subscriptionBatchDemandRepo.forTenant(parent.tenant).findById(parent.id), 5.seconds
        ).get
        unchanged.items.head.state mustBe SubscriptionBatchItemState.Waiting
        Await.result(store.saveBatchChildProgress(
          accepted, child, Some(subscription.id), Some(notification)
        ), 5.seconds) mustBe Right(())
        val saved = Await.result(
          store.subscriptionBatchDemandRepo.forTenant(parent.tenant).findById(parent.id), 5.seconds
        ).get
        saved.items.head.subscription mustBe Some(subscription.id)
        saved.state mustBe SubscriptionBatchDemandState.Accepted
        Await.result(
          store.notificationRepo.forTenant(parent.tenant).findById(notification.id), 5.seconds
        ) mustBe Some(notification)
        Await.result(store.saveBatchChildProgress(
          accepted, child, Some(subscription.id), Some(notification)
        ), 5.seconds).isLeft mustBe true
        Await.result(store.notificationRepo.forTenant(parent.tenant).count(), 5.seconds) mustBe 1L
      } finally {
        Await.result(store.notificationRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
        Await.result(store.apiSubscriptionRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
        Await.result(store.subscriptionBatchDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
      }
    }

    "save child and parent progress together and reject stale callback snapshots" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val parent = newBatch()
      val service = new SubscriptionBatchService(store)
      try {
        Await.result(store.subscriptionBatchDemandRepo.insertIfAbsent(parent), 5.seconds)
        val child = Await.result(service.materializeItem(
          parent.tenant, parent.id, parent.items.head.id
        ).value, 5.seconds).toOption.get
        val updates = Seq(
          child.copy(state = SubscriptionDemandState.InProgress),
          child.copy(customMaxPerDay = Some(42L))
        )
        val results = Await.result(Future.sequence(updates.map(
          update => store.saveBatchChildProgress(update, child)
        )), 10.seconds)
        results.count(_.isRight) mustBe 1
        results.count(_.isLeft) mustBe 1
        val savedChild = Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).findById(child.id), 5.seconds
        ).get
        val refused = savedChild.copy(state = SubscriptionDemandState.Refused)
        val rejection = Notification(
          id = NotificationId(IdGenerator.token(32)),
          tenant = parent.tenant,
          team = Some(parent.team),
          sender = NotificationSender("Requester", "requester@example.com", Some(parent.from)),
          notificationType = NotificationType.AcceptOnly,
          action = NotificationAction.ApiSubscriptionReject(
            None, refused.api, refused.plan, refused.team
          )
        )
        Await.result(store.saveBatchChildProgress(
          refused, savedChild, notification = Some(rejection)
        ), 5.seconds) mustBe Right(())
        Await.result(
          store.notificationRepo.forTenant(parent.tenant).findById(rejection.id), 5.seconds
        ) mustBe Some(rejection)
        val savedParent = Await.result(
          store.subscriptionBatchDemandRepo.forTenant(parent.tenant).findById(parent.id), 5.seconds
        ).get
        savedParent.items.head.state mustBe SubscriptionBatchItemState.Refused
        Await.result(store.saveBatchChildProgress(
          child.copy(state = SubscriptionDemandState.InProgress), refused
        ), 5.seconds).isLeft mustBe true
        Await.result(
          store.subscriptionDemandRepo.forTenant(parent.tenant).findById(child.id), 5.seconds
        ) mustBe Some(refused)
      } finally {
        Await.result(store.notificationRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
        Await.result(store.subscriptionBatchDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
      }
    }

    "reflect persisted waiting, running, blocked and canceled child states" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val initial = newBatch()
      val parent = initial.copy(items = (1 to 4).map(index =>
        initial.items.head.copy(
          id = SubscriptionBatchItemId(s"state-$index"),
          plan = UsagePlanId(s"state-$index")
        )
      ))
      try {
        Await.result(store.subscriptionBatchDemandRepo.insertIfAbsent(parent), 5.seconds)
        val children = Await.result(service.materializePendingItems(parent.tenant, 4), 10.seconds)
          .map(_._2.toOption.get)
        val states = Seq(
          SubscriptionDemandState.Waiting, SubscriptionDemandState.InProgress,
          SubscriptionDemandState.Blocked, SubscriptionDemandState.Canceled
        )
        for ((child, state) <- children.zip(states)) {
          Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).save(
            child.copy(state = state)
          ), 5.seconds) mustBe true
          Await.result(service.synchronizeItem(
            parent.tenant, child.batch.get
          ).value, 5.seconds).isRight mustBe true
        }
        val saved = Await.result(
          store.subscriptionBatchDemandRepo.forTenant(parent.tenant).findById(parent.id), 5.seconds
        ).get
        saved.items.map(_.state) mustBe Seq(
          SubscriptionBatchItemState.Waiting, SubscriptionBatchItemState.InProgress,
          SubscriptionBatchItemState.Blocked, SubscriptionBatchItemState.Canceled
        )
        saved.state mustBe SubscriptionBatchDemandState.InProgress
      } finally {
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
        Await.result(store.subscriptionBatchDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
      }
    }

    "synchronize independent child results without reopening closed items" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val initial = newBatch()
      val parent = initial.copy(items = Seq(
        initial.items.head,
        initial.items.head.copy(id = SubscriptionBatchItemId("second"), plan = UsagePlanId("second"))
      ))
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
        Await.result(store.subscriptionBatchDemandRepo.insertIfAbsent(parent), 5.seconds)
        val children = Await.result(service.materializePendingItems(parent.tenant, 2), 10.seconds)
          .map(_._2.toOption.get)
        val refused = children.head.copy(state = SubscriptionDemandState.Refused)
        val accepted = children(1).copy(state = SubscriptionDemandState.Accepted)
        for (child <- Seq(refused, accepted)) {
          Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).save(child), 5.seconds) mustBe true
        }
        Await.result(service.synchronizeItem(
          parent.tenant, accepted.batch.get
        ).value, 5.seconds).isLeft mustBe true
        val wrong = subscription.copy(plan = UsagePlanId("wrong"))
        Await.result(store.apiSubscriptionRepo.forTenant(parent.tenant).save(wrong), 5.seconds) mustBe true
        Await.result(service.synchronizeItem(
          parent.tenant, accepted.batch.get, Some(wrong.id)
        ).value, 5.seconds).isLeft mustBe true
        Await.result(store.apiSubscriptionRepo.forTenant(parent.tenant).save(subscription), 5.seconds) mustBe true
        val results = Await.result(Future.sequence(Seq(
          service.synchronizeItem(parent.tenant, refused.batch.get).value,
          service.synchronizeItem(parent.tenant, accepted.batch.get, Some(subscription.id)).value
        )), 10.seconds)
        results.forall(_.isRight) mustBe true
        val saved = Await.result(
          store.subscriptionBatchDemandRepo.forTenant(parent.tenant).findById(parent.id),
          5.seconds
        ).get
        saved.items.map(_.state) mustBe Seq(
          SubscriptionBatchItemState.Refused, SubscriptionBatchItemState.Accepted
        )
        saved.items(1).subscription mustBe Some(subscription.id)
        saved.state mustBe SubscriptionBatchDemandState.PartiallyAccepted
        Await.result(service.synchronizeItem(
          parent.tenant, accepted.batch.get
        ).value, 5.seconds) mustBe Right(saved)

        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).save(
          refused.copy(state = SubscriptionDemandState.InProgress)
        ), 5.seconds) mustBe true
        Await.result(service.synchronizeItem(
          parent.tenant, refused.batch.get
        ).value, 5.seconds).isLeft mustBe true
        Await.result(
          store.subscriptionBatchDemandRepo.forTenant(parent.tenant).findById(parent.id),
          5.seconds
        ) mustBe Some(saved)
      } finally {
        Await.result(store.apiSubscriptionRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
        Await.result(store.subscriptionBatchDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
      }
    }

    "prepare bounded slices and resume remaining items from storage" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val service = new SubscriptionBatchService(store)
      val initial = newBatch()
      val parent = initial.copy(items = (1 to 5).map(index =>
        initial.items.head.copy(
          id = SubscriptionBatchItemId(s"item-$index"),
          plan = UsagePlanId(s"plan-$index")
        )
      ))
      val foreign = parent.copy(
        id = SubscriptionBatchDemandId(IdGenerator.token(32)),
        tenant = TenantId(s"${parent.tenant.value}-other")
      )
      try {
        Await.result(store.subscriptionBatchDemandRepo.insertIfAbsent(parent), 5.seconds)
        Await.result(store.subscriptionBatchDemandRepo.insertIfAbsent(foreign), 5.seconds)
        val first = Await.result(service.materializePendingItems(parent.tenant, 2), 10.seconds)
        first.size mustBe 2
        first.forall(_._2.isRight) mustBe true
        first.map(_._1.item) mustBe parent.items.take(2).map(_.id)
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).count(), 5.seconds) mustBe 2L

        val resumed = new SubscriptionBatchService(store)
        val second = Await.result(resumed.materializePendingItems(parent.tenant, 2), 10.seconds)
        second.map(_._1.item) mustBe parent.items.slice(2, 4).map(_.id)
        val last = Await.result(resumed.materializePendingItems(parent.tenant, 2), 10.seconds)
        last.map(_._1.item) mustBe Seq(parent.items.last.id)
        Await.result(resumed.materializePendingItems(parent.tenant, 2), 5.seconds) mustBe empty
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).count(), 5.seconds) mustBe 5L
        Await.result(store.subscriptionDemandRepo.forTenant(foreign.tenant).count(), 5.seconds) mustBe 0L
      } finally {
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
        Await.result(store.subscriptionBatchDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
        Await.result(store.subscriptionBatchDemandRepo.forTenant(foreign.tenant).deleteAll(), 5.seconds)
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
        keyringChoice = SubscriptionBatchKeyringChoice.Existing(KeyringId("existing"))
      )
      val closed = ready.copy(
        id = SubscriptionBatchItemId("closed"),
        plan = UsagePlanId("closed"),
        state = SubscriptionBatchItemState.Canceled
      )
      val parent = initial.copy(items = Seq(pending, closed, ready), newKeyrings = Seq(creation))
      try {
        Await.result(store.subscriptionBatchDemandRepo.insertIfAbsent(parent), 5.seconds)
        val repo = store.subscriptionBatchDemandRepo
        Await.result(repo.findMaterializableItems(parent.tenant, 1), 5.seconds) mustBe
          Seq(SubscriptionBatchReference(parent.id, ready.id))
        val resolved = parent.copy(newKeyrings = Seq(creation.copy(keyring = Some(KeyringId("resolved")))))
        Await.result(repo.updateIfRevisionMatches(resolved), 5.seconds) mustBe defined
        Await.result(repo.findMaterializableItems(parent.tenant, 10), 5.seconds) mustBe
          Seq(pending, ready).map(item => SubscriptionBatchReference(parent.id, item.id))
      } finally {
        Await.result(store.subscriptionBatchDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
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
        process = SubscriptionProcess(Seq(ValidationStep.Form(
          id = "form", title = "Motivation", formKeysToMetadata = Some(Seq("reason"))
        )))
      )
      val parent = initial.copy(
        items = Seq(first, first.copy(id = SubscriptionBatchItemId("second"), plan = UsagePlanId("second"))),
        newKeyrings = Seq(creation),
        motivation = Some(play.api.libs.json.Json.obj("reason" -> "access", "private" -> "hidden"))
      )
      try {
        Await.result(store.subscriptionBatchDemandRepo.insertIfAbsent(parent), 5.seconds)
        Await.result(service.materializeItem(
          TenantId("other-tenant"), parent.id, first.id
        ).value, 5.seconds).isLeft mustBe true
        Await.result(service.materializeItem(
          parent.tenant, parent.id, SubscriptionBatchItemId("missing")
        ).value, 5.seconds).isLeft mustBe true
        Await.result(service.materializeItem(
          parent.tenant, parent.id, first.id
        ).value, 5.seconds) mustBe Left(AppError.EntityConflict("Subscription batch keyring is not ready"))
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).count(), 5.seconds) mustBe 0L
        Await.result(
          store.subscriptionBatchDemandRepo.forTenant(parent.tenant).findById(parent.id),
          5.seconds
        ) mustBe Some(parent)

        val ready = parent.copy(newKeyrings = Seq(creation.copy(keyring = Some(KeyringId("resolved")))))
        Await.result(store.subscriptionBatchDemandRepo.updateIfRevisionMatches(ready), 5.seconds) mustBe defined
        val child = Await.result(service.materializeItem(
          parent.tenant, parent.id, first.id
        ).value, 5.seconds).toOption.get
        child.keyring mustBe Some(KeyringId("resolved"))
        child.keyringCustomName mustBe Some(creation.customName)
        child.customMetadata mustBe Some(play.api.libs.json.Json.obj("reason" -> "access"))
        child.steps.map(_.state) mustBe Seq(SubscriptionDemandState.Accepted)
        child.state mustBe SubscriptionDemandState.Waiting
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).count(), 5.seconds) mustBe 1L
        val reloaded = Await.result(
          store.subscriptionBatchDemandRepo.forTenant(parent.tenant).findById(parent.id),
          5.seconds
        ).get
        reloaded.items.head.demand mustBe Some(child.id)
        reloaded.items(1) mustBe parent.items(1)
      } finally {
        Await.result(store.subscriptionDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
        Await.result(store.subscriptionBatchDemandRepo.forTenant(parent.tenant).deleteAll(), 5.seconds)
      }
    }
  }

  "SubscriptionBatchDemandRepo" should {

    "keep the first submission and its progress when the request is repeated" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val repo = daikokuComponents.env.dataStore.subscriptionBatchDemandRepo
      val original = newBatch()

      try {
        Await.result(repo.insertIfAbsent(original), 5.seconds) mustBe Some(original)
        val progressed = original.copy(items = original.items.map(
          _.copy(state = SubscriptionBatchItemState.Waiting, demand = Some(DemandId("child")))
        ))
        val saved = Await.result(repo.updateIfRevisionMatches(progressed), 5.seconds).get
        saved.revision mustBe 1L

        val repeated = original.copy(id = SubscriptionBatchDemandId(IdGenerator.token(32)))
        Await.result(repo.insertIfAbsent(repeated), 5.seconds) mustBe None
        Await.result(repo.findBySubmission(
          original.tenant, original.team, original.from, original.idempotencyKey
        ), 5.seconds) mustBe Some(saved)
        Await.result(repo.forTenant(original.tenant).count(), 5.seconds) mustBe 1L
      } finally {
        Await.result(repo.forTenant(original.tenant).deleteAll(), 5.seconds)
      }
    }

      "SubscriptionDemandRepo batch children" should {

        "create one child per batch item under concurrent attempts" in {
          Await.result(waitForDaikokuSetup(), 10.seconds)
          val repo = daikokuComponents.env.dataStore.subscriptionDemandRepo
          val parent = newBatch()
          val reference = SubscriptionBatchReference(parent.id, parent.items.head.id)
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
            val results = Await.result(Future.sequence((1 to 5).map { _ =>
              repo.insertBatchChildIfAbsent(
                child.copy(id = DemandId(IdGenerator.token(32))),
                reference
              )
            }), 10.seconds)

            results.count(_.isDefined) mustBe 1
            val saved = results.flatten.head
            saved.batch mustBe Some(reference)
            Await.result(repo.findByBatchItem(parent.tenant, reference), 5.seconds) mustBe Some(saved)

            val progressed = saved.copy(state = SubscriptionDemandState.InProgress)
            Await.result(repo.forTenant(parent.tenant).save(progressed), 5.seconds) mustBe true
            Await.result(repo.insertBatchChildIfAbsent(child, reference), 5.seconds) mustBe None
            Await.result(repo.findByBatchItem(parent.tenant, reference), 5.seconds) mustBe Some(progressed)

            val otherItem = reference.copy(item = SubscriptionBatchItemId("other"))
            Await.result(repo.insertBatchChildIfAbsent(
              child.copy(id = DemandId(IdGenerator.token(32))),
              otherItem
            ), 5.seconds) mustBe defined
            Await.result(repo.forTenant(parent.tenant).count(), 5.seconds) mustBe 2L
            Await.result(repo.findByBatchItem(TenantId("other-tenant"), reference), 5.seconds) mustBe None
          } finally {
            Await.result(repo.forTenant(parent.tenant).deleteAll(), 5.seconds)
          }
        }

        "allow the same batch item reference in another tenant and standalone demands" in {
          Await.result(waitForDaikokuSetup(), 10.seconds)
          val repo = daikokuComponents.env.dataStore.subscriptionDemandRepo
          val parent = newBatch()
          val otherTenant = TenantId(s"${parent.tenant.value}-other")
          val reference = SubscriptionBatchReference(parent.id, parent.items.head.id)
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
            Await.result(repo.insertBatchChildIfAbsent(child, reference), 5.seconds) mustBe defined
            val other = child.copy(id = DemandId(IdGenerator.token(32)), tenant = otherTenant)
            Await.result(repo.insertBatchChildIfAbsent(other, reference), 5.seconds) mustBe
              Some(other.copy(batch = Some(reference)))
            for (_ <- 1 to 2) {
              Await.result(repo.forTenant(parent.tenant).save(
                child.copy(id = DemandId(IdGenerator.token(32)))
              ), 5.seconds) mustBe true
            }
            Await.result(repo.forTenant(parent.tenant).count(), 5.seconds) mustBe 3L
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
          Await.result(repo.findBySubmission(
            batch.tenant, batch.team, batch.from, batch.idempotencyKey
          ), 5.seconds) mustBe Some(batch)
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
          repo.insertIfAbsent(original.copy(
            id = SubscriptionBatchDemandId(IdGenerator.token(32))
          ))
        }
        val results = Await.result(Future.sequence(attempts), 10.seconds)

        results.count(_.isDefined) mustBe 1
        Await.result(repo.findBySubmission(
          original.tenant, original.team, original.from, original.idempotencyKey
        ), 5.seconds) mustBe results.flatten.headOption
        Await.result(repo.forTenant(original.tenant).count(), 5.seconds) mustBe 1L
      } finally {
        Await.result(repo.forTenant(original.tenant).deleteAll(), 5.seconds)
      }
    }

    "reject stale updates and allow the losing caller to merge after reloading" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val repo = daikokuComponents.env.dataStore.subscriptionBatchDemandRepo
      val initial = newBatch()
      val original = initial.copy(items = initial.items :+ initial.items.head.copy(
        id = SubscriptionBatchItemId("second"),
        plan = UsagePlanId("second-plan")
      ))

      try {
        Await.result(repo.insertIfAbsent(original), 5.seconds)
        val changes = original.items.map { target =>
          original.copy(items = original.items.map { item =>
            if (item.id == target.id) item.copy(state = SubscriptionBatchItemState.Waiting)
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
        saved.items.count(_.state == SubscriptionBatchItemState.Waiting) mustBe 1

        val reloaded = Await.result(
          repo.forTenant(original.tenant).findById(original.id),
          5.seconds
        ).get
        val merged = reloaded.copy(items = reloaded.items.map(
          _.copy(state = SubscriptionBatchItemState.Waiting)
        ))
        val updated = Await.result(repo.updateIfRevisionMatches(merged), 5.seconds).get
        updated.revision mustBe 2L
        updated.items.forall(_.state == SubscriptionBatchItemState.Waiting) mustBe true
        Await.result(repo.updateIfRevisionMatches(original), 5.seconds) mustBe None
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
        Await.result(repo.updateIfRevisionMatches(original), 5.seconds) mustBe None
        Await.result(repo.insertIfAbsent(original), 5.seconds)
        val invalidChanges = Seq(
          original.copy(tenant = TenantId("other-tenant")),
          original.copy(team = TeamId("other-team")),
          original.copy(from = UserId("other-user")),
          original.copy(idempotencyKey = "other-submission")
        )
        invalidChanges.foreach { changed =>
          Await.result(repo.updateIfRevisionMatches(changed), 5.seconds) mustBe None
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
