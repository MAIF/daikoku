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

  def findMaxByQuery(query: JsObject = Json.obj(), field: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Long]]

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

  def findByIdOrHrIdNotDeleted(id: String, hrid: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Of]] =
    findOneByIdOrHrId(id, hrid)

  def findByIdOrHrIdNotDeleted(id: Id, hrid: String)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Of]] =
    findOneByIdOrHrId(id.value, hrid)

  def findByIdOrHrIdNotDeleted(
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

  def findAllNotDeleted()(implicit
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

  def findByIdNotDeleted(
      id: String
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Option[Of]] = {
    val (where, params) =
      scopedWhere(Seq(s"_id = $$1", notDeletedSql), Seq(id))
    queryOne(s"SELECT content FROM $tableName$where LIMIT 1", params)
  }

  def findByIdNotDeleted(
      id: Id
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Option[Of]] = {
    findByIdNotDeleted(id.value)
  }

  def findById(
      id: String
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Option[Of]] = {
    val (where, params) = scopedWhere(Seq(s"_id = $$1"), Seq(id))
    queryOne(s"SELECT content FROM $tableName$where LIMIT 1", params)
  }

  def findById(
      id: Id
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Option[Of]] =
    findById(id.value)

  def findByIds(
      ids: Seq[Id]
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Seq[Of]] = {
    val (where, params) = scopedWhere(
      Seq(s"_id = ANY($$1::text[])"),
      Seq(ids.map(_.value).toArray)
    )
    query(s"SELECT content FROM $tableName$where", params)
  }

  def findByIdsNotDeleted(
      ids: Seq[Id]
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Seq[Of]] = {
    val (where, params) = scopedWhere(
      Seq(s"_id = ANY($$1::text[])", notDeletedSql),
      Seq(ids.map(_.value).toArray)
    )
    query(s"SELECT content FROM $tableName$where", params)
  }

  def findAll()(implicit
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
  def myTeams(tenant: Tenant, user: User)(implicit
      env: Env,
      ec: ExecutionContext
  ): Future[Seq[Team]] = {
    val typeFilter =
      if (
        tenant.subscriptionSecurity.isDefined
        && tenant.subscriptionSecurity.exists(identity)
      ) {
        Json.obj(
          "type" -> Json.obj("$ne" -> TeamType.Personal.name)
        )
      } else {
        Json.obj()
      }
    if (user.isDaikokuAdmin) {
      env.dataStore.teamRepo
        .forTenant(tenant.id)
        .findNotDeleted(
          typeFilter
        )

    } else {
      env.dataStore.teamRepo
        .forTenant(tenant.id)
        .findNotDeleted(
          Json.obj("users.userId" -> user.id.value) ++ typeFilter
        )
    }
  }
}

trait NotificationRepo extends TenantCapableRepo[Notification, NotificationId]

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
        env.dataStore.apiRepo.forTenant(tenant).findByIdOrHrIdNotDeleted(id)
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
  def getLastConsumptionsforAllTenant(filter: JsObject)(implicit
      ec: ExecutionContext
  ): Future[Seq[ApiKeyConsumption]]

  def getLastConsumptionsForTenant(tenantId: TenantId, filter: JsObject)(
      implicit ec: ExecutionContext
  ): Future[Seq[ApiKeyConsumption]]

  def getLastConsumption(tenant: Tenant, query: JsObject)(implicit
      ec: ExecutionContext
  ): Future[Option[ApiKeyConsumption]] = {
    getLastConsumptionsForTenant(tenant.id, query).map(_.headOption)
  }
}

trait TranslationRepo extends TenantCapableRepo[Translation, DatastoreId]

trait MessageRepo extends TenantCapableRepo[Message, DatastoreId]

trait CmsPageRepo extends TenantCapableRepo[CmsPage, CmsPageId]

trait AssetRepo extends TenantCapableRepo[Asset, AssetId]

trait OperationRepo extends TenantCapableRepo[Operation, DatastoreId]

trait SubscriptionDemandRepo
    extends TenantCapableRepo[SubscriptionDemand, DemandId]

trait StepValidatorRepo extends TenantCapableRepo[StepValidator, DatastoreId]

trait UsagePlanRepo extends TenantCapableRepo[UsagePlan, UsagePlanId] {
  def findByApi(tenant: TenantId, api: Api)(implicit
      env: Env,
      ec: ExecutionContext
  ): Future[Seq[UsagePlan]] = {
    env.dataStore.usagePlanRepo
      .forTenant(tenant)
      .find(
        Json.obj(
          "_id" -> Json
            .obj("$in" -> JsArray(api.possibleUsagePlans.map(_.asJson)))
        )
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
