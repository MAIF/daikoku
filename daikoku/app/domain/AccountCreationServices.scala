package fr.maif.otoroshi.daikoku.domain

import cats.data.EitherT
import controllers.AppError
import fr.maif.otoroshi.daikoku.env.Env
import fr.maif.otoroshi.daikoku.utils.Cypher.encrypt
import fr.maif.otoroshi.daikoku.utils.{IdGenerator, Translator}
import play.api.i18n.MessagesApi
import play.api.libs.json.{JsArray, JsObject, JsString, Json}
import play.api.mvc.Result
import play.api.mvc.Results.Ok

import scala.concurrent.{ExecutionContext, Future}

object AccountCreationServices {
  def runAccountCreationProcess(demandId: SubscriptionDemandId, tenant: Tenant)(implicit
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
        //generate notification
        case s: ValidationStep.Email =>
          sendEmail(s, step, accountCreation, tenant)
        //send email
        case s: ValidationStep.HttpRequest =>
          callHttpRequestStep(s, step, accountCreation, tenant)
        //call http and check response
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

    def createUser(
        accountCreation: AccountCreation
    ): EitherT[Future, AppError, Result] = ???

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
      result <- maybeStep.fold(createUser(accountCreation))(
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
    implicit val language = tenant.defaultLanguage.getOrElse("en")
    for {
      title <- EitherT.liftF(
        translator.translate("mail.subscription.validation.title", tenant)
      )
      _ <- EitherT.liftF(Future.sequence(s.emails.map(email => {
        val stepValidator = StepValidator(
          id = DatastoreId(IdGenerator.token(32)),
          tenant = tenant.id,
          token = IdGenerator.token,
          step = step.id,
          subscriptionDemand = accountCreation.id,
          metadata = Json.obj("email" -> email)
        )

        val cipheredValidationToken = {
          encrypt(env.config.cypherSecret, stepValidator.token, tenant)

          //FIXME: real path
        }
        val pathAccept =
          s"/api/subscription/_validate?token=$cipheredValidationToken"
        val pathDecline =
          s"/api/subscription/_decline?token=$cipheredValidationToken"

        //FIXME: better mail
        translator
          .translate(
            "mail.subscription.validation.body",
            tenant,
            Map(
              "urlAccept" -> JsString(
                env.getDaikokuUrl(tenant, pathAccept)
              ),
              "urlDecline" -> JsString(
                env.getDaikokuUrl(tenant, pathDecline)
              ),
              "user" -> JsString(accountCreation.name),
//              "body" -> JsString(s.template.getOrElse("")),
              "account_creation_data" -> accountCreation.asJson,
              "tenant_data" -> tenant.asJson
            )
          )
          .flatMap(body =>
            env.dataStore.stepValidatorRepo
              .forTenant(tenant)
              .save(stepValidator)
              .map(_ => body)
          )
          .flatMap(body =>
            tenant.mailer.send(title, Seq(email), body, tenant)
          )
      })))
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

    def validStep(
                   metadata: Option[JsObject]
                 ): EitherT[Future, AppError, Result] = {

      for {
        _ <- _step.check()
        updatedDemand = demand.copy(
          steps = demand.steps.map(s =>
            if (s.id == _step.id)
              s.copy(state = SubscriptionDemandState.Accepted)
            else s
          ),
          metadata = metadata
            .map(_.fieldSet.map {
              case (a, b: JsString) => a -> b.value
              case (a, b) => a -> Json.stringify(b)
            }.toMap)
            .getOrElse(Map.empty)
        )
        _ <- EitherT.liftF(
          env.dataStore.accountCreationRepo
            .save(updatedDemand)
        )
        result <- runAccountCreationProcess(demand.id, tenant)
      } yield result
    }

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
        if (accept) validStep((response \ "metadata").asOpt[JsObject])
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
          ) //FIXME: get the real default formatter
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
      //FIXME: real mail
      _ <- EitherT.liftF(Future.sequence(admins.map(admin => {
        implicit val language: String =
          admin.defaultLanguage.getOrElse(tenantLanguage)
        (for {
          title <- translator.translate("mail.account.demand.title", tenant)
          body <- translator.translate(
            "mail.account.demand.body",
            tenant,
            Map(
              "user" -> JsString(accountCreation.name),
              "link" -> JsString(notificationUrl),
              "notification_data" -> notification.asJson,
              "account_creation_data" -> accountCreation.asJson,
              "recipient_data" -> admin.asJson,
              "tenant_data" -> tenant.asJson
            )
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

}
