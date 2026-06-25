package fr.maif.daikoku.utils

import fr.maif.daikoku.domain.ValidationStep
import play.api.libs.json.{JsArray, JsObject, JsValue}

object SubscriptionUtil {

  /** Tri récursif des clés d'objet → deux JSON sémantiquement égaux produisent
    * la même chaîne, quel que soit l'ordre des clés (important pour Form.schema
    * qui est un JsObject libre). On NE trie PAS les tableaux : l'ordre des
    * steps est signifiant.
    */
  private def canonical(js: JsValue): JsValue = js match {
    case JsObject(fields) =>
      JsObject(
        fields.toSeq.sortBy(_._1).map { case (k, v) => k -> canonical(v) }
      )
    case JsArray(values) => JsArray(values.map(canonical))
    case other           => other
  }

  /** Champs qui ne changent pas le *sens* d'un step :
    *   - `id` : token aléatoire
    *   - `title` : purement cosmétique (à retirer du set si tu veux que deux
    *     flows au libellé différent soient considérés distincts)
    */
  private val ignoredKeys = Set("id", "title")

  private def normalizeStep(step: ValidationStep): JsValue =
    canonical(ignoredKeys.foldLeft(step.asJson.as[JsObject])(_ - _))

  def processChecksum(steps: Seq[ValidationStep]): String = {
    val payload =
      JsArray(steps.map(normalizeStep)).toString
        .getBytes(java.nio.charset.StandardCharsets.UTF_8)
    java.security.MessageDigest
      .getInstance("SHA-256")
      .digest(payload)
      .map("%02x".format(_))
      .mkString
  }
}
