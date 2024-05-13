package storage.drivers.postgres

import org.apache.pekko.NotUsed
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.{Framing, Keep, Sink, Source}
import org.apache.pekko.util.ByteString
import cats.implicits.catsSyntaxOptionId
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import io.vertx.core.buffer.Buffer
import io.vertx.core.json.JsonObject
import io.vertx.core.net.{PemKeyCertOptions, PemTrustOptions}
import io.vertx.pgclient.{PgConnectOptions, PgPool, SslMode}
import io.vertx.sqlclient.PoolOptions
import play.api.libs.json._
import play.api.{Configuration, Logger}
import storage._
import storage.drivers.postgres.Helper._
import storage.drivers.postgres.pgimplicits.EnhancedRow

import scala.collection.mutable.ListBuffer
import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.CollectionConverters.{IterableHasAsScala, MapHasAsJava}

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
    _repo: () => PostgresRepo[SubscriptionDemand, SubscriptionDemandId],
    _tenantRepo: TenantId => PostgresTenantAwareRepo[
      SubscriptionDemand,
      SubscriptionDemandId
    ]
) extends PostgresTenantCapableRepo[SubscriptionDemand, SubscriptionDemandId]
    with SubscriptionDemandRepo {
  override def repo(): PostgresRepo[SubscriptionDemand, SubscriptionDemandId] =
    _repo()

  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[SubscriptionDemand, SubscriptionDemandId] =
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
      json.validate[JsObject](Reads.JsObjectReads)

    override def writes(o: JsObject): JsObject = o
  }

  val jsObjectWrites: OWrites[JsObject] = (o: JsObject) => o

  override def tenantRepo(
      tenant: TenantId
  ): PostgresTenantAwareRepo[ApiKeyConsumption, DatastoreId] =
    _tenantRepo(tenant)

  override def repo(): PostgresRepo[ApiKeyConsumption, DatastoreId] = _repo()

  private def lastConsumptions(tenantId: Option[TenantId], filter: JsObject)(
      implicit ec: ExecutionContext
  ): Future[Seq[ApiKeyConsumption]] = {

    val rep = tenantId match {
      case Some(t) =>
        forTenant(t)
          .asInstanceOf[PostgresTenantAwareRepo[ApiKeyConsumption, DatastoreId]]
      case None =>
        forAllTenant()
          .asInstanceOf[PostgresRepo[ApiKeyConsumption, DatastoreId]]
    }

    val (sql, params) = convertQuery(filter)
    val selector = if (sql == "") "" else s"WHERE $sql "

    reactivePg
      .querySeq(
        s"SELECT content->>'clientId' as client_id, MAX(content->>'from') as max_from FROM ${rep.tableName} " +
          selector +
          "GROUP BY content->>'clientId'",
        params
      ) { row =>
        Json
          .obj(
            "clientId" -> row.getString("client_id"),
            "from" -> String.valueOf(row.getValue("max_from"))
          )
          .some
      }
      .map(res =>
        Future.sequence(
          res
            .map(queryResult => findOne(queryResult, rep.tableName, rep.format))
        )
      )
      .flatMap(r =>
        r.map(res =>
          res.collect {
            case Some(value) => value
          }
        )
      )
  }

  def findOne(
      query: JsObject,
      tableName: String,
      format: Format[ApiKeyConsumption]
  )(implicit ec: ExecutionContext) = {
    val (sql, params) = convertQuery(query)
    reactivePg.queryOne(s"SELECT * FROM $tableName WHERE $sql", params) {
      rowToJson(_, format)
    }
  }

  override def getLastConsumptionsforAllTenant(filter: JsObject)(implicit
      ec: ExecutionContext
  ): Future[Seq[ApiKeyConsumption]] = lastConsumptions(None, filter)

  override def getLastConsumptionsForTenant(
      tenantId: TenantId,
      filter: JsObject
  )(implicit
      ec: ExecutionContext
  ): Future[Seq[ApiKeyConsumption]] = lastConsumptions(Some(tenantId), filter)
}

class PostgresDataStore(configuration: Configuration, env: Env, pgPool: PgPool)
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
    "reports_info" -> true
  )

  private lazy val poolOptions: PoolOptions = new PoolOptions()
    .setMaxSize(configuration.get[Int]("daikoku.postgres.poolSize"))

  private lazy val options: PgConnectOptions = {
    val options = new PgConnectOptions()
      .setPort(configuration.get[Int]("daikoku.postgres.port"))
      .setHost(configuration.get[String]("daikoku.postgres.host"))
      .setDatabase(configuration.get[String]("daikoku.postgres.database"))
      .setUser(configuration.get[String]("daikoku.postgres.username"))
      .setPassword(configuration.get[String]("daikoku.postgres.password"))
      .setProperties(
        Map(
          "search_path" -> getSchema
        ).asJava
      )

    val ssl = configuration
      .getOptional[Configuration]("daikoku.postgres.ssl")
      .getOrElse(Configuration.empty)
    val sslEnabled = ssl.getOptional[Boolean]("enabled").getOrElse(false)

    if (sslEnabled) {
      val pemTrustOptions = new PemTrustOptions()
      val pemKeyCertOptions = new PemKeyCertOptions()

      options.setSslMode(
        SslMode.of(ssl.getOptional[String]("mode").getOrElse("verify-ca"))
      )
      ssl
        .getOptional[Int]("ssl-handshake-timeout")
        .map(options.setSslHandshakeTimeout(_))

      ssl.getOptional[Seq[String]]("trusted-certs-path").map { pathes =>
        pathes.map(p => pemTrustOptions.addCertPath(p))
        options.setPemTrustOptions(pemTrustOptions)
      }
      ssl.getOptional[String]("trusted-cert-path").map { path =>
        pemTrustOptions.addCertPath(path)
        options.setPemTrustOptions(pemTrustOptions)
      }
      ssl.getOptional[Seq[String]]("trusted-certs").map { certs =>
        certs.map(p => pemTrustOptions.addCertValue(Buffer.buffer(p)))
        options.setPemTrustOptions(pemTrustOptions)
      }
      ssl.getOptional[String]("trusted-cert").map { path =>
        pemTrustOptions.addCertValue(Buffer.buffer(path))
        options.setPemTrustOptions(pemTrustOptions)
      }
      ssl.getOptional[Seq[String]]("client-certs-path").map { paths =>
        paths.map(p => pemKeyCertOptions.addCertPath(p))
        options.setPemKeyCertOptions(pemKeyCertOptions)
      }
      ssl.getOptional[Seq[String]]("client-certs").map { certs =>
        certs.map(p => pemKeyCertOptions.addCertValue(Buffer.buffer(p)))
        options.setPemKeyCertOptions(pemKeyCertOptions)
      }
      ssl.getOptional[String]("client-cert-path").map { path =>
        pemKeyCertOptions.addCertPath(path)
        options.setPemKeyCertOptions(pemKeyCertOptions)
      }
      ssl.getOptional[String]("client-cert").map { path =>
        pemKeyCertOptions.addCertValue(Buffer.buffer(path))
        options.setPemKeyCertOptions(pemKeyCertOptions)
      }
      ssl.getOptional[Seq[String]]("client-keys-path").map { pathes =>
        pathes.map(p => pemKeyCertOptions.addKeyPath(p))
        options.setPemKeyCertOptions(pemKeyCertOptions)
      }
      ssl.getOptional[Seq[String]]("client-keys").map { certs =>
        certs.map(p => pemKeyCertOptions.addKeyValue(Buffer.buffer(p)))
        options.setPemKeyCertOptions(pemKeyCertOptions)
      }
      ssl.getOptional[String]("client-key-path").map { path =>
        pemKeyCertOptions.addKeyPath(path)
        options.setPemKeyCertOptions(pemKeyCertOptions)
      }
      ssl.getOptional[String]("client-key").map { path =>
        pemKeyCertOptions.addKeyValue(Buffer.buffer(path))
        options.setPemKeyCertOptions(pemKeyCertOptions)
      }
      ssl.getOptional[Boolean]("trust-all").map(options.setTrustAll)
    }
    options
  }

//  logger.info(s"used : ${options.getDatabase}")

  private lazy val reactivePg =
    new ReactivePg(pgPool, configuration)(ec)

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

  override def tenantRepo: TenantRepo = _tenantRepo

  override def userRepo: UserRepo = _userRepo

  override def teamRepo: TeamRepo = _teamRepo

  override def apiRepo: ApiRepo = _apiRepo

  override def apiSubscriptionRepo: ApiSubscriptionRepo = _apiSubscriptionRepo

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
        case Some(_) => createDatabase().map(_ => ())
        case _ =>
          logger.info(s"Create missing schema : $getSchema")
          for {
            _ <-
              reactivePg.rawQuery(s"CREATE SCHEMA IF NOT EXISTS ${getSchema}")
            _ <- createDatabase()
          } yield ()
      }
      .recover {
        case e: Exception =>
          logger.error(e.getMessage)
          FastFuture.successful(())
      }
  }

  def createDatabase(): Future[Any] = {
    logger.info("Checking status of database ...")
    Future.sequence(TABLES.map { case (key, value) => createTable(key, value) })
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
      .flatMap {
        case java.lang.Boolean.FALSE =>
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
        case java.lang.Boolean.TRUE => FastFuture.successful(())
      }
  }

  override def exportAsStream(
      pretty: Boolean,
      exportAuditTrail: Boolean = true
  )(implicit
      ec: ExecutionContext,
      mat: Materializer,
      env: Env
  ): Source[ByteString, _] = {
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
      assetRepo.forAllTenant(),
      stepValidatorRepo.forAllTenant(),
      subscriptionDemandRepo.forAllTenant(),
      usagePlanRepo.forAllTenant()
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

  override def importFromStream(source: Source[ByteString, _]): Future[Unit] = {
    logger.debug("importFromStream")

    Future
      .sequence(TABLES.map {
        case (key, _) => reactivePg.rawQuery(s"TRUNCATE $key")
      })
      .map { _ =>
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
            case (typ, _) =>
              logger.error(s"Unknown type: $typ")
              FastFuture.successful(false)
          }
          .toMat(Sink.ignore)(Keep.right)
          .run()(env.defaultMaterializer)
      }
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
        logger.debug(query)
        reactivePg.query(query)
      })
      .runWith(Sink.ignore)(env.defaultMaterializer)
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
    extends PostgresRepo[AccountCreation, DatastoreId](env, reactivePg)
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
) extends PostgresTenantAwareRepo[SubscriptionDemand, SubscriptionDemandId](
      env,
      reactivePg,
      tenant
    ) {
  override def tableName: String = "subscription_demands"

  override def format: Format[SubscriptionDemand] =
    json.SubscriptionDemandFormat

  override def extractId(value: SubscriptionDemand): String = value.id.value
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
  override def tableName: String = "cmspages"

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
    extends PostgresRepo[SubscriptionDemand, SubscriptionDemandId](
      env,
      reactivePg
    ) {
  override def tableName: String = "subscription_demands"

  override def format: Format[SubscriptionDemand] =
    json.SubscriptionDemandFormat

  override def extractId(value: SubscriptionDemand): String = value.id.value
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

  override def findRaw(
      query: JsObject,
      sort: Option[JsObject] = None,
      maxDocs: Int = -1
  )(implicit ec: ExecutionContext): Future[Seq[JsValue]] = {
    logger.debug(s"$tableName.find(${Json.prettyPrint(query)})")

    val limit = if (maxDocs > 0) s"Limit $maxDocs" else ""

    sort match {
      case None =>
        if (query.values.isEmpty)
          reactivePg.querySeq(s"SELECT * FROM $tableName $limit") {
            _.optJsObject("content")
          }
        else {
          val (sql, params) = convertQuery(query)
          reactivePg.querySeq(
            s"SELECT * FROM $tableName WHERE $sql $limit",
            params
          ) {
            _.optJsObject("content")
          }
        }

      case Some(_) =>
        val sortedKeys = sort
          .map(obj =>
            obj.fields.sortWith((a, b) =>
              a._2.as[JsNumber].value < b._2.as[JsNumber].value
            )
          )
          .map(r => r.map(x => s"content->>'${x._1}'"))
          .getOrElse(Seq("_id"))
        if (query.values.isEmpty)
          reactivePg.querySeq(
            s"SELECT * FROM $tableName $limit ORDER BY ${sortedKeys.mkString(",")} ASC",
            Seq.empty
          )(_.optJsObject("content"))
        else {
          val (sql, params) = convertQuery(query)
          reactivePg.querySeq(
            s"SELECT * FROM $tableName WHERE $sql $limit ORDER BY ${sortedKeys.mkString(",")} ASC",
            params
          )(_.optJsObject("content"))
        }
    }
  }

  override def find(
      query: JsObject,
      sort: Option[JsObject] = None,
      maxDocs: Int = -1
  )(implicit ec: ExecutionContext): Future[Seq[Of]] = {
    logger.debug(s"$tableName.find(${Json.prettyPrint(query)})")

    val limit = if (maxDocs > 0) s"Limit $maxDocs" else ""

    sort match {
      case None =>
        if (query.values.isEmpty)
          reactivePg.querySeq(s"SELECT * FROM $tableName $limit") {
            rowToJson(_, format)
          }
        else {
          val (sql, params) = convertQuery(query)
          reactivePg.querySeq(
            s"SELECT * FROM $tableName WHERE $sql $limit",
            params
          ) {
            rowToJson(_, format)
          }
        }

      case Some(_) =>
        val sortedKeys = sort
          .map(obj =>
            obj.fields.sortWith((a, b) =>
              a._2.as[JsNumber].value < b._2.as[JsNumber].value
            )
          )
          .map(r => r.map(x => s"content->>'${x._1}'"))
          .getOrElse(Seq("_id"))
        if (query.values.isEmpty)
          reactivePg.querySeq(
            s"SELECT * FROM $tableName $limit ORDER BY ${sortedKeys.mkString(",")} ASC",
            Seq.empty
          ) { rowToJson(_, format) }
        else {
          val (sql, params) = convertQuery(query)
          reactivePg.querySeq(
            s"SELECT * FROM $tableName WHERE $sql $limit ORDER BY ${sortedKeys.mkString(",")} ASC",
            params
          ) { rowToJson(_, format) }
        }
    }
  }

  override def count()(implicit ec: ExecutionContext): Future[Long] =
    count(JsObject.empty)

  override def deleteByIdLogically(
      id: String
  )(implicit ec: ExecutionContext): Future[Boolean] = {
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
  )(implicit ec: ExecutionContext): Future[Boolean] = {
    logger.debug(s"$tableName.deleteByIdLogically($id)")
    deleteByIdLogically(id.value)
  }

  override def deleteLogically(
      query: JsObject
  )(implicit ec: ExecutionContext): Future[Boolean] = {
    logger.debug(s"$tableName.deleteLogically(${Json.prettyPrint(query)})")
    val (sql, params) = convertQuery(query)
    reactivePg
      .query(
        s"UPDATE $tableName " +
          "SET _deleted = true, content = content || '{ \"_deleted\" : true }' " +
          s"WHERE _deleted = false AND $sql  RETURNING _id",
        params
      )
      .map(_.size() > 0)
  }

  override def deleteAllLogically()(implicit
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

  override def findWithPagination(
      query: JsObject,
      page: Int,
      pageSize: Int,
      sort: Option[JsObject] = None
  )(implicit ec: ExecutionContext): Future[(Seq[Of], Long)] =
    super.findWithPagination(query, page, pageSize, sort)
}

abstract class PostgresTenantAwareRepo[Of, Id <: ValueType](
    env: Env,
    reactivePg: ReactivePg,
    tenant: TenantId
) extends CommonRepo[Of, Id](env, reactivePg) {

  implicit val logger: Logger = Logger(s"PostgresTenantAwareRepo")

  override def deleteByIdLogically(
      id: String
  )(implicit ec: ExecutionContext): Future[Boolean] = {
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
  )(implicit ec: ExecutionContext): Future[Boolean] = {
    deleteByIdLogically(id.value)
  }

  override def deleteLogically(
      query: JsObject
  )(implicit ec: ExecutionContext): Future[Boolean] = {
    logger.debug(s"$tableName.deleteLogically(${Json.prettyPrint(query)})")
    val (sql, params) = convertQuery(
      query ++ Json.obj("_deleted" -> false, "_tenant" -> tenant.value)
    )
    reactivePg
      .query(
        s"UPDATE $tableName " +
          "SET _deleted = true, content = content || '{ \"_deleted\" : true }' " +
          s"WHERE content ->> '_tenant' = ${getParam(params.size)} AND $sql  RETURNING _id",
        params ++ Seq(tenant.value)
      )
      .map(_.size() > 0)
  }

  override def deleteAllLogically()(implicit
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

  override def findRaw(
      query: JsObject,
      sort: Option[JsObject] = None,
      maxDocs: Int = -1
  )(implicit ec: ExecutionContext): Future[Seq[JsValue]] = {
    logger.debug(
      s"$tableName.findRaw(${Json.prettyPrint(query ++ Json.obj("_tenant" -> tenant.value))})"
    )

    val limit = if (maxDocs > 0) s"Limit $maxDocs" else ""

    sort match {
      case None =>
        if (query.values.isEmpty)
          reactivePg.querySeq(
            s"SELECT * FROM $tableName WHERE content->>'_tenant' = '${tenant.value}' $limit"
          ) {
            _.optJsObject("content")
          }
        else {
          val (sql, params) = convertQuery(
            query ++ Json.obj("_tenant" -> tenant.value)
          )

          var out: String = s"SELECT * FROM $tableName WHERE $sql $limit"
          params.zipWithIndex.reverse.foreach {
            case (param, i) =>
              out = out.replace("$" + (i + 1), s"'$param'")
          }

          reactivePg.querySeq(out) {
            _.optJsObject("content")
          }
        }
      case Some(s) =>
        val sortedKeys = sort
          .map(obj =>
            obj.fields.sortWith((a, b) =>
              a._2.as[JsNumber].value < b._2.as[JsNumber].value
            )
          )
          .map(r => r.map(x => s"content->>'${x._1}'"))
          .getOrElse(Seq("_id"))
        if (query.values.isEmpty)
          reactivePg.querySeq(
            s"SELECT * FROM $tableName WHERE content->>'_tenant' = '${tenant.value} ORDER BY ${sortedKeys
              .mkString(",")} ASC $limit",
            Seq.empty
          ) {
            _.optJsObject("content")
          }
        else {
          val (sql, params) = convertQuery(
            query ++ Json.obj("_tenant" -> tenant.value)
          )
          reactivePg.querySeq(
            s"SELECT * FROM $tableName WHERE $sql ORDER BY ${sortedKeys
              .mkString(",")} ASC $limit",
            params
          ) {
            _.optJsObject("content")
          }
        }
    }
  }

  override def find(
      query: JsObject,
      sort: Option[JsObject] = None,
      maxDocs: Int = -1
  )(implicit ec: ExecutionContext): Future[Seq[Of]] = {
    logger.debug(
      s"$tableName.find(${Json.prettyPrint(query ++ Json.obj("_tenant" -> tenant.value))})"
    )

    val limit = if (maxDocs > 0) s"Limit $maxDocs" else ""

    sort match {
      case None =>
        if (query.values.isEmpty)
          reactivePg.querySeq(
            s"SELECT * FROM $tableName WHERE content->>'_tenant' = '${tenant.value}' $limit"
          ) {
            rowToJson(_, format)
          }
        else {
          val (sql, params) = convertQuery(
            query ++ Json.obj("_tenant" -> tenant.value)
          )

          var out: String = s"SELECT * FROM $tableName WHERE $sql $limit"
          params.zipWithIndex.reverse.foreach {
            case (param, i) =>
              out = out.replace("$" + (i + 1), s"'$param'")
          }

          reactivePg.querySeq(out) {
            rowToJson(_, format)
          }
        }
      case Some(s) =>
        val sortedKeys = sort
          .map(obj =>
            obj.fields.sortWith((a, b) =>
              a._2.as[JsNumber].value < b._2.as[JsNumber].value
            )
          )
          .map(r => r.map(x => s"content->>'${x._1}'"))
          .getOrElse(Seq("_id"))
        if (query.values.isEmpty)
          reactivePg.querySeq(
            s"SELECT * FROM $tableName WHERE content->>'_tenant' = '${tenant.value} ORDER BY ${sortedKeys
              .mkString(",")} ASC $limit",
            Seq.empty
          ) { rowToJson(_, format) }
        else {
          val (sql, params) = convertQuery(
            query ++ Json.obj("_tenant" -> tenant.value)
          )
          reactivePg.querySeq(
            s"SELECT * FROM $tableName WHERE $sql ORDER BY ${sortedKeys
              .mkString(",")} ASC $limit",
            params
          ) { rowToJson(_, format) }
        }
    }
  }

  override def findOne(
      query: JsObject
  )(implicit ec: ExecutionContext): Future[Option[Of]] =
    super.findOne(query ++ Json.obj("_tenant" -> tenant.value))

  override def delete(
      query: JsObject
  )(implicit ec: ExecutionContext): Future[Boolean] =
    super.delete(query ++ Json.obj("_tenant" -> tenant.value))

  override def insertMany(
      values: Seq[Of]
  )(implicit ec: ExecutionContext): Future[Long] =
    super.insertMany(values, Json.obj("_tenant" -> tenant.value))

  override def exists(
      query: JsObject
  )(implicit ec: ExecutionContext): Future[Boolean] =
    super.exists(query ++ Json.obj("_tenant" -> tenant.value))

  override def count()(implicit ec: ExecutionContext): Future[Long] =
    count(Json.obj("_tenant" -> tenant.value))

  override def findWithProjection(query: JsObject, projection: JsObject)(
      implicit ec: ExecutionContext
  ): Future[Seq[JsObject]] =
    super.findWithProjection(
      query ++ Json.obj("_tenant" -> tenant.value),
      projection
    )

  override def findOneWithProjection(query: JsObject, projection: JsObject)(
      implicit ec: ExecutionContext
  ): Future[Option[JsObject]] =
    super.findOneWithProjection(
      query ++ Json.obj("_tenant" -> tenant.value),
      projection
    )

  override def findWithPagination(
      query: JsObject,
      page: Int,
      pageSize: Int,
      sort: Option[JsObject] = None
  )(implicit ec: ExecutionContext): Future[(Seq[Of], Long)] =
    super.findWithPagination(
      query ++ Json.obj("_tenant" -> tenant.value),
      page,
      pageSize,
      sort
    )
}

abstract class CommonRepo[Of, Id <: ValueType](env: Env, reactivePg: ReactivePg)
    extends Repo[Of, Id] {

  private implicit val logger: Logger = Logger("CommonPostgresRepo")

  val jsObjectWrites: OWrites[JsObject] = (o: JsObject) => o

  implicit val jsObjectFormat: OFormat[JsObject] = new OFormat[JsObject] {
    override def reads(json: JsValue): JsResult[JsObject] =
      json.validate[JsObject](Reads.JsObjectReads)

    override def writes(o: JsObject): JsObject = o
  }

  override def count(
      query: JsObject
  )(implicit ec: ExecutionContext): Future[Long] = {
    logger.debug(s"$tableName.count(${Json.prettyPrint(query)})")

    if (query.values.isEmpty)
      reactivePg
        .queryOne(s"SELECT COUNT(*) as count FROM $tableName") {
          _.optLong("count")
        }
        .map(_.getOrElse(0L))
    else {
      val (sql, params) = convertQuery(query)
      reactivePg
        .queryOne(
          s"SELECT COUNT(*) as count FROM $tableName WHERE $sql",
          params
        ) { _.optLong("count") }
        .map(_.getOrElse(0L))
    }
  }

  override def exists(
      query: JsObject
  )(implicit ec: ExecutionContext): Future[Boolean] = {
    val (sql, params) = convertQuery(query)

    reactivePg
      .query(s"SELECT 1 FROM $tableName WHERE $sql", params)
      .map(_.size() > 0)
  }

  override def streamAllRaw(
      query: JsObject = Json.obj()
  )(implicit ec: ExecutionContext): Source[JsValue, NotUsed] = {
    logger.debug(s"$tableName.streamAllRaw(${Json.prettyPrint(query)})")

    val (sql, params) = convertQuery(query)
    val selector = if (sql == "") "" else s"WHERE $sql "

    Source
      .future(
        reactivePg
          .querySeq(s"SELECT * FROM $tableName $selector", params) { row =>
            row.optJsObject("content")
          }
      )
      .flatMapConcat(res => Source(res.toList))
  }

  override def streamAllRawFormatted(
      query: JsObject = Json.obj()
  )(implicit ec: ExecutionContext): Source[Of, NotUsed] = {
    logger.debug(
      s"$tableName.streamAllRawFormatted(${Json.prettyPrint(query)})"
    )

    val (sql, params) = convertQuery(query)
    val selector = if (sql == "") "" else s"WHERE $sql "

    Source
      .future(
        reactivePg
          .querySeq(s"SELECT * FROM $tableName $selector", params) { row =>
            row.optJsObject("content")
          }
      )
      .flatMapConcat(res =>
        Source(res.toList.map(format.reads).filter(_.isSuccess).map(_.get))
      )
  }

  override def findOneRaw(
      query: JsObject
  )(implicit ec: ExecutionContext): Future[Option[JsValue]] = {
    val (sql, params) = convertQuery(query)
    logger.debug(s"$tableName.findOneRaw(${Json.prettyPrint(query)})")
    logger.debug(s"[query] :: SELECT * FROM $tableName WHERE $sql LIMIT 1")
    logger.debug(s"[PARAMS] :: ${params.mkString(" - ")}")

    reactivePg
      .queryOne(s"SELECT * FROM $tableName WHERE " + sql + " LIMIT 1", params) {
        row =>
          logger.debug(s"[ROW] :: ${row.deepToString()}")
          logger.debug(s"[ROW] :: ${row.toJson}")
          row.optJsObject("content")
      }
  }

  override def findOne(
      query: JsObject
  )(implicit ec: ExecutionContext): Future[Option[Of]] = {
    val (sql, params) = convertQuery(query)
    logger.debug(s"$tableName.findeOne(${Json.prettyPrint(query)})")
    logger.debug(s"[query] :: SELECT * FROM $tableName WHERE $sql LIMIT 1")
    logger.debug(s"[PARAMS] :: ${params.mkString(" - ")}")

    reactivePg
      .queryOne(s"SELECT * FROM $tableName WHERE " + sql + " LIMIT 1", params) {
        row =>
          logger.debug(s"[ROW FINDONE] :: ${row.deepToString()}")
          logger.debug(s"[ROW FINDONE] :: ${row.toJson}")
          row.optJsObject("content").map(format.reads).collect {
            case JsSuccess(s, _) => s
            case JsError(errors) => None.asInstanceOf[Of]
          }
      }
  }

  override def delete(
      query: JsObject
  )(implicit ec: ExecutionContext): Future[Boolean] = {
    logger.debug(s"$tableName.delete(${Json.prettyPrint(query)})")

    if (query.values.isEmpty)
      reactivePg
        .query(s"DELETE FROM $tableName")
        .map(_ => true)
    else {
      val (sql, params) = convertQuery(query)
      reactivePg.query(s"DELETE FROM $tableName WHERE $sql", params)
    }.map(_ => true)
  }

  override def save(query: JsObject, value: JsObject)(implicit
      ec: ExecutionContext
  ): Future[Boolean] = {
    logger.debug(
      s"$tableName.save(${Json.prettyPrint(query)}) with value ${Json.prettyPrint(value)}"
    )

    (
      if (value.keys.contains("_deleted"))
        reactivePg.query(
          s"INSERT INTO $tableName(_id, _deleted, content) VALUES($$1,$$2,$$3) " +
            "ON CONFLICT (_id) DO UPDATE " +
            s"set _deleted = $$2, content = $$3",
          Seq(
            (value \ "_id").as[String],
            java.lang.Boolean.valueOf((value \ "_deleted").as[Boolean]),
            new JsonObject(Json.stringify(value))
          )
        )
      else
        reactivePg.query(
          s"INSERT INTO $tableName(_id, content) VALUES($$1,$$2) " +
            "ON CONFLICT (_id) DO UPDATE " +
            s"set content = $$2",
          Seq((value \ "_id").as[String], new JsonObject(Json.stringify(value)))
        )
    ).map(_ => true)
      .recover(_ => false)
  }

  def insertMany(values: Seq[Of], addToPayload: JsObject)(implicit
      ec: ExecutionContext
  ): Future[Long] = {
    logger.debug(s"$tableName.insertMany()")

    Future
      .sequence(
        values
          .map(v =>
            save(Json.obj(), format.writes(v).as[JsObject] ++ addToPayload)
          )
      )
      .map(_ => 1L)
  }

  override def insertMany(
      values: Seq[Of]
  )(implicit ec: ExecutionContext): Future[Long] =
    insertMany(values, Json.obj())

  override def updateMany(query: JsObject, value: JsObject)(implicit
      ec: ExecutionContext
  ): Future[Long] = {
    logger.debug(s"$tableName.updateMany(${Json.prettyPrint(query)})")

    val (sql, params) = convertQuery(query)
    reactivePg
      .query(
        s"UPDATE $tableName SET content = content || ${getParam(params.size)} WHERE $sql RETURNING _id",
        params ++ Seq(new JsonObject(Json.stringify(value)))
      )
      .map(_.size())
  }

  override def updateManyByQuery(query: JsObject, queryUpdate: JsObject)(
      implicit ec: ExecutionContext
  ): Future[Long] = {
    logger.debug(s"$tableName.updateManyByQuery(${Json.prettyPrint(query)})")

    val (sql1, params1) = convertQuery(queryUpdate)
    val (sql2, params2) = if (query.values.isEmpty) {
      ("", params1)
    } else {
      val tuple = convertQuery(query, params1)
      (s"WHERE ${tuple._1}", tuple._2)
    }

    var out: String = s"UPDATE $tableName SET $sql1 $sql2 RETURNING _id"
    params2.zipWithIndex.reverse.foreach {
      case (param, i) =>
        out = out.replace("$" + (i + 1), s"'$param'")
    }

    reactivePg
      .rawQuery(out)
      .map(_ => 1L)
  }

  override def findMaxByQuery(query: JsObject, field: String)(implicit
      ec: ExecutionContext
  ): Future[Option[Long]] = {
    logger.debug(s"$tableName.findMaxByQuery(${Json.prettyPrint(query)})")

    val (sql, params) = convertQuery(query)
    reactivePg.queryOne(
      s"SELECT MAX(content->>${getParam(params.size)})::bigint as total FROM $tableName WHERE $sql",
      params ++ Seq(field)
    ) { row =>
      Some(row.getLong(0).asInstanceOf[Long])
    }
  }

  override def findWithProjection(query: JsObject, projection: JsObject)(
      implicit ec: ExecutionContext
  ): Future[Seq[JsObject]] = {
    logger.debug(
      s"$tableName.findWithProjection(${Json.prettyPrint(query)}, ${Json.prettyPrint(projection)})"
    )

    if (query.values.isEmpty)
      reactivePg.querySeq(s"SELECT * FROM $tableName") { row =>
        projection.keys
          .map(key => Json.obj(key -> row.getString(key)))
          .foldLeft(Json.obj())(_ ++ _)
          .some
      }
    else {
      val (sql, params) = convertQuery(query)
      reactivePg.querySeq(
        s"SELECT " +
          s"${projection.keys.map(e => s"content->>'$e' as ${e.toLowerCase}").mkString(", ")} FROM $tableName WHERE $sql",
        params
      ) { row =>
        projection.keys
          .filter(key => {
            try {
              row.getString(key)
              true
            } catch {
              case _: Throwable => false
            }
          })
          .map(key => Json.obj(key -> row.getString(key)))
          .foldLeft(Json.obj())(_ ++ _)
          .some
      }
    }
  }

  override def findOneWithProjection(query: JsObject, projection: JsObject)(
      implicit ec: ExecutionContext
  ): Future[Option[JsObject]] = {
    logger.debug(
      s"$tableName.findOneWithProjection(${Json.prettyPrint(query)}, ${Json.prettyPrint(projection)})"
    )

    if (query.values.isEmpty) {
      reactivePg.queryOne(
        s"SELECT $$1 FROM $tableName",
        Seq(
          if (projection.values.isEmpty) "*"
          else
            projection.keys
              .map(e => s"content->>'$e' as ${e.toLowerCase}")
              .mkString(", ")
        )
      ) { row =>
        projection.keys
          .map(key => Json.obj(key -> row.getString(key)))
          .foldLeft(Json.obj())(_ ++ _)
          .some
      }
    } else {
      val (sql, params) = convertQuery(query)
      reactivePg.queryOne(
        s"SELECT ${getParam(params.size)} FROM $tableName WHERE $sql",
        params ++ Seq(
          if (projection.values.isEmpty) "*"
          else
            projection.keys
              .map(e => s"content->>'$e' as ${e.toLowerCase}")
              .mkString(", ")
        )
      ) { row =>
        projection.keys
          .map(key => Json.obj(key -> row.getString(key)))
          .foldLeft(Json.obj())(_ ++ _)
          .some
      }
    }
  }

  override def findWithPagination(
      query: JsObject,
      page: Int,
      pageSize: Int,
      sort: Option[JsObject] = None
  )(implicit
      ec: ExecutionContext
  ): Future[(Seq[Of], Long)] = {
    logger.debug(
      s"$tableName.findWithPagination(${Json.prettyPrint(query)}, $page, $pageSize)"
    )

    for {
      count <- {
        if (query.values.isEmpty)
          reactivePg
            .queryOne(s"SELECT COUNT(*) as count FROM $tableName") {
              _.optLong("count")
            }
            .map(_.getOrElse(0L))
        else {
          val (sql, params) = convertQuery(query)
          val out: String =
            s"SELECT COUNT(*) as count FROM $tableName WHERE $sql"

          reactivePg
            .queryOne(
              out,
              params.map {
                case x: String => x.replace("\"", "")
                case x         => x
              }
            ) { _.optLong("count") }
            .map(_.getOrElse(0L))
        }
      }
      queryRes <- {
        val sortedKeys = sort
          .map(obj =>
            obj.fields.sortWith((a, b) =>
              a._2.as[JsNumber].value < b._2.as[JsNumber].value
            )
          )
          .map(r => r.map(x => s"content->>'${x._1}'"))
          .getOrElse(Seq("_id"))

        if (query.values.isEmpty)
          reactivePg.querySeq(
            s"SELECT * FROM $tableName ORDER BY ${sortedKeys.mkString(",")} ASC LIMIT $$1 OFFSET $$2",
            Seq(Integer.valueOf(pageSize), Integer.valueOf(page * pageSize))
          ) { row =>
            rowToJson(row, format)
          }
        else {
          val (sql, params) = convertQuery(query)
          reactivePg.querySeq(
            s"SELECT * FROM $tableName WHERE $sql ORDER BY ${sortedKeys
              .mkString(",")} ASC ${if (pageSize > 0)
              s"LIMIT ${Integer.valueOf(pageSize)}"
            else ""} OFFSET ${Integer.valueOf(page * pageSize)}",
            params.map {
              case x: String => x.replace("\"", "")
              case x         => x
            }
          ) { row =>
            rowToJson(row, format)
          }
        }
      }
    } yield {
      (queryRes, count)
    }
  }
}
