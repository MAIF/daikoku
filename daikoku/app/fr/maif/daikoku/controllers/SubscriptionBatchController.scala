package fr.maif.daikoku.controllers

import fr.maif.daikoku.actions.DaikokuAction
import fr.maif.daikoku.audit.AuditTrailEvent
import fr.maif.daikoku.controllers.authorizations.async.*
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.domain.json.*
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.services.{ApiService, SubscriptionBatchService}
import play.api.libs.json.*
import play.api.mvc.*

import scala.concurrent.{ExecutionContext, Future}

class SubscriptionBatchController(
    DaikokuAction: DaikokuAction,
    batchService: SubscriptionBatchService,
    apiService: ApiService,
    env: Env,
    cc: ControllerComponents
) extends AbstractController(cc) {
  implicit private val ec: ExecutionContext = env.defaultExecutionContext
  implicit private val ev: Env = env

  def submit(teamId: String): Action[JsValue] =
    DaikokuAction.async(parse.json) { ctx =>
      ctx.request.body.validate(using SubscriptionBatchSubmissionFormat) match {
        case JsError(errors) =>
          Future.successful(
            BadRequest(
              Json.obj(
                "error" -> "Invalid subscription batch submission",
                "details" -> JsError.toJson(errors)
              )
            )
          )
        case JsSuccess(submission, _) =>
          TeamMemberOnly(
            AuditTrailEvent(
              "@{user.name} submitted a subscription batch for @{team.name}"
            )
          )(teamId, ctx) { team =>
            if (submission.team != team.id)
              Future.successful(
                Left(
                  AppError.BadRequestError(
                    "The submission team does not match the route team"
                  )
                )
              )
            else
              batchService
                .submit(ctx.tenant.id, ctx.user, submission)
                .value
                .flatMap {
                  case Left(error) => Future.successful(Left(error))
                  case Right(receipt) =>
                    apiService
                      .advanceSubscriptionBatch(ctx.tenant, receipt.batch)
                      .value
                      .map(
                        _.map(batch =>
                          Created(
                            SubscriptionBatchSubmissionReceiptFormat.writes(
                              receipt.copy(state = batch.state)
                            )
                          )
                        )
                      )
                }
          }
      }
    }

  def pendingPlans(teamId: String): Action[AnyContent] =
    DaikokuAction.async { ctx =>
      TeamMemberOnly(
        AuditTrailEvent(
          "@{user.name} viewed pending subscription plans for @{team.name}"
        )
      )(teamId, ctx) { team =>
        for {
          demands <- env.dataStore.subscriptionDemandRepo.findByStates(
            ctx.tenant.id,
            Seq(
              SubscriptionDemandState.Waiting,
              SubscriptionDemandState.InProgress
            ),
            teams = Some(Seq(team.id))
          )
          batchItems <- env.dataStore.subscriptionBatchDemandRepo
            .findOpenItemsForTeam(ctx.tenant.id, team.id)
        } yield Right(
          Ok(
            JsArray(
              (demands.map(demand => demand.api -> demand.plan) ++ batchItems)
                .distinct
                .map { case (api, plan) =>
                  Json.obj("api" -> api.value, "plan" -> plan.value)
                }
            )
          )
        )
      }
    }

  def get(teamId: String, batchId: String): Action[AnyContent] =
    DaikokuAction.async { ctx =>
      TeamMemberOnly(
        AuditTrailEvent(
          "@{user.name} viewed subscription batch @{batch.id}"
        )
      )(teamId, ctx) { team =>
        ctx.setCtxValue("batch.id", batchId)
        env.dataStore.subscriptionBatchDemandRepo
          .forTenant(ctx.tenant.id)
          .findById(SubscriptionBatchDemandId(batchId))
          .map {
            case Some(batch) if batch.team == team.id =>
              Right(Ok(batch.asJson))
            case _ =>
              Left(AppError.EntityNotFound("Subscription batch"))
          }
      }
    }

  def cancel(teamId: String, batchId: String): Action[AnyContent] =
    DaikokuAction.async { ctx =>
      TeamMemberOnly(
        AuditTrailEvent(
          "@{user.name} canceled subscription batch @{batch.id}"
        )
      )(teamId, ctx) { team =>
        ctx.setCtxValue("batch.id", batchId)
        env.dataStore.subscriptionBatchDemandRepo
          .forTenant(ctx.tenant.id)
          .findById(SubscriptionBatchDemandId(batchId))
          .flatMap {
            case Some(batch) if batch.team != team.id =>
              Future.successful(
                Left(AppError.EntityNotFound("Subscription batch"))
              )
            case Some(batch)
                if batch.from != ctx.user.id &&
                  !ctx.user.isDaikokuAdmin &&
                  !team.users.exists(member =>
                    member.userId == ctx.user.id &&
                      member.teamPermission == TeamPermission.Administrator
                  ) =>
              Future.successful(Left(AppError.TeamUnauthorized))
            case Some(batch) =>
              batchService
                .cancel(ctx.tenant.id, batch.id)
                .value
                .flatMap {
                  case Left(error) => Future.successful(Left(error))
                  case Right(_) =>
                    apiService
                      .advanceSubscriptionBatch(ctx.tenant, batch.id)
                      .value
                      .map(_.map(updated => Ok(updated.asJson)))
                }
            case None =>
              Future.successful(
                Left(AppError.EntityNotFound("Subscription batch"))
              )
          }
      }
    }

  def resume(teamId: String, batchId: String): Action[AnyContent] =
    DaikokuAction.async { ctx =>
      TeamMemberOnly(
        AuditTrailEvent(
          "@{user.name} resumed subscription batch @{batch.id}"
        )
      )(teamId, ctx) { team =>
        ctx.setCtxValue("batch.id", batchId)
        val id = SubscriptionBatchDemandId(batchId)
        env.dataStore.subscriptionBatchDemandRepo
          .forTenant(ctx.tenant.id)
          .findById(id)
          .flatMap {
            case Some(batch) if batch.team != team.id =>
              Future.successful(
                Left(AppError.EntityNotFound("Subscription batch"))
              )
            case Some(batch)
                if batch.from != ctx.user.id &&
                  !ctx.user.isDaikokuAdmin &&
                  !team.users.exists(member =>
                    member.userId == ctx.user.id &&
                      member.teamPermission == TeamPermission.Administrator
                  ) =>
              Future.successful(Left(AppError.TeamUnauthorized))
            case Some(batch) =>
              apiService
                .advanceSubscriptionBatch(ctx.tenant, batch.id)
                .value
                .map(_.map(updated => Accepted(updated.asJson)))
            case None =>
              Future.successful(
                Left(AppError.EntityNotFound("Subscription batch"))
              )
          }
      }
    }

  def reconcileFailure(
      teamId: String,
      batchId: String,
      itemId: String
  ): Action[AnyContent] =
    DaikokuAction.async { ctx =>
      TeamAdminOnly(
        AuditTrailEvent(
          "@{user.name} reconciled failed subscription batch item @{item.id}"
        )
      )(teamId, ctx) { team =>
        ctx.setCtxValue("batch.id", batchId)
        ctx.setCtxValue("item.id", itemId)
        val batchIdValue = SubscriptionBatchDemandId(batchId)
        val itemIdValue = SubscriptionBatchItemId(itemId)
        val result =
          env.dataStore.subscriptionBatchDemandRepo
            .forTenant(ctx.tenant.id)
            .findById(batchIdValue)
            .flatMap {
              case Some(batch) =>
                batch.items.find(_.id == itemIdValue) match {
                  case None =>
                    Future.successful(
                      Left(AppError.EntityNotFound("Subscription batch item"))
                    )
                  case Some(item) =>
                    env.dataStore.apiRepo
                      .forTenant(ctx.tenant.id)
                      .findById(item.api)
                      .flatMap {
                        case Some(api) if api.team == team.id =>
                          batchService
                            .reconcileFailure(
                              ctx.tenant.id,
                              SubscriptionBatchReference(batch.id, item.id)
                            )
                            .value
                        case _ =>
                          Future.successful(
                            Left(
                              AppError.EntityNotFound("Subscription batch item")
                            )
                          )
                      }
                }
              case None =>
                Future.successful(
                  Left(AppError.EntityNotFound("Subscription batch"))
                )
            }
        result.flatMap {
          case Right(updated) =>
            apiService
              .advanceSubscriptionBatch(ctx.tenant, updated.id)
              .value
              .map {
                case Right(progressed) => Accepted(progressed.asJson)
                case Left(error)       => AppError.render(error)
              }
          case Left(error) => Future.successful(AppError.render(error))
        }
      }
    }
}
