package fr.maif.daikoku.controllers

import fr.maif.daikoku.actions.DaikokuTenantAction
import fr.maif.daikoku.audit.AuditTrailEvent
import fr.maif.daikoku.domain.{
  RemoteCatalog,
  RemoteCatalogRun,
  RemoteCatalogRunStatus,
  Tenant,
  User
}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.jobs.RemoteCatalogJob
import fr.maif.daikoku.logger.AppLogger
import fr.maif.daikoku.services.catalog.{
  CatalogFile,
  CatalogSources,
  DeployReport,
  RemoteCatalogEngine
}
import org.apache.pekko.util.ByteString
import play.api.libs.json._
import play.api.mvc.{
  AbstractController,
  ControllerComponents,
  Request,
  RequestHeader,
  Result
}

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

object RemoteCatalogTokenController {

  def hmacSha256Hex(secret: String, body: ByteString): String = {
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(
      new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256")
    )
    mac.doFinal(body.toArray).map(b => f"$b%02x").mkString
  }
}

class RemoteCatalogTokenController(
    DaikokuTenantAction: DaikokuTenantAction,
    engine: RemoteCatalogEngine,
    job: RemoteCatalogJob,
    env: Env,
    cc: ControllerComponents
) extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  def validate(catalogId: String) =
    DaikokuTenantAction.async(parse.json) { ctx =>
      withCatalogToken(ctx.tenant, catalogId, ctx.request) { catalog =>
        auditTokenAction(ctx.tenant, ctx.request, catalogId, "validate")

        CatalogFile.readAll(ctx.request.body) match {
          case None =>
            Future.successful(
              BadRequest(
                Json.obj("error" -> "Expected an array of {path, content}")
              )
            )
          case Some(files) =>
            engine.validate(ctx.tenant, catalog, files).map(runResult)
        }
      }
    }

  def test(catalogId: String) =
    DaikokuTenantAction.async { ctx =>
      withCatalogToken(ctx.tenant, catalogId, ctx.request) { catalog =>
        auditTokenAction(ctx.tenant, ctx.request, catalogId, "test")

        engine.dryRun(ctx.tenant, catalog).map(runResult)
      }
    }

  def deploy(catalogId: String) =
    DaikokuTenantAction.async { ctx =>
      withCatalogToken(ctx.tenant, catalogId, ctx.request) { catalog =>
        auditTokenAction(ctx.tenant, ctx.request, catalogId, "deploy")

        job.deploy(ctx.tenant, catalog).map(toResult)
      }
    }

  def undeploy(catalogId: String) =
    DaikokuTenantAction.async { ctx =>
      withCatalogToken(ctx.tenant, catalogId, ctx.request) { catalog =>
        auditTokenAction(ctx.tenant, ctx.request, catalogId, "undeploy")

        job.undeploy(ctx.tenant, catalog).map(toResult)
      }
    }

  def webhook(catalogId: String) =
    DaikokuTenantAction.async(parse.byteString) { ctx =>
      env.dataStore.remoteCatalogRepo
        .forTenant(ctx.tenant)
        .findById(catalogId)
        .flatMap {
          case Some(catalog) if !supportsWebhook(catalog) =>
            Future.successful(
              BadRequest(
                Json.obj(
                  "error" -> s"${catalog.source.kind} source does not support webhooks"
                )
              )
            )
          case Some(catalog) if webhookAuthenticated(catalog, ctx.request) =>
            auditTokenAction(ctx.tenant, ctx.request, catalogId, "webhook")
            handleWebhook(ctx.tenant, catalog, ctx.request)
          case _ =>
            Future.successful(
              Unauthorized(Json.obj("error" -> "Invalid remote catalog webhook"))
            )
        }
    }

  // GitHub wants a 2XX within 10 seconds: the deploy runs in the background
  private def handleWebhook(
      tenant: Tenant,
      catalog: RemoteCatalog,
      request: Request[ByteString]
  ): Future[Result] = {
    val isPush = catalog.source.kind match {
      case "github" => request.headers.get("X-GitHub-Event").contains("push")
      case _ => request.headers.get("X-Gitlab-Event").contains("Push Hook")
    }

    if (!request.contentType.contains("application/json")) {
      Future.successful(
        BadRequest(
          Json.obj("error" -> "Webhook content type must be application/json")
        )
      )
    } else if (!isPush) {
      Future.successful(Accepted(Json.obj("ignored" -> "not a push event")))
    } else {
      val payload = Try(Json.parse(request.body.toArray)).getOrElse(JsNull)

      CatalogSources
        .get(catalog.source.kind)
        .fold(Future.successful(Right(Seq.empty)))(
          _.webhookDeploySelect(Seq(catalog), payload)(using ec, env)
        )
        .map {
          case Right(selected) if selected.nonEmpty =>
            job.deploy(tenant, catalog).foreach {
              case Left(error) =>
                AppLogger.warn(
                  s"webhook deploy of catalog ${catalog.id.value} refused: ${Json.stringify(error)}"
                )
              case Right(_) => ()
            }
            Accepted(Json.obj("deploying" -> catalog.id.value))
          case _ =>
            Accepted(
              Json.obj("ignored" -> "not the repository or branch of the catalog")
            )
        }
    }
  }

  private def toResult(result: Either[JsValue, DeployReport]): Result =
    result match {
      case Left(err)     => BadRequest(err)
      case Right(report) => Ok(report.json)
    }

  private def runResult(run: RemoteCatalogRun): Result =
    if (run.status == RemoteCatalogRunStatus.Failed) BadRequest(run.asJson)
    else Ok(run.asJson)

  private def withCatalogToken(
      tenant: Tenant,
      catalogId: String,
      request: RequestHeader
  )(f: RemoteCatalog => Future[Result]): Future[Result] = {
    val presented = request.headers
      .get("Authorization")
      .map(_.stripPrefix("Bearer ").trim)

    env.dataStore.remoteCatalogRepo
      .forTenant(tenant)
      .findById(catalogId)
      .flatMap { maybeCatalog =>
        maybeCatalog.filter(catalog => tokenMatches(catalog, presented)) match {
          case Some(catalog) => f(catalog)
          case None =>
            Future.successful(
              Unauthorized(Json.obj("error" -> "Invalid remote catalog token"))
            )
        }
      }
  }

  private def auditTokenAction(
      tenant: Tenant,
      request: RequestHeader,
      catalogId: String,
      action: String
  ): Unit =
    AuditTrailEvent(
      s"Remote catalog $catalogId $action with its token"
    ).logAdminApiAuditEvent(
      tenant,
      User.system,
      request,
      Json.obj("catalog" -> catalogId, "action" -> action)
    )

  private def tokenMatches(
      catalog: RemoteCatalog,
      presented: Option[String]
  ): Boolean =
    presented.exists(token =>
      MessageDigest.isEqual(
        catalog.token.getBytes(StandardCharsets.UTF_8),
        token.getBytes(StandardCharsets.UTF_8)
      )
    )

  private def supportsWebhook(catalog: RemoteCatalog): Boolean =
    CatalogSources.get(catalog.source.kind).exists(_.supportsWebhook)

  // GitHub signs the raw body with the token, GitLab sends the token as is
  private def webhookAuthenticated(
      catalog: RemoteCatalog,
      request: Request[ByteString]
  ): Boolean =
    catalog.source.kind match {
      case "github" =>
        val expected = "sha256=" +
          RemoteCatalogTokenController.hmacSha256Hex(catalog.token, request.body)

        request.headers
          .get("X-Hub-Signature-256")
          .exists(signature =>
            MessageDigest.isEqual(
              expected.getBytes(StandardCharsets.UTF_8),
              signature.getBytes(StandardCharsets.UTF_8)
            )
          )
      case "gitlab" =>
        tokenMatches(catalog, request.headers.get("X-Gitlab-Token"))
      case _ => false
    }
}
