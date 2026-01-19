package fr.maif.otoroshi.daikoku.tests

import cats.implicits.catsSyntaxOptionId
import fr.maif.otoroshi.daikoku.domain.ApiVisibility.PublicWithAuthorizations
import fr.maif.otoroshi.daikoku.domain.NotificationAction._
import fr.maif.otoroshi.daikoku.domain.NotificationStatus.{Accepted, Pending}
import fr.maif.otoroshi.daikoku.domain.NotificationType.AcceptOrReject
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json._
import fr.maif.otoroshi.daikoku.login.AuthProvider
import fr.maif.otoroshi.daikoku.tests.utils.DaikokuSpecHelper
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import fr.maif.otoroshi.daikoku.utils.LoggerImplicits.BetterLogger
import org.joda.time.DateTime
import org.mindrot.jbcrypt.BCrypt
import org.scalatest.BeforeAndAfterEach
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import play.api.libs.json._

import scala.concurrent.Await
import scala.concurrent.duration.DurationInt
import scala.util.Try

class NotificationControllerSpec()
    extends PlaySpec
//    with OneServerPerSuiteWithMyComponents
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfterEach {

  val treatedNotification: Notification = Notification(
    id = NotificationId("treated-notification"),
    tenant = tenant.id,
    team = Some(teamOwnerId),
    sender = user.asNotificationSender,
    notificationType = AcceptOrReject,
    action = ApiAccess(defaultApi.api.id, teamConsumerId),
    status = Accepted()
  )
  val untreatedNotification: Notification = Notification(
    id = NotificationId("untreated-notification"),
    tenant = tenant.id,
    team = Some(teamOwnerId),
    sender = user.asNotificationSender,
    notificationType = AcceptOrReject,
    action = ApiAccess(defaultApi.api.id, teamConsumerId)
  )

  val ApiSubscriptionSafeFormat: Format[ApiSubscription] =
    new Format[ApiSubscription] {
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
              rotation =
                (json \ "rotation").asOpt(ApiSubscriptionyRotationFormat),
              integrationToken = "***",
              customMetadata = (json \ "customMetadata").asOpt[JsObject],
              customMaxPerSecond =
                (json \ "customMaxPerSecond").asOpt(LongFormat),
              customMaxPerDay = (json \ "customMaxPerDay").asOpt(LongFormat),
              customMaxPerMonth =
                (json \ "customMaxPerMonth").asOpt(LongFormat),
              customReadOnly = (json \ "customReadOnly").asOpt[Boolean]
            )
          )
        } recover {
          case e => JsError(e.getMessage)
        } get
      override def writes(o: ApiSubscription): JsValue =
        Json.obj(
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
  val SeqApiSubscriptionSafeFormat: Format[Seq[ApiSubscription]] =
    Format(
      Reads.seq(ApiSubscriptionSafeFormat),
      Writes.seq(ApiSubscriptionSafeFormat)
    )

  val baseGraphQLQuery =
    s"""
       |query getMyNotifications ($$limit : Int, $$offset: Int, $$filterTable: JsArray) {
       |      myNotifications (limit: $$limit, offset: $$offset, filterTable: $$filterTable) {
       |        notifications {
       |          _id
       |          team {
       |            _id
       |          }
       |          action {
       |            __typename
       |          }
       |          status {
       |            ... on NotificationStatusAccepted {
       |            __typename
       |              date
       |              status
       |            }
       |            ... on NotificationStatusRejected {
       |            __typename
       |              date
       |              status
       |            }
       |            ... on NotificationStatusPending {
       |            __typename
       |              status
       |            }
       |
       |          }
       |        }
       |        total,
       |        totalFiltered,
       |       }
       |}
       |""".stripMargin

  def graphQLNotificationCallBlocking(
      extraFilters: JsObject = Json.obj()
  )(implicit tenant: Tenant, session: UserSession) = {
    val variables = Json.obj("limit" -> 20, "offset" -> 0) ++ extraFilters

    httpJsonCallBlocking(
      path = "/api/search",
      method = "POST",
      body = Json
        .obj(
          "variables" -> variables,
          "query" -> baseGraphQLQuery
        )
        .some
    )
  }

  //FIXME: use graphql query to get notification, previous apis does not exist anymore

  "a team admin" can {
    "read the count of untreated notifications of his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi.api),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = graphQLNotificationCallBlocking(
        Json.obj(
          "filterTable" -> Json.stringify(
            Json.arr(
              Json
                .obj("id" -> "unreadOnly", "value" -> true)
            )
          )
        )
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "data" \ "myNotifications" \ "totalFiltered")
        .as[Long] mustBe 1
    }
    "read notifications of his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi.api),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = graphQLNotificationCallBlocking(extraFilters =
        Json.obj(
          "filterTable" -> Json.stringify(
            Json.arr(
              Json
                .obj("id" -> "team", "value" -> Json.arr(teamOwnerId.asJson))
            )
          )
        )
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "data" \ "myNotifications" \ "totalFiltered")
        .as[Long] mustBe 2
    }
    "read untreated notifications of his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi.api),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = graphQLNotificationCallBlocking(
        Json.obj(
          "filterTable" -> Json.stringify(
            Json.arr(
              Json.obj("id" -> "unreadOnly", "value" -> true),
              Json.obj("id" -> "team", "value" -> Json.arr(teamOwnerId.asJson))
            )
          )
        )
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "data" \ "myNotifications" \ "total").as[Long] mustBe 1
      val notification =
        (resp.json \ "data" \ "myNotifications" \ "notifications").as[JsArray]
      (notification.head \ "_id")
        .as(json.NotificationIdFormat) mustBe untreatedNotification.id
      notification.value.forall(n =>
        (n \ "status").as(json.NotificationStatusFormat) == Pending()
      ) mustBe true
    }

    "read his count of notifications" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi.api),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp =
        httpJsonCallBlocking(s"/api/me/notifications/unread-count")(
          tenant,
          session
        )
      resp.status mustBe 200
      (resp.json \ "count").as[Long] mustBe 1
    }
    "read his notifications" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi.api),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = graphQLNotificationCallBlocking()(tenant, session)
      resp.status mustBe 200
      (resp.json \ "data" \ "myNotifications" \ "total").as[Long] mustBe 2
    }
    "read his untreated notifications" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi.api),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = graphQLNotificationCallBlocking(
        Json.obj(
          "filterTable" -> Json.stringify(
            Json.arr(
              Json.obj("id" -> "unreadOnly", "value" -> true)
            )
          )
        )
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "data" \ "myNotifications" \ "total").as[Long] mustBe 1

      val notification =
        (resp.json \ "data" \ "myNotifications" \ "notifications").as[JsArray]
      (notification.head \ "_id")
        .as(json.NotificationIdFormat) mustBe untreatedNotification.id
      notification.value.forall(n =>
        (n \ "status").as(json.NotificationStatusFormat) == Pending()
      ) mustBe true
    }
    "receive a notification - api issue" in {
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
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.humanReadableId}/issues",
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
      issue.status mustBe 201
      (issue.json \ "created").as[Boolean] mustBe true
      val adminSession = loginWithBlocking(userAdmin, tenant)
      val countNotification =
        httpJsonCallBlocking(s"/api/me/notifications/unread-count")(
          tenant,
          adminSession
        )
      countNotification.status mustBe 200
      (countNotification.json \ "count").as[Long] mustBe 1

      val resp = graphQLNotificationCallBlocking(
        Json.obj(
          "filterTable" -> Json.stringify(
            Json.arr(
              Json.obj("id" -> "unreadOnly", "value" -> true)
            )
          )
        )
      )(tenant, adminSession)
      val notifications =
        (resp.json \ "data" \ "myNotifications" \ "notifications").as[JsArray]
      notifications.value.length mustBe 1
      (notifications.head \ "action" \ "__typename")
        .as[String] mustBe "NewIssueOpenV2"
    }
    "reveive a notification - post created" in {
      val sub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = UsagePlanId("1"),
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
        users = Seq(userAdmin, user),
        teams = Seq(
          teamOwner,
          teamConsumer.copy(
            users = Set(UserWithPermission(user.id, Administrator))
          )
        ),
        apis = Seq(defaultApi.api),
        subscriptions = Seq(
          sub
        )
      )
      val userAdminSession = loginWithBlocking(userAdmin, tenant)
      val post = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/posts",
        method = "POST",
        body = Some(
          ApiPost(
            id = ApiPostId(IdGenerator.token(32)),
            tenant = tenant.id,
            title = "",
            lastModificationAt = DateTime.now(),
            content = ""
          ).asJson
        )
      )(tenant, userAdminSession)

      post.status mustBe 200
      (post.json \ "created").as[Boolean] mustBe true

      val userSession = loginWithBlocking(user, tenant)
      val countNotification =
        httpJsonCallBlocking(s"/api/me/notifications/unread-count")(
          tenant,
          userSession
        )
      countNotification.status mustBe 200
      (countNotification.json \ "count").as[Long] mustBe 1

      val resp = graphQLNotificationCallBlocking(
        Json.obj(
          "filterTable" -> Json.stringify(
            Json.arr(
              Json.obj("id" -> "unreadOnly", "value" -> true)
            )
          )
        )
      )(tenant, userSession)
      val notifications =
        (resp.json \ "data" \ "myNotifications" \ "notifications").as[JsArray]
      notifications.value.length mustBe 1
      (notifications.head \ "action" \ "__typename")
        .as[String] mustBe "NewPostPublishedV2"
    }
    "accept notification - api access" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamConsumer, teamOwner),
        apis = Seq(defaultApi.api.copy(visibility = PublicWithAuthorizations)),
        notifications = Seq(
          untreatedNotification.copy(
            action = ApiAccess(defaultApi.api.id, teamConsumerId),
            sender = userAdmin.asNotificationSender
          )
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
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.humanReadableId}/${defaultApi.api.currentVersion.value}"
        )(tenant, session)
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
        apis = Seq(defaultApi.api.copy(visibility = PublicWithAuthorizations)),
        notifications = Seq(
          untreatedNotification.copy(
            sender = userAdmin.asNotificationSender,
            action = ApiAccess(defaultApi.api.id, teamConsumerId)
          )
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
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
        )(tenant, session)
      respVerif.status mustBe 200
      val eventualApi = json.ApiFormat.reads(respVerif.json)
      eventualApi.isSuccess mustBe true
      eventualApi.get.authorizedTeams.size mustBe 0
      eventualApi.get.authorizedTeams.contains(teamConsumerId) mustBe false
    }
    "accept notification - api subscription" in {
      val plan = UsagePlan(
        id = UsagePlanId(IdGenerator.token),
        tenant = tenant.id,
        maxPerDay = 10000L.some,
        maxPerMonth = 10000L.some,
        maxPerSecond = 10000L.some,
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
          ValidationStep.TeamAdmin(
            id = "step_1",
            team = defaultApi.api.team,
            title = "Admin"
          )
        ),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val demand = SubscriptionDemand(
        id = DemandId("1"),
        tenant = tenant.id,
        api = defaultApi.api.id,
        plan = plan.id,
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
        motivation = Json.obj("motivation" -> "test").some,
        parentSubscriptionId = None,
        customReadOnly = None,
        customMetadata = None,
        customMaxPerSecond = None,
        customMaxPerDay = None,
        customMaxPerMonth = None
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamConsumer, teamOwner),
        usagePlans = Seq(plan),
        apis = Seq(defaultApi.api.copy(possibleUsagePlans = Seq(plan.id))),
        subscriptionDemands = Seq(demand),
        notifications = Seq(
          untreatedNotification.copy(
            action = ApiSubscriptionDemand(
              defaultApi.api.id,
              plan.id,
              teamConsumerId,
              motivation = Some("motivation"),
              demand = demand.id,
              step = demand.steps.head.id
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
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      val respVerif =
        httpJsonCallBlocking(
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions"
        )(tenant, session)
      respVerif.status mustBe 200
      val eventualApiSubs: JsResult[Seq[ApiSubscription]] =
        SeqApiSubscriptionSafeFormat.reads(respVerif.json)
      eventualApiSubs.isSuccess mustBe true
      eventualApiSubs.get.size mustBe 1
    }
    "reject notification - api subscription" in {
      val process = Seq(
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
        subscriptionProcess = process,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )

      val demand = SubscriptionDemand(
        id = DemandId(IdGenerator.token),
        tenant = tenant.id,
        api = defaultApi.api.id,
        plan = plan.id,
        steps = process.map(s =>
          SubscriptionDemandStep(
            SubscriptionDemandStepId(s.id),
            SubscriptionDemandState.InProgress,
            s
          )
        ),
        state = SubscriptionDemandState.InProgress,
        team = teamConsumerId,
        from = userAdmin.id,
        date = DateTime.now().minusDays(1)
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamConsumer, teamOwner),
        usagePlans = Seq(plan),
        apis = Seq(defaultApi.api.copy(possibleUsagePlans = Seq(plan.id))),
        subscriptionDemands = Seq(demand),
        notifications = Seq(
          untreatedNotification.copy(
            sender = userAdmin.asNotificationSender,
            action = ApiSubscriptionDemand(
              defaultApi.api.id,
              plan.id,
              teamConsumerId,
              motivation = Some("hi hi"),
              demand = demand.id,
              step = demand.steps.head.id
            )
          )
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
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions"
        )(tenant, session)
      respVerif.status mustBe 200
      val eventualApiSubs: JsResult[Seq[ApiSubscription]] =
        SeqApiSubscriptionSafeFormat.reads(respVerif.json)
      eventualApiSubs.isSuccess mustBe true
      eventualApiSubs.get.size mustBe 0
    }
  }

  "a daikoku admin" can {
//    "read the count of untreated notifications of a team" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(daikokuAdmin),
//        teams = Seq(teamOwner, teamConsumer),
//        usagePlans = defaultApi.plans,
//        apis = Seq(defaultApi.api),
//        notifications = Seq(treatedNotification, untreatedNotification)
//      )
//      val session = loginWithBlocking(daikokuAdmin, tenant)
//
//      val resp = graphQLNotificationCallBlocking(Json.obj(
//        "filterTable" -> Json.stringify(
//          Json.arr(
//            Json.obj("id" -> "unreadOnly", "value" -> true),
//            Json.obj("id" -> "team", "value" -> Json.arr(teamOwnerId.asJson)),
//          )
//        )
//      ))(tenant, session)
//      resp.status mustBe 200
//      (resp.json \ "data" \ "myNotifications" \ "totalFiltered").as[Long] mustBe 1
//    }

//    "read notifications of a team" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(daikokuAdmin),
//        teams = Seq(teamOwner, teamConsumer),
//        usagePlans = defaultApi.plans,
//        apis = Seq(defaultApi.api),
//        notifications = Seq(treatedNotification, untreatedNotification)
//      )
//      val session = loginWithBlocking(daikokuAdmin, tenant)
//      val resp = httpJsonCallBlocking(
//        s"/api/teams/${teamOwnerId.value}/notifications/all"
//      )(tenant, session)
//      resp.status mustBe 200
//      (resp.json \ "count").as[Long] mustBe 2
//    }
//    "read untreated notifications of a team" in {
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(daikokuAdmin),
//        teams = Seq(teamOwner, teamConsumer),
//        usagePlans = defaultApi.plans,
//        apis = Seq(defaultApi.api),
//        notifications = Seq(treatedNotification, untreatedNotification)
//      )
//      val session = loginWithBlocking(daikokuAdmin, tenant)
//      val resp = httpJsonCallBlocking(
//        s"/api/teams/${teamOwnerId.value}/notifications"
//      )(tenant, session)
//      resp.status mustBe 200
//      (resp.json \ "count").as[Long] mustBe 1
//      val eventualNotifications = json.SeqNotificationFormat.reads(
//        (resp.json \ "notifications").as[JsArray]
//      )
//      eventualNotifications.isSuccess mustBe true
//      eventualNotifications.get.head.id mustBe untreatedNotification.id
//      eventualNotifications.get.forall(_.status == Pending()) mustBe true
//    }
    "accept notification - api access" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(teamConsumer, teamOwner),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api.copy(visibility = PublicWithAuthorizations)),
        notifications = Seq(
          untreatedNotification.copy(
            sender = userAdmin.asNotificationSender,
            action = ApiAccess(defaultApi.api.id, teamConsumerId)
          )
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
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
        )(tenant, session)
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
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api.copy(visibility = PublicWithAuthorizations)),
        notifications = Seq(
          untreatedNotification.copy(
            sender = daikokuAdmin.asNotificationSender,
            action = ApiAccess(defaultApi.api.id, teamConsumerId)
          )
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
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}"
        )(tenant, session)
      respVerif.status mustBe 200
      val eventualApi = json.ApiFormat.reads(respVerif.json)
      eventualApi.isSuccess mustBe true
      eventualApi.get.authorizedTeams.size mustBe 0
      eventualApi.get.authorizedTeams.contains(teamConsumerId) mustBe false
    }
    "accept notification - api subscription" in {
      val process = Seq(
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
        subscriptionProcess = process,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val demand = SubscriptionDemand(
        id = DemandId(IdGenerator.token),
        tenant = tenant.id,
        api = defaultApi.api.id,
        plan = plan.id,
        steps = process.map(s =>
          SubscriptionDemandStep(
            SubscriptionDemandStepId(s.id),
            SubscriptionDemandState.InProgress,
            s
          )
        ),
        state = SubscriptionDemandState.InProgress,
        team = teamConsumerId,
        from = userAdmin.id,
        date = DateTime.now().minusDays(1)
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, userAdmin),
        teams = Seq(teamConsumer, teamOwner),
        usagePlans = Seq(plan),
        apis = Seq(defaultApi.api.copy(possibleUsagePlans = Seq(plan.id))),
        subscriptionDemands = Seq(demand),
        notifications = Seq(
          untreatedNotification.copy(
            sender = daikokuAdmin.asNotificationSender,
            action = ApiSubscriptionDemand(
              defaultApi.api.id,
              plan.id,
              teamConsumerId,
              motivation = Some("motivation"),
              demand = demand.id,
              step = demand.steps.head.id
            )
          )
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
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions"
        )(tenant, session)
      respVerif.status mustBe 200
      val eventualApiSubs: JsResult[Seq[ApiSubscription]] =
        SeqApiSubscriptionSafeFormat.reads(respVerif.json)
      eventualApiSubs.isSuccess mustBe true
      eventualApiSubs.get.size mustBe 1
    }
    "reject notification - api subscription" in {
      val process = Seq(
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
          ValidationStep.TeamAdmin(
            id = IdGenerator.token,
            team = defaultApi.api.team,
            title = "Admin"
          )
        ),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val demand = SubscriptionDemand(
        id = DemandId(IdGenerator.token),
        tenant = tenant.id,
        api = defaultApi.api.id,
        plan = plan.id,
        steps = process.map(s =>
          SubscriptionDemandStep(
            SubscriptionDemandStepId(s.id),
            SubscriptionDemandState.InProgress,
            s
          )
        ),
        state = SubscriptionDemandState.InProgress,
        team = teamConsumerId,
        from = userAdmin.id,
        date = DateTime.now().minusDays(1)
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(teamConsumer, teamOwner),
        usagePlans = Seq(plan),
        apis = Seq(defaultApi.api.copy(possibleUsagePlans = Seq(plan.id))),
        notifications = Seq(
          untreatedNotification.copy(
            sender = daikokuAdmin.asNotificationSender,
            action = ApiSubscriptionDemand(
              defaultApi.api.id,
              plan.id,
              teamConsumerId,
              motivation = Some("motivation"),
              demand = demand.id,
              step = demand.steps.head.id
            )
          )
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
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions"
        )(tenant, session)
      respVerif.status mustBe 200
      val eventualApiSubs: JsResult[Seq[ApiSubscription]] =
        SeqApiSubscriptionSafeFormat.reads(respVerif.json)
      eventualApiSubs.isSuccess mustBe true
      eventualApiSubs.get.size mustBe 0
    }
    "create issue that notify subscribers of api" in {
      val issues = Seq(
        ApiIssue(
          id = ApiIssueId(IdGenerator.token(32)),
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
        )
      )
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
        users = Seq(daikokuAdmin, userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        subscriptions = Seq(sub)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)
      val ownerSession = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumer.id.value}/apis/${defaultApi.api.humanReadableId}/issues",
        method = "POST",
        body = Some(issues.head.asJson)
      )(
        tenant,
        session
      )

      resp.status mustBe 201

      val respNotifs = graphQLNotificationCallBlocking(
        Json.obj(
          "filterTable" -> Json.stringify(
            Json.arr(
              Json.obj("id" -> "unreadOnly", "value" -> true),
              Json
                .obj("id" -> "team", "value" -> Json.arr(teamConsumerId.asJson))
            )
          )
        )
      )(tenant, ownerSession)
      respNotifs.status mustBe 200
      (respNotifs.json \ "data" \ "myNotifications" \ "totalFiltered")
        .as[Long] mustBe 1

      val notifications =
        (respNotifs.json \ "data" \ "myNotifications" \ "notifications")
          .as[JsArray]
      notifications.value.length mustBe 1
      (notifications.head \ "action" \ "__typename")
        .as[String] mustBe "NewIssueOpenV2"
    }
    "create comment in issue that notify subscribers of api" in {
      val otherUser = User(
        id = UserId("other"),
        tenants = Set(Tenant.Default),
        origins = Set(AuthProvider.Local),
        name = "other",
        email = "other@gmail.com",
        lastTenant = None,
        personalToken = Some(IdGenerator.token(32)),
        password = Some(BCrypt.hashpw("password", BCrypt.gensalt())),
        defaultLanguage = None
      )
      val issue = ApiIssue(
        id = ApiIssueId(IdGenerator.token(32)),
        seqId = 0,
        tenant = tenant.id,
        title = "Daikoku Init on postgres can be broken",
        tags = Set(),
        open = true,
        createdAt = DateTime.now(),
        lastModificationAt = DateTime.now(),
        closedAt = None,
        by = user.id,
        comments = Seq(
          ApiIssueComment(
            by = user.id,
            createdAt = DateTime.now(),
            lastModificationAt = DateTime.now(),
            content =
              "Describe the bug\nIf schema has some table, DK init can't be proceed & DK is broken\n\nExpected behavior\nInit detection & tables creation"
          )
        )
      )

      val planSubId = UsagePlanId("1")
      val sub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = planSubId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = user.id,
        customName = Some("custom name"),
        rotation = None,
        integrationToken = "test"
      )
      val thirdTeam = teamConsumer.copy(
        id = TeamId("third"),
        name = "third team",
        description = "third team",
        users = Set(UserWithPermission(userApiEditor.id, Administrator))
      )

      val subThird = ApiSubscription(
        id = ApiSubscriptionId("test-3"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id3", "secret3"),
        plan = planSubId,
        createdAt = DateTime.now(),
        team = thirdTeam.id,
        api = defaultApi.api.id,
        by = userApiEditor.id,
        customName = Some("custom name"),
        rotation = None,
        integrationToken = "test3"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user, userApiEditor, otherUser),
        teams = Seq(
          teamOwner.copy(users =
            Set(UserWithPermission(userTeamAdminId, Administrator))
          ),
          teamConsumer
            .copy(users = Set(UserWithPermission(user.id, Administrator))),
          thirdTeam
        ),
        usagePlans = defaultApi.plans,
        apis = Seq(
          defaultApi.api.copy(issuesTags =
            Set(
              ApiIssueTag(
                id = ApiIssueTagId("test"),
                name = "test",
                color = "#ffffff"
              ),
              ApiIssueTag(
                id = ApiIssueTagId("test2"),
                name = "test2",
                color = "#cecece"
              )
            )
          )
        ),
        subscriptions = Seq(sub, subThird)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val userSession = loginWithBlocking(user, tenant)
      val apiEditorSession = loginWithBlocking(userApiEditor, tenant)
      val otherSession = loginWithBlocking(otherUser, tenant)

      //useAdmin admin of teamOwner, owner of the API
      //user, admin of teamConsumer, suber of API
      //apiEditor, admin of third team, suber of API
      //otherUser, member of no team

      // [1] - user create a new issue for API ==> OK
      val userCreateIssue = httpJsonCallBlocking(
        path =
          s"/api/teams/${defaultApi.api.team.value}/apis/${defaultApi.api.humanReadableId}/issues",
        method = "POST",
        body = Some(issue.asJson)
      )(
        tenant,
        userSession
      )

      userCreateIssue.status mustBe 201

      //[2] - user admin, as admin of TeamOwner, must reveive a notification about new issue created by user
//      val adminCheckNotification = httpJsonCallBlocking(
//        s"/api/me/notifications"
//      )(
//        tenant,
//        session
//      )
//      adminCheckNotification.status mustBe 200
//      (adminCheckNotification.json \ "count").as[Long] mustBe 1
//
//      val notifications =
//        (adminCheckNotification.json \ "notifications").as[JsArray]
//      (notifications.head \ "action" \ "type").asOpt[String] mustBe Some(
//        "NewIssueOpenV2"
//      )

      val adminCheckNotification = graphQLNotificationCallBlocking(
        Json.obj(
          "filterTable" -> Json.stringify(
            Json.arr(
              Json.obj("id" -> "unreadOnly", "value" -> true),
              Json.obj("id" -> "team", "value" -> Json.arr(teamOwnerId.asJson))
            )
          )
        )
      )(tenant, session)
      logger.json(adminCheckNotification.json, true)
      val adminNotifications =
        (adminCheckNotification.json \ "data" \ "myNotifications" \ "notifications")
          .as[JsArray]
      adminNotifications.value.length mustBe 1
      (adminNotifications.head \ "action" \ "__typename")
        .as[String] mustBe "NewIssueOpenV2"

      //[3] - admin add a response in issue
      val adminComment = ApiIssueComment(
        by = userAdmin.id,
        createdAt = DateTime.now(),
        lastModificationAt = DateTime.now(),
        content = "bug id corrected in new release, is it OK ?"
      )
      val commentsByAdmin = issue.comments :+ adminComment
      val adminCommentIssue = httpJsonCallBlocking(
        path =
          s"/api/teams/${defaultApi.api.team.value}/apis/${defaultApi.api.humanReadableId}/issues/${issue.id.value}",
        method = "PUT",
        body = Some(issue.copy(comments = commentsByAdmin).asJson)
      )(
        tenant,
        session
      )

      adminCommentIssue.status mustBe 200

//      val userCheckNotif = httpJsonCallBlocking(
//        s"/api/me/notifications"
//      )(
//        tenant,
//        userSession
//      )
//
//      //[4] - user received a notification for admin comment is his issue
//      userCheckNotif.status mustBe 200
//      (userCheckNotif.json \ "count").as[Long] mustBe 2
//
//      val notifications2 =
//        (userCheckNotif.json \ "notifications").as(json.SeqNotificationFormat)
//      notifications2
//        .maxBy(_.date)
//        .action
//        .getClass mustBe classOf[NewCommentOnIssueV2]
      val userCheckNotif = graphQLNotificationCallBlocking(
        Json.obj(
          "filterTable" -> Json.stringify(
            Json.arr(
              Json.obj("id" -> "unreadOnly", "value" -> true)
            )
          )
        )
      )(tenant, userSession)
      val userNotifs =
        (userCheckNotif.json \ "data" \ "myNotifications" \ "notifications")
          .as[JsArray]
      userNotifs.value.length mustBe 2
      userNotifs.value
        .map(v =>
          (v \ "action" \ "__typename")
            .as[String]
        )
        .contains("NewCommentOnIssueV2") mustBe true

      //[5] - apiEditor member of third team add also a response in issue by removing a comment ==> KO
      val apiEditorComment = ApiIssueComment(
        by = userApiEditor.id,
        createdAt = DateTime.now(),
        lastModificationAt = DateTime.now(),
        content = "I'm not sur..."
      )
      val commentsByApiEditorKO = issue.comments :+ apiEditorComment
      val apiEditorCommentIssueKO = httpJsonCallBlocking(
        path =
          s"/api/teams/${defaultApi.api.team.value}/apis/${defaultApi.api.humanReadableId}/issues/${issue.id.value}",
        method = "PUT",
        body = Some(issue.copy(comments = commentsByApiEditorKO).asJson)
      )(
        tenant,
        apiEditorSession
      )
      apiEditorCommentIssueKO.status mustBe 403

      //[5bis] - apiEditor member of third team add also a response in issue
      val commentsByApiEditor = commentsByAdmin :+ apiEditorComment
      val apiEditorCommentIssue = httpJsonCallBlocking(
        path =
          s"/api/teams/${defaultApi.api.team.value}/apis/${defaultApi.api.humanReadableId}/issues/${issue.id.value}",
        method = "PUT",
        body = Some(issue.copy(comments = commentsByApiEditor).asJson)
      )(
        tenant,
        apiEditorSession
      )
      apiEditorCommentIssue.status mustBe 200

//      val userCheckNotif2 = httpJsonCallBlocking(
//        s"/api/me/notifications"
//      )(
//        tenant,
//        userSession
//      )
//      userCheckNotif2.status mustBe 200
//      (userCheckNotif2.json \ "count").as[Long] mustBe 3
      val userCheckNotif2 = graphQLNotificationCallBlocking(
        Json.obj(
          "filterTable" -> Json.stringify(
            Json.arr(
              Json.obj("id" -> "unreadOnly", "value" -> true)
            )
          )
        )
      )(tenant, userSession)
      val userNotifs2 =
        (userCheckNotif2.json \ "data" \ "myNotifications" \ "notifications")
          .as[JsArray]
      userNotifs2.value.length mustBe 3

      //[6] - otherUser member of no team can't post comment
      val commentsByOther = commentsByApiEditor
      val otherCommentIssue = httpJsonCallBlocking(
        path =
          s"/api/teams/${defaultApi.api.team.value}/apis/${defaultApi.api.humanReadableId}/issues/${issue.id.value}",
        method = "PUT",
        body = Some(issue.copy(comments = commentsByOther).asJson)
      )(
        tenant,
        otherSession
      )
      otherCommentIssue.status mustBe 401

      //[7] - admin can update tags & close issue
      val adminCloseIssue = httpJsonCallBlocking(
        path =
          s"/api/teams/${defaultApi.api.team.value}/apis/${defaultApi.api.humanReadableId}/issues/${issue.id.value}",
        method = "PUT",
        body = Some(
          issue
            .copy(
              tags = Set(ApiIssueTagId("test")),
              comments = commentsByApiEditor,
              open = false,
              closedAt = DateTime.now().some
            )
            .asJson
        )
      )(
        tenant,
        session
      )
      adminCloseIssue.status mustBe 200

      val adminOpenIssue = httpJsonCallBlocking(
        path =
          s"/api/teams/${defaultApi.api.team.value}/apis/${defaultApi.api.humanReadableId}/issues/${issue.id.value}",
        method = "PUT",
        body = Some(
          issue
            .copy(
              tags = Set(ApiIssueTagId("test")),
              comments = commentsByApiEditor,
              open = true,
              closedAt = DateTime.now().some
            )
            .asJson
        )
      )(
        tenant,
        session
      )
      adminOpenIssue.status mustBe 200

      //[8] - non admin can't update tags & close issue
      val nonAdminCloseIssue = httpJsonCallBlocking(
        path =
          s"/api/teams/${defaultApi.api.team.value}/apis/${defaultApi.api.humanReadableId}/issues/${issue.id.value}",
        method = "PUT",
        body = Some(
          issue
            .copy(
              tags = Set(ApiIssueTagId("test")),
              comments = commentsByApiEditor,
              open = false,
              closedAt = DateTime.now().some
            )
            .asJson
        )
      )(
        tenant,
        userSession
      )
      nonAdminCloseIssue.status mustBe 401

      //[8bis] - non admin can't update tags
      val nonAdminUpdateTagsIssue = httpJsonCallBlocking(
        path =
          s"/api/teams/${defaultApi.api.team.value}/apis/${defaultApi.api.humanReadableId}/issues/${issue.id.value}",
        method = "PUT",
        body = Some(
          issue
            .copy(
              tags = Set(ApiIssueTagId("test"), ApiIssueTagId("test2")),
              comments = commentsByApiEditor
            )
            .asJson
        )
      )(
        tenant,
        userSession
      )
      nonAdminUpdateTagsIssue.status mustBe 401
    }
  }

  "a user/api editor" can {
    "not read notifications of his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(user, tenant)
      val resp = graphQLNotificationCallBlocking(
        Json.obj(
          "filterTable" -> Json.stringify(
            Json.arr(
              Json.obj("id" -> "team", "value" -> Json.arr(teamOwnerId.asJson))
            )
          )
        )
      )(tenant, session)
      val notifications =
        (resp.json \ "data" \ "myNotifications" \ "notifications").as[JsArray]
      notifications.value.length mustBe 0
    }
    "not read untreated notifications of his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(user, tenant)
      val resp = graphQLNotificationCallBlocking(
        Json.obj(
          "filterTable" -> Json.stringify(
            Json.arr(
              Json.obj("id" -> "unreadOnly", "value" -> true),
              Json.obj("id" -> "team", "value" -> Json.arr(teamOwnerId.asJson))
            )
          )
        )
      )(tenant, session)
      val notifications =
        (resp.json \ "data" \ "myNotifications" \ "notifications").as[JsArray]
      notifications.value.length mustBe 0
    }
    "read his count of notifications" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(user, tenant)
      val resp =
        httpJsonCallBlocking(s"/api/me/notifications/unread-count")(
          tenant,
          session
        )
      resp.status mustBe 200
      (resp.json \ "count").as[Long] mustBe 0
    }
    "read his notifications" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      //TODO: save a dedicated notification

      val session = loginWithBlocking(user, tenant)
      val resp = graphQLNotificationCallBlocking()(tenant, session)
      val notifications =
        (resp.json \ "data" \ "myNotifications" \ "notifications").as[JsArray]
      notifications.value.length mustBe 0
    }
    "read his untreated notifications" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(user, tenant)
      val resp = graphQLNotificationCallBlocking()(tenant, session)
      val notifications =
        (resp.json \ "data" \ "myNotifications" \ "notifications").as[JsArray]
      notifications.value.length mustBe 0
    }
    "not accept any \"team\" notification except teamInvitation" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user, userAdmin),
        teams = Seq(
          teamConsumer.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator))
          ),
          teamOwner.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator))
          )
        ),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        notifications = Seq(
          untreatedNotification,
          Notification(
            id = NotificationId("untreated-team-invitation"),
            tenant = tenant.id,
            team = None,
            sender = userAdmin.asNotificationSender,
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
    "not reject any notification" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user, userAdmin),
        teams = Seq(
          teamConsumer.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator))
          ),
          teamOwner.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator))
          )
        ),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        notifications = Seq(
          untreatedNotification,
          Notification(
            id = NotificationId("untreated-team-invitation"),
            tenant = tenant.id,
            team = None,
            sender = userAdmin.asNotificationSender,
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

    "receive a return notification of a subscription request acceptation" in {
      val process = Seq(
        ValidationStep.TeamAdmin(
          id = IdGenerator.token,
          team = defaultApi.api.team,
          title = "Admin"
        )
      )
      val demand = SubscriptionDemand(
        id = DemandId(IdGenerator.token),
        tenant = tenant.id,
        api = defaultApi.api.id,
        plan = UsagePlanId("3"),
        steps = process.map(s =>
          SubscriptionDemandStep(
            SubscriptionDemandStepId(s.id),
            SubscriptionDemandState.InProgress,
            s
          )
        ),
        state = SubscriptionDemandState.InProgress,
        team = teamConsumerId,
        from = userAdmin.id,
        date = DateTime.now().minusDays(1)
      )

      Await.result(waitForDaikokuSetup(), 5.seconds)
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user, userAdmin),
        teams = Seq(
          teamConsumer.copy(
            users = Set(UserWithPermission(user.id, Administrator))
          ),
          teamOwner.copy(
            users = Set(UserWithPermission(userAdmin.id, Administrator))
          )
        ),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        subscriptionDemands = Seq(demand),
        notifications = Seq(
          Notification(
            id = NotificationId("untreated-subscription"),
            tenant = tenant.id,
            team = teamOwner.id.some,
            sender = user.asNotificationSender,
            notificationType = AcceptOrReject,
            action = ApiSubscriptionDemand(
              defaultApi.api.id,
              defaultApi.api.defaultUsagePlan.get,
              teamConsumerId,
              motivation = Some("please"),
              demand = demand.id,
              step = demand.steps.head.id
            )
          )
        )
      )
      val sessionAdmin = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/notifications/untreated-subscription/accept",
        method = "PUT",
        body = Json.obj().some
      )(tenant, sessionAdmin)
      resp.status mustBe 200

      val sessionUser = loginWithBlocking(user, tenant)
      val respNotifs = graphQLNotificationCallBlocking()(tenant, sessionUser)
      val notifications =
        (respNotifs.json \ "data" \ "myNotifications" \ "notifications")
          .as[JsArray]
      notifications.value.length mustBe 1

      (notifications.value.head \ "action" \ "__typename")
        .as[String] mustBe "ApiSubscriptionAccept"
      (notifications.value.head \ "team" \ "_id")
        .as(json.TeamIdFormat) mustBe teamConsumerId
    }

    "receive a return notification of a subscription request rejection" in {
      val process = Seq(
        ValidationStep.TeamAdmin(
          id = IdGenerator.token,
          team = defaultApi.api.team,
          title = "Admin"
        )
      )
      val demand = SubscriptionDemand(
        id = DemandId(IdGenerator.token),
        tenant = tenant.id,
        api = defaultApi.api.id,
        plan = UsagePlanId("3"),
        steps = process.map(s =>
          SubscriptionDemandStep(
            SubscriptionDemandStepId(s.id),
            SubscriptionDemandState.InProgress,
            s
          )
        ),
        state = SubscriptionDemandState.InProgress,
        team = teamConsumerId,
        from = userAdmin.id,
        date = DateTime.now().minusDays(1)
      )

      Await.result(waitForDaikokuSetup(), 5.second)
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user, userAdmin, user),
        teams = Seq(
          teamConsumer.copy(
            users = Set(UserWithPermission(user.id, Administrator))
          ),
          teamOwner.copy(
            users = Set(UserWithPermission(userAdmin.id, Administrator))
          )
        ),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        subscriptionDemands = Seq(demand),
        notifications = Seq(
          Notification(
            id = NotificationId("untreated-subscription"),
            tenant = tenant.id,
            team = teamOwner.id.some,
            sender = user.asNotificationSender,
            notificationType = AcceptOrReject,
            action = ApiSubscriptionDemand(
              api = defaultApi.api.id,
              plan = defaultApi.api.defaultUsagePlan.get,
              team = teamConsumerId,
              parentSubscriptionId = None,
              motivation = Some("please"),
              demand = demand.id,
              step = demand.steps.head.id
            )
          )
        )
      )
      val sessionAdmin = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/notifications/untreated-subscription/reject",
        method = "PUT",
        body = Json.obj("message" -> "no reason").some
      )(tenant, sessionAdmin)
      resp.status mustBe 200

      val sessionUser = loginWithBlocking(user, tenant)

      val respNotifs = graphQLNotificationCallBlocking()(tenant, sessionUser)
      val notifications =
        (respNotifs.json \ "data" \ "myNotifications" \ "notifications")
          .as[JsArray]
      notifications.value.length mustBe 1

      (notifications.value.head \ "action" \ "__typename")
        .as[String] mustBe "ApiSubscriptionReject"
      (notifications.value.head \ "team" \ "_id")
        .as(json.TeamIdFormat) mustBe teamConsumerId
    }

  }

}
