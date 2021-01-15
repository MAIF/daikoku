package storage.postgres.jooq.api

import org.jooq.{DSLContext, Query, Record, ResultQuery}

import scala.concurrent.Future

trait PgAsyncClient {
  def queryOne[R <: Record](queryFunction: DSLContext => _ <: ResultQuery[R]): Future[Option[QueryResult]]
  def query[R <: Record](queryFunction: DSLContext => _ <: ResultQuery[R]): Future[List[QueryResult]]
  def execute(queryFunction: DSLContext => _ <: Query): Future[Int]
}
