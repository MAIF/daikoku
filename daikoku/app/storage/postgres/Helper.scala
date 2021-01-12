package storage.postgres

import jdk.jshell.spi.ExecutionControl.NotImplementedException
import org.jooq.{JSONFormat, Record, Result}
import play.api.Logger
import play.api.libs.json._

object Helper {

  val logger: Logger = Logger("Helper")

  private def _inOperatorToString(value: List[String]): String = {
    if (value.isEmpty)
      "('DEFAULT VALUE TO AVOID EMPTY LIST')"
    else
      s"(${value.map("'" + _ + "'").mkString(",")})"
  }

  private def _removeQuotes(str: Any): String = str.toString
    .replace("\"", "")

  private def _manageProperty(key: String, jsValue: JsValue): String = {
    val value = _removeQuotes(jsValue)

    var out = ""

    if (key.contains(".")) {
      val parts = key.split("\\.")
      if (parts.length > 2)
        throw new NotImplementedException("Queries with three dots in the property are not supported")

      out = s"(content->'${_removeQuotes(parts(0))}' @> '[{$quotes${parts(1)}$quotes : $quotes$value$quotes}]' OR " +
        s"content->'${_removeQuotes(parts(0))}' @> '{$quotes${parts(1)}$quotes : $quotes$value$quotes}')"
    } else
      out = s"(content->>'$key' = '$value' OR content->'$key' @> '$quotes$value$quotes')"

    out.replace("= 'null'", "is null")
  }

  private def _convertTuple(field: (String, JsValue)): String = {
    logger.debug(s"_convertTuple - $field")

    if (field._1 == "$push") {
      val entry = field._2.as[JsObject].fields.head
      return s"content = jsonb_set(content, array['${entry._1}'], content->'${entry._1}' || '${entry._2}')"
    }

    field._2 match {
      case value: JsObject =>
        value.fields.headOption match {
          case Some((key: String, _: JsValue)) if key == "$in" =>
            s"content->>'${field._1}' IN ${_convertTuple(value.fields.head)}"

          case Some((key: String, _: JsValue)) if key == "$nin" =>
            s"content->>'${field._1}' NOT IN ${_convertTuple(value.fields.head)}"

          case Some((key: String, _: JsValue)) if key == "$regex" =>
            val regex = value.fields.head._2.as[String].replaceAll(".*", "%")
            if (regex == "%%") "1 = 1"
            else  s"content->>'${field._1}' LIKE $regex"

          case Some((key: String, _: JsValue)) if key == "$options" =>
            "1 = 1"

          case Some((key: String, _: JsValue)) if key == "$gte" =>
            s"(content->>'${field._1}')::bigint >= ${_convertTuple(value.fields.head)}"

          case Some((key: String, _: JsValue)) if key == "$lte" =>
            s"(content->>'${field._1}')::bigint <= ${_convertTuple(value.fields.head)}"

          case Some((key: String, _: JsValue)) if key == "$lt" =>
            s"(content->>'${field._1}')::bigint < ${_convertTuple(value.fields.head)}"

          case Some((key: String, _: JsValue)) if key == "$and" =>
            _convertTuple(value.fields.head)

          case Some((key: String, _: JsValue)) if key == "$ne" =>
            s"NOT (content->'${field._1}' @> '${_convertTuple(value.fields.head)}')"

          case e =>
            logger.error(s"NOT IMPLEMENTED - $e")
            "1 = 1"
        }
      case value: JsArray if field._1 == "$or" => "(" + value.as[List[JsObject]].map(convertQuery).mkString(" OR ") + ")"
      case value: JsArray if field._1 == "$in" => _inOperatorToString(value.as[List[String]])
      case value: JsArray if field._1 == "$nin" => _inOperatorToString(value.as[List[String]])
      case value: JsValue if field._1 == "$lte" => value.toString
      case value: JsValue if field._1 == "$gte" => value.toString
      case value: JsValue if field._1 == "$lt" => value.toString
      case value: JsValue if field._1 == "$ne" => value.toString
      case value: JsArray if field._1 == "$and" => value.as[List[JsObject]].map(convertQuery).mkString(" AND ")
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

  var quotes = "\""
}
