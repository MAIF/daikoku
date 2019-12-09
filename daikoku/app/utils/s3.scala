package fr.maif.otoroshi.daikoku.utils

import java.util.concurrent.atomic.{AtomicBoolean, AtomicReference}

import akka.actor.ActorSystem
import akka.http.scaladsl.model.{ContentType, ContentTypes, HttpHeader}
import akka.stream.ActorMaterializer
import akka.stream.alpakka.s3._
import akka.stream.alpakka.s3.headers.CannedAcl
import akka.stream.alpakka.s3.scaladsl.S3
import akka.stream.scaladsl.{Flow, Keep, Sink, Source}
import akka.util.ByteString
import akka.{Done, NotUsed}
import com.amazonaws.auth.{AWSStaticCredentialsProvider, BasicAWSCredentials}
import com.amazonaws.regions.AwsRegionProvider
import fr.maif.otoroshi.daikoku.domain._
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Try}

class BadFileContentFromContentType()
    extends RuntimeException("Bad file content")
    with scala.util.control.NoStackTrace

case class S3ListItem(content: ListBucketResultContents,
                      objectMetadata: ObjectMetadata) {
  def asJson: JsValue = Json.obj(
    "bucketName" -> content.bucketName,
    "eTag" -> content.eTag,
    "key" -> content.key,
    "size" -> content.size,
    "storageClass" -> content.storageClass,
    "contentLength" -> objectMetadata.contentLength,
    "contentType" -> objectMetadata.contentType,
    "cacheControl" -> objectMetadata.cacheControl,
    "versionId" -> objectMetadata.versionId,
    "rawMeta" -> JsArray(objectMetadata.metadata.map(h =>
      Json.obj("key" -> h.name(), "value" -> h.value()))),
    "meta" -> JsObject(
      objectMetadata.metadata
        .filter(_.name().startsWith("x-amz-meta-"))
        .map(h => (h.name().replace("x-amz-meta-", ""), JsString(h.value()))))
  )
}

case class S3Configuration(
    bucket: String,
    endpoint: String,
    region: String,
    access: String,
    secret: String,
    chunkSize: Int = 1024 * 1024 * 8,
    v4auth: Boolean = true
) extends CanJson[S3Configuration] {
  override def asJson: JsValue = S3Configuration.format.writes(this)
}

object S3Configuration {
  val format = new Format[S3Configuration] {
    override def reads(json: JsValue): JsResult[S3Configuration] =
      Try {
        JsSuccess(
          S3Configuration(
            bucket = (json \ "bucket").as[String],
            endpoint = (json \ "endpoint").as[String],
            region = (json \ "region").as[String],
            access = (json \ "access").as[String],
            secret = (json \ "secret").as[String],
            chunkSize =
              (json \ "chunkSize").asOpt[Int].getOrElse(1024 * 1024 * 8),
            v4auth = (json \ "v4auth").asOpt[Boolean].getOrElse(true)
          )
        )
      } recover {
        case e => JsError(e.getMessage)
      } get
    override def writes(o: S3Configuration): JsValue = Json.obj(
      "bucket" -> o.bucket,
      "endpoint" -> o.endpoint,
      "region" -> o.region,
      "access" -> o.access,
      "secret" -> o.secret,
      "chunkSize" -> o.chunkSize,
      "v4auth" -> o.v4auth
    )
  }
}

class AssetsDataStore(actorSystem: ActorSystem)(implicit ec: ExecutionContext,
                                                mat: ActorMaterializer) {

  private def s3ClientSettingsAttrs(implicit conf: S3Configuration) = {
    val awsCredentials = new AWSStaticCredentialsProvider(
      new BasicAWSCredentials(conf.access, conf.secret))
    //val url = new URL(conf.endpoint)
    //val proxy = Option(Proxy(url.getHost, url.getPort, url.getProtocol))
    //val settings = new S3Settings(MemoryBufferType, proxy, awsCredentials, conf.region, true)
    val settings = S3Settings(
      bufferType = MemoryBufferType,
      credentialsProvider = awsCredentials,
      s3RegionProvider = new AwsRegionProvider() {
        override def getRegion: String = conf.region
      },
      listBucketApiVersion = ApiVersion.ListBucketVersion2
    ).withEndpointUrl(conf.endpoint)
      .withPathStyleAccess(true)
    S3Attributes.settings(settings)
  }

  def storeAsset(tenant: TenantId,
                 team: TeamId,
                 asset: AssetId,
                 name: String,
                 title: String,
                 desc: String,
                 contentType: String,
                 content: Source[ByteString, _])(
      implicit conf: S3Configuration): Future[MultipartUploadResult] = {
    val ref = new AtomicReference[ByteString](ByteString.empty)
    val validated = new AtomicBoolean(false)
    val ctype = ContentType
      .parse(contentType)
      .getOrElse(ContentTypes.`application/octet-stream`)
    val meta = MetaHeaders(
      Map(
        "filename" -> name,
        "title" -> title,
        "desc" -> desc,
        "team" -> team.value,
        "tenant" -> tenant.value,
        "asset" -> asset.value,
        "content-type" -> ctype.value
      ))
    val sink = S3
      .multipartUpload(
        bucket = conf.bucket,
        key = s"/${tenant.value}/teams/${team.value}/assets/${asset.value}",
        contentType = ctype,
        metaHeaders = meta,
        cannedAcl = CannedAcl.Private, // CannedAcl.PublicRead
        chunkingParallelism = 1
      )
      .withAttributes(s3ClientSettingsAttrs)
    content
      .map { byteString =>
        if (!validated.get()) {
          val start = ref.get()
          if (start.size < 4) {
            ref.set(start ++ byteString)
            byteString
          } else {
            utils.FileChecker.isWellSigned(contentType,
                                           ref.get().take(4).toArray) match {
              case Some(v) if v =>
                validated.set(true)
                byteString
              case Some(v) if !v =>
                throw new BadFileContentFromContentType()
              case None =>
                validated.set(true)
                byteString
            }
          }
        } else {
          byteString
        }
      }
      .toMat(sink)(Keep.right)
      .run()
    // S3.putObject(
    //   conf.bucket,
    //   s"/${tenant.value}/teams/${team.value}/assets/${asset.value}.test",
    //   Source.single(ByteString("hello")), 5,
    //   ContentTypes.`text/plain(UTF-8)`,
    //   S3Headers.create()
    //     .withCannedAcl(CannedAcl.Private)
    //     .withMetaHeaders(meta)
    //     .withStorageClass(StorageClass.Standard)
    // ).withAttributes(s3ClientSettingsAttrs).runForeach(e => println(e))
  }

  def listAssets(tenant: TenantId, team: TeamId)(
      implicit conf: S3Configuration): Future[Seq[S3ListItem]] = {
    val attrs = s3ClientSettingsAttrs
    S3.listBucket(conf.bucket,
                  Some(s"/${tenant.value}/teams/${team.value}/assets"))
      .mapAsync(1) { content =>
        val none: Option[ObjectMetadata] = None
        S3.getObjectMetadata(conf.bucket, content.key)
          .withAttributes(attrs)
          .runFold(none)((_, opt) => opt)
          .map {
            case None =>
              S3ListItem(
                content,
                ObjectMetadata(collection.immutable.Seq.empty[HttpHeader]))
            case Some(meta) => S3ListItem(content, meta)
          }
      }
      .withAttributes(attrs)
      .runFold(Seq.empty[S3ListItem])((seq, item) => seq :+ item)
  }

  def deleteAsset(tenant: TenantId, team: TeamId, asset: AssetId)(
      implicit conf: S3Configuration): Future[Done] = {
    S3.deleteObject(
        conf.bucket,
        s"/${tenant.value}/teams/${team.value}/assets/${asset.value}")
      .withAttributes(s3ClientSettingsAttrs)
      .toMat(Sink.ignore)(Keep.right)
      .run()
  }

  def getAsset(tenant: TenantId, team: TeamId, asset: AssetId)(
      implicit conf: S3Configuration)
    : Future[Option[(Source[ByteString, NotUsed], ObjectMetadata)]] = {
    val none: Option[(Source[ByteString, NotUsed], ObjectMetadata)] = None
    S3.download(conf.bucket,
                s"/${tenant.value}/teams/${team.value}/assets/${asset.value}")
      .withAttributes(s3ClientSettingsAttrs)
      .runFold(none)((_, opt) => opt)
  }

  def checkBucket()(implicit conf: S3Configuration): Future[BucketAccess] = {
    S3.checkIfBucketExists(conf.bucket)(mat, s3ClientSettingsAttrs)
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  def storeTenantAsset(tenant: TenantId,
                       asset: AssetId,
                       name: String,
                       title: String,
                       desc: String,
                       contentType: String,
                       content: Source[ByteString, _])(
      implicit conf: S3Configuration): Future[MultipartUploadResult] = {
    val ctype = ContentType
      .parse(contentType)
      .getOrElse(ContentTypes.`application/octet-stream`)
    val meta = MetaHeaders(
      Map(
        "filename" -> name,
        "title" -> title,
        "desc" -> desc,
        "tenant" -> tenant.value,
        "asset" -> asset.value,
        "content-type" -> ctype.value
      ))
    val sink = S3
      .multipartUpload(
        bucket = conf.bucket,
        key = s"/${tenant.value}/tenant-assets/${asset.value}",
        contentType = ctype,
        metaHeaders = meta,
        cannedAcl = CannedAcl.Private, // CannedAcl.PublicRead
        chunkingParallelism = 1
      )
      .withAttributes(s3ClientSettingsAttrs)
    content.toMat(sink)(Keep.right).run()
  }

  def listTenantAssets(tenant: TenantId)(
      implicit conf: S3Configuration): Future[Seq[S3ListItem]] = {
    val attrs = s3ClientSettingsAttrs
    S3.listBucket(conf.bucket, Some(s"/${tenant.value}/tenant-assets"))
      .mapAsync(1) { content =>
        val none: Option[ObjectMetadata] = None
        S3.getObjectMetadata(conf.bucket, content.key)
          .withAttributes(attrs)
          .runFold(none)((_, opt) => opt)
          .map {
            case None =>
              S3ListItem(
                content,
                ObjectMetadata(collection.immutable.Seq.empty[HttpHeader]))
            case Some(meta) => S3ListItem(content, meta)
          }
      }
      .withAttributes(attrs)
      .runFold(Seq.empty[S3ListItem])((seq, item) => seq :+ item)
  }

  def deleteTenantAsset(tenant: TenantId, asset: AssetId)(
      implicit conf: S3Configuration): Future[Done] = {
    S3.deleteObject(conf.bucket,
                    s"/${tenant.value}/tenant-assets/${asset.value}")
      .withAttributes(s3ClientSettingsAttrs)
      .toMat(Sink.ignore)(Keep.right)
      .run()
  }

  def getTenantAsset(tenant: TenantId, asset: AssetId)(
      implicit conf: S3Configuration)
    : Future[Option[(Source[ByteString, NotUsed], ObjectMetadata)]] = {
    val none: Option[(Source[ByteString, NotUsed], ObjectMetadata)] = None
    S3.download(conf.bucket, s"/${tenant.value}/tenant-assets/${asset.value}")
      .withAttributes(s3ClientSettingsAttrs)
      .runFold(none)((_, opt) => opt)
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  def storeUserAsset(tenant: TenantId,
                     user: UserId,
                     asset: AssetId,
                     filename: String,
                     contentType: String,
                     content: Source[ByteString, _])(
      implicit conf: S3Configuration): Future[MultipartUploadResult] = {
    val ctype = ContentType
      .parse(contentType)
      .getOrElse(ContentTypes.`application/octet-stream`)
    val meta = MetaHeaders(
      Map(
        "user" -> user.value,
        "tenant" -> tenant.value,
        "asset" -> asset.value,
        "filename" -> filename,
        "content-type" -> ctype.value
      ))
    val sink = S3
      .multipartUpload(
        bucket = conf.bucket,
        key = s"/${tenant.value}/users/${user.value}/${asset.value}",
        contentType = ctype,
        metaHeaders = meta,
        cannedAcl = CannedAcl.Private, // CannedAcl.PublicRead
        chunkingParallelism = 1
      )
      .withAttributes(s3ClientSettingsAttrs)
    content.toMat(sink)(Keep.right).run()
  }

  def getUserAsset(tenant: TenantId, user: UserId, asset: AssetId)(
      implicit conf: S3Configuration)
    : Future[Option[(Source[ByteString, NotUsed], ObjectMetadata)]] = {
    val none: Option[(Source[ByteString, NotUsed], ObjectMetadata)] = None
    S3.download(conf.bucket,
                s"/${tenant.value}/users/${user.value}/${asset.value}")
      .withAttributes(s3ClientSettingsAttrs)
      .runFold(none)((_, opt) => opt)
  }

  def getThumbnail(tenant: TenantId, asset: AssetId)(
      implicit conf: S3Configuration)
    : Future[Option[(Source[ByteString, NotUsed], ObjectMetadata)]] = {
    val none: Option[(Source[ByteString, NotUsed], ObjectMetadata)] = None
    S3.download(conf.bucket, s"/${tenant.value}/thumbnails/${asset.value}")
      .withAttributes(s3ClientSettingsAttrs)
      .runFold(none)((_, opt) => opt)
  }

  def storeThumbnail(tenant: TenantId,
                     asset: AssetId,
                     content: Source[ByteString, _])(
      implicit conf: S3Configuration): Future[MultipartUploadResult] = {
    val ctype = ContentType
      .parse("image/png")
      .getOrElse(ContentTypes.`application/octet-stream`)
    val meta = MetaHeaders(
      Map(
        "tenant" -> tenant.value,
        "asset" -> asset.value
      ))
    val sink = S3
      .multipartUpload(
        bucket = conf.bucket,
        key = s"/${tenant.value}/thumbnails/${asset.value}",
        contentType = ctype,
        metaHeaders = meta,
        cannedAcl = CannedAcl.Private, // CannedAcl.PublicRead
        chunkingParallelism = 1
      )
      .withAttributes(s3ClientSettingsAttrs)
    content.toMat(sink)(Keep.right).run()
  }
}
