package fr.maif.otoroshi.daikoku.ctrls

import java.util.UUID.randomUUID

import akka.actor.{ActorRef, PoisonPill, Props}
import akka.http.scaladsl.util.FastFuture
import akka.pattern.ask
import akka.stream.scaladsl.Source
import akka.stream.{CompletionStrategy, OverflowStrategy}
import akka.util.Timeout
import fr.maif.otoroshi.daikoku.actions.DaikokuAction
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async.{PublicUserAccess, TenantAdminOnly}
import fr.maif.otoroshi.daikoku.domain.{Message, MessageType, MongoId, UserId}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.messages._
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat
import play.api.Logger
import play.api.http.ContentTypes
import play.api.i18n.I18nSupport
import play.api.libs.EventSource
import play.api.libs.json.{JsArray, JsNull, JsObject, JsValue, Json}
import play.api.mvc.{AbstractController, ControllerComponents}
import reactivemongo.bson.BSONObjectID

import scala.concurrent.duration._

class MessageController(DaikokuAction: DaikokuAction,
                        env: Env,
                        cc: ControllerComponents)
  extends AbstractController(cc)
    with I18nSupport {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env
  implicit val timeout: Timeout = Timeout(5.seconds)

  val messageActor: ActorRef = env.defaultActorSystem.actorOf(Props(new MessageActor()), "messages")

  val logger = Logger("MessageController")

  def sendMessage() = DaikokuAction.async(parse.json) { ctx =>
    PublicUserAccess(AuditTrailEvent("@{user.name} has send message @{message.id}"))(ctx) {

      val body = ctx.request.body
      val line: String = (body \ "message").as[String]
      val participants = (body \ "participants").as[JsArray].value.map(_.as[String]).map(UserId).toSet
      val chat = (body \ "chat").asOpt[String].map(UserId).getOrElse(ctx.user.id)


      val message = Message(
        id = MongoId(BSONObjectID.generate().stringify),
        tenant = ctx.tenant.id,
        messageType = MessageType.Tenant(ctx.tenant.id), //todo: update it when user can send messages to team admins
        sender = ctx.user.id,
        participants = participants,
        readBy = Set(ctx.user.id),
        chat = chat,
        date = DateTime.now(),
        message = line,
        send = true
      )

      ctx.setCtxValue("message.id", message.id.value)

      (messageActor ? SendMessage(message))
        .map {
          case true =>
            env.defaultActorSystem.eventStream.publish(StreamMessage(message))
            Ok(message.asJson)
          case false => BadRequest(Json.obj("error" -> "Failure", "message" -> message.copy(send = false).asJson))
        }
    }
  }

  def countUnreadMessages() = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent("@{user.name} has received his messages"))(ctx) {
      (messageActor ? CountUnreadMessages(ctx.user, ctx.tenant))
        .mapTo[Long]
        .map(count => Ok(Json.obj("count" -> count)))
    }
  }

  def myAdminMessages(date: Option[Long]) = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent("@{user.name} has received his messages"))(ctx) {
      for {
        messages <- (messageActor ? GetMyAdminMessages(ctx.user, ctx.tenant, date)).mapTo[Seq[Message]]
        previousClosedDates <- (messageActor ? GetLastClosedChatDates(Set(ctx.user.id.value), ctx.tenant, date)).mapTo[Seq[JsObject]]
      } yield {
        Ok(Json.obj("messages" -> JsArray(messages.map(_.asJson)), "previousClosedDates" -> JsArray(previousClosedDates)))
      }
    }
  }

  def myMessages(chat: Option[String], date: Option[Long]) = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent("@{user.name} has received his messages"))(ctx) {
      for {
        messages <- (messageActor ? GetAllMessage(ctx.user, ctx.tenant, chat, date)).mapTo[Seq[Message]]
        chats = messages.map(_.chat.value).toSet
        previousClosedDates <- (messageActor ? GetLastClosedChatDates(chats, ctx.tenant, date)).mapTo[Seq[JsObject]]
      } yield {
        Ok(Json.obj("messages" -> JsArray(messages.map(_.asJson)), "previousClosedDates" -> JsArray(previousClosedDates)))
      }
    }
  }

  def getLastChatDate(chat: String, date: Option[Long]) = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent("@{user.name} has received his messages"))(ctx) {
      (messageActor ? GetLastChatDate(chat, ctx.tenant, date))
        .mapTo[Option[Long]]
        .map {
          case Some(date) => Ok(Json.obj("date" -> date))
          case None => Ok(Json.obj("date" -> JsNull))
        }
    }
  }

  def closeChat(chat: String) = DaikokuAction.async { ctx =>
    TenantAdminOnly(AuditTrailEvent("@{user.name} has closed dialog @{chatId}"))(ctx.tenant.id.value, ctx) { (_, _) =>
      ctx.setCtxValue("chatId", chat)

      (messageActor ? CloseChat(chat, ctx.tenant))
        .mapTo[Long]
        .map(_ => Ok(Json.obj("done" -> true)))
    }
  }

  def setMessageRead(chatId: String) = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent("@{user.name} has read his messages from @{date}"))(ctx) {
      val now = DateTime.now()
      ctx.setCtxValue("date", ISODateTimeFormat.dateTimeNoMillis().print(DateTime.now()))

      messageActor ! ReadMessages(ctx.user, chatId, now, ctx.tenant)

      FastFuture.successful(Ok(Json.obj()))
    }
  }

  def sse() = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent("@{user.name} has received his messages"))(ctx) {
      val completionMatcher: PartialFunction[Any, CompletionStrategy] = {
        case akka.actor.Status.Success(s: CompletionStrategy) => s
        case akka.actor.Status.Success(_) => CompletionStrategy.draining
        case akka.actor.Status.Success => CompletionStrategy.draining
      }
      val failureMatcher: PartialFunction[Any, Throwable] = { case akka.actor.Status.Failure(cause) => cause }

      val source: Source[JsValue, ActorRef] = Source
        .actorRef[JsValue](completionMatcher, failureMatcher, 32, OverflowStrategy.dropHead)
        .keepAlive(10.second, () => JsNull)
        .watchTermination() {
          case (actorRef, terminate) =>
            val ref = env.defaultActorSystem.actorOf(Props(new MessageStreamActor(actorRef, ctx.user.id)), s"messageStreamActor-${randomUUID().toString}")
            terminate.onComplete(_ => ref ! PoisonPill)
            actorRef
        }

      FastFuture.successful(Ok.chunked(source via EventSource.flow).as(ContentTypes.EVENT_STREAM))
    }
  }
}
