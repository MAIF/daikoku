package fr.maif.otoroshi.daikoku.domain

import akka.http.scaladsl.util.FastFuture
import cats.implicits.catsSyntaxOptionId
import controllers.AppError
import fr.maif.otoroshi.daikoku.actions.DaikokuActionContext
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async.{_TeamMemberOnly, _UberPublicUserAccess}
import fr.maif.otoroshi.daikoku.domain.NotificationAction.{ApiAccess, ApiSubscriptionDemand}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future}

object CommonServices {

  def getApisByIds(ids: Seq[String])
                  (implicit ctx: DaikokuActionContext[JsValue], env: Env, ec: ExecutionContext): Future[Either[Seq[ApiWithAuthorizations], AppError]] = {
    _UberPublicUserAccess(AuditTrailEvent(s"@{user.name} has accessed the list of visible apis"))(ctx) {

      val tenant = ctx.tenant
      val user = ctx.user
      val idFilter = if (ids.nonEmpty) Json.obj("_id" -> Json.obj("$in" -> JsArray(ids.map(JsString)))) else Json.obj()
      for {
        myTeams <- env.dataStore.teamRepo.myTeams(tenant, user)
        apiRepo <- env.dataStore.apiRepo.forTenantF(tenant.id)
        myCurrentRequests <- if (user.isGuest) FastFuture.successful(Seq.empty) else env.dataStore.notificationRepo
          .forTenant(tenant.id)
          .findNotDeleted(
            Json.obj("action.type" -> "ApiAccess",
              "action.team" -> Json.obj("$in" -> JsArray(myTeams.map(_.id.asJson))),
              "status.status" -> "Pending")
          )
        publicApis <- apiRepo.findNotDeleted(Json.obj("visibility" -> "Public") ++ idFilter)
        almostPublicApis <- if (user.isGuest) FastFuture.successful(Seq.empty) else apiRepo.findNotDeleted(Json.obj("visibility" -> "PublicWithAuthorizations") ++ idFilter)
        privateApis <- if (user.isGuest) FastFuture.successful(Seq.empty) else apiRepo.findNotDeleted(
          Json.obj(
            "visibility" -> "Private",
            "$or" -> Json.arr(
              Json.obj("authorizedTeams" -> Json.obj("$in" -> JsArray(myTeams.map(_.id.asJson))))
            )) ++ idFilter)
        adminApis <- if (!user.isDaikokuAdmin) FastFuture.successful(Seq.empty) else apiRepo.findNotDeleted(
          Json.obj("visibility" -> ApiVisibility.AdminOnly.name) ++ idFilter
        )
      } yield {
        val sortedApis: Seq[ApiWithAuthorizations] = (publicApis ++ almostPublicApis ++ privateApis)
          .filter(api => api.published || myTeams.exists(api.team == _.id))
          .sortWith((a, b) => a.name.compareToIgnoreCase(b.name) < 0)
          .map(api => api
            .copy(possibleUsagePlans = api.possibleUsagePlans.filter(p => p.visibility == UsagePlanVisibility.Public || myTeams.exists(_.id == api.team))))
          .foldLeft(Seq.empty[ApiWithAuthorizations]) { case (acc, api) =>
            val authorizations = myTeams
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
            authorizations = myTeams.foldLeft(Seq.empty[AuthorizationApi]) { case (acc, team) =>
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
    }
  }
  def getApisWithSubscriptions(teamId: String, research: String, selectedTag: Option[String] = None, selectedCat: Option[String] = None, limit: Int, offset: Int, apiSubOnly: Boolean)(implicit ctx: DaikokuActionContext[JsValue], env: Env, ec: ExecutionContext): Future[Either[AccessibleApisWithNumberOfApis, AppError]] = {
    _UberPublicUserAccess(AuditTrailEvent(s"@{user.name} has accessed the list of visible apis"))(ctx) {
      val tagFilter = selectedTag match {
        case Some(_) => Json.obj("tags" -> selectedTag.map(JsString))
        case None => Json.obj()
      }
      val catFilter = selectedCat match {
        case Some(_) => Json.obj("categories" -> selectedCat.map(JsString))
        case None => Json.obj()
      }
      for {
        subs <- env.dataStore.apiSubscriptionRepo.forTenant(ctx.tenant).findNotDeleted(Json.obj("team" -> teamId))
        subsOnlyFilter = if (apiSubOnly) Json.obj("_id" -> Json.obj("$in" -> JsArray(subs.map(a => JsString(a.api.value))))) else Json.obj()
        apiFilter = Json.obj("$or" -> Json.arr(
          Json.obj("visibility" -> "Public"),
          Json.obj("authorizedTeams" -> teamId),
          Json.obj("team" -> teamId),
        ),
          "published" -> true,
          "_deleted" -> false,
          "parent" -> JsNull, //FIXME : could be a problem if parent is not published
          "name" -> Json.obj("$regex" -> research))
        uniqueApis <- env.dataStore.apiRepo.forTenant(ctx.tenant).findWithPagination(apiFilter ++ subsOnlyFilter ++ tagFilter ++ catFilter, offset, limit, Some(Json.obj("name" -> 1)))

        allApisFilter = Json.obj("_humanReadableId" -> Json.obj("$in" -> JsArray(uniqueApis._1.map(a => JsString(a.humanReadableId)))), "published" -> true) //++ tagFilter ++ catFilter
        allApis <- env.dataStore.apiRepo.forTenant(ctx.tenant).findNotDeleted(query = allApisFilter ++ subsOnlyFilter, sort = Some(Json.obj("name" -> 1)))
        teams <- env.dataStore.teamRepo.forTenant(ctx.tenant).findNotDeleted(Json.obj("_id" -> Json.obj("$in" -> JsArray(allApis.map(_.team.asJson)))))
        notifs <- env.dataStore.notificationRepo.forTenant(ctx.tenant).findNotDeleted(Json.obj("action.team" -> teamId,
          "action.type" -> "ApiSubscription",
          "status.status" -> "Pending"
        ))
      } yield {
        AccessibleApisWithNumberOfApis(
          allApis
            .map(api => {
              def filterPrivatePlan(plan: UsagePlan, api: Api, teamId: String): Boolean = plan.visibility != UsagePlanVisibility.Private || api.team.value == teamId ||  plan.authorizedTeams.contains(TeamId(teamId))
              def filterUnlinkedPlan(plan: UsagePlan): Boolean = (ctx.user.isDaikokuAdmin || teams.exists(team => team.id == api.team && team.users.exists(u => ctx.user.id == u.userId))) ||
                (plan.otoroshiTarget.nonEmpty &&
                  plan.otoroshiTarget.exists(target => target.authorizedEntities.exists(entities => entities.groups.nonEmpty || entities.routes.nonEmpty || entities.services.nonEmpty)))
              ApiWithSubscriptions(
                api.copy(possibleUsagePlans = api.possibleUsagePlans.filter(filterUnlinkedPlan).filter(p => filterPrivatePlan(p, api, teamId))),
                api.possibleUsagePlans
                  .filter(filterUnlinkedPlan)
                  .filter(p => filterPrivatePlan(p, api, teamId))
                  .map(plan => {
                    SubscriptionsWithPlan(plan.id.value,
                      isPending = notifs.exists(notif => notif.action.asInstanceOf[ApiSubscriptionDemand].team.value == teamId && notif.action.asInstanceOf[ApiSubscriptionDemand].plan.value == plan.id.value && notif.action.asInstanceOf[ApiSubscriptionDemand].api.value == api.id.value),
                      subscriptionsCount = subs.count(sub => sub.plan.value == plan.id.value && sub.api == api.id))
                  }))
            }), uniqueApis._2)
      }
    }
  }

  def getVisibleApis[A](teamId: Option[String] = None, research: String, selectedTag: Option[String] = None, selectedCat: Option[String] = None, limit: Int, offset: Int, groupOpt: Option[String] = None)
                       (implicit ctx: DaikokuActionContext[JsValue], env: Env, ec: ExecutionContext): Future[Either[ApiWithCount, AppError]] = {
    _UberPublicUserAccess(AuditTrailEvent(s"@{user.name} has accessed the list of visible apis"))(ctx) {
      val userIsAdmin = ctx.user.isDaikokuAdmin || ctx.isTenantAdmin

      val tagFilter = selectedTag match {
        case Some(_) => Json.obj("tags" -> selectedTag.map(JsString))
        case None => Json.obj()
      }
      val catFilter = selectedCat match {
        case Some(_) => Json.obj("categories" -> selectedCat.map(JsString))
        case None => Json.obj()
      }
      val teamRepo = env.dataStore.teamRepo.forTenant(ctx.tenant)
      (teamId match {
        case None => teamRepo.findAllNotDeleted()
        case Some(id) => teamRepo.find(Json.obj("$or" -> Json.arr(Json.obj("_id" -> id), Json.obj("_humanReadableId" -> id))))
      })
        .map(teams => if (ctx.user.isDaikokuAdmin) teams else teams.filter(team => team.users.exists(u => u.userId == ctx.user.id)))
        .flatMap(teams => {
          val teamFilter = if (teams.nonEmpty) Json.obj("team" -> Json.obj("$in" -> JsArray(teams.map(_.id.asJson)))) else Json.obj()
          val tenant = ctx.tenant
          val user = ctx.user
          for {
            myTeams <- env.dataStore.teamRepo.myTeams(tenant, user)
            apiRepo <- env.dataStore.apiRepo.forTenantF(tenant.id)
            groupFilter <- if (groupOpt.isDefined) apiRepo.findByIdNotDeleted(groupOpt.get).map {
              case Some(api) => Json.obj("_id" -> Json.obj("$in" -> JsArray(api.apis.map(apiIds => apiIds.map(_.asJson)).getOrElse(Set.empty).toSeq)))
              case None => Json.obj()
            } else FastFuture.successful(Json.obj())

            myCurrentRequests <- if (user.isGuest) FastFuture.successful(Seq.empty) else env.dataStore.notificationRepo
              .forTenant(tenant.id)
              .findNotDeleted(
                Json.obj("action.type" -> "ApiAccess",
                  "action.team" -> Json.obj("$in" -> JsArray(myTeams.map(_.id.asJson))),
                  "status.status" -> "Pending")
              )
            publicApi = Json.obj("visibility" -> "Public").some
            pwaApi = if (user.isGuest) None else Json.obj("visibility" -> "PublicWithAuthorizations").some
            privateApi = if (user.isGuest) None else Json.obj("visibility" -> "Private",
              "$or" -> Json.arr(
                Json.obj("authorizedTeams" -> Json.obj("$in" -> JsArray(myTeams.map(_.id.asJson)))),
                teamFilter
              )).some
            adminApi = if (!userIsAdmin) None else Json.obj("visibility" -> ApiVisibility.AdminOnly.name).some
            visibilityFilter = Json.obj("$or" -> JsArray(Seq(publicApi, pwaApi, privateApi, adminApi).filter(_.isDefined).map(_.get)))
            paginateApis <- apiRepo.findWithPagination(visibilityFilter ++ Json.obj("name" -> Json.obj("$regex" -> research)
              , "parent" -> JsNull, "_deleted" -> false) ++ tagFilter ++ catFilter ++ groupFilter
              , offset, limit, Some(Json.obj("name" -> 1))
            )
            uniqueApisWithVersion <- apiRepo.findNotDeleted(
              Json.obj("_humanReadableId" -> Json.obj("$in" -> JsArray(paginateApis._1.map(a => JsString(a.humanReadableId))))),
              sort = Some(Json.obj("name" -> 1)))
          } yield {
            val sortedApis: Seq[ApiWithAuthorizations] = uniqueApisWithVersion
              .filter(api => api.published || myTeams.exists(api.team == _.id))
              .sortWith((a, b) => a.name.compareToIgnoreCase(b.name) < 0)
              .map(api => api
                .copy(possibleUsagePlans = api.possibleUsagePlans.filter(p => p.visibility == UsagePlanVisibility.Public || myTeams.exists(_.id == api.team))))
              .foldLeft(Seq.empty[ApiWithAuthorizations]) { case (acc, api) =>
                val authorizations = myTeams
                  .filter(t => t.`type` != TeamType.Admin)
                  .foldLeft(Seq.empty[AuthorizationApi]) { case (acc, team) =>
                    acc :+ AuthorizationApi(
                      team = team.id.value,
                      authorized = api.authorizedTeams.contains(team.id) || api.team == team.id,
                      pending = myCurrentRequests
                        .exists(notif => notif.action.asInstanceOf[ApiAccess].team == team.id && notif.action.asInstanceOf[ApiAccess].api == api.id)
                    )
                  }
                acc :+ (api.visibility.name match {
                  case "PublicWithAuthorizations" | "Private" => ApiWithAuthorizations(api = api, authorizations = authorizations)
                  case _ => ApiWithAuthorizations(api = api)
                })
              }
            ApiWithCount(sortedApis, paginateApis._2)
          }
        })
        }
    }
  def getAllTags(research: String)(implicit ctx: DaikokuActionContext[_], env: Env, ec: ExecutionContext): Future[Seq[String]]= {
    for {
      apis <- env.dataStore.apiRepo.forTenant(ctx.tenant.id).findAllNotDeleted()
    } yield {
      apis.flatMap(api => api.tags.toSeq.filter(tag => tag.indexOf(research) != -1)).foldLeft(Map.empty[String, Int])((map, tag) => {
        val nbOfMatching = map.get(tag) match {
          case Some(count) => count + 1
          case None => 1
        }
        map + (tag -> nbOfMatching)

      }).toSeq.sortBy(_._2).reverse.map(a => a._1).take(5)

    }
  }

  def getAllCategories(research: String)(implicit ctx: DaikokuActionContext[_], env: Env, ec: ExecutionContext): Future[Seq[String]]= {
    for{
      apis <- env.dataStore.apiRepo.forTenant(ctx.tenant.id).findAllNotDeleted()
    } yield {
      apis.flatMap(api => api.categories.toSeq.filter(cat => cat.indexOf(research) != -1)).foldLeft(Map.empty[String, Int])((map, cat) => {
        val nbOfMatching = map.get(cat) match {
          case Some(count) => count + 1
          case None => 1
        }
        map + (cat -> nbOfMatching)

      }).toSeq.sortBy(_._2).reverse.map(a => a._1).take(5)
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
