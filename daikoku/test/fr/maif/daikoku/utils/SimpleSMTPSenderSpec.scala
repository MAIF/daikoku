package fr.maif.daikoku.utils

import com.dimafeng.testcontainers.GenericContainer.FileSystemBind
import com.dimafeng.testcontainers.lifecycle.and
import com.dimafeng.testcontainers.scalatest.TestContainersForAll
import com.dimafeng.testcontainers.GenericContainer
import fr.maif.daikoku.domain.SimpleSMTPSettings
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.BindMode

import scala.concurrent.Await
import scala.concurrent.duration.DurationInt

/** Integration tests for [[SimpleSMTPSender.testConnection]] against a real,
  * TLS-capable SMTP server (axllent/mailpit in a testcontainer).
  *
  * Two mailpit instances are started, both with authentication enabled and the
  * self-signed certificate from `test/resources/smtp/` (trusted by the forked
  * test JVM, see `Test / javaOptions` in build.sbt):
  *   - one requiring STARTTLS (port 587 style)
  *   - one requiring implicit SSL/TLS (port 465 style)
  *
  * This lets us assert the core of the fix: a *validated* TLS handshake
  * succeeds with the right credentials (which is what the client's Scaleway
  * server required), and wrong credentials are rejected. The port-based TLS
  * deduction itself is unit-tested in
  * `fr.maif.daikoku.domain.SimpleSMTPSettingsSpec`.
  */
class SimpleSMTPSenderSpec
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with TestContainersForAll {

  override type Containers = GenericContainer and GenericContainer

  private val pwd = System.getProperty("user.dir")
  private val smtpUser = "testuser"
  private val smtpPassword = "testpassword"

  private def tlsBinds = Seq(
    FileSystemBind(
      s"$pwd/test/resources/smtp/auth.txt",
      "/auth.txt",
      BindMode.READ_ONLY
    ),
    FileSystemBind(
      s"$pwd/test/resources/smtp/smtp.crt",
      "/smtp.crt",
      BindMode.READ_ONLY
    ),
    FileSystemBind(
      s"$pwd/test/resources/smtp/smtp.key",
      "/smtp.key",
      BindMode.READ_ONLY
    )
  )

  private def mailpit(requireFlag: String): GenericContainer =
    GenericContainer
      .Def(
        dockerImage = "axllent/mailpit:latest",
        exposedPorts = Seq(1025),
        fileSystemBind = tlsBinds,
        command = Seq(
          "--smtp-auth-file",
          "/auth.txt",
          "--smtp-tls-cert",
          "/smtp.crt",
          "--smtp-tls-key",
          "/smtp.key",
          requireFlag
        )
      )
      .start()

  override def startContainers(): Containers =
    mailpit("--smtp-require-starttls") and mailpit("--smtp-require-tls")

  private implicit lazy val env: Env = daikokuComponents.env

  private def smtpSettings(
      port: Int,
      username: Option[String] = Some(smtpUser),
      password: Option[String] = Some(smtpPassword),
      starttls: Option[Boolean] = None,
      ssl: Option[Boolean] = None
  ) = SimpleSMTPSettings(
    host = "localhost",
    port = port.toString,
    fromTitle = "testMailerSMTP",
    fromEmail = "noreply@test.io",
    template = None,
    username = username,
    password = password,
    starttls = starttls,
    ssl = ssl
  )

  private def connect(settings: SimpleSMTPSettings): Boolean =
    Await.result(
      new SimpleSMTPSender(settings).testConnection(tenant),
      30.seconds
    )

  "SimpleSMTPSender.testConnection" should {
    "validate a STARTTLS connection with correct credentials" in withContainers {
      case (starttls: GenericContainer) and (_: GenericContainer) =>
        connect(
          smtpSettings(starttls.mappedPort(1025), starttls = Some(true))
        ) mustBe true
    }

    "reject wrong credentials over STARTTLS" in withContainers {
      case (starttls: GenericContainer) and (_: GenericContainer) =>
        connect(
          smtpSettings(
            starttls.mappedPort(1025),
            password = Some("wrong-password"),
            starttls = Some(true)
          )
        ) mustBe false
    }

    "validate an implicit SSL/TLS connection (port 465 style)" in withContainers {
      case (_: GenericContainer) and (tls: GenericContainer) =>
        connect(
          smtpSettings(tls.mappedPort(1025), ssl = Some(true))
        ) mustBe true
    }

    "fail against an unreachable SMTP server" in withContainers {
      case (_: GenericContainer) and (_: GenericContainer) =>
        // nothing listens on this port
        connect(smtpSettings(1)) mustBe false
    }
  }
}
