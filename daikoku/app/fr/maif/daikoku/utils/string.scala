package fr.maif.daikoku.utils

import com.github.slugify.Slugify
import play.api.Logger
import play.api.libs.json.{JsValue, Json}

import java.math.BigInteger
import java.security.MessageDigest

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
      val url = s"https://www.gravatar.com/avatar/${md5}?size=128&d=robohash"
      url
    }
    def urlPathSegmentSanitized: String = {
      import java.text.Normalizer
      Normalizer
        .normalize(s, Normalizer.Form.NFD)
        .replaceAll("[\\p{InCombiningDiacriticalMarks}]", "")
        .replaceAll("[^A-Za-z0-9_.\\-~]", "-")
        .replaceAll("-+", "-")
        .toLowerCase
        .trim
    }
    def slugify: String = Slugify.builder().build().slugify(s)
  }
}

object LoggerImplicits {
  implicit class BetterLogger(logger: Logger) {
    def json(js: JsValue, pretty: Boolean = false): Unit = {
      logger.info(if (pretty) Json.prettyPrint(js) else Json.stringify(js))
    }
  }
}
