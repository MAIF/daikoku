package storage.drivers.postgres.jooq.api

import scala.concurrent.Future

trait PgAsyncConnection extends PgAsyncClient {
  def close: Future[Any]
}
