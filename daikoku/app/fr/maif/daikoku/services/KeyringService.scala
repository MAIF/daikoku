package fr.maif.daikoku.services

import cats.data.EitherT
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.controllers.AppError.{
  ApiKeyRotationConflict,
  ApiKeyRotationError,
  OtoroshiSettingsNotFound
}
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.domain.json.OtoroshiApiKeyFormat
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.utils.{IdGenerator, OtoroshiClient}
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

  /** Logically delete the keyring when no subscription references it anymore.
    */
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

  def toggleKeyringRotation(
      tenant: Tenant,
      keyringId: String,
      enabled: Boolean,
      rotationEvery: Long,
      gracePeriod: Long
  ): EitherT[Future, AppError, JsObject] = {
    import cats.implicits.*

    for {
      subscriptions <- EitherT.right[AppError](
        env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findNotDeleted(Json.obj("keyring" -> keyringId))
      )

      subscription <- EitherT.fromOption[Future](
        subscriptions.headOption,
        AppError.EntityNotFound(s"Subscription for keyring $keyringId")
      )

      planOpt <- EitherT.right[AppError](
        env.dataStore.usagePlanRepo
          .forTenant(tenant)
          .findById(subscription.plan)
      )

      plan <- EitherT.fromOption[Future](
        planOpt,
        AppError.EntityNotFound(s"Plan ${subscription.plan}")
      )

      autorotation = planOpt.flatMap(_.autoRotation).getOrElse(false)

//      autorotation <- EitherT.right[AppError](subscriptions match {
//        case sub :: nil =>
//          env.dataStore.usagePlanRepo
//            .forTenant(tenant)
//            .findById(sub.plan)
//            .map(_.flatMap(_.autoRotation).getOrElse(false))
//        case _ => Future.successful(false)
//      })

      _ <- EitherT.cond[Future](
        autorotation,
        (),
        ApiKeyRotationConflict
      )
      _ <- EitherT.cond[Future](
        rotationEvery > gracePeriod,
        (),
        ApiKeyRotationError(
          Json.obj(
            "error" -> "Rotation period can't ben less or equal to grace period"
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
        plan.otoroshiTarget
          .map(_.otoroshiSettings)
          .flatMap(id => tenant.otoroshiSettings.find(_.id == id)),
        OtoroshiSettingsNotFound
      )

      keyring <- EitherT.fromOptionF[Future, AppError, Keyring](
        env.dataStore.keyringRepo
          .forTenant(tenant.id)
          .findById(subscription.keyring),
        AppError.EntityNotFound(
          s"Keyring ${subscription.keyring.value}"
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
      _ <- EitherT.liftF(
        env.dataStore.keyringRepo
          .forTenant(tenant.id)
          .save(
            keyring.copy(rotation =
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
          )
      )
      updatedSubscription <- EitherT.right[AppError](
        env.dataStore.apiSubscriptionRepo
          .forTenant(tenant.id)
          .findById(subscription.id)
      )

    } yield Json
      .obj(
        "subscription" -> updatedSubscription.get.asSafeJson(keyring)
      )
  }
}
