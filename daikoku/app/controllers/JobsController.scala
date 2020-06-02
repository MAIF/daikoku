package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.OtoroshiClient
import jobs.{ApiKeyStatsJob, OtoroshiVerifierJob}
import play.api.libs.json.Json
import play.api.mvc.{AbstractController, ControllerComponents}

class JobsController(otoroshiVerifierJob: OtoroshiVerifierJob,
                     apiKeyStatsJob: ApiKeyStatsJob,
                     env: Env,
                     cc: ControllerComponents,
                     otoroshiClient: OtoroshiClient)
    extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  def otoroshiSyncJob() = Action.async { req =>
    if (env.config.otoroshiSyncByCron) {
      req.getQueryString("key") match {
        case Some(key) if key == env.config.otoroshiSyncKey => {
          otoroshiVerifierJob.verify().map(_ => Ok(Json.obj("done" -> true)))
        }
        case _ =>
          FastFuture.successful(
            Ok(Json.obj("error" -> "you're not authorized here !")))
      }
    } else {
      FastFuture.successful(
        NotFound(Json.obj("error" -> "API not found")))
    }
  }

  def apikeysStatsSyncJob() = Action.async { req =>
    if (env.config.apikeysStatsByCron) {
      apiKeyStatsJob.getStats.map(_ => Ok(Json.obj("done" -> true)))
    } else {
      FastFuture.successful(
        NotFound(Json.obj("error" -> "API not found")))
    }
  }
}
