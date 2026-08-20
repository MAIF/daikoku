package fr.maif.daikoku.services.catalog

import fr.maif.daikoku.domain.RemoteCatalog
import fr.maif.daikoku.env.Env
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future}

trait CatalogSource {

  def sourceKind: String

  def supportsWebhook: Boolean = false

  def webhookDeploySelect(possibleCatalogs: Seq[RemoteCatalog], payload: JsValue)(implicit
      ec: ExecutionContext,
      env: Env
  ): Future[Either[JsValue, Seq[RemoteCatalog]]] =
    Future.successful(Left(Json.obj("error" -> s"$sourceKind source does not support webhooks")))

  def webhookDeployExtractArgs(catalog: RemoteCatalog, payload: JsValue)(implicit
      ec: ExecutionContext,
      env: Env
  ): Future[Either[JsValue, JsObject]] =
    Future.successful(Left(Json.obj("error" -> s"$sourceKind source does not support webhooks")))

  def fetch(catalog: RemoteCatalog, args: JsObject)(implicit
      ec: ExecutionContext,
      env: Env
  ): Future[Either[JsValue, Seq[RemoteEntity]]]
}
