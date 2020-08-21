package fr.maif.otoroshi.daikoku.messages

import akka.actor.{Actor, ActorLogging}
import akka.pattern._
import fr.maif.otoroshi.daikoku.domain.{ChatId, Message, Tenant, User}
import fr.maif.otoroshi.daikoku.env.Env
import play.api.libs.json.{JsArray, Json}

import scala.concurrent.Future

case class SendMessage(message: Message)
case class StreamMessage(message: Message)
case class GetAllMessage(user: User, tenant: Tenant)
case class CloseChat(chat: String, tenant: Tenant)

class MessageActor(
                    implicit env: Env
                  ) extends Actor with ActorLogging {
  implicit val ec = env.defaultExecutionContext

  var messages: Seq[Message] = Seq.empty

  override def receive: Receive = {
    case GetAllMessage(user, tenant) =>
      val response: Future[Seq[Message]] = for {
        myTeams <- env.dataStore.teamRepo.myTeams(tenant, user)
        messages <- env.dataStore.messageRepo.forTenant(tenant).find(Json.obj("$or" -> Json.arr(
          Json.obj("sender" -> user.id.asJson),
          Json.obj("recipient.id" -> Json.obj("$in" -> JsArray(myTeams.map(_.id.asJson) ++ Seq(user.id.asJson))))
        )))
      } yield messages
      response pipeTo sender()

    case SendMessage(message) =>
      val response = env.dataStore.messageRepo.forTenant(message.tenant).save(message)
      response pipeTo sender()

    case CloseChat(chat, tenant) =>
      env.dataStore.messageRepo.forTenant(tenant).save(Json.obj("chat" -> chat), Json.obj("closed" -> true))
  }
}