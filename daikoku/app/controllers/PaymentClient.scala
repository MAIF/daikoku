package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import cats.data.EitherT
import com.stripe.Stripe
import com.stripe.model.Product
import com.stripe.param.ProductCreateParams
import controllers.AppError
import fr.maif.otoroshi.daikoku.domain.ThirdPartyPaymentSettings.StripeSettings
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import play.api.libs.json.Json
import play.api.mvc.Result
import play.api.mvc.Results.{BadRequest, Ok}

import scala.concurrent.Future

class PaymentClient(
    env: Env
) {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  def createProduct(
      team: Team,
      tenant: Tenant,
      api: Api,
      plan: UsagePlan
  ): EitherT[Future, AppError, Product] =
    tenant.thirdPartyPaymentSettings.find(s => plan.paymentSettings.exists(ps => ps.thirdPartyPaymentSettingsId == s.id)) match {
      case Some(settings) =>
        settings.typeName match {
          case "Stripe" =>
            EitherT.liftF(createStripeProduct(
              settings.asInstanceOf[StripeSettings],
              team,
              api,
              plan
            ))
        }
      case None =>
        EitherT.leftT[Future, Product](AppError.ThirdPartyPaymentSettingsNotFound)
    }

  def createStripeProduct(
      settings: StripeSettings,
      team: Team,
      api: Api,
      plan: UsagePlan
  ): Future[Product] = {
    Stripe.apiKey = settings.secretKey

    val params = ProductCreateParams.builder
      .setName(
        s"${team.name} :: ${api.name} / ${plan.customName.getOrElse(plan.typeName)}"
      )
      .setDefaultPriceData(
        ProductCreateParams.DefaultPriceData.builder
          .setUnitAmount(plan.costPerMonth.longValue)
          .setCurrency(plan.currency.code)
          .setRecurring(
            ProductCreateParams.DefaultPriceData.Recurring.builder
              .setInterval(
                ProductCreateParams.DefaultPriceData.Recurring.Interval.MONTH
              )
              .build
          )
          .build
      )
      .addExpand("default_price")
      .build

    val product = Product.create(params)
    FastFuture.successful(product)
  }
}
