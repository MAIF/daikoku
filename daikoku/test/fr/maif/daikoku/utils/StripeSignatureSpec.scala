package fr.maif.daikoku.utils

import fr.maif.daikoku.utils.StripeSignature.Rejection
import org.scalatestplus.play.PlaySpec

class StripeSignatureSpec extends PlaySpec {

  private val secret = "whsec_test"
  private val payload =
    """{"id":"evt_1","type":"checkout.session.completed"}"""
  private val timestamp = 1700000000L

  // openssl dgst -sha256 -hmac whsec_test of "1700000000.<payload>"
  private val signature =
    "749721cbedbfa4cc1aa6c9c2bec1edd93766a07906c9d9b3dbc7626e4e660caf"

  private def verify(header: String, now: Long = timestamp) =
    StripeSignature.verify(header, payload, secret, now = now)

  "StripeSignature.verify" must {
    "accept the HMAC-SHA256 of `<t>.<body>` keyed with the endpoint secret" in {
      verify(s"t=$timestamp,v1=$signature") mustBe Right(())
    }

    "accept a header carrying several v1 signatures, as Stripe sends during a secret rotation" in {
      verify(s"t=$timestamp,v1=${"0" * 64},v1=$signature") mustBe Right(())
    }

    "ignore the legacy v0 scheme" in {
      verify(s"t=$timestamp,v0=$signature") mustBe Left(Rejection.Malformed)
    }

    "reject a signature computed with another secret" in {
      verify(s"t=$timestamp,v1=${"0" * 64}") mustBe Left(Rejection.Mismatch)
    }

    "reject a body that was tampered with" in {
      StripeSignature.verify(
        s"t=$timestamp,v1=$signature",
        payload.replace("evt_1", "evt_2"),
        secret,
        now = timestamp
      ) mustBe Left(Rejection.Mismatch)
    }

    "reject a timestamp older than the tolerance, so a captured delivery cannot be replayed" in {
      verify(s"t=$timestamp,v1=$signature", now = timestamp + 301) mustBe Left(
        Rejection.Stale
      )
    }

    "accept a timestamp within the tolerance" in {
      verify(s"t=$timestamp,v1=$signature", now = timestamp + 299) mustBe Right(
        ()
      )
    }

    "reject a header without a timestamp or without a signature" in {
      verify(s"v1=$signature") mustBe Left(Rejection.Malformed)
      verify(s"t=$timestamp") mustBe Left(Rejection.Malformed)
      verify("garbage") mustBe Left(Rejection.Malformed)
    }
  }
}
