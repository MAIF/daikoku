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
import fr.maif.daikoku.utils.{IdGenerator, OtoroshiClient, Translator}
import org.apache.pekko.stream.scaladsl.Sink
import play.api.Logger
import play.api.i18n.MessagesApi
import play.api.libs.json.*

import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicLong
import scala.concurrent.Future
import scala.jdk.CollectionConverters.*

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
    override protected val env: Env,
    translator: Translator,
    messagesApi: MessagesApi
) extends AbstractJob[Unit] {

  override protected val logger: Logger =
    Logger("APIkey-Rotation-Synchronizer")
  override protected val jobName: JobName = JobName.ApiKeyRotationVerifier
  override protected val lockedBy: String = "apikey-rotation-verifier-job"
  override protected val defaultInput: Unit = ()

  override protected val jobConfig: JobConfig = JobConfig(
    enabled = env.config.rotationJobEnabled,
    schedulingMode = env.config.rotationJobSchedulingMode,
    cronExpression = env.config.rotationJobCronExpr,
    interval = env.config.rotationJobInterval
  )

  implicit val ev: Env = env
  implicit val me: MessagesApi = messagesApi
  implicit val tr: Translator = translator

  override protected def process(
      tenant: Tenant,
      input: Unit,
      parallelism: Int,
      saveCursor: Long => Future[Boolean],
      fromCursor: Option[Long]
  ): Future[JobRunResult] = {
    implicit val language: String = "en"

    val cursorClause = fromCursor
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
    val failures = new ConcurrentLinkedQueue[JobItemFailure]()
    val lastCursor = new AtomicLong(fromCursor.getOrElse(0L))

    logger.debug(
      s"[Rotation] starting for tenant ${tenant.id.value} with parallelism=$parallelism, cursor=${fromCursor
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
              failures.add(
                JobItemFailure(
                  keyring.id.value,
                  Json.stringify(AppError.toJson(err))
                )
              )
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
        val result = JobRunResult(
          processed = processed.get(),
          succeeded = synced.get(),
          failures = failures.asScala.toSeq,
          lastCursor = Some(lastCursor.get())
        )
        logger.info(
          s"[Rotation] tenant ${tenant.id.value}: processed=${result.processed}, synced=${result.succeeded}, errored=${result.failures.size}"
        )
        result
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
