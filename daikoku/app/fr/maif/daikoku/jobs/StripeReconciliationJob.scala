package fr.maif.daikoku.jobs

import fr.maif.daikoku.controllers.PaymentClient
import fr.maif.daikoku.domain.{ApiSubscription, Tenant}
import fr.maif.daikoku.env.Env
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
class StripeReconciliationJob(env: Env, paymentClient: PaymentClient) {

  private val logger = Logger("StripeReconciliationJob")

  private val ref = new AtomicReference[Cancellable]()

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env
  implicit val mat: Materializer = env.defaultMaterializer

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
    */
  def reconcile(): Future[Done] = {
    val from = DateTime.now().withDayOfMonth(1).withTimeAtStartOfDay()
    val to = DateTime.now()

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
                reconcileSubscription(tenant, subscription, from, to)
              )
          )
          .runWith(Sink.ignore)
      )
  }

  private def reconcileSubscription(
      tenant: Tenant,
      subscription: ApiSubscription,
      from: DateTime,
      to: DateTime
  ): Future[Unit] =
    for {
      maybePlan <- env.dataStore.usagePlanRepo
        .forTenant(tenant)
        .findByIdNotDeleted(subscription.plan)
      consumptions <- env.dataStore.consumptionRepo
        .forTenant(tenant)
        .findNotDeleted(
          Json.obj(
            "clientId" -> subscription.apiKey.clientId,
            "from" -> Json.obj("$gte" -> from.getMillis)
          )
        )
      reportedHits = consumptions.map(_.lastReportedHits).sum
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
