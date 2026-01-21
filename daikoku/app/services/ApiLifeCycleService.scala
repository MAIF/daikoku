package fr.maif.otoroshi.daikoku.services

import cats.data.EitherT
import controllers.AppError
import fr.maif.otoroshi.daikoku.actions.DaikokuActionContext
import fr.maif.otoroshi.daikoku.domain.{
  Api,
  ApiState,
  ApiSubscription,
  Notification,
  NotificationAction,
  NotificationId,
  NotificationType,
  Team,
  TeamId
}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.utils.{IdGenerator, Translator}
import play.api.i18n.MessagesApi
import play.api.libs.json.{JsArray, JsString, JsValue, Json}

import scala.concurrent.{ExecutionContext, Future}

class ApiLifeCycleService(mailService: MailService) {

  def handleApiLifeCycle(oldApi: Api, newApi: Api)(implicit
      translator: Translator,
      ec: ExecutionContext,
      env: Env,
      ma: MessagesApi,
      ctx: DaikokuActionContext[JsValue]
  ): EitherT[Future, AppError, Unit] = {
    (oldApi.state, newApi.state) match {
      case (ApiState.Published, ApiState.Deprecated) => notifyDepreciation(newApi)
      case (ApiState.Published, ApiState.Blocked)    => EitherT.pure[Future, AppError](()) //Todo: HandleCase
      case (ApiState.Deprecated, ApiState.Blocked)   => EitherT.pure[Future, AppError](()) //Todo: HandleCase
      case _                                         => EitherT.pure[Future, AppError](())
    }
  }

  def BlockApi(newApi: Api): Unit = {
    // notifyBlocked()
  }

  def BlockSoucription(newApi: Api): Unit = {
    // notifyBlocked()
  }

  def notifyBlocked(newApi: Api): Unit = {

  }

  def notifyDepreciation(newApi: Api)(implicit
      translator: Translator,
      ec: ExecutionContext,
      env: Env,
      ma: MessagesApi,
      ctx: DaikokuActionContext[JsValue]
  ): EitherT[Future, AppError, Unit] = {

    AppLogger.info("notifyDepreciation")

    for {
      subscriptions                     <- EitherT.liftF[Future, AppError, Seq[ApiSubscription]](
                                             env.dataStore.apiSubscriptionRepo
                                               .forTenant(ctx.tenant)
                                               .findNotDeleted(
                                                 Json.obj("api" -> newApi.id.value)
                                               )
                                           )

      subscriptionsTeamsIds: Seq[TeamId] = subscriptions.map(_.team).distinct
      subscriptionTeams                 <-
        EitherT.liftF[Future, AppError, Seq[Team]](
          env.dataStore.teamRepo
            .forTenant(ctx.tenant.id)
            .findNotDeleted(Json.obj("_id" -> Json.obj("$in" -> JsArray(subscriptionsTeamsIds.map(_.asJson)))))
        )
      _                             <- EitherT.liftF[Future, AppError, Seq[Boolean]](Future.sequence(subscriptionTeams.map(subscriptionTeam => {
                                             val notification = Notification(
                                               id = NotificationId(IdGenerator.token(32)),
                                               tenant = ctx.tenant.id,
                                               team = Option.apply(subscriptionTeam.id),
                                               sender = ctx.user.asNotificationSender,
                                               notificationType = NotificationType.AcceptOnly,
                                               action = NotificationAction.ApiDepreciationWarning(newApi.id)
                                             )
                                             env.dataStore.notificationRepo
                                               .forTenant(ctx.tenant.id)
                                               .save(notification)
                                           })))
      _                                 <- EitherT.liftF[Future, AppError, Unit](
                                             mailService.sendMailToTeamsAdmins(
                                               teams = subscriptionTeams,
                                               tenant = ctx.tenant,
                                               args = (team, admin) =>
                                                 Map(
                                                   "recipientName"  -> JsString(admin.name),
                                                   "teamName"       -> JsString(team.name),
                                                   "apiName"        -> JsString(newApi.name),
                                                   "recipient_data" -> admin.asSimpleJson,
                                                   "team_data"      -> team.asSimpleJson,
                                                   "api_data"       -> newApi.asJson,
                                                   "tenant_data"    -> ctx.tenant.toUiPayload(env)
                                                 ),
                                               mailKey = "mail.api.depreciation.warning"
                                             )
                                           )
    } yield ()
  }
}
