package fr.maif.otoroshi.daikoku.ctrls

import cats.data.EitherT
import cats.implicits.catsSyntaxOptionId
import controllers.AppError
import fr.maif.otoroshi.daikoku.domain.ThirdPartyPaymentSettings.StripeSettings
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import play.api.libs.json.JsObject
import play.api.libs.ws.{WSAuthScheme, WSRequest}

import scala.concurrent.Future

class PaymentClient(
    env: Env
) {

  type ProductId = String
  type PriceId = String

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env
  val STRIPE_URL = "https://api.stripe.com";
  val ws = env.wsClient

  def getStripeProductName(api: Api, plan: UsagePlan) =
    s"${api.name}::${api.currentVersion.value}/${plan.customName.getOrElse(plan.typeName)}"

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
      plan: UsagePlan,
      settingsId: ThirdPartyPaymentSettingsId
  ): EitherT[Future, AppError, PaymentSettings] =
    tenant.thirdPartyPaymentSettings.find(_.id == settingsId ) match {
      case Some(settings) =>
        settings match {
          case s: StripeSettings =>
            implicit val stripeSettings: StripeSettings = s
            createStripeProduct(
              api,
              plan
            )
        }
      case None =>
        EitherT.leftT[Future, PaymentSettings](
          AppError.ThirdPartyPaymentSettingsNotFound
        )
    }

  def postStripePrice(body: Map[String, String])(implicit s: StripeSettings): EitherT[Future, AppError, PriceId] = {
    EitherT
      .liftF(
        stripeClient("/v1/prices")
          .post(body)
      )
      .flatMap(res => {
        if (res.status == 200 || res.status == 201) {
          EitherT.rightT[Future, AppError]((res.json \ "id").as[PriceId])
        } else {
          EitherT.leftT[Future, PriceId](
            AppError.OtoroshiError(res.json.as[JsObject])
          )
        }
      })
  }

  def createStripePrice(
      plan: UsagePlan,
      productId: ProductId
  )(implicit
      stripeSettings: StripeSettings
  ): EitherT[Future, AppError, PaymentSettings] = {

    val planName: String = plan.customName.getOrElse(plan.typeName)

    val body = Map(
      "product" -> productId,
      "unit_amount" -> (plan.costPerMonth * 100).longValue.toString,
      "currency" -> plan.currency.code,
      "nickname" -> planName,
      "metadata[plan]" -> plan.id.value,
      "recurring[interval]" -> plan.billingDuration.unit.name.toLowerCase
    )

    plan match {
      case _: UsagePlan.QuotasWithLimits =>
        postStripePrice(body)
          .map(priceId => PaymentSettings.Stripe(stripeSettings.id, productId, StripePriceIds(basePriceId = priceId)))
      case p: UsagePlan.QuotasWithoutLimits =>
        for {
          baseprice <- postStripePrice(body)
          payperUsePrice <- postStripePrice(Map(
            "product" -> productId,
            "unit_amount" -> (p.costPerAdditionalRequest * 100).longValue.toString,
            "currency" -> plan.currency.code,
            "nickname" -> planName,
            "metadata[plan]" -> plan.id.value,
            "recurring[interval]" -> plan.billingDuration.unit.name.toLowerCase,
            "recurring[usage_type]" -> "metered",
            "recurring[aggregate_usage]" -> "sum",
          ))
        } yield PaymentSettings.Stripe(stripeSettings.id, productId, StripePriceIds(basePriceId = baseprice, additionalPriceId = payperUsePrice.some))
      case p: UsagePlan.PayPerUse =>
        for {
          baseprice <- postStripePrice(body)
          payperUsePrice <- postStripePrice(Map(
            "product" -> productId,
            "unit_amount" -> (p.costPerRequest * 100).longValue.toString,
            "currency" -> plan.currency.code,
            "nickname" -> planName,
            "metadata[plan]" -> plan.id.value,
            "recurring[interval]" -> plan.billingDuration.unit.name.toLowerCase,
            "recurring[usage_type]" -> "metered",
            "recurring[aggregate_usage]" -> "sum",
          ))
        } yield PaymentSettings.Stripe(stripeSettings.id, productId, StripePriceIds(basePriceId = baseprice, additionalPriceId = payperUsePrice.some))
      case _ => EitherT.leftT[Future, PaymentSettings](
        AppError.PlanUnauthorized
      )
    }
  }

  def createStripeProduct(
      api: Api,
      plan: UsagePlan
  )(implicit
      stripeSettings: StripeSettings
  ): EitherT[Future, AppError, PaymentSettings] = {

    val body = Map(
      "name" -> getStripeProductName(api, plan),
      "metadata[tenant]" -> api.tenant.value,
      "metadata[api]" -> api.id.value,
      "metadata[team]" -> api.team.value,
      "metadata[plan]" -> plan.id.value
    )

    EitherT
      .liftF(
        stripeClient("/v1/products")
          .post(body)
      )
      .flatMap(res => {
        if (res.status == 200 || res.status == 201) {
          val productId = (res.json \ "id").as[ProductId]
          createStripePrice(plan, productId)
        } else {
          EitherT.leftT[Future, PaymentSettings](
            AppError.OtoroshiError(res.json.as[JsObject])
          )
        }
      })
  }
}
