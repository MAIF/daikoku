package fr.maif.daikoku.services.catalog

import org.scalatestplus.play.PlaySpec
import play.api.libs.json.Json

/** Pure unit coverage for [[RemoteContentParser]] / [[RemoteEntity]]: no DB, no
  * Docker. What is proven here is the content indirection every catalog source
  * relies on: raw JSON/YAML → RemoteEntity, in both flat and kube styles.
  */
class RemoteContentParserSpec extends PlaySpec {

  "RemoteContentParser" should {

    "parse a flat JSON object into a single entity" in {
      val raw = """{"kind":"team","_id":"team-a","name":"A"}"""

      val entities = RemoteContentParser.parseRawContent(raw, "src")
      entities.map(e => (e.id, e.kind, e.source)) mustBe Seq(
        ("team-a", "team", "src")
      )
      (entities.head.content \ "name").as[String] mustBe "A"
    }

    "parse a JSON array, skipping non-object and non-entity elements" in {
      val raw =
        """[
          |  {"kind":"team","_id":"team-a"},
          |  "junk",
          |  42,
          |  {"name":"no kind nor id"},
          |  {"kind":"api","_id":"api-1"}
          |]""".stripMargin

      val entities = RemoteContentParser.parseRawContent(raw, "src")
      entities.map(_.id) mustBe Seq("team-a", "api-1")
    }

    "parse a kube-style JSON document from its spec" in {
      val raw =
        """{
          |  "apiVersion": "daikoku.io/v1",
          |  "kind": "team",
          |  "spec": {"_id": "team-a", "name": "A"}
          |}""".stripMargin

      val entities = RemoteContentParser.parseRawContent(raw, "src")
      entities.map(e => (e.id, e.kind)) mustBe Seq(("team-a", "team"))
      // the content is the spec, with the resolved kind injected
      (entities.head.content \ "name").as[String] mustBe "A"
      (entities.head.content \ "kind").as[String] mustBe "team"
    }

    "keep a namespaced spec.kind when it refines the outer kind" in {
      val namespaced = Json.obj(
        "apiVersion" -> "daikoku.io/v1",
        "kind" -> "team",
        "spec" -> Json.obj("_id" -> "team-a", "kind" -> "daikoku/team")
      )
      RemoteContentParser.parse(namespaced, "src").map(_.kind) mustBe Seq(
        "daikoku/team"
      )

      // an unrelated spec.kind does not override the outer kind
      val unrelated = Json.obj(
        "apiVersion" -> "daikoku.io/v1",
        "kind" -> "team",
        "spec" -> Json.obj("_id" -> "team-a", "kind" -> "api")
      )
      RemoteContentParser.parse(unrelated, "src").map(_.kind) mustBe Seq("team")
    }

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

    "keep the valid documents of a multi-doc YAML and drop the rest" in {
      val yaml =
        """kind: team
          |_id: team-a
          |---
          |just a plain scalar
          |---
          |
          |---
          |kind: team
          |_id: team-b
          |""".stripMargin

      RemoteContentParser.parseRawContent(yaml, "test").map(_.id) mustBe Seq(
        "team-a",
        "team-b"
      )
    }

    "ignore content that is neither a JSON nor a YAML entity" in {
      RemoteContentParser.parseRawContent(
        "just a plain scalar",
        "test"
      ) mustBe empty
    }
  }
}
