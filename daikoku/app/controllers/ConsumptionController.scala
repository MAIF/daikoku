package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import fr.maif.otoroshi.daikoku.actions.DaikokuAction
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async.{
  TeamAdminOnly,
  TeamApiKeyAction
}
import fr.maif.otoroshi.daikoku.domain.OtoroshiSettings
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.OtoroshiClient
import jobs.ApiKeyStatsJob
import org.joda.time.DateTime
import play.api.libs.json._
import play.api.mvc.{
  AbstractController,
  Action,
  AnyContent,
  ControllerComponents
}

import scala.concurrent.{ExecutionContext, Future}

class ConsumptionController(DaikokuAction: DaikokuAction,
                            env: Env,
                            cc: ControllerComponents,
                            otoroshiClient: OtoroshiClient,
                            apiKeyStatsJob: ApiKeyStatsJob)
    extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  def getSubscriptionConsumption(subscriptionId: String,
                                 teamId: String,
                                 from: Option[Long],
                                 to: Option[Long]): Action[AnyContent] =
    DaikokuAction.async { ctx =>
      TeamApiKeyAction(AuditTrailEvent(
        s"@{user.name} has accessed to apikey consumption for subscription @{subscriptionId}"))(
        teamId,
        ctx
      ) { team =>
        ctx.setCtxValue("subscriptionId", subscriptionId)

        val fromTimestamp = from.getOrElse(
          DateTime.now().withTimeAtStartOfDay().toDateTime.getMillis)
        val toTimestamp = to.getOrElse(DateTime.now().toDateTime.getMillis)
        env.dataStore.apiSubscriptionRepo
          .forTenant(ctx.tenant.id)
          .findById(subscriptionId)
          .flatMap {
            case None =>
              FastFuture.successful(NotFound(Json.obj(
                "error" -> "subscription not found for the given clientId")))
            case Some(subscription) if team.id != subscription.team =>
              FastFuture.successful(Unauthorized(Json.obj(
                "error" -> "You're not authorized on this subscription")))
            case Some(subscription) =>
              env.dataStore.apiRepo
                .forTenant(ctx.tenant.id)
                .findById(subscription.api)
                .flatMap {
                  case None =>
                    FastFuture.successful(NotFound(Json.obj(
                      "error" -> "Api not found for the given clientId")))
                  case Some(api) =>
                    env.dataStore.consumptionRepo
                      .forTenant(ctx.tenant.id)
                      .find(
                        Json.obj("clientId" -> subscription.apiKey.clientId,
                                 "from" -> Json.obj("$gte" -> fromTimestamp),
                                 "to" -> Json.obj("$lte" -> toTimestamp)),
                        Some(Json.obj("from" -> 1))
                      )
                      .map(
                        consumptions =>
                          Ok(
                            Json.obj(
                              "plan" -> api.possibleUsagePlans
                                .find(pp => pp.id == subscription.plan)
                                .map(_.asJson)
                                .get,
                              "consumptions" -> JsArray(
                                consumptions.map(_.asJson))
                            )
                        )
                      )
                }
          }
      }
    }

  def syncSubscriptionConsumption(subscriptionId: String, teamId: String) =
    DaikokuAction.async { ctx =>
      TeamAdminOnly(AuditTrailEvent(
        s"@{user.name} has sync apikey consumption for subscription @{subscriptionId}"))(
        teamId,
        ctx) { team =>
        ctx.setCtxValue("subscriptionId", subscriptionId);

        env.dataStore.apiSubscriptionRepo
          .forTenant(ctx.tenant.id)
          .findById(subscriptionId)
          .flatMap {
            case None =>
              FastFuture.successful(NotFound(Json.obj(
                "error" -> "subscription not found for the given clientId")))
            case Some(subscription) if team.id != subscription.team =>
              FastFuture.successful(Unauthorized(Json.obj(
                "error" -> "You're not authorized on this subscription")))
            case Some(subscription) =>
              apiKeyStatsJob
                .syncForSubscription(subscription, ctx.tenant)
                .map(seq => Ok(JsArray(seq.map(_.asJson))))
          }
      }
    }

  def syncApiConsumption(apiId: String, teamId: String) = DaikokuAction.async {
    ctx =>
      TeamAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has sync api consumption for api @{apiId}"))(teamId,
                                                                      ctx) {
        team =>
          ctx.setCtxValue("apiId", apiId);

          env.dataStore.apiRepo
            .forTenant(ctx.tenant.id)
            .findByIdOrHrId(apiId)
            .flatMap {
              case None =>
                FastFuture.successful(
                  NotFound(Json.obj("error" -> "Api not found")))
              case Some(api) if api.team != team.id =>
                FastFuture.successful(
                  Unauthorized(Json.obj("error" -> "unauthorized")))
              case Some(api) =>
                apiKeyStatsJob
                  .syncForApi(api, ctx.tenant)
                  .map(seq => Ok(JsArray(seq.map(_.asJson))))

            }
      }
  }

  def syncTeamBilling(teamId: String) = DaikokuAction.async { ctx =>
    TeamAdminOnly(
      AuditTrailEvent(
        s"@{user.name} has sync team billing for team @{team.name}"))(teamId,
                                                                      ctx) {
      team =>
        apiKeyStatsJob
          .syncForSubscriber(team, ctx.tenant)
          .map(seq => Ok(JsArray(seq.map(_.asJson))))
    }
  }

  def syncTeamIncome(teamId: String) = DaikokuAction.async { ctx =>
    TeamAdminOnly(
      AuditTrailEvent(
        s"@{user.name} has sync team income for team @{team.name}"))(teamId,
                                                                     ctx) {
      team =>
        apiKeyStatsJob
          .syncForOwner(team, ctx.tenant)
          .map(seq => Ok(JsArray(seq.map(_.asJson))))
    }
  }

  def getApiKeyQuotasWithSubscriptionId(
      teamId: String,
      subscriptionId: String): Action[AnyContent] =
    DaikokuAction.async { ctx =>
      TeamAdminOnly(AuditTrailEvent(
        s"@{user.name} has accessed to apikey quotas for clientId @{clientId}"))(
        teamId,
        ctx) { _ =>
        ctx.setCtxValue("subscriptionId", subscriptionId)
        env.dataStore.apiSubscriptionRepo
          .forTenant(ctx.tenant.id)
          .findByIdNotDeleted(subscriptionId)
          .flatMap {
            case None =>
              FastFuture.successful(NotFound(Json.obj(
                "error" -> "subscription not found for the given clientId")))
            case Some(subscription) =>
              env.dataStore.apiRepo
                .forTenant(ctx.tenant.id)
                .findById(subscription.api)
                .flatMap {
                  case None =>
                    FastFuture.successful(
                      NotFound(Json.obj("error" -> "Api not found")))
                  case Some(api) =>
                    api.possibleUsagePlans
                      .find(pp => pp.id == subscription.plan)
                      .map(
                        plan =>
                          plan.otoroshiTarget match {
                            case None =>
                              FastFuture.successful(NotFound(Json.obj(
                                "error" -> "Otoroshi target not found")))
                            case Some(target) =>
                              ctx.tenant.otoroshiSettings.find(
                                _.id == target.otoroshiSettings) match {
                                case None =>
                                  Future.successful(NotFound(Json.obj(
                                    "error" -> "Otoroshi settings not found")))
                                case Some(otoSettings) =>
                                  implicit val otoroshiSettings
                                    : OtoroshiSettings = otoSettings
                                  otoroshiClient
                                    .getApiKeyQuotas(
                                      subscription.apiKey.clientId)
                                    .map(result => Ok(result))

                              }
                        }
                      )
                      .get

                }
          }
      }
    }

  def getGroupConsumption(teamId: String,
                          apiId: String,
                          planId: String,
                          from: Option[Long],
                          to: Option[Long]): Action[AnyContent] =
    DaikokuAction.async { ctx =>
      TeamAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has accessed to plan consumption for api @{apiId} and plan @{planId}")
      )(teamId, ctx) { team =>
        ctx.setCtxValue("apiId", apiId)
        ctx.setCtxValue("planId", planId)

        val fromTimestamp = from.getOrElse(
          DateTime.now().withTimeAtStartOfDay().toDateTime.getMillis)
        val toTimestamp = to.getOrElse(DateTime.now().toDateTime.getMillis)

        env.dataStore.apiRepo
          .forTenant(ctx.tenant.id)
          .findOneNotDeleted(
            Json.obj("team" -> team.id.value,
                     "$or" -> Json.arr(Json.obj("_id" -> apiId),
                                       Json.obj("_humanReadableId" -> apiId)))
          )
          .flatMap {
            case None =>
              FastFuture.successful(
                NotFound(Json.obj("error" -> "Api not found (13)")))
            case Some(api) =>
              api.possibleUsagePlans.find(pp => pp.id.value == planId) match {
                case None =>
                  FastFuture.successful(
                    NotFound(Json.obj("error" -> "Api not found (14)")))
                case Some(_) =>
                  env.dataStore.consumptionRepo
                    .forTenant(ctx.tenant.id)
                    .find(
                      Json.obj("api" -> api.id.value,
                               "plan" -> planId,
                               "from" -> Json.obj("$gte" -> fromTimestamp),
                               "to" -> Json.obj("$lte" -> toTimestamp)),
                      Some(Json.obj("from" -> 1))
                    )
                    .map(consumptions =>
                      Ok(JsArray(consumptions.map(_.asJson))))
              }
          }
      }
    }

  def getApiConsumption(teamId: String,
                        apiId: String,
                        from: Option[Long],
                        to: Option[Long]): Action[AnyContent] =
    DaikokuAction.async { ctx =>
      TeamAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has accessed to api consumption for api @{apiId}"))(
        teamId,
        ctx) { team =>
        ctx.setCtxValue("apiId", apiId)

        val fromTimestamp = from.getOrElse(
          DateTime.now().withTimeAtStartOfDay().toDateTime.getMillis)
        val toTimestamp = to.getOrElse(DateTime.now().toDateTime.getMillis)

        env.dataStore.apiRepo
          .forTenant(ctx.tenant.id)
          .findOneNotDeleted(
            Json.obj("team" -> team.id.value,
                     "$or" -> Json.arr(Json.obj("_id" -> apiId),
                                       Json.obj("_humanReadableId" -> apiId)))
          )
          .flatMap {
            case None =>
              FastFuture.successful(
                NotFound(Json.obj("error" -> "Api not found (15)")))
            case Some(api) =>
              env.dataStore.consumptionRepo
                .forTenant(ctx.tenant.id)
                .find(
                  Json.obj("api" -> api.id.value,
                           "from" -> Json.obj("$gte" -> fromTimestamp),
                           "to" -> Json.obj("$lte" -> toTimestamp)),
                  Some(Json.obj("from" -> 1))
                )
                .map(consumptions => Ok(JsArray(consumptions.map(_.asJson))))

          }
      }
    }

  def consumptions(teamId: String,
                   from: Option[Long],
                   to: Option[Long]): Action[AnyContent] = DaikokuAction.async {
    ctx =>
      TeamAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has accessed to team consumption for @{team.name}"))(
        teamId,
        ctx) { team =>
        val fromTimestamp = from.getOrElse(
          DateTime.now().withTimeAtStartOfDay().toDateTime.getMillis)
        val toTimestamp = to.getOrElse(DateTime.now().toDateTime.getMillis)

        for {
          subscriptions <- env.dataStore.apiSubscriptionRepo
            .forTenant(ctx.tenant.id)
            .findNotDeleted(Json.obj("team" -> team.id.value))
          subscribedApis <- env.dataStore.apiRepo
            .forTenant(ctx.tenant.id)
            .findNotDeleted(
              Json.obj("_id" -> Json.obj("$in" -> JsArray(subscriptions.map(s =>
                s.api.asJson))))
            )
          consumptions <- env.dataStore.consumptionRepo
            .forTenant(ctx.tenant.id)
            .find(Json.obj("team" -> team.id.value,
                           "from" -> Json.obj("$gte" -> fromTimestamp),
                           "to" -> Json.obj("$lte" -> toTimestamp)),
                  Some(Json.obj("from" -> 1)))
        } yield {
          Ok(
            JsArray(
              consumptions
                .map(c => {
                  val apiName: String =
                    subscribedApis
                      .find(a => a.id == c.api)
                      .map(a => a.name)
                      .getOrElse(c.api.value)
                  val clientName: String = subscriptions
                    .find(s => s.apiKey.clientId == c.clientId)
                    .map(s => s.apiKey.clientName)
                    .getOrElse(c.clientId)
                  val plan: String = subscribedApis
                    .find(a => a.id == c.api)
                    .flatMap(a =>
                      a.possibleUsagePlans.find(pp => pp.id == c.plan))
                    .map(plan => plan.customName.getOrElse(plan.typeName))
                    .getOrElse(c.plan.value)

                  c.asJson.as[JsObject] ++ Json.obj("apiName" -> apiName,
                                                    "clientName" -> clientName,
                                                    "plan" -> plan)
                })
            )
          )
        }
      }
  }

  def billings(teamId: String,
               from: Option[Long],
               to: Option[Long]): Action[AnyContent] = DaikokuAction.async {
    ctx =>
      TeamAdminOnly(AuditTrailEvent(
        s"@{user.name} has accessed to team billing for @{team.name}"))(teamId,
                                                                        ctx) {
        team =>
          val fromTimestamp = from.getOrElse(
            DateTime.now().withTimeAtStartOfDay().toDateTime.getMillis)
          val toTimestamp = to.getOrElse(
            DateTime.now().withTimeAtStartOfDay().toDateTime.getMillis)

          env.dataStore.consumptionRepo
            .getLastConsumptionsForTenant(
              ctx.tenant.id,
              Json.obj("team" -> team.id.value,
                       "from" -> Json.obj("$gte" -> fromTimestamp,
                                          "$lte" -> toTimestamp),
                       "to" -> Json.obj("$gte" -> fromTimestamp,
                                        "$lte" -> toTimestamp))
            )
            .map(consumptions => Ok(JsArray(consumptions.map(_.asJson))))
      }
  }

  def income(teamId: String,
             from: Option[Long],
             to: Option[Long]): Action[AnyContent] = DaikokuAction.async {
    ctx =>
      TeamAdminOnly(AuditTrailEvent(
        s"@{user.name} has accessed to team billing for @{team.name}"))(teamId,
                                                                        ctx) {
        team =>
          val fromTimestamp = from.getOrElse(
            DateTime.now().withTimeAtStartOfDay().toDateTime.getMillis)
          val toTimestamp = to.getOrElse(
            DateTime.now().withTimeAtStartOfDay().toDateTime.getMillis)

          for {
            ownApis <- env.dataStore.apiRepo
              .forTenant(ctx.tenant.id)
              .findNotDeleted(Json.obj("team" -> team.id.value))
            revenue <- env.dataStore.consumptionRepo
              .getLastConsumptionsForTenant(
                ctx.tenant.id,
                Json.obj(
                  "api" -> Json.obj("$in" -> JsArray(ownApis.map(_.id.asJson))),
                  "from" -> Json.obj("$gte" -> fromTimestamp,
                                     "$lte" -> toTimestamp),
                  "to" -> Json.obj("$gte" -> fromTimestamp,
                                   "$lte" -> toTimestamp)
                )
              )
          } yield {
            Ok(JsArray(revenue.map(_.asJson)))
          }
      }
  }
}
