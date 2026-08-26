package fr.maif.daikoku.jobs

import cron4s._
import cron4s.lib.joda._
import fr.maif.daikoku.audit.JobEvent
import fr.maif.daikoku.domain.NotificationAction.{
  OtoroshiSyncApiError,
  OtoroshiSyncSubscriptionError
}
import fr.maif.daikoku.domain.{
  Api,
  ApiId,
  ApiSubscriptionId,
  AuthorizedEntities,
  ConsoleMailerSettings,
  DatastoreId,
  JobInformation,
  JobName,
  JobStatus,
  Notification,
  NotificationAction,
  NotificationId,
  NotificationStatus,
  NotificationType,
  OtoroshiSettings,
  SchedulingMode,
  OtoroshiSyncNotificationAction,
  TeamId,
  Tenant,
  TenantId,
  UsagePlanId,
  User,
  UserId
}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.utils.{
  ConsoleMailer,
  IdGenerator,
  Mailer,
  OtoroshiClient,
  Time,
  Translator
}
import org.apache.pekko.Done
import org.apache.pekko.actor.Cancellable
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.{Sink, Source}
import org.joda.time.DateTime
import play.api.Logger
import play.api.i18n.MessagesApi
import play.api.libs.json.*

import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration.*
import scala.util.{Failure, Success}

class OtoroshiEntitiesVerifierJob(
    client: OtoroshiClient,
    env: Env,
    translator: Translator,
    messagesApi: MessagesApi
) {
  private val logger = Logger("otoroshi-entities-verifier")
  private val ref = new AtomicReference[Cancellable]()

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val mat: Materializer = env.defaultMaterializer
  implicit val ev: Env = env
  implicit val me: MessagesApi = messagesApi
  implicit val tr: Translator = translator

  def start(): Unit = {
    val syncAvalaible =
      env.config.verifierJobEnabled && env.config.otoroshiSyncMaster // FIXME: use also otoroshiSyncMaster ???

    if (syncAvalaible && ref.get() == null) {
      env.config.verifierJobSchedulingMode match {
        case SchedulingMode.Cron =>
          val cronExpr = env.config.verifierJobCronExpr.map(Cron.unsafeParse)

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
                      .findAll()
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
                  s"could not compute next run from cron expression: ${env.config.verifierJobCronExpr.getOrElse("")}"
                )
            }
          }

          scheduleNext()

        case SchedulingMode.Interval =>
          ref.set(
            env.defaultActorSystem.scheduler
              .scheduleAtFixedRate(10.seconds, env.config.verifierJobInterval) {
                () =>
                  env.dataStore.tenantRepo
                    .findAll()
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

  /** `entryPointFilter` narrows the apis to verify. Beware: it is built from
    * the job's entry point, which names *subscription* fields (`api`, `plan`,
    * or the subscription's own `_id`) while the filter runs against the apis
    * table. An `Api` carries none of them, so every entry point but
    * `SyncAllSubscription` filters the stream down to nothing — the job then
    * verifies no api at all. Ported as-is; fixing it means deciding which api a
    * plan or a subscription should resolve to.
    */
  private def verifyIfOtoroshiGroupsStillExists(
      entryPointFilter: Option[(String, String)] = None
  ): Future[Done] = {
    def checkEntities(
        entities: AuthorizedEntities,
        otoroshi: OtoroshiSettings,
        api: Api
    ): Future[Unit] = {
      Future
        .sequence(
          entities.groups.map(group =>
            client
              .getServiceGroup(group.value)(using otoroshi)
              .map(_ => ())
              .andThen { case Failure(_) =>
                implicit val language: String = "en"
                logger.error(
                  s"Unable to fetch service group $group from otoroshi. Maybe it doesn't exists anymore"
                )
                JobUtils.sendErrorNotification(
                  NotificationAction.OtoroshiSyncApiError(
                    api,
                    s"Unable to fetch service group $group from otoroshi. Maybe it doesn't exists anymore"
                  ),
                  api.team,
                  api.tenant
                )
              }
          ) ++
            entities.services.map(service =>
              client
                .getServices()(using otoroshi)
                .andThen { case Failure(_) =>
                  implicit val language: String = "en"
                  logger.error(
                    s"Unable to fetch service $service from otoroshi. Maybe it doesn't exists anymore"
                  )
                  JobUtils.sendErrorNotification(
                    NotificationAction.OtoroshiSyncApiError(
                      api,
                      s"Unable to fetch service $service from otoroshi. Maybe it doesn't exists anymore"
                    ),
                    api.team,
                    api.tenant
                  )
                }
            ) ++
            entities.routes.map(route =>
              client
                .getRoutes()(using otoroshi)
                .andThen { case Failure(_) =>
                  implicit val language: String = "en"
                  logger.error(
                    s"Unable to fetch route $route from otoroshi. Maybe it doesn't exists anymore"
                  )
                  JobUtils.sendErrorNotification(
                    NotificationAction.OtoroshiSyncApiError(
                      api,
                      s"Unable to fetch route $route from otoroshi. Maybe it doesn't exists anymore"
                    ),
                    api.team,
                    api.tenant
                  )
                }
            )
        )
        .map(_ => ())
    }

    logger.info("Verifying if otoroshi groups still exists")
    val par = 10
    val apiRepo = env.dataStore.apiRepo.forAllTenant()
    val (entryPointPredicate, entryPointParams) = entryPointFilter match {
      case Some((field, value)) =>
        (s" AND content->>'$field' = $$1", Seq[AnyRef](value))
      case None => ("", Seq.empty[AnyRef])
    }

    Source
      .future(
        apiRepo.query(
          s"SELECT content FROM ${apiRepo.tableName} " +
            s"WHERE content->>'_deleted' = 'false'$entryPointPredicate",
          entryPointParams
        )
      )
      .flatMapConcat(apis => Source(apis.toList))
      .mapAsync(par)(api =>
        env.dataStore.tenantRepo
          .findById(api.tenant)
          .map(tenant => (tenant, api))
      )
      .mapAsync(5) { case (tenant, api) =>
        env.dataStore.usagePlanRepo
          .findByApi(api.tenant, api)
          .map(plans => (tenant, api, plans))
      }
      .collect { case (Some(tenant), api, plans) =>
        (tenant, api, plans)
      }
      .flatMapConcat { case (tenant, api, plans) =>
        Source(plans.map(plan => (tenant, api, plan)))
      }
      .map { case (tenant, api, plan) =>
        (
          tenant,
          api,
          plan,
          tenant.otoroshiSettings.find(os =>
            plan.otoroshiTarget.exists(ot => ot.otoroshiSettings == os.id)
          )
        )
      }
      .collect {
        case (tenant, api, plan, Some(settings))
            if plan.otoroshiTarget.exists(
              _.authorizedEntities.exists(!_.isEmpty)
            ) =>
          (tenant, api, plan, settings)
      }
      .mapAsync(par) { case (_, api, plan, settings) =>
        checkEntities(
          plan.otoroshiTarget.get.authorizedEntities.get,
          settings,
          api
        )
      }
      .runWith(Sink.ignore)
  }

  def run(
      entryPoint: ApiId | UsagePlanId | ApiSubscriptionId |
        SyncAllSubscription = SyncAllSubscription(),
      tenant: Tenant
  ): Future[Unit] = {
    logger.info(s"run otoroshi entities verify")

    val jobRepo = env.dataStore.JobInformationRepo.forTenant(tenant)
    val jobId = DatastoreId(s"sync-${IdGenerator.token(16)}")
    val now = DateTime.now()

    val entryPointFilter: Option[(String, String)] = entryPoint match {
      case apiId: ApiId             => Some("api" -> apiId.value)
      case usagePlanId: UsagePlanId => Some("plan" -> usagePlanId.value)
      case subscriptionId: ApiSubscriptionId =>
        Some("_id" -> subscriptionId.value)
      case _: SyncAllSubscription => None
    }

    Time.concurrentTime(
      jobRepo
        .findOneNotDeleted(
          Json.obj(
            "jobName" -> JobName.OtoroshiEntitiesVerifier.value,
            "status" -> JobStatus.Running.value
          )
        )
        .flatMap {
          case Some(_) =>
            logger.info(
              "can't run another OtoroshiEntitiesVerifier, already one is running"
            )
            Future.successful(())
          case None =>
            val jobInfo = JobInformation(
              id = jobId,
              tenant = tenant.id,
              jobName = JobName.OtoroshiEntitiesVerifier,
              lockedBy = "otoroshi-entities-verifier-job",
              lockedAt = now,
              expiresAt = now.plusHours(1),
              cursor = 0,
              startedAt = now,
              lastBatchAt = now,
              status = JobStatus.Running
            )
            jobRepo.save(jobInfo).flatMap { _ =>
              verifyIfOtoroshiGroupsStillExists(entryPointFilter)
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
