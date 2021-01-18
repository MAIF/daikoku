package storage.drivers.postgres.jooq.reactive

import io.vertx.sqlclient.Transaction
import org.jooq.Configuration
import storage.drivers.postgres.jooq.api.PgAsyncTransaction

import scala.concurrent.{Future, Promise}
import scala.util.Success

class ReactivePgAsyncTransaction(client: Transaction, configuration: Configuration)
  extends AbstractReactivePgAsyncClient[Transaction](client, configuration)
  with PgAsyncTransaction {

  def commit: Future[Any] = {
    val fCommit = Promise[Any]
    client.commit(r => fCommit.complete(Success(())))
    fCommit.future
  }

  def rollback: Future[Any] = {
    val fRollback = Promise[Any]
    client.rollback(r => fRollback.complete(Success(())))
    fRollback.future
  }
}
