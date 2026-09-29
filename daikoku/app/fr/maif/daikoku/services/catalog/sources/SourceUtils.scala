package fr.maif.daikoku.services.catalog.sources

import fr.maif.daikoku.services.catalog.{
  RemoteCatalogError,
  RemoteContentParser,
  RemoteEntity
}
import fr.maif.daikoku.utils.Yaml
import play.api.libs.json._

import java.io.File
import java.nio.file.{FileSystems, Files}
import scala.jdk.CollectionConverters._
import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

object SourceUtils {

  def parseEntityContent(
      rawContent: String,
      sourceName: String
  ): Either[Seq[RemoteCatalogError], Seq[RemoteEntity]] = {
    RemoteContentParser.parseRawContent(rawContent, sourceName)
  }

  def fetchError(sourceName: String, err: JsValue): RemoteCatalogError = {
    val message =
      (err \ "error").asOpt[String].getOrElse(Json.stringify(err))

    RemoteCatalogError(sourceName, message)
  }

  private def isStringArray(value: JsValue): Option[JsArray] = value match {
    case arr: JsArray
        if arr.value.nonEmpty && arr.value.forall(_.isInstanceOf[JsString]) =>
      Some(arr)
    case _ => None
  }

  private def extractDeployListing(json: JsValue): Option[JsArray] = {
    isStringArray(json).orElse {
      json match {
        case obj: JsObject =>
          val hasApiVersion =
            (obj \ "apiVersion").asOpt[String].contains("daikoku.io/v1")
          val hasKind =
            (obj \ "kind").asOpt[String].contains("RemoteCatalogListing")
          if (hasApiVersion && hasKind) {
            (obj \ "spec" \ "catalog_listing")
              .asOpt[JsArray]
              .flatMap(isStringArray)
          } else {
            None
          }
        case _ => None
      }
    }
  }

  def isDeployListing(rawContent: String): Option[JsArray] = {
    Try(Json.parse(rawContent)).toOption.flatMap(extractDeployListing).orElse {
      Yaml.parse(rawContent).flatMap(extractDeployListing)
    }
  }

  def resolveDeployListing(
      deployArray: JsArray,
      fetchRelativePath: String => Future[Either[JsValue, String]],
      sourceName: String,
      resolveGlob: Option[String => Future[Either[JsValue, Seq[String]]]] = None
  )(implicit
      ec: ExecutionContext
  ): Future[Either[Seq[RemoteCatalogError], Seq[RemoteEntity]]] = {
    val rawPaths = deployArray.value.flatMap(_.asOpt[String]).toSeq

    def fetchAndParse(
        relativePath: String
    ): Future[Either[Seq[RemoteCatalogError], Seq[RemoteEntity]]] = {
      val fileSource = s"$sourceName/$relativePath"

      fetchRelativePath(relativePath).map {
        case Left(err)         => Left(Seq(fetchError(fileSource, err)))
        case Right(rawContent) => parseEntityContent(rawContent, fileSource)
      }
    }

    def fetchAll(
        paths: Seq[String]
    ): Future[Either[Seq[RemoteCatalogError], Seq[RemoteEntity]]] = {
      Future.sequence(paths.map(fetchAndParse)).map(RemoteCatalogError.collect)
    }

    Future
      .sequence(rawPaths.map { path =>
        resolveGlob match {
          case Some(resolve) if isGlobPattern(path) =>
            resolve(path).flatMap {
              case Left(err) =>
                Future.successful(
                  Left(Seq(fetchError(s"$sourceName/$path", err)))
                )
              case Right(resolvedPaths) => fetchAll(resolvedPaths)
            }
          case _ => fetchAndParse(path)
        }
      })
      .map(RemoteCatalogError.collect)
  }

  def fetchAllPages[A](
      perPage: Int,
      fetchPage: Int => Future[Either[JsValue, Seq[A]]],
      page: Int = 1,
      collected: Seq[A] = Seq.empty
  )(implicit ec: ExecutionContext): Future[Either[JsValue, Seq[A]]] = {
    fetchPage(page).flatMap {
      case Left(err) => Future.successful(Left(err))
      case Right(items) if items.size < perPage =>
        Future.successful(Right(collected ++ items))
      case Right(items) =>
        fetchAllPages(perPage, fetchPage, page + 1, collected ++ items)
    }
  }

  def isGlobPattern(path: String): Boolean = {
    path.contains("*") || path
      .contains("?") || (path.contains("[") && path.contains("]"))
  }

  def globToRegex(glob: String): String = {
    val clean = glob.stripPrefix("./")
    val result = new StringBuilder("^")
    var i = 0
    while (i < clean.length) {
      if (i < clean.length - 1 && clean(i) == '*' && clean(i + 1) == '*') {
        result.append(".*")
        i += 2
        if (i < clean.length && clean(i) == '/') i += 1
      } else {
        clean(i) match {
          case '*' => result.append("[^/]*")
          case '?' => result.append("[^/]")
          case '.' => result.append("\\.")
          case c   => result.append(java.util.regex.Pattern.quote(c.toString))
        }
        i += 1
      }
    }
    result.append("$").toString()
  }

  def matchesGlob(path: String, pattern: String): Boolean = {
    path.matches(globToRegex(pattern))
  }

  def resolveLocalGlob(
      baseDir: File,
      globPattern: String
  ): Either[JsValue, Seq[String]] = {
    val clean = globPattern.stripPrefix("./")
    val matcher = FileSystems.getDefault.getPathMatcher("glob:" + clean)
    Try {
      val stream = Files.walk(baseDir.toPath)
      try {
        stream
          .iterator()
          .asScala
          .filter(p => Files.isRegularFile(p))
          .map(p => baseDir.toPath.relativize(p))
          .filter(p =>
            matcher.matches(p) && isEntityFile(p.getFileName.toString)
          )
          .map(_.toString)
          .toSeq
      } finally stream.close()
    }.toEither.left.map(e =>
      Json.obj(
        "error" -> s"Cannot list files for '$globPattern': ${e.getMessage}"
      )
    )
  }

  def resolveRemoteGlob(
      allFiles: Seq[String],
      basePath: String,
      globPattern: String
  ): Seq[String] = {
    allFiles.flatMap { file =>
      val relativeOpt =
        if (basePath.isEmpty) Some(file)
        else if (file.startsWith(basePath + "/"))
          Some(file.stripPrefix(basePath + "/"))
        else None
      relativeOpt.filter(r => matchesGlob(r, globPattern))
    }
  }

  def isEntityFile(name: String): Boolean = {
    name.endsWith(".json") || name.endsWith(".yaml") || name.endsWith(".yml")
  }

  def hasFileExtension(path: String): Boolean = {
    val lastPart = path.split("/").lastOption.getOrElse("")
    lastPart.contains(".")
  }
}
