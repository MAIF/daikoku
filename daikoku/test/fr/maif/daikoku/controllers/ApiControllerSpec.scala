package fr.maif.daikoku.controllers

import cats.implicits.catsSyntaxOptionId
import com.dimafeng.testcontainers.GenericContainer.FileSystemBind
import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.controllers.AppError.SubscriptionAggregationDisabled
import fr.maif.daikoku.domain.NotificationAction.{
  ApiAccess,
  ApiSubscriptionDemand,
  TransferApiOwnership
}
import fr.maif.daikoku.domain.NotificationType.AcceptOrReject
import fr.maif.daikoku.domain.TeamPermission.Administrator
import fr.maif.daikoku.domain.UsagePlanVisibility.{Private, Public}
import fr.maif.daikoku.domain._
import fr.maif.daikoku.domain.json.{
  ApiFormat,
  SeqApiSubscriptionFormat
}
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import fr.maif.daikoku.utils.IdGenerator
import org.joda.time.DateTime
import org.scalatest.concurrent.IntegrationPatience
import org.scalatest.{BeforeAndAfter, BeforeAndAfterEach}
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.BindMode
import play.api.http.Status
import play.api.libs.json.{Json, _}

import scala.concurrent.Await
import scala.concurrent.duration._
import scala.util.Random
import fr.maif.daikoku.utils.LoggerImplicits.BetterLogger

class ApiControllerSpec()
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfter
    with ForAllTestContainer {

  val pwd = System.getProperty("user.dir")

  override val container: GenericContainer = GenericContainer(
    "maif/otoroshi",
    exposedPorts = Seq(8080),
    fileSystemBind = Seq(
      FileSystemBind(
        s"$pwd/test/fr/maif/daikoku/otoroshi.json",
        "/home/user/otoroshi.json",
        BindMode.READ_ONLY
      )
    ),
    env = Map("APP_IMPORT_FROM" -> "/home/user/otoroshi.json")
  )

  before {
    Await.result(cleanOtoroshiServer(container.mappedPort(8080)), 5.seconds)
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
        generateApi("test-3", tenant2.id, teamOwnerId, Seq.empty)
      )

      val session = loginWithBlocking(tenantAdmin, tenant2)
      val resp    = httpJsonCallBlocking(
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
      val resp    = httpJsonCallBlocking(
        path = "/api/apis/_init",
        method = "POST",
        body = Some(json.SeqApiFormat.writes(apis.map(_.api)))
      )(tenant, session)

      resp.status mustBe 201
      val result = resp.json
        .as[JsArray]
        .value
        .map(v => ((v \ "name").as[String], (v \ "done").as[Boolean]))

      // no api created ==> resp = []
      result.forall(tuple =>
        !apis
          .map(_.api)
          .exists(api => api.name == tuple._1 && tuple._2)
      ) mustBe true
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
      val resp    = httpJsonCallBlocking(
        path = "/api/apis/_init",
        method = "POST",
        body = Some(json.SeqApiFormat.writes(apis))
      )(tenant, session)

      resp.status mustBe 201
      val result = resp.json
        .as[JsArray]
        .value
        .map(v => ((v \ "name").as[String], (v \ "done").as[Boolean]))

      result.forall(tuple => apis.exists(api => api.name == tuple._1 && tuple._2)) mustBe true
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
          "api"    -> apiId.asJson,
          "plan"   -> usagePlanId.asJson,
          "team"   -> teamId.asJson
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
        generateInitSubJson(
          "1",
          defaultApi.api.id,
          UsagePlanId("1"),
          teamOwnerId
        ),
        generateInitSubJson(
          "2",
          defaultApi.api.id,
          UsagePlanId("2"),
          teamOwnerId
        ),
        generateInitSubJson(
          "3",
          defaultApi.api.id,
          UsagePlanId("3"),
          teamOwnerId
        ),
        generateInitSubJson(
          "4",
          defaultApi.api.id,
          UsagePlanId("4"),
          teamOwnerId
        ),
        generateInitSubJson(
          "5",
          defaultApi.api.id,
          UsagePlanId("5"),
          teamOwnerId
        )
      )

      val session = loginWithBlocking(tenantAdmin, tenant2)
      val resp    = httpJsonCallBlocking(
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
          "api"    -> apiId.asJson,
          "plan"   -> usagePlanId.asJson,
          "team"   -> teamId.asJson
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
        generateInitSubJson(
          "1",
          defaultApi.api.id,
          UsagePlanId("1"),
          teamOwnerId
        ),
        generateInitSubJson(
          "2",
          defaultApi.api.id,
          UsagePlanId("2"),
          teamOwnerId
        ),
        generateInitSubJson(
          "3",
          defaultApi.api.id,
          UsagePlanId("3"),
          teamOwnerId
        ),
        generateInitSubJson(
          "4",
          defaultApi.api.id,
          UsagePlanId("4"),
          teamOwnerId
        ),
        generateInitSubJson(
          "5",
          defaultApi.api.id,
          UsagePlanId("5"),
          teamOwnerId
        )
      )

      val session = loginWithBlocking(tenantAdmin, tenant)
      val resp    = httpJsonCallBlocking(
        path = "/api/subscriptions/_init",
        method = "POST",
        body = Some(Json.arr(apikeys))
      )(tenant, session)

      resp.status mustBe 201
      val result = resp.json.as[JsArray].value.map(_.as[String])

      result.forall(res =>
        apikeys.exists(apikey =>
          (apikey \ "apikey")
            .as(json.OtoroshiApiKeyFormat)
            .clientName == res
        )
      ) mustBe true

      val sessionTest    = loginWithBlocking(userAdmin, tenant)
      val respTestApis   = httpJsonCallBlocking(
        s"/api/teams/${teamOwnerId.value}/subscribed-apis"
      )(tenant, sessionTest)
      respTestApis.status mustBe 200
      val resultTestApis = fr.maif.daikoku.domain.json.SeqApiFormat
        .reads(respTestApis.json)
      resultTestApis.isSuccess mustBe true
      resultTestApis.get.length mustBe 1
      resultTestApis.get.exists(a => a.id == defaultApi.api.id)

      val respTestSubscriptions   = httpJsonCallBlocking(
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamOwnerId.value}"
      )(tenant, sessionTest)
      respTestSubscriptions.status mustBe 200
      val resultTestSubscriptions =
        fr.maif.daikoku.domain.json.SeqApiSubscriptionFormat
          .reads(respTestSubscriptions.json)
      resultTestSubscriptions.isSuccess mustBe true
      resultTestSubscriptions.get.length mustBe 5
      Seq("1", "2", "3", "4", "5")
        .map(UsagePlanId.apply)
        .forall(id =>
          resultTestSubscriptions.get.exists(sub => sub.plan == id)
        ) mustBe true

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

      val api     = generateApi("0", tenant.id, teamOwnerId, Seq.empty)
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp    = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis",
        method = "POST",
        body = Some(api.api.asJson)
      )(tenant, session)

      resp.status mustBe 403
    }

    "setup a client name pattern to customize created APIkey name" in {
      val plan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "free without quotas",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val api  = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("parent.dev")),
        defaultUsagePlan = UsagePlanId("parent.dev").some
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            clientNamePattern = Some(
              "apk-test::api=${api.name}:${api.currentVersion}/${plan.name}::team=${team.name}"
            ),
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(userAdmin, user),
        teams = Seq(
          teamOwner,
          teamConsumer.copy(users =
            Set(
              UserWithPermission(userTeamUserId, Administrator)
            )
          ),
          defaultAdminTeam
        ),
        usagePlans = Seq(plan, adminApiPlan),
        apis = Seq(api, adminApi)
      )

      val session = loginWithBlocking(user, tenant)
      val resp    = httpJsonCallBlocking(
        path = s"/api/apis/${api.id.value}/plan/${plan.id.value}/team/${teamConsumer.id.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)
      resp.status mustBe 200

      val sub          = (resp.json \ "subscription").as(json.ApiSubscriptionFormat)
      val expectedName =
        s"apk-test::api=${api.name}:${api.currentVersion.value}/${plan.customName}::team=${teamConsumer.name}"
      sub.apiKey.clientName mustBe expectedName
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
      val resp    = httpJsonCallBlocking(
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
          "api"    -> apiId.asJson,
          "plan"   -> usagePlanId.asJson,
          "team"   -> teamId.asJson
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
        generateInitSubJson(
          "1",
          defaultApi.api.id,
          UsagePlanId("1"),
          teamOwnerId
        ),
        generateInitSubJson(
          "2",
          defaultApi.api.id,
          UsagePlanId("2"),
          teamOwnerId
        ),
        generateInitSubJson(
          "3",
          defaultApi.api.id,
          UsagePlanId("3"),
          teamOwnerId
        ),
        generateInitSubJson(
          "4",
          defaultApi.api.id,
          UsagePlanId("4"),
          teamOwnerId
        ),
        generateInitSubJson(
          "5",
          defaultApi.api.id,
          UsagePlanId("5"),
          teamOwnerId
        )
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp    = httpJsonCallBlocking(
        path = "/api/subscriptions/_init",
        method = "POST",
        body = Some(Json.arr(apikeys))
      )(tenant, session)

      resp.status mustBe 403
    }

    "see his teams (graphQl)" in {
      setupEnvBlocking(
        tenants = Seq(tenant.copy(subscriptionSecurity = Some(true))),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp    = httpJsonCallBlocking(
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

      setupEnvBlocking(
        tenants = Seq(tenant.copy(subscriptionSecurity = Some(false))),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer)
      )
      val session2 = loginWithBlocking(userAdmin, tenant)
      val resp2    = httpJsonCallBlocking(
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
      )(tenant, session2)
      resp2.status mustBe 200

      val result2 = (resp2.json \ "data" \ "myTeams").as[JsArray]
      result2.value.length mustBe 3
    }
    "see his teams" in {
      setupEnvBlocking(
        tenants = Seq(tenant.copy(subscriptionSecurity = Some(true))),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp    = httpJsonCallBlocking("/api/me/teams")(tenant, session)
      resp.status mustBe 200

      val result = resp.json.as[JsArray]
      result.value.length mustBe 2

      setupEnvBlocking(
        tenants = Seq(tenant.copy(subscriptionSecurity = Some(false))),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer)
      )
      val session2 = loginWithBlocking(userAdmin, tenant)
      val resp2    = httpJsonCallBlocking("/api/me/teams")(tenant, session2)
      resp2.status mustBe 200

      val result2 = resp2.json.as[JsArray]
      result2.value.length mustBe 3
    }

    "search a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant.copy(subscriptionSecurity = Some(true))),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer)
      )
      val session = loginWithBlocking(userAdmin, tenant)

      val resp =
        httpJsonCallBlocking(
          path = s"/api/_search",
          method = "POST",
          body = Some(Json.obj("search" -> ""))
        )(tenant, session)

      resp.status mustBe 200
      val maybeValue = resp.json
        .as[JsArray]
        .value
        .find(entry => (entry \ "label").as[String] == "Teams")
      maybeValue.isDefined mustBe true
      (maybeValue.get \ "options").as[JsArray].value.length mustBe 2

      val resp2 =
        httpJsonCallBlocking(
          path = s"/api/_search",
          method = "POST",
          body = Some(Json.obj("search" -> "Admin"))
        )(tenant, session)

      resp2.status mustBe 200
      val maybeValue2 = resp2.json
        .as[JsArray]
        .value
        .find(entry => (entry \ "label").as[String] == "Teams")
      maybeValue2.isDefined mustBe true
      (maybeValue2.get \ "options").as[JsArray].value.length mustBe 0

      // disable subscription security

      setupEnvBlocking(
        tenants = Seq(tenant.copy(subscriptionSecurity = Some(false))),
        users = Seq(userAdmin, userApiEditor),
        teams = Seq(teamOwner, teamConsumer)
      )
      val session2 = loginWithBlocking(userAdmin, tenant)

      val resp3 =
        httpJsonCallBlocking(
          path = s"/api/_search",
          method = "POST",
          body = Some(Json.obj("search" -> ""))
        )(tenant, session2)

      resp3.status mustBe 200
      val maybeValue3 = resp3.json
        .as[JsArray]
        .value
        .find(entry => (entry \ "label").as[String] == "Teams")
      maybeValue3.isDefined mustBe true
      (maybeValue3.get \ "options").as[JsArray].value.length mustBe 3

      val resp4 =
        httpJsonCallBlocking(
          path = s"/api/_search",
          method = "POST",
          body = Some(Json.obj("search" -> "Admin"))
        )(tenant, session2)

      resp4.status mustBe 200
      val maybeValue4 = resp4.json
        .as[JsArray]
        .value
        .find(entry => (entry \ "label").as[String] == "Teams")
      maybeValue4.isDefined mustBe true
      (maybeValue4.get \ "options").as[JsArray].value.length mustBe 1

    }

    "see one of his teams" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp    =
        httpJsonCallBlocking(s"/api/me/teams/${teamOwnerId.value}")(
          tenant,
          session
        )
      resp.status mustBe 200
      val result =
        fr.maif.daikoku.domain.json.TeamFormat.reads(resp.json)
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
      val resp    =
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
      val session   = loginWithBlocking(userAdmin, tenant)
      val resp      =
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

      val api     = generateApi("0", tenant.id, teamOwnerId, Seq.empty).api
      val session = loginWithBlocking(userAdmin, tenant)
      val resp    = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis",
        method = "POST",
        body = Some(api.asJson)
      )(tenant, session)

      resp.status mustBe 201
      val result =
        fr.maif.daikoku.domain.json.ApiFormat.reads(resp.json)
      result.isSuccess mustBe true
      result.get.equals(api) mustBe true
    }

    "create usage plan with only otoroshiTarget entities for which access is authorized" in {
      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(userAdmin),
        apis = Seq(defaultApi.api.copy(possibleUsagePlans = Seq.empty)),
        teams = Seq(
          teamConsumer,
          teamOwner.copy(
            authorizedOtoroshiEntities = Some(
              Seq(
                TeamAuthorizedEntities(
                  containerizedOtoroshi,
                  AuthorizedEntities(
                    groups = Set(OtoroshiServiceGroupId(serviceGroupDefault)),
                    routes = Set(OtoroshiRouteId(otherRouteId))
                  )
                )
              )
            )
          )
        )
      )
      val planToCreate = UsagePlan(
        id = UsagePlanId(IdGenerator.token),
        tenant = tenant.id,
        customName = "free without quotas",
        customDescription = None,
        otoroshiTarget = None,
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )

      val otoroshitargetWithUnauthGroup  = Some(
        OtoroshiTarget(
          containerizedOtoroshi,
          Some(
            AuthorizedEntities(
              groups = Set(OtoroshiServiceGroupId(serviceGroupDev))
            )
          )
        )
      )
      val otoroshitargetWithUnauthRoute  = Some(
        OtoroshiTarget(
          containerizedOtoroshi,
          Some(
            AuthorizedEntities(
              routes = Set(OtoroshiRouteId(parentRouteId))
            )
          )
        )
      )
      val otoroshitargetWithAuthEntities = Some(
        OtoroshiTarget(
          containerizedOtoroshi,
          Some(
            AuthorizedEntities(
              routes = Set(OtoroshiRouteId(otherRouteId)),
              groups = Set(OtoroshiServiceGroupId(serviceGroupDefault))
            )
          )
        )
      )

      val session = loginWithBlocking(userAdmin, tenant)

      val respGroupsForOwner = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/tenant/otoroshis/${containerizedOtoroshi.value}/groups"
      )(tenant, session)
      val respRoutesForOwner = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/tenant/otoroshis/${containerizedOtoroshi.value}/routes"
      )(tenant, session)

      respGroupsForOwner.status mustBe 200
      respGroupsForOwner.json.as[JsArray].value.length mustBe 1
      respRoutesForOwner.status mustBe 200
      respRoutesForOwner.json.as[JsArray].value.length mustBe 1

      val respGroupsForConsumer = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/tenant/otoroshis/${containerizedOtoroshi.value}/groups"
      )(tenant, session)
      val respRoutesForConsumer = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/tenant/otoroshis/${containerizedOtoroshi.value}/routes"
      )(tenant, session)

      respGroupsForConsumer.status mustBe 200
      respGroupsForConsumer.json
        .as[JsArray]
        .value
        .length mustBe 3 // dev, default, admin
      respRoutesForConsumer.status mustBe 200
      respRoutesForConsumer.json
        .as[JsArray]
        .value
        .length mustBe 4 // parent, child, other, admin

      val respUnauthRoute = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/plan",
        method = "POST",
        body = planToCreate
          .copy(otoroshiTarget = otoroshitargetWithUnauthRoute)
          .asJson
          .some
      )(tenant, session)
      respUnauthRoute.status mustBe 401

      val respUnauthGroup = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/plan",
        method = "POST",
        body = planToCreate
          .copy(otoroshiTarget = otoroshitargetWithUnauthGroup)
          .asJson
          .some
      )(tenant, session)
      respUnauthGroup.status mustBe 401

      val respAuthEntities = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/plan",
        method = "POST",
        body = planToCreate
          .copy(otoroshiTarget = otoroshitargetWithAuthEntities)
          .asJson
          .some
      )(tenant, session)
      respAuthEntities.status mustBe 201
    }

    "delete an api subscription from an api of his team" in {
      val plan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "free without quotas",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val api  = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("parent.dev")),
        defaultUsagePlan = UsagePlanId("parent.dev").some
      )
      val sub  = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token"
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            aggregationApiKeysSecurity = Some(true),
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(userAdmin, user),
        teams = Seq(
          teamOwner,
          teamConsumer.copy(users =
            Set(
              UserWithPermission(userTeamUserId, Administrator)
            )
          ),
          defaultAdminTeam
        ),
        usagePlans = Seq(plan, adminApiPlan),
        apis = Seq(api, adminApi),
        subscriptions = Seq(sub)
      )

      val session     = loginWithBlocking(userAdmin, tenant)
      val userSession = loginWithBlocking(user, tenant)

      val respPreVerifOtoParent = httpJsonCallBlocking(
        path = s"/api/apikeys/${sub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)

      (respPreVerifOtoParent.json \ "enabled").as[Boolean] mustBe true

      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/subscriptions/${sub.id.value}",
        method = "DELETE"
      )(tenant, session)
      resp.status mustBe 200

      val respVerifDk = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/subscription/${sub.id.value}/informations"
      )(tenant, userSession)
      respVerifDk.status mustBe 404

      val respVerifOto = httpJsonCallBlocking(
        path = s"/api/apikeys/${sub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)
      respVerifOto.status mustBe 404
    }

    "not update an api of a team which he is not a member" in {
      val secondApi  = defaultApi.api.copy(
        id = ApiId("another-api"),
        description = "another-api",
        team = teamConsumerId
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(
          teamOwner,
          teamConsumer.copy(users =
            Set(
              UserWithPermission(userTeamUserId, TeamPermission.Administrator)
            )
          )
        ),
        apis = Seq(defaultApi.api, secondApi)
      )
      val updatedApi = defaultApi.api.copy(description = "description")
      val session    = loginWithBlocking(userAdmin, tenant)

      val respError = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${secondApi.id.value}/${secondApi.currentVersion.value}",
        method = "PUT",
        body = Some(updatedApi.asJson)
      )(tenant, session)

      respError.status mustBe 404

      (respError.json \ "error")
        .as[String] mustBe AppError.ApiNotFound.getErrorMessage()

      val respError2 = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/apis/${secondApi.id.value}/${secondApi.currentVersion.value}",
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
      val session    = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}",
        method = "PUT",
        body = Some(updatedApi.asJson)
      )(tenant, session)

      resp.status mustBe 200
      val result =
        fr.maif.daikoku.domain.json.ApiFormat.reads(resp.json)
      result.isSuccess mustBe true
      result.get.description.equals("description") mustBe true

      val respGet =
        httpJsonCallBlocking(path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
        )(tenant, session)

      respGet.status mustBe 200
      val resultAsApi =
        fr.maif.daikoku.domain.json.ApiFormat.reads(respGet.json)
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
      val resp    = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}",
        method = "DELETE",
        body = Json.obj().some
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
      val resp    = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/apis/${defaultApi.api.id}",
        method = "DELETE",
        body = Json.obj().some
      )(tenant, session)
      resp.status mustBe 404

      val resp2 = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id}",
        method = "DELETE",
        body = Json.obj().some
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
      val plan    = defaultApi.plans.head
      val resp    = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/plan/${plan.id.value}/team/${teamConsumer.id.value}/_subscribe",
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

      val planUnauthorizedApi = UsagePlan(
        id = UsagePlanId(IdGenerator.token),
        tenant = tenant.id,
        customName = "Free without quotas",
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
      val unauthorizedApi     =
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
      val plan    = "1"
      // plan not found
      var resp    = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/subscriptions",
        method = "POST",
        body = Some(
          Json
            .obj("plan" -> "test", "teams" -> Json.arr(teamConsumer.id.asJson))
        )
      )(tenant, session)
      resp.status mustBe 404
      // team not found
      resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/plan/$plan/team/${teamAdminId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)

      resp.status mustBe 404
      (resp.json \ "error")
        .as[String] mustBe AppError.TeamNotFound.getErrorMessage()
      // api not found
      resp = httpJsonCallBlocking(
        path = s"/api/apis/test/plan/test/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)
      resp.status mustBe 404
      (resp.json \ "error")
        .as[String] mustBe AppError.ApiNotFound.getErrorMessage()
      // api unauthorized
      resp = httpJsonCallBlocking(
        path = s"/api/apis/${adminApi.id.value}/plan/admin/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)

      resp.status mustBe 401
      (resp.json \ "error")
        .as[String] mustBe AppError.ApiUnauthorized.getErrorMessage()
      // plan unauthorized
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

    "get subscription informations" in {
      val plan = UsagePlan(
        id = UsagePlanId("1"),
        tenant = tenant.id,
        customName = "new plan name",
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
      val sub  = ApiSubscription(
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

      val resp       = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/subscription/${sub.id.value}/informations"
      )(tenant, session)
      resp.status mustBe 200
      val simpleApi  = (resp.json \ "api").as[JsObject]
      val simpleSub  = (resp.json \ "subscription").as[JsObject]
      val simplePlan = (resp.json \ "plan").as[JsObject]

      (simpleApi \ "name").as[String] mustBe defaultApi.api.name
      (simpleSub \ "customName").as[String] mustBe sub.customName.get
      (simplePlan \ "customName").as[String] mustBe "new plan name"
    }

    "update a subscription to his api" in {
      val plan           = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "parent.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val api            = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("parent.dev")),
        defaultUsagePlan = UsagePlanId("parent.dev").some
      )
      val sub            = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = daikokuAdminId,
        customName = Some("custom name"),
        rotation = None,
        integrationToken = "test"
      )
      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(userAdmin),
        teams = Seq(
          teamOwner,
          teamConsumer.copy(
            users = Set(UserWithPermission(user.id, Administrator))
          )
        ),
        usagePlans = Seq(plan),
        apis = Seq(api),
        subscriptions = Seq(sub)
      )
      val otoroshiTarget = plan.otoroshiTarget
      val otoApiKey      = ActualOtoroshiApiKey(
        clientId = sub.apiKey.clientId,
        clientSecret = sub.apiKey.clientSecret,
        clientName = sub.apiKey.clientName,
        authorizedEntities = otoroshiTarget.get.authorizedEntities.value,
        throttlingQuota = plan.maxPerSecond.getOrElse(10L),
        dailyQuota = plan.maxPerDay.getOrElse(10L),
        monthlyQuota = plan.maxPerMonth.getOrElse(10L),
        restrictions = ApiKeyRestrictions(),
        metadata = Map(),
        rotation = None
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp    = httpJsonCallBlocking(
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
      val plan = UsagePlan(
        id = UsagePlanId("1"),
        tenant = tenant.id,
        customName = "new plan name",
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
      val sub  = ApiSubscription(
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
      val otoApiKey      = ActualOtoroshiApiKey(
        clientId = sub.apiKey.clientId,
        clientSecret = sub.apiKey.clientSecret,
        clientName = sub.apiKey.clientName,
        authorizedEntities = otoroshiTarget.get.authorizedEntities.value,
        throttlingQuota = plan.maxPerSecond.getOrElse(10L),
        dailyQuota = plan.maxPerDay.getOrElse(10L),
        monthlyQuota = plan.maxPerMonth.getOrElse(10L),
        restrictions = ApiKeyRestrictions(),
        metadata = Map(),
        rotation = None
      )

      val session = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/subscriptions/${sub.id.value}",
        method = "PUT",
        body = Some(
          sub.copy(customMetadata = Some(Json.obj("foo" -> "bar"))).asSafeJson
        )
      )(tenant, session)
      resp.status mustBe 403
    }

    "not accept subscription without custom metadata if plan requires it" in {
      val plan   = UsagePlan(
        id = UsagePlanId("3"),
        tenant = tenant.id,
        maxPerSecond = 10000L.some,
        maxPerMonth = 10000L.some,
        maxPerDay = 10000L.some,
        costPerMonth = BigDecimal(10.0).some,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month).some,
        trialPeriod = None,
        currency = Currency("EUR").some,
        customName = "QuotasWithLimits",
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
          ValidationStep.TeamAdmin(
            id = IdGenerator.token,
            team = defaultApi.api.team,
            title = "team.name"
          )
        ),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val demand = SubscriptionDemand(
        id = DemandId("1"),
        tenant = tenant.id,
        api = defaultApi.api.id,
        plan = UsagePlanId("3"),
        steps = Seq(
          SubscriptionDemandStep(
            id = SubscriptionDemandStepId("demandStep_1"),
            state = SubscriptionDemandState.InProgress,
            step = ValidationStep.TeamAdmin(
              id = "step_1",
              team = defaultApi.api.team,
              title = "Admin"
            ),
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
      val resp    = httpJsonCallBlocking(
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

      val api     = generateApi("0", tenant.id, teamOwnerId, Seq.empty)
      val session = loginWithBlocking(userAdmin, tenant)
      val resp    = httpJsonCallBlocking(
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

      val api     = generateApi("0", tenant.id, teamOwnerId, Seq.empty)
      val session = loginWithBlocking(userAdmin, tenant)
      val resp    = httpJsonCallBlocking(
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

      val session      = loginWithBlocking(userAdmin, tenant)
      val plan         = "1"
      val respPersonal = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/plan/$plan/team/${teamConsumer.id.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)

      respPersonal.status mustBe 403

      val respOrg = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/plan/$plan/team/${teamOwnerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)

      respOrg.status mustBe 200
    }

    "transfer subscriptions to another team" in {

      // creer un apk otoroshi a transferer
      Json.obj(
        "_loc"                    -> Json.obj(
          "tenant" -> "default",
          "teams"  -> Json.arr("default")
        ),
        "clientId"                -> parentApiKey.clientId,
        "clientSecret"            -> parentApiKey.clientSecret,
        "clientName"              -> parentApiKey.clientName,
        "description"             -> "",
        "authorizedGroup"         -> JsNull,
        "authorizedEntities"      -> Json.arr(
          s"route_$parentRouteId"
        ),
        "authorizations"          -> Json.arr(
          Json.obj(
            "kind" -> "route",
            "id"   -> parentRouteId
          )
        ),
        "enabled"                 -> true,
        "readOnly"                -> false,
        "allowClientIdOnly"       -> false,
        "throttlingQuota"         -> 10000000,
        "dailyQuota"              -> 10000000,
        "monthlyQuota"            -> 10000000,
        "constrainedServicesOnly" -> false,
        "restrictions"            -> Json.obj(
          "enabled"   -> false,
          "allowLast" -> true,
          "allowed"   -> Json.arr(),
          "forbidden" -> Json.arr(),
          "notFound"  -> Json.arr()
        ),
        "rotation"                -> Json.obj(
          "enabled"       -> false,
          "rotationEvery" -> 744,
          "gracePeriod"   -> 168,
          "nextSecret"    -> JsNull
        ),
        "validUntil"              -> JsNull,
        "tags"                    -> Json.arr(),
        "metadata"                -> Json.obj(
          "daikoku__metadata" -> "| foo",
          "foo"               -> "bar"
        )
      )

      // update otoroshi
      Await.result(cleanOtoroshiServer(container.mappedPort(8080)), 5.seconds)

      // setup dk
      val usagePlan    = UsagePlan(
        id = UsagePlanId("test.plan"),
        tenant = tenant.id,
        customName = "FreeWithoutQuotas",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            ),
            ApikeyCustomization(
              metadata = Json.obj("foo" -> "bar")
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val api          = defaultApi.api.copy(
        id = ApiId("test-api-id"),
        name = "test API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(usagePlan.id),
        defaultUsagePlan = usagePlan.id.some
      )
      val subscription = ApiSubscription(
        id = ApiSubscriptionId("test_sub"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = usagePlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "token",
        metadata = Json.obj("foo" -> "bar").some
      )
      // 2 equipes
      // une api / un plan
      // une souscription

      setupEnvBlocking(
        tenants = Seq(
          tenantEnvMode.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            ),
            environmentAggregationApiKeysSecurity = Some(true),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(userAdmin),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(api),
        usagePlans = Seq(usagePlan),
        subscriptions = Seq(subscription)
      )

      // get transfer link (no need to give team)
      val session  = loginWithBlocking(userAdmin, tenant)
      val respLink = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/subscriptions/${subscription.id.value}/_transfer"
      )(tenant, session)
      respLink.status mustBe 200
      val link     = (respLink.json \ "link").as[String]
      val token    = link.split("token=").lastOption.getOrElse("")

      // follow link
      val respRetrieve = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwner.id.value}/subscriptions/${subscription.id.value}/_retrieve",
        method = "PUT",
        body = Json.obj("token" -> token).some
      )(tenant, session)
      respRetrieve.status mustBe 200

      val consumerSubsReq   = httpJsonCallBlocking(
        s"/api/subscriptions/teams/${teamConsumer.id.value}"
      )(tenant, session)
      consumerSubsReq.status mustBe 200
      val maybeConsumerSubs =
        json.SeqApiSubscriptionFormat.reads(consumerSubsReq.json)
      maybeConsumerSubs.isSuccess mustBe true
      val consumerSubs      = maybeConsumerSubs.get
      consumerSubs.length mustBe 0

      val ownerSubsReq   = httpJsonCallBlocking(
        s"/api/subscriptions/teams/${teamOwner.id.value}"
      )(tenant, session)
      ownerSubsReq.status mustBe 200
      val maybeOwnerSubs =
        json.SeqApiSubscriptionFormat.reads(ownerSubsReq.json)
      maybeOwnerSubs.isSuccess mustBe true
      val ownerSubs      = maybeOwnerSubs.get
      ownerSubs.length mustBe 1
      ownerSubs.head.id mustBe subscription.id

      // TODO: verifier le nouveau nom de la subscription

    }

    "not transfer child subscriptions to another team but parent subscription" in {
      val parentPlanProd = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = envModeProd,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlanProd  = UsagePlan(
        id = UsagePlanId("child.dev"),
        tenant = tenant.id,
        customName = envModeProd,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentPlanProd.id),
        defaultUsagePlan = parentPlanProd.id.some
      )
      val childApi  = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childPlanProd.id),
        defaultUsagePlan = childPlanProd.id.some
      )

      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token"
      )
      val childSub  = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token",
        parent = parentSub.id.some
      )

      setupEnvBlocking(
        tenants = Seq(
          tenantEnvMode.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            ),
            environmentAggregationApiKeysSecurity = Some(true),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(user, userAdmin),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(parentApi, childApi),
        usagePlans = Seq(parentPlanProd, childPlanProd),
        subscriptions = Seq(parentSub, childSub)
      )

      val session  = loginWithBlocking(userAdmin, tenant)
      val respLink = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/subscriptions/${childSub.id.value}/_transfer"
      )(tenant, session)
      respLink.status mustBe 409
    }

    "not transfer child subscriptions to another team which have already a parent subscription" in {
      val parentPlanProd = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = envModeProd,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlanProd  = UsagePlan(
        id = UsagePlanId("child.dev"),
        tenant = tenant.id,
        customName = envModeProd,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentPlanProd.id),
        defaultUsagePlan = parentPlanProd.id.some
      )
      val childApi  = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childPlanProd.id),
        defaultUsagePlan = childPlanProd.id.some
      )

      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token"
      )
      val childSub  = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token",
        parent = parentSub.id.some
      )

      val parentOwnerSub = ApiSubscription(
        id = ApiSubscriptionId("parent_owner_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_owner_token"
      )
      val childOwnerSub  = ApiSubscription(
        id = ApiSubscriptionId("child_owner_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_owner_token",
        parent = parentSub.id.some
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            //          otoroshiSettings = Set(
            //            OtoroshiSettings(
            //              id = containerizedOtoroshi,
            //              url =
            //                s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
            //              host = "otoroshi-api.oto.tools",
            //              clientSecret = otoroshiAdminApiKey.clientSecret,
            //              clientId = otoroshiAdminApiKey.clientId
            //            )
            //          ),
            //          environmentAggregationApiKeysSecurity = Some(true),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(user, userAdmin),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(parentApi, childApi),
        usagePlans = Seq(parentPlanProd, childPlanProd),
        subscriptions = Seq(
          parentSub,
          childSub,
          parentOwnerSub
        )
      )

      val session  = loginWithBlocking(userAdmin, tenant)
      val respLink = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/subscriptions/${parentSub.id.value}/_transfer"
      )(tenant, session)
      respLink.status mustBe 200
      val link     = (respLink.json \ "link").as[String]
      val token    = link.split("token=").lastOption.getOrElse("")

      // todo: test with a team has already a parentSub

      val respRetrieve = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwner.id.value}/subscriptions/${parentSub.id.value}/_retrieve",
        method = "PUT",
        body = Json.obj("token" -> token).some
      )(tenant, session)
      respRetrieve.status mustBe 409
    }
    "not transfer child subscriptions to another team which have already a child subscription" in {
      val parentPlanProd = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = envModeProd,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlanProd  = UsagePlan(
        id = UsagePlanId("child.dev"),
        tenant = tenant.id,
        customName = envModeProd,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentPlanProd.id),
        defaultUsagePlan = parentPlanProd.id.some
      )
      val childApi  = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childPlanProd.id),
        defaultUsagePlan = childPlanProd.id.some
      )

      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token"
      )
      val childSub  = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token",
        parent = parentSub.id.some
      )

      val parentOwnerSub = ApiSubscription(
        id = ApiSubscriptionId("parent_owner_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_owner_token"
      )
      val childOwnerSub  = ApiSubscription(
        id = ApiSubscriptionId("child_owner_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_owner_token",
        parent = parentSub.id.some
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            //          otoroshiSettings = Set(
            //            OtoroshiSettings(
            //              id = containerizedOtoroshi,
            //              url =
            //                s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
            //              host = "otoroshi-api.oto.tools",
            //              clientSecret = otoroshiAdminApiKey.clientSecret,
            //              clientId = otoroshiAdminApiKey.clientId
            //            )
            //          ),
            //          environmentAggregationApiKeysSecurity = Some(true),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(user, userAdmin),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(parentApi, childApi),
        usagePlans = Seq(parentPlanProd, childPlanProd),
        subscriptions = Seq(
          parentSub,
          childSub,
          childOwnerSub
        )
      )

      val session  = loginWithBlocking(userAdmin, tenant)
      val respLink = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/subscriptions/${parentSub.id.value}/_transfer"
      )(tenant, session)
      respLink.status mustBe 200
      val link     = (respLink.json \ "link").as[String]
      val token    = link.split("token=").lastOption.getOrElse("")

      // todo: test with a team has already a parentSub

      val respRetrieve = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwner.id.value}/subscriptions/${parentSub.id.value}/_retrieve",
        method = "PUT",
        body = Json.obj("token" -> token).some
      )(tenant, session)
      respRetrieve.status mustBe 409
    }

    "transfer child subscriptions to another team which have already a subscription when parent plan allow it" in {
      val parentPlanProd = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = envModeProd,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(true),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlanProd  = UsagePlan(
        id = UsagePlanId("child.dev"),
        tenant = tenant.id,
        customName = envModeProd,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(true),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentPlanProd.id),
        defaultUsagePlan = parentPlanProd.id.some
      )
      val childApi  = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childPlanProd.id),
        defaultUsagePlan = childPlanProd.id.some
      )

      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token"
      )
      val childSub  = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token",
        parent = parentSub.id.some
      )

      val parentOwnerSub = ApiSubscription(
        id = ApiSubscriptionId("parent_owner_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_owner_token"
      )
      val childOwnerSub  = ApiSubscription(
        id = ApiSubscriptionId("child_owner_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_owner_token",
        parent = parentSub.id.some
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            ),
            environmentAggregationApiKeysSecurity = Some(true),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(user, userAdmin),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(parentApi, childApi),
        usagePlans = Seq(parentPlanProd, childPlanProd),
        subscriptions = Seq(
          parentSub,
          childSub,
          parentOwnerSub
        )
      )

      val session  = loginWithBlocking(userAdmin, tenant)
      val respLink = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/subscriptions/${parentSub.id.value}/_transfer"
      )(tenant, session)
      respLink.status mustBe 200
      val link     = (respLink.json \ "link").as[String]
      val token    = link.split("token=").lastOption.getOrElse("")

      // todo: test with a team has already a parentSub

      val respRetrieve = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwner.id.value}/subscriptions/${parentSub.id.value}/_retrieve",
        method = "PUT",
        body = Json.obj("token" -> token).some
      )(tenant, session)
      respRetrieve.status mustBe 200
    }
    "transfer child subscriptions to another team which have already a subscription when child plan allow it" in {
      val parentPlanProd = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = envModeProd,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(true),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlanProd  = UsagePlan(
        id = UsagePlanId("child.dev"),
        tenant = tenant.id,
        customName = envModeProd,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(true),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentPlanProd.id),
        defaultUsagePlan = parentPlanProd.id.some
      )
      val childApi  = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childPlanProd.id),
        defaultUsagePlan = childPlanProd.id.some
      )

      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token"
      )
      val childSub  = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token",
        parent = parentSub.id.some
      )

      val parentOwnerSub = ApiSubscription(
        id = ApiSubscriptionId("parent_owner_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_owner_token"
      )
      val childOwnerSub  = ApiSubscription(
        id = ApiSubscriptionId("child_owner_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_owner_token",
        parent = parentSub.id.some
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            ),
            environmentAggregationApiKeysSecurity = Some(true),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(user, userAdmin),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(parentApi, childApi),
        usagePlans = Seq(parentPlanProd, childPlanProd),
        subscriptions = Seq(
          parentSub,
          childSub,
          parentOwnerSub,
          childOwnerSub
        )
      )

      val session  = loginWithBlocking(userAdmin, tenant)
      val respLink = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/subscriptions/${parentSub.id.value}/_transfer"
      )(tenant, session)
      respLink.status mustBe 200
      val link     = (respLink.json \ "link").as[String]
      val token    = link.split("token=").lastOption.getOrElse("")

      // todo: test with a team has already a parentSub

      val respRetrieve = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwner.id.value}/subscriptions/${parentSub.id.value}/_retrieve",
        method = "PUT",
        body = Json.obj("token" -> token).some
      )(tenant, session)
      respRetrieve.status mustBe 200
    }

    "not transfer subscriptions to another team unauthorized on parent api" in {
      val parentPlanProd = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = envModeProd,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlanProd  = UsagePlan(
        id = UsagePlanId("child.dev"),
        tenant = tenant.id,
        customName = envModeProd,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentPlanProd.id),
        defaultUsagePlan = parentPlanProd.id.some,
        visibility = ApiVisibility.Private,
        authorizedTeams = Seq(teamOwner.id)
      )
      val childApi  = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childPlanProd.id),
        defaultUsagePlan = childPlanProd.id.some
      )

      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token"
      )
      val childSub  = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token",
        parent = parentSub.id.some
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            //          otoroshiSettings = Set(
            //            OtoroshiSettings(
            //              id = containerizedOtoroshi,
            //              url =
            //                s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
            //              host = "otoroshi-api.oto.tools",
            //              clientSecret = otoroshiAdminApiKey.clientSecret,
            //              clientId = otoroshiAdminApiKey.clientId
            //            )
            //          ),
            //          environmentAggregationApiKeysSecurity = Some(true),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(user, userAdmin),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(parentApi, childApi),
        usagePlans = Seq(parentPlanProd, childPlanProd),
        subscriptions = Seq(
          parentSub,
          childSub
        )
      )

      val session  = loginWithBlocking(userAdmin, tenant)
      val respLink = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwner.id.value}/subscriptions/${parentSub.id.value}/_transfer"
      )(tenant, session)
      respLink.status mustBe 200
      val link     = (respLink.json \ "link").as[String]
      val token    = link.split("token=").lastOption.getOrElse("")

      // todo: test with a team has already a parentSub

      val respRetrieve = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/subscriptions/${parentSub.id.value}/_retrieve",
        method = "PUT",
        body = Json.obj("token" -> token).some
      )(tenant, session)
      respRetrieve.status mustBe 401
    }
    "not transfer subscriptions to another team unauthorized on parent plan" in {
      val parentPlanProd = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = envModeProd,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true),
        visibility = UsagePlanVisibility.Private,
        authorizedTeams = Seq(teamOwner.id)
      )
      val childPlanProd  = UsagePlan(
        id = UsagePlanId("child.dev"),
        tenant = tenant.id,
        customName = envModeProd,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentPlanProd.id),
        defaultUsagePlan = parentPlanProd.id.some
      )
      val childApi  = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childPlanProd.id),
        defaultUsagePlan = childPlanProd.id.some
      )

      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token"
      )
      val childSub  = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token",
        parent = parentSub.id.some
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            //          otoroshiSettings = Set(
            //            OtoroshiSettings(
            //              id = containerizedOtoroshi,
            //              url =
            //                s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
            //              host = "otoroshi-api.oto.tools",
            //              clientSecret = otoroshiAdminApiKey.clientSecret,
            //              clientId = otoroshiAdminApiKey.clientId
            //            )
            //          ),
            //          environmentAggregationApiKeysSecurity = Some(true),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(user, userAdmin),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(parentApi, childApi),
        usagePlans = Seq(parentPlanProd, childPlanProd),
        subscriptions = Seq(
          parentSub,
          childSub
        )
      )

      val session  = loginWithBlocking(userAdmin, tenant)
      val respLink = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwner.id.value}/subscriptions/${parentSub.id.value}/_transfer"
      )(tenant, session)
      respLink.status mustBe 200
      val link     = (respLink.json \ "link").as[String]
      val token    = link.split("token=").lastOption.getOrElse("")

      // todo: test with a team has already a parentSub

      val respRetrieve = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/subscriptions/${parentSub.id.value}/_retrieve",
        method = "PUT",
        body = Json.obj("token" -> token).some
      )(tenant, session)
      respRetrieve.status mustBe 401
    }

    "not transfer subscriptions to another team unauthorized on child api" in {
      val parentPlanProd = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = envModeProd,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlanProd  = UsagePlan(
        id = UsagePlanId("child.dev"),
        tenant = tenant.id,
        customName = envModeProd,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentPlanProd.id),
        defaultUsagePlan = parentPlanProd.id.some
      )
      val childApi  = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childPlanProd.id),
        defaultUsagePlan = childPlanProd.id.some,
        visibility = ApiVisibility.Private,
        authorizedTeams = Seq(teamOwner.id)
      )

      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token"
      )
      val childSub  = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = childPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = childApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token",
        parent = parentSub.id.some
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            //          otoroshiSettings = Set(
            //            OtoroshiSettings(
            //              id = containerizedOtoroshi,
            //              url =
            //                s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
            //              host = "otoroshi-api.oto.tools",
            //              clientSecret = otoroshiAdminApiKey.clientSecret,
            //              clientId = otoroshiAdminApiKey.clientId
            //            )
            //          ),
            //          environmentAggregationApiKeysSecurity = Some(true),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(user, userAdmin),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(parentApi, childApi),
        usagePlans = Seq(parentPlanProd, childPlanProd),
        subscriptions = Seq(
          parentSub,
          childSub
        )
      )

      val session  = loginWithBlocking(userAdmin, tenant)
      val respLink = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwner.id.value}/subscriptions/${parentSub.id.value}/_transfer"
      )(tenant, session)
      respLink.status mustBe 200
      val link     = (respLink.json \ "link").as[String]
      val token    = link.split("token=").lastOption.getOrElse("")

      // todo: test with a team has already a parentSub

      val respRetrieve = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/subscriptions/${parentSub.id.value}/_retrieve",
        method = "PUT",
        body = Json.obj("token" -> token).some
      )(tenant, session)
      respRetrieve.status mustBe 401
    }
    "not transfer subscriptions to another team unauthorized on child plan" in {
      val parentPlanProd = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = envModeProd,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlanProd  = UsagePlan(
        id = UsagePlanId("child.dev"),
        tenant = tenant.id,
        customName = envModeProd,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true),
        visibility = UsagePlanVisibility.Private,
        authorizedTeams = Seq(teamOwner.id)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentPlanProd.id),
        defaultUsagePlan = parentPlanProd.id.some
      )
      val childApi  = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childPlanProd.id),
        defaultUsagePlan = childPlanProd.id.some
      )

      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token"
      )
      val childSub  = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = childPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = childApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token",
        parent = parentSub.id.some
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            //          otoroshiSettings = Set(
            //            OtoroshiSettings(
            //              id = containerizedOtoroshi,
            //              url =
            //                s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
            //              host = "otoroshi-api.oto.tools",
            //              clientSecret = otoroshiAdminApiKey.clientSecret,
            //              clientId = otoroshiAdminApiKey.clientId
            //            )
            //          ),
            //          environmentAggregationApiKeysSecurity = Some(true),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(user, userAdmin),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(parentApi, childApi),
        usagePlans = Seq(parentPlanProd, childPlanProd),
        subscriptions = Seq(
          parentSub,
          childSub
        )
      )

      val session  = loginWithBlocking(userAdmin, tenant)
      val respLink = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwner.id.value}/subscriptions/${parentSub.id.value}/_transfer"
      )(tenant, session)
      respLink.status mustBe 200
      val link     = (respLink.json \ "link").as[String]
      val token    = link.split("token=").lastOption.getOrElse("")

      // todo: test with a team has already a parentSub

      val respRetrieve = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/subscriptions/${parentSub.id.value}/_retrieve",
        method = "PUT",
        body = Json.obj("token" -> token).some
      )(tenant, session)
      respRetrieve.status mustBe 401
    }

    "setup validUntil date for a subscription to his api" in {
      val parentPlan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "Free without quotas",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("parent.dev")),
        defaultUsagePlan = UsagePlanId("parent.dev").some
      )

      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = parentPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token"
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            aggregationApiKeysSecurity = Some(true),
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer, defaultAdminTeam),
        usagePlans = Seq(parentPlan, adminApiPlan),
        apis = Seq(parentApi, adminApi),
        subscriptions = Seq(parentSub)
      )

      val session    = loginWithBlocking(userAdmin, tenant)
      // check validnuntil dans oto
      val respPreOto = httpJsonCallBlocking(
        path = s"/api/apikeys/${parentSub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)

      (respPreOto.json \ "validUntil").asOpt[Boolean] mustBe None

      // update subscription
      val validUntil = DateTime.now().plusHours(1)
      val respUpdate = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/subscriptions/${parentSub.id.value}",
        method = "PUT",
        body = Some(
          parentSub
            .copy(
              validUntil = validUntil.some
            )
            .asSafeJson
        )
      )(tenant, session)
      respUpdate.status mustBe 200

      // check validUntil dans oto
      val respUpdateOto = httpJsonCallBlocking(
        path = s"/api/apikeys/${parentSub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)
      (respUpdateOto.json \ "validUntil")
        .asOpt[Long] mustBe validUntil.getMillis.some
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
      val resp    = httpJsonCallBlocking(
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
      result.value.length mustBe 1
    }

    "see one of his teams" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(userApiEditor, tenant)
      val resp    =
        httpJsonCallBlocking(s"/api/me/teams/${teamOwnerId.value}")(
          tenant,
          session
        )
      resp.status mustBe 200
      val result =
        fr.maif.daikoku.domain.json.TeamFormat.reads(resp.json)
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
      val resp    =
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

      val api     = generateApi("0", tenant.id, teamOwnerId, Seq.empty)
      val session = loginWithBlocking(userApiEditor, tenant)
      val resp    = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis",
        method = "POST",
        body = Some(api.api.asJson)
      )(tenant, session)

      resp.status mustBe 201
      val result =
        fr.maif.daikoku.domain.json.ApiFormat.reads(resp.json)
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
      val session    = loginWithBlocking(userApiEditor, tenant)

      val respError = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/another-api/${defaultApi.api.currentVersion.value}",
        method = "PUT",
        body = Some(updatedApi.asJson)
      )(tenant, session)

      respError.status mustBe 404

      val respError2 = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/apis/another-api/${defaultApi.api.currentVersion.value}",
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
      val session    = loginWithBlocking(userApiEditor, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}",
        method = "PUT",
        body = Some(updatedApi.asJson)
      )(tenant, session)

      resp.status mustBe 200
      val result =
        fr.maif.daikoku.domain.json.ApiFormat.reads(resp.json)
      result.isSuccess mustBe true
      result.get.description.equals("description") mustBe true

      val respGet =
        httpJsonCallBlocking(path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
        )(tenant, session)

      respGet.status mustBe 200
      val resultAsApi =
        fr.maif.daikoku.domain.json.ApiFormat.reads(respGet.json)
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
      val resp    = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}",
        method = "DELETE",
        body = Json.obj().some
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

    }

    "delete an api subscription from an api of his team" in {
      val plan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "Free without quotas",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val api  = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("parent.dev")),
        defaultUsagePlan = UsagePlanId("parent.dev").some
      )
      val sub  = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token"
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            aggregationApiKeysSecurity = Some(true),
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(userApiEditor, user),
        teams = Seq(
          teamOwner,
          teamConsumer.copy(users =
            Set(
              UserWithPermission(userTeamUserId, Administrator)
            )
          ),
          defaultAdminTeam
        ),
        usagePlans = Seq(plan, adminApiPlan),
        apis = Seq(api, adminApi),
        subscriptions = Seq(sub)
      )

      val session     = loginWithBlocking(userApiEditor, tenant)
      val userSession = loginWithBlocking(user, tenant)

      val respPreVerifOtoParent = httpJsonCallBlocking(
        path = s"/api/apikeys/${sub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)

      (respPreVerifOtoParent.json \ "enabled").as[Boolean] mustBe true

      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/subscriptions/${sub.id.value}",
        method = "DELETE"
      )(tenant, session)
      resp.status mustBe 200

      val respVerifDk = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/subscription/${sub.id.value}/informations"
      )(tenant, userSession)
      respVerifDk.status mustBe 404

      val respVerifOto = httpJsonCallBlocking(
        path = s"/api/apikeys/${sub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)
      respVerifOto.status mustBe 404
    }

    "not delete an api of a team which he's not a member" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi.api.copy(team = teamConsumerId))
      )

      val session = loginWithBlocking(userApiEditor, tenant)
      val resp    = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/apis/${defaultApi.api.id}",
        method = "DELETE",
        body = Json.obj().some
      )(tenant, session)
      resp.status mustBe 404

      val resp2 = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id}",
        method = "DELETE",
        body = Json.obj().some
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
      val resp    = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/versions",
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
      val resp    = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/versions",
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

      val adminPlan = UsagePlan(
        id = UsagePlanId("admin"),
        tenant = tenant.id,
        customName = "admin",
        customDescription = None,
        otoroshiTarget = None,
        visibility = UsagePlanVisibility.Admin
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
      var resp    = httpJsonCallBlocking(path =
        s"/api/teams/${teamOwnerId.value}/apis/${secondApi.id.value}/${secondApi.currentVersion.value}"
      )(tenant, session)
      resp.status mustBe Status.OK
      ApiFormat.reads(resp.json).get.possibleUsagePlans.size mustBe 0

      resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${secondApi.id.value}/plans",
        method = "POST",
        body = Some(
          Json.obj(
            "plan" -> "admin",
            "api"  -> defaultApi.api.id.value
          )
        )
      )(tenant, session)
      resp.status mustBe Status.CREATED

      resp = httpJsonCallBlocking(path =
        s"/api/teams/${teamOwnerId.value}/apis/${secondApi.id.value}/${secondApi.currentVersion.value}"
      )(tenant, session)
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
          pages = Seq(ApiDocumentationDetailPage(page.id, page.title, Seq.empty))
        )
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor),
        teams = Seq(teamOwner),
        apis = Seq(rootApi, secondApi),
        pages = Seq(page)
      )
      val session = loginWithBlocking(userApiEditor, tenant)
      var resp    = httpJsonCallBlocking(path =
        s"/api/teams/${teamOwnerId.value}/apis/${secondApi.id.value}/${secondApi.currentVersion.value}"
      )(tenant, session)

      resp.status mustBe Status.OK
      ApiFormat.reads(resp.json).get.documentation.pages.size mustBe 0

      resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${secondApi.id.value}/${secondApi.currentVersion.value}/pages",
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

//    "transfer API ownership to another team" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(userAdmin),
//        teams = Seq(
//          teamOwner.copy(
//            users = Set(UserWithPermission(userTeamAdminId, Administrator))
//          ),
//          teamConsumer.copy(
//            users = Set(UserWithPermission(userTeamAdminId, Administrator))
//          )
//        ),
//        apis = Seq(defaultApi.api)
//      )
//
//      val session = loginWithBlocking(userAdmin, tenant)
//      val transfer = httpJsonCallBlocking(
//        path =
//          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/_transfer",
//        method = "POST",
//        body = Some(Json.obj("team" -> teamConsumer.id.value))
//      )(tenant, session)
//      transfer.status mustBe 200
//      (transfer.json \ "notify").as[Boolean] mustBe true
//
//      val resp = httpJsonCallBlocking(s"/api/me/notifications")(tenant, session)
//      resp.status mustBe 200
//      (resp.json \ "count").as[Long] mustBe 1
//      val eventualNotifications = json.SeqNotificationFormat.reads(
//        (resp.json \ "notifications").as[JsArray]
//      )
//      eventualNotifications.isSuccess mustBe true
//      val notification: Notification = eventualNotifications.get.head
//
//      val acceptNotif = httpJsonCallBlocking(
//        path = s"/api/notifications/${notification.id.value}/accept",
//        method = "PUT",
//        body = Some(Json.obj())
//      )(tenant, session)
//      acceptNotif.status mustBe 200
//      (acceptNotif.json \ "done").as[Boolean] mustBe true
//      val respVerif =
//        httpJsonCallBlocking(
//          path =
//            s"/api/teams/${teamConsumerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
//        )(tenant, session)
//      respVerif.status mustBe 200 //FIXME 404
//      val eventualApi = json.ApiFormat.reads(respVerif.json)
//      eventualApi.isSuccess mustBe true
//      eventualApi.get.team mustBe teamConsumerId
//    }

    "transfer API ownership to another team with in progress demand" in {
      val process = Seq(
        ValidationStep.Form(
          id = IdGenerator.token,
          title = "Form"
        ),
        ValidationStep.TeamAdmin(
          id = IdGenerator.token,
          team = defaultApi.api.team,
          title = "Admin"
        )
      )
      val plan    = UsagePlan(
        id = UsagePlanId(IdGenerator.token),
        tenant = tenant.id,
        maxPerSecond = 10000L.some,
        maxPerDay = 10000L.some,
        maxPerMonth = 10000L.some,
        costPerMonth = BigDecimal(10.0).some,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month).some,
        trialPeriod = None,
        currency = Currency("EUR").some,
        customName = "quotas with limits",
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
        subscriptionProcess = process,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
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
        apis = Seq(defaultApi.api.copy(possibleUsagePlans = Seq(plan.id))),
        usagePlans = Seq(plan)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      // demand apikey for consumer
      val demand  = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/plan/${plan.id.value}/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Some(Json.obj("motivation" -> "pleaaase"))
      )(tenant, session)
      demand.status mustBe 200

      // check notification for demand is saved for owner team
      val notificationsForOwner    = Await.result(
        daikokuComponents.env.dataStore.notificationRepo
          .forTenant(tenant)
          .findNotDeleted(Json.obj("team" -> teamOwnerId.asJson)),
        5.seconds
      )
      notificationsForOwner.length mustBe 1
      val notificationdemand       = notificationsForOwner.head
      // check notification for demand is saved for owner team
      val notificationsForConsumer = Await.result(
        daikokuComponents.env.dataStore.notificationRepo
          .forTenant(tenant)
          .findNotDeleted(Json.obj("team" -> teamConsumerId.asJson)),
        5.seconds
      )
      notificationsForConsumer.length mustBe 0

      // transfer ownership for api from owner to consumer
      val transfer = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/_transfer",
        method = "POST",
        body = Some(Json.obj("team" -> teamConsumer.id.value))
      )(tenant, session)
      transfer.status mustBe 200
      (transfer.json \ "notify").as[Boolean] mustBe true

      // accept transfer (2 notification available, transfer & demand)
      val resp                       = getOwnNotificationsCallBlocking(
        Json.obj(
          "filterTable" -> Json.stringify(
            Json.arr(
              Json.obj(
                "id" -> "type",
                "value" -> Json.arr("TransferApiOwnership")
              )
            )
          )
        )
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "data" \ "myNotifications" \ "totalFiltered")
        .as[Long] mustBe 1

      val notifications =
        (resp.json \ "data" \ "myNotifications" \ "notifications")
          .as[JsArray]

      val notification = notifications.head

      (notification \ "action" \ "__typename")
        .as[String] mustBe "TransferApiOwnership"

      val acceptNotif                = httpJsonCallBlocking(
        path = s"/api/notifications/${(notification \ "_id").as[String]}/accept",
        method = "PUT",
        body = Some(Json.obj())
      )(tenant, session)
      acceptNotif.status mustBe 200
      (acceptNotif.json \ "done").as[Boolean] mustBe true
      val respVerif                  =
        httpJsonCallBlocking(
          path =
            s"/api/teams/${teamConsumerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
        )(tenant, session)
      respVerif.status mustBe 200
      val eventualApi                = json.ApiFormat.reads(respVerif.json)
      eventualApi.isSuccess mustBe true
      eventualApi.get.team mustBe teamConsumerId

      // verifier que la notif a bien été changé d'équipe
      // check notification (O for owner)
      val notificationsForOwner2    = Await.result(
        daikokuComponents.env.dataStore.notificationRepo
          .forTenant(tenant)
          .findNotDeleted(Json.obj("team" -> teamOwnerId.asJson)),
        5.seconds
      )
      notificationsForOwner2.length mustBe 0
      // check notification (2 for consumer, demand & transfer accepted)
      val notificationsForConsumer2 = Await.result(
        daikokuComponents.env.dataStore.notificationRepo
          .forTenant(tenant)
          .findNotDeleted(Json.obj("team" -> teamConsumerId.asJson)),
        5.seconds
      )
      notificationsForConsumer2.length mustBe 2
      notificationsForConsumer2.count(_.id == notificationdemand.id) mustBe 1
      // check notif is the original demand

      // check also demand
      val demands = Await.result(
        daikokuComponents.env.dataStore.subscriptionDemandRepo
          .forTenant(tenant)
          .findNotDeleted(
            Json.obj(
              "api"  -> defaultApi.api.id.asJson,
              "team" -> teamConsumerId.asJson
            )
          ),
        5.seconds
      )
      demands.length mustBe 1
    }

    /*
    The following test aims to verify the transfer of API ownership for all versions of an API.
    Steps:
    1 - Set up the test environment with two versions of an API, each having a plan that requires admin validation for subscriptions.
    2 - Generate two subscriptions for the "consumer" team. This should result in two notifications for the "owner" team and two subscription demands requiring validation for the "owner" team.
    3 - Perform the ownership transfer from ownerTeam to consumerTeam.
    Test validation:
    4 - Both API versions are now owned by the "consumer" team.
    5 - The "consumer" team has two notifications for "ApiSubscriptionDemand."
    6 - There are two subscription demands requiring validation for the "consumer" team.
     */
    "transfer API ownership to another team (with all versions)" in {
      // 1
      val process      = ValidationStep.TeamAdmin(
        id = IdGenerator.token,
        team = defaultApi.api.team,
        title = "Admin"
      )
      val processV2    = process.copy(id = IdGenerator.token)
      val plan         = UsagePlan(
        id = UsagePlanId(IdGenerator.token),
        tenant = tenant.id,
        maxPerSecond = 10000L.some,
        maxPerDay = 10000L.some,
        maxPerMonth = 10000L.some,
        costPerMonth = BigDecimal(10.0).some,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month).some,
        trialPeriod = None,
        currency = Currency("EUR").some,
        customName = "quotas with limit",
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
          ValidationStep.Form(id = IdGenerator.token, title = "form"),
          process
        ),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val plan2        = plan.copy(
        id = UsagePlanId(IdGenerator.token),
        customName = "plan 2",
        subscriptionProcess = Seq(
          ValidationStep.Form(id = IdGenerator.token, title = "form"),
          processV2
        )
      )
      val defaultApiV2 =
        defaultApi.api.copy(
          id = ApiId(IdGenerator.token(32)),
          currentVersion = Version("2.0.0"),
          possibleUsagePlans = Seq(plan2.id)
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
        apis = Seq(
          defaultApi.api.copy(possibleUsagePlans = Seq(plan.id)),
          defaultApiV2
        ),
        usagePlans = Seq(plan, plan2)
      )

      val versions = Seq(defaultApi.api, defaultApiV2)

      val session = loginWithBlocking(userAdmin, tenant)

      // 2
      val demand = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/plan/${plan.id.value}/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Some(Json.obj("motivation" -> "pleaaase"))
      )(tenant, session)
      demand.status mustBe 200

      val demand2 = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApiV2.id.value}/plan/${plan.id.value}/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Some(Json.obj("motivation" -> "pleaaase"))
      )(tenant, session)
      demand2.status mustBe 200

      // check notification for demand is saved for owner team
      val notificationsForOwner    = Await.result(
        daikokuComponents.env.dataStore.notificationRepo
          .forTenant(tenant)
          .findNotDeleted(Json.obj("team" -> teamOwnerId.asJson)),
        5.seconds
      )
      notificationsForOwner.length mustBe 2
      val notificationsdemand      = notificationsForOwner
      // check notification for demand is saved for owner team
      val notificationsForConsumer = Await.result(
        daikokuComponents.env.dataStore.notificationRepo
          .forTenant(tenant)
          .findNotDeleted(Json.obj("team" -> teamConsumerId.asJson)),
        5.seconds
      )
      notificationsForConsumer.length mustBe 0
      // check also demand
      val demandsForAllversion     = Await.result(
        daikokuComponents.env.dataStore.subscriptionDemandRepo
          .forTenant(tenant)
          .findNotDeleted(
            Json.obj(
              "api"   -> Json.obj("$in" -> JsArray(versions.map(_.id.asJson))),
              "state" -> Json.obj(
                "$in" -> Json.arr(
                  SubscriptionDemandState.InProgress.name,
                  SubscriptionDemandState.Waiting.name
                )
              )
            )
          ),
        5.seconds
      )
      demandsForAllversion.length mustBe 2

      demandsForAllversion.count(d =>
        d.steps.exists {
          case SubscriptionDemandStep(
                _,
                _,
                step: ValidationStep.TeamAdmin,
                _
              ) =>
            step.team === teamOwnerId
          case _ => false
        }
      ) mustBe 2

      // 3
      val transfer = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/_transfer",
        method = "POST",
        body = Some(Json.obj("team" -> teamConsumer.id.value))
      )(tenant, session)
      transfer.status mustBe 200
      (transfer.json \ "notify").as[Boolean] mustBe true

      val resp = getOwnNotificationsCallBlocking(
        Json.obj(
          "filterTable" -> Json.stringify(
            Json.arr(
              Json.obj(
                "id" -> "type",
                "value" -> Json.arr("TransferApiOwnership")
              )
            )
          )
        )
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "data" \ "myNotifications" \ "totalFiltered")
        .as[Long] mustBe 1

      val notifications =
        (resp.json \ "data" \ "myNotifications" \ "notifications")
          .as[JsArray]

      val notification = notifications.head

      (notification \ "action" \ "__typename")
        .as[String] mustBe "TransferApiOwnership"

      val acceptNotif = httpJsonCallBlocking(
        path =
          s"/api/notifications/${(notification \ "_id").as[String]}/accept",
        method = "PUT",
        body = Some(Json.obj())
      )(tenant, session)
      acceptNotif.status mustBe 200
      (acceptNotif.json \ "done").as[Boolean] mustBe true

      // 4
      val respVerif    =
        httpJsonCallBlocking(
          s"/api/teams/${teamConsumerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
        )(tenant, session)
      respVerif.status mustBe 200
      val eventualApi  = json.ApiFormat.reads(respVerif.json)
      eventualApi.isSuccess mustBe true
      eventualApi.get.team mustBe teamConsumerId
      val respVerif2   =
        httpJsonCallBlocking(
          s"/api/teams/${teamConsumerId.value}/apis/${defaultApiV2.id.value}/${defaultApiV2.currentVersion.value}"
        )(tenant, session)
      respVerif2.status mustBe 200
      val eventualApi2 = json.ApiFormat.reads(respVerif.json)
      eventualApi2.isSuccess mustBe true
      eventualApi2.get.team mustBe teamConsumerId

      // 5
      val notificationsForOwner2    = Await.result(
        daikokuComponents.env.dataStore.notificationRepo
          .forTenant(tenant)
          .findNotDeleted(Json.obj("team" -> teamOwnerId.asJson)),
        5.seconds
      )
      notificationsForOwner2.length mustBe 0
      val notificationsForConsumer2 = Await
        .result(
          daikokuComponents.env.dataStore.notificationRepo
            .forTenant(tenant)
            .findNotDeleted(Json.obj("team" -> teamConsumerId.asJson)),
          5.seconds
        )
        .filter(_.action.isInstanceOf[ApiSubscriptionDemand])
      notificationsForConsumer2.length mustBe 2
      notificationsForConsumer2.count(n => notificationsdemand.exists(_.id == n.id)) mustBe 2

      // 6
      val demandsForAllversion2 = Await.result(
        daikokuComponents.env.dataStore.subscriptionDemandRepo
          .forTenant(tenant)
          .findNotDeleted(
            Json.obj(
              "api"   -> Json.obj("$in" -> JsArray(versions.map(_.id.asJson))),
              "state" -> Json.obj(
                "$in" -> Json.arr(
                  SubscriptionDemandState.InProgress.name,
                  SubscriptionDemandState.Waiting.name
                )
              )
            )
          ),
        5.seconds
      )
      demandsForAllversion2.length mustBe 2
      demandsForAllversion2.count(d =>
        d.steps.exists {
          case SubscriptionDemandStep(
                _,
                _,
                step: ValidationStep.TeamAdmin,
                _
              ) =>
            step.team === teamConsumerId
          case _ => false
        }
      ) mustBe 2
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
      val resp    = httpJsonCallBlocking(
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
        users = Seq(user),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(user, tenant)
      val resp    =
        httpJsonCallBlocking(s"/api/me/teams/${teamOwnerId.value}")(
          tenant,
          session
        )
      resp.status mustBe 200
      val result =
        fr.maif.daikoku.domain.json.TeamFormat.reads(resp.json)
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
      val resp    =
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
      val resp    = httpJsonCallBlocking(
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
      val session    = loginWithBlocking(user, tenant)
      val resp       = httpJsonCallBlocking(
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
      val resp    = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id}",
        method = "DELETE",
        body = Json.obj().some
      )(tenant, session)

      resp.status mustBe 403
    }

    "subscribe to an api" in {
      val teamIdWithApiKeyVisible = TeamId("team-consumer-with-apikey-visible")
      val parentPlan              = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "parent.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("parent.dev")),
        defaultUsagePlan = UsagePlanId("parent.dev").some
      )
      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(userApiEditor),
        teams = Seq(
          teamOwner,
          teamConsumer.copy(
            apiKeyVisibility = Some(TeamApiKeyVisibility.ApiEditor),
            users = Set(UserWithPermission(userApiEditorId, TeamPermission.TeamUser))
          ),
          teamConsumer.copy(
            id = teamIdWithApiKeyVisible,
            apiKeyVisibility = Some(TeamApiKeyVisibility.User),
            users = Set(UserWithPermission(userApiEditorId, TeamPermission.TeamUser))
          )
        ),
        usagePlans = Seq(parentPlan),
        apis = Seq(parentApi)
      )
      val session   = loginWithBlocking(userApiEditor, tenant)
      val resp      = httpJsonCallBlocking(
        path = s"/api/apis/${parentApi.id.value}/plan/${parentPlan.id.value}/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)

      resp.status mustBe 200

      val resultAsSubscription = (resp.json \ "subscription").as[JsObject]
      (resultAsSubscription \ "plan").as[String] mustBe parentPlan.id.value
      (resultAsSubscription \ "team").as[String] mustBe teamConsumerId.value
      (resultAsSubscription \ "by").as[String] mustBe userApiEditor.id.value

    }

    "get his team visible apis" in {
      val planSubId = UsagePlanId("1")
      val sub       = ApiSubscription(
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
            sender = NotificationSender(
              name = user.name,
              email = user.email,
              id = user.id.some
            ),
            notificationType = AcceptOrReject,
            action = ApiSubscriptionDemand(
              defaultApi.api.id,
              UsagePlanId("2"),
              teamConsumerId,
              motivation = Some("motivation"),
              demand = DemandId(IdGenerator.token),
              step = SubscriptionDemandStepId(IdGenerator.token)
            )
          )
        )
      )
      val session   = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/me/teams/${teamConsumerId.value}/visible-apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
      )(tenant, session)
      resp.status mustBe 200

      val pendingRequests = (resp.json \ "pendingRequestPlan")
        .as[JsArray]
        .value
        .map(_.as(json.UsagePlanIdFormat))
      val subscriptions   = (resp.json \ "subscriptions").as[JsArray]

      pendingRequests.length mustBe 1
      pendingRequests.head mustBe UsagePlanId("2")

      subscriptions.value.length mustBe 1
      (subscriptions.value.head \ "_id")
        .as(json.ApiSubscriptionIdFormat) mustBe ApiSubscriptionId("test")
    }

    "not get team visible apis if he's not a member of this team" in {
      val planSubId = UsagePlanId("1")
      val sub       = ApiSubscription(
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
            sender = NotificationSender(
              name = user.name,
              email = user.email,
              id = user.id.some
            ),
            notificationType = AcceptOrReject,
            action = ApiSubscriptionDemand(
              defaultApi.api.id,
              UsagePlanId("2"),
              teamConsumerId,
              motivation = Some("motivation"),
              demand = DemandId(IdGenerator.token),
              step = SubscriptionDemandStepId(IdGenerator.token)
            )
          )
        )
      )
      val session   = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/me/teams/${teamConsumerId.value}/visible-apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
      )(tenant, session)
      resp.status mustBe 403
    }

    "not get team visible apis if this api doesn't exists" in {
      val planSubId = UsagePlanId("1")
      val sub       = ApiSubscription(
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
            sender = NotificationSender(
              name = user.name,
              email = user.email,
              id = user.id.some
            ),
            notificationType = AcceptOrReject,
            action = ApiSubscriptionDemand(
              defaultApi.api.id,
              UsagePlanId("2"),
              teamConsumerId,
              motivation = Some("motivation"),
              demand = DemandId(IdGenerator.token),
              step = SubscriptionDemandStepId(IdGenerator.token)
            )
          )
        )
      )
      val session   = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/api/me/teams/${teamConsumerId.value}/visible-apis/another-api/${defaultApi.api.currentVersion.value}"
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
      val sessionUser  = loginWithBlocking(user, tenant)

      val subAdminResp = httpJsonCallBlocking(
        path = s"/api/me/subscriptions/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
      )(tenant, sessionAdmin)
      subAdminResp.status mustBe 200

      val subUserResp = httpJsonCallBlocking(
        path = s"/api/me/subscriptions/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
      )(tenant, sessionUser)
      subUserResp.status mustBe 401

    }
  }

  "a subscription" should {
    "be not available right now if plan's subscription process is manual" in {
      val plan = UsagePlan(
        id = UsagePlanId("1"),
        tenant = tenant.id,
        maxPerSecond = 10000L.some,
        maxPerDay = 10000L.some,
        maxPerMonth = 10000L.some,
        costPerMonth = BigDecimal(10.0).some,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month).some,
        trialPeriod = None,
        currency = Currency("EUR").some,
        customName = "QuotasWithLimits",
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
          ValidationStep.Form(
            id = IdGenerator.token,
            title = "Form"
          ),
          ValidationStep.TeamAdmin(
            id = IdGenerator.token,
            team = defaultApi.api.team,
            title = "Admin"
          )
        ),
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
      val resp    = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/plan/${plan.id.value}/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)

      resp.status mustBe 200
      (resp.json \ "creation").as[String] mustBe "waiting"

      val respSubs              = httpJsonCallBlocking(
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
      val plan    = "1"

      for (n <- Seq(1, 2, 3)) {
        val resp = httpJsonCallBlocking(
          path = s"/api/apis/${defaultApi.api.id.value}/plan/$plan/team/${teamConsumerId.value}/_subscribe",
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

      val respSubs              = httpJsonCallBlocking(
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
      val plan    = "4" // plan with allow multiple keys set to true

      for (_ <- Seq(1, 2, 3)) {
        val resp = httpJsonCallBlocking(
          path = s"/api/apis/${defaultApi.api.id.value}/plan/$plan/team/${teamConsumerId.value}/_subscribe",
          method = "POST",
          body = Json.obj().some
        )(tenant, session)

        resp.status mustBe 200
        (resp.json \ "creation").as[String] mustBe "done"
      }

      val respSubs              = httpJsonCallBlocking(
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
      val plan    = defaultApi.plans.head
      val resp    = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/plan/${plan.id.value}/team/${teamConsumerId.value}/_subscribe",
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
            visibility = ApiVisibility.PublicWithAuthorizations
          )
        )
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val plan    = defaultApi.plans.head.id
      val resp    = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/plan/${plan.value}/team/${teamConsumerId.value}/_subscribe",
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
      val plan    = "1"
      val resp    = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/plan/$plan/team/${teamConsumerId.value}/_subscribe",
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
      val respUser    = httpJsonCallBlocking(
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
      val plan    = "1"
      val resp    = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/plan/$plan/team/${teamConsumerId.value}/_subscribe",
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
      val respUser    = httpJsonCallBlocking(
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, userSession)
      respUser.status mustBe 403

      val respCreationUser = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/plan/2/team/${teamConsumerId.value}/_subscribe",
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
        "test"                -> false,
        "test name api"       -> true,
        "TEST NAME API"       -> true,
        "test name api "      -> true,
        "test  name  api"     -> true,
        "test   name api"     -> true,
        "test-name-api"       -> true,
        "test?name-api"       -> true,
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
      val resp    = httpJsonCallBlocking(
        path = s"/api/me/visible-apis/${defaultApi.api.id.value}"
      )(tenant, session)

      resp.status mustBe 401
      (resp.json \ "error")
        .as[String] mustBe "You're not authorized on this api"

      val sessionAdmin = loginWithBlocking(userAdmin, tenant)
      val respAdmin    = httpJsonCallBlocking(
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
      val childSub  = ApiSubscription(
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

      val sessionTest = loginWithBlocking(userAdmin, tenant)

      val respTestApis   = httpJsonCallBlocking(
        s"/api/teams/${teamOwnerId.value}/subscribed-apis"
      )(tenant, sessionTest)
      respTestApis.status mustBe 200
      val resultTestApis = fr.maif.daikoku.domain.json.SeqApiFormat
        .reads(respTestApis.json)

      resultTestApis.get.length mustBe 2
    }

    "have a lifecycle" in {
      // use containerized otoroshi
      // crate api & a subscription (in otoroshi)
      // old free without quotas
      Await.result(waitForDaikokuSetup(), 5.second)
      val parentPlan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        billingDuration = None,
        currency = None,
        customName = "Parent plan",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("parent.dev")),
        defaultUsagePlan = UsagePlanId("parent.dev").some
      )

      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = parentPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token"
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            isPrivate = false,
            aggregationApiKeysSecurity = Some(true),
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer, defaultAdminTeam),
        usagePlans = Seq(parentPlan, adminApiPlan),
        apis = Seq(parentApi, adminApi),
        subscriptions = Seq(parentSub)
      )
      // check if api is published
      val maybeParentApi = Await.result(
        daikokuComponents.env.dataStore.apiRepo
          .forTenant(tenant)
          .findByIdNotDeleted(parentApi.id),
        5.second
      )
      maybeParentApi mustBe defined
      maybeParentApi.get.state mustBe ApiState.Published

      val session = loginWithBlocking(userAdmin, tenant)

      def testApiVisibility(count: Int) = {
        val respAllVisibleApi = httpJsonCallWithoutSessionBlocking(
          path = s"/api/search",
          "POST",
          body = Some(
            Json.obj(
              "variables" -> Json.obj(
                "filterTable" -> Json.stringify(
                  Json.arr(
                    Json.obj(
                      "id"    -> "team",
                      "value" -> Json.arr(teamOwnerId.value)
                    )
                  )
                ),
                "limit"       -> 5,
                "offset"      -> 0
              ),
              "query"     ->
              s"""
                   |query AllVisibleApis ($$filterTable: JsArray, $$limit: Int, $$offset: Int) {
                   |      visibleApis (filterTable: $$filterTable, limit: $$limit, offset: $$offset) {
                   |        apis {
                   |          api {
                   |            _id
                   |            state
                   |          }
                   |        }
                   |        total
                   |        totalFiltered
                   |    }
                   |}
                   |""".stripMargin
            )
          )
        )(tenant)
        respAllVisibleApi.status mustBe 200
        val response          =
          (respAllVisibleApi.json \ "data" \ "visibleApis").as[JsObject]
        (response \ "total").as[Int] mustBe count
        (response \ "apis").as[JsArray].value.length mustBe count
      }

      // api is visible by anyone
      testApiVisibility(1)

      // check base key
      val startingKey = httpJsonCallBlocking(
        path = s"/api/apikeys/${parentSub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)
      (startingKey.json \ "enabled").as[Boolean] mustBe true
      (startingKey.json \ "metadata").as[JsObject].keys.size mustBe 0

      // manipulate subscription as admin
      // - update plan metadata & check if metadata is in otoroshi
      httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/subscriptions/${parentSub.id.value}",
        method = "PUT",
        body = Json
          .obj(
            "customMetadata" -> Json.obj("foo" -> "bar")
          )
          .some
      )(tenant, session)
      // - archiveKeyByOwner --> key is disable in oto
      httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/subscriptions/${parentSub.id.value}/_archiveByOwner?enabled=false",
        method = "PUT"
      )(tenant, session)
      // test in oto
      val update1 = httpJsonCallBlocking(
        path = s"/api/apikeys/${parentSub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)
      (update1.json \ "enabled").as[Boolean] mustBe false
      (update1.json \ "metadata")
        .as[JsObject]
        .keys
        .filterNot(_.startsWith("daikoku_"))
        .filterNot(_.startsWith("updated_at"))
        .size mustBe 1

      // update api as blocked
      httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${parentApi.id.value}/${parentApi.currentVersion.value}",
        method = "PUT",
        body = parentApi.copy(state = ApiState.Blocked).asJson.some
      )(tenant, session)

      val maybeParentApiUpdated = Await.result(
        daikokuComponents.env.dataStore.apiRepo
          .forTenant(tenant)
          .findByIdNotDeleted(parentApi.id),
        5.second
      )
      maybeParentApiUpdated mustBe defined
      maybeParentApiUpdated.get.state mustBe ApiState.Blocked

      // api is not visible by anyone
      testApiVisibility(0)

      // - update plan metadata & check if metadata is in otoroshi
      httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/subscriptions/${parentSub.id.value}",
        method = "PUT",
        body = Json
          .obj(
            "customMetadata" -> Json.obj("foo" -> "bar", "foofoo" -> "barbar")
          )
          .some
      )(tenant, session)
      // - archiveKeyByOwner --> key is disable in oto
      httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/subscriptions/${parentSub.id.value}/_archiveByOwner?enabled=true",
        method = "PUT"
      )(tenant, session)
      // - archiveKeyByOwner --> key is disable in oto
      val update2 = httpJsonCallBlocking(
        path = s"/api/apikeys/${parentSub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)
      (update2.json \ "enabled").as[Boolean] mustBe true
      (update2.json \ "metadata")
        .as[JsObject]
        .keys
        .filterNot(_.startsWith("daikoku_"))
        .filterNot(_.startsWith("updated_at"))
        .size mustBe 2
    }
  }

  "a private plan" must {
    "be subscribed by the owner team" in {
      val plan = UsagePlan(
        id = UsagePlanId(IdGenerator.token),
        tenant = tenant.id,
        costPerMonth = BigDecimal(10.0).some,
        costPerRequest = BigDecimal(0.02).some,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month).some,
        trialPeriod = None,
        currency = Currency("EUR").some,
        customName = "PayPerUse",
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
      val resp    = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/plan/${plan.id.value}/team/${teamOwnerId.value}/_subscribe",
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
      val plan = UsagePlan(
        id = UsagePlanId(IdGenerator.token),
        tenant = tenant.id,
        costPerMonth = BigDecimal(10.0).some,
        costPerRequest = BigDecimal(0.02).some,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month).some,
        trialPeriod = None,
        currency = Currency("EUR").some,
        customName = "PayPerUse",
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
      val resp    = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/plan/${plan.id.value}/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)

      resp.status mustBe 401
    }

    "adds all teams subscribed in authorized team after inverting visibility" in {
      val plan         = UsagePlan(
        id = UsagePlanId(IdGenerator.token),
        tenant = tenant.id,
        costPerMonth = BigDecimal(10.0).some,
        costPerRequest = BigDecimal(0.02).some,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month).some,
        trialPeriod = None,
        currency = Currency("EUR").some,
        customName = "PayPerUse",
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
        fr.maif.daikoku.domain.json.UsagePlanFormat.reads(resp.json)
      result.isSuccess mustBe true

      result.get.authorizedTeams.length mustBe 1
    }
  }

  "a deletion of a plan" must {
    "delete all subscriptions" in {
      val plan         = UsagePlan(
        id = UsagePlanId(IdGenerator.token),
        tenant = tenant.id,
        costPerMonth = BigDecimal(10.0).some,
        costPerRequest = BigDecimal(0.02).some,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month).some,
        trialPeriod = None,
        currency = Currency("EUR").some,
        customName = "PayPerUse",
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

      val session          = loginWithBlocking(userAdmin, tenant)
      val respGetSubsStart = httpJsonCallBlocking(path =
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, session)
      respGetSubsStart.status mustBe 200
      val resultStart =
        fr.maif.daikoku.domain.json.SeqApiSubscriptionFormat
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
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, session)
      respGetSubs.status mustBe 200
      val result = fr.maif.daikoku.domain.json.SeqApiSubscriptionFormat
        .reads(respGetSubs.json)
      result.isSuccess mustBe true
      result.get.length mustBe 0
    }
  }

  "a deletion of a api" must {
    "delete all subscriptions" in {
      val plan         = UsagePlan(
        id = UsagePlanId(IdGenerator.token),
        tenant = tenant.id,
        costPerMonth = BigDecimal(10.0).some,
        costPerRequest = BigDecimal(0.02).some,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month).some,
        trialPeriod = None,
        currency = Currency("EUR").some,
        customName = "PayPerUse",
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

      val session          = loginWithBlocking(userAdmin, tenant)
      val respGetSubsStart = httpJsonCallBlocking(path =
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, session)
      respGetSubsStart.status mustBe 200
      val resultStart =
        fr.maif.daikoku.domain.json.SeqApiSubscriptionFormat
          .reads(respGetSubsStart.json)
      resultStart.isSuccess mustBe true
      resultStart.get.length mustBe 1

      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}",
        method = "DELETE",
        body = Json.obj().some
      )(tenant, session)
      resp.status mustBe 200

      val respGetSubs = httpJsonCallBlocking(path =
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, session)
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
          defaultApi.api.copy(
            id = ApiId("123"),
            supportedVersions = Set(Version("1.0.0")),
            currentVersion = Version("1.0.0"),
            isDefault = false,
            parent = None
          ),
          defaultApi.api.copy(
            id = ApiId("345"),
            supportedVersions = Set(Version("2.0.0")),
            currentVersion = Version("2.0.0"),
            isDefault = false,
            parent = Some(ApiId("123"))
          ),
          defaultApi.api.copy(
            id = ApiId("678"),
            supportedVersions = Set(Version("3.0.0")),
            currentVersion = Version("3.0.0"),
            isDefault = true,
            parent = Some(ApiId("123"))
          )
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
        method = "DELETE",
        body = Json.obj().some
      )(tenant, session)

      respDelete.status mustBe 200

      val respVersionsAfter = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/123/versions"
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
        path = s"/api/apis/${adminApi.id.value}/plan/admin/team/${teamConsumerId.value}/_subscribe",
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
        path = s"/api/apis/${adminApi.id.value}/plan/admin/team/${defaultAdminTeam.id.value}/_subscribe",
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
      val resp    = httpJsonCallBlocking(
        path = s"/api/teams/${defaultAdminTeam.id.value}/apis/${adminApi.id.value}",
        method = "DELETE",
        body = Json.obj().some
      )(tenant, session)
      resp.status mustBe 403
    }

    "not be updated except otoroshi target of admin plan" in {

      val updatedAdminPlan = adminApiPlan
        .copy(
          customName = "test",
          customDescription = Some("test"),
          otoroshiTarget = Some(
            OtoroshiTarget(
              otoroshiSettings = containerizedOtoroshi,
              authorizedEntities = Some(
                AuthorizedEntities(
                  groups = Set(OtoroshiServiceGroupId(serviceGroupAdmin))
                )
              )
            )
          )
        )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam),
        usagePlans = Seq(adminApiPlan),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp    = httpJsonCallBlocking(
        path =
          s"/api/teams/${defaultAdminTeam.id.value}/apis/${adminApi.id.value}/${adminApi.currentVersion.value}/plan/${adminApiPlan.id.value}",
        method = "PUT",
        body = Some(updatedAdminPlan.asJson)
      )(tenant, session)

      resp.status mustBe 200
      val result =
        fr.maif.daikoku.domain.json.UsagePlanFormat.reads(resp.json)
      result.isSuccess mustBe true

      val adminPlan = result.get

      adminPlan.customName mustBe adminApiPlan.customName
      adminPlan.customDescription mustBe adminApiPlan.customDescription
      adminPlan.otoroshiTarget.isDefined mustBe true
      adminPlan.otoroshiTarget.get.otoroshiSettings mustBe containerizedOtoroshi
      adminPlan.otoroshiTarget.get.authorizedEntities.value.groups must contain(
        OtoroshiServiceGroupId(serviceGroupAdmin)
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

      val userSession  = loginWithBlocking(user, tenant)
      val adminSession = loginWithBlocking(userAdmin, tenant)

      // test access denied
      val respApiDenied = httpJsonCallBlocking(
        s"/api/me/visible-apis/${defaultApi.api.id.value}"
      )(tenant, userSession)
      respApiDenied.status mustBe 401

      // ask access
      val resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/access",
        method = "POST",
        body = Some(Json.obj("teams" -> Json.arr(teamConsumerId.asJson)))
      )(tenant, userSession)
      resp.status mustBe 200

      // get notifications for teamOwner and accept it
      val respNotif             =
        getOwnNotificationsCallBlocking(Json.obj())(tenant, adminSession)
      respNotif.status mustBe 200
      (respNotif.json \ "data" \ "myNotifications" \ "totalFiltered")
        .as[Long] mustBe 1
      //      val eventualNotifications = json.SeqNotificationFormat.reads(
      //        (respNotif.json \ "notifications").as[JsArray]
      //      )
      //      eventualNotifications.isSuccess mustBe true
      val notifications =
        (respNotif.json \ "data" \ "myNotifications" \ "notifications")
          .as[JsArray]
      val notifId               =
        (notifications.value.head \ "_id").as(json.NotificationIdFormat)

      val respAccept = httpJsonCallBlocking(
        path = s"/api/notifications/${notifId.value}/accept",
        method = "PUT",
        body = Some(Json.obj())
      )(tenant, adminSession)
      resp.status mustBe 200

      // test access ok
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
        teams = Seq(
          teamOwner,
          teamConsumer.copy(
            users = Set(
              UserWithPermission(
                userId = user.id,
                teamPermission = TeamPermission.Administrator
              )
            )
          )
        ),
        apis = Seq(defaultApi.api)
      )

      val userSession = loginWithBlocking(user, tenant)
      val issue       = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId}/apis/${defaultApi.api.humanReadableId}/issues",
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
              )
            ),
            lastModificationAt = DateTime.now(),
            apiVersion = defaultApi.api.currentVersion.value.some
          ).asJson
        )
      )(tenant, userSession)
      Json.prettyPrint(issue.json)
      issue.status mustBe 404

    }
    "can retrieve all same issues list from any api versions" in {
      val issuesTags = Set(
        ApiIssueTag(ApiIssueTagId("foo"), "foo", "foo"),
        ApiIssueTag(ApiIssueTagId("bar"), "bar", "bar")
      )
      val rootApi    = defaultApi.api.copy(
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

      val session         = loginWithBlocking(userApiEditor, tenant)
      val issuesOfRootApi = httpJsonCallBlocking(
        path = s"/api/apis/${rootApi.humanReadableId}/issues"
      )(tenant, session)
      val issuesOfFooApi  = httpJsonCallBlocking(
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
      val payPerUsePlanId  = UsagePlanId("5")
      val subId            = ApiSubscriptionId("test")
      val sub              = ApiSubscription(
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
      val sessionAdmin     = loginWithBlocking(userAdmin, tenant)
      val sessionApiEditor = loginWithBlocking(userApiEditor, tenant)
      val sessionUser      = loginWithBlocking(user, tenant)

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
            body = Some(teamConsumer.copy(apiKeyVisibility = maybeVisibility).asJson)
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
      val payPerUsePlanId  = UsagePlanId("5")
      val subId            = ApiSubscriptionId("test")
      val sub              = ApiSubscription(
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
      val sessionAdmin     = loginWithBlocking(userAdmin, tenant)
      val sessionApiEditor = loginWithBlocking(userApiEditor, tenant)
      val sessionUser      = loginWithBlocking(user, tenant)

      val callPerSec     = 100L
      val callPerDay     = 1000L
      val callPerMonth   = 2000L
      val plan           = defaultApi.plans.find(_.id == sub.plan).get
      val otoroshiTarget = plan.otoroshiTarget
      val otoApiKey      = ActualOtoroshiApiKey(
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

      val path = otoroshiUpdateApikeyPath(sub.apiKey.clientId)

      val apiKeyPath = otoroshiGetApikeyPath(otoApiKey.clientId)

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
            body = Some(teamConsumer.copy(apiKeyVisibility = maybeVisibility).asJson)
          )(tenant, sessionAdmin)
        }
        resp.status mustBe 200

        matrix.foreachEntry((session, response) => {
          val resp = httpJsonCallBlocking(
            path = s"/api/teams/${teamConsumerId.value}/subscriptions/${sub.id.value}/_rotation",
            method = "POST",
            body = Some(
              Json.obj(
                "enabled"       -> true,
                "rotationEvery" -> 24,
                "gracePeriod"   -> 12
              )
            )
          )(tenant, session)
          resp.status mustBe response
        })
      })
    }
    "restrict custom name update setup for a subscription" in {
      val payPerUsePlanId  = UsagePlanId("5")
      val subId            = ApiSubscriptionId("test")
      val sub              = ApiSubscription(
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
      val sessionAdmin     = loginWithBlocking(userAdmin, tenant)
      val sessionApiEditor = loginWithBlocking(userApiEditor, tenant)
      val sessionUser      = loginWithBlocking(user, tenant)

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
            body = Some(teamConsumer.copy(apiKeyVisibility = maybeVisibility).asJson)
          )(tenant, sessionAdmin)
        }
        resp.status mustBe 200

        matrix.foreachEntry((session, response) => {
          val rdmName    = Random.alphanumeric.take(10).mkString
          val respUpdate = httpJsonCallBlocking(
            path = s"/api/teams/${teamConsumerId.value}/subscriptions/${sub.id.value}/name",
            method = "POST",
            body = Some(Json.obj("customName" -> rdmName))
          )(tenant, session)
          respUpdate.status mustBe response

          if (response == 200) {
            val respSubs                    = httpJsonCallBlocking(
              path =
                s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
            )(tenant, session)
            respSubs.status mustBe 200
            val resultAsUpdatedSubscription =
              fr.maif.daikoku.domain.json.ApiSubscriptionFormat
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
      val payPerUsePlanId  = UsagePlanId("5")
      val subId            = ApiSubscriptionId("test")
      val sub              = ApiSubscription(
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
      val sessionAdmin     = loginWithBlocking(userAdmin, tenant)
      val sessionApiEditor = loginWithBlocking(userApiEditor, tenant)
      val sessionUser      = loginWithBlocking(user, tenant)

      val callPerSec     = 100L
      val callPerDay     = 1000L
      val callPerMonth   = 2000L
      val plan           = defaultApi.plans.find(_.id == sub.plan).get
      val otoroshiTarget = plan.otoroshiTarget
      val otoApiKey      = ActualOtoroshiApiKey(
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

      val path = otoroshiUpdateApikeyPath(sub.apiKey.clientId)

      val apiKeyPath = otoroshiGetApikeyPath(otoApiKey.clientId)

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
            body = Some(teamConsumer.copy(apiKeyVisibility = maybeVisibility).asJson)
          )(tenant, sessionAdmin)
        }
        resp.status mustBe 200

        matrix.foreachEntry((session, response) => {
          val rdmName    = Random.alphanumeric.take(10).mkString
          val respUpdate = httpJsonCallBlocking(
            path = s"/api/teams/${teamConsumerId.value}/subscriptions/${sub.id.value}/_refresh",
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

      val resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/plan/4/team/${teamConsumerId.value}/${subId.value}/_extends",
        method = "PUT",
        body = Json.obj().some
      )(tenant, loginWithBlocking(user, tenant))

      resp.status mustBe Status.FORBIDDEN
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
      val childSub  = ApiSubscription(
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

      val updatedPlans = defaultApi.plans
        .map(_.copy(aggregationApiKeysSecurity = Some(true)))

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
      val parentSubId          = ApiSubscriptionId("parent")
      val parentApiKeyClientId = "clientId"

      val copiedPlan = UsagePlan(
        UsagePlanId(IdGenerator.token),
        tenant = tenant.id,
        maxPerSecond = 10000L.some,
        maxPerDay = 10000L.some,
        maxPerMonth = 10000L.some,
        costPerRequest = BigDecimal(0.015).some,
        costPerMonth = BigDecimal(10.0).some,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month).some,
        trialPeriod = None,
        currency = Currency("EUR").some,
        customName = "QuotasWithoutLimits",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))
            )
          )
        ),
        allowMultipleKeys = Some(true),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val copiedApi  = defaultApi.api.copy(
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
        path = s"/api/apis/test/plan/${copiedPlan.id.value}/team/${teamConsumerId.value}/${parentSubId.value}/_extends",
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
      val childSub  = ApiSubscription(
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

      val apiKeyPath = otoroshiGetApikeyPath(parentSub.apiKey.clientId)

      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/subscriptions/${parentSub.id.value}/_makeUnique",
        method = "POST"
      )(tenant, loginWithBlocking(user, tenant))

      resp.status mustBe 404
    }
    "be transform in unique api key" in {

      val parentPlan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "parent.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val childPlan = UsagePlan(
        id = UsagePlanId("child.dev"),
        tenant = tenant.id,
        customName = "child.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentPlan.id),
        defaultUsagePlan = parentPlan.id.some
      )
      val childApi  = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childPlan.id),
        defaultUsagePlan = childPlan.id.some
      )

      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test"
      )
      val childSub  = ApiSubscription(
        id = ApiSubscriptionId("test2"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test2",
        parent = Some(parentSub.id)
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(user),
        teams = Seq(teamConsumer, teamOwner),
        usagePlans = Seq(parentPlan, childPlan),
        apis = Seq(parentApi, childApi),
        subscriptions = Seq(parentSub, childSub)
      )

      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/subscriptions/${childSub.id.value}/_makeUnique",
        method = "POST"
      )(tenant, loginWithBlocking(user, tenant))

      resp.status mustBe 200

      // check that parent subscription apikey do not be updated
      val resp2 = httpJsonCallBlocking(
        path =
          s"/api/apis/${parentApi.id.value}/${parentApi.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, loginWithBlocking(user, tenant))

      resp2.status mustBe 200
      val subscriptions = SeqApiSubscriptionFormat.reads(resp2.json)

      subscriptions.get.size mustBe 1

      assert(
        subscriptions.get.head.apiKey.clientId == parentSub.apiKey.clientId
      )
      assert(
        subscriptions.get.head.apiKey.clientSecret == parentSub.apiKey.clientSecret
      )

      // check that child subscription apikey has been created
      val resp3              = httpJsonCallBlocking(
        path =
          s"/api/apis/${childApi.id.value}/${childApi.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, loginWithBlocking(user, tenant))
      resp3.status mustBe 200
      val childSubscriptions = SeqApiSubscriptionFormat.reads(resp3.json)
      childSubscriptions.get.size mustBe 1
      assert(
        childSubscriptions.get.head.apiKey.clientId != childSub.apiKey.clientId
      )
      assert(
        childSubscriptions.get.head.apiKey.clientSecret != childSub.apiKey.clientSecret
      )
    }
    "failed when aggregated apikey has an otoroshi target different than parent" in {
      val parentSubId          = ApiSubscriptionId("parent")
      val parentApiKeyClientId = "clientId"
      setupEnvBlocking(
        tenants = Seq(tenant.copy(aggregationApiKeysSecurity = Some(true))),
        users = Seq(user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans.map {
          case p if !p.isPaymentDefined && p.visibility != UsagePlanVisibility.Admin =>
            p.copy(
              aggregationApiKeysSecurity = Some(true),
              otoroshiTarget = Some(
                OtoroshiTarget(
                  OtoroshiSettingsId("default2"),
                  Some(
                    AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))
                  )
                )
              )
            )
          case p                                                                     =>
            p.copy(aggregationApiKeysSecurity = Some(true))
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
      val planId               = defaultApi.api.possibleUsagePlans.head.value
      val resp                 = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/$planId/team/${teamConsumerId.value}/${parentSubId.value}/_extends",
        method = "PUT",
        body = Json.obj().some
      )(tenant, loginWithBlocking(user, tenant))

      resp.status mustBe Status.CONFLICT
      (resp.json \ "error")
        .as[
          String
        ] mustBe "The subscribed plan has another otoroshi of the parent plan"
    }
    "update aggregated APIkey do not erase authorizedEntities" in {
      val parentPlan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "parent.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlan  = UsagePlan(
        id = UsagePlanId("child.dev"),
        tenant = tenant.id,
        customName = "FreeWithoutQuotas",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("parent.dev")),
        defaultUsagePlan = UsagePlanId("parent.dev").some
      )
      val childApi  = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("child.dev")),
        defaultUsagePlan = UsagePlanId("child.dev").some
      )

      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = parentPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token"
      )
      val childSub  = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "child_token",
        parent = Some(parentSub.id)
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            aggregationApiKeysSecurity = Some(true),
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer, defaultAdminTeam),
        usagePlans = Seq(parentPlan, childPlan, adminApiPlan),
        apis = Seq(parentApi, childApi, adminApi),
        subscriptions = Seq(parentSub, childSub)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp    = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/subscriptions/${parentSub.id.value}",
        method = "PUT",
        body = parentSub
          .copy(
            customMetadata = Json.obj("foo" -> "bar").some
          )
          .asJson
          .some
      )(tenant, session)

      resp.status mustBe 200

      // test otoroshi key
      val respVerif = httpJsonCallBlocking(
        path = s"/api/apikeys/${parentSub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)

      val authorizations = (respVerif.json \ "authorizations").as[JsArray]
      val strings        = authorizations.value.map(value => (value \ "id").as[String])
      strings.size mustBe 2
      strings.contains(childRouteId) mustBe true
      strings.contains(parentRouteId) mustBe true
    }
    "update plan in aggregated APIkey do not erase authorizedEntities" in {
      val parentPlan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "parent.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlan  = UsagePlan(
        id = UsagePlanId("child.dev"),
        tenant = tenant.id,
        customName = "child.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("parent.dev")),
        defaultUsagePlan = UsagePlanId("parent.dev").some
      )
      val childApi  = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("child.dev")),
        defaultUsagePlan = UsagePlanId("child.dev").some
      )

      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = parentPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token"
      )
      val childSub  = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "child_token",
        parent = Some(parentSub.id)
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            aggregationApiKeysSecurity = Some(true),
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer, defaultAdminTeam),
        usagePlans = Seq(parentPlan, childPlan, adminApiPlan),
        apis = Seq(parentApi, childApi, adminApi),
        subscriptions = Seq(parentSub, childSub)
      )

      val session = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${parentApi.id.value}/${parentApi.currentVersion.value}/plan/${parentPlan.id.value}",
        method = "PUT",
        body = parentPlan
          .copy(
            otoroshiTarget = OtoroshiTarget(
              containerizedOtoroshi,
              Some(
                AuthorizedEntities(
                  routes = Set(OtoroshiRouteId(otherRouteId))
                )
              )
            ).some
          )
          .asJson
          .some
      )(tenant, session)

      resp.status mustBe 200

      val respVerif = httpJsonCallBlocking(
        path = s"/api/apikeys/${parentSub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)

      val authorizations = (respVerif.json \ "authorizations").as[JsArray]
      val strings        = authorizations.value.map(value => (value \ "id").as[String])
      strings.size mustBe 2
      strings.contains(otherRouteId) mustBe true
      strings.contains(childRouteId) mustBe true

      httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${childApi.id.value}/${childApi.currentVersion.value}/plan/${childPlan.id.value}",
        method = "PUT",
        body = childPlan
          .copy(
            otoroshiTarget = OtoroshiTarget(
              containerizedOtoroshi,
              Some(
                AuthorizedEntities(
                  routes = Set(
                    OtoroshiRouteId(parentRouteId),
                    OtoroshiRouteId(childRouteId)
                  )
                )
              )
            ).some
          )
          .asJson
          .some
      )(tenant, session)

      val respVerif2 = httpJsonCallBlocking(
        path = s"/api/apikeys/${parentSub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)

      val authorizations2 = (respVerif2.json \ "authorizations").as[JsArray]
      val strings2        =
        authorizations2.value.map(value => (value \ "id").as[String])
      strings2.size mustBe 3
    }
    "be disable entirely by disabling parent subscription" in {
      val parentPlan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "parent.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlan  = UsagePlan(
        id = UsagePlanId("child.dev"),
        tenant = tenant.id,
        customName = "child.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlan2 = UsagePlan(
        id = UsagePlanId("child2.dev"),
        tenant = tenant.id,
        customName = "child2.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(otherRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("parent.dev")),
        defaultUsagePlan = UsagePlanId("parent.dev").some
      )
      val childApi  = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("child.dev")),
        defaultUsagePlan = UsagePlanId("child.dev").some
      )
      val childApi2 = defaultApi.api.copy(
        id = ApiId("child-id-2"),
        name = "child API 2",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("child2.dev")),
        defaultUsagePlan = UsagePlanId("child2.dev").some
      )

      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = parentPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token"
      )
      val childSub  = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "child_token",
        parent = Some(parentSub.id)
      )
      val childSub2 = ApiSubscription(
        id = ApiSubscriptionId("child_sub_2"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = childPlan2.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "child_token",
        parent = Some(parentSub.id)
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            aggregationApiKeysSecurity = Some(true),
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer, defaultAdminTeam),
        usagePlans = Seq(parentPlan, childPlan, childPlan2, adminApiPlan),
        apis = Seq(parentApi, childApi, childApi2, adminApi),
        subscriptions = Seq(parentSub, childSub, childSub2)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      // disable parentSub => allSub are disabled + otokey
      val resp    = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/subscriptions/${parentSub.id.value}/_archive?enabled=false",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 200

      val respVerifDkChild = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/subscription/${childSub.id.value}/informations"
      )(tenant, session)

      respVerifDkChild.status mustBe 200
      (respVerifDkChild.json \ "subscription" \ "enabled")
        .as[Boolean] mustBe false

      val respVerifOtoParent = httpJsonCallBlocking(
        path = s"/api/apikeys/${parentSub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)

      (respVerifOtoParent.json \ "enabled").as[Boolean] mustBe false
    }
    "be disable by part by disabling child subscription" in {
      val parentPlan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "parent.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlan  = UsagePlan(
        id = UsagePlanId("child.dev"),
        tenant = tenant.id,
        customName = "child.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlan2 = UsagePlan(
        id = UsagePlanId("child2.dev"),
        tenant = tenant.id,
        customName = "child2.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(otherRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("parent.dev")),
        defaultUsagePlan = UsagePlanId("parent.dev").some
      )
      val childApi  = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("child.dev")),
        defaultUsagePlan = UsagePlanId("child.dev").some
      )
      val childApi2 = defaultApi.api.copy(
        id = ApiId("child-id-2"),
        name = "child API 2",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("child2.dev")),
        defaultUsagePlan = UsagePlanId("child2.dev").some
      )

      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token"
      )
      val childSub  = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "child_token",
        parent = Some(parentSub.id),
        customMetadata = Json.obj("foo" -> "bar").some
      )
      val childSub2 = ApiSubscription(
        id = ApiSubscriptionId("child_sub_2"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = childPlan2.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "child_token",
        parent = Some(parentSub.id)
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            aggregationApiKeysSecurity = Some(true),
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer, defaultAdminTeam),
        usagePlans = Seq(parentPlan, childPlan, childPlan2, adminApiPlan),
        apis = Seq(parentApi, childApi, childApi2, adminApi),
        subscriptions = Seq(parentSub, childSub, childSub2)
      )

      val session = loginWithBlocking(userAdmin, tenant)

      val respPreVerifOtoParent = httpJsonCallBlocking(
        path = s"/api/apikeys/${parentSub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)

      (respPreVerifOtoParent.json \ "enabled").as[Boolean] mustBe true
      val preMetadata           = (respPreVerifOtoParent.json \ "metadata").as[JsObject]
      val preKeys               = preMetadata.keys.filter(key => !key.startsWith("daikoku_"))
      preKeys.size mustBe 1
      (preMetadata \ "foo").as[String] mustBe "bar"

      val preAuthorizations =
        (respPreVerifOtoParent.json \ "authorizations").as[JsArray]
      val preStrings        =
        preAuthorizations.value.map(value => (value \ "id").as[String])
      preStrings.size mustBe 3
      preStrings.contains(otherRouteId) mustBe true
      preStrings.contains(childRouteId) mustBe true
      preStrings.contains(parentRouteId) mustBe true

      // disable parentSub => allSub are disabled + otokey
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/subscriptions/${childSub.id.value}/_archive?enable=false",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 200

      val respVerifDkChild = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/subscription/${parentSub.id.value}/informations"
      )(tenant, session)

      respVerifDkChild.status mustBe 200
      (respVerifDkChild.json \ "subscription" \ "enabled")
        .as[Boolean] mustBe true

      val respVerifOtoParent = httpJsonCallBlocking(
        path = s"/api/apikeys/${parentSub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)

      (respVerifOtoParent.json \ "enabled").as[Boolean] mustBe true
      val authorizations     =
        (respVerifOtoParent.json \ "authorizations").as[JsArray]
      val strings            = authorizations.value.map(value => (value \ "id").as[String])
      strings.size mustBe 2
      strings.contains(otherRouteId) mustBe true
      strings.contains(parentRouteId) mustBe true
      val metadata           = (respVerifOtoParent.json \ "metadata").as[JsObject]
      val keys               = metadata.keys
        .filter(key => !key.startsWith("daikoku_"))
        .filter(key => !key.startsWith("updated_at"))
      keys.size mustBe 0
    }

    "be disable entirely by disabling parent subscription by owner" in {
      val parentPlan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "parent.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlan  = UsagePlan(
        id = UsagePlanId("child.dev"),
        tenant = tenant.id,
        customName = "child.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlan2 = UsagePlan(
        id = UsagePlanId("child2.dev"),
        tenant = tenant.id,
        customName = "child2.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(otherRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("parent.dev")),
        defaultUsagePlan = UsagePlanId("parent.dev").some
      )
      val childApi  = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("child.dev")),
        defaultUsagePlan = UsagePlanId("child.dev").some
      )
      val childApi2 = defaultApi.api.copy(
        id = ApiId("child-id-2"),
        name = "child API 2",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("child2.dev")),
        defaultUsagePlan = UsagePlanId("child2.dev").some
      )

      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = parentPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token"
      )
      val childSub  = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "child_token",
        parent = Some(parentSub.id)
      )
      val childSub2 = ApiSubscription(
        id = ApiSubscriptionId("child_sub_2"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = childPlan2.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "child_token",
        parent = Some(parentSub.id)
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            aggregationApiKeysSecurity = Some(true),
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer, defaultAdminTeam),
        usagePlans = Seq(parentPlan, childPlan, childPlan2, adminApiPlan),
        apis = Seq(parentApi, childApi, childApi2, adminApi),
        subscriptions = Seq(parentSub, childSub, childSub2)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      // disable parentSub => allSub are disabled + otokey
      val resp    = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/subscriptions/${parentSub.id.value}/_archiveByOwner?enabled=false",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 200

      val respVerifDkChild = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/subscription/${childSub.id.value}/informations"
      )(tenant, session)

      respVerifDkChild.status mustBe 200
      (respVerifDkChild.json \ "subscription" \ "enabled")
        .as[Boolean] mustBe false

      val respVerifOtoParent = httpJsonCallBlocking(
        path = s"/api/apikeys/${parentSub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)

      (respVerifOtoParent.json \ "enabled").as[Boolean] mustBe false
    }
    "be disable by part by disabling child subscription by owner" in {
      val parentPlan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "parent.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlan  = UsagePlan(
        id = UsagePlanId("child.dev"),
        tenant = tenant.id,
        customName = "child.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlan2 = UsagePlan(
        id = UsagePlanId("child2.dev"),
        tenant = tenant.id,
        customName = "child2.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(otherRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("parent.dev")),
        defaultUsagePlan = UsagePlanId("parent.dev").some
      )
      val childApi  = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("child.dev")),
        defaultUsagePlan = UsagePlanId("child.dev").some
      )
      val childApi2 = defaultApi.api.copy(
        id = ApiId("child-id-2"),
        name = "child API 2",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("child2.dev")),
        defaultUsagePlan = UsagePlanId("child2.dev").some
      )

      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token"
      )
      val childSub  = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "child_token",
        parent = Some(parentSub.id),
        customMetadata = Json.obj("foo" -> "bar").some
      )
      val childSub2 = ApiSubscription(
        id = ApiSubscriptionId("child_sub_2"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = childPlan2.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "child_token",
        parent = Some(parentSub.id)
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            aggregationApiKeysSecurity = Some(true),
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer, defaultAdminTeam),
        usagePlans = Seq(parentPlan, childPlan, childPlan2, adminApiPlan),
        apis = Seq(parentApi, childApi, childApi2, adminApi),
        subscriptions = Seq(parentSub, childSub, childSub2)
      )

      val session = loginWithBlocking(userAdmin, tenant)

      val respPreVerifOtoParent = httpJsonCallBlocking(
        path = s"/api/apikeys/${parentSub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)

      (respPreVerifOtoParent.json \ "enabled").as[Boolean] mustBe true
      val preMetadata           = (respPreVerifOtoParent.json \ "metadata").as[JsObject]
      val preKeys               = preMetadata.keys.filter(key => !key.startsWith("daikoku_"))
      preKeys.size mustBe 1
      (preMetadata \ "foo").as[String] mustBe "bar"

      val preAuthorizations =
        (respPreVerifOtoParent.json \ "authorizations").as[JsArray]
      val preStrings        =
        preAuthorizations.value.map(value => (value \ "id").as[String])
      preStrings.size mustBe 3
      preStrings.contains(otherRouteId) mustBe true
      preStrings.contains(childRouteId) mustBe true
      preStrings.contains(parentRouteId) mustBe true

      // disable parentSub => allSub are disabled + otokey
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/subscriptions/${childSub.id.value}/_archiveByOwner?enable=false",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 200

      val respVerifDkChild = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/subscription/${parentSub.id.value}/informations"
      )(tenant, session)

      respVerifDkChild.status mustBe 200
      (respVerifDkChild.json \ "subscription" \ "enabled")
        .as[Boolean] mustBe true

      val respVerifOtoParent = httpJsonCallBlocking(
        path = s"/apis/apim.otoroshi.io/v1/apikeys/${parentSub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)

      (respVerifOtoParent.json \ "enabled").as[Boolean] mustBe true
      val authorizations     =
        (respVerifOtoParent.json \ "authorizations").as[JsArray]
      val strings            = authorizations.value.map(value => (value \ "id").as[String])
      strings.size mustBe 2
      strings.contains(otherRouteId) mustBe true
      strings.contains(parentRouteId) mustBe true
      val metadata           = (respVerifOtoParent.json \ "metadata").as[JsObject]
      val keys               = metadata.keys
        .filter(key => !key.startsWith("daikoku_"))
        .filter(key => !key.startsWith("updated_at"))
      keys.size mustBe 0
    }

    "be deleted entirely by deleting the parent sub" in {
      val parentPlan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "parent.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlan  = UsagePlan(
        id = UsagePlanId("child.dev"),
        tenant = tenant.id,
        customName = "child.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlan2 = UsagePlan(
        id = UsagePlanId("child2.dev"),
        tenant = tenant.id,
        customName = "child2.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(otherRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("parent.dev")),
        defaultUsagePlan = UsagePlanId("parent.dev").some
      )
      val childApi  = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("child.dev")),
        defaultUsagePlan = UsagePlanId("child.dev").some
      )
      val childApi2 = defaultApi.api.copy(
        id = ApiId("child-id-2"),
        name = "child API 2",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("child2.dev")),
        defaultUsagePlan = UsagePlanId("child2.dev").some
      )

      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token"
      )
      val childSub  = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "child_token",
        parent = Some(parentSub.id),
        customMetadata = Json.obj("foo" -> "bar").some
      )
      val childSub2 = ApiSubscription(
        id = ApiSubscriptionId("child_sub_2"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = childPlan2.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi2.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "child_token",
        parent = Some(parentSub.id)
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            aggregationApiKeysSecurity = Some(true),
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer, defaultAdminTeam),
        usagePlans = Seq(parentPlan, childPlan, childPlan2, adminApiPlan),
        apis = Seq(parentApi, childApi, childApi2, adminApi),
        subscriptions = Seq(parentSub, childSub, childSub2)
      )

      val session = loginWithBlocking(userAdmin, tenant)

      val respPreVerifOtoParent = httpJsonCallBlocking(
        path = s"/api/apikeys/${parentSub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)

      (respPreVerifOtoParent.json \ "enabled").as[Boolean] mustBe true
      val preMetadata           = (respPreVerifOtoParent.json \ "metadata").as[JsObject]
      val preKeys               = preMetadata.keys.filter(key => !key.startsWith("daikoku_"))
      preKeys.size mustBe 1
      (preMetadata \ "foo").as[String] mustBe "bar"

      val preAuthorizations =
        (respPreVerifOtoParent.json \ "authorizations").as[JsArray]
      val preStrings        =
        preAuthorizations.value.map(value => (value \ "id").as[String])
      preStrings.size mustBe 3
      preStrings.contains(otherRouteId) mustBe true
      preStrings.contains(childRouteId) mustBe true
      preStrings.contains(parentRouteId) mustBe true

      // delete parentSub => allSub are deleted + otokey
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/subscriptions/${parentSub.id.value}?action=delete",
        method = "DELETE"
      )(tenant, session)
      resp.status mustBe 200

      val respVerifDkParent = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/subscription/${parentSub.id.value}/informations"
      )(tenant, session)

      respVerifDkParent.status mustBe 404

      val respVerifDkChild = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/subscription/${childSub.id.value}/informations"
      )(tenant, session)

      respVerifDkChild.status mustBe 404

      val respVerifOtoParent = httpJsonCallBlocking(
        path = s"/api/apikeys/${parentSub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)

      respVerifOtoParent.status mustBe 404
    }
    "be kept in part by deleting the parent sub (first child become parent)" in {
      val parentPlan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "parent.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlan  = UsagePlan(
        id = UsagePlanId("child.dev"),
        tenant = tenant.id,
        customName = "child.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlan2 = UsagePlan(
        id = UsagePlanId("child2.dev"),
        tenant = tenant.id,
        customName = "child2.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(otherRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("parent.dev")),
        defaultUsagePlan = UsagePlanId("parent.dev").some
      )
      val childApi  = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("child.dev")),
        defaultUsagePlan = UsagePlanId("child.dev").some
      )
      val childApi2 = defaultApi.api.copy(
        id = ApiId("child-id-2"),
        name = "child API 2",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("child2.dev")),
        defaultUsagePlan = UsagePlanId("child2.dev").some
      )

      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token",
        customMetadata = Json.obj("parent-foo" -> "parent-bar").some
      )
      val childSub  = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "child_token",
        parent = Some(parentSub.id),
        customMetadata = Json.obj("foo" -> "bar").some
      )
      val childSub2 = ApiSubscription(
        id = ApiSubscriptionId("child_sub_2"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = childPlan2.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi2.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "child_token",
        parent = Some(parentSub.id)
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            aggregationApiKeysSecurity = Some(true),
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer, defaultAdminTeam),
        usagePlans = Seq(parentPlan, childPlan, childPlan2, adminApiPlan),
        apis = Seq(parentApi, childApi, childApi2, adminApi),
        subscriptions = Seq(parentSub, childSub, childSub2)
      )

      val session = loginWithBlocking(userAdmin, tenant)

      httpJsonCallBlocking(
        path = s"/api/apikeys/${parentSub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080),
        method = "PATCH",
        body = Json
          .arr(
            Json.obj(
              "op"    -> "replace",
              "path"  -> "/metadata/daikoku__metadata",
              "value" -> "| foo | parent-foo"
            ),
            Json.obj(
              "op"    -> "add",
              "path"  -> "/metadata/parent-foo",
              "value" -> "parent-bar"
            )
          )
          .some
      )(tenant, session)

      val respPreVerifOtoParent = httpJsonCallBlocking(
        path = s"/api/apikeys/${parentSub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)

      (respPreVerifOtoParent.json \ "enabled").as[Boolean] mustBe true
      val preMetadata           = (respPreVerifOtoParent.json \ "metadata").as[JsObject]
      val preKeys               = preMetadata.keys.filter(key => !key.startsWith("daikoku_"))
      // todo: c'est la merde le json init d'oto n'a que foo en metaddata...oopsi doopsi
      preKeys.size mustBe 2
      (preMetadata \ "foo").as[String] mustBe "bar"
      (preMetadata \ "parent-foo").as[String] mustBe "parent-bar"

      val preAuthorizations =
        (respPreVerifOtoParent.json \ "authorizations").as[JsArray]
      val preStrings        =
        preAuthorizations.value.map(value => (value \ "id").as[String])
      preStrings.size mustBe 3
      preStrings.contains(otherRouteId) mustBe true
      preStrings.contains(childRouteId) mustBe true
      preStrings.contains(parentRouteId) mustBe true

      // delete parentSub => first child become parent
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/subscriptions/${parentSub.id.value}?action=promotion&childId=${childSub2.id.value}",
        method = "DELETE"
      )(tenant, session)
      resp.status mustBe 200

      val respVerifDkParent = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/subscription/${parentSub.id.value}/informations"
      )(tenant, session)

      respVerifDkParent.status mustBe 404
      val respVerifDkChild = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/subscription/${childSub.id.value}/informations"
      )(tenant, session)

      respVerifDkChild.status mustBe 200

      val respVerifOto   = httpJsonCallBlocking(
        path = s"/api/apikeys/${parentSub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)

      (respVerifOto.json \ "enabled").as[Boolean] mustBe true
      val authorizations = (respVerifOto.json \ "authorizations").as[JsArray]
      val strings        = authorizations.value.map(value => (value \ "id").as[String])
      strings.size mustBe 2
      strings.contains(otherRouteId) mustBe true
      strings.contains(childRouteId) mustBe true
      strings.contains(parentRouteId) mustBe false
      val metadata       = (respVerifOto.json \ "metadata").as[JsObject]
      val keys           = metadata.keys
        .filter(key => !key.startsWith("daikoku_"))
        .filter(key => !key.startsWith("updated_at"))
      keys.size mustBe 1
      (preMetadata \ "foo").as[String] mustBe "bar"
    }
    "be exploded in parts by deleting the parent sub" in {
      val parentPlan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "parent.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlan  = UsagePlan(
        id = UsagePlanId("child.dev"),
        tenant = tenant.id,
        customName = "child.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlan2 = UsagePlan(
        id = UsagePlanId("child2.dev"),
        tenant = tenant.id,
        customName = "child2.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(otherRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("parent.dev")),
        defaultUsagePlan = UsagePlanId("parent.dev").some
      )
      val childApi  = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("child.dev")),
        defaultUsagePlan = UsagePlanId("child.dev").some
      )
      val childApi2 = defaultApi.api.copy(
        id = ApiId("child-id-2"),
        name = "child API 2",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("child2.dev")),
        defaultUsagePlan = UsagePlanId("child2.dev").some
      )

      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token"
      )
      val childSub  = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "child_token",
        parent = Some(parentSub.id),
        customMetadata = Json.obj("foo" -> "bar").some
      )
      val childSub2 = ApiSubscription(
        id = ApiSubscriptionId("child_sub_2"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = childPlan2.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi2.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "child_token",
        parent = Some(parentSub.id),
        customMetadata = Json.obj("foo2" -> "bar2").some
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            aggregationApiKeysSecurity = Some(true),
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer, defaultAdminTeam),
        usagePlans = Seq(parentPlan, childPlan, childPlan2, adminApiPlan),
        apis = Seq(parentApi, childApi, childApi2, adminApi),
        subscriptions = Seq(parentSub, childSub, childSub2)
      )

      val session = loginWithBlocking(userAdmin, tenant)

      httpJsonCallBlocking(
        path = s"/api/apikeys/${parentSub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080),
        method = "PATCH",
        body = Json
          .arr(
            Json.obj(
              "op"      -> "replace",
              "path"    -> "/metadata/daikoku__metadata",
              "value"   -> "| foo | foo2"
            ),
            Json
              .obj("op" -> "add", "path" -> "/metadata/foo2", "value" -> "bar2")
          )
          .some
      )(tenant, session)

      val respPreVerifOtoParent = httpJsonCallBlocking(
        path = s"/api/apikeys/${parentSub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)

      (respPreVerifOtoParent.json \ "enabled").as[Boolean] mustBe true
      val preMetadata           = (respPreVerifOtoParent.json \ "metadata").as[JsObject]
      val preKeys               = preMetadata.keys.filter(key => !key.startsWith("daikoku_"))
      preKeys.size mustBe 2
      (preMetadata \ "foo").as[String] mustBe "bar"
      (preMetadata \ "foo2").as[String] mustBe "bar2"

      val preAuthorizations =
        (respPreVerifOtoParent.json \ "authorizations").as[JsArray]
      val preStrings        =
        preAuthorizations.value.map(value => (value \ "id").as[String])
      preStrings.size mustBe 3
      preStrings.contains(otherRouteId) mustBe true
      preStrings.contains(childRouteId) mustBe true
      preStrings.contains(parentRouteId) mustBe true

      // disable parentSub => allSub are disabled + otokey
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/subscriptions/${parentSub.id.value}?action=extraction",
        method = "DELETE"
      )(tenant, session)
      resp.status mustBe 200

      val respVerifDkParent = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/subscription/${parentSub.id.value}/informations"
      )(tenant, session)
      respVerifDkParent.status mustBe 404

      val respVerifDkChild = httpJsonCallBlocking(
        path =
          s"/api/apis/${childApi.id.value}/${childApi.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, session)

      respVerifDkChild.status mustBe 200
      val newChildClientId =
        (respVerifDkChild.json.as[JsArray].value.head \ "apiKey" \ "clientId")
          .as[String]

      val respVerifDkChild2 = httpJsonCallBlocking(
        path =
          s"/api/apis/${childApi2.id.value}/${childApi2.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(tenant, session)
      respVerifDkChild2.status mustBe 200
      val newChildClientId2 =
        (respVerifDkChild2.json.as[JsArray].value.head \ "apiKey" \ "clientId")
          .as[String]

      val respVerifOtoParent = httpJsonCallBlocking(
        path = s"/api/apikeys/${parentSub.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)
      respVerifOtoParent.status mustBe 404

      val respVerifOtoChild = httpJsonCallBlocking(
        path = s"/api/apikeys/${newChildClientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)
      respVerifOtoChild.status mustBe 200
      (respVerifOtoChild.json \ "enabled").as[Boolean] mustBe true
      val authorizations    =
        (respVerifOtoChild.json \ "authorizations").as[JsArray]
      val strings           = authorizations.value.map(value => (value \ "id").as[String])
      strings.size mustBe 1
      strings.contains(childRouteId) mustBe true
      val metadata          = (respVerifOtoChild.json \ "metadata").as[JsObject]
      val keys              = metadata.keys
        .filter(key => !key.startsWith("daikoku_"))
        .filter(key => !key.startsWith("updated_at"))
        .filter(key => !key.startsWith("created_at"))
        .filter(key => key != "raw_custom_metadata")
      keys.size mustBe 1
      keys.contains("foo") mustBe true

      val respVerifOtoChild2 = httpJsonCallBlocking(
        path = s"/api/apikeys/$newChildClientId2",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host"                   -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)
      respVerifOtoChild2.status mustBe 200
      (respVerifOtoChild2.json \ "enabled").as[Boolean] mustBe true
      val authorizations2    =
        (respVerifOtoChild2.json \ "authorizations").as[JsArray]
      val strings2           =
        authorizations2.value.map(value => (value \ "id").as[String])
      strings2.size mustBe 1
      strings2.contains(otherRouteId) mustBe true
      val metadata2          = (respVerifOtoChild2.json \ "metadata").as[JsObject]
      val keys2              = metadata2.keys
        .filter(key => !key.startsWith("daikoku_"))
        .filter(key => key != "raw_custom_metadata")
        .filter(key => key != "updated_at")
        .filter(key => key != "created_at")
      keys2.size mustBe 1
      keys2.contains("foo2") mustBe true
    }

    "be controlled by a security tenant in environment mode" in {
      val parentPlanProd = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = envModeProd,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlanProd  = UsagePlan(
        id = UsagePlanId("child.dev"),
        tenant = tenant.id,
        customName = envModeProd,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val childPlanDev   = UsagePlan(
        id = UsagePlanId("child2.dev"),
        tenant = tenant.id,
        customName = envModeDev,
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(otherRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentPlanProd.id),
        defaultUsagePlan = parentPlanProd.id.some
      )
      val childApi  = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childPlanDev.id, childPlanProd.id),
        defaultUsagePlan = childPlanDev.id.some
      )

      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        apiKey = parentApiKeyWith2childs,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        rotation = None,
        integrationToken = "parent_token"
      )

      setupEnvBlocking(
        tenants = Seq(
          tenantEnvMode.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            ),
            environmentAggregationApiKeysSecurity = Some(true),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(user, userAdmin),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(parentApi, childApi),
        usagePlans = Seq(parentPlanProd, childPlanProd, childPlanDev),
        subscriptions = Seq(parentSub)
      )

      val consumerSession = loginWithBlocking(userAdmin, tenant)

      // test extend parent prod sub with child dev ==> KO
      val respDev = httpJsonCallBlocking(
        path =
          s"/api/apis/${childApi.id.value}/plan/${childPlanDev.id.value}/team/${teamConsumerId.value}/${parentSub.id.value}/_extends",
        method = "PUT",
        body = Json.obj().some
      )(tenant, consumerSession)
      respDev.status mustBe 403

      // test extend parent prod sub with child prod ==> OK
      val respProd = httpJsonCallBlocking(
        path =
          s"/api/apis/${childApi.id.value}/plan/${childPlanProd.id.value}/team/${teamConsumerId.value}/${parentSub.id.value}/_extends",
        method = "PUT",
        body = Json.obj().some
      )(tenant, consumerSession)
      respProd.status mustBe 200

      // disabled security
      setupEnvBlocking(
        tenants = Seq(
          tenantEnvMode.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            ),
            environmentAggregationApiKeysSecurity = Some(false),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(user, userAdmin),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(parentApi, childApi),
        usagePlans = Seq(parentPlanProd, childPlanProd, childPlanDev),
        subscriptions = Seq(parentSub)
      )

      // test extend parent prod sub with child dev ==> KO
      val consumerSession2 = loginWithBlocking(userAdmin, tenant)
      val respDev2         = httpJsonCallBlocking(
        path =
          s"/api/apis/${childApi.id.value}/plan/${childPlanDev.id.value}/team/${teamConsumerId.value}/${parentSub.id.value}/_extends",
        method = "PUT",
        body = Json.obj().some
      )(tenant, consumerSession2)
      respDev2.status mustBe 200

      // test extend parent prod sub with child prod ==> OK
      val respProd2 = httpJsonCallBlocking(
        path =
          s"/api/apis/${childApi.id.value}/plan/${childPlanProd.id.value}/team/${teamConsumerId.value}/${parentSub.id.value}/_extends",
        method = "PUT",
        body = Json.obj().some
      )(tenant, consumerSession2)
      respProd2.status mustBe 200

      setupEnvBlocking(
        tenants = Seq(
          tenantEnvMode.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            ),
            environmentAggregationApiKeysSecurity = None,
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(user, userAdmin),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(parentApi, childApi),
        usagePlans = Seq(parentPlanProd, childPlanProd, childPlanDev),
        subscriptions = Seq(parentSub)
      )

      val consumerSession3 = loginWithBlocking(userAdmin, tenant)
      // test extend parent prod sub with child dev ==> KO
      val respDev3         = httpJsonCallBlocking(
        path =
          s"/api/apis/${childApi.id.value}/plan/${childPlanDev.id.value}/team/${teamConsumerId.value}/${parentSub.id.value}/_extends",
        method = "PUT",
        body = Json.obj().some
      )(tenant, consumerSession3)
      respDev3.status mustBe 200

      // test extend parent prod sub with child prod ==> OK
      val respProd3 = httpJsonCallBlocking(
        path =
          s"/api/apis/${childApi.id.value}/plan/${childPlanProd.id.value}/team/${teamConsumerId.value}/${parentSub.id.value}/_extends",
        method = "PUT",
        body = Json.obj().some
      )(tenant, consumerSession3)
      respProd3.status mustBe 200

    }
  }
}
