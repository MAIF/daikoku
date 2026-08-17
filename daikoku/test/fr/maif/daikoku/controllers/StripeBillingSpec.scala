package fr.maif.daikoku.controllers

import cats.implicits.catsSyntaxOptionId
import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock
import com.github.tomakehurst.wiremock.client.WireMock._
import com.github.tomakehurst.wiremock.core.WireMockConfiguration._
import com.github.tomakehurst.wiremock.verification.LoggedRequest
import fr.maif.daikoku.domain.ThirdPartyPaymentSettings.StripeSettings
import fr.maif.daikoku.domain.ThirdPartySubscriptionInformations.StripeSubscriptionInformations
import fr.maif.daikoku.domain._
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import fr.maif.daikoku.utils.Cypher.encrypt
import org.scalatest.BeforeAndAfterEach
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.Json
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

  private val stripeSettings = StripeSettings(
    id = stripeSettingsId,
    name = "stripe",
    publicKey = "pk_test_public",
    secretKey = "sk_test_secret"
  )

  private val stripeTenant =
    tenant.copy(thirdPartyPaymentSettings = Seq(stripeSettings))

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

  private def setupTenantWithStripeAccount(): Unit =
    setupEnvBlocking(
      tenants = Seq(stripeTenant),
      users = Seq(userAdmin),
      teams = Seq(teamOwner, verifiedConsumer),
      apis = Seq(defaultApi.api),
      usagePlans = plans
    )

  private def makePlanPayable(): WSResponse = {
    implicit val session: UserSession =
      loginWithBlocking(userAdmin, stripeTenant)
    val api = defaultApi.api

    val response = httpJsonCallBlocking(
      path =
        s"/api/teams/${teamOwnerId.value}/apis/${api.id.value}/${api.currentVersion.value}/plan/${payPerUsePlan.id.value}/_payment",
      method = "PUT",
      body = Json
        .obj(
          "paymentSettings" -> Json.obj(
            "thirdPartyPaymentSettingsId" -> stripeSettingsId.value
          ),
          "costPerMonth" -> 10,
          "costPerRequest" -> 0.02,
          "billingDuration" -> Json.obj("value" -> 1, "unit" -> "Month"),
          "currency" -> Json.obj("code" -> "EUR")
        )
        .some
    )(using stripeTenant, session)

    withClue(s"_payment answered ${response.status}: ${response.body}") {
      response.status mustBe 200
    }
    response
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

  private def payCheckout(): WSResponse = {
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
  }

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
    payCheckout()
    currentSubscription()
  }

  private def consume(hits: Long): Unit = {
    stubOtoroshi(hits)
    daikokuComponents.statsJob
      .syncForSubscription(currentSubscription(), stripeTenant)
      .futureValue
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

    "stay silent when nothing new was consumed" in {
      subscribeAndPay()

      consume(hits = 250)
      consume(hits = 250)

      requestsTo("/v1/billing/meter_events").size mustBe 1
    }

    "never fall back on the usage records endpoint Stripe removed" in {
      subscribeAndPay()

      consume(hits = 250)

      verify(
        0,
        postRequestedFor(urlMatching("/v1/subscription_items/.*/usage_records"))
      )
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
}
