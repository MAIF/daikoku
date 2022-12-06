package fr.maif.otoroshi.daikoku.utils

import akka.NotUsed
import akka.http.scaladsl.util.FastFuture
import akka.stream.scaladsl.{Flow, Source}
import cats.data.EitherT
import controllers.AppError
import controllers.AppError._
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.domain.UsagePlan._
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.StringImplicits._
import jobs.{ApiKeyStatsJob, OtoroshiVerifierJob}
import org.joda.time.DateTime
import play.api.i18n.{Lang, MessagesApi}
import play.api.libs.json.{JsArray, JsNull, JsObject, JsString, Json}
import reactivemongo.bson.BSONObjectID

import scala.concurrent.Future

class ApiService(env: Env,
                 otoroshiClient: OtoroshiClient,
                 messagesApi: MessagesApi,
                 translator: Translator,
                 apiKeyStatsJob: ApiKeyStatsJob,
                 otoroshiSynchronisator: OtoroshiVerifierJob) {

  implicit val ec = env.defaultExecutionContext
  implicit val ev = env
  implicit val me = messagesApi
  implicit val tr = translator


  def createOtoroshiApiKey(user: User, api: Api, plan: UsagePlan, team: Team, tenant: Tenant,
                           integrationToken: String,
                           customMetadata: Option[JsObject] = None,
                           customMaxPerSecond: Option[Long] = None,
                           customMaxPerDay: Option[Long] = None,
                           customMaxPerMonth: Option[Long] = None,
                           customReadOnly: Option[Boolean] = None,
                           maybeOtoroshiApiKey: Option[OtoroshiApiKey] = None) = {

    val otoroshiApiKey = maybeOtoroshiApiKey.getOrElse(OtoroshiApiKey(
      clientId = IdGenerator.token(32),
      clientSecret = IdGenerator.token(64),
      clientName = s"daikoku-api-key-${api.humanReadableId}-${
        plan.customName
          .getOrElse(plan.typeName)
          .urlPathSegmentSanitized
      }-${team.humanReadableId}-${System.currentTimeMillis()}-${api.currentVersion.value}"))

    val createdAt = DateTime.now().toString()
    val ctx = Map(
      "user.id" -> user.id.value,
      "user.name" -> user.name,
      "user.email" -> user.email,
      "api.id" -> api.id.value,
      "api.name" -> api.name,
      "team.id" -> team.id.value,
      "team.name" -> team.name,
      "tenant.id" -> tenant.id.value,
      "tenant.name" -> tenant.name,
      "createdAt" -> createdAt,
      "client.id" -> otoroshiApiKey.clientId,
      "client.name" -> otoroshiApiKey.clientName
    ) ++ team.metadata.map(t => ("team.metadata." + t._1, t._2)) ++ user.metadata
      .map(
        t => ("user.metadata." + t._1, t._2)
      )
    val apiKey = ActualOtoroshiApiKey(
      clientId = otoroshiApiKey.clientId,
      clientSecret = otoroshiApiKey.clientSecret,
      clientName = otoroshiApiKey.clientName,
      authorizedEntities = plan.otoroshiTarget.flatMap(_.authorizedEntities).getOrElse(AuthorizedEntities()),
      throttlingQuota = 1000,
      dailyQuota = RemainingQuotas.MaxValue,
      monthlyQuota = RemainingQuotas.MaxValue,
      allowClientIdOnly =
        plan.otoroshiTarget.exists(_.apikeyCustomization.clientIdOnly),
      readOnly = customReadOnly.getOrElse(plan.otoroshiTarget.exists(_.apikeyCustomization.readOnly)),
      constrainedServicesOnly = plan.otoroshiTarget.exists(
        _.apikeyCustomization.constrainedServicesOnly),
      tags = plan.otoroshiTarget
        .map(_.processedTags(ctx))
        .getOrElse(Seq.empty[String]),
      restrictions = plan.otoroshiTarget
        .map(_.apikeyCustomization.restrictions)
        .getOrElse(ApiKeyRestrictions()),
      metadata = Map(
        "daikoku_created_by" -> user.email,
        "daikoku_created_from" -> "daikoku",
        "daikoku_created_at" -> createdAt,
        "daikoku_created_with_id" -> api.id.value,
        "daikoku_created_with" -> api.name,
        "daikoku_created_for_team_id" -> team.id.value,
        "daikoku_created_for_team" -> team.name,
        "daikoku_created_on_tenant" -> tenant.id.value,
        "daikoku_integration_token" -> integrationToken
      ) ++ plan.otoroshiTarget
        .map(_.processedMetadata(ctx))
        .getOrElse(Map.empty[String, String])
        ++ customMetadata
        .flatMap(_.asOpt[Map[String, String]])
        .getOrElse(Map.empty[String, String]),
      rotation = plan.autoRotation.map(enabled => ApiKeyRotation(enabled = enabled))
    )

    plan match {
      case p: FreeWithQuotas =>
        apiKey.copy(
          throttlingQuota = customMaxPerSecond.getOrElse(p.maxPerSecond),
          dailyQuota = customMaxPerDay.getOrElse(p.maxPerDay),
          monthlyQuota = customMaxPerMonth.getOrElse(p.maxPerMonth))
      case p: QuotasWithLimits =>
        apiKey.copy(
          throttlingQuota = customMaxPerSecond.getOrElse(p.maxPerSecond),
          dailyQuota = customMaxPerDay.getOrElse(p.maxPerDay),
          monthlyQuota = customMaxPerMonth.getOrElse(p.maxPerMonth))
      case _ => apiKey
    }
  }

  def subscribeToApi(tenant: Tenant,
                     user: User,
                     api: Api,
                     planId: String,
                     team: Team,
                     parentSubscriptionId: Option[ApiSubscriptionId] = None,
                     customMetadata: Option[JsObject] = None,
                     customMaxPerSecond: Option[Long] = None,
                     customMaxPerDay: Option[Long] = None,
                     customMaxPerMonth: Option[Long] = None,
                     customReadOnly: Option[Boolean] = None): Future[Either[AppError, JsObject]] = {
    val defaultPlanOpt =
      api.possibleUsagePlans.find(p => p.id == api.defaultUsagePlan)
    val askedUsagePlan = api.possibleUsagePlans.find(p => p.id.value == planId)
    val plan: UsagePlan = askedUsagePlan
      .orElse(defaultPlanOpt)
      .getOrElse(api.possibleUsagePlans.head)

    def createKey(api: Api, plan: UsagePlan, team: Team, authorizedEntities: AuthorizedEntities, parentSubscriptionId: Option[ApiSubscriptionId])(
      implicit otoroshiSettings: OtoroshiSettings
    ): Future[Either[AppError, JsObject]] = {
      import cats.implicits._

      EitherT(parentSubscriptionId match {
        case None =>
          val error: Future[Either[AppError, (Option[ApiSubscription], Option[OtoroshiApiKey])]] = FastFuture.successful(
            Right((None, None)))
          error
        case Some(id) => env.dataStore.apiSubscriptionRepo.forTenant(tenant.id).findById(id.value)
          .map {
            case Some(sub) => Right((Some(sub), Some(sub.apiKey)))
            case None => Left(AppError.SubscriptionNotFound)
          }
      })
        .flatMap {
          case (maybeParentSub, otoroshiApiKey) =>

            val integrationToken = IdGenerator.token(64)

            val tunedApiKey = createOtoroshiApiKey(
              user = user,
              api = api,
              plan = plan,
              team = team,
              tenant = tenant,
              integrationToken = integrationToken,
              customMetadata = customMetadata,
              customMaxPerSecond = customMaxPerSecond,
              customMaxPerDay = customMaxPerDay,
              customMaxPerMonth = customMaxPerMonth,
              customReadOnly = customReadOnly,
              maybeOtoroshiApiKey = otoroshiApiKey)

            val automaticMetadata = tunedApiKey.metadata.filterNot(i => i._1.startsWith("daikoku_")) -- customMetadata
              .flatMap(_.asOpt[Map[String, String]])
              .getOrElse(Map.empty[String, String])
              .keys

            val apiSubscription = ApiSubscription(
              id = ApiSubscriptionId(BSONObjectID.generate().stringify),
              tenant = tenant.id,
              apiKey = tunedApiKey.asOtoroshiApiKey,
              plan = plan.id,
              createdAt = DateTime.now(),
              team = team.id,
              api = api.id,
              by = user.id,
              customName = None,
              rotation = plan.autoRotation.map(rotation => ApiSubscriptionRotation(enabled = rotation)),
              integrationToken = integrationToken,
              metadata = Some(JsObject(automaticMetadata.view.mapValues(i => JsString(i)).toSeq)),
              tags = Some(tunedApiKey.tags),
              customMetadata = customMetadata,
              customMaxPerSecond = customMaxPerSecond,
              customMaxPerDay = customMaxPerDay,
              customMaxPerMonth = customMaxPerMonth,
              customReadOnly = customReadOnly,
              parent = parentSubscriptionId
            )

            val otoroshiApiKeyActionResult: EitherT[Future, AppError, ActualOtoroshiApiKey] = maybeParentSub match {
              case Some(subscription) => EitherT(otoroshiClient.getApikey(subscription.apiKey.clientId))
                .flatMap(otoApiKey =>
                  EitherT(otoroshiClient.updateApiKey(
                    otoApiKey.copy(
                      authorizedEntities = AuthorizedEntities(
                        groups = otoApiKey.authorizedEntities.groups ++ authorizedEntities.groups,
                        services = otoApiKey.authorizedEntities.services ++ authorizedEntities.services),
                      tags = Set.from(tunedApiKey.tags ++ otoApiKey.tags).toSeq, //todo: Set au lieu de de Seq
                      restrictions = ApiKeyRestrictions(
                        enabled = otoApiKey.restrictions.enabled && tunedApiKey.restrictions.enabled,
                        allowLast = otoApiKey.restrictions.allowLast || tunedApiKey.restrictions.allowLast,
                        allowed = tunedApiKey.restrictions.allowed ++ otoApiKey.restrictions.allowed,
                        forbidden = tunedApiKey.restrictions.forbidden ++ otoApiKey.restrictions.forbidden,
                        notFound = tunedApiKey.restrictions.forbidden ++ otoApiKey.restrictions.forbidden),
                      metadata = tunedApiKey.metadata ++ otoApiKey.metadata)
                  )))
              case None => EitherT(otoroshiClient.createApiKey(tunedApiKey))
            }

            otoroshiApiKeyActionResult
              .flatMap(_ => EitherT.liftF[Future, AppError, Boolean](env.dataStore.apiSubscriptionRepo
                .forTenant(tenant.id)
                .save(apiSubscription)))
              .flatMap(_ => EitherT.liftF[Future, AppError, Future[Boolean]](env.dataStore.teamRepo
                .forTenant(tenant.id)
                .findById(team.id)
                .map ( upToDateTeam => env.dataStore.teamRepo
                    .forTenant(tenant.id)
                    .save(upToDateTeam.getOrElse(team).copy(
                      subscriptions = team.subscriptions :+ apiSubscription.id))
              )))
            .map(_ => Json.obj("creation" -> "done", "subscription" -> apiSubscription.asJson))
        }.value
    }

    def createAdminKey(api: Api, plan: UsagePlan): Future[Either[AppError, JsObject]] = {
      import cats.implicits._
      // TODO: verify if group is in authorized groups (if some)

      val clientId = IdGenerator.token(32)
      val clientSecret = IdGenerator.token(64)
      val clientName =
        s"daikoku-api-key-${api.humanReadableId}-${
          plan.customName
            .getOrElse(plan.typeName)
            .urlPathSegmentSanitized
        }-${team.humanReadableId}-${System.currentTimeMillis()}"
      val apiSubscription = ApiSubscription(
        id = ApiSubscriptionId(BSONObjectID.generate().stringify),
        tenant = tenant.id,
        apiKey = OtoroshiApiKey(clientName, clientId, clientSecret),
        plan = plan.id,
        createdAt = DateTime.now(),
        team = team.id,
        api = api.id,
        by = user.id,
        customName = None,
        rotation = plan.autoRotation.map(_ => ApiSubscriptionRotation()),
        integrationToken = IdGenerator.token(64)
      )

      val r: EitherT[Future, AppError, JsObject] = for {
        _ <- EitherT.liftF(
          env.dataStore.apiSubscriptionRepo
            .forTenant(tenant.id)
            .save(apiSubscription))
        _ <- EitherT.liftF(
          env.dataStore.teamRepo
            .forTenant(tenant.id)
            .save(team.copy(
              subscriptions = team.subscriptions :+ apiSubscription.id))
        )
        _ <- EitherT.liftF(
          env.dataStore.tenantRepo.save(tenant.copy(adminSubscriptions = tenant.adminSubscriptions :+ apiSubscription.id))
        )
      } yield {
        Json.obj("creation" -> "done", "subscription" -> apiSubscription.asJson)
      }

      r.value
    }

    plan.otoroshiTarget.map(_.otoroshiSettings).flatMap { id =>
      tenant.otoroshiSettings.find(_.id == id)
    } match {
      case None if api.visibility == ApiVisibility.AdminOnly => createAdminKey(api, plan)
      case None => Future.successful(Left(OtoroshiSettingsNotFound))
      case Some(otoSettings) =>
        implicit val otoroshiSettings: OtoroshiSettings = otoSettings
        plan.otoroshiTarget.flatMap(_.authorizedEntities) match {
          case None => Future.successful(Left(ApiNotLinked))
          case Some(authorizedEntities) if authorizedEntities.isEmpty => Future.successful(Left(ApiNotLinked))
          case Some(authorizedEntities) =>
            val customMetadataKeys = plan.otoroshiTarget.get.apikeyCustomization.customMetadata.map(_.key)
            val isCustomMetadataProvided =
              customMetadataKeys.intersect(customMetadata.map(_.keys.toSeq).getOrElse(Seq.empty)) == customMetadataKeys &&
                customMetadata.map(_.values.toSeq).forall(values => !values.contains(JsNull))

            if (isCustomMetadataProvided) {
              createKey(api, plan, team, authorizedEntities, parentSubscriptionId)
            } else {
              FastFuture.successful(Left(ApiKeyCustomMetadataNotPrivided))
            }

        }
    }
  }

  def updateSubscription(tenant: Tenant,
                         subscription: ApiSubscription,
                         api: Api): Future[Either[AppError, JsObject]] = {
    import cats.implicits._

    api.possibleUsagePlans.find(plan => plan.id == subscription.plan) match {
      case None => FastFuture.successful(Left(PlanNotFound))
      case Some(plan) => plan.otoroshiTarget.map(_.otoroshiSettings).flatMap { id =>
        tenant.otoroshiSettings.find(_.id == id)
      } match {
        case None => Future.successful(Left(OtoroshiSettingsNotFound))
        case Some(otoSettings) =>
          implicit val otoroshiSettings: OtoroshiSettings = otoSettings
          plan.otoroshiTarget.flatMap(_.authorizedEntities) match {
            case None => Future.successful(Left(ApiNotLinked))
            case Some(authorizedEntities) if authorizedEntities.isEmpty => Future.successful(Left(ApiNotLinked))
            case Some(authorizedEntities) =>

            val r: EitherT[Future, AppError, JsObject] = for {
              apiKey <- EitherT(
                otoroshiClient.getApikey(subscription.apiKey.clientId))
              _ <- EitherT.liftF(
                otoroshiClient.updateApiKey(
                  apiKey.copy(
                    authorizedEntities = authorizedEntities,
                    throttlingQuota = subscription.customMaxPerSecond.getOrElse(apiKey.throttlingQuota),
                    dailyQuota = subscription.customMaxPerDay.getOrElse(apiKey.dailyQuota),
                    monthlyQuota = subscription.customMaxPerMonth.getOrElse(apiKey.monthlyQuota),
                    metadata = apiKey.metadata ++ subscription.customMetadata
                      .flatMap(_.asOpt[Map[String, String]])
                      .getOrElse(Map.empty[String, String]),
                    readOnly = subscription.customReadOnly.getOrElse(apiKey.readOnly)
                  )))
              _ <- EitherT.liftF(
                env.dataStore.apiSubscriptionRepo
                  .forTenant(tenant.id)
                  .save(subscription)
              )
            } yield {
              Json.obj("done" -> true,
                "subscription" -> subscription.asSafeJson)
            }

            r.value
          }
      }
    }
  }

  def deleteApiKey(tenant: Tenant,
                   subscription: ApiSubscription,
                   plan: UsagePlan,
                   team: Team): Future[Either[AppError, JsObject]] = {
    def deleteKey()(implicit otoroshiSettings: OtoroshiSettings): Future[Either[AppError, JsObject]] = {
      import cats.implicits._

      val r: EitherT[Future, AppError, JsObject] = for {
        _ <- EitherT.liftF(
          otoroshiClient.deleteApiKey(subscription.apiKey.clientId))
        _ <- EitherT.liftF(
          env.dataStore.apiSubscriptionRepo
            .forTenant(tenant.id)
            .deleteByIdLogically(subscription.id))
        _ <- EitherT.liftF(
          env.dataStore.teamRepo
            .forTenant(tenant.id)
            .save(team.copy(subscriptions =
              team.subscriptions.filterNot(_ == subscription.id)))
        )
      } yield {
        Json.obj("archive" -> "done",
          "subscriptionId" -> subscription.id.asJson)
      }

      r.value
    }

    plan.otoroshiTarget.map(_.otoroshiSettings).flatMap { id =>
      tenant.otoroshiSettings.find(_.id == id)
    } match {
      case None => Future.successful(Left(OtoroshiSettingsNotFound))
      case Some(otoSettings) =>
        implicit val otoroshiSettings: OtoroshiSettings = otoSettings
        plan.otoroshiTarget.map(_.authorizedEntities) match {
          case None => Future.successful(Left(ApiNotLinked))
          case Some(authorizedEntities) if authorizedEntities.isEmpty => Future.successful(Left(ApiNotLinked))
          case Some(_) => deleteKey()
        }
    }
  }

  def archiveApiKey(tenant: Tenant,
                    subscription: ApiSubscription,
                    plan: UsagePlan,
                    enabled: Boolean): Future[Either[AppError, JsObject]] = {
    import cats.implicits._

    plan.otoroshiTarget.map(_.otoroshiSettings).flatMap { id =>
      tenant.otoroshiSettings.find(_.id == id)
    } match {
      case None => FastFuture.successful(Left(OtoroshiSettingsNotFound))
      case Some(otoSettings) =>
        implicit val otoroshiSettings: OtoroshiSettings = otoSettings

        val r: EitherT[Future, AppError, JsObject] = for {
          apiKey <- EitherT(otoroshiClient.getApikey(subscription.apiKey.clientId))
          _ <- subscription.parent match {
            case Some(_) =>
              plan.otoroshiTarget match {
                case Some(target) if target.authorizedEntities.isDefined && enabled =>
                    EitherT.liftF(
                      otoroshiClient.updateApiKey(apiKey.copy(authorizedEntities = apiKey.authorizedEntities.copy(
                        services = apiKey.authorizedEntities.services ++ target.authorizedEntities.get.services,
                        groups = apiKey.authorizedEntities.groups ++ target.authorizedEntities.get.groups
                      ))))
                case Some(target) if target.authorizedEntities.isDefined =>
                    EitherT.liftF(
                      otoroshiClient.updateApiKey(apiKey.copy(authorizedEntities = apiKey.authorizedEntities.copy(
                        services = apiKey.authorizedEntities.services.filter(s => !target.authorizedEntities.get.services.contains(OtoroshiServiceId(s.value))),
                        groups = apiKey.authorizedEntities.groups.filter(s => !target.authorizedEntities.get.groups.contains(OtoroshiServiceGroupId(s.value)))
                      ))))
                case _ => EitherT.leftT[Future, JsObject](OtoroshiSettingsNotFound)
              }
            case None =>
              EitherT.liftF(
                otoroshiClient.updateApiKey(apiKey.copy(enabled = enabled)))
          }
          _ <- EitherT.liftF(
            env.dataStore.apiSubscriptionRepo
              .forTenant(tenant.id)
              .save(subscription.copy(enabled = enabled))
          )
        } yield {
          Json.obj("done" -> true,
            "subscription" -> subscription.copy(enabled = enabled).asJson)
        }

        r.value
    }
  }

  def regenerateApiKeySecret(tenant: Tenant,
                             subscription: ApiSubscription,
                             plan: UsagePlan,
                             api: Api,
                             team: Team,
                             user: User): Future[Either[AppError, JsObject]] = {
    import cats.implicits._

    plan.otoroshiTarget.map(_.otoroshiSettings).flatMap { id =>
      tenant.otoroshiSettings.find(_.id == id)
    } match {
      case None if api.visibility == ApiVisibility.AdminOnly =>
        val newClientSecret = IdGenerator.token(64)
        val updatedSubscription = subscription.copy(apiKey = subscription.apiKey.copy(clientSecret = newClientSecret))
        env.dataStore.apiSubscriptionRepo
          .forTenant(tenant.id)
          .save(updatedSubscription)
          .map(_ => Right(Json.obj("done" -> true, "subscription" -> updatedSubscription.asJson)))
      case None => Future.successful(Left(OtoroshiSettingsNotFound))
      case Some(otoSettings) =>
        implicit val otoroshiSettings: OtoroshiSettings = otoSettings
        //implicit val language: String = tenant.defaultLanguage.getOrElse("en")

        val newClientSecret = IdGenerator.token(64)
        val updatedSubscription = subscription.copy(apiKey = subscription.apiKey.copy(clientSecret = newClientSecret))

        val r: EitherT[Future, AppError, JsObject] = for {
          subscriptionTeam <- EitherT.liftF(
            env.dataStore.teamRepo
              .forTenant(tenant.id)
              .findById(subscription.team))
          admins <- EitherT.liftF(
            env.dataStore.userRepo.find(
              Json.obj("_id" -> Json.obj(
                "$in" -> JsArray(subscriptionTeam
                  .map(_.users
                    .filter(_.teamPermission == Administrator)
                    .map(_.userId.asJson)
                    .toSeq
                  ).getOrElse(Seq.empty)))))
          )
          apiKey <- EitherT(otoroshiClient.getApikey(subscription.apiKey.clientId))
          _ <- EitherT.liftF(otoroshiClient.updateApiKey(apiKey.copy(clientSecret = newClientSecret)))
          _ <- EitherT.liftF(
            env.dataStore.apiSubscriptionRepo
              .forTenant(tenant.id)
              .save(updatedSubscription)
          )
          _ <- EitherT.liftF(env.dataStore.notificationRepo
            .forTenant(tenant.id)
            .save(Notification(
              id = NotificationId(BSONObjectID
                .generate()
                .stringify),
              tenant = tenant.id,
              team = Some(subscription.team),
              sender = user,
              action = NotificationAction
                .ApiKeyRefresh(
                  subscription.customName.getOrElse(apiKey.clientName),
                  api.name,
                  plan.customName.getOrElse(
                    plan.typeName)),
              notificationType =
                NotificationType.AcceptOnly
            )))
          _ <- EitherT.liftF(Future.sequence(admins.map(admin => {
            implicit val language: String = admin.defaultLanguage.getOrElse(tenant.defaultLanguage.getOrElse("en"))
            (for {
              title <- translator.translate("mail.apikey.refresh.title", tenant)
              body <- translator.translate("mail.apikey.refresh.body", tenant, Map(
                "apiName" -> api.name,
                "planName" -> plan.customName.getOrElse(plan.typeName)
              ))
            } yield {
              tenant.mailer.send(title, Seq(admin.email), body, tenant)
            }).flatten
          })))
        } yield {
          Json.obj("done" -> true,
            "subscription" -> updatedSubscription.asJson)
        }
        r.value
      }
  }

  def toggleApiKeyRotation(tenant: Tenant,
                           subscription: ApiSubscription,
                           plan: UsagePlan,
                           api: Api,
                           enabled: Boolean,
                           rotationEvery: Long,
                           gracePeriod: Long): Future[Either[AppError, JsObject]] = {
    import cats.implicits._

    if (api.visibility == ApiVisibility.AdminOnly) {
      Future.successful(Left(ApiKeyRotationConflict))
    } else if (plan.autoRotation.getOrElse(false)) {
      Future.successful(Left(ApiKeyRotationConflict))
    } else if (rotationEvery <= gracePeriod) {
      FastFuture.successful(Left(ApiKeyRotationError(Json.obj("error" -> "Rotation period can't ben less or equal to grace period"))))
    } else if (rotationEvery <= 0) {
      FastFuture.successful(Left(ApiKeyRotationError(Json.obj("error" -> "Rotation period can't be less or equal to zero"))))
    } else if (gracePeriod <= 0) {
      FastFuture.successful(Left(ApiKeyRotationError(Json.obj("error" -> "Grace period can't be less or equal to zero"))))
    } else {
      plan.otoroshiTarget.map(_.otoroshiSettings).flatMap { id =>
        tenant.otoroshiSettings.find(_.id == id)
      } match {
        case None => Future.successful(Left(OtoroshiSettingsNotFound))
        case Some(otoSettings) =>
          implicit val otoroshiSettings: OtoroshiSettings = otoSettings

          val r: EitherT[Future, AppError, JsObject] = for {
            apiKey <- EitherT(otoroshiClient.getApikey(subscription.apiKey.clientId))
            _ <- EitherT.liftF(
              otoroshiClient.updateApiKey(apiKey.copy(rotation = Some(ApiKeyRotation(enabled = enabled, rotationEvery = rotationEvery, gracePeriod = gracePeriod)))))
            _ <- EitherT.liftF(
              env.dataStore.apiSubscriptionRepo
                .forTenant(tenant.id)
                .save(subscription.copy(rotation = subscription.rotation.map(r => r.copy(enabled = enabled, rotationEvery = rotationEvery, gracePeriod = gracePeriod))
                  .orElse(Some(ApiSubscriptionRotation(rotationEvery = rotationEvery, gracePeriod = gracePeriod)))))
            )
            updatedSubscription <- EitherT.liftF(
              env.dataStore.apiSubscriptionRepo
                .forTenant(tenant.id)
                .findById(subscription.id)
            )
          } yield {
            Json.obj("done" -> true,
              "subscription" -> updatedSubscription.get.asJson)
          }
          r.value
      }
    }
  }

  /**
   * remove a subcription from an aggregation, compute newly aggregation, save it in otoroshi and return new computed otoroshi apikey
   *
   * @param subscription the subscription to extract
   * @param tenant the tenant
   * @param user the user responsible for the extraction
   * @param o the oto settings
   * @return extracted otoroshi apikey (unsaved)
   */
  def extractSubscriptionFromAggregation(subscription: ApiSubscription, tenant: Tenant, user: User)(implicit o: OtoroshiSettings): Future[Either[AppError, ActualOtoroshiApiKey]] = {
    (for {
      parentSubscriptionId <- EitherT.fromOption[Future](subscription.parent, MissingParentSubscription)
      parentSubscription <- EitherT.fromOptionF(env.dataStore.apiSubscriptionRepo.forTenant(tenant.id).findByIdNotDeleted(parentSubscriptionId), MissingParentSubscription)
      oldApiKey <- EitherT(otoroshiClient.getApikey(parentSubscription.apiKey.clientId))
      childsSubscription <- EitherT.liftF(env.dataStore.apiSubscriptionRepo.forTenant(tenant)
        .findNotDeleted(Json.obj("parent" -> parentSubscriptionId.asJson))
        .map(_.filterNot(_.id == subscription.id)))
      team <- EitherT.fromOptionF(env.dataStore.teamRepo.forTenant(tenant.id).findById(parentSubscription.team), TeamNotFound)
      newParentKey <- EitherT.fromOptionF(env.dataStore.apiRepo.forTenant(tenant)
        .findByIdNotDeleted(parentSubscription.api.asInstanceOf[ApiId])
        .map(_.flatMap(api => api.possibleUsagePlans
          .find(p => p.id == parentSubscription.plan)
          .map(plan => createOtoroshiApiKey(
            user = user,
            api = api,
            plan = plan,
            team = team,
            tenant = tenant,
            integrationToken = IdGenerator.token(64),
            customMetadata = parentSubscription.customMetadata,
          )))), ApiNotFound)
      childsKeys <- EitherT.liftF(Future.sequence(childsSubscription.map(s => env.dataStore.apiRepo.forTenant(tenant)
        .findByIdNotDeleted(s.api.asInstanceOf[ApiId])
        .map(_.flatMap(api => api.possibleUsagePlans
          .find(p => p.id == s.plan)
          .map(plan => createOtoroshiApiKey(
            user = user,
            api = api,
            plan = plan,
            team = team,
            tenant = tenant,
            integrationToken = IdGenerator.token(64),
            customMetadata = s.customMetadata,
          )))))))
      api <- EitherT.fromOptionF(env.dataStore.apiRepo.forTenant(tenant).findById(subscription.api.asInstanceOf[ApiId]), ApiNotFound)
      plan <- EitherT.fromOption[Future](api.possibleUsagePlans.find(_.id == subscription.plan), PlanNotFound)
      apikey        <- EitherT.rightT[Future, AppError](createOtoroshiApiKey(
            user = user,
            api = api,
            plan = plan,
            team = team,
            tenant = tenant,
            integrationToken = IdGenerator.token(64),
            customMetadata = subscription.customMetadata,
          ))
      newAggApiKey <- EitherT.rightT[Future, AppError](oldApiKey.copy(
        authorizedEntities = AuthorizedEntities(
          groups = newParentKey.authorizedEntities.groups ++ childsKeys.foldLeft(Set.empty[OtoroshiServiceGroupId])((acc, curr) => acc ++ curr.map(_.authorizedEntities.groups).getOrElse(Set.empty)),
          services = newParentKey.authorizedEntities.services ++ childsKeys.foldLeft(Set.empty[OtoroshiServiceId])((acc, curr) => acc ++ curr.map(_.authorizedEntities.services).getOrElse(Set.empty))),
        tags = Set.from(newParentKey.tags ++ childsKeys.foldLeft(Set.empty[String])((acc, curr) => acc ++ curr.map(_.tags).getOrElse(Set.empty))).toSeq,
        restrictions = ApiKeyRestrictions(
          enabled = newParentKey.restrictions.enabled && childsKeys.foldLeft(false)((acc, curr) => acc && curr.exists(_.restrictions.enabled)),
          allowLast = newParentKey.restrictions.allowLast || childsKeys.foldLeft(true)((acc, curr) => acc || curr.forall(_.restrictions.allowLast)),
          allowed = newParentKey.restrictions.allowed ++ childsKeys.foldLeft(Seq.empty[ApiKeyRestrictionPath])((acc, curr) => acc ++ curr.map(_.restrictions.allowed).getOrElse(Seq.empty)),
          forbidden = newParentKey.restrictions.forbidden ++ childsKeys.foldLeft(Seq.empty[ApiKeyRestrictionPath])((acc, curr) => acc ++ curr.map(_.restrictions.forbidden).getOrElse(Seq.empty)),
          notFound = newParentKey.restrictions.notFound ++ childsKeys.foldLeft(Seq.empty[ApiKeyRestrictionPath])((acc, curr) => acc ++ curr.map(_.restrictions.notFound).getOrElse(Seq.empty))),
        metadata = newParentKey.metadata ++ childsKeys.foldLeft(Map.empty[String, String])((acc, curr) => acc ++ curr.map(_.metadata).getOrElse(Map.empty))))
      _ <- EitherT(otoroshiClient.updateApiKey(newAggApiKey))
    } yield apikey).value
  }

  def deleteApiSubscriptionsAsFlow(tenant: Tenant, apiOrGroupName: String, user: User) = Flow[(UsagePlan, Seq[ApiSubscription])]
    .map(tuple => {
      tuple._2.map(subscription => {
        (tuple._1, subscription, Notification(
          id = NotificationId(BSONObjectID.generate().stringify),
          tenant = tenant.id,
          team = Some(subscription.team),
          sender = user,
          notificationType = NotificationType.AcceptOnly,
          action = NotificationAction.ApiKeyDeletionInformation(apiOrGroupName, subscription.apiKey.clientId)
        ))
      })
    })
    .flatMapConcat(seq => Source(seq.toList))
    //todo: update to 5 parralelism if team.subscriptions is no more used
    .mapAsync(1)(sub => {
      val plan = sub._1
      val subscription = sub._2
      val notification = sub._3

      plan.otoroshiTarget.map(_.otoroshiSettings).flatMap { id =>
        tenant.otoroshiSettings.find(_.id == id)
      } match {
        case None => FastFuture.successful(false)
        case Some(otoSettings) =>
          implicit val otoroshiSettings: OtoroshiSettings = otoSettings
          env.dataStore.teamRepo.forTenant(tenant).findByIdNotDeleted(subscription.team).flatMap {
            case None => FastFuture.successful(false)
            case Some(subscriberTeam) => for {
              _       <- env.dataStore.notificationRepo.forTenant(tenant).save(notification)
              _       <- apiKeyStatsJob.syncForSubscription(subscription, tenant)
              childs  <- env.dataStore.apiSubscriptionRepo.forTenant(tenant)
                .findNotDeleted(Json.obj("parent" -> subscription.id.asJson))
            } yield subscription.parent match {
              case Some(_)                    => for {
                _ <- extractSubscriptionFromAggregation(subscription, tenant, user)
                _ <- env.dataStore.apiSubscriptionRepo.forTenant(tenant).deleteByIdLogically(subscription.id)
                _ <- env.dataStore.teamRepo
                  .forTenant(tenant.id)
                  .save(subscriberTeam.copy(subscriptions = subscriberTeam.subscriptions.filterNot(_ == subscription.id)))
              } yield ()
              case None if childs.nonEmpty    =>
                childs match {
                  case newParent :: newChilds => for {
                    subRepo <- env.dataStore.apiSubscriptionRepo.forTenantF(tenant)
                    _ <- subRepo.save(newParent.copy(parent = None))
                    _ <- subRepo.updateManyByQuery(
                      Json.obj("_id" -> Json.obj("$in" -> JsArray(newChilds.map(_.id.asJson)))),
                      Json.obj("$set" -> Json.obj("parent" -> newParent.id.asJson)))
                    _ <- subRepo.deleteByIdLogically(subscription.id)
                    _ <- env.dataStore.teamRepo
                      .forTenant(tenant.id)
                      .save(subscriberTeam.copy(subscriptions = subscriberTeam.subscriptions.filterNot(_ == subscription.id)))
                    _ <- otoroshiSynchronisator.verify(Json.obj("_id" -> newParent.id.asJson))

                  } yield ()
                }
              case _ => deleteApiKey(tenant, subscription, plan, subscriberTeam)
            }
          }
      }
    })

}
