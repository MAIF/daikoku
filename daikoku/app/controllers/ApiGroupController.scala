package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import akka.stream.Materializer
import akka.stream.scaladsl.{Sink, Source}
import controllers.AppError
import controllers.AppError.SubscriptionAggregationDisabled
import fr.maif.otoroshi.daikoku.actions.DaikokuAction
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async.{PublicUserAccess, TeamApiEditorOnly, TeamMemberOnly}
import fr.maif.otoroshi.daikoku.domain.json.{ApiFormat, ApiGroupFormat}
import fr.maif.otoroshi.daikoku.domain.{ApiVisibility, TeamId, TenantId}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.StringImplicits.BetterString
import fr.maif.otoroshi.daikoku.utils.{ApiService, Translator}
import play.api.Logger
import play.api.i18n.I18nSupport
import play.api.libs.json.{JsError, JsNull, JsObject, JsSuccess, Json}
import play.api.mvc.{AbstractController, ControllerComponents}
import reactivemongo.bson.BSONObjectID

import scala.concurrent.Future

class ApiGroupController(
    DaikokuAction: DaikokuAction,
    env: Env,
    cc: ControllerComponents,
    translator: Translator,
    apiService: ApiService
) extends AbstractController(cc)
    with I18nSupport {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env
  implicit val tr = translator

  val logger = Logger("ApiGroupController")

  def getApiGroupOfTeam(teamId: String, groupId: String) = DaikokuAction.async { ctx =>
    TeamMemberOnly(AuditTrailEvent(s"@{user.name} has accessed to ApiGroup @{group.name}"))(teamId, ctx) { _ =>
      env.dataStore.apiGroupRepo.forTenant(ctx.tenant).findByIdOrHrIdNotDeleted(groupId)
        .map {
          case Some(group) =>
            ctx.setCtxValue("group.name", group.name)
            Left(Ok(group.asJson))
          case None => Right(AppError.ApiGroupNotFound)
        }
    }
  }

  def verifyNameUniqueness() = DaikokuAction.async(parse.json) { ctx =>
    PublicUserAccess(
      AuditTrailEvent(s"@{user.name} is checking if api group name (@{api.name}) is unique")
    )(ctx) {
      val name = (ctx.request.body.as[JsObject] \ "name").asOpt[String].map(_.toLowerCase.trim).getOrElse("")
      ctx.setCtxValue("api.name", name)

      checkApiGroupNameUniqueness(name, ctx.tenant.id)
        .map(exists => Ok(Json.obj("exists" -> exists)))
    }
  }

  def checkApiGroupNameUniqueness(name: String, tenant: TenantId) = {
    val maybeHumanReadableId = name.urlPathSegmentSanitized

    env.dataStore.apiGroupRepo.forTenant(tenant)
      .exists(Json.obj("_humanReadableId" -> maybeHumanReadableId))
  }

  def createApiGroup(teamId: String) = DaikokuAction.async(parse.json) { ctx =>
    TeamApiEditorOnly(
      AuditTrailEvent(s"@{user.name} has created new API group @{apiGroup.id}/@{apiGroup.name}"))(teamId, ctx) { team =>
      val body = ctx.request.body.as[JsObject]
      val finalBody = (body \ "_id").asOpt[String] match {
        case Some(_) => body
        case None => body ++ Json.obj("_id" -> BSONObjectID.generate().stringify)
      }

      val name = (finalBody \ "name").as[String].toLowerCase.trim
      val id = (finalBody \ "_id").asOpt[String].map(_.trim)

      ctx.tenant.creationSecurity match {
        case Some(true) if !team.apisCreationPermission.getOrElse(false) =>
          FastFuture.successful(Forbidden(Json.obj("error" -> "Team forbidden to create api on current tenant")))
        case _ => ApiGroupFormat.reads(finalBody) match {
          case JsError(e) =>
            AppError.renderF(AppError.ParsingPayloadError(e.toString()))
          case JsSuccess(apiGroup, _) =>
            checkApiGroupNameUniqueness(name, ctx.tenant.id)
              .flatMap {
                case true => FastFuture.successful(Conflict(Json.obj("error" -> "Resource with same name already exists")))
                case false =>
                  ctx.setCtxValue("api.id", apiGroup.id)
                  ctx.setCtxValue("api.name", apiGroup.name)
                  env.dataStore.apiGroupRepo.forTenant(ctx.tenant.id)
                    .save(apiGroup).map { _ =>
                    Created(apiGroup.asJson)
                  }
              }
        }
      }
    }
  }

  def updateApiGroup(teamId: String, groupId: String) = DaikokuAction.async(parse.json) { ctx =>
    TeamApiEditorOnly(
      AuditTrailEvent(s"@{user.name} has updated API group @{apiGroup.name}"))(teamId, ctx) { team =>
      env.dataStore.apiGroupRepo.forTenant(ctx.tenant).findByIdOrHrIdNotDeleted(groupId)
        .flatMap {
          case None => AppError.ApiGroupNotFound.renderF()
          case Some(oldGroup) if oldGroup.team != team.id => AppError.ApiGroupNotFound.renderF()
          case Some(oldGroup) => ApiGroupFormat.reads(ctx.request.body) match {
            case JsError(e) => AppError.ParsingPayloadError(e.toString()).renderF()
            case JsSuccess(group, _) if !ctx.tenant.aggregationApiKeysSecurity.exists(identity) &&
              group.possibleUsagePlans.exists(plan => plan.aggregationApiKeysSecurity.exists(identity)) =>
              AppError.renderF(SubscriptionAggregationDisabled)
            case JsSuccess(apiGroup, _) =>
              checkApiGroupNameUniqueness(apiGroup.name, ctx.tenant.id)
                .flatMap {
                  case true => AppError.NameAlreadyExists.renderF()
                  case false =>
                    ctx.setCtxValue("apiGroup.id", apiGroup.id)
                    ctx.setCtxValue("apiGroup.name", apiGroup.name)

                    //                      todo: verifier si des plan on changé de visibility
                    //                      todo: supprimer les plan supprimé
                    //                      todo: save group
                    //                      todo: synchro des metadata

                    env.dataStore.apiGroupRepo.forTenant(ctx.tenant.id)
                      .save(apiGroup).map(_ => Created(apiGroup.asJson))
                }
          }
        }
    }
  }

  def deleteApiGroup(teamId: String, groupId: String) = DaikokuAction.async(parse.json) { ctx =>
    implicit val mat: Materializer = env.defaultMaterializer
    TeamApiEditorOnly(
      AuditTrailEvent(s"@{user.name} has deleted API group @{group.name}"))(teamId, ctx) { team =>
      env.dataStore.apiGroupRepo
        .forTenant(ctx.tenant.id)
        .findByIdOrHrIdNotDeleted(groupId)
        .flatMap {
          case Some(apiGroup) =>
            Source(apiGroup.possibleUsagePlans.toList)
              .mapAsync(1)(plan => {
                env.dataStore.apiSubscriptionRepo
                  .forTenant(ctx.tenant)
                  .findNotDeleted(Json.obj("api" -> apiGroup.id.asJson, "plan" -> plan.id.asJson))
                  .map(subs => (plan, subs))
              })
              .via(apiService.deleteApiSubscriptionsAsFlow(tenant = ctx.tenant, apiOrGroupName = apiGroup.name, user = ctx.user))
              .runWith(Sink.ignore)
              .flatMap(_ => env.dataStore.apiGroupRepo.forTenant(ctx.tenant.id).deleteByIdLogically(apiGroup.id))
              .map(_ => Ok(Json.obj("done" -> true)))
          case None => AppError.ApiGroupNotFound.renderF()
        }
    }
  }
}
