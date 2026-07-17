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

class ApiControllerVisibilitySpec()
    extends ApiControllerSpecBase {

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

      // test access denied
      val respApiDenied = httpJsonCallBlocking(
        s"/api/me/visible-apis/${defaultApi.api.id.value}"
      )(using tenant, userSession)
      respApiDenied.status mustBe 401

      // ask access
      val resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.id.value}/access",
        method = "POST",
        body = Some(Json.obj("teams" -> Json.arr(teamConsumerId.asJson)))
      )(using tenant, userSession)
      resp.status mustBe 200

      // get notifications for teamOwner and accept it
      val respNotif =
        getOwnNotificationsCallBlocking(Json.obj())(using tenant, adminSession)
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
      val notifId =
        (notifications.value.head \ "_id").as(using json.NotificationIdFormat)

      val respAccept = httpJsonCallBlocking(
        path = s"/api/notifications/${notifId.value}/accept",
        method = "PUT",
        body = Some(Json.obj())
      )(using tenant, adminSession)
      resp.status mustBe 200

      // test access ok
      val respApiOk = httpJsonCallBlocking(
        s"/api/me/visible-apis/${defaultApi.api.id.value}"
      )(using tenant, userSession)
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
      )(using tenant)

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
              )
            ),
            lastModificationAt = DateTime.now(),
            apiVersion = defaultApi.api.currentVersion.value.some
          ).asJson
        )
      )(using tenant, userSession)
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
      )(using tenant, session)
      val issuesOfFooApi = httpJsonCallBlocking(
        path = s"/api/apis/${secondApi.humanReadableId}/issues"
      )(using tenant, session)

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
        id = subId,
        tenant = tenant.id,
        plan = payPerUsePlanId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
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
        subscriptions = Seq(sub),
        keyrings = Seq(keyring)
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
          )(using tenant, sessionAdmin)
        }
        resp.status mustBe 200

        matrix.foreachEntry((session, response) => {
          val resp = httpJsonCallBlocking(
            s"/api/teams/${teamConsumerId.value}/subscription/${sub.id.value}/consumption"
          )(using tenant, session)
          resp.status mustBe response
        })
      })
    }
    "restrict rotation setup for a subscription" in {
      val payPerUsePlanId = UsagePlanId("5")
      val subId = ApiSubscriptionId("test")
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
        id = subId,
        tenant = tenant.id,
        plan = payPerUsePlanId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
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
        subscriptions = Seq(sub),
        keyrings = Seq(keyring)
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
        clientId = keyring.apiKey.clientId,
        clientSecret = keyring.apiKey.clientSecret,
        clientName = keyring.apiKey.clientName,
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

      val path = otoroshiUpdateApikeyPath(keyring.apiKey.clientId)

      val apiKeyPath = otoroshiGetApikeyPath(otoApiKey.clientId)

      val matrixOfMatrix = Map(
        (
          Some(TeamApiKeyVisibility.Administrator),
          Map((sessionAdmin, 200), (sessionApiEditor, 403), (sessionUser, 403))
        ),
        (
          Some(TeamApiKeyVisibility.ApiEditor),
          Map((sessionAdmin, 200), (sessionApiEditor, 403), (sessionUser, 403))
        ),
        (
          Some(TeamApiKeyVisibility.User),
          Map((sessionAdmin, 200), (sessionApiEditor, 403), (sessionUser, 403))
        ),
        (
          None,
          Map((sessionAdmin, 200), (sessionApiEditor, 403), (sessionUser, 403))
        )
      )

      matrixOfMatrix.foreachEntry((maybeVisibility, matrix) => {
        val resp = {
          httpJsonCallBlocking(
            path = s"/api/teams/${teamOwnerId.value}",
            method = "PUT",
            body =
              Some(teamConsumer.copy(apiKeyVisibility = maybeVisibility).asJson)
          )(using tenant, sessionAdmin)
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
          )(using tenant, session)
          resp.status mustBe response
        })
      })
    }
    "restrict custom name update setup for a subscription" in {
      val payPerUsePlanId = UsagePlanId("5")
      val subId = ApiSubscriptionId("test")
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
        id = subId,
        tenant = tenant.id,
        plan = payPerUsePlanId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
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
        subscriptions = Seq(sub),
        keyrings = Seq(keyring)
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
          Map((sessionAdmin, 200), (sessionApiEditor, 403), (sessionUser, 403))
        ),
        (
          Some(TeamApiKeyVisibility.User),
          Map((sessionAdmin, 200), (sessionApiEditor, 403), (sessionUser, 403))
        ),
        (
          None,
          Map((sessionAdmin, 200), (sessionApiEditor, 403), (sessionUser, 403))
        )
      )

      matrixOfMatrix.foreachEntry((maybeVisibility, matrix) => {
        val resp = {
          httpJsonCallBlocking(
            path = s"/api/teams/${teamOwnerId.value}",
            method = "PUT",
            body =
              Some(teamConsumer.copy(apiKeyVisibility = maybeVisibility).asJson)
          )(using tenant, sessionAdmin)
        }
        resp.status mustBe 200

        matrix.foreachEntry((session, response) => {
          val rdmName = Random.alphanumeric.take(10).mkString
          val respUpdate = httpJsonCallBlocking(
            path =
              s"/api/teams/${teamConsumerId.value}/subscriptions/${sub.id.value}/name",
            method = "POST",
            body = Some(Json.obj("customName" -> rdmName))
          )(using tenant, session)
          respUpdate.status mustBe response

          if (response == 200) {
            val respSubs = httpJsonCallBlocking(
              path =
                s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
            )(using tenant, session)
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
    //    //        integrationToken = "test"
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
    //        clientId = keyring.apiKey.clientId,
    //        clientSecret = keyring.apiKey.clientSecret,
    //        clientName = keyring.apiKey.clientName,
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
    //      val path = otoroshiDeleteApikeyPath(keyring.apiKey.clientId)
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
    //      val otoPathQuotas = otoroshiPathApiKeyQuotas(keyring.apiKey.clientId)
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
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        otoroshiSettings = KeyringOtoroshiBinding.Internal,
        createdAt = DateTime.now(),
        integrationToken = "test"
      )
      val sub = ApiSubscription(
        id = subId,
        tenant = tenant.id,
        plan = payPerUsePlanId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
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
        subscriptions = Seq(sub),
        keyrings = Seq(keyring)
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
        clientId = keyring.apiKey.clientId,
        clientSecret = keyring.apiKey.clientSecret,
        clientName = keyring.apiKey.clientName,
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

      val path = otoroshiUpdateApikeyPath(keyring.apiKey.clientId)

      val apiKeyPath = otoroshiGetApikeyPath(otoApiKey.clientId)

      val matrixOfMatrix = Map(
        (
          Some(TeamApiKeyVisibility.Administrator),
          Map((sessionAdmin, 200), (sessionApiEditor, 403), (sessionUser, 403))
        ),
        (
          Some(TeamApiKeyVisibility.ApiEditor),
          Map((sessionAdmin, 200), (sessionApiEditor, 403), (sessionUser, 403))
        ),
        (
          Some(TeamApiKeyVisibility.User),
          Map((sessionAdmin, 200), (sessionApiEditor, 403), (sessionUser, 403))
        ),
        (
          None,
          Map((sessionAdmin, 200), (sessionApiEditor, 403), (sessionUser, 403))
        )
      )

      matrixOfMatrix.foreachEntry((maybeVisibility, matrix) => {
        val resp = {
          httpJsonCallBlocking(
            path = s"/api/teams/${teamOwnerId.value}",
            method = "PUT",
            body =
              Some(teamConsumer.copy(apiKeyVisibility = maybeVisibility).asJson)
          )(using tenant, sessionAdmin)
        }
        resp.status mustBe 200

        matrix.foreachEntry((session, response) => {
          val rdmName = Random.alphanumeric.take(10).mkString
          val respUpdate = httpJsonCallBlocking(
            path =
              s"/api/teams/${teamConsumerId.value}/keyrings/${keyring.id.value}/_refresh",
            method = "POST",
            body = Some(Json.obj("customName" -> rdmName))
          )(using tenant, session)
          respUpdate.status mustBe response
        })
      })
    }
  }

}
