package storage

import org.apache.pekko.NotUsed
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.Source
import org.apache.pekko.util.ByteString
import cats.data.OptionT
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import play.api.libs.json._

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
  def tableName: String

  def format: Format[Of]

  def extractId(value: Of): String

  def count()(implicit ec: ExecutionContext): Future[Long]

  def count(query: JsObject)(implicit ec: ExecutionContext): Future[Long]

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
  )(implicit ec: ExecutionContext): Future[Seq[JsValue]]

  def find(query: JsObject, sort: Option[JsObject] = None, maxDocs: Int = -1)(
      implicit ec: ExecutionContext
  ): Future[Seq[Of]]

  def findWithProjection(query: JsObject, projection: JsObject)(implicit
      ec: ExecutionContext
  ): Future[Seq[JsObject]]

  def findOneRaw(query: JsObject)(implicit
      ec: ExecutionContext
  ): Future[Option[JsValue]]

  def findOne(query: JsObject)(implicit
      ec: ExecutionContext
  ): Future[Option[Of]]

  def findOneWithProjection(query: JsObject, projection: JsObject)(implicit
      ec: ExecutionContext
  ): Future[Option[JsObject]]

  def findWithPagination(
      query: JsObject,
      page: Int,
      pageSize: Int,
      sort: Option[JsObject] = None
  )(implicit
      ec: ExecutionContext
  ): Future[(Seq[Of], Long)]

  def delete(query: JsObject)(implicit ec: ExecutionContext): Future[Boolean]

  def save(value: Of)(implicit ec: ExecutionContext): Future[Boolean] = {
    val payload = format.writes(value).as[JsObject]
    save(Json.obj("_id" -> extractId(value)), payload)
  }

  def save(query: JsObject, value: JsObject)(implicit
      ec: ExecutionContext
  ): Future[Boolean]

  def insertMany(values: Seq[Of])(implicit ec: ExecutionContext): Future[Long]

  def updateMany(query: JsObject, Value: JsObject)(implicit
      ec: ExecutionContext
  ): Future[Long]

  def updateManyByQuery(query: JsObject, queryUpdate: JsObject)(implicit
      ec: ExecutionContext
  ): Future[Long]

  def exists(query: JsObject)(implicit ec: ExecutionContext): Future[Boolean]

  def findMaxByQuery(query: JsObject = Json.obj(), field: String)(implicit
      ec: ExecutionContext
  ): Future[Option[Long]]

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  def findByIdOrHrId(id: String, hrid: String)(implicit
      ec: ExecutionContext
  ): Future[Option[Of]] =
    findOneNotDeleted(
      Json.obj(
        "$or" -> Json
          .arr(Json.obj("_id" -> id), Json.obj("_humanReadableId" -> hrid))
      )
    )

  def findByIdOrHrId(id: Id, hrid: String)(implicit
      ec: ExecutionContext
  ): Future[Option[Of]] =
    findOneNotDeleted(
      Json.obj(
        "$or" -> Json.arr(
          Json.obj("_id" -> id.value),
          Json.obj("_humanReadableId" -> hrid)
        )
      )
    )

  def findByIdOrHrId(
      idOrHrid: String
  )(implicit ec: ExecutionContext): Future[Option[Of]] =
    findOneNotDeleted(
      Json.obj(
        "$or" -> Json.arr(
          Json.obj("_id" -> idOrHrid),
          Json.obj("_humanReadableId" -> idOrHrid)
        )
      )
    )

  def findByIdOrHrIdNotDeleted(id: String, hrid: String)(implicit
      ec: ExecutionContext
  ): Future[Option[Of]] =
    findOneNotDeleted(
      Json.obj(
        "_deleted" -> false,
        "$or" -> Json
          .arr(Json.obj("_id" -> id), Json.obj("_humanReadableId" -> hrid))
      )
    )

  def findByIdOrHrIdNotDeleted(id: Id, hrid: String)(implicit
      ec: ExecutionContext
  ): Future[Option[Of]] =
    findOneNotDeleted(
      Json.obj(
        "_deleted" -> false,
        "$or" -> Json.arr(
          Json.obj("_id" -> id.value),
          Json.obj("_humanReadableId" -> hrid)
        )
      )
    )

  def findByIdOrHrIdNotDeleted(
      idOrHrid: String
  )(implicit ec: ExecutionContext): Future[Option[Of]] = {
    findOneNotDeleted(
      Json.obj(
        "_deleted" -> false,
        "$or" -> Json.arr(
          Json.obj("_id" -> idOrHrid),
          Json.obj("_humanReadableId" -> idOrHrid)
        )
      )
    )
  }

  def findByIdOrHrIdRaw(id: String, hrid: String)(implicit
      ec: ExecutionContext
  ): Future[Option[JsValue]] =
    findOneNotDeletedRaw(
      Json.obj(
        "$or" -> Json
          .arr(Json.obj("_id" -> id), Json.obj("_humanReadableId" -> hrid))
      )
    )

  def findByIdOrHrIdRaw(id: Id, hrid: String)(implicit
      ec: ExecutionContext
  ): Future[Option[JsValue]] =
    findOneNotDeletedRaw(
      Json.obj(
        "$or" -> Json.arr(
          Json.obj("_id" -> id.value),
          Json.obj("_humanReadableId" -> hrid)
        )
      )
    )

  def findByIdOrHrIdRaw(
      idOrHrid: String
  )(implicit ec: ExecutionContext): Future[Option[JsValue]] =
    findOneNotDeletedRaw(
      Json.obj(
        "$or" -> Json.arr(
          Json.obj("_id" -> idOrHrid),
          Json.obj("_humanReadableId" -> idOrHrid)
        )
      )
    )

  def findByIdOrHrIdNotDeletedRaw(id: String, hrid: String)(implicit
      ec: ExecutionContext
  ): Future[Option[JsValue]] =
    findOneNotDeletedRaw(
      Json.obj(
        "_deleted" -> false,
        "$or" -> Json
          .arr(Json.obj("_id" -> id), Json.obj("_humanReadableId" -> hrid))
      )
    )

  def findByIdOrHrIdNotDeletedRaw(id: Id, hrid: String)(implicit
      ec: ExecutionContext
  ): Future[Option[JsValue]] =
    findOneNotDeletedRaw(
      Json.obj(
        "_deleted" -> false,
        "$or" -> Json.arr(
          Json.obj("_id" -> id.value),
          Json.obj("_humanReadableId" -> hrid)
        )
      )
    )

  def findByIdOrHrIdNotDeletedRaw(
      idOrHrid: String
  )(implicit ec: ExecutionContext): Future[Option[JsValue]] =
    findOneNotDeletedRaw(
      Json.obj(
        "_deleted" -> false,
        "$or" -> Json.arr(
          Json.obj("_id" -> idOrHrid),
          Json.obj("_humanReadableId" -> idOrHrid)
        )
      )
    )

  def deleteByIdOrHrId(id: String, hrid: String)(implicit
      ec: ExecutionContext
  ): Future[Boolean] =
    delete(
      Json.obj(
        "$or" -> Json
          .arr(Json.obj("_id" -> id), Json.obj("_humanReadableId" -> hrid))
      )
    )

  def deleteByIdOrHrId(id: Id, hrid: String)(implicit
      ec: ExecutionContext
  ): Future[Boolean] =
    delete(
      Json.obj(
        "$or" -> Json.arr(
          Json.obj("_id" -> id.value),
          Json.obj("_humanReadableId" -> hrid)
        )
      )
    )

  def deleteLogicallyByIdOrHrId(id: String, hrid: String)(implicit
      ec: ExecutionContext
  ): Future[Boolean] =
    deleteLogically(
      Json.obj(
        "$or" -> Json
          .arr(Json.obj("_id" -> id), Json.obj("_humanReadableId" -> hrid))
      )
    )

  def deleteLogicallyByIdOrHrId(id: Id, hrid: String)(implicit
      ec: ExecutionContext
  ): Future[Boolean] =
    deleteLogically(
      Json.obj(
        "$or" -> Json.arr(
          Json.obj("_id" -> id.value),
          Json.obj("_humanReadableId" -> hrid)
        )
      )
    )

  def existsByIdOrHrId(id: String, hrid: String)(implicit
      ec: ExecutionContext
  ): Future[Boolean] =
    findByIdOrHrId(id, hrid).map(_.isDefined)

  def existsByIdOrHrId(id: Id, hrid: String)(implicit
      ec: ExecutionContext
  ): Future[Boolean] =
    findByIdOrHrId(id, hrid).map(_.isDefined)

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  def deleteByIdLogically(id: String)(implicit
      ec: ExecutionContext
  ): Future[Boolean]

  def deleteByIdLogically(id: Id)(implicit
      ec: ExecutionContext
  ): Future[Boolean]

  def deleteLogically(query: JsObject)(implicit
      ec: ExecutionContext
  ): Future[Boolean]

  def deleteAllLogically()(implicit ec: ExecutionContext): Future[Boolean]

  def findAllNotDeleted()(implicit ec: ExecutionContext): Future[Seq[Of]] =
    find(
      Json.obj(
        "$or" -> Json
          .arr(Json.obj("_deleted" -> false), Json.obj("_deleted" -> JsNull))
      )
    )

  def findNotDeleted(
      query: JsObject,
      maxDocs: Int = -1,
      sort: Option[JsObject] = None
  )(implicit ec: ExecutionContext): Future[Seq[Of]] =
    find(query ++ Json.obj("_deleted" -> false), maxDocs = maxDocs, sort = sort)

  def findOneNotDeletedRaw(
      query: JsObject
  )(implicit ec: ExecutionContext): Future[Option[JsValue]] =
    findOneRaw(query ++ Json.obj("_deleted" -> false))

  def findOneNotDeleted(
      query: JsObject
  )(implicit ec: ExecutionContext): Future[Option[Of]] =
    findOne(query ++ Json.obj("_deleted" -> false))

  def findByIdNotDeleted(
      id: String
  )(implicit ec: ExecutionContext): Future[Option[Of]] =
    findOne(Json.obj("_deleted" -> false, "_id" -> id))

  def findByIdNotDeleted(
      id: Id
  )(implicit ec: ExecutionContext): Future[Option[Of]] = {
    findByIdNotDeleted(id.value)
  }

  def findById(id: String)(implicit ec: ExecutionContext): Future[Option[Of]] =
    findOne(Json.obj("_id" -> id))

  def findById(id: Id)(implicit ec: ExecutionContext): Future[Option[Of]] =
    findOne(Json.obj("_id" -> id.value))

  def findAll()(implicit ec: ExecutionContext): Future[Seq[Of]] =
    find(Json.obj())

  def deleteById(id: String)(implicit ec: ExecutionContext): Future[Boolean] =
    delete(Json.obj("_id" -> id))

  def deleteById(id: Id)(implicit ec: ExecutionContext): Future[Boolean] =
    delete(Json.obj("_id" -> id.value))

  def deleteAll()(implicit ec: ExecutionContext): Future[Boolean] =
    delete(Json.obj())

  def exists(id: String)(implicit ec: ExecutionContext): Future[Boolean] =
    exists(Json.obj("_id" -> id))

  def exists(id: Id)(implicit ec: ExecutionContext): Future[Boolean] =
    exists(Json.obj("_id" -> id.value))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
trait UserSessionRepo extends Repo[UserSession, DatastoreId]

trait PasswordResetRepo extends Repo[PasswordReset, DatastoreId]

trait AccountCreationRepo extends Repo[AccountCreation, DatastoreId]

trait TenantRepo extends Repo[Tenant, TenantId]

trait UserRepo extends Repo[User, UserId]

trait EvolutionRepo extends Repo[Evolution, DatastoreId]
trait ReportsInfoRepo extends Repo[ReportsInfo, DatastoreId]

trait ApiSubscriptionTransferRepo extends TenantCapableRepo[ApiSubscriptionTransfer, DatastoreId]

trait TeamRepo extends TenantCapableRepo[Team, TeamId] {
  def myTeams(tenant: Tenant, user: User)(implicit
      env: Env,
      ec: ExecutionContext
  ): Future[Seq[Team]] = {
    val typeFilter = if (tenant.subscriptionSecurity.isDefined
      &&  tenant.subscriptionSecurity.exists(identity)) {
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
      env: Env,
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
    extends TenantCapableRepo[SubscriptionDemand, SubscriptionDemandId]

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
    extends TenantCapableRepo[EmailVerification, DatastoreId]

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

  def exportAsStream(pretty: Boolean, exportAuditTrail: Boolean = true)(implicit
      ec: ExecutionContext,
      mat: Materializer,
      env: Env
  ): Source[ByteString, _]

  def importFromStream(source: Source[ByteString, _]): Future[Unit]

  def clear(): Future[Unit]
}
