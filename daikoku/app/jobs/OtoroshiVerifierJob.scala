package jobs

import java.util.concurrent.atomic.AtomicReference

import akka.actor.Cancellable
import fr.maif.otoroshi.daikoku.audit.JobEvent
import fr.maif.otoroshi.daikoku.domain.NotificationAction.{
  OtoroshiSyncApiError,
  OtoroshiSyncSubscriptionError
}
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.{
  ConsoleMailer,
  IdGenerator,
  Mailer,
  OtoroshiClient
}
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json._
import reactivemongo.bson.BSONObjectID

import scala.concurrent.Future
import scala.concurrent.duration._
import scala.util.{Failure, Success}

class OtoroshiVerifierJob(client: OtoroshiClient, env: Env) {

  private val logger = Logger("OtoroshiVerifierJob")

  private val ref = new AtomicReference[Cancellable]()

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env

  private val jobUser = User(
    id = UserId("otoroshi-verifier-job"),
    tenants = Set(),
    origins = Set(),
    name = "Otoroshi Verifier Job",
    email = "verifier@daikoku.io",
    picture = "https://www.otoroshi.io/assets/images/svg/otoroshi_logo.svg",
    password = None,
    lastTenant = None,
    personalToken = Some(IdGenerator.token(32)),
    defaultLanguage = None
    // lastTeams = Map.empty
  )

  def start(): Unit = {
    if (!env.config.otoroshiSyncByCron && env.config.otoroshiSyncMaster && ref
          .get() == null) {
      ref.set(
        env.defaultActorSystem.scheduler
          .schedule(10.seconds, env.config.otoroshiSyncInterval) {
            verify()
          })
    }
  }

  def stop(): Unit = {
    Option(ref.get()).foreach(_.cancel())
  }

  private def sendErrorNotification(err: OtoroshiSyncNotificationAction,
                                    teamId: TeamId,
                                    tenantId: TenantId,
                                    otoHost: Option[String] = None): Unit = {
    env.dataStore.notificationRepo
      .forTenant(tenantId)
      .save(Notification(
        id = NotificationId(BSONObjectID.generate().stringify),
        tenant = tenantId,
        team = teamId,
        deleted = false,
        sender = jobUser,
        date = DateTime.now(),
        notificationType = NotificationType.AcceptOnly,
        status = NotificationStatus.Pending,
        action = err.asInstanceOf[NotificationAction]
      ))
    env.dataStore.tenantRepo.findByIdNotDeleted(tenantId).andThen {
      case Success(Some(tenant)) =>
        JobEvent(err.message).logJobEvent(
          tenant,
          jobUser,
          err match {
            case e: OtoroshiSyncSubscriptionError =>
              Json.obj("subscription" -> e.subscription.asJson,
                       "team" -> teamId.value,
                       "tenant" -> tenantId.value)
            case e: OtoroshiSyncApiError =>
              Json.obj("api" -> e.api.asJson,
                       "team" -> teamId.value,
                       "tenant" -> tenantId.value)
          }
        )
    }
    env.dataStore.userRepo.findAll().map(_.filter(_.isDaikokuAdmin)).map {
      users =>
        def sendMail(mailer: Mailer): Unit = {
          mailer.send(
            "Otoroshi synchronizer error",
            users.map(_.email),
            s"""<p>An error occured during the Otoroshi synchronization job for team ${teamId.value} on tenant ${tenantId.value} for ${otoHost}</p>
            |<p>${err.message}</p>
            |<strong>Details</strong>
            |<pre>${Json.prettyPrint(err.json)}</pre>
            """.stripMargin
          )
        }

        val tenants: Seq[TenantId] = users.flatMap(u => u.tenants).distinct
        env.dataStore.tenantRepo
          .find(
            Json.obj(
              "_deleted" -> false,
              "_id" -> Json.obj(
                "$in" -> JsArray(tenants.map(t => JsString(t.value)))
              )
            ))
          .map { tenants =>
            tenants.find { t =>
              t.mailerSettings.isDefined && t.mailerSettings.get.mailerType != "console"
            } match {
              case None         => sendMail(new ConsoleMailer())
              case Some(tenant) => sendMail(tenant.mailer(env))
            }
          }
    }
  }

  private def verifyIfOtoroshiGroupsStillExists(): Future[Unit] = {
    env.dataStore.apiRepo.forAllTenant().findAllNotDeleted().map { apis =>
      apis.map { api =>
        env.dataStore.tenantRepo.findByIdNotDeleted(api.tenant).map {
          case None =>
            sendErrorNotification(NotificationAction.OtoroshiSyncApiError(
                                    api,
                                    "Tenant does not exist anymore"),
                                  api.team,
                                  api.tenant)
          case Some(tenant) => {
            api.possibleUsagePlans.map { plan =>
              plan.otoroshiTarget match {
                case None =>
                  () // sendErrorNotification(NotificationAction.OtoroshiSyncApiError(api, "No Otoroshi target specified"), api.team, api.tenant)
                case Some(target) => {
                  tenant.otoroshiSettings
                    .find(_.id == target.otoroshiSettings) match {
                    case None =>
                      sendErrorNotification(
                        NotificationAction.OtoroshiSyncApiError(
                          api,
                          "Otoroshi settings does not exist anymore"),
                        api.team,
                        api.tenant)
                    case Some(otoroshi) => {
                      client
                        .getServiceGroup(target.serviceGroup.value)(otoroshi)
                        .andThen {
                          case Failure(e) =>
                            sendErrorNotification(
                              NotificationAction.OtoroshiSyncApiError(
                                api,
                                s"Unable to fetch service group from otoroshi. Maybe it doesn't exists anymore"),
                              api.team,
                              api.tenant)
                        }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  private def verifyIfOtoroshiApiKeysStillExists(): Future[Unit] = {
    env.dataStore.apiSubscriptionRepo.forAllTenant().findAllNotDeleted().map {
      subscriptions =>
        subscriptions.map { subscription =>
          env.dataStore.tenantRepo.findByIdNotDeleted(subscription.tenant).map {
            case None =>
              sendErrorNotification(
                NotificationAction.OtoroshiSyncSubscriptionError(
                  subscription,
                  "Tenant does not exist anymore"),
                subscription.team,
                subscription.tenant)
            case Some(tenant) => {
              env.dataStore.apiRepo
                .forAllTenant()
                .findByIdNotDeleted(subscription.api)
                .map {
                  case None =>
                    sendErrorNotification(
                      NotificationAction.OtoroshiSyncSubscriptionError(
                        subscription,
                        "API does not exist anymore"),
                      subscription.team,
                      subscription.tenant)
                  case Some(api) => {
                    api.possibleUsagePlans
                      .find(_.id == subscription.plan) match {
                      case None =>
                        sendErrorNotification(
                          NotificationAction.OtoroshiSyncSubscriptionError(
                            subscription,
                            "Usage plan does not exist anymore"),
                          subscription.team,
                          subscription.tenant)
                      case Some(plan) => {
                        plan.otoroshiTarget match {
                          case None =>
                            () // sendErrorNotification(NotificationAction.OtoroshiSyncSubscriptionError(subscription, "No Otoroshi target specified"), subscription.team, subscription.tenant)
                          case Some(target) => {
                            tenant.otoroshiSettings.find(
                              _.id == target.otoroshiSettings) match {
                              case None =>
                                sendErrorNotification(
                                  NotificationAction.OtoroshiSyncSubscriptionError(
                                    subscription,
                                    "Otoroshi settings does not exist anymore"),
                                  subscription.team,
                                  subscription.tenant)
                              case Some(settings) => {
                                client
                                  .getApikey(
                                    target.serviceGroup.value,
                                    subscription.apiKey.clientId)(settings)
                                  .andThen {
                                    case Failure(e) =>
                                      sendErrorNotification(
                                        NotificationAction
                                          .OtoroshiSyncSubscriptionError(
                                            subscription,
                                            s"Unable to fetch apikey from otoroshi: ${e.getMessage}"),
                                        subscription.team,
                                        subscription.tenant,
                                        Some(settings.host)
                                      )
                                    case Success(Left(e)) =>
                                      sendErrorNotification(
                                        NotificationAction
                                          .OtoroshiSyncSubscriptionError(
                                            subscription,
                                            s"Unable to fetch apikey from otoroshi: ${Json
                                              .stringify(JsError.toJson(e))}"),
                                        subscription.team,
                                        subscription.tenant,
                                        Some(settings.host)
                                      )
                                    case Success(Right(apk))
                                        if apk.clientId != subscription.apiKey.clientId || apk.clientSecret != subscription.apiKey.clientSecret => {
                                      sendErrorNotification(
                                        NotificationAction
                                          .OtoroshiSyncSubscriptionError(
                                            subscription,
                                            s"Api key does not match with otoroshi one ${apk.clientId}"),
                                        subscription.team,
                                        subscription.tenant,
                                        Some(settings.host)
                                      )
                                    }
                                    case Success(Right(apk)) => {

                                      import cats.data.OptionT
                                      import cats.implicits._

                                      val prefix = plan.otoroshiTarget
                                        .flatMap(
                                          _.apikeyCustomization.dynamicPrefix)
                                        .getOrElse("daikoku_")

                                      for {
                                        team <- OptionT(env.dataStore.teamRepo
                                          .forTenant(tenant)
                                          .findById(subscription.team))
                                        user <- OptionT(env.dataStore.userRepo
                                          .findById(subscription.by))
                                      } yield {
                                        val ctx: Map[String, String] = Map(
                                          "user.id" -> user.id.value,
                                          "user.name" -> user.name,
                                          "user.email" -> user.email,
                                          "api.id" -> api.id.value,
                                          "api.name" -> api.name,
                                          "team.id" -> team.id.value,
                                          "team.name" -> team.name,
                                          "tenant.id" -> tenant.id.value,
                                          "tenant.name" -> tenant.name,
                                          "client.id" -> apk.clientId,
                                          "client.name" -> apk.clientName,
                                          "group.id" -> target.serviceGroup.value
                                        ) ++ team.metadata.map(t =>
                                          ("team.metadata." + t._1, t._2)) ++ user.metadata
                                          .map(t =>
                                            ("user.metadata." + t._1, t._2))

                                        val planTags: Seq[String] =
                                          plan.otoroshiTarget
                                            .map(_.apikeyCustomization.tags
                                              .asOpt[Seq[String]]
                                              .getOrElse(Seq.empty[String]))
                                            .getOrElse(Seq.empty[String])
                                        val currentTagKeys
                                          : Map[String, String] = apk.tags
                                          .filter(_.startsWith(prefix))
                                          .map(v =>
                                            (OtoroshiTarget.expressionReplacer
                                               .replaceOn(v)(_ => ""),
                                             v))
                                          .toMap
                                        val newTagKeys: Map[String, String] =
                                          planTags
                                            .filter(_.startsWith(prefix))
                                            .map(v =>
                                              (OtoroshiTarget.expressionReplacer
                                                 .replaceOn(v)(_ => ""),
                                               v))
                                            .toMap
                                        val newDaikokuTags: Seq[String] =
                                          (currentTagKeys ++ newTagKeys)
                                            .map {
                                              case (key, value) =>
                                                (key,
                                                 OtoroshiTarget
                                                   .processValue(value, ctx))
                                            }
                                            .map(_._2)
                                            .toSeq
                                        val newTags
                                          : Seq[String] = newDaikokuTags ++ apk.tags
                                          .filterNot(v =>
                                            newDaikokuTags.contains(v))

                                        val planMeta: Map[String, String] =
                                          plan.otoroshiTarget
                                            .map(_.apikeyCustomization.metadata
                                              .asOpt[Map[String, String]]
                                              .getOrElse(
                                                Map.empty[String, String]))
                                            .getOrElse(
                                              Map.empty[String, String])
                                        val allDaikokuMeta
                                          : Map[String, String] = (apk.metadata
                                          .filterNot {
                                            case (key, _) =>
                                              planMeta.contains(key)
                                          } ++ planMeta) filter {
                                          case (key, _) =>
                                            key.startsWith(prefix)
                                        }
                                        val newMeta
                                          : Map[String, String] = apk.metadata ++ allDaikokuMeta
                                          .map {
                                            case (key, value)
                                                if key.startsWith(prefix) =>
                                              (key,
                                               OtoroshiTarget
                                                 .processValue(value, ctx))
                                            case (key, value) =>
                                              (key, value) // should never happens
                                          }

                                        val newApk = apk.copy(
                                          tags = newTags,
                                          metadata = newMeta,
                                          constrainedServicesOnly =
                                            target.apikeyCustomization.constrainedServicesOnly,
                                          allowClientIdOnly =
                                            target.apikeyCustomization.clientIdOnly,
                                          restrictions =
                                            target.apikeyCustomization.restrictions
                                        )

                                        client
                                          .updateApiKey(
                                            target.serviceGroup.value,
                                            newApk)(settings)
                                          .andThen {
                                            case Success(_) =>
                                              logger.info(
                                                s"Successfully updated api key metadata: ${apk.clientId} - ${apk.clientName} on ${settings.host}")
                                            case Failure(e) =>
                                              logger.error(
                                                s"Error while updating api key metadata: ${apk.clientId} - ${apk.clientName} on ${settings.host}",
                                                e)
                                          }
                                      }
                                    }
                                  }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
            }
          }
        }
    }
  }

  def verifyRotation(): Future[Unit] = {
    env.dataStore.apiSubscriptionRepo.forAllTenant().find(Json.obj("rotation.enabled" -> true)).map(
      subscriptions => {
        Logger.debug(s"${subscriptions.map(_.id.toString).mkString(", ")}")
        subscriptions.map { subscription =>
          env.dataStore.tenantRepo.findByIdNotDeleted(subscription.tenant).map {
            case None =>
              sendErrorNotification(
                NotificationAction.OtoroshiSyncSubscriptionError(
                  subscription,
                  "Tenant does not exist anymore"),
                subscription.team,
                subscription.tenant)
            case Some(tenant) => {
              env.dataStore.apiRepo
                .forAllTenant()
                .findByIdNotDeleted(subscription.api)
                .map {
                  case None =>
                    sendErrorNotification(
                      NotificationAction.OtoroshiSyncSubscriptionError(
                        subscription,
                        "API does not exist anymore"),
                      subscription.team,
                      subscription.tenant)
                  case Some(api) => {
                    api.possibleUsagePlans
                      .find(_.id == subscription.plan) match {
                      case None =>
                        sendErrorNotification(
                          NotificationAction.OtoroshiSyncSubscriptionError(
                            subscription,
                            "Usage plan does not exist anymore"),
                          subscription.team,
                          subscription.tenant)
                      case Some(plan) => {
                        plan.otoroshiTarget match {
                          case None =>
                            () // sendErrorNotification(NotificationAction.OtoroshiSyncSubscriptionError(subscription, "No Otoroshi target specified"), subscription.team, subscription.tenant)
                          case Some(target) => {
                            tenant.otoroshiSettings.find(
                              _.id == target.otoroshiSettings) match {
                              case None =>
                                sendErrorNotification(
                                  NotificationAction.OtoroshiSyncSubscriptionError(
                                    subscription,
                                    "Otoroshi settings does not exist anymore"),
                                  subscription.team,
                                  subscription.tenant)
                              case Some(settings) => {
                                client
                                  .getApikey(
                                    target.serviceGroup.value,
                                    subscription.apiKey.clientId)(settings)
                                  .andThen {
                                    case Failure(e) => Logger.debug(e.getLocalizedMessage)
                                    case Success(Left(e)) => Logger.debug(Json.stringify(JsError.toJson(e)))
                                    case Success(Right(apk)) if !apk.rotation.exists(r => r.enabled) =>
                                      Logger.debug("apk rotation iis disabled")
                                      Logger.debug(s"id: ${apk.clientId} \\n otoroshi ==> ${Json.prettyPrint(apk.asJson)} \\n daikoku ==> ${Json.prettyPrint(subscription.asJson)}")
                                      env.dataStore.apiSubscriptionRepo.forTenant(subscription.tenant)
                                        .save(Json.obj("_id" -> subscription.id.asJson), subscription.copy(rotation = subscription.rotation.map(_.copy(enabled = false))).asJson.as[JsObject])
                                    case Success(Right(apk)) =>
                                      val otoroshiNextSecret: Option[String] = apk.rotation.flatMap(_.nextSecret)
                                      val otoroshiActualSecret: String = apk.clientSecret
                                      val daikokuActualSecret: String = subscription.apiKey.clientSecret
                                      val pendingRotation: Boolean = subscription.rotation.exists(_.pendingRotation)

                                      Logger.debug(s"id: ${apk.clientId} \\n otoroshi ==> ${Json.prettyPrint(apk.asJson)} \\n daikoku ==> ${Json.prettyPrint(subscription.asJson)}")

                                      //                                      if (!pendingRotation && otoroshiNextSecret.isEmpty && otoroshiActualSecret == daikokuActualSecret) {
                                      //                                        //todo: rien a faire
                                      //                                      }
                                      if (!pendingRotation && otoroshiNextSecret.isDefined && otoroshiActualSecret == daikokuActualSecret) {
                                        val newSubscription = subscription.copy(rotation = subscription.rotation.map(_.copy(pendingRotation = true)), apiKey = subscription.apiKey.copy(clientSecret = otoroshiNextSecret.get))
                                        val notification = Notification(
                                          id = NotificationId(BSONObjectID.generate().stringify),
                                          tenant = tenant.id,
                                          team = api.team,
                                          sender = jobUser,
                                          action = NotificationAction.ApiKeyRotationInProgress(subscription.id)
                                        )

                                        for {
                                          _ <- env.dataStore.apiSubscriptionRepo.forTenant(subscription.tenant)
                                            .save(Json.obj("_id" -> subscription.id.asJson), newSubscription.asJson.as[JsObject])
                                          _ <- env.dataStore.notificationRepo.forTenant(subscription.tenant).save(notification)
                                        } yield ()
                                        //                                      } else if (pendingRotation && otoroshiActualSecret != daikokuActualSecret) {
                                        //                                        // todo: rien a faire
                                      } else if (pendingRotation && otoroshiActualSecret == daikokuActualSecret) {
                                        val notification = Notification(
                                          id = NotificationId(BSONObjectID.generate().stringify),
                                          tenant = tenant.id,
                                          team = api.team,
                                          sender = jobUser,
                                          action = NotificationAction.ApiKeyRotationEnded(subscription.id)
                                        )
                                        val newSubscription = subscription.copy(rotation = subscription.rotation.map(_.copy(pendingRotation = false)))

                                        for {
                                          _ <- env.dataStore.apiSubscriptionRepo.forTenant(subscription.tenant)
                                            .save(Json.obj("_id" -> subscription.id.asJson), newSubscription.asJson.as[JsObject])
                                          _ <- env.dataStore.notificationRepo.forTenant(subscription.tenant).save(notification)
                                        } yield ()
                                      }
                                  }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
            }
          }
        }
      }
    )
  }

  def verify(): Future[Unit] = {
    logger.info("Verifying sync between daikoku and otoroshi")
    Future
      .sequence(
        Seq(
          verifyIfOtoroshiGroupsStillExists(),
          verifyIfOtoroshiApiKeysStillExists(),
          verifyRotation()
        ))
      .map(_ => ())
  }
}
