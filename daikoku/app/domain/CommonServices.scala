package fr.maif.otoroshi.daikoku.domain

import akka.http.scaladsl.util.FastFuture
import controllers.AppError
import fr.maif.otoroshi.daikoku.actions.DaikokuActionContext
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async.{_TeamMemberOnly, _UberPublicUserAccess}
import fr.maif.otoroshi.daikoku.domain.NotificationAction.ApiAccess
import fr.maif.otoroshi.daikoku.domain.SchemaDefinition.NotAuthorizedError
import fr.maif.otoroshi.daikoku.env.Env
import play.api.libs.json._
import play.api.mvc.AnyContent

import scala.concurrent.{ExecutionContext, Future}

object CommonServices {

  def getVisibleApis[A](teamId: Option[String] = None)
                       (implicit ctx: DaikokuActionContext[JsValue], env: Env, ec: ExecutionContext): Future[Either[Seq[ApiWithAuthorizations], AppError]] = {
    _UberPublicUserAccess(AuditTrailEvent(s"@{user.name} has accessed the list of visible apis"))(ctx) {
      val teamRepo = env.dataStore.teamRepo.forTenant(ctx.tenant)
      (teamId match {
        case None => teamRepo.findAllNotDeleted()
        case Some(id) => teamRepo.find(Json.obj("_humanReadableId" -> id))
      })
        .map(teams => if (ctx.user.isDaikokuAdmin) teams else teams.filter(team => team.users.exists(u => u.userId == ctx.user.id)))
        .flatMap(teams => {
          val teamFilter = Json.obj("team" -> Json.obj("$in" -> JsArray(teams.map(_.id.asJson))))
          val tenant = ctx.tenant
          val user = ctx.user
          for {
            myTeams <- env.dataStore.teamRepo.myTeams(tenant, user)
            apiRepo <- env.dataStore.apiRepo.forTenantF(tenant.id)
            myCurrentRequests <- if (user.isGuest) FastFuture.successful(Seq.empty) else env.dataStore.notificationRepo
              .forTenant(tenant.id)
              .findNotDeleted(
                Json.obj("action.type" -> "ApiAccess",
                  "action.team" -> Json.obj("$in" -> JsArray(teams.map(_.id.asJson))),
                  "status.status" -> "Pending")
              )
            publicApis <- apiRepo.findNotDeleted(Json.obj("visibility" -> "Public"))
            almostPublicApis <- if (user.isGuest) FastFuture.successful(Seq.empty) else apiRepo.findNotDeleted(Json.obj("visibility" -> "PublicWithAuthorizations"))
            privateApis <- if (user.isGuest) FastFuture.successful(Seq.empty) else apiRepo.findNotDeleted(
              Json.obj(
                "visibility" -> "Private",
                "$or" -> Json.arr(
                  Json.obj("authorizedTeams" -> Json.obj("$in" -> JsArray(teams.map(_.id.asJson)))),
                  teamFilter
                )))
            adminApis <- if (!user.isDaikokuAdmin) FastFuture.successful(Seq.empty) else apiRepo.findNotDeleted(
              Json.obj("visibility" -> ApiVisibility.AdminOnly.name) ++ teamFilter
            )
          } yield {
            val sortedApis: Seq[ApiWithAuthorizations] = (publicApis ++ almostPublicApis ++ privateApis).filter(api => api.published || myTeams.exists(api.team == _.id))
              .sortWith((a, b) => a.name.compareToIgnoreCase(b.name) < 0)
              .map(api => api
                .copy(possibleUsagePlans = api.possibleUsagePlans.filter(p => p.visibility == UsagePlanVisibility.Public || myTeams.exists(_.id == api.team))))
              .foldLeft(Seq.empty[ApiWithAuthorizations]) { case (acc, api) =>
                val authorizations = teams
                  .filter(t => t.`type` != TeamType.Admin)
                  .foldLeft(Seq.empty[AuthorizationApi]) { case (acc, team) =>
                    acc :+ AuthorizationApi(
                      team = team.id.value,
                      authorized = (api.authorizedTeams.contains(team.id) || api.team == team.id),
                      pending = myCurrentRequests.exists(notif =>
                        notif.action.asInstanceOf[ApiAccess].team == team.id && notif.action.asInstanceOf[ApiAccess].api == api.id)
                    )
                  }

                acc :+ (api.visibility.name match {
                  case "PublicWithAuthorizations" | "Private" => ApiWithAuthorizations(api = api, authorizations = authorizations)
                  case _ => ApiWithAuthorizations(api = api)
                })
              }

            val apis: Seq[ApiWithAuthorizations] = (if (user.isDaikokuAdmin)
                  adminApis.foldLeft(Seq.empty[ApiWithAuthorizations]) { case (acc, api) => acc :+ ApiWithAuthorizations(
                    api = api,
                    authorizations = teams.foldLeft(Seq.empty[AuthorizationApi]) { case (acc, team) =>
                      acc :+ AuthorizationApi(
                        team = team.id.value,
                        authorized = user.isDaikokuAdmin && team.`type` == TeamType.Personal && team.users.exists(u => u.userId == user.id),
                        pending = false
                      )
                    })
                  } ++ sortedApis
                else
                  sortedApis)

              apis.groupBy(p => (p.api.currentVersion, p.api.humanReadableId))
                .map(res => res._2.head)
                .toSeq
              }
          })
        }
    }

  case class ApiWithTranslation(api: Api, translation: JsObject)

  def apiOfTeam(teamId: String, apiId: String, version: String)
               (implicit ctx: DaikokuActionContext[_], env: Env, ec: ExecutionContext): Future[Either[ApiWithTranslation, AppError]]=
    _TeamMemberOnly(
      teamId,
      AuditTrailEvent(s"@{user.name} has accessed one api @{api.name} - @{api.id} of @{team.name} - @{team.id}"))(ctx) { team =>
      val query = Json.obj(
        "team" -> team.id.value,
        "$or" -> Json.arr(
          Json.obj("_id" -> apiId),
          Json.obj("_humanReadableId" -> apiId),
        ),
        "currentVersion" -> version
      )

      env.dataStore.apiRepo
        .forTenant(ctx.tenant.id)
        .findOneNotDeleted(query)
        .flatMap {
          case Some(api) =>
            ctx.setCtxValue("api.id", api.id)
            ctx.setCtxValue("api.name", api.name)

            env.dataStore.translationRepo.forTenant(ctx.tenant)
              .find(Json.obj("element.id" -> api.id.asJson))
              .flatMap(translations => {
                val translationAsJsObject = translations
                  .groupBy(t => t.language)
                  .map {
                    case (k, v) => Json.obj(k -> JsObject(v.map(t => t.key -> JsString(t.value))))
                  }.fold(Json.obj())(_ deepMerge _)
                val translation = Json.obj("translation" -> translationAsJsObject)
                FastFuture.successful(Left(ApiWithTranslation(api, translation)))
              })
          case None => FastFuture.successful(Right(AppError.ApiNotFound))
        }
    }


  def myTeams()(implicit ctx: DaikokuActionContext[JsValue], env: Env, ec: ExecutionContext) = {
    _UberPublicUserAccess(AuditTrailEvent("@{user.name} has accessed his team list"))(ctx) {
      (if (ctx.user.isDaikokuAdmin)
        env.dataStore.teamRepo.forTenant(ctx.tenant)
          .findAllNotDeleted()
      else
        env.dataStore.teamRepo.forTenant(ctx.tenant)
          .findNotDeleted(Json.obj("users.userId" -> ctx.user.id.value))
        )
        .map(teams => teams.sortWith((a, b) => a.name.compareToIgnoreCase(b.name) < 0))
    }
  }

}