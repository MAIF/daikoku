package fr.maif.daikoku.controllers

import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.domain._
import fr.maif.daikoku.services.catalog.RemoteContentParser
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import org.scalatest.concurrent.IntegrationPatience
import org.scalatest.{BeforeAndAfter, BeforeAndAfterEach}
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.{JsArray, JsObject, Json}
import play.api.libs.ws.WSResponse

import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.util.Base64

class RemoteCatalogSpec
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfterEach
    with BeforeAndAfter {

  def getAdminApiHeader(adminApiSubscription: ApiSubscription): Map[String, String] =
    Map("Authorization" -> s"Basic ${Base64.getEncoder.encodeToString(
        s"${adminApiSubscription.apiKey.clientId}:${adminApiSubscription.apiKey.clientSecret}".getBytes()
      )}")

  private def aTeam(id: String, name: String): Team =
    Team(
      id = TeamId(id),
      tenant = tenant.id,
      `type` = TeamType.Organization,
      name = name,
      description = "",
      users = Set.empty,
      contact = s"$id@acme.io"
    )

  private def teamDoc(t: Team): JsObject =
    t.asJson.as[JsObject] ++ Json.obj("kind" -> "team")

  private def writeFile(content: String): String = {
    val p = Files.createTempFile("daikoku-catalog", ".json")
    Files.write(p, content.getBytes(StandardCharsets.UTF_8))
    p.toAbsolutePath.toString
  }

  private def fileCatalog(id: String, path: String): RemoteCatalog =
    RemoteCatalog(
      id = id,
      name = "test catalog",
      source = RemoteCatalogSource(kind = "file", config = Json.obj("path" -> path)),
      scheduling = RemoteCatalogScheduling(),
      allowedKinds = Set("team")
    )

  private def deployCall(catalogId: String, action: String): WSResponse =
    httpJsonCallWithoutSessionBlocking(
      path = s"/admin-api/remote-catalogs/$catalogId/$action",
      method = "POST",
      headers = getAdminApiHeader(adminApiSubscription),
      body = Json.obj().some
    )(using tenant)

  private def getTeam(id: String): WSResponse =
    httpJsonCallWithoutSessionBlocking(
      path = s"/admin-api/teams/$id",
      method = "GET",
      headers = getAdminApiHeader(adminApiSubscription)
    )(using tenant)

  private def getApi(id: String): WSResponse =
    httpJsonCallWithoutSessionBlocking(
      path = s"/admin-api/apis/$id",
      method = "GET",
      headers = getAdminApiHeader(adminApiSubscription)
    )(using tenant)

  private def kindResult(resp: WSResponse, kind: String): JsObject =
    (resp.json \ "results")
      .as[JsArray]
      .value
      .map(_.as[JsObject])
      .find(r => (r \ "kind").as[String] == kind)
      .get

  "RemoteContentParser" should {
    "parse a multi-doc YAML mixing flat and kube styles" in {
      val yaml =
        """kind: team
          |_id: team-weather
          |name: Weather
          |---
          |kind: usage-plan
          |_id: plan-free
          |---
          |apiVersion: daikoku.io/v1
          |kind: cms-page
          |spec:
          |  _id: page-home
          |  name: Home
          |""".stripMargin

      val entities = RemoteContentParser.parseRawContent(yaml, "test")
      entities.map(_.kind) mustBe Seq("team", "usage-plan", "cms-page")
      entities.map(_.id) mustBe Seq("team-weather", "plan-free", "page-home")
    }

    "ignore content that is neither a JSON nor a YAML entity" in {
      RemoteContentParser.parseRawContent("just a plain scalar", "test") mustBe empty
    }
  }

  "Remote catalog (file source)" should {
    "deploy a team and tag it with created_by" in {
      val path = writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      setupEnvBlocking(
        tenants = Seq(tenant.copy(remoteCatalogs = Seq(fileCatalog("cat-file", path)))),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription)
      )

      val deploy = deployCall("cat-file", "_deploy")
      deploy.status mustBe 200
      (kindResult(deploy, "team") \ "created").as[Int] mustBe 1

      val get = getTeam("team-weather")
      get.status mustBe 200
      (get.json \ "metadata" \ "created_by").as[String] mustBe "remote_catalog=cat-file"
    }

    "be idempotent: re-deploying identical content changes nothing" in {
      val path = writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      setupEnvBlocking(
        tenants = Seq(tenant.copy(remoteCatalogs = Seq(fileCatalog("cat-file", path)))),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription)
      )

      (kindResult(deployCall("cat-file", "_deploy"), "team") \ "created").as[Int] mustBe 1
      val second = kindResult(deployCall("cat-file", "_deploy"), "team")
      (second \ "created").as[Int] mustBe 0
      (second \ "updated").as[Int] mustBe 0
    }

    "update only when content actually changes" in {
      val path = writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      setupEnvBlocking(
        tenants = Seq(tenant.copy(remoteCatalogs = Seq(fileCatalog("cat-file", path)))),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription)
      )

      deployCall("cat-file", "_deploy").status mustBe 200
      Files.write(
        java.nio.file.Paths.get(path),
        Json.stringify(teamDoc(aTeam("team-weather", "Weather Renamed"))).getBytes(StandardCharsets.UTF_8)
      )
      (kindResult(deployCall("cat-file", "_deploy"), "team") \ "updated").as[Int] mustBe 1
    }

    "delete orphans removed from the source" in {
      val path = writeFile(
        Json.stringify(JsArray(Seq(teamDoc(aTeam("team-a", "A")), teamDoc(aTeam("team-b", "B")))))
      )
      setupEnvBlocking(
        tenants = Seq(tenant.copy(remoteCatalogs = Seq(fileCatalog("cat-file", path)))),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription)
      )

      (kindResult(deployCall("cat-file", "_deploy"), "team") \ "created").as[Int] mustBe 2

      Files.write(
        java.nio.file.Paths.get(path),
        Json.stringify(teamDoc(aTeam("team-a", "A"))).getBytes(StandardCharsets.UTF_8)
      )

      (kindResult(deployCall("cat-file", "_deploy"), "team") \ "deleted").as[Int] mustBe 1
      getTeam("team-a").status mustBe 200
      getTeam("team-b").status mustBe 404
    }

    "not write anything in dry-run (_test)" in {
      val path = writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      setupEnvBlocking(
        tenants = Seq(tenant.copy(remoteCatalogs = Seq(fileCatalog("cat-file", path)))),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription)
      )

      val test = deployCall("cat-file", "_test")
      test.status mustBe 200
      (kindResult(test, "team") \ "created").as[Int] mustBe 1
      getTeam("team-weather").status mustBe 404
    }

    "undeploy managed entities" in {
      val path = writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      setupEnvBlocking(
        tenants = Seq(tenant.copy(remoteCatalogs = Seq(fileCatalog("cat-file", path)))),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription)
      )

      deployCall("cat-file", "_deploy").status mustBe 200
      getTeam("team-weather").status mustBe 200

      deployCall("cat-file", "_undeploy").status mustBe 200
      getTeam("team-weather").status mustBe 404
    }

    "preserve runtime social fields (stars/issues/posts/issuesTags) on API update" in {
      val withPlans = defaultApi
      val baseApi   = withPlans.api.copy(
        team = defaultAdminTeam.id,
        stars = 5,
        issues = Seq(ApiIssueId("issue-1")),
        posts = Seq(ApiPostId("post-1")),
        issuesTags = Set(ApiIssueTag(ApiIssueTagId("tag-1"), "bug", "#ff0000"))
      )

      // ce que sert le catalog : même API (matchée par _id) mais social vidé + un champ non-social modifié
      val incoming = baseApi
        .copy(
          name = "Renamed by catalog",
          stars = 0,
          issues = Seq.empty,
          posts = Seq.empty,
          issuesTags = Set.empty
        )
        .asJson
        .as[JsObject] ++ Json.obj("kind" -> "api")

      val path    = writeFile(Json.stringify(incoming))
      val catalog = RemoteCatalog(
        id = "cat-api",
        name = "api catalog",
        source = RemoteCatalogSource(kind = "file", config = Json.obj("path" -> path)),
        scheduling = RemoteCatalogScheduling(),
        allowedKinds = Set("api")
      )

      setupEnvBlocking(
        tenants = Seq(tenant.copy(remoteCatalogs = Seq(catalog))),
        teams = Seq(defaultAdminTeam),
        apis = Seq(baseApi),
        usagePlans = withPlans.plans,
        subscriptions = Seq(adminApiSubscription)
      )

      val deploy = deployCall("cat-api", "_deploy")
      deploy.status mustBe 200
      // un champ non-social a changé → c'est bien un update, pas un "unchanged"
      (kindResult(deploy, "api") \ "updated").as[Int] mustBe 1

      val get = getApi(baseApi.id.value)
      get.status mustBe 200
      (get.json \ "name").as[String] mustBe "Renamed by catalog" // le full-replace s'applique aux champs non protégés
      (get.json \ "stars").as[Int] mustBe 5                       // social préservé
      (get.json \ "issues").as[Seq[String]] mustBe Seq("issue-1")
      (get.json \ "posts").as[Seq[String]] mustBe Seq("post-1")
      (get.json \ "issuesTags").as[JsArray].value.size mustBe 1
    }
  }
}
