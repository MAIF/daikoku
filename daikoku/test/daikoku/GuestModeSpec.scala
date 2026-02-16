package fr.maif.otoroshi.daikoku.tests

import cats.implicits.catsSyntaxOptionId
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.tests.utils.DaikokuSpecHelper
import org.scalatest.BeforeAndAfterEach
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.{JsArray, JsObject, Json}

import scala.concurrent.Await
import scala.concurrent.duration.DurationInt

class GuestModeSpec()
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfterEach {

  "A guest user" can {

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
          )
        )
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
                  Json.obj("_tenant" -> (team \ "tenant" \ "id").as[String])
                )
            )
        )
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
        path = s"/api/teams/${teamOwnerId.value}"
      )(publicTenant)
      resp.status mustBe 200
      val team =
        fr.maif.otoroshi.daikoku.domain.json.TeamFormat.reads(resp.json)
      team.isSuccess mustBe true
      team.get.id mustBe teamOwnerId

    }

    "get visible apis" in {
      Await.result(waitForDaikokuSetup(), 5.second)
      val publicTenant = tenant.copy(isPrivate = false)
      val publicApi = defaultApi.api.copy(id = ApiId("public"))
      val privateApi = defaultApi.api.copy(
        id = ApiId("private"),
        visibility = ApiVisibility.Private,
        name = "private api"
      )

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
          )
        )
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
      Await.result(waitForDaikokuSetup(), 5.second)
      val publicTenant = tenant.copy(isPrivate = false)
      val publicApi = defaultApi.api.copy(id = ApiId("public"))
      val privateApi = defaultApi.api.copy(
        id = ApiId("private"),
        visibility = ApiVisibility.Private,
        name = "private api"
      )

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
            "variables" -> Json
              .obj(
                "filterTable" -> Json.stringify(
                  Json.arr(
                    Json.obj(
                      "id" -> "team",
                      "value" -> Json.arr(teamOwnerId.value)
                    )
                  )
                ),
                "limit" -> 5,
                "offset" -> 0
              ),
            "query" -> s"""
            |query AllVisibleApis ($$filterTable: JsArray, , $$limit: Int, $$offset: Int) {
            |      visibleApis (filterTable: $$filterTable, , limit: $$limit, offset: $$offset) {
            |        apis {
            |          api {
            |            _id
            |          }
            |        }
            |    }
            |}
            |""".stripMargin
          )
        )
      )(publicTenant)
      logger.info(Json.stringify(resp.json))
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
        defaultApi.api
          .copy(id = ApiId("public"), visibility = ApiVisibility.Public)
      val privateApi = defaultApi.api
        .copy(id = ApiId("private"), visibility = ApiVisibility.Private)

      setupEnvBlocking(
        tenants = Seq(publicTenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        apis = Seq(publicApi, privateApi)
      )

      val resp = httpJsonCallWithoutSessionBlocking(
        path = s"/api/me/visible-apis/${publicApi.id.value}"
      )(publicTenant)
      resp.status mustBe 200

      (resp.json \ "_id").as[String] mustBe publicApi.id.value
      val excludedKeys =
        Set("documentation", "swagger", "testing", "subscriptionProcess")
      val includedKeys = Set(
        "_id",
        "team",
        "possibleUsagePlans",
        "name",
        "description",
        "currentVersion",
        "tags",
        "categories"
      )
      excludedKeys.forall(k => !resp.json.as[JsObject].keys.contains(k))
      includedKeys.forall(k => resp.json.as[JsObject].keys.contains(k))

      val respError = httpJsonCallWithoutSessionBlocking(
        path = s"/api/me/visible-apis/${privateApi.id.value}"
      )(publicTenant)
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
      respDelete.status mustBe 404
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
      respCreate.status mustBe 404

      val respUpdate = httpJsonCallWithoutSessionBlocking(
        path = s"/api/teams/${teamOwnerId.value}",
        method = "PUT",
        body = Some(teamOwner.copy(name = "test").asJson)
      )(tenant)
      respUpdate.status mustBe 404

      val respDelete = httpJsonCallWithoutSessionBlocking(
        path = s"/api/teams/${teamOwnerId.value}",
        method = "DELETE"
      )(tenant)
      respDelete.status mustBe 404
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
      respCreate.status mustBe 404

      val respUpdate = httpJsonCallWithoutSessionBlocking(
        path = s"/api/users/${userTeamAdminId.value}",
        method = "PUT",
        body = Some(userAdmin.copy(name = "test").asJson)
      )(tenant)
      respUpdate.status mustBe 404

      val respDelete = httpJsonCallWithoutSessionBlocking(
        path = s"/api/users/${userTeamAdminId.value}",
        method = "DELETE"
      )(tenant)
      respDelete.status mustBe 404
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
      respGetAllTenant.status mustBe 404

      val respGet = httpJsonCallWithoutSessionBlocking(
        path = s"/api/tenants/${tenant.id.value}"
      )(tenant)
      respGet.status mustBe 404

      val respCreate = httpJsonCallWithoutSessionBlocking(
        path = s"/api/tenants",
        method = "POST",
        body = Some(tenant.copy(name = "test").asJson)
      )(tenant)
      respCreate.status mustBe 404

      val respUpdate = httpJsonCallWithoutSessionBlocking(
        path = s"/api/tenants/${tenant.id.value}",
        method = "PUT",
        body = Some(tenant.copy(name = "test").asJson)
      )(tenant)
      respUpdate.status mustBe 404

      val respDelete = httpJsonCallWithoutSessionBlocking(
        path = s"/api/tenant/${tenant.id.value}",
        method = "DELETE"
      )(tenant)
      respDelete.status mustBe 404
    }
    "not create/update/delete api" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi.api)
      )

      val respCreate = httpJsonCallWithoutSessionBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis",
        method = "POST",
        body = Some(defaultApi.api.copy(name = "test").asJson)
      )(tenant)
      respCreate.status mustBe 404

      val respUpdate = httpJsonCallWithoutSessionBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}",
        method = "PUT",
        body = Some(defaultApi.api.copy(name = "test").asJson)
      )(tenant)
      respUpdate.status mustBe 404

      val respDelete = httpJsonCallWithoutSessionBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}",
        method = "DELETE",
        body = Json.obj().some
      )(tenant)
      respDelete.status mustBe 404
    }
    "not get/create/update/delete otoroshi" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi.api)
      )

      val respGet = httpJsonCallWithoutSessionBlocking(
        path = s"/api/tenants/${tenant.id.value}/otoroshis"
      )(tenant)
      respGet.status mustBe 404

      val respGetOne = httpJsonCallWithoutSessionBlocking(
        path = s"/api/tenants/${tenant.id.value}/otoroshis/default"
      )(tenant)
      respGetOne.status mustBe 404

      val respCreate = httpJsonCallWithoutSessionBlocking(
        path = s"/api/tenants/${tenant.id.value}/otoroshis",
        method = "POST",
        body = Some(
          OtoroshiSettings(
            OtoroshiSettingsId("test"),
            "localhost",
            "https://otoroshi.io"
          ).asJson
        )
      )(tenant)
      respCreate.status mustBe 404

      val respUpdate = httpJsonCallWithoutSessionBlocking(
        path = s"/api/tenants/${tenant.id.value}/otoroshis/default",
        method = "PUT",
        body = Some(
          OtoroshiSettings(
            OtoroshiSettingsId("default"),
            "test",
            "https://otoroshi.io"
          ).asJson
        )
      )(tenant)
      respUpdate.status mustBe 404

      val respDelete = httpJsonCallWithoutSessionBlocking(
        path = s"/api/tenants/${tenant.id.value}/otoroshis/default",
        method = "DELETE"
      )(tenant)
      respDelete.status mustBe 404
    }

    "not import/export daikoku state" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        apis = Seq(defaultApi.api)
      )

      val respImp = httpJsonCallWithoutSessionBlocking(
        path = s"/api/state/import",
        method = "POST",
        body = Some(defaultApi.api.copy(name = "test").asJson)
      )(tenant)
      respImp.status mustBe 404

      val respExp = httpJsonCallWithoutSessionBlocking(
        path = s"/api/state/export"
      )(tenant)
      respExp.status mustBe 404
    }
  }

}
