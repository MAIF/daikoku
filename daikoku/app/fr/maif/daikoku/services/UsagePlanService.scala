package fr.maif.daikoku.services

import cats.data.EitherT
import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.controllers.{AppError, PaymentClient}
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.jobs.OtoroshiSynchronizerJob
import fr.maif.daikoku.logger.AppLogger
import fr.maif.daikoku.utils.{IdGenerator, Translator}
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.{Sink, Source}
import org.joda.time.DateTime
import play.api.i18n.MessagesApi
import play.api.libs.json.*

import scala.concurrent.{ExecutionContext, Future}

class UsagePlanService(
    env: Env,
    apiService: ApiService,
    otoroshiSynchronisator: OtoroshiSynchronizerJob,
    deletionService: DeletionService,
    paymentClient: PaymentClient,
    billingNotificationService: BillingNotificationService,
    translator: Translator,
    messagesApi: MessagesApi
) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env
  implicit val tr: Translator = translator
  implicit val m: MessagesApi = messagesApi

  def createPlan(
      tenant: Tenant,
      team: Team,
      api: Api,
      newPlan: UsagePlan
  ): EitherT[Future, AppError, (Api, UsagePlan)] = {
    for {
      _ <- newPlan.checkAuthorizedEntities(team)
      updatedPlan <- addProcess(api, newPlan)
      plans <- EitherT.liftF(
        env.dataStore.usagePlanRepo.findByApi(tenant.id, api)
      )
      _ <- updatedPlan.checkCustomName(tenant, plans, api.visibility)
      updatedApi = api.copy(possibleUsagePlans =
        api.possibleUsagePlans :+ updatedPlan.id
      )
      _ <- EitherT.liftF[Future, AppError, Boolean](
        env.dataStore.apiRepo.forTenant(tenant).save(updatedApi)
      )
      _ <- EitherT.liftF[Future, AppError, Boolean](
        env.dataStore.usagePlanRepo.forTenant(tenant).save(updatedPlan)
      )
    } yield (updatedApi, updatedPlan)
  }

  def updatePlan(
      tenant: Tenant,
      user: User,
      team: Team,
      api: Api,
      oldPlan: UsagePlan,
      newPlan: UsagePlan
  )(implicit language: String): EitherT[Future, AppError, UsagePlan] = {
    for {
      _ <- newPlan.checkAuthorizedEntities(team)
      plans <- EitherT.liftF(
        env.dataStore.usagePlanRepo.findByApi(tenant.id, api)
      )
      _ <- newPlan.checkCustomName(tenant, plans, api.visibility)
      _ <- EitherT.liftF(
        env.dataStore.subscriptionDemandRepo
          .changeState(
            tenant.id,
            api.id,
            oldPlan.id,
            SubscriptionDemandState.InProgress,
            SubscriptionDemandState.Blocked
          )
      )
      checkedPlan <- getPlanAndCheckIt(tenant, oldPlan, newPlan)
      handledUpdatedPlan <-
        handleVisibilityToggling(tenant, oldPlan, checkedPlan, api)
      processedPlan <- handleProcess(oldPlan, handledUpdatedPlan, api)
      updatedPlan <- renewPrices(tenant, api, oldPlan, processedPlan)
      _ <- EitherT.liftF(
        env.dataStore.usagePlanRepo.forTenant(tenant).save(updatedPlan)
      )
      _ <- EitherT.liftF(
        otoroshiSynchronisator.runSync(updatedPlan.id, tenant)
      )
      _ <- moveSubscribersToNewPrices(tenant, oldPlan, updatedPlan, api)
      _ <- notifyPriceChange(tenant, oldPlan, updatedPlan, api)
      _ <- runDemandUpdate(tenant, user, oldPlan, updatedPlan, api)
      // FIXME: attention, peut etre il y en a qui sont blocked de base
      _ <- EitherT.liftF(
        env.dataStore.subscriptionDemandRepo
          .changeState(
            tenant.id,
            api.id,
            oldPlan.id,
            SubscriptionDemandState.Blocked,
            SubscriptionDemandState.InProgress
          )
      )
    } yield updatedPlan
  }

  def deletePlan(
      tenant: Tenant,
      api: Api,
      plan: UsagePlan
  ): EitherT[Future, AppError, Unit] = {
    deletionService.deleteUsagePlanByQueue(
      planId = plan.id,
      apiId = api.id,
      tenantId = tenant.id
    )
  }

  private def addProcess(
      api: Api,
      plan: UsagePlan
  ): EitherT[Future, AppError, UsagePlan] = {
    val updatedPlan: UsagePlan = (
      plan.otoroshiTarget.forall(
        _.apikeyCustomization.customMetadata.isEmpty
      ),
      plan.paymentSettings
    ) match {
      case (true, None) => plan
      case (true, Some(settings)) =>
        plan.addSubscriptionStep(
          ValidationStep.Payment(
            IdGenerator.token(32),
            settings.thirdPartyPaymentSettingsId
          )
        )
      case (false, Some(settings)) =>
        plan
          .addSubscriptionStep(
            ValidationStep.Payment(
              IdGenerator.token(32),
              settings.thirdPartyPaymentSettingsId
            )
          )
          .addSubscriptionStep(
            ValidationStep.TeamAdmin(IdGenerator.token(32), api.team),
            0.some
          )
      case (false, None) =>
        plan.addSubscriptionStep(
          ValidationStep.TeamAdmin(IdGenerator.token(32), api.team),
          0.some
        )
    }
    EitherT.pure[Future, AppError](updatedPlan)
  }

  private def amountsChanged(oldPlan: UsagePlan, newPlan: UsagePlan): Boolean =
    oldPlan.costPerMonth != newPlan.costPerMonth ||
      oldPlan.costPerRequest != newPlan.costPerRequest ||
      oldPlan.includedRequestsPerMonth != newPlan.includedRequestsPerMonth

  private def renewPrices(
      tenant: Tenant,
      api: Api,
      oldPlan: UsagePlan,
      newPlan: UsagePlan
  ): EitherT[Future, AppError, UsagePlan] =
    newPlan.paymentSettings match {
      case Some(settings: PaymentSettings.Stripe)
          if amountsChanged(oldPlan, newPlan) =>
        for {
          renewed <- paymentClient.renewStripePrices(tenant, newPlan, settings)
          subscriptions <- EitherT.liftF[Future, AppError, Seq[ApiSubscription]](
            env.dataStore.apiSubscriptionRepo
              .findByApiAndPlan(tenant.id, api.id, newPlan.id)
          )
          openDemands <- EitherT.liftF[Future, AppError, Seq[SubscriptionDemand]](
            env.dataStore.subscriptionDemandRepo.findByStates(
              tenant.id,
              Seq(
                SubscriptionDemandState.InProgress,
                SubscriptionDemandState.Waiting,
                SubscriptionDemandState.Blocked
              ),
              plan = newPlan.id.some
            )
          )
          _ <-
            if (subscriptions.isEmpty && openDemands.isEmpty) {
              paymentClient.retireStripePrices(tenant, settings)
            } else {
              EitherT.pure[Future, AppError](())
            }
        } yield newPlan.copy(paymentSettings = renewed.some)
      case _ => EitherT.pure[Future, AppError](newPlan)
    }

  /** The new price is live at once for the site and for new subscriptions.
    * Current subscribers keep paying the old one until the 1st, when the cycle
    * turns, so they are told the date rather than the change.
    */
  /** The flat fee of each subscriber moves to the new price at once, so the
    * next month is charged at the announced amount. Its usage price follows on
    * its own, from the first period started under the new price.
    */
  private def moveSubscribersToNewPrices(
      tenant: Tenant,
      oldPlan: UsagePlan,
      updatedPlan: UsagePlan,
      api: Api
  ): EitherT[Future, AppError, Unit] =
    if (
      updatedPlan.paymentSettings.isEmpty ||
      !amountsChanged(oldPlan, updatedPlan)
    ) EitherT.pure[Future, AppError](())
    else
      EitherT.liftF(
        env.dataStore.apiSubscriptionRepo
          .findByApiAndPlan(tenant.id, api.id, updatedPlan.id)
          .flatMap(subscriptions =>
            Future.sequence(
              subscriptions
                .filterNot(_.blockedBy.contains(SubscriptionBlockReason.Ended))
                .map(subscription =>
                  paymentClient
                    .applyPlanPricesToSubscription(tenant, subscription, updatedPlan)
                    .value
                    .map(_.left.map(_.getErrorMessage()))
                    .recover { case error => Left(error.getMessage) }
                    // the nightly reconciliation moves it on its next pass
                    .map(_.left.foreach(message =>
                      AppLogger.error(
                        s"[stripe] subscription ${subscription.id.value} not moved onto the new prices: $message"
                      )
                    ))
                )
            )
          )
          .map(_ => ())
      )

  private def notifyPriceChange(
      tenant: Tenant,
      oldPlan: UsagePlan,
      updatedPlan: UsagePlan,
      api: Api
  ): EitherT[Future, AppError, Unit] =
    if (
      updatedPlan.paymentSettings.isEmpty ||
      !amountsChanged(oldPlan, updatedPlan)
    ) EitherT.pure[Future, AppError](())
    else
      EitherT.liftF(
        env.dataStore.apiSubscriptionRepo
          .findByApiAndPlan(tenant.id, api.id, updatedPlan.id)
          .flatMap(subscriptions =>
            Future
              .sequence(
                subscriptions.map(subscription =>
                  billingNotificationService.priceChangeScheduled(
                    tenant,
                    subscription,
                    updatedPlan.costPerMonth.getOrElse(BigDecimal(0)),
                    updatedPlan.costPerRequest,
                    updatedPlan.currency.getOrElse(Currency("EUR")),
                    DateTime
                      .now()
                      .plusMonths(1)
                      .withDayOfMonth(1)
                      .withTimeAtStartOfDay()
                  )
                )
              )
              .map(_ => ())
          )
      )

  def getPlanAndCheckIt(
      tenant: Tenant,
      oldPlan: UsagePlan,
      newPlan: UsagePlan
  ): EitherT[Future, AppError, UsagePlan] = {
    //payment settings carry the Stripe ids, they are never edited by hand: the
    //stored ones win over whatever the client sends back
    val candidate = oldPlan.paymentSettings.fold(newPlan)(settings =>
      newPlan.copy(paymentSettings = settings.some)
    )

    oldPlan match {
      // it's forbidden to update otoroshi target, must use migration API instead
      case _
          if oldPlan.otoroshiTarget.isDefined && oldPlan.otoroshiTarget
            .map(_.otoroshiSettings) != candidate.otoroshiTarget.map(
            _.otoroshiSettings
          ) =>
        EitherT.leftT(
          AppError.Forbidden(
            "The Otoroshi settings of a plan cannot change: use the migration API"
          )
        )
      //amounts may change, the currency may not: Stripe freezes it on a price,
      //so changing it would mean cancelling every subscriber and having them subscribe anew
      case _
          if oldPlan.paymentSettings.isDefined && oldPlan.currency != candidate.currency =>
        EitherT.leftT(
          AppError.PaymentError(
            "the currency of a priced plan cannot be changed"
          )
        )
      case _
          if candidate.paymentSettings.isDefined &&
            !candidate.subscriptionProcess.steps.lastOption
              .exists(_.name == "payment") =>
        EitherT.leftT(
          AppError.PaymentError(
            "the payment step of a priced plan must be the last one"
          )
        )
      case _
          if candidate.includedRequestsPerMonth.exists(included =>
            candidate.maxPerMonth.exists(_ < included)
          ) =>
        EitherT.leftT(
          AppError.PaymentError(
            "the included requests of a plan cannot exceed its monthly limit"
          )
        )
      case _
          if !tenant.aggregationApiKeysSecurity.exists(identity) &&
            candidate.aggregationApiKeysSecurity.exists(identity) =>
        EitherT.leftT(AppError.SubscriptionAggregationDisabled)
      case _ if oldPlan.visibility == UsagePlanVisibility.Admin =>
        EitherT.pure(
          oldPlan.copy(
            otoroshiTarget = candidate.otoroshiTarget,
            allowMultipleKeys = candidate.allowMultipleKeys,
            autoRotation = candidate.autoRotation
          )
        )
      case _ if newPlan.visibility == UsagePlanVisibility.Admin =>
        EitherT.leftT(AppError.Forbidden("A plan cannot become an admin plan"))
      case _ => EitherT.pure(candidate)
    }
  }

  private def handleVisibilityToggling(
      tenant: Tenant,
      oldPlan: UsagePlan,
      plan: UsagePlan,
      api: Api
  ): EitherT[Future, AppError, UsagePlan] = {
    oldPlan match {
      case _ if plan.visibility != oldPlan.visibility =>
        plan.visibility match {
          case UsagePlanVisibility.Public =>
            EitherT.pure(plan.removeAllAuthorizedTeams())
          case UsagePlanVisibility.Private =>
            val future: Future[Either[AppError, UsagePlan]] =
              env.dataStore.apiSubscriptionRepo
                .findByApiAndPlan(tenant.id, api.id, plan.id)
                .map(subs => subs.map(_.team).distinct)
                .map(x => Right(plan.addAutorizedTeams(x)))
            val value: EitherT[Future, AppError, UsagePlan] =
              EitherT(future)
            value
          case UsagePlanVisibility.Admin =>
            EitherT.leftT[Future, UsagePlan](AppError.ForbiddenAction)
        }
      case _ => EitherT.pure(plan)
    }
  }

  private def handleProcess(
      plan: UsagePlan,
      newPlan: UsagePlan,
      api: Api
  ): EitherT[Future, AppError, UsagePlan] = {
    // FIXME rewrite the following code
    plan.some
      .map(oldPlan => {
        if (
          oldPlan.paymentSettings.isEmpty && newPlan.paymentSettings.isDefined
        ) {
          (
            oldPlan,
            newPlan.addSubscriptionStep(
              ValidationStep.Payment(
                IdGenerator.token(32),
                newPlan.paymentSettings.get.thirdPartyPaymentSettingsId
              )
            )
          )
        } else {
          (oldPlan, newPlan)
        }
      })
      .map { case (oldPlan, plan) =>
        if (oldPlan.paymentSettings.isDefined && plan.paymentSettings.isEmpty) {
          (
            oldPlan,
            plan.removeSubscriptionStep(step => step.name == "payment")
          )
        } else {
          (oldPlan, plan)
        }
      }
      .map { case (oldPlan, plan) =>
        if (
          oldPlan.otoroshiTarget.forall(
            _.apikeyCustomization.customMetadata.isEmpty
          ) &&
          plan.otoroshiTarget.exists(
            _.apikeyCustomization.customMetadata.nonEmpty &&
              plan.subscriptionProcess.steps.forall(_.name != "teamAdmin")
          )
        ) {
          plan.addSubscriptionStep(
            ValidationStep.TeamAdmin(IdGenerator.token(32), api.team),
            0.some
          )
        } else {
          plan
        }
      } match {
      case Some(zeUpdatedPlan) =>
        EitherT.pure[Future, AppError](zeUpdatedPlan)
      case None => EitherT.leftT[Future, UsagePlan](AppError.PlanNotFound)
    }
  }

  private def runDemandUpdate(
      tenant: Tenant,
      user: User,
      oldPlan: UsagePlan,
      updatedPlan: UsagePlan,
      api: Api
  )(implicit language: String): EitherT[Future, AppError, Unit] = {
    implicit val mat: Materializer = env.defaultMaterializer
    implicit val currentUser: User = user

    val res: Future[Either[AppError, Unit]] =
      Source
        .future(
          env.dataStore.subscriptionDemandRepo.findByStates(
            tenant.id,
            Seq(
              SubscriptionDemandState.InProgress,
              SubscriptionDemandState.Waiting
            ),
            apis = Seq(api.id).some,
            plan = updatedPlan.id.some
          )
        )
        .flatMapConcat(demands => Source(demands.toList))
        .mapAsync(1)(demand => {

          val newSteps =
            updatedPlan.subscriptionProcess.steps.map(validationStep => {
              val demandStep =
                demand.steps.find(_.step.id == validationStep.id)

              SubscriptionDemandStep(
                id = demandStep
                  .map(_.id)
                  .getOrElse(
                    SubscriptionDemandStepId(IdGenerator.token(32))
                  ),
                state = demandStep
                  .map(_.state)
                  .getOrElse(SubscriptionDemandState.Waiting),
                step = validationStep,
                metadata = demandStep.map(_.metadata).getOrElse(Json.obj())
              )
            })

          env.dataStore.subscriptionDemandRepo
            .forTenant(tenant)
            .save(demand.copy(steps = newSteps))
        })
        .runWith(Sink.ignore)
        .map(_ => {
          updatedPlan.subscriptionProcess.steps.foreach(step => {
            if (!oldPlan.subscriptionProcess.steps.exists(_.id == step.id)) {
              for {
                demands <-
                  env.dataStore.subscriptionDemandRepo.findByStates(
                    tenant.id,
                    Seq(
                      SubscriptionDemandState.InProgress,
                      SubscriptionDemandState.Waiting
                    ),
                    apis = Seq(api.id).some,
                    plan = updatedPlan.id.some
                  )
                validators <-
                  env.dataStore.stepValidatorRepo
                    .findByDemandsAndStep(tenant.id, demands.map(_.id), step.id)
                _ <- Future.sequence(
                  validators
                    .map(v =>
                      apiService
                        .validateProcessWithStepValidator(v, tenant)
                    )
                    .map(_.value)
                )
              } yield ()
            } else if (
              !oldPlan.subscriptionProcess.steps
                .find(_.id == step.id)
                .contains(step)
            ) {
              for {
                demands <-
                  env.dataStore.subscriptionDemandRepo.findByStates(
                    tenant.id,
                    Seq(
                      SubscriptionDemandState.InProgress,
                      SubscriptionDemandState.Waiting
                    ),
                    apis = Seq(api.id).some,
                    plan = updatedPlan.id.some
                  )
                validators <-
                  env.dataStore.stepValidatorRepo
                    .findByDemandsAndStep(tenant.id, demands.map(_.id), step.id)
                _ <- Future.sequence(
                  demands
                    .filter(d =>
                      validators.exists(_.subscriptionDemand == d.id)
                    )
                    .map(d => apiService.runSubscriptionProcess(d.id, tenant))
                    .map(_.value)
                )
              } yield ()
            }
          }) match {
            case _ => Right(())
          }
        })

    val value: EitherT[Future, AppError, Unit] = EitherT(res)
    value
  }
}
