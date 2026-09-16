package fr.maif.daikoku.services

import cats.data.EitherT
import fr.maif.daikoku.controllers.{AppError, PaymentClient}
import fr.maif.daikoku.domain.{
  ApiSubscription,
  GuestUser,
  StepValidator,
  Tenant,
  User
}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.logger.AppLogger
import fr.maif.daikoku.utils.Translator
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.joda.time.DateTime
import play.api.i18n.MessagesApi
import play.api.libs.json.{JsValue, Json}

import scala.concurrent.{ExecutionContext, Future}

/** Applies a Stripe event whose signature has already been checked. */
class StripeWebhookService(
    env: Env,
    apiService: ApiService,
    paymentClient: PaymentClient,
    billingNotificationService: BillingNotificationService,
    translator: Translator,
    messagesApi: MessagesApi
) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env
  implicit val tr: Translator = translator
  implicit val me: MessagesApi = messagesApi

  /** A Left means the event could not be applied yet: the caller answers with
    * an error so Stripe delivers it again.
    */
  def handle(
      tenant: Tenant,
      event: JsValue
  ): EitherT[Future, AppError, Unit] = {
    val payload = (event \ "data" \ "object").getOrElse(Json.obj())
    (event \ "type").asOpt[String] match {
      case Some("checkout.session.completed") =>
        onCheckoutCompleted(tenant, payload)
      case Some("invoice.paid") =>
        EitherT.liftF(onInvoicePaid(tenant, payload))
      case Some("customer.subscription.deleted") =>
        EitherT.liftF(onSubscriptionDeleted(tenant, payload))
      case Some("invoice.finalized") =>
        EitherT.liftF(onInvoiceFinalized(tenant, payload))
      case eventType =>
        AppLogger.debug(
          s"[stripe webhook] event ${eventType.getOrElse("?")} ignored"
        )
        EitherT.pure(())
    }
  }

  /** The only place a paid subscription is materialised: the browser coming
    * back from the checkout proves nothing. Once applied, the payment step is
    * closed, so a redelivery finds nothing left to do.
    */
  private def onCheckoutCompleted(
      tenant: Tenant,
      session: JsValue
  ): EitherT[Future, AppError, Unit] = {
    val sessionId = (session \ "id").asOpt[String]
    val demandId = (session \ "metadata" \ "subscription_demand").asOpt[String]

    val pendingPayment: Future[Option[StepValidator]] = demandId match {
      case None => FastFuture.successful(None)
      case Some(id) =>
        env.dataStore.subscriptionDemandRepo
          .forTenant(tenant)
          .findByIdNotDeleted(id)
          .flatMap {
            case None => FastFuture.successful(None)
            case Some(demand) =>
              demand.steps.find(step =>
                step.step.name == "payment" && !step.state.isClosed
              ) match {
                case None => FastFuture.successful(None)
                case Some(step) =>
                  env.dataStore.stepValidatorRepo
                    .forTenant(tenant)
                    .findOneNotDeleted(
                      Json.obj(
                        "step" -> step.id.value,
                        "subscriptionDemand" -> demand.id.value
                      )
                    )
              }
          }
    }

    EitherT.liftF(pendingPayment).flatMap {
      case None =>
        AppLogger.info(
          s"[stripe webhook] checkout session ${sessionId.getOrElse("?")} matches no pending payment of demand ${demandId
              .getOrElse("?")}, ignored"
        )
        EitherT.pure(())
      case Some(validator) =>
        implicit val language: String = tenant.defaultLanguage.getOrElse("en")
        implicit val currentUser: User = GuestUser(tenant.id)
        apiService
          .validateProcessWithStepValidator(validator, tenant, sessionId)
          .map(_ => ())
    }
  }

  private def onInvoicePaid(tenant: Tenant, invoice: JsValue): Future[Unit] =
    subscriptionOf(tenant, subscriptionOfInvoice(invoice)).flatMap {
      case None => ignored("invoice.paid", subscriptionOfInvoice(invoice))
      case Some(subscription) if subscription.enabled =>
        FastFuture.successful(())
      case Some(subscription) =>
        setEnabled(tenant, subscription, enabled = true)
    }

  /** The invoice for the period that just closed is now locked, so moving the
    * subscription onto the plan's current prices only affects the next one.
    * Swapping earlier, while Stripe still holds the invoice as a draft, would
    * change the amounts being billed.
    */
  private def onInvoiceFinalized(
      tenant: Tenant,
      invoice: JsValue
  ): Future[Unit] =
    subscriptionOf(tenant, subscriptionOfInvoice(invoice)).flatMap {
      case None => ignored("invoice.finalized", subscriptionOfInvoice(invoice))
      case Some(subscription) =>
        env.dataStore.usagePlanRepo
          .forTenant(tenant)
          .findByIdNotDeleted(subscription.plan)
          .flatMap {
            case None => FastFuture.successful(())
            case Some(plan) =>
              paymentClient
                .applyPlanPricesToSubscription(tenant, subscription, plan)
                .value
                .map {
                  case Right(true) =>
                    AppLogger.info(
                      s"[stripe webhook] subscription ${subscription.id.value} moved onto the current prices of its plan"
                    )
                  case Right(false) => ()
                  case Left(error) =>
                    AppLogger.error(
                      s"[stripe webhook] unable to move subscription ${subscription.id.value} onto the current prices of its plan: ${error.getErrorMessage()}"
                    )
                }
          }
    }

  private def onSubscriptionDeleted(
      tenant: Tenant,
      stripeSubscription: JsValue
  ): Future[Unit] = {
    val stripeSubscriptionId = (stripeSubscription \ "id").asOpt[String]
    subscriptionOf(tenant, stripeSubscriptionId).flatMap {
      case None =>
        ignored("customer.subscription.deleted", stripeSubscriptionId)
      case Some(subscription) if !subscription.enabled =>
        FastFuture.successful(())
      case Some(subscription) =>
        setEnabled(tenant, subscription, enabled = false).flatMap(_ =>
          billingNotificationService.cancellationScheduled(
            tenant,
            subscription,
            DateTime.now()
          )
        )
    }
  }

  private def setEnabled(
      tenant: Tenant,
      subscription: ApiSubscription,
      enabled: Boolean
  ): Future[Unit] =
    env.dataStore.usagePlanRepo
      .forTenant(tenant)
      .findByIdNotDeleted(subscription.plan)
      .flatMap {
        case None =>
          AppLogger.error(
            s"[stripe webhook] plan ${subscription.plan.value} of subscription ${subscription.id.value} not found, enabled left to ${subscription.enabled}"
          )
          FastFuture.successful(())
        case Some(plan) =>
          apiService.archiveApiKey(tenant, subscription, plan, enabled).map {
            case Left(error) =>
              AppLogger.error(
                s"[stripe webhook] unable to set enabled=$enabled on subscription ${subscription.id.value}: ${error.getErrorMessage()}"
              )
            case Right(_) => ()
          }
      }

  private def subscriptionOf(
      tenant: Tenant,
      stripeSubscriptionId: Option[String]
  ): Future[Option[ApiSubscription]] =
    stripeSubscriptionId match {
      case None => FastFuture.successful(None)
      case Some(id) =>
        env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findOneNotDeleted(
            Json.obj("thirdPartySubscriptionInformations.subscriptionId" -> id)
          )
    }

  private def subscriptionOfInvoice(invoice: JsValue): Option[String] =
    (invoice \ "parent" \ "subscription_details" \ "subscription")
      .asOpt[String]

  private def ignored(
      eventType: String,
      stripeSubscriptionId: Option[String]
  ): Future[Unit] = {
    AppLogger.info(
      s"[stripe webhook] $eventType for stripe subscription ${stripeSubscriptionId
          .getOrElse("?")} matches no subscription, ignored"
    )
    FastFuture.successful(())
  }
}
