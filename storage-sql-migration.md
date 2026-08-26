# Removing the Mongo-style query DSL from the storage layer

Working document for an in-progress, incremental refactor. Delete it once the last phase lands.

## Goal

Daikoku only supports PostgreSQL, but the *shape* of its data access layer is still inherited from
MongoDB: queries are written as `JsObject` documents with `$in` / `$or` / `$regex` / `$gte` / `$ne`
operators, translated to JSONB SQL **at runtime** by
[`Helper.convertQuery`](../daikoku/app/fr/maif/daikoku/storage/drivers/postgres/Helper.scala).

That translator is what we are removing. Its concrete problems: SQL placeholder numbering done by
hand and threaded through mutable `var`s; values interpolated straight into the SQL (notably
`updateManyByQuery`, which substitutes `$N` with hand-escaped values); blind `::bigint` casts on
`$gt`/`$gte`/`$lt`/`$lte`; a hard two-level nesting limit; and silent failures — an unknown operator
becomes `1 = 1` (matches everything), an empty `$in` becomes `'DEFAULT VALUE TO AVOID EMPTY LIST'`,
and `$options` (regex flags) is ignored.

**Done when:** `convertQuery` is gone, no `Json.obj(...)` query with `$` operators is left in the
code, and data access goes through named, typed methods backed by parameterised SQL.

### Framing decisions

1. **Storage is untouched.** We keep one `content JSONB` column per entity — no data migration. Only
   the *query surface* changes.
2. **The facade stays.** `env.dataStore.xxxRepo`, `forTenant`, `DbConn` / `withTransaction` all keep
   working exactly as they do now. Only the inside changes.
3. **Migration is incremental, repo by repo.** The `JsObject` API and the typed SQL API coexist
   during the transition; `Helper.scala` is deleted last.

## Current state

| Phase | Scope | Status |
|---|---|---|
| 0 | Generic helpers of `Repo` | **Done** — commit `39ec6b5f8` |
| 1 | Small repos: user session, password reset, account creation, evolution, reports info, email verification | **Done** — see git log |
| 2 | Mid-size tenant-scoped repos: `tenantRepo`, `userRepo`, `teamRepo`, `notificationRepo`, `consumptionRepo`, `messageRepo`, `cmsRepo`, `assetRepo`, `subscriptionDemandRepo` | **Done** |
| 3 | Big ones, each its own sub-project: `apiRepo` (+ `ApiController` ~237 calls, `ApiService` ~111), `apiSubscriptionRepo`, `usagePlanRepo` | **Next** |
| Final A | Delete `Helper.scala` and the `JsObject` methods of `Repo` | To do |
| Final B | Slim down / dedupe the `Repo` layer | To do (optional but recommended) |

## The pattern to follow

Everything below already exists in the code — copy it rather than inventing something new.

### 1. Typed methods carrying static SQL

One method per business intent, on the repo trait
([`storage/api.scala`](../daikoku/app/fr/maif/daikoku/storage/api.scala)), body executed through the
primitives already on `Repo`: `query` / `queryOne` / `queryPaginated` / `execute` / `queryExists`.

```scala
def findBySessionId(sessionId: String)(implicit
    dbConn: DbConn,
    ec: ExecutionContext
): Future[Option[UserSession]] =
  queryOne(
    s"SELECT content FROM $tableName WHERE content->>'sessionId' = $$1 LIMIT 1",
    Seq(sessionId)
  )
```

Rules: values **always** go through `params` (`$1`, `$2`, …), never into the string. `$in` becomes
`= ANY($n::text[])` with a `Seq(xs.map(_.value).toArray)` parameter. Optional/conditional filters are
handled locally inside their own method (Scala concat + a params buffer), case by case — no global
DSL, no combinator library. That dynamic assembly is exactly what made `convertQuery` unmaintainable.

### 2. Naming: not-deleted is the nominal case

Physical deletion has been the rule for two releases; `_deleted` is only a transient state. So every
typed method carries `notDeletedSql` and **no method carries a `NotDeleted` suffix** —
`findByDomain`, not `findByDomainNotDeleted`. The `NotDeleted` suffix survives only on the generic
`Repo` helpers inherited from phase 0 (`findByIdNotDeleted`, `findByIdsNotDeleted`,
`findAllNotDeleted`), because their unsuffixed twins already mean "no filter"; that pair collapses
in Final B.

### 3. The `forTenant` trap

`find(JsObject)` on a tenant-aware repo injects the tenant filter automatically. **`query(sql)` does
not** — the caller owns the whole SQL. Two situations:

- A method on `Repo` (generic helper): build the WHERE clause with `scopedWhere`, which appends
  `content->>'_tenant' = $n` when `tenantScope` is set.
- A method on a `TenantCapableRepo` trait: take the tenant as a parameter and **write the predicate
  by hand**, as `EmailVerificationRepo.deleteByTeam` does.

Forgetting this leaks data across tenants, and no test will necessarily catch it.

### 4. What phase 0 put in place

In [`storage/api.scala`](../daikoku/app/fr/maif/daikoku/storage/api.scala):

- `tenantScope: Option[String]` — hook, overridden by `PostgresTenantAwareRepo`.
- `scopedWhere(predicates, params)` — the only remaining place that assembles SQL; it only ever
  concatenates hard-coded predicates.
- `notDeletedSql` — `content->>'_deleted' = 'false'`, matching what the old `{"_deleted": false}`
  query did (an entity with no `_deleted` key does **not** match).
- `queryExists(sql, params)` — implemented in `CommonRepo`.

The generic helpers (`findById`, `findByIdNotDeleted`, `findByIds`, `findByIdsNotDeleted`, `findAll`,
`findAllNotDeleted`, `deleteById`, `deleteAll`, `exists`, the whole `findByIdOrHrId*` family) are
already parameterised SQL. Their signatures did not change, so roughly 800 call sites were migrated
without being touched. Id lookups now hit the `_id` PRIMARY KEY instead of `content->>'_id'`.

Two parity quirks were kept on purpose: `findByIdOrHrId` (without `NotDeleted`) already filtered
`_deleted = false` despite its name, and `deleteById` still reports `true` even when it removes
nothing.

## Missing indexes

Collected while migrating, to be added in one pass at the end of the phase — not mixed into the
refactor commits. None of these are regressions: the JsObject queries they replace were unindexed
too. Ordered by how much they matter.

| Table | Expression | Used by | Why it matters |
|---|---|---|---|
| `tenants` | `content->>'domain'` | `TenantRepo.findByDomain` | **The table has no index at all.** In `Hostname` tenant-provider mode this runs on *every* HTTP request. |
| `users` | `content->>'email'` | `UserRepo.findByEmail` | Every login, every auth module. `user_sessions` already indexes `userEmail`; `users` does not index `email`. |
| `consumptions` | `_tenant`, `clientId`, `api`, `team`, `(from)::bigint` | the whole `ConsumptionRepo` | **The table has no index at all**, and it is the largest one in a busy instance. |
| `teams` | GIN on `content->'users'` | `findByUser`, `isTenantAdmin`, `findPersonalTeam` | Membership lookups scan today. Needed only if the `EXISTS`/`jsonb_array_elements` form is swapped back for `@>`, which a GIN index can serve. |
| `notifications` | `content->'action'->>'user'` | `findTeamInvitationForUser`, `deleteTeamInvitation`, `QueueJob.deleteUserNotifications` | The sibling paths `action.type`/`team`/`api`/`plan` are all indexed; `user` was forgotten. |
| `notifications` | `content->'action'->>'demand'`, `->>'subscription'`, `->>'keyring'` | `deleteByDemand`, `DeletionService`, `QueueJob` | Deletion paths, run per settled demand / deleted subscription. |

Worth checking at the same time: the `((content->>'_id'))` indexes are now dead weight — since phase 0
every id lookup hits the `_id` PRIMARY KEY instead. Same for `((content->>'_tenant'))` on `users`,
which is not a tenant-scoped repo.

## Recipe per entity

1. `grep -rn "dataStore\.<repo>" app/ test/` and list every `Json.obj(...)` handed to that repo.
2. Add the typed methods covering each pattern (tenant predicate spelled out for tenant-aware repos).
3. Rewrite the call sites — controllers, services, jobs, and **GraphQL**
   (`domain/SchemaDefinition.scala`, `domain/CommonServices.scala`).
4. Migrate the matching backend tests (`daikoku/test/`, notably `suites.scala`, the shared harness,
   and `controllers/TransactionSpec.scala`, sensitive to `DbConn` threading).
5. Run the suite. One digestible PR per phase.

## Cross-cutting concerns

- **Logical deletion.** This crosses the `_deleted` → physical-deletion project. The whole
  `findNotDeleted` / `deleteLogically` / `notDeleted` family disappears with it. Do not couple the
  two: either physical deletion lands first (simpler — the typed methods then carry no `_deleted` at
  all), or we keep carrying `notDeletedSql` and that project removes it afterwards.
- **`AuditTrailRepo`** has `Of = JsObject` (schemaless). It stays JSONB, just with dedicated typed
  methods.
- **Export / import.** `exportAsStream` / `streamAllRaw` rely on the `JsObject` surface. A streaming
  SQL equivalent is needed before `streamAllRaw` can go.
- **`findWithProjection`** has few callers: either provide an SQL replacement returning the wanted
  columns, or move those callers to `find` + `map`.
- **Indexes.** The ~60 JSONB expression indexes (`createIndexes`, `PostgresDataStore.scala`) stay
  valid — same storage. What the migration reveals they *don't* cover is collected below.

## Phase 2 notes

Closing the phase also removed two more `JsObject` methods from `Repo`: `findMaxByQuery` (see the
`messageRepo` note) and the last `findWithProjection` outside `apiRepo` — an `Asset` is
`(id, tenant, slug)`, so loading them whole costs exactly what the projection did. The three
remaining `findWithProjection` callers are all on `apiRepo`, i.e. phase 3.

`messageRepo` exposed a third silently-broken query, of the same family as the phase-1 one.
`ReadMessages` marked a chat as read with `{"readBy": {"$ne": userId}}`; `$ne` renders as
`content->>'readBy' <> $n`, and `readBy` is an **array**, so `content->>'readBy'` yields the whole
array as text (`["u1","u2"]`) — never equal to a single id. The guard was therefore always true and
the `$push` appended the same id again on every read, growing `readBy` without bound. It is now
`NOT (content->'readBy' @> to_jsonb($n::text))`.

Migrating it also retired `findMaxByQuery`, whose only two callers were the chat-date lookups: they
now select the newest matching message and read its `closed` field, which needs no extra primitive.


`consumptionRepo` is the first repo whose *trait signature* had to change: `getLastConsumptionsForTenant`
/ `getLastConsumptionsforAllTenant` / `getLastConsumption` took a `JsObject` filter, so they went with
the DSL. Their implementation — the only hand-written `lastConsumptions` in `PostgresDataStore` —
grouped on `clientId` to get `MAX(content->>'from')`, a **textual** max over millis, then issued one
extra query per client id to fetch the matching row, with neither the tenant nor the original filters
reapplied. A single `DISTINCT ON (content->>'clientId') … ORDER BY … (content->>'from')::bigint DESC`
replaces all of it: one query instead of 1+N, a numeric comparison, and the filters applied once.

Note the two spellings the consumption queries used for a time window — `from >= start AND to <= end`
and `from BETWEEN start,end AND to BETWEEN start,end` — are equivalent, since `from <= to` always
holds. One `windowSql` covers both.

`notificationRepo` retires the last three `updateManyByQuery` call sites of the phase — the method
that substitutes `$N` with hand-escaped values straight into the SQL. Their `$set` becomes the
`jsonb_set(content, '{key}', …)` that `convertQuery` generated anyway, this time with the value bound
as a parameter. The one `streamAllRaw(query)` of the notification evolutions goes through
`dataStore.queryRaw` + `Source`, which is literally what `streamAllRaw` does internally: it loads
everything, then emits. Nothing was streaming, so nothing regressed.

`teamRepo` is the first tenant-scoped repo of the phase, so the `forTenant` trap applies: its typed
methods live on the `TeamRepo` trait, take the tenant as a parameter and spell the `_tenant`
predicate out (bound to `$1` by convention). The `{"users.userId": …}` membership query becomes
`EXISTS (SELECT 1 FROM jsonb_array_elements(content->'users') AS u WHERE u->>'userId' = $n)`, which
needs no jsonb literal and no cast. Note there is no GIN index on `content->'users'`, so the former
`@>` containment was not indexed either — no regression.

`userRepo` exposed two queries that never matched, both of the shape flagged after phase 1 — a
faithful-looking port of a query that returned nothing:

- `NotificationController` (team-access notification) and `ApiService` (subscription demand) looked
  up team administrators with `_id $in team.users.filter(Administrator).map(_.asJson)`. `asJson` on a
  `UserWithPermission` serialises the whole `{userId, teamPermission}` object, so the `$in` compared
  an id against objects and found nobody: those two mails were never sent to anyone.
- `ApiController.getIssue` filtered on `$id` instead of `_id`. An unknown `$` operator falls back to
  `1 = 1` in `convertQuery`, so the query returned *every* user of the instance rather than the
  authors of the issue comments.

Both now go through `findByIdsNotDeleted(team.admins())`.

## Phase 1 notes

Migrating exposed a real bug, fixed in the same commit rather than ported as-is (deliberate call).

A `UserSession` has **two independent identifiers**: `_id` and `sessionId`, two unrelated random
tokens. Both session purges filtered on `_id` while passing `sessionId` values, so they deleted
nothing: the admin "remove all sessions" endpoint and the switch to maintenance/construction mode
never disconnected anybody. The maintenance one also dropped the `Future` of its delete, so the
tenant was saved before the purge ran. Both now go through `deleteAllExceptSession`, properly
sequenced.

Worth keeping in mind for the next phases: a query that looks like a faithful port may be one that
never matched anything. Check the field names against the entity's JSON format.

## Local environment gotchas

These cost several hours during phase 1 — read before debugging a red suite.

- **`mise run test:back` silently exits 0 without running anything** when a Postgres is already
  listening on 5432. That is a false green. The equivalent that actually runs is `sbt test` from
  `daikoku/` (that is literally what the process-compose `Tests` process does).
- **Concurrent JVMs corrupt the build.** IntelliJ's nailgun compiler and the Bloop daemon compile
  into the same `daikoku/target/scala-3.8.2/classes` as a terminal `sbt test`. When they recompile
  mid-run the suite fails with misleading symptoms: `error while loading <Trait>, …/X.tasty`,
  `NoClassDefFoundError` on domain classes, `*** ABORTED ***` suites, or one isolated failure that
  turns green when the suite is replayed alone. Check `ps -Ao pid,etime,command | grep [j]ava` before
  suspecting the code.
- **`sbt scalafmt` reformats ~23 unrelated files** — the repo is not up to date formatting-wise.
  Restore them before committing, or clean it up in a separate commit.
- The suite needs Otoroshi reachable at `otoroshi-api.oto.tools` (public wildcard DNS → 127.0.0.1),
  so it fails wholesale when the machine is offline.

## Key files

- Abstraction: [`storage/api.scala`](../daikoku/app/fr/maif/daikoku/storage/api.scala)
- Translator to delete: [`storage/drivers/postgres/Helper.scala`](../daikoku/app/fr/maif/daikoku/storage/drivers/postgres/Helper.scala)
- Implementation: [`storage/drivers/postgres/PostgresDataStore.scala`](../daikoku/app/fr/maif/daikoku/storage/drivers/postgres/PostgresDataStore.scala)
  (`PostgresRepo`, `PostgresTenantAwareRepo`, `CommonRepo`)
- Biggest consumers: `controllers/ApiController.scala`, `services/ApiService.scala`,
  `jobs/QueueJob.scala`, `controllers/AdminApiController.scala`, `services/DeletionService.scala`,
  `domain/SchemaDefinition.scala`, `domain/CommonServices.scala`

## Final check

```bash
grep -rn '\$in\|\$or\|\$regex\|\$gte\|\$ne' daikoku/app   # nothing left query-side
```

and `Helper.scala` gone.
