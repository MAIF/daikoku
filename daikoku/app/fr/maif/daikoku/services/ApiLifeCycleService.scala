package fr.maif.otoroshi.daikoku.services

import cats.data.EitherT
import controllers.AppError
import fr.maif.otoroshi.daikoku.actions.DaikokuActionContext
import fr.maif.otoroshi.daikoku.domain.{
  ActualOtoroshiApiKey,
  Api,
  ApiState,
  ApiSubscription,
  ApiSubscriptionState,
  Notification,
  NotificationAction,
  NotificationId,
  NotificationType,
  OtoroshiSettings,
  SubscriptionDemandState,
  Team,
  TeamId,
  UsagePlan,
  UsagePlanId
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
      case (ApiState.Published, ApiState.Blocked)    => handleApiBlocking(newApi)
      case (ApiState.Deprecated, ApiState.Blocked)   => handleApiBlocking(newApi)
      case (ApiState.Blocked, ApiState.Deprecated)   => handleApiDeblocking(newApi)
      case (ApiState.Blocked, ApiState.Published)    => handleApiDeblocking(newApi)
      case _                                         => EitherT.pure[Future, AppError](())
    }
  }

  private def handleApiDeblocking(api: Api)(implicit
      ec: ExecutionContext,
      env: Env,
      ctx: DaikokuActionContext[JsValue]
  ): EitherT[Future, AppError, Unit] = {

    for {
      _ <- EitherT.liftF(
             env.dataStore.apiSubscriptionRepo
               .forTenant(ctx.tenant)
               .updateManyByQuery(
                 Json.obj(
                   "api"  -> api.id.asJson
                 ),
                 Json.obj(
                   "$set" -> Json
                     .obj("state" -> ApiSubscriptionState.Active.name, "enabled" -> api.state.name)
                 )
               )
           )

      subscriptions <- EitherT.liftF(getSubscriptionNotDeleted(api = api))
      plansIds       = subscriptions.map(_.plan).distinct
      plans         <- EitherT.liftF(getPlansNotDeleted(plansIds = plansIds))

      subsWithMaybeOtoSetting: Seq[(ApiSubscription, Option[OtoroshiSettings])]       =
        getSubsWithMaybeOtoSetting(subscriptions = subscriptions, plans = plans)

      subOrNotToSub: (Seq[ApiSubscription], Seq[(ApiSubscription, OtoroshiSettings)]) =
        subsWithMaybeOtoSetting.partitionMap {
          case (sub, Some(otoS)) => Right((sub, otoS))
          case (sub, None)       => Left(sub)
        }

      _ <-
        EitherT.right[AppError](
          Future.sequence(
            subOrNotToSub._1.map(x =>
              FastFuture.successful(
                AppLogger.warn(s"Impossible de débloquer la clé Otoroshi de la souscription ${x.id}")
              )
            )
          )
        )

      _ <- EitherT.liftF(updateApiKey(subOrNotToSub._2))

    } yield ()
  }

  private def handleApiBlocking(api: Api)(implicit
      ec: ExecutionContext,
      env: Env,
      ctx: DaikokuActionContext[JsValue]
  ): EitherT[Future, AppError, Unit] = {
    for {
      _             <- EitherT.liftF(
                         env.dataStore.apiSubscriptionRepo
                           .forTenant(ctx.tenant)
                           .updateManyByQuery(
                             Json.obj(
                               "api"  -> api.id.asJson
                             ),
                             Json.obj(
                               "$set" -> Json
                                 .obj("state" -> ApiSubscriptionState.Blocked.name, "enabled" -> false)
                             )
                           )
                       )
      subscriptions <- EitherT.liftF(getSubscriptionNotDeleted(api = api))
      plansIds       = subscriptions.map(_.plan).distinct
      plans         <- EitherT.liftF(getPlansNotDeleted(plansIds = plansIds))

      subsWithMaybeOtoSetting: Seq[(ApiSubscription, Option[OtoroshiSettings])]       =
        getSubsWithMaybeOtoSetting(subscriptions = subscriptions, plans = plans)

      subOrNotToSub: (Seq[ApiSubscription], Seq[(ApiSubscription, OtoroshiSettings)]) =
        subsWithMaybeOtoSetting.partitionMap {
          case (sub, Some(otoS)) => Right((sub, otoS))
          case (sub, None)       => Left(sub)
        }

      _ <-
        EitherT.right[AppError](
          Future.sequence(
            subOrNotToSub._1.map(x =>
              FastFuture.successful(AppLogger.warn(s"Impossible de bloquer la clé Otoroshi de la souscription ${x.id}"))
            )
          )
        )
      _ <- EitherT.liftF(updateApiKey(subOrNotToSub._2))
      _ <- notifyBlocking(subscriptions, api)
    } yield ()
  }

  //A voir : Si api bloquée, plus personne ne peux la voir, et il n'est pas possible de s'y connecter. Comment en rcupérer le nom

  private def notifyBlocking(subscriptions: Seq[ApiSubscription], api: Api)(implicit
      ec: ExecutionContext,
      env: Env,
      ctx: DaikokuActionContext[JsValue]
  ): EitherT[Future, AppError, Unit] = {
    val subscriptionsTeamsIds: Seq[TeamId] = subscriptions.map(_.team).distinct

    for {
      subscriptionTeams         <-
        EitherT.right[AppError](
          env.dataStore.teamRepo
            .forTenant(ctx.tenant.id)
            .findNotDeleted(Json.obj("_id" -> Json.obj("$in" -> JsArray(subscriptionsTeamsIds.map(_.asJson)))))
        )
      subscriptionWithMaybeTeams =
        subscriptions.map(subscription => (subscription, subscriptionTeams.find(s => s.id == subscription.team)))
      _                         <- EitherT.right[AppError](Future.sequence(subscriptionWithMaybeTeams.map {
                                     case (apiSubscription, Some(subscriptionTeam)) =>
                                       val notification = Notification(
                                         id = NotificationId(IdGenerator.token(32)),
                                         tenant = ctx.tenant.id,
                                         team = Option.apply(subscriptionTeam.id),
                                         sender = ctx.user.asNotificationSender,
                                         notificationType = NotificationType.AcceptOnly,
                                         action = NotificationAction.ApiBlockingWarning(api.id, apiSubscription.id)
                                       )
                                       env.dataStore.notificationRepo
                                         .forTenant(ctx.tenant.id)
                                         .save(notification)
                                     case (_, None)                                 => FastFuture.successful(false) //Todo: handle the case
                                   }))
    } yield ()
  }

  private def notifyDepreciation(newApi: Api)(implicit
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

  private def getSubscriptionNotDeleted(api: Api)(implicit
      ec: ExecutionContext,
      env: Env,
      ctx: DaikokuActionContext[JsValue]
  ) = {
    env.dataStore.apiSubscriptionRepo
      .forTenant(ctx.tenant)
      .findNotDeleted(Json.obj("api" -> api.id.asJson))
  }

  private def getPlansNotDeleted(plansIds: Seq[UsagePlanId])(implicit
      ec: ExecutionContext,
      env: Env,
      ctx: DaikokuActionContext[JsValue]
  ) = {
    env.dataStore.usagePlanRepo
      .forTenant(ctx.tenant)
      .findNotDeleted(Json.obj("_id" -> Json.obj("$in" -> JsArray(plansIds.map(_.asJson)))))
  }

  private def getSubsWithMaybeOtoSetting(subscriptions: Seq[ApiSubscription], plans: Seq[UsagePlan])(implicit
      ctx: DaikokuActionContext[JsValue]
  ): Seq[(ApiSubscription, Option[OtoroshiSettings])] = {
    subscriptions
      .map(subscription => (subscription, plans.find(_.id == subscription.plan)))
      .map { case (sub, maybeUsagePlan) =>
        val otoroshiSettings: Option[OtoroshiSettings] = maybeUsagePlan
          .flatMap(_.otoroshiTarget)
          .map(_.otoroshiSettings)
          .flatMap(id => ctx.tenant.otoroshiSettings.find(_.id == id))

        (sub, otoroshiSettings)
      }
  }

  private def updateApiKey(subscriptionsAndOtoSettings: Seq[(ApiSubscription, OtoroshiSettings)])(implicit
      ec: ExecutionContext
  ) = {
    Future.sequence(
      subscriptionsAndOtoSettings.map { case (sub, os) =>
        val future: Future[Either[AppError, ActualOtoroshiApiKey]] =
          otoroshiClient.getApikey(sub.apiKey.clientId)(os).flatMap {
            case Left(error)   => FastFuture.successful(Left(error))
            case Right(apikey) => otoroshiClient.updateApiKey(apikey.copy(enabled = false))(os) //FIXME: use patch
          }
        future
      }
    )
  }
}
