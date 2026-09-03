package fr.maif.daikoku.services.catalog

import fr.maif.daikoku.utils.Yaml
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json._

import scala.util.Try

case class RemoteEntity(id: String, kind: String, source: String, syncAt: DateTime, content: JsObject)

object RemoteEntity {

  private def isKubeStyle(json: JsObject): Boolean = {
    (json \ "apiVersion").asOpt[String].isDefined &&
    (json \ "kind").asOpt[String].isDefined &&
    (json \ "spec").asOpt[JsObject].isDefined
  }

  private def fromKubeStyle(source: String, json: JsObject): Option[RemoteEntity] = {
    for {
      kind        <- (json \ "kind").asOpt[String]
      spec        <- (json \ "spec").asOpt[JsObject]
      specKind     = (spec \ "kind").asOpt[String]
      resolvedKind = specKind match {
                       case Some(sk) if sk == kind || sk.endsWith(s"/$kind") => sk
                       case _                                                => kind
                     }
      content      = spec ++ Json.obj("kind" -> resolvedKind)
      entityId    <- (content \ "_id").asOpt[String]
    } yield RemoteEntity(
      id = entityId,
      kind = resolvedKind,
      source = source,
      syncAt = DateTime.now(),
      content = content
    )
  }

  private def fromFlatJson(source: String, json: JsObject): Option[RemoteEntity] = {
    for {
      entityId <- (json \ "_id").asOpt[String]
      kind     <- (json \ "kind").asOpt[String]
    } yield {
      RemoteEntity(
        id = entityId,
        kind = kind,
        source = source,
        syncAt = DateTime.now(),
        content = json
      )
    }
  }

  def fromJson(source: String, json: JsObject): Option[RemoteEntity] = {
    if (isKubeStyle(json)) fromKubeStyle(source, json)
    else fromFlatJson(source, json)
  }
}

object RemoteContentParser {

  private val logger = Logger("daikoku-remote-catalog-parser")

  def parse(content: JsValue, sourceName: String): Seq[RemoteEntity] = {
    content match {
      case obj: JsObject => parseObject(obj, sourceName)
      case arr: JsArray  => parseArray(arr, sourceName)
      case _             =>
        logger.warn(s"Unsupported content format from source $sourceName")
        Seq.empty
    }
  }

  def parseRawContent(rawContent: String, sourceName: String): Seq[RemoteEntity] = {
    Try(Json.parse(rawContent)).toOption match {
      case Some(json) => parse(json, sourceName)
      case None       =>
        splitContent(rawContent).filter(_.trim.nonEmpty).flatMap { doc =>
          Yaml.parse(doc) match {
            case Some(json) => parse(json, sourceName)
            case None       =>
              logger.warn(s"Cannot parse content from $sourceName as JSON or YAML")
              Seq.empty
          }
        }
    }
  }

  private def splitContent(content: String): Seq[String] = {
    var out     = Seq.empty[String]
    var current = Seq.empty[String]
    val lines   = content.split("\n")
    lines.foreach { line =>
      if (line.matches("^---\\s*$")) {
        out = out :+ current.mkString("\n")
        current = Seq.empty[String]
      } else {
        current = current :+ line
      }
    }
    if (current.nonEmpty)
      out = out :+ current.mkString("\n")
    out
  }

  private def parseObject(obj: JsObject, sourceName: String): Seq[RemoteEntity] = {
    RemoteEntity.fromJson(sourceName, obj).toSeq
  }

  private def parseArray(arr: JsArray, sourceName: String): Seq[RemoteEntity] = {
    arr.value.flatMap {
      case obj: JsObject => RemoteEntity.fromJson(sourceName, obj)
      case _             => None
    }.toSeq
  }
}
