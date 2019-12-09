package fr.maif.otoroshi.daikoku.env

import java.nio.file.Paths
import java.util.concurrent.atomic.AtomicReference

import akka.actor.{ActorRef, ActorSystem, Cancellable, PoisonPill}
import akka.http.scaladsl.util.FastFuture
import akka.stream.scaladsl.{FileIO, Framing, Keep, Sink, Source}
import akka.stream.{ActorMaterializer, Materializer}
import akka.util.ByteString
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import fr.maif.otoroshi.daikoku.audit.AuditActorSupervizer
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain.Tenant
import fr.maif.otoroshi.daikoku.login.LoginFilter
import fr.maif.otoroshi.daikoku.utils._
import play.api.libs.ws.WSClient
import play.api.Logger
import play.api.libs.json.{JsObject, JsValue, Json}
import play.api.mvc.EssentialFilter
import play.api.{Configuration, Environment}
import play.modules.reactivemongo.ReactiveMongoApi
import storage.{DataStore, MongoDataStore}

import scala.concurrent.{Await, ExecutionContext, Future}
import scala.concurrent.duration.{FiniteDuration, _}
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
  def apply(name: String): Option[TenantProvider] = name.toLowerCase() match {
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

case class DataConfig(from: Option[String],
                      headers: Map[String, String] = Map.empty[String, String])

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
          .getOrElse("Super admin"),
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
            config.getOptional[String]("daikoku.api.headerSecret").get)
        )
      case _ =>
        LocalAdminApiConfig(config.getOptional[String]("daikoku.api.key").get)
    }
  }
}

class Config(val underlying: Configuration) {

  lazy val port = underlying
    .getOptional[Int]("play.server.http.port")
    .orElse(underlying.getOptional[Int]("http.port"))
    .getOrElse(9000)

  lazy val exposedPort = underlying
    .getOptional[Int]("daikoku.exposedOn")
    .getOrElse(port)

  lazy val mode: DaikokuMode =
    underlying.getOptional[String]("daikoku.mode").map(_.toLowerCase) match {
      case Some("dev") => DaikokuMode.Dev
      case _           => DaikokuMode.Prod
    }

  lazy val secret = underlying
    .getOptional[String]("play.http.secret.key")
    .getOrElse("secret")

  lazy val signingKey: String =
    underlying.get[String]("daikoku.signingKey")

  lazy val hmac512Alg = Algorithm.HMAC512(signingKey)

  lazy val tenantJwtAlgo = Algorithm.HMAC512(signingKey)

  lazy val tenantJwtVerifier = JWT.require(tenantJwtAlgo).build()

  lazy val isProd = mode == DaikokuMode.Prod
  lazy val isDev = mode == DaikokuMode.Dev
  lazy val tenantProvider = underlying
    .getOptional[String]("daikoku.tenants.provider")
    .flatMap(TenantProvider.apply)
    .getOrElse(TenantProvider.Local)

  lazy val otoroshiSyncInterval: FiniteDuration = underlying
    .getOptional[Long]("daikoku.otoroshi.sync.interval")
    .map(v => v.millis)
    .getOrElse(1.hour)
  lazy val otoroshiSyncMaster = underlying
    .getOptional[Boolean]("daikoku.otoroshi.sync.master")
    .getOrElse(
      underlying
        .getOptional[Int]("daikoku.otoroshi.sync.instance")
        .getOrElse(-1) == 0
    )
  lazy val otoroshiSyncByCron = underlying
    .getOptional[Boolean]("daikoku.otoroshi.sync.cron")
    .getOrElse(false)
  lazy val otoroshiSyncKey = underlying
    .getOptional[String]("daikoku.otoroshi.sync.key")
    .getOrElse("secret")
  lazy val otoroshiGroupNamePrefix: Option[String] =
    underlying.getOptional[String]("daikoku.otoroshi.groups.namePrefix")
  lazy val otoroshiGroupIdPrefix: Option[String] =
    underlying.getOptional[String]("daikoku.otoroshi.groups.idPrefix")

  lazy val apikeysStatsByCron =
    underlying.getOptional[Boolean]("daikoku.stats.sync.cron").getOrElse(false)
  lazy val apikeysStatsSyncInterval: FiniteDuration = underlying
    .getOptional[Long]("daikoku.stats.sync.interval")
    .map(v => v.millis)
    .getOrElse(1.hour)
  lazy val apikeysStatsCallInterval: FiniteDuration = underlying
    .getOptional[Long]("daikoku.stats.call.interval")
    .map(v => v.millis)
    .getOrElse(10.minutes)

  lazy val init: InitConfig = InitConfig(underlying)

  lazy val adminApiConfig: AdminApiConfig = AdminApiConfig(underlying)
}

sealed trait Env {
  def environment: Environment
  def onStartup(): Unit
  def onShutdown(): Unit
  def snowflakeGenerator: IdGenerator
  def auditActor: ActorRef
  def defaultActorSystem: ActorSystem
  def defaultMaterializer: ActorMaterializer
  def defaultExecutionContext: ExecutionContext
  def dataStore: DataStore
  def assetsStore: AssetsDataStore
  def wsClient: WSClient
  def config: Config
  def identityFilters(implicit mat: Materializer,
                      ec: ExecutionContext): Seq[EssentialFilter]
  def expositionFilters(implicit mat: Materializer,
                        ec: ExecutionContext): Seq[EssentialFilter]
}

class DaikokuEnv(ws: WSClient,
                 val environment: Environment,
                 configuration: Configuration,
                 reactiveMongoApi: ReactiveMongoApi)
    extends Env {

  val logger = Logger("DaikokuEnv")

  val actorSystem = ActorSystem("daikoku")
  val materializer = ActorMaterializer.create(actorSystem)
  val snowflakeSeed =
    configuration.getOptional[Long]("daikoku.snowflake.seed").get
  val snowflakeGenerator = IdGenerator(snowflakeSeed)

  val auditActor = actorSystem.actorOf(AuditActorSupervizer.props(this))

  private val daikokuConfig = new Config(configuration)
  private val mongoDataStore = new MongoDataStore(this, reactiveMongoApi)
  private val s3assetsStore =
    new AssetsDataStore(actorSystem)(actorSystem.dispatcher, materializer)

  override def defaultExecutionContext: ExecutionContext =
    actorSystem.dispatcher
  override def defaultActorSystem: ActorSystem = actorSystem
  override def defaultMaterializer: ActorMaterializer = materializer
  override def dataStore: DataStore = mongoDataStore
  override def wsClient: WSClient = ws
  override def config: Config = daikokuConfig
  override def assetsStore: AssetsDataStore = s3assetsStore

  override def onStartup(): Unit = {

    import fr.maif.otoroshi.daikoku.domain.json._

    implicit val ec: ExecutionContext = defaultExecutionContext

    def tryToInitDatastore(): Future[Unit] = {
      dataStore.isEmpty().map {
        case true =>
          config.init.data.from match {
            case Some(path)
                if path.startsWith("http://") || path
                  .startsWith("https://") => {
              logger.warn("")
              logger.warn(
                s"Main dataStore seems to be empty, importing from ${path} ...")
              implicit val ec = defaultExecutionContext
              implicit val mat = defaultMaterializer
              implicit val env = this
              val initialDataFu = wsClient
                .url(path)
                .withHttpHeaders(config.init.data.headers.toSeq: _*)
                .withMethod("GET")
                .withRequestTimeout(10.seconds)
                .get()
                .flatMap {
                  case resp if resp.status == 200 =>
                    dataStore.importFromStream(resp.bodyAsSource)
                  case resp =>
                    FastFuture.failed(new RuntimeException(
                      s"Bad response from ${path}: ${resp.status} - ${resp.body}"))
                }
              Await.result(initialDataFu, 10 seconds)
            }
            case Some(path) => {
              logger.warn("")
              logger.warn(
                s"Main dataStore seems to be empty, importing from ${path} ...")
              implicit val ec = defaultExecutionContext
              implicit val mat = defaultMaterializer
              implicit val env = this
              val initialDataFu =
                dataStore.importFromStream(FileIO.fromPath(Paths.get(path)))
              Await.result(initialDataFu, 10 seconds)
            }
            case _ => {

              import fr.maif.otoroshi.daikoku.domain._
              import fr.maif.otoroshi.daikoku.login._
              import fr.maif.otoroshi.daikoku.utils.StringImplicits._
              import play.api.libs.json._
              import reactivemongo.bson.BSONObjectID
              import scala.concurrent._
              import org.mindrot.jbcrypt.BCrypt

              logger.warn("")
              logger.warn(
                "Main dataStore seems to be empty, generating initial data ...")
              val userId = UserId(BSONObjectID.generate().stringify)
              val tenant = Tenant(
                id = Tenant.Default,
                deleted = false,
                enabled = true,
                name = "Daikoku Default Tenant",
                domain = config.init.host,
                defaultLanguage = Some("En"),
                style = Some(
                  DaikokuStyle(
                    title = "Daikoku Default Tenant"
                  )),
                mailerSettings = Some(ConsoleMailerSettings()),
                authProvider = AuthProvider.Local,
                authProviderSettings = Json.obj(
                  "sessionMaxAge" -> 86400
                ),
                bucketSettings = None,
                otoroshiSettings = Set()
              )
              val team = Team(
                id = TeamId(BSONObjectID.generate().stringify),
                tenant = tenant.id,
                `type` = TeamType.Personal,
                name = s"${config.init.admin.name}",
                description = s"${config.init.admin.name}'s team",
                users = Set(UserWithPermission(userId, Administrator)),
                subscriptions = Seq.empty,
                authorizedOtoroshiGroups = Set.empty
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
                  BCrypt.hashpw(config.init.admin.password, BCrypt.gensalt())),
                personalToken = Some(IdGenerator.token(32)),
                defaultLanguage = None
              )

              val initialDataFu = for {
                _ <- dataStore.tenantRepo.save(tenant)
                _ <- dataStore.teamRepo.forTenant(tenant.id).save(team)
                _ <- dataStore.userRepo.save(user)
              } yield ()

              Await.result(initialDataFu, 10 seconds)
              logger.warn("")
              logger.warn(
                s"You can log in with admin@daikoku.io / ${config.init.admin.password}")
              logger.warn("")
              logger.warn(
                "Please avoid using the default tenant for anything else than configuring Daikoku")
              logger.warn("")
            }
          }
        case false =>
      }
    }

    mongoDataStore.start()

    Source
      .tick(1.second, 5.seconds, ())
      .mapAsync(1) { _ =>
        tryToInitDatastore().transform {
          case Success(_) => Success(true)
          case Failure(e) => Success(false)
        }
      }
      .filter(v => v)
      .take(1)
      .toMat(Sink.ignore)(Keep.right)
      .run()(materializer)
  }

  override def onShutdown(): Unit = {
    implicit val ec: ExecutionContext = defaultExecutionContext
    mongoDataStore.stop()
    auditActor ! PoisonPill
    Await.result(actorSystem.terminate(), 20.seconds)
  }

  def identityFilters(implicit mat: Materializer,
                      ec: ExecutionContext): Seq[EssentialFilter] =
    Seq(new LoginFilter(this)(mat, ec))

  def expositionFilters(implicit mat: Materializer,
                        ec: ExecutionContext): Seq[EssentialFilter] =
    configuration.getOptional[String]("daikoku.exposition.provider") match {
      case Some("otoroshi") =>
        Seq(
          new OtoroshiExpositionFilter(
            configuration.get[String](
              "daikoku.exposition.otoroshi.stateHeaderName"),
            configuration.get[String](
              "daikoku.exposition.otoroshi.stateRespHeaderName"),
            this
          )(mat, ec)
        )
      case _ => Seq.empty
    }
}
