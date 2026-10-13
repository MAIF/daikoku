package fr.maif.daikoku.domain

import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.utils.SubscriptionUtil
import org.joda.time.DateTime
import play.api.libs.json.JsObject

enum SubscriptionBatchItemState(val name: String, val isClosed: Boolean) {
  case Pending extends SubscriptionBatchItemState("pending", false)
  case Waiting extends SubscriptionBatchItemState("waiting", false)
  case InProgress extends SubscriptionBatchItemState("inProgress", false)
  case RetryableError
      extends SubscriptionBatchItemState("retryableError", false)
  case Accepted extends SubscriptionBatchItemState("accepted", true)
  case Refused extends SubscriptionBatchItemState("refused", true)
  case Blocked extends SubscriptionBatchItemState("blocked", true)
  case Failed extends SubscriptionBatchItemState("failed", true)
  case Canceled extends SubscriptionBatchItemState("canceled", true)
}

enum SubscriptionBatchDemandState(val name: String, val isClosed: Boolean) {
  case Pending extends SubscriptionBatchDemandState("pending", false)
  case InProgress extends SubscriptionBatchDemandState("inProgress", false)
  case Accepted extends SubscriptionBatchDemandState("accepted", true)
  case PartiallyAccepted
      extends SubscriptionBatchDemandState("partiallyAccepted", true)
  case Failed extends SubscriptionBatchDemandState("failed", true)
  case Canceled extends SubscriptionBatchDemandState("canceled", true)
}

enum SubscriptionBatchKeyringChoice {
  case Existing(keyring: KeyringId)
  case New(creation: SubscriptionBatchKeyringId)
}

case class SubscriptionBatchItemSelection(
    api: ApiId,
    plan: UsagePlanId,
    keyringChoice: SubscriptionBatchKeyringChoice
)

case class SubscriptionBatchNewKeyringSelection(
    id: SubscriptionBatchKeyringId,
    customName: String
)

/** Client-controlled submission fields; tenant, requester and plan process are
  * resolved server-side.
  */
case class SubscriptionBatchSubmission(
    team: TeamId,
    idempotencyKey: String,
    items: Seq[SubscriptionBatchItemSelection],
    newKeyrings: Seq[SubscriptionBatchNewKeyringSelection] = Seq.empty,
    motivation: Option[JsObject] = None
)

case class SubscriptionBatchSubmissionReceipt(
    batch: SubscriptionBatchDemandId,
    state: SubscriptionBatchDemandState,
    replayed: Boolean
)

case class SubscriptionBatchReference(
    batch: SubscriptionBatchDemandId,
    item: SubscriptionBatchItemId
)

/** Several items may reference one creation to request a shared new keyring. */
case class SubscriptionBatchKeyringCreation(
    id: SubscriptionBatchKeyringId,
    customName: String,
    binding: KeyringOtoroshiBinding,
    keyring: Option[KeyringId] = None,
    ready: Boolean = false,
    finalized: Boolean = false
)

case class SubscriptionBatchItemError(
    code: String,
    message: String,
    date: DateTime = DateTime.now
)

/** Expiration signals abandoned work; it does not authorize replaying external
  * effects.
  */
case class SubscriptionBatchItemReservation(
    token: String,
    lockedAt: DateTime,
    expiresAt: DateTime
) {
  def validate(): Either[AppError, Unit] =
    if (token.trim.isEmpty)
      Left(
        AppError.BadRequestError(
          "A subscription batch reservation token is required"
        )
      )
    else if (!expiresAt.isAfter(lockedAt))
      Left(
        AppError.BadRequestError(
          "A subscription batch reservation must expire after it starts"
        )
      )
    else Right(())

  def isActiveAt(now: DateTime): Boolean =
    !now.isBefore(lockedAt) && now.isBefore(expiresAt)
}

case class SubscriptionBatchItem(
    id: SubscriptionBatchItemId,
    api: ApiId,
    plan: UsagePlanId,
    process: SubscriptionProcess,
    keyringChoice: SubscriptionBatchKeyringChoice,
    state: SubscriptionBatchItemState = SubscriptionBatchItemState.Pending,
    demand: Option[DemandId] = None,
    subscription: Option[ApiSubscriptionId] = None,
    error: Option[SubscriptionBatchItemError] = None,
    reservation: Option[SubscriptionBatchItemReservation] = None
)

case class SubscriptionBatchDemand(
    id: SubscriptionBatchDemandId,
    tenant: TenantId,
    team: TeamId,
    from: UserId,
    idempotencyKey: String,
    items: Seq[SubscriptionBatchItem],
    newKeyrings: Seq[SubscriptionBatchKeyringCreation] = Seq.empty,
    motivation: Option[JsObject] = None,
    date: DateTime = DateTime.now,
    revision: Long = 0L
) extends CanJson[SubscriptionBatchDemand] {
  override def asJson = json.SubscriptionBatchDemandFormat.writes(this)

  def withChildProgress(
      child: SubscriptionDemand,
      subscription: Option[ApiSubscription] = None
  ): Either[AppError, SubscriptionBatchDemand] = {
    for {
      reference <- child.batch
        .filter(_.batch == id)
        .toRight(
          AppError.BadRequestError(
            "The child does not reference this subscription batch"
          )
        )
      item <- items
        .find(_.id == reference.item)
        .toRight(AppError.EntityNotFound("Subscription batch item"))
      _ <- Either.cond(
        child.tenant == tenant && child.team == team && child.from == from &&
          child.api == item.api && child.plan == item.plan && item.demand
            .contains(child.id),
        (),
        AppError.BadRequestError(
          "The child does not match its linked subscription batch item"
        )
      )
      _ <- Either.cond(
        subscription.forall(s =>
          s.tenant == tenant && s.team == team && s.api == item.api &&
            s.plan == item.plan && child.keyring.contains(s.keyring)
        ),
        (),
        AppError.BadRequestError(
          "The subscription does not match its batch child"
        )
      )
      target <- child.state match {
        case SubscriptionDemandState.Waiting =>
          Right(SubscriptionBatchItemState.Waiting)
        case SubscriptionDemandState.InProgress =>
          Right(SubscriptionBatchItemState.InProgress)
        case SubscriptionDemandState.Refused =>
          Right(SubscriptionBatchItemState.Refused)
        case SubscriptionDemandState.Canceled =>
          Right(SubscriptionBatchItemState.Canceled)
        case SubscriptionDemandState.Blocked =>
          Right(SubscriptionBatchItemState.Blocked)
        case SubscriptionDemandState.Accepted =>
          subscription
            .toRight(
              AppError.EntityConflict("The accepted child has no subscription")
            )
            .map(_ => SubscriptionBatchItemState.Accepted)
      }
      _ <- Either.cond(
        subscription.isEmpty || child.state == SubscriptionDemandState.Accepted,
        (),
        AppError.EntityConflict(
          "Only an accepted child can record a subscription"
        )
      )
      updated = item.copy(
        state = target,
        subscription = subscription.map(_.id),
        error = None,
        reservation =
          if (target == SubscriptionBatchItemState.Accepted) None
          else item.reservation
      )
      _ <- Either.cond(
        !item.state.isClosed || updated == item,
        (),
        AppError.EntityConflict(
          "A closed subscription batch item cannot change its result"
        )
      )
    } yield copy(items =
      items.map(current => if (current.id == item.id) updated else current)
    )
  }

  def validateSelection(): Either[AppError, Unit] = {
    val errors = Seq.newBuilder[AppError]
    def invalid(message: String): Unit =
      errors += AppError.BadRequestError(message)

    if (items.isEmpty)
      invalid("A subscription batch must contain at least one plan")
    if (idempotencyKey.trim.isEmpty)
      invalid("A submission idempotency key is required")
    if (items.map(_.id).distinct.size != items.size)
      invalid("Subscription batch item identifiers must be unique")
    if (items.map(item => (item.api, item.plan)).distinct.size != items.size)
      invalid("An API plan can only appear once in a subscription batch")
    if (newKeyrings.map(_.id).distinct.size != newKeyrings.size)
      invalid("New keyring creation identifiers must be unique")
    if (!SubscriptionUtil.areBatchProcessesCompatible(items.map(_.process)))
      invalid("Subscription batch processes are incompatible")

    val creationIds = newKeyrings.map(_.id).toSet
    val referencedCreations = items.flatMap { item =>
      item.keyringChoice match {
        case SubscriptionBatchKeyringChoice.New(creation) => Some(creation)
        case _                                            => None
      }
    }.toSet

    items.foreach { item =>
      if (item.process.steps.exists(_.isInstanceOf[ValidationStep.Payment]))
        invalid(
          s"Item ${item.id.value}: paid plans are not supported in subscription batches"
        )
      item.keyringChoice match {
        case SubscriptionBatchKeyringChoice.New(creation)
            if !creationIds.contains(creation) =>
          invalid(
            s"Item ${item.id.value}: new keyring creation ${creation.value} is missing"
          )
        case _ => ()
      }
    }
    newKeyrings.foreach { creation =>
      if (!referencedCreations.contains(creation.id))
        invalid(
          s"New keyring creation ${creation.id.value} is not referenced by any item"
        )
    }

    val failures = errors.result()
    if (failures.isEmpty) Right(())
    else Left(AppError.AppErrors(failures))
  }

  /** Derive the summary so one refused plan cannot close an unfinished batch.
    */
  def state: SubscriptionBatchDemandState = {
    import SubscriptionBatchDemandState.*

    if (items.forall(_.state == SubscriptionBatchItemState.Pending)) {
      Pending
    } else if (items.exists(!_.state.isClosed)) {
      InProgress
    } else if (items.forall(_.state == SubscriptionBatchItemState.Accepted)) {
      Accepted
    } else if (items.exists(_.state == SubscriptionBatchItemState.Accepted)) {
      PartiallyAccepted
    } else if (items.forall(_.state == SubscriptionBatchItemState.Canceled)) {
      Canceled
    } else {
      Failed
    }
  }
}
