package fr.maif.daikoku.controllers

import cats.data.EitherT
import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.actions.{
  DaikokuAction,
  DaikokuActionMaybeWithGuest,
  DaikokuUnauthenticatedAction
}
import fr.maif.daikoku.audit.AuditTrailEvent
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.controllers.authorizations.async.*
import fr.maif.daikoku.domain.json.*
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.jobs.{ApiKeyStatsJob, OtoroshiSynchronizerJob}
import fr.maif.daikoku.logger.AppLogger
import fr.maif.daikoku.services.{ApiService, DeletionService}
import fr.maif.daikoku.utils.RequestImplicits.EnhancedRequestHeader
import fr.maif.daikoku.utils.*
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.Sink
import play.api.Logger
import play.api.i18n.I18nSupport
import play.api.libs.json.*
import play.api.mvc.*

import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

class PlanController(
    DaikokuAction: DaikokuAction,
    DaikokuActionMaybeWithGuest: DaikokuActionMaybeWithGuest,
    DaikokuUnauthenticatedAction: DaikokuUnauthenticatedAction,
    apiService: ApiService,
    apiKeyStatsJob: ApiKeyStatsJob,
    env: Env,
    otoroshiClient: OtoroshiClient,
    cc: ControllerComponents,
    otoroshiSynchronisator: OtoroshiSynchronizerJob,
    translator: Translator,
    paymentClient: PaymentClient,
    deletionService: DeletionService
) extends AbstractController(cc)
    with I18nSupport {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env
  implicit val tr: Translator = translator

  val logger: Logger = Logger("PlanController")

  def createPlan(
      teamId: String,
      apiId: String,
      version: String
  ): Action[JsValue] =
    DaikokuAction.async(parse.json) { ctx =>
      TeamApiEditorOnly(
        AuditTrailEvent(
          s"@{user.name} has created new plan @{plan.id} for api @{api.name} to @{newTeam.name}"
        )
      )(teamId, ctx) { team =>
        val newPlan = ctx.request.body.as(using UsagePlanFormat)

        def addProcess(
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

        (for {
          _ <- newPlan.checkAuthorizedEntities(team)
          api <- EitherT.fromOptionF[Future, AppError, Api](
            env.dataStore.apiRepo
              .forTenant(ctx.tenant)
              .findOneNotDeleted(
                Json.obj(
                  "_id" -> apiId,
                  "team" -> team.id.asJson,
                  "currentVersion" -> version
                )
              ),
            AppError.ApiNotFound
          )
          updatedPlan <- addProcess(api, newPlan)
          plans <- EitherT.liftF(
            env.dataStore.usagePlanRepo.findByApi(ctx.tenant.id, api)
          )
          _ <- updatedPlan.checkCustomName(ctx.tenant, plans, api.visibility)
          updatedApi = api.copy(possibleUsagePlans =
            api.possibleUsagePlans :+ updatedPlan.id
          )
          _ <- EitherT.liftF[Future, AppError, Boolean](
            env.dataStore.apiRepo.forTenant(ctx.tenant).save(updatedApi)
          )
          _ <- EitherT.liftF[Future, AppError, Boolean](
            env.dataStore.usagePlanRepo.forTenant(ctx.tenant).save(updatedPlan)
          )

        } yield Created(updatedApi.asJson))
          .leftMap(_.render())
          .merge
      }
    }

  def clonePlan(teamId: String, apiId: String): Action[JsValue] =
    DaikokuAction.async(parse.json) { ctx =>
      TeamApiEditorOnly(
        AuditTrailEvent(
          s"@{user.name} has cloned plan of api @{api.id} with @{team.name} - @{team.id}"
        )
      )(teamId, ctx) { _ =>
        val planId = (ctx.request.body \ "plan").as[String]
        val fromApiId = (ctx.request.body \ "api").as[String]

        val apiRepo = env.dataStore.apiRepo.forTenant(ctx.tenant.id)

        (for {
          fromApi <- EitherT.fromOptionF(
            apiRepo.findById(fromApiId),
            AppError.ApiNotFound
          )
          api <-
            EitherT.fromOptionF(apiRepo.findById(apiId), AppError.ApiNotFound)
          plan <- EitherT.fromOptionF(
            env.dataStore.usagePlanRepo.forTenant(ctx.tenant).findById(planId),
            AppError.PlanNotFound
          )
          copyPlanId = UsagePlanId(IdGenerator.token(32))
          copy = plan.copy(
            id = copyPlanId,
            customName = s"${plan.customName} (copy)"
          )
          _ <- EitherT.liftF[Future, AppError, Boolean](
            env.dataStore.usagePlanRepo.forTenant(ctx.tenant).save(copy)
          )
          _ <- EitherT.liftF[Future, AppError, Boolean](
            apiRepo.save(
              api.copy(possibleUsagePlans =
                api.possibleUsagePlans ++ Seq(copyPlanId)
              )
            )
          )
        } yield Created(copy.asJson))
          .leftMap(_.render())
          .merge
      }
    }

  def updatePlan(
      teamId: String,
      apiId: String,
      version: String,
      planId: String
  ): Action[JsValue] =
    DaikokuAction.async(parse.json) { ctx =>
      TeamApiEditorOnly(
        AuditTrailEvent(
          s"@{user.name} has updated plan @{plan.id} for api @{api.name} to @{newTeam.name}"
        )
      )(teamId, ctx) { team =>
        val updatedPlan = ctx.request.body.as(using UsagePlanFormat)

        def getPlanAndCheckIt(
            oldPlan: UsagePlan,
            newPlan: UsagePlan
        ): EitherT[Future, AppError, UsagePlan] = {
          oldPlan match {
            // it's forbidden to update otoroshi target, must use migration API instead
            case _
                if oldPlan.otoroshiTarget.isDefined && oldPlan.otoroshiTarget
                  .map(_.otoroshiSettings) != newPlan.otoroshiTarget.map(
                  _.otoroshiSettings
                ) =>
              EitherT.leftT(AppError.ForbiddenAction)
            // Handle prices changes or payment settings deletion (addition is really forbidden)
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
                if !ctx.tenant.aggregationApiKeysSecurity.exists(identity) &&
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

        def handleVisibilityToggling(
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
                      .forTenant(ctx.tenant)
                      .findNotDeleted(
                        Json
                          .obj("api" -> api.id.asJson, "plan" -> plan.id.asJson)
                      )
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

        def handleProcess(
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
            .map { case (oldPlan, plan) =>
              if (
                oldPlan.otoroshiTarget.forall(
                  _.apikeyCustomization.customMetadata.isEmpty
                ) &&
                plan.otoroshiTarget.exists(
                  _.apikeyCustomization.customMetadata.nonEmpty &&
                    plan.subscriptionProcess.forall(_.name != "teamAdmin")
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

        def validateProcessWithStepValidator(
            validator: StepValidator,
            tenant: Tenant,
            maybeSessionId: Option[String] = None
        )(implicit
            language: String,
            currentUser: User
        ): EitherT[Future, AppError, Result] = {
          for {
            demand <- EitherT.fromOptionF(
              env.dataStore.subscriptionDemandRepo
                .forTenant(tenant)
                .findByIdNotDeleted(validator.subscriptionDemand),
              AppError.EntityNotFound("Subscription demand Validator")
            )
            _ <- EitherT.fromOptionF(
              env.dataStore.teamRepo
                .forTenant(tenant)
                .findByIdNotDeleted(demand.team),
              AppError.TeamNotFound
            )
            _ <- EitherT.fromOptionF(
              env.dataStore.apiRepo
                .forTenant(tenant)
                .findByIdNotDeleted(demand.api),
              AppError.ApiNotFound
            )
            step <- EitherT.fromOption[Future](
              demand.steps.find(_.id == validator.step),
              AppError.EntityNotFound("Validation Step")
            )
            _ <- step.check()
            updatedDemand = demand.copy(steps =
              demand.steps.map(s =>
                if (s.id == step.id)
                  s.copy(state = SubscriptionDemandState.Accepted)
                else s
              )
            )
            _ <- EitherT.liftF(
              env.dataStore.subscriptionDemandRepo
                .forTenant(tenant)
                .save(updatedDemand)
            )
            _ <- EitherT.liftF(
              env.dataStore.notificationRepo
                .forTenant(tenant)
                .updateManyByQuery(
                  Json.obj(
                    "action.type" -> "CheckoutForSubscription",
                    "action.demand" -> demand.id.asJson,
                    "action.step" -> step.id.asJson
                  ),
                  Json.obj(
                    "$set" -> Json.obj(
                      "status" -> json.NotificationStatusFormat
                        .writes(NotificationStatus.Accepted())
                    )
                  )
                )
            )
            result <- apiService.runSubscriptionProcess(
              demand.id,
              tenant,
              maybeSessionId = maybeSessionId
            )
            _ <- EitherT.liftF[Future, AppError, Boolean](
              env.dataStore.stepValidatorRepo
                .forTenant(tenant)
                .delete(Json.obj("step" -> validator.step.value))
            )
          } yield result
        }

        def runDemandUpdate(
            oldPlan: UsagePlan,
            updatedPlan: UsagePlan,
            api: Api
        ): EitherT[Future, AppError, Unit] = {

          implicit val mat: Materializer = env.defaultMaterializer
          implicit val language: String = ctx.request.getLanguage(ctx.tenant)
          implicit val currentUser: User = ctx.user

          val res: Future[Either[AppError, Unit]] =
            env.dataStore.subscriptionDemandRepo
              .forTenant(ctx.tenant)
              .streamAllRaw(
                Json.obj(
                  "api" -> api.id.asJson,
                  "plan" -> updatedPlan.id.asJson,
                  "$or" -> Json.arr(
                    Json
                      .obj("state" -> SubscriptionDemandState.InProgress.name),
                    Json.obj("state" -> SubscriptionDemandState.Waiting.name)
                  )
                )
              )
              .map(json.SubscriptionDemandFormat.reads)
              .collect { case JsSuccess(demand, _) => demand }
              .mapAsync(1)(demand => {

                val newSteps =
                  updatedPlan.subscriptionProcess.map(validationStep => {
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
                      metadata =
                        demandStep.map(_.metadata).getOrElse(Json.obj())
                    )
                  })

                env.dataStore.subscriptionDemandRepo
                  .forTenant(ctx.tenant)
                  .save(demand.copy(steps = newSteps))
              })
              .runWith(Sink.ignore)
              .map(_ => {
                updatedPlan.subscriptionProcess.foreach(step => {
                  if (!oldPlan.subscriptionProcess.exists(_.id == step.id)) {
                    for {
                      demands <-
                        env.dataStore.subscriptionDemandRepo
                          .forTenant(ctx.tenant)
                          .findNotDeleted(
                            Json.obj(
                              "api" -> api.id.asJson,
                              "plan" -> updatedPlan.id.asJson,
                              "$or" -> Json.arr(
                                Json.obj(
                                  "state" -> SubscriptionDemandState.InProgress.name
                                ),
                                Json.obj(
                                  "state" -> SubscriptionDemandState.Waiting.name
                                )
                              )
                            )
                          )
                      validators <-
                        env.dataStore.stepValidatorRepo
                          .forTenant(ctx.tenant)
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
                            validateProcessWithStepValidator(v, ctx.tenant)
                          )
                          .map(_.value)
                      )
                    } yield ()
                  } else if (
                    !oldPlan.subscriptionProcess
                      .find(_.id == step.id)
                      .contains(step)
                  ) {
                    for {
                      demands <-
                        env.dataStore.subscriptionDemandRepo
                          .forTenant(ctx.tenant)
                          .findNotDeleted(
                            Json.obj(
                              "api" -> api.id.asJson,
                              "plan" -> updatedPlan.id.asJson,
                              "$or" -> Json.arr(
                                Json.obj(
                                  "state" -> SubscriptionDemandState.InProgress.name
                                ),
                                Json.obj(
                                  "state" -> SubscriptionDemandState.Waiting.name
                                )
                              )
                            )
                          )
                      validators <-
                        env.dataStore.stepValidatorRepo
                          .forTenant(ctx.tenant)
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
                          .map(d =>
                            apiService.runSubscriptionProcess(d.id, ctx.tenant)
                          )
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

        val value: EitherT[Future, AppError, Result] = for {
          _ <- updatedPlan.checkAuthorizedEntities(team)
          api <- EitherT.fromOptionF(
            env.dataStore.apiRepo
              .forTenant(ctx.tenant)
              .findOneNotDeleted(
                Json.obj(
                  "_id" -> apiId,
                  "team" -> team.id.asJson,
                  "currentVersion" -> version
                )
              ),
            AppError.ApiNotFound
          )
          plans <- EitherT.liftF(
            env.dataStore.usagePlanRepo.findByApi(ctx.tenant.id, api)
          )
          _ <- updatedPlan.checkCustomName(ctx.tenant, plans, api.visibility)
          oldPlan <- EitherT.fromOptionF(
            env.dataStore.usagePlanRepo.forTenant(ctx.tenant).findById(planId),
            AppError.PlanNotFound
          )
          _ <- EitherT.liftF(
            env.dataStore.subscriptionDemandRepo
              .forTenant(ctx.tenant)
              .updateManyByQuery(
                Json.obj(
                  "api" -> api.id.asJson,
                  "plan" -> planId,
                  "state" -> SubscriptionDemandState.InProgress.name
                ),
                Json.obj(
                  "$set" -> Json
                    .obj("state" -> SubscriptionDemandState.Blocked.name)
                )
              )
          )
          updatedPlan <- getPlanAndCheckIt(oldPlan, updatedPlan)
          handledUpdatedPlan <-
            handleVisibilityToggling(oldPlan, updatedPlan, api)
          updatedPlan <- handleProcess(oldPlan, handledUpdatedPlan, api)
          _ <- EitherT.liftF(
            env.dataStore.usagePlanRepo
              .forTenant(ctx.tenant)
              .save(updatedPlan)
              .map { result =>
                AppLogger.info(s"Saving plan: $updatedPlan")

                result
              }
          )
          _ <- EitherT.liftF(
            otoroshiSynchronisator.run(updatedPlan.id, ctx.tenant)
          )
          _ <- runDemandUpdate(oldPlan, updatedPlan, api)
          // FIXME: attention, peut etre il y en a qui sont blocked de base
          _ <- EitherT.liftF[Future, AppError, Long](
            env.dataStore.subscriptionDemandRepo
              .forTenant(ctx.tenant)
              .updateManyByQuery(
                Json.obj(
                  "api" -> api.id.asJson,
                  "plan" -> planId,
                  "state" -> SubscriptionDemandState.Blocked.name
                ),
                Json.obj(
                  "$set" -> Json
                    .obj("state" -> SubscriptionDemandState.InProgress.name)
                )
              )
          )
        } yield Ok(updatedPlan.asJson)

        value.leftMap(_.render()).merge
      }
    }

  def updatePlans(teamId: String, apiId: String, version: String) = {
    DaikokuAction.async(parse.json) { ctx =>
      TeamApiEditorOnly(
        AuditTrailEvent(
          s"@{user.name} has updated plan @{plan.id} for api @{api.name} to @{newTeam.name}"
        )
      )(teamId, ctx) { team =>
        ???
        // updatedPlans = récupérer tous les plans du body
        // val updatedPlan = ctx.request.body.as(using UsagePlanFormat)
        // récupérer l'api à laquelle ils appartiennent
        //  --> appel back

        // récupérer les plans complets listés dans l'api
        //  --> appel back

        // map () =>
        //    Pour chacun des plans
        //    checkCustomName
        //    récupère les plans actuels en BDD
        //      --> appel back

        //    Mettre à jour les subscriptionDemands
        //      --> appel back

        //    validation du plan -> getPlanAndCheckIt()
        //    gérer la visibilité du plan (privé, public -> appel au back)
        //    gérer paymentSettings, subscription steps, otoTarget (handleProcess())
        //    Sauver le plan en BDD
        //      --> appel back

        //    synchroniser Oto
        //      --> appel back

        //    demandes update, modification des demandes en cours
        //      --> appel back

        //    MAJ des demandes de souscriptions
        //      --> appel back

      }
    }
  }

  def deletePlan(
      teamId: String,
      apiId: String,
      version: String,
      planId: String
  ): Action[AnyContent] =
    DaikokuAction.async { ctx =>
      TeamApiEditorOnly(
        AuditTrailEvent(
          s"@{user.name} has deleted plan @{plan.id} for api @{api.name}"
        )
      )(teamId, ctx) { team =>
        val value: EitherT[Future, AppError, Result] = for {
          api <- EitherT.fromOptionF(
            env.dataStore.apiRepo
              .forTenant(ctx.tenant)
              .findOneNotDeleted(
                Json.obj(
                  "_id" -> apiId,
                  "team" -> team.id.asJson,
                  "currentVersion" -> version
                )
              ),
            AppError.ApiNotFound
          )
          plan <- EitherT.fromOptionF[Future, AppError, UsagePlan](
            env.dataStore.usagePlanRepo.forTenant(ctx.tenant).findById(planId),
            AppError.PlanNotFound
          )
          _ <- deletionService.deleteUsagePlanByQueue(
            planId = plan.id,
            apiId = api.id,
            tenantId = ctx.tenant.id
          )
        } yield Ok(Json.obj("done" -> true))

        value.leftMap(_.render()).merge
      }
    }

  def getAllPlansDocumentation(
      teamId: String,
      apiId: String,
      version: String
  ): Action[AnyContent] =
    DaikokuAction.async { ctx =>
      TeamApiEditorOnly(
        AuditTrailEvent(
          s"@{user.name} has requested all pages of @{api.name} - @{team.id}"
        )
      )(teamId, ctx) { _ =>
        {
          for {
            api <- EitherT.fromOptionF(
              env.dataStore.apiRepo.findByVersion(ctx.tenant, apiId, version),
              AppError.ApiNotFound
            )
            plans <- EitherT.liftF[Future, AppError, Seq[UsagePlan]](
              env.dataStore.usagePlanRepo.findByApi(ctx.tenant.id, api)
            )
            docs <- EitherT.liftF[Future, AppError, Seq[JsObject]](
              Future.sequence(
                plans.map(p =>
                  env.dataStore.apiDocumentationPageRepo
                    .forTenant(ctx.tenant)
                    .findNotDeleted(
                      Json.obj(
                        "_id" -> Json.obj(
                          "$in" -> JsArray(
                            p.documentation
                              .map(_.docIds().map(JsString.apply))
                              .getOrElse(Seq.empty)
                          )
                        )
                      )
                    )
                    .map { pages =>
                      val str: String = p.customName
                      Json.obj(
                        "from" -> str,
                        "_id" -> p.id.asJson,
                        "pages" -> pages.map(page =>
                          Json.obj(
                            "_id" -> page.id.asJson,
                            "title" -> JsString(page.title)
                          )
                        )
                      )
                    }
                )
              )
            )
          } yield Ok(JsArray(docs))
        }.leftMap(_.render()).merge
      }
    }

  def setupPayment(
      teamId: String,
      apiId: String,
      version: String,
      planId: String
  ): Action[JsValue] =
    DaikokuAction.async(parse.json) { ctx =>
      TeamApiEditorOnly(
        AuditTrailEvent(
          s"@{user.name} has setup payment for plan @{plan.id} of api @{api.name}"
        )
      )(teamId, ctx) { team =>
        val paymentSettingsId =
          (ctx.request.body \ "paymentSettings" \ "thirdPartyPaymentSettingsId")
            .asOpt(using ThirdPartyPaymentSettingsIdFormat)
        val base = ctx.request.body.asOpt(using BasePaymentInformationFormat)

        def getRatedPlan(
            plan: UsagePlan,
            base: BasePaymentInformation
        ): EitherT[Future, AppError, UsagePlan] = {

          (plan.costPerMonth, plan.costPerRequest) match {
            case (Some(_), None) =>
              EitherT.pure(plan.mergeBase(base))
            case (Some(_), Some(_)) =>
              val costPerRequest =
                (ctx.request.body \ "costPerRequest").as[BigDecimal]
              val ratedPlan = plan
                .mergeBase(base)
                .copy(costPerRequest = costPerRequest.some)
              EitherT.pure(ratedPlan)
            case _ =>
              EitherT.leftT[Future, UsagePlan](AppError.PlanUnauthorized)
          }
        }

        val value: EitherT[Future, AppError, Result] = for {
          api <- EitherT.fromOptionF(
            env.dataStore.apiRepo
              .forTenant(ctx.tenant)
              .findOneNotDeleted(
                Json.obj(
                  "_id" -> apiId,
                  "team" -> team.id.asJson,
                  "currentVersion" -> version
                )
              ),
            AppError.ApiNotFound
          )
          plan <- EitherT.fromOptionF[Future, AppError, UsagePlan](
            env.dataStore.usagePlanRepo.forTenant(ctx.tenant).findById(planId),
            AppError.PlanNotFound
          )
          _ <- plan.paymentSettings match {
            case Some(_) =>
              EitherT.leftT[Future, Unit](
                AppError.EntityConflict("Payment,  already setup")
              )
            case None => EitherT.pure[Future, AppError](())
          }
          ratedPlan <- base match {
            case Some(b) => getRatedPlan(plan, b)
            case None    => EitherT.pure[Future, AppError](plan)
          }
          paymentSettings <- paymentClient.createProduct(
            ctx.tenant,
            api,
            ratedPlan,
            paymentSettingsId.getOrElse(ThirdPartyPaymentSettingsId(""))
          )

          ratedPlanwithSettings = ratedPlan.isPaymentDefined match {
            case true =>
              ratedPlan
                .copy(paymentSettings = paymentSettings.some)
                .addSubscriptionStep(
                  ValidationStep.Payment(
                    id = IdGenerator.token(32),
                    thirdPartyPaymentSettingsId =
                      paymentSettings.thirdPartyPaymentSettingsId
                  )
                )
            case false => ratedPlan.copy(paymentSettings = None)
          }

          _ <- EitherT.liftF[Future, AppError, Boolean](
            env.dataStore.usagePlanRepo
              .forTenant(ctx.tenant)
              .save(ratedPlanwithSettings)
          )
        } yield Ok(ratedPlanwithSettings.asJson)

        value.leftMap(_.render()).merge
      }
    }

  def stopPayment(
      teamId: String,
      apiId: String,
      version: String,
      planId: String
  ): Action[JsValue] =
    DaikokuAction.async(parse.json) { ctx =>
      TeamAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has created new plan @{plan.id} for api @{api.name} to @{newTeam.name}"
        )
      )(teamId, ctx) { team =>
        val value: EitherT[Future, Result, Result] = for {
          api <- EitherT.fromOptionF(
            env.dataStore.apiRepo.forTenant(ctx.tenant).findById(apiId),
            AppError.ApiNotFound.render()
          )
          // todo: save api
          // todo: run job to "close payment"
          // todo: close pricing in stripe ?
        } yield Ok(Json.obj())

        value.merge
      }
    }

  def getAllPlan(
      teamId: String,
      apiId: String,
      version: String
  ): Action[AnyContent] =
    DaikokuAction.async { ctx =>
      TeamApiEditorOnly(
        AuditTrailEvent(
          s"@{user.name} has requested all plan of api @{api.id} with @{team.name} - @{team.id}"
        )
      )(teamId, ctx) { team =>
        (for {
          api <- EitherT.fromOptionF[Future, AppError, Api](
            env.dataStore.apiRepo
              .forTenant(ctx.tenant)
              .findOne(Json.obj("_id" -> apiId, "currentVersion" -> version)),
            AppError.ApiNotFound
          )
          _ <-
            if (api.team != team.id)
              EitherT.leftT[Future, Unit](AppError.ApiNotFound)
            else EitherT.pure[Future, AppError](())
          plans <- EitherT.liftF[Future, AppError, Seq[UsagePlan]](
            env.dataStore.usagePlanRepo.findByApi(ctx.tenant.id, api)
          )
        } yield Ok(json.SeqUsagePlanFormat.writes(plans)))
          .leftMap(_.render())
          .merge
      }
    }

  def getPlan(
      teamId: String,
      apiId: String,
      version: String,
      planId: String
  ): Action[AnyContent] =
    DaikokuAction.async { ctx =>
      TeamApiEditorOnly(
        AuditTrailEvent(
          s"@{user.name} get plan of api @{api.id} with @{team.name} - @{team.id}"
        )
      )(teamId, ctx) { team =>
        def controlApiAndPlan(api: Api): EitherT[Future, AppError, Unit] = {
          if (
            api.team != team.id || api.possibleUsagePlans
              .forall(p => p.value != planId)
          )
            EitherT.leftT[Future, Unit](AppError.PlanNotFound)
          else
            EitherT.pure[Future, AppError](())
        }

        (for {
          api <- EitherT.fromOptionF[Future, AppError, Api](
            env.dataStore.apiRepo
              .forTenant(ctx.tenant)
              .findByIdNotDeleted(apiId),
            AppError.ApiNotFound
          )
          _ <- controlApiAndPlan(api)
          plan <- EitherT.fromOptionF[Future, AppError, UsagePlan](
            env.dataStore.usagePlanRepo.forTenant(ctx.tenant).findById(planId),
            AppError.PlanNotFound
          )
        } yield Ok(plan.asJson))
          .leftMap(_.render())
          .merge
      }
    }

  def getVisiblePlan(
      apiId: String,
      version: String,
      planId: String
  ): Action[AnyContent] =
    DaikokuActionMaybeWithGuest.async { ctx =>
      UberPublicUserAccess(
        AuditTrailEvent(
          "@{user.name} is accessing visible plan @{plan.id} -- @{api.name}/@{plan.name}"
        )
      )(ctx) {

        def control(
            api: Api,
            myTeams: Seq[Team],
            plan: UsagePlan
        ): EitherT[Future, AppError, Unit] = {
          if (
            (api.visibility == ApiVisibility.Public || ctx.user.isDaikokuAdmin || (api.authorizedTeams :+ api.team)
              .intersect(myTeams.map(_.id))
              .nonEmpty) && (api.isPublished || myTeams.exists(
              _.id == api.team
            ))
          ) {

            if (
              plan.visibility == UsagePlanVisibility.Public || ctx.user.isDaikokuAdmin || (plan.authorizedTeams :+ api.team)
                .intersect(myTeams.map(_.id))
                .nonEmpty
            ) {
              EitherT.pure[Future, AppError](())
            } else {
              EitherT.leftT[Future, Unit](AppError.PlanUnauthorized)
            }
          } else {
            EitherT.leftT[Future, Unit](AppError.ApiUnauthorized)
          }
        }

        (for {
          api <- EitherT.fromOptionF(
            env.dataStore.apiRepo.findByVersion(ctx.tenant, apiId, version),
            AppError.ApiNotFound
          )
          plan <- EitherT.fromOptionF(
            env.dataStore.usagePlanRepo.forTenant(ctx.tenant).findById(planId),
            AppError.PlanNotFound
          )
          myTeams <-
            EitherT.liftF(env.dataStore.teamRepo.myTeams(ctx.tenant, ctx.user))
          _ <- control(api, myTeams, plan)
        } yield {
          ctx.setCtxValue("plan.id", plan.id.value)
          ctx.setCtxValue("aip.name", api.id.value)
          ctx.setCtxValue("plan.name", plan.customName)
          Ok(plan.asJson)
        }).leftMap(_.render()).merge
      }
    }

  def planSwagger(
      teamId: String,
      apiId: String,
      version: String,
      planId: String
  ): Action[AnyContent] =
    DaikokuActionMaybeWithGuest.async { ctx =>
      UberPublicUserAccess(
        AuditTrailEvent(
          "@{user.name} has accessed swagger of api @{api.name} on team @{team.name}"
        )
      )(ctx) {

        def fetchSwagger(plan: UsagePlan): EitherT[Future, AppError, Result] = {
          plan.swagger match {
            case Some(SwaggerAccess(_, Some(content), _, _, _)) =>
              val contentType =
                if (content.startsWith("{")) "application/json"
                else "application/yaml"
              EitherT.pure[Future, AppError](Ok(content).as(contentType))
            case Some(SwaggerAccess(Some(url), None, headers, _, _)) =>
              val finalUrl =
                if (url.startsWith("/")) env.getDaikokuUrl(ctx.tenant, url)
                else url
              val triedEventualErrorOrResult
                  : Try[Future[Either[AppError, Result]]] = Try {
                env.wsClient
                  .url(finalUrl)
                  .withHttpHeaders(headers.toSeq*)
                  .get()
                  .map { resp =>
                    val contentType =
                      if (resp.body.startsWith("{")) "application/json"
                      else "application/yaml"
                    Right(
                      Ok(resp.body).as(
                        resp
                          .header("Content-Type")
                          .getOrElse(contentType)
                      )
                    )
                  }
              }.recover { case _: Exception =>
                FastFuture.successful(
                  Left[AppError, Result](AppError.UnexpectedError)
                )
              }
              EitherT(triedEventualErrorOrResult.get)
            case _ =>
              EitherT.leftT[Future, Result](
                AppError.EntityNotFound("Swagger access")
              )
          }
        }

        (for {
          _ <- EitherT.cond[Future][AppError, Unit](
            !(ctx.tenant.apiReferenceHideForGuest
              .getOrElse(true) && ctx.user.isGuest),
            (),
            AppError.ForbiddenAction
          )
          team <- EitherT.fromOptionF[Future, AppError, Team](
            env.dataStore.teamRepo
              .forTenant(ctx.tenant.id)
              .findByIdOrHrIdNotDeleted(teamId),
            AppError.TeamNotFound
          )
          api <- EitherT.fromOptionF[Future, AppError, Api](
            env.dataStore.apiRepo
              .forTenant(ctx.tenant)
              .findOneNotDeleted(
                Json.obj(
                  "_id" -> apiId,
                  "currentVersion" -> version,
                  "team" -> team.id.asJson
                )
              ),
            AppError.ApiNotFound
          )
          _ <- EitherT.cond[Future][AppError, Unit](
            api.team == team.id,
            (),
            AppError.ApiNotFound
          )
          _ <- EitherT.cond[Future][AppError, Unit](
            api.possibleUsagePlans.exists(_.value == planId),
            (),
            AppError.PlanNotFound
          )
          plan <- EitherT.fromOptionF[Future, AppError, UsagePlan](
            env.dataStore.usagePlanRepo
              .forTenant(ctx.tenant)
              .findByIdNotDeleted(planId),
            AppError.PlanNotFound
          )
          myTeams <-
            EitherT.liftF(env.dataStore.teamRepo.myTeams(ctx.tenant, ctx.user))
          test =
            api.visibility == ApiVisibility.Public || myTeams.exists(
              _.id == api.team
            ) || api.visibility != ApiVisibility.Public && api.authorizedTeams
              .intersect(myTeams.map(_.id))
              .nonEmpty
          _ <- EitherT.cond[Future][AppError, Unit](
            test,
            (),
            AppError.ApiUnauthorized
          )
          result <- fetchSwagger(plan)
        } yield {
          result
        }).leftMap(_.render()).merge
      }
    }

  def getVisiblePlans(apiId: String, version: String) =
    DaikokuActionMaybeWithGuest.async { ctx =>
      UberPublicUserAccess(
        AuditTrailEvent(
          "@{user.name} is accessing visible plans of @{api.name}"
        )
      )(ctx) {
        def controlAndGet(
            api: Api,
            myTeams: Seq[Team],
            plans: Seq[UsagePlan]
        ): EitherT[Future, AppError, Seq[UsagePlan]] = {
          if (
            (api.visibility == ApiVisibility.Public || ctx.user.isDaikokuAdmin || (api.authorizedTeams :+ api.team)
              .intersect(myTeams.map(_.id))
              .nonEmpty) && (api.isPublished || myTeams.exists(
              _.id == api.team
            ))
          ) {
            val filteredPlans = plans.filter(plan =>
              plan.visibility == UsagePlanVisibility.Public || ctx.user.isDaikokuAdmin || (plan.authorizedTeams :+ api.team)
                .intersect(myTeams.map(_.id))
                .nonEmpty
            )
            EitherT.pure[Future, AppError](filteredPlans)
          } else {
            EitherT.leftT[Future, Seq[UsagePlan]](AppError.ApiUnauthorized)
          }
        }

        object UserLevel extends Enumeration {
          type UserLevel = Value
          val Admin, User, Guest = Value
        }

        def getUserLevel(
            api: Api,
            myTeams: Seq[Team],
            plans: Seq[UsagePlan]
        ): EitherT[Future, AppError, UserLevel.UserLevel] = {
          if (ctx.user.isDaikokuAdmin) {
            EitherT.pure[Future, AppError](UserLevel.Admin)
          } else if (
            myTeams.exists(t =>
              t.id == api.team && t.users.exists(u =>
                u.userId == ctx.user.id && u.teamPermission != TeamPermission.TeamUser
              )
            )
          ) {
            EitherT.pure[Future, AppError](UserLevel.Admin)
          } else if (ctx.user.isGuest) {
            EitherT.pure[Future, AppError](UserLevel.Guest)
          } else {
            EitherT.pure[Future, AppError](UserLevel.User)
          }
        }

        (for {
          api <- EitherT.fromOptionF[Future, AppError, Api](
            env.dataStore.apiRepo.findByVersion(ctx.tenant, apiId, version),
            AppError.ApiNotFound
          )
          plans <- EitherT.liftF[Future, AppError, Seq[UsagePlan]](
            env.dataStore.usagePlanRepo.findByApi(ctx.tenant.id, api)
          )
          myTeams <- EitherT.liftF[Future, AppError, Seq[Team]](
            env.dataStore.teamRepo.myTeams(ctx.tenant, ctx.user)
          )
          filteredPlans <- controlAndGet(api, myTeams, plans)
          level <- getUserLevel(api, myTeams, plans)
        } yield {
          ctx.setCtxValue("api.name", api.name)

          val jsonPlans = level match {
            case UserLevel.Admin =>
              json.SeqUsagePlanFormat.writes(filteredPlans)
            case UserLevel.User =>
              JsArray(
                filteredPlans.map(p =>
                  p.asJson.as[JsObject] - "subscriptionProcess" - "testing" +
                    ("testing" -> p.testing
                      .map(_.asSafeJson)
                      .getOrElse(Json.obj())) +
                    ("subscriptionProcess" -> JsArray(
                      p.subscriptionProcess.map {
                        case process @ ValidationStep.Form(_, _, _, _, _, _) =>
                          process.asJson
                        case process => Json.obj("name" -> process.name)
                      }
                    ))
                )
              )
            case UserLevel.Guest
                if ctx.tenant.apiReferenceHideForGuest.getOrElse(true) =>
              JsArray(
                filteredPlans.map(
                  _.asJson.as[
                    JsObject
                  ] - "otoroshiTarget" - "documentation" - "SubscriptionProcess" - "testing" - "swagger"
                )
              )
            case _ =>
              JsArray(
                filteredPlans.map(
                  _.asJson.as[
                    JsObject
                  ] - "otoroshiTarget" - "documentation" - "subscriptionProcess" - "testing"
                )
              )
          }

          Ok(jsonPlans)
        }).leftMap(_.render()).merge
      }
    }

    
}
