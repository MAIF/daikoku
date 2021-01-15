package storage.drivers.postgres.jooq.api

import scala.concurrent.Future

trait PgAsyncTransaction extends PgAsyncClient {
  def commit: Future[Any]
  def rollback: Future[Any]
}
