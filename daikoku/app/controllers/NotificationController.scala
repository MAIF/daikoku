package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import controllers.AppError
import controllers.AppError._
import fr.maif.otoroshi.daikoku.actions.{
  DaikokuAction,
  DaikokuActionContext,
  DaikokuActionMaybeWithGuest
}
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async._
import fr.maif.otoroshi.daikoku.domain.NotificationAction.{
  ApiAccess,
  ApiSubscriptionDemand,
  TeamAccess,
  TeamInvitation
}
import fr.maif.otoroshi.daikoku.domain.TeamPermission.{Administrator, TeamUser}
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.{ApiService, OtoroshiClient}
import play.api.i18n.{I18nSupport, Lang}
import play.api.libs.json.{JsArray, JsObject, Json}
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
                              otoroshiClient: OtoroshiClient,
                              cc: ControllerComponents)
  extends AbstractController(cc)
    with I18nSupport {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  def unreadNotificationsCountOfTeam(teamId: String) = DaikokuAction.async {
    ctx =>
      TeamAdminOnly(AuditTrailEvent(
        s"@{user.name} has accessed number of unread notifications for team @{team.name} - @{team.id} => @{notifications}"))(
        teamId,
        ctx) { team =>
        for {
          notificationRepo <- env.dataStore.notificationRepo
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

  def myUnreadNotificationsCount() = DaikokuActionMaybeWithGuest.async { ctx =>
    UberPublicUserAccess(AuditTrailEvent(
      s"@{user.name} has accessed to his count of unread notifications"))(ctx) {
      for {
        myTeams <- env.dataStore.teamRepo.myTeams(ctx.tenant, ctx.user)
        notificationRepo <- env.dataStore.notificationRepo
          .forTenantF(ctx.tenant.id)
        youHaveUnreadNotifications <- notificationRepo.findNotDeleted(
          Json.obj(
            "status.status" -> "Pending",
            "$or" -> Json.arr(
              Json.obj(
                "team" -> Json.obj("$in" -> JsArray(myTeams
                  .filter(t => t.admins().contains(ctx.user.id))
                  .map(_.id.asJson)))),
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

  def myNotifications(page: Int, pageSize: Int) = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(
      s"@{user.name} has accessed to his count of unread notifications"))(ctx) {
      for {
        myTeams <- env.dataStore.teamRepo.myTeams(ctx.tenant, ctx.user)
        notificationRepo <- env.dataStore.notificationRepo
          .forTenantF(ctx.tenant.id)
        notifications <- notificationRepo.findWithPagination(
          Json.obj(
            "_deleted" -> false,
            "$or" -> Json.arr(
              Json.obj(
                "team" -> Json.obj("$in" -> JsArray(myTeams
                  .filter(t => t.admins().contains(ctx.user.id))
                  .map(_.id.asJson)))),
              Json.obj("action.user" -> ctx.user.id.asJson)
            )
          ),
          page,
          pageSize
        )
      } yield {
        Ok(
          Json.obj("notifications" -> notifications._1.map(_.asJson),
            "count" -> notifications._2,
            "page" -> page,
            "pageSize" -> pageSize))
      }
    }
  }

  def myUntreatedNotifications(page: Int, pageSize: Int) = DaikokuAction.async {
    ctx =>
      PublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} has accessed to his untreated notifications"))(ctx) {
        //todo: filter myTeams where i'm admin
        for {
          myTeams <- env.dataStore.teamRepo.myTeams(ctx.tenant, ctx.user)
          notificationRepo <- env.dataStore.notificationRepo
            .forTenantF(ctx.tenant.id)
          notifications <- notificationRepo.findWithPagination(
            Json.obj(
              "$or" -> Json.arr(
                Json.obj(
                  "team" -> Json.obj("$in" -> JsArray(myTeams
                    .filter(t => t.admins().contains(ctx.user.id))
                    .map(_.id.asJson)))),
                Json.obj("action.user" -> ctx.user.id.asJson)
              ),
              "status.status" -> NotificationStatus.Pending.toString
            ),
            page,
            pageSize
          )
        } yield {
          Ok(
            Json.obj("notifications" -> notifications._1.map(_.asJson),
              "count" -> notifications._2,
              "page" -> page,
              "pageSize" -> pageSize))
        }
      }
  }

  def notificationOfTeam(teamId: String, page: Int, pageSize: Int) =
    DaikokuAction.async { ctx =>
      TeamAdminOnly(AuditTrailEvent(
        s"@{user.name} has accessed notifications for team @{team.name} - @{team.id}"))(
        teamId,
        ctx) { team =>
        for {
          notificationRepo <- env.dataStore.notificationRepo
            .forTenantF(ctx.tenant.id)
          notifications <- notificationRepo.findWithPagination(
            Json.obj(
              "_deleted" -> false,
              "team" -> team.id.value
            ),
            page,
            pageSize)
        } yield {
          Ok(
            Json.obj("notifications" -> notifications._1.map(_.asJson),
              "count" -> notifications._2,
              "page" -> page,
              "pageSize" -> pageSize))
        }
      }
    }

  def untreatedNotificationOfTeam(teamId: String, page: Int, pageSize: Int) =
    DaikokuAction.async { ctx =>
      TeamAdminOnly(AuditTrailEvent(
        s"@{user.name} has accessed untreated notifications for team @{team.name} - @{team.id}"))(
        teamId,
        ctx) { team =>
        for {
          notificationRepo <- env.dataStore.notificationRepo
            .forTenantF(ctx.tenant.id)
          notifications <- notificationRepo.findWithPagination(
            Json.obj(
              "team" -> team.id.value,
              "status.status" -> NotificationStatus.Pending.toString
            ),
            page,
            pageSize)
        } yield {
          Ok(
            Json.obj("notifications" -> notifications._1.map(_.asJson),
              "count" -> notifications._2,
              "page" -> page,
              "pageSize" -> pageSize))
        }
      }
    }

  private def nothing(): Future[Either[AppError, Unit]] =
    FastFuture.successful(Right[AppError, Unit](()))

  private def nothingNone[A](): Future[Either[AppError, Option[A]]] =
    FastFuture.successful(Right[AppError, Option[A]](None))

  def acceptNotification(notificationId: String) =
    DaikokuAction.async(parse.json) { ctx =>
      import cats.data._
      import cats.implicits._

      PublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} has accepted a notification ($notificationId)"))(ctx) {

        def accept(notification: Notification,
                   team: Option[Team]): Future[Result] = {
          val r: EitherT[Future, AppError, Result] = for {
            _ <- notification.action match {
              case ApiAccess(apiId, teamRequestId) =>
                EitherT(
                  acceptApiAccess(ctx.tenant,
                    apiId,
                    teamRequestId,
                    notification.sender))
              case TeamAccess(_) =>
                EitherT(
                  acceptTeamAccess(ctx.tenant, team.get, notification.sender))
              case ApiSubscriptionDemand(apiId, planId, requestedteamId) =>
                EitherT(
                  acceptApiSubscription(requestedteamId,
                    apiId,
                    planId,
                    ctx.tenant,
                    ctx.user,
                    notification.sender,
                    ctx.request.body.asOpt[JsObject].flatMap(o => (o \ "customMetadata").asOpt[JsObject]),
                    ctx.request.body.asOpt[JsObject].flatMap(o => (o \ "customMaxPerSecond").asOpt[Long]),
                    ctx.request.body.asOpt[JsObject].flatMap(o => (o \ "customMaxPerDay").asOpt[Long]),
                    ctx.request.body.asOpt[JsObject].flatMap(o => (o \ "customMaxPerMonth").asOpt[Long]),
                    ctx.request.body.asOpt[JsObject].flatMap(o => (o \ "customReadOnly").asOpt[Boolean])))
              case TeamInvitation(_, user) if user != ctx.user.id =>
                EitherT.leftT[Future, Unit](ForbiddenAction)
              case TeamInvitation(team, user) =>
                EitherT(
                  acceptTeamInvitation(ctx.tenant,
                    team,
                    user,
                    notification.sender))
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
                        if (ctx.user.isDaikokuAdmin || team.users.exists(u =>
                          u.userId == ctx.user.id && u.teamPermission == TeamPermission.Administrator)) {
                          accept(notification, Some(team))
                        } else {
                          FastFuture.successful(Forbidden(
                            Json.obj("error" -> "You're not a team admin")))
                        }
                    }
              }
          }
      }
    }

  def rejectNotificationOfTeam(teamId: TeamId, notification: Notification)(
    implicit ctx: DaikokuActionContext[AnyContent]) =
    TeamAdminOnly(AuditTrailEvent(
      s"@{user.name} has accessed number of unread notifications for team @{team.name} - @{team.id} => @{notifications}"))(
      teamId.value,
      ctx) { team => {
      implicit val lang: Lang = Lang(
        notification.sender.defaultLanguage
          .orElse(ctx.tenant.defaultLanguage)
          .getOrElse("en"))

      val message = notification.action match {
        case ApiAccess(api, _) =>
          env.dataStore.apiRepo
            .forTenant(ctx.tenant.id)
            .findByIdNotDeleted(api)
            .map {
              case None =>
                messagesApi("mail.api.access.rejection.body",
                  messagesApi("unrecognized.api"))
              case Some(api) =>
                messagesApi("mail.api.access.rejection.body", api.name)
            }
        case TeamAccess(team) =>
          env.dataStore.teamRepo
            .forTenant(ctx.tenant.id)
            .findByIdNotDeleted(team)
            .map {
              case None =>
                messagesApi("mail.team.access.rejection.body",
                  messagesApi("unrecognized.team"))
              case Some(team) =>
                messagesApi("mail.team.access.rejection.body", team.name)
            }
        case TeamInvitation(team, user) =>
          env.dataStore.teamRepo
            .forTenant(ctx.tenant.id)
            .findByIdNotDeleted(team)
            .flatMap {
              case None =>
                FastFuture.successful(
                  messagesApi("mail.user.invitation.rejection.body",
                    messagesApi("unrecognized.user"),
                    messagesApi("unrecognized.team")))
              case Some(team) =>
                env.dataStore.userRepo
                  .findByIdNotDeleted(user)
                  .map {
                    case None =>
                      messagesApi("mail.user.invitation.rejection.body",
                        messagesApi("unrecognized.user"),
                        team.name)
                    case Some(user) =>
                      messagesApi("mail.user.invitation.rejection.body",
                        user.name,
                        team.name)
                  }
            }
        case ApiSubscriptionDemand(apiId, _, _) =>
          env.dataStore.apiRepo
            .forTenant(ctx.tenant.id)
            .findByIdNotDeleted(apiId)
            .map {
              case None =>
                messagesApi("mail.api.subscription.rejection.body",
                  messagesApi("unrecognized.api"))
              case Some(api) =>
                messagesApi("mail.api.subscription.rejection.body", api.name)
            }
        case _ => FastFuture.successful("")
      }

      for {
        mailBody <- message
        _ <- env.dataStore.notificationRepo
          .forTenant(ctx.tenant.id)
          .save(notification.copy(status = NotificationStatus.Rejected()))
        _ <- ctx.tenant.mailer.send(messagesApi("mail.rejection.title"),
          Seq(notification.sender.email),
          mailBody)
      } yield Ok(Json.obj("done" -> true))
    }
    }

  def rejectNotificationOfMe(notification: Notification)(
    implicit ctx: DaikokuActionContext[AnyContent]) =
    PublicUserAccess(AuditTrailEvent(
      s"@{user.name} has accessed number of unread notifications for team @{team.name} - @{team.id} => @{notifications}"))(
      ctx) {
      import cats.data._
      import cats.implicits._

      implicit val lang: Lang = Lang(
        notification.sender.defaultLanguage
          .orElse(ctx.tenant.defaultLanguage)
          .getOrElse("en"))

      val value: EitherT[Future, AppError, String] = notification.action match {
        case TeamInvitation(team, user) if user == ctx.user.id =>
          EitherT.liftF(
            env.dataStore.teamRepo
              .forTenant(ctx.tenant.id)
              .findByIdNotDeleted(team)
              .flatMap {
                case None =>
                  FastFuture.successful(
                    messagesApi("mail.user.invitation.rejection.body",
                      messagesApi("unrecognized.user"),
                      messagesApi("unrecognized.team")))
                case Some(team) =>
                  env.dataStore.userRepo
                    .findByIdNotDeleted(user)
                    .map {
                      case None =>
                        messagesApi("mail.user.invitation.rejection.body",
                          messagesApi("unrecognized.user"),
                          team.name)
                      case Some(user) =>
                        messagesApi("mail.user.invitation.rejection.body",
                          user.name,
                          team.name)
                    }
              })
        case _ => EitherT.leftT[Future, String](ForbiddenAction)
      }

      value
        .map(mailBody =>
          for {
            _ <- env.dataStore.notificationRepo
              .forTenant(ctx.tenant.id)
              .save(notification.copy(status = NotificationStatus.Rejected()))
            _ <- ctx.tenant.mailer.send(messagesApi("mail.rejection.title"),
              Seq(notification.sender.email),
              mailBody)
          } yield Ok(Json.obj("done" -> true)))
        .leftMap(t => FastFuture.successful(AppError.render(t)))
        .value
        .map(_.merge)
        .flatten
    }

  def rejectNotification(notificationId: String) =
    DaikokuAction.async { ctx =>
      implicit val context: DaikokuActionContext[AnyContent] = ctx

      env.dataStore.notificationRepo
        .forTenant(ctx.tenant.id)
        .findByIdNotDeleted(notificationId)
        .flatMap {
          case None =>
            FastFuture.successful(AppError.render(NotificationNotFound))
          case Some(notification) =>
            notification.team match {
              case None => rejectNotificationOfMe(notification)
              case Some(team) => rejectNotificationOfTeam(team, notification)
            }
        }
    }

  def acceptApiAccess(tenant: Tenant,
                      apiId: ApiId,
                      teamRequestId: TeamId,
                      sender: User): Future[Either[AppError, Unit]] = {
    import cats.data._
    import cats.implicits._

    implicit val lang: Lang = Lang(tenant.defaultLanguage.getOrElse("en"))
    val result: EitherT[Future, AppError, Unit] = for {
      api <- EitherT.fromOptionF(env.dataStore.apiRepo
        .forTenant(tenant.id)
        .findByIdNotDeleted(apiId.value),
        ApiNotFound)
      team <- EitherT.fromOptionF(env.dataStore.teamRepo
        .forTenant(tenant.id)
        .findByIdNotDeleted(teamRequestId.value),
        TeamNotFound)
      administrators <- EitherT.liftF(
        env.dataStore.userRepo
          .find(
            Json.obj("_deleted" -> false,
              "_id" -> Json.obj(
                "$in" -> JsArray(
                  team.users
                    .filter(_.teamPermission == Administrator)
                    .map(_.asJson)
                    .toSeq))))
      )
      _ <- EitherT.liftF(
        env.dataStore.apiRepo
          .forTenant(tenant.id)
          .save(api.copy(
            authorizedTeams = api.authorizedTeams ++ Set(teamRequestId)))
      )
      _ <- EitherT.liftF(
        tenant.mailer.send(
          messagesApi("mail.acceptation.title"),
          administrators.map(_.email) ++ Seq(sender.email),
          messagesApi("mail.api.access.acceptation.body", api.name, sender.name)
        ))
    } yield ()

    result.value
  }

  def acceptTeamAccess(tenant: Tenant,
                       team: Team,
                       sender: User): Future[Either[AppError, Unit]] = {
    implicit val lang: Lang = Lang(
      sender.defaultLanguage.orElse(tenant.defaultLanguage).getOrElse("en"))
    for {
      _ <- env.dataStore.teamRepo
        .forTenant(tenant.id)
        .save(team.copy(
          users = team.users ++ Set(UserWithPermission(sender.id, TeamUser))))
      _ <- tenant.mailer.send(
        messagesApi("mail.acceptation.title"),
        Seq(sender.email),
        messagesApi("mail.team.access.acceptation.body", team.name))
    } yield Right(())
  }

  def acceptTeamInvitation(tenant: Tenant,
                           team: TeamId,
                           invitedUserId: UserId,
                           sender: User): Future[Either[AppError, Unit]] = {
    import cats.data._
    import cats.implicits._

    implicit val lang: Lang = Lang(
      sender.defaultLanguage.orElse(tenant.defaultLanguage).getOrElse("en"))
    val r: EitherT[Future, AppError, Unit] = for {
      invitedUser <- EitherT.fromOptionF(
        env.dataStore.userRepo.findByIdNotDeleted(invitedUserId),
        UserNotFound)
      team <- EitherT.fromOptionF(
        env.dataStore.teamRepo.forTenant(tenant).findByIdNotDeleted(team),
        TeamNotFound)
      _ <- EitherT.liftF(
        env.dataStore.teamRepo
          .forTenant(tenant.id)
          .save(team.copy(users = team.users ++ Set(
            UserWithPermission(invitedUser.id, TeamUser)))))
      _ <- EitherT.liftF(
        tenant.mailer.send(messagesApi("mail.acceptation.title"),
          Seq(sender.email),
          messagesApi("mail.user.invitation.acceptation.body",
            invitedUser.name,
            team.name)))
    } yield Right(())

    r.value
  }

  def acceptApiSubscription(
                             teamRequestId: TeamId,
                             apiId: ApiId,
                             plan: UsagePlanId,
                             tenant: Tenant,
                             user: User,
                             sender: User,
                             customMetadata: Option[JsObject],
                             customMaxPerSecond: Option[Long],
                             customMaxPerDay: Option[Long],
                             customMaxPerMonth: Option[Long],
                             customReadOnly: Option[Boolean]): Future[Either[AppError, Unit]] = {
    import cats.data._
    import cats.implicits._
    implicit val lang: Lang = Lang(tenant.defaultLanguage.getOrElse("en"))
    val r: EitherT[Future, AppError, Unit] = for {
      api <- EitherT.fromOptionF(env.dataStore.apiRepo
        .forTenant(tenant.id)
        .findByIdNotDeleted(apiId.value),
        ApiNotFound)
      team <- EitherT.fromOptionF(env.dataStore.teamRepo
        .forTenant(tenant.id)
        .findByIdNotDeleted(teamRequestId.value),
        TeamNotFound)
      administrators <- EitherT.liftF(
        env.dataStore.userRepo
          .find(
            Json.obj("_deleted" -> false,
              "_id" -> Json.obj(
                "$in" -> JsArray(
                  team.users
                    .filter(_.teamPermission == Administrator)
                    .map(_.asJson)
                    .toSeq))))
      )
      //todo: get plan "name" for mail body
      _ <- EitherT(
        apiService
          .subscribeToApi(
            tenant, user, api, plan.value, team, customMetadata, customMaxPerSecond, customMaxPerDay, customMaxPerMonth, customReadOnly))
      _ <- EitherT.liftF(
        tenant.mailer.send(
          messagesApi("mail.acceptation.title"),
          administrators.map(_.email) ++ Seq(sender.email),
          messagesApi("mail.api.subscription.acceptation.body",
            sender.name,
            api.name)
        )
      )
    } yield ()

    r.value
  }
}
