package storage.drivers.postgres.jooq.reactive

import io.vertx.core.{AsyncResult, Handler}
import io.vertx.sqlclient.{Row, RowSet, SqlClient}
import org.jooq._
import org.jooq.conf.ParamType
import org.jooq.exception.TooManyRowsException
import org.jooq.impl.DSL
import play.api.Logger
import storage.drivers.postgres.jooq.api.{PgAsyncClient, QueryResult}

import java.util.concurrent.Executors
import java.util.stream.StreamSupport
import scala.concurrent.{ExecutionContext, Future, Promise}

abstract class AbstractReactivePgAsyncClient[Client <: SqlClient](
                                                                   val client: Client,
                                                                   val configuration: Configuration)
  extends PgAsyncClient {

  implicit val ec: ExecutionContext = ExecutionContext.fromExecutor(Executors.newFixedThreadPool(10))

  val logger: Logger = Logger(s"AbstractReactivePgAsyncClient")

  def rawPreparedQuery[R <: Record](queryFunction: DSLContext => ResultQuery[R]): Future[RowSet[Row]] = {
    val query = queryFunction.apply(DSL.using(configuration))
    log(query)

    val p = Promise[RowSet[Row]]

    Future {
      client.query(query.getSQL, toCompletionHandler(p))
    }

    p.future
      .recover { u =>
        logger.error(u.getMessage)
      }

    p.future
  }

  def toCompletionHandler[U](p: Promise[U]): Handler[AsyncResult[U]] =
    res => if (res.succeeded()) p.success(res.result()) else p.failure(res.cause())

  def log(query: Query): Unit = {
    logger.debug(s"Executing ${query.getSQL(ParamType.INLINED)}")
  }

  override def queryOne[R <: Record](queryFunction: DSLContext => _ <: ResultQuery[R]):
  Future[Option[QueryResult]] =
    rawPreparedQuery(queryFunction)
      .flatMap(res => {
        res.size() match {
          case 0 => Future.successful(None)
          case 1 => Future.successful(Some(new ReactiveRowQueryResult(res.iterator.next)))
          case _ => Future.failed(new TooManyRowsException(s"Found more than one row: ${res.size}"))
        }
      })

  def query[R <: Record](queryFunction: DSLContext => _ <: ResultQuery[R]): Future[List[QueryResult]] =
    rawPreparedQuery(queryFunction).map(asList)

  def asList(result: RowSet[Row]): List[QueryResult] = {
    var out = List[QueryResult]()

    StreamSupport
      .stream(result.spliterator(), false)
      .forEach { o =>
        out = out :+ new ReactiveRowQueryResult(o)
      }

    out
  }

  def execute(queryFunction: DSLContext => _ <: Query): Future[Int] = {
    val query = queryFunction.apply(DSL.using(configuration))
    log(query)

    val prom = Promise[RowSet[Row]]

    Future {
      client.query(query.getSQL, toCompletionHandler(prom))
    }

    prom.future.map(_.rowCount)
  }
}
