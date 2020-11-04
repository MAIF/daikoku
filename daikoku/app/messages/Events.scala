package fr.maif.otoroshi.daikoku.messages

import akka.actor.{Actor, ActorLogging}
import akka.pattern._
import akka.stream.scaladsl.{Sink, Source}
import fr.maif.otoroshi.daikoku.domain.{Message, Tenant, User}
import fr.maif.otoroshi.daikoku.env.Env
import org.joda.time.DateTime
import play.api.libs.json.{JsNull, JsNumber, JsValue, Json}

import scala.concurrent.{ExecutionContext, Future}

case class SendMessage(message: Message)

case class StreamMessage(message: Message)

case class GetAllMessage(user: User,
                         tenant: Tenant,
                         maybeChat: Option[String],
                         closedDate: Option[Long] = None)

case class GetMyAdminMessages(user: User,
                              tenant: Tenant,
                              date: Option[Long] = None)

case class CloseChat(chat: String, tenant: Tenant)

case class ReadMessages(user: User,
                        chatId: String,
                        date: DateTime,
                        tenant: Tenant)

case class GetLastChatDate(chats: String,
                           tenant: Tenant,
                           closedDate: Option[Long])

case class GetLastClosedChatDates(chats: Set[String],
                                  tenant: Tenant,
                                  closedDate: Option[Long])

class MessageActor(
    implicit env: Env
) extends Actor
    with ActorLogging {
  implicit val ec: ExecutionContext = env.defaultExecutionContext

  var messages: Seq[Message] = Seq.empty

  override def receive: Receive = {
    case GetAllMessage(user, tenant, maybeChat, closed) =>
      val query = Json.obj("participants" -> user.id.asJson) ++
        maybeChat.fold(Json.obj("closed" -> JsNull))(chat => {
          val value: JsValue = closed.map(s => JsNumber(s)).getOrElse(JsNull)
          Json.obj("chat" -> chat, "closed" -> value)
        })
      val response: Future[Seq[Message]] =
        env.dataStore.messageRepo
          .forTenant(tenant)
          .find(query)

      response pipeTo sender()

    case GetMyAdminMessages(user, tenant, closed) =>
      val value: JsValue = closed.map(d => JsNumber(d)).getOrElse(JsNull)
      val response: Future[Seq[Message]] =
        env.dataStore.messageRepo
          .forTenant(tenant)
          .find(
            Json.obj("chat" -> user.id.asJson,
                     "messageType.type" -> "tenant",
                     "closed" -> value))

      response pipeTo sender()

    case SendMessage(message) =>
      val response =
        env.dataStore.messageRepo.forTenant(message.tenant).save(message)
      response pipeTo sender()

    case CloseChat(chat, tenant) =>
      val response = env.dataStore.messageRepo
        .forTenant(tenant)
        .updateMany(
          Json.obj("chat" -> chat, "closed" -> JsNull),
          Json.obj("closed" -> JsNumber(DateTime.now().toDate.getTime)))

      response pipeTo sender()

    case ReadMessages(user, chat, date, tenant) =>
      env.dataStore.messageRepo
        .forTenant(tenant)
        .updateManyByQuery(
          Json.obj(
            "$and" -> Json.arr(
              Json.obj("chat" -> chat),
              Json.obj("readBy" -> Json.obj("$ne" -> user.id.asJson)),
              Json.obj("date" -> Json.obj("$lt" -> date.toDate.getTime))
            )),
          Json.obj("$push" -> Json.obj("readBy" -> user.id.asJson))
        )

    case GetLastChatDate(chat, tenant, maybeDate) =>
      val date: Long = maybeDate.getOrElse(DateTime.now().toDate.getTime)
      val result = env.dataStore.messageRepo
        .forTenant(tenant)
        .findMaxByQuery(
          Json.obj("chat" -> chat, "closed" -> Json.obj("$lt" -> date)),
          "closed")
      result pipeTo sender()

    case GetLastClosedChatDates(chats, tenant, maybeClosedDate) =>
      val result = Source(chats)
        .mapAsync(10)(chat => {
          val l: Long = maybeClosedDate.getOrElse(DateTime.now().toDate.getTime)
          env.dataStore.messageRepo
            .forTenant(tenant)
            .findMaxByQuery(Json.obj("chat" -> chat,
                                     "closed" -> Json.obj("$lt" -> l)),
                            "closed")
            .map {
              case Some(date) =>
                Json.obj("chat" -> chat, "date" -> JsNumber(date))
              case None => Json.obj("chat" -> chat, "date" -> JsNull)
            }
        })
        .runWith(Sink.seq)(env.defaultMaterializer)

      result pipeTo sender()
  }
}
