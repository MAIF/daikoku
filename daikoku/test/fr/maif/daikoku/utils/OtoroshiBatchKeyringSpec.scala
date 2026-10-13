package fr.maif.daikoku.utils

import cats.implicits.catsSyntaxOptionId
import com.dimafeng.testcontainers.GenericContainer.FileSystemBind
import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import fr.maif.daikoku.domain.*
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
        Await.result(store.tenantRepo.save(testTenant), 5.seconds)
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
            testTenant,
            batchId,
            creationId
          ),
          30.seconds
        )
        prepared mustBe Right(keyringId)

        val preparedKey = Await.result(
          client.getApikey(keyring.apiKey.clientId)(using settings),
          10.seconds
        )
        preparedKey.isRight mustBe true
        preparedKey.toOption.get.enabled mustBe false
        preparedKey.toOption.get.authorizedEntities.groups mustBe Set(
          OtoroshiServiceGroupId(emptyGroup.id)
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
            testTenant,
            batchId,
            creationId
          ),
          30.seconds
        ) mustBe Right(keyringId)
        Await.result(
          store.subscriptionBatchDemandRepo
            .forTenant(tenantId)
            .findById(batchId),
          5.seconds
        ).get.newKeyrings.head.keyring mustBe Some(keyringId)

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
            testTenant,
            batchId,
            creationId
          ),
          30.seconds
        ) mustBe Right(keyringId)

        val activatedKey = Await.result(
          client.getApikey(keyring.apiKey.clientId)(using settings),
          10.seconds
        )
        activatedKey.isRight mustBe true
        activatedKey.toOption.get.enabled mustBe true
        activatedKey.toOption.get.authorizedEntities.groups must not contain OtoroshiServiceGroupId(
          emptyGroup.id
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
        Await.result(store.keyringRepo.forTenant(tenantId).deleteAll(), 5.seconds)
        Await.result(store.tenantRepo.deleteById(tenantId), 5.seconds)
      }
    }
  }
}
