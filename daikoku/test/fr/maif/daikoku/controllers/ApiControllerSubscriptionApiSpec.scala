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

class ApiControllerSubscriptionApiSpec() extends ApiControllerSpecBase {

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
      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/${plan.id.value}/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(using tenant, session)

      resp.status mustBe 200
      (resp.json \ "creation").as[String] mustBe "waiting"

      val respSubs = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(using tenant, session)
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
        )(using tenant, session)

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
      )(using tenant, session)
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
      val plan = "4" // plan with allow multiple keys set to true

      for (_ <- Seq(1, 2, 3)) {
        val resp = httpJsonCallBlocking(
          path =
            s"/api/apis/${defaultApi.api.id.value}/plan/$plan/team/${teamConsumerId.value}/_subscribe",
          method = "POST",
          body = Json.obj().some
        )(using tenant, session)

        resp.status mustBe 200
        (resp.json \ "creation").as[String] mustBe "done"
      }

      val respSubs = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(using tenant, session)
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
      )(using tenant, session)

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
      val plan = defaultApi.plans.head.id
      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/${plan.value}/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(using tenant, session)

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
      )(using tenant, session)

      resp.status mustBe 200
      (resp.json \ "creation").as[String] mustBe "done"

      val respAdmin = httpJsonCallBlocking(
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(using tenant, session)
      respAdmin.status mustBe 200

      val userSession = loginWithBlocking(user, tenant)
      val respUser = httpJsonCallBlocking(
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(using tenant, userSession)
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
      )(using tenant, session)

      resp.status mustBe 200
      (resp.json \ "creation").as[String] mustBe "done"

      val respAdmin = httpJsonCallBlocking(
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(using tenant, session)
      respAdmin.status mustBe 200

      val userSession = loginWithBlocking(user, tenant)
      val respUser = httpJsonCallBlocking(
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(using tenant, userSession)
      respUser.status mustBe 403

      val respCreationUser = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/2/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(using tenant, userSession)

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
        )(using tenant, session)

        test._2 == (respVerif.json \ "exists").as[Boolean]
      }) mustBe true

      val respVerif = httpJsonCallBlocking(
        path = s"/api/apis/_names",
        method = "POST",
        body = Some(
          Json.obj("name" -> "test name api", "id" -> defaultApi.api.id.asJson)
        )
      )(using tenant, session)
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
      )(using tenant, session)

      resp.status mustBe 401
      (resp.json \ "error")
        .as[String] mustBe "You're not authorized on this api"

      val sessionAdmin = loginWithBlocking(userAdmin, tenant)
      val respAdmin = httpJsonCallBlocking(
        path = s"/api/me/visible-apis/${defaultApi.api.id.value}"
      )(using tenant, sessionAdmin)

      respAdmin.status mustBe 200
      (respAdmin.json \ "_id").as[String] mustBe defaultApi.api.id.value

    }

    "list all subscribed apis" in {
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamOwnerId,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "test"
      )
      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        plan = UsagePlanId("5"),
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = defaultApi.api.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
      )

      val secondApi =
        generateApi("second", tenant.id, teamConsumerId, Seq.empty)
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("test2"),
        tenant = tenant.id,
        plan = UsagePlanId("6"),
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = secondApi.api.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user, userAdmin),
        teams = Seq(teamOwner),
        usagePlans = defaultApi.plans ++ secondApi.plans,
        apis = Seq(defaultApi.api, secondApi.api),
        subscriptions = Seq(parentSub, childSub),
        keyrings = Seq(keyring)
      )

      val sessionTest = loginWithBlocking(userAdmin, tenant)

      val respTestApis = httpJsonCallBlocking(
        s"/api/teams/${teamOwnerId.value}/subscribed-apis"
      )(using tenant, sessionTest)
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

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent_token"
      )
      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        plan = parentPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            isPrivate = false,
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
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer, defaultAdminTeam),
        usagePlans = Seq(parentPlan, adminApiPlan),
        apis = Seq(parentApi, adminApi),
        subscriptions = Seq(parentSub),
        keyrings = Seq(keyring)
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
                      "id" -> "team",
                      "value" -> Json.arr(teamOwnerId.value)
                    )
                  )
                ),
                "limit" -> 5,
                "offset" -> 0
              ),
              "query" ->
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
        )(using tenant)
        respAllVisibleApi.status mustBe 200
        val response =
          (respAllVisibleApi.json \ "data" \ "visibleApis").as[JsObject]
        (response \ "total").as[Int] mustBe count
        (response \ "apis").as[JsArray].value.length mustBe count
      }

      // api is visible by anyone
      testApiVisibility(1)

      // check base key
      val startingKey = httpJsonCallBlocking(
        path = s"/api/apikeys/${keyring.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)
      (startingKey.json \ "enabled").as[Boolean] mustBe true
      countDaikokuMetadata(
        (startingKey.json \ "metadata").as[JsObject]
      ) mustBe 0

      // manipulate subscription as admin
      // - update plan metadata & check if metadata is in otoroshi
      httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/subscriptions/${parentSub.id.value}",
        method = "PUT",
        body = Json
          .obj(
            "customMetadata" -> Json.obj("foo" -> "bar")
          )
          .some
      )(using tenant, session)
      // - archiveKeyByOwner --> key is disable in oto
      httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/subscriptions/${parentSub.id.value}/_archiveByOwner?enabled=false",
        method = "PUT"
      )(using tenant, session)
      // test in oto
      val update1 = httpJsonCallBlocking(
        path = s"/api/apikeys/${keyring.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)
      (update1.json \ "enabled").as[Boolean] mustBe false
      countDaikokuMetadata((update1.json \ "metadata").as[JsObject]) mustBe 1

      // update api as blocked
      httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${parentApi.id.value}/${parentApi.currentVersion.value}",
        method = "PUT",
        body = parentApi.copy(state = ApiState.Blocked).asJson.some
      )(using tenant, session)

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
        path =
          s"/api/teams/${teamOwnerId.value}/subscriptions/${parentSub.id.value}",
        method = "PUT",
        body = Json
          .obj(
            "customMetadata" -> Json.obj("foo" -> "bar", "foofoo" -> "barbar")
          )
          .some
      )(using tenant, session)
      // - archiveKeyByOwner --> key is disable in oto
      httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/subscriptions/${parentSub.id.value}/_archiveByOwner?enabled=true",
        method = "PUT"
      )(using tenant, session)
      // - archiveKeyByOwner --> key is disable in oto
      val update2 = httpJsonCallBlocking(
        path = s"/api/apikeys/${keyring.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)
      (update2.json \ "enabled").as[Boolean] mustBe true
      countDaikokuMetadata((update2.json \ "metadata").as[JsObject]) mustBe 2
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
      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/${plan.id.value}/team/${teamOwnerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(using tenant, session)

      resp.status mustBe 200
      (resp.json \ "creation").as[String] mustBe "done"

      val resultAsSubscription = (resp.json \ "subscription").as[JsObject]
      (resultAsSubscription \ "plan").as[String] mustBe plan.id.value
      (resultAsSubscription \ "team").as[String] mustBe teamOwnerId.value
      (resultAsSubscription \ "by").as[String] mustBe userAdmin.id.value
    }

    "be subscribed by an authorized team" in {
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
        authorizedTeams = Seq(teamConsumerId),
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
      )(using tenant, session)

      resp.status mustBe 200
      (resp.json \ "creation").as[String] mustBe "done"

      val resultAsSubscription = (resp.json \ "subscription").as[JsObject]
      (resultAsSubscription \ "plan").as[String] mustBe plan.id.value
      (resultAsSubscription \ "team").as[String] mustBe teamConsumerId.value
      (resultAsSubscription \ "by").as[String] mustBe userAdmin.id.value
    }

    "not be subscribed by an unauthorized team" in {
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
        authorizedTeams = Seq.empty,
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
      )(using tenant, session)

      resp.status mustBe 401
//      (resp.json \ "creation").as[String] mustBe "done"
//
//      val resultAsSubscription = (resp.json \ "subscription").as[JsObject]
//      (resultAsSubscription \ "plan").as[String] mustBe plan.id.value
//      (resultAsSubscription \ "team").as[String] mustBe teamConsumerId.value
//      (resultAsSubscription \ "by").as[String] mustBe userAdmin.id.value
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
      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/${plan.id.value}/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(using tenant, session)

      resp.status mustBe 401
    }

    "adds all teams subscribed in authorized team after inverting visibility" in {
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
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "test-removal"
      )
      val payperUseSub = ApiSubscription(
        id = ApiSubscriptionId("test-removal"),
        tenant = tenant.id,
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = daikokuAdminId,
        customName = None,
        keyring = keyring.id
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
        subscriptions = Seq(payperUseSub),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)

      val privatePlan = plan
        .copy(visibility = Private)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/plan/${privatePlan.id.value}",
        method = "PUT",
        body = Some(privatePlan.asJson)
      )(using tenant, session)

      resp.status mustBe 200
      val result =
        fr.maif.daikoku.domain.json.UsagePlanFormat.reads(resp.json)
      result.isSuccess mustBe true

      result.get.authorizedTeams.length mustBe 1
    }
  }

}
