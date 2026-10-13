package fr.maif.daikoku.domain

import org.joda.time.DateTime
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.{JsObject, Json}

class KeyringShellSpec extends PlaySpec {
  private val reference = SubscriptionBatchReference(
    SubscriptionBatchDemandId("batch"), SubscriptionBatchItemId("item")
  )
  private val provenance = KeyringShellProvenance(
    reference.batch, SubscriptionBatchKeyringId("shared"), Seq(reference)
  )
  private val keyring = Keyring(
    id = KeyringId("keyring"),
    tenant = TenantId("tenant"),
    team = TeamId("team"),
    customName = "Pending keyring",
    apiKey = OtoroshiApiKey("name", "client", "secret"),
    otoroshiSettings = KeyringOtoroshiBinding.Internal,
    createdAt = new DateTime(1000L),
    integrationToken = "integration",
    enabled = false,
    shell = Some(provenance)
  )
  private val settings = OtoroshiSettings(
    id = OtoroshiSettingsId("otoroshi"),
    url = "http://localhost:8080",
    host = "otoroshi.local",
    keyringEmptyGroup = Some(KeyringEmptyGroup("empty-group", "ownership"))
  )

  "Keyring shell storage" should {
    "round-trip pending provenance and retain it after activation" in {
      json.KeyringFormat.reads(keyring.asJson).get mustBe keyring
      val activated = keyring.copy(
        enabled = true,
        shell = Some(provenance.copy(pendingItems = Seq.empty, activatedAt = Some(new DateTime(2000L))))
      )
      json.KeyringFormat.reads(activated.asJson).get mustBe activated
    }

    "read legacy keyrings and reject malformed provenance" in {
      val legacy = keyring.asJson.as[JsObject] - "shell"
      json.KeyringFormat.reads(legacy).get.shell mustBe None
      json.KeyringFormat.reads(legacy ++ Json.obj("shell" -> Json.obj("batch" -> "batch")))
        .isError mustBe true
      val duplicate = provenance.copy(pendingItems = Seq(reference, reference))
      json.KeyringShellProvenanceFormat.reads(
        json.KeyringShellProvenanceFormat.writes(duplicate)
      ).isError mustBe true
    }

    "round-trip shared group ownership without exposing it in the configuration UI payload" in {
      json.OtoroshiSettingsFormat.reads(settings.asJson).get mustBe settings
      (settings.toUiPayload() \ "keyringEmptyGroup").toOption mustBe None
      (settings.asSafeJson \ "keyringEmptyGroup").toOption mustBe None
      val legacy = settings.asJson.as[JsObject] - "keyringEmptyGroup"
      json.OtoroshiSettingsFormat.reads(legacy).get.keyringEmptyGroup mustBe None
      Seq(
        Json.obj("id" -> "empty-group"),
        Json.obj("id" -> "", "ownershipToken" -> "token"),
        Json.obj("id" -> "empty-group", "ownershipToken" -> "")
      ).foreach { malformed =>
        json.OtoroshiSettingsFormat.reads(
          legacy ++ Json.obj("keyringEmptyGroup" -> malformed)
        ).isError mustBe true
      }
    }
  }
}
