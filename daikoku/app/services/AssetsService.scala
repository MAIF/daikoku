package fr.maif.otoroshi.daikoku.services

import fr.maif.otoroshi.daikoku.actions.ApiActionContext
import fr.maif.otoroshi.daikoku.audit.AuditTrailEvent
import fr.maif.otoroshi.daikoku.ctrls.CmsApiActionContext
import fr.maif.otoroshi.daikoku.domain.{Asset, AssetId}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.services.NormalizeSupport.normalize
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import fr.maif.otoroshi.daikoku.utils.StringImplicits.BetterString
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.connectors.s3.ObjectMetadata
import org.apache.pekko.stream.scaladsl.{Sink, Source}
import org.apache.pekko.util.ByteString
import play.api.http.HttpEntity
import play.api.libs.json.{JsArray, Json}
import play.api.mvc.AnyContent
import play.api.mvc.Results._

import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration.DurationInt
import scala.jdk.CollectionConverters._

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

class AssetsService {

  def storeAssets[T](
      ctx: ApiActionContext[T],
      body: Source[ByteString, _]
  )(implicit env: Env) = {

    implicit val ec: ExecutionContext = env.defaultExecutionContext

    ctx.tenant.bucketSettings match {
      case None =>
        FastFuture.successful(
          NotFound(Json.obj("error" -> "No bucket config found !"))
        )
      case Some(cfg) =>
        body
          .runWith(Sink.reduce[ByteString](_ ++ _))(env.defaultMaterializer)
          .map(str => str.utf8String)
          .map(Json.parse)
          .flatMap(items =>
            Future.sequence(
              items
                .as[JsArray]
                .value
                .map(item => {
                  val filename = (item \ "filename").as[String]
                  val assetId = AssetId(IdGenerator.uuid)
                  val slug = filename.slugify

                  env.assetsStore
                    .storeTenantAsset(
                      ctx.tenant.id,
                      assetId,
                      name = filename,
                      title = filename,
                      desc = filename,
                      contentType = "application/octet-stream",
                      content = Source
                        .single((item \ "content").get)
                        .map(Json.stringify)
                        .map(ByteString.apply)
                    )(cfg)
                    .flatMap { _ =>
                      internalDeleteAsset(slug, ctx)
                        .map(_ =>
                          env.dataStore.assetRepo
                            .forTenant(ctx.tenant)
                            .save(
                              Asset(
                                assetId,
                                tenant = ctx.tenant.id,
                                slug = slug
                              )
                            )
                        )
                        .map(_ =>
                          Json.obj(
                            "done" -> true,
                            "id" -> assetId.value,
                            "slug" -> slug
                          )
                        )
                    } recover {
                    case e =>
                      AppLogger.error(
                        s"Error during tenant asset storage: $filename",
                        e
                      )
                      Json
                        .obj("id" -> assetId.value, "error" -> ec.toString)
                  }
                })
            )
          )
          .map(results => Ok(Json.arr(results)))
          .recover {
            case e: Throwable =>
              BadRequest(Json.obj("error" -> e.getMessage))
          }
    }
  }

  def storeAsset[T](
      ctx: ApiActionContext[T],
      body: Source[ByteString, _]
  )(implicit env: Env) = {
    implicit val ec = env.defaultExecutionContext

    val contentType = ctx.request.headers
      .get("Asset-Content-Type")
      .orElse(ctx.request.contentType)
      .getOrElse("application/octet-stream")
//      .replace("text/xml", "application/xml")

    val filename = normalize(
      ctx.request
        .getQueryString("filename")
        .getOrElse(IdGenerator.token(16))
    )
    val title =
      normalize(ctx.request.getQueryString("title").getOrElse("--"))
    val desc = ctx.request.getQueryString("desc").getOrElse("--")
    val querySlug: Option[String] = ctx.request
      .getQueryString("slug")
      .flatMap(slug => if (slug.isEmpty) None else Some(slug))
    val assetId = AssetId(IdGenerator.uuid)

    ctx.tenant.bucketSettings match {
      case None =>
        FastFuture.successful(
          NotFound(Json.obj("error" -> "No bucket config found !"))
        )
      case Some(cfg) =>
        env.assetsStore
          .storeTenantAsset(
            ctx.tenant.id,
            assetId,
            filename,
            title,
            desc,
            contentType,
            body
          )(cfg)
          .flatMap { _ =>
            val slug = querySlug.map(_.slugify).getOrElse(filename.slugify)

            env.dataStore.assetRepo
              .forTenant(ctx.tenant)
              .save(Asset(assetId, tenant = ctx.tenant.id, slug = slug))
              .map(_ =>
                Ok(
                  Json.obj(
                    "done" -> true,
                    "id" -> assetId.value,
                    "slug" -> slug
                  )
                )
              )

          } recover {
          case e =>
            AppLogger.error(
              s"Error during tenant asset storage: ${filename}",
              e
            )
            InternalServerError(Json.obj("error" -> ec.toString))
        }
    }
  }

  def replaceAsset[T <: Source[ByteString, _]](
      assetId: String,
      ctx: ApiActionContext[T]
  )(implicit
      env: Env
  ) = {

    implicit val ec = env.defaultExecutionContext

    def getMetaHeaderValue(
        metadata: ObjectMetadata,
        headerName: String
    ): Option[String] = {
      metadata.headers.asScala
        .find(_.name() == s"x-amz-meta-$headerName")
        .map(_.value())
    }

    ctx.tenant.bucketSettings match {
      case None =>
        FastFuture.successful(
          NotFound(Json.obj("error" -> "No bucket config found !"))
        )
      case Some(cfg) =>
        env.assetsStore
          .getTenantAssetMetaHeaders(ctx.tenant.id, AssetId(assetId))(cfg)
          .flatMap {
            case None =>
              FastFuture.successful(
                NotFound(Json.obj("error" -> "Asset not found"))
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
                .storeTenantAsset(
                  ctx.tenant.id,
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
                  AppLogger
                    .error(
                      s"Error during update tenant asset: $filename",
                      e
                    )
                  InternalServerError(Json.obj("error" -> ec.toString))
              }
          }
    }
  }

  def listAssets[T](ctx: ApiActionContext[T])(implicit env: Env) = {
    implicit val ec = env.defaultExecutionContext

    ctx.tenant.bucketSettings match {
      case None =>
        FastFuture.successful(
          NotFound(Json.obj("error" -> "No bucket config found !"))
        )
      case Some(cfg) =>
        for {
          slugs <-
            env.dataStore.assetRepo
              .forTenant(ctx.tenant)
              .findWithProjection(
                Json.obj(),
                Json.obj("slug" -> true, "_id" -> true)
              )
              .map(items =>
                items.foldLeft(Map.empty[String, Option[String]]) {
                  case (acc, item) =>
                    acc + ((item \ "_id").as[String] -> (item \ "slug")
                      .asOpt[String])
                }
              )
          assets <- env.assetsStore.listTenantAssets(ctx.tenant.id)(cfg)
        } yield {
          Ok(JsArray(assets.map(item => {
            val id = item.content.key.split("/").last

            (slugs.get(id) match {
              case Some(slug) => item.copy(slug = slug)
              case None       => item
            }).asJson
          })))
        }
    }
  }

  def slugifiedAssets[T](ctx: ApiActionContext[T])(implicit env: Env) = {
    implicit val ec = env.defaultExecutionContext
    env.dataStore.assetRepo.forTenant(ctx.tenant).findAllNotDeleted().map {
      res => Ok(JsArray(res.map(_.asJson)))
    }
  }

  def deleteAsset[T](assetId: String, ctx: ApiActionContext[T])(implicit
      env: Env
  ) = {
    implicit val ec = env.defaultExecutionContext

    ctx.setCtxValue("assetId", assetId)
    internalDeleteAsset(assetId, ctx)
  }

  private def internalDeleteAsset[T](
      assetId: String,
      ctx: ApiActionContext[T]
  )(implicit env: Env) = {
    implicit val ec: ExecutionContext = env.defaultExecutionContext

    ctx.tenant.bucketSettings match {
      case None =>
        FastFuture.successful(
          NotFound(Json.obj("error" -> "No bucket config found !"))
        )
      case Some(cfg) =>
        env.dataStore.assetRepo
          .forTenant(ctx.tenant)
          .findOne(Json.obj("slug" -> assetId))
          .map(_.map(_.id.value))
          .map {
            case None     => assetId
            case Some(id) => id
          }
          .flatMap(id => {
            env.assetsStore
              .deleteTenantAsset(ctx.tenant.id, AssetId(id))(cfg)
              .flatMap { _ =>
                env.dataStore.assetRepo
                  .forTenant(ctx.tenant)
                  .deleteById(id)
                  .map(_ => Ok(Json.obj("done" -> true)))
              }
          })
    }
  }

  def doesAssetExists[T](slug: String, ctx: ApiActionContext[T])(implicit
      env: Env
  ) = {
    implicit val ec = env.defaultExecutionContext

    ctx.tenant.bucketSettings match {
      case None =>
        FastFuture.successful(
          NotFound(Json.obj("error" -> "No bucket config found !"))
        )
      case Some(cfg) =>
        env.dataStore.assetRepo
          .forTenant(ctx.tenant)
          .findOne(Json.obj("slug" -> slug))
          .map {
            case Some(_) => NoContent
            case None    => NotFound
          }
    }
  }

  def getAsset[T](assetId: String, ctx: ApiActionContext[T])(implicit
      env: Env
  ) = {
    implicit val ec = env.defaultExecutionContext

    ctx.tenant.bucketSettings match {
      case None =>
        FastFuture.successful(
          NotFound(Json.obj("error" -> "No bucket config found !"))
        )
      case Some(cfg) =>
        val download = ctx.request.getQueryString("download").contains("true")
        val redirect = ctx.request.getQueryString("redirect").contains("true")

        env.dataStore.assetRepo
          .forTenant(ctx.tenant)
          .findOne(Json.obj("slug" -> assetId))
          .map {
            case Some(asset) =>
              env.assetsStore.getTenantAssetPresignedUrl(
                ctx.tenant.id,
                asset.id
              )(cfg)
            case None =>
              env.assetsStore.getTenantAssetPresignedUrl(
                ctx.tenant.id,
                AssetId(assetId)
              )(cfg)
          }
          .flatMap {
            case None =>
              FastFuture.successful(
                NotFound(Json.obj("error" -> "Asset not found!"))
              )
            case Some(url) if redirect => FastFuture.successful(Redirect(url))
            case Some(_) =>
              env.assetsStore
                .getTenantAsset(ctx.tenant.id, AssetId(assetId))(cfg)
                .map {
                  case (_, bytes, _) if bytes.isEmpty =>
                    NotFound(Json.obj("error" -> "Asset empty!"))
                  case (metadata, _, source) =>
                    val filename = metadata.metadata
                      .filter(_.name().startsWith("x-amz-meta-"))
                      .find(_.name() == "x-amz-meta-filename")
                      .map(_.value())
                      .getOrElse("asset.txt")

                    val response = Ok.sendEntity(
                      HttpEntity.Streamed(
                        source,
                        None,
                        metadata.contentType
                          .map(Some.apply)
                          .getOrElse(Some("application/octet-stream"))
                      )
                    )

                    if (download)
                      response.withHeaders(
                        "Content-Disposition" -> s"""attachment; filename="$filename""""
                      )
                    else response
                }
          }
    }
  }

}
