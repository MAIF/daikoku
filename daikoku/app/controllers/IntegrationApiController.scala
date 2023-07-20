package fr.maif.otoroshi.daikoku.ctrls

import cats.data.EitherT
import controllers.AppError
import fr.maif.otoroshi.daikoku.actions._
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async.TenantAdminAccessTenant
import fr.maif.otoroshi.daikoku.domain.{Api, ApiState, ApiVisibility, Team, UsagePlan, json}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.StringImplicits._
import fr.maif.otoroshi.daikoku.utils.future._
import play.api.libs.json.{JsArray, JsObject, Json}
import play.api.mvc.{AbstractController, ControllerComponents, Result}

import scala.concurrent.Future

class IntegrationApiController(DaikokuAction: DaikokuAction,
                               env: Env,
                               cc: ControllerComponents)
    extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  def findById(ctx: DaikokuActionContext[_],
               teamId: String,
               apiId: String): Future[Either[AppError, (Team, Api)]] = {
    env.dataStore.teamRepo
      .forTenant(ctx.tenant)
      .findByIdOrHrId(teamId)
      .flatMap {
        case None => Left(AppError.ApiNotFound).future
        case Some(team) => {
          env.dataStore.apiRepo
            .forTenant(ctx.tenant)
            .findByIdOrHrId(apiId)
            .flatMap {
              case None =>
                Left(AppError.ApiNotFound).future
              case Some(api) if team.id != api.team =>
                Left(AppError.ApiNotFound).future
              case Some(api) if !api.isPublished =>
                Left(AppError.ApiNotFound).future
              case Some(api) => {
                env.dataStore.teamRepo
                  .forTenant(ctx.tenant)
                  .findById(teamId)
                  .map {
                    case Some(_team)
                        if api.visibility == ApiVisibility.Public || api.authorizedTeams
                          .contains(_team.id) =>
                      Right((_team, api))
                    case _ =>
                      Left(AppError.ApiUnauthorized)
                  }
              }
            }
        }
      }
  }

  /////////////////

  def findAll() = DaikokuAction.async { ctx =>
    TenantAdminAccessTenant(AuditTrailEvent(
      s"@{user.name} has accessed the list of visible apis through integration api"))(
      ctx) {
      for {
        teams <- env.dataStore.teamRepo
          .forTenant(ctx.tenant)
          .findAllNotDeleted()
        apiRepo <- env.dataStore.apiRepo.forTenantF(ctx.tenant.id)
        publicApis <- apiRepo.findNotDeleted(
          Json.obj(
            "visibility" -> "Public",
            "state" -> ApiState.publishedJsonFilter
          ))
      } yield {
        val apis = publicApis
        val sortedApis =
          apis.sortWith((a, b) => a.name.compareToIgnoreCase(b.name) < 0)
        Ok(JsArray(sortedApis.map(_.asIntegrationJson(teams))))
      }
    }
  }

  def findAllTeam(teamId: String) = DaikokuAction.async { ctx =>
    TenantAdminAccessTenant(AuditTrailEvent(
      s"@{user.name} has accessed the list of visible apis for team ${teamId} through integration api"))(
      ctx) {
      env.dataStore.teamRepo
        .forTenant(ctx.tenant)
        .findByIdOrHrId(teamId)
        .flatMap {
          case None => NotFound(Json.obj("error" -> "api not found")).future
          case Some(team) => {
            for {
              teams <- env.dataStore.teamRepo
                .forTenant(ctx.tenant)
                .findAllNotDeleted()
              apiRepo <- env.dataStore.apiRepo.forTenantF(ctx.tenant.id)
              publicApis <- apiRepo.findNotDeleted(
                Json.obj(
                  "visibility" -> "Public",
                  "team" -> team.id.value,
                  "state" -> ApiState.publishedJsonFilter
                ))
            } yield {
              val apis = publicApis
              val sortedApis =
                apis.sortWith((a, b) => a.name.compareToIgnoreCase(b.name) < 0)
              Ok(JsArray(sortedApis.map(_.asIntegrationJson(teams))))
            }
          }
        }
    }
  }

  def api(teamId: String, apiId: String) = DaikokuAction.async { ctx =>
    TenantAdminAccessTenant(AuditTrailEvent(
      "@{user.name} is accessing team @{team.name} visible api @{api.name} through integration api"))(
      ctx) {
      findById(ctx, teamId, apiId).map {
        case Left(res)          => res.render()
        case Right((team, api)) => Ok(api.asIntegrationJson(Seq(team)))
      }
    }
  }

  def apiComplete(teamId: String, apiId: String) = DaikokuAction.async { ctx =>
    TenantAdminAccessTenant(AuditTrailEvent(
      "@{user.name} is accessing team @{team.name} visible api @{api.name} complete through integration api"))(ctx) {
      (for {
        api <- EitherT(findById(ctx, teamId, apiId))
        plans <- EitherT.liftF[Future, AppError, Seq[UsagePlan]](env.dataStore.usagePlanRepo.forTenant(ctx.tenant)
          .find(Json.obj("_id" -> Json.obj("$in" -> JsArray(api._2.possibleUsagePlans.map(_.asJson))))))
      } yield {
        api._2.documentation.fetchPages(ctx.tenant).map { pages =>
          val cleanPages = pages.map(p =>
            p - "_id" - "_humanReadableId" - "lastModificationAt" ++ Json
              .obj("id" -> (p \ "_humanReadableId").as[String]))
          val newDoc = api._2.documentation.asJson
            .as[JsObject] - "_id" - "_humanReadableId" - "lastModificationAt" ++ Json
            .obj("pages" -> JsArray(cleanPages))
          Ok(api._2.asJson
            .as[JsObject] - "tenant" - "_deleted" - "_humanReadableId" - "subscriptions" - "authorizedTeams" - "managedServices" ++ Json
            .obj(
              "documentation" -> newDoc,
              "id" -> s"$teamId/$apiId/complete",
              "api" -> api._2.name.urlPathSegmentSanitized,
              "team" -> api._1.name.urlPathSegmentSanitized,
              "possibleUsagePlans" -> JsArray(plans.map(v =>
                v.asJson.as[JsObject] - "_id" ++ Json.obj(
                  "id" -> v.id.value)))
            ))
        }
      })
        .leftMap(_.renderF())
        .merge
        .flatten

    }
  }

  def apiDescription(teamId: String, apiId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminAccessTenant(AuditTrailEvent(
        "@{user.name} is accessing team @{team.name} visible api @{api.name} description through integration api"))(
        ctx) {
        findById(ctx, teamId, apiId).map {
          case Left(res) => res.render()
          case Right((team, api)) =>
            Ok(
              Json.obj(
                "id" -> s"$teamId/$apiId/description",
                "api" -> api.name.urlPathSegmentSanitized,
                "team" -> team.name.urlPathSegmentSanitized,
                "name" -> api.name,
                "description" -> api.description
              ))
        }
      }
    }

  def apiPlans(teamId: String, apiId: String) = DaikokuAction.async { ctx =>
    TenantAdminAccessTenant(AuditTrailEvent(
      "@{user.name} is accessing team @{team.name} visible api @{api.name} plans through integration api"))(
      ctx) {

      (for {
        result <- EitherT(findById(ctx, teamId, apiId))
        plans <- EitherT.liftF[Future, AppError, Seq[UsagePlan]](env.dataStore.usagePlanRepo.forTenant(ctx.tenant)
          .find(Json.obj("_id" -> Json.obj("$in" -> JsArray(result._2.possibleUsagePlans.map(_.asJson))))))
      } yield Ok(
        Json.obj(
          "id" -> s"$teamId/$apiId/plans",
          "api" -> result._2.name.urlPathSegmentSanitized,
          "team" -> result._1.name.urlPathSegmentSanitized,
          "name" -> result._2.name,
          "plans" -> JsArray(plans.map(v =>
            v.asJson.as[JsObject] - "_id" ++ Json.obj("id" -> v.id.value)))
        )))
        .leftMap(_.render())
        .merge

    }
  }

  def apiDocumentation(teamId: String, apiId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminAccessTenant(AuditTrailEvent(
        "@{user.name} is accessing team @{team.name} visible api @{api.name} documentation through integration api"))(
        ctx) {
        findById(ctx, teamId, apiId).flatMap {
          case Left(res) => res.renderF()
          case Right((team, api)) => {
            api.documentation.fetchPages(ctx.tenant).map { pages =>
              val cleanPages = pages.map(p =>
                p - "_id" - "_humanReadableId" - "lastModificationAt" ++ Json
                  .obj("id" -> (p \ "_humanReadableId").as[String]))
              val newDoc = api.documentation.asJson.as[JsObject] ++ Json.obj(
                "id" -> s"$teamId/$apiId/documentation",
                "api" -> api.name.urlPathSegmentSanitized,
                "team" -> team.name.urlPathSegmentSanitized,
                "name" -> api.name,
                "pages" -> JsArray(cleanPages)
              ) - "_id" - "_tenant" - "lastModificationAt"
              Ok(newDoc)
            }
          }
        }
      }
    }

  def apiSwagger(teamId: String, apiId: String) = DaikokuAction.async { ctx =>
    TenantAdminAccessTenant(AuditTrailEvent(
      "@{user.name} is accessing team @{team.name} visible api @{api.name} swagger through integration api"))(
      ctx) {
      findById(ctx, teamId, apiId).flatMap {
        case Left(res) => res.renderF()
        case Right((_, api)) =>
          api.swagger.map(_.swaggerContent()) match {
            case None =>
              NotFound(Json.obj("error" -> "swagger not found")).future
            case Some(fu) => fu.map(v => Ok(v))
          }
      }
    }
  }
}
