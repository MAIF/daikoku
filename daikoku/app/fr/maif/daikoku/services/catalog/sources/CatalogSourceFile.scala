package fr.maif.daikoku.services.catalog.sources

import fr.maif.daikoku.domain.RemoteCatalog
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.services.catalog.{
  CatalogSource,
  RemoteCatalogError,
  RemoteEntity
}
import play.api.libs.json._

import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

class CatalogSourceFile extends CatalogSource {

  import scala.sys.process._

  override def sourceKind: String = "file"

  private def runPreCommand(catalog: RemoteCatalog): Either[String, Unit] = {
    val preCommand =
      (catalog.source.config \ "pre_command")
        .asOpt[Seq[String]]
        .getOrElse(Seq.empty)
    if (preCommand.nonEmpty) {
      Try {
        var stdout = ""
        var stderr = ""
        val processLogger = ProcessLogger(
          out => { stdout = stdout + out + "\n" },
          err => { stderr = stderr + err + "\n" }
        )
        val code = preCommand.!(processLogger)
        if (code != 0) {
          Left(s"Pre-command failed with exit code $code. stderr: $stderr")
        } else {
          Right(())
        }
      }.getOrElse(Left("Pre-command execution failed"))
    } else {
      Right(())
    }
  }

  private def readFile(file: File): Either[JsValue, String] = {
    Try(
      new String(Files.readAllBytes(file.toPath), StandardCharsets.UTF_8)
    ).toEither.left
      .map(e => Json.obj("error" -> s"Cannot read file: ${e.getMessage}"))
  }

  private def readAndParse(
      file: File
  ): Either[Seq[RemoteCatalogError], Seq[RemoteEntity]] = {
    val sourceName = s"file://${file.getAbsolutePath}"

    readFile(file) match {
      case Left(err) => Left(Seq(SourceUtils.fetchError(sourceName, err)))
      case Right(rawContent) =>
        SourceUtils.parseEntityContent(rawContent, sourceName)
    }
  }

  private def fetchDirectory(
      dir: File,
      recursive: Boolean
  ): Either[Seq[RemoteCatalogError], Seq[RemoteEntity]] = {
    val sourceName = s"file://${dir.getAbsolutePath}"
    val entityFiles: Either[Seq[RemoteCatalogError], Seq[File]] =
      if (recursive) {
        SourceUtils
          .resolveLocalGlob(dir, "**")
          .left
          .map(err => Seq(SourceUtils.fetchError(sourceName, err)))
          .map(_.map(relativePath => new File(dir, relativePath)))
      } else {
        Option(dir.listFiles())
          .toRight(Seq(RemoteCatalogError(sourceName, "Cannot list directory")))
          .map(
            _.filter(f => f.isFile && SourceUtils.isEntityFile(f.getName)).toSeq
          )
      }

    entityFiles.flatMap(files =>
      RemoteCatalogError.collect(files.map(readAndParse))
    )
  }

  private def fetchFile(
      file: File,
      path: String
  )(implicit
      ec: ExecutionContext
  ): Future[Either[Seq[RemoteCatalogError], Seq[RemoteEntity]]] = {
    val sourceName = s"file://$path"

    readFile(file) match {
      case Left(err) =>
        Future.successful(Left(Seq(SourceUtils.fetchError(sourceName, err))))
      case Right(rawContent) =>
        SourceUtils.isDeployListing(rawContent) match {
          case Some(arr) =>
            val baseDir = file.getAbsoluteFile.getParentFile
            SourceUtils.resolveDeployListing(
              arr,
              relativePath =>
                Future.successful(readFile(new File(baseDir, relativePath))),
              sourceName,
              resolveGlob = Some(glob =>
                Future.successful(SourceUtils.resolveLocalGlob(baseDir, glob))
              )
            )
          case None =>
            Future.successful(
              SourceUtils.parseEntityContent(rawContent, sourceName)
            )
        }
    }
  }

  override def fetch(catalog: RemoteCatalog)(implicit
      ec: ExecutionContext,
      env: Env
  ): Future[Either[Seq[RemoteCatalogError], Seq[RemoteEntity]]] = {
    val path = (catalog.source.config \ "path").asOpt[String].getOrElse("")
    val file = new File(path)
    val hasPreCommand =
      (catalog.source.config \ "pre_command")
        .asOpt[Seq[String]]
        .exists(_.nonEmpty)

    def disabled(what: String, key: String) =
      Future.successful(
        Left(
          Seq(
            RemoteCatalogError(
              sourceKind,
              s"$what is disabled on this instance (daikoku.remoteCatalogJob.$key)"
            )
          )
        )
      )

    if (!env.config.remoteCatalogAllowFileSource) {
      disabled("file source", "allowFileSource")
    } else if (hasPreCommand && !env.config.remoteCatalogAllowPreCommand) {
      disabled("pre_command", "allowPreCommand")
    } else {
      runPreCommand(catalog) match {
        case Left(err) =>
          Future.successful(Left(Seq(RemoteCatalogError(sourceKind, err))))
        case Right(()) =>
          if (file.isDirectory) {
            val recursive = (catalog.source.config \ "recursive")
              .asOpt[Boolean]
              .getOrElse(false)
            Future.successful(fetchDirectory(file, recursive))
          } else {
            fetchFile(file, path)
          }
      }
    }
  }
}
