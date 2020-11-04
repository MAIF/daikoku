package fr.maif.otoroshi.daikoku.utils

import akka.http.scaladsl.util.FastFuture
import fr.maif.otoroshi.daikoku.domain._
import org.owasp.html.HtmlPolicyBuilder
import play.api.Logger
import play.api.libs.json._
import play.api.libs.ws.{WSAuthScheme, WSClient}

import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success}

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
  def send(title: String, to: Seq[String], body: String)(
      implicit ec: ExecutionContext): Future[Unit]
}

object ConsoleMailer {
  def apply() = new ConsoleMailer()
}

class ConsoleMailer() extends Mailer {

  lazy val logger = Logger("daikoku-console-mailer")

  def send(title: String, to: Seq[String], body: String)(
      implicit ec: ExecutionContext): Future[Unit] = {

    val email = Json.prettyPrint(
      Json.obj(
        "from" -> s"Daikoku <daikoku@foo.bar>",
        "to" -> Seq(to.mkString(", ")),
        "subject" -> Seq(title),
        "html" -> Seq(body)
      )
    )
    logger.info(s"Sent email: ${email}")
    FastFuture.successful(())
  }
}

class MailgunSender(wsClient: WSClient, settings: MailgunSettings)
    extends Mailer {

  lazy val logger = Logger("daikoku-mailer")

  def send(title: String, to: Seq[String], body: String)(
      implicit ec: ExecutionContext): Future[Unit] = {

    val templatedBody =
      settings.template.map(t => t.replace("{{email}}", body)).getOrElse(body)

    wsClient
      .url(settings.eu match {
        case true =>
          s"https://api.eu.mailgun.net/v3/${settings.domain}/messages"
        case false => s"https://api.mailgun.net/v3/${settings.domain}/messages"
      })
      .withAuth("api", settings.key, WSAuthScheme.BASIC)
      .post(
        Map(
          "from" -> Seq(s"${settings.fromTitle} <${settings.fromEmail}>"),
          "to" -> Seq(to.mkString(", ")),
          "subject" -> Seq(title),
          "html" -> Seq(templatedBody)
        )
      )
      .andThen {
        case Success(res) => logger.info(s"Alert email sent \r\n ${res.json}")
        case Failure(e)   => logger.error("Error while sending alert email", e)
      }
      .map(_ => ())
  }
}

class MailjetSender(wsClient: WSClient, settings: MailjetSettings)
    extends Mailer {

  lazy val logger = Logger("daikoku-mailer")

  def send(title: String, to: Seq[String], body: String)(
      implicit ec: ExecutionContext): Future[Unit] = {

    val templatedBody =
      settings.template.map(t => t.replace("{{email}}", body)).getOrElse(body)
    wsClient
      .url(s"https://api.mailjet.com/v3.1/send")
      .withAuth(settings.apiKeyPublic,
                settings.apiKeyPrivate,
                WSAuthScheme.BASIC)
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
                to.map(
                  t =>
                    Json.obj(
                      "Email" -> t,
                      "Name" -> t
                  )
                )
              ),
              "Subject" -> title,
              "HTMLPart" -> templatedBody,
              // TextPart
            )
          )
        )
      )
      .andThen {
        case Success(res) => logger.info("Alert email sent")
        case Failure(e)   => logger.error("Error while sending alert email", e)
      }
      .map(_ => ())
  }
}
