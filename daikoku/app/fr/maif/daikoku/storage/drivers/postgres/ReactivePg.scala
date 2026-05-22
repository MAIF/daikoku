package fr.maif.daikoku.storage.drivers.postgres

import fr.maif.daikoku.storage.{ActiveConn, DbConn, NoConn}
import io.vertx.sqlclient.{Pool, Row, RowSet, SqlConnection}
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.{
  Materializer,
  OverflowStrategy,
  QueueOfferResult
}
import org.apache.pekko.stream.scaladsl.Source
import play.api.libs.json.{JsArray, JsObject, Json}
import play.api.{Configuration, Logger}

import scala.concurrent.{ExecutionContext, Future, Promise}
import scala.util.{Failure, Success, Try}

object pgimplicits {
  implicit class VertxFutureEnhancer[A](val future: io.vertx.core.Future[A])
      extends AnyVal {
    def scala: Future[A] = {
      val promise = Promise.apply[A]()
      future.onSuccess(a => promise.trySuccess(a))
      future.onFailure(e => promise.tryFailure(e))
      promise.future
    }
  }

  implicit class EnhancedRow(val row: Row) extends AnyVal {
    def opt[A](name: String, typ: String, extractor: (Row, String) => A)(
        implicit logger: Logger
    ): Option[A] = {
      Try(extractor(row, name)) match {
        case Failure(ex) => {
          logger.error(s"error while getting column '$name' of type $typ", ex)
          None
        }
        case Success(value) => Some(value)
      }
    }
    def optBoolean(name: String)(implicit logger: Logger): Option[Boolean] =
      opt(name, "Boolean", (a, b) => a.getBoolean(b))
    def optString(name: String)(implicit logger: Logger): Option[String] =
      opt(name, "String", (a, b) => a.getString(b))
    def optLong(name: String)(implicit logger: Logger): Option[Long] =
      opt(name, "Long", (a, b) => a.getLong(b).longValue())
    def optJsObject(name: String)(implicit logger: Logger): Option[JsObject] =
      opt(
        name,
        "JsObject",
        (row, _) => {
          Try {
            Json.parse(row.getJsonObject(name).encode()).as[JsObject]
          } match {
            case Success(s) => s
            case Failure(e) =>
              Json.parse(row.getString(name)).as[JsObject]
          }
        }
      )
    def optJsArray(name: String)(implicit logger: Logger): Option[JsArray] =
      opt(
        name,
        "JsArray",
        (row, _) => {
          Try {
            Json.parse(row.getJsonArray(name).encode()).as[JsArray]
          } match {
            case Success(s) => s
            case Failure(e) =>
              Json.parse(row.getString(name)).as[JsArray]
          }
        }
      )
  }

  implicit class VertxQueryEnhancer[A](val query: io.vertx.sqlclient.Query[A])
      extends AnyVal {
    def executeAsync(): Future[A] = {
      val promise = Promise.apply[A]()
      val future = query.execute()
      future.onSuccess(a => promise.trySuccess(a))
      future.onFailure(e => promise.tryFailure(e))
      promise.future
    }
  }
}

class ReactivePg(pool: Pool, configuration: Configuration)(implicit
    val ec: ExecutionContext
) {

  import pgimplicits._

  import scala.jdk.CollectionConverters._

  private implicit val logger: Logger = Logger("otoroshi-reactive-pg-kv")

  private val debugQueries = configuration
    .getOptional[Boolean]("daikoku.postgres.logQueries")
    .getOrElse(false)

  // Central dispatch: uses the transaction connection when inside withTransaction,
  // otherwise borrows a connection from the pool as before.
  // Note: the lambda must be written inline for Scala's SAM conversion to
  // java.util.function.Function (which pool.withConnection expects).
  private def queryRaw[A](
      query: String,
      params: Seq[Any],
      debug: Boolean
  )(f: Seq[Row] => A)(implicit dbConn: DbConn): Future[A] = {
    if (debug || debugQueries)
      logger.debug(s"""query: "$query", params: "${params.mkString(", ")}"""")

    (dbConn match {
      case NoConn =>
        pool.withConnection(c =>
          c.preparedQuery(query).execute(io.vertx.sqlclient.Tuple.from(params.toArray))
        ).scala
      case ActiveConn(conn) =>
        conn.preparedQuery(query).execute(io.vertx.sqlclient.Tuple.from(params.toArray)).scala
    }).flatMap { _rows =>
        Try {
          val rows = _rows.asScala.toSeq
          f(rows)
        } match {
          case Success(value) => FastFuture.successful(value)
          case Failure(e)     => FastFuture.failed(e)
        }
      }
      .andThen { case Failure(e) =>
        logger.error(
          s"""Failed to apply query: "$query" with params: "${params
              .mkString(", ")}""""
        )
        logger.error(s"$e")
      }
  }

  def querySeq[A](
      query: String,
      params: Seq[AnyRef] = Seq.empty,
      debug: Boolean = true
  )(f: Row => Option[A])(implicit dbConn: DbConn): Future[Seq[A]] = {
    queryRaw[Seq[A]](query, params, debug)(rows => rows.flatMap(f))
  }

  def queryOne[A](
      query: String,
      params: Seq[AnyRef] = Seq.empty,
      debug: Boolean = true
  )(f: Row => Option[A])(implicit dbConn: DbConn): Future[Option[A]] = {
    queryRaw[Option[A]](query, params, debug)(rows =>
      rows.headOption.flatMap(row => f(row))
    )
  }

  // rawQuery runs a non-parameterised statement; dispatches to the transaction
  // connection when available.
  def rawQuery(sql: String)(implicit dbConn: DbConn): Future[RowSet[Row]] =
    dbConn match {
      case NoConn           => pool.query(sql).executeAsync()
      case ActiveConn(conn) => conn.query(sql).executeAsync()
    }

  def query(sql: String, params: Seq[AnyRef] = Seq.empty)(implicit dbConn: DbConn): Future[RowSet[Row]] =
    dbConn match {
      case NoConn =>
        pool.withConnection(c =>
          c.preparedQuery(sql).execute(io.vertx.sqlclient.Tuple.from(params.toArray))
        ).scala
      case ActiveConn(conn) =>
        conn.preparedQuery(sql).execute(io.vertx.sqlclient.Tuple.from(params.toArray)).scala
    }

  // Streaming always opens its own transaction for cursor support; excluded from DbConn.
  def queryStreamSource[A](
      sql: String,
      params: Seq[AnyRef] = Seq.empty,
      fetchSize: Int = 50
  )(f: Row => Option[A])(implicit mat: Materializer): Source[A, ?] = {
    val (queue, source) = Source
      .queue[Row](fetchSize * 2, OverflowStrategy.backpressure)
      .preMaterialize()

    pool
      .withTransaction(conn =>
        conn.prepare(sql).compose { ps =>
          val stream = ps.createStream(
            fetchSize,
            io.vertx.sqlclient.Tuple.from(params.toArray)
          )
          val streamDone = io.vertx.core.Promise.promise[Void]()
          stream.pause()

          def feedNext(): Unit = stream.fetch(1)

          stream.handler { row =>
            queue
              .offer(row)
              .foreach {
                case QueueOfferResult.Enqueued    => feedNext()
                case QueueOfferResult.Dropped     => feedNext()
                case QueueOfferResult.QueueClosed => stream.close()
                case QueueOfferResult.Failure(e) =>
                  logger.error(s"Queue offer failed: ${e.getMessage}", e)
                  stream.close()
              }(using ec)
          }
          stream.endHandler { _ =>
            queue.complete()
            streamDone.complete(null)
          }
          stream.exceptionHandler { e =>
            logger.error(s"Stream error: ${e.getMessage}", e)
            queue.fail(e)
            streamDone.fail(e)
          }

          feedNext()
          streamDone.future()
        }
      )

    source.mapConcat(row => f(row).toList)
  }

  def execute(sql: String, params: Seq[AnyRef] = Seq.empty)(implicit dbConn: DbConn): Future[Long] = {
    val promise = Promise[Long]()

    val resultFuture: Future[RowSet[Row]] = dbConn match {
      case NoConn =>
        pool.withConnection(c =>
          c.preparedQuery(sql).execute(io.vertx.sqlclient.Tuple.from(params.toArray))
        ).scala
      case ActiveConn(conn) =>
        conn.preparedQuery(sql).execute(io.vertx.sqlclient.Tuple.from(params.toArray)).scala
    }

    resultFuture.onComplete {
      case Success(rows) => promise.success(rows.rowCount().toLong)
      case Failure(e) =>
        logger.warn(e.getLocalizedMessage)
        promise.success(0L)
    }

    promise.future
  }

  // Opens a Vert.x transaction, injects ActiveConn(conn) as the implicit DbConn
  // inside f, then commits on success or rolls back on failure.
  def withTransaction[A](f: DbConn ?=> Future[A]): Future[A] = {
    pool.withTransaction { conn =>
      val p = io.vertx.core.Promise.promise[A]()
      val result: Future[A] = f(using ActiveConn(conn))
      result.onComplete {
        case Success(v) => p.complete(v)
        case Failure(e) => p.fail(e)
      }
      p.future()
    }.scala
  }
}
