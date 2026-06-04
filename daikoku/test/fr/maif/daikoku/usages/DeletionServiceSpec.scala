package fr.maif.daikoku.usages

import com.dimafeng.testcontainers.GenericContainer.FileSystemBind
import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import fr.maif.daikoku.utils.IdGenerator
import org.awaitility.scala.AwaitilitySupport
import org.joda.time.DateTime
import org.scalatest.BeforeAndAfter
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.BindMode
import play.api.libs.json.{JsArray, JsString, Json}
import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.domain.TeamPermission.Administrator
import fr.maif.daikoku.utils.LoggerImplicits.BetterLogger

import scala.concurrent.Await
import scala.concurrent.duration.*
import scala.jdk.DurationConverters.*
import scala.util.Random

class DeletionServiceSpec
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfter
    with ForAllTestContainer
    with AwaitilitySupport {

  val pwd: String = System.getProperty("user.dir")

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

  private def makeAllNotifs(
      api: Api,
      plan: UsagePlan,
      sub: ApiSubscription,
      keyring: Keyring,
      demandId: DemandId,
      stepId: SubscriptionDemandStepId
  ): Seq[Notification] = {
    def notif(id: String, action: NotificationAction) = Notification(
      id = NotificationId(id),
      tenant = tenant.id,
      team = None,
      sender =
        userAdmin.asNotificationSender, // not user — avoids cascade on delete user
      action = action
    )

    Seq(
      notif(
        "n-api-access",
        NotificationAction.ApiAccess(api.id, teamConsumerId)
      ),
      notif(
        "n-team-invitation",
        NotificationAction.TeamInvitation(teamOwnerId, user.id)
      ),
      notif(
        "n-sub-accept",
        NotificationAction
          .ApiSubscriptionAccept(api.id, plan.id, teamConsumerId)
      ),
      notif(
        "n-sub-reject",
        NotificationAction
          .ApiSubscriptionReject(None, api.id, plan.id, teamConsumerId)
      ),
      notif(
        "n-sub-demand",
        NotificationAction.ApiSubscriptionDemand(
          api.id,
          plan.id,
          teamConsumerId,
          demandId,
          stepId,
          None,
          None
        )
      ),
      notif(
        "n-account-creation",
        NotificationAction
          .AccountCreationAttempt(demandId, stepId, "motivation")
      ),
      notif(
        "n-sub-transfer-success",
        NotificationAction.ApiSubscriptionTransferSuccess(sub.id)
      ),
      notif(
        "n-oto-sync-sub-error",
        NotificationAction.OtoroshiSyncSubscriptionError(sub, "sync error")
      ),
      notif(
        "n-oto-sync-api-error",
        NotificationAction.OtoroshiSyncApiError(api, "sync error")
      ),
      notif(
        "n-key-deletion",
        NotificationAction
          .ApiKeyDeletionInformation(api.id.value, keyring.apiKey.clientId)
      ),
      notif(
        "n-key-rotation-in-progress",
        NotificationAction.ApiKeyRotationInProgress(
          keyring.apiKey.clientId,
          api.id.value,
          plan.id.value
        )
      ),
      notif(
        "n-key-rotation-ended",
        NotificationAction
          .ApiKeyRotationEnded(keyring.apiKey.clientId, api.id.value, plan.id.value)
      ),
      notif(
        "n-key-refresh",
        NotificationAction
          .ApiKeyRefresh(sub.id.value, api.id.value, plan.id.value)
      ),
      notif(
        "n-new-post",
        NotificationAction.NewPostPublished(teamOwnerId.value, api.name)
      ),
      notif(
        "n-new-issue",
        NotificationAction
          .NewIssueOpen(teamOwnerId.value, api.name, s"/apis/${api.id.value}")
      ),
      notif(
        "n-new-comment",
        NotificationAction.NewCommentOnIssue(
          teamOwnerId.value,
          api.name,
          s"/apis/${api.id.value}"
        )
      ),
      notif(
        "n-key-deletion-v2",
        NotificationAction
          .ApiKeyDeletionInformationV2(api.id, keyring.apiKey.clientId, sub.id)
      ),
      notif(
        "n-key-rotation-in-progress-v2",
        NotificationAction.ApiKeyRotationInProgressV2(sub.id, api.id, plan.id)
      ),
      notif(
        "n-key-rotation-ended-v2",
        NotificationAction.ApiKeyRotationEndedV2(sub.id, api.id, plan.id)
      ),
      notif(
        "n-key-refresh-v2",
        NotificationAction.ApiKeyRefreshV2(keyring.id)
      ),
      notif(
        "n-new-post-v2",
        NotificationAction.NewPostPublishedV2(api.id, ApiPostId("some-post"))
      ),
      notif(
        "n-new-issue-v2",
        NotificationAction.NewIssueOpenV2(api.id, ApiIssueId("some-issue"))
      ),
      notif(
        "n-new-comment-v2",
        NotificationAction
          .NewCommentOnIssueV2(api.id, ApiIssueId("some-issue"), user.id)
      ),
      notif(
        "n-transfer-ownership",
        NotificationAction.TransferApiOwnership(teamOwnerId, api.id)
      ),
      notif(
        "n-checkout",
        NotificationAction.CheckoutForSubscription(
          demandId,
          api.id,
          plan.id,
          stepId
        )
      )
    )
  }

  "complete deletion of used item" must {
    "be completed by team deletion" in {
      val userPersonalTeam = Team(
        id = TeamId("user-team"),
        tenant = tenant.id,
        `type` = TeamType.Personal,
        name = "user team personal",
        description = "",
        contact = user.email,
        users = Set(UserWithPermission(user.id, TeamPermission.Administrator))
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = userPersonalTeam.id,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "test"
      )
      val personalSubscription = ApiSubscription(
        id = ApiSubscriptionId("1"),
        tenant = tenant.id,
        plan = defaultApi.plans.head.id,
        createdAt = DateTime.now(),
        team = userPersonalTeam.id,
        api = defaultApi.api.id,
        by = user.id,
        customName = Some("custom name"),
        keyring = keyring.id
      )

      val subscribedPlan = defaultApi.plans.reverse.head.id
      val subscriptionDemand = SubscriptionDemand(
        id = DemandId("test"),
        tenant = tenant.id,
        api = defaultApi.api.id,
        plan = subscribedPlan,
        steps = Seq(
          SubscriptionDemandStep(
            id = SubscriptionDemandStepId("admin"),
            state = SubscriptionDemandState.Waiting,
            step = ValidationStep.TeamAdmin(
              id = IdGenerator.token(10),
              team = teamOwner.id
            )
          )
        ),
        state = SubscriptionDemandState.InProgress,
        team = teamConsumerId,
        from = user.id,
        motivation = None
      )

      val subDemandNotif = Notification(
        id = NotificationId(IdGenerator.token(10)),
        tenant = tenant.id,
        team = None,
        sender = user.asNotificationSender,
        action = NotificationAction.ApiSubscriptionDemand(
          api = defaultApi.api.id,
          plan = defaultApi.plans.reverse.head.id,
          team = teamConsumerId,
          demand = DemandId("test"),
          step = SubscriptionDemandStepId("admin"),
          motivation = None
        )
      )

      val page = ApiDocumentationPage(
        id = ApiDocumentationPageId(IdGenerator.token(10)),
        tenant = tenant.id,
        title = "test",
        lastModificationAt = DateTime.now(),
        content = "#title"
      )

      val post = ApiPost(
        id = ApiPostId(IdGenerator.token(10)),
        tenant = tenant.id,
        title = "title",
        lastModificationAt = DateTime.now(),
        content = "test"
      )

      val issue = ApiIssue(
        id = ApiIssueId(IdGenerator.token(10)),
        seqId = 10,
        tenant = tenant.id,
        title = "title",
        tags = Set.empty,
        open = true,
        createdAt = DateTime.now(),
        closedAt = None,
        by = user.id,
        comments = Seq.empty,
        lastModificationAt = DateTime.now(),
        apiVersion = defaultApi.api.currentVersion.value.some
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(otoroshiSettings =
            Set(
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
        teams = Seq(teamOwner, teamConsumer, userPersonalTeam),
        usagePlans = defaultApi.plans.map(
          _.copy(otoroshiTarget =
            Some(
              OtoroshiTarget(
                containerizedOtoroshi,
                Some(
                  AuthorizedEntities(
                    routes = Set(OtoroshiRouteId(parentRouteId))
                  )
                )
              )
            )
          )
        ),
        apis = Seq(
          defaultApi.api.copy(
            posts = Seq(post.id),
            issues = Seq(issue.id),
            documentation = ApiDocumentation(
              id = ApiDocumentationId(IdGenerator.token(10)),
              tenant = tenant.id,
              pages =
                Seq(ApiDocumentationDetailPage(page.id, page.title, Seq.empty)),
              lastModificationAt = DateTime.now
            )
          )
        ),
        pages = Seq(page),
        posts = Seq(post),
        issues = Seq(issue),
        subscriptions = Seq(personalSubscription),
        keyrings = Seq(keyring),
        subscriptionDemands = Seq(subscriptionDemand),
        notifications = Seq(subDemandNotif)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}",
        method = "DELETE",
        body = Json.obj().some
      )(using tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      def operationsPending() = {
        Await.result(
          daikokuComponents.env.dataStore.operationRepo
            .forTenant(tenant)
            .find(
              Json.obj(
                "status" ->
                  Json.obj(
                    "$in" ->
                      JsArray(
                        Seq(
                          JsString(OperationStatus.Idle.name),
                          JsString(OperationStatus.InProgress.name)
                        )
                      )
                  )
              )
            ),
          5.second
        )
      }

      // await until operation is run by queuejob
      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().nonEmpty
      }
      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().isEmpty
      }

      // todo: verif if subscriptions, docs, plans, demands & stepValidatores are cleans

      // test if user subscriptions deleted
      val _maybeSubscription = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findById(personalSubscription.id),
        5.second
      )
      _maybeSubscription.isDefined mustBe true
      _maybeSubscription.forall(_.deleted) mustBe true

      // test if plans are deleted
      val _maybePlans = Await.result(
        daikokuComponents.env.dataStore.usagePlanRepo
          .forTenant(tenant)
          .findNotDeleted(
            Json.obj(
              "_id" -> Json
                .obj("$in" -> JsArray(defaultApi.plans.map(_.id.asJson)))
            )
          ),
        5.second
      )
      _maybePlans.isEmpty mustBe true

      // test if docs are deleted
      val _maybeDocs = Await.result(
        daikokuComponents.env.dataStore.apiDocumentationPageRepo
          .forTenant(tenant)
          .findByIdNotDeleted(page.id),
        5.second
      )
      _maybeDocs.isEmpty mustBe true

      // test if posts are deleted
      val _maybePosts = Await.result(
        daikokuComponents.env.dataStore.apiPostRepo
          .forTenant(tenant)
          .findByIdNotDeleted(post.id),
        5.second
      )
      _maybePosts.isEmpty mustBe true

      // test if issues are deleted
      val _maybeIssue = Await.result(
        daikokuComponents.env.dataStore.apiIssueRepo
          .forTenant(tenant)
          .findByIdNotDeleted(issue.id),
        5.second
      )
      _maybeIssue.isEmpty mustBe true

      // test if api notification are cleaned
      val notifDemand = Await.result(
        daikokuComponents.env.dataStore.notificationRepo
          .forAllTenant()
          .findByIdNotDeleted(subDemandNotif.id),
        5.second
      )
      notifDemand mustBe None

      Await.result(
        daikokuComponents.env.dataStore.subscriptionDemandRepo
          .forAllTenant()
          .findById(subscriptionDemand.id),
        5.second
      ) mustBe None

      // verif oto apikey
      val respVerifOto = httpJsonCallBlocking(
        path =
          s"/apis/apim.otoroshi.io/v1/apikeys/${keyring.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)

      logger.json(respVerifOto.json, pretty = true)
      respVerifOto.status mustBe 404
    }

    "be completed by delete user" in {
      val userPersonalTeam = Team(
        id = TeamId("user-team"),
        tenant = tenant.id,
        `type` = TeamType.Personal,
        name = "user team personal",
        description = "",
        contact = user.email,
        users = Set(UserWithPermission(user.id, TeamPermission.Administrator))
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = userPersonalTeam.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "test"
      )
      val personalSubscription = ApiSubscription(
        id = ApiSubscriptionId("1"),
        tenant = tenant.id,
        plan = defaultApi.plans.head.id,
        createdAt = DateTime.now(),
        team = userPersonalTeam.id,
        api = defaultApi.api.id,
        by = user.id,
        customName = Some("custom name"),
        keyring = keyring.id
      )

      val teamInvitationNotif = Notification(
        id = NotificationId(IdGenerator.token(10)),
        tenant = tenant.id,
        team = None,
        sender = userAdmin.asNotificationSender,
        action = NotificationAction.TeamInvitation(
          team = teamOwnerId,
          user = user.id
        )
      )

      val subscribedPlan = defaultApi.plans.reverse.head.id
      val subscriptionDemand = SubscriptionDemand(
        id = DemandId("test"),
        tenant = tenant.id,
        api = defaultApi.api.id,
        plan = subscribedPlan,
        steps = Seq(
          SubscriptionDemandStep(
            id = SubscriptionDemandStepId("admin"),
            state = SubscriptionDemandState.Waiting,
            step = ValidationStep.TeamAdmin(
              id = IdGenerator.token(10),
              team = teamOwner.id
            )
          )
        ),
        state = SubscriptionDemandState.InProgress,
        team = teamConsumerId,
        from = user.id,
        motivation = None
      )

      val subDemandNotif = Notification(
        id = NotificationId(IdGenerator.token(10)),
        tenant = tenant.id,
        team = None,
        sender = user.asNotificationSender,
        action = NotificationAction.ApiSubscriptionDemand(
          api = defaultApi.api.id,
          plan = defaultApi.plans.reverse.head.id,
          team = teamConsumerId,
          demand = DemandId("test"),
          step = SubscriptionDemandStepId("admin"),
          motivation = None
        )
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, userAdmin, user, userApiEditor),
        apis = Seq(defaultApi.api),
        usagePlans = defaultApi.plans,
        subscriptions = Seq(personalSubscription),
        keyrings = Seq(keyring),
        subscriptionDemands = Seq(subscriptionDemand),
        notifications = Seq(subDemandNotif, teamInvitationNotif),
        teams = Seq(
          userPersonalTeam,
          teamConsumer,
          teamOwner.copy(
            users = Set(UserWithPermission(userTeamAdminId, Administrator))
          )
        )
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)

      val respUpdate =
        httpJsonCallBlocking(
          path = s"/api/admin/users/${userTeamUserId.value}",
          method = "DELETE"
        )(using tenant, session)
      respUpdate.status mustBe 200

      val resp = httpJsonCallBlocking(
        s"/api/admin/users/${userTeamUserId.value}"
      )(using tenant, session)
      resp.status mustBe 404

      // test if user personal team deleted
      val respTestTeam =
        httpJsonCallBlocking(s"/api/teams/${userPersonalTeam.id.value}")(using
          tenant,
          session
        )
      respTestTeam.status mustBe 404

      // test if user teams cleaned
      val respTestConsumerTeam =
        httpJsonCallBlocking(s"/api/teams/${teamConsumerId.value}")(using
          tenant,
          session
        )
      respTestConsumerTeam.status mustBe 200
      val _consumerTeam = respTestConsumerTeam.json.as(using json.TeamFormat)
      _consumerTeam.users.exists(_.userId == user.id) mustBe false

      // test if user subscriptions deleted
      val _maybeSubscription = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forAllTenant()
          .findById(personalSubscription.id),
        5.second
      )

      _maybeSubscription.isDefined mustBe true
      _maybeSubscription.forall(_.deleted) mustBe true

      // test if notification by user, for user are cleaned
      // 1 - teamInvitation
      val notifInvitation = Await.result(
        daikokuComponents.env.dataStore.notificationRepo
          .forAllTenant()
          .findById(teamInvitationNotif.id),
        5.second
      )
      notifInvitation mustBe None

      // 2 - subDemand
      val notifDemand = Await.result(
        daikokuComponents.env.dataStore.notificationRepo
          .forAllTenant()
          .findById(subDemandNotif.id),
        5.second
      )
      notifDemand mustBe None

      Await.result(
        daikokuComponents.env.dataStore.subscriptionDemandRepo
          .forAllTenant()
          .findById(subscriptionDemand.id),
        5.second
      ) mustBe None

    }

    val randomUser = Random.shuffle(Seq(user, userApiEditor, userAdmin)).head
    "delete self" in {
      val userPersonalTeam = Team(
        id = TeamId(s"${randomUser.humanReadableId}-team"),
        tenant = tenant.id,
        `type` = TeamType.Personal,
        name = s"$randomUser team personal",
        description = "",
        contact = randomUser.email,
        users =
          Set(UserWithPermission(randomUser.id, TeamPermission.Administrator))
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = userPersonalTeam.id,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "test"
      )
      val personalSubscription = ApiSubscription(
        id = ApiSubscriptionId("1"),
        tenant = tenant.id,
        plan = defaultApi.plans.head.id,
        createdAt = DateTime.now(),
        team = userPersonalTeam.id,
        api = defaultApi.api.id,
        by = randomUser.id,
        customName = Some("custom name"),
        keyring = keyring.id
      )

      val teamInvitationNotif = Notification(
        id = NotificationId(IdGenerator.token(10)),
        tenant = tenant.id,
        team = None,
        sender = userAdmin.asNotificationSender,
        action = NotificationAction.TeamInvitation(
          team = teamOwnerId,
          user = randomUser.id
        )
      )

      val subscribedPlan = defaultApi.plans.reverse.head.id
      val subscriptionDemand = SubscriptionDemand(
        id = DemandId("test"),
        tenant = tenant.id,
        api = defaultApi.api.id,
        plan = subscribedPlan,
        steps = Seq(
          SubscriptionDemandStep(
            id = SubscriptionDemandStepId("admin"),
            state = SubscriptionDemandState.Waiting,
            step = ValidationStep.TeamAdmin(
              id = IdGenerator.token(10),
              team = teamOwner.id
            )
          )
        ),
        state = SubscriptionDemandState.InProgress,
        team = teamConsumerId,
        from = randomUser.id,
        motivation = None
      )

      val subDemandNotif = Notification(
        id = NotificationId(IdGenerator.token(10)),
        tenant = tenant.id,
        team = None,
        sender = randomUser.asNotificationSender,
        action = NotificationAction.ApiSubscriptionDemand(
          api = defaultApi.api.id,
          plan = defaultApi.plans.reverse.head.id,
          team = teamConsumerId,
          demand = DemandId("test"),
          step = SubscriptionDemandStepId("admin"),
          motivation = None
        )
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, userAdmin, user, userApiEditor),
        apis = Seq(defaultApi.api),
        usagePlans = defaultApi.plans,
        subscriptions = Seq(personalSubscription),
        keyrings = Seq(keyring),
        subscriptionDemands = Seq(subscriptionDemand),
        notifications = Seq(subDemandNotif, teamInvitationNotif),
        teams = Seq(
          userPersonalTeam,
          teamConsumer,
          teamOwner.copy(
            users = Set(UserWithPermission(daikokuAdmin.id, Administrator))
          )
        )
      )

      val session = loginWithBlocking(randomUser, tenant)
      val respDelete =
        httpJsonCallBlocking(path = s"/api/me", method = "DELETE")(using
          tenant,
          session
        )
      respDelete.status mustBe 200

      val sessionAdmin = loginWithBlocking(daikokuAdmin, tenant)
      val resp = httpJsonCallBlocking(
        s"/api/admin/users/${randomUser.id.value}"
      )(using tenant, sessionAdmin)
      resp.status mustBe 404

      // test if user personal team deleted
      val respTestTeam =
        httpJsonCallBlocking(s"/api/teams/${userPersonalTeam.id.value}")(using
          tenant,
          sessionAdmin
        )
      respTestTeam.status mustBe 404

      // test if user teams cleaned
      val respTestConsumerTeam =
        httpJsonCallBlocking(s"/api/teams/${teamConsumerId.value}")(using
          tenant,
          sessionAdmin
        )
      respTestConsumerTeam.status mustBe 200
      val _consumerTeam = respTestConsumerTeam.json.as(using json.TeamFormat)
      _consumerTeam.users.exists(_.userId == randomUser.id) mustBe false

      // test if user subscriptions deleted
      val _maybeSubscription = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forAllTenant()
          .findById(personalSubscription.id),
        5.second
      )

      _maybeSubscription.isDefined mustBe true
      _maybeSubscription.forall(_.deleted) mustBe true

      // test if notification by user, for user are cleaned
      // 1 - teamInvitation
      val notifInvitation = Await.result(
        daikokuComponents.env.dataStore.notificationRepo
          .forAllTenant()
          .findById(teamInvitationNotif.id),
        5.second
      )
      notifInvitation mustBe None

      // 2 - subDemand
      val notifDemand = Await.result(
        daikokuComponents.env.dataStore.notificationRepo
          .forAllTenant()
          .findById(subDemandNotif.id),
        5.second
      )
      notifDemand mustBe None

      Await.result(
        daikokuComponents.env.dataStore.subscriptionDemandRepo
          .forAllTenant()
          .findById(subscriptionDemand.id),
        5.second
      ) mustBe None
    }

    "be completed by delete an api" in {
      val userPersonalTeam = Team(
        id = TeamId("user-team"),
        tenant = tenant.id,
        `type` = TeamType.Personal,
        name = "user team personal",
        description = "",
        contact = user.email,
        users = Set(UserWithPermission(user.id, TeamPermission.Administrator))
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = userPersonalTeam.id,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "test"
      )
      val personalSubscription = ApiSubscription(
        id = ApiSubscriptionId("1"),
        tenant = tenant.id,
        plan = defaultApi.plans.head.id,
        createdAt = DateTime.now(),
        team = userPersonalTeam.id,
        api = defaultApi.api.id,
        by = user.id,
        customName = Some("custom name"),
        keyring = keyring.id
      )

      val subscribedPlan = defaultApi.plans.reverse.head.id
      val subscriptionDemand = SubscriptionDemand(
        id = DemandId("test"),
        tenant = tenant.id,
        api = defaultApi.api.id,
        plan = subscribedPlan,
        steps = Seq(
          SubscriptionDemandStep(
            id = SubscriptionDemandStepId("admin"),
            state = SubscriptionDemandState.Waiting,
            step = ValidationStep.TeamAdmin(
              id = IdGenerator.token(10),
              team = teamOwner.id
            )
          )
        ),
        state = SubscriptionDemandState.InProgress,
        team = teamConsumerId,
        from = user.id,
        motivation = None
      )

      val subDemandNotif = Notification(
        id = NotificationId(IdGenerator.token(10)),
        tenant = tenant.id,
        team = None,
        sender = user.asNotificationSender,
        action = NotificationAction.ApiSubscriptionDemand(
          api = defaultApi.api.id,
          plan = defaultApi.plans.reverse.head.id,
          team = teamConsumerId,
          demand = DemandId("test"),
          step = SubscriptionDemandStepId("admin"),
          motivation = None
        )
      )

      val page = ApiDocumentationPage(
        id = ApiDocumentationPageId(IdGenerator.token(10)),
        tenant = tenant.id,
        title = "test",
        lastModificationAt = DateTime.now(),
        content = "#title"
      )

      val post = ApiPost(
        id = ApiPostId(IdGenerator.token(10)),
        tenant = tenant.id,
        title = "title",
        lastModificationAt = DateTime.now(),
        content = "test"
      )

      val issue = ApiIssue(
        id = ApiIssueId(IdGenerator.token(10)),
        seqId = 10,
        tenant = tenant.id,
        title = "title",
        tags = Set.empty,
        open = true,
        createdAt = DateTime.now(),
        closedAt = None,
        by = user.id,
        comments = Seq.empty,
        lastModificationAt = DateTime.now(),
        apiVersion = defaultApi.api.currentVersion.value.some
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(otoroshiSettings =
            Set(
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
        teams = Seq(teamOwner, teamConsumer, userPersonalTeam),
        usagePlans = defaultApi.plans.map(
          _.copy(otoroshiTarget =
            Some(
              OtoroshiTarget(
                containerizedOtoroshi,
                Some(
                  AuthorizedEntities(
                    routes = Set(OtoroshiRouteId(parentRouteId))
                  )
                )
              )
            )
          )
        ),
        apis = Seq(
          defaultApi.api.copy(
            posts = Seq(post.id),
            issues = Seq(issue.id),
            documentation = ApiDocumentation(
              id = ApiDocumentationId(IdGenerator.token(10)),
              tenant = tenant.id,
              pages =
                Seq(ApiDocumentationDetailPage(page.id, page.title, Seq.empty)),
              lastModificationAt = DateTime.now
            )
          )
        ),
        pages = Seq(page),
        posts = Seq(post),
        issues = Seq(issue),
        subscriptions = Seq(personalSubscription),
        keyrings = Seq(keyring),
        subscriptionDemands = Seq(subscriptionDemand),
        notifications = Seq(subDemandNotif)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}",
        method = "DELETE",
        body = Json.obj().some
      )(using tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      def operationsPending() = {
        Await.result(
          daikokuComponents.env.dataStore.operationRepo
            .forTenant(tenant)
            .find(
              Json.obj(
                "status" ->
                  Json.obj(
                    "$in" ->
                      JsArray(
                        Seq(
                          JsString(OperationStatus.Idle.name),
                          JsString(OperationStatus.InProgress.name)
                        )
                      )
                  )
              )
            ),
          5.second
        )
      }

      // await until operation is run by queuejob
      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().nonEmpty
      }
      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().isEmpty
      }

      // todo: verif if subscriptions, docs, plans, demands & stepValidatores are cleans

      // test if user subscriptions deleted
      val _maybeSubscription = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findById(personalSubscription.id),
        5.second
      )
      _maybeSubscription.isDefined mustBe true
      _maybeSubscription.forall(_.deleted) mustBe true

      // test if plans are deleted
      val _maybePlans = Await.result(
        daikokuComponents.env.dataStore.usagePlanRepo
          .forTenant(tenant)
          .findNotDeleted(
            Json.obj(
              "_id" -> Json
                .obj("$in" -> JsArray(defaultApi.plans.map(_.id.asJson)))
            )
          ),
        5.second
      )
      _maybePlans.isEmpty mustBe true

      // test if docs are deleted
      val _maybeDocs = Await.result(
        daikokuComponents.env.dataStore.apiDocumentationPageRepo
          .forTenant(tenant)
          .findByIdNotDeleted(page.id),
        5.second
      )
      _maybeDocs.isEmpty mustBe true

      // test if posts are deleted
      val _maybePosts = Await.result(
        daikokuComponents.env.dataStore.apiPostRepo
          .forTenant(tenant)
          .findByIdNotDeleted(post.id),
        5.second
      )
      _maybePosts.isEmpty mustBe true

      // test if issues are deleted
      val _maybeIssue = Await.result(
        daikokuComponents.env.dataStore.apiIssueRepo
          .forTenant(tenant)
          .findByIdNotDeleted(issue.id),
        5.second
      )
      _maybeIssue.isEmpty mustBe true

      // test if api notification are cleaned
      val notifDemand = Await.result(
        daikokuComponents.env.dataStore.notificationRepo
          .forAllTenant()
          .findByIdNotDeleted(subDemandNotif.id),
        5.second
      )
      notifDemand mustBe None

      Await.result(
        daikokuComponents.env.dataStore.subscriptionDemandRepo
          .forAllTenant()
          .findById(subscriptionDemand.id),
        5.second
      ) mustBe None

      // verif oto apikey
      val respVerifOto = httpJsonCallBlocking(
        path =
          s"/apis/apim.otoroshi.io/v1/apikeys/${keyring.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)

      logger.json(respVerifOto.json, pretty = true)
      respVerifOto.status mustBe 404
    }

    "be completed by delete a plan" in {
      val userPersonalTeam = Team(
        id = TeamId("user-team"),
        tenant = tenant.id,
        `type` = TeamType.Personal,
        name = "user team personal",
        description = "",
        contact = user.email,
        users = Set(UserWithPermission(user.id, TeamPermission.Administrator))
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = userPersonalTeam.id,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "test"
      )
      val personalSubscription = ApiSubscription(
        id = ApiSubscriptionId("1"),
        tenant = tenant.id,
        plan = defaultApi.plans.head.id,
        createdAt = DateTime.now(),
        team = userPersonalTeam.id,
        api = defaultApi.api.id,
        by = user.id,
        customName = Some("custom name"),
        keyring = keyring.id
      )

      val subscribedPlan = defaultApi.plans.head.id
      val subscriptionDemand = SubscriptionDemand(
        id = DemandId("test"),
        tenant = tenant.id,
        api = defaultApi.api.id,
        plan = subscribedPlan,
        steps = Seq(
          SubscriptionDemandStep(
            id = SubscriptionDemandStepId("admin"),
            state = SubscriptionDemandState.Waiting,
            step = ValidationStep.TeamAdmin(
              id = IdGenerator.token(10),
              team = teamOwner.id
            )
          )
        ),
        state = SubscriptionDemandState.InProgress,
        team = teamConsumerId,
        from = user.id,
        motivation = None
      )

      val subDemandNotif = Notification(
        id = NotificationId(IdGenerator.token(10)),
        tenant = tenant.id,
        team = None,
        sender = user.asNotificationSender,
        action = NotificationAction.ApiSubscriptionDemand(
          api = defaultApi.api.id,
          plan = defaultApi.plans.head.id,
          team = teamConsumerId,
          demand = DemandId("test"),
          step = SubscriptionDemandStepId("admin"),
          motivation = None
        )
      )

      val page = ApiDocumentationPage(
        id = ApiDocumentationPageId(IdGenerator.token(10)),
        tenant = tenant.id,
        title = "test",
        lastModificationAt = DateTime.now(),
        content = "#title"
      )

      val post = ApiPost(
        id = ApiPostId(IdGenerator.token(10)),
        tenant = tenant.id,
        title = "title",
        lastModificationAt = DateTime.now(),
        content = "test"
      )

      val issue = ApiIssue(
        id = ApiIssueId(IdGenerator.token(10)),
        seqId = 10,
        tenant = tenant.id,
        title = "title",
        tags = Set.empty,
        open = true,
        createdAt = DateTime.now(),
        closedAt = None,
        by = user.id,
        comments = Seq.empty,
        lastModificationAt = DateTime.now(),
        apiVersion = defaultApi.api.currentVersion.value.some
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(otoroshiSettings =
            Set(
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
        teams = Seq(teamOwner, teamConsumer, userPersonalTeam),
        usagePlans = defaultApi.plans.map(
          _.copy(
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
            documentation = ApiDocumentation(
              id = ApiDocumentationId(IdGenerator.token(10)),
              tenant = tenant.id,
              pages =
                Seq(ApiDocumentationDetailPage(page.id, page.title, Seq.empty)),
              lastModificationAt = DateTime.now
            ).some
          )
        ),
        apis = Seq(
          defaultApi.api.copy(
            posts = Seq(post.id),
            issues = Seq(issue.id),
            documentation = ApiDocumentation(
              id = ApiDocumentationId(IdGenerator.token(10)),
              tenant = tenant.id,
              pages = Seq.empty,
              lastModificationAt = DateTime.now
            )
          )
        ),
        pages = Seq(page),
        posts = Seq(post),
        issues = Seq(issue),
        subscriptions = Seq(personalSubscription),
        keyrings = Seq(keyring),
        subscriptionDemands = Seq(subscriptionDemand),
        notifications = Seq(subDemandNotif)
      )
      val session = loginWithBlocking(userAdmin, tenant)
      val deleteplan = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/plan/${subscribedPlan.value}",
        method = "DELETE",
        body = Json.obj().some
      )(using tenant, session)
      deleteplan.status mustBe 200
      (deleteplan.json \ "done").as[Boolean] mustBe true

      def operationsPending() = {
        Await.result(
          daikokuComponents.env.dataStore.operationRepo
            .forTenant(tenant)
            .find(
              Json.obj(
                "status" ->
                  Json.obj(
                    "$in" ->
                      JsArray(
                        Seq(
                          JsString(OperationStatus.Idle.name),
                          JsString(OperationStatus.InProgress.name)
                        )
                      )
                  )
              )
            ),
          5.second
        )
      }

      // await until operation is run by queuejob
      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().nonEmpty
      }
      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().isEmpty
      }

      // test if user subscriptions deleted
      val _maybeSubscription = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findById(personalSubscription.id),
        5.second
      )
      _maybeSubscription.isDefined mustBe true
      _maybeSubscription.forall(_.deleted) mustBe true

      // test if plans are deleted
      val _maybePlans = Await.result(
        daikokuComponents.env.dataStore.usagePlanRepo
          .forTenant(tenant)
          .findNotDeleted(
            Json.obj(
              "_id" -> Json
                .obj("$in" -> JsArray(defaultApi.plans.map(_.id.asJson)))
            )
          ),
        5.second
      )
      _maybePlans.nonEmpty mustBe true
      _maybePlans.size mustBe (defaultApi.plans.size - 1)

      val _maybeDocs = Await.result(
        daikokuComponents.env.dataStore.apiDocumentationPageRepo
          .forTenant(tenant)
          .findByIdNotDeleted(page.id),
        5.second
      )
      _maybeDocs.isEmpty mustBe true

      // test if api notification are cleaned
      val notifDemand = Await.result(
        daikokuComponents.env.dataStore.notificationRepo
          .forAllTenant()
          .findByIdNotDeleted(subDemandNotif.id),
        5.second
      )
      notifDemand mustBe None

      Await.result(
        daikokuComponents.env.dataStore.subscriptionDemandRepo
          .forAllTenant()
          .findById(subscriptionDemand.id),
        5.second
      ) mustBe None

      // verif oto apikey
      val respVerifOto = httpJsonCallBlocking(
        path =
          s"/apis/apim.otoroshi.io/v1/apikeys/${keyring.apiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)

      respVerifOto.status mustBe 404
    }

    "delete child api subscriptions but keep the aggregated otoroshi key with remaining authorized entity" in {
      val parentPlan = UsagePlan(
        id = UsagePlanId("parent-plan"),
        tenant = tenant.id,
        customName = "parent plan",
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
      val childPlan = UsagePlan(
        id = UsagePlanId("child-plan"),
        tenant = tenant.id,
        customName = "child plan",
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

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-api"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentPlan.id),
        defaultUsagePlan = parentPlan.id.some
      )
      val childApi = defaultApi.api.copy(
        id = ApiId("child-api"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childPlan.id),
        defaultUsagePlan = childPlan.id.some
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent-token"
      )
      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent-sub"),
        tenant = tenant.id,
        plan = parentPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = None,
        keyring = keyring.id
      )
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("child-sub"),
        tenant = tenant.id,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = user.id,
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
            ),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(userAdmin, user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = Seq(parentPlan, childPlan),
        apis = Seq(parentApi, childApi),
        subscriptions = Seq(parentSub, childSub),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${childApi.id.value}",
        method = "DELETE",
        body = Json.obj().some
      )(using tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      def operationsPending() =
        Await.result(
          daikokuComponents.env.dataStore.operationRepo
            .forTenant(tenant)
            .find(
              Json.obj(
                "status" -> Json.obj(
                  "$in" -> JsArray(
                    Seq(
                      JsString(OperationStatus.Idle.name),
                      JsString(OperationStatus.InProgress.name)
                    )
                  )
                )
              )
            ),
          5.second
        )

      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().nonEmpty
      }
      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().isEmpty
      }

      // child subscription must be marked deleted
      val maybeChildSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findById(childSub.id),
        5.second
      )
      maybeChildSub.isDefined mustBe true
      maybeChildSub.forall(_.deleted) mustBe true

      // parent subscription must still be alive
      val maybeParentSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findByIdNotDeleted(parentSub.id),
        5.second
      )
      maybeParentSub.isDefined mustBe true
      maybeParentSub.forall(_.deleted) mustBe false

      // otoroshi key must still exist with only parentRoute as authorized entity
      val respOto = httpJsonCallBlocking(
        path = s"/apis/apim.otoroshi.io/v1/apikeys/${parentApiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)

      respOto.status mustBe 200

      val authorizations = (respOto.json \ "authorizations").as[JsArray].value
      authorizations must have size 1
      (authorizations.head \ "id").as[String] mustBe parentRouteId
    }

    "delete parent api subscriptions but keep the aggregated otoroshi key with remaining authorized entity" in {
      val parentPlan = UsagePlan(
        id = UsagePlanId("parent-plan"),
        tenant = tenant.id,
        customName = "parent plan",
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
      val childPlan = UsagePlan(
        id = UsagePlanId("child-plan"),
        tenant = tenant.id,
        customName = "child plan",
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

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-api"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentPlan.id),
        defaultUsagePlan = parentPlan.id.some
      )
      val childApi = defaultApi.api.copy(
        id = ApiId("child-api"),
        name = "child API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childPlan.id),
        defaultUsagePlan = childPlan.id.some
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent-token"
      )
      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent-sub"),
        tenant = tenant.id,
        plan = parentPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = None,
        keyring = keyring.id
      )
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("child-sub"),
        tenant = tenant.id,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = user.id,
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
            ),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(userAdmin, user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = Seq(parentPlan, childPlan),
        apis = Seq(parentApi, childApi),
        subscriptions = Seq(parentSub, childSub),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${parentApi.id.value}",
        method = "DELETE",
        body = Json.obj().some
      )(using tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      def operationsPending() =
        Await.result(
          daikokuComponents.env.dataStore.operationRepo
            .forTenant(tenant)
            .find(
              Json.obj(
                "status" -> Json.obj(
                  "$in" -> JsArray(
                    Seq(
                      JsString(OperationStatus.Idle.name),
                      JsString(OperationStatus.InProgress.name)
                    )
                  )
                )
              )
            ),
          5.second
        )

      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().nonEmpty
      }
      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().isEmpty
      }

      // child subscription must be still alive
      val maybeChildSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findById(childSub.id),
        5.second
      )
      maybeChildSub.isDefined mustBe true
      maybeChildSub.forall(_.deleted) mustBe false
      // keyring model: child keeps its keyring, promotion no longer applies
      // maybeChildSub.forall(_.parent.isEmpty) mustBe true

      // parent subscription must mark as deleted
      val maybeParentSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findById(parentSub.id),
        5.second
      )
      logger.warn(s"$maybeParentSub")
      maybeParentSub.isDefined mustBe true
      maybeParentSub.forall(_.deleted) mustBe true

      // otoroshi key must still exist with only childRoute as authorized entity
      val respOto = httpJsonCallBlocking(
        path = s"/apis/apim.otoroshi.io/v1/apikeys/${parentApiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)

      respOto.status mustBe 200

      val authorizations = (respOto.json \ "authorizations").as[JsArray].value
      authorizations must have size 1
      (authorizations.head \ "id").as[String] mustBe childRouteId
    }

    "delete parent api subscriptions and elect a new parent among multiple children" in {
      val parentPlan = UsagePlan(
        id = UsagePlanId("parent-plan"),
        tenant = tenant.id,
        customName = "parent plan",
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
      val childPlan1 = UsagePlan(
        id = UsagePlanId("child-plan-1"),
        tenant = tenant.id,
        customName = "child plan 1",
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
      val childPlan2 = UsagePlan(
        id = UsagePlanId("child-plan-2"),
        tenant = tenant.id,
        customName = "child plan 2",
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(routes = Set(OtoroshiRouteId(otherRouteId)))
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
        id = ApiId("parent-api"),
        name = "parent API",
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentPlan.id),
        defaultUsagePlan = parentPlan.id.some
      )
      val childApi1 = defaultApi.api.copy(
        id = ApiId("child-api-1"),
        name = "child API 1",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childPlan1.id),
        defaultUsagePlan = childPlan1.id.some
      )
      val childApi2 = defaultApi.api.copy(
        id = ApiId("child-api-2"),
        name = "child API 2",
        team = teamOwnerId,
        possibleUsagePlans = Seq(childPlan2.id),
        defaultUsagePlan = childPlan2.id.some
      )

      // shared aggregated apikey — seeded in Otoroshi with 3 authorized entities: parentRoute + childRoute + otherRoute
      val sharedApiKey = parentApiKeyWith2childs

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = sharedApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent-token"
      )
      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent-sub"),
        tenant = tenant.id,
        plan = parentPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = None,
        keyring = keyring.id
      )
      val childSub1 = ApiSubscription(
        id = ApiSubscriptionId("child-sub-1"),
        tenant = tenant.id,
        plan = childPlan1.id,
        createdAt = DateTime.now().minusSeconds(10),
        team = teamConsumerId,
        api = childApi1.id,
        by = user.id,
        customName = None,
        keyring = keyring.id
      )
      val childSub2 = ApiSubscription(
        id = ApiSubscriptionId("child-sub-2"),
        tenant = tenant.id,
        plan = childPlan2.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi2.id,
        by = user.id,
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
            ),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(userAdmin, user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = Seq(parentPlan, childPlan1, childPlan2),
        apis = Seq(parentApi, childApi1, childApi2),
        subscriptions = Seq(parentSub, childSub1, childSub2),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${parentApi.id.value}",
        method = "DELETE",
        body = Json.obj().some
      )(using tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      def operationsPending() =
        Await.result(
          daikokuComponents.env.dataStore.operationRepo
            .forTenant(tenant)
            .find(
              Json.obj(
                "status" -> Json.obj(
                  "$in" -> JsArray(
                    Seq(
                      JsString(OperationStatus.Idle.name),
                      JsString(OperationStatus.InProgress.name)
                    )
                  )
                )
              )
            ),
          5.second
        )

      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().nonEmpty
      }
      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().isEmpty
      }

      // parent subscription must be deleted
      val maybeParentSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findById(parentSub.id),
        5.second
      )
      maybeParentSub.isDefined mustBe true
      maybeParentSub.forall(_.deleted) mustBe true

      // childSub1 (oldest) must be elected as new parent: alive, no parent field
      val maybeChildSub1 = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findByIdNotDeleted(childSub1.id),
        5.second
      )
      maybeChildSub1.isDefined mustBe true
      // keyring model: promotion no longer applies
      // maybeChildSub1.forall(_.parent.isEmpty) mustBe true

      // childSub2 must be alive and its parent must now point to childSub1
      val maybeChildSub2 = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findByIdNotDeleted(childSub2.id),
        5.second
      )
      maybeChildSub2.isDefined mustBe true
      // keyring model: members of a keyring keep their keyring, no re-parenting
      // maybeChildSub2.forall(_.parent.contains(childSub1.id)) mustBe true

      // otoroshi key must still exist with childRoute + otherRoute (2 authorized entities)
      val respOto = httpJsonCallBlocking(
        path = s"/apis/apim.otoroshi.io/v1/apikeys/${sharedApiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)

      logger.json(respOto.json, pretty = true)
      respOto.status mustBe 200

      val authorizationIds = (respOto.json \ "authorizations")
        .as[JsArray]
        .value
        .map(a => (a \ "id").as[String])
        .toSet
      authorizationIds must have size 2
      authorizationIds must contain(childRouteId)
      authorizationIds must contain(otherRouteId)
    }

    "delete child plan subscription but keep the aggregated otoroshi key with remaining authorized entity" in {
      val parentPlan = UsagePlan(
        id = UsagePlanId("parent-plan"),
        tenant = tenant.id,
        customName = "parent plan",
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
      val childPlan = UsagePlan(
        id = UsagePlanId("child-plan"),
        tenant = tenant.id,
        customName = "child plan",
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

      val api = defaultApi.api.copy(
        id = ApiId("test-api"),
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentPlan.id, childPlan.id),
        defaultUsagePlan = parentPlan.id.some
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent-token"
      )
      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent-sub"),
        tenant = tenant.id,
        plan = parentPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = user.id,
        customName = None,
        keyring = keyring.id
      )
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("child-sub"),
        tenant = tenant.id,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = user.id,
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
            ),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(userAdmin, user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = Seq(parentPlan, childPlan),
        apis = Seq(api),
        subscriptions = Seq(parentSub, childSub),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${api.id.value}/${api.currentVersion.value}/plan/${childPlan.id.value}",
        method = "DELETE",
        body = Json.obj().some
      )(using tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      def operationsPending() =
        Await.result(
          daikokuComponents.env.dataStore.operationRepo
            .forTenant(tenant)
            .find(
              Json.obj(
                "status" -> Json.obj(
                  "$in" -> JsArray(
                    Seq(
                      JsString(OperationStatus.Idle.name),
                      JsString(OperationStatus.InProgress.name)
                    )
                  )
                )
              )
            ),
          5.second
        )

      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().nonEmpty
      }
      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().isEmpty
      }

      // child sub must be deleted
      val maybeChildSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findById(childSub.id),
        5.second
      )
      maybeChildSub.isDefined mustBe true
      maybeChildSub.forall(_.deleted) mustBe true

      // parent sub must still be alive
      val maybeParentSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findByIdNotDeleted(parentSub.id),
        5.second
      )
      maybeParentSub.isDefined mustBe true

      // otoroshi key still exists with only parentRoute
      val respOto = httpJsonCallBlocking(
        path = s"/apis/apim.otoroshi.io/v1/apikeys/${parentApiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)
      respOto.status mustBe 200
      val authorizations = (respOto.json \ "authorizations").as[JsArray].value
      authorizations must have size 1
      (authorizations.head \ "id").as[String] mustBe parentRouteId
    }

    "delete parent plan subscription and promote the child to standalone" in {
      val parentPlan = UsagePlan(
        id = UsagePlanId("parent-plan"),
        tenant = tenant.id,
        customName = "parent plan",
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
      val childPlan = UsagePlan(
        id = UsagePlanId("child-plan"),
        tenant = tenant.id,
        customName = "child plan",
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

      val api = defaultApi.api.copy(
        id = ApiId("test-api"),
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentPlan.id, childPlan.id),
        defaultUsagePlan = parentPlan.id.some
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent-token"
      )
      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent-sub"),
        tenant = tenant.id,
        plan = parentPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = user.id,
        customName = None,
        keyring = keyring.id
      )
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("child-sub"),
        tenant = tenant.id,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = user.id,
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
            ),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(userAdmin, user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = Seq(parentPlan, childPlan),
        apis = Seq(api),
        subscriptions = Seq(parentSub, childSub),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${api.id.value}/${api.currentVersion.value}/plan/${parentPlan.id.value}",
        method = "DELETE",
        body = Json.obj().some
      )(using tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      def operationsPending() =
        Await.result(
          daikokuComponents.env.dataStore.operationRepo
            .forTenant(tenant)
            .find(
              Json.obj(
                "status" -> Json.obj(
                  "$in" -> JsArray(
                    Seq(
                      JsString(OperationStatus.Idle.name),
                      JsString(OperationStatus.InProgress.name)
                    )
                  )
                )
              )
            ),
          5.second
        )

      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().nonEmpty
      }
      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().isEmpty
      }

      // parent sub must be deleted
      val maybeParentSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findById(parentSub.id),
        5.second
      )
      maybeParentSub.isDefined mustBe true
      maybeParentSub.forall(_.deleted) mustBe true

      // child sub must be alive and promoted to standalone (no parent)
      val maybeChildSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findByIdNotDeleted(childSub.id),
        5.second
      )
      maybeChildSub.isDefined mustBe true
      // keyring model: child keeps its keyring, promotion no longer applies
      // maybeChildSub.forall(_.parent.isEmpty) mustBe true

      // otoroshi key still exists with only childRoute
      val respOto = httpJsonCallBlocking(
        path = s"/apis/apim.otoroshi.io/v1/apikeys/${parentApiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)
      respOto.status mustBe 200
      val authorizations = (respOto.json \ "authorizations").as[JsArray].value
      authorizations must have size 1
      (authorizations.head \ "id").as[String] mustBe childRouteId
    }

    "delete team with parent subscription and promote the child to standalone" in {
      val parentPlan = UsagePlan(
        id = UsagePlanId("parent-plan"),
        tenant = tenant.id,
        customName = "parent plan",
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
      val childPlan = UsagePlan(
        id = UsagePlanId("child-plan"),
        tenant = tenant.id,
        customName = "child plan",
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

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-api"),
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentPlan.id),
        defaultUsagePlan = parentPlan.id.some
      )
      val childApi = defaultApi.api.copy(
        id = ApiId("child-api"),
        team = teamConsumerId,
        possibleUsagePlans = Seq(childPlan.id),
        defaultUsagePlan = childPlan.id.some
      )

      // teamConsumer owns parentSub — this team will be deleted
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent-token"
      )
      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent-sub"),
        tenant = tenant.id,
        plan = parentPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = None,
        keyring = keyring.id
      )
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("child-sub"),
        tenant = tenant.id,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumer.id,
        api = childApi.id,
        by = user.id,
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
            ),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(userAdmin, user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = Seq(parentPlan, childPlan),
        apis = Seq(parentApi, childApi),
        subscriptions = Seq(parentSub, childSub),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}",
        method = "DELETE",
        body = Json.obj().some
      )(using tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      def operationsPending() =
        Await.result(
          daikokuComponents.env.dataStore.operationRepo
            .forTenant(tenant)
            .find(
              Json.obj(
                "status" -> Json.obj(
                  "$in" -> JsArray(
                    Seq(
                      JsString(OperationStatus.Idle.name),
                      JsString(OperationStatus.InProgress.name)
                    )
                  )
                )
              )
            ),
          5.second
        )

      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().nonEmpty
      }
      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().isEmpty
      }

      // parent sub must be deleted
      val maybeParentSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findById(parentSub.id),
        5.second
      )
      maybeParentSub.isDefined mustBe true
      maybeParentSub.forall(_.deleted) mustBe true

      // child sub must be alive and promoted to standalone (no parent)
      val maybeChildSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findByIdNotDeleted(childSub.id),
        5.second
      )
      maybeChildSub.isDefined mustBe true
      // keyring model: child keeps its keyring, promotion no longer applies
      // maybeChildSub.forall(_.parent.isEmpty) mustBe true

      // otoroshi key still exists with only childRoute
      val respOto = httpJsonCallBlocking(
        path = s"/apis/apim.otoroshi.io/v1/apikeys/${parentApiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)
      respOto.status mustBe 200
      val authorizations = (respOto.json \ "authorizations").as[JsArray].value
      authorizations must have size 1
      (authorizations.head \ "id").as[String] mustBe childRouteId
    }

    "delete user with parent subscription and promote the child to standalone" in {
      // user's personal team owns parentAPI & parentPlan — deleting user will delete this team, API and subs
      val userPersonalTeam = Team(
        id = TeamId(s"${user.humanReadableId}-team"),
        tenant = tenant.id,
        `type` = TeamType.Personal,
        name = "user personal team",
        description = "",
        contact = user.email,
        users = Set(UserWithPermission(user.id, TeamPermission.Administrator))
      )

      val parentPlan = UsagePlan(
        id = UsagePlanId("parent-plan"),
        tenant = tenant.id,
        customName = "parent plan",
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
      val childPlan = UsagePlan(
        id = UsagePlanId("child-plan"),
        tenant = tenant.id,
        customName = "child plan",
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

      val parentApi = defaultApi.api.copy(
        id = ApiId("parent-api"),
        team = userPersonalTeam.id,
        possibleUsagePlans = Seq(parentPlan.id),
        defaultUsagePlan = parentPlan.id.some
      )
      val childApi = defaultApi.api.copy(
        id = ApiId("child-api"),
        team = teamOwnerId,
        possibleUsagePlans = Seq(childPlan.id),
        defaultUsagePlan = childPlan.id.some
      )

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "parent-token"
      )
      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("parent-sub"),
        tenant = tenant.id,
        plan = parentPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = parentApi.id,
        by = user.id,
        customName = None,
        keyring = keyring.id
      )
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("child-sub"),
        tenant = tenant.id,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = childApi.id,
        by = userAdmin.id,
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
            ),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(daikokuAdmin, userAdmin, user),
        teams = Seq(teamOwner, teamConsumer, userPersonalTeam),
        usagePlans = Seq(parentPlan, childPlan),
        apis = Seq(parentApi, childApi),
        subscriptions = Seq(parentSub, childSub),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/admin/users/${user.id.value}",
        method = "DELETE"
      )(using tenant, session)
      resp.status mustBe 200

      def operationsPending() =
        Await.result(
          daikokuComponents.env.dataStore.operationRepo
            .forTenant(tenant)
            .find(
              Json.obj(
                "status" -> Json.obj(
                  "$in" -> JsArray(
                    Seq(
                      JsString(OperationStatus.Idle.name),
                      JsString(OperationStatus.InProgress.name)
                    )
                  )
                )
              )
            ),
          5.second
        )

      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().nonEmpty
      }
      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().isEmpty
      }

      // parent sub must be deleted
      val maybeParentSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findById(parentSub.id),
        5.second
      )
      maybeParentSub.isDefined mustBe true
      maybeParentSub.forall(_.deleted) mustBe true

      // child sub must be alive and promoted to standalone (no parent)
      val maybeChildSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findByIdNotDeleted(childSub.id),
        5.second
      )
      maybeChildSub.isDefined mustBe true
      // keyring model: child keeps its keyring, promotion no longer applies
      // maybeChildSub.forall(_.parent.isEmpty) mustBe true

      // otoroshi key still exists with only childRoute
      val respOto = httpJsonCallBlocking(
        path = s"/apis/apim.otoroshi.io/v1/apikeys/${parentApiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)
      respOto.status mustBe 200
      val authorizations = (respOto.json \ "authorizations").as[JsArray].value
      authorizations must have size 1
      (authorizations.head \ "id").as[String] mustBe childRouteId
    }

    "delete team consumer subscriptions when the team is deleted" in {
      val plan = defaultApi.plans.head

      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "consumer-token"
      )
      val consumerSub = ApiSubscription(
        id = ApiSubscriptionId("consumer-sub"),
        tenant = tenant.id,
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = user.id,
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
        users = Seq(userAdmin, user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = Seq(
          plan.copy(otoroshiTarget =
            Some(
              OtoroshiTarget(
                containerizedOtoroshi,
                Some(
                  AuthorizedEntities(routes =
                    Set(OtoroshiRouteId(parentRouteId))
                  )
                )
              )
            )
          )
        ),
        apis = Seq(defaultApi.api),
        subscriptions = Seq(consumerSub),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}",
        method = "DELETE",
        body = Json.obj().some
      )(using tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      def operationsPending() =
        Await.result(
          daikokuComponents.env.dataStore.operationRepo
            .forTenant(tenant)
            .find(
              Json.obj(
                "status" -> Json.obj(
                  "$in" -> JsArray(
                    Seq(
                      JsString(OperationStatus.Idle.name),
                      JsString(OperationStatus.InProgress.name)
                    )
                  )
                )
              )
            ),
          5.second
        )

      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().nonEmpty
      }
      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().isEmpty
      }

      // consumer subscription must be deleted
      val maybeSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findById(consumerSub.id),
        5.second
      )
      maybeSub.isDefined mustBe true
      maybeSub.forall(_.deleted) mustBe true

      // otoroshi key must be deleted
      val respOto = httpJsonCallBlocking(
        path = s"/apis/apim.otoroshi.io/v1/apikeys/${parentApiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)
      respOto.status mustBe 404
    }

    "delete a standalone subscription deletes the otoroshi key" in {
      val plan = UsagePlan(
        id = UsagePlanId("standalone-plan"),
        tenant = tenant.id,
        customName = "standalone plan",
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
        id = ApiId("standalone-api"),
        team = teamOwnerId,
        possibleUsagePlans = Seq(plan.id),
        defaultUsagePlan = plan.id.some
      )
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "standalone-token"
      )
      val sub = ApiSubscription(
        id = ApiSubscriptionId("standalone-sub"),
        tenant = tenant.id,
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = user.id,
        customName = None,
        keyring = keyring.id
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(otoroshiSettings =
            Set(
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
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = Seq(plan),
        apis = Seq(api),
        subscriptions = Seq(sub),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/subscriptions/${sub.id.value}",
        method = "DELETE"
      )(using tenant, session)
      resp.status mustBe 200

      // subscription must be marked deleted
      val maybeSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findById(sub.id),
        5.second
      )
      maybeSub.isDefined mustBe true
      maybeSub.forall(_.deleted) mustBe true

      // otoroshi key must be deleted
      val respOto = httpJsonCallBlocking(
        path = s"/apis/apim.otoroshi.io/v1/apikeys/${parentApiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)
      respOto.status mustBe 404
    }

    "delete a parent subscription with default promote keeps the otoroshi key with child route only" in {
      val parentPlan = UsagePlan(
        id = UsagePlanId("promote-parent-plan"),
        tenant = tenant.id,
        customName = "parent plan",
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
      val childPlan = UsagePlan(
        id = UsagePlanId("promote-child-plan"),
        tenant = tenant.id,
        customName = "child plan",
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
      val api = defaultApi.api.copy(
        id = ApiId("promote-api"),
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentPlan.id, childPlan.id),
        defaultUsagePlan = parentPlan.id.some
      )
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "promote-parent-token"
      )
      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("promote-parent-sub"),
        tenant = tenant.id,
        plan = parentPlan.id,
        createdAt = DateTime.now().minusHours(2),
        team = teamConsumerId,
        api = api.id,
        by = user.id,
        customName = None,
        keyring = keyring.id
      )
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("promote-child-sub"),
        tenant = tenant.id,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = user.id,
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
            ),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(userAdmin, user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = Seq(parentPlan, childPlan),
        apis = Seq(api),
        subscriptions = Seq(parentSub, childSub),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      // no action param = default promote
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/subscriptions/${parentSub.id.value}",
        method = "DELETE"
      )(using tenant, session)
      resp.status mustBe 200

      // parent sub must be deleted
      val maybeParentSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findById(parentSub.id),
        5.second
      )
      maybeParentSub.isDefined mustBe true
      maybeParentSub.forall(_.deleted) mustBe true

      // child sub must be promoted (parent field removed)
      val maybeChildSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findByIdNotDeleted(childSub.id),
        5.second
      )
      maybeChildSub.isDefined mustBe true
      // keyring model: parent field no longer exists
      // maybeChildSub.flatMap(_.parent) mustBe None

      // otoroshi key must still exist with only child route
      val respOto = httpJsonCallBlocking(
        path = s"/apis/apim.otoroshi.io/v1/apikeys/${parentApiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)
      respOto.status mustBe 200
      val authorizations = (respOto.json \ "authorizations").as[JsArray].value
      authorizations must have size 1
      (authorizations.head \ "id").as[String] mustBe childRouteId
    }

    "delete a parent subscription with action=delete removes all children and the otoroshi key" in {
      val parentPlan = UsagePlan(
        id = UsagePlanId("del-all-parent-plan"),
        tenant = tenant.id,
        customName = "parent plan",
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
      val childPlan = UsagePlan(
        id = UsagePlanId("del-all-child-plan"),
        tenant = tenant.id,
        customName = "child plan",
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
      val api = defaultApi.api.copy(
        id = ApiId("del-all-api"),
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentPlan.id, childPlan.id),
        defaultUsagePlan = parentPlan.id.some
      )
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "del-all-parent-token"
      )
      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("del-all-parent-sub"),
        tenant = tenant.id,
        plan = parentPlan.id,
        createdAt = DateTime.now().minusHours(2),
        team = teamConsumerId,
        api = api.id,
        by = user.id,
        customName = None,
        keyring = keyring.id
      )
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("del-all-child-sub"),
        tenant = tenant.id,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = user.id,
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
            ),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(userAdmin, user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = Seq(parentPlan, childPlan),
        apis = Seq(api),
        subscriptions = Seq(parentSub, childSub),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/subscriptions/${parentSub.id.value}?action=delete",
        method = "DELETE"
      )(using tenant, session)
      resp.status mustBe 200

      // both subscriptions must be deleted
      val maybeParentSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findById(parentSub.id),
        5.second
      )
      maybeParentSub.forall(_.deleted) mustBe true

      val maybeChildSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findById(childSub.id),
        5.second
      )
      maybeChildSub.forall(_.deleted) mustBe true

      // otoroshi key must be deleted
      val respOto = httpJsonCallBlocking(
        path = s"/apis/apim.otoroshi.io/v1/apikeys/${parentApiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)
      respOto.status mustBe 404
    }

    "delete a child subscription keeps the otoroshi key with parent route only" in {
      val parentPlan = UsagePlan(
        id = UsagePlanId("child-del-parent-plan"),
        tenant = tenant.id,
        customName = "parent plan",
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
      val childPlan = UsagePlan(
        id = UsagePlanId("child-del-child-plan"),
        tenant = tenant.id,
        customName = "child plan",
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
      val api = defaultApi.api.copy(
        id = ApiId("child-del-api"),
        team = teamOwnerId,
        possibleUsagePlans = Seq(parentPlan.id, childPlan.id),
        defaultUsagePlan = parentPlan.id.some
      )
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "child-del-parent-token"
      )
      val parentSub = ApiSubscription(
        id = ApiSubscriptionId("child-del-parent-sub"),
        tenant = tenant.id,
        plan = parentPlan.id,
        createdAt = DateTime.now().minusHours(2),
        team = teamConsumerId,
        api = api.id,
        by = user.id,
        customName = None,
        keyring = keyring.id
      )
      val childSub = ApiSubscription(
        id = ApiSubscriptionId("child-del-child-sub"),
        tenant = tenant.id,
        plan = childPlan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = user.id,
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
            ),
            aggregationApiKeysSecurity = Some(true)
          )
        ),
        users = Seq(userAdmin, user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = Seq(parentPlan, childPlan),
        apis = Seq(api),
        subscriptions = Seq(parentSub, childSub),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/subscriptions/${childSub.id.value}",
        method = "DELETE"
      )(using tenant, session)
      resp.status mustBe 200

      // child sub must be deleted
      val maybeChildSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findById(childSub.id),
        5.second
      )
      maybeChildSub.forall(_.deleted) mustBe true

      // parent sub must still be alive
      val maybeParentSub = Await.result(
        daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findByIdNotDeleted(parentSub.id),
        5.second
      )
      maybeParentSub.isDefined mustBe true

      // otoroshi key must still exist with only the parent route
      val respOto = httpJsonCallBlocking(
        path = s"/apis/apim.otoroshi.io/v1/apikeys/${parentApiKey.clientId}",
        baseUrl = "http://otoroshi-api.oto.tools",
        headers = Map(
          "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
          "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
          "Host" -> "otoroshi-api.oto.tools"
        ),
        port = container.mappedPort(8080)
      )(using tenant, session)
      respOto.status mustBe 200
      val authorizations = (respOto.json \ "authorizations").as[JsArray].value
      authorizations must have size 1
      (authorizations.head \ "id").as[String] mustBe parentRouteId
    }

    // -----------------------------------------------------------------------
    // Notification cleanup tests
    // Each block sets up all 25 notification types, performs one deletion
    // action and asserts which notifications survive vs are removed.
    // Sender = userAdmin for all notifs (avoid wiping everything on user deletion).
    // -----------------------------------------------------------------------

    "clean up action.subscription notifications when a subscription is deleted" in {
      val plan = defaultApi.plans.head.copy(
        otoroshiTarget = Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(routes = Set(OtoroshiRouteId(parentRouteId)))
            )
          )
        )
      )
      val api = defaultApi.api.copy(
        possibleUsagePlans = Seq(plan.id),
        defaultUsagePlan = plan.id.some
      )
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "notif-token"
      )
      val sub = ApiSubscription(
        id = ApiSubscriptionId("notif-sub"),
        tenant = tenant.id,
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = user.id,
        customName = None,
        keyring = keyring.id
      )
      val demandId = DemandId("notif-demand")
      val stepId = SubscriptionDemandStepId("notif-step")

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(otoroshiSettings =
            Set(
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
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = Seq(plan),
        apis = Seq(api),
        subscriptions = Seq(sub),
        keyrings = Seq(keyring),
        notifications = makeAllNotifs(api, plan, sub, keyring, demandId, stepId)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/subscriptions/${sub.id.value}",
        method = "DELETE"
      )(using tenant, session)
      resp.status mustBe 200

      val remaining = Await
        .result(
          daikokuComponents.env.dataStore.notificationRepo
            .forTenant(tenant)
            .findNotDeleted(Json.obj()),
          5.second
        )
        .map(_.id.value)
        .toSet

      // deleted — action.subscription = sub.id
      remaining must not contain "n-sub-transfer-success"
      remaining must not contain "n-key-deletion-v2"
      remaining must not contain "n-key-rotation-in-progress-v2"
      remaining must not contain "n-key-rotation-ended-v2"
      remaining must not contain "n-key-refresh-v2"

      // survived — no subscription field, or subscription is a full object (not an id)
      remaining must contain("n-api-access")
      remaining must contain("n-team-invitation")
      remaining must contain("n-sub-accept")
      remaining must contain("n-sub-reject")
      remaining must contain("n-sub-demand")
      remaining must contain("n-account-creation")
      remaining must contain("n-oto-sync-sub-error")
      remaining must contain("n-oto-sync-api-error")
      remaining must contain("n-new-post")
      remaining must contain("n-new-issue")
      remaining must contain("n-new-comment")
      remaining must contain("n-new-post-v2")
      remaining must contain("n-new-issue-v2")
      remaining must contain("n-new-comment-v2")
      remaining must contain("n-transfer-ownership")
      remaining must contain("n-checkout")
    }

    "clean up action.subscription and action.plan notifications when a plan is deleted" in {
      val plan = defaultApi.plans.head.copy(otoroshiTarget =
        Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(routes = Set(OtoroshiRouteId(parentRouteId)))
            )
          )
        )
      )
      val api = defaultApi.api.copy(
        possibleUsagePlans = Seq(plan.id),
        defaultUsagePlan = plan.id.some
      )
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "notif-token"
      )
      val sub = ApiSubscription(
        id = ApiSubscriptionId("notif-sub"),
        tenant = tenant.id,
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = user.id,
        customName = None,
        keyring = keyring.id
      )
      val demandId = DemandId("notif-demand")
      val stepId = SubscriptionDemandStepId("notif-step")

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(otoroshiSettings =
            Set(
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
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = Seq(plan),
        apis = Seq(api),
        subscriptions = Seq(sub),
        keyrings = Seq(keyring),
        notifications = makeAllNotifs(api, plan, sub, keyring, demandId, stepId)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${api.id.value}/${api.currentVersion.value}/plan/${plan.id.value}",
        method = "DELETE",
        body = Json.obj().some
      )(using tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      def operationsPending() = Await.result(
        daikokuComponents.env.dataStore.operationRepo
          .forTenant(tenant)
          .find(
            Json.obj(
              "status" -> Json.obj(
                "$in" -> JsArray(
                  Seq(
                    JsString(OperationStatus.Idle.name),
                    JsString(OperationStatus.InProgress.name)
                  )
                )
              )
            )
          ),
        5.second
      )

      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().nonEmpty
      }
      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().isEmpty
      }

      val remaining = Await
        .result(
          daikokuComponents.env.dataStore.notificationRepo
            .forTenant(tenant)
            .findNotDeleted(Json.obj()),
          5.second
        )
        .map(_.id.value)
        .toSet

      // deleted — action.subscription = sub.id
      remaining must not contain "n-sub-transfer-success"
      remaining must not contain "n-key-deletion-v2"
      remaining must not contain "n-key-rotation-in-progress-v2"
      remaining must not contain "n-key-rotation-ended-v2"
      remaining must not contain "n-key-refresh-v2"
      // deleted — action.plan = plan.id
      remaining must not contain "n-sub-accept"
      remaining must not contain "n-sub-reject"
      remaining must not contain "n-sub-demand"
      remaining must not contain "n-checkout"

      // survived
      remaining must contain("n-api-access")
      remaining must contain("n-team-invitation")
      remaining must contain("n-account-creation")
      remaining must contain("n-oto-sync-sub-error")
      remaining must contain("n-oto-sync-api-error")
      remaining must contain("n-new-post")
      remaining must contain("n-new-issue")
      remaining must contain("n-new-comment")
      remaining must contain("n-new-post-v2")
      remaining must contain("n-new-issue-v2")
      remaining must contain("n-new-comment-v2")
      remaining must contain("n-transfer-ownership")
    }

    "clean up action.api and action.subscription notifications when an api is deleted" in {
      val plan = defaultApi.plans.head.copy(otoroshiTarget =
        Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(routes = Set(OtoroshiRouteId(parentRouteId)))
            )
          )
        )
      )
      val api = defaultApi.api.copy(
        possibleUsagePlans = Seq(plan.id),
        defaultUsagePlan = plan.id.some
      )
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "notif-token"
      )
      val sub = ApiSubscription(
        id = ApiSubscriptionId("notif-sub"),
        tenant = tenant.id,
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = user.id,
        customName = None,
        keyring = keyring.id
      )
      val demandId = DemandId("notif-demand")
      val stepId = SubscriptionDemandStepId("notif-step")

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(otoroshiSettings =
            Set(
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
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = Seq(plan),
        apis = Seq(api),
        subscriptions = Seq(sub),
        keyrings = Seq(keyring),
        notifications = makeAllNotifs(api, plan, sub, keyring, demandId, stepId)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/${api.id.value}",
        method = "DELETE",
        body = Json.obj().some
      )(using tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      def operationsPending() = Await.result(
        daikokuComponents.env.dataStore.operationRepo
          .forTenant(tenant)
          .find(
            Json.obj(
              "status" -> Json.obj(
                "$in" -> JsArray(
                  Seq(
                    JsString(OperationStatus.Idle.name),
                    JsString(OperationStatus.InProgress.name)
                  )
                )
              )
            )
          ),
        5.second
      )

      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().nonEmpty
      }
      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().isEmpty
      }

      val remaining = Await
        .result(
          daikokuComponents.env.dataStore.notificationRepo
            .forTenant(tenant)
            .findNotDeleted(Json.obj()),
          5.second
        )
        .map(_.id.value)
        .toSet

      // deleted — action.subscription = sub.id
      remaining must not contain "n-sub-transfer-success"
      // deleted — action.api = api.id (V2 types + typed actions)
      remaining must not contain "n-api-access"
      remaining must not contain "n-sub-accept"
      remaining must not contain "n-sub-reject"
      remaining must not contain "n-sub-demand"
      remaining must not contain "n-key-deletion-v2"
      remaining must not contain "n-key-rotation-in-progress-v2"
      remaining must not contain "n-key-rotation-ended-v2"
      remaining must not contain "n-key-refresh-v2"
      remaining must not contain "n-new-post-v2"
      remaining must not contain "n-new-issue-v2"
      remaining must not contain "n-new-comment-v2"
      remaining must not contain "n-transfer-ownership"
      remaining must not contain "n-checkout"
      remaining must not contain "n-new-post"
      remaining must not contain "n-new-issue"
      remaining must not contain "n-new-comment"

      // survived — legacy types whose api field is not an id, or no api field
      remaining must contain("n-team-invitation")
      remaining must contain("n-account-creation")
      remaining must contain("n-oto-sync-sub-error")
      remaining must contain("n-oto-sync-api-error")
    }

    "clean up api, subscription and team notifications when a team is deleted" in {
      val plan = defaultApi.plans.head.copy(otoroshiTarget =
        Some(
          OtoroshiTarget(
            containerizedOtoroshi,
            Some(
              AuthorizedEntities(routes = Set(OtoroshiRouteId(parentRouteId)))
            )
          )
        )
      )
      val api = defaultApi.api.copy(
        possibleUsagePlans = Seq(plan.id),
        defaultUsagePlan = plan.id.some
      )
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "notif-token"
      )
      val sub = ApiSubscription(
        id = ApiSubscriptionId("notif-sub"),
        tenant = tenant.id,
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = user.id,
        customName = None,
        keyring = keyring.id
      )
      val demandId = DemandId("notif-demand")
      val stepId = SubscriptionDemandStepId("notif-step")

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(otoroshiSettings =
            Set(
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
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = Seq(plan),
        apis = Seq(api),
        subscriptions = Seq(sub),
        keyrings = Seq(keyring),
        notifications = makeAllNotifs(api, plan, sub, keyring, demandId, stepId)
      )

      // delete teamOwner (owns the API) — cascades into sub + api deletion
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}",
        method = "DELETE",
        body = Json.obj().some
      )(using tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      def operationsPending() = Await.result(
        daikokuComponents.env.dataStore.operationRepo
          .forTenant(tenant)
          .find(
            Json.obj(
              "status" -> Json.obj(
                "$in" -> JsArray(
                  Seq(
                    JsString(OperationStatus.Idle.name),
                    JsString(OperationStatus.InProgress.name)
                  )
                )
              )
            )
          ),
        5.second
      )

      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().nonEmpty
      }
      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().isEmpty
      }

      val remaining = Await
        .result(
          daikokuComponents.env.dataStore.notificationRepo
            .forTenant(tenant)
            .findNotDeleted(Json.obj()),
          5.second
        )
        .map(_.id.value)
        .toSet

      // deleted — via deleteSubscriptions (action.subscription)
      remaining must not contain "n-sub-transfer-success"
      remaining must not contain "n-key-deletion-v2"
      remaining must not contain "n-key-rotation-in-progress-v2"
      remaining must not contain "n-key-rotation-ended-v2"
      remaining must not contain "n-key-refresh-v2"
      // deleted — via deleteTeamNotifications (type filter + action.team = teamOwnerId)
      remaining must not contain "n-team-invitation" // TeamInvitation + team=teamOwnerId
      remaining must not contain "n-transfer-ownership" // TransferApiOwnership + team=teamOwnerId
      // deleted — via deleteApiNotifications (action.api = api.id)
      remaining must not contain "n-api-access"
      remaining must not contain "n-sub-accept"
      remaining must not contain "n-sub-reject"
      remaining must not contain "n-sub-demand"
      remaining must not contain "n-new-post-v2"
      remaining must not contain "n-new-issue-v2"
      remaining must not contain "n-new-comment-v2"
      remaining must not contain "n-checkout"
      remaining must not contain "n-new-post"
      remaining must not contain "n-new-issue"
      remaining must not contain "n-new-comment"

      // survived
      remaining must contain("n-account-creation")
      remaining must contain("n-oto-sync-sub-error")
      remaining must contain("n-oto-sync-api-error")
    }

    "clean up user-related notifications when a user is deleted" in {
      val plan = defaultApi.plans.head
      val api = defaultApi.api.copy(
        possibleUsagePlans = Seq(plan.id),
        defaultUsagePlan = plan.id.some
      )
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "notif-token"
      )
      val sub = ApiSubscription(
        id = ApiSubscriptionId("notif-sub"),
        tenant = tenant.id,
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = user.id,
        customName = None,
        keyring = keyring.id
      )
      val demandId = DemandId("notif-demand")
      val stepId = SubscriptionDemandStepId("notif-step")
      val userPersonalTeam = Team(
        id = TeamId("user-personal-notif"),
        tenant = tenant.id,
        `type` = TeamType.Personal,
        name = "user personal",
        description = "",
        contact = user.email,
        users = Set(UserWithPermission(user.id, Administrator))
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user),
        teams = Seq(teamOwner, teamConsumer, userPersonalTeam),
        usagePlans = Seq(plan),
        apis = Seq(api),
        subscriptions = Seq(sub),
        keyrings = Seq(keyring),
        notifications = makeAllNotifs(api, plan, sub, keyring, demandId, stepId)
      )

      // user deletes themselves — DeletionService.deleteUserNotifications removes
      // notifs where sender.id = user.id OR action.user = user.id.
      // Since sender = userAdmin for all notifs, only action.user = user.id matches.
      val userSession = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(path = "/api/me", method = "DELETE")(using
        tenant,
        userSession
      )
      resp.status mustBe 200

      def operationsPending() = Await.result(
        daikokuComponents.env.dataStore.operationRepo
          .forTenant(tenant)
          .find(
            Json.obj(
              "status" -> Json.obj(
                "$in" -> JsArray(
                  Seq(
                    JsString(OperationStatus.Idle.name),
                    JsString(OperationStatus.InProgress.name)
                  )
                )
              )
            )
          ),
        5.second
      )

      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().nonEmpty
      }
      org.awaitility.Awaitility.await.atMost(10.seconds.toJava) until { () =>
        operationsPending().isEmpty
      }

      val remaining = Await
        .result(
          daikokuComponents.env.dataStore.notificationRepo
            .forTenant(tenant)
            .findNotDeleted(Json.obj()),
          5.second
        )
        .map(_.id.value)
        .toSet

      // deleted — action.user = user.id
      remaining must not contain "n-team-invitation" // TeamInvitation(_, user.id)
      remaining must not contain "n-new-comment-v2" // NewCommentOnIssueV2(_, _, user.id)

      // survived — all 23 others
      remaining must contain("n-api-access")
      remaining must contain("n-sub-accept")
      remaining must contain("n-sub-reject")
      remaining must contain("n-sub-demand") // todo: if user maiddemand ?
      remaining must contain("n-account-creation")
      remaining must contain("n-sub-transfer-success")
      remaining must contain("n-oto-sync-sub-error")
      remaining must contain("n-oto-sync-api-error")
      remaining must contain("n-key-deletion")
      remaining must contain("n-key-rotation-in-progress")
      remaining must contain("n-key-rotation-ended")
      remaining must contain("n-key-refresh")
      remaining must contain("n-new-post")
      remaining must contain("n-new-issue")
      remaining must contain("n-new-comment")
      remaining must contain("n-key-deletion-v2")
      remaining must contain("n-key-rotation-in-progress-v2")
      remaining must contain("n-key-rotation-ended-v2")
      remaining must contain("n-key-refresh-v2")
      remaining must contain("n-new-post-v2")
      remaining must contain("n-new-issue-v2")
      remaining must contain("n-transfer-ownership")
      remaining must contain("n-checkout")
    }

    "clean up action.demand notifications when a subscription demand is cancelled" in {
      val plan = defaultApi.plans.head
      val api = defaultApi.api.copy(
        possibleUsagePlans = Seq(plan.id),
        defaultUsagePlan = plan.id.some
      )
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = parentApiKey,
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "notif-token"
      )
      val sub = ApiSubscription(
        id = ApiSubscriptionId("notif-sub"),
        tenant = tenant.id,
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = api.id,
        by = user.id,
        customName = None,
        keyring = keyring.id
      )
      val demandId = DemandId("notif-demand")
      val stepId = SubscriptionDemandStepId("notif-step")
      val demand = SubscriptionDemand(
        id = demandId,
        tenant = tenant.id,
        api = api.id,
        plan = plan.id,
        steps = Seq(
          SubscriptionDemandStep(
            id = SubscriptionDemandStepId("admin"),
            state = SubscriptionDemandState.Waiting,
            step = ValidationStep
              .TeamAdmin(id = IdGenerator.token(10), team = teamOwner.id)
          )
        ),
        state = SubscriptionDemandState.InProgress,
        team = teamConsumerId,
        from = user.id,
        motivation = None
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user),
        teams = Seq(teamOwner, teamConsumer),
        usagePlans = Seq(plan),
        apis = Seq(api),
        subscriptions = Seq(sub),
        keyrings = Seq(keyring),
        subscriptionDemands = Seq(demand),
        notifications = makeAllNotifs(api, plan, sub, keyring, demandId, stepId)
      )

      // cancelProcess deletes: demand, stepValidators, and notifs where action.demand = demandId
      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/subscription/team/${teamOwnerId.value}/demands/${demandId.value}/_cancel",
        method = "DELETE"
      )(using tenant, session)
      resp.status mustBe 200
      (resp.json \ "done").as[Boolean] mustBe true

      val remaining = Await
        .result(
          daikokuComponents.env.dataStore.notificationRepo
            .forTenant(tenant)
            .findNotDeleted(Json.obj()),
          5.second
        )
        .map(_.id.value)
        .toSet

      // deleted — action.demand = demandId
      remaining must not contain "n-sub-demand" // ApiSubscriptionDemand has demand field
      remaining must not contain "n-account-creation"
      remaining must not contain "n-checkout"

      // survived — 22 others
      remaining must contain("n-api-access")
      remaining must contain("n-team-invitation")
      remaining must contain("n-sub-accept")
      remaining must contain("n-sub-reject")
      remaining must contain("n-sub-transfer-success")
      remaining must contain("n-oto-sync-sub-error")
      remaining must contain("n-oto-sync-api-error")
      remaining must contain("n-key-deletion")
      remaining must contain("n-key-rotation-in-progress")
      remaining must contain("n-key-rotation-ended")
      remaining must contain("n-key-refresh")
      remaining must contain("n-new-post")
      remaining must contain("n-new-issue")
      remaining must contain("n-new-comment")
      remaining must contain("n-key-deletion-v2")
      remaining must contain("n-key-rotation-in-progress-v2")
      remaining must contain("n-key-rotation-ended-v2")
      remaining must contain("n-key-refresh-v2")
      remaining must contain("n-new-post-v2")
      remaining must contain("n-new-issue-v2")
      remaining must contain("n-new-comment-v2")
      remaining must contain("n-transfer-ownership")
    }
  }

}
