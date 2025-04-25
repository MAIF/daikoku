package fr.maif.otoroshi.daikoku.domain

import cats.data.EitherT
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
import storage.drivers.postgres.PostgresDataStore
import storage.drivers.postgres.pgimplicits.EnhancedRow

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

  def allVisibleApisSqlQuery(tenant: Tenant) =
    s"""
       |SELECT content
       |FROM apis
       |WHERE (
       |  content ->> '_tenant' = '${tenant.id.value}' AND
       |  (content ->> 'state' = 'published' OR
       |   $$1 OR
       |   content ->> 'team' = ANY($$2::text[]))
       |      AND
       |  (case
       |       WHEN $$3 THEN content ->> 'visibility' = '${ApiVisibility.Public.name}'
       |       WHEN $$1 THEN TRUE
       |       ELSE (content ->> 'visibility' IN ('${ApiVisibility.Public.name}', '${ApiVisibility.PublicWithAuthorizations.name}') OR (content ->> 'team' = ANY ($$2::text[])) OR (content -> 'authorizedTeams' ?| ARRAY[$$2]))
       |      END) AND
       |  (content ->> 'name' ~* COALESCE(NULLIF($$4, ''), '.*')) AND
       |  (_deleted = false) AND
       |  (COALESCE($$5, '') = '' OR content ->> 'team' = $$5) AND
       |  (COALESCE($$6, '') = '' OR content -> 'tags' ? $$6) AND
       |  (COALESCE($$7, '') = '' OR content -> 'categories' ? $$7) AND
       |  (COALESCE($$8, '') = '' OR (content ->> '_id' IN (SELECT jsonb_array_elements_text(content -> 'apis')
       |                                                    FROM apis
       |                                                    WHERE _id = $$8))) AND
       |  (content ->> 'isDefault')::boolean
       |)
       |ORDER BY CASE WHEN content ->> '_id' = ANY ($$9::text[]) THEN 0 ELSE 1 END,
       |LOWER(content ->> 'name')
       |""".stripMargin

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
      val tenant = ctx.tenant
      val user = ctx.user
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

        paginateApis <- apiRepo.queryPaginated(
          allVisibleApisSqlQuery(ctx.tenant),
          Seq(
            java.lang.Boolean.valueOf(user.isDaikokuAdmin),
            myTeams.map(_.id.value).toArray,
            java.lang.Boolean.valueOf(user.isGuest),
            research,
            selectedTeam.orNull,
            selectedTag.orNull,
            selectedCat.orNull,
            groupOpt.orNull,
            ctx.user.starredApis.map(_.value).toArray
          ),
          offset * limit,
          limit
        )

        producerTeams <-
          env.dataStore.teamRepo
            .forTenant(ctx.tenant)
            .query(
              s"""
               |with visible_apis as (${allVisibleApisSqlQuery(ctx.tenant)})
               |
               |SELECT DISTINCT(teams.content) FROM visible_apis
               |LEFT JOIN teams on teams._id = visible_apis.content ->> 'team'
               |""".stripMargin,
              Seq(
                java.lang.Boolean.valueOf(user.isDaikokuAdmin),
                myTeams.map(_.id.value).toArray,
                java.lang.Boolean.valueOf(user.isGuest),
                research,
                selectedTeam.orNull,
                selectedTag.orNull,
                selectedCat.orNull,
                groupOpt.orNull,
                null
              )
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
          .sortWith { (a, b) =>
            (
              user.starredApis.contains(a.id),
              user.starredApis.contains(b.id)
            ) match {
              case (true, false) => true
              case (false, true) => false
              case _             => a.name.compareToIgnoreCase(b.name) < 0
            }
          }
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
        ApiWithCount(sortedApis, producerTeams, paginateApis._2)
      }
    }
  }
  def getAllTags(
      research: String,
      selectedTeam: Option[String] = None,
      selectedTag: Option[String] = None,
      selectedCat: Option[String] = None,
      groupOpt: Option[String],
      filter: String,
      limit: Int,
      offset: Int
  )(implicit
      ctx: DaikokuActionContext[JsValue],
      env: Env,
      ec: ExecutionContext
  ): Future[Seq[String]] = {
    for {
      myTeams <- env.dataStore.teamRepo.myTeams(ctx.tenant, ctx.user)
      tags <-
        env.dataStore
          .asInstanceOf[PostgresDataStore]
          .queryString(
            s"""
             |with visible_apis as (${allVisibleApisSqlQuery(ctx.tenant)})
             |
             |SELECT tag
             |FROM (SELECT DISTINCT jsonb_array_elements_text(content -> 'tags') AS tag
             |            FROM visible_apis)_
             |WHERE tag ~* COALESCE($$10, '')
             |ORDER BY LOWER(tag)
             |LIMIT $$11 OFFSET $$12;
             |""".stripMargin,
            "tag",
            Seq(
              java.lang.Boolean.valueOf(ctx.user.isDaikokuAdmin),
              myTeams.map(_.id.value).toArray,
              java.lang.Boolean.valueOf(ctx.user.isGuest),
              research,
              selectedTeam.orNull,
              selectedTag.orNull,
              selectedCat.orNull,
              groupOpt.orNull,
              null,
              filter,
              if (limit == -1) null else java.lang.Integer.valueOf(limit),
              if (offset == -1) null
              else java.lang.Integer.valueOf(offset)
            )
          )
    } yield tags
  }

  def getAllCategories(
      research: String,
      selectedTeam: Option[String] = None,
      selectedTag: Option[String] = None,
      selectedCat: Option[String] = None,
      groupOpt: Option[String],
      filter: String,
      limit: Int,
      offset: Int
  )(implicit
      ctx: DaikokuActionContext[JsValue],
      env: Env,
      ec: ExecutionContext
  ): Future[Seq[String]] = {
    for {
      myTeams <- env.dataStore.teamRepo.myTeams(ctx.tenant, ctx.user)
      tags <-
        env.dataStore
          .asInstanceOf[PostgresDataStore]
          .queryString(
            s"""
             |with visible_apis as (${allVisibleApisSqlQuery(ctx.tenant)})
             |
             |SELECT category
             |FROM (SELECT DISTINCT jsonb_array_elements_text(content -> 'categories') AS category
             |            FROM visible_apis)_
             |WHERE category ~* COALESCE($$10, '')
             |ORDER BY LOWER(category)
             |LIMIT $$11 OFFSET $$12;
             |""".stripMargin,
            "category",
            Seq(
              java.lang.Boolean.valueOf(ctx.user.isDaikokuAdmin),
              myTeams.map(_.id.value).toArray,
              java.lang.Boolean.valueOf(ctx.user.isGuest),
              research,
              selectedTeam.orNull,
              selectedTag.orNull,
              selectedCat.orNull,
              groupOpt.orNull,
              null,
              filter,
              if (limit == -1) null else java.lang.Integer.valueOf(limit),
              if (offset == -1) null
              else java.lang.Integer.valueOf(offset)
            )
          )
    } yield tags
  }

  def apiOfTeam(teamId: String, apiId: String, version: String)(implicit
      ctx: DaikokuActionContext[_],
      env: Env,
      ec: ExecutionContext
  ): Future[Either[AppError, Api]] =
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

      (for {
        api <- EitherT.fromOptionF(
          env.dataStore.apiRepo
            .forTenant(ctx.tenant.id)
            .findOneNotDeleted(query),
          AppError.ApiNotFound
        )
      } yield {
        ctx.setCtxValue("api.id", api.id)
        ctx.setCtxValue("api.name", api.name)

        api
      }).value
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

  def getApiSubscriptions(
      teamId: String,
      apiId: String,
      version: String,
      filters: JsArray,
      sorting: JsArray,
      limit: Int,
      offset: Int
  )(implicit
      ctx: DaikokuActionContext[JsValue],
      env: Env,
      ec: ExecutionContext
  ) = {
    _TeamApiEditorOnly(
      AuditTrailEvent(
        s"@{user.name} has acceeded to team (@{team.id}) subscription for api @{api.id}"
      )
    )(teamId, ctx) { _ =>
      def getFiltervalue[T](key: String)(implicit fjs: Reads[T]): Option[T] = {
        filters.value
          .find(entry => {
            entry
              .as[JsObject]
              .value
              .exists(p => p._1 == "id" && p._2.as[String] == key)
          })
          .flatMap(v =>
            v.as[JsObject].value.find(p => p._1 == "value").map(_._2.as[T])
          )
      }

      val defaultOrderClause =
        "ORDER BY COALESCE(s.content ->> 'adminCustomName', s.content -> 'apiKey' ->> 'clientName') ASC"
      val sortClause = sorting.head.asOpt[JsObject] match {
        case Some(value) =>
          val desc = value.value.get("desc") match {
            case Some(json) if json.asOpt[Boolean].contains(true) => "DESC"
            case _                                                => "ASC"
          }

          value.value.get("id").map(_.as[String]) match {
            case Some(id) if id == "subscription" =>
              s"ORDER BY COALESCE(s.content ->> 'adminCustomName', s.content -> 'apiKey' ->> 'clientName') $desc"
            case Some(id) if id == "plan" =>
              s"ORDER BY p.content ->> 'customName' $desc"
            case Some(id) if id == "team" =>
              s"ORDER BY t.content ->> 'name' $desc"
            case _ => defaultOrderClause
          }
        case None => defaultOrderClause
      }

      val query = s"""
           |SELECT s.content
           |from api_subscriptions s
           |         LEFT JOIN teams t ON t._id = s.content ->> 'team'
           |         LEFT JOIN usage_plans p ON p._id = s.content ->> 'plan'
           |WHERE s.content ->> 'api' = $$1
           |  AND COALESCE(s.content ->> 'adminCustomName', s.content -> 'apiKey' ->> 'clientName') ~* COALESCE($$2::text, '')
           |  AND (p.content ->> 'customName') ~* COALESCE($$3, '')
           |  AND (t.content ->> 'name') ~* COALESCE($$4::text, '')
           |  AND (s.content -> 'tags') @> COALESCE($$5::text::jsonb, '[]'::jsonb)
           |  AND CASE
           |          WHEN array_length($$6::text[], 1) IS NULL THEN true
           |          ELSE s.content -> 'apiKey' ->> 'clientId' = ANY ($$6::text[])
           |    END
           |  AND s.content -> 'metadata' @> COALESCE($$7::text::jsonb, '{}'::jsonb)
           |$sortClause
           |LIMIT $$8 OFFSET $$9;
           |""".stripMargin

      (for {
        subs <- EitherT.liftF[Future, AppError, Seq[ApiSubscription]](
          env.dataStore.apiSubscriptionRepo
            .forTenant(ctx.tenant)
            .query(
              query,
              Seq(
                apiId,
                getFiltervalue[String]("subscription").orNull[String],
                getFiltervalue[String]("plan").orNull[String],
                getFiltervalue[String]("team").orNull[String],
                getFiltervalue[JsArray]("tags")
                  .map(Json.stringify(_))
                  .orNull[String],
                getFiltervalue[JsArray]("clientIds")
                  .map(_.value.map(_.as[String]).toArray)
                  .orNull,
                getFiltervalue[JsObject]("metadata")
                  .map(Json.stringify(_))
                  .orNull[String],
                java.lang.Integer.valueOf(limit),
                java.lang.Integer.valueOf(offset)
              )
            )
        )
      } yield {
        ctx.setCtxValue("api.id", apiId)
        subs
      }).value
    }
  }

  def getApiSubscriptionDetails(apiSubscriptionId: String, teamId: String)(
      implicit
      ctx: DaikokuActionContext[JsValue],
      env: Env,
      ec: ExecutionContext
  ) = {
    _TeamMemberOnly(
      teamId,
      AuditTrailEvent(
        s"@{user.name} has accessed one api @{api.name} - @{api.id} of @{team.name} - @{team.id}"
      )
    )(ctx) { _ =>
      val sql =
        """
          |SELECT row_to_json(_.*) as detail
          |FROM (SELECT s.content as "apiSubscription",
          |             a.content as api,
          |             p.content as "usagePlan"
          |      FROM api_subscriptions s
          |               JOIN apis a ON s.content ->> 'api' = a._id
          |               JOIN usage_plans p ON s.content ->> 'plan' = p._id
          |      WHERE (s._id = $1 OR s.content ->> 'parent' = $1) AND s._id <> $2) _;
          |""".stripMargin

      (for {
        sub <- EitherT.fromOptionF[Future, AppError, ApiSubscription](
          env.dataStore.apiSubscriptionRepo
            .forTenant(ctx.tenant)
            .findById(apiSubscriptionId),
          AppError.EntityNotFound("ApiSubscription")
        )
        maybeParent <-
          sub.parent
            .map(p =>
              EitherT.liftF[Future, AppError, Option[ApiSubscription]](
                env.dataStore.apiSubscriptionRepo
                  .forTenant(ctx.tenant)
                  .findById(p)
              )
            )
            .getOrElse(EitherT.pure[Future, AppError](None))
        accessibleResources <-
          EitherT
            .liftF[Future, AppError, Seq[JsValue]](
              env.dataStore.queryRaw(
                sql,
                "detail",
                Seq(
                  maybeParent.map(_.id.value).getOrElse(sub.id.value),
                  sub.id.value
                )
              )
            )
            .map(r =>
              json.SeqApiSubscriptionAccessibleResourceFormat
                .reads(JsArray(r))
                .getOrElse(Seq.empty)
            )
      } yield ApiSubscriptionDetail(
        apiSubscription = sub,
        parentSubscription = maybeParent,
        accessibleResources = accessibleResources
      )).value

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
