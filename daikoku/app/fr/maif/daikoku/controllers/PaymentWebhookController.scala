package fr.maif.daikoku.controllers

import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.actions.DaikokuUnauthenticatedAction
import fr.maif.daikoku.domain.ThirdPartyPaymentSettings.StripeSettings
import fr.maif.daikoku.domain.{ApiSubscription, Currency, Tenant}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.logger.AppLogger
import fr.maif.daikoku.services.{ApiService, BillingNotificationService}
import fr.maif.daikoku.utils.Translator
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.util.ByteString
import org.joda.time.DateTime
import play.api.i18n.{I18nSupport, MessagesApi}
import play.api.libs.json.{JsValue, Json}
import play.api.mvc.{AbstractController, ControllerComponents}

import java.nio.charset.StandardCharsets.UTF_8
import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

/** Receives what Stripe pushes about the money behind a subscription. Every
  * delivery is authenticated by the HMAC Stripe puts in `Stripe-Signature`,
  * keyed by the webhook secret of the payment settings the URL names.
  */
class PaymentWebhookController(
    DaikokuUnauthenticatedAction: DaikokuUnauthenticatedAction,
    env: Env,
    cc: ControllerComponents,
    apiService: ApiService,
    paymentClient: PaymentClient,
    billingNotificationService: BillingNotificationService,
    translator: Translator
) extends AbstractController(cc)
    with I18nSupport {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env
  implicit val tr: Translator = translator
  implicit val me: MessagesApi = messagesApi

  private val signatureToleranceSeconds = 300L
  private val gracePeriodDays = 30

  def webhook(settingsId: String) =
    DaikokuUnauthenticatedAction.async(parse.byteString) { ctx =>
      val settings = ctx.tenant.thirdPartyPaymentSettings.collectFirst {
        case s: StripeSettings if s.id.value == settingsId => s
      }

      settings.map(_.webhookSecret) match {
        case None =>
          FastFuture.successful(
            NotFound(Json.obj("error" -> "payment settings not found"))
          )
        case Some(None) =>
          AppLogger.warn(
            s"[stripe webhook] settings $settingsId have no webhook secret, event dropped"
          )
          FastFuture.successful(
            BadRequest(Json.obj("error" -> "webhook secret not configured"))
          )
        case Some(Some(secret))
            if !isSignedWith(
              secret,
              ctx.request.headers.get("Stripe-Signature"),
              ctx.request.body
            ) =>
          AppLogger.warn(
            s"[stripe webhook] invalid signature for settings $settingsId, event dropped"
          )
          FastFuture.successful(
            BadRequest(Json.obj("error" -> "invalid signature"))
          )
        case Some(Some(_)) =>
          Try(Json.parse(ctx.request.body.toArray)).toOption match {
            case None =>
              FastFuture.successful(
                BadRequest(Json.obj("error" -> "invalid payload"))
              )
            case Some(event) =>
              handle(ctx.tenant, event).map(_ =>
                Ok(Json.obj("received" -> true))
              )
          }
      }
    }

  /** `Stripe-Signature: t=<unix seconds>,v1=<hex>[,v1=<hex>]`, each v1 being
    * HMAC-SHA256 over `"<t>.<raw body>"`. Several v1 coexist while the secret
    * is being rolled.
    */
  private def isSignedWith(
      secret: String,
      header: Option[String],
      body: ByteString
  ): Boolean = {
    val fields = header.toSeq
      .flatMap(_.split(","))
      .map(_.trim)
      .flatMap(field =>
        field.indexOf('=') match {
          case -1    => None
          case index => Some(field.take(index) -> field.drop(index + 1))
        }
      )
    val timestamp = fields
      .collectFirst { case ("t", value) => value }
      .flatMap(value => Try(value.toLong).toOption)
    val signatures = fields.collect { case ("v1", value) => value }

    timestamp.exists { t =>
      val fresh =
        Math.abs(System.currentTimeMillis() / 1000 - t) <= signatureToleranceSeconds
      val mac = Mac.getInstance("HmacSHA256")
      mac.init(new SecretKeySpec(secret.getBytes(UTF_8), "HmacSHA256"))
      val expected = mac
        .doFinal((ByteString(s"$t.") ++ body).toArray)
        .map("%02x".format(_))
        .mkString

      fresh && signatures.exists(signature =>
        MessageDigest.isEqual(
          expected.getBytes(UTF_8),
          signature.getBytes(UTF_8)
        )
      )
    }
  }

  private def handle(tenant: Tenant, event: JsValue): Future[Unit] = {
    val payload = (event \ "data" \ "object").getOrElse(Json.obj())
    (event \ "type").asOpt[String] match {
      case Some("invoice.payment_failed") =>
        onInvoicePaymentFailed(tenant, payload)
      case Some("invoice.paid") =>
        onInvoicePaid(tenant, payload)
      case Some("customer.subscription.deleted") =>
        onSubscriptionDeleted(tenant, payload)
      case eventType =>
        AppLogger.debug(
          s"[stripe webhook] event ${eventType.getOrElse("?")} ignored"
        )
        FastFuture.successful(())
    }
  }

  private def onInvoicePaymentFailed(
      tenant: Tenant,
      invoice: JsValue
  ): Future[Unit] =
    subscriptionOf(tenant, subscriptionOfInvoice(invoice)).flatMap {
      case None =>
        ignored("invoice.payment_failed", subscriptionOfInvoice(invoice))
      case Some(subscription) =>
        val currency = Currency(
          (invoice \ "currency").asOpt[String].getOrElse("eur").toUpperCase
        )
        val amount = paymentClient.fromStripeAmount(
          (invoice \ "amount_due").asOpt[Long].getOrElse(0L),
          currency.some
        )
        val failedAt = DateTime.now()
        billingNotificationService.paymentFailed(
          tenant,
          subscription,
          amount,
          currency,
          failedAt,
          failedAt.plusDays(gracePeriodDays)
        )
    }

  private def onInvoicePaid(tenant: Tenant, invoice: JsValue): Future[Unit] =
    subscriptionOf(tenant, subscriptionOfInvoice(invoice)).flatMap {
      case None => ignored("invoice.paid", subscriptionOfInvoice(invoice))
      case Some(subscription) if subscription.enabled =>
        FastFuture.successful(())
      case Some(subscription) =>
        setEnabled(tenant, subscription, enabled = true)
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
