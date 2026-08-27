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

  private val systemUser = User.system

  /** Physically delete a user and the tenant-local traces the queue used to
    * clean up (team-invitation notifications, and their chat messages unless
    * they sit in the tenant admin team), in a single transaction. The broader
    * per-user cleanup (all teams, cross-tenant notifs, chat) stays in the
    * callers.
    */
  private def deleteUser(
      user: User,
      tenant: Tenant
  ): EitherT[Future, AppError, Unit] = {
    AppLogger.debug(
      s"[deletion service] :: physically deleting user[${user.name}]"
    )
    EitherT.right[AppError](
      env.dataStore.withTransaction {
        val notifRepo = env.dataStore.notificationRepo.forTenant(tenant)
        for {
          _ <- notifRepo.execute(
            s"DELETE FROM ${notifRepo.tableName} WHERE content->>'_tenant' = $$1 " +
              "AND content->'action'->>'type' = 'TeamInvitation' " +
              "AND content->'action'->>'user' = $2",
            Seq(tenant.id.value, user.id.value)
          )
          adminTeam <- env.dataStore.teamRepo.findAdminTeam(tenant.id)
          _ <-
            if (adminTeam.exists(t => !t.users.exists(_.userId == user.id))) {
              val msgRepo = env.dataStore.messageRepo.forTenant(tenant)
              msgRepo.execute(
                s"DELETE FROM ${msgRepo.tableName} " +
                  "WHERE content->>'_tenant' = $1 " +
                  "AND (content->>'sender' = $2 " +
                  "OR content->'participants' @> to_jsonb($2::text))",
                Seq(tenant.id.value, user.id.value)
              )
            } else FastFuture.successful(0L)
          _ <- env.dataStore.userRepo.deleteById(user.id)
        } yield ()
      }
    )
  }

  /** Physically delete a team and its notifications in a single transaction.
    * Its apis, subscriptions and keyrings are handled beforehand by the caller
    * (deleteApis / deleteSubscriptions), whose external Otoroshi/Stripe cleanup
    * is carried by queued operations.
    */
  private def deleteTeam(
      team: Team,
      tenant: Tenant
  ): EitherT[Future, AppError, Unit] = {
    AppLogger.debug(
      s"[deletion service] :: physically deleting team[${team.name}]"
    )
    EitherT.right[AppError](
      env.dataStore.withTransaction {
        val notifRepo = env.dataStore.notificationRepo.forTenant(tenant)
        for {
          _ <- notifRepo.execute(
            s"DELETE FROM ${notifRepo.tableName} WHERE content->>'_tenant' = $$1 " +
              "AND content->'action'->>'team' = $2 " +
              "AND content->'action'->>'type' = ANY($3::text[])",
            Seq(
              tenant.id.value,
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
          _ <- env.dataStore.teamRepo.forTenant(tenant).deleteById(team.id)
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
        env.dataStore.apiRepo
          .forTenant(tenant)
          .findById(subscription.api),
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
    val affectedKeyringIds = subscriptions.map(_.keyring).distinct

    for {
      // Split the impacted keyrings: orphaned (no subscription left → its
      // Otoroshi apikey must be deleted) vs surviving (at least one
      // subscription left → its apikey must be recomputed without the deleted
      // subs). Both are carried out later, in the queue, never here.
      keyringDecisions <- EitherT
        .liftF[Future, AppError, Seq[(KeyringId, Boolean)]](
          Future.sequence(affectedKeyringIds.map { kid =>
            env.dataStore.apiSubscriptionRepo
              .findByKeyring(tenant.id, kid)
              .map { keyringSubs =>
                val remaining =
                  keyringSubs.filterNot(s => deletedIds.contains(s.id))
                (kid, remaining.isEmpty)
              }
          })
        )
      orphanedKeyringIds = keyringDecisions.collect { case (kid, true) => kid }
      survivingKeyringIds = keyringDecisions.collect { case (kid, false) =>
        kid
      }
      // Load the orphaned keyrings before deleting them, to capture the
      // Otoroshi target (clientId + settings id) the queued cleanup will need.
      orphanedKeyrings <- EitherT.liftF(
        env.dataStore.keyringRepo
          .forTenant(tenant)
          .findByIds(orphanedKeyringIds)
      )
      // Build the deletion notifications while api/plan/keyring are still
      // readable (reads only, no writes yet).
      contexts <- EitherT.liftF(
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
          .runWith(Sink.seq)
      )
      // Atomic DB closure: physically delete the subs and the orphaned
      // keyrings, drop the stale notifs, save the deletion notifs + payment
      // ops, and enqueue the deferred Otoroshi work — all or nothing, no HTTP.
      result <- EitherT.liftF(env.dataStore.withTransaction {
        val notifRepo = env.dataStore.notificationRepo.forTenant(tenant)
        val opRepo = env.dataStore.operationRepo.forTenant(tenant)
        for {
          deleted <- env.dataStore.apiSubscriptionRepo
            .forTenant(tenant)
            .deleteByIds(subscriptions.map(_.id).distinct)
          _ <- env.dataStore.keyringRepo
            .forTenant(tenant)
            .deleteByIds(orphanedKeyringIds)
          _ <- notifRepo.execute(
            s"DELETE FROM ${notifRepo.tableName} WHERE content->>'_tenant' = $$1 " +
              "AND (content->'action'->>'subscription' = ANY($2::text[]) " +
              "OR content->'action'->>'keyring' = ANY($3::text[]))",
            Seq(
              tenant.id.value,
              subscriptions.map(_.id.value).toArray,
              orphanedKeyringIds.map(_.value).toArray
            )
          )
          _ <- Future.sequence(contexts.map(ctx => notifRepo.save(ctx.notif)))
          _ <- Future.sequence(contexts.flatMap { ctx =>
            ctx.plan.paymentSettings.map { settings =>
              opRepo.save(
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
            }
          })
          // Orphaned keyring → queue the Otoroshi apikey deletion. The payload
          // carries clientId + settings id, since the row itself is now gone.
          _ <- Future.sequence(orphanedKeyrings.map { keyring =>
            opRepo.save(
              Operation(
                DatastoreId(IdGenerator.token(32)),
                tenant = tenant.id,
                itemId = keyring.id.value,
                itemType = ItemType.Keyring,
                action = OperationAction.Delete,
                payload = otoroshiTargetPayload(keyring, tenant)
              )
            )
          })
          // Surviving keyring → queue the Otoroshi apikey recompute. The row
          // stays, so the synchronizer re-reads it by id.
          _ <- Future.sequence(survivingKeyringIds.map { kid =>
            opRepo.save(
              Operation(
                DatastoreId(IdGenerator.token(32)),
                tenant = tenant.id,
                itemId = kid.value,
                itemType = ItemType.Keyring,
                action = OperationAction.Sync
              )
            )
          })
        } yield deleted > 0
      })
    } yield result
  }

  /** Payload for the queued (Keyring, Delete) operation: the Otoroshi apikey to
    * remove plus the full OtoroshiSettings to reach it. The settings are
    * embedded (resolved from the tenant now) rather than referenced by id, so
    * the queued cleanup no longer needs the tenant — which lets the tenant
    * itself be deleted without waiting for the queue.
    */
  private def otoroshiTargetPayload(
      keyring: Keyring,
      tenant: Tenant
  ): Option[JsObject] =
    keyring.otoroshiSettings match {
      case KeyringOtoroshiBinding.Otoroshi(id) =>
        tenant.otoroshiSettings
          .find(_.id == id)
          .map(settings =>
            Json.obj(
              "clientId" -> keyring.apiKey.clientId,
              "otoroshiSettings" -> json.OtoroshiSettingsFormat.writes(settings)
            )
          )
      case KeyringOtoroshiBinding.Internal => None
    }

  /** Physically delete a set of apis and everything they own. Per plan of each
    * api, delete its subscriptions (which queues the Otoroshi/Stripe cleanup),
    * then delete the api closure (posts, issues, docs, plans, notifs, pending
    * demands and the api row) in a transaction.
    *
    * a sequence of Api to delete the tenant where delete those apis
    * @return
    *   an EitherT of AppError or Unit (actually a RightT[Unit])
    */
  private def deleteApis(
      apis: Seq[Api],
      tenant: Tenant
  ): EitherT[Future, AppError, Unit] = {
    AppLogger.debug(
      s"[deletion service] :: physically deleting apis[${apis.map(_.name).mkString(",")}] and their closure"
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
            .findByApiAndPlan(tenant.id, api.id, plan.id)
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
      _ <- Future.sequence(
        apis.distinct.map(api => deleteApiClosure(api, tenant))
      )
    } yield ()

    EitherT.liftF(r)
  }

  /** Physically delete an api and everything it owns in DB — posts, issues,
    * documentation pages, its usage plans, its notifications and pending
    * subscription demands — in a single transaction. Its subscriptions and
    * keyrings are already gone (deleteSubscriptions), and the external
    * Otoroshi/Stripe cleanup is carried by queued operations.
    */
  private def deleteApiClosure(api: Api, tenant: Tenant): Future[Unit] =
    env.dataStore.withTransaction {
      val planRepo = env.dataStore.usagePlanRepo.forTenant(tenant)
      val notifRepo = env.dataStore.notificationRepo.forTenant(tenant)
      for {
        _ <- env.dataStore.apiPostRepo.forTenant(tenant).deleteByIds(api.posts)
        _ <- env.dataStore.apiIssueRepo
          .forTenant(tenant)
          .deleteByIds(api.issues)
        _ <- env.dataStore.apiDocumentationPageRepo
          .forTenant(tenant)
          .deleteByIds(
            api.documentation.docIds().map(ApiDocumentationPageId.apply)
          )
        _ <- planRepo.execute(
          s"DELETE FROM ${planRepo.tableName} " +
            "WHERE content->>'_tenant' = $1 AND _id = ANY($2::text[])",
          Seq(tenant.id.value, api.possibleUsagePlans.map(_.value).toArray)
        )
        _ <- notifRepo.execute(
          s"DELETE FROM ${notifRepo.tableName} WHERE content->>'_tenant' = $$1 " +
            "AND (content->'action'->>'api' = $2 " +
            "OR content->'action'->>'apiName' = $3)",
          Seq(tenant.id.value, api.id.value, api.name)
        )
        _ <- env.dataStore.subscriptionDemandRepo
          .forAllTenant()
          .execute(
            s"""
               |WITH deleted_demands AS (
               |  DELETE FROM subscription_demands
               |  WHERE content->>'_tenant' = $$1
               |    AND content->>'api' = $$2
               |    AND content->>'state' IN ('${SubscriptionDemandState.Waiting.name}', '${SubscriptionDemandState.InProgress.name}')
               |  RETURNING _id AS demand_id
               |)
               |DELETE FROM step_validators
               |WHERE content->>'subscriptionDemand' IN (SELECT demand_id FROM deleted_demands);
               |""".stripMargin,
            Seq(api.tenant.value, api.id.value)
          )
        _ <- env.dataStore.apiRepo.forTenant(tenant).deleteById(api.id)
      } yield ()
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
        env.dataStore.userRepo.findById(userId),
        AppError.UserNotFound()
      )
      personalTeam <- EitherT.fromOptionF(
        env.dataStore.teamRepo.findPersonalTeam(tenant.id, user.id),
        AppError.TeamNotFound
      )
      otherTenantPersonalTeam <- EitherT.liftF(
        env.dataStore.teamRepo.findPersonalTeamsForAllTenants(user.id)
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
        env.dataStore.userSessionRepo.deleteByUserId(userId)
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
        env.dataStore.userRepo.findById(userId),
        AppError.UserNotFound()
      )
      teams <- EitherT.right[AppError](
        env.dataStore.teamRepo.findPersonalTeamsForAllTenants(user.id)
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
        env.dataStore.userSessionRepo.deleteByUserId(userId)
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
             |  content->'users' @> jsonb_build_array(jsonb_build_object('userId', $userParam));
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

  /** Physically delete a team with its apis, subscriptions and keyrings, and
    * defer the Otoroshi and Stripe cleanup to the deletion queue.
    */
  def deleteTeamByQueue(
      id: TeamId,
      tenant: TenantId
  ): EitherT[Future, AppError, Unit] = {
    for {
      tenant <- EitherT.fromOptionF(
        env.dataStore.tenantRepo.findById(tenant),
        AppError.TenantNotFound
      )
      team <- EitherT.fromOptionF(
        env.dataStore.teamRepo.forTenant(tenant).findById(id),
        AppError.TeamNotFound
      )
      apis <- EitherT.liftF(
        env.dataStore.apiRepo.findByTeam(tenant.id, team.id)
      )
      allSubscriptions <- EitherT.liftF(
        {
          val repo = env.dataStore.apiSubscriptionRepo.forTenant(tenant)
          repo.query(
            s"SELECT content FROM ${repo.tableName} " +
              "WHERE content->>'_tenant' = $1 " +
              "AND (content->>'team' = $2 " +
              "OR content->>'api' = ANY($3::text[]))",
            Seq(tenant.id.value, team.id.value, apis.map(_.id.value).toArray)
          )
        }
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
          .findByIds(consumerSubsByApi.keys.toSeq)
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
        env.dataStore.tenantRepo.findById(tenantId),
        AppError.TenantNotFound
      )
      api <- EitherT.fromOptionF(
        env.dataStore.apiRepo.forTenant(tenant).findById(apiId),
        AppError.ApiNotFound
      )
      plan <- EitherT.fromOptionF[Future, AppError, UsagePlan](
        env.dataStore.usagePlanRepo
          .forTenant(tenant)
          .findById(planId),
        AppError.PlanNotFound
      )
      subscriptions <- EitherT.right[AppError](
        env.dataStore.apiSubscriptionRepo
          .findByApiAndPlan(tenant.id, api.id, plan.id)
      )
      _ <- deleteSubscriptions(subscriptions, api, tenant)
      _ <- EitherT.right[AppError](deletePlanClosure(api, plan, tenant))
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
    } yield ()
  }

  /** Physically delete a usage plan and everything it owns in DB — its
    * documentation pages, pending subscription demands, notifications — and
    * detach it from its api, in a single transaction. Its subscriptions and
    * keyrings are already gone (deleteSubscriptions); the Stripe product
    * cleanup is carried by a queued operation.
    */
  private def deletePlanClosure(
      api: Api,
      plan: UsagePlan,
      tenant: Tenant
  ): Future[Unit] =
    env.dataStore.withTransaction {
      val notifRepo = env.dataStore.notificationRepo.forTenant(tenant)
      for {
        _ <- env.dataStore.apiRepo
          .forTenant(tenant)
          .save(
            api.copy(possibleUsagePlans =
              api.possibleUsagePlans.filter(_ != plan.id)
            )
          )
        _ <- plan.documentation match {
          case Some(doc) =>
            env.dataStore.apiDocumentationPageRepo
              .forTenant(tenant)
              .deleteByIds(doc.docIds().map(ApiDocumentationPageId.apply))
          case None => FastFuture.successful(false)
        }
        _ <- env.dataStore.subscriptionDemandRepo
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
            Seq(tenant.id.value, plan.id.value)
          )
        _ <- notifRepo.execute(
          s"DELETE FROM ${notifRepo.tableName} " +
            "WHERE content->>'_tenant' = $1 " +
            "AND content->'action'->>'plan' = $2",
          Seq(tenant.id.value, plan.id.value)
        )
        _ <- env.dataStore.usagePlanRepo.forTenant(tenant).deleteById(plan.id)
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
        env.dataStore.tenantRepo.findById(tenant),
        AppError.TenantNotFound
      )
      api <- EitherT.fromOptionF(
        env.dataStore.apiRepo.forTenant(tenant).findById(id),
        AppError.TeamNotFound
      )
      subscriptions <- EitherT.right[AppError](
        env.dataStore.apiSubscriptionRepo
          .findByApi(tenant.id, api.id)
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
          .findById(demandId),
        AppError.EntityNotFound("Subscription demand")
      )
      _ <- EitherT.right[AppError](
        env.dataStore.withTransaction {
          for {
            _ <- env.dataStore.subscriptionDemandRepo
              .forTenant(tenant)
              .deleteById(demand.id)
            _ <- env.dataStore.stepValidatorRepo
              .deleteByDemand(tenant.id, demand.id)
            _ <- env.dataStore.notificationRepo
              .deleteByDemand(tenant.id, demand.id)
          } yield ()
        }
      )
    } yield ()
  }
}
