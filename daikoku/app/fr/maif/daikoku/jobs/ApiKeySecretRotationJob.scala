package fr.maif.daikoku.jobs

import cats.data.EitherT
import cats.implicits.*
import fr.maif.daikoku.audit.ApiKeyRotationEvent
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.storage.drivers.postgres.{
  Col,
  ColJson,
  ColJsonArray,
  PostgresDataStore
}
import fr.maif.daikoku.utils.{IdGenerator, OtoroshiClient, Time, Translator}
import org.apache.pekko.actor.Cancellable
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.Sink
import org.joda.time.DateTime
import play.api.Logger
import play.api.i18n.MessagesApi
import play.api.libs.json.*
import cron4s.*
import cron4s.lib.joda.*

import java.util.concurrent.atomic.{AtomicLong, AtomicReference}
import scala.concurrent.duration.*
import scala.concurrent.{ExecutionContext, Future}

/** The api/plan/team ids attached to a keyring, used only to address
  * notifications: the rotation itself is driven by the keyring alone.
  */
private case class RotationContext(
    subscription: ApiSubscriptionId,
    subscriptionTeam: TeamId,
    api: ApiId,
    apiTeam: TeamId,
    plan: UsagePlanId
)

private object RotationContext {
  def readFromJson(js: JsValue): Option[RotationContext] =
    for {
      subscription <- (js \ "subscription" \ "_id").asOpt[String]
      subscriptionTeam <- (js \ "subscription" \ "team").asOpt[String]
      api <- (js \ "api" \ "_id").asOpt[String]
      apiTeam <- (js \ "api" \ "team").asOpt[String]
      plan <- (js \ "plan" \ "_id").asOpt[String]
    } yield RotationContext(
      subscription = ApiSubscriptionId(subscription),
      subscriptionTeam = TeamId(subscriptionTeam),
      api = ApiId(api),
      apiTeam = TeamId(apiTeam),
      plan = UsagePlanId(plan)
    )
}

class ApiKeySecretRotationJob(
    client: OtoroshiClient,
    env: Env,
    translator: Translator,
    messagesApi: MessagesApi
) {
  private val logger = Logger("APIkey-Rotation-Synchronizer")

  private val ref = new AtomicReference[Cancellable]()

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val mat: Materializer = env.defaultMaterializer
  implicit val ev: Env = env
  implicit val me: MessagesApi = messagesApi
  implicit val tr: Translator = translator

  def start(): Unit = {
    val syncAvalaible =
      env.config.rotationJobEnabled && env.config.otoroshiSyncMaster // FIXME: use also otoroshiSyncMaster ???

    if (syncAvalaible && ref.get() == null) {
      env.config.rotationJobSchedulingMode match {
        case SchedulingMode.Cron =>
          val cronExpr = env.config.rotationJobCronExpr.map(Cron.unsafeParse)

          def scheduleNext(): Unit = {
            val now = DateTime.now()
            cronExpr.flatMap(_.next[DateTime](now)) match {
              case Some(nextRun) =>
                val delayMillis =
                  Math.max(nextRun.getMillis - now.getMillis, 1000)
                val delay = delayMillis.millis

                logger.info(
                  s"next cron run scheduled at $nextRun (in ${delay.toSeconds}s)"
                )

                ref.set(
                  env.defaultActorSystem.scheduler.scheduleOnce(delay) {
                    logger.info(s"cron triggered at $now")
                    val _ = runForAllTenants()
                      .recover { case e: Throwable =>
                        logger.error("cron sync failed", e)
                      }
                      .andThen { case _ =>
                        scheduleNext()
                      }
                    ()
                  }
                )

              case None =>
                logger.error(
                  s"could not compute next run from cron expression: ${env.config.rotationJobCronExpr.getOrElse("")}"
                )
            }
          }

          scheduleNext()

        case SchedulingMode.Interval =>
          ref.set(
            env.defaultActorSystem.scheduler
              .scheduleAtFixedRate(10.seconds, env.config.rotationJobInterval) {
                () =>
                  runForAllTenants()
                    .recover { case e: Throwable =>
                      logger.error("interval sync failed", e)
                    }
              }
          )
      }
    }
  }

  def stop(): Unit = {
    Option(ref.get()).foreach(_.cancel())
  }

  private def runForAllTenants(): Future[Unit] =
    env.dataStore.tenantRepo
      .findAllNotDeleted()
      .flatMap(tenants => Future.sequence(tenants.map(tenant => run(tenant))))
      .map(_ => ())

  def run(tenant: Tenant, parallelism: Int = 25): Future[Unit] = {
    logger.info(s"run apikey rotation check for tenant ${tenant.id.value}")

    val jobRepo = env.dataStore.JobInformationRepo.forTenant(tenant)
    val jobId = DatastoreId(s"rotation-${IdGenerator.token(16)}")
    val now = DateTime.now()

    val jobInfo = JobInformation(
      id = jobId,
      tenant = tenant.id,
      jobName = JobName.ApiKeyRotationVerifier,
      lockedBy = "apikey-rotation-verifier-job",
      lockedAt = now,
      expiresAt = now.plusMinutes(5),
      cursor = 0L,
      startedAt = now,
      lastBatchAt = now,
      status = JobStatus.Running
    )

    // expiresAt doubles as a heartbeat: if Daikoku crashes it stops being
    // refreshed and the next run considers the job stale instead of skipping
    // forever.
    def saveCursor(cursor: Long): Future[Boolean] = jobRepo.save(
      jobInfo.copy(cursor = cursor, expiresAt = DateTime.now().plusMinutes(5))
    )

    def doRun(maybeLastCursor: Option[Long] = None): Future[Unit] =
      synchronizeRotations(tenant, parallelism, saveCursor, maybeLastCursor)
        .flatMap { _ =>
          logger.info("[Rotation] verify rotation ended")
          jobRepo
            .save(
              jobInfo.copy(
                status = JobStatus.Completed,
                lastBatchAt = DateTime.now()
              )
            )
            .map(_ => ())
        }
        .recoverWith { case e =>
          logger.error(s"[Rotation] verify rotation failed: ${e.getMessage}", e)
          jobRepo
            .save(
              jobInfo
                .copy(status = JobStatus.Failed, lastBatchAt = DateTime.now())
            )
            .map(_ => ())
        }

    Time.concurrentTime(
      jobRepo
        .find(
          Json.obj("jobName" -> JobName.ApiKeyRotationVerifier.value),
          sort = Some(Json.obj("startedAt" -> -1)),
          maxDocs = 1
        )
        .map(_.headOption)
        .flatMap {
          case Some(lastJob)
              if lastJob.status == JobStatus.Running && lastJob.expiresAt.isAfterNow =>
            logger.info(
              "[Rotation] can't run another ApiKeyRotationVerifier, already one is running"
            )
            Future.successful(())

          case Some(lastJob)
              if lastJob.status == JobStatus.Running && lastJob.expiresAt.isBeforeNow =>
            logger.info(
              s"[Rotation] stale running job detected (expiresAt=${lastJob.expiresAt}), marking as Failed and resuming from cursor ${lastJob.cursor}"
            )
            jobRepo
              .save(lastJob.copy(status = JobStatus.Failed))
              .flatMap(_ => jobRepo.save(jobInfo.copy(cursor = lastJob.cursor)))
              .flatMap(_ => doRun(Some(lastJob.cursor)))

          case Some(lastJob) if lastJob.status == JobStatus.Failed =>
            logger.info(
              s"[Rotation] previous job failed, resuming from cursor ${lastJob.cursor}"
            )
            jobRepo
              .save(jobInfo.copy(cursor = lastJob.cursor))
              .flatMap(_ => doRun(Some(lastJob.cursor)))

          case _ =>
            logger.info("[Rotation] starting fresh rotation check")
            jobRepo.save(jobInfo).flatMap(_ => doRun())
        },
      "Rotation verifying run"
    )
  }

  private def synchronizeRotations(
      tenant: Tenant,
      parallelism: Int,
      saveCursor: Long => Future[Boolean],
      maybeLastCursor: Option[Long]
  ): Future[Unit] = {

    implicit val language: String = "en"

    val cursorClause = maybeLastCursor
      .map(c => s"AND (k.content ->> 'createdAt')::bigint >= $c")
      .getOrElse("")

    // keyrings carrying a rotation config, enabled or not: a rotation disabled
    // in Daikoku but still armed in Otoroshi has to be disarmed.
    val sql: String =
      s"""
         |SELECT k.content AS keyring,
         |       COALESCE(json_agg(
         |        json_build_object(
         |                'subscription', json_build_object('_id', s._id, 'team', s.content -> 'team'),
         |                'api', json_build_object('_id', apis._id, 'team', apis.content -> 'team'),
         |                'plan', json_build_object('_id', usage_plans._id)
         |        )) FILTER (WHERE s._id IS NOT NULL AND apis._id IS NOT NULL AND usage_plans._id IS NOT NULL), '[]'::json) AS subscriptions
         |FROM keyrings k
         |LEFT JOIN api_subscriptions s ON s.content ->> 'keyring' = k._id AND (s.content ->> '_deleted')::bool IS NOT TRUE
         |LEFT JOIN apis ON apis._id = s.content ->> 'api'
         |LEFT JOIN usage_plans ON usage_plans._id = s.content ->> 'plan'
         |WHERE (k.content ->> '_deleted')::bool IS NOT TRUE
         |  AND k.content ->> '_tenant' = $$1
         |  AND (k.content -> 'rotation' ->> 'enabled') IS NOT NULL
         |  $cursorClause
         |GROUP BY k._id, k.content
         |ORDER BY (k.content ->> 'createdAt')::bigint
         |""".stripMargin

    val processed = new AtomicLong(0)
    val synced = new AtomicLong(0)
    val errored = new AtomicLong(0)
    val lastCursor = new AtomicLong(maybeLastCursor.getOrElse(0L))

    logger.debug(
      s"[Rotation] starting for tenant ${tenant.id.value} with parallelism=$parallelism, cursor=${maybeLastCursor
          .getOrElse(0L)}"
    )

    env.dataStore
      .asInstanceOf[PostgresDataStore]
      .queryRawMappedStream(
        sql,
        Seq(Col("keyring", ColJson), Col("subscriptions", ColJsonArray)),
        Seq(tenant.id.value)
      )
      .mapAsync(parallelism) { row =>
        val keyring = (row \ "keyring").as(using json.KeyringFormat)
        val createdAt = (row \ "keyring" \ "createdAt").as[Long]
        val context = (row \ "subscriptions")
          .asOpt[Seq[JsValue]]
          .getOrElse(Seq.empty)
          .filter(_ != JsNull)
          .flatMap(RotationContext.readFromJson)
          .headOption

        (for {
          otoroshiSettings <- EitherT.fromOption[Future](
            keyring.otoroshiSettings match {
              case KeyringOtoroshiBinding.Otoroshi(id) =>
                tenant.otoroshiSettings.find(_.id == id)
              case KeyringOtoroshiBinding.Internal => None
            },
            AppError.EntityNotFound(
              s"otoroshi settings for keyring ${keyring.id.value} (apikey ${keyring.apiKey.clientId})"
            )
          )
          apk <- EitherT(
            client.getApikey(keyring.apiKey.clientId)(using otoroshiSettings)
          )
          _ <- applyDecision(
            RotationStateMachine.decide(keyring, apk),
            apk,
            otoroshiSettings,
            context,
            tenant
          )
        } yield ()).value
          // a single keyring must never tear the stream down
          .recover { case e =>
            Left(AppError.InternalServerError(e.getMessage))
          }
          .flatMap {
            case Right(_) =>
              synced.incrementAndGet()
              Future.successful(())
            case Left(err) =>
              errored.incrementAndGet()
              logger.error(
                s"[Rotation] keyring ${keyring.id.value} failed: ${Json.stringify(AppError.toJson(err))}"
              )
              notifyError(err, context, tenant)
          }
          .map(_ => createdAt)
      }
      .mapAsync(1) { createdAt =>
        lastCursor.set(createdAt)
        if (processed.incrementAndGet() % 100 == 0) {
          saveCursor(lastCursor.get()).map(_ => ())
        } else Future.successful(())
      }
      .runWith(Sink.ignore)
      .map { _ =>
        logger.info(
          s"[Rotation] tenant ${tenant.id.value}: processed=${processed.get()}, synced=${synced
              .get()}, errored=${errored.get()}"
        )
      }
  }

  private def applyDecision(
      decision: RotationDecision,
      apk: ActualOtoroshiApiKey,
      otoroshiSettings: OtoroshiSettings,
      context: Option[RotationContext],
      tenant: Tenant
  ): EitherT[Future, AppError, Unit] =
    decision match {
      case RotationDecision.NoOp(reason) =>
        logger.debug(s"[Rotation] ${apk.clientName}: $reason")
        EitherT.pure[Future, AppError](())

      case RotationDecision.ArmOtoroshi(rotation) =>
        logger.info(
          s"[Rotation] pushing rotation config to Otoroshi for ${apk.clientName}"
        )
        EitherT(
          client.updateApiKey(apk.copy(rotation = rotation.some))(using
            otoroshiSettings
          )
        ).map(_ => ())

      case RotationDecision.UpdateKeyring(keyring, event) =>
        EitherT.liftF(persist(keyring, event, context, tenant))
    }

  private def persist(
      keyring: Keyring,
      event: Option[RotationEvent],
      context: Option[RotationContext],
      tenant: Tenant
  ): Future[Unit] =
    for {
      _ <- env.dataStore.keyringRepo.forTenant(keyring.tenant).save(keyring)
      _ <- (event, context) match {
        case (Some(evt), Some(ctx)) => notifyRotation(evt, ctx, keyring, tenant)
        case _                      => Future.successful(())
      }
    } yield ()

  private def notifyRotation(
      event: RotationEvent,
      context: RotationContext,
      keyring: Keyring,
      tenant: Tenant
  ): Future[Unit] = {
    val action = event match {
      case RotationEvent.Started =>
        NotificationAction.ApiKeyRotationInProgressV2(
          subscription = context.subscription,
          api = context.api,
          plan = context.plan
        )
      case RotationEvent.Ended =>
        NotificationAction.ApiKeyRotationEndedV2(
          subscription = context.subscription,
          api = context.api,
          plan = context.plan
        )
    }

    logger.info(
      s"[Rotation] ${keyring.apiKey.clientName}: rotation state updated to $event"
    )

    ApiKeyRotationEvent(subscription = context.subscription)
      .logJobEvent(
        tenant,
        JobUtils.jobUser,
        Json.obj("token" -> keyring.integrationToken)
      )

    env.dataStore.notificationRepo
      .forTenant(tenant)
      .save(
        Notification(
          id = NotificationId(IdGenerator.token(32)),
          tenant = tenant.id,
          team = Some(context.subscriptionTeam),
          sender = JobUtils.jobUser.asNotificationSender,
          action = action,
          notificationType = NotificationType.AcceptOnly
        )
      )
      .map(_ => ())
  }

  /** Errors are rare, so resolving the subscription here rather than on the
    * happy path keeps the nominal run free of extra queries.
    */
  private def notifyError(
      error: AppError,
      context: Option[RotationContext],
      tenant: Tenant
  )(implicit language: String): Future[Unit] =
    context match {
      case None => Future.successful(())
      case Some(ctx) =>
        env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .findByIdNotDeleted(ctx.subscription)
          .map {
            case None => ()
            case Some(subscription) =>
              Seq(ctx.subscriptionTeam, ctx.apiTeam).distinct.foreach { team =>
                JobUtils.sendErrorNotification(
                  NotificationAction.OtoroshiSyncSubscriptionError(
                    subscription,
                    Json.stringify(AppError.toJson(error))
                  ),
                  team,
                  tenant.id
                )
              }
          }
    }
}
