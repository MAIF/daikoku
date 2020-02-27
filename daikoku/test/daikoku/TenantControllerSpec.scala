package fr.maif.otoroshi.daikoku.tests

import com.typesafe.config.ConfigFactory
import fr.maif.otoroshi.daikoku.domain.{ApiVisibility, ConsoleMailerSettings, DaikokuStyle, TeamPermission, TeamType, Tenant, TenantId}
import fr.maif.otoroshi.daikoku.login.AuthProvider
import fr.maif.otoroshi.daikoku.tests.utils.{DaikokuSpecHelper, OneServerPerSuiteWithMyComponents}
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import play.api.{Configuration, Logger}
import play.api.libs.json.{JsValue, Json}
import reactivemongo.bson.BSONObjectID


class TenantControllerSpec(configurationSpec: => Configuration)
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

  "create a tenant" must {
    "create an admin team and an admin api" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)

      val testTenant = Tenant(
        id = TenantId(BSONObjectID.generate().stringify),
        name = "test",
        domain = "test.foo.bar",
        defaultLanguage = None,
        style = Some(DaikokuStyle()),
        mailerSettings = Some(ConsoleMailerSettings()),
        bucketSettings = None,
        authProvider = AuthProvider.Local,
        authProviderSettings = Json.obj(
          "sessionMaxAge" -> 86400
        ),
        otoroshiSettings = Set(),
        adminApi = None
      )

      val respCreation = httpJsonCallBlocking(
        path = s"/api/tenants",
        method = "POST",
        body = Some(testTenant.asJson)
      )(tenant, session)
      respCreation.status mustBe 201

      val tryCreatedTenant =
        fr.maif.otoroshi.daikoku.domain.json.TenantFormat.reads(respCreation.json)
      tryCreatedTenant.isSuccess mustBe true
      val createdTenant = tryCreatedTenant.get
      createdTenant.adminApi.isDefined mustBe true
      val createdAdminApiId = createdTenant.adminApi.get

      val sessionNewTenant = loginWithBlocking(daikokuAdmin, testTenant)
      val respTeams =
        httpJsonCallBlocking(s"/api/me/teams")(
          testTenant,
          sessionNewTenant)
      val tryMyTeams =
        fr.maif.otoroshi.daikoku.domain.json.SeqTeamFormat.reads(respTeams.json)
      tryMyTeams.isSuccess mustBe true
      val myTeams = tryMyTeams.get

      myTeams.count(_.`type` == TeamType.Admin) mustBe 1
      val adminTeam = myTeams.filter(_.`type` == TeamType.Admin).head

      adminTeam.`type` mustBe TeamType.Admin

      val respAdminApi =
        httpJsonCallBlocking(s"/api/me/visible-apis/${createdAdminApiId.value}")(
          testTenant,
          sessionNewTenant)
      val tryAdminApi =
        fr.maif.otoroshi.daikoku.domain.json.ApiFormat.reads(respAdminApi.json)
      tryAdminApi.isSuccess mustBe true
      val createdAdminApi = tryAdminApi.get

      createdAdminApi.visibility mustBe ApiVisibility.AdminOnly
      createdAdminApi.team mustBe adminTeam.id
      createdAdminApi.possibleUsagePlans.length mustBe 1
    }
  }

  "delete a tenant" must {
    "delete its admin team, its admin api and its subscriptions" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)

      val testTenant = Tenant(
        id = TenantId(BSONObjectID.generate().stringify),
        name = "test",
        domain = "test.foo.bar",
        defaultLanguage = None,
        style = Some(DaikokuStyle()),
        mailerSettings = Some(ConsoleMailerSettings()),
        bucketSettings = None,
        authProvider = AuthProvider.Local,
        authProviderSettings = Json.obj(
          "sessionMaxAge" -> 86400
        ),
        otoroshiSettings = Set(),
        adminApi = None
      )

      val respCreation = httpJsonCallBlocking(
        path = s"/api/tenants",
        method = "POST",
        body = Some(testTenant.asJson)
      )(tenant, session)
      respCreation.status mustBe 201

      val tryCreatedTenant =
        fr.maif.otoroshi.daikoku.domain.json.TenantFormat.reads(respCreation.json)
      tryCreatedTenant.isSuccess mustBe true
      val createdTenant = tryCreatedTenant.get
      createdTenant.adminApi.isDefined mustBe true
      val createdAdminApiId = createdTenant.adminApi.get

      val respDelete = httpJsonCallBlocking(
        path = s"/api/tenants/${testTenant.id.value}",
        method = "DELETE",
        body = Some(testTenant.asJson)
      )(tenant, session)
      respDelete.status mustBe 200

      val sessionNewTenant = loginWithBlocking(daikokuAdmin, testTenant)
      val respTeams = httpJsonCallBlocking(s"/api/me/teams")(
          testTenant,
          sessionNewTenant)
      Logger.debug(Json.stringify(respTeams.json))
      respTeams.status mustBe 404

      val respAdminApi =
        httpJsonCallBlocking(s"/api/me/visible-apis/${createdAdminApiId.value}")(
          testTenant,
          sessionNewTenant)
      Logger.debug(Json.stringify(respAdminApi.json))
      respAdminApi.status mustBe 404

    }
  }
}
