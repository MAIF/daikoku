package fr.maif.otoroshi.daikoku.utils

import java.math.BigInteger
import java.security.MessageDigest

import org.apache.commons.lang3.StringUtils

object StringImplicits {

  implicit class BetterString(val s: String) extends AnyVal {
    def md5: String = {
      val md = MessageDigest.getInstance("MD5")
      val digest = md.digest(s.trim.toLowerCase.getBytes)
      val bigInt = new BigInteger(1, digest)
      val hashedString = bigInt.toString(16)
      hashedString
    }
    def gravatar: String = {
      val email = s.toLowerCase().trim()
      val url = s"https://www.gravatar.com/avatar/${md5}?size=128&d=robohash"
      url
    }
    def urlPathSegmentSanitized: String = {
      import java.text.Normalizer
      StringUtils
        .replaceChars(
          Normalizer
            .normalize(s, Normalizer.Form.NFD)
            .replaceAll("[\\p{InCombiningDiacriticalMarks}]", ""),
          " -._~!$'()*,;&=@:",
          "-"
        )
        .replaceAll("--", "-")
        .replaceAll("---", "-")
        .replaceAll("----", "-")
        .toLowerCase
        .trim
    }
  }
}
