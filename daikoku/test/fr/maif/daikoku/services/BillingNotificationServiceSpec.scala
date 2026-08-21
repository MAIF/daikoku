package fr.maif.daikoku.services

import fr.maif.daikoku.domain.*
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import fr.maif.daikoku.utils.IdGenerator
import org.joda.time.DateTime
import org.scalatest.BeforeAndAfterEach
import org.scalatestplus.play.PlaySpec
import play.api.i18n.MessagesApi
import play.api.libs.json.{JsObject, JsValue, Json}

import scala.concurrent.duration.*
import scala.concurrent.{Await, ExecutionContext, Future}

class BillingNotificationServiceSpec
    extends PlaySpec
    with DaikokuSpecHelper
    with BeforeAndAfterEach {

  private implicit lazy val env: fr.maif.daikoku.env.Env = daikokuComponents.env
  private implicit lazy val translator: fr.maif.daikoku.utils.Translator =
    daikokuComponents.translator
  private implicit lazy val messagesApi: MessagesApi =
    daikokuComponents.mesessagesApi

  private lazy val service = daikokuComponents.billingNotificationService

  private val plan = defaultApi.plans.head
  private val eur = Currency("EUR")
  private val effectiveAt = new DateTime(2026, 9, 1, 0, 0)

  private val subscription = ApiSubscription(
    id = ApiSubscriptionId("billing-sub"),
    tenant = tenant.id,
    apiKey = OtoroshiApiKey("billing-key", "client-id", "client-secret"),
    plan = plan.id,
    createdAt = DateTime.now(),
    team = teamConsumer.id,
    api = defaultApi.api.id,
    by = userAdmin.id,
    customName = None,
    rotation = None,
    integrationToken = IdGenerator.token(64)
  )

  override def beforeEach(): Unit = {
    setupEnvBlocking(
      tenants = Seq(tenant),
      users = Seq(userAdmin, userApiEditor, user),
      teams = Seq(teamOwner, teamConsumer),
      apis = Seq(defaultApi.api),
      usagePlans = defaultApi.plans,
      subscriptions = Seq(subscription)
    )
  }

  private def storedActions(): Seq[JsObject] =
    Await
      .result(
        env.dataStore.notificationRepo.forTenant(tenant).findAllNotDeleted(),
        10.seconds
      )
      .map(notification => (notification.asJson \ "action").as[JsObject])

  private def theOnlyStoredNotification(): Notification =
    Await
      .result(
        env.dataStore.notificationRepo.forTenant(tenant).findAllNotDeleted(),
        10.seconds
      ) match {
      case Seq(one) => one
      case others =>
        fail(s"expected exactly one notification, got ${others.size}")
    }

  "BillingNotificationService" must {

    "record an upcoming price change with its amounts and its date" in {
      Await.result(
        service.priceChangeScheduled(
          tenant,
          subscription,
          costPerMonth = BigDecimal("12.50"),
          costPerRequest = Some(BigDecimal("0.02")),
          currency = eur,
          effectiveAt = effectiveAt
        ),
        10.seconds
      )

      val notification = theOnlyStoredNotification()
      notification.team mustBe Some(teamConsumer.id)
      notification.notificationType mustBe NotificationType.AcceptOnly

      val action = (notification.asJson \ "action").as[JsObject]
      (action \ "type").as[String] mustBe "SubscriptionPriceChangeScheduled"
      (action \ "subscription").as[String] mustBe "billing-sub"
      (action \ "api").as[String] mustBe defaultApi.api.id.value
      (action \ "plan").as[String] mustBe plan.id.value
      (action \ "costPerMonth").as[BigDecimal] mustBe BigDecimal("12.50")
      (action \ "costPerRequest").as[BigDecimal] mustBe BigDecimal("0.02")
      (action \ "currency" \ "code").as[String] mustBe "EUR"
      (action \ "effectiveAt").as[Long] mustBe effectiveAt.getMillis
    }

    "record a failed payment with its amount and the end of the grace period" in {
      val failedAt = new DateTime(2026, 8, 18, 10, 0)
      Await.result(
        service.paymentFailed(
          tenant,
          subscription,
          amount = BigDecimal("42.00"),
          currency = eur,
          failedAt = failedAt,
          gracePeriodEndsAt = failedAt.plusDays(30)
        ),
        10.seconds
      )

      val action = (theOnlyStoredNotification().asJson \ "action").as[JsObject]
      (action \ "type").as[String] mustBe "SubscriptionPaymentFailed"
      (action \ "amount").as[BigDecimal] mustBe BigDecimal("42.00")
      (action \ "failedAt").as[Long] mustBe failedAt.getMillis
      (action \ "gracePeriodEndsAt")
        .as[Long] mustBe failedAt.plusDays(30).getMillis
    }

    "record a key cut off for non-payment" in {
      val disabledAt = new DateTime(2026, 9, 17, 3, 0)
      Await.result(
        service.keyDisabled(tenant, subscription, disabledAt),
        10.seconds
      )

      val action = (theOnlyStoredNotification().asJson \ "action").as[JsObject]
      (action \ "type").as[String] mustBe "SubscriptionKeyDisabled"
      (action \ "disabledAt").as[Long] mustBe disabledAt.getMillis
    }

    "record a cancellation with the date it takes effect" in {
      Await.result(
        service.cancellationScheduled(tenant, subscription, effectiveAt),
        10.seconds
      )

      val action = (theOnlyStoredNotification().asJson \ "action").as[JsObject]
      (action \ "type").as[String] mustBe "SubscriptionCancellationScheduled"
      (action \ "effectiveAt").as[Long] mustBe effectiveAt.getMillis
    }

    "address the notification to the subscribing team, not to the producer" in {
      Await.result(
        service.cancellationScheduled(tenant, subscription, effectiveAt),
        10.seconds
      )

      theOnlyStoredNotification().team mustBe Some(teamConsumer.id)
      teamConsumer.admins() must contain(userAdmin.id)
    }

    "not fail, nor notify, when the plan of the subscription is gone" in {
      val orphan = subscription.copy(plan = UsagePlanId("deleted-plan"))

      Await.result(
        service.cancellationScheduled(tenant, orphan, effectiveAt),
        10.seconds
      )

      storedActions() mustBe empty
    }

    "have a mail template in every supported language" in {
      val keys = Seq(
        "mail.billing.price.change",
        "mail.billing.payment.failed",
        "mail.billing.key.disabled",
        "mail.billing.cancellation"
      ).flatMap(key => Seq(s"$key.title", s"$key.body"))

      Seq("en", "fr").foreach { lang =>
        implicit val language: String = lang
        keys.foreach { key =>
          val rendered =
            Await.result(translator.translate(key, tenant), 10.seconds)
          withClue(s"$key in $lang: ") {
            rendered must not be key
            rendered.trim must not be empty
          }
        }
      }
    }
  }
}
