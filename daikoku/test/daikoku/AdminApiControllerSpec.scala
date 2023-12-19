package fr.maif.otoroshi.daikoku.tests

import cats.implicits.catsSyntaxOptionId
import fr.maif.otoroshi.daikoku.domain.{ApiDocumentationPage, ApiDocumentationPageId, ApiId, ApiKeyBilling, ApiKeyConsumption, ApiKeyConsumptionState, ApiKeyGlobalConsumptionInformations, ApiKeyQuotas, ApiSubscription, ApiSubscriptionId, DatastoreId, Notification, NotificationAction, NotificationId, OtoroshiApiKey, TeamId, TeamPermission, TenantId, UsagePlanId, UserId, UserSession, UserSessionId, UserWithPermission, json}
import fr.maif.otoroshi.daikoku.tests.utils.DaikokuSpecHelper
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import org.joda.time.DateTime
import org.scalatest.concurrent.IntegrationPatience
import org.scalatest.{BeforeAndAfter, BeforeAndAfterEach}
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.{JsObject, Json}
import play.api.libs.ws.WSResponse

import java.util.Base64
import scala.concurrent.duration.DurationInt

class AdminApiControllerSpec
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfterEach
    with BeforeAndAfter {


  def getMsg(resp: WSResponse): String = (resp.json \ "msg").as[String]

  def getAdminApiHeader(adminApiSubscription: ApiSubscription): Map[String, String] = {
    Map("Authorization" -> s"Basic ${Base64.getEncoder.encodeToString(s"${adminApiSubscription.apiKey.clientId}:${adminApiSubscription.apiKey.clientSecret}".getBytes())}")
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
          )(tenant)

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
          )(tenant)

        resp.status mustBe 400
      }

      "PUT :: Conflict :: Domain already used" in {
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

        respConflict.status mustBe 400
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

      "PATCH :: Bad Request :: Domain already used" in {
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
        )(tenant)

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
        )(tenant)

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
        )(tenant)

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
        )(tenant)

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
          body = Json.arr(Json.obj("op" -> "replace", "path" -> "/email", "value" -> userAdmin.email)).some
        )(tenant)

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
        )(tenant)

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
        )(tenant)

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
          body = teamOwner.copy(users = Set(UserWithPermission(UserId("toto"), TeamPermission.Administrator))).asJson.some
        )(tenant)

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
        )(tenant)

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
          body = teamOwner.copy(users = Set(UserWithPermission(UserId("toto"), TeamPermission.Administrator))).asJson.some
        )(tenant)

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
        )(tenant)

        respNotFound.status mustBe 404
      }

      "PATCH :: BadRequest :: User NotFound" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user, userAdmin),
          teams = Seq(defaultAdminTeam, teamOwner),
          subscriptions = Seq(adminApiSubscription)
        )

        val newUsers = json.SetUserWithPermissionFormat.writes(Set(UserWithPermission(UserId("notFound"), TeamPermission.Administrator)))

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams/${teamOwner.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json.arr(Json.obj("op" -> "replace", "path" -> "/users", "value" -> newUsers)).some
        )(tenant)

        logger.warn(Json.stringify(resp.json))
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
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

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
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

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
        )(tenant)

        resp.status mustBe 201

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams/${teamOwner.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

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
        )(tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams/${teamOwner.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

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
          body = Json.arr(Json.obj("op" -> "replace", "path" -> "/name", "value" -> name)).some
        )(tenant)


        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams/${teamOwner.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

        verif.status mustBe 200
        (verif.json.as[JsObject] \ "name").as[String] mustBe name
      }
      "DELETE :: Ok" in {
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(user),
          teams = Seq(defaultAdminTeam, teamOwner),
          subscriptions = Seq(adminApiSubscription)
        )
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams/${teamOwner.id.value}",
          method = "DELETE",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

        resp.status mustBe 200

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/teams/${teamOwner.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

        verif.status mustBe 404
      }
    }

    "a call to api admin API" must {

    }

    "A call to ApiSubscription admin API" must {
      "POST :: Conflict :: Id already exists" in {
        val payPerUsePlanId = UsagePlanId("5")
        val sub  = ApiSubscription(
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
        )(tenant)

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

        //tenant not found
        val respTenant = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = sub.copy(tenant = TenantId("notFound")).asJson.some
        )(tenant)

        respTenant.status mustBe 400
        getMsg(respTenant) mustBe "Tenant not found"

        //plan not found
        val respPlan = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = sub.copy(plan = UsagePlanId("notFound")).asJson.some
        )(tenant)
        respPlan.status mustBe 400
        getMsg(respPlan) mustBe "Plan not found"

        //team not found
        val respTeam = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = sub.copy(team = TeamId("notFound")).asJson.some
        )(tenant)
        respTeam.status mustBe 400
        getMsg(respTeam) mustBe "Team not found"

        //by not found
        val respBy = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = sub.copy(by = UserId("notFound")).asJson.some
        )(tenant)
        respBy.status mustBe 400
        getMsg(respBy) mustBe "By not found"

        //parent not found
        val respParent = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = sub.copy(parent = ApiSubscriptionId("notFound").some).asJson.some
        )(tenant)
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
        //tenant not found
        val respTenant = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = sub.copy(tenant = TenantId("notFound")).asJson.some
        )(tenant)

        respTenant.status mustBe 400
        getMsg(respTenant) mustBe "Tenant not found"

        //plan not found
        val respPlan = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = sub.copy(plan = UsagePlanId("notFound")).asJson.some
        )(tenant)
        respPlan.status mustBe 400
        getMsg(respPlan) mustBe "Plan not found"

        //team not found
        val respTeam = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = sub.copy(team = TeamId("notFound")).asJson.some
        )(tenant)
        respTeam.status mustBe 400
        getMsg(respTeam) mustBe "Team not found"

        //by not found
        val respBy = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = sub.copy(by = UserId("notFound")).asJson.some
        )(tenant)
        respBy.status mustBe 400
        getMsg(respBy) mustBe "By not found"

        //parent not found
        val respParent = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = sub.copy(parent = ApiSubscriptionId("notFound").some).asJson.some
        )(tenant)
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
        )(tenant)

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
        //tenant not found
        val respTenant = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json.arr(Json.obj("op" -> "replace", "path" -> "/_tenant", "value" -> "notFound")).some
        )(tenant)

        respTenant.status mustBe 400
        getMsg(respTenant) mustBe "Tenant not found"

        //plan not found
        val respPlan = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json.arr(Json.obj("op" -> "replace", "path" -> "/plan", "value" -> "notFound")).some
        )(tenant)
        respPlan.status mustBe 400
        getMsg(respPlan) mustBe "Plan not found"

        //team not found
        val respTeam = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json.arr(Json.obj("op" -> "replace", "path" -> "/team", "value" -> "notFound")).some
        )(tenant)
        respTeam.status mustBe 400
        getMsg(respTeam) mustBe "Team not found"

        //by not found
        val respBy = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json.arr(Json.obj("op" -> "replace", "path" -> "/by", "value" -> "notFound")).some
        )(tenant)
        respBy.status mustBe 400
        getMsg(respBy) mustBe "By not found"

        //parent not found
        val respParent = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json.arr(Json.obj("op" -> "replace", "path" -> "/parent", "value" -> "notFound")).some
        )(tenant)
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
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

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
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

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
        )(tenant)

        resp.status mustBe 201

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

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
        )(tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

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
          body = Json.arr(Json.obj("op" -> "replace", "path" -> "/adminCustomName", "value" -> name)).some
        )(tenant)


        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

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
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

        resp.status mustBe 200

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/subscriptions/${sub.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

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
          content = "#title")

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
        )(tenant)

        resp.status mustBe 409
      }

      "GET :: Ok" in {
        val page = ApiDocumentationPage(
          id = ApiDocumentationPageId(IdGenerator.token(10)),
          tenant = tenant.id,
          title = "test",
          lastModificationAt = DateTime.now(),
          content = "#title")

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
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

        resp.status mustBe 200
        resp.json mustBe page.asJson
      }

      "POST :: Created" in {
        val page = ApiDocumentationPage(
          id = ApiDocumentationPageId(IdGenerator.token(10)),
          tenant = tenant.id,
          title = "test",
          lastModificationAt = DateTime.now(),
          content = "#title")

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
        )(tenant)

        resp.status mustBe 201

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/pages/${page.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

        verif.status mustBe 200
        verif.json mustBe page.asJson
      }
      "PUT :: No Content" in {
        val page = ApiDocumentationPage(
          id = ApiDocumentationPageId(IdGenerator.token(10)),
          tenant = tenant.id,
          title = "test",
          lastModificationAt = DateTime.now(),
          content = "#title")

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
        )(tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/pages/${page.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

        verif.status mustBe 200
        (verif.json.as[JsObject] \ "content").as[String] mustBe name
      }
      "PATCH :: No Content" in {
        val page = ApiDocumentationPage(
          id = ApiDocumentationPageId(IdGenerator.token(10)),
          tenant = tenant.id,
          title = "test",
          lastModificationAt = DateTime.now(),
          content = "#title")

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
          body = Json.arr(Json.obj("op" -> "replace", "path" -> "/content", "value" -> content)).some
        )(tenant)


        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/pages/${page.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

        verif.status mustBe 200
        (verif.json.as[JsObject] \ "content").as[String] mustBe content
      }
      "DELETE :: Ok" in {
        val page = ApiDocumentationPage(
          id = ApiDocumentationPageId(IdGenerator.token(10)),
          tenant = tenant.id,
          title = "test",
          lastModificationAt = DateTime.now(),
          content = "#title")

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
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

        resp.status mustBe 200

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/pages/${page.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

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
            api = defaultApi.api.id, team = teamConsumerId
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
        )(tenant)

        resp.status mustBe 409
      }
      "POST :: BadRequest" in {
        val notif = Notification(
          id = NotificationId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id.some,
          sender = userAdmin.asNotificationSender,
          action = NotificationAction.ApiAccess(
            api = defaultApi.api.id, team = teamConsumerId
          )
        )
        setupEnvBlocking(
          tenants = Seq(tenant),
          teams = Seq(defaultAdminTeam, teamOwner),
          users = Seq(userAdmin, user),
          notifications = Seq(),
          subscriptions = Seq(adminApiSubscription)
        )

        //tenant not found
        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/notifications",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = notif.copy(tenant = TenantId("test")).asJson.some
        )(tenant)

        resp.status mustBe 400
      }

      "PUT :: BadRequest" in {
        val notif = Notification(
          id = NotificationId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id.some,
          sender = userAdmin.asNotificationSender,
          action = NotificationAction.ApiAccess(
            api = defaultApi.api.id, team = teamConsumerId
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
        )(tenant)

        respConflict.status mustBe 400
      }

      "PUT :: Not Found" in {
        val notif = Notification(
          id = NotificationId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id.some,
          sender = userAdmin.asNotificationSender,
          action = NotificationAction.ApiAccess(
            api = defaultApi.api.id, team = teamConsumerId
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
        )(tenant)

        respNotFound.status mustBe 404
      }

      "PATCH :: Bad Request" in {
        val notif = Notification(
          id = NotificationId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id.some,
          sender = userAdmin.asNotificationSender,
          action = NotificationAction.ApiAccess(
            api = defaultApi.api.id, team = teamConsumerId
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
          body = Json.arr(Json.obj("op" -> "replace", "path" -> "/_tenant", "value" -> tenant2.id.asJson)).some
        )(tenant)

        resp.status mustBe 400

      }

      "GET :: Not Found" in {
        val notif = Notification(
          id = NotificationId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id.some,
          sender = userAdmin.asNotificationSender,
          action = NotificationAction.ApiAccess(
            api = defaultApi.api.id, team = teamConsumerId
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
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

        resp.status mustBe 404
      }

      "GET :: Ok" in {
        val notif = Notification(
          id = NotificationId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id.some,
          sender = userAdmin.asNotificationSender,
          action = NotificationAction.ApiAccess(
            api = defaultApi.api.id, team = teamConsumerId
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
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

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
            api = defaultApi.api.id, team = teamConsumerId
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
        )(tenant)

        resp.status mustBe 201

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/notifications/${notif.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

        verif.status mustBe 200
        verif.json.as(json.NotificationFormat) mustBe notif
      }
      "PUT :: No Content" in {
        val notif = Notification(
          id = NotificationId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id.some,
          sender = userAdmin.asNotificationSender,
          action = NotificationAction.ApiAccess(
            api = defaultApi.api.id, team = teamConsumerId
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
        )(tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/notifications/${notif.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

        verif.status mustBe 200
        verif.json.as(json.NotificationFormat) mustBe updatedNotif
      }
      "PATCH :: No Content" in {
        val notif = Notification(
          id = NotificationId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id.some,
          sender = userAdmin.asNotificationSender,
          action = NotificationAction.ApiAccess(
            api = defaultApi.api.id, team = teamConsumerId
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
          body = Json.arr(Json.obj("op" -> "replace", "path" -> "/sender", "value" -> user.asNotificationSender.asJson)).some
        )(tenant)

        resp.status mustBe 204

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/notifications/${notif.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

        verif.status mustBe 200
        verif.json.as(json.NotificationFormat) mustBe notif.copy(sender = user.asNotificationSender)
      }
      "DELETE :: works" in {
        val notif = Notification(
          id = NotificationId(IdGenerator.token(10)),
          tenant = tenant.id,
          team = teamOwner.id.some,
          sender = userAdmin.asNotificationSender,
          action = NotificationAction.ApiAccess(
            api = defaultApi.api.id, team = teamConsumerId
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
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

        resp.status mustBe 200

        val verif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/notifications/${notif.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

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
        )(tenant)

        resp.status mustBe 400
        getMsg(resp) mustBe "User not found"
      }
      "POST :: Conflict" in {
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

        val resp = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/sessions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = session.copy(ttl = 1.hour).asJson.some
        )(tenant)

        resp.status mustBe 409
      }

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
        )(tenant)

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
        )(tenant)

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
          body = Json.arr(Json.obj("op" -> "replace", "path" -> "/email", "value" -> userAdmin.email)).some
        )(tenant)

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
          hits = 42, dataIn = 10000, dataOut = 10000, avgDuration = None, avgOverhead = None
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
          remainingCallsPerMonth = 100)
        ,
        billing = ApiKeyBilling(
          hits = 42, total = 420
        )
        ,
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
          body = consumption.copy(from = DateTime.now().minusDays(1).withTimeAtStartOfDay()).asJson.some
        )(tenant)

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
            hits = 42, dataIn = 10000, dataOut = 10000, avgDuration = None, avgOverhead = None
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
            remainingCallsPerMonth = 100)
          ,
          billing = ApiKeyBilling(
            hits = 42, total = 420
          )
          ,
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

        //tenant not found
        val respTenant = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = consumption.copy(tenant = TenantId("unknown")).asJson.some
        )(tenant)

        respTenant.status mustBe 400
        getMsg(respTenant) mustBe "Tenant not found"

        //api not found
        val respApi = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = consumption.copy(api = ApiId("unknown")).asJson.some
        )(tenant)

        respApi.status mustBe 400
        getMsg(respApi) mustBe "Api not found"

        //plan not found
        val respPlan = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = consumption.copy(plan = UsagePlanId("unknown")).asJson.some
        )(tenant)

        respPlan.status mustBe 400
        getMsg(respPlan) mustBe "Plan not found"

        //wrong date
        val respDate = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions",
          method = "POST",
          headers = getAdminApiHeader(adminApiSubscription),
          body = consumption.copy(from = DateTime.now().plusDays(2)).asJson.some
        )(tenant)

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
            hits = 42, dataIn = 10000, dataOut = 10000, avgDuration = None, avgOverhead = None
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
            remainingCallsPerMonth = 100)
          ,
          billing = ApiKeyBilling(
            hits = 42, total = 420
          )
          ,
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

        //tenant not found
        val respTenant = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = consumption.copy(tenant = TenantId("unknown")).asJson.some
        )(tenant)

        respTenant.status mustBe 400
        getMsg(respTenant) mustBe "Tenant not found"

        //api not found
        val respApi = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = consumption.copy(api = ApiId("unknown")).asJson.some
        )(tenant)

        respApi.status mustBe 400
        getMsg(respApi) mustBe "Api not found"

        //plan not found
        val respPlan = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = consumption.copy(plan = UsagePlanId("unknown")).asJson.some
        )(tenant)

        respPlan.status mustBe 400
        getMsg(respPlan) mustBe "Plan not found"

        //wrong date
        val respDate = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          method = "PUT",
          headers = getAdminApiHeader(adminApiSubscription),
          body = consumption.copy(from = DateTime.now().plusDays(2)).asJson.some
        )(tenant)

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
            hits = 42, dataIn = 10000, dataOut = 10000, avgDuration = None, avgOverhead = None
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
            remainingCallsPerMonth = 100)
          ,
          billing = ApiKeyBilling(
            hits = 42, total = 420
          )
          ,
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

        //tenant not found
        val respTenant = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json.arr(Json.obj("op" -> "replace", "path" -> "/_tenant", "value"-> TenantId("unknown").asJson)).some
        )(tenant)

        respTenant.status mustBe 400
        getMsg(respTenant) mustBe "Tenant not found"

        //api not found
        val respApi = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json.arr(Json.obj("op" -> "replace", "path" -> "/api", "value"-> ApiId("unknown").asJson)).some
        )(tenant)

        respApi.status mustBe 400
        getMsg(respApi) mustBe "Api not found"

        //plan not found
        val respPlan = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json.arr(Json.obj("op" -> "replace", "path" -> "/plan", "value"-> UsagePlanId("unknown").asJson)).some
        )(tenant)

        respPlan.status mustBe 400
        getMsg(respPlan) mustBe "Plan not found"

        //wrong date
        val respDate = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          method = "PATCH",
          headers = getAdminApiHeader(adminApiSubscription),
          body = Json.arr(Json.obj("op" -> "replace", "path" -> "/from", "value"-> json.DateTimeFormat.writes(DateTime.now().plusDays(2)))).some
        )(tenant)

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
            hits = 42, dataIn = 10000, dataOut = 10000, avgDuration = None, avgOverhead = None
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
            remainingCallsPerMonth = 100)
          ,
          billing = ApiKeyBilling(
            hits = 42, total = 420
          )
          ,
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
        )(tenant)

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
            hits = 42, dataIn = 10000, dataOut = 10000, avgDuration = None, avgOverhead = None
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
            remainingCallsPerMonth = 100)
          ,
          billing = ApiKeyBilling(
            hits = 42, total = 420
          )
          ,
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
        )(tenant)

        logger.warn(Json.stringify(resp.json))
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
            hits = 42, dataIn = 10000, dataOut = 10000, avgDuration = None, avgOverhead = None
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
            remainingCallsPerMonth = 100)
          ,
          billing = ApiKeyBilling(
            hits = 42, total = 420
          )
          ,
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
        )(tenant)

        resp.status mustBe 204

        val respVerif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

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
            hits = 42, dataIn = 10000, dataOut = 10000, avgDuration = None, avgOverhead = None
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
            remainingCallsPerMonth = 100)
          ,
          billing = ApiKeyBilling(
            hits = 42, total = 420
          )
          ,
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
          body = Json.arr(Json.obj("op" -> "replace", "path" -> "/hits", "value"-> 100)).some
        )(tenant)

        resp.status mustBe 204

        val respVerif = httpJsonCallWithoutSessionBlocking(
          path = s"/admin-api/consumptions/${consumption.id.value}",
          headers = getAdminApiHeader(adminApiSubscription),
        )(tenant)

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
            hits = 42, dataIn = 10000, dataOut = 10000, avgDuration = None, avgOverhead = None
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
            remainingCallsPerMonth = 100)
          ,
          billing = ApiKeyBilling(
            hits = 42, total = 420
          )
          ,
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
          method = "DELETE",
        )(tenant)

        resp.status mustBe 200
      }
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
