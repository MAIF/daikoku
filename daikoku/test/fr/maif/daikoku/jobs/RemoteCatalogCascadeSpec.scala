package fr.maif.daikoku.jobs

import cats.implicits.catsSyntaxOptionId
import com.dimafeng.testcontainers.GenericContainer.FileSystemBind
import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import fr.maif.daikoku.utils.IdGenerator
import org.awaitility.scala.AwaitilitySupport
import org.joda.time.DateTime
import org.scalatest.BeforeAndAfter
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.BindMode
import play.api.libs.json.*
import play.api.libs.ws.WSResponse

import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.util.Base64
import scala.concurrent.duration.*
import scala.concurrent.{Await, ExecutionContext}
import scala.jdk.DurationConverters.*

class RemoteCatalogCascadeSpec
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfter
    with ForAllTestContainer
    with AwaitilitySupport {

  val pwd: String = System.getProperty("user.dir")
  implicit val ecc: ExecutionContext =
    daikokuComponents.env.defaultExecutionContext
  implicit val ev: Env = daikokuComponents.env

  override val container: GenericContainer = GenericContainer(
    "maif/otoroshi",
    exposedPorts = Seq(8080),
    fileSystemBind = Seq(
      FileSystemBind(
        s"$pwd/test/fr/maif/daikoku/controllers/otoroshi.json",
        "/home/user/otoroshi.json",
        BindMode.READ_ONLY
      )
    ),
    env = Map("APP_IMPORT_FROM" -> "/home/user/otoroshi.json")
  )

  before {
    Await.result(cleanOtoroshiServer(container.mappedPort(8080)), 5.seconds)
  }

  private val catalogId = "cat-cascade"

  private def getAdminApiHeader(keyring: Keyring): Map[String, String] =
    Map("Authorization" -> s"Basic ${Base64.getEncoder.encodeToString(
        s"${keyring.apiKey.clientId}:${keyring.apiKey.clientSecret}".getBytes()
      )}")

  private def containerTenant: Tenant =
    tenant.copy(
      otoroshiSettings = Set(
        OtoroshiSettings(
          id = containerizedOtoroshi,
          url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
          host = "otoroshi-api.oto.tools",
          clientSecret = otoroshiAdminApiKey.clientSecret,
          clientId = otoroshiAdminApiKey.clientId
        )
      ),
      aggregationApiKeysSecurity = true.some,
      remoteCatalogs = Seq(
        RemoteCatalog(
          id = catalogId,
          name = "cascade catalog",
          source = RemoteCatalogSource(
            kind = "file",
            config = Json.obj("path" -> sourceFilePath)
          ),
          scheduling = RemoteCatalogScheduling(enabled = true),
          allowedKinds = Set("api", "usage-plan")
        )
      )
    )

  private lazy val sourceFilePath: String = {
    val p = Files.createTempFile("daikoku-cascade-catalog", ".json")
    Files.write(p, "[]".getBytes(StandardCharsets.UTF_8))
    p.toAbsolutePath.toString
  }

  private def writeSource(content: String): Unit =
    Files.write(
      java.nio.file.Paths.get(sourceFilePath),
      content.getBytes(StandardCharsets.UTF_8)
    )

  private def planDoc(plan: UsagePlan): JsObject =
    plan.asJson.as[JsObject] ++ Json.obj("kind" -> "usage-plan")

  private val catalogPlan = UsagePlan(
    id = UsagePlanId("cascade-plan"),
    tenant = tenant.id,
    customName = "cascade-plan",
    customDescription = None,
    otoroshiTarget = Some(
      OtoroshiTarget(
        containerizedOtoroshi,
        Some(AuthorizedEntities(routes = Set(OtoroshiRouteId(parentRouteId))))
      )
    ),
    allowMultipleKeys = Some(false),
    subscriptionProcess = SubscriptionProcess(),
    integrationProcess = IntegrationProcess.ApiKey,
    autoRotation = Some(false),
    aggregationApiKeysSecurity = Some(true)
  )

  private val managedApi = defaultApi.api.copy(
    state = ApiState.Published,
    possibleUsagePlans = Seq(catalogPlan.id),
    defaultUsagePlan = catalogPlan.id.some,
    metadata = Map("created_by" -> s"remote_catalog=$catalogId"),
    documentation = ApiDocumentation(
      id = ApiDocumentationId(IdGenerator.token(10)),
      tenant = tenant.id,
      pages = Seq.empty,
      lastModificationAt = DateTime.now()
    )
  )

  private val catalogKeyring = Keyring(
    id = KeyringId("keyring-catalog-cascade"),
    tenant = tenant.id,
    team = teamConsumerId,
    apiKey = otoroshiApiKey1,
    otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
    createdAt = DateTime.now(),
    integrationToken = "test-catalog-cascade",
    customName = "test-keyring"
  )

  private val catalogSub = ApiSubscription(
    id = ApiSubscriptionId("sub-catalog-cascade"),
    tenant = tenant.id,
    plan = catalogPlan.id,
    createdAt = DateTime.now(),
    team = teamConsumerId,
    api = managedApi.id,
    by = userTeamAdminId,
    customName = None,
    keyring = catalogKeyring.id
  )

  private def triggerSyncJob(session: UserSession): Unit = {
    val resp = httpJsonCallBlocking(
      path = "/api/jobs/otoroshi/_sync?key=secret",
      method = "POST",
      body = Json.obj().some
    )(using containerTenant, session)
    resp.status mustBe 200
  }

  private def otoroshiKeyStatus(clientId: String): Int =
    httpJsonCallWithoutSessionBlocking(
      path = s"/api/apikeys/$clientId",
      baseUrl = "http://otoroshi-api.oto.tools",
      headers = Map(
        "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
        "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
        "Host" -> "otoroshi-api.oto.tools"
      ),
      port = container.mappedPort(8080)
    )(using containerTenant).status

  private def undeploy(): WSResponse =
    httpJsonCallWithoutSessionBlocking(
      path = s"/admin-api/remote-catalogs/$catalogId/_undeploy",
      method = "POST",
      headers = getAdminApiHeader(adminApiKeyring),
      body = Json.obj().some
    )(using containerTenant)

  private def dbSubscription(id: ApiSubscriptionId): Option[ApiSubscription] =
    Await.result(
      daikokuComponents.env.dataStore.apiSubscriptionRepo
        .forTenant(tenant)
        .findByIdNotDeleted(id),
      5.second
    )

  private def dbKeyring(id: KeyringId): Option[Keyring] =
    Await.result(
      daikokuComponents.env.dataStore.keyringRepo
        .forTenant(tenant)
        .findByIdNotDeleted(id),
      5.second
    )

  private def operationsPending() =
    Await.result(
      daikokuComponents.env.dataStore.operationRepo
        .forTenant(tenant)
        .find(
          Json.obj(
            "status" -> Json.obj(
              "$in" -> JsArray(
                Seq(
                  JsString(OperationStatus.Idle.name),
                  JsString(OperationStatus.InProgress.name)
                )
              )
            )
          )
        ),
      5.second
    )

  "Remote catalog cascade" should {
    "delete a managed API through _undeploy and cascade to its subscription, keyring and otoroshi key" in {
      Await.result(waitForDaikokuSetup(), 5.second)
      setupEnvBlocking(
        tenants = Seq(containerTenant),
        users = Seq(userAdmin, userApiEditor, user, tenantAdmin),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(managedApi, adminApi),
        usagePlans = Seq(catalogPlan, adminApiPlan),
        keyrings = Seq(catalogKeyring, adminApiKeyring),
        subscriptions = Seq(catalogSub, adminApiSubscription)
      )
      val adminSession = loginWithBlocking(userAdmin, containerTenant)

      triggerSyncJob(adminSession)
      otoroshiKeyStatus(otoroshiApiKey1.clientId) mustBe 200

      val resp = undeploy()
      resp.status mustBe 200

      org.awaitility.Awaitility.await.atMost(20.seconds.toJava) until { () =>
        dbSubscription(catalogSub.id).isEmpty
      }
      org.awaitility.Awaitility.await.atMost(20.seconds.toJava) until { () =>
        operationsPending().isEmpty
      }

      dbSubscription(catalogSub.id) mustBe None
      dbKeyring(catalogKeyring.id) mustBe None
      otoroshiKeyStatus(otoroshiApiKey1.clientId) mustBe 404
    }
  }
}
