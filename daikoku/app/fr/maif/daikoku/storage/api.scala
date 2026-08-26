package fr.maif.daikoku.storage

import cats.data.OptionT
import fr.maif.daikoku.domain._
import fr.maif.daikoku.env.Env
import io.vertx.sqlclient.SqlConnection
import org.apache.pekko.NotUsed
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

  def count(
      query: JsObject
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Long]

  // Streaming methods are intentionally excluded from DbConn: they return a
  // lazy Source that materialises outside any transaction window.
  def streamAllRaw(query: JsObject = Json.obj())(implicit
      ec: ExecutionContext
  ): Source[JsValue, NotUsed]

  def streamAllRawFormatted(query: JsObject = Json.obj())(implicit
      ec: ExecutionContext
  ): Source[Of, NotUsed]

  def findRaw(
      query: JsObject,
      sort: Option[JsObject] = None,
      maxDocs: Int = -1
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Seq[JsValue]]

  def find(query: JsObject, sort: Option[JsObject] = None, maxDocs: Int = -1)(
      implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Of]]

  def findWithProjection(query: JsObject, projection: JsObject)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[JsObject]]

  def findOneRaw(query: JsObject)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[JsValue]]

  def findOne(query: JsObject)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Of]]

  def findOneWithProjection(query: JsObject, projection: JsObject)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[JsObject]]

  def findWithPagination(
      query: JsObject,
      page: Int,
      pageSize: Int,
      sort: Option[JsObject] = None,
      order: Option[SortingOrder] = None
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[(Seq[Of], Long)]

  def delete(
      query: JsObject
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Boolean]

  def save(
      value: Of
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Boolean] = {
    val payload = format.writes(value).as[JsObject]
    save(Json.obj("_id" -> extractId(value)), payload)
  }

  def save(query: JsObject, value: JsObject)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Boolean]

  def insertMany(
      values: Seq[Of]
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Long]

  def updateMany(query: JsObject, Value: JsObject)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long]

  def updateManyByQuery(query: JsObject, queryUpdate: JsObject)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long]

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

  def exists(
      query: JsObject
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Boolean]

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Generic helpers.  Their bodies are plain parameterised SQL run through the
  // primitives below (`query` / `queryOne` / `execute` / `queryExists`): no
  // Mongo-style JsObject query is built, and every value goes through `params`.
  //
  // Beware: those primitives run the SQL exactly as written, so the tenant
  // scoping added by `forTenant` is NOT injected for free.  Every helper here
  // therefore builds its WHERE clause with `scopedWhere`, which appends
  // `content->>'_tenant' = $n` when the repo is tenant-scoped.

  /** Tenant this repo is scoped to, when it was obtained through `forTenant`.
    */
  protected def tenantScope: Option[String] = None

  /** Matches the entities not logically deleted, the way the former JsObject
    * query `{"_deleted": false}` did: an entity without a `_deleted` key does
    * not match.
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

  def deleteLogically(query: JsObject)(implicit
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

  def findNotDeleted(
      query: JsObject,
      maxDocs: Int = -1,
      sort: Option[JsObject] = None
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Seq[Of]] =
    find(query ++ Json.obj("_deleted" -> false), maxDocs = maxDocs, sort = sort)

  def findOneNotDeletedRaw(
      query: JsObject
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Option[JsValue]] =
    findOneRaw(query ++ Json.obj("_deleted" -> false))

  def findOneNotDeleted(
      query: JsObject
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Option[Of]] =
    findOne(query ++ Json.obj("_deleted" -> false))

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

  // NB: like the JsObject-based `delete` it replaces, this reports success
  // regardless of the number of rows actually removed.
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
    extends TenantCapableRepo[ApiSubscriptionTransfer, DatastoreId]

trait TeamRepo extends TenantCapableRepo[Team, TeamId] {

  /** Raw SQL bypasses the tenant scoping that `forTenant` adds to the JsObject
    * query methods, so every method here spells the `_tenant` predicate out. By
    * convention it is bound to `$1`, and the other values follow.
    */
  private val teamScope: String =
    "content->>'_tenant' = $1 AND content->>'_deleted' = 'false'"

  /** Membership predicate on the JSON `users` array — the SQL form of the
    * former `{"users.userId": …}` query.
    */
  private def isMemberSql(placeholder: Int): String =
    "EXISTS (SELECT 1 FROM jsonb_array_elements(content->'users') AS u " +
      s"WHERE u->>'userId' = $$$placeholder)"

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
    extends TenantCapableRepo[ApiSubscription, ApiSubscriptionId]

trait KeyringRepo extends TenantCapableRepo[Keyring, KeyringId]

trait JobInformationRepo extends TenantCapableRepo[JobInformation, DatastoreId]

trait ApiRepo extends TenantCapableRepo[Api, ApiId] {
  def findByVersion(tenant: Tenant, id: String, version: String)(implicit
      env: Env,
      ec: ExecutionContext
  ): Future[Option[Api]] = {
    val query = Json.obj(
      "currentVersion" -> version,
      "$or" -> Json
        .arr(Json.obj("_id" -> id), Json.obj("_humanReadableId" -> id))
    )

    env.dataStore.apiRepo.forTenant(tenant.id).findOneNotDeleted(query)
  }

  def findAllVersions(tenant: Tenant, id: String)(implicit
      env: Env,
      ec: ExecutionContext
  ): Future[Seq[Api]] = {

    val o: OptionT[Future, Seq[Api]] = for {
      api <- OptionT(
        env.dataStore.apiRepo.forTenant(tenant).findByIdOrHrId(id)
      )
      apis <- OptionT.liftF(
        env.dataStore.apiRepo
          .forTenant(tenant)
          .findNotDeleted(Json.obj("_humanReadableId" -> api.humanReadableId))
      )
    } yield apis

    o.value.map(_.getOrElse(Seq.empty))
  }
}

trait AuditTrailRepo extends TenantCapableRepo[JsObject, DatastoreId]

trait ConsumptionRepo
    extends TenantCapableRepo[ApiKeyConsumption, DatastoreId] {

  /** Raw SQL bypasses the tenant scoping of `forTenant`, so the `_tenant`
    * predicate is spelled out; it is bound to `$1` by convention.
    */
  private val consumptionScope: String =
    "content->>'_tenant' = $1 AND content->>'_deleted' = 'false'"

  /** A consumption covers the window `[from, to]`. Both bounds inside `[start,
    * end]` is the same thing as `from >= start AND to <= end`, since `from <=
    * to` always holds — the two spellings the JsObject queries used were
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

trait TranslationRepo extends TenantCapableRepo[Translation, DatastoreId]

trait MessageRepo extends TenantCapableRepo[Message, DatastoreId] {

  /** Raw SQL bypasses the tenant scoping of `forTenant`, so the `_tenant`
    * predicate is spelled out; it is bound to `$1` by convention.
    */
  private val messageScope: String =
    "content->>'_tenant' = $1 AND content->>'_deleted' = 'false'"

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
    * yet. The `@>` guard matters: the former `{"readBy": {"$ne": …}}` compared
    * the *whole* array rendered as text against a single id, so it was always
    * true and the id was appended again on every read.
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
    * the tenant scoping of `forTenant`, so `_tenant` is spelled out.
    */
  def findBySlug(tenant: TenantId, slug: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Asset]] = {
    val repo = forTenant(tenant)
    repo.queryOne(
      s"SELECT content FROM ${repo.tableName} " +
        "WHERE content->>'_tenant' = $1 AND content->>'_deleted' = 'false' " +
        "AND content->>'slug' = $2 LIMIT 1",
      Seq(tenant.value, slug)
    )
  }
}

trait OperationRepo extends TenantCapableRepo[Operation, DatastoreId]

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

trait StepValidatorRepo extends TenantCapableRepo[StepValidator, DatastoreId]

trait UsagePlanRepo extends TenantCapableRepo[UsagePlan, UsagePlanId] {

  /** A plan does not name its api: the relation is carried the other way round,
    * by `Api.possibleUsagePlans`.
    */
  def findByApi(tenant: TenantId, api: Api)(implicit
      env: Env,
      ec: ExecutionContext
  ): Future[Seq[UsagePlan]] =
    forTenant(tenant).findByIds(api.possibleUsagePlans)

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

  /** Note the explicit `_tenant` predicate: raw SQL bypasses the tenant scoping
    * that `forTenant` adds to the JsObject query methods.
    */
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
