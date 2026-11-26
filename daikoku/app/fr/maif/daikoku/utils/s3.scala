package fr.maif.daikoku.utils

import fr.maif.daikoku.domain.*
import org.apache.pekko.Done
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.http.scaladsl.model.{
  ContentType,
  ContentTypes,
  HttpHeader
}
import org.apache.pekko.pattern.after
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.connectors.s3.*
import org.apache.pekko.stream.connectors.s3.headers.CannedAcl
import org.apache.pekko.stream.connectors.s3.scaladsl.S3
import org.apache.pekko.stream.scaladsl.{Keep, Sink, Source}
import org.apache.pekko.util.ByteString
import org.joda.time.DateTime
import play.api.libs.json.*
import software.amazon.awssdk.auth.credentials.*
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration
import software.amazon.awssdk.core.exception.SdkClientException
import software.amazon.awssdk.endpoints.{Endpoint, EndpointUrl}
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.regions.providers.AwsRegionProvider
import software.amazon.awssdk.services.s3.{S3AsyncClient, S3Client}
import software.amazon.awssdk.services.s3.model.{
  GetObjectRequest,
  ListObjectsV2Request
}
import software.amazon.awssdk.services.s3.presigner.S3Presigner
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest

import scala.concurrent.duration.DurationInt
import java.net.{URI, URL}
import java.util.concurrent.CompletableFuture
import java.util.concurrent.atomic.{AtomicBoolean, AtomicReference}
import scala.concurrent.{ExecutionContext, Future, TimeoutException}
import scala.jdk.CollectionConverters.*
import scala.util.Try

class BadFileContentFromContentType()
    extends RuntimeException("Bad file content")
    with scala.util.control.NoStackTrace

case class S3ListItem(
    content: ListBucketResultContents,
    objectMetadata: ObjectMetadata,
    slug: Option[String] = None
) {
  def asJson: JsValue =
    Json.obj(
      "bucketName" -> content.bucketName,
      "eTag" -> content.eTag,
      "key" -> content.key,
      "size" -> content.size,
      "storageClass" -> content.storageClass,
      "contentLength" -> objectMetadata.contentLength,
      "contentType" -> objectMetadata.contentType,
      "cacheControl" -> objectMetadata.cacheControl,
      "versionId" -> objectMetadata.versionId,
      "rawMeta" -> JsArray(
        objectMetadata.metadata.map(h =>
          Json.obj("key" -> h.name(), "value" -> h.value())
        )
      ),
      "meta" -> JsObject(
        objectMetadata.metadata
          .filter(_.name().startsWith("x-amz-meta-"))
          .map(h => (h.name().replace("x-amz-meta-", ""), JsString(h.value())))
      ),
      "slug" -> slug
    )
}

case class S3TestStep(
    name: String,
    status: String,
    error: Option[String] = None
) {
  def asJson: JsValue =
    Json.obj(
      "name" -> name,
      "status" -> status,
      "error" -> error
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
  val format: Format[S3Configuration] = new Format[S3Configuration] {
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
      } recover { case e =>
        JsError(e.getMessage)
      } get
    override def writes(o: S3Configuration): JsValue =
      Json.obj(
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

class AssetsDataStore(actorSystem: ActorSystem)(implicit
    ec: ExecutionContext,
    mat: Materializer
) {

  private def s3ClientSettingsAttrs(implicit conf: S3Configuration) = {
    val awsCredentials = StaticCredentialsProvider.create(
      AwsBasicCredentials.create(conf.access, conf.secret)
    )
    val settings = S3Settings(
      bufferType = MemoryBufferType,
      credentialsProvider = awsCredentials,
      s3RegionProvider = new AwsRegionProvider {
        override def getRegion: Region = Region.of(conf.region)
      },
      listBucketApiVersion = ApiVersion.ListBucketVersion2,
      // Pekko S3 1.3 filters all headers by default with this constructor.
      allowedHeaders = Map(
        "PutObject" -> Set(
          "x-amz-acl",
          "x-amz-meta-filename",
          "x-amz-meta-title",
          "x-amz-meta-desc",
          "x-amz-meta-team",
          "x-amz-meta-tenant",
          "x-amz-meta-asset",
          "x-amz-meta-content-type",
          "x-amz-meta-user"
        )
      )
    ).withEndpointUrl(conf.endpoint)
    S3Attributes.settings(settings)
  }

  private def putObject(
      key: String,
      contentType: ContentType,
      content: Source[ByteString, ?],
      meta: MetaHeaders = MetaHeaders(Map.empty)
  )(implicit conf: S3Configuration): Future[ObjectMetadata] =
    content
      .runFold(ByteString.empty)(_ ++ _)
      .flatMap { bytes =>
        S3.putObject(
          bucket = conf.bucket,
          key = key,
          data = Source.single(bytes),
          contentLength = bytes.length.toLong,
          contentType = contentType,
          s3Headers = S3Headers()
            .withCannedAcl(CannedAcl.Private)
            .withMetaHeaders(meta)
        ).withAttributes(s3ClientSettingsAttrs)
          .runWith(Sink.head)
      }

  def storeAsset(
      tenant: TenantId,
      team: TeamId,
      asset: AssetId,
      name: String,
      title: String,
      desc: String,
      contentType: String,
      content: Source[ByteString, ?]
  )(implicit conf: S3Configuration): Future[ObjectMetadata] = {
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
      )
    )

    val checkedContent = content
      .map { byteString =>
        if (!validated.get()) {
          val start = ref.get()
          if (start.size < 4) {
            ref.set(start ++ byteString)
            byteString
          } else {
            fr.maif.daikoku.utils.FileChecker.isWellSigned(
              contentType,
              ref.get().take(4).toArray
            ) match {
              case Some(v) if v =>
                validated.set(true)
                byteString
              case Some(v) if !v =>
                throw new BadFileContentFromContentType()
              case _ =>
                validated.set(true)
                byteString
            }
          }
        } else {
          byteString
        }
      }

    putObject(
      s"/${tenant.value}/teams/${team.value}/assets/${asset.value}",
      ctype,
      checkedContent,
      meta
    )
  }

  def listAssets(tenant: TenantId, team: TeamId)(implicit
      conf: S3Configuration
  ): Future[Seq[S3ListItem]] =
    listAssets(s"/${tenant.value}/teams/${team.value}/assets")

  private def listAssets(prefix: String)(implicit
      conf: S3Configuration
  ): Future[Seq[S3ListItem]] = {
    val client = S3AsyncClient
      .builder()
      .credentialsProvider(
        StaticCredentialsProvider.create(
          AwsBasicCredentials.create(conf.access, conf.secret)
        )
      )
      .region(Region.of(conf.region))
      // Preserve the connector's bucket-scoped endpoint, including {bucket} templates.
      .endpointProvider(_ =>
        CompletableFuture.completedFuture(
          Endpoint
            .builder()
            .endpointUrl(
              EndpointUrl.fromUri(
                URI.create(conf.endpoint.replace("{bucket}", conf.bucket))
              )
            )
            .build()
        )
      )
      .build()
    val requests = Seq(prefix, prefix.stripPrefix("/")).distinct.map { p =>
      ListObjectsV2Request
        .builder()
        .bucket(conf.bucket)
        .prefix(p)
        .build()
    }
    val attrs = s3ClientSettingsAttrs

    Source(requests)
      .flatMapConcat(request =>
        Source.fromPublisher(client.listObjectsV2Paginator(request))
      )
      .mapConcat(_.contents().asScala.toList)
      .mapAsync(1) { obj =>
        val content = ListBucketResultContents(
          conf.bucket,
          obj.key(),
          obj.eTag(),
          obj.size().longValue(),
          obj.lastModified(),
          obj.storageClassAsString()
        )
        S3.getObjectMetadata(conf.bucket, content.key)
          .withAttributes(attrs)
          .runWith(Sink.head)
          .map(meta =>
            S3ListItem(
              content,
              meta.getOrElse(
                ObjectMetadata(collection.immutable.Seq.empty[HttpHeader])
              )
            )
          )
      }
      .runWith(Sink.seq)
      .map(_.distinctBy(_.content.key))
      .transform { result =>
        client.close()
        result
      }
  }

  def deleteAsset(tenant: TenantId, team: TeamId, asset: AssetId)(implicit
      conf: S3Configuration
  ): Future[Done] = {
    S3.deleteObject(
      conf.bucket,
      s"/${tenant.value}/teams/${team.value}/assets/${asset.value}"
    ).withAttributes(s3ClientSettingsAttrs)
      .toMat(Sink.ignore)(Keep.right)
      .run()
  }

  def getAsset(tenant: TenantId, team: TeamId, asset: AssetId)(implicit
      conf: S3Configuration
  ): S3response = {
    val key = s"/${tenant.value}/teams/${team.value}/assets/${asset.value}"
    getAsset(key)
  }

  def checkBucket()(implicit conf: S3Configuration): Future[BucketAccess] = {
    S3.checkIfBucketExists(conf.bucket)(using
      actorSystem,
      s3ClientSettingsAttrs
    )
  }

  def testConfiguration(
      tenant: TenantId
  )(implicit conf: S3Configuration): Future[Seq[S3TestStep]] = {
    val id = IdGenerator.token(32)
    val prefix = s"/${tenant.value}/_test"
    val key = s"$prefix/$id"
    val content = ByteString("daikoku bucket test")

    def attempt(name: String, previous: S3TestStep*)(
        operation: => Future[Any]
    ): Future[S3TestStep] =
      if (previous.exists(_.status != "success"))
        Future.successful(S3TestStep(name, "skipped"))
      else
        Future
          .firstCompletedOf(
            Seq(
              Future.unit.flatMap(_ => operation),
              after(10.seconds, actorSystem.scheduler)(
                Future.failed(
                  new TimeoutException("no response after 10 seconds")
                )
              )
            )
          )
          .map(_ => S3TestStep(name, "success"))
          .recover { case e =>
            S3TestStep(
              name,
              "failed",
              Some(Option(e.getMessage).getOrElse(e.toString))
            )
          }

    def upload: Future[Any] =
      putObject(key, ContentTypes.`text/plain(UTF-8)`, Source.single(content))

    def download: Future[Any] =
      getAsset(key).map { case (_, bytes, _) =>
        if (bytes != content)
          throw new RuntimeException(
            "the content read differs from the content written"
          )
      }

    def listing: Future[Any] =
      listAssets(prefix).map { items =>
        if (!items.exists(_.content.key.endsWith(id)))
          throw new RuntimeException(
            "the test file is missing from the listing"
          )
      }

    def removal: Future[Any] =
      S3.deleteObject(conf.bucket, key)
        .withAttributes(s3ClientSettingsAttrs)
        .runWith(Sink.ignore)

    for {
      write <- attempt("write")(upload)
      read <- attempt("read", write)(download)
      list <- attempt("list", write, read)(listing)
      cleanup <- attempt("delete")(removal)
    } yield Seq(
      write,
      read,
      list,
      if (write.status == "success") cleanup
      else S3TestStep("delete", "skipped")
    )
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  def storeTenantAsset(
      tenant: TenantId,
      asset: AssetId,
      name: String,
      title: String,
      desc: String,
      contentType: String,
      content: Source[ByteString, ?]
  )(implicit conf: S3Configuration): Future[ObjectMetadata] = {
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
      )
    )

    putObject(
      s"/${tenant.value}/tenant-assets/${asset.value}",
      ctype,
      content,
      meta
    )
  }

  def getTenantAssetMetaHeaders(tenant: TenantId, asset: AssetId)(implicit
      conf: S3Configuration
  ): Future[Option[ObjectMetadata]] = {
    S3.getObjectMetadata(
      bucket = conf.bucket,
      key = s"/${tenant.value}/tenant-assets/${asset.value}"
    ).withAttributes(s3ClientSettingsAttrs)
      .runWith(Sink.head)
  }

  def getAssetMetaHeaders(tenant: TenantId, team: TeamId, asset: AssetId)(
      implicit conf: S3Configuration
  ): Future[Option[ObjectMetadata]] = {
    S3.getObjectMetadata(
      bucket = conf.bucket,
      key = s"/${tenant.value}/teams/${team.value}/assets/${asset.value}"
    ).withAttributes(s3ClientSettingsAttrs)
      .runWith(Sink.head)
  }

  def listTenantAssets(
      tenant: TenantId
  )(implicit conf: S3Configuration): Future[Seq[S3ListItem]] =
    listAssets(s"/${tenant.value}/tenant-assets")

  def deleteTenantAsset(tenant: TenantId, asset: AssetId)(implicit
      conf: S3Configuration
  ): Future[Done] = {
    S3.deleteObject(
      conf.bucket,
      s"/${tenant.value}/tenant-assets/${asset.value}"
    ).withAttributes(s3ClientSettingsAttrs)
      .toMat(Sink.ignore)(Keep.right)
      .run()
  }

  type S3response = Future[
    (ObjectMetadata, ByteString, Source[ByteString, Future[ObjectMetadata]])
  ]
  def getAsset(key: String)(implicit
      conf: S3Configuration
  ): S3response = {
    val s3Source =
      S3.getObject(conf.bucket, key)
        .withAttributes(s3ClientSettingsAttrs)
    val (metaF, byteF): (Future[ObjectMetadata], Future[ByteString]) =
      s3Source.toMat(Sink.fold(ByteString.empty)(_ ++ _))(Keep.both).run()

    for {
      meta <- metaF
      bytes <- byteF
    } yield {
      (meta, bytes, s3Source)
    }
  }

  def getTenantAsset(tenant: TenantId, asset: AssetId)(implicit
      conf: S3Configuration
  ): S3response = {
    val key = s"/${tenant.value}/tenant-assets/${asset.value}"
    getAsset(key)

  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  def storeUserAsset(
      tenant: TenantId,
      user: UserId,
      asset: AssetId,
      filename: String,
      contentType: String,
      content: Source[ByteString, ?]
  )(implicit conf: S3Configuration): Future[ObjectMetadata] = {
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
      )
    )

    putObject(s"/users/${asset.value}", ctype, content, meta)
  }

  def getUserAsset(tenant: TenantId, user: UserId, asset: AssetId)(implicit
      conf: S3Configuration
  ): S3response = {
    val key = s"/users/${asset.value}"
    getAsset(key)
  }

  def getThumbnail(tenant: TenantId, asset: AssetId)(implicit
      conf: S3Configuration
  ): S3response = {
    val key = s"/${tenant.value}/thumbnails/${asset.value}"
    getAsset(key)
  }

  def storeThumbnail(
      tenant: TenantId,
      asset: AssetId,
      content: Source[ByteString, ?]
  )(implicit conf: S3Configuration): Future[ObjectMetadata] = {
    val ctype = ContentType
      .parse("image/png")
      .getOrElse(ContentTypes.`application/octet-stream`)
    val meta = MetaHeaders(
      Map(
        "tenant" -> tenant.value,
        "asset" -> asset.value
      )
    )

    putObject(
      s"/${tenant.value}/thumbnails/${asset.value}",
      ctype,
      content,
      meta
    )
  }
/// generate pre signed url //////

  private def getPresignedUrl(
      path: String
  )(implicit conf: S3Configuration): Option[String] = {

    lazy val credentials = AwsBasicCredentials.create(conf.access, conf.secret)
    lazy val credentialsProvider = StaticCredentialsProvider.create(credentials)

    lazy val presigner: S3Presigner = S3Presigner
      .builder()
      .credentialsProvider(credentialsProvider)
      .region(Region.of(conf.region))
      .endpointOverride(URI.create(conf.endpoint))
      .build()

    try {
      val getObjectRequest = GetObjectRequest
        .builder()
        .bucket(conf.bucket)
        .key(path)
        .build()

      val presignRequest = GetObjectPresignRequest
        .builder()
        .signatureDuration(java.time.Duration.ofNanos(1.hour.toNanos))
        .getObjectRequest(getObjectRequest)
        .build()

      val presignedUrl = presigner.presignGetObject(presignRequest)

      Some(presignedUrl.url().toString)
    } catch {
      case _: Exception => None
    }

  }

  def getTeamAssetPresignedUrl(tenant: TenantId, team: TeamId, asset: AssetId)(
      implicit conf: S3Configuration
  ): Option[String] = {
    val path = s"/${tenant.value}/teams/${team.value}/assets/${asset.value}"
    getPresignedUrl(path)
  }

  def getTenantAssetPresignedUrl(tenant: TenantId, asset: AssetId)(implicit
      conf: S3Configuration
  ): Option[String] = {

    val path = s"/${tenant.value}/tenant-assets/${asset.value}"
    getPresignedUrl(path)
  }

}
