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
  )(implicit ec: ExecutionContext): Future[Seq[(SubscriptionBatchReference, Either[AppError, SubscriptionDemand])]] = {
    require(limit > 0, "The materialization limit must be positive")
    dataStore.subscriptionBatchDemandRepo.findMaterializableItems(tenant, limit).flatMap { references =>
      references.foldLeft(Future.successful(
        Vector.empty[(SubscriptionBatchReference, Either[AppError, SubscriptionDemand])]
      )) { (previous, reference) =>
        previous.flatMap { results =>
          materializeItem(tenant, reference.batch, reference.item).value
            .map(result => results :+ (reference -> result))
        }
      }
    }
  }

  /** Internal worker operation: persist one child without executing its workflow. */
  def materializeItem(
      tenant: TenantId,
      batch: SubscriptionBatchDemandId,
      item: SubscriptionBatchItemId
  )(implicit ec: ExecutionContext): EitherT[Future, AppError, SubscriptionDemand] =
    EitherT(dataStore.materializeBatchChild(
      tenant,
      SubscriptionBatchReference(batch, item)
    ))
}
