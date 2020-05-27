package fr.maif.otoroshi.daikoku.ctrls

import java.net.URLEncoder
import java.util.concurrent.TimeUnit

import akka.http.scaladsl.util.FastFuture
import fr.maif.otoroshi.daikoku.actions.{DaikokuAction, DaikokuTenantAction, DaikokuTenantActionContext}
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.login.AuthProvider._
import fr.maif.otoroshi.daikoku.login._
import fr.maif.otoroshi.daikoku.utils.RequestImplicits._
import fr.maif.otoroshi.daikoku.utils.{Errors, IdGenerator}
import org.joda.time.DateTime
import org.mindrot.jbcrypt.BCrypt
import play.api.libs.json.{JsObject, Json}
import play.api.mvc._
import reactivemongo.bson.BSONObjectID

import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration.FiniteDuration

class LoginController(DaikokuAction: DaikokuAction,
                      DaikokuTenantAction: DaikokuTenantAction,
                      env: Env,
                      cc: ControllerComponents)
    extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  def loginPage(provider: String) = DaikokuTenantAction.async { ctx =>
    AuthProvider(provider) match {
      case None =>
        Errors.craftResponseResult("Bad authentication provider",
                                   Results.BadRequest,
                                   ctx.request,
                                   None,
                                   env,
                                   ctx.tenant)
      case Some(p) if ctx.tenant.authProvider != p =>
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
      case None =>
        Errors.craftResponseResult("User not found",
                                   Results.BadRequest,
                                   request,
                                   None,
                                   env,
                                   tenant)
      case Some(user) =>
        val session = UserSession(
          id = MongoId(BSONObjectID.generate().stringify),
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
        env.dataStore.userSessionRepo.save(session).map { _ =>
          Redirect(request.session.get("redirect").getOrElse("/"))
            .withSession(
              "sessionId" -> session.sessionId.value
            )
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
      case Some(p) if ctx.tenant.authProvider != p =>
        Errors.craftResponseResult("Bad authentication provider",
                                   Results.BadRequest,
                                   ctx.request,
                                   None,
                                   env,
                                   ctx.tenant)
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
            (form.get("username").map(_.last), form.get("password").map(_.last)) match {
              case (Some(username), Some(password)) =>
                p match {
                  case AuthProvider.Local =>
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
                    FastFuture.successful(
                      Redirect(
                        ctx.request.session.get("redirect").getOrElse("/"))
                        .removingFromSession(
                          "redirect"
                        )(ctx.request)
                    )
                  case AuthProvider.LDAP =>
                    val ldapConfig =
                      LdapConfig.fromJsons(ctx.tenant.authProviderSettings)
                    bindUser(
                      ldapConfig.sessionMaxAge,
                      ctx.tenant,
                      ctx.request,
                      LdapSupport.bindUser(username, password, ctx.tenant, env))
                  case AuthProvider.OAuth2 =>
                    val maybeOAuth2Config = OAuth2Config
                      .fromJson(ctx.tenant.authProviderSettings)

                    maybeOAuth2Config match {
                      case Right(authConfig) => bindUser(
                        authConfig.sessionMaxAge,
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

  def logout(provider: String) = DaikokuAction.async { ctx =>
    val host = ctx.request.headers
      .get("Otoroshi-Proxied-Host")
      .orElse(ctx.request.headers.get("X-Forwarded-Host"))
      .getOrElse(ctx.request.host)
    val redirect =
      ctx.request
        .getQueryString("redirect")
        .getOrElse(s"${ctx.request.theProtocol}://$host/")
    AuthProvider(provider) match {
      case Some(AuthProvider.Otoroshi) =>
        FastFuture.successful(
          Redirect(s"/.well-known/otoroshi/logout?redirect=$redirect"))
      case Some(AuthProvider.OAuth2) =>
        val session = ctx.request.attrs(IdentityAttrs.SessionKey)
        env.dataStore.userSessionRepo.deleteById(session.id).map { _ =>
          val actualRedirectUrl = OAuth2Config.fromJson(ctx.tenant.authProviderSettings).getOrElse(OAuth2Config()) //todo: pas sur de moi
            .logoutUrl
            .replace("${redirect}", URLEncoder.encode(redirect, "UTF-8"))
          Redirect(actualRedirectUrl).removingFromSession("sessionId")(
            ctx.request)
        }
      case _ =>
        val session = ctx.request.attrs(IdentityAttrs.SessionKey)
        env.dataStore.userSessionRepo.deleteById(session.id).map { _ =>
          Redirect(redirect).removingFromSession("sessionId")(ctx.request)
        }
    }
  }

  def userLogout() = DaikokuAction { ctx =>
    Redirect(
      fr.maif.otoroshi.daikoku.ctrls.routes.LoginController
        .logout(ctx.tenant.authProvider.name))
  }

  ///////// Local login module routes /////////////

  val passwordPattern = java.util.regex.Pattern
    .compile("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[#$^+=!*()@%&]).{8,1000}$")

  def validateUserCreationForm(name: String,
                               email: String,
                               password1: String,
                               password2: String): Either[String, Unit] = {

    if (name.trim().isEmpty()) {
      Left("Name should not be empty")
    } else if (email.trim().isEmpty()) {
      Left("Email address should not be empty")
    } else {
      (password1.trim(), password2.trim()) match {
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
      (body \ "avatar").asOpt[String].getOrElse("/assets/images/anonymous.jpg")
    val password1 = (body \ "password1").as[String]
    val password2 = (body \ "password2").as[String]
    env.dataStore.userRepo.findOne(Json.obj("email" -> email)).flatMap {
      case Some(_) =>
        FastFuture.successful(
          BadRequest(Json.obj("error" -> "Email address already exists")))
      case None => {
        validateUserCreationForm(name, email, password1, password2) match {
          case Left(msg) =>
            FastFuture.successful(BadRequest(Json.obj("error" -> msg)))
          case Right(_) => {
            val randomId = IdGenerator.token(128)
            env.dataStore.accountCreationRepo
              .save(AccountCreation(
                id = MongoId(BSONObjectID.generate().stringify),
                randomId = randomId,
                email = email,
                name = name,
                avatar = avatar,
                password = BCrypt.hashpw(password1, BCrypt.gensalt()),
                creationDate = DateTime.now(),
                validUntil = DateTime.now().plusMinutes(15)
              ))
              .flatMap { _ =>
                val host = ctx.request.headers
                  .get("Otoroshi-Proxied-Host")
                  .orElse(ctx.request.headers.get("X-Forwarded-Host"))
                  .getOrElse(ctx.request.host)
                ctx.tenant.mailer
                  .send(
                    s"Validate your ${ctx.tenant.name} account",
                    Seq(email),
                    s"""
                   |Thanks for creating your ${ctx.tenant.name} account, you're almost done.
                   |
                |Please click on the following link to finalize your account creation process
                   |
                |${ctx.request.theProtocol}://${host}/account/validate?id=${randomId}
                   |
                |The ${ctx.tenant.name} team
              """.stripMargin
                  )
                  .map { _ =>
                    Ok(Json.obj("done" -> true))
                  }
              }
          }
        }
      }
    }
  }

  def createUserValidation() = DaikokuTenantAction.async { ctx =>
    ctx.request.getQueryString("id") match {
      case None =>
        FastFuture.successful(BadRequest(Json.obj("error" -> "Id not found")))
      case Some(id) => {
        env.dataStore.accountCreationRepo
          .findOneNotDeleted(Json.obj("randomId" -> id))
          .flatMap {
            case Some(accountCreation)
                if accountCreation.validUntil.isBefore(DateTime.now()) => {
              env.dataStore.accountCreationRepo
                .deleteByIdLogically(accountCreation.id.value)
                .map { _ =>
                  Redirect("/signup?error=not-valid-anymore")
                }
            }
            case Some(accountCreation)
                if accountCreation.validUntil.isAfter(DateTime.now()) => {
              env.dataStore.userRepo
                .findOne(Json.obj("email" -> accountCreation.email))
                .flatMap {
                  case Some(_) =>
                    FastFuture.successful(BadRequest(
                      Json.obj("error" -> "Email address already exists")))
                  case None => {
                    val userId = UserId(BSONObjectID.generate().stringify)
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
                    val user = User(
                      id = userId,
                      tenants = Set(ctx.tenant.id),
                      origins = Set(AuthProvider.Otoroshi),
                      name = accountCreation.name,
                      email = accountCreation.email,
                      picture = accountCreation.avatar,
                      isDaikokuAdmin = false,
                      lastTenant = Some(ctx.tenant.id),
                      password = Some(accountCreation.password),
                      personalToken = Some(IdGenerator.token(32)),
                      defaultLanguage = None
                    )
                    val userCreation = for {
                      _ <- env.dataStore.teamRepo
                        .forTenant(ctx.tenant.id)
                        .save(team)
                      _ <- env.dataStore.userRepo.save(user)
                      _ <- env.dataStore.accountCreationRepo
                        .deleteByIdLogically(accountCreation.id.value)
                    } yield ()
                    userCreation.map { user =>
                      Status(302)(Json.obj("Location" -> "/"))
                        .withHeaders("Location" -> "/")
                    }
                  }
                }
            }
            case _ =>
              FastFuture.successful(
                BadRequest(Json.obj("error" -> "Bad creation id")))
          }
      }
    }
  }

  def askForPasswordReset() = DaikokuTenantAction.async(parse.json) { ctx =>
    val body = ctx.request.body.as[JsObject]
    val email = (body \ "email").as[String]
    val password1 = (body \ "password1").as[String]
    val password2 = (body \ "password2").as[String]
    env.dataStore.userRepo.findOne(Json.obj("email" -> email)).flatMap {
      case Some(user) =>
        validateUserCreationForm("daikoku", email, password1, password2) match {
          case Left(msg) =>
            FastFuture.successful(BadRequest(Json.obj("error" -> msg)))
          case Right(_) => {
            val randomId = IdGenerator.token(128)
            env.dataStore.passwordResetRepo.save(PasswordReset(
              id = MongoId(BSONObjectID.generate().stringify),
              randomId = randomId,
              email = email,
              password = BCrypt.hashpw(password1, BCrypt.gensalt()),
              user = user.id,
              creationDate = DateTime.now(),
              validUntil = DateTime.now().plusMinutes(15)
            ))
            val host = ctx.request.headers
              .get("Otoroshi-Proxied-Host")
              .orElse(ctx.request.headers.get("X-Forwarded-Host"))
              .getOrElse(ctx.request.host)
            ctx.tenant.mailer
              .send(
                s"Reset your ${ctx.tenant.name} account password",
                Seq(email),
                s"""
                |You asked to reset your ${ctx.tenant.name} account password.
                |
                |If it was you, please click on the following link to finalize the password resset process
                |
                |${ctx.request.theProtocol}://${host}/account/reset?id=$randomId
                |If not, just ignore this email
                |
                |The ${ctx.tenant.name} team
              """.stripMargin
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
                  Redirect("/reset?error=not-valid-anymore")
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
              FastFuture.successful(
                BadRequest(Json.obj("error" -> "Bad creation id")))
          }
      }
    }
  }
}
