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
import fr.maif.daikoku.logger.AppLogger
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

class ApiControllerAggregateSpec() extends ApiControllerSpecBase {

  "keyring with multiple subscriptions" can {
    "not be used when the mode is disabled on plan" in {
      val subId = ApiSubscriptionId("test")
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "test"
      )
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
            plan = UsagePlanId("5"),
            createdAt = DateTime.now(),
            team = teamConsumerId,
            api = defaultApi.api.id,
            by = userTeamAdminId,
            customName = None,
            keyring = keyring.id
          )
        ),
        keyrings = Seq(keyring)
      )
      val _testPlan = defaultApi.plans.find(u => u.id.value == "4")
      _testPlan mustBe defined
      val testPlan = _testPlan.get
      testPlan.aggregationApiKeysSecurity mustBe Some(false)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/${testPlan.id.value}/team/${teamConsumerId.value}/${keyring.id.value}/_extends",
        method = "PUT",
        body = Json.obj().some
      )(using tenant, loginWithBlocking(user, tenant))

      resp.status mustBe Status.FORBIDDEN
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

      tenant.aggregationApiKeysSecurity.getOrElse(false) mustBe false

      updatedPlans.foreach(plan => {
        val resp = httpJsonCallBlocking(
          path =
            s"/api/teams/${teamOwner.id.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/plan/${plan.id.value}",
          method = "PUT",
          body = Some(plan.asJson)
        )(using tenant, loginWithBlocking(userApiEditor, tenant))

        resp.status mustBe Status.BAD_REQUEST

        val expectedError =
          (AppError.toJson(SubscriptionAggregationDisabled) \ "error")
            .as[String]

        (resp.json \ "error").as[String] mustBe expectedError
      })

    }
    "match client id of this parent" in {
      val parentSubId = ApiSubscriptionId("parent")

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
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(routes = Set(OtoroshiRouteId(parentRouteId)))
            )
          )
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

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent"
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
            ),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
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
            plan = copiedPlan.id,
            createdAt = DateTime.now(),
            team = teamConsumerId,
            api = copiedApi.id,
            by = userTeamAdminId,
            customName = None,
            keyring = keyring.id
          )
        ),
        keyrings = Seq(keyring)
      )

      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/test/plan/${copiedPlan.id.value}/team/${teamConsumerId.value}/${keyring.id.value}/_extends",
        method = "PUT",
        body = Json.obj().some
      )(using tenant, loginWithBlocking(user, tenant))

      resp.status mustBe Status.OK

      val newSubId = (resp.json \ "subscription" \ "_id").as[String]
      val newSub = Await
        .result(
          daikokuComponents.env.dataStore.apiSubscriptionRepo
            .forTenant(tenant)
            .findById(newSubId),
          5.seconds
        )
        .get
      newSub.keyring mustBe keyring.id
    }
    "not be transformed in unique api key when the subscription is alone on its keyring" in {
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "test"
      )
      val standaloneSub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        plan = UsagePlanId("4"),
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        subscriptions = Seq(standaloneSub),
        keyrings = Seq(keyring)
      )

      // the subscription is the only one referencing its keyring, so there is
      // nothing to extract: making it unique must be refused
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/subscriptions/${standaloneSub.id.value}/_makeUnique",
        method = "POST"
      )(using tenant, loginWithBlocking(user, tenant))

      resp.status mustBe 409
    }
    "be transform in unique api key" in {

      val plan1 = UsagePlan(
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

      val plan2 = UsagePlan(
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

      val api1 = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(plan1.id),
        defaultUsagePlan = plan1.id.some
      )
      val api2 = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(plan2.id),
        defaultUsagePlan = plan2.id.some
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKeyWith2childs,
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "test"
      )
      val sub1 = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        plan = plan1.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api1.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
      )
      val sub2 = ApiSubscription(
        id = ApiSubscriptionId("test2"),
        tenant = tenant.id,
        plan = plan2.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api2.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
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
        users = Seq(user),
        teams = Seq(teamConsumer, teamOwner),
        usagePlans = Seq(plan1, plan2),
        apis = Seq(api1, api2),
        subscriptions = Seq(sub1, sub2),
        keyrings = Seq(keyring)
      )

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/subscriptions/${sub2.id.value}/_makeUnique",
        method = "POST"
      )(using tenant, loginWithBlocking(user, tenant))

      resp.status mustBe 200

      // check that parent subscription apikey do not be updated
      val resp2 = httpJsonCallBlocking(
        path =
          s"/api/apis/${api1.id.value}/${api1.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(using tenant, loginWithBlocking(user, tenant))

      resp2.status mustBe 200
      val subscriptions = SeqApiSubscriptionFormat.reads(resp2.json)

      subscriptions.get.size mustBe 1

      assert(subscriptions.get.head.keyring == keyring.id)

      // check that child subscription apikey has been created
      val resp3 = httpJsonCallBlocking(
        path =
          s"/api/apis/${api2.id.value}/${api2.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(using tenant, loginWithBlocking(user, tenant))
      resp3.status mustBe 200
      val childSubscriptions = SeqApiSubscriptionFormat.reads(resp3.json)
      childSubscriptions.get.size mustBe 1
      assert(childSubscriptions.get.head.keyring != keyring.id)
    }
    "failed when new subscription(plan) has an otoroshi target different than keyring" in {
      val parentSubId = ApiSubscriptionId("parent")
      val parentApiKeyClientId = "clientId"
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = OtoroshiApiKey("name", parentApiKeyClientId, "secret"),
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent"
      )
      setupEnvBlocking(
        tenants = Seq(tenant.copy(aggregationApiKeysSecurity = Some(true))),
        users = Seq(user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans.map {
          case p
              if !p.isPaymentDefined && p.visibility != UsagePlanVisibility.Admin =>
            p.copy(
              aggregationApiKeysSecurity = Some(true),
              otoroshiTarget = Some(
                OtoroshiTarget(
                  OtoroshiSettingsId("default2"),
                  Some(
                    AuthorizedEntities(groups =
                      Set(OtoroshiServiceGroupId("12345"))
                    )
                  )
                )
              )
            )
          case p =>
            p.copy(aggregationApiKeysSecurity = Some(true))
        },
        apis = Seq(
          defaultApi.api
        ),
        subscriptions = Seq(
          ApiSubscription(
            id = parentSubId,
            tenant = tenant.id,
            plan = UsagePlanId("5"),
            createdAt = DateTime.now(),
            team = teamConsumerId,
            api = defaultApi.api.id,
            by = userTeamAdminId,
            customName = None,
            keyring = keyring.id
          )
        ),
        keyrings = Seq(keyring)
      )
      val planId = defaultApi.api.possibleUsagePlans.head.value
      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/$planId/team/${teamConsumerId.value}/${keyring.id.value}/_extends",
        method = "PUT",
        body = Json.obj().some
      )(using tenant, loginWithBlocking(user, tenant))

      resp.status mustBe Status.CONFLICT
      (resp.json \ "error").as[
        String
      ] mustBe "The subscribed plan has another otoroshi of the parent plan"
    }
    "update subscription on keyring do not erase authorizedEntities" in {
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
      val childApi = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("child.dev")),
        defaultUsagePlan = UsagePlanId("child.dev").some
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
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
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
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer, defaultAdminTeam),
        usagePlans = Seq(parentPlan, childPlan, adminApiPlan),
        apis = Seq(parentApi, childApi, adminApi),
        subscriptions = Seq(parentSub, childSub),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/subscriptions/${parentSub.id.value}",
        method = "PUT",
        body = parentSub
          .copy(
            customMetadata = Json.obj("foo" -> "bar").some
          )
          .asJson
          .some
      )(using tenant, session)

      resp.status mustBe 200

      // test otoroshi key
      val respVerif = httpJsonCallBlocking(
        path = s"/api/apikeys/${keyring.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)

      val authorizations = (respVerif.json \ "authorizations").as[JsArray]
      val strings = authorizations.value.map(value => (value \ "id").as[String])
      strings.size mustBe 2
      strings.contains(childRouteId) mustBe true
      strings.contains(parentRouteId) mustBe true
    }
    "update plan of subscription contained in keyring do not erase authorizedEntities" in {
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
        possibleUsagePlans = Seq(UsagePlanId("parent.dev")),
        defaultUsagePlan = UsagePlanId("parent.dev").some
      )
      val childApi = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("child.dev")),
        defaultUsagePlan = UsagePlanId("child.dev").some
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
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
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
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer, defaultAdminTeam),
        usagePlans = Seq(parentPlan, childPlan, adminApiPlan),
        apis = Seq(parentApi, childApi, adminApi),
        subscriptions = Seq(parentSub, childSub),
        keyrings = Seq(keyring)
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
      )(using tenant, session)

      resp.status mustBe 200

      val respVerif = httpJsonCallBlocking(
        path = s"/api/apikeys/${keyring.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)

      val authorizations = (respVerif.json \ "authorizations").as[JsArray]
      val strings = authorizations.value.map(value => (value \ "id").as[String])
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
      )(using tenant, session)

      val respVerif2 = httpJsonCallBlocking(
        path = s"/api/apikeys/${keyring.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)

      val authorizations2 = (respVerif2.json \ "authorizations").as[JsArray]
      val strings2 =
        authorizations2.value.map(value => (value \ "id").as[String])
      strings2.size mustBe 3
    }
    "disable only the targeted subscription and keep the other subscriptions of the keyring active" in {
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
      val childApi = defaultApi.api.copy(
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

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKeyWith2childs,
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
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id,
        customMetadata = Json.obj("foo" -> "bar").some
      )
      val childSub2 = ApiSubscription(
        id = ApiSubscriptionId("child_sub_2"),
        tenant = tenant.id,
        plan = childPlan2.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
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
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer, defaultAdminTeam),
        usagePlans = Seq(parentPlan, childPlan, childPlan2, adminApiPlan),
        apis = Seq(parentApi, childApi, childApi2, adminApi),
        subscriptions = Seq(parentSub, childSub, childSub2),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)

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
      val preMetadata = (respPreVerifOtoParent.json \ "metadata").as[JsObject]
      countDaikokuMetadata(preMetadata) mustBe 1
      (preMetadata \ "foo").as[String] mustBe "bar"

      val preAuthorizations =
        (respPreVerifOtoParent.json \ "authorizations").as[JsArray]
      val preStrings =
        preAuthorizations.value.map(value => (value \ "id").as[String])
      preStrings.size mustBe 3
      preStrings.contains(otherRouteId) mustBe true
      preStrings.contains(childRouteId) mustBe true
      preStrings.contains(parentRouteId) mustBe true

      // disable parentSub => allSub are disabled + otokey
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/subscriptions/${childSub.id.value}/_archive?enable=false",
        method = "PUT"
      )(using tenant, session)
      resp.status mustBe 200

      val respVerifDkChild = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumer.id.value}/subscription/${parentSub.id.value}/informations"
      )(using tenant, session)

      respVerifDkChild.status mustBe 200
      (respVerifDkChild.json \ "subscription" \ "enabled")
        .as[Boolean] mustBe true

      val respVerifOtoParent = httpJsonCallBlocking(
        path = s"/api/apikeys/${keyring.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)

      (respVerifOtoParent.json \ "enabled").as[Boolean] mustBe true
      val authorizations =
        (respVerifOtoParent.json \ "authorizations").as[JsArray]
      val strings = authorizations.value.map(value => (value \ "id").as[String])
      strings.size mustBe 2
      strings.contains(otherRouteId) mustBe true
      strings.contains(parentRouteId) mustBe true
      val metadata = (respVerifOtoParent.json \ "metadata").as[JsObject]
      countDaikokuMetadata(metadata) mustBe 0
    }

    "disable only the targeted subscription and keep the other subscriptions of the keyring active (api owner)" in {
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
      val childApi = defaultApi.api.copy(
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

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKeyWith2childs,
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
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id,
        customMetadata = Json.obj("foo" -> "bar").some
      )
      val childSub2 = ApiSubscription(
        id = ApiSubscriptionId("child_sub_2"),
        tenant = tenant.id,
        plan = childPlan2.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
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
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer, defaultAdminTeam),
        usagePlans = Seq(parentPlan, childPlan, childPlan2, adminApiPlan),
        apis = Seq(parentApi, childApi, childApi2, adminApi),
        subscriptions = Seq(parentSub, childSub, childSub2),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)

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
      val preMetadata = (respPreVerifOtoParent.json \ "metadata").as[JsObject]
      countDaikokuMetadata(preMetadata) mustBe 1
      (preMetadata \ "foo").as[String] mustBe "bar"

      val preAuthorizations =
        (respPreVerifOtoParent.json \ "authorizations").as[JsArray]
      val preStrings =
        preAuthorizations.value.map(value => (value \ "id").as[String])
      preStrings.size mustBe 3
      preStrings.contains(otherRouteId) mustBe true
      preStrings.contains(childRouteId) mustBe true
      preStrings.contains(parentRouteId) mustBe true

      // disable parentSub => allSub are disabled + otokey
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/subscriptions/${childSub.id.value}/_archiveByOwner?enable=false",
        method = "PUT"
      )(using tenant, session)
      resp.status mustBe 200

      val respVerifDkChild = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumer.id.value}/subscription/${parentSub.id.value}/informations"
      )(using tenant, session)

      respVerifDkChild.status mustBe 200
      (respVerifDkChild.json \ "subscription" \ "enabled")
        .as[Boolean] mustBe true

      val respVerifOtoParent = httpJsonCallBlocking(
        path = s"/apis/apim.otoroshi.io/v1/apikeys/${keyring.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)

      (respVerifOtoParent.json \ "enabled").as[Boolean] mustBe true
      val authorizations =
        (respVerifOtoParent.json \ "authorizations").as[JsArray]
      val strings = authorizations.value.map(value => (value \ "id").as[String])
      strings.size mustBe 2
      strings.contains(otherRouteId) mustBe true
      strings.contains(parentRouteId) mustBe true
      val metadata = (respVerifOtoParent.json \ "metadata").as[JsObject]
      countDaikokuMetadata(metadata) mustBe 0
    }

    "keep the remaining subscriptions and the otoroshi key when one subscription of the keyring is deleted" in {
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
      val childApi = defaultApi.api.copy(
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

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKeyWith2childs,
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
        customMetadata = Json.obj("parent-foo" -> "parent-bar").some,
        keyring = keyring.id
      )
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id,
        customMetadata = Json.obj("foo" -> "bar").some
      )
      val childSub2 = ApiSubscription(
        id = ApiSubscriptionId("child_sub_2"),
        tenant = tenant.id,
        plan = childPlan2.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi2.id,
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
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer, defaultAdminTeam),
        usagePlans = Seq(parentPlan, childPlan, childPlan2, adminApiPlan),
        apis = Seq(parentApi, childApi, childApi2, adminApi),
        subscriptions = Seq(parentSub, childSub, childSub2),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)

      httpJsonCallBlocking(
        path = s"/api/apikeys/${keyring.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080),
        method = "PATCH",
        body = Json
          .arr(
            Json.obj(
              "op" -> "replace",
              "path" -> "/metadata/daikoku__metadata",
              "value" -> "| foo | parent-foo"
            ),
            Json.obj(
              "op" -> "add",
              "path" -> "/metadata/parent-foo",
              "value" -> "parent-bar"
            )
          )
          .some
      )(using tenant, session)

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
      val preMetadata = (respPreVerifOtoParent.json \ "metadata").as[JsObject]
      countDaikokuMetadata(preMetadata) mustBe 2
      (preMetadata \ "foo").as[String] mustBe "bar"
      (preMetadata \ "parent-foo").as[String] mustBe "parent-bar"

      val preAuthorizations =
        (respPreVerifOtoParent.json \ "authorizations").as[JsArray]
      val preStrings =
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
      )(using tenant, session)
      resp.status mustBe 200

      val respVerifDkParent = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumer.id.value}/subscription/${parentSub.id.value}/informations"
      )(using tenant, session)

      respVerifDkParent.status mustBe 404
      val respVerifDkChild = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumer.id.value}/subscription/${childSub.id.value}/informations"
      )(using tenant, session)

      respVerifDkChild.status mustBe 200

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

      (respVerifOto.json \ "enabled").as[Boolean] mustBe true
      val authorizations = (respVerifOto.json \ "authorizations").as[JsArray]
      val strings = authorizations.value.map(value => (value \ "id").as[String])
      strings.size mustBe 2
      strings.contains(otherRouteId) mustBe true
      strings.contains(childRouteId) mustBe true
      strings.contains(parentRouteId) mustBe false
      val metadata = (respVerifOto.json \ "metadata").as[JsObject]
      countDaikokuMetadata(metadata) mustBe 1
      (metadata \ "foo").as[String] mustBe "bar"
    }
    "be entirely deleted (subscriptions + otoroshi key) when its team deletes the keyring" in {
      val parentPlan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "parent.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(routes = Set(OtoroshiRouteId(parentRouteId)))
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
              AuthorizedEntities(routes = Set(OtoroshiRouteId(childRouteId)))
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
      val childApi = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childPlan.id),
        defaultUsagePlan = childPlan.id.some
      )
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKeyWith2childs,
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
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
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
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer, defaultAdminTeam),
        usagePlans = Seq(parentPlan, childPlan),
        apis = Seq(parentApi, childApi),
        subscriptions = Seq(parentSub, childSub),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/keyrings/${keyring.id.value}",
        method = "DELETE"
      )(using tenant, session)
      resp.status mustBe 200

      httpJsonCallBlocking(
        s"/api/teams/${teamConsumer.id.value}/subscription/${parentSub.id.value}/informations"
      )(using tenant, session).status mustBe 404
      httpJsonCallBlocking(
        s"/api/teams/${teamConsumer.id.value}/subscription/${childSub.id.value}/informations"
      )(using tenant, session).status mustBe 404

      val maybeKeyring = Await.result(
        daikokuComponents.env.dataStore.keyringRepo
          .forTenant(tenant)
          .findByIdNotDeleted(keyring.id.value),
        5.seconds
      )
      maybeKeyring.isDefined mustBe false

      val respOto = httpJsonCallBlocking(
        path = s"/api/apikeys/${keyring.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)
      respOto.status mustBe 404
    }
    "not be deleted by a team that does not own it" in {
      val plan = UsagePlan(
        id = UsagePlanId("own.dev"),
        tenant = tenant.id,
        customName = "own.dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(routes = Set(OtoroshiRouteId(parentRouteId)))
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
        id = ApiId("own-api"),
        team = teamOwnerId,
        possibleUsagePlans = Seq(plan.id),
        defaultUsagePlan = plan.id.some
      )
      val keyring = Keyring(
        id = KeyringId("consumer-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "token"
      )
      val sub = ApiSubscription(
        id = ApiSubscriptionId("consumer_sub"),
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
        tenants = Seq(tenant.copy(aggregationApiKeysSecurity = Some(true))),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer, defaultAdminTeam),
        usagePlans = Seq(plan),
        apis = Seq(api),
        subscriptions = Seq(sub),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)

      // teamOwner tries to delete a keyring owned by teamConsumer
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/keyrings/${keyring.id.value}",
        method = "DELETE"
      )(using tenant, session)
      resp.status mustBe 404

      val maybeKeyring = Await.result(
        daikokuComponents.env.dataStore.keyringRepo
          .forTenant(tenant)
          .findByIdNotDeleted(keyring.id.value),
        5.seconds
      )
      maybeKeyring.isDefined mustBe true

      val maybeSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findByIdNotDeleted(sub.id.value),
        5.seconds
      )
      maybeSub.isDefined mustBe true
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
      val childPlanProd = UsagePlan(
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
      val childPlanDev = UsagePlan(
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
      val childApi = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childPlanDev.id, childPlanProd.id),
        defaultUsagePlan = childPlanDev.id.some
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKeyWith2childs,
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent_token"
      )
      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
      )

      setupEnvBlocking(
        tenants = Seq(
          tenantEnvMode.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url =
                  s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
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
        subscriptions = Seq(parentSub),
        keyrings = Seq(keyring)
      )

      val consumerSession = loginWithBlocking(userAdmin, tenant)

      // test extend parent prod sub with child dev ==> KO
      val respDev = httpJsonCallBlocking(
        path =
          s"/api/apis/${childApi.id.value}/plan/${childPlanDev.id.value}/team/${teamConsumerId.value}/${keyring.id.value}/_extends",
        method = "PUT",
        body = Json.obj().some
      )(using tenant, consumerSession)
      respDev.status mustBe 403

      // test extend parent prod sub with child prod ==> OK
      val respProd = httpJsonCallBlocking(
        path =
          s"/api/apis/${childApi.id.value}/plan/${childPlanProd.id.value}/team/${teamConsumerId.value}/${keyring.id.value}/_extends",
        method = "PUT",
        body = Json.obj().some
      )(using tenant, consumerSession)
      respProd.status mustBe 200

      // disabled security
      setupEnvBlocking(
        tenants = Seq(
          tenantEnvMode.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url =
                  s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
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
        subscriptions = Seq(parentSub),
        keyrings = Seq(keyring)
      )

      // test extend parent prod sub with child dev ==> KO
      val consumerSession2 = loginWithBlocking(userAdmin, tenant)
      val respDev2 = httpJsonCallBlocking(
        path =
          s"/api/apis/${childApi.id.value}/plan/${childPlanDev.id.value}/team/${teamConsumerId.value}/${keyring.id.value}/_extends",
        method = "PUT",
        body = Json.obj().some
      )(using tenant, consumerSession2)
      respDev2.status mustBe 200

      // test extend parent prod sub with child prod ==> OK
      val respProd2 = httpJsonCallBlocking(
        path =
          s"/api/apis/${childApi.id.value}/plan/${childPlanProd.id.value}/team/${teamConsumerId.value}/${keyring.id.value}/_extends",
        method = "PUT",
        body = Json.obj().some
      )(using tenant, consumerSession2)
      respProd2.status mustBe 200

      setupEnvBlocking(
        tenants = Seq(
          tenantEnvMode.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url =
                  s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
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
        subscriptions = Seq(parentSub),
        keyrings = Seq(keyring)
      )

      val consumerSession3 = loginWithBlocking(userAdmin, tenant)
      // test extend parent prod sub with child dev ==> KO
      val respDev3 = httpJsonCallBlocking(
        path =
          s"/api/apis/${childApi.id.value}/plan/${childPlanDev.id.value}/team/${teamConsumerId.value}/${keyring.id.value}/_extends",
        method = "PUT",
        body = Json.obj().some
      )(using tenant, consumerSession3)
      respDev3.status mustBe 200

      // test extend parent prod sub with child prod ==> OK
      val respProd3 = httpJsonCallBlocking(
        path =
          s"/api/apis/${childApi.id.value}/plan/${childPlanProd.id.value}/team/${teamConsumerId.value}/${keyring.id.value}/_extends",
        method = "PUT",
        body = Json.obj().some
      )(using tenant, consumerSession3)
      respProd3.status mustBe 200

    }

  }
}
