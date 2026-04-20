package fr.maif.daikoku.controllers

import cats.implicits.catsSyntaxOptionId
import com.dimafeng.testcontainers.GenericContainer.FileSystemBind
import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import fr.maif.daikoku.domain.NotificationAction.ApiSubscriptionAccept
import fr.maif.daikoku.domain.NotificationType.AcceptOrReject
import fr.maif.daikoku.domain.TeamPermission.{
  Administrator,
  ApiEditor,
  TeamUser
}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.domain._
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import org.joda.time.DateTime
import org.scalatest.BeforeAndAfter
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.BindMode
import play.api.libs.json._

import scala.concurrent.Await
import scala.concurrent.ExecutionContext
import scala.concurrent.duration.DurationInt
import scala.util.Random

class TeamControllerSpec()
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfter
    with ForAllTestContainer {

  val pwd = System.getProperty("user.dir")
  implicit val ecc: ExecutionContext = daikokuComponents.env.defaultExecutionContext
  implicit val ev: Env = daikokuComponents.env

  private def getMyOwnTeam(user: User, session: UserSession, tenant: Tenant = tenant): Team = {
    httpJsonCallBlocking(
      path = s"/api/me",
    )(using tenant, session)

    val userTeams = Await.result(daikokuComponents.env.dataStore.teamRepo.myTeams(tenant, user), 5.seconds)
    val maybeUserTeam = userTeams.find(_.`type` == TeamType.Personal)
    maybeUserTeam.isDefined mustBe true
    maybeUserTeam.get
  }

  override val container: GenericContainer = GenericContainer(
    "maif/otoroshi",
    exposedPorts = Seq(8080),
    fileSystemBind = Seq(
      FileSystemBind(
        s"$pwd/test/fr/maif/daikoku/controllers/otoroshi.json",
        "/home/user/otoroshi.json",
        BindMode.READ_ONLY
      )
    ),
    env = Map("APP_IMPORT_FROM" -> "/home/user/otoroshi.json")
  )

  before {
    Await.result(cleanOtoroshiServer(container.mappedPort(8080)), 5.seconds)
  }

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
      )(using tenant, session)
      respCreation.status mustBe 201

      val respCreation2 = httpJsonCallBlocking(
        path = "/api/teams",
        method = "POST",
        body = Some(teamOwner.asJson)
      )(using tenant, session)
      respCreation2.status mustBe 409

      val respUpdate = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}",
        method = "PUT",
        body = Some(teamOwner.copy(name = "bobby team").asJson)
      )(using tenant, session)
      respUpdate.status mustBe 200

      val respGet =
        httpJsonCallBlocking(s"/api/teams/${teamOwnerId.value}")(
          using tenant,
          session
        )
      val updatedTeam =
        fr.maif.daikoku.domain.json.TeamFormat.reads(respGet.json)
      updatedTeam.isSuccess mustBe true
      updatedTeam.get.name mustBe "bobby team"

      val respUpdateNotFound = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}",
        method = "PUT",
        body = Some(teamOwner.copy(name = "bobby team").asJson)
      )(using tenant, session)
      respUpdateNotFound.status mustBe 404

      val respDelete = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}",
        method = "DELETE"
      )(using tenant, session)
      respDelete.status mustBe 200

      val respDeleteNotFound = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}",
        method = "DELETE"
      )(using tenant, session)
      respDeleteNotFound.status mustBe 404
    }

    "create team even if teamCreationSecurity is active" in {
      setupEnvBlocking(
        tenants = Seq(tenant.copy(teamCreationSecurity = true.some)),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam)
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val respCreation = httpJsonCallBlocking(
        path = "/api/teams",
        method = "POST",
        body = Some(teamOwner.asJson)
      )(using tenant, session)
      respCreation.status mustBe 201
    }

    "not add/remove member from a personal team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, user),
        teams = Seq(teamOwner)
      )
      val dkAdminSession = loginWithBlocking(daikokuAdmin, tenant)
      val userSession = loginWithBlocking(user, tenant)

      val userTeamId = getMyOwnTeam(user, userSession).id

      val respRemoveDenied = httpJsonCallBlocking(
        path = s"/api/teams/${userTeamId.value}/members/${user.id.value}",
        method = "DELETE"
      )(using tenant, dkAdminSession)

      respRemoveDenied.status mustBe 409

      val respAddDenied = httpJsonCallBlocking(
        path = s"/api/teams/${userTeamId.value}/members",
        method = "POST",
        body = Some(Json.obj("members" -> Json.arr(daikokuAdmin.id.asJson)))
      )(using tenant, dkAdminSession)

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
      )(using tenant, session)
      respUpdate.status mustBe 200

      val respGet =
        httpJsonCallBlocking(s"/api/teams/${teamOwnerId.value}")(
          using tenant,
          session
        )
      val updatedTeam =
        fr.maif.daikoku.domain.json.TeamFormat.reads(respGet.json)
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
      )(using tenant, session)
      respDelete.status mustBe 403
    }

    "list all teams" in {
      setupEnvBlocking(
        tenants = Seq(tenant.copy(subscriptionSecurity = Some(true))),
        users = Seq(userAdmin, tenantAdmin),
        teams = Seq(teamOwner, teamConsumer, defaultAdminTeam)
      )
      val session = loginWithBlocking(tenantAdmin, tenant)
      val resp = httpJsonCallBlocking(
        "/api/search",
        "POST",
        body = Some(
          Json.obj(
            "query" ->
              """
                |query getAllteams($research: String, $limit: Int, $offset: Int) {
                |    teamsPagination(research: $research, limit: $limit, offset: $offset) {
                |      teams {
                |        _id
                |        _humanReadableId
                |        name
                |        avatar
                |        type
                |      }
                |      total
                |    }
                |  }
                |""".stripMargin,
            "variables" -> Json.obj(
              "research" -> "",
              "limit" -> 10,
              "offset" -> 0
            )
          )
        )
      )(using tenant, session)

      resp.status mustBe 200
      val result = (resp.json \ "data" \ "teamsPagination" \ "total").as[Int]
      result mustBe 2

      setupEnvBlocking(
        tenants = Seq(tenant.copy(subscriptionSecurity = Some(false))),
        users = Seq(userAdmin, tenantAdmin),
        teams = Seq(teamOwner, teamConsumer, defaultAdminTeam)
      )
      val session2 = loginWithBlocking(tenantAdmin, tenant)
      val resp2 = httpJsonCallBlocking(
        "/api/search",
        "POST",
        body = Some(
          Json.obj(
            "query" ->
              """
                |query getAllteams {
                |    teamsPagination {
                |      teams {
                |        _id
                |        _humanReadableId
                |        name
                |        avatar
                |        type
                |      }
                |      total
                |    }
                |  }
                |""".stripMargin
          )
        )
      )(using tenant, session2)
      resp2.status mustBe 200

      val result2 = (resp2.json \ "data" \ "teamsPagination" \ "total").as[Int]
      result2 mustBe 4
    }
  }

  "a tenant admin" can {
    "create team even if teamCreationSecurity is active" in {
      setupEnvBlocking(
        tenants = Seq(tenant.copy(teamCreationSecurity = true.some)),
        users = Seq(daikokuAdmin, tenantAdmin),
        teams = Seq(defaultAdminTeam)
      )
      val session = loginWithBlocking(tenantAdmin, tenant)
      val respCreation = httpJsonCallBlocking(
        path = "/api/teams",
        method = "POST",
        body = Some(teamOwner.asJson)
      )(using tenant, session)
      respCreation.status mustBe 201
    }

    "list members of a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant.copy(teamCreationSecurity = true.some)),
        users = Seq(daikokuAdmin, tenantAdmin, user, userAdmin, userApiEditor),
        teams = Seq(defaultAdminTeam, teamOwner)
      )
      val session = loginWithBlocking(tenantAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/members"
      )(using tenant, session)
      resp.status mustBe 200
      resp.json.as[JsArray].value.size mustBe 3
    }

    "update a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, tenantAdmin),
        teams = Seq(teamOwner, defaultAdminTeam)
      )
      val session = loginWithBlocking(tenantAdmin, tenant)
      val respCreation = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}",
        method = "PUT",
        body = Some(teamOwner.copy(name = "bobby team").asJson)
      )(using tenant, session)
      respCreation.status mustBe 200

      val respGet =
        httpJsonCallBlocking(s"/api/teams/${teamOwnerId.value}")(
          using tenant,
          session
        )
      val updatedTeam =
        fr.maif.daikoku.domain.json.TeamFormat.reads(respGet.json)
      updatedTeam.isSuccess mustBe true
      updatedTeam.get.name mustBe "bobby team"
    }

    "have full access to a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, tenantAdmin),
        teams = Seq(teamOwner, defaultAdminTeam)
      )
      val session = loginWithBlocking(tenantAdmin, tenant)

      val respGet = httpJsonCallBlocking(
        s"/api/teams/${teamOwnerId.value}/_full"
      )(using tenant, session)
      respGet.status mustBe 200
      respGet.json mustBe teamOwner.asJson.as[JsObject] ++ Json.obj(
        "translation" -> Json.obj()
      )
    }

    "invit members to a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user, tenantAdmin),
        teams = Seq(
          defaultAdminTeam,
          teamOwner.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator))
          )
        )
      )
      val session = loginWithBlocking(tenantAdmin, tenant)

      val respUpdate =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamOwnerId.value}/members",
          method = "POST",
          body = Some(Json.obj("members" -> Json.arr(userTeamUserId.asJson)))
        )(using tenant, session)
      respUpdate.status mustBe 200
      (respUpdate.json \ "done").as[Boolean] mustBe true

      val userSession = loginWithBlocking(user, tenant)
      val respNotification = getOwnNotificationsCallBlocking(
        Json.obj(
          "filterTable" -> Json.stringify(
            Json.arr(
              Json
                .obj("id" -> "type", "value" -> Json.arr("TeamInvitation"))
            )
          )
        )
      )(
        using tenant,
        userSession
      )

      respNotification.status mustBe 200
      (respNotification.json \ "data" \ "myNotifications" \ "totalFiltered")
        .as[Long] mustBe 1
      val notifications =
        (respNotification.json \ "data" \ "myNotifications" \ "notifications")
          .as[JsArray]

      val notification = notifications.head

      (notification \ "action" \ "__typename")
        .as[String] mustBe "TeamInvitation"
      (notification \ "action" \ "team" \ "_id")
        .as(using json.TeamIdFormat) mustBe teamOwnerId
    }

    "remove members to a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user, tenantAdmin),
        teams = Seq(teamOwner, defaultAdminTeam)
      )
      val session = loginWithBlocking(tenantAdmin, tenant)

      teamOwner.users.size mustBe 3

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/members/${userTeamUserId.value}",
        method = "DELETE"
      )(using tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true
      val updatedTeam = fr.maif.daikoku.domain.json.TeamFormat
        .reads((resp.json \ "team").as[JsObject])
      updatedTeam.isSuccess mustBe true
      updatedTeam.get.users.size mustBe 2
      updatedTeam.get.users.exists(u => u.userId == userTeamUserId) mustBe false
    }

    "update permission's member in a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user, tenantAdmin),
        teams = Seq(teamOwner, defaultAdminTeam)
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
      )(using tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true
      val updatedTeam = fr.maif.daikoku.domain.json.TeamFormat
        .reads((resp.json \ "team").as[JsObject])
      updatedTeam.isSuccess mustBe true
      val updatedUser =
        updatedTeam.get.users.find(u => u.userId == userTeamUserId)
      updatedUser.isDefined mustBe true
      updatedUser.get.teamPermission mustBe Administrator
    }

    "see a member of a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user, tenantAdmin),
        teams = Seq(
          defaultAdminTeam,
          teamOwner,
          teamConsumer.copy(
            users = Set(UserWithPermission(userTeamUserId, Administrator))
          )
        )
      )
      val session = loginWithBlocking(tenantAdmin, tenant)
      val resp =
        httpJsonCallBlocking(
          s"/api/teams/${teamOwnerId.value}/members/${userTeamUserId.value}"
        )(using tenant, session)
      resp.status mustBe 200
      resp.json mustBe user.asSimpleJson
    }

    "list a team members" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user, userApiEditor, tenantAdmin),
        teams = Seq(
          defaultAdminTeam,
          teamOwner,
          teamConsumer.copy(
            users = Set(UserWithPermission(userTeamUserId, Administrator))
          )
        )
      )
      val session = loginWithBlocking(tenantAdmin, tenant)
      val resp =
        httpJsonCallBlocking(s"/api/teams/${teamOwnerId.value}/members")(
          using tenant,
          session
        )
      resp.status mustBe 200
      val users =
        fr.maif.daikoku.domain.json.SeqUserFormat.reads(resp.json)
      users.isSuccess mustBe true
      users.get.length mustBe 3
      users.get.map(_.id).toSet mustEqual Set(
        userTeamAdminId,
        userApiEditorId,
        userTeamUserId
      )
    }

    "update api key visibility" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user, userApiEditor, tenantAdmin),
        teams = Seq(teamOwner, defaultAdminTeam)
      )
      val session = loginWithBlocking(tenantAdmin, tenant)

      teamOwner.apiKeyVisibility mustBe Some(TeamApiKeyVisibility.User)
      val resp =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamOwnerId.value}",
          method = "PUT",
          body = Some(
            teamOwner
              .copy(apiKeyVisibility = Some(TeamApiKeyVisibility.Administrator))
              .asJson
          )
        )(using tenant, session)
      resp.status mustBe 200

      val updatedTeam = fr.maif.daikoku.domain.json.TeamFormat
        .reads(resp.json.as[JsObject])
      updatedTeam.isSuccess mustBe true
      updatedTeam.get.apiKeyVisibility mustBe Some(
        TeamApiKeyVisibility.Administrator
      )
    }

    "get addable and pending user for his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user, userApiEditor, tenantAdmin),
        teams = Seq(
          defaultAdminTeam,
          teamOwner.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator))
          )
        )
      )
      val session = loginWithBlocking(tenantAdmin, tenant)

      var respGet =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamOwnerId.value}/pending-members"
        )(using tenant, session)
      respGet.status mustBe 200
      var pendingUsers = fr.maif.daikoku.domain.json.SeqUserFormat
        .reads((respGet.json \ "pendingUsers").as[JsArray])

      pendingUsers.get.size mustBe 0

      var respInvit =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamOwnerId.value}/members",
          method = "POST",
          body = Some(Json.obj("members" -> Json.arr(userTeamUserId.asJson)))
        )(using tenant, session)
      respInvit.status mustBe 200

      respGet = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/pending-members"
      )(using tenant, session)
      respGet.status mustBe 200
      pendingUsers = fr.maif.daikoku.domain.json.SeqUserFormat
        .reads((respGet.json \ "pendingUsers").as[JsArray])
      //
      pendingUsers.get.size mustBe 1

      respInvit = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/members",
        method = "POST",
        body = Some(Json.obj("members" -> Json.arr(userApiEditorId.asJson)))
      )(using tenant, session)
      respInvit.status mustBe 200

      respGet = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/pending-members"
      )(using tenant, session)
      respGet.status mustBe 200
      pendingUsers = fr.maif.daikoku.domain.json.SeqUserFormat
        .reads((respGet.json \ "pendingUsers").as[JsArray])

      pendingUsers.get.size mustBe 2
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
      )(using tenant, session)
      respCreation.status mustBe 201

      val respDelete = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}",
        method = "DELETE"
      )(using tenant, session)
      respDelete.status mustBe 200
    }

    "not delete an another team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(
          teamOwner.copy(users =
            Set(UserWithPermission(user.id, TeamPermission.Administrator))
          ),
          defaultAdminTeam
        )
      )
      val session = loginWithBlocking(userAdmin, tenant)

      val respDelete = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}",
        method = "DELETE"
      )(using tenant, session)
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
      )(using tenant, session)
      respCreation.status mustBe 200

      val respGet =
        httpJsonCallBlocking(s"/api/teams/${teamOwnerId.value}")(
          using tenant,
          session
        )
      val updatedTeam =
        fr.maif.daikoku.domain.json.TeamFormat.reads(respGet.json)
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
        s"/api/teams/${teamOwnerId.value}/_full"
      )(using tenant, session)
      respGet.status mustBe 200
      respGet.json mustBe teamOwner.asJson.as[JsObject] ++ Json.obj(
        "translation" -> Json.obj()
      )
    }

    "invit members to his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user),
        teams = Seq(
          teamOwner.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator))
          )
        )
      )
      val session = loginWithBlocking(userAdmin, tenant)

      val respUpdate =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamOwnerId.value}/members",
          method = "POST",
          body = Some(Json.obj("members" -> Json.arr(userTeamUserId.asJson)))
        )(using tenant, session)
      respUpdate.status mustBe 200
      (respUpdate.json \ "done").as[Boolean] mustBe true

      val userSession = loginWithBlocking(user, tenant)
      val respNotification = getOwnNotificationsCallBlocking(
        Json.obj(
          "filterTable" -> Json.stringify(
            Json.arr(
              Json
                .obj("id" -> "type", "value" -> Json.arr("TeamInvitation"))
            )
          )
        )
      )(
        using tenant,
        userSession
      )

      respNotification.status mustBe 200
      (respNotification.json \ "data" \ "myNotifications" \ "totalFiltered")
        .as[Long] mustBe 1
      val notifications =
        (respNotification.json \ "data" \ "myNotifications" \ "notifications")
          .as[JsArray]

      val notification = notifications.head

      (notification \ "action" \ "__typename")
        .as[String] mustBe "TeamInvitation"
      (notification \ "action" \ "team" \ "_id")
        .as(using json.TeamIdFormat) mustBe teamOwnerId
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
        method = "DELETE"
      )(using tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true
      val updatedTeam = fr.maif.daikoku.domain.json.TeamFormat
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
      )(using tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true
      val updatedTeam = fr.maif.daikoku.domain.json.TeamFormat
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
        teams = Seq(
          teamOwner,
          teamConsumer.copy(
            users = Set(UserWithPermission(userTeamUserId, Administrator))
          )
        )
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp =
        httpJsonCallBlocking(
          s"/api/teams/${teamOwnerId.value}/members/${userTeamUserId.value}"
        )(using tenant, session)
      resp.status mustBe 200
      resp.json mustBe user.asSimpleJson

      val respForbidden =
        httpJsonCallBlocking(
          s"/api/teams/${teamConsumerId.value}/members/${userTeamUserId.value}"
        )(using tenant, session)
      respForbidden.status mustBe 403
    }

    "list his team members" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user, userApiEditor),
        teams = Seq(
          teamOwner,
          teamConsumer.copy(
            users = Set(UserWithPermission(userTeamUserId, Administrator))
          )
        )
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp =
        httpJsonCallBlocking(s"/api/teams/${teamOwnerId.value}/members")(
          using tenant,
          session
        )
      resp.status mustBe 200
      val users =
        fr.maif.daikoku.domain.json.SeqUserFormat.reads(resp.json)
      users.isSuccess mustBe true
      users.get.length mustBe 3
      users.get.map(_.id).toSet mustEqual Set(
        userTeamAdminId,
        userApiEditorId,
        userTeamUserId
      )

      val respForbidden =
        httpJsonCallBlocking(s"/api/teams/${teamConsumerId.value}/members")(
          using tenant,
          session
        )
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
              .asJson
          )
        )(using tenant, session)
      resp.status mustBe 200

      val updatedTeam = fr.maif.daikoku.domain.json.TeamFormat
        .reads(resp.json.as[JsObject])
      updatedTeam.isSuccess mustBe true
      updatedTeam.get.apiKeyVisibility mustBe Some(
        TeamApiKeyVisibility.Administrator
      )
    }

    "get addable and pending user for his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user, userApiEditor),
        teams = Seq(
          teamOwner.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator))
          )
        )
      )
      val session = loginWithBlocking(userAdmin, tenant)

      var respGet =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamOwnerId.value}/pending-members"
        )(using tenant, session)
      respGet.status mustBe 200
      var pendingUsers = fr.maif.daikoku.domain.json.SeqUserFormat
        .reads((respGet.json \ "pendingUsers").as[JsArray])

      pendingUsers.get.size mustBe 0

      var respInvit =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamOwnerId.value}/members",
          method = "POST",
          body = Some(Json.obj("members" -> Json.arr(userTeamUserId.asJson)))
        )(using tenant, session)
      respInvit.status mustBe 200

      respGet = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/pending-members"
      )(using tenant, session)
      respGet.status mustBe 200
      pendingUsers = fr.maif.daikoku.domain.json.SeqUserFormat
        .reads((respGet.json \ "pendingUsers").as[JsArray])
//
      pendingUsers.get.size mustBe 1

      respInvit = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/members",
        method = "POST",
        body = Some(Json.obj("members" -> Json.arr(userApiEditorId.asJson)))
      )(using tenant, session)
      respInvit.status mustBe 200

      respGet = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/pending-members"
      )(using tenant, session)
      respGet.status mustBe 200
      pendingUsers = fr.maif.daikoku.domain.json.SeqUserFormat
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
      )(using tenant, session)
      respUpdate.status mustBe 200

      val respGet =
        httpJsonCallBlocking(s"/api/teams/${teamOwnerId.value}")(
          using tenant,
          session
        )
      val updatedTeam =
        fr.maif.daikoku.domain.json.TeamFormat.reads(respGet.json)
      updatedTeam.isSuccess mustBe true
      updatedTeam.get.apisCreationPermission mustBe None
    }
  }

  "a user or api editor" can {
    val randomUser = Random.shuffle(Seq(user, userApiEditor)).head

    "not create team even if teamCreationSecurity is active" in {
      setupEnvBlocking(
        tenants = Seq(tenant.copy(teamCreationSecurity = true.some)),
        users = Seq(daikokuAdmin, randomUser),
        teams = Seq(defaultAdminTeam)
      )
      val session = loginWithBlocking(randomUser, tenant)
      val respCreation = httpJsonCallBlocking(
        path = "/api/teams",
        method = "POST",
        body = Some(teamOwner.asJson)
      )(using tenant, session)
      respCreation.status mustBe 403
    }

    "create team if teamCreationSecurity is inactive" in {
      setupEnvBlocking(
        tenants = Seq(tenant.copy(teamCreationSecurity = false.some)),
        users = Seq(daikokuAdmin, randomUser),
        teams = Seq(defaultAdminTeam)
      )
      val session = loginWithBlocking(randomUser, tenant)
      val respCreation = httpJsonCallBlocking(
        path = "/api/teams",
        method = "POST",
        body = Some(teamOwner.asJson)
      )(using tenant, session)
      respCreation.status mustBe 201
    }

    "not have full access to a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(randomUser),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(randomUser, tenant)

      val respGet = httpJsonCallBlocking(
        s"/api/teams/${teamOwnerId.value}/_full"
      )(using tenant, session)
      respGet.status mustBe 403
    }

    "not add or delete user" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(randomUser),
        teams = Seq(
          teamOwner
            .copy(users = Set(UserWithPermission(randomUser.id, TeamUser)))
        )
      )
      val session = loginWithBlocking(randomUser, tenant)

      val respUpdate =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamOwnerId.value}/members",
          method = "POST",
          body = Some(Json.obj("members" -> Json.arr(userAdmin.asJson)))
        )(using tenant, session)
      respUpdate.status mustBe 403

      val respDelete = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/members/${userTeamAdminId.value}",
        method = "DELETE"
      )(using tenant, session)
      respDelete.status mustBe 403
    }

    "not add or delete user, even in his personal team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(randomUser, userAdmin),
        teams = Seq(teamOwner)
      )
      val session = loginWithBlocking(randomUser, tenant)
      val myTeamId = getMyOwnTeam(randomUser, session).id

      val respUpdate =
        httpJsonCallBlocking(
          path = s"/api/teams/${myTeamId.value}/members",
          method = "POST",
          body = Some(Json.obj("members" -> Json.arr(userAdmin.asJson)))
        )(using tenant, session)
      respUpdate.status mustBe 409

      val respDelete = httpJsonCallBlocking(
        path = s"/api/teams/${myTeamId.value}/members/${userTeamAdminId.value}",
        method = "DELETE"
      )(using tenant, session)
      respDelete.status mustBe 409
    }

    "not update permission's member in his team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, randomUser),
        teams = Seq(
          teamOwner
            .copy(users = Set(UserWithPermission(randomUser.id, TeamUser)))
        )
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
      )(using tenant, session)
      resp.status mustBe 403
    }

    "not update permission's member in his team, even in his personal team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, randomUser)
      )
      val session = loginWithBlocking(randomUser, tenant)

      val myTeamId = getMyOwnTeam(randomUser, session).id

      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${myTeamId.value}/members/_permission",
        method = "POST",
        body = Some(
          Json.obj(
            "members" -> Json.arr(randomUser.id.value),
            "permission" -> ApiEditor.name
          )
        )
      )(using tenant, session)
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
              .asJson
          )
        )(using tenant, session)
      resp.status mustBe 403
    }

    "not update apikey visibility even in his personal team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, randomUser)
      )
      val session = loginWithBlocking(randomUser, tenant)
      val myTeam = getMyOwnTeam(randomUser, session)

      teamOwner.apiKeyVisibility mustBe Some(TeamApiKeyVisibility.User)
      val resp =
        httpJsonCallBlocking(
          path = s"/api/teams/${myTeam.id.value}",
          method = "PUT",
          body = Some(
            myTeam
              .copy(apiKeyVisibility = Some(TeamApiKeyVisibility.ApiEditor))
              .asJson
          )
        )(using tenant, session)
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
        api = defaultApi.api.id,
        by = daikokuAdminId,
        customName = None,
        rotation = None,
        integrationToken = "test"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        teams = Seq(teamOwner, teamConsumer.copy(users = Set.empty)),
        users = Seq(userAdmin, randomUser),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api),
        subscriptions = Seq(sub),
        notifications = Seq(
          Notification(
            id = NotificationId("untreated-notification"),
            tenant = tenant.id,
            team = Some(teamOwnerId),
            sender = user.asNotificationSender,
            notificationType = AcceptOrReject,
            action = ApiSubscriptionAccept(
              defaultApi.api.id,
              subPlanId,
              teamConsumerId
            )
          )
        )
      )
      val session = loginWithBlocking(randomUser, tenant)
      val resp =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamOwnerId.value}/home"
        )(using tenant, session)
      resp.status mustBe 200

      val team =
        fr.maif.daikoku.domain.json.TeamFormat.reads(resp.json)
      team.isSuccess mustBe true
      team.get.name mustBe teamOwner.name

      (resp.json \ "apisCount").as[Int] mustBe 1
      (resp.json \ "subscriptionsCount").as[Int] mustBe 1
      (resp.json \ "notificationCount").as[Int] mustBe 1

      val respDenied =
        httpJsonCallBlocking(
          path = s"/api/teams/${teamConsumerId.value}/home"
        )(using tenant, session)
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
      )(using tenant, session)
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
      )(using tenant, session)
      respUpdateNotFound.status mustBe 403
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
      )(using tenant, session)
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
              .asJson
          )
        )(using tenant, session)
      resp.status mustBe 403
    }

    "not see its member permission updated" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(
          defaultAdminTeam.copy(
            users = Set(
              UserWithPermission(tenantAdmin.id, Administrator),
              UserWithPermission(user.id, Administrator)
            )
          )
        )
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
      )(using tenant, session)
      resp.status mustBe 409
    }

  }

  "a personal team" must {
    "have always the same informations than it user" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user)
      )

      val session = loginWithBlocking(user, tenant)

      val respUpdate = httpJsonCallBlocking(
        path = s"/api/admin/users/${user.id.value}",
        method = "PUT",
        body = Some(user.copy(name = "Jon Snow").asJson)
      )(using tenant, session)
      respUpdate.status mustBe 200

      val myTeamUpdated = getMyOwnTeam(user, session)
      myTeamUpdated.name mustBe "Jon Snow"
      myTeamUpdated.avatar.get mustBe user.picture
      myTeamUpdated.contact mustBe user.email
    }
    "not be updated" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user)
      )

      val session = loginWithBlocking(user, tenant)
      val myTeam = getMyOwnTeam(user, session)

      val respUpdate = httpJsonCallBlocking(
        path = s"/api/teams/${myTeam.id.value}",
        method = "PUT",
        body = Some(myTeam.copy(name = "test").asJson)
      )(using tenant, session)
      respUpdate.status mustBe 403
    }
    "be able to subscribe to an API and delete it" in {
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

      Await.result(waitForDaikokuSetup(), 5.second)
      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            subscriptionSecurity = false.some,
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
        usagePlans = Seq(plan, adminApiPlan),
        apis = Seq(api, adminApi)
      )

      val session = loginWithBlocking(user, tenant)
      val myTeam = getMyOwnTeam(user, session)

      val respSub = httpJsonCallBlocking(
        path =
          s"/api/apis/${api.id.value}/plan/${plan.id.value}/team/${myTeam.id.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(using tenant, session)
      logger.warn(Json.stringify(respSub.json))
      respSub.status mustBe 200

      val personalSub =
        (respSub.json \ "subscription").as(using json.ApiSubscriptionFormat)

      // get key in oto and test secret
      val respOtoApikey = httpJsonCallWithoutSessionBlocking(
        path =
          s"/apis/apim.otoroshi.io/v1/apikeys/${personalSub.apiKey.clientId}",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret
        ),
        baseUrl = "http://otoroshi-api.oto.tools",
        port = container.mappedPort(8080),
        hostHeader = "otoroshi-api.oto.tools"
      )(using tenant)
      logger.warn(Json.stringify(respOtoApikey.json))
      respOtoApikey.status mustBe 200

      val otoApiKey = respOtoApikey.json.as(using json.ActualOtoroshiApiKeyFormat)
      otoApiKey.clientSecret mustBe personalSub.apiKey.clientSecret

      val respDelete = httpJsonCallBlocking(
        path =
          s"/api/teams/${myTeam.id.value}/subscriptions/${personalSub.id.value}",
        method = "DELETE"
      )(using tenant, session)
      respDelete.status mustBe 200

      val respOtoApikey2 = httpJsonCallWithoutSessionBlocking(
        path =
          s"/apis/apim.otoroshi.io/v1/apikeys/${personalSub.apiKey.clientId}",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret
        ),
        baseUrl = "http://otoroshi-api.oto.tools",
        port = container.mappedPort(8080),
        hostHeader = "otoroshi-api.oto.tools"
      )(using tenant)
      respOtoApikey2.status mustBe 404
    }
  }

  "a team" must {
    "use only authorized otoroshi entities" in {
      val planOk = UsagePlan(
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

      val planKo = UsagePlan(
        id = UsagePlanId("parent.ko"),
        tenant = tenant.id,
        customName = "free without quotas",
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

      val api = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq().empty,
        defaultUsagePlan = None
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
        users = Seq(userAdmin),
        apis = Seq(api),
        usagePlans = Seq.empty,
        teams = Seq(
          teamConsumer,
          teamOwner.copy(
            authorizedOtoroshiEntities = Some(
              Seq(
                TeamAuthorizedEntities(
                  containerizedOtoroshi,
                  AuthorizedEntities(
                    routes = Set(
                      OtoroshiRouteId(parentRouteId),
                      OtoroshiRouteId(childRouteId)
                    ),
                    groups = Set(OtoroshiServiceGroupId(serviceGroupDev))
                  )
                )
              )
            )
          )
        )
      )

      val session = loginWithBlocking(userAdmin, tenant)

      val respRouteOk = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${api.id.value}/${api.currentVersion.value}/plan",
        method = "POST",
        body = planOk.asJson.some
      )(using tenant, session)
      respRouteOk.status mustBe 201

      val respGroupOk = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${api.id.value}/${api.currentVersion.value}/plan",
        method = "POST",
        body = planOk
          .copy(
            id = UsagePlanId("plan.group.ok"),
            otoroshiTarget = Some(
              OtoroshiTarget(
                containerizedOtoroshi,
                Some(
                  AuthorizedEntities(
                    groups = Set(OtoroshiServiceGroupId(serviceGroupDev))
                  )
                )
              )
            )
          )
          .asJson
          .some
      )(using tenant, session)
      respGroupOk.status mustBe 201

      val respKO = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${api.id.value}/${api.currentVersion.value}/plan",
        method = "POST",
        body = planKo.asJson.some
      )(using tenant, session)
      respKO.status mustBe 401

      val respGroupKo = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${api.id.value}/${api.currentVersion.value}/plan",
        method = "POST",
        body = planOk
          .copy(
            id = UsagePlanId("plan.group.ok"),
            otoroshiTarget = Some(
              OtoroshiTarget(
                containerizedOtoroshi,
                Some(
                  AuthorizedEntities(
                    groups = Set(OtoroshiServiceGroupId(serviceGroupDefault))
                  )
                )
              )
            )
          )
          .asJson
          .some
      )(using tenant, session)
      respGroupKo.status mustBe 401
    }
  }
}
