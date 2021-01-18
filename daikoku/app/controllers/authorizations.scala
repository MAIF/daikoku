package fr.maif.otoroshi.daikoku.ctrls

import java.util.concurrent.TimeUnit

import akka.http.scaladsl.util.FastFuture
import fr.maif.otoroshi.daikoku.actions.{
  DaikokuActionContext,
  DaikokuTenantActionContext
}
import fr.maif.otoroshi.daikoku.audit.{AuditEvent, AuthorizationLevel}
import fr.maif.otoroshi.daikoku.domain.TeamPermission._
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.login.AuthProvider
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import org.joda.time.DateTime
import play.api.libs.json.Json
import play.api.mvc.{Result, Results}
import reactivemongo.bson.BSONObjectID

import scala.collection.concurrent.TrieMap
import scala.concurrent.duration.FiniteDuration
import scala.concurrent.{ExecutionContext, Future}

object authorizations {
  def isTeamApiKeyVisible(team: Team, user: User)(implicit env: Env): Boolean =
    team.apiKeyVisibility match {
      case Some(TeamApiKeyVisibility.Administrator) =>
        team.users
          .find(_.userId == user.id)
          .forall(_.teamPermission == TeamPermission.Administrator)
      case Some(TeamApiKeyVisibility.ApiEditor) =>
        team.users
          .find(_.userId == user.id)
          .forall(_.teamPermission != TeamPermission.TeamUser)
      case Some(TeamApiKeyVisibility.User) => true
      case None =>
        env.config.defaultApiKeyVisibility match {
          case TeamApiKeyVisibility.Administrator =>
            team.users
              .find(_.userId == user.id)
              .forall(_.teamPermission == TeamPermission.Administrator)
          case TeamApiKeyVisibility.ApiEditor =>
            team.users
              .find(_.userId == user.id)
              .forall(_.teamPermission != TeamPermission.TeamUser)
          case TeamApiKeyVisibility.User => true
        }
    }

  object sync {
    def UberPublicAccess[T](audit: AuditEvent)(ctx: DaikokuActionContext[T])(
        f: => Result)(implicit ec: ExecutionContext,
                      env: Env): Future[Result] = {
      async.UberPublicUserAccess(audit)(ctx) {
        FastFuture.successful(f)
      }
    }

    def PublicUserAccess[T](audit: AuditEvent)(ctx: DaikokuActionContext[T])(
        f: => Result)(implicit ec: ExecutionContext,
                      env: Env): Future[Result] = {
      async.PublicUserAccess(audit)(ctx) {
        FastFuture.successful(f)
      }
    }

    def DaikokuAdminOnly[T](audit: AuditEvent)(ctx: DaikokuActionContext[T])(
        f: => Result)(implicit ec: ExecutionContext,
                      env: Env): Future[Result] = {
      async.DaikokuAdminOnly(audit)(ctx) {
        FastFuture.successful(f)
      }
    }

    def TeamMemberOnly[T](audit: AuditEvent)(
        teamId: String,
        ctx: DaikokuActionContext[T])(f: Team => Result)(
        implicit ec: ExecutionContext,
        env: Env): Future[Result] = {
      async.TeamMemberOnly(audit)(teamId, ctx) { team =>
        FastFuture.successful(f(team))
      }
    }

    def TeamApiEditorOnly[T](audit: AuditEvent)(
        teamId: String,
        ctx: DaikokuActionContext[T])(f: Team => Result)(
        implicit ec: ExecutionContext,
        env: Env): Future[Result] = {
      async.TeamApiEditorOnly(audit)(teamId, ctx) { team =>
        FastFuture.successful(f(team))
      }
    }

    def TeamAdminOnly[T](audit: AuditEvent)(
        teamId: String,
        ctx: DaikokuActionContext[T])(f: Team => Result)(
        implicit ec: ExecutionContext,
        env: Env): Future[Result] = {
      async.TeamAdminOnly(audit)(teamId, ctx) { team =>
        FastFuture.successful(f(team))
      }
    }

    def TeamAdminOrTenantAdminOnly[T](audit: AuditEvent)(
        teamId: String,
        ctx: DaikokuActionContext[T])(f: Team => Result)(
        implicit ec: ExecutionContext,
        env: Env): Future[Result] = {
      async.TeamAdminOrTenantAdminOnly(audit)(teamId, ctx) { team =>
        FastFuture.successful(f(team))
      }
    }

    def TenantAdminOnly[T](audit: AuditEvent)(
        tenantId: String,
        ctx: DaikokuActionContext[T])(f: (Tenant, Team) => Result)(
        implicit ec: ExecutionContext,
        env: Env): Future[Result] = {
      async.TenantAdminOnly(audit)(tenantId, ctx) { (tenant, team) =>
        FastFuture.successful(f(tenant, team))
      }
    }
  }

  object async {
    def UberPublicUserAccess[T](audit: AuditEvent)(
        ctx: DaikokuActionContext[T])(f: => Future[Result])(
        implicit ec: ExecutionContext,
        env: Env): Future[Result] = {
      if (ctx.user.isDaikokuAdmin) {
        f.andThen {
          case _ =>
            audit.logTenantAuditEvent(ctx.tenant,
                                      ctx.user,
                                      ctx.session,
                                      ctx.request,
                                      ctx.ctx,
                                      AuthorizationLevel.AuthorizedDaikokuAdmin)
        }
      } else if (ctx.user.tenants.contains(ctx.tenant.id)) {
        f.andThen {
          case _ =>
            audit.logTenantAuditEvent(ctx.tenant,
                                      ctx.user,
                                      ctx.session,
                                      ctx.request,
                                      ctx.ctx,
                                      AuthorizationLevel.AuthorizedUberPublic)
        }
      } else {
        audit.logTenantAuditEvent(ctx.tenant,
                                  ctx.user,
                                  ctx.session,
                                  ctx.request,
                                  ctx.ctx,
                                  AuthorizationLevel.NotAuthorized)
        FastFuture.successful(
          Results.Unauthorized(
            Json.obj("error" -> "You're not authorized here")))
      }
    }

    def PublicUserAccess[T](audit: AuditEvent)(ctx: DaikokuActionContext[T])(
        f: => Future[Result])(implicit ec: ExecutionContext,
                              env: Env): Future[Result] = {
      if (ctx.user.isDaikokuAdmin) {
        f.andThen {
          case _ =>
            audit.logTenantAuditEvent(ctx.tenant,
                                      ctx.user,
                                      ctx.session,
                                      ctx.request,
                                      ctx.ctx,
                                      AuthorizationLevel.AuthorizedDaikokuAdmin)
        }
      } else if (ctx.user.tenants.contains(ctx.tenant.id)) {
        f.andThen {
          case _ =>
            audit.logTenantAuditEvent(ctx.tenant,
                                      ctx.user,
                                      ctx.session,
                                      ctx.request,
                                      ctx.ctx,
                                      AuthorizationLevel.AuthorizedPublic)
        }
      } else {
        audit.logTenantAuditEvent(ctx.tenant,
                                  ctx.user,
                                  ctx.session,
                                  ctx.request,
                                  ctx.ctx,
                                  AuthorizationLevel.NotAuthorized)
        FastFuture.successful(
          Results.Unauthorized(
            Json.obj("error" -> "You're not authorized here")))
      }
    }

    def PublicUserAccessTenant[T](audit: AuditEvent)(
        ctx: DaikokuTenantActionContext[T])(f: => Future[Result])(
        implicit ec: ExecutionContext,
        env: Env): Future[Result] = {
      val user = User(
        id = UserId(IdGenerator.uuid),
        tenants = Set(ctx.tenant.id),
        origins = Set.empty[AuthProvider],
        name = "Integration API",
        email = "integration@daikoku.io",
        personalToken = None,
        lastTenant = None,
        defaultLanguage = None
      )
      val session = UserSession(
        id = DatastoreId(BSONObjectID.generate().stringify),
        userId = user.id,
        userName = user.name,
        userEmail = user.email,
        impersonatorId = None,
        impersonatorName = None,
        impersonatorEmail = None,
        impersonatorSessionId = None,
        sessionId = UserSessionId(IdGenerator.token),
        created = DateTime.now(),
        expires = DateTime.now().plusSeconds(10),
        ttl = FiniteDuration(10, TimeUnit.SECONDS)
      )
      f.andThen {
        case _ =>
          audit.logTenantAuditEvent(ctx.tenant,
                                    user,
                                    session,
                                    ctx.request,
                                    new TrieMap[String, String],
                                    AuthorizationLevel.AuthorizedPublic)
      }
    }

    def DaikokuAdminOnly[T](audit: AuditEvent)(ctx: DaikokuActionContext[T])(
        f: => Future[Result])(implicit ec: ExecutionContext,
                              env: Env): Future[Result] = {
      if (ctx.user.isDaikokuAdmin) {
        f.andThen {
          case _ =>
            audit.logTenantAuditEvent(ctx.tenant,
                                      ctx.user,
                                      ctx.session,
                                      ctx.request,
                                      ctx.ctx,
                                      AuthorizationLevel.AuthorizedDaikokuAdmin)
        }
      } else {
        audit.logTenantAuditEvent(ctx.tenant,
                                  ctx.user,
                                  ctx.session,
                                  ctx.request,
                                  ctx.ctx,
                                  AuthorizationLevel.NotAuthorized)
        FastFuture.successful(
          Results.Unauthorized(
            Json.obj("error" -> "You're not a Daikoku admin")))
      }
    }

    def DaikokuAdminOrSelf[T](audit: AuditEvent)(
        userId: UserId,
        ctx: DaikokuActionContext[T])(f: => Future[Result])(
        implicit ec: ExecutionContext,
        env: Env): Future[Result] = {
      if (ctx.user.isDaikokuAdmin) {
        f.andThen {
          case _ =>
            audit.logTenantAuditEvent(ctx.tenant,
                                      ctx.user,
                                      ctx.session,
                                      ctx.request,
                                      ctx.ctx,
                                      AuthorizationLevel.AuthorizedDaikokuAdmin)
        }
      } else if (ctx.user.id == userId) {
        f.andThen {
          case _ =>
            audit.logTenantAuditEvent(ctx.tenant,
                                      ctx.user,
                                      ctx.session,
                                      ctx.request,
                                      ctx.ctx,
                                      AuthorizationLevel.AuthorizedSelf)
        }
      } else {
        audit.logTenantAuditEvent(ctx.tenant,
                                  ctx.user,
                                  ctx.session,
                                  ctx.request,
                                  ctx.ctx,
                                  AuthorizationLevel.NotAuthorized)
        FastFuture.successful(
          Results.Unauthorized(
            Json.obj("error" -> "You're not a Daikoku admin")))
      }
    }

    def DaikokuImpersonatorAdminOnly[T](audit: AuditEvent)(
        ctx: DaikokuActionContext[T])(f: => Future[Result])(
        implicit ec: ExecutionContext,
        env: Env): Future[Result] = {
      ctx.impersonator match {
        case None =>
          audit.logTenantAuditEvent(ctx.tenant,
                                    ctx.user,
                                    ctx.session,
                                    ctx.request,
                                    ctx.ctx,
                                    AuthorizationLevel.NotAuthorized)
          FastFuture.successful(
            Results.Unauthorized(
              Json.obj("error" -> "You're not a Daikoku admin")))
        case Some(user) =>
          if (user.isDaikokuAdmin) {
            f.andThen {
              case _ =>
                audit.logTenantAuditEvent(
                  ctx.tenant,
                  user,
                  ctx.session,
                  ctx.request,
                  ctx.ctx,
                  AuthorizationLevel.AuthorizedDaikokuAdmin)
            }
          } else {
            audit.logTenantAuditEvent(ctx.tenant,
                                      ctx.user,
                                      ctx.session,
                                      ctx.request,
                                      ctx.ctx,
                                      AuthorizationLevel.NotAuthorized)
            FastFuture.successful(
              Results.Unauthorized(
                Json.obj("error" -> "You're not a Daikoku admin")))
          }
      }
    }

    def TenantAdminOnly[T](audit: AuditEvent)(
        tenantId: String,
        ctx: DaikokuActionContext[T])(f: (Tenant, Team) => Future[Result])(
        implicit ec: ExecutionContext,
        env: Env): Future[Result] = {
      env.dataStore.tenantRepo
        .findByIdOrHrId(tenantId)
        .flatMap {
          case Some(tenant) =>
            env.dataStore.teamRepo
              .forTenant(tenant)
              .findOneNotDeleted(Json.obj("type" -> "Admin"))
              .flatMap {
                case Some(team) if ctx.user.isDaikokuAdmin =>
                  ctx.setCtxValue("tenant.id", tenant.id)
                  ctx.setCtxValue("tenant.name", tenant.name)
                  f(tenant, team).andThen {
                    case _ =>
                      audit.logTenantAuditEvent(
                        ctx.tenant,
                        ctx.user,
                        ctx.session,
                        ctx.request,
                        ctx.ctx,
                        AuthorizationLevel.AuthorizedDaikokuAdmin)
                  }
                case Some(team)
                    if team.users.exists(u =>
                      u.userId == ctx.user.id && u.teamPermission == Administrator) =>
                  ctx.setCtxValue("tenant.id", tenant.id)
                  ctx.setCtxValue("tenant.name", tenant.name)
                  f(tenant, team).andThen {
                    case _ =>
                      audit.logTenantAuditEvent(
                        ctx.tenant,
                        ctx.user,
                        ctx.session,
                        ctx.request,
                        ctx.ctx,
                        AuthorizationLevel.AuthorizedTenantAdmin)
                  }
                case Some(team)
                    if !team.users.exists(u =>
                      u.userId == ctx.user.id && u.teamPermission == Administrator) =>
                  ctx.setCtxValue("team.id", tenant.id)
                  ctx.setCtxValue("team.name", tenant.name)
                  audit.logTenantAuditEvent(ctx.tenant,
                                            ctx.user,
                                            ctx.session,
                                            ctx.request,
                                            ctx.ctx,
                                            AuthorizationLevel.NotAuthorized)
                  FastFuture.successful(Results.Forbidden(
                    Json.obj("error" -> "You're not admin for this tenant")))
                case _ =>
                  audit.logTenantAuditEvent(ctx.tenant,
                                            ctx.user,
                                            ctx.session,
                                            ctx.request,
                                            ctx.ctx,
                                            AuthorizationLevel.NotAuthorized)
                  FastFuture.successful(Results.NotFound(Json.obj(
                    "error" -> "Tenant admin team not found, please contact your administrator")))
              }
          case None =>
            audit.logTenantAuditEvent(ctx.tenant,
                                      ctx.user,
                                      ctx.session,
                                      ctx.request,
                                      ctx.ctx,
                                      AuthorizationLevel.NotAuthorized)
            FastFuture.successful(
              Results.NotFound(Json.obj("error" -> "Tenant not found")))
        }

    }

    def TeamMemberOnly[T](audit: AuditEvent)(
        teamId: String,
        ctx: DaikokuActionContext[T])(f: Team => Future[Result])(
        implicit ec: ExecutionContext,
        env: Env): Future[Result] = {
      env.dataStore.teamRepo
        .forTenant(ctx.tenant.id)
        .findByIdOrHrId(teamId)
        .flatMap {
          case Some(team) if ctx.user.isDaikokuAdmin =>
            ctx.setCtxValue("team.id", team.id)
            ctx.setCtxValue("team.name", team.name)
            f(team).andThen {
              case _ =>
                audit.logTenantAuditEvent(
                  ctx.tenant,
                  ctx.user,
                  ctx.session,
                  ctx.request,
                  ctx.ctx,
                  AuthorizationLevel.AuthorizedDaikokuAdmin)
            }
          case Some(team)
              if ctx.user.tenants.contains(ctx.tenant.id) && team.includeUser(
                ctx.user.id) =>
            ctx.setCtxValue("team.id", team.id)
            ctx.setCtxValue("team.name", team.name)
            f(team).andThen {
              case _ =>
                audit.logTenantAuditEvent(
                  ctx.tenant,
                  ctx.user,
                  ctx.session,
                  ctx.request,
                  ctx.ctx,
                  AuthorizationLevel.AuthorizedTeamMember)
            }
          case Some(team)
              if ctx.user.tenants.contains(ctx.tenant.id) && !team.includeUser(
                ctx.user.id) =>
            ctx.setCtxValue("team.id", team.id)
            ctx.setCtxValue("team.name", team.name)
            audit.logTenantAuditEvent(ctx.tenant,
                                      ctx.user,
                                      ctx.session,
                                      ctx.request,
                                      ctx.ctx,
                                      AuthorizationLevel.NotAuthorized)
            FastFuture.successful(
              Results.Forbidden(
                Json.obj("error" -> "You're not part of the team")))
          case _ =>
            audit.logTenantAuditEvent(ctx.tenant,
                                      ctx.user,
                                      ctx.session,
                                      ctx.request,
                                      ctx.ctx,
                                      AuthorizationLevel.NotAuthorized)
            FastFuture.successful(
              Results.NotFound(Json.obj("error" -> "Team not found")))
        }
    }

    def TeamApiEditorOnly[T](audit: AuditEvent)(
        teamId: String,
        ctx: DaikokuActionContext[T])(f: Team => Future[Result])(
        implicit ec: ExecutionContext,
        env: Env): Future[Result] = {

      def apiCreationPermitted(team: Team) =
        ctx.tenant.creationSecurity.forall {
          case true => team.apisCreationPermission.getOrElse(false)
          case _    => true
        }

      env.dataStore.teamRepo
        .forTenant(ctx.tenant.id)
        .findByIdOrHrId(teamId)
        .flatMap {
          case Some(team) if ctx.user.isDaikokuAdmin =>
            ctx.setCtxValue("team.id", team.id)
            ctx.setCtxValue("team.name", team.name)
            f(team).andThen {
              case _ =>
                audit.logTenantAuditEvent(
                  ctx.tenant,
                  ctx.user,
                  ctx.session,
                  ctx.request,
                  ctx.ctx,
                  AuthorizationLevel.AuthorizedDaikokuAdmin)
            }
          case Some(team) if !apiCreationPermitted(team) =>
            ctx.setCtxValue("team.id", team.id)
            ctx.setCtxValue("team.name", team.name)
            audit.logTenantAuditEvent(ctx.tenant,
                                      ctx.user,
                                      ctx.session,
                                      ctx.request,
                                      ctx.ctx,
                                      AuthorizationLevel.NotAuthorized)
            FastFuture.successful(
              Results.Forbidden(Json.obj("error" -> "You're not authorized")))
          case Some(team)
              if ctx.user.tenants.contains(ctx.tenant.id) &&
                team.users.exists(u =>
                  u.userId == ctx.user.id && u.teamPermission == Administrator) =>
            ctx.setCtxValue("team.id", team.id)
            ctx.setCtxValue("team.name", team.name)
            f(team).andThen {
              case _ =>
                audit.logTenantAuditEvent(
                  ctx.tenant,
                  ctx.user,
                  ctx.session,
                  ctx.request,
                  ctx.ctx,
                  AuthorizationLevel.AuthorizedTeamAdmin)
            }
          case Some(team)
              if ctx.user.tenants.contains(ctx.tenant.id) &&
                team.users.exists(u =>
                  u.userId == ctx.user.id && u.teamPermission == ApiEditor) =>
            ctx.setCtxValue("team.id", team.id)
            ctx.setCtxValue("team.name", team.name)
            f(team).andThen {
              case _ =>
                audit.logTenantAuditEvent(
                  ctx.tenant,
                  ctx.user,
                  ctx.session,
                  ctx.request,
                  ctx.ctx,
                  AuthorizationLevel.AuthorizedTeamApiEditor)
            }
          case Some(team)
              if ctx.user.tenants.contains(ctx.tenant.id) && team.users.exists(
                u => u.userId == ctx.user.id && u.teamPermission == TeamUser) =>
            ctx.setCtxValue("team.id", team.id)
            ctx.setCtxValue("team.name", team.name)
            audit.logTenantAuditEvent(ctx.tenant,
                                      ctx.user,
                                      ctx.session,
                                      ctx.request,
                                      ctx.ctx,
                                      AuthorizationLevel.NotAuthorized)
            FastFuture.successful(
              Results.Forbidden(
                Json.obj("error" -> "You're not a team api editor")))
          case _ =>
            audit.logTenantAuditEvent(ctx.tenant,
                                      ctx.user,
                                      ctx.session,
                                      ctx.request,
                                      ctx.ctx,
                                      AuthorizationLevel.NotAuthorized)
            FastFuture.successful(
              Results.NotFound(Json.obj("error" -> "Team not found")))
        }
    }

    def TeamAdminOnly[T](audit: AuditEvent)(
        teamId: String,
        ctx: DaikokuActionContext[T])(f: Team => Future[Result])(
        implicit ec: ExecutionContext,
        env: Env): Future[Result] = {
      env.dataStore.teamRepo
        .forTenant(ctx.tenant.id)
        .findByIdOrHrId(teamId)
        .flatMap {
          case Some(team) if ctx.user.isDaikokuAdmin =>
            ctx.setCtxValue("team.id", team.id)
            ctx.setCtxValue("team.name", team.name)
            f(team).andThen {
              case _ =>
                audit.logTenantAuditEvent(
                  ctx.tenant,
                  ctx.user,
                  ctx.session,
                  ctx.request,
                  ctx.ctx,
                  AuthorizationLevel.AuthorizedDaikokuAdmin)
            }
          case Some(team)
              if ctx.user.tenants.contains(ctx.tenant.id) && team.includeUser(
                ctx.user.id) && team.admins().contains(ctx.user.id) =>
            ctx.setCtxValue("team.id", team.id)
            ctx.setCtxValue("team.name", team.name)
            f(team).andThen {
              case _ =>
                audit.logTenantAuditEvent(
                  ctx.tenant,
                  ctx.user,
                  ctx.session,
                  ctx.request,
                  ctx.ctx,
                  AuthorizationLevel.AuthorizedTeamAdmin)
            }
          case Some(team)
              if ctx.user.tenants.contains(ctx.tenant.id) && !(team.includeUser(
                ctx.user.id) && team.admins().contains(ctx.user.id)) =>
            ctx.setCtxValue("team.id", team.id)
            ctx.setCtxValue("team.name", team.name)
            audit.logTenantAuditEvent(ctx.tenant,
                                      ctx.user,
                                      ctx.session,
                                      ctx.request,
                                      ctx.ctx,
                                      AuthorizationLevel.NotAuthorized)
            FastFuture.successful(
              Results.Forbidden(Json.obj("error" -> "You're not a team admin")))
          case _ =>
            audit.logTenantAuditEvent(ctx.tenant,
                                      ctx.user,
                                      ctx.session,
                                      ctx.request,
                                      ctx.ctx,
                                      AuthorizationLevel.NotAuthorized)
            FastFuture.successful(
              Results.NotFound(Json.obj("error" -> "Team not found")))
        }
    }

    def TeamApiKeyAction[T](audit: AuditEvent)(
        teamId: String,
        ctx: DaikokuActionContext[T])(f: Team => Future[Result])(
        implicit ec: ExecutionContext,
        env: Env): Future[Result] = {
      env.dataStore.teamRepo
        .forTenant(ctx.tenant.id)
        .findByIdOrHrId(teamId)
        .flatMap {
          case Some(team) if ctx.user.isDaikokuAdmin =>
            ctx.setCtxValue("team.id", team.id)
            ctx.setCtxValue("team.name", team.name)
            f(team).andThen {
              case _ =>
                audit.logTenantAuditEvent(
                  ctx.tenant,
                  ctx.user,
                  ctx.session,
                  ctx.request,
                  ctx.ctx,
                  AuthorizationLevel.AuthorizedDaikokuAdmin)
            }
          case Some(team) if !team.includeUser(ctx.user.id) =>
            audit.logTenantAuditEvent(ctx.tenant,
                                      ctx.user,
                                      ctx.session,
                                      ctx.request,
                                      ctx.ctx,
                                      AuthorizationLevel.NotAuthorized)
            FastFuture.successful(
              Results.Forbidden(
                Json.obj("error" -> "You're not part of the team")))
          case Some(team) =>
            val authorized: Boolean =
              authorizations.isTeamApiKeyVisible(team, ctx.user)
            if (authorized) {
              ctx.setCtxValue("team.id", team.id)
              ctx.setCtxValue("team.name", team.name)
              f(team).andThen {
                case _ =>
                  audit.logTenantAuditEvent(
                    ctx.tenant,
                    ctx.user,
                    ctx.session,
                    ctx.request,
                    ctx.ctx,
                    AuthorizationLevel.AuthorizedTeamMember)
              }
            } else {
              audit.logTenantAuditEvent(ctx.tenant,
                                        ctx.user,
                                        ctx.session,
                                        ctx.request,
                                        ctx.ctx,
                                        AuthorizationLevel.NotAuthorized)
              FastFuture.successful(
                Results.Forbidden(Json.obj("error" -> "Unauthorized action")))
            }
          case _ =>
            audit.logTenantAuditEvent(ctx.tenant,
                                      ctx.user,
                                      ctx.session,
                                      ctx.request,
                                      ctx.ctx,
                                      AuthorizationLevel.NotAuthorized)
            FastFuture.successful(
              Results.NotFound(Json.obj("error" -> "Team not found")))
        }
    }

    def TeamAdminOrTenantAdminOnly[T](audit: AuditEvent)(
        teamId: String,
        ctx: DaikokuActionContext[T])(f: Team => Future[Result])(
        implicit ec: ExecutionContext,
        env: Env): Future[Result] = {

      val result = for {
        team <- env.dataStore.teamRepo
          .forTenant(ctx.tenant.id)
          .findByIdOrHrId(teamId)
        tenantAdminTeam <- env.dataStore.teamRepo
          .forTenant(ctx.tenant)
          .findOneNotDeleted(Json.obj("type" -> "Admin"))
      } yield {
        (team, tenantAdminTeam) match {
          case (Some(team), _) if ctx.user.isDaikokuAdmin =>
            ctx.setCtxValue("team.id", team.id)
            ctx.setCtxValue("team.name", team.name)
            f(team).andThen {
              case _ =>
                audit.logTenantAuditEvent(
                  ctx.tenant,
                  ctx.user,
                  ctx.session,
                  ctx.request,
                  ctx.ctx,
                  AuthorizationLevel.AuthorizedDaikokuAdmin)
            }
          case (Some(team), Some(adminTeam))
              if ctx.tenant.id == team.tenant && adminTeam.users.exists(u =>
                u.userId == ctx.user.id && u.teamPermission == Administrator) =>
            ctx.setCtxValue("team.id", team.id)
            ctx.setCtxValue("team.name", team.name)
            f(team).andThen {
              case _ =>
                audit.logTenantAuditEvent(
                  ctx.tenant,
                  ctx.user,
                  ctx.session,
                  ctx.request,
                  ctx.ctx,
                  AuthorizationLevel.AuthorizedTenantAdmin)
            }

          case (Some(team), _)
              if ctx.user.tenants.contains(ctx.tenant.id) && team.includeUser(
                ctx.user.id) && team.admins().contains(ctx.user.id) =>
            ctx.setCtxValue("team.id", team.id)
            ctx.setCtxValue("team.name", team.name)
            f(team).andThen {
              case _ =>
                audit.logTenantAuditEvent(
                  ctx.tenant,
                  ctx.user,
                  ctx.session,
                  ctx.request,
                  ctx.ctx,
                  AuthorizationLevel.AuthorizedTeamAdmin)
            }
          case (Some(team), _)
              if ctx.user.tenants.contains(ctx.tenant.id) && !(team.includeUser(
                ctx.user.id) && team.admins().contains(ctx.user.id)) =>
            ctx.setCtxValue("team.id", team.id)
            ctx.setCtxValue("team.name", team.name)
            audit.logTenantAuditEvent(ctx.tenant,
                                      ctx.user,
                                      ctx.session,
                                      ctx.request,
                                      ctx.ctx,
                                      AuthorizationLevel.NotAuthorized)
            FastFuture.successful(
              Results.Forbidden(Json.obj("error" -> "You're not a team admin")))
          case _ =>
            audit.logTenantAuditEvent(ctx.tenant,
                                      ctx.user,
                                      ctx.session,
                                      ctx.request,
                                      ctx.ctx,
                                      AuthorizationLevel.NotAuthorized)
            FastFuture.successful(
              Results.NotFound(Json.obj("error" -> "Team not found")))
        }
      }

      result.flatten
    }
  }

}
