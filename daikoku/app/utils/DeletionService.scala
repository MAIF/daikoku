package fr.maif.otoroshi.daikoku.utils

import cats.data.EitherT
import controllers.AppError
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import play.api.libs.json.{JsArray, Json}
import reactivemongo.bson.BSONObjectID

import scala.concurrent.Future

class DeletionService(env: Env) {

  implicit val ec = env.defaultExecutionContext

  /**
   * Delete logically a team
   * Add an operation in deletion queue to process complete deletion (delete user notifications & messages)
   * @param user a User to delete
   * @param tenant the tenant where delete the user
   * @return an Either of Unit or AppError (actually Right[Unit])
   */
  def deleteUser(user: User, tenant: Tenant): EitherT[Future, AppError, Unit] = {
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
      _ <- EitherT.liftF(env.dataStore.operationRepo.forTenant(tenant).save(operation))
    } yield ()
  }

  /**
   * Delete logically a team
   * Add an operation in deletion queue to process complete deletion (delete team notifications)
   * @param team a Team do delete
   * @param tenant the tenant where delete the team
   * @return an Either of Unit or AppError (actually Right[Unit])
   */
  def deleteTeam(team: Team, tenant: Tenant): EitherT[Future, AppError, Unit] = {
    val operation = Operation(
      DatastoreId(BSONObjectID.generate().stringify),
      tenant = tenant.id,
      itemId = team.id.value,
      itemType = ItemType.Team,
      action = OperationAction.Delete
    )

    AppLogger.debug(s"[deletion service] :: add **team**[${team.name}] to deletion queue")
    for {
      _ <- EitherT.liftF(env.dataStore.teamRepo.forTenant(tenant).deleteByIdLogically(team.id))
      _ <- EitherT.liftF(env.dataStore.operationRepo.forTenant(tenant).save(operation))
    } yield ()
  }

  /**
   * delete logically all subscriptions
   * add for each subscriptions an operation in queue to process a complete deletion of each Api
   * (disable apikey in otoroshi, compute consumptions, delete notifications)
   *
   * @param subscriptions Sequence of ApiSubscriptions
   * @param tenant Tenant where delete those ApiSubscriptions
   * @return EitherT of AppError or Unit (actually a RightT[Unit])
   */
  def deleteSubscriptions(subscriptions: Seq[ApiSubscription], tenant: Tenant): EitherT[Future, AppError, Unit] = {
    val operations = subscriptions.distinct
      .map(s => Operation(
        DatastoreId(BSONObjectID.generate().stringify),
        tenant = tenant.id,
        itemId = s.id.value,
        itemType = ItemType.Subscription,
        action = OperationAction.Delete
      ))

    AppLogger.debug(s"[deletion service] :: add **subscriptions**[${subscriptions.map(_.id).mkString(",")}] to deletion queue")
    val r = for {
      _ <- env.dataStore.apiSubscriptionRepo.forTenant(tenant)
        .deleteLogically(Json.obj("_id" ->
          Json.obj("$in" -> JsArray(subscriptions.map(_.id.asJson).distinct))))
      _ <- env.dataStore.operationRepo.forTenant(tenant).insertMany(operations)
    } yield ()

    EitherT.liftF(r)
  }

  /**
   * delete logically all apis
   * add for each apis an operation in queue to process a complete deletion of each Api
   * (delete doc, issues, posts & notifications)
   * @param apis A sequence of Api to delete
   * @param tenant the tennat where delete those apis
   * @return an EitherT of AppError or Unit (actually a RightT[Unit])
   */
  def deleteApis(apis: Seq[Api], tenant: Tenant): EitherT[Future, AppError, Unit] = {
    val operations = apis.distinct
      .map(s => Operation(
        DatastoreId(BSONObjectID.generate().stringify),
        tenant = tenant.id,
        itemId = s.id.value,
        itemType = ItemType.Api,
        action = OperationAction.Delete
      ))

    AppLogger.debug(s"[deletion service] :: add **apis**[${apis.map(_.name).mkString(",")}] to deletion queue")
    val r = for {
      _ <- env.dataStore.apiRepo.forTenant(tenant)
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
   * @param userId user to delete
   * @param tenant tenant
   * @return an EitherT of AppError or Unit
   */
  def deleteUserByQueue(userId: String, tenant: Tenant): EitherT[Future, AppError, Unit] = {
    for {
      user <- EitherT.fromOptionF(env.dataStore.userRepo.findByIdNotDeleted(userId), AppError.UserNotFound)
      team <- EitherT.fromOptionF(env.dataStore.teamRepo.forTenant(tenant).findOneNotDeleted(Json.obj(
        "type" -> TeamType.Personal.name,
        "users.userId" -> user.id.asJson)), AppError.TeamNotFound)
      otherTeams <- EitherT.liftF(env.dataStore.teamRepo.forAllTenant().find(Json.obj(
        "type" -> TeamType.Personal.name,
        "users.userId" -> user.id.asJson)))
      _ <- deleteTeamByQueue(team.id, team.tenant)
      _ <- if (otherTeams.length > 1) EitherT.rightT[Future, AppError](()) else deleteUser(user, tenant)
      _ <- EitherT.liftF(env.dataStore.userSessionRepo.delete(Json.obj(
        "userId" -> userId
      )))
    } yield ()
  }

  /**
   * Flag a user as deleted and delete his all teams in all possible tenants
   * Add him and his personal teams to deletion queue to process complete deletion
   *
   * @param userId user to delete
   * @param tenant tenant
   * @return an EitherT of AppError or Unit
   */
  def deleteCompleteUserByQueue(userId: String, tenant: Tenant): EitherT[Future, AppError, Unit] = {
    for {
      user <- EitherT.fromOptionF(env.dataStore.userRepo.findByIdNotDeleted(userId), AppError.UserNotFound)
      teams <- EitherT.liftF(env.dataStore.teamRepo.forAllTenant().findNotDeleted(Json.obj(
        "type" -> TeamType.Personal.name,
        "users.userId" -> user.id.asJson)))
      _ <- EitherT.liftF(Future.sequence(teams.map(team => deleteTeamByQueue(team.id, team.tenant).value)))
      _ <- deleteUser(user, tenant)
      _ <- EitherT.liftF(env.dataStore.userSessionRepo.delete(Json.obj(
        "userId" -> userId
      )))
    } yield ()
  }

  /**
   * Flag a team as deleted and delete his subscriptions, apis and those apis subscriptions
   * add team, subs and apis to deletion queue to process complete deletion
   * @param id team id
   * @param tenant tenant
   * @return an EitherT of AppError or Unit
   */
  def deleteTeamByQueue(id: TeamId, tenant: TenantId): EitherT[Future, AppError, Unit] = {
    for {
      tenant <- EitherT.fromOptionF(env.dataStore.tenantRepo.findByIdNotDeleted(tenant), AppError.TenantNotFound)
      team <- EitherT.fromOptionF(env.dataStore.teamRepo.forTenant(tenant).findByIdNotDeleted(id), AppError.TeamNotFound)
      subscriptions <- EitherT.liftF(env.dataStore.apiSubscriptionRepo.forTenant(tenant).find(Json.obj("team" -> team.id.asJson)))
      apis <- EitherT.liftF(env.dataStore.apiRepo.forTenant(tenant).find(Json.obj("team" -> team.id.asJson)))
      apiSubscriptions <- EitherT.liftF(env.dataStore.apiSubscriptionRepo.forTenant(tenant)
        .find(Json.obj("api" -> Json.obj("$in" -> JsArray(apis.map(_.id.asJson))))))
      _ <- deleteSubscriptions(subscriptions ++ apiSubscriptions, tenant)
      _ <- deleteApis(apis, tenant)
      _ <- deleteTeam(team, tenant)
    } yield ()
  }
}
