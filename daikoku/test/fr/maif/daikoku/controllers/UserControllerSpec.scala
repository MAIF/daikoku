package fr.maif.daikoku.controllers

import cats.implicits.catsSyntaxOptionId
import com.dimafeng.testcontainers.GenericContainer.FileSystemBind
import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import fr.maif.daikoku.domain.{UserWithPermission, *}
import fr.maif.daikoku.domain.TeamPermission.Administrator
import fr.maif.daikoku.login.{AuthProvider, LdapConfig}
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import fr.maif.daikoku.utils.IdGenerator
import fr.maif.daikoku.utils.LoggerImplicits.BetterLogger
import org.joda.time.DateTime
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.BindMode
import play.api.libs.json.{JsArray, JsObject, Json}

import scala.concurrent.duration.*
import scala.concurrent.Await
import scala.util.Random

class UserControllerSpec()
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with ForAllTestContainer {

  val pwd: String = System.getProperty("user.dir")
  override val container: GenericContainer = GenericContainer(
    "osixia/openldap:latest",
    exposedPorts = Seq(389),
    env = Map(
      "LDAP_BASE_DN" -> "dc=dundermifflin,dc=com",
      "LDAP_ORGANISATION" -> "Dunder Mifflin Organization",
      "LDAP_DOMAIN" -> "dundermifflin.com",
      "LDAP_ADMIN_PASSWORD" -> "adminpassword",
      "LDAP_TLS" -> "false"
    ),
    command = Seq("--copy-service"),
    fileSystemBind = Seq(
      FileSystemBind(
        s"$pwd/javascript/tests/config/ldap/bootstrap.ldif",
        "/container/service/slapd/assets/config/bootstrap/ldif/custom/50-bootstrap.ldif",
        BindMode.READ_ONLY
      )
    )
  )

  "a daikoku admin" can {
    "list all tenant user" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, user, userAdmin),
        teams = Seq(defaultAdminTeam)
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)

      val resp = httpJsonCallBlocking("/api/admin/users")(using tenant, session)
      resp.status mustBe 200
      val users = resp.json
        .as[JsArray]
        .value
        .filter(u => (u \ "email").as[String] != "admin@daikoku.io")
      users.length mustBe 3
      users.diff(
        Seq(
          daikokuAdmin.asSimpleJson,
          user.asSimpleJson,
          userAdmin.asSimpleJson
        )
      ) mustBe Seq.empty
    }

    "find user by id" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, user, userAdmin),
        teams = Seq()
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)

      val resp =
        httpJsonCallBlocking(s"/api/admin/users/${user.id.value}")(using
          tenant,
          session
        )
      resp.status mustBe 200
      val eventualUser =
        fr.maif.daikoku.domain.json.UserFormat.reads(resp.json)
      eventualUser.isSuccess mustBe true
      eventualUser.get mustBe user
    }

    "update user" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, user, userAdmin),
        teams = Seq()
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val respUpdate = httpJsonCallBlocking(
        path = s"/api/admin/users/${userTeamUserId.value}",
        method = "PUT",
        body = Some(user.copy(name = "test").asJson)
      )(using tenant, session)
      respUpdate.status mustBe 200

      val resp = httpJsonCallBlocking(
        s"/api/admin/users/${userTeamUserId.value}"
      )(using tenant, session)
      resp.status mustBe 200
      val eventualUser =
        fr.maif.daikoku.domain.json.UserFormat.reads(resp.json)
      eventualUser.isSuccess mustBe true
      eventualUser.get.name mustBe "test"
    }

    "delete user" in {

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

      // subscription is now fully deleted
      _maybeSubscription mustBe empty

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

    "create user" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq()
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val respCreate =
        httpJsonCallBlocking(
          path = s"/api/admin/users",
          method = "POST",
          body = Some(user.asJson)
        )(using tenant, session)
      respCreate.status mustBe 201

      val resp = httpJsonCallBlocking(
        s"/api/admin/users/${userTeamUserId.value}"
      )(using tenant, session)
      resp.status mustBe 200

      val respReCreate =
        httpJsonCallBlocking(
          path = s"/api/admin/users",
          method = "POST",
          body = Some(user.asJson)
        )(using tenant, session)
      respReCreate.status mustBe 409
    }

    "impersonate user" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, user),
        teams = Seq()
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp =
        httpJsonCallBlocking(
          s"/api/admin/users/${userTeamUserId.value}/_impersonate"
        )(using tenant, session)
      resp.status mustBe 303
      // todo: test it
    }

    "set admin status" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, user),
        teams = Seq(defaultAdminTeam)
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp =
        httpJsonCallBlocking(
          path = s"/api/admin/users/${user.id.value}/_admin",
          method = "PUT",
          body = Some(Json.obj("isDaikokuAdmin" -> true))
        )(using tenant, session)
      resp.status mustBe 200

      val respVerif = httpJsonCallBlocking(
        s"/api/admin/users/${user.id.value}"
      )(using tenant, session)
      respVerif.status mustBe 200
      val eventualUser =
        fr.maif.daikoku.domain.json.UserFormat.reads(resp.json)
      eventualUser.isSuccess mustBe true
      eventualUser.get.id mustBe user.id
      eventualUser.get.isDaikokuAdmin mustBe true

      val resp2 =
        httpJsonCallBlocking(
          path = s"/api/admin/users/${user.id.value}/_admin",
          method = "PUT",
          body = Some(Json.obj("isDaikokuAdmin" -> false))
        )(using tenant, session)
      resp2.status mustBe 200
      val respRemove = httpJsonCallBlocking(
        s"/api/admin/users/${user.id.value}"
      )(using tenant, session)
      respRemove.status mustBe 200
      val eventualUser2 =
        fr.maif.daikoku.domain.json.UserFormat.reads(resp2.json)
      eventualUser2.isSuccess mustBe true
      eventualUser2.get.id mustBe user.id
      eventualUser2.get.isDaikokuAdmin mustBe false
    }
  }

  "a teamAdmin, ApiEditor or user" can {
    val randomUser = Random.shuffle(Seq(user, userApiEditor, userAdmin)).head

    "not list all tenant users" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(randomUser),
        teams = Seq(defaultAdminTeam)
      )
      val session = loginWithBlocking(randomUser, tenant)

      val resp = httpJsonCallBlocking("/api/admin/users")(using tenant, session)
      resp.status mustBe 403
    }

    "not find user by id" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, randomUser),
        teams = Seq()
      )
      val session = loginWithBlocking(randomUser, tenant)

      val resp = httpJsonCallBlocking(
        s"/api/admin/users/${daikokuAdmin.id.value}"
      )(using tenant, session)
      resp.status mustBe 401
    }

    "not update user" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, randomUser),
        teams = Seq()
      )
      val userNotRandomUser =
        Seq(userAdmin, userApiEditor, user).diff(Seq(randomUser)).head
      val session = loginWithBlocking(randomUser, tenant)
      val respUpdate = httpJsonCallBlocking(
        path = s"/api/admin/users/${daikokuAdmin.id.value}",
        method = "PUT",
        body = Some(userNotRandomUser.copy(name = "test").asJson)
      )(using tenant, session)
      respUpdate.status mustBe 401
    }

    "update self" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, randomUser)
      )
      val session = loginWithBlocking(randomUser, tenant)
      val respUpdate = httpJsonCallBlocking(
        path = s"/api/admin/users/${randomUser.id.value}",
        method = "PUT",
        body = Some(randomUser.copy(name = "test").asJson)
      )(using tenant, session)
      respUpdate.status mustBe 200

      val resp = httpJsonCallBlocking(path = s"/api/me")(using tenant, session)
      resp.status mustBe 200
      val eventualUser =
        fr.maif.daikoku.domain.json.UserFormat.reads(resp.json)
      eventualUser.isSuccess mustBe true
      eventualUser.get.name mustBe "test"

    }

    "not delete user" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, randomUser),
        teams = Seq()
      )
      val session = loginWithBlocking(randomUser, tenant)
      val respDelete =
        httpJsonCallBlocking(
          path = s"/api/admin/users/${daikokuAdmin.id.value}",
          method = "DELETE"
        )(using tenant, session)
      respDelete.status mustBe 401
    }

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
        httpJsonCallBlocking(
          path = s"/api/admin/users/${randomUser.id.value}",
          method = "DELETE"
        )(using tenant, session)
      respDelete.status mustBe 401

      val respDelete2 =
        httpJsonCallBlocking(path = s"/api/me", method = "DELETE")(using
          tenant,
          session
        )
      respDelete2.status mustBe 200

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

      // subscription is fully deleted
      _maybeSubscription mustBe empty

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

    "not create user" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(randomUser),
        teams = Seq()
      )
      val session = loginWithBlocking(randomUser, tenant)
      val respCreate =
        httpJsonCallBlocking(
          path = s"/api/admin/users",
          method = "POST",
          body = Some(user.asJson)
        )(using tenant, session)
      respCreate.status mustBe 401
    }

    "not impersonate user" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, randomUser),
        teams = Seq()
      )
      val session = loginWithBlocking(randomUser, tenant)
      val resp =
        httpJsonCallBlocking(
          s"/api/admin/users/${daikokuAdmin.id.value}/_impersonate"
        )(using tenant, session)
      resp.status mustBe 401
    }

    "not set admin status" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user, userAdmin),
        teams = Seq(defaultAdminTeam)
      )
      val session = loginWithBlocking(user, tenant)
      val resp =
        httpJsonCallBlocking(
          path = s"/api/admin/users/${userAdmin.id.value}/_admin",
          method = "PUT",
          body = Some(Json.obj("isDaikokuAdmin" -> true))
        )(using tenant, session)
      resp.status mustBe 401
    }

  }

  lazy val authProviderSettings = LdapConfig(
    serverUrls = Seq(
      s"ldap://localhost:${container.mappedPort(389)}"
    ),
    searchBase = "dc=dundermifflin,dc=com",
    userBase = "ou=scranton".some,
    groupFilter = "ou=employees".some,
    adminGroupFilter = "ou=managers".some,
    adminUsername = "cn=admin,dc=dundermifflin,dc=com".some,
    adminPassword = "adminpassword".some,
    nameFields = Seq("cn")
  ).asJson

  "a teamAdmin" can {
    "create LDAP user" in {
      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            authProvider = AuthProvider.LDAP,
            authProviderSettings = authProviderSettings
          )
        ),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam)
      )
      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${defaultAdminTeam.id.value}/ldap/users",
        method = "POST",
        body = Some(
          Json.obj(
            "email" -> "jim.halpert@dundermifflin.com",
            "teamId" -> defaultAdminTeam.id.value
          )
        )
      )(using tenant, session)

      logger.json(resp.json)
      resp.status mustBe 201
    }
  }
}
