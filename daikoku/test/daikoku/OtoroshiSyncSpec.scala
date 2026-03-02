package fr.maif.otoroshi.daikoku.tests

import cats.implicits.catsSyntaxOptionId
import com.dimafeng.testcontainers.GenericContainer.FileSystemBind
import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import fr.maif.otoroshi.daikoku.domain.ValidationStep.HttpRequest
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.tests.utils.DaikokuSpecHelper
import fr.maif.otoroshi.daikoku.utils.LoggerImplicits.BetterLogger
import org.joda.time.DateTime
import org.scalatest.BeforeAndAfter
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.BindMode
import play.api.libs.json._

import scala.concurrent.Await
import scala.concurrent.duration._

class OtoroshiSyncSpec()
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfter
    with ForAllTestContainer {

  val pwd = System.getProperty("user.dir")

  override val container = GenericContainer(
    "maif/otoroshi",
    exposedPorts = Seq(8080),
    fileSystemBind = Seq(
      FileSystemBind(
        s"$pwd/test/daikoku/otoroshi.json",
        "/home/user/otoroshi.json",
        BindMode.READ_ONLY
      )
    ),
    env = Map("APP_IMPORT_FROM" -> "/home/user/otoroshi.json")
  )

  before {
    Await.result(cleanOtoroshiServer(container.mappedPort(8080)), 5.seconds)
  }

  // ============================================================
  // Helpers
  // ============================================================

  private def getApkMetadataFromOtoroshi(
      clientId: String
  ): Map[String, String] = {
    val respPreVerifOtoParent = httpJsonCallWithoutSessionBlocking(
      path = s"/api/apikeys/$clientId",
      baseUrl = "http://otoroshi-api.oto.tools",
      headers = Map(
        "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
        "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
        "Host" -> "otoroshi-api.oto.tools"
      ),
      port = container.mappedPort(8080)
    )(tenant)
//    logger.json(respPreVerifOtoParent.json, true)
    (respPreVerifOtoParent.json \ "metadata")
      .as[JsObject]
      .as[Map[String, String]]
  }

  private def getApkFromOtoroshi(
      clientId: String
  ): JsValue = {
    val respPreVerifOtoParent = httpJsonCallWithoutSessionBlocking(
      path = s"/api/apikeys/$clientId",
      baseUrl = "http://otoroshi-api.oto.tools",
      headers = Map(
        "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
        "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
        "Host" -> "otoroshi-api.oto.tools"
      ),
      port = container.mappedPort(8080)
    )(tenant)
    respPreVerifOtoParent.json
  }

  private def triggerSyncJob(session: UserSession): Unit = {
    val resp = httpJsonCallBlocking(
      path = s"/api/jobs/otoroshi/_sync?key=secret",
      method = "POST",
      body = Json.obj().some
    )(tenant, session)
    resp.status mustBe 200
  }

  "OtoroshiVerifierJob sync" should {

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
        subscriptionProcess = Seq.empty,
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

      val consumerSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test",
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
        subscriptions = Seq(consumerSubscription)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      triggerSyncJob(session)

      val metadata =
        getApkMetadataFromOtoroshi(consumerSubscription.apiKey.clientId)
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
        subscriptionProcess = Seq.empty,
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

      val consumerSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test",
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
        subscriptions = Seq(consumerSubscription)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      triggerSyncJob(session)

      val metadata =
        getApkMetadataFromOtoroshi(consumerSubscription.apiKey.clientId)

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
        subscriptionProcess = Seq.empty,
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

      val consumerSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test"
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
        subscriptions = Seq(consumerSubscription)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      triggerSyncJob(session)

      val metadata =
        getApkMetadataFromOtoroshi(consumerSubscription.apiKey.clientId)

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
        subscriptionProcess = Seq.empty,
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
        subscriptionProcess = Seq.empty,
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

      val consumerParentDevSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test",
        customMetadata = Json.obj("region" -> "eu-west").some
      )
      val consumerChildDevSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-child-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = childDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test",
        parent = consumerParentDevSubscription.id.some,
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
          Seq(consumerParentDevSubscription, consumerChildDevSubscription)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      triggerSyncJob(session)

      val metadata = getApkMetadataFromOtoroshi(
        consumerParentDevSubscription.apiKey.clientId
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
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val childDevPlanId = UsagePlanId("child.dev")

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

      val consumerParentDevSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test",
        customMetadata = Json.obj("region" -> "eu-west").some
      )
      val consumerChildDevSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-child-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = childDevPlanId,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test",
        parent = consumerParentDevSubscription.id.some,
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
          Seq(consumerParentDevSubscription, consumerChildDevSubscription)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      triggerSyncJob(session)

      val metadata = getApkMetadataFromOtoroshi(
        consumerParentDevSubscription.apiKey.clientId
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
        subscriptionProcess = Seq.empty,
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

      val consumerSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test",
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
        subscriptions = Seq(consumerSubscription)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val updateMetaInOto = httpJsonCallBlocking(
        path =
          s"/apis/apim.otoroshi.io/v1/apikeys/${consumerSubscription.apiKey.clientId}",
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
        body = Json.parse("""
            |[
            |    {
            |        "op": "add",
            |        "path": "/metadata/meta_from_oto",
            |        "value": "foo"
            |    }
            |]
            |""".stripMargin).some
      )(tenant, session)
      updateMetaInOto.status mustBe 200

      triggerSyncJob(session)

      val metadata =
        getApkMetadataFromOtoroshi(consumerSubscription.apiKey.clientId)
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
        subscriptionProcess = Seq.empty,
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

      val consumerSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test",
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
        subscriptions = Seq(consumerSubscription)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      triggerSyncJob(session)

      val respPreVerifOtoParent = httpJsonCallBlocking(
        path = s"/api/apikeys/${consumerSubscription.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(tenant, session)
      logger.warn(Json.prettyPrint(respPreVerifOtoParent.json))

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
        subscriptionProcess = Seq.empty,
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

      val consumerSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test",
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
        subscriptions = Seq(consumerSubscription)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      triggerSyncJob(session)

      val metadata =
        getApkMetadataFromOtoroshi(consumerSubscription.apiKey.clientId)
      metadata.getOrElse("team", "") mustBe teamConsumer.name

    }

    "be run after api or plan update" in {
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
              metadata = Json.obj("env" -> "prod")
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentDevPlan.id),
        defaultUsagePlan = parentDevPlan.id.some
      )

      val consumerSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test"
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
        subscriptions = Seq(consumerSubscription)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${parentApi.id.value}/${parentApi.currentVersion.value}",
        method = "PUT",
        body = Some(parentApi.copy(description = "new desc").asJson)
      )(tenant, session)
      resp.status mustBe 200

      val metadata =
        getApkMetadataFromOtoroshi(consumerSubscription.apiKey.clientId)
      metadata.getOrElse("env", "") mustBe "prod"

      val respUpdatePlan = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${parentApi.id.value}/${parentApi.currentVersion.value}/plan/${parentDevPlan.id.value}",
        method = "PUT",
        body = Some(
          parentDevPlan
            .copy(otoroshiTarget =
              Some(
                OtoroshiTarget(
                  otoroshiSettings = containerizedOtoroshi,
                  authorizedEntities = Some(
                    AuthorizedEntities(
                      routes = Set(OtoroshiRouteId(parentRouteId))
                    )
                  ),
                  apikeyCustomization = ApikeyCustomization(
                    metadata = Json.obj("usage" -> "test")
                  )
                )
              )
            )
            .asJson
        )
      )(tenant, session)
      respUpdatePlan.status mustBe 200

      val metadata2 =
        getApkMetadataFromOtoroshi(consumerSubscription.apiKey.clientId)
      metadata2.get("env") mustBe None
      metadata2.getOrElse("usage", "") mustBe "test"

    }

    "be run after child subscription archive by owner" in {
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
              metadata = Json.obj("env" -> "prod")
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
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
              metadata = Json.obj("type" -> "child"),
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
        subscriptionProcess = Seq.empty,
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

      val consumerParentDevSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test",
        customMetadata = Json.obj("usage" -> "cron", "isCron" -> true).some
      )

      val consumerChildDevSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-child-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = childDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test",
        parent = consumerParentDevSubscription.id.some,
        customMetadata = Json.obj("region" -> "eu-west").some
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
          Seq(consumerParentDevSubscription, consumerChildDevSubscription)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/subscriptions/${consumerChildDevSubscription.id.value}/_archiveByOwner",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 200

      val apk =
        getApkFromOtoroshi(consumerParentDevSubscription.apiKey.clientId)
      (apk \ "enabled").as[Boolean] mustBe true

      val metadata = (apk \ "metadata")
        .as[JsObject]
        .as[Map[String, String]]
      metadata.getOrElse("env", "") mustBe "prod"
      metadata.getOrElse("usage", "") mustBe "cron"
      metadata.getOrElse("isCron", "") mustBe "true"
      metadata.get("type") mustBe None
      metadata.get("region") mustBe None

    }

    "be run after child subscription archive" in {
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
              metadata = Json.obj("env" -> "prod")
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
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
        subscriptionProcess = Seq.empty,
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

      val consumerParentDevSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test",
        customMetadata = Json.obj("usage" -> "cron", "isCron" -> true).some
      )

      val consumerChildDevSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-child-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = childDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test",
        parent = consumerParentDevSubscription.id.some,
        customMetadata = Json.obj("region" -> "eu-west").some
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
          Seq(consumerParentDevSubscription, consumerChildDevSubscription)
      )

      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/subscriptions/${consumerChildDevSubscription.id.value}/_archive",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 200

      val apk =
        getApkFromOtoroshi(consumerParentDevSubscription.apiKey.clientId)
      (apk \ "enabled").as[Boolean] mustBe true

      (apk \ "authorizedEntities").as[JsArray].value.length mustBe 1

      val metadata = (apk \ "metadata")
        .as[JsObject]
        .as[Map[String, String]]
      metadata.getOrElse("env", "") mustBe "prod"
      metadata.getOrElse("usage", "") mustBe "cron"
      metadata.getOrElse("isCron", "") mustBe "true"
      metadata.get("type") mustBe None
      metadata.get("region") mustBe None
    }

    "be run after parent subscription archive" in {
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
              metadata = Json.obj("env" -> "prod")
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
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
              metadata = Json.obj("type" -> "child"),
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
        subscriptionProcess = Seq.empty,
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

      val consumerParentDevSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test",
        customMetadata = Json.obj("usage" -> "cron", "isCron" -> true).some
      )

      val consumerChildDevSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-child-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = childDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test",
        parent = consumerParentDevSubscription.id.some,
        customMetadata = Json.obj("region" -> "eu-west").some
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
          Seq(consumerParentDevSubscription, consumerChildDevSubscription)
      )

      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/subscriptions/${consumerParentDevSubscription.id.value}/_archive",
        method = "PUT"
      )(tenant, session)
      resp.status mustBe 200

      val apk = getApkFromOtoroshi(consumerParentDevSubscription.apiKey.clientId)

      (apk \ "enabled").as[Boolean] mustBe false

      //FIXME: FIX IT
//      (apk \ "authorizedEntities").as[JsArray].value.length mustBe 1
//
//      val metadata = (apk \ "metadata")
//        .as[JsObject]
//        .as[Map[String, String]]
//      metadata.get("env") mustBe None
//      metadata.get("usage") mustBe None
//      metadata.get("isCron") mustBe None
//      metadata.get("type") mustBe "child".some
//      metadata.get("region") mustBe "eu-west".some
    }

    "be run after subscription update by api owner" in {
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
              metadata = Json.obj("env" -> "prod")
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentDevPlan.id),
        defaultUsagePlan = parentDevPlan.id.some
      )

      val consumerSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test",
        customMetadata = Json.obj("region" -> "eu-west").some
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
        subscriptions = Seq(consumerSubscription)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/subscriptions/${consumerSubscription.id.value}",
        method = "PUT",
        body =
          Some(consumerSubscription.copy(customMaxPerDay = 200L.some).asJson)
      )(tenant, session)
      resp.status mustBe 200

      val metadata =
        getApkMetadataFromOtoroshi(consumerSubscription.apiKey.clientId)
      metadata.getOrElse("env", "") mustBe "prod"
      metadata.getOrElse("region", "") mustBe "eu-west"
    }

    "be run after child subscription update by owner" in {
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
        subscriptionProcess = Seq.empty,
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
              metadata = Json.obj("type" -> "child"),
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
        subscriptionProcess = Seq.empty,
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

      val consumerParentDevSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test",
        customMetadata = Json.obj("region" -> "eu-west").some
      )
      val consumerChildDevSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-child-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = childDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test",
        parent = consumerParentDevSubscription.id.some,
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
          Seq(consumerParentDevSubscription, consumerChildDevSubscription)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/subscriptions/${consumerChildDevSubscription.id.value}",
        method = "PUT",
        body = Some(
          consumerChildDevSubscription.copy(customMaxPerDay = 200L.some).asJson
        )
      )(tenant, session)
      resp.status mustBe 200

      val metadata = getApkMetadataFromOtoroshi(
        consumerParentDevSubscription.apiKey.clientId
      )

      metadata.getOrElse("env", "") mustBe "prod"
      metadata.getOrElse("type", "") mustBe "child"
      metadata.getOrElse("usage", "") mustBe "cron"
      metadata.getOrElse("region", "") mustBe "eu-west"
      metadata.getOrElse("isCron", "") mustBe "true"
    }

    "be run after made unique child subscription" in {
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
        subscriptionProcess = Seq.empty,
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
              metadata = Json.obj("type" -> "child"),
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
        subscriptionProcess = Seq.empty,
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

      val consumerParentDevSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test",
        customMetadata = Json.obj("region" -> "eu-west").some
      )
      val consumerChildDevSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-child-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = childDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test",
        parent = consumerParentDevSubscription.id.some,
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
          Seq(consumerParentDevSubscription, consumerChildDevSubscription)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/subscriptions/${consumerChildDevSubscription.id.value}/_makeUnique",
        method = "POST"
      )(tenant, session)
      resp.status mustBe 200
      logger.json(resp.json)

      val metadata = getApkMetadataFromOtoroshi(
        consumerParentDevSubscription.apiKey.clientId
      )

      metadata.get("env") mustBe "prod".some
      metadata.get("region") mustBe "eu-west".some
      metadata.get("type") mustBe None
      metadata.get("usage") mustBe None
      metadata.get("isCron") mustBe None

      val mayberNewConsumerSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findById(consumerChildDevSubscription.id),
        10.seconds
      )
      mayberNewConsumerSub.nonEmpty mustBe true
      val newConsumerSub = mayberNewConsumerSub.get

      val childMetadata =
        getApkMetadataFromOtoroshi(newConsumerSub.apiKey.clientId)
      childMetadata.get("env") mustBe None
      childMetadata.get("region") mustBe None
      childMetadata.get("type") mustBe "child".some
      childMetadata.get("usage") mustBe "cron".some
      childMetadata.get("isCron") mustBe "true".some

    }

    "be run after child subscription deletion" in {
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
        subscriptionProcess = Seq.empty,
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
              metadata = Json.obj("type" -> "child"),
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
        subscriptionProcess = Seq.empty,
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

      val consumerParentDevSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-parent-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = parentDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test",
        customMetadata = Json.obj("region" -> "eu-west").some
      )
      val consumerChildDevSubscription = ApiSubscription(
        id = ApiSubscriptionId("consumer-child-dev"),
        tenant = tenant.id,
        apiKey = parentApiKey,
        plan = childDevPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = user.id,
        customName = Some("Parent dev"),
        rotation = None,
        integrationToken = "test",
        parent = consumerParentDevSubscription.id.some,
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
          Seq(consumerParentDevSubscription, consumerChildDevSubscription)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/subscriptions/${consumerChildDevSubscription.id.value}/_makeUnique",
        method = "POST"
      )(tenant, session)
      resp.status mustBe 200

      val metadata = getApkMetadataFromOtoroshi(
        consumerParentDevSubscription.apiKey.clientId
      )

      metadata.get("env") mustBe "prod".some
      metadata.get("region") mustBe "eu-west".some
      metadata.get("type") mustBe None
      metadata.get("usage") mustBe None
      metadata.get("isCron") mustBe None
    }

    "be run after subscription creation" in {
      val plan = UsagePlan(
        id = UsagePlanId("parent.dev"),
        tenant = tenant.id,
        customName = "free without quotas",
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
              metadata = Json.obj("env" -> "prod")
            )
          )
        ),
        allowMultipleKeys = Some(false),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true),
        subscriptionProcess = Seq(
          HttpRequest(
            id = "request",
            title = "request",
            url =
              s"http://request-accepted.oto.tools:${container.mappedPort(8080)}"
          )
        )
      )
      val api = defaultApi.api.copy(
        id = ApiId("parent-id"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(UsagePlanId("parent.dev")),
        defaultUsagePlan = UsagePlanId("parent.dev").some
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
        users = Seq(userAdmin, user),
        teams = Seq(
          teamOwner,
          teamConsumer,
          defaultAdminTeam
        ),
        usagePlans = Seq(plan, adminApiPlan),
        apis = Seq(api, adminApi)
      )

      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${api.id.value}/plan/${plan.id.value}/team/${teamConsumer.id.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(tenant, session)
      resp.status mustBe 200

      val maybeSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findById((resp.json \ "subscription" \ "_id").as[String]),
        5.seconds
      )
      maybeSub.nonEmpty mustBe true
      val sub = maybeSub.get

      val metadata = getApkMetadataFromOtoroshi(sub.apiKey.clientId)
      metadata.get("env") mustBe "prod".some
      metadata.get("region") mustBe "eu-west".some
      metadata.get("validated") mustBe "true".some
    }

//    "be run after child subscription creation" in {
//      val parentPlan = UsagePlan(
//        id = UsagePlanId("parent.dev"),
//        tenant = tenant.id,
//        customName = "free without quotas",
//        customDescription = None,
//        otoroshiTarget = Some(
//          OtoroshiTarget(
//            otoroshiSettings = containerizedOtoroshi,
//            authorizedEntities = Some(
//              AuthorizedEntities(
//                routes = Set(OtoroshiRouteId(parentRouteId))
//              )
//            ),
//            apikeyCustomization = ApikeyCustomization(
//              metadata = Json.obj("env" -> "prod")
//            )
//          )
//        ),
//        allowMultipleKeys = Some(false),
//        integrationProcess = IntegrationProcess.ApiKey,
//        autoRotation = Some(false),
//        aggregationApiKeysSecurity = Some(true),
//        subscriptionProcess = Seq.empty
//      )
//
//      val childPlan = UsagePlan(
//        id = UsagePlanId("child.dev"),
//        tenant = tenant.id,
//        customName = "free without quotas",
//        customDescription = None,
//        otoroshiTarget = Some(
//          OtoroshiTarget(
//            otoroshiSettings = containerizedOtoroshi,
//            authorizedEntities = Some(
//              AuthorizedEntities(
//                routes = Set(OtoroshiRouteId(parentRouteId))
//              )
//            ),
//            apikeyCustomization = ApikeyCustomization(
//              metadata = Json.obj("type" -> "child")
//            )
//          )
//        ),
//        allowMultipleKeys = Some(false),
//        integrationProcess = IntegrationProcess.ApiKey,
//        autoRotation = Some(false),
//        aggregationApiKeysSecurity = Some(true),
//        subscriptionProcess = Seq(
//          HttpRequest(
//            id = "request",
//            title = "request",
//            url =
//              s"http://request-accepted.oto.tools:${container.mappedPort(8080)}"
//          )
//        )
//      )
//
//
//      val parentApi = defaultApi.api.copy(
//        id = ApiId("parent-id"),
//        name = "parent API",
//        team = teamOwnerId,
//        possibleUsagePlans = Seq(parentPlan.id),
//        defaultUsagePlan = parentPlan.id.some
//      )
//      val childApi = defaultApi.api.copy(
//        id = ApiId("child-id"),
//        name = "child API",
//        team = teamOwnerId,
//        possibleUsagePlans = Seq(childPlan.id),
//        defaultUsagePlan = childPlan.id.some
//      )
//
//      val consumerParentDevSubscription = ApiSubscription(
//        id = ApiSubscriptionId("consumer-parent-dev"),
//        tenant = tenant.id,
//        apiKey = parentApiKey,
//        plan = parentPlan.id,
//        createdAt = DateTime.now(),
//        team = teamConsumerId,
//        api = parentApi.id,
//        by = user.id,
//        customName = Some("Parent dev"),
//        rotation = None,
//        integrationToken = "test",
//        metadata = Json.obj("env" -> "prod").some
//      )
//
//      setupEnvBlocking(
//        tenants = Seq(
//          tenant.copy(
//            otoroshiSettings = Set(
//              OtoroshiSettings(
//                id = containerizedOtoroshi,
//                url =
//                  s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
//                host = "otoroshi-api.oto.tools",
//                clientSecret = otoroshiAdminApiKey.clientSecret,
//                clientId = otoroshiAdminApiKey.clientId
//              )
//            )
//          )
//        ),
//        users = Seq(userAdmin, user),
//        teams = Seq(
//          teamOwner,
//          teamConsumer,
//          defaultAdminTeam
//        ),
//        usagePlans = Seq(parentPlan, childPlan, adminApiPlan),
//        apis = Seq(parentApi, childApi, adminApi),
//        subscriptions = Seq(consumerParentDevSubscription)
//      )
//
//      val session = loginWithBlocking(user, tenant)
//      val resp = httpJsonCallBlocking(
//        path =
//          s"/api/apis/${childApi.id.value}/plan/${childPlan.id.value}/team/${teamConsumer.id.value}/${consumerParentDevSubscription.id.value}/_extends",
//        method = "PUT",
//        body = Json.obj().some
//      )(tenant, session)
//      resp.status mustBe 200
//
//      val maybeSub = Await.result(
//        daikokuComponents.env.dataStore.apiSubscriptionRepo
//          .forTenant(tenant)
//          .findById((resp.json \ "subscription" \ "_id").as[String]),
//        5.seconds
//      )
//      maybeSub.nonEmpty mustBe true
//      val sub = maybeSub.get
//
//      val metadata = getApkMetadataFromOtoroshi(sub.apiKey.clientId)
//      metadata.get("env") mustBe "prod".some
//      metadata.get("type") mustBe "child".some
//      metadata.get("region") mustBe "eu-west".some
//      metadata.get("validated") mustBe "true".some
//    }
  }
}
