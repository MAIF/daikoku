package fr.maif.otoroshi.daikoku.ctrls

import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.scaladsl.{Sink, Source}
import org.apache.pekko.util.ByteString
import fr.maif.otoroshi.daikoku.actions.{
  DaikokuAction,
  DaikokuActionContext,
  DaikokuActionMaybeWithGuest,
  DaikokuTenantAction
}
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async._
import fr.maif.otoroshi.daikoku.domain.{Asset, AssetId}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.services.{AssetsService, NormalizeSupport}
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import fr.maif.otoroshi.daikoku.utils.StringImplicits.BetterString
import org.apache.pekko.stream.connectors.s3.ObjectMetadata
import play.api.http.HttpEntity
import play.api.libs.json.{JsArray, JsObject, Json}
import play.api.libs.streams.Accumulator
import play.api.mvc.{
  AbstractController,
  Action,
  AnyContent,
  BodyParser,
  ControllerComponents
}

import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration.DurationInt
import scala.jdk.CollectionConverters._

class TeamAssetsController(
    DaikokuAction: DaikokuAction,
    DaikokuActionMaybeWithGuest: DaikokuActionMaybeWithGuest,
    env: Env,
    cc: ControllerComponents
) extends AbstractController(cc)
    with NormalizeSupport {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  val bodyParser: BodyParser[Source[ByteString, _]] =
    BodyParser("Assets parser") { _ =>
      Accumulator.source[ByteString].map(Right.apply)
    }

  val illegalTeamAssetContentTypes: Seq[String] =
    Seq("text/html", "text/css", "text/javascript", "application/x-javascript")

  def storeAsset(teamId: String): Action[Source[ByteString, _]] =
    DaikokuAction.async(bodyParser) { ctx =>
      TeamApiEditorOnly(
        AuditTrailEvent(s"@{user.name} stores asset in team @{team.id}")
      )(teamId, ctx) { team =>
        val contentType = ctx.request.headers
          .get("Asset-Content-Type")
          .orElse(ctx.request.contentType)
          .getOrElse("application/octet-stream")
        val filename = normalize(
          ctx.request
            .getQueryString("filename")
            .getOrElse(IdGenerator.token(16))
        )
        val title = ctx.request.getQueryString("title").getOrElse("--")
        val desc = ctx.request.getQueryString("desc").getOrElse("--")
        val assetId = AssetId(IdGenerator.uuid)
        ctx.tenant.bucketSettings match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "No bucket config found !"))
            )
          case Some(_) if illegalTeamAssetContentTypes.contains(contentType) =>
            FastFuture.successful(
              Forbidden(Json.obj("error" -> "content type is not allowed"))
            )
          case Some(cfg) =>
            env.assetsStore
              .storeAsset(
                ctx.tenant.id,
                team.id,
                assetId,
                filename,
                title,
                desc,
                contentType,
                ctx.request.body
              )(cfg)
              .map { res =>
                Ok(Json.obj("done" -> true, "id" -> assetId.value))
              } recover {
              case e: fr.maif.otoroshi.daikoku.utils.BadFileContentFromContentType =>
                BadRequest(Json.obj("error" -> "Bad file content"))
              case e =>
                AppLogger.error(
                  s"Error during team asset storage: ${e.getMessage}",
                  e
                )
                InternalServerError(Json.obj("error" -> e.toString))
            }
        }
      }
    }

  def replaceAsset(
      teamId: String,
      assetId: String
  ): Action[Source[ByteString, _]] =
    DaikokuAction.async(bodyParser) { ctx =>
      TeamApiEditorOnly(
        AuditTrailEvent(s"@{user.name} replace asset in team @{team.id}")
      )(teamId, ctx) { team =>
        def getMetaHeaderValue(
            metadata: ObjectMetadata,
            headerName: String
        ): Option[String] = {
          metadata.headers.asScala
            .find(_.name() == s"x-amz-meta-$headerName")
            .map(_.value())
        }

        val requestContentType = ctx.request.headers
          .get("Asset-Content-Type")
          .orElse(ctx.request.contentType)
          .getOrElse("application/octet-stream")

        ctx.tenant.bucketSettings match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "No bucket config found !"))
            )
          case Some(cfg) =>
            env.assetsStore
              .getAssetMetaHeaders(ctx.tenant.id, team.id, AssetId(assetId))(
                cfg
              )
              .flatMap {
                case None =>
                  FastFuture.successful(
                    NotFound(Json.obj("error" -> "Asset not found"))
                  )
                case Some(metadata)
                    if metadata.contentType.get != requestContentType =>
                  FastFuture.successful(
                    Forbidden(
                      Json.obj(
                        "error" -> "content type is different from the original"
                      )
                    )
                  )
                case Some(_)
                    if illegalTeamAssetContentTypes.contains(
                      requestContentType
                    ) =>
                  FastFuture.successful(
                    Forbidden(
                      Json.obj("error" -> "content type is not allowed")
                    )
                  )
                case Some(metadata) =>
                  val filename =
                    getMetaHeaderValue(metadata, "filename").getOrElse("--")
                  val desc =
                    getMetaHeaderValue(metadata, "desc").getOrElse("--")
                  val title =
                    getMetaHeaderValue(metadata, "title").getOrElse("--")
                  val contentType = metadata.contentType
                    .orElse(ctx.request.contentType)
                    .getOrElse("application/octet-stream")

                  env.assetsStore
                    .storeAsset(
                      ctx.tenant.id,
                      team.id,
                      AssetId(assetId),
                      filename,
                      title,
                      desc,
                      contentType,
                      ctx.request.body
                    )(cfg)
                    .flatMap { _ =>
                      val slug = filename.slugify
                      env.dataStore.assetRepo
                        .forTenant(ctx.tenant)
                        .deleteById(assetId)
                        .flatMap(_ =>
                          env.dataStore.assetRepo
                            .forTenant(ctx.tenant)
                            .save(
                              Asset(
                                AssetId(assetId),
                                tenant = ctx.tenant.id,
                                slug
                              )
                            )
                        )
                        .map(_ => Ok(Json.obj("done" -> true, "id" -> assetId)))
                    } recover {
                    case e =>
                      AppLogger.error(
                        s"Error during update tenant asset: $filename",
                        e
                      )
                      InternalServerError(Json.obj("error" -> ec.toString))
                  }
              }
        }
      }
    }

  def listAssets(teamId: String) =
    DaikokuAction.async { ctx =>
      TeamAdminOrTenantAdminOnly(
        AuditTrailEvent(
          s"@{user.name} listed assets of team @{team.name} - @{team.id}"
        )
      )(teamId, ctx) { team =>
        ctx.tenant.bucketSettings match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "No bucket config found !"))
            )
          case Some(cfg) =>
            env.assetsStore.listAssets(ctx.tenant.id, team.id)(cfg).map { res =>
              Ok(JsArray(res.map(_.asJson)))
            }
        }
      }
    }

  def deleteAsset(teamId: String, assetId: String) =
    DaikokuAction.async { ctx =>
      TeamApiEditorOnly(
        AuditTrailEvent(s"@{user.name} deleted asset @{assetId} of @{team.id}")
      )(teamId, ctx) { team =>
        ctx.setCtxValue("assetId", assetId)
        ctx.tenant.bucketSettings match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "No bucket config found !"))
            )
          case Some(cfg) =>
            env.assetsStore
              .deleteAsset(ctx.tenant.id, team.id, AssetId(assetId))(cfg)
              .map { res =>
                Ok(Json.obj("done" -> true))
              }
        }
      }
    }

  def getAsset(teamId: String, assetId: String) =
    DaikokuActionMaybeWithGuest.async { ctx =>
      // TODO: validate if usser has right to see the asset based on team and api
      UberPublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} accessed asset @{assetId} on team @{teamId}"
        )
      )(ctx) {
        ctx.setCtxValue("teamId", teamId)
        ctx.setCtxValue("assetId", assetId)
        ctx.tenant.bucketSettings match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "No bucket config found !"))
            )
          case Some(cfg) =>
            env.dataStore.teamRepo
              .forTenant(ctx.tenant)
              .findById(teamId)
              .flatMap {
                case None =>
                  FastFuture.successful(
                    NotFound(Json.obj("error" -> "Team not found!"))
                  )
                case Some(team) =>
                  env.assetsStore
                    .getAsset(ctx.tenant.id, team.id, AssetId(assetId))(cfg)
                    .map {
                      case Some((source, meta)) =>
                        val filename = meta.metadata
                          .filter(_.name().startsWith("x-amz-meta-"))
                          .find(_.name() == "x-amz-meta-filename")
                          .map(_.value())
                          .getOrElse("asset.txt")
                        val disposition =
                          ("Content-Disposition" -> s"""attachment; filename="$filename"""")
                        if (
                          ctx.request
                            .getQueryString("download")
                            .exists(_ == "true")
                        ) {
                          Ok.sendEntity(
                              HttpEntity.Streamed(
                                source,
                                None,
                                meta.contentType
                                  .map(Some.apply)
                                  .getOrElse(Some("application/octet-stream"))
                              )
                            )
                            .withHeaders(disposition)
                        } else {
                          Ok.sendEntity(
                            HttpEntity.Streamed(
                              source,
                              None,
                              meta.contentType
                                .map(Some.apply)
                                .getOrElse(Some("application/octet-stream"))
                            )
                          )
                        }
                      case None =>
                        println("HEHE")
                        NotFound(Json.obj("error" -> "Asset not found!"))
                    }
              }
        }
      }
    }
}

class TenantAssetsController(
    DaikokuAction: DaikokuAction,
    DaikokuTenantAction: DaikokuTenantAction,
    env: Env,
    cc: ControllerComponents,
    assetsService: AssetsService
) extends AbstractController(cc)
    with NormalizeSupport {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  val bodyParser: BodyParser[Source[ByteString, _]] =
    BodyParser("Assets parser") { _ =>
      Accumulator.source[ByteString].map(Right.apply)
    }

  def storeAssets(): Action[Source[ByteString, _]] =
    DaikokuAction.async(bodyParser) { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(s"@{user.name} syncs assets")
      )(ctx.tenant.id.value, ctx) { (_, _) =>
        assetsService.storeAssets(ctx, ctx.request.body)
      }
    }

  def storeAsset() =
    DaikokuAction.async(bodyParser) { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(s"@{user.name} stores asset in team @{team.id}")
      )(ctx.tenant.id.value, ctx) { (_, _) =>
        assetsService.storeAsset(ctx, ctx.request.body)
      }
    }

  def replaceAsset(assetId: String) =
    DaikokuAction.async(bodyParser) { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(s"@{user.name} replace asset in team @{team.id}")
      )(ctx.tenant.id.value, ctx) { (_, _) =>
        assetsService.replaceAsset(assetId, ctx)
      }
    }

  def listAssets() =
    DaikokuAction.async { ctx =>
      assetsService.listAssets(ctx)
    }

  def slugifiedAssets() =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(s"@{user.name} access to slugified assets")
      )(ctx.tenant.id.value, ctx) { (_, _) =>
        assetsService.slugifiedAssets(ctx)
      }
    }

  def deleteAsset(assetId: String) =
    DaikokuAction.async { ctx =>
      TenantAdminOnly(
        AuditTrailEvent(s"@{user.name} deleted asset @{assetId} of @{team.id}")
      )(ctx.tenant.id.value, ctx) { (_, _) =>
        assetsService.deleteAsset(assetId, ctx)
      }
    }

  def doesAssetExists(slug: String) = {
    DaikokuTenantAction.async { ctx =>
      assetsService.doesAssetExists(slug, ctx)
    }
  }

  def getAsset(assetId: String) = {
    DaikokuTenantAction.async { ctx =>
      assetsService.getAsset(assetId, ctx)
    }
  }
}

class UserAssetsController(
    DaikokuAction: DaikokuAction,
    env: Env,
    cc: ControllerComponents
) extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  val bodyParser: BodyParser[Source[ByteString, _]] =
    BodyParser("Assets parser") { _ =>
      Accumulator.source[ByteString].map(Right.apply)
    }

  def storeAvatar() =
    DaikokuAction.async(bodyParser) { ctx =>
      PublicUserAccess(
        AuditTrailEvent(
          s"@{user.name} stores his avatar from tenant @{tenant.id} - @{assetId}"
        )
      )(ctx) {
        val contentType = ctx.request.headers
          .get("Asset-Content-Type")
          .orElse(ctx.request.contentType)
          .getOrElse("image/jpg")
        val filename =
          ctx.request
            .getQueryString("filename")
            .getOrElse(IdGenerator.token(16))
        val assetId = AssetId(ctx.user.id.value)
        ctx.tenant.bucketSettings match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "No bucket config found !"))
            )
          case Some(cfg) =>
            env.assetsStore
              .storeUserAsset(
                ctx.tenant.id,
                ctx.user.id,
                assetId,
                filename,
                contentType,
                ctx.request.body
              )(cfg)
              .map { _ =>
                ctx.setCtxValue("assetId", assetId)
                Ok(Json.obj("done" -> true, "id" -> assetId.value))
              } recover {
              case e => InternalServerError(Json.obj("error" -> ec.toString))
            }
        }
      }
    }

  def getAvatar(tenantId: String, assetId: String) =
    DaikokuAction.async { ctx =>
      env.dataStore.tenantRepo
        .findByIdOrHrIdNotDeleted(tenantId)
        .map(maybeTenant => maybeTenant.flatMap(t => t.bucketSettings))
        .flatMap {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "No bucket config found !"))
            )
          case Some(cfg) =>
            env.assetsStore
              .getUserAsset(ctx.tenant.id, ctx.user.id, AssetId(assetId))(cfg)
              .map {
                case Some((source, meta)) =>
                  val filename = meta.metadata
                    .filter(_.name().startsWith("x-amz-meta-"))
                    .find(_.name() == "x-amz-meta-filename")
                    .map(_.value())
                    .getOrElse("asset.jpg")
                  val disposition =
                    ("Content-Disposition" -> s"""attachment; filename="$filename"""")
                  if (ctx.request.getQueryString("download").contains("true")) {
                    Ok.sendEntity(
                        HttpEntity.Streamed(
                          source,
                          None,
                          meta.contentType
                            .map(Some.apply)
                            .getOrElse(Some("application/octet-stream"))
                        )
                      )
                      .withHeaders(disposition)
                  } else {
                    Ok.sendEntity(
                      HttpEntity.Streamed(
                        source,
                        None,
                        meta.contentType
                          .map(Some.apply)
                          .getOrElse(Some("application/octet-stream"))
                      )
                    )
                  }
                case None => NotFound(Json.obj("error" -> "Asset not found!"))
              }
        }
    }
}

class AssetsThumbnailController(
    DaikokuAction: DaikokuAction,
    env: Env,
    cc: ControllerComponents
) extends AbstractController(cc) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env

  val bodyParser: BodyParser[Source[ByteString, _]] =
    BodyParser("Assets parser") { _ =>
      Accumulator.source[ByteString].map(Right.apply)
    }

  def storeAsset(id: String) =
    DaikokuAction.async(bodyParser) { ctx =>
      PublicUserAccess(AuditTrailEvent(s"@{user.name} stores thumbnail"))(ctx) {
        val contentType = ctx.request.headers
          .get("Asset-Content-Type")
          .orElse(ctx.request.contentType)
          .getOrElse("image/png")
        val assetId = AssetId(id)
        ctx.tenant.bucketSettings match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "No bucket config found !"))
            )
          case Some(cfg) =>
            env.assetsStore
              .storeThumbnail(ctx.tenant.id, assetId, ctx.request.body)(cfg)
              .map { _ =>
                Ok(Json.obj("done" -> true, "id" -> assetId.value))
              } recover {
              case _ => InternalServerError(Json.obj("error" -> ec.toString))
            }
        }
      }
    }

  def getAsset(assetId: String) =
    DaikokuAction.async { ctx =>
      ctx.tenant.bucketSettings match {
        case None =>
          FastFuture.successful(
            NotFound(Json.obj("error" -> "No bucket config found !"))
          )
        case Some(cfg) =>
          env.assetsStore
            .getThumbnail(ctx.tenant.id, AssetId(assetId))(cfg)
            .map {
              case Some((source, meta)) =>
                Ok.sendEntity(
                  HttpEntity.Streamed(
                    source,
                    None,
                    meta.contentType
                      .map(Some.apply)
                      .getOrElse(Some("application/octet-stream"))
                  )
                )
              case None => NotFound(Json.obj("error" -> "Asset not found!"))
            }
      }
    }
}
