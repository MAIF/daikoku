package fr.maif.otoroshi.daikoku.ctrls

import cats.data.EitherT
import cats.implicits.catsSyntaxOptionId
import controllers.AppError
import fr.maif.otoroshi.daikoku.domain.ThirdPartyPaymentSettings.StripeSettings
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.utils.Cypher.encrypt
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import play.api.libs.json.{JsObject, Json}
import play.api.libs.ws.{WSAuthScheme, WSRequest}
import play.api.mvc.Result
import play.api.mvc.Results.Ok

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
    tenant.thirdPartyPaymentSettings.find(_.id == settingsId) match {
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

  def checkoutSubscription(tenant: Tenant,
                           subscriptionDemand: SubscriptionDemand,
                           step: SubscriptionDemandStep,
                          ): EitherT[Future, AppError, Result] = {
    for {
      api <- EitherT.fromOptionF(env.dataStore.apiRepo.forTenant(tenant).findByIdNotDeleted(subscriptionDemand.api), AppError.ApiNotFound)
      apiTeam <- EitherT.fromOptionF(env.dataStore.teamRepo.forTenant(tenant).findByIdNotDeleted(api.team), AppError.TeamNotFound)
      team <- EitherT.fromOptionF(env.dataStore.teamRepo.forTenant(tenant).findByIdNotDeleted(subscriptionDemand.team), AppError.TeamNotFound)
      user <- EitherT.fromOptionF(env.dataStore.userRepo.findByIdNotDeleted(subscriptionDemand.from), AppError.UserNotFound)
      plan <- EitherT.fromOption[Future](api.possibleUsagePlans.find(_.id == subscriptionDemand.plan), AppError.PlanNotFound)
      settings <- EitherT.fromOption[Future](plan.paymentSettings, AppError.ThirdPartyPaymentSettingsNotFound)
      checkoutUrl <- createSessionCheckout(tenant, api, team, apiTeam, subscriptionDemand, settings, user, step)
    } yield Ok(Json.obj("checkoutUrl" -> checkoutUrl))
  }

  def createSessionCheckout(tenant: Tenant,
                            api: Api,
                            team: Team,
                            apiTeam: Team,
                            demand: SubscriptionDemand,
                            settings: PaymentSettings,
                            user: User,
                            step: SubscriptionDemandStep) = {
    settings match {
      case p: PaymentSettings.Stripe =>
        implicit val stripeSettings: StripeSettings =
          tenant.thirdPartyPaymentSettings
            .find(_.id == p.thirdPartyPaymentSettingsId)
            .get
            .asInstanceOf[StripeSettings]
        createStripeCheckoutSession(
          tenant,
          api,
          team,
          apiTeam,
          demand,
          p,
          user,
          step
        )
    }
  }

  def postStripePrice(
      body: Map[String, String]
  )(implicit s: StripeSettings): EitherT[Future, AppError, PriceId] = {
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
          .map(priceId =>
            PaymentSettings.Stripe(
              stripeSettings.id,
              productId,
              StripePriceIds(basePriceId = priceId)
            )
          )
      case p: UsagePlan.QuotasWithoutLimits =>
        for {
          baseprice <- postStripePrice(body)
          payperUsePrice <- postStripePrice(
            Map(
              "product" -> productId,
              "unit_amount" -> (p.costPerAdditionalRequest * 100).longValue.toString,
              "currency" -> plan.currency.code,
              "nickname" -> planName,
              "metadata[plan]" -> plan.id.value,
              "recurring[interval]" -> plan.billingDuration.unit.name.toLowerCase,
              "recurring[usage_type]" -> "metered",
              "recurring[aggregate_usage]" -> "sum"
            )
          )
        } yield PaymentSettings.Stripe(
          stripeSettings.id,
          productId,
          StripePriceIds(
            basePriceId = baseprice,
            additionalPriceId = payperUsePrice.some
          )
        )
      case p: UsagePlan.PayPerUse =>
        for {
          baseprice <- postStripePrice(body)
          payperUsePrice <- postStripePrice(
            Map(
              "product" -> productId,
              "unit_amount" -> (p.costPerRequest * 100).longValue.toString,
              "currency" -> plan.currency.code,
              "nickname" -> planName,
              "metadata[plan]" -> plan.id.value,
              "recurring[interval]" -> plan.billingDuration.unit.name.toLowerCase,
              "recurring[usage_type]" -> "metered",
              "recurring[aggregate_usage]" -> "sum"
            )
          )
        } yield PaymentSettings.Stripe(
          stripeSettings.id,
          productId,
          StripePriceIds(
            basePriceId = baseprice,
            additionalPriceId = payperUsePrice.some
          )
        )
      case _ =>
        EitherT.leftT[Future, PaymentSettings](
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

  def createStripeCheckoutSession(
      tenant: Tenant,
      api: Api,
      team: Team,
      apiTeam: Team,
      subscriptionDemand: SubscriptionDemand,
      settings: PaymentSettings.Stripe,
      user: User,
      step: SubscriptionDemandStep
  )(implicit
      stripeSettings: StripeSettings
  ): EitherT[Future, AppError, String] = {

    val stepValidator = StepValidator(
      id = DatastoreId(IdGenerator.token),
      tenant = tenant.id,
      token = IdGenerator.token,
      step = step.id,
      subscriptionDemand = subscriptionDemand.id,
    )

    val cipheredValidationToken = encrypt(env.config.cypherSecret, stepValidator.token, tenant)

    val baseBody = Map(
      "metadata[tenant]" -> subscriptionDemand.tenant.value,
      "metadata[api]" -> subscriptionDemand.api.value,
      "metadata[team]" -> subscriptionDemand.team.value,
      "metadata[plan]" -> subscriptionDemand.plan.value,
      "metadata[subscription_demand]" -> subscriptionDemand.id.value,
      "line_items[0][price]" -> settings.priceIds.basePriceId,
      "line_items[0][quantity]" -> "1",
      "mode" -> "subscription",
      "customer_email" -> team.contact,
      "billing_address_collection " -> "required",
      "locale" -> user.defaultLanguage.orElse(tenant.defaultLanguage).getOrElse("en").toLowerCase,
      "success_url" -> env.getDaikokuUrl(
        tenant,
        s"/api/subscription/_validate?token=$cipheredValidationToken"
      ),
      "cancel_url" -> env.getDaikokuUrl(
        tenant,
        s"/${apiTeam.humanReadableId}/${api.humanReadableId}/${api.currentVersion}/pricing"
      )
    )

    val body = settings.priceIds.additionalPriceId
      .map(addPriceId => baseBody + ("line_items[1][price]" -> addPriceId))
      .getOrElse(baseBody)

    for {
      _ <- EitherT.liftF(env.dataStore.stepValidatorRepo.forTenant(tenant).save(stepValidator))


    } yield ???

    EitherT
      .liftF(
        stripeClient("/v1/checkout/sessions")
          .post(body)
      )
      .flatMap(res => {
        if (res.status == 200 || res.status == 201) {
          val url = (res.json \ "url").as[String]
          AppLogger.warn(url)
          //todo: handle real redirection to checkout page
          EitherT.pure(url)
        } else {
          EitherT.leftT[Future, String](
            AppError.OtoroshiError(res.json.as[JsObject])
          )
        }
      })
  }
}
