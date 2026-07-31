package fr.maif.daikoku.services

import cats.data.EitherT
import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.utils.Cypher.encrypt
import fr.maif.daikoku.utils.{IdGenerator, Translator}
import org.joda.time.DateTime
import play.api.i18n.MessagesApi
import play.api.libs.json.*

import scala.concurrent.{ExecutionContext, Future}

class TeamService(
    env: Env,
    deletionService: DeletionService,
    translator: Translator,
    messagesApi: MessagesApi
) {

  implicit val ec: ExecutionContext = env.defaultExecutionContext
  implicit val ev: Env = env
  implicit val tr: Translator = translator
  implicit val ma: MessagesApi = messagesApi

  def createTeam(
      tenant: Tenant,
      team: Team,
      creator: Option[User]
  )(implicit language: String): EitherT[Future, AppError, Team] = {
    val teamToSave = creator match {
      case Some(user) =>
        team.copy(
          users = Set(
            UserWithPermission(user.id, TeamPermission.Administrator)
          ),
          authorizedOtoroshiEntities = tenant.defaultAuthorizedOtoroshiEntities
        )
      case None => team
    }

    for {
      _ <- creator match {
        case Some(user) =>
          for {
            adminTeam <- EitherT.fromOptionF(
              env.dataStore.teamRepo
                .forTenant(tenant)
                .findOneNotDeleted(
                  Json.obj("type" -> TeamType.Admin.name)
                ),
              AppError.EntityNotFound("admin team")
            )
            _ <- EitherT.cond[Future][AppError, Unit](
              !tenant.teamCreationSecurity
                .getOrElse(false) || adminTeam.users.exists(
                _.userId == user.id
              ) || user.isDaikokuAdmin,
              (),
              AppError.ForbiddenAction
            )
          } yield ()
        case None => EitherT.pure[Future, AppError](())
      }
      _ <- EitherT.fromOptionF(
        env.dataStore.teamRepo
          .forTenant(tenant)
          .findOneNotDeleted(
            Json.obj(
              "$or" -> Json.arr(
                Json.obj("_id" -> team.id.asJson),
                Json.obj("_humanReadableId" -> team.humanReadableId)
              )
            )
          )
          .map(r => r.fold(().some)(_ => None)),
        AppError.TeamNameAlreadyExists
      )
      emailVerif = EmailVerification(
        id = DatastoreId(IdGenerator.token(32)),
        randomId = IdGenerator.token,
        tenant = tenant.id,
        team = teamToSave.id,
        creationDate = DateTime.now(),
        validUntil = DateTime.now().plusMinutes(15)
      )
      _ <- EitherT.liftF(
        env.dataStore.teamRepo
          .forTenant(tenant.id)
          .save(teamToSave)
      )
      _ <- EitherT.liftF(
        env.dataStore.emailVerificationRepo
          .forTenant(tenant.id)
          .save(emailVerif)
      )
      cipheredValidationToken = encrypt(
        env.config.cypherSecret,
        emailVerif.randomId,
        tenant
      )
      title <- EitherT.liftF(
        translator.translate("mail.create.team.token.title", tenant)
      )
      value <- EitherT.liftF(
        translator.translate(
          "mail.create.team.token.body",
          tenant,
          Map(
            "objTeam" -> team.asJson,
            "team" -> JsString(team.name),
            "link" -> JsString(
              env.getDaikokuUrl(
                tenant,
                s"/api/teams/${team.humanReadableId}/_verify?token=$cipheredValidationToken"
              )
            ),
            "team_data" -> team.asJson,
            "recipient_data" -> creator.getOrElse(User.system).asJson,
            "tenant_data" -> tenant.asJson
          )
        )
      )
      _ <- EitherT.liftF(
        tenant.mailer
          .send(title, Seq(team.contact), value, tenant)
      )
    } yield teamToSave
  }

  def updateTeam(
      tenant: Tenant,
      user: User,
      oldTeam: Team,
      newTeam: Team,
      elevatedRights: Boolean
  )(implicit language: String): EitherT[Future, AppError, Team] = {
    def personalTeamIsKO: Boolean = {
      oldTeam.name != newTeam.name ||
      oldTeam.description != newTeam.description ||
      oldTeam.contact != newTeam.contact ||
      oldTeam.apiKeyVisibility != newTeam.apiKeyVisibility
    }

    for {
      _ <- EitherT.cond[Future][AppError, Unit](
        oldTeam.`type` != TeamType.Admin,
        (),
        AppError.ForbiddenAction
      )
      _ <- EitherT.cond[Future][AppError, Unit](
        !(oldTeam.`type` == TeamType.Personal && personalTeamIsKO),
        (),
        AppError.Forbidden("You're not authorized to update this team")
      )
      teamWithEdits =
        if (elevatedRights) newTeam
        else
          newTeam.copy(
            metadata = oldTeam.metadata,
            apisCreationPermission = oldTeam.apisCreationPermission
          )
      isTeamContactChanged = oldTeam.contact != teamWithEdits.contact
      teamToSave = teamWithEdits.copy(verified =
        teamWithEdits.verified && !isTeamContactChanged
      )
      _ <-
        if (isTeamContactChanged)
          EitherT.liftF[Future, AppError, Unit](for {
            title <- translator.translate(
              "mail.create.team.token.title",
              tenant
            )
            emailVerif = EmailVerification(
              id = DatastoreId(IdGenerator.token(32)),
              randomId = IdGenerator.token,
              tenant = tenant.id,
              team = teamToSave.id,
              creationDate = DateTime.now(),
              validUntil = DateTime.now().plusMinutes(15)
            )
            cipheredValidationToken = encrypt(
              env.config.cypherSecret,
              emailVerif.randomId,
              tenant
            )
            value <- translator.translate(
              "mail.create.team.token.body",
              tenant,
              Map(
                "objTeam" -> oldTeam.asJson,
                "team" -> JsString(oldTeam.name),
                "link" -> JsString(
                  env.getDaikokuUrl(
                    tenant,
                    s"/api/teams/${oldTeam.humanReadableId}/_verify?token=$cipheredValidationToken"
                  )
                ),
                "team_data" -> oldTeam.asJson,
                "recipient_data" -> user.asJson,
                "tenant_data" -> tenant.asJson
              )
            )
            _ <- tenant.mailer.send(
              title,
              Seq(teamToSave.contact),
              value,
              tenant
            )
            _ <-
              env.dataStore.emailVerificationRepo
                .forTenant(tenant)
                .delete(Json.obj("teamId" -> oldTeam.id.value))
            _ <-
              env.dataStore.emailVerificationRepo
                .forTenant(tenant)
                .save(emailVerif)
            _ <-
              env.dataStore.teamRepo
                .forTenant(tenant.id)
                .save(teamToSave)
          } yield ())
        else
          EitherT.liftF[Future, AppError, Boolean](
            env.dataStore.teamRepo
              .forTenant(tenant.id)
              .save(teamToSave)
          )
    } yield teamToSave
  }

  def deleteTeam(
      tenant: Tenant,
      team: Team
  ): EitherT[Future, AppError, Unit] = {
    team.`type` match {
      case TeamType.Admin => EitherT.leftT(AppError.ForbiddenAction)
      case _ =>
        deletionService.deleteTeamByQueue(team.id, tenant.id)
    }
  }
}
