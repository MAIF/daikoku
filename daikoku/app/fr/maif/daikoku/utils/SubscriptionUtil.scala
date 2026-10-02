package fr.maif.daikoku.utils

import fr.maif.daikoku.domain.{SubscriptionProcess, ValidationStep}
import play.api.libs.json.{JsArray, JsObject, JsValue}

object SubscriptionUtil {

  /** Recursive sorting of object keys → two semantically equal JSON values
    * produce the same string, regardless of key order (important for
    * Form.schema which is a free-form JsObject). Arrays are NOT sorted: the
    * order of steps is significant.
    */
  private def canonical(js: JsValue): JsValue = js match {
    case JsObject(fields) =>
      JsObject(
        fields.toSeq.sortBy(_._1).map { case (k, v) => k -> canonical(v) }
      )
    case JsArray(values) => JsArray(values.map(canonical))
    case other           => other
  }

  /** Fields that don't change the *meaning* of a step:
    *   - `id`: random token
    *   - `title`: purely cosmetic (remove it from the set if you want two flows
    *     with different labels to be considered distinct)
    */
  private val ignoredKeys = Set("id", "title")

  private def normalizeStep(
      step: ValidationStep,
      ignoredFields: Set[String] = ignoredKeys
  ): JsValue =
    canonical(ignoredFields.foldLeft(step.asJson.as[JsObject])(_ - _))

  def processChecksum(steps: Seq[ValidationStep]): Option[String] =
    checksum(steps.map(step => normalizeStep(step)))

  /** Approver teams may differ across APIs in the same subscription batch;
    * all other meaningful step settings must still match.
    */
  def batchProcessChecksum(steps: Seq[ValidationStep]): Option[String] =
    checksum(steps.map { step =>
      val ignoredFields = step match {
        case _: ValidationStep.TeamAdmin => ignoredKeys + "team"
        case _                          => ignoredKeys
      }
      normalizeStep(step, ignoredFields)
    })

  def areBatchProcessesCompatible(
      processes: Seq[SubscriptionProcess]
  ): Boolean =
    processes.flatMap(process => batchProcessChecksum(process.steps))
      .distinct.size <= 1

  private def checksum(steps: Seq[JsValue]): Option[String] = {
    steps match {
      case Nil => None
      case _ =>
        val payload =
          JsArray(steps).toString
            .getBytes(java.nio.charset.StandardCharsets.UTF_8)

        Some(
          java.security.MessageDigest
            .getInstance("SHA-256")
            .digest(payload)
            .map("%02x".format(_))
            .mkString
        )
    }
  }
}
