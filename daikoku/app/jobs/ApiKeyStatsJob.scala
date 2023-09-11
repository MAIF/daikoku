package jobs

import java.util.concurrent.atomic.AtomicReference
import akka.actor.Cancellable
import akka.http.scaladsl.util.FastFuture
import akka.stream.Materializer
import akka.stream.scaladsl.{Flow, Sink, Source}
import akka.{Done, NotUsed}
import cats.data.OptionT
import cats.implicits.catsSyntaxOptionId
import fr.maif.otoroshi.daikoku.domain.BillingTimeUnit.{Day, Hour, Month, Year}
import fr.maif.otoroshi.daikoku.domain.UsagePlan._
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json.{ApiKeyQuotasFormat, DateTimeFormat}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.utils.{IdGenerator, OtoroshiClient}
import org.joda.time.format.DateTimeFormatter
import org.joda.time.{DateTime, Days}
import play.api.Logger
import play.api.libs.json._
import reactivemongo.bson.BSONObjectID

import scala.concurrent.duration._
import scala.concurrent.{ExecutionContext, Future}

class ApiKeyStatsJob(otoroshiClient: OtoroshiClient, env: Env) {

  private val logger = Logger("ApiKeyStatsJob")

  private val ref = new AtomicReference[Cancellable]()
  private val maxCallPerJob = 50

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env
  implicit val mat: Materializer = env.defaultMaterializer

  def start(): Unit = {
    logger.info("Scrapping apikey stats from otoroshi")
    if (ref.get() == null) {
      ref.set(
        env.defaultActorSystem.scheduler
          .scheduleAtFixedRate(1.seconds, env.config.apikeysStatsSyncInterval) {
            () =>
              syncAll()
          })
    }
  }

  def getStats: Future[Done] = {
    AppLogger.info("Scrapping apikey stats from otoroshi")
    syncAll()
  }

  def stop(): Unit = {
    Option(ref.get()).foreach(_.cancel())
  }

  //job de synchro des donnée de la  veille
  def doJob(): Future[Done] = {
    syncAll()
  }

  def syncConsumptionAsFlow(
      api: Api,
      tenant: Tenant,
      lastConsumptions: Seq[ApiKeyConsumption]
  ): Flow[ApiSubscription, Seq[ApiKeyConsumption], NotUsed] =
    Flow[ApiSubscription]
      .mapAsync(2) { subscription =>
        syncConsumptionStatsForSubscription(
          subscription,
          tenant,
          Some(api),
          lastConsumptions.find(c =>
            c.clientId == subscription.apiKey.clientId))
      }

  def syncConsumptionAsFlow(
      apis: Seq[Api],
      tenant: Tenant,
      lastConsumptions: Seq[ApiKeyConsumption]
  ): Flow[ApiSubscription, Seq[ApiKeyConsumption], NotUsed] =
    Flow[ApiSubscription]
      .mapAsync(2) { subscription =>
        syncConsumptionStatsForSubscription(
          subscription,
          tenant,
          apis.find(api => api.id == subscription.api),
          lastConsumptions.find(c =>
            c.clientId == subscription.apiKey.clientId))
      }

  def syncForSubscription(
      subscription: ApiSubscription,
      tenant: Tenant,
      completed: Boolean = false): Future[Seq[ApiKeyConsumption]] = {
    (for {
      lastConsumption <- env.dataStore.consumptionRepo
        .getLastConsumption(
          tenant,
          Json.obj("clientId" -> subscription.apiKey.clientId))
      api <- env.dataStore.apiRepo
        .forTenant(tenant.id)
        .findById(subscription.api)
    } yield {
      api match {
        case Some(api) =>
          syncConsumptionStatsForSubscription(subscription,
                                              tenant,
                                              Some(api),
                                              lastConsumption,
                                              completed = completed)
        case None => FastFuture.successful(Seq.empty[ApiKeyConsumption])
      }
    }).flatten
  }

  def syncForApi(api: Api, tenant: Tenant): Future[Seq[ApiKeyConsumption]] = {
    (for {
      lastConsumptions <- env.dataStore.consumptionRepo
        .getLastConsumptionsForTenant(tenant.id,
                                      Json.obj("api" -> api.id.asJson))
      subscriptions <- env.dataStore.apiSubscriptionRepo
        .forTenant(tenant)
        .findNotDeleted(Json.obj("api" -> api.id.asJson))
    } yield {
      Source(subscriptions.toList)
        .via(syncConsumptionAsFlow(api, tenant, lastConsumptions))
        .flatMapConcat(s => Source.apply(s.toList))
        .runWith(Sink.seq[ApiKeyConsumption])
    }).flatten
  }

  def syncForSubscriber(team: Team,
                        tenant: Tenant): Future[Seq[ApiKeyConsumption]] = {
    (for {
      lastConsumptions <- env.dataStore.consumptionRepo
        .getLastConsumptionsForTenant(tenant.id,
                                      Json.obj("team" -> team.id.asJson))
      subscriptions <- env.dataStore.apiSubscriptionRepo
        .forTenant(tenant)
        .findNotDeleted(Json.obj("team" -> team.id.asJson))
      apis <- env.dataStore.apiRepo
        .forTenant(tenant)
        .findNotDeleted(Json.obj(
          "_id" -> Json.obj("$in" -> JsArray(subscriptions.map(_.api.asJson)))))
    } yield {
      Source(subscriptions.toList)
        .via(syncConsumptionAsFlow(apis, tenant, lastConsumptions))
        .flatMapConcat(s => Source.apply(s.toList))
        .runWith(Sink.seq[ApiKeyConsumption])
    }).flatten
  }

  def syncAll(): Future[Done] = {
    (for {
      tenants <- env.dataStore.tenantRepo.findAllNotDeleted()
      apis <- env.dataStore.apiRepo.forAllTenant().findAllNotDeleted()
      subscriptions <- env.dataStore.apiSubscriptionRepo
        .forAllTenant()
        .findAllNotDeleted()
      lastConsumptions <- env.dataStore.consumptionRepo
        .getLastConsumptionsforAllTenant(Json.obj())
    } yield {
      val nbInterval = Math.ceil(
        env.config.apikeysStatsSyncInterval / env.config.apikeysStatsCallInterval)
      val nbCall = Math
        .ceil(Math.max(subscriptions.length / nbInterval, maxCallPerJob))
        .toInt

      Source(tenants.toList)
        .flatMapConcat(
          tenant =>
            Source(subscriptions.filter(_.tenant == tenant.id).toList)
              .filterNot(
                sub =>
                  lastConsumptions.exists(
                    cons =>
                      cons.clientId == sub.apiKey.clientId && cons.from.isEqual(
                        DateTime.now().withTimeAtStartOfDay())
                )
              )
              .via(syncConsumptionAsFlow(apis, tenant, lastConsumptions))
        )
        .grouped(nbCall)
        .throttle(1, env.config.apikeysStatsCallInterval)
        .runWith(Sink.ignore)
    }).flatten
  }

  def syncForOwner(team: Team,
                   tenant: Tenant): Future[Seq[ApiKeyConsumption]] = {
    (for {
      apis <- env.dataStore.apiRepo
        .forTenant(tenant)
        .findNotDeleted(Json.obj("team" -> team.id.asJson))
      lastConsumptions <- env.dataStore.consumptionRepo
        .getLastConsumptionsForTenant(
          tenant.id,
          Json.obj("api" -> Json.obj("$in" -> JsArray(apis.map(_.id.asJson))))
        )
      subscriptions <- env.dataStore.apiSubscriptionRepo
        .forTenant(tenant)
        .findNotDeleted(
          Json.obj("api" -> Json.obj("$in" -> JsArray(apis.map(_.id.asJson)))))
    } yield {
      Source(subscriptions.toList)
        .via(syncConsumptionAsFlow(apis, tenant, lastConsumptions))
        .flatMapConcat(s => Source.apply(s.toList))
        .runWith(Sink.seq[ApiKeyConsumption])
    }).flatten
  }

  /**
    * with an optional given consumption, which is la last consumption found in database
    * the consumption is calculated for every days between last consumption and now
    * if the last consumption is not completed, the new consumption overwrite it
    * An operation to sync consumption between daikoku and a possible third payment module is save if consumption is completed
    *
    */
  private def syncConsumptionStatsForSubscription(
      subscription: ApiSubscription,
      tenant: Tenant,
      maybeApi: Option[Api],
      maybeLastConsumption: Option[ApiKeyConsumption],
      completed: Boolean = false): Future[Seq[ApiKeyConsumption]] = {
    (for {
      api <- OptionT.fromOption[Future](maybeApi)
      plan <- OptionT(
        env.dataStore.usagePlanRepo
          .forTenant(tenant)
          .findById(subscription.plan))
      otoroshiTarget <- OptionT.fromOption[Future](plan.otoroshiTarget)
      otoSettings <- OptionT.fromOption[Future](
        tenant.otoroshiSettings.find(_.id == otoroshiTarget.otoroshiSettings))
    } yield {
      implicit val otoroshiSettings: OtoroshiSettings = otoSettings

      val from = maybeLastConsumption
        .map(consumption =>
          consumption.state match {
            case ApiKeyConsumptionState.Completed  => consumption.to
            case ApiKeyConsumptionState.InProgress => consumption.from
        })
        .getOrElse(subscription.createdAt.withTimeAtStartOfDay())

      Source(
        Days
          .daysBetween(from.withTimeAtStartOfDay(), DateTime.now())
          .getDays - 1 to -1 by -1
      ).map(nbDay => {
          val from = DateTime.now().minusDays(nbDay + 1).withTimeAtStartOfDay()
          val to =
            if (nbDay == -1)
              DateTime.now()
            else
              DateTime.now().minusDays(nbDay).withTimeAtStartOfDay()

          (from, to)
        })
        .mapAsync(1) {
          case (from, to) =>
            val isCompleteConsumption = completed || Days
              .daysBetween(from.withTimeAtStartOfDay(), to)
              .getDays == 1

            val id = maybeLastConsumption
              .map {
                case c
                    if !c.isComplete && c.from.withTimeAtStartOfDay() == from =>
                  c.id
                case _ => DatastoreId(IdGenerator.token(24))
              }
              .getOrElse(DatastoreId(IdGenerator.token(24)))

            for {
              consumption <- otoroshiClient.getApiKeyConsumption(
                subscription.apiKey.clientId,
                from.getMillis.toString,
                to.toDateTime.getMillis.toString)
              quotas <- otoroshiClient.getApiKeyQuotas(
                subscription.apiKey.clientId)
              billing <- computeBilling(
                tenant.id,
                subscription.apiKey.clientId,
                plan,
                (consumption \ "hits" \ "count").as[Long],
                from,
                to)
              apiKeyConsumption: ApiKeyConsumption = ApiKeyConsumption(
                id = id,
                tenant = tenant.id,
                team = subscription.team,
                api = api.id,
                plan = plan.id,
                clientId = subscription.apiKey.clientId,
                hits = (consumption \ "hits" \ "count").as[Long],
                quotas = json.ApiKeyQuotasFormat.reads(quotas).get,
                globalInformations = ApiKeyGlobalConsumptionInformations(
                  (consumption \ "hits" \ "count").asOpt[Long].getOrElse(0),
                  (consumption \ "dataIn" \ "data.dataIn")
                    .asOpt[Long]
                    .getOrElse(0),
                  (consumption \ "dataOut" \ "data.dataOut")
                    .asOpt[Long]
                    .getOrElse(0),
                  (consumption \ "avgDuration" \ "duration").asOpt[Double],
                  (consumption \ "avgOverhead" \ "overhead").asOpt[Double]
                ),
                billing = billing,
                from =
                  if (from.isBefore(subscription.createdAt))
                    subscription.createdAt
                  else from,
                to = to,
                state =
                  if (isCompleteConsumption) ApiKeyConsumptionState.Completed
                  else ApiKeyConsumptionState.InProgress
              )
              _ <- env.dataStore.consumptionRepo
                .forTenant(tenant)
                .save(apiKeyConsumption)
              _ <- apiKeyConsumption.state match {
                case ApiKeyConsumptionState.Completed =>
                  env.dataStore.operationRepo
                    .forTenant(tenant)
                    .save(Operation(
                      DatastoreId(IdGenerator.token(24)),
                      tenant = tenant.id,
                      itemId = id.value,
                      itemType = ItemType.ApiKeyConsumption,
                      action = OperationAction.Sync,
                      payload = Json
                        .obj(
                          "paymentSettings" -> plan.paymentSettings
                            .map(_.asJson)
                            .getOrElse(JsNull)
                            .as[JsValue],
                          "thirdPartySubscriptionInformations" -> subscription.thirdPartySubscriptionInformations
                            .map(_.asJson)
                            .getOrElse(JsNull)
                            .as[JsValue]
                        )
                        .some
                    ))
                case ApiKeyConsumptionState.InProgress =>
                  FastFuture.successful(())
              }
            } yield {
              apiKeyConsumption
            }
        }
        .runWith(Sink.seq)
        .recover {
          case e =>
            AppLogger.error("[apikey stats job] Error during sync consumption",
                            e)
            Seq.empty
        }
    }.recover {
      case e =>
        AppLogger.error("[apikey stats job] Error during sync consumptions", e)
        Seq.empty
    }).getOrElse(FastFuture.successful(Seq.empty[ApiKeyConsumption])).flatten
  }

  def computeBilling(tenant: TenantId,
                     clientId: String,
                     plan: UsagePlan,
                     hits: Long,
                     periodStart: DateTime,
                     periodEnd: DateTime): Future[ApiKeyBilling] = {

    def computeAdditionalHitsCost(
        max: Long,
        count: Long,
        costPerAdditionalRequest: BigDecimal): BigDecimal = {
      if (max - count > 0) {
        0
      } else {
        (count - max) * costPerAdditionalRequest
      }
    }

    val from = plan.billingDuration.unit match {
      case Year  => DateTime.now().withDayOfYear(1).withTimeAtStartOfDay()
      case Month => periodStart.withDayOfMonth(1).withTimeAtStartOfDay()
      case Day   => DateTime.now().withTimeAtStartOfDay()
      case Hour  => DateTime.now().withMinuteOfHour(1)
    }

    val to = periodEnd.plusMonths(1).withDayOfMonth(1).withTimeAtStartOfDay()

    env.dataStore.consumptionRepo
      .forTenant(tenant)
      .find(
        Json.obj(
          "clientId" -> clientId,
          "from" -> Json.obj("$gte" -> from.getMillis, "$lte" -> to.getMillis),
          "state" -> "completed")
      )
      .map(
        consumptions => {
          plan match {
            //todo: consider trial period
            case _: FreeWithoutQuotas =>
              ApiKeyBilling(
                hits = hits + consumptions.map(_.hits).sum,
                total = 0
              )
            case _: FreeWithQuotas =>
              ApiKeyBilling(
                hits = hits + consumptions.map(_.hits).sum,
                total = 0
              )
            case p: QuotasWithLimits =>
              ApiKeyBilling(
                hits = hits + consumptions.map(_.hits).sum,
                total = p.costPerMonth
              )
            case p: QuotasWithoutLimits =>
              ApiKeyBilling(
                hits = hits + consumptions.map(_.hits).sum,
                total = p.costPerMonth + computeAdditionalHitsCost(
                  p.maxPerMonth,
                  hits + consumptions.map(_.hits).sum,
                  p.costPerAdditionalRequest)
              )
            case p: PayPerUse =>
              ApiKeyBilling(
                hits = hits + consumptions.map(_.hits).sum,
                total = p.costPerMonth + computeAdditionalHitsCost(
                  0,
                  hits + consumptions.map(_.hits).sum,
                  p.costPerRequest)
              )
            case p: Admin => ApiKeyBilling(0, 0)
          }
        }
      )
  }
}
