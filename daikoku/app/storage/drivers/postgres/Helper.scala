package storage.drivers.postgres

import fr.maif.otoroshi.daikoku.logger.AppLogger
import io.vertx.sqlclient.Row
import play.api.Logger
import play.api.libs.json._

object Helper {

  implicit val logger: Logger = Logger("Helper")

  private def _inOperatorToString(
      values: List[String],
      params: Seq[AnyRef]): (String, Seq[AnyRef]) = {
    if (values.isEmpty)
      ("('DEFAULT VALUE TO AVOID EMPTY LIST')", params)
    else {
      val n = params.size
      (
        s"(${values.indices.map(i => "$" + (n + 1 + i) + "").mkString(",")})",
        params ++ values
      )
    }
  }

  private def _removeQuotes(str: Any): String =
    str.toString
      .replace(quotes, "")

  private def _manageProperty(key: String,
                              jsValue: JsValue,
                              params: Seq[AnyRef]): (String, Seq[AnyRef]) = {
    val value = _removeQuotes(jsValue)

    var out = ""
    var outParams = params
    val n = params.size

    if (key.contains(".")) {
      val parts = key.split("\\.")
      if (parts.length > 2)
        throw new UnsupportedOperationException(
          "Queries with three dots in the property are not supported")

      out = s"(content->$$${n + 1} @> '[{$quotes${parts(1)}$quotes : $quotes$value$quotes}]' OR " +
        s"content->$$${n + 1} @> '{$quotes${parts(1)}$quotes : $quotes$value$quotes}')"

      outParams ++= Seq(
        _removeQuotes(parts(0))
      )
    } else {
      if (value == "null") {
        out = s"(content->>${getParam(n)} is null)"
        outParams ++= Seq(key)
      } else {
        jsValue match {
          case JsNumber(t) =>
            out =
              s"(content->>$$${n + 1} = '$t' OR content->$$${n + 1} @> '$t')"
            outParams ++= Seq(
              key,
              value
            )
          case _ =>
            out =
              s"(content->>$$${n + 1} = $$${n + 2} OR content->$$${n + 1} @> $$${n + 3}::jsonb)"
            outParams ++= Seq(
              key,
              value,
              s"$quotes$value$quotes"
            )
        }
      }
    }

    (out, outParams)
  }

  def getParam(n: Int): String = "$" + (n + 1).toString

  private def _convertTuple(field: (String, JsValue),
                            params: Seq[AnyRef]): (String, Seq[AnyRef]) = {
    logger.debug(s"_convertTuple - $field")

    if (field._1 == "$push") {
      val entry = field._2.as[JsObject].fields.head
      (
        s"content = jsonb_set(content, array[${getParam(params.size)}], content->${getParam(
          params.size)} || ${getParam(params.size + 1)})",
        params ++ Seq(entry._1, entry._2)
      )
    } else if (field._1 == "$set") {
      val entry = field._2.as[JsObject].fields.head
      (
        s"content = jsonb_set(content, array[${getParam(params.size)}], ${getParam(
          params.size + 1)})",
        params ++ Seq(entry._1, entry._2)
      )
    } else if (field._1 == "$unset") {
      val keys = field._2.as[JsObject].keys
//      the following request does not work because of quote in object give in argument of the #- operation
//      val tup = (
//        s"content = content ${keys.zipWithIndex.map{ case (key, keyIdx) => s"#- {${key.split("\\.").zipWithIndex.map{ case (_, idx) => getParam(keyIdx + idx + params.size)}.mkString(",")}}"}.mkString(" ")}",
//        params ++ keys.flatMap(key => key.split("\\."))
//      )
      val tup = (
        s"content = content ${keys.map(key => s"#- '{${key.split("\\.").mkString(",")}}'").mkString(" ")}",
        params
      )
      tup
    } else {
      field._2 match {
        case value: JsObject =>
          value.fields.headOption match {
            case Some((key: String, _: JsValue)) if key == "$in" =>
              val (a, b) = _convertTuple(value.fields.head, params)
              val arr = a
                .replace("(", "")
                .replace(")", "")

              var formattedKey = s"content->>'${field._1}'"
              if (field._1.contains(".")) {
                val parts = field._1.split("\\.")
                if (parts.length > 2)
                  throw new UnsupportedOperationException(
                    "Queries with three dots in the property are not supported")
                else if (parts.length == 2)
                  formattedKey = s"content->'${parts.head}'->>'${parts.last}'"
              }

              (s"( $formattedKey IN $a OR content->${getParam(b.size)} ?| ARRAY[$arr] )",
               b ++ Seq(field._1))

            case Some((key: String, _: JsValue)) if key == "$nin" =>
              val (a, b) = _convertTuple(value.fields.head, params)
              (s"content->>${getParam(b.size)} NOT IN $a", b ++ Seq(field._1))

            case Some((key: String, _: JsValue)) if key == "$regex" =>
              (
                s"content->>${getParam(params.size)} ~* ${getParam(params.size + 1)}",
                params ++ Seq(field._1, value.fields.head._2.as[String])
              )

            case Some((key: String, _: JsValue)) if key == "$options" =>
              ("1 = 1", params)

            case Some((key: String, _: JsValue)) if key == "$gte" =>
              val (a, b) = _convertTuple(value.fields.head, params)
              (
                s"(content->>${getParam(b.size)})::bigint >= $a",
                b ++ Seq(field._1)
              )

            case Some((key: String, _: JsValue)) if key == "$lte" =>
              val (a, b) = _convertTuple(value.fields.head, params)
              (
                s"(content->>${getParam(b.size)})::bigint <= $a",
                b ++ Seq(field._1)
              )

            case Some((key: String, _: JsValue)) if key == "$lt" =>
              val (a, b) = _convertTuple(value.fields.head, params)
              (
                s"(content->>${getParam(b.size)})::bigint < $a",
                b ++ Seq(field._1)
              )

            case Some((key: String, _: JsValue)) if key == "$gt" =>
              val (a, b) = _convertTuple(value.fields.head, params)
              (
                s"(content->>${getParam(b.size)})::bigint > $a",
                b ++ Seq(field._1)
              )

            case Some((key: String, _: JsValue)) if key == "$and" =>
              _convertTuple(value.fields.head, params)

            case Some((key: String, _: JsValue)) if key == "$ne" =>
              val (a, b) = _convertTuple(value.fields.head, params)
              (
                s"(content ->> ${getParam(b.size)} IS NULL OR content->>${getParam(
                  b.size)} <> ${getParam(b.size + 1)})",
                b ++ Seq(_removeQuotes(field._1),
                         _removeQuotes(value.fields.head._2))
              )
            case Some((key: String, v: JsValue)) if key == "$exists" =>
              val (a, b) = _convertTuple(value.fields.head, params)
              val res = v match {
                case JsTrue => (
                  s"(content ->> ${getParam(b.size)} IS NOT NULL)",
                  b ++ Seq(_removeQuotes(field._1),
                    _removeQuotes(value.fields.head._2))
                )
                case JsFalse => (
                  s"(content ->> ${getParam(b.size)} IS NULL)",
                  b ++ Seq(_removeQuotes(field._1),
                    _removeQuotes(value.fields.head._2))
                )
                case _ =>
                logger.error("WRONG VALUE - $exists needs boolean value")
                ("1 = 1", params)

              }
              res
            case e =>
              logger.error(s"NOT IMPLEMENTED - $e")
              ("1 = 1", params)
          }
        case value: JsArray if field._1 == "$or" =>
          var orParams = params
          var l: List[(String)] = List()

          for (q <- value.as[List[JsObject]]) {
            val res = convertQuery(q, orParams)
            l = l :+ res._1
            orParams = res._2
          }

          if (l.count(_.nonEmpty) == 1) {
            (l.head, orParams)
          } else {
            ("(" + l.mkString(" OR ") + ")", orParams)
          }

        case value: JsArray if field._1 == "$in" =>
          try {
            _inOperatorToString(value.as[List[String]], params)
          } catch {
            case _: Throwable =>
              ("('DEFAULT VALUE TO AVOID EMPTY LIST')", params)
          }

        case value: JsArray if field._1 == "$nin" =>
          _inOperatorToString(value.as[List[String]], params)
        case value: JsValue if field._1 == "$lte" =>
          (getParam(params.size), params ++ Seq(BigInt(value.toString)))
        case value: JsValue if field._1 == "$gte" =>
          (getParam(params.size), params ++ Seq(BigInt(value.toString)))
        case value: JsValue if field._1 == "$gt" =>
          (getParam(params.size), params ++ Seq(BigInt(value.toString)))
        case value: JsValue if field._1 == "$lt" =>
          (getParam(params.size), params ++ Seq(BigInt(value.toString)))
        case value: JsValue if field._1 == "$ne" =>
          (getParam(params.size), params ++ Seq(value.toString))
        case value: JsArray if field._1 == "$and" =>
          var orParams = params
          var l: List[(String)] = List()

          for (q <- value.as[List[JsObject]]) {
            val res = convertQuery(q, orParams)
            l = l :+ res._1
            orParams = res._2
          }

          (l.mkString(" AND "), orParams)

        case value: Any => _manageProperty(field._1, value, params)
      }
    }
  }

  // convert jsObject query to jsonb syntax
  def convertQuery(query: JsObject,
                   params: Seq[AnyRef] = Seq.empty): (String, Seq[AnyRef]) = {
    var l = ""
    var outParams = params

    query.fields.foreach(field => {
      val tmp = _convertTuple(field, outParams)
      outParams = tmp._2
      if (l.isEmpty)
        l = tmp._1
      else
        l = l + " AND " + tmp._1
    })

    (l, outParams)
  }

  def rowToJson[Of](row: Row, format: Format[Of]): Option[Of] = {
    import pgimplicits._

    row.optJsObject("content").map(format.reads).collect {
      case JsSuccess(s, _) => s
    }
  }

  val quotes = "\""
}
