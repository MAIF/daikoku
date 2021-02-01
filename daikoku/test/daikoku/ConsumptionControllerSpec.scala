package daikoku

import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock
import com.github.tomakehurst.wiremock.client.WireMock._
import com.github.tomakehurst.wiremock.core.WireMockConfiguration._
import com.typesafe.config.ConfigFactory
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.tests.utils.{
  DaikokuSpecHelper,
  OneServerPerSuiteWithMyComponents
}
import org.joda.time.DateTime
import org.scalatest.BeforeAndAfterEach
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import play.api.{Configuration, Logger}
import play.api.libs.json.{JsArray, JsObject, Json}

import scala.util.Random

class ConsumptionControllerSpec()
    extends PlaySpec
    with OneServerPerSuiteWithMyComponents
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfterEach {

  lazy val wireMockServer = new WireMockServer(wireMockConfig().port(stubPort))
  override def beforeEach(): Unit = {
    wireMockServer.start()
    WireMock.configureFor(stubHost, stubPort)
  }

  override def afterEach(): Unit = {
    wireMockServer.stop()
  }

  val payPerUsePlanId: UsagePlanId = UsagePlanId("5")
  val payperUserSub: ApiSubscription = ApiSubscription(
    id = ApiSubscriptionId("test"),
    tenant = tenant.id,
    apiKey = OtoroshiApiKey("name", "id", "secret"),
    plan = payPerUsePlanId,
    createdAt = DateTime.now(),
    team = teamConsumerId,
    api = defaultApi.id,
    by = userTeamAdminId,
    customName = None,
    rotation = None,
    integrationToken = "token"
  )

  val yesterdayConsumption: ApiKeyConsumption = ApiKeyConsumption(
    id = MongoId("test"),
    tenant = tenant.id,
    team = teamConsumerId,
    api = defaultApi.id,
    plan = payPerUsePlanId,
    clientId = payperUserSub.apiKey.clientId,
    hits = 1000L,
    globalInformations = ApiKeyGlobalConsumptionInformations(
      1000L,
      100,
      200,
      None,
      None
    ),
    quotas = ApiKeyQuotas(
      authorizedCallsPerSec = 10000,
      authorizedCallsPerDay = 10000,
      authorizedCallsPerMonth = 10000,
      currentCallsPerSec = 1000,
      remainingCallsPerSec = 9000,
      currentCallsPerDay = 1000,
      remainingCallsPerDay = 9000,
      currentCallsPerMonth = 1000,
      remainingCallsPerMonth = 9000
    ),
    billing = ApiKeyBilling(1000, BigDecimal(30)),
    from = DateTime.now().minusDays(1).withTimeAtStartOfDay(),
    to = DateTime.now().withTimeAtStartOfDay()
  )

  "a team admin" can {
    "get otoroshi group consumption" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        subscriptions = Seq(payperUserSub),
        consumptions = Seq(
          yesterdayConsumption
        )
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val from = DateTime.now().minusDays(1).withTimeAtStartOfDay().getMillis
      val to = DateTime.now().withTimeAtStartOfDay().getMillis
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}/plan/${payPerUsePlanId.value}/consumption?from=$from&to=$to"
      )(tenant, session)
      resp.status mustBe 200
      val eventualConsumptions =
        fr.maif.otoroshi.daikoku.domain.json.SeqConsumptionFormat
          .reads(resp.json.as[JsArray])
      eventualConsumptions.isSuccess mustBe true

      eventualConsumptions.get.length mustBe 1
      eventualConsumptions.get.head.hits mustBe 1000L
    }

    "get api consumption" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        subscriptions = Seq(payperUserSub),
        consumptions = Seq(
          yesterdayConsumption
        )
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val from = DateTime.now().minusDays(1).withTimeAtStartOfDay().getMillis
      val to = DateTime.now().withTimeAtStartOfDay().getMillis
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}/consumption?from=$from&to=$to"
      )(tenant, session)
      resp.status mustBe 200
      val eventualConsumptions =
        fr.maif.otoroshi.daikoku.domain.json.SeqConsumptionFormat
          .reads(resp.json.as[JsArray])
      eventualConsumptions.isSuccess mustBe true

      eventualConsumptions.get.length mustBe 1
      eventualConsumptions.get.head.hits mustBe 1000L
    }

    "get team consumption" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        subscriptions = Seq(payperUserSub),
        consumptions = Seq(
          yesterdayConsumption
        )
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val from = DateTime.now().minusDays(1).withTimeAtStartOfDay().getMillis
      val to = DateTime.now().withTimeAtStartOfDay().getMillis
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/consumptions?from=$from&to=$to"
      )(tenant, session)
      resp.status mustBe 200
      val eventualConsumptions =
        fr.maif.otoroshi.daikoku.domain.json.SeqConsumptionFormat
          .reads(resp.json)
      eventualConsumptions.isSuccess mustBe true

      eventualConsumptions.get.length mustBe 1
      eventualConsumptions.get.head.hits mustBe 1000L
    }

    "get team income" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        subscriptions = Seq(payperUserSub),
        consumptions = Seq(
          yesterdayConsumption
        )
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val from = DateTime.now().minusDays(1).withTimeAtStartOfDay().getMillis
      val to = DateTime.now().withTimeAtStartOfDay().getMillis
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/income?from=$from&to=$to"
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ 0 \ "billing" \ "total").as[BigDecimal] mustBe BigDecimal(30)
    }

    "get team billings" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        subscriptions = Seq(payperUserSub),
        consumptions = Seq(
          yesterdayConsumption
        )
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val from = DateTime.now().minusDays(1).withTimeAtStartOfDay().getMillis
      val to = DateTime.now().withTimeAtStartOfDay().getMillis
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/billings?from=$from&to=$to"
      )(tenant, session)
      resp.status mustBe 200

      (resp.json \ 0 \ "billing" \ "total").as[BigDecimal] mustBe BigDecimal(30)

    }

    "sync apikey consumption" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        subscriptions = Seq(payperUserSub),
        consumptions = Seq(
          yesterdayConsumption
        )
      )

      val plan =
        defaultApi.possibleUsagePlans.find(p => p.id == payPerUsePlanId).get
      val otoroshiTarget = plan.otoroshiTarget

      val callPerSec = 100L
      val callPerDay = 1000L
      val callPerMonth = 2000L

      val otoApiKey = ActualOtoroshiApiKey(
        clientId = payperUserSub.apiKey.clientId,
        clientSecret = payperUserSub.apiKey.clientSecret,
        clientName = payperUserSub.apiKey.clientName,
        authorizedGroup = otoroshiTarget.get.serviceGroup.value,
        throttlingQuota = callPerSec,
        dailyQuota = callPerDay,
        monthlyQuota = callPerMonth,
        constrainedServicesOnly = true,
        tags = Seq(),
        restrictions = ApiKeyRestrictions(),
        metadata = Map(),
        rotation = None
      )

      wireMockServer.isRunning mustBe true
      stubFor(
        get(urlMatching(s"$otoroshiPathStats.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  Json.obj("hits" -> Json.obj("count" -> 2000))
                )
              )
              .withStatus(200)
          )
      )
      val groupPath = s"/api/groups/[\\w-]*"
      stubFor(
        get(urlMatching(s"$groupPath.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  otoApiKey.asJson.as[JsObject] ++
                    Json.obj("id" -> otoroshiTarget.get.serviceGroup.value,
                             "name" -> otoroshiTarget.get.serviceGroup.value)
                )
              )
              .withStatus(200)
          )
      )
      val otoPathQuotas =
        otoroshiPathApiKeyQuotas(otoroshiTarget.get.serviceGroup.value,
                                 payperUserSub.apiKey.clientId)
      stubFor(
        get(urlMatching(s"$otoPathQuotas.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  ApiKeyQuotas(
                    authorizedCallsPerSec =
                      plan.maxRequestPerSecond.getOrElse(0),
                    currentCallsPerSec = callPerSec,
                    remainingCallsPerSec = plan.maxRequestPerSecond.getOrElse(
                      0L) - callPerSec,
                    authorizedCallsPerDay = plan.maxRequestPerDay.getOrElse(0),
                    currentCallsPerDay = callPerDay,
                    remainingCallsPerDay = plan.maxRequestPerDay
                      .getOrElse(0L) - callPerDay,
                    authorizedCallsPerMonth =
                      plan.maxRequestPerMonth.getOrElse(0),
                    currentCallsPerMonth = callPerMonth,
                    remainingCallsPerMonth = plan.maxRequestPerMonth.getOrElse(
                      0L) - callPerMonth
                  ).asJson
                )
              )
              .withStatus(200)
          )
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val threeDayAgo =
        DateTime.now().minusDays(3).withTimeAtStartOfDay().getMillis
      val to = DateTime.now().plusDays(1).withTimeAtStartOfDay().getMillis

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/subscription/${payperUserSub.id.value}/consumption/_sync",
        method = "POST"
      )(tenant, session)

      resp.status mustBe 200

      val respConsumption = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/subscription/${payperUserSub.id.value}/consumption?from=$threeDayAgo&to=$to"
      )(tenant, session)
      respConsumption.status mustBe 200

      val maybeConsumption = json.SeqConsumptionFormat.reads((respConsumption.json \ "consumptions").as[JsArray])
      maybeConsumption.isSuccess mustBe true

      maybeConsumption.get.head.billing.hits mustBe 1000L
      maybeConsumption.get.head.billing.total mustBe 30L

    }

    "sync api consumption" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        subscriptions = Seq(payperUserSub),
        consumptions = Seq(
          yesterdayConsumption
        )
      )

      val plan =
        defaultApi.possibleUsagePlans.find(p => p.id == payPerUsePlanId).get
      val otoroshiTarget = plan.otoroshiTarget

      val callPerSec = 100L
      val callPerDay = 1000L
      val callPerMonth = 2000L

      wireMockServer.isRunning mustBe true
      stubFor(
        get(urlMatching(s"$otoroshiPathStats.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  Json.obj("hits" -> Json.obj("count" -> 2000))
                )
              )
              .withStatus(200)
          )
      )
      val otoPathQuotas =
        otoroshiPathApiKeyQuotas(otoroshiTarget.get.serviceGroup.value,
                                 payperUserSub.apiKey.clientId)
      stubFor(
        get(urlMatching(s"$otoPathQuotas.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  ApiKeyQuotas(
                    authorizedCallsPerSec =
                      plan.maxRequestPerSecond.getOrElse(0),
                    currentCallsPerSec = callPerSec,
                    remainingCallsPerSec = plan.maxRequestPerSecond.getOrElse(
                      0L) - callPerSec,
                    authorizedCallsPerDay = plan.maxRequestPerDay.getOrElse(0),
                    currentCallsPerDay = callPerDay,
                    remainingCallsPerDay = plan.maxRequestPerDay
                      .getOrElse(0L) - callPerDay,
                    authorizedCallsPerMonth =
                      plan.maxRequestPerMonth.getOrElse(0),
                    currentCallsPerMonth = callPerMonth,
                    remainingCallsPerMonth = plan.maxRequestPerMonth.getOrElse(
                      0L) - callPerMonth
                  ).asJson
                )
              )
              .withStatus(200)
          )
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val threeDayAgo =
        DateTime.now().minusDays(3).withTimeAtStartOfDay().getMillis
      val to = DateTime.now().plusDays(1).withTimeAtStartOfDay().getMillis

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}/consumption/_sync",
        method = "POST"
      )(tenant, session)

      resp.status mustBe 200

      val respConsumption = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/subscription/${payperUserSub.id.value}/consumption?from=$threeDayAgo&to=$to"
      )(tenant, session)
      respConsumption.status mustBe 200

      val maybeConsumption = json.SeqConsumptionFormat.reads((respConsumption.json \ "consumptions").as[JsArray])
      maybeConsumption.isSuccess mustBe true

      maybeConsumption.get.head.billing.hits mustBe 1000L
      maybeConsumption.get.head.billing.total mustBe 30L
    }

    "sync team billing/consumptions" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        subscriptions = Seq(payperUserSub),
        consumptions = Seq(
          yesterdayConsumption
        )
      )

      val plan =
        defaultApi.possibleUsagePlans.find(p => p.id == payPerUsePlanId).get
      val otoroshiTarget = plan.otoroshiTarget

      val callPerSec = 100L
      val callPerDay = 1000L
      val callPerMonth = 2000L

      wireMockServer.isRunning mustBe true
      stubFor(
        get(urlMatching(s"$otoroshiPathStats.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  Json.obj("hits" -> Json.obj("count" -> 2000))
                )
              )
              .withStatus(200)
          )
      )
      val otoPathQuotas =
        otoroshiPathApiKeyQuotas(otoroshiTarget.get.serviceGroup.value,
                                 payperUserSub.apiKey.clientId)
      stubFor(
        get(urlMatching(s"$otoPathQuotas.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  ApiKeyQuotas(
                    authorizedCallsPerSec =
                      plan.maxRequestPerSecond.getOrElse(0),
                    currentCallsPerSec = callPerSec,
                    remainingCallsPerSec = plan.maxRequestPerSecond.getOrElse(
                      0L) - callPerSec,
                    authorizedCallsPerDay = plan.maxRequestPerDay.getOrElse(0),
                    currentCallsPerDay = callPerDay,
                    remainingCallsPerDay = plan.maxRequestPerDay
                      .getOrElse(0L) - callPerDay,
                    authorizedCallsPerMonth =
                      plan.maxRequestPerMonth.getOrElse(0),
                    currentCallsPerMonth = callPerMonth,
                    remainingCallsPerMonth = plan.maxRequestPerMonth.getOrElse(
                      0L) - callPerMonth
                  ).asJson
                )
              )
              .withStatus(200)
          )
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val threeDayAgo =
        DateTime.now().minusDays(3).withTimeAtStartOfDay().getMillis
      val to = DateTime.now().plusDays(1).withTimeAtStartOfDay().getMillis

      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/billing/_sync",
        method = "POST"
      )(tenant, session)

      resp.status mustBe 200

      val respConsumption = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/subscription/${payperUserSub.id.value}/consumption?from=$threeDayAgo&to=$to"
      )(tenant, session)
      respConsumption.status mustBe 200
      val maybeConsumption = json.SeqConsumptionFormat.reads((respConsumption.json \ "consumptions").as[JsArray])
      maybeConsumption.isSuccess mustBe true

      maybeConsumption.get.head.billing.hits mustBe 1000L
      maybeConsumption.get.head.billing.total mustBe 30L
    }

    "sync team income/group consumption" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        subscriptions = Seq(payperUserSub),
        consumptions = Seq(
          yesterdayConsumption
        )
      )

      val plan =
        defaultApi.possibleUsagePlans.find(p => p.id == payPerUsePlanId).get
      val otoroshiTarget = plan.otoroshiTarget

      val callPerSec = 100L
      val callPerDay = 1000L
      val callPerMonth = 2000L

      wireMockServer.isRunning mustBe true
      stubFor(
        get(urlMatching(s"$otoroshiPathStats.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  Json.obj("hits" -> Json.obj("count" -> 2000))
                )
              )
              .withStatus(200)
          )
      )
      val otoPathQuotas =
        otoroshiPathApiKeyQuotas(otoroshiTarget.get.serviceGroup.value,
                                 payperUserSub.apiKey.clientId)
      stubFor(
        get(urlMatching(s"$otoPathQuotas.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  ApiKeyQuotas(
                    authorizedCallsPerSec =
                      plan.maxRequestPerSecond.getOrElse(0),
                    currentCallsPerSec = callPerSec,
                    remainingCallsPerSec = plan.maxRequestPerSecond.getOrElse(
                      0L) - callPerSec,
                    authorizedCallsPerDay = plan.maxRequestPerDay.getOrElse(0),
                    currentCallsPerDay = callPerDay,
                    remainingCallsPerDay = plan.maxRequestPerDay
                      .getOrElse(0L) - callPerDay,
                    authorizedCallsPerMonth =
                      plan.maxRequestPerMonth.getOrElse(0),
                    currentCallsPerMonth = callPerMonth,
                    remainingCallsPerMonth = plan.maxRequestPerMonth.getOrElse(
                      0L) - callPerMonth
                  ).asJson
                )
              )
              .withStatus(200)
          )
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val threeDayAgo =
        DateTime.now().minusDays(3).withTimeAtStartOfDay().getMillis
      val to = DateTime.now().plusDays(1).withTimeAtStartOfDay().getMillis

      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/income/_sync",
        method = "POST"
      )(tenant, session)

      resp.status mustBe 200

      val respConsumption = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/subscription/${payperUserSub.id.value}/consumption?from=$threeDayAgo&to=$to"
      )(tenant, session)
      respConsumption.status mustBe 200

      val maybeConsumption = json.SeqConsumptionFormat.reads((respConsumption.json \ "consumptions").as[JsArray])
      maybeConsumption.isSuccess mustBe true

      maybeConsumption.get.head.billing.hits mustBe 1000L
      maybeConsumption.get.head.billing.total mustBe 30L
    }
  }

  "a user or apiEditor" can {
    val randomUser = Random.shuffle(Seq(user, userApiEditor)).head

    "not get otoroshi group consumption" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(randomUser),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        subscriptions = Seq(payperUserSub),
        consumptions = Seq(
          yesterdayConsumption
        )
      )
      val session = loginWithBlocking(randomUser, tenant)
      val from = DateTime.now().minusDays(1).withTimeAtStartOfDay().getMillis
      val to = DateTime.now().withTimeAtStartOfDay().getMillis
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}/plan/${payPerUsePlanId.value}/consumption?from=$from&to=$to"
      )(tenant, session)
      resp.status mustBe 403
    }

    "get api consumption" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(randomUser),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        subscriptions = Seq(payperUserSub),
        consumptions = Seq(
          yesterdayConsumption
        )
      )
      val session = loginWithBlocking(randomUser, tenant)
      val from = DateTime.now().minusDays(1).withTimeAtStartOfDay().getMillis
      val to = DateTime.now().withTimeAtStartOfDay().getMillis
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}/consumption?from=$from&to=$to"
      )(tenant, session)
      resp.status mustBe 403
    }

    "get team consumption" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(randomUser),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        subscriptions = Seq(payperUserSub),
        consumptions = Seq(
          yesterdayConsumption
        )
      )
      val session = loginWithBlocking(randomUser, tenant)
      val from = DateTime.now().minusDays(1).withTimeAtStartOfDay().getMillis
      val to = DateTime.now().withTimeAtStartOfDay().getMillis
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/consumptions?from=$from&to=$to"
      )(tenant, session)
      resp.status mustBe 403
    }

    "get team income" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(randomUser),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        subscriptions = Seq(payperUserSub),
        consumptions = Seq(
          yesterdayConsumption
        )
      )
      val session = loginWithBlocking(randomUser, tenant)
      val from = DateTime.now().minusDays(1).withTimeAtStartOfDay().getMillis
      val to = DateTime.now().withTimeAtStartOfDay().getMillis
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/income?from=$from&to=$to"
      )(tenant, session)
      resp.status mustBe 403
    }

    "get team billings" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(randomUser),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        subscriptions = Seq(payperUserSub),
        consumptions = Seq(
          yesterdayConsumption
        )
      )
      val session = loginWithBlocking(randomUser, tenant)
      val from = DateTime.now().minusDays(1).withTimeAtStartOfDay().getMillis
      val to = DateTime.now().withTimeAtStartOfDay().getMillis
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/billings?from=$from&to=$to"
      )(tenant, session)
      resp.status mustBe 403

    }

    "not sync apikey consumption" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, randomUser),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        subscriptions = Seq(payperUserSub),
        consumptions = Seq(
          yesterdayConsumption
        )
      )

      val plan =
        defaultApi.possibleUsagePlans.find(p => p.id == payPerUsePlanId).get
      val otoroshiTarget = plan.otoroshiTarget

      val callPerSec = 100L
      val callPerDay = 1000L
      val callPerMonth = 2000L

      wireMockServer.isRunning mustBe true
      stubFor(
        get(urlMatching(s"$otoroshiPathStats.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  Json.obj("hits" -> Json.obj("count" -> 2000))
                )
              )
              .withStatus(200)
          )
      )
      val otoPathQuotas =
        otoroshiPathApiKeyQuotas(otoroshiTarget.get.serviceGroup.value,
                                 payperUserSub.apiKey.clientId)
      stubFor(
        get(urlMatching(s"$otoPathQuotas.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  ApiKeyQuotas(
                    authorizedCallsPerSec =
                      plan.maxRequestPerSecond.getOrElse(0),
                    currentCallsPerSec = callPerSec,
                    remainingCallsPerSec = plan.maxRequestPerSecond.getOrElse(
                      0L) - callPerSec,
                    authorizedCallsPerDay = plan.maxRequestPerDay.getOrElse(0),
                    currentCallsPerDay = callPerDay,
                    remainingCallsPerDay = plan.maxRequestPerDay
                      .getOrElse(0L) - callPerDay,
                    authorizedCallsPerMonth =
                      plan.maxRequestPerMonth.getOrElse(0),
                    currentCallsPerMonth = callPerMonth,
                    remainingCallsPerMonth = plan.maxRequestPerMonth.getOrElse(
                      0L) - callPerMonth
                  ).asJson
                )
              )
              .withStatus(200)
          )
      )

      val session = loginWithBlocking(randomUser, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/subscription/${payperUserSub.id.value}/consumption/_sync",
        method = "POST"
      )(tenant, session)

      resp.status mustBe 403
    }

    "not sync api consumption" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, randomUser),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        subscriptions = Seq(payperUserSub),
        consumptions = Seq(
          yesterdayConsumption
        )
      )

      val plan =
        defaultApi.possibleUsagePlans.find(p => p.id == payPerUsePlanId).get
      val otoroshiTarget = plan.otoroshiTarget

      val callPerSec = 100L
      val callPerDay = 1000L
      val callPerMonth = 2000L

      wireMockServer.isRunning mustBe true
      stubFor(
        get(urlMatching(s"$otoroshiPathStats.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  Json.obj("hits" -> Json.obj("count" -> 2000))
                )
              )
              .withStatus(200)
          )
      )
      val otoPathQuotas =
        otoroshiPathApiKeyQuotas(otoroshiTarget.get.serviceGroup.value,
                                 payperUserSub.apiKey.clientId)
      stubFor(
        get(urlMatching(s"$otoPathQuotas.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  ApiKeyQuotas(
                    authorizedCallsPerSec =
                      plan.maxRequestPerSecond.getOrElse(0),
                    currentCallsPerSec = callPerSec,
                    remainingCallsPerSec = plan.maxRequestPerSecond.getOrElse(
                      0L) - callPerSec,
                    authorizedCallsPerDay = plan.maxRequestPerDay.getOrElse(0),
                    currentCallsPerDay = callPerDay,
                    remainingCallsPerDay = plan.maxRequestPerDay
                      .getOrElse(0L) - callPerDay,
                    authorizedCallsPerMonth =
                      plan.maxRequestPerMonth.getOrElse(0),
                    currentCallsPerMonth = callPerMonth,
                    remainingCallsPerMonth = plan.maxRequestPerMonth.getOrElse(
                      0L) - callPerMonth
                  ).asJson
                )
              )
              .withStatus(200)
          )
      )

      val session = loginWithBlocking(randomUser, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}/consumption/_sync",
        method = "POST"
      )(tenant, session)

      resp.status mustBe 403
    }

    "not sync team billing/consumptions" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, randomUser),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        subscriptions = Seq(payperUserSub),
        consumptions = Seq(
          yesterdayConsumption
        )
      )

      val plan =
        defaultApi.possibleUsagePlans.find(p => p.id == payPerUsePlanId).get
      val otoroshiTarget = plan.otoroshiTarget

      val callPerSec = 100L
      val callPerDay = 1000L
      val callPerMonth = 2000L

      wireMockServer.isRunning mustBe true
      stubFor(
        get(urlMatching(s"$otoroshiPathStats.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  Json.obj("hits" -> Json.obj("count" -> 2000))
                )
              )
              .withStatus(200)
          )
      )
      val otoPathQuotas =
        otoroshiPathApiKeyQuotas(otoroshiTarget.get.serviceGroup.value,
                                 payperUserSub.apiKey.clientId)
      stubFor(
        get(urlMatching(s"$otoPathQuotas.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  ApiKeyQuotas(
                    authorizedCallsPerSec =
                      plan.maxRequestPerSecond.getOrElse(0),
                    currentCallsPerSec = callPerSec,
                    remainingCallsPerSec = plan.maxRequestPerSecond.getOrElse(
                      0L) - callPerSec,
                    authorizedCallsPerDay = plan.maxRequestPerDay.getOrElse(0),
                    currentCallsPerDay = callPerDay,
                    remainingCallsPerDay = plan.maxRequestPerDay
                      .getOrElse(0L) - callPerDay,
                    authorizedCallsPerMonth =
                      plan.maxRequestPerMonth.getOrElse(0),
                    currentCallsPerMonth = callPerMonth,
                    remainingCallsPerMonth = plan.maxRequestPerMonth.getOrElse(
                      0L) - callPerMonth
                  ).asJson
                )
              )
              .withStatus(200)
          )
      )

      val session = loginWithBlocking(randomUser, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/billing/_sync",
        method = "POST"
      )(tenant, session)

      resp.status mustBe 403
    }

    "not sync team income/group consumption" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, randomUser),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        subscriptions = Seq(payperUserSub),
        consumptions = Seq(
          yesterdayConsumption
        )
      )

      val plan =
        defaultApi.possibleUsagePlans.find(p => p.id == payPerUsePlanId).get
      val otoroshiTarget = plan.otoroshiTarget

      val callPerSec = 100L
      val callPerDay = 1000L
      val callPerMonth = 2000L

      wireMockServer.isRunning mustBe true
      stubFor(
        get(urlMatching(s"$otoroshiPathStats.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  Json.obj("hits" -> Json.obj("count" -> 2000))
                )
              )
              .withStatus(200)
          )
      )
      val otoPathQuotas =
        otoroshiPathApiKeyQuotas(otoroshiTarget.get.serviceGroup.value,
                                 payperUserSub.apiKey.clientId)
      stubFor(
        get(urlMatching(s"$otoPathQuotas.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  ApiKeyQuotas(
                    authorizedCallsPerSec =
                      plan.maxRequestPerSecond.getOrElse(0),
                    currentCallsPerSec = callPerSec,
                    remainingCallsPerSec = plan.maxRequestPerSecond.getOrElse(
                      0L) - callPerSec,
                    authorizedCallsPerDay = plan.maxRequestPerDay.getOrElse(0),
                    currentCallsPerDay = callPerDay,
                    remainingCallsPerDay = plan.maxRequestPerDay
                      .getOrElse(0L) - callPerDay,
                    authorizedCallsPerMonth =
                      plan.maxRequestPerMonth.getOrElse(0),
                    currentCallsPerMonth = callPerMonth,
                    remainingCallsPerMonth = plan.maxRequestPerMonth.getOrElse(
                      0L) - callPerMonth
                  ).asJson
                )
              )
              .withStatus(200)
          )
      )

      val session = loginWithBlocking(randomUser, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/income/_sync",
        method = "POST"
      )(tenant, session)

      resp.status mustBe 403
    }
  }

}
