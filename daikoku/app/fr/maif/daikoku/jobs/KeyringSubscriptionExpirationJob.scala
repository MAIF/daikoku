package fr.maif.daikoku.jobs

import cron4s._
import cron4s.lib.joda._
import fr.maif.daikoku.domain.{
  DatastoreId,
  JobInformation,
  JobName,
  JobStatus,
  NotificationAction,
  SchedulingMode,
  Tenant
}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.services.DeletionService
import fr.maif.daikoku.utils.IdGenerator
import org.apache.pekko.actor.Cancellable
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json._

import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.duration._
import scala.concurrent.{ExecutionContext, Future}

class KeyringSubscriptionExpirationJob(
    env: Env,
    deletionService: DeletionService
) {
  private val logger = Logger("keyring-subscription-expiration")
  private val ref = new AtomicReference[Cancellable]()

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  def start(): Unit = {
    logger.info("Start keyring subscription expiration job")
    if (env.config.keyringExpirationJobEnabled && ref.get() == null) {
      env.config.keyringExpirationJobSchedulingMode match {
        case SchedulingMode.Cron =>
          val cronExpr =
            env.config.keyringExpirationJobCronExpr.map(Cron.unsafeParse)

          def scheduleNext(): Unit = {
            val now = DateTime.now()
            cronExpr.flatMap(_.next[DateTime](now)) match {
              case Some(nextRun) =>
                val delay =
                  Math.max(nextRun.getMillis - now.getMillis, 1000).millis
                logger.info(
                  s"next cron run scheduled at $nextRun (in ${delay.toSeconds}s)"
                )
                ref.set(
                  env.defaultActorSystem.scheduler.scheduleOnce(delay) {
                    val _ = runForAllTenants().andThen { case _ =>
                      scheduleNext()
                    }
                    ()
                  }
                )
              case None =>
                logger.error(
                  s"could not compute next run from cron expression: ${env.config.keyringExpirationJobCronExpr.getOrElse("")}"
                )
            }
          }

          scheduleNext()

        case SchedulingMode.Interval =>
          ref.set(
            env.defaultActorSystem.scheduler.scheduleAtFixedRate(
              10.seconds,
              env.config.keyringExpirationJobInterval
            ) { () =>
              val _ = runForAllTenants()
              ()
            }
          )
      }
    }
  }

  def stop(): Unit = Option(ref.get()).foreach(_.cancel())

  private def runForAllTenants(): Future[Unit] =
    env.dataStore.tenantRepo
      .findAllNotDeleted()
      .flatMap(tenants => Future.sequence(tenants.map(run)))
      .map(_ => ())
      .recover { case e: Throwable =>
        logger.error("keyring subscription expiration run failed", e)
      }

  def run(tenant: Tenant): Future[Unit] = {
    val jobRepo = env.dataStore.JobInformationRepo.forTenant(tenant)
    val jobId = DatastoreId(s"keyring-expiration-${IdGenerator.token(16)}")
    val now = DateTime.now()

    jobRepo
      .findOneNotDeleted(
        Json.obj(
          "jobName" -> JobName.KeyringSubscriptionExpiration.value,
          "status" -> JobStatus.Running.value
        )
      )
      .flatMap {
        case Some(_) =>
          logger.info(
            "can't run another KeyringSubscriptionExpiration, already one is running"
          )
          Future.successful(())
        case None =>
          val jobInfo = JobInformation(
            id = jobId,
            tenant = tenant.id,
            jobName = JobName.KeyringSubscriptionExpiration,
            lockedBy = "keyring-subscription-expiration-job",
            lockedAt = now,
            expiresAt = now.plusHours(1),
            cursor = 0,
            startedAt = now,
            lastBatchAt = now,
            status = JobStatus.Running
          )
          jobRepo.save(jobInfo).flatMap { _ =>
            expireSubscriptions(tenant, now)
              .flatMap { count =>
                logger.info(
                  s"[keyring-expiration] tenant ${tenant.id.value}: removed $count expired subscription(s)"
                )
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
                logger.error(
                  s"[keyring-expiration] failed for tenant ${tenant.id.value}: ${e.getMessage}",
                  e
                )
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
      }
  }

  private def expireSubscriptions(
      tenant: Tenant,
      now: DateTime
  ): Future[Int] =
    env.dataStore.apiSubscriptionRepo
      .forTenant(tenant)
      .findNotDeleted(
        Json.obj("validUntil" -> Json.obj("$lt" -> now.getMillis))
      )
      .flatMap { expired =>
        if (expired.isEmpty) Future.successful(0)
        else
          Future
            .sequence(expired.groupBy(_.api).toSeq.map { case (apiId, subs) =>
              env.dataStore.apiRepo
                .forTenant(tenant)
                .findByIdNotDeleted(apiId)
                .flatMap {
                  case None =>
                    logger.warn(
                      s"[keyring-expiration] api ${apiId.value} not found, skipping ${subs.size} expired subscription(s)"
                    )
                    Future.successful(0)
                  case Some(api) =>
                    deletionService
                      .deleteSubscriptions(
                        subs,
                        api,
                        tenant,
                        notificationActionFor = (a, k, s) =>
                          NotificationAction.ApiSubscriptionExpired(
                            a.id,
                            k.apiKey.clientId,
                            s.id
                          )
                      )
                      .value
                      .map {
                        case Right(_) => subs.size
                        case Left(err) =>
                          logger.error(
                            s"[keyring-expiration] deletion failed for api ${apiId.value}: ${err.getErrorMessage()}"
                          )
                          0
                      }
                }
            })
            .map(_.sum)
      }
}
