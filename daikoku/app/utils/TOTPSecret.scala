package utils

import java.security.SecureRandom
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import scala.math.pow
import scala.util.Random

class TOTPSecret(private val underlying: BigInt) {

  private val B32 = ('A' to 'Z') ++ ('2' to '7')

  def toBase32: String =
    new String(underlying.toString(32).toCharArray.map(_.asDigit).map(B32(_)))

  def toByteArray: Array[Byte] = {
    val b = underlying.toByteArray
    if (b(0) == 0) b.tail else b
  }
}

object TOTPSecret {
  def apply(b32Digits: Int): TOTPSecret = {
    val r = new Random(new SecureRandom)
    new TOTPSecret(
      (2 to b32Digits).foldLeft(BigInt(r.nextInt(31)) + 1: BigInt)((a, _) =>
        a * 32 + r.nextInt(32)
      )
    )
  }
}

object Authenticator {

  def totp(
      secret: TOTPSecret,
      time: Long,
      returnDigits: Int,
      crypto: String
  ): String = {

    val msg: Array[Byte] =
      BigInt(time).toByteArray.reverse.padTo(8, 0.toByte).reverse
    val hash = hmac_sha(crypto, secret.toByteArray, msg)
    val offset: Int = hash(hash.length - 1) & 0xf
    val binary: Long = ((hash(offset) & 0x7f) << 24) |
      ((hash(offset + 1) & 0xff) << 16) |
      ((hash(offset + 2) & 0xff) << 8 |
        (hash(offset + 3) & 0xff))

    val otp: Long = binary % pow(10, returnDigits).toLong

    ("0" * returnDigits + otp.toString).takeRight(returnDigits)
  }

  def totpSeq(
      secret: TOTPSecret,
      time: Long = System.currentTimeMillis / 30000,
      returnDigits: Int = 6,
      crypto: String = "HmacSha1",
      windowSize: Int = 3
  ): Seq[String] =
    (-windowSize to windowSize)
      .foldLeft(Nil: Seq[String])((a, b) =>
        totp(secret, time + b, returnDigits, crypto) +: a
      )
      .reverse

  def pinMatchesSecret(pin: String, secret: TOTPSecret): Boolean =
    totpSeq(secret = secret).contains(pin.trim)

  def pinMatchesSecret(
      pin: Option[String],
      secret: Option[TOTPSecret]
  ): Boolean =
    (pin, secret) match {
      case (None, None)                           => true
      case (None, Some(_: TOTPSecret))            => false
      case (Some(_: String), None)                => false
      case (Some(p: String), Some(s: TOTPSecret)) => pinMatchesSecret(p, s)
    }

  private def hmac_sha(
      crypto: String,
      keyBytes: Array[Byte],
      text: Array[Byte]
  ): Array[Byte] = {
    val hmac: Mac = Mac.getInstance(crypto)
    val macKey = new SecretKeySpec(keyBytes, "RAW")
    hmac.init(macKey)
    hmac.doFinal(text)
  }
}
