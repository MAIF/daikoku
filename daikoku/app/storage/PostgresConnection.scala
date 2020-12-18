package storage

import akka.actor.ActorSystem
import org.jooq.{DSLContext, SQLDialect}
import org.jooq.impl.DSL
import play.api.Logger
import play.api.db.{Database, Databases}

import javax.inject.Inject
import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

object Pos

// class PostgresConnection @Inject() (db: Database, system: ActorSystem) {
class PostgresConnection @Inject() (system: ActorSystem) {
  val databaseContext: ExecutionContext = system.dispatchers.lookup("contexts.database")

  val logger: Logger = Logger(s"PostgresConnection")

  val database: Option[Database] = None

 def withMyDatabase[A](block: Database => A): A = {
   database match {
     case None => Databases.withDatabase(
       driver = "org.postgresql.Driver",
       url = "jdbc:postgresql://localhost/postgres?currentSchema=daikoku",
       name = "daikoku",
       config = Map(
         "username" -> "postgres",
         "password" -> "postgres"
       )
     )(block)
     case Some(value) => block.apply(value)
   }
 }

  def query[A](block: DSLContext => A): Future[A] = Future {
    withMyDatabase { database =>
      try {
        logger.error("Starting request")
        logger.error(database.getConnection().getSchema)
        block(DSL.using(database.getConnection(), SQLDialect.POSTGRES))
      } catch {
        case e: Throwable =>
          logger.error(e.getMessage)
          throw e
      }
    }
  }(databaseContext)

  def withTransation[A](block: DSLContext => A): Future[A] = Future {
    withMyDatabase { database =>
      block(DSL.using(database.getConnection(), SQLDialect.POSTGRES))
    }
  }(databaseContext)
}
