package fr.maif.otoroshi.daikoku.utils

import play.api.libs.json.{
  JsArray,
  JsDefined,
  JsObject,
  JsString,
  JsUndefined,
  JsValue,
  Json
}

object JsonOperationsHelper {

  private def getValueAtPath(input: String, obj: JsValue) = {
    var acc = obj
    var out = JsString("").as[JsValue]

    input
      .split("\\.")
      .foreach(path => {
        if (path.forall(Character.isDigit)) {
          acc.asOpt[JsArray] match {
            case Some(value) =>
              acc = value.value(path.toInt)
              out = acc
            case None => acc = Json.obj()
          }
        } else {
          acc \ path match {
            case JsDefined(a @ JsObject(_)) =>
              acc = a
              out = a
            case JsDefined(a @ JsArray(_)) =>
              acc = a
              out = a
            case JsDefined(value) =>
              out = value
            case _: JsUndefined =>
              acc = Json.obj()
              out = Json.obj()
          }
        }
      })

    (input, out)
  }

  def insertAtPath(
      acc: JsObject,
      path: Seq[String],
      value: JsValue
  ): JsObject = {
    if (path.length == 1) {
      acc.deepMerge(Json.obj(path.head -> value))
    } else {
      acc.deepMerge(
        Json.obj(
          path.head -> insertAtPath(
            (acc \ path.head).asOpt[JsObject].getOrElse(Json.obj()),
            path.tail,
            value
          )
        )
      )
    }
  }
  def filterJson(obj: JsValue, fields: Seq[String]): JsObject = {
    val out = fields.map(input => getValueAtPath(input, obj))

    out.foldLeft(Json.obj()) { case (acc, curr) =>
      insertAtPath(acc, curr._1.split("\\.").toIndexedSeq, curr._2)
    }
  }

  def mergeOptJson(a: Option[JsObject], b: Option[JsObject]): Option[JsObject] =
    (a, b) match {
      case (None, None)       => None
      case (Some(x), None)    => Some(x)
      case (None, Some(y))    => Some(y)
      case (Some(x), Some(y)) => Some(x.deepMerge(y))
    }

}
