package fr.maif.daikoku.utils

import fr.maif.daikoku.domain.*
import fr.maif.daikoku.controllers.AppError
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.Json

class SubscriptionDemandPreparationSpec extends PlaySpec {
  private val demand = SubscriptionDemand(
    id = DemandId("demand"),
    tenant = TenantId("tenant"),
    api = ApiId("api"),
    plan = UsagePlanId("plan"),
    steps = Seq.empty,
    team = TeamId("consumer"),
    from = UserId("requester"),
    motivation = Some(Json.obj("reason" -> "access", "privateAnswer" -> "hidden")),
    keyring = Some(KeyringId("keyring")),
    customMetadata = Some(Json.obj("existing" -> "kept", "reason" -> "old")),
    customMaxPerDay = Some(42L),
    batch = Some(SubscriptionBatchReference(
      SubscriptionBatchDemandId("batch"), SubscriptionBatchItemId("item")
    ))
  )
  private val form = ValidationStep.Form(
    id = "form", title = "Motivation", formKeysToMetadata = Some(Seq("reason"))
  )
  private val admin = ValidationStep.TeamAdmin(
    id = "admin", team = TeamId("producer"), title = "Approval"
  )
  private val email = ValidationStep.Email(
    id = "email", emails = Seq("legal@example.com"), message = None, title = "Legal"
  )

  private val item = SubscriptionBatchItem(
    id = SubscriptionBatchItemId("item"),
    api = demand.api,
    plan = demand.plan,
    process = SubscriptionProcess(Seq(form, admin)),
    keyringChoice = SubscriptionBatchKeyringChoice.Existing(KeyringId("existing"))
  )
  private val batch = SubscriptionBatchDemand(
    id = SubscriptionBatchDemandId("batch"),
    tenant = demand.tenant,
    team = demand.team,
    from = demand.from,
    idempotencyKey = "submission",
    items = Seq(item),
    motivation = demand.motivation
  )
  private val creation = SubscriptionBatchKeyringCreation(
    id = SubscriptionBatchKeyringId("shared"),
    customName = "Shared keyring",
    binding = KeyringOtoroshiBinding.Internal,
    keyring = Some(KeyringId("created"))
  )

  "fromBatch" should {
    "prepare one child from its snapshot and common answers without changing the parent" in {
      val child = SubscriptionDemandPreparation.fromBatch(batch, item.id).toOption.get
      child.tenant mustBe batch.tenant
      child.team mustBe batch.team
      child.from mustBe batch.from
      child.api mustBe item.api
      child.plan mustBe item.plan
      child.batch mustBe Some(SubscriptionBatchReference(batch.id, item.id))
      child.motivation mustBe batch.motivation
      child.customMetadata mustBe Some(Json.obj("reason" -> "access"))
      child.keyring mustBe Some(KeyringId("existing"))
      child.keyringCustomName mustBe None
      child.steps.map(_.step) mustBe item.process.steps
      child.state mustBe SubscriptionDemandState.Waiting
      batch.items.head.demand mustBe None
      SubscriptionDemandPreparation.fromBatch(batch, item.id).toOption.get.id must not be child.id
    }

    "use the same resolved keyring for items sharing a creation" in {
      val first = item.copy(keyringChoice = SubscriptionBatchKeyringChoice.New(creation.id))
      val second = first.copy(id = SubscriptionBatchItemId("second"), plan = UsagePlanId("other"))
      val shared = batch.copy(items = Seq(first, second), newKeyrings = Seq(creation))
      val children = shared.items.map(current =>
        SubscriptionDemandPreparation.fromBatch(shared, current.id).toOption.get
      )
      children.map(_.keyring).distinct mustBe Seq(creation.keyring)
      children.map(_.keyringCustomName).distinct mustBe Seq(Some(creation.customName))
      children.map(_.batch).distinct.size mustBe 2
      children.map(_.steps.head.id).distinct.size mustBe 2
    }

    "wait for the requested keyring instead of falling back to independent creations" in {
      val pending = batch.copy(
        items = Seq(item.copy(keyringChoice = SubscriptionBatchKeyringChoice.New(creation.id))),
        newKeyrings = Seq(creation.copy(keyring = None))
      )
      SubscriptionDemandPreparation.fromBatch(pending, item.id) mustBe Left(
        AppError.EntityConflict("Subscription batch keyring is not ready")
      )
      SubscriptionDemandPreparation.fromBatch(pending.copy(newKeyrings = Seq.empty), item.id)
        .isLeft mustBe true
    }

    "reject unknown items and never rebuild a linked or closed item" in {
      SubscriptionDemandPreparation.fromBatch(batch, SubscriptionBatchItemId("missing"))
        .isLeft mustBe true
      for (state <- SubscriptionBatchItemState.values if state != SubscriptionBatchItemState.Pending) {
        SubscriptionDemandPreparation.fromBatch(
          batch.copy(items = Seq(item.copy(state = state))), item.id
        ).isLeft mustBe true
      }
      SubscriptionDemandPreparation.fromBatch(
        batch.copy(items = Seq(item.copy(demand = Some(DemandId("existing"))))), item.id
      ).isLeft mustBe true
    }

    "keep empty-process items traceable without executing provisioning" in {
      val withoutProcess = batch.copy(items = Seq(item.copy(process = SubscriptionProcess())))
      val child = SubscriptionDemandPreparation.fromBatch(withoutProcess, item.id).toOption.get
      child.steps mustBe empty
      child.batch mustBe Some(SubscriptionBatchReference(batch.id, item.id))
      child.keyring mustBe Some(KeyringId("existing"))
    }
  }

  "SubscriptionDemandPreparation" should {
    "preserve step order and accept only the already collected form" in {
      val process = SubscriptionProcess(Seq(form, admin, email))
      val prepared = SubscriptionDemandPreparation.prepare(demand, process)
      prepared.steps.map(_.step) mustBe process.steps
      prepared.steps.map(_.state) mustBe Seq(
        SubscriptionDemandState.Accepted,
        SubscriptionDemandState.Waiting,
        SubscriptionDemandState.Waiting
      )
      prepared.steps.map(_.id).distinct.size mustBe 3
      val another = SubscriptionDemandPreparation.prepare(demand, process)
      prepared.steps.map(_.id).toSet.intersect(another.steps.map(_.id).toSet) mustBe empty
    }

    "copy only configured form answers into metadata with the existing merge precedence" in {
      val prepared = SubscriptionDemandPreparation.prepare(
        demand, SubscriptionProcess(Seq(form, admin))
      )
      prepared.customMetadata mustBe Some(Json.obj("existing" -> "kept", "reason" -> "access"))
      prepared.copy(steps = demand.steps, customMetadata = demand.customMetadata) mustBe demand
    }

    "keep metadata unchanged without form mapping or without answers" in {
      SubscriptionDemandPreparation.prepare(
        demand, SubscriptionProcess(Seq(form.copy(formKeysToMetadata = None), admin))
      ).customMetadata mustBe demand.customMetadata
      SubscriptionDemandPreparation.prepare(
        demand.copy(motivation = None), SubscriptionProcess(Seq(form, admin))
      ).customMetadata mustBe demand.customMetadata
      SubscriptionDemandPreparation.prepare(
        demand, SubscriptionProcess(Seq(admin))
      ).customMetadata mustBe demand.customMetadata
    }

    "prepare a traceable child even when the process has no validation steps" in {
      SubscriptionDemandPreparation.prepare(demand, SubscriptionProcess()) mustBe demand
    }
  }
}
