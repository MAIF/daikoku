package fr.maif.otoroshi.daikoku.env

import akka.Done
import akka.http.scaladsl.util.FastFuture
import akka.stream.Materializer
import akka.stream.scaladsl.{Sink, Source}
import fr.maif.otoroshi.daikoku.domain.json.ApiFormat
import fr.maif.otoroshi.daikoku.domain.{DatastoreId, Evolution}
import fr.maif.otoroshi.daikoku.logger.AppLogger
import play.api.libs.json.{JsArray, JsError, JsObject, JsString, JsSuccess, Json}
import reactivemongo.api.bson.BSONObjectID
import storage.DataStore

import scala.concurrent.{ExecutionContext, Future}
import scala.util.Success

sealed trait EvolutionScript {
  def version: String
  def script: (Option[DatastoreId], DataStore, Materializer, ExecutionContext) => Unit
  def run(maybeId: Option[DatastoreId], dataStore: DataStore)(implicit mat: Materializer, ec: ExecutionContext): Unit =
    script(maybeId, dataStore, mat, ec)
}

object evolution_102 extends EvolutionScript {
  override def version: String = "1.0.2"

  override def script: (Option[DatastoreId], DataStore, Materializer, ExecutionContext) => Unit = (maybeId: Option[DatastoreId], dataStore: DataStore, mat: Materializer, ec: ExecutionContext) => {
    AppLogger.info("Begin evolution 1.0.2")
    dataStore.apiRepo.forAllTenant().streamAllRaw()(ec)
      .filter(value => (value \ "possibleUsagePlans").as[JsArray].value.exists(plan => (plan \ "otoroshiTarget" \ "serviceGroup").asOpt[String].isDefined))
      .mapAsync(10) { value =>
        val usagePlans = (value \ "possibleUsagePlans").as[JsArray]
        val newPlans = usagePlans.value.map(plan => {

          val oldGroupValue = (plan \ "otoroshiTarget" \ "serviceGroup").asOpt[String]
          if (oldGroupValue.isDefined) {
            val oldOtoroshiTarget = (plan \ "otoroshiTarget").as[JsObject]
            val maybeOtoroshiTarget = oldOtoroshiTarget - "serviceGroup" ++
              Json.obj(
              "authorizedEntities" -> Json.obj(
                "groups" -> JsArray(Seq(JsString(oldGroupValue.get))),
                "services" -> JsArray()
              ))
            plan.as[JsObject] ++ Json.obj("otoroshiTarget" -> maybeOtoroshiTarget)
          } else {
            plan
          }
        })
        val goodApi = value.as[JsObject] ++ Json.obj("possibleUsagePlans" -> JsArray(newPlans))
        dataStore.apiRepo.forAllTenant().save(Json.obj("_id" -> (goodApi \ "_id").as[String]), goodApi)(ec)
      }
      .runWith(Sink.ignore)(mat)
      .onComplete {
        case Success(done) =>
          dataStore.evolutionRepo.save(Evolution(
          id = maybeId.getOrElse(DatastoreId(BSONObjectID.generate().stringify)),
          version = "1.0.2",
          applied = true
        ))(ec).map(_ => AppLogger.info(s"Evolution 1.0.2 done"))(ec)
        case _ => AppLogger.error(s"Evolution 1.0.2 could not be applied")
      }(ec)
  }
}

object setIsDefaultOnAllApi extends EvolutionScript {
  override def version: String = "1.1.5"

  override def script: (Option[DatastoreId], DataStore, Materializer, ExecutionContext) => Unit = (maybeId: Option[DatastoreId], dataStore: DataStore, mat: Materializer, ec: ExecutionContext) => {
    AppLogger.info(s"Begin evolution $version - Set isDefault at true on all api")

    dataStore.apiRepo.forAllTenant().streamAllRaw()(ec)
      .mapAsync(10) { value =>
        ApiFormat.reads(value) match {
          case JsSuccess(api, _) => dataStore.apiRepo.forAllTenant().save(api.copy(isDefault = true))(ec)
          case JsError(errors) => FastFuture.successful(AppLogger.error(s"Evolution $version : $errors"))
        }
      }
      .runWith(Sink.ignore)(mat)
      .onComplete {
        case Success(_) =>
          dataStore.evolutionRepo.save(Evolution(
            id = maybeId.getOrElse(DatastoreId(BSONObjectID.generate().stringify)),
            version = version,
            applied = true
          ))(ec).map(_ => AppLogger.info(s"Evolution $version done"))(ec)
        case _ => AppLogger.error(s"Evolution $version could not be applied")
      }(ec)
  }
}

object evolutions {
  val list: Set[EvolutionScript] = Set(evolution_102, setIsDefaultOnAllApi)
  def run(dataStore: DataStore)(implicit ec: ExecutionContext, mat: Materializer): Future[Done] = Source(list)
    .mapAsync(2) {
      evolution =>
        dataStore.evolutionRepo.findOne(Json.obj("version" -> evolution.version)).map {
          case None => evolution.run(None, dataStore)
          case Some(e) if !e.applied => evolution.run(Some(e.id), dataStore)
        }
    }
    .runWith(Sink.ignore)
}

