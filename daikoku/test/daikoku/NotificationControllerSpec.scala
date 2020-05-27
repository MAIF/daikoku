package fr.maif.otoroshi.daikoku.tests

import com.typesafe.config.ConfigFactory
import fr.maif.otoroshi.daikoku.domain.ApiVisibility.PublicWithAuthorizations
import fr.maif.otoroshi.daikoku.domain.NotificationAction.{ApiAccess, ApiSubscriptionDemand, TeamAccess, TeamInvitation}
import fr.maif.otoroshi.daikoku.domain.NotificationStatus.{Accepted, Pending}
import fr.maif.otoroshi.daikoku.domain.NotificationType.AcceptOrReject
import fr.maif.otoroshi.daikoku.domain.SubscriptionProcess.Manual
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain.UsagePlan.QuotasWithLimits
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.tests.utils.{DaikokuSpecHelper, OneServerPerSuiteWithMyComponents}
import org.scalatest.BeforeAndAfterEach
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import play.api.Configuration
import play.api.libs.json.JsArray

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

  "a team admin" can {
    "read the count of untreated notifications of his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi),
        notifications = Seq(treatedNotification, untreatedNotification)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        s"/api/teams/${teamOwnerId.value}/notifications/unread-count")(tenant,
                                                                       session)
      resp.status mustBe 200
      (resp.json \ "count").as[Long] mustBe 1

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
      eventualNotifications.get.forall(_.status == Pending) mustBe true
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
      eventualNotifications.get.forall(_.status == Pending) mustBe true
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
        path =
          s"/api/notifications/${untreatedNotification.id.value}/accept",
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
        path =
          s"/api/notifications/${untreatedNotification.id.value}/reject",
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
        path =
          s"/api/notifications/${untreatedNotification.id.value}/accept",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      val respVerif =
        httpJsonCallBlocking(
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}")(
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
        path =
          s"/api/notifications/${untreatedNotification.id.value}/reject",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      val respVerif =
        httpJsonCallBlocking(
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}")(
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
        apis = Seq(defaultApi.copy(possibleUsagePlans = Seq(QuotasWithLimits(
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
              OtoroshiServiceGroupId("12345"))
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
        path =
          s"/api/notifications/${untreatedNotification.id.value}/accept",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      val respVerif =
        httpJsonCallBlocking(
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}")(
          tenant,
          session)
      respVerif.status mustBe 200
      val eventualApi = json.ApiFormat.reads(respVerif.json)
      eventualApi.isSuccess mustBe true
      eventualApi.get.subscriptions.size mustBe 1
    }
    "reject notification - api subscription" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamConsumer, teamOwner),
        apis = Seq(defaultApi.copy(possibleUsagePlans = Seq(QuotasWithLimits(
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
              OtoroshiServiceGroupId("12345"))
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
        path =
          s"/api/notifications/${untreatedNotification.id.value}/reject",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      val respVerif =
        httpJsonCallBlocking(
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}")(
          tenant,
          session)
      respVerif.status mustBe 200
      val eventualApi = json.ApiFormat.reads(respVerif.json)
      eventualApi.isSuccess mustBe true
      eventualApi.get.subscriptions.size mustBe 0
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
      eventualNotifications.get.forall(_.status == Pending) mustBe true
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
        path =
          s"/api/notifications/${untreatedNotification.id.value}/accept",
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
        path =
          s"/api/notifications/${untreatedNotification.id.value}/reject",
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
        path =
          s"/api/notifications/${untreatedNotification.id.value}/accept",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      val respVerif =
        httpJsonCallBlocking(
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}")(
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
        path =
          s"/api/notifications/${untreatedNotification.id.value}/reject",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      val respVerif =
        httpJsonCallBlocking(
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}")(
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
        apis = Seq(defaultApi.copy(possibleUsagePlans = Seq(QuotasWithLimits(
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
              OtoroshiServiceGroupId("12345"))
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
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/notifications/${untreatedNotification.id.value}/accept",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      val respVerif =
        httpJsonCallBlocking(
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}")(
          tenant,
          session)
      respVerif.status mustBe 200
      val eventualApi = json.ApiFormat.reads(respVerif.json)
      eventualApi.isSuccess mustBe true
      eventualApi.get.subscriptions.size mustBe 1
    }
    "reject notification - api subscription" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(teamConsumer, teamOwner),
        apis = Seq(defaultApi.copy(possibleUsagePlans = Seq(QuotasWithLimits(
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
              OtoroshiServiceGroupId("12345"))
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
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/notifications/${untreatedNotification.id.value}/reject",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      val respVerif =
        httpJsonCallBlocking(
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}")(
          tenant,
          session)
      respVerif.status mustBe 200
      val eventualApi = json.ApiFormat.reads(respVerif.json)
      eventualApi.isSuccess mustBe true
      eventualApi.get.subscriptions.size mustBe 0
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
          teamConsumer.copy(users = Set(UserWithPermission(userTeamAdminId, Administrator))),
          teamOwner.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator)))),
        apis = Seq(defaultApi),
        notifications =
          Seq(
            untreatedNotification.copy(action = TeamAccess(teamOwnerId)),
            Notification(
              id = NotificationId("untreated-team-invitation"),
              tenant = tenant.id,
              team = None,
              sender = userAdmin,
              notificationType = AcceptOrReject,
              action = TeamInvitation(teamConsumerId, user.id)
            ))
      )
      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/notifications/${untreatedNotification.id.value}/accept",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 403

      val respInvit = httpJsonCallBlocking(
        path =
          s"/api/notifications/untreated-team-invitation/accept",
        method = "PUT"
      )(tenant, session)
      respInvit.status mustBe 200

      val adminSession = loginWithBlocking(userAdmin, tenant)
      val getTeam = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumer.id.value}/_full"
      )(tenant, adminSession)
      getTeam.status mustBe 200
      val maybeUsers = fr.maif.otoroshi.daikoku.domain.json.SetUserWithPermissionFormat
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
          teamConsumer.copy(users = Set(UserWithPermission(userTeamAdminId, Administrator))),
          teamOwner.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator)))),
        apis = Seq(defaultApi),
        notifications =
          Seq(
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
        path =
          s"/api/notifications/${untreatedNotification.id.value}/reject",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 403

      val respInvit = httpJsonCallBlocking(
        path =
          s"/api/notifications/untreated-team-invitation/reject",
        method = "PUT"
      )(tenant, session)
      respInvit.status mustBe 200

      val adminSession = loginWithBlocking(userAdmin, tenant)
      val getTeam = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumer.id.value}/_full"
      )(tenant, adminSession)
      getTeam.status mustBe 200
      val maybeUsers = fr.maif.otoroshi.daikoku.domain.json.SetUserWithPermissionFormat
        .reads((getTeam.json \ "users").as[JsArray])

      maybeUsers.isSuccess mustBe true
      maybeUsers.get.size mustBe 1
      maybeUsers.get.exists(value => value.userId == user.id) mustBe false
    }

  }
}
