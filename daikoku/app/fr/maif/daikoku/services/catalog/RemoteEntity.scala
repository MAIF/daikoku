package fr.maif.daikoku.services.catalog

import fr.maif.daikoku.utils.Yaml
import org.joda.time.DateTime
import play.api.libs.json._

import scala.util.Try

case class RemoteCatalogError(source: String, message: String) {
  def json: JsValue = Json.obj("source" -> source, "message" -> message)
}

object RemoteCatalogError {

  def collect[A](
      results: Seq[Either[Seq[RemoteCatalogError], Seq[A]]]
  ): Either[Seq[RemoteCatalogError], Seq[A]] = {
    val errors = results.collect { case Left(errs) => errs }.flatten

    if (errors.nonEmpty) {
      Left(errors)
    } else {
      Right(results.collect { case Right(values) => values }.flatten)
    }
  }
}

case class CatalogFile(path: String, content: String)

object CatalogFile {

  // e.g. [{"path": "teams/weather.yaml", "content": "kind: team\n_id: ..."}]
  def readAll(body: JsValue): Option[Seq[CatalogFile]] =
    body.asOpt[Seq[JsObject]].flatMap { objects =>
      val files = objects.flatMap(o =>
        for {
          path <- (o \ "path").asOpt[String]
          content <- (o \ "content").asOpt[String]
        } yield CatalogFile(path, content)
      )

      Option.when(files.size == objects.size)(files)
    }
}

case class RemoteEntity(
    id: String,
    kind: String,
    source: String,
    syncAt: DateTime,
    content: JsObject
)

object RemoteEntity {

  private def isKubeStyle(json: JsObject): Boolean = {
    (json \ "apiVersion").asOpt[String].isDefined &&
    (json \ "kind").asOpt[String].isDefined &&
    (json \ "spec").asOpt[JsObject].isDefined
  }

  private def kubeStyleContent(json: JsObject): JsObject = {
    val kind = (json \ "kind").as[String]
    val spec = (json \ "spec").as[JsObject]
    val resolvedKind = (spec \ "kind").asOpt[String] match {
      case Some(sk) if sk == kind || sk.endsWith(s"/$kind") => sk
      case _                                                => kind
    }

    spec ++ Json.obj("kind" -> resolvedKind)
  }

  def fromJson(
      source: String,
      json: JsObject
  ): Either[Seq[RemoteCatalogError], RemoteEntity] = {
    val content = if (isKubeStyle(json)) kubeStyleContent(json) else json
    val id = (content \ "_id").asOpt[String]
    val kind = (content \ "kind").asOpt[String]

    (id, kind) match {
      case (Some(entityId), Some(entityKind)) =>
        Right(
          RemoteEntity(
            id = entityId,
            kind = entityKind,
            source = source,
            syncAt = DateTime.now(),
            content = content
          )
        )
      case _ =>
        val missingFields = Seq("_id" -> id, "kind" -> kind).collect {
          case (field, None) => field
        }

        Left(
          missingFields.map(field =>
            RemoteCatalogError(source, s"Missing required field '$field'")
          )
        )
    }
  }
}

object RemoteContentParser {

  def parse(
      content: JsValue,
      sourceName: String
  ): Either[Seq[RemoteCatalogError], Seq[RemoteEntity]] = {
    content match {
      case obj: JsObject => RemoteEntity.fromJson(sourceName, obj).map(Seq(_))
      case arr: JsArray  => parseArray(arr, sourceName)
      // a YAML document holding only comments loads as null
      case JsNull => Right(Seq.empty)
      case _ =>
        Left(
          Seq(
            RemoteCatalogError(
              sourceName,
              "Unsupported content: expected an object or an array of objects"
            )
          )
        )
    }
  }

  def parseRawContent(
      rawContent: String,
      sourceName: String
  ): Either[Seq[RemoteCatalogError], Seq[RemoteEntity]] = {
    Try(Json.parse(rawContent)).toOption match {
      case Some(json) => parse(json, sourceName)
      case None       => parseYamlDocuments(rawContent, sourceName)
    }
  }

  private def parseYamlDocuments(
      rawContent: String,
      sourceName: String
  ): Either[Seq[RemoteCatalogError], Seq[RemoteEntity]] = {
    val documents = splitContent(rawContent).zipWithIndex.filter {
      case (doc, _) => doc.trim.nonEmpty
    }

    RemoteCatalogError.collect(documents.map { case (doc, index) =>
      val parsed = Yaml.parse(doc) match {
        case Some(json) => parse(json, sourceName)
        case None =>
          Left(
            Seq(RemoteCatalogError(sourceName, "Cannot parse as JSON or YAML"))
          )
      }

      parsed.left.map(
        _.map(e => e.copy(message = s"document ${index + 1}: ${e.message}"))
      )
    })
  }

  private def splitContent(content: String): Seq[String] = {
    var out = Seq.empty[String]
    var current = Seq.empty[String]
    val lines = content.split("\n")
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

  private def parseArray(
      arr: JsArray,
      sourceName: String
  ): Either[Seq[RemoteCatalogError], Seq[RemoteEntity]] = {
    RemoteCatalogError.collect(arr.value.toSeq.zipWithIndex.map {
      case (obj: JsObject, _) =>
        RemoteEntity.fromJson(sourceName, obj).map(Seq(_))
      case (_, index) =>
        Left(
          Seq(
            RemoteCatalogError(
              sourceName,
              s"element ${index + 1}: expected an object"
            )
          )
        )
    })
  }
}
