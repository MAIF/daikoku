package fr.maif.daikoku.storage

import cats.data.OptionT
import fr.maif.daikoku.domain._
import fr.maif.daikoku.env.Env
import io.vertx.sqlclient.SqlConnection
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.Source
import org.apache.pekko.util.ByteString
import play.api.libs.json._
import fr.maif.daikoku.services.CmsPage

import scala.concurrent.{ExecutionContext, Future}

// DbConn is threaded through all Repo methods as an implicit parameter.
// NoConn (the default given) preserves the existing behavior: each call
// borrows a fresh connection from the pool.  ActiveConn wraps a Vert.x
// SqlConnection opened by withTransaction, so every Repo method executed
// inside a withTransaction block automatically uses the same connection and
// participates in the same DB transaction — without any change at call sites.
sealed abstract class DbConn
case object NoConn extends DbConn
case class ActiveConn(conn: SqlConnection) extends DbConn

object DbConn {
  // Available everywhere via implicit resolution; callers outside a
  // transaction don't need to import or declare anything.
  implicit val default: DbConn = NoConn
}

sealed trait SortingOrder {
  def name: String
}

case object Desc extends SortingOrder {
  def name: String = "DESC"
}
case object Asc extends SortingOrder {
  def name: String = "ASC"
}

trait TenantCapableRepo[Of, Id <: ValueType] {
  def forTenant(tenant: Tenant): Repo[Of, Id] = forTenant(tenant.id)

  def forTenant(tenant: TenantId): Repo[Of, Id]

  def forTenantF(tenant: Tenant): Future[Repo[Of, Id]] = forTenantF(tenant.id)

  def forTenantF(tenant: TenantId): Future[Repo[Of, Id]]

  def forAllTenant(): Repo[Of, Id]

  def forAllTenantF(): Future[Repo[Of, Id]]
}

trait Repo[Of, Id <: ValueType] {
  def tableName: String

  def format: Format[Of]

  def extractId(value: Of): String

  def count()(implicit dbConn: DbConn, ec: ExecutionContext): Future[Long]

  // Streaming methods are intentionally excluded from DbConn: they return a
  // lazy Source that materialises outside any transaction window.
  def streamAllRaw()(implicit ec: ExecutionContext): Source[JsValue, ?]

  def streamAllRawFormatted()(implicit
      ec: ExecutionContext
  ): Source[Of, ?]

  def save(
      value: Of
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Boolean] =
    saveRaw(extractId(value), format.writes(value).as[JsObject])

  /** Inserts or replaces the whole `content` of one entity. The JSON here is
    * the stored representation, not a query — the evolutions use it to write
    * entities in the shape of their period, which the current format would
    * refuse to read.
    */
  def saveRaw(id: String, payload: JsObject)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Boolean]

  def insertMany(
      values: Seq[Of]
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Long]

  /** Run a raw, parameterised SQL statement and parse each returned row's
    * `content` column into an entity of this repo. Intended for statements that
    * `RETURNING content` (e.g. an `UPDATE ... RETURNING content`). The tenant
    * scoping normally added by `forTenant` is NOT injected here: the caller
    * owns the whole SQL, so any tenant/`_deleted` filter must be written
    * explicitly. Always pass values through `params` ($1, $2, …) rather than
    * interpolating them into `sql`.
    */
  def queryTyped(sql: String, params: Seq[AnyRef] = Seq.empty)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Of]]

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Generic helpers.  Their bodies are plain parameterised SQL run through the
  // primitives below (`query` / `queryOne` / `execute` / `queryExists` /
  // `queryCount`); every value goes through `params`, never into the string.
  //
  // Beware: those primitives run the SQL exactly as written, so the tenant
  // scoping added by `forTenant` is NOT injected for free.  Every helper here
  // therefore builds its WHERE clause with `scopedWhere`, which appends
  // `content->>'_tenant' = $n` when the repo is tenant-scoped.

  /** Tenant this repo is scoped to, when it was obtained through `forTenant`.
    */
  protected def tenantScope: Option[String] = None

  /** Matches the entities not logically deleted. Note an entity without a
    * `_deleted` key does not match.
    */
  protected val notDeletedSql: String = "content->>'_deleted' = 'false'"

  /** Builds the ` WHERE …` clause (empty string when there is nothing to filter
    * on) of a generic helper. `predicates` must already reference `$1..$n`
    * consistently with `params`; the tenant value, when the repo is
    * tenant-scoped, is bound to the next free placeholder.
    */
  protected def scopedWhere(
      predicates: Seq[String],
      params: Seq[AnyRef] = Seq.empty
  ): (String, Seq[AnyRef]) = {
    val (allPredicates, allParams) = tenantScope match {
      case Some(tenant) =>
        (
          predicates :+ s"content->>'_tenant' = $$${params.size + 1}",
          params :+ tenant
        )
      case None => (predicates, params)
    }

    if (allPredicates.isEmpty) ("", allParams)
    else (s" WHERE ${allPredicates.mkString(" AND ")}", allParams)
  }

  private def findOneByIdOrHrId(id: String, hrid: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Of]] = {
    val (where, params) = scopedWhere(
      Seq(s"(_id = $$1 OR content->>'_humanReadableId' = $$2)", notDeletedSql),
      Seq(id, hrid)
    )
    queryOne(s"SELECT content FROM $tableName$where LIMIT 1", params)
  }

  def findByIdOrHrId(id: String, hrid: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Of]] =
    findOneByIdOrHrId(id, hrid)

  def findByIdOrHrId(id: Id, hrid: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Of]] =
    findOneByIdOrHrId(id.value, hrid)

  def findByIdOrHrId(
      idOrHrid: String
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Option[Of]] =
    findOneByIdOrHrId(idOrHrid, idOrHrid)

  def deleteByIdOrHrId(id: String, hrid: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Boolean] = {
    val (where, params) = scopedWhere(
      Seq(s"(_id = $$1 OR content->>'_humanReadableId' = $$2)"),
      Seq(id, hrid)
    )
    execute(s"DELETE FROM $tableName$where", params).map(_ => true)
  }

  def deleteByIdOrHrId(id: Id, hrid: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Boolean] =
    deleteByIdOrHrId(id.value, hrid)

  def deleteLogicallyByIdOrHrId(id: String, hrid: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Boolean] = {
    val (where, params) = scopedWhere(
      Seq(s"(_id = $$1 OR content->>'_humanReadableId' = $$2)", notDeletedSql),
      Seq(id, hrid)
    )
    execute(
      s"UPDATE $tableName SET _deleted = true, " +
        "content = content || '{ \"_deleted\" : true }'" + where,
      params
    ).map(_ > 0)
  }

  def deleteLogicallyByIdOrHrId(id: Id, hrid: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Boolean] =
    deleteLogicallyByIdOrHrId(id.value, hrid)

  def existsByIdOrHrId(id: String, hrid: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Boolean] =
    findByIdOrHrId(id, hrid).map(_.isDefined)

  def existsByIdOrHrId(id: Id, hrid: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Boolean] =
    findByIdOrHrId(id, hrid).map(_.isDefined)

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  def deleteByIdLogically(id: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Boolean]

  def deleteByIdLogically(id: Id)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Boolean]

  def deleteAllLogically()(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Boolean]

  /** Every entity of the repo. Like the rest of the family, this is the
    * not-deleted nominal case; `findAllIncludingDeleted` is the escape hatch.
    */
  def findAll()(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Of]] = {
    val (where, params) = scopedWhere(
      Seq(s"($notDeletedSql OR content->>'_deleted' IS NULL)")
    )
    query(s"SELECT content FROM $tableName$where", params)
  }

  def findById(
      id: String
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Option[Of]] = {
    val (where, params) =
      scopedWhere(Seq(s"_id = $$1", notDeletedSql), Seq(id))
    queryOne(s"SELECT content FROM $tableName$where LIMIT 1", params)
  }

  def findById(
      id: Id
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Option[Of]] =
    findById(id.value)

  /** Reaches an entity whatever its `_deleted` flag. The deletion pipeline
    * needs it: `QueueJob` and `DeletionService` re-read entities they have just
    * flagged, to carry the cascade through.
    */
  def findByIdIncludingDeleted(
      id: String
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Option[Of]] = {
    val (where, params) = scopedWhere(Seq(s"_id = $$1"), Seq(id))
    queryOne(s"SELECT content FROM $tableName$where LIMIT 1", params)
  }

  def findByIdIncludingDeleted(
      id: Id
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Option[Of]] =
    findByIdIncludingDeleted(id.value)

  def findByIds(
      ids: Seq[Id]
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Seq[Of]] = {
    val (where, params) = scopedWhere(
      Seq(s"_id = ANY($$1::text[])", notDeletedSql),
      Seq(ids.map(_.value).toArray)
    )
    query(s"SELECT content FROM $tableName$where", params)
  }

  /** Batch counterpart of `findByIdIncludingDeleted`. The GraphQL Fetchers use
    * it: Sangria fails the whole query when a batch does not resolve every id
    * it was given, so a reference to a flagged entity must still come back.
    */
  def findByIdsIncludingDeleted(
      ids: Seq[Id]
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Seq[Of]] = {
    val (where, params) = scopedWhere(
      Seq(s"_id = ANY($$1::text[])"),
      Seq(ids.map(_.value).toArray)
    )
    query(s"SELECT content FROM $tableName$where", params)
  }

  def findAllIncludingDeleted()(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Of]] = {
    val (where, params) = scopedWhere(Seq.empty)
    query(s"SELECT content FROM $tableName$where", params)
  }

  /** Filters backing the generic GraphQL `xxx` / `xxxs` fields: an optional
    * list of ids — each matched against `_id` *or* `_humanReadableId` — and an
    * optional owning team. An empty `ids` list matches nothing, as the former
    * `$in` did.
    */
  private def idsOrHrIdsAndTeamWhere(
      ids: Option[Seq[String]],
      team: Option[String]
  ): (String, Seq[AnyRef]) = {
    val predicates = Seq.newBuilder[String] += notDeletedSql
    val params = Seq.newBuilder[AnyRef]
    var placeholder = 0

    ids.foreach { values =>
      placeholder += 1
      predicates += s"(_id = ANY($$$placeholder::text[]) " +
        s"OR content->>'_humanReadableId' = ANY($$$placeholder::text[]))"
      params += values.toArray
    }
    team.foreach { teamId =>
      placeholder += 1
      predicates += s"content->>'team' = $$$placeholder"
      params += teamId
    }

    scopedWhere(predicates.result(), params.result())
  }

  def findByIdsOrHrIdsAndTeam(ids: Option[Seq[String]], team: Option[String])(
      implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Of]] = {
    val (where, params) = idsOrHrIdsAndTeamWhere(ids, team)
    query(s"SELECT content FROM $tableName$where", params)
  }

  /** Same filters, one page at a time. `page` is a zero-based page index, not a
    * row offset — the GraphQL `offset` argument it comes from has always been
    * multiplied by `pageSize`.
    */
  def findByIdsOrHrIdsAndTeamPaginated(
      ids: Option[Seq[String]],
      team: Option[String],
      page: Int,
      pageSize: Int
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[(Seq[Of], Long)] = {
    val (where, params) = idsOrHrIdsAndTeamWhere(ids, team)
    queryPaginated(
      s"SELECT content FROM $tableName$where ORDER BY _id ASC",
      params,
      offset = page * pageSize,
      limit = pageSize
    )
  }

  /** Ids again, one page at a time and sorted on a JSON field. `page` is a
    * zero-based page index, not a row offset.
    */
  def findByIdsPaginated(
      ids: Seq[Id],
      page: Int,
      pageSize: Int,
      sortBy: String,
      order: SortingOrder = Asc
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[(Seq[Of], Long)] = {
    val (where, params) = scopedWhere(
      Seq(s"_id = ANY($$1::text[])", notDeletedSql),
      Seq(ids.map(_.value).toArray)
    )
    queryPaginated(
      s"SELECT content FROM $tableName$where " +
        s"ORDER BY content->>'$sortBy' ${order.name}",
      params,
      offset = page * pageSize,
      limit = pageSize
    )
  }

  /** Physical deletion of a batch of entities. Pendant of `findByIds`; unlike
    * `deleteById` it reports how many rows were actually removed.
    */
  def deleteByIds(
      ids: Seq[Id]
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Long] = {
    val (where, params) = scopedWhere(
      Seq(s"_id = ANY($$1::text[])"),
      Seq(ids.map(_.value).toArray)
    )
    execute(s"DELETE FROM $tableName$where", params)
  }

  // NB: reports success regardless of the number of rows actually removed.
  // `deleteByIds` returns the count instead.
  def deleteById(
      id: String
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Boolean] = {
    val (where, params) = scopedWhere(Seq(s"_id = $$1"), Seq(id))
    execute(s"DELETE FROM $tableName$where", params).map(_ => true)
  }

  def deleteById(
      id: Id
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Boolean] =
    deleteById(id.value)

  def deleteAll()(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Boolean] = {
    val (where, params) = scopedWhere(Seq.empty)
    execute(s"DELETE FROM $tableName$where", params).map(_ => true)
  }

  def exists(
      id: String
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Boolean] = {
    val (where, params) = scopedWhere(Seq(s"_id = $$1"), Seq(id))
    queryExists(s"SELECT 1 FROM $tableName$where LIMIT 1", params)
  }

  def exists(
      id: Id
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Boolean] =
    exists(id.value)

  /** Runs a parameterised `SELECT COUNT(*) AS count …` and returns the count.
    * Like the other primitives it takes the SQL as written: no tenant or
    * `_deleted` filter is injected.
    */
  def queryCount(query: String, params: Seq[AnyRef] = Seq.empty)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long]

  /** True as soon as the parameterised SQL returns at least one row. Used by
    * the generic helpers above, which must not parse `content` just to know
    * whether a row exists.
    */
  protected def queryExists(query: String, params: Seq[AnyRef] = Seq.empty)(
      implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Boolean]

  def queryOne(query: String, params: Seq[AnyRef] = Seq.empty)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Of]]
  def query(query: String, params: Seq[AnyRef] = Seq.empty)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Of]]
  def queryPaginated(
      query: String,
      params: Seq[AnyRef] = Seq.empty,
      offset: Int,
      limit: Int
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[(Seq[Of], Long)]

  def execute(
      query: String,
      params: Seq[AnyRef] = Seq.empty
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Long]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
trait UserSessionRepo extends Repo[UserSession, DatastoreId] {

  /** A session is identified by its `sessionId`, which is NOT its `_id`: both
    * are independent random tokens.
    */
  def findBySessionId(
      sessionId: String
  )(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[UserSession]] =
    queryOne(
      s"SELECT content FROM $tableName WHERE content->>'sessionId' = $$1 LIMIT 1",
      Seq(sessionId)
    )

  /** The sessions of those users that have not expired yet. */
  def findActiveByUserIds(userIds: Seq[UserId], nowMillis: Long)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[UserSession]] =
    query(
      s"SELECT content FROM $tableName " +
        "WHERE content->>'userId' = ANY($1::text[]) " +
        "AND (content->>'expires')::bigint > $2",
      Seq(userIds.map(_.value).toArray, java.lang.Long.valueOf(nowMillis))
    )

  /** The genuine session of a user, as opposed to one opened by an admin
    * impersonating them.
    */
  def findByUserEmailWithoutImpersonator(
      email: String
  )(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[UserSession]] =
    queryOne(
      s"SELECT content FROM $tableName " +
        "WHERE content->>'userEmail' = $1 " +
        "AND content->>'impersonatorId' IS NULL LIMIT 1",
      Seq(email)
    )

  def findByImpersonatorEmail(
      email: String
  )(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[UserSession]] =
    queryOne(
      s"SELECT content FROM $tableName " +
        "WHERE content->>'impersonatorEmail' = $1 LIMIT 1",
      Seq(email)
    )

  def deleteByImpersonatorSessionId(sessionId: UserSessionId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] =
    execute(
      s"DELETE FROM $tableName WHERE content->>'impersonatorSessionId' = $$1",
      Seq(sessionId.value)
    )

  def deleteByUserId(
      userId: String
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Long] =
    execute(
      s"DELETE FROM $tableName WHERE content->>'userId' = $$1",
      Seq(userId)
    )

  def deleteByUserEmail(
      email: String
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Long] =
    execute(
      s"DELETE FROM $tableName WHERE content->>'userEmail' = $$1",
      Seq(email)
    )

  /** Disconnects everybody, optionally sparing one session — typically the one
    * of the admin triggering the purge.
    */
  def deleteAllExceptSession(spared: Option[UserSessionId])(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] =
    spared match {
      case Some(sessionId) =>
        execute(
          s"DELETE FROM $tableName WHERE content->>'sessionId' <> $$1",
          Seq(sessionId.value)
        )
      case None => execute(s"DELETE FROM $tableName")
    }
}

trait PasswordResetRepo extends Repo[PasswordReset, DatastoreId] {
  def findByRandomIdAndEmail(randomId: String, email: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[PasswordReset]] =
    queryOne(
      s"SELECT content FROM $tableName " +
        "WHERE content->>'randomId' = $1 AND content->>'email' = $2 " +
        s"AND $notDeletedSql LIMIT 1",
      Seq(randomId, email)
    )
}

trait AccountCreationRepo extends Repo[AccountCreation, DemandId] {
  def findByRandomId(
      randomId: String
  )(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[AccountCreation]] =
    queryOne(
      s"SELECT content FROM $tableName WHERE content->>'randomId' = $$1 " +
        s"AND $notDeletedSql LIMIT 1",
      Seq(randomId)
    )
}

trait TenantRepo extends Repo[Tenant, TenantId] {

  /** Resolves the tenant serving a given hostname. */
  def findByDomain(
      domain: String
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Option[Tenant]] =
    queryOne(
      s"SELECT content FROM $tableName WHERE content->>'domain' = $$1 " +
        s"AND $notDeletedSql LIMIT 1",
      Seq(domain)
    )

  /** A domain identifies a tenant, so it cannot be claimed by a second one. */
  def existsAnotherWithDomain(id: TenantId, domain: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Boolean] =
    queryExists(
      s"SELECT 1 FROM $tableName WHERE _id <> $$1 " +
        s"AND content->>'domain' = $$2 AND $notDeletedSql LIMIT 1",
      Seq(id.value, domain)
    )
}

trait UserRepo extends Repo[User, UserId] {

  /** The email identifies a user across tenants: it is what every auth module
    * (local, LDAP, OAuth) resolves a login against.
    */
  def findByEmail(
      email: String
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Option[User]] =
    queryOne(
      s"SELECT content FROM $tableName WHERE content->>'email' = $$1 " +
        s"AND $notDeletedSql LIMIT 1",
      Seq(email)
    )

  /** Guards that uniqueness when creating or updating a user. */
  def existsAnotherWithEmail(id: UserId, email: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Boolean] =
    queryExists(
      s"SELECT 1 FROM $tableName WHERE _id <> $$1 " +
        s"AND content->>'email' = $$2 AND $notDeletedSql LIMIT 1",
      Seq(id.value, email)
    )

  /** The user holding a pending team invitation. */
  def findByInvitationToken(
      token: String
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Option[User]] =
    queryOne(
      s"SELECT content FROM $tableName " +
        "WHERE content->'invitation'->>'token' = $1 " +
        s"AND $notDeletedSql LIMIT 1",
      Seq(token)
    )
}

trait EvolutionRepo extends Repo[Evolution, DatastoreId] {
  def findByVersion(
      version: String
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Option[Evolution]] =
    queryOne(
      s"SELECT content FROM $tableName WHERE content->>'version' = $$1 LIMIT 1",
      Seq(version)
    )
}
trait ReportsInfoRepo extends Repo[ReportsInfo, DatastoreId]

trait ApiSubscriptionTransferRepo
    extends TenantCapableRepo[ApiSubscriptionTransfer, DatastoreId] {

  /** A transfer is claimed with the one-shot token carried by its link. */
  def findByToken(tenant: TenantId, token: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[ApiSubscriptionTransfer]] = {
    val repo = forTenant(tenant)
    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 AND content->>'_deleted' = 'false' " +
        "AND content->>'token' = $2 LIMIT 1",
      Seq(tenant.value, token)
    )
  }

  /** Only one transfer may be pending for a subscription, so issuing a new one
    * drops the previous.
    */
  def deleteBySubscription(tenant: TenantId, subscription: ApiSubscriptionId)(
      implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] = {
    val repo = forTenant(tenant)
    repo.execute(
      s"DELETE FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 AND content->>'subscription' = $2",
      Seq(tenant.value, subscription.value)
    )
  }
}

trait TeamRepo extends TenantCapableRepo[Team, TeamId] {

  /** Raw SQL bypasses the tenant scoping that `forTenant` applies to the
    * generic helpers, so every method here spells the `_tenant` predicate out.
    * By convention it is bound to `$1`, and the other values follow.
    */
  private val teamScope: String =
    "content->>'_tenant' = $1 AND content->>'_deleted' = 'false'"

  /** Membership predicate on the JSON `users` array — the SQL form of the
    * former `{"users.userId": …}` query.
    *
    * Written as a containment test rather than an unnesting `EXISTS`, because
    * `jsonb_array_elements` opens every row: only `@>` can be served by the
    * `idx_team_users` GIN index on `content->'users'`. Containment matches
    * objects partially, so a `{"userId": …}` probe finds the full
    * `{"userId", "teamPermission"}` entry. Public because `ApiController.search`
    * needs the same predicate inside its own SQL.
    */
  def isMemberSql(placeholder: Int): String =
    s"content->'users' @> jsonb_build_array(jsonb_build_object('userId', $$$placeholder::text))"

  /** The team backing the tenant administration. */
  def findAdminTeam(
      tenant: TenantId
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Option[Team]] = {
    val repo = forTenant(tenant)
    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $teamScope AND content->>'type' = '${TeamType.Admin.name}' " +
        "LIMIT 1",
      Seq(tenant.value)
    )
  }

  /** The personal team of a user — the one holding them as its single member.
    */
  def findPersonalTeam(tenant: TenantId, user: UserId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Team]] = {
    val repo = forTenant(tenant)
    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $teamScope " +
        s"AND content->>'type' = '${TeamType.Personal.name}' " +
        s"AND ${isMemberSql(2)} LIMIT 1",
      Seq(tenant.value, user.value)
    )
  }

  /** True when the user sits in the tenant administration team, i.e. is a
    * tenant admin.
    */
  def isTenantAdmin(tenant: TenantId, user: UserId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Boolean] = {
    val repo = forTenant(tenant)
    repo
      .queryOne(
        s"SELECT content FROM ${repo.tableName} " +
          s"WHERE $teamScope AND content->>'type' = '${TeamType.Admin.name}' " +
          s"AND ${isMemberSql(2)} LIMIT 1",
        Seq(tenant.value, user.value)
      )
      .map(_.isDefined)
  }

  /** The personal teams a user holds across every tenant — a user has one per
    * tenant they belong to, so this tells whether they are still known
    * elsewhere.
    */
  def findPersonalTeamsForAllTenants(
      user: UserId
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Seq[Team]] = {
    val repo = forAllTenant()
    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        "WHERE content->>'_deleted' = 'false' " +
        s"AND content->>'type' = '${TeamType.Personal.name}' " +
        s"AND ${isMemberSql(1)}",
      Seq(user.value)
    )
  }

  /** Every team of the tenant, personal ones optionally left out — which is
    * what `tenant.subscriptionSecurity` asks for.
    */
  def findAllTeams(tenant: TenantId, excludePersonal: Boolean)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Team]] = {
    val repo = forTenant(tenant)
    repo.query(
      s"SELECT content FROM ${repo.tableName} WHERE $teamScope" +
        personalExclusion(excludePersonal),
      Seq(tenant.value)
    )
  }

  /** The teams a user belongs to. */
  def findByUser(tenant: TenantId, user: UserId, excludePersonal: Boolean)(
      implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Team]] = {
    val repo = forTenant(tenant)
    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $teamScope AND ${isMemberSql(2)}" +
        personalExclusion(excludePersonal),
      Seq(tenant.value, user.value)
    )
  }

  private def personalExclusion(excludePersonal: Boolean): String =
    if (excludePersonal)
      s" AND content->>'type' <> '${TeamType.Personal.name}'"
    else ""

  def myTeams(tenant: Tenant, user: User)(implicit
      env: Env,
      ec: ExecutionContext
  ): Future[Seq[Team]] = {
    val excludePersonal = tenant.subscriptionSecurity.exists(identity)

    if (user.isDaikokuAdmin) findAllTeams(tenant.id, excludePersonal)
    else findByUser(tenant.id, user.id, excludePersonal)
  }
}

trait NotificationRepo extends TenantCapableRepo[Notification, NotificationId] {

  /** Raw SQL bypasses the tenant scoping of `forTenant`, so the `_tenant`
    * predicate is spelled out here too, bound to `$1` by convention. The
    * `action.xxx` / `status.status` paths match the JSONB indexes declared in
    * `PostgresDataStore.createIndexes`.
    */
  private val notificationScope: String =
    "content->>'_tenant' = $1 AND content->>'_deleted' = 'false'"

  private val pending: String =
    s"content->'status'->>'status' = '${NotificationStatus.Pending().status}'"

  /** The pending notifications of one kind — an access or a subscription
    * request, say — raised against a set of teams, optionally about a single
    * api.
    */
  def findPendingByActionTypeAndTeams(
      tenant: TenantId,
      actionType: String,
      teams: Seq[TeamId],
      api: Option[ApiId] = None
  )(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Notification]] = {
    val repo = forTenant(tenant)
    val apiFilter =
      if (api.isDefined) " AND content->'action'->>'api' = $4" else ""

    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $notificationScope AND $pending " +
        s"AND content->'action'->>'type' = $$2 " +
        s"AND content->'action'->>'team' = ANY($$3::text[])$apiFilter",
      Seq(tenant.value, actionType, teams.map(_.value).toArray) ++
        api.map(_.value).toSeq
    )
  }

  /** The notifications addressed to a team. */
  def findByTeam(tenant: TenantId, team: TeamId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Notification]] = {
    val repo = forTenant(tenant)
    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $notificationScope AND content->>'team' = $$2",
      Seq(tenant.value, team.value)
    )
  }

  /** Those of them still waiting for an answer. */
  def findPendingByTeam(tenant: TenantId, team: TeamId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Notification]] = {
    val repo = forTenant(tenant)
    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $notificationScope AND $pending AND content->>'team' = $$2",
      Seq(tenant.value, team.value)
    )
  }

  /** The invitations to a team nobody has answered yet. */
  def findPendingTeamInvitations(tenant: TenantId, team: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Notification]] = {
    val repo = forTenant(tenant)
    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $notificationScope AND $pending " +
        "AND content->'action'->>'type' = 'TeamInvitation' " +
        "AND content->'action'->>'team' = $2",
      Seq(tenant.value, team)
    )
  }

  def findTeamInvitationForUser(tenant: TenantId, user: UserId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Notification]] = {
    val repo = forTenant(tenant)
    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $notificationScope " +
        "AND content->'action'->>'type' = 'TeamInvitation' " +
        "AND content->'action'->>'user' = $2 LIMIT 1",
      Seq(tenant.value, user.value)
    )
  }

  def deleteTeamInvitation(tenant: TenantId, team: TeamId, user: String)(
      implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] = {
    val repo = forTenant(tenant)
    repo.execute(
      s"DELETE FROM ${repo.tableName} " +
        s"WHERE content->>'_tenant' = $$1 AND $pending " +
        "AND content->'action'->>'type' = 'TeamInvitation' " +
        "AND content->'action'->>'team' = $2 " +
        "AND content->'action'->>'user' = $3",
      Seq(tenant.value, team.value, user)
    )
  }

  /** What a user still has to answer: the pending notifications addressed to
    * the teams they administrate, plus those aimed at them personally.
    */
  def findPendingForUser(
      tenant: TenantId,
      user: UserId,
      administratedTeams: Seq[TeamId]
  )(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Notification]] = {
    val repo = forTenant(tenant)
    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $notificationScope AND $pending " +
        "AND (content->>'team' = ANY($2::text[]) " +
        "OR content->'action'->>'user' = $3)",
      Seq(
        tenant.value,
        administratedTeams.map(_.value).toArray,
        user.value
      )
    )
  }

  /** Drops what a subscription demand raised, once it is settled. */
  def deleteByDemand(tenant: TenantId, demand: DemandId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] = {
    val repo = forTenant(tenant)
    repo.execute(
      s"DELETE FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 " +
        "AND content->'action'->>'demand' = $2",
      Seq(tenant.value, demand.value)
    )
  }
}

trait ApiDocumentationPageRepo
    extends TenantCapableRepo[ApiDocumentationPage, ApiDocumentationPageId]

trait ApiPostRepo extends TenantCapableRepo[ApiPost, ApiPostId]

trait ApiIssueRepo extends TenantCapableRepo[ApiIssue, ApiIssueId]

trait ApiSubscriptionRepo
    extends TenantCapableRepo[ApiSubscription, ApiSubscriptionId] {

  /** Raw SQL bypasses the tenant scoping of `forTenant`, so the `_tenant`
    * predicate is spelled out; it is bound to `$1` by convention.
    */
  private val subscriptionScope: String =
    "content->>'_tenant' = $1 AND content->>'_deleted' = 'false'"

  private def select(tenant: TenantId, predicate: String, params: Seq[AnyRef])(
      implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[ApiSubscription]] = {
    val repo = forTenant(tenant)
    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $subscriptionScope AND $predicate",
      tenant.value +: params
    )
  }

  private def selectOne(
      tenant: TenantId,
      predicate: String,
      params: Seq[AnyRef]
  )(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[ApiSubscription]] = {
    val repo = forTenant(tenant)
    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $subscriptionScope AND $predicate LIMIT 1",
      tenant.value +: params
    )
  }

  def findByApi(tenant: TenantId, api: ApiId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[ApiSubscription]] =
    select(tenant, "content->>'api' = $2", Seq(api.value))

  def findByApis(tenant: TenantId, apis: Seq[ApiId])(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[ApiSubscription]] =
    select(
      tenant,
      "content->>'api' = ANY($2::text[])",
      Seq(apis.map(_.value).toArray)
    )

  def findByTeam(tenant: TenantId, team: TeamId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[ApiSubscription]] =
    select(tenant, "content->>'team' = $2", Seq(team.value))

  def findByApiAndTeams(tenant: TenantId, api: ApiId, teams: Seq[TeamId])(
      implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[ApiSubscription]] =
    select(
      tenant,
      "content->>'api' = $2 AND content->>'team' = ANY($3::text[])",
      Seq(api.value, teams.map(_.value).toArray)
    )

  def findByApiAndPlan(tenant: TenantId, api: ApiId, plan: UsagePlanId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[ApiSubscription]] =
    select(
      tenant,
      "content->>'api' = $2 AND content->>'plan' = $3",
      Seq(api.value, plan.value)
    )

  def findByApiTeamAndPlan(
      tenant: TenantId,
      api: ApiId,
      team: TeamId,
      plan: UsagePlanId
  )(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[ApiSubscription]] =
    select(
      tenant,
      "content->>'api' = $2 AND content->>'team' = $3 " +
        "AND content->>'plan' = $4",
      Seq(api.value, team.value, plan.value)
    )

  def findOneByTeamApiAndPlan(
      tenant: TenantId,
      team: TeamId,
      api: ApiId,
      plan: UsagePlanId
  )(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[ApiSubscription]] =
    selectOne(
      tenant,
      "content->>'team' = $2 AND content->>'api' = $3 " +
        "AND content->>'plan' = $4",
      Seq(team.value, api.value, plan.value)
    )

  def findByIdAndTeam(tenant: TenantId, id: String, team: TeamId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[ApiSubscription]] =
    selectOne(tenant, "_id = $2 AND content->>'team' = $3", Seq(id, team.value))

  /** Subscriptions sharing a keyring — the aggregation unit an Otoroshi apikey
    * is attached to.
    */
  def findByKeyring(tenant: TenantId, keyring: KeyringId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[ApiSubscription]] =
    select(tenant, "content->>'keyring' = $2", Seq(keyring.value))

  def findByKeyrings(tenant: TenantId, keyrings: Seq[KeyringId])(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[ApiSubscription]] =
    select(
      tenant,
      "content->>'keyring' = ANY($2::text[])",
      Seq(keyrings.map(_.value).toArray)
    )

  def findOneByKeyring(tenant: TenantId, keyring: KeyringId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[ApiSubscription]] =
    selectOne(tenant, "content->>'keyring' = $2", Seq(keyring.value))

  /** The other subscriptions of a keyring: what would keep its apikey alive if
    * this one went away.
    */
  def findKeyringSiblings(
      tenant: TenantId,
      keyring: KeyringId,
      excluding: ApiSubscriptionId
  )(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[ApiSubscription]] =
    select(
      tenant,
      "content->>'keyring' = $2 AND _id <> $3",
      Seq(keyring.value, excluding.value)
    )

  /** Resolves the subscription an Otoroshi apikey belongs to. */
  def findByApiKey(tenant: TenantId, clientId: String, clientSecret: String)(
      implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[ApiSubscription]] =
    select(
      tenant,
      "content->'apiKey'->>'clientId' = $2 " +
        "AND content->'apiKey'->>'clientSecret' = $3",
      Seq(clientId, clientSecret)
    )

  /** Subscriptions whose validity window has run out. */
  def findExpiredBefore(tenant: TenantId, millis: Long)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[ApiSubscription]] =
    select(
      tenant,
      "(content->>'validUntil')::bigint < $2",
      Seq(java.lang.Long.valueOf(millis))
    )

  def countByApi(tenant: TenantId, api: ApiId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] = countBy(tenant, "content->>'api' = $2", Seq(api.value))

  def countByKeyring(tenant: TenantId, keyring: KeyringId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] =
    countBy(tenant, "content->>'keyring' = $2", Seq(keyring.value))

  private def countBy(
      tenant: TenantId,
      predicate: String,
      params: Seq[AnyRef]
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Long] = {
    val repo = forTenant(tenant)
    repo.queryCount(
      s"SELECT COUNT(*) AS count FROM ${repo.tableName} " +
        s"WHERE $subscriptionScope AND $predicate",
      tenant.value +: params
    )
  }

  /** Turns a batch of subscriptions off — what deleting the keyring behind them
    * amounts to, before the queue removes them for good.
    */
  def disableByIds(tenant: TenantId, ids: Seq[ApiSubscriptionId])(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] = {
    val repo = forTenant(tenant)
    repo.execute(
      s"UPDATE ${repo.tableName} " +
        "SET content = jsonb_set(content, '{enabled}', 'false'::jsonb) " +
        "WHERE content->>'_tenant' = $1 AND _id = ANY($2::text[])",
      Seq(tenant.value, ids.map(_.value).toArray)
    )
  }

  /** Hands a subscription and its keyring siblings over to another team. */
  def moveToTeam(
      tenant: TenantId,
      ids: Seq[ApiSubscriptionId],
      team: TeamId
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Long] = {
    val repo = forTenant(tenant)
    repo.execute(
      s"UPDATE ${repo.tableName} " +
        "SET content = jsonb_set(content, '{team}', to_jsonb($3::text)) " +
        "WHERE content->>'_tenant' = $1 AND _id = ANY($2::text[])",
      Seq(tenant.value, ids.map(_.value).toArray, team.value)
    )
  }

  /** Propagates a keyring's apikey to every subscription that shares it. */
  def updateApiKeyOfKeyring(
      tenant: TenantId,
      keyring: KeyringId,
      apiKey: JsValue
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Long] = {
    val repo = forTenant(tenant)
    repo.execute(
      s"UPDATE ${repo.tableName} " +
        "SET content = jsonb_set(content, '{apiKey}', $3::jsonb) " +
        "WHERE content->>'_tenant' = $1 AND content->>'keyring' = $2",
      Seq(tenant.value, keyring.value, Json.stringify(apiKey))
    )
  }
}

trait KeyringRepo extends TenantCapableRepo[Keyring, KeyringId] {

  private val keyringScope: String =
    "content->>'_tenant' = $1 AND content->>'_deleted' = 'false'"

  def findByIdAndTeam(tenant: TenantId, id: String, team: TeamId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Keyring]] = {
    val repo = forTenant(tenant)
    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $keyringScope AND _id = $$2 AND content->>'team' = $$3 " +
        "LIMIT 1",
      Seq(tenant.value, id, team.value)
    )
  }

  /** Resolves the keyring holding an Otoroshi apikey. */
  def findByClientId(tenant: TenantId, clientId: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Keyring]] = {
    val repo = forTenant(tenant)
    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $keyringScope " +
        "AND content->'apiKey'->>'clientId' = $2 LIMIT 1",
      Seq(tenant.value, clientId)
    )
  }

  def findByApiKey(tenant: TenantId, clientId: String, clientSecret: String)(
      implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Keyring]] = {
    val repo = forTenant(tenant)
    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $keyringScope " +
        "AND content->'apiKey'->>'clientId' = $2 " +
        "AND content->'apiKey'->>'clientSecret' = $3",
      Seq(tenant.value, clientId, clientSecret)
    )
  }

  /** Cross-tenant variants: an Otoroshi client id and an integration token are
    * global, the caller has no tenant in hand when resolving them.
    */
  def findByClientIdForAllTenants(clientId: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Keyring]] = {
    val repo = forAllTenant()
    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        "WHERE content->>'_deleted' = 'false' " +
        "AND content->'apiKey'->>'clientId' = $1 LIMIT 1",
      Seq(clientId)
    )
  }

  def findByIntegrationTokenForAllTenants(token: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Keyring]] = {
    val repo = forAllTenant()
    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        "WHERE content->>'_deleted' = 'false' " +
        "AND content->>'integrationToken' = $1 LIMIT 1",
      Seq(token)
    )
  }

  /** The token a consumer uses to pull its apikey from the integration api. */
  def findByIntegrationToken(tenant: TenantId, token: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Keyring]] = {
    val repo = forTenant(tenant)
    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $keyringScope AND content->>'integrationToken' = $$2 LIMIT 1",
      Seq(tenant.value, token)
    )
  }
}

trait JobInformationRepo
    extends TenantCapableRepo[JobInformation, DatastoreId] {

  /** The last run of a job, whatever its outcome — how a job finds its cursor
    * before claiming the next batch.
    */
  def findLastRun(tenant: TenantId, jobName: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[JobInformation]] = {
    val repo = forTenant(tenant)
    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 AND content->>'jobName' = $2 " +
        "ORDER BY (content->>'startedAt')::bigint DESC LIMIT 1",
      Seq(tenant.value, jobName)
    )
  }

  /** A run still holding the lock, which is what stops a second one from
    * starting.
    */
  def findRunning(tenant: TenantId, jobName: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[JobInformation]] = {
    val repo = forTenant(tenant)
    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 AND content->>'_deleted' = 'false' " +
        "AND content->>'jobName' = $2 AND content->>'status' = $3 " +
        "LIMIT 1",
      Seq(tenant.value, jobName, JobStatus.Running.value)
    )
  }
}

trait ApiRepo extends TenantCapableRepo[Api, ApiId] {

  /** Raw SQL bypasses the tenant scoping of `forTenant`, so the `_tenant`
    * predicate is spelled out; it is bound to `$1` by convention.
    *
    * An api is versioned: `_humanReadableId` is shared by every version of the
    * same api, `currentVersion` tells them apart, `parent` is null on the
    * original one and `isDefault` marks the version served by default.
    */
  private val apiScope: String =
    "content->>'_tenant' = $1 AND content->>'_deleted' = 'false'"

  /** Matches an api by its id *or* its human readable id, both bound to `$n`.
    */
  private def idOrHrId(placeholder: Int): String =
    s"(_id = $$$placeholder OR content->>'_humanReadableId' = $$$placeholder)"

  private def select(tenant: TenantId, predicate: String, params: Seq[AnyRef])(
      implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Api]] = {
    val repo = forTenant(tenant)
    repo.query(
      s"SELECT content FROM ${repo.tableName} WHERE $apiScope AND $predicate",
      tenant.value +: params
    )
  }

  private def selectOne(
      tenant: TenantId,
      predicate: String,
      params: Seq[AnyRef]
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Option[Api]] = {
    val repo = forTenant(tenant)
    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $apiScope AND $predicate LIMIT 1",
      tenant.value +: params
    )
  }

  // ---------------------------------------------------------------- lookups

  def findByTeam(tenant: TenantId, team: TeamId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Api]] =
    select(tenant, "content->>'team' = $2", Seq(team.value))

  def findByIdAndTeam(tenant: TenantId, id: ApiId, team: TeamId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Api]] =
    selectOne(
      tenant,
      "_id = $2 AND content->>'team' = $3",
      Seq(id.value, team.value)
    )

  def findByIdOrHrIdAndTeam(tenant: TenantId, idOrHrid: String, team: TeamId)(
      implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Api]] =
    selectOne(
      tenant,
      s"${idOrHrId(2)} AND content->>'team' = $$3",
      Seq(idOrHrid, team.value)
    )

  def findByIdVersionAndTeam(
      tenant: TenantId,
      id: ApiId,
      version: String,
      team: TeamId
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Option[Api]] =
    selectOne(
      tenant,
      "_id = $2 AND content->>'currentVersion' = $3 " +
        "AND content->>'team' = $4",
      Seq(id.value, version, team.value)
    )

  def findByIdOrHrIdVersionAndTeam(
      tenant: TenantId,
      idOrHrid: String,
      version: String,
      team: TeamId
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Option[Api]] =
    selectOne(
      tenant,
      s"${idOrHrId(2)} AND content->>'currentVersion' = $$3 " +
        "AND content->>'team' = $4",
      Seq(idOrHrid, version, team.value)
    )

  def findByIdAndVersion(tenant: TenantId, id: ApiId, version: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Api]] =
    selectOne(
      tenant,
      "_id = $2 AND content->>'currentVersion' = $3",
      Seq(id.value, version)
    )

  /** Resolves one version of an api, addressed by id or human readable id. */
  def findByVersion(tenant: TenantId, idOrHrid: String, version: String)(
      implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Api]] =
    selectOne(
      tenant,
      s"${idOrHrId(2)} AND content->>'currentVersion' = $$3",
      Seq(idOrHrid, version)
    )

  /** The api a usage plan belongs to. */
  def findByPlan(tenant: TenantId, plan: UsagePlanId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Api]] =
    selectOne(
      tenant,
      "content->'possibleUsagePlans' @> to_jsonb($2::text)",
      Seq(plan.value)
    )

  // --------------------------------------------------------------- versions

  /** Every version of an api, `hrid` being what they share. */
  def findByHumanReadableId(tenant: TenantId, hrid: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Api]] =
    select(tenant, "content->>'_humanReadableId' = $2", Seq(hrid))

  def findOtherVersions(tenant: TenantId, hrid: String, excluding: String)(
      implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Api]] =
    select(
      tenant,
      "content->>'_humanReadableId' = $2 " +
        "AND content->>'currentVersion' <> $3",
      Seq(hrid, excluding)
    )

  /** Same, addressed by id *or* human readable id. */
  def findRootVersionByIdOrHrId(tenant: TenantId, idOrHrid: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Api]] =
    selectOne(
      tenant,
      s"${idOrHrId(2)} AND content->>'parent' IS NULL",
      Seq(idOrHrid)
    )

  /** The original version of an api — the only one without a `parent`. */
  def findRootVersion(tenant: TenantId, hrid: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Api]] =
    selectOne(
      tenant,
      "content->>'_humanReadableId' = $2 AND content->>'parent' IS NULL",
      Seq(hrid)
    )

  def existsVersion(tenant: TenantId, hrid: String, version: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Boolean] =
    selectOne(
      tenant,
      "content->>'_humanReadableId' = $2 " +
        "AND content->>'currentVersion' = $3",
      Seq(hrid, version)
    ).map(_.isDefined)

  /** Guards the uniqueness of a version when saving one. */
  def existsOtherVersion(
      tenant: TenantId,
      hrid: String,
      version: String,
      excluding: ApiId
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Boolean] =
    selectOne(
      tenant,
      "content->>'_humanReadableId' = $2 " +
        "AND content->>'currentVersion' = $3 AND _id <> $4",
      Seq(hrid, version, excluding.value)
    ).map(_.isDefined)

  /** The api that already bears this name, if any — what tells a name clash
    * from a legitimate new version.
    *
    * When `parent` is given, the api being saved is a new version, and the only
    * name-sharing api worth looking at is that parent: the caller accepts it
    * and refuses anybody else. Without a parent, any *other* api of the same
    * name is a clash.
    */
  def findAnotherWithName(
      tenant: TenantId,
      id: ApiId,
      name: String,
      parent: Option[ApiId]
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Option[Api]] =
    parent match {
      case Some(parentId) =>
        selectOne(
          tenant,
          "_id = $2 AND content->>'name' = $3",
          Seq(parentId.value, name)
        )
      case None =>
        selectOne(
          tenant,
          "_id <> $2 AND content->>'name' = $3",
          Seq(id.value, name)
        )
    }

  // ----------------------------------------------------------------- writes

  /** Makes one version the default one, clearing the flag on its siblings. */
  def clearDefaultVersionExcept(tenant: TenantId, hrid: String, keep: ApiId)(
      implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] = {
    val repo = forTenant(tenant)
    repo.execute(
      s"UPDATE ${repo.tableName} " +
        "SET content = jsonb_set(content, '{isDefault}', 'false'::jsonb) " +
        "WHERE content->>'_tenant' = $1 " +
        "AND content->>'_humanReadableId' = $2 AND _id <> $3",
      Seq(tenant.value, hrid, keep.value)
    )
  }

  /** Same, addressing the kept version by its version number. */
  def clearDefaultVersionExceptVersion(
      tenant: TenantId,
      hrid: String,
      keep: String
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Long] = {
    val repo = forTenant(tenant)
    repo.execute(
      s"UPDATE ${repo.tableName} " +
        "SET content = jsonb_set(content, '{isDefault}', 'false'::jsonb) " +
        "WHERE content->>'_tenant' = $1 " +
        "AND content->>'_humanReadableId' = $2 " +
        "AND content->>'currentVersion' <> $3",
      Seq(tenant.value, hrid, keep)
    )
  }

  /** Whether the name is already taken by another api — matched on the root
    * version, since a name maps to one `_humanReadableId` across versions.
    * `excluding` spares the api being saved (or its root).
    */
  def existsRootWithHumanReadableId(
      tenant: TenantId,
      hrid: String,
      excluding: Option[String]
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Boolean] = {
    val exclusion = if (excluding.isDefined) " AND _id <> $3" else ""
    selectOne(
      tenant,
      "content->>'_humanReadableId' = $2 " +
        s"AND content->>'parent' IS NULL$exclusion",
      Seq(hrid) ++ excluding.toSeq
    ).map(_.isDefined)
  }

  /** Re-hangs the versions of an api under a new root, when the current one is
    * removed.
    */
  def reparentVersions(
      tenant: TenantId,
      hrid: String,
      from: ApiId,
      to: ApiId
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Long] = {
    val repo = forTenant(tenant)
    repo.execute(
      s"UPDATE ${repo.tableName} " +
        "SET content = jsonb_set(content, '{parent}', to_jsonb($4::text)) " +
        s"WHERE $apiScope AND content->>'_humanReadableId' = $$2 " +
        "AND content->>'parent' = $3 AND _id <> $4",
      Seq(tenant.value, hrid, from.value, to.value)
    )
  }

  /** Renaming an api renames every one of its versions. */
  def renameHumanReadableId(tenant: TenantId, from: String, to: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] = {
    val repo = forTenant(tenant)
    repo.execute(
      s"UPDATE ${repo.tableName} " +
        "SET content = jsonb_set(content, '{_humanReadableId}', " +
        "  to_jsonb($3::text)) " +
        "WHERE content->>'_tenant' = $1 " +
        "AND content->>'_humanReadableId' = $2",
      Seq(tenant.value, from, to)
    )
  }

  /** Hands every version of an api over to another team. */
  def moveToTeam(tenant: TenantId, ids: Seq[ApiId], team: TeamId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] = {
    val repo = forTenant(tenant)
    repo.execute(
      s"UPDATE ${repo.tableName} " +
        "SET content = jsonb_set(content, '{team}', to_jsonb($3::text)) " +
        "WHERE content->>'_tenant' = $1 AND _id = ANY($2::text[])",
      Seq(tenant.value, ids.map(_.value).toArray, team.value)
    )
  }

  def deleteLogicallyByIds(tenant: TenantId, ids: Seq[ApiId])(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] = {
    val repo = forTenant(tenant)
    repo.execute(
      s"UPDATE ${repo.tableName} SET _deleted = true, " +
        "content = content || '{ \"_deleted\" : true }' " +
        s"WHERE $apiScope AND _id = ANY($$2::text[])",
      Seq(tenant.value, ids.map(_.value).toArray)
    )
  }

  // -------------------------------------------------------------- catalogue

  /** The apis a user may see, by visibility. `Private` additionally requires
    * one of the user's teams to be authorized.
    */
  def findByVisibility(
      tenant: TenantId,
      visibility: ApiVisibility,
      authorizedTeams: Option[Seq[TeamId]] = None,
      ids: Option[Seq[String]] = None
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Seq[Api]] = {
    val predicates = Seq.newBuilder[String] += "content->>'visibility' = $2"
    val params = Seq.newBuilder[AnyRef] += visibility.name
    var placeholder = 2

    authorizedTeams.foreach { teams =>
      placeholder += 1
      predicates +=
        s"content->'authorizedTeams' ?| $$$placeholder::text[]"
      params += teams.map(_.value).toArray
    }
    ids.foreach { values =>
      placeholder += 1
      predicates += s"_id = ANY($$$placeholder::text[])"
      params += values.toArray
    }

    select(tenant, predicates.result().mkString(" AND "), params.result())
  }

  /** The published states an api must be in to show up in a catalogue. */
  private val publishedStates: String =
    s"content->>'state' IN ('${ApiState.Published.name}', " +
      s"'${ApiState.Deprecated.name}')"

  /** The catalogue a team sees: published apis it may access, one entry per api
    * (the root version only), optionally narrowed to what it subscribed to.
    * `page` is a zero-based page index, not a row offset.
    */
  def findAccessibleByTeamPaginated(
      tenant: TenantId,
      team: TeamId,
      research: String,
      subscribedTo: Option[Seq[ApiId]],
      page: Int,
      pageSize: Int
  )(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[(Seq[Api], Long)] = {
    val repo = forTenant(tenant)
    val subscribedFilter =
      if (subscribedTo.isDefined) " AND _id = ANY($4::text[])" else ""

    repo.queryPaginated(
      s"SELECT content FROM ${repo.tableName} WHERE $apiScope " +
        "AND (content->>'visibility' = 'Public' " +
        "  OR content->'authorizedTeams' @> to_jsonb($2::text) " +
        "  OR content->>'team' = $2) " +
        s"AND $publishedStates " +
        // FIXME : could be a problem if parent is not published [#517]
        "AND content->>'parent' IS NULL " +
        s"AND content->>'name' ~* $$3$subscribedFilter " +
        "ORDER BY content->>'name' ASC",
      Seq(tenant.value, team.value, research) ++
        subscribedTo.map(_.map(_.value).toArray).toSeq,
      offset = page * pageSize,
      limit = pageSize
    )
  }

  /** Every published version of the given apis — the catalogue entries above
    * are roots, this brings back the versions behind them.
    */
  def findPublishedVersionsOf(
      tenant: TenantId,
      hrids: Seq[String],
      subscribedTo: Option[Seq[ApiId]]
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Seq[Api]] = {
    val subscribedFilter =
      if (subscribedTo.isDefined) " AND _id = ANY($3::text[])" else ""

    select(
      tenant,
      "content->>'_humanReadableId' = ANY($2::text[]) " +
        s"AND $publishedStates$subscribedFilter " +
        "ORDER BY content->>'name' ASC",
      Seq(hrids.toArray) ++ subscribedTo.map(_.map(_.value).toArray).toSeq
    )
  }

  /** The apis of a team, optionally narrowed to a set of ids. */
  def findByTeamAndIds(
      tenant: TenantId,
      team: TeamId,
      ids: Option[Seq[String]]
  )(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Api]] = {
    val idsFilter = if (ids.isDefined) " AND _id = ANY($3::text[])" else ""
    select(
      tenant,
      s"content->>'team' = $$2$idsFilter",
      Seq(team.value) ++ ids.map(_.toArray).toSeq
    )
  }

  def findAllVersions(tenant: Tenant, id: String)(implicit
      env: Env,
      ec: ExecutionContext
  ): Future[Seq[Api]] = {
    val o: OptionT[Future, Seq[Api]] = for {
      api <- OptionT(forTenant(tenant).findByIdOrHrId(id))
      apis <- OptionT.liftF(
        findByHumanReadableId(tenant.id, api.humanReadableId)
      )
    } yield apis

    o.value.map(_.getOrElse(Seq.empty))
  }
}

trait AuditTrailRepo extends TenantCapableRepo[JsObject, DatastoreId] {

  /** Audit events stay schemaless — `Of` is `JsObject` — so these methods still
    * return raw JSON; only the query surface is typed.
    */
  def findBetween(tenant: TenantId, from: Long, to: Long)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[JsObject]] = {
    val repo = forTenant(tenant)
    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 " +
        "AND (content->>'@timestamp')::bigint >= $2 " +
        "AND (content->>'@timestamp')::bigint <= $3 " +
        "ORDER BY (content->>'@timestamp')::bigint DESC",
      Seq(
        tenant.value,
        java.lang.Long.valueOf(from),
        java.lang.Long.valueOf(to)
      )
    )
  }

  /** The events a given actor produced, most recent first. */
  def findByUser(tenant: TenantId, userId: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[JsObject]] = {
    val repo = forTenant(tenant)
    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 AND content->>'@userId' = $2 " +
        "ORDER BY (content->>'@timestamp')::bigint DESC",
      Seq(tenant.value, userId)
    )
  }

  /** Drops the events older than a cut-off, across every tenant. */
  def deleteOlderThan(millis: Long)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] = {
    val repo = forAllTenant()
    repo.execute(
      s"DELETE FROM ${repo.tableName} " +
        "WHERE (content->>'@timestamp')::bigint < $1",
      Seq(java.lang.Long.valueOf(millis))
    )
  }
}

trait ConsumptionRepo
    extends TenantCapableRepo[ApiKeyConsumption, DatastoreId] {

  /** Raw SQL bypasses the tenant scoping of `forTenant`, so the `_tenant`
    * predicate is spelled out; it is bound to `$1` by convention.
    */
  private val consumptionScope: String =
    "content->>'_tenant' = $1 AND content->>'_deleted' = 'false'"

  /** A consumption covers the window `[from, to]`. Both bounds inside `[start,
    * end]` is the same thing as `from >= start AND to <= end`, since `from <=
    * to` always holds — the two spellings the former queries used were
    * equivalent.
    */
  private def windowSql(from: Int, to: Int): String =
    s"AND (content->>'from')::bigint >= $$$from " +
      s"AND (content->>'to')::bigint <= $$$to"

  private def millis(value: Long): AnyRef = java.lang.Long.valueOf(value)

  def findByClientIdBetween(
      tenant: TenantId,
      clientId: String,
      from: Long,
      to: Long
  )(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[ApiKeyConsumption]] = {
    val repo = forTenant(tenant)
    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $consumptionScope AND content->>'clientId' = $$2 " +
        s"${windowSql(3, 4)} ORDER BY (content->>'from')::bigint ASC",
      Seq(tenant.value, clientId, millis(from), millis(to))
    )
  }

  def findByApiBetween(
      tenant: TenantId,
      api: ApiId,
      plan: Option[UsagePlanId],
      from: Long,
      to: Long
  )(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[ApiKeyConsumption]] = {
    val repo = forTenant(tenant)
    val planFilter = if (plan.isDefined) " AND content->>'plan' = $5" else ""

    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $consumptionScope AND content->>'api' = $$2 " +
        s"${windowSql(3, 4)}$planFilter " +
        "ORDER BY (content->>'from')::bigint ASC",
      Seq(tenant.value, api.value, millis(from), millis(to)) ++
        plan.map(_.value).toSeq
    )
  }

  def findByTeamBetween(
      tenant: TenantId,
      team: TeamId,
      from: Long,
      to: Long
  )(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[ApiKeyConsumption]] = {
    val repo = forTenant(tenant)
    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $consumptionScope AND content->>'team' = $$2 " +
        s"${windowSql(3, 4)} ORDER BY (content->>'from')::bigint ASC",
      Seq(tenant.value, team.value, millis(from), millis(to))
    )
  }

  /** The most recent consumption of every apikey matching the filters — one row
    * per `clientId`, the one with the highest `from`.
    *
    * A single `DISTINCT ON` replaces the former two-pass implementation, which
    * grouped on `clientId` to get `MAX(content->>'from')` — a *textual* max —
    * then issued one query per client id to fetch the matching row, with
    * neither the tenant nor the original filters reapplied.
    *
    * `tenant` is optional: `None` looks across every tenant.
    */
  def findLastConsumptions(
      tenant: Option[TenantId],
      clientId: Option[String] = None,
      apis: Option[Seq[ApiId]] = None,
      team: Option[TeamId] = None,
      between: Option[(Long, Long)] = None
  )(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[ApiKeyConsumption]] = {
    val repo = tenant.map(forTenant).getOrElse(forAllTenant())
    val predicates = Seq.newBuilder[String] += "content->>'_deleted' = 'false'"
    val params = Seq.newBuilder[AnyRef]
    var placeholder = 0

    tenant.foreach { t =>
      placeholder += 1
      predicates += s"content->>'_tenant' = $$$placeholder"
      params += t.value
    }
    clientId.foreach { id =>
      placeholder += 1
      predicates += s"content->>'clientId' = $$$placeholder"
      params += id
    }
    apis.foreach { ids =>
      placeholder += 1
      predicates += s"content->>'api' = ANY($$$placeholder::text[])"
      params += ids.map(_.value).toArray
    }
    team.foreach { t =>
      placeholder += 1
      predicates += s"content->>'team' = $$$placeholder"
      params += t.value
    }
    between.foreach { case (from, to) =>
      predicates += s"(content->>'from')::bigint >= $$${placeholder + 1}"
      predicates += s"(content->>'to')::bigint <= $$${placeholder + 2}"
      placeholder += 2
      params += millis(from)
      params += millis(to)
    }

    repo.query(
      s"SELECT DISTINCT ON (content->>'clientId') content " +
        s"FROM ${repo.tableName} " +
        s"WHERE ${predicates.result().mkString(" AND ")} " +
        "ORDER BY content->>'clientId', (content->>'from')::bigint DESC",
      params.result()
    )
  }
}

trait TranslationRepo extends TenantCapableRepo[Translation, DatastoreId] {

  // No `_deleted` predicate below: `TranslationFormat` never writes the key.

  /** A translation is keyed by (key, language). */
  def findByKeyAndLanguage(tenant: TenantId, key: String, language: String)(
      implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Translation]] = {
    val repo = forTenant(tenant)
    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 " +
        "AND content->>'key' = $2 AND content->>'language' = $3 LIMIT 1",
      Seq(tenant.value, key, language)
    )
  }

  /** The translations attached to one entity.
    *
    * Beware: `Translation` is `(tenant, language, key, value)` — it has no
    * `element` field any more, so `content->'element'->>'id'` is always NULL
    * and this returns nothing. Its two callers, `TeamController.teamHome` and
    * `TenantController.getTenant`, therefore always answer an empty
    * `translation` object. Ported as-is: bringing it back means deciding how a
    * translation names the entity it belongs to, which the current model no
    * longer expresses.
    */
  def findByElement(tenant: TenantId, element: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Translation]] = {
    val repo = forTenant(tenant)
    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 " +
        "AND content->'element'->>'id' = $2",
      Seq(tenant.value, element)
    )
  }

  /** Keys matching a domain prefix, case-insensitively — the mail templates are
    * grouped that way.
    */
  def findByKeyPattern(tenant: TenantId, pattern: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Translation]] = {
    val repo = forTenant(tenant)
    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 " +
        "AND content->>'key' ~* $2",
      Seq(tenant.value, pattern)
    )
  }
}

trait MessageRepo extends TenantCapableRepo[Message, DatastoreId] {

  /** Raw SQL bypasses the tenant scoping of `forTenant`, so the `_tenant`
    * predicate is spelled out; it is bound to `$1` by convention.
    */
  /** No `_deleted` predicate here: `MessageFormat` never writes the key, so
    * `content->>'_deleted'` is always NULL and filtering on it would match
    * nothing. Chats are deleted physically.
    */
  private val messageScope: String = "content->>'_tenant' = $1"

  /** A chat is closed by stamping a date on every one of its messages; an open
    * one has no `closed` value at all.
    */
  private def closedSql(closed: Option[Long], placeholder: Int): String =
    if (closed.isDefined)
      s"(content->>'closed')::bigint = $$$placeholder"
    else "content->>'closed' IS NULL"

  /** Membership of one of the JSON arrays of user ids (`participants`,
    * `readBy`).
    */
  private def containsUser(field: String, placeholder: Int): String =
    s"content->'$field' @> to_jsonb($$$placeholder::text)"

  /** The messages of the chats a user takes part in — every open one, or a
    * single chat when `chat` is given.
    */
  def findChatMessages(
      tenant: TenantId,
      participant: UserId,
      chat: Option[String],
      closed: Option[Long]
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Seq[Message]] = {
    val repo = forTenant(tenant)
    val (chatFilter, params) = chat match {
      case Some(c) =>
        (
          s" AND content->>'chat' = $$3 AND ${closedSql(closed, 4)}",
          Seq(tenant.value, participant.value, c) ++
            closed.map(millis).toSeq
        )
      case None =>
        (
          " AND content->>'closed' IS NULL",
          Seq(tenant.value, participant.value)
        )
    }

    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $messageScope AND ${containsUser("participants", 2)}$chatFilter",
      params
    )
  }

  /** The chat a user holds with the tenant administrators. */
  def findAdminChatMessages(
      tenant: TenantId,
      user: UserId,
      closed: Option[Long]
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Seq[Message]] = {
    val repo = forTenant(tenant)
    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $messageScope AND content->>'chat' = $$2 " +
        "AND content->'messageType'->>'type' = 'tenant' " +
        s"AND ${closedSql(closed, 3)}",
      Seq(tenant.value, user.value) ++ closed.map(millis).toSeq
    )
  }

  /** The last message of an open chat before a given instant — used to decide
    * whether a notification mail is due.
    */
  def findLastOpenMessageBefore(tenant: TenantId, chat: UserId, before: Long)(
      implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Message]] = {
    val repo = forTenant(tenant)
    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $messageScope AND content->>'chat' = $$2 " +
        "AND content->>'closed' IS NULL " +
        "AND (content->>'date')::bigint < $3 " +
        "ORDER BY (content->>'date')::bigint DESC LIMIT 1",
      Seq(tenant.value, chat.value, millis(before))
    )
  }

  def closeChat(tenant: TenantId, chat: String, closedAt: Long)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] = {
    val repo = forTenant(tenant)
    repo.execute(
      s"UPDATE ${repo.tableName} " +
        "SET content = jsonb_set(content, '{closed}', to_jsonb($3::bigint)) " +
        s"WHERE $messageScope AND content->>'chat' = $$2 " +
        "AND content->>'closed' IS NULL",
      Seq(tenant.value, chat, millis(closedAt))
    )
  }

  /** Adds a user to the `readBy` of every message of a chat they have not read
    * yet. The `@>` guard matters: the former `readBy` guard compared the
    * *whole* array rendered as text against a single id, so it was always true
    * and the id was appended again on every read.
    */
  def markAsRead(tenant: TenantId, chat: String, user: UserId, before: Long)(
      implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] = {
    val repo = forTenant(tenant)
    repo.execute(
      s"UPDATE ${repo.tableName} " +
        "SET content = jsonb_set(content, '{readBy}', " +
        "  (content->'readBy') || to_jsonb($3::text)) " +
        s"WHERE $messageScope AND content->>'chat' = $$2 " +
        s"AND NOT ${containsUser("readBy", 3)} " +
        "AND (content->>'date')::bigint < $4",
      Seq(tenant.value, chat, user.value, millis(before))
    )
  }

  /** When a chat was last closed, before a given instant. */
  def lastClosedChatDate(tenant: TenantId, chat: String, before: Long)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Long]] = {
    val repo = forTenant(tenant)
    repo
      .queryOne(
        s"SELECT content FROM ${repo.tableName} " +
          s"WHERE $messageScope AND content->>'chat' = $$2 " +
          "AND (content->>'closed')::bigint < $3 " +
          "ORDER BY (content->>'closed')::bigint DESC LIMIT 1",
        Seq(tenant.value, chat, millis(before))
      )
      .map(_.flatMap(_.closed).map(_.getMillis))
  }

  private def millis(value: Long): AnyRef = java.lang.Long.valueOf(value)
}

trait CmsPageRepo extends TenantCapableRepo[CmsPage, CmsPageId] {

  /** Raw SQL bypasses the tenant scoping of `forTenant`, so the `_tenant`
    * predicate is spelled out; it is bound to `$1` by convention.
    */
  private val cmsScope: String =
    "content->>'_tenant' = $1 AND content->>'_deleted' = 'false'"

  /** The page served at a given url path. */
  def findByPath(tenant: TenantId, path: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[CmsPage]] = {
    val repo = forTenant(tenant)
    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $cmsScope AND content->>'path' = $$2 LIMIT 1",
      Seq(tenant.value, path)
    )
  }

  def findByName(tenant: TenantId, name: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[CmsPage]] = {
    val repo = forTenant(tenant)
    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $cmsScope AND content->>'name' = $$2 LIMIT 1",
      Seq(tenant.value, name)
    )
  }

  def deleteByPath(tenant: TenantId, path: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] = {
    val repo = forTenant(tenant)
    repo.execute(
      s"DELETE FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 AND content->>'path' = $2",
      Seq(tenant.value, path)
    )
  }

  /** Resolves a page from a reference that may be an id or a path, in the
    * spellings the CMS renderer accepts: `/a/b`, `-a-b` and `a-b`. `byPath`
    * additionally matches the `path` field itself.
    */
  def findByIdOrPathVariants(
      tenant: TenantId,
      reference: String,
      byPath: Boolean
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Option[CmsPage]] = {
    val repo = forTenant(tenant)
    val dashed = reference.replace("/", "-")
    val (predicate, params) =
      if (byPath)
        (
          "(content->>'path' = $2 OR _id = $3 OR _id = $4)",
          Seq(tenant.value, reference, reference, dashed)
        )
      else
        (
          "(_id = $2 OR _id = $3 OR _id = $4)",
          Seq(
            tenant.value,
            reference,
            dashed,
            if (dashed.isEmpty) dashed else dashed.substring(1)
          )
        )

    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE $cmsScope AND $predicate LIMIT 1",
      params
    )
  }

  /** The GraphQL `pages` / `page` fields let an admin list the *deleted* pages
    * too, so `deleted` is an explicit filter here rather than the usual
    * not-deleted default.
    */
  def findAllWithDeletedFlag(tenant: TenantId, deleted: Boolean)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[CmsPage]] = {
    val repo = forTenant(tenant)
    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 AND content->>'_deleted' = $2",
      Seq(tenant.value, deleted.toString)
    )
  }

  def findOneByNameOrPath(
      tenant: TenantId,
      name: Option[String],
      path: Option[String],
      deleted: Boolean
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Option[CmsPage]] = {
    val repo = forTenant(tenant)
    val predicates = Seq.newBuilder[String]
    val params = Seq.newBuilder[AnyRef]
    var placeholder = 2
    params += tenant.value += deleted.toString

    name.foreach { value =>
      placeholder += 1
      predicates += s"content->>'name' = $$$placeholder"
      params += value
    }
    path.foreach { value =>
      placeholder += 1
      predicates += s"content->>'path' = $$$placeholder"
      params += value
    }

    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 AND content->>'_deleted' = $2 " +
        predicates.result().map(p => s"AND $p ").mkString +
        "LIMIT 1",
      params.result()
    )
  }
}

trait AssetRepo extends TenantCapableRepo[Asset, AssetId] {

  /** An asset is addressed by its slug in urls, not by its id. Raw SQL bypasses
    * the tenant scoping of `forTenant`, so `_tenant` is spelled out — and no
    * `_deleted` predicate, since `AssetFormat` never writes the key.
    */
  def findBySlug(tenant: TenantId, slug: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Asset]] = {
    val repo = forTenant(tenant)
    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 AND content->>'slug' = $2 LIMIT 1",
      Seq(tenant.value, slug)
    )
  }
}

trait OperationRepo extends TenantCapableRepo[Operation, DatastoreId] {

  /** The operations still to be carried out by the deletion queue. */
  def findPending(tenant: TenantId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Operation]] = {
    val repo = forTenant(tenant)
    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 AND content->>'status' = ANY($2::text[])",
      Seq(
        tenant.value,
        Array(OperationStatus.Idle.name, OperationStatus.InProgress.name)
      )
    )
  }

  /** Whether the queue is already busy, across every tenant.
    *
    * Note the field name: the former query read `Status`, capital S, while an
    * `Operation` writes `status`. `content->>'Status'` is always NULL, so this
    * guard was always false and the queue could pick up a second operation
    * while one was still running.
    */
  def existsInProgress()(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Boolean] = {
    val repo = forAllTenant()
    repo
      .queryOne(
        s"SELECT content FROM ${repo.tableName} " +
          s"WHERE content->>'status' = '${OperationStatus.InProgress.name}' " +
          "LIMIT 1"
      )
      .map(_.isDefined)
  }

  /** The next operation waiting to be picked up, across every tenant. */
  def findFirstIdle()(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Operation]] = {
    val repo = forAllTenant()
    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        s"WHERE content->>'status' = '${OperationStatus.Idle.name}' LIMIT 1"
    )
  }
}

trait SubscriptionDemandRepo
    extends TenantCapableRepo[SubscriptionDemand, DemandId] {

  /** Demands in one of the given states, optionally narrowed to a set of apis
    * or teams. `None` means "no filter on that dimension"; `Some(Seq.empty)`
    * matches nothing, the way the former empty `$in` did.
    *
    * Raw SQL bypasses the tenant scoping of `forTenant`, so `_tenant` is
    * spelled out and bound to `$1`.
    */
  private def byStatesWhere(
      tenant: TenantId,
      states: Seq[SubscriptionDemandState],
      apis: Option[Seq[ApiId]],
      teams: Option[Seq[TeamId]],
      plan: Option[UsagePlanId]
  ): (String, Seq[AnyRef]) = {
    val predicates = Seq.newBuilder[String] +=
      "content->>'_tenant' = $1" += "content->>'_deleted' = 'false'" +=
      "content->>'state' = ANY($2::text[])"
    val params = Seq.newBuilder[AnyRef] +=
      tenant.value += states.map(_.name).toArray
    var placeholder = 2

    apis.foreach { ids =>
      placeholder += 1
      predicates += s"content->>'api' = ANY($$$placeholder::text[])"
      params += ids.map(_.value).toArray
    }
    teams.foreach { ids =>
      placeholder += 1
      predicates += s"content->>'team' = ANY($$$placeholder::text[])"
      params += ids.map(_.value).toArray
    }
    plan.foreach { id =>
      placeholder += 1
      predicates += s"content->>'plan' = $$$placeholder"
      params += id.value
    }

    (predicates.result().mkString(" AND "), params.result())
  }

  def findByStates(
      tenant: TenantId,
      states: Seq[SubscriptionDemandState],
      apis: Option[Seq[ApiId]] = None,
      teams: Option[Seq[TeamId]] = None,
      plan: Option[UsagePlanId] = None
  )(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[SubscriptionDemand]] = {
    val repo = forTenant(tenant)
    val (where, params) = byStatesWhere(tenant, states, apis, teams, plan)
    repo.query(
      s"SELECT content FROM ${repo.tableName} WHERE $where",
      params
    )
  }

  /** Moves every demand of a plan from one state to another — used to freeze
    * the demands in flight while their plan is being updated, then release
    * them.
    */
  def changeState(
      tenant: TenantId,
      api: ApiId,
      plan: UsagePlanId,
      from: SubscriptionDemandState,
      to: SubscriptionDemandState
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Long] = {
    val repo = forTenant(tenant)
    repo.execute(
      s"UPDATE ${repo.tableName} " +
        "SET content = jsonb_set(content, '{state}', to_jsonb($5::text)) " +
        "WHERE content->>'_tenant' = $1 AND content->>'api' = $2 " +
        "AND content->>'plan' = $3 AND content->>'state' = $4",
      Seq(tenant.value, api.value, plan.value, from.name, to.name)
    )
  }

  /** `page` is a zero-based page index, not a row offset — the GraphQL `offset`
    * argument it comes from has always been multiplied by `pageSize`.
    */
  def findByStatesPaginated(
      tenant: TenantId,
      states: Seq[SubscriptionDemandState],
      apis: Option[Seq[ApiId]] = None,
      teams: Option[Seq[TeamId]] = None,
      page: Int,
      pageSize: Int
  )(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[(Seq[SubscriptionDemand], Long)] = {
    val repo = forTenant(tenant)
    val (where, params) = byStatesWhere(tenant, states, apis, teams, None)
    repo.queryPaginated(
      s"SELECT content FROM ${repo.tableName} WHERE $where ORDER BY _id ASC",
      params,
      offset = page * pageSize,
      limit = pageSize
    )
  }
}

trait StepValidatorRepo extends TenantCapableRepo[StepValidator, DatastoreId] {

  /** A validator is reached by the one-shot token sent in the validation mail.
    */
  def findByToken(tenant: TenantId, token: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[StepValidator]] = {
    val repo = forTenant(tenant)
    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 AND content->>'_deleted' = 'false' " +
        "AND content->>'token' = $2 LIMIT 1",
      Seq(tenant.value, token)
    )
  }

  /** Validators of a step, among a set of demands. */
  def findByDemandsAndStep(
      tenant: TenantId,
      demands: Seq[DemandId],
      step: String
  )(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[StepValidator]] = {
    val repo = forTenant(tenant)
    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 AND content->>'_deleted' = 'false' " +
        "AND content->>'subscriptionDemand' = ANY($2::text[]) " +
        "AND content->>'step' = $3",
      Seq(tenant.value, demands.map(_.value).toArray, step)
    )
  }

  def deleteByStep(tenant: TenantId, step: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] = {
    val repo = forTenant(tenant)
    repo.execute(
      s"DELETE FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 AND content->>'step' = $2",
      Seq(tenant.value, step)
    )
  }

  def deleteByDemand(tenant: TenantId, demand: DemandId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] = {
    val repo = forTenant(tenant)
    repo.execute(
      s"DELETE FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 " +
        "AND content->>'subscriptionDemand' = $2",
      Seq(tenant.value, demand.value)
    )
  }
}

trait UsagePlanRepo extends TenantCapableRepo[UsagePlan, UsagePlanId] {

  /** A plan does not name its api: the relation is carried the other way round,
    * by `Api.possibleUsagePlans`.
    */
  def findByApi(tenant: TenantId, api: Api)(implicit
      env: Env,
      ec: ExecutionContext
  ): Future[Seq[UsagePlan]] =
    forTenant(tenant).findByIds(api.possibleUsagePlans)

  /** Plans still pointing at one of the given tenant settings — what forbids
    * removing an Otoroshi or a payment provider from a tenant.
    */
  def findByOtoroshiSettings(tenant: TenantId, settings: Seq[String])(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[UsagePlan]] = {
    val repo = forTenant(tenant)
    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 AND content->>'_deleted' = 'false' " +
        "AND content->'otoroshiTarget'->>'otoroshiSettings' = " +
        "  ANY($2::text[])",
      Seq(tenant.value, settings.toArray)
    )
  }

  def findByPaymentSettings(tenant: TenantId, settings: Seq[String])(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[UsagePlan]] = {
    val repo = forTenant(tenant)
    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 AND content->>'_deleted' = 'false' " +
        "AND content->'paymentSettings'->>'thirdPartyPaymentSettingsId' = " +
        "  ANY($2::text[])",
      Seq(tenant.value, settings.toArray)
    )
  }

  /** Plans are named after the environment they target when the tenant runs in
    * environment mode, so removing an environment means finding what still uses
    * its name.
    */
  def findByCustomName(tenant: TenantId, customName: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[UsagePlan]] = {
    val repo = forTenant(tenant)
    repo.query(
      s"SELECT content FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 AND content->>'_deleted' = 'false' " +
        "AND content->>'customName' = $2",
      Seq(tenant.value, customName)
    )
  }
}

trait EmailVerificationRepo
    extends TenantCapableRepo[EmailVerification, DatastoreId] {

  /** The pending verification a user follows from their mail. Note the explicit
    * `_tenant` predicate: raw SQL bypasses the scoping that `forTenant` applies
    * to the generic helpers.
    */
  def findByRandomId(tenant: TenantId, randomId: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[EmailVerification]] = {
    val repo = forTenant(tenant)
    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 AND content->>'_deleted' = 'false' " +
        "AND content->>'randomId' = $2 LIMIT 1",
      Seq(tenant.value, randomId)
    )
  }

  def deleteByTeam(tenant: TenantId, team: TeamId)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] = {
    val repo = forTenant(tenant)
    repo.execute(
      s"DELETE FROM ${repo.tableName} " +
        "WHERE content->>'teamId' = $1 AND content->>'_tenant' = $2",
      Seq(team.value, tenant.value)
    )
  }
}

trait DataStore {
  def start(): Future[Unit]

  def stop(): Future[Unit]

  def isEmpty(): Future[Boolean]

  def tenantRepo: TenantRepo

  def userRepo: UserRepo

  def teamRepo: TeamRepo

  def apiRepo: ApiRepo

  def apiSubscriptionRepo: ApiSubscriptionRepo

  def keyringRepo: KeyringRepo

  def apiDocumentationPageRepo: ApiDocumentationPageRepo

  def apiPostRepo: ApiPostRepo

  def apiIssueRepo: ApiIssueRepo

  def notificationRepo: NotificationRepo

  def userSessionRepo: UserSessionRepo

  def auditTrailRepo: AuditTrailRepo

  def consumptionRepo: ConsumptionRepo

  def translationRepo: TranslationRepo

  def passwordResetRepo: PasswordResetRepo

  def accountCreationRepo: AccountCreationRepo

  def messageRepo: MessageRepo

  def cmsRepo: CmsPageRepo

  def assetRepo: AssetRepo

  def operationRepo: OperationRepo

  def emailVerificationRepo: EmailVerificationRepo

  def evolutionRepo: EvolutionRepo

  def subscriptionDemandRepo: SubscriptionDemandRepo

  def stepValidatorRepo: StepValidatorRepo

  def usagePlanRepo: UsagePlanRepo

  def reportsInfoRepo: ReportsInfoRepo

  def apiSubscriptionTransferRepo: ApiSubscriptionTransferRepo

  def JobInformationRepo: JobInformationRepo

  def exportAsStream(pretty: Boolean, exportAuditTrail: Boolean = true)(implicit
      ec: ExecutionContext,
      mat: Materializer,
      env: Env
  ): Source[ByteString, ?]

  def importFromStream(source: Source[ByteString, ?]): Future[Unit]

  def clear(): Future[Unit]

  def queryOneRaw(query: String, name: String, params: Seq[AnyRef] = Seq.empty)(
      implicit ec: ExecutionContext
  ): Future[Option[JsValue]]

  def queryRaw(query: String, name: String, params: Seq[AnyRef] = Seq.empty)(
      implicit ec: ExecutionContext
  ): Future[Seq[JsValue]]

  def queryString(query: String, name: String, params: Seq[AnyRef] = Seq.empty)(
      implicit ec: ExecutionContext
  ): Future[Seq[String]]

  // Runs f inside a single DB transaction.  All Repo calls inside f
  // automatically receive ActiveConn(conn) via the implicit DbConn —
  // no changes required at the call sites inside f.
  def withTransaction[A](f: DbConn ?=> Future[A])(implicit
      ec: ExecutionContext
  ): Future[A]
}
