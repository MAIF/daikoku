package storage

import fr.maif.otoroshi.daikoku.env.Env
import io.vertx.core.Vertx
import io.vertx.pgclient.{PgConnectOptions, PgPool}
import io.vertx.sqlclient.PoolOptions
import org.jooq.SQLDialect
import org.jooq.impl.DefaultConfiguration
import play.modules.reactivemongo.ReactiveMongoApi
import storage.mongo.MongoDataStore
import storage.postgres.jooq.reactive.ReactivePgAsyncPool
import storage.postgres.{PostgresConnection, PostgresDataStore}

import scala.jdk.CollectionConverters.MapHasAsJava

object Manager {
  def getDataStore(env: Env, postgresConnection: PostgresConnection, reactiveMongoApi: ReactiveMongoApi): DataStore = {
    // TODO - Faire le switch selon la configuration
    // new MongoDataStore(env, reactiveMongoApi)

    val jooqConfig = new DefaultConfiguration
    jooqConfig.setSQLDialect(SQLDialect.POSTGRES)

    val poolOptions = new PoolOptions().setMaxSize(3)

    val options = new PgConnectOptions()
      .setPort(5432)
      .setHost("localhost")
      .setDatabase("postgres")
      .setUser("postgres")
      .setPassword("postgres")
      .setProperties(Map(
        "search_path" -> "daikoku"
      ).asJava)

    val reactivePgAsyncPool = new ReactivePgAsyncPool(
      PgPool.pool(Vertx.vertx, options, poolOptions),
      jooqConfig
    )

    new PostgresDataStore(env, reactivePgAsyncPool)
  }
}
