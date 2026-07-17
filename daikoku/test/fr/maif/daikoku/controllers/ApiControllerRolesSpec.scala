package fr.maif.daikoku.controllers

import cats.implicits.catsSyntaxOptionId
import com.dimafeng.testcontainers.GenericContainer.FileSystemBind
import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.controllers.AppError.SubscriptionAggregationDisabled
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.domain.NotificationAction.{
  ApiAccess,
  ApiSubscriptionDemand
}
import fr.maif.daikoku.domain.NotificationType.AcceptOrReject
import fr.maif.daikoku.domain.TeamPermission.Administrator
import fr.maif.daikoku.domain.UsagePlanVisibility.{Private, Public}
import fr.maif.daikoku.domain.json.{ApiFormat, SeqApiSubscriptionFormat}
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import fr.maif.daikoku.utils.IdGenerator
import fr.maif.daikoku.utils.LoggerImplicits.BetterLogger
import org.awaitility.scala.AwaitilitySupport
import org.joda.time.DateTime
import org.scalatest.BeforeAndAfter
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.BindMode
import play.api.http.Status
import play.api.libs.json.*

import scala.concurrent.Await
import scala.concurrent.duration.*
import scala.jdk.DurationConverters.*
import scala.util.Random

class ApiControllerRolesSpec()
    extends ApiControllerSpecBase {

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
      )(using tenant2, session)

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
      )(using tenant, session)

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
      val resp = httpJsonCallBlocking(
        path = "/api/apis/_init",
        method = "POST",
        body = Some(json.SeqApiFormat.writes(apis))
      )(using tenant, session)

      resp.status mustBe 201
      val result = resp.json
        .as[JsArray]
        .value
        .map(v => ((v \ "name").as[String], (v \ "done").as[Boolean]))

      result.forall(tuple =>
        apis.exists(api => api.name == tuple._1 && tuple._2)
      ) mustBe true
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
      )(using tenant, session)

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
      val api = defaultApi.api.copy(
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
              "apk-test::api=${api.name}:${api.currentVersion}/${plan.name}::team=${team.name}::id=${subscription.clientId}"
            ),
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url =
                  s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
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
      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${api.id.value}/plan/${plan.id.value}/team/${teamConsumer.id.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(using tenant, session)
      resp.status mustBe 200

      val sub =
        (resp.json \ "subscription").as(using json.ApiSubscriptionFormat)
      val keyring = Await
        .result(
          daikokuComponents.env.dataStore.keyringRepo
            .forTenant(tenant)
            .findById(sub.keyring),
          5.seconds
        )
        .get
      val expectedName =
        s"apk-test::api=${api.name}:${api.currentVersion.value}/${plan.customName}::team=${teamConsumer.name}::id=${keyring.apiKey.clientId}"
      keyring.apiKey.clientName mustBe expectedName
    }

  }

  "a api editor" can {
    "see his teams" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userApiEditor, user, userAdmin),
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
      )(using tenant, session)
      resp.status mustBe 200

      val result = (resp.json \ "data" \ "myTeams").as[JsArray]
      result.value.length mustBe 1
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
      )(using tenant, session)

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
      val session = loginWithBlocking(userApiEditor, tenant)

      val respError = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/another-api/${defaultApi.api.currentVersion.value}",
        method = "PUT",
        body = Some(updatedApi.asJson)
      )(using tenant, session)

      respError.status mustBe 404

      val respError2 = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/apis/another-api/${defaultApi.api.currentVersion.value}",
        method = "PUT",
        body = Some(updatedApi.asJson)
      )(using tenant, session)

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
      )(using tenant, session)

      resp.status mustBe 200
      val result =
        fr.maif.daikoku.domain.json.ApiFormat.reads(resp.json)
      result.isSuccess mustBe true
      result.get.description.equals("description") mustBe true

      val respGet =
        httpJsonCallBlocking(path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
        )(using tenant, session)

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
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}",
        method = "DELETE",
        body = Json.obj().some
      )(using tenant, session)
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
      val api = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("parent.dev")),
        defaultUsagePlan = UsagePlanId("parent.dev").some
      )
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKeyWith2childs,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent_token"
      )
      val sub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            aggregationApiKeysSecurity = Some(true),
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url =
                  s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
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
        subscriptions = Seq(sub),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userApiEditor, tenant)
      val userSession = loginWithBlocking(user, tenant)

      val respPreVerifOtoParent = httpJsonCallBlocking(
        path = s"/api/apikeys/${keyring.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)

      (respPreVerifOtoParent.json \ "enabled").as[Boolean] mustBe true

      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/subscriptions/${sub.id.value}",
        method = "DELETE"
      )(using tenant, session)
      resp.status mustBe 200

      val respVerifDk = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumer.id.value}/subscription/${sub.id.value}/informations"
      )(using tenant, userSession)
      respVerifDk.status mustBe 404

      val respVerifOto = httpJsonCallBlocking(
        path = s"/api/apikeys/${keyring.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)
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
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/apis/${defaultApi.api.id}",
        method = "DELETE",
        body = Json.obj().some
      )(using tenant, session)
      resp.status mustBe 404

      val resp2 = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id}",
        method = "DELETE",
        body = Json.obj().some
      )(using tenant, session)
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
      )(using tenant, session)

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
      )(using tenant, session)

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
      var resp = httpJsonCallBlocking(path =
        s"/api/teams/${teamOwnerId.value}/apis/${secondApi.id.value}/${secondApi.currentVersion.value}"
      )(using tenant, session)
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
      )(using tenant, session)
      resp.status mustBe Status.CREATED

      resp = httpJsonCallBlocking(path =
        s"/api/teams/${teamOwnerId.value}/apis/${secondApi.id.value}/${secondApi.currentVersion.value}"
      )(using tenant, session)
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
            Seq(ApiDocumentationDetailPage(page.id, page.title, Seq.empty))
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
      var resp = httpJsonCallBlocking(path =
        s"/api/teams/${teamOwnerId.value}/apis/${secondApi.id.value}/${secondApi.currentVersion.value}"
      )(using tenant, session)

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
      )(using tenant, session)

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
      val plan = UsagePlan(
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
      val demand = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/${plan.id.value}/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Some(Json.obj("motivation" -> "pleaaase"))
      )(using tenant, session)
      demand.status mustBe 200

      // check notification for demand is saved for owner team
      val notificationsForOwner = Await.result(
        daikokuComponents.env.dataStore.notificationRepo
          .forTenant(tenant)
          .findNotDeleted(Json.obj("team" -> teamOwnerId.asJson)),
        5.seconds
      )
      notificationsForOwner.length mustBe 1
      val notificationdemand = notificationsForOwner.head
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
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/_transfer",
        method = "POST",
        body = Some(Json.obj("team" -> teamConsumer.id.value))
      )(using tenant, session)
      transfer.status mustBe 200
      (transfer.json \ "notify").as[Boolean] mustBe true

      // accept transfer (2 notification available, transfer & demand)
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
      )(using tenant, session)
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
      )(using tenant, session)
      acceptNotif.status mustBe 200
      (acceptNotif.json \ "done").as[Boolean] mustBe true
      val respVerif =
        httpJsonCallBlocking(
          path =
            s"/api/teams/${teamConsumerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
        )(using tenant, session)
      respVerif.status mustBe 200
      val eventualApi = json.ApiFormat.reads(respVerif.json)
      eventualApi.isSuccess mustBe true
      eventualApi.get.team mustBe teamConsumerId

      // verifier que la notif a bien été changé d'équipe
      // check notification (O for owner)
      val notificationsForOwner2 = Await.result(
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
              "api" -> defaultApi.api.id.asJson,
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
      val process = ValidationStep.TeamAdmin(
        id = IdGenerator.token,
        team = defaultApi.api.team,
        title = "Admin"
      )
      val processV2 = process.copy(id = IdGenerator.token)
      val plan = UsagePlan(
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
      val plan2 = plan.copy(
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
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/${plan.id.value}/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Some(Json.obj("motivation" -> "pleaaase"))
      )(using tenant, session)
      demand.status mustBe 200

      val demand2 = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApiV2.id.value}/plan/${plan.id.value}/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Some(Json.obj("motivation" -> "pleaaase"))
      )(using tenant, session)
      demand2.status mustBe 200

      // check notification for demand is saved for owner team
      val notificationsForOwner = Await.result(
        daikokuComponents.env.dataStore.notificationRepo
          .forTenant(tenant)
          .findNotDeleted(Json.obj("team" -> teamOwnerId.asJson)),
        5.seconds
      )
      notificationsForOwner.length mustBe 2
      val notificationsdemand = notificationsForOwner
      // check notification for demand is saved for owner team
      val notificationsForConsumer = Await.result(
        daikokuComponents.env.dataStore.notificationRepo
          .forTenant(tenant)
          .findNotDeleted(Json.obj("team" -> teamConsumerId.asJson)),
        5.seconds
      )
      notificationsForConsumer.length mustBe 0
      // check also demand
      val demandsForAllversion = Await.result(
        daikokuComponents.env.dataStore.subscriptionDemandRepo
          .forTenant(tenant)
          .findNotDeleted(
            Json.obj(
              "api" -> Json.obj("$in" -> JsArray(versions.map(_.id.asJson))),
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
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/_transfer",
        method = "POST",
        body = Some(Json.obj("team" -> teamConsumer.id.value))
      )(using tenant, session)
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
      )(using tenant, session)
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
      )(using tenant, session)
      acceptNotif.status mustBe 200
      (acceptNotif.json \ "done").as[Boolean] mustBe true

      // 4
      val respVerif =
        httpJsonCallBlocking(
          s"/api/teams/${teamConsumerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
        )(using tenant, session)
      respVerif.status mustBe 200
      val eventualApi = json.ApiFormat.reads(respVerif.json)
      eventualApi.isSuccess mustBe true
      eventualApi.get.team mustBe teamConsumerId
      val respVerif2 =
        httpJsonCallBlocking(
          s"/api/teams/${teamConsumerId.value}/apis/${defaultApiV2.id.value}/${defaultApiV2.currentVersion.value}"
        )(using tenant, session)
      respVerif2.status mustBe 200
      val eventualApi2 = json.ApiFormat.reads(respVerif.json)
      eventualApi2.isSuccess mustBe true
      eventualApi2.get.team mustBe teamConsumerId

      // 5
      val notificationsForOwner2 = Await.result(
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
      notificationsForConsumer2.count(n =>
        notificationsdemand.exists(_.id == n.id)
      ) mustBe 2

      // 6
      val demandsForAllversion2 = Await.result(
        daikokuComponents.env.dataStore.subscriptionDemandRepo
          .forTenant(tenant)
          .findNotDeleted(
            Json.obj(
              "api" -> Json.obj("$in" -> JsArray(versions.map(_.id.asJson))),
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
        users = Seq(user, userApiEditor, userAdmin),
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
      )(using tenant, session)
      resp.status mustBe 200

      val result = (resp.json \ "data" \ "myTeams").as[JsArray]
      result.value.length mustBe 2
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
      )(using tenant, session)

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
      )(using tenant, session)

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
        method = "DELETE",
        body = Json.obj().some
      )(using tenant, session)

      resp.status mustBe 403
    }

    "subscribe to an api" in {
      val teamIdWithApiKeyVisible = TeamId("team-consumer-with-apikey-visible")
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
                url =
                  s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
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
        usagePlans = Seq(parentPlan),
        apis = Seq(parentApi)
      )
      val session = loginWithBlocking(userApiEditor, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${parentApi.id.value}/plan/${parentPlan.id.value}/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(using tenant, session)

      resp.status mustBe 200

      val resultAsSubscription = (resp.json \ "subscription").as[JsObject]
      (resultAsSubscription \ "plan").as[String] mustBe parentPlan.id.value
      (resultAsSubscription \ "team").as[String] mustBe teamConsumerId.value
      (resultAsSubscription \ "by").as[String] mustBe userApiEditor.id.value

    }

    "get his team visible apis" in {
      val planSubId = UsagePlanId("1")
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "test"
      )
      val sub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        plan = planSubId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = daikokuAdminId,
        customName = Some("custom name"),
        keyring = keyring.id
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        subscriptions = Seq(sub),
        keyrings = Seq(keyring),
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
      val session = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/me/teams/${teamConsumerId.value}/visible-apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
      )(using tenant, session)
      resp.status mustBe 200

      val pendingRequests = (resp.json \ "pendingRequestPlan")
        .as[JsArray]
        .value
        .map(_.as(using json.UsagePlanIdFormat))
      val subscriptions = (resp.json \ "subscriptions").as[JsArray]

      pendingRequests.length mustBe 1
      pendingRequests.head mustBe UsagePlanId("2")

      subscriptions.value.length mustBe 1
      (subscriptions.value.head \ "_id")
        .as(using json.ApiSubscriptionIdFormat) mustBe ApiSubscriptionId("test")
    }

    "not get team visible apis if he's not a member of this team" in {
      val planSubId = UsagePlanId("1")
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "test"
      )
      val sub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        plan = planSubId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = daikokuAdminId,
        customName = Some("custom name"),
        keyring = keyring.id
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
        keyrings = Seq(keyring),
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
      val session = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/me/teams/${teamConsumerId.value}/visible-apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
      )(using tenant, session)
      resp.status mustBe 403
    }

    "not get team visible apis if this api doesn't exists" in {
      val planSubId = UsagePlanId("1")
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "test"
      )
      val sub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        plan = planSubId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = daikokuAdminId,
        customName = Some("custom name"),
        keyring = keyring.id
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        subscriptions = Seq(sub),
        keyrings = Seq(keyring),
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
      val session = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/me/teams/${teamConsumerId.value}/visible-apis/another-api/${defaultApi.api.currentVersion.value}"
      )(using tenant, session)
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
      )(using tenant, session)

      (apiResp.json \ "stars").as[Int] mustBe 0

      var resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/stars",
        method = "PUT"
      )(using tenant, session)

      resp.status mustBe 200

      apiResp = httpJsonCallBlocking(
        path = s"/api/me/visible-apis/${defaultApi.api.id.value}"
      )(using tenant, session)

      (apiResp.json \ "stars").as[Int] mustBe 1

      resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/stars",
        method = "PUT"
      )(using tenant, session)

      resp.status mustBe 200

      apiResp = httpJsonCallBlocking(
        path = s"/api/me/visible-apis/${defaultApi.api.id.value}"
      )(using tenant, session)

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
        path =
          s"/api/me/subscriptions/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
      )(using tenant, sessionAdmin)
      subAdminResp.status mustBe 200

      val subUserResp = httpJsonCallBlocking(
        path =
          s"/api/me/subscriptions/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
      )(using tenant, sessionUser)
      subUserResp.status mustBe 401

    }
  }

}
