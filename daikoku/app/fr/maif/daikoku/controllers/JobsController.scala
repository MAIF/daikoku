package fr.maif.daikoku.controllers

import fr.maif.daikoku.domain.{ApiId, ApiSubscriptionId, UsagePlanId}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.utils.{DaikokuApiAction, OtoroshiClient}
import org.apache.pekko.http.scaladsl.util.FastFuture
import fr.maif.daikoku.jobs.*
import fr.maif.daikoku.login.TenantHelper
import play.api.libs.json.Json
import play.api.mvc.{
  AbstractController,
  Action,
  AnyContent,
  ControllerComponents
}

import scala.concurrent.Future
import scala.concurrent.ExecutionContext

class JobsController(
    DaikokuApiAction: DaikokuApiAction,
    otoroshiSynchronizerJob: OtoroshiSynchronizerJob,
    rotationJob: ApiKeySecretRotationJob,
    verifierJob: OtoroshiEntitiesVerifierJob,
    apiKeyStatsJob: ApiKeyStatsJob,
    auditTrailPurgeJob: AuditTrailPurgeJob,
    env: Env,
    cc: ControllerComponents,
    otoroshiClient: OtoroshiClient
) extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  def otoroshiSyncJob(parallelism: Int = 25): Action[AnyContent] =
    Action.async { ctx =>
      TenantHelper.withTenant(ctx, env) { tenant =>
        ctx
          .getQueryString("access_key")
          .orElse(ctx.getQueryString("key")) match {
          case Some(key) if env.config.otoroshiSyncKey.contains(key) =>
            val entryPoint
                : ApiId | UsagePlanId | ApiSubscriptionId | SyncAllSubscription =
              ctx.getQueryString("subscription") match {
                case Some(id) => ApiSubscriptionId(id)
                case None =>
                  ctx.getQueryString("plan") match {
                    case Some(id) => UsagePlanId(id)
                    case None =>
                      ctx.getQueryString("api") match {
                        case Some(id) => ApiId(id)
                        case None     => SyncAllSubscription()
                      }
                  }
              }
            otoroshiSynchronizerJob
              .run(
                entryPoint = entryPoint,
                tenant = tenant,
                parallelism = parallelism
              )
              .map(_ => Ok(Json.obj("done" -> true)))
          case _ => AppError.Unauthorized.renderF()
        }
      }
    }

  def rotationSyncJob(parallelism: Int = 25): Action[AnyContent] =
    Action.async { ctx =>
      TenantHelper.withTenant(ctx, env) { tenant =>
        ctx
          .getQueryString("access_key")
          .orElse(ctx.getQueryString("key")) match {
          case Some(key) if env.config.rotationJobKey.contains(key) =>
            rotationJob
              .run(
                tenant = tenant,
                runBy = Runner.Api,
                parallelism = parallelism
              )
              .map(_ => Ok(Json.obj("done" -> true)))
          case _ => AppError.Unauthorized.renderF()
        }
      }
    }

  def verifierSyncJob(parallelism: Int = 25): Action[AnyContent] =
    Action.async { ctx =>
      TenantHelper.withTenant(ctx, env) { tenant =>
        ctx
          .getQueryString("access_key")
          .orElse(ctx.getQueryString("key")) match {
          case Some(key) if env.config.verifierJobKey.contains(key) =>
            verifierJob
              .run(tenant = tenant)
              .map(_ => Ok(Json.obj("done" -> true)))
          case _ => AppError.Unauthorized.renderF()
        }
      }
    }

  def apikeysStatsSyncJob(): Action[AnyContent] =
    Action.async { req =>
      if (env.config.apikeysStatsByCron) {
        apiKeyStatsJob.getStats.map(_ => Ok(Json.obj("done" -> true)))
      } else {
        FastFuture.successful(NotFound(Json.obj("error" -> "API not found")))
      }
    }

  def auditTrailPurgeRunJob(): Action[AnyContent] =
    Action.async { req =>
      if (env.config.auditTrailPurgeByCron) {
        auditTrailPurgeJob.purge().map(_ => Ok(Json.obj("done" -> true)))
      } else {
        FastFuture.successful(NotFound(Json.obj("error" -> "API not found")))
      }
    }
}
