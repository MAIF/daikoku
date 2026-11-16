package fr.maif.daikoku.services

import fr.maif.daikoku.domain.*
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import fr.maif.daikoku.utils.IdGenerator
import org.joda.time.DateTime
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec

import scala.concurrent.{Await, Future}
import scala.concurrent.duration.*

class KeyringServiceSpec
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience {

  private def await[A](result: Future[A]): A =
    Await.result(result, 10.seconds)

  private def newKeyring(): Keyring =
    Keyring(
      id = KeyringId(IdGenerator.token(32)),
      tenant = tenant.id,
      team = teamConsumerId,
      apiKey = OtoroshiApiKey("test", IdGenerator.token(32), "secret"),
      otoroshiSettings = KeyringOtoroshiBinding.Internal,
      createdAt = DateTime.now(),
      customName = "Test keyring",
      integrationToken = IdGenerator.token(32)
    )

  private def newDemand(keyring: Keyring): SubscriptionDemand =
    SubscriptionDemand(
      id = DemandId(IdGenerator.token(32)),
      tenant = keyring.tenant,
      api = defaultApi.api.id,
      plan = defaultApi.plans.head.id,
      steps = Seq(
        SubscriptionDemandStep(
          id = SubscriptionDemandStepId(IdGenerator.token(32)),
          state = SubscriptionDemandState.Waiting,
          step = ValidationStep.TeamAdmin(
            id = IdGenerator.token(32),
            team = teamOwnerId
          )
        )
      ),
      team = teamConsumerId,
      from = user.id,
      keyring = Some(keyring.id)
    )

  private def newSubscription(keyring: Keyring): ApiSubscription =
    ApiSubscription(
      id = ApiSubscriptionId(IdGenerator.token(32)),
      tenant = keyring.tenant,
      plan = defaultApi.plans.head.id,
      createdAt = DateTime.now(),
      team = teamConsumerId,
      api = defaultApi.api.id,
      by = user.id,
      customName = None,
      keyring = keyring.id
    )

  "deleteKeyring" must {
    "keep the keyring and its subscriptions when demand cancellation fails" in {
      await(waitForDaikokuSetup())
      val ds = daikokuComponents.env.dataStore
      val keyring = newKeyring()
      val demand = newDemand(keyring)
      val subscription = newSubscription(keyring)
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin, user),
        teams = Seq(teamOwner, teamConsumer),
        apis = Seq(defaultApi.api),
        usagePlans = defaultApi.plans,
        subscriptions = Seq(subscription),
        keyrings = Seq(keyring),
        subscriptionDemands = Seq(demand)
      )

      val repo = ds.subscriptionDemandRepo.forTenant(tenant)
      val savedSubscription =
        await(
          ds.apiSubscriptionRepo.forTenant(tenant).findById(subscription.id)
        )
      savedSubscription mustBe defined
      val triggerName =
        s"fail_demand_${IdGenerator.token(10).filter(_.isLetter)}"
      // Inject a database failure for this demand only, without mocking services.
      await(
        repo.execute(
          s"""CREATE FUNCTION $triggerName() RETURNS trigger AS $$$$
             |BEGIN
             |  IF OLD._id = '${demand.id.value}' THEN
             |    RAISE EXCEPTION 'simulated demand cancellation failure';
             |  END IF;
             |  RETURN OLD;
             |END;
             |$$$$ LANGUAGE plpgsql""".stripMargin,
          Seq.empty
        )
      )
      try {
        await(
          repo.execute(
            s"CREATE TRIGGER $triggerName BEFORE DELETE ON subscription_demands " +
              s"FOR EACH ROW EXECUTE FUNCTION $triggerName()",
            Seq.empty
          )
        )
        val error = intercept[Exception] {
          await(
            daikokuComponents.keyringService
              .deleteKeyring(tenant, keyring)
              .value
          )
        }
        error.getMessage must include("simulated demand cancellation failure")
        await(
          ds.keyringRepo.forTenant(tenant).findById(keyring.id)
        ) mustBe Some(keyring)
        await(
          ds.apiSubscriptionRepo.forTenant(tenant).findById(subscription.id)
        ) mustBe savedSubscription
        await(repo.findById(demand.id)) mustBe Some(demand)
      } finally {
        try {
          await(
            repo.execute(
              s"DROP TRIGGER IF EXISTS $triggerName ON subscription_demands",
              Seq.empty
            )
          )
        } finally {
          await(repo.execute(s"DROP FUNCTION $triggerName()", Seq.empty))
        }
      }
    }

    Seq(false, true).foreach { withSubscriptions =>
      val context =
        if (withSubscriptions) "with subscriptions" else "without subscriptions"
      s"cancel every linked demand and its validators and notifications $context" in {
        await(waitForDaikokuSetup())
        val ds = daikokuComponents.env.dataStore
        val keyring = newKeyring()
        val otherKeyring = newKeyring()
        val demands = Seq(
          newDemand(keyring),
          newDemand(keyring).copy(state = SubscriptionDemandState.InProgress)
        )
        val unrelatedDemands = Seq(
          newDemand(otherKeyring),
          newDemand(otherKeyring).copy(keyring = None)
        )
        val allDemands = demands ++ unrelatedDemands
        val validators = allDemands.map { demand =>
          StepValidator(
            id = DatastoreId(IdGenerator.token(32)),
            tenant = tenant.id,
            token = IdGenerator.token(32),
            step = demand.steps.head.id,
            subscriptionDemand = demand.id
          )
        }
        val notifications = allDemands.flatMap { demand =>
          Seq(
            NotificationAction.ApiSubscriptionDemand(
              api = demand.api,
              plan = demand.plan,
              team = demand.team,
              demand = demand.id,
              step = demand.steps.head.id,
              motivation = None
            ),
            NotificationAction.CheckoutForSubscription(
              demand.id,
              demand.api,
              demand.plan,
              demand.steps.head.id
            )
          ).map { action =>
            Notification(
              id = NotificationId(IdGenerator.token(32)),
              tenant = tenant.id,
              team = None,
              sender = userAdmin.asNotificationSender,
              action = action
            )
          }
        }
        val subscriptions =
          if (withSubscriptions) Seq(newSubscription(keyring))
          else Seq.empty
        setupEnvBlocking(
          tenants = Seq(tenant),
          users = Seq(userAdmin, user),
          teams = Seq(teamOwner, teamConsumer),
          apis = Seq(defaultApi.api),
          usagePlans = defaultApi.plans,
          subscriptions = subscriptions,
          keyrings = Seq(keyring, otherKeyring),
          subscriptionDemands = allDemands,
          notifications = notifications
        )
        validators.foreach { validator =>
          await(ds.stepValidatorRepo.forTenant(tenant).save(validator))
        }

        await(
          daikokuComponents.keyringService.deleteKeyring(tenant, keyring).value
        ) mustBe Right(())

        await(
          daikokuComponents.keyringService.findKeyring(tenant.id, keyring.id)
        ) mustBe None
        await(
          daikokuComponents.keyringService
            .keyringSubscriptions(tenant.id, keyring.id)
        ) mustBe empty
        await(
          daikokuComponents.keyringService
            .findKeyring(tenant.id, otherKeyring.id)
        ) mustBe Some(otherKeyring)
        await(ds.subscriptionDemandRepo.forTenant(tenant).findAll())
          .map(_.id)
          .toSet mustBe unrelatedDemands.map(_.id).toSet
        await(ds.stepValidatorRepo.forTenant(tenant).findAll())
          .map(_.id)
          .toSet mustBe validators.drop(2).map(_.id).toSet
        val remainingNotifications =
          await(ds.notificationRepo.forTenant(tenant).findAll()).map(_.id).toSet
        notifications.take(4).foreach { notification =>
          remainingNotifications must not contain notification.id
        }
        notifications.drop(4).foreach { notification =>
          remainingNotifications must contain(notification.id)
        }
      }
    }

    "delete a keyring that has no demands" in {
      await(waitForDaikokuSetup())
      val keyring = newKeyring()
      setupEnvBlocking(tenants = Seq(tenant), keyrings = Seq(keyring))

      await(
        daikokuComponents.keyringService.deleteKeyring(tenant, keyring).value
      ) mustBe Right(())
      await(
        daikokuComponents.keyringService.findKeyring(tenant.id, keyring.id)
      ) mustBe None
    }
  }

  "findByKeyring" must {
    "only return demands for the requested tenant and keyring" in {
      await(waitForDaikokuSetup())
      val ds = daikokuComponents.env.dataStore
      val keyring = newKeyring()
      val otherKeyring = newKeyring()
      val otherTenant = tenant.copy(id = TenantId(IdGenerator.token(32)))
      val demand = newDemand(keyring)
      val otherKeyringDemand = newDemand(otherKeyring)
      val otherTenantDemand = newDemand(keyring).copy(tenant = otherTenant.id)
      val demandWithoutKeyring = newDemand(keyring).copy(keyring = None)
      setupEnvBlocking(
        tenants = Seq(tenant, otherTenant),
        keyrings = Seq(keyring, otherKeyring),
        subscriptionDemands = Seq(
          demand,
          otherKeyringDemand,
          otherTenantDemand,
          demandWithoutKeyring
        )
      )

      await(ds.subscriptionDemandRepo.findByKeyring(tenant, keyring))
        .map(_.id) mustBe Seq(demand.id)
      await(ds.subscriptionDemandRepo.findByKeyring(otherTenant, keyring))
        .map(_.id) mustBe Seq(otherTenantDemand.id)
      await(
        ds.subscriptionDemandRepo.findByKeyring(tenant, newKeyring())
      ) mustBe empty
    }
  }
}
