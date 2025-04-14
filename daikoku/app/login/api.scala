package fr.maif.otoroshi.daikoku.login

import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.Materializer
import cats.syntax.option._
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.{Env, TenantProvider}
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.utils.{Errors, IdGenerator}
import org.joda.time.DateTime
import play.api.libs.json.{JsString, JsValue, Json}
import play.api.libs.typedmap._
import play.api.mvc._

import java.util.concurrent.TimeUnit
import scala.concurrent.duration.FiniteDuration
import scala.concurrent.{ExecutionContext, Future}

sealed trait AuthProvider extends CanJson[AuthProvider] {
  def name: String
  def asJson: JsValue = JsString(name)
}

object AuthProvider {
  case object Local extends AuthProvider {
    def name: String = "Local"
  }
  // case object LocalWithFIDOU2F extends AuthProvider {
  //   def name: String = "LocalWithFIDOU2F"
  // }
  case object Otoroshi extends AuthProvider {
    def name: String = "Otoroshi"
  }
  case object LDAP extends AuthProvider {
    def name: String = "LDAP"
  }
  case object OAuth2 extends AuthProvider {
    def name: String = "OAuth2"
  }
  val values: Seq[AuthProvider] =
    Seq(Local, Otoroshi, LDAP, OAuth2)
  def apply(name: String): Option[AuthProvider] =
    name.toLowerCase() match {
      case "Local" => Local.some
      case "local" => Local.some
      // case "LocalWithFIDOU2F" => LocalWithFIDOU2F.some
      // case "localwithfidou2f" => LocalWithFIDOU2F.some
      case "Otoroshi" => Otoroshi.some
      case "otoroshi" => Otoroshi.some
      case "LDAP"     => LDAP.some
      case "ldap"     => LDAP.some
      case "OAuth2"   => OAuth2.some
      case "oauth2"   => OAuth2.some
      case _          => None
    }
}

object IdentityAttrs {
  val UserKey: TypedKey[User] = TypedKey.apply[User]("daikoku-user")
  val ImpersonatorKey: TypedKey[Option[User]] =
    TypedKey.apply[Option[User]]("daikoku-impersonator")
  val TenantKey: TypedKey[Tenant] = TypedKey.apply[Tenant]("daikoku-tenant")
  val SessionKey: TypedKey[UserSession] =
    TypedKey.apply[UserSession]("daikoku-session")
  val TeamKey: TypedKey[Team] = TypedKey.apply[Team]("daikoku-team")
  val TenantAdminKey: TypedKey[Boolean] =
    TypedKey.apply[Boolean]("daikoku-tenant-admin")
}

object TenantHelper {
  def extractTenantId(request: RequestHeader)(implicit env: Env): TenantId = {
    request.headers
      .get("Daikoku-Tenant")
      .flatMap(t =>
        Option(
          env.config.tenantJwtVerifier.verify(t).getClaim("value").asString()
        )
      )
      .map(TenantId.apply)
      .getOrElse(Tenant.Default)
  }

  def withTenant(request: RequestHeader, env: Env)(
      f: Tenant => Future[Result]
  )(implicit ec: ExecutionContext): Future[Result] = {

    env.config.tenantProvider match {
      case TenantProvider.Header => {
        val tenantId = TenantHelper.extractTenantId(request)(env)
        env.dataStore.tenantRepo.findByIdNotDeleted(tenantId).flatMap {
          case None =>
            Errors.craftResponseResult(
              "Tenant does not exists (1)",
              Results.NotFound,
              request,
              None,
              env
            )
          case Some(tenant) if !tenant.enabled =>
            Errors.craftResponseResult(
              "Tenant does not exists (2)",
              Results.NotFound,
              request,
              None,
              env
            )
          case Some(tenant) => f(tenant)
        }
      }
      case TenantProvider.Hostname =>
        val host = request.headers
          .get(env.config.tenantHostHeaderKey)
          .orElse(request.headers.get("X-Forwarded-Host"))
          .getOrElse(request.host)
        val domain = if (host.contains(":")) host.split(":").apply(0) else host
        env.dataStore.tenantRepo
          .findOne(
            Json.obj(
              "_deleted" -> false,
              "domain" -> domain
            )
          )
          .flatMap {
            case None =>
              AppLogger.info(
                s"Tenant does not exists - host $host - domain $domain - None"
              )
              Errors.craftResponseResult(
                s"Tenant does not exists (3)",
                Results.NotFound,
                request,
                None,
                env
              )
            case Some(tenant) if !tenant.enabled =>
              AppLogger.info(
                s"Tenant does not exists - host $host - domain $domain - tenant disabled"
              )
              Errors.craftResponseResult(
                "Tenant does not exists (4)",
                Results.NotFound,
                request,
                None,
                env
              )
            case Some(tenant) => f(tenant)
          }
      case TenantProvider.Local =>
        // Try to find user id early, maybe we should cache it then
        val tenantIdF: Future[TenantId] =
          request.session.get("sessionId").orElse(request.getQueryString("sessionId")) match {

            case None =>
              FastFuture.successful(Tenant.Default)
            case Some(sessionId) =>
              env.dataStore.userSessionRepo
                .findOne(Json.obj("sessionId" -> sessionId))
                .flatMap {
                  case Some(session) if !session.expires.isAfterNow =>
                    FastFuture.successful(Tenant.Default)
                  case Some(session) if session.expires.isAfterNow =>
                    env.dataStore.userRepo
                      .findByIdNotDeleted(session.userId)
                      .flatMap {
                        case None =>
                          FastFuture.successful(Tenant.Default)
                        case Some(user) =>
                          user.lastTenant match {
                            case None =>
                              FastFuture.successful(Tenant.Default)
                            case Some(tenantId) =>
                              FastFuture.successful(tenantId)
                          }
                      }
                  case _ =>
                    FastFuture.successful(Tenant.Default)

                }
          }
        tenantIdF
          .flatMap(env.dataStore.tenantRepo.findByIdNotDeleted(_))
          .flatMap {
            case None =>
              Errors.craftResponseResult(
                "Tenant does not exists (5)",
                Results.NotFound,
                request,
                None,
                env
              )
            case Some(tenant) if !tenant.enabled =>
              Errors.craftResponseResult(
                "Tenant does not exists (6)",
                Results.NotFound,
                request,
                None,
                env
              )
            case Some(tenant) => f(tenant)
          }
          .recoverWith {
            case e =>
              AppLogger.error(s"Failed to retrieve tenant : ${e.getMessage}", e)
              Errors.craftResponseResult(
                "Failed to retrieve tenant # Try to reload your page",
                Results.NotFound,
                request,
                None,
                env
              )
          }
    }
  }
}

class LoginFilter(env: Env)(implicit
    val mat: Materializer,
    ec: ExecutionContext
) extends Filter {

  import fr.maif.otoroshi.daikoku.utils.RequestImplicits._
  implicit class RegexOps(sc: StringContext) {
    def r = new util.matching.Regex(sc.parts.mkString)
  }

  val exclusions = Seq(
    ("get", "/login/*/login"),
    ("post", "/login/*/callback"),
    ("get", "/login/*/callback"),
    ("get", "/login/local/login"),
    ("post", "/api/reset")
  )

  def findUserTeam(tenantId: TenantId, user: User): Future[Option[Team]] = {
    for {
      teamRepo <- env.dataStore.teamRepo.forTenantF(tenantId)
      maybePersonnalTeam: Option[Team] <- teamRepo.findOne(
        Json.obj(
          "type" -> TeamType.Personal.name,
          "users.userId" -> user.id.value,
          "_deleted" -> false
        )
      )
      backupTeam = Team(
        id = TeamId(IdGenerator.token(32)),
        tenant = tenantId,
        `type` = TeamType.Personal,
        name = s"${user.name}",
        description = s"The personal team of ${user.name}",
        users = Set(UserWithPermission(user.id, Administrator)),
        authorizedOtoroshiEntities = None,
        contact = user.email,
        avatar = Some(user.picture)
      )
      theMaybeTeam: Option[Team] <-
        if (maybePersonnalTeam.isDefined)
          FastFuture.successful(maybePersonnalTeam)
        else teamRepo.save(backupTeam).map(_ => Some(backupTeam))
      // maybePersonnalTeamId = maybePersonnalTeam.map(_.id).getOrElse(Team.Default)
      // maybeLastTeam <- teamRepo.findByIdNotDeleted(user.lastTeams.getOrElse(tenantId, maybePersonnalTeamId))
    } yield {
      theMaybeTeam
      // maybeLastTeam match {
      //   case Some(_) => maybeLastTeam
      //   case None    => maybePersonnalTeam
      // }
    }
  }

  def cleanupRedirect(uri: String): String = {
    uri match {
      case "/favicon.ico"               => "/"
      case "/daikoku.min.css.map"       => "/"
      case "/daikoku.home.min.css.map"  => "/"
      case "/daikoku.login.min.css.map" => "/"
      case "/daikoku.min.js.map"        => "/"
      case "/daikoku.home.min.js.map"   => "/"
      case "/daikoku.login.min.js.map"  => "/"
      case r"/assets/.*"                => "/"
      case _                            => uri
    }
  }

  def apply(
      nextFilter: RequestHeader => Future[Result]
  )(request: RequestHeader): Future[Result] = {

    AppLogger.debug(
      s"Filtering on ${request.method.toLowerCase()} => ${request.relativeUri}"
    )

    (request.method.toLowerCase(), request.relativeUri) match {
      case (_, r"/fakeotoroshi/.*")               => nextFilter(request)
      case (_, r"/assets/.*")                     => nextFilter(request)
      case ("get", r"/auth/.*/login")             => nextFilter(request)
      case (_, r"/auth/.*/callback.*")            => nextFilter(request)
      case (_, r"/auth/.*/logout.*")              => nextFilter(request)
      case ("post", r"/api/reset")                => nextFilter(request)
      case ("post", r"/api/reset")                => nextFilter(request)
      case ("post", r"/api/jobs/.*")              => nextFilter(request)
      case ("post", r"/admin-api/state/import.*") => nextFilter(request)
      case _ =>
        TenantHelper.withTenant(request, env) { tenant =>
          val provider = tenant.authProvider

          def passWithSession(): Future[Result] = {
            request.session
              .get("sessionId")
              .orElse(request.getQueryString("sessionId")) match {
              case None =>
                (request.method.toLowerCase(), request.relativeUri) match {
                  case ("get", r"/") =>
                    nextFilter(request.addAttr(IdentityAttrs.TenantKey, tenant))
                  case ("get", r"/signup") =>
                    nextFilter(request.addAttr(IdentityAttrs.TenantKey, tenant))
                  case ("get", r"/robot.txt") =>
                    nextFilter(request.addAttr(IdentityAttrs.TenantKey, tenant))
                  case ("get", r"/api/translations/_all") =>
                    nextFilter(request.addAttr(IdentityAttrs.TenantKey, tenant))
                  case ("get", r"/reset") =>
                    nextFilter(request.addAttr(IdentityAttrs.TenantKey, tenant))
                  case (_, path) if path.startsWith("/api/2fa") =>
                    nextFilter(request.addAttr(IdentityAttrs.TenantKey, tenant))
                  case ("get", r"/2fa") =>
                    nextFilter(request.addAttr(IdentityAttrs.TenantKey, tenant))
                  case ("get", path) if path.startsWith("/2fa") =>
                    nextFilter(request.addAttr(IdentityAttrs.TenantKey, tenant))
                  case ("get", path) if path.startsWith("/reset") =>
                    nextFilter(request.addAttr(IdentityAttrs.TenantKey, tenant))
                  case ("get", path) if path.startsWith("/signup") =>
                    nextFilter(request.addAttr(IdentityAttrs.TenantKey, tenant))
                  case ("get", path) if path.startsWith("/robots.txt") =>
                    nextFilter(request.addAttr(IdentityAttrs.TenantKey, tenant))
                  case ("get", path)
                      if path.startsWith("/api/versions/_daikoku") =>
                    nextFilter(request.addAttr(IdentityAttrs.TenantKey, tenant))
                  case (_, r"/account") =>
                    nextFilter(request.addAttr(IdentityAttrs.TenantKey, tenant))
                  case (_, r"/account/.*") =>
                    nextFilter(request.addAttr(IdentityAttrs.TenantKey, tenant))
                  case ("get", r"/tenant-assets/.*") =>
                    nextFilter(request.addAttr(IdentityAttrs.TenantKey, tenant))
                  case ("get", r"/user-assets/.*") =>
                    nextFilter(request.addAttr(IdentityAttrs.TenantKey, tenant))
                  case ("get", r"/asset-thumbnails/.*") =>
                    nextFilter(request.addAttr(IdentityAttrs.TenantKey, tenant))
                  case (_, r"/admin-api/.*") =>
                    nextFilter(request.addAttr(IdentityAttrs.TenantKey, tenant))
                  case (_, r"/integration-api/.*") =>
                    request
                      .getQueryString("token")
                      .orElse(request.headers.get("X-Personal-Token")) match {
                      case None =>
                        AppLogger.info("No personal token found")
                        FastFuture.successful(
                          Results.Unauthorized(
                            Json.obj("error" -> "not authorized")
                          )
                        )
                      case Some(token) =>
                        env.dataStore.userRepo
                          .findOneNotDeleted(Json.obj("personalToken" -> token))
                          .flatMap {
                            case None =>
                              AppLogger.info("No user found")
                              FastFuture.successful(
                                Results.Unauthorized(
                                  Json.obj("error" -> "not authorized")
                                )
                              )
                            case Some(_user) =>
                              val user =
                                _user.copy(tenants = _user.tenants + tenant.id)
                              val session = UserSession(
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
                                expires = DateTime.now().plusSeconds(10),
                                ttl = FiniteDuration(10, TimeUnit.SECONDS)
                              )
                              findUserTeam(tenant.id, user).flatMap {
                                case None =>
                                  AppLogger.info("No team found")
                                  FastFuture.successful(
                                    Results
                                      .Redirect(
                                        fr.maif.otoroshi.daikoku.ctrls.routes.LoginController
                                          .loginPage(provider.name)
                                      )
                                      .removingFromSession("sessionId")(request)
                                      .withSession(
                                        "redirect" -> cleanupRedirect(
                                          request.relativeUri
                                        )
                                      )
                                  )
                                case Some(team) =>
                                  env.dataStore.userRepo.save(user).flatMap {
                                    _ =>
                                      env.dataStore.teamRepo
                                        .forTenant(tenant)
                                        .exists(
                                          Json.obj(
                                            "type" -> "Admin",
                                            "users.userId" -> user.id.asJson
                                          )
                                        )
                                        .flatMap(isTenantAdmin => {
                                          nextFilter(
                                            request
                                              .addAttr(
                                                IdentityAttrs.TeamKey,
                                                team
                                              )
                                              .addAttr(
                                                IdentityAttrs.UserKey,
                                                user
                                              )
                                              .addAttr(
                                                IdentityAttrs.TenantAdminKey,
                                                isTenantAdmin
                                              )
                                              .addAttr(
                                                IdentityAttrs.ImpersonatorKey,
                                                None
                                              )
                                              .addAttr(
                                                IdentityAttrs.TenantKey,
                                                tenant
                                              )
                                              .addAttr(
                                                IdentityAttrs.SessionKey,
                                                session
                                              )
                                          )
                                        })
                                  }
                              }
                          }
                    }
//                  case (_, _) if tenant.isPrivate =>
//                    AppLogger.warn("tenant is private (4)")
//                    FastFuture.successful(
//                      Results
//                        .Redirect(
//                          fr.maif.otoroshi.daikoku.ctrls.routes.LoginController
//                            .loginPage(provider.name)
//                        )
//                        .removingFromSession("sessionId")(request)
//                        .withSession(
//                          "redirect" -> cleanupRedirect(request.relativeUri)
//                        )
//                    )
                  case (_, _) =>
                    AppLogger.info("no session found")
                    nextFilter(request.addAttr(IdentityAttrs.TenantKey, tenant))
                }
              case Some(sessionId) =>
                env.dataStore.userSessionRepo
                  .findOne(Json.obj("sessionId" -> sessionId))
                  .flatMap {
                    case None if tenant.isPrivate =>
                      FastFuture.successful(
                        Results
                          .Redirect(
                            fr.maif.otoroshi.daikoku.ctrls.routes.LoginController
                              .loginPage(provider.name)
                          )
                          .removingFromSession("sessionId")(request)
                          .withSession(
                            "redirect" -> cleanupRedirect(request.relativeUri)
                          )
                      )
                    case None =>
                      nextFilter(
                        request.addAttr(IdentityAttrs.TenantKey, tenant)
                      )
                    case Some(session) if session.expires.isBeforeNow =>
                      AppLogger.info("Session expired")
                      FastFuture.successful(
                        Results
                          .Redirect(
                            fr.maif.otoroshi.daikoku.ctrls.routes.LoginController
                              .loginPage(provider.name)
                          )
                          .removingFromSession("sessionId")(request)
                          .withSession(
                            "redirect" -> cleanupRedirect(request.relativeUri)
                          )
                      )
                    case Some(session) if session.expires.isAfterNow =>
                      env.dataStore.userRepo
                        .findByIdNotDeleted(session.userId)
                        .flatMap {
                          case None =>
                            AppLogger.info(
                              "" +
                                "No user found"
                            )
                            FastFuture.successful(
                              Results
                                .Redirect(
                                  fr.maif.otoroshi.daikoku.ctrls.routes.LoginController
                                    .loginPage(provider.name)
                                )
                                .removingFromSession("sessionId")(request)
                                .withSession(
                                  "redirect" -> cleanupRedirect(
                                    request.relativeUri
                                  )
                                )
                            )
                          case Some(_user) =>
                            val user =
                              _user.copy(tenants = _user.tenants + tenant.id)
                            findUserTeam(tenant.id, user).flatMap {
                              case None =>
                                AppLogger.info("No team found")
                                FastFuture.successful(
                                  Results
                                    .Redirect(
                                      fr.maif.otoroshi.daikoku.ctrls.routes.LoginController
                                        .loginPage(provider.name)
                                    )
                                    .removingFromSession("sessionId")(request)
                                    .withSession(
                                      "redirect" -> cleanupRedirect(
                                        request.relativeUri
                                      )
                                    )
                                )
                              case Some(team) =>
                                for {
                                  _ <- env.dataStore.userRepo.save(user)
                                  isTenantAdmin <-
                                    env.dataStore.teamRepo
                                      .forTenant(tenant)
                                      .exists(
                                        Json.obj(
                                          "type" -> "Admin",
                                          "users.userId" -> user.id.asJson
                                        )
                                      )
                                  result <-
                                    session.impersonatorId
                                      .map(id =>
                                        env.dataStore.userRepo
                                          .findByIdNotDeleted(id)
                                      )
                                      .getOrElse(FastFuture.successful(None))
                                      .flatMap { maybeImpersonator =>
                                        nextFilter(
                                          request
                                            .addAttr(
                                              IdentityAttrs.TeamKey,
                                              team
                                            )
                                            .addAttr(
                                              IdentityAttrs.UserKey,
                                              user
                                            )
                                            .addAttr(
                                              IdentityAttrs.TenantAdminKey,
                                              isTenantAdmin
                                            )
                                            .addAttr(
                                              IdentityAttrs.ImpersonatorKey,
                                              maybeImpersonator
                                            )
                                            .addAttr(
                                              IdentityAttrs.TenantKey,
                                              tenant
                                            )
                                            .addAttr(
                                              IdentityAttrs.SessionKey,
                                              session
                                            )
                                        )
                                      }
                                } yield {
                                  result
                                }
                            }
                        }
                    case _ =>
                      FastFuture.successful(
                        Results
                          .Redirect(
                            fr.maif.otoroshi.daikoku.ctrls.routes.LoginController
                              .loginPage(provider.name)
                          )
                          .removingFromSession("sessionId")(request)
                          .withSession(
                            "redirect" -> cleanupRedirect(request.relativeUri)
                          )
                      )
                  }
            }
          }

          provider match {
            case AuthProvider.Local => passWithSession()
            case AuthProvider.Otoroshi =>
              OtoroshiIdentityFilter(env, tenant, nextFilter, request)
            case AuthProvider.LDAP   => passWithSession()
            case AuthProvider.OAuth2 => passWithSession()
          }
        }
    }
  }
}
