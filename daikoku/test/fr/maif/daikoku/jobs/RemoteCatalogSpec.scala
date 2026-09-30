package fr.maif.daikoku.jobs

import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.services.CmsPage
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

  private def planDoc(p: UsagePlan): JsObject =
    p.asJson.as[JsObject] ++ Json.obj("kind" -> "usage-plan")

  private def apiDoc(a: Api): JsObject =
    a.asJson.as[JsObject] ++ Json.obj("kind" -> "api")

  private def cmsPageDoc(p: CmsPage): JsObject =
    p.asJson.as[JsObject] ++ Json.obj("kind" -> "cms-page")

  private val catalogTag = Map("created_by" -> "remote_catalog=cat-file")

  // an api of the admin team exposing a single plan
  private def apiWithOnePlan(version: String): (Api, UsagePlan) = {
    val generated =
      generateApi(version, tenant.id, defaultAdminTeam.id, Seq.empty)
    val plan = generated.plans.head.copy(
      id = UsagePlanId(s"plan-$version"),
      customName = s"plan $version"
    )
    val api = generated.api.copy(
      possibleUsagePlans = Seq(plan.id),
      defaultUsagePlan = Some(plan.id)
    )

    (api, plan)
  }

  private def multiKindCatalog(path: String): RemoteCatalog =
    fileCatalog("cat-file", path).copy(allowedKinds =
      Set("team", "usage-plan", "api", "cms-page")
    )

  private def writeFile(content: String): String = {
    val p = Files.createTempFile("daikoku-catalog", ".json")
    Files.write(p, content.getBytes(StandardCharsets.UTF_8))
    p.toAbsolutePath.toString
  }

  private def writeDir(files: Map[String, String]): java.nio.file.Path = {
    val dir = Files.createTempDirectory("daikoku-catalog")
    files.foreach { case (name, content) =>
      Files.write(dir.resolve(name), content.getBytes(StandardCharsets.UTF_8))
    }
    dir
  }

  private def fileCatalog(id: String, path: String): RemoteCatalog =
    RemoteCatalog(
      id = RemoteCatalogId(id),
      tenant = tenant.id,
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

  private def historyCall(session: UserSession, catalogId: String): WSResponse =
    httpJsonCallBlocking(
      path =
        s"/api/tenants/${tenant.id.value}/remote-catalogs/$catalogId/history"
    )(using tenant, session)

  private def getTeam(id: String): WSResponse =
    httpJsonCallWithoutSessionBlocking(
      path = s"/admin-api/teams/$id?notDeleted=true",
      method = "GET",
      headers = getAdminApiHeader(adminApiKeyring)
    )(using tenant)

  private def getApi(id: String): WSResponse =
    httpJsonCallWithoutSessionBlocking(
      path = s"/admin-api/apis/$id",
      method = "GET",
      headers = getAdminApiHeader(adminApiKeyring)
    )(using tenant)

  private def getPlan(id: String): WSResponse =
    httpJsonCallWithoutSessionBlocking(
      path = s"/admin-api/usage-plans/$id",
      method = "GET",
      headers = getAdminApiHeader(adminApiKeyring)
    )(using tenant)

  private def getCmsPage(id: String): WSResponse =
    httpJsonCallWithoutSessionBlocking(
      path = s"/admin-api/cms-pages/$id",
      method = "GET",
      headers = getAdminApiHeader(adminApiKeyring)
    )(using tenant)

  private def errorMessages(resp: WSResponse): Seq[String] =
    (resp.json \ "errors")
      .as[Seq[JsObject]]
      .map(e => (e \ "message").as[String])

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
        tenants = Seq(tenant),
        remoteCatalogs = Seq(fileCatalog("cat-file", path)),
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
        tenants = Seq(tenant),
        remoteCatalogs = Seq(fileCatalog("cat-file", path)),
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
        tenants = Seq(tenant),
        remoteCatalogs = Seq(fileCatalog("cat-file", path)),
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
        tenants = Seq(tenant),
        remoteCatalogs = Seq(fileCatalog("cat-file", path)),
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

    "apply nothing when one file of the folder is invalid" in {
      val dir = writeDir(
        Map(
          "team-a.json" -> Json.stringify(teamDoc(aTeam("team-a", "A"))),
          "team-b.json" -> Json.stringify(teamDoc(aTeam("team-b", "B")))
        )
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        remoteCatalogs =
          Seq(fileCatalog("cat-file", dir.toAbsolutePath.toString)),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring)
      )

      (kindResult(deployCall("cat-file", "_deploy"), "team") \ "created")
        .as[Int] mustBe 2

      rewriteFile(
        dir.resolve("team-a.json").toString,
        Json.stringify(teamDoc(aTeam("team-a", "A Renamed")))
      )
      rewriteFile(
        dir.resolve("team-b.json").toString,
        Json.stringify(teamDoc(aTeam("team-b", "B")) - "_id")
      )

      val deploy = deployCall("cat-file", "_deploy")
      deploy.status mustBe 400

      val errors = (deploy.json \ "errors").as[Seq[JsObject]]
      errors.map(e => (e \ "message").as[String]) mustBe Seq(
        "Missing required field '_id'"
      )
      (errors.head \ "source").as[String] must endWith("team-b.json")

      getTeam("team-b").status mustBe 200
      (getTeam("team-a").json \ "name").as[String] mustBe "A"
    }

    "resolve a reference to an entity created by the same run, in dry-run" in {
      val (api, plan) = apiWithOnePlan("same-run")
      val path =
        writeFile(Json.stringify(JsArray(Seq(apiDoc(api), planDoc(plan)))))
      setupEnvBlocking(
        tenants = Seq(tenant),
        remoteCatalogs = Seq(multiKindCatalog(path)),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring)
      )

      val test = deployCall("cat-file", "_test")
      test.status mustBe 200
      (test.json \ "created").as[Seq[String]] must contain allOf (
        plan.id.value,
        api.id.value
      )

      getPlan(plan.id.value).status mustBe 404
      getApi(api.id.value).status mustBe 404
    }

    "reject a reference to an entity the run would delete, and apply nothing" in {
      val (api, plan) = apiWithOnePlan("removed-plan")
      val managedApi = api.copy(metadata = catalogTag)
      val managedPlan = plan.copy(metadata = catalogTag)
      val path = writeFile(Json.stringify(apiDoc(managedApi)))
      setupEnvBlocking(
        tenants = Seq(tenant),
        remoteCatalogs = Seq(multiKindCatalog(path)),
        teams = Seq(defaultAdminTeam),
        apis = Seq(managedApi),
        usagePlans = Seq(managedPlan),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring)
      )

      val deploy = deployCall("cat-file", "_deploy")
      deploy.status mustBe 400
      errorMessages(deploy).exists(
        _.contains(s"Usage Plan (${plan.id.value}) not found")
      ) mustBe true

      getPlan(plan.id.value).status mustBe 200
      getApi(api.id.value).status mustBe 200
    }

    "reject an entity that already exists but is not managed by the catalog" in {
      val manual = aTeam("team-manual", "Created by hand")
      val path = writeFile(
        Json.stringify(teamDoc(aTeam("team-manual", "From the catalog")))
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        remoteCatalogs = Seq(fileCatalog("cat-file", path)),
        teams = Seq(defaultAdminTeam, manual),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring)
      )

      val deploy = deployCall("cat-file", "_deploy")
      deploy.status mustBe 400
      errorMessages(deploy).exists(
        _.contains("already exists and is not managed by this catalog")
      ) mustBe true

      (getTeam("team-manual").json \ "name").as[String] mustBe "Created by hand"
    }

    "reject documents without _tenant or with another tenant, and apply nothing" in {
      val path = writeFile(
        Json.stringify(
          JsArray(
            Seq(
              teamDoc(aTeam("team-no-tenant", "No tenant")) - "_tenant",
              teamDoc(aTeam("team-other", "Other")) ++ Json
                .obj("_tenant" -> "another-tenant")
            )
          )
        )
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        remoteCatalogs = Seq(fileCatalog("cat-file", path)),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring)
      )

      val deploy = deployCall("cat-file", "_deploy")
      deploy.status mustBe 400
      errorMessages(deploy) mustBe Seq(
        "team team-no-tenant: missing required field '_tenant'",
        s"team team-other: _tenant 'another-tenant' is not the catalog tenant '${tenant.id.value}'"
      )

      getTeam("team-no-tenant").status mustBe 404
      getTeam("team-other").status mustBe 404
    }

    "keep the document metadata next to created_by" in {
      val team =
        aTeam("team-meta", "Meta").copy(metadata = Map("owner" -> "ops"))
      val path = writeFile(Json.stringify(teamDoc(team)))
      setupEnvBlocking(
        tenants = Seq(tenant),
        remoteCatalogs = Seq(fileCatalog("cat-file", path)),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring)
      )

      deployCall("cat-file", "_deploy").status mustBe 200

      val metadata = (getTeam("team-meta").json \ "metadata").as[JsObject]
      (metadata \ "owner").as[String] mustBe "ops"
      (metadata \ "created_by").as[String] mustBe "remote_catalog=cat-file"
    }

    "keep the text metadata and the catalog tag when a metadata value is not text" in {
      val doc = teamDoc(aTeam("team-meta", "Meta")) ++ Json.obj(
        "metadata" -> Json.obj("owner" -> "ops", "priority" -> 1)
      )
      val path = writeFile(Json.stringify(doc))
      setupEnvBlocking(
        tenants = Seq(tenant),
        remoteCatalogs = Seq(fileCatalog("cat-file", path)),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring)
      )

      deployCall("cat-file", "_deploy").status mustBe 200

      val metadata = (getTeam("team-meta").json \ "metadata").as[JsObject]
      (metadata \ "owner").as[String] mustBe "ops"
      (metadata \ "created_by").as[String] mustBe "remote_catalog=cat-file"
      (metadata \ "priority").toOption mustBe None
    }

    "fail without deleting anything when the run would delete more than maxDeletionPercent" in {
      val teams = (1 to 5).map(i => aTeam(s"team-$i", s"Team $i"))
      val path = writeFile(Json.stringify(JsArray(teams.map(teamDoc))))
      val catalog = fileCatalog("cat-file", path)
      setupEnvBlocking(
        tenants = Seq(tenant),
        remoteCatalogs = Seq(catalog),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring)
      )

      deployCall("cat-file", "_deploy").status mustBe 200
      rewriteFile(path, Json.stringify(JsArray(teams.take(3).map(teamDoc))))

      val blocked = deployCall("cat-file", "_deploy")
      blocked.status mustBe 400
      errorMessages(blocked) mustBe Seq(
        "2 of 5 managed entities would be deleted (40% > 30%): fix the source or raise maxDeletionPercent (-1 for no limit)"
      )
      teams.foreach(team => getTeam(team.id.value).status mustBe 200)

      setupEnvBlocking(
        tenants = Seq(tenant),
        remoteCatalogs = Seq(catalog.copy(maxDeletionPercent = -1)),
        teams = Seq(defaultAdminTeam) ++ teams.map(
          _.copy(metadata = catalogTag)
        ),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring)
      )

      val unlimited = deployCall("cat-file", "_deploy")
      unlimited.status mustBe 200
      (kindResult(unlimited, "team") \ "deleted").as[Int] mustBe 2
      getTeam("team-4").status mustBe 404
      getTeam("team-5").status mustBe 404
    }

    "refuse a pre_command when the instance does not allow it" in {
      val path =
        writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      val withPreCommand = fileCatalog("cat-file", path).copy(source =
        RemoteCatalogSource(
          kind = "file",
          config =
            Json.obj("path" -> path, "pre_command" -> Json.arr("echo", "hi"))
        )
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        remoteCatalogs = Seq(withPreCommand),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring)
      )

      val deploy = deployCall("cat-file", "_deploy")
      deploy.status mustBe 400
      errorMessages(deploy) mustBe Seq(
        "pre_command is disabled on this instance (daikoku.remoteCatalogJob.allowPreCommand)"
      )
      getTeam("team-weather").status mustBe 404
    }

    "delete the managed entities of a kind removed entirely from the source" in {
      val page = defaultCmsPage.copy(id = CmsPageId("page-catalog"))
      val path = writeFile(
        Json.stringify(
          JsArray(Seq(teamDoc(aTeam("team-a", "A")), cmsPageDoc(page)))
        )
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        remoteCatalogs = Seq(multiKindCatalog(path)),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring)
      )

      (kindResult(deployCall("cat-file", "_deploy"), "cms-page") \ "created")
        .as[Int] mustBe 1
      getCmsPage("page-catalog").status mustBe 200

      rewriteFile(path, Json.stringify(teamDoc(aTeam("team-a", "A"))))

      val deploy = deployCall("cat-file", "_deploy")
      deploy.status mustBe 200
      (kindResult(deploy, "cms-page") \ "deleted").as[Int] mustBe 1
      getCmsPage("page-catalog").status mustBe 404
      getTeam("team-a").status mustBe 200
    }

    "not write anything in dry-run (_test)" in {
      val path =
        writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      setupEnvBlocking(
        tenants = Seq(tenant),
        remoteCatalogs = Seq(fileCatalog("cat-file", path)),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring)
      )

      val test = deployCall("cat-file", "_test")
      test.status mustBe 200
      (test.json \ "created").as[Seq[String]] mustBe Seq("team-weather")
      getTeam("team-weather").status mustBe 404
    }

    "undeploy managed entities" in {
      val path =
        writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      setupEnvBlocking(
        tenants = Seq(tenant),
        remoteCatalogs = Seq(fileCatalog("cat-file", path)),
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
        metadata = Map("created_by" -> "remote_catalog=cat-api"),
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
        id = RemoteCatalogId("cat-api"),
        tenant = tenant.id,
        name = "api catalog",
        source =
          RemoteCatalogSource(kind = "file", config = Json.obj("path" -> path)),
        scheduling = RemoteCatalogScheduling(),
        allowedKinds = Set("api")
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        remoteCatalogs = Seq(catalog),
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

  "Remote catalog run history" should {
    "record a completed run with the created ids" in {
      val path =
        writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring),
        remoteCatalogs = Seq(fileCatalog("cat-file", path))
      )
      val session = loginWithBlocking(tenantAdmin, tenant)

      deployCall("cat-file", "_deploy").status mustBe 200

      val runs = historyCall(session, "cat-file").json.as[Seq[JsObject]]
      runs.size mustBe 1
      (runs.head \ "status").as[String] mustBe "completed"
      (runs.head \ "created").as[Seq[String]] mustBe Seq("team-weather")
      (runs.head \ "errors").as[Seq[String]] mustBe empty
    }

    "record a failed run with the file and the message of the error" in {
      val withoutId = teamDoc(aTeam("team-weather", "Weather")) - "_id"
      val path = writeFile(Json.stringify(withoutId))
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring),
        remoteCatalogs = Seq(fileCatalog("cat-file", path))
      )
      val session = loginWithBlocking(tenantAdmin, tenant)

      deployCall("cat-file", "_deploy").status mustBe 400

      val runs = historyCall(session, "cat-file").json.as[Seq[JsObject]]
      runs.size mustBe 1
      (runs.head \ "status").as[String] mustBe "failed"
      (runs.head \ "created").as[Seq[String]] mustBe empty
      val errors = (runs.head \ "errors").as[Seq[String]]
      errors.size mustBe 1
      errors.head must include(path)
      errors.head must include("Missing required field '_id'")
    }

    "keep only the 20 most recent runs, newest first" in {
      val path =
        writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring),
        remoteCatalogs = Seq(fileCatalog("cat-file", path))
      )
      val session = loginWithBlocking(tenantAdmin, tenant)

      deployCall("cat-file", "_deploy").status mustBe 200
      val firstRunId =
        (historyCall(session, "cat-file").json.as[Seq[JsObject]].head \ "_id")
          .as[String]

      (1 to 20).foreach(_ =>
        deployCall("cat-file", "_deploy").status mustBe 200
      )

      val runs = historyCall(session, "cat-file").json.as[Seq[JsObject]]
      val ids = runs.map(run => (run \ "_id").as[String])
      val dates = runs.map(run => (run \ "at").as[Long])
      runs.size mustBe 20
      ids must not contain firstRunId
      dates mustBe dates.sorted.reverse
    }
  }

  "RemoteCatalogJob (scheduler path)" should {

    "sync an enabled file catalog and tag entities with created_by" in {
      val path =
        writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      setupEnvBlocking(
        tenants = Seq(tenant),
        teams = Seq(defaultAdminTeam),
        remoteCatalogs = Seq(fileCatalog("cat-file", path))
      )

      outcomeName(runNow(tenant)) mustBe "completed"

      val team = loadTeam("team-weather").value
      team.metadata.get("created_by") mustBe Some("remote_catalog=cat-file")
      reload().value.status mustBe JobStatus.Completed
    }

    "skip without any DB write when no catalog is enabled" in {
      val path =
        writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      val disabled = fileCatalog("cat-file", path)
        .copy(scheduling = RemoteCatalogScheduling(enabled = false))
      setupEnvBlocking(
        tenants = Seq(tenant),
        teams = Seq(defaultAdminTeam),
        remoteCatalogs = Seq(disabled)
      )

      outcomeName(runNow(tenant)) mustBe "skipped"
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
      setupEnvBlocking(
        tenants = Seq(tenant),
        teams = Seq(defaultAdminTeam),
        remoteCatalogs = Seq(fileCatalog("cat-file", path))
      )

      outcomeName(runNow(tenant)) mustBe "completed"
      loadTeam("team-a") mustBe defined
      loadTeam("team-b") mustBe defined

      rewriteFile(path, Json.stringify(teamDoc(aTeam("team-a", "A"))))

      outcomeName(runNow(tenant)) mustBe "completed"
      loadTeam("team-a") mustBe defined
      loadTeam("team-b") mustBe None
    }

    "be idempotent: a second run on an unchanged source leaves the DB as is" in {
      val path =
        writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      setupEnvBlocking(
        tenants = Seq(tenant),
        teams = Seq(defaultAdminTeam),
        remoteCatalogs = Seq(fileCatalog("cat-file", path))
      )

      outcomeName(runNow(tenant)) mustBe "completed"
      val afterFirstRun = loadTeam("team-weather").value.asJson

      outcomeName(runNow(tenant)) mustBe "completed"
      loadTeam("team-weather").value.asJson mustBe afterFirstRun
    }

    "report a partial completion when one catalog fails but still sync the others" in {
      val okPath = writeFile(Json.stringify(teamDoc(aTeam("team-ok", "Ok"))))
      setupEnvBlocking(
        tenants = Seq(tenant),
        teams = Seq(defaultAdminTeam),
        remoteCatalogs = Seq(
          fileCatalog("cat-ok", okPath),
          fileCatalog("cat-bad", "/nonexistent/daikoku-catalog.json")
        )
      )

      runNow(tenant) match {
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
      setupEnvBlocking(
        tenants = Seq(tenant),
        teams = Seq(defaultAdminTeam),
        remoteCatalogs = Seq(fileCatalog("cat-file", path))
      )

      val resp = httpJsonCallWithoutSessionBlocking(
        path = "/api/jobs/remote-catalog/_sync?key=secret",
        method = "POST",
        body = Json.obj().some
      )(using tenant)

      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true
      loadTeam("team-weather") mustBe defined
      reload().value.status mustBe JobStatus.Completed
    }

    "reject a manual trigger with a wrong key" in {
      val path =
        writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      setupEnvBlocking(
        tenants = Seq(tenant),
        teams = Seq(defaultAdminTeam),
        remoteCatalogs = Seq(fileCatalog("cat-file", path))
      )

      val resp = httpJsonCallWithoutSessionBlocking(
        path = "/api/jobs/remote-catalog/_sync?key=sec",
        method = "POST",
        body = Json.obj().some
      )(using tenant)

      resp.status mustBe 401
      loadTeam("team-weather") mustBe None
      reload() mustBe None
    }

    "skip when another instance holds a valid lock" in {
      val path =
        writeFile(Json.stringify(teamDoc(aTeam("team-weather", "Weather"))))
      setupEnvBlocking(
        tenants = Seq(tenant),
        teams = Seq(defaultAdminTeam),
        remoteCatalogs = Seq(fileCatalog("cat-file", path))
      )
      seedRunningJob()

      outcomeName(runNow(tenant)) mustBe "skipped"
      loadTeam("team-weather") mustBe None
    }
  }
}
