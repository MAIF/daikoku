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

  private def deleteUsagePlan(o: Operation): Future[Unit] = {
    env.dataStore
      .withTransaction {
        (for {
          _ <- OptionT.liftF(
            env.dataStore.operationRepo
              .forTenant(o.tenant)
              .save(o.copy(status = OperationStatus.InProgress))
          )
          plan <- OptionT(
            env.dataStore.usagePlanRepo
              .forTenant(o.tenant)
              .findByIdIncludingDeleted(o.itemId)
          )
          _ <- OptionT.liftF(
            plan.documentation match {
              case Some(doc) =>
                env.dataStore.apiDocumentationPageRepo
                  .forTenant(o.tenant)
                  .deleteByIds(
                    doc.docIds().map(ApiDocumentationPageId.apply)
                  )
              case None => FastFuture.successful(false)
            }
          )
          _ <- OptionT.liftF(
            env.dataStore.subscriptionDemandRepo
              .forAllTenant()
              .execute(
                s"""
                 |WITH deleted_demands AS (
                 |  DELETE FROM subscription_demands
                 |  WHERE content->>'_tenant' = $$1
                 |    AND content->>'plan' = $$2
                 |    AND content->>'state' IN ('${SubscriptionDemandState.Waiting.name}', '${SubscriptionDemandState.InProgress.name}')
                 |  RETURNING _id AS demand_id
                 |)
                 |DELETE FROM step_validators
                 |WHERE content->>'subscriptionDemand' IN (SELECT demand_id FROM deleted_demands);
                 |""".stripMargin,
                Seq(o.tenant.value, o.itemId)
              )
          )
          _ <- OptionT.liftF(
            {
              val repo =
                env.dataStore.notificationRepo.forTenant(o.tenant)
              repo.execute(
                s"DELETE FROM ${repo.tableName} " +
                  "WHERE content->>'_tenant' = $1 " +
                  "AND content->'action'->>'plan' = $2",
                Seq(o.tenant.value, o.itemId)
              )
            }
          )
          _ <- OptionT.liftF(
            env.dataStore.usagePlanRepo.forTenant(o.tenant).deleteById(plan.id)
          )
          _ <- OptionT.liftF(
            env.dataStore.operationRepo.forTenant(o.tenant).deleteById(o.id)
          )
        } yield ()).value
      }
      .map(_ =>
        logger.debug(
          s"[deletion job] :: usage plan ${o.itemId} successfully deleted"
        )
      )
      .recover(e => {
        logger.error(
          s"[deletion job] :: [id ${o.id.value}] :: error during deletion of plan ${o.itemId}: $e"
        )
        env.dataStore.operationRepo
          .forTenant(o.tenant)
          .save(o.copy(status = OperationStatus.Error))
      })
  }

  private def deleteSubscriptionNotifications(
      subscription: ApiSubscription
  ): Future[Boolean] = {
    env.dataStore.keyringRepo
      .forTenant(subscription.tenant)
      .findByIdIncludingDeleted(subscription.keyring)
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

  private def deleteTeamNotifications(
      team: Team
  )(implicit dbConn: DbConn): Future[Boolean] = {
    val repo = env.dataStore.notificationRepo.forTenant(team.tenant)
    repo
      .execute(
        s"DELETE FROM ${repo.tableName} WHERE content->>'_tenant' = $$1 " +
          "AND content->'action'->>'team' = $2 " +
          "AND content->'action'->>'type' = ANY($3::text[])",
        Seq(
          team.tenant.value,
          team.id.value,
          Array(
            "TeamInvitation",
            "ApiSubscription",
            "ApiSubscriptionAccept",
            "ApiSubscriptionReject",
            "TransferApiOwnership"
          )
        )
      )
      .map(_ => true)
  }

//  private def deleteThirdPartyPaymentClient(team: Team) = {
//    env.dataStore.tenantRepo.findByIdIncludingDeleted(team.tenant).flatMap {
//      case Some(tenant) =>
//        Future.sequence(tenant.thirdPartyPaymentSettings.map {
//          case p: ThirdPartyPaymentSettings.StripeSettings =>
//            paymentClient.deleteStripeClient(team)(p)
//        })
//      case None => FastFuture.successful(())
//    }
//  }

  private def deleteUserNotifications(
      user: User,
      tenant: TenantId
  )(implicit dbConn: DbConn): Future[Boolean] = {
    val repo = env.dataStore.notificationRepo.forTenant(tenant)
    repo
      .execute(
        s"DELETE FROM ${repo.tableName} WHERE content->>'_tenant' = $$1 " +
          "AND content->'action'->>'type' = 'TeamInvitation' " +
          "AND content->'action'->>'user' = $2",
        Seq(tenant.value, user.id.value)
      )
      .map(_ => true)
  }

  private def deleteUserMessages(user: User, tenant: TenantId)(implicit
      dbConn: DbConn
  ): Future[Boolean] = {
    env.dataStore.teamRepo
      .findAdminTeam(tenant)
      .flatMap {
        case Some(adminTeam)
            if !adminTeam.users.exists(u => u.userId == user.id) => {
          val repo = env.dataStore.messageRepo.forTenant(tenant)
          repo
            .execute(
              s"DELETE FROM ${repo.tableName} " +
                "WHERE content->>'_tenant' = $1 " +
                "AND (content->>'sender' = $2 " +
                "OR content->'participants' @> to_jsonb($2::text))",
              Seq(tenant.value, user.id.value)
            )
            .map(_ > 0)
        }
        case _ => FastFuture.successful(false)
      }
  }

  // Les DB writes finaux (deleteByIdLogically + deleteSubscriptionNotifications) sont atomiques.
  // Les appels HTTP précédents (archiveApiKey, syncForSubscription, deleteThirdPartySubscription) restent
  // non transactionnables : si l'un réussit et la transaction DB échoue, le retry repassera les HTTP.
  // archiveApiKey et deleteThirdPartySubscription sont idempotents (Stripe ignore les 404).
  // TODO(transactions): otoroshiSynchronisator.run (dans archiveApiKey) n'est pas idempotent —
  // si le sync Otoroshi échoue sur retry, la subscription reste visible dans Otoroshi. Nécessite saga.
  private def deleteSubscription(o: Operation): Future[Unit] = {
    val value: EitherT[Future, AppError, Unit] = for {
      _ <- EitherT.liftF(
        env.dataStore.operationRepo
          .forTenant(o.tenant)
          .save(o.copy(status = OperationStatus.InProgress))
      )
      tenant <- EitherT.fromOptionF(
        env.dataStore.tenantRepo.findByIdIncludingDeleted(o.tenant),
        AppError.TenantNotFound
      )
      subscription <- EitherT.fromOptionF(
        env.dataStore.apiSubscriptionRepo
          .forTenant(o.tenant)
          .findByIdIncludingDeleted(o.itemId),
        AppError.EntityNotFound("subscription")
      )
      api <- EitherT.fromOptionF(
        env.dataStore.apiRepo
          .forTenant(o.tenant)
          .findByIdIncludingDeleted(subscription.api),
        AppError.ApiNotFound
      )
      plan <- EitherT.fromOptionF[Future, AppError, UsagePlan](
        env.dataStore.usagePlanRepo
          .forTenant(tenant)
          .findByIdIncludingDeleted(subscription.plan),
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

  private def deleteTeam(o: Operation): Future[Unit] = {
    env.dataStore
      .withTransaction {
        (for {
          team <- OptionT(
            env.dataStore.teamRepo
              .forTenant(o.tenant)
              .findByIdIncludingDeleted(o.itemId)
          )
          _ <- OptionT.liftF(
            env.dataStore.operationRepo
              .forTenant(o.tenant)
              .save(o.copy(status = OperationStatus.InProgress))
          )
          _ <- OptionT.liftF(deleteTeamNotifications(team))
          _ <- OptionT.liftF(
            env.dataStore.teamRepo.forTenant(o.tenant).deleteById(team.id)
          )
          _ <- OptionT.liftF(
            env.dataStore.operationRepo.forTenant(o.tenant).deleteById(o.id)
          )
        } yield ()).value
      }
      .map(_ =>
        logger.debug(s"[deletion job] :: team ${o.itemId} successfully deleted")
      )
      .recover(e => {
        logger.error(
          s"[deletion job] :: [id ${o.id}] :: error during deletion of team ${o.itemId}: $e"
        )
        env.dataStore.operationRepo
          .forTenant(o.tenant)
          .save(o.copy(status = OperationStatus.Error))
      })
  }

  private def deleteUser(o: Operation): Future[Unit] = {
    env.dataStore
      .withTransaction {
        (for {
          user <- OptionT(
            env.dataStore.userRepo.findByIdIncludingDeleted(o.itemId)
          )
          _ <- OptionT.liftF(
            env.dataStore.operationRepo
              .forTenant(o.tenant)
              .save(o.copy(status = OperationStatus.InProgress))
          )
          _ <- OptionT.liftF(deleteUserNotifications(user, o.tenant))
          _ <- OptionT.liftF(deleteUserMessages(user, o.tenant))
          _ <- OptionT.liftF(env.dataStore.userRepo.deleteById(user.id))
          _ <- OptionT.liftF(
            env.dataStore.operationRepo.forTenant(o.tenant).deleteById(o.id)
          )
        } yield ()).value
      }
      .map(_ =>
        logger.debug(s"[deletion job] :: user ${o.itemId} successfully deleted")
      )
      .recover(e => {
        logger.error(
          s"[deletion job] :: [id ${o.id}] :: error during deletion of user ${o.itemId}: $e"
        )
        env.dataStore.operationRepo
          .forTenant(o.tenant)
          .save(o.copy(status = OperationStatus.Error))
      })
  }

  // The keyring DB row is already gone — DeletionService removes it physically
  // in the request transaction. This operation only carries the deferred
  // Otoroshi apikey removal, described by its payload {clientId,
  // otoroshiSettings}. Idempotent: a missing apikey (already deleted → 404) is
  // logged and treated as done, so a retry converges.
  private def deleteKeyring(o: Operation): Future[Unit] = {
    val clientId = o.payload.flatMap(p => (p \ "clientId").asOpt[String])
    val settingsId = o.payload.flatMap(p => (p \ "otoroshiSettings").asOpt[String])

    (for {
      tenant <- OptionT(
        env.dataStore.tenantRepo.findByIdIncludingDeleted(o.tenant.value)
      )
      cid <- OptionT.fromOption[Future](clientId)
      sid <- OptionT.fromOption[Future](settingsId)
      settings <- OptionT.fromOption[Future](
        tenant.otoroshiSettings.find(_.id.value == sid)
      )
      _ <- OptionT.liftF(
        otoroshiClient.deleteApiKey(cid)(using settings).value.map {
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
        env.dataStore.tenantRepo.findByIdIncludingDeleted(o.tenant.value)
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

  // TODO(transactions): syncWithThirdParty (Stripe usage records) est additif.
  // Si deleteById échoue, l'opération est rejouée et Stripe reçoit un deuxième enregistrement de consommation.
  // Fix complet nécessite un flag "synced" sur ApiKeyConsumption (modification de schéma).
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

  // deleteStripeSubscription ignore le status HTTP (EitherT.liftF) → Stripe 404 sur retry traité comme succès.
  // Le retry résout donc automatiquement un échec de deleteById.
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
          .findByIdIncludingDeleted(o.itemId),
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

  // archiveStripeProduct et archiveStripePrices traitent maintenant 404 comme succès → idempotent sur retry.
  // TODO(transactions): si deleteById échoue après le payment, le retry appelle Stripe à nouveau.
  // Stripe renvoie 404 (already archived) → traité comme succès → deleteById retentée → résolution automatique.
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
          case (ItemType.UsagePlan, OperationAction.Delete) =>
            deleteUsagePlan(firstOperation)
          case (ItemType.Team, OperationAction.Delete) =>
            deleteTeam(firstOperation)
          case (ItemType.User, OperationAction.Delete) =>
            deleteUser(firstOperation)
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
