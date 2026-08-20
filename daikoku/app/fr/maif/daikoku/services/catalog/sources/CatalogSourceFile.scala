package fr.maif.daikoku.services.catalog.sources

import fr.maif.daikoku.domain.RemoteCatalog
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.services.catalog.{CatalogSource, RemoteEntity}
import play.api.Logger
import play.api.libs.json._

import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

class CatalogSourceFile extends CatalogSource {

  import scala.sys.process._

  private val logger = Logger("daikoku-remote-catalog-source-file")

  override def sourceKind: String = "file"

  private def runPreCommand(catalog: RemoteCatalog): Either[String, Unit] = {
    val preCommand =
      (catalog.source.config \ "pre_command").asOpt[Seq[String]].getOrElse(Seq.empty)
    if (preCommand.nonEmpty) {
      Try {
        var stdout        = ""
        var stderr        = ""
        val processLogger = ProcessLogger(
          out => { stdout = stdout + out + "\n" },
          err => { stderr = stderr + err + "\n" }
        )
        val code          = preCommand.!(processLogger)
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

  override def fetch(catalog: RemoteCatalog, args: JsObject)(implicit
      ec: ExecutionContext,
      env: Env
  ): Future[Either[JsValue, Seq[RemoteEntity]]] = {
    val path = (catalog.source.config \ "path").asOpt[String].getOrElse("")

    runPreCommand(catalog) match {
      case Left(err) =>
        Future.successful(Left(Json.obj("error" -> err)): Either[JsValue, Seq[RemoteEntity]])
      case Right(()) =>
        Try {
          val file = new File(path)
          if (file.isDirectory) {
            val entityFiles =
              file.listFiles().filter(f => f.isFile && SourceUtils.isEntityFile(f.getName)).toSeq
            val entities    = entityFiles.flatMap { f =>
              val rawContent = new String(Files.readAllBytes(f.toPath), StandardCharsets.UTF_8)
              SourceUtils.parseEntityContent(rawContent, s"file://${f.getAbsolutePath}")
            }
            Future.successful(Right(entities): Either[JsValue, Seq[RemoteEntity]])
          } else {
            val rawContent = new String(Files.readAllBytes(file.toPath), StandardCharsets.UTF_8)
            SourceUtils.isDeployListing(rawContent) match {
              case Some(arr) =>
                val basePath = file.getParentFile.getAbsolutePath
                SourceUtils.resolveDeployListing(
                  arr,
                  relativePath => {
                    Try {
                      val relFile    = new File(basePath, relativePath)
                      val relContent =
                        new String(Files.readAllBytes(relFile.toPath), StandardCharsets.UTF_8)
                      Future.successful(Right(relContent): Either[JsValue, String])
                    }.getOrElse {
                      Future.successful(
                        Left(Json.obj("error" -> s"Cannot read file $relativePath")): Either[JsValue, String]
                      )
                    }
                  },
                  s"file://$path",
                  resolveGlob = Some(glob =>
                    Future.successful(
                      Right(SourceUtils.resolveLocalGlob(new File(basePath), glob)): Either[JsValue, Seq[String]]
                    )
                  )
                )
              case None      =>
                Future.successful(
                  Right(SourceUtils.parseEntityContent(rawContent, s"file://$path")): Either[JsValue, Seq[
                    RemoteEntity
                  ]]
                )
            }
          }
        }.recover { case e: Throwable =>
          logger.error(s"Error reading file $path", e)
          Future.successful(
            Left(Json.obj("error" -> s"Error reading file: ${e.getMessage}")): Either[JsValue, Seq[RemoteEntity]]
          )
        }.get
    }
  }
}
