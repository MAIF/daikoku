package storage.drivers.postgres

import play.api.Logger
import play.api.libs.json._
import storage.drivers.postgres.jooq.api.QueryResult

import scala.collection.Set

object Helper {

  val logger: Logger = Logger("Helper")

  private def _inOperatorToString(value: List[String]): String = {
    if (value.isEmpty)
      "('DEFAULT VALUE TO AVOID EMPTY LIST')"
    else
      s"(${value.map("'" + _ + "'").mkString(",")})"
  }

  private def _removeQuotes(str: Any): String = str.toString
    .replace(quotes, "")

  private def _manageProperty(key: String, jsValue: JsValue): String = {
    val value = _removeQuotes(jsValue)

    var out = ""

    if (key.contains(".")) {
      val parts = key.split("\\.")
      if (parts.length > 2)
        throw new UnsupportedOperationException("Queries with three dots in the property are not supported")

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

          case Some((key: String, _: JsValue)) if key == "$regex" => s"content->>'${field._1}' ~ '${value.fields.head._2.as[String]}'"

          case Some((key: String, _: JsValue)) if key == "$options" =>
            "1 = 1"

          case Some((key: String, _: JsValue)) if key == "$gte" =>
            s"(content->>'${field._1}')::bigint >= ${_convertTuple(value.fields.head)}"

          case Some((key: String, _: JsValue)) if key == "$lte" =>
            s"(content->>'${field._1}')::bigint <= ${_convertTuple(value.fields.head)}"

          case Some((key: String, _: JsValue)) if key == "$lt" =>
            s"(content->>'${field._1}')::bigint < ${_convertTuple(value.fields.head)}"

          case Some((key: String, _: JsValue)) if key == "$lt" =>
            s"(content->>'${field._1}')::bigint > ${_convertTuple(value.fields.head)}"

          case Some((key: String, _: JsValue)) if key == "$and" =>
            _convertTuple(value.fields.head)

          case Some((key: String, _: JsValue)) if key == "$ne" =>
            s"NOT (content->'${field._1}' @> '${_convertTuple(value.fields.head)}')"

          case e =>
            logger.error(s"NOT IMPLEMENTED - $e")
            "1 = 1"
        }
      case value: JsArray if field._1 == "$or" => "(" + value.as[List[JsObject]].map(convertQuery).mkString(" OR ") + ")"
      case value: JsArray if field._1 == "$in" =>
        try {
          _inOperatorToString(value.as[List[String]])
        } catch {
          case _: Throwable => "('DEFAULT VALUE TO AVOID EMPTY LIST')"
        }

      case value: JsArray if field._1 == "$nin" => _inOperatorToString(value.as[List[String]])
      case value: JsValue if field._1 == "$lte" => value.toString
      case value: JsValue if field._1 == "$gte" => value.toString
      case value: JsValue if field._1 == "$gt" => value.toString
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

  def recordContentToJson(res: QueryResult) : JsValue = {
    val content = res.get("content", classOf[String])
    Json.parse(content)
  }

  def getContentFromJson[Of](queryResult: Option[QueryResult], format: Format[Of]): Option[Of] = {
    queryResult.flatMap(f => format.reads(recordContentToJson(f)) match {
      case JsSuccess(e, _) => Some(e)
      case JsError(_) => None
    })
  }

  def getContentsListFromJson[Of](queryResults: List[QueryResult], format: Format[Of]): Seq[Of] = {
      logger.debug("getContentsListFromJson")

    queryResults
        .flatMap { json =>
          format.reads(recordContentToJson(json)) match {
            case JsSuccess(e, _) => Some(e)
            case JsError(_) => None
          }
        }
  }

  def recordFieldsToJson(res: QueryResult, fields: Set[String]) : JsValue = {
    var out = Json.obj()

    fields.foreach { field =>
      out = out + (field -> JsString(res.get(field.toLowerCase, classOf[String])))
    }

    out
  }

  def getFieldsFromJson(queryResult: Option[QueryResult], fields: Set[String]): Option[JsValue] = {
    queryResult.map(f => recordFieldsToJson(f, fields))
  }

  def getFieldsListFromJson(queryResults: List[QueryResult], fields: Set[String]): Seq[JsValue] = {
    logger.debug("getContentsListFromJson")

    queryResults.map { json => recordFieldsToJson(json, fields)}
  }

  val quotes = "\""
}
