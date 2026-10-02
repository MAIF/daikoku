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
    otoroshiClient: OtoroshiClient,
    deletionService: DeletionService
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

  /** Delete the keyring with its subscriptions. deleteSubscriptions drops the
    * keyring and its Otoroshi api key along with its last subscription; a
    * keyring without subscription is deleted directly.
    */
  def deleteKeyring(
      tenant: Tenant,
      keyring: Keyring
  ): EitherT[Future, AppError, Unit] = {
    import cats.implicits.*

    for {
      subscriptions <- EitherT.liftF[Future, AppError, Seq[ApiSubscription]](
        env.dataStore.apiSubscriptionRepo.findByKeyring(tenant.id, keyring.id)
      )
      apis <- EitherT.liftF[Future, AppError, Seq[Api]](
        env.dataStore.apiRepo
          .forTenant(tenant)
          .findByIds(subscriptions.map(_.api).distinct)
      )
      _ <- subscriptions.groupBy(_.api).toList.traverse { case (apiId, subs) =>
        EitherT
          .fromOption[Future][AppError, Api](
            apis.find(_.id == apiId),
            AppError.ApiNotFound
          )
          .flatMap(api => deletionService.deleteSubscriptions(subs, api, tenant))
      }
      _ <- EitherT.liftF[Future, AppError, Unit](
        if (subscriptions.isEmpty) deleteEmptyKeyring(tenant, keyring)
        else Future.unit
      )
    } yield ()
  }

  private def deleteEmptyKeyring(tenant: Tenant, keyring: Keyring): Future[Unit] =
    env.dataStore.withTransaction {
      for {
        _ <- env.dataStore.keyringRepo.forTenant(tenant).deleteById(keyring.id)
        _ <- deletionService.otoroshiTargetPayload(keyring, tenant) match {
          case Some(payload) =>
            env.dataStore.operationRepo
              .forTenant(tenant)
              .save(
                Operation(
                  DatastoreId(IdGenerator.token(32)),
                  tenant = tenant.id,
                  itemId = keyring.id.value,
                  itemType = ItemType.Keyring,
                  action = OperationAction.Delete,
                  payload = Some(payload)
                )
              )
              .map(_ => ())
          case None => Future.unit
        }
      } yield ()
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
          .findByKeyring(tenant.id, keyringId)
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
      _ <- EitherT.right[AppError](
        env.dataStore.keyringRepo
          .forTenant(tenant.id)
          .save(
            updatedKeyring
          )
      )

    } yield updatedKeyring
  }
}
