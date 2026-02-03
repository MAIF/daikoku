package storage.drivers.postgres

import io.vertx.core.AsyncResult
import org.apache.pekko.http.scaladsl.util.FastFuture
import io.vertx.sqlclient.{Pool, Row, RowSet}
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

  private def queryRaw[A](
      query: String,
      params: Seq[Any] = Seq.empty,
      debug: Boolean = true
  )(f: Seq[Row] => A): Future[A] = {
    if (debug || debugQueries)
      logger.debug(s"""query: "$query", params: "${params.mkString(", ")}"""")

    val isRead = query.toLowerCase().trim.startsWith("select")
    (if (isRead) {
       pool
         .withConnection(c =>
           c.preparedQuery(query)
             .execute(io.vertx.sqlclient.Tuple.from(params.toArray))
         )
         .scala
     } else {
       pool
         .withConnection(c =>
           c.preparedQuery(query)
             .execute(io.vertx.sqlclient.Tuple.from(params.toArray))
         )
         .scala
     })
      .flatMap { _rows =>
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
  )(f: Row => Option[A]): Future[Seq[A]] = {
    queryRaw[Seq[A]](query, params, debug)(rows => rows.flatMap(f))
  }

  def queryOne[A](
      query: String,
      params: Seq[AnyRef] = Seq.empty,
      debug: Boolean = true
  )(f: Row => Option[A]): Future[Option[A]] = {
    queryRaw[Option[A]](query, params, debug)(rows =>
      rows.headOption.flatMap(row => f(row))
    )
  }

  def rawQuery(sql: String): Future[RowSet[Row]] =
    pool.query(sql).executeAsync()

  def query(sql: String, params: Seq[AnyRef] = Seq.empty) =
    pool
      .withConnection(c =>
        c.preparedQuery(sql)
          .execute(io.vertx.sqlclient.Tuple.from(params.toArray))
      )
      .scala

  def execute(sql: String, params: Seq[AnyRef] = Seq.empty): Future[Long] = {
    val promise = Promise[Long]()

    pool
      .withConnection(c =>
        c.preparedQuery(sql)
          .execute(io.vertx.sqlclient.Tuple.from(params.toArray))
      )
      .onComplete { ar =>
        if (ar.succeeded()) {
          promise.success(ar.result().rowCount().toLong)
        } else {
          logger.warn(ar.cause().getLocalizedMessage)
          promise.success(0L)
        }
      }

    promise.future
  }

}
