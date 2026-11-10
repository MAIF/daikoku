package fr.maif.daikoku.utils

import fr.maif.daikoku.domain.{AssetId, TeamId, TenantId, UserId}
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.http.scaladsl.Http
import org.apache.pekko.http.scaladsl.model.*
import org.apache.pekko.http.scaladsl.model.headers.RawHeader
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.Source
import org.apache.pekko.util.ByteString
import org.scalatest.{BeforeAndAfterAll, BeforeAndAfterEach}
import org.scalatestplus.play.PlaySpec
import software.amazon.awssdk.services.s3.model.{S3Exception as AwsS3Exception}

import java.util.concurrent.{CompletionException, ConcurrentLinkedQueue}
import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.{Await, ExecutionContext}
import scala.concurrent.duration.*
import scala.jdk.CollectionConverters.*

class AssetsDataStoreSpec
    extends PlaySpec
    with BeforeAndAfterAll
    with BeforeAndAfterEach {
  private implicit val system: ActorSystem = ActorSystem("assets-store-spec")
  private implicit val ec: ExecutionContext = system.dispatcher
  private implicit val mat: Materializer = Materializer(system)
  private val store = new AssetsDataStore(system)
  private val requests =
    new ConcurrentLinkedQueue[(String, Map[String, String])]()
  private val responseMediaType =
    new AtomicReference[MediaType.WithOpenCharset](MediaTypes.`application/xml`)
  private enum ListingMode {
    case Empty, Paginated, Denied
  }
  private val listingMode = new AtomicReference(ListingMode.Empty)
  private val listingRequests =
    new ConcurrentLinkedQueue[(Uri, Boolean)]()
  private val metadataRequests = new ConcurrentLinkedQueue[Uri]()
  private val server = Await.result(
    Http().newServerAt("127.0.0.1", 0).bindSync { request =>
      request.discardEntityBytes()
      val query = request.uri.rawQueryString.getOrElse("")
      val headers = request.headers
        .map { header =>
          header.lowercaseName() -> header.value()
        }
        .filter { case (name, _) =>
          name.startsWith("x-amz-meta-") || name == "x-amz-acl"
        }
        .toMap
      requests.add(query -> headers)
      val body = request.method match {
        case HttpMethods.GET if listingMode.get() == ListingMode.Denied =>
          """<Error><Code>AccessDenied</Code><Message>Listing denied</Message></Error>"""
        case HttpMethods.GET if listingMode.get() == ListingMode.Paginated =>
          val params = request.uri.query()
          val prefix = params.get("prefix").getOrElse("")
          val isFirstPage = params.get("continuation-token").isEmpty
          val name = if (isFirstPage) "first" else "second"
          val continuation =
            if (isFirstPage)
              "<NextContinuationToken>page/+ 2</NextContinuationToken>"
            else ""
          s"""<ListBucketResult><Name>assets</Name><Prefix>$prefix</Prefix><KeyCount>1</KeyCount><MaxKeys>1</MaxKeys><IsTruncated>$isFirstPage</IsTruncated>$continuation<Contents><Key>$prefix/$name</Key><LastModified>2026-01-01T00:00:00Z</LastModified><ETag>"$name"</ETag><Size>12</Size><StorageClass>STANDARD</StorageClass></Contents></ListBucketResult>"""
        case HttpMethods.GET =>
          """<ListBucketResult><Name>assets</Name><Prefix/><KeyCount>0</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated></ListBucketResult>"""
        case HttpMethods.HEAD =>
          ""
        case HttpMethods.POST if query.startsWith("uploads") =>
          """<InitiateMultipartUploadResult><Bucket>assets</Bucket><Key>asset</Key><UploadId>upload</UploadId></InitiateMultipartUploadResult>"""
        case HttpMethods.PUT =>
          ""
        case HttpMethods.POST =>
          """<CompleteMultipartUploadResult><Location>http://localhost/asset</Location><Bucket>assets</Bucket><Key>asset</Key><ETag>"complete"</ETag></CompleteMultipartUploadResult>"""
        case method =>
          throw new IllegalStateException(s"Unexpected S3 request: $method")
      }
      if (request.method == HttpMethods.GET) {
        listingRequests.add(
          request.uri -> request.headers.exists(header =>
            header.lowercaseName() == "authorization" &&
              header.value().startsWith("AWS4-HMAC-SHA256 ")
          )
        )
      }
      if (request.method == HttpMethods.HEAD) {
        metadataRequests.add(request.uri)
      }
      HttpResponse(
        status =
          if (
            request.method == HttpMethods.GET &&
            listingMode.get() == ListingMode.Denied
          )
            StatusCodes.Forbidden
          else StatusCodes.OK,
        headers = List(
          RawHeader("ETag", "\"part\""),
          RawHeader("x-amz-meta-filename", "test.txt")
        ),
        entity = HttpEntity(
          ContentType(responseMediaType.get(), HttpCharsets.`UTF-8`),
          body
        )
      )
    },
    10.seconds
  )

  private implicit val conf: S3Configuration = S3Configuration(
    bucket = "assets",
    endpoint = s"http://127.0.0.1:${server.localAddress.getPort}",
    region = "us-east-1",
    access = "test-access",
    secret = "test-secret"
  )
  private val tenant = TenantId("tenant")
  private val team = TeamId("team")
  private val asset = AssetId("asset")
  private def content = Source.single(ByteString("test content"))

  private def assertMetadata(expected: Map[String, String]): Unit = {
    val initiation = requests.asScala.filter(_._1.startsWith("uploads")).toSeq
    initiation must have size 1
    val headers = initiation.head._2
    expected.foreach { case (name, value) =>
      headers.get(s"x-amz-meta-$name") mustBe Some(value)
    }
    headers.get("x-amz-acl") mustBe Some("private")
  }

  override def beforeEach(): Unit = {
    super.beforeEach()
    requests.clear()
    responseMediaType.set(MediaTypes.`application/xml`)
    listingMode.set(ListingMode.Empty)
    listingRequests.clear()
    metadataRequests.clear()
  }

  "Asset listing" should {
    "accept S3 XML responses served as application/xml" in {
      Await.result(store.listTenantAssets(tenant), 10.seconds) mustBe empty
    }

    "accept S3 XML responses served as text/xml" in {
      responseMediaType.set(MediaTypes.`text/xml`)
      Await.result(store.listTenantAssets(tenant), 10.seconds) mustBe empty
    }

    "resolve bucket placeholders without changing endpoint addressing" in {
      val templateConf = conf.copy(
        bucket = "1",
        endpoint = conf.endpoint.replace("127.0.0.1", "127.0.0.{bucket}")
      )
      Await.result(
        store.listTenantAssets(tenant)(using templateConf),
        10.seconds
      ) mustBe empty
      listingRequests.asScala.map(_._1.path.toString).toSeq mustBe Seq("/")
    }

    "preserve pagination, keys, metadata and signed bucket-endpoint requests" in {
      responseMediaType.set(MediaTypes.`text/xml`)
      listingMode.set(ListingMode.Paginated)
      val prefix = "/tenant/tenant-assets"
      val items = Await.result(store.listTenantAssets(tenant), 10.seconds)

      items.map(_.content.key) mustBe Seq(s"$prefix/first", s"$prefix/second")
      items.map(_.content.bucketName) mustBe Seq("assets", "assets")
      items.map(_.content.eTag) mustBe Seq("\"first\"", "\"second\"")
      items.map(_.content.size) mustBe Seq(12L, 12L)
      items.map(_.content.storageClass) mustBe Seq("STANDARD", "STANDARD")
      items.foreach { item =>
        (item.asJson \ "meta" \ "filename").as[String] mustBe "test.txt"
      }
      val pages = listingRequests.asScala.toSeq
      pages must have size 2
      pages.foreach { case (uri, signed) =>
        uri.path.toString mustBe "/"
        uri.query().get("list-type") mustBe Some("2")
        uri.query().get("prefix") mustBe Some(prefix)
        signed mustBe true
      }
      pages(1)._1.query().get("continuation-token") mustBe Some("page/+ 2")
      metadataRequests.asScala.map(_.path.toString).toSeq mustBe
        Seq(s"/$prefix/first", s"/$prefix/second")
    }

    "list team assets using the team prefix" in {
      responseMediaType.set(MediaTypes.`text/xml`)
      listingMode.set(ListingMode.Paginated)
      val items = Await.result(store.listAssets(tenant, team), 10.seconds)
      items.map(_.content.key) mustBe Seq(
        "/tenant/teams/team/assets/first",
        "/tenant/teams/team/assets/second"
      )
    }

    "propagate access-denied responses instead of returning an empty list" in {
      responseMediaType.set(MediaTypes.`text/xml`)
      listingMode.set(ListingMode.Denied)
      val error = intercept[CompletionException] {
        Await.result(store.listTenantAssets(tenant), 10.seconds)
      }
      error.getCause match {
        case cause: AwsS3Exception =>
          cause.statusCode() mustBe 403
          cause.awsErrorDetails().errorCode() mustBe "AccessDenied"
        case cause => fail(s"Unexpected S3 failure: $cause")
      }
    }
  }

  "Asset uploads" should {
    "send team metadata when initiating the multipart upload" in {
      Await.result(
        store.storeAsset(
          tenant,
          team,
          asset,
          "test.txt",
          "Test",
          "Description",
          "text/plain",
          content
        ),
        10.seconds
      )
      assertMetadata(
        Map(
          "tenant" -> "tenant",
          "team" -> "team",
          "asset" -> "asset",
          "filename" -> "test.txt",
          "title" -> "Test",
          "desc" -> "Description",
          "content-type" -> "text/plain"
        )
      )
    }

    "send tenant metadata when initiating the multipart upload" in {
      Await.result(
        store.storeTenantAsset(
          tenant,
          asset,
          "test.txt",
          "Test",
          "Description",
          "text/plain",
          content
        ),
        10.seconds
      )
      assertMetadata(
        Map(
          "tenant" -> "tenant",
          "asset" -> "asset",
          "filename" -> "test.txt",
          "title" -> "Test",
          "desc" -> "Description",
          "content-type" -> "text/plain"
        )
      )
    }

    "send user metadata when initiating the multipart upload" in {
      Await.result(
        store.storeUserAsset(
          tenant,
          UserId("user"),
          asset,
          "test.txt",
          "text/plain",
          content
        ),
        10.seconds
      )
      assertMetadata(
        Map(
          "tenant" -> "tenant",
          "user" -> "user",
          "asset" -> "asset",
          "filename" -> "test.txt",
          "content-type" -> "text/plain"
        )
      )
    }

    "send thumbnail metadata when initiating the multipart upload" in {
      Await.result(store.storeThumbnail(tenant, asset, content), 10.seconds)
      assertMetadata(Map("tenant" -> "tenant", "asset" -> "asset"))
    }
  }

  override def afterAll(): Unit = {
    try {
      Await.result(server.unbind(), 10.seconds)
      Await.result(system.terminate(), 10.seconds)
    } finally super.afterAll()
  }
}
