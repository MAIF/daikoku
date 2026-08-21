package fr.maif.daikoku.services

import cats.data.OptionT
import fr.maif.daikoku.domain.NotificationAction.*
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.env.Env
import fr.maif.daikoku.logger.AppLogger
import fr.maif.daikoku.utils.{IdGenerator, Translator}
import org.apache.pekko.http.scaladsl.util.FastFuture
import org.joda.time.DateTime
import play.api.i18n.MessagesApi
import play.api.libs.json.*

import scala.concurrent.{ExecutionContext, Future}

/** Announces to a subscribing team what happens to the money behind its
  * subscription. Every event reaches the team administrators, both in their
  * notification list and by mail.
  */
class BillingNotificationService {

  private val sender =
    NotificationSender("automatic process", "no-reply@daikoku.io", None)

  def priceChangeScheduled(
      tenant: Tenant,
      subscription: ApiSubscription,
      costPerMonth: BigDecimal,
      costPerRequest: Option[BigDecimal],
      currency: Currency,
      effectiveAt: DateTime
  )(implicit
      env: Env,
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi
  ): Future[Unit] =
    notifySubscribingTeam(
      tenant,
      subscription,
      SubscriptionPriceChangeScheduled(
        subscription = subscription.id,
        api = subscription.api,
        plan = subscription.plan,
        costPerMonth = costPerMonth,
        costPerRequest = costPerRequest,
        currency = currency,
        effectiveAt = effectiveAt
      ),
      "mail.billing.price.change",
      Map(
        "costPerMonth" -> JsString(costPerMonth.toString),
        "costPerRequest" -> JsString(
          costPerRequest.map(_.toString).getOrElse("0")
        ),
        "currency" -> JsString(currency.code),
        "effectiveAt" -> JsString(asDay(effectiveAt))
      )
    )

  def paymentFailed(
      tenant: Tenant,
      subscription: ApiSubscription,
      amount: BigDecimal,
      currency: Currency,
      failedAt: DateTime,
      gracePeriodEndsAt: DateTime
  )(implicit
      env: Env,
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi
  ): Future[Unit] =
    notifySubscribingTeam(
      tenant,
      subscription,
      SubscriptionPaymentFailed(
        subscription = subscription.id,
        api = subscription.api,
        plan = subscription.plan,
        amount = amount,
        currency = currency,
        failedAt = failedAt,
        gracePeriodEndsAt = gracePeriodEndsAt
      ),
      "mail.billing.payment.failed",
      Map(
        "amount" -> JsString(amount.toString),
        "currency" -> JsString(currency.code),
        "failedAt" -> JsString(asDay(failedAt)),
        "gracePeriodEndsAt" -> JsString(asDay(gracePeriodEndsAt))
      )
    )

  def keyDisabled(
      tenant: Tenant,
      subscription: ApiSubscription,
      disabledAt: DateTime
  )(implicit
      env: Env,
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi
  ): Future[Unit] =
    notifySubscribingTeam(
      tenant,
      subscription,
      SubscriptionKeyDisabled(
        subscription = subscription.id,
        api = subscription.api,
        plan = subscription.plan,
        disabledAt = disabledAt
      ),
      "mail.billing.key.disabled",
      Map("disabledAt" -> JsString(asDay(disabledAt)))
    )

  def cancellationScheduled(
      tenant: Tenant,
      subscription: ApiSubscription,
      effectiveAt: DateTime
  )(implicit
      env: Env,
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi
  ): Future[Unit] =
    notifySubscribingTeam(
      tenant,
      subscription,
      SubscriptionCancellationScheduled(
        subscription = subscription.id,
        api = subscription.api,
        plan = subscription.plan,
        effectiveAt = effectiveAt
      ),
      "mail.billing.cancellation",
      Map("effectiveAt" -> JsString(asDay(effectiveAt)))
    )

  private def asDay(date: DateTime): String = date.toString("yyyy-MM-dd")

  /** A billing event is never worth failing the caller for: a webhook or a
    * nightly job must not break because an api, a plan or a team went missing.
    * Such a case is logged and skipped.
    */
  private def notifySubscribingTeam(
      tenant: Tenant,
      subscription: ApiSubscription,
      action: NotificationAction,
      mailKey: String,
      mailParams: Map[String, JsValue]
  )(implicit
      env: Env,
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi
  ): Future[Unit] = {
    val context = for {
      api <- OptionT(
        env.dataStore.apiRepo.forTenant(tenant).findById(subscription.api)
      )
      plan <- OptionT(
        env.dataStore.usagePlanRepo.forTenant(tenant).findById(subscription.plan)
      )
      team <- OptionT(
        env.dataStore.teamRepo.forTenant(tenant).findById(subscription.team)
      )
    } yield (api, plan, team)

    context.value.flatMap {
      case None =>
        AppLogger.error(
          s"[billing notification] unable to resolve the api, the plan or the team of subscription ${subscription.id.value}, $mailKey not sent"
        )
        FastFuture.successful(())
      case Some((api, plan, team)) =>
        for {
          _ <- env.dataStore.notificationRepo
            .forTenant(tenant)
            .save(
              Notification(
                id = NotificationId(IdGenerator.token(32)),
                tenant = tenant.id,
                team = Some(team.id),
                sender = sender,
                notificationType = NotificationType.AcceptOnly,
                action = action
              )
            )
          administrators <- env.dataStore.userRepo.find(
            Json.obj(
              "_deleted" -> false,
              "_id" -> Json.obj(
                "$in" -> JsArray(
                  team
                    .admins()
                    .map(_.asJson)
                    .toSeq
                )
              )
            )
          )
          _ <- Future.sequence(
            administrators.map(
              mail(tenant, api, plan, team, subscription, mailKey, mailParams)
            )
          )
        } yield ()
    }
  }

  private def mail(
      tenant: Tenant,
      api: Api,
      plan: UsagePlan,
      team: Team,
      subscription: ApiSubscription,
      mailKey: String,
      mailParams: Map[String, JsValue]
  )(administrator: User)(implicit
      env: Env,
      ec: ExecutionContext,
      translator: Translator,
      messagesApi: MessagesApi
  ): Future[Unit] = {
    implicit val language: String = administrator.defaultLanguage
      .getOrElse(tenant.defaultLanguage.getOrElse("en"))

    for {
      title <- translator.translate(s"$mailKey.title", tenant)
      body <- translator.translate(
        s"$mailKey.body",
        tenant,
        mailParams ++ Map(
          "apiName" -> JsString(api.name),
          "planName" -> JsString(plan.customName),
          "teamName" -> JsString(team.name),
          "link" -> JsString(
            env.getDaikokuUrl(
              tenant,
              s"/${team.humanReadableId}/settings/apikeys/${api.humanReadableId}/${api.currentVersion.value}"
            )
          ),
          "recipient_data" -> administrator.asJson,
          "consumer_team_data" -> team.asJson,
          "api_data" -> api.asJson,
          "usagePlan_data" -> plan.asJson,
          "subscription_data" -> subscription.asJson,
          "tenant_data" -> tenant.asJson
        )
      )
      _ <- tenant.mailer.send(title, Seq(administrator.email), body, tenant)
    } yield ()
  }
}
