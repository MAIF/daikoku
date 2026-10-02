package fr.maif.daikoku.controllers

import fr.maif.daikoku.domain.*
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import fr.maif.daikoku.utils.Yaml
import org.scalatest.concurrent.IntegrationPatience
import org.scalatest.{BeforeAndAfter, OptionValues}
import org.scalatestplus.play.PlaySpec
import org.apache.pekko.util.ByteString
import play.api.libs.json.{JsArray, JsObject, JsValue, Json}
import play.api.libs.ws.{BodyWritable, InMemoryBody, WSResponse}

import java.nio.file.{Files, Paths}
import java.util.Base64
import scala.concurrent.Await
import scala.concurrent.duration.*

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

  private lazy val openApi: JsObject = {
    val path = Paths.get(
      s"${System.getProperty("user.dir")}/public/swaggers/admin-api-openapi.yaml"
    )

    Yaml.parse(Files.readString(path)).get.as[JsObject]
  }

  // the minimal example of a kind, as published in the OpenAPI document
  private def publishedExample(schemaName: String): JsObject =
    (openApi \ "components" \ "schemas" \ schemaName \ "examples")
      .as[Seq[JsObject]]
      .head

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

  private def webhookCall(
      catalogId: String,
      body: String,
      headers: Map[String, String]
  ): WSResponse = {
    val contentType = headers.getOrElse("Content-Type", "application/json")
    val writable = BodyWritable[String](
      s => InMemoryBody(ByteString(s)),
      contentType
    )

    Await.result(
      daikokuComponents.env.wsClient
        .url(s"http://127.0.0.1:$port/api/remote-catalogs/$catalogId/_webhook")
        .withHttpHeaders((Map("Host" -> tenant.domain) ++ headers).toSeq*)
        .post(body)(using writable),
      10.seconds
    )
  }

  // what GitHub sends: the raw body signed with the webhook secret
  private def githubWebhook(
      catalogId: String,
      token: String,
      event: String,
      payload: JsValue,
      contentType: String = "application/json"
  ): WSResponse = {
    val body = Json.stringify(payload)
    val signature =
      RemoteCatalogTokenController.hmacSha256Hex(token, ByteString(body))

    webhookCall(
      catalogId,
      body,
      Map(
        "Content-Type" -> contentType,
        "X-GitHub-Event" -> event,
        "X-Hub-Signature-256" -> s"sha256=$signature"
      )
    )
  }

  private def githubCatalog(id: String, token: String): RemoteCatalog =
    aCatalog(id).copy(
      token = token,
      source = RemoteCatalogSource(
        kind = "github",
        config = Json.obj("repo" -> "acme/catalog", "branch" -> "main")
      )
    )

  private def githubPush(branch: String): JsObject =
    Json.obj(
      "ref" -> s"refs/heads/$branch",
      "repository" -> Json.obj("full_name" -> "acme/catalog")
    )

  private def folderCatalog(folderPerTeam: Boolean): RemoteCatalog =
    githubCatalog("cat-gh", "tok-gh").copy(folderPerTeam = folderPerTeam)

  // e.g. validateFolders("teams/team-a/team.json" -> teamIn("team-a"))
  private def validateFolders(files: (String, JsObject)*): WSResponse =
    tokenCall(
      "cat-gh",
      "_validate",
      "tok-gh",
      Some(JsArray(files.map { case (path, document) =>
        Json.obj("path" -> path, "content" -> Json.stringify(document))
      }))
    )

  private def teamIn(teamId: String): JsObject =
    Team(
      id = TeamId(teamId),
      tenant = tenant.id,
      `type` = TeamType.Organization,
      name = teamId,
      description = "",
      users = Set.empty,
      contact = s"$teamId@acme.io"
    ).asJson.as[JsObject] ++ Json.obj("kind" -> "team")

  private def keyringIn(id: String, team: String): JsObject =
    Json.obj(
      "kind" -> "keyring",
      "_id" -> id,
      "_tenant" -> tenant.id.value,
      "team" -> team,
      "otoroshiSettings" -> Json.obj("type" -> "Internal")
    )

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

    "delete a catalog" in {
      setupWithAdminApi(remoteCatalogs = Seq(aCatalog("cat-a")))

      adminApi("/cat-a", "DELETE").status mustBe 200
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

    "accept the minimal examples published in the OpenAPI document" in {
      val author = tenantAdmin.copy(id = UserId("user-admin"))

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(author),
        teams = Seq(defaultAdminTeam),
        remoteCatalogs = Seq(aCatalog("cat-a").copy(token = "tok-a"))
      )

      val kinds = Seq(
        "team" -> "Team",
        "usage-plan" -> "UsagePlan",
        "api" -> "Api",
        "keyring" -> "Keyring",
        "api-subscription" -> "ApiSubscription",
        "cms-page" -> "CmsPage"
      )
      val files = kinds.map { case (kind, schemaName) =>
        val document = publishedExample(schemaName) ++ Json.obj("kind" -> kind)

        Json.obj("path" -> s"$kind.json", "content" -> Json.stringify(document))
      }

      val validated =
        tokenCall("cat-a", "_validate", "tok-a", Some(JsArray(files)))

      withClue(validated.body) {
        validated.status mustBe 200
      }
      (validated.json \ "created").as[Seq[String]] must contain allOf (
        "team-weather",
        "plan-weather-free",
        "api-weather",
        "keyring-weather",
        "subscription-weather",
        "page-weather-home"
      )
    }
  }

  "The remote catalog webhook" should {
    "compute the signature of the GitHub documentation example" in {
      RemoteCatalogTokenController.hmacSha256Hex(
        "It's a Secret to Everybody",
        ByteString("Hello, World!")
      ) mustBe "757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17"
    }

    "deploy on a signed GitHub push to the catalog branch" in {
      setupWithAdminApi(Seq(githubCatalog("cat-gh", "tok-gh")))

      val resp = githubWebhook("cat-gh", "tok-gh", "push", githubPush("main"))
      resp.status mustBe 202
      (resp.json \ "deploying").as[String] mustBe "cat-gh"
    }

    "ignore a GitHub push to another branch" in {
      setupWithAdminApi(Seq(githubCatalog("cat-gh", "tok-gh")))

      val resp = githubWebhook("cat-gh", "tok-gh", "push", githubPush("dev"))
      resp.status mustBe 202
      (resp.json \ "ignored").asOpt[String] mustBe defined
    }

    "ignore a GitHub ping" in {
      setupWithAdminApi(Seq(githubCatalog("cat-gh", "tok-gh")))

      val resp = githubWebhook("cat-gh", "tok-gh", "ping", Json.obj("zen" -> "ok"))
      resp.status mustBe 202
      (resp.json \ "ignored").as[String] mustBe "not a push event"
    }

    "refuse a GitHub delivery signed with another secret or not signed" in {
      setupWithAdminApi(Seq(githubCatalog("cat-gh", "tok-gh")))

      githubWebhook("cat-gh", "wrong", "push", githubPush("main")).status mustBe 401
      webhookCall(
        "cat-gh",
        Json.stringify(githubPush("main")),
        Map("X-GitHub-Event" -> "push")
      ).status mustBe 401
    }

    "refuse a GitHub delivery that is not JSON" in {
      setupWithAdminApi(Seq(githubCatalog("cat-gh", "tok-gh")))

      val resp = githubWebhook(
        "cat-gh",
        "tok-gh",
        "push",
        githubPush("main"),
        contentType = "application/x-www-form-urlencoded"
      )
      resp.status mustBe 400
    }

    "deploy on a GitLab push carrying the catalog token" in {
      val gitlab = aCatalog("cat-gl").copy(
        token = "tok-gl",
        source = RemoteCatalogSource(
          kind = "gitlab",
          config = Json.obj(
            "repo" -> "https://gitlab.com/acme/catalog",
            "branch" -> "main"
          )
        )
      )
      setupWithAdminApi(Seq(gitlab))

      val resp = webhookCall(
        "cat-gl",
        Json.stringify(
          Json.obj(
            "ref" -> "refs/heads/main",
            "project" -> Json.obj("web_url" -> "https://gitlab.com/acme/catalog")
          )
        ),
        Map("X-Gitlab-Event" -> "Push Hook", "X-Gitlab-Token" -> "tok-gl")
      )
      resp.status mustBe 202
      (resp.json \ "deploying").as[String] mustBe "cat-gl"
    }

    "refuse webhooks on a source that does not support them" in {
      setupWithAdminApi(Seq(aCatalog("cat-http").copy(token = "tok-http")))

      githubWebhook("cat-http", "tok-http", "push", githubPush("main"))
        .status mustBe 400
    }
  }

  "A catalog with one folder per team" should {
    def runErrors(resp: WSResponse): Seq[String] =
      (resp.json \ "errors").as[Seq[String]]

    "accept a team folder holding the team and its keyring" in {
      setupWithAdminApi(Seq(folderCatalog(folderPerTeam = true)))

      val resp = validateFolders(
        "teams/team-a/team.json" -> teamIn("team-a"),
        "teams/team-a/keyring.json" -> keyringIn("kr-a", "team-a"),
        "shared.json" -> teamIn("team-shared")
      )
      withClue(resp.body) {
        resp.status mustBe 200
      }
    }

    "accept a usage plan referenced by an api of its team" in {
      setupWithAdminApi(Seq(folderCatalog(folderPerTeam = true)))

      val resp = validateFolders(
        "teams/team-weather/team.json" ->
          (publishedExample("Team") ++ Json.obj("kind" -> "team")),
        "teams/team-weather/api.json" ->
          (publishedExample("Api") ++ Json.obj(
            "kind" -> "api",
            "possibleUsagePlans" -> Json.arr("plan-weather-free")
          )),
        "teams/team-weather/plan.json" ->
          (publishedExample("UsagePlan") ++ Json.obj("kind" -> "usage-plan"))
      )
      withClue(resp.body) {
        resp.status mustBe 200
      }
    }

    "refuse an entity declared in the folder of another team" in {
      setupWithAdminApi(Seq(folderCatalog(folderPerTeam = true)))

      val resp = validateFolders(
        "teams/team-a/team.json" -> teamIn("team-a"),
        "teams/team-b/team.json" -> teamIn("team-b"),
        "teams/team-b/keyring.json" -> keyringIn("kr-a", "team-a")
      )
      resp.status mustBe 400
      runErrors(resp).exists(
        _.contains("keyring kr-a: belongs to team 'team-a', not to 'teams/team-b'")
      ) mustBe true
    }

    "refuse a folder that matches no team" in {
      setupWithAdminApi(Seq(folderCatalog(folderPerTeam = true)))

      val resp = validateFolders(
        "teams/ghost/keyring.json" -> keyringIn("kr-ghost", "ghost")
      )
      resp.status mustBe 400
      runErrors(resp).exists(
        _.contains("folder 'teams/ghost' does not match any team")
      ) mustBe true
    }

    "refuse a cms page in a team folder" in {
      setupWithAdminApi(Seq(folderCatalog(folderPerTeam = true)))

      val resp = validateFolders(
        "teams/team-a/team.json" -> teamIn("team-a"),
        "teams/team-a/page.json" ->
          (publishedExample("CmsPage") ++ Json.obj("kind" -> "cms-page"))
      )
      resp.status mustBe 400
      runErrors(resp).exists(
        _.contains("a cms-page cannot be declared in a team folder")
      ) mustBe true
    }

    "not check the folders when folderPerTeam is off" in {
      setupWithAdminApi(Seq(folderCatalog(folderPerTeam = false)))

      val resp = validateFolders(
        "teams/team-a/team.json" -> teamIn("team-a"),
        "teams/team-b/team.json" -> teamIn("team-b"),
        "teams/team-b/keyring.json" -> keyringIn("kr-a", "team-a")
      )
      withClue(resp.body) {
        resp.status mustBe 200
      }
    }
  }
}
