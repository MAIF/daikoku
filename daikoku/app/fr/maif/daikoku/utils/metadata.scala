package fr.maif.daikoku.utils

import fr.maif.daikoku.login.OAuth2Config
import play.api.libs.json.{JsBoolean, JsNull, JsNumber, JsObject, JsString, JsValue, Json}

def getFilteredMetadataFromOauth(
    authConfig: OAuth2Config,
    userFromOauth: JsValue
) = {
  authConfig.selectedMetadata match {
    case Some(selectedMetadata)
        if selectedMetadata.nonEmpty && selectedMetadata.trim != "*" =>
      userFromOauth
        .asOpt[JsObject]
        .map(
          _.value
            .collect {
              case (key, value) if selectedMetadata.contains(key) =>
                value match {
                  case JsString(s)  => key -> s
                  case JsBoolean(b) => key -> b.toString
                  case JsNumber(n)  => key -> n.toString
                  case JsNull       => key -> ""
                  case other        => key -> other.toString
                }
            }
            .toMap
        )
        .getOrElse(Map.empty)
    case Some(selectedMetadata) if selectedMetadata == "*" =>
      userFromOauth
        .asOpt[JsObject]
        .map(
          _.value
            .map { case (key, value) =>
              value match {
                case JsString(s)  => key -> s
                case JsBoolean(b) => key -> b.toString
                case JsNumber(n)  => key -> n.toString
                case JsNull       => key -> ""
                case other        => key -> other.toString
              }
            }
            .toMap
        )
        .getOrElse(Map.empty)
    case _ => Map.empty
  }
}

def metadataObjectToMap(
                                 obj: Map[String, JsValue]
                               ): Map[String, String] = {
  obj.map {
    case (k, JsString(v))  => k -> v
    case (k, JsBoolean(v)) => k -> v.toString
    case (k, JsNumber(v))  => k -> v.toString
    case (k, JsNull)       => k -> ""
    case (k, v)            => k -> Json.stringify(v)
  }
}
