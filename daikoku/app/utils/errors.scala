package fr.maif.otoroshi.daikoku.utils

import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.login._
import fr.maif.otoroshi.daikoku.utils.RequestImplicits.EnhancedRequestHeader
import org.apache.pekko.http.scaladsl.util.FastFuture
import play.api.libs.json.Json
import play.api.mvc.Results.{Redirect, Status}
import play.api.mvc.{RequestHeader, Result}

import scala.concurrent.Future

object Errors {

  val messages = Map(
    404 -> ("The page you're looking for does not exist", "notFound.gif")
  )

  def craftResponseResult(
      message: String,
      status: Status,
      req: RequestHeader,
      maybeCauseId: Option[String] = None,
      env: Env,
      tenant: Tenant
  ): Future[Result] = {

    val accept = req.headers.get("Accept").getOrElse("text/html").split(",").toSeq

    if (accept.contains("text/html")) {
      FastFuture.successful(
        Redirect(s"${req.theProtocol}://${tenant.domain}:${env.config.exposedPort}/error")
          .withHeaders(
            "x-error" -> "true",
            "x-error-msg" -> message
            // TODO: handled by otoroshi filter ?
            // env.config.identitySettings.stateRespHeaderName -> req.headers
            //   .get(env.config.identitySettings.stateHeaderName)
            //   .getOrElse("--")
          )
      )
    } else {
      FastFuture.successful(
        status
          .apply(Json.obj("error" -> message))
          .withHeaders(
            "x-error" -> "true",
            "x-error-msg" -> message
            // TODO: handled by otoroshi filter ?
            // env.config.identitySettings.stateRespHeaderName -> req.headers
            //   .get(env.config.identitySettings.stateHeaderName)
            //   .getOrElse("--")
          )
      )
    }
  }
}
