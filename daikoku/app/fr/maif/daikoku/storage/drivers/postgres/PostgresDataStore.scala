package fr.maif.daikoku.storage.drivers.postgres

import fr.maif.daikoku.domain.*
import fr.maif.daikoku.domain.json.*
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.logger.AppLogger
import fr.maif.daikoku.services.CmsPage
import fr.maif.daikoku.storage.*
import fr.maif.daikoku.storage.drivers.postgres.pgimplicits.*
import io.vertx.core.json.JsonObject
import io.vertx.sqlclient.{Pool, Row}
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.{Framing, Keep, Sink, Source}
import org.apache.pekko.util.ByteString
import play.api.libs.json.*
import play.api.{Configuration, Logger}

import scala.collection.mutable.ListBuffer
import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.CollectionConverters.IterableHasAsScala

sealed trait ColType
case object ColString extends ColType
case object ColUUID extends ColType
case object ColInt extends ColType
case object ColLong extends ColType
//case object ColDouble       extends ColType
//case object ColFloat        extends ColType
//case object ColBigDecimal   extends ColType
case object ColBoolean extends ColType
case object ColJson extends ColType
case object ColJsonArray extends ColType
//case object ColInstant      extends ColType
//case object ColLocalDate    extends ColType
//case object ColLocalTime    extends ColType
//case object ColLocalDateTime extends ColType
//case object ColDuration     extends ColType
//case object ColByteArray    extends ColType

case class Col(name: String, tpe: ColType)

object Col {
  def str(name: String) = Col(name, ColString)
  def uuid(name: String) = Col(name, ColUUID)
  def int(name: String) = Col(name, ColInt)
  def long(name: String) = Col(name, ColLong)
//  def dbl(name: String)      = Col(name, ColDouble)
//  def float(name: String)    = Col(name, ColFloat)
//  def decimal(name: String)  = Col(name, ColBigDecimal)
  def bool(name: String) = Col(name, ColBoolean)
  def array(name: String) = Col(name, ColJsonArray)
  def json(name: String) = Col(name, ColJson)
//  def instant(name: String)  = Col(name, ColInstant)
//  def date(name: String)     = Col(name, ColLocalDate)
//  def time(name: String)     = Col(name, ColLocalTime)
//  def dateTime(name: String) = Col(name, ColLocalDateTime)
//  def duration(name: String) = Col(name, ColDuration)
//  def bytes(name: String)    = Col(name, ColByteArray)
}

private def readCol(row: Row, col: Col): Option[JsValue] =
  col.tpe match {
    case ColString => row.optString(col.name).map(JsString(_))
    case ColUUID   => row.optString(col.name).map(JsString(_))
    case ColInt    => row.optLong(col.name).map(v => JsNumber(v))
    case ColLong   => row.optLong(col.name).map(v => JsNumber(v))
//    case ColDouble       => row.optDouble(col.name).map(v => JsNumber(v))
//    case ColFloat        => row.optFloat(col.name).map(v => JsNumber(v.toDouble))
//    case ColBigDecimal   => row.optBigDecimal(col.name).map(v => JsNumber(v))
    case ColBoolean   => row.optBoolean(col.name).map(JsBoolean(_))
    case ColJson      => row.optJsObject(col.name)
    case ColJsonArray => row.optJsArray(col.name)
//    case ColInstant      => row.optInstant(col.name).map(v => JsString(v.toString))
//    case ColLocalDate    => row.optLocalDate(col.name).map(v => JsString(v.toString))
//    case ColLocalTime    => row.optLocalTime(col.name).map(v => JsString(v.toString))
//    case ColLocalDateTime => row.optLocalDateTime(col.name).map(v => JsString(v.toString))
//    case ColDuration     => row.optDuration(col.name).map(v => JsString(v.toString))
//    case ColByteArray    => row.optByteArray(col.name).map(v => JsString(java.util.Base64.getEncoder.encodeToString(v)))
  }

trait PostgresTenantCapableRepo[A, Id <: ValueType]
    extends TenantCapableRepo[A, Id] {

  def repo(): PostgresRepo[A, Id]

  def tenantRepo(tenant: TenantId): PostgresTenantAwareRepo[A, Id]

  override def forTenant(tenant: TenantId): Repo[A, Id] = tenantRepo(tenant)

  override def forTenantF(tenant: TenantId): Future[Repo[A, Id]] =
    Future.successful(tenantRepo(tenant))

  override def forAllTenant(): Repo[A, Id] = repo()

  override def forAllTenantF(): Future[Repo[A, Id]] = Future.successful(repo())
}

case class PostgresTenantCapableTeamRepo(
    _repo: () => PostgresRepo[Team, TeamId],
    _tenantRepo: TenantId => PostgresTenantAwareRepo[Team, TeamId]
) extends PostgresTenantCapableRepo[Team, TeamId]
    with TeamRepo {
  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[Team, TeamId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[Team, TeamId] = _repo()
}

case class PostgresTenantCapableApiRepo(
    _repo: () => PostgresRepo[Api, ApiId],
    _tenantRepo: TenantId => PostgresTenantAwareRepo[Api, ApiId]
) extends PostgresTenantCapableRepo[Api, ApiId]
    with ApiRepo {
  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[Api, ApiId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[Api, ApiId] = _repo()
}

case class PostgresTenantCapableApiSubscriptionRepo(
    _repo: () => PostgresRepo[ApiSubscription, ApiSubscriptionId],
    _tenantRepo: TenantId => PostgresTenantAwareRepo[
      ApiSubscription,
      ApiSubscriptionId
    ]
) extends PostgresTenantCapableRepo[ApiSubscription, ApiSubscriptionId]
    with ApiSubscriptionRepo {
  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[ApiSubscription, ApiSubscriptionId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[ApiSubscription, ApiSubscriptionId] =
    _repo()
}

case class PostgresTenantCapableKeyringRepo(
    _repo: () => PostgresRepo[Keyring, KeyringId],
    _tenantRepo: TenantId => PostgresTenantAwareRepo[Keyring, KeyringId]
) extends PostgresTenantCapableRepo[Keyring, KeyringId]
    with KeyringRepo {
  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[Keyring, KeyringId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[Keyring, KeyringId] =
    _repo()
}

case class PostgresTenantCapableApiDocumentationPageRepo(
    _repo: () => PostgresRepo[ApiDocumentationPage, ApiDocumentationPageId],
    _tenantRepo: TenantId => PostgresTenantAwareRepo[
      ApiDocumentationPage,
      ApiDocumentationPageId
    ]
) extends PostgresTenantCapableRepo[
      ApiDocumentationPage,
      ApiDocumentationPageId
    ]
    with ApiDocumentationPageRepo {
  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[ApiDocumentationPage, ApiDocumentationPageId] =
    _tenantRepo(tenant)

  override def repo()
      : PostgresRepo[ApiDocumentationPage, ApiDocumentationPageId] =
    _repo()
}

case class PostgresTenantCapableApiPostRepo(
    _repo: () => PostgresRepo[ApiPost, ApiPostId],
    _tenantRepo: TenantId => PostgresTenantAwareRepo[ApiPost, ApiPostId]
) extends PostgresTenantCapableRepo[ApiPost, ApiPostId]
    with ApiPostRepo {
  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[ApiPost, ApiPostId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[ApiPost, ApiPostId] =
    _repo()
}

case class PostgresTenantCapableApiIssueRepo(
    _repo: () => PostgresRepo[ApiIssue, ApiIssueId],
    _tenantRepo: TenantId => PostgresTenantAwareRepo[ApiIssue, ApiIssueId]
) extends PostgresTenantCapableRepo[ApiIssue, ApiIssueId]
    with ApiIssueRepo {
  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[ApiIssue, ApiIssueId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[ApiIssue, ApiIssueId] =
    _repo()
}

case class PostgresTenantCapableNotificationRepo(
    _repo: () => PostgresRepo[Notification, NotificationId],
    _tenantRepo: TenantId => PostgresTenantAwareRepo[
      Notification,
      NotificationId
    ]
) extends PostgresTenantCapableRepo[Notification, NotificationId]
    with NotificationRepo {
  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[Notification, NotificationId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[Notification, NotificationId] = _repo()
}

case class PostgresTenantCapableAuditTrailRepo(
    _repo: () => PostgresRepo[JsObject, DatastoreId],
    _tenantRepo: TenantId => PostgresTenantAwareRepo[JsObject, DatastoreId]
) extends PostgresTenantCapableRepo[JsObject, DatastoreId]
    with AuditTrailRepo {
  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[JsObject, DatastoreId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[JsObject, DatastoreId] = _repo()
}

case class PostgresTenantCapableTranslationRepo(
    _repo: () => PostgresRepo[Translation, DatastoreId],
    _tenantRepo: TenantId => PostgresTenantAwareRepo[Translation, DatastoreId]
) extends PostgresTenantCapableRepo[Translation, DatastoreId]
    with TranslationRepo {
  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[Translation, DatastoreId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[Translation, DatastoreId] = _repo()
}

case class PostgresTenantCapableMessageRepo(
    _repo: () => PostgresRepo[Message, DatastoreId],
    _tenantRepo: TenantId => PostgresTenantAwareRepo[Message, DatastoreId]
) extends PostgresTenantCapableRepo[Message, DatastoreId]
    with MessageRepo {
  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[Message, DatastoreId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[Message, DatastoreId] = _repo()
}

case class PostgresTenantCapableCmsPageRepo(
    _repo: () => PostgresRepo[CmsPage, CmsPageId],
    _tenantRepo: TenantId => PostgresTenantAwareRepo[CmsPage, CmsPageId]
) extends PostgresTenantCapableRepo[CmsPage, CmsPageId]
    with CmsPageRepo {
  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[CmsPage, CmsPageId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[CmsPage, CmsPageId] = _repo()
}

case class PostgresTenantCapableAssetRepo(
    _repo: () => PostgresRepo[Asset, AssetId],
    _tenantRepo: TenantId => PostgresTenantAwareRepo[Asset, AssetId]
) extends PostgresTenantCapableRepo[Asset, AssetId]
    with AssetRepo {
  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[Asset, AssetId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[Asset, AssetId] = _repo()
}

case class PostgresTenantCapableOperationRepo(
    _repo: () => PostgresRepo[Operation, DatastoreId],
    _tenantRepo: TenantId => PostgresTenantAwareRepo[Operation, DatastoreId]
) extends PostgresTenantCapableRepo[Operation, DatastoreId]
    with OperationRepo {
  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[Operation, DatastoreId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[Operation, DatastoreId] = _repo()
}

case class PostgresTenantCapableEmailVerificationRepo(
    _repo: () => PostgresRepo[EmailVerification, DatastoreId],
    _tenantRepo: TenantId => PostgresTenantAwareRepo[
      EmailVerification,
      DatastoreId
    ]
) extends PostgresTenantCapableRepo[EmailVerification, DatastoreId]
    with EmailVerificationRepo {
  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[EmailVerification, DatastoreId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[EmailVerification, DatastoreId] = _repo()
}
case class PostgresTenantCapableSubscriptionDemandRepo(
    _repo: () => PostgresRepo[SubscriptionDemand, DemandId],
    _tenantRepo: TenantId => PostgresTenantAwareRepo[
      SubscriptionDemand,
      DemandId
    ]
) extends PostgresTenantCapableRepo[SubscriptionDemand, DemandId]
    with SubscriptionDemandRepo {
  override def repo(): PostgresRepo[SubscriptionDemand, DemandId] =
    _repo()

  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[SubscriptionDemand, DemandId] =
    _tenantRepo(tenant)
}

case class PostgresTenantCapableJobInformationRepo(
    _repo: () => PostgresRepo[JobInformation, DatastoreId],
    _tenantRepo: TenantId => PostgresTenantAwareRepo[
      JobInformation,
      DatastoreId
    ]
) extends PostgresTenantCapableRepo[JobInformation, DatastoreId]
    with JobInformationRepo {
  override def repo(): PostgresRepo[JobInformation, DatastoreId] =
    _repo()

  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[JobInformation, DatastoreId] =
    _tenantRepo(tenant)
}

case class PostgresTenantCapableStepValidatorRepo(
    _repo: () => PostgresRepo[StepValidator, DatastoreId],
    _tenantRepo: TenantId => PostgresTenantAwareRepo[StepValidator, DatastoreId]
) extends PostgresTenantCapableRepo[StepValidator, DatastoreId]
    with StepValidatorRepo {
  override def repo(): PostgresRepo[StepValidator, DatastoreId] = _repo()

  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[StepValidator, DatastoreId] =
    _tenantRepo(tenant)
}

case class PostgresTenantCapableUsagePlanRepo(
    _repo: () => PostgresRepo[UsagePlan, UsagePlanId],
    _tenantRepo: TenantId => PostgresTenantAwareRepo[UsagePlan, UsagePlanId]
) extends PostgresTenantCapableRepo[UsagePlan, UsagePlanId]
    with UsagePlanRepo {
  override def repo(): PostgresRepo[UsagePlan, UsagePlanId] = _repo()

  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[UsagePlan, UsagePlanId] =
    _tenantRepo(tenant)
}

case class PostgresTenantCapableApiSubscriptionTransferRepo(
    _repo: () => PostgresRepo[ApiSubscriptionTransfer, DatastoreId],
    _tenantRepo: TenantId => PostgresTenantAwareRepo[
      ApiSubscriptionTransfer,
      DatastoreId
    ]
) extends PostgresTenantCapableRepo[ApiSubscriptionTransfer, DatastoreId]
    with ApiSubscriptionTransferRepo {
  override def repo(): PostgresRepo[ApiSubscriptionTransfer, DatastoreId] =
    _repo()

  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[ApiSubscriptionTransfer, DatastoreId] =
    _tenantRepo(tenant)
}

case class PostgresTenantCapableConsumptionRepo(
    _repo: () => PostgresRepo[ApiKeyConsumption, DatastoreId],
    _tenantRepo: TenantId => PostgresTenantAwareRepo[
      ApiKeyConsumption,
      DatastoreId
    ],
    reactivePg: ReactivePg
) extends PostgresTenantCapableRepo[ApiKeyConsumption, DatastoreId]
    with ConsumptionRepo {

  implicit val jsObjectFormat: OFormat[JsObject] = new OFormat[JsObject] {
    override def reads(json: JsValue): JsResult[JsObject] =
      json.validate[JsObject](using Reads.JsObjectReads)

    override def writes(o: JsObject): JsObject = o
  }

  val jsObjectWrites: OWrites[JsObject] = (o: JsObject) => o

  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[ApiKeyConsumption, DatastoreId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[ApiKeyConsumption, DatastoreId] = _repo()

}

class PostgresDataStore(configuration: Configuration, env: Env, pgPool: Pool)
    extends DataStore {

  private implicit lazy val logger: Logger = Logger("PostgresDataStore")

  implicit val ec: ExecutionContext = env.defaultExecutionContext

  private val TABLES = Map(
    "tenants" -> true,
    "password_reset" -> true,
    "account_creation" -> true,
    "teams" -> true,
    "apis" -> true,
    "translations" -> true,
    "messages" -> false,
    "api_subscriptions" -> true,
    "api_documentation_pages" -> true,
    "notifications" -> true,
    "consumptions" -> true,
    "audit_events" -> false,
    "users" -> true,
    "user_sessions" -> false,
    "api_posts" -> true,
    "api_issues" -> true,
    "evolutions" -> false,
    "cmspages" -> true,
    "operations" -> true,
    "email_verifications" -> true,
    "operations" -> true,
    "subscription_demands" -> true,
    "step_validators" -> true,
    "usage_plans" -> true,
    "assets" -> true,
    "reports_info" -> true,
    "api_subscription_transfers" -> true,
    "job_informations" -> true,
    "keyrings" -> true
  )

  private lazy val reactivePg =
    new ReactivePg(pgPool, configuration)(using ec)

  def getSchema: String = configuration.get[String]("daikoku.postgres.schema")

  private val _tenantRepo: TenantRepo = new PostgresTenantRepo(env, reactivePg)
  private val _userRepo: UserRepo = new PostgresUserRepo(env, reactivePg)
  private val _teamRepo: TeamRepo = PostgresTenantCapableTeamRepo(
    () => new PostgresTeamRepo(env, reactivePg),
    t => new PostgresTenantTeamRepo(env, reactivePg, t)
  )
  private val _apiRepo: ApiRepo = PostgresTenantCapableApiRepo(
    () => new PostgresApiRepo(env, reactivePg),
    t => new PostgresTenantApiRepo(env, reactivePg, t)
  )
  private val _apiSubscriptionRepo: ApiSubscriptionRepo =
    PostgresTenantCapableApiSubscriptionRepo(
      () => new PostgresApiSubscriptionRepo(env, reactivePg),
      t => new PostgresTenantApiSubscriptionRepo(env, reactivePg, t)
    )
  private val _keyringRepo: KeyringRepo =
    PostgresTenantCapableKeyringRepo(
      () => new PostgresKeyringRepo(env, reactivePg),
      t => new PostgresTenantKeyringRepo(env, reactivePg, t)
    )
  private val _apiDocumentationPageRepo: ApiDocumentationPageRepo =
    PostgresTenantCapableApiDocumentationPageRepo(
      () => new PostgresApiDocumentationPageRepo(env, reactivePg),
      t => new PostgresTenantApiDocumentationPageRepo(env, reactivePg, t)
    )
  private val _apiPostRepo: ApiPostRepo =
    PostgresTenantCapableApiPostRepo(
      () => new PostgresApiPostRepo(env, reactivePg),
      t => new PostgresTenantApiPostRepo(env, reactivePg, t)
    )
  private val _apiIssueRepo: ApiIssueRepo =
    PostgresTenantCapableApiIssueRepo(
      () => new PostgresApiIssueRepo(env, reactivePg),
      t => new PostgresTenantApiIssueRepo(env, reactivePg, t)
    )
  private val _notificationRepo: NotificationRepo =
    PostgresTenantCapableNotificationRepo(
      () => new PostgresNotificationRepo(env, reactivePg),
      t => new PostgresTenantNotificationRepo(env, reactivePg, t)
    )
  private val _userSessionRepo: UserSessionRepo =
    new PostgresUserSessionRepo(env, reactivePg)
  private val _auditTrailRepo: AuditTrailRepo =
    PostgresTenantCapableAuditTrailRepo(
      () => new PostgresAuditTrailRepo(env, reactivePg),
      t => new PostgresTenantAuditTrailRepo(env, reactivePg, t)
    )
  private val _consumptionRepo: ConsumptionRepo =
    PostgresTenantCapableConsumptionRepo(
      () => new PostgresConsumptionRepo(env, reactivePg),
      t => new PostgresTenantConsumptionRepo(env, reactivePg, t),
      reactivePg
    )
  private val _passwordResetRepo: PasswordResetRepo =
    new PostgresPasswordResetRepo(env, reactivePg)
  private val _reportsInfoRepo: ReportsInfoRepo =
    new PostgresReportsInfoRepo(env, reactivePg)
  private val _accountCreationRepo: AccountCreationRepo =
    new PostgresAccountCreationRepo(env, reactivePg)
  private val _translationRepo: TranslationRepo =
    PostgresTenantCapableTranslationRepo(
      () => new PostgresTranslationRepo(env, reactivePg),
      t => new PostgresTenantTranslationRepo(env, reactivePg, t)
    )
  private val _messageRepo: MessageRepo =
    PostgresTenantCapableMessageRepo(
      () => new PostgresMessageRepo(env, reactivePg),
      t => new PostgresTenantMessageRepo(env, reactivePg, t)
    )
  private val _cmsPageRepo: CmsPageRepo =
    PostgresTenantCapableCmsPageRepo(
      () => new PostgresCmsPageRepo(env, reactivePg),
      t => new PostgresTenantCmsPageRepo(env, reactivePg, t)
    )
  private val _assetRepo: AssetRepo =
    PostgresTenantCapableAssetRepo(
      () => new PostgresAssetRepo(env, reactivePg),
      t => new PostgresTenantAssetRepo(env, reactivePg, t)
    )
  private val _evolutionRepo: EvolutionRepo =
    new PostgresEvolutionRepo(env, reactivePg)

  private val _operationRepo: OperationRepo =
    PostgresTenantCapableOperationRepo(
      () => new PostgresOperationRepo(env, reactivePg),
      t => new PostgresTenantOperationRepo(env, reactivePg, t)
    )
  private val _emailVerificationRepo: EmailVerificationRepo =
    PostgresTenantCapableEmailVerificationRepo(
      () => new PostgresEmailVerificationRepo(env, reactivePg),
      t => new PostgresTenantEmailVerificationRepo(env, reactivePg, t)
    )

  private val _subscriptionDemandRepo: SubscriptionDemandRepo =
    PostgresTenantCapableSubscriptionDemandRepo(
      () => new PostgresSubscriptionDemandRepo(env, reactivePg),
      t => new PostgresTenantSubscriptionDemandRepo(env, reactivePg, t)
    )

  private val _jobInformationRepo: JobInformationRepo =
    PostgresTenantCapableJobInformationRepo(
      () => new PostgresJobInformationRepo(env, reactivePg),
      t => new PostgresTenantJobInformationRepo(env, reactivePg, t)
    )

  private val _stepValidatorRepo: StepValidatorRepo =
    PostgresTenantCapableStepValidatorRepo(
      () => new PostgresStepValidatorRepo(env, reactivePg),
      t => new PostgresTenantStepValidatorRepo(env, reactivePg, t)
    )

  private val _usagePlanRepo: UsagePlanRepo =
    PostgresTenantCapableUsagePlanRepo(
      () => new PostgresUsagePlanRepo(env, reactivePg),
      t => new PostgresTenantUsagePlanRepo(env, reactivePg, t)
    )

  private val _apiSubscriptionTransferRepo: ApiSubscriptionTransferRepo =
    PostgresTenantCapableApiSubscriptionTransferRepo(
      () => new PostgresApiSubscriptionTransferRepo(env, reactivePg),
      t => new PostgresTenantApiSubscriptionTransferRepo(env, reactivePg, t)
    )

  override def tenantRepo: TenantRepo = _tenantRepo

  override def userRepo: UserRepo = _userRepo

  override def teamRepo: TeamRepo = _teamRepo

  override def apiRepo: ApiRepo = _apiRepo

  override def apiSubscriptionRepo: ApiSubscriptionRepo = _apiSubscriptionRepo

  override def keyringRepo: KeyringRepo = _keyringRepo

  override def apiDocumentationPageRepo: ApiDocumentationPageRepo =
    _apiDocumentationPageRepo

  override def apiPostRepo: ApiPostRepo = _apiPostRepo

  override def apiIssueRepo: ApiIssueRepo = _apiIssueRepo

  override def notificationRepo: NotificationRepo = _notificationRepo

  override def userSessionRepo: UserSessionRepo = _userSessionRepo

  override def auditTrailRepo: AuditTrailRepo = _auditTrailRepo

  override def consumptionRepo: ConsumptionRepo = _consumptionRepo

  override def passwordResetRepo: PasswordResetRepo = _passwordResetRepo
  override def reportsInfoRepo: ReportsInfoRepo = _reportsInfoRepo

  override def accountCreationRepo: AccountCreationRepo = _accountCreationRepo

  override def translationRepo: TranslationRepo = _translationRepo

  override def messageRepo: MessageRepo = _messageRepo

  override def cmsRepo: CmsPageRepo = _cmsPageRepo

  override def assetRepo: AssetRepo = _assetRepo

  override def evolutionRepo: EvolutionRepo = _evolutionRepo

  override def operationRepo: OperationRepo = _operationRepo

  override def emailVerificationRepo: EmailVerificationRepo =
    _emailVerificationRepo

  override def subscriptionDemandRepo: SubscriptionDemandRepo =
    _subscriptionDemandRepo

  override def stepValidatorRepo: StepValidatorRepo = _stepValidatorRepo

  override def usagePlanRepo: UsagePlanRepo = _usagePlanRepo

  override def apiSubscriptionTransferRepo: ApiSubscriptionTransferRepo =
    _apiSubscriptionTransferRepo

  override def JobInformationRepo: JobInformationRepo = _jobInformationRepo

  override def queryOneRaw(query: String, name: String, params: Seq[AnyRef])(
      implicit ec: ExecutionContext
  ): Future[Option[JsObject]] = {
    logger.debug(s"queryOneRaw($query)")

    for {
      value <- reactivePg.queryOne(query = query, params = params) { row =>
        row.optJsObject(name)
      }
    } yield {
      value
    }
  }
  def queryOneLong(query: String, name: String, params: Seq[AnyRef])(implicit
      ec: ExecutionContext
  ): Future[Option[Long]] = {
    logger.debug(s"queryOneRaw($query)")

    for {
      value <- reactivePg.queryOne(query = query, params = params) { row =>
        row.optLong(name)
      }
    } yield {
      value
    }
  }

  def queryOneJsArray(query: String, name: String, params: Seq[AnyRef])(implicit
      ec: ExecutionContext
  ): Future[Option[JsArray]] = {
    logger.debug(s"queryOneJsArray($query)")

    for {
      value <- reactivePg.queryOne(query = query, params = params) { row =>
        row.optJsArray(name)
      }
    } yield {
      value
    }
  }

  override def queryRaw(query: String, name: String, params: Seq[AnyRef])(
      implicit ec: ExecutionContext
  ): Future[Seq[JsValue]] = {
    logger.debug(s"queryRaw($query)")

    for {
      value <- reactivePg.querySeq(query = query, params = params) { row =>
        row.optJsObject(name)
      }
    } yield {
      value
    }
  }

  def queryRawMapped(query: String, columns: Seq[Col], params: Seq[AnyRef])(
      implicit ec: ExecutionContext
  ): Future[Seq[JsObject]] = {
    logger.debug(s"queryRaw($query)")

    reactivePg.querySeq(query = query, params = params) { row =>
      val fields = columns.flatMap(col => readCol(row, col).map(col.name -> _))
      Some(JsObject(fields))
    }
  }

  def queryRawMappedStream(
      query: String,
      columns: Seq[Col],
      params: Seq[AnyRef] = Seq.empty,
      fetchSize: Int = 50
  )(implicit mat: org.apache.pekko.stream.Materializer): Source[JsObject, ?] = {
    logger.debug(s"queryRawMappedStream($query)")

    reactivePg.queryStreamSource(query, params, fetchSize) { row =>
      val fields = columns.flatMap(col => readCol(row, col).map(col.name -> _))
      Some(JsObject(fields))
    }
  }

  override def queryString(query: String, name: String, params: Seq[AnyRef])(
      implicit ec: ExecutionContext
  ): Future[Seq[String]] = {
    logger.debug(s"queryString($query)")

    for {
      value <- reactivePg.querySeq(query = query, params = params) { row =>
        row.optString(name)
      }
    } yield {
      value
    }
  }

  override def withTransaction[A](f: DbConn ?=> Future[A])(implicit
      ec: ExecutionContext
  ): Future[A] =
    reactivePg.withTransaction(f)

  override def start(): Future[Unit] = {
    Future.successful(())
  }

  override def stop(): Future[Unit] = Future.successful(())

  override def isEmpty(): Future[Boolean] = {
    checkIfTenantsTableExists()
      .flatMap {
        case true  => tenantRepo.count()
        case false => Future.successful(0L)
      }
      .map(_ == 0)
  }

  def checkIfTenantsTableExists(): Future[Boolean] =
    reactivePg
      .queryOne(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'tenants')",
        Seq(getSchema)
      ) { row =>
        row.optBoolean("exists")
      }
      .map(_.getOrElse(false))

  def checkDatabase(): Future[Unit] = {
    reactivePg
      .queryOne(
        "SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1",
        Seq(getSchema)
      ) { row =>
        row.optString("schema_name")
      }
      .flatMap {
        case Some(_) =>
          for {
            _ <- createDatabase()
            _ <- createIndexes()
          } yield ()
        case _ =>
          logger.info(s"Create missing schema : $getSchema")
          for {
            _ <- reactivePg.rawQuery(s"CREATE SCHEMA IF NOT EXISTS $getSchema")
            _ <- createDatabase()
            _ <- createIndexes()
          } yield ()
      }
      .recover { case e: Exception =>
        logger.error(e.getMessage)
        FastFuture.successful(())
      }
  }

  def createDatabase(): Future[Any] = {
    logger.debug("Checking status of database ...")
    Future.sequence(TABLES.map { case (key, value) => createTable(key, value) })
  }

  private def createIndexes(): Future[Unit] = {
    val indexes = Seq(
      "CREATE INDEX IF NOT EXISTS idx_api_team ON apis ((content->>'team'));",
      "CREATE INDEX IF NOT EXISTS idx_api_tenant ON apis ((content->>'_tenant'));",
      "CREATE INDEX IF NOT EXISTS idx_api_deleted ON apis ((content->>'_deleted'));",
      "CREATE INDEX IF NOT EXISTS idx_api_hrid ON apis ((content->>'_humanReadableId'));",
      "CREATE INDEX IF NOT EXISTS idx_api_version ON apis ((content->>'currentVersion'));",
      "CREATE INDEX IF NOT EXISTS idx_api_state ON apis ((content->>'state'));",
      "CREATE INDEX IF NOT EXISTS idx_api_plans ON apis USING GIN ((content->'possibleUsagePlans'));",
      "CREATE INDEX IF NOT EXISTS idx_notification_tenant ON notifications ((content->>'_tenant'));",
      "CREATE INDEX IF NOT EXISTS idx_notification_deleted ON notifications ((content->>'_deleted'));",
      "CREATE INDEX IF NOT EXISTS idx_notification_team ON notifications ((content->>'team'));",
      "CREATE INDEX IF NOT EXISTS idx_notification_action_team ON notifications ((content-> 'action' ->> 'team'));",
      "CREATE INDEX IF NOT EXISTS idx_notification_action_api ON notifications ((content-> 'action' ->> 'api'));",
      "CREATE INDEX IF NOT EXISTS idx_notification_action_plan ON notifications ((content-> 'action' ->> 'plan'));",
      "CREATE INDEX IF NOT EXISTS idx_notification_action_type ON notifications ((content-> 'action' ->> 'type'));",
      "CREATE INDEX IF NOT EXISTS idx_notification_status ON notifications ((content-> 'status' ->> 'status'));",
      "CREATE INDEX IF NOT EXISTS idx_team_tenant ON teams ((content->>'_tenant'));",
      "CREATE INDEX IF NOT EXISTS idx_team_deleted ON teams ((content->>'_deleted'));",
      "CREATE INDEX IF NOT EXISTS idx_team_hrid ON teams ((content->>'_humanReadableId'));",
      "CREATE INDEX IF NOT EXISTS idx_plan_tenant ON usage_plans ((content->>'_tenant'));",
      "CREATE INDEX IF NOT EXISTS idx_plan_deleted ON usage_plans ((content->>'_deleted'));",
      "CREATE INDEX IF NOT EXISTS idx_session_userid ON user_sessions ((content->>'userId'));",
      "CREATE INDEX IF NOT EXISTS idx_session_useremail ON user_sessions ((content->>'userEmail'));",
      "CREATE INDEX IF NOT EXISTS idx_session_expires ON user_sessions ((content->>'expires'));",
      "CREATE INDEX IF NOT EXISTS idx_user_deleted ON users ((content->>'_deleted'));",
      "CREATE INDEX IF NOT EXISTS idx_user_hrid ON users ((content->>'_humanReadableId'));",
      "CREATE INDEX IF NOT EXISTS idx_subscription_tenant ON api_subscriptions ((content->>'_tenant'));",
      "CREATE INDEX IF NOT EXISTS idx_subscription_api ON api_subscriptions ((content->>'api'));",
      "CREATE INDEX IF NOT EXISTS idx_subscription_plan ON api_subscriptions ((content->>'plan'));",
      "CREATE INDEX IF NOT EXISTS idx_subscription_keyring ON api_subscriptions ((content->>'keyring'));",
      "DROP INDEX IF EXISTS idx_subscription_parent;",
      "CREATE INDEX IF NOT EXISTS idx_subscription_by ON api_subscriptions ((content->>'by'));",
      "CREATE INDEX IF NOT EXISTS idx_subscription_enabled ON api_subscriptions ((content->>'enabled'));",
      "CREATE INDEX IF NOT EXISTS idx_subscription_created_at ON api_subscriptions ((content->>'createdAt'));",
      "CREATE INDEX IF NOT EXISTS idx_subscription_clientId ON api_subscriptions ((content-> 'apiKey' ->> 'clientId'));",
      "CREATE INDEX IF NOT EXISTS idx_subscription_team ON api_subscriptions ((content->>'team'));",
      "CREATE INDEX IF NOT EXISTS idx_keyring_tenant ON keyrings ((content->>'_tenant'));",
      "CREATE INDEX IF NOT EXISTS idx_keyring_deleted ON keyrings ((content->>'_deleted'));",
      "CREATE INDEX IF NOT EXISTS idx_keyring_clientId ON keyrings ((content-> 'apiKey' ->> 'clientId'));",
      "CREATE INDEX IF NOT EXISTS idx_demand_api ON subscription_demands ((content->>'api'));",
      "CREATE INDEX IF NOT EXISTS idx_demand_team ON subscription_demands ((content->>'team'));",
      "CREATE INDEX IF NOT EXISTS idx_demand_state ON subscription_demands ((content->>'state'));",
      "CREATE INDEX IF NOT EXISTS idx_job_started_at ON job_informations ((content->>'startedAt'));",
      "CREATE INDEX IF NOT EXISTS idx_job_name ON job_informations ((content->>'jobName'));",
      // `findLastRun` orders on the numeric value, which the text index above
      // cannot serve.
      "CREATE INDEX IF NOT EXISTS idx_job_started_at_num ON job_informations (((content->>'startedAt')::bigint));",
      // Resolving the tenant by hostname runs on every request in Hostname
      // mode, and `tenants` had no index at all.
      "CREATE INDEX IF NOT EXISTS idx_tenant_domain ON tenants ((content->>'domain'));",
      // Every login goes through the email.
      "CREATE INDEX IF NOT EXISTS idx_user_email ON users ((content->>'email'));",
      // `consumptions` is the largest table of a busy instance and had no
      // index either.
      "CREATE INDEX IF NOT EXISTS idx_consumption_tenant ON consumptions ((content->>'_tenant'));",
      "CREATE INDEX IF NOT EXISTS idx_consumption_client_id ON consumptions ((content->>'clientId'));",
      "CREATE INDEX IF NOT EXISTS idx_consumption_api ON consumptions ((content->>'api'));",
      "CREATE INDEX IF NOT EXISTS idx_consumption_team ON consumptions ((content->>'team'));",
      "CREATE INDEX IF NOT EXISTS idx_consumption_from ON consumptions (((content->>'from')::bigint));",
      // The sibling action paths were indexed, these were forgotten.
      "CREATE INDEX IF NOT EXISTS idx_notification_action_user ON notifications ((content-> 'action' ->> 'user'));",
      "CREATE INDEX IF NOT EXISTS idx_notification_action_demand ON notifications ((content-> 'action' ->> 'demand'));",
      "CREATE INDEX IF NOT EXISTS idx_notification_action_subscription ON notifications ((content-> 'action' ->> 'subscription'));",
      "CREATE INDEX IF NOT EXISTS idx_notification_action_keyring ON notifications ((content-> 'action' ->> 'keyring'));",
      // Chat lookups are all scoped to a chat.
      "CREATE INDEX IF NOT EXISTS idx_message_tenant ON messages ((content->>'_tenant'));",
      "CREATE INDEX IF NOT EXISTS idx_message_chat ON messages ((content->>'chat'));",
      // The root version of an api is resolved on every api page.
      "CREATE INDEX IF NOT EXISTS idx_api_parent ON apis ((content->>'parent'));",
      // Serving a CMS page resolves it by path.
      "CREATE INDEX IF NOT EXISTS idx_cms_tenant ON cmspages ((content->>'_tenant'));",
      "CREATE INDEX IF NOT EXISTS idx_cms_path ON cmspages ((content->>'path'));",
      // Assets are addressed by slug in urls.
      "CREATE INDEX IF NOT EXISTS idx_asset_tenant ON assets ((content->>'_tenant'));",
      "CREATE INDEX IF NOT EXISTS idx_asset_slug ON assets ((content->>'slug'));",
      // The deletion queue polls on the status.
      "CREATE INDEX IF NOT EXISTS idx_operation_tenant ON operations ((content->>'_tenant'));",
      "CREATE INDEX IF NOT EXISTS idx_operation_status ON operations ((content->>'status'));",
      // Mail validation links are claimed by token.
      "CREATE INDEX IF NOT EXISTS idx_step_validator_token ON step_validators ((content->>'token'));",
      "CREATE INDEX IF NOT EXISTS idx_step_validator_demand ON step_validators ((content->>'subscriptionDemand'));",
      // A translation is keyed by (key, language).
      "CREATE INDEX IF NOT EXISTS idx_translation_key_lang ON translations ((content->>'key'), (content->>'language'));",
      "CREATE INDEX IF NOT EXISTS idx_demand_plan ON subscription_demands ((content->>'plan'));",
      // `myTeams` sits behind nearly every page, and membership is the
      // predicate it filters on. Serves the `@>` of `TeamRepo.isMemberSql`.
      "CREATE INDEX IF NOT EXISTS idx_team_users ON teams USING GIN ((content->'users'));",
      """CREATE UNIQUE INDEX IF NOT EXISTS uniq_team_personal_user
        |ON teams ((content->>'_tenant'), (content->'users'->0->>'userId'))
        |WHERE _deleted = false AND content->>'type' = 'Personal';""".stripMargin
    )
    indexes.foldLeft(Future.successful(())) { (acc, query) =>
      acc.flatMap(_ => reactivePg.rawQuery(query).map(_ => ()))
    }
  }

  def createTable(table: String, allFields: Boolean): Future[Any] = {
    logger.debug(
      s"CREATE TABLE $getSchema.$table (" +
        s"_id character varying PRIMARY KEY," +
        s"${if (allFields) "_deleted BOOLEAN," else ""}" +
        s"content JSONB)"
    )

    reactivePg
      .query(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)",
        Seq(getSchema, table)
      )
      .map { r =>
        r.asScala.toSeq.head.getBoolean("exists")
      }
      .flatMap(exists => {
        if (!exists) {
          AppLogger.info(s"Create missing table : $table")
          reactivePg
            .rawQuery(
              s"CREATE TABLE $getSchema.$table (" +
                s"_id character varying PRIMARY KEY," +
                s"${if (allFields) "_deleted BOOLEAN," else ""}" +
                s"content JSONB)"
            )
            .map { _ =>
              AppLogger.info(s"Created : $table")
            }
        } else {
          FastFuture.successful(())
        }
      })
  }

  override def exportAsStream(
      pretty: Boolean,
      exportAuditTrail: Boolean = true
  )(implicit
      ec: ExecutionContext,
      mat: Materializer,
      env: Env
  ): Source[ByteString, ?] = {
    val collections = ListBuffer[Repo[?, ?]]()
    collections ++= List(
      tenantRepo,
      userRepo,
      passwordResetRepo,
      accountCreationRepo,
      userSessionRepo,
      evolutionRepo
    )
    collections ++= List(
      teamRepo.forAllTenant(),
      apiRepo.forAllTenant(),
      apiSubscriptionRepo.forAllTenant(),
      apiDocumentationPageRepo.forAllTenant(),
      apiPostRepo.forAllTenant(),
      apiIssueRepo.forAllTenant(),
      notificationRepo.forAllTenant(),
      consumptionRepo.forAllTenant(),
      translationRepo.forAllTenant(),
      messageRepo.forAllTenant(),
      operationRepo.forAllTenant(),
      emailVerificationRepo.forAllTenant(),
      cmsRepo.forAllTenant(),
      assetRepo.forAllTenant(),
      stepValidatorRepo.forAllTenant(),
      subscriptionDemandRepo.forAllTenant(),
      usagePlanRepo.forAllTenant(),
      apiSubscriptionTransferRepo.forAllTenant(),
      keyringRepo.forAllTenant()
    )

    if (exportAuditTrail) {
      collections += auditTrailRepo.forAllTenant()
    }
    Source(collections.toList).flatMapConcat { collection =>
      collection.streamAllRaw().map { doc =>
        if (pretty) {
          ByteString(
            Json.prettyPrint(
              Json.obj("type" -> collection.tableName, "payload" -> doc)
            ) + "\n"
          )
        } else {
          ByteString(
            Json.stringify(
              Json.obj("type" -> collection.tableName, "payload" -> doc)
            ) + "\n"
          )
        }
      }
    }
  }

  override def importFromStream(source: Source[ByteString, ?]): Future[Unit] = {
    logger.debug("importFromStream")

    Future
      .sequence(TABLES.map { case (key, _) =>
        reactivePg.rawQuery(s"TRUNCATE $key")
      })
      .flatMap { _ =>
        source
          .via(
            Framing
              .delimiter(ByteString("\n"), 1000000000, allowTruncation = true)
          )
          .map(_.utf8String)
          .map(Json.parse)
          .map(json => json.as[JsObject])
          .map(json => {
            (
              (json \ "type").as[String].toLowerCase.replace("_", ""),
              (json \ "payload").as[JsValue]
            )
          })
          .mapAsync(1) {
            case ("tenants", payload) =>
              tenantRepo.save(TenantFormat.reads(payload).get)
            case ("passwordreset", payload) =>
              passwordResetRepo.save(PasswordResetFormat.reads(payload).get)
            case ("evolutions", payload) =>
              evolutionRepo.save(EvolutionFormat.reads(payload).get)
            case ("accountcreation", payload) =>
              accountCreationRepo.save(AccountCreationFormat.reads(payload).get)
            case ("users", payload) =>
              userRepo.save(UserFormat.reads(payload).get)
            case ("teams", payload) =>
              teamRepo
                .forAllTenant()
                .save(TeamFormat.reads(payload).get)
            case ("apis", payload) =>
              apiRepo
                .forAllTenant()
                .save(ApiFormat.reads(payload).get)
            case ("apisubscriptions", payload) =>
              apiSubscriptionRepo
                .forAllTenant()
                .save(ApiSubscriptionFormat.reads(payload).get)
            case ("apidocumentationpages", payload) =>
              apiDocumentationPageRepo
                .forAllTenant()
                .save(ApiDocumentationPageFormat.reads(payload).get)
            case ("apiposts", payload) =>
              apiPostRepo
                .forAllTenant()
                .save(ApiPostFormat.reads(payload).get)
            case ("apiissues", payload) =>
              apiIssueRepo
                .forAllTenant()
                .save(ApiIssueFormat.reads(payload).get)
            case ("notifications", payload) =>
              notificationRepo
                .forAllTenant()
                .save(NotificationFormat.reads(payload).get)
            case ("consumptions", payload) =>
              consumptionRepo
                .forAllTenant()
                .save(ConsumptionFormat.reads(payload).get)
            case ("translations", payload) =>
              translationRepo
                .forAllTenant()
                .save(TranslationFormat.reads(payload).get)
            case ("auditevents", payload) =>
              auditTrailRepo
                .forAllTenant()
                .save(payload.as[JsObject])
            case ("usersessions", payload) =>
              userSessionRepo.save(UserSessionFormat.reads(payload).get)
            case ("stepvalidators", payload) =>
              stepValidatorRepo
                .forAllTenant()
                .save(json.StepValidatorFormat.reads(payload).get)
            case ("subscriptiondemands", payload) =>
              subscriptionDemandRepo
                .forAllTenant()
                .save(json.SubscriptionDemandFormat.reads(payload).get)
            case ("usageplans", payload) =>
              usagePlanRepo
                .forAllTenant()
                .save(json.UsagePlanFormat.reads(payload).get)
            case ("cmspages", payload) =>
              cmsRepo
                .forAllTenant()
                .save(json.CmsPageFormat.reads(payload).get)
            case ("assets", payload) =>
              assetRepo
                .forAllTenant()
                .save(json.AssetFormat.reads(payload).get)
            case ("emailverifications", payload) =>
              emailVerificationRepo
                .forAllTenant()
                .save(json.EmailVerificationFormat.reads(payload).get)
            case ("apisubscriptiontransfers", payload) =>
              apiSubscriptionTransferRepo
                .forAllTenant()
                .save(json.ApiSubscriptionTransferFormat.reads(payload).get)
            case ("keyrings", payload) =>
              keyringRepo
                .forAllTenant()
                .save(json.KeyringFormat.reads(payload).get)
            case (typ, _) =>
              logger.error(s"Unknown type: $typ")
              FastFuture.successful(false)
          }
          .toMat(Sink.ignore)(Keep.right)
          .run()(using env.defaultMaterializer)
      }
      .map(_ => logger.info("importFromStream ended"))
  }

  override def clear() = {
    Source
      .future(
        reactivePg
          .query(
            "select 'drop table if exists \"' || tablename || '\" cascade;' as query from pg_tables where schemaname = 'public';"
          )
          .map(r => r.asScala.toSeq.map(_.getString("query")))
      )
      .mapConcat(identity)
      .mapAsync(5)(query => {
        reactivePg.query(query)
      })
      .runWith(Sink.ignore)(using env.defaultMaterializer)
      .map(_ => ())
  }
}

class PostgresTenantRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[Tenant, TenantId](env, reactivePg)
    with TenantRepo {
  override def tableName: String = "tenants"

  override def format: Format[Tenant] = json.TenantFormat

  override def extractId(value: Tenant): String = value.id.value
}

class PostgresPasswordResetRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[PasswordReset, DatastoreId](env, reactivePg)
    with PasswordResetRepo {
  override def tableName: String = "password_reset"

  override def format: Format[PasswordReset] = json.PasswordResetFormat

  override def extractId(value: PasswordReset): String = value.id.value
}
class PostgresReportsInfoRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[ReportsInfo, DatastoreId](env, reactivePg)
    with ReportsInfoRepo {
  override def tableName: String = "reports_info"

  override def format: Format[ReportsInfo] = json.ReportsInfoFormat

  override def extractId(value: ReportsInfo): String = value.id.value
}
class PostgresAccountCreationRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[AccountCreation, DemandId](env, reactivePg)
    with AccountCreationRepo {
  override def tableName: String = "account_creation"

  override def format: Format[AccountCreation] = json.AccountCreationFormat

  override def extractId(value: AccountCreation): String = value.id.value
}

class PostgresTenantTeamRepo(env: Env, reactivePg: ReactivePg, tenant: TenantId)
    extends PostgresTenantAwareRepo[Team, TeamId](env, reactivePg, tenant) {
  override def tableName: String = "teams"

  override def format: Format[Team] = json.TeamFormat

  override def extractId(value: Team): String = value.id.value
}

class PostgresTenantApiRepo(env: Env, reactivePg: ReactivePg, tenant: TenantId)
    extends PostgresTenantAwareRepo[Api, ApiId](env, reactivePg, tenant) {
  override def format: Format[Api] = json.ApiFormat

  override def tableName: String = "apis"

  override def extractId(value: Api): String = value.id.value
}

class PostgresTenantTranslationRepo(
    env: Env,
    reactivePg: ReactivePg,
    tenant: TenantId
) extends PostgresTenantAwareRepo[Translation, DatastoreId](
      env,
      reactivePg,
      tenant
    ) {
  override def tableName: String = "translations"

  override def format: Format[Translation] = json.TranslationFormat

  override def extractId(value: Translation): String = value.id.value
}

class PostgresTenantMessageRepo(
    env: Env,
    reactivePg: ReactivePg,
    tenant: TenantId
) extends PostgresTenantAwareRepo[Message, DatastoreId](
      env,
      reactivePg,
      tenant
    ) {
  override def tableName: String = "messages"

  override def format: Format[Message] = json.MessageFormat

  override def extractId(value: Message): String = value.id.value
}
class PostgresTenantOperationRepo(
    env: Env,
    reactivePg: ReactivePg,
    tenant: TenantId
) extends PostgresTenantAwareRepo[Operation, DatastoreId](
      env,
      reactivePg,
      tenant
    ) {
  override def tableName: String = "operations"

  override def format: Format[Operation] = json.OperationFormat

  override def extractId(value: Operation): String = value.id.value
}

class PostgresTenantEmailVerificationRepo(
    env: Env,
    reactivePg: ReactivePg,
    tenant: TenantId
) extends PostgresTenantAwareRepo[EmailVerification, DatastoreId](
      env,
      reactivePg,
      tenant
    ) {
  override def tableName: String = "email_verifications"
  override def format: Format[EmailVerification] = json.EmailVerificationFormat

  override def extractId(value: EmailVerification): String = value.id.value

}

class PostgresTenantSubscriptionDemandRepo(
    env: Env,
    reactivePg: ReactivePg,
    tenant: TenantId
) extends PostgresTenantAwareRepo[SubscriptionDemand, DemandId](
      env,
      reactivePg,
      tenant
    ) {
  override def tableName: String = "subscription_demands"

  override def format: Format[SubscriptionDemand] =
    json.SubscriptionDemandFormat

  override def extractId(value: SubscriptionDemand): String = value.id.value
}
class PostgresTenantJobInformationRepo(
    env: Env,
    reactivePg: ReactivePg,
    tenant: TenantId
) extends PostgresTenantAwareRepo[JobInformation, DatastoreId](
      env,
      reactivePg,
      tenant
    ) {
  override def tableName: String = "job_informations"

  override def format: Format[JobInformation] =
    json.JobInformationFormat

  override def extractId(value: JobInformation): String = value.id.value
}

class PostgresTenantStepValidatorRepo(
    env: Env,
    reactivePg: ReactivePg,
    tenant: TenantId
) extends PostgresTenantAwareRepo[StepValidator, DatastoreId](
      env,
      reactivePg,
      tenant
    ) {
  override def tableName: String = "step_validators"

  override def format: Format[StepValidator] = json.StepValidatorFormat

  override def extractId(value: StepValidator): String = value.id.value
}

class PostgresTenantUsagePlanRepo(
    env: Env,
    reactivePg: ReactivePg,
    tenant: TenantId
) extends PostgresTenantAwareRepo[UsagePlan, UsagePlanId](
      env,
      reactivePg,
      tenant
    ) {
  override def tableName: String = "usage_plans"

  override def format: Format[UsagePlan] = json.UsagePlanFormat

  override def extractId(value: UsagePlan): String = value.id.value
}

class PostgresTenantApiSubscriptionTransferRepo(
    env: Env,
    reactivePg: ReactivePg,
    tenant: TenantId
) extends PostgresTenantAwareRepo[ApiSubscriptionTransfer, DatastoreId](
      env,
      reactivePg,
      tenant
    ) {

  override def tableName: String = "api_subscription_transfers"

  override def format: Format[ApiSubscriptionTransfer] =
    json.ApiSubscriptionTransferFormat

  override def extractId(value: ApiSubscriptionTransfer): String =
    value.id.value
}

class PostgresTenantCmsPageRepo(
    env: Env,
    reactivePg: ReactivePg,
    tenant: TenantId
) extends PostgresTenantAwareRepo[CmsPage, CmsPageId](
      env,
      reactivePg,
      tenant
    ) {
  override def tableName: String = "cmspages"

  override def format: Format[CmsPage] = json.CmsPageFormat

  override def extractId(value: CmsPage): String = value.id.value
}

class PostgresTenantAssetRepo(
    env: Env,
    reactivePg: ReactivePg,
    tenant: TenantId
) extends PostgresTenantAwareRepo[Asset, AssetId](
      env,
      reactivePg,
      tenant
    ) {
  override def tableName: String = "assets"

  override def format: Format[Asset] = json.AssetFormat

  override def extractId(value: Asset): String = value.id.value
}

class PostgresTenantApiSubscriptionRepo(
    env: Env,
    reactivePg: ReactivePg,
    tenant: TenantId
) extends PostgresTenantAwareRepo[ApiSubscription, ApiSubscriptionId](
      env,
      reactivePg,
      tenant
    ) {
  override def tableName: String = "api_subscriptions"

  override def format: Format[ApiSubscription] = json.ApiSubscriptionFormat

  override def extractId(value: ApiSubscription): String = value.id.value
}

class PostgresTenantKeyringRepo(
    env: Env,
    reactivePg: ReactivePg,
    tenant: TenantId
) extends PostgresTenantAwareRepo[Keyring, KeyringId](
      env,
      reactivePg,
      tenant
    ) {
  override def tableName: String = "keyrings"

  override def format: Format[Keyring] = json.KeyringFormat

  override def extractId(value: Keyring): String = value.id.value
}

class PostgresTenantApiDocumentationPageRepo(
    env: Env,
    reactivePg: ReactivePg,
    tenant: TenantId
) extends PostgresTenantAwareRepo[
      ApiDocumentationPage,
      ApiDocumentationPageId
    ](env, reactivePg, tenant) {
  override def tableName: String = "api_documentation_pages"

  override def format: Format[ApiDocumentationPage] =
    json.ApiDocumentationPageFormat

  override def extractId(value: ApiDocumentationPage): String = value.id.value
}

class PostgresTenantApiPostRepo(
    env: Env,
    reactivePg: ReactivePg,
    tenant: TenantId
) extends PostgresTenantAwareRepo[ApiPost, ApiPostId](
      env,
      reactivePg,
      tenant
    ) {
  override def tableName: String = "api_posts"

  override def format: Format[ApiPost] = json.ApiPostFormat

  override def extractId(value: ApiPost): String = value.id.value
}

class PostgresTenantApiIssueRepo(
    env: Env,
    reactivePg: ReactivePg,
    tenant: TenantId
) extends PostgresTenantAwareRepo[ApiIssue, ApiIssueId](
      env,
      reactivePg,
      tenant
    ) {
  override def tableName: String = "api_issues"

  override def format: Format[ApiIssue] = json.ApiIssueFormat

  override def extractId(value: ApiIssue): String = value.id.value
}

class PostgresTenantNotificationRepo(
    env: Env,
    reactivePg: ReactivePg,
    tenant: TenantId
) extends PostgresTenantAwareRepo[Notification, NotificationId](
      env,
      reactivePg,
      tenant
    ) {
  override def tableName: String = "notifications"

  override def format: Format[Notification] =
    json.NotificationFormat

  override def extractId(value: Notification): String = value.id.value
}

class PostgresTenantConsumptionRepo(
    env: Env,
    reactivePg: ReactivePg,
    tenant: TenantId
) extends PostgresTenantAwareRepo[ApiKeyConsumption, DatastoreId](
      env,
      reactivePg,
      tenant
    ) {
  override def tableName: String = "consumptions"

  override def format: Format[ApiKeyConsumption] =
    json.ConsumptionFormat

  override def extractId(value: ApiKeyConsumption): String = value.id.value
}

class PostgresTenantAuditTrailRepo(
    env: Env,
    reactivePg: ReactivePg,
    tenant: TenantId
) extends PostgresTenantAwareRepo[JsObject, DatastoreId](
      env,
      reactivePg,
      tenant
    ) {
  val _fmt = new Format[JsObject] {
    override def reads(json: JsValue): JsResult[JsObject] =
      JsSuccess(json.as[JsObject])

    override def writes(o: JsObject): JsValue = o
  }

  override def tableName: String = "audit_events"

  override def format: Format[JsObject] = _fmt

  override def extractId(value: JsObject): String = (value \ "_id").as[String]
}

class PostgresUserRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[User, UserId](env, reactivePg)
    with UserRepo {
  override def tableName: String = "users"

  override def format: Format[User] = json.UserFormat

  override def extractId(value: User): String = value.id.value
}

class PostgresTeamRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[Team, TeamId](env, reactivePg) {
  override def tableName: String = "teams"

  override def format: Format[Team] = json.TeamFormat

  override def extractId(value: Team): String = value.id.value
}

class PostgresEvolutionRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[Evolution, DatastoreId](env, reactivePg)
    with EvolutionRepo {
  override def tableName: String = "evolutions"

  override def format: Format[Evolution] = json.EvolutionFormat

  override def extractId(value: Evolution): String = value.id.value
}

class PostgresTranslationRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[Translation, DatastoreId](env, reactivePg) {
  override def tableName: String = "translations"

  override def format: Format[Translation] = json.TranslationFormat

  override def extractId(value: Translation): String = value.id.value
}

class PostgresMessageRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[Message, DatastoreId](env, reactivePg) {
  override def tableName: String = "messages"

  override def format: Format[Message] = json.MessageFormat

  override def extractId(value: Message): String = value.id.value
}

class PostgresCmsPageRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[CmsPage, CmsPageId](env, reactivePg) {
  override def tableName: String = "cmspages"

  override def format: Format[CmsPage] = json.CmsPageFormat

  override def extractId(value: CmsPage): String = value.id.value
}

class PostgresAssetRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[Asset, AssetId](env, reactivePg) {
  override def tableName: String = "assets"

  override def format: Format[Asset] = json.AssetFormat

  override def extractId(value: Asset): String = value.id.value
}

class PostgresOperationRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[Operation, DatastoreId](env, reactivePg) {
  override def tableName: String = "operations"

  override def format: Format[Operation] = json.OperationFormat

  override def extractId(value: Operation): String = value.id.value
}

class PostgresEmailVerificationRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[EmailVerification, DatastoreId](env, reactivePg) {
  override def tableName: String = "email_verifications"
  override def format: Format[EmailVerification] = json.EmailVerificationFormat
  override def extractId(value: EmailVerification): String = value.id.value
}

class PostgresSubscriptionDemandRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[SubscriptionDemand, DemandId](
      env,
      reactivePg
    ) {
  override def tableName: String = "subscription_demands"

  override def format: Format[SubscriptionDemand] =
    json.SubscriptionDemandFormat

  override def extractId(value: SubscriptionDemand): String = value.id.value
}
class PostgresJobInformationRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[JobInformation, DatastoreId](
      env,
      reactivePg
    ) {
  override def tableName: String = "job_informations"

  override def format: Format[JobInformation] =
    json.JobInformationFormat

  override def extractId(value: JobInformation): String = value.id.value
}

class PostgresStepValidatorRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[StepValidator, DatastoreId](env, reactivePg) {
  override def tableName: String = "step_validators"

  override def format: Format[StepValidator] = json.StepValidatorFormat

  override def extractId(value: StepValidator): String = value.id.value
}
class PostgresUsagePlanRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[UsagePlan, UsagePlanId](env, reactivePg) {
  override def tableName: String = "usage_plans"

  override def format: Format[UsagePlan] = json.UsagePlanFormat

  override def extractId(value: UsagePlan): String = value.id.value
}

class PostgresApiSubscriptionTransferRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[ApiSubscriptionTransfer, DatastoreId](
      env,
      reactivePg
    ) {
  override def tableName: String = "api_subscription_transfers"

  override def format: Format[ApiSubscriptionTransfer] =
    json.ApiSubscriptionTransferFormat

  override def extractId(value: ApiSubscriptionTransfer): String =
    value.id.value
}

class PostgresApiRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[Api, ApiId](env, reactivePg) {
  override def tableName: String = "apis"

  override def format: Format[Api] = json.ApiFormat

  override def extractId(value: Api): String = value.id.value
}

class PostgresApiSubscriptionRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[ApiSubscription, ApiSubscriptionId](env, reactivePg) {
  override def tableName: String = "api_subscriptions"

  override def format: Format[ApiSubscription] = json.ApiSubscriptionFormat

  override def extractId(value: ApiSubscription): String = value.id.value
}

class PostgresKeyringRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[Keyring, KeyringId](env, reactivePg) {
  override def tableName: String = "keyrings"

  override def format: Format[Keyring] = json.KeyringFormat

  override def extractId(value: Keyring): String = value.id.value
}

class PostgresApiDocumentationPageRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[ApiDocumentationPage, ApiDocumentationPageId](
      env,
      reactivePg
    ) {
  override def tableName: String = "api_documentation_pages"

  override def format: Format[ApiDocumentationPage] =
    json.ApiDocumentationPageFormat

  override def extractId(value: ApiDocumentationPage): String = value.id.value
}

class PostgresApiPostRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[ApiPost, ApiPostId](env, reactivePg) {
  override def tableName: String = "api_posts"

  override def format: Format[ApiPost] = json.ApiPostFormat

  override def extractId(value: ApiPost): String = value.id.value
}

class PostgresApiIssueRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[ApiIssue, ApiIssueId](env, reactivePg) {
  override def tableName: String = "api_issues"

  override def format: Format[ApiIssue] = json.ApiIssueFormat

  override def extractId(value: ApiIssue): String = value.id.value
}

class PostgresNotificationRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[Notification, NotificationId](env, reactivePg) {
  override def tableName: String = "notifications"

  override def format: Format[Notification] =
    json.NotificationFormat

  override def extractId(value: Notification): String = value.id.value
}

class PostgresConsumptionRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[ApiKeyConsumption, DatastoreId](env, reactivePg) {
  override def tableName: String = "consumptions"

  override def format: Format[ApiKeyConsumption] = json.ConsumptionFormat

  override def extractId(value: ApiKeyConsumption): String = value.id.value
}

class PostgresUserSessionRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[UserSession, DatastoreId](env, reactivePg)
    with UserSessionRepo {
  override def tableName: String = "user_sessions"

  override def format: Format[UserSession] =
    json.UserSessionFormat

  override def extractId(value: UserSession): String = value.id.value
}

class PostgresAuditTrailRepo(env: Env, reactivePg: ReactivePg)
    extends PostgresRepo[JsObject, DatastoreId](env, reactivePg) {
  val _fmt = new Format[JsObject] {
    override def reads(json: JsValue): JsResult[JsObject] =
      JsSuccess(json.as[JsObject])

    override def writes(o: JsObject): JsValue = o
  }

  override def tableName: String = "audit_events"

  override def format: Format[JsObject] = _fmt

  override def extractId(value: JsObject): String = (value \ "_id").as[String]
}

abstract class PostgresRepo[Of, Id <: ValueType](
    env: Env,
    reactivePg: ReactivePg
) extends CommonRepo[Of, Id](env, reactivePg) {

  private implicit lazy val logger: Logger = Logger(s"PostgresRepo")

  override def query(query: String, params: Seq[AnyRef] = Seq.empty)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Of]] = {
    logger.debug(s"$tableName.query($query)")
    reactivePg.querySeq(query, params) {
      rowToJson(_, format)
    }
  }

  override def queryOne(query: String, params: Seq[AnyRef])(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Of]] = {
    logger.debug(s"$tableName.queryOne($query)")
    reactivePg.queryOne(query, params) {
      rowToJson(_, format)
    }
  }

  override def queryPaginated(
      query: String,
      params: Seq[AnyRef] = Seq.empty,
      offset: Int,
      limit: Int
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[(Seq[Of], Long)] = {
    logger.debug(s"$tableName.queryPaginated($query)")
    logger.debug(s"[PARAMS] :: ${params.mkString(" - ")}")

    for {
      count <-
        reactivePg
          .queryOne(s"select count(*) as counter from ($query)_", params)(row =>
            row.optLong("counter")
          )
          .map {
            case Some(l) => l
            case None    => 0L
          }
      values <-
        reactivePg.querySeq(s"$query LIMIT $limit OFFSET $offset", params) {
          rowToJson(_, format)
        }
    } yield (values, count)
  }

  override def execute(sql: String, params: Seq[AnyRef])(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] = {
    logger.debug(s"$tableName.execute($sql)")
    logger.debug(s"[PARAMS] :: ${params.mkString(" - ")}")

    reactivePg.execute(sql, params)
  }

  override def count()(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] =
    queryCount(s"SELECT COUNT(*) AS count FROM $tableName")

  override def deleteByIdLogically(
      id: String
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Boolean] = {
    logger.debug(s"$tableName.deleteByIdLogically($id)")
    reactivePg
      .query(
        s"UPDATE $tableName " +
          "SET _deleted = true, content = content || '{ \"_deleted\" : true }' " +
          s"WHERE _id = $$1 AND _deleted = false  RETURNING _id",
        Seq(id)
      )
      .map(_.size() > 0)
  }

  override def deleteByIdLogically(
      id: Id
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Boolean] = {
    logger.debug(s"$tableName.deleteByIdLogically($id)")
    deleteByIdLogically(id.value)
  }

  override def deleteAllLogically()(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Boolean] = {
    logger.debug(s"$tableName.deleteAllLogically()")
    reactivePg
      .query(
        s"UPDATE $tableName " +
          "SET _deleted = true, content = content || '{ \"_deleted\" : true }' " +
          "WHERE _deleted = false RETURNING _id"
      )
      .map(_.size() > 0)
  }

}

abstract class PostgresTenantAwareRepo[Of, Id <: ValueType](
    env: Env,
    reactivePg: ReactivePg,
    tenant: TenantId
) extends CommonRepo[Of, Id](env, reactivePg) {

  implicit val logger: Logger = Logger(s"PostgresTenantAwareRepo")

  // Makes the generic helpers of `Repo` scope their SQL to this tenant.
  override protected def tenantScope: Option[String] = Some(tenant.value)

  override def query(query: String, params: Seq[AnyRef] = Seq.empty)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Of]] = {
    logger.debug(s"$tableName.query($query)")
    reactivePg.querySeq(query, params) {
      rowToJson(_, format)
    }
  }

  override def queryOne(query: String, params: Seq[AnyRef])(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Option[Of]] = {
    logger.debug(s"$tableName.query($query)")
    reactivePg.queryOne(query, params) {
      rowToJson(_, format)
    }
  }

  override def execute(sql: String, params: Seq[AnyRef])(implicit
      dbConn: DbConn,
      ex: ExecutionContext
  ): Future[Long] = {
    logger.debug(s"$tableName.execute($sql)")
    logger.debug(s"[PARAMS] :: ${params.mkString(" - ")}")

    reactivePg.execute(sql, params)
  }

  override def queryPaginated(
      query: String,
      params: Seq[AnyRef] = Seq.empty,
      offset: Int,
      limit: Int
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[(Seq[Of], Long)] = {
    logger.debug(s"$tableName.query($query)")
    logger.debug(s"[PARAMS] :: ${params.mkString(" - ")}")

    def legitLimit: String = if (limit == -1) null else s"$limit"

    for {
      count <-
        reactivePg
          .queryOne(s"select count(*) as counter from ($query)_", params)(row =>
            row.optLong("counter")
          )
          .map {
            case Some(l) => l
            case None    => 0L
          }
      values <- reactivePg.querySeq(
        s"$query LIMIT $legitLimit OFFSET $offset",
        params
      ) {
        rowToJson(_, format)
      }
    } yield (values, count)
  }

  override def deleteByIdLogically(
      id: String
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Boolean] = {
    logger.debug(s"$tableName.deleteByIdLogically($id)")

    reactivePg
      .query(
        s"UPDATE $tableName " +
          "SET _deleted = true, content = content || '{ \"_deleted\" : true }' " +
          s"WHERE _id = $$1 AND content ->> '_tenant' = $$2  RETURNING _id",
        Seq(id, tenant.value)
      )
      .map(_.size() > 0)
  }

  override def deleteByIdLogically(
      id: Id
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Boolean] = {
    deleteByIdLogically(id.value)
  }

  override def deleteAllLogically()(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Boolean] = {
    logger.debug(s"$tableName.deleteAllLogically()")

    reactivePg
      .query(
        s"UPDATE $tableName " +
          "SET _deleted = true, content = content || '{ \"_deleted\" : true }' " +
          s"WHERE content ->> '_tenant' = $$1 AND _deleted = false  RETURNING _id",
        Seq(tenant.value)
      )
      .map(_.size() > 0)
  }

  override def insertMany(
      values: Seq[Of]
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Long] =
    super.insertMany(values, Json.obj("_tenant" -> tenant.value))

  override def count()(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] =
    queryCount(
      s"SELECT COUNT(*) AS count FROM $tableName " +
        "WHERE content->>'_tenant' = $1",
      Seq(tenant.value)
    )

}

abstract class CommonRepo[Of, Id <: ValueType](env: Env, reactivePg: ReactivePg)
    extends Repo[Of, Id] {

  private implicit val logger: Logger = Logger("CommonPostgresRepo")

  val jsObjectWrites: OWrites[JsObject] = (o: JsObject) => o

  implicit val jsObjectFormat: OFormat[JsObject] = new OFormat[JsObject] {
    override def reads(json: JsValue): JsResult[JsObject] =
      json.validate[JsObject](using Reads.JsObjectReads)

    override def writes(o: JsObject): JsObject = o
  }

  /** Loads the whole table and emits it row by row. Not a streaming read: the
    * rows are materialised first, which is what the JsObject version did too.
    * Only the evolutions and the export use it.
    */
  /** Walks the whole table through a server-side cursor: memory stays bounded
    * by `fetchSize`, whatever the table holds. Uses the repo's own materializer
    * so callers keep their signature.
    *
    * Streaming opens its own transaction — a cursor only lives inside one —
    * which is why these two are excluded from `DbConn`.
    */
  override def streamAllRaw()(implicit
      ec: ExecutionContext
  ): Source[JsValue, ?] = {
    logger.debug(s"$tableName.streamAllRaw()")

    reactivePg.queryStreamSource(s"SELECT content FROM $tableName")(row =>
      row.optJsObject("content")
    )(using env.defaultMaterializer)
  }

  override def streamAllRawFormatted()(implicit
      ec: ExecutionContext
  ): Source[Of, ?] = {
    logger.debug(s"$tableName.streamAllRawFormatted()")

    reactivePg.queryStreamSource(s"SELECT content FROM $tableName")(row =>
      row.optJsObject("content").map(format.reads).collect {
        case JsSuccess(value, _) => value
      }
    )(using env.defaultMaterializer)
  }

  override def saveRaw(id: String, payload: JsObject)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Boolean] = {
    logger.debug(s"$tableName.saveRaw($id)")

    (
      if (payload.keys.contains("_deleted"))
        reactivePg.query(
          s"INSERT INTO $tableName(_id, _deleted, content) VALUES($$1,$$2,$$3) " +
            "ON CONFLICT (_id) DO UPDATE " +
            s"set _deleted = $$2, content = $$3",
          Seq(
            id,
            java.lang.Boolean.valueOf((payload \ "_deleted").as[Boolean]),
            new JsonObject(Json.stringify(payload))
          )
        )
      else
        reactivePg.query(
          s"INSERT INTO $tableName(_id, content) VALUES($$1,$$2) " +
            "ON CONFLICT (_id) DO UPDATE " +
            s"set content = $$2",
          Seq(id, new JsonObject(Json.stringify(payload)))
        )
    ).map(_ => true)
      .recover { e =>
        logger.error(s"$tableName.saveRaw($id) failed", e)
        false
      }
  }

  def insertMany(values: Seq[Of], addToPayload: JsObject)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] = {
    logger.debug(s"$tableName.insertMany()")

    Future
      .sequence(
        values
          .map { v =>
            val payload = format.writes(v).as[JsObject] ++ addToPayload
            saveRaw((payload \ "_id").as[String], payload)
          }
      )
      .map(_ => 1L)
  }

  override def insertMany(
      values: Seq[Of]
  )(implicit dbConn: DbConn, ec: ExecutionContext): Future[Long] =
    insertMany(values, Json.obj())

  override protected def queryExists(sql: String, params: Seq[AnyRef])(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Boolean] = {
    logger.debug(s"$tableName.queryExists($sql)")

    reactivePg.query(sql, params).map(_.size() > 0)
  }

  override def queryCount(sql: String, params: Seq[AnyRef])(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Long] = {
    logger.debug(s"$tableName.queryCount($sql)")

    reactivePg
      .queryOne(sql, params)(_.optLong("count"))
      .map(_.getOrElse(0L))
  }

  override def queryTyped(sql: String, params: Seq[AnyRef] = Seq.empty)(implicit
      dbConn: DbConn,
      ec: ExecutionContext
  ): Future[Seq[Of]] = {
    logger.debug(s"$tableName.queryTyped($sql)")

    reactivePg.querySeq(sql, params)(rowToJson(_, format))
  }

}
