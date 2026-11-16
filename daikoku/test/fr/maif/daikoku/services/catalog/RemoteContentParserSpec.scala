package fr.maif.daikoku.services.catalog

import org.scalatest.EitherValues
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.Json

/** Pure unit coverage for [[RemoteContentParser]] / [[RemoteEntity]]: no DB, no
  * Docker. What is proven here is the content indirection every catalog source
  * relies on: raw JSON/YAML → RemoteEntity, in both flat and kube styles.
  */
class RemoteContentParserSpec extends PlaySpec with EitherValues {

  "RemoteContentParser" should {

    "parse a flat JSON object into a single entity" in {
      val raw = """{"kind":"team","_id":"team-a","name":"A"}"""

      val entities = RemoteContentParser.parseRawContent(raw, "src").value
      entities.map(e => (e.id, e.kind, e.source)) mustBe Seq(
        ("team-a", "team", "src")
      )
      (entities.head.content \ "name").as[String] mustBe "A"
    }

    "parse a JSON array of entities" in {
      val raw =
        """[
          |  {"kind":"team","_id":"team-a"},
          |  {"kind":"api","_id":"api-1"}
          |]""".stripMargin

      val entities = RemoteContentParser.parseRawContent(raw, "src").value
      entities.map(_.id) mustBe Seq("team-a", "api-1")
    }

    "reject a JSON array holding a non-object or a non-entity element, reporting every error" in {
      val raw =
        """[
          |  {"kind":"team","_id":"team-a"},
          |  "junk",
          |  42,
          |  {"name":"no kind nor id"},
          |  {"kind":"api","_id":"api-1"}
          |]""".stripMargin

      val errors = RemoteContentParser.parseRawContent(raw, "src").left.value
      errors.map(_.source).distinct mustBe Seq("src")
      errors.map(_.message) mustBe Seq(
        "element 2: expected an object",
        "element 3: expected an object",
        "Missing required field '_id'",
        "Missing required field 'kind'"
      )
    }

    "parse a kube-style JSON document from its spec" in {
      val raw =
        """{
          |  "apiVersion": "daikoku.io/v1",
          |  "kind": "team",
          |  "spec": {"_id": "team-a", "name": "A"}
          |}""".stripMargin

      val entities = RemoteContentParser.parseRawContent(raw, "src").value
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
      RemoteContentParser.parse(namespaced, "src").value.map(_.kind) mustBe Seq(
        "daikoku/team"
      )

      // an unrelated spec.kind does not override the outer kind
      val unrelated = Json.obj(
        "apiVersion" -> "daikoku.io/v1",
        "kind" -> "team",
        "spec" -> Json.obj("_id" -> "team-a", "kind" -> "api")
      )
      RemoteContentParser.parse(unrelated, "src").value.map(_.kind) mustBe Seq(
        "team"
      )
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

      val entities = RemoteContentParser.parseRawContent(yaml, "test").value
      entities.map(_.kind) mustBe Seq("team", "usage-plan", "cms-page")
      entities.map(_.id) mustBe Seq("team-weather", "plan-free", "page-home")
    }

    "skip the empty and comment-only documents of a multi-doc YAML" in {
      val yaml =
        """kind: team
          |_id: team-a
          |---
          |
          |---
          |# only a comment
          |---
          |kind: team
          |_id: team-b
          |""".stripMargin

      val entities = RemoteContentParser.parseRawContent(yaml, "test").value
      entities.map(_.id) mustBe Seq("team-a", "team-b")
    }

    "reject a whole multi-doc YAML when one document is invalid, naming the document" in {
      val yaml =
        """kind: team
          |_id: team-a
          |---
          |just a plain scalar
          |---
          |kind: team
          |name: no id
          |""".stripMargin

      val errors = RemoteContentParser.parseRawContent(yaml, "test").left.value
      errors.map(_.source).distinct mustBe Seq("test")
      errors.map(_.message) mustBe Seq(
        "document 2: Unsupported content: expected an object or an array of objects",
        "document 3: Missing required field '_id'"
      )
    }

    "reject a broken YAML" in {
      val yaml =
        """kind: team
          |_id: "unterminated
          |""".stripMargin

      val errors = RemoteContentParser.parseRawContent(yaml, "test").left.value
      errors.map(_.message) mustBe Seq(
        "document 1: Cannot parse as JSON or YAML"
      )
    }

    "reject content that is neither a JSON nor a YAML entity" in {
      val errors = RemoteContentParser
        .parseRawContent("just a plain scalar", "test")
        .left
        .value

      errors.map(_.message) mustBe Seq(
        "document 1: Unsupported content: expected an object or an array of objects"
      )
    }
  }
}
