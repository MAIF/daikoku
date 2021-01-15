package storage.drivers.postgres

import akka.NotUsed
import akka.actor.ActorSystem
import akka.http.scaladsl.util.FastFuture
import akka.stream.{ActorMaterializer, Materializer}
import akka.stream.scaladsl.{Framing, Keep, Sink, Source}
import akka.util.ByteString
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json._
import fr.maif.otoroshi.daikoku.env.Env
import io.vertx.core.Vertx
import io.vertx.pgclient.{PgConnectOptions, PgPool}
import io.vertx.sqlclient.PoolOptions
import org.jooq.SQLDialect
import org.jooq.impl.{DSL, DefaultConfiguration}
import play.api.{Configuration, Environment, Logger}
import play.api.libs.json._
import play.modules.reactivemongo.ReactiveMongoApi
import reactivemongo.play.json.collection.JSONCollection
import storage._
import storage.drivers.mongo.RepositoryMongo
import storage.drivers.postgres.Helper._
import storage.drivers.postgres.jooq.reactive.ReactivePgAsyncPool

import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.CollectionConverters.MapHasAsJava

trait RepositoryPostgres[Of, Id <: ValueType] extends Repo[Of, Id] {
  override def collectionName: String = "ignored"

  override def ensureIndices(implicit ec: ExecutionContext): Future[Unit] = {
    // TODO - voir si on vérifie la présence des tables dans la base comme pour les collections Postgres
    Future.successful(Seq.empty[Boolean])
  }

  // collection is never call in postgres implementation
  override def collection(implicit ec: ExecutionContext): Future[JSONCollection] = Future.successful(null)
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
                                          _tenantRepo: TenantId => PostgresTenantAwareRepo[Team, TeamId])
  extends PostgresTenantCapableRepo[Team, TeamId]
    with TeamRepo {
  override def tenantRepo(
                           tenant: TenantId): PostgresTenantAwareRepo[Team, TeamId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[Team, TeamId] = _repo()
}

case class PostgresTenantCapableApiRepo(
                                         _repo: () => PostgresRepo[Api, ApiId],
                                         _tenantRepo: TenantId => PostgresTenantAwareRepo[Api, ApiId])
  extends PostgresTenantCapableRepo[Api, ApiId]
    with ApiRepo {
  override def tenantRepo(tenant: TenantId): PostgresTenantAwareRepo[Api, ApiId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[Api, ApiId] = _repo()
}

case class PostgresTenantCapableApiSubscriptionRepo(
                                                     _repo: () => PostgresRepo[ApiSubscription, ApiSubscriptionId],
                                                     _tenantRepo: TenantId => PostgresTenantAwareRepo[ApiSubscription,
                                                       ApiSubscriptionId]
                                                   ) extends PostgresTenantCapableRepo[ApiSubscription, ApiSubscriptionId]
  with ApiSubscriptionRepo {
  override def tenantRepo(tenant: TenantId)
  : PostgresTenantAwareRepo[ApiSubscription, ApiSubscriptionId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[ApiSubscription, ApiSubscriptionId] = _repo()
}

case class PostgresTenantCapableApiDocumentationPageRepo(
                                                          _repo: () => PostgresRepo[ApiDocumentationPage, ApiDocumentationPageId],
                                                          _tenantRepo: TenantId => PostgresTenantAwareRepo[ApiDocumentationPage,
                                                            ApiDocumentationPageId]
                                                        ) extends PostgresTenantCapableRepo[ApiDocumentationPage, ApiDocumentationPageId]
  with ApiDocumentationPageRepo {
  override def tenantRepo(tenant: TenantId)
  : PostgresTenantAwareRepo[ApiDocumentationPage, ApiDocumentationPageId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[ApiDocumentationPage, ApiDocumentationPageId] =
    _repo()
}

case class PostgresTenantCapableNotificationRepo(
                                                  _repo: () => PostgresRepo[Notification, NotificationId],
                                                  _tenantRepo: TenantId => PostgresTenantAwareRepo[Notification, NotificationId]
                                                ) extends PostgresTenantCapableRepo[Notification, NotificationId]
  with NotificationRepo {
  override def tenantRepo(
                           tenant: TenantId): PostgresTenantAwareRepo[Notification, NotificationId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[Notification, NotificationId] = _repo()
}

case class PostgresTenantCapableAuditTrailRepo(
                                                _repo: () => PostgresRepo[JsObject, DatastoreId],
                                                _tenantRepo: TenantId => PostgresTenantAwareRepo[JsObject, DatastoreId])
  extends PostgresTenantCapableRepo[JsObject, DatastoreId]
    with AuditTrailRepo {
  override def tenantRepo(
                           tenant: TenantId): PostgresTenantAwareRepo[JsObject, DatastoreId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[JsObject, DatastoreId] = _repo()
}

case class PostgresTenantCapableTranslationRepo(
                                                 _repo: () => PostgresRepo[Translation, DatastoreId],
                                                 _tenantRepo: TenantId => PostgresTenantAwareRepo[Translation, DatastoreId]
                                               ) extends PostgresTenantCapableRepo[Translation, DatastoreId]
  with TranslationRepo {
  override def tenantRepo(
                           tenant: TenantId): PostgresTenantAwareRepo[Translation, DatastoreId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[Translation, DatastoreId] = _repo()
}

case class PostgresTenantCapableMessageRepo(
                                             _repo: () => PostgresRepo[Message, DatastoreId],
                                             _tenantRepo: TenantId => PostgresTenantAwareRepo[Message, DatastoreId]
                                           ) extends PostgresTenantCapableRepo[Message, DatastoreId]
  with MessageRepo {
  override def tenantRepo(
                           tenant: TenantId): PostgresTenantAwareRepo[Message, DatastoreId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[Message, DatastoreId] = _repo()
}

case class PostgresTenantCapableConsumptionRepo(
                                                 _repo: () => PostgresRepo[ApiKeyConsumption, DatastoreId],
                                                 _tenantRepo: TenantId => PostgresTenantAwareRepo[ApiKeyConsumption, DatastoreId],
                                                 reactivePgAsyncPool: ReactivePgAsyncPool
                                               ) extends PostgresTenantCapableRepo[ApiKeyConsumption, DatastoreId]
  with ConsumptionRepo {

  implicit val jsObjectFormat: OFormat[JsObject] = new OFormat[JsObject] {
    override def reads(json: JsValue): JsResult[JsObject] =
      json.validate[JsObject](Reads.JsObjectReads)

    override def writes(o: JsObject): JsObject = o
  }

  val jsObjectWrites: OWrites[JsObject] = (o: JsObject) => o

  override def tenantRepo(
                           tenant: TenantId): PostgresTenantAwareRepo[ApiKeyConsumption, DatastoreId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[ApiKeyConsumption, DatastoreId] = _repo()

  val logger: Logger = Logger("TEST")

  private def lastConsumptions(tenantId: Option[TenantId], filter: JsObject)(
    implicit ec: ExecutionContext): Future[Seq[ApiKeyConsumption]] = {

    val rep = tenantId match {
      case Some(t) => forTenant(t).asInstanceOf[PostgresTenantAwareRepo[ApiKeyConsumption, DatastoreId]]
      case None => forAllTenant().asInstanceOf[PostgresRepo[ApiKeyConsumption, DatastoreId]]
    }

    reactivePgAsyncPool.query { dsl =>
      dsl.resultQuery(
        "SELECT _id, content->>'clientId' as clientid, MAX(content->>'from') as maxfrom " +
          "FROM {0} " +
          "WHERE {1} " +
          "GROUP BY content->>'clientId', _id",
        DSL.table(rep.tableName),
        DSL.table(convertQuery(filter))
      )
    }
      .flatMap(res =>
          Future.sequence(
            res.map(queryResult => findOne(
              Json.obj(
                "clientId" -> queryResult.get("clientid", classOf[String]),
                "from" -> queryResult.get("maxfrom", classOf[Long])
              ),
              rep.tableName,
              rep.format))
          )
      )
      .map(r => r.flatten)
  }

  def findOne(query: JsObject, tableName: String, format: Format[ApiKeyConsumption])
             (implicit ec: ExecutionContext) =
    reactivePgAsyncPool
      .queryOne(dsl =>
        dsl.resultQuery(
          "SELECT * FROM {0} WHERE {1}",
          DSL.table(tableName),
          DSL.table(convertQuery(query)))
      )
      .map(getContentFromJson(_, format))

  override def getLastConsumptionsforAllTenant(filter: JsObject)(
    implicit ec: ExecutionContext
  ): Future[Seq[ApiKeyConsumption]] = lastConsumptions(None, filter)

  override def getLastConsumptionsForTenant(tenantId: TenantId,
                                            filter: JsObject)(
                                             implicit ec: ExecutionContext
                                           ): Future[Seq[ApiKeyConsumption]] = lastConsumptions(Some(tenantId), filter)
}

class PostgresDataStore(configuration: Configuration, env: Env)
  extends DataStore {

  private lazy val logger: Logger = Logger("PostgresDataStore")

  implicit val ec: ExecutionContext = env.defaultExecutionContext

  lazy val jooqConfig = new DefaultConfiguration
  jooqConfig.setSQLDialect(SQLDialect.POSTGRES)

  private lazy val poolOptions: PoolOptions = new PoolOptions().setMaxSize(3)

  private lazy val options: PgConnectOptions = new PgConnectOptions()
    .setPort(configuration.getOptional[Int]("daikoku.postgres.port").getOrElse(5432))
    .setHost(configuration.getOptional[String]("daikoku.postgres.host").getOrElse("localhost"))
    .setDatabase(configuration.getOptional[String]("daikoku.postgres.database").getOrElse("default"))
    .setUser(configuration.getOptional[String]("daikoku.postgres.username").getOrElse("postgres"))
    .setPassword(configuration.getOptional[String]("daikoku.postgres.password").getOrElse("postgres"))
    .setProperties(Map(
      "search_path" -> configuration.getOptional[String]("daikoku.postgres.schema").getOrElse("default")
    ).asJava)

  logger.info(s"used : ${options.getDatabase}")

  private lazy val reactivePgAsyncPool = new ReactivePgAsyncPool(
    PgPool.pool(Vertx.vertx, options, poolOptions),
    jooqConfig
  )

  private val _tenantRepo: TenantRepo = new PostgresTenantRepo(env, reactivePgAsyncPool)
  private val _userRepo: UserRepo = new PostgresUserRepo(env, reactivePgAsyncPool)
  private val _teamRepo: TeamRepo = PostgresTenantCapableTeamRepo(
    () => new PostgresTeamRepo(env, reactivePgAsyncPool),
    t => new PostgresTenantTeamRepo(env, reactivePgAsyncPool, t))
  private val _apiRepo: ApiRepo = PostgresTenantCapableApiRepo(
    () => new PostgresApiRepo(env, reactivePgAsyncPool),
    t => new PostgresTenantApiRepo(env, reactivePgAsyncPool, t))
  private val _apiSubscriptionRepo: ApiSubscriptionRepo =
    PostgresTenantCapableApiSubscriptionRepo(
      () => new PostgresApiSubscriptionRepo(env, reactivePgAsyncPool),
      t => new PostgresTenantApiSubscriptionRepo(env, reactivePgAsyncPool, t)
    )
  private val _apiDocumentationPageRepo: ApiDocumentationPageRepo =
    PostgresTenantCapableApiDocumentationPageRepo(
      () => new PostgresApiDocumentationPageRepo(env, reactivePgAsyncPool),
      t => new PostgresTenantApiDocumentationPageRepo(env, reactivePgAsyncPool, t)
    )
  private val _notificationRepo: NotificationRepo =
    PostgresTenantCapableNotificationRepo(
      () => new PostgresNotificationRepo(env, reactivePgAsyncPool),
      t => new PostgresTenantNotificationRepo(env, reactivePgAsyncPool, t)
    )
  private val _userSessionRepo: UserSessionRepo =
    new PostgresUserSessionRepo(env, reactivePgAsyncPool)
  private val _auditTrailRepo: AuditTrailRepo =
    PostgresTenantCapableAuditTrailRepo(
      () => new PostgresAuditTrailRepo(env, reactivePgAsyncPool),
      t => new PostgresTenantAuditTrailRepo(env, reactivePgAsyncPool, t)
    )
  private val _consumptionRepo: ConsumptionRepo =
    PostgresTenantCapableConsumptionRepo(
      () => new PostgresConsumptionRepo(env, reactivePgAsyncPool),
      t => new PostgresTenantConsumptionRepo(env, reactivePgAsyncPool, t),
      reactivePgAsyncPool
    )
  private val _passwordResetRepo: PasswordResetRepo =
    new PostgresPasswordResetRepo(env, reactivePgAsyncPool)
  private val _accountCreationRepo: AccountCreationRepo =
    new PostgresAccountCreationRepo(env, reactivePgAsyncPool)
  private val _translationRepo: TranslationRepo =
    PostgresTenantCapableTranslationRepo(
      () => new PostgresTranslationRepo(env, reactivePgAsyncPool),
      t => new PostgresTenantTranslationRepo(env, reactivePgAsyncPool, t))
  private val _messageRepo: MessageRepo =
    PostgresTenantCapableMessageRepo(
      () => new PostgresMessageRepo(env, reactivePgAsyncPool),
      t => new PostgresTenantMessageRepo(env, reactivePgAsyncPool, t)
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

  override def importFromStream(source: Source[ByteString, _]): Future[Unit] = {
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
        .run()(env.defaultMaterializer)
    } yield ()

  }
}

class PostgresTenantRepo(env: Env, reactivePgAsyncPool: ReactivePgAsyncPool)
  extends PostgresRepo[Tenant, TenantId](env, reactivePgAsyncPool)
    with TenantRepo {
  override def tableName: String = "tenants"

  override def format: Format[Tenant] = json.TenantFormat

  override def extractId(value: Tenant): String = value.id.value
}

class PostgresPasswordResetRepo(env: Env, reactivePgAsyncPool: ReactivePgAsyncPool)
  extends PostgresRepo[PasswordReset, DatastoreId](env, reactivePgAsyncPool)
    with PasswordResetRepo {
  override def tableName: String = "password_reset"

  override def format: Format[PasswordReset] = json.PasswordResetFormat

  override def extractId(value: PasswordReset): String = value.id.value
}

class PostgresAccountCreationRepo(env: Env, reactivePgAsyncPool: ReactivePgAsyncPool)
  extends PostgresRepo[AccountCreation, DatastoreId](env, reactivePgAsyncPool)
    with AccountCreationRepo {
  override def tableName: String = "account_creation"

  override def format: Format[AccountCreation] = json.AccountCreationFormat

  override def extractId(value: AccountCreation): String = value.id.value
}

class PostgresTenantTeamRepo(env: Env,
                             reactivePgAsyncPool: ReactivePgAsyncPool,
                             tenant: TenantId)
  extends PostgresTenantAwareRepo[Team, TeamId](env, reactivePgAsyncPool, tenant) {
  override def tableName: String = "teams"

  override def format: Format[Team] = json.TeamFormat

  override def extractId(value: Team): String = value.id.value
}

class PostgresTenantApiRepo(env: Env,
                            reactivePgAsyncPool: ReactivePgAsyncPool,
                            tenant: TenantId)
  extends PostgresTenantAwareRepo[Api, ApiId](env, reactivePgAsyncPool, tenant) {
  override def format: Format[Api] = json.ApiFormat

  override def tableName: String = "apis"

  override def extractId(value: Api): String = value.id.value
}

class PostgresTenantTranslationRepo(env: Env,
                                    reactivePgAsyncPool: ReactivePgAsyncPool,
                                    tenant: TenantId)
  extends PostgresTenantAwareRepo[Translation, DatastoreId](env,
    reactivePgAsyncPool,
    tenant) {
  override def tableName: String = "translations"

  override def format: Format[Translation] = json.TranslationFormat

  override def extractId(value: Translation): String = value.id.value
}

class PostgresTenantMessageRepo(env: Env,
                                reactivePgAsyncPool: ReactivePgAsyncPool,
                                tenant: TenantId)
  extends PostgresTenantAwareRepo[Message, DatastoreId](env,
    reactivePgAsyncPool,
    tenant) {
  override def tableName: String = "messages"

  override def format: Format[Message] = json.MessageFormat

  override def extractId(value: Message): String = value.id.value
}

class PostgresTenantApiSubscriptionRepo(env: Env,
                                        reactivePgAsyncPool: ReactivePgAsyncPool,
                                        tenant: TenantId)
  extends PostgresTenantAwareRepo[ApiSubscription, ApiSubscriptionId](
    env,
    reactivePgAsyncPool,
    tenant) {
  override def tableName: String = "api_subscriptions"

  override def format: Format[ApiSubscription] = json.ApiSubscriptionFormat

  override def extractId(value: ApiSubscription): String = value.id.value
}

class PostgresTenantApiDocumentationPageRepo(env: Env,
                                             reactivePgAsyncPool: ReactivePgAsyncPool,
                                             tenant: TenantId)
  extends PostgresTenantAwareRepo[ApiDocumentationPage, ApiDocumentationPageId](
    env,
    reactivePgAsyncPool,
    tenant) {
  override def tableName: String = "api_documentation_pages"

  override def format: Format[ApiDocumentationPage] =
    json.ApiDocumentationPageFormat

  override def extractId(value: ApiDocumentationPage): String = value.id.value
}

class PostgresTenantNotificationRepo(env: Env,
                                     reactivePgAsyncPool: ReactivePgAsyncPool,
                                     tenant: TenantId)
  extends PostgresTenantAwareRepo[Notification, NotificationId](env,
    reactivePgAsyncPool,
    tenant) {
  override def tableName: String = "notifications"

  override def format: Format[Notification] =
    json.NotificationFormat

  override def extractId(value: Notification): String = value.id.value
}

class PostgresTenantConsumptionRepo(env: Env,
                                    reactivePgAsyncPool: ReactivePgAsyncPool,
                                    tenant: TenantId)
  extends PostgresTenantAwareRepo[ApiKeyConsumption, DatastoreId](env,
    reactivePgAsyncPool,
    tenant) {
  override def tableName: String = "consumptions"

  override def format: Format[ApiKeyConsumption] =
    json.ConsumptionFormat

  override def extractId(value: ApiKeyConsumption): String = value.id.value
}

class PostgresTenantAuditTrailRepo(env: Env,
                                   reactivePgAsyncPool: ReactivePgAsyncPool,
                                   tenant: TenantId)
  extends PostgresTenantAwareRepo[JsObject, DatastoreId](env,
    reactivePgAsyncPool,
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

class PostgresUserRepo(env: Env, reactivePgAsyncPool: ReactivePgAsyncPool)
  extends PostgresRepo[User, UserId](env, reactivePgAsyncPool)
    with UserRepo {
  override def tableName: String = "users"

  override def format: Format[User] = json.UserFormat

  override def extractId(value: User): String = value.id.value
}

class PostgresTeamRepo(env: Env, reactivePgAsyncPool: ReactivePgAsyncPool)
  extends PostgresRepo[Team, TeamId](env, reactivePgAsyncPool) {
  override def tableName: String = "teams"

  override def format: Format[Team] = json.TeamFormat

  override def extractId(value: Team): String = value.id.value
}

class PostgresTranslationRepo(env: Env, reactivePgAsyncPool: ReactivePgAsyncPool)
  extends PostgresRepo[Translation, DatastoreId](env, reactivePgAsyncPool) {
  override def tableName: String = "translations"

  override def format: Format[Translation] = json.TranslationFormat

  override def extractId(value: Translation): String = value.id.value
}

class PostgresMessageRepo(env: Env, reactivePgAsyncPool: ReactivePgAsyncPool)
  extends PostgresRepo[Message, DatastoreId](env, reactivePgAsyncPool) {
  override def tableName: String = "messages"

  override def format: Format[Message] = json.MessageFormat

  override def extractId(value: Message): String = value.id.value
}

class PostgresApiRepo(env: Env, reactivePgAsyncPool: ReactivePgAsyncPool)
  extends PostgresRepo[Api, ApiId](env, reactivePgAsyncPool) {
  override def tableName: String = "apis"

  override def format: Format[Api] = json.ApiFormat

  override def extractId(value: Api): String = value.id.value
}

class PostgresApiSubscriptionRepo(env: Env, reactivePgAsyncPool: ReactivePgAsyncPool)
  extends PostgresRepo[ApiSubscription, ApiSubscriptionId](env, reactivePgAsyncPool) {
  override def tableName: String = "api_subscriptions"

  override def format: Format[ApiSubscription] = json.ApiSubscriptionFormat

  override def extractId(value: ApiSubscription): String = value.id.value
}

class PostgresApiDocumentationPageRepo(env: Env,
                                       reactivePgAsyncPool: ReactivePgAsyncPool)
  extends PostgresRepo[ApiDocumentationPage, ApiDocumentationPageId](
    env,
    reactivePgAsyncPool) {
  override def tableName: String = "api_documentation_pages"

  override def format: Format[ApiDocumentationPage] =
    json.ApiDocumentationPageFormat

  override def extractId(value: ApiDocumentationPage): String = value.id.value
}

class PostgresNotificationRepo(env: Env, reactivePgAsyncPool: ReactivePgAsyncPool)
  extends PostgresRepo[Notification, NotificationId](env, reactivePgAsyncPool) {
  override def tableName: String = "notifications"

  override def format: Format[Notification] =
    json.NotificationFormat

  override def extractId(value: Notification): String = value.id.value
}

class PostgresConsumptionRepo(env: Env, reactivePgAsyncPool: ReactivePgAsyncPool)
  extends PostgresRepo[ApiKeyConsumption, DatastoreId](env, reactivePgAsyncPool) {
  override def tableName: String = "consumptions"

  override def format: Format[ApiKeyConsumption] = json.ConsumptionFormat

  override def extractId(value: ApiKeyConsumption): String = value.id.value
}

class PostgresUserSessionRepo(env: Env, reactivePgAsyncPool: ReactivePgAsyncPool)
  extends PostgresRepo[UserSession, DatastoreId](env, reactivePgAsyncPool)
    with UserSessionRepo {
  override def tableName: String = "user_sessions"

  override def format: Format[UserSession] =
    json.UserSessionFormat

  override def extractId(value: UserSession): String = value.id.value
}

class PostgresAuditTrailRepo(env: Env, reactivePgAsyncPool: ReactivePgAsyncPool)
  extends PostgresRepo[JsObject, DatastoreId](env, reactivePgAsyncPool) {
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
                                                  reactivePgAsyncPool: ReactivePgAsyncPool)
  extends CommonRepo[Of, Id](env, reactivePgAsyncPool) {

  private lazy val logger: Logger = Logger(s"PostgresRepo")

  override def find(
                     query: JsObject,
                     sort: Option[JsObject] = None,
                     maxDocs: Int = -1)(implicit ec: ExecutionContext): Future[Seq[Of]] = {
    logger.debug(s"$tableName.find(${Json.prettyPrint(query)})")

    sort match {
      case None =>
        reactivePgAsyncPool.query { dsl =>
          if (query.values.isEmpty) dsl.resultQuery("SELECT * FROM {0}", DSL.table(tableName))
          else
            dsl.resultQuery(
              "SELECT * FROM {0} WHERE {1}",
              DSL.table(tableName),
              DSL.table(convertQuery(query))
            )
        }
          .map(getContentsListFromJson(_, format))
      case Some(s) =>
        reactivePgAsyncPool.query { dsl =>
          if (query.values.isEmpty)
            dsl.resultQuery(
              "SELECT *, {2} FROM {0} ORDER BY {1}",
              DSL.table(tableName),
              DSL.table(s.keys.map(key => s"$quotes$key$quotes").mkString(",")),
              DSL.table(s.keys.map { key =>
                s"content->>'$key' as $quotes$key$quotes"
              }.mkString(",")))
          else
            dsl.resultQuery(
              "SELECT *, {3} FROM {0} WHERE {1} ORDER BY {2}",
              DSL.table(tableName),
              DSL.table(convertQuery(query)),
              DSL.table(s.keys.map(key => s"$quotes$key$quotes").mkString(",")),
              DSL.table(s.keys.map { key =>
                s"content->>'$key' as $quotes$key$quotes"
              }.mkString(",")))
        }
          .map(getContentsListFromJson(_, format))
    }
  }

  override def count()(implicit ec: ExecutionContext): Future[Long] = count(JsObject.empty)

  override def deleteByIdLogically(id: String)(
    implicit ec: ExecutionContext): Future[Boolean] = {
    logger.debug(s"$tableName.deleteByIdLogically($id)")
    reactivePgAsyncPool.execute { dsl =>
      dsl.resultQuery("UPDATE {0} " +
        "SET _deleted = true, content = content || '{ \"_deleted\" : true }' " +
        "WHERE _id = {1} AND _deleted = false",
        DSL.table(tableName),
        DSL.inline(id)
      )
    }
      .map(_ > 0)
  }

  override def deleteByIdLogically(id: Id)(
    implicit ec: ExecutionContext): Future[Boolean] = {
    logger.debug(s"$tableName.deleteByIdLogically($id)")
    deleteByIdLogically(id.value)
  }

  override def deleteLogically(query: JsObject)(
    implicit ec: ExecutionContext): Future[Boolean] = {
    logger.debug(s"$tableName.deleteLogically(${Json.prettyPrint(query)})")
    reactivePgAsyncPool.execute { dsl =>
      dsl.resultQuery("UPDATE {0} " +
        "SET _deleted = true, content = content || '{ \"_deleted\" : true }' " +
        "WHERE _deleted = false AND {1}",
        DSL.table(tableName),
        DSL.table(convertQuery(query))
      )
    }
      .map(_ > 0)
  }

  override def deleteAllLogically()(implicit ec: ExecutionContext): Future[Boolean] = {
    logger.debug(s"$tableName.deleteAllLogically()")
    reactivePgAsyncPool.execute { dsl =>
      dsl
        .resultQuery("UPDATE {0} " +
          "SET _deleted = true, content = content || '{ \"_deleted\" : true }' " +
          "WHERE _deleted = false",
          DSL.table(tableName)
        )
    }
      .map(_ > 0)
  }

  override def findWithPagination(query: JsObject, page: Int, pageSize: Int)
                                 (implicit ec: ExecutionContext): Future[(Seq[Of], Long)] =
    super.findWithPagination(query, page, pageSize)
}

abstract class PostgresTenantAwareRepo[Of, Id <: ValueType](
                                                             env: Env,
                                                             reactivePgAsyncPool: ReactivePgAsyncPool,
                                                             tenant: TenantId)
  extends CommonRepo[Of, Id](env, reactivePgAsyncPool) {

  val logger: Logger = Logger(s"PostgresTenantAwareRepo")

  override def deleteByIdLogically(id: String)(
    implicit ec: ExecutionContext): Future[Boolean] = {
    logger.debug(s"$tableName.deleteByIdLogically($id)")

    reactivePgAsyncPool.execute { dsl =>
      dsl.resultQuery("UPDATE {0} " +
        "SET _deleted = true, content = content || '{ \"_deleted\" : true }' " +
        "WHERE _id = {1} AND content ->> '_tenant' = {2}",
        DSL.table(tableName),
        DSL.inline(id),
        DSL.inline(tenant.value)
      )
    }
      .map(_ > 0)
  }

  override def deleteByIdLogically(id: Id)(
    implicit ec: ExecutionContext): Future[Boolean] = {
    deleteByIdLogically(id.value)
  }

  override def deleteLogically(query: JsObject)(
    implicit ec: ExecutionContext): Future[Boolean] = {
    logger.debug(s"$tableName.deleteLogically(${Json.prettyPrint(query)})")

    reactivePgAsyncPool.execute { dsl =>
      dsl.resultQuery("UPDATE {0} " +
        "SET _deleted = true, content = content || '{ \"_deleted\" : true }' " +
        "WHERE content ->> '_tenant' = {1} AND {2}",
        DSL.table(tableName),
        DSL.inline(tenant.value),
        DSL.table(convertQuery(query ++ Json.obj("_deleted" -> false, "_tenant" -> tenant.value)))
      )
    }
      .map(_ > 0)
  }

  override def deleteAllLogically()(
    implicit ec: ExecutionContext): Future[Boolean] = {
    logger.debug(s"$tableName.deleteAllLogically()")

    reactivePgAsyncPool.execute { dsl =>
      dsl.resultQuery("UPDATE {0} " +
        "SET _deleted = true, content = content || '{ \"_deleted\" : true }' " +
        "WHERE content ->> '_tenant' = {1} AND _deleted = false",
        DSL.table(tableName),
        DSL.inline(tenant.value)
      )
    }
      .map(_ > 0)
  }

  override def find(
                     query: JsObject,
                     sort: Option[JsObject] = None,
                     maxDocs: Int = -1)(implicit ec: ExecutionContext): Future[Seq[Of]] = {
    logger.debug(s"$tableName.find(${Json.prettyPrint(query ++ Json.obj("_tenant" -> tenant.value))})")

    sort match {
      case None =>
        reactivePgAsyncPool.query { dsl =>
          if (query.values.isEmpty)
            dsl.resultQuery("SELECT * FROM {0}", DSL.table(tableName))
          else
            dsl.resultQuery(
              "SELECT * FROM {0} WHERE {1}",
              DSL.table(tableName),
              DSL.table(convertQuery(query ++ Json.obj("_tenant" -> tenant.value))))
        }
          .map(getContentsListFromJson(_, format))
      case Some(s) =>
        logger.error(s"$tableName.find($query - $sort)")
        reactivePgAsyncPool.query { dsl =>
          if (query.values.isEmpty)
            dsl.resultQuery(
              "SELECT *, {2} FROM {0} ORDER BY {1}",
              DSL.table(tableName),
              DSL.table(s.keys.map(key => s"$quotes$key$quotes").mkString(",")),
              DSL.table(s.keys.map { key =>
                s"content->>'$key' as $quotes$key$quotes"
              }.mkString(","))
            )
          else
            dsl.resultQuery(
              "SELECT *, {3} FROM {0} WHERE {1} ORDER BY {2}",
              DSL.table(tableName),
              DSL.table(convertQuery(query)),
              DSL.table(s.keys.map(key => s"$quotes$key$quotes").mkString(",")),
              DSL.table(s.keys.map { key =>
                s"content->>'$key' as $quotes$key$quotes"
              }.mkString(","))
            )
        }
          .map(getContentsListFromJson(_, format))
    }
  }

  override def findOne(query: JsObject)(
    implicit ec: ExecutionContext): Future[Option[Of]] = super.findOne(query ++ Json.obj("_tenant" -> tenant.value))

  override def delete(query: JsObject)(implicit ec: ExecutionContext): Future[Boolean] =
    super.delete(query ++ Json.obj("_tenant" -> tenant.value))

  override def insertMany(values: Seq[Of])(implicit ec: ExecutionContext): Future[Long] =
    super.insertMany(values, Json.obj("_tenant" -> tenant.value))

  override def exists(query: JsObject)(
    implicit ec: ExecutionContext): Future[Boolean] = super.exists(query ++ Json.obj("_tenant" -> tenant.value))

  override def count()(implicit ec: ExecutionContext): Future[Long] = count(Json.obj("_tenant" -> tenant.value))

  override def findWithProjection(query: JsObject, projection: JsObject)
                                 (implicit ec: ExecutionContext): Future[Seq[JsObject]] =
    super.findWithProjection(query ++ Json.obj("_tenant" -> tenant.value), projection)

  override def findOneWithProjection(query: JsObject, projection: JsObject)
                                    (implicit ec: ExecutionContext): Future[Option[JsObject]] =
    super.findOneWithProjection(query ++ Json.obj("_tenant" -> tenant.value), projection)
}

abstract class CommonRepo[Of, Id <: ValueType](env: Env,
                                                reactivePgAsyncPool: ReactivePgAsyncPool)
  extends RepositoryPostgres[Of, Id] {

  private val logger = Logger("CommonMongoRepo")

  val jsObjectWrites: OWrites[JsObject] = (o: JsObject) => o

  implicit val jsObjectFormat: OFormat[JsObject] = new OFormat[JsObject] {
    override def reads(json: JsValue): JsResult[JsObject] =
      json.validate[JsObject](Reads.JsObjectReads)

    override def writes(o: JsObject): JsObject = o
  }

  override def count(query: JsObject)(
    implicit ec: ExecutionContext): Future[Long] = {
    logger.debug(s"$tableName.count(${Json.prettyPrint(query)})")
    reactivePgAsyncPool
      .queryOne(dsl =>
        if (query.values.isEmpty)
          dsl.resultQuery("SELECT COUNT(*) as count FROM {0}", DSL.table(tableName))
        else
          dsl.resultQuery("SELECT COUNT(*) as count FROM {0} WHERE {1}",
            DSL.table(tableName),
            DSL.table(convertQuery(query))
          )
      )
      .map(res => res.map(_.get("count", classOf[Long])).getOrElse(0L))
  }

  override def exists(query: JsObject)(
    implicit ec: ExecutionContext): Future[Boolean] =
    reactivePgAsyncPool.execute { dsl =>
      dsl.resultQuery("SELECT 1 FROM {0} WHERE {1}",
        DSL.table(tableName),
        DSL.table(convertQuery(query))
      )
    }
      .map(_ > 0)

  override def streamAllRaw(query: JsObject = Json.obj())(implicit ec: ExecutionContext): Source[JsValue, NotUsed] = {
    logger.debug(s"$tableName.streamAllRaw(${Json.prettyPrint(query)})")

    Source
      .future(
        reactivePgAsyncPool
          .query(dsl => dsl.resultQuery("SELECT * FROM {0}", DSL.table(tableName)))
          .map { res => JsArray(res.map(recordToJson))}
      )
  }

  override def findOne(query: JsObject)(
    implicit ec: ExecutionContext): Future[Option[Of]] =
      reactivePgAsyncPool
        .queryOne(
          dsl => dsl.resultQuery(
            "SELECT * FROM {0} WHERE {1} LIMIT 1",
            DSL.table(tableName),
            DSL.table(convertQuery(query)))
        )
        .map(getContentFromJson(_, format))

  override def delete(query: JsObject)(
    implicit ec: ExecutionContext): Future[Boolean] = {
    logger.debug(s"$tableName.delete(${Json.prettyPrint(query)})")

    reactivePgAsyncPool
      .execute(dsl =>
        if (query.values.isEmpty)
          dsl.resultQuery("DELETE FROM {0}", DSL.table(tableName))
        else
          dsl.resultQuery(
            "DELETE FROM {0} WHERE {1}",
            DSL.table(tableName),
            DSL.table(convertQuery(query))
          )
      )
      .map(_ > 0)
  }

  override def save(query: JsObject, value: JsObject)(
    implicit ec: ExecutionContext): Future[Boolean] = {
    logger.debug(s"$tableName.save(${Json.prettyPrint(query)})")

    reactivePgAsyncPool.execute { dsl =>
      if (value.keys.contains("_deleted"))
        dsl
          .resultQuery("INSERT INTO {0}(_id, _deleted, content) VALUES({1},{2},{3}) " +
            "ON CONFLICT (_id) DO UPDATE " +
            "set _deleted = {2}, content = {3}",
            DSL.table(tableName),
            DSL.inline((value \ "_id").as[String]),
            DSL.inline((value \ "_deleted").as[Boolean]),
            DSL.inline(value)
          )
      else
        dsl
          .resultQuery("INSERT INTO {0}(_id, content) VALUES({1},{2}) ON CONFLICT (_id) DO UPDATE set content = {2}",
            DSL.table(tableName),
            DSL.inline((value \ "_id").as[String]),
            DSL.inline(value)
          )
    }
      .map(_ > 0)
  }

  def insertMany(values: Seq[Of], addToPayload: JsObject)(
    implicit ec: ExecutionContext): Future[Long] = {
    logger.debug(s"$tableName.insertMany()")
    val payloads = values.map(v =>
      format.writes(v).as[JsObject] ++ addToPayload)

    reactivePgAsyncPool.execute { dsl =>
      dsl.resultQuery(
        "INSERT INTO {0}(_id, content) VALUES{1}",
        DSL.table(tableName),
        DSL.table(payloads.map { payload =>
          s"(${DSL.inline((payload \ "_id").as[String])}, ${DSL.inline(payload)})"
        }
          .mkString(","))
      )
    }
      .map(_.asInstanceOf[Long])
  }

  override def insertMany(values: Seq[Of])(
    implicit ec: ExecutionContext): Future[Long] = insertMany(values, Json.obj())

  override def updateMany(query: JsObject, value: JsObject)(
    implicit ec: ExecutionContext): Future[Long] = {
    logger.debug(s"$tableName.updateMany(${Json.prettyPrint(query)})")

    reactivePgAsyncPool.execute { dsl =>
      dsl.resultQuery("UPDATE {0} SET content = content || {1} WHERE {2}",
        DSL.table(tableName),
        DSL.inline(value),
        DSL.table(convertQuery(query))
      )
    }
      .map(_.asInstanceOf[Long])
  }

  override def updateManyByQuery(query: JsObject, queryUpdate: JsObject)(
    implicit ec: ExecutionContext): Future[Long] = {
    logger.debug(s"$tableName.updateManyByQuery(${Json.prettyPrint(query)})")

    reactivePgAsyncPool.execute { dsl =>
      dsl.resultQuery("UPDATE {0} " +
        "SET {1}" +
        "WHERE {2}",
        DSL.table(tableName),
        DSL.table(convertQuery(queryUpdate)),
        DSL.table(convertQuery(query))
      )
    }
      .map(_.asInstanceOf[Long])
  }

  override def findMaxByQuery(query: JsObject, field: String)(
    implicit ec: ExecutionContext): Future[Option[Long]] = {
    logger.debug(s"$tableName.findMaxByQuery(${Json.prettyPrint(query)})")

    reactivePgAsyncPool.queryOne { dsl =>
      dsl.resultQuery(
        "SELECT MAX({2})::bigint as total " +
          "FROM {0} " +
          "WHERE {1}",
        DSL.table(tableName),
        DSL.table(convertQuery(query)),
        DSL.table(s"content->>'$field'")
      )
    }
      .map(_.map(res => res.get("total", classOf[Long])))
  }

  override def findWithProjection(query: JsObject, projection: JsObject)(
    implicit ec: ExecutionContext
  ): Future[Seq[JsObject]] =
    reactivePgAsyncPool.query { dsl =>
      logger.debug(s"$tableName.find(${Json.prettyPrint(query)}, ${Json.prettyPrint(projection)})")
      if (query.values.isEmpty) dsl.resultQuery(
        "SELECT {1} FROM {0}",
        DSL.table(tableName),
        if (projection.values.isEmpty) "*" else projection.keys.mkString(",")
      )
      else
        dsl.resultQuery(
          "SELECT {2} FROM {0} WHERE {1}",
          DSL.table(tableName),
          DSL.table(convertQuery(query)),
          if (projection.values.isEmpty) "*" else projection.keys.mkString(",")
        )
    }
      .map(getContentsListFromJson(_, format))
      .map(_.asInstanceOf[Seq[JsObject]])

  override def findOneWithProjection(query: JsObject, projection: JsObject)(
    implicit ec: ExecutionContext
  ): Future[Option[JsObject]] = {
    logger.debug(s"$tableName.find(${Json.prettyPrint(query)}, ${Json.prettyPrint(projection)})")
    reactivePgAsyncPool
      .queryOne { dsl =>
        if (query.values.isEmpty)
          dsl.resultQuery(
            "SELECT {1} FROM {0}",
            DSL.table(tableName),
            if (projection.values.isEmpty) "*" else projection.keys.mkString(","))
        else
          dsl.resultQuery(
            "SELECT {2} FROM {0} WHERE {1}",
            DSL.table(tableName),
            DSL.table(convertQuery(query)),
            if (projection.values.isEmpty) "*" else projection.keys.mkString(","))
      }
      .map(getContentFromJson(_, format))
      .asInstanceOf[Future[Option[JsObject]]]
  }

  override def findWithPagination(query: JsObject, page: Int, pageSize: Int)(
    implicit ec: ExecutionContext
  ): Future[(Seq[Of], Long)] = {
    logger.debug(s"$tableName.findWithPagination(${Json.prettyPrint(query)}, $page, $pageSize)")
    for {
      count <- count(query)
      queryRes <- {
        reactivePgAsyncPool.query { dsl =>
          if (query.values.isEmpty) dsl.resultQuery(
            "SELECT * FROM {0} ORDER BY _id DESC LIMIT {1} OFFSET {2}",
            DSL.table(tableName),
            DSL.inline(pageSize),
            DSL.inline(page * pageSize)
          )
          else
            dsl.resultQuery(
              "SELECT * FROM {0} WHERE {1} ORDER BY _id DESC LIMIT {2} OFFSET {3}",
              DSL.table(tableName),
              DSL.table(convertQuery(query)),
              DSL.inline(pageSize.toString),
              DSL.inline((page * pageSize).toString)
            )
        }
          .map(getContentsListFromJson(_, format))
      }
    } yield {
      (queryRes, count)
    }
  }
}