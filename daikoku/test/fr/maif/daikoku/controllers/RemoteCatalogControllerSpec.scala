package fr.maif.daikoku.controllers

import fr.maif.daikoku.domain.*
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import org.scalatest.concurrent.IntegrationPatience
import org.scalatest.{BeforeAndAfter, OptionValues}
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.{JsArray, JsValue, Json}
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

  private val otherTenant = tenant.copy(
    id = TenantId("other-tenant"),
    name = "other-tenant",
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
}
