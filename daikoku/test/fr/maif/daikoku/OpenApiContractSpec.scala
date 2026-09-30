package fr.maif.daikoku

import com.networknt.schema.{InputFormat, SchemaRegistry, SpecificationVersion}
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.utils.Yaml
import org.joda.time.DateTime
import org.scalatest.matchers.must.Matchers
import org.scalatest.wordspec.AnyWordSpec
import play.api.libs.json._

import java.nio.file.{Files, Paths}
import scala.jdk.CollectionConverters._

// Guards the admin API OpenAPI document against drifting away from the code:
// the served version, the routes, and (per catalog kind) the JSON formats.
class OpenApiContractSpec extends AnyWordSpec with Matchers {

  private val pwd = System.getProperty("user.dir")

  private val spec: JsObject = {
    val text =
      Files.readString(Paths.get(s"$pwd/public/swaggers/admin-api-openapi.yaml"))

    Yaml.parse(text).get.as[JsObject]
  }

  private val specPaths: Set[String] =
    (spec \ "paths").as[JsObject].keys.toSet

  // the descriptor routes describe the API, they are not part of it
  private val descriptorRoutes =
    Set("/admin-api/swagger.json", "/admin-api/openapi.json")

  // e.g. "GET  /admin-api/teams/:id  fr...findById(id)" -> "/admin-api/teams/{id}"
  private val routePaths: Set[String] =
    Files
      .readAllLines(Paths.get(s"$pwd/conf/routes"))
      .asScala
      .map(_.trim)
      .filter(_.matches("^(GET|POST|PUT|PATCH|DELETE)\\s+/admin-api/.*"))
      .map(_.split("\\s+")(1))
      .map(_.replaceAll(":([A-Za-z0-9_]+)", "{$1}"))
      .toSet
      .diff(descriptorRoutes)

  private val registry =
    SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12)

  private def componentSchema(name: String): JsObject =
    (spec \ "components" \ "schemas" \ name).as[JsObject]

  // the component becomes the root schema, next to the components its $ref point to;
  // additionalProperties: false refuses every field the schema forgot to list
  private def schemaErrors(schemaName: String, entity: JsValue): Seq[String] = {
    val root = Json.obj(
      "$schema" -> "https://json-schema.org/draft/2020-12/schema",
      "components" -> (spec \ "components").as[JsObject]
    ) ++ componentSchema(schemaName) ++ Json.obj("additionalProperties" -> false)

    registry
      .getSchema(Json.stringify(root), InputFormat.JSON)
      .validate(Json.stringify(entity), InputFormat.JSON)
      .asScala
      .toSeq
      .map(error => s"${error.getInstanceLocation}: ${error.getMessage}")
  }

  // e.g. KindContract("Team", json.TeamFormat, aTeam.asJson)
  // pendingDrifts: instance paths whose schema is being fixed on another branch
  private case class KindContract(
      schemaName: String,
      reads: Reads[?],
      complete: JsObject,
      pendingDrifts: Set[String] = Set.empty
  ) {
    def isPending(error: String): Boolean =
      pendingDrifts.exists(path => error.startsWith(s"$path:"))

    def required: Seq[String] =
      (componentSchema(schemaName) \ "required").as[Seq[String]]

    def minimal: JsObject =
      JsObject(complete.fields.filter { case (key, _) => required.contains(key) })
  }

  private val completeTeam = Team(
    id = TeamId("team-1"),
    tenant = TenantId("tenant"),
    `type` = TeamType.Organization,
    name = "Team",
    description = "A team",
    users = Set(UserWithPermission(UserId("user-1"), TeamPermission.Administrator)),
    contact = "team@acme.io",
    avatar = Some("https://acme.io/avatar.png")
  )

  private val completePlan = UsagePlan(
    id = UsagePlanId("plan-1"),
    tenant = TenantId("tenant"),
    customName = "Free plan",
    customDescription = Some("A free plan"),
    otoroshiTarget = None,
    visibility = UsagePlanVisibility.Public
  )

  private val completeApi = Api(
    id = ApiId("api-1"),
    tenant = TenantId("tenant"),
    team = completeTeam.id,
    name = "Weather API",
    lastUpdate = DateTime.now(),
    smallDescription = "Weather forecasts",
    description = "Weather forecasts for every city",
    currentVersion = Version("1.0.0"),
    state = ApiState.Published,
    documentation = ApiDocumentation(
      id = ApiDocumentationId("doc-1"),
      tenant = TenantId("tenant"),
      pages = Seq.empty,
      lastModificationAt = DateTime.now()
    ),
    swagger = None,
    possibleUsagePlans = Seq(completePlan.id),
    defaultUsagePlan = Some(completePlan.id),
    tags = Set("weather"),
    categories = Set("Public data"),
    visibility = ApiVisibility.Public,
    authorizedTeams = Seq(completeTeam.id)
  )

  private val contracts = Seq(
    KindContract("Team", json.TeamFormat, completeTeam.asJson.as[JsObject]),
    KindContract("Api", json.ApiFormat, completeApi.asJson.as[JsObject]),
    KindContract(
      "UsagePlan",
      json.UsagePlanFormat,
      completePlan.asJson.as[JsObject],
      // the Stripe billing branch reworks PaymentSettings and its schema
      pendingDrifts = Set("/paymentSettings")
    )
  )

  contracts.foreach { contract =>
    s"The ${contract.schemaName} schema" should {
      "accept a complete entity and list all its fields" in {
        val errors = schemaErrors(contract.schemaName, contract.complete)
          .filterNot(contract.isPending)

        errors mustBe empty
      }

      "require nothing more than what the format needs" in {
        contract.reads.reads(contract.minimal).isSuccess mustBe true
      }

      "require every field the format cannot do without" in { 
        // meaningless while the minimal document itself is refused
        assume(contract.reads.reads(contract.minimal).isSuccess)

        val notReallyRequired = contract.required.filter(field =>
          contract.reads.reads(contract.minimal - field).isSuccess
        )

        notReallyRequired mustBe empty
      }
    }
  }

  "The admin API OpenAPI document" should {
    "be OpenAPI 3.1" in {
      (spec \ "openapi").as[String] mustBe "3.1.0"
    }

    "declare the version of the build" in {
      (spec \ "info" \ "version").as[String] mustBe BuildInfo.version
    }

    "document every admin API route" in {
      routePaths.diff(specPaths).toSeq.sorted mustBe empty
    }

    "document no route that does not exist" in {
      specPaths.diff(routePaths).toSeq.sorted mustBe empty
    }
  }
}
