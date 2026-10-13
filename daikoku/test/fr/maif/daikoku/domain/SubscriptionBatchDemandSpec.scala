package fr.maif.daikoku.domain

import org.scalatestplus.play.PlaySpec
import org.joda.time.DateTime
import play.api.libs.json.{JsString, Json}

class SubscriptionBatchDemandSpec extends PlaySpec {

  private val item = SubscriptionBatchItem(
    id = SubscriptionBatchItemId("first"),
    api = ApiId("api"),
    plan = UsagePlanId("plan"),
    process = SubscriptionProcess(),
    keyringChoice = SubscriptionBatchKeyringChoice.Existing(KeyringId("keyring"))
  )

  private def batch(states: SubscriptionBatchItemState*) =
    SubscriptionBatchDemand(
      id = SubscriptionBatchDemandId("batch"),
      tenant = TenantId("tenant"),
      team = TeamId("consumer"),
      from = UserId("requester"),
      idempotencyKey = "submission",
      items = states.zipWithIndex.map { case (state, index) =>
        item.copy(id = SubscriptionBatchItemId(index.toString), state = state)
      }
    )

  "SubscriptionBatchItemReservation" should {
    "be active from its start until strictly before its expiration" in {
      val start = new DateTime(1000L)
      val reservation = SubscriptionBatchItemReservation("worker-token", start, start.plusSeconds(30))
      reservation.validate() mustBe Right(())
      reservation.isActiveAt(start.minusMillis(1)) mustBe false
      reservation.isActiveAt(start) mustBe true
      reservation.isActiveAt(reservation.expiresAt.minusMillis(1)) mustBe true
      reservation.isActiveAt(reservation.expiresAt) mustBe false
    }

    "persist reservations while accepting older items without this field" in {
      val reservation = SubscriptionBatchItemReservation(
        "worker-token", new DateTime(1000L), new DateTime(2000L)
      )
      val original = batch(SubscriptionBatchItemState.InProgress)
      val reserved = original.copy(items = original.items.map(_.copy(reservation = Some(reservation))))
      json.SubscriptionBatchDemandFormat.reads(reserved.asJson).get mustBe reserved
      val legacyItem = json.SubscriptionBatchItemFormat.writes(item).as[play.api.libs.json.JsObject] - "reservation"
      json.SubscriptionBatchItemFormat.reads(legacyItem).get.reservation mustBe None
      val malformed = legacyItem ++ Json.obj("reservation" -> Json.obj("token" -> "broken"))
      json.SubscriptionBatchItemFormat.reads(malformed).isError mustBe true
    }

    "reject empty tokens and invalid time ranges rather than dropping reservations" in {
      val valid = SubscriptionBatchItemReservation("token", new DateTime(1000L), new DateTime(2000L))
      Seq(
        valid.copy(token = " "),
        valid.copy(expiresAt = valid.lockedAt),
        valid.copy(expiresAt = valid.lockedAt.minusMillis(1))
      ).foreach { invalid =>
        invalid.validate().isLeft mustBe true
        json.SubscriptionBatchItemReservationFormat.reads(
          json.SubscriptionBatchItemReservationFormat.writes(invalid)
        ).isError mustBe true
      }
    }
  }

  "SubscriptionBatchDemand.state" should {

    "remain pending before any child is started" in {
      batch().state mustBe SubscriptionBatchDemandState.Pending
      batch(
        SubscriptionBatchItemState.Pending,
        SubscriptionBatchItemState.Pending
      ).state mustBe SubscriptionBatchDemandState.Pending
    }

    "remain in progress despite an individual refusal or success" in {
      for (ongoing <- Seq(
          SubscriptionBatchItemState.Pending,
          SubscriptionBatchItemState.Waiting,
          SubscriptionBatchItemState.InProgress,
          SubscriptionBatchItemState.RetryableError
        );
        completed <- Seq(
          SubscriptionBatchItemState.Accepted,
          SubscriptionBatchItemState.Refused,
          SubscriptionBatchItemState.Blocked,
          SubscriptionBatchItemState.Failed,
          SubscriptionBatchItemState.Canceled
        )
      ) {
        batch(ongoing, completed).state mustBe
          SubscriptionBatchDemandState.InProgress
      }
    }

    "report success only when every item has succeeded" in {
      batch(
        SubscriptionBatchItemState.Accepted,
        SubscriptionBatchItemState.Accepted
      ).state mustBe SubscriptionBatchDemandState.Accepted
    }

    "report partial success for every kind of unsuccessful terminal result" in {
      Seq(
        SubscriptionBatchItemState.Refused,
        SubscriptionBatchItemState.Blocked,
        SubscriptionBatchItemState.Failed,
        SubscriptionBatchItemState.Canceled
      ).foreach { unsuccessful =>
        batch(SubscriptionBatchItemState.Accepted, unsuccessful).state mustBe
          SubscriptionBatchDemandState.PartiallyAccepted
      }
    }

    "report failure when all items finish without a subscription" in {
      batch(
        SubscriptionBatchItemState.Refused,
        SubscriptionBatchItemState.Blocked,
        SubscriptionBatchItemState.Failed,
        SubscriptionBatchItemState.Canceled
      ).state mustBe SubscriptionBatchDemandState.Failed
    }

    "report cancellation when every item is canceled" in {
      batch(
        SubscriptionBatchItemState.Canceled,
        SubscriptionBatchItemState.Canceled
      ).state mustBe SubscriptionBatchDemandState.Canceled
    }
  }

  "SubscriptionBatchKeyringChoice" should {

    "allow several items to reference one new keyring creation" in {
      val creation = SubscriptionBatchKeyringCreation(
        id = SubscriptionBatchKeyringId("shared"),
        customName = "Shared keyring",
        binding = KeyringOtoroshiBinding.Otoroshi(OtoroshiSettingsId("otoroshi"))
      )
      val first = item.copy(
        keyringChoice = SubscriptionBatchKeyringChoice.New(creation.id)
      )
      val second = first.copy(
        id = SubscriptionBatchItemId("second"),
        plan = UsagePlanId("other-plan")
      )

      first.keyringChoice mustBe second.keyringChoice
      creation.keyring mustBe None
    }
  }

  "SubscriptionBatchSubmission" should {
    "round-trip selected fields and optional shared keyring names" in {
      val submission = SubscriptionBatchSubmission(
        team = TeamId("consumer"),
        idempotencyKey = "submission-token",
        items = Seq(
          SubscriptionBatchItemSelection(
            ApiId("api"),
            UsagePlanId("plan"),
            SubscriptionBatchKeyringChoice.Existing(KeyringId("existing"))
          ),
          SubscriptionBatchItemSelection(
            ApiId("api"),
            UsagePlanId("other-plan"),
            SubscriptionBatchKeyringChoice.New(SubscriptionBatchKeyringId("shared"))
          )
        ),
        newKeyrings = Seq(
          SubscriptionBatchNewKeyringSelection(
            SubscriptionBatchKeyringId("shared"),
            "Shared key"
          )
        ),
        motivation = Some(Json.obj("reason" -> "integration"))
      )

      json.SubscriptionBatchSubmissionFormat.reads(
        json.SubscriptionBatchSubmissionFormat.writes(submission)
      ).get mustBe submission
      val withoutKeyrings =
        json.SubscriptionBatchSubmissionFormat.writes(submission).as[play.api.libs.json.JsObject] -
          "newKeyrings"
      json.SubscriptionBatchSubmissionFormat.reads(withoutKeyrings).get.newKeyrings mustBe empty
      json.SubscriptionBatchSubmissionFormat.reads(
        json.SubscriptionBatchSubmissionFormat.writes(submission)
          .as[play.api.libs.json.JsObject] - "team"
      ).isError mustBe true
    }

    "round-trip an idempotent submission receipt and reject unknown states" in {
      val receipt = SubscriptionBatchSubmissionReceipt(
        SubscriptionBatchDemandId("batch"),
        SubscriptionBatchDemandState.PartiallyAccepted,
        replayed = true
      )
      val serialized = json.SubscriptionBatchSubmissionReceiptFormat.writes(receipt)

      json.SubscriptionBatchSubmissionReceiptFormat.reads(serialized).get mustBe receipt
      json.SubscriptionBatchSubmissionReceiptFormat.reads(
        serialized.as[play.api.libs.json.JsObject] + ("state" -> JsString("unknown"))
      ).isError mustBe true
    }
  }

  "ApiSubscriptionBatchDemand notification action" should {
    "round-trip the group scope and exact child steps without adding a notification type" in {
      val action = NotificationAction.ApiSubscriptionBatchDemand(
        batch = SubscriptionBatchDemandId("batch"),
        api = ApiId("api"),
        team = TeamId("consumer"),
        phase = 2,
        items = Seq(
          NotificationAction.SubscriptionBatchApprovalItem(
            item = SubscriptionBatchItemId("plan-one"),
            plan = UsagePlanId("plan-one-id"),
            demand = DemandId("demand-one"),
            step = SubscriptionDemandStepId("step-one")
          ),
          NotificationAction.SubscriptionBatchApprovalItem(
            item = SubscriptionBatchItemId("plan-two"),
            plan = UsagePlanId("plan-two-id"),
            demand = DemandId("demand-two"),
            step = SubscriptionDemandStepId("step-two")
          )
        ),
        motivation = Some("Business use case")
      )

      val serialized = json.NotificationActionFormat.writes(action)
      (serialized \ "type").as[String] mustBe "ApiSubscriptionBatch"
      json.NotificationActionFormat.reads(serialized).get mustBe action

      val notification = Notification(
        id = NotificationId("notification"),
        tenant = TenantId("tenant"),
        team = Some(TeamId("producer")),
        sender = NotificationSender("requester", "requester@example.com", None),
        notificationType = NotificationType.AcceptOrReject,
        action = action
      )
      json.NotificationFormat.reads(notification.asJson).get mustBe notification
    }

    "reject empty groups and negative phase indexes" in {
      val action = Json.obj(
        "type" -> "ApiSubscriptionBatch",
        "batch" -> "batch",
        "api" -> "api",
        "team" -> "consumer",
        "phase" -> 0,
        "items" -> Json.arr()
      )

      json.NotificationActionFormat.reads(action).isError mustBe true
      json.NotificationActionFormat
        .reads(action ++ Json.obj(
          "phase" -> -1,
          "items" -> Json.arr(
            Json.obj(
              "item" -> "item",
              "demand" -> "demand",
              "step" -> "step"
            )
          )
        ))
        .isError mustBe true
    }
  }

  "SubscriptionBatchDemand JSON" should {

    "preserve revisions and read older batches without a revision" in {
      val original = batch(SubscriptionBatchItemState.Pending).copy(revision = 7L)
      json.SubscriptionBatchDemandFormat.reads(original.asJson).get mustBe original
      val older = original.asJson.as[play.api.libs.json.JsObject] - "revision"
      json.SubscriptionBatchDemandFormat.reads(older).get.revision mustBe 0L
      val malformed = older + ("revision" -> JsString("invalid"))
      json.SubscriptionBatchDemandFormat.reads(malformed).isError mustBe true
    }

    "round-trip every item state and its child references and error" in {
      val date = new DateTime(123456789L)
      val original = batch(SubscriptionBatchItemState.Pending).copy(
        date = date,
        motivation = Some(Json.obj("reason" -> "Integration")),
        items = SubscriptionBatchItemState.values.toSeq.map { state =>
          item.copy(
            id = SubscriptionBatchItemId(state.name),
            state = state,
            process = SubscriptionProcess(Seq(
              ValidationStep.TeamAdmin("admin", TeamId("producer"))
            )),
            demand = Some(DemandId("child")),
            subscription = Some(ApiSubscriptionId("subscription")),
            error = Some(SubscriptionBatchItemError("validation", "Denied", date))
          )
        }
      )

      json.SubscriptionBatchDemandFormat.reads(original.asJson).get mustBe original
    }

    "round-trip a shared new keyring before and after shell creation" in {
      for (keyring <- Seq(None, Some(KeyringId("shell")))) {
        val creation = SubscriptionBatchKeyringCreation(
          SubscriptionBatchKeyringId("shared"),
          "Shared",
          KeyringOtoroshiBinding.Otoroshi(OtoroshiSettingsId("otoroshi")),
          keyring
        )
        val original = batch(SubscriptionBatchItemState.Pending).copy(
          newKeyrings = Seq(creation),
          items = Seq(item.copy(
            keyringChoice = SubscriptionBatchKeyringChoice.New(creation.id)
          ))
        )

        json.SubscriptionBatchDemandFormat.reads(original.asJson).get mustBe original
      }
    }

    "derive the summary even when the serialized summary is stale" in {
      val original = batch(
        SubscriptionBatchItemState.Accepted,
        SubscriptionBatchItemState.Refused
      )
      val serialized = original.asJson.as[play.api.libs.json.JsObject] +
        ("state" -> JsString("accepted"))

      json.SubscriptionBatchDemandFormat.reads(serialized).get.state mustBe
        SubscriptionBatchDemandState.PartiallyAccepted
    }

    "reject unknown item states and keyring choices" in {
      json.SubscriptionBatchItemStateFormat.reads(JsString("unknown")).isError mustBe true
      json.SubscriptionBatchKeyringChoiceFormat
        .reads(Json.obj("type" -> "unknown")).isError mustBe true
      json.SubscriptionBatchKeyringChoiceFormat
        .reads(Json.obj("type" -> "existing")).isError mustBe true
      json.SubscriptionBatchKeyringChoiceFormat
        .reads(Json.obj("type" -> "new")).isError mustBe true
    }

    "reject malformed optional fields instead of silently dropping them" in {
      val original = batch(SubscriptionBatchItemState.Pending)
      val malformed = original.asJson.as[play.api.libs.json.JsObject] +
        ("motivation" -> JsString("not an object"))

      json.SubscriptionBatchDemandFormat.reads(malformed).isError mustBe true
    }
  }
}
