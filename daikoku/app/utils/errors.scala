package fr.maif.otoroshi.daikoku.utils

import akka.http.scaladsl.util.FastFuture
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.login._
import play.api.libs.json.Json
import play.api.mvc.Results.Status
import play.api.mvc.{RequestHeader, Result}

import scala.concurrent.Future

object Errors {

  val defaultTenant = Tenant(
    id = Tenant.Default,
    name = "Daikoky",
    domain = "localhost",
    defaultLanguage = Some("En"),
    style = Some(
      DaikokuStyle(
        title = "Daikoku"
      )),
    mailerSettings = Some(ConsoleMailerSettings()),
    authProvider = AuthProvider.Local,
    authProviderSettings = Json.obj(
      "sessionMaxAge" -> 86400
    ),
    bucketSettings = None,
    otoroshiSettings = Set.empty,
    adminApi = ApiId("no-api")
  )

  val messages = Map(
    404 -> ("The page you're looking for does not exist", "notFound.gif")
  )

  def craftResponseResult(message: String,
                          status: Status,
                          req: RequestHeader,
                          maybeCauseId: Option[String] = None,
                          env: Env,
                          tenant: Tenant = defaultTenant): Future[Result] = {

    val accept =
      req.headers.get("Accept").getOrElse("text/html").split(",").toSeq
    if (accept.contains("text/html")) { // in a browser
      FastFuture.successful(
        status
          .apply(
            views.html.error(
              message = message,
              req.domain,
              _env = env,
              tenant = tenant
            )
          )
          .withHeaders(
            "x-error" -> "true",
            "x-error-msg" -> message,
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
            "x-error-msg" -> message,
            // TODO: handled by otoroshi filter ?
            // env.config.identitySettings.stateRespHeaderName -> req.headers
            //   .get(env.config.identitySettings.stateHeaderName)
            //   .getOrElse("--")
          )
      )
    }
  }
}
