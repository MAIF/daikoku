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

  private def saveTeamCreation(
      previous: TeamCreation,
      updated: TeamCreation
  ): EitherT[Future, AppError, Unit] =
    EitherT[Future, AppError, Unit](
      env.dataStore.teamCreationRepo.saveIfCurrent(previous, updated).map {
        case true => Right(())
        case false =>
          Left(AppError.EntityConflict("Team creation has already changed"))
      }
    )

  private def executeTeamCreation[A](
      demand: TeamCreation,
      tenant: Tenant
  )(
      action: => EitherT[Future, AppError, A]
  ): EitherT[Future, AppError, A] = {
    val result = action.value.recover {
      case _: java.io.IOException | _: java.util.concurrent.TimeoutException |
          _: jakarta.mail.MessagingException =>
        Left(AppError.BadRequestError(
          "Team creation could not contact an external service."
        ))
    }
    EitherT[Future, AppError, A](result.flatMap {
      case Left(error: AppError.EntityConflict) =>
        Future.successful(Left(error))
      case Left(error) =>
        for {
          current <- env.dataStore.teamCreationRepo.findById(demand.id)
          _ <- current match {
            case Some(value) if !value.state.isClosed =>
              env.dataStore.teamCreationRepo.saveIfCurrent(
                demand,
                demand.copy(state = SubscriptionDemandState.Blocked)
              ).map {
                case true => ()
                case false =>
                  AppLogger.warn(s"Team creation ${demand.id.value} changed while reporting an error")
              }
            case _ => Future.successful(())
          }
          _ = AppLogger.error(
            s"Team creation ${demand.id.value} failed: ${error.getErrorMessage()}"
          )
          failure =
            if (current.exists(_.state == Accepted))
              AppError.BadRequestError(
                "The team was created, but its confirmation email could not be sent."
              )
            else error
          reported <- notifyTeamCreationError(demand, tenant).transform {
            case scala.util.Success(_) => scala.util.Success(Left(failure))
            case scala.util.Failure(_) =>
              scala.util.Success(Left(AppError.BadRequestError(
                s"${failure.getErrorMessage()} Administrators could not be notified."
              )))
          }
        } yield reported
      case Right(value) => Future.successful(Right(value))
    })
  }

  private def notifyTeamCreationError(
      demand: TeamCreation,
      tenant: Tenant
  ): Future[Unit] = {
    implicit val language: String = tenant.defaultLanguage.getOrElse("en")
    (for {
      adminTeam <- env.dataStore.teamRepo.findAdminTeam(tenant.id)
      admins <- env.dataStore.userRepo.findByIds(
        adminTeam.toSeq.flatMap(_.admins()).toSeq
      )
      title <- translator.translate("mail.team.creation.error.title", tenant)
      body <- translator.translate(
        "mail.team.creation.error.body",
        tenant,
        Map("demandId" -> JsString(demand.id.value))
      )
      _ <-
        if (admins.nonEmpty)
          tenant.mailer.send(title, admins.map(_.email), body, tenant)
        else Future.failed(new IllegalStateException(
          "Tenant administrators were not found"
        ))
    } yield ()).andThen {
      case scala.util.Failure(error) =>
        AppLogger.error(s"Could not notify administrators for team creation ${demand.id.value}: ${error.getClass.getSimpleName}")
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
        case s: ValidationStep.Email =>
          sendEmail(s, step, teamCreation, tenant)
        case s: ValidationStep.HttpRequest =>
          callHttpRequestStep(s, step, teamCreation, tenant)
        case _: ValidationStep.Form =>
          EitherT.leftT[Future, Result](
            AppError.BadRequestError(
              "Form steps are not allowed for team creation."
            )
          )
        case _: ValidationStep.Payment =>
          EitherT.leftT[Future, Result](
            AppError.BadRequestError(
              "Payment steps are not allowed for team creation."
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
        teamCreation.fromTenant == tenant.id &&
          teamCreation.state == SubscriptionDemandState.Waiting,
        (),
        AppError.Forbidden("Team creation is closed")
      )
      maybeStep <- EitherT.pure[Future, AppError](
        teamCreation.steps.find(_.state != Accepted)
      )
      result <- maybeStep match {
        case Some(step) if step.state == SubscriptionDemandState.InProgress =>
          EitherT.rightT[Future, AppError](Ok(Json.obj("creation" -> "waiting")))
        case Some(step) =>
          val startedStep = step.copy(state = SubscriptionDemandState.InProgress)
          val started = teamCreation.copy(
            steps = teamCreation.steps.map(s => if (s.id == step.id) startedStep else s)
          )
          for {
            _ <- EitherT.cond[Future][AppError, Unit](
              step.state == SubscriptionDemandState.Waiting,
              (),
              AppError.EntityConflict("Team creation step is already closed")
            )
            _ <- saveTeamCreation(teamCreation, started)
            processed <- executeTeamCreation(started, tenant)(
              processStep(startedStep, started)
            )
            next <- step.step match {
              case _: ValidationStep.HttpRequest =>
                EitherT.liftF[Future, AppError, Option[TeamCreation]](
                  env.dataStore.teamCreationRepo.findById(demandId)
                ).flatMap {
                  case Some(current) if !current.state.isClosed =>
                    runTeamCreationProcess(demandId, tenant)
                  case _ => EitherT.rightT[Future, AppError](processed)
                }
              case _ => EitherT.rightT[Future, AppError](processed)
            }
          } yield next
        case None =>
          val finalizing = teamCreation.copy(state = SubscriptionDemandState.InProgress)
          for {
            _ <- saveTeamCreation(teamCreation, finalizing)
            finalized <- executeTeamCreation(finalizing, tenant)(
              finalizeTeamCreation(finalizing, tenant)
            )
          } yield finalized
      }
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
      for {
        _ <- rejectStep(_step, demand, tenant, None)
      } yield Ok(Json.obj("creation" -> "refused"))
    }

    def validStep(js: JsValue): EitherT[Future, AppError, Result] = {
      val customizations = for {
        metadata <- (js \ "metadata").validateOpt[Map[String, String]]
        entities <- (js \ "authorizedOtoroshiEntities")
          .validateOpt(using json.SeqTeamAuthorizedEntitiesFormat)
        permission <- (js \ "apisCreationPermission").validateOpt[Boolean]
      } yield (metadata.getOrElse(Map.empty), entities, permission)
      for {
        values <- EitherT.fromEither[Future](
          customizations.asEither.left.map(_ =>
            AppError.BadRequestError("HTTP validation response contains invalid team customizations.")
          )
        )
        (metadata, authorizedEntities, permission) = values
        _ <- checkTeamCreationStep(_step, demand)
        mergedMetadata = demand.metadata ++ metadata
        updatedDemand = demand.copy(
          steps = demand.steps.map(s =>
            if (s.id == _step.id)
              s.copy(state = SubscriptionDemandState.Accepted)
            else s
          ),
          metadata = mergedMetadata,
          creationSecurity = permission.orElse(demand.creationSecurity),
          adminReview = Some(
            TeamCreationAdminReview(
              metadata = mergedMetadata,
              removedMetadataKeys = demand.adminReview
                .map(_.removedMetadataKeys).getOrElse(Set.empty) -- metadata.keySet,
              authorizedOtoroshiEntities =
                if ((js \ "authorizedOtoroshiEntities").toOption.isDefined) authorizedEntities
                else demand.adminReview.fold(tenant.defaultAuthorizedOtoroshiEntities)(
                  _.authorizedOtoroshiEntities
                ),
              creationSecurity = permission.orElse(
                demand.adminReview.flatMap(_.creationSecurity)
              ).orElse(demand.creationSecurity)
            )
          )
        )
        _ <- saveTeamCreation(demand, updatedDemand)
      } yield Ok(Json.obj("creation" -> "waiting"))
    }

    for {
      request <- EitherT.fromEither[Future](
        Try(
          env.wsClient.url(step.url).withHttpHeaders(step.headers.toSeq*)
        ).toEither.left.map(_ =>
          AppError.BadRequestError("HTTP validation endpoint configuration is invalid.")
        )
      )
      httpResponse <- EitherT.liftF[Future, AppError, play.api.libs.ws.WSResponse](
        request.post(Json.obj("demand" -> demand.asJson))
      )
      _ <- EitherT.cond[Future][AppError, Unit](
        httpResponse.status >= 200 && httpResponse.status < 300,
        (),
        AppError.BadRequestError(
          s"HTTP validation endpoint returned status ${httpResponse.status}; expected 2xx."
        )
      )
      response <- EitherT.fromEither[Future](
        Try(Json.parse(httpResponse.body)).toEither.left.map(_ =>
          AppError.BadRequestError("HTTP validation response must be valid JSON.")
        )
      )
      accept <- EitherT.fromOption[Future](
        (response \ "accept").asOpt[Boolean],
        AppError.BadRequestError(
          "HTTP validation response must contain a boolean 'accept' field."
        )
      )
      r <-
        if (accept)
          validStep(response)
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
      _ <- EitherT.cond[Future][AppError, Unit](
        s.emails.exists(_.trim.nonEmpty),
        (),
        AppError.BadRequestError(
          "Team creation email step must have at least one recipient."
        )
      )
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
        env.dataStore.stepValidatorRepo
          .forTenant(tenant)
          .save(stepValidator)
      )
      _ <- EitherT.right[AppError](
        tenant.mailer.send(
          title,
          s.emails
            .filter(_.trim.nonEmpty)
            .map(_.replace("${form.email}", teamCreation.email)),
          body,
          tenant
        )
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

    for {
      adminTeam <- EitherT.fromOptionF(
        env.dataStore.teamRepo.findAdminTeam(tenant.id),
        AppError.EntityNotFound("tenant team admin")
      )
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
            ""
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
      _ <- saveTeamCreation(teamCreation, teamCreation.copy(state = Accepted))

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
    } yield Ok(Json.obj("message" -> "team.validated.success"))
  }

  private def checkTeamCreationStep(
      step: SubscriptionDemandStep,
      demand: TeamCreation
  ): EitherT[Future, AppError, Unit] =
    for {
      _ <- step.check()
      _ <- EitherT.cond[Future][AppError, Unit](
        demand.state == SubscriptionDemandState.Waiting &&
          demand.steps.find(_.state != Accepted).exists(_.id == step.id),
        (),
        AppError.EntityConflict("Team creation step is not awaiting a decision")
      )
    } yield ()

  def validateStep(
      step: SubscriptionDemandStep,
      demand: TeamCreation,
      metadata: Option[JsObject] = None
  )(implicit
      env: Env,
      ec: ExecutionContext
  ): EitherT[Future, AppError, Unit] = {
    for {
      _ <- checkTeamCreationStep(step, demand)
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
        (collectedMetadata -- review.removedMetadataKeys) ++ review.metadata ++ incomingMetadata
      )
      updatedDemand = demand.copy(
        steps = demand.steps.map(s =>
          if (s.id == step.id)
            s.copy(state = SubscriptionDemandState.Accepted)
          else s
        ),
        metadata = effectiveMetadata,
        adminReview = demand.adminReview.map(review =>
          review.copy(
            metadata = review.metadata ++ incomingMetadata,
            removedMetadataKeys = review.removedMetadataKeys -- incomingMetadata.keySet
          )
        )
      )
      _ <- saveTeamCreation(demand, updatedDemand)
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
      _ <- EitherT.cond[Future][AppError, Unit](
        demand.fromTenant == tenant.id &&
          step.step.isInstanceOf[ValidationStep.Email],
        (),
        AppError.ForbiddenAction
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
      ).leftMap(error => AppError.BadRequestError(
        s"The validation was recorded, but the workflow could not complete: ${error.getErrorMessage()}"
      ))
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
      _ <- EitherT.cond[Future][AppError, Unit](
        demand.fromTenant == tenant.id &&
          step.step.isInstanceOf[ValidationStep.Email],
        (),
        AppError.ForbiddenAction
      )
      _ <- executeTeamCreation(demand, tenant)(
        rejectStep(step, demand, tenant, None)
      )
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
      subscriptionDemandStepId: SubscriptionDemandStepId,
      notification: Notification
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
      _ <- EitherT.liftF[Future, AppError, Boolean](
        env.dataStore.notificationRepo.forTenant(ctx.tenant)
          .save(notification.copy(status = NotificationStatus.Accepted()))
      )
      _ <- runTeamCreationProcess(demand.id, ctx.tenant).leftMap(error =>
        AppError.BadRequestError(
          s"The validation was recorded, but the workflow could not complete: ${error.getErrorMessage()}"
        )
      )
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
      _ <- EitherT.cond[Future][AppError, Unit](
        demand.fromTenant == tenant.id &&
          step.step.isInstanceOf[ValidationStep.TeamAdmin],
        (),
        AppError.ForbiddenAction
      )
      _ <- executeTeamCreation(demand, tenant)(
        rejectStep(step, demand, tenant, message)
      )
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
      _ <- checkTeamCreationStep(step, teamCreation)
      updatedDemand = teamCreation.copy(
        state = SubscriptionDemandState.Refused,
        steps = teamCreation.steps.map(s =>
          if (s.id == step.id)
            s.copy(state = SubscriptionDemandState.Refused)
          else s
        )
      )
      _ <- saveTeamCreation(teamCreation, updatedDemand)

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
