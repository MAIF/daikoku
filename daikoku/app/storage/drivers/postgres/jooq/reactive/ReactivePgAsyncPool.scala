package storage.drivers.postgres.jooq.reactive

import io.vertx.pgclient.PgPool
import io.vertx.sqlclient.{SqlConnection, Transaction}
import org.jooq.Configuration
import storage.drivers.postgres.jooq.api.{PgAsyncConnection, PgAsyncPool}

import scala.concurrent.{Future, Promise}

class ReactivePgAsyncPool(client: PgPool, configuration: Configuration)
  extends AbstractReactivePgAsyncClient[PgPool](client, configuration)
    with PgAsyncPool {

  override def connection: Future[PgAsyncConnection] = {
    val fConnection = Promise[SqlConnection]
    client.getConnection(toCompletionHandler(fConnection))
    fConnection.future.map(c => new ReactivePgAsyncConnection(c, configuration))
  }

  def begin: Future[PgAsyncConnection] = {
    val fConnection = Promise[Transaction]
    client.begin(toCompletionHandler(fConnection))
    fConnection.future.map(c => new ReactivePgAsyncTransaction(c, configuration).asInstanceOf[PgAsyncConnection])
  }
}
