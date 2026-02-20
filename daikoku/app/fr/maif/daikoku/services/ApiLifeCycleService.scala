package fr.maif.daikoku.services

import fr.maif.daikoku.logger.AppLogger
import cats.data.EitherT
import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.domain.{
  Api,
  ApiState,
  ApiSubscription,
  ApiSubscriptionState,
  Notification,
  NotificationAction,
  NotificationId,
  NotificationType,
  OtoroshiSettings,
  Team,
  TeamId,
  Tenant,
  TenantId,
  UsagePlan,
  UsagePlanId,
  User
}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.utils.{IdGenerator, OtoroshiClient, Translator}
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.Materializer
import play.api.i18n.MessagesApi
import play.api.libs.json.{JsArray, JsString, JsValue, Json}

import scala.concurrent.{ExecutionContext, Future}

class ApiLifeCycleService(
    mailService: MailService,
    otoroshiClient: OtoroshiClient
) {

  def handleApiLifeCycle(oldApi: Api, newApi: Api, tenant: Tenant, user: User)(
      implicit
      translator: Translator,
      ec: ExecutionContext,
      env: Env,
      ma: MessagesApi
  ): EitherT[Future, AppError, Unit] = {
    (oldApi.state, newApi.state) match {
      case (ApiState.Published, ApiState.Deprecated) =>
        notifyDepreciation(newApi, tenant, user)
      case (ApiState.Published, ApiState.Blocked) =>
        handleApiBlocking(newApi, tenant, user)
      case (ApiState.Deprecated, ApiState.Blocked) =>
        handleApiBlocking(newApi, tenant, user)
      case (ApiState.Blocked, ApiState.Deprecated) =>
        handleApiDeblocking(newApi, tenant)
      case (ApiState.Blocked, ApiState.Published) =>
        handleApiDeblocking(newApi, tenant)
      case _ => EitherT.pure[Future, AppError](())
    }
  }

  private def handleApiDeblocking(api: Api, tenant: Tenant)(implicit
      ec: ExecutionContext,
      env: Env
  ): EitherT[Future, AppError, Unit] = {

    for {
      _ <- EitherT.liftF(
        env.dataStore.apiSubscriptionRepo
          .forTenant(api.tenant)
          .updateManyByQuery(
            Json.obj(
              "api" -> api.id.asJson
            ),
            Json.obj(
              "$set" -> Json
                .obj(
                  "state" -> ApiSubscriptionState.Active.name,
                  "enabled" -> api.state.name
                )
            )
          )
      )

      subscriptions <- EitherT.liftF(getSubscriptionNotDeleted(api = api))
      plansIds = subscriptions.map(_.plan).distinct
      plans <- EitherT.liftF(
        getPlansNotDeleted(plansIds = plansIds, api.tenant)
      )

      subsWithMaybeOtoSetting: Seq[
        (ApiSubscription, Option[OtoroshiSettings])
      ] =
        getSubsWithMaybeOtoSetting(
          subscriptions = subscriptions,
          plans = plans,
          tenant
        )

      subOrNotToSub: (
          Seq[ApiSubscription],
          Seq[(ApiSubscription, OtoroshiSettings)]
      ) =
        subsWithMaybeOtoSetting.partitionMap {
          case (sub, Some(otoS)) => Right((sub, otoS))
          case (sub, None)       => Left(sub)
        }

      _ <- EitherT.right[AppError](
        Future.sequence(
          subOrNotToSub._1.map(x =>
            FastFuture.successful(
              AppLogger.warn(
                s"Impossible de débloquer la clé Otoroshi de la souscription ${x.id}"
              )
            )
          )
        )
      )

      // todo: fix it ==> enable all ototoshi apikey
      // _ <- EitherT.liftF(updateApiKey(subOrNotToSub._2))

    } yield ()
  }

  private def manageApiDefaultVersion(
      api: Api
  )(implicit
      env: Env,
      ec: ExecutionContext
  ): EitherT[Future, AppError, Unit] = {

    EitherT
      .right[AppError](
        env.dataStore.apiRepo
          .forTenant(api.tenant)
          .findOneNotDeleted(
            Json.obj(
              "_humanReadableId" -> api.humanReadableId,
              "currentVersion" -> Json.obj("$ne" -> api.currentVersion.asJson)
            )
          )
      )
      .flatMap {
        case None => EitherT.pure[Future, AppError](())
        case Some(anotherVersion) =>
          for {
            _ <- EitherT.right[AppError](
              env.dataStore.apiRepo
                .forTenant(api.tenant)
                .save(api.copy(isDefault = false))
            )
            _ <- EitherT.right[AppError](
              env.dataStore.apiRepo
                .forTenant(api.tenant)
                .save(anotherVersion.copy(isDefault = true))
            )
          } yield ()
      }
  }

  private def handleApiBlocking(api: Api, tenant: Tenant, user: User)(implicit
      translator: Translator,
      ec: ExecutionContext,
      env: Env,
      ma: MessagesApi
  ): EitherT[Future, AppError, Unit] = {
    implicit val mat = env.defaultMaterializer

    for {
      _ <- manageApiDefaultVersion(api)
      _ <- EitherT.liftF(
        env.dataStore.apiSubscriptionRepo
          .forTenant(api.tenant)
          .updateManyByQuery(
            Json.obj(
              "api" -> api.id.asJson
            ),
            Json.obj(
              "$set" -> Json
                .obj(
                  "state" -> ApiSubscriptionState.Blocked.name
                )
            )
          )
      )

      // todo: c'est ici qu'on devra gerer de sortir les subscritpion des trousseau

      subscriptions <- EitherT.liftF(getSubscriptionNotDeleted(api = api))
      plansIds = subscriptions.map(_.plan).distinct
      plans <- EitherT.liftF(
        getPlansNotDeleted(plansIds = plansIds, api.tenant)
      )

      subsWithMaybeOtoSetting: Seq[
        (ApiSubscription, Option[OtoroshiSettings])
      ] =
        getSubsWithMaybeOtoSetting(
          subscriptions = subscriptions,
          plans = plans,
          tenant = tenant
        )

      subOrNotToSub: (
          Seq[ApiSubscription],
          Seq[(ApiSubscription, OtoroshiSettings)]
      ) =
        subsWithMaybeOtoSetting.partitionMap {
          case (sub, Some(otoS)) => Right((sub, otoS))
          case (sub, None)       => Left(sub)
        }

      _ <-
        EitherT.right[AppError](
          Future.sequence(
            subOrNotToSub._1.map(x =>
              FastFuture.successful(
                AppLogger.warn(
                  s"Impossible de bloquer la clé Otoroshi de la souscription ${x.id}"
                )
              )
            )
          )
        )
      _ <- EitherT.liftF(disableOtoroshiApiKey(subOrNotToSub._2))
      _ <- notifyBlocking(subscriptions, api, tenant, user)
    } yield ()
  }

  // A voir : Si api bloquée, plus personne ne peux la voir, et il n'est pas possible de s'y connecter. Comment en rcupérer le nom

  private def notifyBlocking(
      subscriptions: Seq[ApiSubscription],
      api: Api,
      tenant: Tenant,
      user: User
  )(implicit
      translator: Translator,
      ec: ExecutionContext,
      env: Env,
      ma: MessagesApi
  ): EitherT[Future, AppError, Unit] = {
    val subscriptionsTeamsIds: Seq[TeamId] = subscriptions.map(_.team).distinct

    for {
      subscriptionTeams <-
        EitherT.right[AppError](
          env.dataStore.teamRepo
            .forTenant(api.tenant)
            .findNotDeleted(
              Json.obj(
                "_id" -> Json
                  .obj("$in" -> JsArray(subscriptionsTeamsIds.map(_.asJson)))
              )
            )
        )
      subscriptionWithMaybeTeams =
        subscriptions.map(subscription =>
          (subscription, subscriptionTeams.find(s => s.id == subscription.team))
        )
      _ <- EitherT.right[AppError](
        Future.sequence(subscriptionWithMaybeTeams.map {
          case (apiSubscription, Some(subscriptionTeam)) =>
            val notification = Notification(
              id = NotificationId(IdGenerator.token(32)),
              tenant = api.tenant,
              team = subscriptionTeam.id.some,
              sender = user.asNotificationSender,
              notificationType = NotificationType.AcceptOnly,
              action = NotificationAction.ApiBlockingWarning(
                api.id,
                apiSubscription.id
              )
            )
            env.dataStore.notificationRepo
              .forTenant(api.tenant)
              .save(notification)
          case (_, None) =>
            FastFuture.successful(false) // Todo: handle the case
        })
      )
      _ <- EitherT.right[AppError](
        mailService.sendMailToTeamsAdmins(
          teams = subscriptionTeams,
          tenant = tenant,
          args = (team, admin) =>
            Map(
              "recipientName" -> JsString(admin.name),
              "teamName" -> JsString(team.name),
              "apiName" -> JsString(api.name),
              "recipient_data" -> admin.asSimpleJson,
              "team_data" -> team.asSimpleJson,
              "api_data" -> api.asJson,
              "tenant_data" -> tenant.toUiPayload(env)
            ),
          mailKey = "mail.api.blocking.warning"
        )
      )
    } yield ()
  }

  private def notifyDepreciation(api: Api, tenant: Tenant, user: User)(implicit
      translator: Translator,
      ec: ExecutionContext,
      env: Env,
      ma: MessagesApi
  ): EitherT[Future, AppError, Unit] = {

    AppLogger.info("notifyDepreciation")

    for {
      subscriptions <- EitherT.liftF[Future, AppError, Seq[ApiSubscription]](
        env.dataStore.apiSubscriptionRepo
          .forTenant(api.tenant)
          .findNotDeleted(
            Json.obj("api" -> api.id.value)
          )
      )

      subscriptionsTeamsIds: Seq[TeamId] = subscriptions.map(_.team).distinct
      subscriptionTeams <-
        EitherT.liftF[Future, AppError, Seq[Team]](
          env.dataStore.teamRepo
            .forTenant(api.tenant)
            .findNotDeleted(
              Json.obj(
                "_id" -> Json
                  .obj("$in" -> JsArray(subscriptionsTeamsIds.map(_.asJson)))
              )
            )
        )
      _ <- EitherT.liftF[Future, AppError, Seq[Boolean]](
        Future.sequence(subscriptionTeams.map(subscriptionTeam => {
          val notification = Notification(
            id = NotificationId(IdGenerator.token(32)),
            tenant = api.tenant,
            team = Option.apply(subscriptionTeam.id),
            sender = user.asNotificationSender,
            notificationType = NotificationType.AcceptOnly,
            action = NotificationAction.ApiDepreciationWarning(api.id)
          )
          env.dataStore.notificationRepo
            .forTenant(api.tenant)
            .save(notification)
        }))
      )
      _ <- EitherT.liftF[Future, AppError, Unit](
        mailService.sendMailToTeamsAdmins(
          teams = subscriptionTeams,
          tenant = tenant,
          args = (team, admin) =>
            Map(
              "recipientName" -> JsString(admin.name),
              "teamName" -> JsString(team.name),
              "apiName" -> JsString(api.name),
              "recipient_data" -> admin.asSimpleJson,
              "team_data" -> team.asSimpleJson,
              "api_data" -> api.asJson,
              "tenant_data" -> tenant.toUiPayload(env)
            ),
          mailKey = "mail.api.depreciation.warning"
        )
      )
    } yield ()
  }

  private def getSubscriptionNotDeleted(api: Api)(implicit
      ec: ExecutionContext,
      env: Env
  ) = {
    env.dataStore.apiSubscriptionRepo
      .forTenant(api.tenant)
      .findNotDeleted(Json.obj("api" -> api.id.asJson))
  }

  private def getPlansNotDeleted(
      plansIds: Seq[UsagePlanId],
      tenantId: TenantId
  )(implicit
      ec: ExecutionContext,
      env: Env
  ) = {
    env.dataStore.usagePlanRepo
      .forTenant(tenantId)
      .findNotDeleted(
        Json.obj("_id" -> Json.obj("$in" -> JsArray(plansIds.map(_.asJson))))
      )
  }

  private def getSubsWithMaybeOtoSetting(
      subscriptions: Seq[ApiSubscription],
      plans: Seq[UsagePlan],
      tenant: Tenant
  ): Seq[(ApiSubscription, Option[OtoroshiSettings])] = {
    subscriptions
      .map(subscription =>
        (subscription, plans.find(_.id == subscription.plan))
      )
      .map { case (sub, maybeUsagePlan) =>
        val otoroshiSettings: Option[OtoroshiSettings] = maybeUsagePlan
          .flatMap(_.otoroshiTarget)
          .map(_.otoroshiSettings)
          .flatMap(id => tenant.otoroshiSettings.find(_.id == id))

        (sub, otoroshiSettings)
      }
  }

  private def disableOtoroshiApiKey(
      subscriptionsAndOtoSettings: Seq[(ApiSubscription, OtoroshiSettings)]
  )(implicit ec: ExecutionContext, mat: Materializer) = {
    Future.sequence(
      subscriptionsAndOtoSettings
        .groupBy(x => x._2)
        .map(x => (x._1, x._2.map(_._1)))
        .map { case (os, subs) =>
          otoroshiClient.patchApiKeyBulk(
            subs.map(_.apiKey.clientId),
            Json.arr(
              Json.obj(
                "op" -> "replace",
                "path" -> "/enabled",
                "value" -> false
              )
            )
          )(os, mat)
        }
    )

  }
}
