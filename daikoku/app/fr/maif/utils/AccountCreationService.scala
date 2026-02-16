package fr.maif.utils

import cats.data.EitherT
import cats.implicits.catsSyntaxOptionId
import fr.maif.controllers.AppError
import fr.maif.actions.DaikokuActionContext
import fr.maif.domain.SubscriptionDemandState.Accepted
import fr.maif.domain.TeamPermission.Administrator
import fr.maif.domain._
import fr.maif.env.Env
import fr.maif.utils.Cypher.encrypt
import org.joda.time.DateTime
import play.api.i18n.MessagesApi
import play.api.libs.json._
import play.api.libs.ws.JsonBodyWritables.writeableOf_JsValue
import play.api.mvc.Result
import play.api.mvc.Results.Ok

import scala.concurrent.{ExecutionContext, Future}

class AccountCreationService {
  def finalizeAccountCreation(
      accountCreation: AccountCreation,
      tenant: Tenant
  )(implicit
      env: Env,
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi
  ) = {
    implicit val language: String = tenant.defaultLanguage.getOrElse("en")
    for {
      _ <- EitherT.cond[Future][AppError, Unit](
        accountCreation.validUntil.isAfter(DateTime.now()),
        (),
        AppError.BadRequestError("not.valid.anymore")
      )
      optUser <- EitherT.liftF(
        env.dataStore.userRepo
          .findOne(Json.obj("email" -> accountCreation.email))
      )
      _ <- EitherT.cond[Future][AppError, Unit](
        optUser.forall(_.invitation match {
          case Some(invit) if !invit.registered => true
          case _                                => false
        }),
        (),
        AppError.EntityConflict("This account is already enabled.")
      )
      userId =
        optUser
          .map(_.id)
          .getOrElse(UserId(IdGenerator.token(32)))
      team = Team(
        id = TeamId(IdGenerator.token(32)),
        tenant = tenant.id,
        `type` = TeamType.Personal,
        name = s"${accountCreation.name}",
        description = s"Team of ${accountCreation.name}",
        users = Set(UserWithPermission(userId, Administrator)),
        authorizedOtoroshiEntities = None,
        contact = accountCreation.email
      )

      formKeysToMetadata =
        tenant.accountCreationProcess
          .collectFirst { case s: ValidationStep.Form => s }
          .flatMap(_.formKeysToMetadata)

      metadataFromMotivation: Option[JsObject] = for {
        motiv <- accountCreation.value.some
        keys <- formKeysToMetadata
      } yield {
        val filtered = motiv.fields.collect {
          case (k, v) if keys.contains(k) => (k, v)
        }
        JsObject(filtered)
      }

      user = User(
        id = userId,
        tenants = Set(tenant.id),
        origins = Set(tenant.authProvider),
        name = accountCreation.name,
        email = accountCreation.email,
        picture = accountCreation.avatar,
        lastTenant = Some(tenant.id),
        password = Some(accountCreation.password),
        personalToken = Some(IdGenerator.token(32)),
        defaultLanguage = None,
        metadata =
          metadataFromMotivation.getOrElse(Json.obj()).as[Map[String, String]]
      )

      _user =
        optUser
          .map { u =>
            user.copy(invitation = u.invitation.map(_.copy(registered = true)))
          }
          .getOrElse(user)

      _ <- EitherT.liftF[Future, AppError, Boolean](
        env.dataStore.teamRepo
          .forTenant(tenant.id)
          .save(team)
      )
      _ <- EitherT.liftF[Future, AppError, Boolean](
        env.dataStore.userRepo.save(_user)
      )
      mailData = Map(
        "tenant" -> JsString(tenant.name),
        "userName" -> JsString(accountCreation.name),
        "userEmail" -> JsString(accountCreation.email),
        "account_creation_data" -> accountCreation.asJson,
        "tenant_data" -> tenant.asJson
      )
      title <- EitherT.liftF(
        translator.translate(
          "mail.account.creation.mail.accepted.title",
          tenant,
          mailData
        )
      )
      body <- EitherT.liftF(
        translator.translate(
          "mail.account.creation.mail.accepted.body",
          tenant,
          mailData
        )
      )
      _ <- EitherT.liftF(
        tenant.mailer.send(title, Seq(accountCreation.email), body, tenant)
      )
      _ <- EitherT.liftF[Future, AppError, Boolean](
        env.dataStore.accountCreationRepo
          .save(accountCreation.copy(state = Accepted))
      )

    } yield Ok(Json.obj("message" -> "user.validated.success"))
  }

  def runAccountCreationProcess(demandId: DemandId, tenant: Tenant)(implicit
      env: Env,
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi
  ): EitherT[Future, AppError, Result] = {

    def processStep(
        step: SubscriptionDemandStep,
        accountCreation: AccountCreation
    ): EitherT[Future, AppError, Result] =
      step.step match {
        case s: ValidationStep.TeamAdmin =>
          notifyTenantAdminteam(s, step, accountCreation, tenant)
        // generate notification
        case s: ValidationStep.Email =>
          sendEmail(s, step, accountCreation, tenant)
        // send email
        case s: ValidationStep.HttpRequest =>
          callHttpRequestStep(s, step, accountCreation, tenant)
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

    for {
      accountCreation <- EitherT.fromOptionF(
        env.dataStore.accountCreationRepo.findById(demandId),
        AppError.EntityNotFound("Account creation")
      )
      _ <- EitherT.cond[Future][AppError, Unit](
        !accountCreation.state.isClosed,
        (),
        AppError.Forbidden("Account creation is closed")
      )
      maybeStep <- EitherT.pure[Future, AppError](
        accountCreation.steps.find(!_.state.isClosed)
      )

      result <-
        maybeStep.fold(finalizeAccountCreation(accountCreation, tenant))(
          processStep(_, accountCreation)
        )
    } yield result
  }

  private def sendEmail(
      s: ValidationStep.Email,
      step: SubscriptionDemandStep,
      accountCreation: AccountCreation,
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
      subscriptionDemand = accountCreation.id,
      metadata = Json.obj("email" -> accountCreation.email)
    )

    val cipheredValidationToken = {
      encrypt(env.config.cypherSecret, stepValidator.token, tenant)
    }

    val pathAccept =
      s"/api/account/_validate?token=$cipheredValidationToken"
    val pathDecline =
      s"/api/account/_decline?token=$cipheredValidationToken"

    val mailType =
      if (s.title.contains("confirm")) "confirmation" else "validation"
    val mailData = Map(
      "tenant" -> JsString(tenant.name),
      "urlAccept" -> JsString(
        env.getDaikokuUrl(tenant, pathAccept)
      ),
      "urlDecline" -> JsString(
        env.getDaikokuUrl(tenant, pathDecline)
      ),
      "userName" -> JsString(accountCreation.name),
      "userEmail" -> JsString(accountCreation.email),
      "message" -> JsString(s.message.getOrElse("")),
      "account_creation_data" -> accountCreation.asJson,
      "tenant_data" -> tenant.asJson
    )
    for {
      title <- EitherT.liftF(
        translator.translate(
          s"mail.account.creation.mail.$mailType.title",
          tenant,
          mailData
        )
      )
      body <- EitherT.liftF(
        translator.translate(
          s"mail.account.creation.mail.$mailType.body",
          tenant,
          mailData
        )
      )

      _ <- EitherT.liftF(
        tenant.mailer.send(
          title,
          s.emails.map(_.replace("${form.email}", accountCreation.email)),
          body,
          tenant
        )
      )
      _ <- EitherT.liftF(
        env.dataStore.stepValidatorRepo
          .forTenant(tenant)
          .save(stepValidator)
      )
    } yield {
      Ok(Json.obj("creation" -> "waiting"))
    }
  }

  def callHttpRequestStep(
      step: ValidationStep.HttpRequest,
      _step: SubscriptionDemandStep,
      demand: AccountCreation,
      tenant: Tenant
  )(implicit
      env: Env,
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi
  ): EitherT[Future, AppError, Result] = {

    def declineAccountCreation(): EitherT[Future, AppError, Result] = {
      val language = tenant.defaultLanguage.getOrElse("en")
      for {
        _ <- EitherT.liftF(
          env.dataStore.accountCreationRepo
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
        title <- EitherT.liftF(
          translator.translate("mail.rejection.title", tenant)(
            messagesApi,
            language,
            env
          )
        )
        body <- EitherT.liftF(
          translator.translate(
            "mail.api.subscription.rejection.body",
            tenant,
            Map(
              "user" -> JsString(demand.name),
              "tenant" -> JsString(tenant.name),
              "account_creation_data" -> demand.asJson,
              "tenant_data" -> tenant.asJson
            )
          )(messagesApi, language, env)
        )
        _ <- EitherT.liftF(
          tenant.mailer.send(title, Seq(demand.email), body, tenant)(
            ec,
            translator,
            messagesApi,
            env,
            language
          )
        )
      } yield Ok(Json.obj("creation" -> "refused"))
    }

    for {
      response <-
        EitherT
          .liftF(
            env.wsClient
              .url(step.url)
              .withHttpHeaders(step.headers.toSeq: _*)
              .post(Json.obj("demand" -> demand.asJson))
          )
          .map(_.json)
      accept <- EitherT.fromOption[Future](
        (response \ "accept").asOpt[Boolean],
        AppError.BadRequestError("accept not in response call")
      )
      result <-
        if (accept)
          validateStep(_step, demand, (response \ "metadata").asOpt[JsObject])
            .map(_ => Ok(Json.obj("done" -> true)))
        else declineAccountCreation()
    } yield result
  }

  def notifyTenantAdminteam(
      step: ValidationStep.TeamAdmin,
      _step: SubscriptionDemandStep,
      accountCreation: AccountCreation,
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
        tenant.accountCreationProcess.collectFirst {
          case s: ValidationStep.Form => s
        },
        AppError.EntityNotFound("form step")
      )
      adminTeam <- EitherT.fromOptionF(
        env.dataStore.teamRepo
          .forTenant(tenant)
          .findOneNotDeleted(Json.obj("type" -> "Admin")),
        AppError.EntityNotFound("tenant team admin")
      )
      _ <- EitherT.cond[Future](
        adminTeam.id == step.team,
        (),
        AppError.EntityNotFound("tenant Admin team")
      )
      motivationAsString =
        motivationPattern
          .findAllMatchIn(
            formStep.formatter.getOrElse("[[motivation]]")
          ) // FIXME: get the real default formatter
          .foldLeft(formStep.formatter.getOrElse("[[motivation]]"))(
            (motivation, rgxMatch) => {
              val key = rgxMatch.group(1)
              val replacement = (accountCreation.value \ key)
                .asOpt[String]
                .getOrElse(s"-- $key --")
              motivation.replace(s"[[$key]]", replacement)
            }
          )
      notification = Notification(
        id = NotificationId(IdGenerator.token(32)),
        tenant = tenant.id,
        team = Some(adminTeam.id),
        sender = NotificationSender(
          name = accountCreation.name,
          email = accountCreation.email,
          id = None
        ),
        action = NotificationAction
          .AccountCreationAttempt(
            accountCreation.id,
            _step.id,
            motivationAsString
          )
      )

      tenantLanguage: String = tenant.defaultLanguage.getOrElse("en")
      notificationUrl = env.getDaikokuUrl(tenant, "/notifications")

      _ <- EitherT.liftF(
        env.dataStore.notificationRepo.forTenant(tenant.id).save(notification)
      )
      admins <- EitherT.liftF(
        env.dataStore.userRepo
          .findNotDeleted(
            Json.obj(
              "_id" -> Json.obj(
                "$in" -> JsArray(adminTeam.admins().map(_.asJson).toSeq)
              )
            )
          )
      )
      _ <- EitherT.liftF(Future.sequence(admins.map(admin => {
        implicit val language: String =
          admin.defaultLanguage.getOrElse(tenantLanguage)
        val mailData = Map(
          "tenant" -> JsString(tenant.name),
          "userName" -> JsString(accountCreation.name),
          "userEmail" -> JsString(accountCreation.email),
          "urlAccept" -> JsString(notificationUrl),
          "urlDecline" -> JsString(notificationUrl),
          "notification_data" -> notification.asJson,
          "account_creation_data" -> accountCreation.asJson,
          "recipient_data" -> admin.asJson,
          "tenant_data" -> tenant.asJson
        )
        (for {
          title <- translator.translate(
            "mail.account.creation.mail.validation.title",
            tenant,
            mailData
          )
          body <- translator.translate(
            "mail.account.creation.mail.validation.body",
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

  def validateStep(
      step: SubscriptionDemandStep,
      demand: AccountCreation,
      metadata: Option[JsObject] = None
  )(implicit
      env: Env,
      ec: ExecutionContext
  ): EitherT[Future, AppError, Unit] = {
    for {
      _ <- step.check()
      updatedDemand = demand.copy(
        steps = demand.steps.map(s =>
          if (s.id == step.id)
            s.copy(state = SubscriptionDemandState.Accepted)
          else s
        ),
        metadata = demand.metadata ++ metadata
          .map(
            _.fieldSet
              .map {
                case (a, b: JsString) => a -> b.value
                case (a, b)           => a -> Json.stringify(b)
              }
              .toMap
          )
          .getOrElse(Map.empty)
      )
      _ <- EitherT.liftF(
        env.dataStore.accountCreationRepo
          .save(updatedDemand)
      )
    } yield ()
  }

  def rejectStep(
      step: SubscriptionDemandStep,
      accountCreation: AccountCreation,
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
      "userName" -> JsString(accountCreation.name),
      "userEmail" -> JsString(accountCreation.email),
      "message" -> JsString(message.getOrElse("")),
      "account_creation_data" -> accountCreation.asJson,
      "tenant_data" -> tenant.asJson
    )
    for {
      _ <- step.check()
      updatedDemand = accountCreation.copy(
        state = SubscriptionDemandState.Refused,
        steps = accountCreation.steps.map(s =>
          if (s.id == step.id)
            s.copy(state = SubscriptionDemandState.Refused)
          else s
        )
      )
      _ <- EitherT.liftF(
        env.dataStore.accountCreationRepo
          .save(updatedDemand)
      )

      title <- EitherT.liftF(
        translator.translate(
          "mail.account.creation.mail.rejected.title",
          tenant,
          mailData
        )
      )
      body <- EitherT.liftF(
        translator.translate(
          "mail.account.creation.mail.rejected.body",
          tenant,
          mailData
        )
      )

      _ <- EitherT.liftF(
        tenant.mailer.send(title, Seq(accountCreation.email), body, tenant)
      )
    } yield ()
  }

  def validateAccountCreationWithStepValidator(
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
        env.dataStore.accountCreationRepo
          .findByIdNotDeleted(validator.subscriptionDemand),
        AppError.EntityNotFound("Subscription demand Validator")
      )
      step <- EitherT.fromOption[Future](
        demand.steps.find(_.id == validator.step),
        AppError.EntityNotFound("Validation Step")
      )
      _ <- validateStep(step, demand)
      _ <- EitherT.liftF[Future, AppError, Boolean](
        env.dataStore.stepValidatorRepo
          .forTenant(tenant)
          .delete(Json.obj("step" -> validator.step.value))
      )
      result <- runAccountCreationProcess(
        demand.id,
        tenant
      )
    } yield result
  }

  def declineAccountCreationWithStepValidator(
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
        env.dataStore.accountCreationRepo
          .findByIdNotDeleted(validator.subscriptionDemand),
        AppError.EntityNotFound("Subscription demand Validator")
      )
      step <- EitherT.fromOption[Future](
        demand.steps.find(_.id == validator.step),
        AppError.EntityNotFound("Validation Step")
      )
      _ <- rejectStep(step, demand, tenant, None)
      _ <- EitherT.liftF[Future, AppError, Boolean](
        env.dataStore.stepValidatorRepo
          .forTenant(tenant)
          .delete(Json.obj("step" -> validator.step.value))
      )
    } yield ()
  }

  def acceptAccountCreationAttempt(
      accountCreation: DemandId,
      subscriptionDemandStepId: SubscriptionDemandStepId
  )(implicit
      ctx: DaikokuActionContext[JsValue],
      env: Env,
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi
  ): Future[Either[AppError, Unit]] = {
    import cats.data._
    import cats.implicits._

    val r: EitherT[Future, AppError, Unit] = for {
      demand <- EitherT.fromOptionF(
        env.dataStore.accountCreationRepo
          .findByIdNotDeleted(accountCreation),
        AppError.EntityNotFound("Subscription demand")
      )
      step <- EitherT.fromOption[Future](
        demand.steps.find(_.id == subscriptionDemandStepId),
        AppError.EntityNotFound("Validation Step")
      )
      _ <- validateStep(step, demand)
      _ <- runAccountCreationProcess(demand.id, ctx.tenant)
    } yield ()

    r.value
  }

  def declineAccountCreationAttempt(
      accountCreation: DemandId,
      subscriptionDemandStepId: SubscriptionDemandStepId,
      tenant: Tenant,
      message: Option[String]
  )(implicit
      env: Env,
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi
  ): Future[Either[AppError, Unit]] = {
    import cats.data._
    import cats.implicits._

    val r: EitherT[Future, AppError, Unit] = for {
      demand <- EitherT.fromOptionF(
        env.dataStore.accountCreationRepo
          .findByIdNotDeleted(accountCreation),
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
}
