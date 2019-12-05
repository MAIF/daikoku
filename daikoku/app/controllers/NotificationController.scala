package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import controllers.AppError
import controllers.AppError.{ApiNotFound, NotificationNotFound, TeamNotFound, UserNotTeamAdmin}
import fr.maif.otoroshi.daikoku.actions.{DaikokuAction, DaikokuActionMaybeWithGuest}
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async._
import fr.maif.otoroshi.daikoku.domain.NotificationAction.{ApiAccess, ApiSubscriptionDemand, TeamAccess}
import fr.maif.otoroshi.daikoku.domain.TeamPermission.TeamUser
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json.NotificationFormat
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.{ApiService, OtoroshiClient}
import play.api.Logger
import play.api.libs.json.{JsArray, JsError, JsSuccess, Json}
import play.api.mvc.{AbstractController, ControllerComponents, Result}

import scala.concurrent.Future

class NotificationController(DaikokuAction: DaikokuAction,
                             DaikokuActionMaybeWithGuest: DaikokuActionMaybeWithGuest,
                             env: Env,
                             apiService: ApiService,
                             otoroshiClient: OtoroshiClient,
                             cc: ControllerComponents)
    extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  def unreadNotificationsCountOfTeam(teamId: String) = DaikokuAction.async { ctx =>
    TeamAdminOnly(AuditTrailEvent(s"@{user.name} has accessed number of unread notifications for team @{team.name} - @{team.id} => @{notifications}"))(teamId, ctx) { team =>
      for {
        notificationRepo <- env.dataStore.notificationRepo.forTenantF(ctx.tenant.id)
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
    UberPublicUserAccess(AuditTrailEvent(s"@{user.name} has accessed to his count of unread notifications"))(ctx) {
      for {
        myTeams <- env.dataStore.teamRepo.myTeams(ctx.tenant, ctx.user)
        notificationRepo <- env.dataStore.notificationRepo.forTenantF(ctx.tenant.id)
        youHaveUnreadNotifications <- notificationRepo.findNotDeleted(
          Json.obj(
            "status.status" -> "Pending",
            "team" -> Json.obj("$in" -> JsArray(myTeams.filter(t => t.admins().contains(ctx.user.id)).map(_.id.asJson)))
          )
        )
      } yield {
        ctx.setCtxValue("notifications", youHaveUnreadNotifications.size)
        Ok(Json.obj("count" -> youHaveUnreadNotifications.size))
      }
    }
  }

  def myNotifications(page: Int, pageSize: Int) = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(s"@{user.name} has accessed to his count of unread notifications"))(ctx) {
      for {
        myTeams <- env.dataStore.teamRepo.myTeams(ctx.tenant, ctx.user)
        notificationRepo <- env.dataStore.notificationRepo.forTenantF(ctx.tenant.id)
        notifications <- notificationRepo.findWithPagination(Json.obj(
          "_deleted" -> false,
          "team" -> Json.obj("$in" -> JsArray(myTeams.filter(t => t.admins().contains(ctx.user.id)).map(_.id.asJson)))
        ),
          page,
          pageSize)
      } yield {
        Logger.debug(Json.prettyPrint(Json.obj(
          "_deleted" -> false,
          "team" -> Json.obj("$in" -> JsArray(myTeams.filter(t => t.admins().contains(ctx.user.id)).map(_.id.asJson)))
        )))
        Ok(Json.obj("notifications" -> notifications._1.map(_.asJson), "count" -> notifications._2, "page"  -> page, "pageSize" -> pageSize))
      }
    }
  }

  def myUntreatedNotifications(page: Int, pageSize: Int) = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(s"@{user.name} has accessed to his untreated notifications"))(ctx) {
      //todo: filter myTeams where i'm admin
      for {
        myTeams <- env.dataStore.teamRepo.myTeams(ctx.tenant, ctx.user)
        notificationRepo <- env.dataStore.notificationRepo.forTenantF(ctx.tenant.id)
        notifications <- notificationRepo.findWithPagination(
          Json.obj(
            "team"   -> Json.obj("$in" -> JsArray(myTeams.filter(t => t.admins().contains(ctx.user.id)).map(_.id.asJson))),
            "status.status" -> NotificationStatus.Pending.toString
          ),
          page,
          pageSize
        )
      } yield {
        Ok(Json.obj("notifications" -> notifications._1.map(_.asJson), "count" -> notifications._2, "page"  -> page, "pageSize" -> pageSize))
      }
    }
  }

  def notificationOfTeam(teamId: String, page: Int, pageSize: Int) = DaikokuAction.async { ctx =>
    TeamAdminOnly(AuditTrailEvent(s"@{user.name} has accessed notifications for team @{team.name} - @{team.id}"))(teamId, ctx) { team =>
      for {
        notificationRepo <- env.dataStore.notificationRepo.forTenantF(ctx.tenant.id)
        notifications <- notificationRepo.findWithPagination(Json.obj(
                                                                "_deleted" -> false,
                                                               "team" -> team.id.value
                                                             ),
                                                             page,
          pageSize)
      } yield {
        Ok(Json.obj("notifications" -> notifications._1.map(_.asJson), "count" -> notifications._2, "page"  -> page, "pageSize" -> pageSize))
      }
    }
  }

  def untreatedNotificationOfTeam(teamId: String, page: Int, pageSize: Int) = DaikokuAction.async { ctx =>
    TeamAdminOnly(AuditTrailEvent(s"@{user.name} has accessed untreated notifications for team @{team.name} - @{team.id}"))(teamId, ctx) { team =>
      for {
        notificationRepo <- env.dataStore.notificationRepo.forTenantF(ctx.tenant.id)
        notifications <- notificationRepo.findWithPagination(
          Json.obj(
            "team"          -> team.id.value,
            "status.status" -> NotificationStatus.Pending.toString
          ),
          page,
          pageSize)
      } yield {
        Ok(Json.obj("notifications" -> notifications._1.map(_.asJson), "count" -> notifications._2, "page"  -> page, "pageSize" -> pageSize))
      }
    }
  }

  private def nothing(): Future[Either[AppError, Unit]] = FastFuture.successful(Right[AppError, Unit](()))
  private def nothingNone[A](): Future[Either[AppError, Option[A]]] = FastFuture.successful(Right[AppError, Option[A]](None))

  def acceptNotificationOfTeam(teamId: String, notificationId: String) = DaikokuAction.async { ctx =>
    import cats.data._
    import cats.implicits._

    TeamAdminOnly(AuditTrailEvent(s"@{user.name} has accepted a notification ($notificationId) for team @{team.name} - @{team.id}"))(teamId, ctx) { team =>
      val r: EitherT[Future, AppError, Result] = for {
        notification <- EitherT.fromOptionF(
			env.dataStore.notificationRepo.forTenant(ctx.tenant.id).findByIdNotDeleted(notificationId),
			NotificationNotFound
		)
        _ <- notification.action match {
          case ApiAccess(apiId, teamRequestId) => EitherT(acceptApiAccess(ctx.tenant, apiId, teamRequestId))
          case TeamAccess(_) => EitherT(acceptTeamAccess(ctx.tenant, team, notification.sender))
          case ApiSubscriptionDemand(apiId, planId, requestedteamId) =>
            EitherT(acceptApiSubscription(requestedteamId, apiId, planId, ctx.tenant, ctx.user))
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
  }

  def rejectNotificationOfTeam(teamId: String, notificationId: String) = DaikokuAction.async { ctx =>
    import cats.data._
    import cats.implicits._

    TeamAdminOnly(AuditTrailEvent(s"@{user.name} has rejected a notification ($notificationId) for team @{team.name} - @{team.id}"))(teamId, ctx) { team =>
      val r: EitherT[Future, AppError, Result] = for {
        notification <- EitherT.fromOptionF(
            env.dataStore.notificationRepo.forTenant(ctx.tenant.id).findByIdNotDeleted(notificationId),
            NotificationNotFound
          )
        mailBodyOpt <- notification.action match {
          case TeamAccess(_) =>
            EitherT.rightT[Future, AppError](Some(s"Your request to join the ${team.name} has been rejected."))
          case ApiAccess(apiId, _) =>
            EitherT.liftF(
              env.dataStore.apiRepo
                .forTenant(ctx.tenant.id)
                .findByIdNotDeleted(apiId)
                .map(
                  _.fold(Some(s"Your request to access to an unrecognized api has been rejected."))(
                    api => Some(s"Your request to access to api ${api.name} has been rejected.")
                  )
                )
            )
          case ApiSubscriptionDemand(apiId, _, _) =>
            EitherT.liftF(
              env.dataStore.apiRepo
                .forTenant(ctx.tenant.id)
                .findByIdNotDeleted(apiId)
                .map(
                  _.fold(Some(s"Your request for an apikey for an unrecognized api has been rejected."))(
                    api => Some(s"Your request for an apikey for ${api.name} has been rejected.")
                  )
                )
            )
          case _ => EitherT(nothingNone[String]())
        }
        _ <- mailBodyOpt match {
          case Some(mailBody) => EitherT.liftF(
            ctx.tenant.mailer.send("Your Daikoku request has been rejected.", Seq(notification.sender.email), mailBody)
          )
          case None => EitherT.liftF(FastFuture.successful(()))
        }
        _ <- EitherT.liftF(
          env.dataStore.notificationRepo
            .forTenant(ctx.tenant.id)
            .save(notification.copy(status = NotificationStatus.Rejected()))
        )
      } yield Ok(Json.obj("done" -> true))

      r.leftMap(AppError.render).value.map(_.merge)
    }
  }

  def acceptApiAccess(tenant: Tenant, apiId: ApiId, teamRequestId: TeamId): Future[Either[AppError, Unit]] = {
    import cats.data._
    import cats.implicits._
    val result: EitherT[Future, AppError, Unit] = for {
      api <- EitherT.fromOptionF(env.dataStore.apiRepo.forTenant(tenant.id).findByIdNotDeleted(apiId.value), ApiNotFound)
      team <- EitherT.fromOptionF(env.dataStore.teamRepo.forTenant(tenant.id).findByIdNotDeleted(teamRequestId.value),
        TeamNotFound)

      recipients <- EitherT.liftF(
        env.dataStore.userRepo
          .find(Json.obj(
            "_deleted" -> false,
            "_id" -> Json.obj("$in" -> JsArray(team.users.map(_.asJson).toSeq))))
      )

      _ <- EitherT.liftF(
        env.dataStore.apiRepo
          .forTenant(tenant.id)
          .save(api.copy(authorizedTeams = api.authorizedTeams ++ Set(teamRequestId)))
      )
      _ <- EitherT.liftF(
        tenant.mailer.send("Your Daikoku request has been accepted.",
          recipients.map(_.email),
          s"Your request to access to api ${api.name} has been accepted.")
      )
    } yield ()

    result.value
  }

  def acceptTeamAccess(tenant: Tenant, team: Team, sender: User): Future[Either[AppError, Unit]] = {
    for {
      _ <- env.dataStore.teamRepo
        .forTenant(tenant.id)
        .save(team.copy(users = team.users ++ Set(UserWithPermission(sender.id, TeamUser))))
      _ <- tenant.mailer.send("Your Daikoku request has been accepted.",
        Seq(sender.email),
        s"Your request to join the team ${team.name} has been accepted.")
    } yield Right(())
  }

  def acceptApiSubscription(teamRequestId: TeamId,
                            apiId: ApiId,
                            plan: UsagePlanId,
                            tenant: Tenant,
                            user: User): Future[Either[AppError, Unit]] = {
    import cats.data._
    import cats.implicits._

    val r: EitherT[Future, AppError, Unit] = for {
      api <- EitherT.fromOptionF(env.dataStore.apiRepo.forTenant(tenant.id).findByIdNotDeleted(apiId.value), ApiNotFound)
      team <- EitherT.fromOptionF(env.dataStore.teamRepo.forTenant(tenant.id).findByIdNotDeleted(teamRequestId.value),
                                  TeamNotFound)

      recipients <- EitherT.liftF(
                     env.dataStore.userRepo
                       .find(Json.obj(
                         "_deleted" -> false,
                         "_id" -> Json.obj("$in" -> JsArray(team.users.map(_.asJson).toSeq))))
                   )
      //todo: get plan "name" for mail body
      _ <- EitherT(apiService.subscribeToApi(tenant, user, api, plan.value, team))
      _ <- EitherT.liftF(
            tenant.mailer.send("Your Daikoku request has been accepted.",
                            recipients.map(_.email),
                            s"Your request for an apikey to ${api.name} has been accepted.")
          )
    } yield ()

    r.value
  }
}
