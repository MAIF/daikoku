package fr.maif.daikoku.controllers

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

import java.util.Base64
import scala.concurrent.duration.*
import scala.concurrent.{Await, ExecutionContext}
import scala.jdk.DurationConverters.*

class AdminApiCascadeSpec
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

  private def dbSubscription(id: ApiSubscriptionId): Option[ApiSubscription] =
    Await.result(
      daikokuComponents.env.dataStore.apiSubscriptionRepo
        .forTenant(tenant)
        .findById(id),
      5.second
    )

  private def triggerSyncJob(session: UserSession): Unit = {
    val resp = httpJsonCallBlocking(
      path = "/api/jobs/otoroshi/_sync?key=secret",
      method = "POST",
      body = Json.obj().some
    )(using containerTenant, session)
    resp.status mustBe 200
  }

  private def otoroshiKeyEnabled(apk: OtoroshiApiKey): Boolean = {
    val resp = httpJsonCallWithoutSessionBlocking(
      path = s"/apis/apim.otoroshi.io/v1/apikeys/${apk.clientId}",
      baseUrl = "http://otoroshi-api.oto.tools",
      headers = Map(
        "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
        "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret
      ),
      port = container.mappedPort(8080),
      hostHeader = "otoroshi-api.oto.tools"
    )(using containerTenant)
    (resp.json \ "enabled").as[Boolean]
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

  private def otoroshiKeyMetadata(clientId: String): Map[String, String] =
    (httpJsonCallWithoutSessionBlocking(
      path = s"/api/apikeys/$clientId",
      baseUrl = "http://otoroshi-api.oto.tools",
      headers = Map(
        "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
        "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
        "Host" -> "otoroshi-api.oto.tools"
      ),
      port = container.mappedPort(8080)
    )(using containerTenant).json \ "metadata")
      .as[JsObject]
      .as[Map[String, String]]

  private val planParent = UsagePlan(
    id = UsagePlanId("parent"),
    tenant = tenant.id,
    customName = "parent",
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

  private val cascadeApi = defaultApi.api.copy(
    state = ApiState.Published,
    possibleUsagePlans = Seq(planParent.id),
    defaultUsagePlan = planParent.id.some,
    documentation = ApiDocumentation(
      id = ApiDocumentationId(IdGenerator.token(10)),
      tenant = tenant.id,
      pages = Seq.empty,
      lastModificationAt = DateTime.now()
    )
  )

  private val cascadeKeyring = Keyring(
    id = KeyringId("keyring-cascade"),
    tenant = tenant.id,
    team = teamConsumerId,
    apiKey = otoroshiApiKey1,
    otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
    createdAt = DateTime.now(),
    integrationToken = "test-cascade"
  )

  private val cascadeSub = ApiSubscription(
    id = ApiSubscriptionId("sub-cascade"),
    tenant = tenant.id,
    plan = planParent.id,
    createdAt = DateTime.now(),
    team = teamConsumerId,
    api = cascadeApi.id,
    by = userTeamAdminId,
    customName = None,
    keyring = cascadeKeyring.id
  )

  private def setupCascadeEnv(): Unit =
    setupEnvBlocking(
      tenants = Seq(containerTenant),
      users = Seq(userAdmin, userApiEditor, user, tenantAdmin),
      teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
      apis = Seq(cascadeApi, adminApi),
      usagePlans = Seq(planParent, adminApiPlan),
      keyrings = Seq(cascadeKeyring, adminApiKeyring),
      subscriptions = Seq(cascadeSub, adminApiSubscription)
    )

  "Admin API cascades" should {
    "block an API through /admin-api and cascade the block to its subscriptions" in {
      Await.result(waitForDaikokuSetup(), 5.second)
      setupCascadeEnv()
      val adminSession = loginWithBlocking(userAdmin, containerTenant)

      triggerSyncJob(adminSession)
      otoroshiKeyEnabled(otoroshiApiKey1) mustBe true

      val blockResp = httpJsonCallWithoutSessionBlocking(
        path = s"/admin-api/apis/${cascadeApi.id.value}",
        method = "PUT",
        headers = getAdminApiHeader(adminApiKeyring),
        body = cascadeApi.copy(state = ApiState.Blocked).asJson.some
      )(using containerTenant)
      blockResp.status mustBe 204

      dbSubscription(cascadeSub.id)
        .map(_.blockedBy) mustBe Some(Set(SubscriptionBlockReason.Lifecycle))
      otoroshiKeyEnabled(otoroshiApiKey1) mustBe false

      val deblockResp = httpJsonCallWithoutSessionBlocking(
        path = s"/admin-api/apis/${cascadeApi.id.value}",
        method = "PUT",
        headers = getAdminApiHeader(adminApiKeyring),
        body = cascadeApi.copy(state = ApiState.Deprecated).asJson.some
      )(using containerTenant)
      deblockResp.status mustBe 204

      dbSubscription(cascadeSub.id).map(_.blockedBy) mustBe Some(Set.empty)
      otoroshiKeyEnabled(otoroshiApiKey1) mustBe true
    }

    "delete a subscription through /admin-api and drain the deletion queue" in {
      Await.result(waitForDaikokuSetup(), 5.second)
      setupCascadeEnv()
      val adminSession = loginWithBlocking(userAdmin, containerTenant)

      triggerSyncJob(adminSession)

      val resp = httpJsonCallWithoutSessionBlocking(
        path = s"/admin-api/subscriptions/${cascadeSub.id.value}",
        method = "DELETE",
        headers = getAdminApiHeader(adminApiKeyring)
      )(using containerTenant)
      resp.status mustBe 200

      def operationsPending() =
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

      org.awaitility.Awaitility.await.atMost(15.seconds.toJava) until { () =>
        dbSubscription(cascadeSub.id).isEmpty
      }
      org.awaitility.Awaitility.await.atMost(15.seconds.toJava) until { () =>
        operationsPending().isEmpty
      }

      dbSubscription(cascadeSub.id) mustBe None
    }

    "delete an API through /admin-api, cascade to its subscriptions and remove the otoroshi key" in {
      Await.result(waitForDaikokuSetup(), 5.second)
      setupCascadeEnv()
      val adminSession = loginWithBlocking(userAdmin, containerTenant)

      triggerSyncJob(adminSession)
      otoroshiKeyStatus(otoroshiApiKey1.clientId) mustBe 200

      val resp = httpJsonCallWithoutSessionBlocking(
        path = s"/admin-api/apis/${cascadeApi.id.value}",
        method = "DELETE",
        headers = getAdminApiHeader(adminApiKeyring)
      )(using containerTenant)
      resp.status mustBe 200

      def operationsPending() =
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

      org.awaitility.Awaitility.await.atMost(15.seconds.toJava) until { () =>
        dbSubscription(cascadeSub.id).isEmpty
      }
      org.awaitility.Awaitility.await.atMost(15.seconds.toJava) until { () =>
        operationsPending().isEmpty
      }

      dbSubscription(cascadeSub.id) mustBe None
      otoroshiKeyStatus(otoroshiApiKey1.clientId) mustBe 404
    }

    "update a usage-plan's apikey metadata through /admin-api and push it to the otoroshi key" in {
      Await.result(waitForDaikokuSetup(), 5.second)
      setupCascadeEnv()
      val adminSession = loginWithBlocking(userAdmin, containerTenant)

      triggerSyncJob(adminSession)

      val updatedPlan = planParent.copy(
        otoroshiTarget = planParent.otoroshiTarget.map(target =>
          target.copy(apikeyCustomization =
            target.apikeyCustomization
              .copy(metadata = Json.obj("region" -> "eu-west"))
          )
        ),
      )

      val resp = httpJsonCallWithoutSessionBlocking(
        path = s"/admin-api/usage-plans/${planParent.id.value}",
        method = "PUT",
        headers = getAdminApiHeader(adminApiKeyring),
        body = updatedPlan.asJson.some
      )(using containerTenant)
      resp.status mustBe 204

      otoroshiKeyMetadata(otoroshiApiKey1.clientId)
        .getOrElse("region", "") mustBe "eu-west"
    }

    "bootstrap admin team and admin api when creating a tenant through /admin-api" in {
      Await.result(waitForDaikokuSetup(), 5.second)
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi),
        usagePlans = Seq(adminApiPlan),
        keyrings = Seq(adminApiKeyring),
        subscriptions = Seq(adminApiSubscription)
      )

      val newTenant = tenant.copy(
        id = TenantId("bootstrapped"),
        name = "bootstrapped",
        domain = "http://bootstrapped.daikoku.io"
      )

      val resp = httpJsonCallWithoutSessionBlocking(
        path = "/admin-api/tenants",
        method = "POST",
        headers = getAdminApiHeader(adminApiKeyring),
        body = newTenant.asJson.some
      )(using tenant)
      resp.status mustBe 201

      val adminTeam = Await.result(
        daikokuComponents.env.dataStore.teamRepo
          .forTenant(newTenant.id)
          .findOneNotDeleted(Json.obj("type" -> TeamType.Admin.name)),
        5.second
      )
      adminTeam.isDefined mustBe true

      val adminApiForTenant = Await.result(
        daikokuComponents.env.dataStore.apiRepo
          .forTenant(newTenant.id)
          .findOneNotDeleted(
            Json.obj("visibility" -> ApiVisibility.AdminOnly.name)
          ),
        5.second
      )
      adminApiForTenant.isDefined mustBe true
    }
  }
}
