package fr.maif.daikoku.utils

import cats.implicits.catsSyntaxOptionId
import com.dimafeng.testcontainers.GenericContainer.FileSystemBind
import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.env.{evolution_1900_f, evolutions}
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import org.joda.time.DateTime
import org.scalatest.BeforeAndAfter
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.BindMode

import scala.concurrent.Await
import scala.concurrent.duration.*

class OtoroshiBatchKeyringSpec
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with BeforeAndAfter
    with ForAllTestContainer {

  private val pwd = System.getProperty("user.dir")

  override val container: GenericContainer = GenericContainer(
    "maif/otoroshi",
    exposedPorts = Seq(8080),
    fileSystemBind = Seq(
      FileSystemBind(
        s"$pwd/test/fr/maif/daikoku/controllers/otoroshi.json",
        "/home/user/otoroshi.json",
        BindMode.READ_ONLY
      )
    ),
    env = Map("APP_IMPORT_FROM" -> "/home/user/otoroshi.json")
  )

  before {
    Await.result(cleanOtoroshiServer(container.mappedPort(8080)), 5.seconds)
  }

  "Subscription batch keyring provisioning" should {
    "create a disabled Otoroshi key on a managed empty group and activate it after acceptance" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val suffix = IdGenerator.token(12)
      val tenantId = TenantId(s"batch-otoroshi-$suffix")
      val batchId = SubscriptionBatchDemandId(s"batch-$suffix")
      val itemId = SubscriptionBatchItemId("item")
      val creationId = SubscriptionBatchKeyringId("shared")
      val keyringId = KeyringId(s"keyring-$suffix")
      val reference = SubscriptionBatchReference(batchId, itemId)
      val emptyGroup = KeyringEmptyGroup(
        s"daikoku-empty-$suffix",
        IdGenerator.token(64)
      )
      val settings = OtoroshiSettings(
        id = OtoroshiSettingsId(s"otoroshi-$suffix"),
        url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
        host = "otoroshi-api.oto.tools",
        clientId = otoroshiAdminApiKey.clientId,
        clientSecret = otoroshiAdminApiKey.clientSecret,
        keyringEmptyGroup = Some(emptyGroup)
      )
      val creation = SubscriptionBatchKeyringCreation(
        id = creationId,
        customName = "Shared batch keyring",
        binding = KeyringOtoroshiBinding.Otoroshi(settings.id),
        keyring = Some(keyringId)
      )
      val item = SubscriptionBatchItem(
        id = itemId,
        api = ApiId("api"),
        plan = UsagePlanId("plan"),
        process = SubscriptionProcess(),
        keyringChoice = SubscriptionBatchKeyringChoice.New(creationId)
      )
      val batch = SubscriptionBatchDemand(
        id = batchId,
        tenant = tenantId,
        team = TeamId(s"team-$suffix"),
        from = UserId(s"user-$suffix"),
        idempotencyKey = s"submission-$suffix",
        items = Seq(item),
        newKeyrings = Seq(creation)
      )
      val keyring = Keyring(
        id = keyringId,
        tenant = tenantId,
        team = batch.team,
        customName = creation.customName,
        apiKey = OtoroshiApiKey(
          "Batch shell",
          IdGenerator.token(32),
          IdGenerator.token(64)
        ),
        otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(settings.id),
        createdAt = DateTime.now(),
        integrationToken = IdGenerator.token(64),
        enabled = false,
        shell = Some(
          KeyringShellProvenance(batchId, creationId, Seq(reference))
        )
      )
      val testTenant = tenant.copy(
        id = tenantId,
        name = s"Batch Otoroshi $suffix",
        domain = s"$suffix.batch.example.test",
        contact = s"$suffix@example.test",
        aggregationApiKeysSecurity = true.some,
        otoroshiSettings = Set(settings)
      )
      val client = new OtoroshiClient(daikokuComponents.env)

      try {
        val legacyTenant = testTenant.copy(otoroshiSettings =
          Set(
            settings.copy(keyringEmptyGroup = None),
            settings.copy(id = OtoroshiSettingsId(s"configured-$suffix"))
          )
        )
        Await.result(store.tenantRepo.save(legacyTenant), 5.seconds) mustBe true
        evolutions.list must contain(evolution_1900_f)
        Await.result(
          evolution_1900_f.provisionTenant(legacyTenant, store, client),
          30.seconds
        )
        val migratedTenant =
          Await.result(store.tenantRepo.findById(tenantId), 5.seconds).get
        val migratedSettings =
          migratedTenant.otoroshiSettings.find(_.id == settings.id).get
        val migratedGroup = migratedSettings.keyringEmptyGroup.get
        migratedTenant.otoroshiSettings
          .find(_.id.value == s"configured-$suffix")
          .get
          .keyringEmptyGroup mustBe Some(emptyGroup)
        Await.result(
          client.ensureKeyringEmptyGroup()(using migratedSettings),
          10.seconds
        ) mustBe Right(migratedGroup)
        Await.result(
          evolution_1900_f.provisionTenant(migratedTenant, store, client),
          30.seconds
        )
        Await
          .result(
            store.tenantRepo.findById(tenantId),
            5.seconds
          )
          .get
          .otoroshiSettings mustBe migratedTenant.otoroshiSettings
        Await.result(
          store.subscriptionBatchDemandRepo.insertIfAbsent(batch),
          5.seconds
        ) mustBe defined
        Await.result(
          store.keyringRepo.forTenant(tenantId).save(keyring),
          5.seconds
        ) mustBe true

        val prepared = Await.result(
          daikokuComponents.apiService.prepareBatchKeyring(
            migratedTenant,
            batchId,
            creationId
          ),
          30.seconds
        )
        prepared mustBe Right(keyringId)

        val preparedKey = Await.result(
          client.getApikey(keyring.apiKey.clientId)(using migratedSettings),
          10.seconds
        )
        preparedKey.isRight mustBe true
        preparedKey.toOption.get.enabled mustBe false
        preparedKey.toOption.get.authorizedEntities.groups mustBe Set(
          OtoroshiServiceGroupId(migratedGroup.id)
        )
        preparedKey.toOption.get.metadata
          .get("daikoku_subscription_batch") mustBe Some(batchId.value)

        val preparedBatch = Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(tenantId)
              .findById(batchId),
            5.seconds
          )
          .get
        preparedBatch.newKeyrings.head.ready mustBe true

        Await.result(
          daikokuComponents.apiService.prepareBatchKeyring(
            migratedTenant,
            batchId,
            creationId
          ),
          30.seconds
        ) mustBe Right(keyringId)
        Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(tenantId)
              .findById(batchId),
            5.seconds
          )
          .get
          .newKeyrings
          .head
          .keyring mustBe Some(keyringId)

        val acceptedBatch = preparedBatch.copy(
          items = Seq(
            item.copy(
              state = SubscriptionBatchItemState.Accepted,
              subscription = Some(ApiSubscriptionId(s"subscription-$suffix"))
            )
          ),
          newKeyrings = preparedBatch.newKeyrings.map(
            _.copy(finalized = false)
          )
        )
        Await.result(
          store.subscriptionBatchDemandRepo
            .updateIfRevisionMatches(acceptedBatch),
          5.seconds
        ) mustBe defined

        Await.result(
          daikokuComponents.apiService.prepareBatchKeyring(
            migratedTenant,
            batchId,
            creationId
          ),
          30.seconds
        ) mustBe Right(keyringId)

        val activatedKey = Await.result(
          client.getApikey(keyring.apiKey.clientId)(using migratedSettings),
          10.seconds
        )
        activatedKey.isRight mustBe true
        activatedKey.toOption.get.enabled mustBe true
        activatedKey.toOption.get.authorizedEntities.groups must not contain OtoroshiServiceGroupId(
          migratedGroup.id
        )
        Await
          .result(
            store.keyringRepo.forTenant(tenantId).findById(keyringId),
            5.seconds
          )
          .get
          .shell
          .flatMap(_.activatedAt) mustBe defined
        Await
          .result(
            store.subscriptionBatchDemandRepo
              .forTenant(tenantId)
              .findById(batchId),
            5.seconds
          )
          .get
          .newKeyrings
          .head
          .finalized mustBe true
      } finally {
        Await.result(
          store.subscriptionBatchDemandRepo.forTenant(tenantId).deleteAll(),
          5.seconds
        )
        Await.result(
          store.keyringRepo.forTenant(tenantId).deleteAll(),
          5.seconds
        )
        Await.result(store.tenantRepo.deleteById(tenantId), 5.seconds)
      }
    }

    "retain empty group identities when an evolution fails and reuse them on retry" in {
      Await.result(waitForDaikokuSetup(), 10.seconds)
      val store = daikokuComponents.env.dataStore
      val client = new OtoroshiClient(daikokuComponents.env)
      val suffix = IdGenerator.token(12)
      val tenantId = TenantId(s"batch-evolution-$suffix")
      val settings = OtoroshiSettings(
        id = OtoroshiSettingsId(s"otoroshi-$suffix"),
        url = s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
        host = "otoroshi-api.oto.tools",
        clientId = otoroshiAdminApiKey.clientId,
        clientSecret = "invalid-test-secret"
      )
      val legacyTenant = tenant.copy(
        id = tenantId,
        name = s"Batch evolution $suffix",
        domain = s"$suffix.evolution.example.test",
        otoroshiSettings = Set(settings)
      )
      try {
        Await.result(
          store.tenantRepo.save(legacyTenant),
          5.seconds
        ) mustBe true
        val error = intercept[IllegalStateException] {
          Await.result(
            evolution_1900_f.provisionTenant(legacyTenant, store, client),
            30.seconds
          )
        }
        error.getMessage must include(tenantId.value)
        error.getMessage must include(settings.id.value)
        val failedTenant =
          Await.result(store.tenantRepo.findById(tenantId), 5.seconds).get
        val reserved =
          failedTenant.otoroshiSettings.head.keyringEmptyGroup.get
        val repaired = failedTenant.copy(otoroshiSettings =
          failedTenant.otoroshiSettings.map(
            _.copy(clientSecret = otoroshiAdminApiKey.clientSecret)
          )
        )
        Await.result(store.tenantRepo.save(repaired), 5.seconds) mustBe true
        Await.result(
          evolution_1900_f.provisionTenant(repaired, store, client),
          30.seconds
        )
        val saved =
          Await.result(store.tenantRepo.findById(tenantId), 5.seconds).get
        saved.otoroshiSettings.head.keyringEmptyGroup mustBe Some(reserved)
        Await.result(
          client.ensureKeyringEmptyGroup()(using saved.otoroshiSettings.head),
          10.seconds
        ) mustBe Right(reserved)
      } finally {
        Await.result(store.tenantRepo.deleteById(tenantId), 5.seconds)
      }
    }
  }
}
