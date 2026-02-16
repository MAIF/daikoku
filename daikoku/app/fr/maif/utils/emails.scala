package fr.maif.utils

import fr.maif.domain._
import fr.maif.env.Env
import fr.maif.utils.future.EnhancedObject
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.http.scaladsl.util.FastFuture.EnhancedFuture
import org.owasp.html.HtmlPolicyBuilder
import play.api.Logger
import play.api.i18n.MessagesApi
import play.api.libs.json._
import play.api.libs.ws.JsonBodyWritables.writeableOf_JsValue
import play.api.libs.ws.DefaultBodyWritables.writeableOf_urlEncodedForm
import play.api.libs.ws.{WSAuthScheme, WSClient}

import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success, Try}

object HtmlSanitizer {

  // First define your policy for allowed elements
  private lazy val policy = new HtmlPolicyBuilder()
    .allowElements("p")
    .allowElements("a")
    .allowUrlProtocols("https")
    .allowAttributes("href")
    .onElements("a")
    .requireRelNofollowOnLinks()
    .toFactory()

  def sanitize(unsafeHTML: String): String = policy.sanitize(unsafeHTML)
}

sealed trait Mailer {
  lazy val logger = Logger("daikoku-console-mailer")
  def send(title: String, to: Seq[String], body: String, tenant: Tenant)(
      implicit
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi,
      env: Env,
      language: String
  ): Future[Unit]
  def testConnection(tenant: Tenant)(implicit
      ec: ExecutionContext,
      env: Env
  ): Future[Boolean]
}

object ConsoleMailer {
  def apply() = new ConsoleMailer(ConsoleMailerSettings())
}

class ConsoleMailer(settings: ConsoleMailerSettings) extends Mailer {
  def send(title: String, to: Seq[String], body: String, tenant: Tenant)(
      implicit
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi,
      env: Env,
      language: String
  ): Future[Unit] = {
    translator
      .getMailTemplate(
        "tenant.mail.template",
        tenant,
        Map("email" -> JsString(body))
      )
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

  override def testConnection(
      tenant: Tenant
  )(implicit ec: ExecutionContext, env: Env): Future[Boolean] = true.future
}

class MailgunSender(wsClient: WSClient, settings: MailgunSettings)
    extends Mailer {

  override lazy val logger: Logger = Logger("daikoku-mailer")

  private def _send(
      body: String,
      title: String,
      to: Seq[String],
      sandbox: Boolean = false
  ) = {
    wsClient
      .url(if (settings.eu) {
        s"https://api.eu.mailgun.net/v3/${settings.domain}/messages"
      } else {
        s"https://api.mailgun.net/v3/${settings.domain}/messages"
      })
      .withAuth("api", settings.key, WSAuthScheme.BASIC)
      .post(
        Map(
          "o:testmode" -> Seq(if (sandbox) "yes" else "no"),
          "from" -> Seq(s"${settings.fromTitle} <daikoku@${settings.domain}>"),
          "to" -> to,
          "subject" -> Seq(title),
          "html" ->
            Seq(
              body
                .replace("{{email}}", body)
                .replace("[email]", body)
            ),
          "text" -> Seq(body)
        )
      )
  }

  def send(title: String, to: Seq[String], body: String, tenant: Tenant)(
      implicit
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi,
      env: Env,
      language: String
  ): Future[Unit] = {

    translator
      .getMailTemplate(
        "tenant.mail.template",
        tenant,
        Map("email" -> JsString(body))
      )
      .map(templatedBody => {
        _send(body = templatedBody, title = title, to = to)
          .andThen {
            case Success(res) =>
              logger.info(s"Alert email sent \r\n ${res.json}")
            case Failure(e) =>
              logger.error("Error while sending alert email", e)
          }
          .map(_ -> ())
      })
  }

  override def testConnection(
      tenant: Tenant
  )(implicit ec: ExecutionContext, env: Env): Future[Boolean] = {
    _send(
      body = "Test email",
      title = "Test email",
      to = settings.testingEmail.map(email => Seq(email)).getOrElse(Seq.empty),
      sandbox = true
    ).map(res => res.status < 400)
      .recover { case e =>
        logger.error("Error while testing mailgun email", e)
        false
      }
  }
}

class MailjetSender(wsClient: WSClient, settings: MailjetSettings)
    extends Mailer {

  private def _send(
      body: String,
      title: String,
      to: Seq[String],
      sandbox: Boolean = false
  ) = {
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
          "SandboxMode" -> sandbox,
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
              "HTMLPart" -> body
                .replace("{{email}}", body)
                .replace("[email]", body)
              // TextPart
            )
          )
        )
      )
  }

  def send(title: String, to: Seq[String], body: String, tenant: Tenant)(
      implicit
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi,
      env: Env,
      language: String
  ): Future[Unit] = {

    translator
      .getMailTemplate(
        "tenant.mail.template",
        tenant,
        Map("email" -> JsString(body))
      )
      .map(templatedBody => {
        _send(body = templatedBody, title = title, to = to)
          .andThen {
            case Success(_) =>
              logger.info("Alert email sent")
            case Failure(e) =>
              logger.error("Error while sending alert email", e)
          }
          .map(_ => ())
      })
  }

  override def testConnection(
      tenant: Tenant
  )(implicit ec: ExecutionContext, env: Env): Future[Boolean] = {
    _send(
      body = "<div>this is a test connection</div>",
      title = "test_connection",
      to = Seq("admin@daikoku.io"),
      sandbox = true
    ).map(res => {
      logger.info(res.body)
      res.status < 400
    }).recover { case e =>
      logger.error("Error while testing mailjet email", e)
      false
    }
  }
}

class SimpleSMTPSender(settings: SimpleSMTPSettings) extends Mailer {

  import jakarta.mail._
  import jakarta.mail.internet._

  import java.util.{Date, Properties}

  def send(title: String, to: Seq[String], body: String, tenant: Tenant)(
      implicit
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi,
      env: Env,
      language: String
  ): Future[Unit] = {

    translator
      .getMailTemplate(
        "tenant.mail.template",
        tenant,
        Map("email" -> JsString(body))
      )
      .map(templatedBody => {

        val properties = new Properties()
        properties.put("mail.smtp.host", settings.host)
        properties.put("mail.smtp.port", Integer.valueOf(settings.port))
        properties.put(
          "mail.smtp.auth",
          java.lang.Boolean.valueOf(settings.username.isDefined)
        )

        val authenticator = (settings.username, settings.password) match {
          case (Some(username), Some(password)) =>
            new Authenticator() {
              override def getPasswordAuthentication =
                new PasswordAuthentication(username, password)
            }
          case _ => null
        }

        Future
          .sequence(
            to.map(InternetAddress.parse)
              .map { address =>
                val session = Session.getInstance(properties, authenticator)
                val message: Message =
                  new MimeMessage(
                    session
                  )
                message.setFrom(new InternetAddress(settings.fromEmail))
                message.setRecipients(
                  Message.RecipientType.TO,
                  address.asInstanceOf[Array[Address]]
                )

                message.setSentDate(new Date())
                message.setSubject(title)
                message.setContent(
                  templatedBody
                    .replace("{{email}}", body)
                    .replace("[email]", body),
                  "text/html; charset=utf-8"
                )

                Try {
                  Transport.send(message)
                  logger.debug(
                    s"Alert email sent to : ${address.mkString("Array(", ", ", ")")}"
                  )
                  logger.debug(s"title: $title -- body: $body")
                } recover { case e: Exception =>
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

  override def testConnection(
      tenant: Tenant
  )(implicit ec: ExecutionContext, env: Env): Future[Boolean] = {
    val properties = new Properties()
    properties.put("mail.smtp.host", settings.host)
    properties.put("mail.smtp.port", Integer.valueOf(settings.port))
    properties.put(
      "mail.smtp.auth",
      java.lang.Boolean.valueOf(settings.username.isDefined).toString
    )

    val authenticator = (settings.username, settings.password) match {
      case (Some(username), Some(password)) =>
        new Authenticator() {
          override def getPasswordAuthentication =
            new PasswordAuthentication(username, password)
        }
      case _ => null
    }

    val session = Session.getInstance(properties, authenticator)

    Try {
      val transport = session.getTransport("smtp")
      transport.connect(settings.host, settings.port.toInt, null, null)
      transport.close() // Important : fermer la connexion après le test
    } match {
      case Failure(e) =>
        logger.error("Error while testing smtp email", e)
        false.future
      case Success(_) =>
        true.future
    }
  }

}

class SendgridSender(ws: WSClient, settings: SendgridSettings) extends Mailer {
  private def _send(
      body: String,
      title: String,
      to: Seq[String],
      sandbox: Boolean = false
  ) = {
    ws.url(s"https://api.sendgrid.com/v3/mail/send")
      .withHttpHeaders(
        "Authorization" -> s"Bearer ${settings.apikey}",
        "Content-Type" -> "application/json"
      )
      .post(
        Json.obj(
          "mail_settings" -> Json
            .obj("sandbox_mode" -> Json.obj("enable" -> sandbox)),
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
              "value" -> body
                .replace("{{email}}", body)
                .replace("[email]", body)
            )
          )
        )
      )
  }

  def send(title: String, to: Seq[String], body: String, tenant: Tenant)(
      implicit
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi,
      env: Env,
      language: String
  ): Future[Unit] = {

    translator
      .getMailTemplate(
        "tenant.mail.template",
        tenant,
        Map("email" -> JsString(body))
      )
      .map(templatedBody => {
        _send(templatedBody, title, to)
          .andThen {
            case Success(_) =>
              logger.info(s"Alert email sent : $to")
            case Failure(e) =>
              logger.error("Error while sending alert email", e)
          }
          .fast
          .map(_ => ())
      })
  }

  override def testConnection(
      tenant: Tenant
  )(implicit ec: ExecutionContext, env: Env): Future[Boolean] =
    _send(
      body = "<div>this is a test connection</div>",
      title = "test_connection",
      Seq("admin@daikoku.io"),
      sandbox = true
    ).map(res => {
      res.status < 400
    }).recover { case e =>
      logger.error("Error while testing sendgrid email", e)
      false
    }
}
