package storage

import akka.NotUsed
import akka.stream.Materializer
import akka.stream.scaladsl.Source
import akka.util.ByteString
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import play.api.libs.json._
import reactivemongo.api.commands.WriteResult
import reactivemongo.api.indexes.Index
import reactivemongo.play.json.collection.JSONCollection

import scala.concurrent.{ExecutionContext, Future}

trait TenantCapableRepo[Of, Id <: ValueType] {
  def forTenant(tenant: Tenant): Repo[Of, Id] = forTenant(tenant.id)
  def forTenant(tenant: TenantId): Repo[Of, Id]
  def forTenantF(tenant: Tenant): Future[Repo[Of, Id]] = forTenantF(tenant.id)
  def forTenantF(tenant: TenantId): Future[Repo[Of, Id]]
  def forAllTenant(): Repo[Of, Id]
  def forAllTenantF(): Future[Repo[Of, Id]]
}

trait Repo[Of, Id <: ValueType] {
  def collectionName: String
  def indices: Seq[Index]
  def ensureIndices(implicit ec: ExecutionContext): Future[Unit]
  def collection(implicit ec: ExecutionContext): Future[JSONCollection]
  def format: Format[Of]
  def extractId(value: Of): String
  def count()(implicit ec: ExecutionContext): Future[Long]
  def findAll()(implicit ec: ExecutionContext): Future[Seq[Of]]
  def findAllRaw()(implicit ec: ExecutionContext): Future[Seq[JsValue]]
  def streamAll()(implicit ec: ExecutionContext): Source[Of, NotUsed]
  def streamAllRaw()(implicit ec: ExecutionContext): Source[JsValue, NotUsed]
  def find(query: JsObject, sort: Option[JsObject] = None, maxDocs: Int = -1)(
      implicit ec: ExecutionContext): Future[Seq[Of]]
  def findWithProjection(query: JsObject, projection: JsObject)(
      implicit ec: ExecutionContext): Future[Seq[JsObject]]
  def findOne(query: JsObject)(
      implicit ec: ExecutionContext): Future[Option[Of]]
  def findOneWithProjection(query: JsObject, projection: JsObject)(
      implicit ec: ExecutionContext
  ): Future[Option[JsObject]]
  def findById(id: String)(implicit ec: ExecutionContext): Future[Option[Of]]
  def findById(id: Id)(implicit ec: ExecutionContext): Future[Option[Of]]

  def findWithPagination(query: JsObject, page: Int, pageSize: Int)(
      implicit ec: ExecutionContext
  ): Future[(Seq[Of], Long)]
  def deleteById(id: String)(implicit ec: ExecutionContext): Future[WriteResult]
  def deleteById(id: Id)(implicit ec: ExecutionContext): Future[WriteResult]
  def delete(query: JsObject)(
      implicit ec: ExecutionContext): Future[WriteResult]
  def deleteAll()(implicit ec: ExecutionContext): Future[WriteResult]
  def save(value: Of)(implicit ec: ExecutionContext): Future[Boolean]
  def save(query: JsObject, value: JsObject)(
      implicit ec: ExecutionContext): Future[Boolean]
  def insertMany(values: Seq[Of])(implicit ec: ExecutionContext): Future[Long]
  def updateMany(query: JsObject, Value: JsObject)(implicit ec: ExecutionContext): Future[Long]
  def exists(id: String)(implicit ec: ExecutionContext): Future[Boolean]
  def exists(id: Id)(implicit ec: ExecutionContext): Future[Boolean]
  def exists(query: JsObject)(implicit ec: ExecutionContext): Future[Boolean]
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  def findByIdOrHrId(id: String, hrid: String)(
      implicit ec: ExecutionContext): Future[Option[Of]] =
    findOneNotDeleted(
      Json.obj("$or" -> Json.arr(Json.obj("_id" -> id),
                                 Json.obj("_humanReadableId" -> hrid))))
  def findByIdOrHrId(id: Id, hrid: String)(
      implicit ec: ExecutionContext): Future[Option[Of]] =
    findOneNotDeleted(
      Json.obj("$or" -> Json.arr(Json.obj("_id" -> id.value),
                                 Json.obj("_humanReadableId" -> hrid))))
  def findByIdOrHrId(idOrHrid: String)(
      implicit ec: ExecutionContext): Future[Option[Of]] =
    findOneNotDeleted(
      Json.obj("$or" -> Json.arr(Json.obj("_id" -> idOrHrid),
                                 Json.obj("_humanReadableId" -> idOrHrid))))
  def findByIdOrHrIdNotDeleted(id: String, hrid: String)(
      implicit ec: ExecutionContext): Future[Option[Of]] =
    findOneNotDeleted(
      Json.obj("_deleted" -> false,
               "$or" -> Json.arr(Json.obj("_id" -> id),
                                 Json.obj("_humanReadableId" -> hrid))))
  def findByIdOrHrIdNotDeleted(id: Id, hrid: String)(
      implicit ec: ExecutionContext): Future[Option[Of]] =
    findOneNotDeleted(
      Json.obj("_deleted" -> false,
               "$or" -> Json.arr(Json.obj("_id" -> id.value),
                                 Json.obj("_humanReadableId" -> hrid))))
  def findByIdOrHrIdNotDeleted(idOrHrid: String)(
      implicit ec: ExecutionContext): Future[Option[Of]] =
    findOneNotDeleted(
      Json.obj("_deleted" -> false,
               "$or" -> Json.arr(Json.obj("_id" -> idOrHrid),
                                 Json.obj("_humanReadableId" -> idOrHrid))))
  def deleteByIdOrHrId(id: String, hrid: String)(
      implicit ec: ExecutionContext): Future[WriteResult] =
    delete(
      Json.obj("$or" -> Json.arr(Json.obj("_id" -> id),
                                 Json.obj("_humanReadableId" -> hrid))))
  def deleteByIdOrHrId(id: Id, hrid: String)(
      implicit ec: ExecutionContext): Future[WriteResult] =
    delete(
      Json.obj("$or" -> Json.arr(Json.obj("_id" -> id.value),
                                 Json.obj("_humanReadableId" -> hrid))))
  def deleteLogicallyByIdOrHrId(id: String, hrid: String)(
      implicit ec: ExecutionContext): Future[Boolean] =
    deleteLogically(
      Json.obj("$or" -> Json.arr(Json.obj("_id" -> id),
                                 Json.obj("_humanReadableId" -> hrid))))
  def deleteLogicallyByIdOrHrId(id: Id, hrid: String)(
      implicit ec: ExecutionContext): Future[Boolean] =
    deleteLogically(
      Json.obj("$or" -> Json.arr(Json.obj("_id" -> id.value),
                                 Json.obj("_humanReadableId" -> hrid))))
  def existsByIdOrHrId(id: String, hrid: String)(
      implicit ec: ExecutionContext): Future[Boolean] =
    findByIdOrHrId(id, hrid).map(_.isDefined)
  def existsByIdOrHrId(id: Id, hrid: String)(
      implicit ec: ExecutionContext): Future[Boolean] =
    findByIdOrHrId(id, hrid).map(_.isDefined)
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  def deleteByIdLogically(id: String)(
      implicit ec: ExecutionContext): Future[WriteResult]
  def deleteByIdLogically(id: Id)(
      implicit ec: ExecutionContext): Future[WriteResult]
  def deleteLogically(query: JsObject)(
      implicit ec: ExecutionContext): Future[Boolean]
  def deleteAllLogically()(implicit ec: ExecutionContext): Future[Boolean]
  def findAllNotDeleted()(implicit ec: ExecutionContext): Future[Seq[Of]] =
    find(Json.obj("_deleted" -> false))
  def findNotDeleted(query: JsObject, maxDocs: Int = -1)(
      implicit ec: ExecutionContext): Future[Seq[Of]] =
    find(query ++ Json.obj("_deleted" -> false), maxDocs = maxDocs)
  def findOneNotDeleted(query: JsObject)(
      implicit ec: ExecutionContext): Future[Option[Of]] =
    findOne(query ++ Json.obj("_deleted" -> false))
  def findByIdNotDeleted(id: String)(
      implicit ec: ExecutionContext): Future[Option[Of]] =
    findOne(Json.obj("_deleted" -> false, "_id" -> id))
  def findByIdNotDeleted(id: Id)(
      implicit ec: ExecutionContext): Future[Option[Of]] =
    findOne(Json.obj("_deleted" -> false, "_id" -> id.value))
}
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
trait UserSessionRepo extends Repo[UserSession, MongoId]
trait PasswordResetRepo extends Repo[PasswordReset, MongoId]
trait AccountCreationRepo extends Repo[AccountCreation, MongoId]
trait TenantRepo extends Repo[Tenant, TenantId]
trait UserRepo extends Repo[User, UserId]
trait TeamRepo extends TenantCapableRepo[Team, TeamId] {
  def myTeams(tenant: Tenant, user: User)(
      implicit env: Env,
      ec: ExecutionContext): Future[Seq[Team]] = {
    if (user.isDaikokuAdmin) {
      env.dataStore.teamRepo
        .forTenant(tenant.id)
        .findAllNotDeleted()
    } else {
      env.dataStore.teamRepo
        .forTenant(tenant.id)
        .findNotDeleted(
          Json.obj("users.userId" -> user.id.value)
        )
    }
  }
}
trait NotificationRepo extends TenantCapableRepo[Notification, NotificationId]
trait ApiDocumentationPageRepo
    extends TenantCapableRepo[ApiDocumentationPage, ApiDocumentationPageId]
trait ApiSubscriptionRepo
    extends TenantCapableRepo[ApiSubscription, ApiSubscriptionId]
trait ApiRepo extends TenantCapableRepo[Api, ApiId]
trait AuditTrailRepo extends TenantCapableRepo[JsObject, MongoId]
trait ConsumptionRepo extends TenantCapableRepo[ApiKeyConsumption, MongoId] {
  def getLastConsumptionsforAllTenant(filter: JsObject)(
      implicit ec: ExecutionContext): Future[Seq[ApiKeyConsumption]]
  def getLastConsumptionsForTenant(tenantId: TenantId, filter: JsObject)(
      implicit ec: ExecutionContext): Future[Seq[ApiKeyConsumption]]
  def getLastConsumption(tenant: Tenant, query: JsObject)(
      implicit env: Env,
      ec: ExecutionContext): Future[Option[ApiKeyConsumption]] = {
    getLastConsumptionsForTenant(tenant.id, query).map(_.headOption)
  }
}
trait TranslationRepo extends TenantCapableRepo[Translation, MongoId]

trait DataStore {
  def start(): Future[Unit]
  def stop(): Future[Unit]
  def isEmpty(): Future[Boolean]
  def tenantRepo: TenantRepo
  def userRepo: UserRepo
  def teamRepo: TeamRepo
  def apiRepo: ApiRepo
  def apiSubscriptionRepo: ApiSubscriptionRepo
  def apiDocumentationPageRepo: ApiDocumentationPageRepo
  def notificationRepo: NotificationRepo
  def userSessionRepo: UserSessionRepo
  def auditTrailRepo: AuditTrailRepo
  def consumptionRepo: ConsumptionRepo
  def translationRepo: TranslationRepo
  def passwordResetRepo: PasswordResetRepo
  def accountCreationRepo: AccountCreationRepo
  def exportAsStream(pretty: Boolean)(implicit ec: ExecutionContext,
                                      mat: Materializer,
                                      env: Env): Source[ByteString, _]
  def importFromStream(source: Source[ByteString, _])(
      implicit ec: ExecutionContext,
      mat: Materializer,
      env: Env): Future[Unit]
}
