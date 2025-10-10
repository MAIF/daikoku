package fr.maif.otoroshi.daikoku.login

import org.apache.pekko.http.scaladsl.util.FastFuture
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.utils.StringImplicits._
import fr.maif.otoroshi.daikoku.utils.{Errors, IdGenerator}
import org.joda.time.DateTime
import play.api.libs.json.{
  Format,
  JsBoolean,
  JsError,
  JsObject,
  JsResult,
  JsSuccess,
  JsValue,
  Json
}
import play.api.mvc._

import java.util.concurrent.TimeUnit
import scala.concurrent.duration.FiniteDuration
import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success, Try}
import scala.jdk.CollectionConverters._

case class OtoroshiUser(
    name: String,
    email: String,
    picture: Option[String],
    metadata: Map[String, JsValue]
)

object OtoroshiUser {
  val fmt = new Format[OtoroshiUser]() {
    override def reads(json: JsValue): JsResult[OtoroshiUser] =
      Try {
        JsSuccess(
          OtoroshiUser(
            name = (json \ "name").as[String],
            email = (json \ "email").as[String],
            picture = (json \ "picture").asOpt[String],
            metadata = (json \ "metadata")
              .asOpt[Map[String, JsValue]]
              .getOrElse(Map.empty)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get

    override def writes(o: OtoroshiUser): JsValue =
      Json.obj(
        "name" -> o.name,
        "email" -> o.email,
        "picture" -> o.picture,
        "metadata" -> o.metadata
      )
  }
}

object OtoroshiIdentityFilter {

  def findUserTeam(tenantId: TenantId, user: User)(implicit
      ec: ExecutionContext,
      env: Env
  ): Future[Option[Team]] = {
    for {
      teamRepo <- env.dataStore.teamRepo.forTenantF(tenantId)
      maybePersonnalTeam <- teamRepo.findOne(
        Json.obj(
          "type" -> TeamType.Personal.name,
          "users.userId" -> user.id.value,
          "_deleted" -> false
        )
      )
      maybePersonnalTeamId =
        maybePersonnalTeam
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

  def apply(
      env: Env,
      tenant: Tenant,
      nextFilter: RequestHeader => Future[Result],
      request: RequestHeader
  )(implicit
      ec: ExecutionContext
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
        Errors.craftResponseResultF(
          "Not authorized here",
          Results.Unauthorized
        )
      case Some(token) =>
        Try(otoroshiJwtVerifier.verify(token)) match {
          case Failure(exception) =>
            Errors.craftResponseResultF(
              "Not authorized here",
              Results.Unauthorized
            )
          case Success(jwt) =>
            Option(jwt.getClaim("user"))
              .flatMap(b => Try(b.toString).toOption)
              .flatMap(b =>
                Try(Json.parse(b).as(OtoroshiUser.fmt)).toOption
              ) match {
              case None =>
                Errors.craftResponseResultF(
                  "No user provided",
                  Results.BadRequest
                )
              case Some(user) =>
                val isDaikokuAdmin: Boolean =
                  user.metadata
                    .get("daikokuAdmin")
                    .exists(s =>
                      s.asOpt[String]
                        .flatMap(_.toBooleanOption)
                        .orElse(s.asOpt[Boolean])
                        .getOrElse(false)
                    )

                def createSessionFromOtoroshi(
                    maybeUser: Option[User] = None,
                    maybeSession: Option[UserSession] = None
                ): Future[Result] = {
                  maybeUser match {
                    case None =>
                      env.dataStore.userRepo
                        .findOne(
                          Json.obj("_deleted" -> false, "email" -> user.email)
                        )
                        .flatMap {
                          case None =>
                            val userId = UserId(IdGenerator.token(32))
                            val defaultUser = User(
                              id = userId,
                              tenants = Set(tenant.id),
                              origins = Set(AuthProvider.Otoroshi),
                              name = user.name,
                              email = user.email,
                              picture =
                                user.picture.getOrElse(user.email.gravatar),
                              isDaikokuAdmin = isDaikokuAdmin,
                              lastTenant = Some(tenant.id),
                              personalToken = Some(IdGenerator.token(32)),
                              defaultLanguage = None
                            )
                            val newTeam = Team(
                              id = TeamId(IdGenerator.token(32)),
                              tenant = tenant.id,
                              `type` = TeamType.Personal,
                              name = s"${user.name}",
                              description =
                                s"The personal team of ${user.name}",
                              users =
                                Set(UserWithPermission(userId, Administrator)),
                              authorizedOtoroshiEntities = None,
                              contact = user.email
                            )
                            val session = maybeSession.getOrElse(
                              UserSession(
                                id = DatastoreId(IdGenerator.token(32)),
                                userId = defaultUser.id,
                                userName = defaultUser.name,
                                userEmail = defaultUser.email,
                                impersonatorId = None,
                                impersonatorName = None,
                                impersonatorEmail = None,
                                impersonatorSessionId = None,
                                sessionId = UserSessionId(IdGenerator.token),
                                created = DateTime.now(),
                                expires =
                                  DateTime.now().plusSeconds(sessionMaxAge),
                                ttl = FiniteDuration(
                                  sessionMaxAge,
                                  TimeUnit.SECONDS
                                )
                              )
                            )
                            for {
                              _ <-
                                env.dataStore.teamRepo
                                  .forTenant(tenant.id)
                                  .save(newTeam)
                              _ <- env.dataStore.userRepo.save(defaultUser)
                              _ <- env.dataStore.userSessionRepo.save(session)
                              impersonator <-
                                session.impersonatorId
                                  .map(id =>
                                    env.dataStore.userRepo
                                      .findByIdNotDeleted(id)
                                  )
                                  .getOrElse(FastFuture.successful(None))
                              rr <- nextFilter(
                                request
                                  .addAttr(IdentityAttrs.TeamKey, newTeam)
                                  .addAttr(
                                    IdentityAttrs.UserKey,
                                    defaultUser
                                  ) //not tenant admin because new user
                                  .addAttr(
                                    IdentityAttrs.ImpersonatorKey,
                                    impersonator
                                  )
                                  .addAttr(IdentityAttrs.TenantKey, tenant)
                                  .addAttr(IdentityAttrs.SessionKey, session)
                              )
                              r <- FastFuture.successful(
                                rr.removingFromSession("sessionId")(request)
                                  .withSession(
                                    "sessionId" -> session.sessionId.value
                                  )
                              )
                            } yield {
                              r
                            }
                          case Some(u) =>
                            val updatedTeam = Team(
                              id = TeamId(IdGenerator.token(32)),
                              tenant = tenant.id,
                              `type` = TeamType.Personal,
                              name = s"${user.name}",
                              description =
                                s"The personal team of ${user.name}",
                              users =
                                Set(UserWithPermission(u.id, Administrator)),
                              authorizedOtoroshiEntities = None,
                              contact = user.email
                            )
                            val session = maybeSession.getOrElse(
                              UserSession(
                                id = DatastoreId(IdGenerator.token(32)),
                                userId = u.id,
                                userName = u.name,
                                userEmail = u.email,
                                impersonatorId = None,
                                impersonatorName = None,
                                impersonatorEmail = None,
                                impersonatorSessionId = None,
                                sessionId = UserSessionId(IdGenerator.token),
                                created = DateTime.now(),
                                expires =
                                  DateTime.now().plusSeconds(sessionMaxAge),
                                ttl = FiniteDuration(
                                  sessionMaxAge,
                                  TimeUnit.SECONDS
                                )
                              )
                            )
                            val updatedUser = u
                            for {
                              tenantTeam <-
                                env.dataStore.teamRepo
                                  .forTenant(tenant)
                                  .findNotDeleted(Json.obj("type" -> "Admin"))
                              userTeamOpt <-
                                findUserTeam(tenant.id, updatedUser)(ec, env)
                              userTeam <-
                                if (userTeamOpt.isDefined)
                                  FastFuture.successful(userTeamOpt.get)
                                else
                                  env.dataStore.teamRepo
                                    .forTenant(tenant.id)
                                    .save(updatedTeam)
                                    .map(_ => updatedTeam)
                              _ <- env.dataStore.userRepo.save(updatedUser)
                              _ <- env.dataStore.userSessionRepo.save(session)
                              impersonator <-
                                session.impersonatorId
                                  .map(id =>
                                    env.dataStore.userRepo
                                      .findByIdNotDeleted(id)
                                  )
                                  .getOrElse(FastFuture.successful(None))
                              rr <- nextFilter(
                                request
                                  .addAttr(IdentityAttrs.TeamKey, userTeam)
                                  .addAttr(IdentityAttrs.UserKey, updatedUser)
                                  .addAttr(
                                    IdentityAttrs.TenantAdminKey,
                                    tenantTeam.exists(t =>
                                      t.users.exists(u =>
                                        u.userId == updatedUser.id && u.teamPermission == TeamPermission.Administrator
                                      )
                                    )
                                  )
                                  .addAttr(
                                    IdentityAttrs.ImpersonatorKey,
                                    impersonator
                                  )
                                  .addAttr(IdentityAttrs.TenantKey, tenant)
                                  .addAttr(IdentityAttrs.SessionKey, session)
                              )
                              r <- FastFuture.successful(
                                rr.removingFromSession("sessionId")(request)
                                  .withSession(
                                    "sessionId" -> session.sessionId.value
                                  )
                              )
                            } yield {
                              r
                            }
                        }
                    case Some(user) =>
                      val updatedTeam = Team(
                        id = TeamId(IdGenerator.token(32)),
                        tenant = tenant.id,
                        `type` = TeamType.Personal,
                        name = s"${user.name}",
                        description = s"The personal team of ${user.name}",
                        users = Set(UserWithPermission(user.id, Administrator)),
                        authorizedOtoroshiEntities = None,
                        contact = user.email
                      )
                      val session = maybeSession.getOrElse(
                        UserSession(
                          id = DatastoreId(IdGenerator.token(32)),
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
                        )
                      )
                      val updatedUser =
                        if (session.impersonatorId.isDefined)
                          user.copy()
                        else
                          user.copy(
                            name = user.name,
                            email = user.email,
                            picture =
                              if (user.pictureFromProvider) user.picture
                              else user.picture,
                            tenants = user.tenants + tenant.id,
                            origins = user.origins + AuthProvider.Otoroshi,
                            isDaikokuAdmin = isDaikokuAdmin
                          )
                      for {
                        tenantTeam <-
                          env.dataStore.teamRepo
                            .forTenant(tenant)
                            .findNotDeleted(Json.obj("type" -> "Admin"))
                        userTeamOpt <-
                          findUserTeam(tenant.id, updatedUser)(ec, env)
                        userTeam <-
                          if (userTeamOpt.isDefined)
                            FastFuture.successful(userTeamOpt.get)
                          else
                            env.dataStore.teamRepo
                              .forTenant(tenant.id)
                              .save(updatedTeam)
                              .map(_ => updatedTeam)
                        _ <- env.dataStore.userRepo.save(updatedUser)
                        impersonator <-
                          session.impersonatorId
                            .map(id =>
                              env.dataStore.userRepo.findByIdNotDeleted(id)
                            )
                            .getOrElse(FastFuture.successful(None))
                        rr <- nextFilter(
                          request
                            .addAttr(IdentityAttrs.TeamKey, userTeam)
                            .addAttr(IdentityAttrs.UserKey, updatedUser)
                            .addAttr(
                              IdentityAttrs.TenantAdminKey,
                              tenantTeam.exists(t =>
                                t.users.exists(u =>
                                  u.userId == updatedUser.id && u.teamPermission == TeamPermission.Administrator
                                )
                              )
                            )
                            .addAttr(
                              IdentityAttrs.ImpersonatorKey,
                              impersonator
                            )
                            .addAttr(IdentityAttrs.TenantKey, tenant)
                            .addAttr(IdentityAttrs.SessionKey, session)
                        )
                        r <- FastFuture.successful(
                          rr.removingFromSession("sessionId")(request)
                            .withSession("sessionId" -> session.sessionId.value)
                        )
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
                      session <-
                        env.dataStore.userSessionRepo
                          .findOne(Json.obj("userEmail" -> user.email))
                      impersonatedSession <-
                        env.dataStore.userSessionRepo
                          .findOne(Json.obj("impersonatorEmail" -> user.email))
                    } yield {
                      impersonatedSession.orElse(session)
                    }

                    maybeSession.flatMap {
                      case Some(session)
                          if session.expires.isBefore(DateTime.now()) =>
                        for {
                          _ <-
                            env.dataStore.userSessionRepo.deleteById(session.id)
                          result <- createSessionFromOtoroshi()
                        } yield result

                      case Some(session)
                          if session.expires.isAfter(DateTime.now()) =>
                        env.dataStore.userRepo
                          .findByIdNotDeleted(session.userId)
                          .flatMap {
                            case None =>
                              createSessionFromOtoroshi(
                                maybeSession = Some(session)
                              )
                            case Some(user) =>
                              createSessionFromOtoroshi(
                                maybeUser = Some(user),
                                maybeSession = Some(session)
                              )
                          }
                      case _ => createSessionFromOtoroshi()
                    }
                }
            }
        }
    }
  }
}
