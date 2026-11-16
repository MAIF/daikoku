package fr.maif.daikoku.controllers

import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import fr.maif.daikoku.domain.{Tenant, UserSession}
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import fr.maif.daikoku.utils.S3Configuration
import org.apache.pekko.util.ByteString
import org.scalatest.BeforeAndAfterEach
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.wait.strategy.Wait
import org.testcontainers.utility.MountableFile
import play.api.libs.json.{JsObject, Json}
import play.api.libs.ws.WSBodyWritables.*
import play.api.libs.ws.WSResponse
import software.amazon.awssdk.auth.credentials.{
  AwsBasicCredentials,
  StaticCredentialsProvider
}
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.CreateBucketRequest

import java.net.URI
import java.util.Base64
import scala.concurrent.Await
import scala.concurrent.duration.*

class AssetsControllerSpec
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfterEach
    with ForAllTestContainer {

  override val container: GenericContainer = {
    val s3 = GenericContainer(
      "chrislusf/seaweedfs:3.85",
      exposedPorts = Seq(8333),
      command = Seq(
        "server",
        "-s3",
        "-dir=/data",
        "-ip=127.0.0.1",
        "-ip.bind=0.0.0.0",
        "-master.volumeSizeLimitMB=32",
        "-s3.config=/etc/seaweedfs-s3.json",
        // Bucket "127" is reachable on loopback in virtual-host mode without DNS.
        "-s3.domainName=0.0.1"
      ),
      waitStrategy = Wait.forListeningPort()
    )
    s3.container.withCopyFileToContainer(
      MountableFile.forClasspathResource("s3/seaweedfs.json"),
      "/etc/seaweedfs-s3.json"
    )
    s3
  }

  private lazy val bucketSettings: S3Configuration = {
    val settings = S3Configuration(
      bucket = "127",
      endpoint = s"http://127.0.0.1:${container.mappedPort(8333)}",
      region = "us-east-1",
      access = "assets-test",
      secret = "assets-test-password"
    )
    val client = S3Client
      .builder()
      .endpointOverride(
        URI.create(s"http://${container.host}:${container.mappedPort(8333)}")
      )
      .region(Region.US_EAST_1)
      .credentialsProvider(
        StaticCredentialsProvider.create(
          AwsBasicCredentials.create(settings.access, settings.secret)
        )
      )
      .forcePathStyle(true)
      .build()
    try {
      client.createBucket(
        CreateBucketRequest.builder().bucket(settings.bucket).build()
      )
    } finally client.close()
    settings
  }

  private def assetTenant: Tenant =
    tenant.copy(bucketSettings = Some(bucketSettings))
  private val png = ByteString(
    Base64.getDecoder.decode(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="
    )
  )
  private val multipartPng = png ++ ByteString(new Array[Byte](5 * 1024 * 1024))

  override def beforeEach(): Unit = {
    super.beforeEach()
    setupEnvBlocking(
      tenants = Seq(assetTenant),
      users = Seq(tenantAdmin, userAdmin),
      teams = Seq(defaultAdminTeam, teamOwner)
    )
  }

  private def call(
      path: String,
      session: UserSession,
      method: String = "GET",
      content: Option[ByteString] = None
  ): WSResponse = {
    val request = daikokuComponents.env.wsClient
      .url(s"http://127.0.0.1:$port$path")
      .withQueryStringParameters("sessionId" -> session.sessionId.value)
      .withHttpHeaders(
        "Host" -> assetTenant.domain,
        "Content-Type" -> "image/png"
      )
      .withFollowRedirects(false)
      .withMethod(method)
    Await.result(
      content.fold(request)(request.withBody(_)).execute(),
      30.seconds
    )
  }

  "Team assets backed by S3" should {
    "preserve multipart content and metadata through upload, listing, replacement and deletion" in {
      val session = loginWithBlocking(userAdmin, assetTenant)
      val root = s"/api/teams/${teamOwner.id.value}/assets"
      call(root, session).status mustBe 200
      val upload = call(
        s"$root?filename=image.png&title=image&desc=description",
        session,
        "POST",
        Some(multipartPng)
      )
      withClue(upload.body) { upload.status mustBe 200 }
      val id = (upload.json \ "id").as[String]
      try {
        val listing = call(root, session)
        listing.status mustBe 200
        val item = listing.json
          .as[Seq[JsObject]]
          .find(a => (a \ "meta" \ "asset").asOpt[String].contains(id))
          .getOrElse(
            fail(s"Uploaded asset $id missing from listing: ${listing.body}")
          )
        (item \ "meta").as[JsObject] mustBe Json.obj(
          "asset" -> id,
          "filename" -> "image.png",
          "title" -> "image",
          "desc" -> "description",
          "tenant" -> assetTenant.id.value,
          "team" -> teamOwner.id.value,
          "content-type" -> "image/png"
        )
        val download = call(s"$root/$id?download=true", session)
        download.status mustBe 200
        download.contentType mustBe "image/png"
        download.bodyAsBytes mustBe multipartPng

        val replaced = call(s"$root/$id/_replace", session, "POST", Some(png))
        withClue(replaced.body) { replaced.status mustBe 200 }
        val updated = call(s"$root/$id", session)
        updated.status mustBe 200
        updated.bodyAsBytes mustBe png
        val updatedItem = call(root, session).json
          .as[Seq[JsObject]]
          .find(a => (a \ "meta" \ "asset").asOpt[String].contains(id))
          .getOrElse(fail("Replaced asset missing from listing"))
        (updatedItem \ "meta") mustBe (item \ "meta")
      } finally {
        call(s"$root/$id", session, "DELETE").status mustBe 200
      }
      call(root, session).json
        .as[Seq[JsObject]]
        .exists(a =>
          (a \ "meta" \ "asset").asOpt[String].contains(id)
        ) mustBe false
    }
  }

  "Tenant assets backed by S3" should {
    "preserve content, metadata and the persisted slug through upload, replacement and deletion" in {
      val session = loginWithBlocking(tenantAdmin, assetTenant)
      val root = "/tenant-assets"
      val upload = call(
        s"$root?filename=tenant-image.png&title=image&desc=description",
        session,
        "POST",
        Some(png)
      )
      withClue(upload.body) { upload.status mustBe 200 }
      val id = (upload.json \ "id").as[String]
      (upload.json \ "slug").as[String] mustBe "tenant-image-png"
      try {
        val listing = call(root, session)
        listing.status mustBe 200
        val item = listing.json
          .as[Seq[JsObject]]
          .find(a => (a \ "meta" \ "asset").asOpt[String].contains(id))
          .getOrElse(
            fail(s"Uploaded asset $id missing from listing: ${listing.body}")
          )
        (item \ "meta").as[JsObject] mustBe Json.obj(
          "asset" -> id,
          "filename" -> "tenant-image.png",
          "title" -> "image",
          "desc" -> "description",
          "tenant" -> assetTenant.id.value,
          "content-type" -> "image/png"
        )
        (item \ "slug").as[String] mustBe "tenant-image-png"
        val aliases = call(s"$root/slugified", session)
        aliases.status mustBe 200
        aliases.json.as[Seq[JsObject]] must contain(
          Json.obj(
            "_id" -> id,
            "_tenant" -> assetTenant.id.value,
            "slug" -> "tenant-image-png"
          )
        )
        val download = call(s"$root/$id?download=true", session)
        download.status mustBe 200
        download.contentType mustBe "image/png"
        download.bodyAsBytes mustBe png

        val replaced =
          call(s"$root/$id/_replace", session, "POST", Some(multipartPng))
        withClue(replaced.body) { replaced.status mustBe 200 }
        val updated = call(s"$root/$id", session)
        updated.status mustBe 200
        updated.bodyAsBytes mustBe multipartPng
        val updatedItem = call(root, session).json
          .as[Seq[JsObject]]
          .find(a => (a \ "meta" \ "asset").asOpt[String].contains(id))
          .getOrElse(fail("Replaced asset missing from listing"))
        (updatedItem \ "meta") mustBe (item \ "meta")
        (updatedItem \ "slug").as[String] mustBe "tenant-image-png"
      } finally {
        call(s"$root/$id", session, "DELETE").status mustBe 200
      }
      call(root, session).json
        .as[Seq[JsObject]]
        .exists(a =>
          (a \ "meta" \ "asset").asOpt[String].contains(id)
        ) mustBe false
      call(s"$root/slugified", session).json
        .as[Seq[JsObject]]
        .exists(a => (a \ "_id").as[String] == id) mustBe false
    }
  }
}
