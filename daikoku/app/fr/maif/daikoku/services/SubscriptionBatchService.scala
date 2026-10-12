package fr.maif.daikoku.services

import cats.data.EitherT
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.storage.DataStore
import fr.maif.daikoku.utils.IdGenerator
import org.joda.time.DateTime

import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration.FiniteDuration

class SubscriptionBatchService(dataStore: DataStore) {
  def reserveItem(
      tenant: TenantId,
      reference: SubscriptionBatchReference,
      duration: FiniteDuration
  )(implicit ec: ExecutionContext): EitherT[Future, AppError, SubscriptionBatchItemReservation] = {
    if (duration.toMillis <= 0L)
      EitherT.leftT[Future, SubscriptionBatchItemReservation](
        AppError.BadRequestError("The subscription batch reservation duration must be positive")
      )
    else {
      val now = DateTime.now
      EitherT(dataStore.reserveBatchItem(
        tenant,
        reference,
        SubscriptionBatchItemReservation(IdGenerator.token(32), now, now.plus(duration.toMillis))
      ))
    }
  }

  def synchronizeItem(
      tenant: TenantId,
      reference: SubscriptionBatchReference,
      subscription: Option[ApiSubscriptionId] = None
  )(implicit ec: ExecutionContext): EitherT[Future, AppError, SubscriptionBatchDemand] =
    EitherT(dataStore.synchronizeBatchChild(tenant, reference, subscription))

  def reportExpiredReservation(
      tenant: TenantId,
      reference: SubscriptionBatchReference
  )(implicit ec: ExecutionContext): EitherT[Future, AppError, SubscriptionBatchDemand] =
    EitherT(dataStore.reportExpiredBatchItemReservation(tenant, reference))

  def renewReservation(
      tenant: TenantId,
      reference: SubscriptionBatchReference,
      token: String,
      expiresAt: DateTime
  )(implicit ec: ExecutionContext): EitherT[Future, AppError, Option[SubscriptionBatchItemReservation]] =
    EitherT(dataStore.renewBatchItemReservation(tenant, reference, token, expiresAt))

  /** Release only after the reserved operation has completed, never to retry an ambiguous effect. */
  def releaseReservation(
      tenant: TenantId,
      reference: SubscriptionBatchReference,
      token: String
  )(implicit ec: ExecutionContext): EitherT[Future, AppError, Option[SubscriptionBatchItemReservation]] =
    EitherT(dataStore.releaseBatchItemReservation(tenant, reference, token))

  def materializePendingItems(
      tenant: TenantId,
      limit: Int
  )(implicit
      ec: ExecutionContext
  ): EitherT[Future, AppError, Seq[(SubscriptionBatchReference, Either[AppError, SubscriptionDemand])]] =
    EitherT(dataStore.subscriptionBatchDemandRepo.findMaterializableItems(tenant, limit))
      .flatMap { references =>
        EitherT.liftF(
          references.foldLeft(Future.successful(
            Vector.empty[(SubscriptionBatchReference, Either[AppError, SubscriptionDemand])]
          )) { (previous, reference) =>
            previous.flatMap { results =>
              materializeItem(tenant, reference.batch, reference.item).value
                .map(result => results :+ (reference -> result))
            }
          }
        )
      }

  /** Internal worker operation: persist one child without executing its workflow. */
  def materializeItem(
      tenant: TenantId,
      batch: SubscriptionBatchDemandId,
      item: SubscriptionBatchItemId
  )(implicit ec: ExecutionContext): EitherT[Future, AppError, SubscriptionDemand] = {
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
                      .toRight(AppError.EntityNotFound("Subscription batch keyring creation"))
                      .flatMap(_.keyring.toRight(
                        AppError.EntityConflict("Subscription batch keyring is not ready")
                      ))
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
                dataStore.keyringRepo.forTenant(tenant).findById(selectedKeyringId.value),
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
