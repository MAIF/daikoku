package fr.maif.daikoku.domain

import fr.maif.daikoku.domain.ThirdPartyPaymentSettings.StripeSettings
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.JsObject

class StripeSettingsSpec extends PlaySpec {

  val settings: StripeSettings = StripeSettings(
    id = ThirdPartyPaymentSettingsId("stripe-test"),
    name = "stripe",
    publicKey = "pk_test_public",
    secretKey = "sk_test_secret"
  )

  "StripeSettings.toUiPayload" must {
    "not expose the secret key in the SPA payload (#1148)" in {
      val payload = settings.toUiPayload.as[JsObject]
      (payload \ "secretKey").toOption mustBe None
      payload.keys must not contain "secretKey"
    }

    "keep the publishable public key" in {
      val payload = settings.toUiPayload.as[JsObject]
      (payload \ "publicKey").as[String] mustBe "pk_test_public"
    }

    "never contain the secret value anywhere in the serialized payload" in {
      settings.toUiPayload.toString must not include "sk_test_secret"
    }
  }
}
