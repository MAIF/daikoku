package fr.maif.daikoku.services.catalog.sources

import org.scalatest.{EitherValues, OptionValues}
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.{JsArray, JsValue, Json}

import scala.concurrent.duration.*
import scala.concurrent.{Await, ExecutionContext, Future}

/** Pure unit coverage for [[SourceUtils]]: no DB, no Docker, no network. The
  * listing indirection is exercised through the injectable `fetch` lambda, so
  * the github/gitlab/http fetch loop is proven without any real backend.
  */
class SourceUtilsSpec extends PlaySpec with OptionValues with EitherValues {

  private implicit val ec: ExecutionContext = ExecutionContext.global

  private def teamJson(id: String): String =
    Json.stringify(Json.obj("kind" -> "team", "_id" -> id))

  private def resolve(
      listing: JsArray,
      fetch: String => Future[Either[JsValue, String]],
      resolveGlob: Option[String => Future[Either[JsValue, Seq[String]]]] = None
  ) =
    Await.result(
      SourceUtils.resolveDeployListing(listing, fetch, "src", resolveGlob),
      10.seconds
    )

  "isDeployListing" should {

    "accept a plain JSON array of paths" in {
      val arr = SourceUtils.isDeployListing("""["a.json", "b.yaml"]""").value
      arr.value.map(_.as[String]) mustBe Seq("a.json", "b.yaml")
    }

    "accept a kube-style RemoteCatalogListing, in JSON and in YAML" in {
      val json =
        """{
          |  "apiVersion": "daikoku.io/v1",
          |  "kind": "RemoteCatalogListing",
          |  "spec": {"catalog_listing": ["teams/a.json", "apis/*.yaml"]}
          |}""".stripMargin
      SourceUtils.isDeployListing(json).value.value.size mustBe 2

      val yaml =
        """apiVersion: daikoku.io/v1
          |kind: RemoteCatalogListing
          |spec:
          |  catalog_listing:
          |    - teams/a.json
          |    - apis/*.yaml
          |""".stripMargin
      SourceUtils.isDeployListing(yaml).value.value.size mustBe 2
    }

    "reject anything else" in {
      // a regular entity is content, not a listing
      SourceUtils.isDeployListing("""{"kind":"team","_id":"a"}""") mustBe None
      // an empty or non-string array cannot be a listing
      SourceUtils.isDeployListing("""[]""") mustBe None
      SourceUtils.isDeployListing("""[1, 2]""") mustBe None
      // a listing-shaped doc with the wrong apiVersion is not trusted
      SourceUtils.isDeployListing(
        """{"apiVersion":"other/v1","kind":"RemoteCatalogListing","spec":{"catalog_listing":["a.json"]}}"""
      ) mustBe None
    }
  }

  "resolveDeployListing" should {

    "fetch every listed path and aggregate the parsed entities" in {
      val contents = Map(
        "a.json" -> teamJson("team-a"),
        "b.json" -> teamJson("team-b")
      )
      val result = resolve(
        Json.arr("a.json", "b.json"),
        path => Future.successful(Right(contents(path)))
      )

      val entities = result.value
      entities.map(_.id) mustBe Seq("team-a", "team-b")
      entities.map(_.source) mustBe Seq("src/a.json", "src/b.json")
    }

    "skip a path whose fetch fails and keep the others" in {
      val result = resolve(
        Json.arr("a.json", "missing.json"),
        {
          case "a.json" => Future.successful(Right(teamJson("team-a")))
          case _        => Future.successful(Left(Json.obj("error" -> "404")))
        }
      )

      result.value.map(_.id) mustBe Seq("team-a")
    }

    "expand glob entries through the injected glob resolver" in {
      val contents = Map(
        "teams/a.json" -> teamJson("team-a"),
        "teams/b.json" -> teamJson("team-b")
      )
      val result = resolve(
        Json.arr("teams/*.json"),
        path => Future.successful(Right(contents(path))),
        resolveGlob = Some(_ => Future.successful(Right(Seq("teams/a.json", "teams/b.json"))))
      )

      result.value.map(_.id) mustBe Seq("team-a", "team-b")
    }

    "treat a glob entry as a literal path when no glob resolver is given" in {
      var fetched = Seq.empty[String]
      val result = resolve(
        Json.arr("teams/*.json"),
        path => {
          fetched = fetched :+ path
          Future.successful(Left(Json.obj("error" -> "not found")))
        }
      )

      fetched mustBe Seq("teams/*.json")
      result.value mustBe empty
    }
  }

  "glob helpers" should {

    "detect glob patterns" in {
      SourceUtils.isGlobPattern("teams/*.json") mustBe true
      SourceUtils.isGlobPattern("teams/a?.json") mustBe true
      SourceUtils.isGlobPattern("teams/a.json") mustBe false
    }

    "match single-level and recursive globs" in {
      SourceUtils.matchesGlob("teams/a.json", "teams/*.json") mustBe true
      SourceUtils.matchesGlob("teams/sub/a.json", "teams/*.json") mustBe false
      SourceUtils.matchesGlob("teams/sub/a.json", "**/*.json") mustBe true
      SourceUtils.matchesGlob("a.json", "?.json") mustBe true
      SourceUtils.matchesGlob("ab.json", "?.json") mustBe false
    }

    "resolve a remote glob against a listing of files, relative to a base path" in {
      val files = Seq("base/teams/a.json", "base/teams/b.yml", "other/c.json")
      SourceUtils.resolveRemoteGlob(files, "base", "teams/*.json") mustBe Seq("teams/a.json")
      SourceUtils.resolveRemoteGlob(files, "", "**/*.json") mustBe Seq("base/teams/a.json", "other/c.json")
    }

    "recognize entity files and file extensions" in {
      SourceUtils.isEntityFile("a.json") mustBe true
      SourceUtils.isEntityFile("a.yaml") mustBe true
      SourceUtils.isEntityFile("a.yml") mustBe true
      SourceUtils.isEntityFile("a.txt") mustBe false
      SourceUtils.hasFileExtension("dir/file.yaml") mustBe true
      SourceUtils.hasFileExtension("dir/file") mustBe false
    }
  }
}
