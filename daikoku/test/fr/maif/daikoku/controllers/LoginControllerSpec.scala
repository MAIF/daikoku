package fr.maif.daikoku.controllers

import cats.implicits.catsSyntaxOptionId
import com.dimafeng.testcontainers.GenericContainer.FileSystemBind
import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.login.{AuthProvider, LdapConfig}
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import org.mindrot.jbcrypt.BCrypt
import org.scalatest.concurrent.IntegrationPatience
import org.scalatest.time.SpanSugar.convertIntToGrainOfTime
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.BindMode
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
    groupFilter = "ou=employees".some,
    adminGroupFilter = "ou=managers".some,
    adminUsername = "cn=admin,dc=dundermifflin,dc=com".some,
    adminPassword = "adminpassword".some,
    nameFields = Seq("cn")
  ).asJson

  "an authProvider Local user" can {
    "try multiple login" in {

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, user, userAdmin),
        teams = Seq(defaultAdminTeam)
      )
      def getAdminApiHeader(
          adminApiSubscription: ApiSubscription
      ): Map[String, String] = {
        Map("Authorization" -> s"Basic ${Base64.getEncoder.encodeToString(
            s"${adminApiSubscription.apiKey.clientId}:${adminApiSubscription.apiKey.clientSecret}".getBytes()
          )}")
      }

      val path = s"/auth/${AuthProvider.Local}/callback"
      val baseUrl = "http://127.0.0.1"
      val _headers = Map("Content-Type" -> "application/x-www-form-urlencoded")

      val builder = daikokuComponents.env.wsClient
        .url(s"$baseUrl:$port$path")
        .withHttpHeaders(
          (Map("Host" -> tenant.domain) ++ _headers ++ getAdminApiHeader(
            adminApiSubscription
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
          8.seconds
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
        if (num === 2) {
          time must be > 2000L
          time must be < 2500L
        }
        if (num === 3) {
          time must be > 4000L
          time must be < 4500L
        }
      }
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
        password = Some(BCrypt.hashpw("password", BCrypt.gensalt())),
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
        teams = Seq(defaultAdminTeam)
      )

      def getAdminApiHeader(
          adminApiSubscription: ApiSubscription
      ): Map[String, String] = {
        Map("Authorization" -> s"Basic ${Base64.getEncoder.encodeToString(
            s"${adminApiSubscription.apiKey.clientId}:${adminApiSubscription.apiKey.clientSecret}".getBytes()
          )}")
      }

      val path = s"/auth/${AuthProvider.LDAP}/callback"
      val baseUrl = "http://127.0.0.1"
      val _headers = Map("Content-Type" -> "application/x-www-form-urlencoded")

      val builder = daikokuComponents.env.wsClient
        .url(s"$baseUrl:$port$path")
        .withHttpHeaders(
          (Map("Host" -> tenant.domain) ++ _headers ++ getAdminApiHeader(
            adminApiSubscription
          )).toSeq*
        )
        .withFollowRedirects(true)
        .withMethod("POST")

      val formData: Option[Map[String, Seq[String]]] = Some(
        Map(
          "username" -> Seq(userLDAP.email),
          "password" -> Seq(userLDAP.password.get)
        )
      )

      for (num <- 1 to 3) {
        val t0 = java.lang.System.currentTimeMillis()
        Await.result(
          formData
            .map(b => builder.withBody(b)(using writeableOf_urlEncodedForm))
            .getOrElse(builder)
            .execute(),
          8.seconds
        )
        val t1 = java.lang.System.currentTimeMillis()
        val time = t1 - t0
        val userFetch = Await
          .result(
            daikokuComponents.env.dataStore.userRepo
              .findByIdNotDeleted(userTeamUserId),
            5.seconds
          )
        logger.warn(userFetch.get.failedLoginAttempts.toString)
        userFetch.get.failedLoginAttempts mustBe num
        if (num === 2) {
          time must be > 2000L
          time must be < 2500L
        }
        if (num === 3) {
          time must be > 4000L
          time must be < 4500L
        }
      }
    }
  }
}
