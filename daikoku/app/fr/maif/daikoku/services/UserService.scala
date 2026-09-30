package fr.maif.daikoku.services

import cats.data.EitherT
import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.domain.TeamPermission.Administrator
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.jobs.{ApiKeyStatsJob, OtoroshiSynchronizerJob}
import fr.maif.daikoku.utils.{IdGenerator, OtoroshiClient, Translator}
import org.joda.time.DateTime
import org.mindrot.jbcrypt.BCrypt
import play.api.i18n.MessagesApi
import play.api.libs.json.Json

import scala.concurrent.{ExecutionContext, Future}

class UserService(
    env: Env,
    otoroshiClient: OtoroshiClient,
    messagesApi: MessagesApi,
    translator: Translator,
    apiKeyStatsJob: ApiKeyStatsJob,
    otoroshiSynchronisator: OtoroshiSynchronizerJob
)(implicit ec: ExecutionContext) {

  def createUser(
      user: User,
      hashPassword: Boolean
  ): EitherT[Future, AppError, User] = {
    for {
      _ <- EitherT.fromOptionF(
        env.dataStore.userRepo
          .findById(user.id)
          .map(r => r.fold(().some)(_ => None)),
        AppError.EntityConflict("user id")
      )
      newUser =
        if (hashPassword)
          user.copy(password =
            user.password.map(maybePassword =>
              BCrypt.hashpw(maybePassword, BCrypt.gensalt())
            )
          )
        else user
      _ <- EitherT.liftF[Future, AppError, Boolean](
        env.dataStore.userRepo.save(newUser)
      )
    } yield newUser
  }

  def updateUser(
      tenant: Tenant,
      oldUser: User,
      newUser: User,
      elevatedRights: Boolean,
      hashPassword: Boolean = true
  ): EitherT[Future, AppError, User] = {
    val userToSave =
      if (elevatedRights) newUser
      else newUser.copy(metadata = oldUser.metadata)
    val hash =
      if (!hashPassword) newUser.password
      else if (oldUser.password != newUser.password)
        newUser.password.map(maybePassword =>
          BCrypt.hashpw(maybePassword, BCrypt.gensalt())
        )
      else oldUser.password

    EitherT.liftF[Future, AppError, User](for {
      maybePersonalTeam <-
        env.dataStore.teamRepo.findPersonalTeam(tenant.id, userToSave.id)
      _ <-
        env.dataStore.userRepo
          .save(userToSave.copy(password = hash))
      _ <-
        env.dataStore.teamRepo
          .forTenant(tenant)
          .save(
            maybePersonalTeam
              .map(team =>
                team.copy(
                  name = userToSave.name,
                  description = s"The personal team of ${userToSave.name}",
                  avatar = Some(userToSave.picture),
                  contact = userToSave.email
                )
              )
              .getOrElse(
                Team(
                  id = TeamId(IdGenerator.token(32)),
                  tenant = tenant.id,
                  `type` = TeamType.Personal,
                  name = s"${userToSave.name}",
                  description = s"The personal team of ${userToSave.name}",
                  users = Set(
                    UserWithPermission(oldUser.id, Administrator)
                  ),
                  authorizedOtoroshiEntities = None,
                  contact = userToSave.email,
                  avatar = Some(userToSave.picture)
                )
              )
          )
    } yield userToSave)
  }

  def incrementAttempts(user: User): Future[User] = {
    val isStaledFailure = user.lastFailedLogin
      .exists(_.isBefore(DateTime.now().minusMinutes(30)))
    val attemptsIncremented: Int =
      if (!isStaledFailure) user.failedLoginAttempts + 1 else 1
    val updated = user.copy(
      failedLoginAttempts = attemptsIncremented,
      lastFailedLogin = Some(DateTime.now())
    )
    env.dataStore.userRepo.save(updated).map(_ => updated)
  }

  def resetAttempts(user: User): Future[User] = {
    val updated = user.copy(failedLoginAttempts = 0, lastFailedLogin = None)
    env.dataStore.userRepo.save(updated).map(_ => updated)
  }

  def delayForAttempt(user: User): Int = {
    val isRecentFailure = user.lastFailedLogin
      .exists(_.isAfter(DateTime.now().minusMinutes(30)))
    if (!isRecentFailure) return 0
    val delay =
      math.min(math.pow(2, (user.failedLoginAttempts - 1).toDouble).toInt, 30)

    delay
  }
}
