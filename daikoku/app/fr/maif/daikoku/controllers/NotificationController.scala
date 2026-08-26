package fr.maif.daikoku.controllers

import cats.data.EitherT
import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.actions.{
  DaikokuAction,
  DaikokuActionContext,
  DaikokuActionMaybeWithGuest,
  DaikokuUnauthenticatedAction
}
import fr.maif.daikoku.audit.AuditTrailEvent
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.controllers.AppError.*
import fr.maif.daikoku.controllers.authorizations.async.*
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.domain.NotificationAction.*
import fr.maif.daikoku.domain.NotificationType.AcceptOnly
import fr.maif.daikoku.domain.TeamPermission.{Administrator, TeamUser}
import fr.maif.daikoku.domain.json.NotificationStatusFormat
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.services.{AccountCreationService, ApiService}
import fr.maif.daikoku.utils.Translator
import org.apache.pekko.http.scaladsl.util.FastFuture
import play.api.i18n.I18nSupport
import play.api.libs.json.*
import play.api.mvc.{
  AbstractController,
  AnyContent,
  ControllerComponents,
  Result
}

import scala.concurrent.{ExecutionContext, Future}

class NotificationController(
    DaikokuAction: DaikokuAction,
    DaikokuActionMaybeWithGuest: DaikokuActionMaybeWithGuest,
    DaikokuUnauthenticatedAction: DaikokuUnauthenticatedAction,
    env: Env,
    apiService: ApiService,
    accountCreationService: AccountCreationService,
    translator: Translator,
    cc: ControllerComponents
) extends AbstractController(cc)
    with I18nSupport {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env
  implicit val tr: Translator = translator

  def myUnreadNotificationsCount() =
    DaikokuUnauthenticatedAction.async { ctx =>
      ctx.user match {
        case None => FastFuture.successful(Ok(Json.obj("count" -> 0)))
        case Some(user) =>
          for {
            myTeams <- env.dataStore.teamRepo.myTeams(ctx.tenant, user)
            youHaveUnreadNotifications <-
              env.dataStore.notificationRepo.findPendingForUser(
                ctx.tenant.id,
                user.id,
                myTeams.filter(t => t.admins().contains(user.id)).map(_.id)
              )
            toValidateNotifications = youHaveUnreadNotifications.filter(notif =>
              notif.notificationType == NotificationType.AcceptOrReject
            )
          } yield Ok(
            Json.obj(
              "count" -> youHaveUnreadNotifications.size,
              "toValidateCount" -> toValidateNotifications.size
            )
          )
      }
    }

  private def nothing(): Future[Either[AppError, Unit]] =
    FastFuture.successful(Right[AppError, Unit](()))

  def acceptNotifications() =
    DaikokuAction.async(parse.json) { ctx =>
      PublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} has read notifications by bulk (@{notifications})"
        )
      )(ctx) {
        val notificationIds = (ctx.request.body \ "notificationIds").as[JsArray]
        val notificationIdValues =
          notificationIds.value.map(_.as[String]).toArray
        val selectAll = (ctx.request.body \ "selectAll").as[Boolean]
        ctx.setCtxValue("notifications", Json.stringify(notificationIds))
        (for {
          notifications <- EitherT.liftF[Future, AppError, Seq[Notification]](
            env.dataStore.notificationRepo
              .forTenant(ctx.tenant)
              .findByIds(
                notificationIdValues.map(NotificationId.apply).toSeq
              )
          )
          _ <- EitherT.cond[Future][AppError, Unit](
            notifications.forall(_.notificationType == AcceptOnly),
            (),
            AppError.EntityConflict("Notification must be AcceptOnly")
          )
          _ <- EitherT.liftF[Future, AppError, Long](
            {
              val repo = env.dataStore.notificationRepo.forTenant(ctx.tenant)
              val accepted = Json.stringify(
                NotificationStatusFormat.writes(NotificationStatus.Accepted())
              )
              val target =
                if (selectAll)
                  "content->'status'->>'status' = 'Pending' " +
                    s"AND content->>'notificationType' = '${NotificationType.AcceptOnly.value}'"
                else "_id = ANY($3::text[])"

              repo.execute(
                s"UPDATE ${repo.tableName} " +
                  "SET content = jsonb_set(content, '{status}', $2::jsonb) " +
                  s"WHERE content->>'_tenant' = $$1 AND $target",
                Seq(ctx.tenant.id.value, accepted) ++
                  (if (selectAll) Seq.empty else Seq(notificationIdValues))
              )
            }
          )
        } yield Ok(Json.obj("done" -> true)))
          .leftMap(_.render())
          .merge
      }
    }
  def acceptNotification(notificationId: String) =
    DaikokuAction.async(parse.json) { ctx =>
      import cats.data.*
      import cats.implicits.*

      implicit val c = ctx

      PublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} has accepted a notification ($notificationId)"
        )
      )(ctx) {

        def accept(
            notification: Notification,
            team: Option[Team]
        ): Future[Result] = {
          val r: EitherT[Future, AppError, Result] = for {
            _ <- notification.action match {
              case ApiAccess(apiId, teamRequestId) =>
                EitherT(
                  acceptApiAccess(
                    ctx.tenant,
                    apiId,
                    teamRequestId,
                    notification.sender
                  )
                )
              case AccountCreationAttempt(demand, step, _) =>
                EitherT(
                  accountCreationService.acceptAccountCreationAttempt(
                    demand,
                    step
                  )
                )
              case ApiSubscriptionDemand(
                    apiId,
                    planId,
                    requestedteamId,
                    demand,
                    step,
                    apiKeyId,
                    _
                  ) =>
                EitherT(
                  acceptApiSubscription(
                    demand,
                    step,
                    requestedteamId,
                    apiId,
                    planId,
                    ctx.tenant,
                    ctx.user,
                    notification.sender
                  )
                )
              case TeamInvitation(_, user) if user != ctx.user.id =>
                EitherT.leftT[Future, Unit](ForbiddenAction)
              case TeamInvitation(team, user) =>
                EitherT(
                  acceptTeamInvitation(
                    ctx.tenant,
                    team,
                    user,
                    notification.sender
                  )
                )
              case TransferApiOwnership(teamId, apiId) =>
                EitherT(acceptTransferOwnership(ctx.tenant, teamId, apiId))
              case _ => EitherT(nothing())
            }
            acceptedNotification <- EitherT.liftF(
              env.dataStore.notificationRepo
                .forTenant(ctx.tenant.id)
                .save(notification.copy(status = NotificationStatus.Accepted()))
            )
          } yield Ok(Json.obj("done" -> acceptedNotification))

          r.leftMap(AppError.render).value.map(_.merge)
        }

        env.dataStore.notificationRepo
          .forTenant(ctx.tenant.id)
          .findById(notificationId)
          .flatMap {
            case None =>
              FastFuture.successful(AppError.render(NotificationNotFound))
            case Some(notification) =>
              notification.team match {
                case None => accept(notification, None)
                case Some(teamId) =>
                  env.dataStore.teamRepo
                    .forTenant(ctx.tenant)
                    .findById(teamId)
                    .flatMap {
                      case None =>
                        FastFuture.successful(AppError.render(TeamNotFound))
                      case Some(team) =>
                        if (
                          ctx.user.isDaikokuAdmin || team.users.exists(u =>
                            u.userId == ctx.user.id && u.teamPermission == TeamPermission.Administrator
                          )
                        ) {
                          accept(notification, Some(team))
                        } else {
                          FastFuture.successful(
                            Forbidden(
                              Json.obj("error" -> "You're not a team admin")
                            )
                          )
                        }
                    }
              }
          }
      }
    }

  def rejectNotificationOfTeam(
      teamId: TeamId,
      notification: Notification,
      maybeMessage: Option[String]
  )(implicit
      ctx: DaikokuActionContext[AnyContent],
      lang: String,
      ec: ExecutionContext
  ) =
    TeamAdminOnly(
      AuditTrailEvent(
        s"@{user.name} has rejected a notifications for team @{team.name} - @{team.id} => @{notification.id}"
      )
    )(teamId.value, ctx) { ownerTeam =>
      {

        ctx.setCtxValue("notification.id", notification.id)

        val mailBody: Future[Option[String]] = notification.action match {
          case ApiAccess(api, team) =>
            (for {
              api <-
                env.dataStore.apiRepo
                  .forTenant(ctx.tenant.id)
                  .findById(api)
              consumerTeam <-
                env.dataStore.teamRepo
                  .forTenant(ctx.tenant.id)
                  .findById(team)
              recipient <-
                notification.sender.id
                  .map(id =>
                    env.dataStore.userRepo
                      .findById(id)
                  )
                  .getOrElse(FastFuture.successful(None))
              unrecognizedApi <-
                translator
                  .translate("unrecognized.api", ctx.tenant)
            } yield translator
              .translate(
                "mail.api.access.rejection.body",
                ctx.tenant,
                Map(
                  "apiName" -> JsString(
                    api.map(_.name).getOrElse(unrecognizedApi)
                  ),
                  "user" -> JsString(notification.sender.name),
                  "recipient_data" -> recipient
                    .map(_.asJson)
                    .getOrElse(Json.obj()),
                  "tenant_data" -> ctx.tenant.asJson,
                  "api_data" -> api.map(_.asJson).getOrElse(Json.obj()),
                  "consumer_team_data" -> consumerTeam
                    .map(_.asJson)
                    .getOrElse(Json.obj()),
                  "producer_team_data" -> ownerTeam.asJson,
                  "notification_data" -> notification.asJson
                )
              )
              .map(_.some)).flatten
          case AccountCreationAttempt(demand, step, _) =>
            EitherT(
              accountCreationService.declineAccountCreationAttempt(
                demand,
                step,
                ctx.tenant,
                maybeMessage
              )
            ).map(_ => None)
              .leftMap(_ => None)
              .merge
          case notif: TeamInvitation =>
            (for {
              user <-
                env.dataStore.userRepo
                  .findById(notif.user)
              recipient <-
                notification.sender.id
                  .map(id =>
                    env.dataStore.userRepo
                      .findById(id)
                  )
                  .getOrElse(FastFuture.successful(None))
              unrecognizedUser <-
                translator.translate("unrecognized.user", ctx.tenant)

            } yield translator
              .translate(
                "mail.user.invitation.rejection.body",
                ctx.tenant,
                Map(
                  "user" -> JsString(notification.sender.name),
                  "teamName" -> JsString(notification.sender.name),
                  "user_data" -> user
                    .map(_.asJson)
                    .getOrElse(JsString(unrecognizedUser))
                    .as[JsValue],
                  "recipient_data" -> recipient
                    .map(_.asJson)
                    .getOrElse(Json.obj()),
                  "tenant_data" -> ctx.tenant.asJson,
                  "producer_team_data" -> ownerTeam.asJson,
                  "notification_data" -> notification.asJson
                )
              )
              .map(_.some)).flatten
          case notif: ApiSubscriptionDemand =>
            for {
              _ <-
                apiService
                  .declineSubscriptionDemand(
                    ctx.tenant,
                    notif.demand,
                    notif.step,
                    ctx.user.asNotificationSender,
                    maybeMessage
                  )
                  .value
              team <-
                env.dataStore.teamRepo
                  .forTenant(ctx.tenant)
                  .findById(notif.team)
              maybeApi <-
                env.dataStore.apiRepo
                  .forTenant(ctx.tenant.id)
                  .findById(notif.api)
              maybePlan <-
                env.dataStore.usagePlanRepo
                  .forTenant(ctx.tenant.id)
                  .findById(notif.plan)
              maybeDemand <-
                env.dataStore.subscriptionDemandRepo
                  .forTenant(ctx.tenant)
                  .findById(notif.demand)
              unknownUser <-
                translator.translate("unrecognized.team", ctx.tenant)
              maybeUser <-
                maybeDemand
                  .map(d => env.dataStore.userRepo.findById(d.from))
                  .getOrElse(FastFuture.successful(None))
              unrecognizedApi <-
                translator.translate("unrecognized.api", ctx.tenant)
              unrecognizedTeam <-
                translator.translate("unrecognized.team", ctx.tenant)
              body <- translator.translate(
                "mail.api.subscription.rejection.body",
                ctx.tenant,
                Map(
                  "user" -> JsString(
                    maybeUser.map(_.name).getOrElse(unknownUser)
                  ),
                  "team" -> JsString(
                    team.map(_.name).getOrElse(unrecognizedTeam)
                  ),
                  "apiName" -> JsString(
                    maybeApi.map(_.name).getOrElse(unrecognizedApi)
                  ),
                  "message" -> JsString(maybeMessage.getOrElse("")),
                  "api_data" -> maybeApi
                    .map(_.asJson)
                    .getOrElse(JsString(unrecognizedApi))
                    .as[JsValue],
                  "usagePlan_data" -> maybePlan
                    .map(_.asJson)
                    .getOrElse(Json.obj()),
                  "producer_team_data" -> ownerTeam.asJson,
                  "consumer_team_data" -> team
                    .map(_.asJson)
                    .getOrElse(JsString(unrecognizedTeam))
                    .as[JsValue],
                  "user_data" -> maybeUser
                    .map(_.asSimpleJson)
                    .getOrElse(Json.obj())
                )
              )
            } yield body.some
          case TransferApiOwnership(team, api) =>
            val result = for {
              api <-
                env.dataStore.apiRepo
                  .forTenant(ctx.tenant)
                  .findById(api)
              team <-
                env.dataStore.teamRepo
                  .forTenant(ctx.tenant)
                  .findById(team)
              unrecognizedApi <-
                translator.translate("unrecognized.api", ctx.tenant)
              unrecognizedTeam <-
                translator.translate("unrecognized.team", ctx.tenant)
            } yield {
              translator.translate(
                "mail.api.transfer.ownership.rejection.body",
                ctx.tenant,
                Map(
                  "apiName" -> JsString(
                    api.map(_.name).getOrElse(unrecognizedApi)
                  ),
                  "teamName" -> JsString(
                    team.map(_.name).getOrElse(unrecognizedTeam)
                  ),
                  "producer_team_data" -> ownerTeam.asJson,
                  "requested_team_data" -> team
                    .map(_.asJson)
                    .getOrElse(Json.obj()),
                  "api_data" -> api.map(_.asJson).getOrElse(Json.obj())
                )
              )
            }

            result.flatten.map(_.some)
          case _ => FastFuture.successful(None)
        }

        (for {
          mailBody <- EitherT.fromOptionF[Future, Unit, String](mailBody, ())
          _ <- EitherT.liftF[Future, Unit, Boolean](
            env.dataStore.notificationRepo
              .forTenant(ctx.tenant.id)
              .save(notification.copy(status = NotificationStatus.Rejected()))
          )
          title <- EitherT.liftF[Future, Unit, String](
            translator.translate("mail.rejection.title", ctx.tenant)
          )
          _ <- EitherT.liftF[Future, Unit, Unit](
            ctx.tenant.mailer.send(
              title,
              Seq(notification.sender.email),
              mailBody,
              ctx.tenant
            )
          )
        } yield Ok(Json.obj("done" -> true)))
          .leftMap(_ => Ok(Json.obj("done" -> true)))
          .merge

      }
    }

  def rejectNotificationOfMe(
      notification: Notification
  )(implicit ctx: DaikokuActionContext[AnyContent], lang: String) =
    PublicUserAccess(
      AuditTrailEvent(
        s"@{user.name} has rejected a notifications for user @{user.name} - @{user.id} => @{notification.id}"
      )
    )(ctx) {
      import cats.data.*
      import cats.implicits.*

      ctx.setCtxValue("notification.id", notification.id)
      ctx.setCtxValue("user.id", notification.sender.id)
      ctx.setCtxValue("user.name", notification.sender.name)

      val value: EitherT[Future, AppError, String] = notification.action match {
        case TeamInvitation(team, user) if user == ctx.user.id =>
          EitherT.liftF(
            env.dataStore.teamRepo
              .forTenant(ctx.tenant.id)
              .findById(team)
              .flatMap {
                case None =>
                  (for {
                    unrecognizedUser <-
                      translator
                        .translate("unrecognized.user", ctx.tenant)
                    unrecognizedTeam <-
                      translator
                        .translate("unrecognized.team", ctx.tenant)
                  } yield {
                    translator.translate(
                      "mail.user.invitation.rejection.body",
                      ctx.tenant,
                      Map(
                        "teamName" -> JsString(unrecognizedTeam),
                        "user" -> JsString(unrecognizedUser)
                      )
                    )
                  }).flatten

                case Some(team) =>
                  env.dataStore.userRepo
                    .findById(user)
                    .flatMap {
                      case None =>
                        translator
                          .translate("unrecognized.user", ctx.tenant)
                          .flatMap { unrecognizedUser =>
                            translator.translate(
                              "mail.user.invitation.rejection.body",
                              ctx.tenant,
                              Map(
                                "teamName" -> JsString(team.name),
                                "user" -> JsString(unrecognizedUser)
                              )
                            )
                          }
                      case Some(user) =>
                        translator.translate(
                          "mail.user.invitation.rejection.body",
                          ctx.tenant,
                          Map(
                            "user" -> JsString(user.name),
                            "teamName" -> JsString(team.name)
                          )
                        )
                    }
              }
          )
        case _ => EitherT.leftT[Future, String](ForbiddenAction)
      }

      value
        .map(mailBody =>
          for {
            _ <-
              env.dataStore.notificationRepo
                .forTenant(ctx.tenant.id)
                .save(notification.copy(status = NotificationStatus.Rejected()))
            title <- translator.translate("mail.rejection.title", ctx.tenant)
            _ <- ctx.tenant.mailer.send(
              title,
              Seq(notification.sender.email),
              mailBody,
              ctx.tenant
            )
          } yield Ok(Json.obj("done" -> true))
        )
        .leftMap(t => FastFuture.successful(AppError.render(t)))
        .value
        .map(_.merge)
        .flatten
    }

  def rejectNotification(notificationId: String) =
    DaikokuAction.async(parse.anyContent) { ctx =>
      val maybeMessage = ctx.request.body.asJson
        .flatMap(jsonBody => (jsonBody \ "message").asOpt[String])

      implicit val context: DaikokuActionContext[AnyContent] = ctx

      val value: EitherT[Future, AppError, Future[Result]] = for {
        notification <- EitherT.fromOptionF(
          env.dataStore.notificationRepo
            .forTenant(ctx.tenant.id)
            .findById(notificationId),
          AppError.NotificationNotFound
        )
        sender <- EitherT.fromOptionF[Future, AppError, User](
          env.dataStore.userRepo.findById(notification.sender.id.get),
          AppError.UserNotFound()
        )
      } yield {
        implicit val lang: String = sender.defaultLanguage
          .orElse(ctx.tenant.defaultLanguage)
          .getOrElse("en")

        notification.team match {
          case None => rejectNotificationOfMe(notification)
          case Some(team) =>
            rejectNotificationOfTeam(team, notification, maybeMessage)
        }
      }

      value.leftMap(_.renderF()).merge.flatten
    }

  def acceptApiAccess(
      tenant: Tenant,
      apiId: ApiId,
      teamRequestId: TeamId,
      sender: NotificationSender
  ): Future[Either[AppError, Unit]] = {
    import cats.data.*
    import cats.implicits.*

    val result: EitherT[Future, AppError, Unit] = for {
      api <- EitherT.fromOptionF(
        env.dataStore.apiRepo
          .forTenant(tenant.id)
          .findById(apiId.value),
        ApiNotFound
      )
      ownerTeam <- EitherT.fromOptionF(
        env.dataStore.teamRepo
          .forTenant(tenant.id)
          .findById(api.team),
        TeamNotFound
      )
      team <- EitherT.fromOptionF(
        env.dataStore.teamRepo
          .forTenant(tenant.id)
          .findById(teamRequestId.value),
        TeamNotFound
      )
      administrators <- EitherT.liftF(
        env.dataStore.userRepo.findByIds(team.admins().toSeq)
      )
      _ <- EitherT.liftF(
        env.dataStore.apiRepo
          .forTenant(tenant.id)
          .save(
            api
              .copy(authorizedTeams = api.authorizedTeams ++ Set(teamRequestId))
          )
      )
      _ <- EitherT.liftF(Future.sequence(administrators.map(admin => {
        implicit val lang: String = admin.defaultLanguage
          .getOrElse(tenant.defaultLanguage.getOrElse("en"))
        (for {
          title <- translator.translate("mail.acceptation.title", tenant)
          body <- translator.translate(
            "mail.api.access.acceptation.body",
            tenant,
            Map(
              "apiName" -> JsString(api.name),
              "user" -> JsString(sender.name),
              "producer_team_data" -> ownerTeam.asJson,
              "consumer_team_data" -> team.asJson,
              "api_data" -> api.asJson
            )
          )
        } yield {
          tenant.mailer.send(title, Seq(admin.email), body, tenant)
        }).flatten
      })))
    } yield ()

    result.value
  }

  def acceptTeamInvitation(
      tenant: Tenant,
      team: TeamId,
      invitedUserId: UserId,
      sender: NotificationSender
  ): Future[Either[AppError, Unit]] = {
    import cats.data.*
    import cats.implicits.*

    implicit val lang: String =
      tenant.defaultLanguage.getOrElse(
        "en"
      ) // todo: get user defaultlanguage if possible
    val r: EitherT[Future, AppError, Unit] = for {
      invitedUser <- EitherT.fromOptionF(
        env.dataStore.userRepo.findById(invitedUserId),
        UserNotFound()
      )
      team <- EitherT.fromOptionF(
        env.dataStore.teamRepo.forTenant(tenant).findById(team),
        TeamNotFound
      )
      _ <- EitherT.liftF(
        env.dataStore.teamRepo
          .forTenant(tenant.id)
          .save(
            team.copy(users =
              team.users ++ Set(UserWithPermission(invitedUser.id, TeamUser))
            )
          )
      )
      title <- EitherT.liftF(
        translator.translate("mail.acceptation.title", tenant)
      )
      body <- EitherT.liftF(
        translator.translate(
          "mail.user.invitation.acceptation.body",
          tenant,
          Map(
            "user" -> JsString(invitedUser.name),
            "teamName" -> JsString(team.name),
            "user_data" -> invitedUser.asSimpleJson,
            "team_data" -> team.asJson
          )
        )
      )
      _ <- EitherT.liftF(
        tenant.mailer.send(title, Seq(sender.email), body, tenant)
      )
    } yield ()

    r.value
  }

  def acceptApiSubscription(
      subscriptionDemandId: DemandId,
      subscriptionDemandStepId: SubscriptionDemandStepId,
      teamRequestId: TeamId,
      apiId: ApiId,
      plan: UsagePlanId,
      tenant: Tenant,
      user: User,
      sender: NotificationSender
  )(implicit
      ctx: DaikokuActionContext[JsValue]
  ): Future[Either[AppError, Unit]] = {
    import cats.data.*
    import cats.implicits.*
    import fr.maif.daikoku.utils.RequestImplicits.*

    implicit val language: String = ctx.request.getLanguage(ctx.tenant)
    implicit val currentUser: User = user

    val r: EitherT[Future, AppError, Unit] = for {
      api <- EitherT.fromOptionF(
        env.dataStore.apiRepo
          .forTenant(tenant.id)
          .findById(apiId.value),
        ApiNotFound
      )
      team <- EitherT.fromOptionF(
        env.dataStore.teamRepo
          .forTenant(tenant.id)
          .findById(teamRequestId.value),
        TeamNotFound
      )

      demand <- EitherT.fromOptionF(
        env.dataStore.subscriptionDemandRepo
          .forTenant(ctx.tenant)
          .findById(subscriptionDemandId),
        AppError.EntityNotFound("Subscription demand")
      )
      upgradedDemand: SubscriptionDemand = demand.copy(
        customReadOnly =
          ctx.request.body.getBodyField[Boolean]("customReadOnly"),
        customMaxPerSecond =
          ctx.request.body.getBodyField[Long]("customMaxPerSecond"),
        customMaxPerDay =
          ctx.request.body.getBodyField[Long]("customMaxPerDay"),
        customMaxPerMonth =
          ctx.request.body.getBodyField[Long]("customMaxPerMonth"),
        customMetadata =
          ctx.request.body.getBodyField[JsObject]("customMetadata"),
        adminCustomName =
          ctx.request.body.getBodyField[String]("adminCustomName"),
        steps = demand.steps.map(s =>
          if (s.id == subscriptionDemandStepId)
            s.copy(state = SubscriptionDemandState.Accepted)
          else s
        )
      )
      _ <- EitherT.liftF(
        env.dataStore.subscriptionDemandRepo
          .forTenant(ctx.tenant)
          .save(
            upgradedDemand
          )
      )

      _ <- apiService.runSubscriptionProcess(demand.id, ctx.tenant)
    } yield ()

    r.value
  }

  def acceptTransferOwnership(
      tenant: Tenant,
      teamId: TeamId,
      apiId: ApiId
  ): Future[Either[AppError, Unit]] = {
    import cats.data.*
    import cats.implicits.*

    val r: EitherT[Future, AppError, Unit] = for {
      newTeam <- EitherT.fromOptionF(
        env.dataStore.teamRepo.forTenant(tenant).findById(teamId),
        AppError.TeamNotFound
      )
      versions <- EitherT.liftF(
        env.dataStore.apiRepo.findAllVersions(tenant, apiId.value)
      )
      _ <- EitherT.liftF(
        env.dataStore.apiRepo
          .forTenant(tenant)
          .updateManyByQuery(
            Json.obj(
              "_id" -> Json.obj("$in" -> JsArray(versions.map(_.id.asJson)))
            ),
            Json.obj("$set" -> Json.obj("team" -> newTeam.id.asJson))
          )
      )
      demands <- EitherT.liftF(
        env.dataStore.subscriptionDemandRepo
          .findByStates(
            tenant.id,
            Seq(
              SubscriptionDemandState.InProgress,
              SubscriptionDemandState.Waiting
            ),
            apis = versions.map(_.id).some
          )
      )
      _ <- EitherT.liftF(
        Future.sequence(
          demands
            .map(sd =>
              sd.copy(steps =
                sd.steps.map(s =>
                  s.copy(step = s.step match {
                    case ValidationStep
                          .TeamAdmin(id, _, title) =>
                      ValidationStep
                        .TeamAdmin(id, newTeam.id, title)
                    case _ => s.step
                  })
                )
              )
            )
            .map(t =>
              env.dataStore.subscriptionDemandRepo
                .forTenant(tenant)
                .save(t)
            )
        )
      )

      _ <- EitherT.liftF(
        {
          val repo = env.dataStore.notificationRepo.forTenant(tenant)
          repo.execute(
            s"UPDATE ${repo.tableName} " +
              "SET content = jsonb_set(content, '{team}', to_jsonb($2::text)) " +
              "WHERE content->>'_tenant' = $1 " +
              "AND content->>'_deleted' = 'false' " +
              "AND content->'action'->>'type' = 'ApiSubscription' " +
              "AND content->'status'->>'status' = 'Pending' " +
              "AND content->'action'->>'api' = ANY($3::text[])",
            Seq(
              tenant.id.value,
              teamId.value,
              versions.map(_.id.value).toArray
            )
          )
        }
      )
    } yield ()

    r.value
  }
}
