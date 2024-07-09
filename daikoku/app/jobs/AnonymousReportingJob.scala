package jobs

import daikoku.BuildInfo
import fr.maif.otoroshi.daikoku.domain.{Tenant, TenantMode, json}
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import org.apache.pekko.Done
import org.apache.pekko.actor.Cancellable
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.Materializer
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json.{JsArray, JsNumber, JsObject, Json}
import play.api.libs.ws.WSRequest

import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration.DurationInt

class AnonymousReportingJob(env: Env) {
  private val logger = Logger("AnonymousReportingJob")
  private val ref = new AtomicReference[Cancellable]()

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env
  implicit val mat: Materializer = env.defaultMaterializer
  private case class Data(
      daikoku_id: String,
      account_creation: Int,
      api_documentation_pages: Int,
      api_issues: Int,
      api_posts: Int,
      api_subscription: Int,
      apis: Int,
      audit_events: Int,
      cmspages: Int,
      consumptions: Int,
      email_verifications: Int,
      evolutions: Int,
      messages: Int,
      notifications: Int,
      operations: Int,
      password_reset: Int,
      step_validator: Int,
      subscription_demands: Int,
      teams: Int,
      tenants: Seq[Tenant],
      translations: Int,
      usage_plans: Int,
      user_sessions: Int,
      users: Int,
      timestamp: JsNumber,
      timestampStr: String,
      id: String,
      daikokuVersion: String,
      javaVersion: JsObject,
      os: JsObject
  )

  private val wSRequest: WSRequest =
    env.wsClient.url(ev.config.anonymousReportingUrl)
  private val enabled: Boolean = ev.config.anonymousReportingEnabled
  private val containerized: Boolean = ev.config.containerized
  private val dataStore = ev.dataStore

  def start(): Unit = {
    logger.info("Anonymous Reporting started")
    if (ref.get() == null) {
      ref.set(
        env.defaultActorSystem.scheduler
          .scheduleAtFixedRate(1.seconds, 6.hours) { () =>
            sendDatas()
          }
      )
    }
  }

  def stop(): Unit = {
    Option(ref.get()).foreach(_.cancel())
  }

  private def getData = {
    for {
      daikoku_id <- dataStore.reportsInfoRepo.findAll().map(seq => seq.head.id)

      account_creation <- dataStore.accountCreationRepo.findAllNotDeleted()
      api_documentation_pages <-
        dataStore.apiDocumentationPageRepo.forAllTenant().findAllNotDeleted()
      api_issues <- dataStore.apiIssueRepo.forAllTenant().findAllNotDeleted()
      api_posts <- dataStore.apiPostRepo.forAllTenant().findAllNotDeleted()
      api_subscription <-
        dataStore.apiSubscriptionRepo.forAllTenant().findAllNotDeleted()
      apis <- dataStore.apiRepo.forAllTenant().findAllNotDeleted()
      audit_events <-
        dataStore.auditTrailRepo.forAllTenant().findAllNotDeleted()
      cmspages <- dataStore.cmsRepo.forAllTenant().findAllNotDeleted()
      consumptions <-
        dataStore.consumptionRepo.forAllTenant().findAllNotDeleted()
      email_verifications <-
        dataStore.emailVerificationRepo.forAllTenant().findAllNotDeleted()
      evolutions <- dataStore.evolutionRepo.findAllNotDeleted()
      messages <- dataStore.messageRepo.forAllTenant().findAllNotDeleted()
      notifications <-
        dataStore.notificationRepo.forAllTenant().findAllNotDeleted()
      operations <- dataStore.operationRepo.forAllTenant().findAllNotDeleted()
      password_reset <- dataStore.passwordResetRepo.findAllNotDeleted()
      step_validator <-
        dataStore.stepValidatorRepo.forAllTenant().findAllNotDeleted()
      subscription_demands <-
        dataStore.subscriptionDemandRepo.forAllTenant().findAllNotDeleted()
      teams <- dataStore.teamRepo.forAllTenant().findAllNotDeleted()
      tenants <- dataStore.tenantRepo.findAllNotDeleted()
      translations <-
        dataStore.translationRepo.forAllTenant().findAllNotDeleted()
      usage_plans <- dataStore.usagePlanRepo.forAllTenant().findAllNotDeleted()
      user_sessions <- dataStore.userSessionRepo.findAllNotDeleted()
      users <- dataStore.userRepo.findAllNotDeleted()

      timestamp = json.DateTimeFormat.writes(DateTime.now())
      timestamp_str = DateTime.now().toString()
      id = IdGenerator.uuid
      daikoku_version = BuildInfo.version
      java_version = Json.obj(
        "version" -> System.getProperty("java.version"),
        "vendor" -> System.getProperty("java.vendor")
      )
      os = Json.obj(
        "name" -> System.getProperty("os.name"),
        "arch" -> System.getProperty("os.arch"),
        "version" -> System.getProperty("os.version")
      )
    } yield Data(
      daikoku_id = daikoku_id.value,
      id = id,
      tenants = tenants,
      account_creation = account_creation.length,
      api_documentation_pages = api_documentation_pages.length,
      api_issues = api_issues.length,
      api_posts = api_posts.length,
      api_subscription = api_subscription.length,
      apis = apis.length,
      audit_events = audit_events.length,
      cmspages = cmspages.length,
      consumptions = consumptions.length,
      email_verifications = email_verifications.length,
      evolutions = evolutions.length,
      messages = messages.length,
      notifications = notifications.length,
      operations = operations.length,
      password_reset = password_reset.length,
      step_validator = step_validator.length,
      subscription_demands = subscription_demands.length,
      teams = teams.length,
      translations = translations.length,
      usage_plans = usage_plans.length,
      user_sessions = user_sessions.length,
      users = users.length,
      timestamp = timestamp,
      timestampStr = timestamp_str,
      daikokuVersion = daikoku_version,
      javaVersion = java_version,
      os = os
    )
  }

  private def sendDatas(): Future[Done] = {
    dataStore.reportsInfoRepo
      .findAll()
      .map(seq => seq.head)
      .map(seq => {
        if (enabled && seq.activated) {
          for {
            data <- getData
            post = Json.obj(
              "daikoku_cluster_id" -> data.daikoku_id,
              "@id" -> data.id,
              "tenants" -> JsArray(data.tenants.map(tenant => {
                val visibility = if (tenant.isPrivate) {
                  "private"
                } else {
                  "public"
                }
                Json.obj(
                  "tenantMode" -> tenant.tenantMode
                    .getOrElse(TenantMode.Default)
                    .name,
                  "payements" -> tenant.thirdPartyPaymentSettings.length,
                  "displayMode" -> tenant.display.name,
                  "visibility" -> visibility,
                  "AuthRole" -> tenant.authProvider.name
                )
              })),
              "entities" -> Json.obj(
                "account_creation" -> data.account_creation,
                "api_documentation_pages" -> data.api_documentation_pages,
                "api_issues" -> data.api_issues,
                "api_posts" -> data.api_posts,
                "api_subscription" -> data.api_subscription,
                "apis" -> data.apis,
                "audit_events" -> data.audit_events,
                "cmspages" -> data.cmspages,
                "consumptions" -> data.consumptions,
                "email_verifications" -> data.email_verifications,
                "evolutions" -> data.evolutions,
                "messages" -> data.messages,
                "notifications" -> data.notifications,
                "operations" -> data.operations,
                "password_reset" -> data.password_reset,
                "step_validator" -> data.step_validator,
                "subscription_demands" -> data.subscription_demands,
                "teams" -> data.teams,
                "translations" -> data.translations,
                "usage_plans" -> data.usage_plans,
                "user_sessions" -> data.user_sessions,
                "users" -> data.users
              ),
              "features" -> Json.obj(),
              "timestamp" -> data.timestamp,
              "timestamp_str" -> data.timestampStr,
              "daikoku_version" -> data.daikokuVersion,
              "java_version" -> data.javaVersion,
              "os" -> data.os,
              "containerized" -> containerized
            )
            _ <-
              wSRequest
                .withRequestTimeout(ev.config.anonymousReportingTimeout.millis)
                .post(post)
                .map {
                  resp =>
                    if (
                      resp.status != 200 && resp.status != 201 && resp.status != 204
                    ) {
                      logger.error(
                        s"error while sending anonymous reports: ${resp.status} - ${resp.body}"
                      )
                    } else {
                      logger.info(
                        "Thank you for having anonymous reporting enabled, Data sent ! For more info see (https://maif.github.io/daikoku/docs/getstarted/setup/reporting)"
                      )
                    }
                }
                .recover {
                  case e: Throwable =>
                    logger.error("error while sending anonymous reports", e)
                    ()
                }
          } yield Done
        } else {

          logger.info(
            "Anonymous reporting is disabled if you want to activate it for helping us, see (https://maif.github.io/daikoku/docs/getstarted/setup/reporting)"
          )
          FastFuture.successful(Done)
        }
      })
      .flatten
  }
}
