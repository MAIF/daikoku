package fr.maif.daikoku.controllers

import fr.maif.daikoku.domain.*
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import org.scalatest.concurrent.IntegrationPatience
import org.scalatest.{BeforeAndAfter, OptionValues}
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.{JsArray, JsObject, JsValue, Json}
import play.api.libs.ws.WSResponse

import java.util.Base64

class RemoteCatalogControllerSpec
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with OptionValues
    with BeforeAndAfter {

  before {
    setupEnvBlocking(tenants = Seq(tenant))
  }

  // the token routes resolve the tenant from the Host header: it needs its own domain
  private val otherTenant = tenant.copy(
    id = TenantId("other-tenant"),
    name = "other-tenant",
    domain = "other-tenant.test",
    adminApi = ApiId("other-admin-api")
  )

  private def aCatalog(id: String, owner: TenantId = tenant.id): RemoteCatalog =
    RemoteCatalog(
      id = RemoteCatalogId(id),
      tenant = owner,
      name = s"catalog $id",
      source = RemoteCatalogSource(
        kind = "http",
        config = Json.obj("url" -> "http://localhost/catalog.json")
      )
    )

  private def setupWithAdminApi(remoteCatalogs: Seq[RemoteCatalog]): Unit =
    setupEnvBlocking(
      tenants = Seq(tenant, otherTenant),
      users = Seq(tenantAdmin),
      teams = Seq(defaultAdminTeam),
      subscriptions = Seq(adminApiSubscription),
      keyrings = Seq(adminApiKeyring),
      remoteCatalogs = remoteCatalogs
    )

  private def adminApi(
      path: String,
      method: String = "GET",
      body: Option[JsValue] = None
  ): WSResponse =
    httpJsonCallWithoutSessionBlocking(
      path = s"/admin-api/remote-catalogs$path",
      method = method,
      headers = Map(
        "Authorization" -> s"Basic ${Base64.getEncoder.encodeToString(
            s"${adminApiKeyring.apiKey.clientId}:${adminApiKeyring.apiKey.clientSecret}".getBytes()
          )}"
      ),
      body = body
    )(using tenant)

  private def backOffice(
      session: UserSession,
      path: String,
      method: String = "GET",
      body: Option[JsValue] = None
  ): WSResponse =
    httpJsonCallBlocking(
      path = s"/api/tenants/${tenant.id.value}/remote-catalogs$path",
      method = method,
      body = body
    )(using tenant, session)

  private def tokenCall(
      catalogId: String,
      action: String,
      token: String,
      body: Option[JsValue] = None
  ): WSResponse =
    httpJsonCallWithoutSessionBlocking(
      path = s"/api/remote-catalogs/$catalogId/$action",
      method = "POST",
      headers = Map("Authorization" -> s"Bearer $token"),
      body = body
    )(using tenant)

  private def teamFile(teamId: String): JsObject = {
    val team = Team(
      id = TeamId(teamId),
      tenant = tenant.id,
      `type` = TeamType.Organization,
      name = teamId,
      description = "",
      users = Set.empty,
      contact = s"$teamId@acme.io"
    )

    Json.obj(
      "path" -> s"teams/$teamId.json",
      "content" -> Json.stringify(
        team.asJson.as[JsObject] ++ Json.obj("kind" -> "team")
      )
    )
  }

  "Remote catalog admin-api" should {
    "create a catalog and read it back" in {
      setupWithAdminApi(remoteCatalogs = Seq.empty)

      val created = adminApi("", "POST", Some(aCatalog("cat-a").asJson))
      created.status mustBe 201

      val one = adminApi("/cat-a")
      one.status mustBe 200
      (one.json \ "name").as[String] mustBe "catalog cat-a"

      val all = adminApi("")
      all.status mustBe 200
      all.json.as[JsArray].value.map(c => (c \ "_id").as[String]) mustBe Seq(
        "cat-a"
      )
    }

    "refuse to create a catalog whose id is already taken, even by another tenant" in {
      setupWithAdminApi(remoteCatalogs =
        Seq(aCatalog("cat-other", owner = otherTenant.id))
      )

      val created = adminApi("", "POST", Some(aCatalog("cat-other").asJson))
      created.status mustBe 409

      val stored = daikokuComponents.env.dataStore.remoteCatalogRepo
        .forAllTenant()
        .findById("cat-other")
        .futureValue
      stored.value.tenant mustBe otherTenant.id
    }

    "neither show nor delete the catalog of another tenant" in {
      setupWithAdminApi(remoteCatalogs =
        Seq(aCatalog("cat-a"), aCatalog("cat-other", owner = otherTenant.id))
      )

      val all = adminApi("")
      all.json.as[JsArray].value.map(c => (c \ "_id").as[String]) mustBe Seq(
        "cat-a"
      )

      adminApi("/cat-other").status mustBe 404
      adminApi("/cat-other", "DELETE").status mustBe 404
    }

    "physically delete a catalog, even when asked to delete it logically" in {
      setupWithAdminApi(remoteCatalogs = Seq(aCatalog("cat-a")))

      adminApi("/cat-a?logically=true", "DELETE").status mustBe 200
      adminApi("/cat-a").status mustBe 404
    }
  }

  "Remote catalog back-office routes" should {
    "generate the id and force the tenant on creation" in {
      setupWithAdminApi(remoteCatalogs = Seq.empty)
      val session = loginWithBlocking(tenantAdmin, tenant)

      val body = aCatalog("chosen-id", owner = otherTenant.id).asJson
      val created = backOffice(session, "", "POST", Some(body))
      created.status mustBe 201

      val createdId = (created.json \ "_id").as[String]
      createdId must not be "chosen-id"
      (created.json \ "_tenant").as[String] mustBe tenant.id.value

      val all = backOffice(session, "")
      all.json.as[JsArray].value.map(c => (c \ "_id").as[String]) mustBe Seq(
        createdId
      )
    }

    "keep id and tenant on update and refuse the catalog of another tenant" in {
      setupWithAdminApi(remoteCatalogs =
        Seq(aCatalog("cat-a"), aCatalog("cat-other", owner = otherTenant.id))
      )
      val session = loginWithBlocking(tenantAdmin, tenant)

      val renamed = aCatalog("hijacked-id").copy(name = "renamed").asJson
      val updated = backOffice(session, "/cat-a", "PUT", Some(renamed))
      updated.status mustBe 200
      (updated.json \ "_id").as[String] mustBe "cat-a"
      (updated.json \ "name").as[String] mustBe "renamed"

      backOffice(session, "/cat-other", "PUT", Some(renamed)).status mustBe 404

      val other = daikokuComponents.env.dataStore.remoteCatalogRepo
        .forAllTenant()
        .findById("cat-other")
        .futureValue
      other.value.name mustBe "catalog cat-other"
    }

    "delete its own catalog but not the catalog of another tenant" in {
      setupWithAdminApi(remoteCatalogs =
        Seq(aCatalog("cat-a"), aCatalog("cat-other", owner = otherTenant.id))
      )
      val session = loginWithBlocking(tenantAdmin, tenant)

      backOffice(session, "/cat-a", "DELETE").status mustBe 204
      backOffice(session, "").json.as[JsArray].value mustBe empty

      backOffice(session, "/cat-other", "DELETE").status mustBe 404

      val other = daikokuComponents.env.dataStore.remoteCatalogRepo
        .forAllTenant()
        .findById("cat-other")
        .futureValue
      other mustBe defined
    }
  }

  "Remote catalog token routes" should {
    "validate a whole catalog without writing anything" in {
      setupWithAdminApi(remoteCatalogs =
        Seq(aCatalog("cat-a").copy(token = "tok-a"))
      )

      val validated = tokenCall(
        "cat-a",
        "_validate",
        "tok-a",
        Some(Json.arr(teamFile("team-weather")))
      )
      validated.status mustBe 200
      (validated.json \ "status").as[String] mustBe "completed"
      (validated.json \ "created").as[Seq[String]] mustBe Seq("team-weather")

      val team = daikokuComponents.env.dataStore.teamRepo
        .forTenant(tenant)
        .findById("team-weather")
        .futureValue
      team mustBe None
    }

    "report a broken file with its path" in {
      setupWithAdminApi(remoteCatalogs =
        Seq(aCatalog("cat-a").copy(token = "tok-a"))
      )
      val content = (teamFile("team-weather") \ "content").as[String]
      val withoutId = Json.parse(content).as[JsObject] - "_id"
      val broken = Json.obj(
        "path" -> "teams/broken.json",
        "content" -> Json.stringify(withoutId)
      )

      val validated =
        tokenCall("cat-a", "_validate", "tok-a", Some(Json.arr(broken)))
      validated.status mustBe 400
      (validated.json \ "status").as[String] mustBe "failed"
      val errors = (validated.json \ "errors").as[Seq[String]]
      errors.head must startWith("teams/broken.json")
      errors.head must include("Missing required field '_id'")
    }

    "refuse a missing, wrong or foreign token, and an unknown catalog" in {
      setupWithAdminApi(remoteCatalogs =
        Seq(
          aCatalog("cat-a").copy(token = "tok-a"),
          aCatalog("cat-b").copy(token = "tok-b")
        )
      )

      val withoutToken = httpJsonCallWithoutSessionBlocking(
        path = "/api/remote-catalogs/cat-a/_test",
        method = "POST"
      )(using tenant)
      withoutToken.status mustBe 401

      tokenCall("cat-a", "_test", "wrong").status mustBe 401
      tokenCall("cat-a", "_test", "tok-b").status mustBe 401
      tokenCall("unknown", "_test", "tok-a").status mustBe 401
    }

    "stop accepting the old token once it is regenerated" in {
      setupWithAdminApi(remoteCatalogs =
        Seq(aCatalog("cat-a").copy(token = "tok-a"))
      )
      val session = loginWithBlocking(tenantAdmin, tenant)

      val regenerated =
        backOffice(session, "/cat-a/_regenerate-token", "POST")
      regenerated.status mustBe 200
      val newToken = (regenerated.json \ "token").as[String]
      newToken must not be "tok-a"

      tokenCall(
        "cat-a",
        "_validate",
        "tok-a",
        Some(Json.arr())
      ).status mustBe 401
      tokenCall(
        "cat-a",
        "_validate",
        newToken,
        Some(Json.arr())
      ).status mustBe 200
    }

    "never take the token from a request body" in {
      setupWithAdminApi(remoteCatalogs = Seq.empty)

      val proposed = aCatalog("cat-a").copy(token = "chosen").asJson
      adminApi("", "POST", Some(proposed)).status mustBe 201

      val createdToken = (adminApi("/cat-a").json \ "token").as[String]
      createdToken must not be "chosen"

      val hijack = aCatalog("cat-a").copy(token = "hijack").asJson
      adminApi("/cat-a", "PUT", Some(hijack)).status mustBe 204

      (adminApi("/cat-a").json \ "token").as[String] mustBe createdToken
    }

    "validate through the admin API as well" in {
      setupWithAdminApi(remoteCatalogs = Seq(aCatalog("cat-a")))

      val validated = adminApi(
        "/cat-a/_validate",
        "POST",
        Some(Json.arr(teamFile("team-weather")))
      )
      validated.status mustBe 200
      (validated.json \ "created").as[Seq[String]] mustBe Seq("team-weather")
    }
  }
}
