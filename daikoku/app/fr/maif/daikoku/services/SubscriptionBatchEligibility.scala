package fr.maif.daikoku.services

import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.domain.*

object SubscriptionBatchEligibility {
  def validateLinkedChild(
      batch: SubscriptionBatchDemand,
      item: SubscriptionBatchItem,
      child: SubscriptionDemand
  ): Either[AppError, Unit] = {
    val reference = SubscriptionBatchReference(batch.id, item.id)
    if (
      item.state.isClosed ||
      !item.demand.contains(child.id) ||
      !child.batch.contains(reference) ||
      child.tenant != batch.tenant ||
      child.team != batch.team ||
      child.from != batch.from ||
      child.api != item.api ||
      child.plan != item.plan
    )
      Left(AppError.BadRequestError("The child does not match its linked subscription batch item"))
    else Right(())
  }

  def validate(
      api: Api,
      plan: UsagePlan,
      team: Team,
      requester: User,
      subscriptionSecurity: Option[Boolean]
  ): Either[AppError, Unit] = {
    if (api.tenant != plan.tenant || api.tenant != team.tenant)
      Left(AppError.BadRequestError("The API, plan and consumer team must belong to the same tenant"))
    else if (!requester.isDaikokuAdmin && !team.includeUser(requester.id))
      Left(AppError.TeamUnauthorized)
    else if (!api.isSubscribable)
      Left(AppError.ApiNotPublished)
    else if (
      api.visibility == ApiVisibility.AdminOnly && !requester.isDaikokuAdmin
    )
      Left(AppError.ApiUnauthorized)
    else if (!api.possibleUsagePlans.contains(plan.id))
      Left(AppError.ApiNotLinked)
    else if (
      team.id != api.team && api.visibility != ApiVisibility.Public &&
      !api.authorizedTeams.contains(team.id)
    )
      Left(AppError.ApiUnauthorized)
    else if (
      team.id != api.team && plan.visibility == UsagePlanVisibility.Private &&
      !plan.authorizedTeams.contains(team.id)
    )
      Left(AppError.PlanUnauthorized)
    else if (
      subscriptionSecurity.forall(identity) && team.`type` == TeamType.Personal
    )
      Left(AppError.SecurityError("Subscription security"))
    else if (
      plan.paymentSettings.isDefined ||
      plan.subscriptionProcess.steps.exists(_.isInstanceOf[ValidationStep.Payment])
    )
      Left(AppError.PaymentError("Paid plans are not supported in subscription batches"))
    else Right(())
  }

  def validateKeyring(
      batch: SubscriptionBatchDemand,
      item: SubscriptionBatchItem,
      plan: UsagePlan,
      keyring: Keyring
  ): Either[AppError, Unit] = {
    val expectedBinding = plan.otoroshiTarget
      .map(target => KeyringOtoroshiBinding.Otoroshi(target.otoroshiSettings))
      .getOrElse(KeyringOtoroshiBinding.Internal)
    val reference = SubscriptionBatchReference(batch.id, item.id)

    if (keyring.tenant != batch.tenant || keyring.team != batch.team)
      Left(AppError.TeamUnauthorized)
    else if (keyring.otoroshiSettings != expectedBinding)
      Left(AppError.SubscriptionAggregationOtoroshiConflict)
    else
      item.keyringChoice match {
        case SubscriptionBatchKeyringChoice.Existing(id)
            if id != keyring.id =>
          Left(AppError.BadRequestError("The selected keyring does not match the batch item"))
        case SubscriptionBatchKeyringChoice.Existing(_) =>
          Either.cond(
            keyring.shell.forall(_.activatedAt.isDefined),
            (),
            AppError.EntityConflict("The selected keyring is reserved by a pending batch")
          )
        case SubscriptionBatchKeyringChoice.New(creationId) =>
          batch.newKeyrings
            .find(_.id == creationId)
            .toRight(AppError.EntityNotFound("Subscription batch keyring creation"))
            .flatMap { creation =>
              Either.cond(
                creation.keyring.contains(keyring.id) &&
                  creation.customName == keyring.customName &&
                  creation.binding == expectedBinding &&
                  keyring.shell.exists(shell =>
                    shell.batch == batch.id && shell.creation == creation.id &&
                      shell.pendingItems.contains(reference) && !keyring.enabled
                  ),
                (),
                AppError.EntityConflict("The new batch keyring shell is not ready")
              )
            }
      }
  }
}
