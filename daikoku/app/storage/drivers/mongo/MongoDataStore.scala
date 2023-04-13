package storage.drivers.mongo

import akka.NotUsed
import akka.http.scaladsl.util.FastFuture
import akka.stream.Materializer
import akka.stream.scaladsl.{Framing, Keep, Sink, Source}
import akka.util.ByteString
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json._
import fr.maif.otoroshi.daikoku.env.Env
import play.api.ApplicationLoader.Context
import play.api.Logger
import play.api.libs.json._
import play.api.routing.Router
import play.modules.reactivemongo.{
  ReactiveMongoApi,
  ReactiveMongoApiFromContext
}
import reactivemongo.api.{
  Cursor,
  CursorOptions,
  ReadConcern,
  ReadPreference,
  WriteConcern
}
import reactivemongo.play.json.collection.JSONCollection
import storage._

import scala.collection.mutable.ListBuffer
import scala.concurrent.{ExecutionContext, Future}

trait RepositoryMongo[Of, Id <: ValueType] extends Repo[Of, Id] {
  override def tableName: String = "ignored"
}

trait MongoTenantCapableRepo[A, Id <: ValueType]
    extends TenantCapableRepo[A, Id] {

  def repo(): MongoRepo[A, Id]

  def tenantRepo(tenant: TenantId): MongoTenantAwareRepo[A, Id]

  override def forTenant(tenant: TenantId): Repo[A, Id] = tenantRepo(tenant)

  override def forTenantF(tenant: TenantId): Future[Repo[A, Id]] =
    Future.successful(tenantRepo(tenant))

  override def forAllTenant(): Repo[A, Id] = repo()

  override def forAllTenantF(): Future[Repo[A, Id]] = Future.successful(repo())
}

case class MongoTenantCapableTeamRepo(
    _repo: () => MongoRepo[Team, TeamId],
    _tenantRepo: TenantId => MongoTenantAwareRepo[Team, TeamId])
    extends MongoTenantCapableRepo[Team, TeamId]
    with TeamRepo {
  override def tenantRepo(
      tenant: TenantId): MongoTenantAwareRepo[Team, TeamId] =
    _tenantRepo(tenant)

  override def repo(): MongoRepo[Team, TeamId] = _repo()
}

case class MongoTenantCapableApiRepo(
    _repo: () => MongoRepo[Api, ApiId],
    _tenantRepo: TenantId => MongoTenantAwareRepo[Api, ApiId])
    extends MongoTenantCapableRepo[Api, ApiId]
    with ApiRepo {
  override def tenantRepo(tenant: TenantId): MongoTenantAwareRepo[Api, ApiId] =
    _tenantRepo(tenant)

  override def repo(): MongoRepo[Api, ApiId] = _repo()
}

case class MongoTenantCapableApiSubscriptionRepo(
    _repo: () => MongoRepo[ApiSubscription, ApiSubscriptionId],
    _tenantRepo: TenantId => MongoTenantAwareRepo[ApiSubscription,
                                                  ApiSubscriptionId]
) extends MongoTenantCapableRepo[ApiSubscription, ApiSubscriptionId]
    with ApiSubscriptionRepo {
  override def tenantRepo(tenant: TenantId)
    : MongoTenantAwareRepo[ApiSubscription, ApiSubscriptionId] =
    _tenantRepo(tenant)

  override def repo(): MongoRepo[ApiSubscription, ApiSubscriptionId] = _repo()
}

case class MongoTenantCapableApiDocumentationPageRepo(
    _repo: () => MongoRepo[ApiDocumentationPage, ApiDocumentationPageId],
    _tenantRepo: TenantId => MongoTenantAwareRepo[ApiDocumentationPage,
                                                  ApiDocumentationPageId]
) extends MongoTenantCapableRepo[ApiDocumentationPage, ApiDocumentationPageId]
    with ApiDocumentationPageRepo {
  override def tenantRepo(tenant: TenantId)
    : MongoTenantAwareRepo[ApiDocumentationPage, ApiDocumentationPageId] =
    _tenantRepo(tenant)

  override def repo(): MongoRepo[ApiDocumentationPage, ApiDocumentationPageId] =
    _repo()
}

case class MongoTenantCapableApiPostRepo(
    _repo: () => MongoRepo[ApiPost, ApiPostId],
    _tenantRepo: TenantId => MongoTenantAwareRepo[ApiPost, ApiPostId]
) extends MongoTenantCapableRepo[ApiPost, ApiPostId]
    with ApiPostRepo {
  override def tenantRepo(
      tenant: TenantId): MongoTenantAwareRepo[ApiPost, ApiPostId] =
    _tenantRepo(tenant)

  override def repo(): MongoRepo[ApiPost, ApiPostId] =
    _repo()
}

case class MongoTenantCapableApiIssueRepo(
    _repo: () => MongoRepo[ApiIssue, ApiIssueId],
    _tenantRepo: TenantId => MongoTenantAwareRepo[ApiIssue, ApiIssueId]
) extends MongoTenantCapableRepo[ApiIssue, ApiIssueId]
    with ApiIssueRepo {
  override def tenantRepo(
      tenant: TenantId): MongoTenantAwareRepo[ApiIssue, ApiIssueId] =
    _tenantRepo(tenant)

  override def repo(): MongoRepo[ApiIssue, ApiIssueId] =
    _repo()
}

case class MongoTenantCapableNotificationRepo(
    _repo: () => MongoRepo[Notification, NotificationId],
    _tenantRepo: TenantId => MongoTenantAwareRepo[Notification, NotificationId]
) extends MongoTenantCapableRepo[Notification, NotificationId]
    with NotificationRepo {
  override def tenantRepo(
      tenant: TenantId): MongoTenantAwareRepo[Notification, NotificationId] =
    _tenantRepo(tenant)

  override def repo(): MongoRepo[Notification, NotificationId] = _repo()
}

case class MongoTenantCapableAuditTrailRepo(
    _repo: () => MongoRepo[JsObject, DatastoreId],
    _tenantRepo: TenantId => MongoTenantAwareRepo[JsObject, DatastoreId])
    extends MongoTenantCapableRepo[JsObject, DatastoreId]
    with AuditTrailRepo {
  override def tenantRepo(
      tenant: TenantId): MongoTenantAwareRepo[JsObject, DatastoreId] =
    _tenantRepo(tenant)

  override def repo(): MongoRepo[JsObject, DatastoreId] = _repo()
}

case class MongoTenantCapableTranslationRepo(
    _repo: () => MongoRepo[Translation, DatastoreId],
    _tenantRepo: TenantId => MongoTenantAwareRepo[Translation, DatastoreId]
) extends MongoTenantCapableRepo[Translation, DatastoreId]
    with TranslationRepo {
  override def tenantRepo(
      tenant: TenantId): MongoTenantAwareRepo[Translation, DatastoreId] =
    _tenantRepo(tenant)

  override def repo(): MongoRepo[Translation, DatastoreId] = _repo()
}

case class MongoTenantCapableMessageRepo(
    _repo: () => MongoRepo[Message, DatastoreId],
    _tenantRepo: TenantId => MongoTenantAwareRepo[Message, DatastoreId]
) extends MongoTenantCapableRepo[Message, DatastoreId]
    with MessageRepo {
  override def tenantRepo(
      tenant: TenantId): MongoTenantAwareRepo[Message, DatastoreId] =
    _tenantRepo(tenant)

  override def repo(): MongoRepo[Message, DatastoreId] = _repo()
}

case class MongoTenantCapableCmsPageRepo(
    _repo: () => MongoRepo[CmsPage, CmsPageId],
    _tenantRepo: TenantId => MongoTenantAwareRepo[CmsPage, CmsPageId]
) extends MongoTenantCapableRepo[CmsPage, CmsPageId]
    with CmsPageRepo {
  override def tenantRepo(
      tenant: TenantId): MongoTenantAwareRepo[CmsPage, CmsPageId] =
    _tenantRepo(tenant)

  override def repo(): MongoRepo[CmsPage, CmsPageId] = _repo()
}

case class MongoTenantCapableConsumptionRepo(
    _repo: () => MongoRepo[ApiKeyConsumption, DatastoreId],
    _tenantRepo: TenantId => MongoTenantAwareRepo[ApiKeyConsumption,
                                                  DatastoreId]
) extends MongoTenantCapableRepo[ApiKeyConsumption, DatastoreId]
    with ConsumptionRepo {

  implicit val jsObjectFormat: OFormat[JsObject] = new OFormat[JsObject] {
    override def reads(json: JsValue): JsResult[JsObject] =
      json.validate[JsObject](Reads.JsObjectReads)

    override def writes(o: JsObject): JsObject = o
  }

  val jsObjectWrites: OWrites[JsObject] = (o: JsObject) => o

  override def tenantRepo(
      tenant: TenantId): MongoTenantAwareRepo[ApiKeyConsumption, DatastoreId] =
    _tenantRepo(tenant)

  override def repo(): MongoRepo[ApiKeyConsumption, DatastoreId] = _repo()

  private def lastConsumptions(tenantId: Option[TenantId], filter: JsObject)(
      implicit ec: ExecutionContext): Future[Seq[ApiKeyConsumption]] = {
    val rep = tenantId match {
      case Some(t) =>
        forTenant(t)
          .asInstanceOf[MongoTenantAwareRepo[ApiKeyConsumption, DatastoreId]]
      case None =>
        forAllTenant().asInstanceOf[MongoRepo[ApiKeyConsumption, DatastoreId]]
    }

    rep.collection.flatMap { col =>
      import col.BatchCommands.AggregationFramework
      import AggregationFramework.{Group, Match, MaxField}

      col
        .aggregatorContext[JsObject](
          firstOperator = Match(filter),
          otherOperators =
            List(Group(JsString("$clientId"))("maxFrom" -> MaxField("from"))),
          explain = false,
          allowDiskUse = false,
          bypassDocumentValidation = false,
          readConcern = ReadConcern.Majority,
          readPreference = ReadPreference.primaryPreferred,
          writeConcern = WriteConcern.Default,
          batchSize = None,
          cursorOptions = CursorOptions.empty,
          maxTime = None,
          hint = None,
          comment = None,
          collation = None
        )
        .prepared
        .cursor
        .collect[List](-1, Cursor.FailOnError[List[JsObject]]())
        .flatMap { agg =>
          val futures: List[Future[Option[ApiKeyConsumption]]] = agg.map(
            json =>
              col
                .find(Json.obj("clientId" -> (json \ "_id").as[String],
                               "from" -> (json \ "maxFrom" \ "$long").as[Long]),
                      None)
                .one[JsObject](ReadPreference.primaryPreferred)
                .map { results =>
                  results.map(rep.format.reads).collect {
                    case JsSuccess(e, _) => e
                  }
              }
          )
          Future.sequence(futures).map(_.flatten)
        }
    }
  }

  override def getLastConsumptionsforAllTenant(filter: JsObject)(
      implicit ec: ExecutionContext
  ): Future[Seq[ApiKeyConsumption]] = lastConsumptions(None, filter)

  override def getLastConsumptionsForTenant(tenantId: TenantId,
                                            filter: JsObject)(
      implicit ec: ExecutionContext
  ): Future[Seq[ApiKeyConsumption]] = lastConsumptions(Some(tenantId), filter)
}

case class MongoTenantCapableOperationRepo(
    _repo: () => MongoRepo[Operation, DatastoreId],
    _tenantRepo: TenantId => MongoTenantAwareRepo[Operation, DatastoreId]
) extends MongoTenantCapableRepo[Operation, DatastoreId]
    with OperationRepo {
  override def repo(): MongoRepo[Operation, DatastoreId] = _repo()

  override def tenantRepo(
      tenant: TenantId): MongoTenantAwareRepo[Operation, DatastoreId] =
    _tenantRepo(tenant)
}

case class MongoTenantCapableEmailVerificationRepo(
    _repo: () => MongoRepo[EmailVerification, DatastoreId],
    _tenantRepo: TenantId => MongoTenantAwareRepo[EmailVerification,
                                                  DatastoreId]
) extends MongoTenantCapableRepo[EmailVerification, DatastoreId]
    with EmailVerificationRepo {
  override def repo(): MongoRepo[EmailVerification, DatastoreId] = _repo()

  override def tenantRepo(
      tenant: TenantId): MongoTenantAwareRepo[EmailVerification, DatastoreId] =
    _tenantRepo(tenant)
}

class MongoDataStore(context: Context, env: Env)
    extends ReactiveMongoApiFromContext(context)
    with DataStore {

  implicit val ece: ExecutionContext = env.defaultExecutionContext

  lazy val router: Router = play.api.routing.Router.empty
  lazy val httpFilters = Seq.empty[play.api.mvc.EssentialFilter]

  lazy val logger: Logger = Logger("MongoDataStore")

  logger.info("used")

  private val _tenantRepo: TenantRepo =
    new MongoTenantRepo(env, reactiveMongoApi)
  private val _userRepo: UserRepo = new MongoUserRepo(env, reactiveMongoApi)
  private val _evolutionRepo: EvolutionRepo =
    new MongoEvolutionRepo(env, reactiveMongoApi)
  private val _teamRepo: TeamRepo = MongoTenantCapableTeamRepo(
    () => new MongoTeamRepo(env, reactiveMongoApi),
    t => new MongoTenantTeamRepo(env, reactiveMongoApi, t))
  private val _apiRepo: ApiRepo = MongoTenantCapableApiRepo(
    () => new MongoApiRepo(env, reactiveMongoApi),
    t => new MongoTenantApiRepo(env, reactiveMongoApi, t))
  private val _apiSubscriptionRepo: ApiSubscriptionRepo =
    MongoTenantCapableApiSubscriptionRepo(
      () => new MongoApiSubscriptionRepo(env, reactiveMongoApi),
      t => new MongoTenantApiSubscriptionRepo(env, reactiveMongoApi, t)
    )
  private val _apiDocumentationPageRepo: ApiDocumentationPageRepo =
    MongoTenantCapableApiDocumentationPageRepo(
      () => new MongoApiDocumentationPageRepo(env, reactiveMongoApi),
      t => new MongoTenantApiDocumentationPageRepo(env, reactiveMongoApi, t)
    )

  private val _apiApiPostRepo: ApiPostRepo =
    MongoTenantCapableApiPostRepo(
      () => new MongoApiPostRepo(env, reactiveMongoApi),
      t => new MongoTenantApiPostRepo(env, reactiveMongoApi, t)
    )

  private val _apiApiIssueRepo: ApiIssueRepo =
    MongoTenantCapableApiIssueRepo(
      () => new MongoApiIssueRepo(env, reactiveMongoApi),
      t => new MongoTenantApiIssueRepo(env, reactiveMongoApi, t)
    )

  private val _notificationRepo: NotificationRepo =
    MongoTenantCapableNotificationRepo(
      () => new MongoNotificationRepo(env, reactiveMongoApi),
      t => new MongoTenantNotificationRepo(env, reactiveMongoApi, t)
    )
  private val _userSessionRepo: UserSessionRepo =
    new MongoUserSessionRepo(env, reactiveMongoApi)
  private val _auditTrailRepo: AuditTrailRepo =
    MongoTenantCapableAuditTrailRepo(
      () => new MongoAuditTrailRepo(env, reactiveMongoApi),
      t => new MongoTenantAuditTrailRepo(env, reactiveMongoApi, t)
    )
  private val _consumptionRepo: ConsumptionRepo =
    MongoTenantCapableConsumptionRepo(
      () => new MongoConsumptionRepo(env, reactiveMongoApi),
      t => new MongoTenantConsumptionRepo(env, reactiveMongoApi, t)
    )
  private val _passwordResetRepo: PasswordResetRepo =
    new MongoPasswordResetRepo(env, reactiveMongoApi)
  private val _accountCreationRepo: AccountCreationRepo =
    new MongoAccountCreationRepo(env, reactiveMongoApi)
  private val _translationRepo: TranslationRepo =
    MongoTenantCapableTranslationRepo(
      () => new MongoTranslationRepo(env, reactiveMongoApi),
      t => new MongoTenantTranslationRepo(env, reactiveMongoApi, t))
  private val _messageRepo: MessageRepo =
    MongoTenantCapableMessageRepo(
      () => new MongoMessageRepo(env, reactiveMongoApi),
      t => new MongoTenantMessageRepo(env, reactiveMongoApi, t)
    )
  private val _cmsRepo: CmsPageRepo = {
    MongoTenantCapableCmsPageRepo(
      () => new MongoCmsPageRepo(env, reactiveMongoApi),
      t => new MongoTenantCmsPageRepo(env, reactiveMongoApi, t)
    )
  }
  private val _operationRepo: OperationRepo = {
    MongoTenantCapableOperationRepo(
      () => new MongoOperationRepo(env, reactiveMongoApi),
      t => new MongoTenantOperationRepo(env, reactiveMongoApi, t)
    )
  }

  private val _emailVerificationRepo: EmailVerificationRepo = {
    MongoTenantCapableEmailVerificationRepo(
      () => new MongoEmailVerificationRepo(env, reactiveMongoApi),
      t => new MongoTenantEmailVerificationRepo(env, reactiveMongoApi, t)
    )
  }

  override def tenantRepo: TenantRepo = _tenantRepo

  override def userRepo: UserRepo = _userRepo

  override def evolutionRepo: EvolutionRepo = _evolutionRepo

  override def teamRepo: TeamRepo = _teamRepo

  override def apiRepo: ApiRepo = _apiRepo

  override def apiSubscriptionRepo: ApiSubscriptionRepo = _apiSubscriptionRepo

  override def apiDocumentationPageRepo: ApiDocumentationPageRepo =
    _apiDocumentationPageRepo

  override def apiPostRepo: ApiPostRepo = _apiApiPostRepo

  override def apiIssueRepo: ApiIssueRepo = _apiApiIssueRepo

  override def notificationRepo: NotificationRepo = _notificationRepo

  override def userSessionRepo: UserSessionRepo = _userSessionRepo

  override def auditTrailRepo: AuditTrailRepo = _auditTrailRepo

  override def consumptionRepo: ConsumptionRepo = _consumptionRepo

  override def passwordResetRepo: PasswordResetRepo = _passwordResetRepo

  override def accountCreationRepo: AccountCreationRepo = _accountCreationRepo

  override def translationRepo: TranslationRepo = _translationRepo

  override def messageRepo: MessageRepo = _messageRepo

  override def cmsRepo: CmsPageRepo = _cmsRepo

  override def operationRepo: OperationRepo = _operationRepo

  override def emailVerificationRepo: EmailVerificationRepo =
    _emailVerificationRepo

  override def start(): Future[Unit] =
    translationRepo.forAllTenant().ensureIndices

  override def stop(): Future[Unit] = Future.successful(())

  override def isEmpty(): Future[Boolean] = {

    for {
      tenants <- tenantRepo.count()
    } yield {
      tenants == 0
    }
  }

  override def exportAsStream(pretty: Boolean,
                              exportAuditTrail: Boolean = true)(
      implicit ec: ExecutionContext,
      mat: Materializer,
      env: Env): Source[ByteString, _] = {

    val collections = ListBuffer[Repo[_, _]]()
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
    )

    if (exportAuditTrail) {
      collections += auditTrailRepo.forAllTenant()
    }

    Source(collections.toList).flatMapConcat { collection =>
      collection.streamAllRaw()(ec).map { doc =>
        if (pretty) {
          ByteString(
            Json.prettyPrint(Json.obj("type" -> collection.collectionName,
                                      "payload" -> doc)) + "\n")
        } else {
          ByteString(
            Json.stringify(Json.obj("type" -> collection.collectionName,
                                    "payload" -> doc)) + "\n")
        }
      }
    }
  }

  override def importFromStream(source: Source[ByteString, _]): Future[Unit] = {

    for {
      _ <- tenantRepo.deleteAll()
      _ <- passwordResetRepo.deleteAll()
      _ <- accountCreationRepo.deleteAll()
      _ <- userRepo.deleteAll()
      _ <- teamRepo.forAllTenant().deleteAll()
      _ <- apiRepo.forAllTenant().deleteAll()
      _ <- apiSubscriptionRepo.forAllTenant().deleteAll()
      _ <- apiDocumentationPageRepo.forAllTenant().deleteAll()
      _ <- apiPostRepo.forAllTenant().deleteAll()
      _ <- apiIssueRepo.forAllTenant().deleteAll()
      _ <- notificationRepo.forAllTenant().deleteAll()
      _ <- consumptionRepo.forAllTenant().deleteAll()
      _ <- auditTrailRepo.forAllTenant().deleteAll()
      _ <- userSessionRepo.deleteAll()
      _ <- translationRepo.forAllTenant().deleteAll()
      - <- messageRepo.forAllTenant().deleteAll()
      _ <- operationRepo.forAllTenant().deleteAll()
      _ <- emailVerificationRepo.forAllTenant().deleteAll()
      _ <- source
        .via(Framing.delimiter(ByteString("\n"), 1000000000, true))
        .map(_.utf8String)
        .map(Json.parse)
        .map(json => json.as[JsObject])
        .map(json =>
          ((json \ "type").as[String].toLowerCase.replace("_", ""),
           (json \ "payload").as[JsValue]))
        .mapAsync(1) {
          case ("tenants", payload) =>
            tenantRepo.save(TenantFormat.reads(payload).get)
          case ("passwordreset", payload) =>
            passwordResetRepo.save(PasswordResetFormat.reads(payload).get)
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
          case ("messages", payload) =>
            messageRepo
              .forAllTenant()
              .save(MessageFormat.reads(payload).get)
          case ("operations", payload) =>
            operationRepo
              .forAllTenant()
              .save(OperationFormat.reads(payload).get)
          case ("emailVerifications", payload) =>
            messageRepo
              .forAllTenant()
              .save(MessageFormat.reads(payload).get)
          case (typ, _) =>
            logger.info(s"Unknown type: $typ")
            FastFuture.successful(false)
        }
        .toMat(Sink.ignore)(Keep.right)
        .run()
    } yield ()

  }
}

class MongoTenantRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[Tenant, TenantId](env, reactiveMongoApi)
    with TenantRepo {
  override def collectionName: String = "Tenants"

  override def format: Format[Tenant] = json.TenantFormat

  override def extractId(value: Tenant): String = value.id.value
}

class MongoPasswordResetRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[PasswordReset, DatastoreId](env, reactiveMongoApi)
    with PasswordResetRepo {
  override def collectionName: String = "PasswordReset"

  override def format: Format[PasswordReset] = json.PasswordResetFormat

  override def extractId(value: PasswordReset): String = value.id.value
}

class MongoAccountCreationRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[AccountCreation, DatastoreId](env, reactiveMongoApi)
    with AccountCreationRepo {
  override def collectionName: String = "AccountCreation"

  override def format: Format[AccountCreation] = json.AccountCreationFormat

  override def extractId(value: AccountCreation): String = value.id.value
}

class MongoTenantTeamRepo(env: Env,
                          reactiveMongoApi: ReactiveMongoApi,
                          tenant: TenantId)
    extends MongoTenantAwareRepo[Team, TeamId](env, reactiveMongoApi, tenant) {
  override def collectionName: String = "Teams"

  override def format: Format[Team] = json.TeamFormat

  override def extractId(value: Team): String = value.id.value
}

class MongoTenantApiRepo(env: Env,
                         reactiveMongoApi: ReactiveMongoApi,
                         tenant: TenantId)
    extends MongoTenantAwareRepo[Api, ApiId](env, reactiveMongoApi, tenant) {
  override def collectionName: String = "Apis"

  override def format: Format[Api] = json.ApiFormat

  override def extractId(value: Api): String = value.id.value
}

class MongoTenantTranslationRepo(env: Env,
                                 reactiveMongoApi: ReactiveMongoApi,
                                 tenant: TenantId)
    extends MongoTenantAwareRepo[Translation, DatastoreId](env,
                                                           reactiveMongoApi,
                                                           tenant) {
  override def collectionName: String = "Translations"

  override def format: Format[Translation] = json.TranslationFormat

  override def extractId(value: Translation): String = value.id.value
}

class MongoTenantMessageRepo(env: Env,
                             reactiveMongoApi: ReactiveMongoApi,
                             tenant: TenantId)
    extends MongoTenantAwareRepo[Message, DatastoreId](env,
                                                       reactiveMongoApi,
                                                       tenant) {
  override def collectionName: String = "Messages"

  override def format: Format[Message] = json.MessageFormat

  override def extractId(value: Message): String = value.id.value
}

class MongoTenantCmsPageRepo(env: Env,
                             reactiveMongoApi: ReactiveMongoApi,
                             tenant: TenantId)
    extends MongoTenantAwareRepo[CmsPage, CmsPageId](env,
                                                     reactiveMongoApi,
                                                     tenant) {
  override def collectionName: String = "CmsPages"

  override def format: Format[CmsPage] = json.CmsPageFormat

  override def extractId(value: CmsPage): String = value.id.value
}
class MongoTenantOperationRepo(env: Env,
                               reactiveMongoApi: ReactiveMongoApi,
                               tenant: TenantId)
    extends MongoTenantAwareRepo[Operation, DatastoreId](env,
                                                         reactiveMongoApi,
                                                         tenant) {
  override def collectionName: String = "Operations"

  override def format: Format[Operation] = json.OperationFormat

  override def extractId(value: Operation): String = value.id.value
}

class MongoTenantEmailVerificationRepo(env: Env,
                                       reactiveMongoApi: ReactiveMongoApi,
                                       tenant: TenantId)
    extends MongoTenantAwareRepo[EmailVerification, DatastoreId](
      env,
      reactiveMongoApi,
      tenant) {
  override def collectionName: String = "EmailVerifications"
  override def format: Format[EmailVerification] = json.EmailVerificationFormat

  override def extractId(value: EmailVerification): String = value.id.value
}

class MongoTenantApiSubscriptionRepo(env: Env,
                                     reactiveMongoApi: ReactiveMongoApi,
                                     tenant: TenantId)
    extends MongoTenantAwareRepo[ApiSubscription, ApiSubscriptionId](
      env,
      reactiveMongoApi,
      tenant) {
  override def collectionName: String = "ApiSubscriptions"

  override def format: Format[ApiSubscription] = json.ApiSubscriptionFormat

  override def extractId(value: ApiSubscription): String = value.id.value
}

class MongoTenantApiDocumentationPageRepo(env: Env,
                                          reactiveMongoApi: ReactiveMongoApi,
                                          tenant: TenantId)
    extends MongoTenantAwareRepo[ApiDocumentationPage, ApiDocumentationPageId](
      env,
      reactiveMongoApi,
      tenant) {
  override def collectionName: String = "ApiDocumentationPages"

  override def format: Format[ApiDocumentationPage] =
    json.ApiDocumentationPageFormat

  override def extractId(value: ApiDocumentationPage): String = value.id.value
}

class MongoTenantApiPostRepo(env: Env,
                             reactiveMongoApi: ReactiveMongoApi,
                             tenant: TenantId)
    extends MongoTenantAwareRepo[ApiPost, ApiPostId](env,
                                                     reactiveMongoApi,
                                                     tenant) {
  override def collectionName: String = "ApiPosts"

  override def format: Format[ApiPost] = json.ApiPostFormat

  override def extractId(value: ApiPost): String = value.id.value
}

class MongoTenantApiIssueRepo(env: Env,
                              reactiveMongoApi: ReactiveMongoApi,
                              tenant: TenantId)
    extends MongoTenantAwareRepo[ApiIssue, ApiIssueId](env,
                                                       reactiveMongoApi,
                                                       tenant) {
  override def collectionName: String = "ApiIssues"

  override def format: Format[ApiIssue] = json.ApiIssueFormat

  override def extractId(value: ApiIssue): String = value.id.value
}

class MongoTenantNotificationRepo(env: Env,
                                  reactiveMongoApi: ReactiveMongoApi,
                                  tenant: TenantId)
    extends MongoTenantAwareRepo[Notification, NotificationId](env,
                                                               reactiveMongoApi,
                                                               tenant) {
  override def collectionName: String = "Notifications"

  override def format: Format[Notification] =
    json.NotificationFormat

  override def extractId(value: Notification): String = value.id.value
}

class MongoTenantConsumptionRepo(env: Env,
                                 reactiveMongoApi: ReactiveMongoApi,
                                 tenant: TenantId)
    extends MongoTenantAwareRepo[ApiKeyConsumption, DatastoreId](
      env,
      reactiveMongoApi,
      tenant) {
  override def collectionName: String = "Consumptions"

  override def format: Format[ApiKeyConsumption] =
    json.ConsumptionFormat

  override def extractId(value: ApiKeyConsumption): String = value.id.value
}

class MongoTenantAuditTrailRepo(env: Env,
                                reactiveMongoApi: ReactiveMongoApi,
                                tenant: TenantId)
    extends MongoTenantAwareRepo[JsObject, DatastoreId](env,
                                                        reactiveMongoApi,
                                                        tenant) {

  override def collectionName: String = "AuditEvents"

  override def format: Format[JsObject] = json.DefaultFormat

  override def extractId(value: JsObject): String = (value \ "_id").as[String]
}

class MongoUserRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[User, UserId](env, reactiveMongoApi)
    with UserRepo {
  override def collectionName: String = "Users"

  override def format: Format[User] = json.UserFormat

  override def extractId(value: User): String = value.id.value
}

class MongoEvolutionRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[Evolution, DatastoreId](env, reactiveMongoApi)
    with EvolutionRepo {
  override def collectionName: String = "evolutions"

  override def format: Format[Evolution] = json.EvolutionFormat

  override def extractId(value: Evolution): String = value.id.value
}

class MongoTeamRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[Team, TeamId](env, reactiveMongoApi) {
  override def collectionName: String = "Teams"

  override def format: Format[Team] = json.TeamFormat

  override def extractId(value: Team): String = value.id.value
}

class MongoTranslationRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[Translation, DatastoreId](env, reactiveMongoApi) {
  override def collectionName: String = "Translations"

  override def format: Format[Translation] = json.TranslationFormat

  override def extractId(value: Translation): String = value.id.value
}

class MongoMessageRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[Message, DatastoreId](env, reactiveMongoApi) {
  override def collectionName: String = "Messages"

  override def format: Format[Message] = json.MessageFormat

  override def extractId(value: Message): String = value.id.value
}

class MongoCmsPageRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[CmsPage, CmsPageId](env, reactiveMongoApi) {
  override def collectionName: String = "CmsPages"

  override def format: Format[CmsPage] = json.CmsPageFormat

  override def extractId(value: CmsPage): String = value.id.value
}

class MongoOperationRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[Operation, DatastoreId](env, reactiveMongoApi) {
  override def collectionName: String = "Operations"

  override def format: Format[Operation] = json.OperationFormat

  override def extractId(value: Operation): String = value.id.value
}

class MongoEmailVerificationRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[EmailVerification, DatastoreId](env, reactiveMongoApi) {

  override def collectionName: String = "EmailVerifications"

  override def format: Format[EmailVerification] = json.EmailVerificationFormat

  override def extractId(value: EmailVerification): String = value.id.value
}

class MongoApiRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[Api, ApiId](env, reactiveMongoApi) {
  override def collectionName: String = "Apis"

  override def format: Format[Api] = json.ApiFormat

  override def extractId(value: Api): String = value.id.value
}

class MongoApiSubscriptionRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[ApiSubscription, ApiSubscriptionId](env, reactiveMongoApi) {
  override def collectionName: String = "ApiSubscriptions"

  override def format: Format[ApiSubscription] = json.ApiSubscriptionFormat

  override def extractId(value: ApiSubscription): String = value.id.value
}

class MongoApiDocumentationPageRepo(env: Env,
                                    reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[ApiDocumentationPage, ApiDocumentationPageId](
      env,
      reactiveMongoApi) {
  override def collectionName: String = "ApiDocumentationPages"

  override def format: Format[ApiDocumentationPage] =
    json.ApiDocumentationPageFormat

  override def extractId(value: ApiDocumentationPage): String = value.id.value
}

class MongoApiPostRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[ApiPost, ApiPostId](env, reactiveMongoApi) {
  override def collectionName: String = "ApiPosts"

  override def format: Format[ApiPost] = json.ApiPostFormat

  override def extractId(value: ApiPost): String = value.id.value
}

class MongoApiIssueRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[ApiIssue, ApiIssueId](env, reactiveMongoApi) {
  override def collectionName: String = "ApiIssues"

  override def format: Format[ApiIssue] = json.ApiIssueFormat

  override def extractId(value: ApiIssue): String = value.id.value
}

class MongoNotificationRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[Notification, NotificationId](env, reactiveMongoApi) {
  override def collectionName: String = "Notifications"

  override def format: Format[Notification] =
    json.NotificationFormat

  override def extractId(value: Notification): String = value.id.value
}

class MongoConsumptionRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[ApiKeyConsumption, DatastoreId](env, reactiveMongoApi) {
  override def collectionName: String = "Consumptions"

  override def format: Format[ApiKeyConsumption] = json.ConsumptionFormat

  override def extractId(value: ApiKeyConsumption): String = value.id.value
}

class MongoUserSessionRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[UserSession, DatastoreId](env, reactiveMongoApi)
    with UserSessionRepo {
  override def collectionName: String = "UserSessions"

  override def format: Format[UserSession] = json.UserSessionFormat

  override def extractId(value: UserSession): String = value.id.value
}

class MongoAuditTrailRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[JsObject, DatastoreId](env, reactiveMongoApi) {
  override def collectionName: String = "AuditEvents"

  override def format: Format[JsObject] = json.DefaultFormat

  override def extractId(value: JsObject): String = (value \ "_id").as[String]
}

abstract class MongoRepo[Of, Id <: ValueType](
    env: Env,
    reactiveMongoApi: ReactiveMongoApi)
    extends CommonMongoRepo[Of, Id](env, reactiveMongoApi) {

  private val logger: Logger = Logger(s"MongoRepo")

  override def collection(
      implicit ec: ExecutionContext): Future[JSONCollection] =
    reactiveMongoApi.database.map(_.collection(collectionName))

  override def find(
      query: JsObject,
      sort: Option[JsObject] = None,
      maxDocs: Int = -1)(implicit ec: ExecutionContext): Future[Seq[Of]] =
    collection.flatMap { col =>
      logger.debug(s"$collectionName.find(${Json.prettyPrint(query)})")
      sort match {
        case None =>
          col
            .find(query, None)
            .cursor[JsObject](ReadPreference.primaryPreferred)
            .collect[Seq](maxDocs = maxDocs,
                          Cursor.FailOnError[Seq[JsObject]]())
            .map(_.map(format.reads).collect {
              case JsSuccess(e, _) => e
            })
        case Some(s) =>
          col
            .find(query, None)
            .sort(s)
            .cursor[JsObject](ReadPreference.primaryPreferred)
            .collect[Seq](maxDocs = maxDocs,
                          Cursor.FailOnError[Seq[JsObject]]())
            .map(_.map(format.reads).collect {
              case JsSuccess(e, _) => e
            })
      }
    }

  override def deleteByIdLogically(id: String)(
      implicit ec: ExecutionContext): Future[Boolean] =
    super.deleteByIdLogically(id, Json.obj())

  override def deleteByIdLogically(id: Id)(
      implicit ec: ExecutionContext): Future[Boolean] =
    super.deleteByIdLogically(id.value, Json.obj())

  override def deleteAllLogically()(
      implicit ec: ExecutionContext): Future[Boolean] =
    super.deleteAllLogically(Json.obj())
}

abstract class MongoTenantAwareRepo[Of, Id <: ValueType](
    env: Env,
    reactiveMongoApi: ReactiveMongoApi,
    tenant: TenantId)
    extends CommonMongoRepo[Of, Id](env, reactiveMongoApi) {

  val logger: Logger = Logger(s"MongoTenantAwareRepo")

  def collection(implicit ec: ExecutionContext): Future[JSONCollection] =
    reactiveMongoApi.database.map(_.collection(collectionName))

  override def deleteByIdLogically(id: String)(
      implicit ec: ExecutionContext): Future[Boolean] =
    super.deleteByIdLogically(id, Json.obj("_tenant" -> tenant.value))

  override def deleteByIdLogically(id: Id)(
      implicit ec: ExecutionContext): Future[Boolean] =
    super.deleteByIdLogically(id.value, Json.obj("_tenant" -> tenant.value))

  override def deleteLogically(query: JsObject)(
      implicit ec: ExecutionContext): Future[Boolean] =
    super.deleteLogically(query ++ Json.obj("_tenant" -> tenant.value))

  override def deleteAllLogically()(
      implicit ec: ExecutionContext): Future[Boolean] =
    super.deleteAllLogically(Json.obj("_tenant" -> tenant.value))

  override def find(
      query: JsObject,
      sort: Option[JsObject] = None,
      maxDocs: Int = -1)(implicit ec: ExecutionContext): Future[Seq[Of]] =
    collection.flatMap { col =>
      logger.debug(s"$collectionName.find(${Json.prettyPrint(
        query ++ Json.obj("_tenant" -> tenant.value))})")
      sort match {
        case None =>
          col
            .find(query ++ Json.obj("_tenant" -> tenant.value), None)
            .cursor[JsObject](ReadPreference.primaryPreferred)
            .collect[Seq](maxDocs = maxDocs,
                          Cursor.FailOnError[Seq[JsObject]]())
            .map(
              _.map(format.reads)
                .map {
                  case j @ JsSuccess(_, _) => j
                  case j @ JsError(_) =>
                    println(s"error: $j")
                    j
                }
                .collect {
                  case JsSuccess(e, _) => e
                }
            )
        case Some(s) =>
          col
            .find(query ++ Json.obj("_tenant" -> tenant.value), None)
            .sort(s)
            .cursor[JsObject](ReadPreference.primaryPreferred)
            .collect[Seq](maxDocs = maxDocs,
                          Cursor.FailOnError[Seq[JsObject]]())
            .map(
              _.map(format.reads)
                .map {
                  case j @ JsSuccess(_, _) => j
                  case j @ JsError(_) =>
                    println(s"error: $j")
                    j
                }
                .collect {
                  case JsSuccess(e, _) => e
                }
            )
      }
    }

  def streamAllRaw()(implicit ec: ExecutionContext): Source[JsValue, NotUsed] =
    super.streamAllRaw(Json.obj("_tenant" -> tenant.value))

  override def findOne(query: JsObject)(
      implicit ec: ExecutionContext): Future[Option[Of]] =
    super.findOne(query ++ Json.obj("_tenant" -> tenant.value))

  override def delete(query: JsObject)(
      implicit ec: ExecutionContext): Future[Boolean] =
    super.delete(query ++ Json.obj("_tenant" -> tenant.value))

  override def insertMany(values: Seq[Of])(
      implicit ec: ExecutionContext): Future[Long] =
    super.insertMany(values, Json.obj("_tenant" -> tenant.value))

  override def exists(query: JsObject)(
      implicit ec: ExecutionContext): Future[Boolean] =
    super.exists(query ++ Json.obj("_tenant" -> tenant.value))

  override def count()(implicit ec: ExecutionContext): Future[Long] =
    super.count(Json.obj("_tenant" -> tenant.value))

  override def findWithProjection(query: JsObject, projection: JsObject)(
      implicit ec: ExecutionContext): Future[Seq[JsObject]] =
    super.findWithProjection(query ++ Json.obj("_tenant" -> tenant.value),
                             projection)

  override def findOneWithProjection(query: JsObject, projection: JsObject)(
      implicit ec: ExecutionContext): Future[Option[JsObject]] =
    super.findOneWithProjection(query ++ Json.obj("_tenant" -> tenant.value),
                                projection)

  override def findWithPagination(query: JsObject,
                                  page: Int,
                                  pageSize: Int,
                                  sort: Option[JsObject] = None)(
      implicit ec: ExecutionContext): Future[(Seq[Of], Long)] =
    super.findWithPagination(query ++ Json.obj("_tenant" -> tenant.value),
                             page,
                             pageSize,
                             sort)
}

abstract class CommonMongoRepo[Of, Id <: ValueType](
    env: Env,
    reactiveMongoApi: ReactiveMongoApi)
    extends RepositoryMongo[Of, Id] {

  private val logger = Logger("CommonMongoRepo")

  val jsObjectWrites: OWrites[JsObject] = (o: JsObject) => o

  override def ensureIndices(implicit ec: ExecutionContext): Future[Unit] =
    for {
      db <- reactiveMongoApi.database
      foundName <- db.collectionNames.map(names =>
        names.contains(collectionName))
      _ <- if (foundName) {
        logger.info(s"Ensuring indices for $collectionName")
        val col = db.collection[JSONCollection](collectionName)
        Future.sequence(indices.map(i => col.indexesManager.ensure(i)))
      } else {
        Future.successful(Seq.empty[Boolean])
      }
    } yield {
      ()
    }

  implicit val jsObjectFormat: OFormat[JsObject] = new OFormat[JsObject] {
    override def reads(json: JsValue): JsResult[JsObject] =
      json.validate[JsObject](Reads.JsObjectReads)

    override def writes(o: JsObject): JsObject = o
  }

  override def count()(implicit ec: ExecutionContext): Future[Long] =
    collection.flatMap { col =>
      logger.debug(s"$collectionName.count({})")
      col.count(None, None, 0, None, ReadConcern.Majority)
    }

  override def count(query: JsObject)(
      implicit ec: ExecutionContext): Future[Long] =
    collection.flatMap { col =>
      col.count(Some(query), None, 0, None, ReadConcern.Majority)
    }

  override def exists(query: JsObject)(
      implicit ec: ExecutionContext): Future[Boolean] = collection.flatMap {
    col =>
      logger.debug(s"$collectionName.exists(${Json.prettyPrint(query)})")
      col
        .find(query, None)
        .one[JsObject](ReadPreference.primaryPreferred)
        .map(_.isDefined)
  }

  override def streamAllRaw(query: JsObject = Json.obj())(
      implicit ec: ExecutionContext): Source[JsValue, NotUsed] =
    Source
      .future(collection.flatMap { col =>
        logger.debug(s"$collectionName.streamAllRaw(${Json.prettyPrint(query)}")
        col
          .find(query, None)
          .cursor[JsObject](ReadPreference.primaryPreferred)
          .collect[Seq](maxDocs = -1, Cursor.FailOnError[Seq[JsObject]]())
      })
      .flatMapConcat(seq => Source(seq.toList))

  override def streamAllRawFormatted(query: JsObject = Json.obj())(
      implicit ec: ExecutionContext): Source[Of, NotUsed] =
    Source
      .future(collection.flatMap { col =>
        logger.debug(s"$collectionName.streamAllRaw(${Json.prettyPrint(query)}")
        col
          .find(query, None)
          .cursor[JsObject](ReadPreference.primaryPreferred)
          .collect[Seq](maxDocs = -1, Cursor.FailOnError[Seq[JsObject]]())
      })
      .flatMapConcat(res =>
        Source(res.toList.map(format.reads).filter(_.isSuccess).map(_.get)))

  override def findOne(query: JsObject)(
      implicit ec: ExecutionContext): Future[Option[Of]] = collection.flatMap {
    col =>
      logger.debug(s"$collectionName.findOne(${Json.prettyPrint(query)})")
      col
        .find(query, None)
        .one[JsObject](ReadPreference.primaryPreferred)
        .map(_.map(format.reads).collect {
          case JsSuccess(e, _) => e
        })
  }

  override def delete(query: JsObject)(
      implicit ec: ExecutionContext): Future[Boolean] = collection.flatMap {
    col =>
      logger.debug(s"$collectionName.delete(${Json.prettyPrint(query)})")
      col.delete(ordered = true).one(query).map(_.ok)
  }

  override def save(query: JsObject, value: JsObject)(
      implicit ec: ExecutionContext): Future[Boolean] =
    collection.flatMap { col =>
      logger.debug(
        s"$collectionName.upsert(${Json.prettyPrint(query)}, ${Json.prettyPrint(value)})")
      col
        .findAndUpdate(
          selector = query,
          update = value,
          fetchNewObject = false,
          upsert = true,
          sort = None,
          fields = None,
          bypassDocumentValidation = false,
          writeConcern = WriteConcern.Default,
          maxTime = None,
          collation = None,
          arrayFilters = Seq.empty
        )
        .map(_.lastError.isDefined)
    }

  def insertMany(values: Seq[Of], addToPayload: JsObject)(
      implicit ec: ExecutionContext): Future[Long] =
    collection.flatMap { col =>
      val payloads =
        values.map(v => format.writes(v).as[JsObject] ++ addToPayload)
      col
        .insert(true)
        .many(payloads)
        .map(_.n)
    }

  override def insertMany(values: Seq[Of])(
      implicit ec: ExecutionContext): Future[Long] =
    insertMany(values, Json.obj())

  override def updateMany(query: JsObject, value: JsObject)(
      implicit ec: ExecutionContext): Future[Long] =
    collection.flatMap { col =>
      val update = col.update(ordered = true)
      update
        .element(q = query,
                 u = Json.obj("$set" -> value),
                 upsert = false,
                 multi = true)
        .flatMap { element =>
          update.many(List(element)).map(_.nModified)
        }
    }

  override def updateManyByQuery(query: JsObject, queryUpdate: JsObject)(
      implicit ec: ExecutionContext): Future[Long] =
    collection.flatMap { col =>
      val update = col.update(ordered = true)
      update
        .element(q = query, u = queryUpdate, upsert = false, multi = true)
        .flatMap { element =>
          update.many(List(element)).map(_.nModified)
        }
    }

  override def findMaxByQuery(query: JsObject, field: String)(
      implicit ec: ExecutionContext): Future[Option[Long]] =
    collection.flatMap { col =>
      import col.BatchCommands.AggregationFramework
      import AggregationFramework.{Group, Match, MaxField}

      col
        .aggregatorContext[JsObject](
          firstOperator = Match(query),
          otherOperators =
            List(Group(JsString("$clientId"))("max" -> MaxField(field))),
          explain = false,
          allowDiskUse = false,
          bypassDocumentValidation = false,
          readConcern = ReadConcern.Majority,
          readPreference = ReadPreference.primaryPreferred,
          writeConcern = WriteConcern.Default,
          batchSize = None,
          cursorOptions = CursorOptions.empty,
          maxTime = None,
          hint = None,
          comment = None,
          collation = None
        )
        .prepared
        .cursor
        .collect[List](1, Cursor.FailOnError[List[JsObject]]())
        .map(agg => agg.headOption.map(v => (v \ "max").as(json.LongFormat)))
    }

  def deleteByIdLogically(id: String, q: JsObject)(
      implicit ec: ExecutionContext): Future[Boolean] = {
    collection.flatMap { col =>
      val update = col.update(ordered = true)
      update
        .one(
          q = Json.obj("_deleted" -> false, "_id" -> id) ++ q,
          u = Json.obj("$set" -> Json.obj("_deleted" -> true)),
          upsert = false,
          multi = false
        )
        .map(_.ok)
    }
  }

  override def deleteLogically(query: JsObject)(
      implicit ec: ExecutionContext): Future[Boolean] = {
    collection.flatMap { col =>
      val update = col.update(ordered = true)
      update
        .element(q = query ++ Json.obj("_deleted" -> false),
                 u = Json.obj("$set" -> Json.obj("_deleted" -> true)),
                 upsert = false,
                 multi = true)
        .flatMap { element =>
          update.many(List(element)).map(_.ok)
        }
    }
  }

  def deleteAllLogically(query: JsObject)(
      implicit ec: ExecutionContext): Future[Boolean] = {
    collection.flatMap { col =>
      val update = col.update(ordered = true)
      update
        .element(q = Json.obj("_deleted" -> false) ++ query,
                 u = Json.obj("$set" -> Json.obj("_deleted" -> true)),
                 upsert = false,
                 multi = true)
        .flatMap { element =>
          update.many(List(element)).map(_.ok)
        }
    }
  }

  override def findWithProjection(query: JsObject, projection: JsObject)(
      implicit ec: ExecutionContext
  ): Future[Seq[JsObject]] = collection.flatMap { col =>
    logger.debug(
      s"$collectionName.find(${Json.prettyPrint(query)}, ${Json.prettyPrint(projection)})"
    )
    col
      .find(query, Some(projection))
      .cursor[JsObject](ReadPreference.primaryPreferred)
      .collect[Seq](maxDocs = -1, Cursor.FailOnError[Seq[JsObject]]())
  }

  override def findOneWithProjection(query: JsObject, projection: JsObject)(
      implicit ec: ExecutionContext
  ): Future[Option[JsObject]] = collection.flatMap { col =>
    logger.debug(
      s"$collectionName.findOne(${Json.prettyPrint(query)}, ${Json.prettyPrint(projection)})")
    col
      .find(query, Some(projection))
      .one[JsObject](ReadPreference.primaryPreferred)
  }

  override def findWithPagination(query: JsObject,
                                  page: Int,
                                  pageSize: Int,
                                  sort: Option[JsObject] = None)(
      implicit ec: ExecutionContext
  ): Future[(Seq[Of], Long)] = collection.flatMap { col =>
    logger.debug(
      s"$collectionName.findWithPagination(${Json.prettyPrint(query)}, $page, $pageSize)")
    for {
      count <- col.count(Some(query), None, 0, None, ReadConcern.Majority)
      queryRes <- col
        .find(query, None)
        .sort(sort.getOrElse(Json.obj("_id" -> -1)))
        .batchSize(pageSize)
        .skip(page * pageSize)
        .cursor[JsObject](ReadPreference.primaryPreferred)
        .collect[Seq](maxDocs = pageSize, Cursor.FailOnError[Seq[JsObject]]())
        .map(_.map(format.reads).collect {
          case JsSuccess(e, _) => e
        })
    } yield {
      (queryRes, count)
    }
  }
}
