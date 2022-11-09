package jobs

import java.util.concurrent.atomic.AtomicReference
import cats.data.EitherT
import cats.syntax.option._
import cats.data.OptionT
import akka.actor.Cancellable
import akka.http.scaladsl.util.FastFuture
import controllers.AppError
import fr.maif.otoroshi.daikoku.audit.{ApiKeyRotationEvent, JobEvent}
import fr.maif.otoroshi.daikoku.domain.NotificationAction.{
  OtoroshiSyncApiError,
  OtoroshiSyncSubscriptionError
}
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json.ApiSubscriptionyRotationFormat
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.utils.{
  ConsoleMailer,
  IdGenerator,
  Mailer,
  OtoroshiClient,
  Translator
}
import jobs.LongExtensions.HumanReadableExtension
import org.joda.time.DateTime
import play.api.Logger
import play.api.i18n.MessagesApi
import play.api.libs.json._
import reactivemongo.bson.BSONObjectID

import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration._
import scala.util.{Failure, Success}
import java.util.concurrent.TimeUnit

object LongExtensions {
  implicit class HumanReadableExtension(duration: Long) {
    final def toHumanReadable: String = {
      val units = Seq(TimeUnit.DAYS,
                      TimeUnit.HOURS,
                      TimeUnit.MINUTES,
                      TimeUnit.SECONDS,
                      TimeUnit.MILLISECONDS)

      val timeStrings = units
        .foldLeft((Seq.empty[String], duration))({
          case ((humanReadable, rest), unit) =>
            val name = unit.toString.toLowerCase()
            val result = unit.convert(rest, TimeUnit.NANOSECONDS)
            val diff = rest - TimeUnit.NANOSECONDS.convert(result, unit)
            val str = result match {
              case 0    => humanReadable
              case 1    => humanReadable :+ s"1 ${name.init}" // Drop last 's'
              case more => humanReadable :+ s"$more $name"
            }
            (str, diff)
        })
        ._1

      timeStrings.size match {
        case 0 => ""
        case 1 => timeStrings.head
        case _ => timeStrings.init.mkString(", ") + " and " + timeStrings.last
      }
    }
  }
}

class OtoroshiVerifierJob(client: OtoroshiClient,
                          env: Env,
                          translator: Translator,
                          messagesApi: MessagesApi) {

  private val logger = Logger("OtoroshiVerifierJob")

  private val ref = new AtomicReference[Cancellable]()

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env
  implicit val me = messagesApi
  implicit val tr = translator

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
          .scheduleAtFixedRate(10.seconds, env.config.otoroshiSyncInterval) {
            () =>
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
        team = Some(teamId),
        sender = jobUser,
        date = DateTime.now(),
        notificationType = NotificationType.AcceptOnly,
        status = NotificationStatus.Pending(),
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
        def sendMail(mailer: Mailer, tenant: Tenant): Unit = {
          implicit val language: String = tenant.defaultLanguage.getOrElse("en")
          mailer.send(
            "Otoroshi synchronizer error",
            users.map(_.email),
            s"""<p>An error occured during the Otoroshi synchronization job for team ${teamId.value} on tenant ${tenantId.value} for $otoHost</p>
            |<p>${err.message}</p>
            |<strong>Details</strong>
            |<pre>${Json.prettyPrint(err.json)}</pre>
            """.stripMargin,
            tenant
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
              case None =>
                sendMail(new ConsoleMailer(ConsoleMailerSettings()),
                         tenants.head)
              case Some(tenant) => sendMail(tenant.mailer(env), tenant)
            }
          }
    }
  }

  private def verifyIfOtoroshiGroupsStillExists(
      query: JsObject = Json.obj()): Future[Unit] = {
    def checkEntities(entities: AuthorizedEntities,
                      otoroshi: OtoroshiSettings,
                      api: Api): Unit = {
      entities.groups.map(
        group =>
          client
            .getServiceGroup(group.value)(otoroshi)
            .andThen {
              case Failure(_) =>
                sendErrorNotification(
                  NotificationAction.OtoroshiSyncApiError(
                    api,
                    s"Unable to fetch service group $group from otoroshi. Maybe it doesn't exists anymore"),
                  api.team,
                  api.tenant
                )
          }) ++
        entities.services.map(
          service =>
            client
              .getServices()(otoroshi)
              .andThen {
                case Failure(_) =>
                  sendErrorNotification(
                    NotificationAction.OtoroshiSyncApiError(
                      api,
                      s"Unable to fetch service $service from otoroshi. Maybe it doesn't exists anymore"),
                    api.team,
                    api.tenant)
            })
    }

    env.dataStore.apiRepo.forAllTenant().findNotDeleted(query).map { apis =>
      apis.map { api =>
        env.dataStore.tenantRepo.findByIdNotDeleted(api.tenant).map {
          case None =>
            sendErrorNotification(NotificationAction.OtoroshiSyncApiError(
                                    api,
                                    "Tenant does not exist anymore"),
                                  api.team,
                                  api.tenant)
          case Some(tenant) =>
            api.possibleUsagePlans.map { plan =>
              plan.otoroshiTarget match {
                case None =>
                  () // sendErrorNotification(NotificationAction.OtoroshiSyncApiError(api, "No Otoroshi target specified"), api.team, api.tenant)
                case Some(target) =>
                  tenant.otoroshiSettings
                    .find(_.id == target.otoroshiSettings) match {
                    case None =>
                      sendErrorNotification(
                        NotificationAction.OtoroshiSyncApiError(
                          api,
                          "Otoroshi settings does not exist anymore"),
                        api.team,
                        api.tenant)
                    case Some(otoroshi) =>
                      target.authorizedEntities match {
                        case None => ()
                        case Some(authorizedEntities)
                            if authorizedEntities.isEmpty =>
                          ()
                        case Some(authorizedEntities) =>
                          checkEntities(authorizedEntities, otoroshi, api)
                      }
                  }
              }
            }
        }
      }
    }
  }

  /**
    * get subs base on query (by defaut all parent or unique keys)
    * get really parent subs (in case of query as a pointer to childs)
    * for each subs get aggregated key, get the oto key...process new key
    * daikoku is the truth for everything but the oto key (clientName, clientId, clientSecret)
    * tags and metadata unknown by DK are merged
    * save the new key in oto and the new secret in DK
    *
    * @param query to find some subscriptions and sync its
    * @return just future of Unit
    */
  private def synchronizeApikeys(
      query: JsObject = Json.obj("parent" -> JsNull)): Future[Unit] = {
    import cats.implicits._

    def getListFromMeta(key: String,
                        metadata: Map[String, String]): Seq[String] = {
      metadata.get(key).map(_.split('|').toSeq.map(_.trim)).getOrElse(Seq.empty)
    }

    def mergeMetaValue(key: String,
                       meta1: Map[String, String],
                       meta2: Map[String, String]): String = {
      val list1 = getListFromMeta(key, meta1)
      val list2 = getListFromMeta(key, meta2)
      (list1 ++ list2).distinct.mkString(" | ")
    }

    for {
      allSubscriptions <- env.dataStore.apiSubscriptionRepo
        .forAllTenant()
        .findNotDeleted(query)
      //Get just parent sub (childs will be processed after)
      subscriptions <- env.dataStore.apiSubscriptionRepo
        .forAllTenant()
        .findNotDeleted(
          Json.obj(
            "_id" -> Json.obj("$in" -> JsArray(Set
              .from(allSubscriptions.map(s =>
                s.parent.map(_.asJson).getOrElse(s.id.asJson)))
              .toSeq))))
    } yield {
      subscriptions.map(subscription => {
        for {
          aggregatedSubscriptions <- EitherT.right[Unit](
            env.dataStore.apiSubscriptionRepo
              .forAllTenant()
              .findNotDeleted(Json.obj("parent" -> subscription.id.asJson)))
          tenant <- EitherT.fromOptionF(
            env.dataStore.tenantRepo.findByIdNotDeleted(subscription.tenant),
            sendErrorNotification(
              NotificationAction.OtoroshiSyncSubscriptionError(
                subscription,
                "Tenant does not exist anymore"),
              subscription.team, //todo: to super admins ???
              subscription.tenant
            )
          )
          tenantAdminTeam <- EitherT.fromOptionF(
            env.dataStore.teamRepo
              .forTenant(tenant)
              .findOne(Json.obj("type" -> "Admin")),
            ())
          parentApi <- EitherT.fromOptionF(
            env.dataStore.apiRepo
              .forAllTenant()
              .findOneNotDeleted(
                Json.obj("_id" -> subscription.api.value, "published" -> true)),
            sendErrorNotification(
              NotificationAction.OtoroshiSyncSubscriptionError(
                subscription,
                "API does not exist anymore"),
              tenantAdminTeam.id,
              subscription.tenant)
          )
          plan <- EitherT.fromOption[Future](
            parentApi.possibleUsagePlans.find(_.id == subscription.plan),
            sendErrorNotification(
              NotificationAction.OtoroshiSyncSubscriptionError(
                subscription,
                "Usage plan does not exist anymore"),
              parentApi.team,
              parentApi.tenant)
          )
          otoroshiTarget <- EitherT.fromOption[Future](
            plan.otoroshiTarget,
            sendErrorNotification(
              NotificationAction.OtoroshiSyncSubscriptionError(
                subscription,
                "No Otoroshi target specified"),
              parentApi.team,
              parentApi.tenant)
          )
          otoroshiSettings <- EitherT.fromOption[Future](
            tenant.otoroshiSettings.find(
              _.id == otoroshiTarget.otoroshiSettings),
            Seq(parentApi.team, tenantAdminTeam.id)
              .map(
                team =>
                  sendErrorNotification(
                    NotificationAction.OtoroshiSyncSubscriptionError(
                      subscription,
                      "Otoroshi settings does not exist anymore"),
                    team,
                    parentApi.tenant))
              .reduce((_, _) => ())
          )
          //todo: if otoroshi apikey doesn't exist => rebuild it  !!!
          apk <- EitherT(
            client.getApikey(subscription.apiKey.clientId)(otoroshiSettings))
            .leftMap(e =>
              sendErrorNotification(
                NotificationAction.OtoroshiSyncSubscriptionError(
                  subscription,
                  s"Unable to fetch apikey from otoroshi: ${Json.stringify(
                    AppError.toJson(e))}"),
                parentApi.team,
                parentApi.tenant,
                Some(otoroshiSettings.host)
            ))
          team <- EitherT.fromOptionF(env.dataStore.teamRepo
                                        .forTenant(tenant)
                                        .findById(subscription.team),
                                      ())
          newApk <- EitherT(
            Future
              .sequence((aggregatedSubscriptions :+ subscription)
                .map(sub => {
                  for {
                    api <- EitherT.fromOptionF(
                      env.dataStore.apiRepo
                        .forAllTenant()
                        .findOneNotDeleted(Json.obj("_id" -> sub.api.value,
                                                    "published" -> true)),
                      sendErrorNotification(
                        NotificationAction.OtoroshiSyncSubscriptionError(
                          sub,
                          "API does not exist anymore"),
                        tenantAdminTeam.id,
                        tenant.id)
                    )
                    plan <- EitherT.fromOption[Future](
                      api.possibleUsagePlans.find(_.id == sub.plan),
                      sendErrorNotification(
                        NotificationAction.OtoroshiSyncSubscriptionError(
                          sub,
                          "Usage plan does not exist anymore"),
                        api.team,
                        tenant.id)
                    )
                    user <- EitherT
                      .fromOptionF(env.dataStore.userRepo.findById(sub.by), ())
                  } yield {
                    val ctx: Map[String, String] = Map(
                      "user.id" -> user.id.value,
                      "user.name" -> user.name,
                      "user.email" -> user.email,
                      "api.id" -> parentApi.id.value,
                      "api.name" -> parentApi.name,
                      "team.id" -> team.id.value,
                      "team.name" -> team.name,
                      "tenant.id" -> tenant.id.value,
                      "tenant.name" -> tenant.name,
                      "client.id" -> apk.clientId,
                      "client.name" -> apk.clientName
                    ) ++ team.metadata
                      .map(t => ("team.metadata." + t._1, t._2)) ++
                      user.metadata.map(t => ("user.metadata." + t._1, t._2))

                    // ********************
                    // process new tags
                    // ********************
                    val planTags = plan.otoroshiTarget
                      .flatMap(_.apikeyCustomization.tags.asOpt[Seq[String]])
                      .getOrElse(Seq.empty[String])

                    val currentTags = apk.tags
                    val metadataDkTagsLabel = "daikoku__tags"

                    val tagsFromDk =
                      getListFromMeta(metadataDkTagsLabel, apk.metadata)
                    val newTagsFromDk =
                      planTags.map(OtoroshiTarget.processValue(_, ctx))

                    val newTags: Seq[String] =
                      (currentTags.diff(tagsFromDk) ++ newTagsFromDk).distinct

                    // ********************
                    // process new metadata
                    // ********************
                    val planMeta = otoroshiTarget.apikeyCustomization.metadata
                      .asOpt[Map[String, String]]
                      .getOrElse(Map.empty[String, String])

                    val metaFromDk = apk.metadata
                      .get("daikoku__metadata")
                      .map(_.split('|').toSeq
                        .map(_.trim)
                        .map(key => key -> apk.metadata.get(key).orNull))
                      .getOrElse(planMeta.map {
                        case (a, b) => a -> OtoroshiTarget.processValue(b, ctx)
                      })
                      .toMap

                    val customMetaFromSub = sub.customMetadata
                      .flatMap(_.asOpt[Map[String, String]])
                      .getOrElse(Map.empty[String, String])

                    val newMetaFromDk = (planMeta ++ customMetaFromSub).map {
                      case (a, b) => a -> OtoroshiTarget.processValue(b, ctx)
                    }
                    val newMeta = apk.metadata
                      .removedAll(metaFromDk.keys) ++ newMetaFromDk ++ Map(
                      "daikoku__metadata" -> newMetaFromDk.keys.mkString(" | "),
                      metadataDkTagsLabel -> newTagsFromDk.mkString(" | "))

                    // ********************
                    // process new metadata
                    // ********************

                    apk.copy(
                      tags = newTags,
                      metadata = newMeta,
                      constrainedServicesOnly =
                        otoroshiTarget.apikeyCustomization.constrainedServicesOnly,
                      allowClientIdOnly =
                        otoroshiTarget.apikeyCustomization.clientIdOnly,
                      restrictions =
                        otoroshiTarget.apikeyCustomization.restrictions,
                      throttlingQuota = subscription.customMaxPerSecond
                        .orElse(plan.maxRequestPerSecond)
                        .getOrElse(apk.throttlingQuota),
                      dailyQuota = subscription.customMaxPerDay
                        .orElse(plan.maxRequestPerDay)
                        .getOrElse(apk.dailyQuota),
                      monthlyQuota = subscription.customMaxPerMonth
                        .orElse(plan.maxRequestPerMonth)
                        .getOrElse(apk.monthlyQuota),
                      authorizedEntities = otoroshiTarget.authorizedEntities
                        .getOrElse(AuthorizedEntities()),
                      readOnly = subscription.customReadOnly
                        .orElse(plan.otoroshiTarget.map(
                          _.apikeyCustomization.readOnly))
                        .getOrElse(apk.readOnly),
                      rotation = apk.rotation
                        .map(r =>
                          r.copy(enabled = r.enabled || subscription.rotation
                            .exists(_.enabled) || plan.autoRotation
                            .exists(e => e)))
                        .orElse(subscription.rotation.map(r =>
                          ApiKeyRotation(
                            enabled = r.enabled || plan.autoRotation.exists(e =>
                              e),
                            rotationEvery = r.rotationEvery,
                            gracePeriod = r.gracePeriod
                        )))
                        .orElse(plan.autoRotation.map(enabled =>
                          ApiKeyRotation(enabled = enabled)))
                    )

                  }
                })
                .map(_.value))
              .map(x =>
                x.reduce((either1, either2) => {
                  (either1, either2) match {
                    case (Right(apikey1), Right(apikey2)) =>
                      Right(apikey1.copy(
                        tags = (apikey1.tags ++ apikey2.tags).distinct,
                        metadata = apikey1.metadata ++
                          apikey2.metadata ++
                          Map(
                            "daikoku__metadata" -> mergeMetaValue(
                              "daikoku__metadata",
                              apikey1.metadata,
                              apikey2.metadata),
                            "daikoku__tags" -> mergeMetaValue("daikoku__tags",
                                                              apikey1.metadata,
                                                              apikey2.metadata),
                          ),
                        restrictions = ApiKeyRestrictions(
                          enabled = apikey1.restrictions.enabled && apikey2.restrictions.enabled,
                          allowLast = apikey1.restrictions.allowLast || apikey2.restrictions.allowLast,
                          allowed = apikey1.restrictions.allowed ++ apikey2.restrictions.allowed,
                          forbidden = apikey1.restrictions.forbidden ++ apikey2.restrictions.forbidden,
                          notFound = apikey1.restrictions.notFound ++ apikey2.restrictions.notFound,
                        ),
                        authorizedEntities = AuthorizedEntities(
                          groups = apikey1.authorizedEntities.groups | apikey2.authorizedEntities.groups,
                          services = apikey1.authorizedEntities.services | apikey2.authorizedEntities.services
                        )
                      ))
                    case (Left(_), Right(apikey)) => Right(apikey)
                    case (Right(apikey), Left(_)) => Right(apikey)
                    case (Left(_), Left(_))       => Left(())
                  }
                })))
        } yield {
          if (newApk != apk) {
            client
              .updateApiKey(newApk)(otoroshiSettings)
              .andThen {
                case Success(_) if apk.asOtoroshiApiKey != subscription.apiKey =>
                  logger.info(s"Successfully updated api key: ${apk.clientId} - ${apk.clientName} on ${otoroshiSettings.host}")
                  env.dataStore.apiSubscriptionRepo
                    .forTenant(subscription.tenant)
                    .updateManyByQuery(
                      Json.obj(
                        "_id" -> Json.obj("$in" -> JsArray(
                          (aggregatedSubscriptions :+ subscription)
                            .map(_.id.asJson)))),
                      Json.obj("$set" -> Json.obj(
                        "apiKey" -> newApk.asOtoroshiApiKey.asJson,
                        "tags" -> Some(newApk.tags),
                        "metadata" -> (newApk.metadata.filterNot(i => i._1.startsWith("daikoku_")) -- subscription.customMetadata
                          .flatMap(_.asOpt[Map[String, String]])
                          .getOrElse(Map.empty[String, String]).keys)
                          .view.mapValues(i => JsString(i)).toSeq)
                      ))
                    .flatMap(
                      _ =>
                        env.dataStore.notificationRepo
                          .forTenant(subscription.tenant)
                          .save(Notification(
                            id = NotificationId(BSONObjectID.generate().stringify),
                            tenant = subscription.tenant,
                            team = Some(subscription.team),
                            sender = jobUser,
                            date = DateTime.now(),
                            notificationType = NotificationType.AcceptOnly,
                            status = NotificationStatus.Pending(),
                            action = NotificationAction.ApiKeyRefresh(
                              subscription.id.value,
                              subscription.api.value,
                              subscription.plan.value)
                          )))
                    .map(_ =>
                      JobEvent("subscription desync from otoroshi to daikoku")
                        .logJobEvent(tenant,
                                     jobUser,
                                     Json.obj(
                                       "subscription" -> subscription.id.asJson,
                                     )))
                case Success(_) =>
                  logger.info(
                    s"Successfully updated api key metadata: ${apk.clientId} - ${apk.clientName} on ${otoroshiSettings.host}")
                  env.dataStore.apiSubscriptionRepo
                    .forTenant(subscription.tenant)
                    .updateManyByQuery(
                      Json.obj(
                        "_id" -> Json.obj("$in" -> JsArray(
                          (aggregatedSubscriptions :+ subscription)
                            .map(_.id.asJson)))),
                      Json.obj("$set" -> Json.obj(
                        "tags" -> Some(newApk.tags),
                        "metadata" -> (newApk.metadata.filterNot(i => i._1.startsWith("daikoku_")) -- subscription.customMetadata
                          .flatMap(_.asOpt[Map[String, String]])
                          .getOrElse(Map.empty[String, String]).keys)
                          .view.mapValues(i => JsString(i)).toSeq)
                      ))
                case Failure(e) =>
                  logger.error(
                    s"Error while updating api key metadata: ${apk.clientId} - ${apk.clientName} on ${otoroshiSettings.host}",
                    e)
              }
          } else {
            logger.info(
              s"No need to update api key: ${apk.clientName} on ${otoroshiSettings.host}")
          }
        }
      })
    }
  }

  def checkRotation(query: JsObject = Json.obj("parent" -> JsNull)) = {
    for {
      allSubscriptions <- env.dataStore.apiSubscriptionRepo
        .forAllTenant()
        .findNotDeleted(query)
      //Get just parent sub (childs will be processed after)
      subscriptions <- env.dataStore.apiSubscriptionRepo
        .forAllTenant()
        .findNotDeleted(
          Json.obj(
            "_id" -> Json.obj(
              "$in" -> JsArray(Set
                .from(allSubscriptions.map(s =>
                  s.parent.map(_.asJson).getOrElse(s.id.asJson)))
                .toSeq)),
            "rotation.enabled" -> true
          ))
    } yield {
      subscriptions.map(subscription =>
        for {
          tenant <- EitherT.fromOptionF(
            env.dataStore.tenantRepo.findByIdNotDeleted(subscription.tenant),
            sendErrorNotification(
              NotificationAction.OtoroshiSyncSubscriptionError(
                subscription,
                "Tenant does not exist anymore"),
              subscription.team,
              subscription.tenant)
          )
          tenantAdminTeam <- EitherT.fromOptionF(
            env.dataStore.teamRepo
              .forTenant(tenant)
              .findOne(Json.obj("type" -> "Admin")),
            ())
          api <- EitherT.fromOptionF(
            env.dataStore.apiRepo
              .forAllTenant()
              .findOneNotDeleted(
                Json.obj("_id" -> subscription.api.value, "published" -> true)),
            sendErrorNotification(
              NotificationAction.OtoroshiSyncSubscriptionError(
                subscription,
                "API does not exist anymore"),
              tenantAdminTeam.id,
              subscription.tenant)
          )
          plan <- EitherT.fromOption[Future](
            api.possibleUsagePlans.find(_.id == subscription.plan),
            sendErrorNotification(
              NotificationAction.OtoroshiSyncSubscriptionError(
                subscription,
                "Usage plan does not exist anymore"),
              api.team,
              api.tenant)
          )
          otoroshiTarget <- EitherT.fromOption[Future](
            plan.otoroshiTarget,
            sendErrorNotification(
              NotificationAction.OtoroshiSyncSubscriptionError(
                subscription,
                "No Otoroshi target specified"),
              api.team,
              api.tenant)
          )
          otoroshiSettings <- EitherT.fromOption[Future](
            tenant.otoroshiSettings.find(
              _.id == otoroshiTarget.otoroshiSettings),
            Seq(api.team, tenantAdminTeam.id)
              .map(
                team =>
                  sendErrorNotification(
                    NotificationAction.OtoroshiSyncSubscriptionError(
                      subscription,
                      "Otoroshi settings does not exist anymore"),
                    team,
                    api.tenant))
              .reduce((_, _) => ())
          )
          apk <- EitherT(
            client.getApikey(subscription.apiKey.clientId)(otoroshiSettings))
            .leftMap(e =>
              sendErrorNotification(
                NotificationAction.OtoroshiSyncSubscriptionError(
                  subscription,
                  s"Unable to fetch apikey from otoroshi: ${Json.stringify(
                    AppError.toJson(e))}"),
                api.team,
                api.tenant,
                Some(otoroshiSettings.host)
            ))
        } yield {
          if (!apk.rotation.exists(r => r.enabled)) {
            client.updateApiKey(
              apk.copy(
                rotation = subscription.rotation.map(_.toApiKeyRotation)))(
              otoroshiSettings)
          } else {
            val otoroshiNextSecret: Option[String] =
              apk.rotation.flatMap(_.nextSecret)
            val otoroshiActualSecret: String = apk.clientSecret
            val daikokuActualSecret: String = subscription.apiKey.clientSecret
            val pendingRotation: Boolean =
              subscription.rotation.exists(_.pendingRotation)

            var notification: Option[Notification] = None
            var newSubscription: Option[ApiSubscription] = None

            if (!pendingRotation && otoroshiNextSecret.isDefined && otoroshiActualSecret == daikokuActualSecret) {
              logger.info(
                s"rotation state updated to Pending for ${apk.clientName}")
              newSubscription = subscription
                .copy(rotation = subscription.rotation.map(
                        _.copy(pendingRotation = true)),
                      apiKey = subscription.apiKey.copy(
                        clientSecret = otoroshiNextSecret.get))
                .some
              notification = Notification(
                id = NotificationId(BSONObjectID.generate().stringify),
                tenant = tenant.id,
                team = Some(subscription.team),
                sender = jobUser,
                action = NotificationAction.ApiKeyRotationInProgress(
                  apk.clientId,
                  api.name,
                  plan.customName.getOrElse(plan.typeName)),
                notificationType = NotificationType.AcceptOnly
              ).some

              ApiKeyRotationEvent(subscription = subscription.id)
                .logJobEvent(tenant,
                             jobUser,
                             Json.obj("token" -> subscription.integrationToken))

            } else if (pendingRotation && otoroshiNextSecret.isEmpty) {
              logger.info(
                s"rotation state updated to Ended for ${apk.clientName}")
              notification = Notification(
                id = NotificationId(BSONObjectID.generate().stringify),
                tenant = tenant.id,
                team = Some(subscription.team),
                sender = jobUser,
                action = NotificationAction.ApiKeyRotationEnded(
                  apk.clientId,
                  api.name,
                  plan.customName.getOrElse(plan.typeName)),
                notificationType = NotificationType.AcceptOnly
              ).some
              newSubscription = subscription
                .copy(rotation = subscription.rotation.map(
                        _.copy(pendingRotation = true)),
                      apiKey = subscription.apiKey.copy(
                        clientSecret = otoroshiActualSecret))
                .some

              ApiKeyRotationEvent(subscription = subscription.id)
                .logJobEvent(tenant,
                             jobUser,
                             Json.obj("token" -> subscription.integrationToken))
            }

            (newSubscription, notification) match {
              case (Some(subscription), Some(notification)) =>
                for {
                  _ <- env.dataStore.apiSubscriptionRepo
                    .forTenant(subscription.tenant)
                    .save(subscription)
                  aggSubs <- env.dataStore.apiSubscriptionRepo
                    .forTenant(subscription.tenant)
                    .findNotDeleted(
                      Json.obj("parent" -> subscription.id.asJson))
                  _ <- env.dataStore.apiSubscriptionRepo
                    .forTenant(subscription.tenant)
                    .updateManyByQuery(
                      Json.obj(
                        "_id" -> Json.obj(
                          "$in" -> JsArray(aggSubs.map(_.id.asJson)))),
                      Json.obj(
                        "$set" -> Json.obj(
                          "rotation" -> subscription.rotation
                            .map(ApiSubscriptionyRotationFormat.writes)
                            .getOrElse(JsNull)
                            .as[JsValue]))
                    )
                  _ <- env.dataStore.notificationRepo
                    .forTenant(subscription.tenant)
                    .save(notification)
                } yield ()
              case (_, _) =>
                logger.info(s"no need to update rotation for ${apk.clientName}")
            }
          }
      })
    }
  }

  def verify(query: JsObject = Json.obj()): Future[Unit] = {
    logger.info("Verifying sync between daikoku and otoroshi")
    Future
      .sequence(
        Seq(
          checkRotation(query),
          verifyIfOtoroshiGroupsStillExists(),
          synchronizeApikeys(query),
        ))
      .map(_ => ())
  }
}
