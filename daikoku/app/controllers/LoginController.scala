package fr.maif.otoroshi.daikoku.ctrls

import cats.data.EitherT
import cats.implicits.catsSyntaxOptionId
import com.eatthepath.otp.TimeBasedOneTimePasswordGenerator
import com.google.common.base.Charsets
import controllers.{AppError, Assets}
import fr.maif.otoroshi.daikoku.actions.{
  DaikokuAction,
  DaikokuActionMaybeWithoutUser,
  DaikokuTenantAction,
  DaikokuTenantActionContext
}
import fr.maif.otoroshi.daikoku.audit.{AuditTrailEvent, AuthorizationLevel}
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async.UberPublicUserAccess
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.login.AuthProvider._
import fr.maif.otoroshi.daikoku.login._
import fr.maif.otoroshi.daikoku.utils.Cypher.decrypt
import fr.maif.otoroshi.daikoku.utils.future.EnhancedObject
import fr.maif.otoroshi.daikoku.utils.{
  AccountCreationService,
  Cypher,
  Errors,
  IdGenerator,
  Translator
}
import org.apache.commons.codec.binary.Base32
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.pattern.after
import org.joda.time.DateTime
import org.mindrot.jbcrypt.BCrypt
import play.api.libs.json.{JsObject, JsString, JsValue, Json}
import play.api.mvc._

import java.net.URLEncoder
import java.time.Instant
import java.util.Base64
import java.util.concurrent.TimeUnit
import javax.crypto.KeyGenerator
import javax.crypto.spec.SecretKeySpec
import scala.collection.concurrent.TrieMap
import scala.concurrent.duration.{DurationInt, FiniteDuration}
import scala.concurrent.{ExecutionContext, Future}

class LoginController(
    DaikokuAction: DaikokuAction,
    DaikokuActionMaybeWithoutUser: DaikokuActionMaybeWithoutUser,
    DaikokuTenantAction: DaikokuTenantAction,
    env: Env,
    cc: ControllerComponents,
    translator: Translator,
    assets: Assets,
    accountCreationService: AccountCreationService
) extends AbstractController(cc) {
  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env
  implicit val tr: Translator = translator
  implicit val as: ActorSystem = env.defaultActorSystem

  def loginContext(provider: String) =
    DaikokuActionMaybeWithoutUser { _ =>
      Ok(
        Json.obj(
          "action" -> fr.maif.otoroshi.daikoku.ctrls.routes.LoginController
            .login(provider)
            .url
        )
      )
    }

  def loginPage(provider: String) =
    DaikokuTenantAction.async { ctx =>
      AuthProvider(provider) match {
        case None =>
          Errors.craftResponseResultF(
            "Bad authentication provider",
            Results.BadRequest
          )
        case Some(p)
            if ctx.tenant.authProvider != p && p != AuthProvider.Local =>
          Errors.craftResponseResultF(
            "Bad authentication provider",
            Results.BadRequest
          )
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
              val (codeVerifier, codeChallenge, codeChallengeMethod) = OAuth2Support.generatePKCECodes(authConfig.pkceConfig.map(_.algorithm))
              val (loginUrl, sessionParams) = if (authConfig.pkceConfig.exists(_.enabled)) {
                (s"${authConfig.loginUrl}?scope=$scope&client_id=$clientId&response_type=$responseType&redirect_uri=$redirectUri&code_challenge=$codeChallenge&code_challenge_method=$codeChallengeMethod", Seq("code_verifier" -> codeVerifier))
              } else {
                (s"${authConfig.loginUrl}?scope=$scope&client_id=$clientId&response_type=$responseType&redirect_uri=$redirectUri", Seq.empty[(String, String)])
              }

              FastFuture.successful(
                Redirect(
                  loginUrl
                ).addingToSession(
                  sessionParams ++ Map("redirect" -> redirect.getOrElse("/")):_*,

                )
              )
            case _ if env.config.isDev =>
              FastFuture.successful(
                Redirect(
                  env.getDaikokuUrl(ctx.tenant, s"/auth/${p.name}/login")
                )
              )
            case _ => assets.at("index.html").apply(ctx.request)
          }
      }
    }

  def bindUser(
      sessionMaxAge: Int,
      tenant: Tenant,
      request: RequestHeader,
      f: => Future[Option[User]]
  ): Future[Result] = {
    f.flatMap {
      case None =>
        after(3.seconds)(
          FastFuture.successful(BadRequest(Json.obj("error" -> true)))
        )
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
                )
              )
              .flatMap {
                case true =>
                  FastFuture.successful(Redirect(s"/2fa?token=$token"))
                case false =>
                  after(3.seconds)(
                    FastFuture.successful(BadRequest(Json.obj("error" -> true)))
                  )
              }
          case _ => createSession(sessionMaxAge, user, request, tenant)
        }
    }
  }

  private def createSession(
      sessionMaxAge: Int,
      user: User,
      request: RequestHeader,
      tenant: Tenant
  ) = {
    env.dataStore.userSessionRepo
      .findOne(Json.obj("userEmail" -> user.email))
      .map {
        case Some(session) =>
          session.copy(expires = DateTime.now().plusSeconds(sessionMaxAge))
        case None =>
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
      }
      .flatMap { session =>
        env.dataStore.userSessionRepo.save(session).map { _ =>
          AuditTrailEvent(
            s"${user.name} has connected to ${tenant.name} with ${user.email} address"
          ).logTenantAuditEvent(
            tenant,
            user,
            session,
            request,
            TrieMap[String, String](),
            AuthorizationLevel.AuthorizedSelf
          )

          var redirectUri = request.session
            .get("redirect")
            .getOrElse(request.getQueryString("redirect").getOrElse("/"))

          redirectUri =
            if (redirectUri.startsWith("/api/")) "/" else redirectUri

          try {
            redirectUri = new String(
              Base64.getUrlDecoder.decode(redirectUri),
              Charsets.UTF_8
            )
          } catch {
            case _: Throwable =>
          }

          Redirect(redirectUri)
            .withSession("sessionId" -> session.sessionId.value)
            .removingFromSession("redirect")(request)
        }
      }
  }

  def actualLogin(
      provider: String,
      ctx: DaikokuTenantActionContext[AnyContent]
  ): Future[Result] = {
    AuthProvider(provider) match {
      case None =>
        after(3.seconds)(
          Errors.craftResponseResultF(
            "Bad authentication provider",
            Results.BadRequest
          )
        )

      case Some(p) if ctx.tenant.authProvider != p && p != AuthProvider.Local =>
        after(3.seconds)(
          Errors.craftResponseResultF(
            "Bad authentication provider",
            Results.BadRequest
          )
        )
      case Some(p) if p == AuthProvider.OAuth2 =>
        val maybeOAuth2Config =
          OAuth2Config.fromJson(ctx.tenant.authProviderSettings)

        maybeOAuth2Config match {
          case Right(authConfig) =>
            bindUser(
              authConfig.sessionMaxAge,
              ctx.tenant,
              ctx.request,
              OAuth2Support
                .bindUser(ctx.request, authConfig, ctx.tenant, env)
                .map(_.toOption)
            )
          case Left(e) =>
            after(3.seconds)(
              Errors.craftResponseResultF(
                "Invalid OAuth Config",
                Results.BadRequest
              )
            )
        }
      case Some(p) =>
        ctx.request.body.asFormUrlEncoded match {
          case None =>
            Errors.craftResponseResultF(
              "No credentials found",
              Results.BadRequest
            )
          case Some(form) =>
            (
              form.get("username").map(_.last).map(_.toLowerCase),
              form.get("password").map(_.last)
            ) match {
              case (Some(username), Some(password)) =>
                p match {
                  case AuthProvider.Local =>
                    AuditTrailEvent(
                      s"unauthenticated user with $username has tried to login [local provider]"
                    ).logUnauthenticatedUserEvent(ctx.tenant)
                    val localConfig = LocalLoginConfig.fromJsons(
                      ctx.tenant.authProviderSettings
                    )
                    bindUser(
                      localConfig.sessionMaxAge,
                      ctx.tenant,
                      ctx.request,
                      LocalLoginSupport
                        .bindUser(username, password, ctx.tenant, env)
                    )
                  case AuthProvider.Otoroshi =>
                    // as otoroshi already done the job, nothing to do here
                    AuditTrailEvent(
                      s"unauthenticated user with $username has tried to login [Otoroshi provider]"
                    ).logUnauthenticatedUserEvent(ctx.tenant)
                    FastFuture.successful(
                      Redirect(
                        ctx.request.session.get("redirect").getOrElse("/")
                      ).removingFromSession(
                        "redirect"
                      )(ctx.request)
                    )
                  case AuthProvider.LDAP =>
                    AuditTrailEvent(
                      s"unauthenticated user with $username has tried to login [LDAP provider]"
                    ).logUnauthenticatedUserEvent(ctx.tenant)
                    val ldapConfig =
                      LdapConfig.fromJsons(ctx.tenant.authProviderSettings)

                    LdapSupport.bindUser(
                      username,
                      password,
                      ctx.tenant,
                      env,
                      Some(ldapConfig)
                    ) match {
                      case Left(_) =>
                        val localConfig = LocalLoginConfig.fromJsons(
                          ctx.tenant.authProviderSettings
                        )
                        bindUser(
                          localConfig.sessionMaxAge,
                          ctx.tenant,
                          ctx.request,
                          LocalLoginSupport
                            .bindUser(username, password, ctx.tenant, env)
                        )
                      case Right(user) =>
                        bindUser(
                          ldapConfig.sessionMaxAge,
                          ctx.tenant,
                          ctx.request,
                          user.map(u => Some(u))
                        )
                    }
                  case _ =>
                    after(3.seconds)(
                      Errors.craftResponseResultF(
                        "No matching provider found",
                        Results.BadRequest
                      )
                    )
                }
              case _ =>
                after(3.seconds)(
                  Errors.craftResponseResultF(
                    "No credentials found",
                    Results.BadRequest
                  )
                )
            }
        }
    }
  }

  def login(provider: String) =
    DaikokuTenantAction.async { ctx =>
      actualLogin(provider, ctx)
    }

  def loginGet(provider: String) =
    DaikokuTenantAction.async { ctx =>
      actualLogin(provider, ctx)
    }

  def logout() =
    DaikokuAction.async { ctx =>
      val host = ctx.request.headers
        .get("Otoroshi-Proxied-Host")
        .orElse(ctx.request.headers.get("X-Forwarded-Host"))
        .getOrElse(ctx.request.host)
      val redirect = ctx.request
        .getQueryString("redirect")
        .getOrElse(env.getDaikokuUrl(ctx.tenant, "/"))

      AuthProvider(ctx.tenant.authProvider.name) match {
        case Some(AuthProvider.Otoroshi) =>
          val session = ctx.request.attrs(IdentityAttrs.SessionKey)
          env.dataStore.userSessionRepo.deleteById(session.id).map { _ =>
            AuditTrailEvent(
              s"${session.userEmail} disconnect his account from ${ctx.tenant.name} [Otoroshi provider]"
            ).logTenantAuditEvent(
              ctx.tenant,
              ctx.user,
              session,
              ctx.request,
              ctx.ctx,
              AuthorizationLevel.AuthorizedSelf
            )
            Redirect(s"/.well-known/otoroshi/logout?redirect=$redirect")
          }
        case Some(AuthProvider.OAuth2) =>
          val session = ctx.request.attrs(IdentityAttrs.SessionKey)
          env.dataStore.userSessionRepo.deleteById(session.id).map { _ =>
            AuditTrailEvent(
              s"${session.userEmail} disconnect his account from ${ctx.tenant.name} [OAuth2 provider]"
            ).logTenantAuditEvent(
              ctx.tenant,
              ctx.user,
              session,
              ctx.request,
              ctx.ctx,
              AuthorizationLevel.AuthorizedSelf
            )
            Redirect(
              OAuth2Config
                .fromJson(ctx.tenant.authProviderSettings) match {
                case Left(_) => redirect
                case Right(config: OAuth2Config) =>
                  config.logoutUrl
                    .replace(
                      "${redirect}",
                      URLEncoder.encode(redirect, "UTF-8")
                    )
              }
            ).removingFromSession("sessionId")(ctx.request)
          }
        case _ =>
          val session = ctx.request.attrs(IdentityAttrs.SessionKey)
          env.dataStore.userSessionRepo.deleteById(session.id).map { _ =>
            AuditTrailEvent(
              s"${session.userEmail} disconnect his account from ${ctx.tenant.name} [Local/Other provider]"
            ).logTenantAuditEvent(
              ctx.tenant,
              ctx.user,
              session,
              ctx.request,
              ctx.ctx,
              AuthorizationLevel.AuthorizedSelf
            )
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
      confirmPassword: String
  ): Either[AppError, Unit] = {

    if (name.trim().isEmpty()) {
      Left(AppError.BadRequestError("Name should not be empty"))
    } else if (email.trim().isEmpty()) {
      Left(AppError.BadRequestError("Email address should not be empty"))
    } else {
      (password.trim(), confirmPassword.trim()) match {
        case (pwd1, pwd2) if pwd1 != pwd2 =>
          Left(AppError.BadRequestError("Your passwords does not match"))
        case (pwd1, pwd2) if pwd1.isEmpty || pwd2.isEmpty =>
          Left(AppError.BadRequestError("Your password can't be empty"))
        case (pwd1, _) if passwordPattern.matcher(pwd1).matches() => Right(())
        case _ =>
          Left(
            AppError.BadRequestError(
              "Your password should be longer than 8 characters and contains letters, capitalized letters, numbers and special characters (#$^+=!*()@%&) !"
            )
          )
      }
    }
  }

  def createUser() =
    DaikokuTenantAction.async(parse.json) { ctx =>
      val body = ctx.request.body.as[JsObject]
      val email = (body \ "email").as[String]
      val name = (body \ "name").as[String]
      val avatar = (body \ "avatar").asOpt[String].getOrElse(User.DEFAULT_IMAGE)
      val password = (body \ "password").as[String]
      val confirmPawword = (body \ "confirmPassword").as[String]

      //verifier le resultat du formulaire
      //verifier que le user n'existe pas deja
      //passer a l'etape suivante

      (for {
        maybeUser <- EitherT.liftF(
          env.dataStore.userRepo.findOne(Json.obj("email" -> email))
        )
        //todo: tester la presence desessentiel ??
        _ <- EitherT.cond[Future](
          maybeUser.forall(u =>
            u.invitation.nonEmpty && u.invitation.exists(!_.registered)
          ),
          (),
          AppError.EntityConflict("Email address already exists")
        )
        randomId = IdGenerator.token(128)
        accountCreationId = DemandId(IdGenerator.token(32))
        _ <- EitherT.fromEither[Future](
          validateUserCreationForm(
            name,
            email,
            password,
            confirmPawword
          )
        )
        _ <- EitherT.liftF(
          env.dataStore.accountCreationRepo.save(
            AccountCreation(
              id = accountCreationId,
              randomId = randomId,
              email = email,
              avatar = avatar,
              name = name,
              password = BCrypt.hashpw(password, BCrypt.gensalt()),
              creationDate = DateTime.now(),
              validUntil = DateTime.now().plusMinutes(15),
              steps = ctx.tenant.accountCreationProcess.map(step =>
                SubscriptionDemandStep(
                  id = SubscriptionDemandStepId(IdGenerator.token),
                  state = step match {
                    case _: ValidationStep.Form =>
                      SubscriptionDemandState.Accepted
                    case _ => SubscriptionDemandState.Waiting
                  },
                  step = step
                )
              ),
              state = SubscriptionDemandState.Waiting,
              value = body - "confirmPassword" - "password",
              fromTenant = ctx.tenant.id
            )
          )
        )
        result <- accountCreationService.runAccountCreationProcess(
          accountCreationId,
          ctx.tenant
        )
      } yield result)
        .leftMap(_.render())
        .merge
    }

  def validateAccountCreationAttempt() = {
    DaikokuActionMaybeWithoutUser.async { ctx =>
      (for {
        encryptedToken <- EitherT.fromOption[Future](
          ctx.request.getQueryString("token"),
          AppError.EntityNotFound("token from query")
        )
        token <- EitherT.pure[Future, AppError](
          decrypt(env.config.cypherSecret, encryptedToken, ctx.tenant)
        )
        validator <- EitherT.fromOptionF(
          env.dataStore.stepValidatorRepo
            .forTenant(ctx.tenant)
            .findOneNotDeleted(Json.obj("token" -> token)),
          AppError.EntityNotFound("token")
        )

        _ <- accountCreationService.validateAccountCreationWithStepValidator(
          validator,
          ctx.tenant
        )
        result <- EitherT.pure[Future, AppError](
          Redirect(env.getDaikokuUrl(ctx.tenant, "/response"))
        )
      } yield result)
        .leftMap(error =>
          Errors.craftResponseResult(
            message = error.getErrorMessage(),
            status = Results.Ok
          )
        )
        .merge
    }
  }

  def declineAccountCreationAttempt() =
    DaikokuActionMaybeWithoutUser.async { ctx =>
      (for {
        encryptedToken <- EitherT.fromOption[Future](
          ctx.request.getQueryString("token"),
          AppError.EntityNotFound("token from query")
        )
        token <- EitherT.pure[Future, AppError](
          decrypt(env.config.cypherSecret, encryptedToken, ctx.tenant)
        )
        validator <- EitherT.fromOptionF(
          env.dataStore.stepValidatorRepo
            .forTenant(ctx.tenant)
            .findOneNotDeleted(Json.obj("token" -> token)),
          AppError.EntityNotFound("token")
        )
        _ <- accountCreationService.declineAccountCreationWithStepValidator(
          validator,
          ctx.tenant
        )
        result <- EitherT.pure[Future, AppError](
          Redirect(
            env.getDaikokuUrl(
              ctx.tenant,
              "/response?message=home.message.subscription.refusal.successfull"
            )
          )
        )
      } yield result)
        .leftMap(error =>
          Errors.craftResponseResult(
            message = error.getErrorMessage(),
            status = Results.Ok
          )
        )
        .merge
    }

  def createUserValidation() =
    DaikokuTenantAction.async { ctx =>
      ctx.request.getQueryString("id") match {
        case None =>
          Errors.craftResponseResultF(
            "The user creation has failed.",
            Results.BadRequest
          )
        case Some(id) =>
          env.dataStore.accountCreationRepo
            .findOneNotDeleted(Json.obj("randomId" -> id))
            .flatMap {
              case Some(accountCreation)
                  if accountCreation.validUntil.isBefore(DateTime.now()) =>
                env.dataStore.accountCreationRepo
                  .deleteByIdLogically(accountCreation.id.value)
                  .map { _ =>
                    Redirect("/signup?error=not.valid.anymore")
                  }
              case Some(accountCreation)
                  if accountCreation.validUntil.isAfter(DateTime.now()) =>
                env.dataStore.userRepo
                  .findOne(Json.obj("email" -> accountCreation.email))
                  .flatMap {
                    case Some(user)
                        if user.invitation.isEmpty || user.invitation.get.registered =>
                      Errors.craftResponseResultF(
                        "This account is already enabled.",
                        Results.BadRequest
                      )
                    case optUser =>
                      val userId = optUser
                        .map(_.id)
                        .getOrElse(UserId(IdGenerator.token(32)))
                      val team = Team(
                        id = TeamId(IdGenerator.token(32)),
                        tenant = ctx.tenant.id,
                        `type` = TeamType.Personal,
                        name = s"${accountCreation.name}",
                        description = s"Team of ${accountCreation.name}",
                        users = Set(UserWithPermission(userId, Administrator)),
                        authorizedOtoroshiEntities = None,
                        contact = accountCreation.email
                      )
                      def getUser() =
                        User(
                          id = userId,
                          tenants = Set(ctx.tenant.id),
                          origins = Set(ctx.tenant.authProvider),
                          name = accountCreation.name,
                          email = accountCreation.email,
                          picture = accountCreation.avatar,
                          lastTenant = Some(ctx.tenant.id),
                          password = Some(accountCreation.password),
                          personalToken = Some(IdGenerator.token(32)),
                          defaultLanguage = None
                        )

                      val user = optUser
                        .map { u =>
                          getUser().copy(invitation =
                            u.invitation.map(_.copy(registered = true))
                          )
                        }
                        .getOrElse(getUser())

                      val userCreation = for {
                        _ <-
                          env.dataStore.teamRepo
                            .forTenant(ctx.tenant.id)
                            .save(team)
                        _ <- env.dataStore.userRepo.save(user)
                        _ <-
                          env.dataStore.accountCreationRepo
                            .deleteByIdLogically(accountCreation.id.value)
                      } yield ()
                      userCreation.map { _ =>
                        Status(302)(
                          Json.obj(
                            "Location" -> "/?message=user.validated.success"
                          )
                        ).withHeaders(
                          "Location" -> "/?message=user.validated.success"
                        )
                      }
                  }
              case _ =>
                Errors.craftResponseResultF(
                  "Your link is invalid",
                  Results.BadRequest
                )
            }
      }
    }

  def askForPasswordReset() =
    DaikokuTenantAction.async(parse.json) { ctx =>
      val body = ctx.request.body.as[JsObject]
      val email = (body \ "email").as[String]
//      val password = (body \ "password").as[String]
//      val confirmPassword = (body \ "confirmPassword").as[String]

      AuditTrailEvent(
        s"unauthenticated user with $email ask to reset password"
      ).logUnauthenticatedUserEvent(ctx.tenant)

      val tenantLanguage = ctx.tenant.defaultLanguage.getOrElse("en")

      (for {
        user <- EitherT.fromOptionF[Future, AppError, User](
          env.dataStore.userRepo.findOne(Json.obj("email" -> email)),
          AppError.UserNotFound(None)
        )
        randomId = IdGenerator.token(128)
        _ <- EitherT.liftF[Future, AppError, Boolean](
          env.dataStore.passwordResetRepo.save(
            PasswordReset(
              id = DatastoreId(IdGenerator.token(32)),
              randomId = randomId,
              email = email,
              password = "",
              user = user.id,
              creationDate = DateTime.now(),
              validUntil = DateTime.now().plusMinutes(15)
            )
          )
        )

        cypheredId =
          Cypher.encrypt(env.config.cypherSecret, randomId, ctx.tenant)
        link = env.getDaikokuUrl(ctx.tenant, s"/reset/password?id=$cypheredId")
        language: String = user.defaultLanguage.getOrElse(tenantLanguage)
        title <- EitherT.liftF[Future, AppError, String](
          translator.translate(
            "mail.reset.password.title",
            ctx.tenant,
            Map(
              "tenant" -> JsString(ctx.tenant.name),
              "tenant_data" -> ctx.tenant.toUiPayload(env)
            )
          )(messagesApi, language, env)
        )
        body <- EitherT.liftF[Future, AppError, String](
          translator.translate(
            "mail.reset.password.body",
            ctx.tenant,
            Map(
              "mail" -> JsString(email),
              "tenant" -> JsString(ctx.tenant.name),
              "link" -> JsString(link),
              "tenant_data" -> ctx.tenant.toUiPayload(env)
            )
          )(messagesApi, language, env)
        )
        _ <- EitherT.liftF[Future, AppError, Unit](
          ctx.tenant.mailer
            .send(
              title,
              Seq(email),
              body,
              ctx.tenant
            )(
              ec = ec,
              translator = tr,
              messagesApi = messagesApi,
              env = env,
              language = language
            )
        )

      } yield Ok(Json.obj("done" -> true)))
        .leftMap(_.render())
        .merge
    }

  def passwordResetValidation() =
    DaikokuTenantAction.async(parse.json) { ctx =>
      val body = ctx.request.body.as[JsObject]
      val email = (body \ "email").as[String]
      val password = (body \ "password").as[String]
      val confirmPassword = (body \ "confirmPassword").as[String]

      (for {
        user <- EitherT.fromOptionF[Future, AppError, User](
          env.dataStore.userRepo
            .findOneNotDeleted(Json.obj("email" -> email)),
          AppError.BadRequestError("password.reset.error.unknown.user")
        )
        _ <- EitherT.cond[Future][AppError, Unit](
          ctx.tenant.authProvider == AuthProvider.Local,
          (),
          AppError.BadRequestError(
            "AuthProvider doesn't provide password reset"
          )
        )
        cypheredId <- EitherT.fromOption[Future][AppError, String](
          ctx.request.getQueryString("id"),
          AppError.BadRequestError("password.reset.error.invalid")
        )
        id = Cypher.decrypt(env.config.cypherSecret, cypheredId, ctx.tenant)
        pwdReset <- EitherT.fromOptionF[Future, AppError, PasswordReset](
          env.dataStore.passwordResetRepo
            .findOneNotDeleted(Json.obj("randomId" -> id, "email" -> email)),
          AppError.BadRequestError("password.reset.error.invalid")
        )
        _ <- EitherT.cond[Future][AppError, Unit](
          pwdReset.validUntil.isAfter(DateTime.now()),
          (),
          AppError.BadRequestError("password.reset.error.expires")
        )
        _ <- EitherT.cond[Future][AppError, Unit](
          password == confirmPassword,
          (),
          AppError.EntityConflict("Passwords matching")
        )
        _ <- EitherT.liftF[Future, AppError, Boolean](
          env.dataStore.userRepo.save(
            user.copy(password = BCrypt.hashpw(password, BCrypt.gensalt()).some)
          )
        )

      } yield Ok(Json.obj("done" -> true)))
        .leftMap(_.render())
        .merge
    }

  def checkLdapConnection() =
    DaikokuAction.async(parse.json) { ctx =>
      if ((ctx.request.body \ "user").isDefined) {
        val username = (ctx.request.body \ "user" \ "username").as[String]
        val password = (ctx.request.body \ "user" \ "password").as[String]

        LdapConfig.fromJson((ctx.request.body \ "config").as[JsValue]) match {
          case Left(_) =>
            FastFuture.successful(
              BadRequest(Json.obj("error" -> "bad auth. module. config"))
            )
          case Right(config) =>
            LdapSupport.bindUser(
              username,
              password,
              ctx.tenant,
              env,
              Some(config)
            ) match {
              case Left(err) =>
                FastFuture.successful(
                  Ok(Json.obj("works" -> false, "error" -> err))
                )
              case Right(_) =>
                FastFuture.successful(Ok(Json.obj("works" -> true)))
            }
        }
      } else {
        LdapConfig.fromJson(ctx.request.body) match {
          case Left(_) =>
            FastFuture.successful(
              BadRequest(Json.obj("error" -> "bad auth. module. config"))
            )
          case Right(config) =>
            LdapSupport
              .checkConnection(config)
              .leftMap(err =>
                Ok(Json.obj("works" -> false, "error" -> err.getErrorMessage()))
              )
              .map(_ => Ok(Json.obj("works" -> true)))
              .merge
        }
      }
    }

  def checkOauthConnection() =
    DaikokuAction.async(parse.json) { ctx =>
      OAuth2Config.fromJson(ctx.request.body) match {
        case Left(_) =>
          FastFuture.successful(
            BadRequest(Json.obj("error" -> "bad auth. module. config"))
          )
        case Right(config) =>
          OAuth2Support
            .checkConnection(config)
            .leftMap(err =>
              Ok(Json.obj("works" -> false, "error" -> err.getErrorMessage()))
            )
            .map(_ => Ok(Json.obj("works" -> true)))
            .merge
      }
    }

  def fetchOauthConfiguration() =
    DaikokuAction.async(parse.json) { ctx =>
      val clientId = (ctx.request.body \ "clientId").asOpt[String]
      val clientSecret = (ctx.request.body \ "clientSecret").asOpt[String]

      (ctx.request.body \ "url").asOpt[String] match {
        case None =>
          BadRequest(Json.obj("error" -> "please provide a url")).future
        case Some(url) =>
          OAuth2Support
            .getConfiguration(url, clientId, clientSecret, ctx.tenant)
            .leftMap(_.render())
            .map(config => Ok(config.asJson))
            .merge
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
              )
            )
            .flatMap {
              case Some(user) if user.twoFactorAuthentication.isDefined =>
                val totp = new TimeBasedOneTimePasswordGenerator()
                val now = Instant.now()
                val later = now.plus(totp.getTimeStep)

                val decodedKey = Base64.getDecoder.decode(
                  user.twoFactorAuthentication.get.secret
                )
                val key =
                  new SecretKeySpec(decodedKey, 0, decodedKey.length, "AES")

                if (
                  code == totp.generateOneTimePassword(key, now).toString ||
                  code == totp.generateOneTimePassword(key, later).toString
                )
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
                    BadRequest(Json.obj("error" -> "Invalid code"))
                  )
              case _ =>
                FastFuture.successful(
                  BadRequest(Json.obj("error" -> "Invalid token"))
                )
            }
        case (_, _) =>
          FastFuture.successful(
            BadRequest(Json.obj("error" -> "Missing parameters"))
          )
      }
    }

  def reset2fa() =
    DaikokuTenantAction.async(parse.json) { ctx =>
      (ctx.request.body \ "backupCodes").asOpt[String] match {
        case None =>
          FastFuture.successful(
            BadRequest(Json.obj("error" -> "Missing body fields"))
          )
        case Some(backupCodes) =>
          env.dataStore.userRepo
            .findOne(
              Json.obj(
                "twoFactorAuthentication.backupCodes" -> backupCodes
              )
            )
            .flatMap {
              case Some(user) =>
                user.twoFactorAuthentication match {
                  case None =>
                    FastFuture.successful(
                      BadRequest(
                        Json.obj("error" -> "2FA not enabled on this account")
                      )
                    )
                  case Some(auth) =>
                    if (auth.backupCodes != backupCodes)
                      FastFuture.successful(
                        BadRequest(Json.obj("error" -> "Wrong backup codes"))
                      )
                    else
                      env.dataStore.userRepo
                        .save(user.copy(twoFactorAuthentication = None))
                        .flatMap {
                          case false =>
                            FastFuture.successful(
                              BadRequest(
                                Json.obj(
                                  "error" -> "Something happens when updating user"
                                )
                              )
                            )
                          case true =>
                            FastFuture.successful(
                              Ok(
                                Json.obj(
                                  "message" -> "2FA successfully disabled - You can now login"
                                )
                              )
                            )
                        }
                }
              case _ =>
                FastFuture.successful(
                  NotFound(Json.obj("error" -> "User not found"))
                )
            }
      }
    }
}
