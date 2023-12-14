package fr.maif.otoroshi.daikoku.tests

import cats.implicits.catsSyntaxOptionId
import fr.maif.otoroshi.daikoku.domain.{ApiSubscription, TenantId, UserId}
import fr.maif.otoroshi.daikoku.tests.utils.DaikokuSpecHelper
import org.scalatest.concurrent.IntegrationPatience
import org.scalatest.{BeforeAndAfter, BeforeAndAfterEach}
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.{JsObject, Json}

import java.util.Base64

class AdminApiControllerSpec
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfterEach
    with BeforeAndAfter {

  def getAdminApiHeader(adminApiSubscription: ApiSubscription): Map[String, String] = {
    Map("Authorization" -> s"Basic ${Base64.getEncoder.encodeToString(s"${adminApiSubscription.apiKey.clientId}:${adminApiSubscription.apiKey.clientSecret}".getBytes())}")
  }

  s"Admin API" should {
    "A call to tenant admin API" must {
      "POST :: Conflict" in {
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
          )(tenant)

        resp.status mustBe 409

      }

      "PUT :: Conflict" in {
        setupEnvBlocking(
          tenants = Seq(tenant, tenant.copy(id = TenantId("test"), domain = "https://daikoku.io")),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val respConflict = httpJsonCallWithoutSessionBlocking(
            path = s"/admin-api/tenants/${tenant.id.value}",
            method = "PUT",
            headers = getAdminApiHeader(adminApiSubscription),
            body = tenant.copy(domain = "https://daikoku.io").asJson.some
          )(tenant)

        respConflict.status mustBe 409
      }

      "PUT :: Not Found" in {
        setupEnvBlocking(
          tenants = Seq(tenant, tenant.copy(id = TenantId("test"), domain = "https://daikoku.io")),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val respNotFound = httpJsonCallWithoutSessionBlocking(
            path = s"/admin-api/tenants/unknown",
            method = "PUT",
            headers = getAdminApiHeader(adminApiSubscription),
            body = tenant.copy(domain = "https://daikoku.io").asJson.some
          )(tenant)

        respNotFound.status mustBe 404
      }

      "PATCH :: Conflict" in {
        setupEnvBlocking(
          tenants = Seq(tenant, tenant.copy(id = TenantId("test"), domain = "https://daikoku.io")),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
            path = s"/admin-api/tenants/${tenant.id.value}",
            method = "PATCH",
            headers = getAdminApiHeader(adminApiSubscription),
            body = Json.arr(Json.obj("op" -> "replace", "path" -> "/domain", "value"-> "https://daikoku.io")).some
          )(tenant)

        resp.status mustBe 409

      }

      "GET :: Not Found" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )

        val resp = httpJsonCallWithoutSessionBlocking(
            path = s"/admin-api/tenants/unknown",
            headers = getAdminApiHeader(adminApiSubscription),
          )(tenant)

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
            headers = getAdminApiHeader(adminApiSubscription),
          )(tenant)

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
          )(tenant)

        resp.status mustBe 201

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/tenants/${id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

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
        )(tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/tenants/${tenant.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

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
          body = Json.arr(Json.obj("op" -> "replace", "path" -> "/name", "value"-> name)).some
        )(tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/tenants/${tenant.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

        verif.status mustBe 200
        (verif.json.as[JsObject] \ "name").as[String] mustBe name
      }
      "DELETE :: works" in {
        val id = TenantId("delete")
        setupEnvBlocking(
          tenants = Seq(tenant, tenant.copy(id = id, domain = "http://daikoku.io")),
          teams = Seq(defaultAdminTeam),
          subscriptions = Seq(adminApiSubscription)
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/tenants/${id.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

        resp.status mustBe 200

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/tenants/${id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

        verif.status mustBe 404
      }
    }

    "A call to user admin API" must {
      "POST :: Conflict" in {
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
        )(tenant)

        resp.status mustBe 409

      }

      "PUT :: Conflict" in {
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
        )(tenant)

        respConflict.status mustBe 409
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
        )(tenant)

        respNotFound.status mustBe 404
      }

      "PATCH :: Conflict" in {
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
          body = Json.arr(Json.obj("op" -> "replace", "path" -> "/email", "value" -> userAdmin.email)).some
        )(tenant)

        resp.status mustBe 409

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
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

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
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

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
        )(tenant)

        resp.status mustBe 201

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

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
        )(tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

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
          body = Json.arr(Json.obj("op" -> "replace", "path" -> "/name", "value" -> name)).some
        )(tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

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
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

        resp.status mustBe 200

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/users/${user.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

        verif.status mustBe 404
      }
    }


    "a call to team admin API" must {

    }
    "a call to api admin API" must {

    }
    "a call to api subscription admin API" must {

    }
    "a call to api documentation admin API" must {

    }
    "a call to notification admin API" must {

    }
    "a call to user session admin API" must {

    }
    "a call to apikey consumption admin API" must {

    }
    "a call to audit event admin API" must {

    }
    "a call to message admin API" must {

    }
    "a call to issue admin API" must {

    }
    "a call to post admin API" must {

    }
    "a call to CMS pages admin API" must {

    }
    "a call to translation admin API" must {

    }
    "a call to usage plan admin API" must {

    }
    "a call to subscription demand admin API" must {

    }
  }
}
