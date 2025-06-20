package jobs

import org.apache.pekko.Done
import org.apache.pekko.actor.Cancellable
import org.apache.pekko.stream.scaladsl.{Sink, Source}
import cats.data.EitherT
import cats.syntax.option._
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
import fr.maif.otoroshi.daikoku.utils._
import fr.maif.otoroshi.daikoku.utils.future.EnhancedObject
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.joda.time.DateTime
import play.api.Logger
import play.api.i18n.MessagesApi
import play.api.libs.json._

import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.duration._
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.util.{Failure, Success}

object LongExtensions {
  implicit class HumanReadableExtension(duration: Long) {
    final def toHumanReadable: String = {
      val units = Seq(
        TimeUnit.DAYS,
        TimeUnit.HOURS,
        TimeUnit.MINUTES,
        TimeUnit.SECONDS,
        TimeUnit.MILLISECONDS
      )

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

class OtoroshiVerifierJob(
    client: OtoroshiClient,
    env: Env,
    translator: Translator,
    messagesApi: MessagesApi
) {

  private val logger = Logger("OtoroshiVerifierJob")
  private val synclogger = Logger("APIkey Synchronizer")

  private val ref = new AtomicReference[Cancellable]()

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env
  implicit val me: MessagesApi = messagesApi
  implicit val tr: Translator = translator

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

  def getListFromMeta(
      key: String,
      metadata: Map[String, String]
  ): Set[String] = {
    metadata
      .get(key)
      .map(_.split('|').toSeq.map(_.trim).toSet)
      .getOrElse(Set.empty)
  }

  def mergeMetaValue(
      key: String,
      meta1: Map[String, String],
      meta2: Map[String, String]
  ): String = {
    val list1 = getListFromMeta(key, meta1)
    val list2 = getListFromMeta(key, meta2)
    (list1 ++ list2).mkString(" | ")
  }

  case class SyncInformation(
      parent: ApiSubscription,
      childs: Seq[ApiSubscription],
      team: Team,
      parentApi: Api,
      apk: ActualOtoroshiApiKey,
      otoroshiSettings: OtoroshiSettings,
      tenant: Tenant,
      tenantAdminTeam: Team
  )

  case class ComputedInformation(
      parent: ApiSubscription,
      childs: Seq[ApiSubscription],
      apk: ActualOtoroshiApiKey,
      computedApk: ActualOtoroshiApiKey,
      otoroshiSettings: OtoroshiSettings,
      tenant: Tenant,
      tenantAdminTeam: Team
  )

  def start(): Unit = {
    if (
      !env.config.otoroshiSyncByCron && env.config.otoroshiSyncMaster && ref
        .get() == null
    ) {
      ref.set(
        env.defaultActorSystem.scheduler
          .scheduleAtFixedRate(10.seconds, env.config.otoroshiSyncInterval) {
            () =>
              verify()
          }
      )
    }
  }

  def stop(): Unit = {
    Option(ref.get()).foreach(_.cancel())
  }

  private def sendErrorNotification(
      err: OtoroshiSyncNotificationAction,
      teamId: TeamId,
      tenantId: TenantId,
      otoHost: Option[String] = None
  ): Unit = {
    env.dataStore.notificationRepo
      .forTenant(tenantId)
      .save(
        Notification(
          id = NotificationId(IdGenerator.token(32)),
          tenant = tenantId,
          team = Some(teamId),
          sender = jobUser.asNotificationSender,
          date = DateTime.now(),
          notificationType = NotificationType.AcceptOnly,
          status = NotificationStatus.Pending(),
          action = err.asInstanceOf[NotificationAction]
        )
      )
    env.dataStore.tenantRepo.findByIdNotDeleted(tenantId).andThen {
      case Success(Some(tenant)) =>
        JobEvent(err.message).logJobEvent(
          tenant,
          jobUser,
          err match {
            case e: OtoroshiSyncSubscriptionError =>
              Json.obj(
                "subscription" -> e.subscription.asJson,
                "team" -> teamId.value,
                "tenant" -> tenantId.value
              )
            case e: OtoroshiSyncApiError =>
              Json.obj(
                "api" -> e.api.asJson,
                "team" -> teamId.value,
                "tenant" -> tenantId.value
              )
          }
        )
    }
    env.dataStore.userRepo
      .findAllNotDeleted()
      .map(_.filter(_.isDaikokuAdmin))
      .map { users =>
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
            )
          )
          .map { tenants =>
            tenants.find { t =>
              t.mailerSettings.isDefined && t.mailerSettings.get.mailerType != "console"
            } match {
              case None =>
                sendMail(
                  new ConsoleMailer(ConsoleMailerSettings()),
                  tenants.head
                )
              case Some(tenant) => sendMail(tenant.mailer(env), tenant)
            }
          }
      }
  }

  private def computeAPIKey(
      infos: SyncInformation
  ): Future[ComputedInformation] = {
    (infos.childs :+ infos.parent)
      .map(subscription => {
        for {
          api <- EitherT.fromOptionF(
            env.dataStore.apiRepo
              .forAllTenant()
              .findOneNotDeleted(
                Json.obj(
                  "_id" -> subscription.api.value
//                  "state" -> ApiState.publishedJsonFilter
                )
              ),
            sendErrorNotification(
              NotificationAction.OtoroshiSyncSubscriptionError(
                subscription,
                "API does not exist anymore"
              ),
              infos.tenantAdminTeam.id,
              infos.tenant.id
            )
          )
          plan <- EitherT.fromOptionF[Future, Unit, UsagePlan](
            env.dataStore.usagePlanRepo
              .forTenant(infos.tenant)
              .findById(subscription.plan),
            sendErrorNotification(
              NotificationAction.OtoroshiSyncSubscriptionError(
                subscription,
                "Usage plan does not exist anymore"
              ),
              api.team,
              infos.tenant.id
            )
          )
          user <-
            EitherT
              .fromOptionF(
                env.dataStore.userRepo.findById(subscription.by),
                ()
              )
        } yield {
          val ctx: Map[String, String] = Map(
            "user.id" -> user.id.value,
            "user.name" -> user.name,
            "user.email" -> user.email,
            "api.id" -> infos.parent.api.value,
            "api.name" -> infos.parentApi.name,
            "team.id" -> infos.parent.team.value,
            "team.name" -> infos.team.name,
            "tenant.id" -> infos.tenant.id.value,
            "tenant.name" -> infos.tenant.name,
            "client.id" -> infos.apk.clientId,
            "client.name" -> infos.apk.clientName
          ) ++ infos.team.metadata
            .map(t => ("team.metadata." + t._1, t._2)) ++
            user.metadata.map(t => ("user.metadata." + t._1, t._2))

          // ********************
          // process new tags
          // ********************
          val planTags = plan.otoroshiTarget
            .flatMap(_.apikeyCustomization.tags.asOpt[Set[String]])
            .getOrElse(Set.empty[String])

          val tagsFromDk =
            getListFromMeta("daikoku__tags", infos.apk.metadata)
          val newTagsFromDk =
            planTags.map(OtoroshiTarget.processValue(_, ctx))

          //todo: unnecessary ??
          //val newTags: Set[String] = apk.tags.diff(tagsFromDk) ++ newTagsFromDk

          // ********************
          // process new metadata
          // ********************
          val planMeta = plan.otoroshiTarget
            .map(_.apikeyCustomization.metadata.as[Map[String, String]])
            .getOrElse(Map.empty[String, String])

          val metaFromDk = infos.apk.metadata
            .get("daikoku__metadata")
            .map(
              _.split('|').toSeq
                .map(_.trim)
                .map(key => key -> infos.apk.metadata.get(key).orNull)
            )
            .getOrElse(planMeta.map {
              case (a, b) =>
                a -> OtoroshiTarget.processValue(b, ctx)
            })
            .toMap

          val customMetaFromSub = subscription.customMetadata
            .flatMap(_.asOpt[Map[String, String]])
            .getOrElse(Map.empty[String, String])

          val newMetaFromDk = (planMeta ++ customMetaFromSub).map {
            case (a, b) => a -> OtoroshiTarget.processValue(b, ctx)
          }
          val newMeta = infos.apk.metadata
            .removedAll(metaFromDk.keys) ++ newMetaFromDk ++ Map(
            "daikoku__metadata" -> newMetaFromDk.keys
              .mkString(" | "),
            "daikoku__tags" -> newTagsFromDk.mkString(" | ")
          )

          // ********************
          // process new metadata
          // ********************

          infos.apk.copy(
            tags = newTagsFromDk,
            metadata = newMeta,
            constrainedServicesOnly = plan.otoroshiTarget
              .exists(_.apikeyCustomization.constrainedServicesOnly),
            allowClientIdOnly =
              plan.otoroshiTarget.exists(_.apikeyCustomization.clientIdOnly),
            restrictions = plan.otoroshiTarget
              .map(_.apikeyCustomization.restrictions)
              .getOrElse(ApiKeyRestrictions()),
            throttlingQuota = subscription.customMaxPerSecond
              .orElse(plan.maxPerSecond)
              .getOrElse(infos.apk.throttlingQuota),
            dailyQuota = subscription.customMaxPerDay
              .orElse(plan.maxPerDay)
              .getOrElse(infos.apk.dailyQuota),
            monthlyQuota = subscription.customMaxPerMonth
              .orElse(plan.maxPerMonth)
              .getOrElse(infos.apk.monthlyQuota),
            authorizedEntities = plan.otoroshiTarget
              .flatMap(_.authorizedEntities)
              .getOrElse(AuthorizedEntities()),
            readOnly = subscription.customReadOnly
              .orElse(
                plan.otoroshiTarget
                  .map(_.apikeyCustomization.readOnly)
              )
              .getOrElse(infos.apk.readOnly),
            validUntil = subscription.validUntil
              .map(_.getMillis),
            rotation = infos.apk.rotation
              .map(r =>
                r.copy(enabled =
                  r.enabled || subscription.rotation
                    .exists(_.enabled) || plan.autoRotation
                    .exists(e => e)
                )
              )
              .orElse(
                subscription.rotation.map(r =>
                  ApiKeyRotation(
                    enabled =
                      r.enabled || plan.autoRotation.exists(e => e),
                    rotationEvery = r.rotationEvery,
                    gracePeriod = r.gracePeriod
                  )
                )
              )
              .orElse(
                plan.autoRotation
                  .map(enabled => ApiKeyRotation(enabled = enabled))
              )
          )

        }
      })
      .foldLeft(
        infos.apk
          .copy(
            authorizedEntities = AuthorizedEntities(),
            tags = Set.empty,
            metadata = Map.empty,
            restrictions = ApiKeyRestrictions()
          )
          .future
      )((_apikey1, either) => {
        either.value.flatMap {
          case Left(_) => _apikey1
          case Right(apikey2) =>
            _apikey1.map(apikey1 =>
              apikey1.copy(
                tags = apikey1.tags ++ apikey2.tags,
                metadata = apikey1.metadata ++
                  apikey2.metadata ++
                  Map(
                    "daikoku__metadata" -> mergeMetaValue(
                      "daikoku__metadata",
                      apikey1.metadata,
                      apikey2.metadata
                    ),
                    "daikoku__tags" -> mergeMetaValue(
                      "daikoku__tags",
                      apikey1.metadata,
                      apikey2.metadata
                    )
                  ),
                restrictions = ApiKeyRestrictions(
                  enabled =
                    apikey1.restrictions.enabled || apikey2.restrictions.enabled,
                  allowLast =
                    apikey1.restrictions.allowLast || apikey2.restrictions.allowLast,
                  allowed =
                    apikey1.restrictions.allowed ++ apikey2.restrictions.allowed,
                  forbidden =
                    apikey1.restrictions.forbidden ++ apikey2.restrictions.forbidden,
                  notFound =
                    apikey1.restrictions.notFound ++ apikey2.restrictions.notFound
                ),
                authorizedEntities = AuthorizedEntities(
                  groups =
                    apikey1.authorizedEntities.groups | apikey2.authorizedEntities.groups,
                  services =
                    apikey1.authorizedEntities.services | apikey2.authorizedEntities.services,
                  routes =
                    apikey1.authorizedEntities.routes | apikey2.authorizedEntities.routes
                )
              )
            )
        }
      })
      .map(computedApk => {
        ComputedInformation(
          parent = infos.parent,
          childs = infos.childs,
          apk = infos.apk,
          computedApk = computedApk,
          otoroshiSettings = infos.otoroshiSettings,
          tenant = infos.tenant,
          tenantAdminTeam = infos.tenantAdminTeam
        )
      })

  }

  private def updateOtoroshiApk(infos: ComputedInformation): Future[Unit] = {
    if (infos.apk != infos.computedApk) {
      client
        .updateApiKey(infos.computedApk)(infos.otoroshiSettings)
        .map {
          case Right(_) if infos.apk.asOtoroshiApiKey != infos.parent.apiKey =>
            synclogger.info(
              s"Successfully updated api key: ${infos.apk.clientId} - ${infos.apk.clientName} on ${infos.otoroshiSettings.host}"
            )
            env.dataStore.apiSubscriptionRepo
              .forTenant(infos.tenant)
              .updateManyByQuery(
                Json.obj(
                  "_id" -> Json.obj(
                    "$in" -> JsArray(
                      (infos.childs :+ infos.parent)
                        .map(_.id.asJson)
                    )
                  )
                ),
                Json.obj(
                  "$set" -> Json.obj(
                    "apiKey" -> infos.computedApk.asOtoroshiApiKey.asJson,
                    "tags" -> Some(infos.computedApk.tags),
                    "metadata" -> (infos.computedApk.metadata.filterNot(i =>
                      i._1.startsWith("daikoku_")
                    ) -- infos.parent.customMetadata //FIXME: je penses que ca n'enleve que les customMetadata de la parent
                      .flatMap(_.asOpt[Map[String, String]])
                      .getOrElse(Map.empty[String, String])
                      .keys).view.mapValues(i => JsString(i)).toSeq
                  )
                )
              )
              .flatMap(_ =>
                env.dataStore.notificationRepo
                  .forTenant(infos.tenant)
                  .save(
                    Notification(
                      id = NotificationId(IdGenerator.token(32)),
                      tenant = infos.parent.tenant,
                      team = Some(infos.parent.team),
                      sender = jobUser.asNotificationSender,
                      date = DateTime.now(),
                      notificationType = NotificationType.AcceptOnly,
                      status = NotificationStatus.Pending(),
                      action = NotificationAction.ApiKeyRefresh(
                        infos.parent.id.value,
                        infos.parent.api.value,
                        infos.parent.plan.value
                      )
                    )
                  )
              )
              .map(_ =>
                JobEvent("subscription desync from otoroshi to daikoku")
                  .logJobEvent(
                    infos.tenant,
                    jobUser,
                    Json.obj(
                      "subscription" -> infos.parent.id.asJson
                    )
                  )
              )
          case Right(_) =>
            synclogger.info(
              s"Successfully updated api key metadata: ${infos.apk.clientId} - ${infos.apk.clientName} on ${infos.otoroshiSettings.host}"
            )
            env.dataStore.apiSubscriptionRepo
              .forTenant(infos.tenant)
              .updateManyByQuery(
                Json.obj(
                  "_id" -> Json.obj(
                    "$in" -> JsArray(
                      (infos.childs :+ infos.parent)
                        .map(_.id.asJson)
                    )
                  )
                ),
                Json.obj(
                  "$set" -> Json.obj(
                    "tags" -> Some(infos.computedApk.tags),
                    "metadata" -> (infos.computedApk.metadata.filterNot(i =>
                      i._1.startsWith("daikoku_")
                    ) -- infos.parent.customMetadata
                      .flatMap(_.asOpt[Map[String, String]])
                      .getOrElse(Map.empty[String, String])
                      .keys).view.mapValues(i => JsString(i)).toSeq
                  )
                )
              )
          case Left(e) =>
            synclogger.error(
              s"Error while updating api key metadata: ${infos.apk.clientId} - ${infos.apk.clientName} on ${infos.otoroshiSettings.host}"
            )
            synclogger.error(e.getErrorMessage())
        }
    } else {
      FastFuture.successful(
        synclogger.info(
          s"No need to update api key: ${infos.apk.clientName} on ${infos.otoroshiSettings.host}"
        )
      )
    }
  }

  private def verifyIfOtoroshiGroupsStillExists(
      query: JsObject = Json.obj()
  ): Future[Done] = {
    def checkEntities(
        entities: AuthorizedEntities,
        otoroshi: OtoroshiSettings,
        api: Api
    ): Future[Unit] = {
      Future
        .sequence(
          entities.groups.map(group =>
            client
              .getServiceGroup(group.value)(otoroshi)
              .map(_ => ())
              .andThen {
                case Failure(_) =>
                  AppLogger.error(
                    s"Unable to fetch service group $group from otoroshi. Maybe it doesn't exists anymore"
                  )
                  sendErrorNotification(
                    NotificationAction.OtoroshiSyncApiError(
                      api,
                      s"Unable to fetch service group $group from otoroshi. Maybe it doesn't exists anymore"
                    ),
                    api.team,
                    api.tenant
                  )
              }
          ) ++
            entities.services.map(service =>
              client
                .getServices()(otoroshi)
                .andThen {
                  case Failure(_) =>
                    AppLogger.error(
                      s"Unable to fetch service $service from otoroshi. Maybe it doesn't exists anymore"
                    )
                    sendErrorNotification(
                      NotificationAction.OtoroshiSyncApiError(
                        api,
                        s"Unable to fetch service $service from otoroshi. Maybe it doesn't exists anymore"
                      ),
                      api.team,
                      api.tenant
                    )
                }
            ) ++
            entities.routes.map(route =>
              client
                .getRoutes()(otoroshi)
                .andThen {
                  case Failure(_) =>
                    AppLogger.error(
                      s"Unable to fetch route $route from otoroshi. Maybe it doesn't exists anymore"
                    )
                    sendErrorNotification(
                      NotificationAction.OtoroshiSyncApiError(
                        api,
                        s"Unable to fetch route $route from otoroshi. Maybe it doesn't exists anymore"
                      ),
                      api.team,
                      api.tenant
                    )
                }
            )
        )
        .map(_ => ())
    }

    logger.info("Verifying if otoroshi groups still exists")
    val par = 10
    env.dataStore.apiRepo
      .forAllTenant()
      .streamAllRawFormatted(Json.obj("_deleted" -> false) ++ query)
      .mapAsync(par)(api =>
        env.dataStore.tenantRepo
          .findByIdNotDeleted(api.tenant)
          .map(tenant => (tenant, api))
      )
      .mapAsync(5) {
        case (tenant, api) =>
          env.dataStore.usagePlanRepo
            .findByApi(api.tenant, api)
            .map(plans => (tenant, api, plans))
      }
      .collect {
        case (Some(tenant), api, plans) => (tenant, api, plans)
      }
      .flatMapConcat {
        case (tenant, api, plans) =>
          Source(plans.map(plan => (tenant, api, plan)))
      }
      .map {
        case (tenant, api, plan) =>
          (
            tenant,
            api,
            plan,
            tenant.otoroshiSettings.find(os =>
              plan.otoroshiTarget.exists(ot => ot.otoroshiSettings == os.id)
            )
          )
      }
      .collect {
        case (tenant, api, plan, Some(settings))
            if plan.otoroshiTarget.exists(
              _.authorizedEntities.exists(!_.isEmpty)
            ) =>
          (tenant, api, plan, settings)
      }
      .mapAsync(par) {
        case (_, api, plan, settings) =>
          checkEntities(
            plan.otoroshiTarget.get.authorizedEntities.get,
            settings,
            api
          )
      }
      .runWith(Sink.ignore)(env.defaultMaterializer)
  }

  /**
    * get subs base on query (by defaut all parent or unique keys)
    * get really parent subs (in case of query as a pointer to childs)
    * for each subs get aggregated key, get the oto key...process new key
    * daikoku is the truth for everything except the oto key (clientName, clientId, clientSecret)
    * tags and metadata unknown by DK are merged
    * save the new key in oto and the new secret in DK
    *
    * @param query to find some subscriptions and sync its
    * @return just future of Unit
    */

  private def synchronizeApikeys(
      query: JsObject = Json.obj("parent" -> JsNull)
  ): Future[Done] = {
    import cats.implicits._

    val r = for {
      //Get all "base" subscriptions from provided query
      allSubscriptions <- EitherT.liftF[Future, AppError, Seq[ApiSubscription]](
        env.dataStore.apiSubscriptionRepo
          .forAllTenant()
          .findNotDeleted(query)
      )
      //Get admin API
      adminApi <- EitherT.fromOptionF[Future, AppError, Api](
        env.dataStore.apiRepo
          .forAllTenant()
          .findOne(Json.obj("visibility" -> ApiVisibility.AdminOnly.name)),
        AppError.EntityNotFound("Admin API")
      )
      //Get all Parent subscriptions based on allSubscription filtering all adminAPI subs
      subscriptions <- EitherT.liftF[Future, AppError, Seq[ApiSubscription]](
        env.dataStore.apiSubscriptionRepo
          .forAllTenant()
          .findNotDeleted(
            Json.obj(
              "_id" -> Json.obj(
                "$in" -> JsArray(
                  Set
                    .from(
                      allSubscriptions
                        .map(s => s.parent.map(_.asJson).getOrElse(s.id.asJson))
                    )
                    .toSeq
                )
              )
            )
          )
          .map(
            _.filterNot(sub => adminApi.possibleUsagePlans.contains(sub.plan))
          )
      )
    } yield subscriptions

    val _allParentSubscriptions = r
      .leftMap(e => {
        synclogger.error(e.getErrorMessage())
        Seq.empty[ApiSubscription]
      })
      .merge

    Source
      .futureSource(_allParentSubscriptions.map(Source(_)))
      .mapAsync(1)(subscription => {

        val either =
          for {
            childs <- EitherT.liftF(
              env.dataStore.apiSubscriptionRepo
                .forAllTenant()
                .findNotDeleted(Json.obj("parent" -> subscription.id.asJson))
            )

            //get tenant
            tenant <- EitherT.fromOptionF(
              env.dataStore.tenantRepo.findByIdNotDeleted(subscription.tenant),
              sendErrorNotification(
                NotificationAction.OtoroshiSyncSubscriptionError(
                  subscription,
                  "Tenant does not exist anymore"
                ),
                subscription.team, //todo: to super admins ???
                subscription.tenant
              )
            )
            //get tenant team admin
            tenantAdminTeam <- EitherT.fromOptionF(
              env.dataStore.teamRepo
                .forTenant(tenant)
                .findOne(Json.obj("type" -> "Admin")),
              () //todo: send mail or log error
            )

            //GET parent API
            parentApi <- EitherT.fromOptionF(
              env.dataStore.apiRepo
                .forAllTenant()
                .findOneNotDeleted(
                  Json.obj(
                    "_id" -> subscription.api.value
//                    "state" -> ApiState.publishedJsonFilter
                  )
                ),
              sendErrorNotification(
                NotificationAction.OtoroshiSyncSubscriptionError(
                  subscription,
                  "API does not exist anymore"
                ),
                tenantAdminTeam.id,
                subscription.tenant
              )
            )

            //Get parent plan
            plan <- EitherT.fromOptionF[Future, Unit, UsagePlan](
              env.dataStore.usagePlanRepo
                .forTenant(tenant)
                .findById(subscription.plan),
              sendErrorNotification(
                NotificationAction.OtoroshiSyncSubscriptionError(
                  subscription,
                  "Usage plan does not exist anymore"
                ),
                parentApi.team,
                parentApi.tenant
              )
            )

            //get ototoshi target from parent plan
            otoroshiTarget <- EitherT.fromOption[Future](
              plan.otoroshiTarget,
              sendErrorNotification(
                NotificationAction.OtoroshiSyncSubscriptionError(
                  subscription,
                  "No Otoroshi target specified"
                ),
                parentApi.team,
                parentApi.tenant
              )
            )

            //get otoroshi settings from parent plan
            otoroshiSettings <- EitherT.fromOption[Future](
              tenant.otoroshiSettings
                .find(_.id == otoroshiTarget.otoroshiSettings),
              Seq(parentApi.team, tenantAdminTeam.id)
                .map(team =>
                  sendErrorNotification(
                    NotificationAction.OtoroshiSyncSubscriptionError(
                      subscription,
                      "Otoroshi settings does not exist anymore"
                    ),
                    team,
                    parentApi.tenant
                  )
                )
                .reduce((_, _) => ())
            )

            // get previous apikey from otoroshi
            apk <- EitherT(
              client.getApikey(subscription.apiKey.clientId)(otoroshiSettings)
            ).leftMap(e =>
              sendErrorNotification(
                NotificationAction.OtoroshiSyncSubscriptionError(
                  subscription,
                  s"Unable to fetch apikey from otoroshi: ${Json
                    .stringify(AppError.toJson(e))}"
                ),
                parentApi.team,
                parentApi.tenant,
                Some(otoroshiSettings.host)
              )
            )

            // get subscription team
            team <- EitherT.fromOptionF(
              env.dataStore.teamRepo
                .forTenant(tenant)
                .findById(subscription.team),
              ()
            )
          } yield {
            SyncInformation(
              parent = subscription,
              childs = childs,
              apk = apk,
              otoroshiSettings = otoroshiSettings,
              tenant = tenant,
              team = team,
              parentApi = parentApi,
              tenantAdminTeam = tenantAdminTeam
            )
          }

        either.value
      })
      .mapAsync(1) {
        case Left(_) => FastFuture.successful(None) //do nothing
        case Right(informations) =>
          computeAPIKey(informations).map(_.some) //Future[Option[apk]]
      }
      .mapAsync(1) {
        case Some(computedInfos) => updateOtoroshiApk(computedInfos)
        case None                => FastFuture.successful(())
      }
      .runWith(Sink.ignore)(env.defaultMaterializer)

  }

  def checkRotation(query: JsObject = Json.obj("parent" -> JsNull)) = {
    for {
      allSubscriptions <-
        env.dataStore.apiSubscriptionRepo
          .forAllTenant()
          .findNotDeleted(query)
      //Get just parent sub (childs will be processed after)
      subscriptions <-
        env.dataStore.apiSubscriptionRepo
          .forAllTenant()
          .findNotDeleted(
            Json.obj(
              "_id" -> Json.obj(
                "$in" -> JsArray(
                  Set
                    .from(
                      allSubscriptions
                        .map(s => s.parent.map(_.asJson).getOrElse(s.id.asJson))
                    )
                    .toSeq
                )
              ),
              "rotation.enabled" -> true
            )
          )
    } yield {
      subscriptions.map(subscription =>
        for {
          tenant <- EitherT.fromOptionF(
            env.dataStore.tenantRepo.findByIdNotDeleted(subscription.tenant),
            sendErrorNotification(
              NotificationAction.OtoroshiSyncSubscriptionError(
                subscription,
                "Tenant does not exist anymore"
              ),
              subscription.team,
              subscription.tenant
            )
          )
          tenantAdminTeam <- EitherT.fromOptionF(
            env.dataStore.teamRepo
              .forTenant(tenant)
              .findOne(Json.obj("type" -> "Admin")),
            ()
          )
          api <- EitherT.fromOptionF(
            env.dataStore.apiRepo
              .forAllTenant()
              .findOneNotDeleted(
                Json.obj(
                  "_id" -> subscription.api.value
//                  "state" -> ApiState.publishedJsonFilter
                )
              ),
            sendErrorNotification(
              NotificationAction.OtoroshiSyncSubscriptionError(
                subscription,
                "API does not exist anymore"
              ),
              tenantAdminTeam.id,
              subscription.tenant
            )
          )
          plan <- EitherT.fromOptionF[Future, Unit, UsagePlan](
            env.dataStore.usagePlanRepo
              .forTenant(tenant)
              .findById(subscription.plan),
            sendErrorNotification(
              NotificationAction.OtoroshiSyncSubscriptionError(
                subscription,
                "Usage plan does not exist anymore"
              ),
              api.team,
              api.tenant
            )
          )
          otoroshiTarget <- EitherT.fromOption[Future](
            plan.otoroshiTarget,
            sendErrorNotification(
              NotificationAction.OtoroshiSyncSubscriptionError(
                subscription,
                "No Otoroshi target specified"
              ),
              api.team,
              api.tenant
            )
          )
          otoroshiSettings <- EitherT.fromOption[Future](
            tenant.otoroshiSettings
              .find(_.id == otoroshiTarget.otoroshiSettings),
            Seq(api.team, tenantAdminTeam.id)
              .map(team =>
                sendErrorNotification(
                  NotificationAction.OtoroshiSyncSubscriptionError(
                    subscription,
                    "Otoroshi settings does not exist anymore"
                  ),
                  team,
                  api.tenant
                )
              )
              .reduce((_, _) => ())
          )
          apk <- EitherT(
            client.getApikey(subscription.apiKey.clientId)(otoroshiSettings)
          ).leftMap(e =>
            sendErrorNotification(
              NotificationAction.OtoroshiSyncSubscriptionError(
                subscription,
                s"Unable to fetch apikey from otoroshi: ${Json
                  .stringify(AppError.toJson(e))}"
              ),
              api.team,
              api.tenant,
              Some(otoroshiSettings.host)
            )
          )
        } yield {
          if (!apk.rotation.exists(r => r.enabled)) {
            client.updateApiKey(
              apk.copy(rotation = subscription.rotation.map(_.toApiKeyRotation))
            )(otoroshiSettings)
          } else {
            val otoroshiNextSecret: Option[String] =
              apk.rotation.flatMap(_.nextSecret)
            val otoroshiActualSecret: String = apk.clientSecret
            val daikokuActualSecret: String = subscription.apiKey.clientSecret
            val pendingRotation: Boolean =
              subscription.rotation.exists(_.pendingRotation)

            var notification: Option[Notification] = None
            var newSubscription: Option[ApiSubscription] = None

            if (
              !pendingRotation && otoroshiNextSecret.isDefined && otoroshiActualSecret == daikokuActualSecret
            ) {
              logger.info(
                s"rotation state updated to Pending for ${apk.clientName}"
              )
              newSubscription = subscription
                .copy(
                  rotation =
                    subscription.rotation.map(_.copy(pendingRotation = true)),
                  apiKey = subscription.apiKey
                    .copy(clientSecret = otoroshiNextSecret.get)
                )
                .some
              notification = Notification(
                id = NotificationId(IdGenerator.token(32)),
                tenant = tenant.id,
                team = Some(subscription.team),
                sender = jobUser.asNotificationSender,
                action = NotificationAction.ApiKeyRotationInProgress(
                  apk.clientId,
                  api.id.value,
                  plan.id.value
                ),
                notificationType = NotificationType.AcceptOnly
              ).some

              ApiKeyRotationEvent(subscription = subscription.id)
                .logJobEvent(
                  tenant,
                  jobUser,
                  Json.obj("token" -> subscription.integrationToken)
                )

            } else if (pendingRotation && otoroshiNextSecret.isEmpty) {
              logger.info(
                s"rotation state updated to Ended for ${apk.clientName}"
              )
              notification = Notification(
                id = NotificationId(IdGenerator.token(32)),
                tenant = tenant.id,
                team = Some(subscription.team),
                sender = jobUser.asNotificationSender,
                action = NotificationAction.ApiKeyRotationEnded(
                  apk.clientId,
                  api.name,
                  plan.customName
                ),
                notificationType = NotificationType.AcceptOnly
              ).some
              newSubscription = subscription
                .copy(
                  rotation =
                    subscription.rotation.map(_.copy(pendingRotation = true)),
                  apiKey = subscription.apiKey
                    .copy(clientSecret = otoroshiActualSecret)
                )
                .some

              ApiKeyRotationEvent(subscription = subscription.id)
                .logJobEvent(
                  tenant,
                  jobUser,
                  Json.obj("token" -> subscription.integrationToken)
                )
            }

            (newSubscription, notification) match {
              case (Some(subscription), Some(notification)) =>
                for {
                  _ <-
                    env.dataStore.apiSubscriptionRepo
                      .forTenant(subscription.tenant)
                      .save(subscription)
                  aggSubs <-
                    env.dataStore.apiSubscriptionRepo
                      .forTenant(subscription.tenant)
                      .findNotDeleted(
                        Json.obj("parent" -> subscription.id.asJson)
                      )
                  _ <-
                    env.dataStore.apiSubscriptionRepo
                      .forTenant(subscription.tenant)
                      .updateManyByQuery(
                        Json.obj(
                          "_id" -> Json
                            .obj("$in" -> JsArray(aggSubs.map(_.id.asJson)))
                        ),
                        Json.obj(
                          "$set" -> Json.obj(
                            "rotation" -> subscription.rotation
                              .map(ApiSubscriptionyRotationFormat.writes)
                              .getOrElse(JsNull)
                              .as[JsValue]
                          )
                        )
                      )
                  _ <-
                    env.dataStore.notificationRepo
                      .forTenant(subscription.tenant)
                      .save(notification)
                } yield ()
              case (_, _) =>
                logger.info(s"no need to update rotation for ${apk.clientName}")
            }
          }
        }
      )
    }
  }

  def verify(query: JsObject = Json.obj()): Future[Unit] = {
    logger.info("Verifying sync between daikoku and otoroshi")

    Future
      .sequence(
        Seq(
          checkRotation(query),
          verifyIfOtoroshiGroupsStillExists(),
          synchronizeApikeys(query)
        )
      )
      .map(_ => logger.info("Sync verification ended"))
  }
}
