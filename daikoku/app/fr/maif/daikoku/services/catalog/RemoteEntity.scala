package fr.maif.daikoku.services.catalog

import fr.maif.daikoku.domain.{RemoteCatalogError, RemoteCatalogRunEntity}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.services.catalog.sources.SourceUtils
import fr.maif.daikoku.utils.Yaml
import org.apache.pekko.stream.{Materializer, StreamLimitReachedException}
import org.apache.pekko.stream.scaladsl.Source
import org.apache.pekko.util.ByteString
import org.joda.time.DateTime
import play.api.libs.json._

import java.nio.charset.StandardCharsets
import java.util.zip.ZipInputStream
import scala.annotation.tailrec
import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success, Try, Using}

case class CatalogFile(path: String, content: String)

object CatalogFile {

  val maxBodyBytes: Long = 20L * 1024 * 1024
  val maxUnzippedBytes: Int = 100 * 1024 * 1024

  def fromBody(
      contentType: Option[String],
      body: Source[ByteString, ?]
  )(using env: Env): Future[Either[String, Seq[CatalogFile]]] = {
    given Materializer = env.defaultMaterializer
    given ExecutionContext = env.defaultExecutionContext

    val bytes = body
      .limitWeighted(maxBodyBytes)(_.size.toLong)
      .runFold(ByteString.empty)(_ ++ _)

    bytes
      .map(parseBody(contentType, _))
      .recover { case _: StreamLimitReachedException =>
        Left(s"The body is over ${maxBodyBytes / 1024 / 1024} MB")
      }
  }

  // a zip of the catalog root, or a JSON array of {path, content}
  private def parseBody(
      contentType: Option[String],
      body: ByteString
  ): Either[String, Seq[CatalogFile]] = {
    if (contentType.contains("application/zip")) {
      readZip(body)
    } else {
      val json = Try(Json.parse(body.toArray)).toOption

      json
        .flatMap(readAll)
        .toRight("Expected an array of {path, content}, or a zip")
    }
  }

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

  // keeps the .json, .yaml and .yml files, e.g. "teams/team-a/team.yaml"
  def readZip(body: ByteString): Either[String, Seq[CatalogFile]] = {
    val read = Using(new ZipInputStream(body.iterator.asInputStream)) { zip =>
      readEntries(zip, Vector.empty, maxUnzippedBytes)
    }

    read match {
      case Failure(_) => Left("The body is not a valid zip")
      case Success(None) =>
        Left(s"The zip is over ${maxUnzippedBytes / 1024 / 1024} MB unzipped")
      case Success(Some(Seq())) =>
        Left("The zip holds no .json, .yaml or .yml file")
      case Success(Some(files)) => Right(files)
    }
  }

  // None once the unzipped bytes exceed the budget, e.g. a zip bomb
  @tailrec
  private def readEntries(
      zip: ZipInputStream,
      files: Seq[CatalogFile],
      remaining: Int
  ): Option[Seq[CatalogFile]] =
    Option(zip.getNextEntry) match {
      case None => Some(files)
      case Some(entry) =>
        val bytes = zip.readNBytes(remaining + 1)
        val left = remaining - bytes.length

        if (left < 0) {
          None
        } else if (!SourceUtils.isEntityFile(entry.getName)) {
          readEntries(zip, files, left)
        } else {
          val content = new String(bytes, StandardCharsets.UTF_8)

          readEntries(zip, files :+ CatalogFile(entry.getName, content), left)
        }
    }
}

// path: the file path relative to the catalog root, e.g. "team-weather/apis/weather.yaml"
case class RemoteEntity(
    id: String,
    kind: String,
    source: String,
    syncAt: DateTime,
    content: JsObject,
    path: String = ""
) {
  def runEntity: RemoteCatalogRunEntity = {
    val name = (content \ "name")
      .asOpt[String]
      .orElse((content \ "customName").asOpt[String])
      .orElse((content \ "title").asOpt[String])

    RemoteCatalogRunEntity(kind, id, name)
  }
}

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
