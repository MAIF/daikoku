package fr.maif.otoroshi.daikoku.tests

import cats.implicits.catsSyntaxOptionId
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.login.AuthProvider
import fr.maif.otoroshi.daikoku.tests.utils.DaikokuSpecHelper
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import org.joda.time.DateTime
import org.mindrot.jbcrypt.BCrypt
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.Json

import scala.concurrent.duration._

class GraphQLControllerSpec()
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience {

  "with graphql query a user" can {
    "list all visible apis - Home page" in {
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
            subscriptionProcess = Seq.empty,
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
        subscriptionProcess = Seq.empty,
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
        subscriptionProcess = Seq.empty,
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
        subscriptionProcess = Seq.empty,
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
        subscriptionProcess = Seq.empty,
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
        subscriptionProcess = Seq.empty,
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
        subscriptionProcess = Seq.empty,
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
        personalToken = Some(IdGenerator.token(32)),
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
           |query AllVisibleApis ($$teamId: String, $$research: String, $$selectedTeam: String, $$selectedTag: String, $$selectedCategory: String, $$limit: Int, $$offset: Int, $$groupId: String) {
           |          visibleApis (teamId: $$teamId, research: $$research, selectedTeam: $$selectedTeam, selectedTag: $$selectedTag, selectedCategory: $$selectedCategory, limit: $$limit, offset: $$offset, groupId: $$groupId){
           |            apis {
           |              api {
           |                _id
           |                name
           |              }
           |            }
           |            total
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

      //2 admin api + 10 public API + draft + private + pwa + versionedV3 + apigroup = 17
      val respDaikokuAdmin = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPis.some
      )(_tenant, daikokuAdminSession)
      respDaikokuAdmin.status mustBe 200
      (respDaikokuAdmin.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 17

      //10 public API + draft + private + pwa + versionedV3 + apigroup = 15
      val respOwnerAdmin = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPis.some
      )(_tenant, teamOwnerAdminSession)
      respOwnerAdmin.status mustBe 200
      (respOwnerAdmin.json \ "data" \ "visibleApis" \ "total").as[Int] mustBe 15

      //10 public API + private + pwa + versionedV3 + apigroup = 14
      val respConsumerAdmin = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPis.some
      )(_tenant, teamConsumerAdminSession)
      respConsumerAdmin.status mustBe 200
      (respConsumerAdmin.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 14

      //10 public API + pwa + versionedV3 + apigroup = 13
      val respUnauthorizedAdmin = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPis.some
      )(_tenant, unauthorizedUserSession)
      respUnauthorizedAdmin.status mustBe 200
      (respUnauthorizedAdmin.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 13

      //10 public API + versionedV3 + apigroup = 12
      val respGuest = httpJsonCallWithoutSessionBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPis.some
      )(_tenant)
      respGuest.status mustBe 200
      (respGuest.json \ "data" \ "visibleApis" \ "total").as[Int] mustBe 12

      //########################
      //###### APIGROUP ########
      //########################

      //check usage of graphql query for apigroup
      //10 public API + draft + private + pwa + versionedV3 = 14
      val respApiGroupDaikokuAdmin = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPisFroApiGroup.some
      )(_tenant, daikokuAdminSession)
      respApiGroupDaikokuAdmin.status mustBe 200
      (respApiGroupDaikokuAdmin.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 14

      //check usage of graphql query for apigroup
      //10 public API + draft + private + pwa + versionedV3 = 14
      val respApiGroupOwner = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPisFroApiGroup.some
      )(_tenant, teamOwnerAdminSession)
      respApiGroupOwner.status mustBe 200
      (respApiGroupOwner.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 14

      //check usage of graphql query for apigroup
      //10 public API + private + pwa + versionedV3 = 13
      val respApiGroupConsumer = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPisFroApiGroup.some
      )(_tenant, teamConsumerAdminSession)
      respApiGroupConsumer.status mustBe 200
      (respApiGroupConsumer.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 13

      //check usage of graphql query for apigroup
      //10 public API + pwa + versionedV3 = 12
      val respApiGroupUnauthorized = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPisFroApiGroup.some
      )(_tenant, unauthorizedUserSession)
      respApiGroupUnauthorized.status mustBe 200
      (respApiGroupUnauthorized.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 12

      //check usage of graphql query for apigroup
      //10 public API + versionedV3 = 11
      val respApiGroupGuest = httpJsonCallWithoutSessionBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPisFroApiGroup.some
      )(_tenant)
      respApiGroupGuest.status mustBe 200
      (respApiGroupGuest.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 11

      //########################
      //###### FILTERS #########
      //########################

      //todo: tags
      // cat
      // team
      // research

      //filter by tags ==> 2 apis
      val respOwnerAdminByTags = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json
              .obj("limit" -> 20, "offset" -> 0, "selectedTag" -> "test_tag"),
            "query" -> baseGraphQLQuery
          )
          .some
      )(_tenant, teamOwnerAdminSession)
      respOwnerAdminByTags.status mustBe 200
      (respOwnerAdminByTags.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 2

      //filter by tags ==> 2 apis
      val respOwnerAdminByCats = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(
              "limit" -> 20,
              "offset" -> 0,
              "selectedCategory" -> "test_category"
            ),
            "query" -> baseGraphQLQuery
          )
          .some
      )(_tenant, teamOwnerAdminSession)
      respOwnerAdminByCats.status mustBe 200
      (respOwnerAdminByCats.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 2

      //filter by team ==> 14 apis
      val respOwnerAdminByTeam = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(
              "limit" -> 20,
              "offset" -> 0,
              "selectedTeam" -> teamOwnerId.value
            ),
            "query" -> baseGraphQLQuery
          )
          .some
      )(_tenant, teamOwnerAdminSession)
      respOwnerAdminByTeam.status mustBe 200
      (respOwnerAdminByTeam.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 15

      //filter by team ==> 1 apis
      val respOwnerAdminByResearch = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json
              .obj("limit" -> 20, "offset" -> 0, "research" -> "api - 9"),
            "query" -> baseGraphQLQuery
          )
          .some
      )(_tenant, teamOwnerAdminSession)
      respOwnerAdminByResearch.status mustBe 200
      (respOwnerAdminByResearch.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 1
    }

    "list all tags" in {
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
        subscriptionProcess = Seq.empty,
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
        subscriptionProcess = Seq.empty,
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
        subscriptionProcess = Seq.empty,
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
        subscriptionProcess = Seq.empty,
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
        subscriptionProcess = Seq.empty,
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
        subscriptionProcess = Seq.empty,
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
        subscriptionProcess = Seq.empty,
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
        personalToken = Some(IdGenerator.token(32)),
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

      //adminApi + cmsApi + simpleTag + draftTag + privateTag + pwaTag + V3Tag + groupTag = 8
      val respAllTagsDaikokuAdmin = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(_tenant, daikokuAdminSession)
      respAllTagsDaikokuAdmin.status mustBe 200
      (respAllTagsDaikokuAdmin.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 8

      //simpleTag + draftTag + privateTag + pwaTag + V3Tag + groupTag = 6
      val respAllTagsTeamOwner = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(_tenant, teamOwnerAdminSession)
      respAllTagsTeamOwner.status mustBe 200
      (respAllTagsTeamOwner.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 6

      //simpleTag + privateTag + pwaTag + V3Tag + groupTag = 5
      val respAllTagsTeamConsumer = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(_tenant, teamConsumerAdminSession)
      respAllTagsTeamConsumer.status mustBe 200
      (respAllTagsTeamConsumer.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 5

      //simpleTag + pwaTag + V3Tag + groupTag = 4
      val respAllTagsUnauthorized = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(_tenant, unauthorizedUserSession)
      respAllTagsUnauthorized.status mustBe 200
      (respAllTagsUnauthorized.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 4

      //simpleTag + V3Tag + groupTag = 3
      val respAllTagsGuest = httpJsonCallWithoutSessionBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(_tenant)
      respAllTagsGuest.status mustBe 200
      (respAllTagsGuest.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 3

      //simpleTag + draftTag + privateTag + pwaTag + V3Tag = 5
      val respAllTagsWithGroupDaikokuAdmin = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("groupId" -> apiGroup.id.asJson),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(_tenant, daikokuAdminSession)
      respAllTagsWithGroupDaikokuAdmin.status mustBe 200
      (respAllTagsWithGroupDaikokuAdmin.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 5

      //simpleTag + draftTag + privateTag + pwaTag + V3Tag = 5
      val respAllTagsWithGroupTeamOwner = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("groupId" -> apiGroup.id.asJson),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(_tenant, teamOwnerAdminSession)
      respAllTagsWithGroupTeamOwner.status mustBe 200
      (respAllTagsWithGroupTeamOwner.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 5

      //simpleTag + privateTag + pwaTag + V3Tag = 4
      val respAllTagsWithGroupTeamConsumer = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("groupId" -> apiGroup.id.asJson),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(_tenant, teamConsumerAdminSession)
      respAllTagsWithGroupTeamConsumer.status mustBe 200
      (respAllTagsWithGroupTeamConsumer.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 4

      //simpleTag + pwaTag + V3Tag = 3
      val respAllTagsWithgroupUnauthorized = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("groupId" -> apiGroup.id.asJson),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(_tenant, unauthorizedUserSession)
      respAllTagsWithgroupUnauthorized.status mustBe 200
      (respAllTagsWithgroupUnauthorized.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 3

      //simpleTag + V3Tag = 2
      val respAllTagsWithGroupGuest = httpJsonCallWithoutSessionBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("groupId" -> apiGroup.id.asJson),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(_tenant)
      respAllTagsWithGroupGuest.status mustBe 200
      (respAllTagsWithGroupGuest.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 2

      //simpleTag =
      val respAllTagsWithResearchGuest = httpJsonCallWithoutSessionBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("filter" -> "simple"),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(_tenant)
      respAllTagsWithResearchGuest.status mustBe 200
      (respAllTagsWithResearchGuest.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 1
      (respAllTagsWithResearchGuest.json \ "data" \ "allTags")
        .as[Seq[String]]
        .contains("simple-tag") mustBe true

      //test limit
      val respAllTagsWithLimitTeamOwner = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("limit" -> 2),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(_tenant, teamOwnerAdminSession)
      respAllTagsWithLimitTeamOwner.status mustBe 200
      (respAllTagsWithLimitTeamOwner.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 2
      (respAllTagsWithLimitTeamOwner.json \ "data" \ "allTags")
        .as[Seq[String]]
        .toSet
        .subsetOf(Set("draft-tag", "group-tag")) mustBe true

      //test offset
      val respAllTagsWithOffsetTeamOwner = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("limit" -> 2, "offset" -> 2),
            "query" -> allTagsGraphQLQuery
          )
          .some
      )(_tenant, teamOwnerAdminSession)
      respAllTagsWithOffsetTeamOwner.status mustBe 200
      (respAllTagsWithOffsetTeamOwner.json \ "data" \ "allTags")
        .as[Seq[String]]
        .length mustBe 2
      (respAllTagsWithOffsetTeamOwner.json \ "data" \ "allTags")
        .as[Seq[String]]
        .toSet
        .subsetOf(Set("private-tag", "pwa-tag")) mustBe true

      //################## categories

      //administration + simpleTag + draftTag + privateTag + pwaTag + V3Tag + groupTag = 7
      val respAllCatDaikokuAdmin = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(_tenant, daikokuAdminSession)
      respAllCatDaikokuAdmin.status mustBe 200
      (respAllCatDaikokuAdmin.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 7

      //simpleTag + draftTag + privateTag + pwaTag + V3Tag + groupTag = 6
      val respAllCatTeamOwner = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(_tenant, teamOwnerAdminSession)
      respAllCatTeamOwner.status mustBe 200
      (respAllCatTeamOwner.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 6

      //simpleTag + privateTag + pwaTag + V3Tag + groupTag = 5
      val respAllCatTeamConsumer = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(_tenant, teamConsumerAdminSession)
      respAllCatTeamConsumer.status mustBe 200
      (respAllCatTeamConsumer.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 5

      //simpleTag + pwaTag + V3Tag + groupTag = 4
      val respAllCatUnauthorized = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(_tenant, unauthorizedUserSession)
      respAllCatUnauthorized.status mustBe 200
      (respAllCatUnauthorized.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 4

      //simpleTag + V3Tag + groupTag = 3
      val respAllCatGuest = httpJsonCallWithoutSessionBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj(),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(_tenant)
      respAllCatGuest.status mustBe 200
      (respAllCatGuest.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 3

      //simpleTag + draftTag + privateTag + pwaTag + V3Tag = 5
      val respAllCatWithGroupDaikokuAdmin = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("groupId" -> apiGroup.id.asJson),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(_tenant, daikokuAdminSession)
      logger.info(Json.prettyPrint(respAllCatWithGroupDaikokuAdmin.json))
      respAllCatWithGroupDaikokuAdmin.status mustBe 200
      (respAllCatWithGroupDaikokuAdmin.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 5

      //simpleTag + draftTag + privateTag + pwaTag + V3Tag = 5
      val respAllCatWithGroupTeamOwner = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("groupId" -> apiGroup.id.asJson),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(_tenant, teamOwnerAdminSession)
      respAllCatWithGroupTeamOwner.status mustBe 200
      (respAllCatWithGroupTeamOwner.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 5

      //simpleTag + privateTag + pwaTag + V3Tag = 4
      val respAllCatWithGroupTeamConsumer = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("groupId" -> apiGroup.id.asJson),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(_tenant, teamConsumerAdminSession)
      respAllCatWithGroupTeamConsumer.status mustBe 200
      (respAllCatWithGroupTeamConsumer.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 4

      //simpleTag + pwaTag + V3Tag = 3
      val respAllCatWithGroupUnauthorized = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("groupId" -> apiGroup.id.asJson),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(_tenant, unauthorizedUserSession)
      respAllCatWithGroupUnauthorized.status mustBe 200
      (respAllCatWithGroupUnauthorized.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 3

      //simpleTag + V3Tag = 2
      val respAllCatWithGroupGuest = httpJsonCallWithoutSessionBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("groupId" -> apiGroup.id.asJson),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(_tenant)
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
      )(_tenant)
      respAllCatWithResearchGuest.status mustBe 200
      (respAllCatWithResearchGuest.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 1

      //test limit
      val respAllCategoriesWithLimitTeamOwner = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("limit" -> 2),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(_tenant, teamOwnerAdminSession)
      respAllCategoriesWithLimitTeamOwner.status mustBe 200
      (respAllCategoriesWithLimitTeamOwner.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .length mustBe 2
      (respAllCategoriesWithLimitTeamOwner.json \ "data" \ "allCategories")
        .as[Seq[String]]
        .toSet
        .subsetOf(Set("draft-category", "group-category")) mustBe true

      //test offset
      val respAllCategoriesWithOffsetTeamOwner = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json
          .obj(
            "variables" -> Json.obj("limit" -> 2, "offset" -> 2),
            "query" -> allCategoriesGraphQLQuery
          )
          .some
      )(_tenant, teamOwnerAdminSession)
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

}
