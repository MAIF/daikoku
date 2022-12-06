package fr.maif.otoroshi.daikoku.tests

import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, StandardCopyOption}
import java.util.concurrent.TimeUnit
import akka.http.scaladsl.util.FastFuture
import akka.stream.scaladsl.{Keep, Sink, Source}
import com.auth0.jwt.algorithms.Algorithm
import com.themillhousegroup.scoup.Scoup
import fr.maif.otoroshi.daikoku.domain.TeamPermission._
import fr.maif.otoroshi.daikoku.domain.UsagePlan._
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.login.AuthProvider
import fr.maif.otoroshi.daikoku.modules.DaikokuComponentsInstances
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import org.joda.time.DateTime
import org.jsoup.nodes.Document
import org.mindrot.jbcrypt.BCrypt
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.{BeforeAndAfterAll, Suite, TestSuite}
import org.scalatestplus.play.components.OneServerPerSuiteWithComponents
import play.api.libs.json.{JsObject, JsValue, Json}
import play.api.libs.ws.{DefaultWSCookie, WSResponse}
import play.api.{Application, BuiltInComponents, Logger}
import reactivemongo.bson.BSONObjectID

import scala.concurrent.duration._
import scala.concurrent.{Await, Future, Promise}
import scala.sys.process.ProcessLogger
import scala.util.{Failure, Success, Try}

class DaikokuSuites extends Suite with BeforeAndAfterAll { thisSuite =>

  override protected def beforeAll(): Unit = {}

  override protected def afterAll(): Unit = {}

  override def toString: String = thisSuite.toString
}

object utils {
  trait OneServerPerSuiteWithMyComponents
      extends OneServerPerSuiteWithComponents
      with ScalaFutures {
    this: TestSuite =>

    lazy val daikokuComponents = {
      val components =
        new DaikokuComponentsInstances(context)
      println(s"Using env ${components.env}") // WARNING: important to keep, needed to switch env between suites
      components
    }

    override def components: BuiltInComponents = daikokuComponents

    override def fakeApplication(): Application = {
      daikokuComponents.application
    }
  }

  trait DaikokuSpecHelper { suite: OneServerPerSuiteWithMyComponents =>

    implicit val ec = daikokuComponents.env.defaultExecutionContext
    implicit val as = daikokuComponents.env.defaultActorSystem
    implicit val mat = daikokuComponents.env.defaultMaterializer

    val logger = Logger.apply("daikoku-spec-helper")

    def await(duration: FiniteDuration): Unit = {
      val p = Promise[Unit]
      daikokuComponents.env.defaultActorSystem.scheduler
        .scheduleOnce(duration) {
          p.trySuccess(())
        }
      Await.result(p.future, duration + 1.second)
    }

    def awaitF(duration: FiniteDuration): Future[Unit] = {
      val p = Promise[Unit]
      daikokuComponents.actorSystem.scheduler.scheduleOnce(duration) {
        p.trySuccess(())
      }
      p.future
    }

    def flushBlocking(): Unit = flush().futureValue

    def flush(): Future[Unit] = {
      for {
        _ <- daikokuComponents.env.dataStore.tenantRepo.deleteAll()
        _ <- daikokuComponents.env.dataStore.passwordResetRepo.deleteAll()
        _ <- daikokuComponents.env.dataStore.accountCreationRepo.deleteAll()
        _ <- daikokuComponents.env.dataStore.userRepo.deleteAll()
        _ <- daikokuComponents.env.dataStore.teamRepo.forAllTenant().deleteAll()
        _ <- daikokuComponents.env.dataStore.apiRepo.forAllTenant().deleteAll()
        _ <- daikokuComponents.env.dataStore.apiIssueRepo
          .forAllTenant()
          .deleteAll()
        _ <- daikokuComponents.env.dataStore.apiPostRepo
          .forAllTenant()
          .deleteAll()
        _ <- daikokuComponents.env.dataStore.apiSubscriptionRepo
          .forAllTenant()
          .deleteAll()
        _ <- daikokuComponents.env.dataStore.apiDocumentationPageRepo
          .forAllTenant()
          .deleteAll()
        _ <- daikokuComponents.env.dataStore.notificationRepo
          .forAllTenant()
          .deleteAll()
        _ <- daikokuComponents.env.dataStore.consumptionRepo
          .forAllTenant()
          .deleteAll()
        _ <- daikokuComponents.env.dataStore.auditTrailRepo
          .forAllTenant()
          .deleteAll()
        _ <- daikokuComponents.env.dataStore.userSessionRepo.deleteAll()
        _ <- daikokuComponents.env.dataStore.cmsRepo.forAllTenant().deleteAll()
        _ <- daikokuComponents.env.dataStore.messageRepo
          .forAllTenant()
          .deleteAll()
        _ <- daikokuComponents.env.dataStore.operationRepo.forAllTenant().deleteAll()
      } yield ()
    }

    def setupEnvBlocking(
        tenants: Seq[Tenant] = Seq.empty,
        users: Seq[User] = Seq.empty,
        teams: Seq[Team] = Seq.empty,
        apis: Seq[Api] = Seq.empty,
        subscriptions: Seq[ApiSubscription] = Seq.empty,
        pages: Seq[ApiDocumentationPage] = Seq.empty,
        notifications: Seq[Notification] = Seq.empty,
        consumptions: Seq[ApiKeyConsumption] = Seq.empty,
        sessions: Seq[UserSession] = Seq.empty,
        resets: Seq[PasswordReset] = Seq.empty,
        creations: Seq[AccountCreation] = Seq.empty,
        messages: Seq[Message] = Seq.empty,
        issues: Seq[ApiIssue] = Seq.empty,
        posts: Seq[ApiPost] = Seq.empty,
        cmsPages: Seq[CmsPage] = Seq.empty,
        operations: Seq[Operation] = Seq.empty
    ) = {
      Await.result(setupEnv(
        tenants,
        users,
        teams,
        apis,
        subscriptions,
        pages,
        notifications,
        consumptions,
        sessions,
        resets,
        creations,
        messages,
        issues,
        posts,
        cmsPages,
        operations
      ), 1.second)
    }

    def setupEnv(
        tenants: Seq[Tenant] = Seq.empty,
        users: Seq[User] = Seq.empty,
        teams: Seq[Team] = Seq.empty,
        apis: Seq[Api] = Seq.empty,
        subscriptions: Seq[ApiSubscription] = Seq.empty,
        pages: Seq[ApiDocumentationPage] = Seq.empty,
        notifications: Seq[Notification] = Seq.empty,
        consumptions: Seq[ApiKeyConsumption] = Seq.empty,
        sessions: Seq[UserSession] = Seq.empty,
        resets: Seq[PasswordReset] = Seq.empty,
        creations: Seq[AccountCreation] = Seq.empty,
        messages: Seq[Message] = Seq.empty,
        issues: Seq[ApiIssue] = Seq.empty,
        posts: Seq[ApiPost] = Seq.empty,
        cmsPages: Seq[CmsPage] = Seq.empty,
        operations: Seq[Operation] = Seq.empty
    ): Future[Unit] = {
      for {
        _ <- flush()
        _ <- daikokuComponents.env.dataStore.userSessionRepo.deleteAll()
        _ <- Source(tenants.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.tenantRepo.save(i)(
              daikokuComponents.env.defaultExecutionContext))
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(users.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.userRepo.save(i)(
              daikokuComponents.env.defaultExecutionContext))
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(teams.toList)
          .mapAsync(1)(
            i =>
              daikokuComponents.env.dataStore.teamRepo
                .forAllTenant()
                .save(i)(daikokuComponents.env.defaultExecutionContext))
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(apis.toList)
          .mapAsync(1)(
            i =>
              daikokuComponents.env.dataStore.apiRepo
                .forAllTenant()
                .save(i)(daikokuComponents.env.defaultExecutionContext))
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(subscriptions.toList)
          .mapAsync(1)(
            i =>
              daikokuComponents.env.dataStore.apiSubscriptionRepo
                .forAllTenant()
                .save(i)(daikokuComponents.env.defaultExecutionContext))
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(notifications.toList)
          .mapAsync(1)(
            i =>
              daikokuComponents.env.dataStore.notificationRepo
                .forAllTenant()
                .save(i)(daikokuComponents.env.defaultExecutionContext))
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(consumptions.toList)
          .mapAsync(1)(
            i =>
              daikokuComponents.env.dataStore.consumptionRepo
                .forAllTenant()
                .save(i)(daikokuComponents.env.defaultExecutionContext))
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(sessions.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.userSessionRepo.save(i)(
              daikokuComponents.env.defaultExecutionContext))
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(resets.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.passwordResetRepo.save(i)(
              daikokuComponents.env.defaultExecutionContext))
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(creations.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.accountCreationRepo.save(i)(
              daikokuComponents.env.defaultExecutionContext))
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(messages.toList)
          .mapAsync(1)(
            i =>
              daikokuComponents.env.dataStore.messageRepo
                .forAllTenant()
                .save(i)(daikokuComponents.env.defaultExecutionContext))
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(issues.toList)
          .mapAsync(1)(
            i =>
              daikokuComponents.env.dataStore.apiIssueRepo
                .forAllTenant()
                .save(i)(daikokuComponents.env.defaultExecutionContext))
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(posts.toList)
          .mapAsync(1)(
            i =>
              daikokuComponents.env.dataStore.apiPostRepo
                .forAllTenant()
                .save(i)(daikokuComponents.env.defaultExecutionContext))
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(cmsPages.toList)
          .mapAsync(1)(
            i =>
              daikokuComponents.env.dataStore.cmsRepo
                .forAllTenant()
                .save(i)(daikokuComponents.env.defaultExecutionContext))
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(pages.toList)
          .mapAsync(1)(
            i =>
              daikokuComponents.env.dataStore.apiDocumentationPageRepo
                .forAllTenant()
                .save(i)(daikokuComponents.env.defaultExecutionContext))
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(operations.toList)
          .mapAsync(1)(
            i =>
              daikokuComponents.env.dataStore.operationRepo
                .forAllTenant()
                .save(i)(daikokuComponents.env.defaultExecutionContext))
          .toMat(Sink.ignore)(Keep.right)
          .run()
      } yield ()
    }

    def logoutBlocking(user: User, on: Tenant): Unit =
      logoutBlocking(user.email, on)
    def logoutBlocking(email: String, on: Tenant): Unit = {
      logout(email, on).futureValue
      await(1.second)
    }

    def logout(email: String, on: Tenant): Future[Unit] = {
      daikokuComponents.env.dataStore.userSessionRepo
        .delete(
          Json.obj(
            "userEmail" -> email
          ))
        .map(_ => ())
    }

    def loginWithBlocking(user: User, on: Tenant): UserSession = {
      val r = loginWith(user.email, on).futureValue
      r
    }

    def loginWithBlocking(email: String, on: Tenant): UserSession =
      loginWith(email, on).futureValue

    def loginWith(email: String, on: Tenant): Future[UserSession] = {
      daikokuComponents.env.dataStore.userRepo
        .findOneNotDeleted(
          Json.obj(
            "email" -> email
          ))
        .flatMap {
          case None =>
            FastFuture.failed(new RuntimeException("User not found !!!"))
          case Some(user) =>
            daikokuComponents.env.dataStore.teamRepo
              .forTenant(on)
              .findOne(Json.obj())
              .map {
                case None =>
                  Team(
                    id = TeamId(BSONObjectID.generate().stringify),
                    tenant = on.id,
                    `type` = TeamType.Personal,
                    name = user.name,
                    description = s"The personal team of ${user.name}",
                    users = Set(UserWithPermission(user.id, Administrator)),
                    subscriptions = Seq.empty,
                    authorizedOtoroshiGroups = Set.empty
                  )
                case Some(team) => team
              }
              .flatMap(
                t =>
                  daikokuComponents.env.dataStore.teamRepo
                    .forTenant(on)
                    .save(t)
                    .map(_ => t))
              .flatMap { team =>
                val session = UserSession(
                  id = DatastoreId(BSONObjectID.generate().stringify),
                  userId = user.id,
                  userName = user.name,
                  userEmail = user.email,
                  impersonatorId = None,
                  impersonatorName = None,
                  impersonatorEmail = None,
                  impersonatorSessionId = None,
                  sessionId = UserSessionId(IdGenerator.token),
                  created = DateTime.now().minusSeconds(10),
                  expires = DateTime.now().minusSeconds(10).plusSeconds(500),
                  ttl = FiniteDuration(500, TimeUnit.SECONDS)
                )
                daikokuComponents.env.dataStore.userSessionRepo
                  .save(session)
                  .map { _ =>
                    session
                  }
              }
        }
    }

    def httpJsonCallBlocking(path: String,
                             method: String = "GET",
                             headers: Map[String, String] = Map.empty,
                             body: Option[JsValue] = None,
                             baseUrl: String = "http://127.0.0.1",
                             port: Int = port)(
        implicit tenant: Tenant,
        session: UserSession): WSResponse =
      Await.result(httpJsonCall(
        path,
        method,
        headers,
        body,
        baseUrl,
        port
      )(tenant, session), 5.seconds)

    def httpJsonCall(_path: String,
                     method: String = "GET",
                     headers: Map[String, String] = Map.empty,
                     body: Option[JsValue] = None,
                     baseUrl: String = "http://127.0.0.1",
                     port: Int = port)(
        implicit tenant: Tenant,
        session: UserSession): Future[WSResponse] = {
      val path = _path match {
        case str if str.contains("?") =>
          str + "&sessionId=" + session.sessionId.value
        case str => str + "?sessionId=" + session.sessionId.value
      }
      val builder = daikokuComponents.env.wsClient
        .url(s"$baseUrl:$port$path")
        .withHttpHeaders((Map("Host" -> tenant.domain) ++ headers).toSeq: _*)
        .withFollowRedirects(false)
        .withRequestTimeout(10.seconds)
        .withMethod(method)
      body
        .map(b => builder.withBody(b))
        .getOrElse(builder)
        .withCookies(DefaultWSCookie(
          name = "daikoku-sesssion",
          value = sign(
            Algorithm.HMAC256(daikokuComponents.env.config.secret),
            Json.obj("alg" -> "HS256"),
            Json.obj(
              "data" -> Json.obj(
                "sessionId" -> session.sessionId.value
              ),
              "exp" -> ((System
                .currentTimeMillis() - 10000) + (5 * 60 * 1000)) / 1000,
              "nbf" -> (System.currentTimeMillis() - 10000) / 1000,
              "iat" -> (System.currentTimeMillis() - 10000) / 1000
            )
          ),
          domain = Some("localhost"),
          path = Some("/"),
          maxAge = Some(500L),
          secure = false,
          httpOnly = true
        ))
        .execute()
    }

    def httpJsonCallWithoutSessionBlocking(
        path: String,
        method: String = "GET",
        headers: Map[String, String] = Map.empty,
        body: Option[JsValue] = None,
        baseUrl: String = "http://127.0.0.1",
        port: Int = port)(implicit tenant: Tenant): WSResponse =
      httpJsonCallWithoutSession(
        path,
        method,
        headers,
        body,
        baseUrl,
        port
      )(tenant).futureValue

    def httpJsonCallWithoutSession(path: String,
                                   method: String = "GET",
                                   headers: Map[String, String] = Map.empty,
                                   body: Option[JsValue] = None,
                                   baseUrl: String = "http://127.0.0.1",
                                   port: Int = port)(
        implicit tenant: Tenant): Future[WSResponse] = {
      val builder = daikokuComponents.env.wsClient
        .url(s"$baseUrl:$port$path")
        .withHttpHeaders((headers ++ Map("Host" -> tenant.domain)).toSeq: _*)
        .withFollowRedirects(false)
        .withRequestTimeout(10.seconds)
        .withMethod(method)
      body.map(b => builder.withBody(b)).getOrElse(builder).execute()
    }

    private def sign(algorithm: Algorithm,
                     headerJson: JsObject,
                     payloadJson: JsObject): String = {
      val header: String = org.apache.commons.codec.binary.Base64
        .encodeBase64URLSafeString(Json.toBytes(headerJson))
      val payload: String = org.apache.commons.codec.binary.Base64
        .encodeBase64URLSafeString(Json.toBytes(payloadJson))
      val signatureBytes: Array[Byte] = algorithm.sign(
        header.getBytes(StandardCharsets.UTF_8),
        payload.getBytes(StandardCharsets.UTF_8))
      val signature: String = org.apache.commons.codec.binary.Base64
        .encodeBase64URLSafeString(signatureBytes)
      String.format("%s.%s.%s", header, payload, signature)
    }

    def withFlushedDb(f: => Any): Any = {
//      logger.info("Flushing Db ...")
//      flushBlocking()
//      await(1.second)

      val r = f
      logger.info("Flushing Db ...")
      flush().onComplete {
        case Success(_) => r
        case Failure(exception) =>
          logger.error("Error during flushing db", exception)
      }

//
//      flushBlocking()
      await(0.1.second)
//      r
    }

    def openPageBlocking(path: String)(implicit tenant: Tenant,
                                       session: UserSession): Document =
      openPage(path)(tenant, session).futureValue

    def openPage(path: String)(implicit tenant: Tenant,
                               session: UserSession): Future[Document] =
      actionOnPage(path, Seq("--dump-dom"))(tenant, session).map(str =>
        Scoup.parseHTML(str))

    def screenshotPageBlocking(path: String)(implicit tenant: Tenant,
                                             session: UserSession): String =
      screenshotPage(path)(tenant, session).futureValue

    def screenshotPage(path: String)(implicit tenant: Tenant,
                                     session: UserSession): Future[String] =
      actionOnPage(path, Seq("--screenshot", "--window-size=1920,1080"))(
        tenant,
        session).map { res =>
        Try(Files.createDirectory(new File("./target/screenshots").toPath))
        Files.move(
          new File("./screenshot.png").toPath,
          new File(
            s"./target/screenshots/screenshot-${DateTime.now().toString("yyyy-MM-dd-HH-mm-ss-SSS")}.png").toPath,
          StandardCopyOption.REPLACE_EXISTING
        )
        res
      }

    def actionOnPage(path: String, action: Seq[String])(
        implicit tenant: Tenant,
        session: UserSession): Future[String] = {
      val url =
        s"http://${tenant.domain}:$port$path?sessionId=${session.sessionId.value}"
      val execs = Seq(
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "google-chrome-stable",
        "google-chrome",
        "google-chrome-beta",
        "google-stable",
        "chromium",
        "chromium-browser",
        "chrome",
        "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome",
        "/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome",
        "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome"
      )
      val promise = Promise[String]
      execs.find { exec =>
        var stdout = Seq.empty[String]
        val log = ProcessLogger { str =>
          stdout = stdout :+ str
        }
        try {
          val p = sys.process.Process
            .apply(exec,
                   Seq("--headless", "--disable-gpu") ++ action ++ Seq(url))
            .run(log)
          if (p.exitValue() == 0) {
            promise.trySuccess(stdout.mkString("\n"))
            true
          } else {
            logger.error("error " + exec + ": " + stdout.mkString("\n"))
            false
          }
        } catch {
          case e: Throwable =>
            logger.error("error " + exec, e)
            false
        }
      } match {
        case Some(_) => ()
        case None =>
          promise.tryFailure(new RuntimeException("Failed to launch Chrome"))
      }
      promise.future
    }

    def otoroshiPathApiKeyQuotas(clientId: String) =
      s"/api/apikeys/$clientId/quotas"
    val otoroshiPathStats = s"/api/stats"
    def otoroshiPathGroup(groupId: String) = s"/api/groups/[\\w-]*"
    def otoroshiDeleteApikeyPath(clientId: String) = s"/api/apikeys/$clientId"
    def otoroshiUpdateApikeyPath(clientId: String) = s"/api/apikeys/$clientId"
    def otoroshiGetApikeyPath(clientId: String) = s"/api/apikeys/$clientId"

    lazy val wireMockUrl = s"http://$stubHost:$stubPort"
    val stubPort = 11112
    val stubHost = "localhost"

    val teamOwnerId = TeamId("team-owner")
    val teamConsumerId = TeamId("team-consumer")
    val teamAdminId = TeamId("team-admin")

    val daikokuAdminId = UserId("daikoku-admin")
    val tenantAdminId = UserId("tenant-admin")
    val userTeamAdminId = UserId("team-admin")
    val userApiEditorId = UserId("team-api-editor")
    val userTeamUserId = UserId("team-user")

    val teamOwner = Team(
      id = teamOwnerId,
      tenant = Tenant.Default,
      `type` = TeamType.Organization,
      name = s"Owner Team",
      description = s"The team who present api",
      users = Set(
        UserWithPermission(userTeamAdminId, Administrator),
        UserWithPermission(userApiEditorId, ApiEditor),
        UserWithPermission(userTeamUserId, TeamUser),
      ),
    )
    val teamConsumer = Team(
      id = teamConsumerId,
      tenant = Tenant.Default,
      `type` = TeamType.Organization,
      name = s"Consumer Team",
      description = s"The team who consume api",
      users = Set(
        UserWithPermission(userTeamAdminId, Administrator),
        UserWithPermission(userApiEditorId, ApiEditor),
        UserWithPermission(userTeamUserId, TeamUser),
      ),
    )
    val daikokuAdmin = User(
      id = daikokuAdminId,
      tenants = Set(Tenant.Default),
      origins = Set(AuthProvider.Local),
      name = "Bobby daikoku Admin",
      email = "bobby.daikoku.admin@gmail.com",
      lastTenant = None,
      personalToken = Some(IdGenerator.token(32)),
      password = Some(BCrypt.hashpw("password", BCrypt.gensalt())),
      isDaikokuAdmin = true,
      defaultLanguage = None
    )
    val tenantAdmin = User(
      id = tenantAdminId,
      tenants = Set(Tenant.Default),
      origins = Set(AuthProvider.Local),
      name = "Bobby tenant Admin",
      email = "bobby.tenant.admin@gmail.com",
      lastTenant = None,
      personalToken = Some(IdGenerator.token(32)),
      password = Some(BCrypt.hashpw("password", BCrypt.gensalt())),
      isDaikokuAdmin = false,
      defaultLanguage = None
    )
    val userAdmin = User(
      id = userTeamAdminId,
      tenants = Set(Tenant.Default),
      origins = Set(AuthProvider.Local),
      name = "Bobby Admin",
      email = "bobby.admin@gmail.com",
      lastTenant = None,
      personalToken = Some(IdGenerator.token(32)),
      password = Some(BCrypt.hashpw("password", BCrypt.gensalt())),
      defaultLanguage = None
    )
    val userApiEditor = User(
      id = userApiEditorId,
      tenants = Set(Tenant.Default),
      origins = Set(AuthProvider.Local),
      name = "Bobby Editor",
      email = "bobby.editor@gmail.com",
      lastTenant = None,
      personalToken = Some(IdGenerator.token(32)),
      password = Some(BCrypt.hashpw("password", BCrypt.gensalt())),
      defaultLanguage = None
    )
    val user = User(
      id = userTeamUserId,
      tenants = Set(Tenant.Default),
      origins = Set(AuthProvider.Local),
      name = "Bobby",
      email = "bobby@gmail.com",
      lastTenant = None,
      personalToken = Some(IdGenerator.token(32)),
      password = Some(BCrypt.hashpw("password", BCrypt.gensalt())),
      defaultLanguage = None
    )
    val defaultAdminTeam = Team(
      id = TeamId(IdGenerator.token),
      tenant = Tenant.Default,
      `type` = TeamType.Admin,
      name = s"default-admin-team",
      description = s"The admin team for the default tenant",
      avatar = None,
      users = Set(UserWithPermission(tenantAdminId, Administrator)),
      subscriptions = Seq.empty,
      authorizedOtoroshiGroups = Set.empty
    )
    val tenant2AdminTeam = Team(
      id = TeamId(IdGenerator.token),
      tenant = TenantId("tenant2"),
      `type` = TeamType.Admin,
      name = s"default-admin-team-II",
      description = s"The admin team for the tenant II",
      avatar = None,
      users = Set(UserWithPermission(user.id, Administrator)),
      subscriptions = Seq.empty,
      authorizedOtoroshiGroups = Set.empty
    )
    val adminApi = Api(
      id = ApiId(s"admin-api-tenant-${Tenant.Default.value}"),
      tenant = Tenant.Default,
      team = defaultAdminTeam.id,
      name = s"admin-api-tenant-${Tenant.Default.value}",
      lastUpdate = DateTime.now(),
      smallDescription = "admin api",
      description = "admin api",
      currentVersion = Version("1.0.0"),
      published = true,
      documentation = ApiDocumentation(
        id = ApiDocumentationId(BSONObjectID.generate().stringify),
        tenant = Tenant.Default,
        pages = Seq.empty[ApiDocumentationDetailPage],
        lastModificationAt = DateTime.now()
      ),
      swagger = None,
      possibleUsagePlans = Seq(
        Admin(
          id = UsagePlanId("admin"),
          customName = Some("admin"),
          customDescription = None,
          otoroshiTarget = None
        )
      ),
      tags = Set("Administration"),
      visibility = ApiVisibility.AdminOnly,
      defaultUsagePlan = UsagePlanId("1"),
      authorizedTeams = Seq(defaultAdminTeam.id)
    )
    val adminApi2 = Api(
      id = ApiId(s"admin-api-tenant-tenant-II"),
      tenant = TenantId("tenant2"),
      team = tenant2AdminTeam.id,
      name = s"admin-api-tenant-Tenant-II",
      lastUpdate = DateTime.now(),
      smallDescription = "admin api II",
      description = "admin api II",
      currentVersion = Version("1.0.0"),
      published = true,
      documentation = ApiDocumentation(
        id = ApiDocumentationId(BSONObjectID.generate().stringify),
        tenant = Tenant.Default,
        pages = Seq.empty[ApiDocumentationDetailPage],
        lastModificationAt = DateTime.now()
      ),
      swagger = None,
      possibleUsagePlans = Seq(
        Admin(
          id = UsagePlanId("admin"),
          customName = Some("admin"),
          customDescription = None,
          otoroshiTarget = None
        )
      ),
      tags = Set("Administration"),
      visibility = ApiVisibility.AdminOnly,
      defaultUsagePlan = UsagePlanId("1"),
      authorizedTeams = Seq(tenant2AdminTeam.id)
    )
    val tenant = Tenant(
      id = Tenant.Default,
      name = "Test Corp.",
      domain = "localhost",
      style = Some(
        DaikokuStyle(
          title = "Test Corp."
        )),
      mailerSettings = Some(ConsoleMailerSettings()),
      authProvider = AuthProvider.Local,
      authProviderSettings = Json.obj(
        "sessionMaxAge" -> 86400
      ),
      bucketSettings = None,
      otoroshiSettings = Set(
        OtoroshiSettings(
          id = OtoroshiSettingsId("wiremock"),
          url = s"$wireMockUrl",
          host = "otoroshi-api.foo.bar",
          clientSecret = "admin-api-apikey-id"
        ),
        OtoroshiSettings(
          id = OtoroshiSettingsId("default"),
          url = s"http://127.0.0.1:${port}/fakeotoroshi",
          host = "otoroshi-api.foo.bar",
          clientSecret = "admin-api-apikey-id"
        )
      ),
      defaultLanguage = Some("En"),
      adminApi = adminApi.id,
      adminSubscriptions = Seq.empty,
      contact = "contact@test-corp.foo.bar"
    )
    val tenant2 = Tenant(
      id = TenantId("tenant2"),
      name = "Test Corp. II",
      domain = "localhost.tenant2",
      style = Some(
        DaikokuStyle(
          title = "Test Corp. II"
        )),
      mailerSettings = Some(ConsoleMailerSettings()),
      authProvider = AuthProvider.Local,
      authProviderSettings = Json.obj(
        "sessionMaxAge" -> 86400
      ),
      bucketSettings = None,
      otoroshiSettings = Set(
        OtoroshiSettings(
          id = OtoroshiSettingsId("wiremock"),
          url = s"$wireMockUrl",
          host = "otoroshi-api.foo.bar",
          clientSecret = "admin-api-apikey-id"
        ),
        OtoroshiSettings(
          id = OtoroshiSettingsId("default"),
          url = s"http://127.0.0.1:${port}/fakeotoroshi",
          host = "otoroshi-api.foo.bar",
          clientSecret = "admin-api-apikey-id"
        )
      ),
      defaultLanguage = Some("fr"),
      adminApi = adminApi2.id,
      adminSubscriptions = Seq.empty,
      contact = "contactII@test-corp.foo.bar"
    )

    def generateApi(version: String = "0",
                    tenant: TenantId,
                    teamId: TeamId,
                    docIds: Seq[ApiDocumentationDetailPage]) = Api(
      id = ApiId(s"api-${tenant.value}-$version"),
      tenant = tenant,
      team = teamId,
      lastUpdate = DateTime.now(),
      name = s"Api - V$version",
      smallDescription = "A small API to play with Daikoku exposition",
      tags = Set("api", "rest", "scala", "play"),
      description =
        """# My Awesome API
            |
            |Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc tincidunt massa id eros porttitor, a aliquam tortor auctor. Duis id bibendum turpis. Donec in pellentesque justo. Nam nec diam dignissim, tincidunt libero in, vehicula erat. Donec bibendum posuere nunc vitae pharetra. Sed tincidunt non diam sit amet maximus. Vivamus vitae tellus mattis, bibendum quam hendrerit, euismod orci. Integer egestas id dolor vitae convallis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Sed eget tortor eu sapien malesuada malesuada. Donec ut mi ornare, imperdiet dui vel, suscipit arcu. Duis vitae felis lectus. Donec volutpat dictum magna, non venenatis dui rutrum eu. In neque purus, condimentum id euismod sit amet, dapibus at nulla. Mauris auctor quam eu lacus aliquam dapibus.
            |
            |Nullam augue risus, aliquam eu tortor eget, congue finibus turpis. Sed elementum leo a viverra consequat. Pellentesque quis enim eget nulla scelerisque aliquam vel vitae purus. Donec hendrerit, ligula at lobortis volutpat, est arcu fringilla turpis, sit amet varius quam justo nec velit. Suspendisse potenti. Praesent bibendum lobortis auctor. Morbi pellentesque, elit sit amet pellentesque efficitur, nunc purus consequat arcu, id posuere ex lacus nec magna. Pellentesque id porta ex, vitae egestas erat. Ut dignissim nisi vel ex tincidunt, at ornare nisi pretium. Phasellus euismod pretium sagittis. Nunc suscipit luctus ante, quis finibus mauris luctus at. Morbi id erat porta, tincidunt felis in, convallis mi. Aliquam erat volutpat. Suspendisse iaculis elementum enim at consectetur. Donec consequat dapibus dictum. Integer viverra bibendum dolor et hendrerit.
            |
            |```js
            |class HelloMessage extends React.Component {
            |  render() {
            |    return (
            |      <div>
            |        Hello {this.props.name}
            |      </div>
            |    );
            |  }
            |}
            |
            |ReactDOM.render(
            |  <HelloMessage name="Taylor" />,
            |  mountNode
            |);
            |```
            |
            |Donec iaculis, ligula et malesuada pharetra, ex magna lacinia purus, quis feugiat ante ante faucibus mi. Sed ut nulla mattis ligula bibendum commodo. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Duis sollicitudin maximus tempor. Sed a sagittis turpis. Aenean at elit pretium, porta neque ac, consectetur nisi. Pellentesque et justo ut nisl mollis tristique. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Vivamus lobortis tincidunt eros, at dapibus turpis tristique non. Proin rhoncus ut lacus nec pharetra. Nullam sit amet neque non nulla faucibus bibendum ac nec dui. Etiam nec nisi hendrerit, volutpat nibh nec, elementum diam. Integer vel lacinia nunc.
            |
            |Proin euismod metus ac consequat vestibulum. Nulla auctor euismod nunc, lacinia auctor augue posuere quis. Aenean nec arcu tellus. Sed quis felis dignissim, scelerisque nisi sed, volutpat arcu. Praesent eget risus suscipit, bibendum ante nec, dignissim libero. Sed eget dui vel lacus fringilla congue. Nulla vehicula tortor in venenatis dapibus. Nunc sed ante justo. Praesent eget ipsum tellus.
            |
            |Fusce ultricies at nisl sed faucibus. In sollicitudin libero eu augue lacinia aliquet. Nunc et eleifend augue. Donec eleifend nisi a iaculis tincidunt. Aenean a enim in nunc tincidunt euismod. Integer pellentesque tortor at ante tempus hendrerit. Fusce pretium, sapien ac sodales aliquam, diam quam placerat turpis, vitae tincidunt lacus massa finibus ante. Ut a ultrices odio. Sed pretium porttitor blandit. Sed ut ipsum a ligula pharetra lacinia. Donec laoreet purus mauris, rutrum hendrerit orci finibus at. Nullam aliquet augue ut tincidunt placerat. Proin tempor leo id orci tristique, at gravida metus pharetra.
      """.stripMargin,
      currentVersion = Version("1.1.0"),
      supportedVersions = Set(Version("1.0.0")),
      published = true,
      visibility = ApiVisibility.Public,
      documentation = ApiDocumentation(
        id = ApiDocumentationId(BSONObjectID.generate().stringify),
        tenant = tenant,
        pages = docIds,
        lastModificationAt = DateTime.now(),
      ),
      swagger = Some(
        SwaggerAccess(url = "/assets/swaggers/petstore.json", content = None)),
      possibleUsagePlans = Seq(
        FreeWithoutQuotas(
          id = UsagePlanId("1"),
          billingDuration = BillingDuration(1, BillingTimeUnit.Month),
          currency = Currency("EUR"),
          customName = None,
          customDescription = None,
          otoroshiTarget = Some(
            OtoroshiTarget(OtoroshiSettingsId("default"),
                           Some(
                             AuthorizedEntities(
                               groups = Set(OtoroshiServiceGroupId("12345")))))
          ),
          allowMultipleKeys = Some(false),
          subscriptionProcess = SubscriptionProcess.Automatic,
          integrationProcess = IntegrationProcess.ApiKey,
          autoRotation = Some(false)
        ),
        FreeWithQuotas(
          UsagePlanId("2"),
          2000,
          2000,
          2000,
          billingDuration = BillingDuration(1, BillingTimeUnit.Month),
          currency = Currency("EUR"),
          customName = None,
          customDescription = None,
          otoroshiTarget = Some(
            OtoroshiTarget(OtoroshiSettingsId("default"),
                           Some(
                             AuthorizedEntities(
                               groups = Set(OtoroshiServiceGroupId("12345")))))
          ),
          allowMultipleKeys = Some(false),
          subscriptionProcess = SubscriptionProcess.Automatic,
          integrationProcess = IntegrationProcess.ApiKey,
          autoRotation = Some(false)
        ),
        QuotasWithLimits(
          UsagePlanId("3"),
          10000,
          10000,
          10000,
          BigDecimal(10.0),
          billingDuration = BillingDuration(1, BillingTimeUnit.Month),
          trialPeriod = None,
          currency = Currency("EUR"),
          customName = None,
          customDescription = None,
          otoroshiTarget = Some(
            OtoroshiTarget(OtoroshiSettingsId("default"),
                           Some(
                             AuthorizedEntities(
                               groups = Set(OtoroshiServiceGroupId("12345")))))
          ),
          allowMultipleKeys = Some(false),
          subscriptionProcess = SubscriptionProcess.Automatic,
          integrationProcess = IntegrationProcess.ApiKey,
          autoRotation = Some(false)
        ),
        QuotasWithoutLimits(
          UsagePlanId("4"),
          10000,
          10000,
          10000,
          BigDecimal(0.015),
          BigDecimal(10.0),
          billingDuration = BillingDuration(1, BillingTimeUnit.Month),
          trialPeriod = None,
          currency = Currency("EUR"),
          customName = None,
          customDescription = None,
          otoroshiTarget = Some(
            OtoroshiTarget(OtoroshiSettingsId("default"),
                           Some(
                             AuthorizedEntities(
                               groups = Set(OtoroshiServiceGroupId("12345")))))
          ),
          allowMultipleKeys = Some(true),
          subscriptionProcess = SubscriptionProcess.Automatic,
          integrationProcess = IntegrationProcess.ApiKey,
          autoRotation = Some(false)
        ),
        PayPerUse(
          UsagePlanId("5"),
          BigDecimal(10.0),
          BigDecimal(0.02),
          billingDuration = BillingDuration(1, BillingTimeUnit.Month),
          trialPeriod = None,
          currency = Currency("EUR"),
          customName = None,
          customDescription = None,
          otoroshiTarget = Some(
            OtoroshiTarget(OtoroshiSettingsId("default"),
                           Some(
                             AuthorizedEntities(
                               groups = Set(OtoroshiServiceGroupId("12345")))))
          ),
          allowMultipleKeys = Some(false),
          subscriptionProcess = SubscriptionProcess.Automatic,
          integrationProcess = IntegrationProcess.ApiKey,
          autoRotation = Some(false)
        )
      ),
      defaultUsagePlan = UsagePlanId("1")
    )

    val defaultCmsPage: CmsPage = CmsPage(
      id = CmsPageId(BSONObjectID.generate().stringify),
      tenant = tenant.id,
      visible = true,
      authenticated = false,
      name = "foo",
      forwardRef = None,
      tags = List(),
      metadata = Map(),
      draft = "<h1>draft content</h1>",
      contentType = "text/html",
      body = "<h1>production content</h1>",
      path = Some("/" + BSONObjectID.generate().stringify)
    )

    val defaultApi: Api =
      generateApi("default", tenant.id, teamOwnerId, Seq.empty)
  }
}
