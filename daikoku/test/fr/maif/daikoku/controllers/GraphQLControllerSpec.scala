package fr.maif.daikoku.controllers

import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.domain.TeamPermission.{Administrator, ApiEditor}
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.login.AuthProvider
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import fr.maif.daikoku.ApiWithPlans
import fr.maif.daikoku.domain.ApiState.Created
import fr.maif.daikoku.utils.IdGenerator
import org.joda.time.DateTime
import org.mindrot.jbcrypt.BCrypt
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.{JsArray, JsValue, Json}

import java.util.Base64
import scala.concurrent.Await
import scala.concurrent.duration.*

class GraphQLControllerSpec()
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience {

  "with graphql query a user" can {
    "paginate pending keyring entries and subscription rows without granting access" in {
      Await.result(waitForDaikokuSetup(), 5.second)
      val api = defaultApi.api
      val plan = defaultApi.plans.head
      val requestedPlan = plan.copy(
        id = UsagePlanId("pending-plan"),
        customName = "Requested environment"
      )
      val keyring = Keyring(
        id = KeyringId("pending-test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey =
          OtoroshiApiKey("existing", "existing-client", "existing-secret"),
        otoroshiSettings = KeyringOtoroshiBinding.Internal,
        createdAt = DateTime.now(),
        customName = "A existing keyring",
        integrationToken = IdGenerator.token(32)
      )
      val extensionOnly = keyring.copy(
        id = KeyringId("extension-only"),
        customName = "B extension only"
      )
      val subscription = ApiSubscription(
        id = ApiSubscriptionId("pending-test-subscription"),
        tenant = tenant.id,
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = userAdmin.id,
        customName = None,
        keyring = keyring.id
      )
      val initial = SubscriptionDemand(
        id = DemandId("initial-request"),
        tenant = tenant.id,
        api = api.id,
        plan = requestedPlan.id,
        steps = Seq.empty,
        state = SubscriptionDemandState.Waiting,
        team = teamConsumerId,
        from = userAdmin.id,
        keyringCustomName = Some("C initial keyring")
      )
      val extension = initial.copy(
        id = DemandId("extension-request"),
        state = SubscriptionDemandState.InProgress,
        keyring = Some(keyring.id)
      )
      val secondInitial = initial.copy(
        id = DemandId("second-initial"),
        keyringCustomName = Some("D second")
      )
      val foreignTeam =
        teamConsumer.copy(id = TeamId("another-consumer"), users = Set.empty)
      val otherTenant = tenant.copy(
        id = TenantId("another-tenant"),
        name = "Another tenant",
        domain = "another.tenant"
      )
      val closed = Seq(
        SubscriptionDemandState.Accepted,
        SubscriptionDemandState.Refused,
        SubscriptionDemandState.Canceled,
        SubscriptionDemandState.Blocked
      ).map(state =>
        initial.copy(id = DemandId(s"closed-${state.name}"), state = state)
      )
      setupEnvBlocking(
        tenants = Seq(tenant, otherTenant),
        users = Seq(userAdmin, userApiEditor),
        teams = Seq(
          teamOwner,
          teamConsumer.copy(apiKeyVisibility =
            Some(TeamApiKeyVisibility.Administrator)
          ),
          foreignTeam
        ),
        apis = Seq(api),
        usagePlans = defaultApi.plans :+ requestedPlan,
        keyrings = Seq(keyring, extensionOnly),
        subscriptions = Seq(subscription),
        subscriptionDemands = closed ++ Seq(
          initial,
          secondInitial,
          extension,
          extension.copy(
            id = DemandId("extension-only-request"),
            keyring = Some(extensionOnly.id)
          ),
          initial
            .copy(id = DemandId("foreign-team-request"), team = foreignTeam.id),
          initial.copy(
            id = DemandId("foreign-tenant-request"),
            tenant = otherTenant.id
          ),
          initial.copy(
            id = DemandId("other-api-request"),
            api = ApiId("another-api")
          )
        )
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val consumerRequests = httpJsonCallBlocking(
        path =
          s"/api/me/subscriptions/${api.id.value}/${api.currentVersion.value}",
        method = "GET"
      )(using tenant, session)
      consumerRequests.status mustBe 200
      val visibleRequestIds = (consumerRequests.json \ "requests")
        .as[Seq[JsValue]]
        .map(v => (v \ "_id").as[String])
        .toSet
      visibleRequestIds mustBe Set(
        "initial-request",
        "second-initial",
        "extension-request",
        "extension-only-request"
      )
      def query(selection: String): JsValue = {
        val response = httpJsonCallBlocking(
          path = "/api/search",
          method = "POST",
          body = Some(Json.obj("query" -> s"{$selection}"))
        )(using tenant, session)
        response.status mustBe 200
        (response.json \ "errors").isDefined mustBe false
        (response.json \ "data").as[JsValue]
      }
      def entries(offset: Int, filter: String = "") = query(
        s"""apiKeyringEntries(id: "${api.id.value}", teamId: "${teamConsumerId.value}", filter: "$filter", limit: 2, offset: $offset) {
           | entries { _id pendingCount
           |   keyring { _id customName enabled integrationToken bearerToken subscriptionsCount isRotationLocked environments
           |     team { name } apiKey { clientId clientSecret clientName }
           |     rotation { enabled rotationEvery gracePeriod pendingRotation } }
           |   demand { _id state date keyringCustomName from { name } api { _id name currentVersion }
           |     plan { _id customName } steps { id state step { name } } }
           | }
           | total totalFiltered keyringsCount creationsCount
           |}""".stripMargin
      ) \ "apiKeyringEntries"
      val first = entries(0)
      (first \ "total").as[Int] mustBe 4
      (first \ "keyringsCount").as[Int] mustBe 2
      (first \ "creationsCount").as[Int] mustBe 2
      val firstCards = (first \ "entries").as[Seq[JsValue]]
      firstCards.map(v => (v \ "_id").as[String]) mustBe Seq(
        "keyring:pending-test-keyring",
        "keyring:extension-only"
      )
      (firstCards.head \ "pendingCount").as[Int] mustBe 1
      (firstCards.head \ "keyring" \ "subscriptionsCount").as[Int] mustBe 1
      (firstCards.head \ "keyring" \ "apiKey" \ "clientSecret")
        .as[String] mustBe "existing-secret"
      (firstCards(1) \ "keyring" \ "subscriptionsCount").as[Int] mustBe 0
      (firstCards(1) \ "keyring" \ "environments").as[Seq[String]] mustBe Seq(
        requestedPlan.customName
      )
      (firstCards.head \ "keyring" \ "environments").as[Seq[String]] mustBe
        Seq(plan.customName, requestedPlan.customName).distinct.sorted
      val initialCards = (entries(2) \ "entries").as[Seq[JsValue]]
      initialCards.map(v => (v \ "_id").as[String]) mustBe Seq(
        "demand:initial-request",
        "demand:second-initial"
      )
      initialCards.foreach(v =>
        (v \ "keyring").asOpt[JsValue].get mustBe play.api.libs.json.JsNull
      )
      (entries(0, "Requested environment") \ "totalFiltered").as[Int] mustBe 4
      val emptyPage = entries(100)
      (emptyPage \ "entries").as[Seq[JsValue]] mustBe empty
      (emptyPage \ "totalFiltered").as[Int] mustBe 4
      (entries(0, "does-not-exist") \ "totalFiltered").as[Int] mustBe 0

      def rows(
          entryId: String,
          offset: Int,
          filter: String = "",
          viewedApiId: String = api.id.value
      ) = query(
        s"""apiKeyringRows(id: "$entryId", apiId: "$viewedApiId", teamId: "${teamConsumerId.value}",
           | filterTable: "[{\\"id\\":\\"plan\\",\\"value\\":\\"$filter\\"}]", sortingTable: "[]", limit: 1, offset: $offset) {
           | rows { _id subscription { _id customName adminCustomName enabled state createdAt validUntil tags lastUsage
           |   plan { _id customName } api { _id _humanReadableId name currentVersion } }
           |   demand { _id state date keyringCustomName from { name } api { _id name currentVersion }
           |     plan { _id customName } steps { id state step { name } } } } total
           |}""".stripMargin
      ) \ "apiKeyringRows"
      val mixed = (0 to 1).flatMap(offset =>
        (rows("keyring:pending-test-keyring", offset) \ "rows").as[Seq[JsValue]]
      )
      mixed.map(v => (v \ "_id").as[String]).toSet mustBe Set(
        "subscription:pending-test-subscription",
        "demand:extension-request"
      )
      (rows("keyring:pending-test-keyring", 0) \ "total").as[Int] mustBe 2
      (rows("keyring:pending-test-keyring", 100) \ "total").as[Int] mustBe 2
      (rows(
        "keyring:pending-test-keyring",
        0,
        "Requested environment"
      ) \ "total").as[Int] mustBe 1
      (rows("demand:initial-request", 0) \ "total").as[Int] mustBe 1
      (rows("demand:foreign-team-request", 0) \ "total").as[Int] mustBe 0
      (rows("demand:foreign-tenant-request", 0) \ "total").as[Int] mustBe 0
      (rows("demand:other-api-request", 0) \ "total").as[Int] mustBe 0

      Await.result(
        daikokuComponents.env.dataStore.subscriptionDemandRepo
          .forTenant(tenant)
          .save(initial.copy(state = SubscriptionDemandState.Accepted)),
        5.seconds
      )
      (entries(0) \ "total").as[Int] mustBe 3
      (rows("demand:initial-request", 0) \ "total").as[Int] mustBe 0
      val provisioned = keyring.copy(
        id = KeyringId("provisioned-keyring"),
        customName = "C initial keyring"
      )
      Await.result(
        for {
          _ <- daikokuComponents.env.dataStore.keyringRepo
            .forTenant(tenant)
            .save(provisioned)
          _ <- daikokuComponents.env.dataStore.apiSubscriptionRepo
            .forTenant(tenant)
            .save(
              subscription.copy(
                id = ApiSubscriptionId("provisioned-subscription"),
                keyring = provisioned.id,
                plan = requestedPlan.id
              )
            )
        } yield (),
        5.seconds
      )
      (entries(0) \ "total").as[Int] mustBe 4
      val completedCards = (entries(2) \ "entries").as[Seq[JsValue]]
      completedCards.map(v => (v \ "_id").as[String]) mustBe Seq(
        "keyring:provisioned-keyring",
        "demand:second-initial"
      )
      Await.result(
        daikokuComponents.env.dataStore.subscriptionDemandRepo
          .forTenant(tenant)
          .save(
            initial
              .copy(id = DemandId("unnamed-initial"), keyringCustomName = None)
          ),
        5.seconds
      )
      (entries(2) \ "entries")
        .as[Seq[JsValue]]
        .map(v => (v \ "_id").as[String]) mustBe Seq(
        "keyring:provisioned-keyring",
        "demand:unnamed-initial"
      )
      (entries(0, "Creation pending") \ "totalFiltered").as[Int] mustBe 1
      val localized = query(
        s"""apiKeyringEntries(id: "${api.id.value}", teamId: "${teamConsumerId.value}",
           | creationLabel: "Z pending - %s", unavailablePlanLabel: "Missing plan", limit: 10, offset: 0) {
           | entries { _id } total
           |}""".stripMargin
      )
      val localizedCards =
        (localized \ "apiKeyringEntries" \ "entries").as[Seq[JsValue]]
      (localizedCards.last \ "_id").as[String] mustBe "demand:unnamed-initial"

      val otherPlan = requestedPlan.copy(
        id = UsagePlanId("other-api-plan"),
        customName = "Other API environment"
      )
      val otherApi = api.copy(
        id = ApiId("another-api"),
        name = "Another API",
        possibleUsagePlans = Seq(otherPlan.id),
        defaultUsagePlan = Some(otherPlan.id)
      )
      val unrelatedKeyring = keyring.copy(
        id = KeyringId("unrelated-keyring"),
        customName = "Unrelated keyring"
      )
      Await.result(
        for {
          _ <- daikokuComponents.env.dataStore.apiRepo
            .forTenant(tenant)
            .save(otherApi)
          _ <- daikokuComponents.env.dataStore.usagePlanRepo
            .forTenant(tenant)
            .save(otherPlan)
          _ <- daikokuComponents.env.dataStore.keyringRepo
            .forTenant(tenant)
            .save(unrelatedKeyring)
          _ <- daikokuComponents.env.dataStore.subscriptionDemandRepo
            .forTenant(tenant)
            .save(
              extension.copy(
                id = DemandId("cross-api-extension"),
                api = otherApi.id,
                plan = otherPlan.id
              )
            )
          _ <- daikokuComponents.env.dataStore.subscriptionDemandRepo
            .forTenant(tenant)
            .save(
              extension.copy(
                id = DemandId("unrelated-extension"),
                api = otherApi.id,
                plan = otherPlan.id,
                keyring = Some(unrelatedKeyring.id)
              )
            )
        } yield (),
        5.seconds
      )
      val sharedCard = (entries(0) \ "entries").as[Seq[JsValue]].head
      (sharedCard \ "pendingCount").as[Int] mustBe 2
      val sharedEnvironments = Seq(
        plan.customName,
        requestedPlan.customName,
        otherPlan.customName
      ).distinct.sorted
      (sharedCard \ "keyring" \ "environments")
        .as[Seq[String]] mustBe sharedEnvironments
      (entries(0) \ "total").as[Int] mustBe 5
      val crossApiSearch = entries(0, "Other API environment")
      (crossApiSearch \ "totalFiltered").as[Int] mustBe 1
      ((crossApiSearch \ "entries").as[Seq[JsValue]].head \ "_id")
        .as[String] mustBe "keyring:pending-test-keyring"
      val expectedSharedRows = Set(
        "subscription:pending-test-subscription",
        "demand:extension-request",
        "demand:cross-api-extension"
      )
      Seq(api.id.value, otherApi.id.value).foreach { viewedApiId =>
        val sharedRows = (0 to 2).flatMap(offset =>
          (rows(
            "keyring:pending-test-keyring",
            offset,
            viewedApiId = viewedApiId
          ) \ "rows").as[Seq[JsValue]]
        )
        sharedRows
          .map(v => (v \ "_id").as[String])
          .toSet mustBe expectedSharedRows
        (rows(
          "keyring:pending-test-keyring",
          0,
          viewedApiId = viewedApiId
        ) \ "total").as[Int] mustBe 3
      }
      val otherApiCards = query(
        s"""apiKeyringEntries(id: "${otherApi.id.value}", teamId: "${teamConsumerId.value}", limit: 10, offset: 0) {
           | entries { _id pendingCount keyring { environments } } total
           |}""".stripMargin
      )
      val otherEntries =
        (otherApiCards \ "apiKeyringEntries" \ "entries").as[Seq[JsValue]]
      otherEntries.map(v => (v \ "_id").as[String]).toSet mustBe Set(
        "keyring:pending-test-keyring",
        "keyring:unrelated-keyring",
        "demand:other-api-request"
      )
      (otherEntries
        .find(v => (v \ "_id").as[String] == "keyring:pending-test-keyring")
        .get \ "pendingCount").as[Int] mustBe 2
      (otherEntries
        .find(v => (v \ "_id").as[String] == "keyring:pending-test-keyring")
        .get \ "keyring" \ "environments")
        .as[Seq[String]] mustBe sharedEnvironments

      val deniedTeam = httpJsonCallBlocking(
        path = "/api/search",
        method = "POST",
        body = Some(
          Json.obj(
            "query" ->
              s"""{ apiKeyringEntries(id: "${api.id.value}", teamId: "${foreignTeam.id.value}") { total } }"""
          )
        )
      )(using tenant, session)
      (deniedTeam.json \ "errors").isDefined mustBe true
      val editorSession = loginWithBlocking(userApiEditor, tenant)
      val deniedCredentials = httpJsonCallBlocking(
        path = "/api/search",
        method = "POST",
        body = Some(
          Json.obj(
            "query" ->
              s"""{ apiKeyringEntries(id: "${api.id.value}", teamId: "${teamConsumerId.value}") {
             | entries { keyring { apiKey { clientSecret } } }
             |} }""".stripMargin
          )
        )
      )(using tenant, editorSession)
      (deniedCredentials.json \ "errors").isDefined mustBe true
    }

    "list all visible apis - Home page" in {
      Await.result(waitForDaikokuSetup(), 5.second)
      val _tenant = tenant.copy(isPrivate = false)

      val apiList = (1 to 10)
        .map(id => {
          val planId = UsagePlanId(s"plan-$id-api-$id")
          val plan = UsagePlan(
            id = planId,
            tenant = _tenant.id,
            customName = s"Free with quotas $id",
            customDescription = None,
            otoroshiTarget = Some(
              OtoroshiTarget(
                OtoroshiSettingsId("default"),
                Some(
                  AuthorizedEntities(
                    groups = Set(OtoroshiServiceGroupId("12345"))
                  )
                )
              )
            ),
            allowMultipleKeys = Some(false),
            subscriptionProcess = SubscriptionProcess(),
            integrationProcess = IntegrationProcess.ApiKey,
            autoRotation = Some(false)
          )

          val api = Api(
            id = ApiId(s"api-$id"),
            tenant = _tenant.id,
            team = teamOwnerId,
            lastUpdate = DateTime.now(),
            name = s"Api - $id",
            smallDescription = "A small API to play with Daikoku exposition",
            tags = Set("api", "rest", "scala", "play"),
            description = "# My Awesome API",
            currentVersion = Version("1.0.0"),
            supportedVersions = Set(Version("1.0.0")),
            state = ApiState.Published,
            visibility = ApiVisibility.Public,
            documentation = ApiDocumentation(
              id = ApiDocumentationId(IdGenerator.token(32)),
              tenant = _tenant.id,
              pages = Seq.empty,
              lastModificationAt = DateTime.now()
            ),
            swagger = None,
            possibleUsagePlans = Seq(planId),
            defaultUsagePlan = planId.some
          )
          ApiWithPlans(api, Seq(plan))
        })

      val draftApiPlan = UsagePlan(
        id = UsagePlanId("draft_plan"),
        tenant = _tenant.id,
        customName = "draft",
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(
                groups = Set(OtoroshiServiceGroupId("12345"))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val draftApi = Api(
        id = ApiId(s"draft_api"),
        tenant = _tenant.id,
        team = teamOwnerId,
        lastUpdate = DateTime.now(),
        name = s"Api - draft",
        smallDescription = "A small API to play with Daikoku exposition",
        tags = Set("test_tag"),
        description = "# My Awesome API",
        currentVersion = Version("1.0.0"),
        supportedVersions = Set(Version("1.0.0")),
        visibility = ApiVisibility.Public,
        documentation = ApiDocumentation(
          id = ApiDocumentationId(IdGenerator.token(32)),
          tenant = _tenant.id,
          pages = Seq.empty,
          lastModificationAt = DateTime.now()
        ),
        swagger = None,
        state = ApiState.Created,
        possibleUsagePlans = Seq(draftApiPlan.id),
        defaultUsagePlan = draftApiPlan.id.some
      )

      val pwaApiPlan = UsagePlan(
        id = UsagePlanId("pwa_plan"),
        tenant = _tenant.id,
        customName = "pwa",
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(
                groups = Set(OtoroshiServiceGroupId("12345"))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val pwaApi = Api(
        id = ApiId(s"pwa_api"),
        tenant = _tenant.id,
        team = teamOwnerId,
        lastUpdate = DateTime.now(),
        name = s"Api - pwa",
        smallDescription = "A small API to play with Daikoku exposition",
        tags = Set.empty,
        description = "# My Awesome API",
        currentVersion = Version("1.0.0"),
        supportedVersions = Set(Version("1.0.0")),
        visibility = ApiVisibility.PublicWithAuthorizations,
        authorizedTeams = Seq(teamConsumerId),
        documentation = ApiDocumentation(
          id = ApiDocumentationId(IdGenerator.token(32)),
          tenant = _tenant.id,
          pages = Seq.empty,
          lastModificationAt = DateTime.now()
        ),
        swagger = None,
        state = ApiState.Published,
        possibleUsagePlans = Seq(pwaApiPlan.id),
        defaultUsagePlan = pwaApiPlan.id.some
      )

      val privateApiPlan = UsagePlan(
        id = UsagePlanId("private_plan"),
        tenant = _tenant.id,
        customName = "private",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(
                groups = Set(OtoroshiServiceGroupId("12345"))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val privateApi = Api(
        id = ApiId(s"private_api"),
        tenant = _tenant.id,
        team = teamOwnerId,
        lastUpdate = DateTime.now(),
        name = s"Api - private",
        smallDescription = "A small API to play with Daikoku exposition",
        tags = Set.empty,
        categories = Set("test_category"),
        description = "# My Awesome API",
        currentVersion = Version("1.0.0"),
        supportedVersions = Set(Version("1.0.0")),
        visibility = ApiVisibility.Private,
        authorizedTeams = Seq(teamConsumerId),
        documentation = ApiDocumentation(
          id = ApiDocumentationId(IdGenerator.token(32)),
          tenant = _tenant.id,
          pages = Seq.empty,
          lastModificationAt = DateTime.now()
        ),
        swagger = None,
        state = ApiState.Published,
        possibleUsagePlans = Seq(privateApiPlan.id),
        defaultUsagePlan = privateApiPlan.id.some
      )

      val publicApiPlanV1 = UsagePlan(
        id = UsagePlanId("public_plan_V1"),
        tenant = _tenant.id,
        customName = "public v1",
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(
                groups = Set(OtoroshiServiceGroupId("12345"))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val publicApiV1 = Api(
        id = ApiId(s"public_api_V1"),
        tenant = _tenant.id,
        team = teamOwnerId,
        lastUpdate = DateTime.now(),
        name = s"Api - public",
        smallDescription = "A small API to play with Daikoku exposition",
        tags = Set.empty,
        description = "# My Awesome API",
        currentVersion = Version("1.0.0"),
        isDefault = false,
        supportedVersions = Set(Version("1.0.0")),
        visibility = ApiVisibility.Public,
        documentation = ApiDocumentation(
          id = ApiDocumentationId(IdGenerator.token(32)),
          tenant = _tenant.id,
          pages = Seq.empty,
          lastModificationAt = DateTime.now()
        ),
        swagger = None,
        state = ApiState.Published,
        possibleUsagePlans = Seq(publicApiPlanV1.id),
        defaultUsagePlan = publicApiPlanV1.id.some
      )

      val publicApiPlanV2 = UsagePlan(
        id = UsagePlanId("public_plan_V2"),
        tenant = _tenant.id,
        customName = "public v2",
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(
                groups = Set(OtoroshiServiceGroupId("12345"))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val publicApiV2 = Api(
        id = ApiId(s"public_api_V2"),
        tenant = _tenant.id,
        team = teamOwnerId,
        lastUpdate = DateTime.now(),
        name = s"Api - public",
        smallDescription = "A small API to play with Daikoku exposition",
        tags = Set.empty,
        description = "# My Awesome API",
        currentVersion = Version("2.0.0"),
        isDefault = false,
        supportedVersions = Set(Version("2.0.0")),
        visibility = ApiVisibility.Public,
        documentation = ApiDocumentation(
          id = ApiDocumentationId(IdGenerator.token(32)),
          tenant = _tenant.id,
          pages = Seq.empty,
          lastModificationAt = DateTime.now()
        ),
        swagger = None,
        state = ApiState.Published,
        possibleUsagePlans = Seq(publicApiPlanV2.id),
        defaultUsagePlan = publicApiPlanV2.id.some,
        parent = publicApiV1.id.some
      )

      val publicApiPlanV3 = UsagePlan(
        id = UsagePlanId("public_plan_V3"),
        tenant = _tenant.id,
        customName = "public v3",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(
                groups = Set(OtoroshiServiceGroupId("12345"))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val publicApiV3 = Api(
        id = ApiId(s"public_api_V3"),
        tenant = _tenant.id,
        team = teamOwnerId,
        lastUpdate = DateTime.now(),
        name = s"Api - public",
        smallDescription = "A small API to play with Daikoku exposition",
        tags = Set("test_tag"),
        categories = Set("test_category"),
        description = "# My Awesome API",
        currentVersion = Version("3.0.0"),
        supportedVersions = Set(Version("3.0.0")),
        visibility = ApiVisibility.Public,
        documentation = ApiDocumentation(
          id = ApiDocumentationId(IdGenerator.token(32)),
          tenant = _tenant.id,
          pages = Seq.empty,
          lastModificationAt = DateTime.now()
        ),
        swagger = None,
        state = ApiState.Published,
        possibleUsagePlans = Seq(publicApiPlanV3.id),
        defaultUsagePlan = publicApiPlanV3.id.some,
        parent = publicApiV1.id.some
      )

      val apiGroup = Api(
        id = ApiId(s"public_api_group"),
        tenant = _tenant.id,
        team = teamOwnerId,
        lastUpdate = DateTime.now(),
        name = s"ApiGroup",
        smallDescription = "A API GROUP to play with Daikoku exposition",
        tags = Set.empty,
        description = "# My Awesome API GROUP",
        currentVersion = Version("1.0.0"),
        supportedVersions = Set(Version("1.0.0")),
        visibility = ApiVisibility.Public,
        documentation = ApiDocumentation(
          id = ApiDocumentationId(IdGenerator.token(32)),
          tenant = _tenant.id,
          pages = Seq.empty,
          lastModificationAt = DateTime.now()
        ),
        state = ApiState.Published,
        possibleUsagePlans = Seq.empty,
        defaultUsagePlan = None,
        apis = (apiList.map(_.api.id).toSet ++ Set(
          draftApi.id,
          pwaApi.id,
          privateApi.id,
          publicApiV1.id,
          publicApiV2.id,
          publicApiV3.id
        )).some
      )

      val unauthorizedUser = User(
        id = UserId("unauthorized_user"),
        tenants = Set(_tenant.id),
        origins = Set(AuthProvider.Local),
        name = "unauthorized guy",
        email = "unauthorized@gmail.com",
        lastTenant = _tenant.id.some,
        password = Some(BCrypt.hashpw("password", BCrypt.gensalt())),
        defaultLanguage = None
      )
      val unauthorizedTeam = Team(
        id = TeamId("unauthorized_team"),
        tenant = _tenant.id,
        `type` = TeamType.Organization,
        name = s"Unauthorized Team",
        description = s"The unauthorized team",
        users = Set(
          UserWithPermission(unauthorizedUser.id, Administrator)
        ),
        contact = "unauthorized_team@foo.test"
      )

      val graphQlTenantAdminTeam = defaultAdminTeam.copy(
        id = TeamId("graphql-test-tenant-admin-team"),
        tenant = _tenant.id,
        name = "graphql-test-tenant-admin-team"
      )
      setupEnvBlocking(
        tenants = Seq(_tenant),
        users = Seq(daikokuAdmin, userAdmin, user, unauthorizedUser),
        teams = Seq(
          graphQlTenantAdminTeam,
          teamOwner.copy(users =
            Set(UserWithPermission(userTeamAdminId, Administrator))
          ),
          teamConsumer
            .copy(users = Set(UserWithPermission(user.id, Administrator))),
          unauthorizedTeam
        ),
        apis = Seq(
          adminApi.copy(
            id = ApiId("admin-api-tenant-graphql-test"),
            tenant = _tenant.id,
            team = graphQlTenantAdminTeam.id
          ),
          cmsApi.copy(
            id = ApiId("cms-api-tenant-graphql-test"),
            tenant = _tenant.id,
            team = graphQlTenantAdminTeam.id
          ),
          draftApi,
          pwaApi,
          privateApi,
          publicApiV1,
          publicApiV2,
          publicApiV3,
          apiGroup
        ) ++ apiList.map(_.api),
        usagePlans = Seq(
          adminApiPlan,
          cmsApiPlan,
          draftApiPlan,
          pwaApiPlan,
          privateApiPlan,
          publicApiPlanV1,
          publicApiPlanV2,
          publicApiPlanV3
        ) ++ apiList.flatMap(_.plans)
      )

      val baseGraphQLQuery =
        s"""
           |query AllVisibleApis ($$filterTable: JsArray, $$sortingTable: JsArray, $$groupId: String, $$limit: Int, $$offset: Int) {
           |          visibleApis (filterTable: $$filterTable, sortingTable: $$sortingTable, groupId: $$groupId, limit: $$limit, offset: $$offset){
           |            apis {
           |              api {
           |                _id
           |                name
           |              }
           |            }
           |            total
           |            totalFiltered
           |          }
           |        }
           |""".stripMargin
      val graphQlRequestAllVisibleAPis = Json.obj(
        "variables" -> Json.obj("limit" -> 20, "offset" -> 0),
        "query" -> baseGraphQLQuery
      )
      val graphQlRequestAllVisibleAPisFroApiGroup = Json.obj(
        "variables" -> Json
          .obj("limit" -> 20, "offset" -> 0, "groupId" -> "public_api_group"),
        "query" -> baseGraphQLQuery
      )

      val daikokuAdminSession =
        loginWithBlocking(daikokuAdmin.copy(tenants = Set(_tenant.id)), _tenant)
      val teamOwnerAdminSession = loginWithBlocking(userAdmin, _tenant)
      val teamConsumerAdminSession = loginWithBlocking(user, _tenant)
      val unauthorizedUserSession = loginWithBlocking(unauthorizedUser, _tenant)

      // 2 admin api + 10 public API + draft + private + pwa + versionedV3 + apigroup = 17
      val respDaikokuAdmin = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPis.some
      )(using _tenant, daikokuAdminSession)
      respDaikokuAdmin.status mustBe 200

      (respDaikokuAdmin.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 17

      // 10 public API + draft + private + pwa + versionedV3 + apigroup = 15
      val respOwnerAdmin = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPis.some
      )(using _tenant, teamOwnerAdminSession)
      respOwnerAdmin.status mustBe 200
      (respOwnerAdmin.json \ "data" \ "visibleApis" \ "total").as[Int] mustBe 15

      // 10 public API + private + pwa + versionedV3 + apigroup = 14
      val respConsumerAdmin = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPis.some
      )(using _tenant, teamConsumerAdminSession)
      respConsumerAdmin.status mustBe 200
      (respConsumerAdmin.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 14

      // 10 public API + pwa + versionedV3 + apigroup = 13
      val respUnauthorizedAdmin = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPis.some
      )(using _tenant, unauthorizedUserSession)
      respUnauthorizedAdmin.status mustBe 200
      (respUnauthorizedAdmin.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 13

      // 10 public API + versionedV3 + apigroup = 12
      val respGuest = httpJsonCallWithoutSessionBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPis.some
      )(using _tenant)
      respGuest.status mustBe 200
      (respGuest.json \ "data" \ "visibleApis" \ "total").as[Int] mustBe 12

      // ########################
      // ###### APIGROUP ########
      // ########################

      // check usage of graphql query for apigroup
      // 10 public API + draft + private + pwa + versionedV3 = 14
      val respApiGroupDaikokuAdmin = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPisFroApiGroup.some
      )(using _tenant, daikokuAdminSession)
      respApiGroupDaikokuAdmin.status mustBe 200
      (respApiGroupDaikokuAdmin.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 14

      // check usage of graphql query for apigroup
      // 10 public API + draft + private + pwa + versionedV3 = 14
      val respApiGroupOwner = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPisFroApiGroup.some
      )(using _tenant, teamOwnerAdminSession)
      respApiGroupOwner.status mustBe 200
      (respApiGroupOwner.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 14

      // check usage of graphql query for apigroup
      // 10 public API + private + pwa + versionedV3 = 13
      val respApiGroupConsumer = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPisFroApiGroup.some
      )(using _tenant, teamConsumerAdminSession)
      respApiGroupConsumer.status mustBe 200
      (respApiGroupConsumer.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 13

      // check usage of graphql query for apigroup
      // 10 public API + pwa + versionedV3 = 12
      val respApiGroupUnauthorized = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPisFroApiGroup.some
      )(using _tenant, unauthorizedUserSession)
      respApiGroupUnauthorized.status mustBe 200
      (respApiGroupUnauthorized.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 12

      // check usage of graphql query for apigroup
      // 10 public API + versionedV3 = 11
      val respApiGroupGuest = httpJsonCallWithoutSessionBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPisFroApiGroup.some
      )(using _tenant)
      respApiGroupGuest.status mustBe 200
      (respApiGroupGuest.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 11

      // ########################
      // ###### FILTERS #########
      // ########################

      // todo: tags
      // cat
      // team
      // research

      // filter by tags ==> 2 apis
      val respOwnerAdminByTags = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json
              .obj(
                "limit" -> 20,
                "offset" -> 0,
                "filterTable" -> Json.stringify(
                  Json.arr(
                    Json.obj("id" -> "tag", "value" -> Json.arr("test_tag"))
                  )
                )
              ),
            "query" -> baseGraphQLQuery
          )
          .some
      )(using _tenant, teamOwnerAdminSession)
      respOwnerAdminByTags.status mustBe 200
      (respOwnerAdminByTags.json \ "data" \ "visibleApis" \ "totalFiltered")
        .as[Int] mustBe 2

      // filter by tags ==> 2 apis
//      val respOwnerAdminByCats = httpJsonCallBlocking(
//        path = s"/api/search",
//        "POST",
//        body = Json
//          .obj(
//            "variables" -> Json.obj(
//              "limit" -> 20,
//              "offset" -> 0,
//              "selectedCategory" -> "test_category"
//            ),
//            "query" -> baseGraphQLQuery
//          )
//          .some
//      )(_tenant, teamOwnerAdminSession)
//      respOwnerAdminByCats.status mustBe 200
//      (respOwnerAdminByCats.json \ "data" \ "visibleApis" \ "total")
//        .as[Int] mustBe 2

      // filter by team ==> 15 apis
      val respOwnerAdminByTeam = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(
              "limit" -> 20,
              "offset" -> 0,
              "filterTable" -> Json.stringify(
                Json.arr(
                  Json
                    .obj("id" -> "team", "value" -> Json.arr(teamOwnerId.value))
                )
              )
            ),
            "query" -> baseGraphQLQuery
          )
          .some
      )(using _tenant, teamOwnerAdminSession)
      respOwnerAdminByTeam.status mustBe 200
      (respOwnerAdminByTeam.json \ "data" \ "visibleApis" \ "totalFiltered")
        .as[Int] mustBe 15

      // filter by team ==> 1 apis
      val respOwnerAdminByResearch = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json
              .obj(
                "limit" -> 20,
                "offset" -> 0,
                "filterTable" -> Json.stringify(
                  Json.arr(Json.obj("id" -> "research", "value" -> "api - 9"))
                )
              ),
            "query" -> baseGraphQLQuery
          )
          .some
      )(using _tenant, teamOwnerAdminSession)
      respOwnerAdminByResearch.status mustBe 200
      (respOwnerAdminByResearch.json \ "data" \ "visibleApis" \ "totalFiltered")
        .as[Int] mustBe 1

      // pass apiV3 to draft ==> all user see v2 but owner see v3
      // 10 public API + private + pwa + versionedV2 + apigroup = 14
      Await.result(
        daikokuComponents.env.dataStore.apiRepo
          .forTenant(tenant)
          .save(publicApiV3.copy(state = Created)),
        5.seconds
      )

      val respConsumerAdminWithDraft = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPis.some
      )(using _tenant, teamConsumerAdminSession)
      respConsumerAdminWithDraft.status mustBe 200
      (respConsumerAdminWithDraft.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 14
      // check v2 instead of v3
      logger.info(Json.prettyPrint(respConsumerAdminWithDraft.json))
      (respConsumerAdminWithDraft.json \ "data" \ "visibleApis" \ "apis")
        .as[JsArray]
        .value
        .find(jsValue =>
          (jsValue \ "api" \ "_id").as[String] == "public_api_V2"
        ) mustBe defined
      (respConsumerAdminWithDraft.json \ "data" \ "visibleApis" \ "apis")
        .as[JsArray]
        .value
        .find(jsValue =>
          (jsValue \ "api" \ "_id").as[String] == "public_api_V3"
        ) mustBe empty

      // 10 public API + draft + private + pwa + versionedV3 + apigroup = 15
      val respOwnerAdminWithDraft = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPis.some
      )(using _tenant, teamOwnerAdminSession)
      respOwnerAdminWithDraft.status mustBe 200
      (respOwnerAdminWithDraft.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 15
      // check v2 instead of v3
      (respOwnerAdminWithDraft.json \ "data" \ "visibleApis" \ "apis")
        .as[JsArray]
        .value
        .find(jsValue =>
          (jsValue \ "api" \ "_id").as[String] == "public_api_V3"
        ) mustBe defined
      (respOwnerAdminWithDraft.json \ "data" \ "visibleApis" \ "apis")
        .as[JsArray]
        .value
        .find(jsValue =>
          (jsValue \ "api" \ "_id").as[String] == "public_api_V2"
        ) mustBe empty

    }

    "list all tags" in {
      Await.result(waitForDaikokuSetup(), 5.seconds)
      val _tenant = tenant.copy(isPrivate = false)

      val simplePlan = UsagePlan(
        id = UsagePlanId(s"public-api-plan"),
        tenant = _tenant.id,
        customName = "Free with quotas",
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(
                groups = Set(OtoroshiServiceGroupId("12345"))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val simpleApi = Api(
        id = ApiId(s"public-api"),
        tenant = _tenant.id,
        team = teamOwnerId,
        lastUpdate = DateTime.now(),
        name = s"Api - public",
        smallDescription = "A small API to play with Daikoku exposition",
        tags = Set("simple-tag"),
        categories = Set("simple-category"),
        description = "# My Awesome API",
        currentVersion = Version("1.0.0"),
        supportedVersions = Set(Version("1.0.0")),
        state = ApiState.Published,
        visibility = ApiVisibility.Public,
        documentation = ApiDocumentation(
          id = ApiDocumentationId(IdGenerator.token(32)),
          tenant = _tenant.id,
          pages = Seq.empty,
          lastModificationAt = DateTime.now()
        ),
        swagger = None,
        possibleUsagePlans = Seq(simplePlan.id),
        defaultUsagePlan = simplePlan.id.some
      )

      val draftApiPlan = UsagePlan(
        id = UsagePlanId("draft_plan"),
        tenant = _tenant.id,
        customName = "draft",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(
                groups = Set(OtoroshiServiceGroupId("12345"))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val draftApi = Api(
        id = ApiId(s"draft_api"),
        tenant = _tenant.id,
        team = teamOwnerId,
        lastUpdate = DateTime.now(),
        name = s"Api - draft",
        smallDescription = "A small API to play with Daikoku exposition",
        tags = Set("draft-tag"),
        categories = Set("draft-category"),
        description = "# My Awesome API",
        currentVersion = Version("1.0.0"),
        supportedVersions = Set(Version("1.0.0")),
        visibility = ApiVisibility.Public,
        documentation = ApiDocumentation(
          id = ApiDocumentationId(IdGenerator.token(32)),
          tenant = _tenant.id,
          pages = Seq.empty,
          lastModificationAt = DateTime.now()
        ),
        swagger = None,
        state = ApiState.Created,
        possibleUsagePlans = Seq(draftApiPlan.id),
        defaultUsagePlan = draftApiPlan.id.some
      )

      val pwaApiPlan = UsagePlan(
        id = UsagePlanId("pwa_plan"),
        tenant = _tenant.id,
        customName = "pwa",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(
                groups = Set(OtoroshiServiceGroupId("12345"))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val pwaApi = Api(
        id = ApiId(s"pwa_api"),
        tenant = _tenant.id,
        team = teamOwnerId,
        lastUpdate = DateTime.now(),
        name = s"Api - pwa",
        smallDescription = "A small API to play with Daikoku exposition",
        tags = Set("pwa-tag"),
        categories = Set("pwa-category"),
        description = "# My Awesome API",
        currentVersion = Version("1.0.0"),
        supportedVersions = Set(Version("1.0.0")),
        visibility = ApiVisibility.PublicWithAuthorizations,
        authorizedTeams = Seq(teamConsumerId),
        documentation = ApiDocumentation(
          id = ApiDocumentationId(IdGenerator.token(32)),
          tenant = _tenant.id,
          pages = Seq.empty,
          lastModificationAt = DateTime.now()
        ),
        swagger = None,
        state = ApiState.Published,
        possibleUsagePlans = Seq(pwaApiPlan.id),
        defaultUsagePlan = pwaApiPlan.id.some
      )

      val privateApiPlan = UsagePlan(
        id = UsagePlanId("private_plan"),
        tenant = _tenant.id,
        customName = "private",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(
                groups = Set(OtoroshiServiceGroupId("12345"))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val privateApi = Api(
        id = ApiId(s"private_api"),
        tenant = _tenant.id,
        team = teamOwnerId,
        lastUpdate = DateTime.now(),
        name = s"Api - private",
        smallDescription = "A small API to play with Daikoku exposition",
        tags = Set("private-tag"),
        categories = Set("private-category"),
        description = "# My Awesome API",
        currentVersion = Version("1.0.0"),
        supportedVersions = Set(Version("1.0.0")),
        visibility = ApiVisibility.Private,
        authorizedTeams = Seq(teamConsumerId),
        documentation = ApiDocumentation(
          id = ApiDocumentationId(IdGenerator.token(32)),
          tenant = _tenant.id,
          pages = Seq.empty,
          lastModificationAt = DateTime.now()
        ),
        swagger = None,
        state = ApiState.Published,
        possibleUsagePlans = Seq(privateApiPlan.id),
        defaultUsagePlan = privateApiPlan.id.some
      )

      val publicApiPlanV1 = UsagePlan(
        id = UsagePlanId("public_plan_V1"),
        tenant = _tenant.id,
        customName = "public v1",
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(
                groups = Set(OtoroshiServiceGroupId("12345"))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val publicApiV1 = Api(
        id = ApiId(s"public_api_V1"),
        tenant = _tenant.id,
        team = teamOwnerId,
        lastUpdate = DateTime.now(),
        name = s"Api - public v1",
        smallDescription = "A small API to play with Daikoku exposition",
        tags = Set("V1-tag"),
        categories = Set("V1-categories"),
        description = "# My Awesome API",
        currentVersion = Version("1.0.0"),
        isDefault = false,
        supportedVersions = Set(Version("1.0.0")),
        visibility = ApiVisibility.Public,
        documentation = ApiDocumentation(
          id = ApiDocumentationId(IdGenerator.token(32)),
          tenant = _tenant.id,
          pages = Seq.empty,
          lastModificationAt = DateTime.now()
        ),
        swagger = None,
        state = ApiState.Published,
        possibleUsagePlans = Seq(publicApiPlanV1.id),
        defaultUsagePlan = publicApiPlanV1.id.some
      )

      val publicApiPlanV2 = UsagePlan(
        id = UsagePlanId("public_plan_V2"),
        tenant = _tenant.id,
        customName = "public v2",
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(
                groups = Set(OtoroshiServiceGroupId("12345"))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val publicApiV2 = Api(
        id = ApiId(s"public_api_V2"),
        tenant = _tenant.id,
        team = teamOwnerId,
        lastUpdate = DateTime.now(),
        name = s"Api - public v2",
        smallDescription = "A small API to play with Daikoku exposition",
        tags = Set("V2-tag"),
        categories = Set("V2-categories"),
        description = "# My Awesome API",
        currentVersion = Version("2.0.0"),
        isDefault = false,
        supportedVersions = Set(Version("2.0.0")),
        visibility = ApiVisibility.Public,
        documentation = ApiDocumentation(
          id = ApiDocumentationId(IdGenerator.token(32)),
          tenant = _tenant.id,
          pages = Seq.empty,
          lastModificationAt = DateTime.now()
        ),
        swagger = None,
        state = ApiState.Published,
        possibleUsagePlans = Seq(publicApiPlanV2.id),
        defaultUsagePlan = publicApiPlanV2.id.some,
        parent = publicApiV1.id.some
      )

      val publicApiPlanV3 = UsagePlan(
        id = UsagePlanId("public_plan_V3"),
        tenant = _tenant.id,
        customName = "public v3",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(
                groups = Set(OtoroshiServiceGroupId("12345"))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val publicApiV3 = Api(
        id = ApiId(s"public_api_V3"),
        tenant = _tenant.id,
        team = teamOwnerId,
        lastUpdate = DateTime.now(),
        name = s"Api - public v3",
        smallDescription = "A small API to play with Daikoku exposition",
        tags = Set("V3_tag", "simple-tag"),
        categories = Set("V3-category", "simple-category"),
        description = "# My Awesome API",
        currentVersion = Version("3.0.0"),
        supportedVersions = Set(Version("3.0.0")),
        visibility = ApiVisibility.Public,
        documentation = ApiDocumentation(
          id = ApiDocumentationId(IdGenerator.token(32)),
          tenant = _tenant.id,
          pages = Seq.empty,
          lastModificationAt = DateTime.now()
        ),
        swagger = None,
        state = ApiState.Published,
        possibleUsagePlans = Seq(publicApiPlanV3.id),
        defaultUsagePlan = publicApiPlanV3.id.some,
        parent = publicApiV1.id.some
      )

      val apiGroup = Api(
        id = ApiId(s"public_api_group"),
        tenant = _tenant.id,
        team = teamOwnerId,
        lastUpdate = DateTime.now(),
        name = s"ApiGroup",
        smallDescription = "A API GROUP to play with Daikoku exposition",
        tags = Set("group-tag"),
        categories = Set("group-category"),
        description = "# My Awesome API GROUP",
        currentVersion = Version("1.0.0"),
        supportedVersions = Set(Version("1.0.0")),
        visibility = ApiVisibility.Public,
        documentation = ApiDocumentation(
          id = ApiDocumentationId(IdGenerator.token(32)),
          tenant = _tenant.id,
          pages = Seq.empty,
          lastModificationAt = DateTime.now()
        ),
        state = ApiState.Published,
        possibleUsagePlans = Seq.empty,
        defaultUsagePlan = None,
        apis = (Set(
          simpleApi.id,
          draftApi.id,
          pwaApi.id,
          privateApi.id,
          publicApiV1.id,
          publicApiV2.id,
          publicApiV3.id
        )).some
      )

      val unauthorizedUser = User(
        id = UserId("unauthorized_user"),
        tenants = Set(_tenant.id),
        origins = Set(AuthProvider.Local),
        name = "unauthorized guy",
        email = "unauthorized@gmail.com",
        lastTenant = _tenant.id.some,
        password = Some(BCrypt.hashpw("password", BCrypt.gensalt())),
        defaultLanguage = None
      )
      val unauthorizedTeam = Team(
        id = TeamId("unauthorized_team"),
        tenant = _tenant.id,
        `type` = TeamType.Organization,
        name = s"Unauthorized Team",
        description = s"The unauthorized team",
        users = Set(
          UserWithPermission(unauthorizedUser.id, Administrator)
        ),
        contact = "unauthorized_team@foo.test"
      )

      val graphQlTenantAdminTeam = defaultAdminTeam.copy(
        id = TeamId("graphql-test-tenant-admin-team"),
        tenant = _tenant.id,
        name = "graphql-test-tenant-admin-team"
      )
      setupEnvBlocking(
        tenants = Seq(_tenant),
        users = Seq(daikokuAdmin, userAdmin, user, unauthorizedUser),
        teams = Seq(
          graphQlTenantAdminTeam,
          teamOwner.copy(users =
            Set(UserWithPermission(userTeamAdminId, Administrator))
          ),
          teamConsumer
            .copy(users = Set(UserWithPermission(user.id, Administrator))),
          unauthorizedTeam
        ),
        apis = Seq(
          adminApi.copy(
            id = ApiId("admin-api-tenant-graphql-test"),
            tenant = _tenant.id,
            team = graphQlTenantAdminTeam.id
          ),
          cmsApi.copy(
            id = ApiId("cms-api-tenant-graphql-test"),
            tenant = _tenant.id,
            team = graphQlTenantAdminTeam.id
          ),
          simpleApi,
          draftApi,
          pwaApi,
          privateApi,
          publicApiV1,
          publicApiV2,
          publicApiV3,
          apiGroup
        ),
        usagePlans = Seq(
          adminApiPlan,
          cmsApiPlan,
          simplePlan,
          draftApiPlan,
          pwaApiPlan,
          privateApiPlan,
          publicApiPlanV1,
          publicApiPlanV2,
          publicApiPlanV3
        )
      )

      val allTagsGraphQLQuery =
        s"""
           |query getAllTags ($$research: String, $$groupId: String, $$selectedTeam: String, $$selectedTag: String, $$selectedCategory: String, $$filter: String, $$limit: Int, $$offset: Int){
           |  allTags (research: $$research, groupId: $$groupId, selectedTeam: $$selectedTeam, selectedTag: $$selectedTag, selectedCategory: $$selectedCategory, filter: $$filter, limit: $$limit, offset: $$offset)
           |}
           |""".stripMargin

      val allCategoriesGraphQLQuery =
        s"""
           |query getAllCategories ($$research: String, $$groupId: String, $$selectedTeam: String, $$selectedTag: String, $$selectedCategory: String, $$filter: String, $$limit: Int, $$offset: Int){
           |  allCategories (research: $$research, groupId: $$groupId, selectedTeam: $$selectedTeam, selectedTag: $$selectedTag, selectedCategory: $$selectedCategory, filter: $$filter, limit: $$limit, offset: $$offset)
           |}
           |""".stripMargin

      val daikokuAdminSession =
        loginWithBlocking(daikokuAdmin.copy(tenants = Set(_tenant.id)), _tenant)
      val teamOwnerAdminSession = loginWithBlocking(userAdmin, _tenant)
      val teamConsumerAdminSession = loginWithBlocking(user, _tenant)
      val unauthorizedUserSession = loginWithBlocking(unauthorizedUser, _tenant)

      // adminApi + cmsApi + simpleTag + draftTag + privateTag + pwaTag + V3Tag + groupTag = 8
      val respAllTagsDaikokuAdmin = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(using _tenant, daikokuAdminSession)
      respAllTagsDaikokuAdmin.status mustBe 200
      (respAllTagsDaikokuAdmin.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 8

      // simpleTag + draftTag + privateTag + pwaTag + V3Tag + groupTag = 6
      val respAllTagsTeamOwner = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(using _tenant, teamOwnerAdminSession)
      respAllTagsTeamOwner.status mustBe 200
      (respAllTagsTeamOwner.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 6

      // simpleTag + privateTag + pwaTag + V3Tag + groupTag = 5
      val respAllTagsTeamConsumer = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(using _tenant, teamConsumerAdminSession)
      respAllTagsTeamConsumer.status mustBe 200
      (respAllTagsTeamConsumer.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 5

      // simpleTag + pwaTag + V3Tag + groupTag = 4
      val respAllTagsUnauthorized = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(using _tenant, unauthorizedUserSession)
      respAllTagsUnauthorized.status mustBe 200
      (respAllTagsUnauthorized.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 4

      // simpleTag + V3Tag + groupTag = 3
      val respAllTagsGuest = httpJsonCallWithoutSessionBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(using _tenant)
      respAllTagsGuest.status mustBe 200
      (respAllTagsGuest.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 3

      // simpleTag + draftTag + privateTag + pwaTag + V3Tag = 5
      val respAllTagsWithGroupDaikokuAdmin = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("groupId" -> apiGroup.id.asJson),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(using _tenant, daikokuAdminSession)
      respAllTagsWithGroupDaikokuAdmin.status mustBe 200
      (respAllTagsWithGroupDaikokuAdmin.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 5

      // simpleTag + draftTag + privateTag + pwaTag + V3Tag = 5
      val respAllTagsWithGroupTeamOwner = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("groupId" -> apiGroup.id.asJson),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(using _tenant, teamOwnerAdminSession)
      respAllTagsWithGroupTeamOwner.status mustBe 200
      (respAllTagsWithGroupTeamOwner.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 5

      // simpleTag + privateTag + pwaTag + V3Tag = 4
      val respAllTagsWithGroupTeamConsumer = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("groupId" -> apiGroup.id.asJson),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(using _tenant, teamConsumerAdminSession)
      respAllTagsWithGroupTeamConsumer.status mustBe 200
      (respAllTagsWithGroupTeamConsumer.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 4

      // simpleTag + pwaTag + V3Tag = 3
      val respAllTagsWithgroupUnauthorized = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("groupId" -> apiGroup.id.asJson),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(using _tenant, unauthorizedUserSession)
      respAllTagsWithgroupUnauthorized.status mustBe 200
      (respAllTagsWithgroupUnauthorized.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 3

      // simpleTag + V3Tag = 2
      val respAllTagsWithGroupGuest = httpJsonCallWithoutSessionBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("groupId" -> apiGroup.id.asJson),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(using _tenant)
      respAllTagsWithGroupGuest.status mustBe 200
      (respAllTagsWithGroupGuest.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 2

      // simpleTag =
      val respAllTagsWithResearchGuest = httpJsonCallWithoutSessionBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("filter" -> "simple"),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(using _tenant)
      respAllTagsWithResearchGuest.status mustBe 200
      (respAllTagsWithResearchGuest.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 1
      (respAllTagsWithResearchGuest.json \ "data" \ "allTags")
        .as[Seq[String]]
        .contains("simple-tag") mustBe true

      // test limit
      val respAllTagsWithLimitTeamOwner = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("limit" -> 2),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(using _tenant, teamOwnerAdminSession)
      respAllTagsWithLimitTeamOwner.status mustBe 200
      (respAllTagsWithLimitTeamOwner.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 2
      (respAllTagsWithLimitTeamOwner.json \ "data" \ "allTags")
        .as[Seq[String]]
        .toSet
        .subsetOf(Set("draft-tag", "group-tag")) mustBe true

      // test offset
      val respAllTagsWithOffsetTeamOwner = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("limit" -> 2, "offset" -> 2),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(using _tenant, teamOwnerAdminSession)
      respAllTagsWithOffsetTeamOwner.status mustBe 200
      (respAllTagsWithOffsetTeamOwner.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 2
      (respAllTagsWithOffsetTeamOwner.json \ "data" \ "allTags")
        .as[Seq[String]]
        .toSet
        .subsetOf(Set("private-tag", "pwa-tag")) mustBe true

      // ################## categories

      // administration + simpleTag + draftTag + privateTag + pwaTag + V3Tag + groupTag = 7
      val respAllCatDaikokuAdmin = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(using _tenant, daikokuAdminSession)
      respAllCatDaikokuAdmin.status mustBe 200
      (respAllCatDaikokuAdmin.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 7

      // simpleTag + draftTag + privateTag + pwaTag + V3Tag + groupTag = 6
      val respAllCatTeamOwner = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(using _tenant, teamOwnerAdminSession)
      respAllCatTeamOwner.status mustBe 200
      (respAllCatTeamOwner.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 6

      // simpleTag + privateTag + pwaTag + V3Tag + groupTag = 5
      val respAllCatTeamConsumer = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(using _tenant, teamConsumerAdminSession)
      respAllCatTeamConsumer.status mustBe 200
      (respAllCatTeamConsumer.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 5

      // simpleTag + pwaTag + V3Tag + groupTag = 4
      val respAllCatUnauthorized = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(using _tenant, unauthorizedUserSession)
      respAllCatUnauthorized.status mustBe 200
      (respAllCatUnauthorized.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 4

      // simpleTag + V3Tag + groupTag = 3
      val respAllCatGuest = httpJsonCallWithoutSessionBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(using _tenant)
      respAllCatGuest.status mustBe 200
      (respAllCatGuest.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 3

      // simpleTag + draftTag + privateTag + pwaTag + V3Tag = 5
      val respAllCatWithGroupDaikokuAdmin = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("groupId" -> apiGroup.id.asJson),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(using _tenant, daikokuAdminSession)
      respAllCatWithGroupDaikokuAdmin.status mustBe 200
      (respAllCatWithGroupDaikokuAdmin.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 5

      // simpleTag + draftTag + privateTag + pwaTag + V3Tag = 5
      val respAllCatWithGroupTeamOwner = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("groupId" -> apiGroup.id.asJson),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(using _tenant, teamOwnerAdminSession)
      respAllCatWithGroupTeamOwner.status mustBe 200
      (respAllCatWithGroupTeamOwner.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 5

      // simpleTag + privateTag + pwaTag + V3Tag = 4
      val respAllCatWithGroupTeamConsumer = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("groupId" -> apiGroup.id.asJson),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(using _tenant, teamConsumerAdminSession)
      respAllCatWithGroupTeamConsumer.status mustBe 200
      (respAllCatWithGroupTeamConsumer.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 4

      // simpleTag + pwaTag + V3Tag = 3
      val respAllCatWithGroupUnauthorized = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("groupId" -> apiGroup.id.asJson),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(using _tenant, unauthorizedUserSession)
      respAllCatWithGroupUnauthorized.status mustBe 200
      (respAllCatWithGroupUnauthorized.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 3

      // simpleTag + V3Tag = 2
      val respAllCatWithGroupGuest = httpJsonCallWithoutSessionBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("groupId" -> apiGroup.id.asJson),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(using _tenant)
      respAllCatWithGroupGuest.status mustBe 200
      (respAllCatWithGroupGuest.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 2

      val respAllCatWithResearchGuest = httpJsonCallWithoutSessionBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("filter" -> "simple"),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(using _tenant)
      respAllCatWithResearchGuest.status mustBe 200
      (respAllCatWithResearchGuest.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 1

      // test limit
      val respAllCategoriesWithLimitTeamOwner = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("limit" -> 2),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(using _tenant, teamOwnerAdminSession)
      respAllCategoriesWithLimitTeamOwner.status mustBe 200
      (respAllCategoriesWithLimitTeamOwner.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 2
      (respAllCategoriesWithLimitTeamOwner.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .toSet
        .subsetOf(Set("draft-category", "group-category")) mustBe true

      // test offset
      val respAllCategoriesWithOffsetTeamOwner = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("limit" -> 2, "offset" -> 2),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(using _tenant, teamOwnerAdminSession)
      respAllCategoriesWithOffsetTeamOwner.status mustBe 200
      (respAllCategoriesWithOffsetTeamOwner.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 2
      (respAllCategoriesWithOffsetTeamOwner.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .toSet
        .subsetOf(Set("private-category", "pwa-category")) mustBe true
    }

  }
  "the pending demands of a team" should {
    "be listed page by page, each with the name of its current step" in {
      Await.result(waitForDaikokuSetup(), 5.second)
      val api = defaultApi.api
      val plan = defaultApi.plans.head

      def awaitingPayment(id: String): SubscriptionDemand =
        SubscriptionDemand(
          id = DemandId(id),
          tenant = tenant.id,
          api = api.id,
          plan = plan.id,
          steps = Seq(
            SubscriptionDemandStep(
              id = SubscriptionDemandStepId(s"$id-payment"),
              state = SubscriptionDemandState.InProgress,
              step = ValidationStep.Payment(
                id = "payment",
                thirdPartyPaymentSettingsId = ThirdPartyPaymentSettingsId("stripe")
              )
            )
          ),
          state = SubscriptionDemandState.InProgress,
          team = teamConsumerId,
          from = userAdmin.id
        )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(api),
        usagePlans = defaultApi.plans,
        subscriptionDemands =
          Seq("demand-1", "demand-2", "demand-3").map(awaitingPayment)
      )
      val session = loginWithBlocking(userAdmin, tenant)

      def page(field: String, teamId: TeamId, offset: Int): JsValue = {
        val response = httpJsonCallBlocking(
          path = "/api/search",
          method = "POST",
          body = Some(
            Json.obj(
              "query" ->
                s"""{ $field(teamId: "${teamId.value}", limit: 2, offset: $offset) {
                   |  total
                   |  subscriptionDemands { _id steps { state step { name } } }
                   |} }""".stripMargin
            )
          )
        )(using tenant, session)

        response.status mustBe 200
        (response.json \ "errors").isDefined mustBe false
        (response.json \ "data" \ field).as[JsValue]
      }

      // the offset is a page number, which the tables rely on
      val secondConsumerPage =
        page("teamSubscriptionDemands", teamConsumerId, offset = 1)
      val consumerDemands =
        (secondConsumerPage \ "subscriptionDemands").as[Seq[JsValue]]
      (secondConsumerPage \ "total").as[Int] mustBe 3
      consumerDemands.size mustBe 1
      (consumerDemands.head \ "steps" \ 0 \ "step" \ "name")
        .as[String] mustBe "payment"

      val firstProducerPage =
        page("subscriptionDemandsForAdmin", teamOwnerId, offset = 0)
      (firstProducerPage \ "total").as[Int] mustBe 3
      (firstProducerPage \ "subscriptionDemands")
        .as[Seq[JsValue]]
        .size mustBe 2
    }
  }

  "myNotifications query" should {
    "return only notifications from the current tenant" in {
      Await.result(waitForDaikokuSetup(), 5.second)

      val apiTenant1 = defaultApi.api
        .copy(
          possibleUsagePlans = Seq.empty,
          defaultUsagePlan = None
        )
      val teamConsumerTenant1 = teamConsumer
      val teamOwnerTenant1 = teamOwner
      val notifTenant1 = Notification(
        id = NotificationId("notif-tenant-1"),
        tenant = tenant.id,
        team = teamOwnerTenant1.id.some,
        sender = userAdmin.asNotificationSender,
        action =
          NotificationAction.ApiAccess(apiTenant1.id, teamConsumerTenant1.id)
      )

      val teamConsumerTenant2 = teamConsumer.copy(
        id = TeamId(IdGenerator.token(16)),
        tenant = tenant2.id
      )
      val teamOwnerTenant2 = teamOwner.copy(
        id = TeamId(IdGenerator.token(16)),
        tenant = tenant2.id
      )
      val apiTenant2 = defaultApi.api.copy(
        id = ApiId(IdGenerator.token(16)),
        tenant = tenant2.id,
        possibleUsagePlans = Seq.empty,
        team = teamOwnerTenant2.id
      )

      val notifTenant2 = Notification(
        id = NotificationId("notif-tenant-2"),
        tenant = tenant2.id,
        team = teamOwnerTenant2.id.some,
        sender = userAdmin.asNotificationSender,
        action = NotificationAction.ApiAccess(
          defaultApi.api.id,
          teamConsumerTenant2.id
        )
      )

      setupEnvBlocking(
        tenants = Seq(tenant, tenant2),
        users = Seq(userAdmin),
        teams = Seq(
          teamOwnerTenant1,
          teamConsumerTenant1,
          teamOwnerTenant2,
          teamConsumerTenant2
        ),
        apis = Seq(apiTenant1, apiTenant2),
        notifications = Seq(notifTenant1, notifTenant2)
      )

      val session = loginWithBlocking(userAdmin, tenant)

      val query =
        """|query getMyNotifications ($limit : Int, $offset: Int, $filterTable: JsArray) {
           |      myNotifications (limit: $limit, offset: $offset, filterTable: $filterTable) {
           |        notifications {
           |          _id
           |        }
           |        total,
           |        totalFiltered,
           |      }
           |}""".stripMargin

      val resp = httpJsonCallBlocking(
        path = "/api/search",
        method = "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(
              "filter" -> Json.arr(),
              "sort" -> Json.arr(),
              "limit" -> 10,
              "offset" -> 0
            ),
            "query" -> query
          )
          .some
      )(using tenant, session)

      resp.status mustBe 200
      val total = (resp.json \ "data" \ "myNotifications" \ "total").as[Int]
      val ids = (resp.json \ "data" \ "myNotifications" \ "notifications")
        .as[Seq[play.api.libs.json.JsValue]]
        .map(n => (n \ "_id").as[String])

      total mustBe 1
      ids must contain("notif-tenant-1")
      ids must not contain "notif-tenant-2"
    }
  }

  "GraphQL security" should {

    "block non-admin users from accessing admin-only POJO entities" in {
      Await.result(waitForDaikokuSetup(), 5.second)
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(
          teamOwner.copy(
            tenant = tenant.id,
            users = Set(UserWithPermission(userAdmin.id, Administrator))
          )
        )
      )
      val session =
        loginWithBlocking(userAdmin.copy(tenants = Set(tenant.id)), tenant)

      def assertAdminOnlyQuery(query: String): Unit = {
        val resp = httpJsonCallBlocking(
          path = "/api/search",
          method = "POST",
          body = Json.obj("query" -> query).some
        )(using tenant, session)
        resp.status mustBe 200
        val errors = (resp.json \ "errors").asOpt[JsArray]
        errors.isDefined mustBe true
        val firstError = errors.get.value.head
        (firstError \ "extensions" \ "code").asOpt[String] mustBe Some(
          "UNAUTHORIZED"
        )
      }

      assertAdminOnlyQuery("""{ users { id } }""")
      assertAdminOnlyQuery("""{ passwordResets { _id } }""")
      assertAdminOnlyQuery("""{ apiSubscriptions { _id } }""")
      assertAdminOnlyQuery("""{ userSessions { _id } }""")
      assertAdminOnlyQuery("""{ notifications { _id } }""")
      assertAdminOnlyQuery("""{ auditEvents { id } }""")
    }

    "allow daikoku admin to access admin-only POJO entities" in {
      Await.result(waitForDaikokuSetup(), 5.second)
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam.copy(tenant = tenant.id))
      )
      val session =
        loginWithBlocking(daikokuAdmin.copy(tenants = Set(tenant.id)), tenant)

      def assertAdminCanQuery(query: String): Unit = {
        val resp = httpJsonCallBlocking(
          path = "/api/search",
          method = "POST",
          body = Json.obj("query" -> query).some
        )(using tenant, session)
        resp.status mustBe 200
        (resp.json \ "errors").isDefined mustBe false
      }

      assertAdminCanQuery("""{ users { id } }""")
      assertAdminCanQuery("""{ userSessions { _id } }""")
      assertAdminCanQuery("""{ notifications { _id } }""")
    }

    "allow admin-api endpoint to access admin-only POJO entities using an admin API key" in {
      Await.result(waitForDaikokuSetup(), 5.second)
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam.copy(tenant = tenant.id)),
        keyrings = Seq(adminApiKeyring),
        subscriptions = Seq(adminApiSubscription)
      )

      val adminApiHeader = Map(
        "Authorization" -> s"Basic ${Base64.getEncoder.encodeToString(
            s"${adminApiKeyring.apiKey.clientId}:${adminApiKeyring.apiKey.clientSecret}".getBytes()
          )}"
      )

      def assertAdminApiCanQuery(query: String): Unit = {
        val resp = httpJsonCallWithoutSessionBlocking(
          path = "/admin-api/search",
          method = "POST",
          headers = adminApiHeader,
          body = Json.obj("query" -> query).some
        )(using tenant)
        resp.status mustBe 200
        (resp.json \ "errors").isDefined mustBe false
      }

      assertAdminApiCanQuery("""{ users { id } }""")
      assertAdminApiCanQuery("""{ userSessions { _id } }""")
      assertAdminApiCanQuery("""{ notifications { _id } }""")
    }

    "allow authenticated users to access email via RequiresAuthentication" in {
      Await.result(waitForDaikokuSetup(), 5.second)
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(
          teamOwner.copy(
            tenant = tenant.id,
            users = Set(UserWithPermission(userAdmin.id, Administrator))
          )
        )
      )
      val session =
        loginWithBlocking(userAdmin.copy(tenants = Set(tenant.id)), tenant)

      val query = """{ myTeams { users { user { email } } } }"""
      val resp = httpJsonCallBlocking(
        path = "/api/search",
        method = "POST",
        body = Json.obj("query" -> query).some
      )(using tenant, session)

      resp.status mustBe 200
      (resp.json \ "errors").isDefined mustBe false
      val emails = (resp.json \ "data" \ "myTeams")
        .as[Seq[play.api.libs.json.JsValue]]
        .flatMap(t => (t \ "users").as[Seq[play.api.libs.json.JsValue]])
        .flatMap(u =>
          (u \ "user")
            .asOpt[play.api.libs.json.JsValue]
            .flatMap(v => (v \ "email").asOpt[String])
        )
      emails must not be empty
    }

    "prevent guests from accessing team member emails" in {
      Await.result(waitForDaikokuSetup(), 5.second)
      val _tenant = tenant.copy(isPrivate = false)

      val plan = UsagePlan(
        id = UsagePlanId("guest-email-test-plan"),
        tenant = _tenant.id,
        customName = "guest-email-test-plan",
        otoroshiTarget = None,
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val api = Api(
        id = ApiId("guest-email-test-api"),
        tenant = _tenant.id,
        team = teamOwnerId,
        lastUpdate = org.joda.time.DateTime.now(),
        name = "guest-email-test-api",
        smallDescription = "test",
        description = "test",
        currentVersion = Version("1.0.0"),
        supportedVersions = Set(Version("1.0.0")),
        state = ApiState.Published,
        visibility = ApiVisibility.Public,
        documentation = ApiDocumentation(
          id = ApiDocumentationId(IdGenerator.token(32)),
          tenant = _tenant.id,
          pages = Seq.empty,
          lastModificationAt = org.joda.time.DateTime.now()
        ),
        swagger = None,
        possibleUsagePlans = Seq(plan.id),
        defaultUsagePlan = plan.id.some
      )

      setupEnvBlocking(
        tenants = Seq(_tenant),
        users = Seq(userAdmin),
        teams = Seq(
          teamOwner.copy(
            tenant = _tenant.id,
            users = Set(UserWithPermission(userAdmin.id, Administrator))
          )
        ),
        apis = Seq(api),
        usagePlans = Seq(plan)
      )

      val query =
        """|query {
           |  visibleApis(limit: 10, offset: 0) {
           |    apis {
           |      api {
           |        team {
           |          users {
           |            user {
           |              email
           |              isDaikokuAdmin
           |            }
           |          }
           |        }
           |      }
           |    }
           |  }
           |}""".stripMargin

      val resp = httpJsonCallWithoutSessionBlocking(
        path = "/api/search",
        method = "POST",
        body = Json.obj("query" -> query).some
      )(using _tenant)

      resp.status mustBe 200
      // The query is valid and succeeds — but team.users returns [] for non-members,
      // so no User object (and no email/isDaikokuAdmin) is ever resolved for a guest.
      (resp.json \ "errors").isDefined mustBe false
      val users = (resp.json \ "data" \ "visibleApis" \ "apis")
        .as[Seq[JsValue]]
        .flatMap(a => (a \ "api" \ "team" \ "users").as[Seq[JsValue]])
      users mustBe empty
    }

    "block non-admin team member from accessing apiKey when apiKeyVisibility=Administrator" in {
      Await.result(waitForDaikokuSetup(), 5.second)

      val plan = UsagePlan(
        id = UsagePlanId("sec-test-plan"),
        tenant = tenant.id,
        customName = "sec-test-plan",
        otoroshiTarget = None,
        allowMultipleKeys = Some(false),
        subscriptionProcess = SubscriptionProcess(),
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val api = Api(
        id = ApiId("sec-test-api"),
        tenant = tenant.id,
        team = teamOwnerId,
        lastUpdate = org.joda.time.DateTime.now(),
        name = "sec-test-api",
        smallDescription = "sec test",
        description = "sec test",
        currentVersion = Version("1.0.0"),
        supportedVersions = Set(Version("1.0.0")),
        state = ApiState.Published,
        visibility = ApiVisibility.Public,
        documentation = ApiDocumentation(
          id = ApiDocumentationId(IdGenerator.token(32)),
          tenant = tenant.id,
          pages = Seq.empty,
          lastModificationAt = org.joda.time.DateTime.now()
        ),
        swagger = None,
        possibleUsagePlans = Seq(plan.id),
        defaultUsagePlan = plan.id.some
      )
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = OtoroshiApiKey("sec-test-key", "sec-client-id", "sec-secret"),
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        customName = "teamConsumer-apiName-planName-firstKeyring",
        integrationToken = IdGenerator.token(32)
      )
      val subscription = ApiSubscription(
        id = ApiSubscriptionId("sec-test-sub"),
        tenant = tenant.id,
        plan = plan.id,
        createdAt = org.joda.time.DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = userAdmin.id,
        customName = None,
        keyring = keyring.id
      )

      // teamConsumer with apiKeyVisibility=Administrator: only Admins see the key
      val secTeamConsumer = teamConsumer.copy(
        tenant = tenant.id,
        apiKeyVisibility = Some(TeamApiKeyVisibility.Administrator),
        users = Set(
          UserWithPermission(userTeamAdminId, Administrator),
          UserWithPermission(userApiEditorId, ApiEditor)
        )
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, userAdmin, userApiEditor),
        teams = Seq(
          defaultAdminTeam,
          teamOwner.copy(users =
            Set(UserWithPermission(userTeamAdminId, Administrator))
          ),
          secTeamConsumer
        ),
        apis = Seq(api),
        usagePlans = Seq(plan),
        keyrings = Seq(keyring),
        subscriptions = Seq(subscription)
      )

      val apiEditorSession = loginWithBlocking(userApiEditor, tenant)
      val adminSession = loginWithBlocking(userAdmin, tenant)
      val daikokuAdminSession = loginWithBlocking(daikokuAdmin, tenant)

      val query =
        s"""|{
            |  apiSubscriptionDetails(subscriptionId: "sec-test-sub", teamId: "${teamConsumerId.value}") {
            |    apiSubscription {
            |      keyring {
            |        apiKey { clientSecret }
            |      }
            |    }
            |  }
            |}""".stripMargin

      // ApiEditor in team: apiKeyVisibility=Administrator → blocked
      val respEditor = httpJsonCallBlocking(
        path = "/api/search",
        method = "POST",
        body = Json.obj("query" -> query).some
      )(using tenant, apiEditorSession)
      respEditor.status mustBe 200
      (respEditor.json \ "errors").isDefined mustBe true
      ((respEditor.json \ "errors").as[JsArray].value.head \ "message")
        .as[String] mustBe "Access to API key denied"

      // Administrator in team: allowed
      val respAdmin = httpJsonCallBlocking(
        path = "/api/search",
        method = "POST",
        body = Json.obj("query" -> query).some
      )(using tenant, adminSession)
      respAdmin.status mustBe 200
      (respAdmin.json \ "errors").isDefined mustBe false
      (respAdmin.json \ "data" \ "apiSubscriptionDetails" \ "apiSubscription" \ "keyring" \ "apiKey" \ "clientSecret")
        .asOpt[String] mustBe Some("sec-secret")

      // DaikokuAdmin: always allowed regardless of team role
      val respDaikokuAdmin = httpJsonCallBlocking(
        path = "/api/search",
        method = "POST",
        body = Json.obj("query" -> query).some
      )(using tenant, daikokuAdminSession)
      respDaikokuAdmin.status mustBe 200
      (respDaikokuAdmin.json \ "errors").isDefined mustBe false
      (respDaikokuAdmin.json \ "data" \ "apiSubscriptionDetails" \ "apiSubscription" \ "keyring" \ "apiKey" \ "clientSecret")
        .asOpt[String] mustBe Some("sec-secret")
    }
  }

}
