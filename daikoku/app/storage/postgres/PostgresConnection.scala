package storage.postgres

import akka.actor.ActorSystem
import org.jooq.impl.DSL
import org.jooq.{DSLContext, SQLDialect}
import play.api.Logger
import play.api.db.{Database, Databases}

import javax.inject.Inject
import scala.concurrent.{ExecutionContext, Future}

class PostgresConnection @Inject()(system: ActorSystem) {
  val databaseContext: ExecutionContext = system.dispatchers.lookup("contexts.database")

  val logger: Logger = Logger(s"PostgresConnection")

  var database: Database = Databases(
    driver = "org.postgresql.Driver",
    url = "jdbc:postgresql://localhost/postgres?currentSchema=daikoku",
    name = "daikoku",
    config = Map(
      "username" -> "postgres",
      "password" -> "postgres"
    ))

  logger.error("Ending initialize")

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
}
