package fr.maif.daikoku.domain

import fr.maif.daikoku.domain.NotificationAction.*
import fr.maif.daikoku.domain.json.NotificationActionFormat
import org.joda.time.DateTime
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.{JsObject, JsSuccess, Json}

class NotificationActionSpec extends PlaySpec {

  val subscription: ApiSubscriptionId = ApiSubscriptionId("sub_1")
  val api: ApiId = ApiId("api_1")
  val plan: UsagePlanId = UsagePlanId("plan_1")
  val eur: Currency = Currency("EUR")
  val date: DateTime = new DateTime(1755000000000L)

  val priceChange: SubscriptionPriceChangeScheduled =
    SubscriptionPriceChangeScheduled(
      subscription = subscription,
      api = api,
      plan = plan,
      costPerMonth = BigDecimal("12.50"),
      costPerRequest = Some(BigDecimal("0.02")),
      currency = eur,
      effectiveAt = date
    )

  val billingActions: Seq[(String, NotificationAction)] = Seq(
    "SubscriptionPriceChangeScheduled" -> priceChange,
    "SubscriptionPaymentFailed" -> SubscriptionPaymentFailed(
      subscription = subscription,
      api = api,
      plan = plan,
      amount = BigDecimal("42.00"),
      currency = eur,
      failedAt = date,
      gracePeriodEndsAt = date.plusDays(30)
    ),
    "SubscriptionKeyDisabled" -> SubscriptionKeyDisabled(
      subscription = subscription,
      api = api,
      plan = plan,
      disabledAt = date
    ),
    "SubscriptionCancellationScheduled" -> SubscriptionCancellationScheduled(
      subscription = subscription,
      api = api,
      plan = plan,
      effectiveAt = date
    )
  )

  "The billing notification actions" must {
    billingActions.foreach { case (expectedType, action) =>
      s"round-trip $expectedType through JSON" in {
        val written = NotificationActionFormat.writes(action)

        (written \ "type").as[String] mustBe expectedType
        NotificationActionFormat.reads(written) mustBe JsSuccess(action)
      }
    }

    "keep the amounts exact" in {
      val written = NotificationActionFormat.writes(priceChange)

      (written \ "costPerMonth").as[BigDecimal] mustBe BigDecimal("12.50")
      (written \ "costPerRequest").as[BigDecimal] mustBe BigDecimal("0.02")
      (written \ "currency" \ "code").as[String] mustBe "EUR"
    }

    "read a price change without a per-request cost" in {
      val written =
        NotificationActionFormat.writes(priceChange).as[JsObject] - "costPerRequest"

      NotificationActionFormat.reads(written) mustBe JsSuccess(
        priceChange.copy(costPerRequest = None)
      )
    }

    "reject an unknown notification type" in {
      NotificationActionFormat
        .reads(Json.obj("type" -> "NotABillingEvent"))
        .isError mustBe true
    }
  }
}
