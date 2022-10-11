package fr.maif.otoroshi.daikoku.ctrls

import java.net.URLEncoder
import java.util.concurrent.TimeUnit
import akka.http.scaladsl.util.FastFuture
import com.eatthepath.otp.TimeBasedOneTimePasswordGenerator
import fr.maif.otoroshi.daikoku.actions.{
  DaikokuAction,
  DaikokuActionMaybeWithGuest,
  DaikokuTenantAction,
  DaikokuTenantActionContext
}
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async.UberPublicUserAccess
import fr.maif.otoroshi.daikoku.audit.{AuditTrailEvent, AuthorizationLevel}
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.login.AuthProvider._
import fr.maif.otoroshi.daikoku.login._
import fr.maif.otoroshi.daikoku.utils.RequestImplicits._
import fr.maif.otoroshi.daikoku.utils.{Errors, IdGenerator, Translator}
import org.apache.commons.codec.binary.Base32
import org.joda.time.DateTime
import org.mindrot.jbcrypt.BCrypt
import play.api.libs.json.{JsObject, JsValue, Json}
import play.api.mvc._
import reactivemongo.bson.BSONObjectID

import java.time.Instant
import java.util.Base64
import javax.crypto.KeyGenerator
import javax.crypto.spec.SecretKeySpec
import scala.collection.concurrent.TrieMap
import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration.FiniteDuration

class LoginController(DaikokuAction: DaikokuAction,
                      DaikokuActionMaybeWithGuest: DaikokuActionMaybeWithGuest,
                      DaikokuTenantAction: DaikokuTenantAction,
                      env: Env,
                      cc: ControllerComponents,
                      translator: Translator)
    extends AbstractController(cc) {
  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env
  implicit val tr = translator

  def loginPage(provider: String) = DaikokuTenantAction.async { ctx =>
    AuthProvider(provider) match {
      case None =>
        Errors.craftResponseResult("Bad authentication provider",
                                   Results.BadRequest,
                                   ctx.request,
                                   None,
                                   env,
                                   ctx.tenant)
      case Some(p) if ctx.tenant.authProvider != p && p != AuthProvider.Local =>
        Errors.craftResponseResult("Bad authentication provider",
                                   Results.BadRequest,
                                   ctx.request,
                                   None,
                                   env,
                                   ctx.tenant)
      case Some(p) =>
        p match {
          case Otoroshi => FastFuture.successful(Redirect("/"))
          case OAuth2 =>
            implicit val req: Request[AnyContent] = ctx.request
            val authConfig = OAuth2Config
              .fromJson(ctx.tenant.authProviderSettings)
              .toOption
              .get
            val redirect = ctx.request.getQueryString("redirect")
            val clientId = authConfig.clientId
            val responseType = "code"
            val scope = authConfig.scope // "openid profile email name"
            val redirectUri = authConfig.callbackUrl
            val loginUrl =
              s"${authConfig.loginUrl}?scope=$scope&client_id=$clientId&response_type=$responseType&redirect_uri=$redirectUri"
            FastFuture.successful(
              Redirect(
                loginUrl
              ).addingToSession(
                s"redirect" -> redirect.getOrElse("/")
              ))
          case _ =>
            FastFuture.successful(
              Ok(views.html.login(p, ctx.tenant, ctx.request.domain, env)))
        }
    }
  }

  def bindUser(sessionMaxAge: Int,
               tenant: Tenant,
               request: RequestHeader,
               f: => Future[Option[User]]): Future[Result] = {
    f.flatMap {
      case None => FastFuture.successful(BadRequest(Json.obj("error" -> true)))
      case Some(user) =>
        user.twoFactorAuthentication match {
          case Some(auth) if auth.enabled =>
            val keyGenerator = KeyGenerator.getInstance("HmacSHA1")
            keyGenerator.init(160)
            val token =
              new Base32().encodeAsString(keyGenerator.generateKey.getEncoded)

            env.dataStore.userRepo
              .save(
                user.copy(
                  twoFactorAuthentication = Some(auth.copy(token = token))
                ))
              .flatMap {
                case true =>
                  FastFuture.successful(Redirect(s"/2fa?token=$token"))
                case false =>
                  FastFuture.successful(BadRequest(Json.obj("error" -> true)))
              }
          case _ => createSession(sessionMaxAge, user, request, tenant)
        }
    }
  }

  private def createSession(sessionMaxAge: Int,
                            user: User,
                            request: RequestHeader,
                            tenant: Tenant) = {
    env.dataStore.userSessionRepo
      .findOne(Json.obj("userEmail" -> user.email))
      .map {
        case Some(session) =>
          session.copy(expires = DateTime.now().plusSeconds(sessionMaxAge))
        case None =>
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
          )
      }
      .flatMap { session =>
        env.dataStore.userSessionRepo.save(session).map { _ =>
          AuditTrailEvent(
            s"${user.name} has connected to ${tenant.name} with ${user.email} address")
            .logTenantAuditEvent(tenant,
                                 user,
                                 session,
                                 request,
                                 TrieMap[String, String](),
                                 AuthorizationLevel.AuthorizedSelf)

          val redirectUri = request.session.get("redirect").getOrElse("/")

          Redirect(if (redirectUri.startsWith("/api/")) "/" else redirectUri)
            .withSession("sessionId" -> session.sessionId.value)
            .removingFromSession("redirect")(request)
        }
      }
  }

  def actualLogin(
      provider: String,
      ctx: DaikokuTenantActionContext[AnyContent]): Future[Result] = {
    AuthProvider(provider) match {
      case None =>
        Errors.craftResponseResult("Bad authentication provider",
                                   Results.BadRequest,
                                   ctx.request,
                                   None,
                                   env,
                                   ctx.tenant)
      case Some(p) if ctx.tenant.authProvider != p && p != AuthProvider.Local =>
        Errors.craftResponseResult("Bad authentication provider",
                                   Results.BadRequest,
                                   ctx.request,
                                   None,
                                   env,
                                   ctx.tenant)
      case Some(p) if p == AuthProvider.OAuth2 =>
        val maybeOAuth2Config =
          OAuth2Config.fromJson(ctx.tenant.authProviderSettings)

        maybeOAuth2Config match {
          case Right(authConfig) =>
            bindUser(authConfig.sessionMaxAge,
                     ctx.tenant,
                     ctx.request,
                     OAuth2Support
                       .bindUser(ctx.request, authConfig, ctx.tenant, env)
                       .map(_.toOption))
          case Left(e) =>
            AppLogger.error("Error during OAuthConfig read", e)
            Errors.craftResponseResult("Invalid OAuth Config",
                                       Results.BadRequest,
                                       ctx.request,
                                       None,
                                       env,
                                       ctx.tenant)
        }
      case Some(p) =>
        ctx.request.body.asFormUrlEncoded match {
          case None =>
            Errors.craftResponseResult("No credentials found",
                                       Results.BadRequest,
                                       ctx.request,
                                       None,
                                       env,
                                       ctx.tenant)
          case Some(form) =>
            (form.get("username").map(_.last).map(_.toLowerCase),
             form.get("password").map(_.last)) match {
              case (Some(username), Some(password)) =>
                p match {
                  case AuthProvider.Local =>
                    AuditTrailEvent(
                      s"unauthenticated user with $username has tried to login [local provider]")
                      .logUnauthenticatedUserEvent(ctx.tenant)
                    val localConfig = LocalLoginConfig.fromJsons(
                      ctx.tenant.authProviderSettings)
                    bindUser(localConfig.sessionMaxAge,
                             ctx.tenant,
                             ctx.request,
                             LocalLoginSupport.bindUser(username,
                                                        password,
                                                        ctx.tenant,
                                                        env))
                  case AuthProvider.Otoroshi =>
                    // as otoroshi already done the job, nothing to do here
                    AuditTrailEvent(
                      s"unauthenticated user with $username has tried to login [Otoroshi provider]")
                      .logUnauthenticatedUserEvent(ctx.tenant)
                    FastFuture.successful(
                      Redirect(
                        ctx.request.session.get("redirect").getOrElse("/"))
                        .removingFromSession(
                          "redirect"
                        )(ctx.request)
                    )
                  case AuthProvider.LDAP =>
                    AuditTrailEvent(
                      s"unauthenticated user with $username has tried to login [LDAP provider]")
                      .logUnauthenticatedUserEvent(ctx.tenant)
                    val ldapConfig =
                      LdapConfig.fromJsons(ctx.tenant.authProviderSettings)

                    LdapSupport.bindUser(username,
                                         password,
                                         ctx.tenant,
                                         env,
                                         Some(ldapConfig)) match {
                      case Left(_) =>
                        val localConfig = LocalLoginConfig.fromJsons(
                          ctx.tenant.authProviderSettings)
                        bindUser(localConfig.sessionMaxAge,
                                 ctx.tenant,
                                 ctx.request,
                                 LocalLoginSupport.bindUser(username,
                                                            password,
                                                            ctx.tenant,
                                                            env))
                      case Right(user) =>
                        bindUser(ldapConfig.sessionMaxAge,
                                 ctx.tenant,
                                 ctx.request,
                                 user.map(u => Some(u)))
                    }
                  case _ =>
                    Errors.craftResponseResult("No matching provider found",
                                               Results.BadRequest,
                                               ctx.request,
                                               None,
                                               env,
                                               ctx.tenant)
                }
              case _ =>
                Errors.craftResponseResult("No credentials found",
                                           Results.BadRequest,
                                           ctx.request,
                                           None,
                                           env,
                                           ctx.tenant)
            }
        }
    }
  }

  def login(provider: String) = DaikokuTenantAction.async { ctx =>
    actualLogin(provider, ctx)
  }

  def loginGet(provider: String) = DaikokuTenantAction.async { ctx =>
    actualLogin(provider, ctx)
  }

  def logout() = DaikokuAction.async { ctx =>
    val host = ctx.request.headers
      .get("Otoroshi-Proxied-Host")
      .orElse(ctx.request.headers.get("X-Forwarded-Host"))
      .getOrElse(ctx.request.host)
    val redirect = ctx.request
      .getQueryString("redirect")
      .getOrElse(s"${ctx.request.theProtocol}://$host/")

    AuthProvider(ctx.tenant.authProvider.name) match {
      case Some(AuthProvider.Otoroshi) =>
        val session = ctx.request.attrs(IdentityAttrs.SessionKey)
        env.dataStore.userSessionRepo.deleteById(session.id).map { _ =>
          AuditTrailEvent(
            s"${session.userEmail} disconnect his account from ${ctx.tenant.name} [Otoroshi provider]")
            .logTenantAuditEvent(ctx.tenant,
                                 ctx.user,
                                 session,
                                 ctx.request,
                                 ctx.ctx,
                                 AuthorizationLevel.AuthorizedSelf)
          Redirect(s"/.well-known/otoroshi/logout?redirect=$redirect")
        }
      case Some(AuthProvider.OAuth2) =>
        val session = ctx.request.attrs(IdentityAttrs.SessionKey)
        env.dataStore.userSessionRepo.deleteById(session.id).map { _ =>
          AuditTrailEvent(
            s"${session.userEmail} disconnect his account from ${ctx.tenant.name} [OAuth2 provider]")
            .logTenantAuditEvent(ctx.tenant,
                                 ctx.user,
                                 session,
                                 ctx.request,
                                 ctx.ctx,
                                 AuthorizationLevel.AuthorizedSelf)
          Redirect(OAuth2Config
            .fromJson(ctx.tenant.authProviderSettings) match {
            case Left(_) => redirect
            case Right(config: OAuth2Config) =>
              config.logoutUrl
                .replace("${redirect}", URLEncoder.encode(redirect, "UTF-8"))
          }).removingFromSession("sessionId")(ctx.request)
        }
      case _ =>
        val session = ctx.request.attrs(IdentityAttrs.SessionKey)
        env.dataStore.userSessionRepo.deleteById(session.id).map { _ =>
          AuditTrailEvent(
            s"${session.userEmail} disconnect his account from ${ctx.tenant.name} [Local/Other provider]")
            .logTenantAuditEvent(ctx.tenant,
                                 ctx.user,
                                 session,
                                 ctx.request,
                                 ctx.ctx,
                                 AuthorizationLevel.AuthorizedSelf)
          Redirect(redirect).removingFromSession("sessionId")(ctx.request)
        }
    }
  }

  ///////// Local login module routes /////////////

  val passwordPattern = java.util.regex.Pattern
    .compile("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[#$^+=!*()@%&]).{8,1000}$")

  def validateUserCreationForm(
      name: String,
      email: String,
      password: String,
      confirmPassword: String): Either[String, Unit] = {

    if (name.trim().isEmpty()) {
      Left("Name should not be empty")
    } else if (email.trim().isEmpty()) {
      Left("Email address should not be empty")
    } else {
      (password.trim(), confirmPassword.trim()) match {
        case (pwd1, pwd2) if pwd1 != pwd2 =>
          Left("Your passwords does not match")
        case (pwd1, pwd2) if pwd1.isEmpty || pwd2.isEmpty =>
          Left("Your password can't be empty")
        case (pwd1, _) if passwordPattern.matcher(pwd1).matches() => Right(())
        case _ =>
          Left(
            "Your password should be longer than 8 characters and contains letters, capitalized letters, numbers and special characters (#$^+=!*()@%&) !")
      }
    }
  }

  def createUser() = DaikokuTenantAction.async(parse.json) { ctx =>
    val body = ctx.request.body.as[JsObject]
    val email = (body \ "email").as[String]
    val name = (body \ "name").as[String]
    val avatar =
      (body \ "avatar").asOpt[String].getOrElse(User.DEFAULT_IMAGE)
    val password = (body \ "password").as[String]
    val confirmPawword = (body \ "confirmPassword").as[String]
    env.dataStore.userRepo.findOne(Json.obj("email" -> email)).flatMap {
      case Some(user)
          if user.invitation.isEmpty || user.invitation.get.registered =>
        FastFuture.successful(
          BadRequest(Json.obj("error" -> "Email address already exists")))
      case _ =>
        validateUserCreationForm(name, email, password, confirmPawword) match {
          case Left(msg) =>
            FastFuture.successful(BadRequest(Json.obj("error" -> msg)))
          case Right(_) => {
            val randomId = IdGenerator.token(128)
            env.dataStore.accountCreationRepo
              .save(AccountCreation(
                id = DatastoreId(BSONObjectID.generate().stringify),
                randomId = randomId,
                email = email,
                name = name,
                avatar = avatar,
                password = BCrypt.hashpw(password, BCrypt.gensalt()),
                creationDate = DateTime.now(),
                validUntil = DateTime.now().plusMinutes(15)
              ))
              .flatMap { _ =>
                val host = ctx.request.headers
                  .get("Otoroshi-Proxied-Host")
                  .orElse(ctx.request.headers.get("X-Forwarded-Host"))
                  .getOrElse(ctx.request.host)
                implicit val tenantLanguage: String =
                  ctx.tenant.defaultLanguage.getOrElse("en")
                (for {
                  title <- translator.translate(
                    "mail.new.user.title",
                    ctx.tenant,
                    Map("tenant" -> ctx.tenant.name))
                  body <- translator.translate(
                    "mail.new.user.body",
                    ctx.tenant,
                    Map(
                      "tenant" -> ctx.tenant.name,
                      "link" -> s"${ctx.request.theProtocol}://${host}/account/validate?id=${randomId}"
                    ))
                } yield {
                  ctx.tenant.mailer
                    .send(title, Seq(email), body, ctx.tenant)
                    .map { _ =>
                      Ok(Json.obj("done" -> true))
                    }
                }).flatten
              }
          }
        }
    }
  }

  def createUserValidation() = DaikokuTenantAction.async { ctx =>
    ctx.request.getQueryString("id") match {
      case None =>
        Errors.craftResponseResult("The user creation has failed.",
                                   Results.BadRequest,
                                   ctx.request,
                                   env = env)
      case Some(id) =>
        env.dataStore.accountCreationRepo
          .findOneNotDeleted(Json.obj("randomId" -> id))
          .flatMap {
            case Some(accountCreation)
                if accountCreation.validUntil.isBefore(DateTime.now()) => {
              env.dataStore.accountCreationRepo
                .deleteByIdLogically(accountCreation.id.value)
                .map { _ =>
                  Redirect("/signup?error=not.valid.anymore")
                }
            }
            case Some(accountCreation)
                if accountCreation.validUntil.isAfter(DateTime.now()) => {
              env.dataStore.userRepo
                .findOne(Json.obj("email" -> accountCreation.email))
                .flatMap {
                  case Some(user)
                      if user.invitation.isEmpty || user.invitation.get.registered =>
                    Errors.craftResponseResult(
                      "This account is already enabled.",
                      Results.BadRequest,
                      ctx.request,
                      env = env)
                  case optUser =>
                    val userId = optUser
                      .map(_.id)
                      .getOrElse(UserId(BSONObjectID.generate().stringify))
                    val team = Team(
                      id = TeamId(BSONObjectID.generate().stringify),
                      tenant = ctx.tenant.id,
                      `type` = TeamType.Personal,
                      name = s"${accountCreation.name}",
                      description = s"Team of ${accountCreation.name}",
                      users = Set(UserWithPermission(userId, Administrator)),
                      subscriptions = Seq.empty,
                      authorizedOtoroshiGroups = Set.empty
                    )
                    def getUser() = User(
                      id = userId,
                      tenants = Set(ctx.tenant.id),
                      origins = Set(ctx.tenant.authProvider),
                      name = accountCreation.name,
                      email = accountCreation.email,
                      picture = accountCreation.avatar,
                      isDaikokuAdmin = false,
                      lastTenant = Some(ctx.tenant.id),
                      password = Some(accountCreation.password),
                      personalToken = Some(IdGenerator.token(32)),
                      defaultLanguage = None
                    )

                    val user = optUser
                      .map { u =>
                        getUser().copy(invitation =
                          u.invitation.map(_.copy(registered = true)))
                      }
                      .getOrElse(getUser())

                    val userCreation = for {
                      _ <- env.dataStore.teamRepo
                        .forTenant(ctx.tenant.id)
                        .save(team)
                      _ <- env.dataStore.userRepo.save(user)
                      _ <- env.dataStore.accountCreationRepo
                        .deleteByIdLogically(accountCreation.id.value)
                    } yield ()
                    userCreation.map { user =>
                      Status(302)(Json.obj("Location" -> "/?userCreated=true"))
                        .withHeaders("Location" -> "/?userCreated=true")
                    }
                }
            }
            case _ =>
              Errors.craftResponseResult("Your link is invalid",
                                         Results.BadRequest,
                                         ctx.request,
                                         env = env)
          }
    }
  }

  def askForPasswordReset() = DaikokuTenantAction.async(parse.json) { ctx =>
    val body = ctx.request.body.as[JsObject]
    val email = (body \ "email").as[String]
    val password = (body \ "password").as[String]
    val confirmPassword = (body \ "confirmPassword").as[String]

    AuditTrailEvent(s"unauthenticated user with $email ask to reset password")
      .logUnauthenticatedUserEvent(ctx.tenant)

    env.dataStore.userRepo.findOne(Json.obj("email" -> email)).flatMap {
      case Some(user) =>
        validateUserCreationForm("daikoku", email, password, confirmPassword) match {
          case Left(msg) =>
            FastFuture.successful(BadRequest(Json.obj("error" -> msg)))
          case Right(_) => {
            val randomId = IdGenerator.token(128)
            env.dataStore.passwordResetRepo.save(PasswordReset(
              id = DatastoreId(BSONObjectID.generate().stringify),
              randomId = randomId,
              email = email,
              password = BCrypt.hashpw(password, BCrypt.gensalt()),
              user = user.id,
              creationDate = DateTime.now(),
              validUntil = DateTime.now().plusMinutes(15)
            ))
            val host = ctx.request.headers
              .get("Otoroshi-Proxied-Host")
              .orElse(ctx.request.headers.get("X-Forwarded-Host"))
              .getOrElse(ctx.request.host)

            val tenantLanguage: String =
              ctx.tenant.defaultLanguage.getOrElse("en")
            implicit val language: String =
              user.defaultLanguage.getOrElse(tenantLanguage)
            ctx.tenant.mailer
              .send(
                s"Reset your ${ctx.tenant.name} account password",
                Seq(email),
                s"""
                |<p>You asked to reset your ${ctx.tenant.name} account password.</p>
                |
                |<p>If it was you, please click on the following link to finalize the password resset process</p>
                |
                |<a href="${ctx.request.theProtocol}://${host}/account/reset?id=$randomId">Reset</a>
                |<p>If not, just ignore this email</p>
                |
                |<p>The ${ctx.tenant.name} team</p>
              """.stripMargin,
                ctx.tenant
              )
              .map { _ =>
                Ok(Json.obj("done" -> true))
              }
          }
        }
      case None =>
        FastFuture.successful(
          BadRequest(Json.obj("error" -> "Email address does not exist")))
    }
  }

  def passwordResetValidation() = DaikokuTenantAction.async { ctx =>
    ctx.request.getQueryString("id") match {
      case None =>
        FastFuture.successful(BadRequest(Json.obj("error" -> "Id not found")))
      case Some(id) => {
        env.dataStore.passwordResetRepo
          .findOneNotDeleted(Json.obj("randomId" -> id))
          .flatMap {
            case Some(pwdReset)
                if pwdReset.validUntil.isBefore(DateTime.now()) => {
              env.dataStore.passwordResetRepo
                .deleteByIdLogically(pwdReset.id.value)
                .map { _ =>
                  Redirect("/reset?error=not.valid.anymore")
                }
            }
            case Some(pwdReset)
                if pwdReset.validUntil.isAfter(DateTime.now()) => {
              env.dataStore.userRepo
                .findOneNotDeleted(Json.obj("_id" -> pwdReset.user.value,
                                            "email" -> pwdReset.email))
                .flatMap {
                  case None =>
                    FastFuture.successful(
                      NotFound(Json.obj("error" -> "User not found")))
                  case Some(user) => {
                    env.dataStore.userRepo
                      .save(user.copy(password = Some(pwdReset.password)))
                      .flatMap { _ =>
                        env.dataStore.passwordResetRepo
                          .deleteByIdLogically(pwdReset.id.value)
                          .map { _ =>
                            Redirect("/")
                          }
                      }
                  }
                }
            }
            case _ =>
              FastFuture.successful(Redirect("/reset?error=bad.creation.id"))
          }
      }
    }
  }

  def checkLdapConnection() = DaikokuAction.async(parse.json) { ctx =>
    if ((ctx.request.body \ "user").isDefined) {
      val username = (ctx.request.body \ "user" \ "username").as[String]
      val password = (ctx.request.body \ "user" \ "password").as[String]

      LdapConfig.fromJson((ctx.request.body \ "config").as[JsValue]) match {
        case Left(_) =>
          FastFuture.successful(
            BadRequest(Json.obj("error" -> "bad auth. module. config")))
        case Right(config) =>
          LdapSupport.bindUser(username,
                               password,
                               ctx.tenant,
                               env,
                               Some(config)) match {
            case Left(err) =>
              FastFuture.successful(
                Ok(Json.obj("works" -> false, "error" -> err)))
            case Right(_) =>
              FastFuture.successful(Ok(Json.obj("works" -> true)))
          }
      }
    } else {
      LdapConfig.fromJson(ctx.request.body) match {
        case Left(_) =>
          FastFuture.successful(
            BadRequest(Json.obj("error" -> "bad auth. module. config")))
        case Right(config) =>
          LdapSupport.checkConnection(config).map {
            case (works, _) if works => Ok(Json.obj("works" -> works))
            case (works, error) =>
              Ok(Json.obj("works" -> works, "error" -> error))
          }
      }
    }
  }

  def verifyCode(token: Option[String], code: Option[String]) =
    DaikokuTenantAction.async { ctx =>
      (token, code) match {
        case (Some(token), Some(code)) =>
          env.dataStore.userRepo
            .findOne(
              Json.obj(
                "twoFactorAuthentication.token" -> token
              ))
            .flatMap {
              case Some(user) if user.twoFactorAuthentication.isDefined =>
                val totp = new TimeBasedOneTimePasswordGenerator()
                val now = Instant.now()
                val later = now.plus(totp.getTimeStep)

                val decodedKey = Base64.getDecoder.decode(
                  user.twoFactorAuthentication.get.secret)
                val key =
                  new SecretKeySpec(decodedKey, 0, decodedKey.length, "AES")

                if (code == totp.generateOneTimePassword(key, now).toString ||
                    code == totp.generateOneTimePassword(key, later).toString)
                  createSession(
                    LocalLoginConfig
                      .fromJsons(ctx.tenant.authProviderSettings)
                      .sessionMaxAge,
                    user,
                    ctx.request,
                    ctx.tenant
                  )
                else
                  FastFuture.successful(
                    BadRequest(Json.obj("error" -> "Invalid code")))
              case None =>
                FastFuture.successful(
                  BadRequest(Json.obj("error" -> "Invalid token")))
            }
        case (_, _) =>
          FastFuture.successful(
            BadRequest(Json.obj("error" -> "Missing parameters")))
      }
    }

  def reset2fa() = DaikokuTenantAction.async(parse.json) { ctx =>
    (ctx.request.body \ "backupCodes").asOpt[String] match {
      case None =>
        FastFuture.successful(
          BadRequest(Json.obj("error" -> "Missing body fields")))
      case Some(backupCodes) =>
        env.dataStore.userRepo
          .findOne(
            Json.obj(
              "twoFactorAuthentication.backupCodes" -> backupCodes
            ))
          .flatMap {
            case Some(user) =>
              user.twoFactorAuthentication match {
                case None =>
                  FastFuture.successful(
                    BadRequest(
                      Json.obj("error" -> "2FA not enabled on this account")))
                case Some(auth) =>
                  if (auth.backupCodes != backupCodes)
                    FastFuture.successful(
                      BadRequest(Json.obj("error" -> "Wrong backup codes")))
                  else
                    env.dataStore.userRepo
                      .save(user.copy(twoFactorAuthentication = None))
                      .flatMap {
                        case false =>
                          FastFuture.successful(BadRequest(Json.obj(
                            "error" -> "Something happens when updating user")))
                        case true =>
                          FastFuture.successful(Ok(Json.obj(
                            "message" -> "2FA successfully disabled - You can now login")))
                      }
              }
            case _ =>
              FastFuture.successful(
                NotFound(Json.obj("error" -> "User not found")))
          }
    }
  }
}
