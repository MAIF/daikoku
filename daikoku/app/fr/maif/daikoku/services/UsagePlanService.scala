package fr.maif.daikoku.services

import cats.data.EitherT
import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.jobs.OtoroshiSynchronizerJob
import fr.maif.daikoku.utils.IdGenerator
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.{Sink, Source}
import play.api.libs.json.*

import scala.concurrent.{ExecutionContext, Future}

class UsagePlanService(
    env: Env,
    apiService: ApiService,
    otoroshiSynchronisator: OtoroshiSynchronizerJob,
    deletionService: DeletionService
) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

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
      updatedPlan <- handleProcess(oldPlan, handledUpdatedPlan, api)
      _ <- EitherT.liftF(
        env.dataStore.usagePlanRepo.forTenant(tenant).save(updatedPlan)
      )
      _ <- EitherT.liftF(
        otoroshiSynchronisator.run(updatedPlan.id, tenant)
      )
      _ <- runDemandUpdate(tenant, user, oldPlan, updatedPlan, api)
      //FIXME: attention, peut etre il y en a qui sont blocked de base
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

  private def getPlanAndCheckIt(
      tenant: Tenant,
      oldPlan: UsagePlan,
      newPlan: UsagePlan
  ): EitherT[Future, AppError, UsagePlan] = {
    oldPlan match {
      //it's forbidden to update otoroshi target, must use migration API instead
      case _
          if oldPlan.otoroshiTarget.isDefined && oldPlan.otoroshiTarget
            .map(_.otoroshiSettings) != newPlan.otoroshiTarget.map(
            _.otoroshiSettings
          ) =>
        EitherT.leftT(AppError.ForbiddenAction)
      //Handle prices changes or payment settings deletion (addition is really forbidden)
      case _
          if oldPlan.paymentSettings.isDefined && oldPlan.paymentSettings != newPlan.paymentSettings =>
        EitherT.leftT(AppError.ForbiddenAction)
      case _
          if oldPlan.costPerMonth.isDefined && oldPlan.costPerMonth != newPlan.costPerMonth =>
        EitherT.leftT(AppError.ForbiddenAction)
      case _
          if oldPlan.costPerRequest.isDefined && oldPlan.costPerRequest != newPlan.costPerRequest =>
        EitherT.leftT(AppError.ForbiddenAction)
      case _
          if !tenant.aggregationApiKeysSecurity.exists(identity) &&
            newPlan.aggregationApiKeysSecurity.exists(identity) =>
        EitherT.leftT(AppError.SubscriptionAggregationDisabled)
      case _ if oldPlan.visibility == UsagePlanVisibility.Admin =>
        EitherT.pure(
          oldPlan.copy(
            otoroshiTarget = newPlan.otoroshiTarget,
            allowMultipleKeys = newPlan.allowMultipleKeys,
            autoRotation = newPlan.autoRotation
          )
        )
      case _ => EitherT.pure(newPlan)
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
    //FIXME rewrite the following code
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
      .map {
        case (oldPlan, plan) =>
          if (
            oldPlan.paymentSettings.isDefined && plan.paymentSettings.isEmpty
          ) {
            (
              oldPlan,
              plan.removeSubscriptionStep(step => step.name == "payment")
            )
          } else {
            (oldPlan, plan)
          }
      }
      .map {
        case (oldPlan, plan) =>
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
                    .forTenant(tenant)
                    .findNotDeleted(
                      Json.obj(
                        "subscriptionDemand" -> Json.obj(
                          "$in" -> JsArray(demands.map(_.id.asJson))
                        ),
                        "step" -> step.id
                      )
                    )
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
                    .forTenant(tenant)
                    .findNotDeleted(
                      Json.obj(
                        "subscriptionDemand" -> Json.obj(
                          "$in" -> JsArray(demands.map(_.id.asJson))
                        ),
                        "step" -> step.id
                      )
                    )
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
