package fr.maif.otoroshi.daikoku.messages

import akka.actor.{Actor, ActorRef}
import fr.maif.otoroshi.daikoku.domain.Message


class MessageStreamActor (source: ActorRef) extends Actor {
  override def receive = {
    case StreamMessage(message) => source ! message.asJson
  }

  override def preStart(): Unit = {
    context.system.eventStream.subscribe(self, classOf[Message])
  }

  override def postStop(): Unit = {
    context.system.eventStream.unsubscribe(self)
  }
}
