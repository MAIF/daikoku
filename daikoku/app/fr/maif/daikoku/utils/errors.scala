package fr.maif.daikoku.utils

import org.apache.pekko.http.scaladsl.util.FastFuture
import play.api.libs.json.Json
import play.api.mvc.Result
import play.api.mvc.Results.Status

import scala.concurrent.Future

object Errors {

  def craftResponseResultF(
      message: String,
      status: Status
  ): Future[Result] = {
    FastFuture.successful(craftResponseResult(message, status))
  }
  def craftResponseResult(
      message: String,
      status: Status
  ): Result = {
    status
      .apply(Json.obj("error" -> message))
      .withHeaders(
        "x-error" -> "true",
        "x-error-msg" -> message
      )
  }
}
