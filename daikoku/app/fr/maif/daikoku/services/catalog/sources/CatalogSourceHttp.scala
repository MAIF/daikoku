package fr.maif.daikoku.services.catalog.sources

import fr.maif.daikoku.domain.RemoteCatalog
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.services.catalog.{CatalogSource, RemoteEntity}
import play.api.Logger
import play.api.libs.json._

import java.util.concurrent.TimeUnit
import scala.concurrent.duration.Duration
import scala.concurrent.{ExecutionContext, Future}

class CatalogSourceHttp extends CatalogSource {

  private val logger = Logger("daikoku-remote-catalog-source-http")

  override def sourceKind: String = "http"

  override def fetch(catalog: RemoteCatalog, args: JsObject)(implicit
      ec: ExecutionContext,
      env: Env
  ): Future[Either[JsValue, Seq[RemoteEntity]]] = {
    val url     = (catalog.source.config \ "url").asOpt[String].getOrElse("")
    val headers = (catalog.source.config \ "headers").asOpt[Map[String, String]].getOrElse(Map.empty)
    val timeout = (catalog.source.config \ "timeout").asOpt[Long].getOrElse(30000L)

    if (url.isEmpty) {
      Future.successful(Left(Json.obj("error" -> "No URL configured")))
    } else {
      fetchUrl(url, headers, timeout, env).flatMap {
        case Left(err)         => Future.successful(Left(err))
        case Right(rawContent) =>
          SourceUtils.isDeployListing(rawContent) match {
            case Some(arr) =>
              val baseUrl = url.substring(0, url.lastIndexOf('/'))
              SourceUtils.resolveDeployListing(
                arr,
                relativePath => fetchUrl(s"$baseUrl/$relativePath", headers, timeout, env),
                s"http://$url"
              )
            case None      =>
              Future.successful(
                Right(SourceUtils.parseEntityContent(rawContent, s"http://$url")): Either[JsValue, Seq[
                  RemoteEntity
                ]]
              )
          }
      }
    }
  }

  private def fetchUrl(url: String, headers: Map[String, String], timeout: Long, env: Env)(implicit
      ec: ExecutionContext
  ): Future[Either[JsValue, String]] = {
    env.wsClient
      .url(url)
      .withRequestTimeout(Duration(timeout, TimeUnit.MILLISECONDS))
      .withHttpHeaders(headers.toSeq: _*)
      .get()
      .map { resp =>
        val body: String = resp.body
        if (resp.status == 200) {
          Right(body): Either[JsValue, String]
        } else {
          Left(Json.obj("error" -> s"HTTP ${resp.status}: ${body.take(500)}")): Either[JsValue, String]
        }
      }
      .recover { case e: Throwable =>
        logger.error(s"Error fetching from $url", e)
        Left(Json.obj("error" -> s"Error fetching from HTTP: ${e.getMessage}")): Either[JsValue, String]
      }
  }
}
