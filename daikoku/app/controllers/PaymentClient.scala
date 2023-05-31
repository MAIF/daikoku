package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import cats.data.{EitherT, OptionT}
import cats.implicits.catsSyntaxOptionId
import controllers.AppError
import fr.maif.otoroshi.daikoku.domain.ThirdPartyPaymentSettings.StripeSettings
import fr.maif.otoroshi.daikoku.domain.ThirdPartySubscriptionInformations.StripeSubscriptionInformations
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.utils.Cypher.encrypt
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import play.api.libs.json.{JsArray, JsObject, JsValue, Json}
import play.api.libs.ws.{WSAuthScheme, WSRequest}
import play.api.mvc.Result
import play.api.mvc.Results.Ok

import scala.concurrent.Future

class PaymentClient(
    env: Env
) {

  type ProductId = String
  type PriceId = String
  type CustomerId = String

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env
  val STRIPE_URL = "https://api.stripe.com";
  val ws = env.wsClient

  def getStripeProductName(api: Api, plan: UsagePlan) =
    s"${api.name}::${api.currentVersion.value}/${plan.customName.getOrElse(plan.typeName)}"


  private def stripeClient(
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

  def deleteThirdPartyProduct(paymentSettings: PaymentSettings,
                              tenantId: TenantId): EitherT[Future, AppError, JsValue] = {
    EitherT.fromOptionF(env.dataStore.tenantRepo.findByIdNotDeleted(tenantId), AppError.TenantNotFound)
      .flatMap(_.thirdPartyPaymentSettings.find(_.id == paymentSettings.thirdPartyPaymentSettingsId) match {
        case Some(settings) => settings match {
          case s: StripeSettings =>
            implicit val stripeSettings: StripeSettings = s
            deleteStripeProduct(paymentSettings)
        }
        case None => EitherT.leftT[Future, JsValue](AppError.ThirdPartyPaymentSettingsNotFound)
      })
  }

  private def deleteStripeProduct(paymentSettings: PaymentSettings)(implicit settings: StripeSettings): EitherT[Future, AppError, JsValue] = {
    paymentSettings match {
      case PaymentSettings.Stripe(_, productId, _) =>
        EitherT.liftF(stripeClient(s"/v1/products/$productId").delete().map(_.json))
    }
  }

  def checkoutSubscription(tenant: Tenant,
                           subscriptionDemand: SubscriptionDemand,
                           step: SubscriptionDemandStep,
                           from: Option[String] = None
                          ): EitherT[Future, AppError, Result] = {
    for {
      api <- EitherT.fromOptionF(env.dataStore.apiRepo.forTenant(tenant).findByIdNotDeleted(subscriptionDemand.api), AppError.ApiNotFound)
      apiTeam <- EitherT.fromOptionF(env.dataStore.teamRepo.forTenant(tenant).findByIdNotDeleted(api.team), AppError.TeamNotFound)
      team <- EitherT.fromOptionF(env.dataStore.teamRepo.forTenant(tenant).findByIdNotDeleted(subscriptionDemand.team), AppError.TeamNotFound)
      _ <- EitherT.fromEither[Future](if(team.verified) {
        Right(())
      } else {
        Left(AppError.TeamNotVerified)
      })
      user <- EitherT.fromOptionF(env.dataStore.userRepo.findByIdNotDeleted(subscriptionDemand.from), AppError.UserNotFound)
      plan <- EitherT.fromOption[Future](api.possibleUsagePlans.find(_.id == subscriptionDemand.plan), AppError.PlanNotFound)
      settings <- EitherT.fromOption[Future](plan.paymentSettings, AppError.ThirdPartyPaymentSettingsNotFound)
      checkoutUrl <- createSessionCheckout(tenant, api, team, apiTeam, subscriptionDemand, settings, user, step, from)
    } yield Ok(Json.obj("checkoutUrl" -> checkoutUrl))
  }

  def createSessionCheckout(tenant: Tenant,
                            api: Api,
                            team: Team,
                            apiTeam: Team,
                            demand: SubscriptionDemand,
                            settings: PaymentSettings,
                            user: User,
                            step: SubscriptionDemandStep,
                            from: Option[String] = None) = {
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
          step,
          from
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
              "currency" -> plan.currency.code,
              "nickname" -> planName,
              "metadata[plan]" -> plan.id.value,
              "recurring[interval]" -> plan.billingDuration.unit.name.toLowerCase,
              "recurring[usage_type]" -> "metered",
              "recurring[aggregate_usage]" -> "sum",
              "tiers_mode" -> "graduated",
              "billing_scheme" -> "tiered",
              "tiers[0][unit_amount]" -> "0",
              "tiers[0][up_to]" -> p.maxRequestPerMonth.getOrElse(0L).toString,
              "tiers[1][unit_amount]" -> (p.costPerAdditionalRequest * 100).longValue.toString,
              "tiers[1][up_to]" -> "inf"
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
      subscriptionDemand = subscriptionDemand.id,
    )

    val cipheredValidationToken = encrypt(env.config.cypherSecret, stepValidator.token, tenant)

    createAndGetStripeClient(team)
      .flatMap(stripeCustomer => {
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
          "billing_address_collection " -> "required",
          "locale" -> user.defaultLanguage.orElse(tenant.defaultLanguage).getOrElse("en").toLowerCase,
          "success_url" -> env.getDaikokuUrl(
            tenant,
            s"/api/subscription/_validate?token=$cipheredValidationToken&session_id={CHECKOUT_SESSION_ID}" //todo: add callback
          ),
          "cancel_url" -> from.getOrElse(env.getDaikokuUrl(
            tenant,
            s"/${apiTeam.humanReadableId}/${api.humanReadableId}/${api.currentVersion.value}/pricing"
          ))
        )

        val body = settings.priceIds.additionalPriceId
          .map(addPriceId => baseBody + ("line_items[1][price]" -> addPriceId))
          .getOrElse(baseBody)

        for {
          _ <- EitherT.liftF(env.dataStore.stepValidatorRepo.forTenant(tenant).save(stepValidator))
          r <- EitherT.liftF(
              stripeClient("/v1/checkout/sessions")
                .post(body)
            )
            .flatMap(res => {
              if (res.status == 200 || res.status == 201) {
                val url = (res.json \ "url").as[String]
                //todo: handle real redirection to checkout page
                EitherT.pure[Future, AppError](url)
              } else {
                val r: EitherT[Future, AppError, CustomerId] = EitherT.leftT[Future, CustomerId](AppError.OtoroshiError(res.json.as[JsObject]))
                r
              }
            })
        } yield r
      })

  }

  def getSubscription(maybeSessionId: Option[String], settings: PaymentSettings, tenant: Tenant): Future[Option[ThirdPartySubscriptionInformations]] =
    settings match {
      case p: PaymentSettings.Stripe =>
        implicit val stripeSettings: StripeSettings = tenant.thirdPartyPaymentSettings
            .find(_.id == p.thirdPartyPaymentSettingsId)
            .get
            .asInstanceOf[StripeSettings]
        getStripeSubscriptionInformations(maybeSessionId)
    }

  def getStripeSubscriptionInformations(maybeSessionId: Option[String])(implicit stripeSettings: StripeSettings): Future[Option[StripeSubscriptionInformations]] = {
    maybeSessionId match {
      case Some(sessionId) =>
        for {
          session <- stripeClient(s"/v1/checkout/sessions/$sessionId").get()
          sub = (session.json \ "subscription").as[String]
          subscription <- stripeClient(s"/v1/subscriptions/$sub").get()
        } yield {
          StripeSubscriptionInformations(
            subscriptionId = (subscription.json \ "id").as[String],
            primaryElementId = (subscription.json \ "items").asOpt[JsObject]
              .flatMap(items => (items \ "data").as[JsArray].value
                .find(element => (element \ "plan" \ "usage_type").as[String] != "metered")
                .map(element => (element \ "id").as[String])),
            meteredElementId = (subscription.json \ "items").asOpt[JsObject]
              .flatMap(items => (items \ "data").as[JsArray].value
                .find(element => (element \ "plan" \ "usage_type").as[String] == "metered")
                .map(element => (element \ "id").as[String]))
          ).some
        }
      case None => FastFuture.successful(None)
    }
  }

  def syncWithThirdParty(consumption: ApiKeyConsumption, plan: UsagePlan): Future[Unit] = {
    plan.paymentSettings match {
      case Some(paymentSettings) =>
        (for {
        subscription <- OptionT(env.dataStore.apiSubscriptionRepo.forTenant(consumption.tenant).findOneNotDeleted(Json.obj("apiKey.clientId" -> consumption.clientId)))
        tenant <- OptionT(env.dataStore.tenantRepo.findByIdNotDeleted(consumption.tenant))
        setting <- OptionT.fromOption[Future](tenant.thirdPartyPaymentSettings.find(_.id == paymentSettings.thirdPartyPaymentSettingsId))
      } yield {
        setting match {
          case s: ThirdPartyPaymentSettings.StripeSettings =>
            implicit val stripeSettings: StripeSettings = s
            syncConsumptionWithStripe(subscription, consumption)
          case _ =>
            FastFuture.successful(())
        }
      }).value.map(_ => ())
      case None => FastFuture.successful(())
    }
  }

  private def syncConsumptionWithStripe(apiSubscription: ApiSubscription, consumption: ApiKeyConsumption)(implicit stripeSettings: StripeSettings) = {

    apiSubscription.thirdPartySubscriptionInformations match {
      case Some(informations) => informations match {
        case StripeSubscriptionInformations(_, _, meteredElementId) if meteredElementId.isDefined =>
          val body = Map(
            "quantity" -> consumption.hits.toString,
            "timestamp" -> (consumption.from.getMillis / 1000).toString
          )

          stripeClient(s"/v1/subscription_items/${meteredElementId.get}/usage_records")
            .post(body)
      }

      case None => FastFuture.successful(())
    }
  }

  def deleteThirdPartySubscription(apiSubscription: ApiSubscription): EitherT[Future, AppError, JsValue] = {
    for {
      api <- EitherT.fromOptionF(env.dataStore.apiRepo.forTenant(apiSubscription.tenant).findById(apiSubscription.api), AppError.ApiNotFound)
      plan <- EitherT.fromOption[Future](api.possibleUsagePlans.find(_.id == apiSubscription.plan), AppError.PlanNotFound)
      tenant <- EitherT.fromOptionF(env.dataStore.tenantRepo.findByIdNotDeleted(api.tenant), AppError.TenantNotFound)
      settings <- EitherT.fromOption[Future](plan.paymentSettings.flatMap(s => tenant.thirdPartyPaymentSettings.find(_.id == s.thirdPartyPaymentSettingsId)), AppError.EntityNotFound("payment settings"))
      result <- settings match {
        case p: StripeSettings => deleteStripeSubscription(apiSubscription)(p)
      }
    } yield result
  }

  private def deleteStripeSubscription(apiSubscription: ApiSubscription)(implicit stripeSettings: StripeSettings): EitherT[Future, AppError, JsValue] = {
    AppLogger.debug(s"[PAYMENT CLIENT] :: delete sub :: ${apiSubscription.id}")
    apiSubscription.thirdPartySubscriptionInformations match {
      case Some(informations) => informations match {
        case StripeSubscriptionInformations(subscriptionId, _, _) =>
          AppLogger.debug(s"[PAYMENT CLIENT] :: delete stripe sub :: $subscriptionId")
          EitherT.liftF(stripeClient(s"/v1/subscriptions/$subscriptionId")
            .delete()
            .map(_.json))
      }

      case None => EitherT.left[JsValue](FastFuture.successful(AppError.EntityNotFound("stripe settings")))
    }
  }

  def toggleStateThirdPartySubscription(apiSubscription: ApiSubscription): EitherT[Future, AppError, JsValue] = {
    for {
      api <- EitherT.fromOptionF(env.dataStore.apiRepo.forTenant(apiSubscription.tenant).findById(apiSubscription.api), AppError.ApiNotFound)
      plan <- EitherT.fromOption[Future](api.possibleUsagePlans.find(_.id == apiSubscription.plan), AppError.PlanNotFound)
      tenant <- EitherT.fromOptionF(env.dataStore.tenantRepo.findByIdNotDeleted(api.tenant), AppError.TenantNotFound)
      settings <- EitherT.fromOption[Future](plan.paymentSettings.flatMap(s => tenant.thirdPartyPaymentSettings.find(_.id == s.thirdPartyPaymentSettingsId)), AppError.EntityNotFound("payment settings"))
      value <- settings match {
        case p: StripeSettings => toggleStateStripeSubscription(apiSubscription)(p)
      }
    } yield value
  }

  private def toggleStateStripeSubscription(apiSubscription: ApiSubscription)(implicit stripeSettings: StripeSettings): EitherT[Future, AppError, JsValue] = {
    apiSubscription.thirdPartySubscriptionInformations match {
      case Some(informations) => informations match {
        case StripeSubscriptionInformations(subscriptionId, _, _) =>
          val body = if (apiSubscription.enabled)
            Map("pause_collection" -> "")
          else
            Map("pause_collection[behavior]" -> "void")

          EitherT.liftF(stripeClient(s"/v1/subscriptions/$subscriptionId")
            .post(body).map(_.json))
      }

      case None => EitherT.left[JsValue](FastFuture.successful(AppError.EntityNotFound("stripe settings")))
    }
  }

  def createAndGetStripeClient(team: Team)(implicit stripeSettings: StripeSettings): EitherT[Future, AppError, CustomerId] = {
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
            stripeClient("/v1/customers")
              .post(bodyClient)
              .map(customer => (customer.json \ "id").as[CustomerId])
          case seq => FastFuture.successful((seq.head \ "id").as[CustomerId])
        }

      EitherT.liftF(customerF)

    }
  }
  def getStripeCustomer(team: Team)(implicit stripeSettings: StripeSettings): EitherT[Future, AppError, CustomerId] = {
    if (!team.verified) {
      EitherT.leftT(AppError.Unauthorized)
    } else {
      val bodySearch = Map(
        "query" -> s"metadata['daikoku_id']:'${team.id.value}'"
      )

      EitherT(stripeClient("/v1/customers/search")
        .withBody(bodySearch)
        .get()
        .map(_.json)
        .map(r => (r \ "data").as[JsArray])
        .map(_.value)
        .map {
          case seq if seq.isEmpty =>
            Left(AppError.TeamNotFound)
          case seq => Right((seq.head \ "id").as[CustomerId])
        })

    }
  }

  def getAllTeamInvoices(tenant: Tenant, plan: UsagePlan, team: Team, callback: String): EitherT[Future, AppError, String] = {
    for {
      settings <- EitherT.fromOption[Future](plan.paymentSettings.flatMap(s => tenant.thirdPartyPaymentSettings.find(_.id == s.thirdPartyPaymentSettingsId)), AppError.EntityNotFound("payment settings"))
      portalUrl <- settings match {
        case p: StripeSettings => getStripeInvoices(team, tenant, callback)(p)
      }
    } yield portalUrl

  }

  def getStripeInvoices(team: Team, tenant: Tenant, callback: String)(implicit stripeSettings: StripeSettings): EitherT[Future, AppError, String] = {

    for {
      customer <- getStripeCustomer(team)
      bodyConf = Map(
        "features[subscription_cancel][enabled]" -> "false",
        "features[subscription_pause][enabled]" -> "false",
        "features[invoice_history][enabled]" -> "true",
        "features[payment_method_update][enabled]" -> "true",
        "features[customer_update][enabled]" -> "true",
        "features[customer_update][allowed_updates][0]" -> "name",
        "features[customer_update][allowed_updates][1]" -> "email",
        "features[customer_update][allowed_updates][2]" -> "address",
        "features[customer_update][allowed_updates][3]" -> "phone",
        "features[customer_update][allowed_updates][4]" -> "tax_id",
        "business_profile[privacy_policy_url]" -> "https://example.com/privacy", //todo
        "business_profile[terms_of_service_url]" -> "https://example.com/privacy" //todo
      )
      conf <- EitherT.liftF(stripeClient("/v1/billing_portal/configurations").post(bodyConf).map(_.json))
      bodyPortal = Map(
        "customer" -> customer,
        "return_url" -> callback,
        "configuration" -> (conf \ "id").as[String],
        "locale" -> tenant.defaultLanguage.map(_.toLowerCase).getOrElse("en")
      )
      r <- EitherT.liftF(stripeClient("/v1/billing_portal/sessions").post(bodyPortal).map(_.json))
    } yield (r \ "url").as[String]
  }
}
