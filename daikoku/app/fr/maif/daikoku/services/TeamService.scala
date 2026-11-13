package fr.maif.daikoku.services

import cats.data.EitherT
import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.actions.DaikokuActionContext
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.domain.SubscriptionDemandState.Accepted
import fr.maif.daikoku.domain.TeamPermission.Administrator
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.logger.AppLogger
import fr.maif.daikoku.utils.Cypher.encrypt
import fr.maif.daikoku.utils.StringImplicits.BetterString
import fr.maif.daikoku.utils.{IdGenerator, Translator}
import org.joda.time.DateTime
import play.api.i18n.MessagesApi
import play.api.libs.json.*
import play.api.mvc.Result
import play.api.mvc.Results.Ok
import play.api.libs.ws.JsonBodyWritables.writeableOf_JsValue

import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

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
              env.dataStore.teamRepo.findAdminTeam(tenant.id),
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
          .findByIdOrHrId(team.id.value, team.humanReadableId)
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
      _ <- EitherT.right[AppError](
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
//      _ <- EitherT.cond[Future][AppError, Unit](
//        oldTeam.`type` != TeamType.Admin,
//        (),
//        AppError.ForbiddenAction
//      )
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
                .deleteByTeam(tenant.id, oldTeam.id)
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

  def runTeamCreationProcess(
      demandId: DemandId,
      tenant: Tenant
  )(implicit
      env: Env,
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi
  ): EitherT[Future, AppError, Result] = {
    def processStep(
        step: SubscriptionDemandStep,
        teamCreation: TeamCreation
    ): EitherT[Future, AppError, Result] = {

      step.step match {
        case s: ValidationStep.TeamAdmin =>
          notifyTenantAdminteam(s, step, teamCreation, tenant)
        // generate notification
        case s: ValidationStep.Email =>
          sendEmail(s, step, teamCreation, tenant)
        // send email
        case s: ValidationStep.HttpRequest =>
          callHttpRequestStep(s, step, teamCreation, tenant)
        // call http and check response
        case s: ValidationStep.Form =>
          EitherT.leftT[Future, Result](
            AppError.BadRequestError(
              "Only one form si available, please contact an administrator"
            )
          )
        case _: ValidationStep.Payment =>
          EitherT.leftT[Future, Result](
            AppError.BadRequestError(
              "Payment step is not authorized for the  moment, please contact an administrator"
            )
          )
      }
    }
    for {
      teamCreation <- EitherT.fromOptionF(
        env.dataStore.teamCreationRepo.findById(demandId),
        AppError.EntityNotFound("Team creation")
      )
      _ <- EitherT.cond[Future][AppError, Unit](
        !teamCreation.state.isClosed,
        (),
        AppError.Forbidden("Team creation is closed")
      )
      maybeStep <- EitherT.pure[Future, AppError](
        teamCreation.steps.find(!_.state.isClosed)
      )
      result <-
        maybeStep.fold(finalizeTeamCreation(teamCreation, tenant))(
          processStep(_, teamCreation)
        )
    } yield result
  }

  def callHttpRequestStep(
      step: ValidationStep.HttpRequest,
      _step: SubscriptionDemandStep,
      demand: TeamCreation,
      tenant: Tenant
  )(implicit
      env: Env,
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi
  ): EitherT[Future, AppError, Result] = {

    def declineTeamCreation(
        demand: TeamCreation
    ): EitherT[Future, AppError, Result] = {
      val language = tenant.defaultLanguage.getOrElse("en")
      for {
        _ <- EitherT.right[AppError](
          env.dataStore.teamCreationRepo
            .save(
              demand.copy(
                state = SubscriptionDemandState.Refused,
                steps = demand.steps.map(s =>
                  if (s.id == _step.id)
                    s.copy(state = SubscriptionDemandState.Refused)
                  else s
                )
              )
            )
        )
        title <- EitherT.right[AppError](
          translator.translate("mail.rejection.title", tenant)(using
            messagesApi,
            language,
            env
          )
        )
        body <- EitherT.right[AppError](
          translator.translate(
            "mail.api.subscription.rejection.body",
            tenant,
            Map(
              "user" -> JsString(demand.name),
              "tenant" -> JsString(tenant.name),
              "team_creation_data" -> demand.asJson,
              "tenant_data" -> tenant.asJson
            )
          )(using messagesApi, language, env)
        )
        _ <- EitherT.right[AppError](
          tenant.mailer.send(title, Seq(demand.email), body, tenant)(using
            ec,
            translator,
            messagesApi,
            env,
            language
          )
        )
      } yield Ok(Json.obj("creation" -> "refused"))
    }

    def validStep(js: JsValue): EitherT[Future, AppError, Result] = {
      val metadata = (js \ "metadata").asOpt[JsObject]
      val authorizedEntitiesResult: Either[
        AppError,
        Option[Seq[TeamAuthorizedEntities]]
      ] =
        (js \ "authorizedOtoroshiEntities")
          .validateOpt(using json.SeqTeamAuthorizedEntitiesFormat) match {
          case JsSuccess(value, _) => Right(value)
          case JsError(errors) =>
            Left(
              AppError.BadRequestError(Json.stringify(JsError.toJson(errors)))
            )
        }
      val apisCreationPermission =
        (js \ "apisCreationPermission").asOpt[Boolean]

      for {
        authorizedEntities <- EitherT.fromEither[Future](
          authorizedEntitiesResult
        )
        _ <- _step.check()
        updatedDemand = demand.copy(
          steps = demand.steps.map(s =>
            if (s.id == _step.id)
              s.copy(state = SubscriptionDemandState.Accepted)
            else s
          ),
          metadata = demand.metadata ++ metadata
            .map(_.as[Map[String, String]])
            .getOrElse(Map.empty),
          creationSecurity = apisCreationPermission,
          adminReview = Some(
            TeamCreationAdminReview(
              metadata = demand.metadata,
              removedMetadataKeys = Set.empty,
              authorizedOtoroshiEntities = authorizedEntities,
              creationSecurity = demand.creationSecurity
            )
          )
        )
        _ <- EitherT.liftF(
          env.dataStore.teamCreationRepo
            .save(updatedDemand)
        )
        result <- runTeamCreationProcess(
          demand.id,
          tenant
        )
      } yield result
    }

    for {
      response <- EitherT(
        env.wsClient
          .url(step.url)
          .withHttpHeaders(step.headers.toSeq*)
          .post(
            Json.obj(
              "demand" -> demand.asJson
            )
          )
          .map(resp => {
            val value: Either[AppError, (Boolean, JsValue)] = Try {
              Right(((resp.json \ "accept").as[Boolean], resp.json))
            }.recover(e => {
              AppLogger.error(e.getMessage, e)
              AppLogger.error(s"body ==> ${Json.stringify(resp.json)}")
              Left(AppError.OtoroshiError(Json.obj("error" -> e.getMessage)))
            }).get
            value
          })
      )

      r <-
        if (response._1)
          validStep(response._2)
        else
          declineTeamCreation(
            demand
          )
    } yield r
  }

  private def sendEmail(
      s: ValidationStep.Email,
      step: SubscriptionDemandStep,
      teamCreation: TeamCreation,
      tenant: Tenant
  )(implicit
      env: Env,
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi
  ): EitherT[Future, AppError, Result] = {
    implicit val language: String = tenant.defaultLanguage.getOrElse("en")

    val stepValidator = StepValidator(
      id = DatastoreId(IdGenerator.token(32)),
      tenant = tenant.id,
      token = IdGenerator.token,
      step = step.id,
      subscriptionDemand = teamCreation.id,
      metadata = Json.obj("email" -> teamCreation.email)
    )

    val cipheredValidationToken = {
      encrypt(env.config.cypherSecret, stepValidator.token, tenant)
    }

    val pathAccept =
      s"/api/team/_validate?token=$cipheredValidationToken"
    val pathDecline =
      s"/api/team/_decline?token=$cipheredValidationToken"

    val mailType =
      if (s.title.contains("confirm")) "confirmation" else "validation"
    val mailData = Map(
      "tenant" -> JsString(tenant.name),
      "urlAccept" -> JsString(
        env.getDaikokuUrl(
          tenant,
          pathAccept
        )
      ),
      "urlDecline" -> JsString(
        env.getDaikokuUrl(
          tenant,
          pathDecline
        )
      ),
      "userName" -> JsString(teamCreation.name),
      "userEmail" -> JsString(teamCreation.email),
      "message" -> JsString(s.message.getOrElse("")),
      "team_creation_data" -> teamCreation.asJson,
      "tenant_data" -> tenant.asJson
    )
    for {
      title <- EitherT.right[AppError](
        translator.translate(
          s"mail.team.creation.mail.$mailType.title",
          tenant,
          mailData
        )
      )
      body <- EitherT.right[AppError](
        translator.translate(
          s"mail.team.creation.mail.$mailType.body",
          tenant,
          mailData
        )
      )

      _ <- EitherT.right[AppError](
        tenant.mailer.send(
          title,
          s.emails.map(_.replace("${form.email}", teamCreation.email)),
          body,
          tenant
        )
      )
      _ <- EitherT.right[AppError](
        env.dataStore.stepValidatorRepo
          .forTenant(tenant)
          .save(stepValidator)
      )
    } yield {
      Ok(Json.obj("creation" -> "waiting"))
    }
  }

  def notifyTenantAdminteam(
      step: ValidationStep.TeamAdmin,
      _step: SubscriptionDemandStep,
      teamCreation: TeamCreation,
      tenant: Tenant
  )(implicit
      env: Env,
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi
  ): EitherT[Future, AppError, Result] = {

    val motivationPattern = "\\[\\[(.+?)\\]\\]".r

    for {
      formStep <- EitherT.fromOption[Future][AppError, ValidationStep.Form](
        tenant.teamCreationProcess.collectFirst { case s: ValidationStep.Form =>
          s
        },
        AppError.EntityNotFound("form step")
      )
      adminTeam <- EitherT.fromOptionF(
        env.dataStore.teamRepo.findAdminTeam(tenant.id),
        AppError.EntityNotFound("tenant team admin")
      )
      _ <- EitherT.cond[Future](
        adminTeam.id == step.team,
        (),
        AppError.EntityNotFound("tenant Admin team")
      )
      motivationAsString =
        tenant.teamCreationProcess
          .collectFirst { case s: ValidationStep.Form => s }
          .map { formStep =>
            val formatter = formStep.formatter.getOrElse("[[motivation]]")
            motivationPattern.findAllMatchIn(formatter).foldLeft(formatter) {
              (motivation, rgxMatch) =>
                val key = rgxMatch.group(1)
                val replacement = (teamCreation.value \ key)
                  .asOpt[String]
                  .getOrElse(s"-- $key --")
                motivation.replace(s"[[$key]]", replacement)
            }
          }
          .getOrElse("")
      notification = Notification(
        id = NotificationId(IdGenerator.token(32)),
        tenant = tenant.id,
        team = Some(adminTeam.id),
        sender = NotificationSender(
          name = teamCreation.name,
          email = teamCreation.email,
          id = None
        ),
        action = NotificationAction
          .TeamCreationAttempt(
            teamCreation.id,
            _step.id,
            motivationAsString
          )
      )

      tenantLanguage: String = tenant.defaultLanguage.getOrElse("en")

      _ <- EitherT.right[AppError](
        env.dataStore.notificationRepo.forTenant(tenant.id).save(notification)
      )
      admins <- EitherT.right[AppError](
        env.dataStore.userRepo.findByIds(adminTeam.admins().toSeq)
      )
      _ <- EitherT.right[AppError](Future.sequence(admins.map(admin => {
        implicit val language: String =
          admin.defaultLanguage.getOrElse(tenantLanguage)

        val notificationUrl = env.getDaikokuUrl(tenant, "/notifications", admin)
        val mailData = Map(
          "tenant" -> JsString(tenant.name),
          "userName" -> JsString(teamCreation.name),
          "userEmail" -> JsString(teamCreation.email),
          "urlAccept" -> JsString(notificationUrl),
          "urlDecline" -> JsString(notificationUrl),
          "notification_data" -> notification.asJson,
          "team_creation_data" -> teamCreation.asJson,
          "recipient_data" -> admin.asJson,
          "tenant_data" -> tenant.asJson
        )
        (for {
          title <- translator.translate(
            "mail.team.creation.mail.validation.title",
            tenant,
            mailData
          )
          body <- translator.translate(
            "mail.team.creation.mail.validation.body",
            tenant,
            mailData
          )
        } yield {
          tenant.mailer.send(title, Seq(admin.email), body, tenant)
        }).flatten
      })))
    } yield Ok(
      Json.obj(
        "notificationSended" -> true,
        "creation" -> "waiting"
      )
    )
  }

  def finalizeTeamCreation(
      teamCreation: TeamCreation,
      tenant: Tenant
  )(implicit
      env: Env,
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi
  ) = {
    implicit val language: String = tenant.defaultLanguage.getOrElse("en")
    for {
      user <- EitherT.fromOptionF[Future, AppError, User](
        env.dataStore.userRepo.findById(teamCreation.userId),
        AppError.UserNotFound()
      )
      team = Team(
        id = TeamId(IdGenerator.token(32)),
        tenant = tenant.id,
        `type` = TeamType.Organization,
        name = teamCreation.name,
        description = s"Team ${teamCreation.name}",
        users = Set(UserWithPermission(user.id, Administrator)),
        authorizedOtoroshiEntities = tenant.defaultAuthorizedOtoroshiEntities,
        contact = teamCreation.email,
        avatar = Some(teamCreation.avatar)
        // metadata : voir ci-dessous
      )

      effectiveMetadata = teamCreation.effectiveMetadata(tenant)

      _ <- EitherT.liftF[Future, AppError, Boolean](
        env.dataStore.teamRepo
          .forTenant(tenant.id)
          .save(
            team.copy(
              metadata = effectiveMetadata,
              authorizedOtoroshiEntities = teamCreation.adminReview.fold(
                team.authorizedOtoroshiEntities
              )(_.authorizedOtoroshiEntities),
              apisCreationPermission = teamCreation.adminReview
                .flatMap(_.creationSecurity)
                .orElse(teamCreation.creationSecurity)
            )
          )
      )

      mailData = Map(
        "tenant" -> JsString(tenant.name),
        "userName" -> JsString(teamCreation.name),
        "userEmail" -> JsString(teamCreation.email),
        "team_creation_data" -> teamCreation.asJson,
        "tenant_data" -> tenant.asJson
      )
      title <- EitherT.liftF(
        translator.translate(
          "mail.team.creation.mail.accepted.title",
          tenant,
          mailData
        )
      )
      body <- EitherT.liftF(
        translator.translate(
          "mail.team.creation.mail.accepted.body",
          tenant,
          mailData
        )
      )
      _ <- EitherT.liftF(
        tenant.mailer.send(title, Seq(teamCreation.email), body, tenant)
      )
      _ <- EitherT.liftF[Future, AppError, Boolean](
        env.dataStore.teamCreationRepo
          .save(teamCreation.copy(state = Accepted))
      )

    } yield Ok(Json.obj("message" -> "team.validated.success"))
  }

  def validateStep(
      step: SubscriptionDemandStep,
      demand: TeamCreation,
      metadata: Option[JsObject] = None
  )(implicit
      env: Env,
      ec: ExecutionContext
  ): EitherT[Future, AppError, Unit] = {
    for {
      _ <- step.check()
      incomingMetadata = metadata
        .map(
          _.fields
            .map {
              case (key, field: JsString) => key -> field.value
              case (key, field)           => key -> Json.stringify(field)
            }
            .toMap
        )
        .getOrElse(Map.empty[String, String])
      collectedMetadata = demand.metadata ++ incomingMetadata
      effectiveMetadata = demand.adminReview.fold(collectedMetadata)(review =>
        (collectedMetadata -- review.removedMetadataKeys) ++ review.metadata
      )
      afg = println(effectiveMetadata)
      updatedDemand = demand.copy(
        steps = demand.steps.map(s =>
          if (s.id == step.id)
            s.copy(state = SubscriptionDemandState.Accepted)
          else s
        ),
        metadata = effectiveMetadata
      )
      _ <- EitherT.right[AppError](
        env.dataStore.teamCreationRepo
          .save(updatedDemand)
      )
    } yield ()
  }

  def validateTeamCreationWithStepValidator(
      validator: StepValidator,
      tenant: Tenant
  )(implicit
      env: Env,
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi
  ) = {
    for {
      demand <- EitherT.fromOptionF(
        env.dataStore.teamCreationRepo
          .findById(validator.subscriptionDemand),
        AppError.EntityNotFound("Subscription demand Validator")
      )
      step <- EitherT.fromOption[Future](
        demand.steps.find(_.id == validator.step),
        AppError.EntityNotFound("Validation Step")
      )
      _ <- validateStep(step, demand)
      _ <- EitherT.liftF[Future, AppError, Boolean](
        env.dataStore.stepValidatorRepo
          .deleteByStep(tenant.id, validator.step.value)
          .map(_ > 0)
      )
      result <- runTeamCreationProcess(
        demand.id,
        tenant
      )
    } yield result
  }

  def declineTeamCreationWithStepValidator(
      validator: StepValidator,
      tenant: Tenant
  )(implicit
      env: Env,
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi
  ) = {
    // TODO: maybe good to explain why by giving a message from user who decline
    for {
      demand <- EitherT.fromOptionF(
        env.dataStore.teamCreationRepo
          .findById(validator.subscriptionDemand),
        AppError.EntityNotFound("Subscription demand Validator")
      )
      step <- EitherT.fromOption[Future](
        demand.steps.find(_.id == validator.step),
        AppError.EntityNotFound("Validation Step")
      )
      _ <- rejectStep(step, demand, tenant, None)
      _ <- EitherT.liftF[Future, AppError, Boolean](
        env.dataStore.stepValidatorRepo
          .deleteByStep(tenant.id, validator.step.value)
          .map(_ > 0)
      )
    } yield ()
  }

  private def readTeamCreationReview(
      demand: TeamCreation,
      tenant: Tenant,
      js: JsValue
  ): Either[AppError, TeamCreation] = {
    val result = for {
      name <- (js \ "name")
        .validate[String]
        .map(_.trim)
        .filter(JsError("Name should not be empty"))(_.nonEmpty)
      contact <- (js \ "contact")
        .validate[String](using Reads.email)
        .map(_.trim)
      avatar <- (js \ "avatar").validate[String]
      metadata <- (js \ "metadata").validate[Map[String, String]]
      authorizedEntities <- (js \ "authorizedOtoroshiEntities")
        .validate[JsValue]
        .flatMap {
          case JsNull => JsSuccess(Option.empty[Seq[TeamAuthorizedEntities]])
          case value =>
            value
              .validate(using json.SeqTeamAuthorizedEntitiesFormat)
              .map(Some(_))
        }
      creationSecurity <- (js \ "creationSecurity").validateOpt[Boolean]
      _ <-
        if (
          authorizedEntities.forall(
            _.forall(entry =>
              tenant.otoroshiSettings.exists(_.id == entry.otoroshiSettingsId)
            )
          )
        ) JsSuccess(())
        else JsError("Unknown Otoroshi instance for this tenant")
      _ <-
        if (
          authorizedEntities.forall(entries =>
            entries.map(_.otoroshiSettingsId).distinct.size == entries.size
          )
        ) JsSuccess(())
        else JsError("Select each Otoroshi instance only once")
    } yield {
      val removedKeys = (
        demand.adminReview
          .map(_.removedMetadataKeys)
          .getOrElse(Set.empty[String]) ++
          demand.effectiveMetadata(tenant).keySet
      ) -- metadata.keySet
      demand.copy(
        name = name,
        email = contact,
        avatar = avatar,
        metadata = metadata,
        value = demand.value ++ Json.obj(
          "name" -> name,
          "contact" -> contact,
          "email" -> contact,
          "avatar" -> avatar
        ),
        adminReview = Some(
          TeamCreationAdminReview(
            metadata,
            removedKeys,
            authorizedEntities,
            creationSecurity
          )
        )
      )
    }
    result match {
      case JsSuccess(reviewedDemand, _) => Right(reviewedDemand)
      case JsError(errors) =>
        Left(AppError.BadRequestError(Json.stringify(JsError.toJson(errors))))
    }
  }

  def acceptTeamCreationAttempt(
      teamCreation: DemandId,
      subscriptionDemandStepId: SubscriptionDemandStepId
  )(implicit
      ctx: DaikokuActionContext[JsValue],
      env: Env,
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi
  ): Future[Either[AppError, Unit]] = {
    val r: EitherT[Future, AppError, Unit] = for {
      demand <- EitherT.fromOptionF(
        env.dataStore.teamCreationRepo
          .findById(teamCreation),
        AppError.EntityNotFound("Subscription demand")
      )
      _ <- EitherT.cond[Future][AppError, Unit](
        demand.fromTenant == ctx.tenant.id && !demand.state.isClosed,
        (),
        AppError.ForbiddenAction
      )
      step <- EitherT.fromOption[Future](
        demand.steps.find(_.id == subscriptionDemandStepId),
        AppError.EntityNotFound("Validation Step")
      )
      _ <- EitherT.cond[Future][AppError, Unit](
        step.step.isInstanceOf[ValidationStep.TeamAdmin],
        (),
        AppError.ForbiddenAction
      )
      reviewedDemand <- EitherT.fromEither[Future](
        if (ctx.request.body == Json.obj())
          Right[AppError, TeamCreation](demand)
        else readTeamCreationReview(demand, ctx.tenant, ctx.request.body)
      )
      existingTeam <- EitherT.liftF(
        env.dataStore.teamRepo
          .forTenant(ctx.tenant)
          .findByIdOrHrId(reviewedDemand.name.urlPathSegmentSanitized)
      )
      _ <- EitherT.cond[Future][AppError, Unit](
        existingTeam.isEmpty,
        (),
        AppError.TeamNameAlreadyExists
      )
      _ <- validateStep(step, reviewedDemand)
      _ <- runTeamCreationProcess(demand.id, ctx.tenant)
    } yield ()
    r.value
  }

  def declineTeamCreationAttempt(
      teamCreation: DemandId,
      subscriptionDemandStepId: SubscriptionDemandStepId,
      tenant: Tenant,
      message: Option[String]
  )(implicit
      env: Env,
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi
  ): Future[Either[AppError, Unit]] = {

    val r: EitherT[Future, AppError, Unit] = for {
      demand <- EitherT.fromOptionF(
        env.dataStore.teamCreationRepo
          .findById(teamCreation),
        AppError.EntityNotFound("Subscription demand")
      )
      step <- EitherT.fromOption[Future](
        demand.steps.find(_.id == subscriptionDemandStepId),
        AppError.EntityNotFound("Validation Step")
      )
      _ <- rejectStep(step, demand, tenant, message)
    } yield ()

    r.value
  }

  def rejectStep(
      step: SubscriptionDemandStep,
      teamCreation: TeamCreation,
      tenant: Tenant,
      message: Option[String]
  )(implicit
      env: Env,
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi
  ): EitherT[Future, AppError, Unit] = {
    // FIXME: trace with a metadata (or audit log) who reject the demand
    implicit val language: String = tenant.defaultLanguage.getOrElse("en")

    val mailData = Map(
      "tenant" -> JsString(tenant.name),
      "userName" -> JsString(teamCreation.name),
      "userEmail" -> JsString(teamCreation.email),
      "message" -> JsString(message.getOrElse("")),
      "team_creation_data" -> teamCreation.asJson,
      "tenant_data" -> tenant.asJson
    )
    for {
      _ <- step.check()
      updatedDemand = teamCreation.copy(
        state = SubscriptionDemandState.Refused,
        steps = teamCreation.steps.map(s =>
          if (s.id == step.id)
            s.copy(state = SubscriptionDemandState.Refused)
          else s
        )
      )
      _ <- EitherT.right[AppError](
        env.dataStore.teamCreationRepo
          .save(updatedDemand)
      )

      title <- EitherT.right[AppError](
        translator.translate(
          "mail.team.creation.mail.rejected.title",
          tenant,
          mailData
        )
      )
      body <- EitherT.right[AppError](
        translator.translate(
          "mail.team.creation.mail.rejected.body",
          tenant,
          mailData
        )
      )

      _ <- EitherT.right[AppError](
        tenant.mailer.send(title, Seq(teamCreation.email), body, tenant)
      )
    } yield ()
  }
}
