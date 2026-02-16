package fr.maif.tests

import cats.implicits.catsSyntaxOptionId
import com.dimafeng.testcontainers.GenericContainer.FileSystemBind
import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import fr.maif.domain.*
import fr.maif.login.{AuthProvider, LdapConfig}
import fr.maif.tests.utils.DaikokuSpecHelper
import fr.maif.utils.LoggerImplicits.BetterLogger
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.BindMode
import play.api.libs.json.{JsArray, Json}

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
    ),
  )

  "a daikoku admin" can {
    "list all tenant user" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, user, userAdmin),
        teams = Seq(defaultAdminTeam)
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)

      val resp = httpJsonCallBlocking("/api/admin/users")(tenant, session)
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
        httpJsonCallBlocking(s"/api/admin/users/${user.id.value}")(
          tenant,
          session
        )
      resp.status mustBe 200
      val eventualUser =
        fr.maif.domain.json.UserFormat.reads(resp.json)
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
      )(tenant, session)
      respUpdate.status mustBe 200

      val resp = httpJsonCallBlocking(
        s"/api/admin/users/${userTeamUserId.value}"
      )(tenant, session)
      resp.status mustBe 200
      val eventualUser =
        fr.maif.domain.json.UserFormat.reads(resp.json)
      eventualUser.isSuccess mustBe true
      eventualUser.get.name mustBe "test"
    }

    "delete user" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, user),
        teams = Seq(
          Team(
            id = TeamId("user-team"),
            tenant = tenant.id,
            `type` = TeamType.Personal,
            name = "user team personal",
            description = "",
            contact = user.email,
            users =
              Set(UserWithPermission(user.id, TeamPermission.Administrator))
          )
        )
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)

      val respUpdate =
        httpJsonCallBlocking(
          path = s"/api/admin/users/${userTeamUserId.value}",
          method = "DELETE"
        )(tenant, session)
      respUpdate.status mustBe 200

      val resp = httpJsonCallBlocking(
        s"/api/admin/users/${userTeamUserId.value}"
      )(tenant, session)
      resp.status mustBe 404

      val respTestTeam =
        httpJsonCallBlocking(s"/api/teams/user-team")(tenant, session)
      respTestTeam.status mustBe 404
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
        )(tenant, session)
      respCreate.status mustBe 201

      val resp = httpJsonCallBlocking(
        s"/api/admin/users/${userTeamUserId.value}"
      )(tenant, session)
      resp.status mustBe 200

      val respReCreate =
        httpJsonCallBlocking(
          path = s"/api/admin/users",
          method = "POST",
          body = Some(user.asJson)
        )(tenant, session)
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
        )(tenant, session)
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
        )(tenant, session)
      resp.status mustBe 200

      val respVerif = httpJsonCallBlocking(
        s"/api/admin/users/${user.id.value}"
      )(tenant, session)
      respVerif.status mustBe 200
      val eventualUser =
        fr.maif.domain.json.UserFormat.reads(resp.json)
      eventualUser.isSuccess mustBe true
      eventualUser.get.id mustBe user.id
      eventualUser.get.isDaikokuAdmin mustBe true

      val resp2 =
        httpJsonCallBlocking(
          path = s"/api/admin/users/${user.id.value}/_admin",
          method = "PUT",
          body = Some(Json.obj("isDaikokuAdmin" -> false))
        )(tenant, session)
      resp2.status mustBe 200
      val respRemove = httpJsonCallBlocking(
        s"/api/admin/users/${user.id.value}"
      )(tenant, session)
      respRemove.status mustBe 200
      val eventualUser2 =
        fr.maif.domain.json.UserFormat.reads(resp2.json)
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

      val resp = httpJsonCallBlocking("/api/admin/users")(tenant, session)
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
      )(tenant, session)
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
      )(tenant, session)
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
      )(tenant, session)
      respUpdate.status mustBe 200

      val resp = httpJsonCallBlocking(path = s"/api/me")(tenant, session)
      resp.status mustBe 200
      val eventualUser =
        fr.maif.domain.json.UserFormat.reads(resp.json)
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
        )(tenant, session)
      respDelete.status mustBe 401
    }

    "delete self" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, randomUser),
        teams = Seq()
      )
      val session = loginWithBlocking(randomUser, tenant)
      val respDelete =
        httpJsonCallBlocking(
          path = s"/api/admin/users/${randomUser.id.value}",
          method = "DELETE"
        )(tenant, session)
      respDelete.status mustBe 401

      val respDelete2 =
        httpJsonCallBlocking(path = s"/api/me", method = "DELETE")(
          tenant,
          session
        )
      respDelete2.status mustBe 200

      val sessionAdmin = loginWithBlocking(daikokuAdmin, tenant)
      val resp = httpJsonCallBlocking(
        s"/api/admin/users/${randomUser.id.value}"
      )(tenant, sessionAdmin)
      resp.status mustBe 404
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
        )(tenant, session)
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
        )(tenant, session)
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
        )(tenant, session)
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
      )(tenant, session)

      logger.json(resp.json)
      resp.status mustBe 201
    }
  }
}
