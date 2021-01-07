package storage

import jdk.jshell.spi.ExecutionControl.NotImplementedException
import org.jooq.{JSONFormat, Record, Result}
import play.api.Logger
import play.api.libs.json.{Format, JsArray, JsError, JsObject, JsString, JsSuccess, JsValue, Json}

object Helper {

  val logger: Logger = Logger("Helper")

  def _inOperatorToString(value: List[String]): String = {
    if(value.isEmpty)
      "('DEFAULT VALUE TO AVOID EMPTY LIST')"
    else
      s"(${value.map("'" + _ + "'").mkString(",")})"
  }

  def _removeQuotes(str: Any): String = str.toString.replace("\"", "")

  def _manageProperty(key: String, jsValue: JsValue): String = {
    val value = _removeQuotes(jsValue)

    if (key.contains(".")) {
      val parts = key.split("\\.")
      if (parts.length > 2)
        throw new NotImplementedException("Queries with three dots in the property are not supported")

      val quotes = "\""
      s"content->'${_removeQuotes(parts(0))}' @> '[{$quotes${parts(1)}$quotes : $quotes$value$quotes}]'"

    } else
      s"content->>'$key' = '$value'"
  }

  def _convertTuple(field: (String, JsValue)): String = {
    field._2 match {
      case value: JsObject =>
        value.fields.headOption match {
          case Some((key: String, _: JsValue))
            if key == "$in" =>
              s"content->>'${field._1}' IN ${_convertTuple(value.fields.head)}"

          case Some((key: String, _: JsValue))
            if key == "$regex" =>
              val regex = value.fields.head._2.as[String].replaceAll(".*", "%")
              if (regex == "%%") "1 = 1"
              else  s"content->>'${field._1}' LIKE $regex"

          case Some((key: String, _: JsValue))
            if key == "$options" => "1 = 1"

          case e =>
            logger.error(s"NOT IMPLEMENTED - $e")
            "1 = 1"
        }
      case value: JsArray if field._1 == "$or" => "(" + value.as[List[JsObject]].map(convertQuery).mkString(" OR ") + ")"
      case value: JsArray if field._1 == "$in" => _inOperatorToString(value.as[List[String]])
      case value: Any => _manageProperty(field._1, value)
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
