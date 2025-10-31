package fr.maif.otoroshi.daikoku.env

import cats.data.{EitherT, OptionT}
import cats.implicits.catsSyntaxOptionId
import fr.maif.otoroshi.daikoku.domain.Tenant.getCustomizationCmsPage
import fr.maif.otoroshi.daikoku.domain.UsagePlanVisibility.Admin
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.domain.json.{ApiDocumentationPageFormat, ApiFormat, ApiSubscriptionFormat, SeqApiDocumentationDetailPageFormat, TeamFormat, TeamIdFormat, TenantFormat, TenantIdFormat, UserFormat}
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.utils.{IdGenerator, OtoroshiClient}
import org.apache.pekko.{Done, NotUsed}
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.{Flow, Sink, Source}
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json._
import services.CmsPage
import storage.DataStore
import storage.drivers.postgres.PostgresDataStore

import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success, Try}

sealed trait EvolutionScript {
  val logger = Logger("evolution")
  def version: String
  def script: (
      Option[DatastoreId],
      DataStore,
      Materializer,
      ExecutionContext,
      OtoroshiClient
  ) => Future[Done]
  def run(
      maybeId: Option[DatastoreId],
      dataStore: DataStore,
      otoroshiClient: OtoroshiClient
  )(implicit mat: Materializer, ec: ExecutionContext): Future[Done] =
    script(maybeId, dataStore, mat, ec, otoroshiClient)
}

object evolution_102 extends EvolutionScript {
  override def version: String = "1.0.2"

  override def script: (
      Option[DatastoreId],
      DataStore,
      Materializer,
      ExecutionContext,
      OtoroshiClient
  ) => Future[Done] =
    (
        maybeId: Option[DatastoreId],
        dataStore: DataStore,
        mat: Materializer,
        ec: ExecutionContext,
        _: OtoroshiClient
    ) => {
      logger.info("Begin evolution 1.0.2")
      dataStore.apiRepo
        .forAllTenant()
        .streamAllRaw()(ec)
        .filter(value =>
          (value \ "possibleUsagePlans")
            .as[JsArray]
            .value
            .exists(plan =>
              (plan \ "otoroshiTarget" \ "serviceGroup")
                .asOpt[String]
                .isDefined
            )
        )
        .mapAsync(10) { value =>
          val usagePlans = (value \ "possibleUsagePlans").as[JsArray]
          val newPlans = usagePlans.value.map(plan => {
            val oldGroupValue =
              (plan \ "otoroshiTarget" \ "serviceGroup").asOpt[String]

            if (oldGroupValue.isDefined) {
              val oldOtoroshiTarget = (plan \ "otoroshiTarget").as[JsObject]
              val maybeOtoroshiTarget = oldOtoroshiTarget - "serviceGroup" ++
                Json.obj(
                  "authorizedEntities" -> Json.obj(
                    "groups" -> JsArray(Seq(JsString(oldGroupValue.get))),
                    "services" -> JsArray()
                  )
                )
              plan.as[JsObject] ++ Json
                .obj("otoroshiTarget" -> maybeOtoroshiTarget)
            } else {
              plan
            }
          })
          val goodApi = value
            .as[JsObject] ++ Json.obj("possibleUsagePlans" -> JsArray(newPlans))

          dataStore.apiRepo
            .forAllTenant()
            .save(Json.obj("_id" -> (goodApi \ "_id").as[String]), goodApi)(ec)
        }
        .runWith(Sink.ignore)(mat)
    }
}

object evolution_150 extends EvolutionScript {
  override def version: String = "1.5.0"

  override def script: (
      Option[DatastoreId],
      DataStore,
      Materializer,
      ExecutionContext,
      OtoroshiClient
  ) => Future[Done] =
    (
        maybeId: Option[DatastoreId],
        dataStore: DataStore,
        mat: Materializer,
        ec: ExecutionContext,
        _: OtoroshiClient
    ) => {
      logger.info(
        s"Begin evolution $version - Set isDefault at true on all api"
      )

      dataStore.apiRepo
        .forAllTenant()
        .streamAllRaw()(ec)
        .mapAsync(10) { value =>
          ApiFormat.reads(value) match {
            case JsSuccess(api, _) =>
              dataStore.apiRepo
                .forAllTenant()
                .save(api.copy(isDefault = true))(ec)
            case JsError(errors) =>
              FastFuture.successful(
                logger.error(s"Evolution $version : $errors")
              )
          }
        }
        .runWith(Sink.ignore)(mat)
    }
}

object evolution_151 extends EvolutionScript {
  override def version: String = "1.5.1"

  override def script: (
      Option[DatastoreId],
      DataStore,
      Materializer,
      ExecutionContext,
      OtoroshiClient
  ) => Future[Done] =
    (
        _: Option[DatastoreId],
        dataStore: DataStore,
        mat: Materializer,
        ec: ExecutionContext,
        _: OtoroshiClient
    ) => {
      logger.info(
        s"Begin evolution $version - Convert unlogged home to CMS format"
      )

      dataStore.tenantRepo
        .streamAllRaw()(ec)
        .mapAsync(10) { value =>
          TenantFormat.reads(value) match {
            case JsSuccess(tenant, _) =>
              tenant.style match {
                case Some(value) =>
                  dataStore.cmsRepo
                    .forTenant(tenant)
                    .findOneNotDeleted(Json.obj("path" -> "/"))(ec)
                    .map {
                      case Some(_) => FastFuture.successful(())
                      case None =>
                        val homeId = IdGenerator.token(32)
                        dataStore.cmsRepo
                          .forTenant(tenant)
                          .save(
                            CmsPage(
                              id = CmsPageId(homeId),
                              tenant = tenant.id,
                              visible = value.homePageVisible,
                              authenticated = false,
                              name = "Old unlogged home",
                              forwardRef = None,
                              tags = List(),
                              metadata = Map(),
                              contentType = "text/html",
                              body =
                                if (value.unloggedHome.nonEmpty)
                                  value.unloggedHome
                                else "<!DOCTYPE html><html><head></head><body><h1>Home page</h1><a href=\"/apis\">Back office</a></body></html>",
                              path = Some("/"),
                              lastPublishedDate = Some(DateTime.now())
                            )
                          )(ec)
                        dataStore.tenantRepo.save(
                          tenant.copy(style =
                            tenant.style.map(_.copy(homeCmsPage = Some(homeId)))
                          )
                        )(ec)
                    }(ec)
                case None => FastFuture.successful(())
              }
            case JsError(errors) =>
              FastFuture.successful(
                logger.error(s"Evolution $version : $errors")
              )
          }
        }
        .runWith(Sink.ignore)(mat)
    }
}

object evolution_155 extends EvolutionScript {
  override def version: String = "1.5.5"

  override def script: (
      Option[DatastoreId],
      DataStore,
      Materializer,
      ExecutionContext,
      OtoroshiClient
  ) => Future[Done] =
    (
        _: Option[DatastoreId],
        dataStore: DataStore,
        mat: Materializer,
        ec: ExecutionContext,
        _: OtoroshiClient
    ) => {

      logger.info(
        s"Begin evolution $version - Rewrite all _humanReadableId - sorry for the inconvenience caused"
      )

      val userSource = dataStore.userRepo
        .streamAllRaw()(ec)
        .mapAsync(10) { value =>
          UserFormat.reads(value) match {
            case JsSuccess(v, _) =>
              dataStore.userRepo
                .save(v)(ec)
            case JsError(errors) =>
              FastFuture.successful(
                logger.error(s"Evolution $version : $errors")
              )
          }
        }
      val tenantSource = dataStore.tenantRepo
        .streamAllRaw()(ec)
        .mapAsync(10) { value =>
          TenantFormat.reads(value) match {
            case JsSuccess(v, _) =>
              dataStore.tenantRepo
                .save(v)(ec)
            case JsError(errors) =>
              FastFuture.successful(
                logger.error(s"Evolution $version : $errors")
              )
          }
        }
      val teamSource = dataStore.teamRepo
        .forAllTenant()
        .streamAllRaw()(ec)
        .mapAsync(10) { value =>
          TeamFormat.reads(value) match {
            case JsSuccess(v, _) =>
              dataStore.teamRepo
                .forAllTenant()
                .save(v)(ec)
            case JsError(errors) =>
              FastFuture.successful(
                logger.error(s"Evolution $version : $errors")
              )
          }
        }
      val apiSource = dataStore.apiRepo
        .forAllTenant()
        .streamAllRaw()(ec)
        .mapAsync(10) { value =>
          ApiFormat.reads(value) match {
            case JsSuccess(v, _) =>
              dataStore.apiRepo
                .forAllTenant()
                .save(v)(ec)
            case JsError(errors) =>
              FastFuture.successful(
                logger.error(s"Evolution $version : $errors")
              )
          }
        }

      val repos = Seq(
        userSource,
        tenantSource,
        teamSource,
        apiSource
      )

      Source(repos)
        .flatMapConcat(x => x)
        .runWith(Sink.ignore)(mat)

    }
}

object evolution_157 extends EvolutionScript {

  import cats.data.OptionT
  import cats.implicits._
  override def version: String = "1.5.7"

  override def script: (
      Option[DatastoreId],
      DataStore,
      Materializer,
      ExecutionContext,
      OtoroshiClient
  ) => Future[Done] =
    (
        _: Option[DatastoreId],
        dataStore: DataStore,
        mat: Materializer,
        ec: ExecutionContext,
        otoroshiClient: OtoroshiClient
    ) => {
      logger.info(
        s"Begin evolution $version - sync all subscriptions metadata with associated plan metadata"
      )

      implicit val execContext: ExecutionContext = ec

      val source = dataStore.apiSubscriptionRepo
        .forAllTenant()
        .streamAllRaw(Json.obj("_deleted" -> false))
        .mapAsync(10) { value =>
          ApiSubscriptionFormat.reads(value) match {
            case JsSuccess(sub, _) =>
              logger.info(
                s"begin sync of ${sub.id} with api ${sub.api.asJson}"
              )

              dataStore.apiRepo
                .forTenant(sub.tenant)
                .findOneRaw(Json.obj("_id" -> sub.api.asJson))
                .map {
                  case Some(api) =>
                    (api \ "possibleUsagePlans")
                      .asOpt[JsArray]
                      .map(_.value)
                      .flatMap(
                        _.find(pp => (pp \ "_id").as[String] == sub.plan.value)
                      )
                      .flatMap(pp =>
                        (pp \ "otoroshiTarget" \ "otoroshiSettings")
                          .asOpt[String]
                      )
                  case None => None
                }
                .flatMap {
                  case Some(otoSettingsId) =>
                    (for {
                      api <- OptionT(
                        dataStore.apiRepo
                          .forTenant(sub.tenant)
                          .findOneRaw(Json.obj("_id" -> sub.api.asJson))
                      )
                      tenant <- OptionT(
                        dataStore.tenantRepo
                          .findOne(
                            Json.obj("_id" -> (api \ "_tenant").as[String])
                          )
                      )
                      otoSettings <- OptionT.fromOption[Future](
                        tenant.otoroshiSettings
                          .find(o => o.id.value == otoSettingsId)
                      )

                      realApk <- OptionT.liftF(
                        otoroshiClient
                          .getApikey(sub.apiKey.clientId)(otoSettings)
                      )

                      metadata =
                        realApk
                          .leftMap(_ => Json.obj())
                          .map(apk =>
                            JsObject(
                              (apk.metadata.filterNot(i =>
                                i._1.startsWith("daikoku_")
                              ) -- sub.customMetadata
                                .flatMap(_.asOpt[Map[String, String]])
                                .getOrElse(Map.empty[String, String])
                                .keys).view.mapValues(i => JsString(i)).toSeq
                            )
                          )
                          .merge
                      _ = logger.info(
                        s"${sub.id} :: api ${(api \ "_id").as[String]} with metadata ${metadata}"
                      )
                      _ <- OptionT.liftF(
                        dataStore.apiSubscriptionRepo
                          .forTenant(sub.tenant)
                          .save(sub.copy(metadata = Some(metadata)))
                      )
                    } yield ()).value
                  case _ =>
                    logger.info(s"[${sub.id}] :: no possible usage plans")
                    FastFuture.successful(())
                }

            case JsError(errors) =>
              FastFuture.successful(
                logger.error(s"Evolution $version : $errors")
              )
          }
        }

      source
        .runWith(Sink.ignore)(mat)
    }
}

object evolution_157_b extends EvolutionScript {
  override def version: String = "1.5.7_b"

  override def script: (
      Option[DatastoreId],
      DataStore,
      Materializer,
      ExecutionContext,
      OtoroshiClient
  ) => Future[Done] =
    (
        _: Option[DatastoreId],
        dataStore: DataStore,
        mat: Materializer,
        ec: ExecutionContext,
        _: OtoroshiClient
    ) => {
      logger.info(
        s"Begin evolution $version - rewrite api documentation & doc.humanReadableId"
      )

      implicit val execContext: ExecutionContext = ec

      val rewriteApiDocSource = dataStore.apiRepo
        .forAllTenant()
        .streamAllRaw(Json.obj("_deleted" -> false))
        .mapAsync(10) { value =>
          val apiId = ApiId((value \ "_id").as[String])
          val doc = (value \ "documentation").as[JsObject]
          val oldPages = (doc \ "pages").as[Seq[String]]
          val tenantId = TenantId((value \ "_tenant").as[String])
          val newPages: Future[Seq[ApiDocumentationDetailPage]] =
            Future.sequence(
              oldPages.map(page =>
                dataStore.apiDocumentationPageRepo
                  .forTenant(tenantId)
                  .findById(page)
                  .map {
                    case Some(p) =>
                      ApiDocumentationDetailPage(
                        id = p.id,
                        title = p.title,
                        children = Seq.empty
                      )
                    case None =>
                      ApiDocumentationDetailPage(
                        id = ApiDocumentationPageId(page),
                        title = "",
                        children = Seq.empty
                      )
                  }
              )
            )

          newPages.flatMap(n =>
            dataStore.apiRepo
              .forTenant(tenantId)
              .updateManyByQuery(
                Json.obj(
                  "_id" -> apiId.asJson
                ),
                Json.obj(
                  "$set" -> Json.obj(
                    "documentation" -> (doc ++ Json.obj(
                      "pages" -> SeqApiDocumentationDetailPageFormat.writes(n)
                    ))
                  )
                )
              )
          )
        }

      val recalcDocHumanReadableIdSource = dataStore.apiDocumentationPageRepo
        .forAllTenant()
        .streamAllRaw()(ec)
        .mapAsync(10) { value =>
          ApiDocumentationPageFormat.reads(value) match {
            case JsSuccess(v, _) =>
              dataStore.apiDocumentationPageRepo
                .forAllTenant()
                .save(v)(ec)
            case JsError(errors) =>
              FastFuture.successful(
                logger.error(s"Evolution $version : $errors")
              )
          }
        }

      Source(Seq(rewriteApiDocSource, recalcDocHumanReadableIdSource))
        .flatMapConcat(x => x)
        .runWith(Sink.ignore)(mat)
    }
}

object evolution_157_c extends EvolutionScript {
  override def version: String = "1.5.7_c"

  override def script: (
      Option[DatastoreId],
      DataStore,
      Materializer,
      ExecutionContext,
      OtoroshiClient
  ) => Future[Done] =
    (
        _: Option[DatastoreId],
        dataStore: DataStore,
        mat: Materializer,
        ec: ExecutionContext,
        _: OtoroshiClient
    ) => {
      logger.info(
        s"Begin evolution $version - remove all team.subscriptions"
      )

      implicit val execContext: ExecutionContext = ec

      val eventualLong = dataStore.teamRepo
        .forAllTenant()
        .updateManyByQuery(
          Json.obj(),
          Json.obj(
            "$unset" -> Json.obj(
              "subscriptions" -> ""
            )
          )
        )

      Source
        .future(eventualLong)
        .runWith(Sink.ignore)(mat)

    }
}

object evolution_1612_a extends EvolutionScript {
  override def version: String = "16.1.2_a"

  override def script: (
      Option[DatastoreId],
      DataStore,
      Materializer,
      ExecutionContext,
      OtoroshiClient
  ) => Future[Done] = {
    (
        _: Option[DatastoreId],
        dataStore: DataStore,
        mat: Materializer,
        ec: ExecutionContext,
        _: OtoroshiClient
    ) =>
      {
        logger.info(s"Begin evolution $version - set is default to true")

        implicit val execContext: ExecutionContext = ec

        val future: Future[Long] = for {
          apiWithParents <-
            dataStore.apiRepo
              .forAllTenant()
              .findRaw(
                Json.obj(
                  "_deleted" -> false,
                  "parent" -> Json.obj("$exists" -> true, "$ne" -> null),
                  "isDefault" -> true
                )
              )
          parents =
            apiWithParents.map(api => (api \ "parent").as[String]).distinct
          res <-
            dataStore.apiRepo
              .forAllTenant()
              .updateManyByQuery(
                Json.obj(
                  "parent" -> JsNull,
                  "_id" -> Json.obj("$nin" -> JsArray(parents.map(JsString)))
                ),
                Json.obj(
                  "$set" -> Json.obj(
                    "isDefault" -> true
                  )
                )
              )
        } yield res

        Source
          .future(future)
          .runWith(Sink.ignore)(mat)

      }
  }
}

object evolution_1612_b extends EvolutionScript {
  override def version: String = "16.1.2_b"

  override def script: (
      Option[DatastoreId],
      DataStore,
      Materializer,
      ExecutionContext,
      OtoroshiClient
  ) => Future[Done] = {
    (
        _: Option[DatastoreId],
        dataStore: DataStore,
        mat: Materializer,
        ec: ExecutionContext,
        _: OtoroshiClient
    ) =>
      {
        logger.info(
          s"Begin evolution $version - flag all team as unverified"
        )

        implicit val execContext: ExecutionContext = ec

        val eventualLong = dataStore.teamRepo
          .forAllTenant()
          .updateManyByQuery(
            Json.obj(
              "$or" -> Json.arr(
                Json.obj("type" -> "Personal"),
                Json.obj("type" -> "Admin")
              )
            ),
            Json.obj(
              "$set" -> Json.obj(
                "verified" -> true
              )
            )
          )
          .flatMap(_ =>
            dataStore.teamRepo
              .forAllTenant()
              .updateManyByQuery(
                Json.obj("type" -> "Organization"),
                Json.obj(
                  "$set" -> Json.obj(
                    "verified" -> false
                  )
                )
              )
          )

        Source
          .future(eventualLong)
          .runWith(Sink.ignore)(mat)

      }
  }
}

object evolution_1612_c extends EvolutionScript {
  override def version: String = "16.1.2_c"

  override def script: (
      Option[DatastoreId],
      DataStore,
      Materializer,
      ExecutionContext,
      OtoroshiClient
  ) => Future[Done] = {
    (
        _: Option[DatastoreId],
        dataStore: DataStore,
        mat: Materializer,
        ec: ExecutionContext,
        _: OtoroshiClient
    ) =>
      {
        logger.info(
          s"Begin evolution $version - add routes in authorized entities"
        )

        implicit val execContext: ExecutionContext = ec

        dataStore.apiRepo
          .forAllTenant()
          .streamAllRaw()
          .mapAsync(10)(jsValue => {
            val plans = (jsValue \ "possibleUsagePlans")
              .as[JsArray]
              .value
              .map(plan => {
                val maybeOtoroshiTarget =
                  (plan \ "otoroshiTarget").asOpt[JsObject]

                val maybeAuthorizedEntities = maybeOtoroshiTarget
                  .flatMap(target => {
                    val maybeAuthorizedEntities =
                      (target \ "authorizedEntities").asOpt[JsObject]

                    maybeAuthorizedEntities
                      .map(entities => entities + ("routes" -> Json.arr()))
                  })

                val updatedOtorohiTarget = maybeOtoroshiTarget.map(
                  _ + ("authorizedEntities" -> maybeAuthorizedEntities
                    .getOrElse(JsNull))
                )

                plan.as[JsObject] + ("otoroshiTarget" -> updatedOtorohiTarget
                  .getOrElse(JsNull))
              })

            val goodApi =
              jsValue.as[JsObject] ++ Json.obj("possibleUsagePlans" -> plans)
            dataStore.apiRepo
              .forAllTenant()
              .save(Json.obj("_id" -> (goodApi \ "_id").as[String]), goodApi)(
                ec
              )
          })
          .runWith(Sink.ignore)(mat)
      }
  }
}

object evolution_1613 extends EvolutionScript {
  override def version: String = "16.1.3"

  override def script: (
      Option[DatastoreId],
      DataStore,
      Materializer,
      ExecutionContext,
      OtoroshiClient
  ) => Future[Done] =
    (
        _: Option[DatastoreId],
        dataStore: DataStore,
        mat: Materializer,
        ec: ExecutionContext,
        _: OtoroshiClient
    ) => {
      logger.info(
        s"Begin evolution $version - Update Apis to add property state & update all subscription process"
      )

      implicit val executionContext: ExecutionContext = ec

      val source = dataStore.apiRepo
        .forAllTenant()
        .streamAllRaw()(ec)
        .mapAsync(1) { value =>
          val state =
            if ((value \ "published").asOpt[Boolean].getOrElse(false)) {
              ApiState.Published
            } else {
              ApiState.Created
            }
          val plans = (value \ "possibleUsagePlans")
            .as[JsArray]
            .value

          val updatedPlans = plans.map(oldPlan => {
            val subscriptionProcess =
              (oldPlan \ "subscriptionProcess").asOpt[String] match {
                case Some("Manual") =>
                  Seq(
                    ValidationStep
                      .TeamAdmin(
                        id = IdGenerator.token(32),
                        team = (value \ "team").as(TeamIdFormat)
                      )
                  )
                case _ => Seq.empty
              }

            oldPlan.as[JsObject] ++ Json
              .obj(
                "subscriptionProcess" -> json.SeqValidationStepFormat
                  .writes(subscriptionProcess)
              )
          })

          val updatedApi = value.as[JsObject] ++ Json.obj(
            "state" -> state.name,
            "possibleUsagePlans" -> JsArray(updatedPlans)
          )

          dataStore.apiRepo
            .forAllTenant()
            .save(
              Json.obj({ "_id" -> (updatedApi \ "_id").as[String] }),
              updatedApi
            )
        //FIXME can't get errors ?
        }

      source
        .runWith(Sink.ignore)(mat)

    }
}

object evolution_1613_b extends EvolutionScript {
  override def version: String = "16.1.3_b"

  override def script: (
      Option[DatastoreId],
      DataStore,
      Materializer,
      ExecutionContext,
      OtoroshiClient
  ) => Future[Done] =
    (
        _: Option[DatastoreId],
        dataStore: DataStore,
        mat: Materializer,
        ec: ExecutionContext,
        _: OtoroshiClient
    ) => {
      logger.info(
        s"Begin evolution $version - Update SubscriptionDemands notifications to real subscriptions demand"
      )

      implicit val executionContext: ExecutionContext = ec

      dataStore.notificationRepo
        .forAllTenant()
        .streamAllRaw(
          Json.obj(
            "action.type" -> "ApiSubscription",
            "status.status" -> "Pending",
            "_deleted" -> false
          )
        )
        .mapAsync(1) { value =>
          val tenant = (value \ "_tenant").as(json.TenantIdFormat)
          val action = (value \ "action").as[JsObject]
          val sender = (value \ "sender")
            .asOpt(json.UserFormat)
            .map(_.asNotificationSender)
            .getOrElse((value \ "sender").as(json.NotificationSenderFormat))
          val date = (value \ "date").as(json.DateTimeFormat)
          val apiId = (action \ "api").as(json.ApiIdFormat)
          val planId = (action \ "plan").as(json.UsagePlanIdFormat)
          val teamId = (action \ "team").as(json.TeamIdFormat)
          val parentSubscriptionId = (action \ "parentSubscriptionId").asOpt(
            json.ApiSubscriptionIdFormat
          )
          val motivation = (action \ "motivation")
            .asOpt[String]
            .map(m => Json.obj("motivation" -> m))

          (for {
            api <- OptionT(
              dataStore.apiRepo
                .forAllTenant()
                .findOneRaw(Json.obj("_id" -> apiId.asJson))
            )
            plan <- OptionT.fromOption[Future](
              (api \ "possibleUsagePlans")
                .as[JsArray]
                .value
                .find(plan => (plan \ "_id").as[String] == planId.value)
            )
            demand = SubscriptionDemand(
              id = DemandId(IdGenerator.token),
              tenant = tenant,
              api = apiId,
              plan = (plan \ "_id").as(json.UsagePlanIdFormat),
              steps = (plan \ "subscriptionProcess")
                .as(json.SeqValidationStepFormat)
                .map(step =>
                  SubscriptionDemandStep(
                    id = SubscriptionDemandStepId(IdGenerator.token),
                    state = SubscriptionDemandState.InProgress,
                    step = step
                  )
                ),
              state = SubscriptionDemandState.InProgress,
              team = teamId,
              from = sender.id.get,
              date = date,
              motivation = motivation,
              parentSubscriptionId = parentSubscriptionId
            )
            _ <- OptionT.liftF(
              dataStore.subscriptionDemandRepo
                .forTenant(demand.tenant)
                .save(demand)
            )
            notif = Notification(
              id = (value \ "_id").as(json.NotificationIdFormat),
              tenant = tenant,
              team = teamId.some,
              sender = sender,
              date = date,
              notificationType = NotificationType.AcceptOrReject,
              status = (value \ "status").as(json.NotificationStatusFormat),
              action = NotificationAction.ApiSubscriptionDemand(
                api = apiId,
                plan = planId,
                team = teamId,
                demand = demand.id,
                step = demand.steps.head.id,
                parentSubscriptionId = parentSubscriptionId,
                motivation = (action \ "motivation").asOpt[String]
              )
            )
            result <- OptionT.liftF(
              dataStore.notificationRepo.forTenant(demand.tenant).save(notif)
            )
          } yield ()).value
        }
        .runWith(Sink.ignore)(mat)
    }
}

object evolution_1630 extends EvolutionScript {
  override def version: String = "16.3.0"

  override def script: (
      Option[DatastoreId],
      DataStore,
      Materializer,
      ExecutionContext,
      OtoroshiClient
  ) => Future[Done] =
    (
        _: Option[DatastoreId],
        dataStore: DataStore,
        mat: Materializer,
        ec: ExecutionContext,
        _: OtoroshiClient
    ) => {
      logger.info(
        s"Begin evolution $version - extract all usage plan to new table usage_plans"
      )

      implicit val executionContext: ExecutionContext = ec
      implicit val materializer: Materializer = mat

      dataStore.apiRepo
        .forAllTenant()
        .streamAllRaw()
        .mapAsync(5)(api => {
          logger.debug(
            s"### Begin evolution $version for ${(api \ "name").as[String]}"
          )
          val oldPlans = (api \ "possibleUsagePlans").as[JsArray].value
          logger.debug(s"$oldPlans")

          val updatedOldPlans = oldPlans
            .map(plan =>
              plan.as[JsObject] ++ Json.obj(
                "_id" -> IdGenerator.token(32),
                "_oldId" -> (plan \ "_id").as[String],
                "_tenant" -> (api \ "_tenant").as[String],
                "_deleted" -> false
              )
            )

          val plans = json.SeqUsagePlanFormat
            .reads(JsArray(updatedOldPlans))
            .getOrElse(Seq.empty)

          val updatedRawApi = api
            .as[JsObject] + ("possibleUsagePlans" -> json.SeqUsagePlanIdFormat
            .writes(plans.map(_.id)))

          logger.debug(Json.stringify(updatedRawApi))
          json.ApiFormat.reads(updatedRawApi) match {
            case JsSuccess(updatedApi, _) =>
              for {
                _ <-
                  dataStore.usagePlanRepo
                    .forTenant(updatedApi.tenant)
                    .insertMany(plans)
                _ <- Future.sequence(updatedOldPlans.map(p => {
                  val _id = (p \ "_id").as[String]
                  val oldId = (p \ "_oldId").as[String]
                  val apiId = (api \ "_id").as[String]

                  for {
                    s <- dataStore.apiSubscriptionRepo
                      .forAllTenant()
                      .updateManyByQuery(
                        Json.obj("plan" -> oldId, "api" -> apiId),
                        Json.obj("$set" -> Json.obj("plan" -> _id))
                      )
                    n <- dataStore
                      .notificationRepo.forAllTenant()
                      .execute(
                        query =
                          s"""
                            |UPDATE notifications
                            |     SET content = jsonb_set(content, '{action,plan}', to_jsonb($$1::text))
                            |     WHERE content->'action'->>'plan' = $$2
                            |""".stripMargin,
                        params = Seq(_id, oldId),
                      )

                  } yield logger.debug(s"$s apiSubscription and $n notification updated for plan ${_id}")
                }))
                _ <-
                  dataStore.apiRepo
                    .forTenant(updatedApi.tenant)
                    .save(updatedApi)
              } yield FastFuture.successful(true)
            case JsError(errors) =>
              FastFuture.successful(
                logger.error(
                  s"error during evolution $version - wrong api format ${Json
                    .stringify(updatedRawApi)} -- $errors"
                )
              )
          }
        })
        .runWith(Sink.ignore)
    }
}

object evolution_1634 extends EvolutionScript {
  override def version: String = "16.3.4"

  override def script: (
      Option[DatastoreId],
      DataStore,
      Materializer,
      ExecutionContext,
      OtoroshiClient
  ) => Future[Done] =
    (
        _: Option[DatastoreId],
        dataStore: DataStore,
        mat: Materializer,
        ec: ExecutionContext,
        _: OtoroshiClient
    ) => {
      logger.info(
        s"Begin evolution $version - update all consumptions to set state"
      )

      implicit val executionContext: ExecutionContext = ec
      implicit val materializer: Materializer = mat

      dataStore.consumptionRepo
        .forAllTenant()
        .streamAllRaw()
        .mapAsync(10)(consumption => {
          (consumption \ "state")
            .asOpt(json.ApiKeyConsumptionStateFormat) match {
            case Some(_) => FastFuture.successful(())
            case None =>
              val from = (consumption \ "from").as(json.DateTimeFormat)
              val to = (consumption \ "to").as(json.DateTimeFormat)
              val id = (consumption \ "_id").as[String]

              val state =
                if (from.plusDays(1).equals(to))
                  ApiKeyConsumptionState.Completed
                else
                  ApiKeyConsumptionState.InProgress

              dataStore.consumptionRepo
                .forAllTenant()
                .save(
                  Json.obj("_id" -> id),
                  consumption.as[
                    JsObject
                  ] + ("state" -> json.ApiKeyConsumptionStateFormat
                    .writes(state))
                )
          }
        })
        .runWith(Sink.ignore)
    }
}

object evolution_1750 extends EvolutionScript {
  override def version: String = "17.5.0"

  override def script: (
      Option[DatastoreId],
      DataStore,
      Materializer,
      ExecutionContext,
      OtoroshiClient
  ) => Future[Done] =
    (
        _: Option[DatastoreId],
        dataStore: DataStore,
        mat: Materializer,
        ec: ExecutionContext,
        _: OtoroshiClient
    ) => {
      logger.info(
        s"Begin evolution $version - create cms api"
      )

      implicit val executionContext: ExecutionContext = ec

      val cmsApiDefaultTenantId =
        ApiId(s"cms-api-tenant-${Tenant.Default.value}")

      for {
        tenants <- dataStore.tenantRepo.findAll()
        _ <- Future.sequence(
          tenants.map(tenant =>
            dataStore.teamRepo
              .forTenant(tenant)
              .findOne(Json.obj("type" -> TeamType.Admin.name))
              .flatMap(team => {
                if (team.isDefined) {
                  val (cmsApi, cmsPlan) = ApiTemplate.cmsApi(team.get, tenant)

                  Future.sequence(
                    Seq(
                      dataStore.apiRepo
                        .forTenant(tenant.id)
                        .save(cmsApi),
                      dataStore.usagePlanRepo
                        .forTenant(tenant.id)
                        .save(cmsPlan)
                    )
                  )
                } else {
                  Future.successful(())
                }
              })
          )
        )
      } yield {
        Done
      }
    }
}

object evolution_1820 extends EvolutionScript {
  override def version: String = "18.2.0"

  override def script: (
      Option[DatastoreId],
      DataStore,
      Materializer,
      ExecutionContext,
      OtoroshiClient
  ) => Future[Done] =
    (
        _: Option[DatastoreId],
        dataStore: DataStore,
        mat: Materializer,
        ec: ExecutionContext,
        _: OtoroshiClient
    ) => {
      logger.info(
        s"Begin evolution $version - update plan.customName since it is mandatory value"
      )

      implicit val executionContext: ExecutionContext = ec

      def getOldTypeOfPlan(rawPlan: JsValue): (String, JsValue, JsValue) = {
        logger.debug(s"[evolution $version] :: get type for ${Json.stringify(rawPlan)}")

        (rawPlan \ "customName").asOpt[String] match {
          case Some(name) =>
            (
              name,
              (rawPlan \ "currency").asOpt[JsValue].getOrElse(JsNull).as[JsValue],
              (rawPlan \ "billingDuration").asOpt[JsValue].getOrElse(JsNull).as[JsValue]
            )
          case None if (rawPlan \ "maxPerMonth").asOpt[Long].isEmpty =>
            (
              "Free without quotas",
              JsNull,
              JsNull
            )
          case None if (rawPlan \ "costPerMonth").asOpt[Long].isEmpty && (rawPlan \ "maxPerMonth").asOpt[Long].nonEmpty =>
            (
              "Free with quotas",
              JsNull,
              JsNull
            )
          case None if (rawPlan \ "maxPerMonth").asOpt[Long].nonEmpty && (rawPlan \ "costPerRequest").asOpt[Long].isEmpty =>
            (
              "Quotas with limits",
              (rawPlan \ "currency").as[JsValue],
              (rawPlan \ "billingDuration").as[JsValue]
            )
          case None if (rawPlan \ "maxPerMonth").asOpt[Long].nonEmpty && (rawPlan \ "costPerRequest").asOpt[Long].nonEmpty =>
            (
              "Quotas without limits",
              (rawPlan \ "currency").as[JsValue],
              (rawPlan \ "billingDuration").as[JsValue]
            )
          case None if (rawPlan \ "maxPerMonth").asOpt[Long].nonEmpty  =>
            (
              "Pay per use",
              (rawPlan \ "currency").as[JsValue],
              (rawPlan \ "billingDuration").as[JsValue]
            )
          case _ =>
            logger.error(
              s"[evolution $version] :: no type found :: ${Json.prettyPrint(rawPlan)}"
            )
            (
              (rawPlan \ "customName").asOpt[String].getOrElse("--"),
              JsNull,
              JsNull
            )
        }
      }

      dataStore.usagePlanRepo
        .forAllTenant()
        .streamAllRaw()
        .map(rawPlan => {
          val (customName, currency, billingDuration) =
            getOldTypeOfPlan(rawPlan)
          val patchedJson = rawPlan.as[JsObject] ++ Json.obj(
            "customName" -> customName,
            "currency" -> currency,
            "billingDuration" -> billingDuration
          )
          json.UsagePlanFormat
            .reads(
              patchedJson
            ) match {
            case JsSuccess(plan, _) => plan
            case JsError(errors) =>
              logger.error(
                s"[evolution $version] :: failed to parse plan: $errors\nRaw JSON: $patchedJson"
              )
              throw new RuntimeException(s"Failed to parse plan: $errors")
          }
        })
        .mapAsync(10)(plan => {
          dataStore.usagePlanRepo.forAllTenant().save(plan)
        })
        .runWith(Sink.ignore)(mat)
        .andThen {
          case Success(_) =>
            logger.debug(s"[evolution $version] :: completed successfully")
          case Failure(e) =>
            logger.error(s"[evolution $version] :: failed with error", e)
        }(ec)
    }
}

object evolution_1830 extends EvolutionScript {
  override def version: String = "18.3.0"

  override def script: (
      Option[DatastoreId],
      DataStore,
      Materializer,
      ExecutionContext,
      OtoroshiClient
  ) => Future[Done] =
    (
        _: Option[DatastoreId],
        dataStore: DataStore,
        mat: Materializer,
        ec: ExecutionContext,
        _: OtoroshiClient
    ) => {
      logger.info(
        s"Begin evolution $version - update tenants to use cms pages"
      )

      implicit val executionContext: ExecutionContext = ec

      dataStore.tenantRepo
        .streamAllRaw()
        .map(rawTenant => {
          val tenantId = (rawTenant \ "_id").as(TenantIdFormat)
          val oldCss = (rawTenant \ "style" \ "css").as[String]
          val oldTheme = (rawTenant \ "style" \ "colorTheme").as[String]
          val oldJs = (rawTenant \ "style" \ "js").as[String]

          val cssPage =
            getCustomizationCmsPage(tenantId, "style", "text/css", oldCss)
          val colorThemePage = getCustomizationCmsPage(
            tenantId,
            "color-theme",
            "text/css",
            oldTheme
          )
          val jsPage = getCustomizationCmsPage(
            tenantId,
            "script",
            "text/javascript",
            oldJs
          )

          logger.debug(s"[evolution 18.3.0] :: raw_tenant => ${Json.prettyPrint(rawTenant)}")

          val _tenant = json.TenantFormat.reads(
            rawTenant.as[JsObject]
              ++ Json.obj(
                "style" -> json.DaikokuStyleFormat
                  .reads(
                    (rawTenant \ "style").as[JsObject]
                      ++ Json.obj(
                        "cssCmsPage" -> cssPage.id.value,
                        "jsCmsPage" -> jsPage.id.value,
                        "colorThemeCmsPage" -> colorThemePage.id.value
                      )
                  )
                  .get
                  .asJson
              )
          )

          _tenant match {
            case JsSuccess(value, path) =>
              logger.debug(s"tenant is OK")
            case JsError(errors) => ???
              logger.debug(s"tenant is KO $errors")
          }

          val tenant = Try {
            _tenant
          } recover {
            case e =>
              logger.error(e.getMessage, e)
              JsError(e.getMessage)
          } get

          (tenant.get, cssPage, colorThemePage, jsPage)
        })
        .mapAsync(1)(tuple => {
          logger.debug(
            s"[evolution $version] :: save ${tuple._2.id.value} - ${tuple._2.id.value} - ${tuple._2.id.value}"
          )
          for {
            _ <- dataStore.cmsRepo.forTenant(tuple._1).save(tuple._2)
            _ <- dataStore.cmsRepo.forTenant(tuple._1).save(tuple._3)
            _ <- dataStore.cmsRepo.forTenant(tuple._1).save(tuple._4)
            _ <- dataStore.tenantRepo.save(tuple._1)
          } yield ()
        })
        .runWith(Sink.ignore)(mat)
        .andThen {
          case Success(_) =>
            logger.debug(s"[evolution $version] :: completed successfully")
          case Failure(e) =>
            logger.error(s"[evolution $version] :: failed with error", e)
        }(ec)
    }
}

object evolution_1840_a extends EvolutionScript {
  override def version: String = "18.4.0"

  override def script: (
      Option[DatastoreId],
      DataStore,
      Materializer,
      ExecutionContext,
      OtoroshiClient
  ) => Future[Done] =
    (
        _: Option[DatastoreId],
        dataStore: DataStore,
        mat: Materializer,
        ec: ExecutionContext,
        _: OtoroshiClient
    ) => {
      logger.info(
        s"Begin evolution $version - Extract form step from admin step"
      )

      val count = dataStore.usagePlanRepo
        .forAllTenant()
        .streamAllRaw()(ec)
        .runWith(Sink.fold(0)((count, _) => count + 1))(mat)

      count.map(c => logger.warn(s"il y a $c usage plan en bdd"))(ec)

      dataStore.usagePlanRepo
        .forAllTenant()
        .streamAllRaw()(ec)
        //        .filter(plan => (plan \ "subscriptionProcess").asOpt[JsArray].exists(_.value.nonEmpty))
        //        .filter(plan => (plan \ "subscriptionProcess").as[JsArray].value.exists(step => (step \ "type").as[String] == "teamAdmin"))
        .mapAsync(10) { plan =>
          logger.info(s"evolution for plan ${(plan \ "_id").as[String]}")

          //recuperer le schema et le formatter
          (plan \ "subscriptionProcess")
            .as[JsArray]
            .value
            .find(step => (step \ "type").as[String] == "teamAdmin") match {
            case None =>
              logger.warn("no step admin found")
              FastFuture.successful(false)
            case Some(oldAdminStep) =>
              logger.info(
                s"admin step found for plan ${(plan \ "_id").as[String]}"
              )
              //creer le step form
              val newFormStep = ValidationStep.Form(
                id = IdGenerator.token(32),
                title = "form",
                schema = (oldAdminStep \ "schema").asOpt[JsObject],
                formatter = (oldAdminStep \ "formatter").asOpt[String]
              )
              //creer le nouveau step d'admin
              val newAdminStep = oldAdminStep.as(json.ValidationStepFormat)
              //save le plan modifié
              val subscriptionProcess = json.SeqValidationStepFormat.reads(
                JsArray(
                  (plan \ "subscriptionProcess")
                    .as[JsArray]
                    .value
                    .map(step =>
                      if ((step \ "type").as[String] == "admin")
                        newAdminStep.asJson
                      else step
                    )
                    .prepended(newFormStep.asJson)
                )
              )

              val _plan = plan
                .as(json.UsagePlanFormat)
                .copy(subscriptionProcess = subscriptionProcess.get)
              logger.info(Json.stringify(_plan.asJson))
              dataStore.usagePlanRepo
                .forAllTenant()
                .save(_plan)(ec)
          }

        }
        .runWith(Sink.ignore)(mat)
    }
}

object evolution_1840_b extends EvolutionScript {
  override def version: String = "18.4.0_b"

  override def script: (
      Option[DatastoreId],
      DataStore,
      Materializer,
      ExecutionContext,
      OtoroshiClient
  ) => Future[Done] =
    (
        _: Option[DatastoreId],
        dataStore: DataStore,
        mat: Materializer,
        ec: ExecutionContext,
        _: OtoroshiClient
    ) => {
      logger.info(
        s"Begin evolution $version - create account creation steps"
      )

      implicit val _ec = ec

      dataStore.tenantRepo
        .streamAllRaw()(ec)
        .mapAsync(1) { tenant =>
          dataStore.teamRepo
            .forTenant((tenant \ "_id").as(TenantIdFormat))
            .findOneNotDeleted(Json.obj("type" -> TeamType.Admin.name))
            .map(t => (tenant, t))
        }
        .mapAsync(10) {
          case (tenant, maybeTeam) if maybeTeam.isDefined =>
            val formStep = ValidationStep.Form(
              id = IdGenerator.token(32),
              title = "form",
              schema = Json
                .obj(
                  "name" -> Json.obj(
                    "type" -> "string",
                    "label" -> "account.creation.form.name.label",
                    "constraints" -> Json.arr(
                      Json.obj(
                        "type" -> "required",
                        "message" -> "constraints.required.name"
                      )
                    )
                  ),
                  "email" -> Json.obj(
                    "type" -> "string",
                    "format" -> "email",
                    "label" -> "account.creation.form.email.label",
                    "constraints" -> Json.arr(
                      Json.obj(
                        "type" -> "required",
                        "message" -> "constraints.required.email"
                      )
                    )
                  ),
                  "password" -> Json.obj(
                    "type" -> "string",
                    "format" -> "password",
                    "label" -> "account.creation.form.password.label",
                    "constraints" -> Json.arr(
                      Json.obj(
                        "type" -> "required",
                        "message" -> "constraints.required.password"
                      ),
                      Json.obj(
                        "type" -> "matches",
                        "regexp" -> "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[#$^+=!*()@%&]).{8,1000}$",
                        "message" -> "constraints.matches.password"
                      )
                    )
                  ),
                  "confirmPassword" -> Json.obj(
                    "type" -> "string",
                    "format" -> "password",
                    "label" -> "account.creation.form.confirm.password.label",
                    "constraints" -> Json.arr(
                      Json.obj(
                        "type" -> "required",
                        "message" -> "constraints.required.confirmPassword"
                      ),
                      Json.obj(
                        "type" -> "oneOf",
                        "arrayOfValues" -> Json
                          .arr(Json.obj("ref" -> "password")),
                        "message" -> "constraints.oneof.confirm.password"
                      )
                    )
                  )
                )
                .some,
              formatter = "".some
            )
            val mailStep = ValidationStep.Email(
              id = IdGenerator.token(32),
              emails = Seq("${form.email}"),
              message = "".some,
              title = "confirm email"
            )

            val jsTenant = tenant.as[JsObject] +
              ("accountCreationProcess" -> json.SeqValidationStepFormat.writes(
                Seq(
                  formStep,
                  mailStep
                )
              ))
            json.TenantFormat.reads(jsTenant) match {
              case JsSuccess(value, _) => dataStore.tenantRepo.save(value)

              case JsError(e) =>
                logger.error(
                  s"error during evolution $version => unable to evolve tenant ${(tenant \ "_id").as[String]}"
                )
                logger.error(e.toString())
                FastFuture.successful(())
            }
          case _ =>
            logger.error(
              s"error during evolution $version => unable to evolve tenant - no admin team found"
            )
            FastFuture.successful(())
        }
        .runWith(Sink.ignore)(mat)
    }
}

object evolution_1840_c extends EvolutionScript {
  override def version: String = "18.4.0_c"

  override def script: (
      Option[DatastoreId],
      DataStore,
      Materializer,
      ExecutionContext,
      OtoroshiClient
  ) => Future[Done] =
    (
        _: Option[DatastoreId],
        dataStore: DataStore,
        mat: Materializer,
        ec: ExecutionContext,
        otoroshiClient: OtoroshiClient
    ) => {
      logger.info(
        s"Begin evolution $version - get bearer token for all existing key"
      )

      implicit val _ec: ExecutionContext = ec

      dataStore.tenantRepo
        .streamAllRawFormatted()
        .flatMapConcat(tenant => {
          dataStore.apiSubscriptionRepo
            .forTenant(tenant)
            .streamAllRawFormatted()
            .mapAsync(10)(subscription => {
              (for {
                usagePlan <-
                  EitherT.fromOptionF[Future, Option[Unit], UsagePlan](
                    dataStore.usagePlanRepo
                      .forTenant(tenant)
                      .findByIdNotDeleted(subscription.plan),
                    None
                  )
                _ <- EitherT.cond[Future][Option[Unit], Unit](
                  usagePlan.visibility != Admin,
                  (),
                  None
                )
                otoroshiSettings <-
                  EitherT.fromOption[Future][Option[Unit], OtoroshiSettings](
                    tenant.otoroshiSettings.find(s =>
                      usagePlan.otoroshiTarget
                        .exists(_.otoroshiSettings == s.id)
                    ),
                    None
                  )
                keyWithBearer <- EitherT(
                  otoroshiClient
                    .getApikey(subscription.apiKey.clientId)(otoroshiSettings)
                ).leftMap[Option[Unit]](_ => None)
                _ <- EitherT.liftF[Future, Option[Unit], Boolean](
                  dataStore.apiSubscriptionRepo
                    .forTenant(tenant)
                    .save(subscription.copy(bearerToken = keyWithBearer.bearer))
                )
              } yield Some(())).merge
            })
        })
        .runWith(Sink.ignore)(mat)
    }
}

object evolutions {
  val list: List[EvolutionScript] =
    List(
      evolution_102,
      evolution_150,
      evolution_151,
      evolution_155,
      evolution_157,
      evolution_157_b,
      evolution_157_c,
      evolution_1612_a,
      evolution_1612_b,
      evolution_1612_c,
      evolution_1613,
      evolution_1613_b,
      evolution_1630,
      evolution_1634,
      evolution_1750,
      evolution_1820,
      evolution_1830,
      evolution_1840_a,
      evolution_1840_b,
      evolution_1840_c
    )
  def run(
      dataStore: DataStore,
      otoroshiClient: OtoroshiClient
  )(implicit ec: ExecutionContext, mat: Materializer): Future[Done] = {
    AppLogger.info("Running missing evolutions")
    Source(list)
      .mapAsync(1) { evolution =>
        dataStore.evolutionRepo
          .findOne(Json.obj("version" -> evolution.version))
          .flatMap {
            case None =>
              evolution.run(None, dataStore, otoroshiClient).flatMap { _ =>
                dataStore.evolutionRepo
                  .save(
                    Evolution(
                      id = DatastoreId(IdGenerator.token(32)),
                      version = evolution.version,
                      applied = true
                    )
                  )
                  .map(f => {
                    AppLogger.info(s"Evolution ${evolution.version} done")
                    f
                  })
              }

            case Some(e) if !e.applied =>
              evolution
                .run(Some(e.id), dataStore, otoroshiClient)
                .flatMap { _ =>
                  dataStore.evolutionRepo
                    .save(
                      Evolution(
                        id = e.id,
                        version = evolution.version,
                        applied = true
                      )
                    )(ec)
                    .map(f => {
                      AppLogger.info(s"Evolution ${evolution.version} done")
                      f
                    })
                }

            case _ => FastFuture.successful(Done)
          }
      }
      .runWith(Sink.ignore)
  }
}
