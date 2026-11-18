package fr.maif.daikoku.services

import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.login.AuthProvider
import org.joda.time.DateTime
import org.scalatestplus.play.PlaySpec

class SubscriptionBatchEligibilitySpec extends PlaySpec {
  private val tenantId = TenantId("tenant")
  private val owner = TeamId("owner")
  private val consumerId = TeamId("consumer")
  private val requesterId = UserId("requester")
  private val planId = UsagePlanId("plan")
  private val plan = UsagePlan(planId, tenantId, "Basic")
  private val consumer = Team(
    id = consumerId,
    tenant = tenantId,
    `type` = TeamType.Organization,
    name = "Consumer",
    description = "",
    contact = "consumer@example.com",
    users = Set(UserWithPermission(requesterId, TeamPermission.TeamUser))
  )
  private val requester = User(
    id = requesterId,
    tenants = Set(tenantId),
    origins = Set(AuthProvider.Local),
    name = "Requester",
    email = "requester@example.com",
    lastTenant = None,
    defaultLanguage = None
  )
  private val api = Api(
    id = ApiId("api"),
    tenant = tenantId,
    team = owner,
    name = "API",
    smallDescription = "",
    description = "",
    documentation = ApiDocumentation(
      ApiDocumentationId("docs"), tenantId, Seq.empty, DateTime.now()
    ),
    visibility = ApiVisibility.Private,
    possibleUsagePlans = Seq(planId),
    defaultUsagePlan = Some(planId),
    authorizedTeams = Seq(consumerId),
    state = ApiState.Published,
    lastUpdate = DateTime.now()
  )
  private val batchId = SubscriptionBatchDemandId("batch")
  private val batchItem = SubscriptionBatchItem(
    id = SubscriptionBatchItemId("item"),
    api = api.id,
    plan = planId,
    process = SubscriptionProcess(),
    keyringChoice = SubscriptionBatchKeyringChoice.Existing(KeyringId("keyring"))
  )
  private val batch = SubscriptionBatchDemand(
    id = batchId,
    tenant = tenantId,
    team = consumerId,
    from = requesterId,
    idempotencyKey = "submission",
    items = Seq(batchItem)
  )
  private val keyring = Keyring(
    id = KeyringId("keyring"),
    tenant = tenantId,
    team = consumerId,
    customName = "Consumer key",
    apiKey = OtoroshiApiKey("key", "client", "secret"),
    otoroshiSettings = KeyringOtoroshiBinding.Internal,
    createdAt = DateTime.now(),
    integrationToken = "integration"
  )

  "SubscriptionBatchEligibility" should {
    "allow provisioning only for the matching open child linked to its batch item" in {
      val child = SubscriptionDemand(
        id = DemandId("child"),
        tenant = tenantId,
        api = api.id,
        plan = planId,
        steps = Seq.empty,
        team = consumerId,
        from = requesterId,
        keyring = Some(keyring.id),
        batch = Some(SubscriptionBatchReference(batchId, batchItem.id))
      )
      val linkedItem = batchItem.copy(
        state = SubscriptionBatchItemState.InProgress,
        demand = Some(child.id)
      )
      val linkedBatch = batch.copy(items = Seq(linkedItem))

      SubscriptionBatchEligibility.validateLinkedChild(linkedBatch, linkedItem, child) mustBe Right(())
      SubscriptionBatchEligibility.validateLinkedChild(
        linkedBatch,
        linkedItem.copy(state = SubscriptionBatchItemState.Canceled),
        child
      ).isLeft mustBe true
      SubscriptionBatchEligibility.validateLinkedChild(
        linkedBatch,
        linkedItem.copy(plan = UsagePlanId("other")),
        child
      ).isLeft mustBe true
    }

    "allow a current published API-plan pair accessible to the requester team" in {
      SubscriptionBatchEligibility.validate(api, plan, consumer, requester, Some(false)) mustBe Right(())
    }

    "reject an API plan that is no longer linked, or whose API is no longer subscribable" in {
      SubscriptionBatchEligibility.validate(
        api.copy(possibleUsagePlans = Seq.empty), plan, consumer, requester, Some(false)
      ) mustBe Left(AppError.ApiNotLinked)
      SubscriptionBatchEligibility.validate(
        api.copy(state = ApiState.Blocked), plan, consumer, requester, Some(false)
      ) mustBe Left(AppError.ApiNotPublished)
    }

    "recheck current team membership and API and private-plan visibility" in {
      SubscriptionBatchEligibility.validate(
        api, plan, consumer.copy(users = Set.empty), requester, Some(false)
      ) mustBe Left(AppError.TeamUnauthorized)
      SubscriptionBatchEligibility.validate(
        api.copy(authorizedTeams = Seq.empty), plan, consumer, requester, Some(false)
      ) mustBe Left(AppError.ApiUnauthorized)
      SubscriptionBatchEligibility.validate(
        api.copy(visibility = ApiVisibility.Public),
        plan.copy(visibility = UsagePlanVisibility.Private, authorizedTeams = Seq.empty),
        consumer, requester, Some(false)
      ) mustBe Left(AppError.PlanUnauthorized)
    }

    "reject paid plans and personal teams forbidden by tenant policy" in {
      SubscriptionBatchEligibility.validate(
        api, plan.copy(paymentSettings = Some(PaymentSettings.Stripe(
          ThirdPartyPaymentSettingsId("stripe"), "product", StripePriceIds("")
        ))), consumer, requester, Some(false)
      ).isLeft mustBe true
      SubscriptionBatchEligibility.validate(
        api.copy(team = consumerId, visibility = ApiVisibility.Public),
        plan, consumer.copy(`type` = TeamType.Personal), requester, None
      ) mustBe Left(AppError.SecurityError("Subscription security"))
    }

    "permit an administrator to access an admin-only API" in {
      SubscriptionBatchEligibility.validate(
        api.copy(visibility = ApiVisibility.AdminOnly),
        plan,
        consumer.copy(authorizedOtoroshiEntities = None),
        requester.copy(isDaikokuAdmin = true),
        Some(false)
      ) mustBe Right(())
    }

    "allow an existing keyring only for its owning team and compatible Otoroshi binding" in {
      SubscriptionBatchEligibility.validateKeyring(batch, batchItem, plan, keyring) mustBe Right(())
      SubscriptionBatchEligibility.validateKeyring(
        batch,
        batchItem,
        plan,
        keyring.copy(team = TeamId("other"))
      ) mustBe Left(AppError.TeamUnauthorized)
      SubscriptionBatchEligibility.validateKeyring(
        batch,
        batchItem,
        plan.copy(otoroshiTarget = Some(OtoroshiTarget(
          OtoroshiSettingsId("other"), authorizedEntities = None
        ))),
        keyring
      ) mustBe Left(AppError.SubscriptionAggregationOtoroshiConflict)
    }

    "require a resolved, correctly-provenanced shell for new keyring choices" in {
      val creationId = SubscriptionBatchKeyringId("creation")
      val reference = SubscriptionBatchReference(batchId, batchItem.id)
      val creation = SubscriptionBatchKeyringCreation(
        creationId,
        "Shared key",
        KeyringOtoroshiBinding.Internal,
        Some(keyring.id),
        ready = true
      )
      val selected = batchItem.copy(keyringChoice = SubscriptionBatchKeyringChoice.New(creationId))
      val parent = batch.copy(items = Seq(selected), newKeyrings = Seq(creation))
      val shell = keyring.copy(
        customName = creation.customName,
        enabled = false,
        shell = Some(KeyringShellProvenance(batchId, creationId, Seq(reference)))
      )

      SubscriptionBatchEligibility.validateKeyring(parent, selected, plan, shell) mustBe Right(())
      SubscriptionBatchEligibility.validateKeyring(
        parent,
        selected,
        plan,
        shell.copy(enabled = true)
      ) mustBe Right(())
      SubscriptionBatchEligibility.validateKeyring(
        parent,
        selected,
        plan,
        shell.copy(shell = None)
      ).isLeft mustBe true
      SubscriptionBatchEligibility.validateKeyring(
        parent,
        selected,
        plan,
        shell.copy(shell = Some(KeyringShellProvenance(
          SubscriptionBatchDemandId("other"), creationId, Seq(reference)
        )))
      ).isLeft mustBe true
      val mismatchedCreation = creation.copy(
        binding = KeyringOtoroshiBinding.Otoroshi(OtoroshiSettingsId("external"))
      )
      SubscriptionBatchEligibility.validateKeyring(
        parent.copy(newKeyrings = Seq(mismatchedCreation)),
        selected,
        plan,
        shell
      ).isLeft mustBe true
    }
  }
}
