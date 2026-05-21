package fr.maif.daikoku.services

import fr.maif.daikoku.domain.User
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.jobs.{ApiKeyStatsJob, OtoroshiSynchronizerJob}
import fr.maif.daikoku.logger.AppLogger
import fr.maif.daikoku.utils.{OtoroshiClient, Translator}
import org.joda.time.DateTime
import play.api.i18n.MessagesApi

import scala.concurrent.{ExecutionContext, Future}

class UserService(
    env: Env,
    otoroshiClient: OtoroshiClient,
    messagesApi: MessagesApi,
    translator: Translator,
    apiKeyStatsJob: ApiKeyStatsJob,
    otoroshiSynchronisator: OtoroshiSynchronizerJob
)(implicit ec: ExecutionContext) {

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
    val delay = math.min(math.pow(2, (user.failedLoginAttempts - 1).toDouble).toInt, 30)
    
    delay
  }
}
