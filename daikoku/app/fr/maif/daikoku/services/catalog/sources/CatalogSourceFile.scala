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
      dir: File
  ): Either[Seq[RemoteCatalogError], Seq[RemoteEntity]] = {
    Option(dir.listFiles()) match {
      case None =>
        Left(
          Seq(
            RemoteCatalogError(
              s"file://${dir.getAbsolutePath}",
              "Cannot list directory"
            )
          )
        )
      case Some(files) =>
        val entityFiles =
          files
            .filter(f => f.isFile && SourceUtils.isEntityFile(f.getName))
            .toSeq

        RemoteCatalogError.collect(entityFiles.map(readAndParse))
    }
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

  override def fetch(catalog: RemoteCatalog, args: JsObject)(implicit
      ec: ExecutionContext,
      env: Env
  ): Future[Either[Seq[RemoteCatalogError], Seq[RemoteEntity]]] = {
    val path = (catalog.source.config \ "path").asOpt[String].getOrElse("")
    val file = new File(path)

    runPreCommand(catalog) match {
      case Left(err) =>
        Future.successful(Left(Seq(RemoteCatalogError(sourceKind, err))))
      case Right(()) =>
        if (file.isDirectory) {
          Future.successful(fetchDirectory(file))
        } else {
          fetchFile(file, path)
        }
    }
  }
}
