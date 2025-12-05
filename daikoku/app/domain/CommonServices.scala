package fr.maif.otoroshi.daikoku.domain

import cats.data.EitherT
import controllers.AppError
import fr.maif.otoroshi.daikoku.actions.DaikokuActionContext
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async._
import fr.maif.otoroshi.daikoku.domain.NotificationAction.ApiAccess
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.joda.time.DateTime
import play.api.libs.json._
import storage.drivers.postgres.PostgresDataStore

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
      filter: JsArray = Json.arr(),
      sort: JsArray = Json.arr(),
      limit: Int,
      offset: Int,
  )(implicit
      ctx: DaikokuActionContext[JsValue],
      env: Env,
      ec: ExecutionContext
  ): Future[Either[AppError, ApiWithCount]] = {
    _UberPublicUserAccess(
      AuditTrailEvent(s"@{user.name} has accessed the list of visible apis")
    )(ctx) {

      val teams =
        getFiltervalue[List[String]](filter, "team").map(_.toArray)
      val tags =
        getFiltervalue[List[String]](filter, "tag").map(_.toArray)
      val research =
        getFiltervalue[String](filter, "research")


/*
* $1 : userID
* $2: tenant
* $3: research
* $4: teams
* $5: tags
* $6: limit
* $7: offset
* */
//TODO: Get keys and status
      val query =
        s"""
          |WITH me as (select content
          |            from users
          |            where _id = $$1),
          |     my_teams as (SELECT *
          |                  FROM teams
          |                  WHERE teams._deleted IS FALSE
          |                    AND teams.content -> 'users' @>
          |                        (SELECT jsonb_build_array(jsonb_build_object('userId', me.content ->> '_id'))
          |                         FROM me)),
          |     base_apis as (select a.*
          |                   FROM apis a
          |                            LEFT JOIN me on true
          |                   WHERE (
          |                             a.content ->> '_tenant' = $$2 AND
          |                             (a.content ->> 'state' = 'published' OR
          |                              coalesce((me.content -> 'isDaikokuAdmin')::bool, false) OR
          |                              a.content ->> 'team' = ANY (select t.content ->> '_id' from my_teams t)) AND
          |                             (case
          |                                  WHEN me.content is null THEN a.content ->> 'visibility' = 'Public'
          |                                  WHEN coalesce((me.content ->> 'isDaikokuAdmin')::bool, false) THEN TRUE
          |                                  ELSE (a.content ->> 'visibility' IN ('Public', 'PublicWithAuthorizations') OR
          |                                        (a.content ->> 'team' = ANY (select t.content ->> '_id' from my_teams t)) OR
          |                                        (a.content -> 'authorizedTeams' ?|
          |                                         (SELECT array_agg(t.content ->> '_id') FROM my_teams t)))
          |                                 END) AND
          |                             (a.content ->> 'isDefault')::boolean = true
          |                             )),
          |     total_apis as (select count(1) as total_count
          |                    FROM base_apis),
          |     visible_apis as (select a._id,
          |                             a.content,
          |                             count(1) over ()                                                          as total_filtered,
          |                             (me.content -> 'starredApis' @> jsonb_build_array(a._id))                 as is_starred,
          |                             (a.content ->> 'team' = ANY (select t.content ->> '_id' from my_teams t)) as is_my_team
          |                      FROM base_apis a
          |                               LEFT JOIN me on true
          |                      WHERE (
          |                                (a.content ->> 'name' ~* COALESCE(NULLIF($$3, ''), '.*')) AND
          |                                CASE
          |                                    WHEN array_length($$4::text[], 1) IS NULL THEN true
          |                                    ELSE a.content ->> 'team' = ANY ($$4::text[])
          |                                    END AND
          |                                CASE
          |                                    WHEN array_length($$5::text[], 1) IS NULL THEN true
          |                                    ELSE a.content -> 'tags' ?| $$5::text[]
          |                                    END
          |                                )),
          |     filtered_apis as (select *
          |                       from visible_apis
          |                       ORDER BY is_starred DESC,
          |                                is_my_team DESC,
          |                                content ->> 'name'
          |                       limit $$6 offset $$7),
          |     all_producer_teams as (SELECT DISTINCT t.content, count(1) as total
          |                            FROM visible_apis va
          |                                     JOIN teams t ON t.content ->> '_id' = va.content ->> 'team'
          |                            WHERE t._deleted IS FALSE
          |                            GROUP BY t.content ),
          |     all_tags as (SELECT DISTINCT tag, count(DISTINCT base_apis._id) as total
          |                  FROM visible_apis va,
          |                       jsonb_array_elements_text(va.content -> 'tags') as tag
          |                           left outer join base_apis on base_apis.content -> 'tags' ? tag
          |                  group by tag),
          |     all_categories as (SELECT DISTINCT category, count(DISTINCT base_apis._id) as total
          |                       FROM visible_apis va,
          |                            jsonb_array_elements_text(va.content -> 'categories') as category
          |                                left outer join base_apis on base_apis.content -> 'categories' ? category
          |                       group by category),
          |    filtered_demands as ( SELECT apis._id as api, jsonb_agg(d.content) as demands
          |                       FROM subscription_demands d
          |                       INNER JOIN filtered_apis apis ON d.content ->> 'api' = apis._id
          |                       WHERE d.content ->> 'state' = 'inProgress'
          |                       GROUP BY apis._id),
          |    filtered_subscriptions as ( SELECT apis._id as api, jsonb_agg(sub.content) as subscriptions
          |                       FROM api_subscriptions sub
          |                       INNER JOIN filtered_apis apis ON apis._id = sub.content ->> 'api'
          |                       GROUP BY apis._id),
          |    authorizations_by_api as (select apis._id                as api_id,
          |                                      teams.content ->> '_id' as team_id,
          |                                      (
          |                                          (apis.content -> 'authorizedTeams' @>
          |                                           jsonb_build_array(teams.content ->> '_id'))
          |                                              OR (apis.content ->> 'team' = teams.content ->> '_id')
          |                                          )                   as authorized,
          |                                      coalesce(
          |                                              (select n.content -> 'status' ->> 'status' = 'Pending'
          |                                               from notifications n
          |                                               where n.content -> 'action' ->> 'api' = apis._id
          |                                                 and n.content -> 'action' ->> 'team' = teams.content ->> '_id'
          |                                                 and n.content -> 'action' ->> 'type' = 'ApiAccess'), false
          |                                      )                       as pending
          |                               from filtered_apis apis
          |                                        cross join my_teams teams
          |                               where (apis.content -> 'authorizedTeams' @> jsonb_build_array(teams.content ->> '_id'))
          |                                  OR (apis.content ->> 'team' = teams.content ->> '_id')
          |                                  OR exists (select 1
          |                                             from notifications n
          |                                             where n.content -> 'action' ->> 'api' = apis._id
          |                                               and n.content -> 'action' ->> 'team' = teams.content ->> '_id'
          |                                               and n.content -> 'action' ->> 'type' = 'ApiAccess'
          |                                               and n.content -> 'status' ->> 'status' = 'Pending')),
          |     apis_with_authorizations as (select apis._id,
          |                                         apis.content as api_content,
          |                                         apis.total_filtered,
          |                                         coalesce(
          |                                               jsonb_agg(usage_plans.content) FILTER (WHERE usage_plans.content IS NOT NULL),
          |                                               '[]'::jsonb
          |                                         ) as plans,
          |                                         CASE
          |                                             WHEN lower(apis.content ->> 'visibility') = 'public' THEN '[]'::jsonb
          |                                             ELSE coalesce(
          |                                                             jsonb_agg(
          |                                                             jsonb_build_object(
          |                                                                     'team', aba.team_id,
          |                                                                     'authorized', aba.authorized,
          |                                                                     'pending', aba.pending
          |                                                             )
          |                                                                      ) FILTER (WHERE aba.team_id IS NOT NULL),
          |                                                             '[]'::jsonb
          |                                                  )
          |                                             END      as authorizations,
          |                                      coalesce(fd.demands, '[]'::jsonb) as demands,
          |                                      coalesce(fs.subscriptions, '[]'::jsonb) as subscriptions
          |                                  from filtered_apis apis
          |                                           left join authorizations_by_api aba on aba.api_id = apis._id
          |                                           left join usage_plans on apis.content -> 'possibleUsagePlans' ? usage_plans._id::text
          |                                           left join filtered_subscriptions fs on fs.api = apis._id
          |                                           left join filtered_demands fd on fd.api = apis._id
          |                                  group by apis._id, apis.content, apis.total_filtered, apis.is_starred, apis.is_my_team, fd.demands, fs.subscriptions
          |                                  order by apis.is_starred DESC,
          |                                           apis.is_my_team DESC,
          |                                           apis.content ->> 'name')
          |
          |
          |SELECT jsonb_build_object(
          |               'apis', coalesce(
          |                (SELECT jsonb_agg(
          |                                jsonb_build_object(
          |                                        'api', api_content,
          |                                        'plans', coalesce(plans, '[]'::jsonb),
          |                                        'authorizations', authorizations,
          |                                        'subscriptionDemands', demands,
          |                                        'subscriptions', subscriptions
          |                                )
          |                        )
          |                 FROM apis_with_authorizations),
          |                '[]'::jsonb),
          |               'producers',
          |                coalesce((SELECT jsonb_agg(jsonb_build_object('team', producers.content, 'total', total)) FROM all_producer_teams producers), '[]'::jsonb),
          |               'tags', coalesce(
          |                       (SELECT jsonb_agg(jsonb_build_object('value', tag, 'total', total) ORDER BY lower(tag)) FROM all_tags),
          |                       '[]'::jsonb),
          |               'categories', coalesce(
          |                       (SELECT jsonb_agg(jsonb_build_object('value', category, 'total', total) ORDER BY lower(category)) FROM all_categories),
          |                       '[]'::jsonb),
          |               'total', (SELECT total_count FROM total_apis),
          |               'totalFiltered', coalesce((SELECT max(total_filtered) FROM apis_with_authorizations), 0)
          |       ) as result;
          |""".stripMargin


      for {
        result <- env.dataStore
          .asInstanceOf[PostgresDataStore]
          .queryOneRaw(
            query,
            "result",
            Seq(
              ctx.user.id.value,
              ctx.tenant.id.value,
              research.orNull,
              teams.orNull,
              tags.orNull,
              java.lang.Integer.valueOf(limit),
              java.lang.Integer.valueOf(offset)
            )
          )
      } yield {
        result
          .map(_.as(json.ApiWithCountFormat))
          .getOrElse(ApiWithCount())
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

  private def getFiltervalue[T](filters: JsArray, key: String)(implicit
      fjs: Reads[T]
  ): Option[T] = {
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

      val queryCount = s"""
                     |SELECT count(1) as count
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
                     |  AND COALESCE(NULLIF(s.content -> 'metadata', 'null'::jsonb), '{}'::jsonb) @> COALESCE($$7::text::jsonb, '{}'::jsonb);
                     |""".stripMargin
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
           |  AND COALESCE(NULLIF(s.content -> 'metadata', 'null'::jsonb), '{}'::jsonb) @> COALESCE($$7::text::jsonb, '{}'::jsonb)
           |$sortClause
           |LIMIT $$8 OFFSET $$9;
           |""".stripMargin

      (for {
        count <- EitherT.fromOptionF[Future, AppError, Long](
          env.dataStore
            .asInstanceOf[PostgresDataStore]
            .queryOneLong(
              query = queryCount,
              name = "count",
              params = Seq(
                apiId,
                getFiltervalue[String](filters, "subscription").orNull[String],
                getFiltervalue[String](filters, "plan").orNull[String],
                getFiltervalue[String](filters, "team").orNull[String],
                getFiltervalue[JsArray](filters, "tags")
                  .map(Json.stringify(_))
                  .orNull[String],
                getFiltervalue[JsArray](filters, "clientIds")
                  .map(_.value.map(_.as[String]).toArray)
                  .orNull,
                getFiltervalue[JsObject](filters, "metadata")
                  .map(Json.stringify(_))
                  .orNull[String]
              )
            ),
          AppError.UnexpectedError
        )
        subs <- EitherT.liftF[Future, AppError, Seq[ApiSubscription]](
          env.dataStore.apiSubscriptionRepo
            .forTenant(ctx.tenant)
            .query(
              query,
              Seq(
                apiId,
                getFiltervalue[String](filters, "subscription").orNull[String],
                getFiltervalue[String](filters, "plan").orNull[String],
                getFiltervalue[String](filters, "team").orNull[String],
                getFiltervalue[JsArray](filters, "tags")
                  .map(Json.stringify(_))
                  .orNull[String],
                getFiltervalue[JsArray](filters, "clientIds")
                  .map(_.value.map(_.as[String]).toArray)
                  .orNull,
                getFiltervalue[JsObject](filters, "metadata")
                  .map(Json.stringify(_))
                  .orNull[String],
                java.lang.Integer.valueOf(limit),
                java.lang.Integer.valueOf(offset)
              )
            )
        )
      } yield {
        ctx.setCtxValue("api.id", apiId)
        (subs, count)
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

  def getMyNotification(
      filter: JsArray,
      sort: JsArray,
      limit: Int,
      offset: Int
  )(implicit
      ctx: DaikokuActionContext[JsValue],
      env: Env,
      ec: ExecutionContext
  ) = {
    _PublicUserAccess(
      AuditTrailEvent(
        s"@{user.name} has accessed to his notifications"
      )
    )(ctx) {
      val CTE = s"""
               |WITH my_teams as (SELECT *
               |                  FROM teams
               |                  WHERE _deleted IS FALSE AND content -> 'users' @> '[{"userId": "${ctx.user.id.value}"}]')
               |                  """

      val actionTypes =
        getFiltervalue[List[String]](filter, "actionType")
          .getOrElse(List.empty)
          .toArray

      val teams =
        getFiltervalue[List[String]](filter, "team")
          .getOrElse(List.empty)
          .toArray

      val types =
        getFiltervalue[List[String]](filter, "type")
          .getOrElse(List.empty)
          .toArray

      val apis =
        getFiltervalue[List[String]](filter, "api")
          .getOrElse(List.empty)
          .toArray

      val unreadOnly =
        getFiltervalue[Boolean](filter, "unreadOnly").getOrElse(false)

      (for {
        notifications <- EitherT.fromOptionF(
          env.dataStore
            .asInstanceOf[PostgresDataStore]
            .queryOneRaw(
              s"""
               |$CTE,
               |filtered_notifs as (
               |  SELECT
               |    n.content,
               |    count(1) OVER() AS total_filtered
               |  FROM notifications n
               |           LEFT JOIN my_teams t ON t._deleted IS FALSE AND n.content ->> 'team' = t._id::text
               |           LEFT JOIN apis a ON a._deleted IS FALSE AND ((a._id = n.content -> 'action' ->> 'api') or ((a.content ->> 'name') = (n.content -> 'action' ->> 'apiName')))
               |  WHERE n._deleted IS FALSE AND (n.content -> 'action' ->> 'user' = '${ctx.user.id.value}'
               |      OR n.content ->> 'team' = t._id::text)
               |    AND CASE
               |            WHEN array_length($$1::text[], 1) IS NULL THEN true
               |            ELSE n.content ->> 'notificationType' = ANY ($$1::text[])
               |    END
               |    AND CASE
               |            WHEN array_length($$2::text[], 1) IS NULL THEN true
               |            ELSE t._id = ANY ($$2::text[])
               |    END
               |    AND CASE
               |            WHEN array_length($$3::text[], 1) IS NULL THEN true
               |            ELSE n.content -> 'action' ->> 'type' = ANY ($$3::text[])
               |    END
               |    AND CASE
               |            WHEN array_length($$4::text[], 1) IS NULL THEN true
               |            ELSE a._id = ANY ($$4::text[])
               |    END
               |    AND ($$5 IS FALSE or n.content -> 'status' ->> 'status' = 'Pending')
               |  ORDER BY n.content ->> 'date' DESC
               |  LIMIT $$6 OFFSET $$7
               |)
               |
               |SELECT json_build_object(
               |  'notifications', json_agg(to_jsonb(filtered_notifs.content)),
               |  'total_filtered', COALESCE(max(total_filtered), 0)
               |) AS result
               |FROM filtered_notifs;
               |""".stripMargin,
              "result",
              Seq(
                actionTypes,
                teams,
                types,
                apis,
                java.lang.Boolean.valueOf(unreadOnly),
                java.lang.Integer.valueOf(limit),
                java.lang.Integer.valueOf(offset)
              )
            ),
          AppError.InternalServerError("SQL request for notifications failed")
        )
        totals <- EitherT.fromOptionF(
          env.dataStore
            .asInstanceOf[PostgresDataStore]
            .queryOneRaw(
              s"""
               |$CTE,
               |     base AS (SELECT t.content ->> 'name', n.content -> 'action' ->> 'type', n.*
               |              FROM notifications n
               |                       LEFT JOIN my_teams t ON n.content ->> 'team' = t._id::text
               |              WHERE n._deleted IS FALSE AND (n.content -> 'action' ->> 'user' = '${ctx.user.id.value}'
               |                  OR n.content ->> 'team' = t._id::text)
               |                AND ($$1 IS FALSE OR n.content -> 'status' ->> 'status' = 'Pending')),
               |     total AS (SELECT COUNT(*) AS total
               |               FROM base),
               |     total_by_teams AS (SELECT n.content ->> 'team' AS team, COUNT(*) AS total
               |                        FROM base n
               |                        GROUP BY n.content ->> 'team'
               |                        ORDER BY total DESC),
               |     total_by_apis AS (SELECT a._id AS api, COUNT(*) AS total
               |                       FROM base n
               |                                LEFT JOIN apis a
               |                                          ON a._deleted IS FALSE AND (
               |                                              a._id = n.content -> 'action' ->> 'api'
               |                                                  OR a.content ->> 'name' = n.content -> 'action' ->> 'apiName'
               |                                                  OR a.content ->> 'name' = n.content -> 'action' ->> 'api'
               |                                                  OR a.content ->> '_id' = n.content -> 'action' -> 'api' ->> '_id'
               |                                              )
               |                       GROUP BY a._id
               |                       ORDER BY total DESC),
               |     total_by_types AS (SELECT n.content ->> 'notificationType' AS type, COUNT(*) AS total
               |                        FROM base n
               |                        GROUP BY n.content ->> 'notificationType'
               |                        ORDER BY total DESC),
               |     total_by_notification_types AS (SELECT n.content -> 'action' ->> 'type' AS type, COUNT(*) AS total
               |                                     FROM base n
               |                                     GROUP BY n.content -> 'action' ->> 'type'
               |                                     ORDER BY total DESC),
               |     total_selectable AS (SELECT COUNT(*) AS total_selectable
               |                          FROM base
               |                          WHERE content ->> 'notificationType' = 'AcceptOnly' AND content -> 'status' ->> 'status' = 'Pending')
               |
               |SELECT row_to_json(_.*) as result
               |from (select (SELECT total FROM total),
               |             COALESCE((SELECT json_agg(row_to_json(t)) FROM total_by_teams t), '[]'::json)                  AS total_by_teams,
               |             COALESCE((SELECT json_agg(row_to_json(a)) FROM total_by_apis a),
               |                      '[]'::json)                                                                           AS total_by_apis,
               |             COALESCE((SELECT json_agg(row_to_json(nt)) FROM total_by_types nt),
               |                      '[]'::json)                                                                           AS total_by_types,
               |             COALESCE((SELECT json_agg(row_to_json(ant)) FROM total_by_notification_types ant),
               |                      '[]'::json)                                                                           AS total_by_notification_types,
               |             (SELECT total_selectable FROM total_selectable)) _
               |  """.stripMargin,
              "result",
              Seq(
                java.lang.Boolean.valueOf(unreadOnly)
              )
            ),
          AppError.InternalServerError(
            "SQL request for notifications totals failed"
          )
        )
      } yield {
        NotificationWithCount(
          notifications = (notifications \ "notifications")
            .asOpt(json.SeqNotificationFormat)
            .getOrElse(Seq.empty),
          totalFiltered = (notifications \ "total_filtered").as[Long],
          total = (totals \ "total").as[Long],
          totalSelectable = (totals \ "total_selectable").as[Long],
          totalByTypes = (totals \ "total_by_types").as[JsArray],
          totalByNotificationTypes =
            (totals \ "total_by_notification_types").as[JsArray],
          totalByTeams = (totals \ "total_by_teams").as[JsArray],
          totalByApis = (totals \ "total_by_apis").as[JsArray]
        )
      }).value
    }
  }

  def getAuditTrail(
      from: Long,
      to: Long,
      filters: JsArray,
      sorting: JsArray,
      limit: Int,
      offset: Int
  )(implicit
      ctx: DaikokuActionContext[JsValue],
      env: Env,
      ec: ExecutionContext
  ) = {
    _TenantAdminAccessTenant(
      AuditTrailEvent("@{user.name} has accessed to audit trail")
    )(ctx) {

      val defaultOrderClause =
        "ORDER BY content ->> '@timestamp' ASC"
      val sortClause = sorting.head.asOpt[JsObject] match {
        case Some(value) =>
          val desc = value.value.get("desc") match {
            case Some(json) if json.asOpt[Boolean].contains(true) => "DESC"
            case _                                                => "ASC"
          }

          value.value.get("id").map(_.as[String]) match {
            case Some(id) if id == "user" =>
              s"ORDER BY content -> 'user' ->> 'name' $desc"
            case Some(id) if id == "date" =>
              s"ORDER BY content ->> '@timestamp' $desc"
            case _ => defaultOrderClause
          }
        case None => defaultOrderClause
      }

      val queryCount =
        s"""
           |select count(1) from audit_events
           |WHERE (content ->> '@timestamp')::bigint >= $$1 AND (content ->> '@timestamp')::bigint <= $$2
           |  AND (content -> 'user' ->> 'name') ~* COALESCE($$3::text, '')
           |  AND (content -> 'user' ->> 'name') ~* COALESCE($$4::text, '')
           |  AND (content ->> 'message') ~* COALESCE($$5::text, '')
           |""".stripMargin
      val query =
        s"""
           |select content from audit_events
           |WHERE (content ->> '@timestamp')::bigint >= $$1 AND (content ->> '@timestamp')::bigint <= $$2
           |  AND (content -> 'user' ->> 'name') ~* COALESCE($$3::text, '')
           |  AND (content -> 'user' ->> 'name') ~* COALESCE($$4::text, '')
           |  AND (content ->> 'message') ~* COALESCE($$5::text, '')
           |$sortClause
           |LIMIT $$6 OFFSET $$7;
           |""".stripMargin

      (for {
        count <- EitherT.fromOptionF[Future, AppError, Long](
          env.dataStore
            .asInstanceOf[PostgresDataStore]
            .queryOneLong(
              queryCount,
              "count",
              Seq(
                java.lang.Long.valueOf(from),
                java.lang.Long.valueOf(to),
                getFiltervalue[String](filters, "user").orNull[String],
                getFiltervalue[String](filters, "impersonator").orNull[String],
                getFiltervalue[String](filters, "message").orNull[String]
              )
            ),
          AppError.UnexpectedError
        )
        subs <- EitherT.liftF[Future, AppError, Seq[JsObject]](
          env.dataStore.auditTrailRepo
            .forTenant(ctx.tenant)
            .query(
              query,
              Seq(
                java.lang.Long.valueOf(from),
                java.lang.Long.valueOf(to),
                getFiltervalue[String](filters, "user").orNull[String],
                getFiltervalue[String](filters, "impersonator").orNull[String],
                getFiltervalue[String](filters, "message").orNull[String],
                java.lang.Integer.valueOf(limit),
                java.lang.Integer.valueOf(offset)
              )
            )
        )
      } yield {
        (subs, count)
      }).value.map {
        case Left(_)           => (Seq.empty, 0L)
        case Right(auditTrail) => auditTrail
      }
    }
  }
}
