package fr.maif.daikoku.utils

import org.yaml.snakeyaml.constructor.SafeConstructor
import org.yaml.snakeyaml.{DumperOptions, LoaderOptions, Yaml => SnakeYaml}
import play.api.libs.json._

import scala.jdk.CollectionConverters._
import scala.util.Try

object Yaml {

  private def loader(): SnakeYaml = new SnakeYaml(
    new SafeConstructor(new LoaderOptions())
  )

  def parse(content: String): Option[JsValue] =
    Try(convert(loader().load[Any](content))).toOption

  // YAML is a superset of JSON: snakeyaml reads the JSON text as is
  def write(json: JsValue): String = {
    val options = new DumperOptions()
    options.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK)
    new SnakeYaml(options).dump(loader().load[Any](Json.stringify(json)))
  }

  private def convert(value: Any): JsValue = value match {
    case null => JsNull
    case m: java.util.Map[_, _] =>
      JsObject(m.asScala.toSeq.map { case (k, v) => k.toString -> convert(v) })
    case l: java.util.List[_] => JsArray(l.asScala.toSeq.map(convert))
    case s: java.util.Set[_]  => JsArray(s.asScala.toSeq.map(convert))
    case b: Array[Byte] =>
      JsString(java.util.Base64.getEncoder.encodeToString(b))
    case s: String            => JsString(s)
    case b: java.lang.Boolean => JsBoolean(b)
    case i: java.lang.Integer => JsNumber(BigDecimal(i.intValue()))
    case l: java.lang.Long    => JsNumber(BigDecimal(l.longValue()))
    case d: java.lang.Double =>
      if (d.isInfinite || d.isNaN) JsString(d.toString)
      else JsNumber(BigDecimal(d.doubleValue()))
    case f: java.lang.Float =>
      if (f.isInfinite || f.isNaN) JsString(f.toString)
      else JsNumber(BigDecimal(f.doubleValue()))
    case bi: java.math.BigInteger => JsNumber(BigDecimal(bi))
    case bd: java.math.BigDecimal => JsNumber(bd)
    case d: java.util.Date        => JsString(d.toInstant.toString)
    case other                    => JsString(other.toString)
  }
}
