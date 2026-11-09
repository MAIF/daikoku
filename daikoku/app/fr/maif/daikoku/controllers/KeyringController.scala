package fr.maif.daikoku.controllers

import cats.data.EitherT
import fr.maif.daikoku.actions.DaikokuAction
import fr.maif.daikoku.audit.AuditTrailEvent
import fr.maif.daikoku.controllers.AppError.renderF
import fr.maif.daikoku.controllers.authorizations.async.*
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.services.{ApiService, KeyringService}
import fr.maif.daikoku.utils.future.EnhancedObject
import org.apache.pekko.http.scaladsl.util.FastFuture
import play.api.libs.json.*
import play.api.mvc.*

import scala.concurrent.{ExecutionContext, Future}

class KeyringController(
    DaikokuAction: DaikokuAction,
    env: Env,
    cc: ControllerComponents,
    apiService: ApiService,
    keyringService: KeyringService
) extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  def updateKeyringCustomName(
      teamId: String,
      keyringId: String
  ): Action[JsValue] =
    DaikokuAction.async(parse.json) { ctx =>
      TeamApiKeyAction(
        AuditTrailEvent(
          s"@{user.name} has updated custom name for keyring @{keyring._id}"
        )
      )(teamId, ctx) { _ =>
        val customName =
          (ctx.request.body.as[JsObject] \ "customName").as[String].trim
        env.dataStore.keyringRepo
          .findByIdAndTeam(ctx.tenant.id, keyringId, TeamId(teamId))
          .flatMap {
            case None =>
              FastFuture.successful(
                NotFound(Json.obj("error" -> "keyring not found"))
              )
            case Some(keyring) =>
              val updated = keyring.copy(customName = customName)
              env.dataStore.keyringRepo
                .forTenant(ctx.tenant)
                .save(updated)
                .map(_ => Ok(updated.asJson))
          }
      }
    }

  def deleteKeyring(teamId: String, keyringId: String): Action[AnyContent] =
    DaikokuAction.async { ctx =>
      TeamAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has deleted keyring @{keyring._id} of @{team.name} - @{team.id}"
        )
      )(teamId, ctx) { team =>
        ctx.setCtxValue("keyring._id", keyringId)
        (for {
          keyring <- EitherT.fromOptionF[Future, AppError, Keyring](
            env.dataStore.keyringRepo
              .findByIdAndTeam(ctx.tenant.id, keyringId, team.id),
            AppError.EntityNotFound("keyring")
          )
          _ <- keyringService.deleteKeyring(ctx.tenant, keyring)
        } yield Ok(Json.obj("done" -> true)))
          .leftMap(_.render())
          .merge
      }
    }

  def toggleKeyringRotation(
      teamId: String,
      keyringId: String
  ): Action[JsValue] =
    DaikokuAction.async(parse.json) { ctx =>
      TeamAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has toggle keyring rotation @{keyringId} of @{team.name} - @{team.id}"
        )
      )(teamId, ctx) { team =>
        ctx.setCtxValue("keyringId", keyringId)
        val enabled =
          (ctx.request.body.as[JsObject] \ "enabled").as[Boolean]
        val rotationEvery =
          (ctx.request.body.as[JsObject] \ "rotationEvery").as[Long]
        val gracePeriod =
          (ctx.request.body.as[JsObject] \ "gracePeriod").as[Long]

        env.dataStore.keyringRepo
          .forTenant(ctx.tenant)
          .findById(keyringId)
          .flatMap {
            case Some(keyring) =>
              if (keyring.team.value == teamId) {
                keyringService
                  .toggleKeyringRotation(
                    ctx.tenant,
                    keyring,
                    enabled,
                    rotationEvery,
                    gracePeriod
                  )
                  .map(k => Ok(k.asJson))
                  .leftMap(AppError.render)
                  .merge
              } else {
                renderF(
                  AppError.Forbidden(
                    "You're not allowed to toggle the rotation of this keyring"
                  )
                )
              }
            case None =>
              NotFound(Json.obj("error" -> "keyring not found")).future
          }
      }
    }

  def regenerateKeyringSecret(
      teamId: String,
      keyringId: String
  ): Action[AnyContent] =
    DaikokuAction.async { ctx =>
      TeamAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has regenerate keyring secret @{keyring.id} of @{team.name} - @{team.id}"
        )
      )(teamId, ctx) { team =>
        ctx.setCtxValue("keyring.id", keyringId)
        apiService
          .regenerateKeyringSecret(
            ctx.tenant,
            KeyringId(keyringId),
            team,
            ctx.user
          )
          .map(_.fold(_.render(), Ok(_)))
      }
    }

  def toggleKeyring(
      teamId: String,
      keyringId: String,
      enabled: Boolean
  ): Action[AnyContent] =
    DaikokuAction.async { ctx =>
      TeamAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has ${if (enabled) "enabled" else "disabled"} keyring @{keyring.id} of @{team.name} - @{team.id}"
        )
      )(teamId, ctx) { team =>
        ctx.setCtxValue("keyring.id", keyringId)
        apiService
          .toggleKeyringState(ctx.tenant, KeyringId(keyringId), team, enabled)
          .map(_.fold(_.render(), Ok(_)))
      }
    }
}
