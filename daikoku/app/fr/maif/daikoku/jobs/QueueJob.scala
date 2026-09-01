package fr.maif.daikoku.jobs

import cats.data.{EitherT, OptionT}
import fr.maif.daikoku.controllers.{AppError, PaymentClient}
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.domain.OperationStatus
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.services.ApiService
import fr.maif.daikoku.utils.OtoroshiClient
import org.apache.pekko.actor.Cancellable
import org.apache.pekko.http.scaladsl.util.FastFuture
import play.api.Logger
import play.api.libs.json.*

import java.util.concurrent.atomic.AtomicReference
import fr.maif.daikoku.storage.DbConn

import scala.concurrent.duration.DurationInt
import scala.concurrent.{ExecutionContext, Future}

class QueueJob(
    env: Env,
    apiKeyStatsJob: ApiKeyStatsJob,
    apiService: ApiService,
    paymentClient: PaymentClient,
    otoroshiClient: OtoroshiClient,
    otoroshiSynchronizerJob: OtoroshiSynchronizerJob
) {
  private val logger = Logger("OtoroshiDeletionJob")

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  private val ref = new AtomicReference[Cancellable]()

  def start(): Unit = {
    if (ref.get() == null) {
      logger.info("Start deletion job")
      logger.info(s"deletion by cron ==> every ${env.config.deletionInterval}")
      ref.set(
        env.defaultActorSystem.scheduler
          .scheduleAtFixedRate(1.seconds, env.config.deletionInterval) { () =>
            deleteFirstOperation()
          }
      )
    }
  }

  def stop(): Unit = {
    Option(ref.get()).foreach(_.cancel())
  }

  // *************************
  // *** ELEMENTS DELETION ***
  // *************************

  private def deleteSubscriptionNotifications(
      subscription: ApiSubscription
  ): Future[Boolean] = {
    env.dataStore.keyringRepo
      .forTenant(subscription.tenant)
      .findById(subscription.keyring)
      .flatMap { maybeKeyring =>
        val repo =
          env.dataStore.notificationRepo.forTenant(subscription.tenant)
        val clientIdMatch =
          maybeKeyring.map(_ => " OR content->'action'->>'clientId' = $4")

        repo
          .execute(
            s"DELETE FROM ${repo.tableName} WHERE content->>'_tenant' = $$1 " +
              "AND (content->'action'->>'subscription' = $2 " +
              s"OR content->'action'->>'keyring' = $$3${clientIdMatch.getOrElse("")})",
            Seq(
              subscription.tenant.value,
              subscription.id.value,
              subscription.keyring.value
            ) ++ maybeKeyring.map(_.apiKey.clientId).toSeq
          )
          .map(_ => true)
      }
  }

  // The final DB writes (deleteById + deleteSubscriptionNotifications) are
  // atomic. The HTTP calls before them (archiveApiKey, syncForSubscription,
  // deleteThirdPartySubscription) are not transactional: if one succeeds and
  // the transaction then fails, the retry replays them. archiveApiKey and
  // deleteThirdPartySubscription tolerate that — Stripe treats a 404 as done.
  // TODO(transactions): otoroshiSynchronisator.run, inside archiveApiKey, does
  // not. If the Otoroshi sync fails on retry the subscription stays visible in
  // Otoroshi; fixing it properly needs a saga.
  private def deleteSubscription(o: Operation): Future[Unit] = {
    val value: EitherT[Future, AppError, Unit] = for {
      _ <- EitherT.liftF(
        env.dataStore.operationRepo
          .forTenant(o.tenant)
          .save(o.copy(status = OperationStatus.InProgress))
      )
      tenant <- EitherT.fromOptionF(
        env.dataStore.tenantRepo.findById(o.tenant),
        AppError.TenantNotFound
      )
      subscription <- EitherT.fromOptionF(
        env.dataStore.apiSubscriptionRepo
          .forTenant(o.tenant)
          .findById(o.itemId),
        AppError.EntityNotFound("subscription")
      )
      api <- EitherT.fromOptionF(
        env.dataStore.apiRepo
          .forTenant(o.tenant)
          .findById(subscription.api),
        AppError.ApiNotFound
      )
      plan <- EitherT.fromOptionF[Future, AppError, UsagePlan](
        env.dataStore.usagePlanRepo
          .forTenant(tenant)
          .findById(subscription.plan),
        AppError.PlanNotFound
      )
      _ <- EitherT.liftF(
        apiService.archiveApiKey(tenant, subscription, plan, enabled = false)
      )
      _ <- EitherT.liftF(
        apiKeyStatsJob
          .syncForSubscription(subscription, tenant, completed = true)
      )
      _ <- paymentClient.deleteThirdPartySubscription(
        subscription,
        plan.paymentSettings,
        subscription.thirdPartySubscriptionInformations
      )
      _ <- EitherT.liftF(
        env.dataStore.withTransaction {
          for {
            _ <- env.dataStore.apiSubscriptionRepo
              .forTenant(tenant)
              .deleteById(subscription.id)
            _ <- deleteSubscriptionNotifications(subscription)
          } yield ()
        }
      )
    } yield ()

    value.value
      .flatMap {
        case Left(error) =>
          logger.error(
            s"[deletion job] :: [id ${o.id.value}] :: error during deletion of subscription ${o.itemId}: ${error
                .getErrorMessage()}"
          )
          env.dataStore.operationRepo
            .forTenant(o.tenant)
            .save(o.copy(status = OperationStatus.Error))
            .map(_ => ())
        case Right(_) =>
          logger.debug(
            s"[deletion job] :: subscription ${o.itemId} successfully deleted"
          )
          env.dataStore.operationRepo.forTenant(o.tenant).deleteById(o.id)
      }
      .map(_ => ())
  }

  // The keyring DB row is already gone — DeletionService removes it physically
  // in the request transaction. This operation only carries the deferred
  // Otoroshi apikey removal, fully self-contained in its payload {clientId,
  // otoroshiSettings} — the OtoroshiSettings are embedded, not resolved from
  // the tenant, so the cleanup survives the tenant itself being deleted.
  // Idempotent: a missing apikey (already deleted → 404) is logged and treated
  // as done, so a retry converges.
  private def deleteKeyring(o: Operation): Future[Unit] = {
    val clientId = o.payload.flatMap(p => (p \ "clientId").asOpt[String])
    val settings = o.payload.flatMap(p =>
      (p \ "otoroshiSettings").asOpt(using json.OtoroshiSettingsFormat)
    )

    (for {
      cid <- OptionT.fromOption[Future](clientId)
      s <- OptionT.fromOption[Future](settings)
      _ <- OptionT.liftF(
        otoroshiClient.deleteApiKey(cid)(using s).value.map {
          case Left(error) =>
            logger.warn(
              s"[deletion job] :: otoroshi apikey $cid already gone or unreachable: ${error.getErrorMessage()}"
            )
          case Right(_) => ()
        }
      )
    } yield ())
      .getOrElse(
        logger.warn(
          s"[deletion job] :: keyring operation ${o.id.value} carries no resolvable otoroshi target, skipping"
        )
      )
      .flatMap(_ =>
        env.dataStore.operationRepo.forTenant(o.tenant).deleteById(o.id)
      )
      .map(_ =>
        logger.debug(
          s"[deletion job] :: keyring otoroshi cleanup ${o.itemId} done"
        )
      )
      .recover(e => {
        logger.error(
          s"[deletion job] :: [id ${o.id.value}] :: error during otoroshi cleanup of keyring ${o.itemId}: $e"
        )
        env.dataStore.operationRepo
          .forTenant(o.tenant)
          .save(o.copy(status = OperationStatus.Error))
      })
  }

  // Recompute the Otoroshi apikey of a keyring that survived a subscription
  // deletion (some subscriptions removed, at least one remaining). The keyring
  // row is still in DB, so the synchronizer re-reads it by id.
  private def syncKeyring(o: Operation): Future[Unit] = {
    (for {
      tenant <- OptionT(
        env.dataStore.tenantRepo.findById(o.tenant.value)
      )
      _ <- OptionT.liftF(
        otoroshiSynchronizerJob.run(KeyringId(o.itemId), tenant)
      )
    } yield ())
      .getOrElse(())
      .flatMap(_ =>
        env.dataStore.operationRepo.forTenant(o.tenant).deleteById(o.id)
      )
      .map(_ =>
        logger.debug(
          s"[deletion job] :: keyring otoroshi recompute ${o.itemId} done"
        )
      )
      .recover(e => {
        logger.error(
          s"[deletion job] :: [id ${o.id.value}] :: error during otoroshi recompute of keyring ${o.itemId}: $e"
        )
        env.dataStore.operationRepo
          .forTenant(o.tenant)
          .save(o.copy(status = OperationStatus.Error))
      })
  }

  // ***************************
  // *** THIRD PARTY PAYMENT ***
  // ***************************

  // TODO(transactions): syncWithThirdParty (Stripe usage records) is additive.
  // If deleteById fails the operation is replayed and Stripe receives a second
  // consumption record. A complete fix needs a "synced" flag on
  // ApiKeyConsumption, so a schema change.
  private def syncConsumption(o: Operation): Future[Unit] = {
    logger.debug("*** SYNC CONSUmPTION AS OPERATION***")
    logger.debug(Json.prettyPrint(o.asJson))
    logger.debug("**********************************************")

    val settingsAndInfos = o.payload.map(payload =>
      (
        (payload \ "paymentSettings").asOpt(using json.PaymentSettingsFormat),
        (payload \ "thirdPartySubscriptionInformations").asOpt(using
          json.ThirdPartySubscriptionInformationsFormat
        )
      )
    )

    (for {
      consumption <- OptionT(
        env.dataStore.consumptionRepo
          .forTenant(o.tenant)
          .findById(o.itemId)
      )
      _ <- OptionT(
        Future
          .sequence(settingsAndInfos.map { case (settings, informations) =>
            paymentClient
              .syncWithThirdParty(consumption, settings, informations)
          }.toList)
          .map(_.headOption)
      )
      _ <- OptionT.liftF(
        env.dataStore.operationRepo.forTenant(o.tenant).deleteById(o.id)
      )
    } yield ()).value.map(_ => ())
  }

  // deleteStripeSubscription ignores the HTTP status (EitherT.liftF), so a
  // Stripe 404 on retry counts as a success: a failed deleteById resolves
  // itself on the next attempt.
  private def deleteThirdPartySubscription(o: Operation): Future[Unit] = {
    logger.debug("*** DELETE THiRD PartY SubSCRIPTion AS OPERATION***")
    logger.debug(Json.prettyPrint(o.asJson))
    logger.debug("**********************************************")

    val settingsAndInfos = o.payload.map(payload =>
      (
        (payload \ "paymentSettings").asOpt(using json.PaymentSettingsFormat),
        (payload \ "thirdPartySubscriptionInformations").asOpt(using
          json.ThirdPartySubscriptionInformationsFormat
        )
      )
    )

    (for {
      _ <- EitherT.right[AppError](
        env.dataStore.operationRepo
          .forTenant(o.tenant)
          .save(o.copy(status = OperationStatus.InProgress))
      )
      apiSubscription <- EitherT.fromOptionF(
        env.dataStore.apiSubscriptionRepo
          .forTenant(o.tenant)
          .findById(o.itemId),
        AppError.EntityNotFound("api subscription")
      )
      _ <- settingsAndInfos match {
        case Some((settings, informations)) =>
          paymentClient.deleteThirdPartySubscription(
            apiSubscription,
            settings,
            informations
          )
        case _ =>
          EitherT.left[JsValue](
            AppError.EntityConflict("operation payload").future()
          )
      }
    } yield ()).value
      .map {
        case Left(value) =>
          logger.error(
            s"[QUEUE JOB] :: ${o.id.value} :: ERROR : ${value.getErrorMessage()}"
          )
          env.dataStore.operationRepo
            .forTenant(o.tenant)
            .save(o.copy(status = OperationStatus.Error))

        case Right(_) =>
          env.dataStore.operationRepo.forTenant(o.tenant).deleteById(o.id)
      }
      .flatten
      .map(_ => ())
  }

  // archiveStripeProduct and archiveStripePrices treat a 404 as a success, so
  // they are idempotent on retry: if deleteById fails after the payment call,
  // the retry hits Stripe again, gets "already archived", and deleteById is
  // attempted once more until it succeeds.
  private def deleteThirdPartyProduct(o: Operation): Future[Unit] = {
    logger.debug("*** DELETE THiRD PartY product AS OPERATION***")
    logger.debug(Json.prettyPrint(o.asJson))
    logger.debug("**********************************************")

    val maybeSettings: Option[PaymentSettings] = o.payload.flatMap(settings =>
      (settings \ "paymentSettings").asOpt(using json.PaymentSettingsFormat)
    )

    (for {
      _ <- EitherT.right[AppError](
        env.dataStore.operationRepo
          .forTenant(o.tenant)
          .save(o.copy(status = OperationStatus.InProgress))
      )
      _ <- maybeSettings match {
        case Some(settings) =>
          paymentClient.deleteThirdPartyProduct(settings, o.tenant)
        case _ =>
          EitherT.left[JsValue](
            AppError.EntityConflict("operation payload").future()
          )
      }
    } yield ()).value
      .map {
        case Left(value) =>
          logger.error(
            s"[QUEUE JOB] :: ${o.id.value} :: ERROR : ${value.getErrorMessage()}"
          )
          env.dataStore.operationRepo
            .forTenant(o.tenant)
            .save(o.copy(status = OperationStatus.Error))

        case Right(_) =>
          env.dataStore.operationRepo.forTenant(o.tenant).deleteById(o.id)
      }
      .flatten
      .map(_ => ())
  }

//  private def deleteThirdPartyProduct(o: Operation): Future[Unit] = {
//    env.dataStore.operationRepo.forTenant(o.tenant).save(o.copy(status = OperationStatus.InProgress))
//      .flatMap(_ => o.payload match {
//        case Some(settings) => json.PaymentSettingsFormat.reads(settings) match {
//          case JsSuccess(paymentSettings, _) => paymentClient.deleteThirdPartyProduct(paymentSettings, o.tenant).value
//            .flatMap(_ => env.dataStore.operationRepo.forTenant(o.tenant).deleteById(o.id))
//          case JsError(_) => env.dataStore.operationRepo.forTenant(o.tenant).save(o.copy(status = OperationStatus.Error))
//        }
//        case None => env.dataStore.operationRepo.forTenant(o.tenant).save(o.copy(status = OperationStatus.Error))
//      }).map(_ => ())
//  }

  // ***************************
  // ***************************

  def deleteFirstOperation(): Future[Unit] = {

    val value: EitherT[Future, Unit, Unit] = for {
      alreadyRunning <- EitherT.liftF(
        env.dataStore.operationRepo.existsInProgress()
      )
      _ <- EitherT.cond[Future][Unit, Unit](!alreadyRunning, (), ())
      firstOperation <- EitherT.fromOptionF[Future, Unit, Operation](
        env.dataStore.operationRepo.findFirstIdle(),
        ()
      )
      _ <-
        EitherT.liftF((firstOperation.itemType, firstOperation.action) match {
          case (ItemType.Subscription, OperationAction.Delete) =>
            deleteSubscription(firstOperation)
          case (ItemType.Keyring, OperationAction.Delete) =>
            deleteKeyring(firstOperation)
          case (ItemType.Keyring, OperationAction.Sync) =>
            syncKeyring(firstOperation)
          case (ItemType.ThirdPartySubscription, OperationAction.Delete) =>
            deleteThirdPartySubscription(firstOperation)
          case (ItemType.ThirdPartyProduct, OperationAction.Delete) =>
            deleteThirdPartyProduct(firstOperation)
          case (ItemType.ApiKeyConsumption, OperationAction.Sync) =>
            syncConsumption(firstOperation)
          case (_, _) => FastFuture.successful(())
        })
      _ <- EitherT.liftF(deleteFirstOperation())
    } yield ()
    value.merge
  }
}
