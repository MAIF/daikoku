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
    Await.result(
      daikokuComponents.env.dataStore.JobInformationRepo
        .forAllTenant()
        .deleteAll(),
      10.seconds
    )
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
      aggregationApiKeysSecurity = true.some
    )

  private def cascadeCatalog: RemoteCatalog =
    RemoteCatalog(
      id = RemoteCatalogId(catalogId),
      tenant = tenant.id,
      name = "cascade catalog",
      source = RemoteCatalogSource(
        kind = "file",
        config = Json.obj("path" -> sourceFilePath)
      ),
      scheduling = RemoteCatalogScheduling(enabled = true),
      allowedKinds = Set("api", "usage-plan")
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

  private def otoroshiKey(clientId: String): WSResponse =
    httpJsonCallWithoutSessionBlocking(
      path = s"/api/apikeys/$clientId",
      baseUrl = "http://otoroshi-api.oto.tools",
      headers = Map(
        "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
        "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
        "Host" -> "otoroshi-api.oto.tools"
      ),
      port = container.mappedPort(8080)
    )(using containerTenant)

  private def otoroshiKeyStatus(clientId: String): Int =
    otoroshiKey(clientId).status

  private def undeploy(): WSResponse =
    httpJsonCallWithoutSessionBlocking(
      path = s"/admin-api/remote-catalogs/$catalogId/_undeploy",
      method = "POST",
      headers = getAdminApiHeader(adminApiKeyring),
      body = Json.obj().some
    )(using containerTenant)

  private def keyringCatalog: RemoteCatalog =
    cascadeCatalog.copy(
      id = RemoteCatalogId("cat-keyring"),
      name = "keyring catalog",
      allowedKinds = Set("keyring", "api-subscription")
    )

  private def deploy(catalog: RemoteCatalog): WSResponse =
    httpJsonCallWithoutSessionBlocking(
      path = s"/admin-api/remote-catalogs/${catalog.id.value}/_deploy",
      method = "POST",
      headers = getAdminApiHeader(adminApiKeyring),
      body = Json.obj().some
    )(using containerTenant)

  // e.g. keyring-from-catalog bound to the Otoroshi of the container, and sub-from-catalog on it
  private def keyringWithSubscription(apiKey: OtoroshiApiKey): JsArray = {
    val keyring = catalogKeyring.copy(
      id = KeyringId("keyring-from-catalog"),
      apiKey = apiKey
    )
    val subscription = catalogSub.copy(
      id = ApiSubscriptionId("sub-from-catalog"),
      keyring = keyring.id
    )

    Json.arr(
      keyring.asJson.as[JsObject] ++ Json.obj("kind" -> "keyring"),
      subscription.asJson.as[JsObject] ++ Json.obj("kind" -> "api-subscription")
    )
  }

  private def dbSubscription(id: ApiSubscriptionId): Option[ApiSubscription] =
    Await.result(
      daikokuComponents.env.dataStore.apiSubscriptionRepo
        .forTenant(tenant)
        .findById(id),
      5.second
    )

  private def dbKeyring(id: KeyringId): Option[Keyring] =
    Await.result(
      daikokuComponents.env.dataStore.keyringRepo
        .forTenant(tenant)
        .findById(id),
      5.second
    )

  private def operationsPending() =
    Await.result(
      daikokuComponents.env.dataStore.operationRepo
        .findPending(tenant.id),
      5.second
    )

  private def setupKeyringCatalog(): UserSession = {
    Await.result(waitForDaikokuSetup(), 5.second)
    setupEnvBlocking(
      tenants = Seq(containerTenant),
      users = Seq(userAdmin, userApiEditor, user, tenantAdmin),
      teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
      apis = Seq(managedApi, adminApi),
      usagePlans = Seq(catalogPlan, adminApiPlan),
      keyrings = Seq(adminApiKeyring),
      subscriptions = Seq(adminApiSubscription),
      remoteCatalogs = Seq(keyringCatalog)
    )

    loginWithBlocking(userAdmin, containerTenant)
  }

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
        subscriptions = Seq(catalogSub, adminApiSubscription),
        remoteCatalogs = Seq(cascadeCatalog)
      )
      val adminSession = loginWithBlocking(userAdmin, containerTenant)

      triggerSyncJob(adminSession)
      otoroshiKeyStatus(otoroshiApiKey1.clientId) mustBe 200

      val resp = undeploy()
      withClue(resp.body) {
        resp.status mustBe 200
      }

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

    "deploy a keyring unknown to Otoroshi and its subscription without creating the key" in {
      val unknownKey = OtoroshiApiKey(
        clientName = "unknown-to-otoroshi",
        clientId = "unknown-client-id",
        clientSecret = "unknown-client-secret"
      )
      writeSource(Json.stringify(keyringWithSubscription(unknownKey)))
      val session = setupKeyringCatalog()

      val run = deploy(keyringCatalog)
      withClue(run.body) {
        run.status mustBe 200
      }
      (run.json \ "status").as[String] mustBe "completed"
      (run.json \ "errors").as[Seq[JsObject]] mustBe empty

      dbKeyring(KeyringId("keyring-from-catalog")) mustBe defined
      dbSubscription(ApiSubscriptionId("sub-from-catalog")) mustBe defined

      triggerSyncJob(session)
      otoroshiKeyStatus(unknownKey.clientId) mustBe 404
    }

    "deploy a keyring known to Otoroshi and its subscription, then sync the plan routes on its key" in {
      writeSource(Json.stringify(keyringWithSubscription(otoroshiApiKey2)))
      val session = setupKeyringCatalog()

      val run = deploy(keyringCatalog)
      withClue(run.body) {
        run.status mustBe 200
      }
      (run.json \ "status").as[String] mustBe "completed"

      triggerSyncJob(session)

      val key = otoroshiKey(otoroshiApiKey2.clientId)
      key.status mustBe 200
      (key.json \ "authorizedEntities").as[Seq[String]] mustBe Seq(
        s"route_$parentRouteId"
      )
    }
  }
}
