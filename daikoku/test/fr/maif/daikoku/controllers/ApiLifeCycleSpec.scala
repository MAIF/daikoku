package fr.maif.otoroshi.daikoku.tests

import cats.implicits.catsSyntaxOptionId
import com.dimafeng.testcontainers.GenericContainer.FileSystemBind
import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import controllers.AppError
import controllers.AppError.SubscriptionAggregationDisabled
import fr.maif.otoroshi.daikoku.domain.NotificationAction.{ApiAccess, ApiSubscriptionDemand, TransferApiOwnership}
import fr.maif.otoroshi.daikoku.domain.NotificationType.AcceptOrReject
import fr.maif.otoroshi.daikoku.domain.TeamPermission.{Administrator, ApiEditor, TeamUser}
import fr.maif.otoroshi.daikoku.domain.UsagePlanVisibility.{Private, Public}
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json.{ApiFormat, SeqApiSubscriptionFormat}
import fr.maif.otoroshi.daikoku.tests.utils.DaikokuSpecHelper
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import org.joda.time.DateTime
import org.scalatest.concurrent.IntegrationPatience
import org.scalatest.{BeforeAndAfter, BeforeAndAfterEach}
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.BindMode
import play.api.http.Status
import play.api.libs.json._

import scala.concurrent.Await
import scala.concurrent.duration._
import scala.util.Random
import fr.maif.otoroshi.daikoku.utils.LoggerImplicits.BetterLogger

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
      //todo: created > published > deprecated > blocked
    }

    "notify customer when API is deprecated" in {
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

      val adminSession = loginWithBlocking(userAdmin, tenant)
      val userSession = loginWithBlocking(user, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}",
        method = "PUT",
        body = Some(defaultApi.api.copy(state = ApiState.Deprecated).asJson)
      )(tenant, adminSession)
      resp.status mustBe 200

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
        "variables" -> Json.obj("limit" -> 20, "offset" -> 0),
        "query"     -> baseGraphQLQuery
      )

      val adminNotifResp = httpJsonCallBlocking(
        path = s"/api/search",
        method = "POST",
        body = graphQlRequestNotifications.some
      )(tenant, adminSession)
      adminNotifResp.status mustBe 200
      (adminNotifResp.json \ "data" \ "myNotifications" \ "total").as[Int] mustBe 2
      val adminNotifs = (adminNotifResp.json \ "data" \ "myNotifications" \ "notifications").as[JsArray].value
      val ownerAdminNotif = adminNotifs.find(json => (json \ "team" \ "_id").as[String] == teamOwnerId.value)
      val consumerAdminNotif = adminNotifs.find(json => (json \ "team" \ "_id").as[String] == teamConsumerId.value)

      ownerAdminNotif.isDefined mustBe true
      (ownerAdminNotif.get \ "action" \ "__typename").as[String] mustBe "ApiDepreciationWarning"

      consumerAdminNotif.isDefined mustBe true
      (consumerAdminNotif.get \ "action" \ "__typename").as[String] mustBe "ApiDepreciationWarning"

      val userNotifResp = httpJsonCallBlocking(
        path = s"/api/search",
        method = "POST",
        body = graphQlRequestNotifications.some
      )(tenant, userSession)
      userNotifResp.status mustBe 200
      (userNotifResp.json \ "data" \ "myNotifications" \ "total").as[Int] mustBe 1

      val userNotifs = (userNotifResp.json \ "data" \ "myNotifications" \ "notifications").as[JsArray].value
      val ownerUserNotif = userNotifs.find(json => (json \ "team" \ "_id").as[String] == teamOwnerId.value)
      val consumerUserNotif = userNotifs.find(json => (json \ "team" \ "_id").as[String] == teamConsumerId.value)

      ownerUserNotif.isDefined mustBe false

      consumerUserNotif.isDefined mustBe true
      (consumerUserNotif.get \ "action" \ "__typename").as[String] mustBe "ApiDepreciationWarning"

      //
      //      resp.status mustBe 403
      //todo: check notification (2 users, 3 teams, 1 teams with 2 admins, 1 teams with just users)
      //todo : check mail (test container)
    }
  }
}
