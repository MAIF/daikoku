package fr.maif.daikoku.domain

import org.scalatestplus.play.PlaySpec
import play.api.libs.json.Json

/** Pure unit tests for the SMTP TLS configuration logic introduced to fix
  * authentication against providers such as Scaleway (STARTTLS on 587, implicit
  * SSL/TLS on 465). No container needed.
  */
class SimpleSMTPSettingsSpec extends PlaySpec {

  private def settings(
      port: String,
      starttls: Option[Boolean] = None,
      ssl: Option[Boolean] = None
  ): SimpleSMTPSettings =
    SimpleSMTPSettings(
      host = "smtp.example.com",
      port = port,
      fromTitle = "test",
      fromEmail = "noreply@example.com",
      template = None,
      username = Some("user"),
      password = Some("pwd"),
      starttls = starttls,
      ssl = ssl
    )

  "SimpleSMTPSettings TLS deduction" should {
    "deduce STARTTLS on port 587" in {
      val s = settings(port = "587")
      s.useStartTls mustBe true
      s.useSsl mustBe false
    }

    "deduce implicit SSL/TLS on port 465" in {
      val s = settings(port = "465")
      s.useSsl mustBe true
      s.useStartTls mustBe false
    }

    "use neither on a plaintext port like 25" in {
      val s = settings(port = "25")
      s.useStartTls mustBe false
      s.useSsl mustBe false
    }

    "let an explicit value override the port deduction" in {
      // STARTTLS explicitly disabled on 587
      settings(port = "587", starttls = Some(false)).useStartTls mustBe false
      // SSL explicitly enabled on a non-standard port
      settings(port = "2525", ssl = Some(true)).useSsl mustBe true
      // STARTTLS explicitly enabled on a non-standard port
      settings(port = "1234", starttls = Some(true)).useStartTls mustBe true
    }
  }

  "SimpleSMTPSettings JSON format" should {
    "round-trip the starttls and ssl fields" in {
      val original = settings(port = "587", starttls = Some(true), ssl = Some(false))
      val parsed = json.SimpleSMTPClientSettingsFormat
        .reads(original.asJson)
        .get
      parsed.starttls mustBe Some(true)
      parsed.ssl mustBe Some(false)
    }

    "default to None when the fields are absent (backward compatibility)" in {
      val legacyJson = Json.obj(
        "type" -> "smtpClient",
        "host" -> "smtp.example.com",
        "port" -> "587",
        "fromTitle" -> "test",
        "fromEmail" -> "noreply@example.com",
        "username" -> "user",
        "password" -> "pwd"
      )
      val parsed = json.SimpleSMTPClientSettingsFormat.reads(legacyJson).get
      parsed.starttls mustBe None
      parsed.ssl mustBe None
      // and the port-based deduction still kicks in
      parsed.useStartTls mustBe true
    }
  }
}
