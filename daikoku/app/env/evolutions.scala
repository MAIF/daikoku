package fr.maif.otoroshi.daikoku.env

import akka.Done
import akka.http.scaladsl.util.FastFuture
import akka.stream.Materializer
import akka.stream.scaladsl.{Sink, Source}
import cats.data.OptionT
import cats.implicits.catsSyntaxOptionId
import fr.maif.otoroshi.daikoku.domain.json.{ApiDocumentationPageFormat, ApiFormat, ApiSubscriptionFormat, NotificationFormat, SeqApiDocumentationDetailPageFormat, TeamFormat, TeamIdFormat, TenantFormat, UserFormat}
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.logger.AppLogger
import fr.maif.otoroshi.daikoku.utils.{ApiService, IdGenerator, OtoroshiClient}
import org.joda.time.DateTime
import play.api.libs.json._
import reactivemongo.bson.BSONObjectID
import storage.DataStore

import scala.concurrent.{ExecutionContext, Future}

sealed trait EvolutionScript {
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
      AppLogger.info("Begin evolution 1.0.2")
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
      AppLogger.info(
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
                AppLogger.error(s"Evolution $version : $errors")
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
      AppLogger.info(
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
                        val homeId = BSONObjectID.generate().stringify
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
                              draft =
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
                AppLogger.error(s"Evolution $version : $errors")
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

      AppLogger.info(
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
                AppLogger.error(s"Evolution $version : $errors")
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
                AppLogger.error(s"Evolution $version : $errors")
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
                AppLogger.error(s"Evolution $version : $errors")
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
                AppLogger.error(s"Evolution $version : $errors")
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
      AppLogger.info(
        s"Begin evolution $version - sync all subscriptions metadata with associated plan metadata"
      )

      implicit val execContext: ExecutionContext = ec

      val source = dataStore.apiSubscriptionRepo
        .forAllTenant()
        .streamAllRaw()
        .mapAsync(10) { value =>
          ApiSubscriptionFormat.reads(value) match {
            case JsSuccess(sub, _) =>
              AppLogger.info(
                s"begin sync of ${sub.id} with api ${sub.api.asJson}"
              )
              (for {
                api <- OptionT(
                  dataStore.apiRepo
                    .forTenant(sub.tenant)
                    .findOne(Json.obj("_id" -> sub.api.asJson))
                )
                otoSettingsId <- OptionT.fromOption[Future](
                  api.possibleUsagePlans
                    .find(pp => pp.id == sub.plan)
                    .flatMap(pp => pp.otoroshiTarget)
                    .map(_.otoroshiSettings)
                )
                tenant <- OptionT(
                  dataStore.tenantRepo
                    .findOne(Json.obj("_id" -> api.tenant.asJson))
                )
                otoSettings <- OptionT.fromOption[Future](
                  tenant.otoroshiSettings.find(o => o.id == otoSettingsId)
                )

                realApk <- OptionT.liftF(
                  otoroshiClient.getApikey(sub.apiKey.clientId)(otoSettings)
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

                _ = AppLogger.info(
                  s"${sub.id} :: api ${api.id} with metadata ${Json.stringify(metadata)}"
                )
                _ <- OptionT.liftF(
                  dataStore.apiSubscriptionRepo
                    .forTenant(sub.tenant)
                    .save(sub.copy(metadata = Some(metadata)))
                )
              } yield ()).value
            case JsError(errors) =>
              FastFuture.successful(
                AppLogger.error(s"Evolution $version : $errors")
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
      AppLogger.info(
        s"Begin evolution $version - rewrite api documentation & doc.humanReadableId"
      )

      implicit val execContext: ExecutionContext = ec

      val rewriteApiDocSource = dataStore.apiRepo
        .forAllTenant()
        .streamAllRaw()
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
                AppLogger.error(s"Evolution $version : $errors")
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
      AppLogger.info(
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

  override def script: (Option[DatastoreId], DataStore, Materializer, ExecutionContext, OtoroshiClient) => Future[Done] = {
    (
      _: Option[DatastoreId],
      dataStore: DataStore,
      mat: Materializer,
      ec: ExecutionContext,
      _: OtoroshiClient
    ) => {
      AppLogger.info(
        s"Begin evolution $version - set is default to true")

      implicit val execContext: ExecutionContext = ec

      val future: Future[Long] = for {
        apiWithParents <- dataStore.apiRepo.forAllTenant().findNotDeleted(Json.obj(
          "parent" -> Json.obj("$exists" -> true),
          "isDefault" -> true
        ))
        parents = apiWithParents.map(_.parent.get).distinct
        res <- dataStore.apiRepo
          .forAllTenant()
          .updateManyByQuery(Json.obj(
            "parent" -> JsNull,
            "_id" -> Json.obj("$nin" -> JsArray(parents.map(_.asJson)))
          ),
            Json.obj(
              "$set" -> Json.obj(
                "isDefault" -> true,
              )))
      } yield res




      Source
        .future(future)
        .runWith(Sink.ignore)(mat)

    }
  }
}

object evolution_1612_b extends EvolutionScript {
  override def version: String = "16.1.2_b"

  override def script: (Option[DatastoreId], DataStore, Materializer, ExecutionContext, OtoroshiClient) => Future[Done] = {
    (
      _: Option[DatastoreId],
      dataStore: DataStore,
      mat: Materializer,
      ec: ExecutionContext,
      _: OtoroshiClient
    ) => {
      AppLogger.info(
        s"Begin evolution $version - flag all team as unverified")

      implicit val execContext: ExecutionContext = ec

      val eventualLong = dataStore.teamRepo
        .forAllTenant()
        .updateManyByQuery(Json.obj("$or" -> Json.arr(
          Json.obj("type" -> "Personal"),
          Json.obj("type" -> "Admin")
        )),
          Json.obj(
            "$set" -> Json.obj(
              "verified" -> true,
            ))).flatMap(_ =>
        dataStore.teamRepo.forAllTenant().updateManyByQuery(Json.obj("type" -> "Organization")
          , Json.obj(
            "$set" -> Json.obj(
              "verified" -> false,
            ))
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

  override def script: (Option[DatastoreId], DataStore, Materializer, ExecutionContext, OtoroshiClient) => Future[Done] = {
    (
      _: Option[DatastoreId],
      dataStore: DataStore,
      mat: Materializer,
      ec: ExecutionContext,
      _: OtoroshiClient
    ) => {
      AppLogger.info(
        s"Begin evolution $version - add routes in authorized entities")

      implicit val execContext: ExecutionContext = ec

      dataStore.apiRepo
        .forAllTenant()
        .streamAllRaw()
        .mapAsync(10)(jsValue => {
          val plans = (jsValue \ "possibleUsagePlans").as[JsArray].value
            .map(plan => {
              val maybeOtoroshiTarget = (plan \ "otoroshiTarget").asOpt[JsObject]

              val maybeAuthorizedEntities = maybeOtoroshiTarget
                .flatMap(target => {
                  val maybeAuthorizedEntities = (target \ "authorizedEntities").asOpt[JsObject]

                  maybeAuthorizedEntities
                    .map(entities => entities + ("routes" -> Json.arr()))
                })

              val updatedOtorohiTarget = maybeOtoroshiTarget.map(_ + ("authorizedEntities" -> maybeAuthorizedEntities.getOrElse(JsNull)))

              plan.as[JsObject] + ("otoroshiTarget" -> updatedOtorohiTarget.getOrElse(JsNull))
            })

          val goodApi = jsValue.as[JsObject] ++ Json.obj("possibleUsagePlans" -> plans)
          dataStore.apiRepo
            .forAllTenant()
            .save(Json.obj("_id" -> (goodApi \ "_id").as[String]), goodApi)(ec)
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
      AppLogger.info(
        s"Begin evolution $version - Update Apis to add property state & update all subscription process"
      )

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

          val updatedPlans =  plans.map(oldPlan => {
            val subscriptionProcess = (oldPlan \ "subscriptionProcess").asOpt[String] match {
              case Some("Manual") => Seq(
                ValidationStep
                  .TeamAdmin(
                    id = IdGenerator.token(32),
                    team = (value \ "team").as(TeamIdFormat))
              )
              case _ => Seq.empty
            }


            oldPlan.as[JsObject] ++ Json
              .obj("subscriptionProcess" -> json.SeqValidationStepFormat.writes(subscriptionProcess))
          })

          val updatedApi = value.as[JsObject] ++ Json.obj(
            "state" -> state.name,
            "possibleUsagePlans" -> JsArray(updatedPlans)
          )

          ApiFormat.reads(updatedApi) match {
            case JsSuccess(v, _) =>
              dataStore.apiRepo
                .forAllTenant()
                .save(v)(ec)
            case JsError(errors) =>
              AppLogger.error(s"Evolution $version errored : $errors")
              FastFuture.successful(
                AppLogger.error(s"Evolution $version : $errors")
              )
          }
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
      AppLogger.info(s"Begin evolution $version - Update SubscriptionDemands notifications to real subscriptions demand")

      implicit val executionContext: ExecutionContext = ec

      dataStore.notificationRepo.forAllTenant()
        .streamAllRaw(Json.obj("action.type" -> "ApiSubscription", "status.status" -> "Pending", "_deleted" -> false))
        .mapAsync(1) { value =>

          val tenant = (value \ "_tenant").as(json.TenantIdFormat)
          val action = (value \ "action").as[JsObject]
          val sender = (value \ "sender").asOpt(json.UserFormat).map(_.asNotificationSender).getOrElse((value \ "sender").as(json.NotificationSenderFormat))
          val date = (value \ "date").as(json.DateTimeFormat)
          val apiId = (action \ "api").as(json.ApiIdFormat)
          val planId = (action \ "plan").as(json.UsagePlanIdFormat)
          val teamId = (action \ "team").as(json.TeamIdFormat)
          val parentSubscriptionId = (action \ "parentSubscriptionId").asOpt(json.ApiSubscriptionIdFormat)
          val motivation = (action \ "motivation").asOpt[String]

          (for {
            api <- OptionT(dataStore.apiRepo.forAllTenant().findById(apiId))
            plan <- OptionT.fromOption[Future](api.possibleUsagePlans.find(_.id == planId))
            demand = SubscriptionDemand(
              id = SubscriptionDemandId(IdGenerator.token),
              tenant = tenant,
              api = api.id,
              plan = plan.id,
              steps = plan.subscriptionProcess.map(step => SubscriptionDemandStep(
                id = SubscriptionDemandStepId(IdGenerator.token),
                state = SubscriptionDemandState.InProgress,
                step = step,
              )),
              state = SubscriptionDemandState.InProgress,
              team = teamId,
              from = sender.id.get,
              date = date,
              motivation = motivation,
              parentSubscriptionId = parentSubscriptionId
            )
            _ <- OptionT.liftF(dataStore.subscriptionDemandRepo.forTenant(demand.tenant).save(demand))
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
                motivation = motivation
              )
            )
            _ <- OptionT.liftF(dataStore.notificationRepo.forTenant(demand.tenant).save(notif))
          } yield ()).value
        }
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
      evolution_1613_b
    )
  def run(
      dataStore: DataStore,
      otoroshiClient: OtoroshiClient
  )(implicit ec: ExecutionContext, mat: Materializer): Future[Done] =
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
                      id = DatastoreId(BSONObjectID.generate().stringify),
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
