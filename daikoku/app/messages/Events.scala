package fr.maif.otoroshi.daikoku.messages

import akka.actor.{Actor, ActorLogging}
import akka.pattern._
import fr.maif.otoroshi.daikoku.domain.{Message, Tenant, User}
import fr.maif.otoroshi.daikoku.env.Env
import org.joda.time.DateTime
import play.api.libs.json.Json

import scala.concurrent.{ExecutionContext, Future}

case class SendMessage(message: Message)

case class StreamMessage(message: Message)

case class GetAllMessage(user: User, tenant: Tenant)

case class GetMyAdminMessages(user: User, tenant: Tenant)

case class CountUnreadMessages(user: User, tenant: Tenant)

case class CloseChat(chat: String, tenant: Tenant)

case class ReadMessages(user: User, date: DateTime, tenant: Tenant)

class MessageActor(
                    implicit env: Env
                  ) extends Actor with ActorLogging {
  implicit val ec: ExecutionContext = env.defaultExecutionContext

  var messages: Seq[Message] = Seq.empty

  override def receive: Receive = {
    case GetAllMessage(user, tenant) =>
      val response: Future[Seq[Message]] =
        env.dataStore.messageRepo.forTenant(tenant)
          .find(Json.obj("participants" -> user.id.asJson, "closed" -> false))

      response pipeTo sender()

    case GetMyAdminMessages(user, tenant) =>
      val response: Future[Seq[Message]] =
        env.dataStore.messageRepo.forTenant(tenant)
          .find(Json.obj("chat" -> user.id.asJson, "closed" -> false)) //todo: add message type after prop impl

      response pipeTo sender()

    case CountUnreadMessages(user, tenant) =>
      val response: Future[Long] =
        env.dataStore.messageRepo.forTenant(tenant)
          .count(Json.obj("participants" -> user.id.asJson, "closed" -> false))

      response pipeTo sender()

    case SendMessage(message) =>
      val response = env.dataStore.messageRepo.forTenant(message.tenant).save(message)
      response pipeTo sender()

    case CloseChat(chat, tenant) =>
      env.dataStore.messageRepo.forTenant(tenant).save(Json.obj("chat" -> chat), Json.obj("closed" -> true))

    case ReadMessages(user, date, tenant) =>
      env.dataStore.messageRepo.forTenant(tenant)
        .updateMany(Json.obj("$and" -> Json.arr(
          Json.obj("chat" -> user.id.asJson),
          Json.obj("date" -> Json.obj("$lt" -> date.toDate.getTime))
        )), Json.obj("$addToSet" -> Json.obj("readBy" -> user.id.asJson)))
  }
}