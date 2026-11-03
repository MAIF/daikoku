package fr.maif.daikoku.env

import com.typesafe.config.ConfigFactory
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.storage.drivers.postgres.PostgresDataStore
import fr.maif.daikoku.storage.drivers.postgres.pgimplicits.*
import fr.maif.daikoku.utils.Translator
import io.vertx.core.Vertx
import io.vertx.pgclient.{PgBuilder, PgConnectOptions}
import io.vertx.sqlclient.{PoolOptions, Tuple}
import org.apache.pekko.actor.CoordinatedShutdown
import org.scalatestplus.play.PlaySpec
import play.api.ApplicationLoader.Context
import play.api.i18n.I18nComponents
import play.api.libs.json.{JsObject, Json}
import play.api.libs.ws.ahc.AhcWSComponents
import play.api.routing.Router
import play.api.{BuiltInComponentsFromContext, Configuration, Environment}

import java.util.UUID
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.concurrent.duration.*
import scala.jdk.CollectionConverters.*

class DatastoreUpgradeSpec extends PlaySpec {
  private given ExecutionContext = ExecutionContext.global

  private def assertNoDeletedColumns(env: DaikokuEnv): Future[Unit] =
    env.dataStore
      .queryRaw(
        """SELECT jsonb_build_object('table', table_name) AS content
        |FROM information_schema.columns
        |WHERE table_schema = $1 AND column_name = '_deleted'""".stripMargin,
        "content",
        Seq(env.rawConfiguration.get[String]("daikoku.postgres.schema"))
      )
      .map(columns => columns mustBe empty)

  private def withLegacyDatabase(test: DaikokuEnv => Future[Unit]): Unit = {
    val schema = s"upgrade_${UUID.randomUUID().toString.replace("-", "")}"
    val configuration = Configuration(
      "daikoku.postgres.schema" -> schema,
      "daikoku.init.admin.password" -> "synthetic-initial-password"
    )
      .withFallback(Configuration(ConfigFactory.load()))
    val context = Context
      .create(Environment.simple())
      .copy(initialConfiguration = configuration)
    val components = new BuiltInComponentsFromContext(context)
      with AhcWSComponents
      with I18nComponents {
      override def router: Router = Router.empty
      override def httpFilters = Seq.empty
    }
    val vertx = Vertx.vertx()
    val options = new PgConnectOptions()
      .setHost(configuration.get[String]("daikoku.postgres.host"))
      .setPort(configuration.get[Int]("daikoku.postgres.port"))
      .setDatabase(configuration.get[String]("daikoku.postgres.database"))
      .setUser(configuration.get[String]("daikoku.postgres.username"))
      .setPassword(configuration.get[String]("daikoku.postgres.password"))
      .setProperties(Map("search_path" -> schema).asJava)
    val pool = PgBuilder
      .pool()
      .`with`(new PoolOptions().setMaxSize(4))
      .connectingTo(options)
      .using(vertx)
      .build()
    val env = new DaikokuEnv(
      components.wsClient,
      components.environment,
      configuration,
      context,
      components.messagesApi,
      new Translator,
      pool
    )
    val store = env.dataStore match {
      case postgres: PostgresDataStore => postgres
      case _ => fail("This upgrade requires PostgreSQL")
    }

    def execute(sql: String): Future[Unit] =
      pool.query(sql).execute().scala.map(_ => ())

    def insert(table: String, content: JsObject): Future[Unit] =
      pool
        .preparedQuery(
          s"INSERT INTO $table (_id, _deleted, content) VALUES ($$1, false, $$2::jsonb)"
        )
        .execute(
          Tuple.of(
            (content \ "_id").as[String],
            new io.vertx.core.json.JsonObject(Json.stringify(content))
          )
        )
        .scala
        .map(_ => ())

    val legacyTables = Seq(
      "tenants",
      "password_reset",
      "account_creation",
      "teams",
      "apis",
      "translations",
      "api_subscriptions",
      "api_documentation_pages",
      "notifications",
      "consumptions",
      "users",
      "api_posts",
      "api_issues",
      "cmspages",
      "operations",
      "email_verifications",
      "subscription_demands",
      "step_validators",
      "usage_plans",
      "assets",
      "reports_info",
      "api_subscription_transfers",
      "job_informations"
    )
    val appliedVersions = Seq(
      "1.0.2",
      "1.5.0",
      "1.5.1",
      "1.5.5",
      "1.5.7",
      "1.5.7_b",
      "1.5.7_c",
      "16.1.2_a",
      "16.1.2_b",
      "16.1.2_c",
      "16.1.3",
      "16.1.3_b",
      "16.3.0",
      "16.3.4",
      "17.5.0",
      "18.2.0",
      "18.3.0",
      "18.4.0",
      "18.4.0_b",
      "18.4.0_c",
      "1.6.0",
      "18.9.2",
      "18.11.0",
      "18.11.0_b"
    )

    try {
      Await.result(
        for {
          _ <- execute(s"CREATE SCHEMA $schema")
          _ <- store.createDatabase()
          _ <- execute("DROP TABLE keyrings")
          _ <- legacyTables.foldLeft(Future.successful(())) {
            (previous, table) =>
              previous.flatMap(_ =>
                execute(s"ALTER TABLE $table ADD COLUMN _deleted boolean")
              )
          }
          _ <- appliedVersions.foldLeft(Future.successful(())) {
            (previous, version) =>
              previous.flatMap(_ =>
                env.dataStore.evolutionRepo
                  .save(
                    Evolution(
                      DatastoreId(s"legacy-$version"),
                      version,
                      applied = true
                    )
                  )
                  .map(_ => ())
              )
          }
          _ <- insert("tenants", Json.obj("_id" -> "upgrade-tenant"))
          _ <- insert(
            "apis",
            Json.obj(
              "_id" -> "legacy-api",
              "name" -> "Legacy API",
              "possibleUsagePlans" -> Json.arr("legacy-plan")
            )
          )
          _ <- insert(
            "usage_plans",
            Json.obj("_id" -> "legacy-plan", "customName" -> "Legacy plan")
          )
          _ <- insert(
            "api_subscriptions",
            Json.obj(
              "_id" -> "legacy-subscription",
              "_tenant" -> "upgrade-tenant",
              "team" -> "legacy-team",
              "api" -> "legacy-api",
              "plan" -> "legacy-plan",
              "by" -> "legacy-user",
              "createdAt" -> 123456789L,
              "apiKey" -> Json.obj(
                "clientId" -> "legacy-client",
                "clientSecret" -> "synthetic-secret",
                "clientName" -> "Legacy key"
              ),
              "integrationToken" -> "synthetic-integration-token"
            )
          )
          _ <- test(env)
        } yield (),
        30.seconds
      )
    } finally {
      try
        Await.result(
          execute(s"DROP SCHEMA IF EXISTS $schema CASCADE"),
          10.seconds
        )
      finally {
        env.onShutdown()
        Await.result(pool.close().scala, 10.seconds)
        Await.result(vertx.close().scala, 10.seconds)
        Await.result(
          CoordinatedShutdown(components.actorSystem)
            .run(CoordinatedShutdown.UnknownReason),
          10.seconds
        )
      }
    }
  }

  "Datastore initialization" should {
    "upgrade a pre-keyring database while preserving subscriptions and credentials" in {
      withLegacyDatabase { env =>
        for {
          _ <- env.initDatastore()
          subscription <- env.dataStore.apiSubscriptionRepo
            .forTenant(TenantId("upgrade-tenant"))
            .findById(ApiSubscriptionId("legacy-subscription"))
          keyring <- env.dataStore.keyringRepo
            .forTenant(TenantId("upgrade-tenant"))
            .findById(KeyringId("legacy-subscription"))
        } yield {
          subscription.get.keyring mustBe KeyringId("legacy-subscription")
          keyring.get.apiKey mustBe OtoroshiApiKey(
            clientName = "Legacy key",
            clientId = "legacy-client",
            clientSecret = "synthetic-secret"
          )
          keyring.get.integrationToken mustBe "synthetic-integration-token"
        }
      }
    }

    "keep the final schema unchanged on a second initialization" in {
      withLegacyDatabase { env =>
        for {
          _ <- env.initDatastore()
          _ <- assertNoDeletedColumns(env)
          _ <- env.initDatastore()
          _ <- assertNoDeletedColumns(env)
          keyrings <- env.dataStore.keyringRepo
            .forTenant(TenantId("upgrade-tenant"))
            .findAll()
        } yield keyrings.map(_.id) mustBe Seq(KeyringId("legacy-subscription"))
      }
    }

    "purge legacy tombstones without overriding existing deletion flags" in {
      withLegacyDatabase { env =>
        for {
          _ <- env.dataStore.userRepo.execute(
            """CREATE TABLE keyrings (_id text PRIMARY KEY, content jsonb);
            |""".stripMargin
          )
          _ <- env.dataStore.keyringRepo
            .forAllTenant()
            .saveRaw(
              "deleted-keyring",
              Json.obj("_id" -> "deleted-keyring", "_deleted" -> true)
            )
          _ <- env.dataStore.apiSubscriptionRepo
            .forAllTenant()
            .saveRaw(
              "deleted-subscription",
              Json.obj("_id" -> "deleted-subscription", "_deleted" -> false)
            )
          _ <- env.dataStore.userRepo.execute(
            """UPDATE api_subscriptions SET _deleted = true
            |WHERE _id = 'deleted-subscription'""".stripMargin
          )
          _ <- env.dataStore.userRepo.execute(
            """UPDATE api_subscriptions
            |SET content = jsonb_set(content, '{_deleted}', 'true')
            |WHERE _id = 'legacy-subscription'""".stripMargin
          )
          _ <- env.initDatastore()
          subscriptionCount <- env.dataStore.apiSubscriptionRepo
            .forAllTenant()
            .count()
          keyringCount <- env.dataStore.keyringRepo.forAllTenant().count()
          _ <- assertNoDeletedColumns(env)
        } yield {
          subscriptionCount mustBe 1L
          keyringCount mustBe 1L
        }
      }
    }

    "upgrade when the older cleanup evolutions are still pending" in {
      withLegacyDatabase { env =>
        for {
          _ <- env.dataStore.evolutionRepo.deleteById(
            DatastoreId("legacy-18.9.2")
          )
          _ <- env.dataStore.evolutionRepo.deleteById(
            DatastoreId("legacy-18.11.0")
          )
          _ <- env.dataStore.evolutionRepo.deleteById(
            DatastoreId("legacy-18.11.0_b")
          )
          _ <- env.initDatastore()
          subscription <- env.dataStore.apiSubscriptionRepo
            .forTenant(TenantId("upgrade-tenant"))
            .findById(ApiSubscriptionId("legacy-subscription"))
          _ <- assertNoDeletedColumns(env)
        } yield subscription.get.keyring mustBe KeyringId("legacy-subscription")
      }
    }

    "initialize a fresh database directly with the current schema" in {
      withLegacyDatabase { env =>
        val schema = env.rawConfiguration.get[String]("daikoku.postgres.schema")
        for {
          _ <- env.dataStore.userRepo.execute(s"DROP SCHEMA $schema CASCADE")
          _ <- env.initDatastore()
          _ <- assertNoDeletedColumns(env)
          evolution <- env.dataStore.evolutionRepo.findByVersion("19.1.0_d")
          tenantCount <- env.dataStore.tenantRepo.count()
        } yield {
          evolution.map(_.applied) mustBe Some(true)
          tenantCount mustBe 1L
        }
      }
    }

    "propagate a purge failure and resume without duplicating migrated keyrings" in {
      withLegacyDatabase { env =>
        for {
          _ <- env.dataStore.userRepo.execute(
            "CREATE TABLE keyrings (_id text PRIMARY KEY, content jsonb)"
          )
          _ <- env.dataStore.keyringRepo
            .forAllTenant()
            .saveRaw(
              "deleted-keyring",
              Json.obj("_id" -> "deleted-keyring", "_deleted" -> true)
            )
          _ <- env.dataStore.userRepo.execute(
            """CREATE FUNCTION interrupt_purge() RETURNS trigger AS $$
            |BEGIN
            |  RAISE EXCEPTION 'upgrade purge interrupted';
            |END;
            |$$ LANGUAGE plpgsql""".stripMargin
          )
          _ <- env.dataStore.userRepo.execute(
            """CREATE TRIGGER interrupt_purge BEFORE DELETE ON keyrings
            |FOR EACH ROW EXECUTE FUNCTION interrupt_purge()""".stripMargin
          )
          error <- env.initDatastore().failed
          migrated <- env.dataStore.evolutionRepo.findByVersion("19.0.0")
          purged <- env.dataStore.evolutionRepo.findByVersion("19.1.0_b")
          _ = {
            error.getMessage must include("upgrade purge interrupted")
            migrated.map(_.applied) mustBe Some(true)
            purged mustBe None
          }
          _ <- env.dataStore.userRepo.execute(
            "DROP TRIGGER interrupt_purge ON keyrings"
          )
          _ <- env.initDatastore()
          keyrings <- env.dataStore.keyringRepo
            .forTenant(TenantId("upgrade-tenant"))
            .findAll()
          keyringCount <- env.dataStore.keyringRepo.forAllTenant().count()
          _ <- assertNoDeletedColumns(env)
        } yield {
          keyringCount mustBe 1L
          keyrings.map(_.id) mustBe Seq(KeyringId("legacy-subscription"))
          keyrings.head.apiKey.clientSecret mustBe "synthetic-secret"
        }
      }
    }
  }
}
