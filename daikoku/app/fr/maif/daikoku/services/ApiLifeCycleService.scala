package fr.maif.daikoku.services

import cats.data.EitherT
import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.domain.ApiSubscriptionState.{Active, Blocked}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.jobs.OtoroshiSynchronizerJob
import fr.maif.daikoku.utils.{IdGenerator, Translator}
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.Materializer
import play.api.i18n.MessagesApi
import play.api.libs.json.{JsArray, JsString, Json}

import scala.concurrent.{ExecutionContext, Future}

class ApiLifeCycleService(
    mailService: MailService,
    synchronizerJob: OtoroshiSynchronizerJob
) {

  private def patchSubscriptions(
      api: Api,
      tenant: Tenant,
      state: ApiSubscriptionState
  )(implicit ec: ExecutionContext, env: Env): Future[Seq[ApiSubscription]] = {
    env.dataStore.apiSubscriptionRepo
      .forTenant(tenant)
      .queryTyped(
        s"""UPDATE api_subscriptions
       SET content = jsonb_set(content, '{state}', '"${state.name}"')
       WHERE content ->> 'api' = $$1 and content ->> '_tenant' = $$2 and _deleted IS FALSE
       RETURNING content;""",
        Seq(
          api.id.value,
          tenant.id.value
        )
      )
  }

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
    implicit val mat: Materializer = env.defaultMaterializer

    for {
      _ <- manageApiDefaultVersion(api)
      subscriptions <- EitherT.right[AppError](
        patchSubscriptions(api = api, tenant = tenant, state = Blocked)
      )
      _ <- EitherT.right[AppError](synchronizerJob.run(api.id, tenant))
      _ <- notifyBlocking(subscriptions, api, tenant, user)
    } yield ()
  }

  private def handleApiDeblocking(api: Api, tenant: Tenant)(implicit
      ec: ExecutionContext,
      env: Env
  ): EitherT[Future, AppError, Unit] = {

    for {
      _ <- EitherT.right[AppError](
        patchSubscriptions(api = api, tenant = tenant, state = Active)
      )
      _ <- EitherT.right[AppError](synchronizerJob.run(api.id, tenant))
    } yield ()
  }
  
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
}
