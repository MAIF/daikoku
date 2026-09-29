package fr.maif.daikoku.usages

import com.dimafeng.testcontainers.scalatest.TestContainersForAll
import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import fr.maif.daikoku.domain.{SimpleSMTPSettings, Tenant, UserWithPermission}
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.{JsArray, Json}
import cats.implicits.*
import fr.maif.daikoku.domain.TeamPermission.{Administrator, ApiEditor, TeamUser}
import org.scalatest.BeforeAndAfter

import scala.concurrent.Await
import scala.concurrent.duration.DurationInt
import play.api.libs.ws.WSBodyWritables.writeableOf_urlEncodedForm


class MultiDomainSpec()
  extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfter
    with TestContainersForAll {

  override type Containers = GenericContainer

  private def mailpit(): GenericContainer =
    GenericContainer
      .Def(
        dockerImage = "axllent/mailpit:latest",
        exposedPorts = Seq(1025, 8025)
      )
      .start()

  override def startContainers(): Containers =
    mailpit()

  def tenantWithMailer(mailer: GenericContainer): Tenant =
    tenant.copy(
      additionalDomains = Set("alias.localhost"),
      mailerSettings = SimpleSMTPSettings(
        host = "localhost",
        port = mailer.mappedPort(1025).toString,
        fromTitle = "test",
        fromEmail = "noreply@test.io",
        template = None,
        username = None,
        password = None
      ).some
    )

  def mails(mailer: GenericContainer): JsArray = {
    val response = daikokuComponents.env.wsClient
      .url(s"http://localhost:${mailer.mappedPort(8025)}/api/v1/messages")
      .get()
      .futureValue
      .json

    (response \ "messages").as[JsArray]
  }

  def getLastEmailhtml(mailer: GenericContainer): String = {
    daikokuComponents.env.wsClient
      .url(s"http://localhost:${mailer.mappedPort(8025)}/api/v1/message/latest/raw")
      .get()
      .futureValue
      .body
  }

  "an invitation sent from an alias" must {
    "set the invited user's preferredDomain and link the mail to the alias" in withContainers {
      mailer =>
        val t = tenantWithMailer(mailer)
        Await.result(cleanMailerServer(mailer.mappedPort(8025)), 5.seconds)
        setupEnvBlocking(
          tenants = Seq(t),
          users = Seq(tenantAdmin),
          teams = Seq(defaultAdminTeam, teamOwner)
        )
        val session = loginWithBlocking(tenantAdmin, t)

        val resp = httpJsonCallBlocking(
          path = s"/api/teams/${teamOwner.id.value}/unchecked-members",
          method = "POST",
          headers = Map("Host" -> "alias.localhost"),
          body = Some(Json.obj("email" -> "invited@foo.bar"))
        )(using t, session)
        resp.status mustBe 201

        val invited = daikokuComponents.env.dataStore.userRepo
          .findByEmail("invited@foo.bar")
          .futureValue
        invited.flatMap(_.preferredDomains.get(t.id)) mustBe Some(
          "alias.localhost"
        )

      val body = getLastEmailhtml(mailer)
      body.must(include("alias.localhost"))
      body.must(include("/informations?invitation-token="))
    }
  }

  "a local login" must {
    "record the host it was made on" in withContainers { mailer =>
      val t = tenantWithMailer(mailer)
      setupEnvBlocking(tenants = Seq(t), users = Seq(user), teams = Seq(defaultAdminTeam))

      def login(host: String) =
        daikokuComponents.env.wsClient
          .url(s"http://127.0.0.1:$port/auth/Local/callback")
          .withHttpHeaders("Host" -> host, "Content-Type" -> "application/x-www-form-urlencoded")
          .withFollowRedirects(false)
          .post(Map("username" -> Seq(user.email), "password" -> Seq("password")))
          .futureValue

      def preferred() =
        daikokuComponents.env.dataStore.userRepo
          .findById(user.id).futureValue.flatMap(_.preferredDomains.get(t.id))

      login("alias.localhost").status mustBe 303
      preferred() mustBe Some("alias.localhost")

      login("localhost").status mustBe 303
      preferred() mustBe Some("localhost")
    }
  }

  "a mail link" must {
    "fall back to the primary domain when preferredDomain is foreign" in withContainers { mailer =>
      val t = tenantWithMailer(mailer)
      Await.result(cleanMailerServer(mailer.mappedPort(8025)), 5.seconds)
      setupEnvBlocking(
        tenants = Seq(t),
        users = Seq(userAdmin, user.copy(preferredDomains = Map(t.id -> "evil.example"))),
        teams = Seq(
          defaultAdminTeam,
          teamOwner.copy(users = Set(
            UserWithPermission(userAdmin.id, Administrator),
          )))
      )

      val session = loginWithBlocking(userAdmin, t)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwner.id.value}/members",
        method = "POST",
        body = Some(Json.obj("members" -> Json.arr(user.id.asJson)))
      )(using t, session)
      resp.status mustBe 200

      val body = getLastEmailhtml(mailer)
      body must include(s"localhost:8080/notification")
      body must not include "evil.example"
    }
  }

  "a browser redirect" must {
    "stay on the alias the request came from" in withContainers { mailer =>
      val t = tenantWithMailer(mailer)
      setupEnvBlocking(tenants = Seq(t), users = Seq(user), teams = Seq(defaultAdminTeam))
      val session = loginWithBlocking(user, t)

      val resp = httpJsonCallBlocking(
        path = "/logout", // route de logout, vérifier dans conf/routes
        headers = Map("Host" -> "alias.localhost")
      )(using t, session)

      resp.header("Location").getOrElse("") must startWith("http://alias.localhost")
    }
  }

}
