package fr.maif.daikoku.storage.drivers.postgres

import cats.implicits.catsSyntaxOptionId
import io.vertx.sqlclient.Row
import play.api.Logger
import play.api.libs.json._

/** What is left of the Mongo-style query layer.
  *
  * `convertQuery` used to translate `JsObject` queries into JSONB SQL at
  * runtime, threading placeholder numbers through mutable vars and
  * interpolating values into the statement. Every repo now carries named
  * methods backed by parameterised SQL, so only row decoding remains here.
  */
object Helper {

  implicit val logger: Logger = Logger("Helper")

  def rowToJson[Of](row: Row, format: Format[Of]): Option[Of] = {
    import pgimplicits._
    row
      .optJsObject("content")
      .map(format.reads)
      .map {
        case JsSuccess(s, _) => s.some
        case JsError(errors) =>
          logger.error(errors.toString())
          None
      }
      .collect { case Some(value) =>
        value
      }
  }
}
