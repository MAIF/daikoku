package fr.maif.otoroshi.daikoku.ctrls

import java.util.UUID.randomUUID

import akka.actor.{ActorRef, PoisonPill, Props}
import akka.pattern.ask
import akka.http.scaladsl.util.FastFuture
import akka.stream.{CompletionStrategy, OverflowStrategy}
import akka.stream.scaladsl.Source
import akka.util.Timeout
import fr.maif.otoroshi.daikoku.actions.DaikokuAction
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async.{PublicUserAccess, TenantAdminOnly}
import fr.maif.otoroshi.daikoku.domain.json.{ChatIdFormat, TeamIdFormat}
import fr.maif.otoroshi.daikoku.domain.{ChatId, Message, MongoId, Recipient, TeamId, json}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.messages.{CloseChat, GetAllMessage, MessageActor, MessageStreamActor, SendMessage, StreamMessage}
import org.joda.time.DateTime
import play.api.Logger
import play.api.http.ContentTypes
import play.api.i18n.I18nSupport
import play.api.libs.EventSource
import play.api.libs.json.{JsArray, JsValue, Json}
import play.api.mvc.{AbstractController, ControllerComponents, Result}
import reactivemongo.bson.BSONObjectID

import scala.concurrent.Future
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
      val recipient: TeamId = (body \ "recipient").as(TeamIdFormat) //todo: be careful with this line...maybe we want to sue this same method to respond
      val chat = (body \ "chat").asOpt[String].getOrElse(BSONObjectID.generate().stringify)

      val message = Message(
        id = MongoId(BSONObjectID.generate().stringify),
        tenant = ctx.tenant.id,
        chat = ChatId(chat),
        sender = ctx.user.id,
        recipient = Recipient.Team(recipient),
        date = DateTime.now(),
        message = line,
        send = true
      )

      ctx.setCtxValue("message.id", message.id.value)

      env.dataStore.teamRepo.forTenant(ctx.tenant).findById(recipient).flatMap {
        case Some(_) => (messageActor ? SendMessage(message))
          .map {
            case true =>
              env.defaultActorSystem.eventStream.publish(StreamMessage(message))
              Ok(message.asJson)
            case false => BadRequest(Json.obj("error" -> "Failure", "message" -> message.copy(send = false).asJson))
          }
        case None => FastFuture.successful(NotFound(Json.obj("error" -> "recipient not found")))
      }
    }
  }

  def myMessages() = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent("@{user.name} has received his messages"))(ctx) {
      (messageActor ? GetAllMessage(ctx.user, ctx.tenant))
        .mapTo[Seq[Message]]
        .map(messages => Ok(JsArray(messages.map(_.asJson))))
    }
  }

  def closeChat(chat: String) = DaikokuAction.async { ctx =>
    TenantAdminOnly(AuditTrailEvent("@{user.name} has closed dialog @{chatId}"))(ctx.tenant.id.value, ctx) { (_, _) =>
      ctx.setCtxValue("chatId", chat)

      (messageActor ? CloseChat(chat, ctx.tenant))
        .mapTo[Boolean]
        .map(done => Ok(Json.obj("done" -> true)))
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

      env.dataStore.teamRepo.myTeams(ctx.tenant, ctx.user)
        .map(teams => teams.map(_.id))
        .map(teams => {
          val source: Source[JsValue, ActorRef] = Source
            .actorRef[JsValue](completionMatcher, failureMatcher, 32, OverflowStrategy.dropHead)
            .watchTermination() {
              case (actorRef, terminate) =>
                val ref = env.defaultActorSystem.actorOf(Props(new MessageStreamActor(actorRef, ctx.user.id, teams)), s"messageStreamActor-${randomUUID().toString}")
                terminate.onComplete(_ => ref ! PoisonPill)
                actorRef
            }

          Ok.chunked(source via EventSource.flow).as(ContentTypes.EVENT_STREAM)
        })
    }
  }
}
