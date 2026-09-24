package fr.maif.daikoku.domain

import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import com.sun.net.httpserver.HttpServer
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import fr.maif.daikoku.utils.{OAuth2TokenProvider, Translator}
import jakarta.mail.{Folder, Session}
import org.scalatest.BeforeAndAfter
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.wait.strategy.Wait
import play.api.i18n.MessagesApi

import java.util.Properties
import java.util.concurrent.atomic.AtomicInteger
import scala.compiletime.uninitialized
import scala.concurrent.{Await, ExecutionContext}
import scala.concurrent.duration.*

class SMTPOauth2SenderSpec
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfter
    with ForAllTestContainer {

  implicit val ecc: ExecutionContext =
    daikokuComponents.env.defaultExecutionContext
  implicit val ev: Env = daikokuComponents.env
  implicit val translator: Translator = daikokuComponents.translator
  implicit val messageApi: MessagesApi = daikokuComponents.mesessagesApi
  implicit val language: String = "Fr"

  private val accessToken = "test-access-token"
  private val tokenCalls = new AtomicInteger(0)

  override val container: GenericContainer = GenericContainer(
    "greenmail/standalone:2.1.14",
    exposedPorts = Seq(3025, 3143),
    env = Map(
      "GREENMAIL_OPTS" ->
        """-Dgreenmail.setup.test.smtp
          |-Dgreenmail.setup.test.imap
          |-Dgreenmail.hostname=0.0.0.0
          |-Dgreenmail.auth.disabled
          |""".stripMargin
    ),
    waitStrategy = Wait.forListeningPort()
  )

//  private val oauthServer: HttpServer =
//    startOAuthServer()

  private var server: HttpServer = uninitialized

  before {
    server = startOAuthServer()
    logger.info(
      s"OAuth test server started on port ${server.getAddress.getPort}"
    )
  }

  after {
    server.stop(0)
  }

  private def startOAuthServer(): HttpServer = {
    val server = HttpServer.create(
      new java.net.InetSocketAddress("127.0.0.1", 0),
      0
    )

    server.createContext(
      "/oauth2/v2.0/token",
      (exchange: com.sun.net.httpserver.HttpExchange) => {
        tokenCalls.incrementAndGet()

        val response =
          s"""{
            |  "access_token": "test-access-token",
            |  "token_type": "Bearer",
            |  "expires_in": 3600
            |}""".stripMargin

        val bytes =
          response.getBytes(java.nio.charset.StandardCharsets.UTF_8)

        exchange.getResponseHeaders.set(
          "Content-Type",
          "application/json"
        )
        exchange.sendResponseHeaders(200, bytes.length)

        try {
          exchange.getResponseBody.write(bytes)
        } finally {
          exchange.close()
        }
      }
    )

    server.start()
    server
  }

  case class ReceivedEmail(
                            subject: String,
                            from: Seq[String],
                            to: Seq[String]
                          )

  def receivedEmails(): Array[ReceivedEmail] = {
    val properties = new Properties()
    properties.put("mail.store.protocol", "imap")
    properties.put("mail.imap.host", container.host)
    properties.put(
      "mail.imap.port",
      container.mappedPort(3143).toString
    )
    properties.put("mail.imap.ssl.enable", "false")

    val session = Session.getInstance(properties)
    val store = session.getStore("imap")


    store.connect(
      "test@example.com",
      "test-password"
    )

    val inbox = store.getFolder("INBOX")
    inbox.open(Folder.READ_ONLY)

    try {
      inbox.getMessages.map { message =>
        ReceivedEmail(
          subject = message.getSubject,
          from = message.getFrom.toSeq.map(_.toString),
          to = message.getAllRecipients.toSeq.map(_.toString)
        )
      }
    } finally {
      inbox.close(false)
      store.close()
    }
  }

  "OAuth2TokenProvider" should {

    "retrieve an access token" in {
      val port = server.getAddress.getPort

      val settings = SMTPOauth2Settings(
        host = "localhost",
        port = 587,
        username = "test@example.com",
        fromTitle = "Test",
        fromEmail = "test@example.com",
        template = None,
        clientId = "test-client",
        clientSecret = "test-secret",
        scope = "test-scope",
        tokenUrl = s"http://127.0.0.1:$port/oauth2/v2.0/token"
      )

      implicit val wsClient = daikokuComponents.wsClient
      val result = OAuth2TokenProvider
        .getToken(settings)
        .value

      whenReady(result) { value =>
        println(s"OAuth result: $value")

        value mustBe Right(accessToken)
      }

      tokenCalls.get() mustBe 1
    }
  }

  "SMTPOauth2Sender" should {

    "authenticate to SMTP using an OAuth2 access token" in {
      val smtpPort = container.mappedPort(3025)
      val oauthPort = server.getAddress.getPort

      val settings = SMTPOauth2Settings(
        host = container.host,
        port = smtpPort,
        username = "test@daikoku.io",
        fromTitle = "Daikoku",
        fromEmail = "test@daikoku.io",
        template = None,
        clientId = "test-client",
        clientSecret = "test-secret",
        scope = "https://outlook.office365.com/.default",
        tokenUrl = s"http://127.0.0.1:$oauthPort/oauth2/v2.0/token",
        starttls = Some(false),
        ssl = Some(false)
      )

      val sender = settings.mailer
      Await.result(
        sender.send(
          title = "Test OAuth2",
          to = Seq("test@example.com"),
          body = "hello from OAuth2",
          tenant = tenant
        ),
        10.seconds
      )

      val messages = receivedEmails()
      messages must have size 1
      messages.head.subject mustBe "Test OAuth2"
    }

    "reuse the OAuth2 token for multiple emails" in {
      tokenCalls.set(0)

      val smtpPort = container.mappedPort(3025)
      val oauthPort = server.getAddress.getPort

      val settings = SMTPOauth2Settings(
        host = container.host,
        port = smtpPort,
        username = "test@daikoku.io",
        fromTitle = "Daikoku",
        fromEmail = "test@daikoku.io",
        template = None,
        clientId = "test-client",
        clientSecret = "test-secret",
        scope = "https://outlook.office365.com/.default",
        tokenUrl = s"http://127.0.0.1:$oauthPort/oauth2/v2.0/token",
        starttls = Some(false),
        ssl = Some(false)
      )

      val sender = settings.mailer

      Await.result(
        sender.send(
          "Mail 1",
          Seq("test@example.com"),
          "Premier mail",
          tenant
        ),
        5.seconds
      )

      Await.result(
        sender.send(
          "Mail 2",
          Seq("test@example.com"),
          "Deuxième mail",
          tenant
        ),
        5.seconds
      )

      tokenCalls.get() mustBe 1
    }
  }
}
