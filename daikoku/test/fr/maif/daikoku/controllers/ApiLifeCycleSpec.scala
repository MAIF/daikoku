package fr.maif.otoroshi.daikoku.tests

import cats.implicits.catsSyntaxOptionId
import com.dimafeng.testcontainers.GenericContainer.FileSystemBind
import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import fr.maif.otoroshi.daikoku.domain.ApiState.Blocked
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.tests.utils.DaikokuSpecHelper
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import fr.maif.otoroshi.daikoku.utils.LoggerImplicits.BetterLogger
import org.joda.time.DateTime
import org.scalatest.concurrent.IntegrationPatience
import org.scalatest.BeforeAndAfter
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.BindMode
import play.api.libs.json._

import scala.concurrent.Await
import scala.concurrent.duration._

class ApiLifeCycleSpec(
) extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfter
    with ForAllTestContainer {
  val pwd = System.getProperty("user.dir");

  //Container Otoroshi
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

  "API life cycle" must {
    "be smart" in {
      Await.result(waitForDaikokuSetup(), 5.second)
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
        ),
        subscriptions = Seq(
          ApiSubscription(
            id = ApiSubscriptionId(IdGenerator.token(12)),
            tenant = tenant.id,
            apiKey = OtoroshiApiKey("name", "id", "secret"),
            plan = defaultApi.plans.head.id,
            createdAt = DateTime.now(),
            team = teamConsumerId,
            api = defaultApi.api.id,
            by = userTeamAdminId,
            customName = None,
            rotation = None,
            integrationToken = "token"
          ),
          ApiSubscription(
            id = ApiSubscriptionId(IdGenerator.token(12)),
            tenant = tenant.id,
            apiKey = OtoroshiApiKey("name", "id", "secret"),
            plan = defaultApi.plans.reverse.head.id,
            createdAt = DateTime.now(),
            team = teamOwner.id,
            api = defaultApi.api.id,
            by = userTeamAdminId,
            customName = None,
            rotation = None,
            integrationToken = "token"
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
      changingAPIState(adminSession, ApiState.Published, 200)
      logger.info("from published => published")
      changingAPIState(adminSession, ApiState.Published, 200)
      logger.info("from published => created")
      changingAPIState(adminSession, ApiState.Deprecated, 200)
      logger.info("from published => blocked")
      changingAPIState(adminSession, ApiState.Blocked, 200)
      logger.info("from published => deprecated")
      changingAPIState(adminSession, ApiState.Deprecated, 200)
      logger.info("from deprecated => deprecated")
      changingAPIState(adminSession, ApiState.Deprecated, 200)
      logger.info("from deprecated => created")
      changingAPIState(adminSession, ApiState.Created, 409)
      logger.info("from deprecated => published")
      changingAPIState(adminSession, ApiState.Deprecated, 200)
      logger.info("from deprecated => blocked")
      changingAPIState(adminSession, ApiState.Blocked, 200)
      logger.info("from blocked => blocked")
      changingAPIState(adminSession, ApiState.Blocked, 200)
      logger.info("from blocked => created")
      changingAPIState(adminSession, ApiState.Created, 409)
      logger.info("from blocked => deprecated")
      changingAPIState(adminSession, ApiState.Deprecated, 200)
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
                url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
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
        apis = Seq(defaultApi.api.copy(possibleUsagePlans = Seq(planProd.id, planDev.id))),
        usagePlans = Seq(planProd, planDev),
        subscriptions = Seq(
          ApiSubscription(
            id = ApiSubscriptionId(IdGenerator.token(12)),
            tenant = tenant.id,
            apiKey = otoroshiApiKey1,
            plan = planProd.id,
            createdAt = DateTime.now(),
            team = teamConsumerId,
            api = defaultApi.api.id,
            by = userTeamAdminId,
            customName = None,
            rotation = None,
            integrationToken = "token"
          ),
          ApiSubscription(
            id = ApiSubscriptionId(IdGenerator.token(12)),
            tenant = tenant.id,
            apiKey = otoroshiApiKey2,
            plan = planDev.id,
            createdAt = DateTime.now(),
            team = teamOwner.id,
            api = defaultApi.api.id,
            by = userTeamAdminId,
            customName = None,
            rotation = None,
            integrationToken = "token"
          ),
          ApiSubscription(
            id = ApiSubscriptionId(IdGenerator.token(12)),
            tenant = tenant.id,
            apiKey = otoroshiApiKey3,
            plan = planDev.id,
            createdAt = DateTime.now(),
            team = teamConsumerId,
            api = defaultApi.api.id,
            by = userTeamAdminId,
            customName = None,
            rotation = None,
            integrationToken = "token"
          )
        )
      )

      val adminSession = loginWithBlocking(userAdmin, tenant)

      checkOtoroshiKeyEnabling(otoroshiApiKey1)
      checkOtoroshiKeyEnabling(otoroshiApiKey2)
      checkOtoroshiKeyEnabling(otoroshiApiKey3)

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

      checkOtoroshiKeyEnabling(otoroshiApiKey1, enabled = false)
      checkOtoroshiKeyEnabling(otoroshiApiKey2, enabled = false)
      checkOtoroshiKeyEnabling(otoroshiApiKey3, enabled = false)
      //todo: check notification (2 users, 3 teams, 1 teams with 2 admins, 1 teams with just users)
      //todo : check mail (test container)
    }

    def changingAPIState(session: UserSession, state: ApiState, statusResponse: Int = 200) = {
      {
        val resp = httpJsonCallBlocking(
          path =
            s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}",
          method = "PUT",
          body = Some(defaultApi.api.copy(state = state).asJson)
        )(tenant, session)
        resp.status mustBe statusResponse
        if (statusResponse == 200) (resp.json \ "state").as(json.ApiStateFormat) mustBe state
      }
    }

    def testNotificationLifeCycle(
        apiState: ApiState,
        notificationType: String,
        numberOfAdminNotif: Int,
        numberOfUserNotif: Int
    ) = {
      logger.info(s"passing api default state to ${apiState.name}")

      val adminSession                = loginWithBlocking(userAdmin, tenant)
      val userSession                 = loginWithBlocking(user, tenant)
      val graphQlRequestNotifications = getGraphQLQueryNotification(notificationType, baseGraphQLQuery)

      val adminNotifResp = httpJsonCallBlocking(
        path = s"/api/search",
        method = "POST",
        body = graphQlRequestNotifications.some
      )(tenant, adminSession)
      adminNotifResp.status mustBe 200
      (adminNotifResp.json \ "data" \ "myNotifications" \ "totalFiltered").as[Int] mustBe numberOfAdminNotif

      val adminNotifs        = (adminNotifResp.json \ "data" \ "myNotifications" \ "notifications").as[JsArray].value
      val ownerAdminNotif    = adminNotifs.find(json => (json \ "team" \ "_id").as[String] == teamOwnerId.value)
      val consumerAdminNotif = adminNotifs.find(json => (json \ "team" \ "_id").as[String] == teamConsumerId.value)

      ownerAdminNotif.isDefined mustBe true
      (ownerAdminNotif.get \ "action" \ "__typename").as[String] mustBe notificationType

      consumerAdminNotif.isDefined mustBe true
      (consumerAdminNotif.get \ "action" \ "__typename").as[String] mustBe notificationType

      val userNotifResp = httpJsonCallBlocking(
        path = s"/api/search",
        method = "POST",
        body = graphQlRequestNotifications.some
      )(tenant, userSession)
      userNotifResp.status mustBe 200
      (userNotifResp.json \ "data" \ "myNotifications" \ "totalFiltered").as[Int] mustBe numberOfUserNotif

      val userNotifs        = (userNotifResp.json \ "data" \ "myNotifications" \ "notifications").as[JsArray].value
      val ownerUserNotif    = userNotifs.find(json => (json \ "team" \ "_id").as[String] == teamOwnerId.value)
      val consumerUserNotif = userNotifs.find(json => (json \ "team" \ "_id").as[String] == teamConsumerId.value)

      ownerUserNotif.isDefined mustBe false
      consumerUserNotif.isDefined mustBe true
      (consumerUserNotif.get \ "action" \ "__typename").as[String] mustBe notificationType
    }

    def checkOtoroshiKeyEnabling(apk: OtoroshiApiKey, enabled: Boolean = true) = {
      def respVerifOto = httpJsonCallWithoutSessionBlocking(
        path = s"/api/apikeys/${apk.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id"     -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret
        ),
        port = container.mappedPort(8080),
        hostHeader = "otoroshi-api.oto.tools"
      )(tenant)

      (respVerifOto.json \ "enabled").as[Boolean] mustBe enabled
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

  def getGraphQLQueryNotification(notificationType: String, baseGraphQLQuery: String): JsObject = {
    Json.obj(
      "variables" -> Json.obj(
        "limit"       -> 20,
        "offset"      -> 0,
        "filterTable" -> Json.stringify(
          Json.arr(
            Json.obj(
              "id"    -> "type",
              "value" -> Json.arr(notificationType)
            )
          )
        )
      ),
      "query"     -> baseGraphQLQuery
    )
  }

  //TODO: Ecrire un test pour les aggregates
  // prendre en compte : Bloquer un enfant, puis un parent,
  // existe peut être déjà avec les souscriptiuobs

  //TODO: écrire un test pour la gestion des versions
  // Se passer de souscriptions : il  a une version par default (version 1) dans un premier temps. Si on crée d'autres versions, il faudrait pouvoir les définir comme par défault. Si on passe l'api default à bloqué
  //Ne pas modifier deux versions avec une seule requête
}
