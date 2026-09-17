package fr.maif.daikoku.controllers

import cats.implicits.catsSyntaxOptionId
import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock
import com.github.tomakehurst.wiremock.client.WireMock._
import com.github.tomakehurst.wiremock.core.WireMockConfiguration._
import com.github.tomakehurst.wiremock.stubbing.Scenario
import com.github.tomakehurst.wiremock.verification.LoggedRequest
import fr.maif.daikoku.domain.ThirdPartyPaymentSettings.StripeSettings
import fr.maif.daikoku.domain.ThirdPartySubscriptionInformations.StripeSubscriptionInformations
import fr.maif.daikoku.domain._
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import fr.maif.daikoku.utils.Cypher.encrypt
import fr.maif.daikoku.utils.{IdGenerator, StripeSignature}
import org.joda.time.DateTime
import org.scalatest.BeforeAndAfterEach
import org.scalatest.concurrent.{Eventually, IntegrationPatience}
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.{JsNull, JsNumber, JsObject, JsValue, Json}
import play.api.libs.ws.DefaultBodyWritables.writeableOf_String
import play.api.libs.ws.WSResponse

import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import scala.jdk.CollectionConverters._

/** End-to-end guard for the Billing Meters migration (#1149/#1153), offline:
  * `daikoku.stripe.url` points at WireMock, so we replay the real Daikoku
  * routes and assert the shape of the requests we send to Stripe.
  */
class StripeBillingSpec()
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with Eventually
    with BeforeAndAfterEach {

  lazy val wireMockServer = new WireMockServer(wireMockConfig().port(stubPort))

  override def beforeEach(): Unit = {
    wireMockServer.start()
    WireMock.configureFor(stubHost, stubPort)
    wireMockServer.resetAll()
    stubStripe()
  }

  override def afterEach(): Unit = {
    wireMockServer.stop()
  }

  private val stripeSettingsId = ThirdPartyPaymentSettingsId("stripe-test")

  private val webhookSecret = "whsec_test"

  private val stripeSettings = StripeSettings(
    id = stripeSettingsId,
    name = "stripe",
    publicKey = "pk_test_public",
    secretKey = "sk_test_secret",
    webhookSecret = webhookSecret.some
  )

  private val stripeTenant =
    tenant.copy(
      thirdPartyPaymentSettings = Seq(stripeSettings),
      mailerSettings = SimpleSMTPSettings(
        host = "localhost",
        port = "1025",
        fromTitle = "Daikoku",
        fromEmail = "noreply@daikoku.io",
        template = None,
        username = None,
        password = None,
        starttls = false.some,
        ssl = false.some
      ).some
    )

  private val verifiedConsumer = teamConsumer.copy(verified = true)

  private val payPerUsePlan = defaultApi.plans
    .find(_.id == UsagePlanId("5"))
    .get
    .copy(otoroshiTarget =
      OtoroshiTarget(
        wiremockedOtoroshi,
        AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345"))).some
      ).some
    )

  private val plans =
    defaultApi.plans.filterNot(_.id == payPerUsePlan.id) :+ payPerUsePlan

  private val productId = "prod_test123"
  private val meterId = "mtr_test123"
  private val customerId = "cus_test123"
  private val checkoutSessionId = "cs_test123"
  private val subscriptionId = "sub_test123"

  private val otoroshiApiKey = ActualOtoroshiApiKey(
    clientId = "daikoku-stripe-client-id",
    clientSecret = "daikoku-stripe-client-secret",
    clientName = "daikoku-stripe-key",
    authorizedEntities =
      AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345"))),
    throttlingQuota = 100,
    dailyQuota = 1000,
    monthlyQuota = 10000,
    constrainedServicesOnly = true,
    tags = Set.empty[String],
    restrictions = ApiKeyRestrictions(),
    metadata = Map.empty,
    rotation = None,
    validUntil = None
  )

  private def fixture(name: String): String =
    scala.io.Source.fromResource(s"stripe/$name.json").mkString

  private def okJson(body: String) =
    aResponse()
      .withStatus(200)
      .withHeader("Content-Type", "application/json")
      .withBody(body)

  private def stubStripe(): Unit = {
    stubFor(
      post(urlEqualTo("/v1/products")).willReturn(okJson(fixture("products")))
    )
    stubFor(
      post(urlEqualTo("/v1/billing/meters")).willReturn(
        okJson(fixture("meters"))
      )
    )
    stubFor(
      post(urlEqualTo("/v1/prices")).willReturn(okJson(fixture("prices")))
    )
    stubFor(
      post(urlEqualTo("/v1/billing/meter_events")).willReturn(
        okJson(fixture("meter_events"))
      )
    )
    stubFor(
      get(urlPathEqualTo("/v1/customers/search")).willReturn(
        okJson(fixture("customers_search"))
      )
    )
    stubFor(
      post(urlEqualTo("/v1/checkout/sessions")).willReturn(
        okJson(fixture("checkout_sessions"))
      )
    )
    stubFor(
      get(urlEqualTo(s"/v1/checkout/sessions/$checkoutSessionId"))
        .willReturn(okJson(fixture("checkout_session")))
    )
    stubFor(
      get(urlEqualTo(s"/v1/subscriptions/$subscriptionId"))
        .willReturn(okJson(fixture("subscription")))
    )
    stubFor(
      post(urlMatching("/v1/prices/[^/]+"))
        .willReturn(okJson(fixture("prices")))
    )
    stubFor(
      post(urlMatching("/v1/products/[^/]+"))
        .willReturn(okJson(fixture("products")))
    )
    stubFor(
      post(urlEqualTo(s"/v1/billing/meters/$meterId/deactivate"))
        .willReturn(okJson(fixture("meters")))
    )
    stubFor(
      post(urlEqualTo("/v1/invoices/create_preview"))
        .willReturn(okJson(Json.stringify(Json.obj("amount_due" -> 1234))))
    )
    stubFor(
      get(urlPathEqualTo("/v1/invoices"))
        .willReturn(okJson(Json.stringify(Json.obj("data" -> Json.arr()))))
    )
  }

  private def stubOtoroshi(hits: Long): Unit = {
    stubFor(
      post(urlEqualTo("/apis/apim.otoroshi.io/v1/apikeys"))
        .willReturn(okJson(Json.stringify(otoroshiApiKey.asJson)))
    )
    stubFor(
      get(urlMatching("/api/stats.*"))
        .willReturn(
          okJson(Json.stringify(Json.obj("hits" -> Json.obj("count" -> hits))))
        )
    )
    stubFor(
      get(urlMatching("/api/apikeys/.*/quotas.*"))
        .willReturn(
          okJson(Json.stringify(ApiKeyQuotas(0, 0, 0, 0, 0, 0, 0, 0, 0).asJson))
        )
    )
  }

  private def requestsTo(path: String): Seq[LoggedRequest] =
    findAll(postRequestedFor(urlEqualTo(path))).asScala.toSeq

  private def formBodies(path: String): Seq[Map[String, String]] =
    requestsTo(path).map(request => parseForm(request.getBodyAsString))

  private def parseForm(body: String): Map[String, String] =
    body
      .split("&")
      .filter(_.nonEmpty)
      .map(pair =>
        pair.indexOf('=') match {
          case -1  => decode(pair) -> ""
          case idx => decode(pair.take(idx)) -> decode(pair.drop(idx + 1))
        }
      )
      .toMap

  private def decode(value: String): String =
    URLDecoder.decode(value, StandardCharsets.UTF_8)

  private lazy val startupSeedingSettled: Unit =
    eventually {
      daikokuComponents.env.dataStore.reportsInfoRepo
        .count()
        .futureValue must be > 0L
    }

  private def setupTenantWithStripeAccount(
      withAdminApi: Boolean = false
  ): Unit = {
    startupSeedingSettled
    setupEnvBlocking(
      tenants = Seq(stripeTenant),
      users = Seq(userAdmin),
      teams = Seq(teamOwner, verifiedConsumer) ++
        (if (withAdminApi) Seq(defaultAdminTeam) else Seq.empty),
      apis = Seq(defaultApi.api),
      usagePlans = plans,
      subscriptions =
        if (withAdminApi) Seq(adminApiSubscription) else Seq.empty,
      keyrings = if (withAdminApi) Seq(adminApiKeyring) else Seq.empty
    )
  }

  private def makePlanPayable(
      currency: String = "EUR",
      pricing: JsObject = Json.obj()
  ): WSResponse = {
    implicit val session: UserSession =
      loginWithBlocking(userAdmin, stripeTenant)
    val api = defaultApi.api

    val response = httpJsonCallBlocking(
      path =
        s"/api/teams/${teamOwnerId.value}/apis/${api.id.value}/${api.currentVersion.value}/plan/${payPerUsePlan.id.value}/_payment",
      method = "PUT",
      body = (Json.obj(
        "paymentSettings" -> Json.obj(
          "thirdPartyPaymentSettingsId" -> stripeSettingsId.value
        ),
        "costPerMonth" -> 10,
        "costPerRequest" -> 0.02,
        "currency" -> Json.obj("code" -> currency)
      ) ++ pricing).some
    )(using stripeTenant, session)

    withClue(s"_payment answered ${response.status}: ${response.body}") {
      response.status mustBe 200
    }
    response
  }

  private def producerPlan(): JsObject = {
    implicit val session: UserSession =
      loginWithBlocking(userAdmin, stripeTenant)
    val response = httpJsonCallBlocking(
      path =
        s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/plans/${payPerUsePlan.id.value}"
    )(using stripeTenant, session)
    withClue(response.body) { response.status mustBe 200 }
    response.json.as[JsObject]
  }

  private def saveProducerPlan(plan: JsObject): WSResponse = {
    implicit val session: UserSession =
      loginWithBlocking(userAdmin, stripeTenant)
    httpJsonCallBlocking(
      path =
        s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/plan/${payPerUsePlan.id.value}",
      method = "PUT",
      body = plan.some
    )(using stripeTenant, session)
  }

  private def subscribeToPlan(): WSResponse = {
    implicit val session: UserSession =
      loginWithBlocking(userAdmin, stripeTenant)

    httpJsonCallBlocking(
      path =
        s"/api/apis/${defaultApi.api.id.value}/plan/${payPerUsePlan.id.value}/team/${teamConsumerId.value}/_subscribe",
      method = "POST",
      body = Json.obj().some
    )(using stripeTenant, session)
  }

  private def resumePayment(): WSResponse = {
    implicit val session: UserSession =
      loginWithBlocking(userAdmin, stripeTenant)

    httpJsonCallBlocking(
      path =
        s"/api/subscription/team/${teamConsumerId.value}/demands/${pendingDemandId()}/_run"
    )(using stripeTenant, session)
  }

  private def checkoutNotifications(): Seq[Notification] =
    daikokuComponents.env.dataStore.notificationRepo
      .forTenant(stripeTenant)
      .findNotDeleted(Json.obj("action.type" -> "CheckoutForSubscription"))
      .futureValue

  private def sentMails(): Seq[JsValue] =
    daikokuComponents.env.wsClient
      .url("http://localhost:1080/api/emails")
      .get()
      .futureValue
      .json
      .as[Seq[JsValue]]

  private def pendingDemandId(): String =
    daikokuComponents.env.dataStore.subscriptionDemandRepo
      .forTenant(stripeTenant)
      .findAllNotDeleted()
      .futureValue
      .head
      .id
      .value

  private def payCheckout(demandId: String = pendingDemandId()): WSResponse = {
    val body = Json.stringify(
      Json.obj(
        "id" -> s"evt_${IdGenerator.token(16)}",
        "type" -> "checkout.session.completed",
        "data" -> Json.obj(
          "object" -> Json.obj(
            "id" -> checkoutSessionId,
            "metadata" -> Json.obj("subscription_demand" -> demandId)
          )
        )
      )
    )
    val at = System.currentTimeMillis() / 1000

    daikokuComponents.env.wsClient
      .url(
        s"http://127.0.0.1:$port/api/payment/${stripeSettingsId.value}/_webhook"
      )
      .withHttpHeaders(
        "Host" -> stripeTenant.domain,
        "Content-Type" -> "application/json",
        "Stripe-Signature" ->
          s"t=$at,v1=${StripeSignature.sign(webhookSecret, s"$at.$body")}"
      )
      .post(body)
      .futureValue
  }

  private val periodEnd = 1790812800L

  private def stripeSubscription(
      itemPrice: String = "price_test123",
      cancelAtPeriodEnd: Boolean = false
  ): JsObject =
    Json.obj(
      "id" -> subscriptionId,
      "object" -> "subscription",
      "customer" -> customerId,
      "status" -> "active",
      "cancel_at_period_end" -> cancelAtPeriodEnd,
      "cancel_at" -> (if (cancelAtPeriodEnd) JsNumber(periodEnd) else JsNull),
      "items" -> Json.obj(
        "data" -> Json.arr(
          Json.obj(
            "id" -> "si_base",
            "price" -> Json.obj("id" -> itemPrice),
            "current_period_end" -> periodEnd
          )
        )
      )
    )

  private def stripeSubscriptionIs(subscription: JsObject): Unit =
    stubFor(
      get(urlEqualTo(s"/v1/subscriptions/$subscriptionId"))
        .willReturn(okJson(Json.stringify(subscription)))
    )

  private def billingState(): JsValue = {
    implicit val session: UserSession =
      loginWithBlocking(userAdmin, stripeTenant)
    val response = httpJsonCallBlocking(
      path = s"/api/teams/${teamConsumerId.value}/billing/subscriptions"
    )(using stripeTenant, session)

    withClue(response.body) { response.status mustBe 200 }
    response.json.as[Seq[JsValue]].head
  }

  private def subscriptions(): Seq[ApiSubscription] =
    daikokuComponents.env.dataStore.apiSubscriptionRepo
      .forTenant(stripeTenant)
      .findAllNotDeleted()
      .futureValue

  private def currentSubscription(): ApiSubscription =
    daikokuComponents.env.dataStore.apiSubscriptionRepo
      .forTenant(stripeTenant)
      .findAllNotDeleted()
      .futureValue
      .head

  private def currentPlan(): UsagePlan =
    daikokuComponents.env.dataStore.usagePlanRepo
      .forTenant(stripeTenant)
      .findById(payPerUsePlan.id)
      .futureValue
      .get

  private def currentConsumption(): ApiKeyConsumption =
    daikokuComponents.env.dataStore.consumptionRepo
      .forTenant(stripeTenant)
      .findAllNotDeleted()
      .futureValue
      .head

  private def subscribeAndPay(): ApiSubscription = {
    setupTenantWithStripeAccount()
    stubOtoroshi(hits = 0)
    makePlanPayable()
    subscribeToPlan().status mustBe 200
    payCheckout().status mustBe 200
    currentSubscription()
  }

  private def archiveStripeProduct(): Either[AppError, JsValue] =
    daikokuComponents.paymentClient
      .deleteThirdPartyProduct(
        currentPlan().paymentSettings.get,
        stripeTenant.id
      )
      .value
      .futureValue

  private def consume(hits: Long): Unit = {
    stubOtoroshi(hits)
    daikokuComponents.statsJob
      .syncForSubscription(currentSubscription(), stripeTenant)
      .futureValue
  }

  "confirming a checkout (#1221)" must {
    "materialise the subscription only once Stripe says the checkout is paid" in {
      setupTenantWithStripeAccount()
      stubOtoroshi(hits = 0)
      makePlanPayable()
      subscribeToPlan().status mustBe 200
      subscriptions() mustBe empty

      payCheckout().status mustBe 200

      subscriptions().map(_.thirdPartySubscriptionInformations) mustBe Seq(
        StripeSubscriptionInformations(subscriptionId, customerId.some).some
      )
    }

    "apply a redelivered confirmation only once" in {
      setupTenantWithStripeAccount()
      stubOtoroshi(hits = 0)
      makePlanPayable()
      subscribeToPlan().status mustBe 200
      val demandId = pendingDemandId()

      payCheckout(demandId).status mustBe 200
      payCheckout(demandId).status mustBe 200

      subscriptions().size mustBe 1
    }

    "open a fresh checkout session when the payment is resumed" in {
      setupTenantWithStripeAccount()
      stubOtoroshi(hits = 0)
      makePlanPayable()
      subscribeToPlan().status mustBe 200

      val resumed = resumePayment()
      withClue(resumed.body) { resumed.status mustBe 200 }

      val checkouts = requestsTo("/v1/checkout/sessions")
      checkouts.size mustBe 2
      checkouts.map(_.getHeader("Idempotency-Key")).distinct.size mustBe 2
      formBodies("/v1/checkout/sessions")
        .map(_.get("cancel_url"))
        .distinct
        .size mustBe 2
    }

    "leave the requester of a single-step demand a way back to the payment, until it is paid" in {
      setupTenantWithStripeAccount()
      stubOtoroshi(hits = 0)
      makePlanPayable()
      cleanMailerServer(1080).futureValue
      subscribeToPlan().status mustBe 200
      resumePayment().status mustBe 200

      sentMails() mustBe empty

      val pending = checkoutNotifications()
      pending.map(_.team) mustBe Seq(teamConsumerId.some)
      pending.map(_.status.status) mustBe Seq("Pending")

      payCheckout().status mustBe 200

      checkoutNotifications().map(_.status.status) mustBe Seq("Accepted")
    }

    "send the acceptation once to a requester who administers the team, with a link to its api keys" in {
      setupTenantWithStripeAccount()
      stubOtoroshi(hits = 0)
      makePlanPayable()
      subscribeToPlan().status mustBe 200
      cleanMailerServer(1080).futureValue

      payCheckout().status mustBe 200

      val link =
        s"/${teamOwner.humanReadableId}/${defaultApi.api.humanReadableId}/${defaultApi.api.currentVersion.value}/apikeys?team=${teamConsumerId.value}"
      eventually {
        val mails = sentMails()
        mails.map(mail => (mail \ "to" \ "text").as[String]) mustBe Seq(
          userAdmin.email
        )
        (mails.head \ "html").as[String] must include(link)
      }
    }

    "never materialise a paid subscription from the validation link alone" in {
      setupTenantWithStripeAccount()
      stubOtoroshi(hits = 0)
      makePlanPayable()
      subscribeToPlan().status mustBe 200
      implicit val session: UserSession =
        loginWithBlocking(userAdmin, stripeTenant)

      val validator = daikokuComponents.env.dataStore.stepValidatorRepo
        .forTenant(stripeTenant)
        .findAllNotDeleted()
        .futureValue
        .head
      val token = encrypt(
        daikokuComponents.env.config.cypherSecret,
        validator.token,
        stripeTenant
      )

      httpJsonCallBlocking(
        path =
          s"/api/subscription/_validate?token=$token&session_id=$checkoutSessionId"
      )(using stripeTenant, session)

      subscriptions() mustBe empty
    }

    "acknowledge a checkout that matches no pending payment" in {
      setupTenantWithStripeAccount()

      payCheckout(demandId = "unknown-demand").status mustBe 200

      subscriptions() mustBe empty
    }
  }

  "the billing state of a subscription (#1231)" must {
    "carry the next charge Stripe previews and the end of the running period" in {
      subscribeAndPay()
      stripeSubscriptionIs(stripeSubscription())

      val state = billingState()

      (state \ "legacy").as[Boolean] mustBe false
      (state \ "nextCharge").as[BigDecimal] mustBe BigDecimal("12.34")
      (state \ "periodEnd").as[Long] mustBe periodEnd * 1000
      (state \ "cancelAt").get mustBe JsNull
      (state \ "unpaid").get mustBe JsNull
      (state \ "priceChange").get mustBe JsNull
    }

    "carry a cancellation that takes effect at the end of the period" in {
      subscribeAndPay()
      stripeSubscriptionIs(stripeSubscription(cancelAtPeriodEnd = true))

      (billingState() \ "cancelAt").as[Long] mustBe periodEnd * 1000
    }

    "count an unpaid invoice from the day it was issued, and cut the key thirty days later" in {
      subscribeAndPay()
      stripeSubscriptionIs(stripeSubscription())
      val issuedAt = DateTime.now().minusDays(5).getMillis / 1000
      stubFor(
        get(urlPathEqualTo("/v1/invoices")).willReturn(
          okJson(
            Json.stringify(
              Json.obj(
                "data" -> Json.arr(
                  Json.obj("created" -> issuedAt, "amount_due" -> 1000)
                )
              )
            )
          )
        )
      )

      val unpaid = billingState() \ "unpaid"

      (unpaid \ "since").as[Long] mustBe issuedAt * 1000
      (unpaid \ "amount").as[BigDecimal] mustBe BigDecimal(10)
      (unpaid \ "cutAt").as[Long] mustBe
        new DateTime(issuedAt * 1000).plusDays(30).getMillis
    }

    "announce the amounts of the plan while the subscription still carries the old prices" in {
      subscribeAndPay()
      stripeSubscriptionIs(stripeSubscription(itemPrice = "price_old"))

      val change = billingState() \ "priceChange"

      (change \ "costPerMonth").as[BigDecimal] mustBe BigDecimal(10)
      (change \ "costPerRequest").as[BigDecimal] mustBe BigDecimal("0.02")
      (change \ "effectiveAt").as[Long] mustBe periodEnd * 1000
    }

    "show a subscription without a Stripe customer as legacy, without asking Stripe" in {
      val subscription = subscribeAndPay()
      daikokuComponents.env.dataStore.apiSubscriptionRepo
        .forTenant(stripeTenant)
        .save(
          subscription.copy(thirdPartySubscriptionInformations =
            StripeSubscriptionInformations(subscriptionId, None).some
          )
        )
        .futureValue
      wireMockServer.resetRequests()

      (billingState() \ "legacy").as[Boolean] mustBe true
      verify(0, getRequestedFor(urlPathMatching("/v1/subscriptions/.*")))
    }
  }

  "setting up payment on a pay-per-use plan" must {
    "define a meter summing the values we report, per customer" in {
      setupTenantWithStripeAccount()

      makePlanPayable()

      val meter = formBodies("/v1/billing/meters").head
      meter("default_aggregation[formula]") mustBe "sum"
      meter("customer_mapping[type]") mustBe "by_id"
      meter("customer_mapping[event_payload_key]") mustBe "stripe_customer_id"
      meter("value_settings[event_payload_key]") mustBe "value"
    }

    "send the amount in the smallest unit of the currency, which has no cents for JPY" in {
      setupTenantWithStripeAccount()

      makePlanPayable(currency = "JPY")

      val base = formBodies("/v1/prices")
        .find(!_.contains("recurring[usage_type]"))
        .get
      base("unit_amount") mustBe "10"
    }

    "price the usage through that meter, never through the removed aggregate_usage" in {
      setupTenantWithStripeAccount()

      makePlanPayable()

      val metered = formBodies("/v1/prices")
        .find(_.get("recurring[usage_type]").contains("metered"))
        .get
      metered("recurring[meter]") mustBe meterId
      metered.keys must not contain "recurring[aggregate_usage]"
    }
  }

  "subscribing to a paid plan" must {
    "carry the Stripe customer over to the subscription, so usage can be billed to someone" in {
      val subscription = subscribeAndPay()

      subscription.thirdPartySubscriptionInformations mustBe Some(
        StripeSubscriptionInformations(subscriptionId, customerId.some)
      )
    }
  }

  "reporting consumption to Stripe" must {
    "send the delta since the last report, because the meter sums what it receives" in {
      subscribeAndPay()

      consume(hits = 250)
      consume(hits = 400)

      formBodies("/v1/billing/meter_events")
        .map(_("payload[value]")) mustBe Seq("250", "150")
    }

    "bill the customer carried by the subscription, through the meter of the plan" in {
      subscribeAndPay()
      val eventName = (currentPlan().paymentSettings.get
        .asInstanceOf[PaymentSettings.Stripe]
        .priceIds
        .meterEventName)
        .get

      consume(hits = 250)

      val event = formBodies("/v1/billing/meter_events").head
      event("payload[stripe_customer_id]") mustBe customerId
      event("event_name") mustBe eventName
    }

    "identify each delta so a retry cannot bill it twice" in {
      subscribeAndPay()
      val consumptionId = { consume(hits = 250); currentConsumption().id.value }

      consume(hits = 400)

      formBodies("/v1/billing/meter_events")
        .map(_("identifier")) mustBe Seq(
        s"$consumptionId-0",
        s"$consumptionId-250"
      )
    }

    "count a delta Stripe already holds as reported" in {
      subscribeAndPay()
      stubFor(
        post(urlEqualTo("/v1/billing/meter_events")).willReturn(
          aResponse()
            .withStatus(400)
            .withBody(
              """{"error":{"message":"An event already exists with identifier e2e-250.","type":"invalid_request_error"}}"""
            )
        )
      )

      consume(hits = 250)

      currentConsumption().lastReportedHits mustBe 250
    }

    "stay silent when nothing new was consumed" in {
      subscribeAndPay()

      consume(hits = 250)
      consume(hits = 250)

      requestsTo("/v1/billing/meter_events").size mustBe 1
    }

    "not mark usage as reported when the Stripe account cannot be resolved" in {
      subscribeAndPay()
      daikokuComponents.env.dataStore.tenantRepo
        .save(stripeTenant.copy(thirdPartyPaymentSettings = Seq.empty))
        .futureValue

      consume(hits = 250)

      requestsTo("/v1/billing/meter_events") mustBe empty
      currentConsumption().lastReportedHits mustBe 0
    }

    "retry a rate-limited report rather than losing the delta" in {
      subscribeAndPay()
      stubFor(
        post(urlEqualTo("/v1/billing/meter_events"))
          .inScenario("rate limit")
          .whenScenarioStateIs(Scenario.STARTED)
          .willSetStateTo("accepted")
          .willReturn(aResponse().withStatus(429).withBody("{}"))
      )
      stubFor(
        post(urlEqualTo("/v1/billing/meter_events"))
          .inScenario("rate limit")
          .whenScenarioStateIs("accepted")
          .willReturn(okJson(fixture("meter_events")))
      )

      consume(hits = 250)

      requestsTo("/v1/billing/meter_events").size mustBe 2
      currentConsumption().lastReportedHits mustBe 250
    }

    "never fall back on the usage records endpoint Stripe removed" in {
      subscribeAndPay()

      consume(hits = 250)

      verify(
        0,
        postRequestedFor(urlMatching("/v1/subscription_items/.*/usage_records"))
      )
    }

    "anchor the billing cycle on the 1st and never open a trial" in {
      subscribeAndPay()

      val checkout = formBodies("/v1/checkout/sessions").head

      checkout.get(
        "subscription_data[billing_cycle_anchor_config][day_of_month]"
      ) mustBe Some("1")
      // Stripe prorates the partial first month by itself, so the absence of
      // proration_behavior is the proration.
      checkout.get("subscription_data[proration_behavior]") mustBe None
      checkout.keys.filter(_.contains("trial")) mustBe empty
      checkout.get("recurring[interval]") mustBe None

      formBodies("/v1/prices").foreach(
        _.get("recurring[interval]") mustBe Some("month")
      )
    }

    "let the amounts of a priced plan change, but never its currency" in {
      setupTenantWithStripeAccount()
      stubOtoroshi(hits = 0)
      makePlanPayable()

      implicit val session: UserSession =
        loginWithBlocking(userAdmin, stripeTenant)

      def savePlan(plan: UsagePlan): WSResponse =
        httpJsonCallBlocking(
          path =
            s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/plan/${payPerUsePlan.id.value}",
          method = "PUT",
          body = plan.asJson.some
        )(using stripeTenant, session)

      val priced = currentPlan()

      val raised = savePlan(priced.copy(costPerMonth = BigDecimal(42).some))
      withClue(raised.body) { raised.status mustBe 200 }

      val otherCurrency = savePlan(priced.copy(currency = Currency("USD").some))
      otherCurrency.status mustBe 400

      // the raise rebuilt the prices on the product and the meter the plan
      // already owned, so usage keeps being reported to the same counter
      val settings =
        currentPlan().paymentSettings.get.asInstanceOf[PaymentSettings.Stripe]
      settings.productId mustBe productId
      settings.priceIds.meterId mustBe meterId.some
      currentPlan().currency mustBe Currency("EUR").some
    }

    "keep the payment as the last step of a priced plan" in {
      setupTenantWithStripeAccount()
      stubOtoroshi(hits = 0)
      makePlanPayable()

      implicit val session: UserSession =
        loginWithBlocking(userAdmin, stripeTenant)

      def saveSteps(steps: Seq[ValidationStep]): WSResponse =
        httpJsonCallBlocking(
          path =
            s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/plan/${payPerUsePlan.id.value}",
          method = "PUT",
          body = currentPlan()
            .copy(subscriptionProcess = SubscriptionProcess(steps))
            .asJson
            .some
        )(using stripeTenant, session)

      val steps = currentPlan().subscriptionProcess.steps
      val teamAdmin =
        ValidationStep.TeamAdmin(IdGenerator.token(32), teamOwnerId)

      saveSteps(steps :+ teamAdmin).status mustBe 400
      saveSteps(steps.filterNot(_.name == "payment")).status mustBe 400

      currentPlan().subscriptionProcess.steps.last.name mustBe "payment"
    }

    "never let a priced plan go back to free" in {
      setupTenantWithStripeAccount(withAdminApi = true)
      stubOtoroshi(hits = 0)
      makePlanPayable()

      implicit val session: UserSession =
        loginWithBlocking(userAdmin, stripeTenant)
      val backToFree = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/plan/${payPerUsePlan.id.value}/_payment",
        method = "PUT",
        body = Json.obj().some
      )(using stripeTenant, session)
      backToFree.status mustBe 400

      val plan = httpJsonCallWithoutSessionBlocking(
        path = s"/admin-api/usage-plans/${payPerUsePlan.id.value}",
        headers = adminApiAuthorization
      )(using stripeTenant)
      withClue(plan.body) { plan.status mustBe 200 }
      (plan.json \ "paymentSettings" \ "productId").as[String] mustBe productId
      (plan.json \ "costPerMonth").as[BigDecimal] mustBe BigDecimal(10)
    }

    "tell whether payment is enabled, with the details for a tenant admin only" in {
      startupSeedingSettled
      setupEnvBlocking(
        tenants = Seq(stripeTenant),
        users = Seq(userAdmin, tenantAdmin),
        teams = Seq(teamOwner, verifiedConsumer, defaultAdminTeam)
      )

      def paymentEnabledAs(user: User): WSResponse = {
        val session = loginWithBlocking(user, stripeTenant)
        httpJsonCallBlocking(path = "/api/payment/_enabled")(using
          stripeTenant,
          session
        )
      }

      val asTenantAdmin = paymentEnabledAs(tenantAdmin)
      asTenantAdmin.status mustBe 400
      (asTenantAdmin.json \ "missing").as[Seq[String]] mustBe Seq(
        "DAIKOKU_STATS_SYNC_CRON",
        "DAIKOKU_STRIPE_RECONCILIATION_CRON"
      )

      val asProducer = paymentEnabledAs(userAdmin)
      asProducer.status mustBe 400
      (asProducer.json \ "missing").toOption mustBe None
    }

    "price a plan only through a payment account of the tenant" in {
      setupTenantWithStripeAccount(withAdminApi = true)

      implicit val session: UserSession =
        loginWithBlocking(userAdmin, stripeTenant)
      def pricePlan(paymentSettings: JsObject): WSResponse =
        httpJsonCallBlocking(
          path =
            s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/plan/${payPerUsePlan.id.value}/_payment",
          method = "PUT",
          body = (Json.obj(
            "costPerMonth" -> 10,
            "currency" -> Json.obj("code" -> "EUR")
          ) ++ paymentSettings).some
        )(using stripeTenant, session)

      pricePlan(Json.obj()).status mustBe 400
      pricePlan(
        Json.obj(
          "paymentSettings" -> Json.obj("thirdPartyPaymentSettingsId" -> "unknown")
        )
      ).status mustBe 400

      val plan = httpJsonCallWithoutSessionBlocking(
        path = s"/admin-api/usage-plans/${payPerUsePlan.id.value}",
        headers = adminApiAuthorization
      )(using stripeTenant)
      withClue(plan.body) { plan.status mustBe 200 }
      (plan.json \ "paymentSettings").asOpt[JsObject] mustBe None
      (plan.json \ "costPerMonth").as[BigDecimal] mustBe BigDecimal(0.02)
      requestsTo("/v1/products") mustBe empty
    }

    "pin the Stripe API version on every call, so accounts cannot drift apart" in {
      subscribeAndPay()

      consume(hits = 250)

      val calls = requestsTo("/v1/billing/meters") ++
        requestsTo("/v1/prices") ++
        requestsTo("/v1/checkout/sessions") ++
        requestsTo("/v1/billing/meter_events")

      calls must not be empty
      calls.foreach(
        _.getHeader("Stripe-Version") mustBe
          daikokuComponents.env.config.stripeApiVersion
      )
    }
  }

  "separating the included requests from the monthly limit" must {
    def usagePrice(): Map[String, String] =
      formBodies("/v1/prices").find(_.contains("recurring[meter]")).get

    "charge only the requests beyond the included ones" in {
      setupTenantWithStripeAccount()
      stubOtoroshi(hits = 0)
      makePlanPayable(pricing = Json.obj("includedRequestsPerMonth" -> 1000))

      usagePrice().get("tiers[0][up_to]") mustBe Some("1000")
      usagePrice().get("tiers[0][unit_amount]") mustBe Some("0")
      usagePrice().get("tiers[1][up_to]") mustBe Some("inf")
      usagePrice().get("tiers[1][unit_amount]") mustBe Some("2")
    }

    "price the usage at zero rather than leave it out, so a cost per request can come later" in {
      setupTenantWithStripeAccount()
      stubOtoroshi(hits = 0)
      makePlanPayable(pricing = Json.obj("costPerRequest" -> JsNull))

      requestsTo("/v1/billing/meters").size mustBe 1
      usagePrice().get("unit_amount") mustBe Some("0")
    }

    "keep the included requests within the monthly limit" in {
      setupTenantWithStripeAccount()
      stubOtoroshi(hits = 0)
      saveProducerPlan(producerPlan() ++ Json.obj("maxPerMonth" -> 500)).status mustBe 200

      implicit val session: UserSession =
        loginWithBlocking(userAdmin, stripeTenant)
      val aboveLimit = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/plan/${payPerUsePlan.id.value}/_payment",
        method = "PUT",
        body = Json
          .obj(
            "paymentSettings" -> Json.obj(
              "thirdPartyPaymentSettingsId" -> stripeSettingsId.value
            ),
            "costPerMonth" -> 10,
            "costPerRequest" -> 0.02,
            "includedRequestsPerMonth" -> 1000,
            "currency" -> Json.obj("code" -> "EUR")
          )
          .some
      )(using stripeTenant, session)
      aboveLimit.status mustBe 400

      makePlanPayable(pricing = Json.obj("includedRequestsPerMonth" -> 500))

      saveProducerPlan(
        producerPlan() ++ Json.obj("includedRequestsPerMonth" -> 800)
      ).status mustBe 400
    }

    "retire the previous prices at once while nobody is subscribed" in {
      setupTenantWithStripeAccount()
      stubOtoroshi(hits = 0)
      makePlanPayable()

      val raised = saveProducerPlan(producerPlan() ++ Json.obj("costPerMonth" -> 42))
      withClue(raised.body) { raised.status mustBe 200 }

      formBodies("/v1/prices/price_test123").map(_.get("active")) mustBe Seq(
        Some("false"),
        Some("false")
      )
      requestsTo(s"/v1/billing/meters/$meterId/deactivate") mustBe empty
    }

    "keep the previous prices while a team is subscribed" in {
      subscribeAndPay()

      val raised = saveProducerPlan(producerPlan() ++ Json.obj("costPerMonth" -> 42))
      withClue(raised.body) { raised.status mustBe 200 }

      requestsTo("/v1/prices/price_test123") mustBe empty
    }
  }

  "archiving the Stripe product of a plan" must {
    "deactivate the meter along with the prices, so it stops counting" in {
      subscribeAndPay()

      archiveStripeProduct().isRight mustBe true

      requestsTo(s"/v1/billing/meters/$meterId/deactivate").size mustBe 1
    }

    "tolerate a meter Stripe already deactivated" in {
      subscribeAndPay()
      stubFor(
        post(urlEqualTo(s"/v1/billing/meters/$meterId/deactivate"))
          .willReturn(aResponse().withStatus(404).withBody("{}"))
      )

      archiveStripeProduct().isRight mustBe true
    }
  }
}
