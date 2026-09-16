package fr.maif.daikoku.utils

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** Checks the `Stripe-Signature` header of a webhook delivery:
  * `t=<unix seconds>,v1=<hex hmac>`, the HMAC-SHA256 of `<t>.<raw body>`
  * keyed with the endpoint secret.
  *
  * Manual verification as described by Stripe:
  * https://docs.stripe.com/webhooks?verify=verify-manually#verify-manually
  */
object StripeSignature {

  enum Rejection {
    case Malformed
    case Stale
    case Mismatch
  }

  private val defaultTolerance = 300L

  def verify(
      header: String,
      payload: String,
      secret: String,
      now: Long = System.currentTimeMillis() / 1000,
      tolerance: Long = defaultTolerance
  ): Either[Rejection, Unit] = {
    val fields = header
      .split(",")
      .toSeq
      .map(_.trim)
      .flatMap(field =>
        field.indexOf('=') match {
          case -1  => None
          case idx => Some(field.take(idx) -> field.drop(idx + 1))
        }
      )
    val timestamp = fields.collectFirst { case ("t", value) => value }
      .flatMap(_.toLongOption)
    val signatures = fields.collect { case ("v1", value) => value }

    (timestamp, signatures) match {
      case (None, _) | (_, Nil) => Left(Rejection.Malformed)
      case (Some(t), _) if math.abs(now - t) > tolerance =>
        Left(Rejection.Stale)
      case (Some(t), candidates) =>
        val expected = sign(secret, s"$t.$payload")
        Either.cond(
          candidates.exists(constantTimeEquals(_, expected)),
          (),
          Rejection.Mismatch
        )
    }
  }

  def sign(secret: String, signedPayload: String): String = {
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(
      new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256")
    )
    mac
      .doFinal(signedPayload.getBytes(StandardCharsets.UTF_8))
      .map("%02x".format(_))
      .mkString
  }

  private def constantTimeEquals(a: String, b: String): Boolean =
    MessageDigest.isEqual(
      a.getBytes(StandardCharsets.UTF_8),
      b.getBytes(StandardCharsets.UTF_8)
    )
}
