package fr.maif.daikoku.usages

import fr.maif.daikoku.env.Env
import cats.implicits.catsSyntaxOptionId
import com.dimafeng.testcontainers.GenericContainer.FileSystemBind
import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.domain.TeamPermission.Administrator
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import fr.maif.daikoku.utils.IdGenerator
import org.joda.time.DateTime
import org.scalatest.BeforeAndAfter
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.BindMode
import play.api.libs.json.*
import scala.concurrent.ExecutionContext
import scala.concurrent.Await
import scala.concurrent.duration.*

class ApiLifeCycleSpec
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfter
    with ForAllTestContainer {

  val pwd: String = System.getProperty("user.dir")
  implicit val ecc: ExecutionContext =
    daikokuComponents.env.defaultExecutionContext
  implicit val ev: Env = daikokuComponents.env

  // Container Otoroshi
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

  "API life cycle" must {
    "be smart" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, userApiEditor, user),
        apis = Seq(defaultApi.api.copy(state = ApiState.Created)),
        usagePlans = defaultApi.plans,
        teams = Seq(
          defaultAdminTeam,
          teamOwner,
          teamConsumer.copy(users =
            Set(
              UserWithPermission(userTeamAdminId, Administrator),
              UserWithPermission(userTeamUserId, Administrator)
            )
          )
        )
      )
      val adminSession = loginWithBlocking(userAdmin, tenant)

      logger.info("*********** LifeCycle API Allowed changes ***********")
      logger.info("created ->> published ->> deprecated ->> blocked")
      logger.info("created ->> published ---------------->> blocked")
      logger.info("created <<- published <<- deprecated <<- blocked")
      logger.info("created <<- published <<---------------- blocked")

      logger.info("*********** LifeCycle API Forbidden changes ***********")
      logger.info("created -------X------->> deprecated")
      logger.info("created ----------------X------------->> blocked")
      logger.info("created <<-----X--------- deprecated")
      logger.info("created <<-----X--------- deprecated")
      logger.info("created <<--------------X--------------- blocked")
      changingAPIState(adminSession, ApiState.Blocked, 409)
      logger.info("from created => deprecated")
      changingAPIState(adminSession, ApiState.Deprecated, 409)
      logger.info("from created => published")
      changingAPIState(adminSession, ApiState.Published)
      logger.info("from published => published")
      changingAPIState(adminSession, ApiState.Published)
      logger.info("from published => created")
      changingAPIState(adminSession, ApiState.Deprecated)
      logger.info("from published => blocked")
      changingAPIState(adminSession, ApiState.Blocked)
      logger.info("from published => deprecated")
      changingAPIState(adminSession, ApiState.Deprecated)
      logger.info("from deprecated => deprecated")
      changingAPIState(adminSession, ApiState.Deprecated)
      logger.info("from deprecated => created")
      changingAPIState(adminSession, ApiState.Created, 409)
      logger.info("from deprecated => published")
      changingAPIState(adminSession, ApiState.Deprecated)
      logger.info("from deprecated => blocked")
      changingAPIState(adminSession, ApiState.Blocked)
      logger.info("from blocked => blocked")
      changingAPIState(adminSession, ApiState.Blocked)
      logger.info("from blocked => created")
      changingAPIState(adminSession, ApiState.Created, 409)
      logger.info("from blocked => deprecated")
      changingAPIState(adminSession, ApiState.Deprecated)
    }

    "notify customer when API lifeCycle change needs to" in {
      Await.result(waitForDaikokuSetup(), 5.second)
      val planDev = UsagePlan(
        id = UsagePlanId("dev"),
        tenant = tenant.id,
        customName = "dev",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )

      val planProd = UsagePlan(
        id = UsagePlanId("prod"),
        tenant = tenant.id,
        customName = "prod",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
              )
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
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
        users = Seq(userAdmin, userApiEditor, user),
        teams = Seq(
          defaultAdminTeam,
          teamOwner,
          teamConsumer.copy(users =
            Set(
              UserWithPermission(userTeamAdminId, Administrator),
              UserWithPermission(userTeamUserId, Administrator)
            )
          )
        ),
        apis = Seq(
          defaultApi.api.copy(possibleUsagePlans = Seq(planProd.id, planDev.id))
        ),
        usagePlans = Seq(planProd, planDev),
        keyrings = Seq(
          Keyring(
            id = KeyringId("keyring1"),
            tenant = tenant.id,
            team = teamConsumerId,
            apiKey = otoroshiApiKey1,
            otoroshiSettings =
              KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
            createdAt = DateTime.now(),
            integrationToken = "test 1"
          ),
          Keyring(
            id = KeyringId("keyring2"),
            tenant = tenant.id,
            team = teamOwnerId,
            apiKey = otoroshiApiKey2,
            otoroshiSettings =
              KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
            createdAt = DateTime.now(),
            integrationToken = "test 2"
          ),
          Keyring(
            id = KeyringId("keyring3"),
            tenant = tenant.id,
            team = teamOwnerId,
            apiKey = otoroshiApiKey3,
            otoroshiSettings =
              KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
            createdAt = DateTime.now(),
            integrationToken = "test 3"
          )
        ),
        subscriptions = Seq(
          ApiSubscription(
            id = ApiSubscriptionId(IdGenerator.token(12)),
            tenant = tenant.id,
            plan = planProd.id,
            createdAt = DateTime.now(),
            team = teamConsumerId,
            api = defaultApi.api.id,
            by = userTeamAdminId,
            customName = None,
            keyring = KeyringId("keyring1")
          ),
          ApiSubscription(
            id = ApiSubscriptionId(IdGenerator.token(12)),
            tenant = tenant.id,
            plan = planDev.id,
            createdAt = DateTime.now(),
            team = teamOwner.id,
            api = defaultApi.api.id,
            by = userTeamAdminId,
            customName = None,
            keyring = KeyringId("keyring2")
          ),
          ApiSubscription(
            id = ApiSubscriptionId(IdGenerator.token(12)),
            tenant = tenant.id,
            plan = planDev.id,
            createdAt = DateTime.now(),
            team = teamConsumerId,
            api = defaultApi.api.id,
            by = userTeamAdminId,
            customName = None,
            keyring = KeyringId("keyring2")
          )
        )
      )

      val adminSession = loginWithBlocking(userAdmin, tenant)

      // This test focuses on the notifications emitted on lifecycle changes.
      // The Otoroshi key behaviour on block is covered by the dedicated keyring
      // test ("discard blocked subscriptions from a shared keyring key ...").

      changingAPIState(session = adminSession, state = ApiState.Deprecated)

      testNotificationLifeCycle(
        apiState = ApiState.Deprecated,
        notificationType = "ApiDepreciationWarning",
        numberOfAdminNotif = 2,
        numberOfUserNotif = 1
      )
      changingAPIState(session = adminSession, state = ApiState.Blocked)

      testNotificationLifeCycle(
        apiState = ApiState.Blocked,
        notificationType = "ApiBlockingWarning",
        numberOfAdminNotif = 3,
        numberOfUserNotif = 2
      )

      // todo : check mail (test container)

      // TODO: écrire un test pour la gestion des versions
      // Se passer de souscriptions : il  a une version par default (version 1) dans un premier temps.
      // Si on crée d'autres versions, il faudrait pouvoir les définir comme par défault. Si on passe l'api default à bloqué
      // Ne pas modifier deux versions avec une seule requête
    }

    "discard blocked subscriptions from a shared keyring key, and disable it on full lifecycle block" in {
      Await.result(waitForDaikokuSetup(), 5.second)

      // Two plans of the same API pointing to two distinct Otoroshi routes.
      val planParent = UsagePlan(
        id = UsagePlanId("parent"),
        tenant = tenant.id,
        customName = "parent",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(parentRouteId))
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
      val planChild = UsagePlan(
        id = UsagePlanId("child"),
        tenant = tenant.id,
        customName = "child",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(
                routes = Set(OtoroshiRouteId(childRouteId))
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

      val api = defaultApi.api.copy(
        state = ApiState.Published,
        possibleUsagePlans = Seq(planParent.id, planChild.id)
      )

      // One consumer keyring aggregating the two subscriptions -> one shared
      // Otoroshi key whose authorizedEntities are the union of the two routes.
      val keyring = Keyring(
        id = KeyringId("keyring-lifecycle"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = otoroshiApiKey1,
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "test-lifecycle"
      )
      val subParent = ApiSubscription(
        id = ApiSubscriptionId("sub-parent"),
        tenant = tenant.id,
        plan = planParent.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
      )
      val subChild = ApiSubscription(
        id = ApiSubscriptionId("sub-child"),
        tenant = tenant.id,
        plan = planChild.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
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
        users = Seq(userAdmin, userApiEditor, user),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(api),
        usagePlans = Seq(planParent, planChild),
        keyrings = Seq(keyring),
        subscriptions = Seq(subParent, subChild)
      )

      val adminSession = loginWithBlocking(userAdmin, tenant)
      val clientId = otoroshiApiKey1.clientId
      val parentRoute = OtoroshiRouteId(parentRouteId)
      val childRoute = OtoroshiRouteId(childRouteId)

      // Phase 0 — initial sync: the shared key aggregates both routes and is enabled.
      triggerSyncJob(adminSession)
      checkOtoroshiKeyEnabling(
        otoroshiApiKey1,
        enabled = true,
        routes = Seq(parentRoute, childRoute)
      )

      // Phase 1 — the API producer blocks the child subscription: its route is
      // discarded from the shared key, but the key stays enabled (parent still active).
      archiveSubscriptionByOwner(adminSession, subChild.id, enabled = false)
      triggerSyncJob(adminSession)
      checkOtoroshiKeyEnabling(
        otoroshiApiKey1,
        enabled = true,
        routes = Seq(parentRoute)
      )
      checkOtoroshiKeyEnabling(
        otoroshiApiKey1,
        enabled = true,
        blocked = true,
        routes = Seq(childRoute)
      )

      // Phase 2 — the producer re-activates the child subscription: route restored (rollback).
      archiveSubscriptionByOwner(adminSession, subChild.id, enabled = true)
      triggerSyncJob(adminSession)
      checkOtoroshiKeyEnabling(
        otoroshiApiKey1,
        enabled = true,
        routes = Seq(parentRoute, childRoute)
      )

      // Phase 3 — full lifecycle block: every subscription becomes Blocked, the
      // shared key is disabled. Disabling does NOT strip authorizedEntities.
      changingAPIState(adminSession, ApiState.Blocked)
      triggerSyncJob(adminSession)
      checkOtoroshiKeyEnabling(
        otoroshiApiKey1,
        enabled = false,
        routes = Seq(parentRoute, childRoute)
      )

      // Phase 4 — lifecycle deblock (Blocked -> Deprecated; Blocked -> Published
      // is forbidden by checkPreviousState): subscriptions become Active again,
      // key re-enabled (rollback).
      changingAPIState(adminSession, ApiState.Deprecated)
      triggerSyncJob(adminSession)
      checkOtoroshiKeyEnabling(
        otoroshiApiKey1,
        enabled = true,
        routes = Seq(parentRoute, childRoute)
      )
    }

//    "when blocking aggregated ApiKey" in {
//
//      // TODO: Ecrire un test pour les aggregates
//      // prendre en compte : Bloquer un enfant, puis un parent,
//      // existe peut être déjà avec les souscriptiuobs
//
//      // existe peut être là => chercher // "delete parentSub => first child become parent" dans ApiControllerSpec
//      // ou "be exploded in parts by deleting the parent sub"
//
//      Await.result(waitForDaikokuSetup(), 5.second)
//      val planDev = UsagePlan(
//        id = UsagePlanId("dev"),
//        tenant = tenant.id,
//        customName = "dev",
//        customDescription = None,
//        otoroshiTarget = Some(
//          OtoroshiTarget(
//            containerizedOtoroshi,
//            Some(
//              AuthorizedEntities(
//                routes = Set(OtoroshiRouteId(parentRouteId))
//              )
//            )
//          )
//        ),
//        allowMultipleKeys = Some(false),
//        subscriptionProcess = Seq.empty,
//        integrationProcess = IntegrationProcess.ApiKey,
//        autoRotation = Some(false)
//      )
//
//      val planProd = UsagePlan(
//        id = UsagePlanId("prod"),
//        tenant = tenant.id,
//        customName = "prod",
//        customDescription = None,
//        otoroshiTarget = Some(
//          OtoroshiTarget(
//            containerizedOtoroshi,
//            Some(
//              AuthorizedEntities(
//                routes = Set(OtoroshiRouteId(childRouteId))
//              )
//            )
//          )
//        ),
//        allowMultipleKeys = Some(false),
//        subscriptionProcess = Seq.empty,
//        integrationProcess = IntegrationProcess.ApiKey,
//        autoRotation = Some(false)
//      )
//
//      val parentApi = defaultApi.api.copy(
//        id = ApiId("parent-id"),
//        name = "parent API",
//        team = teamOwnerId,
//        possibleUsagePlans = Seq(planProd.id),
//        defaultUsagePlan = planProd.id.some
//      )
//
//      val parentSub = ApiSubscription(
//        id = ApiSubscriptionId("parent_sub"),
//        tenant = tenant.id,
//        apiKey = parentApiKeyWith2childs,
//        plan = planProd.id,
//        createdAt = DateTime.now(),
//        team = teamConsumerId,
//        api = parentApi.id,
//        by = userTeamAdminId,
//        customName = None,
//        rotation = None,
//        integrationToken = "parent_token"
//      )
//      val childSub = ApiSubscription(
//        id = ApiSubscriptionId("child_sub"),
//        tenant = tenant.id,
//        apiKey = parentApiKeyWith2childs,
//        plan = planProd.id,
//        createdAt = DateTime.now(),
//        team = teamConsumerId,
//        api = parentApi.id,
//        by = userTeamAdminId,
//        customName = None,
//        rotation = None,
//        integrationToken = "parent_token",
//        parent = parentSub.id.some
//      )
//      val childOwnerSub = ApiSubscription(
//        id = ApiSubscriptionId("child_owner_sub"),
//        tenant = tenant.id,
//        apiKey = parentApiKeyWith2childs,
//        plan = planProd.id,
//        createdAt = DateTime.now(),
//        team = teamOwnerId,
//        api = parentApi.id,
//        by = userTeamAdminId,
//        customName = None,
//        rotation = None,
//        integrationToken = "parent_owner_token",
//        parent = parentSub.id.some
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
//        users = Seq(userAdmin, userApiEditor, user),
//        teams = Seq(
//          defaultAdminTeam,
//          teamOwner,
//          teamConsumer.copy(users =
//            Set(
//              UserWithPermission(userTeamAdminId, Administrator),
//              UserWithPermission(userTeamUserId, Administrator)
//            )
//          )
//        ),
//        apis = Seq(
//          defaultApi.api.copy(possibleUsagePlans = Seq(planProd.id, planDev.id))
//        ),
//        usagePlans = Seq(planProd, planDev),
//        subscriptions = Seq(
//          parentSub,
//          childSub,
//          childOwnerSub
//        )
//      )
//
//      val adminSession = loginWithBlocking(userAdmin, tenant)
//
//      val resp = httpJsonCallBlocking(
//        path =
//          s"/api/teams/${teamOwnerId.value}/apis/${parentApi.id.value}/${parentApi.currentVersion.value}",
//        method = "PUT",
//        body = Some(defaultApi.api.copy(state = ApiState.Blocked).asJson)
//      )(using tenant, adminSession)
//      resp.status mustBe 200
//      (resp.json \ "state").as(using
//        json.ApiStateFormat
//      ) mustBe ApiState.Blocked
//
//      checkOtoroshiKeyEnabling(parentApiKeyWith2childs, enabled = false)
//    }

    // todo: check notification (2 users, 3 teams, 1 teams with 2 admins, 1 teams with just users)

    // TODO: écrire un test pour la gestion des versions
    // Chaque version d'une API a un ID unique, donc le changement de state n'en modfie qu'une à la fois

    // TODO: Une fonctionnalité pour définir une API par default
    // Se passer de souscriptions : il  a une version par default (version 1) dans un premier temps.
    // Si on crée d'autres versions, il faudrait pouvoir les définir comme par défault. Si on passe l'api default à bloqué
    // Ne pas modifier deux versions avec une seule requête

    "setup isDefault for another version if blocked API is currently isDefault" in {

      Await.result(waitForDaikokuSetup(), 5.second)

      // Three versions of the same Api

      val apiVersion1 = Api(
        id = ApiId(IdGenerator.token(32)),
        tenant = Tenant.Default,
        team = teamOwnerId,
        name = "api-test-isDefault",
        lastUpdate = DateTime.now(),
        smallDescription = "",
        description = "",
        currentVersion = Version("1.0.0"),
        state = ApiState.Published,
        documentation = ApiDocumentation(
          id = ApiDocumentationId(IdGenerator.token(32)),
          tenant = Tenant.Default,
          pages = Seq.empty[ApiDocumentationDetailPage],
          lastModificationAt = DateTime.now()
        ),
        swagger = None,
        possibleUsagePlans = Seq.empty,
        defaultUsagePlan = None,
        categories = Set("Administration"),
        visibility = ApiVisibility.Public
      )

      val apiVersion2 = Api(
        id = ApiId(IdGenerator.token(32)),
        tenant = Tenant.Default,
        team = defaultAdminTeam.id,
        name = s"api-test-isDefault",
        lastUpdate = DateTime.now(),
        smallDescription = "",
        description = "",
        currentVersion = Version("2.0.0"),
        state = ApiState.Published,
        documentation = ApiDocumentation(
          id = ApiDocumentationId(IdGenerator.token(32)),
          tenant = Tenant.Default,
          pages = Seq.empty[ApiDocumentationDetailPage],
          lastModificationAt = DateTime.now()
        ),
        possibleUsagePlans = Seq.empty,
        defaultUsagePlan = UsagePlanId("admin").some,
        visibility = ApiVisibility.Public,
        isDefault = false,
        parent = apiVersion1.id.some
      ) // isDefault = false

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user),
        teams = Seq(
          defaultAdminTeam,
          teamOwner.copy(users =
            Set(UserWithPermission(userTeamAdminId, Administrator))
          ),
          teamConsumer.copy(users =
            Set(UserWithPermission(user.id, Administrator))
          )
        ),
        apis = Seq(apiVersion1, apiVersion2)
      )

      val baseGraphQLQuery =
        s"""
           |query AllVisibleApis ($$filterTable: JsArray, $$sortingTable: JsArray, $$groupId: String, $$limit: Int, $$offset: Int) {
           |          visibleApis (filterTable: $$filterTable, sortingTable: $$sortingTable, groupId: $$groupId, limit: $$limit, offset: $$offset){
           |            apis {
           |              api {
           |                _id
           |                name
           |                state
           |                currentVersion
           |                isDefault
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

      // =============================================================================
      // =============================================================================
      // =============================================================================

      // todo: call avec admin owner to update apiversion 1 with state blcoked
      // todo: call graphql to verifier que <nom api>  (version 2) est bien dans la liste et que isDefault est true

      val adminSession = loginWithBlocking(
        userAdmin,
        tenant
      ) // administrateur de l'api (droit read si admin)
      val userSession = loginWithBlocking(user, tenant) //

      val visibleApisBefore = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPis.some
      )(using tenant, userSession)

      // verifier qu'on a 1 api
      // state published
      // version 1.0.0

      visibleApisBefore.status mustBe 200

      val apiBefore =
        (visibleApisBefore.json \ "data" \ "visibleApis" \ "apis")
          .as[JsArray]

      (apiBefore.value.head \ "api" \ "name")
        .as[String] mustBe "api-test-isDefault"
      (apiBefore.value.head \ "api" \ "currentVersion")
        .as[String] mustBe "1.0.0"
      (apiBefore.value.head \ "api" \ "state").as[String] mustBe "published"
      (apiBefore.value.head \ "api" \ "isDefault").as[Boolean] mustBe true

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${apiVersion1.id.value}/${apiVersion1.currentVersion.value}",
        method = "PUT",
        body = Some(apiVersion1.copy(state = ApiState.Blocked).asJson)
      )(using tenant, adminSession)

      resp.status mustBe 200
      (resp.json \ "state").as(using
        json.ApiStateFormat
      ) mustBe ApiState.Blocked

      val visibleApisAfter = httpJsonCallBlocking(
        path = s"/api/search",
        "POST",
        body = graphQlRequestAllVisibleAPis.some
      )(using tenant, userSession)
      visibleApisAfter.status mustBe 200
      (visibleApisAfter.json \ "data" \ "visibleApis" \ "total")
        .as[Int] mustBe 1
      val apiAfter =
        (visibleApisAfter.json \ "data" \ "visibleApis" \ "apis")
          .as[JsArray]
          .value
          .head
      (apiAfter \ "api" \ "name").as[String] mustBe "api-test-isDefault"
      (apiAfter \ "api" \ "currentVersion").as[String] mustBe "2.0.0"
      (apiAfter \ "api" \ "state").as[String] mustBe "published"
      (apiAfter \ "api" \ "isDefault").as[Boolean] mustBe true

    }

    "restrict the per-subscription block to API editors of the producer team" in {
      Await.result(waitForDaikokuSetup(), 5.second)

      val plan = UsagePlan(
        id = UsagePlanId("auth-plan"),
        tenant = tenant.id,
        customName = "auth",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(routes = Set(OtoroshiRouteId(parentRouteId)))
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val api = defaultApi.api.copy(
        state = ApiState.Published,
        possibleUsagePlans = Seq(plan.id)
      )
      val keyring = Keyring(
        id = KeyringId("keyring-auth"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = otoroshiApiKey1,
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "test-auth"
      )
      val sub = ApiSubscription(
        id = ApiSubscriptionId("sub-auth"),
        tenant = tenant.id,
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
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
        users = Seq(userAdmin, userApiEditor, user),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(api),
        usagePlans = Seq(plan),
        keyrings = Seq(keyring),
        subscriptions = Seq(sub)
      )

      // `user` is only a TeamUser of the producer team -> forbidden
      val teamUserSession = loginWithBlocking(user, tenant)
      val forbidden = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/subscriptions/${sub.id.value}/_archiveByOwner?enabled=false",
        method = "PUT"
      )(using tenant, teamUserSession)
      forbidden.status mustBe 403

      // an ApiEditor of the producer team is allowed
      val editorSession = loginWithBlocking(userApiEditor, tenant)
      val allowed = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/subscriptions/${sub.id.value}/_archiveByOwner?enabled=false",
        method = "PUT"
      )(using tenant, editorSession)
      allowed.status mustBe 200
    }

    "prevent a consumer from re-enabling a subscription blocked by the API producer" in {
      Await.result(waitForDaikokuSetup(), 5.second)

      val plan = UsagePlan(
        id = UsagePlanId("precedence-plan"),
        tenant = tenant.id,
        customName = "precedence",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(routes = Set(OtoroshiRouteId(parentRouteId)))
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false)
      )
      val api = defaultApi.api.copy(
        state = ApiState.Published,
        possibleUsagePlans = Seq(plan.id)
      )
      val keyring = Keyring(
        id = KeyringId("keyring-precedence"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = otoroshiApiKey1,
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "test-precedence"
      )
      val sub = ApiSubscription(
        id = ApiSubscriptionId("sub-precedence"),
        tenant = tenant.id,
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
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
        users = Seq(userAdmin, userApiEditor, user),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(api),
        usagePlans = Seq(plan),
        keyrings = Seq(keyring),
        subscriptions = Seq(sub)
      )

      val adminSession = loginWithBlocking(userAdmin, tenant)

      // the API producer blocks the subscription (state -> Blocked)
      archiveSubscriptionByOwner(adminSession, sub.id, enabled = false)

      // the consumer (team admin) cannot toggle it back through its own endpoint
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamConsumerId.value}/subscriptions/${sub.id.value}/_archive?enabled=true",
        method = "PUT"
      )(using tenant, adminSession)
      resp.status mustBe 403
    }

    "keep a shared keyring key alive for other APIs when one API is blocked" in {
      Await.result(waitForDaikokuSetup(), 5.second)

      // Api A -> childRoute, Api B -> parentRoute, both aggregated on one keyring.
      val planA = UsagePlan(
        id = UsagePlanId("plan-a"),
        tenant = tenant.id,
        customName = "a",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(routes = Set(OtoroshiRouteId(childRouteId)))
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )
      val planB = UsagePlan(
        id = UsagePlanId("plan-b"),
        tenant = tenant.id,
        customName = "b",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(routes = Set(OtoroshiRouteId(parentRouteId)))
            )
          )
        ),
        allowMultipleKeys = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey,
        autoRotation = Some(false),
        aggregationApiKeysSecurity = Some(true)
      )

      val apiA = defaultApi.api.copy(
        id = ApiId("api-a"),
        name = "api A",
        team = teamOwnerId,
        state = ApiState.Published,
        possibleUsagePlans = Seq(planA.id),
        defaultUsagePlan = planA.id.some
      )
      val apiB = defaultApi.api.copy(
        id = ApiId("api-b"),
        name = "api B",
        team = teamOwnerId,
        state = ApiState.Published,
        possibleUsagePlans = Seq(planB.id),
        defaultUsagePlan = planB.id.some
      )

      val keyring = Keyring(
        id = KeyringId("keyring-shared"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = otoroshiApiKey1,
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "test-shared"
      )
      val subA = ApiSubscription(
        id = ApiSubscriptionId("sub-a"),
        tenant = tenant.id,
        plan = planA.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = apiA.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
      )
      val subB = ApiSubscription(
        id = ApiSubscriptionId("sub-b"),
        tenant = tenant.id,
        plan = planB.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = apiB.id,
        by = userTeamAdminId,
        customName = None,
        keyring = keyring.id
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
        users = Seq(userAdmin, userApiEditor, user),
        teams = Seq(defaultAdminTeam, teamOwner, teamConsumer),
        apis = Seq(apiA, apiB),
        usagePlans = Seq(planA, planB),
        keyrings = Seq(keyring),
        subscriptions = Seq(subA, subB)
      )

      val adminSession = loginWithBlocking(userAdmin, tenant)
      val childRoute = OtoroshiRouteId(childRouteId)
      val parentRoute = OtoroshiRouteId(parentRouteId)

      // initial sync: the shared key aggregates both APIs' routes
      triggerSyncJob(adminSession)
      checkOtoroshiKeyEnabling(
        otoroshiApiKey1,
        enabled = true,
        routes = Seq(childRoute, parentRoute)
      )

      // block Api A only
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${apiA.id.value}/${apiA.currentVersion.value}",
        method = "PUT",
        body = Some(apiA.copy(state = ApiState.Blocked).asJson)
      )(using tenant, adminSession)
      resp.status mustBe 200
      triggerSyncJob(adminSession)

      // Api B's route remains, Api A's route is discarded, the key stays enabled
      checkOtoroshiKeyEnabling(
        otoroshiApiKey1,
        enabled = true,
        routes = Seq(parentRoute)
      )
      checkOtoroshiKeyEnabling(
        otoroshiApiKey1,
        enabled = true,
        blocked = true,
        routes = Seq(childRoute)
      )
    }

    def changingAPIState(
        session: UserSession,
        state: ApiState,
        statusResponse: Int = 200
    ) = {
      logger.info(s"changing api default state to ${state.name}")
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}",
        method = "PUT",
        body = Some(defaultApi.api.copy(state = state).asJson)
      )(using tenant, session)
      resp.status mustBe statusResponse
      if (statusResponse == 200) {
        (resp.json \ "state").as(using json.ApiStateFormat) mustBe state
      }
    }

    def testNotificationLifeCycle(
        apiState: ApiState,
        notificationType: String,
        numberOfAdminNotif: Int,
        numberOfUserNotif: Int
    ) = {
      logger.info(s"test api default state to ${apiState.name}")

      val adminSession = loginWithBlocking(userAdmin, tenant)
      val userSession = loginWithBlocking(user, tenant)
      val graphQlRequestNotifications =
        getGraphQLQueryNotification(notificationType, baseGraphQLQuery)

      val adminNotifResp = httpJsonCallBlocking(
        path = s"/api/search",
        method = "POST",
        body = graphQlRequestNotifications.some
      )(using tenant, adminSession)
      adminNotifResp.status mustBe 200
      (adminNotifResp.json \ "data" \ "myNotifications" \ "totalFiltered")
        .as[Int] mustBe numberOfAdminNotif

      val adminNotifs =
        (adminNotifResp.json \ "data" \ "myNotifications" \ "notifications")
          .as[JsArray]
          .value
      val ownerAdminNotif = adminNotifs.find(json =>
        (json \ "team" \ "_id").as[String] == teamOwnerId.value
      )
      val consumerAdminNotif = adminNotifs.find(json =>
        (json \ "team" \ "_id").as[String] == teamConsumerId.value
      )

      ownerAdminNotif.isDefined mustBe true
      (ownerAdminNotif.get \ "action" \ "__typename")
        .as[String] mustBe notificationType

      consumerAdminNotif.isDefined mustBe true
      (consumerAdminNotif.get \ "action" \ "__typename")
        .as[String] mustBe notificationType

      val userNotifResp = httpJsonCallBlocking(
        path = s"/api/search",
        method = "POST",
        body = graphQlRequestNotifications.some
      )(using tenant, userSession)
      userNotifResp.status mustBe 200
      (userNotifResp.json \ "data" \ "myNotifications" \ "totalFiltered")
        .as[Int] mustBe numberOfUserNotif

      val userNotifs =
        (userNotifResp.json \ "data" \ "myNotifications" \ "notifications")
          .as[JsArray]
          .value
      val ownerUserNotif = userNotifs.find(json =>
        (json \ "team" \ "_id").as[String] == teamOwnerId.value
      )
      val consumerUserNotif = userNotifs.find(json =>
        (json \ "team" \ "_id").as[String] == teamConsumerId.value
      )

      ownerUserNotif.isDefined mustBe false
      consumerUserNotif.isDefined mustBe true
      (consumerUserNotif.get \ "action" \ "__typename")
        .as[String] mustBe notificationType
    }

    def checkOtoroshiKeyEnabling(
        apk: OtoroshiApiKey,
        enabled: Boolean = true,
        blocked: Boolean = false,
        routes: Seq[OtoroshiRouteId]
    ) = {
      def respVerifOto = httpJsonCallWithoutSessionBlocking(
        path = s"/apis/apim.otoroshi.io/v1/apikeys/${apk.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret
        ),
        port = container.mappedPort(8080),
        hostHeader = "otoroshi-api.oto.tools"
      )(using tenant)

      (respVerifOto.json \ "enabled").as[Boolean] mustBe enabled
      val authorizedEntities =
        (respVerifOto.json \ "authorizedEntities").as[JsArray]

      if (blocked)
        routes.foreach(r =>
          authorizedEntities.value
            .map(_.as[String]) must not contain (s"route_${r.value}")
        )
      else
        routes.foreach(r =>
          authorizedEntities.value.map(_.as[String]) must contain(
            s"route_${r.value}"
          )
        )
    }

    def triggerSyncJob(session: UserSession): Unit = {
      val resp = httpJsonCallBlocking(
        path = "/api/jobs/otoroshi/_sync?key=secret",
        method = "POST",
        body = Json.obj().some
      )(using tenant, session)
      resp.status mustBe 200
    }

    def archiveSubscriptionByOwner(
        session: UserSession,
        subscriptionId: ApiSubscriptionId,
        enabled: Boolean
    ): Unit = {
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/subscriptions/${subscriptionId.value}/_archiveByOwner?enabled=$enabled",
        method = "PUT"
      )(using tenant, session)
      resp.status mustBe 200
    }
  }

  def baseGraphQLQuery: String = {
    s"""
       |query getMyNotifications ($$limit : Int, $$offset: Int, $$filterTable: JsArray) {
       |      myNotifications (limit: $$limit, offset: $$offset, filterTable: $$filterTable) {
       |        notifications {
       |          team {
       |            _id
       |          }
       |          action {
       |            __typename
       |          }
       |        }
       |        total,
       |        totalFiltered,
       |       }
       |}
       |""".stripMargin
  }

  def getGraphQLQueryNotification(
      notificationType: String,
      baseGraphQLQuery: String
  ): JsObject = {
    Json.obj(
      "variables" -> Json.obj(
        "limit" -> 20,
        "offset" -> 0,
        "filterTable" -> Json.stringify(
          Json.arr(
            Json.obj(
              "id" -> "type",
              "value" -> Json.arr(notificationType)
            )
          )
        )
      ),
      "query" -> baseGraphQLQuery
    )
  }

}
