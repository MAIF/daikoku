package fr.maif.otoroshi.daikoku.tests

import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock
import com.github.tomakehurst.wiremock.client.WireMock._
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig
import fr.maif.otoroshi.daikoku.domain.NotificationAction.{ApiAccess, ApiSubscriptionDemand}
import fr.maif.otoroshi.daikoku.domain.NotificationType.AcceptOrReject
import fr.maif.otoroshi.daikoku.domain.TeamPermission.{Administrator, ApiEditor}
import fr.maif.otoroshi.daikoku.domain.UsagePlan.{Admin, FreeWithoutQuotas, PayPerUse, QuotasWithLimits}
import fr.maif.otoroshi.daikoku.domain.UsagePlanVisibility.{Private, Public}
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.tests.utils.{DaikokuSpecHelper, OneServerPerSuiteWithMyComponents}
import org.joda.time.DateTime
import org.scalatest.BeforeAndAfterEach
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import play.api.libs.json._

import scala.util.Random

class ApiControllerSpec()
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

  "a tenant administrator" can {
    "not initialize apis for a tenant for which he's not admin" in {
      setupEnvBlocking(
        tenants = Seq(tenant, tenant2),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam, tenant2AdminTeam),
        apis = Seq.empty
      )

      val apis = Seq(
        generateApi("test-1", tenant2.id, teamOwnerId, Seq.empty),
        generateApi("test-2", tenant2.id, teamOwnerId, Seq.empty),
        generateApi("test-3", tenant2.id, teamOwnerId, Seq.empty),
      )

      val session = loginWithBlocking(tenantAdmin, tenant2)
      val resp = httpJsonCallBlocking(
        path = "/api/apis/_init",
        method = "POST",
        body = Some(json.SeqApiFormat.writes(apis)))(tenant2, session)

      resp.status mustBe 403
    }

    "not initialize apis from his tenant for a tenant for which he's not admin" in {
      setupEnvBlocking(
        tenants = Seq(tenant, tenant2),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam, tenant2AdminTeam),
        apis = Seq.empty
      )

      val apis = Seq(
        generateApi("test-1", tenant2.id, teamOwnerId, Seq.empty),
        generateApi("test-2", tenant2.id, teamOwnerId, Seq.empty),
        generateApi("test-3", tenant2.id, teamOwnerId, Seq.empty),
      )

      val session = loginWithBlocking(tenantAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = "/api/apis/_init",
        method = "POST",
        body = Some(json.SeqApiFormat.writes(apis)))(tenant, session)

      resp.status mustBe 201
      val result = resp.json
        .as[JsArray]
        .value
        .map(v => ((v \ "name").as[String], (v \ "done").as[Boolean]))

      //no api created ==> resp = []
      result.forall(tuple =>
        !apis.exists(api => api.name == tuple._1 && tuple._2)) mustBe true
    }

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
        body = Some(json.SeqApiFormat.writes(apis)))(tenant, session)

      AppLogger.info(Json.stringify(resp.json))
      resp.status mustBe 201
      val result = resp.json
        .as[JsArray]
        .value
        .map(v => ((v \ "name").as[String], (v \ "done").as[Boolean]))

      result.forall(tuple =>
        apis.exists(api => api.name == tuple._1 && tuple._2)) mustBe true
    }

    "not initialize subscriptions for a tenant for which he's not admin" in {
      setupEnvBlocking(
        tenants = Seq(tenant, tenant2),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer, tenant2AdminTeam),
        apis = Seq.empty
      )

      def generateInitSubJson(apikeyValue: String,
                              apiId: ApiId,
                              usagePlanId: UsagePlanId,
                              teamId: TeamId): JsObject =
        Json.obj(
          "apikey" -> OtoroshiApiKey(
            s"${teamId.value}.${apiId.value}.${usagePlanId.value}.$apikeyValue",
            apikeyValue,
            apikeyValue).asJson,
          "api" -> apiId.asJson,
          "plan" -> usagePlanId.asJson,
          "team" -> teamId.asJson
        )

      val apikeys = Seq(
        generateInitSubJson("1",
                            defaultApi.id,
                            UsagePlanId("1"),
                            teamConsumerId),
        generateInitSubJson("2",
                            defaultApi.id,
                            UsagePlanId("2"),
                            teamConsumerId),
        generateInitSubJson("3",
                            defaultApi.id,
                            UsagePlanId("3"),
                            teamConsumerId),
        generateInitSubJson("4",
                            defaultApi.id,
                            UsagePlanId("4"),
                            teamConsumerId),
        generateInitSubJson("5",
                            defaultApi.id,
                            UsagePlanId("5"),
                            teamConsumerId),
        generateInitSubJson("1", defaultApi.id, UsagePlanId("1"), teamOwnerId),
        generateInitSubJson("2", defaultApi.id, UsagePlanId("2"), teamOwnerId),
        generateInitSubJson("3", defaultApi.id, UsagePlanId("3"), teamOwnerId),
        generateInitSubJson("4", defaultApi.id, UsagePlanId("4"), teamOwnerId),
        generateInitSubJson("5", defaultApi.id, UsagePlanId("5"), teamOwnerId),
      )

      val session = loginWithBlocking(tenantAdmin, tenant2)
      val resp = httpJsonCallBlocking(
        path = "/api/subscriptions/_init",
        method = "POST",
        body = Some(Json.arr(apikeys))
      )(tenant2, session)

      resp.status mustBe 403
    }

    "initialize tenant subscriptions" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin, userAdmin),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(defaultApi)
      )

      def generateInitSubJson(apikeyValue: String,
                              apiId: ApiId,
                              usagePlanId: UsagePlanId,
                              teamId: TeamId): JsObject =
        Json.obj(
          "apikey" -> OtoroshiApiKey(
            s"${teamId.value}.${apiId.value}.${usagePlanId.value}.$apikeyValue",
            apikeyValue,
            apikeyValue).asJson,
          "api" -> apiId.asJson,
          "plan" -> usagePlanId.asJson,
          "team" -> teamId.asJson
        )

      val apikeys = Seq(
        generateInitSubJson("1",
                            defaultApi.id,
                            UsagePlanId("1"),
                            teamConsumerId),
        generateInitSubJson("2",
                            defaultApi.id,
                            UsagePlanId("2"),
                            teamConsumerId),
        generateInitSubJson("3",
                            defaultApi.id,
                            UsagePlanId("3"),
                            teamConsumerId),
        generateInitSubJson("4",
                            defaultApi.id,
                            UsagePlanId("4"),
                            teamConsumerId),
        generateInitSubJson("5",
                            defaultApi.id,
                            UsagePlanId("5"),
                            teamConsumerId),
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
      val result = resp.json.as[JsArray].value.map(_.as[String])

      result.forall(
        res =>
          apikeys.exists(
            apikey =>
              (apikey \ "apikey")
                .as(json.OtoroshiApiKeyFormat)
                .clientName == res)) mustBe true

      val sessionTest = loginWithBlocking(userAdmin, tenant)
      val respTestApis = httpJsonCallBlocking(
        s"/api/teams/${teamOwnerId.value}/subscribed-apis")(tenant, sessionTest)
      respTestApis.status mustBe 200
      val resultTestApis = fr.maif.otoroshi.daikoku.domain.json.SeqApiFormat
        .reads(respTestApis.json)
      resultTestApis.isSuccess mustBe true
      resultTestApis.get.length mustBe 1
      resultTestApis.get.exists(a => a.id == defaultApi.id)

      val respTestSubscriptions = httpJsonCallBlocking(
        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamOwnerId.value}")(
        tenant,
        sessionTest)
      respTestSubscriptions.status mustBe 200
      val resultTestSubscriptions =
        fr.maif.otoroshi.daikoku.domain.json.SeqApiSubscriptionFormat
          .reads(respTestSubscriptions.json)
      resultTestSubscriptions.isSuccess mustBe true
      resultTestSubscriptions.get.length mustBe 5
      Seq("1", "2", "3", "4", "5")
        .map(UsagePlanId)
        .forall(id => resultTestSubscriptions.get.exists(sub => sub.plan == id)) mustBe true

      val respTestMySubscriptions = httpJsonCallBlocking(
        s"/api/me/subscriptions/${defaultApi.id.value}")(tenant, sessionTest)
      respTestMySubscriptions.status mustBe 200
      (respTestMySubscriptions.json \ "subscriptions")
        .as[JsArray]
        .value
        .length mustBe 10

    }

    "not manipulate api if tenant api creation security is enabled & team.apisCreationPermission is disabled" in {
      setupEnvBlocking(
        tenants = Seq(tenant.copy(creationSecurity = Some(true))),
        users = Seq(daikokuAdmin),
        teams = Seq(teamOwner)
      )

      val api = generateApi("0", tenant.id, teamOwnerId, Seq.empty)
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp = httpJsonCallBlocking(path =
                                        s"/api/teams/${teamOwnerId.value}/apis",
                                      method = "POST",
                                      body = Some(api.asJson))(tenant, session)

      resp.status mustBe 403
    }
  }

  "a team administrator" can {
    "not initialize tenant apis" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin, userAdmin),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq.empty
      )

      val apis = Seq(
        generateApi("test-1", tenant.id, teamOwnerId, Seq.empty),
        generateApi("test-2", tenant.id, teamOwnerId, Seq.empty),
        generateApi("test-3", tenant.id, teamOwnerId, Seq.empty),
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = "/api/apis/_init",
        method = "POST",
        body = Some(json.SeqApiFormat.writes(apis)))(tenant, session)
      resp.status mustBe 403
    }

    "not initialize tenant subscriptions" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin, userAdmin),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(defaultApi)
      )

      def generateInitSubJson(apikeyValue: String,
                              apiId: ApiId,
                              usagePlanId: UsagePlanId,
                              teamId: TeamId): JsObject =
        Json.obj(
          "apikey" -> OtoroshiApiKey(apikeyValue, apikeyValue, apikeyValue).asJson,
          "api" -> apiId.asJson,
          "plan" -> usagePlanId.asJson,
          "team" -> teamId.asJson
        )

      val apikeys = Seq(
        generateInitSubJson("1",
                            defaultApi.id,
                            UsagePlanId("1"),
                            teamConsumerId),
        generateInitSubJson("2",
                            defaultApi.id,
                            UsagePlanId("2"),
                            teamConsumerId),
        generateInitSubJson("3",
                            defaultApi.id,
                            UsagePlanId("3"),
                            teamConsumerId),
        generateInitSubJson("4",
                            defaultApi.id,
                            UsagePlanId("4"),
                            teamConsumerId),
        generateInitSubJson("5",
                            defaultApi.id,
                            UsagePlanId("5"),
                            teamConsumerId),
        generateInitSubJson("1", defaultApi.id, UsagePlanId("1"), teamOwnerId),
        generateInitSubJson("2", defaultApi.id, UsagePlanId("2"), teamOwnerId),
        generateInitSubJson("3", defaultApi.id, UsagePlanId("3"), teamOwnerId),
        generateInitSubJson("4", defaultApi.id, UsagePlanId("4"), teamOwnerId),
        generateInitSubJson("5", defaultApi.id, UsagePlanId("5"), teamOwnerId),
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = "/api/subscriptions/_init",
        method = "POST",
        body = Some(Json.arr(apikeys))
      )(tenant, session)

      resp.status mustBe 403
    }

    "see his teams" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking("/api/me/teams")(tenant, session)
      resp.status mustBe 200
      val result =
        fr.maif.otoroshi.daikoku.domain.json.SeqTeamFormat.reads(resp.json)
      result.isSuccess mustBe true
      result.get.size mustBe 3
    }

    "see one of his teams" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp =
        httpJsonCallBlocking(s"/api/me/teams/${teamOwnerId.value}")(tenant,
                                                                    session)
      resp.status mustBe 200
      val result =
        fr.maif.otoroshi.daikoku.domain.json.TeamFormat.reads(resp.json)
      result.isSuccess mustBe true
      result.get.id mustBe teamOwnerId
    }

    "not see another teams" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(
          teamConsumer.copy(
            users = Set(UserWithPermission(userApiEditorId, Administrator))))
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp =
        httpJsonCallBlocking(s"/api/me/teams/${teamConsumerId.value}")(tenant,
                                                                       session)
      resp.status mustBe 403
    }

    "create a new api" in {
      val api = generateApi("0", tenant.id, teamOwnerId, Seq.empty)
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        apis = Seq(api)
      )

      val doubleApi = generateApi("1", tenant.id, teamOwnerId, Seq.empty)
        .copy(name = api.name)
      val session = loginWithBlocking(userAdmin, tenant)
      val resp =
        httpJsonCallBlocking(path = s"/api/teams/${teamOwnerId.value}/apis",
                             method = "POST",
                             body = Some(doubleApi.asJson))(tenant, session)

      resp.status mustBe 409
    }

    "not create an api with an existing name" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner)
      )

      val api = generateApi("0", tenant.id, teamOwnerId, Seq.empty)
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(path =
                                        s"/api/teams/${teamOwnerId.value}/apis",
                                      method = "POST",
                                      body = Some(api.asJson))(tenant, session)

      resp.status mustBe 201
      val result =
        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(resp.json)
      result.isSuccess mustBe true
      result.get.equals(api) mustBe true
    }

    "not update an api of a team which he is not a member" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi,
                   defaultApi.copy(id = ApiId("another-api"),
                                   description = "another-api",
                                   team = teamConsumerId))
      )

      val updatedApi = defaultApi.copy(description = "description")
      val session = loginWithBlocking(userAdmin, tenant)

      val respError = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/another-api",
        method = "PUT",
        body = Some(updatedApi.asJson))(tenant, session)

      respError.status mustBe 404
      (respError.json \ "error").as[String] mustBe "Api not found"

      val respError2 = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/apis/another-api",
        method = "PUT",
        body = Some(updatedApi.asJson))(tenant, session)

      respError2.status mustBe 404
    }

    "update an api of his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi,
                   defaultApi.copy(id = ApiId("another-api"),
                                   description = "another-api",
                                   team = teamOwnerId))
      )

      val updatedApi = defaultApi.copy(description = "description")
      val session = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}",
        method = "PUT",
        body = Some(updatedApi.asJson))(tenant, session)

      resp.status mustBe 200
      val result =
        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(resp.json)
      result.isSuccess mustBe true
      result.get.description.equals("description") mustBe true

      val respGet =
        httpJsonCallBlocking(path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}")(
          tenant,
          session)

      respGet.status mustBe 200
      val resultAsApi =
        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(respGet.json)
      resultAsApi.isSuccess mustBe true
      resultAsApi.get.description.equals("description") mustBe true
    }

    "delete an api of his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}",
        method = "DELETE")(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true
    }

    "not delete an api of a team which he's not a member" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi.copy(team = teamConsumerId))
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/apis/${defaultApi.id}",
        method = "DELETE")(tenant, session)
      resp.status mustBe 404

      val resp2 = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id}",
        method = "DELETE")(tenant, session)
      resp2.status mustBe 404
    }

    "not subscribe to an unpublished api" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi.copy(published = false))
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val plan = "1"
      val resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
        method = "POST",
        body = Some(
          Json.obj("plan" -> plan, "teams" -> Json.arr(teamConsumer.id.asJson)))
      )(tenant, session)

      resp.status mustBe 403
      (resp.json \ "error")
        .as[String] mustBe "You're not authorized to subscribed to an unpublished api"
    }

    "not subscribe to an api for many reasons" in {
      val planUnauthorizedApi = generateApi("unauthorized-plan",
                                            tenant.id,
                                            teamOwnerId,
                                            Seq.empty).copy(
        possibleUsagePlans = Seq(FreeWithoutQuotas(
          id = UsagePlanId("1"),
          billingDuration = BillingDuration(1, BillingTimeUnit.Month),
          currency = Currency("EUR"),
          customName = None,
          customDescription = None,
          otoroshiTarget = Some(
            OtoroshiTarget(OtoroshiSettingsId("default"),
              Some(AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345"))))
          )),
          allowMultipleKeys = Some(false),
          subscriptionProcess = SubscriptionProcess.Automatic,
          integrationProcess = IntegrationProcess.ApiKey,
          autoRotation = Some(false),
          visibility = UsagePlanVisibility.Private
        )))
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi, adminApi, planUnauthorizedApi)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val plan = "1"
      //plan not found
      var resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
        method = "POST",
        body = Some(
          Json.obj("plan" -> "test",
                   "teams" -> Json.arr(teamConsumer.id.asJson)))
      )(tenant, session)
      resp.status mustBe 404
      //team not found
      resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
        method = "POST",
        body = Some(
          Json.obj("plan" -> plan, "teams" -> Json.arr(teamAdminId.asJson)))
      )(tenant, session)
      resp.status mustBe 200
      resp.json mustBe Json.parse("[{\"team-admin\":\"team not found\"}]")
      //api not found
      resp = httpJsonCallBlocking(
        path = s"/api/apis/test/subscriptions",
        method = "POST",
        body = Some(
          Json.obj("plan" -> "toto",
                   "teams" -> Json.arr(teamConsumer.id.asJson)))
      )(tenant, session)
      resp.status mustBe 404
      //api unauthorized
      resp = httpJsonCallBlocking(
        path = s"/api/apis/${adminApi.id.value}/subscriptions",
        method = "POST",
        body = Some(
          Json.obj("plan" -> "admin",
                   "teams" -> Json.arr(teamConsumer.id.asJson)))
      )(tenant, session)

      resp.status mustBe 403
      //plan unauthorized
      resp = httpJsonCallBlocking(
        path = s"/api/apis/${planUnauthorizedApi.id.value}/subscriptions",
        method = "POST",
        body = Some(
          Json.obj("plan" -> "1", "teams" -> Json.arr(teamConsumer.id.asJson)))
      )(tenant, session)
      resp.status mustBe 200
      resp.json mustBe Json.parse(
        "[{\"error\":\"Consumer Team is not authorized on this plan\"}]")
    }

    "delete archived subscriptions" in {
      val payPerUsePlanId = UsagePlanId("5")
      val sub1 = ApiSubscription(
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
        integrationToken = "test"
      )
      val sub2 = ApiSubscription(
        id = ApiSubscriptionId("test2"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = payPerUsePlanId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.id,
        by = userTeamAdminId,
        customName = None,
        enabled = false,
        rotation = None,
        integrationToken = "test2"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner,
                    teamConsumer.copy(subscriptions = Seq(sub1.id, sub2.id))),
        apis = Seq(defaultApi),
        subscriptions = Seq(sub1, sub2)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val respVerif0 = httpJsonCallBlocking(
        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, session)
      respVerif0.status mustBe 200
      val eventualSubs0 = json.SeqApiSubscriptionFormat.reads(respVerif0.json)
      eventualSubs0.isSuccess mustBe true
      eventualSubs0.get.length mustBe 2
      eventualSubs0.get.find(_.id == sub1.id).get.enabled mustBe true
      eventualSubs0.get.find(_.id == sub2.id).get.enabled mustBe false

      val respClean = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/subscriptions/_clean",
        method = "DELETE"
      )(tenant, session)
      respClean.status mustBe 200
      (respClean.json \ "done").as[Boolean] mustBe true
      val eventualsCleanSubs = json.SeqApiSubscriptionIdFormat.reads(
        (respClean.json \ "apiSubscriptions").as[JsArray])
      eventualsCleanSubs.isSuccess mustBe true
      eventualsCleanSubs.get.length mustBe 1
      eventualsCleanSubs.get.head mustBe sub2.id

      val respVerif = httpJsonCallBlocking(
        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, session)
      respVerif.status mustBe 200

      val eventualSubs = json.SeqApiSubscriptionFormat.reads(respVerif.json)
      eventualSubs.isSuccess mustBe true
      eventualSubs.get.length mustBe 1
      eventualSubs.get.head.id mustBe sub1.id
    }

    "get subscription informations" in {
      val planSubId = UsagePlanId("1")
      val sub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = planSubId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.id,
        by = daikokuAdminId,
        customName = Some("custom name"),
        rotation = None,
        integrationToken = "test",
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer.copy(subscriptions = Seq(sub.id))),
        apis = Seq(
          defaultApi.copy(possibleUsagePlans = Seq(FreeWithoutQuotas(
            id = UsagePlanId("1"),
            billingDuration = BillingDuration(1, BillingTimeUnit.Month),
            currency = Currency("EUR"),
            customName = Some("new plan name"),
            customDescription = None,
            otoroshiTarget = Some(
              OtoroshiTarget(OtoroshiSettingsId("default"),
                Some(AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))))
            ),
            allowMultipleKeys = Some(false),
            subscriptionProcess = SubscriptionProcess.Automatic,
            integrationProcess = IntegrationProcess.ApiKey,
            autoRotation = Some(false)
          )))),
        subscriptions = Seq(sub)
      )

      val session = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/subscription/${sub.id.value}/informations"
      )(tenant, session)
      resp.status mustBe 200
      val simpleApi = (resp.json \ "api").as[JsObject]
      val simpleSub = (resp.json \ "subscription").as[JsObject]
      val simplePlan = (resp.json \ "plan").as[JsObject]

      (simpleApi \ "name").as[String] mustBe defaultApi.name
      (simpleSub \ "customName").as[String] mustBe sub.customName.get
      (simplePlan \ "customName").as[String] mustBe "new plan name"
    }

    "update a subscription to his api" in {
      val planSubId = UsagePlanId("1")
      val sub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = planSubId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.id,
        by = daikokuAdminId,
        customName = Some("custom name"),
        rotation = None,
        integrationToken = "test",
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(
          teamOwner,
          teamConsumer.copy(subscriptions = Seq(sub.id),
                            users =
                              Set(UserWithPermission(user.id, Administrator)))),
        apis = Seq(
          defaultApi.copy(possibleUsagePlans = Seq(FreeWithoutQuotas(
            id = UsagePlanId("1"),
            billingDuration = BillingDuration(1, BillingTimeUnit.Month),
            currency = Currency("EUR"),
            customName = Some("new plan name"),
            customDescription = None,
            otoroshiTarget = Some(
              OtoroshiTarget(OtoroshiSettingsId("default"),
                Some(AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))))
            ),
            allowMultipleKeys = Some(false),
            subscriptionProcess = SubscriptionProcess.Automatic,
            integrationProcess = IntegrationProcess.ApiKey,
            autoRotation = Some(false)
          )))),
        subscriptions = Seq(sub)
      )

      val plan =
        defaultApi.possibleUsagePlans.find(p => p.id == planSubId).get
      val otoroshiTarget = plan.otoroshiTarget
      val otoApiKey = ActualOtoroshiApiKey(
        clientId = sub.apiKey.clientId,
        clientSecret = sub.apiKey.clientSecret,
        clientName = sub.apiKey.clientName,
        authorizedEntities = otoroshiTarget.get.authorizedEntities.value,
        throttlingQuota = plan.maxRequestPerSecond.getOrElse(10L),
        dailyQuota = plan.maxRequestPerDay.getOrElse(10L),
        monthlyQuota = plan.maxRequestPerMonth.getOrElse(10L),
        tags = Seq(),
        restrictions = ApiKeyRestrictions(),
        metadata = Map(),
        rotation = None
      )

      val session = loginWithBlocking(userAdmin, tenant)
      wireMockServer.isRunning mustBe true
      val path = otoroshiUpdateApikeyPath(sub.apiKey.clientId)

      val groupPath = otoroshiPathGroup(otoroshiTarget.get.authorizedEntities.value.groups.head.value)
      stubFor(
        get(urlMatching(s"$groupPath.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  otoApiKey.asJson.as[JsObject] ++
                    Json.obj("id" -> otoroshiTarget.get.authorizedEntities.value.groups.head.value,
                             "name" -> otoroshiTarget.get.authorizedEntities.value.groups.head.value)
                )
              )
              .withStatus(200)
          )
      )
      stubFor(
        put(urlMatching(s"$path.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  otoApiKey.copy(enabled = false).asJson
                )
              )
              .withStatus(201)
          )
      )
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/subscriptions/${sub.id.value}",
        method = "PUT",
        body = Some(
          sub
            .copy(
              customMetadata = Some(Json.obj("foo" -> "bar")),
              customMaxPerSecond = Some(1),
              customMaxPerDay = Some(2),
              customMaxPerMonth = Some(42),
              customReadOnly = Some(true)
            )
            .asSafeJson)
      )(tenant, session)

      resp.status mustBe 200

      (resp.json \ "done").as[Boolean] mustBe true
      (resp.json \ "subscription" \ "customMetadata")
        .as[JsObject] mustBe Json.obj("foo" -> "bar")
      (resp.json \ "subscription" \ "customMaxPerSecond")
        .as[Long] mustBe 1
      (resp.json \ "subscription" \ "customMaxPerDay")
        .as[Long] mustBe 2
      (resp.json \ "subscription" \ "customMaxPerMonth")
        .as[Long] mustBe 42
      (resp.json \ "subscription" \ "customReadOnly")
        .as[Boolean] mustBe true
      (resp.json \ "subscription" \ "apiKey").as[JsObject] mustBe Json.obj(
        "clientName" -> otoApiKey.clientName)
    }

    "not update a subscription to another api (even if it's own)" in {
      val planSubId = UsagePlanId("1")
      val sub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = planSubId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.id,
        by = daikokuAdminId,
        customName = Some("custom name"),
        rotation = None,
        integrationToken = "test",
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer.copy(subscriptions = Seq(sub.id))),
        apis = Seq(
          defaultApi.copy(possibleUsagePlans = Seq(FreeWithoutQuotas(
            id = UsagePlanId("1"),
            billingDuration = BillingDuration(1, BillingTimeUnit.Month),
            currency = Currency("EUR"),
            customName = Some("new plan name"),
            customDescription = None,
            otoroshiTarget = Some(
              OtoroshiTarget(OtoroshiSettingsId("default"),
                Some(AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))))
            ),
            allowMultipleKeys = Some(false),
            subscriptionProcess = SubscriptionProcess.Automatic,
            integrationProcess = IntegrationProcess.ApiKey,
            autoRotation = Some(false)
          )))),
        subscriptions = Seq(sub)
      )

      val plan =
        defaultApi.possibleUsagePlans.find(p => p.id == planSubId).get
      val otoroshiTarget = plan.otoroshiTarget
      val otoApiKey = ActualOtoroshiApiKey(
        clientId = sub.apiKey.clientId,
        clientSecret = sub.apiKey.clientSecret,
        clientName = sub.apiKey.clientName,
        authorizedEntities = otoroshiTarget.get.authorizedEntities.value,
        throttlingQuota = plan.maxRequestPerSecond.getOrElse(10L),
        dailyQuota = plan.maxRequestPerDay.getOrElse(10L),
        monthlyQuota = plan.maxRequestPerMonth.getOrElse(10L),
        tags = Seq(),
        restrictions = ApiKeyRestrictions(),
        metadata = Map(),
        rotation = None
      )

      val session = loginWithBlocking(userAdmin, tenant)
      wireMockServer.isRunning mustBe true
      val path = otoroshiUpdateApikeyPath(sub.apiKey.clientId)

      val groupPath = otoroshiPathGroup(otoroshiTarget.get.authorizedEntities.value.groups.head.value)
      stubFor(
        get(urlMatching(s"$groupPath.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  otoApiKey.asJson.as[JsObject] ++
                    Json.obj("id" -> otoroshiTarget.get.authorizedEntities.value.groups.head.value,
                             "name" -> otoroshiTarget.get.authorizedEntities.value.groups.head.value)
                )
              )
              .withStatus(200)
          )
      )
      stubFor(
        put(urlMatching(s"$path.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  otoApiKey.copy(enabled = false).asJson
                )
              )
              .withStatus(201)
          )
      )
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/subscriptions/${sub.id.value}",
        method = "PUT",
        body = Some(
          sub.copy(customMetadata = Some(Json.obj("foo" -> "bar"))).asSafeJson)
      )(tenant, session)
      resp.status mustBe 403
    }

    "not accept subscription without custom metadata if plan requires it" in {
      val untreatedNotification = Notification(
        id = NotificationId("untreated-notification"),
        tenant = tenant.id,
        team = Some(teamOwnerId),
        sender = user,
        notificationType = AcceptOrReject,
        action = ApiAccess(defaultApi.id, teamConsumerId)
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamConsumer, teamOwner),
        apis = Seq(
          defaultApi.copy(possibleUsagePlans = Seq(QuotasWithLimits(
            UsagePlanId("3"),
            10000,
            10000,
            10000,
            BigDecimal(10.0),
            billingDuration = BillingDuration(1, BillingTimeUnit.Month),
            trialPeriod = None,
            currency = Currency("EUR"),
            customName = None,
            customDescription = None,
            otoroshiTarget = Some(
              OtoroshiTarget(
                OtoroshiSettingsId("default"),
                Some(AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))),
                ApikeyCustomization(
                  customMetadata = Seq(
                    CustomMetadata("meta1", Set.empty)
                  )
                )
              ),
            ),
            allowMultipleKeys = Some(false),
            subscriptionProcess = SubscriptionProcess.Manual,
            integrationProcess = IntegrationProcess.ApiKey,
            autoRotation = Some(false)
          )))),
        notifications = Seq(
          untreatedNotification.copy(
            action = ApiSubscriptionDemand(defaultApi.id,
                                           UsagePlanId("3"),
                                           teamConsumerId))
        )
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/notifications/${untreatedNotification.id.value}/accept",
        method = "PUT",
        body = Some(Json.obj())
      )(tenant, session)
      resp.status mustBe 400
      (resp.json \ "error")
        .as[String] mustBe "You need to provide custom metadata"
    }

    "not manipulate api if tenant api creation security is enabled & team.apisCreationPermission is disabled" in {
      setupEnvBlocking(
        tenants = Seq(tenant.copy(creationSecurity = Some(true))),
        users = Seq(userAdmin),
        teams = Seq(teamOwner)
      )

      val api = generateApi("0", tenant.id, teamOwnerId, Seq.empty)
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(path =
                                        s"/api/teams/${teamOwnerId.value}/apis",
                                      method = "POST",
                                      body = Some(api.asJson))(tenant, session)

      resp.status mustBe 403
    }

    "manipulate api if tenant api creation security is enabled & team.apisCreationPermission is enabled" in {
      setupEnvBlocking(
        tenants = Seq(tenant.copy(creationSecurity = Some(true))),
        users = Seq(userAdmin),
        teams = Seq(teamOwner.copy(apisCreationPermission = Some(true)))
      )

      val api = generateApi("0", tenant.id, teamOwnerId, Seq.empty)
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(path =
                                        s"/api/teams/${teamOwnerId.value}/apis",
                                      method = "POST",
                                      body = Some(api.asJson))(tenant, session)

      resp.status mustBe 201
    }

    "not subscribe to an api with his personnal team if tenant enabled subscription security" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamConsumer.copy(`type` = TeamType.Personal), teamOwner),
        apis = Seq(defaultApi)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val plan = "1"
      val respPersonal = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
        method = "POST",
        body = Some(
          Json.obj("plan" -> plan, "teams" -> Json.arr(teamConsumer.id.asJson)))
      )(tenant, session)

      respPersonal.status mustBe 200
      val responsePersonal: JsValue = (respPersonal.json)
        .as[JsArray]
        .value
        .head
      (responsePersonal \ "error")
        .as[String] mustBe s"${teamConsumer.name} is not authorized to subscribe to an api"

      val respOrg = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
        method = "POST",
        body = Some(
          Json.obj("plan" -> plan, "teams" -> Json.arr(teamOwner.id.asJson)))
      )(tenant, session)

      respOrg.status mustBe 200
      val resultOrg = (respOrg.json \ 0).as[JsObject]
      (resultOrg \ "creation").as[String] mustBe "done"
    }
  }

  "a api editor" can {
    "see his teams" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(userApiEditor, tenant)
      val resp = httpJsonCallBlocking("/api/me/teams")(tenant, session)
      resp.status mustBe 200
      val result =
        fr.maif.otoroshi.daikoku.domain.json.SeqTeamFormat.reads(resp.json)
      result.isSuccess mustBe true
      result.get.size mustBe 2
    }

    "see one of his teams" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(userApiEditor, tenant)
      val resp =
        httpJsonCallBlocking(s"/api/me/teams/${teamOwnerId.value}")(tenant,
                                                                    session)
      resp.status mustBe 200
      val result =
        fr.maif.otoroshi.daikoku.domain.json.TeamFormat.reads(resp.json)
      result.isSuccess mustBe true
      result.get.id mustBe teamOwnerId
    }

    "not see another teams" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor),
        teams = Seq(
          teamConsumer.copy(
            users = Set(UserWithPermission(userTeamUserId, Administrator))))
      )
      val session = loginWithBlocking(userApiEditor, tenant)
      val resp =
        httpJsonCallBlocking(s"/api/me/teams/${teamConsumerId.value}")(tenant,
                                                                       session)
      resp.status mustBe 403
    }

    "create a new api" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor),
        teams = Seq(teamOwner)
      )

      val api = generateApi("0", tenant.id, teamOwnerId, Seq.empty)
      val session = loginWithBlocking(userApiEditor, tenant)
      val resp = httpJsonCallBlocking(path =
                                        s"/api/teams/${teamOwnerId.value}/apis",
                                      method = "POST",
                                      body = Some(api.asJson))(tenant, session)

      resp.status mustBe 201
      val result =
        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(resp.json)
      result.isSuccess mustBe true
      result.get.equals(api) mustBe true
    }

    "not update an api of a team which he is not a member" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi,
                   defaultApi.copy(id = ApiId("another-api"),
                                   description = "another-api",
                                   team = teamConsumerId))
      )

      val updatedApi = defaultApi.copy(description = "description")
      val session = loginWithBlocking(userApiEditor, tenant)

      val respError = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/another-api",
        method = "PUT",
        body = Some(updatedApi.asJson))(tenant, session)

      respError.status mustBe 404

      val respError2 = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/apis/another-api",
        method = "PUT",
        body = Some(updatedApi.asJson))(tenant, session)

      respError2.status mustBe 404
    }

    "update an api of his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi,
                   defaultApi.copy(id = ApiId("another-api"),
                                   description = "another-api",
                                   team = teamOwnerId))
      )

      val updatedApi = defaultApi.copy(description = "description")
      val session = loginWithBlocking(userApiEditor, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}",
        method = "PUT",
        body = Some(updatedApi.asJson))(tenant, session)

      resp.status mustBe 200
      val result =
        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(resp.json)
      result.isSuccess mustBe true
      result.get.description.equals("description") mustBe true

      val respGet =
        httpJsonCallBlocking(path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}")(
          tenant,
          session)

      respGet.status mustBe 200
      val resultAsApi =
        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(respGet.json)
      resultAsApi.isSuccess mustBe true
      resultAsApi.get.description.equals("description") mustBe true
    }

    "delete an api of his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi)
      )

      val session = loginWithBlocking(userApiEditor, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}",
        method = "DELETE")(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true
    }

    "not delete an api of a team which he's not a member" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi.copy(team = teamConsumerId))
      )

      val session = loginWithBlocking(userApiEditor, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/apis/${defaultApi.id}",
        method = "DELETE")(tenant, session)
      resp.status mustBe 404

      val resp2 = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id}",
        method = "DELETE")(tenant, session)
      resp2.status mustBe 404
    }
  }

  "a user" can {
    "see his teams" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner, teamConsumer)
      )
      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking("/api/me/teams")(tenant, session)
      resp.status mustBe 200
      val result =
        fr.maif.otoroshi.daikoku.domain.json.SeqTeamFormat.reads(resp.json)
      result.isSuccess mustBe true
      result.get.size mustBe 3
    }

    "see one of his teams" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(user, tenant)
      val resp =
        httpJsonCallBlocking(s"/api/me/teams/${teamOwnerId.value}")(tenant,
                                                                    session)
      resp.status mustBe 200
      val result =
        fr.maif.otoroshi.daikoku.domain.json.TeamFormat.reads(resp.json)
      result.isSuccess mustBe true
      result.get.id mustBe teamOwnerId
    }

    "not see another teams" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(
          teamConsumer.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator))))
      )
      val session = loginWithBlocking(user, tenant)
      val resp =
        httpJsonCallBlocking(s"/api/me/teams/${teamConsumerId.value}")(tenant,
                                                                       session)
      resp.status mustBe 403
    }

    "not create a new api" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner)
      )
      val api = generateApi("0", tenant.id, teamOwnerId, Seq.empty)

      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(path =
                                        s"/api/teams/${teamOwnerId.value}/apis",
                                      method = "POST",
                                      body = Some(api.asJson))(tenant, session)

      resp.status mustBe 403
    }

    "not update an api" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi)
      )

      val updatedApi = defaultApi.copy(description = "description")
      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id}",
        method = "PUT",
        body = Some(updatedApi.asJson))(tenant, session)

      resp.status mustBe 403
    }

    "not delete an api" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi)
      )

      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id}",
        method = "DELETE")(tenant, session)

      resp.status mustBe 403
    }

    "subscribe to an api" in {
      val teamIdWithApiKeyVisible = TeamId("team-consumer-with-apikey-visible")
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor),
        teams = Seq(
          teamOwner,
          teamConsumer.copy(
            apiKeyVisibility = Some(TeamApiKeyVisibility.ApiEditor),
            users =
              Set(UserWithPermission(userApiEditorId, TeamPermission.TeamUser))
          ),
          teamConsumer.copy(
            id = teamIdWithApiKeyVisible,
            apiKeyVisibility = Some(TeamApiKeyVisibility.User),
            users =
              Set(UserWithPermission(userApiEditorId, TeamPermission.TeamUser)))
        ),
        apis = Seq(defaultApi)
      )
      val session = loginWithBlocking(userApiEditor, tenant)
      val plan = "1"
      val resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
        method = "POST",
        body = Some(
          Json.obj("plan" -> plan,
                   "teams" -> Json.arr(teamConsumer.id.asJson,
                                       teamIdWithApiKeyVisible.asJson)))
      )(tenant, session)

      resp.status mustBe 200

      val resultAsSubscription =
        fr.maif.otoroshi.daikoku.domain.json.ApiSubscriptionFormat
          .reads((resp.json \ 0 \ "subscription").as[JsObject])

      resultAsSubscription.isSuccess mustBe true
      val subscription = resultAsSubscription.get
      subscription.plan.value mustBe plan
      subscription.team mustBe teamConsumerId
      subscription.by mustBe userApiEditorId
    }

    "get his team visible apis" in {
      val planSubId = UsagePlanId("1")
      val sub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = planSubId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.id,
        by = daikokuAdminId,
        customName = Some("custom name"),
        rotation = None,
        integrationToken = "test",
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer.copy(subscriptions = Seq(sub.id))),
        apis = Seq(defaultApi),
        subscriptions = Seq(sub),
        notifications = Seq(
          Notification(
            id = NotificationId("untreated-notification"),
            tenant = tenant.id,
            team = Some(teamOwnerId),
            sender = user,
            notificationType = AcceptOrReject,
            action = ApiSubscriptionDemand(defaultApi.id,
                                           UsagePlanId("2"),
                                           teamConsumerId)
          ))
      )
      val session = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/me/teams/${teamConsumerId.value}/visible-apis/${defaultApi.id.value}"
      )(tenant, session)
      resp.status mustBe 200

      val pendingRequests = (resp.json \ "pendingRequestPlan")
        .as[JsArray]
        .value
        .map(_.as(json.UsagePlanIdFormat))
      val subscriptions = (resp.json \ "subscriptions").as[JsArray]

      pendingRequests.length mustBe 1
      pendingRequests.head mustBe UsagePlanId("2")

      subscriptions.value.length mustBe 1
      (subscriptions.value.head \ "_id")
        .as(json.ApiSubscriptionIdFormat) mustBe ApiSubscriptionId("test")
    }

    "not get team visible apis if he's not a member of this team" in {
      val planSubId = UsagePlanId("1")
      val sub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = planSubId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.id,
        by = daikokuAdminId,
        customName = Some("custom name"),
        rotation = None,
        integrationToken = "test",
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(
          teamOwner,
          teamConsumer.copy(
            subscriptions = Seq(sub.id),
            users = Set(UserWithPermission(userApiEditor.id, Administrator)))),
        apis = Seq(defaultApi),
        subscriptions = Seq(sub),
        notifications = Seq(
          Notification(
            id = NotificationId("untreated-notification"),
            tenant = tenant.id,
            team = Some(teamOwnerId),
            sender = user,
            notificationType = AcceptOrReject,
            action = ApiSubscriptionDemand(defaultApi.id,
                                           UsagePlanId("2"),
                                           teamConsumerId)
          ))
      )
      val session = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/me/teams/${teamConsumerId.value}/visible-apis/${defaultApi.id.value}"
      )(tenant, session)
      resp.status mustBe 403
    }

    "not get team visible apis if this aipi doesn't exists" in {
      val planSubId = UsagePlanId("1")
      val sub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = planSubId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.id,
        by = daikokuAdminId,
        customName = Some("custom name"),
        rotation = None,
        integrationToken = "test",
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer.copy(subscriptions = Seq(sub.id))),
        apis = Seq(defaultApi),
        subscriptions = Seq(sub),
        notifications = Seq(
          Notification(
            id = NotificationId("untreated-notification"),
            tenant = tenant.id,
            team = Some(teamOwnerId),
            sender = user,
            notificationType = AcceptOrReject,
            action = ApiSubscriptionDemand(defaultApi.id,
                                           UsagePlanId("2"),
                                           teamConsumerId)
          ))
      )
      val session = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/api/me/teams/${teamConsumerId.value}/visible-apis/another-api"
      )(tenant, session)
      resp.status mustBe 404
    }

    "can star an api" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi)
      )

      val session = loginWithBlocking(userAdmin, tenant)

      var apiResp = httpJsonCallBlocking(
        path = s"/api/me/visible-apis/${defaultApi.id.value}"
      )(tenant, session)

      (apiResp.json \ "stars").as[Int] mustBe 0

      var resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.id.value}/stars",
        method = "PUT"
      )(tenant, session)

      resp.status mustBe 204

      apiResp = httpJsonCallBlocking(
        path = s"/api/me/visible-apis/${defaultApi.id.value}"
      )(tenant, session)

      (apiResp.json \ "stars").as[Int] mustBe 1

      resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.id.value}/stars",
        method = "PUT"
      )(tenant, session)

      resp.status mustBe 204

      apiResp = httpJsonCallBlocking(
        path = s"/api/me/visible-apis/${defaultApi.id.value}"
      )(tenant, session)

      (apiResp.json \ "stars").as[Int] mustBe 0

    }
  }

  "a subscription" should {
    "be not available right now if plan's subscription process is manual" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(
          defaultApi.copy(possibleUsagePlans = Seq(QuotasWithLimits(
            UsagePlanId("1"),
            10000,
            10000,
            10000,
            BigDecimal(10.0),
            billingDuration = BillingDuration(1, BillingTimeUnit.Month),
            trialPeriod = None,
            currency = Currency("EUR"),
            customName = None,
            customDescription = None,
            otoroshiTarget = Some(
              OtoroshiTarget(OtoroshiSettingsId("default"),
                Some(AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))))
            ),
            allowMultipleKeys = Some(false),
            subscriptionProcess = SubscriptionProcess.Manual,
            integrationProcess = IntegrationProcess.ApiKey,
            autoRotation = Some(false)
          ))))
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val plan = "1"
      val resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
        method = "POST",
        body = Some(
          Json.obj("plan" -> plan, "teams" -> Json.arr(teamConsumer.id.asJson)))
      )(tenant, session)

      resp.status mustBe 200
      val result = (resp.json \ 0).as[JsObject]
      (result \ "creation").as[String] mustBe "waiting"

      val respSubs = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, session)
      respSubs.status mustBe 200
      val resultAsSubscriptions = respSubs.json.as[Seq[JsObject]]

      resultAsSubscriptions.length mustBe 0

    }

    "be possible just one time if the option is default" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val plan = "1"

      for (n <- Seq(1, 2, 3)) {
        val resp = httpJsonCallBlocking(
          path = s"/api/apis/${defaultApi.id.value}/subscriptions",
          method = "POST",
          body = Some(
            Json.obj("plan" -> plan,
                     "teams" -> Json.arr(teamConsumer.id.asJson)))
        )(tenant, session)

        if (n == 1) {
          resp.status mustBe 200
          val result = (resp.json \ 0).as[JsObject]
          (result \ "creation").as[String] mustBe "done"
        } else {
          resp.status mustBe 200
          val result = (resp.json \ 0).as[JsObject]
          (result \ "error")
            .as[String]
            .toLowerCase()
            .contains("conflict") mustBe true
        }
      }

      val respSubs = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, session)
      respSubs.status mustBe 200
      val resultAsSubscriptions = respSubs.json.as[Seq[JsObject]]

      resultAsSubscriptions.length mustBe 1
    }

    "be possible many times if the option is ok" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val plan = "4" //plan with allow multiple keys set to true

      for (_ <- Seq(1, 2, 3)) {
        val resp = httpJsonCallBlocking(
          path = s"/api/apis/${defaultApi.id.value}/subscriptions",
          method = "POST",
          body = Some(
            Json.obj("plan" -> plan,
                     "teams" -> Json.arr(teamConsumer.id.asJson)))
        )(tenant, session)

        resp.status mustBe 200
        val result = (resp.json \ 0).as[JsObject]
        (result \ "creation").as[String] mustBe "done"
      }

      val respSubs = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, session)
      respSubs.status mustBe 200
      val resultAsSubscriptions = respSubs.json.as[Seq[JsObject]]

      resultAsSubscriptions.length mustBe 3
    }

    "be impossible if api is private and team isn't authorized" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi.copy(visibility = ApiVisibility.Private))
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val plan = "1"
      val resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
        method = "POST",
        body = Some(
          Json.obj("plan" -> plan, "teams" -> Json.arr(teamConsumer.id.asJson)))
      )(tenant, session)

      resp.status mustBe 200
      val result = (resp.json \ 0).as[JsObject]
      (result \ "error")
        .as[String]
        .toLowerCase()
        .contains("not authorized") mustBe true
    }

    "be impossible if api is publicWithAuthorization and team isn't authorized" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(
          defaultApi.copy(visibility = ApiVisibility.PublicWithAuthorizations))
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val plan = "1"
      val resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
        method = "POST",
        body = Some(
          Json.obj("plan" -> plan, "teams" -> Json.arr(teamConsumer.id.asJson)))
      )(tenant, session)

      resp.status mustBe 200
      val result = (resp.json \ 0).as[JsObject]
      (result \ "error")
        .as[String]
        .toLowerCase()
        .contains("not authorized") mustBe true
    }

    "be just visible for admin if team apikey visibility is set to Administrator" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user),
        teams =
          Seq(teamOwner,
              teamConsumer.copy(
                apiKeyVisibility = Some(TeamApiKeyVisibility.Administrator))),
        apis = Seq(defaultApi)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val plan = "1"
      val resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
        method = "POST",
        body = Some(
          Json.obj("plan" -> plan, "teams" -> Json.arr(teamConsumer.id.asJson)))
      )(tenant, session)

      resp.status mustBe 200
      val result = (resp.json \ 0).as[JsObject]
      (result \ "creation").as[String] mustBe "done"

      val respAdmin = httpJsonCallBlocking(
        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, session)
      respAdmin.status mustBe 200

      val userSession = loginWithBlocking(user, tenant)
      val respUser = httpJsonCallBlocking(
        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, userSession)
      respUser.status mustBe 403
    }

    "be accessible by team member only" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user),
        teams =
          Seq(teamOwner.copy(
                users = Set(UserWithPermission(user.id, Administrator))),
              teamConsumer.copy(
                users = Set(UserWithPermission(userAdmin.id, Administrator)))),
        apis = Seq(defaultApi)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val plan = "1"
      val resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
        method = "POST",
        body = Some(
          Json.obj("plan" -> plan, "teams" -> Json.arr(teamConsumer.id.asJson)))
      )(tenant, session)

      resp.status mustBe 200
      val result = (resp.json \ 0).as[JsObject]
      (result \ "creation").as[String] mustBe "done"

      val respAdmin = httpJsonCallBlocking(
        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, session)
      respAdmin.status mustBe 200

      val userSession = loginWithBlocking(user, tenant)
      val respUser = httpJsonCallBlocking(
        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, userSession)
      respUser.status mustBe 403

      val respCreationUser = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
        method = "POST",
        body = Some(
          Json.obj("plan" -> "2", "teams" -> Json.arr(teamConsumer.id.asJson)))
      )(tenant, userSession)

      respCreationUser.status mustBe 200
      (respCreationUser.json \ 0 \ "error")
        .as[String]
        .toLowerCase()
        .contains("not authorized") mustBe true
    }
  }

  "an api" can {
    "not have the same name as another" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi.copy(name = "test name api"))
      )

      val names = Seq(
        "test" -> false,
        "test name api" -> true,
        "TEST NAME API" -> true,
        "test name api " -> true,
        "test  name  api" -> true,
        "test   name api" -> false,
        "test-name-api" -> false
      )

      val session = loginWithBlocking(userAdmin, tenant)

      names.forall(test => {
        val respVerif = httpJsonCallBlocking(
          path = s"/api/apis/_names",
          method = "POST",
          body = Some(Json.obj("name" -> test._1)))(tenant, session)

        test._2 == (respVerif.json \ "exists").as[Boolean]
      }) mustBe true

      val respVerif = httpJsonCallBlocking(
        path = s"/api/apis/_names",
        method = "POST",
        body = Some(Json.obj("name" -> "test name api",
                             "id" -> defaultApi.id.asJson)))(tenant, session)
      (respVerif.json \ "exists").as[Boolean] mustBe false
    }

    "not be accessed by another team of the owner if it is not published" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user),
        teams =
          Seq(teamOwner.copy(
                users = Set(UserWithPermission(userAdmin.id, Administrator))),
              teamConsumer.copy(
                users = Set(UserWithPermission(user.id, Administrator)))),
        apis = Seq(defaultApi.copy(published = false))
      )

      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/me/visible-apis/${defaultApi.id.value}"
      )(tenant, session)

      resp.status mustBe 404
      (resp.json \ "error").as[String] mustBe "Api not found"

      val sessionAdmin = loginWithBlocking(userAdmin, tenant)
      val respAdmin = httpJsonCallBlocking(
        path = s"/api/me/visible-apis/${defaultApi.id.value}"
      )(tenant, sessionAdmin)

      respAdmin.status mustBe 200
      (respAdmin.json \ "_id").as[String] mustBe defaultApi.id.value
    }
  }

  "a private plan" must {
    "be subscribed by the owner team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(
          defaultApi.copy(possibleUsagePlans = Seq(PayPerUse(
            UsagePlanId("1"),
            BigDecimal(10.0),
            BigDecimal(0.02),
            billingDuration = BillingDuration(1, BillingTimeUnit.Month),
            trialPeriod = None,
            currency = Currency("EUR"),
            customName = None,
            customDescription = None,
            otoroshiTarget = Some(
              OtoroshiTarget(OtoroshiSettingsId("default"),
                Some(AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))))
            ),
            allowMultipleKeys = Some(false),
            visibility = Private,
            autoRotation = Some(false),
            subscriptionProcess = SubscriptionProcess.Automatic,
            integrationProcess = IntegrationProcess.ApiKey
          ))))
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val plan = "1"
      val resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
        method = "POST",
        body = Some(
          Json.obj("plan" -> plan, "teams" -> Json.arr(teamOwner.id.asJson)))
      )(tenant, session)

      resp.status mustBe 200
      val result = (resp.json \ 0).as[JsObject]
      (result \ "creation").as[String] mustBe "done"

      val resultAsSubscription =
        fr.maif.otoroshi.daikoku.domain.json.ApiSubscriptionFormat
          .reads((result \ "subscription").as[JsObject])
      resultAsSubscription.isSuccess mustBe true
      val subscription = resultAsSubscription.get
      subscription.plan.value mustBe plan
      subscription.team mustBe teamOwnerId
      subscription.by mustBe userAdmin.id
    }

    "not be subscribed by another team then the owner team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(
          defaultApi.copy(possibleUsagePlans = Seq(PayPerUse(
            UsagePlanId("1"),
            BigDecimal(10.0),
            BigDecimal(0.02),
            billingDuration = BillingDuration(1, BillingTimeUnit.Month),
            trialPeriod = None,
            currency = Currency("EUR"),
            customName = None,
            customDescription = None,
            otoroshiTarget = Some(
              OtoroshiTarget(OtoroshiSettingsId("default"),
                Some(AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))))
            ),
            allowMultipleKeys = Some(false),
            visibility = Private,
            autoRotation = Some(false),
            subscriptionProcess = SubscriptionProcess.Automatic,
            integrationProcess = IntegrationProcess.ApiKey
          ))))
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val plan = "1"
      val resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.id.value}/subscriptions",
        method = "POST",
        body = Some(
          Json.obj("plan" -> plan, "teams" -> Json.arr(teamConsumer.id.asJson)))
      )(tenant, session)

      resp.status mustBe 200
      val result = (resp.json \ 0).as[JsObject]
      (result \ "error")
        .as[String] mustBe "Consumer Team is not authorized on this plan"
    }

    "adds all teams subscribed in authorized team after inverting visibility" in {
      val payperUseSub = ApiSubscription(
        id = ApiSubscriptionId("test-removal"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = UsagePlanId("1"),
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.id,
        by = daikokuAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test-removal"
      )

      val api = defaultApi.copy(
        possibleUsagePlans = Seq(PayPerUse(
          UsagePlanId("1"),
          BigDecimal(10.0),
          BigDecimal(0.02),
          billingDuration = BillingDuration(1, BillingTimeUnit.Month),
          trialPeriod = None,
          currency = Currency("EUR"),
          customName = None,
          customDescription = None,
          otoroshiTarget = Some(
            OtoroshiTarget(OtoroshiSettingsId("default"),
              Some(AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))))
          ),
          allowMultipleKeys = Some(false),
          visibility = Public,
          authorizedTeams = Seq.empty,
          autoRotation = Some(false),
          subscriptionProcess = SubscriptionProcess.Automatic,
          integrationProcess = IntegrationProcess.ApiKey
        )))

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(api),
        subscriptions = Seq(payperUseSub)
      )

      val session = loginWithBlocking(userAdmin, tenant)

      val privatePlan = api.possibleUsagePlans.head
        .asInstanceOf[UsagePlan.PayPerUse]
        .copy(visibility = Private)

      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}",
        method = "PUT",
        body = Some(api.copy(possibleUsagePlans = Seq(privatePlan)).asJson))(
        tenant,
        session)

      resp.status mustBe 200
      val result =
        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(resp.json)
      result.isSuccess mustBe true

      result.get.possibleUsagePlans.head.authorizedTeams.length mustBe 1
    }
  }

  "a deletion of a plan" must {
    "delete all subscriptions" in {
      val payperUseSub = ApiSubscription(
        id = ApiSubscriptionId("test-removal"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = UsagePlanId("1"),
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.id,
        by = daikokuAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test-removal"
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner,
                    teamConsumer.copy(subscriptions = Seq(payperUseSub.id))),
        apis = Seq(
          defaultApi.copy(possibleUsagePlans = Seq(PayPerUse(
            UsagePlanId("1"),
            BigDecimal(10.0),
            BigDecimal(0.02),
            billingDuration = BillingDuration(1, BillingTimeUnit.Month),
            trialPeriod = None,
            currency = Currency("EUR"),
            customName = None,
            customDescription = None,
            otoroshiTarget = Some(
              OtoroshiTarget(OtoroshiSettingsId("default"),
                Some(AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))))
            ),
            allowMultipleKeys = Some(false),
            visibility = Private,
            authorizedTeams = Seq(teamConsumerId),
            autoRotation = Some(false),
            subscriptionProcess = SubscriptionProcess.Automatic,
            integrationProcess = IntegrationProcess.ApiKey
          )))),
        subscriptions = Seq(payperUseSub)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val respGetSubsStart = httpJsonCallBlocking(path =
        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}")(
        tenant,
        session)
      respGetSubsStart.status mustBe 200
      val resultStart =
        fr.maif.otoroshi.daikoku.domain.json.SeqApiSubscriptionFormat
          .reads(respGetSubsStart.json)
      resultStart.isSuccess mustBe true
      resultStart.get.length mustBe 1

      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}",
        method = "PUT",
        body = Some(defaultApi.copy(possibleUsagePlans = Seq.empty).asJson))(
        tenant,
        session)

      resp.status mustBe 200

      val respGetSubs = httpJsonCallBlocking(path =
        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}")(
        tenant,
        session)
      respGetSubs.status mustBe 200
      val result = fr.maif.otoroshi.daikoku.domain.json.SeqApiSubscriptionFormat
        .reads(respGetSubs.json)
      result.isSuccess mustBe true
      result.get.length mustBe 0
    }
  }
  "a deletion of a api" must {
    "delete all subscriptions" in {
      val payperUseSub = ApiSubscription(
        id = ApiSubscriptionId("test-removal"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = UsagePlanId("1"),
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.id,
        by = daikokuAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test-removal"
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner,
                    teamConsumer.copy(subscriptions = Seq(payperUseSub.id))),
        apis = Seq(
          defaultApi.copy(possibleUsagePlans = Seq(PayPerUse(
            UsagePlanId("1"),
            BigDecimal(10.0),
            BigDecimal(0.02),
            billingDuration = BillingDuration(1, BillingTimeUnit.Month),
            trialPeriod = None,
            currency = Currency("EUR"),
            customName = None,
            customDescription = None,
            otoroshiTarget = Some(
              OtoroshiTarget(OtoroshiSettingsId("default"),
                Some(AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))))
            ),
            allowMultipleKeys = Some(false),
            visibility = Private,
            authorizedTeams = Seq(teamConsumerId),
            autoRotation = Some(false),
            subscriptionProcess = SubscriptionProcess.Automatic,
            integrationProcess = IntegrationProcess.ApiKey
          )))),
        subscriptions = Seq(payperUseSub)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val respGetSubsStart = httpJsonCallBlocking(path =
        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}")(
        tenant,
        session)
      respGetSubsStart.status mustBe 200
      val resultStart =
        fr.maif.otoroshi.daikoku.domain.json.SeqApiSubscriptionFormat
          .reads(respGetSubsStart.json)
      resultStart.isSuccess mustBe true
      resultStart.get.length mustBe 1

      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}",
        method = "DELETE")(tenant, session)
      resp.status mustBe 200

      val respGetSubs = httpJsonCallBlocking(path =
        s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}")(
        tenant,
        session)
      respGetSubs.status mustBe 404

      val respGetTeam = httpJsonCallBlocking(
        path = s"/api/me/teams/${teamConsumerId.value}")(tenant, session)
      respGetTeam.status mustBe 200

      val result =
        fr.maif.otoroshi.daikoku.domain.json.TeamFormat.reads(respGetTeam.json)
      result.isSuccess mustBe true
      result.get.subscriptions.length mustBe 0
    }
  }

  "an admin api" must {
    "not be available for non daikoku admin user" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, userAdmin),
        teams = Seq(defaultAdminTeam, teamConsumer),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/api/apis/${adminApi.id.value}/subscriptions",
        method = "POST",
        body = Some(
          Json.obj("plan" -> "admin",
                   "teams" -> Json.arr(teamConsumer.id.asJson)))
      )(tenant, session)

      resp.status mustBe 403
    }

    "be available for daikoku admin" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/api/apis/${adminApi.id.value}/subscriptions",
        method = "POST",
        body = Some(
          Json.obj("plan" -> "admin",
                   "teams" -> Json.arr(defaultAdminTeam.id.asJson)))
      )(tenant, session)

      resp.status mustBe 200
      val result = (resp.json \ 0).as[JsObject]
      (result \ "creation").as[String] mustBe "done"
    }

    "cannot be deleted" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${defaultAdminTeam.id.value}/apis/${adminApi.id.value}",
        method = "DELETE")(tenant, session)
      resp.status mustBe 403
    }

    "cannot be updated except otoroshi target of admin plan" in {
      import org.scalatest.Matchers.convertToAnyShouldWrapper

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val updatedAdminApi = adminApi.copy(
        description = "new description",
        visibility = ApiVisibility.Public,
        currentVersion = Version("3.0.0"),
        published = false,
        possibleUsagePlans = Seq(
          adminApi.possibleUsagePlans.head
            .asInstanceOf[Admin]
            .copy(
              customName = Some("test"),
              customDescription = Some("test"),
              otoroshiTarget = Some(
                OtoroshiTarget(
                  otoroshiSettings = OtoroshiSettingsId("default"),
                  authorizedEntities = Some(AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("nice-group"))))
                ))
            ),
          Admin(
            id = UsagePlanId("test2"),
            customName = Some("test2"),
            customDescription = Some("test2"),
            otoroshiTarget = Some(
              OtoroshiTarget(
                otoroshiSettings = OtoroshiSettingsId("default"),
                authorizedEntities = Some(AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("nice-group"))))
              ))
          )
        )
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${defaultAdminTeam.id.value}/apis/${adminApi.id.value}",
        method = "PUT",
        body = Some(updatedAdminApi.asJson))(tenant, session)
      resp.status mustBe 200
      val result =
        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(resp.json)
      result.isSuccess mustBe true

      val resultAdminApi = result.get
      resultAdminApi.description mustBe "admin api"
      resultAdminApi.visibility mustBe ApiVisibility.AdminOnly
      resultAdminApi.currentVersion mustBe Version("1.0.0")
      resultAdminApi.published mustBe true
      resultAdminApi.possibleUsagePlans.length mustBe 1

      val adminPlan = resultAdminApi.possibleUsagePlans.head.asInstanceOf[Admin]

      adminPlan.customName.get mustBe "Administration plan"
      adminPlan.customDescription.get mustBe "access to admin api"
      adminPlan.otoroshiTarget.isDefined mustBe true
      adminPlan.otoroshiTarget.get.otoroshiSettings mustBe OtoroshiSettingsId(
        "default")
      adminPlan.otoroshiTarget.get.authorizedEntities.value.groups should contain (OtoroshiServiceGroupId("nice-group"))
    }
  }

  "Anyone" can {
    "ask access for an api" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user),
        teams =
          Seq(teamOwner.copy(
                users = Set(UserWithPermission(userAdmin.id, Administrator))),
              teamConsumer.copy(
                users = Set(UserWithPermission(user.id, Administrator)))),
        apis = Seq(
          defaultApi.copy(visibility = ApiVisibility.PublicWithAuthorizations,
                          authorizedTeams = Seq.empty)),
      )

      val userSession = loginWithBlocking(user, tenant)
      val adminSession = loginWithBlocking(userAdmin, tenant)

      //test access denied
      val respApiDenied = httpJsonCallBlocking(
        s"/api/me/visible-apis/${defaultApi.id.value}")(tenant, userSession)
      respApiDenied.status mustBe 401

      //ask access
      val resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.id.value}/access",
        method = "POST",
        body = Some(Json.obj("teams" -> Json.arr(teamConsumerId.asJson)))
      )(tenant, userSession)
      resp.status mustBe 200

      //get notifications for teamOwner and accept it
      val respNotif =
        httpJsonCallBlocking(s"/api/me/notifications")(tenant, adminSession)
      respNotif.status mustBe 200
      (respNotif.json \ "count").as[Long] mustBe 1
      val eventualNotifications = json.SeqNotificationFormat.reads(
        (respNotif.json \ "notifications").as[JsArray])
      eventualNotifications.isSuccess mustBe true
      val notifId = eventualNotifications.get.head.id

      val respAccept = httpJsonCallBlocking(
        path = s"/api/notifications/${notifId.value}/accept",
        method = "PUT",
        body = Some(Json.obj())
      )(tenant, adminSession)
      resp.status mustBe 200

      //test access ok
      val respApiOk = httpJsonCallBlocking(
        s"/api/me/visible-apis/${defaultApi.id.value}")(tenant, userSession)
      respApiOk.status mustBe 200
    }
    "can not star an api" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        apis = Seq(
          defaultApi.copy(visibility = ApiVisibility.PublicWithAuthorizations,
                          authorizedTeams = Seq.empty)),
      )

      val resp = httpJsonCallWithoutSessionBlocking(
        path = s"/api/apis/${defaultApi.id.value}/stars",
        method = "PUT"
      )(tenant)

      assert(resp.status != 204)
    }
  }

  "Team ApiKey visibility" must {
    "restrict the collection of usage stats for a subscription" in {
      val payPerUsePlanId = UsagePlanId("5")
      val subId = ApiSubscriptionId("test")
      val sub = ApiSubscription(
        id = subId,
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = payPerUsePlanId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test"
      )
      val team = teamConsumer.copy(subscriptions = Seq(sub.id))
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, userApiEditor, user),
        teams = Seq(
          teamOwner,
          team
        ),
        apis = Seq(defaultApi),
        subscriptions = Seq(sub)
      )
      val sessionAdmin = loginWithBlocking(userAdmin, tenant)
      val sessionApiEditor = loginWithBlocking(userApiEditor, tenant)
      val sessionUser = loginWithBlocking(user, tenant)

      val matrixOfMatrix = Map(
        (Some(TeamApiKeyVisibility.Administrator),
         Map((sessionAdmin, 200), (sessionApiEditor, 403), (sessionUser, 403))),
        (Some(TeamApiKeyVisibility.ApiEditor),
         Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 403))),
        (Some(TeamApiKeyVisibility.User),
         Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 200))),
        (None,
         Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 200)))
      )

      matrixOfMatrix.foreachEntry((maybeVisibility, matrix) => {
        val resp = {
          httpJsonCallBlocking(
            path = s"/api/teams/${teamOwnerId.value}",
            method = "PUT",
            body = Some(team.copy(apiKeyVisibility = maybeVisibility).asJson)
          )(tenant, sessionAdmin)
        }
        resp.status mustBe 200

        matrix.foreachEntry((session, response) => {
          val resp = httpJsonCallBlocking(
            s"/api/teams/${teamConsumerId.value}/subscription/${sub.id.value}/consumption")(
            tenant,
            session)
          resp.status mustBe response
        })
      })
    }
    "restrict rotation setup for a subscription" in {
      val payPerUsePlanId = UsagePlanId("5")
      val subId = ApiSubscriptionId("test")
      val sub = ApiSubscription(
        id = subId,
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = payPerUsePlanId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test"
      )
      val team = teamConsumer.copy(subscriptions = Seq(sub.id))
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, userApiEditor, user),
        teams = Seq(
          teamOwner,
          team
        ),
        apis = Seq(defaultApi),
        subscriptions = Seq(sub)
      )
      val sessionAdmin = loginWithBlocking(userAdmin, tenant)
      val sessionApiEditor = loginWithBlocking(userApiEditor, tenant)
      val sessionUser = loginWithBlocking(user, tenant)

      val callPerSec = 100L
      val callPerDay = 1000L
      val callPerMonth = 2000L
      val plan =
        defaultApi.possibleUsagePlans.find(_.id == sub.plan).get
      val otoroshiTarget = plan.otoroshiTarget
      val otoApiKey = ActualOtoroshiApiKey(
        clientId = sub.apiKey.clientId,
        clientSecret = sub.apiKey.clientSecret,
        clientName = sub.apiKey.clientName,
        authorizedEntities = otoroshiTarget.get.authorizedEntities.value,
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
      val path = otoroshiUpdateApikeyPath(sub.apiKey.clientId)

      val apiKeyPath = otoroshiGetApikeyPath(otoApiKey.clientId)
      stubFor(
        get(urlMatching(s"$apiKeyPath.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  otoApiKey.asJson.as[JsObject] ++
                    Json.obj("id" -> otoroshiTarget.get.authorizedEntities.value.groups.head.value,
                             "name" -> otoroshiTarget.get.authorizedEntities.value.groups.head.value)
                )
              )
              .withStatus(200)
          )
      )
      stubFor(
        put(urlMatching(s"$path.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  otoApiKey.copy(enabled = false).asJson
                )
              )
              .withStatus(200)
          )
      )

      val matrixOfMatrix = Map(
        (Some(TeamApiKeyVisibility.Administrator),
         Map((sessionAdmin, 200), (sessionApiEditor, 403), (sessionUser, 403))),
        (Some(TeamApiKeyVisibility.ApiEditor),
         Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 403))),
        (Some(TeamApiKeyVisibility.User),
         Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 200))),
        (None,
         Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 200)))
      )

      matrixOfMatrix.foreachEntry((maybeVisibility, matrix) => {
        val resp = {
          httpJsonCallBlocking(
            path = s"/api/teams/${teamOwnerId.value}",
            method = "PUT",
            body = Some(team.copy(apiKeyVisibility = maybeVisibility).asJson)
          )(tenant, sessionAdmin)
        }
        resp.status mustBe 200

        matrix.foreachEntry((session, response) => {
          val resp = httpJsonCallBlocking(
            path =
              s"/api/teams/${teamConsumerId.value}/subscriptions/${sub.id.value}/_rotation",
            method = "POST",
            body = Some(
              Json.obj(
                "rotationEvery" -> 24,
                "gracePeriod" -> 12
              ))
          )(tenant, session)
          resp.status mustBe response
        })
      })
    }
    "restrict custom name update setup for a subscription" in {
      val payPerUsePlanId = UsagePlanId("5")
      val subId = ApiSubscriptionId("test")
      val sub = ApiSubscription(
        id = subId,
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = payPerUsePlanId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test"
      )
      val team = teamConsumer.copy(subscriptions = Seq(sub.id))
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, userApiEditor, user),
        teams = Seq(
          teamOwner,
          team
        ),
        apis = Seq(defaultApi),
        subscriptions = Seq(sub)
      )
      val sessionAdmin = loginWithBlocking(userAdmin, tenant)
      val sessionApiEditor = loginWithBlocking(userApiEditor, tenant)
      val sessionUser = loginWithBlocking(user, tenant)

      val matrixOfMatrix = Map(
        (Some(TeamApiKeyVisibility.Administrator),
         Map((sessionAdmin, 200), (sessionApiEditor, 403), (sessionUser, 403))),
        (Some(TeamApiKeyVisibility.ApiEditor),
         Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 403))),
        (Some(TeamApiKeyVisibility.User),
         Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 200))),
        (None,
         Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 200)))
      )

      matrixOfMatrix.foreachEntry((maybeVisibility, matrix) => {
        val resp = {
          httpJsonCallBlocking(
            path = s"/api/teams/${teamOwnerId.value}",
            method = "PUT",
            body = Some(team.copy(apiKeyVisibility = maybeVisibility).asJson)
          )(tenant, sessionAdmin)
        }
        resp.status mustBe 200

        matrix.foreachEntry((session, response) => {
          val rdmName = Random.alphanumeric.take(10).mkString
          val respUpdate = httpJsonCallBlocking(
            path =
              s"/api/teams/${teamConsumerId.value}/subscriptions/${sub.id.value}/name",
            method = "POST",
            body = Some(Json.obj("customName" -> rdmName))
          )(tenant, session)
          respUpdate.status mustBe response

          if (response == 200) {
            val respSubs = httpJsonCallBlocking(
              path =
                s"/api/apis/${defaultApi.id.value}/subscriptions/teams/${teamConsumerId.value}"
            )(tenant, session)
            respSubs.status mustBe 200
            val resultAsUpdatedSubscription =
              fr.maif.otoroshi.daikoku.domain.json.ApiSubscriptionFormat
                .reads((respSubs.json \ 0).as[JsObject])

            resultAsUpdatedSubscription.isSuccess mustBe true
            resultAsUpdatedSubscription.get.customName mustBe Some(rdmName)
          }
        })
      })
    }
    "restrict the activation/deactivation of a subscription" in {
      val payPerUsePlanId = UsagePlanId("5")
      val subId = ApiSubscriptionId("test")
      val sub = ApiSubscription(
        id = subId,
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = payPerUsePlanId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test"
      )
      val team = teamConsumer.copy(subscriptions = Seq(sub.id))
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, userApiEditor, user),
        teams = Seq(
          teamOwner,
          team
        ),
        apis = Seq(defaultApi),
        subscriptions = Seq(sub)
      )
      val sessionAdmin = loginWithBlocking(userAdmin, tenant)
      val sessionApiEditor = loginWithBlocking(userApiEditor, tenant)
      val sessionUser = loginWithBlocking(user, tenant)

      val callPerSec = 100L
      val callPerDay = 1000L
      val callPerMonth = 2000L
      val plan =
        defaultApi.possibleUsagePlans.find(_.id == sub.plan).get
      val otoroshiTarget = plan.otoroshiTarget
      val otoApiKey = ActualOtoroshiApiKey(
        clientId = sub.apiKey.clientId,
        clientSecret = sub.apiKey.clientSecret,
        clientName = sub.apiKey.clientName,
        authorizedEntities = otoroshiTarget.get.authorizedEntities.value,
        throttlingQuota = callPerSec,
        dailyQuota = callPerDay,
        monthlyQuota = callPerMonth,
        constrainedServicesOnly = true,
        tags = Seq(),
        restrictions = ApiKeyRestrictions(),
        metadata = Map(),
        rotation = None
      )
      val path = otoroshiDeleteApikeyPath(sub.apiKey.clientId)
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
      val apiKeyPath = otoroshiGetApikeyPath(otoApiKey.clientId)
      stubFor(
        get(urlMatching(s"$apiKeyPath.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  otoApiKey.asJson.as[JsObject] ++
                    Json.obj("id" -> otoroshiTarget.get.authorizedEntities.value.groups.head.value,
                             "name" -> otoroshiTarget.get.authorizedEntities.value.groups.head.value)
                )
              )
              .withStatus(200)
          )
      )
      val otoPathQuotas = otoroshiPathApiKeyQuotas(sub.apiKey.clientId)
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
      stubFor(
        put(urlMatching(s"$path.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  otoApiKey.copy(enabled = false).asJson
                )
              )
              .withStatus(200)
          )
      )

      val matrixOfMatrix = Map(
        (Some(TeamApiKeyVisibility.Administrator),
         Map((sessionAdmin, 200), (sessionApiEditor, 403), (sessionUser, 403))),
        (Some(TeamApiKeyVisibility.ApiEditor),
         Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 403))),
        (Some(TeamApiKeyVisibility.User),
         Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 200))),
        (None,
         Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 200)))
      )

      matrixOfMatrix.foreachEntry((maybeVisibility, matrix) => {
        val resp = {
          httpJsonCallBlocking(
            path = s"/api/teams/${teamOwnerId.value}",
            method = "PUT",
            body = Some(team.copy(apiKeyVisibility = maybeVisibility).asJson)
          )(tenant, sessionAdmin)
        }
        resp.status mustBe 200

        matrix.foreachEntry((session, response) => {
          val rdmName = Random.alphanumeric.take(10).mkString
          val respUpdate = httpJsonCallBlocking(
            path =
              s"/api/teams/${teamConsumerId.value}/subscriptions/${sub.id.value}/_archive",
            method = "PUT",
            body = Some(Json.obj("customName" -> rdmName))
          )(tenant, session)
          respUpdate.status mustBe response
        })
      })
    }
    "restrict the reset of the secret of a subscription" in {
      val payPerUsePlanId = UsagePlanId("5")
      val subId = ApiSubscriptionId("test")
      val sub = ApiSubscription(
        id = subId,
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = payPerUsePlanId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test"
      )
      val team = teamConsumer.copy(subscriptions = Seq(sub.id))
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, userApiEditor, user),
        teams = Seq(
          teamOwner,
          team
        ),
        apis = Seq(defaultApi),
        subscriptions = Seq(sub)
      )
      val sessionAdmin = loginWithBlocking(userAdmin, tenant)
      val sessionApiEditor = loginWithBlocking(userApiEditor, tenant)
      val sessionUser = loginWithBlocking(user, tenant)

      val callPerSec = 100L
      val callPerDay = 1000L
      val callPerMonth = 2000L
      val plan =
        defaultApi.possibleUsagePlans.find(_.id == sub.plan).get
      val otoroshiTarget = plan.otoroshiTarget
      val otoApiKey = ActualOtoroshiApiKey(
        clientId = sub.apiKey.clientId,
        clientSecret = sub.apiKey.clientSecret,
        clientName = sub.apiKey.clientName,
        authorizedEntities = otoroshiTarget.get.authorizedEntities.value,
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
      val path = otoroshiUpdateApikeyPath(sub.apiKey.clientId)

      val apiKeyPath = otoroshiGetApikeyPath(otoApiKey.clientId)
      stubFor(
        get(urlMatching(s"$apiKeyPath.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  otoApiKey.asJson.as[JsObject] ++
                    Json.obj("id" -> otoroshiTarget.get.authorizedEntities.value.groups.head.value,
                             "name" -> otoroshiTarget.get.authorizedEntities.value.groups.head.value)
                )
              )
              .withStatus(200)
          )
      )
      stubFor(
        put(urlMatching(s"$path.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  otoApiKey.copy(enabled = false).asJson
                )
              )
              .withStatus(200)
          )
      )

      val matrixOfMatrix = Map(
        (Some(TeamApiKeyVisibility.Administrator),
         Map((sessionAdmin, 200), (sessionApiEditor, 403), (sessionUser, 403))),
        (Some(TeamApiKeyVisibility.ApiEditor),
         Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 403))),
        (Some(TeamApiKeyVisibility.User),
         Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 200))),
        (None,
         Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 200)))
      )

      matrixOfMatrix.foreachEntry((maybeVisibility, matrix) => {
        val resp = {
          httpJsonCallBlocking(
            path = s"/api/teams/${teamOwnerId.value}",
            method = "PUT",
            body = Some(team.copy(apiKeyVisibility = maybeVisibility).asJson)
          )(tenant, sessionAdmin)
        }
        resp.status mustBe 200

        matrix.foreachEntry((session, response) => {
          val rdmName = Random.alphanumeric.take(10).mkString
          val respUpdate = httpJsonCallBlocking(
            path =
              s"/api/teams/${teamConsumerId.value}/subscriptions/${sub.id.value}/_refresh",
            method = "POST",
            body = Some(Json.obj("customName" -> rdmName))
          )(tenant, session)
          respUpdate.status mustBe response
        })
      })
    }
  }
}
