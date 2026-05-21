package fr.maif.daikoku.jobs

import cats.data.EitherT
import cats.implicits.*
import cats.syntax.option.*
import cron4s._
import cron4s.lib.joda._
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.domain.json.{
  ApiSubscriptionyRotationFormat,
  OtoroshiApiKeyFormat,
  OtoroshiTargetFormat,
  TeamFormat
}
import fr.maif.daikoku.domain.NotificationAction.{
  OtoroshiSyncApiError,
  OtoroshiSyncSubscriptionError
}
import fr.maif.daikoku.audit.{ApiKeyRotationEvent, JobEvent}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.storage.drivers.postgres.{
  Col,
  ColJson,
  ColJsonArray,
  PostgresDataStore
}
import fr.maif.daikoku.utils.*
import fr.maif.daikoku.utils.future.EnhancedObject
import org.apache.pekko.Done
import org.apache.pekko.actor.Cancellable
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.Sink
import org.joda.time.DateTime
import play.api.Logger
import play.api.i18n.MessagesApi
import play.api.libs.json.*

import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.duration.*
import scala.concurrent.{ExecutionContext, Future}

case class SyncAllSubscription()

sealed trait SyncMode
object SyncMode {
  case object Sync extends SyncMode
  case object Delete extends SyncMode
}

case class SyncApiSubscriptionContext(
    subscription: ApiSubscription,
    api: Api,
    usagePlan: UsagePlan,
    by: User
)

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

      val timeStrings =
        units
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

case class ApiForSync(id: ApiId, name: String, metadata: Map[String, String])
object ApiForSync {
  def readFromJson(json: JsValue): ApiForSync = ApiForSync(
    id = ApiId((json \ "_id").as[String]),
    name = (json \ "name").as[String],
    metadata =
      (json \ "metadata").asOpt[Map[String, String]].getOrElse(Map.empty)
  )
}

case class UserForSync(
    id: UserId,
    name: String,
    email: String,
    metadata: Map[String, String]
)
object UserForSync {
  def readFromJson(json: JsValue): UserForSync = UserForSync(
    id = UserId((json \ "_id").asOpt[String].getOrElse("unknown")),
    name = (json \ "name").asOpt[String].getOrElse("deleted user"),
    email = (json \ "email").asOpt[String].getOrElse(""),
    metadata =
      (json \ "metadata").asOpt[Map[String, String]].getOrElse(Map.empty)
  )
}

case class SubscriptionForSync(
    apiKey: OtoroshiApiKey,
    customMetadata: Option[JsObject],
    metadata: Option[JsObject],
    enabled: Boolean,
    rotation: Option[ApiSubscriptionRotation],
    validUntil: Option[DateTime],
    customMaxPerSecond: Option[Long],
    customMaxPerDay: Option[Long],
    customMaxPerMonth: Option[Long],
    customReadOnly: Option[Boolean]
)
object SubscriptionForSync {
  def readFromJson(json: JsValue): SubscriptionForSync = SubscriptionForSync(
    apiKey = (json \ "apiKey").as(using OtoroshiApiKeyFormat),
    customMetadata = (json \ "customMetadata").asOpt[JsObject],
    metadata = (json \ "metadata").asOpt[JsObject],
    enabled = (json \ "enabled").asOpt[Boolean].getOrElse(true),
    rotation = (json \ "rotation").asOpt(using ApiSubscriptionyRotationFormat),
    validUntil = (json \ "validUntil").asOpt[Long].map(l => new DateTime(l)),
    customMaxPerSecond = (json \ "customMaxPerSecond").asOpt[Long],
    customMaxPerDay = (json \ "customMaxPerDay").asOpt[Long],
    customMaxPerMonth = (json \ "customMaxPerMonth").asOpt[Long],
    customReadOnly = (json \ "customReadOnly").asOpt[Boolean]
  )
}

case class PlanForSync(
    id: UsagePlanId,
    customName: String,
    otoroshiTarget: Option[OtoroshiTarget],
    maxPerSecond: Option[Long],
    maxPerDay: Option[Long],
    maxPerMonth: Option[Long],
    autoRotation: Option[Boolean],
    metadata: Map[String, String]
)
object PlanForSync {
  def readFromJson(json: JsValue): PlanForSync = PlanForSync(
    id = UsagePlanId((json \ "_id").as[String]),
    customName = (json \ "customName").asOpt[String].getOrElse(""),
    otoroshiTarget =
      (json \ "otoroshiTarget").asOpt(using OtoroshiTargetFormat),
    maxPerSecond = (json \ "maxPerSecond").asOpt[Long],
    maxPerDay = (json \ "maxPerDay").asOpt[Long],
    maxPerMonth = (json \ "maxPerMonth").asOpt[Long],
    autoRotation = (json \ "autoRotation").asOpt[Boolean],
    metadata =
      (json \ "metadata").asOpt[Map[String, String]].getOrElse(Map.empty)
  )
}

case class Child(
    subscription: SubscriptionForSync,
    api: ApiForSync,
    user: UserForSync,
    plan: PlanForSync
) {

//  private def metadataObjectToMap(
//      obj: Map[String, JsValue]
//  ): Map[String, String] = {
//    obj.map {
//      case (k, JsString(v))  => k -> v
//      case (k, JsBoolean(v)) => k -> v.toString
//      case (k, JsNumber(v))  => k -> v.toString
//      case (k, JsNull)       => k -> ""
//      case (k, v)            => k -> Json.stringify(v)
//    }
//  }

  def getContext(team: Team, tenant: Tenant): Map[String, String] = Map(
    "user.id" -> user.id.value,
    "user.name" -> user.name,
    "user.email" -> user.email,
    "api.id" -> api.id.value,
    "api.name" -> api.name,
    "plan.id" -> plan.id.value,
    "plan.name" -> plan.customName,
    "team.id" -> team.id.value,
    "team.name" -> team.name,
    "tenant.id" -> tenant.id.value,
    "tenant.name" -> tenant.name,
    "client.id" -> subscription.apiKey.clientId,
    "client.name" -> subscription.apiKey.clientName
  ) ++
    team.metadata.map(t => ("team.metadata." + t._1, t._2)) ++
    user.metadata.map(t => ("user.metadata." + t._1, t._2)) ++
    plan.metadata.map(t => ("plan.metadata." + t._1, t._2)) ++
    api.metadata.map(t => ("api.metadata." + t._1, t._2))

  def computeTags(team: Team, tenant: Tenant): Set[String] = {
    val planTags = plan.otoroshiTarget
      .flatMap(_.apikeyCustomization.tags.asOpt[Set[String]])
      .getOrElse(Set.empty[String])

    planTags.map(OtoroshiTarget.processValue(_, getContext(team, tenant)))
  }

  def computeMetadata(team: Team, tenant: Tenant): Map[String, String] = {
    val planMeta = metadataObjectToMap(
      plan.otoroshiTarget
        .flatMap(
          _.apikeyCustomization.metadata.asOpt[Map[String, JsValue]]
        )
        .getOrElse(Map.empty[String, JsValue])
    )

    val customMetaFromSub = metadataObjectToMap(
      subscription.customMetadata
        .flatMap(_.asOpt[Map[String, JsValue]])
        .getOrElse(Map.empty[String, JsValue])
    )

    val metadataFromSub = metadataObjectToMap(
      subscription.metadata
        .flatMap(_.asOpt[Map[String, JsValue]])
        .getOrElse(Map.empty[String, JsValue])
    )

    val newMetaFromDk =
      (planMeta ++ customMetaFromSub ++ metadataFromSub).map { case (a, b) =>
        a -> OtoroshiTarget.processValue(b, getContext(team, tenant))
      }

    newMetaFromDk
  }

  def asOtoroshiApikey(team: Team, tenant: Tenant): ActualOtoroshiApiKey = {
    val maybeTarget: Option[OtoroshiTarget] = plan.otoroshiTarget
    val maybeCustomization: Option[ApikeyCustomization] =
      maybeTarget.map(_.apikeyCustomization)
    val meta = computeMetadata(team, tenant)
    val tags = computeTags(team, tenant)

    ActualOtoroshiApiKey(
      clientId = subscription.apiKey.clientId,
      clientSecret = subscription.apiKey.clientSecret,
      clientName = subscription.apiKey.clientName,
      authorizedEntities = maybeTarget
        .flatMap(t => t.authorizedEntities)
        .getOrElse(AuthorizedEntities()),
      enabled = subscription.enabled,
      allowClientIdOnly = maybeCustomization.exists(_.clientIdOnly),
      readOnly = subscription.customReadOnly.getOrElse(
        maybeCustomization.exists(_.readOnly)
      ),
      constrainedServicesOnly =
        maybeCustomization.exists(_.constrainedServicesOnly),
      throttlingQuota = subscription.customMaxPerSecond
        .orElse(plan.maxPerSecond)
        .getOrElse(RemainingQuotas.MaxValue),
      dailyQuota = subscription.customMaxPerDay
        .orElse(plan.maxPerDay)
        .getOrElse(RemainingQuotas.MaxValue),
      monthlyQuota = subscription.customMaxPerMonth
        .orElse(plan.maxPerMonth)
        .getOrElse(RemainingQuotas.MaxValue),
      tags = tags,
      metadata = meta ++ Map(
        "daikoku__metadata" -> meta.keys.mkString(" | "),
        "daikoku__tags" -> tags.mkString(" | ")
      ),
      restrictions =
        maybeCustomization.map(_.restrictions).getOrElse(ApiKeyRestrictions()),
      rotation = subscription.rotation
        .map(r =>
          ApiKeyRotation(
            enabled = r.enabled || plan.autoRotation.exists(e => e),
            rotationEvery = r.rotationEvery,
            gracePeriod = r.gracePeriod
          )
        )
        .orElse(
          plan.autoRotation.map(enabled => ApiKeyRotation(enabled = enabled))
        ),
      validUntil = subscription.validUntil.map(_.getMillis)
    )
  }
}
object Child {
  def readFromJson(json: JsValue): Child = {
    Child(
      subscription =
        SubscriptionForSync.readFromJson((json \ "subscription").as[JsObject]),
      api = ApiForSync.readFromJson((json \ "api").as[JsObject]),
      user = UserForSync.readFromJson((json \ "user").as[JsObject]),
      plan = PlanForSync.readFromJson((json \ "plan").as[JsObject])
    )
  }
}

case class SyncInformation(
    parent: SyncApiSubscriptionContext,
    childs: Seq[SyncApiSubscriptionContext],
    team: Team,
    apk: ActualOtoroshiApiKey,
    otoroshiSettings: OtoroshiSettings,
    tenant: Tenant,
    tenantAdminTeam: Team
)

class OtoroshiSynchronizerJob(
    client: OtoroshiClient,
    env: Env,
    translator: Translator,
    messagesApi: MessagesApi
) {

  private val logger = Logger("APIkey-Synchronizer")

  private val ref = new AtomicReference[Cancellable]()

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val mat: Materializer = env.defaultMaterializer
  implicit val ev: Env = env
  implicit val me: MessagesApi = messagesApi
  implicit val tr: Translator = translator

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
    val syncAvalaible =
      env.config.otoroshiSyncByCron && env.config.otoroshiSyncMaster

    if (syncAvalaible && ref.get() == null) {
      env.config.otoroshiSyncSchedulingMode match {
        case SchedulingMode.Cron =>
          val cronExpr = env.config.otoroshiSyncCronExpr.map(Cron.unsafeParse)

          def scheduleNext(): Unit = {
            val now = DateTime.now()
            cronExpr.flatMap(_.next[DateTime](now)) match {
              case Some(nextRun) =>
                val delayMillis =
                  Math.max(nextRun.getMillis - now.getMillis, 1000)
                val delay = delayMillis.millis

                logger.info(
                  s"[OtoroshiSync] next cron run scheduled at $nextRun (in ${delay.toSeconds}s)"
                )

                ref.set(
                  env.defaultActorSystem.scheduler.scheduleOnce(delay) {
                    logger.info(s"[OtoroshiSync] cron triggered at $now")
                    val _ = env.dataStore.tenantRepo
                      .findAllNotDeleted()
                      .flatMap(tenants =>
                        Future.sequence(
                          tenants.map(tenant =>
                            run(SyncAllSubscription(), tenant)
                          )
                        )
                      )
                      .map(_ => ())
                      .recover { case e: Throwable =>
                        logger.error("[OtoroshiSync] cron sync failed", e)
                      }
                      .andThen { case _ =>
                        scheduleNext()
                      }
                    ()
                  }
                )

              case None =>
                logger.error(
                  s"[OtoroshiSync] could not compute next run from cron expression: ${env.config.otoroshiSyncCronExpr.getOrElse("")}"
                )
            }
          }

          scheduleNext()

        case SchedulingMode.Interval =>
          ref.set(
            env.defaultActorSystem.scheduler
              .scheduleAtFixedRate(
                10.seconds,
                env.config.otoroshiSyncInterval
              ) { () =>
                env.dataStore.tenantRepo
                  .findAllNotDeleted()
                  .flatMap(tenants =>
                    Future.sequence(
                      tenants.map(tenant => run(SyncAllSubscription(), tenant))
                    )
                  )
                  .map(_ => ())
                  .recover { case e: Throwable =>
                    logger.error("[OtoroshiSync] interval sync failed", e)
                  }
              }
          )
      }
    }
  }

  def stop(): Unit = {
    Option(ref.get()).foreach(_.cancel())
  }

  private def subscriptionFields(alias: String) =
    s"""json_build_object(
       |  '_id', $alias.content -> '_id',
       |  'apiKey', $alias.content -> 'apiKey',
       |  'customMetadata', $alias.content -> 'customMetadata',
       |  'metadata', $alias.content -> 'metadata',
       |  'enabled', $alias.content -> 'enabled',
       |  'rotation', $alias.content -> 'rotation',
       |  'validUntil', $alias.content -> 'validUntil',
       |  'team', $alias.content -> 'team',
       |  'createdAt', $alias.content -> 'createdAt',
       |  'customMaxPerSecond', $alias.content -> 'customMaxPerSecond',
       |  'customMaxPerDay', $alias.content -> 'customMaxPerDay',
       |  'customMaxPerMonth', $alias.content -> 'customMaxPerMonth',
       |  'customReadOnly', $alias.content -> 'customReadOnly'
       |)""".stripMargin

  private def apiFields(alias: String) =
    s"""json_build_object(
       |  '_id', $alias.content -> '_id',
       |  'name', $alias.content -> 'name',
       |  'metadata', $alias.content -> 'metadata'
       |)""".stripMargin

  private def userFields(alias: String) =
    s"""json_build_object(
       |  '_id', $alias.content -> '_id',
       |  'name', $alias.content -> 'name',
       |  'email', $alias.content -> 'email',
       |  'metadata', $alias.content -> 'metadata'
       |)""".stripMargin

  private def planFields(alias: String) =
    s"""json_build_object(
       |  '_id', $alias.content -> '_id',
       |  'customName', $alias.content -> 'customName',
       |  'otoroshiTarget', $alias.content -> 'otoroshiTarget',
       |  'maxPerSecond', $alias.content -> 'maxPerSecond',
       |  'maxPerDay', $alias.content -> 'maxPerDay',
       |  'maxPerMonth', $alias.content -> 'maxPerMonth',
       |  'autoRotation', $alias.content -> 'autoRotation',
       |  'metadata', $alias.content -> 'metadata'
       |)""".stripMargin

  private def getOtoroshiTarget(
      tenant: Tenant,
      usagePlan: PlanForSync
  ): Option[OtoroshiSettings] = {
    usagePlan.otoroshiTarget
      .flatMap(target =>
        tenant.otoroshiSettings.find(s => s.id == target.otoroshiSettings)
      )
  }

  private def mergeOtoroshiApikeys(
      oldApiKey: ActualOtoroshiApiKey,
      newApikey: ActualOtoroshiApiKey,
      forceNewValue: Boolean = false
  ): ActualOtoroshiApiKey = {
    oldApiKey.copy(
      enabled = true,
      validUntil =
        List(oldApiKey.validUntil, newApikey.validUntil).flatten.minOption,
      tags =
        if (forceNewValue) newApikey.tags else oldApiKey.tags ++ newApikey.tags,
      metadata = oldApiKey.metadata ++
        newApikey.metadata ++
        Map(
          "daikoku__metadata" -> mergeMetaValue(
            "daikoku__metadata",
            oldApiKey.metadata,
            newApikey.metadata
          ),
          "daikoku__tags" -> mergeMetaValue(
            "daikoku__tags",
            oldApiKey.metadata,
            newApikey.metadata
          )
        ),
      restrictions = ApiKeyRestrictions(
        enabled =
          oldApiKey.restrictions.enabled || newApikey.restrictions.enabled,
        allowLast =
          oldApiKey.restrictions.allowLast || newApikey.restrictions.allowLast,
        allowed =
          oldApiKey.restrictions.allowed ++ newApikey.restrictions.allowed,
        forbidden =
          oldApiKey.restrictions.forbidden ++ newApikey.restrictions.forbidden,
        notFound =
          oldApiKey.restrictions.notFound ++ newApikey.restrictions.notFound
      ),
      authorizedEntities =
        if (forceNewValue)
          // forceNewValue = on applique le résultat de mergeAggregation (état désiré calculé depuis zéro)
          // → on remplace, pas d'union avec le stale Otoroshi state
          newApikey.authorizedEntities
        else
          // Fusion inter-subscriptions dans mergeAggregation : on union les entités de chaque child
          AuthorizedEntities(
            groups =
              oldApiKey.authorizedEntities.groups | newApikey.authorizedEntities.groups,
            services =
              oldApiKey.authorizedEntities.services | newApikey.authorizedEntities.services,
            routes =
              oldApiKey.authorizedEntities.routes | newApikey.authorizedEntities.routes
          ),
      throttlingQuota =
        if (forceNewValue) newApikey.throttlingQuota
        else math.min(oldApiKey.throttlingQuota, newApikey.throttlingQuota),
      dailyQuota =
        if (forceNewValue) newApikey.dailyQuota
        else math.min(oldApiKey.dailyQuota, newApikey.dailyQuota),
      monthlyQuota =
        if (forceNewValue) newApikey.monthlyQuota
        else math.min(oldApiKey.monthlyQuota, newApikey.monthlyQuota),
      readOnly =
        if (forceNewValue) newApikey.readOnly
        else oldApiKey.readOnly && newApikey.readOnly,
      allowClientIdOnly =
        if (forceNewValue) newApikey.allowClientIdOnly
        else oldApiKey.allowClientIdOnly && newApikey.allowClientIdOnly
    )
  }

  private def mergeAggregation(
      parent: Child,
      children: Seq[Child],
      team: Team,
      tenant: Tenant
  ): Option[ActualOtoroshiApiKey] = {
    // FIXME: c'est le shit si on veut supprimer une api avec la aprentSubscription
    if (parent.subscription.enabled)
      children
        .foldLeft(parent.asOtoroshiApikey(team, tenant)) { case (acc, item) =>
          mergeOtoroshiApikeys(acc, item.asOtoroshiApikey(team, tenant))
        }
        .some
    else
      None
  }

  private def clearApikey(
      apikey: ActualOtoroshiApiKey
  ): ActualOtoroshiApiKey = {
    val metadata = apikey.metadata
      .get("daikoku__metadata")
      .map(_.split("\\|").map(_.trim).toSeq)
      .getOrElse(Seq.empty)
    val tags = apikey.metadata
      .get("daikoku__tags")
      .map(_.split("\\|").map(_.trim).toSeq)
      .getOrElse(Seq.empty)

    apikey.copy(
      metadata = apikey.metadata.removedAll(metadata),
      tags = apikey.tags.removedAll(tags)
    )
  }

  private def isEqual(
      apikey: ActualOtoroshiApiKey,
      apikeyFromSubscriptions: ActualOtoroshiApiKey
  ): Boolean = {
    val daikokuMetaKeys = apikeyFromSubscriptions.metadata
      .getOrElse("daikoku__metadata", "")
      .split("\\|")
      .map(_.trim)
      .filter(_.nonEmpty)
      .toSet
    val metadataIsEqual = daikokuMetaKeys.forall(k =>
      apikey.metadata.get(k) == apikeyFromSubscriptions.metadata.get(k)
    ) && apikey.metadata.getOrElse(
      "daikoku__metadata",
      ""
    ) == apikeyFromSubscriptions.metadata.getOrElse("daikoku__metadata", "")

    val tagsIsEqual = apikey.tags == apikeyFromSubscriptions.tags

    val restrictionsIsEqual =
      apikey.restrictions == apikeyFromSubscriptions.restrictions

    val rotationIsEqual = apikey.rotation == apikeyFromSubscriptions.rotation

    val throttlingQuotaIsEqual =
      apikey.throttlingQuota == apikeyFromSubscriptions.throttlingQuota
    val dailyQuotaIsEqual =
      apikey.dailyQuota == apikeyFromSubscriptions.dailyQuota
    val monthlyQuotaIsEqual =
      apikey.monthlyQuota == apikeyFromSubscriptions.monthlyQuota

    val authorizedEntitiesIsEqual =
      apikey.authorizedEntities == apikeyFromSubscriptions.authorizedEntities

    val readOnlyIsEqual = apikey.readOnly == apikeyFromSubscriptions.readOnly
    val allowClientIdOnlyIsEqual =
      apikey.allowClientIdOnly == apikeyFromSubscriptions.allowClientIdOnly

    metadataIsEqual &&
    tagsIsEqual &&
    restrictionsIsEqual &&
    rotationIsEqual &&
    dailyQuotaIsEqual &&
    monthlyQuotaIsEqual &&
    authorizedEntitiesIsEqual &&
    readOnlyIsEqual &&
    allowClientIdOnlyIsEqual
  }

  private def synchronizeApikeys(
      entity: ApiId | UsagePlanId | ApiSubscriptionId | SyncAllSubscription =
        SyncAllSubscription(),
      tenant: Tenant,
      parallelism: Int = 25,
      saveCursor: Long => Future[Boolean],
      maybeLastCursor: Option[Long],
      mode: SyncMode = SyncMode.Sync
  ): Future[Unit] = {

    val predicate: String = entity match {
      case apiId: ApiId =>
        s"""AND (s.content ->> 'api' = '${apiId.value}'
           |     OR s._id IN (SELECT content ->> 'parent' FROM api_subscriptions WHERE content ->> 'api' = '${apiId.value}' AND content ->> 'parent' IS NOT NULL))""".stripMargin
      case usagePlanId: UsagePlanId =>
        s"""AND (s.content ->> 'plan' = '${usagePlanId.value}'
           |     OR s._id IN (SELECT content ->> 'parent' FROM api_subscriptions WHERE content ->> 'plan' = '${usagePlanId.value}' AND content ->> 'parent' IS NOT NULL))""".stripMargin
      case subscriptionId: ApiSubscriptionId =>
        s"""AND (s._id = '${subscriptionId.value}'
           |     OR s._id = (SELECT content ->> 'parent' FROM api_subscriptions WHERE _id = '${subscriptionId.value}'))""".stripMargin
      case _: SyncAllSubscription => ""
    }

    val cursorClause = maybeLastCursor
      .map(c => s"AND (s.content ->> 'createdAt')::bigint >= $c")
      .getOrElse("")

    val findAllSubscriptionsFromEntityStreamSql: String =
      s"""
         |SELECT json_build_object(
         |               'subscription', p.subscription,
         |               'api', p.api,
         |               'user', p."user",
         |               'plan', p.plan
         |       ) AS parent,
         |       COALESCE(json_agg(
         |        json_build_object(
         |                'subscription', ${subscriptionFields("s")},
         |                'api', ${apiFields("apis")},
         |                'user', ${userFields("users")},
         |                'plan', ${planFields("usage_plans")}
         |        )) FILTER (WHERE s._id IS NOT NULL AND usage_plans._id IS NOT NULL), '[]'::json) AS children,
         |        teams.content AS team
         |FROM (
         |    SELECT s._id as parent_id, s.content ->> 'team' as team_id, s.content ->> 'createdAt' as created_at,
         |           (${subscriptionFields(
          "s"
        )})::jsonb as subscription, (${userFields(
          "users"
        )})::jsonb as "user", (${planFields(
          "usage_plans"
        )})::jsonb as plan, (${apiFields("apis")})::jsonb as api
         |    FROM api_subscriptions s
         |    INNER JOIN apis ON apis._id = s.content ->> 'api'
         |    LEFT JOIN users ON users._id = s.content ->> 'by'
         |    INNER JOIN usage_plans ON usage_plans._id = s.content ->> 'plan'
         |    WHERE s.content ->> 'parent' IS NULL
         |      $predicate
         |      $cursorClause
         |) p
         |LEFT JOIN api_subscriptions s ON p.parent_id = s.content ->> 'parent' AND (s.content ->> 'enabled')::bool IS TRUE
         |LEFT JOIN apis ON apis._id = s.content ->> 'api'
         |LEFT JOIN users ON users._id = s.content ->> 'by'
         |LEFT JOIN usage_plans ON usage_plans._id = s.content ->> 'plan'
         |INNER JOIN teams ON teams._id = p.team_id
         |GROUP BY p.parent_id, p.created_at, p.subscription, p.api, p.plan, p.user, teams.content
         |ORDER BY p.created_at
         |""".stripMargin

    val processed = new java.util.concurrent.atomic.AtomicLong(0)
    val synced = new java.util.concurrent.atomic.AtomicLong(0)
    val skipped = new java.util.concurrent.atomic.AtomicLong(0)
    val errored = new java.util.concurrent.atomic.AtomicLong(0)

    val lastCursor =
      new java.util.concurrent.atomic.AtomicLong(maybeLastCursor.getOrElse(0L))

    val startTime = System.nanoTime()

    logger.debug(
      s"Starting fullyStreamedSync for tenant ${tenant.id.value} with parallelism=$parallelism, cursor=${maybeLastCursor.getOrElse(0L)}"
    )

    env.dataStore
      .asInstanceOf[PostgresDataStore]
      .queryRawMappedStream(
        findAllSubscriptionsFromEntityStreamSql,
        Seq(
          Col("parent", ColJson),
          Col("children", ColJsonArray),
          Col("team", ColJson)
        )
      )
      .mapAsync(parallelism) { row =>
        val parent = Child.readFromJson((row \ "parent").as[JsObject])
        val children = (row \ "children")
          .asOpt[Seq[JsValue]]
          .map(_.filter(_ != JsNull).map(Child.readFromJson))
          .getOrElse(Seq.empty)
        val team = (row \ "team").as(using TeamFormat)
        // createdAt est inclus dans subscriptionFields, accessible via parent > subscription
        val createdAt = (row \ "parent" \ "subscription" \ "createdAt")
          .asOpt[Long]
          .getOrElse(0L)

        (for {
          otoroshiSettings <- EitherT.fromOption[Future](
            getOtoroshiTarget(tenant, parent.plan),
            AppError.EntityNotFound(
              s"otoroshi target not found for subscription ${parent.subscription.apiKey.clientId} (plan ${parent.plan.id.value})"
            )
          )
          _ = logger.info(
            s"[sync:$mode] processing apikey ${parent.subscription.apiKey.clientId}, enabled=${parent.subscription.enabled}, children=${children.size}"
          )
          apikey <- EitherT(
            client.getApikey(parent.subscription.apiKey.clientId)(using
              otoroshiSettings
            )
          )
          apk <- mergeAggregation(parent, children, team, tenant) match {
            case Some(apikeyFromSubscriptions) =>
              // Active subscriptions remain — recalculate merged key (Sync and Delete)
              val equals = isEqual(apikey, apikeyFromSubscriptions)
              logger.info(
                s"[sync:$mode] apikey ${parent.subscription.apiKey.clientId} — mergeAggregation=Some, equals=$equals"
              )
              if (!equals) {
                val cleanApikey = clearApikey(apikey)
                val computedKey = mergeOtoroshiApikeys(
                  cleanApikey,
                  apikeyFromSubscriptions,
                  forceNewValue = true
                )
                logger.info(
                  s"[sync:$mode] updating apikey ${parent.subscription.apiKey.clientId} (${children.size} children)"
                )
                EitherT(
                  client.updateApiKey(key = computedKey)(using otoroshiSettings)
                )
              } else {
                EitherT.pure[Future, AppError](apikey)
              }
            case None =>
              mode match {
                case SyncMode.Delete =>
                  logger.info(
                    s"[sync:Delete] DELETING apikey ${parent.subscription.apiKey.clientId} in Otoroshi"
                  )
                  client
                    .deleteApiKey(parent.subscription.apiKey.clientId)(using
                      otoroshiSettings
                    )
                    .map(_ => apikey)
                case SyncMode.Sync =>
                  if (apikey.enabled) {
                    logger.info(
                      s"[sync:Sync] disabling apikey ${parent.subscription.apiKey.clientId} in Otoroshi"
                    )
                    EitherT(
                      client.updateApiKey(key = apikey.copy(enabled = false))(
                        using otoroshiSettings
                      )
                    )
                  } else {
                    EitherT.pure[Future, AppError](apikey)
                  }
              }
          }
        } yield apk).value
          .recover { case e =>
            Left(AppError.InternalServerError(e.getMessage))
          }
          .map {
            case Left(error) =>
              errored.incrementAndGet()
              logger.error(
                s"Error synchronizing apikey ${parent.subscription.apiKey.clientId}: ${error.getErrorMessage()}"
              )
            case Right(_) =>
              synced.incrementAndGet()
          }
          .map(_ => createdAt)
      }
      // Ce stage s'exécute dans le thread downstream ordonné de mapAsync :
      // lastCursor.set est donc toujours appelé dans l'ordre des souscriptions
      .map { createdAt =>
        lastCursor.set(createdAt)
        val count = processed.incrementAndGet()
        if (count % 100 == 0) {
          val elapsed = (System.nanoTime() - startTime) / 1000000000.0
          val rate = count / elapsed
          logger.debug(
            f"Progress: $count processed ($synced synced, $skipped skipped, $errored errors) — $rate%.1f/s"
          )
          saveCursor(lastCursor.get()).recover { case e =>
            logger.warn(
              s"[OtoroshiSync] Failed to save cursor at $createdAt: ${e.getMessage}"
            )
          }
        }
      }
      .runWith(Sink.ignore)
      .map { _ =>
        val elapsed = (System.nanoTime() - startTime) / 1000000000.0
        logger.debug(
          f"Sync completed in $elapsed%.1fs — ${processed.get()} processed, ${synced.get()} synced, ${skipped.get()} skipped, ${errored.get()} errors"
        )
      }
      .recover { case e =>
        val elapsed = (System.nanoTime() - startTime) / 1000000000.0
        logger.error(
          f"Sync stream failed after $elapsed%.1fs — ${processed.get()} processed, ${errored.get()} errors",
          e
        )
      }

  }

  def run(
      entryPoint: ApiId | UsagePlanId | ApiSubscriptionId |
        SyncAllSubscription = SyncAllSubscription(),
      tenant: Tenant,
      parallelism: Int = 25
  ): Future[Unit] = {
    logger.info(s"run apikey synchronisation with entry point as $entryPoint")

    val jobRepo = env.dataStore.JobInformationRepo.forTenant(tenant)
    val jobId = DatastoreId(s"sync-${IdGenerator.token(16)}")
    val now = DateTime.now()

    val jobInfo = JobInformation(
      id = jobId,
      tenant = tenant.id,
      jobName = JobName.ApiKeySynchronization,
      lockedBy = "otoroshi-verifier-job",
      lockedAt = now,
      expiresAt = now.plusMinutes(5),
      cursor = 0L,
      startedAt = now,
      lastBatchAt = now,
      status = JobStatus.Running
    )

    // expiresAt est rafraîchi à chaque appel pour servir de heartbeat :
    // si Daikoku crash, expiresAt ne sera plus mis à jour et le job sera considéré comme stale
    def saveCursor(cursor: Long) = jobRepo.save(
      jobInfo.copy(cursor = cursor, expiresAt = DateTime.now().plusMinutes(5))
    )

    def doRun(maybeLastCursor: Option[Long] = None): Future[Unit] =
      synchronizeApikeys(
        entryPoint,
        tenant,
        parallelism,
        saveCursor,
        maybeLastCursor
      )
        .flatMap { _ =>
          logger.info("[OtoroshiSync] Sync ended")
          jobRepo
            .save(
              jobInfo.copy(
                status = JobStatus.Completed,
                lastBatchAt = DateTime.now()
              )
            )
            .map(_ => ())
        }
        .recoverWith { case e =>
          logger.error(s"[OtoroshiSync] Sync failed: ${e.getMessage}", e)
          jobRepo
            .save(
              jobInfo
                .copy(status = JobStatus.Failed, lastBatchAt = DateTime.now())
            )
            .map(_ => ())
        }

    // FIXME: remove the timer after dev
    Time.concurrentTime(
      jobRepo
        .find(
          Json.obj("jobName" -> JobName.ApiKeySynchronization.value),
          sort = Some(Json.obj("startedAt" -> -1)),
          maxDocs = 1
        )
        .map(_.headOption)
        .flatMap {
          case Some(lastJob)
              if lastJob.status == JobStatus.Running && lastJob.expiresAt.isAfterNow =>
            logger.info(
              "[OtoroshiSync] can't run another ApiKeySynchronization, already one is running"
            )
            Future.successful(())

          case Some(lastJob)
              if lastJob.status == JobStatus.Running && lastJob.expiresAt.isBeforeNow =>
            logger.info(
              s"[OtoroshiSync] Stale running job detected (expiresAt=${lastJob.expiresAt}), marking as Failed and resuming from cursor ${lastJob.cursor}"
            )
            jobRepo
              .save(lastJob.copy(status = JobStatus.Failed))
              .flatMap(_ => jobRepo.save(jobInfo.copy(cursor = lastJob.cursor)))
              .flatMap(_ => doRun(Some(lastJob.cursor)))

          case Some(lastJob) if lastJob.status == JobStatus.Failed =>
            logger.info(
              s"[OtoroshiSync] Previous job failed, resuming from cursor ${lastJob.cursor}"
            )
            jobRepo
              .save(jobInfo.copy(cursor = lastJob.cursor))
              .flatMap(_ => doRun(Some(lastJob.cursor)))

          case _ =>
            logger.info("[OtoroshiSync] Starting fresh sync")
            jobRepo.save(jobInfo).flatMap(_ => doRun())
        },
      "Synchronization run"
    )
  }

  def runForDeletion(
      entryPoint: ApiId | UsagePlanId | ApiSubscriptionId,
      tenant: Tenant,
      parallelism: Int = 25
  ): Future[Unit] = {
    logger.info(
      s"run apikey deletion synchronisation with entry point as $entryPoint"
    )

    val jobRepo = env.dataStore.JobInformationRepo.forTenant(tenant)
    val jobId = DatastoreId(s"sync-del-${IdGenerator.token(16)}")
    val now = DateTime.now()

    val jobInfo = JobInformation(
      id = jobId,
      tenant = tenant.id,
      jobName = JobName.ApiKeySynchronization,
      lockedBy = "otoroshi-verifier-job",
      lockedAt = now,
      expiresAt = now.plusMinutes(5),
      cursor = 0L,
      startedAt = now,
      lastBatchAt = now,
      status = JobStatus.Running
    )

    def saveCursor(cursor: Long) = jobRepo.save(
      jobInfo.copy(cursor = cursor, expiresAt = DateTime.now().plusMinutes(5))
    )

    logger.info(
      s"[runForDeletion] starting for $entryPoint on tenant ${tenant.id.value}"
    )
    jobRepo
      .save(jobInfo)
      .flatMap(_ =>
        synchronizeApikeys(
          entryPoint,
          tenant,
          parallelism,
          saveCursor,
          None,
          SyncMode.Delete
        )
      )
      .flatMap(_ =>
        jobRepo
          .save(
            jobInfo
              .copy(status = JobStatus.Completed, lastBatchAt = DateTime.now())
          )
          .map(_ => ())
      )
      .map(_ =>
        logger.info(
          s"[runForDeletion] completed for $entryPoint on tenant ${tenant.id.value}"
        )
      )
      .recoverWith { case e =>
        logger.error(
          s"[runForDeletion] failed for $entryPoint: ${e.getMessage}",
          e
        )
        jobRepo
          .save(
            jobInfo
              .copy(status = JobStatus.Failed, lastBatchAt = DateTime.now())
          )
          .map(_ => ())
      }
  }
}
