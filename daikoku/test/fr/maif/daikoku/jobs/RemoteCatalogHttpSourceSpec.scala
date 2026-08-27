package fr.maif.daikoku.jobs

import com.dimafeng.testcontainers.GenericContainer.FileSystemBind
import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import org.scalatest.concurrent.IntegrationPatience
import org.scalatest.{BeforeAndAfter, OptionValues}
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.BindMode
import play.api.libs.json.{JsObject, Json}
import play.api.libs.ws.WSResponse

import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Paths}
import java.util.Base64
import scala.concurrent.Await
import scala.concurrent.duration.*
import java.nio.file.attribute.PosixFilePermissions

/** End-to-end coverage for the `http` catalog source: a static nginx container
  * serves the fixtures, and the run goes through the real `env.wsClient`
  * round-trip — the one thing the file-source specs cannot prove. Entities are
  * read back through the admin-api, so the full write-then-read path is proven.
  */
class RemoteCatalogHttpSourceSpec
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with OptionValues
    with BeforeAndAfter
    with ForAllTestContainer {

  // Bound before the container starts; files written later are still visible
  // through the mount. Rooted in /tmp because macOS Docker Desktop does not
  // share the default java.io.tmpdir (/var/folders/...).

//  private val fixturesDir = Paths.get(getClass.getResource("/remote-catalog-http-fixtures").toURI)
  val pwd = System.getProperty("user.dir")
  private val fixturesDir =
    Paths.get(s"$pwd/test/resources/remote-catalog-http-fixtures")
//  private val fixturesDir =
//    Paths.get("modules/daikoku/src/test/resources/remote-catalog-http-fixtures")
  override val container: GenericContainer = GenericContainer(
    "nginx:1.27-alpine",
    exposedPorts = Seq(80),
    fileSystemBind = Seq(
      FileSystemBind(
        fixturesDir.toAbsolutePath.toString,
        "/usr/share/nginx/html",
        BindMode.READ_ONLY
      )
    )
  )

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

  private def servedFixtureUrl(name: String): String = {
    s"http://localhost:${container.mappedPort(80)}/$name"
  }

  private def httpCatalog(id: String, url: String): RemoteCatalog =
    RemoteCatalog(
      id = id,
      name = "http test catalog",
      source = RemoteCatalogSource(config = Json.obj("url" -> url)),
      scheduling = RemoteCatalogScheduling(enabled = true),
      allowedKinds = Set("team")
    )

  private def teamDoc(id: String, name: String): String =
    Json.stringify(
      Team(
        id = TeamId(id),
        tenant = tenant.id,
        `type` = TeamType.Organization,
        name = name,
        description = "",
        users = Set.empty,
        contact = s"$id@acme.io"
      ).asJson.as[JsObject] ++ Json.obj("kind" -> "team")
    )

  private def syncAndExpectCompleted(t: Tenant): Unit =
    Await.result(job.run(t, Runner.Scheduler), 15.seconds) match {
      case JobOutcome.Completed(r) => r.succeeded mustBe 1
      case other                   => fail(s"expected Completed, got $other")
    }

  private def adminHeader: Map[String, String] =
    Map("Authorization" -> s"Basic ${Base64.getEncoder.encodeToString(
        s"${adminApiKeyring.apiKey.clientId}:${adminApiKeyring.apiKey.clientSecret}".getBytes()
      )}")

  private def getTeam(id: String): WSResponse =
    httpJsonCallWithoutSessionBlocking(
      path = s"/admin-api/teams/$id",
      headers = adminHeader
    )(using tenant)

  "Remote catalog (http source)" should {

    "sync entities served over HTTP through the job" in {
      val url = servedFixtureUrl("catalog.json")

      val t = tenant.copy(remoteCatalogs = Seq(httpCatalog("cat-http", url)))
      setupEnvBlocking(
        tenants = Seq(t),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring)
      )

      syncAndExpectCompleted(t)

      val get = getTeam("team-http")
      get.status mustBe 200
      (get.json \ "name").as[String] mustBe "Http Team"
      (get.json \ "metadata" \ "created_by")
        .as[String] mustBe "remote_catalog=cat-http"
    }

    "re-sync updated content over HTTP and reflect the change" in {
      val v1 =
        servedFixtureUrl("catalog-v1.json")
      val t1 = tenant.copy(remoteCatalogs = Seq(httpCatalog("cat-http", v1)))
      setupEnvBlocking(
        tenants = Seq(t1),
        teams = Seq(defaultAdminTeam),
        subscriptions = Seq(adminApiSubscription),
        keyrings = Seq(adminApiKeyring)
      )

      syncAndExpectCompleted(t1)
      (getTeam("team-http").json \ "name").as[String] mustBe "Http Team"

      // A fresh file (not an in-place overwrite) served at a new URL: the bind
      // mount would otherwise serve stale content on Docker Desktop. The catalog
      // id is unchanged, so the same team is matched and updated, not recreated.
      // job.run reads the catalog off the passed tenant, so no DB re-seed needed.
      val v2 = servedFixtureUrl("catalog-v2.json")
      val t2 = tenant.copy(remoteCatalogs = Seq(httpCatalog("cat-http", v2)))

      syncAndExpectCompleted(t2)
      (getTeam("team-http").json \ "name").as[String] mustBe "Http Team Renamed"
    }
  }
}
