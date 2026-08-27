package fr.maif.daikoku.services

import fr.maif.daikoku.domain.*
import fr.maif.daikoku.domain.json.OtoroshiApiKeyFormat
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.utils.IdGenerator
import play.api.libs.json.*

import scala.concurrent.{ExecutionContext, Future}

/** Helpers around the Keyring (trousseau) entity.
  *
  * A Keyring owns the Otoroshi api key shared by every subscription referencing
  * it. Several subscriptions point to a single keyring; the unique Otoroshi api
  * key is recomputed on the fly by merging each referencing subscription. A
  * keyring lives as long as at least one subscription references it.
  */
class KeyringService(env: Env) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  /** Find a non-deleted keyring by id. */
  def findKeyring(
      tenant: TenantId,
      id: KeyringId
  ): Future[Option[Keyring]] =
    env.dataStore.keyringRepo.forTenant(tenant).findById(id)

  /** All non-deleted subscriptions referencing the given keyring. */
  def keyringSubscriptions(
      tenant: TenantId,
      keyring: KeyringId
  ): Future[Seq[ApiSubscription]] =
    env.dataStore.apiSubscriptionRepo.findByKeyring(tenant, keyring)

  /** Propagate the keyring's api key (the denormalized copy) to every
    * subscription referencing it. Must be called whenever a keyring's api key
    * is created or rotated.
    */
  def syncSubscriptionsApiKey(
      tenant: TenantId,
      keyring: Keyring
  ): Future[Long] =
    env.dataStore.apiSubscriptionRepo
      .updateApiKeyOfKeyring(
        tenant,
        keyring.id,
        OtoroshiApiKeyFormat.writes(keyring.apiKey)
      )

  /** Physically delete the keyring and enqueue the removal of its underlying
    * Otoroshi api key on the deletion queue (self-contained: the operation
    * carries the clientId and settings, since the row is gone). No-op when the
    * keyring is already gone, so callers can invoke this idempotently. Returns
    * true when the keyring was deleted.
    */
  def deleteKeyring(
      tenant: TenantId,
      keyring: KeyringId
  ): Future[Boolean] =
    env.dataStore.keyringRepo.forTenant(tenant).findById(keyring).flatMap {
      case None => Future.successful(false)
      case Some(k) =>
        // Resolve the full OtoroshiSettings now and embed them in the payload,
        // so the queued cleanup no longer needs the tenant (which may itself be
        // deleted before the queue runs).
        env.dataStore.tenantRepo.findById(tenant).flatMap { maybeTenant =>
          val otoroshiPayload = k.otoroshiSettings match {
            case KeyringOtoroshiBinding.Otoroshi(id) =>
              maybeTenant
                .flatMap(_.otoroshiSettings.find(_.id == id))
                .map(settings =>
                  Json.obj(
                    "clientId" -> k.apiKey.clientId,
                    "otoroshiSettings" ->
                      json.OtoroshiSettingsFormat.writes(settings)
                  )
                )
            case KeyringOtoroshiBinding.Internal => None
          }
          env.dataStore.withTransaction {
            for {
              _ <- env.dataStore.keyringRepo
                .forTenant(tenant)
                .deleteById(keyring)
              _ <- otoroshiPayload match {
                case Some(p) =>
                  env.dataStore.operationRepo
                    .forTenant(tenant)
                    .save(
                      Operation(
                        DatastoreId(IdGenerator.token(32)),
                        tenant = tenant,
                        itemId = k.id.value,
                        itemType = ItemType.Keyring,
                        action = OperationAction.Delete,
                        payload = Some(p)
                      )
                    )
                    .map(_ => ())
                case None => Future.successful(())
              }
            } yield true
          }
        }
    }

  /** Physically delete the keyring when no subscription references it anymore.
    */
  def deleteKeyringIfEmpty(
      tenant: TenantId,
      keyring: KeyringId
  ): Future[Boolean] =
    env.dataStore.apiSubscriptionRepo
      .countByKeyring(tenant, keyring)
      .flatMap {
        case 0L => deleteKeyring(tenant, keyring)
        case _  => Future.successful(false)
      }
}
