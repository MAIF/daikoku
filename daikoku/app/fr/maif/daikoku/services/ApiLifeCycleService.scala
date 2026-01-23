package fr.maif.otoroshi.daikoku.services

import cats.data.EitherT
import controllers.AppError
import fr.maif.otoroshi.daikoku.actions.DaikokuActionContext
import fr.maif.otoroshi.daikoku.domain.{
  ActualOtoroshiApiKey,
  Api,
  ApiState,
  ApiSubscription,
  Notification,
  NotificationAction,
  NotificationId,
  NotificationType,
  OtoroshiSettings,
  SubscriptionDemandState,
  Team,
  TeamId
}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.utils.{IdGenerator, OtoroshiClient, Translator}
import org.apache.pekko.http.scaladsl.util.FastFuture
import play.api.i18n.MessagesApi
import play.api.libs.json.{JsArray, JsString, JsValue, Json}

import scala.concurrent.{ExecutionContext, Future}

class ApiLifeCycleService(mailService: MailService, otoroshiClient: OtoroshiClient) {

  def handleApiLifeCycle(oldApi: Api, newApi: Api)(implicit
      translator: Translator,
      ec: ExecutionContext,
      env: Env,
      ma: MessagesApi,
      ctx: DaikokuActionContext[JsValue]
  ): EitherT[Future, AppError, Unit] = {
    (oldApi.state, newApi.state) match {
      case (ApiState.Published, ApiState.Deprecated) => notifyDepreciation(newApi)
      case (ApiState.Published, ApiState.Blocked)    => handleApiBlocking(oldApi)
      case (ApiState.Deprecated, ApiState.Blocked)   => handleApiBlocking(oldApi)
      case _                                         => EitherT.pure[Future, AppError](())
    }
  }

  def handleApiBlocking(api: Api)(implicit
      ec: ExecutionContext,
      env: Env,
      ctx: DaikokuActionContext[JsValue]
  ): EitherT[Future, AppError, Unit] = {

    for {
      _             <-
        env.dataStore.apiSubscriptionRepo
          .forTenant(ctx.tenant)
          .updateManyByQuery(
            Json.obj(
              "api"  -> api.id.asJson
            ),
            Json.obj(
              "$set" -> Json
                .obj("state" -> SubscriptionDemandState.Blocked.name, "enabled" -> false)
            )
          )
      subscriptions <- env.dataStore.apiSubscriptionRepo
                         .forTenant(ctx.tenant)
                         .findNotDeleted(Json.obj("api" -> api.id.asJson))

      plansIds       = subscriptions.map(_.plan).distinct

      plans                                                                          <- env.dataStore.usagePlanRepo
                                                                                          .forTenant(ctx.tenant)
                                                                                          .findNotDeleted(Json.obj("_id" -> Json.obj("$in" -> JsArray(plansIds.map(_.asJson)))))

      subsWithMaybeOtoSetting: Seq[(ApiSubscription, Option[OtoroshiSettings])]       =
        subscriptions
          .map(subscription => (subscription, plans.find(_.id == subscription.plan)))
          .map { case (sub, maybeUsagePlan) =>
            val otoroshiSettings: Option[OtoroshiSettings] = maybeUsagePlan
              .flatMap(_.otoroshiTarget)
              .map(_.otoroshiSettings)
              .flatMap(id => ctx.tenant.otoroshiSettings.find(_.id == id))

            (sub, otoroshiSettings)
          }

      subOrNotToSub: (Seq[ApiSubscription], Seq[(ApiSubscription, OtoroshiSettings)]) =
        subsWithMaybeOtoSetting.partitionMap {
          case (sub, Some(otoS)) => Right((sub, otoS))
          case (sub, None)       => Left(sub)
        }

      _ <-
        Future.sequence(
          subOrNotToSub._1.map(x =>
            FastFuture.successful(AppLogger.warn(s"Impossible de bloquer la clé Otoroshi de la souscription ${x.id}"))
          )
        )
      _ <- Future.sequence(subOrNotToSub._2.map { case (sub, os) =>
             val future: Future[Either[AppError, ActualOtoroshiApiKey]] =
               otoroshiClient.getApikey(sub.apiKey.clientId)(os).flatMap {
                 case Left(error)   => FastFuture.successful(Left(error))
                 case Right(apikey) => otoroshiClient.updateApiKey(apikey.copy(enabled = false))(os) //FIXME: use patch
               }
             future
           })
      _ <- notifyBlocking(subscriptions, api)
    } yield ()
    EitherT.pure[Future, AppError](())
  }

  //A voir : Si api bloquée, plus personne ne peux la voir, et il n'est pas possible de s'y connecter. Comment en rcupérer le nom

  def notifyBlocking(subscriptions: Seq[ApiSubscription], api: Api)(implicit
      ec: ExecutionContext,
      env: Env,
      ctx: DaikokuActionContext[JsValue]
  ) = {
    val subscriptionsTeamsIds: Seq[TeamId] = subscriptions.map(_.team).distinct

    for {
      subscriptionTeams <-
        env.dataStore.teamRepo
          .forTenant(ctx.tenant.id)
          .findNotDeleted(Json.obj("_id" -> Json.obj("$in" -> JsArray(subscriptionsTeamsIds.map(_.asJson)))))
      _                 <- Future.sequence(subscriptionTeams.map(subscriptionTeam => {
                             val notification = Notification(
                               id = NotificationId(IdGenerator.token(32)),
                               tenant = ctx.tenant.id,
                               team = Option.apply(subscriptionTeam.id),
                               sender = ctx.user.asNotificationSender,
                               notificationType = NotificationType.AcceptOnly,
                               action = NotificationAction.ApiBlockingWarning(api.id)
                             )
                             env.dataStore.notificationRepo
                               .forTenant(ctx.tenant.id)
                               .save(notification)
                           }))

    } yield {
      EitherT.pure[Future, AppError](())
    }
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
      _                                 <- EitherT.liftF[Future, AppError, Seq[Boolean]](Future.sequence(subscriptionTeams.map(subscriptionTeam => {
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
