package fr.maif.daikoku.services

import fr.maif.daikoku.domain.User
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.jobs.{ApiKeyStatsJob, OtoroshiSynchronizerJob}
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

  def incrementAttempts(user: User): User = {
    val isStaledFailure = user.lastFailedLogin
      .exists(_.isBefore(DateTime.now().minusMinutes(30)))
    val attemptsIncremented: Int =
      if (!isStaledFailure) user.failedLoginAttempts + 1 else 0
    env.dataStore.userRepo
      .save(
        user.copy(
          failedLoginAttempts = attemptsIncremented,
          lastFailedLogin = Some(DateTime.now())
        )
      )
    user.copy(
      failedLoginAttempts = attemptsIncremented,
      lastFailedLogin = Some(DateTime.now())
    )
  }

  def delayForAttempt(user: User): Future[Int] = {
    val isRecentFailure = user.lastFailedLogin
      .exists(_.isAfter(DateTime.now().minusMinutes(30)))
    val attemptsIncremented =
      if (isRecentFailure) user.failedLoginAttempts + 1 else 0
    val delay = {
      math.min(math.pow(2, user.failedLoginAttempts.toDouble).toInt, 28)
    }
    Future.successful(delay)
  }
}
