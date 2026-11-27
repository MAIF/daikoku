package fr.maif.daikoku.utils

import fr.maif.daikoku.domain.{SubscriptionProcess, TeamId, ValidationStep}
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.Json

class SubscriptionUtilSpec extends PlaySpec {

  private val form = ValidationStep.Form(
    id = "form",
    title = "Motivation",
    schema = Some(Json.obj("reason" -> Json.obj("type" -> "string"))),
    formatter = Some("[[reason]]"),
    formKeysToMetadata = Some(Seq("reason"))
  )
  private val admin = ValidationStep.TeamAdmin(
    id = "admin",
    team = TeamId("producer-a"),
    title = "Approval"
  )
  private val email = ValidationStep.Email(
    id = "email",
    emails = Seq("legal@example.com"),
    message = Some("Please approve"),
    title = "Legal"
  )
  private val http = ValidationStep.HttpRequest(
    id = "http",
    title = "Eligibility",
    url = "https://example.com/validate",
    headers = Map("X-Validation" -> "subscription")
  )

  "areBatchProcessesCompatible" should {

    "accept an empty selection or only empty processes" in {
      SubscriptionUtil.areBatchProcessesCompatible(Seq.empty) mustBe true
      SubscriptionUtil.areBatchProcessesCompatible(
        Seq(SubscriptionProcess(), SubscriptionProcess())
      ) mustBe true
    }

    "accept a single nonempty process" in {
      SubscriptionUtil.areBatchProcessesCompatible(
        Seq(SubscriptionProcess(Seq(form, admin, email, http)))
      ) mustBe true
    }

    "accept matching processes with empty processes in any position" in {
      val processes = Seq(
        SubscriptionProcess(),
        SubscriptionProcess(Seq(form, admin, email, http)),
        SubscriptionProcess(Seq(
          form,
          admin.copy(team = TeamId("producer-b")),
          email,
          http
        ))
      )

      processes.permutations.foreach { selection =>
        SubscriptionUtil.areBatchProcessesCompatible(selection) mustBe true
      }
    }

    "reject different nonempty processes even with an empty process between them" in {
      val processes = Seq(
        SubscriptionProcess(Seq(form, admin, email, http)),
        SubscriptionProcess(),
        SubscriptionProcess(Seq(
          form,
          admin,
          email,
          http.copy(url = "https://example.com/other")
        ))
      )

      processes.permutations.foreach { selection =>
        SubscriptionUtil.areBatchProcessesCompatible(selection) mustBe false
      }
    }

    "reject different forms even when the approver teams differ" in {
      SubscriptionUtil.areBatchProcessesCompatible(Seq(
        SubscriptionProcess(Seq(form, admin)),
        SubscriptionProcess(Seq(
          form.copy(schema = Some(
            Json.obj("reason" -> Json.obj("type" -> "number"))
          )),
          admin.copy(team = TeamId("producer-b"))
        ))
      )) mustBe false
    }
  }

  "batchProcessChecksum" should {

    "return no signature for an empty process" in {
      SubscriptionUtil.batchProcessChecksum(Seq.empty) mustBe None
      SubscriptionUtil.processChecksum(Seq.empty) mustBe None
    }

    "allow different approver teams without changing the classic checksum" in {
      val first = Seq(form, admin, email, http)
      val second = Seq(
        form,
        admin.copy(team = TeamId("producer-b")),
        email,
        http
      )

      SubscriptionUtil.batchProcessChecksum(first) mustBe
        SubscriptionUtil.batchProcessChecksum(second)
      SubscriptionUtil.processChecksum(first) must not be
        SubscriptionUtil.processChecksum(second)
    }

    "ignore random step identifiers and cosmetic titles" in {
      val first = Seq(form, admin, email, http)
      val second = Seq(
        form.copy(id = "other-form", title = "Other form"),
        admin.copy(id = "other-admin", title = "Other approval"),
        email.copy(id = "other-email", title = "Other email"),
        http.copy(id = "other-http", title = "Other HTTP")
      )

      SubscriptionUtil.batchProcessChecksum(first) mustBe
        SubscriptionUtil.batchProcessChecksum(second)
      SubscriptionUtil.processChecksum(first) mustBe
        SubscriptionUtil.processChecksum(second)
    }

    "normalize nested JSON object key order" in {
      val first = form.copy(schema = Some(Json.obj(
        "reason" -> Json.obj("type" -> "string", "label" -> "Reason"),
        "details" -> Json.obj("type" -> "string")
      )))
      val second = form.copy(schema = Some(Json.obj(
        "details" -> Json.obj("type" -> "string"),
        "reason" -> Json.obj("label" -> "Reason", "type" -> "string")
      )))

      SubscriptionUtil.batchProcessChecksum(Seq(first)) mustBe
        SubscriptionUtil.batchProcessChecksum(Seq(second))
    }

    "keep every meaningful form setting significant" in {
      val changes = Seq(
        form.copy(schema = Some(
          Json.obj("reason" -> Json.obj("type" -> "number"))
        )),
        form.copy(formatter = Some("Reason: [[reason]]")),
        form.copy(formKeysToMetadata = Some(Seq.empty)),
        form.copy(info = Some("Additional instructions"))
      )

      changes.foreach { changed =>
        SubscriptionUtil.batchProcessChecksum(Seq(form)) must not be
          SubscriptionUtil.batchProcessChecksum(Seq(changed))
      }
    }

    "keep HTTP and email settings significant" in {
      val changes = Seq(
        Seq(http.copy(url = "https://example.com/other"), email),
        Seq(http.copy(headers = Map("X-Validation" -> "other")), email),
        Seq(http, email.copy(emails = Seq("finance@example.com"))),
        Seq(http, email.copy(message = Some("Different instructions")))
      )

      changes.foreach { changed =>
        SubscriptionUtil.batchProcessChecksum(Seq(http, email)) must not be
          SubscriptionUtil.batchProcessChecksum(changed)
      }
    }

    "preserve step order and array order" in {
      SubscriptionUtil.batchProcessChecksum(Seq(admin, email)) must not be
        SubscriptionUtil.batchProcessChecksum(Seq(email, admin))

      val first = email.copy(emails =
        Seq("legal@example.com", "finance@example.com")
      )
      val second = first.copy(emails = first.emails.reverse)
      SubscriptionUtil.batchProcessChecksum(Seq(first)) must not be
        SubscriptionUtil.batchProcessChecksum(Seq(second))
    }

    "produce the classic signature when there is no admin step" in {
      val steps = Seq(form, email, http)

      SubscriptionUtil.batchProcessChecksum(steps) mustBe
        SubscriptionUtil.processChecksum(steps)
    }
  }

  "SubscriptionProcess" should {

    "expose both signatures without changing classic compatibility" in {
      val first = SubscriptionProcess(Seq(form, admin))
      val second = SubscriptionProcess(Seq(
        form,
        admin.copy(team = TeamId("producer-b"))
      ))

      first.batchChecksum mustBe
        SubscriptionUtil.batchProcessChecksum(first.steps)
      first.batchChecksum mustBe second.batchChecksum
      first.checksum must not be second.checksum
    }

    "expose absent signatures for an empty process" in {
      val process = SubscriptionProcess()

      process.checksum mustBe None
      process.batchChecksum mustBe None
    }
  }
}
