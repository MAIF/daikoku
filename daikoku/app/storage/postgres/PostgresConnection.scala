package storage.postgres

import akka.actor.ActorSystem
import org.jooq.impl.DSL
import org.jooq.{DSLContext, SQLDialect}
import play.api.{Configuration, Logger}
import play.api.db.{Database, Databases}

import javax.inject.Inject
import scala.concurrent.{ExecutionContext, Future}

class PostgresConnection @Inject()(system: ActorSystem, underlying: Configuration) {
  val databaseContext: ExecutionContext = system.dispatchers.lookup("contexts.database")

  val logger: Logger = Logger(s"PostgresConnection")

  lazy val driver: String = envOrElse("db.default.driver", "org.postgresql.Driver")

  lazy val url: String = envOrElse("db.default.url", "")

  lazy val name: String = envOrElse("db.default.name", "default")

  lazy val username: String = envOrElse("db.default.username", "postgres")

  lazy val password: String = envOrElse("db.default.password", "postgres")

  lazy val database: Database =
      Databases(
        driver,
        url,
        name,
        config = Map(
          "username" -> username,
          "password" -> password
        )
      )

  def query[A](block: DSLContext => A): Future[A] = Future {
    database.withConnection { connection =>
      val sql = DSL.using(connection, SQLDialect.POSTGRES)
      block(sql)
    }
  }(databaseContext)

  def withTransaction[A](block: DSLContext => A): Future[A] = Future {
    database.withTransaction { connection =>
      val sql = DSL.using(connection, SQLDialect.POSTGRES)
      block(sql)
    }
  }(databaseContext)

  def envOrElse(path: String, defaultValue: String): String =
    underlying
    .getOptional[String](path)
    .getOrElse(defaultValue)
}
