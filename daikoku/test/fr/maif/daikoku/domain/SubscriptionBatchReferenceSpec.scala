package fr.maif.daikoku.domain

import org.scalatestplus.play.PlaySpec
import play.api.libs.json.{JsObject, JsString, Json}

class SubscriptionBatchReferenceSpec extends PlaySpec {
  private val demand = SubscriptionDemand(
    id = DemandId("demand"),
    tenant = TenantId("tenant"),
    api = ApiId("api"),
    plan = UsagePlanId("plan"),
    steps = Seq.empty,
    team = TeamId("consumer"),
    from = UserId("requester")
  )
  private val reference = SubscriptionBatchReference(
    SubscriptionBatchDemandId("batch"),
    SubscriptionBatchItemId("item")
  )

  "SubscriptionDemand batch reference" should {
    "preserve classic demand JSON without introducing a batch field" in {
      val serialized = demand.asJson.as[JsObject]

      serialized.keys must not contain "batch"
      json.SubscriptionDemandFormat.reads(serialized).get mustBe demand
    }

    "round-trip the parent and item together" in {
      val child = demand.copy(batch = Some(reference))

      json.SubscriptionDemandFormat.reads(child.asJson).get mustBe child
      (child.asJson \ "batch" \ "batch").as[String] mustBe "batch"
      (child.asJson \ "batch" \ "item").as[String] mustBe "item"
    }

    "keep the reference when updating a child state" in {
      demand.copy(batch = Some(reference))
        .copy(state = SubscriptionDemandState.Accepted).batch mustBe Some(reference)
    }

    "reject incomplete or malformed references instead of losing the parent link" in {
      val invalid = Seq(
        Json.obj("batch" -> "batch"),
        Json.obj("item" -> "item"),
        Json.obj("batch" -> 42, "item" -> "item"),
        JsString("batch")
      )
      invalid.foreach { value =>
        json.SubscriptionDemandFormat.reads(
          demand.asJson.as[JsObject] + ("batch" -> value)
        ).isError mustBe true
      }
    }
  }
}
