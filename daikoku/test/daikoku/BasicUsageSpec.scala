package fr.maif.otoroshi.daikoku.tests

import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.login.AuthProvider
import fr.maif.otoroshi.daikoku.tests.utils.{
  DaikokuSpecHelper,
  OneServerPerSuiteWithMyComponents
}
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import org.mindrot.jbcrypt.BCrypt
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.Json
import reactivemongo.bson.BSONObjectID

class BasicUsageSpec()
    extends PlaySpec
    with OneServerPerSuiteWithMyComponents
    with DaikokuSpecHelper
    with IntegrationPatience {

  s"Daikoku basics" should {

//    "deny unlogged connections" in {
//
//      val user = User(
//        id = UserId(BSONObjectID.generate().stringify),
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
//        id = UserId(BSONObjectID.generate().stringify),
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
//        fr.maif.otoroshi.daikoku.domain.json.UserFormat.reads(resp.json)
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

  "daikoku ldap module" can {
    "used fallback urls" in {
      val authProviderSettings = Json.obj(
        "serverUrls" -> Seq("ldap://ldap.forumsys:389",
                            "ldap://ldap.forumsys.com:389"),
        "searchBase" -> "dc=example,dc=com",
        "adminUsername" -> "cn=read-only-admin,dc=example,dc=com",
        "adminPassword" -> "password",
        "userBase" -> "",
        "searchFilter" -> "(mail=${username})",
        "groupFilter" -> "ou=mathematicians",
        "adminGroupFilter" -> "ou=scientists",
        "nameField" -> "cn",
        "emailField" -> "mail"
      )

      setupEnv(
        tenants = Seq(tenant.copy(authProvider = AuthProvider.LDAP, authProviderSettings = authProviderSettings)),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam)
      ).map(_ => {
        val session = loginWithBlocking(tenantAdmin, tenant)

        val resp =
          httpJsonCallBlocking(path = "/api/auth/ldap/_check",
                               method = "POST",
                               body = Some(authProviderSettings))(tenant, session)

        resp.status mustBe 200
      })
    }

    "check if email exists in ldap" in {
      val authProviderSettings = Json.obj(
        "serverUrls" -> Seq("ldap://ldap.forumsys.com:389"),
        "searchBase" -> "dc=example,dc=com",
        "adminUsername" -> "cn=read-only-admin,dc=example,dc=com",
        "adminPassword" -> "password",
        "userBase" -> "",
        "searchFilter" -> "(mail=${username})",
        "groupFilter" -> "ou=mathematicians",
        "adminGroupFilter" -> "ou=scientists",
        "nameField" -> "cn",
        "emailField" -> "mail"
      )

      setupEnv(
        tenants = Seq(tenant.copy(authProvider = AuthProvider.LDAP, authProviderSettings = authProviderSettings)),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam)
      ).map(_ => {
        val session = loginWithBlocking(tenantAdmin, tenant)

        val validEmail = "gauss@ldap.forumsys.com"
        val unknownEmail = "toto@ldap.forumsys.com"

        var resp = httpJsonCallBlocking(
          path =
            s"/api/teams/${defaultAdminTeam.id.value}/ldap/users/${validEmail}"
        )(tenant, session)

        resp.status mustBe 200

        resp = httpJsonCallBlocking(
          path =
            s"/api/teams/${defaultAdminTeam.id.value}/ldap/users/${unknownEmail}"
        )(tenant, session)

        resp.status mustBe 400
      })
    }
  }
}
