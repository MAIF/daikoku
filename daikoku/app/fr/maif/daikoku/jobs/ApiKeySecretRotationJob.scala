package fr.maif.daikoku.jobs

import cats.data.EitherT
import fr.maif.daikoku.audit.ApiKeyRotationEvent
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.domain.json.{
  ApiSubscriptionyRotationFormat,
  OtoroshiApiKeyFormat
}
import fr.maif.daikoku.domain.{
  ApiId,
  ApiSubscription,
  ApiSubscriptionId,
  DatastoreId,
  JobInformation,
  JobName,
  JobStatus,
  Keyring,
  Notification,
  NotificationAction,
  NotificationId,
  NotificationType,
  SchedulingMode,
  Tenant,
  UsagePlan,
  UsagePlanId
}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.utils.{IdGenerator, OtoroshiClient, Time, Translator}
import org.apache.pekko.stream.Materializer
import org.joda.time.DateTime
import play.api.Logger
import play.api.i18n.MessagesApi
import play.api.libs.json.{JsArray, JsNull, JsObject, JsValue, Json}
import cats.implicits.*
import cron4s._
import cron4s.lib.joda._
import org.apache.pekko.actor.Cancellable

import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration.*

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
                    val _ = env.dataStore.tenantRepo
                      .findAllNotDeleted()
                      .flatMap(tenants =>
                        Future.sequence(
                          tenants.map(tenant =>
                            run(SyncAllSubscription(), tenant)
                          )
                        )
                      )
                      .map(_ => ())
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
                  env.dataStore.tenantRepo
                    .findAllNotDeleted()
                    .flatMap(tenants =>
                      Future.sequence(
                        tenants.map(tenant =>
                          run(SyncAllSubscription(), tenant)
                        )
                      )
                    )
                    .map(_ => ())
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

  // FIXME: better perf
  private def checkRotation(query: JsObject) = {
    for {
      candidates <-
        env.dataStore.apiSubscriptionRepo
          .forAllTenant()
          .findNotDeleted(query)
      // the keyrings (each owns one shared Otoroshi key) whose rotation is enabled
      keyrings <-
        env.dataStore.keyringRepo
          .forAllTenant()
          .findNotDeleted(
            Json.obj(
              "_id" -> Json.obj(
                "$in" -> JsArray(
                  candidates.map(_.keyring).distinct.map(_.asJson)
                )
              ),
              "rotation.enabled" -> true
            )
          )
      // all members of those keyrings, to pick one representative per keyring
      members <-
        env.dataStore.apiSubscriptionRepo
          .forAllTenant()
          .findNotDeleted(
            Json.obj(
              "keyring" -> Json.obj("$in" -> JsArray(keyrings.map(_.id.asJson)))
            )
          )
    } yield {
      implicit val language: String = "en"
      val keyringById = keyrings.map(k => k.id -> k).toMap
      // one representative subscription per keyring (for api/plan/team context)
      val representatives = members
        .groupBy(_.keyring)
        .collect { case (_, subs) if subs.nonEmpty => subs.head }
        .toSeq
      representatives.map(subscription =>
        for {
          tenant <- EitherT.fromOptionF(
            env.dataStore.tenantRepo.findByIdNotDeleted(subscription.tenant),
            JobUtils.sendErrorNotification(
              NotificationAction.OtoroshiSyncSubscriptionError(
                subscription,
                "Tenant does not exist anymore"
              ),
              subscription.team,
              subscription.tenant
            )
          )
          tenantAdminTeam <- EitherT.fromOptionF(
            env.dataStore.teamRepo
              .forTenant(tenant)
              .findOne(Json.obj("type" -> "Admin")),
            ()
          )
          api <- EitherT.fromOptionF(
            env.dataStore.apiRepo
              .forAllTenant()
              .findOneNotDeleted(
                Json.obj(
                  "_id" -> subscription.api.value
                  //                  "state" -> ApiState.publishedJsonFilter
                )
              ),
            JobUtils.sendErrorNotification(
              NotificationAction.OtoroshiSyncSubscriptionError(
                subscription,
                "API does not exist anymore"
              ),
              tenantAdminTeam.id,
              subscription.tenant
            )
          )
          plan <- EitherT.fromOptionF[Future, Unit, UsagePlan](
            env.dataStore.usagePlanRepo
              .forTenant(tenant)
              .findById(subscription.plan),
            JobUtils.sendErrorNotification(
              NotificationAction.OtoroshiSyncSubscriptionError(
                subscription,
                "Usage plan does not exist anymore"
              ),
              api.team,
              api.tenant
            )
          )
          otoroshiTarget <- EitherT.fromOption[Future](
            plan.otoroshiTarget,
            JobUtils.sendErrorNotification(
              NotificationAction.OtoroshiSyncSubscriptionError(
                subscription,
                "No Otoroshi target specified"
              ),
              api.team,
              api.tenant
            )
          )
          otoroshiSettings <- EitherT.fromOption[Future](
            tenant.otoroshiSettings
              .find(_.id == otoroshiTarget.otoroshiSettings),
            Seq(api.team, tenantAdminTeam.id)
              .map(team =>
                JobUtils.sendErrorNotification(
                  NotificationAction.OtoroshiSyncSubscriptionError(
                    subscription,
                    "Otoroshi settings does not exist anymore"
                  ),
                  team,
                  api.tenant
                )
              )
              .reduce((_, _) => ())
          )
          apk <- EitherT(
            client.getApikey(
              keyringById(subscription.keyring).apiKey.clientId
            )(using otoroshiSettings)
          ).leftMap(e =>
            JobUtils.sendErrorNotification(
              NotificationAction.OtoroshiSyncSubscriptionError(
                subscription,
                s"Unable to fetch apikey from otoroshi: ${Json
                    .stringify(AppError.toJson(e))}"
              ),
              api.team,
              api.tenant,
              Some(otoroshiSettings.host)
            )
          )
        } yield {
          val keyring = keyringById(subscription.keyring)
          if (!apk.rotation.exists(r => r.enabled)) {
            client.updateApiKey(
              apk.copy(rotation = keyring.rotation.map(_.toApiKeyRotation))
            )(using otoroshiSettings)
          } else {
            val otoroshiNextSecret: Option[String] =
              apk.rotation.flatMap(_.nextSecret)
            val otoroshiActualSecret: String = apk.clientSecret
            val daikokuActualSecret: String = keyring.apiKey.clientSecret
            val pendingRotation: Boolean =
              keyring.rotation.exists(_.pendingRotation)

            var notification: Option[Notification] = None
            var newKeyring: Option[Keyring] = None

            if (
              !pendingRotation && otoroshiNextSecret.isDefined && otoroshiActualSecret == daikokuActualSecret
            ) {
              logger.info(
                s"rotation state updated to Pending for ${apk.clientName}"
              )
              newKeyring = keyring
                .copy(
                  rotation =
                    keyring.rotation.map(_.copy(pendingRotation = true)),
                  apiKey = keyring.apiKey
                    .copy(clientSecret = otoroshiNextSecret.get)
                )
                .some
              notification = Notification(
                id = NotificationId(IdGenerator.token(32)),
                tenant = tenant.id,
                team = Some(subscription.team),
                sender = JobUtils.jobUser.asNotificationSender,
                action = NotificationAction.ApiKeyRotationInProgressV2(
                  subscription = subscription.id,
                  api = api.id,
                  plan = plan.id
                ),
                notificationType = NotificationType.AcceptOnly
              ).some

              ApiKeyRotationEvent(subscription = subscription.id)
                .logJobEvent(
                  tenant,
                  JobUtils.jobUser,
                  Json.obj("token" -> keyring.integrationToken)
                )

            } else if (pendingRotation && otoroshiNextSecret.isEmpty) {
              logger.info(
                s"rotation state updated to Ended for ${apk.clientName}"
              )
              notification = Notification(
                id = NotificationId(IdGenerator.token(32)),
                tenant = tenant.id,
                team = Some(subscription.team),
                sender = JobUtils.jobUser.asNotificationSender,
                action = NotificationAction.ApiKeyRotationEndedV2(
                  subscription = subscription.id,
                  api = api.id,
                  plan = plan.id
                ),
                notificationType = NotificationType.AcceptOnly
              ).some
              newKeyring = keyring
                .copy(
                  rotation =
                    keyring.rotation.map(_.copy(pendingRotation = true)),
                  apiKey = keyring.apiKey
                    .copy(clientSecret = otoroshiActualSecret),
                  bearerToken = apk.bearer
                )
                .some

              ApiKeyRotationEvent(subscription = subscription.id)
                .logJobEvent(
                  tenant,
                  JobUtils.jobUser,
                  Json.obj("token" -> keyring.integrationToken)
                )
            }

            (newKeyring, notification) match {
              case (Some(updatedKeyring), Some(notification)) =>
                for {
                  // the keyring is the source of truth for the shared api key
                  _ <-
                    env.dataStore.keyringRepo
                      .forTenant(updatedKeyring.tenant)
                      .save(updatedKeyring)
                  // propagate the rotated api key + rotation state to every member
                  _ <-
                    env.dataStore.apiSubscriptionRepo
                      .forTenant(updatedKeyring.tenant)
                      .updateManyByQuery(
                        Json.obj("keyring" -> updatedKeyring.id.asJson),
                        Json.obj(
                          "$set" -> Json.obj(
                            "apiKey" -> OtoroshiApiKeyFormat
                              .writes(updatedKeyring.apiKey),
                            "rotation" -> updatedKeyring.rotation
                              .map(ApiSubscriptionyRotationFormat.writes)
                              .getOrElse(JsNull)
                              .as[JsValue]
                          )
                        )
                      )
                  _ <-
                    env.dataStore.notificationRepo
                      .forTenant(updatedKeyring.tenant)
                      .save(notification)
                } yield ()
              case (_, _) =>
                logger.info(s"no need to update rotation for ${apk.clientName}")
            }
          }
        }
      )
    }
  }

  def run(
      entryPoint: ApiId | UsagePlanId | ApiSubscriptionId |
        SyncAllSubscription = SyncAllSubscription(),
      tenant: Tenant
  ): Future[Unit] = {
    logger.info(s"run apikey rotation check with entry point as $entryPoint")

    val query = entryPoint match {
      case apiId: ApiId             => Json.obj("api" -> apiId.asJson)
      case usagePlanId: UsagePlanId => Json.obj("plan" -> usagePlanId.asJson)
      case subscriptionId: ApiSubscriptionId =>
        Json.obj("_id" -> subscriptionId.asJson)
      case _: SyncAllSubscription => Json.obj()
    }

    val jobRepo = env.dataStore.JobInformationRepo.forTenant(tenant)
    val jobId = DatastoreId(s"sync-${IdGenerator.token(16)}")
    val now = DateTime.now()

    Time.concurrentTime(
      jobRepo
        .findOneNotDeleted(
          Json.obj(
            "jobName" -> JobName.ApiKeyRotationVerifier.value,
            "status" -> JobStatus.Running.value
          )
        )
        .flatMap {
          case Some(_) =>
            logger.info(
              "can't run another ApiKeyRotationVerifier, already one is running"
            )
            Future.successful(())
          case None =>
            val jobInfo = JobInformation(
              id = jobId,
              tenant = tenant.id,
              jobName = JobName.ApiKeyRotationVerifier,
              lockedBy = "apikey-rotation-verifier-job",
              lockedAt = now,
              expiresAt = now.plusHours(1),
              cursor = 0,
              startedAt = now,
              lastBatchAt = now,
              status = JobStatus.Running
            )
            jobRepo.save(jobInfo).flatMap { _ =>
              checkRotation(query)
                .flatMap { _ =>
                  logger.info("verify rotation ended")
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
                  logger.error(s"verify rotation failed: ${e.getMessage}", e)
                  jobRepo
                    .save(
                      jobInfo.copy(
                        status = JobStatus.Failed,
                        lastBatchAt = DateTime.now()
                      )
                    )
                    .map(_ => ())
                }
            }
        },
      "Rotation verifying run"
    )
  }
}
