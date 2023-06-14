package fr.maif.otoroshi.daikoku.utils

import akka.http.scaladsl.util.FastFuture
import akka.stream.Materializer
import akka.stream.scaladsl.{Sink, Source}
import cats.data.{EitherT, OptionT}
import cats.implicits.catsSyntaxOptionId
import controllers.AppError
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import jobs.ApiKeyStatsJob
import play.api.libs.json.{JsArray, JsNull, JsObject, JsValue, Json}
import reactivemongo.bson.BSONObjectID

import scala.concurrent.Future

class DeletionService(env: Env, apiService: ApiService, apiKeyStatsJob: ApiKeyStatsJob, otoroshiClient: OtoroshiClient) {

  implicit val ec = env.defaultExecutionContext

  /**
    * Delete logically a team
    * Add an operation in deletion queue to process complete deletion (delete user notifications & messages)
    * @param user a User to delete
    * @param tenant the tenant where delete the user
    * @return an Either of Unit or AppError (actually Right[Unit])
    */
  private def deleteUser(user: User,
                         tenant: Tenant): EitherT[Future, AppError, Unit] = {
    val operation = Operation(
      DatastoreId(BSONObjectID.generate().stringify),
      tenant = tenant.id,
      itemId = user.id.value,
      itemType = ItemType.User,
      action = OperationAction.Delete
    )

    AppLogger.debug(s"add **user**[${user.name}] to deletion queue")
    for {
      _ <- EitherT.liftF(env.dataStore.userRepo.deleteByIdLogically(user.id))
      _ <- EitherT.liftF(
        env.dataStore.operationRepo.forTenant(tenant).save(operation))
    } yield ()
  }

  /**
    * Delete logically a team
    * Add an operation in deletion queue to process complete deletion (delete team notifications)
    * @param team a Team do delete
    * @param tenant the tenant where delete the team
    * @return an Either of Unit or AppError (actually Right[Unit])
    */
  private def deleteTeam(team: Team,
                         tenant: Tenant): EitherT[Future, AppError, Unit] = {
    val operation = Operation(
      DatastoreId(BSONObjectID.generate().stringify),
      tenant = tenant.id,
      itemId = team.id.value,
      itemType = ItemType.Team,
      action = OperationAction.Delete
    )

    AppLogger.debug(
      s"[deletion service] :: add **team**[${team.name}] to deletion queue")
    for {
      _ <- EitherT.liftF(
        env.dataStore.teamRepo.forTenant(tenant).deleteByIdLogically(team.id))
      _ <- EitherT.liftF(
        env.dataStore.operationRepo.forTenant(tenant).save(operation))
    } yield ()
  }

  private def deleteSubscription(subscription: ApiSubscription, tenant: Tenant, user: User): EitherT[Future, AppError, Unit] = {
    def deleteOtoroshiKey(apiSubscription: ApiSubscription, plan: UsagePlan, tenant: Tenant): EitherT[Future, AppError, Unit] = {
      val error: EitherT[Future, AppError, Unit] = EitherT.leftT[Future, Unit](AppError.EntityNotFound("Otoroshi settings"))
      plan.otoroshiTarget match {
        case Some(target) => tenant.otoroshiSettings.find(s => s.id == target.otoroshiSettings) match {
          case Some(otoroshiSettings) => {
            implicit val s: OtoroshiSettings = otoroshiSettings
            EitherT.liftF(otoroshiClient.deleteApiKey(apiSubscription.apiKey.clientId))
          }
          case None => error
        }
        case None => error
      }
    }

    for {
      api <- EitherT.fromOptionF(env.dataStore.apiRepo.forTenant(tenant).findById(subscription.api), AppError.ApiNotFound)
      plan <- EitherT.fromOption[Future](api.possibleUsagePlans.find(_.id == subscription.plan), AppError.PlanNotFound)
      notif = Notification(
        id = NotificationId(BSONObjectID.generate().stringify),
        tenant = tenant.id,
        team = Some(subscription.team),
        sender = user.asNotificationSender,
        notificationType = NotificationType.AcceptOnly,
        action = NotificationAction.ApiKeyDeletionInformation(api.name, subscription.apiKey.clientId)
      )
      _ <- EitherT.liftF(apiKeyStatsJob.syncForSubscription(subscription, tenant, completed = true))
      //todo: deaggregate key
      _ <- deleteOtoroshiKey(subscription, plan, tenant)
      _ <- plan.paymentSettings match {
        case Some(settings) => EitherT.liftF(env.dataStore.operationRepo.forTenant(tenant).save(Operation(
          DatastoreId(IdGenerator.token(24)),
          tenant = tenant.id,
          itemId = subscription.id.value,
          itemType = ItemType.ThirdPartySubscription,
          action = OperationAction.Delete,
          payload = Json.obj(
            "paymentSettings" -> settings.asJson,
            "thirdPartySubscriptionInformations" -> subscription.thirdPartySubscriptionInformations.map(_.asJson).getOrElse(JsNull).as[JsValue]
          ).some
        )))
        case None => EitherT.pure[Future, AppError](())
      }
      _ <- EitherT.liftF(env.dataStore.notificationRepo.forTenant(tenant).save(notif))
    } yield ()
  }

  /**
   * delete logically all subscriptions
   * add for each subscriptions an operation in queue to process a complete deletion of each Api
   * (disable apikey in otoroshi, compute consumptions, close third-party subscription, delete notifications)
   *
   * @param subscriptions Sequence of [[ApiSubscription]]
   * @param tenant        the [[Tenant]] where delete those ApiSubscriptions
   * @param user          the [[User]] who triggered the deletion
   * @return EitherT of AppError or Unit (actually a RightT[Unit])
   */
  private def deleteSubscriptions(subscriptions: Seq[ApiSubscription],
                                  tenant: Tenant,
                                  user: User): EitherT[Future, AppError, Boolean] = {
    implicit val m: Materializer = env.defaultMaterializer
    AppLogger.debug(s"[deletion service] :: add **subscriptions**[${subscriptions.map(_.id).mkString(",")}] to deletion queue")

    EitherT(Source(subscriptions)
      .mapAsync(1)(subscription => deleteSubscription(subscription, tenant, user).value)
      .runWith(Sink.fold[Either[AppError, Unit], Either[AppError, Unit]](Right[AppError, Unit](()))((_, either) => either)))
      .flatMap(_ => EitherT.liftF(env.dataStore.apiSubscriptionRepo
        .forTenant(tenant)
        .deleteLogically(Json.obj("_id" -> Json.obj("$in" -> JsArray(subscriptions.map(_.id.asJson).distinct))))))
  }

  /**
    * delete logically all apis
    * add for each apis an operation in queue to process a complete deletion of each Api
    * (delete doc, issues, posts & notifications)
   *
   * @param apis A sequence of Api to delete
    * @param tenant the tenant where delete those apis
    * @return an EitherT of AppError or Unit (actually a RightT[Unit])
   */
  private def deleteApis(apis: Seq[Api],
                         tenant: Tenant,
                         user: User): EitherT[Future, AppError, Unit] = {
    val operations = apis.distinct
      .map(
        s =>
          Operation(
            DatastoreId(BSONObjectID.generate().stringify),
            tenant = tenant.id,
            itemId = s.id.value,
            itemType = ItemType.Api,
            action = OperationAction.Delete
        ))

    AppLogger.debug(s"[deletion service] :: add **apis**[${apis.map(_.name).mkString(",")}] to deletion queue")


    val planDeletion = Source(apis)
      .flatMapConcat(api => Source(api.possibleUsagePlans.map(plan => (api, plan))))
      .mapAsync(5){ case (api, plan) =>
        for {
          _ <- apiService.deleteApiPlansSubscriptions(Seq(plan), api, tenant, user)
          _ <- plan.paymentSettings match {
            case Some(paymentSettings) => env.dataStore.operationRepo.forTenant(tenant).save(
              Operation(
                DatastoreId(IdGenerator.token(24)),
                tenant = tenant.id,
                itemId = plan.id.value,
                itemType = ItemType.ThirdPartyProduct,
                action = OperationAction.Delete,
                payload = Json.obj("paymentSettings" -> paymentSettings.asJson).some
              )
            )
            case None => FastFuture.successful(())
          }
        } yield ()
      }
      .runWith(Sink.ignore)(env.defaultMaterializer)

    val r = for {
      _ <- planDeletion
      _ <- env.dataStore.apiRepo
        .forTenant(tenant)
        .deleteLogically(Json.obj("_id" ->
          Json.obj("$in" -> JsArray(apis.map(_.id.asJson).distinct))))
      _ <- env.dataStore.operationRepo.forTenant(tenant).insertMany(operations)
    } yield ()

    EitherT.liftF(r)
  }

  /**
    * delete a personal user team in the provided tenant
    * Flag a user as deleted if there is no other account in another tenant
    * Add team (and him probably) to deletion queue to process complete deletion
    *
    * @param userId [[UserId]]
    * @param tenant [[TenantId]]
    * @param user [[User]]
    * @return an EitherT of AppError or Unit
    */
  def deleteUserByQueue(userId: String,
                        tenant: Tenant,
                        user: User): EitherT[Future, AppError, Unit] = {
    for {
      user <- EitherT.fromOptionF(
        env.dataStore.userRepo.findByIdNotDeleted(userId),
        AppError.UserNotFound)
      team <- EitherT.fromOptionF(
        env.dataStore.teamRepo
          .forTenant(tenant)
          .findOneNotDeleted(Json.obj("type" -> TeamType.Personal.name,
                                      "users.userId" -> user.id.asJson)),
        AppError.TeamNotFound
      )
      otherTeams <- EitherT.liftF(
        env.dataStore.teamRepo
          .forAllTenant()
          .find(Json.obj("type" -> TeamType.Personal.name,
                         "users.userId" -> user.id.asJson)))
      _ <- deleteTeamByQueue(team.id, team.tenant, user)
      _ <- if (otherTeams.length > 1) EitherT.rightT[Future, AppError](())
      else deleteUser(user, tenant)
      _ <- EitherT.liftF(
        env.dataStore.userSessionRepo.delete(
          Json.obj(
            "userId" -> userId
          )))
    } yield ()
  }

  /**
    * Flag a user as deleted and delete his all teams in all possible tenants
    * Add him and his personal teams to deletion queue to process complete deletion
    *
    * @param userId [[UserId]]
    * @param tenant [[TenantId]]
    * @param user [[User]]
    * @return an EitherT of AppError or Unit
    */
  def deleteCompleteUserByQueue(
      userId: String,
      tenant: Tenant,
      user: User): EitherT[Future, AppError, Unit] = {
    for {
      user <- EitherT.fromOptionF(
        env.dataStore.userRepo.findByIdNotDeleted(userId),
        AppError.UserNotFound)
      teams <- EitherT.liftF(
        env.dataStore.teamRepo
          .forAllTenant()
          .findNotDeleted(Json.obj("type" -> TeamType.Personal.name,
                                   "users.userId" -> user.id.asJson)))
      _ <- EitherT.liftF(Future.sequence(teams.map(team =>
        deleteTeamByQueue(team.id, team.tenant, user).value)))
      _ <- deleteUser(user, tenant)
      _ <- EitherT.liftF(
        env.dataStore.userSessionRepo.delete(
          Json.obj(
            "userId" -> userId
          )))
    } yield ()
  }

  /**
    * Flag a team as deleted and delete his subscriptions, apis and those apis subscriptions
    * add team, subs and apis to deletion queue to process complete deletion
    * @param id [[TeamId]]
    * @param tenant [[TenantId]]
    * @return an EitherT of AppError or Unit
    */
  def deleteTeamByQueue(id: TeamId,
                        tenant: TenantId,
                        user: User): EitherT[Future, AppError, Unit] = {
    implicit val m = env.defaultMaterializer

    for {
      tenant <- EitherT.fromOptionF(
        env.dataStore.tenantRepo.findByIdNotDeleted(tenant),
        AppError.TenantNotFound)
      team <- EitherT.fromOptionF(
        env.dataStore.teamRepo.forTenant(tenant).findByIdNotDeleted(id),
        AppError.TeamNotFound)
      apis <- EitherT.liftF(
        env.dataStore.apiRepo
          .forTenant(tenant)
          .find(Json.obj("team" -> team.id.asJson)))
      //just subscriptions to other apis than the team apis
      teamSubscriptions <- EitherT.liftF(
        env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .find(Json.obj(
            "team" -> team.id.asJson,
            "api" -> Json.obj("$nin" -> JsArray(apis.map(_.id.asJson)))
          )))
      _ <- deleteSubscriptions(teamSubscriptions, tenant, user)
      _ <- EitherT.liftF(Future.sequence(apis.map(api => deleteApiByQueue(api.id, tenant.id, user).value)))
      _ <- deleteTeam(team, tenant)
    } yield ()
  }

  /**
   * Flag an api as deleted and delete his subscriptions
   * add api & subs to deletion queue to process complete deletion
   *
   * @param id     [[ApiId]]
   * @param tenant [[TenantId]]
   * @param user [[User]]
   * @return an EitherT of AppError or Unit
   */
  def deleteApiByQueue(id: ApiId,
                       tenant: TenantId,
                       user: User): EitherT[Future, AppError, Unit] = {
    for {
      tenant <- EitherT.fromOptionF(
        env.dataStore.tenantRepo.findByIdNotDeleted(tenant),
        AppError.TenantNotFound)
      api <- EitherT.fromOptionF(
        env.dataStore.apiRepo.forTenant(tenant).findByIdNotDeleted(id),
        AppError.TeamNotFound)
      subscriptions <- EitherT.liftF(
        env.dataStore.apiSubscriptionRepo
          .forTenant(tenant)
          .find(Json.obj("api" -> api.id.asJson)))
      _ <- deleteSubscriptions(subscriptions, tenant, user)
      _ <- deleteApis(Seq(api), tenant, user)
    } yield ()
  }
}
