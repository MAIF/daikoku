package fr.maif.daikoku.services

import cats.data.EitherT
import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.jobs.{ApiKeyStatsJob, OtoroshiSynchronizerJob}
import fr.maif.daikoku.logger.AppLogger
import fr.maif.daikoku.utils.{IdGenerator, OtoroshiClient}
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.{Sink, Source}
import play.api.libs.json.*

import scala.concurrent.{ExecutionContext, Future}

class DeletionService(
    env: Env,
    apiKeyStatsJob: ApiKeyStatsJob,
    otoroshiClient: OtoroshiClient,
    otoroshiSynchronizerJob: OtoroshiSynchronizerJob,
    keyringService: KeyringService
) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  private val systemUser = User(
    id = UserId("daikoku-system"),
    tenants = Set.empty,
    origins = Set.empty,
    name = "Daikoku",
    email = "system@daikoku.io",
    personalToken = None,
    lastTenant = None,
    defaultLanguage = None
  )

  /** Delete logically a team Add an operation in deletion queue to process
    * complete deletion (delete user notifications & messages)
    */
  private def deleteUser(
      user: User,
      tenant: Tenant
  ): EitherT[Future, AppError, Unit] = {
    val operation = Operation(
      DatastoreId(IdGenerator.token(32)),
      tenant = tenant.id,
      itemId = user.id.value,
      itemType = ItemType.User,
      action = OperationAction.Delete
    )

    AppLogger.debug(s"add **user**[${user.name}] to deletion queue")
    EitherT.right[AppError](
      env.dataStore.withTransaction {
        for {
          _ <- env.dataStore.userRepo.deleteByIdLogically(user.id)
          _ <- env.dataStore.operationRepo.forTenant(tenant).save(operation)
        } yield ()
      }
    )
  }

  /** Delete logically a team Add an operation in deletion queue to process
    * complete deletion (delete team notifications)
    */
  private def deleteTeam(
      team: Team,
      tenant: Tenant
  ): EitherT[Future, AppError, Unit] = {
    val operation = Operation(
      DatastoreId(IdGenerator.token(32)),
      tenant = tenant.id,
      itemId = team.id.value,
      itemType = ItemType.Team,
      action = OperationAction.Delete
    )

    AppLogger.debug(
      s"[deletion service] :: add **team**[${team.name}] to deletion queue"
    )
    EitherT.right[AppError](
      env.dataStore.withTransaction {
        for {
          _ <- env.dataStore.teamRepo
            .forTenant(tenant)
            .deleteByIdLogically(team.id)
          _ <- env.dataStore.operationRepo.forTenant(tenant).save(operation)
        } yield ()
      }
    )
  }

  private case class SubscriptionContext(
      subscription: ApiSubscription,
      keyring: Keyring,
      api: Api,
      plan: UsagePlan,
      notif: Notification
  )

  private def prepareSubscriptionContext(
      subscription: ApiSubscription,
      tenant: Tenant,
      user: User,
      notificationActionFor: (
          Api,
          Keyring,
          ApiSubscription
      ) => NotificationAction
  ): Future[Either[AppError, SubscriptionContext]] =
    (for {
      api <- EitherT.fromOptionF(
        env.dataStore.apiRepo.forTenant(tenant).findById(subscription.api),
        AppError.ApiNotFound
      )
      plan <- EitherT.fromOptionF[Future, AppError, UsagePlan](
        env.dataStore.usagePlanRepo
          .forTenant(tenant)
          .findById(subscription.plan),
        AppError.PlanNotFound
      )
      keyring <- EitherT.fromOptionF[Future, AppError, Keyring](
        env.dataStore.keyringRepo
          .forTenant(tenant)
          .findById(subscription.keyring),
        AppError.EntityNotFound(s"Keyring ${subscription.keyring.value}")
      )
      notif = Notification(
        id = NotificationId(IdGenerator.token(32)),
        tenant = tenant.id,
        team = Some(subscription.team),
        sender = user.asNotificationSender,
        notificationType = NotificationType.AcceptOnly,
        action = notificationActionFor(api, keyring, subscription)
      )
    } yield SubscriptionContext(subscription, keyring, api, plan, notif)).value

  private def processOtoroshiForSubscription(
      ctx: SubscriptionContext,
      tenant: Tenant
  ): Future[Either[AppError, SubscriptionContext]] = {
    def deleteOtoroshiKey(): EitherT[Future, AppError, Unit] =
      for {
        target <- EitherT.fromOption[Future](
          ctx.plan.otoroshiTarget,
          AppError.EntityNotFound("Otoroshi settings")
        )
        settings <- EitherT.fromOption[Future](
          tenant.otoroshiSettings.find(s => s.id == target.otoroshiSettings),
          AppError.EntityNotFound("Otoroshi settings")
        )
        _ <- otoroshiClient.deleteApiKey(ctx.keyring.apiKey.clientId)(using
          settings
        )
      } yield ()

    (for {
      _ <- EitherT.liftF(
        apiKeyStatsJob
          .syncForSubscription(ctx.subscription, tenant, completed = true)
      )
      _ <- deleteOtoroshiKey()
    } yield ctx).value
  }

  private def finalizeSubscriptionDeletion(
      ctx: SubscriptionContext,
      tenant: Tenant
  ): Future[Either[AppError, Unit]] =
    (for {
      _ <- ctx.plan.paymentSettings match {
        case Some(settings) =>
          EitherT.liftF(
            env.dataStore.operationRepo
              .forTenant(tenant)
              .save(
                Operation(
                  DatastoreId(IdGenerator.token(24)),
                  tenant = tenant.id,
                  itemId = ctx.subscription.id.value,
                  itemType = ItemType.ThirdPartySubscription,
                  action = OperationAction.Delete,
                  payload = Json
                    .obj(
                      "paymentSettings" -> settings.asJson,
                      "thirdPartySubscriptionInformations" -> ctx.subscription.thirdPartySubscriptionInformations
                        .map(_.asJson)
                        .getOrElse(JsNull)
                        .as[JsValue]
                    )
                    .some
                )
              )
          )
        case None => EitherT.pure[Future, AppError](())
      }
      _ <- EitherT.liftF(
        env.dataStore.notificationRepo.forTenant(tenant).save(ctx.notif)
      )
    } yield ()).value

  /** Delete subscriptions for a given API:
    *   1. Disable subs in DB (signal for Otoroshi sync) 2. Per impacted
    *      keyring: recompute its key without the deleted subs, or delete the
    *      Otoroshi key + the keyring when no subscription references it anymore
    *      3. Finalize: save notifs + payment ops + cleanup action.subscription
    *      notifs 4. Mark subs as deleted in DB
    */
  def deleteSubscriptions(
      subscriptions: Seq[ApiSubscription],
      api: Api,
      tenant: Tenant,
      notificationActionFor: (
          Api,
          Keyring,
          ApiSubscription
      ) => NotificationAction = (a, k, s) =>
        NotificationAction.ApiKeyDeletionInformationV2(
          a.id,
          k.apiKey.clientId,
          s.id
        )
  ): EitherT[Future, AppError, Boolean] = {
    implicit val m: Materializer = env.defaultMaterializer
    AppLogger.debug(
      s"[deletion service] :: deleting subscriptions[${subscriptions.map(_.id).mkString(",")}] for api ${api.id.value}"
    )

    val deletedIds = subscriptions.map(_.id).toSet

    for {
      // the keyrings impacted by this deletion
      affectedKeyringIds = subscriptions.map(_.keyring).distinct
      // Phase 1 — disable subs in DB so the synchronizer sees them as disabled
      // TODO(transactions): le updateManyByQuery (DB) et les appels otoroshiSynchronizerJob (HTTP) ci-dessous
      // ne sont pas atomiques. Si le sync Otoroshi échoue après le disable en DB, les subs restent disabled
      // en base mais actives côté Otoroshi. Non transactionnable sans saga ou compensation explicite.
      _ <- EitherT.liftF(
        env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .updateManyByQuery(
            Json.obj(
              "_id" -> Json
                .obj("$in" -> JsArray(subscriptions.map(_.id.asJson).distinct))
            ),
            Json.obj("$set" -> Json.obj("enabled" -> false))
          )
      )
      // Phase 2 — per impacted keyring, recompute its Otoroshi key without the
      // deleted subs, or delete the key + the keyring when no subscription
      // references it anymore.
      deletedKeyringIds <- EitherT.liftF[Future, AppError, Seq[KeyringId]](
        Future
          .sequence(
            affectedKeyringIds.map { kid =>
              env.dataStore.apiSubscriptionRepo
                .forTenant(tenant)
                .findNotDeleted(Json.obj("keyring" -> kid.asJson))
                .flatMap { keyringSubs =>
                  val remaining =
                    keyringSubs.filterNot(s => deletedIds.contains(s.id))
                  if (remaining.isEmpty)
                    otoroshiSynchronizerJob
                      .runForDeletion(kid, tenant)
                      .flatMap(_ =>
                        keyringService.deleteKeyring(tenant.id, kid)
                      )
                      .map(_ => Some(kid))
                  else otoroshiSynchronizerJob.run(kid, tenant).map(_ => None)
                }
            }
          )
          .map(_.flatten)
      )
      // Phase 3b — delete stale pending notifications referencing the deleted
      // subscriptions, or the keyrings that have just been deleted
      _ <- EitherT.right[AppError](
        env.dataStore.notificationRepo
          .forTenant(tenant)
          .delete(
            Json.obj(
              "$or" -> JsArray(
                Seq(
                  Json.obj(
                    "action.subscription" -> Json.obj(
                      "$in" -> JsArray(
                        subscriptions.map(s => JsString(s.id.value))
                      )
                    )
                  ),
                  Json.obj(
                    "action.keyring" -> Json.obj(
                      "$in" -> JsArray(deletedKeyringIds.map(_.asJson))
                    )
                  )
                )
              )
            )
          )
      )
      // Phase 3 — save deletion notifs + payment ops
      _ <- EitherT(
        Source(subscriptions)
          .mapAsync(1)(subscription =>
            prepareSubscriptionContext(
              subscription,
              tenant,
              systemUser,
              notificationActionFor
            )
          )
          .mapConcat {
            case Right(ctx) => List(ctx)
            case Left(err) =>
              AppLogger.warn(
                s"[deletion service] prepareSubscriptionContext failed: ${err.getErrorMessage()}"
              )
              List.empty
          }
          .mapAsync(1)(ctx => finalizeSubscriptionDeletion(ctx, tenant))
          .runWith(
            Sink.fold[Either[AppError, Unit], Either[AppError, Unit]](
              Right[AppError, Unit](())
            )((_, either) => either)
          )
      )
      // Phase 4 — physically delete in DB (otoroshi/stripe cleanup already done above)
      result <- EitherT.right[AppError](
        env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .delete(
            Json.obj(
              "_id" -> Json
                .obj("$in" -> JsArray(subscriptions.map(_.id.asJson).distinct))
            )
          )
      )
    } yield result
  }

  /** delete logically all apis add for each apis an operation in queue to
    * process a complete deletion of each Api (delete doc, issues, posts &
    * notifications)
    *
    * a sequence of Api to delete the tenant where delete those apis
    * @return
    *   an EitherT of AppError or Unit (actually a RightT[Unit])
    */
  private def deleteApis(
      apis: Seq[Api],
      tenant: Tenant
  ): EitherT[Future, AppError, Unit] = {
    val operations = apis.distinct
      .map(s =>
        Operation(
          DatastoreId(IdGenerator.token(32)),
          tenant = tenant.id,
          itemId = s.id.value,
          itemType = ItemType.Api,
          action = OperationAction.Delete
        )
      )

    AppLogger.debug(
      s"[deletion service] :: add **apis**[${apis.map(_.name).mkString(",")}] to deletion queue"
    )

    val planDeletion = Source(apis)
      .mapAsync(5)(api =>
        env.dataStore.usagePlanRepo
          .findByApi(tenant.id, api)
          .map(plans => (api, plans))
      )
      .flatMapConcat { case (api, plans) =>
        Source(plans.map(plan => (api, plan)))
      }
      .mapAsync(5) { case (api, plan) =>
        for {
          subscriptions <- env.dataStore.apiSubscriptionRepo
            .forTenant(tenant)
            .findNotDeleted(
              Json.obj("api" -> api.id.asJson, "plan" -> plan.id.asJson)
            )
          _ <- deleteSubscriptions(subscriptions, api, tenant).value.map {
            case Left(e) =>
              AppLogger.error(
                s"[deletion service] :: error while deleting subscriptions of plan ${plan.id.value}: ${e.getErrorMessage()}"
              )
            case Right(_) => ()
          }
          _ <- plan.paymentSettings match {
            case Some(paymentSettings) =>
              env.dataStore.operationRepo
                .forTenant(tenant)
                .save(
                  Operation(
                    DatastoreId(IdGenerator.token(24)),
                    tenant = tenant.id,
                    itemId = plan.id.value,
                    itemType = ItemType.ThirdPartyProduct,
                    action = OperationAction.Delete,
                    payload = Json
                      .obj("paymentSettings" -> paymentSettings.asJson)
                      .some
                  )
                )
            case None => FastFuture.successful(())
          }
        } yield ()
      }
      .runWith(Sink.ignore)(using env.defaultMaterializer)

    val r = for {
      _ <- planDeletion
      _ <-
        env.dataStore.apiRepo
          .forTenant(tenant)
          .deleteLogically(
            Json.obj(
              "_id" ->
                Json.obj("$in" -> JsArray(apis.map(_.id.asJson).distinct))
            )
          )
      _ <- env.dataStore.operationRepo.forTenant(tenant).insertMany(operations)
    } yield ()

    EitherT.liftF(r)
  }

  /** delete a personal user team in the provided tenant Flag a user as deleted
    * if there is no other account in another tenant Add team (and him probably)
    * to deletion queue to process complete deletion
    */
  def deleteUserByQueue(
      userId: String,
      tenant: Tenant
  ): EitherT[Future, AppError, Unit] = {
    for {
      user <- EitherT.fromOptionF(
        env.dataStore.userRepo.findByIdNotDeleted(userId),
        AppError.UserNotFound()
      )
      personalTeam <- EitherT.fromOptionF(
        env.dataStore.teamRepo
          .forTenant(tenant)
          .findOneNotDeleted(
            Json.obj(
              "type" -> TeamType.Personal.name,
              "users.userId" -> user.id.asJson
            )
          ),
        AppError.TeamNotFound
      )
      otherTenantPersonalTeam <- EitherT.liftF(
        env.dataStore.teamRepo
          .forAllTenant()
          .findNotDeleted(
            Json.obj(
              "type" -> TeamType.Personal.name,
              "users.userId" -> user.id.asJson
            )
          )
      )
      _ <- deleteTeamByQueue(personalTeam.id, tenant.id)
      _ <-
        if (otherTenantPersonalTeam.length > 1)
          EitherT.rightT[Future, AppError](())
        else deleteUser(user, tenant)
      _ <- deleteUserFromAllTeams(tenant.some, user)
      _ <- deleteUserNotifications(tenant.some, user)
      _ <- deleteChat(tenant.some, user)
      _ <- EitherT.right[AppError](
        env.dataStore.userSessionRepo.delete(
          Json.obj(
            "userId" -> userId
          )
        )
      )
    } yield ()
  }

  /** Flag a user as deleted and delete his all teams in all possible tenants
    * Add him and his personal teams to deletion queue to process complete
    * deletion
    */
  def deleteCompleteUserByQueue(
      userId: String,
      tenant: Tenant
  ): EitherT[Future, AppError, Unit] = {
    for {
      user <- EitherT.fromOptionF(
        env.dataStore.userRepo.findByIdNotDeleted(userId),
        AppError.UserNotFound()
      )
      teams <- EitherT.right[AppError](
        env.dataStore.teamRepo
          .forAllTenant()
          .findNotDeleted(
            Json.obj(
              "type" -> TeamType.Personal.name,
              "users.userId" -> user.id.asJson
            )
          )
      )
      _ <- EitherT.right[AppError](
        Future.sequence(
          teams.map(team => deleteTeamByQueue(team.id, team.tenant).value)
        )
      )
      _ <- deleteUser(user, tenant)
      _ <- deleteUserFromAllTeams(None, user)
      _ <- deleteUserNotifications(None, user)
      _ <- deleteChat(None, user)
      _ <- EitherT.right[AppError](
        env.dataStore.userSessionRepo.delete(
          Json.obj(
            "userId" -> userId
          )
        )
      )
    } yield ()
  }

  private def deleteUserNotifications(tenant: Option[Tenant], user: User)(
      implicit
      env: Env,
      ec: ExecutionContext
  ): EitherT[Future, AppError, Long] = {
    val tenantFilter =
      tenant.map(_ => "content->>'_tenant' = $1 AND ").getOrElse("")
    val tenantParams: Seq[AnyRef] =
      tenant.map(t => Seq(t.id.value)).getOrElse(Seq.empty)
    val userParam = "$" + (tenantParams.size + 1)

    for {
      notifs <- EitherT.right[AppError](
        env.dataStore.notificationRepo
          .forAllTenant()
          .execute(
            s"""
           |DELETE FROM notifications
           |WHERE (
           |  $tenantFilter
           |  (
           |    content->'sender'->>'id' = $userParam
           |    OR content->'action'->>'user' = $userParam
           |  )
           |);
           |""".stripMargin,
            tenantParams :+ user.id.value
          )
      )
      _ <- EitherT.right[AppError](
        env.dataStore.subscriptionDemandRepo
          .forAllTenant()
          .execute(
            s"""
             |WITH deleted_demands AS (
             |  DELETE FROM subscription_demands
             |  WHERE $tenantFilter
             |    content->>'from' = $userParam
             |    AND content->>'state' IN ('${SubscriptionDemandState.Waiting.name}', '${SubscriptionDemandState.InProgress.name}')
             |  RETURNING _id AS demand_id
             |)
             |DELETE FROM step_validators
             |WHERE content->>'subscriptionDemand' IN (SELECT demand_id FROM deleted_demands);
             |""".stripMargin,
            tenantParams :+ user.id.value
          )
      )
    } yield notifs
  }

  private def deleteUserFromAllTeams(tenant: Option[Tenant], user: User)(
      implicit
      env: Env,
      ec: ExecutionContext
  ): EitherT[Future, AppError, Long] = {
    val tenantFilter =
      tenant.map(_ => "content->>'_tenant' = $1 AND ").getOrElse("")
    val tenantParams: Seq[AnyRef] =
      tenant.map(t => Seq(t.id.value)).getOrElse(Seq.empty)
    val userParam = "$" + (tenantParams.size + 1)

    EitherT.liftF(
      env.dataStore.teamRepo
        .forAllTenant()
        .execute(
          s"""
             |UPDATE teams
             |SET content = jsonb_set(
             |    content, '{users}',
             |    (SELECT COALESCE(jsonb_agg(u), '[]'::jsonb)
             |     FROM jsonb_array_elements(content->'users') u
             |     WHERE u->>'userId' != $userParam)
             |)
             |WHERE $tenantFilter
             |  _deleted = false
             |  AND content->'users' @> jsonb_build_array(jsonb_build_object('userId', $userParam));
             |""".stripMargin,
          tenantParams :+ user.id.value
        )
    )
  }

  private def deleteChat(tenant: Option[Tenant], user: User)(implicit
      env: Env,
      ec: ExecutionContext
  ): EitherT[Future, AppError, Long] = {
    val (tenantFilter, params) = tenant match {
      case Some(t) =>
        (
          "AND content->>'_tenant' = $2",
          Seq(user.id.value, t.id.value)
        )
      case None =>
        ("", Seq(user.id.value))
    }

    EitherT.right[AppError](
      env.dataStore.messageRepo
        .forAllTenant()
        .execute(
          s"""
           |DELETE FROM messages
           |WHERE content->>'chat' = $$1
           |  $tenantFilter;
           |""".stripMargin,
          params
        )
    )
  }

  /** Flag a team as deleted and delete his subscriptions, apis and those apis
    * subscriptions add team, subs and apis to deletion queue to process
    * complete deletion
    */
  def deleteTeamByQueue(
      id: TeamId,
      tenant: TenantId
  ): EitherT[Future, AppError, Unit] = {
    for {
      tenant <- EitherT.fromOptionF(
        env.dataStore.tenantRepo.findByIdNotDeleted(tenant),
        AppError.TenantNotFound
      )
      team <- EitherT.fromOptionF(
        env.dataStore.teamRepo.forTenant(tenant).findByIdNotDeleted(id),
        AppError.TeamNotFound
      )
      apis <- EitherT.liftF(
        env.dataStore.apiRepo
          .forTenant(tenant)
          .findNotDeleted(Json.obj("team" -> team.id.asJson))
      )
      allSubscriptions <- EitherT.liftF(
        env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findNotDeleted(
            Json.obj(
              "$or" -> Json.arr(
                Json.obj("team" -> team.id.asJson),
                Json.obj(
                  "api" -> Json.obj("$in" -> JsArray(apis.map(_.id.asJson)))
                )
              )
            )
          )
      )
      _ <- EitherT.liftF(
        Source(apis)
          .mapAsync(1)(api =>
            deleteSubscriptions(
              allSubscriptions.filter(_.api == api.id),
              api,
              tenant
            ).value
          )
          .runWith(Sink.ignore)(using env.defaultMaterializer)
      )
      // also delete consumer subscriptions (team subscribed to an external API)
      ownedApiIds = apis.map(_.id).toSet
      consumerSubsByApi = allSubscriptions
        .filterNot(s => ownedApiIds.contains(s.api))
        .groupBy(_.api)
      consumerApis <- EitherT.liftF(
        env.dataStore.apiRepo
          .forTenant(tenant)
          .findNotDeleted(
            Json.obj(
              "_id" -> Json.obj(
                "$in" -> JsArray(consumerSubsByApi.keys.map(_.asJson).toSeq)
              )
            )
          )
      )
      _ <- EitherT.liftF(
        Source(consumerApis)
          .mapAsync(1)(api =>
            deleteSubscriptions(
              consumerSubsByApi.getOrElse(api.id, Seq.empty),
              api,
              tenant
            ).value
          )
          .runWith(Sink.ignore)(using env.defaultMaterializer)
      )
      _ <- deleteApis(apis, tenant)
      _ <- deleteTeam(team, tenant)
    } yield ()
  }

  /** Flag a usage plan as deleted and delete its subscriptions. Adds an
    * operation in the deletion queue to process cleanup of demands and
    * notifications.
    */
  def deleteUsagePlanByQueue(
      planId: UsagePlanId,
      apiId: ApiId,
      tenantId: TenantId
  ): EitherT[Future, AppError, Unit] = {
    for {
      tenant <- EitherT.fromOptionF(
        env.dataStore.tenantRepo.findByIdNotDeleted(tenantId),
        AppError.TenantNotFound
      )
      api <- EitherT.fromOptionF(
        env.dataStore.apiRepo.forTenant(tenant).findByIdNotDeleted(apiId),
        AppError.ApiNotFound
      )
      plan <- EitherT.fromOptionF[Future, AppError, UsagePlan](
        env.dataStore.usagePlanRepo
          .forTenant(tenant)
          .findByIdNotDeleted(planId),
        AppError.PlanNotFound
      )
      subscriptions <- EitherT.right[AppError](
        env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findNotDeleted(
            Json.obj("api" -> api.id.asJson, "plan" -> plan.id.asJson)
          )
      )
      _ <- deleteSubscriptions(subscriptions, api, tenant)
      _ <- EitherT.right[AppError](
        env.dataStore.apiRepo
          .forTenant(tenant)
          .save(
            api.copy(possibleUsagePlans =
              api.possibleUsagePlans.filter(_ != plan.id)
            )
          )
      )
      _ <- EitherT.right[AppError](
        env.dataStore.usagePlanRepo
          .forTenant(tenant)
          .deleteByIdLogically(plan.id)
      )
      _ <- plan.paymentSettings match {
        case Some(paymentSettings) =>
          EitherT
            .right[AppError](
              env.dataStore.operationRepo
                .forTenant(tenant)
                .save(
                  Operation(
                    DatastoreId(IdGenerator.token(24)),
                    tenant = tenant.id,
                    itemId = plan.id.value,
                    itemType = ItemType.ThirdPartyProduct,
                    action = OperationAction.Delete,
                    payload =
                      Json.obj("paymentSettings" -> paymentSettings.asJson).some
                  )
                )
            )
            .map(_ => ())
        case None => EitherT.pure[Future, AppError](())
      }
      _ <- EitherT.right[AppError](
        env.dataStore.operationRepo
          .forTenant(tenant)
          .save(
            Operation(
              DatastoreId(IdGenerator.token(32)),
              tenant = tenant.id,
              itemId = plan.id.value,
              itemType = ItemType.UsagePlan,
              action = OperationAction.Delete
            )
          )
      )
    } yield ()
  }

  /** Flag an api as deleted and delete his subscriptions add api & subs to
    * deletion queue to process complete deletion
    */
  def deleteApiByQueue(
      id: ApiId,
      tenant: TenantId
  ): EitherT[Future, AppError, Unit] = {
    for {
      tenant <- EitherT.fromOptionF(
        env.dataStore.tenantRepo.findByIdNotDeleted(tenant),
        AppError.TenantNotFound
      )
      api <- EitherT.fromOptionF(
        env.dataStore.apiRepo.forTenant(tenant).findByIdNotDeleted(id),
        AppError.TeamNotFound
      )
      subscriptions <- EitherT.right[AppError](
        env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findNotDeleted(Json.obj("api" -> api.id.asJson))
      )
      _ <- deleteSubscriptions(subscriptions, api, tenant)
      _ <- deleteApis(Seq(api), tenant)
    } yield ()
  }

  def cancelSubscriptionDemand(
      demandId: String,
      tenant: Tenant
  ): EitherT[Future, AppError, Unit] = {
    for {
      demand <- EitherT.fromOptionF(
        env.dataStore.subscriptionDemandRepo
          .forTenant(tenant)
          .findByIdNotDeleted(demandId),
        AppError.EntityNotFound("Subscription demand")
      )
      _ <- EitherT.right[AppError](
        env.dataStore.withTransaction {
          for {
            _ <- env.dataStore.subscriptionDemandRepo
              .forTenant(tenant)
              .deleteById(demand.id)
            _ <- env.dataStore.stepValidatorRepo
              .forTenant(tenant)
              .delete(Json.obj("subscriptionDemand" -> demand.id.asJson))
            _ <- env.dataStore.notificationRepo
              .forTenant(tenant)
              .delete(Json.obj("action.demand" -> demand.id.asJson))
          } yield ()
        }
      )
    } yield ()
  }
}
