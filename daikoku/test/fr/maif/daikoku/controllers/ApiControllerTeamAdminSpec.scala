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

class ApiControllerTeamAdminSpec()
    extends ApiControllerSpecBase {

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
      )(using tenant, session)
      resp.status mustBe 403
    }

    "see his teams (graphQl)" in {
      setupEnvBlocking(
        tenants = Seq(tenant.copy(subscriptionSecurity = Some(true))),
        users = Seq(userAdmin, user, userApiEditor),
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
      )(using tenant, session)
      resp.status mustBe 200

      val result = (resp.json \ "data" \ "myTeams").as[JsArray]
      result.value.length mustBe 2

      setupEnvBlocking(
        tenants = Seq(tenant.copy(subscriptionSecurity = Some(false))),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer)
      )
      val session2 = loginWithBlocking(userAdmin, tenant)
      val resp2 = httpJsonCallBlocking(
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
      )(using tenant, session2)
      resp2.status mustBe 200

      val result2 = (resp2.json \ "data" \ "myTeams").as[JsArray]
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
        )(using tenant, session)

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
        )(using tenant, session)

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
        )(using tenant, session2)

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
        )(using tenant, session2)

      resp4.status mustBe 200
      val maybeValue4 = resp4.json
        .as[JsArray]
        .value
        .find(entry => (entry \ "label").as[String] == "Teams")
      maybeValue4.isDefined mustBe true
      (maybeValue4.get \ "options").as[JsArray].value.length mustBe 1

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
        )(using tenant, session)

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
      )(using tenant, session)

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
          ),
          defaultAdminTeam
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

      val otoroshitargetWithUnauthGroup = Some(
        OtoroshiTarget(
          containerizedOtoroshi,
          Some(
            AuthorizedEntities(
              groups = Set(OtoroshiServiceGroupId(serviceGroupDev))
            )
          )
        )
      )
      val otoroshitargetWithUnauthRoute = Some(
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
        path =
          s"/api/teams/${teamOwnerId.value}/tenant/otoroshis/${containerizedOtoroshi.value}/groups"
      )(using tenant, session)
      val respRoutesForOwner = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/tenant/otoroshis/${containerizedOtoroshi.value}/routes"
      )(using tenant, session)

      respGroupsForOwner.status mustBe 200
      respGroupsForOwner.json.as[JsArray].value.length mustBe 1
      respRoutesForOwner.status mustBe 200
      respRoutesForOwner.json.as[JsArray].value.length mustBe 1

      val respGroupsForConsumer = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/tenant/otoroshis/${containerizedOtoroshi.value}/groups"
      )(using tenant, session)
      val respRoutesForConsumer = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/tenant/otoroshis/${containerizedOtoroshi.value}/routes"
      )(using tenant, session)

      respGroupsForConsumer.status mustBe 200
      respGroupsForConsumer.json
        .as[JsArray]
        .value
        .length mustBe 3 // dev, default, admin
      respRoutesForConsumer.status mustBe 200
      respRoutesForConsumer.json
        .as[JsArray]
        .value
        .length mustBe 5 // parent, child, other, admin, request

      val respUnauthRoute = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/plan",
        method = "POST",
        body = planToCreate
          .copy(otoroshiTarget = otoroshitargetWithUnauthRoute)
          .asJson
          .some
      )(using tenant, session)
      respUnauthRoute.status mustBe 401

      val respUnauthGroup = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/plan",
        method = "POST",
        body = planToCreate
          .copy(otoroshiTarget = otoroshitargetWithUnauthGroup)
          .asJson
          .some
      )(using tenant, session)
      respUnauthGroup.status mustBe 401

      val respAuthEntities = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/plan",
        method = "POST",
        body = planToCreate
          .copy(otoroshiTarget = otoroshitargetWithAuthEntities)
          .asJson
          .some
      )(using tenant, session)
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
        subscriptions = Seq(sub),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
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
          teamConsumer.copy(users =
            Set(
              UserWithPermission(userTeamUserId, TeamPermission.Administrator)
            )
          )
        ),
        apis = Seq(defaultApi.api, secondApi)
      )
      val updatedApi = defaultApi.api.copy(description = "description")
      val session = loginWithBlocking(userAdmin, tenant)

      val respError = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${secondApi.id.value}/${secondApi.currentVersion.value}",
        method = "PUT",
        body = Some(updatedApi.asJson)
      )(using tenant, session)

      respError.status mustBe 404

      (respError.json \ "error")
        .as[String] mustBe AppError.ApiNotFound.getErrorMessage()

      val respError2 = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/apis/${secondApi.id.value}/${secondApi.currentVersion.value}",
        method = "PUT",
        body = Some(updatedApi.asJson)
      )(using tenant, session)

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
      val userPersonalTeam = Team(
        id = TeamId("user-team"),
        tenant = tenant.id,
        `type` = TeamType.Personal,
        name = "user team personal",
        description = "",
        contact = user.email,
        users = Set(UserWithPermission(user.id, TeamPermission.Administrator))
      )

      val personalKeyring = Keyring(
        id = KeyringId("personal-keyring"),
        tenant = tenant.id,
        team = userPersonalTeam.id,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "test"
      )
      val personalSubscription = ApiSubscription(
        id = ApiSubscriptionId("1"),
        tenant = tenant.id,
        plan = defaultApi.plans.head.id,
        createdAt = DateTime.now(),
        team = userPersonalTeam.id,
        api = defaultApi.api.id,
        by = user.id,
        customName = Some("custom name"),
        keyring = personalKeyring.id
      )

      val subscribedPlan = defaultApi.plans.reverse.head.id
      val subscriptionDemand = SubscriptionDemand(
        id = DemandId("test"),
        tenant = tenant.id,
        api = defaultApi.api.id,
        plan = subscribedPlan,
        steps = Seq(
          SubscriptionDemandStep(
            id = SubscriptionDemandStepId("admin"),
            state = SubscriptionDemandState.Waiting,
            step = ValidationStep.TeamAdmin(
              id = IdGenerator.token(10),
              team = teamOwner.id
            )
          )
        ),
        state = SubscriptionDemandState.InProgress,
        team = teamConsumerId,
        from = user.id,
        motivation = None
      )

      val subDemandNotif = Notification(
        id = NotificationId(IdGenerator.token(10)),
        tenant = tenant.id,
        team = None,
        sender = user.asNotificationSender,
        action = NotificationAction.ApiSubscriptionDemand(
          api = defaultApi.api.id,
          plan = defaultApi.plans.reverse.head.id,
          team = teamConsumerId,
          demand = DemandId("test"),
          step = SubscriptionDemandStepId("admin"),
          motivation = None
        )
      )

      val page = ApiDocumentationPage(
        id = ApiDocumentationPageId(IdGenerator.token(10)),
        tenant = tenant.id,
        title = "test",
        lastModificationAt = DateTime.now(),
        content = "#title"
      )

      val post = ApiPost(
        id = ApiPostId(IdGenerator.token(10)),
        tenant = tenant.id,
        title = "title",
        lastModificationAt = DateTime.now(),
        content = "test"
      )

      val issue = ApiIssue(
        id = ApiIssueId(IdGenerator.token(10)),
        seqId = 10,
        tenant = tenant.id,
        title = "title",
        tags = Set.empty,
        open = true,
        createdAt = DateTime.now(),
        closedAt = None,
        by = user.id,
        comments = Seq.empty,
        lastModificationAt = DateTime.now(),
        apiVersion = defaultApi.api.currentVersion.value.some
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(otoroshiSettings =
            Set(
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
        teams = Seq(teamOwner, teamConsumer, userPersonalTeam),
        usagePlans = defaultApi.plans.map(
          _.copy(otoroshiTarget =
            Some(
              OtoroshiTarget(
                containerizedOtoroshi,
                Some(
                  AuthorizedEntities(
                    routes = Set(OtoroshiRouteId(parentRouteId))
                  )
                )
              )
            )
          )
        ),
        apis = Seq(
          defaultApi.api.copy(
            posts = Seq(post.id),
            issues = Seq(issue.id),
            documentation = ApiDocumentation(
              id = ApiDocumentationId(IdGenerator.token(10)),
              tenant = tenant.id,
              pages =
                Seq(ApiDocumentationDetailPage(page.id, page.title, Seq.empty)),
              lastModificationAt = DateTime.now
            )
          )
        ),
        pages = Seq(page),
        posts = Seq(post),
        issues = Seq(issue),
        subscriptions = Seq(personalSubscription),
        keyrings = Seq(personalKeyring),
        subscriptionDemands = Seq(subscriptionDemand),
        notifications = Seq(subDemandNotif)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}",
        method = "DELETE",
        body = Json.obj().some
      )(using tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      def operationsPending() = {
        Await.result(
          daikokuComponents.env.dataStore.operationRepo
            .forTenant(tenant)
            .find(
              Json.obj(
                "status" ->
                  Json.obj(
                    "$in" ->
                      JsArray(
                        Seq(
                          JsString(OperationStatus.Idle.name),
                          JsString(OperationStatus.InProgress.name)
                        )
                      )
                  )
              )
            ),
          5.second
        )
      }

      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        // test if user subscriptions are physically deleted
        val _maybeSubscription = Await.result(
          daikokuComponents.env.dataStore.apiSubscriptionRepo
            .forTenant(tenant)
            .findById(personalSubscription.id),
          5.second
        )
        _maybeSubscription.isEmpty
      }

      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().isEmpty
      }

      // todo: verif if subscriptions, docs, plans, demands & stepValidatores are cleans

      // test if plans are deleted
      val _maybePlans = Await.result(
        daikokuComponents.env.dataStore.usagePlanRepo
          .forTenant(tenant)
          .findNotDeleted(Json.obj("api" -> defaultApi.api.id.asJson)),
        5.second
      )
      _maybePlans.isEmpty mustBe true

      // test if docs are deleted
      val _maybeDocs = Await.result(
        daikokuComponents.env.dataStore.apiDocumentationPageRepo
          .forTenant(tenant)
          .findByIdNotDeleted(page.id),
        5.second
      )
      _maybeDocs.isEmpty mustBe true

      // test if posts are deleted
      val _maybePosts = Await.result(
        daikokuComponents.env.dataStore.apiPostRepo
          .forTenant(tenant)
          .findByIdNotDeleted(post.id),
        5.second
      )
      _maybePosts.isEmpty mustBe true

      // test if issues are deleted
      val _maybeIssue = Await.result(
        daikokuComponents.env.dataStore.apiIssueRepo
          .forTenant(tenant)
          .findByIdNotDeleted(issue.id),
        5.second
      )
      _maybeIssue.isEmpty mustBe true

      // test if api notification are cleaned
      val notifDemand = Await.result(
        daikokuComponents.env.dataStore.notificationRepo
          .forAllTenant()
          .findByIdNotDeleted(subDemandNotif.id),
        5.second
      )
      notifDemand mustBe None

      Await.result(
        daikokuComponents.env.dataStore.subscriptionDemandRepo
          .forAllTenant()
          .findById(subscriptionDemand.id),
        5.second
      ) mustBe None

      // verif oto apikey
      val respVerifOto = httpJsonCallBlocking(
        path =
          s"/apis/apim.otoroshi.io/v1/apikeys/${personalKeyring.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)

      logger.json(respVerifOto.json, pretty = true)
      respVerifOto.status mustBe 404
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
      )(using tenant, session)

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
      // plan not found
      var resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/subscriptions",
        method = "POST",
        body = Some(
          Json
            .obj("plan" -> "test", "teams" -> Json.arr(teamConsumer.id.asJson))
        )
      )(using tenant, session)
      resp.status mustBe 404
      // team not found
      resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/$plan/team/${teamAdminId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(using tenant, session)

      resp.status mustBe 404
      (resp.json \ "error")
        .as[String] mustBe AppError.TeamNotFound.getErrorMessage()
      // api not found
      resp = httpJsonCallBlocking(
        path =
          s"/api/apis/test/plan/test/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(using tenant, session)
      resp.status mustBe 404
      (resp.json \ "error")
        .as[String] mustBe AppError.ApiNotFound.getErrorMessage()
      // api unauthorized
      resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${adminApi.id.value}/plan/admin/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(using tenant, session)

      resp.status mustBe 401
      (resp.json \ "error")
        .as[String] mustBe AppError.ApiUnauthorized.getErrorMessage()
      // plan unauthorized
      resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${unauthorizedApi.id.value}/plan/${planUnauthorizedApi.id.value}/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(using tenant, session)
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
        plan = plan.id,
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
        usagePlans = Seq(plan),
        apis = Seq(
          defaultApi.api.copy(
            possibleUsagePlans = Seq(plan.id)
          )
        ),
        subscriptions = Seq(sub),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/subscription/${sub.id.value}/informations"
      )(using tenant, session)
      resp.status mustBe 200
      val simpleApi = (resp.json \ "api").as[JsObject]
      val simpleSub = (resp.json \ "subscription").as[JsObject]
      val simplePlan = (resp.json \ "plan").as[JsObject]

      (simpleApi \ "name").as[String] mustBe defaultApi.api.name
      (simpleSub \ "customName").as[String] mustBe sub.customName.get
      (simplePlan \ "customName").as[String] mustBe "new plan name"
    }

    "update a subscription to his api" in {
      val plan = UsagePlan(
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
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "test"
      )
      val sub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = userAdmin.id,
        customName = Some("custom name"),
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
        users = Seq(userAdmin, user),
        teams = Seq(
          teamOwner,
          teamConsumer.copy(
            users = Set(UserWithPermission(user.id, Administrator))
          ),
          defaultAdminTeam
        ),
        usagePlans = Seq(plan),
        apis = Seq(api),
        subscriptions = Seq(sub),
        keyrings = Seq(keyring)
      )
      val otoroshiTarget = plan.otoroshiTarget
      val otoApiKey = ActualOtoroshiApiKey(
        clientId = keyring.apiKey.clientId,
        clientSecret = keyring.apiKey.clientSecret,
        clientName = keyring.apiKey.clientName,
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
            .asSafeJson(keyring)
        )
      )(using tenant, session)
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

      val newApk = getApkFromOtoroshi(keyring.apiKey.clientId)
      val metadata = (newApk \ "metadata")
        .as[JsObject]
      (metadata \ "foo").as[String] mustBe "bar"
      (newApk \ "throttlingQuota")
        .as[Long] mustBe 1
      (newApk \ "dailyQuota")
        .as[Long] mustBe 2
      (newApk \ "monthlyQuota")
        .as[Long] mustBe 42
      (newApk \ "readOnly")
        .as[Boolean] mustBe true
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
        plan = plan.id,
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
        apis = Seq(
          defaultApi.api.copy(
            possibleUsagePlans = Seq(plan.id)
          )
        ),
        subscriptions = Seq(sub),
        keyrings = Seq(keyring)
      )

      val otoroshiTarget = plan.otoroshiTarget
      val otoApiKey = ActualOtoroshiApiKey(
        clientId = keyring.apiKey.clientId,
        clientSecret = keyring.apiKey.clientSecret,
        clientName = keyring.apiKey.clientName,
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
        path =
          s"/api/teams/${teamConsumerId.value}/subscriptions/${sub.id.value}",
        method = "PUT",
        body = Some(
          sub.copy(customMetadata = Some(Json.obj("foo" -> "bar"))).asSafeJson(
            keyring
          )
        )
      )(using tenant, session)
      resp.status mustBe 403
    }

    "not accept subscription without custom metadata if plan requires it" in {
      val plan = UsagePlan(
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
        motivation =
          Json.obj("motivation" -> Json.obj("type" -> "string")).some,
        keyring = None,
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
      )(using tenant, session)

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
      )(using tenant, session)

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
      )(using tenant, session)

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
      )(using tenant, session)

      respPersonal.status mustBe 403

      val respOrg = httpJsonCallBlocking(
        path =
          s"/api/apis/${defaultApi.api.id.value}/plan/$plan/team/${teamOwnerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(using tenant, session)

      respOrg.status mustBe 200
    }

    "transfer subscriptions to another team" in {

      // creer un apk otoroshi a transferer
      Json.obj(
        "_loc" -> Json.obj(
          "tenant" -> "default",
          "teams" -> Json.arr("default")
        ),
        "clientId" -> parentApiKey.clientId,
        "clientSecret" -> parentApiKey.clientSecret,
        "clientName" -> parentApiKey.clientName,
        "description" -> "",
        "authorizedGroup" -> JsNull,
        "authorizedEntities" -> Json.arr(
          s"route_$parentRouteId"
        ),
        "authorizations" -> Json.arr(
          Json.obj(
            "kind" -> "route",
            "id" -> parentRouteId
          )
        ),
        "enabled" -> true,
        "readOnly" -> false,
        "allowClientIdOnly" -> false,
        "throttlingQuota" -> 10000000,
        "dailyQuota" -> 10000000,
        "monthlyQuota" -> 10000000,
        "constrainedServicesOnly" -> false,
        "restrictions" -> Json.obj(
          "enabled" -> false,
          "allowLast" -> true,
          "allowed" -> Json.arr(),
          "forbidden" -> Json.arr(),
          "notFound" -> Json.arr()
        ),
        "rotation" -> Json.obj(
          "enabled" -> false,
          "rotationEvery" -> 744,
          "gracePeriod" -> 168,
          "nextSecret" -> JsNull
        ),
        "validUntil" -> JsNull,
        "tags" -> Json.arr(),
        "metadata" -> Json.obj(
          "daikoku__metadata" -> "| foo",
          "foo" -> "bar"
        )
      )

      // update otoroshi
      Await.result(cleanOtoroshiServer(container.mappedPort(8080)), 5.seconds)

      // setup dk
      val usagePlan = UsagePlan(
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
      val api = defaultApi.api.copy(
        id = ApiId("test-api-id"),
        name = "test API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(usagePlan.id),
        defaultUsagePlan = usagePlan.id.some
      )
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "token"
      )
      val subscription = ApiSubscription(
        id = ApiSubscriptionId("test_sub"),
        tenant = tenant.id,
        plan = usagePlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id,
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
        users = Seq(userAdmin),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(api),
        usagePlans = Seq(usagePlan),
        subscriptions = Seq(subscription),
        keyrings = Seq(keyring)
      )

      // get transfer link (no need to give team)
      val session = loginWithBlocking(userAdmin, tenant)
      val respLink = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumer.id.value}/subscriptions/${subscription.id.value}/_transfer"
      )(using tenant, session)
      respLink.status mustBe 200
      val link = (respLink.json \ "link").as[String]
      val token = link.split("token=").lastOption.getOrElse("")

      // follow link
      val respRetrieve = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwner.id.value}/subscriptions/${subscription.id.value}/_retrieve",
        method = "PUT",
        body = Json.obj("token" -> token).some
      )(using tenant, session)
      respRetrieve.status mustBe 200

      val consumerSubsReq = httpJsonCallBlocking(
        s"/api/subscriptions/teams/${teamConsumer.id.value}"
      )(using tenant, session)
      consumerSubsReq.status mustBe 200
      val maybeConsumerSubs =
        json.SeqApiSubscriptionFormat.reads(consumerSubsReq.json)
      maybeConsumerSubs.isSuccess mustBe true
      val consumerSubs = maybeConsumerSubs.get
      consumerSubs.length mustBe 0

      val ownerSubsReq = httpJsonCallBlocking(
        s"/api/subscriptions/teams/${teamOwner.id.value}"
      )(using tenant, session)
      ownerSubsReq.status mustBe 200
      val maybeOwnerSubs =
        json.SeqApiSubscriptionFormat.reads(ownerSubsReq.json)
      maybeOwnerSubs.isSuccess mustBe true
      val ownerSubs = maybeOwnerSubs.get
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
        possibleUsagePlans = Seq(childPlanProd.id),
        defaultUsagePlan = childPlanProd.id.some
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
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
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
        usagePlans = Seq(parentPlanProd, childPlanProd),
        subscriptions = Seq(parentSub, childSub),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val respLink = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumer.id.value}/subscriptions/${childSub.id.value}/_transfer"
      )(using tenant, session)
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
        possibleUsagePlans = Seq(childPlanProd.id),
        defaultUsagePlan = childPlanProd.id.some
      )

      val consumerKeyring = Keyring(
        id = KeyringId("consumer-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKeyWith2childs,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent_token"
      )
      val ownerKeyring = Keyring(
        id = KeyringId("owner-keyring"),
        tenant = tenant.id,
        team = teamOwnerId,
        apiKey = parentApiKeyWith2childs,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent_owner_token"
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
        keyring = consumerKeyring.id
      )
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = consumerKeyring.id
      )

      val parentOwnerSub = ApiSubscription(
        id = ApiSubscriptionId("parent_owner_sub"),
        tenant = tenant.id,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = ownerKeyring.id
      )
      val childOwnerSub = ApiSubscription(
        id = ApiSubscriptionId("child_owner_sub"),
        tenant = tenant.id,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = ownerKeyring.id
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
        ),
        keyrings = Seq(consumerKeyring, ownerKeyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val respLink = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumer.id.value}/subscriptions/${parentSub.id.value}/_transfer"
      )(using tenant, session)
      respLink.status mustBe 409
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
        possibleUsagePlans = Seq(childPlanProd.id),
        defaultUsagePlan = childPlanProd.id.some
      )

      val consumerKeyring = Keyring(
        id = KeyringId("consumer-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKeyWith2childs,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent_token"
      )
      val ownerKeyring = Keyring(
        id = KeyringId("owner-keyring"),
        tenant = tenant.id,
        team = teamOwnerId,
        apiKey = parentApiKeyWith2childs,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent_owner_token"
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
        keyring = consumerKeyring.id
      )
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = consumerKeyring.id
      )

      val parentOwnerSub = ApiSubscription(
        id = ApiSubscriptionId("parent_owner_sub"),
        tenant = tenant.id,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = ownerKeyring.id
      )
      val childOwnerSub = ApiSubscription(
        id = ApiSubscriptionId("child_owner_sub"),
        tenant = tenant.id,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = ownerKeyring.id
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
        ),
        keyrings = Seq(consumerKeyring, ownerKeyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val respLink = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumer.id.value}/subscriptions/${parentSub.id.value}/_transfer"
      )(using tenant, session)
      respLink.status mustBe 409
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
      val childApi = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childPlanProd.id),
        defaultUsagePlan = childPlanProd.id.some
      )

      val consumerKeyring = Keyring(
        id = KeyringId("consumer-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKeyWith2childs,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent_token"
      )
      val ownerKeyring = Keyring(
        id = KeyringId("owner-keyring"),
        tenant = tenant.id,
        team = teamOwnerId,
        apiKey = parentApiKeyWith2childs,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent_owner_token"
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
        keyring = consumerKeyring.id
      )
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = consumerKeyring.id
      )

      val parentOwnerSub = ApiSubscription(
        id = ApiSubscriptionId("parent_owner_sub"),
        tenant = tenant.id,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = ownerKeyring.id
      )
      val childOwnerSub = ApiSubscription(
        id = ApiSubscriptionId("child_owner_sub"),
        tenant = tenant.id,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = ownerKeyring.id
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
        ),
        keyrings = Seq(consumerKeyring, ownerKeyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val respLink = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumer.id.value}/subscriptions/${parentSub.id.value}/_transfer"
      )(using tenant, session)
      respLink.status mustBe 409
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
      val childApi = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childPlanProd.id),
        defaultUsagePlan = childPlanProd.id.some
      )

      val consumerKeyring = Keyring(
        id = KeyringId("consumer-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKeyWith2childs,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent_token"
      )
      val ownerKeyring = Keyring(
        id = KeyringId("owner-keyring"),
        tenant = tenant.id,
        team = teamOwnerId,
        apiKey = parentApiKeyWith2childs,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent_owner_token"
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
        keyring = consumerKeyring.id
      )
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = consumerKeyring.id
      )

      val parentOwnerSub = ApiSubscription(
        id = ApiSubscriptionId("parent_owner_sub"),
        tenant = tenant.id,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = ownerKeyring.id
      )
      val childOwnerSub = ApiSubscription(
        id = ApiSubscriptionId("child_owner_sub"),
        tenant = tenant.id,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = ownerKeyring.id
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
        ),
        keyrings = Seq(consumerKeyring, ownerKeyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val respLink = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumer.id.value}/subscriptions/${parentSub.id.value}/_transfer"
      )(using tenant, session)
      respLink.status mustBe 409
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

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentPlanProd.id),
        defaultUsagePlan = parentPlanProd.id.some,
        visibility = ApiVisibility.Private,
        authorizedTeams = Seq(teamOwner.id)
      )
      val childApi = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childPlanProd.id),
        defaultUsagePlan = childPlanProd.id.some
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamOwnerId,
        apiKey = parentApiKeyWith2childs,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent_token"
      )
      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
      )
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
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
        ),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val respLink = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwner.id.value}/subscriptions/${parentSub.id.value}/_transfer"
      )(using tenant, session)
      respLink.status mustBe 409
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
        possibleUsagePlans = Seq(childPlanProd.id),
        defaultUsagePlan = childPlanProd.id.some
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamOwnerId,
        apiKey = parentApiKeyWith2childs,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent_token"
      )
      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
      )
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
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
        ),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val respLink = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwner.id.value}/subscriptions/${parentSub.id.value}/_transfer"
      )(using tenant, session)
      respLink.status mustBe 409
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
        possibleUsagePlans = Seq(childPlanProd.id),
        defaultUsagePlan = childPlanProd.id.some,
        visibility = ApiVisibility.Private,
        authorizedTeams = Seq(teamOwner.id)
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamOwnerId,
        apiKey = parentApiKeyWith2childs,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent_token"
      )
      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
      )
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        plan = childPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = childApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
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
        ),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val respLink = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwner.id.value}/subscriptions/${parentSub.id.value}/_transfer"
      )(using tenant, session)
      respLink.status mustBe 409
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
      val childApi = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childPlanProd.id),
        defaultUsagePlan = childPlanProd.id.some
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamOwnerId,
        apiKey = parentApiKeyWith2childs,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent_token"
      )
      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent_sub"),
        tenant = tenant.id,
        plan = parentPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = parentApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
      )
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("child_sub"),
        tenant = tenant.id,
        plan = childPlanProd.id,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = childApi.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
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
        ),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val respLink = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwner.id.value}/subscriptions/${parentSub.id.value}/_transfer"
      )(using tenant, session)
      respLink.status mustBe 409
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

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
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

      val session = loginWithBlocking(userAdmin, tenant)
      // check validnuntil dans oto
      val respPreOto = httpJsonCallBlocking(
        path = s"/api/apikeys/${keyring.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)

      (respPreOto.json \ "validUntil").asOpt[Boolean] mustBe None

      // update subscription
      val validUntil = DateTime.now().plusHours(1)
      val respUpdate = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/subscriptions/${parentSub.id.value}",
        method = "PUT",
        body = Some(
          parentSub
            .copy(
              validUntil = validUntil.some
            )
            .asSafeJson(keyring)
        )
      )(using tenant, session)
      respUpdate.status mustBe 200

      val updatedSub = Await
        .result(
          daikokuComponents.env.dataStore.apiSubscriptionRepo
            .forTenant(tenant)
            .findById(parentSub.id),
          5.seconds
        )
        .get
      updatedSub.validUntil.map(_.getMillis) mustBe validUntil.getMillis.some

      val respUpdateOto = httpJsonCallBlocking(
        path = s"/api/apikeys/${keyring.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)
      (respUpdateOto.json \ "validUntil").asOpt[Long] mustBe None
    }

    "cancel a subscription demand" in {
      val subscribedPlan = defaultApi.plans.reverse.head.id
      val subscriptionDemand = SubscriptionDemand(
        id = DemandId("test"),
        tenant = tenant.id,
        api = defaultApi.api.id,
        plan = subscribedPlan,
        steps = Seq(
          SubscriptionDemandStep(
            id = SubscriptionDemandStepId("admin"),
            state = SubscriptionDemandState.Waiting,
            step = ValidationStep.TeamAdmin(
              id = IdGenerator.token(10),
              team = teamOwner.id
            )
          )
        ),
        state = SubscriptionDemandState.InProgress,
        team = teamConsumerId,
        from = user.id,
        motivation = None
      )

      val subDemandNotif = Notification(
        id = NotificationId(IdGenerator.token(10)),
        tenant = tenant.id,
        team = None,
        sender = user.asNotificationSender,
        action = NotificationAction.ApiSubscriptionDemand(
          api = defaultApi.api.id,
          plan = defaultApi.plans.reverse.head.id,
          team = teamConsumerId,
          demand = DemandId("test"),
          step = SubscriptionDemandStepId("admin"),
          motivation = None
        )
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(otoroshiSettings =
            Set(
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
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans.map(
          _.copy(otoroshiTarget =
            Some(
              OtoroshiTarget(
                containerizedOtoroshi,
                Some(
                  AuthorizedEntities(
                    routes = Set(OtoroshiRouteId(parentRouteId))
                  )
                )
              )
            )
          )
        ),
        apis = Seq(
          defaultApi.api.copy(
            documentation = ApiDocumentation(
              id = ApiDocumentationId(IdGenerator.token(10)),
              tenant = tenant.id,
              pages = Seq(),
              lastModificationAt = DateTime.now
            )
          )
        ),
        subscriptionDemands = Seq(subscriptionDemand),
        notifications = Seq(subDemandNotif)
      )
      val session = loginWithBlocking(userAdmin, tenant)

      val cancelDemand = httpJsonCallBlocking(
        path =
          s"/api/subscription/team/${teamConsumerId.value}/demands/${subscriptionDemand.id.value}/_cancel",
        method = "DELETE"
      )(using tenant, session)

      cancelDemand.status mustBe 200
      (cancelDemand.json \ "done").as[Boolean] mustBe true

      val notifDemand = Await.result(
        daikokuComponents.env.dataStore.notificationRepo
          .forAllTenant()
          .findByIdNotDeleted(subDemandNotif.id),
        5.second
      )
      notifDemand mustBe None

      Await.result(
        daikokuComponents.env.dataStore.subscriptionDemandRepo
          .forAllTenant()
          .findById(subscriptionDemand.id),
        5.second
      ) mustBe None
    }
  }

}
