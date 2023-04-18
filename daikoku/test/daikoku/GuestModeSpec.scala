package fr.maif.otoroshi.daikoku.tests

import com.typesafe.config.ConfigFactory
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.tests.utils.{
  DaikokuSpecHelper,
  OneServerPerSuiteWithMyComponents
}
import org.scalatest.BeforeAndAfterEach
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import play.api.Configuration
import play.api.libs.json.{JsArray, JsObject, Json}

class GuestModeSpec()
    extends PlaySpec
    with OneServerPerSuiteWithMyComponents
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfterEach {

  "A guest user" can {
    "access to team list" in {
      val publicTenant = tenant.copy(isPrivate = false)
      setupEnvBlocking(
        tenants = Seq(publicTenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner)
      )

      val resp =
        httpJsonCallWithoutSessionBlocking(path = s"/api/teams")(publicTenant)
      resp.status mustBe 200
      val allTeams =
        fr.maif.otoroshi.daikoku.domain.json.SeqTeamFormat.reads(resp.json)
      allTeams.isSuccess mustBe true
      allTeams.get.size mustBe 1
      allTeams.get.exists(t => t.id == teamOwnerId) mustBe true
    }

    "access to his teams" in {
      val publicTenant = tenant.copy(isPrivate = false)
      setupEnvBlocking(
        tenants = Seq(publicTenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner)
      )

      val resp = httpJsonCallWithoutSessionBlocking(
        path = s"/api/search",
        "POST",
        body = Some(
          Json.obj(
            "query" -> """
                     |query MyTeams {
                     |    myTeams {
                     |      name
                     |      _humanReadableId
                     |      tenant {
                     |         id
                     |      }
                     |      _id
                     |      type
                     |      contact
                     |      users {
                     |        user {
                     |          userId: id
                     |        }
                     |        teamPermission
                     |      }
                     |    }
                     |  }
                     |""".stripMargin
          ))
      )(publicTenant)
      resp.status mustBe 200
      val myTeam =
        fr.maif.otoroshi.daikoku.domain.json.SeqTeamFormat.reads(
          (resp.json \ "data" \ "myTeams")
            .as[JsArray]
            .value
            .foldLeft(JsArray())((acc, team) =>
              acc :+ team
                .as[JsObject]
                .deepMerge(
                  Json.obj("_tenant" -> (team \ "tenant" \ "id").as[String]))))
      myTeam.isSuccess mustBe true
      myTeam.get.size mustBe 0
    }

    "access to a team" in {
      val publicTenant = tenant.copy(isPrivate = false)
      setupEnvBlocking(
        tenants = Seq(publicTenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner)
      )

      val resp = httpJsonCallWithoutSessionBlocking(
        path = s"/api/teams/${teamOwnerId.value}")(publicTenant)
      resp.status mustBe 200
      val team =
        fr.maif.otoroshi.daikoku.domain.json.TeamFormat.reads(resp.json)
      team.isSuccess mustBe true
      team.get.id mustBe teamOwnerId

    }

    "get visible apis" in {
      val publicTenant = tenant.copy(isPrivate = false)
      val publicApi = defaultApi.copy(id = ApiId("public"))
      val privateApi = defaultApi.copy(id = ApiId("private"),
                                       visibility = ApiVisibility.Private,
                                       name = "private api")

      setupEnvBlocking(
        tenants = Seq(publicTenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        apis = Seq(publicApi, privateApi)
      )

      val resp = httpJsonCallWithoutSessionBlocking(
        path = s"/api/search",
        "POST",
        body = Some(
          Json.obj(
            "variables" -> Json.obj("limit" -> 10, "offset" -> 0),
            "query" -> s"""
            |query AllVisibleApis ($$limit: Int, $$offset: Int) {
            |          visibleApis (limit: $$limit, offset: $$offset){
            |            apis {
            |              api {
            |                _id
            |              }
            |            }
            |          }
            |        }
            |""".stripMargin
          ))
      )(publicTenant)
      resp.status mustBe 200

      val apis =
        (resp.json \ "data" \ "visibleApis" \ "apis")
          .as[JsArray]
          .value
      apis.size mustBe 1
      apis.toList
        .map(js => js.toString())
        .mkString
        .contains(publicApi.id.value) mustBe true

    }
    "get visible apis of team" in {
      val publicTenant = tenant.copy(isPrivate = false)
      val publicApi = defaultApi.copy(id = ApiId("public"))
      val privateApi = defaultApi.copy(id = ApiId("private"),
                                       visibility = ApiVisibility.Private,
                                       name = "private api")

      setupEnvBlocking(
        tenants = Seq(publicTenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        apis = Seq(publicApi, privateApi)
      )

      val resp = httpJsonCallWithoutSessionBlocking(
        path = s"/api/search",
        "POST",
        body = Some(
          Json.obj(
            "variables" -> Json.obj("teamId" -> teamOwnerId.value,
                                    "limit" -> 5,
                                    "offset" -> 0),
            "query" -> s"""
            |query AllVisibleApis ($$teamId: String, $$limit: Int, $$offset: Int) {
            |      visibleApis (teamId: $$teamId, limit: $$limit, offset: $$offset) {
            |        apis {
            |          api {
            |            _id
            |          }
            |        }
            |    }
            |}
            |""".stripMargin
          ))
      )(publicTenant)
      resp.status mustBe 200
      val apis =
        (resp.json \ "data" \ "visibleApis" \ "apis")
          .as[JsArray]
          .value
      apis.size mustBe 1
      apis.toList
        .map(js => js.toString())
        .mkString
        .contains(publicApi.id.value) mustBe true
    }

    "get one visible api" in {
      val publicTenant = tenant.copy(isPrivate = false)
      val publicApi =
        defaultApi.copy(id = ApiId("public"), visibility = ApiVisibility.Public)
      val privateApi = defaultApi.copy(id = ApiId("private"),
                                       visibility = ApiVisibility.Private)

      setupEnvBlocking(
        tenants = Seq(publicTenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        apis = Seq(publicApi, privateApi)
      )

      val resp = httpJsonCallWithoutSessionBlocking(
        path = s"/api/me/visible-apis/${publicApi.id.value}")(publicTenant)
      resp.status mustBe 200
      val api = fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(resp.json)
      api.isSuccess mustBe true
      api.get.id mustBe publicApi.id

      val respError = httpJsonCallWithoutSessionBlocking(
        path = s"/api/me/visible-apis/${privateApi.id.value}")(publicTenant)
      respError.status mustBe 401
    }

    "not update a team" in {}
    "not delete a team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner)
      )

      val respDelete = httpJsonCallWithoutSessionBlocking(
        path = s"/api/teams/${teamOwnerId.value}",
        method = "DELETE"
      )(tenant)
      respDelete.status mustBe 303
    }
    "not create/update/delete team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner)
      )

      val respCreate = httpJsonCallWithoutSessionBlocking(
        path = s"/api/teams",
        method = "POST",
        body = Some(teamOwner.copy(name = "test").asJson)
      )(tenant)
      respCreate.status mustBe 303

      val respUpdate = httpJsonCallWithoutSessionBlocking(
        path = s"/api/teams/${teamOwnerId.value}",
        method = "PUT",
        body = Some(teamOwner.copy(name = "test").asJson)
      )(tenant)
      respUpdate.status mustBe 303

      val respDelete = httpJsonCallWithoutSessionBlocking(
        path = s"/api/teams/${teamOwnerId.value}",
        method = "DELETE"
      )(tenant)
      respDelete.status mustBe 303
    }
    "not create/update/delete user" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner)
      )

      val respCreate = httpJsonCallWithoutSessionBlocking(
        path = s"/api/users",
        method = "POST",
        body = Some(userAdmin.copy(name = "test").asJson)
      )(tenant)
      respCreate.status mustBe 303

      val respUpdate = httpJsonCallWithoutSessionBlocking(
        path = s"/api/users/${userTeamAdminId.value}",
        method = "PUT",
        body = Some(userAdmin.copy(name = "test").asJson)
      )(tenant)
      respUpdate.status mustBe 303

      val respDelete = httpJsonCallWithoutSessionBlocking(
        path = s"/api/users/${userTeamAdminId.value}",
        method = "DELETE"
      )(tenant)
      respDelete.status mustBe 303
    }
    "not get/create/update/delete tenant" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner)
      )

      val respGetAllTenant = httpJsonCallWithoutSessionBlocking(
        path = s"/api/tenants"
      )(tenant)
      respGetAllTenant.status mustBe 303

      val respGet = httpJsonCallWithoutSessionBlocking(
        path = s"/api/tenants/${tenant.id.value}"
      )(tenant)
      respGet.status mustBe 303

      val respCreate = httpJsonCallWithoutSessionBlocking(
        path = s"/api/tenants",
        method = "POST",
        body = Some(tenant.copy(name = "test").asJson)
      )(tenant)
      respCreate.status mustBe 303

      val respUpdate = httpJsonCallWithoutSessionBlocking(
        path = s"/api/tenants/${tenant.id.value}",
        method = "PUT",
        body = Some(tenant.copy(name = "test").asJson)
      )(tenant)
      respUpdate.status mustBe 303

      val respDelete = httpJsonCallWithoutSessionBlocking(
        path = s"/api/tenant/${tenant.id.value}",
        method = "DELETE"
      )(tenant)
      respDelete.status mustBe 303
    }
    "not create/update/delete api" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi)
      )

      val respCreate = httpJsonCallWithoutSessionBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis",
        method = "POST",
        body = Some(defaultApi.copy(name = "test").asJson)
      )(tenant)
      respCreate.status mustBe 303

      val respUpdate = httpJsonCallWithoutSessionBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}",
        method = "PUT",
        body = Some(defaultApi.copy(name = "test").asJson)
      )(tenant)
      respUpdate.status mustBe 303

      val respDelete = httpJsonCallWithoutSessionBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.id.value}",
        method = "DELETE"
      )(tenant)
      respDelete.status mustBe 303
    }
    "not get/create/update/delete otoroshi" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi),
      )

      val respGet = httpJsonCallWithoutSessionBlocking(
        path = s"/api/tenants/${tenant.id.value}/otoroshis"
      )(tenant)
      respGet.status mustBe 303

      val respGetOne = httpJsonCallWithoutSessionBlocking(
        path = s"/api/tenants/${tenant.id.value}/otoroshis/default"
      )(tenant)
      respGetOne.status mustBe 303

      val respCreate = httpJsonCallWithoutSessionBlocking(
        path = s"/api/tenants/${tenant.id.value}/otoroshis",
        method = "POST",
        body = Some(
          OtoroshiSettings(OtoroshiSettingsId("test"),
                           "localhost",
                           "https://otoroshi.io").asJson)
      )(tenant)
      respCreate.status mustBe 303

      val respUpdate = httpJsonCallWithoutSessionBlocking(
        path = s"/api/tenants/${tenant.id.value}/otoroshis/default",
        method = "PUT",
        body = Some(
          OtoroshiSettings(OtoroshiSettingsId("default"),
                           "test",
                           "https://otoroshi.io").asJson)
      )(tenant)
      respUpdate.status mustBe 303

      val respDelete = httpJsonCallWithoutSessionBlocking(
        path = s"/api/tenants/${tenant.id.value}/otoroshis/default",
        method = "DELETE"
      )(tenant)
      respDelete.status mustBe 303
    }

    "not import/export daikoku state" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi)
      )

      val respImp = httpJsonCallWithoutSessionBlocking(
        path = s"/api/state/import",
        method = "POST",
        body = Some(defaultApi.copy(name = "test").asJson)
      )(tenant)
      respImp.status mustBe 303

      val respExp = httpJsonCallWithoutSessionBlocking(
        path = s"/api/state/export"
      )(tenant)
      respExp.status mustBe 303
    }
  }

}
