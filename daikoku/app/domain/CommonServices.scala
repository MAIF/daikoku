package fr.maif.otoroshi.daikoku.domain

import org.apache.pekko.http.scaladsl.util.FastFuture
import cats.implicits.catsSyntaxOptionId
import controllers.AppError
import fr.maif.otoroshi.daikoku.actions.DaikokuActionContext
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async.{
  TeamAdminOnly,
  _PublicUserAccess,
  _TeamAdminOnly,
  _TeamApiEditorOnly,
  _TeamMemberOnly,
  _TenantAdminAccessTenant,
  _UberPublicUserAccess
}
import fr.maif.otoroshi.daikoku.domain.NotificationAction.{
  ApiAccess,
  ApiSubscriptionDemand
}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import org.joda.time.DateTime
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future}

object CommonServices {

  def getApisByIds(ids: Seq[String])(implicit
      ctx: DaikokuActionContext[JsValue],
      env: Env,
      ec: ExecutionContext
  ): Future[Either[AppError, Seq[ApiWithAuthorizations]]] = {
    _UberPublicUserAccess(
      AuditTrailEvent(s"@{user.name} has accessed the list of visible apis")
    )(ctx) {

      val tenant = ctx.tenant
      val user = ctx.user
      val idFilter =
        if (ids.nonEmpty)
          Json.obj("_id" -> Json.obj("$in" -> JsArray(ids.map(JsString))))
        else Json.obj()
      for {
        myTeams <- env.dataStore.teamRepo.myTeams(tenant, user)
        apiRepo <- env.dataStore.apiRepo.forTenantF(tenant.id)
        myCurrentRequests <-
          if (user.isGuest) FastFuture.successful(Seq.empty)
          else
            env.dataStore.notificationRepo
              .forTenant(tenant.id)
              .findNotDeleted(
                Json.obj(
                  "action.type" -> "ApiAccess",
                  "action.team" -> Json
                    .obj("$in" -> JsArray(myTeams.map(_.id.asJson))),
                  "status.status" -> "Pending"
                )
              )
        publicApis <-
          apiRepo.findNotDeleted(Json.obj("visibility" -> "Public") ++ idFilter)
        almostPublicApis <-
          if (user.isGuest) FastFuture.successful(Seq.empty)
          else
            apiRepo.findNotDeleted(
              Json.obj("visibility" -> "PublicWithAuthorizations") ++ idFilter
            )
        privateApis <-
          if (user.isGuest) FastFuture.successful(Seq.empty)
          else
            apiRepo.findNotDeleted(
              Json.obj(
                "visibility" -> "Private",
                "$or" -> Json.arr(
                  Json.obj(
                    "authorizedTeams" -> Json
                      .obj("$in" -> JsArray(myTeams.map(_.id.asJson)))
                  )
                )
              ) ++ idFilter
            )
        adminApis <-
          if (!user.isDaikokuAdmin) FastFuture.successful(Seq.empty)
          else
            apiRepo.findNotDeleted(
              Json.obj("visibility" -> ApiVisibility.AdminOnly.name) ++ idFilter
            )
        plans <-
          env.dataStore.usagePlanRepo
            .forTenant(ctx.tenant)
            .findNotDeleted(
              Json.obj(
                "_id" -> Json.obj(
                  "$in" -> JsArray(
                    (publicApis ++ almostPublicApis ++ privateApis ++ adminApis)
                      .flatMap(_.possibleUsagePlans)
                      .map(_.asJson)
                  )
                )
              )
            )
      } yield {
        val sortedApis: Seq[ApiWithAuthorizations] =
          (publicApis ++ almostPublicApis ++ privateApis)
            .filter(api => api.isPublished || myTeams.exists(api.team == _.id))
            .sortWith((a, b) => a.name.compareToIgnoreCase(b.name) < 0)
            .foldLeft(Seq.empty[ApiWithAuthorizations]) {
              case (acc, api) =>
                val apiPlans =
                  plans.filter(p => api.possibleUsagePlans.contains(p.id))

                val authorizations = myTeams
                  .filter(t => t.`type` != TeamType.Admin)
                  .foldLeft(Seq.empty[AuthorizationApi]) {
                    case (acc, team) =>
                      acc :+ AuthorizationApi(
                        team = team.id.value,
                        authorized = api.authorizedTeams
                          .contains(team.id) || api.team == team.id,
                        pending = myCurrentRequests.exists(notif =>
                          notif.action
                            .asInstanceOf[ApiAccess]
                            .team == team.id && notif.action
                            .asInstanceOf[ApiAccess]
                            .api == api.id
                        )
                      )
                  }

                acc :+ (api.visibility.name match {
                  case "PublicWithAuthorizations" | "Private" =>
                    ApiWithAuthorizations(
                      api = api,
                      plans = apiPlans,
                      authorizations = authorizations
                    )
                  case _ => ApiWithAuthorizations(api = api, plans = apiPlans)
                })
            }

        val apis: Seq[ApiWithAuthorizations] =
          (if (user.isDaikokuAdmin)
             adminApis.foldLeft(Seq.empty[ApiWithAuthorizations]) {
               case (acc, api) =>
                 acc :+ ApiWithAuthorizations(
                   api = api,
                   plans =
                     plans.filter(p => api.possibleUsagePlans.contains(p.id)),
                   authorizations = myTeams.foldLeft(
                     Seq.empty[AuthorizationApi]
                   ) {
                     case (acc, team) =>
                       acc :+ AuthorizationApi(
                         team = team.id.value,
                         authorized =
                           user.isDaikokuAdmin && team.`type` == TeamType.Personal && team.users
                             .exists(u => u.userId == user.id),
                         pending = false
                       )
                   }
                 )
             } ++ sortedApis
           else
             sortedApis)

        apis
          .groupBy(p => (p.api.currentVersion, p.api.humanReadableId))
          .map(res => res._2.head)
          .toSeq
      }
    }
  }
  def getApisWithSubscriptions(
      teamId: String,
      research: String,
      limit: Int,
      offset: Int,
      apiSubOnly: Boolean
  )(implicit
      ctx: DaikokuActionContext[JsValue],
      env: Env,
      ec: ExecutionContext
  ): Future[Either[AppError, AccessibleApisWithNumberOfApis]] = {
    _UberPublicUserAccess(
      AuditTrailEvent(s"@{user.name} has accessed the list of visible apis")
    )(ctx) {
      for {
        subs <-
          env.dataStore.apiSubscriptionRepo
            .forTenant(ctx.tenant)
            .findNotDeleted(Json.obj("team" -> teamId))
        subsOnlyFilter =
          if (apiSubOnly)
            Json.obj(
              "_id" -> Json
                .obj("$in" -> JsArray(subs.map(a => JsString(a.api.value))))
            )
          else Json.obj()
        apiFilter = Json.obj(
          "$or" -> Json.arr(
            Json.obj("visibility" -> "Public"),
            Json.obj("authorizedTeams" -> teamId),
            Json.obj("team" -> teamId)
          ),
          "state" -> ApiState.publishedJsonFilter,
          "_deleted" -> false,
          "parent" -> JsNull, //FIXME : could be a problem if parent is not published [#517]
          "name" -> Json.obj("$regex" -> research)
        )
        uniqueApis <-
          env.dataStore.apiRepo
            .forTenant(ctx.tenant)
            .findWithPagination(
              apiFilter ++ subsOnlyFilter,
              offset,
              limit,
              Some(Json.obj("name" -> 1))
            )
        allApisFilter = Json.obj(
          "_humanReadableId" -> Json.obj(
            "$in" -> JsArray(
              uniqueApis._1.map(a => JsString(a.humanReadableId))
            )
          ),
          "state" -> ApiState.publishedJsonFilter
        )
        allApis <-
          env.dataStore.apiRepo
            .forTenant(ctx.tenant)
            .findNotDeleted(
              query = allApisFilter ++ subsOnlyFilter,
              sort = Some(Json.obj("name" -> 1))
            )
        teams <-
          env.dataStore.teamRepo
            .forTenant(ctx.tenant)
            .findNotDeleted(
              Json.obj(
                "_id" -> Json.obj("$in" -> JsArray(allApis.map(_.team.asJson)))
              )
            )
        demands <-
          env.dataStore.subscriptionDemandRepo
            .forTenant(ctx.tenant)
            .findNotDeleted(
              Json.obj(
                "team" -> teamId,
                "api" -> Json.obj("$in" -> Json.arr(allApis.map(_.id.asJson))),
                "state" -> Json.obj("$in" -> Json.arr("waiting", "inProgress"))
              )
            )
        plans <-
          env.dataStore.usagePlanRepo
            .forTenant(ctx.tenant)
            .findNotDeleted(
              Json.obj(
                "_id" -> Json.obj(
                  "$in" -> JsArray(
                    allApis.flatMap(_.possibleUsagePlans).map(_.asJson)
                  )
                )
              )
            )
      } yield {
        AccessibleApisWithNumberOfApis(
          allApis
            .map(api => {
              def filterPrivatePlan(
                  plan: UsagePlan,
                  api: Api,
                  teamId: String
              ): Boolean =
                plan.visibility != UsagePlanVisibility.Private || api.team.value == teamId || plan.authorizedTeams
                  .contains(TeamId(teamId))
              def filterUnlinkedPlan(plan: UsagePlan): Boolean =
                (ctx.user.isDaikokuAdmin || teams.exists(team =>
                  team.id == api.team && team.users
                    .exists(u => ctx.user.id == u.userId)
                )) ||
                  (plan.otoroshiTarget.nonEmpty &&
                    plan.otoroshiTarget.exists(target =>
                      target.authorizedEntities.exists(entities =>
                        entities.groups.nonEmpty || entities.routes.nonEmpty || entities.services.nonEmpty
                      )
                    ))
              val apiPlans =
                plans.filter(p => api.possibleUsagePlans.contains(p.id))
              ApiWithSubscriptions(
                api = api,
                plans = apiPlans
                  .filter(filterUnlinkedPlan)
                  .filter(p => filterPrivatePlan(p, api, teamId)),
                subscriptionsWithPlan = apiPlans
                  .filter(filterUnlinkedPlan)
                  .filter(p => filterPrivatePlan(p, api, teamId))
                  .map(plan => {
                    SubscriptionsWithPlan(
                      plan.id.value,
                      isPending = demands.exists(demand =>
                        demand.team.value == teamId && demand.plan.value == plan.id.value && demand.api.value == api.id.value
                      ),
                      subscriptionsCount = subs.count(sub =>
                        sub.plan.value == plan.id.value && sub.api == api.id
                      )
                    )
                  })
              )
            }),
          uniqueApis._2
        )
      }
    }
  }

  def getVisibleApis(
      teamId: Option[String] = None,
      research: String,
      selectedTeam: Option[String] = None,
      selectedTag: Option[String] = None,
      selectedCat: Option[String] = None,
      limit: Int,
      offset: Int,
      groupOpt: Option[String] = None
  )(implicit
      ctx: DaikokuActionContext[JsValue],
      env: Env,
      ec: ExecutionContext
  ): Future[Either[AppError, ApiWithCount]] = {
    _UberPublicUserAccess(
      AuditTrailEvent(s"@{user.name} has accessed the list of visible apis")
    )(ctx) {
      val userIsAdmin = ctx.user.isDaikokuAdmin || ctx.isTenantAdmin

      val ownerTeamFilter = selectedTeam match {
        case Some(_) => Json.obj("team" -> selectedTeam.map(JsString))
        case None    => Json.obj()
      }
      val tagFilter = selectedTag match {
        case Some(_) => Json.obj("tags" -> selectedTag.map(JsString))
        case None    => Json.obj()
      }
      val catFilter = selectedCat match {
        case Some(_) => Json.obj("categories" -> selectedCat.map(JsString))
        case None    => Json.obj()
      }
      val teamRepo = env.dataStore.teamRepo.forTenant(ctx.tenant)
      (teamId match {
        case None => teamRepo.findAllNotDeleted()
        case Some(id) =>
          teamRepo.find(
            Json.obj(
              "$or" -> Json
                .arr(Json.obj("_id" -> id), Json.obj("_humanReadableId" -> id))
            )
          )
      }).map(teams =>
          if (ctx.user.isDaikokuAdmin) teams
          else
            teams
              .filter(team => team.users.exists(u => u.userId == ctx.user.id))
        )
        .flatMap(teams => {
          val teamFilter =
            if (teams.nonEmpty)
              Json.obj(
                "team" -> Json.obj("$in" -> JsArray(teams.map(_.id.asJson)))
              )
            else Json.obj()
          val tenant = ctx.tenant
          val user = ctx.user
          for {
            myTeams <- env.dataStore.teamRepo.myTeams(tenant, user)
            apiRepo <- env.dataStore.apiRepo.forTenantF(tenant.id)
            groupFilter <-
              if (groupOpt.isDefined)
                apiRepo.findByIdNotDeleted(groupOpt.get).map {
                  case Some(api) =>
                    Json.obj(
                      "_id" -> Json.obj(
                        "$in" -> JsArray(
                          api.apis
                            .map(apiIds => apiIds.map(_.asJson))
                            .getOrElse(Set.empty)
                            .toSeq
                        )
                      )
                    )
                  case None => Json.obj()
                }
              else FastFuture.successful(Json.obj())

            myCurrentRequests <-
              if (user.isGuest) FastFuture.successful(Seq.empty)
              else
                env.dataStore.notificationRepo
                  .forTenant(tenant.id)
                  .findNotDeleted(
                    Json.obj(
                      "action.type" -> "ApiAccess",
                      "action.team" -> Json
                        .obj("$in" -> JsArray(myTeams.map(_.id.asJson))),
                      "status.status" -> "Pending"
                    )
                  )
            publicApi = Json.obj("visibility" -> "Public").some
            pwaApi =
              if (user.isGuest) None
              else Json.obj("visibility" -> "PublicWithAuthorizations").some
            privateApi =
              if (user.isGuest) None
              else
                Json
                  .obj(
                    "visibility" -> "Private",
                    "$or" -> Json.arr(
                      Json.obj(
                        "authorizedTeams" -> Json
                          .obj("$in" -> JsArray(myTeams.map(_.id.asJson)))
                      ),
                      teamFilter
                    )
                  )
                  .some
            parentFilter =
              if (groupOpt.isDefined) Json.obj()
              else Json.obj("isDefault" -> true)
            adminApi =
              if (!userIsAdmin) None
              else Json.obj("visibility" -> ApiVisibility.AdminOnly.name).some
            visibilityFilter = Json.obj(
              "$or" -> JsArray(
                Seq(publicApi, pwaApi, privateApi, adminApi)
                  .filter(_.isDefined)
                  .map(_.get)
              )
            )
            producerTeams <-
              apiRepo
                .find(
                  visibilityFilter ++ Json.obj(
                    "name" -> Json.obj("$regex" -> research),
                    "_deleted" -> false
                  ) ++ ownerTeamFilter ++ tagFilter ++ catFilter ++ groupFilter ++ parentFilter
                )
                .map(apis => apis.map(_.team))
                .flatMap(ids =>
                  env.dataStore.teamRepo
                    .forTenant(tenant)
                    .find(
                      Json.obj(
                        "_id" -> Json.obj("$in" -> JsArray(ids.map(_.asJson)))
                      )
                    )
                )

            paginateApis <- apiRepo.findWithPagination(
              visibilityFilter ++ Json.obj(
                "name" -> Json.obj("$regex" -> research),
                "_deleted" -> false
              ) ++ ownerTeamFilter ++ tagFilter ++ catFilter ++ groupFilter ++ parentFilter,
              offset,
              limit,
              Some(Json.obj("name" -> 1))
            )
            uniqueApisWithVersion <- apiRepo.findNotDeleted(
              Json.obj(
                "_humanReadableId" -> Json.obj(
                  "$in" -> JsArray(
                    paginateApis._1.map(a => JsString(a.humanReadableId))
                  )
                )
              ),
              sort = Some(Json.obj("name" -> 1))
            )
            plans <-
              env.dataStore.usagePlanRepo
                .forTenant(ctx.tenant)
                .findNotDeleted(
                  Json.obj(
                    "_id" -> Json.obj(
                      "$in" -> JsArray(
                        uniqueApisWithVersion
                          .flatMap(_.possibleUsagePlans)
                          .map(_.asJson)
                      )
                    )
                  )
                )
          } yield {
            val sortedApis: Seq[ApiWithAuthorizations] = uniqueApisWithVersion
              .filter(api =>
                api.isPublished || myTeams.exists(api.team == _.id)
              )
              .sortWith((a, b) => a.name.compareToIgnoreCase(b.name) < 0)
              .foldLeft(Seq.empty[ApiWithAuthorizations]) {
                case (acc, api) =>
                  val apiPlans = plans
                    .filter(p => api.possibleUsagePlans.contains(p.id))
                    .filter(p =>
                      p.visibility == UsagePlanVisibility.Public || myTeams
                        .exists(_.id == api.team)
                    )
                  val authorizations = myTeams
                    .filter(t => t.`type` != TeamType.Admin)
                    .foldLeft(Seq.empty[AuthorizationApi]) {
                      case (acc, team) =>
                        acc :+ AuthorizationApi(
                          team = team.id.value,
                          authorized = api.authorizedTeams
                            .contains(team.id) || api.team == team.id,
                          pending = myCurrentRequests
                            .exists(notif =>
                              notif.action
                                .asInstanceOf[ApiAccess]
                                .team == team.id && notif.action
                                .asInstanceOf[ApiAccess]
                                .api == api.id
                            )
                        )
                    }
                  acc :+ (api.visibility.name match {
                    case "PublicWithAuthorizations" | "Private" =>
                      ApiWithAuthorizations(
                        api = api,
                        plans = apiPlans,
                        authorizations = authorizations
                      )
                    case _ => ApiWithAuthorizations(api = api, plans = apiPlans)
                  })
              }
            ApiWithCount(sortedApis, producerTeams, paginatedApis._2)
          }
        })
    }
  }
  def getAllTags(research: String)(implicit
      ctx: DaikokuActionContext[JsValue],
      env: Env,
      ec: ExecutionContext
  ): Future[Seq[String]] = {
    for {
      visibleApis <- getVisibleApis(research = "", limit = -1, offset = 0)
    } yield {
      visibleApis
        .map(apis =>
          apis.apis
            .flatMap(api =>
              api.api.tags.toSeq.filter(tag => tag.indexOf(research) != -1)
            )
            .foldLeft(Map.empty[String, Int])((map, tag) => {
              val nbOfMatching = map.get(tag) match {
                case Some(count) => count + 1
                case None        => 1
              }
              map + (tag -> nbOfMatching)

            })
            .toSeq
            .sortBy(_._2)
            .reverse
            .map(a => a._1)
            .take(5)
        )
        .getOrElse(Seq.empty)
    }
  }

  def getAllCategories(research: String)(implicit
      ctx: DaikokuActionContext[JsValue],
      env: Env,
      ec: ExecutionContext
  ): Future[Seq[String]] = {
    for {
      visibleApis <- getVisibleApis(research = "", limit = -1, offset = 0)
    } yield {
      visibleApis
        .map(apis =>
          apis.apis
            .flatMap(api =>
              api.api.categories.toSeq.filter(tag =>
                tag.indexOf(research) != -1
              )
            )
            .foldLeft(Map.empty[String, Int])((map, cat) => {
              val nbOfMatching = map.get(cat) match {
                case Some(count) => count + 1
                case None        => 1
              }
              map + (cat -> nbOfMatching)

            })
            .toSeq
            .sortBy(_._2)
            .reverse
            .map(a => a._1)
            .take(5)
        )
        .getOrElse(Seq.empty)
    }
  }

  case class ApiWithTranslation(api: Api, translation: JsObject)

  def apiOfTeam(teamId: String, apiId: String, version: String)(implicit
      ctx: DaikokuActionContext[_],
      env: Env,
      ec: ExecutionContext
  ): Future[Either[AppError, ApiWithTranslation]] =
    _TeamMemberOnly(
      teamId,
      AuditTrailEvent(
        s"@{user.name} has accessed one api @{api.name} - @{api.id} of @{team.name} - @{team.id}"
      )
    )(ctx) { team =>
      val query = Json.obj(
        "team" -> team.id.value,
        "$or" -> Json.arr(
          Json.obj("_id" -> apiId),
          Json.obj("_humanReadableId" -> apiId)
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

            env.dataStore.translationRepo
              .forTenant(ctx.tenant)
              .find(Json.obj("element.id" -> api.id.asJson))
              .flatMap(translations => {
                val translationAsJsObject = translations
                  .groupBy(t => t.language)
                  .map {
                    case (k, v) =>
                      Json.obj(
                        k -> JsObject(v.map(t => t.key -> JsString(t.value)))
                      )
                  }
                  .fold(Json.obj())(_ deepMerge _)
                val translation =
                  Json.obj("translation" -> translationAsJsObject)
                FastFuture
                  .successful(Right(ApiWithTranslation(api, translation)))
              })
          case None => FastFuture.successful(Left(AppError.ApiNotFound))
        }
    }

  def myTeams()(implicit
      ctx: DaikokuActionContext[JsValue],
      env: Env,
      ec: ExecutionContext
  ) = {

    val typeFilter =
      if (
        ctx.tenant.subscriptionSecurity.isDefined
        && ctx.tenant.subscriptionSecurity.exists(identity)
      ) {
        Json.obj(
          "type" -> Json.obj("$ne" -> TeamType.Personal.name)
        )
      } else {
        Json.obj()
      }
    _UberPublicUserAccess(
      AuditTrailEvent("@{user.name} has accessed his team list")
    )(ctx) {
      (if (ctx.user.isDaikokuAdmin)
         env.dataStore.teamRepo
           .forTenant(ctx.tenant)
           .findNotDeleted(typeFilter)
       else
         env.dataStore.teamRepo
           .forTenant(ctx.tenant)
           .findNotDeleted(
             Json.obj("users.userId" -> ctx.user.id.value) ++ typeFilter
           ))
        .map(teams =>
          teams
            .sortWith((a, b) => a.name.compareToIgnoreCase(b.name) < 0)
        )
    }
  }

  def allTeams(research: String, limit: Int, offset: Int)(implicit
      ctx: DaikokuActionContext[JsValue],
      env: Env,
      ec: ExecutionContext
  ) = {
    _TenantAdminAccessTenant(
      AuditTrailEvent("@{user.name} has accessed to all teams list")
    )(ctx) {
      val typeFilter =
        if (
          ctx.tenant.subscriptionSecurity.isDefined
          && ctx.tenant.subscriptionSecurity.exists(identity)
        ) {
          Json.obj(
            "type" -> TeamType.Organization.name
          )
        } else {
          Json.obj()
        }
      for {
        teams <-
          env.dataStore.teamRepo
            .forTenant(ctx.tenant)
            .findWithPagination(
              Json.obj(
                "_deleted" -> false,
                "name" -> Json.obj("$regex" -> research)
              ) ++ typeFilter,
              offset,
              limit,
              Some(Json.obj("_humanReadableId" -> 1))
            )
      } yield {
        TeamWithCount(teams._1, teams._2)
      }
    }
  }

  def getApiConsumption(
      apiId: String,
      teamId: String,
      from: Option[Long],
      to: Option[Long],
      planId: Option[String]
  )(implicit
      ctx: DaikokuActionContext[JsValue],
      env: Env,
      ec: ExecutionContext
  ): Future[Either[AppError, Seq[ApiKeyConsumption]]] = {
    _TeamAdminOnly(
      teamId,
      AuditTrailEvent(
        s"@{user.name} has accessed to api consumption for api @{apiId}"
      )
    )(ctx) { team =>
      ctx.setCtxValue("apiId", apiId)
      val fromTimestamp = from.getOrElse(
        DateTime.now().withTimeAtStartOfDay().toDateTime.getMillis
      )
      val toTimestamp = to.getOrElse(DateTime.now().toDateTime.getMillis)
      val planIdFilters = planId match {
        case Some(value) => Json.obj("plan" -> value)
        case None        => Json.obj()
      }
      for {
        api <-
          env.dataStore.apiRepo
            .forTenant(ctx.tenant.id)
            .findOneNotDeleted(
              Json.obj(
                "team" -> team.id.value,
                "$or" -> Json.arr(
                  Json.obj("_id" -> apiId),
                  Json.obj("_humanReadableId" -> apiId)
                )
              )
            )
        apiId = api.map(api => api.id.value).get
        consumptions <-
          env.dataStore.consumptionRepo
            .forTenant(ctx.tenant.id)
            .find(
              Json.obj(
                "api" -> apiId,
                "from" -> Json.obj("$gte" -> fromTimestamp),
                "to" -> Json.obj("$lte" -> toTimestamp)
              ) ++ planIdFilters,
              Some(Json.obj("from" -> 1))
            )
      } yield {
        Right(consumptions)
      }

    }
  }

  def getApiSubscriptions(teamId: String, apiId: String, version: String)(
      implicit
      ctx: DaikokuActionContext[JsValue],
      env: Env,
      ec: ExecutionContext
  ) = {
    _TeamApiEditorOnly(
      AuditTrailEvent(
        s"@{user.name} has acceeded to team (@{team.id}) subscription for api @{api.id}"
      )
    )(teamId, ctx) { _ =>
      for {
        api <-
          env.dataStore.apiRepo
            .findByVersion(ctx.tenant, apiId, version)
        apiId = api.map((api) => api.id.value).get
        subs <-
          env.dataStore.apiSubscriptionRepo
            .forTenant(ctx.tenant)
            .findNotDeleted(Json.obj("api" -> apiId))
      } yield {
        Right(subs)
      }
    }
  }

  def getTeamIncome(teamId: String, from: Option[Long], to: Option[Long])(
      implicit
      ctx: DaikokuActionContext[JsValue],
      env: Env,
      ec: ExecutionContext
  ) = {
    _TeamAdminOnly(
      teamId,
      AuditTrailEvent(
        s"@{user.name} has accessed to team billing for @{team.name}"
      )
    )(ctx) { team =>
      val fromTimestamp = from.getOrElse(
        DateTime.now().withTimeAtStartOfDay().toDateTime.getMillis
      )
      val toTimestamp =
        to.getOrElse(DateTime.now().withTimeAtStartOfDay().toDateTime.getMillis)
      for {
        ownApis <-
          env.dataStore.apiRepo
            .forTenant(ctx.tenant.id)
            .findNotDeleted(Json.obj("team" -> team.id.value))
        revenue <-
          env.dataStore.consumptionRepo
            .getLastConsumptionsForTenant(
              ctx.tenant.id,
              Json.obj(
                "api" -> Json.obj("$in" -> JsArray(ownApis.map(_.id.asJson))),
                "from" -> Json
                  .obj("$gte" -> fromTimestamp, "$lte" -> toTimestamp),
                "to" -> Json.obj("$gte" -> fromTimestamp, "$lte" -> toTimestamp)
              )
            )
      } yield {
        Right(revenue)
      }
    }
  }

  def getMyNotification(page: Int, pageSize: Int)(implicit
      ctx: DaikokuActionContext[JsValue],
      env: Env,
      ec: ExecutionContext
  ) = {
    _PublicUserAccess(
      AuditTrailEvent(
        s"@{user.name} has accessed to his count of unread notifications"
      )
    )(ctx) {
      for {
        myTeams <- env.dataStore.teamRepo.myTeams(ctx.tenant, ctx.user)
        notificationRepo <-
          env.dataStore.notificationRepo
            .forTenantF(ctx.tenant.id)
        notifications <- notificationRepo.findWithPagination(
          Json.obj(
            "_deleted" -> false,
            "$or" -> Json.arr(
              Json.obj(
                "team" -> Json.obj(
                  "$in" -> JsArray(
                    myTeams
                      .filter(t => t.admins().contains(ctx.user.id))
                      .map(_.id.asJson)
                  )
                )
              ),
              Json.obj("action.user" -> ctx.user.id.asJson)
            ),
            "status.status" -> NotificationStatus.Pending.toString
          ),
          page,
          pageSize
        )
      } yield {
        Right(NotificationWithCount(notifications._1, notifications._2))
      }
    }
  }
}
