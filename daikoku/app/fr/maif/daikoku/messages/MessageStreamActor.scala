package fr.maif.daikoku.messages

import fr.maif.daikoku.domain.UserId
import org.apache.pekko.actor.{Actor, ActorRef}

class MessageStreamActor(source: ActorRef, user: UserId) extends Actor {
  override def receive = { case StreamMessage(message) =>
    if (message.participants.contains(user))
      source ! message.asJson
  }

  override def preStart(): Unit = {
    context.system.eventStream.subscribe(self, classOf[StreamMessage])
  }

  override def postStop(): Unit = {
    context.system.eventStream.unsubscribe(self)
  }
}
