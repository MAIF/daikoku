package fr.maif.daikoku.controllers

import cats.implicits.catsSyntaxOptionId
import com.dimafeng.testcontainers.GenericContainer.FileSystemBind
import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.login.{AuthProvider, LdapConfig}
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import org.joda.time.DateTime
import org.mindrot.jbcrypt.BCrypt
import org.scalatest.concurrent.IntegrationPatience
import org.scalatest.time.SpanSugar.convertIntToGrainOfTime
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.BindMode
import play.api.libs.json.Json
import play.api.libs.ws.DefaultBodyWritables.writeableOf_urlEncodedForm

import java.util.Base64
import scala.concurrent.Await

class LoginControllerSpec()
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

  lazy val authProviderSettings = LdapConfig(
    serverUrls = Seq(
      s"ldap://localhost:${container.mappedPort(389)}"
    ),
    searchBase = "dc=dundermifflin,dc=com",
    userBase = "ou=scranton".some,
    groupFilter = "cn=employees".some,
    adminGroupFilter = "cn=managers".some,
    adminUsername = "cn=admin,dc=dundermifflin,dc=com".some,
    adminPassword = "adminpassword".some,
    nameFields = Seq("cn")
  ).asJson

  "an authProvider Local user" can {
    "try multiple login" in {

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, user, userAdmin),
        teams = Seq(defaultAdminTeam),
        keyrings = Seq(adminApiKeyring),
        subscriptions = Seq(adminApiSubscription)
      )
      def getAdminApiHeader(
          keyring: Keyring
      ): Map[String, String] = {
        Map("Authorization" -> s"Basic ${Base64.getEncoder.encodeToString(
            s"${adminApiKeyring.apiKey.clientId}:${adminApiKeyring.apiKey.clientSecret}".getBytes()
          )}")
      }

      val path = s"/auth/${AuthProvider.Local}/callback"
      val baseUrl = "http://127.0.0.1"
      val _headers = Map("Content-Type" -> "application/x-www-form-urlencoded")

      val builder = daikokuComponents.env.wsClient
        .url(s"$baseUrl:$port$path")
        .withHttpHeaders(
          (Map("Host" -> tenant.domain) ++ _headers ++ getAdminApiHeader(
            adminApiKeyring
          )).toSeq*
        )
        .withFollowRedirects(true)
        .withMethod("POST")

      val formData: Option[Map[String, Seq[String]]] = Some(
        Map(
          "username" -> Seq(user.email),
          "password" -> Seq("wrongPassword")
        )
      )

      for (num <- 1 to 3) {
        val t0 = java.lang.System.currentTimeMillis()
        Await.result(
          formData
            .map(b => builder.withBody(b)(using writeableOf_urlEncodedForm))
            .getOrElse(builder)
            .execute(),
          6.seconds
        )
        val t1 = java.lang.System.currentTimeMillis()
        val time = t1 - t0
        val userFetch = Await
          .result(
            daikokuComponents.env.dataStore.userRepo
              .findByIdNotDeleted(userTeamUserId),
            5.seconds
          )
        userFetch.get.failedLoginAttempts mustBe num
        if (num === 1) {
          time must be > 500L
          time must be < 1800L
        }
        if (num === 2) {
          time must be > 2000L
          time must be < 3000L
        }
        if (num === 3) {
          time must be > 4000L
          time must be < 5000L
        }
      }
    }

    "reset counter after successful login" in {

      val userWithFailures = user.copy(
        failedLoginAttempts = 2,
        lastFailedLogin = Some(DateTime.now().minusMinutes(1))
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, userWithFailures, userAdmin),
        teams = Seq(defaultAdminTeam),
        keyrings = Seq(adminApiKeyring),
        subscriptions = Seq(adminApiSubscription)
      )

      val adminApiHeader =
        "Authorization" -> s"Basic ${Base64.getEncoder.encodeToString(
            s"${adminApiKeyring.apiKey.clientId}:${adminApiKeyring.apiKey.clientSecret}".getBytes()
          )}"

      val path = s"/auth/${AuthProvider.Local}/callback"
      val baseUrl = "http://127.0.0.1"

      val resp = Await.result(
        daikokuComponents.env.wsClient
          .url(s"$baseUrl:$port$path")
          .withHttpHeaders(
            (Map(
              "Host" -> tenant.domain,
              "Content-Type" -> "application/x-www-form-urlencoded"
            ) + adminApiHeader).toSeq*
          )
          .withFollowRedirects(false)
          .withMethod("POST")
          .withBody(
            Map(
              "username" -> Seq(user.email),
              "password" -> Seq("password")
            )
          )(using writeableOf_urlEncodedForm)
          .execute(),
        5.seconds
      )

      resp.status mustBe 303

      val userFetch = Await.result(
        daikokuComponents.env.dataStore.userRepo
          .findByIdNotDeleted(userTeamUserId),
        5.seconds
      )
      userFetch.get.failedLoginAttempts mustBe 0
      userFetch.get.lastFailedLogin mustBe None
    }

    "return an error for an unknown user" in {

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, user, userAdmin),
        teams = Seq(defaultAdminTeam),
        keyrings = Seq(adminApiKeyring),
        subscriptions = Seq(adminApiSubscription)
      )

      val adminApiHeader =
        "Authorization" -> s"Basic ${Base64.getEncoder.encodeToString(
            s"${adminApiKeyring.apiKey.clientId}:${adminApiKeyring.apiKey.clientSecret}".getBytes()
          )}"

      val path = s"/auth/${AuthProvider.Local}/callback"
      val baseUrl = "http://127.0.0.1"

      val t0 = java.lang.System.currentTimeMillis()
      val resp = Await.result(
        daikokuComponents.env.wsClient
          .url(s"$baseUrl:$port$path")
          .withHttpHeaders(
            (Map(
              "Host" -> tenant.domain,
              "Content-Type" -> "application/x-www-form-urlencoded"
            ) + adminApiHeader).toSeq*
          )
          .withFollowRedirects(false)
          .withMethod("POST")
          .withBody(
            Map(
              "username" -> Seq("unknown@example.com"),
              "password" -> Seq("anyPassword")
            )
          )(using writeableOf_urlEncodedForm)
          .execute(),
        5.seconds
      )
      val time = java.lang.System.currentTimeMillis() - t0

      resp.status mustBe 400
      time must be > 3000L
    }

    "not increment counter for user without local password" in {

      val userWithoutPassword = user.copy(password = None)

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, userWithoutPassword, userAdmin),
        teams = Seq(defaultAdminTeam),
        keyrings = Seq(adminApiKeyring),
        subscriptions = Seq(adminApiSubscription)
      )

      val adminApiHeader =
        "Authorization" -> s"Basic ${Base64.getEncoder.encodeToString(
            s"${adminApiKeyring.apiKey.clientId}:${adminApiKeyring.apiKey.clientSecret}".getBytes()
          )}"

      val path = s"/auth/${AuthProvider.Local}/callback"
      val baseUrl = "http://127.0.0.1"

      Await.result(
        daikokuComponents.env.wsClient
          .url(s"$baseUrl:$port$path")
          .withHttpHeaders(
            (Map(
              "Host" -> tenant.domain,
              "Content-Type" -> "application/x-www-form-urlencoded"
            ) + adminApiHeader).toSeq*
          )
          .withFollowRedirects(false)
          .withMethod("POST")
          .withBody(
            Map(
              "username" -> Seq(user.email),
              "password" -> Seq("anyPassword")
            )
          )(using writeableOf_urlEncodedForm)
          .execute(),
        5.seconds
      )

      val userFetch = Await.result(
        daikokuComponents.env.dataStore.userRepo
          .findByIdNotDeleted(userTeamUserId),
        5.seconds
      )
      userFetch.get.failedLoginAttempts mustBe 0
    }
  }

  "an authProvider LDAP user" can {
    "try multiple login" in {

      val userLDAP = User(
        id = userTeamUserId,
        tenants = Set(tenant.id),
        origins = Set(AuthProvider.LDAP),
        name = "Michael Scott",
        email = "michael.scott@dundermifflin.com",
        lastTenant = None,
        personalToken = Some("001"),
        password = None,
        defaultLanguage = None
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            authProvider = AuthProvider.LDAP,
            authProviderSettings = authProviderSettings
          )
        ),
        users = Seq(daikokuAdmin, user, userLDAP),
        teams = Seq(defaultAdminTeam),
        keyrings = Seq(adminApiKeyring),
        subscriptions = Seq(adminApiSubscription)
      )

      val adminApiHeader =
        "Authorization" -> s"Basic ${Base64.getEncoder.encodeToString(
            s"${adminApiKeyring.apiKey.clientId}:${adminApiKeyring.apiKey.clientSecret}".getBytes()
          )}"

      val path = s"/auth/${AuthProvider.LDAP}/callback"
      val baseUrl = "http://127.0.0.1"

      val builder = daikokuComponents.env.wsClient
        .url(s"$baseUrl:$port$path")
        .withHttpHeaders(
          (Map(
            "Host" -> tenant.domain,
            "Content-Type" -> "application/x-www-form-urlencoded"
          ) + adminApiHeader).toSeq*
        )
        .withFollowRedirects(true)
        .withMethod("POST")

      val formData: Option[Map[String, Seq[String]]] = Some(
        Map(
          "username" -> Seq(userLDAP.email),
          "password" -> Seq("wrongPassword")
        )
      )

      for (num <- 1 to 3) {
        val t0 = java.lang.System.currentTimeMillis()
        Await.result(
          formData
            .map(b => builder.withBody(b)(using writeableOf_urlEncodedForm))
            .getOrElse(builder)
            .execute(),
          6.seconds
        )
        val t1 = java.lang.System.currentTimeMillis()
        val time = t1 - t0
        val userFetch = Await
          .result(
            daikokuComponents.env.dataStore.userRepo
              .findByIdNotDeleted(userTeamUserId),
            5.seconds
          )
        userFetch.get.failedLoginAttempts mustBe num
        if (num === 1) {
          time must be > 1000L
          time must be < 2000L
        }
        if (num === 2) {
          time must be > 2000L
          time must be < 3000L
        }
        if (num === 3) {
          time must be > 4000L
          time must be < 5000L
        }
      }
    }

    "reset counter after successful LDAP login" in {

      val userLDAPWithFailures = User(
        id = userTeamUserId,
        tenants = Set(tenant.id),
        origins = Set(AuthProvider.LDAP),
        name = "Michael Scott",
        email = "michael.scott@dundermifflin.com",
        lastTenant = None,
        personalToken = Some("001"),
        password = None,
        defaultLanguage = None,
        failedLoginAttempts = 2,
        lastFailedLogin = Some(DateTime.now().minusMinutes(1))
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            authProvider = AuthProvider.LDAP,
            authProviderSettings = authProviderSettings
          )
        ),
        users = Seq(daikokuAdmin, user, userLDAPWithFailures),
        teams = Seq(defaultAdminTeam),
        keyrings = Seq(adminApiKeyring),
        subscriptions = Seq(adminApiSubscription)
      )

      val adminApiHeader =
        "Authorization" -> s"Basic ${Base64.getEncoder.encodeToString(
            s"${adminApiKeyring.apiKey.clientId}:${adminApiKeyring.apiKey.clientSecret}".getBytes()
          )}"

      val resp = Await.result(
        daikokuComponents.env.wsClient
          .url(s"http://127.0.0.1:$port/auth/${AuthProvider.LDAP}/callback")
          .withHttpHeaders(
            (Map(
              "Host" -> tenant.domain,
              "Content-Type" -> "application/x-www-form-urlencoded"
            ) + adminApiHeader).toSeq*
          )
          .withFollowRedirects(false)
          .withMethod("POST")
          .withBody(
            Map(
              "username" -> Seq(userLDAPWithFailures.email),
              "password" -> Seq("password")
            )
          )(using writeableOf_urlEncodedForm)
          .execute(),
        5.seconds
      )

      resp.status mustBe 303

      val userFetch = Await.result(
        daikokuComponents.env.dataStore.userRepo
          .findByIdNotDeleted(userTeamUserId),
        5.seconds
      )
      userFetch.get.failedLoginAttempts mustBe 0
      userFetch.get.lastFailedLogin mustBe None
    }
  }
}
