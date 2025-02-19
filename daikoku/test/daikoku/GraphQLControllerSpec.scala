package fr.maif.otoroshi.daikoku.tests

import cats.implicits.catsSyntaxOptionId
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain.UsagePlan.FreeWithoutQuotas
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
    "wait 1 sec" in {
      setupEnvBlocking()
      await(1.second)
    }

    "list all visible apis - Home page" in {
      val _tenant = tenant.copy(isPrivate = false)

      val apiList = (1 to 10)
        .map(id => {
          val planId = UsagePlanId(s"plan-$id-api-$id")
          val plan = FreeWithoutQuotas(
            id = planId,
            tenant = _tenant.id,
            billingDuration = BillingDuration(1, BillingTimeUnit.Month),
            currency = Currency("EUR"),
            customName = None,
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

      val draftApiPlan = FreeWithoutQuotas(
        id = UsagePlanId("draft_plan"),
        tenant = _tenant.id,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        currency = Currency("EUR"),
        customName = None,
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

      val pwaApiPlan = FreeWithoutQuotas(
        id = UsagePlanId("pwa_plan"),
        tenant = _tenant.id,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        currency = Currency("EUR"),
        customName = None,
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

      val privateApiPlan = FreeWithoutQuotas(
        id = UsagePlanId("private_plan"),
        tenant = _tenant.id,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        currency = Currency("EUR"),
        customName = None,
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

      val publicApiPlanV1 = FreeWithoutQuotas(
        id = UsagePlanId("public_plan_V1"),
        tenant = _tenant.id,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        currency = Currency("EUR"),
        customName = None,
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

      val publicApiPlanV2 = FreeWithoutQuotas(
        id = UsagePlanId("public_plan_V2"),
        tenant = _tenant.id,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        currency = Currency("EUR"),
        customName = None,
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

      val publicApiPlanV3 = FreeWithoutQuotas(
        id = UsagePlanId("public_plan_V3"),
        tenant = _tenant.id,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month),
        currency = Currency("EUR"),
        customName = None,
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
        apis = (apiList.map(_.api.id).toSet ++ Set(draftApi.id, pwaApi.id, privateApi.id, publicApiV1.id, publicApiV2.id, publicApiV3.id)).some
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


      val graphQlTenantAdminTeam = defaultAdminTeam.copy(id = TeamId("graphql-test-tenant-admin-team"), tenant = _tenant.id, name = "graphql-test-tenant-admin-team")
      setupEnvBlocking(
        tenants = Seq(_tenant),
        users = Seq(daikokuAdmin, userAdmin, user, unauthorizedUser),
        teams =
          Seq(graphQlTenantAdminTeam,
            teamOwner.copy(users = Set(UserWithPermission(userTeamAdminId, Administrator))),
            teamConsumer.copy(users = Set(UserWithPermission(user.id, Administrator))),
            unauthorizedTeam),
        apis = Seq(
          adminApi.copy(id = ApiId("admin-api-tenant-graphql-test"), tenant = _tenant.id, team = graphQlTenantAdminTeam.id),
          cmsApi.copy(id = ApiId("cms-api-tenant-graphql-test"), tenant = _tenant.id, team = graphQlTenantAdminTeam.id),
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
        "variables" -> Json.obj("limit" -> 20, "offset" -> 0, "groupId" -> "public_api_group"),
        "query" -> baseGraphQLQuery
      )

      val daikokuAdminSession = loginWithBlocking(daikokuAdmin.copy(tenants = Set(_tenant.id)), _tenant)
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
      (respDaikokuAdmin.json \ "data" \ "visibleApis" \ "total").as[Int] mustBe 17


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
      (respConsumerAdmin.json \ "data" \ "visibleApis" \ "total").as[Int] mustBe 14

      //10 public API + pwa + versionedV3 + apigroup = 13
      val respUnauthorizedAdmin = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPis.some
      )(_tenant, unauthorizedUserSession)
      respUnauthorizedAdmin.status mustBe 200
      (respUnauthorizedAdmin.json \ "data" \ "visibleApis" \ "total").as[Int] mustBe 13

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
      (respApiGroupDaikokuAdmin.json \ "data" \ "visibleApis" \ "total").as[Int] mustBe 14

      //check usage of graphql query for apigroup
      //10 public API + draft + private + pwa + versionedV3 = 14
      val respApiGroupOwner = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPisFroApiGroup.some
      )(_tenant, teamOwnerAdminSession)
      respApiGroupOwner.status mustBe 200
      (respApiGroupOwner.json \ "data" \ "visibleApis" \ "total").as[Int] mustBe 14

      //check usage of graphql query for apigroup
      //10 public API + private + pwa + versionedV3 = 13
      val respApiGroupConsumer = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPisFroApiGroup.some
      )(_tenant, teamConsumerAdminSession)
      respApiGroupConsumer.status mustBe 200
      (respApiGroupConsumer.json \ "data" \ "visibleApis" \ "total").as[Int] mustBe 13

      //check usage of graphql query for apigroup
      //10 public API + pwa + versionedV3 = 12
      val respApiGroupUnauthorized = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPisFroApiGroup.some
      )(_tenant, unauthorizedUserSession)
      respApiGroupUnauthorized.status mustBe 200
      (respApiGroupUnauthorized.json \ "data" \ "visibleApis" \ "total").as[Int] mustBe 12

      //check usage of graphql query for apigroup
      //10 public API + versionedV3 = 11
      val respApiGroupGuest = httpJsonCallWithoutSessionBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPisFroApiGroup.some
      )(_tenant)
      respApiGroupGuest.status mustBe 200
      (respApiGroupGuest.json \ "data" \ "visibleApis" \ "total").as[Int] mustBe 11

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
        body = Json.obj(
          "variables" -> Json.obj("limit" -> 20, "offset" -> 0, "selectedTag" -> "test_tag"),
          "query" -> baseGraphQLQuery
        ).some
      )(_tenant, teamOwnerAdminSession)
      respOwnerAdminByTags.status mustBe 200
      (respOwnerAdminByTags.json \ "data" \ "visibleApis" \ "total").as[Int] mustBe 2

      //filter by tags ==> 2 apis
      val respOwnerAdminByCats = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json.obj(
          "variables" -> Json.obj("limit" -> 20, "offset" -> 0, "selectedCategory" -> "test_category"),
          "query" -> baseGraphQLQuery
        ).some
      )(_tenant, teamOwnerAdminSession)
      respOwnerAdminByCats.status mustBe 200
      (respOwnerAdminByCats.json \ "data" \ "visibleApis" \ "total").as[Int] mustBe 2

      //filter by team ==> 14 apis
      val respOwnerAdminByTeam = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json.obj(
          "variables" -> Json.obj("limit" -> 20, "offset" -> 0, "selectedTeam" -> teamOwnerId.value),
          "query" -> baseGraphQLQuery
        ).some
      )(_tenant, teamOwnerAdminSession)
      respOwnerAdminByTeam.status mustBe 200
      (respOwnerAdminByTeam.json \ "data" \ "visibleApis" \ "total").as[Int] mustBe 15

      //filter by team ==> 1 apis
      val respOwnerAdminByResearch = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = Json.obj(
          "variables" -> Json.obj("limit" -> 20, "offset" -> 0, "research" -> "api - 9"),
          "query" -> baseGraphQLQuery
        ).some
      )(_tenant, teamOwnerAdminSession)
      respOwnerAdminByResearch.status mustBe 200
      (respOwnerAdminByResearch.json \ "data" \ "visibleApis" \ "total").as[Int] mustBe 1
    }

    //todo: tester getALlCategory (avec reasearch et groupId)
    //todo: tester getALlTags (avec reasearch et groupId)


  }

}
