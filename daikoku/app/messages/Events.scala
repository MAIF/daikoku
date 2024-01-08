package fr.maif.otoroshi.daikoku.messages

import org.apache.pekko.actor.{Actor, ActorLogging}
import org.apache.pekko.pattern._
import org.apache.pekko.stream.scaladsl.{Sink, Source}
import fr.maif.otoroshi.daikoku.actions.DaikokuActionContext
import fr.maif.otoroshi.daikoku.domain.{Message, Tenant, User}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.utils.Translator
import org.joda.time.DateTime
import play.api.i18n.{I18nSupport, Lang, MessagesApi}
import play.api.libs.json.{JsArray, JsNull, JsNumber, JsValue, Json}

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
          .forTenant(tenant)
          .find(
            Json.obj(
              "closed" -> JsNull,
              "chat" -> message.chat.asJson,
              "date" -> Json.obj("$lt" -> message.date.getMillis)
            )
          )
          .map(_.sortWith((a, b) => a.date.isAfter(b.date)).headOption)
      recipients <- env.dataStore.userRepo.find(
        Json.obj(
          "_id" -> Json.obj(
            "$in" -> JsArray(
              (message.participants + message.chat - message.sender)
                .map(_.asJson)
                .toSeq
            )
          )
        )
      )
      connected <- env.dataStore.userSessionRepo.find(
        Json.obj(
          "userId" -> Json.obj("$in" -> JsArray(recipients.map(_.id.asJson))),
          "expires" -> Json.obj("$gt" -> DateTime.now().getMillis)
        )
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
      baseLink = env.config.exposedPort match {
        case 80    => s"http://${tenant.domain}/"
        case 443   => s"https://${tenant.domain}/"
        case value => s"http://${tenant.domain}:$value/"
      }
      link =
        if (message.sender == message.chat) s"$baseLink/settings/messages"
        else baseLink

      title <- translator.translate(
        "mail.new.message.title",
        tenant,
        Map(
          "user" -> sender.get.name
        )
      )
      body <- translator.translate("mail.new.message.body", tenant)
      _ <- Future.sequence(
        emails.map(email => tenant.mailer.send(title, Seq(email), body, tenant))
      )
    } yield ()
  }

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
            Json.obj(
              "chat" -> user.id.asJson,
              "messageType.type" -> "tenant",
              "closed" -> value
            )
          )

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
        .forTenant(tenant)
        .updateMany(
          Json.obj("chat" -> chat, "closed" -> JsNull),
          Json.obj("closed" -> JsNumber(DateTime.now().toDate.getTime))
        )

      response pipeTo sender()

    case ReadMessages(user, chat, date, tenant) => {
      env.dataStore.messageRepo
        .forTenant(tenant)
        .updateManyByQuery(
          Json.obj(
            "$and" -> Json.arr(
              Json.obj("chat" -> chat),
              Json.obj("readBy" -> Json.obj("$ne" -> user.id.asJson)),
              Json.obj("date" -> Json.obj("$lt" -> date.toDate.getTime))
            )
          ),
          Json.obj("$push" -> Json.obj("readBy" -> user.id.asJson))
        )
    }

    case GetLastChatDate(chat, tenant, maybeDate) =>
      val date: Long = maybeDate.getOrElse(DateTime.now().toDate.getTime)
      val result = env.dataStore.messageRepo
        .forTenant(tenant)
        .findMaxByQuery(
          Json.obj("chat" -> chat, "closed" -> Json.obj("$lt" -> date)),
          "closed"
        )
      result pipeTo sender()

    case GetLastClosedChatDates(chats, tenant, maybeClosedDate) =>
      val result = Source(chats)
        .mapAsync(10)(chat => {
          val l: Long = maybeClosedDate.getOrElse(DateTime.now().toDate.getTime)
          env.dataStore.messageRepo
            .forTenant(tenant)
            .findMaxByQuery(
              Json.obj("chat" -> chat, "closed" -> Json.obj("$lt" -> l)),
              "closed"
            )
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
