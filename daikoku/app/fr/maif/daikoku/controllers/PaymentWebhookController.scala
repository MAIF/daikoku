package fr.maif.daikoku.controllers

import fr.maif.daikoku.actions.DaikokuUnauthenticatedAction
import fr.maif.daikoku.domain.ThirdPartyPaymentSettings.StripeSettings
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.logger.AppLogger
import fr.maif.daikoku.services.StripeWebhookService
import fr.maif.daikoku.utils.StripeSignature
import fr.maif.daikoku.utils.StripeSignature.Rejection
import org.apache.pekko.http.scaladsl.util.FastFuture
import play.api.libs.json.Json
import play.api.mvc.{AbstractController, ControllerComponents}

import scala.concurrent.ExecutionContext
import scala.util.Try

/** Receives what Stripe pushes about the money behind a subscription. Every
  * delivery is authenticated by the HMAC Stripe puts in `Stripe-Signature`,
  * keyed by the webhook secret of the payment settings the URL names.
  */
class PaymentWebhookController(
    DaikokuUnauthenticatedAction: DaikokuUnauthenticatedAction,
    env: Env,
    cc: ControllerComponents,
    stripeWebhookService: StripeWebhookService
) extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext

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
        case Some(Some(secret)) =>
          ctx.request.headers
            .get("Stripe-Signature")
            .toRight(Rejection.Malformed)
            .flatMap(
              StripeSignature.verify(_, ctx.request.body.utf8String, secret)
            ) match {
            case Left(rejection) =>
              AppLogger.warn(
                s"[stripe webhook] $rejection signature for settings $settingsId, event dropped"
              )
              FastFuture.successful(
                BadRequest(Json.obj("error" -> "invalid signature"))
              )
            case Right(()) =>
              Try(Json.parse(ctx.request.body.toArray)).toOption match {
                case None =>
                  FastFuture.successful(
                    BadRequest(Json.obj("error" -> "invalid payload"))
                  )
                case Some(event) =>
                  stripeWebhookService
                    .handle(ctx.tenant, event)
                    .fold(
                      error => {
                        AppLogger.error(
                          s"[stripe webhook] ${(event \ "type").asOpt[String].getOrElse("?")} on settings $settingsId not applied, Stripe will retry: ${error.getErrorMessage()}"
                        )
                        error.render()
                      },
                      _ => Ok(Json.obj("received" -> true))
                    )
              }
          }
      }
    }
}
