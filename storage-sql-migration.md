# Removing the Mongo-style query DSL from the storage layer

Working document for a refactor that has landed, kept as the record of how. The `JsObject` query DSL
is gone, and so is the `_deleted` column it used to filter on — see
[What was left](#what-was-left) for the three closing passes and the traps they hid.

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
| 3 | Big ones: `apiRepo`, `apiSubscriptionRepo`, `usagePlanRepo` | **Done** |
| 4 | Repos the plan had not listed: `operationRepo`, `stepValidatorRepo`, `keyringRepo`, `apiDocumentationPageRepo`, `auditTrailRepo`, `translationRepo`, `apiIssueRepo`, `jobRepo`, `apiSubscriptionTransferRepo`, `apiPostRepo`, `emailVerificationRepo` | **Done** |
| Final A | Delete `Helper.scala` and the `JsObject` methods of `Repo` | **Done** — `rowToJson` moved to `pgimplicits`, the file is gone |
| Final B | Slim down / dedupe the `Repo` layer | **Done** — `find*` renaming, plus the index pass below |
| Final C | GIN on `teams.users` + rewrite of the membership lookups | **Done** |
| Final D | Drop the dead `_id` / `_tenant` indexes | **Done** — `evolution_1900_b` |
| Final E | Physical deletion, and dropping the `_deleted` column | **Done** — `evolution_1900_c` to `_e`, see [C](#c-physical-deletion--done) |

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

### 2. Naming: there is no deleted state any more

The `_deleted` column is gone (see [C](#c-physical-deletion--done)). Nothing filters on it, so no
method carries a suffix in either direction: `findById` is the only spelling, and the
`findByIdIncludingDeleted` / `findByIdsIncludingDeleted` / `findAllIncludingDeleted` escape hatches
were removed once they became character-for-character identical to their twins.

This retired a trap worth remembering, because the same shape can reappear with any optional JSON
key: four entities never wrote `_deleted` at all — `Message`, `Operation`, `Translation`, `Asset` —
so `content->>'_deleted'` was NULL for them and a `= 'false'` predicate matched **nothing**. Adding
it to `messageScope` emptied every chat query and broke six tests; the same mistake on `Translation`
and `Asset` was silent. Before filtering on a JSON key, check the `Format` actually writes it.

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
- `queryExists(sql, params)` — implemented in `CommonRepo`.

The generic helpers (`findById`, `findByIds`, `findAll`, `deleteById`, `deleteAll`, `exists`, the
whole `findByIdOrHrId*` family) are already parameterised SQL. Their signatures did not change, so roughly 800 call sites were migrated
without being touched. Id lookups now hit the `_id` PRIMARY KEY instead of `content->>'_id'`.

One parity quirk was kept on purpose: `deleteById` reports `true` even when it removes nothing.

## Indexes

The pass is done: `createIndexes` now covers the predicates the typed methods actually use. Two
tables had **no index at all** and got one — `tenants` (its `domain` is resolved on every HTTP
request in `Hostname` mode) and `consumptions` (the largest table of a busy instance). `users.email`
covers every login, and the `action.user` / `demand` / `subscription` / `keyring` paths of
`notifications` join their siblings, which were already indexed.

## What was left

A, B and C have all landed; this section records what each one did.

### A. GIN on `teams.content->'users'` — **done**

Membership lookups used to scan. `TeamRepo.isMemberSql` was written as

```sql
EXISTS (SELECT 1 FROM jsonb_array_elements(content->'users') AS u WHERE u->>'userId' = $n)
```

which **no index can serve** — the function unnests the array, so every row of the tenant's teams
had to be opened. The tenant predicate in front restricted it, but `myTeams` sits behind nearly
every page (catalogue, notifications, subscriptions), so it is the hottest path of the app on a
tenant with many teams.

The fix was one method plus one index, and both were needed — the index alone would never have been
used:

1. `isMemberSql` is now a containment test a GIN index can serve:
   `content->'users' @> jsonb_build_array(jsonb_build_object('userId', $n::text))`. The explicit
   `::text` resolves the parameter type, since `jsonb_build_object` takes `"any"`. Containment
   matches objects partially, so the `{"userId": …}` probe finds the full
   `{userId, teamPermission}` entry, at any rank in the array;
2. `CREATE INDEX IF NOT EXISTS idx_team_users ON teams USING GIN ((content->'users'));`

`ApiController.search` spelled the same `EXISTS` inline and now calls the repo helper, which became
public for that reason. The four other callers (`findPersonalTeam`, `isTenantAdmin`,
`findPersonalTeamsForAllTenants`, `findByUser`) go through `isMemberSql` and followed for free.
`MessageRepo.containsUser` used `@>` already and needed nothing.

Measured with `EXPLAIN (ANALYZE, BUFFERS)` on `findByUser`, on a throwaway schema holding 200k teams
across 20 tenants (the dev database has 8 teams, which measures nothing):

| | Execution | Heap blocks |
|---|---|---|
| `EXISTS(jsonb_array_elements)` | 85.2 ms | 9686 |
| `@>`, no index | 19.2 ms | 9686 |
| `@>` + GIN | 1.6 ms | 12 |

The predicate alone already wins 4× by not unnesting per row, but it stays in the `Filter` and still
opens every team of the tenant. With the index it moves to a `Recheck Cond` over a Bitmap Index
Scan.

Note `idx_team_users` is unrelated to the neighbouring `uniq_team_personal_user`, which looks
similar but is partial (`WHERE … 'Personal'`) and positional (`content->'users'->0`) because it
enforces "one personal team per user and per tenant". The GIN index has neither restriction and
indexes every member of every team.

Two `jsonb_array_elements` on `teams` were deliberately left alone: the ones in `evolutions.scala`,
which replay a past behaviour, and `DeletionService.removeUserFromTeams`, which unnests the array to
*rewrite* it, not to filter — its own `WHERE` was already a containment test.

### B. Drop the dead indexes — **done**

Every entity carries its id twice: the `_id` column (which holds the PRIMARY KEY) and the JSON key
`content->>'_id'`. Since phase 0 the generic helpers query the *column*, so the 8
`((content->>'_id'))` indexes were only maintained — on every insert and every `save` — and never
read. Same for `((content->>'_tenant'))` on `users`: `UserRepo` is a plain `Repo`, not a
`TenantCapableRepo`, so no user query filters on `_tenant`.

**The check this section used to give was wrong**, and it is the same blind spot as the phase-3 one:
it grepped a *shape* instead of the thing itself. `content->>'_id'` only matches the unspaced
spelling, and the raw SQL of `CommonServices` is written spaced. Spell it as a regex and 52
occurrences show up instead of the 8 index declarations:

```bash
grep -rEn "content *->> *'_id'" daikoku/app daikoku/test
```

Four of them were live reads on a physical table, i.e. two of the eight indexes were *not* dead:

| Index | Read by |
|---|---|
| `idx_api_id` | `CommonServices` — the catalogue's `IN` on api groups, and the notification/api join |
| `idx_team_id` | `CommonServices` — `JOIN teams t ON t.content ->> '_id' = va.content ->> 'team'` |

Those four now read the `_id` column, which is strictly better: same data (verified in the database,
zero divergence between `_id` and `content->>'_id'` on every table), and it hits the PRIMARY KEY
instead of an expression index. The rewrite of the correlated `IN` was checked for scope equivalence
— two nested unaliased `FROM apis`, where the unqualified `_id` must still bind to the *outer* one —
by running both spellings side by side.

The remaining ~17 occurrences are projections off the `my_teams` CTE
(`select t.content ->> '_id' from my_teams t`). They read no index, so they were left alone; the CTE
does expose `_id` (`SELECT teams.*`), so switching them would save a JSON extraction each on the
catalogue queries. Worth doing, not needed here. The `evolutions.scala` joins were left alone too:
they replay a past behaviour and run once.

The drop itself is a **migration**, not a `CREATE INDEX IF NOT EXISTS`: `evolution_1900_b`, with the
9 declarations spelled out in a comment so it can be replayed by hand — the evolution mechanism has
no down-script. The `CREATE INDEX` lines are gone from `createIndexes`, so a fresh database never
builds them in the first place.

### C. Physical deletion — **done**

Deletion used to flag rows `_deleted = true` and run the Otoroshi/Stripe cleanup *synchronously in
the request*, purging physically later from the queue — a timeout risk on a large closure, and a
window of half-deleted state. The column is now gone, along with `notDeletedSql`, the whole
`deleteLogically*` family, the `_deleted` JSON key, the `idx_*_deleted` indexes and the
`*IncludingDeleted` method pairs.

**The write-side pattern.** Every deletion path now:

- deletes the whole DB closure **physically and atomically** in one `withTransaction`;
- defers every external call to the deletion queue via **self-contained operations** — the payload
  carries what the call needs (an orphaned keyring's `{clientId, otoroshiSettings}`), because the row
  is gone. `(Keyring, Delete)` deletes the apikey, `(Keyring, Sync)` recomputes it (row still there),
  and the api's own DB cleanup moved into the transaction, so `(Api, Delete)` disappeared.

The async move is what forces the transaction: you cannot hold a DB transaction open across N
Otoroshi round-trips, so "atomic + no synchronous HTTP" and "no half-deleted closure" are the same
requirement. Idempotency was already there (the external calls tolerate 404 on retry); a frozen
payload is more deterministic on retry than re-reading a mutated tombstone.

**The order the passes had to run in.** Each one was landed green on its own, and the sequence is not
interchangeable:

1. **Write side, one slice at a time** — subscription, keyring and the api cascade, then team, user,
   plan, then tenant, then the generic admin CRUD. The `?logically` / `?notDeleted` admin-api
   parameters became no-ops here. Until all of them were physical the reads could not be touched: an
   earlier attempt at the read side was reverted precisely because tenant still soft-deleted.
2. **`evolution_1900_c`** purges the legacy `_deleted = true` rows. It must run *before* the read
   filter goes, otherwise those tombstones resurface as live data.
3. **Read side** — `notDeletedSql` and the ~15 methods carrying it, then the 47 raw-SQL sites in
   controllers, jobs, services and `CommonServices`. Behaviour-preserving, since step 2 left no row
   the filter could exclude.
4. **The dead code** — the logical-delete write family (already unreachable) and the vestigial admin
   parameters. Then the `*IncludingDeleted` collapse: 249 call sites renamed onto their twins, which
   the compiler covers, since the bodies had become identical.
5. **Frontend before backend.** Two GraphQL queries selected the flag (`apiByIdsWithPlans` asked for
   `deleted`, `plansByApi` for `_deleted`). Sangria rejects a whole query on an unknown field, so the
   client had to stop asking *before* the schema dropped the fields — removing a field from a query
   works against the old server, the reverse does not.
6. **Stop writing** — the `deleted` field on the 19 case classes, its 40 lines in `json.scala`, the 9
   GraphQL fields, the `saveRaw` branch that populated the column.
7. **`evolution_1900_e`** drops the column on its 24 tables.

**Two traps that fail silently.** Neither surfaces as an error, which is what makes them worth
recording:

- **The partial unique index.** `uniq_team_personal_user` was `WHERE _deleted = false AND type =
  'Personal'`. The moment the entities stop writing the key, `saveRaw` leaves the column NULL, and
  `NULL = false` is not true — so the index quietly stops covering new rows and the "one personal
  team per user" uniqueness is lost with no error anywhere. `evolution_1900_d` rebuilds it without
  the predicate, in the same commit that stops the writes.
- **The `idx_*_deleted` indexes survive `DROP COLUMN`.** They are expression indexes on
  `content->>'_deleted'`, the JSON key, not on the column, so Postgres has no dependency to cascade.
  `evolution_1900_e` drops them explicitly.

**Two public contracts changed**, both worth a release note: the GraphQL schema lost `deleted` on
nine types, and the admin-api payloads lost `_deleted` (its twelve properties are gone from
`admin-api-openapi.json`).

- **Testing note:** the external cleanup is asynchronous, so any test asserting Otoroshi/Stripe state
  right after a deletion must first wait for the queue, via the shared
  `awaitDeletionQueueDrained(tenant)` helper in `suites.scala`.
- **Testing note:** watch for assertions of the form `maybeThing.forall(_.deleted) mustBe true`.
  `forall` on `None` is `true`, so they passed precisely when the row was gone — two of them were
  asserting nothing at all.

## Recipe per entity

1. `grep -rn "dataStore\.<repo>" app/ test/` and list every `Json.obj(...)` handed to that repo.
2. Add the typed methods covering each pattern (tenant predicate spelled out for tenant-aware repos).
3. Rewrite the call sites — controllers, services, jobs, and **GraphQL**
   (`domain/SchemaDefinition.scala`, `domain/CommonServices.scala`).
4. Migrate the matching backend tests (`daikoku/test/`, notably `suites.scala`, the shared harness,
   and `controllers/TransactionSpec.scala`, sensitive to `DbConn` threading).
5. Run the suite. One digestible PR per phase.

## Cross-cutting concerns

- **Logical deletion.** Settled, and it went the simpler way: physical deletion landed after the
  typed methods, so the `findNotDeleted` / `deleteLogically` / `notDeleted` family was removed
  wholesale rather than migrated. See [C](#c-physical-deletion--done).
- **`AuditTrailRepo`** has `Of = JsObject` (schemaless). It stays JSONB, just with dedicated typed
  methods.
- **Export / import.** Settled: `streamAllRaw` / `streamAllRawFormatted` now go through
  `ReactivePg.queryStreamSource`, the server-side cursor that already backed `queryRawMappedStream`.
  They used to build a `Source` out of a fully materialised `Seq` — the type said stream, the
  behaviour was a plain `SELECT *`, and `exportAsStream` peaked at the size of the largest table
  (`consumptions` or `audit_events` on a busy instance). Memory is now bounded by `fetchSize`.
- **`findWithProjection`** has few callers: either provide an SQL replacement returning the wanted
  columns, or move those callers to `find` + `map`.
- **Indexes.** The ~60 JSONB expression indexes (`createIndexes`, `PostgresDataStore.scala`) stay
  valid — same storage. What the migration reveals they *don't* cover is collected below.

## Final A notes

`convertQuery` is gone. What went with it, in one commit:

- 15 `JsObject` methods off the `Repo` trait — `find`, `findOne`, `findRaw`, `findOneRaw`,
  `findNotDeleted`, `findOneNotDeleted`, `findOneNotDeletedRaw`, `findWithProjection`,
  `findOneWithProjection`, `findWithPagination`, `delete`, `deleteLogically`, `updateMany`,
  `updateManyByQuery`, `count(JsObject)`, `exists(JsObject)` — and their 19 implementations in
  `PostgresDataStore`, which shrinks by ~680 lines.
- `Helper.scala` keeps only `rowToJson`: 323 lines down to 35.

Two things deliberately stayed `JsObject`:

- **`saveRaw(id, payload)`**, the former `save(query, value)` minus its query argument. The JSON here
  is the *stored* representation, not a query, and four evolutions need it to write entities in the
  shape of their period — the current formats would refuse to read them back.
- **`AuditTrailRepo`**, whose `Of` *is* `JsObject`. Audit events are schemaless by design; only its
  query surface is typed now.

`streamAllRaw` / `streamAllRawFormatted` lose their query argument and keep loading the whole table
before emitting — they never streamed, and the export and evolutions are their only callers.

## Phase 4 notes

The repos the plan had forgotten turned out to be the most repetitive: 21 of `operationRepo`'s 23
queries were the same "pending operations" copy-paste across the test suites, and most of the rest
were `_id $in [...]`. Two generic helpers absorbed them: `deleteByIds`, the pendant of `findByIds`,
and `findByIdsPaginated`.

Three more queries that matched nothing:

- **The queue's concurrency guard.** `QueueJob.deleteFirstOperation` asked
  `exists({"Status": "InProgress"})` — capital S, while an `Operation` writes `status`.
  `content->>'Status'` is always NULL, so `alreadyRunning` was always false and the queue could pick
  up a second operation while one was still running.
- **Team and tenant translations.** `TeamController.teamHome` and `TenantController.getTenant` look
  translations up by `element.id`, but `Translation` is `(tenant, language, key, value)` — it has no
  `element` field any more. Both endpoints have always answered an empty `translation` object.
  Ported as-is: restoring it means deciding how a translation names its entity, which the model no
  longer expresses.
- **`fetchPages`** on `ApiDocumentation` had no caller at all. Removed.

The last two `findWithProjection` went with them. Note the projection returned *every* column as
text, so the documentation titles endpoint rendered `lastModificationAt` as a string; the typed
replacement keeps that, since the front reads only `_id`, `title` and `level`.

## Phase 3 notes

`apiRepo` closes the phase: 66 queries, and the widest domain surface of the migration because an api
is versioned. `_humanReadableId` is shared by every version, `currentVersion` tells them apart,
`parent` is null on the root and `isDefault` marks the served one — so most methods name a point in
that tree (`findRootVersion`, `findOtherVersions`, `existsVersion`, `clearDefaultVersionExcept`,
`reparentVersions`, `renameHumanReadableId`) rather than a WHERE clause.

Two things it exposed:

- **A `++` that reads like a bug but is not.** `AdminApiController.validate` built
  `Json.obj("_id" -> {"$ne": id}, "name" -> name) ++ parent.map(p => Json.obj("_id" -> p))`. `++` on a
  `JsObject` *overwrites* the duplicate key, so with a parent the query silently becomes "the parent
  api bearing this name" — which is exactly what the caller wants: creating a new version must find
  its parent and accept it. Rewriting it on the name alone broke
  `AdminApiControllerSpec` ("create a new version of API (with same name)" got a 400), because
  `LIMIT 1` may return any other version. `findAnotherWithName` therefore takes the parent and
  reproduces both branches.
- **A job that verified nothing.** `OtoroshiEntitiesVerifierJob` filters the *apis* stream with a
  query built from its entry point, which names *subscription* fields (`api`, `plan`, or the
  subscription's `_id`). An `Api` carries none of them, so every entry point but
  `SyncAllSubscription` reduced the stream to nothing. Ported as-is with the behaviour spelled out in
  a comment: fixing it means deciding which api a plan or a subscription should resolve to, which is
  a product call.

### The scan blind spot

Grepping `<repo>` followed by a JsObject call misses every query built into a variable or a helper
(`referencingPlans(query)` in `TenantService`, `uniquenessQuery` in `ApiCrudService`,
`val apiRepo = …` then `apiRepo.findNotDeleted(...)`). Three real call sites hid there. The reliable
scan walks *every* JsObject-API call and attributes it to a repo by reading backwards — that is what
the final check below does.


`apiSubscriptionRepo` is the widest surface of the phase — 54 queries — but a narrow set of
dimensions: `api`, `team`, `plan`, `keyring`, `apiKey.clientId`. The keyring ones carry the
aggregation model (several subscriptions share one Otoroshi apikey), which is why they get named
methods rather than a generic filter: `findKeyringSiblings`, `countByKeyring` and
`updateApiKeyOfKeyring` each answer a question the domain asks, not a shape of WHERE clause.

Migrating it needed one new primitive on `Repo`: `queryCount`, the parameterised counterpart of
`count(JsObject)`. Without it a count had to go through `queryPaginated` with `LIMIT 0`, which runs
two statements to throw one away.

A warning for the remaining `apiRepo` step: a regex rewrite of the `.forTenant(x).findNotDeleted(
Json.obj("team" -> …))` shape silently matched `apiRepo` as well as `apiSubscriptionRepo`. The
compiler caught it, but only because `ApiRepo` had no `findByTeam` yet — once it does, the same
mistake compiles. Rewrite call sites repo by repo, never by shape alone.


`usagePlanRepo` turned out to be the easy one of the three: eighteen of its twenty-one queries were
`_id $in [...]`, which the generic `findByIdsNotDeleted` of phase 0 already covers. A plan does not
name its api — the relation is carried the other way round, by `Api.possibleUsagePlans` — so
`findByApi` is just that helper applied to the api's plan ids. Only `findByCustomName` needed a
method of its own.

It also exposed a test that could not fail. `ApiControllerTeamAdminSpec`, under the comment "test if
plans are deleted", asserted `findNotDeleted(Json.obj("api" -> api.id)).isEmpty`. `UsagePlan` has no
`api` field at all, so `content->>'api'` is NULL, the predicate is never true, and the query returned
nothing whatever the state of the database. It now looks the plans up by id — which means it can now
actually fail.

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
needs no jsonb literal and no cast. There was no GIN index on `content->'users'` at the time, so the
former `@>` containment was not indexed either — no regression. Both were revisited in
[item A](#a-gin-on-teamscontent-users--done), which put the containment form back and added the
index.

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
# Every JsObject-API call, attributed to its repo by reading backwards.
python3 - <<'EOF'
import re, glob
files = glob.glob('daikoku/app/**/*.scala', recursive=True) + \
        glob.glob('daikoku/test/**/*.scala', recursive=True)
meths = r'\.(find|findOne|findNotDeleted|findOneNotDeleted|findRaw|findOneRaw|' \
        r'findWithPagination|findWithProjection|delete|deleteLogically|' \
        r'updateMany|updateManyByQuery|streamAllRaw|streamAllRawFormatted|count|exists)\('
for p in sorted(files):
    s = open(p).read(); lines = s.split('\n')
    for m in re.finditer(meths, s):
        depth = 0
        for j in range(m.end() - 1, min(m.end() + 3000, len(s))):
            if s[j] == '(': depth += 1
            elif s[j] == ')':
                depth -= 1
                if depth == 0: break
        if 'Json.obj' not in s[m.end():j]: continue
        ln = s[:m.start()].count('\n')
        if lines[ln].strip().startswith('//'): continue
        repo = next((re.search(r'(\w+Repo)\b', lines[k]).group(1)
                     for k in range(ln, max(0, ln - 8), -1)
                     if re.search(r'(\w+Repo)\b', lines[k])), None)
        print(p + ':' + str(ln + 1), repo)
EOF
```

and `Helper.scala` gone.
