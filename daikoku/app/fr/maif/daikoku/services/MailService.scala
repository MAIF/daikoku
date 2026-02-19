package fr.maif.daikoku.services

import fr.maif.daikoku.domain.TeamPermission.Administrator
import fr.maif.daikoku.domain.{Team, Tenant, User, UserId}
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.utils.Translator
import fr.maif.daikoku.utils.future.EnhancedObject
import play.api.i18n.MessagesApi
import play.api.libs.json.{JsArray, JsValue, Json}

import scala.concurrent.{ExecutionContext, Future}

class MailService {
  def sendMailToTeamsAdmins(
      teams: Seq[Team],
      tenant: Tenant,
      args: (Team, User) => Map[String, JsValue],
      mailKey: String
  )(implicit
      translator: Translator,
      ec: ExecutionContext,
      env: Env,
      ma: MessagesApi
  ): Future[Unit] = {

    val adminIdsWithTeam: Seq[(UserId, Team)] =
      teams.flatMap(team => team.users.filter(_.teamPermission == Administrator).map(user => (user.userId, team)))
    val usersFromDatabase: Future[Seq[User]]  = env.dataStore.userRepo.findNotDeleted(
      Json.obj(
        "_id" -> Json.obj("$in" -> JsArray(adminIdsWithTeam.map(_._1.asJson)))
      )
    )

    val eventualMaybeAdminsWithTeam: Future[Seq[(Option[User], Team)]] = usersFromDatabase.map(users => {
      adminIdsWithTeam.map { case (adminId, team) => (users.find(user => adminId == user.id), team) }
    })

    eventualMaybeAdminsWithTeam.map(maybeAdminsWithTeam =>
      maybeAdminsWithTeam.foreach {
        case (Some(admin), team) =>
          implicit val language: String = admin.defaultLanguage.orElse(tenant.defaultLanguage).getOrElse("en")

          for {
            title <- translator.translate(s"$mailKey.title", tenant, args(team, admin))
            body  <- translator.translate(
                       s"$mailKey.body",
                       tenant,
                       args(team, admin)
                     )
            _     <- tenant.mailer.send(title, Seq(admin.email), body, tenant)
          } yield ()
        case _                   => ().future
      }
    )
  }

}
