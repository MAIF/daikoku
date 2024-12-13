package fr.maif.otoroshi.daikoku.utils

import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.http.scaladsl.util.FastFuture.EnhancedFuture
import org.owasp.html.HtmlPolicyBuilder
import play.api.Logger
import play.api.i18n.MessagesApi
import play.api.libs.json._
import play.api.libs.ws.{WSAuthScheme, WSClient}

import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success, Try}

object HtmlSanitizer {

  //First define your policy for allowed elements
  private lazy val policy = new HtmlPolicyBuilder()
    .allowElements("p")
    .allowElements("a")
    .allowUrlProtocols("https")
    .allowAttributes("href")
    .onElements("a")
    .requireRelNofollowOnLinks()
    .toFactory()

  def sanitize(unsafeHTML: String) = policy.sanitize(unsafeHTML)
}

trait Mailer {
  def send(title: String, to: Seq[String], body: String, tenant: Tenant)(
      implicit
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi,
      env: Env,
      language: String
  ): Future[Unit]
}

object ConsoleMailer {
  def apply() = new ConsoleMailer(ConsoleMailerSettings())
}

class ConsoleMailer(settings: ConsoleMailerSettings) extends Mailer {

  lazy val logger = Logger("daikoku-console-mailer")

  def send(title: String, to: Seq[String], body: String, tenant: Tenant)(
      implicit
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi,
      env: Env,
      language: String
  ): Future[Unit] = {
    translator
      .getMailTemplate("tenant.mail.template", tenant, Map("email" -> JsString(body)))
      .map { templateBody =>
        logger.info(s"Sent email: ${Json.prettyPrint(
          Json.obj(
            "from" -> s"Daikoku <daikoku@foo.bar>",
            "to" -> Seq(to.mkString(", ")),
            "subject" -> Seq(title),
            "html" -> templateBody
              .replace("{{email}}", body)
              .replace("[email]", body)
          )
        )}")
        ()
      }
  }
}

class MailgunSender(wsClient: WSClient, settings: MailgunSettings)
    extends Mailer {

  lazy val logger = Logger("daikoku-mailer")

  def send(title: String, to: Seq[String], body: String, tenant: Tenant)(
      implicit
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi,
      env: Env,
      language: String
  ): Future[Unit] = {

    translator
      .getMailTemplate("tenant.mail.template", tenant, Map("email" -> JsString(body)))
      .map(templatedBody => {
        wsClient
          .url(if (settings.eu) {
            s"https://api.eu.mailgun.net/v3/${settings.domain}/messages"
          } else {
            s"https://api.mailgun.net/v3/${settings.domain}/messages"
          })
          .withAuth("api", settings.key, WSAuthScheme.BASIC)
          .post(
            Map(
              "from" -> Seq(s"${settings.fromTitle} <${settings.fromEmail}>"),
              "to" -> Seq(to.mkString(", ")),
              "subject" -> Seq(title),
              "html" -> Seq(templatedBody.replace("{{email}}", body).replace("[email]", body)),
              "text" -> Seq(body)
            )
          )
          .andThen {
            case Success(res) =>
              logger.info(s"Alert email sent \r\n ${res.json}")
            case Failure(e) =>
              logger.error("Error while sending alert email", e)
          }
          .map(_ -> ())
      })
  }
}

class MailjetSender(wsClient: WSClient, settings: MailjetSettings)
    extends Mailer {

  lazy val logger = Logger("daikoku-mailer")

  def send(title: String, to: Seq[String], body: String, tenant: Tenant)(
      implicit
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi,
      env: Env,
      language: String
  ): Future[Unit] = {

    translator
      .getMailTemplate("tenant.mail.template", tenant, Map("email" -> JsString(body)))
      .map(templatedBody => {
        wsClient
          .url(s"https://api.mailjet.com/v3.1/send")
          .withAuth(
            settings.apiKeyPublic,
            settings.apiKeyPrivate,
            WSAuthScheme.BASIC
          )
          .withHttpHeaders("Content-Type" -> "application/json")
          .post(
            Json.obj(
              "Messages" -> Json.arr(
                Json.obj(
                  "From" -> Json.obj(
                    "Email" -> settings.fromEmail,
                    "Name" -> settings.fromTitle
                  ),
                  "To" -> JsArray(
                    to.map(t =>
                      Json.obj(
                        "Email" -> t,
                        "Name" -> t
                      )
                    )
                  ),
                  "Subject" -> title,
                  "HTMLPart" -> templatedBody.replace("{{email}}", body).replace("[email]", body)
                  // TextPart
                )
              )
            )
          )
          .andThen {
            case Success(res) => logger.info("Alert email sent")
            case Failure(e) =>
              logger.error("Error while sending alert email", e)
          }
          .map(_ => ())
      })
  }
}

class SimpleSMTPSender(settings: SimpleSMTPSettings) extends Mailer {

  import jakarta.mail._
  import jakarta.mail.internet._

  import java.util.{Date, Properties}

  lazy val logger = Logger("daikoku-mailer")

  def send(title: String, to: Seq[String], body: String, tenant: Tenant)(
      implicit
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi,
      env: Env,
      language: String
  ): Future[Unit] = {

    translator
      .getMailTemplate("tenant.mail.template", tenant, Map("email" -> JsString(body)))
      .map(templatedBody => {

        val properties = new Properties()
        properties.put("mail.smtp.host", settings.host)
        properties.put("mail.smtp.port", Integer.valueOf(settings.port))

        Future
          .sequence(
            to.map(InternetAddress.parse)
              .map {
                address =>
                  val message: Message =
                    new MimeMessage(
                      Session.getDefaultInstance(properties, null)
                    )
                  message.setFrom(new InternetAddress(settings.fromEmail))
                  message.setRecipients(
                    Message.RecipientType.TO,
                    address.asInstanceOf[Array[Address]]
                  )

                  message.setSentDate(new Date())
                  message.setSubject(title)
                  message.setContent(
                    templatedBody.replace("{{email}}", body).replace("[email]", body),
                    "text/html; charset=utf-8"
                  )

                  Try {
                    Transport.send(message)
                    logger.info(
                      s"Alert email sent to : ${address.mkString("Array(", ", ", ")")}"
                    )
                  } recover {
                    case e: Exception =>
                      logger.error("Error while sending alert email", e)
                  } get

                  FastFuture.successful(())
              }
          )
          .flatMap { _ =>
            FastFuture.successful(())
          }
      })
  }
}

class SendgridSender(ws: WSClient, settings: SendgridSettings) extends Mailer {
  lazy val logger = Logger("daikoku-mailer")

  def send(title: String, to: Seq[String], body: String, tenant: Tenant)(
      implicit
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi,
      env: Env,
      language: String
  ): Future[Unit] = {

    translator
      .getMailTemplate("tenant.mail.template", tenant, Map("email" -> JsString(body)))
      .map(templatedBody => {
        ws.url(s"https://api.sendgrid.com/v3/mail/send")
          .withHttpHeaders(
            "Authorization" -> s"Bearer ${settings.apikey}",
            "Content-Type" -> "application/json"
          )
          .post(
            Json.obj(
              "personalizations" -> Json.arr(
                Json.obj(
                  "subject" -> title,
                  "to" -> to.map(c => Json.obj("email" -> c, "name" -> c))
                )
              ),
              "from" -> Json.obj(
                "email" -> settings.fromEmail,
                "name" -> settings.fromTitle
              ),
              "content" -> Json.arr(
                Json.obj(
                  "type" -> "text/html",
                  "value" -> templatedBody.replace("{{email}}", body).replace("[email]", body)
                )
              )
            )
          )
          .andThen {
            case Success(_) => logger.info(s"Alert email sent : ${to}")
            case Failure(e) =>
              logger.error("Error while sending alert email", e)
          }
          .fast
          .map(_ => ())
      })
  }
}
