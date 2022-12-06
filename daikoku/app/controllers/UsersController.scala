package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import cats.data.EitherT
import com.eatthepath.otp.TimeBasedOneTimePasswordGenerator
import controllers.AppError
import fr.maif.otoroshi.daikoku.actions.{DaikokuAction, DaikokuActionMaybeWithGuest}
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async._
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.{DeletionService, IdGenerator}
import io.nayuki.qrcodegen.QrCode
import org.apache.commons.codec.binary.Base32
import org.joda.time.{DateTime, Hours}
import org.mindrot.jbcrypt.BCrypt
import play.api.libs.json.{JsArray, JsError, JsSuccess, Json}
import play.api.mvc.{AbstractController, Action, AnyContent, ControllerComponents, Result}
import reactivemongo.bson.BSONObjectID

import java.time.Instant
import java.util.Base64
import java.util.concurrent.TimeUnit
import javax.crypto.KeyGenerator
import javax.crypto.spec.SecretKeySpec
import scala.concurrent.Future
import scala.concurrent.duration.FiniteDuration

class UsersController(DaikokuAction: DaikokuAction,
                      DaikokuActionMaybeWithGuest: DaikokuActionMaybeWithGuest,
                      env: Env,
                      cc: ControllerComponents,
                      deletionService: DeletionService)
    extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  def allTenantUsers() = DaikokuAction.async { ctx =>
    TenantAdminOnly(
      AuditTrailEvent("@{user.name} has accessed all users list"))(
      ctx.tenant.id.value,
      ctx) { (_, _) =>
      env.dataStore.userRepo.findAllNotDeleted().map { users =>
        Ok(
          JsArray(
            users
              .filter(u => u.invitation.forall(_.registered))
              .map(_.asSimpleJson)))
      }
    }
  }

  def findUserById(id: String) = DaikokuAction.async { ctx =>
    DaikokuAdminOnly(AuditTrailEvent(
      "@{user.name} has accessed user profile of @{u.email} (@{u.id})"))(ctx) {
      env.dataStore.userRepo.findByIdOrHrIdNotDeleted(id).map {
        case Some(user) =>
          ctx.setCtxValue("u.email", user.email)
          ctx.setCtxValue("u.id", user.id.value)
          Ok(user.asJson)
        case None => NotFound(Json.obj("error" -> "user not found"))
      }
    }
  }

  def setAdminStatus(id: String) = DaikokuAction.async(parse.json) { ctx =>
    DaikokuAdminOnly(
      AuditTrailEvent(
        "@{user.name} has updated user profile of @{u.email} (@{u.id})"))(ctx) {
      (ctx.request.body \ "isDaikokuAdmin").asOpt[Boolean] match {
        case Some(isDaikokuAdmin) =>
          env.dataStore.userRepo.findByIdNotDeleted(id).flatMap {
            case Some(user) if user.isDaikokuAdmin == isDaikokuAdmin =>
              FastFuture.successful(
                Conflict(Json.obj("error" -> "user have already this status")))
            case Some(user) =>
              val userToSave = user.copy(isDaikokuAdmin = isDaikokuAdmin)
              env.dataStore.userRepo
                .save(userToSave)
                .map(_ => Ok(userToSave.asJson))
            case None =>
              FastFuture.successful(
                NotFound(Json.obj("error" -> "User not found")))
          }
        case None =>
          FastFuture.successful(BadRequest(Json.obj("error" -> "body error")))
      }
    }
  }

  def updateUserById(id: String) = DaikokuAction.async(parse.json) { ctx =>
    (ctx.request.body \ "_id").asOpt[String].map(UserId.apply) match {
      case Some(userId) =>
        DaikokuAdminOrSelf(
          AuditTrailEvent(
            "@{user.name} has updated user profile of @{u.email} (@{u.id})"))(
          userId,
          ctx) {
          json.UserFormat.reads(ctx.request.body) match {
            case JsSuccess(newUser, _) => {
              env.dataStore.userRepo.findByIdNotDeleted(id).flatMap {
                case Some(user) =>
                  ctx.setCtxValue("u.email", user.email)
                  ctx.setCtxValue("u.id", user.id.value)
                  val userToSave =
                    if (ctx.user.isDaikokuAdmin) newUser
                    else newUser.copy(metadata = user.metadata)
                  val hash =
                    if (user.password != newUser.password)
                      newUser.password.map(maybePassword =>
                        BCrypt.hashpw(maybePassword, BCrypt.gensalt()))
                    else user.password
                  for {
                    maybePersonalTeam <- env.dataStore.teamRepo
                      .forTenant(ctx.tenant)
                      .findOneNotDeleted(
                        Json.obj(
                          "type" -> TeamType.Personal.name,
                          "users.userId" -> userToSave.id.asJson
                        ))
                    _ <- env.dataStore.userRepo
                      .save(userToSave.copy(password = hash))
                    _ <- env.dataStore.teamRepo
                      .forTenant(ctx.tenant)
                      .save(
                        maybePersonalTeam
                          .map(
                            team =>
                              team.copy(
                                name = userToSave.name,
                                description =
                                  s"The personal team of ${userToSave.name}",
                                avatar = Some(userToSave.picture),
                                contact = userToSave.email))
                          .getOrElse(Team(
                            id = TeamId(BSONObjectID.generate().stringify),
                            tenant = ctx.tenant.id,
                            `type` = TeamType.Personal,
                            name = s"${userToSave.name}",
                            description =
                              s"The personal team of ${userToSave.name}",
                            users =
                              Set(UserWithPermission(user.id, Administrator)),
                            subscriptions = Seq.empty,
                            authorizedOtoroshiGroups = Set.empty,
                            contact = userToSave.email,
                            avatar = Some(userToSave.picture)
                          ))
                      )
                  } yield {
                    Ok(userToSave.asJson)
                  }
                case None =>
                  FastFuture.successful(
                    NotFound(Json.obj("error" -> "user not found")))
              }
            }
            case e: JsError => {
              FastFuture.successful(BadRequest(JsError.toJson(e)))
            }
          }
        }
      case None =>
        FastFuture.successful(
          Unauthorized(Json.obj("error" -> "You're not a Daikoku admin")))
    }
  }

  def deleteUserById(id: String) = DaikokuAction.async { ctx =>
    DaikokuAdminOnly(
      AuditTrailEvent(
        "@{user.name} has deleted user profile of user.id : @{u.id}"))(ctx) {
          ctx.setCtxValue("u.id", id)
      deletionService.deleteCompleteUserByQueue(id, ctx.tenant)
        .leftMap(_.render())
        .map(_ => Ok(Json.obj("done" -> true)))
        .merge

      }
    }

  def deleteSelfUser() = DaikokuAction.async { ctx =>
    PublicUserAccess(
      AuditTrailEvent("@{user.name} has deleted his own profile)"))(ctx) {
      deletionService.deleteUserByQueue(ctx.user.id.value, ctx.tenant)
        .leftMap(_.render())
        .map(_ => Ok(Json.obj("done" -> true)))
        .value.map(_.merge)
    }
  }

  def createUser() = DaikokuAction.async(parse.json) { ctx =>
    DaikokuAdminOnly(
      AuditTrailEvent(
        "@{user.name} has created user profile of @{u.email} (@{u.id})"))(ctx) {
      json.UserFormat.reads(ctx.request.body) match {
        case JsSuccess(user, _) =>
          ctx.setCtxValue("u.email", user.email)
          ctx.setCtxValue("u.id", user.id.value)
          env.dataStore.userRepo.findByIdNotDeleted(user.id).flatMap {
            case Some(_) =>
              FastFuture.successful(
                Conflict(Json.obj("error" -> "User id already exists")))
            case None =>
              val hash = user.password.map(maybePassword =>
                BCrypt.hashpw(maybePassword, BCrypt.gensalt()))
              val newUser = user.copy(password = hash)
              env.dataStore.userRepo.save(newUser).map { _ =>
                Created(newUser.asJson)
              }
          }
        case e: JsError => FastFuture.successful(BadRequest(JsError.toJson(e)))
      }
    }
  }

  def impersonate(userId: String) = DaikokuAction.async { ctx =>
    DaikokuAdminOnly(
      AuditTrailEvent(
        "@{user.name} has impersonated user profile of @{u.email} (@{u.id})"))(
      ctx) {
      env.dataStore.userRepo.findByIdNotDeleted(userId).flatMap {
        case Some(user) =>
          val session = UserSession(
            id = DatastoreId(BSONObjectID.generate().stringify),
            userId = user.id,
            userName = user.name,
            userEmail = user.email,
            impersonatorId = Some(ctx.user.id),
            impersonatorName = Some(ctx.user.name),
            impersonatorEmail = Some(ctx.user.email),
            impersonatorSessionId = Some(ctx.session.sessionId),
            sessionId = UserSessionId(IdGenerator.token),
            created = DateTime.now(),
            expires = DateTime.now().plusSeconds(3600),
            ttl = FiniteDuration(3600, TimeUnit.SECONDS)
          )
          env.dataStore.userSessionRepo.save(session).map { _ =>
            Redirect(ctx.request.session.get("redirect").getOrElse("/"))
              .removingFromSession("sessionId", "redirect")(ctx.request)
              .withSession(
                "sessionId" -> session.sessionId.value
              )
          }
        case None =>
          FastFuture.successful(
            BadRequest(Json.obj("error" -> "User not found")))
      }
    }
  }

  def deImpersonate() = DaikokuAction.async { ctx =>
    DaikokuImpersonatorAdminOnly(AuditTrailEvent(
      "@{user.name} (@{user.id}) is leaving impersonation of user profile @{u.email} (@{u.id})"))(
      ctx) {
      ctx.session.impersonatorSessionId match {
        case None => FastFuture.successful(Redirect("/logout"))
        case Some(sessionId) =>
          env.dataStore.userSessionRepo
            .findOne(Json.obj("sessionId" -> sessionId.value))
            .flatMap {
              case Some(session) =>
                env.dataStore.userSessionRepo
                  .delete(Json.obj("impersonatorSessionId" -> sessionId.value))
                  .map { _ =>
                    if (session.expires.isBefore(DateTime.now()))
                      Redirect("/logout")
                    else
                      Redirect(
                        ctx.request.session.get("redirect").getOrElse("/"))
                        .removingFromSession("sessionId", "redirect")(
                          ctx.request)
                        .withSession(("sessionId", sessionId.value))
                  }
              case None => FastFuture.successful(Redirect("/logout"))
            }
      }
    }
  }

  def get2faQrCode() = DaikokuAction.async { ctx =>
    PublicUserAccess(
      AuditTrailEvent("@{user.name} clicked on enable 2fa account"))(ctx) {
      val label = "Daikoku"

      ctx.user.twoFactorAuthentication match {
        case value if value.isEmpty || !value.get.enabled =>
          import javax.crypto.KeyGenerator

          val totp = new TimeBasedOneTimePasswordGenerator()
          val keyGenerator = KeyGenerator.getInstance(totp.getAlgorithm)
          keyGenerator.init(160)

          val secret = keyGenerator.generateKey()

          val base32SecretEncoded =
            new Base32().encodeAsString(secret.getEncoded)

          env.dataStore.userRepo
            .save(
              ctx.user.copy(
                twoFactorAuthentication =
                  Some(
                    TwoFactorAuthentication(
                      enabled = false,
                      secret =
                        Base64.getEncoder.encodeToString(secret.getEncoded),
                      token = "",
                      backupCodes = ""
                    )))
            )
            .flatMap {
              case true =>
                FastFuture.successful(
                  Ok(
                    Json.obj(
                      "rawSecret" -> base32SecretEncoded,
                      "qrcode" -> QrCode
                        .encodeText(
                          s"otpauth://totp/$label?secret=$base32SecretEncoded",
                          QrCode.Ecc.HIGH)
                        .toSvgString(10)
                    )))
              case false =>
                FastFuture.successful(
                  BadRequest(Json.obj("error" -> "Can't updated user")))
            }
        case Some(_) =>
          FastFuture.successful(BadRequest(Json.obj(
            "error" -> "Unable to retrieve generated qrcode when 2fa enabled")))
      }
    }
  }

  def enable2fa(code: Option[String]) = DaikokuAction.async { ctx =>
    PublicUserAccess(
      AuditTrailEvent("@{user.name} try to enable two factor authentication"))(
      ctx) {
      code match {
        case None =>
          FastFuture.successful(
            BadRequest(Json.obj("error" -> "Missing code parameter")))
        case Some(code) =>
          val totp = new TimeBasedOneTimePasswordGenerator()
          val now = Instant.now()

          val decodedKey = Base64.getDecoder.decode(
            ctx.user.twoFactorAuthentication.get.secret)
          val key = new SecretKeySpec(decodedKey, 0, decodedKey.length, "AES")

          if (code == totp.generateOneTimePassword(key, now).toString) {
            val keyGenerator = KeyGenerator.getInstance(totp.getAlgorithm)
            keyGenerator.init(160)

            val backupCodes =
              new Base32().encodeAsString(keyGenerator.generateKey().getEncoded)
            env.dataStore.userRepo
              .save(
                ctx.user.copy(
                  twoFactorAuthentication = Some(
                    ctx.user.twoFactorAuthentication.get.copy(
                      enabled = true,
                      backupCodes = backupCodes
                    ))))
              .flatMap {
                case false =>
                  FastFuture.successful(BadRequest(Json.obj(
                    "error" -> "Something happens when updating user")))
                case true =>
                  FastFuture.successful(
                    Ok(
                      Json.obj(
                        "message" -> "2fa successfully enabled",
                        "backupCodes" -> backupCodes
                      )))
              }
          } else
            FastFuture.successful(
              BadRequest(Json.obj("error" -> "No matching code")))
      }
    }
  }

  def disable2fa() = DaikokuAction.async { ctx =>
    PublicUserAccess(
      AuditTrailEvent("@{user.name} has disabled 2fa on your account"))(ctx) {
      env.dataStore.userRepo
        .save(ctx.user.copy(twoFactorAuthentication = None))
        .map {
          case true => NoContent
          case false =>
            BadRequest(
              Json.obj("error" -> "Something happens when updating user"))
        }
    }
  }

  def checkTokenInvitation() = DaikokuActionMaybeWithGuest.async(parse.json) {
    ctx =>
      UberPublicUserAccess(
        AuditTrailEvent(
          "@{user.name} has tried to validate an invitation token"))(ctx) {
        val body = ctx.request.body
        (body \ "token").asOpt[String] match {
          case Some(token) =>
            env.dataStore.userRepo
              .findOneNotDeleted(
                Json.obj(
                  "invitation.token" -> token,
                  "email" -> ctx.user.email
                ))
              .map {
                case Some(user)
                    if Hours
                      .hoursBetween(user.invitation.get.createdAt,
                                    DateTime.now())
                      .isLessThan(Hours.ONE) =>
                  user.invitation
                    .map { invitation =>
                      Ok(
                        Json.obj(
                          "team" -> invitation.team,
                          "notificationId" -> invitation.notificationId
                        ))
                    }
                    .getOrElse(
                      BadRequest(
                        Json.obj("error" -> "Missing invitation information"))
                    )
                case None =>
                  BadRequest(Json.obj(
                    "error" -> "You're token is invalid, expired or you are already in the team"))
              }
          case _ =>
            FastFuture.successful(
              BadRequest(Json.obj("error" -> "Can't validate token")))
        }
      }
  }

  def removeInvitation(): Action[AnyContent] = DaikokuAction.async { ctx =>
    PublicUserAccess(
      AuditTrailEvent("@{user.name} has closed team invitation"))(ctx) {
      env.dataStore.userRepo
        .save(ctx.user.copy(invitation = None))
        .map {
          case true => Ok(Json.obj("done" -> true))
          case false =>
            BadRequest(Json.obj("error" -> "Unable to remove data invitation"))
        }
    }
  }

  def updatePassword() = DaikokuAction.async(parse.json) { ctx =>
    PublicUserAccess(AuditTrailEvent("@{user.name} has updated his password"))(
      ctx) {
      val body = ctx.request.body
      ((body \ "oldPassword").asOpt[String],
       (body \ "newPassword").asOpt[String]) match {
        case (Some(oldPassword), Some(newPassword))
            if BCrypt.checkpw(oldPassword, ctx.user.password.get) =>
          val updatedUser = ctx.user.copy(
            password = Some(BCrypt.hashpw(newPassword, BCrypt.gensalt())))
          env.dataStore.userRepo
            .save(ctx.user.copy(
              password = Some(BCrypt.hashpw(newPassword, BCrypt.gensalt()))))
            .map {
              case true => Ok(updatedUser.asJson)
              case false =>
                BadRequest(
                  Json.obj("error" -> "updated password can't be saved"))
            }
        case (_, _) =>
          FastFuture.successful(
            BadRequest(Json.obj("error" -> "incorrect password")))
      }
    }
  }
}
