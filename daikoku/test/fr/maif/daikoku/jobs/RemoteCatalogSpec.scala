package fr.maif.daikoku.jobs

import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import org.scalatest.concurrent.{Eventually, IntegrationPatience}
import org.joda.time.DateTime
import org.scalatest.{BeforeAndAfter, BeforeAndAfterEach, OptionValues}
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.{JsArray, JsObject, Json}
import play.api.libs.ws.WSResponse

import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.util.Base64
import scala.concurrent.duration.*
import scala.concurrent.Await

class RemoteCatalogSpec
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with Eventually
    with OptionValues
    with BeforeAndAfter {

  private def job = daikokuComponents.remoteCatalogJob

  before {
    setupEnvBlocking(tenants = Seq(tenant))
    // flush() does not touch JobInformation, so we reset it ourselves.
    Await.result(
      daikokuComponents.env.dataStore.JobInformationRepo
        .forAllTenant()
        .deleteAll(),
      10.seconds
    )
  }

  def getAdminApiHeader(adminApiKeyring: Keyring): Map[String, String] =
    Map("Authorization" -> s"Basic ${Base64.getEncoder.encodeToString(
        s"${adminApiKeyring.apiKey.clientId}:${adminApiKeyring.apiKey.clientSecret}".getBytes()
      )}")

  private def jobRepo =
    daikokuComponents.env.dataStore.JobInformationRepo.forTenant(tenant.id)

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
      source =
        RemoteCatalogSource(kind = "file", config = Json.obj("path" -> path)),
      scheduling = RemoteCatalogScheduling(enabled = true),
      allowedKinds = Set("team")
    )

  private def runNow(t: Tenant, runBy: Runner = Runner.Scheduler): JobOutcome =
    Await.result(job.run(t, runBy), 15.seconds)

  private def reload(): Option[JobInformation] =
    Await.result(
      jobRepo.findById(
        DatastoreId(s"${JobName.RemoteCatalog.value}-${tenant.id.value}")
      ),
      10.seconds
    )

  private def teamRepo =
    daikokuComponents.env.dataStore.teamRepo.forTenant(tenant.id)

  private def loadTeam(id: String): Option[Team] =
    Await.result(teamRepo.findByIdNotDeleted(id), 10.seconds)

  private def outcomeName(o: JobOutcome): String = o match {
    case _: JobOutcome.Skipped            => "skipped"
    case _: JobOutcome.Completed          => "completed"
    case _: JobOutcome.PartiallyCompleted => "partial"
    case _: JobOutcome.Failed             => "failed"
  }

  private def rewriteFile(path: String, content: String): Unit =
    Files.write(
      java.nio.file.Paths.get(path),
      content.getBytes(StandardCharsets.UTF_8)
    )

  private def seedRunningJob(): Unit =
    Await.result(
      jobRepo.save(
        JobInformation(
          id =
            DatastoreId(s"${JobName.RemoteCatalog.value}-${tenant.id.value}"),
          tenant = tenant.id,
          jobName = JobName.RemoteCatalog,
          lockedBy = "seed",
          lockedAt = DateTime.now(),
          expiresAt = DateTime.now().plusMinutes(5),
          cursor = 0,
          startedAt = DateTime.now(),
          lastBatchAt = DateTime.now(),
          status = JobStatus.Running
        )
      ),
      10.seconds
    )

  private def deployCall(catalogId: String, action: String): WSResponse =
    httpJsonCallWithoutSessionBlocking(
      path = s"/admin-api/remote-catalogs/$catalogId/$action",
      method = "POST",
      headers = getAdminApiHeader(adminApiKeyring),
      body = Json.obj().some
    )(using tenant)

  private def getTeam(id: String): WSResponse =
    httpJsonCallWithoutSessionBlocking(
      path = s"/admin-api/teams/$id",
      method = "GET",
      headers = getAdminApiHeader(adminApiKeyring)
    )(using tenant)

  private def getApi(id: String): WSResponse =
    httpJsonCallWithoutSessionBlocking(
      path = s"/admin-api/apis/$id",
      method = "GET",
      headers = getAdminApiHeader(adminApiKeyring)
    )(using tenant)

  private def kindResult(resp: WSResponse, kind: String): JsObject =
    (resp.json \ "results")
      .as[JsArray]
      .value
      .map(_.as[JsObject])
      .find(r => (r \ "kind").as[String] == kind)
      .get

  // RemoteContentParser coverage lives in the pure unit spec
  // fr.maif.daikoku.services.catalog.RemoteContentParserSpec (no DB needed).

  "Remote catalog (file source)" should {
    "deploy a team and tag it with created_by" in {
      val path =
        writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      setupEnvBlocking(
        tenants =
          Seq(tenant.copy(remoteCatalogs = Seq(fileCatalog("cat-file", path)))),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring)
      )

      val deploy = deployCall("cat-file", "_deploy")
      deploy.status mustBe 200
      (kindResult(deploy, "team") \ "created").as[Int] mustBe 1

      val get = getTeam("team-weather")
      get.status mustBe 200
      (get.json \ "metadata" \ "created_by")
        .as[String] mustBe "remote_catalog=cat-file"
    }

    "be idempotent: re-deploying identical content changes nothing" in {
      val path =
        writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      setupEnvBlocking(
        tenants =
          Seq(tenant.copy(remoteCatalogs = Seq(fileCatalog("cat-file", path)))),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring)
      )

      (kindResult(deployCall("cat-file", "_deploy"), "team") \ "created")
        .as[Int] mustBe 1
      val second = kindResult(deployCall("cat-file", "_deploy"), "team")
      (second \ "created").as[Int] mustBe 0
      (second \ "updated").as[Int] mustBe 0
    }

    "update only when content actually changes" in {
      val path =
        writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      setupEnvBlocking(
        tenants =
          Seq(tenant.copy(remoteCatalogs = Seq(fileCatalog("cat-file", path)))),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring)
      )

      deployCall("cat-file", "_deploy").status mustBe 200
      Files.write(
        java.nio.file.Paths.get(path),
        Json
          .stringify(teamDoc(aTeam("team-weather", "Weather Renamed")))
          .getBytes(StandardCharsets.UTF_8)
      )
      (kindResult(deployCall("cat-file", "_deploy"), "team") \ "updated")
        .as[Int] mustBe 1
    }

    "delete orphans removed from the source" in {
      val path = writeFile(
        Json.stringify(
          JsArray(
            Seq(teamDoc(aTeam("team-a", "A")), teamDoc(aTeam("team-b", "B")))
          )
        )
      )
      setupEnvBlocking(
        tenants =
          Seq(tenant.copy(remoteCatalogs = Seq(fileCatalog("cat-file", path)))),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring)
      )

      (kindResult(deployCall("cat-file", "_deploy"), "team") \ "created")
        .as[Int] mustBe 2

      Files.write(
        java.nio.file.Paths.get(path),
        Json
          .stringify(teamDoc(aTeam("team-a", "A")))
          .getBytes(StandardCharsets.UTF_8)
      )

      (kindResult(deployCall("cat-file", "_deploy"), "team") \ "deleted")
        .as[Int] mustBe 1
      getTeam("team-a").status mustBe 200
      getTeam("team-b").status mustBe 404
    }

    "not write anything in dry-run (_test)" in {
      val path =
        writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      setupEnvBlocking(
        tenants =
          Seq(tenant.copy(remoteCatalogs = Seq(fileCatalog("cat-file", path)))),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring)
      )

      val test = deployCall("cat-file", "_test")
      test.status mustBe 200
      (kindResult(test, "team") \ "created").as[Int] mustBe 1
      getTeam("team-weather").status mustBe 404
    }

    "undeploy managed entities" in {
      val path =
        writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      setupEnvBlocking(
        tenants =
          Seq(tenant.copy(remoteCatalogs = Seq(fileCatalog("cat-file", path)))),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring)
      )

      deployCall("cat-file", "_deploy").status mustBe 200
      getTeam("team-weather").status mustBe 200

      deployCall("cat-file", "_undeploy").status mustBe 200
      getTeam("team-weather").status mustBe 404
    }

    "preserve runtime social fields (stars/issues/posts/issuesTags) on API update" in {
      val withPlans = defaultApi
      val baseApi = withPlans.api.copy(
        team = defaultAdminTeam.id,
        stars = 5,
        issues = Seq(ApiIssueId("issue-1")),
        posts = Seq(ApiPostId("post-1")),
        issuesTags = Set(ApiIssueTag(ApiIssueTagId("tag-1"), "bug", "#ff0000"))
      )

      // what the catalog serves: same API (matched by _id) but with social fields blanked + one non-social field changed
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

      val path = writeFile(Json.stringify(incoming))
      val catalog = RemoteCatalog(
        id = "cat-api",
        name = "api catalog",
        source =
          RemoteCatalogSource(kind = "file", config = Json.obj("path" -> path)),
        scheduling = RemoteCatalogScheduling(),
        allowedKinds = Set("api")
      )

      setupEnvBlocking(
        tenants = Seq(tenant.copy(remoteCatalogs = Seq(catalog))),
        teams = Seq(defaultAdminTeam),
        apis = Seq(baseApi),
        usagePlans = withPlans.plans,
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring)
      )

      val deploy = deployCall("cat-api", "_deploy")
      deploy.status mustBe 200
      // a non-social field changed, so this must count as an update, not "unchanged"
      (kindResult(deploy, "api") \ "updated").as[Int] mustBe 1

      val get = getApi(baseApi.id.value)
      get.status mustBe 200
      (get.json \ "name")
        .as[String] mustBe "Renamed by catalog" // full-replace applies to unprotected fields
      (get.json \ "stars").as[Int] mustBe 5 // social fields preserved
      (get.json \ "issues").as[Seq[String]] mustBe Seq("issue-1")
      (get.json \ "posts").as[Seq[String]] mustBe Seq("post-1")
      (get.json \ "issuesTags").as[JsArray].value.size mustBe 1
    }
  }

  "RemoteCatalogJob (scheduler path)" should {

    "sync an enabled file catalog and tag entities with created_by" in {
      val path =
        writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      val t = tenant.copy(remoteCatalogs = Seq(fileCatalog("cat-file", path)))
      setupEnvBlocking(tenants = Seq(t), teams = Seq(defaultAdminTeam))

      outcomeName(runNow(t)) mustBe "completed"

      val team = loadTeam("team-weather").value
      team.metadata.get("created_by") mustBe Some("remote_catalog=cat-file")
      reload().value.status mustBe JobStatus.Completed
    }

    "skip without any DB write when no catalog is enabled" in {
      val path =
        writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      val disabled = fileCatalog("cat-file", path)
        .copy(scheduling = RemoteCatalogScheduling(enabled = false))
      val t = tenant.copy(remoteCatalogs = Seq(disabled))
      setupEnvBlocking(tenants = Seq(t), teams = Seq(defaultAdminTeam))

      outcomeName(runNow(t)) mustBe "skipped"
      // skipReason fires before the claim: not even a JobInformation row is written
      reload() mustBe None
      loadTeam("team-weather") mustBe None
    }

    "treat the source as the truth across runs: orphans are deleted" in {
      val path = writeFile(
        Json.stringify(
          JsArray(
            Seq(teamDoc(aTeam("team-a", "A")), teamDoc(aTeam("team-b", "B")))
          )
        )
      )
      val t = tenant.copy(remoteCatalogs = Seq(fileCatalog("cat-file", path)))
      setupEnvBlocking(tenants = Seq(t), teams = Seq(defaultAdminTeam))

      outcomeName(runNow(t)) mustBe "completed"
      loadTeam("team-a") mustBe defined
      loadTeam("team-b") mustBe defined

      rewriteFile(path, Json.stringify(teamDoc(aTeam("team-a", "A"))))

      outcomeName(runNow(t)) mustBe "completed"
      loadTeam("team-a") mustBe defined
      loadTeam("team-b") mustBe None
    }

    "be idempotent: a second run on an unchanged source leaves the DB as is" in {
      val path =
        writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      val t = tenant.copy(remoteCatalogs = Seq(fileCatalog("cat-file", path)))
      setupEnvBlocking(tenants = Seq(t), teams = Seq(defaultAdminTeam))

      outcomeName(runNow(t)) mustBe "completed"
      val afterFirstRun = loadTeam("team-weather").value.asJson

      outcomeName(runNow(t)) mustBe "completed"
      loadTeam("team-weather").value.asJson mustBe afterFirstRun
    }

    "report a partial completion when one catalog fails but still sync the others" in {
      val okPath = writeFile(Json.stringify(teamDoc(aTeam("team-ok", "Ok"))))
      val t = tenant.copy(remoteCatalogs =
        Seq(
          fileCatalog("cat-ok", okPath),
          fileCatalog("cat-bad", "/nonexistent/daikoku-catalog.json")
        )
      )
      setupEnvBlocking(tenants = Seq(t), teams = Seq(defaultAdminTeam))

      runNow(t) match {
        case JobOutcome.PartiallyCompleted(r) =>
          r.failures.map(_.itemId) mustBe Seq("cat-bad")
        case other => fail(s"expected PartiallyCompleted, got $other")
      }
      loadTeam("team-ok") mustBe defined
      reload().value.status mustBe JobStatus.PartiallyCompleted
    }

    "run on manual trigger (POST /api/jobs/remote-catalog/_sync) with a valid key" in {
      val path =
        writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      val t = tenant.copy(remoteCatalogs = Seq(fileCatalog("cat-file", path)))
      setupEnvBlocking(tenants = Seq(t), teams = Seq(defaultAdminTeam))

      val resp = httpJsonCallWithoutSessionBlocking(
        path = "/api/jobs/remote-catalog/_sync?key=secret",
        method = "POST",
        body = Json.obj().some
      )(using t)

      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true
      loadTeam("team-weather") mustBe defined
      reload().value.status mustBe JobStatus.Completed
    }

    "reject a manual trigger with a wrong key" in {
      val path =
        writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      val t = tenant.copy(remoteCatalogs = Seq(fileCatalog("cat-file", path)))
      setupEnvBlocking(tenants = Seq(t), teams = Seq(defaultAdminTeam))

      val resp = httpJsonCallWithoutSessionBlocking(
        path = "/api/jobs/remote-catalog/_sync?key=sec",
        method = "POST",
        body = Json.obj().some
      )(using t)

      resp.status mustBe 401
      loadTeam("team-weather") mustBe None
      reload() mustBe None
    }

    "skip when another instance holds a valid lock" in {
      val path =
        writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      val t = tenant.copy(remoteCatalogs = Seq(fileCatalog("cat-file", path)))
      setupEnvBlocking(tenants = Seq(t), teams = Seq(defaultAdminTeam))
      seedRunningJob()

      outcomeName(runNow(t)) mustBe "skipped"
      loadTeam("team-weather") mustBe None
    }
  }
}
