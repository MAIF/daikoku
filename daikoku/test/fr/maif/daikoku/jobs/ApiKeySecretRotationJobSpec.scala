package fr.maif.daikoku.jobs

import cats.implicits.catsSyntaxOptionId
import com.dimafeng.testcontainers.GenericContainer.FileSystemBind
import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import org.joda.time.DateTime
import org.scalatest.BeforeAndAfter
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.BindMode
import play.api.libs.json.*

import scala.concurrent.Await
import scala.concurrent.duration.*

/** End to end coverage of the rotation job against a real Otoroshi. The
  * transitions themselves are covered by RotationStateMachineSpec: what is
  * proven here is the wiring, i.e. that the query selects the right keyrings,
  * that the decision is persisted and notified, and that one failing keyring
  * does not stop the run.
  */
class ApiKeySecretRotationJobSpec()
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfter
    with ForAllTestContainer {

  val pwd = System.getProperty("user.dir")

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

  private val currentSecret = "current-secret"
  private val nextSecret = "next-secret"
  private val nextBearer = "next-bearer"

  // ============================================================
  // Helpers
  // ============================================================

  /** An Otoroshi api key with an arbitrary rotation state: this is what lets us
    * drive the whole state machine against a real Otoroshi, without waiting for
    * its own (hour-based) rotation schedule.
    */
  private def otoroshiApk(
      clientId: String,
      clientSecret: String = currentSecret,
      rotation: JsObject
  ): JsValue =
    Json.obj(
      "_loc" -> Json.obj(
        "tenant" -> "default",
        "teams" -> Json.arr("default")
      ),
      "clientId" -> clientId,
      "clientSecret" -> clientSecret,
      "clientName" -> s"daikoku_test_$clientId",
      "description" -> "",
      "authorizedGroup" -> JsNull,
      "authorizedEntities" -> Json.arr(s"route_$parentRouteId"),
      "authorizations" -> Json.arr(
        Json.obj("kind" -> "route", "id" -> parentRouteId)
      ),
      "enabled" -> true,
      "readOnly" -> false,
      "allowClientIdOnly" -> false,
      "throttlingQuota" -> 10000000,
      "dailyQuota" -> 10000000,
      "monthlyQuota" -> 10000000,
      "constrainedServicesOnly" -> false,
      "restrictions" -> Json.obj(
        "enabled" -> false,
        "allowLast" -> true,
        "allowed" -> Json.arr(),
        "forbidden" -> Json.arr(),
        "notFound" -> Json.arr()
      ),
      "rotation" -> rotation,
      "validUntil" -> JsNull,
      "tags" -> Json.arr(),
      "metadata" -> Json.obj()
    )

  /** `bearer` is not seeded: Otoroshi derives it on the fly from the rotation
    * state, it is not something we can impose.
    */
  private def rotationJson(
      enabled: Boolean = true,
      nextSecret: Option[String] = None
  ): JsObject =
    Json.obj(
      "enabled" -> enabled,
      "rotationEvery" -> 744,
      "gracePeriod" -> 168,
      "nextSecret" -> nextSecret
        .map(JsString.apply)
        .getOrElse(JsNull)
        .as[JsValue]
    )

  private def otoroshiNextBearer(clientId: String): Option[String] =
    (getApkFromOtoroshi(clientId) \ "rotation" \ "bearer").asOpt[String]

  private def seedOtoroshi(apks: Seq[JsValue]): Unit =
    Await.result(
      cleanOtoroshiServer(container.mappedPort(8080), apks),
      30.seconds
    )

  private def getApkFromOtoroshi(clientId: String): JsValue =
    httpJsonCallWithoutSessionBlocking(
      path = s"/api/apikeys/$clientId",
      baseUrl = "http://otoroshi-api.oto.tools",
      headers = Map(
        "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
        "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
        "Host" -> "otoroshi-api.oto.tools"
      ),
      port = container.mappedPort(8080)
    )(using tenant).json

  private def triggerRotationJob(): Unit = {
    val session = loginWithBlocking(userAdmin, tenant)
    val resp = httpJsonCallBlocking(
      path = s"/api/jobs/rotation/_sync?key=secret",
      method = "POST",
      body = Json.obj().some
    )(using tenant, session)
    resp.status.mustBe(200)
  }

  private def containerizedTenant(base: Tenant): Tenant =
    base.copy(
      otoroshiSettings = Set(
        OtoroshiSettings(
          id = containerizedOtoroshi,
          url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
          host = "otoroshi-api.oto.tools",
          clientSecret = otoroshiAdminApiKey.clientSecret,
          clientId = otoroshiAdminApiKey.clientId
        )
      )
    )

  private def keyring(
      id: String,
      clientId: String,
      tenantId: TenantId = tenant.id,
      clientSecret: String = currentSecret,
      rotation: Option[ApiSubscriptionRotation] = Some(
        ApiSubscriptionRotation()
      ),
      binding: KeyringOtoroshiBinding =
        KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi)
  ): Keyring =
    Keyring(
      id = KeyringId(id),
      tenant = tenantId,
      team = teamConsumerId,
      apiKey = OtoroshiApiKey(
        clientName = s"daikoku_test_$clientId",
        clientId = clientId,
        clientSecret = clientSecret
      ),
      otoroshiSettings = binding,
      createdAt = DateTime.now(),
      rotation = rotation,
      integrationToken = s"token-$id"
    )

  private def subscriptionFor(
      keyring: Keyring,
      id: String,
      api: Api,
      plan: UsagePlan
  ): ApiSubscription =
    ApiSubscription(
      id = ApiSubscriptionId(id),
      tenant = keyring.tenant,
      keyring = keyring.id,
      plan = plan.id,
      createdAt = DateTime.now(),
      team = teamConsumerId,
      api = api.id,
      by = user.id,
      customName = Some(id)
    )

  private def reloadKeyring(id: KeyringId, tenantId: TenantId): Keyring =
    Await
      .result(
        daikokuComponents.env.dataStore.keyringRepo
          .forTenant(tenantId)
          .findById(id),
        10.seconds
      )
      .get

  private val api = defaultApi.api.copy(
    id = ApiId("rotation-api"),
    name = "rotation API",
    team = teamOwnerId,
    possibleUsagePlans = Seq(UsagePlanId("rotation.plan")),
    defaultUsagePlan = UsagePlanId("rotation.plan").some
  )

  private val plan = UsagePlan(
    id = UsagePlanId("rotation.plan"),
    tenant = tenant.id,
    customName = "dev",
    customDescription = None,
    otoroshiTarget = Some(
      OtoroshiTarget(
        otoroshiSettings = containerizedOtoroshi,
        authorizedEntities = Some(
          AuthorizedEntities(routes = Set(OtoroshiRouteId(parentRouteId)))
        )
      )
    ),
    allowMultipleKeys = Some(false),
    subscriptionProcess = Seq.empty,
    integrationProcess = IntegrationProcess.ApiKey,
    autoRotation = Some(true)
  )

  "ApiKeySecretRotationJob" should {

    "mirror the next credentials without touching the current ones" in {
      val kr = keyring(id = "kr-inflight", clientId = "apk-inflight")
      seedOtoroshi(
        Seq(
          otoroshiApk(
            clientId = "apk-inflight",
            rotation = rotationJson(nextSecret = Some(nextSecret))
          )
        )
      )

      setupEnvBlocking(
        tenants = Seq(containerizedTenant(tenant)),
        users = Seq(tenantAdmin, userAdmin, user),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(api),
        usagePlans = Seq(plan),
        subscriptions = Seq(subscriptionFor(kr, "sub-inflight", api, plan)),
        keyrings = Seq(kr)
      )

      triggerRotationJob()

      val updated = reloadKeyring(kr.id, tenant.id)
      updated.rotation.map(_.pendingRotation) mustBe Some(true)
      updated.rotation.flatMap(_.nextSecret) mustBe Some(nextSecret)
      // Otoroshi derives the bearer itself, we only check it reached the keyring
      updated.rotation.flatMap(_.nextBearer) mustBe defined
      // the current secret stays authoritative for the whole grace period
      updated.apiKey.clientSecret mustBe currentSecret

      val notifications = Await.result(
        daikokuComponents.env.dataStore.notificationRepo
          .forTenant(tenant.id)
          .findAllNotDeleted(),
        10.seconds
      )
      notifications.count(
        _.action.isInstanceOf[NotificationAction.ApiKeyRotationInProgressV2]
      ) mustBe 1
    }

    "not notify again while the rotation stays in flight" in {
      seedOtoroshi(
        Seq(
          otoroshiApk(
            clientId = "apk-inflight",
            rotation = rotationJson(nextSecret = Some(nextSecret))
          )
        )
      )

      // start from a keyring already mirroring exactly what Otoroshi publishes
      val kr = keyring(
        id = "kr-inflight",
        clientId = "apk-inflight",
        rotation = Some(
          ApiSubscriptionRotation(
            pendingRotation = true,
            nextSecret = Some(nextSecret),
            nextBearer = otoroshiNextBearer("apk-inflight")
          )
        )
      )

      setupEnvBlocking(
        tenants = Seq(containerizedTenant(tenant)),
        users = Seq(tenantAdmin, userAdmin, user),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(api),
        usagePlans = Seq(plan),
        subscriptions = Seq(subscriptionFor(kr, "sub-inflight", api, plan)),
        keyrings = Seq(kr)
      )

      triggerRotationJob()

      val notifications = Await.result(
        daikokuComponents.env.dataStore.notificationRepo
          .forTenant(tenant.id)
          .findAllNotDeleted(),
        10.seconds
      )
      notifications.count(
        _.action.isInstanceOf[NotificationAction.ApiKeyRotationInProgressV2]
      ) mustBe 0
    }

    "apply the next credentials when the rotation ends" in {
      val kr = keyring(
        id = "kr-ending",
        clientId = "apk-ending",
        rotation = Some(
          ApiSubscriptionRotation(
            pendingRotation = true,
            nextSecret = Some(nextSecret),
            nextBearer = Some(nextBearer)
          )
        )
      )
      // Otoroshi has switched: no next secret anymore, the new one is current
      seedOtoroshi(
        Seq(
          otoroshiApk(
            clientId = "apk-ending",
            clientSecret = nextSecret,
            rotation = rotationJson(nextSecret = None)
          )
        )
      )

      setupEnvBlocking(
        tenants = Seq(containerizedTenant(tenant)),
        users = Seq(tenantAdmin, userAdmin, user),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(api),
        usagePlans = Seq(plan),
        subscriptions = Seq(subscriptionFor(kr, "sub-ending", api, plan)),
        keyrings = Seq(kr)
      )

      triggerRotationJob()

      val updated = reloadKeyring(kr.id, tenant.id)
      updated.apiKey.clientSecret mustBe nextSecret
      updated.rotation.map(_.pendingRotation) mustBe Some(false)
      updated.rotation.flatMap(_.nextSecret) mustBe None
      updated.rotation.flatMap(_.nextBearer) mustBe None

      val notifications = Await.result(
        daikokuComponents.env.dataStore.notificationRepo
          .forTenant(tenant.id)
          .findAllNotDeleted(),
        10.seconds
      )
      notifications.count(
        _.action.isInstanceOf[NotificationAction.ApiKeyRotationEndedV2]
      ) mustBe 1
    }

    "arm the rotation in Otoroshi when it is only configured in Daikoku" in {
      val kr = keyring(id = "kr-arming", clientId = "apk-arming")
      seedOtoroshi(
        Seq(
          otoroshiApk(
            clientId = "apk-arming",
            rotation = rotationJson(enabled = false)
          )
        )
      )

      setupEnvBlocking(
        tenants = Seq(containerizedTenant(tenant)),
        users = Seq(tenantAdmin, userAdmin, user),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(api),
        usagePlans = Seq(plan),
        subscriptions = Seq(subscriptionFor(kr, "sub-arming", api, plan)),
        keyrings = Seq(kr)
      )

      triggerRotationJob()

      val apk = getApkFromOtoroshi("apk-arming")
      (apk \ "rotation" \ "enabled").as[Boolean] mustBe true
    }

    "keep processing the other keyrings when one of them fails" in {
      val broken = keyring(
        id = "kr-broken",
        clientId = "apk-broken",
        binding = KeyringOtoroshiBinding.Otoroshi(
          OtoroshiSettingsId("does-not-exist")
        )
      )
      val healthy = keyring(id = "kr-healthy", clientId = "apk-healthy")

      seedOtoroshi(
        Seq(
          otoroshiApk(
            clientId = "apk-healthy",
            rotation = rotationJson(nextSecret = Some(nextSecret))
          )
        )
      )

      setupEnvBlocking(
        tenants = Seq(containerizedTenant(tenant)),
        users = Seq(tenantAdmin, userAdmin, user),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(api),
        usagePlans = Seq(plan),
        subscriptions = Seq(
          subscriptionFor(broken, "sub-broken", api, plan),
          subscriptionFor(healthy, "sub-healthy", api, plan)
        ),
        keyrings = Seq(broken, healthy)
      )

      triggerRotationJob()

      reloadKeyring(healthy.id, tenant.id).rotation
        .flatMap(_.nextSecret) mustBe Some(nextSecret)
      reloadKeyring(broken.id, tenant.id).rotation
        .map(_.pendingRotation) mustBe Some(false)
    }

    "not touch the keyrings of another tenant" in {
      val mine = keyring(id = "kr-mine", clientId = "apk-mine")
      val other = keyring(
        id = "kr-other",
        clientId = "apk-other",
        tenantId = tenant2.id
      )

      seedOtoroshi(
        Seq(
          otoroshiApk(
            clientId = "apk-mine",
            rotation = rotationJson(nextSecret = Some(nextSecret))
          ),
          otoroshiApk(
            clientId = "apk-other",
            rotation = rotationJson(nextSecret = Some(nextSecret))
          )
        )
      )

      setupEnvBlocking(
        tenants =
          Seq(containerizedTenant(tenant), containerizedTenant(tenant2)),
        users = Seq(tenantAdmin, userAdmin, user),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(api),
        usagePlans = Seq(plan),
        subscriptions = Seq(subscriptionFor(mine, "sub-mine", api, plan)),
        keyrings = Seq(mine, other)
      )

      triggerRotationJob()

      reloadKeyring(mine.id, tenant.id).rotation
        .flatMap(_.nextSecret) mustBe Some(nextSecret)
      reloadKeyring(other.id, tenant2.id).rotation
        .flatMap(_.nextSecret) mustBe None
    }
  }
}
