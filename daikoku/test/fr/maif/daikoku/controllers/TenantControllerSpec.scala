package fr.maif.daikoku.controllers

import cats.implicits.catsSyntaxOptionId
import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import com.dimafeng.testcontainers.GenericContainer.FileSystemBind
import fr.maif.domain.TeamPermission.Administrator
import fr.maif.domain._
import fr.maif.login.AuthProvider
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import fr.maif.utils.IdGenerator
import org.scalatest.BeforeAndAfter
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.BindMode
import play.api.libs.json._
import play.api.libs.ws.WSBodyReadables._


import scala.concurrent.Await
import scala.concurrent.duration.DurationInt

class TenantControllerSpec()
    extends PlaySpec
//    with OneServerPerSuiteWithMyComponents
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfter
    with ForAllTestContainer {

  val pwd = System.getProperty("user.dir");
  override val container: GenericContainer = GenericContainer(
    "maif/otoroshi",
    exposedPorts = Seq(8080),
    fileSystemBind = Seq(
      FileSystemBind(
        s"$pwd/test/fr/maif/daikoku/otoroshi.json",
        "/home/user/otoroshi.json",
        BindMode.READ_ONLY
      )
    ),
    env = Map("APP_IMPORT_FROM" -> "/home/user/otoroshi.json")
  )

  before {
    Await.result(cleanOtoroshiServer(container.mappedPort(8080)), 5.seconds)
  }

  "create a tenant" must {
    "create an admin team and an admin api" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)

      val tenantId = TenantId(IdGenerator.token(32))
      val testTenant = Tenant(
        id = tenantId,
        name = "test",
        domain = "test.foo.bar",
        defaultLanguage = None,
        style = Some(DaikokuStyle.template(tenantId)),
        mailerSettings = Some(ConsoleMailerSettings()),
        bucketSettings = None,
        authProvider = AuthProvider.Local,
        authProviderSettings = Json.obj(
          "sessionMaxAge" -> 86400
        ),
        otoroshiSettings = Set(),
        adminApi = ApiId("no-api"),
        contact = "admin@foo.bar"
      )

      val respCreation = httpJsonCallBlocking(
        path = s"/api/tenants",
        method = "POST",
        body = Some(testTenant.asJson)
      )(tenant, session)
      respCreation.status mustBe 201

      val tryCreatedTenant =
        fr.maif.domain.json.TenantFormat
          .reads(respCreation.json)
      tryCreatedTenant.isSuccess mustBe true
      val createdTenant = tryCreatedTenant.get
      val createdAdminApiId = createdTenant.adminApi

      val sessionNewTenant = loginWithBlocking(daikokuAdmin, createdTenant)
      val respTeams =
        httpJsonCallBlocking(
          s"/api/search",
          "POST",
          body = Some(
            Json.obj(
              "query" -> """
            |query MyTeams {
            |    myTeams {
            |      name
            |      _humanReadableId
            |      tenant {
            |         id
            |      }
            |      _id
            |      type
            |      contact
            |      verified
            |      users {
            |        user {
            |          userId: id
            |        }
            |        teamPermission
            |      }
            |      authorizedOtoroshiEntities {
            |       otoroshiSettingsId
            |       authorizedEntities {
            |         routes
            |         groups
            |         services
            |       }
            |      }
            |    }
            |  }
            |""".stripMargin
            )
          )
        )(createdTenant, sessionNewTenant)

      val tryMyTeams =
        fr.maif.domain.json.SeqTeamFormat.reads(
          (respTeams.json \ "data" \ "myTeams")
            .as[JsArray]
            .value
            .foldLeft(JsArray())((acc, team) =>
              acc :+ team
                .as[JsObject]
                .deepMerge(
                  Json.obj("_tenant" -> (team \ "tenant" \ "id").as[String])
                )
            )
        )

      tryMyTeams.isSuccess mustBe true
      val myTeams = tryMyTeams.get

      myTeams.count(_.`type` == TeamType.Admin) mustBe 1
      val adminTeam = myTeams.filter(_.`type` == TeamType.Admin).head

      adminTeam.`type` mustBe TeamType.Admin
      val respAdminApi =
        httpJsonCallBlocking(
          s"/api/me/visible-apis/${createdAdminApiId.value}"
        )(createdTenant, sessionNewTenant)
      val tryAdminApi =
        fr.maif.domain.json.ApiFormat.reads(respAdminApi.json)
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

      val tenantId = TenantId(IdGenerator.token(32))
      val testTenant = Tenant(
        id = tenantId,
        name = "test",
        domain = "test.foo.bar",
        defaultLanguage = None,
        style = Some(DaikokuStyle.template(tenantId)),
        mailerSettings = Some(ConsoleMailerSettings()),
        bucketSettings = None,
        authProvider = AuthProvider.Local,
        authProviderSettings = Json.obj(
          "sessionMaxAge" -> 86400
        ),
        otoroshiSettings = Set(),
        adminApi = ApiId("no-api"),
        contact = "contact@foo.bar"
      )

      val respCreation = httpJsonCallBlocking(
        path = s"/api/tenants",
        method = "POST",
        body = Some(testTenant.asJson)
      )(tenant, session)
      respCreation.status mustBe 201

      val tryCreatedTenant =
        fr.maif.domain.json.TenantFormat
          .reads(respCreation.json)
      tryCreatedTenant.isSuccess mustBe true
      val createdTenant = tryCreatedTenant.get
      val createdAdminApiId = createdTenant.adminApi

      val respDelete = httpJsonCallBlocking(
        path = s"/api/tenants/${testTenant.id.value}",
        method = "DELETE",
        body = Some(testTenant.asJson)
      )(tenant, session)
      respDelete.status mustBe 200

      val sessionNewTenant = loginWithBlocking(daikokuAdmin, testTenant)
      val respTeams =
        httpJsonCallBlocking(s"/api/me/teams")(testTenant, sessionNewTenant)
      respTeams.status mustBe 404

      val respAdminApi =
        httpJsonCallBlocking(
          s"/api/me/visible-apis/${createdAdminApiId.value}"
        )(testTenant, sessionNewTenant)
      respAdminApi.status mustBe 404

    }
  }

  "a daikoku admin" can {
    "list all full tenants" in {
      val tenant2 = tenant.copy(
        id = TenantId("tenant2"),
        name = "tenant2",
        adminApi = ApiId("api2")
      )
      setupEnvBlocking(
        tenants = Seq(tenant, tenant2),
        users = Seq(daikokuAdmin)
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)

      val resp = httpJsonCallBlocking("/api/tenants")(tenant, session)
      resp.status mustBe 200
      val tenants =
        fr.maif.domain.json.SeqTenantFormat.reads(resp.json)
      tenants.isSuccess mustBe true
      tenants.get.length mustBe 2
      // test if adminApiId id present to test if tenant is full
      tenants.get
        .find(t => t.id == tenant.id)
        .exists(t => t.adminApi == tenant.adminApi) mustBe true
      tenants.get
        .find(t => t.id == tenant2.id)
        .exists(t => t.adminApi == tenant2.adminApi) mustBe true
    }
    "list all simple tenants" in {
      val tenant2 = tenant.copy(
        id = TenantId("tenant2"),
        name = "tenant2",
        adminApi = ApiId("api2")
      )
      setupEnvBlocking(
        tenants = Seq(tenant, tenant2),
        users = Seq(daikokuAdmin)
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp =
        httpJsonCallBlocking("/api/tenants/simplified")(tenant, session)
      resp.status mustBe 200
      val tenants =
        fr.maif.domain.json.SeqTenantFormat.reads(resp.json)
      tenants.isSuccess mustBe false

      val simpleTenants = resp.json.as[JsArray].value

      simpleTenants.length mustBe 2
      val expectedKey = Set("_id", "name", "desc", "title", "status", "style")

      simpleTenants
        .find(t => (t \ "_id").as[String] == tenant.id.value)
        .exists(t => t.as[JsObject].keys.diff(expectedKey).isEmpty) mustBe true
      simpleTenants
        .find(t => (t \ "_id").as[String] == tenant2.id.value)
        .exists(t => t.as[JsObject].keys.diff(expectedKey).isEmpty) mustBe true
    }
    "get one tenant" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam)
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)

      val resp =
        httpJsonCallBlocking(s"/api/tenants/${tenant.id.value}")(
          tenant,
          session
        )
      resp.status mustBe 200
      val tenantResult =
        fr.maif.domain.json.TenantFormat.reads(resp.json)
      tenantResult.isSuccess mustBe true
      tenantResult.get.adminApi mustBe adminApi.id
    }
    "create tenant" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)

      val tenantId = TenantId(IdGenerator.token(32))
      val testTenant = Tenant(
        id = tenantId,
        name = "test",
        domain = "test.foo.bar",
        defaultLanguage = None,
        style = Some(DaikokuStyle.template(tenantId)),
        mailerSettings = Some(ConsoleMailerSettings()),
        bucketSettings = None,
        authProvider = AuthProvider.Local,
        authProviderSettings = Json.obj(
          "sessionMaxAge" -> 86400
        ),
        otoroshiSettings = Set(),
        adminApi = ApiId("no-api"),
        contact = "admin@test.foo.bar"
      )

      val respCreation = httpJsonCallBlocking(
        path = s"/api/tenants",
        method = "POST",
        body = Some(testTenant.asJson)
      )(tenant, session)
      respCreation.status mustBe 201
    }
    "delete a tenant" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)

      val respCreation = httpJsonCallBlocking(
        path = s"/api/tenants/${tenant.id.value}",
        method = "DELETE"
      )(tenant, session)
      respCreation.status mustBe 200

      val respTest =
        httpJsonCallBlocking(s"/api/tenants/${tenant.id.value}")(
          tenant,
          session
        )
      respTest.status mustBe 404
    }
    "save/update a tenant" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)

      val respUpdate = httpJsonCallBlocking(
        path = s"/api/tenants/${tenant.id.value}",
        method = "PUT",
        body = Some(tenant.copy(name = "test-again").asJson)
      )(tenant, session)
      respUpdate.status mustBe 200

      val respTest =
        httpJsonCallBlocking(s"/api/tenants/${tenant.id.value}")(
          tenant,
          session
        )
      respTest.status mustBe 200
      val tenantResult =
        fr.maif.domain.json.TenantFormat.reads(respTest.json)
      tenantResult.isSuccess mustBe true
      tenantResult.get.name mustBe "test-again"
    }
//    "fetch OIDC config" in {}
//    "contact" in {}
    "get tenant admins" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, tenantAdmin),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)

      val resp = httpJsonCallBlocking(
        s"/api/tenants/${tenant.id.value}/admins"
      )(tenant, session)
      resp.status mustBe 200
      val adminTeam = (resp.json \ "team").as[JsObject]
      val admins = fr.maif.domain.json.SeqUserFormat
        .reads((resp.json \ "admins").as[JsArray])

      admins.isSuccess mustBe true
      admins.get.size mustBe 1
      admins.get.exists(u => u.id == tenantAdminId) mustBe true

      (adminTeam \ "_id").as[String] mustBe defaultAdminTeam.id.value
    }
    "get addable admins for a tenant" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, tenantAdmin, user),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)

      val resp = httpJsonCallBlocking(
        s"/api/tenants/${tenant.id.value}/addable-admins"
      )(tenant, session)
      resp.status mustBe 200
      val addableAdmins =
        fr.maif.domain.json.SeqUserFormat.reads(resp.json)

      addableAdmins.isSuccess mustBe true
      addableAdmins.get.size mustBe 2
      addableAdmins.get.exists(u => u.id == user.id) mustBe true
      addableAdmins.get.exists(u => u.id == daikokuAdmin.id) mustBe true
    }
    "add admins to a tenant" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, tenantAdmin, user),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/api/tenants/${tenant.id.value}/admins",
        method = "POST",
        body = Some(JsArray(Seq(user.id.asJson)))
      )(tenant, session)
      resp.status mustBe 200

      val respTest = httpJsonCallBlocking(
        s"/api/tenants/${tenant.id.value}/admins"
      )(tenant, session)
      respTest.status mustBe 200
      val admins = fr.maif.domain.json.SeqUserFormat
        .reads((respTest.json \ "admins").as[JsArray])

      admins.isSuccess mustBe true
      admins.get.size mustBe 2
      admins.get.exists(u => u.id == user.id) mustBe true

    }
    "remove an admin from a tenant" in {
      Await.result(waitForDaikokuSetup(), 5.minutes)
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, tenantAdmin, user),
        teams = Seq(
          defaultAdminTeam.copy(users =
            defaultAdminTeam.users ++ Set(
              UserWithPermission(user.id, TeamPermission.Administrator)
            )
          )
        ),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)

      var respTest = httpJsonCallBlocking(
        s"/api/tenants/${tenant.id.value}/admins"
      )(tenant, session)
      respTest.status mustBe 200
      var admins = fr.maif.domain.json.SeqUserFormat
        .reads((respTest.json \ "admins").as[JsArray])

      admins.isSuccess mustBe true
      admins.get.size mustBe 2
      admins.get.exists(u => u.id == user.id) mustBe true

      val resp = httpJsonCallBlocking(
        path = s"/api/tenants/${tenant.id.value}/admins/${user.id.value}",
        method = "DELETE"
      )(tenant, session)
      resp.status mustBe 200

      respTest = httpJsonCallBlocking(
        s"/api/tenants/${tenant.id.value}/admins"
      )(tenant, session)
      respTest.status mustBe 200
      admins = fr.maif.domain.json.SeqUserFormat
        .reads((respTest.json \ "admins").as[JsArray])

      admins.isSuccess mustBe true
      admins.get.size mustBe 1
      admins.get.exists(u => u.id == user.id) mustBe false
      admins.get.exists(u => u.id == tenantAdmin.id) mustBe true
    }

    "not remove an admin from a tenant if it's the last one" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, tenantAdmin, user),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/tenants/${tenant.id.value}/admins/${tenantAdmin.id.value}",
        method = "DELETE"
      )(tenant, session)
      resp.status mustBe 409
    }
  }
  "a tenant admin" can {
    "not list all full tenants" in {
      val tenant2 = tenant.copy(
        id = TenantId("tenant2"),
        name = "tenant2",
        adminApi = ApiId("api2")
      )
      setupEnvBlocking(
        tenants = Seq(tenant, tenant2),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam)
      )
      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking("/api/tenants")(tenant, session)
      resp.status mustBe 401
    }
    "list all simple tenants" in {
      val tenant2 = tenant.copy(
        id = TenantId("tenant2"),
        name = "tenant2",
        adminApi = ApiId("api2")
      )
      setupEnvBlocking(
        tenants = Seq(tenant, tenant2),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam)
      )
      val session = loginWithBlocking(tenantAdmin, tenant)
      val resp =
        httpJsonCallBlocking("/api/tenants/simplified")(tenant, session)
      resp.status mustBe 200
      val tenants =
        fr.maif.domain.json.SeqTenantFormat.reads(resp.json)
      tenants.isSuccess mustBe false

      val simpleTenants = resp.json.as[JsArray].value

      simpleTenants.length mustBe 2
      val expectedKey = Set("_id", "name", "desc", "title", "status", "style")

      simpleTenants
        .find(t => (t \ "_id").as[String] == tenant.id.value)
        .exists(t => t.as[JsObject].keys.diff(expectedKey).isEmpty) mustBe true
      simpleTenants
        .find(t => (t \ "_id").as[String] == tenant2.id.value)
        .exists(t => t.as[JsObject].keys.diff(expectedKey).isEmpty) mustBe true
    }
    "get one tenant" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam)
      )
      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp =
        httpJsonCallBlocking(s"/api/tenants/${tenant.id.value}")(
          tenant,
          session
        )
      resp.status mustBe 200
      val tenantResult =
        fr.maif.domain.json.TenantFormat.reads(resp.json)
      tenantResult.isSuccess mustBe true
      tenantResult.get.adminApi mustBe adminApi.id
    }
    "not get one tenant which he is not admin" in {
      val tenant2 = tenant.copy(
        id = TenantId("tenant2"),
        name = "tenant2",
        adminApi = ApiId("api2")
      )
      val adminTeam2 = defaultAdminTeam.copy(
        id = TeamId("team-tenant-2"),
        tenant = tenant2.id,
        users = Set.empty
      )
      setupEnvBlocking(
        tenants = Seq(tenant, tenant2),
        users = Seq(tenantAdmin, daikokuAdmin),
        teams = Seq(defaultAdminTeam, adminTeam2)
      )
      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp =
        httpJsonCallBlocking(s"/api/tenants/${tenant.id.value}")(
          tenant,
          session
        )
      resp.status mustBe 200
      val tenantResult =
        fr.maif.domain.json.TenantFormat.reads(resp.json)
      tenantResult.isSuccess mustBe true
      tenantResult.get.adminApi mustBe adminApi.id

      val resp2 =
        httpJsonCallBlocking(s"/api/tenants/${tenant2.id.value}")(
          tenant,
          session
        )
      resp2.status mustBe 403

      val dkAdminSession = loginWithBlocking(daikokuAdmin, tenant)
      val respDkAdmin = httpJsonCallBlocking(
        s"/api/tenants/${tenant2.id.value}"
      )(tenant, dkAdminSession)
      respDkAdmin.status mustBe 200
    }
    "not create tenant" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val tenantId = TenantId(IdGenerator.token(32))
      val testTenant = Tenant(
        id = tenantId,
        name = "test",
        domain = "test.foo.bar",
        defaultLanguage = None,
        style = Some(DaikokuStyle.template(tenantId)),
        mailerSettings = Some(ConsoleMailerSettings()),
        bucketSettings = None,
        authProvider = AuthProvider.Local,
        authProviderSettings = Json.obj(
          "sessionMaxAge" -> 86400
        ),
        otoroshiSettings = Set(),
        adminApi = ApiId("no-api"),
        contact = "admin@test.foo.bar"
      )

      val respCreation = httpJsonCallBlocking(
        path = s"/api/tenants",
        method = "POST",
        body = Some(testTenant.asJson)
      )(tenant, session)
      respCreation.status mustBe 401
    }
    "not delete a tenant" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val respCreation = httpJsonCallBlocking(
        path = s"/api/tenants/${tenant.id.value}",
        method = "DELETE"
      )(tenant, session)
      respCreation.status mustBe 401
    }
    "save/update a tenant" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val respUpdate = httpJsonCallBlocking(
        path = s"/api/tenants/${tenant.id.value}",
        method = "PUT",
        body = Some(tenant.copy(name = "test-again").asJson)
      )(tenant, session)
      respUpdate.status mustBe 200

      val respTest =
        httpJsonCallBlocking(s"/api/tenants/${tenant.id.value}")(
          tenant,
          session
        )
      respTest.status mustBe 200
      val tenantResult =
        fr.maif.domain.json.TenantFormat.reads(respTest.json)
      tenantResult.isSuccess mustBe true
      tenantResult.get.name mustBe "test-again"
    }
    "get tenant admins" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(
        s"/api/tenants/${tenant.id.value}/admins"
      )(tenant, session)
      resp.status mustBe 200
      val adminTeam = (resp.json \ "team").as[JsObject]
      val admins = fr.maif.domain.json.SeqUserFormat
        .reads((resp.json \ "admins").as[JsArray])

      admins.isSuccess mustBe true
      admins.get.size mustBe 1
      admins.get.exists(u => u.id == tenantAdminId) mustBe true

      (adminTeam \ "_id").as[String] mustBe defaultAdminTeam.id.value
    }
    "get addable admins for a tenant" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, tenantAdmin, user),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(
        s"/api/tenants/${tenant.id.value}/addable-admins"
      )(tenant, session)
      resp.status mustBe 200
      val addableAdmins =
        fr.maif.domain.json.SeqUserFormat.reads(resp.json)

      addableAdmins.isSuccess mustBe true
      addableAdmins.get.size mustBe 2
      addableAdmins.get.exists(u => u.id == user.id) mustBe true
      addableAdmins.get.exists(u => u.id == daikokuAdmin.id) mustBe true
    }
    "add admins to a tenant" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, tenantAdmin, user),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/api/tenants/${tenant.id.value}/admins",
        method = "POST",
        body = Some(JsArray(Seq(user.id.asJson)))
      )(tenant, session)
      resp.status mustBe 200

      val respTest = httpJsonCallBlocking(
        s"/api/tenants/${tenant.id.value}/admins"
      )(tenant, session)
      respTest.status mustBe 200
      val admins = fr.maif.domain.json.SeqUserFormat
        .reads((respTest.json \ "admins").as[JsArray])

      admins.isSuccess mustBe true
      admins.get.size mustBe 2
      admins.get.exists(u => u.id == user.id) mustBe true
    }
    "remove an admin from a tenant" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, tenantAdmin, user),
        teams = Seq(
          defaultAdminTeam.copy(users =
            defaultAdminTeam.users ++ Set(
              UserWithPermission(user.id, TeamPermission.Administrator)
            )
          )
        ),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      var respTest = httpJsonCallBlocking(
        s"/api/tenants/${tenant.id.value}/admins"
      )(tenant, session)
      respTest.status mustBe 200
      var admins = fr.maif.domain.json.SeqUserFormat
        .reads((respTest.json \ "admins").as[JsArray])

      admins.isSuccess mustBe true
      admins.get.size mustBe 2
      admins.get.exists(u => u.id == user.id) mustBe true

      val resp = httpJsonCallBlocking(
        path = s"/api/tenants/${tenant.id.value}/admins/${user.id.value}",
        method = "DELETE"
      )(tenant, session)
      resp.status mustBe 200

      respTest = httpJsonCallBlocking(
        s"/api/tenants/${tenant.id.value}/admins"
      )(tenant, session)
      respTest.status mustBe 200
      admins = fr.maif.domain.json.SeqUserFormat
        .reads((respTest.json \ "admins").as[JsArray])

      admins.isSuccess mustBe true
      admins.get.size mustBe 1
      admins.get.exists(u => u.id == user.id) mustBe false
      admins.get.exists(u => u.id == tenantAdmin.id) mustBe true
    }
    "not remove himself as admin from a tenant" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, tenantAdmin, user),
        teams = Seq(
          defaultAdminTeam.copy(users =
            defaultAdminTeam.users ++ Set(
              UserWithPermission(user.id, TeamPermission.Administrator)
            )
          )
        ),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/tenants/${tenant.id.value}/admins/${tenantAdmin.id.value}",
        method = "DELETE",
        body = Some(JsArray(Seq(user.id.asJson)))
      )(tenant, session)
      resp.status mustBe 409
    }

    "not save/update a tenant for tenant which he is not admin" in {
      val tenant2 = tenant.copy(
        id = TenantId("tenant2"),
        name = "tenant2",
        adminApi = ApiId("api2")
      )
      val adminTeam2 = defaultAdminTeam.copy(
        id = TeamId("team-tenant-2"),
        tenant = tenant2.id,
        users = Set.empty
      )
      setupEnvBlocking(
        tenants = Seq(tenant, tenant2),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam, adminTeam2),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val respUpdate = httpJsonCallBlocking(
        path = s"/api/tenants/${tenant2.id.value}",
        method = "PUT",
        body = Some(tenant2.copy(name = "test-again").asJson)
      )(tenant, session)
      respUpdate.status mustBe 403
    }
    "not get tenant admins  for tenant which he is not admin" in {
      val tenant2 = tenant.copy(
        id = TenantId("tenant2"),
        name = "tenant2",
        adminApi = ApiId("api2")
      )
      val adminTeam2 = defaultAdminTeam.copy(
        id = TeamId("team-tenant-2"),
        tenant = tenant2.id,
        users = Set.empty
      )

      setupEnvBlocking(
        tenants = Seq(tenant, tenant2),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam, adminTeam2),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(
        s"/api/tenants/${tenant2.id.value}/admins"
      )(tenant, session)
      resp.status mustBe 403
    }
    "not get addable admins  for tenant which he is not admin" in {
      val tenant2 = tenant.copy(
        id = TenantId("tenant2"),
        name = "tenant2",
        adminApi = ApiId("api2")
      )
      val adminTeam2 = defaultAdminTeam.copy(
        id = TeamId("team-tenant-2"),
        tenant = tenant2.id,
        users = Set.empty
      )

      setupEnvBlocking(
        tenants = Seq(tenant, tenant2),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam, adminTeam2),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(
        s"/api/tenants/${tenant2.id.value}/addable-admins"
      )(tenant, session)
      resp.status mustBe 403
    }
    "not add admins to tenant which he is not admin" in {
      val tenant2 = tenant.copy(
        id = TenantId("tenant2"),
        name = "tenant2",
        adminApi = ApiId("api2")
      )
      val adminTeam2 = defaultAdminTeam.copy(
        id = TeamId("team-tenant-2"),
        tenant = tenant2.id,
        users = Set.empty
      )

      setupEnvBlocking(
        tenants = Seq(tenant, tenant2),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam, adminTeam2),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/api/tenants/${tenant2.id.value}/admins",
        method = "POST",
        body = Some(JsArray(Seq(user.id.asJson)))
      )(tenant, session)
      resp.status mustBe 403
    }
    "not remove an admin  from tenant which he is not admin" in {
      val tenant2 = tenant.copy(
        id = TenantId("tenant2"),
        name = "tenant2",
        adminApi = ApiId("api2")
      )
      val adminTeam2 = defaultAdminTeam.copy(
        id = TeamId("team-tenant-2"),
        tenant = tenant2.id,
        users = Set.empty
      )

      setupEnvBlocking(
        tenants = Seq(tenant, tenant2),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam, adminTeam2),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val respTest = httpJsonCallBlocking(
        s"/api/tenants/${tenant2.id.value}/admins"
      )(tenant, session)
      respTest.status mustBe 403
    }

    "create/get one or all otoroshi instance" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, tenantAdmin, user),
        teams = Seq(
          defaultAdminTeam.copy(users =
            defaultAdminTeam.users ++ Set(
              UserWithPermission(user.id, TeamPermission.Administrator)
            )
          )
        ),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)
      val otoroshiSettings = OtoroshiSettings(
        id = OtoroshiSettingsId("id"),
        url = "url",
        host = "host"
      )

      var respGet = httpJsonCallBlocking(
        s"/api/tenants/${tenant.id.value}/otoroshis"
      )(tenant, session)
      respGet.status mustBe 200
      var otos = fr.maif.domain.json.SeqOtoroshiSettingsFormat
        .reads(respGet.json)
      otos.isSuccess mustBe true
      otos.get.size mustBe 2 // wiremock && fakotoroshi

      val resp = httpJsonCallBlocking(
        path = s"/api/tenants/${tenant.id.value}/otoroshis?skipValidation=true",
        method = "POST",
        body = Some(otoroshiSettings.asJson)
      )(tenant, session)

      resp.status mustBe 201

      respGet = httpJsonCallBlocking(
        s"/api/tenants/${tenant.id.value}/otoroshis"
      )(tenant, session)
      respGet.status mustBe 200
      otos = fr.maif.domain.json.SeqOtoroshiSettingsFormat
        .reads(respGet.json)
      otos.isSuccess mustBe true
      otos.get.size mustBe 3

      respGet = httpJsonCallBlocking(
        s"/api/tenants/${tenant.id.value}/otoroshis/${otoroshiSettings.id.value}"
      )(tenant, session)
      respGet.status mustBe 200
      val oto = fr.maif.domain.json.OtoroshiSettingsFormat
        .reads(respGet.json)
      oto.isSuccess mustBe true
      oto.get mustBe otoroshiSettings

    }
    "update otoroshi instance" in {
      val otoroshiSettings = OtoroshiSettings(
        id = OtoroshiSettingsId("test-id"),
        url = "url",
        host = "host"
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            otoroshiSettings = tenant.otoroshiSettings ++ Set(otoroshiSettings)
          )
        ),
        users = Seq(daikokuAdmin, tenantAdmin, user),
        teams = Seq(
          defaultAdminTeam.copy(users =
            defaultAdminTeam.users ++ Set(
              UserWithPermission(user.id, TeamPermission.Administrator)
            )
          )
        ),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/tenants/${tenant.id.value}/otoroshis/${otoroshiSettings.id.value}?skipValidation=true",
        method = "PUT",
        body = Some(otoroshiSettings.copy(url = "new-url").asJson)
      )(tenant, session)
      resp.status mustBe 200
      var oto = fr.maif.domain.json.OtoroshiSettingsFormat
        .reads(resp.json)
      oto.isSuccess mustBe true
      oto.get.url mustBe "new-url"

      val respGet = httpJsonCallBlocking(
        s"/api/tenants/${tenant.id.value}/otoroshis/${otoroshiSettings.id.value}"
      )(tenant, session)
      respGet.status mustBe 200
      oto = fr.maif.domain.json.OtoroshiSettingsFormat
        .reads(respGet.json)
      oto.isSuccess mustBe true
      oto.get.url mustBe "new-url"
    }
    "delete otoroshi instance" in {
      val otoroshiSettings = OtoroshiSettings(
        id = OtoroshiSettingsId("test-id"),
        url = "url",
        host = "host"
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            otoroshiSettings = tenant.otoroshiSettings ++ Set(otoroshiSettings)
          )
        ),
        users = Seq(daikokuAdmin, tenantAdmin, user),
        teams = Seq(
          defaultAdminTeam.copy(users =
            defaultAdminTeam.users ++ Set(
              UserWithPermission(user.id, TeamPermission.Administrator)
            )
          )
        ),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      var respGet = httpJsonCallBlocking(
        s"/api/tenants/${tenant.id.value}/otoroshis"
      )(tenant, session)
      respGet.status mustBe 200
      var otos = fr.maif.domain.json.SeqOtoroshiSettingsFormat
        .reads(respGet.json)
      otos.isSuccess mustBe true
      otos.get.size mustBe 3 // wiremock && fakotoroshi && test

      val resp = httpJsonCallBlocking(
        path =
          s"/api/tenants/${tenant.id.value}/otoroshis/${otoroshiSettings.id.value}",
        method = "DELETE"
      )(tenant, session)
      resp.status mustBe 200

      respGet = httpJsonCallBlocking(
        s"/api/tenants/${tenant.id.value}/otoroshis"
      )(tenant, session)
      respGet.status mustBe 200
      otos = fr.maif.domain.json.SeqOtoroshiSettingsFormat
        .reads(respGet.json)
      otos.isSuccess mustBe true
      otos.get.size mustBe 2 // wiremock && fakotoroshi && test
    }

    "read audi trail" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, tenantAdmin, user),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(s"/api/admin/auditTrail")(tenant, session)
      resp.status mustBe 200
    }
    "get the production content of a cms page by id" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        cmsPages = Seq(defaultCmsPage),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/cms/pages/${defaultCmsPage.id.value}",
        headers = Map("accept" -> "text/html")
      )(tenant, session)

      resp.status mustBe 200
      logger.warn(resp.body[String])
      resp.body[String] mustBe "<h1>production content</h1>"
    }
    "get the production content of a cms page by path" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        cmsPages = Seq(defaultCmsPage),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/_${defaultCmsPage.path.get}",
        headers = Map("accept" -> "text/html")
      )(tenant, session)

      resp.status mustBe 200
      resp.body[String] mustBe defaultCmsPage.body
    }
    "navigate to an unknown cms page" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/_${defaultCmsPage.path.get}",
        headers = Map("accept" -> "text/html")
      )(tenant, session)

      resp.status mustBe 404
    }
    "navigate to an unknown cms page with the 404 cms page defined" in {
      val notFoundPage =
        defaultCmsPage.copy(name = "404 page", id = CmsPageId("404_page_id"))

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(style =
            Some(
              tenant.style.get
                .copy(notFoundCmsPage = Some(notFoundPage.id.value))
            )
          )
        ),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam),
        cmsPages = Seq(notFoundPage),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/_${defaultCmsPage.path.get}",
        headers = Map("accept" -> "text/html")
      )(tenant, session)

      resp.status mustBe 200
      resp.body[String] mustBe notFoundPage.body
    }
    "navigate to a cms page with only exact path" in {
      val page = defaultCmsPage.copy(path = Some("/home"), exact = true)

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam),
        cmsPages = Seq(page),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      var resp = httpJsonCallBlocking(
        path = s"/_${page.path.get}",
        headers = Map("accept" -> "text/html")
      )(tenant, session)

      resp.status mustBe 200

      resp = httpJsonCallBlocking(
        path = s"/_${page.path.get}/foo",
        headers = Map("accept" -> "text/html")
      )(tenant, session)

      resp.status mustBe 404
    }
    "get the query params from cms page" in {
      val page = defaultCmsPage.copy(
        id = CmsPageId("query-params"),
        path = Some("/test"),
        body = "{{daikoku-query-param 'foo'}}-{{daikoku-query-param 'bar'}}"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam),
        cmsPages = Seq(page),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/_${page.path.get}?bar=foo&foo=bar",
        headers = Map("accept" -> "text/html")
      )(tenant, session)

      resp.status mustBe 200
      resp.body[String] mustBe "bar-foo"
    }
    "validate size helper" in {
      val page = defaultCmsPage.copy(
        id = CmsPageId("size-helper"),
        path = Some("/size"),
        body = "{{size '[{ \"foo\": \"bar\" }, { \"foo\": \"bar\" }]'}}"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam),
        cmsPages = Seq(page),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/_${page.path.get}",
        headers = Map("accept" -> "text/html")
      )(tenant, session)

      resp.status mustBe 200
      resp.body[String] mustBe "2"
    }
    "validate ifeq helper" in {
      val page = defaultCmsPage.copy(
        id = CmsPageId("ifeq-helper"),
        path = Some("/ifeq"),
        body = "{{#ifeq 'foo' 'foo'}}foobar{{/ifeq}}"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam),
        cmsPages = Seq(page),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/_${page.path.get}",
        headers = Map("accept" -> "text/html")
      )(tenant, session)

      resp.status mustBe 200
      resp.body[String] mustBe "foobar"
    }
    "validate ifnoteq helper" in {
      val page = defaultCmsPage.copy(
        id = CmsPageId("ifnoteq-helper"),
        path = Some("/ifnoteq"),
        body = "{{#ifnoteq 'foo' 'bar'}}foobar{{/ifnoteq}}"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam),
        cmsPages = Seq(page),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/_${page.path.get}",
        headers = Map("accept" -> "text/html")
      )(tenant, session)

      resp.status mustBe 200
      resp.body[String] mustBe "foobar"
    }
    "validate getOrElse helper" in {
      val page = defaultCmsPage.copy(
        id = CmsPageId("getOrElse-helper"),
        path = Some("/getOrElse"),
        body = "{{getOrElse '' 'foobar'}}"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam),
        cmsPages = Seq(page),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/_${page.path.get}",
        headers = Map("accept" -> "text/html")
      )(tenant, session)

      resp.status mustBe 200
      resp.body[String] mustBe "foobar"
    }
    "validate daikoku-include-block helper" in {
      val page = defaultCmsPage.copy(
        id = CmsPageId("daikoku-include-block-helper"),
        path = Some("/daikoku-include-block"),
        body = s"{{daikoku-include-block '${defaultCmsPage.id.value}'}}"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam),
        cmsPages = Seq(defaultCmsPage, page),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/_${page.path.get}",
        headers = Map("accept" -> "text/html")
      )(tenant, session)

      resp.status mustBe 200
      resp.body[String] mustBe defaultCmsPage.body
    }
    "validate daikoku-template-wrapper helper" in {
      val wrapper = defaultCmsPage.copy(
        id = CmsPageId("wrapper page"),
        path = Some("/wrapper"),
        body = "<div><h1>Wrapper</h1>{{children}}</div>"
      )
      val page = defaultCmsPage.copy(
        id = CmsPageId("daikoku-templat-wrapper-helper"),
        path = Some("/daikoku-template-wrapper"),
        body =
          s"{{#daikoku-template-wrapper '${wrapper.id.value}'}}{{daikoku-include-block '${defaultCmsPage.id.value}'}}{{/daikoku-template-wrapper}}"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam),
        cmsPages = Seq(defaultCmsPage, wrapper, page),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/_${page.path.get}",
        headers = Map("accept" -> "text/html")
      )(tenant, session)

      resp.status mustBe 200
      resp.body[String] mustBe s"""<div><h1>Wrapper</h1>${defaultCmsPage.body}</div>"""
    }
    "validate daikoku-apis helper" in {
      val page = defaultCmsPage.copy(
        id = CmsPageId("daikoku-apis-helper"),
        path = Some("/daikoku-apis"),
        body = s"{{#daikoku-apis}}{{api.name}}{{/daikoku-apis}}"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam),
        cmsPages = Seq(page),
        usagePlans = defaultApi.plans :+ adminApiPlan,
        apis = Seq(adminApi, defaultApi.api)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/_${page.path.get}",
        headers = Map("accept" -> "text/html")
      )(tenant, session)

      resp.status mustBe 200
      assert(
        resp.body == s"${defaultApi.api.name}\n${adminApi.name}" || resp.body == s"${adminApi.name}\n${defaultApi.api.name}"
      )
    }
    "validate daikoku-json-apis helper" in {
      val page = defaultCmsPage.copy(
        id = CmsPageId("daikoku-json-apis-helper"),
        path = Some("/daikoku-json-apis"),
        body = s"{{daikoku-json-apis}}"
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam),
        cmsPages = Seq(page),
        usagePlans = defaultApi.plans :+ adminApiPlan,
        apis = Seq(adminApi, defaultApi.api)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/_${page.path.get}"
      )(tenant, session)

      resp.status mustBe 200

      Json.parse(resp.body[String]).as[JsArray].value.size mustBe 2
    }
    "validate daikoku-plans helper" in {
      val page = defaultCmsPage.copy(
        id = CmsPageId("daikoku-plans-helper"),
        path = Some("/daikoku-plans"),
        body =
          s"""{{#daikoku-plans "${defaultApi.api.id.value}"}}{{plan._id}}{{/daikoku-plans}}"""
      )
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin),
        teams = Seq(defaultAdminTeam),
        cmsPages = Seq(page),
        usagePlans = defaultApi.plans,
        apis = Seq(defaultApi.api)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/_${page.path.get}",
        headers = Map("accept" -> "text/html")
      )(tenant, session)

      resp.status mustBe 200
      resp.body[String] mustBe s"${defaultApi.plans.map(_.id.value).mkString("\n")}"
    }

    "setup defaut authorized otoroshi entities for future created teams" in {
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
        users = Seq(tenantAdmin, user),
        teams = Seq(defaultAdminTeam)
      )

      val adminSession = loginWithBlocking(tenantAdmin, tenant)
      val newDefaultAuthEntities = Seq(
        TeamAuthorizedEntities(
          otoroshiSettingsId = containerizedOtoroshi,
          authorizedEntities = AuthorizedEntities(
            groups = Set(OtoroshiServiceGroupId(serviceGroupDev))
          )
        )
      ).some
      val updateTenantResp = httpJsonCallBlocking(
        path = s"/api/tenants/${tenant.id.value}",
        method = "PUT",
        body = tenant
          .copy(defaultAuthorizedOtoroshiEntities = newDefaultAuthEntities)
          .asJson
          .some
      )(tenant, adminSession)

      updateTenantResp.status mustBe 200

      val userSession = loginWithBlocking(user, tenant)
      val newTeam = Team(
        id = TeamId("new-team"),
        tenant = tenant.id,
        `type` = TeamType.Organization,
        name = "foo team",
        description = "description",
        contact = "contact@foo.bar",
        avatar = None,
        users = Set(
          UserWithPermission(userId = user.id, teamPermission = Administrator)
        ),
        verified = true
      )
      val createNewTeamResp = httpJsonCallBlocking(
        path = "/api/teams",
        method = "POST",
        body = newTeam.asJson.some
      )(tenant, userSession)
      createNewTeamResp.status mustBe 201

      val controlTeamResp = httpJsonCallBlocking(
        path = s"/api/teams/${newTeam.id.value}"
      )(tenant, userSession)
      controlTeamResp.status mustBe 200
      val controlTeam = Json.parse(controlTeamResp.body[String]).as(json.TeamFormat)

      controlTeam.authorizedOtoroshiEntities.isDefined mustBe true
      controlTeam.authorizedOtoroshiEntities mustBe newDefaultAuthEntities
    }

    "setup defaut authorized otoroshi entities and merge it" in {
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
        users = Seq(tenantAdmin, user),
        teams = Seq(
          defaultAdminTeam,
          teamConsumer,
          teamOwner.copy(authorizedOtoroshiEntities =
            Seq(
              TeamAuthorizedEntities(
                otoroshiSettingsId = containerizedOtoroshi,
                authorizedEntities = AuthorizedEntities(
                  groups = Set(OtoroshiServiceGroupId(serviceGroupDefault))
                )
              ),
              TeamAuthorizedEntities(
                otoroshiSettingsId = OtoroshiSettingsId("default"),
                authorizedEntities = AuthorizedEntities(
                  groups = Set(OtoroshiServiceGroupId("foo")),
                  routes = Set(OtoroshiRouteId("bar"))
                )
              )
            ).some
          )
        )
      )

      val adminSession = loginWithBlocking(tenantAdmin, tenant)
      val updateTenantResp = httpJsonCallBlocking(
        path = s"/api/tenants/${tenant.id.value}",
        method = "PUT",
        body = tenant
          .copy(defaultAuthorizedOtoroshiEntities =
            Seq(
              TeamAuthorizedEntities(
                otoroshiSettingsId = containerizedOtoroshi,
                authorizedEntities = AuthorizedEntities(
                  groups = Set(OtoroshiServiceGroupId(serviceGroupDev))
                )
              )
            ).some
          )
          .asJson
          .some
      )(tenant, adminSession)
      updateTenantResp.status mustBe 200
      val dispatchResp = httpJsonCallBlocking(
        path =
          s"/api/tenants/${tenant.id.value}/_dispatch-default-authorized-entities",
        method = "POST",
        body = Json.obj("mode" -> "merge").some
      )(tenant, adminSession)
      dispatchResp.status mustBe 204

      val controlConsumerTeamResp = httpJsonCallBlocking(
        s"/api/teams/${teamConsumerId.value}"
      )(tenant, adminSession)
      val controlConsumerTeam =
        Json.parse(controlConsumerTeamResp.body[String]).as(json.TeamFormat)
      controlConsumerTeam.authorizedOtoroshiEntities.isDefined mustBe true
      controlConsumerTeam.authorizedOtoroshiEntities
        .map(_.length)
        .getOrElse(0) mustBe 1
      val consumerContainerizedAuthorizedEntities =
        controlConsumerTeam.authorizedOtoroshiEntities.flatMap(
          _.find(o => o.otoroshiSettingsId == containerizedOtoroshi)
        )
      consumerContainerizedAuthorizedEntities
        .map(_.authorizedEntities.groups.size)
        .getOrElse(0) mustBe 1
      consumerContainerizedAuthorizedEntities
        .map(_.authorizedEntities.routes.size)
        .getOrElse(0) mustBe 0
      consumerContainerizedAuthorizedEntities
        .map(_.authorizedEntities.services.size)
        .getOrElse(0) mustBe 0

      val controlOwnerTeamResp = httpJsonCallBlocking(
        s"/api/teams/${teamOwnerId.value}"
      )(tenant, adminSession)

      val controlOwnerTeam =
        Json.parse(controlOwnerTeamResp.body[String]).as(json.TeamFormat)
      controlOwnerTeam.authorizedOtoroshiEntities.isDefined mustBe true
      controlOwnerTeam.authorizedOtoroshiEntities
        .map(_.length)
        .getOrElse(0) mustBe 2

      val ownerContainerizedAuthorizedEntities =
        controlOwnerTeam.authorizedOtoroshiEntities.flatMap(
          _.find(o => o.otoroshiSettingsId == containerizedOtoroshi)
        )

      ownerContainerizedAuthorizedEntities
        .map(_.authorizedEntities.groups.size)
        .getOrElse(0) mustBe 2
      ownerContainerizedAuthorizedEntities
        .map(_.authorizedEntities.routes.size)
        .getOrElse(0) mustBe 0
      ownerContainerizedAuthorizedEntities
        .map(_.authorizedEntities.services.size)
        .getOrElse(0) mustBe 0
      val ownerLocalAuthorizedEntities =
        controlOwnerTeam.authorizedOtoroshiEntities.flatMap(
          _.find(o => o.otoroshiSettingsId == OtoroshiSettingsId("default"))
        )
      ownerLocalAuthorizedEntities
        .map(_.authorizedEntities.groups.size)
        .getOrElse(0) mustBe 1
      ownerLocalAuthorizedEntities
        .map(_.authorizedEntities.routes.size)
        .getOrElse(0) mustBe 1
      ownerLocalAuthorizedEntities
        .map(_.authorizedEntities.services.size)
        .getOrElse(0) mustBe 0

    }

    "setup defaut authorized otoroshi entities and replace it" in {
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
        users = Seq(tenantAdmin, user),
        teams = Seq(
          defaultAdminTeam,
          teamConsumer,
          teamOwner.copy(authorizedOtoroshiEntities =
            Seq(
              TeamAuthorizedEntities(
                otoroshiSettingsId = containerizedOtoroshi,
                authorizedEntities = AuthorizedEntities(
                  groups = Set(OtoroshiServiceGroupId(serviceGroupDefault))
                )
              ),
              TeamAuthorizedEntities(
                otoroshiSettingsId = OtoroshiSettingsId("default"),
                authorizedEntities = AuthorizedEntities(
                  groups = Set(OtoroshiServiceGroupId("foo")),
                  routes = Set(OtoroshiRouteId("bar"))
                )
              )
            ).some
          )
        )
      )

      val adminSession = loginWithBlocking(tenantAdmin, tenant)
      val updateTenantResp = httpJsonCallBlocking(
        path = s"/api/tenants/${tenant.id.value}",
        method = "PUT",
        body = tenant
          .copy(defaultAuthorizedOtoroshiEntities =
            Seq(
              TeamAuthorizedEntities(
                otoroshiSettingsId = containerizedOtoroshi,
                authorizedEntities = AuthorizedEntities(
                  groups = Set(OtoroshiServiceGroupId(serviceGroupDev))
                )
              )
            ).some
          )
          .asJson
          .some
      )(tenant, adminSession)
      updateTenantResp.status mustBe 200
      val dispatchResp = httpJsonCallBlocking(
        path =
          s"/api/tenants/${tenant.id.value}/_dispatch-default-authorized-entities",
        method = "POST",
        body = Json.obj("mode" -> "replace").some
      )(tenant, adminSession)
      dispatchResp.status mustBe 204

      val controlConsumerTeamResp = httpJsonCallBlocking(
        s"/api/teams/${teamConsumerId.value}"
      )(tenant, adminSession)
      val controlConsumerTeam =
        Json.parse(controlConsumerTeamResp.body[String]).as(json.TeamFormat)
      controlConsumerTeam.authorizedOtoroshiEntities.isDefined mustBe true
      controlConsumerTeam.authorizedOtoroshiEntities
        .map(_.length)
        .getOrElse(0) mustBe 1
      val consumerContainerizedAuthorizedEntities =
        controlConsumerTeam.authorizedOtoroshiEntities.flatMap(
          _.find(o => o.otoroshiSettingsId == containerizedOtoroshi)
        )
      consumerContainerizedAuthorizedEntities
        .map(_.authorizedEntities.groups.size)
        .getOrElse(0) mustBe 1
      consumerContainerizedAuthorizedEntities
        .map(_.authorizedEntities.routes.size)
        .getOrElse(0) mustBe 0
      consumerContainerizedAuthorizedEntities
        .map(_.authorizedEntities.services.size)
        .getOrElse(0) mustBe 0

      val controlOwnerTeamResp = httpJsonCallBlocking(
        s"/api/teams/${teamOwnerId.value}"
      )(tenant, adminSession)

      val controlOwnerTeam =
        Json.parse(controlOwnerTeamResp.body[String]).as(json.TeamFormat)
      controlOwnerTeam.authorizedOtoroshiEntities.isDefined mustBe true
      controlOwnerTeam.authorizedOtoroshiEntities
        .map(_.length)
        .getOrElse(0) mustBe 1

      val ownerContainerizedAuthorizedEntities =
        controlOwnerTeam.authorizedOtoroshiEntities.flatMap(
          _.find(o => o.otoroshiSettingsId == containerizedOtoroshi)
        )
      ownerContainerizedAuthorizedEntities
        .map(_.authorizedEntities.groups.size)
        .getOrElse(0) mustBe 1
      ownerContainerizedAuthorizedEntities
        .map(_.authorizedEntities.routes.size)
        .getOrElse(0) mustBe 0
      ownerContainerizedAuthorizedEntities
        .map(_.authorizedEntities.services.size)
        .getOrElse(0) mustBe 0
      val ownerLocalAuthorizedEntities =
        controlOwnerTeam.authorizedOtoroshiEntities.flatMap(
          _.find(o => o.otoroshiSettingsId == OtoroshiSettingsId("default"))
        )
      ownerLocalAuthorizedEntities
        .map(_.authorizedEntities.groups.size)
        .getOrElse(0) mustBe 0
      ownerLocalAuthorizedEntities
        .map(_.authorizedEntities.routes.size)
        .getOrElse(0) mustBe 0
      ownerLocalAuthorizedEntities
        .map(_.authorizedEntities.services.size)
        .getOrElse(0) mustBe 0

    }
  }
  "a simple user" can {
    "not list all full tenants" in {
      val tenant2 = tenant.copy(
        id = TenantId("tenant2"),
        name = "tenant2",
        adminApi = ApiId("api2")
      )
      setupEnvBlocking(
        tenants = Seq(tenant, tenant2),
        users = Seq(user),
        teams = Seq(defaultAdminTeam)
      )
      val session = loginWithBlocking(user, tenant)

      val resp = httpJsonCallBlocking("/api/tenants")(tenant, session)
      resp.status mustBe 401
    }
    "list all simple tenants" in {
      val tenant2 = tenant.copy(
        id = TenantId("tenant2"),
        name = "tenant2",
        adminApi = ApiId("api2")
      )
      setupEnvBlocking(
        tenants = Seq(tenant, tenant2),
        users = Seq(user),
        teams = Seq(defaultAdminTeam)
      )
      val session = loginWithBlocking(user, tenant)
      val resp =
        httpJsonCallBlocking("/api/tenants/simplified")(tenant, session)
      resp.status mustBe 200
      val tenants =
        fr.maif.domain.json.SeqTenantFormat.reads(resp.json)
      tenants.isSuccess mustBe false

      val simpleTenants = resp.json.as[JsArray].value

      simpleTenants.length mustBe 2
      val expectedKey = Set("_id", "name", "desc", "title", "status", "style")

      simpleTenants
        .find(t => (t \ "_id").as[String] == tenant.id.value)
        .exists(t => t.as[JsObject].keys.diff(expectedKey).isEmpty) mustBe true
      simpleTenants
        .find(t => (t \ "_id").as[String] == tenant2.id.value)
        .exists(t => t.as[JsObject].keys.diff(expectedKey).isEmpty) mustBe true
    }
    "not get one tenant" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(defaultAdminTeam)
      )
      val session = loginWithBlocking(user, tenant)

      val resp =
        httpJsonCallBlocking(s"/api/tenants/${tenant.id.value}")(
          tenant,
          session
        )
      resp.status mustBe 403
    }
    "not create tenant" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(defaultAdminTeam)
      )

      val session = loginWithBlocking(user, tenant)

      val tenantId = TenantId(IdGenerator.token(32))
      val testTenant = Tenant(
        id = tenantId,
        name = "test",
        domain = "test.foo.bar",
        defaultLanguage = None,
        style = Some(DaikokuStyle.template(tenantId)),
        mailerSettings = Some(ConsoleMailerSettings()),
        bucketSettings = None,
        authProvider = AuthProvider.Local,
        authProviderSettings = Json.obj(
          "sessionMaxAge" -> 86400
        ),
        otoroshiSettings = Set(),
        adminApi = ApiId("no-api"),
        contact = "admin@test.foo.bar"
      )

      val respCreation = httpJsonCallBlocking(
        path = s"/api/tenants",
        method = "POST",
        body = Some(testTenant.asJson)
      )(tenant, session)
      respCreation.status mustBe 401
    }
    "not delete a tenant" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(user, tenant)

      val respCreation = httpJsonCallBlocking(
        path = s"/api/tenants/${tenant.id.value}",
        method = "DELETE"
      )(tenant, session)
      respCreation.status mustBe 401
    }
    "not save/update a tenant" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(user),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(user, tenant)

      val respUpdate = httpJsonCallBlocking(
        path = s"/api/tenants/${tenant.id.value}",
        method = "PUT",
        body = Some(tenant.copy(name = "test-again").asJson)
      )(tenant, session)
      respUpdate.status mustBe 403
    }
    "not get tenant admins" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin, user),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(user, tenant)

      val resp = httpJsonCallBlocking(
        s"/api/tenants/${tenant.id.value}/admins"
      )(tenant, session)
      resp.status mustBe 403
    }
    "not get addable admins for a tenant" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, tenantAdmin, user),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(user, tenant)

      val resp = httpJsonCallBlocking(
        s"/api/tenants/${tenant.id.value}/addable-admins"
      )(tenant, session)
      resp.status mustBe 403
    }
    "not add admins to a tenant" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, tenantAdmin, user),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(user, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/api/tenants/${tenant.id.value}/admins",
        method = "POST",
        body = Some(JsArray(Seq(user.id.asJson)))
      )(tenant, session)
      resp.status mustBe 403
    }
    "not remove an admin from a tenant" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, tenantAdmin, user, userApiEditor),
        teams = Seq(
          defaultAdminTeam.copy(users =
            defaultAdminTeam.users ++ Set(
              UserWithPermission(userApiEditor.id, TeamPermission.Administrator)
            )
          )
        ),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(user, tenant)

      val resp = httpJsonCallBlocking(
        path = s"/api/tenants/${tenant.id.value}/admins/${user.id.value}",
        method = "DELETE",
        body = Some(JsArray(Seq(user.id.asJson)))
      )(tenant, session)
      resp.status mustBe 403
    }

    "not create/get one or all otoroshi instance" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, tenantAdmin, user),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(user, tenant)
      val otoroshiSettings = OtoroshiSettings(
        id = OtoroshiSettingsId("id"),
        url = "url",
        host = "host"
      )

      var respGet = httpJsonCallBlocking(
        s"/api/tenants/${tenant.id.value}/otoroshis"
      )(tenant, session)
      respGet.status mustBe 403

      val resp = httpJsonCallBlocking(
        path = s"/api/tenants/${tenant.id.value}/otoroshis",
        method = "POST",
        body = Some(otoroshiSettings.asJson)
      )(tenant, session)

      resp.status mustBe 403

      respGet = httpJsonCallBlocking(
        s"/api/tenants/${tenant.id.value}/otoroshis/${otoroshiSettings.id.value}"
      )(tenant, session)
      respGet.status mustBe 403

    }
    "not update otoroshi instance" in {
      val otoroshiSettings = OtoroshiSettings(
        id = OtoroshiSettingsId("test-id"),
        url = "url",
        host = "host"
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            otoroshiSettings = tenant.otoroshiSettings ++ Set(otoroshiSettings)
          )
        ),
        users = Seq(daikokuAdmin, tenantAdmin, user),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/tenants/${tenant.id.value}/otoroshis/${otoroshiSettings.id.value}",
        method = "PUT",
        body = Some(otoroshiSettings.copy(url = "new-url").asJson)
      )(tenant, session)
      resp.status mustBe 403
    }
    "not delete otoroshi instance" in {
      val otoroshiSettings = OtoroshiSettings(
        id = OtoroshiSettingsId("test-id"),
        url = "url",
        host = "host"
      )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            otoroshiSettings = tenant.otoroshiSettings ++ Set(otoroshiSettings)
          )
        ),
        users = Seq(daikokuAdmin, tenantAdmin, user),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(user, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/tenants/${tenant.id.value}/otoroshis/${otoroshiSettings.id.value}",
        method = "DELETE"
      )(tenant, session)
      resp.status mustBe 403
    }

    "not read audi trail" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, tenantAdmin, user),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(user, tenant)

      val resp = httpJsonCallBlocking(s"/api/admin/auditTrail")(tenant, session)
      resp.status mustBe 403
    }
  }
}
