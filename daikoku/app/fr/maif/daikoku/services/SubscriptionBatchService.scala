package fr.maif.daikoku.services

import cats.data.EitherT
import cats.implicits.*
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.storage.DataStore
import fr.maif.daikoku.utils.IdGenerator
import org.joda.time.DateTime

import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration.FiniteDuration

class SubscriptionBatchService(dataStore: DataStore) {
  private def validateSelectedItem(
      tenant: TenantId,
      batch: SubscriptionBatchDemand,
      item: SubscriptionBatchItem,
      team: Team,
      requester: User,
      tenantSettings: Tenant
  )(implicit
      ec: ExecutionContext
  ): EitherT[Future, AppError, SubscriptionBatchItem] =
    for {
      api <- EitherT.fromOptionF(
        dataStore.apiRepo.forTenant(tenant).findById(item.api),
        AppError.ApiNotFound
      )
      plan <- EitherT.fromOptionF(
        dataStore.usagePlanRepo.forTenant(tenant).findById(item.plan),
        AppError.PlanNotFound
      )
      _ <- EitherT.fromEither[Future](
        SubscriptionBatchEligibility.validate(
          api,
          plan,
          team,
          requester,
          tenantSettings.subscriptionSecurity
        )
      )
      _ <- EitherT(
        dataStore.apiSubscriptionRepo
          .findOneByTeamApiAndPlan(tenant, team.id, api.id, plan.id)
          .map {
            case Some(_) if !plan.allowMultipleKeys.contains(true) =>
              Left(AppError.SubscriptionConflict)
            case _ => Right(())
          }
      )
      _ <- EitherT(
        dataStore.subscriptionDemandRepo
          .findByStates(
            tenant,
            Seq(
              SubscriptionDemandState.Waiting,
              SubscriptionDemandState.InProgress
            ),
            Some(Seq(api.id)),
            Some(Seq(team.id)),
            Some(plan.id)
          )
          .map(existing =>
            Either.cond(existing.isEmpty, (), AppError.SubscriptionConflict)
          )
      )
      _ <- EitherT(
        dataStore.subscriptionBatchDemandRepo
          .findOpenItem(tenant, team.id, api.id, plan.id)
          .map(existing =>
            Either.cond(existing.isEmpty, (), AppError.SubscriptionConflict)
          )
      )
      validated <- item.keyringChoice match {
        case SubscriptionBatchKeyringChoice.New(_) =>
          EitherT.pure[Future, AppError](
            item.copy(process = plan.subscriptionProcess)
          )
        case SubscriptionBatchKeyringChoice.Existing(keyringId) =>
          for {
            keyring <- EitherT.fromOptionF(
              dataStore.keyringRepo.forTenant(tenant).findById(keyringId.value),
              AppError.EntityNotFound(s"Keyring ${keyringId.value}")
            )
            _ <- EitherT.fromEither[Future](
              SubscriptionBatchEligibility.validateKeyring(
                batch,
                item,
                plan,
                keyring
              )
            )
            members <- EitherT.liftF(
              dataStore.apiSubscriptionRepo.findByKeyring(tenant, keyring.id)
            )
            memberPlans <- EitherT.liftF(
              dataStore.usagePlanRepo
                .forTenant(tenant)
                .findByIds(members.map(_.plan).distinct)
            )
            plansById = memberPlans
              .map(existing => existing.id -> existing)
              .toMap
            _ <- EitherT.fromEither[Future](
              Either.cond(
                plan.aggregationApiKeysSecurity.contains(true),
                (),
                AppError.SecurityError("Subscription Aggregation")
              )
            )
            _ <- EitherT.fromEither[Future](
              Either.cond(
                members.forall(_.team == team.id),
                (),
                AppError.SubscriptionAggregationTeamConflict
              )
            )
            keyringSettings = keyring.otoroshiSettings match {
              case KeyringOtoroshiBinding.Otoroshi(id) => Some(id)
              case KeyringOtoroshiBinding.Internal     => None
            }
            _ <- EitherT.fromEither[Future](
              Either.cond(
                plan.otoroshiTarget.map(_.otoroshiSettings) == keyringSettings,
                (),
                AppError.SubscriptionAggregationOtoroshiConflict
              )
            )
            _ <- EitherT.fromEither[Future](
              Either.cond(
                tenantSettings.display != TenantDisplay.Environment ||
                  !tenantSettings.environmentAggregationApiKeysSecurity
                    .contains(true) ||
                  members
                    .flatMap(member => plansById.get(member.plan))
                    .forall(_.customName == plan.customName),
                (),
                AppError.SecurityError(
                  "Environment subscription aggregation requires matching plan environments"
                )
              )
            )
            joiningReadOnly = plan.otoroshiTarget.exists(
              _.apikeyCustomization.readOnly
            )
            _ <- EitherT.fromEither[Future](
              Either.cond(
                members.forall(member =>
                  member.customReadOnly.getOrElse(
                    plansById
                      .get(member.plan)
                      .exists(
                        _.otoroshiTarget.exists(_.apikeyCustomization.readOnly)
                      )
                  ) == joiningReadOnly
                ),
                (),
                AppError.SubscriptionAggregationReadOnlyConflict
              )
            )
          } yield item.copy(process = plan.subscriptionProcess)
      }
    } yield validated

  def submit(
      tenant: TenantId,
      requester: User,
      submission: SubscriptionBatchSubmission
  )(implicit
      ec: ExecutionContext
  ): EitherT[Future, AppError, SubscriptionBatchSubmissionReceipt] = {
    if (submission.idempotencyKey.trim.isEmpty)
      EitherT.leftT(
        AppError.BadRequestError("A submission idempotency key is required")
      )
    else
      for {
        tenantSettings <- EitherT.fromOptionF(
          dataStore.tenantRepo.findById(tenant),
          AppError.TenantNotFound
        )
        team <- EitherT.fromOptionF(
          dataStore.teamRepo.forTenant(tenant).findById(submission.team),
          AppError.TeamNotFound
        )
        _ <- EitherT.cond[Future][AppError, Unit](
          requester.isDaikokuAdmin || team.includeUser(requester.id),
          (),
          AppError.TeamUnauthorized
        )
        existing <- EitherT.liftF(
          dataStore.subscriptionBatchDemandRepo.findBySubmission(
            tenant,
            submission.team,
            requester.id,
            submission.idempotencyKey
          )
        )
        result <- existing match {
          case Some(batch) =>
            EitherT.pure[Future, AppError](
              SubscriptionBatchSubmissionReceipt(
                batch.id,
                batch.state,
                replayed = true
              )
            )
          case None =>
            val creations = submission.newKeyrings.map { selected =>
              SubscriptionBatchKeyringCreation(
                selected.id,
                selected.customName.trim,
                KeyringOtoroshiBinding.Internal
              )
            }
            val unvalidated = SubscriptionBatchDemand(
              id = SubscriptionBatchDemandId(IdGenerator.token(32)),
              tenant = tenant,
              team = team.id,
              from = requester.id,
              idempotencyKey = submission.idempotencyKey,
              items = submission.items.map { selected =>
                SubscriptionBatchItem(
                  id = SubscriptionBatchItemId(IdGenerator.token(32)),
                  api = selected.api,
                  plan = selected.plan,
                  process = SubscriptionProcess(),
                  keyringChoice = selected.keyringChoice
                )
              },
              newKeyrings = creations,
              motivation = submission.motivation
            )
            for {
              _ <- EitherT.fromEither[Future](unvalidated.validateSelection())
              validatedItems <- unvalidated.items.foldLeft(
                EitherT(
                  Future.successful(
                    Right(Vector.empty[SubscriptionBatchItem]): Either[
                      AppError,
                      Vector[SubscriptionBatchItem]
                    ]
                  )
                )
              ) { (previous, item) =>
                for {
                  current <- previous
                  validated <- validateSelectedItem(
                    tenant,
                    unvalidated,
                    item,
                    team,
                    requester,
                    tenantSettings
                  )
                } yield current :+ validated
              }
              plans <- EitherT.liftF(
                dataStore.usagePlanRepo
                  .forTenant(tenant)
                  .findByIds(validatedItems.map(_.plan).distinct)
              )
              plansById = plans.map(plan => plan.id -> plan).toMap
              _ <- EitherT.fromEither[Future](
                validatedItems
                  .groupBy(_.keyringChoice)
                  .values
                  .foldLeft(
                    Right(()): Either[AppError, Unit]
                  ) { (result, groupedItems) =>
                    for {
                      _ <- result
                      groupedPlans <- groupedItems
                        .traverse(item =>
                          plansById
                            .get(item.plan)
                            .toRight(AppError.PlanNotFound)
                        )
                      bindings = groupedPlans
                        .map(plan =>
                          plan.otoroshiTarget
                            .map(target =>
                              KeyringOtoroshiBinding
                                .Otoroshi(target.otoroshiSettings)
                            )
                            .getOrElse(KeyringOtoroshiBinding.Internal)
                        )
                        .distinct
                      readOnlyValues = groupedPlans
                        .map(
                          _.otoroshiTarget
                            .exists(_.apikeyCustomization.readOnly)
                        )
                        .distinct
                      _ <- Either.cond(
                        bindings.size == 1,
                        (),
                        AppError.SubscriptionAggregationOtoroshiConflict
                      )
                      _ <- Either.cond(
                        groupedPlans.size <= 1 ||
                          groupedPlans.forall(
                            _.aggregationApiKeysSecurity.contains(true)
                          ),
                        (),
                        AppError.SecurityError("Subscription Aggregation")
                      )
                      _ <- Either.cond(
                        readOnlyValues.size == 1,
                        (),
                        AppError.SubscriptionAggregationReadOnlyConflict
                      )
                      _ <- Either.cond(
                        tenantSettings.display != TenantDisplay.Environment ||
                          !tenantSettings.environmentAggregationApiKeysSecurity
                            .contains(true) ||
                          groupedPlans.map(_.customName).distinct.size == 1,
                        (),
                        AppError.SecurityError(
                          "Environment subscription aggregation requires matching plan environments"
                        )
                      )
                    } yield ()
                  }
              )
              resolvedCreations <- EitherT.fromEither[Future](
                creations
                  .foldLeft(
                    Right(
                      Vector.empty[SubscriptionBatchKeyringCreation]
                    ): Either[AppError, Vector[
                      SubscriptionBatchKeyringCreation
                    ]]
                  ) { (previous, creation) =>
                    for {
                      current <- previous
                      referenced <- validatedItems
                        .filter(
                          _.keyringChoice == SubscriptionBatchKeyringChoice.New(
                            creation.id
                          )
                        )
                        .traverse(item =>
                          plansById
                            .get(item.plan)
                            .toRight(AppError.PlanNotFound)
                            .map(item -> _)
                        )
                      bindings = referenced.map { case (_, plan) =>
                        plan.otoroshiTarget
                          .map(target =>
                            KeyringOtoroshiBinding.Otoroshi(
                              target.otoroshiSettings
                            )
                          )
                          .getOrElse(KeyringOtoroshiBinding.Internal)
                      }.distinct
                      _ <- Either.cond(
                        bindings.size == 1,
                        (),
                        AppError.SubscriptionAggregationOtoroshiConflict
                      )
                      _ <- Either.cond(
                        referenced.size <= 1 ||
                          referenced.forall(
                            _._2.aggregationApiKeysSecurity.contains(true)
                          ),
                        (),
                        AppError.SecurityError("Subscription Aggregation")
                      )
                      _ <- Either.cond(
                        creation.customName.nonEmpty,
                        (),
                        AppError.BadRequestError(
                          "A new keyring name is required"
                        )
                      )
                    } yield current :+ creation.copy(binding = bindings.head)
                  }
              )
              candidate = unvalidated.copy(
                items = validatedItems,
                newKeyrings = resolvedCreations
              )
              _ <- EitherT.fromEither[Future](candidate.validateSelection())
              inserted <- EitherT.liftF(
                dataStore.subscriptionBatchDemandRepo.insertIfAbsent(candidate)
              )
              persisted <- inserted match {
                case Some(batch) => EitherT.pure[Future, AppError](batch)
                case None =>
                  EitherT.fromOptionF(
                    dataStore.subscriptionBatchDemandRepo.findBySubmission(
                      tenant,
                      team.id,
                      requester.id,
                      submission.idempotencyKey
                    ),
                    AppError.EntityConflict("Subscription batch submission")
                  )
              }

            } yield SubscriptionBatchSubmissionReceipt(
              persisted.id,
              persisted.state,
              replayed = inserted.isEmpty
            )
        }
      } yield result
  }

  def reconcileFailure(
      tenant: TenantId,
      reference: SubscriptionBatchReference
  )(implicit
      ec: ExecutionContext
  ): EitherT[Future, AppError, SubscriptionBatchDemand] =
    EitherT(dataStore.reconcileBatchItemFailure(tenant, reference))

  def reserveItem(
      tenant: TenantId,
      reference: SubscriptionBatchReference,
      duration: FiniteDuration
  )(implicit
      ec: ExecutionContext
  ): EitherT[Future, AppError, SubscriptionBatchItemReservation] = {
    if (duration.toMillis <= 0L)
      EitherT.leftT[Future, SubscriptionBatchItemReservation](
        AppError.BadRequestError(
          "The subscription batch reservation duration must be positive"
        )
      )
    else {
      val now = DateTime.now
      EitherT(
        dataStore.reserveBatchItem(
          tenant,
          reference,
          SubscriptionBatchItemReservation(
            IdGenerator.token(32),
            now,
            now.plus(duration.toMillis)
          )
        )
      )
    }
  }

  def synchronizeItem(
      tenant: TenantId,
      reference: SubscriptionBatchReference,
      subscription: Option[ApiSubscriptionId] = None
  )(implicit
      ec: ExecutionContext
  ): EitherT[Future, AppError, SubscriptionBatchDemand] =
    EitherT(dataStore.synchronizeBatchChild(tenant, reference, subscription))

  def cancel(
      tenant: TenantId,
      batch: SubscriptionBatchDemandId
  )(implicit
      ec: ExecutionContext
  ): EitherT[Future, AppError, SubscriptionBatchDemand] =
    EitherT(dataStore.cancelBatch(tenant, batch))

  def reportExpiredReservation(
      tenant: TenantId,
      reference: SubscriptionBatchReference
  )(implicit
      ec: ExecutionContext
  ): EitherT[Future, AppError, SubscriptionBatchDemand] =
    EitherT(dataStore.reportExpiredBatchItemReservation(tenant, reference))

  def renewReservation(
      tenant: TenantId,
      reference: SubscriptionBatchReference,
      token: String,
      expiresAt: DateTime
  )(implicit
      ec: ExecutionContext
  ): EitherT[Future, AppError, Option[SubscriptionBatchItemReservation]] =
    EitherT(
      dataStore.renewBatchItemReservation(tenant, reference, token, expiresAt)
    )

  /** Release only after the reserved operation has completed, never to retry an
    * ambiguous effect.
    */
  def releaseReservation(
      tenant: TenantId,
      reference: SubscriptionBatchReference,
      token: String
  )(implicit
      ec: ExecutionContext
  ): EitherT[Future, AppError, Option[SubscriptionBatchItemReservation]] =
    EitherT(dataStore.releaseBatchItemReservation(tenant, reference, token))

  def materializePendingItems(
      tenant: TenantId,
      limit: Int,
      batch: Option[SubscriptionBatchDemandId] = None
  )(implicit
      ec: ExecutionContext
  ): EitherT[Future, AppError, Seq[
    (SubscriptionBatchReference, Either[AppError, SubscriptionDemand])
  ]] =
    EitherT(
      dataStore.subscriptionBatchDemandRepo
        .findMaterializableItems(tenant, limit, batch)
    )
      .flatMap { references =>
        EitherT.liftF(
          references.foldLeft(
            Future.successful(
              Vector.empty[
                (
                    SubscriptionBatchReference,
                    Either[AppError, SubscriptionDemand]
                )
              ]
            )
          ) { (previous, reference) =>
            previous.flatMap { results =>
              materializeItem(tenant, reference.batch, reference.item).value
                .map(result => results :+ (reference -> result))
            }
          }
        )
      }

  def findRunnableChildren(
      tenant: TenantId,
      limit: Int,
      batch: Option[SubscriptionBatchDemandId] = None
  )(implicit
      ec: ExecutionContext
  ): EitherT[Future, AppError, Seq[SubscriptionBatchReference]] =
    EitherT(
      dataStore.subscriptionBatchDemandRepo
        .findRunnableChildren(tenant, limit, batch)
    )

  /** Internal worker operation: persist one child without executing its
    * workflow.
    */
  def materializeItem(
      tenant: TenantId,
      batch: SubscriptionBatchDemandId,
      item: SubscriptionBatchItemId
  )(implicit
      ec: ExecutionContext
  ): EitherT[Future, AppError, SubscriptionDemand] = {
    val reference = SubscriptionBatchReference(batch, item)
    EitherT(
      dataStore.subscriptionDemandRepo
        .findByBatchItem(tenant, reference)
        .flatMap {
          case Some(existing) =>
            dataStore.materializeBatchChild(existing, reference)
          case None =>
            (for {
              batchDemand <- EitherT.fromOptionF(
                dataStore.subscriptionBatchDemandRepo
                  .forTenant(tenant)
                  .findById(batch),
                AppError.EntityNotFound("Subscription batch")
              )
              selected <- EitherT.fromOption[Future](
                batchDemand.items.find(_.id == item),
                AppError.EntityNotFound("Subscription batch item")
              )
              selectedKeyringId <- EitherT.fromEither[Future](
                selected.keyringChoice match {
                  case SubscriptionBatchKeyringChoice.Existing(keyring) =>
                    Right(keyring)
                  case SubscriptionBatchKeyringChoice.New(creationId) =>
                    batchDemand.newKeyrings
                      .find(_.id == creationId)
                      .toRight(
                        AppError
                          .EntityNotFound("Subscription batch keyring creation")
                      )
                      .flatMap(
                        _.keyring.toRight(
                          AppError.EntityConflict(
                            "Subscription batch keyring is not ready"
                          )
                        )
                      )
                }
              )
              api <- EitherT.fromOptionF(
                dataStore.apiRepo.forTenant(tenant).findById(selected.api),
                AppError.ApiNotFound
              )
              plan <- EitherT.fromOptionF(
                dataStore.usagePlanRepo
                  .forTenant(tenant)
                  .findById(selected.plan),
                AppError.PlanNotFound
              )
              team <- EitherT.fromOptionF(
                dataStore.teamRepo.forTenant(tenant).findById(batchDemand.team),
                AppError.TeamNotFound
              )
              requester <- EitherT.fromOptionF(
                dataStore.userRepo.findById(batchDemand.from),
                AppError.UserNotFound(Some(batchDemand.from))
              )
              tenantSettings <- EitherT.fromOptionF(
                dataStore.tenantRepo.findById(tenant),
                AppError.TenantNotFound
              )
              _ <- EitherT.fromEither[Future](
                SubscriptionBatchEligibility.validate(
                  api,
                  plan,
                  team,
                  requester,
                  tenantSettings.subscriptionSecurity
                )
              )
              keyring <- EitherT.fromOptionF(
                dataStore.keyringRepo
                  .forTenant(tenant)
                  .findById(selectedKeyringId.value),
                AppError.EntityNotFound(s"Keyring ${selectedKeyringId.value}")
              )
              _ <- EitherT.fromEither[Future](
                SubscriptionBatchEligibility.validateKeyring(
                  batchDemand,
                  selected,
                  plan,
                  keyring
                )
              )
              child <- EitherT(
                dataStore.materializeBatchChild(tenant, reference)
              )
            } yield child).value
        }
    )
  }
}
