package fr.maif.daikoku.services

import cats.data.EitherT
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.controllers.AppError.{
  ApiKeyRotationConflict,
  ApiKeyRotationError,
  OtoroshiSettingsNotFound
}
import fr.maif.daikoku.domain
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.domain.json.OtoroshiApiKeyFormat
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.utils.{IdGenerator, OtoroshiClient}
import org.apache.pekko.http.scaladsl.util.FastFuture
import play.api.libs.json.*

import scala.concurrent.{ExecutionContext, Future}

/** Helpers around the Keyring (trousseau) entity.
  *
  * A Keyring owns the Otoroshi api key shared by every subscription referencing
  * it. Several subscriptions point to a single keyring; the unique Otoroshi api
  * key is recomputed on the fly by merging each referencing subscription. A
  * keyring lives as long as at least one subscription references it.
  */
class KeyringService(
    env: Env,
    otoroshiClient: OtoroshiClient
) {

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
      case None    => Future.successful(false)
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

  def toggleKeyringRotation(
      tenant: Tenant,
      keyring: Keyring,
      enabled: Boolean,
      rotationEvery: Long,
      gracePeriod: Long
  ): EitherT[Future, AppError, Keyring] = {
    import cats.implicits.*

    val keyringId = keyring.id;

    for {
      subscriptions <- EitherT.right[AppError](
        env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findNotDeleted(Json.obj("keyring" -> keyringId.asJson))
      )

      planIds = subscriptions.map(_.plan).distinct

      plans <- EitherT.right[AppError](
        env.dataStore.usagePlanRepo
          .forTenant(tenant)
          .findByIds(planIds)
      )

      isRotationLocked = plans.exists(_.autoRotation.getOrElse(false))

      _ <- EitherT.cond[Future](
        !isRotationLocked,
        (),
        ApiKeyRotationConflict
      )
      _ <- EitherT.cond[Future](
        rotationEvery > gracePeriod,
        (),
        ApiKeyRotationError(
          Json.obj(
            "error" -> "Rotation period can't be less or equal to grace period"
          )
        )
      )

      _ <- EitherT.cond[Future](
        rotationEvery > 0,
        (),
        ApiKeyRotationError(
          Json
            .obj(
              "error" -> "Rotation period can't be less or equal to zero"
            )
        )
      )
      _ <- EitherT.cond[Future](
        gracePeriod > 0,
        (),
        ApiKeyRotationError(
          Json.obj(
            "error" -> "Grace period can't be less or equal to zero"
          )
        )
      )
      otoSettings <- EitherT.fromOption[Future](
        keyring.otoroshiSettings match {
          case domain.KeyringOtoroshiBinding.Otoroshi(id) =>
            tenant.otoroshiSettings.find(_.id == id)
          case domain.KeyringOtoroshiBinding.Internal =>
            None
        },
        OtoroshiSettingsNotFound
      )

      keyring <- EitherT.fromOptionF[Future, AppError, Keyring](
        env.dataStore.keyringRepo
          .forTenant(tenant.id)
          .findById(keyringId),
        AppError.EntityNotFound(
          s"Keyring ${keyringId.value}"
        )
      )
      apiKey <- EitherT(
        otoroshiClient.getApikey(keyring.apiKey.clientId)(using otoSettings)
      )
      _ <- EitherT.liftF(
        // FIXME Use transaction
        otoroshiClient.updateApiKey(
          apiKey.copy(rotation =
            Some(
              ApiKeyRotation(
                enabled = enabled,
                rotationEvery = rotationEvery,
                gracePeriod = gracePeriod
              )
            )
          )
        )(using otoSettings)
      )

      updatedKeyring = keyring.copy(rotation =
        keyring.rotation
          .map(r =>
            r.copy(
              enabled = enabled,
              rotationEvery = rotationEvery,
              gracePeriod = gracePeriod
            )
          )
          .orElse(
            Some(
              ApiSubscriptionRotation(
                rotationEvery = rotationEvery,
                gracePeriod = gracePeriod
              )
            )
          )
      )
      _ <- EitherT.liftF(
        env.dataStore.keyringRepo
          .forTenant(tenant.id)
          .save(
            updatedKeyring
          )
      )

    } yield updatedKeyring
  }
}
