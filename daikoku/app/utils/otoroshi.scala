package fr.maif.otoroshi.daikoku.utils

import akka.http.scaladsl.util.FastFuture
import akka.stream.Materializer
import cats.data.EitherT
import cats.implicits.catsSyntaxOptionId
import controllers.AppError
import controllers.AppError.OtoroshiError
import fr.maif.otoroshi.daikoku.audit.{
  ElasticReadsAnalytics,
  ElasticWritesAnalytics
}
import fr.maif.otoroshi.daikoku.audit.config.ElasticAnalyticsConfig
import fr.maif.otoroshi.daikoku.domain.json.ActualOtoroshiApiKeyFormat
import fr.maif.otoroshi.daikoku.domain.{
  ActualOtoroshiApiKey,
  ApiSubscription,
  OtoroshiSettings,
  Tenant,
  json
}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
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

  implicit val ec: ExecutionContext = env.defaultExecutionContext
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

  def getService(serviceId: String)(
      implicit otoroshiSettings: OtoroshiSettings): Future[JsObject] = {
    client(s"/api/services/$serviceId").get().flatMap { resp =>
      if (resp.status == 200) {
        val res = resp.json.as[JsObject]
        FastFuture.successful(res)
      } else {
        Future
          .failed(new RuntimeException(
            s"Error while fetching otoroshi service: ${resp.status} - ${resp.body}"))
      }
    }
  }

  def getServices()(
      implicit otoroshiSettings: OtoroshiSettings): Future[JsArray] = {
    client(s"/api/services").get().flatMap { resp =>
      if (resp.status == 200) {
        val res = resp.json.as[JsArray]
        FastFuture.successful(JsArray(res.value))
      } else {
        Future
          .failed(new RuntimeException(
            s"Error while fetching otoroshi service groups: ${resp.status} - ${resp.body}"))
      }
    }
  }

  def getRoutes()(
      implicit otoroshiSettings: OtoroshiSettings): Future[JsArray] = {
    client(s"/api/routes").get().flatMap { resp =>
      if (resp.status == 200) {
        val res = resp.json.as[JsArray]
        FastFuture.successful(JsArray(res.value))
      } else {
        Future
          .failed(new RuntimeException(
            s"Error while fetching otoroshi service routes: ${resp.status} - ${resp.body}"))
      }
    }
  }

  def getApiKeys()(
      implicit otoroshiSettings: OtoroshiSettings): Future[JsArray] = {
    client(s"/api/apikeys").get().flatMap { resp =>
      if (resp.status == 200) {
        val res = resp.json.as[JsArray]
        FastFuture.successful(JsArray(res.value))
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

  def getApikey(clientId: String)(
      implicit otoroshiSettings: OtoroshiSettings
  ): Future[Either[AppError, ActualOtoroshiApiKey]] = {
    client(s"/api/apikeys/$clientId").get().map { resp =>
      if (resp.status == 200) {
        resp.json.validate(ActualOtoroshiApiKeyFormat) match {
          case JsSuccess(k, _) => Right(k)
          case e: JsError      => Left(OtoroshiError(JsError.toJson(e)))
        }
      } else {
        Left(OtoroshiError(Json.obj(
          "error" -> s"Error while fetching otoroshi apikey: ${resp.status} - ${resp.body}")))
      }
    }
  }

  def createApiKey(key: ActualOtoroshiApiKey)(
      implicit otoroshiSettings: OtoroshiSettings
  ): Future[Either[AppError, ActualOtoroshiApiKey]] = {
    client(s"/api/apikeys").post(key.asJson).map { resp =>
      if (resp.status == 201 || resp.status == 200) {
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

  def updateApiKey(key: ActualOtoroshiApiKey)(
      implicit otoroshiSettings: OtoroshiSettings
  ): Future[Either[AppError, ActualOtoroshiApiKey]] = {
    client(s"/api/apikeys/${key.clientId}")
      .put(key.asJson)
      .map { resp =>
        if (resp.status == 200) {
          resp.json.validate(ActualOtoroshiApiKeyFormat) match {
            case JsSuccess(k, _) => Right(k)
            case JsError(e) =>
              Left(OtoroshiError(
                Json.obj("error" -> s"Error while reading otoroshi apikey $e")))
          }
        } else
          Left(OtoroshiError(Json.obj(
            "error" -> s"Error while updating otoroshi apikey: ${resp.status} - ${resp.body}")))
      }
  }

  def deleteApiKey(clientId: String)(
      implicit otoroshiSettings: OtoroshiSettings): Future[Unit] = {
    client(s"/api/apikeys/$clientId").delete().flatMap { resp =>
      if (resp.status == 200) {
        Future.successful(())
      } else {
        Future.failed(new RuntimeException(
          s"Error while deleting otoroshi apikey: ${resp.status} - ${resp.body}"))
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

  def getApiKeyQuotas(clientId: String)(
      implicit otoroshiSettings: OtoroshiSettings): Future[JsObject] = {
    client(s"/api/apikeys/$clientId/quotas").get().flatMap { resp =>
      if (resp.status == 200) {
        Future.successful(resp.json.as[JsObject])
      } else {
        Future.failed(new RuntimeException(
          s"Error while getting otoroshi apikey stats: ${resp.status} - ${resp.body}"))
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

  def getSubscriptionLastUsage(subscriptions: Seq[ApiSubscription])(
      implicit otoroshiSettings: OtoroshiSettings,
      tenant: Tenant): EitherT[Future, JsArray, JsArray] = {
    otoroshiSettings.elasticConfig match {
      case Some(config) =>
        new ElasticReadsAnalytics(config, env)
          .query(Json.obj(
            "query" -> Json.obj(
              "bool" -> Json.obj(
                "filter" -> Json.arr(
                  Json.obj("terms" -> Json.obj(
                    "identity.identity" -> JsArray(
                      subscriptions.map(_.apiKey.clientId).map(JsString))
                  ))
                )
              )
            ),
            "aggs" -> Json.obj("lastUsages" -> Json.obj(
              "terms" -> Json.obj(
                "field" -> "identity.identity"
              ),
              "aggs" -> Json.obj(
                "latest" -> Json.obj(
                  "top_hits" -> Json.obj(
                    "size" -> 1,
                    "sort" -> Json.arr(Json.obj(
                      "@timestamp" -> Json.obj(
                        "order" -> "desc"
                      )
                    ))
                  )
                )
              )
            )),
            "size" -> 0
          ))
          .map(resp => {
            val buckets =
              (resp \ "aggregations" \ "lastUsages" \ "buckets").as[JsArray]
            JsArray(buckets.value.map(agg => {
              val key = (agg \ "key").as[String]
              val lastUsage =
                (agg \ "latest" \ "hits" \ "hits").as[JsArray].value.head
              val date = (lastUsage \ "_source" \ "@timestamp").as[JsValue]

              Json.obj(
                "clientName" -> key,
                "date" -> date,
                "subscription" -> subscriptions
                  .find(_.apiKey.clientId == key)
                  .map(_.id.asJson)
                  .getOrElse(JsNull)
                  .as[JsValue]
              )
            }))
          })
          .leftMap(e => {
            AppLogger.error(e.getErrorMessage())
            Json.arr()
          })
      case None =>
        for {
          elasticConfig <- EitherT.fromOptionF(getElasticConfig(), Json.arr())
          updatedSettings = otoroshiSettings.copy(
            elasticConfig = elasticConfig.some)
          updatedTenant = tenant.copy(
            otoroshiSettings = tenant.otoroshiSettings.filter(
              _.id != otoroshiSettings.id) + updatedSettings)
          _ <- EitherT.liftF(env.dataStore.tenantRepo.save(updatedTenant))
          r <- getSubscriptionLastUsage(subscriptions)(updatedSettings,
                                                       updatedTenant)
        } yield r
    }
  }

  private def getElasticConfig()(implicit otoroshiSettings: OtoroshiSettings)
    : Future[Option[ElasticAnalyticsConfig]] = {
    client(s"/api/globalconfig")
      .get()
      .map(resp => {
        if (resp.status == 200) {
          val config = resp.json.as[JsObject]
          val elasticReadConfig =
            (config \ "elasticReadsConfig").asOpt(ElasticAnalyticsConfig.format)
          elasticReadConfig
        } else {
          None
        }
      })
  }
}
