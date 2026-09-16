package fr.maif.daikoku.controllers

import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.domain.ThirdPartyPaymentSettings.StripeSettings
import fr.maif.daikoku.domain.ThirdPartySubscriptionInformations.StripeSubscriptionInformations
import fr.maif.daikoku.domain._
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import org.joda.time.DateTime
import org.scalatest.concurrent.{Eventually, IntegrationPatience}
import org.scalatest.time.{Seconds, Span}
import org.scalatestplus.play.PlaySpec
import play.api.libs.ws.DefaultBodyWritables.writeableOf_urlEncodedSimpleForm
import play.api.libs.ws.{WSAuthScheme, WSResponse}

import java.util.UUID

/** Runs against real Stripe in test mode, dev only. Needs
  * STRIPE_TEST_SECRET_KEY and DAIKOKU_STRIPE_URL=https://api.stripe.com — see
  * test/resources/stripe/README.md. Every test cancels itself without them.
  */
class StripeE2ESpec()
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with Eventually {

  private val maybeKey = sys.env.get("STRIPE_TEST_SECRET_KEY")
  private lazy val ws = daikokuComponents.env.wsClient
  private lazy val baseUrl = daikokuComponents.env.config.stripeUrl
  private lazy val version = daikokuComponents.env.config.stripeApiVersion

  private val settingsId = ThirdPartyPaymentSettingsId("stripe-e2e")

  private val meteredPlan: UsagePlan =
    defaultApi.plans.find(_.customName == "Quotas Without Limits").get

  private def realStripeKey: String = {
    val key = maybeKey.getOrElse(
      cancel("STRIPE_TEST_SECRET_KEY not set — Stripe e2e skipped (dev only)")
    )
    if (baseUrl.contains("localhost")) {
      cancel("DAIKOKU_STRIPE_URL must point to https://api.stripe.com")
    }
    key
  }

  private def stripe(path: String)(implicit key: String) =
    ws.url(s"$baseUrl$path")
      .withHttpHeaders(
        "content-type" -> "application/x-www-form-urlencoded",
        "Stripe-Version" -> version
      )
      .withAuth(key, "", WSAuthScheme.BASIC)

  private def stripeSettingsFor(key: String) = StripeSettings(
    id = settingsId,
    name = "stripe",
    publicKey = "pk_test",
    secretKey = key
  )

  private def setupTenant(settings: StripeSettings): Tenant = {
    val stripeTenant = tenant.copy(thirdPartyPaymentSettings = Seq(settings))
    setupEnvBlocking(
      tenants = Seq(stripeTenant),
      users = Seq(userAdmin),
      teams = Seq(teamOwner, teamConsumer),
      apis = Seq(defaultApi.api),
      usagePlans = defaultApi.plans
    )
    stripeTenant
  }

  private def createCustomer()(implicit key: String): String =
    (stripe("/v1/customers")
      .post(Map("name" -> s"daikoku-e2e-${UUID.randomUUID()}"))
      .futureValue
      .json \ "id").as[String]

  private def consumption(
      tenantId: TenantId,
      hits: Long,
      lastReportedHits: Long
  ): ApiKeyConsumption =
    ApiKeyConsumption(
      id = DatastoreId(s"e2e-${UUID.randomUUID()}"),
      tenant = tenantId,
      team = teamConsumerId,
      api = defaultApi.api.id,
      plan = meteredPlan.id,
      clientId = "e2e-client",
      hits = hits,
      globalInformations =
        ApiKeyGlobalConsumptionInformations(hits, 0, 0, None, None),
      quotas = ApiKeyQuotas(0, 0, 0, 0, 0, 0, 0, 0, 0),
      billing = ApiKeyBilling(hits, BigDecimal(0)),
      from = DateTime.now().withTimeAtStartOfDay(),
      to = DateTime.now(),
      state = ApiKeyConsumptionState.InProgress,
      lastReportedHits = lastReportedHits
    )

  /** Stripe aggregates meter events asynchronously, so the summary lags behind
    * the reports by a few seconds.
    */
  private def aggregatedUsage(meterId: String, customerId: String)(implicit
      key: String
  ): BigDecimal = {
    val startOfDay = DateTime.now().withTimeAtStartOfDay()
    val summaries = stripe(s"/v1/billing/meters/$meterId/event_summaries")
      .withQueryStringParameters(
        "customer" -> customerId,
        "start_time" -> (startOfDay.getMillis / 1000).toString,
        "end_time" -> (startOfDay.plusDays(1).getMillis / 1000).toString
      )
      .get()
      .futureValue

    withClue(summaries.body) { summaries.status mustBe 200 }

    (summaries.json \ "data")
      .as[Seq[play.api.libs.json.JsValue]]
      .map(summary => (summary \ "aggregated_value").as[BigDecimal])
      .sum
  }

  private def cleanUp(settings: PaymentSettings, tenantId: TenantId): Unit =
    daikokuComponents.paymentClient
      .deleteThirdPartyProduct(settings, tenantId)
      .value
      .futureValue
      .isRight mustBe true

  "The metered billing flow (#1149)" must {
    "be accepted end-to-end by real Stripe (test mode)" in {
      implicit val stripeKey: String = realStripeKey
      val stripeSettings = stripeSettingsFor(stripeKey)
      val stripeTenant = setupTenant(stripeSettings)

      val settings = daikokuComponents.paymentClient
        .createStripeProduct(defaultApi.api, meteredPlan)(stripeSettings)
        .value
        .futureValue
      settings.isRight mustBe true

      val stripeSettingsResult =
        settings.toOption.get.asInstanceOf[PaymentSettings.Stripe]
      val meterId = stripeSettingsResult.priceIds.meterId.get
      val meteredPriceId = stripeSettingsResult.priceIds.additionalPriceId.get

      val meter = stripe(s"/v1/billing/meters/$meterId").get().futureValue
      meter.status mustBe 200
      (meter.json \ "default_aggregation" \ "formula").as[String] mustBe "sum"

      val price = stripe(s"/v1/prices/$meteredPriceId").get().futureValue
      price.status mustBe 200
      (price.json \ "recurring" \ "meter").as[String] mustBe meterId
      (price.json \ "recurring" \ "usage_type").as[String] mustBe "metered"

      cleanUp(stripeSettingsResult, stripeTenant.id)
      stripe(s"/v1/billing/meters/$meterId").get().futureValue.status mustBe 200
    }

    "have Stripe count the deltas Daikoku reports, not the running totals" in {
      implicit val stripeKey: String = realStripeKey
      val stripeSettings = stripeSettingsFor(stripeKey)
      val stripeTenant = setupTenant(stripeSettings)

      val settings = daikokuComponents.paymentClient
        .createStripeProduct(defaultApi.api, meteredPlan)(stripeSettings)
        .value
        .futureValue
        .toOption
        .get
        .asInstanceOf[PaymentSettings.Stripe]
      val customerId = createCustomer()
      val informations =
        StripeSubscriptionInformations("sub_e2e", customerId.some)

      val first = consumption(stripeTenant.id, hits = 250, lastReportedHits = 0)
      daikokuComponents.paymentClient
        .syncWithThirdParty(first, settings.some, informations.some)
        .futureValue mustBe Right(())

      val second = first.copy(hits = 400, lastReportedHits = 250)
      daikokuComponents.paymentClient
        .syncWithThirdParty(second, settings.some, informations.some)
        .futureValue mustBe Right(())

      eventually(timeout(Span(120, Seconds)), interval(Span(5, Seconds))) {
        aggregatedUsage(settings.priceIds.meterId.get, customerId) mustBe
          BigDecimal(400)
      }

      daikokuComponents.paymentClient
        .syncWithThirdParty(second, settings.some, informations.some)
        .futureValue mustBe Right(())

      eventually(timeout(Span(60, Seconds)), interval(Span(5, Seconds))) {
        aggregatedUsage(settings.priceIds.meterId.get, customerId) mustBe
          BigDecimal(400)
      }

      cleanUp(settings, stripeTenant.id)
      stripe(s"/v1/customers/$customerId").delete().futureValue
    }
  }

  "The reconciliation job (#1150)" must {
    "resend what Stripe acknowledged but never counted" in {
      implicit val stripeKey: String = realStripeKey
      val stripeSettings = stripeSettingsFor(stripeKey)
      val stripeTenant = setupTenant(stripeSettings)

      val settings = daikokuComponents.paymentClient
        .createStripeProduct(defaultApi.api, meteredPlan)(stripeSettings)
        .value
        .futureValue
        .toOption
        .get
        .asInstanceOf[PaymentSettings.Stripe]
      val customerId = createCustomer()
      val informations =
        StripeSubscriptionInformations(
          s"sub_reconcile_${UUID.randomUUID()}",
          customerId.some
        )

      daikokuComponents.env.dataStore.usagePlanRepo
        .forTenant(stripeTenant)
        .save(meteredPlan.copy(paymentSettings = settings.some))
        .futureValue

      val keyring = Keyring(
        id = KeyringId(s"reconcile-${UUID.randomUUID()}"),
        tenant = stripeTenant.id,
        team = teamConsumerId,
        customName = "reconcile",
        apiKey = OtoroshiApiKey("e2e-client", "e2e-client", "e2e-secret"),
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(wiremockedOtoroshi),
        createdAt = DateTime.now(),
        rotation = None,
        integrationToken = "e2e-token"
      )
      daikokuComponents.env.dataStore.keyringRepo
        .forTenant(stripeTenant)
        .save(keyring)
        .futureValue

      daikokuComponents.env.dataStore.apiSubscriptionRepo
        .forTenant(stripeTenant)
        .save(
          ApiSubscription(
            id = ApiSubscriptionId(s"reconcile-${UUID.randomUUID()}"),
            tenant = stripeTenant.id,
            plan = meteredPlan.id,
            createdAt = DateTime.now(),
            team = teamConsumerId,
            api = defaultApi.api.id,
            by = userAdmin.id,
            customName = None,
            keyring = keyring.id,
            thirdPartySubscriptionInformations = informations.some
          )
        )
        .futureValue

      val reported = consumption(stripeTenant.id, 250, lastReportedHits = 0)
      daikokuComponents.paymentClient
        .syncWithThirdParty(reported, settings.some, informations.some)
        .futureValue mustBe Right(())

      eventually(timeout(Span(120, Seconds)), interval(Span(5, Seconds))) {
        aggregatedUsage(settings.priceIds.meterId.get, customerId) mustBe
          BigDecimal(250)
      }

      daikokuComponents.env.dataStore.consumptionRepo
        .forTenant(stripeTenant)
        .save(reported.copy(hits = 400, lastReportedHits = 400))
        .futureValue

      daikokuComponents.stripeReconciliationJob.reconcile().futureValue

      eventually(timeout(Span(120, Seconds)), interval(Span(5, Seconds))) {
        aggregatedUsage(settings.priceIds.meterId.get, customerId) mustBe
          BigDecimal(400)
      }

      daikokuComponents.stripeReconciliationJob.reconcile().futureValue

      eventually(timeout(Span(60, Seconds)), interval(Span(5, Seconds))) {
        aggregatedUsage(settings.priceIds.meterId.get, customerId) mustBe
          BigDecimal(400)
      }

      cleanUp(settings, stripeTenant.id)
      stripe(s"/v1/customers/$customerId").delete().futureValue
    }
  }

  "The monthly cycle anchored on the 1st" must {
    "be accepted by real Stripe on a checkout session" in {
      implicit val stripeKey: String = realStripeKey
      val stripeSettings = stripeSettingsFor(stripeKey)
      val stripeTenant = setupTenant(stripeSettings)

      val settings = daikokuComponents.paymentClient
        .createStripeProduct(defaultApi.api, meteredPlan)(stripeSettings)
        .value
        .futureValue
        .toOption
        .get
        .asInstanceOf[PaymentSettings.Stripe]
      val customerId = createCustomer()

      val session = stripe("/v1/checkout/sessions")
        .post(
          Map(
            "mode" -> "subscription",
            "customer" -> customerId,
            "line_items[0][price]" -> settings.priceIds.basePriceId,
            "line_items[0][quantity]" -> "1",
            "success_url" -> "https://example.com/ok",
            "cancel_url" -> "https://example.com/ko",
            "subscription_data[billing_cycle_anchor_config][day_of_month]" -> "1"
          )
        )
        .futureValue

      withClue(session.body) { session.status mustBe 200 }

      val price = stripe(s"/v1/prices/${settings.priceIds.basePriceId}")
        .get()
        .futureValue
      (price.json \ "recurring" \ "interval").as[String] mustBe "month"

      cleanUp(settings, stripeTenant.id)
      stripe(s"/v1/customers/$customerId").delete().futureValue
    }
  }

  "Amounts sent to Stripe (#1152)" must {
    "carry no sub-unit for a zero-decimal currency" in {
      implicit val stripeKey: String = realStripeKey
      val stripeSettings = stripeSettingsFor(stripeKey)
      val stripeTenant = setupTenant(stripeSettings)

      val yenPlan = meteredPlan.copy(
        currency = Currency("JPY").some,
        costPerMonth = BigDecimal(1000).some,
        costPerRequest = None,
        maxPerMonth = None
      )

      val settings = daikokuComponents.paymentClient
        .createStripeProduct(defaultApi.api, yenPlan)(stripeSettings)
        .value
        .futureValue
        .toOption
        .get
        .asInstanceOf[PaymentSettings.Stripe]

      val price = stripe(s"/v1/prices/${settings.priceIds.basePriceId}")
        .get()
        .futureValue
      price.status mustBe 200
      (price.json \ "currency").as[String] mustBe "jpy"
      (price.json \ "unit_amount").as[Long] mustBe 1000L

      cleanUp(settings, stripeTenant.id)
    }
  }
}
