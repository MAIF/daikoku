package fr.maif.controllers

import cats.data.EitherT
import fr.maif.controllers.AppError
import fr.maif.domain._
import fr.maif.env.Env
import fr.maif.utils.future.EnhancedObject
import org.apache.pekko.Done
import org.apache.pekko.http.scaladsl.util.FastFuture
import play.api.libs.json._
import play.api.mvc._

import scala.concurrent.{ExecutionContext, Future}

class MockController(
    env: Env,
    cc: ControllerComponents
) extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext

  def reset() =
    Action.async { _ =>
      (for {
        _ <- EitherT.cond[Future][AppError, Unit](
          env.config.isDev,
          (),
          AppError.SecurityError("Action not avalaible")
        )
        _ <- EitherT.liftF[Future, AppError, Unit](env.dataStore.clear())
        _ <- EitherT.liftF[Future, AppError, Done](env.initDatastore())
      } yield Redirect("/?message=password.reset.successfull"))
        .leftMap(_.render())
        .merge
    }

  val groups: Seq[JsObject] = Seq(
    Json.obj(
      "id" -> "12345",
      "name" -> "nice-group",
      "description" -> "A nice group"
    ),
    Json.obj(
      "id" -> "12346",
      "name" -> "daikoku_nice-group",
      "description" -> "A nice group (with prefix)"
    )
  )
  val services: Seq[JsObject] = Seq(
    Json.obj(
      "id" -> "s_12345",
      "name" -> "nice-service",
      "description" -> "A nice servcie"
    ),
    Json.obj(
      "id" -> "s_12346",
      "name" -> "daikoku_nice-service",
      "description" -> "A nice service (with prefix)"
    )
  )
  val routes: Seq[JsObject] = Seq(
    Json.obj(
      "id" -> "r_12345",
      "name" -> "nice-route",
      "description" -> "A nice route"
    ),
    Json.obj(
      "id" -> "r_12346",
      "name" -> "daikoku_nice-route",
      "description" -> "A nice route (with prefix)"
    )
  )
  var apikeys: Seq[JsObject] = Seq()

  def fakeOtoroshiGroups() =
    Action {
      Ok(JsArray(groups))
    }
  def fakeOtoroshiServices() =
    Action {
      Ok(JsArray(services))
    }
  def fakeOtoroshiRoutes() =
    Action {
      Ok(JsArray(routes))
    }

  def fakeOtoroshiGroup(groupId: String) =
    Action {
      val found = groups.find { obj =>
        (obj \ "id").as[String] == groupId
      }
      found match {
        case Some(group) => Ok(group)
        case None        => NotFound(Json.obj("error" -> "not found"))
      }
    }

  def fakeOtoroshiApiKeys() =
    Action {
      Ok(JsArray(apikeys))
    }

  def fakeOtoroshiApiKey(clientId: String) =
    Action.async {
      env.dataStore.apiSubscriptionRepo
        .forAllTenant()
        .findOne(Json.obj("apiKey.clientId" -> clientId))
        .map {
          case Some(subscription) =>
            Ok(
              ActualOtoroshiApiKey(
                clientId = clientId,
                clientSecret = subscription.apiKey.clientSecret,
                clientName = subscription.apiKey.clientName,
                authorizedEntities = AuthorizedEntities(),
                throttlingQuota = 10,
                dailyQuota = 10000,
                monthlyQuota = 300000,
                constrainedServicesOnly = true,
                restrictions = ApiKeyRestrictions(),
                metadata = Map(),
                rotation = None
              ).asJson
            )
          case _ => BadRequest(Json.obj("error" -> "Subscription not found"))
        }
    }

  def createFakeOtoroshiApiKey() =
    Action.async(parse.json) { req =>
      apikeys = apikeys :+ req.body.as[JsObject]
      Ok(req.body.as[JsObject]).future
    }

  def updateFakeOtoroshiApiKey(clientId: String) =
    Action.async(parse.json) { req =>
      json.ActualOtoroshiApiKeyFormat.reads(req.body).asOpt match {
        case Some(apiKey) => Ok(apiKey.asJson).future
        case None => BadRequest(Json.obj("error" -> "wrong apikey format")).future
      }
    }

  def deleteFakeOtoroshiApiKey(clientId: String) =
    Action.async(parse.json) { _ =>
      Ok(Json.obj("deleted" -> true)).future
    }

  def fakeOtoroshiStats(from: String, to: String, apikey: String) =
    Action.async {
      val r = scala.util.Random

      env.dataStore.apiSubscriptionRepo
        .forAllTenant()
        .findOneNotDeleted(Json.obj("apiKey.clientId" -> apikey))
        .flatMap {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "subscription not found"))
            )
          case Some(sub) =>
            env.dataStore.apiRepo
              .forAllTenant()
              .findByIdNotDeleted(sub.api)
              .map {
                case None => NotFound(Json.obj("error" -> "api not found"))
                case Some(api) =>
                  Ok(Json.obj("hits" -> Json.obj("count" -> r.nextInt(100))))
              }
        }
    }

  def fakeOtoroshiQuotas(clientId: String) =
    Action.async {
      val r = scala.util.Random

      env.dataStore.apiSubscriptionRepo
        .forAllTenant()
        .findOneNotDeleted(Json.obj("apiKey.clientId" -> clientId))
        .flatMap {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "subscription not found"))
            )
          case Some(sub) =>
            env.dataStore.usagePlanRepo
              .forAllTenant()
              .findOneNotDeleted(Json.obj("_id" -> sub.plan.asJson))
              .map {
                case None => NotFound(Json.obj("error" -> "plan not found"))
                case Some(pp) =>
                  val callPerSec =
                    r.nextLong(pp.maxPerSecond.getOrElse(Long.MaxValue))
                  val callPerDay =
                    r.nextLong(pp.maxPerDay.getOrElse(Long.MaxValue))
                  val callPerMonth =
                    r.nextLong(pp.maxPerMonth.getOrElse(Long.MaxValue))

                  Ok(
                    ApiKeyQuotas(
                      authorizedCallsPerSec =
                        pp.maxPerSecond.getOrElse(Long.MaxValue),
                      currentCallsPerSec = callPerSec,
                      remainingCallsPerSec =
                        pp.maxPerSecond.getOrElse(Long.MaxValue) - callPerSec,
                      authorizedCallsPerDay =
                        pp.maxPerDay.getOrElse(Long.MaxValue),
                      currentCallsPerDay = callPerDay,
                      remainingCallsPerDay =
                        pp.maxPerDay.getOrElse(Long.MaxValue) - callPerDay,
                      authorizedCallsPerMonth =
                        pp.maxPerMonth.getOrElse(Long.MaxValue),
                      currentCallsPerMonth = callPerMonth,
                      remainingCallsPerMonth =
                        pp.maxPerMonth.getOrElse(Long.MaxValue) - callPerMonth
                    ).asJson
                  )
              }
        }
    }
}
