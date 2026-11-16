package fr.maif.daikoku.env

import com.typesafe.config.ConfigFactory
import fr.maif.daikoku.storage.drivers.postgres.pgimplicits.*
import io.vertx.core.Vertx
import io.vertx.pgclient.{PgBuilder, PgConnectOptions}
import io.vertx.sqlclient.{PoolOptions, SqlConnection, Tuple}
import org.scalatest.BeforeAndAfterAll
import org.scalatestplus.play.PlaySpec
import play.api.Configuration
import play.api.libs.json.{JsObject, Json}

import scala.concurrent.{Await, ExecutionContext, Future}
import scala.concurrent.duration.*
import scala.jdk.CollectionConverters.*

class KeyringMigrationSpec extends PlaySpec with BeforeAndAfterAll {
  private given ExecutionContext = ExecutionContext.global

  private val configuration = Configuration(ConfigFactory.load())
  private val options = new PgConnectOptions()
    .setHost(configuration.get[String]("daikoku.postgres.host"))
    .setPort(configuration.get[Int]("daikoku.postgres.port"))
    .setDatabase(configuration.get[String]("daikoku.postgres.database"))
    .setUser(configuration.get[String]("daikoku.postgres.username"))
    .setPassword(configuration.get[String]("daikoku.postgres.password"))
  private val vertx = Vertx.vertx()
  private val pool = PgBuilder
    .pool()
    .`with`(new PoolOptions().setMaxSize(1))
    .connectingTo(options)
    .using(vertx)
    .build()

  override protected def afterAll(): Unit = {
    try {
      Await.result(pool.close().scala, 10.seconds)
      Await.result(vertx.close().scala, 10.seconds)
    } finally super.afterAll()
  }

  private def withFixtures(test: SqlConnection => Future[Unit]): Unit = {
    val result = pool.withTransaction { connection =>
      val setup = Seq(
        "apis",
        "usage_plans",
        "api_subscriptions",
        "keyrings",
        "subscription_demands",
        "notifications"
      ).foldLeft(Future.successful(())) { (previous, table) =>
        previous.flatMap { _ =>
          connection
            .query(
              s"CREATE TEMP TABLE $table (_id text PRIMARY KEY, _deleted boolean, content jsonb) ON COMMIT DROP"
            )
            .execute()
            .scala
            .map(_ => ())
        }
      }
      val promise = io.vertx.core.Promise.promise[Unit]()
      setup.flatMap(_ => test(connection)).onComplete {
        case scala.util.Success(value) => promise.complete(value)
        case scala.util.Failure(error) => promise.fail(error)
      }
      promise.future()
    }.scala
    Await.result(result, 15.seconds)
  }

  private def insert(
      connection: SqlConnection,
      table: String,
      content: JsObject,
      deleted: Boolean = false
  ): Future[Unit] =
    connection
      .preparedQuery(
        s"INSERT INTO $table VALUES ($$1, $$2, $$3::jsonb)"
      )
      .execute(
        Tuple.of(
          (content \ "_id").as[String],
          Boolean.box(deleted),
          new io.vertx.core.json.JsonObject(Json.stringify(content))
        )
      )
      .scala
      .map(_ => ())

  private def rows(
      connection: SqlConnection,
      table: String
  ): Future[Seq[JsObject]] =
    connection
      .query(s"SELECT content::text FROM $table ORDER BY _id")
      .execute()
      .scala
      .map(
        _.asScala.toSeq.map(row => Json.parse(row.getString(0)).as[JsObject])
      )

  private def migrate(connection: SqlConnection): Future[Unit] =
    evolution_1900
      .migrateSubscriptions(sql =>
        connection.preparedQuery(sql).execute().scala.map(_ => ())
      )
      .map(_ => ())

  private def subscription(kind: String): JsObject = Json.obj(
    "_id" -> s"$kind-sub",
    "_tenant" -> "migration-tenant",
    "team" -> "migration-team",
    "api" -> kind,
    "plan" -> s"$kind-plan",
    "parent" -> Json.toJson(Option.empty[String]),
    "createdAt" -> 123456789L,
    "apiKey" -> Json.obj(
      "clientId" -> s"$kind-client",
      "clientSecret" -> "synthetic-secret",
      "clientName" -> kind
    ),
    "integrationToken" -> "synthetic-integration-token",
    "bearerToken" -> "synthetic-bearer-token",
    "rotation" -> Json.obj("enabled" -> true),
    "thirdPartySubscriptionInformations" -> Json.obj("fixture" -> true)
  )

  private def seed(connection: SqlConnection): Future[Unit] =
    Seq("admin", "cms", "external")
      .foldLeft(Future.successful(())) { (previous, kind) =>
        previous.flatMap { _ =>
          for {
            _ <- insert(
              connection,
              "apis",
              Json.obj("_id" -> kind, "name" -> kind)
            )
            _ <- insert(
              connection,
              "usage_plans",
              Json.obj(
                "_id" -> s"$kind-plan",
                "customName" -> kind,
                "otoroshiTarget" -> (if (kind == "external")
                                       Json.obj(
                                         "otoroshiSettings" -> "migration-otoroshi"
                                       )
                                     else Json.toJson(Option.empty[String]))
              )
            )
            _ <- insert(connection, "api_subscriptions", subscription(kind))
          } yield ()
        }
      }
      .flatMap { _ =>
        for {
          _ <- insert(
            connection,
            "api_subscriptions",
            subscription("external").deepMerge(
              Json.obj(
                "_id" -> "external-child",
                "parent" -> "external-sub"
              )
            )
          )
          _ <- insert(
            connection,
            "api_subscriptions",
            subscription("deleted") ++ Json.obj("plan" -> "admin-plan"),
            deleted = true
          )
          _ <- insert(
            connection,
            "subscription_demands",
            Json.obj(
              "_id" -> "demand",
              "parentSubscription" -> "admin-sub"
            )
          )
          _ <- insert(
            connection,
            "notifications",
            Json.obj(
              "_id" -> "notification",
              "action" -> Json.obj(
                "type" -> "ApiSubscriptionDemand",
                "parentSubscriptionId" -> "cms-sub"
              )
            )
          )
        } yield ()
      }

  private def assertMigrated(connection: SqlConnection): Future[Unit] =
    for {
      subscriptions <- rows(connection, "api_subscriptions")
      keyrings <- rows(connection, "keyrings")
      demands <- rows(connection, "subscription_demands")
      notifications <- rows(connection, "notifications")
    } yield {
      keyrings.map(value => (value \ "_id").as[String]).toSet mustBe
        Set("admin-sub", "cms-sub", "external-sub")
      Seq("admin", "cms", "external").foreach { kind =>
        val original = subscription(kind)
        val keyring =
          keyrings.find(value => (value \ "_id").as[String] == s"$kind-sub").get
        Seq(
          "_tenant",
          "team",
          "apiKey",
          "createdAt",
          "rotation",
          "integrationToken",
          "bearerToken",
          "thirdPartySubscriptionInformations"
        ).foreach(field => (keyring \ field) mustBe (original \ field))
        (keyring \ "otoroshiSettings").as[JsObject] mustBe
          (if (kind == "external")
             Json.obj("type" -> "Otoroshi", "id" -> "migration-otoroshi")
           else Json.obj("type" -> "Internal"))
      }
      subscriptions
        .filterNot(value => (value \ "_id").as[String] == "deleted-sub")
        .foreach { sub =>
          val id = (sub \ "_id").as[String]
          (sub \ "keyring").as[String] mustBe
            (if (id == "external-child") "external-sub" else id)
          (sub \ "parent").toOption mustBe None
        }
      (subscriptions
        .find(value => (value \ "_id").as[String] == "deleted-sub")
        .get \ "keyring").toOption mustBe None
      (demands.head \ "keyring").as[String] mustBe "admin-sub"
      (demands.head \ "parentSubscription").toOption mustBe None
      (notifications.head \ "action" \ "keyring").as[String] mustBe "cms-sub"
      (notifications.head \ "action" \ "parentSubscriptionId").toOption mustBe None
    }

  "Keyring migration" should {
    "register the repair immediately after 19.0.0" in {
      evolutions.list
        .map(_.version)
        .dropWhile(_ != "19.0.0")
        .take(2) mustBe List(
        "19.0.0",
        "19.0.1"
      )
    }

    "register the 19.1.0 evolutions after the 19.0.1 repair" in {
      evolutions.list.map(_.version).dropWhile(_ != "19.0.1") mustBe List(
        "19.0.1",
        "19.1.0",
        "19.1.0_b",
        "19.1.0_c",
        "19.1.0_d"
      )
    }

    "migrate directly from v18 and leave nothing to repair in 19.0.1" in withFixtures {
      connection =>
        for {
          _ <- seed(connection)
          _ <- migrate(connection)
          _ <- assertMigrated(connection)
          before <- rows(connection, "keyrings")
          subscriptionsBefore <- rows(connection, "api_subscriptions")
          _ <- migrate(connection)
          _ <- assertMigrated(connection)
          after <- rows(connection, "keyrings")
          subscriptionsAfter <- rows(connection, "api_subscriptions")
        } yield {
          after mustBe before
          subscriptionsAfter mustBe subscriptionsBefore
        }
    }

    "repair the internal subscriptions skipped by the released 19.0.0" in withFixtures {
      connection =>
        for {
          _ <- seed(connection)
          _ <- connection
            .query(
              "UPDATE api_subscriptions SET content = (content - 'parent') || '{\"keyring\":\"external-sub\"}'::jsonb WHERE _id IN ('external-sub', 'external-child')"
            )
            .execute()
            .scala
          _ <- insert(
            connection,
            "keyrings",
            Json.obj(
              "_id" -> "external-sub",
              "marker" -> "must-not-change"
            )
          )
          _ <- migrate(connection)
          keyrings <- rows(connection, "keyrings")
          subscriptions <- rows(connection, "api_subscriptions")
          _ <- migrate(connection)
          repeated <- rows(connection, "keyrings")
        } yield {
          keyrings.map(value => (value \ "_id").as[String]).toSet mustBe
            Set("admin-sub", "cms-sub", "external-sub")
          (keyrings
            .find(value => (value \ "_id").as[String] == "external-sub")
            .get \ "marker")
            .as[String] mustBe "must-not-change"
          Seq("admin", "cms").foreach { kind =>
            (subscriptions
              .find(value => (value \ "_id").as[String] == s"$kind-sub")
              .get \ "keyring").as[String] mustBe s"$kind-sub"
            val keyring = keyrings
              .find(value => (value \ "_id").as[String] == s"$kind-sub")
              .get
            (keyring \ "otoroshiSettings").as[JsObject] mustBe Json.obj(
              "type" -> "Internal"
            )
            Seq("apiKey", "integrationToken", "bearerToken", "rotation")
              .foreach { field =>
                (keyring \ field) mustBe (subscription(kind) \ field)
              }
          }
          repeated mustBe keyrings
        }
    }

    "resume after a keyring was created but before its subscription was attached" in withFixtures {
      connection =>
        val existing = Json.obj(
          "_id" -> "admin-sub",
          "apiKey" -> Json.obj(
            "clientId" -> "existing-client",
            "clientSecret" -> "existing-secret"
          ),
          "otoroshiSettings" -> Json.obj("type" -> "Internal")
        )
        for {
          _ <- seed(connection)
          _ <- insert(connection, "keyrings", existing)
          _ <- migrate(connection)
          keyrings <- rows(connection, "keyrings")
          subscriptions <- rows(connection, "api_subscriptions")
        } yield {
          keyrings.size mustBe 3
          keyrings
            .find(value => (value \ "_id").as[String] == "admin-sub")
            .get mustBe existing
          (subscriptions
            .find(value => (value \ "_id").as[String] == "admin-sub")
            .get \ "keyring").as[String] mustBe "admin-sub"
        }
    }

    "propagate SQL failures instead of reporting a successful migration" in withFixtures {
      connection =>
        evolution_1900
          .migrateSubscriptions(_ =>
            Future.failed(new IllegalStateException("migration SQL failed"))
          )
          .failed
          .map { error =>
            error.getMessage mustBe "migration SQL failed"
          }
    }

    "do nothing on a fresh instance with no subscriptions" in withFixtures {
      connection =>
        for {
          _ <- migrate(connection)
          _ <- migrate(connection)
          keyrings <- rows(connection, "keyrings")
        } yield keyrings mustBe empty
    }
  }
}
