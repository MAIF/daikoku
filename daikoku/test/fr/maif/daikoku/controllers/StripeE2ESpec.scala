package fr.maif.daikoku.controllers

import fr.maif.daikoku.domain.ThirdPartyPaymentSettings.StripeSettings
import fr.maif.daikoku.domain._
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import play.api.libs.ws.DefaultBodyWritables.writeableOf_urlEncodedSimpleForm
import play.api.libs.ws.{WSAuthScheme, WSResponse}

import java.util.UUID

class StripeE2ESpec()
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience {

  private val maybeKey = sys.env.get("STRIPE_TEST_SECRET_KEY")
  private lazy val ws = daikokuComponents.env.wsClient
  private lazy val baseUrl = daikokuComponents.env.config.stripeUrl
  private lazy val version = daikokuComponents.env.config.stripeApiVersion

  private val meteredPlan: UsagePlan =
    defaultApi.plans.find(_.customName == "Quotas Without Limits").get

  private def stripe(path: String)(implicit key: String) =
    ws.url(s"$baseUrl$path")
      .withHttpHeaders(
        "content-type" -> "application/x-www-form-urlencoded",
        "Stripe-Version" -> version
      )
      .withAuth(key, "", WSAuthScheme.BASIC)

  "The metered billing flow (#1149)" must {
    "be accepted end-to-end by real Stripe (test mode)" in {
      val key = maybeKey.getOrElse(
        cancel("STRIPE_TEST_SECRET_KEY not set — Stripe e2e skipped (dev only)")
      )
      if (baseUrl.contains("localhost")) {
        cancel("DAIKOKU_STRIPE_URL must point to https://api.stripe.com")
      }
      implicit val stripeKey: String = key
      val stripeSettings = StripeSettings(
        id = ThirdPartyPaymentSettingsId("stripe-e2e"),
        name = "stripe",
        publicKey = "pk_test",
        secretKey = key
      )

      val settings = daikokuComponents.paymentClient
        .createStripeProduct(defaultApi.api, meteredPlan)(stripeSettings)
        .value
        .futureValue
      settings.isRight mustBe true

      val stripeSettingsResult = settings.toOption.get
        .asInstanceOf[PaymentSettings.Stripe]
      val meterId = stripeSettingsResult.priceIds.meterId.get
      val eventName = stripeSettingsResult.priceIds.meterEventName.get
      val meteredPriceId = stripeSettingsResult.priceIds.additionalPriceId.get

      val meter = stripe(s"/v1/billing/meters/$meterId").get().futureValue
      meter.status mustBe 200
      (meter.json \ "default_aggregation" \ "formula").as[String] mustBe "sum"

      val price = stripe(s"/v1/prices/$meteredPriceId").get().futureValue
      price.status mustBe 200
      (price.json \ "recurring" \ "meter").as[String] mustBe meterId
      (price.json \ "recurring" \ "usage_type").as[String] mustBe "metered"

      val customerId = (stripe("/v1/customers")
        .post(Map("name" -> "daikoku-e2e"))
        .futureValue
        .json \ "id").as[String]

      val meterEvent = stripe("/v1/billing/meter_events")
        .post(
          Map(
            "event_name" -> eventName,
            "identifier" -> s"e2e-${UUID.randomUUID().toString}",
            "payload[value]" -> "4200",
            "payload[stripe_customer_id]" -> customerId
          )
        )
        .futureValue
      withClue(meterEvent.body) {
        meterEvent.status mustBe 200
      }

      def quietPost(path: String, body: Map[String, String]): WSResponse =
        stripe(path).post(body).futureValue
      quietPost(s"/v1/prices/$meteredPriceId", Map("active" -> "false"))
      quietPost(
        s"/v1/prices/${stripeSettingsResult.priceIds.basePriceId}",
        Map("active" -> "false")
      )
      quietPost(s"/v1/billing/meters/$meterId/deactivate", Map.empty)
      quietPost(
        s"/v1/products/${stripeSettingsResult.productId}",
        Map("active" -> "false")
      )
      stripe(s"/v1/customers/$customerId").delete().futureValue
    }
  }
}
