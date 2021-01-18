package storage.drivers.postgres.jooq.reactive

import io.vertx.sqlclient.SqlConnection
import org.jooq.Configuration
import storage.drivers.postgres.jooq.api.{PgAsyncConnection, PgAsyncTransaction}

import scala.concurrent.{Future, Promise}
import scala.util.Success

class ReactivePgAsyncConnection(client: SqlConnection, configuration: Configuration)
  extends AbstractReactivePgAsyncClient[SqlConnection](client, configuration)
  with PgAsyncConnection {

  override def close: Future[Any] = {
    val p = Promise[Any]
    client.closeHandler(_ => p.complete(Success(())))
    p.future
  }

  override def begin: Future[PgAsyncTransaction] = {
    Future.successful(new ReactivePgAsyncTransaction(client.begin(), configuration))
  }
}
