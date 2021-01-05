package storage

import play.api.libs.json.{JsArray, JsObject, JsValue}

object Helper {

  def _convertTuple(field: (String, JsValue)): String = {
    field._2 match {
      case value: JsObject =>
        value.fields.headOption match {
          case Some((key: String, content: JsValue)) if key == "$in" => s"${field._1} IN ${_convertTuple(value.fields.head)}"
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
}
