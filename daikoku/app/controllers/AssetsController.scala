package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import akka.stream.alpakka.s3.ObjectMetadata
import akka.util.ByteString
import scala.collection.JavaConverters._
import fr.maif.otoroshi.daikoku.actions.{DaikokuAction, DaikokuTenantAction}
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async._
import fr.maif.otoroshi.daikoku.domain.AssetId
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import play.api.Logger
import play.api.http.HttpEntity
import play.api.libs.json.{JsArray, Json}
import play.api.libs.streams.Accumulator
import play.api.mvc.{AbstractController, BodyParser, ControllerComponents}

trait NormalizeSupport {

  import java.text.Normalizer.{normalize => jnormalize, _}

  def normalize(in: String): String = {
    val cleaned = in.trim.toLowerCase
    val tuple = cleaned.splitAt(cleaned.lastIndexOf('.'))

    val normalized = jnormalize(tuple._1, Form.NFC)

    val fileNameNormalized = normalized
      .replaceAll("'s", "")
      .replaceAll("ß", "ss")
      .replaceAll("ø", "o")
      .replaceAll("[^a-zA-Z0-9-]+", "-")
      .replaceAll("-+", "-")
      .stripSuffix("-")

    fileNameNormalized + tuple._2
  }
}

object NormalizeSupport extends NormalizeSupport

class TeamAssetsController(DaikokuAction: DaikokuAction,
                           env: Env,
                           cc: ControllerComponents)
    extends AbstractController(cc)
    with NormalizeSupport {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  val bodyParser = BodyParser("Assets parser") { _ =>
    Accumulator.source[ByteString].map(Right.apply)
  }

  val illegalTeamAssetContentTypes: Seq[String] =
    Seq("text/html", "text/css", "text/javascript", "application/x-javascript")

  def storeAsset(teamId: String) = DaikokuAction.async(bodyParser) { ctx =>
    TeamApiEditorOnly(
      AuditTrailEvent(s"@{user.name} stores asset in team @{team.id}"))(teamId,
                                                                        ctx) {
      team =>
        val contentType = ctx.request.headers
          .get("Asset-Content-Type")
          .orElse(ctx.request.contentType)
          .getOrElse("application/octet-stream")
        val filename = normalize(
          ctx.request
            .getQueryString("filename")
            .getOrElse(IdGenerator.token(16)))
        val title = ctx.request.getQueryString("title").getOrElse("--")
        val desc = ctx.request.getQueryString("desc").getOrElse("--")
        val assetId = AssetId(IdGenerator.uuid)
        ctx.tenant.bucketSettings match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "No bucket config found !")))
          case Some(_) if illegalTeamAssetContentTypes.contains(contentType) =>
            FastFuture.successful(
              Forbidden(Json.obj("error" -> "content type is not allowed")))
          case Some(cfg) =>
            env.assetsStore
              .storeAsset(ctx.tenant.id,
                          team.id,
                          assetId,
                          filename,
                          title,
                          desc,
                          contentType,
                          ctx.request.body)(cfg)
              .map { res =>
                Ok(Json.obj("done" -> true, "id" -> assetId.value))
              } recover {
              case e: fr.maif.otoroshi.daikoku.utils.BadFileContentFromContentType =>
                BadRequest(Json.obj("error" -> "Bad file content"))
              case e =>
                Logger.error(
                  s"Error during tenant asset storage: ${e.getMessage}",
                  e)
                InternalServerError(Json.obj("error" -> e.toString))
            }
        }
    }
  }

  def replaceAsset(teamId: String, assetId: String) =
    DaikokuAction.async(bodyParser) { ctx =>
      TeamApiEditorOnly(
        AuditTrailEvent(s"@{user.name} replace asset in team @{team.id}"))(
        teamId,
        ctx) { team =>
        def getMetaHeaderValue(metadata: ObjectMetadata,
                               headerName: String): Option[String] = {
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
              NotFound(Json.obj("error" -> "No bucket config found !")))
          case Some(cfg) =>
            env.assetsStore
              .getAssetMetaHeaders(ctx.tenant.id, team.id, AssetId(assetId))(
                cfg)
              .flatMap {
                case None =>
                  FastFuture.successful(
                    NotFound(Json.obj("error" -> "Asset not found")))
                case Some(metadata)
                    if metadata.contentType.get != requestContentType =>
                  FastFuture.successful(Forbidden(Json.obj(
                    "error" -> "content type is different from the original")))
                case Some(_)
                    if illegalTeamAssetContentTypes.contains(
                      requestContentType) =>
                  FastFuture.successful(Forbidden(
                    Json.obj("error" -> "content type is not allowed")))
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
                    .storeAsset(ctx.tenant.id,
                                team.id,
                                AssetId(assetId),
                                filename,
                                title,
                                desc,
                                contentType,
                                ctx.request.body)(cfg)
                    .map { res =>
                      Ok(Json.obj("done" -> true, "id" -> assetId))
                    } recover {
                    case e =>
                      Logger.error(
                        s"Error during update tenant asset: $filename",
                        e)
                      InternalServerError(Json.obj("error" -> ec.toString))
                  }
              }
        }
      }
    }

  def listAssets(teamId: String) = DaikokuAction.async { ctx =>
    TeamAdminOrTenantAdminOnly(
      AuditTrailEvent(s"@{user.name} listed assets of team @{team.id}"))(teamId,
                                                                         ctx) {
      team =>
        ctx.tenant.bucketSettings match {
          case None =>
            FastFuture.successful(
              NotFound(Json.obj("error" -> "No bucket config found !")))
          case Some(cfg) =>
            env.assetsStore.listAssets(ctx.tenant.id, team.id)(cfg).map { res =>
              Ok(JsArray(res.map(_.asJson)))
            }
        }
    }
  }

  def deleteAsset(teamId: String, assetId: String) = DaikokuAction.async {
    ctx =>
      TeamApiEditorOnly(AuditTrailEvent(
        s"@{user.name} deleted asset @{assetId} of @{team.id}"))(teamId, ctx) {
        team =>
          ctx.setCtxValue("assetId", assetId)
          ctx.tenant.bucketSettings match {
            case None =>
              FastFuture.successful(
                NotFound(Json.obj("error" -> "No bucket config found !")))
            case Some(cfg) =>
              env.assetsStore
                .deleteAsset(ctx.tenant.id, team.id, AssetId(assetId))(cfg)
                .map { res =>
                  Ok(Json.obj("done" -> true))
                }
          }
      }
  }

  def getAsset(teamId: String, assetId: String) = DaikokuAction.async { ctx =>
    // TODO: validate if usser has right to see the asset based on team and api
    PublicUserAccess(
      AuditTrailEvent(
        s"@{user.name} accessed asset @{assetId} on team @{teamId}"))(ctx) {
      ctx.setCtxValue("teamId", teamId)
      ctx.setCtxValue("assetId", assetId)
      ctx.tenant.bucketSettings match {
        case None =>
          FastFuture.successful(
            NotFound(Json.obj("error" -> "No bucket config found !")))
        case Some(cfg) =>
          env.dataStore.teamRepo
            .forTenant(ctx.tenant)
            .findById(teamId)
            .flatMap {
              case None =>
                FastFuture.successful(
                  NotFound(Json.obj("error" -> "Team not found!")))
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
                      val disposition = ("Content-Disposition" -> s"""attachment; filename="$filename"""")
                      if (ctx.request
                            .getQueryString("download")
                            .exists(_ == "true")) {
                        Ok.sendEntity(
                            HttpEntity.Streamed(
                              source,
                              None,
                              meta.contentType
                                .map(Some.apply)
                                .getOrElse(Some("application/octet-stream"))))
                          .withHeaders(disposition)
                      } else {
                        Ok.sendEntity(
                          HttpEntity.Streamed(
                            source,
                            None,
                            meta.contentType
                              .map(Some.apply)
                              .getOrElse(Some("application/octet-stream"))))
                      }
                    case None =>
                      NotFound(Json.obj("error" -> "Asset not found!"))
                  }
            }
      }
    }
  }
}

class TenantAssetsController(DaikokuAction: DaikokuAction,
                             DaikokuTenantAction: DaikokuTenantAction,
                             env: Env,
                             cc: ControllerComponents)
    extends AbstractController(cc)
    with NormalizeSupport {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  val bodyParser = BodyParser("Assets parser") { _ =>
    Accumulator.source[ByteString].map(Right.apply)
  }

  def storeAsset() = DaikokuAction.async(bodyParser) { ctx =>
    TenantAdminOnly(
      AuditTrailEvent(s"@{user.name} stores asset in team @{team.id}"))(ctx.tenant.id.value, ctx) { tenant =>
      val contentType = ctx.request.headers
        .get("Asset-Content-Type")
        .orElse(ctx.request.contentType)
        .getOrElse("application/octet-stream")
      val filename = normalize(
        ctx.request.getQueryString("filename").getOrElse(IdGenerator.token(16)))
      val title = normalize(ctx.request.getQueryString("title").getOrElse("--"))
      val desc = ctx.request.getQueryString("desc").getOrElse("--")
      val assetId = AssetId(IdGenerator.uuid)
      ctx.tenant.bucketSettings match {
        case None =>
          FastFuture.successful(
            NotFound(Json.obj("error" -> "No bucket config found !")))
        case Some(cfg) =>
          env.assetsStore
            .storeTenantAsset(ctx.tenant.id,
                              assetId,
                              filename,
                              title,
                              desc,
                              contentType,
                              ctx.request.body)(cfg)
            .map { res =>
              Ok(Json.obj("done" -> true, "id" -> assetId.value))
            } recover {
            case e =>
              Logger.error(s"Error during tenant asset storage: ${filename}", e)
              InternalServerError(Json.obj("error" -> ec.toString))
          }
      }
    }
  }

  def replaceAsset(assetId: String) = DaikokuAction.async(bodyParser) { ctx =>
    TenantAdminOnly(
      AuditTrailEvent(s"@{user.name} replace asset in team @{team.id}"))(ctx.tenant.id.value, ctx) { tenant =>

      def getMetaHeaderValue(metadata: ObjectMetadata,
                             headerName: String): Option[String] = {
        metadata.headers.asScala
          .find(_.name() == s"x-amz-meta-$headerName")
          .map(_.value())
      }

      ctx.tenant.bucketSettings match {
        case None =>
          FastFuture.successful(
            NotFound(Json.obj("error" -> "No bucket config found !")))
        case Some(cfg) =>
          env.assetsStore
            .getTenantAssetMetaHeaders(ctx.tenant.id, AssetId(assetId))(cfg)
            .flatMap {
              case None =>
                FastFuture.successful(
                  NotFound(Json.obj("error" -> "Asset not found")))
              case Some(metadata) =>
                val filename =
                  getMetaHeaderValue(metadata, "filename").getOrElse("--")
                val desc = getMetaHeaderValue(metadata, "desc").getOrElse("--")
                val title =
                  getMetaHeaderValue(metadata, "title").getOrElse("--")
                val contentType = metadata.contentType
                  .orElse(ctx.request.contentType)
                  .getOrElse("application/octet-stream")

                env.assetsStore
                  .storeTenantAsset(ctx.tenant.id,
                                    AssetId(assetId),
                                    filename,
                                    title,
                                    desc,
                                    contentType,
                                    ctx.request.body)(cfg)
                  .map { res =>
                    Ok(Json.obj("done" -> true, "id" -> assetId))
                  } recover {
                  case e =>
                    Logger.error(s"Error during update tenant asset: $filename",
                                 e)
                    InternalServerError(Json.obj("error" -> ec.toString))
                }
            }
      }
    }
  }

  def listAssets() = DaikokuAction.async { ctx =>
    ctx.request.getQueryString("teamId") match {
      case Some(teamId) => {
        TeamAdminOnly(
          AuditTrailEvent(s"@{user.name} listed assets of team @{team.id}"))(
          teamId,
          ctx) { _ =>
          ctx.tenant.bucketSettings match {
            case None =>
              FastFuture.successful(
                NotFound(Json.obj("error" -> "No bucket config found !")))
            case Some(cfg) =>
              env.assetsStore.listTenantAssets(ctx.tenant.id)(cfg).map { res =>
                Ok(JsArray(res.map(_.asJson)))
              }
          }
        }
      }
      case None => {
        TenantAdminOnly(
          AuditTrailEvent(s"@{user.name} listed assets of team @{team.id}"))(ctx.tenant.id.value, ctx) { tenant =>
          ctx.tenant.bucketSettings match {
            case None =>
              FastFuture.successful(
                NotFound(Json.obj("error" -> "No bucket config found !")))
            case Some(cfg) =>
              env.assetsStore.listTenantAssets(ctx.tenant.id)(cfg).map { res =>
                Ok(JsArray(res.map(_.asJson)))
              }
          }
        }
      }
    }
  }

  def deleteAsset(assetId: String) = DaikokuAction.async { ctx =>
    TenantAdminOnly(AuditTrailEvent(s"@{user.name} deleted asset @{assetId} of @{team.id}"))(ctx.tenant.id.value, ctx) { tenant =>
      ctx.setCtxValue("assetId", assetId)
      ctx.tenant.bucketSettings match {
        case None =>
          FastFuture.successful(
            NotFound(Json.obj("error" -> "No bucket config found !")))
        case Some(cfg) =>
          env.assetsStore
            .deleteTenantAsset(ctx.tenant.id, AssetId(assetId))(cfg)
            .map { res =>
              Ok(Json.obj("done" -> true))
            }
      }
    }
  }

  def getAsset(assetId: String) = DaikokuTenantAction.async { ctx =>
    ctx.tenant.bucketSettings match {
      case None =>
        FastFuture.successful(
          NotFound(Json.obj("error" -> "No bucket config found !")))
      case Some(cfg) =>
        env.assetsStore
          .getTenantAsset(ctx.tenant.id, AssetId(assetId))(cfg)
          .map {
            case Some((source, meta)) =>
              val filename = meta.metadata
                .filter(_.name().startsWith("x-amz-meta-"))
                .find(_.name() == "x-amz-meta-filename")
                .map(_.value())
                .getOrElse("asset.txt")
              val disposition = ("Content-Disposition" -> s"""attachment; filename="$filename"""")
              if (ctx.request.getQueryString("download").exists(_ == "true")) {
                Ok.sendEntity(
                    HttpEntity.Streamed(
                      source,
                      None,
                      meta.contentType
                        .map(Some.apply)
                        .getOrElse(Some("application/octet-stream"))))
                  .withHeaders(disposition)
              } else {
                Ok.sendEntity(
                  HttpEntity.Streamed(
                    source,
                    None,
                    meta.contentType
                      .map(Some.apply)
                      .getOrElse(Some("application/octet-stream"))))
              }
            case None => NotFound(Json.obj("error" -> "Asset not found!"))
          }
    }
  }
}

class UserAssetsController(DaikokuAction: DaikokuAction,
                           env: Env,
                           cc: ControllerComponents)
    extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  val bodyParser = BodyParser("Assets parser") { _ =>
    Accumulator.source[ByteString].map(Right.apply)
  }

  def storeAsset() = DaikokuAction.async(bodyParser) { ctx =>
    PublicUserAccess(
      AuditTrailEvent(s"@{user.name} stores asset in team @{team.id}"))(ctx) {
      val contentType = ctx.request.headers
        .get("Asset-Content-Type")
        .orElse(ctx.request.contentType)
        .getOrElse("image/jpg")
      val filename =
        ctx.request.getQueryString("filename").getOrElse(IdGenerator.token(16))
      val assetId = AssetId(IdGenerator.uuid)
      ctx.tenant.bucketSettings match {
        case None =>
          FastFuture.successful(
            NotFound(Json.obj("error" -> "No bucket config found !")))
        case Some(cfg) =>
          env.assetsStore
            .storeUserAsset(ctx.tenant.id,
                            ctx.user.id,
                            assetId,
                            filename,
                            contentType,
                            ctx.request.body)(cfg)
            .map { res =>
              Ok(Json.obj("done" -> true, "id" -> assetId.value))
            } recover {
            case e => InternalServerError(Json.obj("error" -> ec.toString))
          }
      }
    }
  }

  def getAsset(assetId: String) = DaikokuAction.async { ctx =>
    ctx.tenant.bucketSettings match {
      case None =>
        FastFuture.successful(
          NotFound(Json.obj("error" -> "No bucket config found !")))
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
              val disposition = ("Content-Disposition" -> s"""attachment; filename="$filename"""")
              if (ctx.request.getQueryString("download").exists(_ == "true")) {
                Ok.sendEntity(
                    HttpEntity.Streamed(
                      source,
                      None,
                      meta.contentType
                        .map(Some.apply)
                        .getOrElse(Some("application/octet-stream"))))
                  .withHeaders(disposition)
              } else {
                Ok.sendEntity(
                  HttpEntity.Streamed(
                    source,
                    None,
                    meta.contentType
                      .map(Some.apply)
                      .getOrElse(Some("application/octet-stream"))))
              }
            case None => NotFound(Json.obj("error" -> "Asset not found!"))
          }
    }
  }
}

class AssetsThumbnailController(DaikokuAction: DaikokuAction,
                                env: Env,
                                cc: ControllerComponents)
    extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  val bodyParser = BodyParser("Assets parser") { _ =>
    Accumulator.source[ByteString].map(Right.apply)
  }

  def storeAsset(id: String) = DaikokuAction.async(bodyParser) { ctx =>
    PublicUserAccess(AuditTrailEvent(s"@{user.name} stores thumbnail"))(ctx) {
      val contentType = ctx.request.headers
        .get("Asset-Content-Type")
        .orElse(ctx.request.contentType)
        .getOrElse("image/png")
      val assetId = AssetId(id)
      ctx.tenant.bucketSettings match {
        case None =>
          FastFuture.successful(
            NotFound(Json.obj("error" -> "No bucket config found !")))
        case Some(cfg) =>
          env.assetsStore
            .storeThumbnail(ctx.tenant.id, assetId, ctx.request.body)(cfg)
            .map { res =>
              Ok(Json.obj("done" -> true, "id" -> assetId.value))
            } recover {
            case e => InternalServerError(Json.obj("error" -> ec.toString))
          }
      }
    }
  }

  def getAsset(assetId: String) = DaikokuAction.async { ctx =>
    ctx.tenant.bucketSettings match {
      case None =>
        FastFuture.successful(
          NotFound(Json.obj("error" -> "No bucket config found !")))
      case Some(cfg) =>
        env.assetsStore.getThumbnail(ctx.tenant.id, AssetId(assetId))(cfg).map {
          case Some((source, meta)) =>
            Ok.sendEntity(
              HttpEntity.Streamed(
                source,
                None,
                meta.contentType
                  .map(Some.apply)
                  .getOrElse(Some("application/octet-stream"))))
          case None => NotFound(Json.obj("error" -> "Asset not found!"))
        }
    }
  }
}
