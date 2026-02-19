package fr.maif.daikoku.controllers

import fr.maif.daikoku.env.Env
import fr.maif.daikoku.jobs
import fr.maif.daikoku.utils.OtoroshiClient
import org.apache.pekko.http.scaladsl.util.FastFuture
import fr.maif.daikoku.jobs.{ApiKeyStatsJob, AuditTrailPurgeJob, OtoroshiVerifierJob}
import play.api.libs.json.Json
import play.api.mvc.{AbstractController, ControllerComponents}

import scala.concurrent.ExecutionContext

class JobsController(
    otoroshiVerifierJob: OtoroshiVerifierJob,
    apiKeyStatsJob: ApiKeyStatsJob,
    auditTrailPurgeJob: AuditTrailPurgeJob,
    env: Env,
    cc: ControllerComponents,
    otoroshiClient: OtoroshiClient
) extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  def otoroshiSyncJob() =
    Action.async { req =>
      if (env.config.otoroshiSyncByCron) {
        req.getQueryString("key") match {
          case Some(key) if key == env.config.otoroshiSyncKey => {
            otoroshiVerifierJob.verify().map(_ => Ok(Json.obj("done" -> true)))
          }
          case _ =>
            FastFuture.successful(
              Ok(Json.obj("error" -> "you're not authorized here !"))
            )
        }
      } else {
        FastFuture.successful(NotFound(Json.obj("error" -> "API not found")))
      }
    }

  def apikeysStatsSyncJob() =
    Action.async { req =>
      if (env.config.apikeysStatsByCron) {
        apiKeyStatsJob.getStats.map(_ => Ok(Json.obj("done" -> true)))
      } else {
        FastFuture.successful(NotFound(Json.obj("error" -> "API not found")))
      }
    }

  def auditTrailPurgeRunJob() =
    Action.async { req =>
      if (env.config.apikeysStatsByCron) {
        auditTrailPurgeJob.purge().map(_ => Ok(Json.obj("done" -> true)))
      } else {
        FastFuture.successful(NotFound(Json.obj("error" -> "API not found")))
      }
    }
}
