package fr.maif.daikoku.services

import fr.maif.daikoku.controllers.PaymentClient
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.jobs.{ApiKeyStatsJob, OtoroshiSynchronizerJob}
import fr.maif.daikoku.utils.{OtoroshiClient, Translator}
import org.joda.time.DateTime
import play.api.i18n.MessagesApi
import play.api.libs.json.*

import scala.concurrent.{ExecutionContext, Future}

class UserService(
    env: Env,
    otoroshiClient: OtoroshiClient,
    messagesApi: MessagesApi,
    translator: Translator,
    apiKeyStatsJob: ApiKeyStatsJob,
    otoroshiSynchronisator: OtoroshiSynchronizerJob
)(implicit ec: ExecutionContext) {

  def delayForAttempt(username: String = ""): Future[Int] = {
    env.dataStore.userRepo
      .findOneNotDeleted(
        Json.obj("email" -> username)
      )
      .flatMap {
        case Some(user) =>
          val isRecentFailure = user.lastFailedLogin
            .exists(_.isAfter(DateTime.now().minusMinutes(30)))
          val attemptsIncremented =
            if (isRecentFailure) user.failedLoginAttempts + 1 else 0
          val delay =
            math.min(math.pow(2, attemptsIncremented.toDouble).toInt, 32)
          env.dataStore.userRepo
            .save(
              user.copy(
                failedLoginAttempts = attemptsIncremented,
                lastFailedLogin = Some(DateTime.now())
              )
            )
            .map(_ => delay)
        case None =>
          Future.successful(10)
      }
  }
}
