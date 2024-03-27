package fr.maif.otoroshi.daikoku

import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.Materializer
import com.softwaremill.macwire._
import controllers.{Assets, AssetsComponents}
import fr.maif.otoroshi.daikoku.actions.{
  DaikokuAction,
  DaikokuActionMaybeWithGuest,
  DaikokuActionMaybeWithoutUser,
  DaikokuTenantAction
}
import fr.maif.otoroshi.daikoku.ctrls._
import fr.maif.otoroshi.daikoku.env._
import fr.maif.otoroshi.daikoku.modules.DaikokuComponentsInstances
import fr.maif.otoroshi.daikoku.utils.RequestImplicits._
import fr.maif.otoroshi.daikoku.utils.admin._
import fr.maif.otoroshi.daikoku.utils.{
  ApiService,
  DeletionService,
  Errors,
  OtoroshiClient,
  Translator
}
import io.vertx.core.Vertx
import io.vertx.core.buffer.Buffer
import io.vertx.core.net.{PemKeyCertOptions, PemTrustOptions}
import io.vertx.pgclient.{PgConnectOptions, PgPool, SslMode}
import io.vertx.sqlclient.PoolOptions
import jobs.{ApiKeyStatsJob, AuditTrailPurgeJob, QueueJob, OtoroshiVerifierJob}
import play.api.ApplicationLoader.Context
import play.api._
import play.api.http.{DefaultHttpFilters, HttpErrorHandler}
import play.api.i18n.{I18nSupport, Langs}
import play.api.libs.ws.ahc.AhcWSComponents
import play.api.mvc._
import play.api.routing.Router
import router.Routes

import java.security.SecureRandom
import java.util.regex.Pattern
import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.CollectionConverters.{IterableHasAsScala, MapHasAsJava}

class DaikokuLoader extends ApplicationLoader {
  def load(context: Context): Application = {
    LoggerConfigurator(context.environment.classLoader).foreach {
      _.configure(context.environment, context.initialConfiguration, Map.empty)
    }
    new DaikokuComponentsInstances(context).application
  }
}

package object modules {

  class DaikokuComponentsInstances(context: Context)
      extends BuiltInComponentsFromContext(context)
      with AssetsComponents
      with AhcWSComponents
      with I18nSupport {

    implicit lazy val env: Env = wire[DaikokuEnv]

    lazy val verifier = wire[OtoroshiVerifierJob]
    lazy val deletor = wire[QueueJob]
    lazy val statsJob = wire[ApiKeyStatsJob]
    lazy val auditTrailPurgeJob = wire[AuditTrailPurgeJob]

    lazy val otoroshiClient = wire[OtoroshiClient]
    lazy val paymentClient = wire[PaymentClient]

    lazy val apiService = wire[ApiService]
    lazy val deletionService = wire[DeletionService]

    lazy val translator = wire[Translator]

    override lazy val httpFilters: Seq[EssentialFilter] = Seq(
      new SecurityFilter(env)
    ) ++ env.expositionFilters ++ env.identityFilters

    lazy val filters = new DefaultHttpFilters(httpFilters: _*)

    override lazy val httpErrorHandler: HttpErrorHandler = wire[ErrorHandler]

    val mesessagesApi = messagesApi
    val daikokuAction = wire[DaikokuAction]
    val daikokuTenantAction = wire[DaikokuTenantAction]
    val daikokuTenantActionMaybeWithGuest = wire[DaikokuActionMaybeWithGuest]
    val daikokuActionMaybeWithoutUser = wire[DaikokuActionMaybeWithoutUser]
    val daikokuApiAction = wire[DaikokuApiAction]
    val daikokuApiActionWithoutTenant = wire[DaikokuApiActionWithoutTenant]

    lazy val homeController = wire[HomeController]
    lazy val mockController = wire[MockController]
    lazy val apiController = wire[ApiController]
    lazy val loginController = wire[LoginController]
    lazy val teamController = wire[TeamController]
    lazy val notificationController = wire[NotificationController]
    lazy val tenantController = wire[TenantController]
    lazy val otoSettingsController = wire[OtoroshiSettingsController]
    lazy val usersController = wire[UsersController]
    lazy val auditTrailController = wire[AuditTrailController]
    lazy val entitiesController = wire[EntitiesController]
    lazy val sessionController = wire[SessionController]
    lazy val jobsController = wire[JobsController]
    lazy val consumptionController = wire[ConsumptionController]
    lazy val teamAssetsController = wire[TeamAssetsController]
    lazy val tenantAssetsController = wire[TenantAssetsController]
    lazy val userAssetsController = wire[UserAssetsController]
    lazy val assetsThumbnailController = wire[AssetsThumbnailController]
    lazy val stateController = wire[StateController]
    lazy val stateAdminApiController = wire[StateAdminApiController]
    lazy val tenantAdminApiController = wire[TenantAdminApiController]
    lazy val userAdminApiController = wire[UserAdminApiController]
    lazy val teamAdminApiController = wire[TeamAdminApiController]
    lazy val apiAdminApiController = wire[ApiAdminApiController]
    lazy val apiSubscriptionAdminApiController =
      wire[ApiSubscriptionAdminApiController]
    lazy val apiDocumentationPageAdminApiController =
      wire[ApiDocumentationPageAdminApiController]
    lazy val notificationAdminApiController =
      wire[NotificationAdminApiController]
    lazy val userSessionAdminApiController = wire[UserSessionAdminApiController]
    lazy val apiKeyConsumptionAdminApiController =
      wire[ApiKeyConsumptionAdminApiController]
    lazy val auditEventAdminApiController = wire[AuditEventAdminApiController]
    lazy val integrationApiController = wire[IntegrationApiController]
    lazy val translationController = wire[TranslationController]
    lazy val adminApiSwaggerController = wire[AdminApiSwaggerController]
    lazy val credentialsAdminApiController = wire[CredentialsAdminApiController]
    lazy val messageController = wire[MessageController]
    lazy val messagesAdminApiController = wire[MessagesAdminApiController]
    lazy val postsAdminApiController = wire[PostsAdminApiController]
    lazy val issuesAdminApiController = wire[IssuesAdminApiController]
    lazy val cmsPagesAdminApiController = wire[CmsPagesAdminApiController]
    lazy val translationsAdminApiController =
      wire[TranslationsAdminApiController]
    lazy val usagePlansAdminApiController = wire[UsagePlansAdminApiController]
    lazy val subscriptionDemandsAdminApiController =
      wire[SubscriptionDemandsAdminApiController]
    lazy val graphQLController = wire[GraphQLController]

    override lazy val assets: Assets = wire[Assets]
    lazy val router: Router = {
      val prefix: String = "/"
      wire[Routes]
    }

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
            "search_path" -> configuration
              .get[String]("daikoku.postgres.schema")
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
    lazy val pgPool = PgPool.pool(Vertx.vertx, options, poolOptions)

//    statsJob.start()
    deletor.start()
    verifier.start()
    auditTrailPurgeJob.start()

    env.onStartup()

    applicationLifecycle.addStopHook { () =>
      deletor.stop()
      verifier.stop()
      statsJob.stop()
      auditTrailPurgeJob.stop()
      env.onShutdown()
      pgPool.close()
      FastFuture.successful(())
    }
  }

  private class ErrorHandler(env: Env) extends HttpErrorHandler {

    implicit val ec: ExecutionContext = env.defaultExecutionContext

    lazy val logger = Logger("daikoku-error-handler")

    def onClientError(request: RequestHeader, statusCode: Int, mess: String) = {
      val uuid =
        java.util.UUID.nameUUIDFromBytes(new SecureRandom().generateSeed(16))
      val message =
        Option(mess).filterNot(_.trim.isEmpty).getOrElse("An error occured")
      val errorMessage =
        s"Client Error [$uuid]: $message on ${request.relativeUri} ($statusCode)"

      logger.error(errorMessage)
      Errors.craftResponseResult(
        errorMessage,
        Results.Status(statusCode),
        request,
        Some("errors.client.error"),
        env
      )
    }

    def onServerError(request: RequestHeader, exception: Throwable) = {
      val uuid =
        java.util.UUID.nameUUIDFromBytes(new SecureRandom().generateSeed(16))

      logger.error(
        s"Server Error [$uuid]: ${exception.getMessage} on ${request.relativeUri}",
        exception
      )
      Errors.craftResponseResult(
        s"Server Error: $uuid",
        Results.InternalServerError,
        request,
        Some("errors.server.error"),
        env
      )
    }
  }

  private class SecurityFilter(env: Env)(implicit
      val mat: Materializer,
      ec: ExecutionContext
  ) extends Filter {
    val regex = Pattern.compile("\\/api\\/apis\\/.*\\/pages\\/.*\\/content")
    def apply(
        nextFilter: RequestHeader => Future[Result]
    )(request: RequestHeader): Future[Result] = {
      nextFilter(request).map { result =>
        env.config.mode match {
          case DaikokuMode.Dev  => result
          case DaikokuMode.Test => result
          case DaikokuMode.Prod
              if regex.matcher(request.relativeUri).find() => {
            result.withHeaders(
              "Content-Security-Policy" -> "default-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net localhost:3000 blob:; img-src * data: blob:; font-src 'self' https://*; connect-src *",
              "X-XSS-Protection" -> "1 ; mode=block",
              "X-Content-Type-Options" -> "nosniff"
            )
          }
          case DaikokuMode.Prod
              if request.relativeUri.startsWith("/team-assets/") => {
            result.withHeaders(
              "Content-Security-Policy" -> "default-src 'self' 'unsafe-inline'; img-src * data: blob:; font-src 'self' https://*",
              "X-XSS-Protection" -> "1 ; mode=block",
              "X-Content-Type-Options" -> "nosniff"
            )
          }
          case DaikokuMode.Prod
              if request.relativeUri.startsWith("/tenant-assets/") => {
            result.withHeaders(
              "Content-Security-Policy" -> "default-src 'self' 'unsafe-inline'; img-src * data: blob:; font-src 'self' https://*",
              "X-XSS-Protection" -> "1 ; mode=block",
              "X-Content-Type-Options" -> "nosniff"
            )
          }
          case DaikokuMode.Prod
              if request.relativeUri.startsWith("/user-assets/") => {
            result.withHeaders(
              "Content-Security-Policy" -> "default-src 'self' 'unsafe-inline'; img-src * data: blob:; font-src 'self' https://*",
              "X-XSS-Protection" -> "1 ; mode=block",
              "X-Content-Type-Options" -> "nosniff"
            )
          }
          case DaikokuMode.Prod => {
            result.withHeaders(
              "Content-Security-Policy" -> "default-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net localhost:3000 blob:; img-src * data: blob:; font-src 'self' https://*; connect-src *",
              "X-XSS-Protection" -> "1 ; mode=block",
              "X-Content-Type-Options" -> "nosniff",
              "X-Frame-Options" -> "sameorigin"
            )
          }
        }
      }
    }
  }
}
