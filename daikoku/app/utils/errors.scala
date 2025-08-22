package fr.maif.otoroshi.daikoku.utils

import fr.maif.otoroshi.daikoku.env.Env
import org.apache.pekko.http.scaladsl.util.FastFuture
import play.api.libs.json.Json
import play.api.mvc.Results.Status
import play.api.mvc.{RequestHeader, Result}

import scala.concurrent.Future

object Errors {

  def craftResponseResultF(
      message: String,
      status: Status,
      req: RequestHeader,
      maybeCauseId: Option[String] = None,
      env: Env
  ): Future[Result] = {
    FastFuture.successful(craftResponseResult(message, status, req, maybeCauseId, env))
  }
  def craftResponseResult(
      message: String,
      status: Status,
      req: RequestHeader,
      maybeCauseId: Option[String] = None,
      env: Env
  ): Result = {
    status
      .apply(Json.obj("error" -> message))
      .withHeaders(
        "x-error" -> "true",
        "x-error-msg" -> message
      )
  }
}
