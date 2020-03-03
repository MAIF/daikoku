package fr.maif.otoroshi.daikoku.tests

import com.typesafe.config.ConfigFactory
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
import play.api.Configuration
import play.api.libs.json.Json
import reactivemongo.bson.BSONObjectID

import com.themillhousegroup.scoup.ScoupImplicits._

import scala.concurrent.duration._

class BasicUsageSpec(configurationSpec: => Configuration)
    extends PlaySpec
    with OneServerPerSuiteWithMyComponents
    with DaikokuSpecHelper
    with IntegrationPatience {

  override def getConfiguration(configuration: Configuration) =
    configuration ++ configurationSpec ++ Configuration(
      ConfigFactory.parseString(s"""
     |{
     |  http.port=$port
     |  play.server.http.port=$port
     |}
     """.stripMargin).resolve()
    )

  s"Daikoku basics" should {

    "deny unlogged connections" in {

      val user = User(
        id = UserId(BSONObjectID.generate().stringify),
        tenants = Set(tenant.id),
        origins = Set(AuthProvider.Local),
        name = "Bobby",
        email = "bobby@gmail.com",
        picture = "/me.jpg",
        lastTenant = Some(tenant.id),
        personalToken = Some(IdGenerator.token(32)),
        password = Some(BCrypt.hashpw("password", BCrypt.gensalt())),
        defaultLanguage = None
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user)
      )

      val resp = httpJsonCallWithoutSessionBlocking("/api/me")(tenant)

      resp.status mustBe 303
    }

    "show your profile" in {
      val user = User(
        id = UserId(BSONObjectID.generate().stringify),
        tenants = Set(tenant.id),
        origins = Set(AuthProvider.Local),
        name = "Bobby",
        email = "bobby@gmail.com",
        lastTenant = Some(tenant.id),
        personalToken = Some(IdGenerator.token(32)),
        password = Some(BCrypt.hashpw("password", BCrypt.gensalt())),
        defaultLanguage = None
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user)
      )

      val session = loginWithBlocking(user, tenant)

      val resp = httpJsonCallBlocking("/api/me")(tenant, session)

      resp.status mustBe 200

      val result =
        fr.maif.otoroshi.daikoku.domain.json.UserFormat.reads(resp.json)

      result.isSuccess mustBe true

      result.get == user mustBe true

      val page = openPageBlocking("/settings/me")(tenant, session)

//        page.select("img[alt=\"avatar\"]").attr("src") mustBe user.picture
//        page.select("#input-Name").`val`() mustBe user.name
//        page.select("#input-Avatar").`val`() mustBe user.picture
//        page.select("input[id=\"input-Email address\"]").`val`() mustBe user.email
//        page.select("input[id=\"input-Personal Token\"]").`val`() mustBe user.personalToken.get

      screenshotPageBlocking("/settings/me")(tenant, session)

      logoutBlocking(user, tenant)

      val resp2 = httpJsonCallWithoutSessionBlocking("/api/me")(tenant)

      resp2.status mustBe 303

      val page2 = openPageBlocking("/settings/me")(tenant, session)

      page2.html().contains("Login to Test Corp.") mustBe true

      screenshotPageBlocking("/settings/me")(tenant, session)
    }
  }
}
