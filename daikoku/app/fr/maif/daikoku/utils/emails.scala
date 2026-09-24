package fr.maif.daikoku.utils

import cats.data.EitherT
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.logger.AppLogger
import fr.maif.daikoku.utils.future.EnhancedObject
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.http.scaladsl.util.FastFuture.EnhancedFuture
import org.owasp.html.HtmlPolicyBuilder
import play.api.Logger
import play.api.i18n.MessagesApi
import play.api.libs.json.*
import play.api.libs.ws.DefaultBodyWritables.writeableOf_urlEncodedForm
import play.api.libs.ws.JsonBodyWritables.writeableOf_JsValue
import play.api.libs.ws.{DefaultBodyWritables, WSAuthScheme, WSClient}

import java.util.concurrent.ConcurrentHashMap
import java.util.{Date, Properties}
import scala.concurrent.duration.*
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
    .toFactory

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

  import jakarta.mail.*
  import jakarta.mail.internet.*

  import java.util.{Date, Properties}

  /** Build the JavaMail properties, including TLS handling.
    *
    * Port 587 uses STARTTLS (upgrade a plaintext connection), port 465 uses
    * implicit SSL/TLS. Both are deduced from the port when not explicitly set,
    * see [[SimpleSMTPSettings.useStartTls]] / [[SimpleSMTPSettings.useSsl]].
    * Without this, providers such as Scaleway reject authentication ("502 5.7.0
    * Please authenticate first" on 587) or refuse plaintext connections (on
    * 465).
    */
  private def buildProperties(): Properties = {
    val properties = new Properties()
    properties.put("mail.smtp.host", settings.host)
    properties.put("mail.smtp.port", Integer.valueOf(settings.port))
    properties.put(
      "mail.smtp.auth",
      java.lang.Boolean.valueOf(settings.username.isDefined)
    )

    if (settings.useStartTls) {
      properties.put("mail.smtp.starttls.enable", "true")
      properties.put("mail.smtp.starttls.required", "true")
    }

    if (settings.useSsl) {
      properties.put("mail.smtp.ssl.enable", "true")
      properties.put("mail.smtp.ssl.checkserveridentity", "true")
    }

    properties
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

        val properties = buildProperties()

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
    val properties = buildProperties()

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
      // Connect with the configured credentials so the test also validates
      // authentication (and STARTTLS/SSL), not only TCP reachability.
      transport.connect(
        settings.host,
        settings.port.toInt,
        settings.username.orNull,
        settings.password.orNull
      )
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

object OAuth2TokenProvider extends DefaultBodyWritables {

  private val log = Logger("OAuth2TokenProvider")

  // on renouvelle un peu avant l'expiration réelle
  private val SafetyMarginMs = 60.seconds.toMillis

  private case class CacheKey(
      tokenUrl: String,
      clientId: String,
      scope: String,
      secretHash: Int
  )
  private case class CachedToken(value: String, expiresAtMs: Long)

  private val cache = new ConcurrentHashMap[CacheKey, CachedToken]()
  // un seul appel au token endpoint à la fois pour une même config
  private val inflight =
    new ConcurrentHashMap[CacheKey, EitherT[Future, AppError, String]]()

  def getToken(settings: SMTPOauth2Settings, forceRefresh: Boolean = false)(
      implicit
      ec: ExecutionContext,
      ws: WSClient
  ): EitherT[Future, AppError, String] = {
    val key = CacheKey(
      settings.tokenUrl,
      settings.clientId,
      settings.scope,
      settings.clientSecret.hashCode
    )
    if (forceRefresh) cache.remove(key)

    Option(cache.get(key))
      .filter(_.expiresAtMs > System.currentTimeMillis()) match {
      case Some(token) =>
        EitherT.pure[Future, AppError](token.value)
      case None =>
        inflight.computeIfAbsent(
          key,
          _ => {
            val fetched = fetch(settings)

            fetched
              .map { token =>
                cache.put(key, token)
                inflight.remove(key)
                token.value
              }
              .leftMap(error => {
                AppLogger.error(error.getErrorMessage())
                inflight.remove(key)
                error
              })
          }
        )
    }
  }

  private def fetch(
      settings: SMTPOauth2Settings
  )(implicit
      ec: ExecutionContext,
      ws: WSClient
  ): EitherT[Future, AppError, CachedToken] = {
    for {
      resp <- EitherT(
        ws
          .url(settings.tokenUrl)
          .withRequestTimeout(10.seconds)
          .post(
            Map(
              "grant_type" -> Seq("client_credentials"),
              "client_id" -> Seq(settings.clientId),
              "client_secret" -> Seq(settings.clientSecret),
              "scope" -> Seq(settings.scope)
            )
          )
          .map { resp =>
            log.info(
              s"OAuth2 token endpoint returned ${resp.status}"
            )
            Right(resp)
          }
          .recover {
            case e =>
              AppLogger.error(e.getMessage, e)
              Left(
                AppError.SmtpAuthenticationError(
                  s"Unable to reach OAuth2 token endpoint: ${e.getMessage}"
                )
              )
          }
      )
      _ <- EitherT.cond[Future](
        resp.status == 200,
        (),
        AppError.SmtpAuthenticationError(
          s"Token endpoint answered HTTP ${resp.status}: ${describeError(resp.body)}"
        )
      )
      accessToken <- EitherT.fromOption[Future][AppError, String](
        (resp.json \ "access_token").asOpt[String],
        AppError.SmtpAuthenticationError("access_token from token response not found")
      )
      // certains fournisseurs renvoient expires_in en string
      expiresIn = (resp.json \ "expires_in")
        .asOpt[Long]
        .orElse(
          (resp.json \ "expires_in")
            .asOpt[String]
            .flatMap(s => Try(s.toLong).toOption)
        )
        .getOrElse(3600L)
    } yield {
      CachedToken(
        accessToken,
        System.currentTimeMillis() + expiresIn * 1000 - SafetyMarginMs
      )
    }
  }

  // ne jamais logger le token ni le secret ; on ne garde que error / error_description
  private def describeError(body: String): String =
    Try(Json.parse(body)).toOption
      .flatMap { json =>
        (json \ "error").asOpt[String].map { error =>
          error + (json \ "error_description")
            .asOpt[String]
            .map(d => s" - $d")
            .getOrElse("")
        }
      }
      .getOrElse(body)
      .take(300)
}

class SMTPOauth2Sender(settings: SMTPOauth2Settings) extends Mailer {

  import jakarta.mail.*
  import jakarta.mail.internet.*

  private val log = Logger("SmtpOAuth2Sender")

  private def buildProperties(): Properties = {
    val properties = new Properties()
    properties.put("mail.smtp.host", settings.host)
    properties.put("mail.smtp.port", Integer.valueOf(settings.port))
    properties.put("mail.smtp.auth", "true")
    // XOAUTH2 n'est pas dans la liste par défaut de Jakarta Mail
    properties.put("mail.smtp.auth.mechanisms", "XOAUTH2")
    properties.put("mail.debug", "true")
    // évite les threads bloqués sur un serveur qui ne répond pas
    properties.put("mail.smtp.connectiontimeout", "10000")
    properties.put("mail.smtp.timeout", "30000")

    if (settings.starttls.exists(identity)) {
      properties.put("mail.smtp.starttls.enable", "true")
      properties.put("mail.smtp.starttls.required", "true")
    }
    if (settings.ssl.exists(identity)) {
      properties.put("mail.smtp.ssl.enable", "true")
    }
    if (settings.starttls.exists(identity) || settings.ssl.exists(identity)) {
      properties.put("mail.smtp.ssl.checkserveridentity", "true")
    }
    properties
  }

  private def isAuthenticationError(error: AppError): Boolean =
    error match {
      case e: AppError.SmtpAuthenticationError => true
      case _ => false
    }

  /** Ouvre une connexion SMTP authentifiée par token, exécute `f`, ferme. Si
    * l'auth échoue (token révoqué, cache périmé...), on retente une fois avec
    * un token neuf.
    */
  private def withTransport[A](f: (Session, Transport) => A)(implicit
      ec: ExecutionContext,
      env: Env
  ): EitherT[Future, AppError, A] = {
    implicit val ws: WSClient = env.wsClient // à adapter selon Env

    def attempt(forceRefresh: Boolean): EitherT[Future, AppError, A] = {
      OAuth2TokenProvider
        .getToken(settings, forceRefresh)
        .map { token =>
          val session = Session.getInstance(buildProperties())
          val transport = session.getTransport("smtp")
          try {
            // le token est passé à la place du mot de passe
            transport.connect(
              settings.host,
              settings.port,
              settings.username,
              token
            )
            f(session, transport)
          } finally {
            Try(transport.close())
          }
        }
    }

    attempt(forceRefresh = false)
      .leftFlatMap(e => {
        log.warn(
          "SMTP authentication failed, retrying once with a fresh OAuth2 token"
        )
        log.warn(e.getErrorMessage())

        if (isAuthenticationError(e)) {
          attempt(forceRefresh = true)
        } else {
          EitherT.leftT[Future, A](e)
        }
      })
  }

  private def buildMessage(
      session: Session,
      recipients: Array[Address],
      title: String,
      html: String
  ): MimeMessage = {
    val message = new MimeMessage(session)
    message.setFrom(new InternetAddress(settings.fromEmail))
    message.setRecipients(Message.RecipientType.TO, recipients)
    message.setSentDate(new Date())
    message.setSubject(title)
    message.setContent(html, "text/html; charset=utf-8")
    message
  }

  private def _send(
      title: String,
      to: Seq[String],
      body: String,
      tenant: Tenant
  )(implicit
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi,
      env: Env,
      language: String
  ): EitherT[Future, AppError, Unit] = {
    for {
      templatedBody <- EitherT.right[AppError](
        translator
          .getMailTemplate(
            "tenant.mail.template",
            tenant,
            Map("email" -> JsString(body))
          )
      )
      html = templatedBody
        .replace("{{email}}", body)
        .replace("[email]", body)
      _ <- withTransport { (session, transport) =>
        to.foreach { recipient =>
          val addresses =
            InternetAddress.parse(recipient).map(a => a: Address)
          val message = buildMessage(session, addresses, title, html)
          transport.sendMessage(message, message.getAllRecipients)
          log.info(s"Alert email sent to : $recipient")
        }
      }
    } yield ()
  }

  override def send(
      title: String,
      to: Seq[String],
      body: String,
      tenant: Tenant
  )(implicit
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi,
      env: Env,
      language: String
  ): Future[Unit] =
    _send(title, to, body, tenant)
      .leftMap(error => {
        logger.error(
          s"Error while sending alert email to [${to.mkString(",")}]"
        )
        logger.error(error.getErrorMessage())
      })
      .merge

  private def _testConnection(
      tenant: Tenant
  )(implicit
      ec: ExecutionContext,
      env: Env
  ): EitherT[Future, AppError, Boolean] = {
    withTransport((_, _) => ())
      .map(_ => true)
  }

  override def testConnection(
      tenant: Tenant
  )(implicit ec: ExecutionContext, env: Env): Future[Boolean] =
    _testConnection(tenant)
      .leftMap(error => {
        logger.error(
          s"SMTP OAuth2 test failed (SMTP connection/authentication)"
        )
        logger.error(error.getErrorMessage())
        false
      })
      .merge
}
