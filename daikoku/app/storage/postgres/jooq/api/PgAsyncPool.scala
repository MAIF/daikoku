package storage.postgres.jooq.api

import scala.concurrent.Future

trait PgAsyncPool extends PgAsyncClient {
  def connection: Future[PgAsyncConnection]
  def begin: Future[PgAsyncConnection]
}
