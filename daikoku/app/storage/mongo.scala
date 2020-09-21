package storage

import akka.NotUsed
import akka.http.scaladsl.util.FastFuture
import akka.stream.Materializer
import akka.stream.scaladsl.{Framing, Keep, Sink, Source}
import akka.util.ByteString
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json._
import fr.maif.otoroshi.daikoku.env.Env
import play.api.Logger
import play.api.libs.json._
import play.modules.reactivemongo.ReactiveMongoApi
import reactivemongo.api.commands.WriteResult
import reactivemongo.api.indexes.Index
import reactivemongo.api.{
  Cursor,
  CursorOptions,
  ReadConcern,
  ReadPreference,
  WriteConcern
}
import reactivemongo.play.json.collection.JSONCollection

import scala.concurrent.{ExecutionContext, Future}

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
    _repo: () => MongoRepo[JsObject, MongoId],
    _tenantRepo: TenantId => MongoTenantAwareRepo[JsObject, MongoId])
    extends MongoTenantCapableRepo[JsObject, MongoId]
    with AuditTrailRepo {
  override def tenantRepo(
      tenant: TenantId): MongoTenantAwareRepo[JsObject, MongoId] =
    _tenantRepo(tenant)

  override def repo(): MongoRepo[JsObject, MongoId] = _repo()
}

case class MongoTenantCapableTranslationRepo(
    _repo: () => MongoRepo[Translation, MongoId],
    _tenantRepo: TenantId => MongoTenantAwareRepo[Translation, MongoId]
) extends MongoTenantCapableRepo[Translation, MongoId]
    with TranslationRepo {
  override def tenantRepo(
      tenant: TenantId): MongoTenantAwareRepo[Translation, MongoId] =
    _tenantRepo(tenant)

  override def repo(): MongoRepo[Translation, MongoId] = _repo()
}

case class MongoTenantCapableMessageRepo(
    _repo: () => MongoRepo[Message, MongoId],
    _tenantRepo: TenantId => MongoTenantAwareRepo[Message, MongoId]
) extends MongoTenantCapableRepo[Message, MongoId]
  with MessageRepo {
  override def tenantRepo(tenant: TenantId): MongoTenantAwareRepo[Message, MongoId] =
    _tenantRepo(tenant)

  override def repo(): MongoRepo[Message, MongoId] = _repo()
}

case class MongoTenantCapableConsumptionRepo(
    _repo: () => MongoRepo[ApiKeyConsumption, MongoId],
    _tenantRepo: TenantId => MongoTenantAwareRepo[ApiKeyConsumption, MongoId]
) extends MongoTenantCapableRepo[ApiKeyConsumption, MongoId]
    with ConsumptionRepo {

  implicit val jsObjectFormat: OFormat[JsObject] = new OFormat[JsObject] {
    override def reads(json: JsValue): JsResult[JsObject] =
      json.validate[JsObject](Reads.JsObjectReads)

    override def writes(o: JsObject): JsObject = o
  }

  val jsObjectWrites: OWrites[JsObject] = (o: JsObject) => o

  override def tenantRepo(
      tenant: TenantId): MongoTenantAwareRepo[ApiKeyConsumption, MongoId] =
    _tenantRepo(tenant)

  override def repo(): MongoRepo[ApiKeyConsumption, MongoId] = _repo()

  private def lastConsumptions(tenantId: Option[TenantId], filter: JsObject)(
      implicit ec: ExecutionContext): Future[Seq[ApiKeyConsumption]] = {
    val rep = tenantId match {
      case Some(t) =>
        forTenant(t)
          .asInstanceOf[MongoTenantAwareRepo[ApiKeyConsumption, MongoId]]
      case None =>
        forAllTenant().asInstanceOf[MongoRepo[ApiKeyConsumption, MongoId]]
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

class MongoDataStore(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends DataStore {

  val logger = Logger("MongoDataStore")
  implicit val ec: ExecutionContext = env.defaultExecutionContext

  private val _tenantRepo: TenantRepo =
    new MongoTenantRepo(env, reactiveMongoApi)
  private val _userRepo: UserRepo = new MongoUserRepo(env, reactiveMongoApi)
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

  override def tenantRepo: TenantRepo = _tenantRepo

  override def userRepo: UserRepo = _userRepo

  override def teamRepo: TeamRepo = _teamRepo

  override def apiRepo: ApiRepo = _apiRepo

  override def apiSubscriptionRepo: ApiSubscriptionRepo = _apiSubscriptionRepo

  override def apiDocumentationPageRepo: ApiDocumentationPageRepo =
    _apiDocumentationPageRepo

  override def notificationRepo: NotificationRepo = _notificationRepo

  override def userSessionRepo: UserSessionRepo = _userSessionRepo

  override def auditTrailRepo: AuditTrailRepo = _auditTrailRepo

  override def consumptionRepo: ConsumptionRepo = _consumptionRepo

  override def passwordResetRepo: PasswordResetRepo = _passwordResetRepo

  override def accountCreationRepo: AccountCreationRepo = _accountCreationRepo

  override def translationRepo: TranslationRepo = _translationRepo

  override def messageRepo: MessageRepo = _messageRepo

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

  override def exportAsStream(pretty: Boolean)(
      implicit ec: ExecutionContext,
      mat: Materializer,
      env: Env): Source[ByteString, _] = {
    val collections: List[Repo[_, _]] = List(
      tenantRepo,
      userRepo,
      passwordResetRepo,
      accountCreationRepo,
      userSessionRepo
    ) ++ List(
      teamRepo.forAllTenant(),
      apiRepo.forAllTenant(),
      apiSubscriptionRepo.forAllTenant(),
      apiDocumentationPageRepo.forAllTenant(),
      notificationRepo.forAllTenant(),
      auditTrailRepo.forAllTenant(),
      consumptionRepo.forAllTenant(),
      translationRepo.forAllTenant()
    )
    Source(collections).flatMapConcat { collection =>
      collection.streamAllRaw().map { doc =>
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

  override def importFromStream(source: Source[ByteString, _])(
      implicit ec: ExecutionContext,
      mat: Materializer,
      env: Env): Future[Unit] = {
    for {
      _ <- env.dataStore.tenantRepo.deleteAll()
      _ <- env.dataStore.passwordResetRepo.deleteAll()
      _ <- env.dataStore.accountCreationRepo.deleteAll()
      _ <- env.dataStore.userRepo.deleteAll()
      _ <- env.dataStore.teamRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.apiRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.apiSubscriptionRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.apiDocumentationPageRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.notificationRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.consumptionRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.auditTrailRepo.forAllTenant().deleteAll()
      _ <- env.dataStore.userSessionRepo.deleteAll()
      _ <- env.dataStore.translationRepo.forAllTenant().deleteAll()
      _ <- source
        .via(Framing.delimiter(ByteString("\n"), 1000000000, true))
        .map(_.utf8String)
        .map(Json.parse)
        .map(json => json.as[JsObject])
        .map(json =>
          ((json \ "type").as[String], (json \ "payload").as[JsValue]))
        .mapAsync(1) {
          case ("Tenants", payload) =>
            env.dataStore.tenantRepo.save(TenantFormat.reads(payload).get)
          case ("PasswordReset", payload) =>
            env.dataStore.passwordResetRepo.save(
              PasswordResetFormat.reads(payload).get)
          case ("AccountCreation", payload) =>
            env.dataStore.accountCreationRepo.save(
              AccountCreationFormat.reads(payload).get)
          case ("Users", payload) =>
            env.dataStore.userRepo.save(UserFormat.reads(payload).get)
          case ("Teams", payload) =>
            env.dataStore.teamRepo
              .forAllTenant()
              .save(TeamFormat.reads(payload).get)
          case ("Apis", payload) =>
            env.dataStore.apiRepo
              .forAllTenant()
              .save(ApiFormat.reads(payload).get)
          case ("ApiSubscriptions", payload) =>
            env.dataStore.apiSubscriptionRepo
              .forAllTenant()
              .save(ApiSubscriptionFormat.reads(payload).get)
          case ("ApiDocumentationPages", payload) =>
            env.dataStore.apiDocumentationPageRepo
              .forAllTenant()
              .save(ApiDocumentationPageFormat.reads(payload).get)
          case ("Notifications", payload) =>
            env.dataStore.notificationRepo
              .forAllTenant()
              .save(NotificationFormat.reads(payload).get)
          case ("Consumptions", payload) =>
            env.dataStore.consumptionRepo
              .forAllTenant()
              .save(ConsumptionFormat.reads(payload).get)
          case ("Translations", payload) =>
            env.dataStore.translationRepo
              .forAllTenant()
              .save(TranslationFormat.reads(payload).get)
          case ("AuditEvents", payload) =>
            env.dataStore.auditTrailRepo
              .forAllTenant()
              .save(payload.as[JsObject])
          case ("UserSessions", payload) =>
            env.dataStore.userSessionRepo.save(
              UserSessionFormat.reads(payload).get)
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
    extends MongoRepo[PasswordReset, MongoId](env, reactiveMongoApi)
    with PasswordResetRepo {
  override def collectionName: String = "PasswordReset"

  override def format: Format[PasswordReset] = json.PasswordResetFormat

  override def extractId(value: PasswordReset): String = value.id.value
}

class MongoAccountCreationRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[AccountCreation, MongoId](env, reactiveMongoApi)
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
    extends MongoTenantAwareRepo[Translation, MongoId](env,
                                                       reactiveMongoApi,
                                                       tenant) {
  override def collectionName: String = "Translations"

  override def format: Format[Translation] = json.TranslationFormat

  override def extractId(value: Translation): String = value.id.value
}

class MongoTenantMessageRepo(env: Env,
                                 reactiveMongoApi: ReactiveMongoApi,
                                 tenant: TenantId)
    extends MongoTenantAwareRepo[Message, MongoId](env,
                                                       reactiveMongoApi,
                                                       tenant) {
  override def collectionName: String = "Messages"

  override def format: Format[Message] = json.MessageFormat

  override def extractId(value: Message): String = value.id.value
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
    extends MongoTenantAwareRepo[ApiKeyConsumption, MongoId](env,
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
    extends MongoTenantAwareRepo[JsObject, MongoId](env,
                                                    reactiveMongoApi,
                                                    tenant) {
  val _fmt = new Format[JsObject] {
    override def reads(json: JsValue): JsResult[JsObject] =
      JsSuccess(json.as[JsObject])

    override def writes(o: JsObject): JsValue = o
  }

  override def collectionName: String = "AuditEvents"

  override def format: Format[JsObject] = _fmt

  override def extractId(value: JsObject): String = (value \ "_id").as[String]
}

class MongoUserRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[User, UserId](env, reactiveMongoApi)
    with UserRepo {
  override def collectionName: String = "Users"

  override def format: Format[User] = json.UserFormat

  override def extractId(value: User): String = value.id.value
}

class MongoTeamRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[Team, TeamId](env, reactiveMongoApi) {
  override def collectionName: String = "Teams"

  override def format: Format[Team] = json.TeamFormat

  override def extractId(value: Team): String = value.id.value
}

class MongoTranslationRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[Translation, MongoId](env, reactiveMongoApi) {
  override def collectionName: String = "Translations"

  override def format: Format[Translation] = json.TranslationFormat

  override def extractId(value: Translation): String = value.id.value
}

class MongoMessageRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[Message, MongoId](env, reactiveMongoApi) {
  override def collectionName: String = "Messages"

  override def format: Format[Message] = json.MessageFormat

  override def extractId(value: Message): String = value.id.value
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

class MongoNotificationRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[Notification, NotificationId](env, reactiveMongoApi) {
  override def collectionName: String = "Notifications"

  override def format: Format[Notification] =
    json.NotificationFormat

  override def extractId(value: Notification): String = value.id.value
}

class MongoConsumptionRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[ApiKeyConsumption, MongoId](env, reactiveMongoApi) {
  override def collectionName: String = "Consumptions"

  override def format: Format[ApiKeyConsumption] = json.ConsumptionFormat

  override def extractId(value: ApiKeyConsumption): String = value.id.value
}

class MongoUserSessionRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[UserSession, MongoId](env, reactiveMongoApi)
    with UserSessionRepo {
  override def collectionName: String = "UserSessions"

  override def format: Format[UserSession] =
    json.UserSessionFormat

  override def extractId(value: UserSession): String = value.id.value
}

class MongoAuditTrailRepo(env: Env, reactiveMongoApi: ReactiveMongoApi)
    extends MongoRepo[JsObject, MongoId](env, reactiveMongoApi) {
  val _fmt = new Format[JsObject] {
    override def reads(json: JsValue): JsResult[JsObject] =
      JsSuccess(json.as[JsObject])

    override def writes(o: JsObject): JsValue = o
  }

  override def collectionName: String = "AuditEvents"

  override def format: Format[JsObject] = _fmt

  override def extractId(value: JsObject): String = (value \ "_id").as[String]
}

abstract class MongoRepo[Of, Id <: ValueType](
    env: Env,
    reactiveMongoApi: ReactiveMongoApi)
    extends Repo[Of, Id] {

  val logger = Logger(s"MongoRepo")

  implicit val jsObjectFormat = new OFormat[JsObject] {
    override def reads(json: JsValue): JsResult[JsObject] =
      json.validate[JsObject](Reads.JsObjectReads)

    override def writes(o: JsObject): JsObject = o
  }

  val jsObjectWrites: OWrites[JsObject] = new OWrites[JsObject] {
    override def writes(o: JsObject): JsObject = o
  }

  def collectionName: String

  def indices: Seq[Index.Default] = Seq.empty

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

  override def count(query: JsObject)(implicit ec: ExecutionContext): Future[Long] =
    collection.flatMap { col =>
      col.count(Some(query), None, 0, None, ReadConcern.Majority)
    }

  def findAllRaw()(implicit ec: ExecutionContext): Future[Seq[JsValue]] =
    collection.flatMap { col =>
      logger.debug(s"$collectionName.findAllRaw({})")
      col
        .find(Json.obj(), None)
        .cursor[JsObject](ReadPreference.primaryPreferred)
        .collect[Seq](maxDocs = -1, Cursor.FailOnError[Seq[JsObject]]())
    }

  def streamAll()(implicit ec: ExecutionContext): Source[Of, NotUsed] =
    Source
      .future(collection.flatMap { col =>
        logger.debug(s"$collectionName.streamAll({})")
        col
          .find(Json.obj(), None)
          .cursor[JsObject](ReadPreference.primaryPreferred)
          .collect[Seq](maxDocs = -1, Cursor.FailOnError[Seq[JsObject]]())
          .map { docs =>
            docs
              .map(format.reads)
              .map {
                case j @ JsSuccess(_, _) => j
                case j @ JsError(_) =>
                  println(s"error: $j")
                  j
              }
              .collect {
                case JsSuccess(e, _) => e
              }
          }
      })
      .flatMapConcat(seq => Source(seq.toList))

  def streamAllRaw()(implicit ec: ExecutionContext): Source[JsValue, NotUsed] =
    Source
      .future(collection.flatMap { col =>
        logger.debug(s"$collectionName.streamAllRaw({})")
        col
          .find(Json.obj(), None)
          .cursor[JsObject](ReadPreference.primaryPreferred)
          .collect[Seq](maxDocs = -1, Cursor.FailOnError[Seq[JsObject]]())
      })
      .flatMapConcat(seq => Source(seq.toList))

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
      implicit ec: ExecutionContext): Future[WriteResult] = collection.flatMap {
    col =>
      logger.debug(s"$collectionName.delete(${Json.prettyPrint(query)})")
      col.delete(ordered = true).one(query)
  }

  override def save(value: Of)(
      implicit ec: ExecutionContext): Future[Boolean] = {
    val payload = format.writes(value).as[JsObject]
    save(Json.obj("_id" -> extractId(value)), payload)
  }

  override def save(query: JsObject, value: JsObject)(
      implicit ec: ExecutionContext): Future[Boolean] =
    collection.flatMap { col =>
      logger.debug(
        s"$collectionName.upsert(${Json.prettyPrint(query)}, ${Json.prettyPrint(value)})"
      )
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

  override def insertMany(values: Seq[Of])(
      implicit ec: ExecutionContext): Future[Long] =
    collection.flatMap { col =>
      val payloads = values.map(v => format.writes(v).as[JsObject])
      col
        .insert(true)
        .many(payloads)
        .map(_.n)
    }

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
        .element(q = query,
          u = queryUpdate,
          upsert = false,
          multi = true)
        .flatMap { element =>
          update.many(List(element)).map(_.nModified)
        }
    }

  override def deleteByIdLogically(id: String)(
      implicit ec: ExecutionContext): Future[WriteResult] = {
    collection.flatMap { col =>
      val update = col.update(ordered = true)
      update.one(
        q = Json.obj("_deleted" -> false, "_id" -> id),
        u = Json.obj("$set" -> Json.obj("_deleted" -> true)),
        upsert = false,
        multi = false
      )
    }
  }

  override def deleteByIdLogically(id: Id)(
      implicit ec: ExecutionContext): Future[WriteResult] = {
    collection.flatMap { col =>
      val update = col.update(ordered = true)
      update.one(
        q = Json.obj("_deleted" -> false, "_id" -> id.value),
        u = Json.obj("$set" -> Json.obj("_deleted" -> true)),
        upsert = false,
        multi = false
      )
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

  override def deleteAllLogically()(
      implicit ec: ExecutionContext): Future[Boolean] = {
    collection.flatMap { col =>
      val update = col.update(ordered = true)
      update
        .element(q = Json.obj("_deleted" -> false),
                 u = Json.obj("$set" -> Json.obj("_deleted" -> true)),
                 upsert = false,
                 multi = true)
        .flatMap { element =>
          update.many(List(element)).map(_.ok)
        }
    }
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

  override def count()(implicit ec: ExecutionContext): Future[Long] =
    collection.flatMap { col =>
      logger.debug(s"$collectionName.count({})")
      col.count(None, None, 0, None, ReadConcern.Majority)
    }

  override def findWithProjection(query: JsObject, projection: JsObject)(
      implicit ec: ExecutionContext
  ): Future[Seq[JsObject]] = collection.flatMap { col =>
    logger.debug(
      s"$collectionName.find(${Json.prettyPrint(query)}, ${Json.prettyPrint(projection)})")
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

  override def findWithPagination(query: JsObject, page: Int, pageSize: Int)(
      implicit ec: ExecutionContext
  ): Future[(Seq[Of], Long)] = collection.flatMap { col =>
    logger.debug(
      s"$collectionName.findWithPagination(${Json.prettyPrint(query)}, $page, $pageSize)")
    for {
      count <- col.count(Some(query), None, 0, None, ReadConcern.Majority)
      queryRes <- col
        .find(query, None)
        .sort(Json.obj("_id" -> -1))
        .skip(page * pageSize)
        .batchSize(pageSize)
        .cursor[JsObject](ReadPreference.primaryPreferred)
        .collect[Seq](maxDocs = pageSize, Cursor.FailOnError[Seq[JsObject]]())
        .map(_.map(format.reads).collect {
          case JsSuccess(e, _) => e
        })
    } yield {
      (queryRes, count)
    }
  }

  override def findAll()(implicit ec: ExecutionContext): Future[Seq[Of]] =
    find(Json.obj())

  override def findById(id: String)(
      implicit ec: ExecutionContext): Future[Option[Of]] =
    findOne(Json.obj("_id" -> id))

  override def findById(id: Id)(
      implicit ec: ExecutionContext): Future[Option[Of]] =
    findOne(Json.obj("_id" -> id.value))

  override def deleteById(id: String)(
      implicit ec: ExecutionContext): Future[WriteResult] =
    delete(Json.obj("_id" -> id))

  override def deleteById(id: Id)(
      implicit ec: ExecutionContext): Future[WriteResult] =
    delete(Json.obj("_id" -> id.value))

  override def deleteAll()(implicit ec: ExecutionContext): Future[WriteResult] =
    delete(Json.obj())

  override def exists(id: String)(
      implicit ec: ExecutionContext): Future[Boolean] =
    exists(Json.obj("_id" -> id))

  override def exists(id: Id)(implicit ec: ExecutionContext): Future[Boolean] =
    exists(Json.obj("_id" -> id.value))
}

abstract class MongoTenantAwareRepo[Of, Id <: ValueType](
    env: Env,
    reactiveMongoApi: ReactiveMongoApi,
    tenant: TenantId)
    extends Repo[Of, Id] {

  val logger: Logger = Logger(s"MongoTenantAwareRepo")

  implicit val jsObjectFormat: OFormat[JsObject] = new OFormat[JsObject] {
    override def reads(json: JsValue): JsResult[JsObject] =
      json.validate[JsObject](Reads.JsObjectReads)

    override def writes(o: JsObject): JsObject = o
  }

  val jsObjectWrites: OWrites[JsObject] = (o: JsObject) => o

  def collectionName: String

  def indices: Seq[Index.Default] = Seq.empty

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

  def collection(implicit ec: ExecutionContext): Future[JSONCollection] =
    reactiveMongoApi.database.map(_.collection(collectionName))

  override def deleteByIdLogically(id: String)(
      implicit ec: ExecutionContext): Future[WriteResult] = {
    collection.flatMap { col =>
      val update = col.update(ordered = true)
      update.one(
        q =
          Json.obj("_deleted" -> false, "_id" -> id, "_tenant" -> tenant.value),
        u = Json.obj("$set" -> Json.obj("_deleted" -> true)),
        upsert = false,
        multi = false
      )
    }
  }

  override def deleteByIdLogically(id: Id)(
      implicit ec: ExecutionContext): Future[WriteResult] = {
    collection.flatMap { col =>
      val update = col.update(ordered = true)
      update.one(
        q = Json.obj("_deleted" -> false,
                     "_id" -> id.value,
                     "_tenant" -> tenant.value),
        u = Json.obj("$set" -> Json.obj("_deleted" -> true)),
        upsert = false,
        multi = false
      )
    }
  }

  override def deleteLogically(query: JsObject)(
      implicit ec: ExecutionContext): Future[Boolean] = {
    collection.flatMap { col =>
      val update = col.update(ordered = true)
      update
        .element(
          q = query ++ Json.obj("_deleted" -> false, "_tenant" -> tenant.value),
          u = Json.obj("$set" -> Json.obj("_deleted" -> true)),
          upsert = false,
          multi = true)
        .flatMap { element =>
          update.many(List(element)).map(_.ok)
        }
    }
  }

  override def deleteAllLogically()(
      implicit ec: ExecutionContext): Future[Boolean] = {
    collection.flatMap { col =>
      val update = col.update(ordered = true)
      update
        .element(q = Json.obj("_deleted" -> false, "_tenant" -> tenant.value),
                 u = Json.obj("$set" -> Json.obj("_deleted" -> true)),
                 upsert = false,
                 multi = true)
        .flatMap { element =>
          update.many(List(element)).map(_.ok)
        }
    }
  }

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

  def findAllRaw()(implicit ec: ExecutionContext): Future[Seq[JsValue]] =
    collection.flatMap { col =>
      logger.debug(s"$collectionName.findAllRaw(${Json.prettyPrint(
        Json.obj("_tenant" -> tenant.value))})")
      col
        .find(Json.obj("_tenant" -> tenant.value), None)
        .cursor[JsObject](ReadPreference.primaryPreferred)
        .collect[Seq](maxDocs = -1, Cursor.FailOnError[Seq[JsObject]]())
    }

  def streamAll()(implicit ec: ExecutionContext): Source[Of, NotUsed] =
    Source
      .future(collection.flatMap { col =>
        logger.debug(s"$collectionName.streamAll(${Json.prettyPrint(
          Json.obj("_tenant" -> tenant.value))})")
        col
          .find(Json.obj("_tenant" -> tenant.value), None)
          .cursor[JsObject](ReadPreference.primaryPreferred)
          .collect[Seq](maxDocs = -1, Cursor.FailOnError[Seq[JsObject]]())
          .map { docs =>
            docs
              .map(format.reads)
              .map {
                case j @ JsSuccess(_, _) => j
                case j @ JsError(_) =>
                  println(s"error: $j")
                  j
              }
              .collect {
                case JsSuccess(e, _) => e
              }
          }
      })
      .flatMapConcat(seq => Source(seq.toList))

  def streamAllRaw()(implicit ec: ExecutionContext): Source[JsValue, NotUsed] =
    Source
      .future(collection.flatMap { col =>
        logger.debug(s"$collectionName.streamAllRaw(${Json.prettyPrint(
          Json.obj("_tenant" -> tenant.value))})")
        col
          .find(Json.obj("_tenant" -> tenant.value), None)
          .cursor[JsObject](ReadPreference.primaryPreferred)
          .collect[Seq](maxDocs = -1, Cursor.FailOnError[Seq[JsObject]]())
      })
      .flatMapConcat(seq => Source(seq.toList))

  override def findOne(query: JsObject)(
      implicit ec: ExecutionContext): Future[Option[Of]] = collection.flatMap {
    col =>
      logger.debug(s"$collectionName.findOne(${Json.prettyPrint(
        query ++ Json.obj("_tenant" -> tenant.value))})")
      col
        .find(query ++ Json.obj("_tenant" -> tenant.value), None)
        .one[JsObject](ReadPreference.primaryPreferred)
        .map(_.map(format.reads).collect {
          case JsSuccess(e, _) => e
        })
        .recover(e => {
          logger.error("findOneError", e)
          None
        })
  }

  override def delete(query: JsObject)(
      implicit ec: ExecutionContext): Future[WriteResult] = collection.flatMap {
    col =>
      logger.debug(s"$collectionName.delete(${Json.prettyPrint(
        query ++ Json.obj("_tenant" -> tenant.value))})")
      col
        .delete(ordered = true)
        .one(query ++ Json.obj("_tenant" -> tenant.value))
  }

  override def save(value: Of)(
      implicit ec: ExecutionContext): Future[Boolean] = {
    val payload = format.writes(value).as[JsObject]
    save(Json.obj("_id" -> extractId(value)), payload)
  }

  override def save(query: JsObject, value: JsObject)(
      implicit ec: ExecutionContext): Future[Boolean] =
    collection.flatMap { col =>
      logger.debug(
        s"$collectionName.upsert(${Json.prettyPrint(query)}, ${Json.prettyPrint(value)})"
      )
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

  override def insertMany(values: Seq[Of])(
      implicit ec: ExecutionContext): Future[Long] =
    collection.flatMap { col =>
      val payloads = values.map(v =>
        format.writes(v).as[JsObject] ++ Json.obj("_tenant" -> tenant.value))
      col
        .insert(true)
        .many(payloads)
        .map(_.n)
    }

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
        .element(q = query,
          u = queryUpdate,
          upsert = false,
          multi = true)
        .flatMap { element =>
          update.many(List(element)).map(_.nModified)
        }
    }

  override def exists(query: JsObject)(
      implicit ec: ExecutionContext): Future[Boolean] = collection.flatMap {
    col =>
      logger.debug(s"$collectionName.exists(${Json.prettyPrint(
        query ++ Json.obj("_tenant" -> tenant.value))})")
      col
        .find(query ++ Json.obj("_tenant" -> tenant.value), None)
        .one[JsObject](ReadPreference.primaryPreferred)
        .map(_.isDefined)
  }

  override def count(query: JsObject)(implicit ec: ExecutionContext): Future[Long] =
    collection.flatMap { col =>
      col.count(Some(query), None, 0, None, ReadConcern.Majority)
    }

  override def count()(implicit ec: ExecutionContext): Future[Long] =
    collection.flatMap { col =>
      logger.debug(s"$collectionName.count({})")
      col.count(Some(Json.obj("_tenant" -> tenant.value)),
                None,
                0,
                None,
                ReadConcern.Majority)
    }

  override def findWithProjection(query: JsObject, projection: JsObject)(
      implicit ec: ExecutionContext
  ): Future[Seq[JsObject]] = collection.flatMap { col =>
    logger.debug(
      s"$collectionName.find(${Json.prettyPrint(query ++ Json.obj(
        "_tenant" -> tenant.value))}, ${Json.prettyPrint(projection)})"
    )
    col
      .find(query ++ Json.obj("_tenant" -> tenant.value), Some(projection))
      .cursor[JsObject](ReadPreference.primaryPreferred)
      .collect[Seq](maxDocs = -1, Cursor.FailOnError[Seq[JsObject]]())
  }

  override def findOneWithProjection(query: JsObject, projection: JsObject)(
      implicit ec: ExecutionContext
  ): Future[Option[JsObject]] = collection.flatMap { col =>
    logger.debug(
      s"$collectionName.findOne(${Json.prettyPrint(query ++ Json.obj(
        "_tenant" -> tenant.value))}, ${Json.prettyPrint(projection)})"
    )
    col
      .find(query ++ Json.obj("_tenant" -> tenant.value), Some(projection))
      .one[JsObject](ReadPreference.primaryPreferred)
  }

  override def findWithPagination(query: JsObject, page: Int, pageSize: Int)(
      implicit ec: ExecutionContext
  ): Future[(Seq[Of], Long)] = collection.flatMap { col =>
    logger.debug(
      s"$collectionName.findWithPagination(${Json.prettyPrint(query)}, $page, $pageSize)")
    for {
      count <- col.count(Some(query), None, 0, None, ReadConcern.Majority)
      queryRes <- col
        .find(query, None)
        .sort(Json.obj("_id" -> -1))
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

  override def findAll()(implicit ec: ExecutionContext): Future[Seq[Of]] =
    find(Json.obj())

  override def findById(id: String)(
      implicit ec: ExecutionContext): Future[Option[Of]] =
    findOne(Json.obj("_id" -> id))

  override def findById(id: Id)(
      implicit ec: ExecutionContext): Future[Option[Of]] =
    findOne(Json.obj("_id" -> id.value))

  override def deleteById(id: String)(
      implicit ec: ExecutionContext): Future[WriteResult] =
    delete(Json.obj("_id" -> id))

  override def deleteById(id: Id)(
      implicit ec: ExecutionContext): Future[WriteResult] =
    delete(Json.obj("_id" -> id.value))

  override def deleteAll()(implicit ec: ExecutionContext): Future[WriteResult] =
    delete(Json.obj())

  override def exists(id: String)(
      implicit ec: ExecutionContext): Future[Boolean] =
    exists(Json.obj("_id" -> id))

  override def exists(id: Id)(implicit ec: ExecutionContext): Future[Boolean] =
    exists(Json.obj("_id" -> id.value))
}
