package fr.maif.otoroshi.daikoku.login

import java.util.concurrent.TimeUnit

import akka.http.scaladsl.util.FastFuture
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.StringImplicits._
import fr.maif.otoroshi.daikoku.utils.{Errors, IdGenerator}
import org.joda.time.DateTime
import play.api.libs.json.Json
import play.api.mvc._
import reactivemongo.bson.BSONObjectID

import scala.concurrent.duration.FiniteDuration
import scala.concurrent.{ExecutionContext, Future}

object OtoroshiIdentityFilter {

  def findUserTeam(tenantId: TenantId, user: User)(
      implicit ec: ExecutionContext,
      env: Env): Future[Option[Team]] = {
    for {
      teamRepo <- env.dataStore.teamRepo.forTenantF(tenantId)
      maybePersonnalTeam <- teamRepo.findOne(
        Json.obj("type" -> TeamType.Personal.name,
                 "users.userId" -> user.id.value,
                 "_deleted" -> false))
      maybePersonnalTeamId = maybePersonnalTeam
        .map(_.id)
        .getOrElse(Team.Default)
      // maybeLastTeam <- teamRepo.findByIdNotDeleted(user.lastTeams.getOrElse(tenantId, maybePersonnalTeamId))
    } yield {
      maybePersonnalTeam
      // maybeLastTeam match {
      //   case Some(_) => maybeLastTeam
      //   case None    => maybePersonnalTeam
      // }
    }
  }

  def apply(env: Env,
            tenant: Tenant,
            nextFilter: RequestHeader => Future[Result],
            request: RequestHeader)(
      implicit ec: ExecutionContext
  ): Future[Result] = {

    val sessionMaxAge =
      tenant.authProviderSettings.\("sessionMaxAge").asOpt[Int].getOrElse(86400)
    val claimSecret = tenant.authProviderSettings.\("claimSecret").as[String]
    val claimHeaderName =
      tenant.authProviderSettings.\("claimHeaderName").as[String]
    val otoroshiJwtAlgo = Algorithm.HMAC512(claimSecret)
    val otoroshiJwtVerifier =
      JWT.require(otoroshiJwtAlgo).acceptLeeway(10).build()

    request.headers.get(claimHeaderName) match {
      case None =>
        Errors.craftResponseResult("Not authorized here",
                                   Results.Unauthorized,
                                   request,
                                   None,
                                   env,
                                   tenant)
      case Some(claim) =>
        val jwt = otoroshiJwtVerifier.verify(claim)
        Option(jwt.getClaim("email")).map(_.asString()) match {
          case None =>
            Errors.craftResponseResult("No email provided",
                                       Results.BadRequest,
                                       request,
                                       None,
                                       env,
                                       tenant)
          case Some(email) =>
            val name: String = Option(jwt.getClaim("name"))
              .flatMap(a => Option(a.asString()))
              .getOrElse("Billy")
            val picture: String = Option(jwt.getClaim("picture"))
              .flatMap(a => Option(a.asString()))
              .getOrElse(email.gravatar)
            val tags: Seq[String] = Option(jwt.getClaim("daikokuTags"))
              .flatMap(a => Option(a.asString()))
              .map(_.split(",").toSeq)
              .getOrElse(Seq.empty)
            val isDaikokuAdmin: Boolean =
              Option(jwt.getClaim("daikokuAdmin"))
                .flatMap(a => Option(a.asString()))
                .exists(_.toBoolean)

            def createSessionFromOtoroshi(maybeUser: Option[User] = None,
                                          maybeSession: Option[UserSession] =
                                            None): Future[Result] = {
              maybeUser match {
                case None =>
                  env.dataStore.userRepo
                    .findOne(Json.obj("_deleted" -> false, "email" -> email))
                    .flatMap {
                      case None =>
                        val userId = UserId(BSONObjectID.generate().stringify)
                        val defaultUser = User(
                          id = userId,
                          tenants = Set(tenant.id),
                          origins = Set(AuthProvider.Otoroshi),
                          name = name,
                          email = email,
                          picture = picture,
                          isDaikokuAdmin = isDaikokuAdmin,
                          lastTenant = Some(tenant.id),
                          personalToken = Some(IdGenerator.token(32)),
                          defaultLanguage = None
                        )
                        val newTeam = Team(
                          id = TeamId(BSONObjectID.generate().stringify),
                          tenant = tenant.id,
                          `type` = TeamType.Personal,
                          name = s"$name",
                          description = s"The personal team of $name",
                          users = Set(UserWithPermission(userId, Administrator)),
                          authorizedOtoroshiGroups = Set.empty
                        )
                        val session = maybeSession.getOrElse(
                          UserSession(
                            id = DatastoreId(BSONObjectID.generate().stringify),
                            userId = defaultUser.id,
                            userName = defaultUser.name,
                            userEmail = defaultUser.email,
                            impersonatorId = None,
                            impersonatorName = None,
                            impersonatorEmail = None,
                            impersonatorSessionId = None,
                            sessionId = UserSessionId(IdGenerator.token),
                            created = DateTime.now(),
                            expires = DateTime.now().plusSeconds(sessionMaxAge),
                            ttl =
                              FiniteDuration(sessionMaxAge, TimeUnit.SECONDS)
                          ))
                        for {
                          _ <- env.dataStore.teamRepo
                            .forTenant(tenant.id)
                            .save(newTeam)
                          _ <- env.dataStore.userRepo.save(defaultUser)
                          _ <- env.dataStore.userSessionRepo.save(session)
                          impersonator <- session.impersonatorId
                            .map(id =>
                              env.dataStore.userRepo.findByIdNotDeleted(id))
                            .getOrElse(FastFuture.successful(None))
                          rr <- nextFilter(
                            request
                              .addAttr(IdentityAttrs.TeamKey, newTeam)
                              .addAttr(IdentityAttrs.UserKey, defaultUser) //not tenant admin because new user
                              .addAttr(IdentityAttrs.ImpersonatorKey,
                                       impersonator)
                              .addAttr(IdentityAttrs.TenantKey, tenant)
                              .addAttr(IdentityAttrs.SessionKey, session)
                          )
                          r <- FastFuture.successful(
                            rr.removingFromSession("sessionId")(request)
                              .withSession(
                                "sessionId" -> session.sessionId.value))
                        } yield {
                          r
                        }
                      case Some(u) =>
                        val updatedTeam = Team(
                          id = TeamId(BSONObjectID.generate().stringify),
                          tenant = tenant.id,
                          `type` = TeamType.Personal,
                          name = s"$name",
                          description = s"The personal team of $name",
                          users = Set(UserWithPermission(u.id, Administrator)),
                          authorizedOtoroshiGroups = Set.empty
                        )
                        val session = maybeSession.getOrElse(
                          UserSession(
                            id = DatastoreId(BSONObjectID.generate().stringify),
                            userId = u.id,
                            userName = u.name,
                            userEmail = u.email,
                            impersonatorId = None,
                            impersonatorName = None,
                            impersonatorEmail = None,
                            impersonatorSessionId = None,
                            sessionId = UserSessionId(IdGenerator.token),
                            created = DateTime.now(),
                            expires = DateTime.now().plusSeconds(sessionMaxAge),
                            ttl =
                              FiniteDuration(sessionMaxAge, TimeUnit.SECONDS)
                          ))
                        val updatedUser = u
                        for {
                          tenantTeam <- env.dataStore.teamRepo
                            .forTenant(tenant)
                            .findNotDeleted(Json.obj("type" -> "Admin"))
                          userTeamOpt <- findUserTeam(tenant.id, updatedUser)(
                            ec,
                            env)
                          userTeam <- if (userTeamOpt.isDefined)
                            FastFuture.successful(userTeamOpt.get)
                          else
                            env.dataStore.teamRepo
                              .forTenant(tenant.id)
                              .save(updatedTeam)
                              .map(_ => updatedTeam)
                          _ <- env.dataStore.userRepo.save(updatedUser)
                          _ <- env.dataStore.userSessionRepo.save(session)
                          impersonator <- session.impersonatorId
                            .map(id =>
                              env.dataStore.userRepo.findByIdNotDeleted(id))
                            .getOrElse(FastFuture.successful(None))
                          rr <- nextFilter(
                            request
                              .addAttr(IdentityAttrs.TeamKey, userTeam)
                              .addAttr(IdentityAttrs.UserKey, updatedUser)
                              .addAttr(
                                IdentityAttrs.TenantAdminKey,
                                tenantTeam.exists(t =>
                                  t.users.exists(u =>
                                    u.userId == updatedUser.id && u.teamPermission == TeamPermission.Administrator)))
                              .addAttr(IdentityAttrs.ImpersonatorKey,
                                       impersonator)
                              .addAttr(IdentityAttrs.TenantKey, tenant)
                              .addAttr(IdentityAttrs.SessionKey, session)
                          )
                          r <- FastFuture.successful(
                            rr.removingFromSession("sessionId")(request)
                              .withSession(
                                "sessionId" -> session.sessionId.value))
                        } yield {
                          r
                        }
                    }
                case Some(user) =>
                  val updatedTeam = Team(
                    id = TeamId(BSONObjectID.generate().stringify),
                    tenant = tenant.id,
                    `type` = TeamType.Personal,
                    name = s"$name",
                    description = s"The personal team of $name",
                    users = Set(UserWithPermission(user.id, Administrator)),
                    authorizedOtoroshiGroups = Set.empty
                  )
                  val session = maybeSession.getOrElse(
                    UserSession(
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
                      expires = DateTime.now().plusSeconds(sessionMaxAge),
                      ttl = FiniteDuration(sessionMaxAge, TimeUnit.SECONDS)
                    ))
                  val updatedUser =
                    if (session.impersonatorId.isDefined)
                      user.copy()
                    else
                      user.copy(
                        name = name,
                        email = email,
                        picture =
                          if (user.pictureFromProvider) picture
                          else user.picture,
                        tenants = user.tenants + tenant.id,
                        origins = user.origins + AuthProvider.Otoroshi,
                        isDaikokuAdmin = isDaikokuAdmin
                      )
                  for {
                    tenantTeam <- env.dataStore.teamRepo
                      .forTenant(tenant)
                      .findNotDeleted(Json.obj("type" -> "Admin"))
                    userTeamOpt <- findUserTeam(tenant.id, updatedUser)(ec, env)
                    userTeam <- if (userTeamOpt.isDefined)
                      FastFuture.successful(userTeamOpt.get)
                    else
                      env.dataStore.teamRepo
                        .forTenant(tenant.id)
                        .save(updatedTeam)
                        .map(_ => updatedTeam)
                    _ <- env.dataStore.userRepo.save(updatedUser)
                    impersonator <- session.impersonatorId
                      .map(id => env.dataStore.userRepo.findByIdNotDeleted(id))
                      .getOrElse(FastFuture.successful(None))
                    rr <- nextFilter(
                      request
                        .addAttr(IdentityAttrs.TeamKey, userTeam)
                        .addAttr(IdentityAttrs.UserKey, updatedUser)
                        .addAttr(
                          IdentityAttrs.TenantAdminKey,
                          tenantTeam.exists(t =>
                            t.users.exists(u =>
                              u.userId == updatedUser.id && u.teamPermission == TeamPermission.Administrator)))
                        .addAttr(IdentityAttrs.ImpersonatorKey, impersonator)
                        .addAttr(IdentityAttrs.TenantKey, tenant)
                        .addAttr(IdentityAttrs.SessionKey, session)
                    )
                    r <- FastFuture.successful(
                      rr.removingFromSession("sessionId")(request)
                        .withSession("sessionId" -> session.sessionId.value))
                  } yield {
                    r
                  }
              }
            }

            request.session
              .get("sessionId")
              .orElse(request.getQueryString("sessionId")) match {
              case None => createSessionFromOtoroshi()
              case Some(_) =>
                val maybeSession = for {
                  session <- env.dataStore.userSessionRepo
                    .findOne(Json.obj("userEmail" -> email))
                  impersonatedSession <- env.dataStore.userSessionRepo
                    .findOne(Json.obj("impersonatorEmail" -> email))
                } yield {
                  impersonatedSession.orElse(session)
                }

                maybeSession.flatMap {
                  case None => createSessionFromOtoroshi()
                  case Some(session)
                      if session.expires.isBefore(DateTime.now()) =>
                    for {
                      _ <- env.dataStore.userSessionRepo.deleteById(session.id)
                      result <- createSessionFromOtoroshi()
                    } yield result

                  case Some(session)
                      if session.expires.isAfter(DateTime.now()) =>
                    env.dataStore.userRepo
                      .findByIdNotDeleted(session.userId)
                      .flatMap {
                        case None =>
                          createSessionFromOtoroshi(
                            maybeSession = Some(session))
                        case Some(user) =>
                          createSessionFromOtoroshi(
                            maybeUser = Some(user),
                            maybeSession = Some(session))
                      }
                }
            }
        }
    }
  }
}
