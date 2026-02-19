package fr.maif.daikoku.controllers

import fr.maif.daikoku.actions.DaikokuAction
import fr.maif.daikoku.audit.AuditTrailEvent
import fr.maif.daikoku.controllers.authorizations.async._
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.utils.OtoroshiClient
import org.joda.time.DateTime
import play.api.libs.json.{JsArray, Json}
import play.api.mvc.{AbstractController, ControllerComponents}

import scala.concurrent.ExecutionContext

class AuditTrailController(
    DaikokuAction: DaikokuAction,
    env: Env,
    otoroshiClient: OtoroshiClient,
    cc: ControllerComponents
) extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  def auditTrail() =
    DaikokuAction.async { ctx =>
      val from = ctx.request
        .getQueryString("from")
        .map(_.toLong)
        .getOrElse(DateTime.now().minusHours(1).getMillis)
      val to = ctx.request
        .getQueryString("to")
        .map(_.toLong)
        .getOrElse(DateTime.now().getMillis)
      val page = ctx.request.getQueryString("page").map(_.toInt).getOrElse(1)
      val size = ctx.request.getQueryString("size").map(_.toInt).getOrElse(500)
      val position = (page - 1) * size

      TenantAdminOnly(
        AuditTrailEvent(
          s"@{user.name} has accessed audit trail from ${new DateTime(from)
              .toString()} to ${new DateTime(to).toString()}"
        )
      )(ctx.tenant.id.value, ctx) { (tenant, _) =>
        env.dataStore.auditTrailRepo
          .forTenant(tenant.id)
          .find(
            Json.obj(
              "@timestamp" -> Json.obj(
                "$gte" -> from,
                "$lte" -> to
              )
            ),
            Some(Json.obj("@timestamp" -> -1))
          )
          .map { events =>
            Ok(
              Json.obj(
                "size" -> events.size,
                "events" -> JsArray(events.slice(position, position + size))
              )
            )
          }
      }
    }
}
