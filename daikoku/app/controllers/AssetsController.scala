package fr.maif.otoroshi.daikoku.ctrls

import akka.http.scaladsl.util.FastFuture
import akka.util.ByteString
import fr.maif.otoroshi.daikoku.actions.{DaikokuAction, DaikokuActionContext, DaikokuTenantAction}
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.authorizations.async._
import fr.maif.otoroshi.daikoku.domain.AssetId
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import play.api.http.HttpEntity
import play.api.libs.json.{JsArray, Json}
import play.api.libs.streams.Accumulator
import play.api.mvc.{AbstractController, BodyParser, ControllerComponents}

class TeamAssetsController(DaikokuAction: DaikokuAction, env: Env, cc: ControllerComponents) extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  val bodyParser = BodyParser("Assets parser") { _ =>
    Accumulator.source[ByteString].map(Right.apply)
  }

  def storeAsset(teamId: String) = DaikokuAction.async(bodyParser) { ctx =>
    TeamApiEditorOnly(AuditTrailEvent(s"@{user.name} stores asset in team @{team.id}"))(teamId, ctx) { team =>
      val contentType = ctx.request.headers.get("Asset-Content-Type").orElse(ctx.request.contentType).getOrElse("application/octet-stream")
      val filename = ctx.request.getQueryString("filename").getOrElse(IdGenerator.token(16))
      val title = ctx.request.getQueryString("title").getOrElse("--")
      val desc = ctx.request.getQueryString("desc").getOrElse("--")
      val assetId = AssetId(IdGenerator.uuid)
      ctx.tenant.bucketSettings match {
        case None => FastFuture.successful(NotFound(Json.obj("error" -> "No bucket config found !")))
        case Some(cfg) =>
          env.assetsStore.storeAsset(ctx.tenant.id, team.id, assetId, filename, title, desc, contentType, ctx.request.body)(cfg).map { res =>
            Ok(Json.obj("done" -> true, "id" -> assetId.value))
          } recover {
            case e: fr.maif.otoroshi.daikoku.utils.BadFileContentFromContentType => BadRequest(Json.obj("error" -> "Bad file content"))
            case e => InternalServerError(Json.obj("error" -> e.toString))
          }
      }
    }
  }

  def listAssets(teamId: String) = DaikokuAction.async { ctx =>
    TeamAdminOnly(AuditTrailEvent(s"@{user.name} listed assets of team @{team.id}"))(teamId, ctx) { team =>
      ctx.tenant.bucketSettings match {
        case None => FastFuture.successful(NotFound(Json.obj("error" -> "No bucket config found !")))
        case Some(cfg) => env.assetsStore.listAssets(ctx.tenant.id, team.id)(cfg).map { res =>
          Ok(JsArray(res.map(_.asJson)))
        }
      }
    }
  }

  def deleteAsset(teamId: String, assetId: String)= DaikokuAction.async { ctx =>
    TeamApiEditorOnly(AuditTrailEvent(s"@{user.name} deleted asset @{assetId} of @{team.id}"))(teamId, ctx) { team =>
      ctx.setCtxValue("assetId", assetId)
      ctx.tenant.bucketSettings match {
        case None => FastFuture.successful(NotFound(Json.obj("error" -> "No bucket config found !")))
        case Some(cfg) => env.assetsStore.deleteAsset(ctx.tenant.id, team.id, AssetId(assetId))(cfg).map { res =>
          Ok(Json.obj("done" -> true))
        }
      }
    }
  }

  def getAsset(teamId: String, assetId: String)= DaikokuAction.async { ctx =>
    // TODO: validate if usser has right to see the asset based on team and api
    PublicUserAccess(AuditTrailEvent(s"@{user.name} accessed asset @{assetId} on team @{teamId}"))(ctx) {
      ctx.setCtxValue("teamId", teamId)
      ctx.setCtxValue("assetId", assetId)
      ctx.tenant.bucketSettings match {
        case None => FastFuture.successful(NotFound(Json.obj("error" -> "No bucket config found !")))
        case Some(cfg) => env.dataStore.teamRepo.forTenant(ctx.tenant).findById(teamId).flatMap {
          case None => FastFuture.successful(NotFound(Json.obj("error" -> "Team not found!")))
          case Some(team) => env.assetsStore.getAsset(ctx.tenant.id, team.id, AssetId(assetId))(cfg).map {
            case Some((source, meta)) =>
              val filename = meta.metadata.filter(_.name().startsWith("x-amz-meta-")).find(_.name() == "x-amz-meta-filename").map(_.value()).getOrElse("asset.txt")
              val disposition = ("Content-Disposition" -> s"""attachment; filename="$filename"""")
              if (ctx.request.getQueryString("download").exists(_ == "true")) {
                Ok.sendEntity(HttpEntity.Streamed(source, None, meta.contentType.map(Some.apply).getOrElse(Some("application/octet-stream")))).withHeaders(disposition)
              } else {
                Ok.sendEntity(HttpEntity.Streamed(source, None, meta.contentType.map(Some.apply).getOrElse(Some("application/octet-stream"))))
              }
            case None => NotFound(Json.obj("error" -> "Asset not found!"))
          }
        }
      }
    }
  }
}

class TenantAssetsController(DaikokuAction: DaikokuAction, DaikokuTenantAction: DaikokuTenantAction, env: Env, cc: ControllerComponents) extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  val bodyParser = BodyParser("Assets parser") { _ =>
    Accumulator.source[ByteString].map(Right.apply)
  }

  def storeAsset() = DaikokuAction.async(bodyParser) { ctx =>
    DaikokuAdminOnly(AuditTrailEvent(s"@{user.name} stores asset in team @{team.id}"))(ctx) {
      val contentType = ctx.request.headers.get("Asset-Content-Type").orElse(ctx.request.contentType).getOrElse("application/octet-stream")
      val filename = ctx.request.getQueryString("filename").getOrElse(IdGenerator.token(16))
      val title = ctx.request.getQueryString("title").getOrElse("--")
      val desc = ctx.request.getQueryString("desc").getOrElse("--")
      val assetId = AssetId(IdGenerator.uuid)
      ctx.tenant.bucketSettings match {
        case None => FastFuture.successful(NotFound(Json.obj("error" -> "No bucket config found !")))
        case Some(cfg) =>
          env.assetsStore.storeTenantAsset(ctx.tenant.id, assetId, filename, title, desc, contentType, ctx.request.body)(cfg).map { res =>
            Ok(Json.obj("done" -> true, "id" -> assetId.value))
          } recover {
            case e => InternalServerError(Json.obj("error" -> ec.toString))
          }
      }
    }
  }

  def listAssets() = DaikokuAction.async { ctx =>
    ctx.request.getQueryString("teamId") match {
      case Some(teamId) => {
        TeamAdminOnly(AuditTrailEvent(s"@{user.name} listed assets of team @{team.id}"))(teamId, ctx) { _ =>
          ctx.tenant.bucketSettings match {
            case None => FastFuture.successful(NotFound(Json.obj("error" -> "No bucket config found !")))
            case Some(cfg) => env.assetsStore.listTenantAssets(ctx.tenant.id)(cfg).map { res =>
              Ok(JsArray(res.map(_.asJson)))
            }
          }
        }      
      }
      case None => {
        DaikokuAdminOnly(AuditTrailEvent(s"@{user.name} listed assets of team @{team.id}"))(ctx) {
          ctx.tenant.bucketSettings match {
            case None => FastFuture.successful(NotFound(Json.obj("error" -> "No bucket config found !")))
            case Some(cfg) => env.assetsStore.listTenantAssets(ctx.tenant.id)(cfg).map { res =>
              Ok(JsArray(res.map(_.asJson)))
            }
          }
        }
      }
    }
  }

  def deleteAsset(assetId: String)= DaikokuAction.async { ctx =>
    DaikokuAdminOnly(AuditTrailEvent(s"@{user.name} deleted asset @{assetId} of @{team.id}"))(ctx) {
      ctx.setCtxValue("assetId", assetId)
      ctx.tenant.bucketSettings match {
        case None => FastFuture.successful(NotFound(Json.obj("error" -> "No bucket config found !")))
        case Some(cfg) => env.assetsStore.deleteTenantAsset(ctx.tenant.id, AssetId(assetId))(cfg).map { res =>
          Ok(Json.obj("done" -> true))
        }
      }
    }
  }

  def getAsset(assetId: String)= DaikokuTenantAction.async { ctx =>
    ctx.tenant.bucketSettings match {
      case None => FastFuture.successful(NotFound(Json.obj("error" -> "No bucket config found !")))
      case Some(cfg) => env.assetsStore.getTenantAsset(ctx.tenant.id, AssetId(assetId))(cfg).map {
        case Some((source, meta)) =>
          val filename = meta.metadata.filter(_.name().startsWith("x-amz-meta-")).find(_.name() == "x-amz-meta-filename").map(_.value()).getOrElse("asset.txt")
          val disposition = ("Content-Disposition" -> s"""attachment; filename="$filename"""")
          if (ctx.request.getQueryString("download").exists(_ == "true")) {
            Ok.sendEntity(HttpEntity.Streamed(source, None, meta.contentType.map(Some.apply).getOrElse(Some("application/octet-stream")))).withHeaders(disposition)
          } else {
            Ok.sendEntity(HttpEntity.Streamed(source, None, meta.contentType.map(Some.apply).getOrElse(Some("application/octet-stream"))))
          }
        case None => NotFound(Json.obj("error" -> "Asset not found!"))
      }
    }
  }
}

class UserAssetsController(DaikokuAction: DaikokuAction, env: Env, cc: ControllerComponents) extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  val bodyParser = BodyParser("Assets parser") { _ =>
    Accumulator.source[ByteString].map(Right.apply)
  }

  def storeAsset() = DaikokuAction.async(bodyParser) { ctx =>
    PublicUserAccess(AuditTrailEvent(s"@{user.name} stores asset in team @{team.id}"))(ctx) {
      val contentType = ctx.request.headers.get("Asset-Content-Type").orElse(ctx.request.contentType).getOrElse("image/jpg")
      val filename = ctx.request.getQueryString("filename").getOrElse(IdGenerator.token(16))
      val assetId = AssetId(IdGenerator.uuid)
      ctx.tenant.bucketSettings match {
        case None => FastFuture.successful(NotFound(Json.obj("error" -> "No bucket config found !")))
        case Some(cfg) =>
          env.assetsStore.storeUserAsset(ctx.tenant.id, ctx.user.id, assetId, filename, contentType, ctx.request.body)(cfg).map { res =>
            Ok(Json.obj("done" -> true, "id" -> assetId.value))
          } recover {
            case e => InternalServerError(Json.obj("error" -> ec.toString))
          }
      }
    }
  }

  def getAsset(assetId: String)= DaikokuAction.async { ctx =>
    ctx.tenant.bucketSettings match {
      case None => FastFuture.successful(NotFound(Json.obj("error" -> "No bucket config found !")))
      case Some(cfg) => env.assetsStore.getUserAsset(ctx.tenant.id, ctx.user.id, AssetId(assetId))(cfg).map {
        case Some((source, meta)) =>
          val filename = meta.metadata.filter(_.name().startsWith("x-amz-meta-")).find(_.name() == "x-amz-meta-filename").map(_.value()).getOrElse("asset.jpg")
          val disposition = ("Content-Disposition" -> s"""attachment; filename="$filename"""")
          if (ctx.request.getQueryString("download").exists(_ == "true")) {
            Ok.sendEntity(HttpEntity.Streamed(source, None, meta.contentType.map(Some.apply).getOrElse(Some("application/octet-stream")))).withHeaders(disposition)
          } else {
            Ok.sendEntity(HttpEntity.Streamed(source, None, meta.contentType.map(Some.apply).getOrElse(Some("application/octet-stream"))))
          }
        case None => NotFound(Json.obj("error" -> "Asset not found!"))
      }
    }
  }
}

class AssetsThumbnailController(DaikokuAction: DaikokuAction, env: Env, cc: ControllerComponents) extends AbstractController(cc) {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  val bodyParser = BodyParser("Assets parser") { _ =>
    Accumulator.source[ByteString].map(Right.apply)
  }

  def storeAsset(id: String) = DaikokuAction.async(bodyParser) { ctx =>
    PublicUserAccess(AuditTrailEvent(s"@{user.name} stores thumbnail"))(ctx) {
      val contentType = ctx.request.headers.get("Asset-Content-Type").orElse(ctx.request.contentType).getOrElse("image/png")
      val assetId = AssetId(id)
      ctx.tenant.bucketSettings match {
        case None => FastFuture.successful(NotFound(Json.obj("error" -> "No bucket config found !")))
        case Some(cfg) =>
          env.assetsStore.storeThumbnail(ctx.tenant.id, assetId, ctx.request.body)(cfg).map { res =>
            Ok(Json.obj("done" -> true, "id" -> assetId.value))
          } recover {
            case e => InternalServerError(Json.obj("error" -> ec.toString))
          }
      }
    }
  }

  def getAsset(assetId: String)= DaikokuAction.async { ctx =>
    ctx.tenant.bucketSettings match {
      case None => FastFuture.successful(NotFound(Json.obj("error" -> "No bucket config found !")))
      case Some(cfg) => env.assetsStore.getThumbnail(ctx.tenant.id, AssetId(assetId))(cfg).map {
        case Some((source, meta)) =>
          Ok.sendEntity(HttpEntity.Streamed(source, None, meta.contentType.map(Some.apply).getOrElse(Some("application/octet-stream"))))
        case None => NotFound(Json.obj("error" -> "Asset not found!"))
      }
    }
  }
}
