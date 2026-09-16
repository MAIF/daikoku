package fr.maif.daikoku.jobs

import fr.maif.daikoku.controllers.PaymentClient
import fr.maif.daikoku.controllers.UnpaidInvoice.gracePeriodDays
import fr.maif.daikoku.domain.ThirdPartyPaymentSettings.StripeSettings
import fr.maif.daikoku.domain.{
  ApiKeyConsumption,
  ApiSubscription,
  Tenant,
  UsagePlan
}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.services.{ApiService, BillingNotificationService}
import fr.maif.daikoku.utils.Translator
import org.joda.time.Days
import play.api.i18n.MessagesApi
import org.apache.pekko.Done
import org.apache.pekko.actor.Cancellable
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.{Sink, Source}
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json.Json

import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.duration._
import scala.concurrent.{ExecutionContext, Future}

/** Stripe answers a meter event before aggregating it, so an accepted event can
  * still be dropped afterwards and the error report only ever gives samples.
  * Rather than chasing individual rejections, this job compares totals: what
  * Daikoku recorded as reported against what Stripe counted, and sends back the
  * difference.
  */
class StripeReconciliationJob(
    env: Env,
    paymentClient: PaymentClient,
    apiService: ApiService,
    billingNotificationService: BillingNotificationService,
    translator: Translator,
    messagesApi: MessagesApi
) {

  private val logger = Logger("StripeReconciliationJob")

  private val ref = new AtomicReference[Cancellable]()

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env
  implicit val mat: Materializer = env.defaultMaterializer
  implicit val tr: Translator = translator
  implicit val m: MessagesApi = messagesApi

  def start(): Unit = {
    logger.info(
      s"Start stripe reconciliation job: cron ==> ${env.config.stripeReconciliationByCron} every ${env.config.stripeReconciliationInterval}"
    )
    if (env.config.stripeReconciliationByCron && ref.get() == null) {
      ref.set(
        env.defaultActorSystem.scheduler
          .scheduleAtFixedRate(
            initialDelay = 1.minute,
            interval = env.config.stripeReconciliationInterval
          ) { () =>
            reconcile()
          }
      )
    }
  }

  def stop(): Unit = {
    Option(ref.get()).foreach(_.cancel())
  }

  /** The window is the running billing period: usage is billed monthly, and a
    * meter event cannot be dated more than 35 days back anyway.
    *
    * `now` is the instant everything is measured against. It defaults to the
    * machine clock; the e2e passes the frozen time of a Stripe test clock, so
    * that a period it moved forward is read the way Stripe sees it.
    */
  def reconcile(now: DateTime = DateTime.now()): Future[Done] = {
    val from = now.withDayOfMonth(1).withTimeAtStartOfDay()
    val to = now

    env.dataStore.tenantRepo
      .findAllNotDeleted()
      .flatMap(tenants =>
        Source(tenants.toList)
          .flatMapConcat(tenant =>
            env.dataStore.apiSubscriptionRepo
              .forTenant(tenant)
              .streamAllRawFormatted(Json.obj("_deleted" -> false))
              .filter(_.thirdPartySubscriptionInformations.isDefined)
              .mapAsync(4)(subscription =>
                reconcileSubscription(tenant, subscription, from, to, now)
              )
          )
          .runWith(Sink.ignore)
      )
  }

  /** The team is told on day 1, on day 7, then every day from day 15. On day 30
    * the key stops passing, unless the tenant asked never to cut. Nothing is
    * destroyed: invoice.paid brings the same credentials back.
    */
  private def handleUnpaid(
      tenant: Tenant,
      subscription: ApiSubscription,
      plan: UsagePlan,
      now: DateTime
  ): Future[Unit] =
    paymentClient.unpaidInvoiceOf(tenant, subscription, plan).value.flatMap {
      case Left(error) =>
        logger.error(
          s"[reconciliation] unable to read the unpaid invoices of subscription ${subscription.id.value}: ${error.getErrorMessage()}"
        )
        FastFuture.successful(())
      case Right(None) => FastFuture.successful(())
      case Right(Some(unpaid)) =>
        val days = Days.daysBetween(unpaid.since, now).getDays
        val cutsOnUnpaid = plan.paymentSettings
          .flatMap(settings =>
            tenant.thirdPartyPaymentSettings.collectFirst {
              case s: StripeSettings
                  if s.id == settings.thirdPartyPaymentSettingsId =>
                s.cutOnUnpaid
            }
          )
          .getOrElse(true)

        for {
          _ <-
            if (days == 1 || days == 7 || days >= 15)
              billingNotificationService.paymentFailed(
                tenant,
                subscription,
                unpaid.amount,
                unpaid.currency,
                unpaid.since,
                unpaid.since.plusDays(gracePeriodDays)
              )
            else FastFuture.successful(())
          _ <-
            if (days >= gracePeriodDays && cutsOnUnpaid && subscription.enabled)
              cutForUnpaid(tenant, subscription, plan, days)
            else FastFuture.successful(())
        } yield ()
    }

  private def cutForUnpaid(
      tenant: Tenant,
      subscription: ApiSubscription,
      plan: UsagePlan,
      days: Int
  ): Future[Unit] =
    apiService
      .archiveApiKey(tenant, subscription, plan, enabled = false)
      .flatMap {
        case Left(error) =>
          logger.error(
            s"[reconciliation] unable to disable subscription ${subscription.id.value} after $days unpaid days: ${error.getErrorMessage()}"
          )
          FastFuture.successful(())
        case Right(_) =>
          logger.warn(
            s"[reconciliation] subscription ${subscription.id.value} disabled after $days unpaid days"
          )
          billingNotificationService.keyDisabled(
            tenant,
            subscription,
            DateTime.now()
          )
      }

  private def reconcileSubscription(
      tenant: Tenant,
      subscription: ApiSubscription,
      from: DateTime,
      to: DateTime,
      now: DateTime
  ): Future[Unit] =
    for {
      maybePlan <- env.dataStore.usagePlanRepo
        .forTenant(tenant)
        .findByIdNotDeleted(subscription.plan)
      // the api key lives on the keyring, and consumptions are still recorded
      // under its clientId
      maybeKeyring <- env.dataStore.keyringRepo
        .forTenant(tenant)
        .findByIdNotDeleted(subscription.keyring)
      consumptions <- maybeKeyring.fold(
        FastFuture.successful(Seq.empty[ApiKeyConsumption])
      )(keyring =>
        env.dataStore.consumptionRepo
          .forTenant(tenant)
          .findNotDeleted(
            Json.obj(
              "clientId" -> keyring.apiKey.clientId,
              "from" -> Json.obj("$gte" -> from.getMillis)
            )
          )
      )
      reportedHits = consumptions.map(_.lastReportedHits).sum
      _ <- maybePlan.fold(FastFuture.successful(()))(plan =>
        paymentClient
          .applyPlanPricesToSubscription(tenant, subscription, plan)
          .value
          .map {
            case Right(true) =>
              logger.warn(
                s"[reconciliation] subscription ${subscription.id.value} was still on a former price, moved onto the current one"
              )
            case Right(false) => ()
            case Left(error) =>
              logger.error(
                s"[reconciliation] unable to check the price of subscription ${subscription.id.value}: ${error.getErrorMessage()}"
              )
          }
      )
      _ <- maybePlan.fold(FastFuture.successful(()))(plan =>
        handleUnpaid(tenant, subscription, plan, now)
      )
      _ <- (maybePlan, reportedHits) match {
        case (Some(plan), hits) if hits > 0 =>
          paymentClient
            .reconcileUsageWithThirdParty(
              tenant,
              plan.paymentSettings,
              subscription.thirdPartySubscriptionInformations,
              hits,
              from,
              to
            )
            .map {
              case Right(0) => ()
              case Right(resent) =>
                logger.warn(
                  s"[reconciliation] subscription ${subscription.id.value}: Stripe was missing $resent hits out of $hits, resent"
                )
              case Left(error) =>
                logger.error(
                  s"[reconciliation] subscription ${subscription.id.value}: ${error.getErrorMessage()}"
                )
            }
        case _ => FastFuture.successful(())
      }
    } yield ()
}
