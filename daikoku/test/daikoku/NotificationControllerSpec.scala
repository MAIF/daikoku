package fr.maif.otoroshi.daikoku.tests

import cats.implicits.catsSyntaxOptionId
import fr.maif.otoroshi.daikoku.domain.ApiVisibility.PublicWithAuthorizations
import fr.maif.otoroshi.daikoku.domain.NotificationAction.{ApiAccess, ApiSubscriptionDemand, NewPostPublished, TeamAccess, TeamInvitation}
import fr.maif.otoroshi.daikoku.domain.NotificationStatus.{Accepted, Pending}
import fr.maif.otoroshi.daikoku.domain.NotificationType.AcceptOrReject
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain.UsagePlan.QuotasWithLimits
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json._
import fr.maif.otoroshi.daikoku.tests.utils.{DaikokuSpecHelper, OneServerPerSuiteWithMyComponents}
import org.joda.time.DateTime
import org.scalatest.BeforeAndAfterEach
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.{Format, JsArray, JsBoolean, JsError, JsNull, JsNumber, JsObject, JsResult, JsString, JsSuccess, JsValue, Json, Reads, Writes}
import reactivemongo.bson.BSONObjectID

import scala.util.Try

class NotificationControllerSpec()
    extends PlaySpec
    with OneServerPerSuiteWithMyComponents
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfterEach {

  val treatedNotification = Notification(
    id = NotificationId("treated-notification"),
    tenant = tenant.id,
    team = Some(teamOwnerId),
    sender = user,
    notificationType = AcceptOrReject,
    action = ApiAccess(defaultApi.id, teamConsumerId),
    status = Accepted()
  )
  val untreatedNotification = Notification(
    id = NotificationId("untreated-notification"),
    tenant = tenant.id,
    team = Some(teamOwnerId),
    sender = user,
    notificationType = AcceptOrReject,
    action = ApiAccess(defaultApi.id, teamConsumerId)
  )

  val ApiSubscriptionSafeFormat = new Format[ApiSubscription] {
    override def reads(json: JsValue): JsResult[ApiSubscription] =
      Try {
        JsSuccess(
          ApiSubscription(
            id = (json \ "_id").as(ApiSubscriptionIdFormat),
            tenant = (json \ "_tenant").as(TenantIdFormat),
            deleted = (json \ "_deleted").asOpt[Boolean].getOrElse(false),
            apiKey = OtoroshiApiKey("***", "***", "***"),
            plan = (json \ "plan").as(UsagePlanIdFormat),
            team = (json \ "team").as(TeamIdFormat),
            api = (json \ "api").as(ApiIdFormat),
            createdAt = (json \ "createdAt").as(DateTimeFormat),
            by = (json \ "by").as(UserIdFormat),
            customName = (json \ "customName").asOpt[String],
            enabled = (json \ "enabled").asOpt[Boolean].getOrElse(true),
            rotation = (json \ "rotation").asOpt(ApiSubscriptionyRotationFormat),
            integrationToken = "***",
            customMetadata = (json \ "customMetadata").asOpt[JsObject],
            customMaxPerSecond = (json \ "customMaxPerSecond").asOpt(LongFormat),
            customMaxPerDay = (json \ "customMaxPerDay").asOpt(LongFormat),
            customMaxPerMonth = (json \ "customMaxPerMonth").asOpt(LongFormat),
            customReadOnly = (json \ "customReadOnly").asOpt[Boolean]
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: ApiSubscription): JsValue = Json.obj(
      "_id" -> ApiSubscriptionIdFormat.writes(o.id),
      "_tenant" -> o.tenant.asJson,
      "_deleted" -> o.deleted,
      "apiKey" -> OtoroshiApiKeyFormat.writes(o.apiKey),
      "plan" -> UsagePlanIdFormat.writes(o.plan),
      "team" -> TeamIdFormat.writes(o.team),
      "api" -> ApiIdFormat.writes(o.api),
      "createdAt" -> DateTimeFormat.writes(o.createdAt),
      "by" -> UserIdFormat.writes(o.by),
      "customName" -> o.customName
        .map(id => JsString(id))
        .getOrElse(JsNull)
        .as[JsValue],
      "enabled" -> o.enabled,
      "rotation" -> o.rotation
        .map(ApiSubscriptionyRotationFormat.writes)
        .getOrElse(JsNull)
        .as[JsValue],
      "integrationToken" -> o.integrationToken,
      "customMetadata" -> o.customMetadata,
      "customMaxPerSecond" -> o.customMaxPerSecond
        .map(JsNumber(_))
        .getOrElse(JsNull)
        .as[JsValue],
      "customMaxPerDay" -> o.customMaxPerDay
        .map(JsNumber(_))
        .getOrElse(JsNull)
        .as[JsValue],
      "customMaxPerMonth" -> o.customMaxPerMonth
        .map(JsNumber(_))
        .getOrElse(JsNull)
        .as[JsValue],
      "customReadOnly" -> o.customReadOnly
        .map(JsBoolean.apply)
        .getOrElse(JsNull)
        .as[JsValue]
    )
  }
  val SeqApiSubscriptionSafeFormat =
    Format(Reads.seq(ApiSubscriptionSafeFormat),
           Writes.seq(ApiSubscriptionSafeFormat))

  "a team admin" can {
    "read the count of untreated notifications of his team" in {
      setupEnv(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        notifications = Seq(treatedNotification, untreatedNotification)
      ).map(_ => {
        val session = loginWithBlocking(userAdmin, tenant)
        val resp = httpJsonCallBlocking(
          s"/api/teams/${teamOwnerId.value}/notifications/unread-count")(tenant,
                                                                         session)
        resp.status mustBe 200
        (resp.json \ "count").as[Long] mustBe 1
      })

    }
    "read notifications of his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        s"/api/teams/${teamOwnerId.value}/notifications/all")(tenant, session)
      resp.status mustBe 200
      (resp.json \ "count").as[Long] mustBe 2
    }
    "read untreated notifications of his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        s"/api/teams/${teamOwnerId.value}/notifications")(tenant, session)
      resp.status mustBe 200
      (resp.json \ "count").as[Long] mustBe 1
      val eventualNotifications = json.SeqNotificationFormat.reads(
        (resp.json \ "notifications").as[JsArray])
      eventualNotifications.isSuccess mustBe true
      eventualNotifications.get.head.id mustBe untreatedNotification.id
      eventualNotifications.get.forall(_.status == Pending()) mustBe true
    }
    "read his count of notifications" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp =
        httpJsonCallBlocking(s"/api/me/notifications/unread-count")(tenant,
                                                                    session)
      resp.status mustBe 200
      (resp.json \ "count").as[Long] mustBe 1
    }
    "read his notifications" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp =
        httpJsonCallBlocking(s"/api/me/notifications/all")(tenant, session)
      resp.status mustBe 200
      (resp.json \ "count").as[Long] mustBe 2
    }
    "read his untreated notifications" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(s"/api/me/notifications")(tenant, session)
      resp.status mustBe 200
      (resp.json \ "count").as[Long] mustBe 1
      val eventualNotifications = json.SeqNotificationFormat.reads(
        (resp.json \ "notifications").as[JsArray])
      eventualNotifications.isSuccess mustBe true
      eventualNotifications.get.head.id mustBe untreatedNotification.id
      eventualNotifications.get.forall(_.status == Pending()) mustBe true
    }
    "receive a notification - api issue" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user),
        teams = Seq(
          teamOwner,
          teamConsumer.copy(users = Set(UserWithPermission(userId = user.id, teamPermission = TeamPermission.Administrator)))),
        apis = Seq(
          defaultApi),


      )

      val userSession = loginWithBlocking(user, tenant)
      val issue = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.humanReadableId}/issues",
        method = "POST",
        body = Some(ApiIssue(
          id = ApiIssueId(BSONObjectID.generate().stringify),
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
          apiVersion = defaultApi.currentVersion.value.some,
        ).asJson)
      )(tenant, userSession )
      issue.status mustBe 201
      (issue.json \ "created").as[Boolean] mustBe true
      val adminSession = loginWithBlocking(userAdmin, tenant)
      val countNotification =
        httpJsonCallBlocking(s"/api/me/notifications/unread-count")(tenant,
          adminSession)
      countNotification.status mustBe 200
      (countNotification.json \ "count").as[Long] mustBe 1

    }
    "reveive a notification - post created" in {
      val sub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = UsagePlanId("1"),
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
        users = Seq(userAdmin, user),
        teams = Seq(teamOwner, teamConsumer.copy(users = Set(UserWithPermission(user.id, Administrator)))),
        apis = Seq(
          defaultApi),
        subscriptions = Seq(
          sub
        ),
      )
      val userAdminSession = loginWithBlocking(userAdmin, tenant)
      val post = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}/posts",
        method = "POST",
        body = Some(ApiPost(
          id = ApiPostId(BSONObjectID.generate().stringify),
          tenant = tenant.id,
          title = "",
          lastModificationAt = DateTime.now(),
          content = ""
        ).asJson)
      )(tenant, userAdminSession )

      post.status mustBe 200
      (post.json \ "created").as[Boolean] mustBe true

      val userSession = loginWithBlocking(user, tenant)
      val countNotification =
        httpJsonCallBlocking(s"/api/me/notifications/unread-count")(tenant,
          userSession)
      countNotification.status mustBe 200
      (countNotification.json \ "count").as[Long] mustBe 1
    }
    "accept notification - team access" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(
          teamOwner.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator)))),
        apis = Seq(defaultApi),
        notifications =
          Seq(untreatedNotification.copy(action = TeamAccess(teamOwnerId)))
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/notifications/${untreatedNotification.id.value}/accept",
        method = "PUT",
        body = Some(Json.obj())
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      val respVerif =
        httpJsonCallBlocking(s"/api/teams/${teamOwnerId.value}")(tenant,
                                                                 session)
      respVerif.status mustBe 200
      val eventualTeam = json.TeamFormat.reads(respVerif.json)
      eventualTeam.isSuccess mustBe true
      eventualTeam.get.users.size mustBe 2
      eventualTeam.get.users.exists(_.userId == userTeamUserId) mustBe true
    }
    "reject notification - team access" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(
          teamOwner.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator)))),
        apis = Seq(defaultApi),
        notifications =
          Seq(untreatedNotification.copy(action = TeamAccess(teamOwnerId)))
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/notifications/${untreatedNotification.id.value}/reject",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      val respVerif =
        httpJsonCallBlocking(s"/api/teams/${teamOwnerId.value}")(tenant,
                                                                 session)
      respVerif.status mustBe 200
      val eventualTeam = json.TeamFormat.reads(respVerif.json)
      eventualTeam.isSuccess mustBe true
      eventualTeam.get.users.size mustBe 1
      eventualTeam.get.users.exists(_.userId == userTeamUserId) mustBe false
    }
    "accept notification - api access" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamConsumer, teamOwner),
        apis = Seq(defaultApi.copy(visibility = PublicWithAuthorizations)),
        notifications = Seq(
          untreatedNotification.copy(
            action = ApiAccess(defaultApi.id, teamConsumerId)))
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/notifications/${untreatedNotification.id.value}/accept",
        method = "PUT",
        body = Some(Json.obj())
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      val respVerif =
        httpJsonCallBlocking(
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.humanReadableId}/${defaultApi.currentVersion.value}")(
          tenant,
          session)
      respVerif.status mustBe 200
      val eventualApi = json.ApiFormat.reads(respVerif.json)
      eventualApi.isSuccess mustBe true
      eventualApi.get.authorizedTeams.size mustBe 1
      eventualApi.get.authorizedTeams.contains(teamConsumerId) mustBe true
    }
    "reject notification - api access" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamConsumer, teamOwner),
        apis = Seq(defaultApi.copy(visibility = PublicWithAuthorizations)),
        notifications = Seq(
          untreatedNotification.copy(
            action = ApiAccess(defaultApi.id, teamConsumerId)))
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/notifications/${untreatedNotification.id.value}/reject",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      val respVerif =
        httpJsonCallBlocking(
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}/${defaultApi.currentVersion.value}")(
          tenant,
          session)
      respVerif.status mustBe 200
      val eventualApi = json.ApiFormat.reads(respVerif.json)
      eventualApi.isSuccess mustBe true
      eventualApi.get.authorizedTeams.size mustBe 0
      eventualApi.get.authorizedTeams.contains(teamConsumerId) mustBe false
    }
    "accept notification - api subscription" in {
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
              OtoroshiTarget(OtoroshiSettingsId("default"),
                             Some(AuthorizedEntities(groups =
                               Set(OtoroshiServiceGroupId("12345")))))
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
                                           teamConsumerId,
                                           motivation = Some("motivation")))
        )
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/notifications/${untreatedNotification.id.value}/accept",
        method = "PUT",
        body = Some(Json.obj())
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      val respVerif =
        httpJsonCallBlocking(
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}/${defaultApi.currentVersion.value}/subscriptions")(
          tenant,
          session)
      respVerif.status mustBe 200
      val eventualApiSubs: JsResult[Seq[ApiSubscription]] =
        SeqApiSubscriptionSafeFormat.reads(respVerif.json)
      eventualApiSubs.isSuccess mustBe true
      eventualApiSubs.get.size mustBe 1
    }
    "reject notification - api subscription" in {
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
              OtoroshiTarget(OtoroshiSettingsId("default"),
                             Some(AuthorizedEntities(groups =
                               Set(OtoroshiServiceGroupId("12345")))))
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
                                           teamConsumerId,
                                           motivation = Some("motivation")))
        )
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/notifications/${untreatedNotification.id.value}/reject",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      val respVerif =
        httpJsonCallBlocking(
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}/${defaultApi.currentVersion.value}/subscriptions")(
          tenant,
          session)
      respVerif.status mustBe 200
      logger.warn(Json.prettyPrint(respVerif.json))
      val eventualApiSubs: JsResult[Seq[ApiSubscription]] =
        SeqApiSubscriptionSafeFormat.reads(respVerif.json)
      eventualApiSubs.isSuccess mustBe true
      eventualApiSubs.get.size mustBe 0
    }
  }

  "a daikoku admin" can {
    "read the count of untreated notifications of a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp = httpJsonCallBlocking(
        s"/api/teams/${teamOwnerId.value}/notifications/unread-count")(tenant,
                                                                       session)
      resp.status mustBe 200
      (resp.json \ "count").as[Long] mustBe 1

    }
    "read notifications of a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp = httpJsonCallBlocking(
        s"/api/teams/${teamOwnerId.value}/notifications/all")(tenant, session)
      resp.status mustBe 200
      (resp.json \ "count").as[Long] mustBe 2
    }
    "read untreated notifications of a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp = httpJsonCallBlocking(
        s"/api/teams/${teamOwnerId.value}/notifications")(tenant, session)
      resp.status mustBe 200
      (resp.json \ "count").as[Long] mustBe 1
      val eventualNotifications = json.SeqNotificationFormat.reads(
        (resp.json \ "notifications").as[JsArray])
      eventualNotifications.isSuccess mustBe true
      eventualNotifications.get.head.id mustBe untreatedNotification.id
      eventualNotifications.get.forall(_.status == Pending()) mustBe true
    }
    "accept notification - team access" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, userAdmin),
        teams = Seq(
          teamOwner.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator)))),
        apis = Seq(defaultApi),
        notifications =
          Seq(untreatedNotification.copy(action = TeamAccess(teamOwnerId)))
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/notifications/${untreatedNotification.id.value}/accept",
        method = "PUT",
        body = Some(Json.obj())
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      val respVerif =
        httpJsonCallBlocking(s"/api/teams/${teamOwnerId.value}")(tenant,
                                                                 session)
      respVerif.status mustBe 200
      val eventualTeam = json.TeamFormat.reads(respVerif.json)
      eventualTeam.isSuccess mustBe true
      eventualTeam.get.users.size mustBe 2
      eventualTeam.get.users.exists(_.userId == userTeamUserId) mustBe true
    }
    "reject notification - team access" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(
          teamOwner.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator)))),
        apis = Seq(defaultApi),
        notifications =
          Seq(untreatedNotification.copy(action = TeamAccess(teamOwnerId)))
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/notifications/${untreatedNotification.id.value}/reject",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      val respVerif =
        httpJsonCallBlocking(s"/api/teams/${teamOwnerId.value}")(tenant,
                                                                 session)
      respVerif.status mustBe 200
      val eventualTeam = json.TeamFormat.reads(respVerif.json)
      eventualTeam.isSuccess mustBe true
      eventualTeam.get.users.size mustBe 1
      eventualTeam.get.users.exists(_.userId == userTeamUserId) mustBe false
    }
    "accept notification - api access" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(teamConsumer, teamOwner),
        apis = Seq(defaultApi.copy(visibility = PublicWithAuthorizations)),
        notifications = Seq(
          untreatedNotification.copy(
            action = ApiAccess(defaultApi.id, teamConsumerId)))
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/notifications/${untreatedNotification.id.value}/accept",
        method = "PUT",
        body = Some(Json.obj())
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      val respVerif =
        httpJsonCallBlocking(
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}/${defaultApi.currentVersion.value}")(
          tenant,
          session)
      respVerif.status mustBe 200
      val eventualApi = json.ApiFormat.reads(respVerif.json)
      eventualApi.isSuccess mustBe true
      eventualApi.get.authorizedTeams.size mustBe 1
      eventualApi.get.authorizedTeams.contains(teamConsumerId) mustBe true
    }
    "reject notification - api access" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(teamConsumer, teamOwner),
        apis = Seq(defaultApi.copy(visibility = PublicWithAuthorizations)),
        notifications = Seq(
          untreatedNotification.copy(
            action = ApiAccess(defaultApi.id, teamConsumerId)))
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/notifications/${untreatedNotification.id.value}/reject",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      val respVerif =
        httpJsonCallBlocking(
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}/${defaultApi.currentVersion.value}")(
          tenant,
          session)
      respVerif.status mustBe 200
      val eventualApi = json.ApiFormat.reads(respVerif.json)
      eventualApi.isSuccess mustBe true
      eventualApi.get.authorizedTeams.size mustBe 0
      eventualApi.get.authorizedTeams.contains(teamConsumerId) mustBe false
    }
    "accept notification - api subscription" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
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
              OtoroshiTarget(OtoroshiSettingsId("default"),
                             Some(AuthorizedEntities(groups =
                               Set(OtoroshiServiceGroupId("12345")))))
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
                                           teamConsumerId,
                                           motivation = Some("motivation")))
        )
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/notifications/${untreatedNotification.id.value}/accept",
        method = "PUT",
        body = Some(Json.obj())
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      val respVerif =
        httpJsonCallBlocking(
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}/${defaultApi.currentVersion.value}/subscriptions")(
          tenant,
          session)
      respVerif.status mustBe 200
      val eventualApiSubs: JsResult[Seq[ApiSubscription]] =
        SeqApiSubscriptionSafeFormat.reads(respVerif.json)
      eventualApiSubs.isSuccess mustBe true
      eventualApiSubs.get.size mustBe 1
    }
    "reject notification - api subscription" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
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
              OtoroshiTarget(OtoroshiSettingsId("default"),
                             Some(AuthorizedEntities(groups =
                               Set(OtoroshiServiceGroupId("12345")))))
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
                                           teamConsumerId,
                                           motivation = Some("motivation")))
        )
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/notifications/${untreatedNotification.id.value}/reject",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      val respVerif =
        httpJsonCallBlocking(
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}/${defaultApi.currentVersion.value}/subscriptions")(
          tenant,
          session)
      respVerif.status mustBe 200
      val eventualApiSubs: JsResult[Seq[ApiSubscription]] =
        SeqApiSubscriptionSafeFormat.reads(respVerif.json)
      eventualApiSubs.isSuccess mustBe true
      eventualApiSubs.get.size mustBe 0
    }
    "create issue that notify subscribers of api" in {
      val issues = Seq(
        ApiIssue(
          id = ApiIssueId(BSONObjectID.generate().stringify),
          seqId = 0,
          tenant = tenant.id,
          title = "Daikoku Init on postgres can be broken",
          tags = Set(),
          open = true,
          createdAt = DateTime.now(),
          lastModificationAt = DateTime.now(),
          closedAt = None,
          by = daikokuAdmin.id,
          comments = Seq(
            ApiIssueComment(
              by = daikokuAdmin.id,
              createdAt = DateTime.now(),
              lastModificationAt = DateTime.now(),
              content =
                "Describe the bug\nIf schema has some table, DK init can't be proceed & DK is broken\n\nExpected behavior\nInit detection & tables creation"
            )
          )
        ))
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
        users = Seq(daikokuAdmin),
        teams = Seq(teamOwner, teamConsumer),
        issues = issues,
        apis = Seq(defaultApi),
        subscriptions = Seq(sub)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumer.id.value}/apis/${defaultApi.humanReadableId}/issues",
        method = "POST",
        body = Some(issues.head.asJson))(
        tenant,
        session
      )

      resp.status mustBe 201

      val notificationsResp = httpJsonCallBlocking(
        s"/api/teams/${teamConsumer.id.value}/notifications/all")(
        tenant,
        session
      )
      notificationsResp.status mustBe 200
      (notificationsResp.json \ "count").as[Long] mustBe 1

      val notifications = (notificationsResp.json \ "notifications").as[JsArray]
      (notifications.head \ "action" \ "type").asOpt[String] mustBe Some(
        "NewIssueOpen")
    }
  }

  "a user/api editor" can {
    "not read the count of untreated notifications of his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(
        s"/api/teams/${teamOwnerId.value}/notifications/unread-count")(tenant,
                                                                       session)
      resp.status mustBe 403
    }
    "not read notifications of his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(
        s"/api/teams/${teamOwnerId.value}/notifications/all")(tenant, session)
      resp.status mustBe 403
    }
    "not read untreated notifications of his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(
        s"/api/teams/${teamOwnerId.value}/notifications")(tenant, session)
      resp.status mustBe 403
    }
    "read his count of notifications" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(user, tenant)
      val resp =
        httpJsonCallBlocking(s"/api/me/notifications/unread-count")(tenant,
                                                                    session)
      resp.status mustBe 200
      (resp.json \ "count").as[Long] mustBe 0
    }
    "read his notifications" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(user, tenant)
      val resp =
        httpJsonCallBlocking(s"/api/me/notifications/all")(tenant, session)
      resp.status mustBe 200
      (resp.json \ "count").as[Long] mustBe 0
    }
    "read his untreated notifications" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(s"/api/me/notifications")(tenant, session)
      resp.status mustBe 200
      (resp.json \ "count").as[Long] mustBe 0
    }
    "not accept any \"team\" notification except teamInvitation" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user, userAdmin),
        teams = Seq(
          teamConsumer.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator))),
          teamOwner.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator)))
        ),
        apis = Seq(defaultApi),
        notifications = Seq(
          untreatedNotification.copy(action = TeamAccess(teamOwnerId)),
          Notification(
            id = NotificationId("untreated-team-invitation"),
            tenant = tenant.id,
            team = None,
            sender = userAdmin,
            notificationType = AcceptOrReject,
            action = TeamInvitation(teamConsumerId, user.id)
          )
        )
      )
      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/notifications/${untreatedNotification.id.value}/accept",
        method = "PUT",
        body = Some(Json.obj())
      )(tenant, session)
      resp.status mustBe 403

      val respInvit = httpJsonCallBlocking(
        path = s"/api/notifications/untreated-team-invitation/accept",
        method = "PUT",
        body = Some(Json.obj())
      )(tenant, session)
      respInvit.status mustBe 200

      val adminSession = loginWithBlocking(userAdmin, tenant)
      val getTeam = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/_full"
      )(tenant, adminSession)
      getTeam.status mustBe 200
      val maybeUsers =
        fr.maif.otoroshi.daikoku.domain.json.SetUserWithPermissionFormat
          .reads((getTeam.json \ "users").as[JsArray])

      maybeUsers.isSuccess mustBe true
      maybeUsers.get.size mustBe 2
      maybeUsers.get.exists(value => value.userId == user.id) mustBe true
    }
    "not reject any notification exept teamInvitation" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user, userAdmin),
        teams = Seq(
          teamConsumer.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator))),
          teamOwner.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator)))
        ),
        apis = Seq(defaultApi),
        notifications = Seq(
          untreatedNotification.copy(action = TeamAccess(teamOwnerId)),
          Notification(
            id = NotificationId("untreated-team-invitation"),
            tenant = tenant.id,
            team = None,
            sender = userAdmin,
            notificationType = AcceptOrReject,
            action = TeamInvitation(teamConsumerId, user.id)
          )
        )
      )
      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/notifications/${untreatedNotification.id.value}/reject",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 403

      val respInvit = httpJsonCallBlocking(
        path = s"/api/notifications/untreated-team-invitation/reject",
        method = "PUT"
      )(tenant, session)
      respInvit.status mustBe 200

      val adminSession = loginWithBlocking(userAdmin, tenant)
      val getTeam = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumer.id.value}/_full"
      )(tenant, adminSession)
      getTeam.status mustBe 200
      val maybeUsers =
        fr.maif.otoroshi.daikoku.domain.json.SetUserWithPermissionFormat
          .reads((getTeam.json \ "users").as[JsArray])

      maybeUsers.isSuccess mustBe true
      maybeUsers.get.size mustBe 1
      maybeUsers.get.exists(value => value.userId == user.id) mustBe false
    }

  }

}
