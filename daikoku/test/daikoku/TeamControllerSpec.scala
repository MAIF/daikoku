package fr.maif.otoroshi.daikoku.tests

import com.typesafe.config.ConfigFactory
import fr.maif.otoroshi.daikoku.domain.NotificationAction.{TeamAccess, TeamInvitation}
import fr.maif.otoroshi.daikoku.domain.TeamPermission.{Administrator, ApiEditor, TeamUser}
import fr.maif.otoroshi.daikoku.domain.{TeamType, UserWithPermission}
import fr.maif.otoroshi.daikoku.tests.utils.{DaikokuSpecHelper, OneServerPerSuiteWithMyComponents}
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import play.api.{Configuration, Logger}
import play.api.libs.json._

import scala.util.Random

class TeamControllerSpec(configurationSpec: => Configuration)
    extends PlaySpec
    with OneServerPerSuiteWithMyComponents
    with DaikokuSpecHelper
    with IntegrationPatience {

  override def getConfiguration(configuration: Configuration) =
    configuration ++ configurationSpec ++ Configuration(
      ConfigFactory.parseString(s"""
									 |{
									 |  http.port=$port
									 |  play.server.http.port=$port
									 |}
     """.stripMargin).resolve()
    )

  "a daikoku admin" can {
    "create, update or delete a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq()
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
  }

  "a team administrator" can {
    "create or delete a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val respCreation = httpJsonCallBlocking(
        path = "/api/teams",
        method = "POST",
        body = Some(teamConsumer.asJson)
      )(tenant, session)
      respCreation.status mustBe 201

      //todo: verifier  qu'il en est l'administrateur

      val respDelete = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}",
        method = "DELETE"
      )(tenant, session)
      respDelete.status mustBe 401
    }

    "not delete a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(userAdmin, tenant)

      val respDelete = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}",
        method = "DELETE"
      )(tenant, session)
      respDelete.status mustBe 401
    }

    "update a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner)
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
        httpJsonCallBlocking(
          path = s"/api/me/notifications")(
          tenant,
          userSession)
      respNotification.status mustBe 200

      val notifications = fr.maif.otoroshi.daikoku.domain.json.SeqNotificationFormat
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

      teamOwner.showApiKeyOnlyToAdmins mustBe true
      val resp =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamOwnerId.value}/apiKeys/visibility",
          method = "POST",
          body = Some(Json.obj("showApiKeyOnlyToAdmins" -> false))
        )(tenant, session)
      resp.status mustBe 200

      (resp.json \ "done").as[Boolean] mustBe true
      val updatedTeam = fr.maif.otoroshi.daikoku.domain.json.TeamFormat
        .reads((resp.json \ "team").as[JsObject])
      updatedTeam.isSuccess mustBe true
      updatedTeam.get.showApiKeyOnlyToAdmins mustBe false
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
        httpJsonCallBlocking(path = s"/api/teams/${teamOwnerId.value}/addable-members")(tenant, session)
      respGet.status mustBe 200
      var addableUsers = fr.maif.otoroshi.daikoku.domain.json.SeqUserFormat
        .reads((respGet.json \ "addableUsers").as[JsArray])
      var pendingUsers = fr.maif.otoroshi.daikoku.domain.json.SeqUserFormat
        .reads((respGet.json \ "pendingUsers").as[JsArray])

      pendingUsers.get.size mustBe 0
      addableUsers.get.size mustBe 2

      var respInvit =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamOwnerId.value}/members",
          method = "POST",
          body = Some(Json.obj("members" -> Json.arr(userTeamUserId.asJson))))(
          tenant,
          session)
      respInvit.status mustBe 200

      respGet =
        httpJsonCallBlocking(path = s"/api/teams/${teamOwnerId.value}/addable-members")(tenant, session)
      respGet.status mustBe 200
      addableUsers = fr.maif.otoroshi.daikoku.domain.json.SeqUserFormat
        .reads((respGet.json \ "addableUsers").as[JsArray])
      pendingUsers = fr.maif.otoroshi.daikoku.domain.json.SeqUserFormat
        .reads((respGet.json \ "pendingUsers").as[JsArray])
//
      pendingUsers.get.size mustBe 1
      addableUsers.get.size mustBe 1

      respInvit =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamOwnerId.value}/members",
          method = "POST",
          body = Some(Json.obj("members" -> Json.arr(userApiEditorId.asJson))))(
          tenant,
          session)
      respInvit.status mustBe 200

      respGet =
        httpJsonCallBlocking(path = s"/api/teams/${teamOwnerId.value}/addable-members")(tenant, session)
      respGet.status mustBe 200
      addableUsers = fr.maif.otoroshi.daikoku.domain.json.SeqUserFormat
        .reads((respGet.json \ "addableUsers").as[JsArray])
      pendingUsers = fr.maif.otoroshi.daikoku.domain.json.SeqUserFormat
        .reads((respGet.json \ "pendingUsers").as[JsArray])

      pendingUsers.get.size mustBe 2
      addableUsers.get.size mustBe 0

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

    "list all joinable teams" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, randomUser),
        teams = Seq(
          teamOwner,
          teamConsumer.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator))))
      )
      val session = loginWithBlocking(randomUser, tenant)
      val resp = httpJsonCallBlocking("/api/teams/joinable")(tenant, session)
      resp.status mustBe 200
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

      teamOwner.showApiKeyOnlyToAdmins mustBe true
      val resp =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamOwnerId.value}/apiKeys/visibility",
          method = "POST",
          body = Some(Json.obj("showApiKeyOnlyToAdmins" -> false))
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

      teamOwner.showApiKeyOnlyToAdmins mustBe true
      val resp =
        httpJsonCallBlocking(
          path = s"/api/teams/${myTeamId.value}/apiKeys/visibility",
          method = "POST",
          body = Some(Json.obj("showApiKeyOnlyToAdmins" -> false))
        )(tenant, session)
      resp.status mustBe 409
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
  }
}
