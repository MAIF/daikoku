package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import cats.data.EitherT
import com.stripe.Stripe
import com.stripe.model.{Price, Product}
import com.stripe.param.{
  PriceCreateParams,
  ProductCreateParams,
  ProductSearchParams
}
import controllers.AppError
import controllers.AppError.OtoroshiError
import fr.maif.otoroshi.daikoku.domain.ThirdPartyPaymentSettings.StripeSettings
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json.ActualOtoroshiApiKeyFormat
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import play.api.libs.json.{JsError, JsObject, JsSuccess, Json}
import play.api.libs.ws.{WSAuthScheme, WSRequest}

import scala.concurrent.Future
import scala.jdk.CollectionConverters.CollectionHasAsScala

class PaymentClient(
    env: Env
) {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env
  val STRIPE_URL = "https://api.stripe.com";
  val ws = env.wsClient

  def getStripeProductName(api: Api) =
    s"${api.name}::${api.currentVersion.value}"
  def stripeClient(
      path: String
  )(implicit stripeSettings: StripeSettings): WSRequest = {
    ws.url(s"$STRIPE_URL$path")
      .withHttpHeaders(
        "content-type" -> "application/x-www-form-urlencoded"
      )
      .withAuth(
        stripeSettings.secretKey,
        "",
        WSAuthScheme.BASIC
      )
  }

  def createProduct(
      tenant: Tenant,
      api: Api,
      plan: UsagePlan
  ): EitherT[Future, AppError, (String, String)] =
    tenant.thirdPartyPaymentSettings.find(s =>
      plan.paymentSettings.exists(ps => ps.thirdPartyPaymentSettingsId == s.id)
    ) match {
      case Some(settings) =>
        settings match {
          case s: StripeSettings =>
            implicit val stripeSettings: StripeSettings = s
            Stripe.apiKey = s.secretKey
            val productName = getStripeProductName(api)
            val params = ProductSearchParams
              .builder()
              .setQuery(s"name:'$productName'")
              .build();
            val result = Product.search(params).getData.asScala.toSeq

            if (result.nonEmpty) {
              createStripePrice(
                plan,
                result.head.getId
              )
            } else {
              createStripeProduct(
                api,
                plan
              )
            }
        }
      case None =>
        EitherT.leftT[Future, (String, String)](
          AppError.ThirdPartyPaymentSettingsNotFound
        )
    }

  def createStripePrice(
      plan: UsagePlan,
      productId: String
  )(implicit
      stripeSettings: StripeSettings
  ): EitherT[Future, AppError, (String, String)] = {

    val planName: String = plan.customName.getOrElse(plan.typeName)
    EitherT
      .liftF(
        stripeClient("/v1/prices")
          .post(
            Map(
              "product" -> productId,
              "unit_amount" -> (plan.costPerMonth * 100).longValue.toString,
              "currency" -> plan.currency.code,
              "nickname" -> planName,
              "metadata[plan]" -> plan.id.value,
              "recurring[interval]" -> plan.billingDuration.unit.name.toLowerCase
            )
          )
      )
      .flatMap(res => {
        if (res.status == 200 || res.status == 201) {
          EitherT
            .rightT[Future, AppError]((productId, (res.json \ "id").as[String]))
        } else {
          EitherT.leftT[Future, (String, String)](
            AppError.OtoroshiError(res.json.as[JsObject])
          )
        }
      })

  }

  def createStripeProduct(
      api: Api,
      plan: UsagePlan
  )(implicit
      stripeSettings: StripeSettings
  ): EitherT[Future, AppError, (String, String)] = {

    EitherT
      .liftF(
        stripeClient("/v1/products")
          .post(
            Map(
              "name" -> getStripeProductName(api),
              "metadata[tenant]" -> api.tenant.value,
              "metadata[api]" -> api.id.value,
              "metadata[team]" -> api.team.value
            )
          )
      )
      .flatMap(res => {
        if (res.status == 200 || res.status == 201) {
          createStripePrice(plan, (res.json \ "id").as[String])
        } else {
          EitherT.leftT[Future, (String, String)](
            AppError.OtoroshiError(res.json.as[JsObject])
          )
        }
      })
  }
}
