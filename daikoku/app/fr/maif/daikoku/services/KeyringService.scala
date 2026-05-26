package fr.maif.daikoku.services

import fr.maif.daikoku.domain.*
import fr.maif.daikoku.domain.json.OtoroshiApiKeyFormat
import fr.maif.daikoku.env.Env
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

  /** Logically delete the keyring when no subscription references it anymore.
    * The deletion of the underlying Otoroshi api key is the caller's
    * responsibility. Returns true when the keyring was deleted.
    */
  def deleteKeyringIfEmpty(
      tenant: TenantId,
      keyring: KeyringId
  ): Future[Boolean] =
    env.dataStore.apiSubscriptionRepo
      .forTenant(tenant)
      .count(Json.obj("keyring" -> keyring.asJson, "_deleted" -> false))
      .flatMap {
        case 0L =>
          env.dataStore.keyringRepo
            .forTenant(tenant)
            .deleteByIdLogically(keyring)
        case _ => Future.successful(false)
      }
}
