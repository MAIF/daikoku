package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import fr.maif.otoroshi.daikoku.actions.{
  DaikokuAction,
  DaikokuActionMaybeWithGuest
}
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async._
import fr.maif.otoroshi.daikoku.domain.NotificationAction.TeamAccess
import fr.maif.otoroshi.daikoku.domain.TeamPermission.TeamUser
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json.TeamFormat
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.OtoroshiClient
import play.api.libs.json._
import play.api.mvc.{
  AbstractController,
  Action,
  AnyContent,
  ControllerComponents
}
import reactivemongo.bson.BSONObjectID

import scala.concurrent.Future

class TeamController(DaikokuAction: DaikokuAction,
                     DaikokuActionMaybeWithGuest: DaikokuActionMaybeWithGuest,
                     env: Env,
                     otoroshiClient: OtoroshiClient,
                     cc: ControllerComponents)
    extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  def team(teamId: String): Action[AnyContent] =
    DaikokuActionMaybeWithGuest.async { ctx =>
      UberPublicUserAccess(
        AuditTrailEvent(
          s"@{user.get.name} has accessed the team @{team.name} - @{team.id}"))(
        ctx) {
        env.dataStore.teamRepo
          .forTenant(ctx.tenant.id)
          .findByIdOrHrId(teamId)
          .map {
            case Some(team) =>
//          ctx.setCtxValue("team.id", team.id)
//          ctx.setCtxValue("team.name", team.name)
              Ok(team.asSimpleJson)
            case None => NotFound(Json.obj("error" -> "Team not found"))
          }
      }
    }

  def teamFull(teamId: String): Action[AnyContent] = DaikokuAction.async {
    ctx =>
      TeamAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has accessed the team @{team.name} - @{team.id}"))(
        teamId,
        ctx) { _ =>
        env.dataStore.teamRepo
          .forTenant(ctx.tenant.id)
          .findByIdOrHrId(teamId)
          .flatMap {
            case Some(team) =>
              ctx.setCtxValue("team.id", team.id)
              ctx.setCtxValue("team.name", team.name)

              env.dataStore.translationRepo
                .forTenant(ctx.tenant)
                .find(Json.obj("element.id" -> team.id.asJson))
                .map(translations => {
                  val translationAsJsObject = translations
                    .groupBy(t => t.language)
                    .map {
                      case (k, v) =>
                        Json.obj(
                          k -> JsObject(v.map(t => t.key -> JsString(t.value))))
                    }
                    .fold(Json.obj())(_ deepMerge _)
                  val translation =
                    Json.obj("translation" -> translationAsJsObject)

                  Ok(team.asJson.as[JsObject] ++ translation)
                })
            case None =>
              FastFuture.successful(
                NotFound(Json.obj("error" -> "Team not found")))
          }
      }
  }

  def teams() = DaikokuActionMaybeWithGuest.async { ctx =>
    UberPublicUserAccess(AuditTrailEvent(
      s"@{user.name} has accessed the list of teams for current tenant"))(ctx) {
      env.dataStore.teamRepo.forTenant(ctx.tenant.id).findAll() map { teams =>
        Ok(JsArray(teams.map(_.toUiPayload())))
      }
    }
  }

  def createTeam() = DaikokuAction.async(parse.json) { ctx =>
    PublicUserAccess(
      AuditTrailEvent(
        s"@{user.name} have create team @{team.name} - @{team.id}"))(ctx) {
      TeamFormat.reads(ctx.request.body) match {
        case JsError(e) =>
          FastFuture.successful(
            BadRequest(Json.obj("error" -> "Error while parsing payload",
                                "msg" -> e.toString)))
        case JsSuccess(team, _) =>
          ctx.setCtxValue("team.id", team.id)
          ctx.setCtxValue("team.name", team.name)
          env.dataStore.teamRepo
            .forTenant(ctx.tenant)
            .findOneNotDeleted(
              Json.obj(
                "$or" -> Json.arr(
                  Json.obj("_id" -> team.id.asJson),
                  Json.obj("_humanReadableId" -> team.humanReadableId))
              ))
            .flatMap {
              case Some(_) =>
                FastFuture.successful(Conflict(
                  Json.obj("error" -> "Team with id or hrid already exist")))
              case None =>
                env.dataStore.teamRepo
                  .forTenant(ctx.tenant.id)
                  .save(team)
                  .map(_ => Created(team.asJson))
            }
      }
    }
  }

  def updateTeam(teamId: String) = DaikokuAction.async(parse.json) { ctx =>
    TeamAdminOnly(AuditTrailEvent(
      "@{user.name} has updated team @{team.name} - @{team.id"))(teamId, ctx) {
      _ =>
        json.TeamFormat.reads(ctx.request.body) match {
          case JsSuccess(newTeam, _) =>
            env.dataStore.teamRepo
              .forTenant(ctx.tenant.id)
              .findByIdNotDeleted(teamId)
              .flatMap {
                case Some(team) if team.`type` == TeamType.Admin => FastFuture.successful(Forbidden(Json.obj("error" -> "You're not authorized to update this team")))
                case Some(team) =>
                  ctx.setCtxValue("team.id", team.id)
                  ctx.setCtxValue("team.name", team.name)
                  val teamToSave =
                    if (ctx.user.isDaikokuAdmin) newTeam
                    else newTeam.copy(metadata = team.metadata)
                  env.dataStore.teamRepo
                    .forTenant(ctx.tenant.id)
                    .save(teamToSave)
                    .map { _ =>
                      Ok(teamToSave.asJson)
                    }
                case None =>
                  FastFuture.successful(
                    NotFound(Json.obj("error" -> "team not found")))
              }
          case e: JsError =>
            FastFuture.successful(BadRequest(JsError.toJson(e)))
        }
    }
  }

  def deleteTeam(teamId: String) = DaikokuAction.async { ctx =>
    DaikokuAdminOnly(
      AuditTrailEvent(
        s"@{user.name} has deleted team @{team.name} - @{team.id}"))(ctx) {
      env.dataStore.teamRepo.forTenant(ctx.tenant.id).findById(teamId) flatMap {
        case Some(team) if team.`type` == TeamType.Admin => FastFuture.successful(Forbidden(Json.obj("error" -> "You're not authorized to delete this team")))
        case Some(team) =>
          ctx.setCtxValue("team.id", team.id)
          ctx.setCtxValue("team.name", team.name)
          // TODO: logical delete
          env.dataStore.teamRepo
            .forTenant(ctx.tenant.id)
            .deleteById(teamId)
            .map { _ =>
              Ok(Json.obj("done" -> true))
            }
        case None =>
          FastFuture.successful(NotFound(Json.obj("error" -> "Team not found")))
      }
    }
  }

  def allJoinableTeams() = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(
      s"@{user.name} has accessed list of joinable teams"))(ctx) {
      for {
        teams <- env.dataStore.teamRepo
          .forTenant(ctx.tenant.id)
          .findNotDeleted(Json.obj("type" -> TeamType.Organization.name))
        translations <- env.dataStore.translationRepo
          .forTenant(ctx.tenant)
          .find(Json.obj(
            "element.id" -> Json.obj("$in" -> JsArray(teams.map(_.id.asJson)))))
        myCurrentRequests <- env.dataStore.notificationRepo
          .forTenant(ctx.tenant.id)
          .findNotDeleted(
            Json.obj("sender._id" -> ctx.user.id.asJson,
                     "action.type" -> "TeamAccess",
                     "status.status" -> "Pending")
          )
      } yield {
        def translationAsJsObject(team: Team): JsObject = {
          val translationAsJsObject = translations
            .groupBy(t => t.language)
            .map {
              case (k, v) =>
                Json.obj(k -> JsObject(v.map(t => t.key -> JsString(t.value))))
            }
            .fold(Json.obj())(_ deepMerge _)
          Json.obj("translation" -> translationAsJsObject)
        }

        if (ctx.user.isDaikokuAdmin) {
          Ok(JsArray(teams.map(team =>
            team.asJson.as[JsObject] ++ translationAsJsObject(team))))
        } else {
          val allOrga = teams.filter { team =>
            if (team.`type` == TeamType.Personal && team.includeUser(
                  ctx.user.id)) {
              true
            } else {
              team.`type` == TeamType.Organization
            }
          }
          val betterTeams = allOrga
            .sortWith((a, b) => a.name.compareToIgnoreCase(b.name) < 0)
            .map { t =>
              val json = TeamFormat.writes(t).as[JsObject]
              val canJoin = !t.includeUser(ctx.user.id)
              val alreadyJoin = myCurrentRequests
                .map(notif => notif.action.asInstanceOf[TeamAccess].team)
                .contains(t.id)
              json ++ Json.obj("canJoin" -> canJoin,
                               "alreadyJoin" -> alreadyJoin)
            }
          Ok(JsArray(betterTeams))
        }
      }
    }
  }

  def askForJoinTeam(teamId: String) = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(
      s"@{user.name} has asked to join team @{team.name} - @{team.id}"))(ctx) {
      env.dataStore.teamRepo.forTenant(ctx.tenant.id).findById(teamId).flatMap {
        case Some(team) if team.`type` == TeamType.Personal =>
          FastFuture.successful(Forbidden(
            Json.obj("error" -> "Team type doesn't accept to be join")))
        case Some(team) if team.`type` == TeamType.Admin =>
          FastFuture.successful(Forbidden(
            Json.obj("error" -> "Team type doesn't accept to be join")))
        case Some(team) =>
          val notification = Notification(
            id = NotificationId(BSONObjectID.generate().stringify),
            tenant = ctx.tenant.id,
            deleted = false,
            team = team.id,
            sender = ctx.user,
            action = NotificationAction.TeamAccess(team.id)
          )

          for {
            notificationRepo <- env.dataStore.notificationRepo
              .forTenantF(ctx.tenant.id)
            saved <- notificationRepo.save(notification)
            admins <- env.dataStore.userRepo
              .find(
                Json.obj("_deleted" -> false,
                         "_id" -> Json.obj("$in" -> JsArray(
                           team.admins().map(_.asJson).toSeq))))
            _ <- ctx.tenant.mailer.send(
              "Somebody want to join your team",
              admins.map(admin => admin.email),
              s"${ctx.user.name} want to join ${team.name}. you receive this mail because you are an team admin. Do you accept this request ? Y or N"
            )
          } yield {
            Ok(Json.obj("done" -> saved))
          }
        case None =>
          Future.successful(NotFound(Json.obj("error" -> "Team not found")))
      }
    }
  }

  def addableUsersForTeam(teamId: String) = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(
      s"@{user.name} has accessed list of addable members to team @{team.name} - @{team.id}"))(
      ctx) {
      env.dataStore.teamRepo
        .forTenant(ctx.tenant.id)
        .findByIdOrHrId(teamId)
        .flatMap {
          case Some(team) =>
            env.dataStore.userRepo.findAllNotDeleted().map { users =>
              Ok(
                JsArray(users
                  .filterNot(u => team.includeUser(u.id))
                  .map(_.asSimpleJson)))
            }
          case _ =>
            env.dataStore.userRepo.findAllNotDeleted().map { users =>
              Ok(JsArray(users.map(_.asSimpleJson)))
            }
        }
    }
  }

  def removeMemberFromTeam(teamId: String, memberId: String) =
    DaikokuAction.async { ctx =>
      TeamAdminOnly(AuditTrailEvent(
        s"@{user.name} has removed members from team @{team.name} - @{team.id}"))(
        teamId,
        ctx) { team =>
        team.`type` match {
          case TeamType.Personal =>
            FastFuture.successful(
              Conflict(Json.obj(
                "error" -> "Team type doesn't accept to remove members")))
          case TeamType.Admin =>
            FastFuture.successful(
              Forbidden(Json.obj("error" -> "Team type doesn't accept to remove members from this way")))
          case TeamType.Organization =>
            for {
              teamRepo <- env.dataStore.teamRepo.forTenantF(ctx.tenant.id)
              done <- teamRepo.save(
                team.copy(
                  users = team.users.filterNot(_.userId.value == memberId)))
              maybeTeam <- teamRepo.findById(team.id)
            } yield {
              maybeTeam match {
                case Some(updatedTeam) =>
                  Ok(Json.obj("done" -> done, "team" -> updatedTeam.asJson))
                case None => BadRequest
              }
            }
        }
      }
    }

  def addMembersToTeam(teamId: String) = DaikokuAction.async(parse.json) {
    ctx =>
      val members = (ctx.request.body \ "members").as[JsArray]
      TeamAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has added members to team @{team.name} - @{team.id}"))(
        teamId,
        ctx) { team =>
        team.`type` match {
          case TeamType.Personal =>
            FastFuture.successful(
              Conflict(
                Json.obj("error" -> "Team type doesn't accept to add members")))
          case TeamType.Admin =>
            FastFuture.successful(
              Forbidden(Json.obj("error" -> "Team type doesn't accept to add members from this way")))
          case TeamType.Organization =>
            for {
              teamRepo <- env.dataStore.teamRepo.forTenantF(ctx.tenant.id)
              done <- teamRepo.save(
                team.copy(users = team.users ++ members.value.map(i =>
                  UserWithPermission(UserId(i.as[String]), TeamUser))))
              maybeTeam <- teamRepo.findById(team.id)
            } yield {
              maybeTeam match {
                case Some(updatedTeam) =>
                  Ok(Json.obj("done" -> done, "team" -> updatedTeam.asJson))
                case None => BadRequest
              }
            }
        }
      }
  }

  def updateTeamMembersPermission(teamId: String) =
    DaikokuAction.async(parse.json) { ctx =>
      implicit val format: Format[TeamPermission] = json.TeamPermissionFormat

      val members = (ctx.request.body \ "members")
        .as[JsArray]
        .value
        .map(id => UserId(id.as[String]))
      val jsonPermission = (ctx.request.body \ "permission").as[JsString]
      val permission: TeamPermission =
        Json.fromJson[TeamPermission](jsonPermission).get
      ctx.setCtxValue("permission", permission.name)

      TeamAdminOnly(AuditTrailEvent(
        s"@{user.name} has updated members permissions of team @{team.name} - @{team.id} to @{permission}"))(
        teamId,
        ctx) { team =>
        team.`type` match {
          case TeamType.Personal =>
            FastFuture.successful(
              Conflict(Json.obj(
                "error" -> "Team type doesn't accept to update permission")))
          case TeamType.Admin =>
            FastFuture.successful(
              Conflict(Json.obj("error" -> "Team type doesn't accept to update permission")))
          case TeamType.Organization =>
            for {
              teamRepo <- env.dataStore.teamRepo.forTenantF(ctx.tenant.id)
              done <- teamRepo.save(team.copy(users = team.users.filterNot(u =>
                members.contains(u.userId)) ++ members.map(userId =>
                UserWithPermission(userId, permission))))
              maybeTeam <- teamRepo.findById(team.id)
            } yield {
              maybeTeam match {
                case Some(updatedTeam) =>
                  Ok(Json.obj("done" -> done, "team" -> updatedTeam.asJson))
                case None => BadRequest
              }
            }
        }
      }
    }

  def memberOfTeam(teamId: String, id: String) = DaikokuAction.async { ctx =>
    TeamMemberOnly(AuditTrailEvent(
      s"@{user.name} has accessed one member ($id} of team @{team.name} - @{team.id}"))(
      teamId,
      ctx) {
      // TODO: verify if the behavior is correct
      case team if team.includeUser(UserId(id)) =>
        env.dataStore.userRepo.findByIdNotDeleted(id).map {
          case None       => NotFound(Json.obj("error" -> "User not found"))
          case Some(user) => Ok(user.asSimpleJson)
        }
      case _ =>
        FastFuture.successful(
          NotFound(Json.obj("error" -> "Member is not part of the team")))
    }
  }

  def membersOfTeam(teamId: String) = DaikokuAction.async { ctx =>
    TeamMemberOnly(AuditTrailEvent(
      s"@{user.name} has accessed the member list of team @{team.name} - @{team.id}"))(
      teamId,
      ctx) { team =>
      env.dataStore.userRepo
        .find(
          Json.obj(
            "_deleted" -> false,
            "_id" -> Json.obj(
              "$in" -> JsArray(team.users.map(_.userId.asJson).toSeq))
          )
        )
        .map { users =>
          Ok(JsArray(users.map(_.asSimpleJson)))
        }
    }
  }

  def updateApiKeysVisibility(teamId: String) =
    DaikokuAction.async(parse.json) { ctx =>
      val showApiKeyOnlyToAdmins: Boolean =
        (ctx.request.body \ "showApiKeyOnlyToAdmins")
          .asOpt[Boolean]
          .getOrElse(true)
      TeamAdminOnly(AuditTrailEvent(
        s"@{user.name} has updated key visibility for team @{team.name} - @{team.id} - $showApiKeyOnlyToAdmins"))(
        teamId,
        ctx) { team =>
        team.`type` match {
          case TeamType.Personal =>
            FastFuture.successful(Conflict(Json.obj(
              "error" -> "Team type doesn't accept to update apikey visibility")))
          case TeamType.Admin =>
            FastFuture.successful(Conflict(Json.obj(
              "error" -> "Team type doesn't accept to update apikey visibility")))
          case TeamType.Organization =>
            for {
              teamRepo <- env.dataStore.teamRepo.forTenantF(ctx.tenant.id)
              done <- teamRepo.save(
                team.copy(showApiKeyOnlyToAdmins = showApiKeyOnlyToAdmins))
              maybeTeam <- teamRepo.findById(team.id)
            } yield {
              maybeTeam match {
                case Some(updatedTeam) =>
                  Ok(Json.obj("done" -> done, "team" -> updatedTeam.asJson))
                case None => BadRequest
              }
            }
        }
      }
    }

  def teamHome(teamId: String) = DaikokuAction.async { ctx =>
    TeamMemberOnly(AuditTrailEvent(
      s"@{user.name} has accessed its current team @{team.name} - @{team.id} home"))(
      teamId,
      ctx) { team =>
      for {
        apiRepo <- env.dataStore.apiRepo.forTenantF(ctx.tenant.id)
        subscriptionRepo <- env.dataStore.apiSubscriptionRepo
          .forTenantF(ctx.tenant.id)
        notificationRepo <- env.dataStore.notificationRepo
          .forTenantF(ctx.tenant.id)
        apis <- apiRepo.findNotDeleted(Json.obj("team" -> team.id.value))
        subscriptions <- subscriptionRepo.findNotDeleted(
          Json.obj("team" -> team.id.value))
        notifications <- notificationRepo.findNotDeleted(
          Json.obj(
            "status.status" -> "Pending",
            "team" -> team.id.value
          )
        )

      } yield {
        ctx.setCtxValue("team.id", team.id)
        ctx.setCtxValue("team.name", team.name)
        Ok(
          team.asJson.as[JsObject] ++ Json.obj(
            "apisCount" -> apis.size,
            "subscriptionsCount" -> subscriptions.size,
            "notificationCount" -> notifications.size
          )
        )
      }
    }
  }
}
