package fr.maif.daikoku.jobs

import cats.data.OptionT
import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.domain.BillingTimeUnit.{Day, Hour, Year}
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.logger.AppLogger
import fr.maif.daikoku.utils.{IdGenerator, OtoroshiClient}
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.scaladsl.{Flow, Sink, Source}
import org.apache.pekko.NotUsed
import org.joda.time.{DateTime, Days}
import play.api.Logger
import play.api.libs.json.*

import scala.concurrent.Future
import scala.math.Ordering.Implicits.infixOrderingOps
import scala.util.control.NonFatal

enum ApiKeyStatsJobInput:
  case Api(api: fr.maif.daikoku.domain.Api)
  case ApiSubscription(subscription: fr.maif.daikoku.domain.ApiSubscription)
  case TeamOwner(team: TeamId)
  case TeamSubscriber(team: TeamId)
  case SyncAll

class ApiKeyStatsJob(
    otoroshiClient: OtoroshiClient,
    override protected val env: Env
) extends AbstractJob[ApiKeyStatsJobInput] {

  private val batchSize = 50

  implicit val ev: Env = env

  private def loadSubKeyring(
      subscription: ApiSubscription,
      tenant: Tenant
  ): Future[Option[Keyring]] =
    env.dataStore.keyringRepo
      .forTenant(tenant.id)
      .findById(subscription.keyring)

  def syncConsumptionAsFlow(
      api: Api,
      tenant: Tenant,
      lastConsumptions: Seq[ApiKeyConsumption]
  ): Flow[ApiSubscription, Seq[ApiKeyConsumption], NotUsed] =
    Flow[ApiSubscription]
      .mapAsync(2) { subscription =>
        loadSubKeyring(subscription, tenant).flatMap { maybeKeyring =>
          syncConsumptionStatsForSubscription(
            subscription,
            tenant,
            Some(api),
            maybeKeyring.flatMap(k =>
              lastConsumptions.find(c => c.clientId == k.apiKey.clientId)
            )
          )
        }
      }

  def syncConsumptionAsFlow(
      apis: Seq[Api],
      tenant: Tenant,
      lastConsumptions: Seq[ApiKeyConsumption]
  ): Flow[ApiSubscription, Seq[ApiKeyConsumption], NotUsed] =
    Flow[ApiSubscription]
      .mapAsync(2) { subscription =>
        loadSubKeyring(subscription, tenant).flatMap { maybeKeyring =>
          syncConsumptionStatsForSubscription(
            subscription,
            tenant,
            apis.find(api => api.id == subscription.api),
            maybeKeyring.flatMap(k =>
              lastConsumptions.find(c => c.clientId == k.apiKey.clientId)
            )
          )
        }
      }

  def syncForSubscription(
      subscription: ApiSubscription,
      tenant: Tenant,
      completed: Boolean = false
  ): Future[Seq[ApiKeyConsumption]] = {
    (for {
      maybeKeyring <- loadSubKeyring(subscription, tenant)
      lastConsumption <- maybeKeyring match {
        case Some(keyring) =>
          env.dataStore.consumptionRepo
            .findLastConsumptions(
              tenant.id.some,
              clientId = keyring.apiKey.clientId.some
            )
            .map(_.headOption)
        case None => FastFuture.successful(None)
      }
      api <-
        env.dataStore.apiRepo
          .forTenant(tenant.id)
          .findById(subscription.api)
    } yield {
      api match {
        case Some(api) =>
          syncConsumptionStatsForSubscription(
            subscription,
            tenant,
            Some(api),
            lastConsumption,
            completed = completed
          )
        case None => FastFuture.successful(Seq.empty[ApiKeyConsumption])
      }
    }).flatten
  }

  def syncForApi(api: Api, tenant: Tenant): Future[Seq[ApiKeyConsumption]] = {
    (for {
      lastConsumptions <-
        env.dataStore.consumptionRepo
          .findLastConsumptions(tenant.id.some, apis = Seq(api.id).some)
      subscriptions <-
        env.dataStore.apiSubscriptionRepo
          .findByApi(tenant.id, api.id)
    } yield {
      Source(subscriptions.toList)
        .via(syncConsumptionAsFlow(api, tenant, lastConsumptions))
        .flatMapConcat(s => Source.apply(s.toList))
        .runWith(Sink.seq[ApiKeyConsumption])
    }).flatten
  }

  def syncForSubscriber(
      team: TeamId,
      tenant: Tenant
  ): Future[Seq[ApiKeyConsumption]] = {
    (for {
      lastConsumptions <-
        env.dataStore.consumptionRepo
          .findLastConsumptions(tenant.id.some, team = team.some)
      subscriptions <-
        env.dataStore.apiSubscriptionRepo
          .findByTeam(tenant.id, team)
      apis <-
        env.dataStore.apiRepo
          .forTenant(tenant)
          .findByIds(subscriptions.map(_.api).distinct)
    } yield {
      Source(subscriptions.toList)
        .via(syncConsumptionAsFlow(apis, tenant, lastConsumptions))
        .flatMapConcat(s => Source.apply(s.toList))
        .runWith(Sink.seq[ApiKeyConsumption])
    }).flatten
  }

  def syncForOwner(
      team: TeamId,
      tenant: Tenant
  ): Future[Seq[ApiKeyConsumption]] = {
    (for {
      apis <-
        env.dataStore.apiRepo.findByTeam(tenant.id, team)
      lastConsumptions <-
        env.dataStore.consumptionRepo
          .findLastConsumptions(tenant.id.some, apis = apis.map(_.id).some)
      subscriptions <-
        env.dataStore.apiSubscriptionRepo
          .findByApis(tenant.id, apis.map(_.id))
    } yield {
      Source(subscriptions.toList)
        .via(syncConsumptionAsFlow(apis, tenant, lastConsumptions))
        .flatMapConcat(s => Source.apply(s.toList))
        .runWith(Sink.seq[ApiKeyConsumption])
    }).flatten
  }

  // format: off

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
                                                   completed: Boolean = false
                                                 ): Future[Seq[ApiKeyConsumption]] = {
    (for {
      api <- OptionT.fromOption[Future](maybeApi)
      plan <- OptionT(
        env.dataStore.usagePlanRepo
          .forTenant(tenant)
          .findById(subscription.plan)
      )
      keyring <- OptionT(
        env.dataStore.keyringRepo
          .forTenant(tenant.id)
          .findById(subscription.keyring)
      )
      otoroshiTarget <- OptionT.fromOption[Future](plan.otoroshiTarget)
      otoSettings <- OptionT.fromOption[Future](
        tenant.otoroshiSettings.find(_.id == otoroshiTarget.otoroshiSettings)
      )
    } yield {
      implicit val otoroshiSettings: OtoroshiSettings = otoSettings

      val from = maybeLastConsumption
        .map(consumption =>
          consumption.state match {
            case ApiKeyConsumptionState.Completed => consumption.to
            case ApiKeyConsumptionState.InProgress => consumption.from
          }
        )
        .getOrElse(subscription.createdAt.withTimeAtStartOfDay())
        .max(DateTime.now().minusDays(60))

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

            AppLogger.info(
              s"[syncConsumptionStatsForSubscription]: from $from to $to for ${subscription.id.value}"
            )
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
                clientId = keyring.apiKey.clientId,
                from = from.getMillis.toString,
                to = to.toDateTime.getMillis.toString,
                failOnError = plan.costPerMonth.isDefined
              )
              quotas <- //todo: do not call apiquoats if not today
                otoroshiClient.getApiKeyQuotas(keyring.apiKey.clientId)
              billing <- computeBilling(
                tenant.id,
                keyring.apiKey.clientId,
                plan,
                (consumption \ "hits" \ "count").as[Long],
                from,
                to
              )
              apiKeyConsumption: ApiKeyConsumption = ApiKeyConsumption(
                id = id,
                tenant = tenant.id,
                team = subscription.team,
                api = api.id,
                plan = plan.id,
                clientId = keyring.apiKey.clientId,
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
              saved <-
                env.dataStore.consumptionRepo
                  .forTenant(tenant)
                  .save(apiKeyConsumption)
              _ <- if (saved) Future.successful(())
                   else Future.failed(new IllegalStateException(
                     s"Could not save API key consumption ${id.value}"
                   ))
              _ <- apiKeyConsumption.state match {
                case ApiKeyConsumptionState.Completed
                  if subscription.thirdPartySubscriptionInformations.isDefined =>
                  env.dataStore.operationRepo
                    .forTenant(tenant)
                    .save(
                      Operation(
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
                      )
                    )
                case _ =>
                  FastFuture.successful(())
              }
            } yield {
              apiKeyConsumption
            }
        }
        .runWith(Sink.seq)
      //        .recover {
      //          case e =>
      //            AppLogger.error(
      //              "[apikey stats job] Error during sync consumption",
      //              e
      //            )
      //            Seq.empty
      //        }
    })
      //      .recover {
      //      case e =>
      //        AppLogger.error("[apikey stats job] Error during sync consumptions", e)
      //        Seq.empty
      //    })
      .getOrElse(FastFuture.successful(Seq.empty[ApiKeyConsumption]))
      .flatten
  }
  // format: on

  def computeBilling(
      tenant: TenantId,
      clientId: String,
      plan: UsagePlan,
      hits: Long,
      periodStart: DateTime,
      periodEnd: DateTime
  ): Future[ApiKeyBilling] = {

    def computeAdditionalHitsCost(
        max: Long,
        count: Long,
        costPerAdditionalRequest: BigDecimal
    ): BigDecimal = {
      if (max - count > 0) {
        0
      } else {
        (count - max) * costPerAdditionalRequest
      }
    }

    val from = plan.billingDuration.map(_.unit) match {
      case Some(Year) => DateTime.now().withDayOfYear(1).withTimeAtStartOfDay()
      case Some(Hour) => DateTime.now().withMinuteOfHour(1)
      case Some(Day)  => DateTime.now().withTimeAtStartOfDay()
      case _          => periodStart.withDayOfMonth(1).withTimeAtStartOfDay()
    }

    val to = periodEnd.plusMonths(1).withDayOfMonth(1).withTimeAtStartOfDay()

    {
      val repo = env.dataStore.consumptionRepo.forTenant(tenant)
      repo.query(
        s"SELECT content FROM ${repo.tableName} " +
          "WHERE content->>'_tenant' = $1 " +
          "AND content->>'clientId' = $2 " +
          "AND content->>'state' = 'completed' " +
          "AND (content->>'from')::bigint >= $3 " +
          "AND (content->>'from')::bigint <= $4",
        Seq(
          tenant.value,
          clientId,
          java.lang.Long.valueOf(from.getMillis),
          java.lang.Long.valueOf(to.getMillis)
        )
      )
    }
      .map(consumptions => {
        (plan.costPerMonth, plan.costPerRequest, plan.maxPerMonth) match {
          // todo: consider trial period
          case (None, None, Some(_)) =>
            ApiKeyBilling(
              hits = hits + consumptions.map(_.hits).sum,
              total = 0
            )
          case (Some(costPerMonth), None, Some(_)) =>
            ApiKeyBilling(
              hits = hits + consumptions.map(_.hits).sum,
              total = costPerMonth
            )
          case (Some(costPerMonth), Some(costPerRequest), Some(maxPerMonth)) =>
            ApiKeyBilling(
              hits = hits + consumptions.map(_.hits).sum,
              total = costPerMonth + computeAdditionalHitsCost(
                maxPerMonth,
                hits + consumptions.map(_.hits).sum,
                costPerRequest
              )
            )
          case (Some(costPerMonth), Some(costPerRequest), None) =>
            ApiKeyBilling(
              hits = hits + consumptions.map(_.hits).sum,
              total = costPerMonth + computeAdditionalHitsCost(
                0,
                hits + consumptions.map(_.hits).sum,
                costPerRequest
              )
            )
          case _ if plan.visibility == UsagePlanVisibility.Admin =>
            ApiKeyBilling(0, 0)
          case _ =>
            ApiKeyBilling(
              hits = hits + consumptions.map(_.hits).sum,
              total = 0
            )
        }
      })
  }

  override protected val logger = Logger("api-key-stats-collector")
  override protected val jobName: JobName = JobName.ApiKeyStatsCollector
  override protected val lockedBy: String = "api-key-stats-collector"

  override protected val jobConfig: JobConfig = JobConfig(
    enabled = env.config.apikeysStatsJobEnabled,
    schedulingMode = env.config.apikeysStatsJobSchedulingMode,
    cronExpression = env.config.apikeysStatsJobCronExpr,
    interval = env.config.apikeysStatsJobInterval,
    parallelism = 2
  )

  override protected def defaultInput: ApiKeyStatsJobInput =
    ApiKeyStatsJobInput.SyncAll

  private def subscriptionBatches(
      tenant: Tenant,
      input: ApiKeyStatsJobInput,
      fromCursor: Option[Long]
  ): Source[Seq[ApiSubscription], NotUsed] = {
    val repo = env.dataStore.apiSubscriptionRepo.forTenant(tenant)
    val (target, targetParams): (String, Seq[AnyRef]) = input match {
      case ApiKeyStatsJobInput.Api(api) =>
        (" AND content->>'api' = $2", Seq(api.id.value))
      case ApiKeyStatsJobInput.ApiSubscription(subscription) =>
        (" AND _id = $2", Seq(subscription.id.value))
      case ApiKeyStatsJobInput.TeamOwner(team) =>
        (
          """ AND content->>'api' IN (
            |SELECT _id FROM apis WHERE content->>'_tenant' = $1 AND content->>'team' = $2
            |)""".stripMargin,
          Seq(team.value)
        )
      case ApiKeyStatsJobInput.TeamSubscriber(team) =>
        (" AND content->>'team' = $2", Seq(team.value))
      case ApiKeyStatsJobInput.SyncAll =>
        ("", Seq.empty)
    }
    val baseParams = Seq[AnyRef](tenant.id.value) ++ targetParams
    val resumeClause = fromCursor
      .map(_ =>
        s" AND (content->>'createdAt')::bigint >= $$${baseParams.size + 1}"
      )
      .getOrElse("")
    val params = baseParams ++ fromCursor.map(java.lang.Long.valueOf)

    Source.unfoldAsync[Option[(Long, String)], Seq[ApiSubscription]](None) {
      after =>
        val afterClause = after
          .map(_ =>
            s" AND ((content->>'createdAt')::bigint, _id) > ($$${params.size + 1}, $$${params.size + 2})"
          )
          .getOrElse("")
        val pageParams = params ++ after.toSeq.flatMap { case (createdAt, id) =>
          Seq[AnyRef](java.lang.Long.valueOf(createdAt), id)
        }
        repo
          .query(
            s"SELECT content FROM ${repo.tableName} " +
              s"WHERE content->>'_tenant' = $$1$target$resumeClause$afterClause " +
              s"ORDER BY (content->>'createdAt')::bigint, _id LIMIT $batchSize",
            pageParams
          )
          .map { batch =>
            batch.lastOption.map(last =>
              (Some((last.createdAt.getMillis, last.id.value)), batch)
            )
          }
    }
  }

  override protected def process(
      tenant: Tenant,
      input: ApiKeyStatsJobInput,
      parallelism: Int,
      saveCursor: Long => Future[Boolean],
      fromCursor: Option[Long]
  ): Future[JobRunResult] = {
    if (parallelism <= 0)
      return Future.failed(
        new IllegalArgumentException(
          "API key stats parallelism must be positive"
        )
      )

    // The persisted cursor belongs to the full tenant scan, not an API/team subset.
    val resumeCursor =
      if (input == ApiKeyStatsJobInput.SyncAll) fromCursor else None

    subscriptionBatches(tenant, input, resumeCursor)
      .scanAsync(JobRunResult.empty.copy(lastCursor = resumeCursor)) {
        (previous, batch) =>
          Source(batch.toList)
            .mapAsync(parallelism) { subscription =>
              syncForSubscription(subscription, tenant)
                .map(_ => Option.empty[JobItemFailure])
                .recover { case NonFatal(error) =>
                  logger.error(
                    s"[api-key-stats-collector] subscription ${subscription.id.value} failed",
                    error
                  )
                  Some(JobItemFailure(subscription.id.value, error.getMessage))
                }
                .map(failure => (subscription.createdAt.getMillis, failure))
            }
            .runWith(Sink.seq)
            .flatMap { outcomes =>
              val failures = outcomes.flatMap(_._2)
              // Never checkpoint past a failed item, even if a later batch succeeds.
              val cursor =
                if (input != ApiKeyStatsJobInput.SyncAll) 0L
                else if (previous.failures.nonEmpty)
                  previous.lastCursor.getOrElse(0L)
                else
                  outcomes
                    .collectFirst { case (createdAt, Some(_)) =>
                      createdAt
                    }
                    .getOrElse(batch.last.createdAt.getMillis)
              val result = JobRunResult(
                processed = previous.processed + batch.size,
                succeeded = previous.succeeded + batch.size - failures.size,
                failures = previous.failures ++ failures,
                lastCursor =
                  if (input == ApiKeyStatsJobInput.SyncAll) Some(cursor)
                  else None
              )
              saveCursor(cursor).flatMap {
                case true => Future.successful(result)
                case false =>
                  Future.failed(
                    new IllegalStateException(
                      "Could not save API key stats job cursor"
                    )
                  )
              }
            }
      }
      .runWith(Sink.last)
  }
}
