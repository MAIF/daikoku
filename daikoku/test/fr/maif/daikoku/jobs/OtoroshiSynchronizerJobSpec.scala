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

class OtoroshiSynchronizerJobSpec
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfter
    with ForAllTestContainer {

  private val pwd = System.getProperty("user.dir")

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

  private def containerizedTenant: Tenant =
    tenant.copy(
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

  private def triggerSyncJob(session: UserSession): Unit = {
    val response = httpJsonCallBlocking(
      path = "/api/jobs/otoroshi/_sync?key=secret",
      method = "POST",
      body = Json.obj().some
    )(using tenant, session)
    response.status mustBe 200
  }

  private def getApikey(clientId: String): JsValue =
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

  private def getApkMetadataFromOtoroshi(
      clientId: String
  ): Map[String, String] =
    (getApikey(clientId) \ "metadata").as[JsObject].as[Map[String, String]]

  "OtoroshiSynchronizerJob" should {
    "create a missing Otoroshi apikey from its active subscription" in {
      val plan = UsagePlan(
        id = UsagePlanId("sync.missing.plan"),
        tenant = tenant.id,
        customName = "sync-missing",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            otoroshiSettings = containerizedOtoroshi,
            authorizedEntities = Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            ),
            apikeyCustomization = ApikeyCustomization(
              metadata = Json.obj("source" -> "active-subscription")
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val api = defaultApi.api.copy(
        id = ApiId("sync-missing-api"),
        name = "sync missing api",
        team = teamOwnerId,
        possibleUsagePlans = Seq(plan.id),
        defaultUsagePlan = Some(plan.id)
      )
      val keyring = Keyring(
        id = KeyringId("sync-missing-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        customName = "sync-missing-keyring",
        integrationToken = "sync-missing-token"
      )
      val subscription = ApiSubscription(
        id = ApiSubscriptionId("sync-missing-subscription"),
        tenant = tenant.id,
        keyring = keyring.id,
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = user.id,
        customName = Some("sync-missing-subscription")
      )

      setupEnvBlocking(
        tenants = Seq(containerizedTenant),
        users = Seq(tenantAdmin, userAdmin, user),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(api),
        usagePlans = Seq(plan),
        subscriptions = Seq(subscription),
        keyrings = Seq(keyring)
      )

      Await.result(
        cleanOtoroshiServer(container.mappedPort(8080), Seq.empty),
        5.seconds
      )
      triggerSyncJob(loginWithBlocking(userAdmin, tenant))

      val createdApikey = getApikey(keyring.apiKey.clientId)
      (createdApikey \ "clientId").as[String] mustBe keyring.apiKey.clientId
      (createdApikey \ "metadata" \ "source").as[String] mustBe
        "active-subscription"
      (createdApikey \ "enabled").as[Boolean] mustBe true

      val jobInfo = Await.result(
        daikokuComponents.env.dataStore.JobInformationRepo
          .forTenant(tenant.id)
          .findById(
            DatastoreId(
              s"${JobName.ApiKeySynchronization.value}-${tenant.id.value}"
            )
          ),
        10.seconds
      )
      jobInfo.map(_.status) mustBe Some(JobStatus.Completed)
      jobInfo.map(_.totalProcessed) mustBe Some(BigDecimal(1))
    }

    "correctly sync customMetadata when all values are strings" in {
      val parentDevPlan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            otoroshiSettings = containerizedOtoroshi,
            authorizedEntities = Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            ),
            apikeyCustomization = ApikeyCustomization(
              metadata = Json.obj("env" -> "prod"),
              customMetadata = Seq(
                CustomMetadata(
                  key = "region",
                  possibleValues = Set("eu-west", "eu-east")
                )
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentDevPlan.id),
        defaultUsagePlan = parentDevPlan.id.some
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        customName = "teamConsumer-apiName-planName-firstKeyring",
        integrationToken = "test"
      )
      val consumerSubscription = ApiSubscription(
        keyring = keyring.id,
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        customMetadata = Json.obj("env" -> "prod").some,
        metadata = Json.obj("region" -> "eu-west").some
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url =
                  s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(tenantAdmin, userAdmin, user),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(parentApi),
        usagePlans = Seq(parentDevPlan),
        subscriptions = Seq(consumerSubscription),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      triggerSyncJob(session)

      val metadata =
        getApkMetadataFromOtoroshi(keyring.apiKey.clientId)
      metadata.getOrElse("env", "") mustBe "prod"
      metadata.getOrElse("region", "") mustBe "eu-west"
    }

    "correctly sync customMetadata when some values are not just string" in {
      val parentDevPlan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            otoroshiSettings = containerizedOtoroshi,
            authorizedEntities = Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            ),
            apikeyCustomization = ApikeyCustomization(
              metadata = Json.obj("env" -> "prod"),
              customMetadata = Seq(
                CustomMetadata(
                  key = "region",
                  possibleValues = Set("eu-west", "eu-east")
                )
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentDevPlan.id),
        defaultUsagePlan = parentDevPlan.id.some
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        customName = "teamConsumer-apiName-planName-firstKeyring",
        integrationToken = "test"
      )
      val consumerSubscription = ApiSubscription(
        keyring = keyring.id,
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        customMetadata = Json.obj("env" -> "prod").some,
        metadata = Json
          .obj(
            "region" -> "eu-west",
            "isHuman" -> false,
            "count" -> 42,
            "obj" -> Json.obj("foo" -> "bar"),
            "nullValue" -> JsNull
          )
          .some
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url =
                  s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(tenantAdmin, userAdmin, user),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(parentApi),
        usagePlans = Seq(parentDevPlan),
        subscriptions = Seq(consumerSubscription),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      triggerSyncJob(session)

      val metadata =
        getApkMetadataFromOtoroshi(keyring.apiKey.clientId)

      metadata.getOrElse("env", "") mustBe "prod"
      metadata.getOrElse("region", "") mustBe "eu-west"
      metadata.getOrElse("isHuman", "") mustBe "false"
      metadata.getOrElse("count", "") mustBe "42"
      metadata.getOrElse("obj", "") mustBe "{\"foo\":\"bar\"}"
      metadata.getOrElse("nullValue", "") mustBe ""
    }

    "correctly sync when customMetadata is absent or empty" in {
      val parentDevPlan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            otoroshiSettings = containerizedOtoroshi,
            authorizedEntities = Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            ),
            apikeyCustomization = ApikeyCustomization(
              metadata = Json.obj("env" -> "prod"),
              customMetadata = Seq(
                CustomMetadata(
                  key = "region",
                  possibleValues = Set("eu-west", "eu-east")
                )
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentDevPlan.id),
        defaultUsagePlan = parentDevPlan.id.some
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        customName = "teamConsumer-apiName-planName-firstKeyring",
        integrationToken = "test"
      )
      val consumerSubscription = ApiSubscription(
        keyring = keyring.id,
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev")
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url =
                  s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(tenantAdmin, userAdmin, user),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(parentApi),
        usagePlans = Seq(parentDevPlan),
        subscriptions = Seq(consumerSubscription),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      triggerSyncJob(session)

      val metadata =
        getApkMetadataFromOtoroshi(keyring.apiKey.clientId)

      metadata.getOrElse("env", "") mustBe "prod"
    }

    "correctly merge metadata in aggregated subscriptions when child has boolean values" in {
      val parentDevPlan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            otoroshiSettings = containerizedOtoroshi,
            authorizedEntities = Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            ),
            apikeyCustomization = ApikeyCustomization(
              metadata = Json.obj("env" -> "prod"),
              customMetadata = Seq(
                CustomMetadata(
                  key = "region",
                  possibleValues = Set("eu-west", "eu-east")
                )
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val childDevPlan = UsagePlan(
        id = UsagePlanId("child.dev"),
        tenant = tenant.id,
        customName = "dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            otoroshiSettings = containerizedOtoroshi,
            authorizedEntities = Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
              )
            ),
            apikeyCustomization = ApikeyCustomization(
              metadata = Json.obj("env" -> "prod", "type" -> "child"),
              customMetadata = Seq(
                CustomMetadata(
                  key = "usage",
                  possibleValues = Set("cron", "api")
                )
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentDevPlan.id),
        defaultUsagePlan = parentDevPlan.id.some
      )

      val childApi = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childDevPlan.id),
        defaultUsagePlan = childDevPlan.id.some
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        customName = "teamConsumer-apiName-planName-firstKeyring",
        integrationToken = "test"
      )
      val consumerParentDevSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        customMetadata = Json.obj("region" -> "eu-west").some,
        keyring = keyring.id
      )
      val consumerChildDevSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-child-dev"),
        tenant = tenant.id,
        plan = childDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        keyring = keyring.id,
        customMetadata = Json.obj("usage" -> "cron", "isCron" -> true).some
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url =
                  s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(tenantAdmin, userAdmin, user),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(parentApi, childApi),
        usagePlans = Seq(parentDevPlan, childDevPlan),
        subscriptions =
          Seq(consumerParentDevSubscription, consumerChildDevSubscription),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      triggerSyncJob(session)

      val metadata = getApkMetadataFromOtoroshi(
        keyring.apiKey.clientId
      )

      metadata.getOrElse("env", "") mustBe "prod"
      metadata.getOrElse("type", "") mustBe "child"
      metadata.getOrElse("usage", "") mustBe "cron"
      metadata.getOrElse("region", "") mustBe "eu-west"
      metadata.getOrElse("isCron", "") mustBe "true"
    }

    "preserve other subscriptions metadata when one child plan is missing" in {

      val parentDevPlan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            otoroshiSettings = containerizedOtoroshi,
            authorizedEntities = Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            ),
            apikeyCustomization = ApikeyCustomization(
              metadata = Json.obj("env" -> "prod"),
              customMetadata = Seq(
                CustomMetadata(
                  key = "region",
                  possibleValues = Set("eu-west", "eu-east")
                )
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val childDevPlanId = UsagePlanId("child.dev")
      // no need to save childDevPlan, he is missing ;)

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentDevPlan.id),
        defaultUsagePlan = parentDevPlan.id.some
      )

      val childApi = defaultApi.api.copy(
        id = ApiId("child-id"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childDevPlanId),
        defaultUsagePlan = childDevPlanId.some
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        customName = "teamConsumer-apiName-planName-firstKeyring",
        integrationToken = "test"
      )
      val consumerParentDevSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        customMetadata = Json.obj("region" -> "eu-west").some,
        keyring = keyring.id
      )
      val consumerChildDevSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-child-dev"),
        tenant = tenant.id,
        plan = childDevPlanId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        keyring = keyring.id,
        customMetadata = Json.obj("usage" -> "cron", "isCron" -> true).some
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url =
                  s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(tenantAdmin, userAdmin, user),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(parentApi, childApi),
        usagePlans = Seq(parentDevPlan),
        subscriptions =
          Seq(consumerParentDevSubscription, consumerChildDevSubscription),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      triggerSyncJob(session)

      val metadata = getApkMetadataFromOtoroshi(
        keyring.apiKey.clientId
      )

      metadata.getOrElse("env", "") mustBe "prod"
      metadata.getOrElse("region", "") mustBe "eu-west"
      metadata.get("type") mustBe None
      metadata.get("usage") mustBe None
    }

    "preserve Otoroshi-native metadata not managed by Daikoku after sync" in {
      val parentDevPlan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            otoroshiSettings = containerizedOtoroshi,
            authorizedEntities = Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            ),
            apikeyCustomization = ApikeyCustomization(
              metadata = Json.obj("env" -> "prod"),
              customMetadata = Seq(
                CustomMetadata(
                  key = "region",
                  possibleValues = Set("eu-west", "eu-east")
                )
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentDevPlan.id),
        defaultUsagePlan = parentDevPlan.id.some
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        customName = "teamConsumer-apiName-planName-firstKeyring",
        integrationToken = "test"
      )
      val consumerSubscription = ApiSubscription(
        keyring = keyring.id,
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        customMetadata = Json.obj("env" -> "prod").some,
        metadata = Json.obj("region" -> "eu-west").some
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url =
                  s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(tenantAdmin, userAdmin, user),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(parentApi),
        usagePlans = Seq(parentDevPlan),
        subscriptions = Seq(consumerSubscription),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val updateMetaInOto = httpJsonCallBlocking(
        path = s"/apis/apim.otoroshi.io/v1/apikeys/${keyring.apiKey.clientId}",
        method = "PATCH",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools",
          "Content-Type" -> "application/json",
          "Accept" -> "application/json"
        ),
        port = container.mappedPort(8080),
        body = Json
          .parse("""
            |[
            |    {
            |        "op": "add",
            |        "path": "/metadata/meta_from_oto",
            |        "value": "foo"
            |    }
            |]
            |""".stripMargin)
          .some
      )(using tenant, session)
      updateMetaInOto.status mustBe 200

      triggerSyncJob(session)

      val metadata =
        getApkMetadataFromOtoroshi(keyring.apiKey.clientId)
      metadata.getOrElse("env", "") mustBe "prod"
      metadata.getOrElse("region", "") mustBe "eu-west"
      metadata.getOrElse("meta_from_oto", "") mustBe "foo"

    }

    "correctly sync tags" in {
      val parentDevPlan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            otoroshiSettings = containerizedOtoroshi,
            authorizedEntities = Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            ),
            apikeyCustomization = ApikeyCustomization(
              tags = Json.arr(JsString("prod"), JsString("important")),
              metadata = Json.obj("env" -> "prod")
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentDevPlan.id),
        defaultUsagePlan = parentDevPlan.id.some
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        customName = "teamConsumer-apiName-planName-firstKeyring",
        integrationToken = "test"
      )
      val consumerSubscription = ApiSubscription(
        keyring = keyring.id,
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        customMetadata = Json.obj("env" -> "prod").some,
        metadata = Json.obj("region" -> "eu-west").some,
        tags = Set("foo", "bar").some
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url =
                  s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(tenantAdmin, userAdmin, user),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(parentApi),
        usagePlans = Seq(parentDevPlan),
        subscriptions = Seq(consumerSubscription),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      triggerSyncJob(session)

      val respPreVerifOtoParent = httpJsonCallBlocking(
        path = s"/api/apikeys/${keyring.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)

      val metadataJson = (respPreVerifOtoParent.json \ "metadata").as[JsObject]
      (metadataJson \ "env").as[String] mustBe "prod"
      (metadataJson \ "region").as[String] mustBe "eu-west"

      val tagsJson = (respPreVerifOtoParent.json \ "tags").as[JsArray]

      tagsJson.value
        .map(_.as[String])
        .forall(Seq("prod", "important", "foo", "bar").contains) mustBe true

    }

    "correctly sync metadata with expression language" in {
      val parentDevPlan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            otoroshiSettings = containerizedOtoroshi,
            authorizedEntities = Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            ),
            apikeyCustomization = ApikeyCustomization(
              metadata = Json.obj("team" -> "${team.name}")
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentDevPlan.id),
        defaultUsagePlan = parentDevPlan.id.some
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        customName = "teamConsumer-apiName-planName-firstKeyring",
        integrationToken = "test"
      )
      val consumerSubscription = ApiSubscription(
        keyring = keyring.id,
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        customMetadata = Json.obj("env" -> "prod").some,
        metadata = Json.obj("region" -> "eu-west").some
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url =
                  s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(tenantAdmin, userAdmin, user),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(parentApi),
        usagePlans = Seq(parentDevPlan),
        subscriptions = Seq(consumerSubscription),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      triggerSyncJob(session)

      val metadata =
        getApkMetadataFromOtoroshi(keyring.apiKey.clientId)
      metadata.getOrElse("team", "") mustBe teamConsumer.name

    }
  }
}
