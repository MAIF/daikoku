package fr.maif.daikoku.controllers

import cats.data.{EitherT, OptionT}
import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.domain.ThirdPartyPaymentSettings.StripeSettings
import fr.maif.daikoku.domain.ThirdPartySubscriptionInformations.StripeSubscriptionInformations
import fr.maif.daikoku.domain._
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.logger.AppLogger
import fr.maif.daikoku.utils.Cypher.encrypt
import fr.maif.daikoku.utils.IdGenerator
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.pattern.after
import org.joda.time.DateTime
import play.api.libs.json.{JsArray, JsObject, JsValue, Json}
import play.api.libs.ws.DefaultBodyWritables.writeableOf_urlEncodedSimpleForm
import play.api.libs.ws.{WSAuthScheme, WSClient, WSRequest, WSResponse}
import play.api.mvc.Result
import play.api.mvc.Results.Ok

import scala.concurrent.duration.{DurationInt, FiniteDuration}
import scala.concurrent.{ExecutionContext, Future}

/** The oldest invoice Stripe still holds as unpaid for a subscription, which is
  * where the grace period starts counting.
  */
case class UnpaidInvoice(
    since: DateTime,
    amount: BigDecimal,
    currency: Currency
)

object UnpaidInvoice {
  val gracePeriodDays = 30
}

/** Where a subscription stands with the money, read from Stripe each time it
  * is shown. `nextCharge` is an estimate: usage keeps adding up until the
  * period closes.
  */
case class BillingStatus(
    cancelAt: Option[DateTime],
    periodEnd: Option[DateTime],
    nextCharge: Option[BigDecimal],
    unpaid: Option[UnpaidInvoice],
    cutAt: Option[DateTime],
    pricesOutdated: Boolean
)

class PaymentClient(
    env: Env
) {

  type ProductId = String
  type PriceId = String
  type CustomerId = String

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env
  val STRIPE_URL = env.config.stripeUrl
  val ws: WSClient = env.wsClient

  def getStripeProductName(api: Api, plan: UsagePlan) =
    s"${api.name}::${api.currentVersion.value}/${plan.customName}"

  private def stripeClient(
      path: String,
      idempotencyKey: Option[String] = None
  )(implicit stripeSettings: StripeSettings): WSRequest = {
    ws.url(s"$STRIPE_URL$path")
      .withHttpHeaders(
        Seq(
          "content-type" -> "application/x-www-form-urlencoded",
          "Stripe-Version" -> env.config.stripeApiVersion
        ) ++ idempotencyKey.map("Idempotency-Key" -> _)*
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

  def deleteThirdPartyProduct(
      paymentSettings: PaymentSettings,
      tenantId: TenantId
  ): EitherT[Future, AppError, JsValue] = {
    EitherT
      .fromOptionF(
        env.dataStore.tenantRepo.findByIdNotDeleted(tenantId),
        AppError.TenantNotFound
      )
      .flatMap(
        _.thirdPartyPaymentSettings
          .find(_.id == paymentSettings.thirdPartyPaymentSettingsId) match {
          case Some(settings) =>
            settings match {
              case s: StripeSettings =>
                implicit val stripeSettings: StripeSettings = s
                archiveStripeProduct(paymentSettings)
            }
          case None =>
            EitherT.leftT[Future, JsValue](
              AppError.ThirdPartyPaymentSettingsNotFound
            )
        }
      )
  }

  private def stripeSettingsOf(
      tenant: Tenant,
      settings: PaymentSettings
  ): Option[StripeSettings] =
    tenant.thirdPartyPaymentSettings
      .find(_.id == settings.thirdPartyPaymentSettingsId)
      .collect { case s: StripeSettings => s }

  private val defaultCurrency = Currency("EUR")

  private val zeroDecimalCurrencies = Set(
    "BIF",
    "CLP",
    "DJF",
    "GNF",
    "JPY",
    "KMF",
    "KRW",
    "MGA",
    "PYG",
    "RWF",
    "UGX",
    "VND",
    "VUV",
    "XAF",
    "XOF",
    "XPF"
  )

  private def toStripeAmount(
      amount: BigDecimal,
      currency: Option[Currency]
  ): String =
    if (
      zeroDecimalCurrencies.contains(
        currency.getOrElse(defaultCurrency).code.toUpperCase
      )
    ) amount.longValue.toString
    else (amount * 100).longValue.toString

  def fromStripeAmount(amount: Long, currency: Option[Currency]): BigDecimal =
    if (
      zeroDecimalCurrencies.contains(
        currency.getOrElse(defaultCurrency).code.toUpperCase
      )
    ) BigDecimal(amount)
    else BigDecimal(amount) / 100

  private def retryingOn429(
      call: => Future[WSResponse]
  ): Future[WSResponse] = {
    def attempt(remaining: Int, delay: FiniteDuration): Future[WSResponse] =
      call.flatMap {
        case response if response.status == 429 && remaining > 0 =>
          AppLogger.warn(
            s"[PAYMENT] stripe rate limited, retrying in ${delay.toMillis}ms"
          )
          after(delay, env.defaultActorSystem.scheduler)(
            attempt(remaining - 1, delay * 2)
          )
        case response => FastFuture.successful(response)
      }

    attempt(3, 200.milliseconds)
  }

  private def stripeErrorMessage(response: WSResponse): AppError =
    AppError.PaymentError(
      (response.json \ "error" \ "message")
        .asOpt[String]
        .getOrElse(response.body)
    )

  private def retireOnStripe(
      path: String,
      alreadyRetired: String,
      body: Map[String, String] = Map("active" -> "false")
  )(implicit settings: StripeSettings): EitherT[Future, AppError, JsValue] =
    EitherT(
      retryingOn429(stripeClient(path).post(body))
        .map {
          case response if response.status == 404 =>
            Right[AppError, JsValue](Json.obj("status" -> alreadyRetired))
          case response if response.status >= 400 =>
            Left[AppError, JsValue](stripeErrorMessage(response))
          case response => Right[AppError, JsValue](response.json)
        }
    )

  private def archiveStripePrices(
      paymentSettings: PaymentSettings
  )(implicit settings: StripeSettings): EitherT[Future, AppError, JsValue] = {
    val nothingToRetire = EitherT.pure[Future, AppError](Json.obj().as[JsValue])

    paymentSettings match {
      case PaymentSettings.Stripe(_, _, priceIds) =>
        for {
          baseResponse <- retireOnStripe(
            s"/v1/prices/${priceIds.basePriceId}",
            "already_inactive"
          )
          additionalResponse <- priceIds.additionalPriceId.fold(
            nothingToRetire
          )(additionalPriceId =>
            retireOnStripe(
              s"/v1/prices/$additionalPriceId",
              "already_inactive"
            )
          )
          meterResponse <- priceIds.meterId.fold(nothingToRetire)(meterId =>
            retireOnStripe(
              s"/v1/billing/meters/$meterId/deactivate",
              "already_deactivated",
              Map.empty
            )
          )
        } yield Json.obj(
          "basePrice" -> baseResponse,
          "additionnalPrice" -> additionalResponse,
          "meter" -> meterResponse
        )
    }
  }

  private def archiveStripeProduct(
      paymentSettings: PaymentSettings
  )(implicit settings: StripeSettings): EitherT[Future, AppError, JsValue] = {
    paymentSettings match {
      case PaymentSettings.Stripe(_, productId, _) =>
        for {
          pricesResponse <- archiveStripePrices(
            paymentSettings: PaymentSettings
          )
          productResponse <- retireOnStripe(
            s"/v1/products/$productId",
            "already_archived"
          )
        } yield Json.obj(
          "prices" -> pricesResponse,
          "product" -> productResponse
        )

    }
  }

  def checkoutSubscription(
      tenant: Tenant,
      subscriptionDemand: SubscriptionDemand,
      step: SubscriptionDemandStep,
      from: Option[String] = None
  ): EitherT[Future, AppError, Result] = {
    for {
      api <- EitherT.fromOptionF(
        env.dataStore.apiRepo
          .forTenant(tenant)
          .findByIdNotDeleted(subscriptionDemand.api),
        AppError.ApiNotFound
      )
      plan <- EitherT.fromOptionF(
        env.dataStore.usagePlanRepo
          .forTenant(tenant)
          .findByIdNotDeleted(subscriptionDemand.plan),
        AppError.PlanNotFound
      )
      apiTeam <- EitherT.fromOptionF(
        env.dataStore.teamRepo.forTenant(tenant).findByIdNotDeleted(api.team),
        AppError.TeamNotFound
      )
      team <- EitherT.fromOptionF(
        env.dataStore.teamRepo
          .forTenant(tenant)
          .findByIdNotDeleted(subscriptionDemand.team),
        AppError.TeamNotFound
      )
      _ <- EitherT.fromEither[Future](if (team.verified) {
        Right(())
      } else {
        Left(AppError.TeamNotVerified)
      })
      user <- EitherT.fromOptionF(
        env.dataStore.userRepo.findByIdNotDeleted(subscriptionDemand.from),
        AppError.UserNotFound()
      )
      settings <- EitherT.fromOption[Future](
        plan.paymentSettings,
        AppError.ThirdPartyPaymentSettingsNotFound
      )
      checkoutUrl <- createSessionCheckout(
        tenant,
        api,
        plan,
        team,
        apiTeam,
        subscriptionDemand,
        settings,
        user,
        step,
        from
      )
    } yield Ok(Json.obj("checkoutUrl" -> checkoutUrl))
  }

  def createSessionCheckout(
      tenant: Tenant,
      api: Api,
      plan: UsagePlan,
      team: Team,
      apiTeam: Team,
      demand: SubscriptionDemand,
      settings: PaymentSettings,
      user: User,
      step: SubscriptionDemandStep,
      from: Option[String] = None
  ) = {
    settings match {
      case p: PaymentSettings.Stripe =>
        stripeSettingsOf(tenant, p) match {
          case Some(s) =>
            implicit val stripeSettings: StripeSettings = s
            createStripeCheckoutSession(
              tenant,
              api,
              plan,
              team,
              apiTeam,
              demand,
              p,
              user,
              step,
              from
            )
          case None =>
            EitherT.leftT[Future, String](
              AppError.ThirdPartyPaymentSettingsNotFound
            )
        }
    }
  }

  def postStripePrice(
      body: Map[String, String],
      idempotencyKey: String
  )(implicit s: StripeSettings): EitherT[Future, AppError, PriceId] = {
    EitherT
      .liftF(
        retryingOn429(
          stripeClient("/v1/prices", idempotencyKey.some).post(body)
        )
      )
      .flatMap(res => {
        if (res.status == 200 || res.status == 201) {
          EitherT.rightT[Future, AppError]((res.json \ "id").as[PriceId])
        } else {
          EitherT.leftT[Future, PriceId](
            stripeErrorMessage(res)
          )
        }
      })
  }

  private def createStripeMeter(displayName: String, idempotencyKey: String)(
      implicit s: StripeSettings
  ): EitherT[Future, AppError, (String, String)] = {
    val eventName = s"daikoku_usage_${IdGenerator.token(24)}"
    val body = Map(
      "display_name" -> displayName,
      "event_name" -> eventName,
      "default_aggregation[formula]" -> "sum",
      "customer_mapping[type]" -> "by_id",
      "customer_mapping[event_payload_key]" -> "stripe_customer_id",
      "value_settings[event_payload_key]" -> "value"
    )
    EitherT(
      retryingOn429(
        stripeClient("/v1/billing/meters", idempotencyKey.some).post(body)
      )
        .map {
          case res if res.status == 200 || res.status == 201 =>
            Right[AppError, (String, String)](
              ((res.json \ "id").as[String], eventName)
            )
          case res =>
            Left[AppError, (String, String)](stripeErrorMessage(res))
        }
    )
  }

  /** `existingMeter` is passed when the prices of an already priced plan are
    * rebuilt after an amount change. Several prices may sit on one meter, and
    * reusing it keeps the event name stable, so usage keeps being reported
    * while subscribers still sit on the previous price.
    */
  def createStripePrice(
      plan: UsagePlan,
      productId: ProductId,
      operationKey: String,
      existingMeter: Option[(String, String)] = None
  )(implicit
      stripeSettings: StripeSettings
  ): EitherT[Future, AppError, PaymentSettings] = {
    (plan.costPerMonth, plan.currency) match {
      case (Some(costPerMonth), Some(currency)) =>
        val body = Map(
          "product" -> productId,
          "unit_amount" -> toStripeAmount(costPerMonth, plan.currency),
          "currency" -> currency.code,
          "nickname" -> plan.customName,
          "metadata[plan]" -> plan.id.value,
          "recurring[interval]" -> "month"
        )

        val meteredBody = Map(
          "product" -> productId,
          "currency" -> currency.code,
          "nickname" -> plan.customName,
          "metadata[plan]" -> plan.id.value,
          "recurring[interval]" -> "month",
          "recurring[usage_type]" -> "metered"
        )

        val usagePricing: Option[Map[String, String]] =
          (plan.costPerRequest, plan.maxPerMonth) match {
            case (Some(costPerRequest), Some(maxPerMonth)) =>
              (meteredBody ++ Map(
                "tiers_mode" -> "graduated",
                "billing_scheme" -> "tiered",
                "tiers[0][unit_amount]" -> "0",
                "tiers[0][up_to]" -> maxPerMonth.toString,
                "tiers[1][unit_amount]" -> toStripeAmount(
                  costPerRequest,
                  plan.currency
                ),
                "tiers[1][up_to]" -> "inf"
              )).some
            case (Some(costPerRequest), None) =>
              (meteredBody + ("unit_amount" -> toStripeAmount(
                costPerRequest,
                plan.currency
              ))).some
            case _ => None
          }

        usagePricing match {
          case Some(pricing) =>
            for {
              baseprice <- postStripePrice(body, s"$operationKey-price-base")
              meter <- existingMeter.fold(
                createStripeMeter(
                  s"${plan.customName} usage",
                  s"$operationKey-meter"
                )
              )(EitherT.pure[Future, AppError](_))
              (meterId, eventName) = meter
              payperUsePrice <- postStripePrice(
                pricing + ("recurring[meter]" -> meterId),
                s"$operationKey-price-usage"
              )
            } yield PaymentSettings.Stripe(
              stripeSettings.id,
              productId,
              StripePriceIds(
                basePriceId = baseprice,
                additionalPriceId = payperUsePrice.some,
                meterId = meterId.some,
                meterEventName = eventName.some
              )
            )
          case None =>
            postStripePrice(body, s"$operationKey-price-base")
              .map(priceId =>
                PaymentSettings.Stripe(
                  stripeSettings.id,
                  productId,
                  StripePriceIds(basePriceId = priceId)
                )
              )
        }
      case _ =>
        EitherT.leftT[Future, PaymentSettings](
          AppError.PaymentError("Basic payment information is not setted up")
        ) // todo: better error message

    }

  }

  /** Builds the prices carrying the new amounts, on the product and the meter
    * the plan already owns. The plan then points at them, so a new checkout
    * pays the new amount at once; subscribers keep the price attached to their
    * Stripe subscription until their cycle turns.
    */
  def renewStripePrices(
      tenant: Tenant,
      plan: UsagePlan,
      settings: PaymentSettings.Stripe
  ): EitherT[Future, AppError, PaymentSettings] =
    stripeSettingsOf(tenant, settings) match {
      case None =>
        EitherT.leftT[Future, PaymentSettings](
          AppError.ThirdPartyPaymentSettingsNotFound
        )
      case Some(s) =>
        implicit val stripeSettings: StripeSettings = s
        val existingMeter = (
          settings.priceIds.meterId,
          settings.priceIds.meterEventName
        ) match {
          case (Some(meterId), Some(eventName)) => (meterId, eventName).some
          case _                                => None
        }

        createStripePrice(
          plan,
          settings.productId,
          s"${plan.id.value}-${IdGenerator.token(16)}",
          existingMeter
        )
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

    val operationKey = s"${plan.id.value}-${IdGenerator.token(16)}"

    EitherT
      .liftF(
        retryingOn429(
          stripeClient("/v1/products", s"$operationKey-product".some).post(body)
        )
      )
      .flatMap(res => {
        if (res.status == 200 || res.status == 201) {
          val productId = (res.json \ "id").as[ProductId]
          createStripePrice(plan, productId, operationKey)
        } else {
          EitherT.leftT[Future, PaymentSettings](
            AppError.PaymentError(
              (res.json.as[JsObject] \ "error" \ "message").as[String]
            )
          )
        }
      })
  }

  def createStripeCheckoutSession(
      tenant: Tenant,
      api: Api,
      plan: UsagePlan,
      team: Team,
      apiTeam: Team,
      subscriptionDemand: SubscriptionDemand,
      settings: PaymentSettings.Stripe,
      user: User,
      step: SubscriptionDemandStep,
      from: Option[String] = None
  )(implicit
      stripeSettings: StripeSettings
  ): EitherT[Future, AppError, String] = {

    val stepValidator = StepValidator(
      id = DatastoreId(IdGenerator.token),
      tenant = tenant.id,
      token = IdGenerator.token,
      step = step.id,
      subscriptionDemand = subscriptionDemand.id
    )

    val cipheredValidationToken =
      encrypt(env.config.cypherSecret, stepValidator.token, tenant)

    createAndGetStripeClient(team)
      .flatMap(stripeCustomer => {
        val callback = from.getOrElse(
          env.getDaikokuUrl(
            tenant,
            s"/${apiTeam.humanReadableId}/${api.humanReadableId}/${api.currentVersion.value}/pricing"
          )
        )

        val baseBody = Map(
          "metadata[tenant]" -> subscriptionDemand.tenant.value,
          "metadata[api]" -> subscriptionDemand.api.value,
          "metadata[team]" -> subscriptionDemand.team.value,
          "metadata[plan]" -> subscriptionDemand.plan.value,
          "metadata[subscription_demand]" -> subscriptionDemand.id.value,
          "line_items[0][price]" -> settings.priceIds.basePriceId,
          "line_items[0][quantity]" -> "1",
          "mode" -> "subscription",
          "customer" -> stripeCustomer,
          "billing_address_collection" -> "required",
          "locale" -> user.defaultLanguage
            .orElse(tenant.defaultLanguage)
            .getOrElse("en")
            .toLowerCase,
          "success_url" -> env.getDaikokuUrl(
            tenant,
            "/informations?message=subscription-payment-received"
          ),
          "cancel_url" -> env.getDaikokuUrl(
            tenant,
            s"/api/subscription/_abort?token=$cipheredValidationToken&callback=$callback"
          )
        )

        val body = settings.priceIds.additionalPriceId
          .map(addPriceId => baseBody + ("line_items[1][price]" -> addPriceId))
          .getOrElse(baseBody)

        // Billing is monthly for everyone, anchored on the 1st. Stripe prorates
        // the partial first month on its own, proration_behavior defaulting to
        // create_prorations.
        val finalBody = body +
          ("subscription_data[billing_cycle_anchor_config][day_of_month]" -> "1")

        for {
          _ <- EitherT.liftF(
            env.dataStore.stepValidatorRepo
              .forTenant(tenant)
              .save(stepValidator)
          )
          r <-
            EitherT
              .liftF(
                stripeClient(
                  "/v1/checkout/sessions",
                  s"checkout-${subscriptionDemand.id.value}-${step.id.value}".some
                )
                  .post(finalBody)
              )
              .flatMap(res => {
                if (res.status == 200 || res.status == 201) {
                  val url = (res.json \ "url").as[String]
                  // todo: handle real redirection to checkout page
                  EitherT.pure[Future, AppError](url)
                } else {
                  val r: EitherT[Future, AppError, CustomerId] =
                    EitherT.leftT[Future, CustomerId](
                      stripeErrorMessage(res)
                    )
                  r
                }
              })
        } yield r
      })

  }

  def getSubscription(
      maybeSessionId: Option[String],
      settings: PaymentSettings,
      tenant: Tenant
  ): EitherT[Future, AppError, Option[ThirdPartySubscriptionInformations]] =
    settings match {
      case p: PaymentSettings.Stripe =>
        stripeSettingsOf(tenant, p) match {
          case Some(s) =>
            implicit val stripeSettings: StripeSettings = s
            getStripeSubscriptionInformations(maybeSessionId).map(
              _.map(informations =>
                informations: ThirdPartySubscriptionInformations
              )
            )
          case None =>
            EitherT.leftT[Future, Option[ThirdPartySubscriptionInformations]](
              AppError.ThirdPartyPaymentSettingsNotFound
            )
        }
    }

  def getStripeSubscriptionInformations(maybeSessionId: Option[String])(implicit
      stripeSettings: StripeSettings
  ): EitherT[Future, AppError, Option[StripeSubscriptionInformations]] = {
    maybeSessionId match {
      case None => EitherT.pure[Future, AppError](None)
      case Some(sessionId) =>
        for {
          session <- EitherT.liftF(
            stripeClient(s"/v1/checkout/sessions/$sessionId").get()
          )
          sub <- EitherT.fromOption[Future](
            (session.json \ "subscription").asOpt[String],
            AppError.PaymentError(
              s"checkout session $sessionId carries no subscription"
            )
          )
          subscription <- EitherT.liftF(
            stripeClient(s"/v1/subscriptions/$sub").get()
          )
          subscriptionId <- EitherT.fromOption[Future](
            (subscription.json \ "id").asOpt[String],
            AppError.PaymentError(s"stripe subscription $sub could not be read")
          )
        } yield StripeSubscriptionInformations(
          subscriptionId = subscriptionId,
          customerId = (subscription.json \ "customer").asOpt[String]
        ).some
    }
  }

  def syncWithThirdParty(
      consumption: ApiKeyConsumption,
      maybePaymentSettings: Option[PaymentSettings],
      maybeInfos: Option[ThirdPartySubscriptionInformations]
  ): Future[Either[AppError, Unit]] = {
    AppLogger.debug("*** SYNC CONSUmPTION with THIRD PARTY***")
    AppLogger.debug(Json.prettyPrint(consumption.asJson))
    AppLogger.debug(s"$maybePaymentSettings")
    AppLogger.debug(s"$maybeInfos")
    AppLogger.debug("**********************************************")

    (maybePaymentSettings, maybeInfos) match {
      case (Some(paymentSettings), Some(infos)) =>
        (for {
          tenant <- EitherT.fromOptionF(
            env.dataStore.tenantRepo.findByIdNotDeleted(consumption.tenant),
            AppError.TenantNotFound
          )
          setting <- EitherT.fromOption[Future](
            tenant.thirdPartyPaymentSettings
              .find(_.id == paymentSettings.thirdPartyPaymentSettingsId),
            AppError.ThirdPartyPaymentSettingsNotFound
          )
          _ <- EitherT((setting, infos, paymentSettings) match {
            case (
                  s: ThirdPartyPaymentSettings.StripeSettings,
                  i: StripeSubscriptionInformations,
                  p: PaymentSettings.Stripe
                ) =>
              implicit val stripeSettings: StripeSettings = s
              syncConsumptionWithStripe(consumption, i, p)
          })
        } yield ()).value
      case _ => FastFuture.successful(Right[AppError, Unit](()))
    }
  }

  /** `identifier` is what makes a redelivery harmless: Stripe keeps the first
    * event carrying it and rejects the next ones with a 400 that has no error
    * code, only this message.
    */
  private def postMeterEvent(
      eventName: String,
      customerId: String,
      value: Long,
      identifier: String
  )(implicit
      stripeSettings: StripeSettings
  ): Future[Either[AppError, Unit]] = {
    val body = Map(
      "event_name" -> eventName,
      "identifier" -> identifier,
      "payload[value]" -> value.toString,
      "payload[stripe_customer_id]" -> customerId,
      "timestamp" -> (System.currentTimeMillis() / 1000).toString
    )

    retryingOn429(stripeClient("/v1/billing/meter_events").post(body))
      .map {
        case res if res.status == 200 || res.status == 201 =>
          Right[AppError, Unit](())
        case res
            if res.status == 400 && (res.json \ "error" \ "message")
              .asOpt[String]
              .exists(_.startsWith("An event already exists with identifier")) =>
          Right[AppError, Unit](())
        case res => Left[AppError, Unit](stripeErrorMessage(res))
      }
  }

  private def syncConsumptionWithStripe(
      consumption: ApiKeyConsumption,
      informations: StripeSubscriptionInformations,
      settings: PaymentSettings.Stripe
  )(implicit
      stripeSettings: StripeSettings
  ): Future[Either[AppError, Unit]] = {
    val delta = consumption.hits - consumption.lastReportedHits
    AppLogger.debug(
      s"*** Sync with stripe ${consumption.id} - ${informations.customerId} - delta $delta (hits ${consumption.hits}, reported ${consumption.lastReportedHits})"
    )

    if (delta <= 0) {
      FastFuture.successful(Right[AppError, Unit](()))
    } else {
      (informations.customerId, settings.priceIds.meterEventName) match {
        case (Some(customerId), Some(eventName)) =>
          postMeterEvent(
            eventName,
            customerId,
            delta,
            s"${consumption.id.value}-${consumption.lastReportedHits}"
          )
        case _ =>
          AppLogger.warn(
            "[PAYMENT] metered sync skipped (legacy subscription without a meter)"
          )
          FastFuture.successful(Right[AppError, Unit](()))
      }
    }
  }

  /** What Stripe actually counted on the meter for that customer, over the
    * window. Meter events are aggregated asynchronously, so this lags behind
    * what was reported by a few seconds. Stripe only accepts a window aligned
    * on the hour, so the bounds are widened to the enclosing hours.
    */
  private def aggregatedUsageOnStripe(
      meterId: String,
      customerId: String,
      from: DateTime,
      to: DateTime
  )(implicit
      stripeSettings: StripeSettings
  ): EitherT[Future, AppError, BigDecimal] =
    EitherT(
      retryingOn429(
        stripeClient(s"/v1/billing/meters/$meterId/event_summaries")
          .withQueryStringParameters(
            "customer" -> customerId,
            "start_time" -> (from.hourOfDay
              .roundFloorCopy()
              .getMillis / 1000).toString,
            "end_time" -> (to.hourOfDay
              .roundCeilingCopy()
              .getMillis / 1000).toString
          )
          .get()
      ).map {
        case res if res.status == 200 =>
          Right[AppError, BigDecimal](
            (res.json \ "data")
              .as[Seq[JsValue]]
              .map(summary => (summary \ "aggregated_value").as[BigDecimal])
              .sum
          )
        case res => Left[AppError, BigDecimal](stripeErrorMessage(res))
      }
    )

  /** Compares what Daikoku believes it reported over the window with what
    * Stripe counted, and sends back the difference. Stripe acknowledges meter
    * events before aggregating them, so an accepted event can still be dropped
    * afterwards; this is what closes that gap. Answers the number of hits
    * resent.
    */
  def reconcileUsageWithThirdParty(
      tenant: Tenant,
      maybePaymentSettings: Option[PaymentSettings],
      maybeInfos: Option[ThirdPartySubscriptionInformations],
      reportedHits: Long,
      from: DateTime,
      to: DateTime
  ): Future[Either[AppError, Long]] =
    (maybePaymentSettings, maybeInfos) match {
      case (
            Some(p: PaymentSettings.Stripe),
            Some(i: StripeSubscriptionInformations)
          ) =>
        stripeSettingsOf(tenant, p) match {
          case None =>
            FastFuture.successful(
              Left[AppError, Long](AppError.ThirdPartyPaymentSettingsNotFound)
            )
          case Some(s) =>
            implicit val stripeSettings: StripeSettings = s
            (p.priceIds.meterId, p.priceIds.meterEventName, i.customerId) match {
              case (Some(meterId), Some(eventName), Some(customerId)) =>
                (for {
                  counted <- aggregatedUsageOnStripe(
                    meterId,
                    customerId,
                    from,
                    to
                  )
                  missing = reportedHits - counted.longValue
                  _ <-
                    if (missing <= 0) EitherT.pure[Future, AppError](())
                    else
                      EitherT(
                        postMeterEvent(
                          eventName,
                          customerId,
                          missing,
                          s"reconcile-${i.subscriptionId}-${from.toString("yyyyMM")}-$reportedHits"
                        )
                      )
                } yield Math.max(missing, 0L)).value
              case _ =>
                AppLogger.warn(
                  "[PAYMENT] reconciliation skipped (legacy subscription without a meter)"
                )
                FastFuture.successful(Right[AppError, Long](0L))
            }
        }
      case _ => FastFuture.successful(Right[AppError, Long](0L))
    }

  /** Moves a subscription onto the prices its plan now carries. Items are
    * updated in place: a second item sitting on the same meter would have
    * Stripe read the same usage twice. Answers whether anything was swapped.
    */
  def applyPlanPricesToSubscription(
      tenant: Tenant,
      subscription: ApiSubscription,
      plan: UsagePlan
  ): EitherT[Future, AppError, Boolean] =
    (plan.paymentSettings, subscription.thirdPartySubscriptionInformations) match {
      case (
            Some(p: PaymentSettings.Stripe),
            Some(i: StripeSubscriptionInformations)
          ) =>
        stripeSettingsOf(tenant, p) match {
          case None =>
            EitherT.leftT[Future, Boolean](
              AppError.ThirdPartyPaymentSettingsNotFound
            )
          case Some(s) =>
            implicit val stripeSettings: StripeSettings = s
            swapStripePrices(i.subscriptionId, p)
        }
      case _ => EitherT.pure[Future, AppError](false)
    }

  /** The items of a Stripe subscription whose price is no longer the one of the
    * plan, paired with the price they should carry. A metered item is the one
    * whose price reads a meter; the other one is the flat monthly subscription.
    */
  private def outdatedItems(
      items: Seq[JsValue],
      settings: PaymentSettings.Stripe
  ): Seq[(String, String)] =
    items.flatMap { item =>
      val itemId = (item \ "id").as[String]
      val priceId = (item \ "price" \ "id").as[String]
      val metered = (item \ "price" \ "recurring" \ "meter").asOpt[String]
      val expected =
        if (metered.isDefined) settings.priceIds.additionalPriceId
        else settings.priceIds.basePriceId.some

      expected.filter(_ != priceId).map(itemId -> _)
    }

  private def swapStripePrices(
      stripeSubscriptionId: String,
      settings: PaymentSettings.Stripe
  )(implicit
      stripeSettings: StripeSettings
  ): EitherT[Future, AppError, Boolean] =
    for {
      response <- EitherT.liftF(
        stripeClient(s"/v1/subscriptions/$stripeSubscriptionId").get()
      )
      items <- EitherT.fromEither[Future](
        if (response.status == 200)
          Right[AppError, Seq[JsValue]](
            (response.json \ "items" \ "data").as[Seq[JsValue]]
          )
        else Left[AppError, Seq[JsValue]](stripeErrorMessage(response))
      )
      changes = outdatedItems(items, settings)
      // Stripe holds the invoice of the period that just closed as a draft for
      // about an hour. Swapping then would change the amounts being computed,
      // so the swap waits, whether it was asked by the webhook or by the
      // nightly reconciliation.
      onDraft <-
        if (changes.isEmpty) EitherT.pure[Future, AppError](false)
        else
          (response.json \ "latest_invoice").asOpt[String] match {
            case None => EitherT.pure[Future, AppError](false)
            case Some(invoiceId) =>
              EitherT
                .liftF(stripeClient(s"/v1/invoices/$invoiceId").get())
                .map(invoice =>
                  (invoice.json \ "status").asOpt[String].contains("draft")
                )
          }
      swapped <-
        if (changes.isEmpty || onDraft) EitherT.pure[Future, AppError](false)
        else
          EitherT(
            retryingOn429(
              stripeClient(
                s"/v1/subscriptions/$stripeSubscriptionId",
                s"swap-$stripeSubscriptionId-${changes.map(_._2).mkString("-")}".some
              ).post(
                changes.zipWithIndex.flatMap {
                  case ((itemId, priceId), index) =>
                    Map(
                      s"items[$index][id]" -> itemId,
                      s"items[$index][price]" -> priceId
                    )
                }.toMap ++
                  // the swap happens right after the period closed, so there is
                  // nothing to prorate and Stripe must not invent a line
                  Map("proration_behavior" -> "none")
              )
            ).map {
              case res if res.status == 200 => Right[AppError, Boolean](true)
              case res => Left[AppError, Boolean](stripeErrorMessage(res))
            }
          )
    } yield swapped

  /** Stripe holds the truth about what is owed, so nothing about the grace
    * period is stored on our side: the age of the oldest open invoice is
    * recomputed at every pass.
    */
  def unpaidInvoiceOf(
      tenant: Tenant,
      subscription: ApiSubscription,
      plan: UsagePlan
  ): EitherT[Future, AppError, Option[UnpaidInvoice]] =
    (plan.paymentSettings, subscription.thirdPartySubscriptionInformations) match {
      case (
            Some(p: PaymentSettings.Stripe),
            Some(i: StripeSubscriptionInformations)
          ) =>
        stripeSettingsOf(tenant, p) match {
          case None =>
            EitherT.leftT[Future, Option[UnpaidInvoice]](
              AppError.ThirdPartyPaymentSettingsNotFound
            )
          case Some(s) =>
            implicit val stripeSettings: StripeSettings = s
            EitherT(
              stripeClient("/v1/invoices")
                .withQueryStringParameters(
                  "subscription" -> i.subscriptionId,
                  "status" -> "open",
                  "limit" -> "100"
                )
                .get()
                .map {
                  case res if res.status == 200 =>
                    Right[AppError, Option[UnpaidInvoice]](
                      (res.json \ "data")
                        .as[Seq[JsValue]]
                        .map(invoice =>
                          UnpaidInvoice(
                            since = new DateTime(
                              (invoice \ "created").as[Long] * 1000
                            ),
                            amount = fromStripeAmount(
                              (invoice \ "amount_due").asOpt[Long].getOrElse(0L),
                              plan.currency
                            ),
                            currency = plan.currency.getOrElse(defaultCurrency)
                          )
                        )
                        .sortBy(_.since.getMillis)
                        .headOption
                    )
                  case res =>
                    Left[AppError, Option[UnpaidInvoice]](
                      stripeErrorMessage(res)
                    )
                }
            )
        }
      case _ => EitherT.pure[Future, AppError](None)
    }

  private def nextChargeOf(
      stripeSubscriptionId: String,
      currency: Option[Currency]
  )(implicit stripeSettings: StripeSettings): Future[Option[BigDecimal]] =
    retryingOn429(
      stripeClient("/v1/invoices/create_preview")
        .post(Map("subscription" -> stripeSubscriptionId))
    ).map {
      case res if res.status == 200 =>
        (res.json \ "amount_due")
          .asOpt[Long]
          .map(fromStripeAmount(_, currency))
      case res =>
        AppLogger.warn(
          s"[PAYMENT] no invoice preview for stripe subscription $stripeSubscriptionId: ${stripeErrorMessage(res).getErrorMessage()}"
        )
        None
    }

  def billingStatusOf(
      tenant: Tenant,
      subscription: ApiSubscription,
      plan: UsagePlan
  ): EitherT[Future, AppError, Option[BillingStatus]] =
    (plan.paymentSettings, subscription.thirdPartySubscriptionInformations) match {
      case (
            Some(p: PaymentSettings.Stripe),
            Some(i: StripeSubscriptionInformations)
          ) =>
        stripeSettingsOf(tenant, p) match {
          case None =>
            EitherT.leftT[Future, Option[BillingStatus]](
              AppError.ThirdPartyPaymentSettingsNotFound
            )
          case Some(s) =>
            implicit val stripeSettings: StripeSettings = s
            for {
              response <- EitherT.liftF(
                stripeClient(s"/v1/subscriptions/${i.subscriptionId}").get()
              )
              stripeSubscription <- EitherT.fromEither[Future](
                if (response.status == 200)
                  Right[AppError, JsValue](response.json)
                else Left[AppError, JsValue](stripeErrorMessage(response))
              )
              nextCharge <- EitherT.liftF(
                nextChargeOf(i.subscriptionId, plan.currency)
              )
              unpaid <- unpaidInvoiceOf(tenant, subscription, plan)
            } yield {
              val items =
                (stripeSubscription \ "items" \ "data").as[Seq[JsValue]]
              val periodEnd = items
                .flatMap(item => (item \ "current_period_end").asOpt[Long])
                .headOption
                .map(seconds => new DateTime(seconds * 1000))
              val cancelAt =
                if ((stripeSubscription \ "cancel_at_period_end").asOpt[Boolean].contains(true))
                  (stripeSubscription \ "cancel_at")
                    .asOpt[Long]
                    .map(seconds => new DateTime(seconds * 1000))
                    .orElse(periodEnd)
                else None

              BillingStatus(
                cancelAt = cancelAt,
                periodEnd = periodEnd,
                nextCharge = nextCharge,
                unpaid = unpaid,
                cutAt = unpaid
                  .filter(_ => s.cutOnUnpaid)
                  .map(_.since.plusDays(UnpaidInvoice.gracePeriodDays)),
                pricesOutdated = outdatedItems(items, p).nonEmpty
              ).some
            }
        }
      case _ => EitherT.pure[Future, AppError](None)
    }

  /** Ends the subscription when the period the consumer has already paid for
    * runs out, rather than at once: the key keeps working until the last paid
    * day and the closing invoice still carries the usage. Passing false takes
    * the cancellation back. Answers the day it takes effect.
    */
  def cancelAtPeriodEnd(
      tenant: Tenant,
      subscription: ApiSubscription,
      plan: UsagePlan,
      cancel: Boolean
  ): EitherT[Future, AppError, DateTime] =
    (plan.paymentSettings, subscription.thirdPartySubscriptionInformations) match {
      case (
            Some(p: PaymentSettings.Stripe),
            Some(i: StripeSubscriptionInformations)
          ) =>
        stripeSettingsOf(tenant, p) match {
          case None =>
            EitherT.leftT[Future, DateTime](
              AppError.ThirdPartyPaymentSettingsNotFound
            )
          case Some(s) =>
            implicit val stripeSettings: StripeSettings = s
            EitherT(
              retryingOn429(
                stripeClient(s"/v1/subscriptions/${i.subscriptionId}")
                  .post(Map("cancel_at_period_end" -> cancel.toString))
              ).map {
                case res if res.status == 200 =>
                  val endsAt = (res.json \ "cancel_at")
                    .asOpt[Long]
                    .orElse(
                      (res.json \ "items" \ "data" \ 0 \ "current_period_end")
                        .asOpt[Long]
                    )
                    .map(seconds => new DateTime(seconds * 1000))
                    .getOrElse(DateTime.now())
                  Right[AppError, DateTime](endsAt)
                case res => Left[AppError, DateTime](stripeErrorMessage(res))
              }
            )
        }
      case _ =>
        EitherT.leftT[Future, DateTime](
          AppError.PaymentError("this subscription is not paid through Stripe")
        )
    }

  def deleteThirdPartySubscription(
      subscription: ApiSubscription,
      maybePaymentSettings: Option[PaymentSettings],
      maybeInfos: Option[ThirdPartySubscriptionInformations]
  ): EitherT[Future, AppError, JsValue] = {
    (maybePaymentSettings, maybeInfos) match {
      case (Some(paymentSettings), Some(infos)) =>
        for {
          tenant <- EitherT.fromOptionF(
            env.dataStore.tenantRepo.findByIdNotDeleted(subscription.tenant),
            AppError.TenantNotFound
          )
          setting <- EitherT.fromOption[Future](
            tenant.thirdPartyPaymentSettings
              .find(_.id == paymentSettings.thirdPartyPaymentSettingsId),
            AppError.EntityNotFound("Third party payment settings")
          )
          r <- (setting, infos) match {
            case (
                  s: ThirdPartyPaymentSettings.StripeSettings,
                  i: StripeSubscriptionInformations
                ) =>
              deleteStripeSubscription(i)(using s)
          }
        } yield r
      case _ => EitherT.pure[Future, AppError](Json.obj())
    }
  }

  private def deleteStripeSubscription(
      informations: StripeSubscriptionInformations
  )(implicit
      stripeSettings: StripeSettings
  ): EitherT[Future, AppError, JsValue] = {
    AppLogger.debug(
      s"[PAYMENT CLIENT] :: delete stripe sub :: ${informations.subscriptionId}"
    )

    EitherT.liftF(
      stripeClient(s"/v1/subscriptions/${informations.subscriptionId}")
        .withBody(
          Map(
//        "prorate" -> "true",
            "invoice_now" -> "true"
          )
        )
        .delete()
        .map(_.json)
    )
  }

  def toggleStateThirdPartySubscription(
      apiSubscription: ApiSubscription
  ): EitherT[Future, AppError, JsValue] = {
    for {
      plan <- EitherT.fromOptionF(
        env.dataStore.usagePlanRepo
          .forTenant(apiSubscription.tenant)
          .findByIdNotDeleted(apiSubscription.plan),
        AppError.PlanNotFound
      )
      tenant <- EitherT.fromOptionF(
        env.dataStore.tenantRepo.findByIdNotDeleted(apiSubscription.tenant),
        AppError.TenantNotFound
      )
      settings = plan.paymentSettings.flatMap(s =>
        tenant.thirdPartyPaymentSettings
          .find(_.id == s.thirdPartyPaymentSettingsId)
      )
      value <- settings match {
        case Some(p: StripeSettings) =>
          toggleStateStripeSubscription(apiSubscription)(using p)
        case None => EitherT.pure[Future, AppError](apiSubscription.asJson)
      }
    } yield value
  }

  private def toggleStateStripeSubscription(apiSubscription: ApiSubscription)(
      implicit stripeSettings: StripeSettings
  ): EitherT[Future, AppError, JsValue] = {
    apiSubscription.thirdPartySubscriptionInformations match {
      case Some(informations) =>
        informations match {
          case StripeSubscriptionInformations(subscriptionId, _) =>
            val body =
              if (apiSubscription.enabled)
                Map("pause_collection" -> "")
              else
                Map("pause_collection[behavior]" -> "void")

            EitherT.liftF(
              stripeClient(s"/v1/subscriptions/$subscriptionId")
                .post(body)
                .map(_.json)
            )
        }

      case None =>
        EitherT.left[JsValue](
          FastFuture.successful(AppError.EntityNotFound("stripe settings"))
        )
    }
  }

  def createAndGetStripeClient(team: Team)(implicit
      stripeSettings: StripeSettings
  ): EitherT[Future, AppError, CustomerId] = {
    if (!team.verified) {
      EitherT.leftT(AppError.Unauthorized)
    } else {
      val bodySearch = Map(
        "query" -> s"metadata['daikoku_id']:'${team.id.value}'"
      )

      val customerF = stripeClient("/v1/customers/search")
        .withBody(bodySearch)
        .get()
        .map(_.json)
        .map(r => (r \ "data").as[JsArray])
        .map(_.value)
        .flatMap {
          case seq if seq.isEmpty =>
            val bodyClient = Map(
              "email" -> team.contact,
              "name" -> team.name,
              "metadata[daikoku_id]" -> team.id.value
            )
            retryingOn429(
              stripeClient("/v1/customers", s"customer-${team.id.value}".some)
                .post(bodyClient)
            )
              .map(customer => (customer.json \ "id").as[CustomerId])
          case seq => FastFuture.successful((seq.head \ "id").as[CustomerId])
        }

      EitherT.liftF(customerF)

    }
  }

  def deleteStripeClient(
      team: Team
  )(implicit stripeSettings: StripeSettings): Future[Unit] = {
    val bodySearch = Map(
      "query" -> s"metadata['daikoku_id']:'${team.id.value}'"
    )

    stripeClient("/v1/customers/search")
      .withBody(bodySearch)
      .get()
      .map(_.json)
      .map(r => (r \ "data").as[JsArray])
      .map(_.value)
      .flatMap {
        case seq if seq.isEmpty => FastFuture.successful(())
        case seq =>
          stripeClient(s"/v1/customers/${(seq.head \ "id").as[CustomerId]}")
            .delete()
            .map(_ => ())
      }
  }

  def getStripeCustomer(team: Team)(implicit
      stripeSettings: StripeSettings
  ): EitherT[Future, AppError, CustomerId] = {
    if (!team.verified) {
      EitherT.leftT(AppError.Unauthorized)
    } else {
      val bodySearch = Map(
        "query" -> s"metadata['daikoku_id']:'${team.id.value}'"
      )

      EitherT(
        stripeClient("/v1/customers/search")
          .withBody(bodySearch)
          .get()
          .map(_.json)
          .map(r => (r \ "data").as[JsArray])
          .map(_.value)
          .map {
            case seq if seq.isEmpty =>
              Left(AppError.TeamNotFound)
            case seq => Right((seq.head \ "id").as[CustomerId])
          }
      )

    }
  }

  def getAllTeamInvoices(
      tenant: Tenant,
      plan: UsagePlan,
      team: Team,
      callback: String
  ): EitherT[Future, AppError, String] = {
    for {
      settings <- EitherT.fromOption[Future](
        plan.paymentSettings.flatMap(s =>
          tenant.thirdPartyPaymentSettings
            .find(_.id == s.thirdPartyPaymentSettingsId)
        ),
        AppError.EntityNotFound("payment settings")
      )
      portalUrl <- settings match {
        case p: StripeSettings =>
          getStripeInvoices(team, tenant, callback)(using p)
      }
    } yield portalUrl

  }

  /** No configuration is created here: the merchant's default portal
    * configuration applies, so their legal links, their branding and what a
    * customer may change are managed from their own Stripe dashboard. Creating
    * one per visit piled up objects on their account, and hardcoded example.com
    * legal URLs along the way.
    */
  def getStripeInvoices(team: Team, tenant: Tenant, callback: String)(implicit
      stripeSettings: StripeSettings
  ): EitherT[Future, AppError, String] = {

    for {
      customer <- getStripeCustomer(team)
      bodyPortal = Map(
        "customer" -> customer,
        "return_url" -> callback,
        "locale" -> tenant.defaultLanguage.map(_.toLowerCase).getOrElse("en")
      )
      r <- EitherT.liftF(
        stripeClient("/v1/billing_portal/sessions")
          .post(bodyPortal)
          .map(_.json)
      )
    } yield (r \ "url").as[String]
  }
}
