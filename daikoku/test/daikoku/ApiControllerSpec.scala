package fr.maif.otoroshi.daikoku.tests

import cats.implicits.catsSyntaxOptionId
import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock
import com.github.tomakehurst.wiremock.client.WireMock._
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig
import controllers.AppError
import controllers.AppError.SubscriptionAggregationDisabled
import fr.maif.otoroshi.daikoku.domain.NotificationAction.{ApiAccess, ApiSubscriptionDemand}
import fr.maif.otoroshi.daikoku.domain.NotificationType.AcceptOrReject
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain.UsagePlan._
import fr.maif.otoroshi.daikoku.domain.UsagePlanVisibility.{Private, Public}
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json.{ApiFormat, SeqApiSubscriptionFormat}
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.tests.utils.DaikokuSpecHelper
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import org.joda.time.DateTime
import org.scalatest.concurrent.IntegrationPatience
import org.scalatest.{BeforeAndAfter, BeforeAndAfterEach}
import org.scalatestplus.play.PlaySpec
import play.api.http.Status
import play.api.libs.json._

import scala.util.Random

class ApiControllerSpec()
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfterEach
    with BeforeAndAfter {
//    with ForAllTestContainer {

  val pwd = System.getProperty("user.dir");
  lazy val wireMockServer = new WireMockServer(wireMockConfig().port(stubPort))
  /*override val container = GenericContainer(
    "maif/otoroshi:dev",
    exposedPorts = Seq(8080),
    fileSystemBind = Seq(
      FileSystemBind(s"$pwd/test/daikoku/otoroshi.json",
                     "/home/user/otoroshi.json",
                     BindMode.READ_ONLY)),
    env = Map("APP_IMPORT_FROM" -> "/home/user/otoroshi.json")
  )*/

  before {
    wireMockServer.start()
    WireMock.configureFor(stubHost, stubPort)
  }

  after {
    wireMockServer.stop()
  }

//  "a simple test" can {
//    "api-keys creation on otoroshi" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant.copy(otoroshiSettings = Set(OtoroshiSettings(
//          id = OtoroshiSettingsId("default"),
//          url = "http://localhost:8080",
//          host = "otoroshi-api.oto.tools",
//          clientId = "admin-api-apikey-id",
//          clientSecret = "password"
//        )))),
//        users = Seq(userAdmin),
//        teams = Seq(teamConsumer),
//        apis = Seq(defaultApi)
//      )
//
//      //plans
//      //free without quotas : 1
//      //free with quotas : 2
//      //Quotas With Limits : 3
//      //Quotas Without Limits : 4
//      //PayPerUse : 5
//
//      val session = loginWithBlocking(userAdmin, tenant)
//
//      (1 to 5).foreach(id => {
//        val resp = httpJsonCallBlocking(
//          path = s"/api/apis/${defaultApi.api.id.value}/subscriptions",
//          method = "POST",
//          body = Some(
//            Json.obj("plan" -> id.toString, "teams" -> Json.arr(teamConsumer.id.asJson))
//          )
//        )(tenant, session)
//        resp.status mustBe 200
//
//
//        AppLogger.info(Json.prettyPrint(resp.json))
//      })
//
//      val respSubs = httpJsonCallBlocking(
//        path = s"/api/subscriptions/teams/${teamConsumer.id.value}"
//      )(tenant, session)
//
//      respSubs.status mustBe 200
//
//      val eventualSubs = SeqApiSubscriptionFormat.reads(respSubs.json)
//
//      eventualSubs.isSuccess mustBe true
//
//      val subs = eventualSubs.get
//      subs.length mustBe 5
//
//      Map(
//        "1" -> Int.MaxValue,
//        "2" -> Int.MaxValue,
//        "3" -> 2000,
//        "4" -> 10000,
//        "5" -> Int.MaxValue,
//      ).foreach(tuple => {
//        val planId = tuple._1
//        val quotas = tuple._2
//
//        val sub = subs.find(s => s.plan.value === planId).get
//
//        val respApiKey = httpJsonCallBlocking(
//          path = s"/api/apikeys/${sub.apiKey.clientId}",
//          baseUrl = "http://localhost",
//          port = container.mappedPort(8080),
//          headers = Map(
//            "Host" -> "otoroshi-api.oto.tools",
//            "Otoroshi-Client-Id" -> "admin-api-apikey-id",
//            "Otoroshi-Client-Secret" -> "password",
//          )
//        )(tenant, session)
//
//        val test = httpJsonCallBlocking(
//          path = s"/api/apikeys",
//          baseUrl = "http://localhost",
//          port = container.mappedPort(8080),
//          headers = Map(
//            "Host" -> "otoroshi-api.oto.tools",
//            "Otoroshi-Client-Id" -> "admin-api-apikey-id",
//            "Otoroshi-Client-Secret" -> "password",
//          )
//        )(tenant, session)
//        AppLogger.info(Json.prettyPrint(test.json))
//
//        AppLogger.info(s"/api/apikeys/${sub.apiKey.clientId}")
//        AppLogger.info(Json.prettyPrint(respApiKey.json))
//        respApiKey.status mustBe 200
//
//        (respApiKey.json \ "dailyQuota").as[Long] mustBe quotas
//        (respApiKey.json \ "monthlyQuota").as[Long] mustBe quotas
//      })
//
//
//    }
//  }

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
        generateApi("test-3", tenant2.id, teamOwnerId, Seq.empty)
      )

      val session = loginWithBlocking(tenantAdmin, tenant2)
      val resp = httpJsonCallBlocking(
        path = "/api/apis/_init",
        method = "POST",
        body = Some(json.SeqApiFormat.writes(apis.map(_.api)))
      )(tenant2, session)

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
        generateApi("test-3", tenant2.id, teamOwnerId, Seq.empty)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = "/api/apis/_init",
        method = "POST",
        body = Some(json.SeqApiFormat.writes(apis.map(_.api)))
      )(tenant, session)

      resp.status mustBe 201
      val result = resp.json
        .as[JsArray]
        .value
        .map(v => ((v \ "name").as[String], (v \ "done").as[Boolean]))

      //no api created ==> resp = []
      result.forall(
        tuple =>
          !apis
            .map(_.api)
            .exists(api => api.name == tuple._1 && tuple._2)) mustBe true
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
        generateApi("test-3", tenant.id, teamOwnerId, Seq.empty)
      ).map(_.api)

      val session = loginWithBlocking(tenantAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = "/api/apis/_init",
        method = "POST",
        body = Some(json.SeqApiFormat.writes(apis))
      )(tenant, session)

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

      def generateInitSubJson(
          apikeyValue: String,
          apiId: ApiId,
          usagePlanId: UsagePlanId,
          teamId: TeamId
      ): JsObject =
        Json.obj(
          "apikey" -> OtoroshiApiKey(
            s"${teamId.value}.${apiId.value}.${usagePlanId.value}.$apikeyValue",
            apikeyValue,
            apikeyValue
          ).asJson,
          "api" -> apiId.asJson,
          "plan" -> usagePlanId.asJson,
          "team" -> teamId.asJson
        )

      val apikeys = Seq(
        generateInitSubJson(
          "1",
          defaultApi.api.id,
          UsagePlanId("1"),
          teamConsumerId
        ),
        generateInitSubJson(
          "2",
          defaultApi.api.id,
          UsagePlanId("2"),
          teamConsumerId
        ),
        generateInitSubJson(
          "3",
          defaultApi.api.id,
          UsagePlanId("3"),
          teamConsumerId
        ),
        generateInitSubJson(
          "4",
          defaultApi.api.id,
          UsagePlanId("4"),
          teamConsumerId
        ),
        generateInitSubJson(
          "5",
          defaultApi.api.id,
          UsagePlanId("5"),
          teamConsumerId
        ),
        generateInitSubJson("1",
                            defaultApi.api.id,
                            UsagePlanId("1"),
                            teamOwnerId),
        generateInitSubJson("2",
                            defaultApi.api.id,
                            UsagePlanId("2"),
                            teamOwnerId),
        generateInitSubJson("3",
                            defaultApi.api.id,
                            UsagePlanId("3"),
                            teamOwnerId),
        generateInitSubJson("4",
                            defaultApi.api.id,
                            UsagePlanId("4"),
                            teamOwnerId),
        generateInitSubJson("5",
                            defaultApi.api.id,
                            UsagePlanId("5"),
                            teamOwnerId)
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
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api)
      )

      def generateInitSubJson(
          apikeyValue: String,
          apiId: ApiId,
          usagePlanId: UsagePlanId,
          teamId: TeamId
      ): JsObject =
        Json.obj(
          "apikey" -> OtoroshiApiKey(
            s"${teamId.value}.${apiId.value}.${usagePlanId.value}.$apikeyValue",
            apikeyValue,
            apikeyValue
          ).asJson,
          "api" -> apiId.asJson,
          "plan" -> usagePlanId.asJson,
          "team" -> teamId.asJson
        )

      val apikeys = Seq(
        generateInitSubJson(
          "1",
          defaultApi.api.id,
          UsagePlanId("1"),
          teamConsumerId
        ),
        generateInitSubJson(
          "2",
          defaultApi.api.id,
          UsagePlanId("2"),
          teamConsumerId
        ),
        generateInitSubJson(
          "3",
          defaultApi.api.id,
          UsagePlanId("3"),
          teamConsumerId
        ),
        generateInitSubJson(
          "4",
          defaultApi.api.id,
          UsagePlanId("4"),
          teamConsumerId
        ),
        generateInitSubJson(
          "5",
          defaultApi.api.id,
          UsagePlanId("5"),
          teamConsumerId
        ),
        generateInitSubJson("1",
                            defaultApi.api.id,
                            UsagePlanId("1"),
                            teamOwnerId),
        generateInitSubJson("2",
                            defaultApi.api.id,
                            UsagePlanId("2"),
                            teamOwnerId),
        generateInitSubJson("3",
                            defaultApi.api.id,
                            UsagePlanId("3"),
                            teamOwnerId),
        generateInitSubJson("4",
                            defaultApi.api.id,
                            UsagePlanId("4"),
                            teamOwnerId),
        generateInitSubJson("5",
                            defaultApi.api.id,
                            UsagePlanId("5"),
                            teamOwnerId)
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
        s"/api/teams/${teamOwnerId.value}/subscribed-apis"
      )(tenant, sessionTest)
      respTestApis.status mustBe 200
      val resultTestApis = fr.maif.otoroshi.daikoku.domain.json.SeqApiFormat
        .reads(respTestApis.json)
      resultTestApis.isSuccess mustBe true
      resultTestApis.get.length mustBe 1
      resultTestApis.get.exists(a => a.id == defaultApi.api.id)

      val respTestSubscriptions = httpJsonCallBlocking(
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamOwnerId.value}"
      )(tenant, sessionTest)
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
        s"/api/me/subscriptions/${defaultApi.api.humanReadableId}/${defaultApi.api.currentVersion.value}"
      )(tenant, sessionTest)
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
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis",
        method = "POST",
        body = Some(api.api.asJson)
      )(tenant, session)

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
        generateApi("test-3", tenant.id, teamOwnerId, Seq.empty)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = "/api/apis/_init",
        method = "POST",
        body = Some(json.SeqApiFormat.writes(apis.map(_.api)))
      )(tenant, session)
      resp.status mustBe 403
    }

    "not initialize tenant subscriptions" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin, userAdmin),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(defaultApi.api)
      )

      def generateInitSubJson(
          apikeyValue: String,
          apiId: ApiId,
          usagePlanId: UsagePlanId,
          teamId: TeamId
      ): JsObject =
        Json.obj(
          "apikey" -> OtoroshiApiKey(
            apikeyValue,
            apikeyValue,
            apikeyValue
          ).asJson,
          "api" -> apiId.asJson,
          "plan" -> usagePlanId.asJson,
          "team" -> teamId.asJson
        )

      val apikeys = Seq(
        generateInitSubJson(
          "1",
          defaultApi.api.id,
          UsagePlanId("1"),
          teamConsumerId
        ),
        generateInitSubJson(
          "2",
          defaultApi.api.id,
          UsagePlanId("2"),
          teamConsumerId
        ),
        generateInitSubJson(
          "3",
          defaultApi.api.id,
          UsagePlanId("3"),
          teamConsumerId
        ),
        generateInitSubJson(
          "4",
          defaultApi.api.id,
          UsagePlanId("4"),
          teamConsumerId
        ),
        generateInitSubJson(
          "5",
          defaultApi.api.id,
          UsagePlanId("5"),
          teamConsumerId
        ),
        generateInitSubJson("1",
                            defaultApi.api.id,
                            UsagePlanId("1"),
                            teamOwnerId),
        generateInitSubJson("2",
                            defaultApi.api.id,
                            UsagePlanId("2"),
                            teamOwnerId),
        generateInitSubJson("3",
                            defaultApi.api.id,
                            UsagePlanId("3"),
                            teamOwnerId),
        generateInitSubJson("4",
                            defaultApi.api.id,
                            UsagePlanId("4"),
                            teamOwnerId),
        generateInitSubJson("5",
                            defaultApi.api.id,
                            UsagePlanId("5"),
                            teamOwnerId)
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
      val resp = httpJsonCallBlocking(
        "/api/search",
        "POST",
        body = Some(
          Json.obj(
            "query" ->
              """
              |query MyTeams {
              |    myTeams {
              |      name
              |      _humanReadableId
              |      _id
              |      type
              |      users {
              |        user {
              |          userId: id
              |        }
              |        teamPermission
              |      }
              |    }
              |  }
              |""".stripMargin
          )
        )
      )(tenant, session)
      resp.status mustBe 200

      val result = (resp.json \ "data" \ "myTeams").as[JsArray]
      result.value.length mustBe 3
    }

    "see one of his teams" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp =
        httpJsonCallBlocking(s"/api/me/teams/${teamOwnerId.value}")(
          tenant,
          session
        )
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
            users = Set(UserWithPermission(userApiEditorId, Administrator))
          )
        )
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp =
        httpJsonCallBlocking(s"/api/me/teams/${teamConsumerId.value}")(
          tenant,
          session
        )
      resp.status mustBe 403
    }

    "create a new api" in {
      val api = generateApi("0", tenant.id, teamOwnerId, Seq.empty).api
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        apis = Seq(api)
      )

      val doubleApi = generateApi("1", tenant.id, teamOwnerId, Seq.empty).api
        .copy(name = api.name)
      val session = loginWithBlocking(userAdmin, tenant)
      val resp =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamOwnerId.value}/apis",
          method = "POST",
          body = Some(doubleApi.asJson)
        )(tenant, session)

      resp.status mustBe 409
    }

    "not create an api with an existing name" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner)
      )

      val api = generateApi("0", tenant.id, teamOwnerId, Seq.empty).api
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis",
        method = "POST",
        body = Some(api.asJson)
      )(tenant, session)

      resp.status mustBe 201
      val result =
        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(resp.json)
      result.isSuccess mustBe true
      result.get.equals(api) mustBe true
    }

    "delete an api subscription from an api of his team" in {
      val payPerUsePlanId: UsagePlanId = UsagePlanId("5")
      val payPerUserSub: ApiSubscription = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = payPerUsePlanId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "token"
      )
      val yesterdayConsumption: ApiKeyConsumption = ApiKeyConsumption(
        id = DatastoreId("test"),
        tenant = tenant.id,
        team = teamConsumerId,
        api = defaultApi.api.id,
        plan = payPerUsePlanId,
        clientId = payPerUserSub.apiKey.clientId,
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
        to = DateTime.now().withTimeAtStartOfDay(),
        state = ApiKeyConsumptionState.Completed
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        subscriptions = Seq(payPerUserSub),
        consumptions = Seq(yesterdayConsumption)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/subscriptions/${payPerUserSub.id.value}/teams/${payPerUserSub.team.value}/_delete",
        method = "DELETE"
      )(tenant, session)
      resp.status mustBe 200
    }

    "not update an api of a team which he is not a member" in {
      val secondApi = defaultApi.api.copy(
        id = ApiId("another-api"),
        description = "another-api",
        team = teamConsumerId
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(
          teamOwner,
          teamConsumer.copy(users = Set(
            UserWithPermission(userTeamUserId, TeamPermission.Administrator)))),
        apis = Seq(defaultApi.api, secondApi)
      )
      val updatedApi = defaultApi.api.copy(description = "description")
      val session = loginWithBlocking(userAdmin, tenant)

      val respError = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${secondApi.id.value}/${secondApi.currentVersion.value}",
        method = "PUT",
        body = Some(updatedApi.asJson)
      )(tenant, session)

      respError.status mustBe 404

      (respError.json \ "error")
        .as[String] mustBe AppError.ApiNotFound.getErrorMessage()

      val respError2 = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/apis/${secondApi.id.value}/${secondApi.currentVersion.value}",
        method = "PUT",
        body = Some(updatedApi.asJson)
      )(tenant, session)

      respError2.status mustBe 404

    }

    "update an api of his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        apis = Seq(
          defaultApi.api,
          defaultApi.api.copy(
            id = ApiId("another-api"),
            description = "another-api",
            team = teamOwnerId,
            name = "another-api"
          )
        )
      )
      val updatedApi = defaultApi.api.copy(description = "description")
      val session = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}",
        method = "PUT",
        body = Some(updatedApi.asJson)
      )(tenant, session)

      resp.status mustBe 200
      val result =
        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(resp.json)
      result.isSuccess mustBe true
      result.get.description.equals("description") mustBe true

      val respGet =
        httpJsonCallBlocking(path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}")(
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
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}",
        method = "DELETE"
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true
    }

    "not delete an api of a team which he's not a member" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi.api.copy(team = teamConsumerId))
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/apis/${defaultApi.api.id}",
        method = "DELETE"
      )(tenant, session)
      resp.status mustBe 404

      val resp2 = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id}",
        method = "DELETE"
      )(tenant, session)
      resp2.status mustBe 404
    }

    "not subscribe to an unpublished api" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api.copy(state = ApiState.Created))
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val plan = defaultApi.plans.head
      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/${plan.id.value}/team/${teamConsumer.id.value}/_subscribe",
        method = "POST",
        body = Json.obj("motivation" -> "mot").some
      )(tenant, session)

      resp.status mustBe 403
      (resp.json \ "error")
        .as[
          String
        ] mustBe AppError.ApiNotPublished.getErrorMessage()
    }

    "not subscribe to an api for many reasons" in {

      val planUnauthorizedApi = FreeWithoutQuotas(
        id = UsagePlanId(IdGenerator.token),
        tenant = tenant.id,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        currency = Currency("EUR"),
        customName = None,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(
                groups = Set(OtoroshiServiceGroupId("12345"))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        visibility = UsagePlanVisibility.Private
      )
      val unauthorizedApi =
        generateApi("unauthorized-plan", tenant.id, teamOwnerId, Seq.empty).api
          .copy(possibleUsagePlans = Seq(planUnauthorizedApi.id))

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = Seq(planUnauthorizedApi, adminApiPlan) ++ defaultApi.plans,
        apis = Seq(defaultApi.api, adminApi, unauthorizedApi)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val plan = "1"
      //plan not found
      var resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/subscriptions",
        method = "POST",
        body = Some(
          Json
            .obj("plan" -> "test", "teams" -> Json.arr(teamConsumer.id.asJson))
        )
      )(tenant, session)
      resp.status mustBe 404
      //team not found
      resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/$plan/team/${teamAdminId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)

      resp.status mustBe 404
      (resp.json \ "error")
        .as[String] mustBe AppError.TeamNotFound.getErrorMessage()
      //api not found
      resp = httpJsonCallBlocking(
        path =
          s"/api/apis/test/plan/test/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)
      resp.status mustBe 404
      (resp.json \ "error")
        .as[String] mustBe AppError.ApiNotFound.getErrorMessage()
      //api unauthorized
      resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${adminApi.id.value}/plan/admin/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)

      resp.status mustBe 401
      (resp.json \ "error")
        .as[String] mustBe AppError.ApiUnauthorized.getErrorMessage()
      //plan unauthorized
      resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${unauthorizedApi.id.value}/plan/${planUnauthorizedApi.id.value}/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)
      resp.status mustBe 401
      (resp.json \ "error")
        .as[String] mustBe AppError.PlanUnauthorized.getErrorMessage()
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
        api = defaultApi.api.id,
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
        api = defaultApi.api.id,
        by = userTeamAdminId,
        customName = None,
        enabled = false,
        rotation = None,
        integrationToken = "test2"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(
          teamOwner,
          teamConsumer
        ),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        subscriptions = Seq(sub1, sub2)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val respVerif0 = httpJsonCallBlocking(
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
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
        (respClean.json \ "apiSubscriptions").as[JsArray]
      )
      eventualsCleanSubs.isSuccess mustBe true
      eventualsCleanSubs.get.length mustBe 1
      eventualsCleanSubs.get.head mustBe sub2.id

      val respVerif = httpJsonCallBlocking(
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, session)
      respVerif.status mustBe 200

      val eventualSubs = json.SeqApiSubscriptionFormat.reads(respVerif.json)
      eventualSubs.isSuccess mustBe true
      eventualSubs.get.length mustBe 1
      eventualSubs.get.head.id mustBe sub1.id
    }

    "get subscription informations" in {
      val plan = FreeWithoutQuotas(
        id = UsagePlanId("1"),
        tenant = tenant.id,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        currency = Currency("EUR"),
        customName = Some("new plan name"),
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val sub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = daikokuAdminId,
        customName = Some("custom name"),
        rotation = None,
        integrationToken = "test"
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = Seq(plan),
        apis = Seq(
          defaultApi.api.copy(
            possibleUsagePlans = Seq(plan.id)
          )
        ),
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

      (simpleApi \ "name").as[String] mustBe defaultApi.api.name
      (simpleSub \ "customName").as[String] mustBe sub.customName.get
      (simplePlan \ "customName").as[String] mustBe "new plan name"
    }

    "update a subscription to his api" in {
      val plan = FreeWithoutQuotas(
        id = UsagePlanId(IdGenerator.token),
        tenant = tenant.id,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        currency = Currency("EUR"),
        customName = Some("new plan name"),
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val sub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = daikokuAdminId,
        customName = Some("custom name"),
        rotation = None,
        integrationToken = "test"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(
          teamOwner,
          teamConsumer.copy(
            users = Set(UserWithPermission(user.id, Administrator))
          )
        ),
        usagePlans = Seq(plan),
        apis = Seq(
          defaultApi.api.copy(
            possibleUsagePlans = Seq(plan.id)
          )
        ),
        subscriptions = Seq(sub)
      )
      val otoroshiTarget = plan.otoroshiTarget
      val otoApiKey = ActualOtoroshiApiKey(
        clientId = sub.apiKey.clientId,
        clientSecret = sub.apiKey.clientSecret,
        clientName = sub.apiKey.clientName,
        authorizedEntities = otoroshiTarget.get.authorizedEntities.value,
        throttlingQuota = plan.maxRequestPerSecond.getOrElse(10L),
        dailyQuota = plan.maxRequestPerDay.getOrElse(10L),
        monthlyQuota = plan.maxRequestPerMonth.getOrElse(10L),
        restrictions = ApiKeyRestrictions(),
        metadata = Map(),
        rotation = None
      )

      val session = loginWithBlocking(userAdmin, tenant)
      wireMockServer.isRunning mustBe true
      val path = otoroshiUpdateApikeyPath(sub.apiKey.clientId)

      stubFor(
        get(urlMatching(s"$otoroshiPathGroup.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  otoApiKey.asJson.as[JsObject] ++
                    Json.obj(
                      "id" -> otoroshiTarget.get.authorizedEntities.value.groups.head.value,
                      "name" -> otoroshiTarget.get.authorizedEntities.value.groups.head.value
                    )
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
            .asSafeJson
        )
      )(tenant, session)

      resp.status mustBe 200

      (resp.json \ "customMetadata")
        .as[JsObject] mustBe Json.obj("foo" -> "bar")
      (resp.json \ "customMaxPerSecond")
        .as[Long] mustBe 1
      (resp.json \ "customMaxPerDay")
        .as[Long] mustBe 2
      (resp.json \ "customMaxPerMonth")
        .as[Long] mustBe 42
      (resp.json \ "customReadOnly")
        .as[Boolean] mustBe true
      (resp.json \ "apiKey").as[JsObject] mustBe Json.obj(
        "clientName" -> otoApiKey.clientName
      )
    }

    "not update a subscription to another api (even if it's own)" in {
      val plan = FreeWithoutQuotas(
        id = UsagePlanId("1"),
        tenant = tenant.id,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        currency = Currency("EUR"),
        customName = Some("new plan name"),
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val sub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = daikokuAdminId,
        customName = Some("custom name"),
        rotation = None,
        integrationToken = "test"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(
          defaultApi.api.copy(
            possibleUsagePlans = Seq(plan.id)
          )
        ),
        subscriptions = Seq(sub)
      )

      val otoroshiTarget = plan.otoroshiTarget
      val otoApiKey = ActualOtoroshiApiKey(
        clientId = sub.apiKey.clientId,
        clientSecret = sub.apiKey.clientSecret,
        clientName = sub.apiKey.clientName,
        authorizedEntities = otoroshiTarget.get.authorizedEntities.value,
        throttlingQuota = plan.maxRequestPerSecond.getOrElse(10L),
        dailyQuota = plan.maxRequestPerDay.getOrElse(10L),
        monthlyQuota = plan.maxRequestPerMonth.getOrElse(10L),
        restrictions = ApiKeyRestrictions(),
        metadata = Map(),
        rotation = None
      )

      val session = loginWithBlocking(userAdmin, tenant)
      wireMockServer.isRunning mustBe true
      val path = otoroshiUpdateApikeyPath(sub.apiKey.clientId)

      stubFor(
        get(urlMatching(s"$otoroshiPathGroup.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  otoApiKey.asJson.as[JsObject] ++
                    Json.obj(
                      "id" -> otoroshiTarget.get.authorizedEntities.value.groups.head.value,
                      "name" -> otoroshiTarget.get.authorizedEntities.value.groups.head.value
                    )
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
          sub.copy(customMetadata = Some(Json.obj("foo" -> "bar"))).asSafeJson
        )
      )(tenant, session)
      resp.status mustBe 403
    }

    "not accept subscription without custom metadata if plan requires it" in {
      val plan = QuotasWithLimits(
        id = UsagePlanId("3"),
        tenant = tenant.id,
        maxPerSecond = 10000,
        maxPerMonth = 10000,
        maxPerDay = 10000,
        costPerMonth = BigDecimal(10.0),
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        trialPeriod = None,
        currency = Currency("EUR"),
        customName = None,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))
            ),
            ApikeyCustomization(
              customMetadata = Seq(
                CustomMetadata("meta1", Set.empty)
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq(
          ValidationStep.TeamAdmin(id = IdGenerator.token,
                                   team = defaultApi.api.team,
                                   title = "team.name")),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val demand = SubscriptionDemand(
        id = SubscriptionDemandId("1"),
        tenant = tenant.id,
        api = defaultApi.api.id,
        plan = UsagePlanId("3"),
        steps = Seq(
          SubscriptionDemandStep(
            id = SubscriptionDemandStepId("demandStep_1"),
            state = SubscriptionDemandState.InProgress,
            step = ValidationStep.TeamAdmin(id = "step_1",
                                            team = defaultApi.api.team,
                                            title = "Admin"),
            metadata = Json.obj()
          )
        ),
        state = SubscriptionDemandState.InProgress,
        team = teamConsumerId,
        from = userAdmin.id,
        date = DateTime.now().minusDays(1),
        motivation = Json.obj("motivation" -> Json.obj("type" -> "string")).some,
        parentSubscriptionId = None,
        customReadOnly = None,
        customMetadata = None,
        customMaxPerSecond = None,
        customMaxPerDay = None,
        customMaxPerMonth = None
      )

      val untreatedNotification = Notification(
        id = NotificationId("untreated-notification"),
        tenant = tenant.id,
        team = Some(teamOwnerId),
        sender = NotificationSender(user.name, user.email, user.id.some),
        notificationType = AcceptOrReject,
        action = ApiAccess(defaultApi.api.id, teamConsumerId)
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamConsumer, teamOwner),
        usagePlans = Seq(plan),
        apis = Seq(
          defaultApi.api.copy(
            possibleUsagePlans = Seq(plan.id)
          )
        ),
        subscriptionDemands = Seq(demand),
        notifications = Seq(
          untreatedNotification.copy(
            action = ApiSubscriptionDemand(
              api = defaultApi.api.id,
              plan = UsagePlanId("3"),
              team = teamConsumerId,
              demand = demand.id,
              step = demand.steps.head.id,
              motivation = Some("motivation")
            )
          )
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
        .as[String] mustBe AppError.ApiKeyCustomMetadataNotPrivided
        .getErrorMessage()
    }

    "not manipulate api if tenant api creation security is enabled & team.apisCreationPermission is disabled" in {
      setupEnvBlocking(
        tenants = Seq(tenant.copy(creationSecurity = Some(true))),
        users = Seq(userAdmin),
        teams = Seq(teamOwner)
      )

      val api = generateApi("0", tenant.id, teamOwnerId, Seq.empty)
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis",
        method = "POST",
        body = Some(api.api.asJson)
      )(tenant, session)

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
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis",
        method = "POST",
        body = Some(api.api.asJson)
      )(tenant, session)

      resp.status mustBe 201
    }

    "not subscribe to an api with his personnal team if tenant enabled subscription security" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamConsumer.copy(`type` = TeamType.Personal), teamOwner),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val plan = "1"
      val respPersonal = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/$plan/team/${teamConsumer.id.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)

      respPersonal.status mustBe 401

      val respOrg = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/$plan/team/${teamOwnerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)

      respOrg.status mustBe 200
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
      val resp = httpJsonCallBlocking(
        "/api/search",
        "POST",
        body = Some(
          Json.obj(
            "query" ->
              """
              |query MyTeams {
              |    myTeams {
              |      name
              |      _humanReadableId
              |      _id
              |      type
              |      users {
              |        user {
              |          userId: id
              |        }
              |        teamPermission
              |      }
              |    }
              |  }
              |""".stripMargin
          )
        )
      )(tenant, session)
      resp.status mustBe 200

      val result = (resp.json \ "data" \ "myTeams").as[JsArray]
      result.value.length mustBe 2
    }

    "see one of his teams" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(userApiEditor, tenant)
      val resp =
        httpJsonCallBlocking(s"/api/me/teams/${teamOwnerId.value}")(
          tenant,
          session
        )
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
            users = Set(UserWithPermission(userTeamUserId, Administrator))
          )
        )
      )
      val session = loginWithBlocking(userApiEditor, tenant)
      val resp =
        httpJsonCallBlocking(s"/api/me/teams/${teamConsumerId.value}")(
          tenant,
          session
        )
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
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis",
        method = "POST",
        body = Some(api.api.asJson)
      )(tenant, session)

      resp.status mustBe 201
      val result =
        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(resp.json)
      result.isSuccess mustBe true
      result.get.equals(api.api) mustBe true
    }

    "not update an api of a team which he is not a member" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor),
        teams = Seq(teamOwner),
        apis = Seq(
          defaultApi.api,
          defaultApi.api.copy(
            id = ApiId("another-api"),
            description = "another-api",
            team = teamConsumerId
          )
        )
      )

      val updatedApi = defaultApi.api.copy(description = "description")
      val session = loginWithBlocking(userApiEditor, tenant)

      val respError = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/another-api/${defaultApi.api.currentVersion.value}",
        method = "PUT",
        body = Some(updatedApi.asJson)
      )(tenant, session)

      respError.status mustBe 404

      val respError2 = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/apis/another-api/${defaultApi.api.currentVersion.value}",
        method = "PUT",
        body = Some(updatedApi.asJson)
      )(tenant, session)

      respError2.status mustBe 404
    }

    "update an api of his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor),
        teams = Seq(teamOwner),
        apis = Seq(
          defaultApi.api,
          defaultApi.api.copy(
            id = ApiId("another-api"),
            description = "another-api",
            team = teamOwnerId,
            name = "another-api"
          )
        )
      )

      val updatedApi = defaultApi.api.copy(description = "description")
      val session = loginWithBlocking(userApiEditor, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}",
        method = "PUT",
        body = Some(updatedApi.asJson)
      )(tenant, session)

      resp.status mustBe 200
      val result =
        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(resp.json)
      result.isSuccess mustBe true
      result.get.description.equals("description") mustBe true

      val respGet =
        httpJsonCallBlocking(path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}")(
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
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api)
      )

      val session = loginWithBlocking(userApiEditor, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}",
        method = "DELETE"
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

    }

    "delete an api subscription from an api of his team" in {
      val payPerUsePlanId: UsagePlanId = UsagePlanId("5")
      val payPerUserSub: ApiSubscription = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = payPerUsePlanId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "token"
      )
      val yesterdayConsumption: ApiKeyConsumption = ApiKeyConsumption(
        id = DatastoreId("test"),
        tenant = tenant.id,
        team = teamConsumerId,
        api = defaultApi.api.id,
        plan = payPerUsePlanId,
        clientId = payPerUserSub.apiKey.clientId,
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
        to = DateTime.now().withTimeAtStartOfDay(),
        state = ApiKeyConsumptionState.Completed
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        subscriptions = Seq(payPerUserSub),
        consumptions = Seq(yesterdayConsumption)
      )
      val session = loginWithBlocking(userApiEditor, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/subscriptions/${payPerUserSub.id.value}/teams/${payPerUserSub.team.value}/_delete",
        method = "DELETE"
      )(tenant, session)
      resp.status mustBe 200
    }

    "not delete an api of a team which he's not a member" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi.api.copy(team = teamConsumerId))
      )

      val session = loginWithBlocking(userApiEditor, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/apis/${defaultApi.api.id}",
        method = "DELETE"
      )(tenant, session)
      resp.status mustBe 404

      val resp2 = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id}",
        method = "DELETE"
      )(tenant, session)
      resp2.status mustBe 404
    }

    "create a new version of api" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor),
        teams = Seq(teamOwner),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api)
      )

      val session = loginWithBlocking(userApiEditor, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/versions",
        method = "POST",
        body = Some(
          Json.obj(
            "version" -> "2.0.0"
          )
        )
      )(tenant, session)

      resp.status mustBe 201
    }

    "can't create a new version of api which already existing" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor),
        teams = Seq(teamOwner),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api)
      )

      val session = loginWithBlocking(userApiEditor, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/versions",
        method = "POST",
        body = Some(
          Json.obj(
            "version" -> defaultApi.api.currentVersion.value
          )
        )
      )(tenant, session)

      resp.status mustBe Status.CONFLICT
    }

    "import plan from an other version of api" in {
      val secondApi = defaultApi.api.copy(
        id = ApiId("another-api"),
        currentVersion = Version("2.0.0"),
        possibleUsagePlans = Seq.empty
      )

      val adminPlan = Admin(
        id = UsagePlanId("admin"),
        tenant = tenant.id,
        customName = Some("admin"),
        customDescription = None,
        otoroshiTarget = None
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor),
        teams = Seq(teamOwner),
        usagePlans = Seq(adminPlan),
        apis = Seq(
          defaultApi.api.copy(
            possibleUsagePlans = Seq(adminPlan.id)
          ),
          secondApi
        )
      )

      val session = loginWithBlocking(userApiEditor, tenant)
      var resp = httpJsonCallBlocking(path =
        s"/api/teams/${teamOwnerId.value}/apis/${secondApi.id.value}/${secondApi.currentVersion.value}")(
        tenant,
        session)
      resp.status mustBe Status.OK
      ApiFormat.reads(resp.json).get.possibleUsagePlans.size mustBe 0

      resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${secondApi.id.value}/plans",
        method = "POST",
        body = Some(
          Json.obj(
            "plan" -> "admin",
            "api" -> defaultApi.api.id.value
          )
        )
      )(tenant, session)
      resp.status mustBe Status.CREATED

      resp = httpJsonCallBlocking(path =
        s"/api/teams/${teamOwnerId.value}/apis/${secondApi.id.value}/${secondApi.currentVersion.value}")(
        tenant,
        session)
      resp.status mustBe Status.OK
      ApiFormat.reads(resp.json).get.possibleUsagePlans.size mustBe 1
    }

    "import documentation page from an other version of api" in {
      val secondApi = adminApi.copy(
        id = ApiId("another-api"),
        team = teamOwner.id,
        currentVersion = Version("2.0.0"),
        documentation = adminApi.documentation.copy(
          pages = Seq.empty
        )
      )

      val page = ApiDocumentationPage(
        id = ApiDocumentationPageId(""),
        tenant = tenant.id,
        title = "title",
        lastModificationAt = DateTime.now(),
        content = ""
      )

      val rootApi = adminApi.copy(
        team = teamOwner.id,
        documentation = adminApi.documentation.copy(
          pages =
            Seq(ApiDocumentationDetailPage(page.id, page.title, Seq.empty)))
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor),
        teams = Seq(teamOwner),
        apis = Seq(rootApi, secondApi),
        pages = Seq(page)
      )
      val session = loginWithBlocking(userApiEditor, tenant)
      var resp = httpJsonCallBlocking(path =
        s"/api/teams/${teamOwnerId.value}/apis/${secondApi.id.value}/${secondApi.currentVersion.value}")(
        tenant,
        session)

      resp.status mustBe Status.OK
      ApiFormat.reads(resp.json).get.documentation.pages.size mustBe 0

      resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${secondApi.id.value}/${secondApi.currentVersion.value}/pages",
        method = "PUT",
        body = Some(
          Json.obj(
            "pages" -> Json.arr(rootApi.documentation.pages.head.id.asJson)
          )
        )
      )(tenant, session)

      resp.status mustBe Status.OK
      (resp.json \ "done").as[Boolean] mustBe true

    }

    "transfer API ownership to another team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(
          teamOwner.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator))
          ),
          teamConsumer.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator))
          )
        ),
        apis = Seq(defaultApi.api)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val transfer = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/_transfer",
        method = "POST",
        body = Some(Json.obj("team" -> teamConsumer.id.value))
      )(tenant, session)
      AppLogger.info(Json.stringify(transfer.json))
      transfer.status mustBe 200
      (transfer.json \ "notify").as[Boolean] mustBe true

      val resp = httpJsonCallBlocking(s"/api/me/notifications")(tenant, session)
      resp.status mustBe 200
      (resp.json \ "count").as[Long] mustBe 1
      val eventualNotifications = json.SeqNotificationFormat.reads(
        (resp.json \ "notifications").as[JsArray]
      )
      eventualNotifications.isSuccess mustBe true
      val notification: Notification = eventualNotifications.get.head

      val acceptNotif = httpJsonCallBlocking(
        path = s"/api/notifications/${notification.id.value}/accept",
        method = "PUT",
        body = Some(Json.obj())
      )(tenant, session)
      acceptNotif.status mustBe 200
      (acceptNotif.json \ "done").as[Boolean] mustBe true
      val respVerif =
        httpJsonCallBlocking(
          path =
            s"/api/teams/${teamConsumerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
        )(tenant, session)
      respVerif.status mustBe 200 //FIXME 404
      val eventualApi = json.ApiFormat.reads(respVerif.json)
      eventualApi.isSuccess mustBe true
      eventualApi.get.team mustBe teamConsumerId
    }

    "transfer API ownership to another team (with all versions)" in {
      val defaultApiV2 =
        defaultApi.api.copy(
          id = ApiId(IdGenerator.token(32)),
          currentVersion = Version("2.0.0")
        )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(
          teamOwner.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator))
          ),
          teamConsumer.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator))
          )
        ),
        apis = Seq(defaultApi.api, defaultApiV2)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val transfer = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/_transfer",
        method = "POST",
        body = Some(Json.obj("team" -> teamConsumer.id.value))
      )(tenant, session)
      transfer.status mustBe 200
      (transfer.json \ "notify").as[Boolean] mustBe true

      val resp = httpJsonCallBlocking(s"/api/me/notifications")(tenant, session)
      resp.status mustBe 200
      (resp.json \ "count").as[Long] mustBe 1
      val eventualNotifications = json.SeqNotificationFormat.reads(
        (resp.json \ "notifications").as[JsArray]
      )
      eventualNotifications.isSuccess mustBe true
      val notification: Notification = eventualNotifications.get.head

      val acceptNotif = httpJsonCallBlocking(
        path = s"/api/notifications/${notification.id.value}/accept",
        method = "PUT",
        body = Some(Json.obj())
      )(tenant, session)
      acceptNotif.status mustBe 200
      (acceptNotif.json \ "done").as[Boolean] mustBe true

      val respVerif =
        httpJsonCallBlocking(
          s"/api/teams/${teamConsumerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
        )(tenant, session)
      respVerif.status mustBe 200 //FIXME 404
      val eventualApi = json.ApiFormat.reads(respVerif.json)
      eventualApi.isSuccess mustBe true
      eventualApi.get.team mustBe teamConsumerId
      val respVerif2 =
        httpJsonCallBlocking(
          s"/api/teams/${teamConsumerId.value}/apis/${defaultApiV2.id.value}/${defaultApiV2.currentVersion.value}"
        )(tenant, session)
      respVerif2.status mustBe 200
      val eventualApi2 = json.ApiFormat.reads(respVerif.json)
      eventualApi2.isSuccess mustBe true
      eventualApi2.get.team mustBe teamConsumerId
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
      val resp = httpJsonCallBlocking(
        "/api/search",
        "POST",
        body = Some(
          Json.obj(
            "query" ->
              """
              |query MyTeams {
              |    myTeams {
              |      name
              |      _humanReadableId
              |      _id
              |      type
              |      users {
              |        user {
              |          userId: id
              |        }
              |        teamPermission
              |      }
              |    }
              |  }
              |""".stripMargin
          )
        )
      )(tenant, session)
      resp.status mustBe 200

      val result = (resp.json \ "data" \ "myTeams").as[JsArray]
      result.value.length mustBe 3
    }

    "see one of his teams" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(user, tenant)
      val resp =
        httpJsonCallBlocking(s"/api/me/teams/${teamOwnerId.value}")(
          tenant,
          session
        )
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
            users = Set(UserWithPermission(userTeamAdminId, Administrator))
          )
        )
      )
      val session = loginWithBlocking(user, tenant)
      val resp =
        httpJsonCallBlocking(s"/api/me/teams/${teamConsumerId.value}")(
          tenant,
          session
        )
      resp.status mustBe 403
    }

    "not create a new api" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner)
      )
      val api = generateApi("0", tenant.id, teamOwnerId, Seq.empty).api

      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis",
        method = "POST",
        body = Some(api.asJson)
      )(tenant, session)

      resp.status mustBe 403
    }

    "not update an api" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi.api)
      )

      val updatedApi = defaultApi.api.copy(description = "description")
      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}",
        method = "PUT",
        body = Some(updatedApi.asJson)
      )(tenant, session)

      resp.status mustBe 403
    }

    "not delete an api" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi.api)
      )

      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id}",
        method = "DELETE"
      )(tenant, session)

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
              Set(UserWithPermission(userApiEditorId, TeamPermission.TeamUser))
          )
        ),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api)
      )
      val session = loginWithBlocking(userApiEditor, tenant)
      val plan = defaultApi.plans.head
      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/${plan.id.value}/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)

      resp.status mustBe 200

      val resultAsSubscription = (resp.json \ "subscription").as[JsObject]
      (resultAsSubscription \ "plan").as[String] mustBe plan.id.value
      (resultAsSubscription \ "team").as[String] mustBe teamConsumerId.value
      (resultAsSubscription \ "by").as[String] mustBe userApiEditor.id.value

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
        api = defaultApi.api.id,
        by = daikokuAdminId,
        customName = Some("custom name"),
        rotation = None,
        integrationToken = "test"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        subscriptions = Seq(sub),
        notifications = Seq(
          Notification(
            id = NotificationId("untreated-notification"),
            tenant = tenant.id,
            team = Some(teamOwnerId),
            sender = NotificationSender(name = user.name,
                                        email = user.email,
                                        id = user.id.some),
            notificationType = AcceptOrReject,
            action = ApiSubscriptionDemand(
              defaultApi.api.id,
              UsagePlanId("2"),
              teamConsumerId,
              motivation = Some("motivation"),
              demand = SubscriptionDemandId(IdGenerator.token),
              step = SubscriptionDemandStepId(IdGenerator.token),
            )
          )
        )
      )
      val session = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/me/teams/${teamConsumerId.value}/visible-apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
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
        api = defaultApi.api.id,
        by = daikokuAdminId,
        customName = Some("custom name"),
        rotation = None,
        integrationToken = "test"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(
          teamOwner,
          teamConsumer.copy(
            users = Set(UserWithPermission(userApiEditor.id, Administrator))
          )
        ),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        subscriptions = Seq(sub),
        notifications = Seq(
          Notification(
            id = NotificationId("untreated-notification"),
            tenant = tenant.id,
            team = Some(teamOwnerId),
            sender = NotificationSender(name = user.name,
                                        email = user.email,
                                        id = user.id.some),
            notificationType = AcceptOrReject,
            action = ApiSubscriptionDemand(
              defaultApi.api.id,
              UsagePlanId("2"),
              teamConsumerId,
              motivation = Some("motivation"),
              demand = SubscriptionDemandId(IdGenerator.token),
              step = SubscriptionDemandStepId(IdGenerator.token),
            )
          )
        )
      )
      val session = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/me/teams/${teamConsumerId.value}/visible-apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
      )(tenant, session)
      resp.status mustBe 403
    }

    "not get team visible apis if this api doesn't exists" in {
      val planSubId = UsagePlanId("1")
      val sub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = planSubId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = daikokuAdminId,
        customName = Some("custom name"),
        rotation = None,
        integrationToken = "test"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        subscriptions = Seq(sub),
        notifications = Seq(
          Notification(
            id = NotificationId("untreated-notification"),
            tenant = tenant.id,
            team = Some(teamOwnerId),
            sender = NotificationSender(name = user.name,
                                        email = user.email,
                                        id = user.id.some),
            notificationType = AcceptOrReject,
            action = ApiSubscriptionDemand(
              defaultApi.api.id,
              UsagePlanId("2"),
              teamConsumerId,
              motivation = Some("motivation"),
              demand = SubscriptionDemandId(IdGenerator.token),
              step = SubscriptionDemandStepId(IdGenerator.token),
            )
          )
        )
      )
      val session = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/me/teams/${teamConsumerId.value}/visible-apis/another-api/${defaultApi.api.currentVersion.value}"
      )(tenant, session)
      resp.status mustBe 404
    }

    "can star an api" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi.api)
      )

      val session = loginWithBlocking(userAdmin, tenant)

      var apiResp = httpJsonCallBlocking(
        path = s"/api/me/visible-apis/${defaultApi.api.id.value}"
      )(tenant, session)

      (apiResp.json \ "stars").as[Int] mustBe 0

      var resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/stars",
        method = "PUT"
      )(tenant, session)

      resp.status mustBe 200

      apiResp = httpJsonCallBlocking(
        path = s"/api/me/visible-apis/${defaultApi.api.id.value}"
      )(tenant, session)

      (apiResp.json \ "stars").as[Int] mustBe 1

      resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/stars",
        method = "PUT"
      )(tenant, session)

      resp.status mustBe 200

      apiResp = httpJsonCallBlocking(
        path = s"/api/me/visible-apis/${defaultApi.api.id.value}"
      )(tenant, session)

      (apiResp.json \ "stars").as[Int] mustBe 0

    }

    "can get his subscription for a private api if team is authorized" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user),
        teams = Seq(
          teamOwner.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator))
          ),
          teamConsumer.copy(
            users = Set(UserWithPermission(userTeamUserId, Administrator))
          )
        ),
        usagePlans = defaultApi.plans,
        apis = Seq(
          defaultApi.api.copy(
            visibility = ApiVisibility.Private,
            authorizedTeams = Seq(teamOwnerId, TeamId("fifou"))
          )
        )
      )

      val sessionAdmin = loginWithBlocking(userAdmin, tenant)
      val sessionUser = loginWithBlocking(user, tenant)

      val subAdminResp = httpJsonCallBlocking(
        path = s"/api/me/subscriptions/${defaultApi.api.id.value}"
      )(tenant, sessionAdmin)
      subAdminResp.status mustBe 200

      val subUserResp = httpJsonCallBlocking(
        path =
          s"/api/me/subscriptions/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
      )(tenant, sessionUser)
      subUserResp.status mustBe 401

    }
  }

  "a subscription" should {
    "be not available right now if plan's subscription process is manual" in {
      val plan = QuotasWithLimits(
        id = UsagePlanId("1"),
        tenant = tenant.id,
        maxPerSecond = 10000,
        maxPerDay = 10000,
        maxPerMonth = 10000,
        costPerMonth = BigDecimal(10.0),
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        trialPeriod = None,
        currency = Currency("EUR"),
        customName = None,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq(
          ValidationStep.TeamAdmin(id = IdGenerator.token,
                                   team = defaultApi.api.team,
                                   title = "Admin")),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = Seq(plan),
        apis = Seq(
          defaultApi.api.copy(
            possibleUsagePlans = Seq(plan.id)
          )
        )
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/${plan.id.value}/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)

      resp.status mustBe 200
      (resp.json \ "creation").as[String] mustBe "waiting"

      val respSubs = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
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
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val plan = "1"

      for (n <- Seq(1, 2, 3)) {
        val resp = httpJsonCallBlocking(
          path =
            s"/api/apis/${defaultApi.api.id.value}/plan/$plan/team/${teamConsumerId.value}/_subscribe",
          method = "POST",
          body = Json.obj().some
        )(tenant, session)

        if (n == 1) {
          resp.status mustBe 200
          (resp.json \ "creation").as[String] mustBe "done"
        } else {
          resp.status mustBe 409
          (resp.json \ "error")
            .as[String] mustBe AppError.SubscriptionConflict.getErrorMessage()
        }
      }

      val respSubs = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
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
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val plan = "4" //plan with allow multiple keys set to true

      for (_ <- Seq(1, 2, 3)) {
        val resp = httpJsonCallBlocking(
          path =
            s"/api/apis/${defaultApi.api.id.value}/plan/$plan/team/${teamConsumerId.value}/_subscribe",
          method = "POST",
          body = Json.obj().some
        )(tenant, session)

        resp.status mustBe 200
        (resp.json \ "creation").as[String] mustBe "done"
      }

      val respSubs = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
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
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api.copy(visibility = ApiVisibility.Private))
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val plan = defaultApi.plans.head
      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/${plan.id.value}/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)

      resp.status mustBe 401
      (resp.json \ "error")
        .as[String] mustBe AppError.ApiUnauthorized.getErrorMessage()
    }

    "be impossible if api is publicWithAuthorization and team isn't authorized" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans,
        apis = Seq(
          defaultApi.api.copy(
            visibility = ApiVisibility.PublicWithAuthorizations)
        )
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val plan = defaultApi.plans.head.id
      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/${plan.value}/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)

      resp.status mustBe 401
      (resp.json \ "error")
        .as[String] mustBe AppError.ApiUnauthorized.getErrorMessage()
    }

    "be just visible for admin if team apikey visibility is set to Administrator" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user),
        teams = Seq(
          teamOwner,
          teamConsumer.copy(
            apiKeyVisibility = Some(TeamApiKeyVisibility.Administrator)
          )
        ),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val plan = "1"
      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/$plan/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)

      resp.status mustBe 200
      (resp.json \ "creation").as[String] mustBe "done"

      val respAdmin = httpJsonCallBlocking(
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, session)
      respAdmin.status mustBe 200

      val userSession = loginWithBlocking(user, tenant)
      val respUser = httpJsonCallBlocking(
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, userSession)
      respUser.status mustBe 403
    }

    "be accessible by team member only" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user),
        teams = Seq(
          teamOwner.copy(
            users = Set(UserWithPermission(user.id, Administrator))
          ),
          teamConsumer.copy(
            users = Set(UserWithPermission(userAdmin.id, Administrator))
          )
        ),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val plan = "1"
      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/$plan/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)

      resp.status mustBe 200
      (resp.json \ "creation").as[String] mustBe "done"

      val respAdmin = httpJsonCallBlocking(
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, session)
      respAdmin.status mustBe 200

      val userSession = loginWithBlocking(user, tenant)
      val respUser = httpJsonCallBlocking(
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, userSession)
      respUser.status mustBe 403

      val respCreationUser = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/2/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, userSession)

      respCreationUser.status mustBe 401
    }
  }

  "an api" can {
    "not have the same name as another" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi.api.copy(name = "test name api"))
      )
      val names = Seq(
        "test" -> false,
        "test name api" -> true,
        "TEST NAME API" -> true,
        "test name api " -> true,
        "test  name  api" -> true,
        "test   name api" -> true,
        "test-name-api" -> true,
        "test?name-api" -> true,
        "test-------name-api" -> true
      )

      val session = loginWithBlocking(userAdmin, tenant)

      names.forall(test => {
        val respVerif = httpJsonCallBlocking(
          path = s"/api/apis/_names",
          method = "POST",
          body = Some(Json.obj("name" -> test._1))
        )(tenant, session)

        test._2 == (respVerif.json \ "exists").as[Boolean]
      }) mustBe true

      val respVerif = httpJsonCallBlocking(
        path = s"/api/apis/_names",
        method = "POST",
        body = Some(
          Json.obj("name" -> "test name api", "id" -> defaultApi.api.id.asJson)
        )
      )(tenant, session)
      (respVerif.json \ "exists").as[Boolean] mustBe false
    }

    "not be accessed by another team of the owner if it is not published" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user),
        teams = Seq(
          teamOwner.copy(
            users = Set(UserWithPermission(userAdmin.id, Administrator))
          ),
          teamConsumer.copy(
            users = Set(UserWithPermission(user.id, Administrator))
          )
        ),
        apis = Seq(defaultApi.api.copy(state = ApiState.Created))
      )
      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/me/visible-apis/${defaultApi.api.id.value}"
      )(tenant, session)

      resp.status mustBe 401
      (resp.json \ "error")
        .as[String] mustBe "You're not authorized on this api"

      val sessionAdmin = loginWithBlocking(userAdmin, tenant)
      val respAdmin = httpJsonCallBlocking(
        path = s"/api/me/visible-apis/${defaultApi.api.id.value}"
      )(tenant, sessionAdmin)

      respAdmin.status mustBe 200
      (respAdmin.json \ "_id").as[String] mustBe defaultApi.api.id.value

    }

    "list all subscribed apis" in {
      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = UsagePlanId("5"),
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = defaultApi.api.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test"
      )

      val secondApi =
        generateApi("second", tenant.id, teamConsumerId, Seq.empty)
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("test2"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = UsagePlanId("6"),
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = secondApi.api.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test2",
        parent = Some(parentSub.id)
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user, userAdmin),
        teams = Seq(teamOwner),
        usagePlans = defaultApi.plans ++ secondApi.plans,
        apis = Seq(defaultApi.api, secondApi.api),
        subscriptions = Seq(parentSub, childSub)
      )
      wireMockServer.isRunning mustBe true

      val sessionTest = loginWithBlocking(userAdmin, tenant)

      val respTestApis = httpJsonCallBlocking(
        s"/api/teams/${teamOwnerId.value}/subscribed-apis"
      )(tenant, sessionTest)
      respTestApis.status mustBe 200
      val resultTestApis = fr.maif.otoroshi.daikoku.domain.json.SeqApiFormat
        .reads(respTestApis.json)

      resultTestApis.get.length mustBe 2
    }
  }

  "a private plan" must {
    "be subscribed by the owner team" in {
      val plan = PayPerUse(
        id = UsagePlanId(IdGenerator.token),
        tenant = tenant.id,
        costPerMonth = BigDecimal(10.0),
        costPerRequest = BigDecimal(0.02),
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        trialPeriod = None,
        currency = Currency("EUR"),
        customName = None,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))
            )
          )
        ),
        allowMultipleKeys = Some(false),
        visibility = Private,
        autoRotation = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = Seq(plan),
        apis = Seq(
          defaultApi.api.copy(
            possibleUsagePlans = Seq(plan.id)
          )
        )
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/${plan.id.value}/team/${teamOwnerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)

      resp.status mustBe 200
      (resp.json \ "creation").as[String] mustBe "done"

      val resultAsSubscription = (resp.json \ "subscription").as[JsObject]
      (resultAsSubscription \ "plan").as[String] mustBe plan.id.value
      (resultAsSubscription \ "team").as[String] mustBe teamOwnerId.value
      (resultAsSubscription \ "by").as[String] mustBe userAdmin.id.value
    }

    "not be subscribed by another team then the owner team" in {
      val plan = PayPerUse(
        id = UsagePlanId(IdGenerator.token),
        tenant = tenant.id,
        costPerMonth = BigDecimal(10.0),
        costPerRequest = BigDecimal(0.02),
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        trialPeriod = None,
        currency = Currency("EUR"),
        customName = None,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))
            )
          )
        ),
        allowMultipleKeys = Some(false),
        visibility = Private,
        autoRotation = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = Seq(plan),
        apis = Seq(
          defaultApi.api.copy(
            possibleUsagePlans = Seq(plan.id)
          )
        )
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/${plan.id.value}/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)

      resp.status mustBe 401
    }

    "adds all teams subscribed in authorized team after inverting visibility" in {
      val plan = PayPerUse(
        id = UsagePlanId(IdGenerator.token),
        tenant = tenant.id,
        costPerMonth = BigDecimal(10.0),
        costPerRequest = BigDecimal(0.02),
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        trialPeriod = None,
        currency = Currency("EUR"),
        customName = None,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(
                groups = Set(OtoroshiServiceGroupId("12345"))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        visibility = Public,
        authorizedTeams = Seq.empty,
        autoRotation = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey
      )
      val payperUseSub = ApiSubscription(
        id = ApiSubscriptionId("test-removal"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = daikokuAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test-removal"
      )

      val api = defaultApi.api.copy(
        possibleUsagePlans = Seq(plan.id)
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(api),
        usagePlans = Seq(plan),
        subscriptions = Seq(payperUseSub)
      )

      val session = loginWithBlocking(userAdmin, tenant)

      val privatePlan = plan
        .copy(visibility = Private)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/plan/${privatePlan.id.value}",
        method = "PUT",
        body = Some(privatePlan.asJson)
      )(tenant, session)

      resp.status mustBe 200
      val result =
        fr.maif.otoroshi.daikoku.domain.json.UsagePlanFormat.reads(resp.json)
      result.isSuccess mustBe true

      result.get.authorizedTeams.length mustBe 1
    }
  }

  "a deletion of a plan" must {
    "delete all subscriptions" in {
      val plan = PayPerUse(
        id = UsagePlanId(IdGenerator.token),
        tenant = tenant.id,
        costPerMonth = BigDecimal(10.0),
        costPerRequest = BigDecimal(0.02),
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        trialPeriod = None,
        currency = Currency("EUR"),
        customName = None,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))
            )
          )
        ),
        allowMultipleKeys = Some(false),
        visibility = Private,
        authorizedTeams = Seq(teamConsumerId),
        autoRotation = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey
      )
      val payperUseSub = ApiSubscription(
        id = ApiSubscriptionId("test-removal"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = daikokuAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test-removal"
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(
          teamOwner,
          teamConsumer
        ),
        usagePlans = Seq(plan),
        apis = Seq(
          defaultApi.api.copy(
            possibleUsagePlans = Seq(plan.id)
          )
        ),
        subscriptions = Seq(payperUseSub)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val respGetSubsStart = httpJsonCallBlocking(path =
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}")(
        tenant,
        session)
      respGetSubsStart.status mustBe 200
      val resultStart =
        fr.maif.otoroshi.daikoku.domain.json.SeqApiSubscriptionFormat
          .reads(respGetSubsStart.json)
      resultStart.isSuccess mustBe true
      resultStart.get.length mustBe 1

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/plan/${plan.id.value}",
        method = "DELETE"
      )(tenant, session)

      resp.status mustBe 200

      val respGetSubs = httpJsonCallBlocking(path =
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}")(
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
      val plan = PayPerUse(
        id = UsagePlanId(IdGenerator.token),
        tenant = tenant.id,
        costPerMonth = BigDecimal(10.0),
        costPerRequest = BigDecimal(0.02),
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        trialPeriod = None,
        currency = Currency("EUR"),
        customName = None,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))
            )
          )
        ),
        allowMultipleKeys = Some(false),
        visibility = Private,
        authorizedTeams = Seq(teamConsumerId),
        autoRotation = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey
      )
      val payperUseSub = ApiSubscription(
        id = ApiSubscriptionId("test-removal"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = daikokuAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test-removal"
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(
          teamOwner,
          teamConsumer
        ),
        usagePlans = Seq(plan),
        apis = Seq(
          defaultApi.api.copy(
            possibleUsagePlans = Seq(plan.id)
          )
        ),
        subscriptions = Seq(payperUseSub)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val respGetSubsStart = httpJsonCallBlocking(path =
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}")(
        tenant,
        session)
      respGetSubsStart.status mustBe 200
      val resultStart =
        fr.maif.otoroshi.daikoku.domain.json.SeqApiSubscriptionFormat
          .reads(respGetSubsStart.json)
      resultStart.isSuccess mustBe true
      resultStart.get.length mustBe 1

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}",
        method = "DELETE"
      )(tenant, session)
      resp.status mustBe 200

      val respGetSubs = httpJsonCallBlocking(path =
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}")(
        tenant,
        session)
      respGetSubs.status mustBe 404

      val respGetTeamSubs = httpJsonCallBlocking(
        path = s"/api/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, session)
      respGetTeamSubs.status mustBe 200
      respGetTeamSubs.json.as[JsArray].value.length mustBe 0
    }

    "clean other versions of the deleted version" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        usagePlans = defaultApi.plans,
        apis = Seq(
          defaultApi.api.copy(id = ApiId("123"),
                              supportedVersions = Set(Version("1.0.0")),
                              currentVersion = Version("1.0.0"),
                              isDefault = false,
                              parent = None),
          defaultApi.api.copy(id = ApiId("345"),
                              supportedVersions = Set(Version("2.0.0")),
                              currentVersion = Version("2.0.0"),
                              isDefault = false,
                              parent = Some(ApiId("123"))),
          defaultApi.api.copy(id = ApiId("678"),
                              supportedVersions = Set(Version("3.0.0")),
                              currentVersion = Version("3.0.0"),
                              isDefault = true,
                              parent = Some(ApiId("123"))),
        )
      )
      val session = loginWithBlocking(userAdmin, tenant)

      val respVersionsBefore = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/123/versions"
      )(tenant, session)

      respVersionsBefore.status mustBe 200
      val versionsBefore = respVersionsBefore.json.as[Seq[String]]
      versionsBefore.length mustBe 3

      val respDefVersionBefore = httpJsonCallBlocking(
        path = s"/api/apis/api-vdefault/default_version"
      )(tenant, session)
      respDefVersionBefore.status mustBe 200
      (respDefVersionBefore.json \ "defaultVersion").as[String] mustBe "3.0.0"

      val respDelete = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/678",
        method = "DELETE"
      )(tenant, session)

      respDelete.status mustBe 200

      val respVersionsAfter = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/123/versions",
      )(tenant, session)

      respVersionsAfter.status mustBe 200
      val versionsAfter = respVersionsAfter.json.as[Seq[String]]
      versionsAfter.length mustBe 2

      val respDefVersionAfter = httpJsonCallBlocking(
        path = s"/api/apis/api-vdefault/default_version"
      )(tenant, session)
      respDefVersionAfter.status mustBe 200
      (respDefVersionAfter.json \ "defaultVersion").as[String] mustBe "1.0.0"
    }
  }

  "an admin api" must {
    "not be available for non daikoku admin user" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, userAdmin),
        teams = Seq(defaultAdminTeam, teamConsumer),
        usagePlans = Seq(adminApiPlan),
        apis = Seq(adminApi)
      )
      val session = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${adminApi.id.value}/plan/admin/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)

      resp.status mustBe 401
      (resp.json \ "error")
        .as[String] mustBe AppError.ApiUnauthorized.getErrorMessage()
    }

    "be available for daikoku admin" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam),
        usagePlans = Seq(adminApiPlan),
        apis = Seq(adminApi)
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${adminApi.id.value}/plan/admin/team/${defaultAdminTeam.id.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)

      resp.status mustBe 200
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
        method = "DELETE"
      )(tenant, session)
      resp.status mustBe 403
    }

    "cannot be updated except otoroshi target of admin plan" in {

      val updatedAdminPlan = adminApiPlan
        .copy(
          customName = Some("test"),
          customDescription = Some("test"),
          otoroshiTarget = Some(
            OtoroshiTarget(
              otoroshiSettings = OtoroshiSettingsId("wiremock"),
              authorizedEntities = Some(
                AuthorizedEntities(
                  groups =
                    Set(OtoroshiServiceGroupId("daikoku-admin-api-group-id"))
                )
              )
            )
          )
        )

      wireMockServer.isRunning mustBe true
      stubFor(
        get(urlMatching(s"$otoroshiPathGroup.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  Json.obj(
                    "id" -> "daikoku-admin-api-group-id",
                    "name" -> "daikoku-admin-api-group"
                  )
                )
              )
              .withStatus(200)
          )
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam),
        usagePlans = Seq(adminApiPlan),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${defaultAdminTeam.id.value}/apis/${adminApi.id.value}/${adminApi.currentVersion.value}/plan/${adminApiPlan.id.value}",
        method = "PUT",
        body = Some(updatedAdminPlan.asJson)
      )(tenant, session)

      resp.status mustBe 200
      val result =
        fr.maif.otoroshi.daikoku.domain.json.UsagePlanFormat.reads(resp.json)
      result.isSuccess mustBe true

      val adminPlan = result.get

      adminPlan.customName.get mustBe "Administration plan"
      adminPlan.customDescription.get mustBe "access to admin api"
      adminPlan.otoroshiTarget.isDefined mustBe true
      adminPlan.otoroshiTarget.get.otoroshiSettings mustBe OtoroshiSettingsId(
        "wiremock"
      )
      adminPlan.otoroshiTarget.get.authorizedEntities.value.groups must contain(
        OtoroshiServiceGroupId("daikoku-admin-api-group-id")
      )
    }
  }

  "Anyone" can {
    "ask access for an api" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user),
        teams = Seq(
          teamOwner.copy(
            users = Set(UserWithPermission(userAdmin.id, Administrator))
          ),
          teamConsumer.copy(
            users = Set(UserWithPermission(user.id, Administrator))
          )
        ),
        apis = Seq(
          defaultApi.api.copy(
            visibility = ApiVisibility.PublicWithAuthorizations,
            authorizedTeams = Seq.empty
          )
        )
      )

      val userSession = loginWithBlocking(user, tenant)
      val adminSession = loginWithBlocking(userAdmin, tenant)

      //test access denied
      val respApiDenied = httpJsonCallBlocking(
        s"/api/me/visible-apis/${defaultApi.api.id.value}"
      )(tenant, userSession)
      respApiDenied.status mustBe 401

      //ask access
      val resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/access",
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
        (respNotif.json \ "notifications").as[JsArray]
      )
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
        s"/api/me/visible-apis/${defaultApi.api.id.value}"
      )(tenant, userSession)
      respApiOk.status mustBe 200
    }
    "can not star an api" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        apis = Seq(
          defaultApi.api.copy(
            visibility = ApiVisibility.PublicWithAuthorizations,
            authorizedTeams = Seq.empty
          )
        )
      )

      val resp = httpJsonCallWithoutSessionBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/stars",
        method = "PUT"
      )(tenant)

      assert(resp.status != 204)
    }
    "can't create an issue when a team don't exist" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user),
        teams = Seq(teamOwner,
                    teamConsumer.copy(
                      users = Set(
                        UserWithPermission(userId = user.id,
                                           teamPermission =
                                             TeamPermission.Administrator)))),
        apis = Seq(defaultApi.api),
      )

      val userSession = loginWithBlocking(user, tenant)
      val issue = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId}/apis/${defaultApi.api.humanReadableId}/issues",
        method = "POST",
        body = Some(
          ApiIssue(
            id = ApiIssueId(IdGenerator.token(32)),
            seqId = 0,
            tenant = tenant.id,
            title = "",
            tags = Set.empty,
            open = true,
            createdAt = DateTime.now(),
            closedAt = None,
            by = user.id,
            comments = Seq(
              ApiIssueComment(
                by = user.id,
                createdAt = DateTime.now(),
                lastModificationAt = DateTime.now(),
                content = ""
              )),
            lastModificationAt = DateTime.now(),
            apiVersion = defaultApi.api.currentVersion.value.some,
          ).asJson)
      )(tenant, userSession)
      Json.prettyPrint(issue.json)
      issue.status mustBe 404

    }
    "can retrieve all same issues list from any api versions" in {
      val issuesTags = Set(
        ApiIssueTag(ApiIssueTagId("foo"), "foo", "foo"),
        ApiIssueTag(ApiIssueTagId("bar"), "bar", "bar")
      )
      val rootApi = defaultApi.api.copy(
        issuesTags = issuesTags,
        issues = Seq(ApiIssueId("issue-foo"))
      )

      val secondApi = rootApi.copy(
        id = ApiId("foo"),
        currentVersion = Version("2.0.0")
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor),
        teams = Seq(teamOwner),
        apis = Seq(rootApi, secondApi),
        issues = Seq(
          ApiIssue(
            id = ApiIssueId("issue-foo"),
            seqId = 0,
            tenant = tenant.id,
            title = "super issue",
            tags = issuesTags.map(_.id),
            open = true,
            createdAt = DateTime.now(),
            closedAt = None,
            by = userApiEditor.id,
            comments = Seq.empty,
            lastModificationAt = DateTime.now()
          )
        )
      )

      val session = loginWithBlocking(userApiEditor, tenant)
      val issuesOfRootApi = httpJsonCallBlocking(
        path = s"/api/apis/${rootApi.humanReadableId}/issues"
      )(tenant, session)
      val issuesOfFooApi = httpJsonCallBlocking(
        path = s"/api/apis/${secondApi.humanReadableId}/issues"
      )(tenant, session)

      issuesOfRootApi.status mustBe Status.OK
      issuesOfFooApi.status mustBe Status.OK

      issuesOfRootApi.json.as[Seq[JsObject]].size mustBe issuesOfFooApi.json
        .as[Seq[JsObject]]
        .size

      (issuesOfRootApi.json.as[Seq[JsObject]].head \ "tags").get
        .asInstanceOf[JsArray]
        .value
        .size mustBe 2

      (issuesOfFooApi.json.as[Seq[JsObject]].head \ "tags").get
        .asInstanceOf[JsArray]
        .value
        .size mustBe 2
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
        api = defaultApi.api.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, userApiEditor, user),
        teams = Seq(
          teamOwner,
          teamConsumer
        ),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        subscriptions = Seq(sub)
      )
      val sessionAdmin = loginWithBlocking(userAdmin, tenant)
      val sessionApiEditor = loginWithBlocking(userApiEditor, tenant)
      val sessionUser = loginWithBlocking(user, tenant)

      val matrixOfMatrix = Map(
        (
          Some(TeamApiKeyVisibility.Administrator),
          Map((sessionAdmin, 200), (sessionApiEditor, 403), (sessionUser, 403))
        ),
        (
          Some(TeamApiKeyVisibility.ApiEditor),
          Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 403))
        ),
        (
          Some(TeamApiKeyVisibility.User),
          Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 200))
        ),
        (
          None,
          Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 200))
        )
      )

      matrixOfMatrix.foreachEntry((maybeVisibility, matrix) => {
        val resp = {
          httpJsonCallBlocking(
            path = s"/api/teams/${teamOwnerId.value}",
            method = "PUT",
            body =
              Some(teamConsumer.copy(apiKeyVisibility = maybeVisibility).asJson)
          )(tenant, sessionAdmin)
        }
        resp.status mustBe 200

        matrix.foreachEntry((session, response) => {
          val resp = httpJsonCallBlocking(
            s"/api/teams/${teamConsumerId.value}/subscription/${sub.id.value}/consumption"
          )(tenant, session)
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
        api = defaultApi.api.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, userApiEditor, user),
        teams = Seq(
          teamOwner,
          teamConsumer
        ),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        subscriptions = Seq(sub)
      )
      val sessionAdmin = loginWithBlocking(userAdmin, tenant)
      val sessionApiEditor = loginWithBlocking(userApiEditor, tenant)
      val sessionUser = loginWithBlocking(user, tenant)

      val callPerSec = 100L
      val callPerDay = 1000L
      val callPerMonth = 2000L
      val plan = defaultApi.plans.find(_.id == sub.plan).get
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
        tags = Set.empty[String],
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
                    Json.obj(
                      "id" -> otoroshiTarget.get.authorizedEntities.value.groups.head.value,
                      "name" -> otoroshiTarget.get.authorizedEntities.value.groups.head.value
                    )
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
        (
          Some(TeamApiKeyVisibility.Administrator),
          Map((sessionAdmin, 200), (sessionApiEditor, 403), (sessionUser, 403))
        ),
        (
          Some(TeamApiKeyVisibility.ApiEditor),
          Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 403))
        ),
        (
          Some(TeamApiKeyVisibility.User),
          Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 200))
        ),
        (
          None,
          Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 200))
        )
      )

      matrixOfMatrix.foreachEntry((maybeVisibility, matrix) => {
        val resp = {
          httpJsonCallBlocking(
            path = s"/api/teams/${teamOwnerId.value}",
            method = "PUT",
            body =
              Some(teamConsumer.copy(apiKeyVisibility = maybeVisibility).asJson)
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
                "enabled" -> true,
                "rotationEvery" -> 24,
                "gracePeriod" -> 12
              )
            )
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
        api = defaultApi.api.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, userApiEditor, user),
        teams = Seq(
          teamOwner,
          teamConsumer
        ),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        subscriptions = Seq(sub)
      )
      val sessionAdmin = loginWithBlocking(userAdmin, tenant)
      val sessionApiEditor = loginWithBlocking(userApiEditor, tenant)
      val sessionUser = loginWithBlocking(user, tenant)

      val matrixOfMatrix = Map(
        (
          Some(TeamApiKeyVisibility.Administrator),
          Map((sessionAdmin, 200), (sessionApiEditor, 403), (sessionUser, 403))
        ),
        (
          Some(TeamApiKeyVisibility.ApiEditor),
          Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 403))
        ),
        (
          Some(TeamApiKeyVisibility.User),
          Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 200))
        ),
        (
          None,
          Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 200))
        )
      )

      matrixOfMatrix.foreachEntry((maybeVisibility, matrix) => {
        val resp = {
          httpJsonCallBlocking(
            path = s"/api/teams/${teamOwnerId.value}",
            method = "PUT",
            body =
              Some(teamConsumer.copy(apiKeyVisibility = maybeVisibility).asJson)
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
                s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
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
//    "restrict the activation/deactivation of a subscription" in {
//      val payPerUsePlanId = UsagePlanId("1")
//      val subId = ApiSubscriptionId("test")
//      val sub = ApiSubscription(
//        id = subId,
//        tenant = tenant.id,
//        apiKey = OtoroshiApiKey("name", "id", "secret"),
//        plan = payPerUsePlanId,
//        createdAt = DateTime.now(),
//        team = teamConsumerId,
//        api = defaultApi.api.id,
//        by = userTeamAdminId,
//        customName = None,
//        rotation = None,
//        integrationToken = "test"
//      )
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin, userApiEditor, user),
//        teams = Seq(
//          teamOwner,
//          teamConsumer
//        ),
//        apis = Seq(defaultApi),
//        subscriptions = Seq(sub)
//      )
//      val sessionAdmin = loginWithBlocking(userAdmin, tenant)
//      val sessionApiEditor = loginWithBlocking(userApiEditor, tenant)
//      val sessionUser = loginWithBlocking(user, tenant)
//
//      val callPerSec = 100L
//      val callPerDay = 1000L
//      val callPerMonth = 2000L
//      val plan =
//        defaultApi.possibleUsagePlans.find(_.id == sub.plan).get
//      val otoroshiTarget = plan.otoroshiTarget
//      val otoApiKey = ActualOtoroshiApiKey(
//        clientId = sub.apiKey.clientId,
//        clientSecret = sub.apiKey.clientSecret,
//        clientName = sub.apiKey.clientName,
//        authorizedEntities = otoroshiTarget.get.authorizedEntities.value,
//        throttlingQuota = callPerSec,
//        dailyQuota = callPerDay,
//        monthlyQuota = callPerMonth,
//        constrainedServicesOnly = true,
//        tags = Set.empty[String],
//        restrictions = ApiKeyRestrictions(),
//        metadata = Map(),
//        rotation = None
//      )
//      val path = otoroshiDeleteApikeyPath(sub.apiKey.clientId)
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
//      val apiKeyPath = otoroshiGetApikeyPath(otoApiKey.clientId)
//      stubFor(
//        get(urlMatching(s"$apiKeyPath.*"))
//          .willReturn(
//            aResponse()
//              .withBody(
//                Json.stringify(
//                  otoApiKey.asJson.as[JsObject] ++
//                    Json.obj(
//                      "id" -> otoroshiTarget.get.authorizedEntities.value.groups.head.value,
//                      "name" -> otoroshiTarget.get.authorizedEntities.value.groups.head.value
//                    )
//                )
//              )
//              .withStatus(200)
//          )
//      )
//      val otoPathQuotas = otoroshiPathApiKeyQuotas(sub.apiKey.clientId)
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
//                    remainingCallsPerSec =
//                      plan.maxRequestPerSecond.getOrElse(0L) - callPerSec,
//                    authorizedCallsPerDay = plan.maxRequestPerDay.getOrElse(0),
//                    currentCallsPerDay = callPerDay,
//                    remainingCallsPerDay = plan.maxRequestPerDay
//                      .getOrElse(0L) - callPerDay,
//                    authorizedCallsPerMonth =
//                      plan.maxRequestPerMonth.getOrElse(0),
//                    currentCallsPerMonth = callPerMonth,
//                    remainingCallsPerMonth =
//                      plan.maxRequestPerMonth.getOrElse(0L) - callPerMonth
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
//      val matrixOfMatrix = Map(
//        (
//          Some(TeamApiKeyVisibility.Administrator),
//          Map((sessionAdmin, 200), (sessionApiEditor, 403), (sessionUser, 403))
//        ),
//        (
//          Some(TeamApiKeyVisibility.ApiEditor),
//          Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 403))
//        ),
//        (
//          Some(TeamApiKeyVisibility.User),
//          Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 200))
//        ),
//        (
//          None,
//          Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 200))
//        )
//      )
//
//      matrixOfMatrix.foreachEntry((maybeVisibility, matrix) => {
//        val resp = {
//          httpJsonCallBlocking(
//            path = s"/api/teams/${teamOwnerId.value}",
//            method = "PUT",
//            body =
//              Some(teamConsumer.copy(apiKeyVisibility = maybeVisibility).asJson)
//          )(tenant, sessionAdmin)
//        }
//        resp.status mustBe 200
//
//        matrix.foreachEntry((session, response) => {
//          val rdmName = Random.alphanumeric.take(10).mkString
//          val respUpdate = httpJsonCallBlocking(
//            path =
//              s"/api/teams/${teamConsumerId.value}/subscriptions/${sub.id.value}/_archive",
//            method = "PUT",
//            body = Some(Json.obj("customName" -> rdmName))
//          )(tenant, session)
//          logger.warn(s"$maybeVisibility -- $session")
//          logger.warn(s"status ${respUpdate.status} --> ${Json.stringify(respUpdate.json)}")
//          respUpdate.status mustBe response
//        })
//      })
//    }
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
        api = defaultApi.api.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, userApiEditor, user),
        teams = Seq(
          teamOwner,
          teamConsumer
        ),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        subscriptions = Seq(sub)
      )
      val sessionAdmin = loginWithBlocking(userAdmin, tenant)
      val sessionApiEditor = loginWithBlocking(userApiEditor, tenant)
      val sessionUser = loginWithBlocking(user, tenant)

      val callPerSec = 100L
      val callPerDay = 1000L
      val callPerMonth = 2000L
      val plan = defaultApi.plans.find(_.id == sub.plan).get
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
        tags = Set.empty[String],
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
                    Json.obj(
                      "id" -> otoroshiTarget.get.authorizedEntities.value.groups.head.value,
                      "name" -> otoroshiTarget.get.authorizedEntities.value.groups.head.value
                    )
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
        (
          Some(TeamApiKeyVisibility.Administrator),
          Map((sessionAdmin, 200), (sessionApiEditor, 403), (sessionUser, 403))
        ),
        (
          Some(TeamApiKeyVisibility.ApiEditor),
          Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 403))
        ),
        (
          Some(TeamApiKeyVisibility.User),
          Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 200))
        ),
        (
          None,
          Map((sessionAdmin, 200), (sessionApiEditor, 200), (sessionUser, 200))
        )
      )

      matrixOfMatrix.foreachEntry((maybeVisibility, matrix) => {
        val resp = {
          httpJsonCallBlocking(
            path = s"/api/teams/${teamOwnerId.value}",
            method = "PUT",
            body =
              Some(teamConsumer.copy(apiKeyVisibility = maybeVisibility).asJson)
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

  "aggregate api keys" can {
    "not be used when the mode is disabled on plan" in {
      val subId = ApiSubscriptionId("test")
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        subscriptions = Seq(
          ApiSubscription(
            id = subId,
            tenant = tenant.id,
            apiKey = OtoroshiApiKey("name", "id", "secret"),
            plan = UsagePlanId("5"),
            createdAt = DateTime.now(),
            team = teamConsumerId,
            api = defaultApi.api.id,
            by = userTeamAdminId,
            customName = None,
            rotation = None,
            integrationToken = "test"
          )
        )
      )

      wireMockServer.isRunning mustBe true

      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/4/team/${teamConsumerId.value}/${subId.value}/_extends",
        method = "PUT",
        body = Json.obj().some
      )(tenant, loginWithBlocking(user, tenant))

      resp.status mustBe Status.UNAUTHORIZED
    }
    "not be extended subscription that we have already a parent" in {
      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = UsagePlanId("5"),
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test"
      )
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("test2"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = UsagePlanId("6"),
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test2",
        parent = Some(parentSub.id)
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        subscriptions = Seq(parentSub, childSub)
      )
      wireMockServer.isRunning mustBe true

      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/4/team/${teamConsumerId.value}/${childSub.id.value}/_extends",
        method = "PUT",
        body = Json.obj().some
      )(tenant, loginWithBlocking(user, tenant))

      resp.status mustBe 409
    }

    "not be enabled on plan when aggregation on tenant is disabled" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user, userApiEditor),
        teams = Seq(teamOwner),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api)
      )
      wireMockServer.isRunning mustBe true

      val updatedPlans = defaultApi.plans.map {
        case p: Admin => p.copy(aggregationApiKeysSecurity = Some(true))
        case p: FreeWithoutQuotas =>
          p.copy(aggregationApiKeysSecurity = Some(true))
        case p: FreeWithQuotas =>
          p.copy(aggregationApiKeysSecurity = Some(true))
        case p: QuotasWithLimits =>
          p.copy(aggregationApiKeysSecurity = Some(true))
        case p: QuotasWithoutLimits =>
          p.copy(aggregationApiKeysSecurity = Some(true))
        case p: PayPerUse =>
          p.copy(aggregationApiKeysSecurity = Some(true))
        case p => p
      }

      updatedPlans.foreach(plan => {
        val resp = httpJsonCallBlocking(
          path =
            s"/api/teams/${teamOwner.id.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/plan/${plan.id.value}",
          method = "PUT",
          body = Some(plan.asJson)
        )(tenant, loginWithBlocking(userApiEditor, tenant))

        resp.status mustBe Status.BAD_REQUEST

        val expectedError =
          (AppError.toJson(SubscriptionAggregationDisabled) \ "error")
            .as[String]

        (resp.json \ "error").as[String] mustBe expectedError
      })

    }
    "match client id of this parent" in {
      val parentSubId = ApiSubscriptionId("parent")
      val parentApiKeyClientId = "clientId"

      val copiedPlan = QuotasWithoutLimits(
        UsagePlanId(IdGenerator.token),
        tenant = tenant.id,
        maxPerSecond = 10000,
        maxPerDay = 10000,
        maxPerMonth = 10000,
        costPerAdditionalRequest = BigDecimal(0.015),
        costPerMonth = BigDecimal(10.0),
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        trialPeriod = None,
        currency = Currency("EUR"),
        customName = None,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(OtoroshiSettingsId("default"),
                         Some(
                           AuthorizedEntities(
                             groups = Set(OtoroshiServiceGroupId("12345")))))
        ),
        allowMultipleKeys = Some(true),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val copiedApi = defaultApi.api.copy(
        id = ApiId("test"),
        possibleUsagePlans = Seq(copiedPlan.id)
      )

      setupEnvBlocking(
        tenants = Seq(tenant.copy(aggregationApiKeysSecurity = Some(true))),
        users = Seq(user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans :+ copiedPlan,
        apis = Seq(
          defaultApi.api,
          copiedApi
        ),
        subscriptions = Seq(
          ApiSubscription(
            id = parentSubId,
            tenant = tenant.id,
            apiKey = OtoroshiApiKey("name", parentApiKeyClientId, "secret"),
            plan = copiedPlan.id,
            createdAt = DateTime.now(),
            team = teamConsumerId,
            api = defaultApi.api.id,
            by = userTeamAdminId,
            customName = None,
            rotation = None,
            integrationToken = "parent"
          )
        )
      )

      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/test/plan/${copiedPlan.id.value}/team/${teamConsumerId.value}/${parentSubId.value}/_extends",
        method = "PUT",
        body = Json.obj().some
      )(tenant, loginWithBlocking(user, tenant))

      resp.status mustBe Status.OK

      daikokuComponents.env.dataStore.apiSubscriptionRepo
        .forTenant(tenant)
        .findById((resp.json \ "subscription" \ "_id").as[String])
        .map {
          case Some(sub) => sub.apiKey.clientId mustBe parentApiKeyClientId
          case None      => fail()
        }
    }
    "be transformed in unique api key when the subscription hasn't parent" in {
      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = UsagePlanId("4"),
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test"
      )
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("test2"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = UsagePlanId("5"),
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test2",
        parent = Some(parentSub.id)
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        subscriptions = Seq(parentSub, childSub)
      )
      wireMockServer.isRunning mustBe true

      val apiKeyPath = otoroshiGetApikeyPath(parentSub.apiKey.clientId)
      stubFor(
        get(urlMatching(s"$apiKeyPath.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  ActualOtoroshiApiKey(
                    clientId = parentSub.apiKey.clientId,
                    clientSecret = parentSub.apiKey.clientSecret,
                    clientName = parentSub.apiKey.clientName,
                    authorizedEntities = AuthorizedEntities(),
                    throttlingQuota = 10L,
                    dailyQuota = 10L,
                    monthlyQuota = 10L,
                    tags = Set.empty[String],
                    restrictions = ApiKeyRestrictions(),
                    metadata = Map(),
                    rotation = None
                  ).asJson
                )
              )
              .withStatus(200)
          )
      )

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/subscriptions/${parentSub.id.value}/_makeUnique",
        method = "POST"
      )(tenant, loginWithBlocking(user, tenant))

      resp.status mustBe 404
    }
    "be transform in unique api key" in {
      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = UsagePlanId("4"),
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test"
      )
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("test2"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = UsagePlanId("5"),
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test2",
        parent = Some(parentSub.id)
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamConsumer),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        subscriptions = Seq(parentSub, childSub)
      )
      wireMockServer.isRunning mustBe true

      stubFor(
        get(
          urlMatching(s"${otoroshiGetApikeyPath(childSub.apiKey.clientId)}.*")
        ).willReturn(
          aResponse()
            .withBody(
              Json.stringify(
                ActualOtoroshiApiKey(
                  clientId = childSub.apiKey.clientId,
                  clientSecret = childSub.apiKey.clientSecret,
                  clientName = childSub.apiKey.clientName,
                  authorizedEntities = AuthorizedEntities(),
                  throttlingQuota = 10L,
                  dailyQuota = 10L,
                  monthlyQuota = 10L,
                  tags = Set.empty[String],
                  restrictions = ApiKeyRestrictions(),
                  metadata = Map(),
                  rotation = None
                ).asJson
              )
            )
            .withStatus(200)
        )
      )
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
      stubFor(
        put(
          urlMatching(
            s"${otoroshiUpdateApikeyPath(childSub.apiKey.clientId)}.*"
          )
        ).willReturn(
          aResponse()
            .withBody(
              Json.stringify(
                ActualOtoroshiApiKey(
                  clientId = childSub.apiKey.clientId,
                  clientSecret = childSub.apiKey.clientSecret,
                  clientName = childSub.apiKey.clientName,
                  authorizedEntities = AuthorizedEntities(),
                  throttlingQuota = 10L,
                  dailyQuota = 10L,
                  monthlyQuota = 10L,
                  tags = Set.empty[String],
                  restrictions = ApiKeyRestrictions(),
                  metadata = Map(),
                  rotation = None
                ).asJson
              )
            )
            .withStatus(200)
        )
      )
      stubFor(
        put(urlMatching(s"/api/apikeys/.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  ActualOtoroshiApiKey(
                    clientId = childSub.apiKey.clientId,
                    clientSecret = childSub.apiKey.clientSecret,
                    clientName = childSub.apiKey.clientName,
                    authorizedEntities = AuthorizedEntities(),
                    throttlingQuota = 10L,
                    dailyQuota = 10L,
                    monthlyQuota = 10L,
                    tags = Set.empty[String],
                    restrictions = ApiKeyRestrictions(),
                    metadata = Map(),
                    rotation = None
                  ).asJson
                )
              )
              .withStatus(200)
          )
      )
      stubFor(
        post(urlMatching(s"/api/apikeys"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  ActualOtoroshiApiKey(
                    clientId = "newId",
                    clientSecret = "newSecret",
                    clientName = "newClientName",
                    authorizedEntities = AuthorizedEntities(),
                    throttlingQuota = 10L,
                    dailyQuota = 10L,
                    monthlyQuota = 10L,
                    tags = Set.empty[String],
                    restrictions = ApiKeyRestrictions(),
                    metadata = Map(),
                    rotation = None
                  ).asJson
                )
              )
              .withStatus(200)
          )
      )
      stubFor(
        get(urlMatching(s"${otoroshiUpdateApikeyPath("")}.*"))
          .willReturn(
            aResponse()
              .withBody(
                Json.stringify(
                  ActualOtoroshiApiKey(
                    clientId = "newId",
                    clientSecret = "newSecret",
                    clientName = "newClientName",
                    authorizedEntities = AuthorizedEntities(),
                    throttlingQuota = 10L,
                    dailyQuota = 10L,
                    monthlyQuota = 10L,
                    tags = Set.empty[String],
                    restrictions = ApiKeyRestrictions(),
                    metadata = Map(),
                    rotation = None
                  ).asJson
                )
              )
              .withStatus(200)
          )
      )
      stubFor(
        get(
          urlMatching(
            s"${otoroshiPathApiKeyQuotas(childSub.apiKey.clientId)}.*"
          )
        ).willReturn(
          aResponse()
            .withBody(
              Json.stringify(
                ApiKeyQuotas(
                  authorizedCallsPerSec = 10L,
                  currentCallsPerSec = 10L,
                  remainingCallsPerSec = 10L,
                  authorizedCallsPerDay = 10L,
                  currentCallsPerDay = 10L,
                  remainingCallsPerDay = 10L,
                  authorizedCallsPerMonth = 10L,
                  currentCallsPerMonth = 10L,
                  remainingCallsPerMonth = 10L
                ).asJson
              )
            )
            .withStatus(200)
        )
      )

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/subscriptions/${childSub.id.value}/_makeUnique",
        method = "POST"
      )(tenant, loginWithBlocking(user, tenant))

      resp.status mustBe 200

      val resp2 = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, loginWithBlocking(user, tenant))

      resp2.status mustBe 200
      val subscriptions = SeqApiSubscriptionFormat.reads(resp2.json)

      subscriptions.get.size mustBe 2

      assert(
        subscriptions.get.head.apiKey.clientId != subscriptions
          .get(1)
          .apiKey
          .clientId
      )
      assert(
        subscriptions.get.head.apiKey.clientSecret != subscriptions
          .get(1)
          .apiKey
          .clientSecret
      )
    }
    "failed when aggregated apikey has an otoroshi target different than parent" in {
      val parentSubId = ApiSubscriptionId("parent")
      val parentApiKeyClientId = "clientId"
      setupEnvBlocking(
        tenants = Seq(tenant.copy(aggregationApiKeysSecurity = Some(true))),
        users = Seq(user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans.map {
          case p: Admin => p.copy(aggregationApiKeysSecurity = Some(true))
          case p: FreeWithoutQuotas =>
            p.copy(
              aggregationApiKeysSecurity = Some(true),
              otoroshiTarget = Some(
                OtoroshiTarget(OtoroshiSettingsId("default2"),
                               Some(AuthorizedEntities(groups =
                                 Set(OtoroshiServiceGroupId("12345")))))
              )
            )
          case p: FreeWithQuotas =>
            p.copy(aggregationApiKeysSecurity = Some(true))
          case p: QuotasWithLimits =>
            p.copy(aggregationApiKeysSecurity = Some(true))
          case p: QuotasWithoutLimits =>
            p.copy(aggregationApiKeysSecurity = Some(true))
          case p: PayPerUse =>
            p.copy(aggregationApiKeysSecurity = Some(true))
          case p => p
        },
        apis = Seq(
          defaultApi.api
        ),
        subscriptions = Seq(
          ApiSubscription(
            id = parentSubId,
            tenant = tenant.id,
            apiKey = OtoroshiApiKey("name", parentApiKeyClientId, "secret"),
            plan = UsagePlanId("5"),
            createdAt = DateTime.now(),
            team = teamConsumerId,
            api = defaultApi.api.id,
            by = userTeamAdminId,
            customName = None,
            rotation = None,
            integrationToken = "parent"
          )
        )
      )
      val planId = defaultApi.api.possibleUsagePlans.head.value
      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/$planId/team/${teamConsumerId.value}/${parentSubId.value}/_extends",
        method = "PUT",
        body = Json.obj().some
      )(tenant, loginWithBlocking(user, tenant))

      resp.status mustBe Status.CONFLICT
      (resp.json \ "error")
        .as[String] mustBe "The subscribed plan has another otoroshi of the parent plan"
    }
  }
}
