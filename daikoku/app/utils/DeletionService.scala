package fr.maif.otoroshi.daikoku.utils

import cats.data.EitherT
import cats.implicits.catsSyntaxOptionId
import controllers.AppError
import fr.maif.otoroshi.daikoku.domain._
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.logger.AppLogger
import play.api.libs.json.{JsArray, Json}
import reactivemongo.bson.BSONObjectID

import scala.concurrent.Future

class DeletionService(env: Env) {

  implicit val ec = env.defaultExecutionContext

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
   * Add a user and his personal team to deletion queue
   * @param userId user to delete
   * @param tenant t an either of Unit or AppError
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
      _ <- deleteTeamByQueue(team.id, tenant, user.some)
      _ <- if (otherTeams.length > 1) EitherT.rightT[Future, AppError](()) else deleteUser(user, tenant)
      _ <- EitherT.liftF(env.dataStore.userSessionRepo.delete(Json.obj(
        "userId" -> userId
      )))
    } yield ()
  }

  def deleteTeamByQueue(id: TeamId, tenant: Tenant, user: Option[User]): EitherT[Future, AppError, Unit] = {
    for {
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
