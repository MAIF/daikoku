package fr.maif.otoroshi.daikoku.tests

import cats.implicits.catsSyntaxOptionId
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.tests.utils.DaikokuSpecHelper
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import fr.maif.otoroshi.daikoku.utils.LoggerImplicits.BetterLogger
import org.joda.time.DateTime
import org.scalatest.concurrent.IntegrationPatience
import org.scalatest.BeforeAndAfter
import org.scalatestplus.play.PlaySpec
import play.api.libs.json._
import play.api.libs.ws.WSResponse

import scala.concurrent.Await
import scala.concurrent.duration._

class ApiLifeCycleSpec()
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfter
//    with ForAllTestContainer
    {

//  val pwd = System.getProperty("user.dir");
//
//  override val container = GenericContainer(
//    "maif/otoroshi",
//    exposedPorts = Seq(8080),
//    fileSystemBind = Seq(
//      FileSystemBind(
//        s"$pwd/test/daikoku/otoroshi.json",
//        "/home/user/otoroshi.json",
//        BindMode.READ_ONLY
//      )
//    ),
//    env = Map("APP_IMPORT_FROM" -> "/home/user/otoroshi.json")
//  )

//  before {
//    Await.result(cleanOtoroshiServer(container.mappedPort(8080)), 5.seconds)
//  }

  "API life cycle" must {

    "be smart" in {
      Await.result(waitForDaikokuSetup(), 5.second)
      setupEnvBlocking(
        tenants = Seq(tenant),
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
        apis = Seq(defaultApi.api.copy(state = ApiState.Created)),
        usagePlans = defaultApi.plans,
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

    def changingAPIState(session: UserSession, state: ApiState, statusResponse: Int) = {
      {
        logger.info("API lifecycle ")
        val resp = httpJsonCallBlocking(
          path =
            s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}",
          method = "PUT",
          body = Some(defaultApi.api.copy(state = state).asJson)
        )(tenant, session)
        logger.json(resp.json, true)
        resp.status mustBe statusResponse
        if (statusResponse == 200) (resp.json \ "state").as(json.ApiStateFormat) mustBe state
      }
    }

    def testNotificationLifeCycle(apiState: ApiState, notificationType: String) = {
      logger.info(s"passing api default state to ${apiState.name}")

      val adminSession                = loginWithBlocking(userAdmin, tenant)
      val userSession                 = loginWithBlocking(user, tenant)
      changingAPIState(session = adminSession, state = apiState, statusResponse = 200)
      val baseGraphQLQuery            =
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
      val graphQlRequestNotifications = Json.obj(
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

      val adminNotifResp     = httpJsonCallBlocking(
        path = s"/api/search",
        method = "POST",
        body = graphQlRequestNotifications.some
      )(tenant, adminSession)
      adminNotifResp.status mustBe 200
      (adminNotifResp.json \ "data" \ "myNotifications" \ "totalFiltered").as[Int] mustBe 2
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
      (userNotifResp.json \ "data" \ "myNotifications" \ "totalFiltered").as[Int] mustBe 1

      val userNotifs        = (userNotifResp.json \ "data" \ "myNotifications" \ "notifications").as[JsArray].value
      val ownerUserNotif    = userNotifs.find(json => (json \ "team" \ "_id").as[String] == teamOwnerId.value)
      val consumerUserNotif = userNotifs.find(json => (json \ "team" \ "_id").as[String] == teamConsumerId.value)

      ownerUserNotif.isDefined mustBe false
      consumerUserNotif.isDefined mustBe true
      (consumerUserNotif.get \ "action" \ "__typename").as[String] mustBe notificationType

    }

    "notify customer when API lifeCycle change needs to" in {

      Await.result(waitForDaikokuSetup(), 5.second)
      setupEnvBlocking(
        tenants = Seq(tenant),
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
        apis = Seq(defaultApi.api),
        usagePlans = defaultApi.plans,
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
      testNotificationLifeCycle(ApiState.Deprecated, "ApiDepreciationWarning")
      testNotificationLifeCycle(ApiState.Blocked, "ApiBlockingWarning")
      

      // vérifier l'etat des souscriptions
      // vérifier si les apiKey oto sont disabled


      //todo: check notification (2 users, 3 teams, 1 teams with 2 admins, 1 teams with just users)
      //todo : check mail (test container)
    }
  }
}
