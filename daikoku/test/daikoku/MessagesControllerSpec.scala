package daikoku

import fr.maif.otoroshi.daikoku.domain.{
  Message,
  MessageType,
  DatastoreId,
  User,
  json
}
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.tests.utils.{
  DaikokuSpecHelper,
  OneServerPerSuiteWithMyComponents
}
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import org.joda.time.DateTime
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.{JsArray, Json}

class MessagesControllerSpec()
    extends PlaySpec
    with OneServerPerSuiteWithMyComponents
    with DaikokuSpecHelper
    with IntegrationPatience {

  def adminMessage(user: User,
                   sender: User,
                   message: String,
                   closed: Option[DateTime] = None): Message =
    Message(
      id = DatastoreId(IdGenerator.token(128)),
      tenant = tenant.id,
      messageType = MessageType.Tenant(tenant.id),
      participants = Set(user.id) ++ defaultAdminTeam.users.map(_.userId),
      readBy = Set(user.id),
      chat = user.id,
      date = DateTime.now(),
      sender = sender.id,
      message = message,
      closed = closed,
      send = true
    )

  "a tenant admin" can {
    "close a chat" in {
      setupEnv(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin, user),
        teams = Seq(defaultAdminTeam),
        messages = Seq(adminMessage(user, user, "not closed", None))
      ).map(_ => {
        val session = loginWithBlocking(tenantAdmin, tenant)

        val resp = httpJsonCallBlocking(path = s"/api/messages/${user.id.value}",
                                        method = "DELETE")(tenant, session)

        resp.status mustBe 200
      })

    }
  }

  "a user" can {
    "get his message to admin team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin, user),
        messages = Seq(adminMessage(user, user, "1", None))
      )

      val session = loginWithBlocking(user, tenant)

      val respGet =
        httpJsonCallBlocking("/api/me/messages/admin")(tenant, session)
      AppLogger.info(Json.stringify(respGet.json))
      respGet.status mustBe 200
      val messages =
        json.SeqMessagesFormat.reads((respGet.json \ "messages").as[JsArray])
      messages.isSuccess mustBe true
      messages.get.length mustBe 1
      messages.get.head.message mustBe "1"
    }

    "get his previous messages" in {
      val closedDate = DateTime.now().minusHours(1)
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin, user),
        messages = Seq(adminMessage(user, user, "1", Some(closedDate)))
      )

      val session = loginWithBlocking(user, tenant)

      val respGetClosedDate = httpJsonCallBlocking(
        s"/api/messages/${user.id.value}/last-date")(tenant, session)
      respGetClosedDate.status mustBe 200
      val lastClosedDate = (respGetClosedDate.json).as[Long]
      lastClosedDate mustBe closedDate.toDate.getTime

      val respGet = httpJsonCallBlocking(
        s"/api/me/messages?chat=${user.id.value}&date=$lastClosedDate")(tenant,
                                                                        session)
      respGet.status mustBe 200
      val messages =
        json.SeqMessagesFormat.reads((respGet.json \ "messages").as[JsArray])
      messages.isSuccess mustBe true

      messages.get.length mustBe 1
      messages.get.head.message mustBe "1"
    }

    "read his messages" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin, user),
        messages = Seq(
          adminMessage(user, user, "1", None).copy(
            date = DateTime.now().minusHours(1)))
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      val respGet = httpJsonCallBlocking(s"/api/me/messages")(tenant, session)
      respGet.status mustBe 200
      val messages = (respGet.json \ "messages").as(json.SeqMessagesFormat)
      messages.length mustBe 1
      messages.count(_.readBy.contains(tenantAdminId)) mustBe 0

      val respRead =
        httpJsonCallBlocking(path = s"/api/messages/${user.id.value}/_read",
                             method = "PUT")(tenant, session)
      respRead.status mustBe 200

      val respVerif = httpJsonCallBlocking(s"/api/me/messages")(tenant, session)
      respVerif.status mustBe 200
      val messagesVerif =
        (respVerif.json \ "messages").as(json.SeqMessagesFormat)

      messagesVerif.length mustBe 1
      messagesVerif.count(_.readBy.contains(tenantAdminId)) mustBe 1
    }

    "send a message to admin team" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin, user)
      )

      val session = loginWithBlocking(user, tenant)

      val respSend = httpJsonCallBlocking(
        path = "/api/messages/_send",
        method = "POST",
        body = Some(
          Json.obj(
            "message" -> "1",
            "participants" -> JsArray(
              (Set(user.id.asJson) ++ defaultAdminTeam.users.map(
                _.userId.asJson)).toSeq),
            "chat" -> user.id.asJson
          ))
      )(tenant, session)

      respSend.status mustBe 200

      val respGet = httpJsonCallBlocking("/api/me/messages")(tenant, session)
      respGet.status mustBe 200
      val messages =
        json.SeqMessagesFormat.reads((respGet.json \ "messages").as[JsArray])
      messages.isSuccess mustBe true
      messages.get.length mustBe 1
      messages.get.head.message mustBe "1"

    }

    "not close a chat" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(tenantAdmin, user),
        teams = Seq(defaultAdminTeam),
        messages = Seq(adminMessage(user, user, "not closed", None))
      )

      val session = loginWithBlocking(user, tenant)

      val resp = httpJsonCallBlocking(path = s"/api/messages/${user.id.value}",
                                      method = "DELETE")(tenant, session)

      resp.status mustBe 403
    }
  }

}
