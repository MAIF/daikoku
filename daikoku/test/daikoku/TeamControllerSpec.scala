package fr.maif.otoroshi.daikoku.tests

import fr.maif.otoroshi.daikoku.domain.NotificationAction.{
  ApiSubscriptionDemand,
  TeamAccess,
  TeamInvitation
}
import fr.maif.otoroshi.daikoku.domain.NotificationType.AcceptOrReject
import fr.maif.otoroshi.daikoku.domain.TeamPermission.{
  Administrator,
  ApiEditor,
  TeamUser
}
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.tests.utils.{
  DaikokuSpecHelper,
  OneServerPerSuiteWithMyComponents
}
import org.joda.time.DateTime
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import play.api.libs.json._

import scala.util.Random

class TeamControllerSpec()
    extends PlaySpec
    with OneServerPerSuiteWithMyComponents
    with DaikokuSpecHelper
    with IntegrationPatience {

  "a daikoku admin" can {
    "create, update or delete a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam)
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val respCreation = httpJsonCallBlocking(
        path = "/api/teams",
        method = "POST",
        body = Some(teamOwner.asJson)
      )(tenant, session)
      respCreation.status mustBe 201

      val respCreation2 = httpJsonCallBlocking(
        path = "/api/teams",
        method = "POST",
        body = Some(teamOwner.asJson)
      )(tenant, session)
      respCreation2.status mustBe 409

      val respUpdate = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}",
        method = "PUT",
        body = Some(teamOwner.copy(name = "bobby team").asJson)
      )(tenant, session)
      respUpdate.status mustBe 200

      val respGet =
        httpJsonCallBlocking(s"/api/teams/${teamOwnerId.value}")(tenant,
                                                                 session)
      val updatedTeam =
        fr.maif.otoroshi.daikoku.domain.json.TeamFormat.reads(respGet.json)
      updatedTeam.isSuccess mustBe true
      updatedTeam.get.name mustBe "bobby team"

      val respUpdateNotFound = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}",
        method = "PUT",
        body = Some(teamOwner.copy(name = "bobby team").asJson)
      )(tenant, session)
      respUpdateNotFound.status mustBe 404

      val respDelete = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}",
        method = "DELETE"
      )(tenant, session)
      respDelete.status mustBe 200

      val respDeleteNotFound = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}",
        method = "DELETE"
      )(tenant, session)
      respDeleteNotFound.status mustBe 404
    }

    "not ask join a personal team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, user),
        teams = Seq(teamOwner)
      )
      val dkAdminSession = loginWithBlocking(daikokuAdmin, tenant)
      val userSession = loginWithBlocking(user, tenant)

      val respMyTeam =
        httpJsonCallBlocking("/api/me/teams/own")(tenant, userSession)
      respMyTeam.status mustBe 200
      val userTeam =
        fr.maif.otoroshi.daikoku.domain.json.TeamFormat.reads(respMyTeam.json)
      userTeam.isSuccess mustBe true
      val userTeamId = userTeam.get.id

      val respJoinDenied = httpJsonCallBlocking(
        path = s"/api/teams/${userTeamId.value}/join",
        method = "POST"
      )(tenant, dkAdminSession)

      respJoinDenied.status mustBe 403
    }

    "not add/remove member from a personal team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, user),
        teams = Seq(teamOwner)
      )
      val dkAdminSession = loginWithBlocking(daikokuAdmin, tenant)
      val userSession = loginWithBlocking(user, tenant)

      val respMyTeam =
        httpJsonCallBlocking("/api/me/teams/own")(tenant, userSession)
      respMyTeam.status mustBe 200
      val userTeam =
        fr.maif.otoroshi.daikoku.domain.json.TeamFormat.reads(respMyTeam.json)
      userTeam.isSuccess mustBe true
      val userTeamId = userTeam.get.id

      val respRemoveDenied = httpJsonCallBlocking(
        path = s"/api/teams/${userTeamId.value}/members/${user.id.value}",
        method = "DELETE"
      )(tenant, dkAdminSession)

      respRemoveDenied.status mustBe 409

      val respAddDenied = httpJsonCallBlocking(
        path = s"/api/teams/${userTeamId.value}/members",
        method = "POST",
        body = Some(Json.obj("members" -> Json.arr(daikokuAdmin.id.asJson)))
      )(tenant, dkAdminSession)

      respAddDenied.status mustBe 409

    }
    "not update permission member of team admin" in {}
    "not update apikey visibility for team admin" in {}

    "update team api creation permission" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val respUpdate = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}",
        method = "PUT",
        body = Some(teamOwner.copy(apisCreationPermission = Some(true)).asJson)
      )(tenant, session)
      respUpdate.status mustBe 200

      val respGet =
        httpJsonCallBlocking(s"/api/teams/${teamOwnerId.value}")(tenant,
                                                                 session)
      val updatedTeam =
        fr.maif.otoroshi.daikoku.domain.json.TeamFormat.reads(respGet.json)
      updatedTeam.isSuccess mustBe true
      updatedTeam.get.apisCreationPermission mustBe Some(true)
    }

    "not delete a tenant team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam)
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)

      val respDelete = httpJsonCallBlocking(
        path = s"/api/teams/${defaultAdminTeam.id.value}",
        method = "DELETE"
      )(tenant, session)
      respDelete.status mustBe 403
    }
  }

  "a team administrator" can {
    "create or delete a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, defaultAdminTeam)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val respCreation = httpJsonCallBlocking(
        path = "/api/teams",
        method = "POST",
        body = Some(teamConsumer.asJson)
      )(tenant, session)
      respCreation.status mustBe 201

      val respDelete = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}",
        method = "DELETE"
      )(tenant, session)
      respDelete.status mustBe 200
    }

    "not delete an another team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams =
          Seq(teamOwner.copy(users =
                Set(UserWithPermission(user.id, TeamPermission.Administrator))),
              defaultAdminTeam)
      )
      val session = loginWithBlocking(userAdmin, tenant)

      val respDelete = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}",
        method = "DELETE"
      )(tenant, session)
      respDelete.status mustBe 403
    }

    "update a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, defaultAdminTeam)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val respCreation = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}",
        method = "PUT",
        body = Some(teamOwner.copy(name = "bobby team").asJson)
      )(tenant, session)
      respCreation.status mustBe 200

      val respGet =
        httpJsonCallBlocking(s"/api/teams/${teamOwnerId.value}")(tenant,
                                                                 session)
      val updatedTeam =
        fr.maif.otoroshi.daikoku.domain.json.TeamFormat.reads(respGet.json)
      updatedTeam.isSuccess mustBe true
      updatedTeam.get.name mustBe "bobby team"
    }

    "have full access to a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(userAdmin, tenant)

      val respGet = httpJsonCallBlocking(
        s"/api/teams/${teamOwnerId.value}/_full")(tenant, session)
      respGet.status mustBe 200
      respGet.json mustBe teamOwner.asJson.as[JsObject] ++ Json.obj(
        "translation" -> Json.obj())
    }

    "invit members to his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user),
        teams = Seq(
          teamOwner.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator))))
      )
      val session = loginWithBlocking(userAdmin, tenant)

      val respUpdate =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamOwnerId.value}/members",
          method = "POST",
          body = Some(Json.obj("members" -> Json.arr(userTeamUserId.asJson))))(
          tenant,
          session)
      respUpdate.status mustBe 200
      (respUpdate.json \ "done").as[Boolean] mustBe true

      //todo: test invit is ok
      val userSession = loginWithBlocking(user, tenant)
      val respNotification =
        httpJsonCallBlocking(path = s"/api/me/notifications")(tenant,
                                                              userSession)
      respNotification.status mustBe 200

      val notifications =
        fr.maif.otoroshi.daikoku.domain.json.SeqNotificationFormat
          .reads((respNotification.json \ "notifications").as[JsArray])
      notifications.isSuccess mustBe true
      notifications.get.size mustBe 1
      notifications.get.head.action.isInstanceOf[TeamInvitation] mustBe true
      val action = notifications.get.head.action.asInstanceOf[TeamInvitation]
      action.team mustBe teamOwnerId
    }

    "remove members to his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(userAdmin, tenant)

      teamOwner.users.size mustBe 3

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/members/${userTeamUserId.value}",
        method = "DELETE")(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true
      val updatedTeam = fr.maif.otoroshi.daikoku.domain.json.TeamFormat
        .reads((resp.json \ "team").as[JsObject])
      updatedTeam.isSuccess mustBe true
      updatedTeam.get.users.size mustBe 2
      updatedTeam.get.users.exists(u => u.userId == userTeamUserId) mustBe false
    }

    "update permission's member in his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/members/_permission",
        method = "POST",
        body = Some(
          Json.obj(
            "members" -> Json.arr(user.id.value),
            "permission" -> "Administrator"
          )
        )
      )(tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true
      val updatedTeam = fr.maif.otoroshi.daikoku.domain.json.TeamFormat
        .reads((resp.json \ "team").as[JsObject])
      updatedTeam.isSuccess mustBe true
      val updatedUser =
        updatedTeam.get.users.find(u => u.userId == userTeamUserId)
      updatedUser.isDefined mustBe true
      updatedUser.get.teamPermission mustBe Administrator
    }

    "see a member of his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user),
        teams =
          Seq(teamOwner,
              teamConsumer.copy(
                users = Set(UserWithPermission(userTeamUserId, Administrator))))
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp =
        httpJsonCallBlocking(
          s"/api/teams/${teamOwnerId.value}/members/${userTeamUserId.value}")(
          tenant,
          session)
      resp.status mustBe 200
      resp.json mustBe user.asSimpleJson

      val respForbidden =
        httpJsonCallBlocking(
          s"/api/teams/${teamConsumerId.value}/members/${userTeamUserId.value}")(
          tenant,
          session)
      respForbidden.status mustBe 403
    }

    "list his team members" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user, userApiEditor),
        teams =
          Seq(teamOwner,
              teamConsumer.copy(
                users = Set(UserWithPermission(userTeamUserId, Administrator))))
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp =
        httpJsonCallBlocking(s"/api/teams/${teamOwnerId.value}/members")(
          tenant,
          session)
      resp.status mustBe 200
      val users =
        fr.maif.otoroshi.daikoku.domain.json.SeqUserFormat.reads(resp.json)
      users.isSuccess mustBe true
      users.get.length mustBe 3
      users.get.map(_.id).toSet mustEqual Set(userTeamAdminId,
                                              userApiEditorId,
                                              userTeamUserId)

      val respForbidden =
        httpJsonCallBlocking(s"/api/teams/${teamConsumerId.value}/members")(
          tenant,
          session)
      respForbidden.status mustBe 403
    }

    "update api key visibility" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user, userApiEditor),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(userAdmin, tenant)

      teamOwner.apiKeyVisibility mustBe Some(TeamApiKeyVisibility.User)
      val resp =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamOwnerId.value}",
          method = "PUT",
          body = Some(
            teamOwner
              .copy(apiKeyVisibility = Some(TeamApiKeyVisibility.Administrator))
              .asJson)
        )(tenant, session)
      resp.status mustBe 200

      val updatedTeam = fr.maif.otoroshi.daikoku.domain.json.TeamFormat
        .reads(resp.json.as[JsObject])
      updatedTeam.isSuccess mustBe true
      updatedTeam.get.apiKeyVisibility mustBe Some(
        TeamApiKeyVisibility.Administrator)
    }

    "get addable and pending user for his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user, userApiEditor),
        teams = Seq(
          teamOwner.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator))))
      )
      val session = loginWithBlocking(userAdmin, tenant)

      var respGet =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamOwnerId.value}/pending-members")(tenant,
                                                                     session)
      respGet.status mustBe 200
      var pendingUsers = fr.maif.otoroshi.daikoku.domain.json.SeqUserFormat
        .reads((respGet.json \ "pendingUsers").as[JsArray])

      pendingUsers.get.size mustBe 0

      var respInvit =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamOwnerId.value}/members",
          method = "POST",
          body = Some(Json.obj("members" -> Json.arr(userTeamUserId.asJson))))(
          tenant,
          session)
      respInvit.status mustBe 200

      respGet = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/pending-members")(tenant,
                                                                   session)
      respGet.status mustBe 200
      pendingUsers = fr.maif.otoroshi.daikoku.domain.json.SeqUserFormat
        .reads((respGet.json \ "pendingUsers").as[JsArray])
//
      pendingUsers.get.size mustBe 1

      respInvit = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/members",
        method = "POST",
        body = Some(Json.obj("members" -> Json.arr(userApiEditorId.asJson))))(
        tenant,
        session)
      respInvit.status mustBe 200

      respGet = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/pending-members")(tenant,
                                                                   session)
      respGet.status mustBe 200
      pendingUsers = fr.maif.otoroshi.daikoku.domain.json.SeqUserFormat
        .reads((respGet.json \ "pendingUsers").as[JsArray])

      pendingUsers.get.size mustBe 2
    }

    "not update team api creation permission" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val respUpdate = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}",
        method = "PUT",
        body = Some(teamOwner.copy(apisCreationPermission = Some(true)).asJson)
      )(tenant, session)
      respUpdate.status mustBe 200

      val respGet =
        httpJsonCallBlocking(s"/api/teams/${teamOwnerId.value}")(tenant,
                                                                 session)
      val updatedTeam =
        fr.maif.otoroshi.daikoku.domain.json.TeamFormat.reads(respGet.json)
      updatedTeam.isSuccess mustBe true
      updatedTeam.get.apisCreationPermission mustBe None
    }
  }

  "a user or api editor" can {
    val randomUser = Random.shuffle(Seq(user, userApiEditor)).head

    "not have full access to a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(randomUser),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(randomUser, tenant)

      val respGet = httpJsonCallBlocking(
        s"/api/teams/${teamOwnerId.value}/_full")(tenant, session)
      respGet.status mustBe 403
    }

    "ask for join a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, randomUser),
        teams = Seq(
          teamConsumer.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator))))
      )
      val session = loginWithBlocking(randomUser, tenant)
      val resp =
        httpJsonCallBlocking(path = s"/api/teams/${teamConsumerId.value}/join",
                             method = "POST")(tenant, session)
      resp.status mustBe 200

      val adminSession = loginWithBlocking(userAdmin, tenant)
      val respNotifications =
        httpJsonCallBlocking(
          s"/api/teams/${teamConsumerId.value}/notifications")(tenant,
                                                               adminSession)
      respNotifications.status mustBe 200
      val notifications =
        fr.maif.otoroshi.daikoku.domain.json.SeqNotificationFormat
          .reads((respNotifications.json \ "notifications").as[JsArray])
      notifications.isSuccess mustBe true
      notifications.get.length mustBe 1
      val notif = notifications.get.head
      notif.action mustBe TeamAccess(teamConsumerId)
      notif.sender.id mustBe randomUser.id
      notif.team.get mustBe teamConsumerId
    }

    "not add or delete user" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(randomUser),
        teams = Seq(
          teamOwner.copy(
            users = Set(UserWithPermission(randomUser.id, TeamUser))))
      )
      val session = loginWithBlocking(randomUser, tenant)

      val respUpdate =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamOwnerId.value}/members",
          method = "POST",
          body = Some(Json.obj("members" -> Json.arr(userAdmin.asJson))))(
          tenant,
          session)
      respUpdate.status mustBe 403

      val respDelete = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/members/${userTeamAdminId.value}",
        method = "DELETE")(tenant, session)
      respDelete.status mustBe 403
    }

    "not add or delete user, even in his personal team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(randomUser, userAdmin),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(randomUser, tenant)

      val respMyTeam =
        httpJsonCallBlocking("/api/me/teams/own")(tenant, session)
      respMyTeam.status mustBe 200
      val myTeam =
        fr.maif.otoroshi.daikoku.domain.json.TeamFormat.reads(respMyTeam.json)
      myTeam.isSuccess mustBe true
      val myTeamId = myTeam.get.id

      val respUpdate =
        httpJsonCallBlocking(
          path = s"/api/teams/${myTeamId.value}/members",
          method = "POST",
          body = Some(Json.obj("members" -> Json.arr(userAdmin.asJson))))(
          tenant,
          session)
      respUpdate.status mustBe 409

      val respDelete = httpJsonCallBlocking(
        path = s"/api/teams/${myTeamId.value}/members/${userTeamAdminId.value}",
        method = "DELETE")(tenant, session)
      respDelete.status mustBe 409
    }

    "not update permission's member in his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, randomUser),
        teams = Seq(
          teamOwner.copy(
            users = Set(UserWithPermission(randomUser.id, TeamUser))))
      )
      val session = loginWithBlocking(randomUser, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/members/_permission",
        method = "POST",
        body = Some(
          Json.obj(
            "members" -> Json.arr(userTeamAdminId.value),
            "permission" -> ApiEditor.name
          )
        )
      )(tenant, session)
      resp.status mustBe 403
    }

    "not update permission's member in his team, even in his personal team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, randomUser)
      )
      val session = loginWithBlocking(randomUser, tenant)

      val respMyTeam =
        httpJsonCallBlocking("/api/me/teams/own")(tenant, session)
      val myTeam =
        fr.maif.otoroshi.daikoku.domain.json.TeamFormat.reads(respMyTeam.json)
      myTeam.isSuccess mustBe true
      val myTeamId = myTeam.get.id

      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${myTeamId.value}/members/_permission",
        method = "POST",
        body = Some(
          Json.obj(
            "members" -> Json.arr(randomUser.id.value),
            "permission" -> ApiEditor.name
          )
        )
      )(tenant, session)
      resp.status mustBe 409
    }

    "not update apikey visibility" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, randomUser),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(randomUser, tenant)

      teamOwner.apiKeyVisibility mustBe Some(TeamApiKeyVisibility.User)
      val resp =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamOwnerId.value}",
          method = "PUT",
          body = Some(
            teamOwner
              .copy(apiKeyVisibility = Some(TeamApiKeyVisibility.ApiEditor))
              .asJson)
        )(tenant, session)
      resp.status mustBe 403
    }

    "not update apikey visibility even in his personal team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, randomUser)
      )
      val session = loginWithBlocking(randomUser, tenant)

      val respMyTeam =
        httpJsonCallBlocking("/api/me/teams/own")(tenant, session)
      val myTeam =
        fr.maif.otoroshi.daikoku.domain.json.TeamFormat.reads(respMyTeam.json)
      myTeam.isSuccess mustBe true
      val myTeamId = myTeam.get.id

      teamOwner.apiKeyVisibility mustBe Some(TeamApiKeyVisibility.User)
      val resp =
        httpJsonCallBlocking(
          path = s"/api/teams/${myTeamId.value}",
          method = "PUT",
          body = Some(
            myTeam.get
              .copy(apiKeyVisibility = Some(TeamApiKeyVisibility.ApiEditor))
              .asJson)
        )(tenant, session)
      resp.status mustBe 403
    }

    "get his team home information" in {
      val subPlanId = UsagePlanId("5")
      val sub = ApiSubscription(
        id = ApiSubscriptionId("test"),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        plan = subPlanId,
        createdAt = DateTime.now(),
        team = teamOwnerId,
        api = defaultApi.id,
        by = daikokuAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        teams = Seq(teamOwner, teamConsumer.copy(users = Set.empty)),
        users = Seq(userAdmin, randomUser),
        apis = Seq(defaultApi),
        subscriptions = Seq(sub),
        notifications = Seq(
          Notification(
            id = NotificationId("untreated-notification"),
            tenant = tenant.id,
            team = Some(teamOwnerId),
            sender = user,
            notificationType = AcceptOrReject,
            action = ApiSubscriptionDemand(defaultApi.id,
                                           UsagePlanId("2"),
                                           teamConsumerId,
                                           motivation = Some("motication"))
          ))
      )
      val session = loginWithBlocking(randomUser, tenant)
      val resp =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamOwnerId.value}/home",
        )(tenant, session)
      resp.status mustBe 200

      val team =
        fr.maif.otoroshi.daikoku.domain.json.TeamFormat.reads(resp.json)
      team.isSuccess mustBe true
      team.get.name mustBe teamOwner.name

      (resp.json \ "apisCount").as[Int] mustBe 1
      (resp.json \ "subscriptionsCount").as[Int] mustBe 1
      (resp.json \ "notificationCount").as[Int] mustBe 1

      val respDenied =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamConsumerId.value}/home",
        )(tenant, session)
      respDenied.status mustBe 403
    }
  }

  "a tenant admin team" can {
    "not be deleted" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)

      val respDelete = httpJsonCallBlocking(
        path = s"/api/teams/${defaultAdminTeam.id.value}",
        method = "DELETE"
      )(tenant, session)
      respDelete.status mustBe 403
    }

    "not be updated" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)

      val respUpdateNotFound = httpJsonCallBlocking(
        path = s"/api/teams/${defaultAdminTeam.id.value}",
        method = "PUT",
        body = Some(defaultAdminTeam.copy(`type` = TeamType.Personal).asJson)
      )(tenant, session)
      respUpdateNotFound.status mustBe 403
    }

    "not be join by anyone" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, user),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(user, tenant)

      val respUser = httpJsonCallBlocking(
        path = s"/api/teams/${defaultAdminTeam.id.value}/join",
        method = "POST"
      )(tenant, session)
      respUser.status mustBe 403
    }

    "not be visible by user which is not member" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, user),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(user, tenant)

      val respUser = httpJsonCallBlocking(
        path = s"/api/teams/${defaultAdminTeam.id.value}/_full"
      )(tenant, session)
      respUser.status mustBe 403
    }

    "not update its apikey visibility" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)

      defaultAdminTeam.apiKeyVisibility mustBe Some(TeamApiKeyVisibility.User)
      val resp =
        httpJsonCallBlocking(
          path = s"/api/teams/${defaultAdminTeam.id.value}",
          method = "PUT",
          body = Some(
            defaultAdminTeam
              .copy(apiKeyVisibility = Some(TeamApiKeyVisibility.User))
              .asJson)
        )(tenant, session)
      resp.status mustBe 403
    }

    "not see its member permission updated" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(
          defaultAdminTeam.copy(
            users = Set(UserWithPermission(tenantAdmin.id, Administrator),
                        UserWithPermission(user.id, Administrator))))
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${defaultAdminTeam.id.value}/members/_permission",
        method = "POST",
        body = Some(
          Json.obj(
            "members" -> Json.arr(user.id.value),
            "permission" -> TeamPermission.TeamUser.name
          )
        )
      )(tenant, session)
      resp.status mustBe 409
    }

  }

  "a personal team" must {
    "have always thhe same informations than it user" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user)
      )

      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(s"/api/me/teams/own")(tenant, session)
      resp.status mustBe 200
      val myTeam: JsResult[Team] = json.TeamFormat.reads(resp.json)
      myTeam.isSuccess mustBe true
      //not now because team is created by suite not by daikoku login

      val respUpdate = httpJsonCallBlocking(
        path = s"/api/admin/users/${user.id.value}",
        method = "PUT",
        body = Some(user.copy(name = "Jon Snow").asJson)
      )(tenant, session)
      respUpdate.status mustBe 200
      logger.debug(Json.stringify(respUpdate.json))

      val resp2 = httpJsonCallBlocking(s"/api/me/teams/own")(tenant, session)
      resp2.status mustBe 200
      val myTeamUpdated: JsResult[Team] = json.TeamFormat.reads(resp2.json)
      myTeamUpdated.isSuccess mustBe true
      myTeamUpdated.get.name mustBe "Jon Snow"
      myTeamUpdated.get.avatar.get mustBe user.picture
      myTeamUpdated.get.contact mustBe user.email
    }
    "not be updated" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user)
      )

      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(s"/api/me/teams/own")(tenant, session)
      resp.status mustBe 200
      val myTeam: JsResult[Team] = json.TeamFormat.reads(resp.json)
      myTeam.isSuccess mustBe true

      val respUpdate = httpJsonCallBlocking(
        path = s"/api/teams/${myTeam.get.id.value}",
        method = "PUT",
        body = Some(myTeam.get.copy(name = "test").asJson)
      )(tenant, session)
      respUpdate.status mustBe 403
    }
  }
}
