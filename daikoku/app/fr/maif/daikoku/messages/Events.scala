package fr.maif.daikoku.messages

import fr.maif.daikoku.domain.{Message, Tenant, User}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.utils.Translator
import org.apache.pekko.actor.{Actor, ActorLogging}
import org.apache.pekko.pattern._
import org.apache.pekko.stream.scaladsl.{Sink, Source}
import org.joda.time.DateTime
import play.api.i18n.MessagesApi
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future}

case class SendMessage(message: Message, tenant: Tenant)

case class StreamMessage(message: Message)

case class GetAllMessage(
    user: User,
    tenant: Tenant,
    maybeChat: Option[String],
    closedDate: Option[Long] = None
)

case class GetMyAdminMessages(
    user: User,
    tenant: Tenant,
    date: Option[Long] = None
)

case class CloseChat(chat: String, tenant: Tenant)

case class ReadMessages(
    user: User,
    chatId: String,
    date: DateTime,
    tenant: Tenant
)

case class GetLastChatDate(
    chats: String,
    tenant: Tenant,
    closedDate: Option[Long]
)

case class GetLastClosedChatDates(
    chats: Set[String],
    tenant: Tenant,
    closedDate: Option[Long]
)

class MessageActor(implicit
    env: Env,
    messagesApi: MessagesApi,
    translator: Translator
) extends Actor
    with ActorLogging {
  implicit val ec: ExecutionContext = env.defaultExecutionContext

  var messages: Seq[Message] = Seq.empty

  def maybeSendMailToRecipent(
      message: Message,
      tenant: Tenant
  ): Future[Unit] = {
    implicit val lang: String = tenant.defaultLanguage.getOrElse("en")
    for {
      sender <- env.dataStore.userRepo.findById(message.sender)
      lastMessage <-
        env.dataStore.messageRepo
          .findLastOpenMessageBefore(
            tenant.id,
            message.chat,
            message.date.getMillis
          )
      recipients <- env.dataStore.userRepo.findByIds(
        (message.participants + message.chat - message.sender).toSeq
      )
      connected <- env.dataStore.userSessionRepo.findActiveByUserIds(
        recipients.map(_.id),
        DateTime.now().getMillis
      )

      emails =
        if (message.chat == message.sender)
          recipients
            .filter(u => lastMessage.exists(m => m.readBy.contains(u.id)))
            .filter(u => !connected.exists(s => s.userId == u.id))
            .map(_.email)
        else
          recipients
            .filter(u => lastMessage.exists(_.readBy.contains(u.id)))
            .filter(_.id == message.chat)
            .filter(u => !connected.exists(s => s.userId == u.id))
            .map(_.email)
      path =
        if (message.sender == message.chat) "/settings/messages"
        else "/"

      link = env.getDaikokuUrl(tenant, path)

      title <- translator.translate(
        "mail.new.message.title",
        tenant,
        Map(
          "user" -> JsString(sender.get.name)
        )
      )
      body <- translator.translate(
        "mail.new.message.body",
        tenant,
        Map(
          "body" -> JsString(message.message),
          "user_data" -> sender.get.asSimpleJson,
          "message_data" -> message.asJson,
          "tenant_data" -> tenant.asJson,
          "link" -> JsString(link)
        )
      )
      _ <- Future.sequence(
        emails.map(email => tenant.mailer.send(title, Seq(email), body, tenant))
      )
    } yield ()
  }

  override def receive: Receive = {
    case GetAllMessage(user, tenant, maybeChat, closed) =>
      val response: Future[Seq[Message]] =
        env.dataStore.messageRepo
          .findChatMessages(tenant.id, user.id, maybeChat, closed)

      response pipeTo sender()

    case GetMyAdminMessages(user, tenant, closed) =>
      val response: Future[Seq[Message]] =
        env.dataStore.messageRepo
          .findAdminChatMessages(tenant.id, user.id, closed)

      response pipeTo sender()

    case SendMessage(message, tenant) =>
      (for {
        response <-
          env.dataStore.messageRepo
            .forTenant(message.tenant)
            .save(message)
        _ <- maybeSendMailToRecipent(message, tenant)
      } yield {
        response
      }) pipeTo sender()

    case CloseChat(chat, tenant) =>
      val response = env.dataStore.messageRepo
        .closeChat(tenant.id, chat, DateTime.now().toDate.getTime)

      response pipeTo sender()

    case ReadMessages(user, chat, date, tenant) => {
      env.dataStore.messageRepo
        .markAsRead(tenant.id, chat, user.id, date.toDate.getTime)
    }

    case GetLastChatDate(chat, tenant, maybeDate) =>
      val date: Long = maybeDate.getOrElse(DateTime.now().toDate.getTime)
      val result =
        env.dataStore.messageRepo.lastClosedChatDate(tenant.id, chat, date)
      result pipeTo sender()

    case GetLastClosedChatDates(chats, tenant, maybeClosedDate) =>
      val result = Source(chats)
        .mapAsync(10)(chat => {
          val l: Long = maybeClosedDate.getOrElse(DateTime.now().toDate.getTime)
          env.dataStore.messageRepo
            .lastClosedChatDate(tenant.id, chat, l)
            .map {
              case Some(date) =>
                Json.obj("chat" -> chat, "date" -> JsNumber(date))
              case None => Json.obj("chat" -> chat, "date" -> JsNull)
            }
        })
        .runWith(Sink.seq)(using env.defaultMaterializer)

      result pipeTo sender()
  }
}
