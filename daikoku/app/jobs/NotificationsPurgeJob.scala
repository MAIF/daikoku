package jobs

import fr.maif.otoroshi.daikoku.domain.NotificationType
import fr.maif.otoroshi.daikoku.env.Env
import org.apache.pekko.actor.Cancellable
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json._

import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.ExecutionContext
import scala.concurrent.duration._

class NotificationsPurgeJob(env: Env) {

  private val logger = Logger("NotificationsPurgeJob")

  private val ref = new AtomicReference[Cancellable]()

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  def start(): Unit = {
    logger.info("Start notifications purge job")
    logger.info(
      s"audit by cron ==> ${env.config.notificationsPurgeByCron} every ${env.config.notificationsPurgeInterval}"
    )
    if (env.config.notificationsPurgeByCron && ref.get() == null) {
      ref.set(
        env.defaultActorSystem.scheduler
          .scheduleAtFixedRate(
            10.seconds,
            env.config.notificationsPurgeInterval
          ) { () =>
            purge()
          }
      )
    }
  }

  def stop(): Unit = {
    Option(ref.get()).foreach(_.cancel())
  }

  def purge() = {
    logger.info(
      s"Run notifications purge for last ${env.config.notificationsBasePurgeMaxDate}/${env.config.notificationsToTreatPurgeMaxDate}"
    )
    env.dataStore.notificationRepo
      .forAllTenant()
      .delete(
        Json.obj(
          "$or" -> Json.arr(
            Json.obj(
              "notificationType" -> NotificationType.AcceptOnly.value,
              "status.status" -> "Pending",
              "date" -> Json.obj(
                "$lt" -> DateTime
                  .now()
                  .minus(env.config.notificationsBasePurgeMaxDate.toMillis)
                  .getMillis
              )
            ),
            Json.obj(
              "status.status" -> "Accepted",
              "status.date" -> Json.obj(
                "$lt" -> DateTime
                  .now()
                  .minus(env.config.notificationsBasePurgeMaxDate.toMillis)
                  .getMillis
              )
            ),
            Json.obj(
              "notificationType" -> NotificationType.AcceptOrReject.value,
              "status.status" -> "Pending",
              "date" -> Json.obj(
                "$lt" -> DateTime
                  .now()
                  .minus(env.config.notificationsToTreatPurgeMaxDate.toMillis)
                  .getMillis
              )
            )
          )
        )
      )
  }
}
