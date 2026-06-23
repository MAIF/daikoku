package fr.maif.daikoku.usages

import cats.implicits.catsSyntaxOptionId
import com.dimafeng.testcontainers.GenericContainer.FileSystemBind
import com.dimafeng.testcontainers.{
  Container,
  ForAllTestContainer,
  GenericContainer
}
import fr.maif.daikoku.login.{AuthProvider, LdapConfig}
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.BindMode
import org.testcontainers.containers.wait.strategy.Wait
import play.api.libs.json.{JsArray, Json}

class BasicUsageSpec()
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
    waitStrategy = Wait.forLogMessage(".*slapd starting.*", 1)
  )

  s"Daikoku basics" should {

//    "deny unlogged connections" in {
//
//      val user = User(
//        id = UserId(IdGenerator.token(32)),
//        tenants = Set(tenant.id),
//        origins = Set(AuthProvider.Local),
//        name = "Bobby",
//        email = "bobby@gmail.com",
//        picture = "/me.jpg",
//        lastTenant = Some(tenant.id),
//        personalToken = Some(IdGenerator.token(32)),
//        password = Some(BCrypt.hashpw("password", BCrypt.gensalt())),
//        defaultLanguage = None
//      )
//
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(user)
//      )
//
//      val resp = httpJsonCallWithoutSessionBlocking("/api/me")(tenant)
//
//      resp.status mustBe 303
//    }
//
//    "show your profile" in {
//      val user = User(
//        id = UserId(IdGenerator.token(32)),
//        tenants = Set(tenant.id),
//        origins = Set(AuthProvider.Local),
//        name = "Bobby",
//        email = "bobby@gmail.com",
//        lastTenant = Some(tenant.id),
//        personalToken = Some(IdGenerator.token(32)),
//        password = Some(BCrypt.hashpw("password", BCrypt.gensalt())),
//        defaultLanguage = None
//      )
//
//      setupEnvBlocking(
//        tenants = Seq(tenant),
//        users = Seq(user)
//      )
//
//      val session = loginWithBlocking(user, tenant)
//
//      val resp = httpJsonCallBlocking("/api/me")(tenant, session)
//
//      resp.status mustBe 200
//
//      val result =
//        fr.maif.daikoku.domain.json.UserFormat.reads(resp.json)
//
//      result.isSuccess mustBe true
//
//      result.get == user mustBe true
//
//      val page = openPageBlocking("/settings/me")(tenant, session)
//
////        page.select("img[alt=\"avatar\"]").attr("src") mustBe user.picture
////        page.select("#input-Name").`val`() mustBe user.name
////        page.select("#input-Avatar").`val`() mustBe user.picture
////        page.select("input[id=\"input-Email address\"]").`val`() mustBe user.email
////        page.select("input[id=\"input-Personal Token\"]").`val`() mustBe user.personalToken.get
//
//      screenshotPageBlocking("/settings/me")(tenant, session)
//
//      logoutBlocking(user, tenant)
//
//      val resp2 = httpJsonCallWithoutSessionBlocking("/api/me")(tenant)
//
//      resp2.status mustBe 303
//
//      val page2 = openPageBlocking("/settings/me")(tenant, session)
//
//      page2.html().contains("Login to Test Corp.") mustBe true
//
//      screenshotPageBlocking("/settings/me")(tenant, session)
//    }
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

  "daikoku ldap module" can {
    "used fallback urls" in {

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

      val resp =
        httpJsonCallBlocking(
          path = "/api/auth/ldap/_check",
          method = "POST",
          body = Some(authProviderSettings)
        )(using tenant, session)

      resp.status mustBe 200
    }

    "check if email exists in ldap" in {

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

      val validEmail = "jim.halpert@dundermifflin.com"
      val unknownEmail = "toby.flanderson@dundermifflin.com"

      var resp = httpJsonCallBlocking(
        path = s"/api/teams/${defaultAdminTeam.id.value}/ldap/users/$validEmail"
      )(using tenant, session)

      logger.warn(Json.prettyPrint(resp.json))
      resp.status mustBe 200

      resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${defaultAdminTeam.id.value}/ldap/users/$unknownEmail"
      )(using tenant, session)

      resp.status mustBe 400
    }
  }

  "Daikoku security" should {

    "reject SQL injection in /api/_search" in {
      val api1 = generateApi("public-1", tenant.id, teamOwnerId, Seq.empty).api
      val api2 = generateApi("public-2", tenant.id, teamOwnerId, Seq.empty).api

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        apis = Seq(api1, api2)
      )
      val session = loginWithBlocking(userAdmin, tenant)

      val injectionPayloads = Seq(
        "' or 1=1 union all select _id, _deleted, content from apis WHERE content::text='",
        "' OR '1'='1",
        "'; DROP TABLE apis; --",
        "' UNION SELECT * FROM apis --"
      )

      injectionPayloads.foreach { payload =>
        val resp = httpJsonCallBlocking(
          path = "/api/_search",
          method = "POST",
          body = Some(Json.obj("search" -> payload))
        )(using tenant, session)

        resp.status mustBe 200

        val apisOptions = resp.json
          .as[JsArray]
          .value
          .find(entry => (entry \ "label").as[String] == "Apis")
          .map(entry => (entry \ "options").as[JsArray].value)
          .getOrElse(Seq.empty)

        // injection must not leak all apis — only exact matches (none expected)
        apisOptions.length mustBe 0
      }
    }

    "return only matched apis for a legitimate search" in {
      val api1 = generateApi("public-1", tenant.id, teamOwnerId, Seq.empty).api
      val api2 = generateApi("public-2", tenant.id, teamOwnerId, Seq.empty).api

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        apis = Seq(api1, api2)
      )
      val session = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = "/api/_search",
        method = "POST",
        body = Some(Json.obj("search" -> "public-1"))
      )(using tenant, session)

      resp.status mustBe 200

      val apisOptions = resp.json
        .as[JsArray]
        .value
        .find(entry => (entry \ "label").as[String] == "Apis")
        .map(entry => (entry \ "options").as[JsArray].value)
        .getOrElse(Seq.empty)

      apisOptions.length mustBe 1
      (apisOptions.head \ "label").as[String] mustBe api1.name

      val resp2 = httpJsonCallBlocking(
        path = "/api/_search",
        method = "POST",
        body = Some(Json.obj("search" -> ""))
      )(using tenant, session)

      resp2.status mustBe 200
      logger.warn(Json.stringify(resp2.json))

      val apisOptions2 = resp2.json
        .as[JsArray]
        .value
        .find(entry => (entry \ "label").as[String] == "Apis")
        .map(entry => (entry \ "options").as[JsArray].value)
        .getOrElse(Seq.empty)

      apisOptions2.length mustBe 2
    }
  }
}
