package storage.drivers.postgres

import io.vertx.sqlclient.Row
import play.api.Logger
import play.api.libs.json._

object Helper {

  implicit val logger: Logger = Logger("Helper")

  private def _inOperatorToString(values: List[String], params: Seq[AnyRef]): (String, Seq[AnyRef]) = {
    if (values.isEmpty)
      ("('DEFAULT VALUE TO AVOID EMPTY LIST')", params)
    else {
      val n = params.size
      (
        s"(${values.indices.map(i =>"'$" + (n + i) + "'").mkString(",")})",
        params ++ values
      )
    }
  }

  private def _removeQuotes(str: Any): String = str.toString
    .replace(quotes, "")

  private def _manageProperty(key: String, jsValue: JsValue, params: Seq[AnyRef]): (String, Seq[AnyRef]) = {
    val value = _removeQuotes(jsValue)

    var out = ""
    var outParams = params
    val n = params.size

    if (key.contains(".")) {
      val parts = key.split("\\.")
      if (parts.length > 2)
        throw new UnsupportedOperationException("Queries with three dots in the property are not supported")

      out = s"(content->'${getParam(n)}' @> '[{${getParam(n+1)}}]' OR " +
        s"content->'${getParam(n+2)}' @> '{${getParam(n+3)}}')"
      outParams ++= Seq(
        _removeQuotes(parts(0)),
        s"$quotes${parts(1)}$quotes : $quotes$value$quotes",
        _removeQuotes(parts(0)),
        s"$quotes${parts(1)}$quotes : $quotes$value$quotes"
      )
    } else {
      out = s"(content->>'${getParam(n)}' = '${getParam(n+1)}' OR content->'${getParam(n+2)}' @> '${getParam(n+3)}')"
      outParams ++= Seq(
        key,
        value,
        key,
        s"$quotes$value$quotes"
      )
    }

    (out.replace("= 'null'", "is null"), outParams)
  }

  def getParam(n: Int): String = "$" + n.toString

  private def _convertTuple(field: (String, JsValue), params: Seq[AnyRef]): (String, Seq[AnyRef]) = {
    logger.debug(s"_convertTuple - $field")

    if (field._1 == "$push") {
      val entry = field._2.as[JsObject].fields.head
      return (
        s"content = jsonb_set(content, array['${getParam(params.size)}'], content->'${getParam(params.size+1)}' || '${getParam(params.size+2)}')",
        params ++ Seq(entry._1, entry._1, entry._2)
      )
    }

    field._2 match {
      case value: JsObject =>
        value.fields.headOption match {
          case Some((key: String, _: JsValue)) if key == "$in" =>
            val (a, b) = _convertTuple(value.fields.head, params)
            val o = params ++ b
            (s"content->>'${getParam(o.size)}' IN $a", o ++ Seq(field._1))

          case Some((key: String, _: JsValue)) if key == "$nin" =>
            val (a, b) = _convertTuple(value.fields.head, params)
            val o = params ++ b
            (s"content->>'${getParam(o.size)}' NOT IN $a", o ++ Seq(field._1))

          case Some((key: String, _: JsValue)) if key == "$regex" =>
            (
              s"content->>'${getParam(params.size)}' ~ '${getParam(params.size+1)}'",
              params ++ Seq(field._1, value.fields.head._2.as[String])
            )

          case Some((key: String, _: JsValue)) if key == "$options" => ("1 = 1", params)

          case Some((key: String, _: JsValue)) if key == "$gte" =>
            val (a, b) = _convertTuple(value.fields.head, params)
            val o = params ++ b
            (
              s"(content->>'${o.size}')::bigint >= $a",
              o ++ Seq(field._1)
            )

          case Some((key: String, _: JsValue)) if key == "$lte" =>
            val (a, b) = _convertTuple(value.fields.head, params)
            val o = params ++ b
            (
              s"(content->>'${o.size}')::bigint <= $a",
              o ++ Seq(field._1)
            )

          case Some((key: String, _: JsValue)) if key == "$lt" =>
            val (a, b) = _convertTuple(value.fields.head, params)
            val o = params ++ b
            (
              s"(content->>'${o.size}')::bigint < $a",
              o ++ Seq(field._1)
            )

          case Some((key: String, _: JsValue)) if key == "$lt" =>
            val (a, b) = _convertTuple(value.fields.head, params)
            val o = params ++ b
            (
              s"(content->>'${o.size}')::bigint > $a",
              o ++ Seq(field._1)
            )

          case Some((key: String, _: JsValue)) if key == "$and" => _convertTuple(value.fields.head, params)

          case Some((key: String, _: JsValue)) if key == "$ne" =>
            val (a, b) = _convertTuple(value.fields.head, params)
            val o = params ++ b
            (
              s"NOT (content->'${o.size}' @> '$a')",
              o ++ Seq(field._1)
            )

          case e =>
            logger.error(s"NOT IMPLEMENTED - $e")
            ("1 = 1", params)
        }
      case value: JsArray if field._1 == "$or" =>
        val out = value
          .as[List[JsObject]]
          .map(q => convertQuery(q, params))
          .reduceLeft((acc: (String, Seq[AnyRef]), curr: (String, Seq[AnyRef])) => {
            (acc._1 + curr._1.mkString(" OR "), acc._2 ++ curr._2)
          })

        ("(" + out._1 + ")", out._2)
      case value: JsArray if field._1 == "$in" =>
        try {
          _inOperatorToString(value.as[List[String]], params)
        } catch {
          case _: Throwable => ("('DEFAULT VALUE TO AVOID EMPTY LIST')", params)
        }

      case value: JsArray if field._1 == "$nin" => _inOperatorToString(value.as[List[String]], params)
      case value: JsValue if field._1 == "$lte" => (value.toString, params)
      case value: JsValue if field._1 == "$gte" => (value.toString, params)
      case value: JsValue if field._1 == "$gt" => (value.toString, params)
      case value: JsValue if field._1 == "$lt" => (value.toString, params)
      case value: JsValue if field._1 == "$ne" => (value.toString, params)
      case value: JsArray if field._1 == "$and" =>
        value
          .as[List[JsObject]]
          .map(q => convertQuery(q, params))
          .reduceLeft((acc: (String, Seq[AnyRef]), curr: (String, Seq[AnyRef])) => {
            (acc._1 + curr._1.mkString(" AND "), acc._2 ++ curr._2)
          })
      case value: Any => _manageProperty(field._1, value, params)
    }
  }

  // convert jsObject query to jsonb syntax
  def convertQuery(query: JsObject, params: Seq[AnyRef] = Seq.empty): (String, Seq[AnyRef]) = {
    query.fields
      .map(field => _convertTuple(field, params))
      .reduceLeft((acc: (String, Seq[AnyRef]), curr: (String, Seq[AnyRef])) => {
        (acc._1 + " AND " + curr._1, acc._2)
      })
  }

  def rowToJson[Of](row: Row, format: Format[Of]): Option[Of] = {
    import pgimplicits._

    row.optJsObject("content").map(format.reads).collect {
      case JsSuccess(service, _) => service
    }
  }

  val quotes = "\""
}
