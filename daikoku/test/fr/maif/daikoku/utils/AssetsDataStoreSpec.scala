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

import java.util.concurrent.ConcurrentLinkedQueue
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
        case HttpMethods.POST if query.startsWith("uploads") =>
          """<InitiateMultipartUploadResult><Bucket>assets</Bucket><Key>asset</Key><UploadId>upload</UploadId></InitiateMultipartUploadResult>"""
        case HttpMethods.PUT =>
          ""
        case HttpMethods.POST =>
          """<CompleteMultipartUploadResult><Location>http://localhost/asset</Location><Bucket>assets</Bucket><Key>asset</Key><ETag>"complete"</ETag></CompleteMultipartUploadResult>"""
        case method =>
          throw new IllegalStateException(s"Unexpected S3 request: $method")
      }
      HttpResponse(
        headers = List(RawHeader("ETag", "\"part\"")),
        entity = HttpEntity(
          ContentType(MediaTypes.`application/xml`, HttpCharsets.`UTF-8`),
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
