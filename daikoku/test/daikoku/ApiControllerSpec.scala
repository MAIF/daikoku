package fr.maif.otoroshi.daikoku.tests

import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock
import com.github.tomakehurst.wiremock.client.WireMock._
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig
import com.typesafe.config.ConfigFactory
import controllers.AppError
import controllers.AppError.PlanUnauthorized
import fr.maif.otoroshi.daikoku.domain.TeamPermission.{Administrator, ApiEditor}
import fr.maif.otoroshi.daikoku.domain.UsagePlan.{Admin, PayPerUse, QuotasWithLimits}
import fr.maif.otoroshi.daikoku.domain.UsagePlanVisibility.{Private, Public}
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.tests.utils.{DaikokuSpecHelper, OneServerPerSuiteWithMyComponents}
import org.joda.time.DateTime
import org.scalatest.BeforeAndAfterEach
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import play.api.Configuration
import play.api.libs.json.{JsArray, JsObject, Json}

class ApiControllerSpec(configurationSpec: => Configuration)
  extends PlaySpec
    with OneServerPerSuiteWithMyComponents
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfterEach {

  override def getConfiguration(configuration: Configuration): Configuration =
    configuration ++ configurationSpec ++ Configuration(
      ConfigFactory.parseString(
        s"""
									  |{
									  |  http.port=$port
									  |  play.server.http.port=$port
									  |}
     """.stripMargin).resolve()
    )

  lazy val wireMockServer = new WireMockServer(wireMockConfig().port(stubPort))

  override def beforeEach {
    wireMockServer.start()
    WireMock.configureFor(stubHost, stubPort)
  }

  override def afterEach {
    wireMockServer.stop()
  }

  "a tenant administrator" can {
    "initialize tenant apis" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq.empty
      )

      val apis = Seq(
        generateApi("test-1", tenant.id, teamOwnerId, Seq.empty),
        generateApi("test-2", tenant.id, teamOwnerId, Seq.empty),
        generateApi("test-3", tenant.id, teamOwnerId, Seq.empty),
      )

      val session = loginWithBlocking(tenantAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = "/api/apis/_init",
        method = "POST",
        body = Some(json.SeqApiFormat.writes(apis)
      ))(tenant, session)

      resp.status mustBe 201
      val result = resp.json.as[JsArray].value.map(v => ((v \ "name").as[String], (v \ "done").as[Boolean]))

      result.forall(tuple => apis.exists(api => api.name == tuple._1 && tuple._2)) mustBe true
    }

    "initialize tenant subscriptions" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin, userAdmin),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(defaultApi)
      )

      def generateInitSubJson(apikeyValue: String, apiId: ApiId, usagePlanId: UsagePlanId, teamId: TeamId): JsObject =
        Json.obj(
          "apikey"  -> OtoroshiApiKey(apikeyValue, apikeyValue, apikeyValue).asJson,
          "api" -> apiId.asJson,
          "plan" -> usagePlanId.asJson,
          "team" -> teamId.asJson
        )


      val apikeys = Seq(
        generateInitSubJson("1", defaultApi.id, UsagePlanId("1"), teamConsumerId),
        generateInitSubJson("2", defaultApi.id, UsagePlanId("2"), teamConsumerId),
        generateInitSubJson("3", defaultApi.id, UsagePlanId("3"), teamConsumerId),
        generateInitSubJson("4", defaultApi.id, UsagePlanId("4"), teamConsumerId),
        generateInitSubJson("5", defaultApi.id, UsagePlanId("5"), teamConsumerId),
        generateInitSubJson("1", defaultApi.id, UsagePlanId("1"), teamOwnerId),
        generateInitSubJson("2", defaultApi.id, UsagePlanId("2"), teamOwnerId),
        generateInitSubJson("3", defaultApi.id, UsagePlanId("3"), teamOwnerId),
        generateInitSubJson("4", defaultApi.id, UsagePlanId("4"), teamOwnerId),
        generateInitSubJson("5", defaultApi.id, UsagePlanId("5"), teamOwnerId),
      )

      val session = loginWithBlocking(tenantAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = "/api/subscriptions/_init",
        method = "POST",
        body = Some(Json.arr(apikeys))
        )(tenant, session)

      resp.status mustBe 201
      val result = resp.json.as[JsArray].value.map(v => ((v \ "name").as[String], (v \ "done").as[Boolean]))

      result.forall(tuple => apikeys.exists(apikey => (apikey \ "apikey").as(json.OtoroshiApiKeyFormat).clientName == tuple._1 && tuple._2)) mustBe true

      val sessionTest = loginWithBlocking(userAdmin, tenant)
      val respTestApis = httpJsonCallBlocking(s"/api/teams/${teamOwnerId.value}/subscribed-apis")(tenant, sessionTest)
      respTestApis.status mustBe 200
      val resultTestApis = fr.maif.otoroshi.daikoku.domain.json.SeqApiFormat.reads(respTestApis.json)
      resultTestApis.isSuccess mustBe true
      resultTestApis.get.length mustBe 1
      resultTestApis.get.exists(a => a.id == defaultApi.id)

      val respTestSubscriptions = httpJsonCallBlocking(s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamOwnerId.value}")(tenant, sessionTest)
      respTestSubscriptions.status mustBe 200
      val resultTestSubscriptions = fr.maif.otoroshi.daikoku.domain.json.SeqApiSubscriptionFormat.reads(respTestSubscriptions.json)
      resultTestSubscriptions.isSuccess mustBe true
      resultTestSubscriptions.get.length mustBe 5
      Seq("1", "2", "3", "4", "5").map(UsagePlanId).forall(id => resultTestSubscriptions.get.exists(sub => sub.plan == id)) mustBe true

      val respTestMySubscriptions = httpJsonCallBlocking(s"/api/me/subscriptions/${defaultApi.id.value}")(tenant, sessionTest)
      respTestMySubscriptions.status mustBe 200
      (respTestMySubscriptions.json \ "subscriptions").as[JsArray].value.length mustBe 10

    }
  }

//  "a team administrator" can {
//    "not initialize tenant apis" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(tenantAdmin, userAdmin),
//        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
//        apis = Seq.empty
//      )
//
//      val apis = Seq(
//        generateApi("test-1", tenant.id, teamOwnerId, Seq.empty),
//        generateApi("test-2", tenant.id, teamOwnerId, Seq.empty),
//        generateApi("test-3", tenant.id, teamOwnerId, Seq.empty),
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//      val resp = httpJsonCallBlocking(
//        path = "/api/apis/_init",
//        method = "POST",
//        body = Some(json.SeqApiFormat.writes(apis)
//        ))(tenant, session)
//      resp.status mustBe 403
//    }
//
//    "not initialize tenant subscriptions" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(tenantAdmin, userAdmin),
//        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
//        apis = Seq(defaultApi)
//      )
//
//      def generateInitSubJson(apikeyValue: String, apiId: ApiId, usagePlanId: UsagePlanId, teamId: TeamId): JsObject =
//        Json.obj(
//          "apikey"  -> OtoroshiApiKey(apikeyValue, apikeyValue, apikeyValue).asJson,
//          "api" -> apiId.asJson,
//          "plan" -> usagePlanId.asJson,
//          "team" -> teamId.asJson
//        )
//
//      val apikeys = Seq(
//        generateInitSubJson("1", defaultApi.id, UsagePlanId("1"), teamConsumerId),
//        generateInitSubJson("2", defaultApi.id, UsagePlanId("2"), teamConsumerId),
//        generateInitSubJson("3", defaultApi.id, UsagePlanId("3"), teamConsumerId),
//        generateInitSubJson("4", defaultApi.id, UsagePlanId("4"), teamConsumerId),
//        generateInitSubJson("5", defaultApi.id, UsagePlanId("5"), teamConsumerId),
//        generateInitSubJson("1", defaultApi.id, UsagePlanId("1"), teamOwnerId),
//        generateInitSubJson("2", defaultApi.id, UsagePlanId("2"), teamOwnerId),
//        generateInitSubJson("3", defaultApi.id, UsagePlanId("3"), teamOwnerId),
//        generateInitSubJson("4", defaultApi.id, UsagePlanId("4"), teamOwnerId),
//        generateInitSubJson("5", defaultApi.id, UsagePlanId("5"), teamOwnerId),
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//      val resp = httpJsonCallBlocking(
//        path = "/api/subscriptions/_init",
//        method = "POST",
//        body = Some(Json.arr(apikeys))
//      )(tenant, session)
//
//      resp.status mustBe 403
//    }
//
//    "see his teams" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner, teamConsumer)
//      )
//      val session = loginWithBlocking(userAdmin, tenant)
//      val resp = httpJsonCallBlocking("/api/me/teams")(tenant, session)
//      resp.status mustBe 200
//      val result =
//        fr.maif.otoroshi.daikoku.domain.json.SeqTeamFormat.reads(resp.json)
//      result.isSuccess mustBe true
//      result.get.size mustBe 3
//    }
//
//    "see one of his teams" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner)
//      )
//      val session = loginWithBlocking(userAdmin, tenant)
//      val resp =
//        httpJsonCallBlocking(s"/api/me/teams/${teamOwnerId.value}")(tenant,
//          session)
//      resp.status mustBe 200
//      val result =
//        fr.maif.otoroshi.daikoku.domain.json.TeamFormat.reads(resp.json)
//      result.isSuccess mustBe true
//      result.get.id mustBe teamOwnerId
//    }
//
//    "not see another teams" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(
//          teamConsumer.copy(
//            users = Set(UserWithPermission(userApiEditorId, Administrator))))
//      )
//      val session = loginWithBlocking(userAdmin, tenant)
//      val resp =
//        httpJsonCallBlocking(s"/api/me/teams/${teamConsumerId.value}")(tenant,
//          session)
//      resp.status mustBe 403
//    }
//
//    "create a new api" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner)
//      )
//
//      val api = generateApi("0", tenant.id, teamOwnerId, Seq.empty)
//      val session = loginWithBlocking(userAdmin, tenant)
//      val resp = httpJsonCallBlocking(path =
//        s"/api/teams/${teamOwnerId.value}/apis",
//        method = "POST",
//        body = Some(api.asJson))(tenant, session)
//
//      resp.status mustBe 201
//      val result =
//        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(resp.json)
//      result.isSuccess mustBe true
//      result.get.equals(api) mustBe true
//    }
//
//    "not update an api of a team which he is not a member" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner),
//        apis = Seq(defaultApi,
//          defaultApi.copy(id = ApiId("another-api"),
//            description = "another-api",
//            team = teamConsumerId))
//      )
//
//      val updatedApi = defaultApi.copy(description = "description")
//      val session = loginWithBlocking(userAdmin, tenant)
//
//      val respError = httpJsonCallBlocking(
//        path = s"/api/teams/${teamOwnerId.value}/apis/another-api",
//        method = "PUT",
//        body = Some(updatedApi.asJson))(tenant, session)
//
//      respError.status mustBe 404
//      (respError.json \ "error").as[String] mustBe "Api not found"
//
//      val respError2 = httpJsonCallBlocking(
//        path = s"/api/teams/${teamConsumerId.value}/apis/another-api",
//        method = "PUT",
//        body = Some(updatedApi.asJson))(tenant, session)
//
//      respError2.status mustBe 404
//    }
//
//    "update an api of his team" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner),
//        apis = Seq(defaultApi,
//          defaultApi.copy(id = ApiId("another-api"),
//            description = "another-api",
//            team = teamOwnerId))
//      )
//
//      val updatedApi = defaultApi.copy(description = "description")
//      val session = loginWithBlocking(userAdmin, tenant)
//
//      val resp = httpJsonCallBlocking(
//        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}",
//        method = "PUT",
//        body = Some(updatedApi.asJson))(tenant, session)
//
//      resp.status mustBe 200
//      val result =
//        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(resp.json)
//      result.isSuccess mustBe true
//      result.get.description.equals("description") mustBe true
//
//      val respGet =
//        httpJsonCallBlocking(path =
//          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}")(
//          tenant,
//          session)
//
//      respGet.status mustBe 200
//      val resultAsApi =
//        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(respGet.json)
//      resultAsApi.isSuccess mustBe true
//      resultAsApi.get.description.equals("description") mustBe true
//    }
//
//    "delete an api of his team" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner),
//        apis = Seq(defaultApi)
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//      val resp = httpJsonCallBlocking(
//        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}",
//        method = "DELETE")(tenant, session)
//      resp.status mustBe 200
//      (resp.json \ "done").as[Boolean] mustBe true
//    }
//
//    "not delete an api of a team which he's not a member" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner),
//        apis = Seq(defaultApi.copy(team = teamConsumerId))
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//      val resp = httpJsonCallBlocking(
//        path = s"/api/teams/${teamConsumerId.value}/apis/${defaultApi.id}",
//        method = "DELETE")(tenant, session)
//      resp.status mustBe 404
//
//      val resp2 = httpJsonCallBlocking(
//        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id}",
//        method = "DELETE")(tenant, session)
//      resp2.status mustBe 404
//    }
//
//    "not subscribe to an unpublished api" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner, teamConsumer),
//        apis = Seq(defaultApi.copy(published = false))
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//      val plan = "1"
//      val resp = httpJsonCallBlocking(
//        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
//        method = "POST",
//        body = Some(
//          Json.obj("plan" -> plan, "teams" -> Json.arr(teamConsumer.id.asJson)))
//      )(tenant, session)
//
//      resp.status mustBe 403
//      (resp.json \ "error")
//        .as[String] mustBe "You're not authorized to subscribed to an unpublished api"
//    }
//
//    "subscribe to an api and update the custom name" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner, teamConsumer),
//        apis = Seq(defaultApi)
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//      val plan = "1"
//      val resp = httpJsonCallBlocking(
//        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
//        method = "POST",
//        body = Some(
//          Json.obj("plan" -> plan, "teams" -> Json.arr(teamConsumer.id.asJson)))
//      )(tenant, session)
//
//      resp.status mustBe 200
//      val result = (resp.json \ 0).as[JsObject]
//      (result \ "creation").as[String] mustBe "done"
//
//      val resultAsSubscription =
//        fr.maif.otoroshi.daikoku.domain.json.ApiSubscriptionFormat
//          .reads((result \ "subscription").as[JsObject])
//      resultAsSubscription.isSuccess mustBe true
//      val subscription = resultAsSubscription.get
//      subscription.plan.value mustBe plan
//      subscription.team mustBe teamConsumerId
//      subscription.by mustBe userAdmin.id
//
//      val respUpdate = httpJsonCallBlocking(
//        path =
//          s"/api/teams/${teamConsumerId.value}/subscriptions/${subscription.id.value}/name",
//        method = "POST",
//        body = Some(Json.obj("customName" -> "test api key"))
//      )(tenant, session)
//      respUpdate.status mustBe 200
//
//      val respSubs = httpJsonCallBlocking(
//        path =
//          s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
//      )(tenant, session)
//      resp.status mustBe 200
//      val resultAsUpdatedSubscription =
//        fr.maif.otoroshi.daikoku.domain.json.ApiSubscriptionFormat
//          .reads((respSubs.json \ 0).as[JsObject])
//
//      resultAsUpdatedSubscription.isSuccess mustBe true
//      resultAsUpdatedSubscription.get.customName mustBe Some("test api key")
//    }
//
//    "delete a subscription" in {
//      val payPerUsePlanId = UsagePlanId("5")
//      val payperUseSub = ApiSubscription(
//        id = ApiSubscriptionId("test"),
//        tenant = tenant.id,
//        apiKey = OtoroshiApiKey("name", "id", "secret"),
//        plan = payPerUsePlanId,
//        createdAt = DateTime.now(),
//        team = teamConsumerId,
//        api = defaultApi.id,
//        by = daikokuAdminId,
//        customName = None,
//        rotation = None,
//        integrationToken = "test"
//      )
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner,
//          teamConsumer.copy(subscriptions = Seq(payperUseSub.id))),
//        apis = Seq(defaultApi),
//        subscriptions = Seq(payperUseSub)
//      )
//
//      val plan =
//        defaultApi.possibleUsagePlans.find(p => p.id == payPerUsePlanId).get
//      val otoroshiTarget = plan.otoroshiTarget
//      val callPerSec = 100L
//      val callPerDay = 1000L
//      val callPerMonth = 2000L
//
//      val session = loginWithBlocking(userAdmin, tenant)
//      wireMockServer.isRunning mustBe true
//      val path = otoroshiDeleteApikeyPath(otoroshiTarget.get.serviceGroup.value,
//        payperUseSub.apiKey.clientId)
//      stubFor(
//        get(urlMatching(s"$otoroshiPathStats.*"))
//          .willReturn(
//            aResponse()
//              .withBody(
//                Json.stringify(
//                  Json.obj("hits" -> Json.obj("count" -> 2000))
//                )
//              )
//              .withStatus(200)
//          )
//      )
//      val groupPath = otoroshiPathGroup(otoroshiTarget.get.serviceGroup.value)
//      stubFor(
//        get(urlMatching(s"$groupPath.*"))
//          .willReturn(
//            aResponse()
//              .withBody(
//                Json.stringify(
//                  Json.obj("id" -> otoroshiTarget.get.serviceGroup.value,
//                    "name" -> "name",
//                    "description" -> "No Description")
//                )
//              )
//              .withStatus(200)
//          )
//      )
//      val otoPathQuotas =
//        otoroshiPathApiKeyQuotas(otoroshiTarget.get.serviceGroup.value,
//          payperUseSub.apiKey.clientId)
//      stubFor(
//        get(urlMatching(s"$otoPathQuotas.*"))
//          .willReturn(
//            aResponse()
//              .withBody(
//                Json.stringify(
//                  ApiKeyQuotas(
//                    authorizedCallsPerSec =
//                      plan.maxRequestPerSecond.getOrElse(0),
//                    currentCallsPerSec = callPerSec,
//                    remainingCallsPerSec = plan.maxRequestPerSecond.getOrElse(
//                      0L) - callPerSec,
//                    authorizedCallsPerDay = plan.maxRequestPerDay.getOrElse(0),
//                    currentCallsPerDay = callPerDay,
//                    remainingCallsPerDay = plan.maxRequestPerDay
//                      .getOrElse(0L) - callPerDay,
//                    authorizedCallsPerMonth =
//                      plan.maxRequestPerMonth.getOrElse(0),
//                    currentCallsPerMonth = callPerMonth,
//                    remainingCallsPerMonth = plan.maxRequestPerMonth.getOrElse(
//                      0L) - callPerMonth
//                  ).asJson
//                )
//              )
//              .withStatus(200)
//          )
//      )
//      stubFor(
//        delete(urlMatching(s"$path.*"))
//          .willReturn(
//            aResponse()
//              .withBody(
//                Json.stringify(
//                  Json.obj("deleted" -> true)
//                )
//              )
//              .withStatus(200)
//          )
//      )
//
//      val respVerifStart = httpJsonCallBlocking(
//        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
//      )(tenant, session)
//      respVerifStart.status mustBe 200
//      val eventualSubsStart =
//        json.SeqApiSubscriptionFormat.reads(respVerifStart.json)
//      eventualSubsStart.isSuccess mustBe true
//      eventualSubsStart.get.length mustBe 1
//
//      val resp = httpJsonCallBlocking(
//        path =
//          s"/api/teams/${teamConsumerId.value}/subscriptions/${payperUseSub.id.value}/_delete",
//        method = "DELETE"
//      )(tenant, session)
//      resp.status mustBe 200
//
//      val respVerif = httpJsonCallBlocking(
//        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
//      )(tenant, session)
//      respVerif.status mustBe 200
//      val eventualSubs = json.SeqApiSubscriptionFormat.reads(respVerif.json)
//      eventualSubs.isSuccess mustBe true
//      eventualSubs.get.length mustBe 0
//    }
//
//    "archive a subscription" in {
//      val payPerUsePlanId = UsagePlanId("5")
//      val payperUseSub = ApiSubscription(
//        id = ApiSubscriptionId("test"),
//        tenant = tenant.id,
//        apiKey = OtoroshiApiKey("name", "id", "secret"),
//        plan = payPerUsePlanId,
//        createdAt = DateTime.now(),
//        team = teamConsumerId,
//        api = defaultApi.id,
//        by = userTeamAdminId,
//        customName = None,
//        rotation = None,
//        integrationToken = "test"
//      )
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner,
//          teamConsumer.copy(subscriptions = Seq(payperUseSub.id))),
//        apis = Seq(defaultApi),
//        subscriptions = Seq(payperUseSub)
//      )
//
//      val plan =
//        defaultApi.possibleUsagePlans.find(p => p.id == payPerUsePlanId).get
//      val otoroshiTarget = plan.otoroshiTarget
//      val callPerSec = 100L
//      val callPerDay = 1000L
//      val callPerMonth = 2000L
//
//      val otoApiKey = ActualOtoroshiApiKey(
//        clientId = payperUseSub.apiKey.clientId,
//        clientSecret = payperUseSub.apiKey.clientSecret,
//        clientName = payperUseSub.apiKey.clientName,
//        authorizedGroup = otoroshiTarget.get.serviceGroup.value,
//        throttlingQuota = callPerSec,
//        dailyQuota = callPerDay,
//        monthlyQuota = callPerMonth,
//        constrainedServicesOnly = true,
//        tags = Seq(),
//        restrictions = ApiKeyRestrictions(),
//        metadata = Map(),
//        rotation = None
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//      wireMockServer.isRunning mustBe true
//      val path = otoroshiDeleteApikeyPath(otoroshiTarget.get.serviceGroup.value,
//        payperUseSub.apiKey.clientId)
//      stubFor(
//        get(urlMatching(s"$otoroshiPathStats.*"))
//          .willReturn(
//            aResponse()
//              .withBody(
//                Json.stringify(
//                  Json.obj("hits" -> Json.obj("count" -> 2000))
//                )
//              )
//              .withStatus(200)
//          )
//      )
//      val groupPath = otoroshiPathGroup(otoroshiTarget.get.serviceGroup.value)
//      stubFor(
//        get(urlMatching(s"$groupPath.*"))
//          .willReturn(
//            aResponse()
//              .withBody(
//                Json.stringify(
//                  otoApiKey.asJson.as[JsObject] ++
//                    Json.obj("id" -> otoroshiTarget.get.serviceGroup.value,
//                      "name" -> otoroshiTarget.get.serviceGroup.value)
//                )
//              )
//              .withStatus(200)
//          )
//      )
//      val otoPathQuotas =
//        otoroshiPathApiKeyQuotas(otoroshiTarget.get.serviceGroup.value,
//          payperUseSub.apiKey.clientId)
//      stubFor(
//        get(urlMatching(s"$otoPathQuotas.*"))
//          .willReturn(
//            aResponse()
//              .withBody(
//                Json.stringify(
//                  ApiKeyQuotas(
//                    authorizedCallsPerSec =
//                      plan.maxRequestPerSecond.getOrElse(0),
//                    currentCallsPerSec = callPerSec,
//                    remainingCallsPerSec = plan.maxRequestPerSecond.getOrElse(
//                      0L) - callPerSec,
//                    authorizedCallsPerDay = plan.maxRequestPerDay.getOrElse(0),
//                    currentCallsPerDay = callPerDay,
//                    remainingCallsPerDay = plan.maxRequestPerDay
//                      .getOrElse(0L) - callPerDay,
//                    authorizedCallsPerMonth =
//                      plan.maxRequestPerMonth.getOrElse(0),
//                    currentCallsPerMonth = callPerMonth,
//                    remainingCallsPerMonth = plan.maxRequestPerMonth.getOrElse(
//                      0L) - callPerMonth
//                  ).asJson
//                )
//              )
//              .withStatus(200)
//          )
//      )
//      stubFor(
//        put(urlMatching(s"$path.*"))
//          .willReturn(
//            aResponse()
//              .withBody(
//                Json.stringify(
//                  otoApiKey.copy(enabled = false).asJson
//                )
//              )
//              .withStatus(200)
//          )
//      )
//
//      val respVerif0 = httpJsonCallBlocking(
//        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
//      )(tenant, session)
//      respVerif0.status mustBe 200
//      val eventualSubs0 = json.SeqApiSubscriptionFormat.reads(respVerif0.json)
//      eventualSubs0.isSuccess mustBe true
//      eventualSubs0.get.length mustBe 1
//      eventualSubs0.get.head.enabled mustBe true
//
//      val respArchive = httpJsonCallBlocking(
//        path =
//          s"/api/teams/${teamConsumerId.value}/subscriptions/${payperUseSub.id.value}/_archive",
//        method = "PUT"
//      )(tenant, session)
//      respArchive.status mustBe 200
//
//      val respVerif = httpJsonCallBlocking(
//        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
//      )(tenant, session)
//      respVerif.status mustBe 200
//      val eventualSubs = json.SeqApiSubscriptionFormat.reads(respVerif.json)
//      eventualSubs.isSuccess mustBe true
//      eventualSubs.get.length mustBe 1
//      eventualSubs.get.head.enabled mustBe false
//
//      val respUnarchive = httpJsonCallBlocking(
//        path =
//          s"/api/teams/${teamConsumerId.value}/subscriptions/${payperUseSub.id.value}/_archive?enabled=true",
//        method = "PUT"
//      )(tenant, session)
//      respUnarchive.status mustBe 200
//      val respVerif2 = httpJsonCallBlocking(
//        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
//      )(tenant, session)
//      respVerif2.status mustBe 200
//      val eventualSubs2 = json.SeqApiSubscriptionFormat.reads(respVerif2.json)
//      eventualSubs2.isSuccess mustBe true
//      eventualSubs2.get.length mustBe 1
//      eventualSubs2.get.head.enabled mustBe true
//    }
//
//    "delete archived subscriptions" in {
//      val payPerUsePlanId = UsagePlanId("5")
//      val sub1 = ApiSubscription(
//        id = ApiSubscriptionId("test"),
//        tenant = tenant.id,
//        apiKey = OtoroshiApiKey("name", "id", "secret"),
//        plan = payPerUsePlanId,
//        createdAt = DateTime.now(),
//        team = teamConsumerId,
//        api = defaultApi.id,
//        by = userTeamAdminId,
//        customName = None,
//        rotation = None,
//        integrationToken = "test"
//      )
//      val sub2 = ApiSubscription(
//        id = ApiSubscriptionId("test2"),
//        tenant = tenant.id,
//        apiKey = OtoroshiApiKey("name", "id", "secret"),
//        plan = payPerUsePlanId,
//        createdAt = DateTime.now(),
//        team = teamConsumerId,
//        api = defaultApi.id,
//        by = userTeamAdminId,
//        customName = None,
//        enabled = false,
//        rotation = None,
//        integrationToken = "test2"
//      )
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner,
//          teamConsumer.copy(subscriptions = Seq(sub1.id, sub2.id))),
//        apis = Seq(defaultApi),
//        subscriptions = Seq(sub1, sub2)
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//      val respVerif0 = httpJsonCallBlocking(
//        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
//      )(tenant, session)
//      respVerif0.status mustBe 200
//      val eventualSubs0 = json.SeqApiSubscriptionFormat.reads(respVerif0.json)
//      eventualSubs0.isSuccess mustBe true
//      eventualSubs0.get.length mustBe 2
//      eventualSubs0.get.find(_.id == sub1.id).get.enabled mustBe true
//      eventualSubs0.get.find(_.id == sub2.id).get.enabled mustBe false
//
//      val respClean = httpJsonCallBlocking(
//        path = s"/api/teams/${teamConsumerId.value}/subscriptions/_clean",
//        method = "DELETE"
//      )(tenant, session)
//      respClean.status mustBe 200
//      (respClean.json \ "done").as[Boolean] mustBe true
//      val eventualsCleanSubs = json.SeqApiSubscriptionIdFormat.reads(
//        (respClean.json \ "apiSubscriptions").as[JsArray])
//      eventualsCleanSubs.isSuccess mustBe true
//      eventualsCleanSubs.get.length mustBe 1
//      eventualsCleanSubs.get.head mustBe sub2.id
//
//      val respVerif = httpJsonCallBlocking(
//        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
//      )(tenant, session)
//      respVerif.status mustBe 200
//
//      val eventualSubs = json.SeqApiSubscriptionFormat.reads(respVerif.json)
//      eventualSubs.isSuccess mustBe true
//      eventualSubs.get.length mustBe 1
//      eventualSubs.get.head.id mustBe sub1.id
//
//    }
//  }
//
//  "a api editor" can {
//    "see his teams" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userApiEditor),
//        teams = Seq(teamOwner)
//      )
//      val session = loginWithBlocking(userApiEditor, tenant)
//      val resp = httpJsonCallBlocking("/api/me/teams")(tenant, session)
//      resp.status mustBe 200
//      val result =
//        fr.maif.otoroshi.daikoku.domain.json.SeqTeamFormat.reads(resp.json)
//      result.isSuccess mustBe true
//      result.get.size mustBe 2
//    }
//
//    "see one of his teams" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userApiEditor),
//        teams = Seq(teamOwner)
//      )
//      val session = loginWithBlocking(userApiEditor, tenant)
//      val resp =
//        httpJsonCallBlocking(s"/api/me/teams/${teamOwnerId.value}")(tenant,
//          session)
//      resp.status mustBe 200
//      val result =
//        fr.maif.otoroshi.daikoku.domain.json.TeamFormat.reads(resp.json)
//      result.isSuccess mustBe true
//      result.get.id mustBe teamOwnerId
//    }
//
//    "not see another teams" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userApiEditor),
//        teams = Seq(
//          teamConsumer.copy(
//            users = Set(UserWithPermission(userTeamUserId, Administrator))))
//      )
//      val session = loginWithBlocking(userApiEditor, tenant)
//      val resp =
//        httpJsonCallBlocking(s"/api/me/teams/${teamConsumerId.value}")(tenant,
//          session)
//      resp.status mustBe 403
//    }
//
//    "create a new api" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userApiEditor),
//        teams = Seq(teamOwner)
//      )
//
//      val api = generateApi("0", tenant.id, teamOwnerId, Seq.empty)
//      val session = loginWithBlocking(userApiEditor, tenant)
//      val resp = httpJsonCallBlocking(path =
//        s"/api/teams/${teamOwnerId.value}/apis",
//        method = "POST",
//        body = Some(api.asJson))(tenant, session)
//
//      resp.status mustBe 201
//      val result =
//        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(resp.json)
//      result.isSuccess mustBe true
//      result.get.equals(api) mustBe true
//    }
//
//    "not update an api of a team which he is not a member" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userApiEditor),
//        teams = Seq(teamOwner),
//        apis = Seq(defaultApi,
//          defaultApi.copy(id = ApiId("another-api"),
//            description = "another-api",
//            team = teamConsumerId))
//      )
//
//      val updatedApi = defaultApi.copy(description = "description")
//      val session = loginWithBlocking(userApiEditor, tenant)
//
//      val respError = httpJsonCallBlocking(
//        path = s"/api/teams/${teamOwnerId.value}/apis/another-api",
//        method = "PUT",
//        body = Some(updatedApi.asJson))(tenant, session)
//
//      respError.status mustBe 404
//
//      val respError2 = httpJsonCallBlocking(
//        path = s"/api/teams/${teamConsumerId.value}/apis/another-api",
//        method = "PUT",
//        body = Some(updatedApi.asJson))(tenant, session)
//
//      respError2.status mustBe 404
//    }
//
//    "update an api of his team" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userApiEditor),
//        teams = Seq(teamOwner),
//        apis = Seq(defaultApi,
//          defaultApi.copy(id = ApiId("another-api"),
//            description = "another-api",
//            team = teamOwnerId))
//      )
//
//      val updatedApi = defaultApi.copy(description = "description")
//      val session = loginWithBlocking(userApiEditor, tenant)
//
//      val resp = httpJsonCallBlocking(
//        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}",
//        method = "PUT",
//        body = Some(updatedApi.asJson))(tenant, session)
//
//      resp.status mustBe 200
//      val result =
//        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(resp.json)
//      result.isSuccess mustBe true
//      result.get.description.equals("description") mustBe true
//
//      val respGet =
//        httpJsonCallBlocking(path =
//          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}")(
//          tenant,
//          session)
//
//      respGet.status mustBe 200
//      val resultAsApi =
//        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(respGet.json)
//      resultAsApi.isSuccess mustBe true
//      resultAsApi.get.description.equals("description") mustBe true
//    }
//
//    "delete an api of his team" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userApiEditor),
//        teams = Seq(teamOwner),
//        apis = Seq(defaultApi)
//      )
//
//      val session = loginWithBlocking(userApiEditor, tenant)
//      val resp = httpJsonCallBlocking(
//        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}",
//        method = "DELETE")(tenant, session)
//      resp.status mustBe 200
//      (resp.json \ "done").as[Boolean] mustBe true
//    }
//
//    "not delete an api of a team which he's not a member" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userApiEditor),
//        teams = Seq(teamOwner),
//        apis = Seq(defaultApi.copy(team = teamConsumerId))
//      )
//
//      val session = loginWithBlocking(userApiEditor, tenant)
//      val resp = httpJsonCallBlocking(
//        path = s"/api/teams/${teamConsumerId.value}/apis/${defaultApi.id}",
//        method = "DELETE")(tenant, session)
//      resp.status mustBe 404
//
//      val resp2 = httpJsonCallBlocking(
//        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id}",
//        method = "DELETE")(tenant, session)
//      resp2.status mustBe 404
//    }
//
//    "subscribe to an api and update the custom name only if not showApiKeyOnlyToAdmin" in {
//      val teamIdWithApiKeyVisible = TeamId("team-consumer-with-apikey-visible")
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userApiEditor),
//        teams = Seq(
//          teamOwner,
//          teamConsumer.copy(
//            users = Set(UserWithPermission(userApiEditorId, ApiEditor))),
//          teamConsumer.copy(
//            id = teamIdWithApiKeyVisible,
//            showApiKeyOnlyToAdmins = false,
//            users = Set(UserWithPermission(userApiEditorId, ApiEditor)))
//        ),
//        apis = Seq(defaultApi)
//      )
//      val session = loginWithBlocking(userApiEditor, tenant)
//      val plan = "1"
//      var resp = httpJsonCallBlocking(
//        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
//        method = "POST",
//        body = Some(
//          Json.obj("plan" -> plan, "teams" -> Json.arr(teamConsumer.id.asJson)))
//      )(tenant, session)
//
//      resp.status mustBe 200
//      var result = (resp.json \ 0).as[JsObject]
//      (result \ "creation").as[String] mustBe "done"
//
//      var resultAsSubscription =
//        fr.maif.otoroshi.daikoku.domain.json.ApiSubscriptionFormat
//          .reads((result \ "subscription").as[JsObject])
//      resultAsSubscription.isSuccess mustBe true
//      val subscription = resultAsSubscription.get
//      subscription.plan.value mustBe plan
//      subscription.team mustBe teamConsumerId
//      subscription.by mustBe userApiEditorId
//
//      val respUpdate = httpJsonCallBlocking(
//        path =
//          s"/api/teams/${teamConsumerId.value}/subscriptions/${subscription.id.value}/name",
//        method = "POST",
//        body = Some(Json.obj("customName" -> "test api key"))
//      )(tenant, session)
//      respUpdate.status mustBe 403
//
//      //with team with showApiKeyOnlyToAdmins=false
//      val resp2 = httpJsonCallBlocking(
//        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
//        method = "POST",
//        body = Some(
//          Json.obj("plan" -> plan,
//            "teams" -> Json.arr(teamIdWithApiKeyVisible.asJson)))
//      )(tenant, session)
//
//      resp2.status mustBe 200
//      val result2 = (resp2.json \ 0).as[JsObject]
//      (result2 \ "creation").as[String] mustBe "done"
//
//      val resultAsSubscription2 =
//        fr.maif.otoroshi.daikoku.domain.json.ApiSubscriptionFormat
//          .reads((result2 \ "subscription").as[JsObject])
//      resultAsSubscription2.isSuccess mustBe true
//      val subscription2 = resultAsSubscription2.get
//
//      val respUpdateError = httpJsonCallBlocking(
//        path =
//          s"/api/teams/${teamIdWithApiKeyVisible.value}/subscriptions/${subscription.id.value}/name",
//        method = "POST",
//        body = Some(Json.obj("customName" -> "test api key"))
//      )(tenant, session)
//      respUpdateError.status mustBe 404
//
//      val respUpdateOk = httpJsonCallBlocking(
//        path =
//          s"/api/teams/${teamIdWithApiKeyVisible.value}/subscriptions/${subscription2.id.value}/name",
//        method = "POST",
//        body = Some(Json.obj("customName" -> "test api key"))
//      )(tenant, session)
//      respUpdateOk.status mustBe 200
//
//      val respSubs = httpJsonCallBlocking(
//        path =
//          s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamIdWithApiKeyVisible.value}"
//      )(tenant, session)
//      respSubs.status mustBe 200
//      val resultAsUpdatedSubscription =
//        fr.maif.otoroshi.daikoku.domain.json.ApiSubscriptionFormat
//          .reads((respSubs.json \ 0).as[JsObject])
//
//      resultAsUpdatedSubscription.isSuccess mustBe true
//      resultAsUpdatedSubscription.get.customName mustBe Some("test api key")
//    }
//
//    "not delete a subscription" in {
//      val payPerUsePlanId = UsagePlanId("5")
//      val payperUseSub = ApiSubscription(
//        id = ApiSubscriptionId("test"),
//        tenant = tenant.id,
//        apiKey = OtoroshiApiKey("name", "id", "secret"),
//        plan = payPerUsePlanId,
//        createdAt = DateTime.now(),
//        team = teamConsumerId,
//        api = defaultApi.id,
//        by = daikokuAdminId,
//        customName = None,
//        rotation = None,
//        integrationToken = "test"
//      )
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userApiEditor),
//        teams = Seq(teamOwner, teamConsumer),
//        apis = Seq(defaultApi),
//        subscriptions = Seq(payperUseSub)
//      )
//
//      val plan =
//        defaultApi.possibleUsagePlans.find(p => p.id == payPerUsePlanId).get
//      val otoroshiTarget = plan.otoroshiTarget
//      val callPerSec = 100L
//      val callPerDay = 1000L
//      val callPerMonth = 2000L
//
//      val session = loginWithBlocking(userApiEditor, tenant)
//      wireMockServer.isRunning mustBe true
//      val path = otoroshiDeleteApikeyPath(otoroshiTarget.get.serviceGroup.value,
//        payperUseSub.apiKey.clientId)
//      stubFor(
//        get(urlMatching(s"$otoroshiPathStats.*"))
//          .willReturn(
//            aResponse()
//              .withBody(
//                Json.stringify(
//                  Json.obj("hits" -> Json.obj("count" -> 2000))
//                )
//              )
//              .withStatus(200)
//          )
//      )
//      val groupPath = otoroshiPathGroup(otoroshiTarget.get.serviceGroup.value)
//      stubFor(
//        get(urlMatching(s"$groupPath.*"))
//          .willReturn(
//            aResponse()
//              .withBody(
//                Json.stringify(
//                  Json.obj("id" -> otoroshiTarget.get.serviceGroup.value,
//                    "name" -> "name",
//                    "description" -> "No Description")
//                )
//              )
//              .withStatus(200)
//          )
//      )
//      val otoPathQuotas =
//        otoroshiPathApiKeyQuotas(otoroshiTarget.get.serviceGroup.value,
//          payperUseSub.apiKey.clientId)
//      stubFor(
//        get(urlMatching(s"$otoPathQuotas.*"))
//          .willReturn(
//            aResponse()
//              .withBody(
//                Json.stringify(
//                  ApiKeyQuotas(
//                    authorizedCallsPerSec =
//                      plan.maxRequestPerSecond.getOrElse(0),
//                    currentCallsPerSec = callPerSec,
//                    remainingCallsPerSec = plan.maxRequestPerSecond.getOrElse(
//                      0L) - callPerSec,
//                    authorizedCallsPerDay = plan.maxRequestPerDay.getOrElse(0),
//                    currentCallsPerDay = callPerDay,
//                    remainingCallsPerDay = plan.maxRequestPerDay
//                      .getOrElse(0L) - callPerDay,
//                    authorizedCallsPerMonth =
//                      plan.maxRequestPerMonth.getOrElse(0),
//                    currentCallsPerMonth = callPerMonth,
//                    remainingCallsPerMonth = plan.maxRequestPerMonth.getOrElse(
//                      0L) - callPerMonth
//                  ).asJson
//                )
//              )
//              .withStatus(200)
//          )
//      )
//      stubFor(
//        delete(urlMatching(s"$path.*"))
//          .willReturn(
//            aResponse()
//              .withBody(
//                Json.stringify(
//                  Json.obj("deleted" -> true)
//                )
//              )
//              .withStatus(200)
//          )
//      )
//
//      val resp = httpJsonCallBlocking(
//        path =
//          s"/api/teams/${teamConsumerId.value}/subscriptions/${payperUseSub.id.value}/_delete",
//        method = "DELETE"
//      )(tenant, session)
//      resp.status mustBe 403
//    }
//
//    "not archive a subscription" in {
//      val payPerUsePlanId = UsagePlanId("5")
//      val sub1 = ApiSubscription(
//        id = ApiSubscriptionId("test"),
//        tenant = tenant.id,
//        apiKey = OtoroshiApiKey("name", "id", "secret"),
//        plan = payPerUsePlanId,
//        createdAt = DateTime.now(),
//        team = teamConsumerId,
//        api = defaultApi.id,
//        by = userTeamAdminId,
//        customName = None,
//        rotation = None,
//        integrationToken = "test"
//      )
//      val sub2 = ApiSubscription(
//        id = ApiSubscriptionId("test2"),
//        tenant = tenant.id,
//        apiKey = OtoroshiApiKey("name", "id", "secret"),
//        plan = payPerUsePlanId,
//        createdAt = DateTime.now(),
//        team = teamConsumerId,
//        api = defaultApi.id,
//        by = userTeamAdminId,
//        customName = None,
//        enabled = false,
//        rotation = None,
//        integrationToken = "test2"
//      )
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userApiEditor),
//        teams = Seq(teamOwner,
//          teamConsumer.copy(subscriptions = Seq(sub1.id, sub2.id))),
//        apis = Seq(defaultApi),
//        subscriptions = Seq(sub1, sub2)
//      )
//
//      val session = loginWithBlocking(userApiEditor, tenant)
//
//      val respClean = httpJsonCallBlocking(
//        path = s"/api/teams/${teamConsumerId.value}/subscriptions/_clean",
//        method = "DELETE"
//      )(tenant, session)
//      respClean.status mustBe 403
//    }
//  }
//
//  "a user" can {
//    "see his teams" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(user),
//        teams = Seq(teamOwner, teamConsumer)
//      )
//      val session = loginWithBlocking(user, tenant)
//      val resp = httpJsonCallBlocking("/api/me/teams")(tenant, session)
//      resp.status mustBe 200
//      val result =
//        fr.maif.otoroshi.daikoku.domain.json.SeqTeamFormat.reads(resp.json)
//      result.isSuccess mustBe true
//      result.get.size mustBe 3
//    }
//
//    "see one of his teams" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(user),
//        teams = Seq(teamOwner)
//      )
//      val session = loginWithBlocking(user, tenant)
//      val resp =
//        httpJsonCallBlocking(s"/api/me/teams/${teamOwnerId.value}")(tenant,
//          session)
//      resp.status mustBe 200
//      val result =
//        fr.maif.otoroshi.daikoku.domain.json.TeamFormat.reads(resp.json)
//      result.isSuccess mustBe true
//      result.get.id mustBe teamOwnerId
//    }
//
//    "not see another teams" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(user),
//        teams = Seq(
//          teamConsumer.copy(
//            users = Set(UserWithPermission(userTeamAdminId, Administrator))))
//      )
//      val session = loginWithBlocking(user, tenant)
//      val resp =
//        httpJsonCallBlocking(s"/api/me/teams/${teamConsumerId.value}")(tenant,
//          session)
//      resp.status mustBe 403
//    }
//
//    "not create a new api" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(user),
//        teams = Seq(teamOwner)
//      )
//      val api = generateApi("0", tenant.id, teamOwnerId, Seq.empty)
//
//      val session = loginWithBlocking(user, tenant)
//      val resp = httpJsonCallBlocking(path =
//        s"/api/teams/${teamOwnerId.value}/apis",
//        method = "POST",
//        body = Some(api.asJson))(tenant, session)
//
//      resp.status mustBe 403
//    }
//
//    "not update an api" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(user),
//        teams = Seq(teamOwner),
//        apis = Seq(defaultApi)
//      )
//
//      val updatedApi = defaultApi.copy(description = "description")
//      val session = loginWithBlocking(user, tenant)
//      val resp = httpJsonCallBlocking(
//        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id}",
//        method = "PUT",
//        body = Some(updatedApi.asJson))(tenant, session)
//
//      resp.status mustBe 403
//    }
//
//    "not delete an api" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(user),
//        teams = Seq(teamOwner),
//        apis = Seq(defaultApi)
//      )
//
//      val session = loginWithBlocking(user, tenant)
//      val resp = httpJsonCallBlocking(
//        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id}",
//        method = "DELETE")(tenant, session)
//
//      resp.status mustBe 403
//    }
//
//    "subscribe to an api and update the custom name only if not showApiKeyOnlyToAdmin" in {
//      val teamIdWithApiKeyVisible = TeamId("team-consumer-with-apikey-visible")
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userApiEditor),
//        teams = Seq(
//          teamOwner,
//          teamConsumer.copy(
//            users = Set(UserWithPermission(userApiEditorId, ApiEditor))),
//          teamConsumer.copy(
//            id = teamIdWithApiKeyVisible,
//            showApiKeyOnlyToAdmins = false,
//            users = Set(UserWithPermission(userApiEditorId, ApiEditor)))
//        ),
//        apis = Seq(defaultApi)
//      )
//      val session = loginWithBlocking(userApiEditor, tenant)
//      val plan = "1"
//      val resp = httpJsonCallBlocking(
//        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
//        method = "POST",
//        body = Some(
//          Json.obj("plan" -> plan,
//            "teams" -> Json.arr(teamConsumer.id.asJson,
//              teamIdWithApiKeyVisible.asJson)))
//      )(tenant, session)
//
//      resp.status mustBe 200
//
//      val resultAsSubscription =
//        fr.maif.otoroshi.daikoku.domain.json.ApiSubscriptionFormat
//          .reads((resp.json \ 0 \ "subscription").as[JsObject])
//
//      resultAsSubscription.isSuccess mustBe true
//      val subscription = resultAsSubscription.get
//      subscription.plan.value mustBe plan
//      subscription.team mustBe teamConsumerId
//      subscription.by mustBe userApiEditorId
//
//      val respUpdate = httpJsonCallBlocking(
//        path =
//          s"/api/teams/${teamConsumerId.value}/subscriptions/${subscription.id.value}/name",
//        method = "POST",
//        body = Some(Json.obj("customName" -> "test api key"))
//      )(tenant, session)
//      respUpdate.status mustBe 403
//
//      //with team with showApiKeyOnlyToAdmins=false
//      val resultAsSubscription2 =
//        fr.maif.otoroshi.daikoku.domain.json.ApiSubscriptionFormat
//          .reads((resp.json \ 1 \ "subscription").as[JsObject])
//      resultAsSubscription2.isSuccess mustBe true
//      val subscription2 = resultAsSubscription2.get
//
//      val respUpdateOk = httpJsonCallBlocking(
//        path =
//          s"/api/teams/${teamIdWithApiKeyVisible.value}/subscriptions/${subscription2.id.value}/name",
//        method = "POST",
//        body = Some(Json.obj("customName" -> "test api key"))
//      )(tenant, session)
//      respUpdateOk.status mustBe 200
//
//      val respSubs = httpJsonCallBlocking(
//        path =
//          s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamIdWithApiKeyVisible.value}"
//      )(tenant, session)
//      respSubs.status mustBe 200
//      val resultAsUpdatedSubscription =
//        fr.maif.otoroshi.daikoku.domain.json.ApiSubscriptionFormat
//          .reads((respSubs.json \ 0).as[JsObject])
//
//      resultAsUpdatedSubscription.isSuccess mustBe true
//      resultAsUpdatedSubscription.get.customName mustBe Some("test api key")
//    }
//
//    "not delete a subscription" in {
//      val payPerUsePlanId = UsagePlanId("5")
//      val payperUseSub = ApiSubscription(
//        id = ApiSubscriptionId("test"),
//        tenant = tenant.id,
//        apiKey = OtoroshiApiKey("name", "id", "secret"),
//        plan = payPerUsePlanId,
//        createdAt = DateTime.now(),
//        team = teamConsumerId,
//        api = defaultApi.id,
//        by = daikokuAdminId,
//        customName = None,
//        rotation = None,
//        integrationToken = "test"
//      )
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(user),
//        teams = Seq(teamOwner, teamConsumer),
//        apis = Seq(defaultApi),
//        subscriptions = Seq(payperUseSub)
//      )
//
//      val plan =
//        defaultApi.possibleUsagePlans.find(p => p.id == payPerUsePlanId).get
//      val otoroshiTarget = plan.otoroshiTarget
//      val callPerSec = 100L
//      val callPerDay = 1000L
//      val callPerMonth = 2000L
//
//      val session = loginWithBlocking(user, tenant)
//      wireMockServer.isRunning mustBe true
//      val path = otoroshiDeleteApikeyPath(otoroshiTarget.get.serviceGroup.value,
//        payperUseSub.apiKey.clientId)
//      stubFor(
//        get(urlMatching(s"$otoroshiPathStats.*"))
//          .willReturn(
//            aResponse()
//              .withBody(
//                Json.stringify(
//                  Json.obj("hits" -> Json.obj("count" -> 2000))
//                )
//              )
//              .withStatus(200)
//          )
//      )
//      val groupPath = otoroshiPathGroup(otoroshiTarget.get.serviceGroup.value)
//      stubFor(
//        get(urlMatching(s"$groupPath.*"))
//          .willReturn(
//            aResponse()
//              .withBody(
//                Json.stringify(
//                  Json.obj("id" -> otoroshiTarget.get.serviceGroup.value,
//                    "name" -> "name",
//                    "description" -> "No Description")
//                )
//              )
//              .withStatus(200)
//          )
//      )
//      val otoPathQuotas =
//        otoroshiPathApiKeyQuotas(otoroshiTarget.get.serviceGroup.value,
//          payperUseSub.apiKey.clientId)
//      stubFor(
//        get(urlMatching(s"$otoPathQuotas.*"))
//          .willReturn(
//            aResponse()
//              .withBody(
//                Json.stringify(
//                  ApiKeyQuotas(
//                    authorizedCallsPerSec =
//                      plan.maxRequestPerSecond.getOrElse(0),
//                    currentCallsPerSec = callPerSec,
//                    remainingCallsPerSec = plan.maxRequestPerSecond.getOrElse(
//                      0L) - callPerSec,
//                    authorizedCallsPerDay = plan.maxRequestPerDay.getOrElse(0),
//                    currentCallsPerDay = callPerDay,
//                    remainingCallsPerDay = plan.maxRequestPerDay
//                      .getOrElse(0L) - callPerDay,
//                    authorizedCallsPerMonth =
//                      plan.maxRequestPerMonth.getOrElse(0),
//                    currentCallsPerMonth = callPerMonth,
//                    remainingCallsPerMonth = plan.maxRequestPerMonth.getOrElse(
//                      0L) - callPerMonth
//                  ).asJson
//                )
//              )
//              .withStatus(200)
//          )
//      )
//      stubFor(
//        delete(urlMatching(s"$path.*"))
//          .willReturn(
//            aResponse()
//              .withBody(
//                Json.stringify(
//                  Json.obj("deleted" -> true)
//                )
//              )
//              .withStatus(200)
//          )
//      )
//
//      val resp = httpJsonCallBlocking(
//        path =
//          s"/api/teams/${teamConsumerId.value}/subscriptions/${payperUseSub.id.value}/_delete",
//        method = "DELETE"
//      )(tenant, session)
//      resp.status mustBe 403
//    }
//
//    "not archive a subscription" in {
//      val payPerUsePlanId = UsagePlanId("5")
//      val sub1 = ApiSubscription(
//        id = ApiSubscriptionId("test"),
//        tenant = tenant.id,
//        apiKey = OtoroshiApiKey("name", "id", "secret"),
//        plan = payPerUsePlanId,
//        createdAt = DateTime.now(),
//        team = teamConsumerId,
//        api = defaultApi.id,
//        by = userTeamAdminId,
//        customName = None,
//        rotation = None,
//        integrationToken = "test"
//      )
//      val sub2 = ApiSubscription(
//        id = ApiSubscriptionId("test2"),
//        tenant = tenant.id,
//        apiKey = OtoroshiApiKey("name", "id", "secret"),
//        plan = payPerUsePlanId,
//        createdAt = DateTime.now(),
//        team = teamConsumerId,
//        api = defaultApi.id,
//        by = userTeamAdminId,
//        customName = None,
//        enabled = false,
//        rotation = None,
//        integrationToken = "test2"
//      )
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(user),
//        teams = Seq(teamOwner,
//          teamConsumer.copy(subscriptions = Seq(sub1.id, sub2.id))),
//        apis = Seq(defaultApi),
//        subscriptions = Seq(sub1, sub2)
//      )
//
//      val session = loginWithBlocking(user, tenant)
//
//      val respClean = httpJsonCallBlocking(
//        path = s"/api/teams/${teamConsumerId.value}/subscriptions/_clean",
//        method = "DELETE"
//      )(tenant, session)
//      respClean.status mustBe 403
//    }
//  }
//
//  "a subscription" should {
//    "be not available right now if plan's subscription process is manual" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner, teamConsumer),
//        apis = Seq(defaultApi.copy(possibleUsagePlans = Seq(QuotasWithLimits(
//          UsagePlanId("1"),
//          10000,
//          10000,
//          10000,
//          BigDecimal(10.0),
//          billingDuration = BillingDuration(1, BillingTimeUnit.Month),
//          trialPeriod = None,
//          currency = Currency("EUR"),
//          customName = None,
//          customDescription = None,
//          otoroshiTarget = Some(
//            OtoroshiTarget(OtoroshiSettingsId("default"),
//              OtoroshiServiceGroupId("12345"))
//          ),
//          allowMultipleKeys = Some(false),
//          subscriptionProcess = SubscriptionProcess.Manual,
//          integrationProcess = IntegrationProcess.ApiKey,
//          autoRotation = Some(false)
//        ))))
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//      val plan = "1"
//      val resp = httpJsonCallBlocking(
//        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
//        method = "POST",
//        body = Some(
//          Json.obj("plan" -> plan, "teams" -> Json.arr(teamConsumer.id.asJson)))
//      )(tenant, session)
//
//      resp.status mustBe 200
//      val result = (resp.json \ 0).as[JsObject]
//      (result \ "creation").as[String] mustBe "waiting"
//
//      val respSubs = httpJsonCallBlocking(
//        path =
//          s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
//      )(tenant, session)
//      respSubs.status mustBe 200
//      val resultAsSubscriptions = (respSubs.json).as[Seq[JsObject]]
//
//      resultAsSubscriptions.length mustBe 0
//
//    }
//
//    "be possible just one time if the option is default" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner, teamConsumer),
//        apis = Seq(defaultApi)
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//      val plan = "1"
//
//      for (n <- Seq(1, 2, 3)) {
//        val resp = httpJsonCallBlocking(
//          path = s"/api/apis/${defaultApi.id.value}/subscriptions",
//          method = "POST",
//          body = Some(
//            Json.obj("plan" -> plan,
//              "teams" -> Json.arr(teamConsumer.id.asJson)))
//        )(tenant, session)
//
//        if (n == 1) {
//          resp.status mustBe 200
//          val result = (resp.json \ 0).as[JsObject]
//          (result \ "creation").as[String] mustBe "done"
//        } else {
//          resp.status mustBe 200
//          val result = (resp.json \ 0).as[JsObject]
//          (result \ "error")
//            .as[String]
//            .toLowerCase()
//            .contains("conflict") mustBe true
//        }
//      }
//
//      val respSubs = httpJsonCallBlocking(
//        path =
//          s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
//      )(tenant, session)
//      respSubs.status mustBe 200
//      val resultAsSubscriptions = (respSubs.json).as[Seq[JsObject]]
//
//      resultAsSubscriptions.length mustBe 1
//    }
//
//    "be possible many times if the option is ok" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner, teamConsumer),
//        apis = Seq(defaultApi)
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//      val plan = "4" //plan with allow multiple keys set to true
//
//      for (_ <- Seq(1, 2, 3)) {
//        val resp = httpJsonCallBlocking(
//          path = s"/api/apis/${defaultApi.id.value}/subscriptions",
//          method = "POST",
//          body = Some(
//            Json.obj("plan" -> plan,
//              "teams" -> Json.arr(teamConsumer.id.asJson)))
//        )(tenant, session)
//
//        resp.status mustBe 200
//        val result = (resp.json \ 0).as[JsObject]
//        (result \ "creation").as[String] mustBe "done"
//      }
//
//      val respSubs = httpJsonCallBlocking(
//        path =
//          s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
//      )(tenant, session)
//      respSubs.status mustBe 200
//      val resultAsSubscriptions = (respSubs.json).as[Seq[JsObject]]
//
//      resultAsSubscriptions.length mustBe 3
//    }
//
//    "be impossible if api is private and team isn't authorized" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner, teamConsumer),
//        apis = Seq(defaultApi.copy(visibility = ApiVisibility.Private))
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//      val plan = "1"
//      val resp = httpJsonCallBlocking(
//        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
//        method = "POST",
//        body = Some(
//          Json.obj("plan" -> plan, "teams" -> Json.arr(teamConsumer.id.asJson)))
//      )(tenant, session)
//
//      resp.status mustBe 200
//      val result = (resp.json \ 0).as[JsObject]
//      (result \ "error")
//        .as[String]
//        .toLowerCase()
//        .contains("not authorized") mustBe true
//    }
//
//    "be impossible if api is publicWithAuthorization and team isn't authorized" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner, teamConsumer),
//        apis = Seq(
//          defaultApi.copy(visibility = ApiVisibility.PublicWithAuthorizations))
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//      val plan = "1"
//      val resp = httpJsonCallBlocking(
//        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
//        method = "POST",
//        body = Some(
//          Json.obj("plan" -> plan, "teams" -> Json.arr(teamConsumer.id.asJson)))
//      )(tenant, session)
//
//      resp.status mustBe 200
//      val result = (resp.json \ 0).as[JsObject]
//      (result \ "error")
//        .as[String]
//        .toLowerCase()
//        .contains("not authorized") mustBe true
//    }
//
//    "be just visible for admin if apiKeyOnlyVisibleToAdmin" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin, user),
//        teams = Seq(teamOwner, teamConsumer.copy(showApiKeyOnlyToAdmins = true)),
//        apis = Seq(defaultApi)
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//      val plan = "1"
//      val resp = httpJsonCallBlocking(
//        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
//        method = "POST",
//        body = Some(
//          Json.obj("plan" -> plan, "teams" -> Json.arr(teamConsumer.id.asJson)))
//      )(tenant, session)
//
//      resp.status mustBe 200
//      val result = (resp.json \ 0).as[JsObject]
//      (result \ "creation").as[String] mustBe "done"
//
//      val respAdmin = httpJsonCallBlocking(
//        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
//      )(tenant, session)
//      respAdmin.status mustBe 200
//
//      val userSession = loginWithBlocking(user, tenant)
//      val respUser = httpJsonCallBlocking(
//        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
//      )(tenant, userSession)
//      respUser.status mustBe 403
//    }
//
//    "be accessible by team member only" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin, user),
//        teams =
//          Seq(teamOwner.copy(
//            users = Set(UserWithPermission(user.id, Administrator))),
//            teamConsumer.copy(
//              users = Set(UserWithPermission(userAdmin.id, Administrator)))),
//        apis = Seq(defaultApi)
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//      val plan = "1"
//      val resp = httpJsonCallBlocking(
//        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
//        method = "POST",
//        body = Some(
//          Json.obj("plan" -> plan, "teams" -> Json.arr(teamConsumer.id.asJson)))
//      )(tenant, session)
//
//      resp.status mustBe 200
//      val result = (resp.json \ 0).as[JsObject]
//      (result \ "creation").as[String] mustBe "done"
//
//      val respAdmin = httpJsonCallBlocking(
//        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
//      )(tenant, session)
//      respAdmin.status mustBe 200
//
//      val userSession = loginWithBlocking(user, tenant)
//      val respUser = httpJsonCallBlocking(
//        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
//      )(tenant, userSession)
//      respUser.status mustBe 403
//
//      val respCreationUser = httpJsonCallBlocking(
//        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
//        method = "POST",
//        body = Some(
//          Json.obj("plan" -> "2", "teams" -> Json.arr(teamConsumer.id.asJson)))
//      )(tenant, userSession)
//
//      respCreationUser.status mustBe 200
//      (respCreationUser.json \ 0 \ "error")
//        .as[String]
//        .toLowerCase()
//        .contains("not authorized") mustBe true
//    }
//  }
//
//  "an api" can {
//    "not have the same name as another" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner, teamConsumer),
//        apis = Seq(defaultApi.copy(name = "test name api"))
//      )
//
//      val names = Seq(
//        "test" -> false,
//        "test name api" -> true,
//        "TEST NAME API" -> true,
//        "test name api " -> true,
//        "test  name  api" -> true,
//        "test   name api" -> false,
//        "test-name-api" -> false
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//
//      names.forall(test => {
//        val respVerif = httpJsonCallBlocking(
//          path = s"/api/apis/_names",
//          method = "POST",
//          body = Some(Json.obj("name" -> test._1)))(tenant, session)
//
//        test._2 == (respVerif.json \ "exists").as[Boolean]
//      }) mustBe true
//
////      val resp = httpJsonCallBlocking(
////        path = s"/api/teams/${teamOwnerId.value}/apis",
////        method = "POST",
////        body = Some(defaultApi.copy(id = ApiId("another-id")).asJson))(tenant,
////        session)
////
////      resp.status mustBe 409
////
////      val respVerif = httpJsonCallBlocking(
////        path = s"/api/apis/_names",
////        method = "POST",
////        body = Some(Json.obj("name" -> defaultApi.name)))(tenant, session)
////
////      respVerif.status mustBe 200
////      (respVerif.json \ "exists").as[Boolean] mustBe true
//    }
//
//    "not be accessed by another team of the owner if it is not published" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin, user),
//        teams =
//          Seq(teamOwner.copy(
//            users = Set(UserWithPermission(userAdmin.id, Administrator))),
//            teamConsumer.copy(
//              users = Set(UserWithPermission(user.id, Administrator)))),
//        apis = Seq(defaultApi.copy(published = false))
//      )
//
//      val session = loginWithBlocking(user, tenant)
//      val resp = httpJsonCallBlocking(
//        path = s"/api/me/visible-apis/${defaultApi.id.value}"
//      )(tenant, session)
//
//      resp.status mustBe 404
//      (resp.json \ "error").as[String] mustBe "Api not found"
//
//      val sessionAdmin = loginWithBlocking(userAdmin, tenant)
//      val respAdmin = httpJsonCallBlocking(
//        path = s"/api/me/visible-apis/${defaultApi.id.value}"
//      )(tenant, sessionAdmin)
//
//      respAdmin.status mustBe 200
//      (respAdmin.json \ "_id").as[String] mustBe defaultApi.id.value
//    }
//  }
//
//  "a private plan" must {
//    "be subscribed by the owner team" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner, teamConsumer),
//        apis = Seq(
//          defaultApi.copy(possibleUsagePlans = Seq(PayPerUse(
//            UsagePlanId("1"),
//            BigDecimal(10.0),
//            BigDecimal(0.02),
//            billingDuration = BillingDuration(1, BillingTimeUnit.Month),
//            trialPeriod = None,
//            currency = Currency("EUR"),
//            customName = None,
//            customDescription = None,
//            otoroshiTarget = Some(
//              OtoroshiTarget(OtoroshiSettingsId("default"),
//                OtoroshiServiceGroupId("12345"))
//            ),
//            allowMultipleKeys = Some(false),
//            visibility = Private,
//            autoRotation = Some(false),
//            subscriptionProcess = SubscriptionProcess.Automatic,
//            integrationProcess = IntegrationProcess.ApiKey
//          ))))
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//      val plan = "1"
//      val resp = httpJsonCallBlocking(
//        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
//        method = "POST",
//        body = Some(
//          Json.obj("plan" -> plan, "teams" -> Json.arr(teamOwner.id.asJson)))
//      )(tenant, session)
//
//      resp.status mustBe 200
//      val result = (resp.json \ 0).as[JsObject]
//      (result \ "creation").as[String] mustBe "done"
//
//      val resultAsSubscription =
//        fr.maif.otoroshi.daikoku.domain.json.ApiSubscriptionFormat
//          .reads((result \ "subscription").as[JsObject])
//      resultAsSubscription.isSuccess mustBe true
//      val subscription = resultAsSubscription.get
//      subscription.plan.value mustBe plan
//      subscription.team mustBe teamOwnerId
//      subscription.by mustBe userAdmin.id
//    }
//
//    "not be subscribed by another team then the owner team" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner, teamConsumer),
//        apis = Seq(
//          defaultApi.copy(possibleUsagePlans = Seq(PayPerUse(
//            UsagePlanId("1"),
//            BigDecimal(10.0),
//            BigDecimal(0.02),
//            billingDuration = BillingDuration(1, BillingTimeUnit.Month),
//            trialPeriod = None,
//            currency = Currency("EUR"),
//            customName = None,
//            customDescription = None,
//            otoroshiTarget = Some(
//              OtoroshiTarget(OtoroshiSettingsId("default"),
//                OtoroshiServiceGroupId("12345"))
//            ),
//            allowMultipleKeys = Some(false),
//            visibility = Private,
//            autoRotation = Some(false),
//            subscriptionProcess = SubscriptionProcess.Automatic,
//            integrationProcess = IntegrationProcess.ApiKey
//          ))))
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//      val plan = "1"
//      val resp = httpJsonCallBlocking(
//        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
//        method = "POST",
//        body = Some(
//          Json.obj("plan" -> plan, "teams" -> Json.arr(teamConsumer.id.asJson)))
//      )(tenant, session)
//
//      resp.status mustBe 200
//      val result = (resp.json \ 0).as[JsObject]
//      (result \ "error").as[String] mustBe "You're not authorized on this plan"
//    }
//
//    //    todo: add this test in normal plan test
//    //    "remove team subscriptions on deletion" in {
//    //
//    //      val payperUseSub = ApiSubscription(
//    //        id = ApiSubscriptionId("test-removal"),
//    //        tenant = tenant.id,
//    //        apiKey = OtoroshiApiKey("name", "id", "secret"),
//    //        plan = UsagePlanId("1"),
//    //        createdAt = DateTime.now(),
//    //        team = teamConsumerId,
//    //        api = defaultApi.id,
//    //        by = daikokuAdminId,
//    //        customName = None
//    //      )
//    //
//    //      setupEnvBlocking(
//    //        tenants = Seq(tenant),
//    //        users = Seq(userAdmin),
//    //        teams = Seq(teamOwner, teamConsumer),
//    //        apis = Seq(defaultApi.copy(possibleUsagePlans = Seq(PayPerUse(
//    //          UsagePlanId("1"),
//    //          BigDecimal(10.0),
//    //          BigDecimal(0.02),
//    //          billingDuration = BillingDuration(1, BillingTimeUnit.Month),
//    //          trialPeriod = None,
//    //          currency = Currency("EUR"),
//    //          customName = None,
//    //          customDescription = None,
//    //          otoroshiTarget = Some(
//    //            OtoroshiTarget(OtoroshiSettingsId("default"),
//    //              OtoroshiServiceGroupId("12345"))
//    //          ),
//    //          allowMultipleKeys = Some(false),
//    //          visibility = Private,
//    //          authorizedTeams = Seq(teamConsumerId)
//    //        )))),
//    //        subscriptions = Seq(payperUseSub)
//    //      )
//    //
//    //      val session = loginWithBlocking(userAdmin, tenant)
//    //
//    //      val resp = httpJsonCallBlocking(path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}",
//    //        method = "PUT",
//    //        body = Some(defaultApi.copy(possibleUsagePlans = Seq.empty).asJson))(tenant, session)
//    //
//    //      resp.status mustBe 200
//    //      val result = fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(resp.json)
//    //
//    //      //todo: test apikey removal
//    //    }
//
//    "adds all teams subscribed in authorized team after inverting visibility" in {
//      val payperUseSub = ApiSubscription(
//        id = ApiSubscriptionId("test-removal"),
//        tenant = tenant.id,
//        apiKey = OtoroshiApiKey("name", "id", "secret"),
//        plan = UsagePlanId("1"),
//        createdAt = DateTime.now(),
//        team = teamConsumerId,
//        api = defaultApi.id,
//        by = daikokuAdminId,
//        customName = None,
//        rotation = None,
//        integrationToken = "test-removal"
//      )
//
//      val api = defaultApi.copy(
//        possibleUsagePlans = Seq(PayPerUse(
//          UsagePlanId("1"),
//          BigDecimal(10.0),
//          BigDecimal(0.02),
//          billingDuration = BillingDuration(1, BillingTimeUnit.Month),
//          trialPeriod = None,
//          currency = Currency("EUR"),
//          customName = None,
//          customDescription = None,
//          otoroshiTarget = Some(
//            OtoroshiTarget(OtoroshiSettingsId("default"),
//              OtoroshiServiceGroupId("12345"))
//          ),
//          allowMultipleKeys = Some(false),
//          visibility = Public,
//          authorizedTeams = Seq.empty,
//          autoRotation = Some(false),
//          subscriptionProcess = SubscriptionProcess.Automatic,
//          integrationProcess = IntegrationProcess.ApiKey
//        )))
//
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner, teamConsumer),
//        apis = Seq(api),
//        subscriptions = Seq(payperUseSub)
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//
//      val privatePlan = api.possibleUsagePlans.head
//        .asInstanceOf[UsagePlan.PayPerUse]
//        .copy(visibility = Private)
//
//      val resp = httpJsonCallBlocking(
//        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}",
//        method = "PUT",
//        body = Some(api.copy(possibleUsagePlans = Seq(privatePlan)).asJson))(
//        tenant,
//        session)
//
//      resp.status mustBe 200
//      val result =
//        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(resp.json)
//      result.isSuccess mustBe true
//
//      result.get.possibleUsagePlans.head.authorizedTeams.length mustBe 1
//    }
//
//    "be updated after an apikey deletion" in {
//      val payPerUsePlanId = UsagePlanId("5")
//      val payperUseSub = ApiSubscription(
//        id = ApiSubscriptionId("test"),
//        tenant = tenant.id,
//        apiKey = OtoroshiApiKey("name", "id", "secret"),
//        plan = payPerUsePlanId,
//        createdAt = DateTime.now(),
//        team = teamConsumerId,
//        api = defaultApi.id,
//        by = daikokuAdminId,
//        customName = None,
//        rotation = None,
//        integrationToken = "test"
//      )
//
//      val payPerPlan = PayPerUse(
//        UsagePlanId("5"),
//        BigDecimal(10.0),
//        BigDecimal(0.02),
//        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
//        trialPeriod = None,
//        currency = Currency("EUR"),
//        customName = None,
//        customDescription = None,
//        otoroshiTarget = Some(
//          OtoroshiTarget(OtoroshiSettingsId("wiremock"),
//            OtoroshiServiceGroupId("12345"))
//        ),
//        allowMultipleKeys = Some(false),
//        visibility = Private,
//        authorizedTeams = Seq(teamConsumerId),
//        autoRotation = Some(false),
//        subscriptionProcess = SubscriptionProcess.Automatic,
//        integrationProcess = IntegrationProcess.ApiKey
//      )
//      val payPerApi = defaultApi.copy(possibleUsagePlans = Seq(payPerPlan))
//
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner,
//          teamConsumer.copy(subscriptions = Seq(payperUseSub.id))),
//        apis = Seq(payPerApi),
//        subscriptions = Seq(payperUseSub)
//      )
//
//      val otoTarget = payPerPlan.otoroshiTarget
//      val callPerSec = 100L
//      val callPerDay = 1000L
//      val callPerMonth = 2000L
//
//      val session = loginWithBlocking(userAdmin, tenant)
//      wireMockServer.isRunning mustBe true
//      val path = otoroshiDeleteApikeyPath(otoTarget.get.serviceGroup.value,
//        payperUseSub.apiKey.clientId)
//      stubFor(
//        get(urlMatching(s"$otoroshiPathStats.*"))
//          .willReturn(
//            aResponse()
//              .withBody(
//                Json.stringify(
//                  Json.obj("hits" -> Json.obj("count" -> 2000))
//                )
//              )
//              .withStatus(200)
//          )
//      )
//      val groupPath = otoroshiPathGroup(otoTarget.get.serviceGroup.value)
//      stubFor(
//        get(urlMatching(s"$groupPath.*"))
//          .willReturn(
//            aResponse()
//              .withBody(
//                Json.stringify(
//                  Json.obj("id" -> otoTarget.get.serviceGroup.value,
//                    "name" -> "name",
//                    "description" -> "No Description")
//                )
//              )
//              .withStatus(200)
//          )
//      )
//      val otoPathQuotas =
//        otoroshiPathApiKeyQuotas(otoTarget.get.serviceGroup.value,
//          payperUseSub.apiKey.clientId)
//      stubFor(
//        get(urlMatching(s"$otoPathQuotas.*"))
//          .willReturn(
//            aResponse()
//              .withBody(
//                Json.stringify(
//                  ApiKeyQuotas(
//                    authorizedCallsPerSec =
//                      payPerPlan.maxRequestPerSecond.getOrElse(0),
//                    currentCallsPerSec = callPerSec,
//                    remainingCallsPerSec = payPerPlan.maxRequestPerSecond
//                      .getOrElse(0L) - callPerSec,
//                    authorizedCallsPerDay =
//                      payPerPlan.maxRequestPerDay.getOrElse(0),
//                    currentCallsPerDay = callPerDay,
//                    remainingCallsPerDay = payPerPlan.maxRequestPerDay
//                      .getOrElse(0L) - callPerDay,
//                    authorizedCallsPerMonth =
//                      payPerPlan.maxRequestPerMonth.getOrElse(0),
//                    currentCallsPerMonth = callPerMonth,
//                    remainingCallsPerMonth = payPerPlan.maxRequestPerMonth
//                      .getOrElse(0L) - callPerMonth
//                  ).asJson
//                )
//              )
//              .withStatus(200)
//          )
//      )
//      stubFor(
//        delete(urlMatching(s"$path.*"))
//          .willReturn(
//            aResponse()
//              .withBody(
//                Json.stringify(
//                  Json.obj("deleted" -> true)
//                )
//              )
//              .withStatus(200)
//          )
//      )
//
//      val respGetStart = httpJsonCallBlocking(
//        path = s"/api/teams/${teamOwnerId.value}/apis/${payPerApi.id.value}"
//      )(tenant, session)
//      respGetStart.status mustBe 200
//      val resultStart =
//        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(respGetStart.json)
//      resultStart.isSuccess mustBe true
//      resultStart.get.possibleUsagePlans.head.authorizedTeams.length mustBe 1
//
//      val resp = httpJsonCallBlocking(
//        path =
//          s"/api/teams/${teamConsumerId.value}/subscriptions/${payperUseSub.id.value}/_delete",
//        method = "DELETE"
//      )(tenant, session)
//      resp.status mustBe 200
//
//      val respGet = httpJsonCallBlocking(
//        path = s"/api/teams/${teamOwnerId.value}/apis/${payPerApi.id.value}"
//      )(tenant, session)
//      respGet.status mustBe 200
//      val result =
//        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(respGet.json)
//      result.isSuccess mustBe true
//      result.get.possibleUsagePlans.head.authorizedTeams.length mustBe 0
//    }
//  }
//
//  "a deletion of a plan" must {
//    "delete all subscriptions" in {
//      val payperUseSub = ApiSubscription(
//        id = ApiSubscriptionId("test-removal"),
//        tenant = tenant.id,
//        apiKey = OtoroshiApiKey("name", "id", "secret"),
//        plan = UsagePlanId("1"),
//        createdAt = DateTime.now(),
//        team = teamConsumerId,
//        api = defaultApi.id,
//        by = daikokuAdminId,
//        customName = None,
//        rotation = None,
//        integrationToken = "test-removal"
//      )
//
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner,
//          teamConsumer.copy(subscriptions = Seq(payperUseSub.id))),
//        apis = Seq(
//          defaultApi.copy(possibleUsagePlans = Seq(PayPerUse(
//            UsagePlanId("1"),
//            BigDecimal(10.0),
//            BigDecimal(0.02),
//            billingDuration = BillingDuration(1, BillingTimeUnit.Month),
//            trialPeriod = None,
//            currency = Currency("EUR"),
//            customName = None,
//            customDescription = None,
//            otoroshiTarget = Some(
//              OtoroshiTarget(OtoroshiSettingsId("default"),
//                OtoroshiServiceGroupId("12345"))
//            ),
//            allowMultipleKeys = Some(false),
//            visibility = Private,
//            authorizedTeams = Seq(teamConsumerId),
//            autoRotation = Some(false),
//            subscriptionProcess = SubscriptionProcess.Automatic,
//            integrationProcess = IntegrationProcess.ApiKey
//          )))),
//        subscriptions = Seq(payperUseSub)
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//      val respGetSubsStart = httpJsonCallBlocking(path =
//        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}")(
//        tenant,
//        session)
//      respGetSubsStart.status mustBe 200
//      val resultStart =
//        fr.maif.otoroshi.daikoku.domain.json.SeqApiSubscriptionFormat
//          .reads(respGetSubsStart.json)
//      resultStart.isSuccess mustBe true
//      resultStart.get.length mustBe 1
//
//      val resp = httpJsonCallBlocking(
//        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}",
//        method = "PUT",
//        body = Some(defaultApi.copy(possibleUsagePlans = Seq.empty).asJson))(
//        tenant,
//        session)
//
//      resp.status mustBe 200
//
//      val respGetSubs = httpJsonCallBlocking(path =
//        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}")(
//        tenant,
//        session)
//      respGetSubs.status mustBe 200
//      val result = fr.maif.otoroshi.daikoku.domain.json.SeqApiSubscriptionFormat
//        .reads(respGetSubs.json)
//      result.isSuccess mustBe true
//      result.get.length mustBe 0
//    }
//  }
//  "a deletion of a api" must {
//    "delete all subscriptions" in {
//      val payperUseSub = ApiSubscription(
//        id = ApiSubscriptionId("test-removal"),
//        tenant = tenant.id,
//        apiKey = OtoroshiApiKey("name", "id", "secret"),
//        plan = UsagePlanId("1"),
//        createdAt = DateTime.now(),
//        team = teamConsumerId,
//        api = defaultApi.id,
//        by = daikokuAdminId,
//        customName = None,
//        rotation = None,
//        integrationToken = "test-removal"
//      )
//
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(teamOwner,
//          teamConsumer.copy(subscriptions = Seq(payperUseSub.id))),
//        apis = Seq(
//          defaultApi.copy(possibleUsagePlans = Seq(PayPerUse(
//            UsagePlanId("1"),
//            BigDecimal(10.0),
//            BigDecimal(0.02),
//            billingDuration = BillingDuration(1, BillingTimeUnit.Month),
//            trialPeriod = None,
//            currency = Currency("EUR"),
//            customName = None,
//            customDescription = None,
//            otoroshiTarget = Some(
//              OtoroshiTarget(OtoroshiSettingsId("default"),
//                OtoroshiServiceGroupId("12345"))
//            ),
//            allowMultipleKeys = Some(false),
//            visibility = Private,
//            authorizedTeams = Seq(teamConsumerId),
//            autoRotation = Some(false),
//            subscriptionProcess = SubscriptionProcess.Automatic,
//            integrationProcess = IntegrationProcess.ApiKey
//          )))),
//        subscriptions = Seq(payperUseSub)
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//      val respGetSubsStart = httpJsonCallBlocking(path =
//        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}")(
//        tenant,
//        session)
//      respGetSubsStart.status mustBe 200
//      val resultStart =
//        fr.maif.otoroshi.daikoku.domain.json.SeqApiSubscriptionFormat
//          .reads(respGetSubsStart.json)
//      resultStart.isSuccess mustBe true
//      resultStart.get.length mustBe 1
//
//      val resp = httpJsonCallBlocking(
//        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}",
//        method = "DELETE")(tenant, session)
//      resp.status mustBe 200
//
//      val respGetSubs = httpJsonCallBlocking(path =
//        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}")(
//        tenant,
//        session)
//      respGetSubs.status mustBe 404
//
//      val respGetTeam = httpJsonCallBlocking(
//        path = s"/api/me/teams/${teamConsumerId.value}")(tenant, session)
//      respGetTeam.status mustBe 200
//
//      val result =
//        fr.maif.otoroshi.daikoku.domain.json.TeamFormat.reads(respGetTeam.json)
//      result.isSuccess mustBe true
//      result.get.subscriptions.length mustBe 0
//    }
//  }
//
//  "an admin api" must {
//    "not be available for non daikoku admin user" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(daikokuAdmin, userAdmin),
//        teams = Seq(defaultAdminTeam, teamConsumer),
//        apis = Seq(adminApi)
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//
//      val resp = httpJsonCallBlocking(
//        path = s"/api/apis/${adminApi.id.value}/subscriptions",
//        method = "POST",
//        body = Some(
//          Json.obj("plan" -> "admin", "teams" -> Json.arr(teamConsumer.id.asJson)))
//      )(tenant, session)
//
//      resp.status mustBe 200
//      val result = (resp.json \ 0).as[JsObject]
//      result mustBe AppError.toJson(PlanUnauthorized)
//    }
//
//    "be available for daikoku admin" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(daikokuAdmin),
//        teams = Seq(defaultAdminTeam),
//        apis = Seq(adminApi)
//      )
//
//      val session = loginWithBlocking(daikokuAdmin, tenant)
//
//      val resp = httpJsonCallBlocking(
//        path = s"/api/apis/${adminApi.id.value}/subscriptions",
//        method = "POST",
//        body = Some(
//          Json.obj("plan" -> "admin", "teams" -> Json.arr(defaultAdminTeam.id.asJson)))
//      )(tenant, session)
//
//      resp.status mustBe 200
//      val result = (resp.json \ 0).as[JsObject]
//      (result \ "creation").as[String] mustBe "done"
//    }
//
//    "cannot be deleted" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(daikokuAdmin),
//        teams = Seq(defaultAdminTeam),
//        apis = Seq(adminApi)
//      )
//
//      val session = loginWithBlocking(daikokuAdmin, tenant)
//      val resp = httpJsonCallBlocking(
//        path = s"/api/teams/${defaultAdminTeam.id.value}/apis/${adminApi.id.value}",
//        method = "DELETE")(tenant, session)
//      resp.status mustBe 403
//    }
//
//    "cannot be updated except otoroshi target of admin plan" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(daikokuAdmin),
//        teams = Seq(defaultAdminTeam),
//        apis = Seq(adminApi)
//      )
//
//      val updatedAdminApi = adminApi.copy(
//        description = "new description",
//        visibility = ApiVisibility.Public,
//        currentVersion = Version("3.0.0"),
//        published = false,
//        possibleUsagePlans = Seq(
//          adminApi.possibleUsagePlans.head.asInstanceOf[Admin].copy(
//            customName = Some("test"),
//            customDescription = Some("test"),
//            otoroshiTarget = Some(OtoroshiTarget(
//              otoroshiSettings = OtoroshiSettingsId("default"),
//              serviceGroup = OtoroshiServiceGroupId("nice-group")
//            ))
//          ),
//          Admin(
//            id = UsagePlanId("test2"),
//            customName = Some("test2"),
//            customDescription = Some("test2"),
//            otoroshiTarget = Some(OtoroshiTarget(
//              otoroshiSettings = OtoroshiSettingsId("default"),
//              serviceGroup = OtoroshiServiceGroupId("nice-group")
//            )))
//        )
//      )
//      val session = loginWithBlocking(daikokuAdmin, tenant)
//
//      val resp = httpJsonCallBlocking(
//        path = s"/api/teams/${defaultAdminTeam.id.value}/apis/${adminApi.id.value}",
//        method = "PUT",
//        body = Some(updatedAdminApi.asJson))(tenant, session)
//      resp.status mustBe 200
//      val result =
//        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(resp.json)
//      result.isSuccess mustBe true
//
//      val resultAdminApi = result.get
//      resultAdminApi.description mustBe "admin api"
//      resultAdminApi.visibility mustBe ApiVisibility.AdminOnly
//      resultAdminApi.currentVersion mustBe Version("1.0.0")
//      resultAdminApi.published mustBe true
//      resultAdminApi.possibleUsagePlans.length mustBe 1
//
//      val adminPlan = resultAdminApi.possibleUsagePlans.head.asInstanceOf[Admin]
//
//      adminPlan.customName.get mustBe "Administration plan"
//      adminPlan.customDescription.get mustBe "access to admin api"
//      adminPlan.otoroshiTarget.isDefined mustBe true
//      adminPlan.otoroshiTarget.get.otoroshiSettings mustBe OtoroshiSettingsId("default")
//      adminPlan.otoroshiTarget.get.serviceGroup mustBe OtoroshiServiceGroupId("nice-group")
//    }
//  }
}
