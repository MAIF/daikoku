package fr.maif.daikoku.services

import fr.maif.daikoku.domain.*
import fr.maif.daikoku.domain.json.OtoroshiApiKeyFormat
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.utils.IdGenerator
import play.api.libs.json.*

import scala.concurrent.{ExecutionContext, Future}

/** Helpers around the Keyring (trousseau) entity.
  *
  * A Keyring owns the Otoroshi api key shared by every subscription
  * referencing it. Several subscriptions point to a single keyring; the unique
  * Otoroshi api key is recomputed on the fly by merging each referencing
  * subscription. A keyring lives as long as at least one subscription
  * references it.
  */
class KeyringService(env: Env) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  /** Find a non-deleted keyring by id. */
  def findKeyring(
      tenant: TenantId,
      id: KeyringId
  ): Future[Option[Keyring]] =
    env.dataStore.keyringRepo.forTenant(tenant).findByIdNotDeleted(id)

  /** All non-deleted subscriptions referencing the given keyring. */
  def keyringSubscriptions(
      tenant: TenantId,
      keyring: KeyringId
  ): Future[Seq[ApiSubscription]] =
    env.dataStore.apiSubscriptionRepo
      .forTenant(tenant)
      .findNotDeleted(Json.obj("keyring" -> keyring.asJson))

  /** Propagate the keyring's api key (the denormalized copy) to every
    * subscription referencing it. Must be called whenever a keyring's api key
    * is created or rotated.
    */
  def syncSubscriptionsApiKey(
      tenant: TenantId,
      keyring: Keyring
  ): Future[Long] =
    env.dataStore.apiSubscriptionRepo
      .forTenant(tenant)
      .updateManyByQuery(
        Json.obj("keyring" -> keyring.id.asJson),
        Json.obj(
          "$set" -> Json.obj(
            "apiKey" -> OtoroshiApiKeyFormat.writes(keyring.apiKey)
          )
        )
      )

  /** Logically delete the keyring and enqueue its physical deletion in the
    * deletion queue. The operation is only enqueued when the keyring was not
    * already flagged deleted, so callers can invoke this idempotently without
    * piling up duplicate operations. The deletion of the underlying Otoroshi
    * api key is the caller's responsibility. Returns true when the keyring was
    * deleted.
    */
  def deleteKeyring(
      tenant: TenantId,
      keyring: KeyringId
  ): Future[Boolean] =
    env.dataStore.keyringRepo
      .forTenant(tenant)
      .deleteByIdLogically(keyring)
      .flatMap {
        case true =>
          env.dataStore.operationRepo
            .forTenant(tenant)
            .save(
              Operation(
                DatastoreId(IdGenerator.token(32)),
                tenant = tenant,
                itemId = keyring.value,
                itemType = ItemType.Keyring,
                action = OperationAction.Delete
              )
            )
            .map(_ => true)
        case false => Future.successful(false)
      }

  /** Logically delete the keyring when no subscription references it anymore. */
  def deleteKeyringIfEmpty(
      tenant: TenantId,
      keyring: KeyringId
  ): Future[Boolean] =
    env.dataStore.apiSubscriptionRepo
      .forTenant(tenant)
      .count(Json.obj("keyring" -> keyring.asJson, "_deleted" -> false))
      .flatMap {
        case 0L => deleteKeyring(tenant, keyring)
        case _  => Future.successful(false)
      }
}
