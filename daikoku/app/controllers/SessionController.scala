package fr.maif.otoroshi.daikoku.ctrls

import java.util.concurrent.TimeUnit

import fr.maif.otoroshi.daikoku.actions.DaikokuAction
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async.DaikokuAdminOnly
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async.PublicUserAccess
import fr.maif.otoroshi.daikoku.domain.{MongoId, UserSession, UserSessionId}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import org.joda.time.DateTime
import play.api.libs.json.{JsArray, Json}
import play.api.mvc._
import reactivemongo.bson.BSONObjectID

import scala.concurrent.duration.FiniteDuration

class SessionController(DaikokuAction: DaikokuAction,
                        env: Env,
                        cc: ControllerComponents)
    extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  def allSessions() = DaikokuAction.async { ctx =>
    DaikokuAdminOnly(AuditTrailEvent("@{user.name} has accessed all sessions"))(
      ctx) {
      env.dataStore.userSessionRepo.findAll().map { users =>
        Ok(JsArray(users.map(_.asJson)))
      }
    }
  }
  def deleteAllSessions() = DaikokuAction.async { ctx =>
    DaikokuAdminOnly(AuditTrailEvent("@{user.name} has deleted all sessions"))(
      ctx) {
      env.dataStore.userSessionRepo.deleteAll().map { _ =>
        Ok(Json.obj("done" -> true))
      }
    }
  }
  def deleteSession(id: String) = DaikokuAction.async { ctx =>
    DaikokuAdminOnly(
      AuditTrailEvent(s"@{user.name} has deleted session with id ${id}"))(ctx) {
      env.dataStore.userSessionRepo.deleteById(id).map { _ =>
        Ok(Json.obj("done" -> true))
      }
    }
  }

  def sessionRenew() = DaikokuAction.async { ctx =>
    PublicUserAccess(AuditTrailEvent(s"@{user.name} has renewed its session"))(
      ctx) {
      val sessionMaxAge = (ctx.tenant.authProviderSettings \ "sessionMaxAge")
        .asOpt[Int]
        .getOrElse(86400)
      val session = UserSession(
        id = MongoId(BSONObjectID.generate().stringify),
        userId = ctx.user.id,
        userName = ctx.user.name,
        userEmail = ctx.user.email,
        impersonatorId = ctx.impersonator.map(_.id),
        impersonatorName = ctx.impersonator.map(_.name),
        impersonatorEmail = ctx.impersonator.map(_.email),
        impersonatorSessionId = ctx.session.impersonatorSessionId,
        sessionId = UserSessionId(IdGenerator.token),
        created = DateTime.now(),
        expires = DateTime.now().plusSeconds(sessionMaxAge),
        ttl = FiniteDuration(sessionMaxAge, TimeUnit.SECONDS)
      )
      ctx.session.invalidate().flatMap { _ =>
        env.dataStore.userSessionRepo.save(session).map { _ =>
          Ok(
            session.asSimpleJson
          ).withSession("sessionId" -> session.sessionId.value)
        }
      }
    }
  }
}
