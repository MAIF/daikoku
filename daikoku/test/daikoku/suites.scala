package fr.maif.tests

import cats.implicits.catsSyntaxOptionId
import com.auth0.jwt.algorithms.Algorithm
import com.themillhousegroup.scoup.Scoup
import fr.maif.domain.*
import fr.maif.domain.TeamPermission.*
import fr.maif.domain.UsagePlan.*
import fr.maif.login.AuthProvider
import fr.maif.modules.DaikokuComponentsInstances
import fr.maif.utils.IdGenerator
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.pattern.after
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.{Keep, Sink, Source}
import org.joda.time.DateTime
import org.jsoup.nodes.Document
import org.mindrot.jbcrypt.BCrypt
import org.scalatest.*
import org.scalatest.concurrent.ScalaFutures
import org.scalatestplus.play.components.OneServerPerSuiteWithComponents
import play.api.libs.json.*
import play.api.libs.ws.WSBodyWritables.writeableOf_JsValue
import play.api.libs.ws.{DefaultWSCookie, WSResponse}
import play.api.{Application, BuiltInComponents, Logger}
import fr.maif.services.CmsPage

import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, StandardCopyOption}
import java.util.concurrent.TimeUnit
import scala.concurrent.duration.*
import scala.concurrent.impl.Promise
import scala.concurrent.{Await, ExecutionContext, Future, Promise}
import scala.sys.process.ProcessLogger
import scala.util.{Failure, Success, Try}

case class ApiWithPlans(api: Api, plans: Seq[UsagePlan])

object utils {
//  trait OneServerPerSuiteWithMyComponents
//      extends OneServerPerSuiteWithComponents
//      with ScalaFutures {
//    this: TestSuite =>
//
//    lazy val daikokuComponents = {
//      val components =
//        new DaikokuComponentsInstances(context)
//      println(s"Using env ${components.env}") // WARNING: important to keep, needed to switch env between suites
//      components
//    }
//
//    override def components: BuiltInComponents = daikokuComponents
//
//    override def fakeApplication(): Application = {
//      daikokuComponents.application
//    }
//  }

  trait DaikokuSpecHelper
      extends TestSuiteMixin
      with OneServerPerSuiteWithComponents
      with ScalaFutures { suite: TestSuite =>

    lazy val daikokuComponents = {
      val components =
        new DaikokuComponentsInstances(context)
      println(
        s"Using env ${components.env}"
      ) // WARNING: important to keep, needed to switch env between suites
      components
    }

    override def components: BuiltInComponents = daikokuComponents

    override def fakeApplication(): Application = {
      daikokuComponents.application
    }

    abstract override def run(testName: Option[String], args: Args): Status = {
      lazy val run = super.run(testName, args)

      def runIfDatabaseAvailable(timeout: FiniteDuration): Status = {

        val triedLong = Try(
          Await.result(
            daikokuComponents.env.dataStore.tenantRepo.count(Json.obj()),
            1.second
          )
        )

        if (triedLong.isSuccess) {
          run
        } else if (timeout < 1.minute) {
          logger.info(
            s"database is no longer avalaible, waiting $timeout before retry"
          )
          await(timeout)
          val newDuration = timeout * 2
          runIfDatabaseAvailable(newDuration)
        } else {
          FailedStatus
        }
      }

      runIfDatabaseAvailable(1.second)
    }

    implicit val ec: ExecutionContext =
      daikokuComponents.env.defaultExecutionContext
    implicit val as: ActorSystem = daikokuComponents.env.defaultActorSystem
    implicit val mat: Materializer = daikokuComponents.env.defaultMaterializer

    val logger: Logger = Logger.apply("daikoku-spec-helper")

    def await(duration: FiniteDuration): Unit = {
      val p = Promise[Unit]()
      daikokuComponents.env.defaultActorSystem.scheduler
        .scheduleOnce(duration) {
          p.trySuccess(())
        }
      Await.result(p.future, duration + 1.second)
    }

    def awaitF(duration: FiniteDuration): Future[Unit] = {
      val p = Promise[Unit]()
      daikokuComponents.actorSystem.scheduler.scheduleOnce(duration) {
        p.trySuccess(())
      }
      p.future
    }

    def flushBlocking(): Unit = flush().futureValue

    def flush(): Future[Unit] = {
      logger.info("[DaikokuSpecHelper] :: flush database beginning")
      for {
        _ <- daikokuComponents.env.dataStore.tenantRepo.deleteAll()
        _ <- daikokuComponents.env.dataStore.passwordResetRepo.deleteAll()
        _ <- daikokuComponents.env.dataStore.accountCreationRepo.deleteAll()
        _ <- daikokuComponents.env.dataStore.userRepo.deleteAll()
        _ <- daikokuComponents.env.dataStore.teamRepo.forAllTenant().deleteAll()
        _ <- daikokuComponents.env.dataStore.apiRepo.forAllTenant().deleteAll()
        _ <-
          daikokuComponents.env.dataStore.apiIssueRepo
            .forAllTenant()
            .deleteAll()
        _ <-
          daikokuComponents.env.dataStore.apiPostRepo
            .forAllTenant()
            .deleteAll()
        _ <-
          daikokuComponents.env.dataStore.apiSubscriptionRepo
            .forAllTenant()
            .deleteAll()
        _ <-
          daikokuComponents.env.dataStore.apiDocumentationPageRepo
            .forAllTenant()
            .deleteAll()
        _ <-
          daikokuComponents.env.dataStore.notificationRepo
            .forAllTenant()
            .deleteAll()
        _ <-
          daikokuComponents.env.dataStore.consumptionRepo
            .forAllTenant()
            .deleteAll()
        _ <-
          daikokuComponents.env.dataStore.auditTrailRepo
            .forAllTenant()
            .deleteAll()
        _ <- daikokuComponents.env.dataStore.userSessionRepo.deleteAll()
        _ <- daikokuComponents.env.dataStore.cmsRepo.forAllTenant().deleteAll()
        _ <-
          daikokuComponents.env.dataStore.messageRepo
            .forAllTenant()
            .deleteAll()
        _ <-
          daikokuComponents.env.dataStore.stepValidatorRepo
            .forAllTenant()
            .deleteAll()
        _ <-
          daikokuComponents.env.dataStore.subscriptionDemandRepo
            .forAllTenant()
            .deleteAll()
        _ <-
          daikokuComponents.env.dataStore.operationRepo
            .forAllTenant()
            .deleteAll()
        _ <-
          daikokuComponents.env.dataStore.usagePlanRepo
            .forAllTenant()
            .deleteAll()
        _ <-
          daikokuComponents.env.dataStore.translationRepo
            .forAllTenant()
            .deleteAll()
      } yield (logger.info("[DaikokuSpecHelper] :: flush database finished"))
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
        operations: Seq[Operation] = Seq.empty,
        subscriptionDemands: Seq[SubscriptionDemand] = Seq.empty,
        usagePlans: Seq[UsagePlan] = Seq.empty,
        translations: Seq[Translation] = Seq.empty
    ) = {
      Await.result(
        setupEnv(
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
          operations,
          subscriptionDemands,
          usagePlans,
          translations
        ),
        5.second
      )
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
        operations: Seq[Operation] = Seq.empty,
        subscriptionDemands: Seq[SubscriptionDemand] = Seq.empty,
        usagePlans: Seq[UsagePlan] = Seq.empty,
        translations: Seq[Translation] = Seq.empty
    ): Future[Unit] = {
      for {
//        _ <- waitForDaikokuSetup()
        _ <- flush()
        _ <- daikokuComponents.env.dataStore.userSessionRepo.deleteAll()
        log = logger.info("[DaikokuSpecHelper] :: insert tenant beginning")
        _ <- Source(tenants.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.tenantRepo
              .save(i)(daikokuComponents.env.defaultExecutionContext)
          )
          .toMat(Sink.ignore)(Keep.right)
          .run()
        log = logger.info("[DaikokuSpecHelper] :: insert tenant finished")
        _ <- Source(users.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.userRepo
              .save(i)(daikokuComponents.env.defaultExecutionContext)
          )
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(teams.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.teamRepo
              .forAllTenant()
              .save(i)(daikokuComponents.env.defaultExecutionContext)
          )
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(usagePlans.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.usagePlanRepo
              .forAllTenant()
              .save(i)(daikokuComponents.env.defaultExecutionContext)
          )
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(apis.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.apiRepo
              .forAllTenant()
              .save(i)(daikokuComponents.env.defaultExecutionContext)
          )
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(subscriptions.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.apiSubscriptionRepo
              .forAllTenant()
              .save(i)(daikokuComponents.env.defaultExecutionContext)
          )
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(notifications.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.notificationRepo
              .forAllTenant()
              .save(i)(daikokuComponents.env.defaultExecutionContext)
          )
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(consumptions.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.consumptionRepo
              .forAllTenant()
              .save(i)(daikokuComponents.env.defaultExecutionContext)
          )
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(sessions.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.userSessionRepo
              .save(i)(daikokuComponents.env.defaultExecutionContext)
          )
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(resets.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.passwordResetRepo
              .save(i)(daikokuComponents.env.defaultExecutionContext)
          )
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(creations.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.accountCreationRepo
              .save(i)(daikokuComponents.env.defaultExecutionContext)
          )
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(messages.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.messageRepo
              .forAllTenant()
              .save(i)(daikokuComponents.env.defaultExecutionContext)
          )
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(issues.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.apiIssueRepo
              .forAllTenant()
              .save(i)(daikokuComponents.env.defaultExecutionContext)
          )
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(posts.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.apiPostRepo
              .forAllTenant()
              .save(i)(daikokuComponents.env.defaultExecutionContext)
          )
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(cmsPages.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.cmsRepo
              .forAllTenant()
              .save(i)(daikokuComponents.env.defaultExecutionContext)
          )
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(pages.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.apiDocumentationPageRepo
              .forAllTenant()
              .save(i)(daikokuComponents.env.defaultExecutionContext)
          )
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(operations.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.operationRepo
              .forAllTenant()
              .save(i)(daikokuComponents.env.defaultExecutionContext)
          )
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(subscriptionDemands.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.subscriptionDemandRepo
              .forAllTenant()
              .save(i)(daikokuComponents.env.defaultExecutionContext)
          )
          .toMat(Sink.ignore)(Keep.right)
          .run()
        _ <- Source(translations.toList)
          .mapAsync(1)(i =>
            daikokuComponents.env.dataStore.translationRepo
              .forAllTenant()
              .save(i)(daikokuComponents.env.defaultExecutionContext)
          )
          .toMat(Sink.ignore)(Keep.right)
          .run()
      } yield ()
    }

    def waitForDaikokuSetup(): Future[Unit] = {
      val maxRetries = 10
      val retryDelay = 100.millis

      def checkStatus(attempt: Int): Future[Unit] = {
        httpJsonCallWithoutSession(path = "/status")(tenant)
          .flatMap { response =>
            (response.json \ "status").asOpt[String] match {
              case Some("ready") =>
                Future.successful(logger.info("Daikoku is ready !"))

              case _ if attempt < maxRetries =>
                logger.info(
                  s"Daikoku is no ready (attempt $attempt/$maxRetries), retry in ${retryDelay.toMillis}ms..."
                )
                Future.unit
                  .flatMap(_ =>
                    scala.concurrent.Future(
                      Thread.sleep(retryDelay.toMillis)
                    ) // Attente entre les appels
                  )
                  .flatMap(_ => checkStatus(attempt + 1))

              case _ =>
                Future.failed(
                  new RuntimeException(
                    "Timeout: Daikoku ne s'est pas initialisé à temps"
                  )
                )
            }
          }
      }
      checkStatus(1)
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
          )
        )
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
          )
        )
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
                    id = TeamId(IdGenerator.token(32)),
                    tenant = on.id,
                    `type` = TeamType.Personal,
                    name = user.name,
                    description = s"The personal team of ${user.name}",
                    users = Set(UserWithPermission(user.id, Administrator)),
                    authorizedOtoroshiEntities = None,
                    contact = user.email
                  )
                case Some(team) => team
              }
              .flatMap(t =>
                daikokuComponents.env.dataStore.teamRepo
                  .forTenant(on)
                  .save(t)
                  .map(_ => t)
              )
              .flatMap { _ =>
                val session = UserSession(
                  id = DatastoreId(IdGenerator.token(32)),
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
                  .map(_ =>
                    daikokuComponents.env.dataStore.userRepo
                      .save(user.copy(lastTenant = on.id.some))
                  )
                  .map { _ =>
                    session
                  }
              }
        }
    }

    def httpJsonCallBlocking(
        path: String,
        method: String = "GET",
        headers: Map[String, String] = Map.empty,
        body: Option[JsValue] = None,
        baseUrl: String = "http://127.0.0.1",
        port: Int = port
    )(implicit tenant: Tenant, session: UserSession): WSResponse =
      Await.result(
        httpJsonCall(
          path,
          method,
          headers,
          body,
          baseUrl,
          port
        )(tenant, session),
        5.seconds
      )

    def httpJsonCall(
        _path: String,
        method: String = "GET",
        headers: Map[String, String] = Map.empty,
        body: Option[JsValue] = None,
        baseUrl: String = "http://127.0.0.1",
        port: Int = port
    )(implicit tenant: Tenant, session: UserSession): Future[WSResponse] = {
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
        .withCookies(
          DefaultWSCookie(
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
          )
        )
        .execute()
    }

    def httpJsonCallWithoutSessionBlocking(
        path: String,
        method: String = "GET",
        headers: Map[String, String] = Map.empty,
        body: Option[JsValue] = None,
        baseUrl: String = "http://127.0.0.1",
        port: Int = port,
        hostHeader: String = tenant.domain
    )(implicit tenant: Tenant): WSResponse =
      Await.result(
        httpJsonCallWithoutSession(
          path,
          method,
          headers,
          body,
          baseUrl,
          port,
          hostHeader
        )(tenant),
        5.seconds
      )

    def httpJsonCallWithoutSession(
        path: String,
        method: String = "GET",
        headers: Map[String, String] = Map.empty,
        body: Option[JsValue] = None,
        baseUrl: String = "http://127.0.0.1",
        port: Int = port,
        hostHeader: String = tenant.domain
    )(implicit tenant: Tenant): Future[WSResponse] = {
      val builder = daikokuComponents.env.wsClient
        .url(s"$baseUrl:$port$path")
        .withHttpHeaders((headers ++ Map("Host" -> hostHeader)).toSeq: _*)
        .withFollowRedirects(false)
        .withRequestTimeout(10.seconds)
        .withMethod(method)
      body.map(b => builder.withBody(b)).getOrElse(builder).execute()
    }

    private def sign(
        algorithm: Algorithm,
        headerJson: JsObject,
        payloadJson: JsObject
    ): String = {
      val header: String = org.apache.commons.codec.binary.Base64
        .encodeBase64URLSafeString(Json.toBytes(headerJson))
      val payload: String = org.apache.commons.codec.binary.Base64
        .encodeBase64URLSafeString(Json.toBytes(payloadJson))
      val signatureBytes: Array[Byte] = algorithm.sign(
        header.getBytes(StandardCharsets.UTF_8),
        payload.getBytes(StandardCharsets.UTF_8)
      )
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

    def openPageBlocking(
        path: String
    )(implicit tenant: Tenant, session: UserSession): Document =
      openPage(path)(tenant, session).futureValue

    def openPage(
        path: String
    )(implicit tenant: Tenant, session: UserSession): Future[Document] =
      actionOnPage(path, Seq("--dump-dom"))(tenant, session).map(str =>
        Scoup.parseHTML(str)
      )

    def screenshotPageBlocking(
        path: String
    )(implicit tenant: Tenant, session: UserSession): String =
      screenshotPage(path)(tenant, session).futureValue

    def screenshotPage(
        path: String
    )(implicit tenant: Tenant, session: UserSession): Future[String] =
      actionOnPage(path, Seq("--screenshot", "--window-size=1920,1080"))(
        tenant,
        session
      ).map { res =>
        Try(Files.createDirectory(new File("./target/screenshots").toPath))
        Files.move(
          new File("./screenshot.png").toPath,
          new File(
            s"./target/screenshots/screenshot-${DateTime.now().toString("yyyy-MM-dd-HH-mm-ss-SSS")}.png"
          ).toPath,
          StandardCopyOption.REPLACE_EXISTING
        )
        res
      }

    def actionOnPage(path: String, action: Seq[String])(implicit
        tenant: Tenant,
        session: UserSession
    ): Future[String] = {
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
      val promise = Promise[String]()
      execs.find { exec =>
        var stdout = Seq.empty[String]
        val log = ProcessLogger { str =>
          stdout = stdout :+ str
        }
        try {
          val p = sys.process.Process
            .apply(
              exec,
              Seq("--headless", "--disable-gpu") ++ action ++ Seq(url)
            )
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

    val parentRouteId = "route_d74ea8b27-b8be-4177-82d9-c50722416c50"
    val childRouteId = "route_8ce030cbd-6c07-43d4-9c61-4a330ae0975d"
    val otherRouteId = "route_d74ea8b27-b8be-4177-82d9-c50722416c51"
    val serviceGroupDev =
      "group_dev_574c57dd-ab79-48a1-a810-22ba214b25f5" // parent, child, other routes
    val serviceGroupDefault = "default" // other routes
    val serviceGroupAdmin = "admin-api-group"
    val parent2ApkAsJson = Json.obj(
      "_loc" -> Json.obj(
        "tenant" -> "default",
        "teams" -> Json.arr("default")
      ),
      "clientId" -> "fu283imnfv8jdt4e",
      "clientSecret" -> "yaodpdfu283imnfv8jdt4eivaow6ipvh6ta9dwvd3tor9vf9wovxs6i5a2v7ep6m",
      "clientName" -> "daikoku_test_parent_key_2_childs",
      "description" -> "",
      "authorizedGroup" -> JsNull,
      "authorizedEntities" -> Json.arr(
        s"route_$parentRouteId",
        s"route_$childRouteId",
        s"route_$otherRouteId"
      ),
      "authorizations" -> Json.arr(
        Json.obj(
          "kind" -> "route",
          "id" -> parentRouteId
        ),
        Json.obj(
          "kind" -> "route",
          "id" -> childRouteId
        ),
        Json.obj(
          "kind" -> "route",
          "id" -> otherRouteId
        )
      ),
      "enabled" -> true,
      "readOnly" -> false,
      "allowClientIdOnly" -> false,
      "throttlingQuota" -> 10000000,
      "dailyQuota" -> 10000000,
      "monthlyQuota" -> 10000000,
      "constrainedServicesOnly" -> false,
      "restrictions" -> Json.obj(
        "enabled" -> false,
        "allowLast" -> true,
        "allowed" -> Json.arr(),
        "forbidden" -> Json.arr(),
        "notFound" -> Json.arr()
      ),
      "rotation" -> Json.obj(
        "enabled" -> false,
        "rotationEvery" -> 744,
        "gracePeriod" -> 168,
        "nextSecret" -> JsNull
      ),
      "validUntil" -> JsNull,
      "tags" -> Json.arr(),
      "metadata" -> Json.obj(
        "daikoku__metadata" -> "| foo",
        "foo" -> "bar"
      )
    )
    val parentApkAsJson = Json.obj(
      "_loc" -> Json.obj(
        "tenant" -> "default",
        "teams" -> Json.arr("default")
      ),
      "clientId" -> "5w24yl2ly3dlnn92",
      "clientSecret" -> "8iwm9fhbns0rmybnyul5evq9l1o4dxza0rh7rt4flay69jolw3okbz1owfl6w2db",
      "clientName" -> "daikoku_test_parent_key",
      "description" -> "",
      "authorizedGroup" -> JsNull,
      "authorizedEntities" -> Json.arr(
        s"route_$parentRouteId",
        s"route_$childRouteId"
      ),
      "authorizations" -> Json.arr(
        Json.obj(
          "kind" -> "route",
          "id" -> parentRouteId
        ),
        Json.obj(
          "kind" -> "route",
          "id" -> childRouteId
        )
      ),
      "enabled" -> true,
      "readOnly" -> false,
      "allowClientIdOnly" -> false,
      "throttlingQuota" -> 10000000,
      "dailyQuota" -> 10000000,
      "monthlyQuota" -> 10000000,
      "constrainedServicesOnly" -> false,
      "restrictions" -> Json.obj(
        "enabled" -> false,
        "allowLast" -> true,
        "allowed" -> Json.arr(),
        "forbidden" -> Json.arr(),
        "notFound" -> Json.arr()
      ),
      "rotation" -> Json.obj(
        "enabled" -> false,
        "rotationEvery" -> 744,
        "gracePeriod" -> 168,
        "nextSecret" -> JsNull
      ),
      "validUntil" -> JsNull,
      "tags" -> Json.arr(),
      "metadata" -> Json.obj()
    )

    def cleanOtoroshiServer(
        otoroshiPort: Int,
        apks: Seq[JsValue] = Seq(parentApkAsJson, parent2ApkAsJson)
    ) = {
      val apikeys = daikokuComponents.env.wsClient
        .url(s"http://otoroshi-api.oto.tools:$otoroshiPort/api/apikeys")
        .withHttpHeaders(
          Map(
            "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
            "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
            "Host" -> "otoroshi-api.oto.tools"
          ).toSeq: _*
        )
        .withFollowRedirects(false)
        .withRequestTimeout(10.seconds)
        .withMethod("GET")
        .execute()
        .map(_.json.as[JsArray].value.toSeq)

      def fetchApiKeysWithRetry(
          maxRetries: Int = 3,
          delay: FiniteDuration = 1.second
      ): Future[Seq[JsValue]] = {
        def fetchOnce(): Future[JsValue] = {
          daikokuComponents.env.wsClient
            .url(s"http://otoroshi-api.oto.tools:$otoroshiPort/api/apikeys")
            .withHttpHeaders(
              "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
              "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
              "Host" -> "otoroshi-api.oto.tools"
            )
            .withFollowRedirects(false)
            .withRequestTimeout(10.seconds)
            .get()
            .map(_.json)
        }

        def loop(attempt: Int): Future[Seq[JsValue]] = {
          fetchOnce().flatMap {
            case keys: JsArray =>
              Future.successful(keys.value.toSeq)
            case obj: JsObject
                if (obj \ "error").isDefined && attempt < maxRetries =>
              logger.warn(
                s"[$attempt/$maxRetries] Failed to fetch Otoroshi API keys: ${(obj \ "error").as[String]}"
              )
              after(delay * attempt)(loop(attempt + 1))
            case other if attempt < maxRetries =>
              logger.error(
                s"[$attempt/$maxRetries] Failed to fetch Otoroshi API keys after $maxRetries attempts: ${Json
                    .prettyPrint(other)}"
              )
              Future.successful(
                Seq.empty
              ) // on renvoie une liste vide pour ne pas faire planter la suite
            case other =>
              logger.error(
                s"Failed to fetch Otoroshi API keys after $maxRetries attempts: ${Json.prettyPrint(other)}"
              )
              Future.successful(
                Seq.empty
              ) // on renvoie une liste vide pour ne pas faire planter la suite
          }
        }

        loop(1)
      }

      for {
        _ <-
          Source
            .futureSource(fetchApiKeysWithRetry().map(Source(_)))
            .mapAsync(5)(apk => {
              val clientId = (apk \ "clientId").as[String]
              if (clientId == "admin-api-apikey-id") {
                FastFuture.successful(true)
              } else {
                logger.info(s"[init otoroshi] :: delete $clientId")
                daikokuComponents.env.wsClient
                  .url(
                    s"http://otoroshi-api.oto.tools:$otoroshiPort/api/apikeys/${(apk \ "clientId").as[String]}"
                  )
                  .withHttpHeaders(
                    Map(
                      "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
                      "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
                      "Host" -> "otoroshi-api.oto.tools"
                    ).toSeq: _*
                  )
                  .withFollowRedirects(false)
                  .withRequestTimeout(10.seconds)
                  .withMethod("DELETE")
                  .execute()
                  .map(_ => true)
              }
            })
            .runWith(Sink.ignore)
        _ <- Future.sequence(
          apks.map(apk =>
            daikokuComponents.env.wsClient
              .url(s"http://otoroshi-api.oto.tools:$otoroshiPort/api/apikeys")
              .withHttpHeaders(
                Map(
                  "Otoroshi-Client-Id" -> otoroshiAdminApiKey.clientId,
                  "Otoroshi-Client-Secret" -> otoroshiAdminApiKey.clientSecret,
                  "Host" -> "otoroshi-api.oto.tools"
                ).toSeq: _*
              )
              .withFollowRedirects(false)
              .withRequestTimeout(10.seconds)
              .withMethod("POST")
              .withBody(apk)
              .execute()
              .map(_ => true)
          )
        )
      } yield true

    }

    def otoroshiPathApiKeyQuotas(clientId: String) =
      s"/api/apikeys/$clientId/quotas"
    val otoroshiPathStats = s"/api/stats"
    val otoroshiPathGroup = s"/api/groups/?[\\w-]*"
    val otoroshiPathServices = s"/api/services/?[\\w-]*"
    val otoroshiPathRoutes = s"/api/routes/?[\\w-]*"
    def otoroshiDeleteApikeyPath(clientId: String) = s"/api/apikeys/$clientId"
    def otoroshiUpdateApikeyPath(clientId: String) = s"/api/apikeys/$clientId"
    def otoroshiGetApikeyPath(clientId: String) = s"/api/apikeys/$clientId"

    lazy val wireMockUrl = s"http://$stubHost:$stubPort"
    val stubPort = 11112
    val stubHost = "localhost"
    lazy val containerizedOtoroshiUrl = "http://ototoshi.oto.tools:8080"

    val otoroshiAdminApiKey = OtoroshiApiKey(
      clientName = "Otoroshi Backoffice ApiKey",
      clientId = "admin-api-apikey-id",
      clientSecret = "admin-api-apikey-secret"
    )
    val parentApiKey = OtoroshiApiKey(
      clientName = "daikoku_test_parent_key",
      clientId = "5w24yl2ly3dlnn92",
      clientSecret =
        "8iwm9fhbns0rmybnyul5evq9l1o4dxza0rh7rt4flay69jolw3okbz1owfl6w2db"
    )
    // apikey with child_route & other_route (with parent) as authorized entities & {"foo": "bar"} as metadata
    val parentApiKeyWith2childs = OtoroshiApiKey(
      clientName = "daikoku_test_parent_key_2_childs",
      clientId = "fu283imnfv8jdt4e",
      clientSecret =
        "yaodpdfu283imnfv8jdt4eivaow6ipvh6ta9dwvd3tor9vf9wovxs6i5a2v7ep6m"
    )

    val teamOwnerId = TeamId("team-owner")
    val teamConsumerId = TeamId("team-consumer")
    val teamAdminId = TeamId("team-admin")

    val daikokuAdminId = UserId("daikoku-admin")
    val tenantAdminId = UserId("tenant-admin")
    val userTeamAdminId = UserId("team-admin")
    val userApiEditorId = UserId("team-api-editor")
    val userTeamUserId = UserId("team-user")

    val wiremockedOtoroshi = OtoroshiSettingsId("wiremock")
    val containerizedOtoroshi = OtoroshiSettingsId("test-container")

    val teamOwner = Team(
      id = teamOwnerId,
      tenant = Tenant.Default,
      `type` = TeamType.Organization,
      name = s"Owner Team",
      description = s"The team who present api",
      users = Set(
        UserWithPermission(userTeamAdminId, Administrator),
        UserWithPermission(userApiEditorId, ApiEditor),
        UserWithPermission(userTeamUserId, TeamUser)
      ),
      contact = "owner@foo.test"
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
        UserWithPermission(userTeamUserId, TeamUser)
      ),
      contact = "consumer@foo.test"
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
      authorizedOtoroshiEntities = None,
      contact = "admin@daikoku.io"
    )
    val tenant2AdminTeam = Team(
      id = TeamId(IdGenerator.token),
      tenant = TenantId("tenant2"),
      `type` = TeamType.Admin,
      name = s"default-admin-team-II",
      description = s"The admin team for the tenant II",
      avatar = None,
      users = Set(UserWithPermission(user.id, Administrator)),
      authorizedOtoroshiEntities = None,
      contact = "admin@daikoku.io"
    )
    val adminApiPlan = UsagePlan(
      id = UsagePlanId("admin"),
      tenant = Tenant.Default,
      customName = "admin",
      customDescription = None,
      otoroshiTarget = None,
      visibility = UsagePlanVisibility.Admin
    )
    val cmsApiPlan = UsagePlan(
      id = UsagePlanId("admin"),
      tenant = Tenant.Default,
      customName = "cms",
      customDescription = None,
      otoroshiTarget = None,
      visibility = UsagePlanVisibility.Admin
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
      state = ApiState.Published,
      documentation = ApiDocumentation(
        id = ApiDocumentationId(IdGenerator.token(32)),
        tenant = Tenant.Default,
        pages = Seq.empty[ApiDocumentationDetailPage],
        lastModificationAt = DateTime.now()
      ),
      swagger = None,
      possibleUsagePlans = Seq(adminApiPlan.id),
      defaultUsagePlan = UsagePlanId("admin").some,
      tags = Set("admin"),
      categories = Set("Administration"),
      visibility = ApiVisibility.AdminOnly,
      authorizedTeams = Seq(defaultAdminTeam.id)
    )
    val cmsApi = Api(
      id = ApiId(s"cms-api-tenant-${Tenant.Default.value}"),
      tenant = Tenant.Default,
      team = defaultAdminTeam.id,
      name = s"cms-api-tenant-${Tenant.Default.value}",
      lastUpdate = DateTime.now(),
      smallDescription = "cms api",
      description = "cms api",
      currentVersion = Version("1.0.0"),
      state = ApiState.Published,
      documentation = ApiDocumentation(
        id = ApiDocumentationId(IdGenerator.token(32)),
        tenant = Tenant.Default,
        pages = Seq.empty[ApiDocumentationDetailPage],
        lastModificationAt = DateTime.now()
      ),
      swagger = None,
      possibleUsagePlans = Seq(cmsApiPlan.id),
      defaultUsagePlan = cmsApiPlan.id.some,
      tags = Set("cms"),
      categories = Set("Administration"),
      visibility = ApiVisibility.AdminOnly,
      authorizedTeams = Seq(defaultAdminTeam.id)
    )
    val adminApiSubscription = ApiSubscription(
      id = ApiSubscriptionId(IdGenerator.token(32)),
      tenant = Tenant.Default,
      apiKey = OtoroshiApiKey(
        clientName = "admin-apikey-test",
        clientId = IdGenerator.token(10),
        clientSecret = IdGenerator.token(10)
      ),
      plan = adminApiPlan.id,
      createdAt = DateTime.now(),
      team = defaultAdminTeam.id,
      api = adminApi.id,
      by = tenantAdmin.id,
      customName = Some("admin key for test"),
      rotation = None,
      integrationToken = IdGenerator.token(64)
    )

    val adminApi2plan = UsagePlan(
      id = UsagePlanId("admin"),
      tenant = TenantId("tenant2"),
      customName = "admin",
      customDescription = None,
      otoroshiTarget = None,
      visibility = UsagePlanVisibility.Admin
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
      state = ApiState.Published,
      documentation = ApiDocumentation(
        id = ApiDocumentationId(IdGenerator.token(32)),
        tenant = Tenant.Default,
        pages = Seq.empty[ApiDocumentationDetailPage],
        lastModificationAt = DateTime.now()
      ),
      swagger = None,
      possibleUsagePlans = Seq(adminApi2plan.id),
      tags = Set("Administration"),
      visibility = ApiVisibility.AdminOnly,
      defaultUsagePlan = UsagePlanId("1").some,
      authorizedTeams = Seq(tenant2AdminTeam.id)
    )
    val tenant = Tenant(
      id = Tenant.Default,
      name = "Test Corp.",
      domain = "localhost",
      style = Some(
        DaikokuStyle
          .template(
            Tenant.Default
          )
          .copy(title = "Test Corp.")
      ),
      mailerSettings = Some(ConsoleMailerSettings()),
      authProvider = AuthProvider.Local,
      authProviderSettings = Json.obj(
        "sessionMaxAge" -> 86400
      ),
      bucketSettings = None,
      otoroshiSettings = Set(
        OtoroshiSettings(
          id = wiremockedOtoroshi,
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
      contact = "contact@test-corp.foo.bar",
      tenantMode = TenantMode.Default.some
    )
    private val tenant2Id: TenantId = TenantId("tenant2")
    val tenant2 = Tenant(
      id = tenant2Id,
      name = "Test Corp. II",
      domain = "localhost.tenant2",
      style = Some(
        DaikokuStyle.template(tenant2Id).copy(title = "Test Corp. II")
      ),
      mailerSettings = Some(ConsoleMailerSettings()),
      authProvider = AuthProvider.Local,
      authProviderSettings = Json.obj(
        "sessionMaxAge" -> 86400
      ),
      bucketSettings = None,
      otoroshiSettings = Set(
        OtoroshiSettings(
          id = wiremockedOtoroshi,
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

    val envModeDev = "dev"
    val envModeProd = "prod"

    val tenantEnvMode = tenant.copy(
      display = TenantDisplay.Environment,
      environments = Set(envModeDev, envModeProd)
    )

    def generateApi(
        version: String = "0",
        tenant: TenantId,
        teamId: TeamId,
        docIds: Seq[ApiDocumentationDetailPage]
    ): ApiWithPlans = {
      val plans = Seq(
        UsagePlan(
          id = UsagePlanId("1"),
          tenant = tenant,
          billingDuration = None,
          currency = None,
          customName = "Free without quotas",
          customDescription = None,
          otoroshiTarget = Some(
            OtoroshiTarget(
              OtoroshiSettingsId("default"),
              Some(
                AuthorizedEntities(
                  groups = Set(OtoroshiServiceGroupId("12345"))
                )
              )
            )
          ),
          allowMultipleKeys = Some(false),
          subscriptionProcess = Seq.empty,
          integrationProcess = IntegrationProcess.ApiKey,
          autoRotation = Some(false)
        ),
        UsagePlan(
          id = UsagePlanId("2"),
          tenant = tenant,
          maxPerSecond = 2000L.some,
          maxPerDay = 2000L.some,
          maxPerMonth = 2000L.some,
          billingDuration = None,
          currency = None,
          customName = "Free with quotas",
          customDescription = None,
          otoroshiTarget = Some(
            OtoroshiTarget(
              OtoroshiSettingsId("default"),
              Some(
                AuthorizedEntities(
                  groups = Set(OtoroshiServiceGroupId("12345"))
                )
              )
            )
          ),
          allowMultipleKeys = Some(false),
          subscriptionProcess = Seq.empty,
          integrationProcess = IntegrationProcess.ApiKey,
          autoRotation = Some(false)
        ),
        UsagePlan(
          UsagePlanId("3"),
          tenant = tenant,
          maxPerSecond = 10000L.some,
          maxPerDay = 10000L.some,
          maxPerMonth = 10000L.some,
          costPerMonth = BigDecimal(10.0).some,
          billingDuration = BillingDuration(1, BillingTimeUnit.Month).some,
          trialPeriod = None,
          currency = Currency("EUR").some,
          customName = "Quotas With Limits",
          customDescription = None,
          otoroshiTarget = Some(
            OtoroshiTarget(
              OtoroshiSettingsId("default"),
              Some(
                AuthorizedEntities(
                  groups = Set(OtoroshiServiceGroupId("12345"))
                )
              )
            )
          ),
          allowMultipleKeys = Some(false),
          subscriptionProcess = Seq.empty,
          integrationProcess = IntegrationProcess.ApiKey,
          autoRotation = Some(false)
        ),
        UsagePlan(
          UsagePlanId("4"),
          tenant = tenant,
          maxPerSecond = 10000L.some,
          maxPerDay = 10000L.some,
          maxPerMonth = 10000L.some,
          costPerRequest = BigDecimal(0.015).some,
          costPerMonth = BigDecimal(10.0).some,
          billingDuration = BillingDuration(1, BillingTimeUnit.Month).some,
          trialPeriod = None,
          currency = Currency("EUR").some,
          customName = "Quotas Without Limits",
          customDescription = None,
          otoroshiTarget = Some(
            OtoroshiTarget(
              OtoroshiSettingsId("default"),
              Some(
                AuthorizedEntities(
                  groups = Set(OtoroshiServiceGroupId("12345"))
                )
              )
            )
          ),
          allowMultipleKeys = Some(true),
          subscriptionProcess = Seq.empty,
          integrationProcess = IntegrationProcess.ApiKey,
          autoRotation = Some(false)
        ),
        UsagePlan(
          id = UsagePlanId("5"),
          tenant = tenant,
          costPerRequest = BigDecimal(10.0).some,
          costPerMonth = BigDecimal(0.02).some,
          billingDuration = BillingDuration(1, BillingTimeUnit.Month).some,
          trialPeriod = None,
          currency = Currency("EUR").some,
          customName = "Pay Per Use",
          customDescription = None,
          otoroshiTarget = Some(
            OtoroshiTarget(
              OtoroshiSettingsId("default"),
              Some(
                AuthorizedEntities(
                  groups = Set(OtoroshiServiceGroupId("12345"))
                )
              )
            )
          ),
          allowMultipleKeys = Some(false),
          subscriptionProcess = Seq.empty,
          integrationProcess = IntegrationProcess.ApiKey,
          autoRotation = Some(false)
        )
      )

      val api = Api(
        id = ApiId(s"api-${tenant.value}-$version"),
        tenant = tenant,
        team = teamId,
        lastUpdate = DateTime.now(),
        name = s"Api - V$version",
        smallDescription = "A small API to play with Daikoku exposition",
        tags = Set("api", "rest", "scala", "play"),
        description = """# My Awesome API
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
        state = ApiState.Published,
        visibility = ApiVisibility.Public,
        documentation = ApiDocumentation(
          id = ApiDocumentationId(IdGenerator.token(32)),
          tenant = tenant,
          pages = docIds,
          lastModificationAt = DateTime.now()
        ),
        swagger = None,
        possibleUsagePlans = plans.map(_.id),
        defaultUsagePlan = UsagePlanId("1").some
      )

      ApiWithPlans(api, plans)
    }

    val defaultCmsPage: CmsPage = CmsPage(
      id = CmsPageId(IdGenerator.token(32)),
      tenant = tenant.id,
      visible = true,
      authenticated = false,
      name = "foo",
      forwardRef = None,
      tags = List(),
      metadata = Map(),
      contentType = "text/html",
      body = "<h1>production content</h1>",
      path = Some("/" + IdGenerator.token(32))
    )

    val defaultApi: ApiWithPlans =
      generateApi("default", tenant.id, teamOwnerId, Seq.empty)

    val baseMyNotificationGraphQLQuery =
      s"""
         |query getMyNotifications ($$limit : Int, $$offset: Int, $$filterTable: JsArray) {
         |      myNotifications (limit: $$limit, offset: $$offset, filterTable: $$filterTable) {
         |        notifications {
         |          _id
         |          team {
         |            _id
         |          }
         |          action {
         |            __typename
         |
         |            ... on TeamInvitation {
         |            __typename
         |              team {
         |                _id
         |              }
         |            }
         |          }
         |          status {
         |            ... on NotificationStatusAccepted {
         |            __typename
         |              date
         |              status
         |            }
         |            ... on NotificationStatusRejected {
         |            __typename
         |              date
         |              status
         |            }
         |            ... on NotificationStatusPending {
         |            __typename
         |              status
         |            }
         |
         |          }
         |        }
         |        total,
         |        totalFiltered,
         |       }
         |}
         |""".stripMargin

    def getOwnNotificationsCallBlocking(
        extraFilters: JsObject = Json.obj()
    )(implicit tenant: Tenant, session: UserSession) = {
      val variables = Json.obj("limit" -> 20, "offset" -> 0) ++ extraFilters

      httpJsonCallBlocking(
        path = "/api/search",
        method = "POST",
        body = Json
          .obj(
            "variables" -> variables,
            "query" -> baseMyNotificationGraphQLQuery
          )
          .some
      )
    }
  }
}
