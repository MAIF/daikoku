package storage

import fr.maif.otoroshi.daikoku.env.Env
import play.modules.reactivemongo.ReactiveMongoApi
import storage.mongo.MongoDataStore
import storage.postgres.{PostgresConnection, PostgresDataStore}

object Manager {
  def getDataStore(env: Env, postgresConnection: PostgresConnection, reactiveMongoApi: ReactiveMongoApi): DataStore = {
    // TODO - Faire le switch selon la configuration
    new MongoDataStore(env, reactiveMongoApi)

//    new PostgresDataStore(env, postgresConnection)
  }
}
