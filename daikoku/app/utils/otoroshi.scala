package fr.maif.otoroshi.daikoku.utils

import akka.http.scaladsl.util.FastFuture
import akka.stream.Materializer
import controllers.AppError
import controllers.AppError.OtoroshiError
import fr.maif.otoroshi.daikoku.domain.json.ActualOtoroshiApiKeyFormat
import fr.maif.otoroshi.daikoku.domain.{ActualOtoroshiApiKey, OtoroshiSettings}
import fr.maif.otoroshi.daikoku.env.Env
import play.api.Logger
import play.api.libs.json._
import play.api.libs.ws.{WSAuthScheme, WSRequest}
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}

class OtoroshiExpositionFilter(stateHeaderName: String,
                               stateRespHeaderName: String,
                               env: Env)(
    implicit val mat: Materializer,
    ec: ExecutionContext
) extends Filter {

  def apply(nextFilter: RequestHeader => Future[Result])(
      request: RequestHeader): Future[Result] = {
    val state = request.headers
      .get(stateHeaderName)
      .getOrElse("--")
    nextFilter(request).map { result =>
      result.withHeaders(stateRespHeaderName -> state)
    }
  }
}

class OtoroshiClient(env: Env) {

  implicit val ec = env.defaultExecutionContext
  val ws = env.wsClient

  def client(path: String)(
      implicit otoroshiSettings: OtoroshiSettings): WSRequest = {
    ws.url(s"${otoroshiSettings.url}${path}")
      .addHttpHeaders(
        "Host" -> otoroshiSettings.host
      )
      .withAuth(
        otoroshiSettings.clientId,
        otoroshiSettings.clientSecret,
        WSAuthScheme.BASIC
      )
  }

  def getServiceGroups()(
      implicit otoroshiSettings: OtoroshiSettings): Future[JsArray] = {
    client(s"/api/groups").get().flatMap { resp =>
      if (resp.status == 200) {
        val res = resp.json.as[JsArray]
        FastFuture.successful(JsArray(res.value.filter {
          item =>
            val id = (item \ "id").as[String]
            val name = (item \ "name").as[String]
            (env.config.otoroshiGroupIdPrefix,
             env.config.otoroshiGroupNamePrefix) match {
              case (None, None)         => true
              case (Some(prefix), None) => id.startsWith(prefix)
              case (None, Some(prefix)) => name.startsWith(prefix)
              case (Some(p1), Some(p2)) =>
                id.startsWith(p1) && name.startsWith(p2)
            }
        }))
      } else {
        Future
          .failed(new RuntimeException(
            s"Error while fetching otoroshi service groups: ${resp.status} - ${resp.body}"))
      }
    }
  }

  def getServiceGroup(groupId: String)(
      implicit otoroshiSettings: OtoroshiSettings): Future[JsObject] = {
    client(s"/api/groups/$groupId").get().flatMap { resp =>
      if (resp.status == 200) {
        val res = resp.json.as[JsObject]
        val id = (res \ "id").as[String]
        val name = (res \ "name").as[String]
        val passes = (env.config.otoroshiGroupIdPrefix,
                      env.config.otoroshiGroupNamePrefix) match {
          case (None, None)         => true
          case (Some(prefix), None) => id.startsWith(prefix)
          case (None, Some(prefix)) => name.startsWith(prefix)
          case (Some(p1), Some(p2)) => id.startsWith(p1) && name.startsWith(p2)
        }
        if (passes) {
          FastFuture.successful(res)
        } else {
          Future.failed(new RuntimeException(s"Bad group id/name"))
        }
      } else {
        Future
          .failed(new RuntimeException(
            s"Error while fetching otoroshi service group: ${resp.status} - ${resp.body}"))
      }
    }
  }

  def validateGroupNameFromId[A](groupId: String)(f: => Future[A])(
      implicit otoroshiSettings: OtoroshiSettings): Future[A] = {
    if (env.config.otoroshiGroupIdPrefix.isDefined && !groupId.startsWith(
          env.config.otoroshiGroupIdPrefix.get)) {
      Future.failed(new RuntimeException(s"Bad group id"))
    } else {
      getServiceGroup(groupId)(otoroshiSettings).flatMap(g => f).recoverWith {
        case e => Future.failed(e)
      }
    }
  }

  def getApikey(groupId: String, clientId: String)(
      implicit otoroshiSettings: OtoroshiSettings
  ): Future[Either[JsError, ActualOtoroshiApiKey]] = {
    validateGroupNameFromId(groupId) {
      client(s"/api/groups/$groupId/apikeys/$clientId").get().map { resp =>
        if (resp.status == 200) {
          resp.json.validate(ActualOtoroshiApiKeyFormat) match {
            case JsSuccess(k, _) => Right(k)
            case e: JsError      => Left(e)
          }
        } else {
          Left(JsError(
            s"Error while fetching otoroshi apikey: ${resp.status} - ${resp.body}"))
        }
      }
    }
  }

  def createApiKey(groupId: String, key: ActualOtoroshiApiKey)(
      implicit otoroshiSettings: OtoroshiSettings
  ): Future[Either[AppError, ActualOtoroshiApiKey]] = {
    validateGroupNameFromId(groupId) {
      client(s"/api/groups/$groupId/apikeys").post(key.asJson).map { resp =>
        if (resp.status == 200) {
          resp.json.validate(ActualOtoroshiApiKeyFormat) match {
            case JsSuccess(k, _) => Right(k)
            case e: JsError      => Left(OtoroshiError(JsError.toJson(e)))
          }
        } else {
          Left(OtoroshiError(Json.obj(
            "error" -> s"Error while creating otoroshi apikey: ${resp.status} - ${resp.body}")))
        }
      }
    }
  }

  def updateApiKey(groupId: String, key: ActualOtoroshiApiKey)(
      implicit otoroshiSettings: OtoroshiSettings
  ): Future[ActualOtoroshiApiKey] = {
    validateGroupNameFromId(groupId) {
      client(s"/api/groups/$groupId/apikeys/${key.clientId}")
        .put(key.asJson)
        .flatMap { resp =>
          if (resp.status == 200) {
            resp.json.validate(ActualOtoroshiApiKeyFormat) match {
              case JsSuccess(k, _) => Future.successful(k)
              case JsError(e) =>
                Future.failed(
                  new RuntimeException(
                    s"Error while reading otoroshi apikey $e"))
            }
          } else {
            Future.failed(new RuntimeException(
              s"Error while updating otoroshi apikey: ${resp.status} - ${resp.body}"))
          }
        }
    }
  }

  def deleteApiKey(groupId: String, clientId: String)(
      implicit otoroshiSettings: OtoroshiSettings): Future[Unit] = {
    validateGroupNameFromId(groupId) {
      client(s"/api/groups/$groupId/apikeys/$clientId").delete().flatMap {
        resp =>
          if (resp.status == 200) {
            Future.successful(())
          } else {
            Future.failed(new RuntimeException(
              s"Error while deleting otoroshi apikey: ${resp.status} - ${resp.body}"))
          }
      }
    }
  }

  def getServiceConsumption(service: String, from: String, to: String)(
      implicit otoroshiSettings: OtoroshiSettings): Future[JsObject] = {
    client(s"/api/stats?service=$service&from=$from&to=$to").get().flatMap {
      resp =>
        if (resp.status == 200) {
          Future.successful(resp.json.as[JsObject])
        } else {
          Future.failed(new RuntimeException(
            s"Error while getting otoroshi apikey stats: ${resp.status} - ${resp.body}"))
        }
    }
  }

  def getApiKeyConsumption(clientId: String, from: String, to: String)(
      implicit otoroshiSettings: OtoroshiSettings): Future[JsObject] = {
    client(s"/api/stats?apikey=$clientId&from=$from&to=$to").get().flatMap {
      resp =>
        if (resp.status == 200) {
          Future.successful(resp.json.as[JsObject])
        } else {
          Future.failed(new RuntimeException(
            s"Error while getting otoroshi apikey stats: ${resp.status} - ${resp.body}"))
        }
    }
  }
  def getApiKeyQuotas(clientId: String, groupId: String)(
      implicit otoroshiSettings: OtoroshiSettings): Future[JsObject] = {
    validateGroupNameFromId(groupId) {
      client(s"/api/groups/$groupId/apikeys/$clientId/quotas").get().flatMap {
        resp =>
          if (resp.status == 200) {
            Future.successful(resp.json.as[JsObject])
          } else {
            Future.failed(new RuntimeException(
              s"Error while getting otoroshi apikey stats: ${resp.status} - ${resp.body}"))
          }
      }
    }
  }

  def getGroupConsumption(groupId: String, from: String, to: String)(
      implicit otoroshiSettings: OtoroshiSettings): Future[JsObject] = {
    validateGroupNameFromId(groupId) {
      client(s"/api/stats?group=$groupId&from=$from&to=$to").get().flatMap {
        resp =>
          if (resp.status == 200) {
            Future.successful(resp.json.as[JsObject])
          } else {
            Future.failed(new RuntimeException(
              s"Error while getting otoroshi apikey stats: ${resp.status} - ${resp.body}"))
          }
      }
    }
  }
}
