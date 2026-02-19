package fr.maif.daikoku.utils

import cats.data.EitherT
import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.controllers.AppError.OtoroshiError
import fr.maif.daikoku.audit.ElasticReadsAnalytics
import fr.maif.daikoku.audit.ElasticAnalyticsConfig
import fr.maif.daikoku.domain.json.ActualOtoroshiApiKeyFormat
import fr.maif.daikoku.domain._
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.logger.AppLogger
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.Materializer
import play.api.libs.json._
import play.api.libs.ws.{WSAuthScheme, WSRequest}
import play.api.libs.ws.JsonBodyWritables.writeableOf_JsValue
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success}

class OtoroshiExpositionFilter(
    stateHeaderName: String,
    stateRespHeaderName: String,
    env: Env
)(implicit
    val mat: Materializer,
    ec: ExecutionContext
) extends Filter {

  def apply(
      nextFilter: RequestHeader => Future[Result]
  )(request: RequestHeader): Future[Result] = {
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
  val ws                            = env.wsClient

  def client(
      path: String
  )(implicit otoroshiSettings: OtoroshiSettings): WSRequest = {
    ws.url(s"${otoroshiSettings.url}$path")
      .addHttpHeaders(
        "Host" -> otoroshiSettings.host
      )
      .withAuth(
        otoroshiSettings.clientId,
        otoroshiSettings.clientSecret,
        WSAuthScheme.BASIC
      )
  }

  def getServiceGroups()(implicit
      otoroshiSettings: OtoroshiSettings
  ): Future[JsArray] = {
    client(s"/api/groups").get().flatMap { resp =>
      if (resp.status == 200) {
        val res = resp.json.as[JsArray]
        FastFuture.successful(JsArray(res.value.filter { item =>
          val id   = (item \ "id").as[String]
          val name = (item \ "name").as[String]
          (
            env.config.otoroshiGroupIdPrefix,
            env.config.otoroshiGroupNamePrefix
          ) match {
            case (None, None)         => true
            case (Some(prefix), None) => id.startsWith(prefix)
            case (None, Some(prefix)) => name.startsWith(prefix)
            case (Some(p1), Some(p2)) =>
              id.startsWith(p1) && name.startsWith(p2)
          }
        }))
      } else {
        Future
          .failed(
            new RuntimeException(
              s"Error while fetching otoroshi service groups: ${resp.status} - ${resp.body}"
            )
          )
      }
    }
  }

  def getService(
      serviceId: String
  )(implicit otoroshiSettings: OtoroshiSettings): Future[JsObject] = {
    client(s"/api/services/$serviceId").get().flatMap { resp =>
      if (resp.status == 200) {
        val res = resp.json.as[JsObject]
        FastFuture.successful(res)
      } else {
        Future
          .failed(
            new RuntimeException(
              s"Error while fetching otoroshi service: ${resp.status} - ${resp.body}"
            )
          )
      }
    }
  }

  def getServices()(implicit
      otoroshiSettings: OtoroshiSettings
  ): Future[JsArray] = {
    client(s"/api/services").get().flatMap { resp =>
      if (resp.status == 200) {
        val res = resp.json.as[JsArray]
        FastFuture.successful(JsArray(res.value))
      } else {
        Future
          .failed(
            new RuntimeException(
              s"Error while fetching otoroshi service groups: ${resp.status} - ${resp.body}"
            )
          )
      }
    }
  }

  def getRoutes()(implicit
      otoroshiSettings: OtoroshiSettings
  ): Future[JsArray] = {
    client(s"/api/routes").get().flatMap { resp =>
      if (resp.status == 200) {
        val res = resp.json.as[JsArray]
        FastFuture.successful(JsArray(res.value))
      } else {
        Future
          .failed(
            new RuntimeException(
              s"Error while fetching otoroshi service routes: ${resp.status} - ${resp.body}"
            )
          )
      }
    }
  }

  def getApiKeys()(implicit
      otoroshiSettings: OtoroshiSettings
  ): Future[JsArray] = {
    client(s"/apis/apim.otoroshi.io/v1/apikeys").get().flatMap { resp =>
      if (resp.status == 200) {
        val res = resp.json.as[JsArray]
        FastFuture.successful(JsArray(res.value))
      } else {
        Future
          .failed(
            new RuntimeException(
              s"Error while fetching otoroshi service groups: ${resp.status} - ${resp.body}"
            )
          )
      }
    }
  }

  def getServiceGroup(
      groupId: String
  )(implicit otoroshiSettings: OtoroshiSettings): Future[JsObject] = {
    client(s"/api/groups/$groupId").get().flatMap { resp =>
      if (resp.status == 200) {
        val res    = resp.json.as[JsObject]
        val id     = (res \ "id").as[String]
        val name   = (res \ "name").as[String]
        val passes = (
          env.config.otoroshiGroupIdPrefix,
          env.config.otoroshiGroupNamePrefix
        ) match {
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
          .failed(
            new RuntimeException(
              s"Error while fetching otoroshi service group: ${resp.status} - ${resp.body}"
            )
          )
      }
    }
  }

  def validateGroupNameFromId[A](
      groupId: String
  )(f: => Future[A])(implicit otoroshiSettings: OtoroshiSettings): Future[A] = {
    if (
      env.config.otoroshiGroupIdPrefix.isDefined && !groupId.startsWith(
        env.config.otoroshiGroupIdPrefix.get
      )
    ) {
      Future.failed(new RuntimeException(s"Bad group id"))
    } else {
      getServiceGroup(groupId)(otoroshiSettings).flatMap(g => f).recoverWith { case e =>
        Future.failed(e)
      }
    }
  }

  def getApikey(clientId: String)(implicit
      otoroshiSettings: OtoroshiSettings
  ): Future[Either[AppError, ActualOtoroshiApiKey]] = {
    client(s"/apis/apim.otoroshi.io/v1/apikeys/$clientId").get().map { resp =>
      if (resp.status == 200) {
        resp.json.validate(ActualOtoroshiApiKeyFormat) match {
          case JsSuccess(k, _) => Right(k)
          case e: JsError      => Left(OtoroshiError(JsError.toJson(e)))
        }
      } else {
        Left(
          OtoroshiError(
            Json.obj(
              "error" -> s"Error while fetching otoroshi apikey: ${resp.status} - ${resp.body}"
            )
          )
        )
      }
    }
  }

  def createApiKey(key: ActualOtoroshiApiKey)(implicit
      otoroshiSettings: OtoroshiSettings
  ): Future[Either[AppError, ActualOtoroshiApiKey]] = {
    client(s"/apis/apim.otoroshi.io/v1/apikeys").post(key.asJson).map { resp =>
      if (resp.status == 201 || resp.status == 200) {
        resp.json.validate(ActualOtoroshiApiKeyFormat) match {
          case JsSuccess(k, _) => Right(k)
          case e: JsError      => Left(OtoroshiError(JsError.toJson(e)))
        }
      } else {
        Left(
          OtoroshiError(
            Json.obj(
              "error" -> s"Error while creating otoroshi apikey: ${resp.status} - ${resp.body}"
            )
          )
        )
      }
    }
  }

  def updateApiKey(key: ActualOtoroshiApiKey)(implicit
      otoroshiSettings: OtoroshiSettings
  ): Future[Either[AppError, ActualOtoroshiApiKey]] = {
    client(s"/apis/apim.otoroshi.io/v1/apikeys/${key.clientId}")
      .put(key.asJson)
      .map { resp =>
        if (resp.status == 200) {
          resp.json.validate(ActualOtoroshiApiKeyFormat) match {
            case JsSuccess(k, _) => Right(k)
            case JsError(e)      =>
              Left(
                OtoroshiError(
                  Json.obj("error" -> s"Error while reading otoroshi apikey $e")
                )
              )
          }
        } else
          Left(
            OtoroshiError(
              Json.obj(
                "error" -> s"Error while updating otoroshi apikey: ${resp.status} - ${resp.body}"
              )
            )
          )
      }
  }

  def patchApiKey(clientId: String, patch: JsValue)(implicit
      otoroshiSettings: OtoroshiSettings
  ): Future[Either[AppError, ActualOtoroshiApiKey]] = {
    client(s"/apis/apim.otoroshi.io/v1/apikeys/$clientId")
      .patch(patch)
      .map { resp =>
        if (resp.status == 200) {
          resp.json.validate(ActualOtoroshiApiKeyFormat) match {
            case JsSuccess(k, _) => Right(k)
            case JsError(e)      =>
              Left(
                OtoroshiError(
                  Json.obj("error" -> s"Error while reading otoroshi apikey $e")
                )
              )
          }
        } else
          Left(
            OtoroshiError(
              Json.obj(
                "error" -> s"Error while updating otoroshi apikey: ${resp.status} - ${resp.body}"
              )
            )
          )
      }
  }

  //FIXME: update Unit to ActualOtoroshiApikey
  def patchApiKeyBulk(clientIds: Seq[String], patch: JsValue)(implicit
                                                              otoroshiSettings: OtoroshiSettings,
                                                              mat: Materializer
  ): Future[Either[AppError, Unit]] = {

    val otoroshiApiKeys = clientIds
      .map(id => Json.obj(
        "id" -> id,
        "patch" -> patch
      ))
      .map(Json.stringify)  // Convertir chaque objet JSON en String
      .mkString("\n")

    val clientInstance = client(s"/apis/apim.otoroshi.io/v1/apikeys/_bulk")
      .withHttpHeaders(
        "Content-Type" -> "application/x-ndjson"
      )

    Source.single(otoroshiApiKeys)  // Source.single car otoroshiApiKeys est déjà une String complète
      .map(bulk => ByteString(bulk))
      .mapAsync(1) { bulk =>  // 1 seule requête bulk
        val req = bulk.utf8String
        val post = clientInstance.post(req)

        post.onComplete {
          case Success(resp) =>
            if (resp.status >= 400) {
              AppLogger.error(
                s"Error patching otoroshi apikeys: ${resp.status}, ${resp.body} --- apikeys: $otoroshiApiKeys"
              )
            }
          case Failure(e) =>
            AppLogger.error(s"Error patching otoroshi apikeys", e)
        }
        post
      }
      .runWith(Sink.head)  // Récupérer le résultat
      .map(_ => Right(()))  // Retourner Either[AppError, Unit]
      .recover {
        case e: Exception =>
          Left(AppError.OtoroshiError(Json.obj("message" -> s"Error patching apikeys: ${e.getMessage}")))
      }
  }


  def deleteApiKey(
      clientId: String
  )(implicit
      otoroshiSettings: OtoroshiSettings
  ): EitherT[Future, AppError, Unit] = {
    for {
      resp <- EitherT.liftF(
                client(s"/apis/apim.otoroshi.io/v1/apikeys/$clientId").delete()
              )
      _    <- EitherT.cond[Future][AppError, Unit](
                resp.status == 200,
                (),
                AppError.OtoroshiError(
                  Json.obj(
                    "error" -> s"Error while deleting otoroshi apikey: ${resp.status} - ${resp.body}"
                  )
                )
              )
    } yield ()
  }

  def getServiceConsumption(service: String, from: String, to: String)(implicit
      otoroshiSettings: OtoroshiSettings
  ): Future[JsObject] = {
    client(s"/api/stats?service=$service&from=$from&to=$to").get().flatMap { resp =>
      if (resp.status == 200) {
        Future.successful(resp.json.as[JsObject])
      } else {
        Future.failed(
          new RuntimeException(
            s"Error while getting otoroshi apikey stats: ${resp.status} - ${resp.body}"
          )
        )
      }
    }
  }

  def getApiKeyConsumption(
      clientId: String,
      from: String,
      to: String,
      failOnError: Boolean = false
  )(implicit
      otoroshiSettings: OtoroshiSettings
  ): Future[JsObject] = {
    client(s"/api/stats?apikey=$clientId&from=$from&to=$to").get().map { resp =>
      if (resp.status == 200) {
        resp.json.as[JsObject]
      } else if (failOnError) {
        throw new RuntimeException(
          s"Error while getting otoroshi apikey stats: ${resp.status} - ${resp.body}"
        )
      } else {
        AppLogger.error(
          s"[Get consumptions] :: Error while getting otoroshi apikey stats: ${resp.status} - ${resp.body}"
        )
        Json.obj(
          "hits"        -> Json.obj("count" -> 0),
          "dataIn"      -> Json.obj(
            "data" -> Json.obj(
              "dataIn" -> 0
            )
          ),
          "dataOut"     -> Json.obj(
            "data" -> Json.obj(
              "dataOut" -> 0
            )
          ),
          "avgDuration" -> Json.obj("duration" -> 0),
          "avgOverhead" -> Json.obj("overhead" -> 0)
        )
      }
    }
  }

  def getApiKeyQuotas(
      clientId: String
  )(implicit otoroshiSettings: OtoroshiSettings): Future[JsObject] = {
    client(s"/api/apikeys/$clientId/quotas").get().map { resp =>
      if (resp.status == 200) {
        resp.json.as[JsObject]
      } else {
        AppLogger.error(
          s"[get Quotas] :: Error while getting otoroshi apikey stats: ${resp.status} - ${resp.body}"
        )
        ApiKeyQuotas(
          authorizedCallsPerSec = 0,
          currentCallsPerSec = 0,
          remainingCallsPerSec = 0,
          authorizedCallsPerDay = 0,
          currentCallsPerDay = 0,
          remainingCallsPerDay = 0,
          authorizedCallsPerMonth = 0,
          currentCallsPerMonth = 0,
          remainingCallsPerMonth = 0
        ).asJson.as[JsObject]
      }
    }
  }

  def getGroupConsumption(groupId: String, from: String, to: String)(implicit
      otoroshiSettings: OtoroshiSettings
  ): Future[JsObject] = {
    validateGroupNameFromId(groupId) {
      client(s"/api/stats?group=$groupId&from=$from&to=$to").get().flatMap { resp =>
        if (resp.status == 200) {
          Future.successful(resp.json.as[JsObject])
        } else {
          Future.failed(
            new RuntimeException(
              s"Error while getting otoroshi apikey stats: ${resp.status} - ${resp.body}"
            )
          )
        }
      }
    }
  }

  def getSubscriptionLastUsage(subscriptions: Seq[ApiSubscription])(implicit
      otoroshiSettings: OtoroshiSettings,
      tenant: Tenant
  ): EitherT[Future, JsArray, JsArray] = {
    otoroshiSettings.elasticConfig match {
      case Some(config) =>
        new ElasticReadsAnalytics(config, env)
          .query(
            Json.obj(
              "query" -> Json.obj(
                "bool" -> Json.obj(
                  "filter" -> Json.arr(
                    Json.obj(
                      "terms" -> Json.obj(
                        "identity.identity.keyword" -> JsArray(
                          subscriptions.map(_.apiKey.clientId).map(JsString.apply)
                        )
                      )
                    )
                  )
                )
              ),
              "aggs"  -> Json.obj(
                "lastUsages" -> Json.obj(
                  "terms" -> Json.obj(
                    "field" -> "identity.identity.keyword"
                  ),
                  "aggs"  -> Json.obj(
                    "latest" -> Json.obj(
                      "top_hits" -> Json.obj(
                        "size" -> 1,
                        "sort" -> Json.arr(
                          Json.obj(
                            "@timestamp" -> Json.obj(
                              "order" -> "desc"
                            )
                          )
                        )
                      )
                    )
                  )
                )
              ),
              "size"  -> 0
            )
          )
          .map(resp => {
            AppLogger.warn(Json.stringify(resp))
            val buckets =
              (resp \ "aggregations" \ "lastUsages" \ "buckets")
                .asOpt[JsArray]
                .getOrElse(Json.arr())
            JsArray(buckets.value.map(agg => {
              val key       = (agg \ "key").as[String]
              val lastUsage =
                (agg \ "latest" \ "hits" \ "hits").as[JsArray].value.head
              val date      = (lastUsage \ "_source" \ "@timestamp").as[JsValue]

              Json.obj(
                "clientName"   -> key,
                "date"         -> date,
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
      case None         =>
        for {
          elasticConfig  <- EitherT.fromOptionF(getElasticConfig(), Json.arr())
          updatedSettings =
            otoroshiSettings.copy(elasticConfig = elasticConfig.some)
          updatedTenant   = tenant.copy(
                              otoroshiSettings = tenant.otoroshiSettings
                                .filter(_.id != otoroshiSettings.id) + updatedSettings
                            )
          _              <- EitherT.liftF(env.dataStore.tenantRepo.save(updatedTenant))
          r              <- getSubscriptionLastUsage(subscriptions)(
                              updatedSettings,
                              updatedTenant
                            )
        } yield r
    }
  }

  private def getElasticConfig()(implicit
      otoroshiSettings: OtoroshiSettings
  ): Future[Option[ElasticAnalyticsConfig]] = {
    client(s"/api/globalconfig")
      .get()
      .map(resp => {
        if (resp.status == 200) {
          val config            = resp.json.as[JsObject]
          val elasticReadConfig =
            (config \ "elasticReadsConfig").asOpt(ElasticAnalyticsConfig.format)
          elasticReadConfig
        } else {
          None
        }
      })
  }
}
