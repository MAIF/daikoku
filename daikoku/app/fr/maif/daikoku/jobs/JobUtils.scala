package fr.maif.daikoku.jobs

import fr.maif.daikoku.domain.*
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.utils.{ConsoleMailer, IdGenerator, Mailer, Translator}
import fr.maif.daikoku.audit.JobEvent
import fr.maif.daikoku.controllers.AppError

import scala.util.{Failure, Success, Try}
import scala.concurrent.ExecutionContext
import org.joda.time.DateTime
import play.api.i18n.MessagesApi
import play.api.libs.json.*

object JobUtils {
  val jobUser = User(
    id = UserId("otoroshi-verifier-job"),
    tenants = Set(),
    origins = Set(),
    name = "Otoroshi Verifier Job",
    email = "verifier@daikoku.io",
    picture = "https://www.otoroshi.io/assets/images/svg/otoroshi_logo.svg",
    password = None,
    lastTenant = None,
    defaultLanguage = None
    // lastTeams = Map.empty
  )

  def sendErrorNotification(
      err: OtoroshiSyncNotificationAction,
      teamId: TeamId,
      tenantId: TenantId,
      otoHost: Option[String] = None
  )(implicit
      env: Env,
      ec: ExecutionContext,
      tr: Translator,
      message: MessagesApi,
      language: String
  ): Unit = {
    env.dataStore.notificationRepo
      .forTenant(tenantId)
      .save(
        Notification(
          id = NotificationId(IdGenerator.token(32)),
          tenant = tenantId,
          team = Some(teamId),
          sender = jobUser.asNotificationSender,
          date = DateTime.now(),
          notificationType = NotificationType.AcceptOnly,
          status = NotificationStatus.Pending(),
          action = err.asInstanceOf[NotificationAction]
        )
      )
    env.dataStore.tenantRepo.findByIdNotDeleted(tenantId).andThen {
      case Success(Some(tenant)) =>
        JobEvent(err.message).logJobEvent(
          tenant,
          jobUser,
          err match {
            case NotificationAction
                  .OtoroshiSyncSubscriptionError(subscription, _) =>
              Json.obj(
                "subscription" -> subscription.asJson,
                "team" -> teamId.value,
                "tenant" -> tenantId.value
              )
            case NotificationAction.OtoroshiSyncApiError(api, _) =>
              Json.obj(
                "api" -> api.asJson,
                "team" -> teamId.value,
                "tenant" -> tenantId.value
              )
          }
        )
    }
    env.dataStore.userRepo
      .findAllNotDeleted()
      .map(_.filter(_.isDaikokuAdmin))
      .map { users =>
        def sendMail(mailer: Mailer, tenant: Tenant): Unit = {
          implicit val language: String = tenant.defaultLanguage.getOrElse("en")
          mailer.send(
            "Otoroshi synchronizer error",
            users.map(_.email),
            s"""<p>An error occured during the Otoroshi synchronization job for team ${teamId.value} on tenant ${tenantId.value} for $otoHost</p>
               |<p>${err.message}</p>
               |<strong>Details</strong>
               |<pre>${Json.prettyPrint(err.json)}</pre>
                """.stripMargin,
            tenant
          )
        }

        val tenants: Seq[TenantId] = users.flatMap(u => u.tenants).distinct
        env.dataStore.tenantRepo
          .find(
            Json.obj(
              "_deleted" -> false,
              "_id" -> Json.obj(
                "$in" -> JsArray(tenants.map(t => JsString(t.value)))
              )
            )
          )
          .map { tenants =>
            tenants.find { t =>
              t.mailerSettings.isDefined && t.mailerSettings.get.mailerType != "console"
            } match {
              case None =>
                sendMail(
                  new ConsoleMailer(ConsoleMailerSettings()),
                  tenants.head
                )
              case Some(tenant) => sendMail(tenant.mailer(using env), tenant)
            }
          }
      }
  }
}
