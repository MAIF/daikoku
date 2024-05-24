package fr.maif.otoroshi.daikoku.utils

import diffson.PatchOps
import org.apache.pekko.http.scaladsl.util.FastFuture
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.login._
import fr.maif.otoroshi.daikoku.utils.RequestImplicits.EnhancedRequestHeader
import play.api.libs.json.Json
import play.api.mvc.Results.{Redirect, Status}
import play.api.mvc.{Request, RequestHeader, Result}

import scala.concurrent.Future

object Errors {

  val defaultTenant = Tenant(
    id = Tenant.Default,
    name = "Daikoky",
    domain = "localhost",
    defaultLanguage = Some("En"),
    contact = "contact@foo.bar",
    style = Some(
      DaikokuStyle(
        title = "Daikoku"
      )
    ),
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

  def craftResponseResult(
      message: String,
      status: Status,
      req: RequestHeader,
      maybeCauseId: Option[String] = None,
      env: Env,
      tenant: Tenant
  ): Future[Result] = {

    val accept = req.headers.get("Accept").getOrElse("text/html").split(",").toSeq

    if (accept.contains("text/html") && env.config.isDev) {
      FastFuture.successful(
        Redirect(s"${req.theProtocol}://${tenant.domain}:${env.config.exposedPort}/")
          .withHeaders(
            "x-error" -> "true",
            "x-error-msg" -> message
            // TODO: handled by otoroshi filter ?
            // env.config.identitySettings.stateRespHeaderName -> req.headers
            //   .get(env.config.identitySettings.stateHeaderName)
            //   .getOrElse("--")
          )
      )
    } else if (accept.contains("text/html") && env.config.isProd) {
      assets.at("index.html")
        .apply(req)
    }

    else {
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
