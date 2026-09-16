package fr.maif.daikoku.controllers

import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.domain.ThirdPartyPaymentSettings.StripeSettings
import fr.maif.daikoku.domain.ThirdPartySubscriptionInformations.StripeSubscriptionInformations
import fr.maif.daikoku.domain._
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import org.joda.time.DateTime
import org.scalatest.concurrent.{Eventually, IntegrationPatience}
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.{JsObject, JsValue, Json}
import play.api.libs.ws.DefaultBodyWritables.{
  writeableOf_String,
  writeableOf_urlEncodedSimpleForm
}
import play.api.libs.ws.{WSAuthScheme, WSResponse}

import java.nio.charset.StandardCharsets.UTF_8
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** Runs against real Stripe in test mode, dev only — same switches as
  * StripeE2ESpec. Events are posted to the webhook route signed the way Stripe
  * signs them, and the subscriptions they name are real ones on the account.
  */
class StripeWebhookSpec()
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with Eventually {

  private val maybeKey = sys.env.get("STRIPE_TEST_SECRET_KEY")
  private lazy val ws = daikokuComponents.env.wsClient
  private lazy val baseUrl = daikokuComponents.env.config.stripeUrl
  private lazy val version = daikokuComponents.env.config.stripeApiVersion

  private val settingsId = ThirdPartyPaymentSettingsId("stripe-webhook")
  private val webhookSecret = "whsec_test_daikoku"

  private val plan: UsagePlan = defaultApi.plans
    .find(_.customName == "Quotas Without Limits")
    .get
    .copy(otoroshiTarget =
      OtoroshiTarget(
        wiremockedOtoroshi,
        AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345"))).some
      ).some
    )

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

  private def stripeSettings(key: String): StripeSettings =
    StripeSettings(
      id = settingsId,
      name = "stripe",
      publicKey = "pk_test",
      secretKey = key,
      webhookSecret = webhookSecret.some
    )

  private def setupTenant(key: String): Tenant = {
    val stripeTenant =
      tenant.copy(thirdPartyPaymentSettings = Seq(stripeSettings(key)))
    setupEnvBlocking(
      tenants = Seq(stripeTenant),
      users = Seq(userAdmin),
      teams = Seq(teamOwner, teamConsumer),
      apis = Seq(defaultApi.api),
      usagePlans = defaultApi.plans.filterNot(_.id == plan.id) :+ plan
    )
    stripeTenant
  }

  private def stripeSignature(
      body: String,
      secret: String = webhookSecret,
      at: Long = System.currentTimeMillis() / 1000
  ): String = {
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(new SecretKeySpec(secret.getBytes(UTF_8), "HmacSHA256"))
    val digest = mac
      .doFinal(s"$at.$body".getBytes(UTF_8))
      .map("%02x".format(_))
      .mkString
    s"t=$at,v1=$digest"
  }

  private def deliver(
      tenant: Tenant,
      event: JsValue,
      signature: Option[String] = None
  ): WSResponse = {
    val body = Json.stringify(event)
    ws.url(s"http://127.0.0.1:$port/api/payment/${settingsId.value}/_webhook")
      .withHttpHeaders(
        "Host" -> tenant.domain,
        "Content-Type" -> "application/json",
        "Stripe-Signature" -> signature.getOrElse(stripeSignature(body))
      )
      .post(body)
      .futureValue
  }

  private def event(eventType: String, obj: JsValue): JsValue =
    Json.obj(
      "id" -> s"evt_${UUID.randomUUID()}",
      "type" -> eventType,
      "data" -> Json.obj("object" -> obj)
    )

  private def invoice(stripeSubscriptionId: String, amountDue: Long): JsValue =
    Json.obj(
      "object" -> "invoice",
      "currency" -> "eur",
      "amount_due" -> amountDue,
      "parent" -> Json.obj(
        "subscription_details" -> Json.obj(
          "subscription" -> stripeSubscriptionId
        )
      )
    )

  private def notifications(tenant: Tenant): Seq[Notification] =
    daikokuComponents.env.dataStore.notificationRepo
      .forTenant(tenant)
      .findAllNotDeleted()
      .futureValue

  private def payablePlan(
      tenant: Tenant,
      key: String
  ): PaymentSettings.Stripe = {
    val paymentSettings = daikokuComponents.paymentClient
      .createStripeProduct(defaultApi.api, plan)(stripeSettings(key))
      .value
      .futureValue
      .toOption
      .get
      .asInstanceOf[PaymentSettings.Stripe]
    daikokuComponents.env.dataStore.usagePlanRepo
      .forTenant(tenant)
      .save(plan.copy(paymentSettings = paymentSettings.some))
      .futureValue
    paymentSettings
  }

  private def stripeSubscription(
      priceId: String
  )(implicit key: String): (String, String) = {
    val customer = (stripe("/v1/customers")
      .post(Map("name" -> s"daikoku-webhook-${UUID.randomUUID()}"))
      .futureValue
      .json \ "id").as[String]
    val subscription = stripe("/v1/subscriptions")
      .post(
        Map(
          "customer" -> customer,
          "items[0][price]" -> priceId,
          "trial_period_days" -> "7"
        )
      )
      .futureValue
    withClue(subscription.body) { subscription.status mustBe 200 }
    (customer, (subscription.json \ "id").as[String])
  }

  private def daikokuSubscription(
      tenant: Tenant,
      stripeSubscriptionId: String,
      customerId: String,
      enabled: Boolean = true
  ): ApiSubscription = {
    val keyring = Keyring(
      id = KeyringId(s"webhook-${UUID.randomUUID()}"),
      tenant = tenant.id,
      team = teamConsumerId,
      customName = "webhook",
      apiKey = OtoroshiApiKey(
        clientName = "webhook-key",
        clientId = "webhook-client-id",
        clientSecret = "webhook-client-secret"
      ),
      otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(wiremockedOtoroshi),
      createdAt = DateTime.now(),
      rotation = None,
      integrationToken = "webhook-token",
      enabled = enabled
    )
    val subscription = ApiSubscription(
      id = ApiSubscriptionId(s"webhook-${UUID.randomUUID()}"),
      tenant = tenant.id,
      plan = plan.id,
      createdAt = DateTime.now(),
      team = teamConsumerId,
      api = defaultApi.api.id,
      by = userAdmin.id,
      customName = None,
      enabled = enabled,
      keyring = keyring.id,
      thirdPartySubscriptionInformations = StripeSubscriptionInformations(
        stripeSubscriptionId,
        customerId.some
      ).some
    )
    daikokuComponents.env.dataStore.keyringRepo
      .forTenant(tenant)
      .save(keyring)
      .futureValue
    daikokuComponents.env.dataStore.apiSubscriptionRepo
      .forTenant(tenant)
      .save(subscription)
      .futureValue
    subscription
  }

  private def currentPlan(tenant: Tenant): UsagePlan =
    daikokuComponents.env.dataStore.usagePlanRepo
      .forTenant(tenant)
      .findById(plan.id)
      .futureValue
      .get

  private def currentSubscription(
      tenant: Tenant,
      id: ApiSubscriptionId
  ): ApiSubscription =
    daikokuComponents.env.dataStore.apiSubscriptionRepo
      .forTenant(tenant)
      .findById(id)
      .futureValue
      .get

  private def cleanUp(
      tenant: Tenant,
      paymentSettings: PaymentSettings.Stripe,
      customerId: String
  )(implicit key: String): Unit = {
    daikokuComponents.paymentClient
      .deleteThirdPartyProduct(paymentSettings, tenant.id)
      .value
      .futureValue
      .isRight mustBe true
    stripe(s"/v1/customers/$customerId").delete().futureValue
  }

  "The Stripe webhook (#1150)" must {
    "reject a delivery whose signature does not match" in {
      val stripeTenant = setupTenant("sk_test_unused")
      val delivery = event("invoice.paid", invoice("sub_forged", 1000))
      val body = Json.stringify(delivery)

      deliver(
        stripeTenant,
        delivery,
        stripeSignature(body, secret = "whsec_other").some
      ).status mustBe 400
      deliver(
        stripeTenant,
        delivery,
        stripeSignature(body, at = System.currentTimeMillis() / 1000 - 3600).some
      ).status mustBe 400
      deliver(stripeTenant, delivery, "t=abc,v1=nope".some).status mustBe 400
      notifications(stripeTenant) mustBe empty
    }

    "refuse a delivery when no webhook secret is configured" in {
      val stripeTenant = tenant.copy(thirdPartyPaymentSettings =
        Seq(stripeSettings("sk_test_unused").copy(webhookSecret = None))
      )
      setupEnvBlocking(
        tenants = Seq(stripeTenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi.api),
        usagePlans = defaultApi.plans
      )

      deliver(
        stripeTenant,
        event("invoice.paid", invoice("sub_any", 1000))
      ).status mustBe 400
    }

    "acknowledge an event it does not handle" in {
      val stripeTenant = setupTenant("sk_test_unused")

      deliver(
        stripeTenant,
        event("customer.created", Json.obj("id" -> "cus_any"))
      ).status mustBe 200
    }

    "cut the key when the subscription is cancelled on Stripe's side" in {
      implicit val stripeKey: String = realStripeKey
      val stripeTenant = setupTenant(stripeKey)
      val paymentSettings = payablePlan(stripeTenant, stripeKey)
      val (customerId, stripeSubscriptionId) =
        stripeSubscription(paymentSettings.priceIds.basePriceId)
      val subscription =
        daikokuSubscription(stripeTenant, stripeSubscriptionId, customerId)
      stripe(s"/v1/subscriptions/$stripeSubscriptionId")
        .delete()
        .futureValue
        .status mustBe 200

      deliver(
        stripeTenant,
        event(
          "customer.subscription.deleted",
          Json.obj("id" -> stripeSubscriptionId, "object" -> "subscription")
        )
      ).status mustBe 200

      currentSubscription(stripeTenant, subscription.id).enabled mustBe false
      val cancelled = notifications(stripeTenant).map(_.action).collectFirst {
        case action: NotificationAction.SubscriptionCancellationScheduled =>
          action
      }.get
      cancelled.subscription mustBe subscription.id

      cleanUp(stripeTenant, paymentSettings, customerId)
    }

    "have real Stripe carry the new amounts, on the same product and meter" in {
      implicit val stripeKey: String = realStripeKey
      val stripeTenant = setupTenant(stripeKey)
      val before = payablePlan(stripeTenant, stripeKey)

      implicit val session: UserSession =
        loginWithBlocking(userAdmin, stripeTenant)

      def savePlan(updated: UsagePlan): WSResponse =
        httpJsonCallBlocking(
          path =
            s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/plan/${plan.id.value}",
          method = "PUT",
          body = updated.asJson.some
        )(using stripeTenant, session)

      val priced = currentPlan(stripeTenant)
      val raised = savePlan(priced.copy(costPerMonth = BigDecimal(42).some))
      withClue(raised.body) { raised.status mustBe 200 }

      val after = currentPlan(stripeTenant).paymentSettings.get
        .asInstanceOf[PaymentSettings.Stripe]
      after.priceIds.basePriceId must not be before.priceIds.basePriceId

      // read back what Stripe really holds, not what we believe we sent
      val base =
        stripe(s"/v1/prices/${after.priceIds.basePriceId}").get().futureValue
      withClue(base.body) { base.status mustBe 200 }
      (base.json \ "unit_amount").as[Long] mustBe 4200L
      (base.json \ "product").as[String] mustBe before.productId
      (base.json \ "currency").as[String] mustBe "eur"

      // the usage price still reads the counter that has been accumulating
      val metered = stripe(
        s"/v1/prices/${after.priceIds.additionalPriceId.get}"
      ).get().futureValue
      (metered.json \ "recurring" \ "meter").as[String] mustBe
        before.priceIds.meterId.get

      savePlan(
        currentPlan(stripeTenant).copy(currency = Currency("USD").some)
      ).status mustBe 400
      currentPlan(stripeTenant).currency mustBe Currency("EUR").some

      daikokuComponents.paymentClient
        .deleteThirdPartyProduct(after, stripeTenant.id)
        .value
        .futureValue
        .isRight mustBe true
    }

    "move a subscription onto the new prices when its invoice is finalized" in {
      implicit val stripeKey: String = realStripeKey
      val stripeTenant = setupTenant(stripeKey)
      val paymentSettings = payablePlan(stripeTenant, stripeKey)
      val (customerId, stripeSubscriptionId) =
        stripeSubscription(paymentSettings.priceIds.basePriceId)
      daikokuSubscription(stripeTenant, stripeSubscriptionId, customerId)

      val renewed = daikokuComponents.paymentClient
        .renewStripePrices(
          stripeTenant,
          plan.copy(costPerMonth = BigDecimal(20).some),
          paymentSettings
        )
        .value
        .futureValue
        .toOption
        .get
        .asInstanceOf[PaymentSettings.Stripe]

      // new prices, same product and same meter, so reporting is unaffected
      renewed.priceIds.basePriceId must not be paymentSettings.priceIds.basePriceId
      renewed.productId mustBe paymentSettings.productId
      renewed.priceIds.meterId mustBe paymentSettings.priceIds.meterId
      renewed.priceIds.meterEventName mustBe paymentSettings.priceIds.meterEventName

      daikokuComponents.env.dataStore.usagePlanRepo
        .forTenant(stripeTenant)
        .save(plan.copy(paymentSettings = renewed.some))
        .futureValue

      deliver(
        stripeTenant,
        event("invoice.finalized", invoice(stripeSubscriptionId, 2000))
      ).status mustBe 200

      val onStripe =
        stripe(s"/v1/subscriptions/$stripeSubscriptionId").get().futureValue
      val items = (onStripe.json \ "items" \ "data").as[Seq[JsValue]]

      // the item was updated in place: a second one would have Stripe bill the
      // monthly amount twice
      items.size mustBe 1
      (items.head \ "price" \ "id").as[String] mustBe renewed.priceIds.basePriceId

      cleanUp(stripeTenant, renewed, customerId)
    }

    "reactivate a cut key once an invoice is paid" in {
      implicit val stripeKey: String = realStripeKey
      val stripeTenant = setupTenant(stripeKey)
      val paymentSettings = payablePlan(stripeTenant, stripeKey)
      val (customerId, stripeSubscriptionId) =
        stripeSubscription(paymentSettings.priceIds.basePriceId)
      val subscription = daikokuSubscription(
        stripeTenant,
        stripeSubscriptionId,
        customerId,
        enabled = false
      )

      deliver(
        stripeTenant,
        event("invoice.paid", invoice(stripeSubscriptionId, 1000))
      ).status mustBe 200

      currentSubscription(stripeTenant, subscription.id).enabled mustBe true
      val onStripe =
        stripe(s"/v1/subscriptions/$stripeSubscriptionId").get().futureValue
      onStripe.status mustBe 200
      (onStripe.json \ "pause_collection").asOpt[JsObject] mustBe None

      cleanUp(stripeTenant, paymentSettings, customerId)
    }
  }
}
