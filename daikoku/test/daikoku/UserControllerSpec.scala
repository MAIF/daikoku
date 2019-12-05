package fr.maif.otoroshi.daikoku.tests

import com.typesafe.config.ConfigFactory
import fr.maif.otoroshi.daikoku.tests.utils.{DaikokuSpecHelper, OneServerPerSuiteWithMyComponents}
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import play.api.Configuration

import scala.util.Random

class UserControllerSpec(configurationSpec: => Configuration)
    extends PlaySpec
    with OneServerPerSuiteWithMyComponents
    with DaikokuSpecHelper
    with IntegrationPatience {

  override def getConfiguration(configuration: Configuration) = configuration ++ configurationSpec ++ Configuration(
    ConfigFactory.parseString(s"""
									 |{
									 |  http.port=$port
									 |  play.server.http.port=$port
									 |}
     """.stripMargin).resolve()
  )

  "a daikoku admin" can {
    "list all tenant user" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, user, userAdmin),
        teams = Seq()
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)

      val resp = httpJsonCallBlocking("/api/admin/users")(tenant, session)
      resp.status mustBe 200
      val teams = fr.maif.otoroshi.daikoku.domain.json.SeqUserFormat.reads(resp.json)
      teams.isSuccess mustBe true
      teams.get.length mustBe 3
      teams.get.diff(Seq(daikokuAdmin, user, userAdmin)) mustBe Seq.empty
    }

    "find user by id" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, user, userAdmin),
        teams = Seq()
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)

      val resp = httpJsonCallBlocking(s"/api/admin/users/${userTeamUserId.value}")(tenant, session)
      resp.status mustBe 200
      val eventualUser = fr.maif.otoroshi.daikoku.domain.json.UserFormat.reads(resp.json)
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
      val respUpdate = httpJsonCallBlocking(path = s"/api/admin/users/${userTeamUserId.value}",
                                            method = "PUT",
                                            body = Some(user.copy(name = "test").asJson))(tenant, session)
      respUpdate.status mustBe 200

      val resp = httpJsonCallBlocking(s"/api/admin/users/${userTeamUserId.value}")(tenant, session)
      resp.status mustBe 200
      val eventualUser = fr.maif.otoroshi.daikoku.domain.json.UserFormat.reads(resp.json)
      eventualUser.isSuccess mustBe true
      eventualUser.get.name mustBe "test"
    }

    "delete user" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, user, userAdmin),
        teams = Seq()
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val respUpdate =
        httpJsonCallBlocking(path = s"/api/admin/users/${userTeamUserId.value}", method = "DELETE")(tenant, session)
      respUpdate.status mustBe 200

      val resp = httpJsonCallBlocking(s"/api/admin/users/${userTeamUserId.value}")(tenant, session)
      resp.status mustBe 404
    }

    "create user" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq()
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)
      val respCreate =
        httpJsonCallBlocking(path = s"/api/admin/users", method = "POST", body = Some(user.asJson))(tenant, session)
      respCreate.status mustBe 201

      val resp = httpJsonCallBlocking(s"/api/admin/users/${userTeamUserId.value}")(tenant, session)
      resp.status mustBe 200

      val respReCreate =
        httpJsonCallBlocking(path = s"/api/admin/users", method = "POST", body = Some(user.asJson))(tenant, session)
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
        httpJsonCallBlocking(s"/api/admin/users/${userTeamUserId.value}/_impersonate")(tenant, session)
      resp.status mustBe 303
	  //todo: test it
    }
  }

  "a teamAdmin, ApiEditor or user" can {
    val randomUser = Random.shuffle(Seq(user, userApiEditor, userAdmin)).head

    "not list all tenant users" in {
		setupEnvBlocking(
			tenants = Seq(tenant),
			users = Seq(randomUser),
			teams = Seq()
		)
		val session = loginWithBlocking(randomUser, tenant)

		val resp = httpJsonCallBlocking("/api/admin/users")(tenant, session)
		resp.status mustBe 401
	}

    "not find user by id" in {
		setupEnvBlocking(
			tenants = Seq(tenant),
			users = Seq(daikokuAdmin, randomUser),
			teams = Seq()
		)
		val session = loginWithBlocking(randomUser, tenant)

		val resp = httpJsonCallBlocking(s"/api/admin/users/${daikokuAdmin.id.value}")(tenant, session)
		resp.status mustBe 401
	}

    "not update user" in {
		setupEnvBlocking(
			tenants = Seq(tenant),
			users = Seq(daikokuAdmin, randomUser),
			teams = Seq()
		)
	  val userNotRandomUser = Seq(userAdmin, userApiEditor, user).diff(Seq(randomUser)).head
		val session = loginWithBlocking(randomUser, tenant)
		val respUpdate = httpJsonCallBlocking(path = s"/api/admin/users/${daikokuAdmin.id.value}",
			method = "PUT",
			body = Some(userNotRandomUser.copy(name = "test").asJson))(tenant, session)
		respUpdate.status mustBe 401
	}

    "update self" in {
		setupEnvBlocking(
			tenants = Seq(tenant),
			users = Seq(daikokuAdmin, randomUser)
		)
		val session = loginWithBlocking(randomUser, tenant)
		val respUpdate = httpJsonCallBlocking(path = s"/api/admin/users/${randomUser.id.value}",
			method = "PUT",
			body = Some(randomUser.copy(name = "test").asJson))(tenant, session)
		respUpdate.status mustBe 200

		val resp = httpJsonCallBlocking(path = s"/api/me")(tenant, session)
		resp.status mustBe 200
		val eventualUser = fr.maif.otoroshi.daikoku.domain.json.UserFormat.reads(resp.json)
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
			httpJsonCallBlocking(path = s"/api/admin/users/${daikokuAdmin.id.value}", method = "DELETE")(tenant, session)
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
			httpJsonCallBlocking(path = s"/api/admin/users/${randomUser.id.value}", method = "DELETE")(tenant, session)
		respDelete.status mustBe 401

		val respDelete2 =
			httpJsonCallBlocking(path = s"/api/me", method = "DELETE")(tenant, session)
		respDelete2.status mustBe 200

		val sessionAdmin = loginWithBlocking(daikokuAdmin, tenant)
		val resp = httpJsonCallBlocking(s"/api/admin/users/${randomUser.id.value}")(tenant, sessionAdmin)
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
			httpJsonCallBlocking(path = s"/api/admin/users", method = "POST", body = Some(user.asJson))(tenant, session)
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
			httpJsonCallBlocking(s"/api/admin/users/${daikokuAdmin.id.value}/_impersonate")(tenant, session)
		resp.status mustBe 401
	}
  }
}
