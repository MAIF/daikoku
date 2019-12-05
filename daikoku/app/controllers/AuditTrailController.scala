package fr.maif.otoroshi.daikoku.ctrls

import fr.maif.otoroshi.daikoku.actions.DaikokuAction
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.OtoroshiClient
import org.joda.time.DateTime
import play.api.libs.json.{JsArray, Json}
import play.api.mvc.{AbstractController, ControllerComponents}

class AuditTrailController(DaikokuAction: DaikokuAction,
                      env: Env,
                      otoroshiClient: OtoroshiClient,
                      cc: ControllerComponents)
  extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  def auditTrail() = DaikokuAction.async { ctx =>
    val from = ctx.request.getQueryString("from").map(_.toLong).getOrElse(DateTime.now().minusHours(1).getMillis)
    val to = ctx.request.getQueryString("to").map(_.toLong).getOrElse(DateTime.now().getMillis)
    val page = ctx.request.getQueryString("page").map(_.toInt).getOrElse(1)
    val size = ctx.request.getQueryString("size").map(_.toInt).getOrElse(500)
    val position = (page - 1) * size
    DaikokuAdminOnly(AuditTrailEvent(s"@{user.name} has accessed audit trail from ${new DateTime(from).toString()} to ${new DateTime(to).toString()}"))(ctx) {
      env.dataStore.auditTrailRepo.forTenant(ctx.tenant.id).find(Json.obj(
        "@timestamp" -> Json.obj(
          "$gte" -> from,
          "$lte" -> to
        )
      ), Some(Json.obj("@timestamp" -> -1))).map { events =>
        Ok(Json.obj("size" -> events.size, "events" -> JsArray(events.slice(position, position + size))))
      }
    }
  }
}