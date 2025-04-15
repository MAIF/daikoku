package fr.maif.otoroshi.daikoku.env

import cats.implicits.catsSyntaxOptionId
import com.auth0.jwt.algorithms.Algorithm
import com.auth0.jwt.{JWT, JWTVerifier}
import fr.maif.otoroshi.daikoku.audit.AuditActorSupervizer
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain.{
  DatastoreId,
  ReportsInfo,
  TeamApiKeyVisibility,
  Tenant
}
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.login.LoginFilter
import fr.maif.otoroshi.daikoku.utils._
import io.vertx.pgclient.PgPool
import org.apache.pekko.Done
import org.apache.pekko.actor.{ActorRef, ActorSystem, PoisonPill}
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.{FileIO, Keep, Sink, Source}
import org.joda.time.DateTime
import play.api.ApplicationLoader.Context
import play.api.i18n.MessagesApi
import play.api.libs.ws.WSClient
import play.api.mvc.EssentialFilter
import play.api.{Configuration, Environment}
import storage.DataStore
import storage.drivers.postgres.PostgresDataStore
import java.nio.file.Paths
import scala.concurrent.duration.{FiniteDuration, _}
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.util.{Failure, Success}

sealed trait DaikokuMode {
  def name: String
}

object DaikokuMode {

  case object Prod extends DaikokuMode {
    def name = "Prod"
  }

  case object Dev extends DaikokuMode {
    def name = "Dev"
  }
  case object Test extends DaikokuMode {
    def name = "Test"
  }

}

sealed trait TenantProvider {
  def name: String
}

object TenantProvider {

  case object Local extends TenantProvider {
    def name: String = "Local"
  }

  case object Header extends TenantProvider {
    def name: String = "Header"
  }

  case object Hostname extends TenantProvider {
    def name: String = "Hostname"
  }

  val values: Seq[TenantProvider] =
    Seq(Local, Header, Hostname)

  def apply(name: String): Option[TenantProvider] =
    name.toLowerCase() match {
      case "Local"    => Some(Local)
      case "local"    => Some(Local)
      case "Header"   => Some(Header)
      case "header"   => Some(Header)
      case "Hostname" => Some(Hostname)
      case "hostname" => Some(Hostname)
      case _          => None
    }
}

case class AdminConfig(name: String, email: String, password: String)

case class DataConfig(
    from: Option[String],
    headers: Map[String, String] = Map.empty[String, String]
)

case class InitConfig(host: String, admin: AdminConfig, data: DataConfig)

object InitConfig {
  def apply(configuration: Configuration): InitConfig = {
    val generatedPassword = IdGenerator.token(32)
    InitConfig(
      host = configuration
        .getOptional[String]("daikoku.init.host")
        .getOrElse("localhost"),
      AdminConfig(
        name = configuration
          .getOptional[String]("daikoku.init.admin.name")
          .getOrElse("Daikoku admin"),
        email = configuration
          .getOptional[String]("daikoku.init.admin.email")
          .getOrElse("admin@otoroshi.io"),
        password = configuration
          .getOptional[String]("daikoku.init.admin.password")
          .getOrElse(generatedPassword)
      ),
      DataConfig(
        from = configuration.getOptional[String]("daikoku.init.data.from"),
        headers = configuration
          .getOptional[Map[String, String]]("daikoku.init.data.headers")
          .getOrElse(Map.empty[String, String])
      )
    )
  }
}

sealed trait AdminApiConfig

case class LocalAdminApiConfig(key: String) extends AdminApiConfig

case class OtoroshiAdminApiConfig(claimsHeaderName: String, algo: Algorithm)
    extends AdminApiConfig

object AdminApiConfig {
  def apply(config: Configuration): AdminApiConfig = {
    config.getOptional[String]("daikoku.api.type") match {
      case Some("local") =>
        LocalAdminApiConfig(config.getOptional[String]("daikoku.api.key").get)
      case Some("otoroshi") =>
        OtoroshiAdminApiConfig(
          config.getOptional[String]("daikoku.api.headerName").get,
          Algorithm.HMAC512(
            config.getOptional[String]("daikoku.api.headerSecret").get
          )
        )
      case _ =>
        LocalAdminApiConfig(config.getOptional[String]("daikoku.api.key").get)
    }
  }
}

sealed trait CmsApiConfig

case class LocalCmsApiConfig(key: String) extends CmsApiConfig

case class OtoroshiCmsApiConfig(claimsHeaderName: String, algo: Algorithm)
    extends CmsApiConfig

object CmsApiConfig {
  def apply(config: Configuration): CmsApiConfig = {
    config.getOptional[String]("daikoku.cms.api.type") match {
      case Some("local") =>
        LocalCmsApiConfig(config.getOptional[String]("daikoku.cms.api.key").get)
      case Some("otoroshi") =>
        OtoroshiCmsApiConfig(
          config.getOptional[String]("daikoku.cms.api.headerName").get,
          Algorithm.HMAC512(
            config.getOptional[String]("daikoku.cms.api.headerSecret").get
          )
        )
      case _ =>
        LocalCmsApiConfig(config.getOptional[String]("daikoku.api.key").get)
    }
  }
}

class Config(val underlying: Configuration) {

  lazy val port: Int = underlying
    .getOptional[Int]("play.server.http.port")
    .orElse(underlying.getOptional[Int]("http.port"))
    .getOrElse(9000)

  lazy val exposedPort: Int = underlying
    .getOptional[Int]("daikoku.exposedOn")
    .getOrElse(port)

  lazy val mode: DaikokuMode =
    underlying.getOptional[String]("daikoku.mode").map(_.toLowerCase) match {
      case Some("dev")  => DaikokuMode.Dev
      case Some("test") => DaikokuMode.Test
      case _            => DaikokuMode.Prod
    }

  lazy val secret: String = underlying
    .getOptional[String]("play.http.secret.key")
    .getOrElse("secret")

  lazy val cypherSecret: String = underlying
    .getOptional[String]("daikoku.cypherSecret")
    .getOrElse("cypherSecret")

  lazy val signingKey: String =
    underlying.get[String]("daikoku.signingKey")

  lazy val hmac512Alg: Algorithm = Algorithm.HMAC512(signingKey)

  lazy val tenantJwtAlgo: Algorithm = Algorithm.HMAC512(signingKey)

  lazy val tenantJwtVerifier: JWTVerifier =
    JWT.require(tenantJwtAlgo).acceptLeeway(10).build()

  lazy val isProd: Boolean =
    mode == DaikokuMode.Prod || mode == DaikokuMode.Test
  lazy val isDev: Boolean = mode == DaikokuMode.Dev
  lazy val tenantProvider: TenantProvider = underlying
    .getOptional[String]("daikoku.tenants.provider")
    .flatMap(TenantProvider.apply)
    .getOrElse(TenantProvider.Local)
  lazy val defaultApiKeyVisibility: TeamApiKeyVisibility = underlying
    .getOptional[String]("daikoku.teams.defaultApiKeyVisibility")
    .flatMap(TeamApiKeyVisibility.apply)
    .getOrElse(TeamApiKeyVisibility.User)
  lazy val tenantHostHeaderKey: String = underlying
    .getOptional[String]("daikoku.tenants.hostheaderName")
    .getOrElse("Otoroshi-Proxied-Host")

  lazy val otoroshiSyncInterval: FiniteDuration = underlying
    .getOptional[Long]("daikoku.otoroshi.sync.interval")
    .map(v => v.millis)
    .getOrElse(1.hour)
  lazy val otoroshiSyncMaster: Boolean = underlying
    .getOptional[Boolean]("daikoku.otoroshi.sync.master")
    .getOrElse(
      underlying
        .getOptional[Int]("daikoku.otoroshi.sync.instance")
        .getOrElse(-1) == 0
    )
  lazy val otoroshiSyncByCron: Boolean = underlying
    .getOptional[Boolean]("daikoku.otoroshi.sync.cron")
    .getOrElse(false)
  lazy val otoroshiSyncKey: String = underlying
    .getOptional[String]("daikoku.otoroshi.sync.key")
    .getOrElse("secret")
  lazy val otoroshiGroupNamePrefix: Option[String] =
    underlying.getOptional[String]("daikoku.otoroshi.groups.namePrefix")
  lazy val otoroshiGroupIdPrefix: Option[String] =
    underlying.getOptional[String]("daikoku.otoroshi.groups.idPrefix")

  lazy val apikeysStatsByCron: Boolean =
    underlying.getOptional[Boolean]("daikoku.stats.sync.cron").getOrElse(false)
  lazy val apikeysStatsSyncInterval: FiniteDuration = underlying
    .getOptional[Long]("daikoku.stats.sync.interval")
    .map(v => v.millis)
    .getOrElse(1.hour)
  lazy val apikeysStatsCallInterval: FiniteDuration = underlying
    .getOptional[Long]("daikoku.stats.call.interval")
    .map(v => v.millis)
    .getOrElse(10.minutes)

  lazy val auditTrailPurgeByCron: Boolean = underlying
    .getOptional[Boolean]("daikoku.audit.purge.cron")
    .getOrElse(false)
  lazy val auditTrailPurgeInterval: FiniteDuration = underlying
    .getOptional[FiniteDuration]("daikoku.audit.purge.interval")
    .getOrElse(1 hour)
  lazy val auditTrailPurgeMaxDate: FiniteDuration = underlying
    .getOptional[FiniteDuration]("daikoku.audit.purge.max.date")
    .getOrElse(60 day)

  lazy val deletionByCron: Boolean = underlying
    .getOptional[Boolean]("daikoku.deletion.cron")
    .getOrElse(false)
  lazy val deletionInterval: FiniteDuration = underlying
    .getOptional[FiniteDuration]("daikoku.deletion.interval")
    .getOrElse(30 second)

  lazy val init: InitConfig = InitConfig(underlying)

  lazy val adminApiConfig: AdminApiConfig = AdminApiConfig(underlying)

  lazy val cmsApiConfig: CmsApiConfig = CmsApiConfig(underlying)

  lazy val anonymousReportingUrl: String =
    underlying.get[String]("daikoku.anonymous-reporting.url")
  lazy val anonymousReportingTimeout: Int =
    underlying.get[Int]("daikoku.anonymous-reporting.timeout")
  lazy val anonymousReportingEnabled: Boolean =
    underlying.get[Boolean]("daikoku.anonymous-reporting.enabled")
  lazy val containerized: Boolean =
    underlying.get[Boolean]("daikoku.containerized")
}

sealed trait Env {
  def environment: Environment

  def onStartup(): Unit

  def onShutdown(): Unit

  def snowflakeGenerator: IdGenerator

  def auditActor: ActorRef

  def defaultActorSystem: ActorSystem

  def defaultMaterializer: Materializer

  def defaultExecutionContext: ExecutionContext

  def dataStore: DataStore
  def updateDataStore(newDataStore: DataStore)(implicit
      ec: ExecutionContext
  ): Future[Unit]
  def assetsStore: AssetsDataStore

  def wsClient: WSClient

  def config: Config
  def rawConfiguration: Configuration
  def identityFilters(implicit
      mat: Materializer,
      ec: ExecutionContext
  ): Seq[EssentialFilter]

  def translator: Translator

  def expositionFilters(implicit
      mat: Materializer,
      ec: ExecutionContext
  ): Seq[EssentialFilter]

  def getDaikokuUrl(tenant: Tenant, path: String): String

  def initDatastore(path: Option[String] = None)(implicit
      ec: ExecutionContext
  ): Future[Done]
}

class DaikokuEnv(
    ws: WSClient,
    val environment: Environment,
    configuration: Configuration,
    context: Context,
    messagesApi: MessagesApi,
    interpreter: Translator,
    pgPool: PgPool
) extends Env {

  val actorSystem: ActorSystem = ActorSystem("daikoku")
  implicit val materializer: Materializer =
    Materializer.createMaterializer(actorSystem)
  val snowflakeSeed: Long =
    configuration.getOptional[Long]("daikoku.snowflake.seed").get
  val snowflakeGenerator: IdGenerator = IdGenerator(snowflakeSeed)

  val auditActor: ActorRef =
    actorSystem.actorOf(
      AuditActorSupervizer.props(this, messagesApi, interpreter)
    )

  private val daikokuConfig = new Config(configuration)

  lazy val mongoErrorMessage =
    s"""mongodb is no longer supported,
       |please run Daikoku in v13 to run database migration and then run the actual version""".stripMargin
  private var _dataStore: DataStore =
    configuration.getOptional[String]("daikoku.storage") match {
      case Some("postgres") =>
        new PostgresDataStore(configuration, this, pgPool)
      case Some("mongo") => throw new RuntimeException(mongoErrorMessage)
      case Some(e) =>
        throw new RuntimeException(s"Bad storage value from conf: $e")
      case None => throw new RuntimeException("No storage found from conf")
    }

  private val s3assetsStore =
    new AssetsDataStore(actorSystem)(actorSystem.dispatcher, materializer)

  override def rawConfiguration: Configuration = configuration

  override def defaultExecutionContext: ExecutionContext =
    actorSystem.dispatcher

  override def defaultActorSystem: ActorSystem = actorSystem

  override def defaultMaterializer: Materializer = materializer
  override def dataStore: DataStore = _dataStore
  override def wsClient: WSClient = ws

  override def config: Config = daikokuConfig

  override def translator: Translator = interpreter

  override def assetsStore: AssetsDataStore = s3assetsStore

  override def updateDataStore(
      newDataStore: DataStore
  )(implicit ec: ExecutionContext): Future[Unit] = {
    _dataStore
      .stop()
      .map { _ =>
        _dataStore = newDataStore
      }
  }

  override def initDatastore(
      path: Option[String] = None
  )(implicit ec: ExecutionContext): Future[Done] = {

    def run(isEmpty: Boolean): Future[Unit] = {
      if (isEmpty) {
        (dataStore match {
          case store: PostgresDataStore => store.checkDatabase()
          case _                        => FastFuture.successful(None)
        }).map { _ =>
          path.orElse(config.init.data.from) match {
            case Some(path)
                if path.startsWith("http://") || path
                  .startsWith("https://") =>
              AppLogger.warn(
                s"Main dataStore seems to be empty, importing from http resource $path ..."
              )
              implicit val ec: ExecutionContext = defaultExecutionContext
              implicit val env: DaikokuEnv = this
              wsClient
                .url(path)
                .withHttpHeaders(config.init.data.headers.toSeq: _*)
                .withMethod("GET")
                .withRequestTimeout(10.seconds)
                .get()
                .flatMap {
                  case resp if resp.status == 200 =>
                    dataStore.importFromStream(resp.bodyAsSource)
                  case resp =>
                    FastFuture.failed(
                      new RuntimeException(
                        s"Bad response from $path: ${resp.status} - ${resp.body}"
                      )
                    )
                }
            case Some(path) =>
              AppLogger.warn(
                s"Main dataStore seems to be empty, importing from $path ..."
              )
              implicit val ec: ExecutionContext = defaultExecutionContext
              implicit val env: DaikokuEnv = this

              dataStore.importFromStream(FileIO.fromPath(Paths.get(path)))
            case _ =>
              import fr.maif.otoroshi.daikoku.domain._
              import fr.maif.otoroshi.daikoku.login._
              import fr.maif.otoroshi.daikoku.utils.StringImplicits._
              import org.mindrot.jbcrypt.BCrypt
              import play.api.libs.json._

              import scala.concurrent._

              AppLogger.warn("")
              AppLogger.warn(
                "Main dataStore seems to be empty, generating initial data ..."
              )
              val userId = UserId(IdGenerator.token(32))
              val adminApiDefaultTenantId =
                ApiId(s"admin-api-tenant-${Tenant.Default.value}")
              val cmsApiDefaultTenantId =
                ApiId(s"cms-api-tenant-${Tenant.Default.value}")
              val defaultAdminTeam = Team(
                id = TeamId(IdGenerator.token),
                tenant = Tenant.Default,
                `type` = TeamType.Admin,
                name = s"default-admin-team",
                description = s"The admin team for the default tenant",
                avatar = Some(
                  s"https://www.gravatar.com/avatar/${"default-tenant".md5}?size=128&d=robohash"
                ),
                users = Set(UserWithPermission(userId, Administrator)),
                authorizedOtoroshiEntities = None,
                contact = "no-replay@daikoku.io"
              )

              val tenant = Tenant(
                id = Tenant.Default,
                name = "Daikoku Default Tenant",
                domain = config.init.host,
                defaultLanguage = Some("En"),
                style = Some(
                  DaikokuStyle(
                    title = "Daikoku Default Tenant"
                  )
                ),
                contact = "contact@foo.bar",
                mailerSettings = Some(ConsoleMailerSettings()),
                authProvider = AuthProvider.Local,
                authProviderSettings = Json.obj(
                  "sessionMaxAge" -> 86400
                ),
                bucketSettings = None,
                otoroshiSettings = Set(),
                adminApi = adminApiDefaultTenantId
              )

              val (adminApiDefaultTenant, adminApiDefaultPlan) =
                ApiTemplate.adminApi(defaultAdminTeam, tenant)
              val (cmsApi, cmsPlan) =
                ApiTemplate.cmsApi(defaultAdminTeam, tenant)

              val team = Team(
                id = TeamId(IdGenerator.token(32)),
                tenant = tenant.id,
                `type` = TeamType.Personal,
                name = s"${config.init.admin.name}",
                description = s"${config.init.admin.name}'s team",
                users = Set(UserWithPermission(userId, Administrator)),
                authorizedOtoroshiEntities = None,
                contact = "admin@daikoku.io"
              )
              val user = User(
                id = userId,
                tenants = Set(tenant.id),
                origins = Set(AuthProvider.Otoroshi),
                name = config.init.admin.name,
                email = config.init.admin.email,
                picture = config.init.admin.email.gravatar,
                isDaikokuAdmin = true,
                lastTenant = Some(tenant.id),
                password = Some(
                  BCrypt.hashpw(config.init.admin.password, BCrypt.gensalt())
                ),
                personalToken = Some(IdGenerator.token(32)),
                defaultLanguage = None
              )
              for {
                _ <- Future.sequence(
                  evolutions.list.map(e =>
                    dataStore.evolutionRepo.save(
                      Evolution(
                        id = DatastoreId(IdGenerator.token(32)),
                        version = e.version,
                        applied = true
                      )
                    )
                  )
                )
                _ <- dataStore.tenantRepo.save(tenant)
                _ <- dataStore.teamRepo.forTenant(tenant.id).save(team)
                _ <-
                  dataStore.teamRepo
                    .forTenant(tenant.id)
                    .save(defaultAdminTeam)
                _ <-
                  dataStore.apiRepo
                    .forTenant(tenant.id)
                    .save(adminApiDefaultTenant)
                _ <-
                  dataStore.usagePlanRepo
                    .forTenant(tenant.id)
                    .save(adminApiDefaultPlan)
                _ <-
                  dataStore.apiRepo
                    .forTenant(tenant.id)
                    .save(cmsApi)
                _ <-
                  dataStore.usagePlanRepo
                    .forTenant(tenant.id)
                    .save(cmsPlan)
                _ <- dataStore.userRepo.save(user)
              } yield {
                AppLogger.warn("")
                AppLogger.warn(
                  s"You can log in with admin@daikoku.io / ${config.init.admin.password}"
                )
                AppLogger.warn("")
                AppLogger.warn(
                  "Please avoid using the default tenant for anything else than configuring Daikoku"
                )
                AppLogger.warn("")
              }

          }
        }
      } else {
        dataStore match {
          case store: PostgresDataStore => store.checkDatabase()
          case _                        => FastFuture.successful(None)
        }
      }
    }

    for {
      isEmpty <- dataStore.isEmpty()
      _ <- run(isEmpty)
      done <- evolutions.run(dataStore, new OtoroshiClient(this))
    } yield {
      done
    }
  }

  override def onStartup(): Unit = {

    implicit val ec: ExecutionContext = defaultExecutionContext

    dataStore.start()

    Source
      .tick(1.second, 5.seconds, ())
      .mapAsync(1) { _ =>
        initDatastore().transform {
          case Success(_) => Success(true)
          case Failure(_) => Success(false)
        }
      }
      .filter(v => v)
      .take(1)
      .toMat(Sink.ignore)(Keep.right)
      .run()(materializer)
      .map(_ => {
        dataStore.reportsInfoRepo.count().map {
          case 0 =>
            dataStore.reportsInfoRepo.save(
              ReportsInfo(id = DatastoreId(IdGenerator.uuid), activated = false)
            )
        }
      })
  }

  override def onShutdown(): Unit = {
    AppLogger.debug("onShutdown called")
    implicit val ec: ExecutionContext = defaultExecutionContext
    dataStore.stop()
    auditActor ! PoisonPill
    Await.result(actorSystem.terminate(), 20.seconds)
  }

  def identityFilters(implicit
      mat: Materializer,
      ec: ExecutionContext
  ): Seq[EssentialFilter] =
    Seq(new LoginFilter(this)(mat, ec))

  def expositionFilters(implicit
      mat: Materializer,
      ec: ExecutionContext
  ): Seq[EssentialFilter] =
    configuration.getOptional[String]("daikoku.exposition.provider") match {
      case Some("otoroshi") =>
        Seq(
          new OtoroshiExpositionFilter(
            configuration
              .get[String]("daikoku.exposition.otoroshi.stateHeaderName"),
            configuration
              .get[String]("daikoku.exposition.otoroshi.stateRespHeaderName"),
            this
          )(mat, ec)
        )
      case _ => Seq.empty
    }

  def getDaikokuUrl(tenant: Tenant, path: String): String =
    config.exposedPort match {
      case 80  => s"http://${tenant.domain}$path"
      case 443 => s"https://${tenant.domain}$path"
      case _   => s"http://${tenant.domain}:${config.exposedPort}$path"
    }
}
