package storage

import akka.NotUsed
import akka.http.scaladsl.util.FastFuture
import akka.stream.Materializer
import akka.stream.scaladsl.{Framing, Keep, Sink, Source}
import akka.util.ByteString
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json._
import fr.maif.otoroshi.daikoku.env.Env
import org.jooq.impl.DSL
import play.api.Logger
import play.api.libs.json._
import play.modules.reactivemongo.ReactiveMongoApi
import reactivemongo.api.commands.WriteResult
import reactivemongo.api.indexes.Index
import reactivemongo.api.{Cursor, CursorOptions, ReadConcern, ReadPreference, WriteConcern}
import storage.Helper.{convertQuery, getContentFromJson, getContentsListFromJson, recordToJson}
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
  override def tenantRepo(
                           tenant: TenantId): MongoTenantAwareRepo[Message, MongoId] =
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

    Future.successful(Seq())

    //    rep.collection.flatMap { col =>
    //      import col.BatchCommands.AggregationFramework
    //      import AggregationFramework.{Group, Match, MaxField}
    //
    //      col
    //        .aggregatorContext[JsObject](
    //          firstOperator = Match(filter),
    //          otherOperators =
    //            List(Group(JsString("$clientId"))("maxFrom" -> MaxField("from"))),
    //          explain = false,
    //          allowDiskUse = false,
    //          bypassDocumentValidation = false,
    //          readConcern = ReadConcern.Majority,
    //          readPreference = ReadPreference.primaryPreferred,
    //          writeConcern = WriteConcern.Default,
    //          batchSize = None,
    //          cursorOptions = CursorOptions.empty,
    //          maxTime = None,
    //          hint = None,
    //          comment = None,
    //          collation = None
    //        )
    //        .prepared
    //        .cursor
    //        .collect[List](-1, Cursor.FailOnError[List[JsObject]]())
    //        .flatMap { agg =>
    //          val futures: List[Future[Option[ApiKeyConsumption]]] = agg.map(
    //            json =>
    //              col
    //                .find(Json.obj("clientId" -> (json \ "_id").as[String],
    //                               "from" -> (json \ "maxFrom" \ "$long").as[Long]),
    //                      None)
    //                .one[JsObject](ReadPreference.primaryPreferred)
    //                .map { results =>
    //                  results.map(rep.format.reads).collect {
    //                    case JsSuccess(e, _) => e
    //                  }
    //              }
    //          )
    //          Future.sequence(futures).map(_.flatten)
    //        }
    //    }
  }

  override def getLastConsumptionsforAllTenant(filter: JsObject)(
    implicit ec: ExecutionContext
  ): Future[Seq[ApiKeyConsumption]] = lastConsumptions(None, filter)

  override def getLastConsumptionsForTenant(tenantId: TenantId,
                                            filter: JsObject)(
                                             implicit ec: ExecutionContext
                                           ): Future[Seq[ApiKeyConsumption]] = lastConsumptions(Some(tenantId), filter)
}

class MongoDataStore(env: Env, db: PostgresConnection, reactiveMongoApi: ReactiveMongoApi)
  extends DataStore {

  val logger = Logger("MongoDataStore")
  implicit val ec: ExecutionContext = env.defaultExecutionContext

  private val _tenantRepo: TenantRepo =
    new MongoTenantRepo(env, db, reactiveMongoApi)
  private val _userRepo: UserRepo = new MongoUserRepo(env, db, reactiveMongoApi)
  private val _teamRepo: TeamRepo = MongoTenantCapableTeamRepo(
    () => new MongoTeamRepo(env, db, reactiveMongoApi),
    t => new MongoTenantTeamRepo(env, db, reactiveMongoApi, t))
  private val _apiRepo: ApiRepo = MongoTenantCapableApiRepo(
    () => new MongoApiRepo(env, db, reactiveMongoApi),
    t => new MongoTenantApiRepo(env, db, reactiveMongoApi, t))
  private val _apiSubscriptionRepo: ApiSubscriptionRepo =
    MongoTenantCapableApiSubscriptionRepo(
      () => new MongoApiSubscriptionRepo(env, db, reactiveMongoApi),
      t => new MongoTenantApiSubscriptionRepo(env, db, reactiveMongoApi, t)
    )
  private val _apiDocumentationPageRepo: ApiDocumentationPageRepo =
    MongoTenantCapableApiDocumentationPageRepo(
      () => new MongoApiDocumentationPageRepo(env, db, reactiveMongoApi),
      t => new MongoTenantApiDocumentationPageRepo(env, db, reactiveMongoApi, t)
    )
  private val _notificationRepo: NotificationRepo =
    MongoTenantCapableNotificationRepo(
      () => new MongoNotificationRepo(env, db, reactiveMongoApi),
      t => new MongoTenantNotificationRepo(env, db, reactiveMongoApi, t)
    )
  private val _userSessionRepo: UserSessionRepo =
    new MongoUserSessionRepo(env, db, reactiveMongoApi)
  private val _auditTrailRepo: AuditTrailRepo =
    MongoTenantCapableAuditTrailRepo(
      () => new MongoAuditTrailRepo(env, db, reactiveMongoApi),
      t => new MongoTenantAuditTrailRepo(env, db, reactiveMongoApi, t)
    )
  private val _consumptionRepo: ConsumptionRepo =
    MongoTenantCapableConsumptionRepo(
      () => new MongoConsumptionRepo(env, db, reactiveMongoApi),
      t => new MongoTenantConsumptionRepo(env, db, reactiveMongoApi, t)
    )
  private val _passwordResetRepo: PasswordResetRepo =
    new MongoPasswordResetRepo(env, db, reactiveMongoApi)
  private val _accountCreationRepo: AccountCreationRepo =
    new MongoAccountCreationRepo(env, db, reactiveMongoApi)
  private val _translationRepo: TranslationRepo =
    MongoTenantCapableTranslationRepo(
      () => new MongoTranslationRepo(env, db, reactiveMongoApi),
      t => new MongoTenantTranslationRepo(env, db, reactiveMongoApi, t))
  private val _messageRepo: MessageRepo =
    MongoTenantCapableMessageRepo(
      () => new MongoMessageRepo(env, db, reactiveMongoApi),
      t => new MongoTenantMessageRepo(env, db, reactiveMongoApi, t)
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

  override def start(): Future[Unit] = {
    Future.successful(())
  }

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
            Json.prettyPrint(Json.obj("type" -> collection.tableName,
              "payload" -> doc)) + "\n")
        } else {
          ByteString(
            Json.stringify(Json.obj("type" -> collection.tableName,
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

class MongoTenantRepo(env: Env, db: PostgresConnection, reactiveMongoApi: ReactiveMongoApi)
  extends MongoRepo[Tenant, TenantId](env, db, reactiveMongoApi)
    with TenantRepo {
  override def tableName: String = "tenants"

  override def format: Format[Tenant] = json.TenantFormat

  override def extractId(value: Tenant): String = value.id.value
}

class MongoPasswordResetRepo(env: Env, db: PostgresConnection, reactiveMongoApi: ReactiveMongoApi)
  extends MongoRepo[PasswordReset, MongoId](env, db, reactiveMongoApi)
    with PasswordResetRepo {
  override def tableName: String = "password_reset"

  override def format: Format[PasswordReset] = json.PasswordResetFormat

  override def extractId(value: PasswordReset): String = value.id.value
}

class MongoAccountCreationRepo(env: Env, db: PostgresConnection, reactiveMongoApi: ReactiveMongoApi)
  extends MongoRepo[AccountCreation, MongoId](env, db, reactiveMongoApi)
    with AccountCreationRepo {
  override def tableName: String = "account_creation"

  override def format: Format[AccountCreation] = json.AccountCreationFormat

  override def extractId(value: AccountCreation): String = value.id.value
}

class MongoTenantTeamRepo(env: Env,
                          db: PostgresConnection,
                          reactiveMongoApi: ReactiveMongoApi,
                          tenant: TenantId)
  extends MongoTenantAwareRepo[Team, TeamId](env, db, reactiveMongoApi, tenant) {
  override def tableName: String = "teams"

  override def format: Format[Team] = json.TeamFormat

  override def extractId(value: Team): String = value.id.value
}

class MongoTenantApiRepo(env: Env,
                         db: PostgresConnection,
                         reactiveMongoApi: ReactiveMongoApi,
                         tenant: TenantId)
  extends MongoTenantAwareRepo[Api, ApiId](env, db, reactiveMongoApi, tenant) {
  override def format: Format[Api] = json.ApiFormat

  override def tableName: String = "apis"

  override def extractId(value: Api): String = value.id.value
}

class MongoTenantTranslationRepo(env: Env,
                                 db: PostgresConnection,
                                 reactiveMongoApi: ReactiveMongoApi,
                                 tenant: TenantId)
  extends MongoTenantAwareRepo[Translation, MongoId](env,
    db,
    reactiveMongoApi,
    tenant) {
  override def tableName: String = "translations"

  override def format: Format[Translation] = json.TranslationFormat

  override def extractId(value: Translation): String = value.id.value
}

class MongoTenantMessageRepo(env: Env,
                             db: PostgresConnection,
                             reactiveMongoApi: ReactiveMongoApi,
                             tenant: TenantId)
  extends MongoTenantAwareRepo[Message, MongoId](env,
    db,
    reactiveMongoApi,
    tenant) {
  override def tableName: String = "messages"

  override def format: Format[Message] = json.MessageFormat

  override def extractId(value: Message): String = value.id.value
}

class MongoTenantApiSubscriptionRepo(env: Env,
                                     db: PostgresConnection,
                                     reactiveMongoApi: ReactiveMongoApi,
                                     tenant: TenantId)
  extends MongoTenantAwareRepo[ApiSubscription, ApiSubscriptionId](
    env,
    db,
    reactiveMongoApi,
    tenant) {
  override def tableName: String = "api_subscriptions"

  override def format: Format[ApiSubscription] = json.ApiSubscriptionFormat

  override def extractId(value: ApiSubscription): String = value.id.value
}

class MongoTenantApiDocumentationPageRepo(env: Env,
                                          db: PostgresConnection,
                                          reactiveMongoApi: ReactiveMongoApi,
                                          tenant: TenantId)
  extends MongoTenantAwareRepo[ApiDocumentationPage, ApiDocumentationPageId](
    env,
    db,
    reactiveMongoApi,
    tenant) {
  override def tableName: String = "api_documentation_pages"

  override def format: Format[ApiDocumentationPage] =
    json.ApiDocumentationPageFormat

  override def extractId(value: ApiDocumentationPage): String = value.id.value
}

class MongoTenantNotificationRepo(env: Env,
                                  db: PostgresConnection,
                                  reactiveMongoApi: ReactiveMongoApi,
                                  tenant: TenantId)
  extends MongoTenantAwareRepo[Notification, NotificationId](env,
    db,
    reactiveMongoApi,
    tenant) {
  override def tableName: String = "notifications"

  override def format: Format[Notification] =
    json.NotificationFormat

  override def extractId(value: Notification): String = value.id.value
}

class MongoTenantConsumptionRepo(env: Env,
                                 db: PostgresConnection,
                                 reactiveMongoApi: ReactiveMongoApi,
                                 tenant: TenantId)
  extends MongoTenantAwareRepo[ApiKeyConsumption, MongoId](env,
    db,
    reactiveMongoApi,
    tenant) {
  override def tableName: String = "consumptions"

  override def format: Format[ApiKeyConsumption] =
    json.ConsumptionFormat

  override def extractId(value: ApiKeyConsumption): String = value.id.value
}

class MongoTenantAuditTrailRepo(env: Env,
                                db: PostgresConnection,
                                reactiveMongoApi: ReactiveMongoApi,
                                tenant: TenantId)
  extends MongoTenantAwareRepo[JsObject, MongoId](env,
    db,
    reactiveMongoApi,
    tenant) {
  val _fmt = new Format[JsObject] {
    override def reads(json: JsValue): JsResult[JsObject] =
      JsSuccess(json.as[JsObject])

    override def writes(o: JsObject): JsValue = o
  }

  override def tableName: String = "audit_events"

  override def format: Format[JsObject] = _fmt

  override def extractId(value: JsObject): String = (value \ "_id").as[String]
}

class MongoUserRepo(env: Env, db: PostgresConnection, reactiveMongoApi: ReactiveMongoApi)
  extends MongoRepo[User, UserId](env, db, reactiveMongoApi)
    with UserRepo {
  override def tableName: String = "users"

  override def format: Format[User] = json.UserFormat

  override def extractId(value: User): String = value.id.value
}

class MongoTeamRepo(env: Env, db: PostgresConnection, reactiveMongoApi: ReactiveMongoApi)
  extends MongoRepo[Team, TeamId](env, db, reactiveMongoApi) {
  override def tableName: String = "teams"

  override def format: Format[Team] = json.TeamFormat

  override def extractId(value: Team): String = value.id.value
}

class MongoTranslationRepo(env: Env, db: PostgresConnection, reactiveMongoApi: ReactiveMongoApi)
  extends MongoRepo[Translation, MongoId](env, db, reactiveMongoApi) {
  override def tableName: String = "translations"

  override def format: Format[Translation] = json.TranslationFormat

  override def extractId(value: Translation): String = value.id.value
}

class MongoMessageRepo(env: Env, db: PostgresConnection, reactiveMongoApi: ReactiveMongoApi)
  extends MongoRepo[Message, MongoId](env, db, reactiveMongoApi) {
  override def tableName: String = "messages"

  override def format: Format[Message] = json.MessageFormat

  override def extractId(value: Message): String = value.id.value
}

class MongoApiRepo(env: Env, db: PostgresConnection, reactiveMongoApi: ReactiveMongoApi)
  extends MongoRepo[Api, ApiId](env, db, reactiveMongoApi) {
  override def tableName: String = "apis"

  override def format: Format[Api] = json.ApiFormat

  override def extractId(value: Api): String = value.id.value
}

class MongoApiSubscriptionRepo(env: Env, db: PostgresConnection, reactiveMongoApi: ReactiveMongoApi)
  extends MongoRepo[ApiSubscription, ApiSubscriptionId](env, db, reactiveMongoApi) {
  override def tableName: String = "api_subscriptions"

  override def format: Format[ApiSubscription] = json.ApiSubscriptionFormat

  override def extractId(value: ApiSubscription): String = value.id.value
}

class MongoApiDocumentationPageRepo(env: Env,
                                    db: PostgresConnection,
                                    reactiveMongoApi: ReactiveMongoApi)
  extends MongoRepo[ApiDocumentationPage, ApiDocumentationPageId](
    env,
    db,
    reactiveMongoApi) {
  override def tableName: String = "api_documentation_pages"

  override def format: Format[ApiDocumentationPage] =
    json.ApiDocumentationPageFormat

  override def extractId(value: ApiDocumentationPage): String = value.id.value
}

class MongoNotificationRepo(env: Env, db: PostgresConnection, reactiveMongoApi: ReactiveMongoApi)
  extends MongoRepo[Notification, NotificationId](env, db, reactiveMongoApi) {
  override def tableName: String = "notifications"

  override def format: Format[Notification] =
    json.NotificationFormat

  override def extractId(value: Notification): String = value.id.value
}

class MongoConsumptionRepo(env: Env, db: PostgresConnection, reactiveMongoApi: ReactiveMongoApi)
  extends MongoRepo[ApiKeyConsumption, MongoId](env, db, reactiveMongoApi) {
  override def tableName: String = "consumptions"

  override def format: Format[ApiKeyConsumption] = json.ConsumptionFormat

  override def extractId(value: ApiKeyConsumption): String = value.id.value
}

class MongoUserSessionRepo(env: Env, db: PostgresConnection, reactiveMongoApi: ReactiveMongoApi)
  extends MongoRepo[UserSession, MongoId](env, db, reactiveMongoApi)
    with UserSessionRepo {
  override def tableName: String = "user_sessions"

  override def format: Format[UserSession] =
    json.UserSessionFormat

  override def extractId(value: UserSession): String = value.id.value
}

class MongoAuditTrailRepo(env: Env, db: PostgresConnection, reactiveMongoApi: ReactiveMongoApi)
  extends MongoRepo[JsObject, MongoId](env, db, reactiveMongoApi) {
  val _fmt = new Format[JsObject] {
    override def reads(json: JsValue): JsResult[JsObject] =
      JsSuccess(json.as[JsObject])

    override def writes(o: JsObject): JsValue = o
  }

  override def tableName: String = "audit_events"

  override def format: Format[JsObject] = _fmt

  override def extractId(value: JsObject): String = (value \ "_id").as[String]
}

abstract class MongoRepo[Of, Id <: ValueType](
                                               env: Env,
                                               db: PostgresConnection,
                                               reactiveMongoApi: ReactiveMongoApi)
  extends Repo[Of, Id] {

  val logger = Logger(s"MongoRepo")

  implicit val jsObjectFormat = new OFormat[JsObject] {
    override def reads(json: JsValue): JsResult[JsObject] =
      json.validate[JsObject](Reads.JsObjectReads)

    override def writes(o: JsObject): JsObject = o
  }

  val jsObjectWrites: OWrites[JsObject] = (o: JsObject) => o

  override def find(
                     query: JsObject,
                     sort: Option[JsObject] = None,
                     maxDocs: Int = -1)(implicit ec: ExecutionContext): Future[Seq[Of]] = {
    logger.debug(s"$tableName.find(${Json.prettyPrint(query)})")

    sort match {
      case None =>
        db.query { dsl =>
          try {
            val result = recordToJson(
              if (query.values.isEmpty) dsl.fetch("SELECT * FROM {0}", DSL.table(tableName))
              else
                dsl.fetch(
                  "SELECT * FROM {0} WHERE {1}",
                  DSL.table(tableName),
                  DSL.table(convertQuery(query))
                )
            )

            getContentsListFromJson(result, format)
          } catch {
            case err: Throwable => logger.error(s"$err")
              Seq()
          }
        }
      case Some(s) =>
        // TODO - transformer le sort
        Future.successful(Seq())
      //          col
      //            .find(query, None)
      //            .sort(s)
      //            .cursor[JsObject](ReadPreference.primaryPreferred)
      //            .collect[Seq](maxDocs = maxDocs,
      //              Cursor.FailOnError[Seq[JsObject]]())
      //            .map(_.map(format.reads).collect {
      //              case JsSuccess(e, _) => e
      //            })
    }
  }

  override def count(query: JsObject)(
    implicit ec: ExecutionContext): Future[Long] = {
    db.query { dsl =>
      logger.error(s"COUNT $query - $tableName - ${dsl.fetchCount(DSL.table(tableName))}")
      if (query.values.isEmpty)
        dsl.fetchCount(DSL.table(tableName))
      else
        dsl.fetchValue("SELECT COUNT(*) FROM {0} WHERE {1}",
          DSL.table(tableName),
          DSL.table(convertQuery(query))
        )
          .asInstanceOf[Long]
    }
  }

  override def count()(implicit ec: ExecutionContext): Future[Long] = count(JsObject.empty)

  //  def findAllRaw()(implicit ec: ExecutionContext): Future[Seq[JsValue]] =
  //    collection.flatMap { col =>
  //      logger.debug(s"$collectionName.findAllRaw({})")
  //      col
  //        .find(Json.obj(), None)
  //        .cursor[JsObject](ReadPreference.primaryPreferred)
  //        .collect[Seq](maxDocs = -1, Cursor.FailOnError[Seq[JsObject]]())
  //    }

  //  def streamAll()(implicit ec: ExecutionContext): Source[Of, NotUsed] =
  //    Source
  //      .future(collection.flatMap { col =>
  //        logger.debug(s"$collectionName.streamAll({})")
  //        col
  //          .find(Json.obj(), None)
  //          .cursor[JsObject](ReadPreference.primaryPreferred)
  //          .collect[Seq](maxDocs = -1, Cursor.FailOnError[Seq[JsObject]]())
  //          .map { docs =>
  //            docs
  //              .map(format.reads)
  //              .map {
  //                case j @ JsSuccess(_, _) => j
  //                case j @ JsError(_) =>
  //                  println(s"error: $j")
  //                  j
  //              }
  //              .collect {
  //                case JsSuccess(e, _) => e
  //              }
  //          }
  //      })
  //      .flatMapConcat(seq => Source(seq.toList))

  def streamAllRaw()(implicit ec: ExecutionContext): Source[JsValue, NotUsed] =
    Source
      .future(
        db.query { dsl =>
          logger.debug(s"$tableName.streamAllRaw({})")
          val result = recordToJson(dsl
            .fetch("SELECT * FROM {0}", DSL.table(tableName)))
          getContentsListFromJson(result, format)
            .map(_.asInstanceOf[JsValue])
        }
      )
      .flatMapConcat(seq => Source(seq.toList))

  //    Source
  //      .future(
  //        collection.flatMap { col =>
  //        logger.debug(s"$collectionName.streamAllRaw({})")
  //        col
  //          .find(Json.obj(), None)
  //          .cursor[JsObject](ReadPreference.primaryPreferred)
  //          .collect[Seq](maxDocs = -1, Cursor.FailOnError[Seq[JsObject]]())
  //      })
  //      .flatMapConcat(seq => Source(seq.toList))

  override def findOne(query: JsObject)(
    implicit ec: ExecutionContext): Future[Option[Of]] =
    db.query { dsl =>
      try {
        val result = recordToJson(
          dsl.fetch(
            "SELECT * FROM {0} WHERE {1} LIMIT 1",
            DSL.table(tableName),
            DSL.table(convertQuery(query)))
        )

        getContentFromJson(result, format)
      } catch {
        case err: Throwable => logger.error(s"$err")
          None
      }
    }

  override def delete(query: JsObject)(
    implicit ec: ExecutionContext): Future[Boolean] = {
    logger.debug(s"$tableName.delete(${Json.prettyPrint(query)})")

    logger.error(s"delete query : ${convertQuery(query)}")

    db.query { dsl =>
      if (query.values.isEmpty)
        dsl
          .query("DELETE FROM {0}", DSL.table(tableName))
          .execute() > 0
      else
        dsl
          .query(
            "DELETE FROM {0} WHERE {1}",
            DSL.table(tableName),
            DSL.table(convertQuery(query))
          )
          .execute() > 0
    }
  }

  override def save(value: Of)(
    implicit ec: ExecutionContext): Future[Boolean] = {
    val payload = format.writes(value).as[JsObject]
    save(Json.obj("_id" -> extractId(value)), payload)
  }

  override def save(query: JsObject, value: JsObject)(
    implicit ec: ExecutionContext): Future[Boolean] = {
    logger.error(s"save : $query - $tableName")

    db.query { dsl =>
      logger.debug(s"$tableName.create(${Json.prettyPrint(query)}, ${Json.prettyPrint(value)})")
      if (value.keys.contains("_deleted"))
        dsl
          .query("INSERT INTO {0}(_id, _deleted, content) VALUES({1},{2},{3}) " +
            "ON CONFLICT (_id) DO UPDATE " +
            "set _deleted = {2}, content = {3}",
            DSL.table(tableName),
            DSL.inline((value \ "_id").as[String]),
            DSL.inline((value \ "_deleted").as[Boolean]),
            DSL.inline(value)
          )
          .execute() > 0
      else
        dsl
          .query("INSERT INTO {0}(_id, content) VALUES({1},{2}) ON CONFLICT (_id) DO UPDATE set content = {2}",
            DSL.table(tableName),
            DSL.inline((value \ "_id").as[String]),
            DSL.inline(value)
          )
          .execute() > 0
    }
  }

  override def insertMany(values: Seq[Of])(
    implicit ec: ExecutionContext): Future[Long] =
    db.query { dsl =>
      val payloads = values.map(v => format.writes(v).as[JsObject])
      dsl.query(
        "INSERT INTO {0}(_id, content) VALUES{1}",
        DSL.table(tableName),
        DSL.table(payloads.map { payload =>
          s"(${DSL.inline((payload \ "_id").as[String])}, ${DSL.inline(payload)})"
        }
          .mkString(","))
      )
        .execute()
    }

  override def updateMany(query: JsObject, value: JsObject)(
    implicit ec: ExecutionContext): Future[Long] =
    db.query { dsl =>
      dsl
        .query("UPDATE {0} " +
          "SET content = content || {1}" +
          "WHERE {2}",
          DSL.table(tableName),
          DSL.inline(convertQuery(value)),
          DSL.table(convertQuery(query))
        )
        .execute()
    }

  override def updateManyByQuery(query: JsObject, queryUpdate: JsObject)(
    implicit ec: ExecutionContext): Future[Long] =
    db.query { dsl =>
      dsl
        .query("UPDATE {0} " +
          "SET content = content || {1}" +
          "WHERE {2}",
          DSL.table(tableName),
          DSL.inline(convertQuery(queryUpdate)),
          DSL.table(convertQuery(query))
        )
        .execute()
    }

  override def deleteByIdLogically(id: String)(
    implicit ec: ExecutionContext): Future[Boolean] =
    db.query { dsl =>
      logger.error("deleteByIdLogically with String")
      dsl
        .query("UPDATE {0} " +
          "SET _deleted = true, content = content || '{ \"_deleted\" : true }' " +
          "WHERE _id = {1} AND _deleted = false",
          DSL.table(tableName),
          DSL.inline(id)
        )
        .execute() > 0
    }

  override def deleteByIdLogically(id: Id)(
    implicit ec: ExecutionContext): Future[Boolean] = {
    logger.error("deleteByIdLogically with Id")
    deleteByIdLogically(id.value)
  }

  override def deleteLogically(query: JsObject)(
    implicit ec: ExecutionContext): Future[Boolean] =
    db.query { dsl =>
      logger.error("deleteLogically with Query")
      dsl
        .query("UPDATE {0} " +
          "SET _deleted = true, content = content || '{ \"_deleted\" : true }' " +
          "WHERE _deleted = false AND {1}",
          DSL.table(tableName),
          DSL.table(convertQuery(query))
        )
        .execute() > 0
    }

  override def deleteAllLogically()(
    implicit ec: ExecutionContext): Future[Boolean] =
    db.query { dsl =>
      logger.error("deleteAllLogically")
      dsl
        .query("UPDATE {0} " +
          "SET _deleted = true, content = content || '{ \"_deleted\" : true }' " +
          "WHERE _deleted = false",
          DSL.table(tableName)
        )
        .execute() > 0
    }

  override def exists(query: JsObject)(
    implicit ec: ExecutionContext): Future[Boolean] =
    db.query { dsl =>
      val result = dsl.fetchExists(dsl.selectFrom(
        DSL
          .table(tableName)
          .where(DSL.condition("exists (SELECT 1 FROM {0} WHERE {1})",
            DSL.table(tableName),
            DSL.table(convertQuery(query))
          )))
      )

      logger.error(s"exists - $query - $tableName - $result")

      result
    }

  override def findWithProjection(query: JsObject, projection: JsObject)
                                 (implicit ec: ExecutionContext): Future[Seq[JsObject]] =
    db.query { dsl =>
      logger.debug(s"$tableName.find(${Json.prettyPrint(query)}, ${Json.prettyPrint(projection)})")
      try {
        val result = recordToJson(
          if (query.values.isEmpty) dsl.fetch(
            "SELECT {1} FROM {0}",
            DSL.table(tableName),
            if (projection.values.isEmpty) "*" else projection.keys.mkString(",")
          )
          else
            dsl.fetch(
              "SELECT {2} FROM {0} WHERE {1}",
              DSL.table(tableName),
              DSL.table(convertQuery(query)),
              if (projection.values.isEmpty) "*" else projection.keys.mkString(",")
            )
        )

        getContentsListFromJson(result, format)
          .map(_.asInstanceOf[JsObject])
      } catch {
        case err: Throwable => logger.error(s"$err")
          Seq()
      }
    }

  override def findOneWithProjection(query: JsObject, projection: JsObject)
                                    (implicit ec: ExecutionContext): Future[Option[JsObject]] =
    db.query { dsl =>
      logger.debug(s"$tableName.find(${Json.prettyPrint(query)}, ${Json.prettyPrint(projection)})")
      try {
        val result = recordToJson(
          if (query.values.isEmpty) dsl.fetch(
            "SELECT {1} FROM {0}",
            DSL.table(tableName),
            if (projection.values.isEmpty) "*" else projection.keys.mkString(",")
          )
          else
            dsl.fetch(
              "SELECT {2} FROM {0} WHERE {1}",
              DSL.table(tableName),
              DSL.table(convertQuery(query)),
              if (projection.values.isEmpty) "*" else projection.keys.mkString(",")
            )
        )

        getContentFromJson(result, format)
          .asInstanceOf[Option[JsObject]]
      } catch {
        case err: Throwable => logger.error(s"$err")
          None
      }
    }

  override def findWithPagination(query: JsObject, page: Int, pageSize: Int)
                                 (implicit ec: ExecutionContext): Future[(Seq[Of], Long)] = {
    logger.debug(s"$tableName.findWithPagination(${Json.prettyPrint(query)}, $page, $pageSize)")
    for {
      count <- db.query { dsl =>
        if (query.values.isEmpty)
          dsl.fetchCount(DSL.table(tableName))
        else
          dsl.fetchValue("SELECT COUNT(*) FROM {0} WHERE {1}",
            DSL.table(tableName),
            DSL.table(convertQuery(query))
          )
            .asInstanceOf[Long]
      }
      queryRes <- {
        db.query { dsl =>
          val result = recordToJson(
            if (query.values.isEmpty) dsl.fetch(
              "SELECT * FROM {0} ORDER BY _id DESC LIMIT {1} OFFSET {2}",
              DSL.table(tableName),
              pageSize,
              page * pageSize
            )
            else
              dsl.fetch(
                "SELECT * FROM {0} WHERE {1} ORDER BY _id DESC LIMIT {2} OFFSET {3}",
                DSL.table(tableName),
                DSL.table(convertQuery(query)),
                pageSize,
                page * pageSize
              )
          )

          getContentsListFromJson(result, format)
        }
      }
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
    implicit ec: ExecutionContext): Future[Boolean] =
    delete(Json.obj("_id" -> id))

  override def deleteById(id: Id)(
    implicit ec: ExecutionContext): Future[Boolean] =
    delete(Json.obj("_id" -> id.value))

  override def deleteAll()(implicit ec: ExecutionContext): Future[Boolean] =
    delete(Json.obj())

  override def exists(id: String)(
    implicit ec: ExecutionContext): Future[Boolean] =
    exists(Json.obj("_id" -> id))

  override def exists(id: Id)(implicit ec: ExecutionContext): Future[Boolean] =
    exists(Json.obj("_id" -> id.value))

  //  override def findMinByQuery(query: JsObject, field: String)(
  //      implicit ec: ExecutionContext): Future[Option[Long]] =
  //    collection.flatMap { col =>
  //      import col.BatchCommands.AggregationFramework
  //      import AggregationFramework.{Group, Match, MinField}
  //
  //      col
  //        .aggregatorContext[JsObject](
  //          firstOperator = Match(query),
  //          otherOperators =
  //            List(Group(JsString("$clientId"))("min" -> MinField(field))),
  //          explain = false,
  //          allowDiskUse = false,
  //          bypassDocumentValidation = false,
  //          readConcern = ReadConcern.Majority,
  //          readPreference = ReadPreference.primaryPreferred,
  //          writeConcern = WriteConcern.Default,
  //          batchSize = None,
  //          cursorOptions = CursorOptions.empty,
  //          maxTime = None,
  //          hint = None,
  //          comment = None,
  //          collation = None
  //        )
  //        .prepared
  //        .cursor
  //        .collect[List](1, Cursor.FailOnError[List[JsObject]]())
  //        .map(agg => agg.headOption.map(v => (v \ "min").as[Long]))
  //    }

  override def findMaxByQuery(query: JsObject, field: String)(
    implicit ec: ExecutionContext): Future[Option[Long]] = ???

  //    collection.flatMap { col =>
  //      import col.BatchCommands.AggregationFramework
  //      import AggregationFramework.{Group, Match, MaxField}
  //
  //      col
  //        .aggregatorContext[JsObject](
  //          firstOperator = Match(query),
  //          otherOperators =
  //            List(Group(JsString("$clientId"))("max" -> MaxField(field))),
  //          explain = false,
  //          allowDiskUse = false,
  //          bypassDocumentValidation = false,
  //          readConcern = ReadConcern.Majority,
  //          readPreference = ReadPreference.primaryPreferred,
  //          writeConcern = WriteConcern.Default,
  //          batchSize = None,
  //          cursorOptions = CursorOptions.empty,
  //          maxTime = None,
  //          hint = None,
  //          comment = None,
  //          collation = None
  //        )
  //        .prepared
  //        .cursor
  //        .collect[List](1, Cursor.FailOnError[List[JsObject]]())
  //        .map(agg => agg.headOption.map(v => (v \ "max").as[Long]))
  //    }
}

abstract class MongoTenantAwareRepo[Of, Id <: ValueType](
                                                          env: Env,
                                                          db: PostgresConnection,
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

  override def deleteByIdLogically(id: String)(
    implicit ec: ExecutionContext): Future[Boolean] = {
    logger.error(s"deleteByIdLogically $id : String")

    db.query { dsl =>
      dsl
        .query("UPDATE {0} " +
          "SET _deleted = true, content = content || '{ \"_deleted\" : true }' " +
          "WHERE _id = {1} AND content ->> '_tenant' = {2}",
          DSL.table(tableName),
          DSL.inline(id),
          DSL.inline(tenant.value)
        )
        .execute() > 0
    }
  }

  override def deleteByIdLogically(id: Id)(
    implicit ec: ExecutionContext): Future[Boolean] = {
    logger.error("deleteByIdLogically id: Id")

    deleteByIdLogically(id.value)
  }

  override def deleteLogically(query: JsObject)(
    implicit ec: ExecutionContext): Future[Boolean] = {
    logger.error("deleteLogically query : JsObject")

    db.query { dsl =>
      dsl
        .query("UPDATE {0} " +
          "SET _deleted = true, content = content || '{ \"_deleted\" : true }' " +
          "WHERE content ->> '_tenant' = {1} AND {2}",
          DSL.table(tableName),
          DSL.inline(tenant.value),
          DSL.table(convertQuery(query ++ Json.obj("_deleted" -> false, "_tenant" -> tenant.value)))
        )
        .execute() > 0
    }

  }

  override def deleteAllLogically()(
    implicit ec: ExecutionContext): Future[Boolean] = {
    logger.error("deleteAllLogically")

    db.query { dsl =>
      dsl
        .query("UPDATE {0} " +
          "SET _deleted = true, content = content || '{ \"_deleted\" : true }' " +
          "WHERE content ->> '_tenant' = {1} AND _deleted = false",
          DSL.table(tableName),
          DSL.inline(tenant.value)
        )
        .execute() > 0
    }
  }

  override def find(
                     query: JsObject,
                     sort: Option[JsObject] = None,
                     maxDocs: Int = -1)(implicit ec: ExecutionContext): Future[Seq[Of]] = {
    logger.debug(s"$tableName.find(${Json.prettyPrint(query ++ Json.obj("_tenant" -> tenant.value))})")

    sort match {
      case None =>
        db.query { dsl =>
          if (query.values.isEmpty)
            logger.error(s"SELECT * FROM $tableName")
          else
            logger.error(s"SELECT * FROM $tableName WHERE ${convertQuery(query ++ Json.obj("_tenant" -> tenant.value))} ")

          try {
            val result = recordToJson(
              if (query.values.isEmpty) dsl.fetch("SELECT * FROM {0}", DSL.table(tableName))
              else
                dsl.fetch(
                  "SELECT * FROM {0} WHERE {1}",
                  DSL.table(tableName),
                  DSL.table(convertQuery(query ++ Json.obj("_tenant" -> tenant.value))))
            )

            getContentsListFromJson(result, format)
          } catch {
            case err: Throwable => logger.error(s"$err")
              Seq()
          }
        }
      case Some(s) =>
        // TODO - transformer le sort
        Future.successful(Seq())
      //          col
      //            .find(query ++ Json.obj("_tenant" -> tenant.value), None)
      //            .sort(s)
      //            .cursor[JsObject](ReadPreference.primaryPreferred)
      //            .collect[Seq](maxDocs = maxDocs,
      //              Cursor.FailOnError[Seq[JsObject]]())
      //            .map(
      //              _.map(format.reads)
      //                .map {
      //                  case j@JsSuccess(_, _) => j
      //                  case j@JsError(_) =>
      //                    println(s"error: $j")
      //                    j
      //                }
      //                .collect {
      //                  case JsSuccess(e, _) => e
      //                }
      //            )
    }
  }

  //  def findAllRaw()(implicit ec: ExecutionContext): Future[Seq[JsValue]] =
  //    collection.flatMap { col =>
  //      logger.debug(s"$collectionName.findAllRaw(${Json.prettyPrint(
  //        Json.obj("_tenant" -> tenant.value))})")
  //      col
  //        .find(Json.obj("_tenant" -> tenant.value), None)
  //        .cursor[JsObject](ReadPreference.primaryPreferred)
  //        .collect[Seq](maxDocs = -1, Cursor.FailOnError[Seq[JsObject]]())
  //    }

  //  def streamAll()(implicit ec: ExecutionContext): Source[Of, NotUsed] =
  //    Source
  //      .future(collection.flatMap { col =>
  //        logger.debug(s"$collectionName.streamAll(${Json.prettyPrint(
  //          Json.obj("_tenant" -> tenant.value))})")
  //        col
  //          .find(Json.obj("_tenant" -> tenant.value), None)
  //          .cursor[JsObject](ReadPreference.primaryPreferred)
  //          .collect[Seq](maxDocs = -1, Cursor.FailOnError[Seq[JsObject]]())
  //          .map { docs =>
  //            docs
  //              .map(format.reads)
  //              .map {
  //                case j @ JsSuccess(_, _) => j
  //                case j @ JsError(_) =>
  //                  println(s"error: $j")
  //                  j
  //              }
  //              .collect {
  //                case JsSuccess(e, _) => e
  //              }
  //          }
  //      })
  //      .flatMapConcat(seq => Source(seq.toList))

  def streamAllRaw()(implicit ec: ExecutionContext): Source[JsValue, NotUsed] =
    Source
      .future(
        db.query { dsl =>
          logger.debug(s"$tableName.streamAllRaw({})")
          val result = recordToJson(dsl
            .fetch("SELECT * FROM {0} WHERE content->>'tenant' = {1}",
              DSL.table(tableName),
              DSL.inline(tenant.value)))
          getContentsListFromJson(result, format)
            .map(_.asInstanceOf[JsValue])
        }
      )
      .flatMapConcat(seq => Source(seq.toList))

  //    Source
  //      .future(
  //        collection.flatMap { col =>
  //          logger.debug(s"$collectionName.streamAllRaw(${
  //            Json.prettyPrint(
  //              Json.obj("_tenant" -> tenant.value))
  //          })")
  //          col
  //            .find(Json.obj("_tenant" -> tenant.value), None)
  //            .cursor[JsObject](ReadPreference.primaryPreferred)
  //            .collect[Seq](maxDocs = -1, Cursor.FailOnError[Seq[JsObject]]())
  //        }
  //      )
  //      .flatMapConcat(seq => Source(seq.toList))

  override def findOne(query: JsObject)(
    implicit ec: ExecutionContext): Future[Option[Of]] =
    db.query { dsl =>
      try {
        val result = recordToJson(
          dsl.fetch(
            "SELECT * FROM {0} WHERE {1} LIMIT 1",
            DSL.table(tableName),
            DSL.table(convertQuery(query ++ Json.obj("_tenant" -> tenant.value))))
        )

        getContentFromJson(result, format)
      } catch {
        case err: Throwable => logger.error(s"$err")
          None
      }
    }

  override def delete(query: JsObject)(
    implicit ec: ExecutionContext): Future[Boolean] = {
    logger.error("override def delete(query: JsObject)")
    logger.debug(s"$tableName.delete(${Json.prettyPrint(query ++ Json.obj("_tenant" -> tenant.value))})")

    db.query { dsl =>
      if (query.values.isEmpty)
        dsl.query("DELETE FROM {0}", DSL.table(tableName)).execute() > 0
      else
      dsl.query(
        "DELETE FROM {0} WHERE {1}",
        DSL.table(tableName),
        DSL.table(convertQuery(query ++ Json.obj("_tenant" -> tenant.value)))
      )
        .execute() > 0
    }
  }

  override def save(value: Of)(
    implicit ec: ExecutionContext): Future[Boolean] = {
    val payload = format.writes(value).as[JsObject]
    save(Json.obj("_id" -> extractId(value)), payload)
  }

  override def save(query: JsObject, value: JsObject)(
    implicit ec: ExecutionContext): Future[Boolean] = {

    db.query { dsl =>
      logger.debug(
        s"$tableName.create(${Json.prettyPrint(query)}, ${Json.prettyPrint(value)})"
      )

      dsl
        .query("INSERT INTO {0}(_id, _deleted, content) VALUES({1},{2},{3}) " +
          "ON CONFLICT (_id) DO UPDATE " +
          "set _deleted = {2}, content = {3}",
          DSL.table(tableName),
          DSL.inline((value \ "_id").as[String]),
          DSL.inline((value \ "_deleted").as[Boolean]),
          DSL.inline(value)
        )
        .execute() > 0
    }
  }

  override def insertMany(values: Seq[Of])(
    implicit ec: ExecutionContext): Future[Long] = {

    val payloads = values.map(v =>
      format.writes(v).as[JsObject] ++ Json.obj("_tenant" -> tenant.value))

    db.query { dsl =>
      dsl.query(
        "INSERT INTO {0}(_id, content) VALUES{1}",
        DSL.table(tableName),
        DSL.table(payloads.map { payload =>
          s"(${DSL.inline((payload \ "_id").as[String])}, ${DSL.inline(payload)})"
        }
          .mkString(","))
      )
        .execute()
    }
  }

  override def updateMany(query: JsObject, value: JsObject)(
    implicit ec: ExecutionContext): Future[Long] = {
    logger.error("updateMany(query: JsObject, value: JsObject)")

    db.query { dsl =>
      dsl
        .query("UPDATE {0} " +
          "SET content = content || {1}" +
          "WHERE {2}",
          DSL.table(tableName),
          DSL.inline(convertQuery(value)),
          DSL.table(convertQuery(query))
        )
        .execute()
    }
  }

  override def updateManyByQuery(query: JsObject, queryUpdate: JsObject)(
    implicit ec: ExecutionContext): Future[Long] = {
    logger.error("updateManyByQuery(query: JsObject, queryUpdate: JsObject)")
    db.query { dsl =>
      dsl
        .query("UPDATE {0} " +
          "SET content = content || {1}" +
          "WHERE {2}",
          DSL.table(tableName),
          DSL.inline(convertQuery(queryUpdate)),
          DSL.table(convertQuery(query))
        )
        .execute()
    }
  }

  override def exists(query: JsObject)(
    implicit ec: ExecutionContext): Future[Boolean] = {
    db.query { dsl =>
      val result = dsl.fetchExists(dsl.selectFrom(
        DSL
          .table(tableName)
          .where(DSL.condition("exists (SELECT 1 FROM {0} WHERE {1})",
            DSL.table(tableName),
            DSL.table(convertQuery(query ++ Json.obj("_tenant" -> tenant.value))
            )))
      ))

      logger.error(s"exits $query - $tableName - $result")

      result
    }
  }

  //  override def findMinByQuery(query: JsObject, field: String)(
  //      implicit ec: ExecutionContext): Future[Option[Long]] =
  //    collection.flatMap { col =>
  //      import col.BatchCommands.AggregationFramework
  //      import AggregationFramework.{Group, Match, MinField}
  //
  //      col
  //        .aggregatorContext[JsObject](
  //          firstOperator = Match(query),
  //          otherOperators =
  //            List(Group(JsString("$clientId"))("min" -> MinField(field))),
  //          explain = false,
  //          allowDiskUse = false,
  //          bypassDocumentValidation = false,
  //          readConcern = ReadConcern.Majority,
  //          readPreference = ReadPreference.primaryPreferred,
  //          writeConcern = WriteConcern.Default,
  //          batchSize = None,
  //          cursorOptions = CursorOptions.empty,
  //          maxTime = None,
  //          hint = None,
  //          comment = None,
  //          collation = None
  //        )
  //        .prepared
  //        .cursor
  //        .collect[List](1, Cursor.FailOnError[List[JsObject]]())
  //        .map(agg => agg.headOption.map(v => (v \ "min").as[Long]))
  //    }

  override def findMaxByQuery(query: JsObject, field: String)(
    implicit ec: ExecutionContext): Future[Option[Long]] = ???

  //    collection.flatMap { col =>
  //      import col.BatchCommands.AggregationFramework
  //      import AggregationFramework.{Group, Match, MaxField}
  //
  //      col
  //        .aggregatorContext[JsObject](
  //          firstOperator = Match(query),
  //          otherOperators =
  //            List(Group(JsString("$clientId"))("max" -> MaxField(field))),
  //          explain = false,
  //          allowDiskUse = false,
  //          bypassDocumentValidation = false,
  //          readConcern = ReadConcern.Majority,
  //          readPreference = ReadPreference.primaryPreferred,
  //          writeConcern = WriteConcern.Default,
  //          batchSize = None,
  //          cursorOptions = CursorOptions.empty,
  //          maxTime = None,
  //          hint = None,
  //          comment = None,
  //          collation = None
  //        )
  //        .prepared
  //        .cursor
  //        .collect[List](1, Cursor.FailOnError[List[JsObject]]())
  //        .map(agg => agg.headOption.map(v => (v \ "max").as(json.LongFormat)))
  //    }

  override def count(query: JsObject)(
    implicit ec: ExecutionContext): Future[Long] = {

    logger.error(s"Count with tenant : $query")
    db.query { dsl =>
      if (query.values.isEmpty)
        dsl.fetchCount(DSL.table(tableName))
      else
        dsl.fetchValue("SELECT COUNT(*) FROM {0} WHERE {1}",
          DSL.table(tableName),
          DSL.table(convertQuery(query))
        )
          .asInstanceOf[Long]
    }
  }

  override def count()(implicit ec: ExecutionContext): Future[Long] = count(Json.obj("_tenant" -> tenant.value))

  override def findWithProjection(query: JsObject, projection: JsObject)
                                 (implicit ec: ExecutionContext): Future[Seq[JsObject]] =
    db.query { dsl =>
      logger.debug(s"$tableName.find(${Json.prettyPrint(query)}, ${Json.prettyPrint(projection)})")
      try {
        val result = recordToJson(
          if (query.values.isEmpty) dsl.fetch(
            "SELECT {1} FROM {0}",
            DSL.table(tableName),
            if (projection.values.isEmpty) "*" else projection.keys.mkString(",")
          )
          else
            dsl.fetch(
              "SELECT {2} FROM {0} WHERE {1}",
              DSL.table(tableName),
              DSL.table(convertQuery(query ++ Json.obj("_tenant" -> tenant.value))),
              if (projection.values.isEmpty) "*" else projection.keys.mkString(",")
            )
        )

        getContentsListFromJson(result, format)
          .map(_.asInstanceOf[JsObject])
      } catch {
        case err: Throwable => logger.error(s"$err")
          Seq()
      }
    }

  override def findOneWithProjection(query: JsObject, projection: JsObject)
                                    (implicit ec: ExecutionContext): Future[Option[JsObject]] =
    db.query { dsl =>
      logger.debug(s"$tableName.find(${Json.prettyPrint(query)}, ${Json.prettyPrint(projection)})")
      try {
        val result = recordToJson(
          if (query.values.isEmpty) dsl.fetch(
            "SELECT {1} FROM {0}",
            DSL.table(tableName),
            if (projection.values.isEmpty) "*" else projection.keys.mkString(",")
          )
          else
            dsl.fetch(
              "SELECT {2} FROM {0} WHERE {1}",
              DSL.table(tableName),
              DSL.table(convertQuery(query ++ Json.obj("_tenant" -> tenant.value))),
              if (projection.values.isEmpty) "*" else projection.keys.mkString(",")
            )
        )

        getContentFromJson(result, format)
          .asInstanceOf[Option[JsObject]]
      } catch {
        case err: Throwable => logger.error(s"$err")
          None
      }
    }

  override def findWithPagination(query: JsObject, page: Int, pageSize: Int)
                                 (implicit ec: ExecutionContext): Future[(Seq[Of], Long)] = {
    logger.error(s"$tableName.findWithPagination(${Json.prettyPrint(query)}, $page, $pageSize)")
    for {
      count <- db.query { dsl =>
        if (query.values.isEmpty)
          logger.error(s"SELECT COUNT(*) FROM ${DSL.table(tableName)}")
        else
          logger.error(s"SELECT COUNT(*) FROM ${DSL.table(tableName)} WHERE ${DSL.table(convertQuery(query))}")

        if (query.values.isEmpty)
          dsl.fetchCount(DSL.table(tableName))
        else
          dsl.fetchValue("SELECT COUNT(*) FROM {0} WHERE {1}",
            DSL.table(tableName),
            DSL.table(convertQuery(query))
          )
            .asInstanceOf[Long]
      }
      queryRes <- {
        db.query { dsl =>
          val result = recordToJson(
            if (query.values.isEmpty) dsl.fetch(
              "SELECT * FROM {0} ORDER BY _id DESC LIMIT {1} OFFSET {2}",
              DSL.table(tableName),
              pageSize,
              page * pageSize
            )
            else
              dsl.fetch(
                "SELECT * FROM {0} WHERE {1} ORDER BY _id DESC LIMIT {2} OFFSET {3}",
                DSL.table(tableName),
                DSL.table(convertQuery(query)),
                pageSize,
                page * pageSize
              )
          )

          getContentsListFromJson(result, format)
        }
      }
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
    implicit ec: ExecutionContext): Future[Boolean] =
    delete(Json.obj("_id" -> id))

  override def deleteById(id: Id)(
    implicit ec: ExecutionContext): Future[Boolean] =
    delete(Json.obj("_id" -> id.value))

  override def deleteAll()(implicit ec: ExecutionContext): Future[Boolean] =
    delete(Json.obj())

  override def exists(id: String)(
    implicit ec: ExecutionContext): Future[Boolean] =
    exists(Json.obj("_id" -> id))

  override def exists(id: Id)(implicit ec: ExecutionContext): Future[Boolean] =
    exists(Json.obj("_id" -> id.value))
}
