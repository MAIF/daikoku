package fr.maif.daikoku.domain

import fr.maif.daikoku.controllers.AppError
import org.scalatestplus.play.PlaySpec

class SubscriptionBatchSelectionSpec extends PlaySpec {
  private val item = SubscriptionBatchItem(
    SubscriptionBatchItemId("first"),
    ApiId("api"),
    UsagePlanId("plan"),
    SubscriptionProcess(),
    SubscriptionBatchKeyringChoice.Existing(KeyringId("keyring"))
  )
  private val batch = SubscriptionBatchDemand(
    SubscriptionBatchDemandId("batch"),
    TenantId("tenant"),
    TeamId("consumer"),
    UserId("requester"),
    "submission",
    Seq(item)
  )
  private val second = item.copy(
    id = SubscriptionBatchItemId("second"),
    plan = UsagePlanId("second-plan")
  )
  private val creation = SubscriptionBatchKeyringCreation(
    SubscriptionBatchKeyringId("shared"),
    "Shared",
    KeyringOtoroshiBinding.Internal
  )

  "SubscriptionBatchDemand.validateSelection" should {
    "accept existing keyrings and shared new keyring choices" in {
      batch.validateSelection() mustBe Right(())
      batch.copy(
        items = Seq(item, second).map(_.copy(
          keyringChoice = SubscriptionBatchKeyringChoice.New(creation.id)
        )),
        newKeyrings = Seq(creation)
      ).validateSelection() mustBe Right(())
    }

    "reject empty selections and blank submission keys" in {
      batch.copy(items = Seq.empty).validateSelection().isLeft mustBe true
      batch.copy(idempotencyKey = "  ").validateSelection().isLeft mustBe true
    }

    "reject duplicate item identifiers and API plan pairs independently" in {
      batch.copy(items = Seq(item, second.copy(id = item.id)))
        .validateSelection().isLeft mustBe true
      batch.copy(items = Seq(item, second.copy(plan = item.plan)))
        .validateSelection().isLeft mustBe true
    }

    "reject missing, duplicate and unused new keyring creations" in {
      val selected = item.copy(
        keyringChoice = SubscriptionBatchKeyringChoice.New(creation.id)
      )
      batch.copy(items = Seq(selected)).validateSelection().isLeft mustBe true
      batch.copy(
        items = Seq(selected),
        newKeyrings = Seq(creation, creation)
      ).validateSelection().isLeft mustBe true
      batch.copy(newKeyrings = Seq(creation)).validateSelection().isLeft mustBe true
    }

    "accept different admin teams and empty processes but reject different forms" in {
      val firstProcess = SubscriptionProcess(Seq(
        ValidationStep.TeamAdmin("admin", TeamId("producer-a"))
      ))
      val otherProcess = SubscriptionProcess(Seq(
        ValidationStep.TeamAdmin("other-admin", TeamId("producer-b"))
      ))
      batch.copy(items = Seq(
        item.copy(process = firstProcess),
        second.copy(process = otherProcess),
        second.copy(id = SubscriptionBatchItemId("third"), plan = UsagePlanId("third"))
      )).validateSelection() mustBe Right(())
      batch.copy(items = Seq(
        item.copy(process = firstProcess),
        second.copy(process = SubscriptionProcess(Seq(
          ValidationStep.Form("form", "Motivation")
        )))
      )).validateSelection().isLeft mustBe true
    }

    "reject payment steps" in {
      batch.copy(items = Seq(item.copy(process = SubscriptionProcess(Seq(
        ValidationStep.Payment("payment", ThirdPartyPaymentSettingsId("stripe"))
      ))))).validateSelection().isLeft mustBe true
    }

    "report all structural errors rather than only the first" in {
      batch.copy(items = Seq.empty, idempotencyKey = "").validateSelection() match {
        case Left(AppError.AppErrors(errors)) => errors.size mustBe 2
        case other                           => fail(s"Expected validation errors, got $other")
      }
    }
  }
}
