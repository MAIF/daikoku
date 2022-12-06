package jobs

import akka.actor.Cancellable
import akka.http.scaladsl.util.FastFuture
import akka.kafka.Subscription
import cats.data.OptionT
import fr.maif.otoroshi.daikoku.domain.{Api, ApiSubscription, ItemType, NotificationAction, Operation, OperationAction, OperationStatus, Team, Tenant, TenantId, User, UserId, json}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.{ApiService, IdGenerator, OtoroshiClient, Translator}
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json.{JsArray, JsError, JsNumber, JsString, JsSuccess, Json}

import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration.DurationInt

class DeletionJob(
    env: Env,
    apiKeyStatsJob: ApiKeyStatsJob,
    apiService: ApiService
) {
  private val logger = Logger("OtoroshiDeletionJob")

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  private val ref = new AtomicReference[Cancellable]()

  def start(): Unit = {
    if (!env.config.deletionByCron && ref.get() == null) {
      logger.info("Start deletion job")
      logger.info(
        s"deletion by cron ==> every ${env.config.deletionInterval}")
      ref.set(
        env.defaultActorSystem.scheduler
          .scheduleAtFixedRate(10.seconds, env.config.deletionInterval) {
            () => deleteFirstOperation()
          }
      )
    }
  }

  def stop(): Unit = {
    Option(ref.get()).foreach(_.cancel())
  }

  private def deleteApiNotifications(api: Api): Future[Boolean] = {
    env.dataStore.notificationRepo.forTenant(api.tenant).deleteLogically(Json.obj(
      "action.type" ->
        Json.obj("$in" -> JsArray(Seq(
          "ApiAccess", "ApiSubscription", "ApiSubscriptionAccept", "ApiSubscriptionReject",
          "NewPostPublished", "NewIssueOpen", "NewCommentOnIssue", "TransferApiOwnership"
        ).map(JsString))),
      "$or" -> Json.arr(
        Json.obj("action.api" -> api.id.asJson),
        Json.obj("action.apiName" -> JsString(api.name)),
      )
    ))
  }

  private def deleteSubscriptionNotifications(subscription: ApiSubscription): Future[Boolean] = {
    env.dataStore.notificationRepo.forTenant(subscription.tenant).deleteLogically(Json.obj(
      "action.type" ->
        Json.obj("$in" -> JsArray(Seq(
          "ApiKeyRotationInProgress", "ApiKeyRotationEndend", "ApiKeyRefresh"
        ).map(JsString))),
      "$or" -> Json.arr(
        Json.obj("action.clientId" -> JsString(subscription.apiKey.clientId)),
        Json.obj("action.subscription" -> subscription.id.asJson),
      )
    ))
  }

  private def deleteTeamNotifications(team: Team): Future[Boolean] = {
    env.dataStore.notificationRepo.forTenant(team.tenant).deleteLogically(Json.obj(
      "action.type" ->
        Json.obj("$in" -> JsArray(Seq(
          "TeamAccess", "TeamInvitation", "ApiSubscription", "ApiSubscriptionAccept", "ApiSubscriptionReject",
          "TransferApiOwnership"
        ).map(JsString))),
      "action.team" -> team.id.asJson
    ))
  }

  private def deleteUserNotifications(user: User, tenant: TenantId): Future[Boolean] = {
    env.dataStore.notificationRepo.forTenant(tenant).deleteLogically(Json.obj(
      "action.type" ->
        Json.obj("$in" -> JsArray(Seq(
          "TeamInvitation"
        ).map(JsString))),
      "action.user" -> user.id.asJson
    ))
  }

  private def deleteUserMessages(user: User, tenant: TenantId): Future[Long] = {
    env.dataStore.teamRepo.forTenant(tenant).findOne(Json.obj("type" -> "Admin")).flatMap {
      case Some(adminTeam) if !adminTeam.users.exists(u => u.userId == user.id) =>
        env.dataStore.messageRepo.forTenant(tenant).updateMany(Json.obj(
          "$or" -> Json.arr(
            Json.obj("sender" -> user.id.asJson),
            Json.obj("participants" -> user.id.asJson)
          )
        ), Json.obj("closed" -> JsNumber(DateTime.now().toDate.getTime)))
      case None => FastFuture.successful(0L)
    }
  }

  private def deleteApi(o: Operation): Future[Unit] = {
    {
      (for {
        api <- OptionT(env.dataStore.apiRepo.forTenant(o.tenant).findByIdNotDeleted(o.itemId))
        _ <- OptionT.liftF(env.dataStore.operationRepo
          .forTenant(o.tenant)
          .save(o.copy(status = OperationStatus.InProgress)))
        _ <- OptionT.liftF(env.dataStore.operationRepo.forTenant(o.tenant).deleteById(o.id))
        _ <- OptionT.liftF(env.dataStore.apiPostRepo.forTenant(o.tenant).deleteLogically(Json.obj("_id" -> Json.obj("$in"-> JsArray(api.posts.map(_.asJson))))))
        _ <- OptionT.liftF(env.dataStore.apiIssueRepo.forTenant(o.tenant).deleteLogically(Json.obj("_id" -> Json.obj("$in"-> JsArray(api.issues.map(_.asJson))))))
        _ <- OptionT.liftF(env.dataStore.apiDocumentationPageRepo.forTenant(o.tenant).deleteLogically(Json.obj("_id" -> Json.obj("$in"-> JsArray(api.documentation.docIds().map(JsString))))))
        _ <- OptionT.liftF(deleteApiNotifications(api))
      } yield ())
        .value
        .map(_ => logger.debug(s"[deletion job] :: api ${o.itemId} successfully deleted"))
        .recover(e => {
          logger.error(s"[deletion job] :: [id ${o.id}] :: error during deletion of api ${o.itemId}: $e")
          env.dataStore.operationRepo
            .forTenant(o.tenant)
            .save(o.copy(status = OperationStatus.Error))
        })
    }
  }

  private def deleteSubscription(o: Operation): Future[Unit] = {
    (for {
      tenant <- OptionT(env.dataStore.tenantRepo.findById(o.tenant))
      subscription <- OptionT(env.dataStore.apiSubscriptionRepo.forTenant(o.tenant).findById(o.itemId))
      api <- OptionT(env.dataStore.apiRepo.forTenant(o.tenant).findById(subscription.api))
      plan <- OptionT.fromOption[Future](api.possibleUsagePlans.find(p => p.id == subscription.plan))
      _ <- OptionT.liftF(env.dataStore.operationRepo
        .forTenant(o.tenant)
        .save(o.copy(status = OperationStatus.InProgress)))
      //todo: send notification & mail ?
      _ <- OptionT.liftF(apiKeyStatsJob.syncForSubscription(subscription, tenant))
      _ <- OptionT.liftF(apiService.archiveApiKey(tenant, subscription, plan, enabled = false))
      _ <- OptionT.liftF(env.dataStore.operationRepo.forTenant(o.tenant).deleteById(o.id))
      _ <- OptionT.liftF(deleteSubscriptionNotifications(subscription))
    } yield ())
      .value.map(_ => ())
      .map(_ => logger.debug(s"[deletion job] :: subscription ${o.itemId} successfully deleted"))
      .recover(e => {
        logger.error(s"[deletion job] :: [id ${o.id}] :: error during deletion of subscription ${o.itemId}: $e")
        env.dataStore.operationRepo
          .forTenant(o.tenant)
          .save(o.copy(status = OperationStatus.Error))
          .map(_ => ())
      })
  }

  private def deleteTeam(o: Operation): Future[Unit] = {
    (for {
      team <- OptionT(env.dataStore.teamRepo.forTenant(o.tenant).findById(o.itemId))
      _ <- OptionT.liftF(env.dataStore.operationRepo
        .forTenant(o.tenant)
        .save(o.copy(status = OperationStatus.InProgress)))
      _ <- OptionT.liftF(env.dataStore.operationRepo.forTenant(o.tenant).deleteById(o.id))
      _ <- OptionT.liftF(deleteTeamNotifications(team))
    } yield ())
      .value
      .map(_ => logger.debug(s"[deletion job] :: team ${o.itemId} successfully deleted"))
      .recover(e => {
        logger.error(s"[deletion job] :: [id ${o.id}] :: error during deletion of team ${o.itemId}: $e")
        env.dataStore.operationRepo
          .forTenant(o.tenant)
          .save(o.copy(status = OperationStatus.Error))
      })
  }

  private def deleteUser(o: Operation): Future[Unit] = {
    (for {
      user <- OptionT(env.dataStore.userRepo.findById(o.itemId))
      _ <- OptionT.liftF(env.dataStore.operationRepo
        .forTenant(o.tenant)
        .save(o.copy(status = OperationStatus.InProgress)))
      _ <- OptionT.liftF(env.dataStore.operationRepo.forTenant(o.tenant).deleteById(o.id))
      _ <- OptionT.liftF(deleteUserNotifications(user, o.tenant))
      _ <- OptionT.liftF(deleteUserMessages(user, o.tenant))
    } yield ())
      .value
      .map(_ => logger.debug(s"[deletion job] :: user ${o.itemId} successfully deleted"))
      .recover(e => {
        logger.error(s"[deletion job] :: [id ${o.id}] :: error during deletion of user ${o.itemId}: $e")
        env.dataStore.operationRepo
          .forTenant(o.tenant)
          .save(o.copy(status = OperationStatus.Error))
      })
  }

  def deleteFirstOperation(): Future[Unit] = {
    env.dataStore.operationRepo
      .forAllTenant()
      .findOne(Json.obj( "$and" -> Json.arr(
        Json.obj("status" -> Json.obj("$ne" -> OperationStatus.Error.name)),
        Json.obj("status" -> OperationStatus.Idle.name)
      )))
      .flatMap {
        case Some(operation) =>
          ((operation.itemType, operation.action) match {
            case (ItemType.Subscription, OperationAction.Delete) => deleteSubscription(operation)
            case (ItemType.Api, OperationAction.Delete) => deleteApi(operation)
            case (ItemType.Team, OperationAction.Delete) => deleteTeam(operation)
            case (ItemType.User, OperationAction.Delete) => deleteUser(operation)
          })
            .flatMap(_ => deleteFirstOperation())
        case None =>
          FastFuture.successful(())
      }
  }
}
