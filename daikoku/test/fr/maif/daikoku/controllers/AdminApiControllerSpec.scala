package fr.maif.daikoku.controllers

import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.domain.UsagePlan
import fr.maif.daikoku.domain._
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import fr.maif.daikoku.utils.IdGenerator
import org.joda.time.DateTime
import org.scalatest.concurrent.IntegrationPatience
import org.scalatest.{BeforeAndAfter, BeforeAndAfterEach}
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.{JsArray, JsObject, JsString, Json}
import play.api.libs.ws.WSResponse
import fr.maif.daikoku.services.CmsPage
import org.awaitility.scala.AwaitilitySupport
import fr.maif.daikoku.domain.TeamPermission.Administrator

import java.util.Base64
import scala.concurrent.Await
import scala.concurrent.duration.{DurationInt, *}
import scala.jdk.DurationConverters.*

class AdminApiControllerSpec
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfterEach
    with BeforeAndAfter
    with AwaitilitySupport {

  def getMsg(resp: WSResponse): String = (resp.json \ "msg").as[String]

  def getAdminApiHeader(
      adminApiSubscription: ApiSubscription
  ): Map[String, String] = {
    Map("Authorization" -> s"Basic ${Base64.getEncoder.encodeToString(
        s"${adminApiSubscription.apiKey.clientId}:${adminApiSubscription.apiKey.clientSecret}".getBytes()
      )}")
  }

  s"Admin API" should {
    "A call to tenant admin API" must {
      "POST :: Bad Request :: Domain already used" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/tenants",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = tenant.copy(id = TenantId("test")).asJson.some
        )(using tenant)

        resp.status mustBe 400
      }
      "POST :: Conflict :: Domain already exists" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/tenants",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = tenant.copy(id = TenantId("test")).asJson.some
        )(using tenant)

        resp.status mustBe 400
      }

      "PUT :: Conflict :: Domain already used" in {
        setupEnvBlocking(
          tenants = Seq(
            tenant,
            tenant.copy(id = TenantId("test"), domain = "https://daikoku.io")
          ),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val respConflict = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/tenants/${tenant.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = tenant.copy(domain = "https://daikoku.io").asJson.some
        )(using tenant)

        respConflict.status mustBe 400
      }

      "PUT :: Not Found" in {
        setupEnvBlocking(
          tenants = Seq(
            tenant,
            tenant.copy(id = TenantId("test"), domain = "https://daikoku.io")
          ),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val respNotFound = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/tenants/unknown",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = tenant.copy(domain = "https://daikoku.io").asJson.some
        )(using tenant)

        respNotFound.status mustBe 404
      }

      "PATCH :: Bad Request :: Domain already used" in {
        setupEnvBlocking(
          tenants = Seq(
            tenant,
            tenant.copy(id = TenantId("test"), domain = "https://daikoku.io")
          ),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/tenants/${tenant.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/domain",
                "value" -> "https://daikoku.io"
              )
            )
            .some
        )(using tenant)

        resp.status mustBe 400

      }

      "GET :: Not Found" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/tenants/unknown",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 404
      }

      "GET :: Ok" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/tenants/${tenant.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200
        resp.json mustBe tenant.asJson
      }

      "POST :: Created" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )
        val domain = "https://daikoku.io"
        val id = TenantId("creation")
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/tenants",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = tenant.copy(id = id, domain = domain).asJson.some
        )(using tenant)

        resp.status mustBe 201

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/tenants/${id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        (verif.json.as[JsObject] \ "domain").as[String] mustBe domain
      }
      "PUT :: No Content" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )
        val name = "Evil corp."
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/tenants/${tenant.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = tenant.copy(name = name).asJson.some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/tenants/${tenant.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        (verif.json.as[JsObject] \ "name").as[String] mustBe name
      }
      "PATCH :: No Content" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )
        val name = "Evil corp."
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/tenants/${tenant.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj("op" -> "replace", "path" -> "/name", "value" -> name)
            )
            .some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/tenants/${tenant.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        (verif.json.as[JsObject] \ "name").as[String] mustBe name
      }
      "DELETE :: works" in {
        val id = TenantId("delete")
        setupEnvBlocking(
          tenants =
            Seq(tenant, tenant.copy(id = id, domain = "http://daikoku.io")),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/tenants/${id.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/tenants/${id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 404
      }
    }

    "A call to user admin API" must {
      "POST :: BadRequest :: Email already exists" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = user.copy(id = UserId("test")).asJson.some
        )(using tenant)

        resp.status mustBe 400
      }
      "POST :: Conflict :: user already exists" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = user.copy(name = "test").asJson.some
        )(using tenant)

        resp.status mustBe 409
      }

      "PUT :: BadRequest :: Email already exists" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val respConflict = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = user.copy(email = userAdmin.email).asJson.some
        )(using tenant)

        respConflict.status mustBe 400
      }

      "PUT :: Not Found" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val respNotFound = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/unknown",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = user.copy(name = "test").asJson.some
        )(using tenant)

        respNotFound.status mustBe 404
      }

      "PATCH :: BadRequest :: Email already exists" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/email",
                "value" -> userAdmin.email
              )
            )
            .some
        )(using tenant)

        resp.status mustBe 400
      }

      "GET :: Not Found" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/unknown",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 404
      }

      "GET :: Ok" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200
        resp.json mustBe user.asJson
      }

      "POST :: Created" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = user.asJson.some
        )(using tenant)

        resp.status mustBe 201

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json mustBe user.asJson
      }
      "PUT :: No Content" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )
        val name = "fifou"
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = user.copy(name = name).asJson.some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        (verif.json.as[JsObject] \ "name").as[String] mustBe name
      }
      "PATCH :: No Content" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )
        val name = "fifou"
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj("op" -> "replace", "path" -> "/name", "value" -> name)
            )
            .some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        (verif.json.as[JsObject] \ "name").as[String] mustBe name
      }
      "DELETE :: Ok" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, tenantAdmin),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        (verif.json \ "_deleted").as[Boolean] mustBe true
      }
    }

    "A call to team admin API" must {
      "POST :: Conflict :: TeamId already exists" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = teamOwner.copy(name = "test").asJson.some
        )(using tenant)

        resp.status mustBe 409
      }

      "POST :: BadRequest :: Tenant not found" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = teamOwner.copy(tenant = TenantId("test")).asJson.some
        )(using tenant)

        resp.status mustBe 400
      }

      "POST :: BadRequest :: user not found" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = teamOwner
            .copy(users =
              Set(
                UserWithPermission(UserId("toto"), TeamPermission.Administrator)
              )
            )
            .asJson
            .some
        )(using tenant)

        resp.status mustBe 400
      }

      "PUT :: BadRequest :: Tenant NotFound" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription)
        )

        val respConflict = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams/${teamOwner.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = teamOwner.copy(tenant = TenantId("Not Found")).asJson.some
        )(using tenant)

        respConflict.status mustBe 400
      }

      "PUT :: BadRequest :: User NotFound" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription)
        )

        val respConflict = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams/${teamOwner.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = teamOwner
            .copy(users =
              Set(
                UserWithPermission(UserId("toto"), TeamPermission.Administrator)
              )
            )
            .asJson
            .some
        )(using tenant)

        respConflict.status mustBe 400
      }

      "PUT :: Not Found" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val respNotFound = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams/unknown",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = teamOwner.copy(name = "test").asJson.some
        )(using tenant)

        respNotFound.status mustBe 404
      }

      "PATCH :: BadRequest :: User NotFound" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(defaultAdminTeam, teamOwner),
          subscriptions = Seq(adminApiSubscription)
        )

        val newUsers = json.SetUserWithPermissionFormat.writes(
          Set(
            UserWithPermission(UserId("notFound"), TeamPermission.Administrator)
          )
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams/${teamOwner.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json
                .obj("op" -> "replace", "path" -> "/users", "value" -> newUsers)
            )
            .some
        )(using tenant)

        resp.status mustBe 400

      }

      "GET :: Not Found" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams/unknown",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 404
      }

      "GET :: Ok" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(defaultAdminTeam, teamOwner),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams/${teamOwner.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200
        resp.json mustBe teamOwner.asJson
      }

      "POST :: Created" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userApiEditor, userAdmin),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = teamOwner.asJson.some
        )(using tenant)

        resp.status mustBe 201

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams/${teamOwner.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json mustBe teamOwner.asJson
      }
      "PUT :: No Content" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userApiEditor, userAdmin),
          teams = Seq(defaultAdminTeam, teamOwner),
          subscriptions = Seq(adminApiSubscription)
        )
        val name = "fifou"
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams/${teamOwner.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = teamOwner.copy(name = name).asJson.some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams/${teamOwner.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        (verif.json.as[JsObject] \ "name").as[String] mustBe name
      }
      "PATCH :: No Content" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userApiEditor, userAdmin),
          teams = Seq(defaultAdminTeam, teamOwner),
          subscriptions = Seq(adminApiSubscription)
        )
        val name = "fifou"
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams/${teamOwner.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj("op" -> "replace", "path" -> "/name", "value" -> name)
            )
            .some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams/${teamOwner.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        (verif.json.as[JsObject] \ "name").as[String] mustBe name
      }
      "DELETE :: Ok" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, tenantAdmin),
          teams = Seq(defaultAdminTeam, teamOwner),
          subscriptions = Seq(adminApiSubscription)
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams/${teamOwner.id.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams/${teamOwner.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        (verif.json \ "_deleted").as[Boolean] mustBe true
      }
    }

    "A call to Api admin API" must {

      "POST :: Conflict :: API already exists" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = defaultApi.api.asJson.some
        )(using tenant)

        resp.status mustBe 409
      }

      "POST :: BadRequest" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(
            defaultApi.api.copy(id = ApiId(IdGenerator.token(10)), name = "foo")
          ),
          teams = Seq(teamOwner),
          usagePlans = defaultApi.plans
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = defaultApi.api.copy(tenant = TenantId("unkown")).asJson.some
        )(using tenant)

        resp.status mustBe 400
        getMsg(resp) mustBe "Tenant not found"

        val respPlan = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = defaultApi.api
            .copy(possibleUsagePlans = Seq(UsagePlanId("unknown")))
            .asJson
            .some
        )(using tenant)

        respPlan.status mustBe 400
        getMsg(respPlan) mustBe "Usage Plan (unknown) not found"

        val respDoc = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = defaultApi.api
            .copy(documentation =
              ApiDocumentation(
                id = ApiDocumentationId(IdGenerator.token(32)),
                tenant = tenant.id,
                pages = Seq(
                  ApiDocumentationDetailPage(
                    id = ApiDocumentationPageId("unknown"),
                    title = "test",
                    children = Seq.empty
                  )
                ),
                lastModificationAt = DateTime.now()
              )
            )
            .asJson
            .some
        )(using tenant)

        respDoc.status mustBe 400
        getMsg(respDoc) mustBe "Documentation page (unknown) not found"

        val respTeam = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = defaultApi.api.copy(team = TeamId("unknown")).asJson.some
        )(using tenant)

        respTeam.status mustBe 400
        getMsg(respTeam) mustBe "Team not found"

        val respName = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body =
            defaultApi.api.copy(id = ApiId("foo"), name = "foo").asJson.some
        )(using tenant)

        respName.status mustBe 400
        getMsg(respName) mustBe "Api name already exists"

        val respDefaultPlan = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = defaultApi.api
            .copy(defaultUsagePlan = UsagePlanId("unknown").some)
            .asJson
            .some
        )(using tenant)

        respDefaultPlan.status mustBe 400
        getMsg(respDefaultPlan) mustBe "Default Usage Plan (unknown) not found"

        val respParent = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = defaultApi.api.copy(parent = ApiId("unknown").some).asJson.some
        )(using tenant)

        respParent.status mustBe 400
        getMsg(respParent) mustBe "Parent API not found"

        val respChildren = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body =
            defaultApi.api.copy(apis = Set(ApiId("unknown")).some).asJson.some
        )(using tenant)

        respChildren.status mustBe 400
        getMsg(respChildren) mustBe "Children API (unknown) not found"

      }

      "PUT :: Not Found" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(),
          teams = Seq(teamConsumer),
          usagePlans = defaultApi.plans
        )

        val respNotFound = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis/unknown",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = defaultApi.api.asJson.some
        )(using tenant)

        respNotFound.status mustBe 404
      }

      "GET :: Not Found" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(),
          usagePlans = defaultApi.plans
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis/unknown",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 404
      }

      "GET :: Ok" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis/${defaultApi.api.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200
        resp.json mustBe defaultApi.api.asJson
      }

      "POST :: Created" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(),
          usagePlans = defaultApi.plans,
          teams = Seq(teamConsumer, teamOwner)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = defaultApi.api.asJson.some
        )(using tenant)

        resp.status mustBe 201

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis/${defaultApi.api.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json mustBe defaultApi.api.asJson
      }
      "PUT :: No Content" in {

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          teams = Seq(teamOwner),
          users = Seq(user)
        )

        val updated = defaultApi.api.copy(defaultUsagePlan = None)
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis/${defaultApi.api.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = updated.asJson.some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis/${defaultApi.api.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json mustBe updated.asJson
      }
      "PATCH :: No Content" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          teams = Seq(teamOwner),
          users = Seq(user)
        )
        val updated = defaultApi.api.copy(name = "foo")
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis/${defaultApi.api.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj("op" -> "replace", "path" -> "/name", "value" -> "foo")
            )
            .some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis/${defaultApi.api.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json mustBe updated.asJson
      }
      "DELETE :: Ok" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(tenantAdmin),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis/${defaultApi.api.id.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis/${defaultApi.api.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        (verif.json \ "_deleted").as[Boolean] mustBe true
      }

      "Conflict :: Name already exists" in {
        val childApiId = ApiId(IdGenerator.token)
        val otherApiId = ApiId(IdGenerator.token)

        val childApi = defaultApi.api.copy(
          id = childApiId,
          parent = defaultApi.api.id.some,
          currentVersion = Version("2.0.0-test")
        )
        val otherApi = defaultApi.api.copy(id = otherApiId, name = "other API")

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(
            defaultApi.api,
            childApi,
            otherApi
          ),
          usagePlans = defaultApi.plans,
          teams = Seq(teamOwner),
          users = Seq(userAdmin)
        )
        // PATCH an api is OK (child)
        val respChildPatch = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis/${childApiId.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/description",
                "value" -> "foo"
              )
            )
            .some
        )(using tenant)

        respChildPatch.status mustBe 204

        // update (PUT) an api is OK (child)
        val respChildPut = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis/${childApiId.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = childApi.copy(description = "foofoo").asJson.some
        )(using tenant)

        respChildPut.status mustBe 204

        // PATCH a parent is OK
        val respParentPatch = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis/${defaultApi.api.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/description",
                "value" -> "foo"
              )
            )
            .some
        )(using tenant)
        respParentPatch.status mustBe 204

        // put parent is OK
        val respParentPut = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis/${defaultApi.api.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = defaultApi.api.copy(description = "foofoo").asJson.some
        )(using tenant)
        respParentPut.status mustBe 204

        // PATCH an API with same name other api ==> KO
        val respOtherPatch = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis/${otherApiId.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/name",
                "value" -> defaultApi.api.name
              )
            )
            .some
        )(using tenant)

        respOtherPatch.status mustBe 400

        // PUT an API with same name other api ==> KO
        val respOtherPut = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis/${otherApiId.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = otherApi.copy(name = defaultApi.api.name).asJson.some
        )(using tenant)

        respOtherPut.status mustBe 400

        // PATCH an API with random name
        val respOtherOkPatch = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis/${otherApiId.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/name",
                "value" -> "test-test-test"
              )
            )
            .some
        )(using tenant)

        respOtherOkPatch.status mustBe 204

        // PATCH an API with random name
        val respOtherOkPut = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis/${otherApiId.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = otherApi.copy(name = "test-test-test-test").asJson.some
        )(using tenant)

        respOtherOkPut.status mustBe 204

        // create a new API with same name
        val respCreateKo = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = defaultApi.api
            .copy(id = ApiId(IdGenerator.token), parent = None)
            .asJson
            .some
        )(using tenant)

        respCreateKo.status mustBe 400

        val some = defaultApi.api
          .copy(
            id = ApiId(IdGenerator.token),
            parent = defaultApi.api.id.some,
            currentVersion = Version("vTest")
          )
          .asJson
          .some

        // create a new version fo API (with same name)
        val respCreateVersionOK = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = some
        )(using tenant)

        respCreateVersionOK.status mustBe 201

        // create a new API with other name
        val respCreateOk = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = defaultApi.api
            .copy(id = ApiId(IdGenerator.token), name = "final_api_test")
            .asJson
            .some
        )(using tenant)

        respCreateOk.status mustBe 201
      }
    }

    "A call to ApiSubscription admin API" must {
      "POST :: Conflict :: Id already exists" in {
        val payPerUsePlanId = UsagePlanId("5")
        val sub = ApiSubscription(
          id = ApiSubscriptionId("test"),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = payPerUsePlanId,
          createdAt = DateTime.now(),
          team = teamConsumerId,
          api = defaultApi.api.id,
          by = userTeamAdminId,
          customName = None,
          rotation = None,
          integrationToken = "token"
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          subscriptions = Seq(adminApiSubscription, sub)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = sub.copy(by = user.id).asJson.some
        )(using tenant)

        resp.status mustBe 409
      }

      "POST :: BadRequest" in {
        val payPerUsePlanId = UsagePlanId("5")
        val sub = ApiSubscription(
          id = ApiSubscriptionId("test"),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = payPerUsePlanId,
          createdAt = DateTime.now(),
          team = teamConsumerId,
          api = defaultApi.api.id,
          by = userTeamAdminId,
          customName = None,
          rotation = None,
          integrationToken = "token"
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          subscriptions = Seq(adminApiSubscription)
        )

        // tenant not found
        val respTenant = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = sub.copy(tenant = TenantId("notFound")).asJson.some
        )(using tenant)

        respTenant.status mustBe 400
        getMsg(respTenant) mustBe "Tenant not found"

        // plan not found
        val respPlan = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = sub.copy(plan = UsagePlanId("notFound")).asJson.some
        )(using tenant)
        respPlan.status mustBe 400
        getMsg(respPlan) mustBe "Plan not found"

        // team not found
        val respTeam = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = sub.copy(team = TeamId("notFound")).asJson.some
        )(using tenant)
        respTeam.status mustBe 400
        getMsg(respTeam) mustBe "Team not found"

        // by not found
        val respBy = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = sub.copy(by = UserId("notFound")).asJson.some
        )(using tenant)
        respBy.status mustBe 400
        getMsg(respBy) mustBe "By not found"

        // parent not found
        val respParent = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body =
            sub.copy(parent = ApiSubscriptionId("notFound").some).asJson.some
        )(using tenant)
        respParent.status mustBe 400
        getMsg(respParent) mustBe "Parent subscription not found"
      }

      "PUT :: BadRequest :: Tenant NotFound" in {
        val payPerUsePlanId = UsagePlanId("5")
        val sub = ApiSubscription(
          id = ApiSubscriptionId(IdGenerator.token(12)),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = payPerUsePlanId,
          createdAt = DateTime.now(),
          team = teamConsumerId,
          api = defaultApi.api.id,
          by = userTeamAdminId,
          customName = None,
          rotation = None,
          integrationToken = "token"
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          subscriptions = Seq(adminApiSubscription, sub)
        )
        // tenant not found
        val respTenant = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = sub.copy(tenant = TenantId("notFound")).asJson.some
        )(using tenant)

        respTenant.status mustBe 400
        getMsg(respTenant) mustBe "Tenant not found"

        // plan not found
        val respPlan = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = sub.copy(plan = UsagePlanId("notFound")).asJson.some
        )(using tenant)
        respPlan.status mustBe 400
        getMsg(respPlan) mustBe "Plan not found"

        // team not found
        val respTeam = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = sub.copy(team = TeamId("notFound")).asJson.some
        )(using tenant)
        respTeam.status mustBe 400
        getMsg(respTeam) mustBe "Team not found"

        // by not found
        val respBy = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = sub.copy(by = UserId("notFound")).asJson.some
        )(using tenant)
        respBy.status mustBe 400
        getMsg(respBy) mustBe "By not found"

        // parent not found
        val respParent = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body =
            sub.copy(parent = ApiSubscriptionId("notFound").some).asJson.some
        )(using tenant)
        respParent.status mustBe 400
        getMsg(respParent) mustBe "Parent subscription not found"
      }

      "PUT :: Not Found" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val respNotFound = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/unknown",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = teamOwner.copy(name = "test").asJson.some
        )(using tenant)

        respNotFound.status mustBe 404
      }

      "PATCH :: BadRequest" in {
        val payPerUsePlanId = UsagePlanId("5")
        val sub = ApiSubscription(
          id = ApiSubscriptionId(IdGenerator.token(12)),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = payPerUsePlanId,
          createdAt = DateTime.now(),
          team = teamConsumerId,
          api = defaultApi.api.id,
          by = userTeamAdminId,
          customName = None,
          rotation = None,
          integrationToken = "token"
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          subscriptions = Seq(adminApiSubscription, sub)
        )
        // tenant not found
        val respTenant = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/_tenant",
                "value" -> "notFound"
              )
            )
            .some
        )(using tenant)

        respTenant.status mustBe 400
        getMsg(respTenant) mustBe "Tenant not found"

        // plan not found
        val respPlan = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/plan",
                "value" -> "notFound"
              )
            )
            .some
        )(using tenant)
        respPlan.status mustBe 400
        getMsg(respPlan) mustBe "Plan not found"

        // team not found
        val respTeam = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/team",
                "value" -> "notFound"
              )
            )
            .some
        )(using tenant)
        respTeam.status mustBe 400
        getMsg(respTeam) mustBe "Team not found"

        // by not found
        val respBy = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json
                .obj("op" -> "replace", "path" -> "/by", "value" -> "notFound")
            )
            .some
        )(using tenant)
        respBy.status mustBe 400
        getMsg(respBy) mustBe "By not found"

        // parent not found
        val respParent = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/parent",
                "value" -> "notFound"
              )
            )
            .some
        )(using tenant)
        respParent.status mustBe 400
        getMsg(respParent) mustBe "Parent subscription not found"
      }

      "GET :: Not Found" in {
        val payPerUsePlanId = UsagePlanId("5")
        val sub = ApiSubscription(
          id = ApiSubscriptionId(IdGenerator.token(12)),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = payPerUsePlanId,
          createdAt = DateTime.now(),
          team = teamConsumerId,
          api = defaultApi.api.id,
          by = userTeamAdminId,
          customName = None,
          rotation = None,
          integrationToken = "token"
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/unknown",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 404
      }

      "GET :: Ok" in {
        val payPerUsePlanId = UsagePlanId("5")
        val sub = ApiSubscription(
          id = ApiSubscriptionId(IdGenerator.token(12)),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = payPerUsePlanId,
          createdAt = DateTime.now(),
          team = teamConsumerId,
          api = defaultApi.api.id,
          by = userTeamAdminId,
          customName = None,
          rotation = None,
          integrationToken = "token"
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          subscriptions = Seq(adminApiSubscription, sub)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200
        resp.json mustBe sub.asJson
      }

      "POST :: Created" in {
        val payPerUsePlanId = UsagePlanId("5")
        val sub = ApiSubscription(
          id = ApiSubscriptionId(IdGenerator.token(12)),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = payPerUsePlanId,
          createdAt = DateTime.now(),
          team = teamConsumerId,
          api = defaultApi.api.id,
          by = userTeamAdminId,
          customName = None,
          rotation = None,
          integrationToken = "token"
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          subscriptions = Seq(adminApiSubscription)
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = sub.asJson.some
        )(using tenant)

        resp.status mustBe 201

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json mustBe sub.asJson
      }
      "PUT :: No Content" in {
        val payPerUsePlanId = UsagePlanId("5")
        val sub = ApiSubscription(
          id = ApiSubscriptionId(IdGenerator.token(12)),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = payPerUsePlanId,
          createdAt = DateTime.now(),
          team = teamConsumerId,
          api = defaultApi.api.id,
          by = userTeamAdminId,
          customName = None,
          rotation = None,
          integrationToken = "token"
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          subscriptions = Seq(adminApiSubscription, sub)
        )
        val name = "fifou"
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = sub.copy(adminCustomName = name.some).asJson.some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        (verif.json.as[JsObject] \ "adminCustomName").as[String] mustBe name
      }
      "PATCH :: No Content" in {
        val payPerUsePlanId = UsagePlanId("5")
        val sub = ApiSubscription(
          id = ApiSubscriptionId(IdGenerator.token(12)),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = payPerUsePlanId,
          createdAt = DateTime.now(),
          team = teamConsumerId,
          api = defaultApi.api.id,
          by = userTeamAdminId,
          customName = None,
          rotation = None,
          integrationToken = "token"
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          subscriptions = Seq(adminApiSubscription, sub)
        )
        val name = "fifou"
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/adminCustomName",
                "value" -> name
              )
            )
            .some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        (verif.json.as[JsObject] \ "adminCustomName").as[String] mustBe name
      }
      "DELETE :: Ok" in {
        val payPerUsePlanId = UsagePlanId("5")
        val sub = ApiSubscription(
          id = ApiSubscriptionId(IdGenerator.token(12)),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = payPerUsePlanId,
          createdAt = DateTime.now(),
          team = teamConsumerId,
          api = defaultApi.api.id,
          by = userTeamAdminId,
          customName = None,
          rotation = None,
          integrationToken = "token"
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          subscriptions = Seq(adminApiSubscription)
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 404
      }
    }

    "A call to Api Documentation admin API" must {
      "POST :: Conflict :: Id already exists" in {
        val page = ApiDocumentationPage(
          id = ApiDocumentationPageId(IdGenerator.token(10)),
          tenant = tenant.id,
          title = "test",
          lastModificationAt = DateTime.now(),
          content = "#title"
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          pages = Seq(page),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/pages",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = page.copy(content = "test").asJson.some
        )(using tenant)

        resp.status mustBe 409
      }

      "GET :: Ok" in {
        val page = ApiDocumentationPage(
          id = ApiDocumentationPageId(IdGenerator.token(10)),
          tenant = tenant.id,
          title = "test",
          lastModificationAt = DateTime.now(),
          content = "#title"
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          pages = Seq(page),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/pages/${page.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200
        resp.json mustBe page.asJson
      }

      "POST :: Created" in {
        val page = ApiDocumentationPage(
          id = ApiDocumentationPageId(IdGenerator.token(10)),
          tenant = tenant.id,
          title = "test",
          lastModificationAt = DateTime.now(),
          content = "#title"
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          pages = Seq(),
          subscriptions = Seq(adminApiSubscription)
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/pages",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = page.asJson.some
        )(using tenant)

        resp.status mustBe 201

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/pages/${page.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json mustBe page.asJson
      }
      "PUT :: No Content" in {
        val page = ApiDocumentationPage(
          id = ApiDocumentationPageId(IdGenerator.token(10)),
          tenant = tenant.id,
          title = "test",
          lastModificationAt = DateTime.now(),
          content = "#title"
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          pages = Seq(page),
          subscriptions = Seq(adminApiSubscription)
        )
        val name = "fifou"
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/pages/${page.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = page.copy(content = name).asJson.some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/pages/${page.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        (verif.json.as[JsObject] \ "content").as[String] mustBe name
      }
      "PATCH :: No Content" in {
        val page = ApiDocumentationPage(
          id = ApiDocumentationPageId(IdGenerator.token(10)),
          tenant = tenant.id,
          title = "test",
          lastModificationAt = DateTime.now(),
          content = "#title"
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          pages = Seq(page),
          subscriptions = Seq(adminApiSubscription)
        )
        val content = "fifou"
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/pages/${page.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/content",
                "value" -> content
              )
            )
            .some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/pages/${page.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        (verif.json.as[JsObject] \ "content").as[String] mustBe content
      }
      "DELETE :: Ok" in {
        val page = ApiDocumentationPage(
          id = ApiDocumentationPageId(IdGenerator.token(10)),
          tenant = tenant.id,
          title = "test",
          lastModificationAt = DateTime.now(),
          content = "#title"
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          pages = Seq(page),
          subscriptions = Seq(adminApiSubscription)
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/pages/${page.id.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/pages/${page.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 404
      }
    }

    "A call to notification admin API" must {
      "POST :: Conflict" in {
        val notif = Notification(
          id = NotificationId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id.some,
          sender = userAdmin.asNotificationSender,
          action = NotificationAction.ApiAccess(
            api = defaultApi.api.id,
            team = teamConsumerId
          )
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          teams = Seq(defaultAdminTeam, teamOwner),
          users = Seq(userAdmin, user),
          notifications = Seq(notif),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/notifications",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = notif.copy(sender = userAdmin.asNotificationSender).asJson.some
        )(using tenant)

        resp.status mustBe 409
      }
      "POST :: BadRequest" in {
        val notif = Notification(
          id = NotificationId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id.some,
          sender = userAdmin.asNotificationSender,
          action = NotificationAction.ApiAccess(
            api = defaultApi.api.id,
            team = teamConsumerId
          )
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          teams = Seq(defaultAdminTeam, teamOwner),
          users = Seq(userAdmin, user),
          notifications = Seq(),
          subscriptions = Seq(adminApiSubscription)
        )

        // tenant not found
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/notifications",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = notif.copy(tenant = TenantId("test")).asJson.some
        )(using tenant)

        resp.status mustBe 400
      }

      "PUT :: BadRequest" in {
        val notif = Notification(
          id = NotificationId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id.some,
          sender = userAdmin.asNotificationSender,
          action = NotificationAction.ApiAccess(
            api = defaultApi.api.id,
            team = teamConsumerId
          )
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          teams = Seq(defaultAdminTeam, teamOwner),
          users = Seq(userAdmin, user),
          notifications = Seq(notif),
          subscriptions = Seq(adminApiSubscription)
        )

        val respConflict = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/notifications/${notif.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = notif.copy(tenant = tenant2.id).asJson.some
        )(using tenant)

        respConflict.status mustBe 400
      }

      "PUT :: Not Found" in {
        val notif = Notification(
          id = NotificationId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id.some,
          sender = userAdmin.asNotificationSender,
          action = NotificationAction.ApiAccess(
            api = defaultApi.api.id,
            team = teamConsumerId
          )
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          teams = Seq(defaultAdminTeam, teamOwner),
          users = Seq(userAdmin, user),
          notifications = Seq(notif),
          subscriptions = Seq(adminApiSubscription)
        )

        val respNotFound = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/notifications/unknown",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = notif.copy(sender = user.asNotificationSender).asJson.some
        )(using tenant)

        respNotFound.status mustBe 404
      }

      "PATCH :: Bad Request" in {
        val notif = Notification(
          id = NotificationId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id.some,
          sender = userAdmin.asNotificationSender,
          action = NotificationAction.ApiAccess(
            api = defaultApi.api.id,
            team = teamConsumerId
          )
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          teams = Seq(defaultAdminTeam, teamOwner),
          users = Seq(userAdmin, user),
          notifications = Seq(notif),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/notifications/${notif.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/_tenant",
                "value" -> tenant2.id.asJson
              )
            )
            .some
        )(using tenant)

        resp.status mustBe 400

      }

      "GET :: Not Found" in {
        val notif = Notification(
          id = NotificationId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id.some,
          sender = userAdmin.asNotificationSender,
          action = NotificationAction.ApiAccess(
            api = defaultApi.api.id,
            team = teamConsumerId
          )
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          teams = Seq(defaultAdminTeam, teamOwner),
          users = Seq(userAdmin, user),
          notifications = Seq(notif),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/notifications/unknown",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 404
      }

      "GET :: Ok" in {
        val notif = Notification(
          id = NotificationId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id.some,
          sender = userAdmin.asNotificationSender,
          action = NotificationAction.ApiAccess(
            api = defaultApi.api.id,
            team = teamConsumerId
          )
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          teams = Seq(defaultAdminTeam, teamOwner),
          users = Seq(userAdmin, user),
          notifications = Seq(notif),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/notifications/${notif.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200
        resp.json mustBe notif.asJson
      }

      "POST :: Created" in {
        val notif = Notification(
          id = NotificationId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id.some,
          sender = userAdmin.asNotificationSender,
          action = NotificationAction.ApiAccess(
            api = defaultApi.api.id,
            team = teamConsumerId
          )
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          teams = Seq(defaultAdminTeam, teamOwner),
          users = Seq(userAdmin, user),
          notifications = Seq(),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/notifications",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = notif.asJson.some
        )(using tenant)

        resp.status mustBe 201

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/notifications/${notif.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json.as(using json.NotificationFormat) mustBe notif
      }
      "PUT :: No Content" in {
        val notif = Notification(
          id = NotificationId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id.some,
          sender = userAdmin.asNotificationSender,
          action = NotificationAction.ApiAccess(
            api = defaultApi.api.id,
            team = teamConsumerId
          )
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          teams = Seq(defaultAdminTeam, teamOwner),
          users = Seq(userAdmin, user),
          notifications = Seq(notif),
          subscriptions = Seq(adminApiSubscription)
        )

        val updatedNotif = notif.copy(sender = user.asNotificationSender)
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/notifications/${notif.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = updatedNotif.asJson.some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/notifications/${notif.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json.as(using json.NotificationFormat) mustBe updatedNotif
      }
      "PATCH :: No Content" in {
        val notif = Notification(
          id = NotificationId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id.some,
          sender = userAdmin.asNotificationSender,
          action = NotificationAction.ApiAccess(
            api = defaultApi.api.id,
            team = teamConsumerId
          )
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          teams = Seq(defaultAdminTeam, teamOwner),
          users = Seq(userAdmin, user),
          notifications = Seq(notif),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/notifications/${notif.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/sender",
                "value" -> user.asNotificationSender.asJson
              )
            )
            .some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/notifications/${notif.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json.as(using json.NotificationFormat) mustBe notif.copy(sender =
          user.asNotificationSender
        )
      }
      "DELETE :: works" in {
        val notif = Notification(
          id = NotificationId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id.some,
          sender = userAdmin.asNotificationSender,
          action = NotificationAction.ApiAccess(
            api = defaultApi.api.id,
            team = teamConsumerId
          )
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          teams = Seq(defaultAdminTeam, teamOwner),
          users = Seq(userAdmin, user),
          notifications = Seq(),
          subscriptions = Seq(adminApiSubscription)
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/notifications/${notif.id.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/notifications/${notif.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 404
      }
    }

    "A call to user session admin API" must {
      "POST :: BadRequest" in {

        val session = UserSession(
          id = DatastoreId(IdGenerator.token(10)),
          sessionId = UserSessionId(IdGenerator.token(10)),
          userId = user.id,
          userName = user.name,
          userEmail = user.email,
          impersonatorId = None,
          impersonatorName = None,
          impersonatorEmail = None,
          impersonatorSessionId = None,
          created = DateTime.now(),
          ttl = 10.minute,
          expires = DateTime.now().plusMinutes(10)
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription),
          sessions = Seq()
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/sessions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = session.copy(ttl = 1.hour).asJson.some
        )(using tenant)

        resp.status mustBe 400
        getMsg(resp) mustBe "User not found"
      }
// todo: no conflict because session havn't _deleted

//      "POST :: Conflict" in {
//        val session = UserSession(
//          id = DatastoreId(IdGenerator.token(10)),
//          sessionId = UserSessionId(IdGenerator.token(10)),
//          userId = user.id,
//          userName = user.name,
//          userEmail = user.email,
//          impersonatorId = None,
//          impersonatorName = None,
//          impersonatorEmail = None,
//          impersonatorSessionId = None,
//          created = DateTime.now(),
//          ttl = 10.minute,
//          expires = DateTime.now().plusMinutes(10)
//        )
//
//        setupEnvBlocking(
//          tenants = Seq(tenant),
//          users = Seq(user),
//          teams = Seq(defaultAdminTeam),
//          subscriptions = Seq(adminApiSubscription),
//          sessions = Seq(session)
//        )
//
//        val resp = httpJsonCallWithoutSessionBlocking(
//          path = s"/admin-api/sessions",
//          method = "POST",
//          headers = getAdminApiHeader(adminApiSubscription),
//          body = session.copy(ttl = 1.hour).asJson.some
//        )(tenant)
//
//        resp.status mustBe 409
//      }

      "PUT :: BadRequest" in {
        val session = UserSession(
          id = DatastoreId(IdGenerator.token(10)),
          sessionId = UserSessionId(IdGenerator.token(10)),
          userId = user.id,
          userName = user.name,
          userEmail = user.email,
          impersonatorId = None,
          impersonatorName = None,
          impersonatorEmail = None,
          impersonatorSessionId = None,
          created = DateTime.now(),
          ttl = 10.minute,
          expires = DateTime.now().plusMinutes(10)
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription),
          sessions = Seq(session)
        )

        val respConflict = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/sessions/${session.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = user.copy(email = userAdmin.email).asJson.some
        )(using tenant)

        respConflict.status mustBe 400
      }

      "PUT :: Not Found" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val respNotFound = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/unknown",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = user.copy(name = "test").asJson.some
        )(using tenant)

        respNotFound.status mustBe 404
      }

      "PATCH :: BadRequest :: Email already exists" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/email",
                "value" -> userAdmin.email
              )
            )
            .some
        )(using tenant)

        resp.status mustBe 400
      }

      "PATCH :: Json PATCH :: OK" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )
        val userAdminEmail = "newUserAdminEmail@gmail.com"

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/email",
                "value" -> userAdminEmail
              )
            )
            .some
        )(using tenant)
        resp.status mustBe 204
      }

      "PATCH :: Conflict :: Json PATCH :: Path Not Found" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/personalEmail",
                "value" -> userAdmin.email
              )
            )
            .some
        )(using tenant)
        resp.status mustBe 409
      }

      "PATCH :: Conflict :: Json Object:: Path Not Found" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )
        val userAdminEmail = "newUserAdminEmail@gmail.com"
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .obj(
              "personalEmail" -> userAdminEmail
            )
            .some
        )(using tenant)
        resp.status mustBe 409
      }

      "PATCH :: Conflict :: Json Object:: Add a path element that does not exist in a list" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )
        val userAdminEmail = "newUserAdminEmail@gmail.com"
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .obj(
              "tenants" -> Json.arr(Json.obj("email" -> userAdminEmail))
            )
            .some
        )(using tenant)
        resp.status mustBe 409
      }

      "PATCH :: Json Object :: OK" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )
        val userAdminEmail = "newUserAdminEmail@gmail.com"
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .obj(
              "email" -> userAdminEmail
            )
            .some
        )(using tenant)
        resp.status mustBe 204
      }

      "GET :: Not Found" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/unknown",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 404
      }

      "GET :: Ok" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200
        resp.json mustBe user.asJson
      }

      "POST :: Created" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = user.asJson.some
        )(using tenant)

        resp.status mustBe 201

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json mustBe user.asJson
      }
      "PUT :: No Content" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )
        val name = "fifou"
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = user.copy(name = name).asJson.some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        (verif.json.as[JsObject] \ "name").as[String] mustBe name
      }
      "PATCH :: No Content" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )
        val name = "fifou"
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj("op" -> "replace", "path" -> "/name", "value" -> name)
            )
            .some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        (verif.json.as[JsObject] \ "name").as[String] mustBe name
      }
      "DELETE :: Ok" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val session = loginWithBlocking(user, tenant)
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/sessions/${session.id.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/sessions/${session.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 404
      }
    }

    "A call to ApiKey Consumption admin API" must {
      "POST :: Conflict :: Id already exists" in {
        val payPerUsePlanId = UsagePlanId("5")
        val sub = ApiSubscription(
          id = ApiSubscriptionId("test"),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = payPerUsePlanId,
          createdAt = DateTime.now(),
          team = teamConsumerId,
          api = defaultApi.api.id,
          by = userTeamAdminId,
          customName = None,
          rotation = None,
          integrationToken = "token"
        )
        val consumption = ApiKeyConsumption(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id,
          api = defaultApi.api.id,
          plan = payPerUsePlanId,
          clientId = sub.apiKey.clientId,
          hits = 42,
          globalInformations = ApiKeyGlobalConsumptionInformations(
            hits = 42,
            dataIn = 10000,
            dataOut = 10000,
            avgDuration = None,
            avgOverhead = None
          ),
          quotas = ApiKeyQuotas(
            authorizedCallsPerSec = 100,
            currentCallsPerSec = 100,
            remainingCallsPerSec = 100,
            authorizedCallsPerDay = 100,
            currentCallsPerDay = 100,
            remainingCallsPerDay = 100,
            authorizedCallsPerMonth = 100,
            currentCallsPerMonth = 100,
            remainingCallsPerMonth = 100
          ),
          billing = ApiKeyBilling(
            hits = 42,
            total = 420
          ),
          from = DateTime.now().minusDays(2).withTimeAtStartOfDay(),
          to = DateTime.now().minusDays(1).withTimeAtStartOfDay(),
          state = ApiKeyConsumptionState.Completed
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          consumptions = Seq(consumption),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = consumption
            .copy(from = DateTime.now().minusDays(1).withTimeAtStartOfDay())
            .asJson
            .some
        )(using tenant)

        resp.status mustBe 409
      }

      "POST :: BadRequest" in {
        val payPerUsePlanId = UsagePlanId("5")
        val sub = ApiSubscription(
          id = ApiSubscriptionId("test"),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = payPerUsePlanId,
          createdAt = DateTime.now(),
          team = teamConsumerId,
          api = defaultApi.api.id,
          by = userTeamAdminId,
          customName = None,
          rotation = None,
          integrationToken = "token"
        )
        val consumption = ApiKeyConsumption(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id,
          api = defaultApi.api.id,
          plan = payPerUsePlanId,
          clientId = sub.apiKey.clientId,
          hits = 42,
          globalInformations = ApiKeyGlobalConsumptionInformations(
            hits = 42,
            dataIn = 10000,
            dataOut = 10000,
            avgDuration = None,
            avgOverhead = None
          ),
          quotas = ApiKeyQuotas(
            authorizedCallsPerSec = 100,
            currentCallsPerSec = 100,
            remainingCallsPerSec = 100,
            authorizedCallsPerDay = 100,
            currentCallsPerDay = 100,
            remainingCallsPerDay = 100,
            authorizedCallsPerMonth = 100,
            currentCallsPerMonth = 100,
            remainingCallsPerMonth = 100
          ),
          billing = ApiKeyBilling(
            hits = 42,
            total = 420
          ),
          from = DateTime.now().minusDays(2).withTimeAtStartOfDay(),
          to = DateTime.now().minusDays(1).withTimeAtStartOfDay(),
          state = ApiKeyConsumptionState.Completed
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          consumptions = Seq(),
          subscriptions = Seq(adminApiSubscription)
        )

        // tenant not found
        val respTenant = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = consumption.copy(tenant = TenantId("unknown")).asJson.some
        )(using tenant)

        respTenant.status mustBe 400
        getMsg(respTenant) mustBe "Tenant not found"

        // api not found
        val respApi = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = consumption.copy(api = ApiId("unknown")).asJson.some
        )(using tenant)

        respApi.status mustBe 400
        getMsg(respApi) mustBe "Api not found"

        // plan not found
        val respPlan = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = consumption.copy(plan = UsagePlanId("unknown")).asJson.some
        )(using tenant)

        respPlan.status mustBe 400
        getMsg(respPlan) mustBe "Plan not found"

        // wrong date
        val respDate = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = consumption.copy(from = DateTime.now().plusDays(2)).asJson.some
        )(using tenant)

        respDate.status mustBe 400
        getMsg(respDate) mustBe "From date must be before to date"
      }

      "PUT :: BadRequest" in {
        val payPerUsePlanId = UsagePlanId("5")
        val sub = ApiSubscription(
          id = ApiSubscriptionId("test"),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = payPerUsePlanId,
          createdAt = DateTime.now(),
          team = teamConsumerId,
          api = defaultApi.api.id,
          by = userTeamAdminId,
          customName = None,
          rotation = None,
          integrationToken = "token"
        )
        val consumption = ApiKeyConsumption(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id,
          api = defaultApi.api.id,
          plan = payPerUsePlanId,
          clientId = sub.apiKey.clientId,
          hits = 42,
          globalInformations = ApiKeyGlobalConsumptionInformations(
            hits = 42,
            dataIn = 10000,
            dataOut = 10000,
            avgDuration = None,
            avgOverhead = None
          ),
          quotas = ApiKeyQuotas(
            authorizedCallsPerSec = 100,
            currentCallsPerSec = 100,
            remainingCallsPerSec = 100,
            authorizedCallsPerDay = 100,
            currentCallsPerDay = 100,
            remainingCallsPerDay = 100,
            authorizedCallsPerMonth = 100,
            currentCallsPerMonth = 100,
            remainingCallsPerMonth = 100
          ),
          billing = ApiKeyBilling(
            hits = 42,
            total = 420
          ),
          from = DateTime.now().minusDays(2).withTimeAtStartOfDay(),
          to = DateTime.now().minusDays(1).withTimeAtStartOfDay(),
          state = ApiKeyConsumptionState.Completed
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          consumptions = Seq(consumption),
          subscriptions = Seq(adminApiSubscription)
        )

        // tenant not found
        val respTenant = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = consumption.copy(tenant = TenantId("unknown")).asJson.some
        )(using tenant)

        respTenant.status mustBe 400
        getMsg(respTenant) mustBe "Tenant not found"

        // api not found
        val respApi = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = consumption.copy(api = ApiId("unknown")).asJson.some
        )(using tenant)

        respApi.status mustBe 400
        getMsg(respApi) mustBe "Api not found"

        // plan not found
        val respPlan = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = consumption.copy(plan = UsagePlanId("unknown")).asJson.some
        )(using tenant)

        respPlan.status mustBe 400
        getMsg(respPlan) mustBe "Plan not found"

        // wrong date
        val respDate = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = consumption.copy(from = DateTime.now().plusDays(2)).asJson.some
        )(using tenant)

        respDate.status mustBe 400
        getMsg(respDate) mustBe "From date must be before to date"
      }

      "PATCH :: BadRequest" in {
        val payPerUsePlanId = UsagePlanId("5")
        val sub = ApiSubscription(
          id = ApiSubscriptionId("test"),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = payPerUsePlanId,
          createdAt = DateTime.now(),
          team = teamConsumerId,
          api = defaultApi.api.id,
          by = userTeamAdminId,
          customName = None,
          rotation = None,
          integrationToken = "token"
        )
        val consumption = ApiKeyConsumption(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id,
          api = defaultApi.api.id,
          plan = payPerUsePlanId,
          clientId = sub.apiKey.clientId,
          hits = 42,
          globalInformations = ApiKeyGlobalConsumptionInformations(
            hits = 42,
            dataIn = 10000,
            dataOut = 10000,
            avgDuration = None,
            avgOverhead = None
          ),
          quotas = ApiKeyQuotas(
            authorizedCallsPerSec = 100,
            currentCallsPerSec = 100,
            remainingCallsPerSec = 100,
            authorizedCallsPerDay = 100,
            currentCallsPerDay = 100,
            remainingCallsPerDay = 100,
            authorizedCallsPerMonth = 100,
            currentCallsPerMonth = 100,
            remainingCallsPerMonth = 100
          ),
          billing = ApiKeyBilling(
            hits = 42,
            total = 420
          ),
          from = DateTime.now().minusDays(2).withTimeAtStartOfDay(),
          to = DateTime.now().minusDays(1).withTimeAtStartOfDay(),
          state = ApiKeyConsumptionState.Completed
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          consumptions = Seq(consumption),
          subscriptions = Seq(adminApiSubscription)
        )

        // tenant not found
        val respTenant = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/_tenant",
                "value" -> TenantId("unknown").asJson
              )
            )
            .some
        )(using tenant)

        respTenant.status mustBe 400
        getMsg(respTenant) mustBe "Tenant not found"

        // api not found
        val respApi = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/api",
                "value" -> ApiId("unknown").asJson
              )
            )
            .some
        )(using tenant)

        respApi.status mustBe 400
        getMsg(respApi) mustBe "Api not found"

        // plan not found
        val respPlan = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/plan",
                "value" -> UsagePlanId("unknown").asJson
              )
            )
            .some
        )(using tenant)

        respPlan.status mustBe 400
        getMsg(respPlan) mustBe "Plan not found"

        // wrong date
        val respDate = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/from",
                "value" -> json.DateTimeFormat
                  .writes(DateTime.now().plusDays(2))
              )
            )
            .some
        )(using tenant)

        respDate.status mustBe 400
        getMsg(respDate) mustBe "From date must be before to date"
      }

      "GET :: Ok" in {
        val payPerUsePlanId = UsagePlanId("5")
        val sub = ApiSubscription(
          id = ApiSubscriptionId("test"),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = payPerUsePlanId,
          createdAt = DateTime.now(),
          team = teamConsumerId,
          api = defaultApi.api.id,
          by = userTeamAdminId,
          customName = None,
          rotation = None,
          integrationToken = "token"
        )
        val consumption = ApiKeyConsumption(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id,
          api = defaultApi.api.id,
          plan = payPerUsePlanId,
          clientId = sub.apiKey.clientId,
          hits = 42,
          globalInformations = ApiKeyGlobalConsumptionInformations(
            hits = 42,
            dataIn = 10000,
            dataOut = 10000,
            avgDuration = None,
            avgOverhead = None
          ),
          quotas = ApiKeyQuotas(
            authorizedCallsPerSec = 100,
            currentCallsPerSec = 100,
            remainingCallsPerSec = 100,
            authorizedCallsPerDay = 100,
            currentCallsPerDay = 100,
            remainingCallsPerDay = 100,
            authorizedCallsPerMonth = 100,
            currentCallsPerMonth = 100,
            remainingCallsPerMonth = 100
          ),
          billing = ApiKeyBilling(
            hits = 42,
            total = 420
          ),
          from = DateTime.now().minusDays(2).withTimeAtStartOfDay(),
          to = DateTime.now().minusDays(1).withTimeAtStartOfDay(),
          state = ApiKeyConsumptionState.Completed
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          consumptions = Seq(consumption),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200
        resp.json mustBe consumption.asJson
      }

      "POST :: Created" in {
        val payPerUsePlanId = UsagePlanId("5")
        val sub = ApiSubscription(
          id = ApiSubscriptionId("test"),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = payPerUsePlanId,
          createdAt = DateTime.now(),
          team = teamConsumerId,
          api = defaultApi.api.id,
          by = userTeamAdminId,
          customName = None,
          rotation = None,
          integrationToken = "token"
        )
        val consumption = ApiKeyConsumption(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id,
          api = defaultApi.api.id,
          plan = payPerUsePlanId,
          clientId = sub.apiKey.clientId,
          hits = 42,
          globalInformations = ApiKeyGlobalConsumptionInformations(
            hits = 42,
            dataIn = 10000,
            dataOut = 10000,
            avgDuration = None,
            avgOverhead = None
          ),
          quotas = ApiKeyQuotas(
            authorizedCallsPerSec = 100,
            currentCallsPerSec = 100,
            remainingCallsPerSec = 100,
            authorizedCallsPerDay = 100,
            currentCallsPerDay = 100,
            remainingCallsPerDay = 100,
            authorizedCallsPerMonth = 100,
            currentCallsPerMonth = 100,
            remainingCallsPerMonth = 100
          ),
          billing = ApiKeyBilling(
            hits = 42,
            total = 420
          ),
          from = DateTime.now().minusDays(2).withTimeAtStartOfDay(),
          to = DateTime.now().minusDays(1).withTimeAtStartOfDay(),
          state = ApiKeyConsumptionState.Completed
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          consumptions = Seq(),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions",
          headers = getAdminApiHeader(adminApiSubscription),
          method = "POST",
          body = consumption.asJson.some
        )(using tenant)

        resp.status mustBe 201
        resp.json mustBe consumption.asJson
      }
      "PUT :: No Content" in {
        val payPerUsePlanId = UsagePlanId("5")
        val sub = ApiSubscription(
          id = ApiSubscriptionId("test"),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = payPerUsePlanId,
          createdAt = DateTime.now(),
          team = teamConsumerId,
          api = defaultApi.api.id,
          by = userTeamAdminId,
          customName = None,
          rotation = None,
          integrationToken = "token"
        )
        val consumption = ApiKeyConsumption(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id,
          api = defaultApi.api.id,
          plan = payPerUsePlanId,
          clientId = sub.apiKey.clientId,
          hits = 42,
          globalInformations = ApiKeyGlobalConsumptionInformations(
            hits = 42,
            dataIn = 10000,
            dataOut = 10000,
            avgDuration = None,
            avgOverhead = None
          ),
          quotas = ApiKeyQuotas(
            authorizedCallsPerSec = 100,
            currentCallsPerSec = 100,
            remainingCallsPerSec = 100,
            authorizedCallsPerDay = 100,
            currentCallsPerDay = 100,
            remainingCallsPerDay = 100,
            authorizedCallsPerMonth = 100,
            currentCallsPerMonth = 100,
            remainingCallsPerMonth = 100
          ),
          billing = ApiKeyBilling(
            hits = 42,
            total = 420
          ),
          from = DateTime.now().minusDays(2).withTimeAtStartOfDay(),
          to = DateTime.now().minusDays(1).withTimeAtStartOfDay(),
          state = ApiKeyConsumptionState.Completed
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          consumptions = Seq(consumption),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
          method = "PUT",
          body = consumption.copy(hits = 100).asJson.some
        )(using tenant)

        resp.status mustBe 204

        val respVerif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        respVerif.status mustBe 200
        (respVerif.json \ "hits").as[Long] mustBe 100
      }
      "PATCH :: No Content" in {
        val payPerUsePlanId = UsagePlanId("5")
        val sub = ApiSubscription(
          id = ApiSubscriptionId("test"),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = payPerUsePlanId,
          createdAt = DateTime.now(),
          team = teamConsumerId,
          api = defaultApi.api.id,
          by = userTeamAdminId,
          customName = None,
          rotation = None,
          integrationToken = "token"
        )
        val consumption = ApiKeyConsumption(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id,
          api = defaultApi.api.id,
          plan = payPerUsePlanId,
          clientId = sub.apiKey.clientId,
          hits = 42,
          globalInformations = ApiKeyGlobalConsumptionInformations(
            hits = 42,
            dataIn = 10000,
            dataOut = 10000,
            avgDuration = None,
            avgOverhead = None
          ),
          quotas = ApiKeyQuotas(
            authorizedCallsPerSec = 100,
            currentCallsPerSec = 100,
            remainingCallsPerSec = 100,
            authorizedCallsPerDay = 100,
            currentCallsPerDay = 100,
            remainingCallsPerDay = 100,
            authorizedCallsPerMonth = 100,
            currentCallsPerMonth = 100,
            remainingCallsPerMonth = 100
          ),
          billing = ApiKeyBilling(
            hits = 42,
            total = 420
          ),
          from = DateTime.now().minusDays(2).withTimeAtStartOfDay(),
          to = DateTime.now().minusDays(1).withTimeAtStartOfDay(),
          state = ApiKeyConsumptionState.Completed
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          consumptions = Seq(consumption),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
          method = "PATCH",
          body = Json
            .arr(Json.obj("op" -> "replace", "path" -> "/hits", "value" -> 100))
            .some
        )(using tenant)

        resp.status mustBe 204

        val respVerif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        respVerif.status mustBe 200
        (respVerif.json \ "hits").as[Long] mustBe 100
      }
      "DELETE :: Ok" in {
        val payPerUsePlanId = UsagePlanId("5")
        val sub = ApiSubscription(
          id = ApiSubscriptionId("test"),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = payPerUsePlanId,
          createdAt = DateTime.now(),
          team = teamConsumerId,
          api = defaultApi.api.id,
          by = userTeamAdminId,
          customName = None,
          rotation = None,
          integrationToken = "token"
        )
        val consumption = ApiKeyConsumption(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id,
          api = defaultApi.api.id,
          plan = payPerUsePlanId,
          clientId = sub.apiKey.clientId,
          hits = 42,
          globalInformations = ApiKeyGlobalConsumptionInformations(
            hits = 42,
            dataIn = 10000,
            dataOut = 10000,
            avgDuration = None,
            avgOverhead = None
          ),
          quotas = ApiKeyQuotas(
            authorizedCallsPerSec = 100,
            currentCallsPerSec = 100,
            remainingCallsPerSec = 100,
            authorizedCallsPerDay = 100,
            currentCallsPerDay = 100,
            remainingCallsPerDay = 100,
            authorizedCallsPerMonth = 100,
            currentCallsPerMonth = 100,
            remainingCallsPerMonth = 100
          ),
          billing = ApiKeyBilling(
            hits = 42,
            total = 420
          ),
          from = DateTime.now().minusDays(2).withTimeAtStartOfDay(),
          to = DateTime.now().minusDays(1).withTimeAtStartOfDay(),
          state = ApiKeyConsumptionState.Completed
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          consumptions = Seq(consumption),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
          method = "DELETE"
        )(using tenant)

        resp.status mustBe 200
      }
    }

    "a call to audit event admin API" must {
      // todo: nothing validated
    }
    "A call to Message admin API" must {
// todo: message do not have deleted property...findNotDeleted does not work properly

//      "POST :: Conflict :: Message already exists" in {
//        val message = Message(
//          id = DatastoreId("toto"),
//          tenant = tenant.id,
//          messageType = MessageType.Tenant(tenant.id),
//          participants = Set(user.id, userAdmin.id),
//          readBy = Set.empty,
//          chat = user.id,
//          date = DateTime.now(),
//          sender = user.id,
//          message = "hello",
//          closed = None,
//          send = true
//        )
//        setupEnvBlocking(
//          tenants = Seq(tenant),
//          users = Seq(user, userAdmin),
//          teams = Seq(teamOwner),
//          subscriptions = Seq(adminApiSubscription),
//          messages = Seq(message)
//        )
//
//        val resp = httpJsonCallWithoutSessionBlocking(
//          path = s"/admin-api/messages",
//          method = "POST",
//          headers = getAdminApiHeader(adminApiSubscription),
//          body = message.asJson.some
//        )(tenant)
//
//        resp.status mustBe 409
//      }

      "POST :: BadRequest" in {
        val message = Message(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          messageType = MessageType.Tenant(tenant.id),
          participants = Set(user.id, userAdmin.id),
          readBy = Set.empty,
          chat = user.id,
          date = DateTime.now(),
          sender = user.id,
          message = "hello",
          closed = None,
          send = true
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin, userApiEditor),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          messages = Seq()
        )

        // tenant not found
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = message.copy(tenant = TenantId("unknown")).asJson.some
        )(using tenant)

        resp.status mustBe 400
        getMsg(resp) mustBe "Tenant not found"

        // user not found
        val respUser = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = message.copy(sender = UserId("unknown")).asJson.some
        )(using tenant)

        respUser.status mustBe 400
        getMsg(respUser) mustBe "Sender (unknown) not found"

        // participant not found
        val respParticipant = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = message
            .copy(participants = Set(user.id, UserId("unknown")))
            .asJson
            .some
        )(using tenant)

        respParticipant.status mustBe 400
        getMsg(respParticipant) mustBe "Participant (unknown) not found"

        // sender not in participant
        val respNotIn = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = message.copy(sender = userApiEditor.id).asJson.some
        )(using tenant)

        respNotIn.status mustBe 400
        getMsg(respNotIn) mustBe "Sender must included in participants"
      }

      "PUT :: BadRequest" in {
        val message = Message(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          messageType = MessageType.Tenant(tenant.id),
          participants = Set(user.id, userAdmin.id),
          readBy = Set.empty,
          chat = user.id,
          date = DateTime.now(),
          sender = user.id,
          message = "hello",
          closed = None,
          send = true
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin, userApiEditor),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          messages = Seq(message)
        )

        // tenant not found
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages/${message.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = message.copy(tenant = TenantId("unknown")).asJson.some
        )(using tenant)

        resp.status mustBe 400
        getMsg(resp) mustBe "Tenant not found"

        // user not found
        val respUser = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages/${message.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = message.copy(sender = UserId("unknown")).asJson.some
        )(using tenant)

        respUser.status mustBe 400
        getMsg(respUser) mustBe "Sender (unknown) not found"

        // tenant not found
        val respParticipant = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages/${message.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = message
            .copy(participants =
              message.participants.union(Set(UserId("unknown")))
            )
            .asJson
            .some
        )(using tenant)

        respParticipant.status mustBe 400
        getMsg(respParticipant) mustBe "Participant (unknown) not found"

        // sender not in participant
        val respNotIn = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages/${message.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = message.copy(sender = userApiEditor.id).asJson.some
        )(using tenant)

        respNotIn.status mustBe 400
        getMsg(respNotIn) mustBe "Sender must included in participants"
      }

      "PUT :: Not Found" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val respNotFound = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages/unknown",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = teamOwner.copy(name = "test").asJson.some
        )(using tenant)

        respNotFound.status mustBe 404
      }

      "PATCH :: BadRequest" in {
        val message = Message(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          messageType = MessageType.Tenant(tenant.id),
          participants = Set(user.id, userAdmin.id),
          readBy = Set.empty,
          chat = user.id,
          date = DateTime.now(),
          sender = user.id,
          message = "hello",
          closed = None,
          send = true
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          messages = Seq(message)
        )

        // tenant not found
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages/${message.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/_tenant",
                "value" -> TenantId("unknown").asJson
              )
            )
            .some
        )(using tenant)

        resp.status mustBe 400
        getMsg(resp) mustBe "Tenant not found"

        // user not found
        val respUser = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages/${message.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/sender",
                "value" -> UserId("unknown").asJson
              )
            )
            .some
        )(using tenant)

        respUser.status mustBe 400
        getMsg(respUser) mustBe "Sender (unknown) not found"

        // tenant not found
        val respParticipant = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages/${message.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/participants",
                "value" -> json.SetUserIdFormat
                  .writes(message.participants.union(Set(UserId("unknown"))))
              )
            )
            .some
        )(using tenant)

        respParticipant.status mustBe 400
        getMsg(respParticipant) mustBe "Participant (unknown) not found"
      }

      "GET :: Not Found" in {
        val message = Message(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          messageType = MessageType.Tenant(tenant.id),
          participants = Set(user.id, userAdmin.id),
          readBy = Set.empty,
          chat = user.id,
          date = DateTime.now(),
          sender = user.id,
          message = "hello",
          closed = None,
          send = true
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          messages = Seq(message)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages/unknown",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 404
      }

      "GET :: Ok" in {
        val message = Message(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          messageType = MessageType.Tenant(tenant.id),
          participants = Set(user.id, userAdmin.id),
          readBy = Set.empty,
          chat = user.id,
          date = DateTime.now(),
          sender = user.id,
          message = "hello",
          closed = None,
          send = true
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          messages = Seq(message)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages/${message.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200
        resp.json mustBe message.asJson
      }

      "POST :: Created" in {
        val message = Message(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          messageType = MessageType.Tenant(tenant.id),
          participants = Set(user.id, userAdmin.id),
          readBy = Set.empty,
          chat = user.id,
          date = DateTime.now(),
          sender = user.id,
          message = "hello",
          closed = None,
          send = true
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          messages = Seq()
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = message.asJson.some
        )(using tenant)

        resp.status mustBe 201

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages/${message.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json mustBe message.asJson
      }
      "PUT :: No Content" in {
        val message = Message(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          messageType = MessageType.Tenant(tenant.id),
          participants = Set(user.id, userAdmin.id),
          readBy = Set.empty,
          chat = user.id,
          date = DateTime.now(),
          sender = user.id,
          message = "hello",
          closed = None,
          send = true
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin, userApiEditor),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          messages = Seq(message)
        )
        val updated = message.copy(
          sender = userAdmin.id,
          participants = message.participants.union(Set(userApiEditor.id))
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages/${message.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = updated.asJson.some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages/${message.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json.as(using json.MessageFormat) mustBe updated
      }
      "PATCH :: No Content" in {
        val message = Message(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          messageType = MessageType.Tenant(tenant.id),
          participants = Set(user.id, userAdmin.id),
          readBy = Set.empty,
          chat = user.id,
          date = DateTime.now(),
          sender = user.id,
          message = "hello",
          closed = None,
          send = true
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin, userApiEditor),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          messages = Seq(message)
        )
        val updated = message.copy(
          sender = userAdmin.id,
          participants = message.participants.union(Set(userApiEditor.id))
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages/${message.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/sender",
                "value" -> userAdmin.id.asJson
              ),
              Json.obj(
                "op" -> "replace",
                "path" -> "/participants",
                "value" -> json.SetUserIdFormat
                  .writes(message.participants.union(Set(userApiEditor.id)))
              )
            )
            .some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages/${message.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json.as(using json.MessageFormat) mustBe updated
      }
      "DELETE :: Ok" in {
        val message = Message(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          messageType = MessageType.Tenant(tenant.id),
          participants = Set(user.id, userAdmin.id),
          readBy = Set.empty,
          chat = user.id,
          date = DateTime.now(),
          sender = user.id,
          message = "hello",
          closed = None,
          send = true
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin, userApiEditor),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          messages = Seq(message)
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages/${message.id.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages/${message.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 404
      }
    }

    "A call to Issue admin API" must {
      "POST :: Conflict :: Issue already exists" in {
        val issue = ApiIssue(
          id = ApiIssueId(IdGenerator.token(10)),
          seqId = 1,
          tenant = tenant.id,
          title = "test",
          tags = Set(ApiIssueTagId("1")),
          open = true,
          createdAt = DateTime.now(),
          closedAt = None,
          by = user.id,
          comments = Seq(
            ApiIssueComment(
              by = user.id,
              createdAt = DateTime.now(),
              lastModificationAt = DateTime.now(),
              content = "..."
            )
          ),
          lastModificationAt = DateTime.now()
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          issues = Seq(issue)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/issues",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = issue.asJson.some
        )(using tenant)

        resp.status mustBe 409
      }

      "POST :: BadRequest" in {
        val issue = ApiIssue(
          id = ApiIssueId(IdGenerator.token(10)),
          seqId = 1,
          tenant = tenant.id,
          title = "test",
          tags = Set(ApiIssueTagId("1")),
          open = true,
          createdAt = DateTime.now(),
          closedAt = None,
          by = user.id,
          comments = Seq(
            ApiIssueComment(
              by = user.id,
              createdAt = DateTime.now(),
              lastModificationAt = DateTime.now(),
              content = "..."
            )
          ),
          lastModificationAt = DateTime.now()
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          issues = Seq()
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/issues",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = issue.copy(tenant = TenantId("unkown")).asJson.some
        )(using tenant)

        resp.status mustBe 400
        getMsg(resp) mustBe "Tenant not found"

        val respBy = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/issues",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = issue.copy(by = UserId("unkown")).asJson.some
        )(using tenant)

        respBy.status mustBe 400
        getMsg(respBy) mustBe "By not found"
      }

      "PUT :: Not Found" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          issues = Seq()
        )

        val respNotFound = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/issues/unknown",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = teamOwner.copy(name = "test").asJson.some
        )(using tenant)

        respNotFound.status mustBe 404
      }

      "GET :: Not Found" in {
        val message = Message(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          messageType = MessageType.Tenant(tenant.id),
          participants = Set(user.id, userAdmin.id),
          readBy = Set.empty,
          chat = user.id,
          date = DateTime.now(),
          sender = user.id,
          message = "hello",
          closed = None,
          send = true
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          messages = Seq(message)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/messages/unknown",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 404
      }

      "GET :: Ok" in {
        val issue = ApiIssue(
          id = ApiIssueId(IdGenerator.token(10)),
          seqId = 1,
          tenant = tenant.id,
          title = "test",
          tags = Set(ApiIssueTagId("1")),
          open = true,
          createdAt = DateTime.now(),
          closedAt = None,
          by = user.id,
          comments = Seq(
            ApiIssueComment(
              by = user.id,
              createdAt = DateTime.now(),
              lastModificationAt = DateTime.now(),
              content = "..."
            )
          ),
          lastModificationAt = DateTime.now()
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          issues = Seq(issue)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/issues/${issue.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200
        resp.json mustBe issue.asJson
      }

      "POST :: Created" in {
        val issue = ApiIssue(
          id = ApiIssueId(IdGenerator.token(10)),
          seqId = 1,
          tenant = tenant.id,
          title = "test",
          tags = Set(ApiIssueTagId("1")),
          open = true,
          createdAt = DateTime.now(),
          closedAt = None,
          by = user.id,
          comments = Seq(
            ApiIssueComment(
              by = user.id,
              createdAt = DateTime.now(),
              lastModificationAt = DateTime.now(),
              content = "..."
            )
          ),
          lastModificationAt = DateTime.now()
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          issues = Seq()
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/issues",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = issue.asJson.some
        )(using tenant)

        resp.status mustBe 201

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/issues/${issue.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json mustBe issue.asJson
      }
      "PUT :: No Content" in {
        val issue = ApiIssue(
          id = ApiIssueId(IdGenerator.token(10)),
          seqId = 1,
          tenant = tenant.id,
          title = "test",
          tags = Set(ApiIssueTagId("1")),
          open = true,
          createdAt = DateTime.now(),
          closedAt = None,
          by = user.id,
          comments = Seq(
            ApiIssueComment(
              by = user.id,
              createdAt = DateTime.now(),
              lastModificationAt = DateTime.now(),
              content = "..."
            )
          ),
          lastModificationAt = DateTime.now()
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          issues = Seq(issue)
        )
        val updated = issue.copy(title = "foo")
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/issues/${updated.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = updated.asJson.some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/issues/${issue.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json.as(using json.ApiIssueFormat) mustBe updated
      }
      "PATCH :: No Content" in {
        val issue = ApiIssue(
          id = ApiIssueId(IdGenerator.token(10)),
          seqId = 1,
          tenant = tenant.id,
          title = "test",
          tags = Set(ApiIssueTagId("1")),
          open = true,
          createdAt = DateTime.now(),
          closedAt = None,
          by = user.id,
          comments = Seq(
            ApiIssueComment(
              by = user.id,
              createdAt = DateTime.now(),
              lastModificationAt = DateTime.now(),
              content = "..."
            )
          ),
          lastModificationAt = DateTime.now()
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          issues = Seq(issue)
        )
        val updated = issue.copy(title = "foo")
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/issues/${issue.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj("op" -> "replace", "path" -> "/title", "value" -> "foo")
            )
            .some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/issues/${issue.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json.as(using json.ApiIssueFormat) mustBe updated
      }
      "DELETE :: Ok" in {
        val issue = ApiIssue(
          id = ApiIssueId(IdGenerator.token(10)),
          seqId = 1,
          tenant = tenant.id,
          title = "test",
          tags = Set(ApiIssueTagId("1")),
          open = true,
          createdAt = DateTime.now(),
          closedAt = None,
          by = user.id,
          comments = Seq(
            ApiIssueComment(
              by = user.id,
              createdAt = DateTime.now(),
              lastModificationAt = DateTime.now(),
              content = "..."
            )
          ),
          lastModificationAt = DateTime.now()
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          issues = Seq(issue)
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/issues/${issue.id.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/issues/${issue.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 404
      }
    }

    "A call to Post admin API" must {
      "POST :: Conflict :: Post already exists" in {
        val post = ApiPost(
          id = ApiPostId(IdGenerator.token(10)),
          tenant = tenant.id,
          title = "title",
          lastModificationAt = DateTime.now(),
          content = "..."
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          posts = Seq(post)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/posts",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = post.asJson.some
        )(using tenant)

        resp.status mustBe 409
      }

      "POST :: BadRequest" in {
        val post = ApiPost(
          id = ApiPostId(IdGenerator.token(10)),
          tenant = tenant.id,
          title = "title",
          lastModificationAt = DateTime.now(),
          content = "..."
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          posts = Seq()
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/posts",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = post.copy(tenant = TenantId("unkown")).asJson.some
        )(using tenant)

        resp.status mustBe 400
        getMsg(resp) mustBe "Tenant not found"
      }

      "PUT :: Not Found" in {
        val post = ApiPost(
          id = ApiPostId(IdGenerator.token(10)),
          tenant = tenant.id,
          title = "title",
          lastModificationAt = DateTime.now(),
          content = "..."
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          posts = Seq()
        )

        val respNotFound = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/posts/unknown",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = teamOwner.copy(name = "test").asJson.some
        )(using tenant)

        respNotFound.status mustBe 404
      }

      "GET :: Not Found" in {
        val post = ApiPost(
          id = ApiPostId(IdGenerator.token(10)),
          tenant = tenant.id,
          title = "title",
          lastModificationAt = DateTime.now(),
          content = "..."
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          posts = Seq(post)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/posts/unknown",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 404
      }

      "GET :: Ok" in {
        val post = ApiPost(
          id = ApiPostId(IdGenerator.token(10)),
          tenant = tenant.id,
          title = "title",
          lastModificationAt = DateTime.now(),
          content = "..."
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          posts = Seq(post)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/posts/${post.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200
        resp.json mustBe post.asJson
      }

      "POST :: Created" in {
        val post = ApiPost(
          id = ApiPostId(IdGenerator.token(10)),
          tenant = tenant.id,
          title = "title",
          lastModificationAt = DateTime.now(),
          content = "..."
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          posts = Seq()
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/posts",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = post.asJson.some
        )(using tenant)

        resp.status mustBe 201

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/posts/${post.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json mustBe post.asJson
      }
      "PUT :: No Content" in {
        val post = ApiPost(
          id = ApiPostId(IdGenerator.token(10)),
          tenant = tenant.id,
          title = "title",
          lastModificationAt = DateTime.now(),
          content = "..."
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          posts = Seq(post)
        )
        val updated = post.copy(title = "foo")
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/posts/${post.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = updated.asJson.some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/posts/${post.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json.as(using json.ApiPostFormat) mustBe updated
      }
      "PATCH :: No Content" in {
        val post = ApiPost(
          id = ApiPostId(IdGenerator.token(10)),
          tenant = tenant.id,
          title = "title",
          lastModificationAt = DateTime.now(),
          content = "..."
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          posts = Seq(post)
        )
        val updated = post.copy(title = "foo")
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/posts/${post.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj("op" -> "replace", "path" -> "/title", "value" -> "foo")
            )
            .some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/posts/${post.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json.as(using json.ApiPostFormat) mustBe updated
      }
      "DELETE :: Ok" in {
        val post = ApiPost(
          id = ApiPostId(IdGenerator.token(10)),
          tenant = tenant.id,
          title = "title",
          lastModificationAt = DateTime.now(),
          content = "..."
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(teamOwner),
          subscriptions = Seq(adminApiSubscription),
          posts = Seq(post)
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/posts/${post.id.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/posts/${post.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 404
      }
    }

    "A call to CMS pages admin API" must {
      "POST :: Conflict :: page already exists" in {
        val page = CmsPage(
          id = CmsPageId(IdGenerator.token(10)),
          tenant = tenant.id,
          visible = true,
          authenticated = true,
          name = "foo",
          forwardRef = None,
          tags = List.empty,
          metadata = Map.empty,
          contentType = "text/html",
          body = "<div>hello world</div>",
          path = None,
          lastPublishedDate = DateTime.now().some
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          cmsPages = Seq(page)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/cms-pages",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = page.asJson.some
        )(using tenant)

        resp.status mustBe 409
      }

      "POST :: BadRequest" in {
        val page = CmsPage(
          id = CmsPageId(IdGenerator.token(10)),
          tenant = tenant.id,
          visible = true,
          authenticated = true,
          name = "foo",
          forwardRef = None,
          tags = List.empty,
          metadata = Map.empty,
          contentType = "text/html",
          body = "<div>hello world</div>",
          path = None,
          lastPublishedDate = DateTime.now().some
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          cmsPages = Seq()
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/cms-pages",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = page.copy(tenant = TenantId("unkown")).asJson.some
        )(using tenant)

        resp.status mustBe 400
        getMsg(resp) mustBe "Tenant not found"
      }

      "PUT :: Not Found" in {
        val page = CmsPage(
          id = CmsPageId(IdGenerator.token(10)),
          tenant = tenant.id,
          visible = true,
          authenticated = true,
          name = "foo",
          forwardRef = None,
          tags = List.empty,
          metadata = Map.empty,
          contentType = "text/html",
          body = "<div>hello world</div>",
          path = None,
          lastPublishedDate = DateTime.now().some
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          cmsPages = Seq()
        )

        val respNotFound = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/cms-pages/unknown",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = page.copy(name = "test").asJson.some
        )(using tenant)

        respNotFound.status mustBe 404
      }

      "GET :: Not Found" in {
        val page = CmsPage(
          id = CmsPageId(IdGenerator.token(10)),
          tenant = tenant.id,
          visible = true,
          authenticated = true,
          name = "foo",
          forwardRef = None,
          tags = List.empty,
          metadata = Map.empty,
          contentType = "text/html",
          body = "<div>hello world</div>",
          path = None,
          lastPublishedDate = DateTime.now().some
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          cmsPages = Seq(page)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/cms-pages/unknown",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 404
      }

      "GET :: Ok" in {
        val page = CmsPage(
          id = CmsPageId(IdGenerator.token(10)),
          tenant = tenant.id,
          visible = true,
          authenticated = true,
          name = "foo",
          forwardRef = None,
          tags = List.empty,
          metadata = Map.empty,
          contentType = "text/html",
          body = "<div>hello world</div>",
          path = None,
          lastPublishedDate = DateTime.now().some
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          cmsPages = Seq(page)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/cms-pages/${page.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200
        resp.json mustBe page.asJson
      }

      "POST :: Created" in {
        val page = CmsPage(
          id = CmsPageId(IdGenerator.token(10)),
          tenant = tenant.id,
          visible = true,
          authenticated = true,
          name = "foo",
          forwardRef = None,
          tags = List.empty,
          metadata = Map.empty,
          contentType = "text/html",
          body = "<div>hello world</div>",
          path = None,
          lastPublishedDate = DateTime.now().some
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          cmsPages = Seq()
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/cms-pages",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = page.asJson.some
        )(using tenant)

        resp.status mustBe 201

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/cms-pages/${page.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json mustBe page.asJson
      }
      "PUT :: No Content" in {
        val page = CmsPage(
          id = CmsPageId(IdGenerator.token(10)),
          tenant = tenant.id,
          visible = true,
          authenticated = true,
          name = "foo",
          forwardRef = None,
          tags = List.empty,
          metadata = Map.empty,
          contentType = "text/html",
          body = "<div>hello world</div>",
          path = None,
          lastPublishedDate = DateTime.now().some
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          cmsPages = Seq(page)
        )
        val updated = page.copy(name = "foo")
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/cms-pages/${page.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = updated.asJson.some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/cms-pages/${page.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json.as(using json.CmsPageFormat) mustBe updated
      }
      "PATCH :: No Content" in {
        val page = CmsPage(
          id = CmsPageId(IdGenerator.token(10)),
          tenant = tenant.id,
          visible = true,
          authenticated = true,
          name = "foo",
          forwardRef = None,
          tags = List.empty,
          metadata = Map.empty,
          contentType = "text/html",
          body = "<div>hello world</div>",
          path = None,
          lastPublishedDate = DateTime.now().some
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          cmsPages = Seq(page)
        )
        val updated = page.copy(name = "foo")
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/cms-pages/${page.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj("op" -> "replace", "path" -> "/name", "value" -> "foo")
            )
            .some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/cms-pages/${page.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json.as(using json.CmsPageFormat) mustBe updated
      }
      "DELETE :: Ok" in {
        val page = CmsPage(
          id = CmsPageId(IdGenerator.token(10)),
          tenant = tenant.id,
          visible = true,
          authenticated = true,
          name = "foo",
          forwardRef = None,
          tags = List.empty,
          metadata = Map.empty,
          contentType = "text/html",
          body = "<div>hello world</div>",
          path = None,
          lastPublishedDate = DateTime.now().some
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          cmsPages = Seq(page)
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/cms-pages/${page.id.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/cms-pages/${page.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 404
      }
    }

    "A call to translation admin API" must {
      // todo: no deleted => no conflict

//      "POST :: Conflict :: translation already exists" in {
//        val translation = Translation(
//          id = DatastoreId(IdGenerator.token(10)),
//          tenant = tenant.id, language = "fr", key = "foo", value = "bar", lastModificationAt = DateTime.now().some
//        )
//
//        setupEnvBlocking(
//          tenants = Seq(tenant),
//          subscriptions = Seq(adminApiSubscription),
//          translations = Seq(translation)
//        )
//
//        val resp = httpJsonCallWithoutSessionBlocking(
//          path = s"/admin-api/translations",
//          method = "POST",
//          headers = getAdminApiHeader(adminApiSubscription),
//          body = translation.asJson.some
//        )(tenant)
//
//        resp.status mustBe 409
//      }

      "POST :: BadRequest" in {
        val translation = Translation(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          language = "fr",
          key = "foo",
          value = "bar",
          lastModificationAt = DateTime.now().some
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          translations = Seq()
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/translations",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = translation.copy(tenant = TenantId("unkown")).asJson.some
        )(using tenant)

        resp.status mustBe 400
        getMsg(resp) mustBe "Tenant not found"
      }

      "PUT :: Not Found" in {
        val translation = Translation(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          language = "fr",
          key = "foo",
          value = "bar",
          lastModificationAt = DateTime.now().some
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          translations = Seq()
        )

        val respNotFound = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/translations/unknown",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = translation.asJson.some
        )(using tenant)

        respNotFound.status mustBe 404
      }

      "GET :: Not Found" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          translations = Seq()
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/translations/unknown",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 404
      }

      "GET :: Ok" in {
        val translation = Translation(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          language = "fr",
          key = "foo",
          value = "bar",
          lastModificationAt = DateTime.now().some
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          translations = Seq(translation)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/translations/${translation.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200
        resp.json mustBe translation.asJson
      }

      "POST :: Created" in {
        val translation = Translation(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          language = "fr",
          key = "foo",
          value = "bar",
          lastModificationAt = DateTime.now().some
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          translations = Seq()
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/translations",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = translation.asJson.some
        )(using tenant)

        resp.status mustBe 201

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/translations/${translation.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json mustBe translation.asJson
      }
      "PUT :: No Content" in {
        val translation = Translation(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          language = "fr",
          key = "foo",
          value = "bar",
          lastModificationAt = DateTime.now().some
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          translations = Seq(translation)
        )
        val updated = translation.copy(value = "foo")
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/translations/${translation.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = updated.asJson.some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/translations/${translation.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json.as(using json.TranslationFormat) mustBe updated
      }
      "PATCH :: No Content" in {
        val translation = Translation(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          language = "fr",
          key = "foo",
          value = "bar",
          lastModificationAt = DateTime.now().some
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          translations = Seq(translation)
        )
        val updated = translation.copy(value = "foo")
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/translations/${translation.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj("op" -> "replace", "path" -> "/value", "value" -> "foo")
            )
            .some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/translations/${translation.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json.as(using json.TranslationFormat) mustBe updated
      }
      "DELETE :: Ok" in {
        val translation = Translation(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          language = "fr",
          key = "foo",
          value = "bar",
          lastModificationAt = DateTime.now().some
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          translations = Seq(translation)
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/translations/${translation.id.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/translations/${translation.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 404
      }
    }

    "A call to Usage plan admin API" must {

      "POST :: Conflict :: UsagePlan already exists" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/usage-plans",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = defaultApi.plans.head.asJson.some
        )(using tenant)

        resp.status mustBe 409
      }

      "POST :: BadRequest" in {
        val plan = UsagePlan(
          id = UsagePlanId(IdGenerator.token(10)),
          tenant = tenant.id,
          costPerRequest = BigDecimal(10.0).some,
          costPerMonth = BigDecimal(0.02).some,
          billingDuration = BillingDuration(1, BillingTimeUnit.Month).some,
          trialPeriod = None,
          currency = Currency("EUR").some,
          customName = "PayPerUse",
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
          autoRotation = Some(false)
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = Seq()
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/usage-plans",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = plan.copy(tenant = TenantId("unkown")).asJson.some
        )(using tenant)

        resp.status mustBe 400
        getMsg(resp) mustBe "Tenant not found"

        val respOto = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/usage-plans",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = plan
            .copy(otoroshiTarget =
              Some(
                OtoroshiTarget(
                  OtoroshiSettingsId("unknown"),
                  Some(
                    AuthorizedEntities(
                      groups = Set(OtoroshiServiceGroupId("12345"))
                    )
                  )
                )
              )
            )
            .asJson
            .some
        )(using tenant)

        respOto.status mustBe 400
        getMsg(respOto) mustBe "Otoroshi setting not found"

        val respPayment = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/usage-plans",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = plan
            .copy(paymentSettings =
              PaymentSettings
                .Stripe(
                  thirdPartyPaymentSettingsId =
                    ThirdPartyPaymentSettingsId("unknown"),
                  productId = "1234",
                  priceIds = StripePriceIds(
                    basePriceId = "1234",
                    additionalPriceId = None
                  )
                )
                .some
            )
            .asJson
            .some
        )(using tenant)

        respPayment.status mustBe 400
        getMsg(respPayment) mustBe "Payment setting not found"
      }

      "PUT :: Not Found" in {
        val plan = UsagePlan(
          id = UsagePlanId(IdGenerator.token(10)),
          tenant = tenant.id,
          costPerRequest = BigDecimal(10.0).some,
          costPerMonth = BigDecimal(0.02).some,
          billingDuration = BillingDuration(1, BillingTimeUnit.Month).some,
          trialPeriod = None,
          currency = Currency("EUR").some,
          customName = "PayPerUse",
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
          autoRotation = Some(false)
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = Seq()
        )

        val respNotFound = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/usage-plans/unknown",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = plan.asJson.some
        )(using tenant)

        respNotFound.status mustBe 404
      }

      "GET :: Not Found" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = Seq()
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/usage-plans/unknown",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 404
      }

      "GET :: Ok" in {
        val plan = UsagePlan(
          id = UsagePlanId(IdGenerator.token(10)),
          tenant = tenant.id,
          costPerRequest = BigDecimal(10.0).some,
          costPerMonth = BigDecimal(0.02).some,
          billingDuration = BillingDuration(1, BillingTimeUnit.Month).some,
          trialPeriod = None,
          currency = Currency("EUR").some,
          customName = "PayPerUse",
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
          autoRotation = Some(false)
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = Seq(plan)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/usage-plans/${plan.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200
        resp.json.as[JsObject] - "testing" - "swagger" mustBe plan.asJson
          .as[JsObject] - "testing" - "swagger"
      }

      "POST :: Created" in {
        val plan = UsagePlan(
          id = UsagePlanId(IdGenerator.token(10)),
          tenant = tenant.id,
          costPerRequest = BigDecimal(10.0).some,
          costPerMonth = BigDecimal(0.02).some,
          billingDuration = BillingDuration(1, BillingTimeUnit.Month).some,
          trialPeriod = None,
          currency = Currency("EUR").some,
          customName = "PayPerUse",
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
          autoRotation = Some(false)
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = Seq()
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/usage-plans",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = plan.asJson.some
        )(using tenant)

        resp.status mustBe 201

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/usage-plans/${plan.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json.as[JsObject] - "testing" - "swagger" mustBe plan.asJson
          .as[JsObject] - "testing" - "swagger"
      }
      "PUT :: No Content" in {
        val plan = UsagePlan(
          id = UsagePlanId(IdGenerator.token(10)),
          tenant = tenant.id,
          costPerRequest = BigDecimal(10.0).some,
          costPerMonth = BigDecimal(0.02).some,
          billingDuration = BillingDuration(1, BillingTimeUnit.Month).some,
          trialPeriod = None,
          currency = Currency("EUR").some,
          customName = "PayPerUse",
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
          autoRotation = Some(false)
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = Seq(plan)
        )
        val updated = plan.copy(costPerMonth = BigDecimal(13).some)
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/usage-plans/${plan.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = updated.asJson.some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/usage-plans/${plan.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json.as[JsObject] - "testing" - "swagger" mustBe updated.asJson
          .as[JsObject] - "testing" - "swagger"
      }
      "PATCH :: No Content" in {
        val plan = UsagePlan(
          id = UsagePlanId(IdGenerator.token(10)),
          tenant = tenant.id,
          costPerRequest = BigDecimal(10.0).some,
          costPerMonth = BigDecimal(0.02).some,
          billingDuration = BillingDuration(1, BillingTimeUnit.Month).some,
          trialPeriod = None,
          currency = Currency("EUR").some,
          customName = "PayPerUse",
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
          autoRotation = Some(false)
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = Seq(plan)
        )
        val updated = plan.copy(costPerMonth = BigDecimal(13).some)
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/usage-plans/${plan.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/costPerMonth",
                "value" -> 13
              )
            )
            .some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/usage-plans/${plan.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json.as[JsObject] - "testing" - "swagger" mustBe updated.asJson
          .as[JsObject] - "testing" - "swagger"
      }
      "DELETE :: Ok" in {
        val plan = defaultApi.plans.head

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(tenantAdmin),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/usage-plans/${plan.id.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/usage-plans/${plan.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        (verif.json \ "_deleted").as[Boolean] mustBe true
      }
    }

    "A call to Subscription admin API" must {

      "POST :: Conflict :: UsagePlan already exists" in {
        val demand = SubscriptionDemand(
          id = DemandId(IdGenerator.token(10)),
          tenant = tenant.id,
          api = defaultApi.api.id,
          plan = UsagePlanId("5"),
          steps = Seq(
            SubscriptionDemandStep(
              id = SubscriptionDemandStepId(IdGenerator.token(10)),
              state = SubscriptionDemandState.Waiting,
              step = ValidationStep.TeamAdmin(
                id = IdGenerator.token(10),
                team = teamOwner.id
              )
            )
          ),
          state = SubscriptionDemandState.Waiting,
          team = teamConsumerId,
          from = user.id,
          date = DateTime.now()
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          subscriptionDemands = Seq(demand)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscription-demands",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = demand.asJson.some
        )(using tenant)

        resp.status mustBe 409
      }

      "POST :: BadRequest" in {
        val demand = SubscriptionDemand(
          id = DemandId(IdGenerator.token(10)),
          tenant = tenant.id,
          api = defaultApi.api.id,
          plan = UsagePlanId("5"),
          steps = Seq(
            SubscriptionDemandStep(
              id = SubscriptionDemandStepId(IdGenerator.token(10)),
              state = SubscriptionDemandState.Waiting,
              step = ValidationStep.TeamAdmin(
                id = IdGenerator.token(10),
                team = teamOwner.id
              )
            )
          ),
          state = SubscriptionDemandState.Waiting,
          team = teamConsumerId,
          from = user.id,
          date = DateTime.now()
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          teams = Seq(teamConsumer),
          usagePlans = defaultApi.plans,
          subscriptionDemands = Seq()
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscription-demands",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = demand.copy(tenant = TenantId("unkown")).asJson.some
        )(using tenant)

        resp.status mustBe 400
        getMsg(resp) mustBe "Tenant not found"

        val respApi = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscription-demands",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = demand.copy(api = ApiId("unkown")).asJson.some
        )(using tenant)

        respApi.status mustBe 400
        getMsg(respApi) mustBe "Api not found"

        val respPlan = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscription-demands",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = demand.copy(plan = UsagePlanId("unkown")).asJson.some
        )(using tenant)

        respPlan.status mustBe 400
        getMsg(respPlan) mustBe "Plan not found"

        val respTeam = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscription-demands",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = demand.copy(team = TeamId("unkown")).asJson.some
        )(using tenant)

        respTeam.status mustBe 400
        getMsg(respTeam) mustBe "Team not found"

        val respFrom = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscription-demands",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = demand.copy(from = UserId("unkown")).asJson.some
        )(using tenant)

        respFrom.status mustBe 400
        getMsg(respFrom) mustBe "From not found"
      }

      "PUT :: Not Found" in {
        val demand = SubscriptionDemand(
          id = DemandId(IdGenerator.token(10)),
          tenant = tenant.id,
          api = defaultApi.api.id,
          plan = UsagePlanId("5"),
          steps = Seq(
            SubscriptionDemandStep(
              id = SubscriptionDemandStepId(IdGenerator.token(10)),
              state = SubscriptionDemandState.Waiting,
              step = ValidationStep.TeamAdmin(
                id = IdGenerator.token(10),
                team = teamOwner.id
              )
            )
          ),
          state = SubscriptionDemandState.Waiting,
          team = teamConsumerId,
          from = user.id,
          date = DateTime.now()
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          subscriptionDemands = Seq(demand)
        )

        val respNotFound = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions-demands/unknown",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = demand.asJson.some
        )(using tenant)

        respNotFound.status mustBe 404
      }

      "GET :: Not Found" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          subscriptionDemands = Seq()
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/usage-plans/unknown",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 404
      }

      "GET :: Ok" in {
        val demand = SubscriptionDemand(
          id = DemandId(IdGenerator.token(10)),
          tenant = tenant.id,
          api = defaultApi.api.id,
          plan = UsagePlanId("5"),
          steps = Seq(
            SubscriptionDemandStep(
              id = SubscriptionDemandStepId(IdGenerator.token(10)),
              state = SubscriptionDemandState.Waiting,
              step = ValidationStep.TeamAdmin(
                id = IdGenerator.token(10),
                team = teamOwner.id
              )
            )
          ),
          state = SubscriptionDemandState.Waiting,
          team = teamConsumerId,
          from = user.id,
          date = DateTime.now()
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          subscriptionDemands = Seq(demand)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscription-demands/${demand.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200
        resp.json mustBe demand.asJson
      }

      "POST :: Created" in {
        val demand = SubscriptionDemand(
          id = DemandId(IdGenerator.token(10)),
          tenant = tenant.id,
          api = defaultApi.api.id,
          plan = UsagePlanId("5"),
          steps = Seq(
            SubscriptionDemandStep(
              id = SubscriptionDemandStepId(IdGenerator.token(10)),
              state = SubscriptionDemandState.Waiting,
              step = ValidationStep.TeamAdmin(
                id = IdGenerator.token(10),
                team = teamOwner.id
              )
            )
          ),
          state = SubscriptionDemandState.Waiting,
          team = teamConsumerId,
          from = user.id,
          date = DateTime.now()
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          teams = Seq(teamConsumer),
          subscriptionDemands = Seq(),
          users = Seq(user)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscription-demands",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = demand.asJson.some
        )(using tenant)

        resp.status mustBe 201

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscription-demands/${demand.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json mustBe demand.asJson
      }
      "PUT :: No Content" in {
        val demand = SubscriptionDemand(
          id = DemandId(IdGenerator.token(10)),
          tenant = tenant.id,
          api = defaultApi.api.id,
          plan = UsagePlanId("5"),
          steps = Seq(
            SubscriptionDemandStep(
              id = SubscriptionDemandStepId(IdGenerator.token(10)),
              state = SubscriptionDemandState.Waiting,
              step = ValidationStep.TeamAdmin(
                id = IdGenerator.token(10),
                team = teamOwner.id
              )
            )
          ),
          state = SubscriptionDemandState.Waiting,
          team = teamConsumerId,
          from = user.id,
          date = DateTime.now()
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          teams = Seq(teamConsumer),
          subscriptionDemands = Seq(demand),
          users = Seq(user)
        )

        val updated = demand.copy(state = SubscriptionDemandState.InProgress)
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscription-demands/${demand.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = updated.asJson.some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscription-demands/${demand.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json mustBe updated.asJson
      }
      "PATCH :: No Content" in {
        val demand = SubscriptionDemand(
          id = DemandId(IdGenerator.token(10)),
          tenant = tenant.id,
          api = defaultApi.api.id,
          plan = UsagePlanId("5"),
          steps = Seq(
            SubscriptionDemandStep(
              id = SubscriptionDemandStepId(IdGenerator.token(10)),
              state = SubscriptionDemandState.Waiting,
              step = ValidationStep.TeamAdmin(
                id = IdGenerator.token(10),
                team = teamOwner.id
              )
            )
          ),
          state = SubscriptionDemandState.Waiting,
          team = teamConsumerId,
          from = user.id,
          date = DateTime.now()
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          teams = Seq(teamConsumer),
          subscriptionDemands = Seq(demand),
          users = Seq(user)
        )
        val updated = demand.copy(state = SubscriptionDemandState.InProgress)
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscription-demands/${demand.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json
            .arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/state",
                "value" -> SubscriptionDemandState.InProgress.name
              )
            )
            .some
        )(using tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscription-demands/${demand.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 200
        verif.json mustBe updated.asJson
      }
      "DELETE :: Ok" in {
        val demand = SubscriptionDemand(
          id = DemandId(IdGenerator.token(10)),
          tenant = tenant.id,
          api = defaultApi.api.id,
          plan = UsagePlanId("5"),
          steps = Seq(
            SubscriptionDemandStep(
              id = SubscriptionDemandStepId(IdGenerator.token(10)),
              state = SubscriptionDemandState.Waiting,
              step = ValidationStep.TeamAdmin(
                id = IdGenerator.token(10),
                team = teamOwner.id
              )
            )
          ),
          state = SubscriptionDemandState.Waiting,
          team = teamConsumerId,
          from = user.id,
          date = DateTime.now()
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          subscriptionDemands = Seq(demand)
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscription-demands/${demand.id.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        resp.status mustBe 200

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscription-demands/${demand.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verif.status mustBe 404
      }

      "DELETE :: cleans up step validators and notifications" in {
        val demandId = DemandId(IdGenerator.token(10))
        val stepId = SubscriptionDemandStepId(IdGenerator.token(10))
        val demand = SubscriptionDemand(
          id = demandId,
          tenant = tenant.id,
          api = defaultApi.api.id,
          plan = defaultApi.plans.head.id,
          steps = Seq(
            SubscriptionDemandStep(
              id = stepId,
              state = SubscriptionDemandState.Waiting,
              step = ValidationStep
                .TeamAdmin(id = IdGenerator.token(10), team = teamOwner.id)
            )
          ),
          state = SubscriptionDemandState.Waiting,
          team = teamConsumerId,
          from = user.id,
          date = DateTime.now()
        )
        val stepValidator = StepValidator(
          id = DatastoreId(IdGenerator.token(10)),
          tenant = tenant.id,
          token = IdGenerator.token(32),
          step = stepId,
          subscriptionDemand = demandId
        )
        val demandNotif = Notification(
          id = NotificationId("notif-demand"),
          tenant = tenant.id,
          team = None,
          sender = userAdmin.asNotificationSender,
          action = NotificationAction.ApiSubscriptionDemand(
            api = defaultApi.api.id,
            plan = defaultApi.plans.head.id,
            team = teamConsumerId,
            demand = demandId,
            step = stepId,
            motivation = None
          )
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(userAdmin),
          subscriptions = Seq(adminApiSubscription),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          subscriptionDemands = Seq(demand),
          notifications = Seq(demandNotif)
        )
        Await.result(
          daikokuComponents.env.dataStore.stepValidatorRepo
            .forTenant(tenant)
            .save(stepValidator),
          5.seconds
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscription-demands/${demandId.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)
        resp.status mustBe 200

        // demand is deleted
        Await.result(
          daikokuComponents.env.dataStore.subscriptionDemandRepo
            .forTenant(tenant)
            .findById(demandId),
          5.seconds
        ) mustBe None

        // step validator is deleted
        Await.result(
          daikokuComponents.env.dataStore.stepValidatorRepo
            .forTenant(tenant)
            .findById(stepValidator.id),
          5.seconds
        ) mustBe None

        // action.demand notification is deleted
        Await.result(
          daikokuComponents.env.dataStore.notificationRepo
            .forTenant(tenant)
            .findById(demandNotif.id),
          5.seconds
        ) mustBe None
      }
    }

    "complete deletion of used item (admin API)" must {

      def operationsPending() =
        Await.result(
          daikokuComponents.env.dataStore.operationRepo
            .forTenant(tenant)
            .find(
              Json.obj(
                "status" -> Json.obj(
                  "$in" -> JsArray(
                    Seq(
                      JsString(OperationStatus.Idle.name),
                      JsString(OperationStatus.InProgress.name)
                    )
                  )
                )
              )
            ),
          5.seconds
        )

      "be completed by team deletion" in {
        val userPersonalTeam = Team(
          id = TeamId("user-team"),
          tenant = tenant.id,
          `type` = TeamType.Personal,
          name = "user team personal",
          description = "",
          contact = user.email,
          users = Set(UserWithPermission(user.id, TeamPermission.Administrator))
        )

        val personalSubscription = ApiSubscription(
          id = ApiSubscriptionId("1"),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = defaultApi.plans.head.id,
          createdAt = DateTime.now(),
          team = userPersonalTeam.id,
          api = defaultApi.api.id,
          by = user.id,
          customName = Some("custom name"),
          rotation = None,
          integrationToken = "test"
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
              step = ValidationStep
                .TeamAdmin(id = IdGenerator.token(10), team = teamOwner.id)
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
          tenants = Seq(tenant),
          users = Seq(tenantAdmin, userAdmin, user),
          teams =
            Seq(defaultAdminTeam, teamOwner, teamConsumer, userPersonalTeam),
          usagePlans = defaultApi.plans,
          apis = Seq(
            defaultApi.api.copy(
              posts = Seq(post.id),
              issues = Seq(issue.id),
              documentation = ApiDocumentation(
                id = ApiDocumentationId(IdGenerator.token(10)),
                tenant = tenant.id,
                pages = Seq(
                  ApiDocumentationDetailPage(page.id, page.title, Seq.empty)
                ),
                lastModificationAt = DateTime.now
              )
            )
          ),
          pages = Seq(page),
          posts = Seq(post),
          issues = Seq(issue),
          subscriptions = Seq(adminApiSubscription, personalSubscription),
          subscriptionDemands = Seq(subscriptionDemand),
          notifications = Seq(subDemandNotif)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams/${teamOwnerId.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)
        resp.status mustBe 200
        (resp.json \ "done").as[Boolean] mustBe true

        org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
          operationsPending().nonEmpty
        }
        org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
          operationsPending().isEmpty
        }

        val _maybeSubscription = Await.result(
          daikokuComponents.env.dataStore.apiSubscriptionRepo
            .forTenant(tenant)
            .findById(personalSubscription.id),
          5.seconds
        )
        _maybeSubscription.isDefined mustBe true
        _maybeSubscription.forall(_.deleted) mustBe true

        val _maybePlans = Await.result(
          daikokuComponents.env.dataStore.usagePlanRepo
            .forTenant(tenant)
            .findNotDeleted(
              Json.obj(
                "_id" -> Json
                  .obj("$in" -> JsArray(defaultApi.plans.map(_.id.asJson)))
              )
            ),
          5.seconds
        )
        _maybePlans.isEmpty mustBe true

        val _maybeDocs = Await.result(
          daikokuComponents.env.dataStore.apiDocumentationPageRepo
            .forTenant(tenant)
            .findByIdNotDeleted(page.id),
          5.seconds
        )
        _maybeDocs.isEmpty mustBe true

        val _maybePosts = Await.result(
          daikokuComponents.env.dataStore.apiPostRepo
            .forTenant(tenant)
            .findByIdNotDeleted(post.id),
          5.seconds
        )
        _maybePosts.isEmpty mustBe true

        val _maybeIssue = Await.result(
          daikokuComponents.env.dataStore.apiIssueRepo
            .forTenant(tenant)
            .findByIdNotDeleted(issue.id),
          5.seconds
        )
        _maybeIssue.isEmpty mustBe true

        Await.result(
          daikokuComponents.env.dataStore.notificationRepo
            .forAllTenant()
            .findByIdNotDeleted(subDemandNotif.id),
          5.seconds
        ) mustBe None

        Await.result(
          daikokuComponents.env.dataStore.subscriptionDemandRepo
            .forAllTenant()
            .findById(subscriptionDemand.id),
          5.seconds
        ) mustBe None
      }

      "be completed by delete user" in {
        val userPersonalTeam = Team(
          id = TeamId("user-team"),
          tenant = tenant.id,
          `type` = TeamType.Personal,
          name = "user team personal",
          description = "",
          contact = user.email,
          users = Set(UserWithPermission(user.id, TeamPermission.Administrator))
        )

        val personalSubscription = ApiSubscription(
          id = ApiSubscriptionId("1"),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = defaultApi.plans.head.id,
          createdAt = DateTime.now(),
          team = userPersonalTeam.id,
          api = defaultApi.api.id,
          by = user.id,
          customName = Some("custom name"),
          rotation = None,
          integrationToken = "test"
        )

        val teamInvitationNotif = Notification(
          id = NotificationId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = None,
          sender = userAdmin.asNotificationSender,
          action = NotificationAction.TeamInvitation(
            team = teamOwnerId,
            user = user.id
          )
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
              step = ValidationStep
                .TeamAdmin(id = IdGenerator.token(10), team = teamOwner.id)
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
          tenants = Seq(tenant),
          users =
            Seq(tenantAdmin, daikokuAdmin, userAdmin, user, userApiEditor),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          subscriptions = Seq(adminApiSubscription, personalSubscription),
          subscriptionDemands = Seq(subscriptionDemand),
          notifications = Seq(subDemandNotif, teamInvitationNotif),
          teams = Seq(
            defaultAdminTeam,
            userPersonalTeam,
            teamConsumer,
            teamOwner.copy(users =
              Set(UserWithPermission(userTeamAdminId, Administrator))
            )
          )
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${userTeamUserId.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)
        resp.status mustBe 200
        (resp.json \ "done").as[Boolean] mustBe true

        val verifUser = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${userTeamUserId.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)
        verifUser.status mustBe 200
        (verifUser.json \ "_deleted").as[Boolean] mustBe true

        val _maybeSubscription = Await.result(
          daikokuComponents.env.dataStore.apiSubscriptionRepo
            .forAllTenant()
            .findById(personalSubscription.id),
          5.seconds
        )
        _maybeSubscription.isDefined mustBe true
        _maybeSubscription.forall(_.deleted) mustBe true

        val notifInvitation = Await.result(
          daikokuComponents.env.dataStore.notificationRepo
            .forAllTenant()
            .findById(teamInvitationNotif.id),
          5.seconds
        )
        notifInvitation mustBe None

        val notifDemand = Await.result(
          daikokuComponents.env.dataStore.notificationRepo
            .forAllTenant()
            .findById(subDemandNotif.id),
          5.seconds
        )
        notifDemand mustBe None

        Await.result(
          daikokuComponents.env.dataStore.subscriptionDemandRepo
            .forAllTenant()
            .findById(subscriptionDemand.id),
          5.seconds
        ) mustBe None
      }

      "be completed by delete an api" in {
        val userPersonalTeam = Team(
          id = TeamId("user-team"),
          tenant = tenant.id,
          `type` = TeamType.Personal,
          name = "user team personal",
          description = "",
          contact = user.email,
          users = Set(UserWithPermission(user.id, TeamPermission.Administrator))
        )

        val personalSubscription = ApiSubscription(
          id = ApiSubscriptionId("1"),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = defaultApi.plans.head.id,
          createdAt = DateTime.now(),
          team = userPersonalTeam.id,
          api = defaultApi.api.id,
          by = user.id,
          customName = Some("custom name"),
          rotation = None,
          integrationToken = "test"
        )

        val subscriptionDemand = SubscriptionDemand(
          id = DemandId("test"),
          tenant = tenant.id,
          api = defaultApi.api.id,
          plan = defaultApi.plans.reverse.head.id,
          steps = Seq(
            SubscriptionDemandStep(
              id = SubscriptionDemandStepId("admin"),
              state = SubscriptionDemandState.Waiting,
              step = ValidationStep
                .TeamAdmin(id = IdGenerator.token(10), team = teamOwner.id)
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
          tenants = Seq(tenant),
          users = Seq(tenantAdmin, userAdmin, user),
          teams =
            Seq(defaultAdminTeam, teamOwner, teamConsumer, userPersonalTeam),
          usagePlans = defaultApi.plans,
          apis = Seq(
            defaultApi.api.copy(
              posts = Seq(post.id),
              issues = Seq(issue.id),
              documentation = ApiDocumentation(
                id = ApiDocumentationId(IdGenerator.token(10)),
                tenant = tenant.id,
                pages = Seq(
                  ApiDocumentationDetailPage(page.id, page.title, Seq.empty)
                ),
                lastModificationAt = DateTime.now
              )
            )
          ),
          pages = Seq(page),
          posts = Seq(post),
          issues = Seq(issue),
          subscriptions = Seq(adminApiSubscription, personalSubscription),
          subscriptionDemands = Seq(subscriptionDemand),
          notifications = Seq(subDemandNotif)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis/${defaultApi.api.id.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)
        resp.status mustBe 200
        (resp.json \ "done").as[Boolean] mustBe true

        org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
          operationsPending().nonEmpty
        }
        org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
          operationsPending().isEmpty
        }

        val verifApi = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/apis/${defaultApi.api.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)

        verifApi.status mustBe 200
        (verifApi.json \ "_deleted").as[Boolean] mustBe true

        val _maybeSubscription = Await.result(
          daikokuComponents.env.dataStore.apiSubscriptionRepo
            .forTenant(tenant)
            .findById(personalSubscription.id),
          5.seconds
        )
        _maybeSubscription.isDefined mustBe true
        _maybeSubscription.forall(_.deleted) mustBe true

        val _maybePlans = Await.result(
          daikokuComponents.env.dataStore.usagePlanRepo
            .forTenant(tenant)
            .findNotDeleted(
              Json.obj(
                "_id" -> Json
                  .obj("$in" -> JsArray(defaultApi.plans.map(_.id.asJson)))
              )
            ),
          5.seconds
        )
        _maybePlans.isEmpty mustBe true

        Await
          .result(
            daikokuComponents.env.dataStore.apiDocumentationPageRepo
              .forTenant(tenant)
              .findByIdNotDeleted(page.id),
            5.seconds
          )
          .isEmpty mustBe true

        Await
          .result(
            daikokuComponents.env.dataStore.apiPostRepo
              .forTenant(tenant)
              .findByIdNotDeleted(post.id),
            5.seconds
          )
          .isEmpty mustBe true

        Await
          .result(
            daikokuComponents.env.dataStore.apiIssueRepo
              .forTenant(tenant)
              .findByIdNotDeleted(issue.id),
            5.seconds
          )
          .isEmpty mustBe true

        Await.result(
          daikokuComponents.env.dataStore.notificationRepo
            .forAllTenant()
            .findByIdNotDeleted(subDemandNotif.id),
          5.seconds
        ) mustBe None

        Await.result(
          daikokuComponents.env.dataStore.subscriptionDemandRepo
            .forAllTenant()
            .findById(subscriptionDemand.id),
          5.seconds
        ) mustBe None
      }

      "be completed by delete a plan" in {
        val userPersonalTeam = Team(
          id = TeamId("user-team"),
          tenant = tenant.id,
          `type` = TeamType.Personal,
          name = "user team personal",
          description = "",
          contact = user.email,
          users = Set(UserWithPermission(user.id, TeamPermission.Administrator))
        )

        val subscribedPlan = defaultApi.plans.head
        val personalSubscription = ApiSubscription(
          id = ApiSubscriptionId("1"),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = subscribedPlan.id,
          createdAt = DateTime.now(),
          team = userPersonalTeam.id,
          api = defaultApi.api.id,
          by = user.id,
          customName = Some("custom name"),
          rotation = None,
          integrationToken = "test"
        )

        val subscriptionDemand = SubscriptionDemand(
          id = DemandId("test"),
          tenant = tenant.id,
          api = defaultApi.api.id,
          plan = subscribedPlan.id,
          steps = Seq(
            SubscriptionDemandStep(
              id = SubscriptionDemandStepId("admin"),
              state = SubscriptionDemandState.Waiting,
              step = ValidationStep
                .TeamAdmin(id = IdGenerator.token(10), team = teamOwner.id)
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
            plan = subscribedPlan.id,
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

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(tenantAdmin, userAdmin, user),
          teams =
            Seq(defaultAdminTeam, teamOwner, teamConsumer, userPersonalTeam),
          usagePlans = defaultApi.plans.map(
            _.copy(
              documentation = ApiDocumentation(
                id = ApiDocumentationId(IdGenerator.token(10)),
                tenant = tenant.id,
                pages = Seq(
                  ApiDocumentationDetailPage(page.id, page.title, Seq.empty)
                ),
                lastModificationAt = DateTime.now
              ).some
            )
          ),
          apis = Seq(defaultApi.api),
          pages = Seq(page),
          subscriptions = Seq(adminApiSubscription, personalSubscription),
          subscriptionDemands = Seq(subscriptionDemand),
          notifications = Seq(subDemandNotif)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/usage-plans/${subscribedPlan.id.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)
        resp.status mustBe 200
        (resp.json \ "done").as[Boolean] mustBe true

        val verifPlan = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/usage-plans/${subscribedPlan.id.value}",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)
        verifPlan.status mustBe 200
        (verifPlan.json \ "_deleted").as[Boolean] mustBe true

        org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
          operationsPending().nonEmpty
        }
        org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
          operationsPending().isEmpty
        }

        val _maybeSubscription = Await.result(
          daikokuComponents.env.dataStore.apiSubscriptionRepo
            .forTenant(tenant)
            .findById(personalSubscription.id),
          5.seconds
        )
        _maybeSubscription.isDefined mustBe true
        _maybeSubscription.forall(_.deleted) mustBe true

        val _maybePlans = Await.result(
          daikokuComponents.env.dataStore.usagePlanRepo
            .forTenant(tenant)
            .findNotDeleted(
              Json.obj(
                "_id" -> Json
                  .obj("$in" -> JsArray(defaultApi.plans.map(_.id.asJson)))
              )
            ),
          5.seconds
        )
        _maybePlans.nonEmpty mustBe true
        _maybePlans.size mustBe (defaultApi.plans.size - 1)

        Await
          .result(
            daikokuComponents.env.dataStore.apiDocumentationPageRepo
              .forTenant(tenant)
              .findByIdNotDeleted(page.id),
            5.seconds
          )
          .isEmpty mustBe true

        Await.result(
          daikokuComponents.env.dataStore.notificationRepo
            .forAllTenant()
            .findByIdNotDeleted(subDemandNotif.id),
          5.seconds
        ) mustBe None

        Await.result(
          daikokuComponents.env.dataStore.subscriptionDemandRepo
            .forAllTenant()
            .findById(subscriptionDemand.id),
          5.seconds
        ) mustBe None
      }

      "delete a standalone subscription" in {
        val plan = UsagePlan(
          id = UsagePlanId("standalone-plan"),
          tenant = tenant.id,
          customName = "standalone plan",
          allowMultipleKeys = Some(false),
          subscriptionProcess = Seq.empty,
          integrationProcess = IntegrationProcess.ApiKey,
          autoRotation = Some(false)
        )
        val api = defaultApi.api.copy(
          id = ApiId("standalone-api"),
          team = teamOwnerId,
          possibleUsagePlans = Seq(plan.id),
          defaultUsagePlan = plan.id.some
        )
        val sub = ApiSubscription(
          id = ApiSubscriptionId("standalone-sub"),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = plan.id,
          createdAt = DateTime.now(),
          team = teamConsumerId,
          api = api.id,
          by = user.id,
          customName = None,
          rotation = None,
          integrationToken = "standalone-token"
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(tenantAdmin, userAdmin, user),
          teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
          usagePlans = Seq(plan),
          apis = Seq(api),
          subscriptions = Seq(adminApiSubscription, sub)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}?logically=true",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)
        resp.status mustBe 200
        (resp.json \ "done").as[Boolean] mustBe true

        val maybeSub = Await.result(
          daikokuComponents.env.dataStore.apiSubscriptionRepo
            .forTenant(tenant)
            .findById(sub.id),
          5.seconds
        )
        maybeSub.isDefined mustBe true
        maybeSub.forall(_.deleted) mustBe true
      }

      "clean up action.demand notifications when a subscription demand is cancelled" in {
        val plan = defaultApi.plans.head
        val api = defaultApi.api.copy(
          possibleUsagePlans = Seq(plan.id),
          defaultUsagePlan = plan.id.some
        )
        val sub = ApiSubscription(
          id = ApiSubscriptionId("notif-sub"),
          tenant = tenant.id,
          apiKey = OtoroshiApiKey("name", "id", "secret"),
          plan = plan.id,
          createdAt = DateTime.now(),
          team = teamConsumerId,
          api = api.id,
          by = user.id,
          customName = None,
          rotation = None,
          integrationToken = "notif-token"
        )
        val demandId = DemandId("notif-demand")
        val stepId = SubscriptionDemandStepId("notif-step")
        val demand = SubscriptionDemand(
          id = demandId,
          tenant = tenant.id,
          api = api.id,
          plan = plan.id,
          steps = Seq(
            SubscriptionDemandStep(
              id = SubscriptionDemandStepId("admin"),
              state = SubscriptionDemandState.Waiting,
              step = ValidationStep
                .TeamAdmin(id = IdGenerator.token(10), team = teamOwner.id)
            )
          ),
          state = SubscriptionDemandState.InProgress,
          team = teamConsumerId,
          from = user.id,
          motivation = None
        )

        def notif(id: String, action: NotificationAction) = Notification(
          id = NotificationId(id),
          tenant = tenant.id,
          team = None,
          sender = userAdmin.asNotificationSender,
          action = action
        )

        val allNotifs = Seq(
          notif(
            "n-api-access",
            NotificationAction.ApiAccess(api.id, teamConsumerId)
          ),
          notif(
            "n-team-invitation",
            NotificationAction.TeamInvitation(teamOwnerId, user.id)
          ),
          notif(
            "n-sub-accept",
            NotificationAction
              .ApiSubscriptionAccept(api.id, plan.id, teamConsumerId)
          ),
          notif(
            "n-sub-reject",
            NotificationAction
              .ApiSubscriptionReject(None, api.id, plan.id, teamConsumerId)
          ),
          notif(
            "n-sub-demand",
            NotificationAction.ApiSubscriptionDemand(
              api.id,
              plan.id,
              teamConsumerId,
              demandId,
              stepId,
              None,
              None
            )
          ),
          notif(
            "n-account-creation",
            NotificationAction
              .AccountCreationAttempt(demandId, stepId, "motivation")
          ),
          notif(
            "n-sub-transfer-success",
            NotificationAction.ApiSubscriptionTransferSuccess(sub.id)
          ),
          notif(
            "n-oto-sync-sub-error",
            NotificationAction.OtoroshiSyncSubscriptionError(sub, "sync error")
          ),
          notif(
            "n-oto-sync-api-error",
            NotificationAction.OtoroshiSyncApiError(api, "sync error")
          ),
          notif(
            "n-key-deletion",
            NotificationAction
              .ApiKeyDeletionInformation(api.id.value, sub.apiKey.clientId)
          ),
          notif(
            "n-key-rotation-in-progress",
            NotificationAction.ApiKeyRotationInProgress(
              sub.apiKey.clientId,
              api.id.value,
              plan.id.value
            )
          ),
          notif(
            "n-key-rotation-ended",
            NotificationAction.ApiKeyRotationEnded(
              sub.apiKey.clientId,
              api.id.value,
              plan.id.value
            )
          ),
          notif(
            "n-key-refresh",
            NotificationAction
              .ApiKeyRefresh(sub.id.value, api.id.value, plan.id.value)
          ),
          notif(
            "n-new-post",
            NotificationAction.NewPostPublished(teamOwnerId.value, api.name)
          ),
          notif(
            "n-new-issue",
            NotificationAction.NewIssueOpen(
              teamOwnerId.value,
              api.name,
              s"/apis/${api.id.value}"
            )
          ),
          notif(
            "n-new-comment",
            NotificationAction.NewCommentOnIssue(
              teamOwnerId.value,
              api.name,
              s"/apis/${api.id.value}"
            )
          ),
          notif(
            "n-key-deletion-v2",
            NotificationAction
              .ApiKeyDeletionInformationV2(api.id, sub.apiKey.clientId, sub.id)
          ),
          notif(
            "n-key-rotation-in-progress-v2",
            NotificationAction
              .ApiKeyRotationInProgressV2(sub.id, api.id, plan.id)
          ),
          notif(
            "n-key-rotation-ended-v2",
            NotificationAction.ApiKeyRotationEndedV2(sub.id, api.id, plan.id)
          ),
          notif(
            "n-key-refresh-v2",
            NotificationAction.ApiKeyRefreshV2(sub.id, api.id, plan.id)
          ),
          notif(
            "n-new-post-v2",
            NotificationAction
              .NewPostPublishedV2(api.id, ApiPostId("some-post"))
          ),
          notif(
            "n-new-issue-v2",
            NotificationAction.NewIssueOpenV2(api.id, ApiIssueId("some-issue"))
          ),
          notif(
            "n-new-comment-v2",
            NotificationAction
              .NewCommentOnIssueV2(api.id, ApiIssueId("some-issue"), user.id)
          ),
          notif(
            "n-transfer-ownership",
            NotificationAction.TransferApiOwnership(teamOwnerId, api.id)
          ),
          notif(
            "n-checkout",
            NotificationAction.CheckoutForSubscription(
              demandId,
              api.id,
              plan.id,
              stepId
            )
          )
        )

        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(tenantAdmin, userAdmin, user),
          teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
          usagePlans = Seq(plan),
          apis = Seq(api),
          subscriptions = Seq(adminApiSubscription, sub),
          subscriptionDemands = Seq(demand),
          notifications = allNotifs
        )

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscription-demands/${demandId.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription)
        )(using tenant)
        resp.status mustBe 200
        (resp.json \ "done").as[Boolean] mustBe true

        val remaining = Await
          .result(
            daikokuComponents.env.dataStore.notificationRepo
              .forTenant(tenant)
              .findNotDeleted(Json.obj()),
            5.seconds
          )
          .map(_.id.value)
          .toSet

        remaining must not contain "n-sub-demand"
        remaining must not contain "n-account-creation"
        remaining must not contain "n-checkout"

        remaining must contain("n-api-access")
        remaining must contain("n-team-invitation")
        remaining must contain("n-sub-accept")
        remaining must contain("n-sub-reject")
        remaining must contain("n-sub-transfer-success")
        remaining must contain("n-oto-sync-sub-error")
        remaining must contain("n-oto-sync-api-error")
        remaining must contain("n-key-deletion")
        remaining must contain("n-key-rotation-in-progress")
        remaining must contain("n-key-rotation-ended")
        remaining must contain("n-key-refresh")
        remaining must contain("n-new-post")
        remaining must contain("n-new-issue")
        remaining must contain("n-new-comment")
        remaining must contain("n-key-deletion-v2")
        remaining must contain("n-key-rotation-in-progress-v2")
        remaining must contain("n-key-rotation-ended-v2")
        remaining must contain("n-key-refresh-v2")
        remaining must contain("n-new-post-v2")
        remaining must contain("n-new-issue-v2")
        remaining must contain("n-new-comment-v2")
        remaining must contain("n-transfer-ownership")
      }
    }
  }
}
