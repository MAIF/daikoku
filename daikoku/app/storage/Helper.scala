package storage

import org.jooq.{JSONFormat, Record, Result}
import play.api.Logger
import play.api.libs.json.{Format, JsArray, JsError, JsObject, JsSuccess, JsValue, Json}

object Helper {

  val logger: Logger = Logger("Helper")

  def _convertTuple(field: (String, JsValue)): String = {
    field._2 match {
      case value: JsObject =>
        value.fields.headOption match {
          case Some((key: String, _: JsValue)) if key == "$in" => s"content->>'${field._1}' IN ${_convertTuple(value.fields.head)}"
          case _ => "NOT IMPLEMENTED"
        }
      case value: JsArray if field._1 == "$or" => value.as[List[JsObject]].map(convertQuery).mkString(" OR ")
      case value: JsArray if field._1 == "$in" => "(" + value.as[List[String]].map("'" + _ + "'").mkString(",") + ")"
      case value: Any => s"content ->> '${field._1}' = '${value.toString().replace("\"", "")}'"
    }
  }

  // convert jsObject query to jsonb syntax
  def convertQuery(query: JsObject): String = {
    query.fields
      .map(_convertTuple)
      .mkString(" AND ")
  }

  def recordToJson(record: Result[Record]): JsValue = Json.parse(
    record.formatJSON(new JSONFormat()
      .header(false)
      .recordFormat(org.jooq.JSONFormat.RecordFormat.OBJECT))
  )

  def getContentFromJson[Of](value: JsValue, format: Format[Of]): Option[Of] = {
    if (value.isInstanceOf[JsArray] && value.as[JsArray].value.nonEmpty) {
      logger.debug(s" recordToJson : ${value(0)}")

      format.reads((value(0) \ "content").as[JsObject]) match {
        case JsSuccess(e, _) => Some(e)
        case JsError(_) => None
      }
    } else {
      logger.debug(s" recordToJson : not record found")
      None
    }
  }

  def getContentsListFromJson[Of](value: JsValue, format: Format[Of]): Seq[Of] = {
    if (value.isInstanceOf[JsArray]) {
      logger.debug("getContentsListFromJson")

      value.as[JsArray]
        .value
        .flatMap { json =>
          format.reads((json \ "content").as[JsObject]) match {
            case JsSuccess(e, _) => Some(e)
            case JsError(_) => None
          }
        }
        .toSeq
    } else {
      logger.debug(s" getContentsListFromJson : can't convert record to list of json")
      Seq()
    }
  }
}
