package fr.maif.otoroshi.daikoku.audit.config

import play.api.libs.json._

import scala.collection.MapView
import scala.util.Try

case class ElasticAnalyticsConfig(
    clusterUri: String,
    index: Option[String] = None,
    `type`: Option[String] = None,
    user: Option[String] = None,
    password: Option[String] = None,
    headers: Map[String, String] = Map.empty[String, String]
) {
  def toJson: JsValue = ElasticAnalyticsConfig.format.writes(this)
}

object ElasticAnalyticsConfig {
  val format: Format[ElasticAnalyticsConfig] = new Format[ElasticAnalyticsConfig] {
    override def writes(o: ElasticAnalyticsConfig) = {
      Json.obj(
        "clusterUri" -> o.clusterUri,
        "index" -> o.index.map(JsString.apply).getOrElse(JsNull).as[JsValue],
        "type" -> o.`type`.map(JsString.apply).getOrElse(JsNull).as[JsValue],
        "user" -> o.user.map(JsString.apply).getOrElse(JsNull).as[JsValue],
        "password" -> o.password
          .map(JsString.apply)
          .getOrElse(JsNull)
          .as[JsValue],
        "headers" -> JsObject(o.headers.view.mapValues(JsString.apply).toSeq),
      )
    }
    override def reads(json: JsValue) =
      Try {
        JsSuccess(
          ElasticAnalyticsConfig(
            clusterUri = (json \ "clusterUri").asOpt[String].map(_.trim).get,
            index = (json \ "index").asOpt[String].map(_.trim),
            `type` = (json \ "type").asOpt[String].map(_.trim),
            user = (json \ "user").asOpt[String].map(_.trim),
            password = (json \ "password").asOpt[String].map(_.trim),
            headers = (json \ "headers")
              .asOpt[Map[String, String]]
              .getOrElse(Map.empty[String, String])
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
  }
}

case class Webhook(url: String,
                   headers: Map[String, String] = Map.empty[String, String]) {
  def toJson: JsObject = Webhook.format.writes(this)
}

object Webhook {
  implicit val format: OFormat[Webhook] = Json.format[Webhook]
}
