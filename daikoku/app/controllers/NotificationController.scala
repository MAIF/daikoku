package fr.maif.otoroshi.daikoku.ctrls

import cats.data.EitherT
import controllers.AppError
import controllers.AppError._
import fr.maif.otoroshi.daikoku.actions.{
  DaikokuAction,
  DaikokuActionContext,
  DaikokuActionMaybeWithGuest
}
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async._
import fr.maif.otoroshi.daikoku.domain.NotificationAction._
import fr.maif.otoroshi.daikoku.domain.NotificationType.AcceptOnly
import fr.maif.otoroshi.daikoku.domain.TeamPermission.{Administrator, TeamUser}
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json.NotificationStatusFormat
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.utils.{ApiService, Translator}
import org.apache.pekko.http.scaladsl.util.FastFuture
import play.api.i18n.I18nSupport
import play.api.libs.json._
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
    env: Env,
    apiService: ApiService,
    translator: Translator,
    cc: ControllerComponents
) extends AbstractController(cc)
    with I18nSupport {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env
  implicit val tr: Translator = translator

  def unreadNotificationsCountOfTeam(teamId: String) =
    DaikokuAction.async { ctx =>
      TeamAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has accessed number of unread notifications for team @{team.name} - @{team.id} => @{notifications}"
        )
      )(teamId, ctx) { team =>
        for {
          notificationRepo <-
            env.dataStore.notificationRepo
              .forTenantF(ctx.tenant.id)
          youHaveUnreadNotifications <- notificationRepo.findNotDeleted(
            Json.obj(
              "status.status" -> "Pending",
              "team" -> team.id.value
            )
          )
        } yield {
          ctx.setCtxValue("notifications", youHaveUnreadNotifications.size)
          Ok(Json.obj("count" -> youHaveUnreadNotifications.size))
        }
      }
    }

  def myUnreadNotificationsCount() =
    DaikokuActionMaybeWithGuest.async { ctx =>
      UberPublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} has accessed to his count of unread notifications"
        )
      )(ctx) {
        for {
          myTeams <- env.dataStore.teamRepo.myTeams(ctx.tenant, ctx.user)
          notificationRepo <-
            env.dataStore.notificationRepo
              .forTenantF(ctx.tenant.id)
          youHaveUnreadNotifications <- notificationRepo.findNotDeleted(
            Json.obj(
              "status.status" -> "Pending",
              "$or" -> Json.arr(
                Json.obj(
                  "team" -> Json.obj(
                    "$in" -> JsArray(
                      myTeams
                        .filter(t => t.admins().contains(ctx.user.id))
                        .map(_.id.asJson)
                    )
                  )
                ),
                Json.obj("action.user" -> ctx.user.id.asJson)
              )
            )
          )
        } yield {
          ctx.setCtxValue("notifications", youHaveUnreadNotifications.size)
          Ok(Json.obj("count" -> youHaveUnreadNotifications.size))
        }
      }
    }

  def myNotifications(page: Int, pageSize: Int) =
    DaikokuAction.async { ctx =>
      PublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} has accessed to his count of unread notifications"
        )
      )(ctx) {
        for {
          myTeams <- env.dataStore.teamRepo.myTeams(ctx.tenant, ctx.user)
          notificationRepo <-
            env.dataStore.notificationRepo
              .forTenantF(ctx.tenant.id)
          notifications <- {
            notificationRepo.findWithPagination(
              Json.obj(
                "_deleted" -> false,
                "$or" -> Json.arr(
                  Json.obj(
                    "team" -> Json.obj(
                      "$in" -> JsArray(
                        myTeams
                          .filter(t => t.admins().contains(ctx.user.id))
                          .map(_.id.asJson)
                      )
                    )
                  ),
                  Json.obj("action.user" -> ctx.user.id.asJson)
                )
              ),
              page,
              pageSize
            )
          }
        } yield {
          Ok(
            Json.obj(
              "notifications" -> notifications._1.map(_.asJson),
              "count" -> notifications._2,
              "page" -> page,
              "pageSize" -> pageSize
            )
          )
        }
      }
    }

  def myUntreatedNotifications(page: Int, pageSize: Int) =
    DaikokuAction.async { ctx =>
      PublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} has accessed to his untreated notifications"
        )
      )(ctx) {
        //todo: filter myTeams where i'm admin
        for {
          myTeams <- env.dataStore.teamRepo.myTeams(ctx.tenant, ctx.user)
          notificationRepo <-
            env.dataStore.notificationRepo
              .forTenantF(ctx.tenant.id)
          notifications <- notificationRepo.findWithPagination(
            Json.obj(
              "$or" -> Json.arr(
                Json.obj(
                  "team" -> Json.obj(
                    "$in" -> JsArray(
                      myTeams
                        .filter(t => t.admins().contains(ctx.user.id))
                        .map(_.id.asJson)
                    )
                  )
                ),
                Json.obj("action.user" -> ctx.user.id.asJson)
              ),
              "status.status" -> NotificationStatus.Pending.toString
            ),
            page,
            pageSize
          )
        } yield {
          Ok(
            Json.obj(
              "notifications" -> notifications._1.map(_.asJson),
              "count" -> notifications._2,
              "page" -> page,
              "pageSize" -> pageSize
            )
          )
        }
      }
    }

  def notificationOfTeam(teamId: String, page: Int, pageSize: Int) =
    DaikokuAction.async { ctx =>
      TeamAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has accessed notifications for team @{team.name} - @{team.id}"
        )
      )(teamId, ctx) { team =>
        for {
          notificationRepo <-
            env.dataStore.notificationRepo
              .forTenantF(ctx.tenant.id)
          notifications <- notificationRepo.findWithPagination(
            Json.obj(
              "_deleted" -> false,
              "team" -> team.id.value
            ),
            page,
            pageSize
          )
        } yield {
          Ok(
            Json.obj(
              "notifications" -> notifications._1.map(_.asJson),
              "count" -> notifications._2,
              "page" -> page,
              "pageSize" -> pageSize
            )
          )
        }
      }
    }

  def untreatedNotificationOfTeam(teamId: String, page: Int, pageSize: Int) =
    DaikokuAction.async { ctx =>
      TeamAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has accessed untreated notifications for team @{team.name} - @{team.id}"
        )
      )(teamId, ctx) { team =>
        for {
          notificationRepo <-
            env.dataStore.notificationRepo
              .forTenantF(ctx.tenant.id)
          notifications <- notificationRepo.findWithPagination(
            Json.obj(
              "team" -> team.id.value,
              "status.status" -> NotificationStatus.Pending.toString
            ),
            page,
            pageSize
          )
        } yield {
          Ok(
            Json.obj(
              "notifications" -> notifications._1.map(_.asJson),
              "count" -> notifications._2,
              "page" -> page,
              "pageSize" -> pageSize
            )
          )
        }
      }
    }

  private def nothing(): Future[Either[AppError, Unit]] =
    FastFuture.successful(Right[AppError, Unit](()))

  private def nothingNone[A](): Future[Either[AppError, Option[A]]] =
    FastFuture.successful(Right[AppError, Option[A]](None))

  def acceptNotifications() =
    DaikokuAction.async(parse.json) { ctx =>
      PublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} has read notifications by bulk (@{notifications})"
        )
      )(ctx) {
        val notificationIds = (ctx.request.body \ "notificationIds").as[JsArray]
        val selectAll = (ctx.request.body \ "selectAll").as[Boolean]
        ctx.setCtxValue("notifications", Json.stringify(notificationIds))
        (for {
          notifications <- EitherT.liftF[Future, AppError, Seq[Notification]](
            env.dataStore.notificationRepo
              .forTenant(ctx.tenant)
              .findNotDeleted(
                Json.obj("_id" -> Json.obj("$in" -> notificationIds))
              )
          )
          _ <- EitherT.cond[Future][AppError, Unit](
            notifications.forall(_.notificationType == AcceptOnly),
            (),
            AppError.EntityConflict("Notification must be AcceptOnly")
          )
          _ <- EitherT.liftF[Future, AppError, Long](
            env.dataStore.notificationRepo
              .forTenant(ctx.tenant)
              .updateManyByQuery(
                if (selectAll)
                  Json.obj(
                    "status.status" -> "Pending",
                    "notificationType" -> NotificationType.AcceptOnly.value
                  )
                else Json.obj("_id" -> Json.obj("$in" -> notificationIds)),
                Json.obj(
                  "$set" -> Json.obj(
                    "status" -> NotificationStatusFormat
                      .writes(NotificationStatus.Accepted())
                  )
                )
              )
          )
        } yield Ok(Json.obj("done" -> true)))
          .leftMap(_.render())
          .merge
      }
    }
  def acceptNotification(notificationId: String) =
    DaikokuAction.async(parse.json) { ctx =>
      import cats.data._
      import cats.implicits._

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
          .findByIdNotDeleted(notificationId)
          .flatMap {
            case None =>
              FastFuture.successful(AppError.render(NotificationNotFound))
            case Some(notification) =>
              notification.team match {
                case None => accept(notification, None)
                case Some(teamId) =>
                  env.dataStore.teamRepo
                    .forTenant(ctx.tenant)
                    .findByIdNotDeleted(teamId)
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
  )(implicit ctx: DaikokuActionContext[AnyContent], lang: String) =
    TeamAdminOnly(
      AuditTrailEvent(
        s"@{user.name} has rejected a notifications for team @{team.name} - @{team.id} => @{notification.id}"
      )
    )(teamId.value, ctx) { ownerTeam =>
      {

        ctx.setCtxValue("notification.id", notification.id)

        val mailBody: Future[String] = notification.action match {
          case ApiAccess(api, team) =>
            (for {
              api <-
                env.dataStore.apiRepo
                  .forTenant(ctx.tenant.id)
                  .findByIdNotDeleted(api)
              consumerTeam <-
                env.dataStore.teamRepo
                  .forTenant(ctx.tenant.id)
                  .findByIdNotDeleted(team)
              recipient <-
                notification.sender.id
                  .map(id =>
                    env.dataStore.userRepo
                      .findByIdNotDeleted(id)
                  )
                  .getOrElse(FastFuture.successful(None))
              unrecognizedApi <-
                translator
                  .translate("unrecognized.api", ctx.tenant)
            } yield translator.translate(
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
            )).flatten

          case notif: TeamInvitation =>
            (for {
              user <-
                env.dataStore.userRepo
                  .findByIdNotDeleted(notif.user)
              recipient <-
                notification.sender.id
                  .map(id =>
                    env.dataStore.userRepo
                      .findByIdNotDeleted(id)
                  )
                  .getOrElse(FastFuture.successful(None))
              unrecognizedUser <-
                translator.translate("unrecognized.user", ctx.tenant)

            } yield translator.translate(
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
            )).flatten
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
                  .findByIdNotDeleted(notif.team)
              maybeApi <-
                env.dataStore.apiRepo
                  .forTenant(ctx.tenant.id)
                  .findByIdNotDeleted(notif.api)
              maybePlan <-
                env.dataStore.usagePlanRepo
                  .forTenant(ctx.tenant.id)
                  .findByIdNotDeleted(notif.plan)
              maybeDemand <-
                env.dataStore.subscriptionDemandRepo
                  .forTenant(ctx.tenant)
                  .findByIdNotDeleted(notif.demand)
              unknownUser <-
                translator.translate("unrecognized.team", ctx.tenant)
              maybeUser <-
                maybeDemand
                  .map(d => env.dataStore.userRepo.findByIdNotDeleted(d.from))
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
            } yield body
          case TransferApiOwnership(team, api) =>
            val result = for {
              api <-
                env.dataStore.apiRepo
                  .forTenant(ctx.tenant)
                  .findByIdNotDeleted(api)
              team <-
                env.dataStore.teamRepo
                  .forTenant(ctx.tenant)
                  .findByIdNotDeleted(team)
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

            result.flatten
          case _ => FastFuture.successful("")
        }

        for {
          mailBody <- mailBody
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
      import cats.data._
      import cats.implicits._

      ctx.setCtxValue("notification.id", notification.id)
      ctx.setCtxValue("user.id", notification.sender.id)
      ctx.setCtxValue("user.name", notification.sender.name)

      val value: EitherT[Future, AppError, String] = notification.action match {
        case TeamInvitation(team, user) if user == ctx.user.id =>
          EitherT.liftF(
            env.dataStore.teamRepo
              .forTenant(ctx.tenant.id)
              .findByIdNotDeleted(team)
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
                    .findByIdNotDeleted(user)
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
            .findByIdNotDeleted(notificationId),
          AppError.NotificationNotFound
        )
        sender <- EitherT.fromOptionF[Future, AppError, User](
          env.dataStore.userRepo.findByIdNotDeleted(notification.sender.id.get),
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
    import cats.data._
    import cats.implicits._

    val result: EitherT[Future, AppError, Unit] = for {
      api <- EitherT.fromOptionF(
        env.dataStore.apiRepo
          .forTenant(tenant.id)
          .findByIdNotDeleted(apiId.value),
        ApiNotFound
      )
      ownerTeam <- EitherT.fromOptionF(
        env.dataStore.teamRepo
          .forTenant(tenant.id)
          .findByIdNotDeleted(api.team),
        TeamNotFound
      )
      team <- EitherT.fromOptionF(
        env.dataStore.teamRepo
          .forTenant(tenant.id)
          .findByIdNotDeleted(teamRequestId.value),
        TeamNotFound
      )
      administrators <- EitherT.liftF(
        env.dataStore.userRepo
          .find(
            Json.obj(
              "_deleted" -> false,
              "_id" -> Json.obj(
                "$in" -> JsArray(
                  team.users
                    .filter(_.teamPermission == Administrator)
                    .map(_.asJson)
                    .toSeq
                )
              )
            )
          )
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
    import cats.data._
    import cats.implicits._

    implicit val lang: String =
      tenant.defaultLanguage.getOrElse(
        "en"
      ) //todo: get user defaultlanguage if possible
    val r: EitherT[Future, AppError, Unit] = for {
      invitedUser <- EitherT.fromOptionF(
        env.dataStore.userRepo.findByIdNotDeleted(invitedUserId),
        UserNotFound()
      )
      team <- EitherT.fromOptionF(
        env.dataStore.teamRepo.forTenant(tenant).findByIdNotDeleted(team),
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
    } yield Right(())

    r.value
  }

  def acceptApiSubscription(
      subscriptionDemandId: SubscriptionDemandId,
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
    import cats.data._
    import cats.implicits._
    import fr.maif.otoroshi.daikoku.utils.RequestImplicits._

    implicit val language: String = ctx.request.getLanguage(ctx.tenant)
    implicit val currentUser: User = user

    val r: EitherT[Future, AppError, Unit] = for {
      api <- EitherT.fromOptionF(
        env.dataStore.apiRepo
          .forTenant(tenant.id)
          .findByIdNotDeleted(apiId.value),
        ApiNotFound
      )
      team <- EitherT.fromOptionF(
        env.dataStore.teamRepo
          .forTenant(tenant.id)
          .findByIdNotDeleted(teamRequestId.value),
        TeamNotFound
      )

      demand <- EitherT.fromOptionF(
        env.dataStore.subscriptionDemandRepo
          .forTenant(ctx.tenant)
          .findOneNotDeleted(
            Json.obj(
              "_id" -> subscriptionDemandId.asJson
            )
          ),
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
    import cats.data._
    import cats.implicits._

    val r: EitherT[Future, AppError, Unit] = for {
      newTeam <- EitherT.fromOptionF(
        env.dataStore.teamRepo.forTenant(tenant).findByIdNotDeleted(teamId),
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
          .forTenant(tenant)
          .findNotDeleted(
            Json.obj(
              "api" -> Json.obj("$in" -> JsArray(versions.map(_.id.asJson))),
              "state" -> Json.obj(
                "$in" -> Json.arr(
                  SubscriptionDemandState.InProgress.name,
                  SubscriptionDemandState.Waiting.name
                )
              )
            )
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
                          .TeamAdmin(id, _, title, schema, formatter) =>
                      ValidationStep
                        .TeamAdmin(id, newTeam.id, title, schema, formatter)
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
        env.dataStore.notificationRepo
          .forTenant(tenant)
          .updateManyByQuery(
            Json.obj(
              "_deleted" -> false,
              "action.type" -> "ApiSubscription",
              "action.api" -> Json
                .obj("$in" -> JsArray(versions.map(_.id.asJson))),
              "status.status" -> NotificationStatus.Pending.toString
            ),
            Json.obj("$set" -> Json.obj("team" -> teamId.asJson))
          )
      )
    } yield ()

    r.value
  }
}
