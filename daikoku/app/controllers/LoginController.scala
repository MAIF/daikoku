package fr.maif.otoroshi.daikoku.ctrls

import cats.data.EitherT
import cats.implicits.catsSyntaxOptionId
import com.eatthepath.otp.TimeBasedOneTimePasswordGenerator
import com.google.common.base.Charsets
import controllers.{AppError, Assets}
import fr.maif.otoroshi.daikoku.actions.{DaikokuAction, DaikokuActionMaybeWithoutUser, DaikokuTenantAction, DaikokuTenantActionContext}
import fr.maif.otoroshi.daikoku.audit.{AuditTrailEvent, AuthorizationLevel}
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async.PublicUserAccess
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.login.AuthProvider._
import fr.maif.otoroshi.daikoku.login._
import fr.maif.otoroshi.daikoku.utils.future.EnhancedObject
import fr.maif.otoroshi.daikoku.utils.{Cypher, Errors, IdGenerator, Translator}
import io.bullet.borer.Dom.ByteArrayElem
import io.bullet.borer._
import org.apache.commons.codec.binary.Base32
import org.apache.pekko.Done
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.pattern.after
import org.joda.time.DateTime
import org.mindrot.jbcrypt.BCrypt
import play.api.libs.json.{Json, _}
import play.api.mvc._

import java.math.BigInteger
import java.net.URLEncoder
import java.nio.{ByteBuffer, ByteOrder}
import java.security.SecureRandom
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
          Errors.craftResponseResult(
            "Bad authentication provider",
            Results.BadRequest,
            ctx.request,
            None,
            env
          )
        case Some(p)
            if ctx.tenant.authProvider != p && p != AuthProvider.Local =>
          Errors.craftResponseResult(
            "Bad authentication provider",
            Results.BadRequest,
            ctx.request,
            None,
            env
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
              val scope = authConfig.scope
              val redirectUri = authConfig.callbackUrl
              val loginUrl =
                s"${authConfig.loginUrl}?scope=$scope&client_id=$clientId&response_type=$responseType&redirect_uri=$redirectUri"
              FastFuture.successful(
                Redirect(
                  loginUrl
                ).addingToSession(
                  s"redirect" -> redirect.getOrElse("/")
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
      f: => Future[Option[User]],
      bypass2fa: Boolean = false
  ): Future[Result] = {
    f.flatMap {
      case None =>
        after(3.seconds)(
          FastFuture.successful(BadRequest(Json.obj("error" -> true)))
        )
      case Some(user) =>
        (user.twoFactorAuthentication, user.passkeys) match {
          case (Some(auth), passkeys) if (auth.enabled || passkeys.nonEmpty) && !bypass2fa =>
            val keyGenerator = KeyGenerator.getInstance("HmacSHA1")
            keyGenerator.init(160)
            val token =
              new Base32().encodeAsString(keyGenerator.generateKey.getEncoded)

            //todo: put token in cache instead of db
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
          Errors.craftResponseResult(
            "Bad authentication provider",
            Results.BadRequest,
            ctx.request,
            None,
            env
          )
        )

      case Some(p) if ctx.tenant.authProvider != p && p != AuthProvider.Local =>
        after(3.seconds)(
          Errors.craftResponseResult(
            "Bad authentication provider",
            Results.BadRequest,
            ctx.request,
            None,
            env
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
            AppLogger.error("Error during OAuthConfig read", e)
            after(3.seconds)(
              Errors.craftResponseResult(
                "Invalid OAuth Config",
                Results.BadRequest,
                ctx.request,
                None,
                env
              )
            )
        }
      case Some(p) =>
        ctx.request.body.asFormUrlEncoded match {
          case None =>
            Errors.craftResponseResult(
              "No credentials found",
              Results.BadRequest,
              ctx.request,
              None,
              env
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
                      Errors.craftResponseResult(
                        "No matching provider found",
                        Results.BadRequest,
                        ctx.request,
                        None,
                        env
                      )
                    )
                }
              case _ =>
                after(3.seconds)(
                  Errors.craftResponseResult(
                    "No credentials found",
                    Results.BadRequest,
                    ctx.request,
                    None,
                    env
                  )
                )
            }
        }
    }
  }

  def beginPasskeyLogin() =
    DaikokuActionMaybeWithoutUser.async(parse.json) { ctx =>
      val challengeId = (ctx.request.body \ "challengeId").as[String]
      val challenge = PasskeyUtils.generateSecureChallenge()

      val assertionOptions = AssertionOptions(
        challenge = challenge,
        allowCredentials = Seq.empty,
        userVerification = "preferred"
      )

      val key = s"passkey_login_challenge_$challengeId"

      val passkeyChallenge = PasskeyChallenge(
        id = DatastoreId(IdGenerator.token(32)),
        tenant = ctx.tenant.id,
        key = key,
        value = challenge,
        expires = DateTime.now().plusMinutes(2))
      for {
        _ <- env.dataStore.passkeyChallengeRepo.forTenant(ctx.tenant)
        .save(passkeyChallenge)
      } yield {
        Ok(assertionOptions.asJson)
      }
    }

  def completePasskeyLogin() =
    DaikokuActionMaybeWithoutUser.async(parse.json) { ctx =>
      val assertionData = ctx.request.body
      val challengeId = (ctx.request.body \ "challengeId").as[String]

      val challengeKey = s"passkey_login_challenge_$challengeId"


      (for {
        //todo: check if expires
        storedChallenge <- EitherT.fromOptionF(
          env.dataStore.passkeyChallengeRepo.findByKey(challengeKey, ctx.tenant),
          AppError.SecurityError("Challenge expired or missing")
        )
        _ <- EitherT.cond[Future](storedChallenge.expires.isAfter(DateTime.now), (), AppError.SecurityError("Challenge expired"))
        _ <- EitherT.liftF[Future, AppError, Boolean](env.dataStore.passkeyChallengeRepo.forTenant(ctx.tenant).deleteById(storedChallenge.id))
        credentialId = (assertionData \ "id").as[String]
        authenticatorDataB64 =
          (assertionData \ "response" \ "authenticatorData").as[String]
        clientDataJSON =
          (assertionData \ "response" \ "clientDataJSON").as[String]
        signatureB64 = (assertionData \ "response" \ "signature").as[String]
        clientData <- EitherT.fromEither[Future](
          PasskeyUtils.decodeClientData(clientDataJSON)
        )
        _ <- EitherT.cond[Future](
          PasskeyUtils.normalizeBase64(clientData.challenge) == PasskeyUtils
            .normalizeBase64(storedChallenge.value),
          (),
          AppError.SecurityError("Challenge mismatch")
        )
        expectedOrigin = env.getDaikokuUrl(ctx.tenant, "")
        _ <- EitherT.cond[Future](
          clientData.origin == expectedOrigin,
          (),
          AppError.SecurityError("Origin mismatch")
        )
        user <- EitherT.fromOptionF(
          env.dataStore.userRepo
            .findOneNotDeleted(Json.obj("passkeys.id" -> credentialId)),
          AppError.Unauthorized
        )
        passkey <- EitherT.fromOption[Future](
          user.passkeys.find(_.id == credentialId),
          AppError.SecurityError("Passkey not found for user")
        )
        isValid <- EitherT.fromEither[Future](
          PasskeyUtils.verifyAssertion(
            passkey.publicKey,
            authenticatorDataB64,
            clientDataJSON,
            signatureB64,
            passkey.counter,
            passkey.algorithm
          )
        )
        _ <- EitherT.cond[Future][AppError, Unit](
          isValid.verified,
          (),
          AppError.SecurityError("Invalid signature")
        )
        updatedPasskey = passkey.copy(
          counter = isValid.newCounter,
          lastUsedAt = Some(DateTime.now())
        )

        updatedUser = user.copy(
          passkeys = user.passkeys.map(pk =>
            if (pk.id == credentialId) updatedPasskey else pk
          )
        )

        _ <- EitherT.liftF[Future, AppError, Boolean](
          env.dataStore.userRepo.save(updatedUser)
        )
        localConfig = LocalLoginConfig.fromJsons(
          ctx.tenant.authProviderSettings
        )
        login <- EitherT.liftF[Future, AppError, Result](bindUser(
          sessionMaxAge = localConfig.sessionMaxAge,
          tenant = ctx.tenant,
          request = ctx.request,
          f = user.some.future,
          bypass2fa = true
        ))
      } yield {
        AuditTrailEvent(
          s"unauthenticated user has logged in with passkey -- user found with name ${user.name} ans id ${user.id}"
        ).logUnauthenticatedUserEvent(ctx.tenant)
        login
      })
        .leftMap(e => e.render())
        .merge
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
  ): Either[String, Unit] = {

    if (name.trim().isEmpty()) {
      Left("Name should not be empty")
    } else if (email.trim().isEmpty()) {
      Left("Email address should not be empty")
    } else {
      Right(())
//      (password.trim(), confirmPassword.trim()) match {
//        case (pwd1, pwd2) if pwd1 != pwd2 =>
//          Left("Your passwords does not match")
//        case (pwd1, pwd2) if pwd1.isEmpty || pwd2.isEmpty =>
//          Left("Your password can't be empty")
//        case (pwd1, _) if passwordPattern.matcher(pwd1).matches() => Right(())
//        case _ =>
//          Left(
//            "Your password should be longer than 8 characters and contains letters, capitalized letters, numbers and special characters (#$^+=!*()@%&) !"
//          )
//      }
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

      env.dataStore.userRepo.findOne(Json.obj("email" -> email)).flatMap {
        case Some(user)
            if user.invitation.isEmpty || user.invitation.get.registered =>
          FastFuture.successful(
            BadRequest(Json.obj("error" -> "Email address already exists"))
          )
        case _ =>
          validateUserCreationForm(
            name,
            email,
            password,
            confirmPawword
          ) match {
            case Left(msg) =>
              FastFuture.successful(BadRequest(Json.obj("error" -> msg)))
            case Right(_) =>
              val randomId = IdGenerator.token(128)
              val accountCreation = AccountCreation(
                id = DatastoreId(IdGenerator.token(32)),
                randomId = randomId,
                email = email,
                name = name,
                avatar = avatar,
                password = BCrypt.hashpw(password, BCrypt.gensalt()),
                creationDate = DateTime.now(),
                validUntil = DateTime.now().plusMinutes(15)
              )
              env.dataStore.accountCreationRepo
                .save(accountCreation)
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
                      Map("tenant" -> JsString(ctx.tenant.name))
                    )
                    body <- translator.translate(
                      "mail.new.user.body",
                      ctx.tenant,
                      Map(
                        "tenant" -> JsString(ctx.tenant.name),
                        "link" -> JsString(
                          env.getDaikokuUrl(
                            ctx.tenant,
                            s"/account/validate?id=$randomId"
                          )
                        ),
                        "tenant_data" -> accountCreation.asJson
                      )
                    )
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

  def createUserValidation() =
    DaikokuTenantAction.async { ctx =>
      ctx.request.getQueryString("id") match {
        case None =>
          Errors.craftResponseResult(
            "The user creation has failed.",
            Results.BadRequest,
            ctx.request,
            env = env
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
                      Errors.craftResponseResult(
                        "This account is already enabled.",
                        Results.BadRequest,
                        ctx.request,
                        env = env
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
                Errors.craftResponseResult(
                  "Your link is invalid",
                  Results.BadRequest,
                  ctx.request,
                  env = env
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

      AuditTrailEvent(s"unauthenticated user with $email ask to reset password")
        .logUnauthenticatedUserEvent(ctx.tenant)

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
              "tenant_data" -> ctx.tenant.toUiPayload(env),
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
              "tenant_data" -> ctx.tenant.toUiPayload(env),
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
          env.dataStore.userRepo.findOneNotDeleted(Json.obj("email" -> email)),
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

  def beginPasskeyRegistration() =
    DaikokuAction.async(parse.json) { ctx =>
      val challenge = PasskeyUtils.generateSecureChallenge()
      val key = s"passkey_challenge_registration_${ctx.user.id.value}"
      val passkeyChallenge = PasskeyChallenge(
        id = DatastoreId(IdGenerator.token(32)),
        tenant = ctx.tenant.id,
        key = key,
        value = challenge,
        expires = DateTime.now().plusMinutes(5))

      for {
        _ <- env.dataStore.passkeyChallengeRepo.forTenant(ctx.tenant)
          .save(passkeyChallenge)
      } yield {
        Ok(Json.obj("challenge" -> challenge))
      }

    }

  def completePasskeyRegistration() =
    DaikokuAction.async(parse.json) { ctx =>
      val credentialData = ctx.request.body

      val attestationObjectB64 =
        (ctx.request.body \ "attestationObject").as[String]
      val publicKeyAlgorithm =
        (ctx.request.body \ "publicKeyAlgorithm").as[Int]

      PasskeyUtils.decodeAttestationObject(attestationObjectB64) match {
        case Right(attestationData) =>
          val name = (ctx.request.body \ "name")
            .asOpt[String]
            .orElse(
              PasskeyUtils
                .getAuthenticatorName(
                  Base64.getUrlDecoder.decode(attestationObjectB64)
                )
            )
            .orElse(
              PasskeyUtils.guessAuthenticatorType(
                attestationData.counter,
                ctx.request.headers.get("User-Agent"),
                "cross-platform"
              )
            )

          val passkey = Passkey(
            id = attestationData.credentialId,
            publicKey = attestationData.publicKey,
            counter = attestationData.counter,
            createdAt = DateTime.now(),
            lastUsedAt = None,
            name = name,
            algorithm = publicKeyAlgorithm
          )

          env.dataStore.userRepo
            .save(ctx.user.copy(passkeys = ctx.user.passkeys :+ passkey))
            .map { _ =>
              Ok(Json.obj("success" -> true))
            }

        case Left(error) =>
          Future.successful(BadRequest(Json.obj("error" -> error)))
      }

      (for {
        storedChallenge <- EitherT.fromOptionF[Future, AppError, PasskeyChallenge](
          env.dataStore.passkeyChallengeRepo.findByKey(s"passkey_challenge_registration_${ctx.user.id.value}", ctx.tenant),
          AppError.SecurityError("Challenge expired or missing")
        )
        _ <-
          EitherT.liftF[Future, AppError, Boolean](env.dataStore.passkeyChallengeRepo.forTenant(ctx.tenant).deleteById(storedChallenge.id))
        _ <- EitherT.cond[Future][AppError, Unit](
          storedChallenge.value == (credentialData \ "challengeBuffer").as[String],
          (),
          AppError.SecurityError("Challenge mismatch")
        )
      } yield {
        Ok(Json.obj("done" -> true))
      }).leftMap(_.render()).merge

    }


  def beginPasskeyAssertion() =
    DaikokuActionMaybeWithoutUser.async(parse.json) { ctx =>
      val challengeId = (ctx.request.body \ "challengeId").as[String]
      val challenge = PasskeyUtils.generateSecureChallenge()
//      val allowCredentials =
//        ctx.user.passkeys.map(pk => AllowCredential(pk.id, "public-key"))

      val assertionOptions = AssertionOptions(
        challenge = challenge,
        allowCredentials = Seq.empty,
        userVerification = "preferred"
      )

      val key = s"passkey_asssertion_challenge_$challengeId"

      val passkeyChallenge = PasskeyChallenge(
        id = DatastoreId(IdGenerator.token(32)),
        tenant = ctx.tenant.id,
        key = key,
        value = challenge,
        expires = DateTime.now().plusMinutes(5)
      )
      for {
        _ <- env.dataStore.passkeyChallengeRepo.forTenant(ctx.tenant)
          .save(passkeyChallenge)
      } yield {
        Ok(assertionOptions.asJson)
      }
    }

  def completePasskeyAssertion() =
    DaikokuActionMaybeWithoutUser.async(parse.json) { ctx =>
      val assertionData = ctx.request.body
      val challengeId = (ctx.request.body \ "challengeId").as[String]

      val challengeKey = s"passkey_asssertion_challenge_$challengeId"
      (for {
        storedChallenge <- EitherT.fromOptionF(
          env.dataStore.passkeyChallengeRepo.findByKey(challengeKey, ctx.tenant),
          AppError.SecurityError("Challenge expired or missing")
        )
        _ <- EitherT.liftF[Future, AppError, Boolean](env.dataStore.passkeyChallengeRepo.forTenant(ctx.tenant).deleteById(storedChallenge.id))
        credentialId = (assertionData \ "id").as[String]
        authenticatorDataB64 =
          (assertionData \ "response" \ "authenticatorData").as[String]
        clientDataJSON =
          (assertionData \ "response" \ "clientDataJSON").as[String]
        signatureB64 = (assertionData \ "response" \ "signature").as[String]
        clientData <- EitherT.fromEither[Future](
          PasskeyUtils.decodeClientData(clientDataJSON)
        )

        _ <- EitherT.cond[Future](
          PasskeyUtils.normalizeBase64(clientData.challenge) == PasskeyUtils
            .normalizeBase64(storedChallenge.value),
          (),
          AppError.SecurityError("Challenge mismatch")
        )
        expectedOrigin = env.getDaikokuUrl(ctx.tenant, "")
        _ <- EitherT.cond[Future](
          clientData.origin == expectedOrigin,
          (),
          AppError.SecurityError("Origin mismatch")
        )
        user <- EitherT.fromOptionF(
          env.dataStore.userRepo
            .findOneNotDeleted(Json.obj("passkeys.id" -> credentialId)),
          AppError.Unauthorized
        )
        passkey <- EitherT.fromOption[Future](
          user.passkeys.find(_.id == credentialId),
          AppError.SecurityError("Passkey not found for user")
        )
        isValid <- EitherT.fromEither[Future](
          PasskeyUtils.verifyAssertion(
            passkey.publicKey,
            authenticatorDataB64,
            clientDataJSON,
            signatureB64,
            passkey.counter,
            passkey.algorithm
          )
        )
        _ <- EitherT.cond[Future][AppError, Unit](
          isValid.verified,
          (),
          AppError.SecurityError("Invalid signature")
        )
        updatedPasskey = passkey.copy(
          counter = isValid.newCounter,
          lastUsedAt = Some(DateTime.now())
        )

        updatedUser = user.copy(
          passkeys = user.passkeys.map(pk =>
            if (pk.id == credentialId) updatedPasskey else pk
          )
        )

        _ <- EitherT.liftF[Future, AppError, Boolean](
          env.dataStore.userRepo.save(updatedUser)
        )
      } yield Ok(Json.obj("done" -> true)))
        .leftMap(e => e.render())
        .merge
    }

  def listPasskeys() = {
    DaikokuAction.async { ctx =>
      PublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} has accessed its passkey list"
        )
      )(ctx) {
        FastFuture.successful(Ok(JsArray(ctx.user.passkeys.map(_.asJson))))
      }
    }
  }

  def updatePasskey(id: String) =
    DaikokuAction.async(parse.json) { ctx =>
      PublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} has updated its passkey with id @{passkey.id}"
        )
      )(ctx) {

        (for {
          name <- EitherT.fromOption[Future][AppError, String](
            (ctx.request.body \ "name").asOpt[String],
            AppError.EntityNotFound("name")
          )
          passkey <- EitherT.fromOption[Future][AppError, Passkey](
            ctx.user.passkeys.find(_.id == id),
            AppError.EntityNotFound("passkey")
          )
          _ <- EitherT.liftF[Future, AppError, Boolean](
            env.dataStore.userRepo.save(
              ctx.user
                .copy(passkeys =
                  ctx.user.passkeys.filter(_.id != passkey.id) :+ passkey
                    .copy(name = name.some)
                )
            )
          )
        } yield {
          ctx.setCtxValue("passkey.id", id)
          Ok(Json.obj("done" -> true))
        }).leftMap(_.render())
          .merge
      }
    }

  def deletePasskey(id: String) =
    DaikokuAction.async { ctx =>
      PublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} has deleted its passkey with id @{passkey.id}"
        )
      )(ctx) {

        (for {
          passkey <- EitherT.fromOption[Future][AppError, Passkey](
            ctx.user.passkeys.find(_.id == id),
            AppError.EntityNotFound("passkey")
          )
          _ <- EitherT.liftF[Future, AppError, Boolean](
            env.dataStore.userRepo.save(
              ctx.user
                .copy(passkeys = ctx.user.passkeys.filter(_.id != passkey.id))
            )
          )
        } yield {
          ctx.setCtxValue("passkey.id", id)
          Ok(Json.obj("done" -> true))
        }).leftMap(_.render())
          .merge
      }
    }
}

case class AttestationData(
    publicKey: String,
    credentialId: String,
    counter: Long,
    aaguid: String
)

object PasskeyUtils {

  private val secureRandom = new SecureRandom()

  def generateSecureChallenge(lengthBytes: Int = 32): String = {
    val challengeBytes = new Array[Byte](lengthBytes)
    secureRandom.nextBytes(challengeBytes)
    Base64.getEncoder.encodeToString(challengeBytes)
  }

  def normalizeBase64(input: String): String = {
    input.replace('+', '-').replace('/', '_').replace("=", "")
  }

  def decodeAttestationObject(
      attestationObjectB64: String
  ): Either[String, AttestationData] = {
    try {
      val attestationBytes = Base64.getUrlDecoder.decode(attestationObjectB64)

      val attestationMap =
        Cbor.decode(attestationBytes).to[Map[String, Dom.Element]].value

      attestationMap.get("authData") match {
        case Some(ByteArrayElem(authDataBytes)) =>
          parseAuthData(authDataBytes)
        case _ =>
          Left("authData not found in attestation object")
      }

    } catch {
      case e: Exception =>
        Left(s"Failed to decode attestation: ${e.getMessage}")
    }
  }

  private def parseAuthData(
      authData: Array[Byte]
  ): Either[String, AttestationData] = {
    val buffer = ByteBuffer.wrap(authData)

    buffer.position(37)

    val aaguid = new Array[Byte](16)
    buffer.get(aaguid)
    val aaguidString =
      Base64.getUrlEncoder.withoutPadding().encodeToString(aaguid)

    val credIdLength = buffer.getShort & 0xffff

    val credentialId = new Array[Byte](credIdLength)
    buffer.get(credentialId)
    val credIdString =
      Base64.getUrlEncoder.withoutPadding().encodeToString(credentialId)

    val publicKeyBytes = new Array[Byte](buffer.remaining())
    buffer.get(publicKeyBytes)

    parsePublicKey(publicKeyBytes) match {
      case Right(publicKey) =>
        Right(
          AttestationData(
            publicKey = publicKey,
            credentialId = credIdString,
            counter = getSignatureCounter(authData),
            aaguid = aaguidString
          )
        )
      case Left(error) => Left(error)
    }
  }

  private def parsePublicKey(
      publicKeyBytes: Array[Byte]
  ): Either[String, String] = {
    try {
      val keyMap = Cbor.decode(publicKeyBytes).to[Map[Int, Dom.Element]].value

      keyMap
        .get(3)
        .collect { case Dom.IntElem(alg) => alg } match {
        case Some(-7) => // ES256
          parseES256Key(keyMap)
        case Some(-8) => // EdDSA
          parseEdDSAKey(keyMap)
        case Some(alg) =>
          Left(s"Unsupported algorithm: $alg")
        case None =>
          Left("Algorithm not specified in public key")
      }

    } catch {
      case e: Exception => Left(s"Failed to parse public key: ${e.getMessage}")
    }
  }

  private def parseES256Key(
      keyMap: Map[Int, Dom.Element]
  ): Either[String, String] = {
    for {
      x <- extractByteString(keyMap, -2, "x coordinate")
      y <- extractByteString(keyMap, -3, "y coordinate")
    } yield {
      val fullKey = Array[Byte](0x04.toByte) ++ x ++ y
      Base64.getUrlEncoder.withoutPadding().encodeToString(fullKey)
    }
  }

  private def parseEdDSAKey(
      keyMap: Map[Int, Dom.Element]
  ): Either[String, String] = {
    extractByteString(keyMap, -2, "EdDSA public key").map { pubKey =>
      Base64.getUrlEncoder.withoutPadding().encodeToString(pubKey)
    }
  }

  private def extractByteString(
      map: Map[Int, Dom.Element],
      key: Int,
      name: String
  ): Either[String, Array[Byte]] = {
    map.get(key) match {
      case Some(ByteArrayElem(bytes)) => Right(bytes)
      case _                          => Left(s"$name not found or invalid format")
    }
  }

  def decodeClientData(clientDataJSON: String): Either[AppError, ClientData] = {
    try {
      val decodedBytes = Base64.getUrlDecoder.decode(clientDataJSON)
      val jsonString = new String(decodedBytes, "UTF-8")
      val json = Json.parse(jsonString)

      Right(
        ClientData(
          challenge = (json \ "challenge").as[String],
          origin = (json \ "origin").as[String],
          `type` = (json \ "type").as[String]
        )
      )
    } catch {
      case e: Exception =>
        Left(
          AppError
            .SecurityError(s"Failed to decode client data: ${e.getMessage}")
        )
    }
  }

  def verifyAssertion(
      publicKeyB64: String,
      authenticatorDataB64: String,
      clientDataJSON: String,
      signatureB64: String,
      expectedCounter: Long,
      algorithm: Int
  ): Either[AppError, VerificationResult] = {
    try {
      val authenticatorData = Base64.getUrlDecoder.decode(authenticatorDataB64)
      val signature = Base64.getUrlDecoder.decode(signatureB64)
      val clientDataBytes = Base64.getUrlDecoder.decode(clientDataJSON)

      val signatureCounter = getSignatureCounter(authenticatorData)

      if (signatureCounter != 0 && signatureCounter <= expectedCounter) {
        return Left(
          AppError.SecurityError(
            "Counter regression detected - possible replay attack"
          )
        )
      }

      val clientDataHash = java.security.MessageDigest
        .getInstance("SHA-256")
        .digest(clientDataBytes)
      val dataToVerify = authenticatorData ++ clientDataHash

      val isValid = verifySignatureWithPublicKey(
        publicKeyB64,
        algorithm,
        dataToVerify,
        signature
      )

      Right(
        VerificationResult(
          verified = isValid,
          newCounter = signatureCounter
        )
      )

    } catch {
      case e: Exception =>
        Left(AppError.SecurityError(s"Verification failed: ${e.getMessage}"))
    }
  }

  private def verifySignatureWithPublicKey(
      publicKeyData: String,
      algorithmId: Int,
      data: Array[Byte],
      signature: Array[Byte]
  ): Boolean = {
    try {
      algorithmId match {
        case -7 => // ES256 (ECDSA P-256 with SHA-256)
          verifyES256Signature(publicKeyData, data, signature)
        case -8 => // EdDSA (Ed25519)
          verifyEdDSASignature(publicKeyData, data, signature)
        case _ =>
          false
      }
    } catch {
      case e: Exception =>
        AppLogger.error(s"[PASSKEY UTILS] :: Signature verification failed: ${e.getMessage}", e)
        false
    }
  }

  private def parseSignature(signature: Array[Byte]): (BigInteger, BigInteger) = {
    if (signature.length == 64) {
      // Format raw : r (32 bytes) + s (32 bytes)
      val r = new BigInteger(1, signature.slice(0, 32))
      val s = new BigInteger(1, signature.slice(32, 64))
      (r, s)
    } else if (signature.length > 64 && signature(0) == 0x30.toByte) {
      // Format DER : parser ASN.1
      import org.bouncycastle.asn1.{ASN1InputStream, ASN1Integer, DLSequence}
      val asn1 = new ASN1InputStream(signature)
      val seq = asn1.readObject().asInstanceOf[DLSequence]
      asn1.close()

      val r = seq.getObjectAt(0).asInstanceOf[ASN1Integer].getValue
      val s = seq.getObjectAt(1).asInstanceOf[ASN1Integer].getValue
      (r, s)
    } else {
      throw new IllegalArgumentException(s"Unsupported signature format: length=${signature.length}")
    }
  }

  private def verifyES256Signature(
      publicKeyData: String,
      data: Array[Byte],
      signature: Array[Byte]
  ): Boolean = {
    import org.bouncycastle.crypto.digests.SHA256Digest
    import org.bouncycastle.crypto.params.ECPublicKeyParameters
    import org.bouncycastle.crypto.signers.{ECDSASigner, DSADigestSigner}
    import org.bouncycastle.asn1.x9.X9ECParameters
    import org.bouncycastle.crypto.ec.CustomNamedCurves
    import org.bouncycastle.jce.provider.BouncyCastleProvider
    import org.bouncycastle.math.ec.ECPoint
    import java.security.Security

    Security.addProvider(new BouncyCastleProvider())

    try {
      val publicKeyBytes = Base64.getUrlDecoder.decode(publicKeyData)

      if (publicKeyBytes.length == 65 && publicKeyBytes(0) == 0x04.toByte) {
        // Configuration de la courbe P-256
        val x9ECParameters: X9ECParameters = CustomNamedCurves.getByName("secp256r1")
        val ecDomainParameters = new org.bouncycastle.crypto.params.ECDomainParameters(
          x9ECParameters.getCurve,
          x9ECParameters.getG,
          x9ECParameters.getN,
          x9ECParameters.getH
        )

        // Créer le point de la clé publique
        val point: ECPoint = x9ECParameters.getCurve.decodePoint(publicKeyBytes)
        val ecPublicKeyParameters = new ECPublicKeyParameters(point, ecDomainParameters)

        // Essayer d'abord avec DSADigestSigner (gère automatiquement SHA256)
        try {
          val digestSigner = new DSADigestSigner(new ECDSASigner(), new SHA256Digest())
          digestSigner.init(false, ecPublicKeyParameters)
          digestSigner.update(data, 0, data.length)
          return digestSigner.verifySignature(signature)
        } catch {
          case _: Exception =>
            AppLogger.debug("[PASSKEY UTILS] :: DSADigestSigner failed, trying manual parsing")
        }

        // Fallback : parser manuellement
        val signer = new ECDSASigner()
        signer.init(false, ecPublicKeyParameters)

        val digest = new SHA256Digest()
        digest.update(data, 0, data.length)
        val hash = new Array[Byte](digest.getDigestSize)
        digest.doFinal(hash, 0)

        val (r, s) = parseSignature(signature)
        signer.verifySignature(hash, r, s)
      } else {
        false
      }
    } catch {
      case e: Exception =>
        AppLogger.error(s"[PASSKEY UTILS] :: ES256 verification failed: ${e.getMessage}", e)
        false
    }
  }


  private def verifyEdDSASignature(
      publicKeyData: String,
      data: Array[Byte],
      signature: Array[Byte]
  ): Boolean = {
    import org.bouncycastle.jce.provider.BouncyCastleProvider

    import java.security.{KeyFactory, Security, Signature}

    Security.addProvider(new BouncyCastleProvider())

    try {
      val publicKeyBytes = Base64.getUrlDecoder.decode(publicKeyData)

      if (publicKeyBytes.length == 32) {
        import org.bouncycastle.asn1.edec.EdECObjectIdentifiers
        import org.bouncycastle.asn1.x509.{
          AlgorithmIdentifier,
          SubjectPublicKeyInfo
        }

        import java.security.spec.X509EncodedKeySpec

        val algorithmIdentifier = new AlgorithmIdentifier(
          EdECObjectIdentifiers.id_Ed25519
        )
        val publicKeyInfo =
          new SubjectPublicKeyInfo(algorithmIdentifier, publicKeyBytes)
        val keySpec = new X509EncodedKeySpec(publicKeyInfo.getEncoded)
        val publicKey =
          KeyFactory.getInstance("Ed25519", "BC").generatePublic(keySpec)

        val verifier = Signature.getInstance("Ed25519", "BC")
        verifier.initVerify(publicKey)
        verifier.update(data)
        verifier.verify(signature)
      } else {
        false
      }
    } catch {
      case e: Exception =>
        AppLogger.error(s"[PASSKEY UTILS] :: EdDSA verification failed: ${e.getMessage}", e)
        false
    }
  }

  def getSignatureCounter(authenticatorData: Array[Byte]): Long = {
    if (authenticatorData.length < 37) {
      throw new IllegalArgumentException("AuthenticatorData too short")
    }

    val buffer = ByteBuffer.wrap(authenticatorData)
    buffer.order(ByteOrder.BIG_ENDIAN)
    buffer.position(33)

    val counterBytes = Array.fill[Byte](4)(0)
    buffer.get(counterBytes)

    val counter = ByteBuffer
      .wrap(counterBytes)
      .order(ByteOrder.BIG_ENDIAN)
      .getInt
      .toLong & 0xffffffffL

    counter
  }

  def getAuthenticatorName(attestationObject: Array[Byte]): Option[String] = {
    val cbor = Cbor.decode(attestationObject).to[Map[String, Dom.Element]].value
    val authData = cbor.get("authData")

    authData match {
      case Some(Dom.ByteArrayElem(bytes)) =>
        val aaguid = bytes.slice(37, 53)

        aaguid match {
          case Array(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0) =>
            None
          case _ =>
            getAuthenticatorByAAGUID(aaguid)
        }
      case Some(other) =>
        None
      case None =>
        None
    }
  }

  def getAuthenticatorByAAGUID(aaguid: Array[Byte]): Option[String] = {
    val aaguidHex = aaguid.map("%02x".format(_)).mkString

    aaguidHex match {
      case "d41f5a69b94d4e5ebf9b6c7f8f7b7c7d"     => "Touch ID".some
      case "adce0002-35bc-c60a-648b-0b25f1f05503" => "Windows Hello".some
      case "fa2b99dc-9e39-4c95-8321-4e5c8a7c5f4c" => "Chrome".some
      case "d548826e-79b4-db40-a3d8-11116f7e8349" => "Bitwarden".some
      case _                                      => None
    }
  }

  def guessAuthenticatorType(
      signatureCounter: Long,
      userAgent: Option[String],
      authenticatorAttachment: String
  ): Option[String] = {

    (signatureCounter, userAgent, authenticatorAttachment) match {
      case (0, Some(ua), "cross-platform") if ua.contains("Bitwarden") =>
        "Bitwarden".some
      case (0, Some(ua), "cross-platform") if ua.contains("1Password") =>
        "1Password".some
      case (_, Some(ua), "platform") if ua.contains("Mac") => "Touch ID".some
      case (_, Some(ua), "platform") if ua.contains("Windows") =>
        "Windows Hello".some
      case (_, Some(ua), "platform") if ua.contains("Android") =>
        "Android Biométrie".some
      case (counter, _, "cross-platform") if counter > 0 =>
        "YubiKey ou similaire".some
      case (0, _, "cross-platform") => "Gestionnaire de mots de passe".some
      case _                        => "Authenticator".some
    }
  }
}
