package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import akka.stream.Materializer
import akka.stream.scaladsl.{Sink, Source}
import fr.maif.otoroshi.daikoku.actions.{
  DaikokuAction,
  DaikokuActionContext,
  DaikokuActionMaybeWithGuest
}
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async._
import fr.maif.otoroshi.daikoku.domain.NotificationAction.TeamAccess
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json.TeamFormat
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.login.{AuthProvider, LdapConfig, LdapSupport}
import fr.maif.otoroshi.daikoku.utils.{IdGenerator, OtoroshiClient, Translator}
import org.joda.time.DateTime
import org.mindrot.jbcrypt.BCrypt
import play.api.i18n.{I18nSupport, Lang}
import play.api.libs.json._
import play.api.mvc.{
  AbstractController,
  Action,
  AnyContent,
  ControllerComponents,
  Result
}
import reactivemongo.bson.BSONObjectID

import scala.concurrent.{ExecutionContext, Future}

class TeamController(DaikokuAction: DaikokuAction,
                     DaikokuActionMaybeWithGuest: DaikokuActionMaybeWithGuest,
                     env: Env,
                     cc: ControllerComponents,
                     translator: Translator)
    extends AbstractController(cc)
    with I18nSupport {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env
  implicit val mat: Materializer = env.defaultMaterializer
  implicit val tr = translator

  def team(teamId: String): Action[AnyContent] =
    DaikokuActionMaybeWithGuest.async { ctx =>
      UberPublicUserAccess(AuditTrailEvent(
        s"@{user.name} has accessed the team @{team.name} - @{team.id}"))(ctx) {
        env.dataStore.teamRepo
          .forTenant(ctx.tenant.id)
          .findByIdOrHrIdNotDeleted(teamId)
          .map {
            case Some(team) =>
              Ok(team.asSimpleJson)
            case None => NotFound(Json.obj("error" -> "Team not found"))
          }
      }
    }

  def teamFull(teamId: String): Action[AnyContent] = DaikokuAction.async {
    ctx =>
      TeamAdminOrTenantAdminOnly(
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

          val teamToSave = team.copy(users =
            Set(UserWithPermission(ctx.user.id, TeamPermission.Administrator)))

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
                  Json.obj("error" -> "Team with id or name already exist")))
              case None =>
                env.dataStore.teamRepo
                  .forTenant(ctx.tenant.id)
                  .save(teamToSave)
                  .map(_ => Created(teamToSave.asJson))
            }
      }
    }
  }

  def updateTeam(teamId: String) = DaikokuAction.async(parse.json) { ctx =>
    TeamAdminOrTenantAdminOnly(AuditTrailEvent(
      "@{user.name} has updated team @{team.name} - @{team.id}"))(teamId, ctx) {
      _ =>
        json.TeamFormat.reads(ctx.request.body) match {
          case JsSuccess(newTeam, _) =>
            env.dataStore.teamRepo
              .forTenant(ctx.tenant.id)
              .findByIdNotDeleted(teamId)
              .flatMap {
                case Some(team) if team.`type` == TeamType.Admin =>
                  FastFuture.successful(Forbidden(Json.obj(
                    "error" -> "You're not authorized to update this team")))
                case Some(team) if team.`type` == TeamType.Personal =>
                  FastFuture.successful(Forbidden(Json.obj(
                    "error" -> "You're not authorized to update this team")))
                case Some(team) =>
                  ctx.setCtxValue("team.id", team.id)
                  ctx.setCtxValue("team.name", team.name)
                  val teamToSave =
                    if (ctx.user.isDaikokuAdmin || ctx.isTenantAdmin) newTeam
                    else
                      newTeam.copy(metadata = team.metadata,
                                   apisCreationPermission =
                                     team.apisCreationPermission)
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
    TenantAdminOnly(
      AuditTrailEvent(
        s"@{user.name} has deleted team @{team.name} - @{team.id}"))(
      ctx.tenant.id.value,
      ctx) { (tenant, team) =>
      env.dataStore.teamRepo.forTenant(ctx.tenant.id).findById(teamId) flatMap {
        case Some(team) if team.`type` == TeamType.Admin =>
          FastFuture.successful(
            Forbidden(
              Json.obj("error" -> "You're not authorized to delete this team")))
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
            team = Some(team.id),
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
            _ <- Future.sequence(admins.map(admin => {
              implicit val language: String = admin.defaultLanguage.getOrElse(
                ctx.tenant.defaultLanguage.getOrElse("en"))
              (for {
                title <- translator.translate("mail.team.access.title",
                                              ctx.tenant)
                body <- translator.translate(
                  "mail.team.access.body",
                  ctx.tenant,
                  Map(
                    "user" -> ctx.user.name,
                    "teamName" -> team.name,
                    "link" -> env.getDaikokuUrl(ctx.tenant, "/notifications")
                  ))
              } yield {
                ctx.tenant.mailer
                  .send(title, Seq(admin.email), body, ctx.tenant)
              }).flatten
            }))
          } yield {
            Ok(Json.obj("done" -> saved))
          }
        case None =>
          Future.successful(NotFound(Json.obj("error" -> "Team not found")))
      }
    }
  }

  def pendingMembersOfTeam(teamId: String) = DaikokuAction.async { ctx =>
    TeamAdminOrTenantAdminOnly(AuditTrailEvent(
      s"@{user.name} has accessed list of addable members to team @{team.name} - @{team.id}"))(
      teamId,
      ctx) { _ =>
      for {
        pendingNotif <- env.dataStore.notificationRepo
          .forTenant(ctx.tenant)
          .find(
            Json.obj(
              "status.status" -> NotificationStatus.Pending.toString,
              "action.team" -> teamId,
              "action.type" -> "TeamInvitation"
            ))
        pendingUsersId = pendingNotif
          .map(_.action)
          .map(_.asInstanceOf[NotificationAction.TeamInvitation])
          .map(_.user)
        pendingUsers <- env.dataStore.userRepo.findNotDeleted(
          Json.obj(
            "_id" -> Json.obj("$in" -> JsArray(pendingUsersId.map(_.asJson)))))
      } yield {
        Ok(
          Json.obj(
            "pendingUsers" -> JsArray(pendingUsers.map(_.asSimpleJson))
          ))
      }
    }
  }

  def removeMemberFromTeam(teamId: String, memberId: String) =
    DaikokuAction.async { ctx =>
      TeamAdminOrTenantAdminOnly(AuditTrailEvent(
        s"@{user.name} has removed members from team @{team.name} - @{team.id}"))(
        teamId,
        ctx) { team =>
        team.`type` match {
          case TeamType.Personal =>
            FastFuture.successful(
              Conflict(Json.obj(
                "error" -> "Team type doesn't accept to remove members")))
          case TeamType.Admin =>
            FastFuture.successful(Forbidden(Json.obj(
              "error" -> "Team type doesn't accept to remove members from this way")))
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
      TeamAdminOrTenantAdminOnly(
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
            FastFuture.successful(Forbidden(Json.obj(
              "error" -> "Team type doesn't accept to add members from this way")))
          case TeamType.Organization =>
            val members = (ctx.request.body \ "members").as[JsArray]
            Source(members.value.toList)
              .mapAsync(5)(member =>
                addMemberToTeam(team, member.as[String], ctx))
              .runWith(Sink.seq[UserId])
              .map(
                users =>
                  Ok(
                    Json.obj("done" -> true,
                             "team" -> team.asJson,
                             "pendingUsers" -> JsArray(users.map(_.asJson)))))
        }
      }
  }

  def addMemberToTeam(team: Team,
                      member: String,
                      ctx: DaikokuActionContext[JsValue]): Future[UserId] = {
    import cats.implicits._

    val userId = UserId(member)

    val notification = Notification(
      id = NotificationId(BSONObjectID.generate().stringify),
      tenant = ctx.tenant.id,
      team = None,
      sender = ctx.user,
      action = NotificationAction.TeamInvitation(team.id, userId)
    )

    for {
      maybeUser <- env.dataStore.userRepo.findByIdNotDeleted(userId)
      _ <- env.dataStore.notificationRepo
        .forTenant(ctx.tenant)
        .save(notification)
      _ <- maybeUser.traverse(user => {
        implicit val lang: String = user.defaultLanguage
          .orElse(ctx.tenant.defaultLanguage)
          .getOrElse("en")

        (for {
          title <- translator.translate("mail.team.invitation.title",
                                        ctx.tenant)
          body <- translator.translate(
            "mail.team.invitation.body",
            ctx.tenant,
            Map("user" -> ctx.user.name,
                "teamName" -> team.name,
                "link" -> env.getDaikokuUrl(ctx.tenant, "/notifications")))
        } yield {
          ctx.tenant.mailer.send(title, Seq(user.email), body, ctx.tenant)
        }).flatten
      })
    } yield userId
  }

  def addUncheckedMembersToTeam(teamId: String) =
    DaikokuAction.async(parse.json) { ctx =>
      TeamAdminOrTenantAdminOnly(AuditTrailEvent(
        s"@{user.name} has invited new members to team @{team.name} - @{team.id}"))(
        teamId,
        ctx) { team =>
        team.`type` match {
          case TeamType.Personal =>
            FastFuture.successful(
              Conflict(
                Json.obj("error" -> "Team type doesn't accept to add members")))
          case TeamType.Admin =>
            FastFuture.successful(Forbidden(Json.obj(
              "error" -> "Team type doesn't accept to add members from this way")))
          case TeamType.Organization =>
            val email = (ctx.request.body \ "email").as[String]
            sendInvitationToUser(team, email, ctx)
        }
      }
    }

  def sendInvitationToUser(
      team: Team,
      email: String,
      ctx: DaikokuActionContext[JsValue]): Future[Result] = {
    import fr.maif.otoroshi.daikoku.utils.RequestImplicits._

    def createInvitedUser(team: String, notificationId: String) = User(
      id = UserId(BSONObjectID.generate().stringify),
      tenants = Set(ctx.tenant.id),
      origins = Set(ctx.tenant.authProvider),
      name = "invited user",
      email = email,
      password = Some(BCrypt.hashpw("invited-user-password", BCrypt.gensalt())),
      lastTenant = Some(ctx.tenant.id),
      personalToken = Some(IdGenerator.token(32)),
      defaultLanguage = None,
      invitation = Some(
        UserInvitation(registered = false,
                       createdAt = DateTime.now(),
                       token = IdGenerator.token(128),
                       team = team,
                       notificationId = notificationId))
    )

    env.dataStore.userRepo
      .findOne(Json.obj("email" -> email))
      .flatMap {
        case Some(user) =>
          addMemberToTeam(team, user.id.value, ctx).flatMap { _ =>
            FastFuture.successful(Ok(Json.obj("done" -> true)))
          }
        case None =>
          val notificationId = NotificationId(BSONObjectID.generate().stringify)
          val invitedUser = createInvitedUser(team.name, notificationId.value)
          env.dataStore.userRepo
            .save(invitedUser)
            .flatMap {
              case true =>
                implicit val lang: Lang = Lang("en")
                val tenant = ctx.tenant

                env.dataStore.notificationRepo
                  .forTenant(ctx.tenant)
                  .save(
                    Notification(
                      id = notificationId,
                      tenant = ctx.tenant.id,
                      team = None,
                      sender = ctx.user,
                      action = NotificationAction.TeamInvitation(team.id,
                                                                 invitedUser.id)
                    ))
                  .flatMap {
                    case true =>
                      implicit val language: String =
                        tenant.defaultLanguage.getOrElse("en")
                      tenant.mailer
                        .send(
                          s"Join ${team.name}",
                          Seq(email),
                          s"""
                             |<p><b>${ctx.user.name}</b> asked you to join <b>${team.name}</b></p>
                             |
                             |<p>Please click on the following link to join this team.</p>
                             |
                             |<a href="${ctx.request.theProtocol}://${ctx.request.theHost}/join?token=${invitedUser.invitation.get.token}">Click to join the team</a>
                             |
                          """.stripMargin,
                          tenant
                        )
                        .flatMap { _ =>
                          FastFuture.successful(
                            Created(Json.obj("done" -> true)))
                        }
                    case false =>
                      FastFuture.successful(BadRequest(
                        Json.obj("error" -> "Failed to send invitation")))
                  }
              case false =>
                FastFuture.successful(
                  BadRequest(Json.obj("error" -> "Failed to invit user")))
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
              Conflict(Json.obj(
                "error" -> "Team type doesn't accept to update permission")))
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
          case None       => Left(NotFound(Json.obj("error" -> "User not found")))
          case Some(user) => Left(Ok(user.asSimpleJson))
        }
      case _ =>
        FastFuture.successful(
          Left(NotFound(Json.obj("error" -> "Member is not part of the team"))))
    }
  }

  def membersOfTeam(teamId: String) = DaikokuAction.async { ctx =>
    TeamAdminOrTenantAdminOnly(AuditTrailEvent(
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
        Left(
          Ok(
            team.asJson.as[JsObject] ++ Json.obj(
              "apisCount" -> apis.size,
              "subscriptionsCount" -> subscriptions.size,
              "notificationCount" -> notifications.size
            )
          ))
      }
    }
  }

  def tenantAdminTeam() = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(
      s"@{user.name} has accessed the tenant team for tenant @{tenant.name}"))(
      ctx) {
      env.dataStore.teamRepo
        .forTenant(ctx.tenant)
        .findOne(Json.obj("type" -> TeamType.Admin.name))
        .map {
          case Some(team) => Ok(team.asSimpleJson)
          case None       => NotFound(Json.obj("error" -> "Team admin not found"))
        }
    }
  }

  def checkUser(teamId: String, email: String) = DaikokuAction.async { ctx =>
    TeamAdminOnly(
      AuditTrailEvent(
        "@{user.name} has find User with many attributes (@{u.id})"))(teamId,
                                                                      ctx) {
      _ =>
        LdapSupport.existsUser(email, ctx.tenant).map {
          case (false, err)    => BadRequest(Json.obj("error" -> err))
          case (true, message) => Ok(Json.obj("message" -> message))
        }
    }
  }

  def findUserByAttributes(teamId: String) = DaikokuAction.async(parse.json) {
    ctx =>
      TeamAdminOnly(
        AuditTrailEvent(
          "@{user.name} has find User with many attributes (@{u.id})"))(teamId,
                                                                        ctx) {
        _ =>
          env.dataStore.userRepo
            .findOne(
              Json.obj(
                "_deleted" -> false,
              ) ++ (ctx.request.body \ "attributes").as[JsObject])
            .map {
              case Some(user) => Ok(user.asJson)
              case None       => NotFound(Json.obj("error" -> "user not found"))
            }
      }
  }

  def createLDAPUser(teamId: String) = DaikokuAction.async(parse.json) { ctx =>
    TeamAdminOnly(
      AuditTrailEvent("@{user.name} has created LDAP user profile"))(teamId,
                                                                     ctx) { _ =>
      LdapConfig.fromJson(ctx.tenant.authProviderSettings) match {
        case Left(err) =>
          FastFuture.successful(BadRequest(Json.obj("error" -> err.getMessage)))
        case Right(config) =>
          LdapSupport
            .createUser(
              (ctx.request.body \ "email").as[String],
              config.serverUrls.filter(_ => true),
              config,
              ctx.tenant.id,
              env
            )
            .flatMap { res =>
              res
                .map(user => FastFuture.successful(Created(user.asJson)))
                .getOrElse(
                  FastFuture.successful(
                    BadRequest(Json.obj(
                      "error" -> "Failed to create user from LDAP : empty response from createUser"
                    )))
                )
            }
      }
    }
  }

  def removeInvitation(teamId: String, userId: String) = DaikokuAction.async {
    ctx =>
      TeamAdminOrTenantAdminOnly(AuditTrailEvent(
        s"@{user.name} has removed invitation to ${userId} of team @{team.name} - @{team.id}"))(
        teamId,
        ctx) { team =>
        team.`type` match {
          case TeamType.Organization =>
            env.dataStore.userRepo
              .findById(userId)
              .flatMap {
                case Some(user) if user.invitation.isDefined =>
                  env.dataStore.userRepo.deleteById(userId).flatMap {
                    case true =>
                      env.dataStore.notificationRepo
                        .forTenant(ctx.tenant.id)
                        .delete(Json.obj(
                          "status.status" -> NotificationStatus.Pending.toString,
                          "action.team" -> team.id.value,
                          "action.user" -> userId,
                          "action.type" -> "TeamInvitation"
                        ))
                        .flatMap { _ =>
                          FastFuture.successful(Ok(Json.obj("deleted" -> true)))
                        }
                    case false =>
                      FastFuture.successful(BadRequest(Json.obj(
                        "error" -> "An error occurred while deleting the user")))
                  }
                case Some(_) =>
                  FastFuture.successful(
                    BadRequest(Json.obj("error" -> "User isn't invited")))
                case None =>
                  FastFuture.successful(
                    NotFound(Json.obj("error" -> "User not found")))
              }
          case _ =>
            FastFuture.successful(
              BadRequest(
                Json.obj("error" -> "Operation not authorized on this team")))
        }
      }
  }
}
