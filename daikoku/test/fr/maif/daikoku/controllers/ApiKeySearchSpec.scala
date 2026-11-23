package fr.maif.daikoku.controllers

import fr.maif.daikoku.domain.*
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import org.joda.time.DateTime
import org.scalatest.concurrent.{Eventually, IntegrationPatience}
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.*

import java.nio.charset.StandardCharsets
import java.util.Base64

class ApiKeySearchSpec()
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience
    with Eventually {

  val strangerTeam = teamConsumer.copy(
    id = TeamId("stranger-team"),
    name = "Stranger Team",
    users = Set.empty
  )

  val automaticPlan = UsagePlan(
    id = UsagePlanId("automatic-plan"),
    tenant = tenant.id,
    customName = "gold",
    integrationProcess = IntegrationProcess.Automatic
  )

  val consumerKeyring = Keyring(
    id = KeyringId("consumer-keyring"),
    tenant = tenant.id,
    team = teamConsumerId,
    customName = "consumer keyring",
    apiKey = OtoroshiApiKey(
      clientName = "consumer-client-name",
      clientId = "consumer-client-id",
      clientSecret = "consumer-secret"
    ),
    otoroshiSettings = KeyringOtoroshiBinding.Internal,
    createdAt = DateTime.now(),
    integrationToken = "consumer-token",
    bearerToken = Some("consumer-bearer")
  )

  val consumerSubscription = ApiSubscription(
    id = ApiSubscriptionId("consumer-subscription"),
    tenant = tenant.id,
    plan = automaticPlan.id,
    createdAt = DateTime.now(),
    team = teamConsumerId,
    api = defaultApi.api.id,
    by = userTeamAdminId,
    customName = Some("debugging key"),
    tags = Some(Set("payments")),
    metadata = Some(Json.obj("environment" -> "staging-eu")),
    customMetadata = Some(Json.obj("cost-center" -> "cc-4242")),
    keyring = consumerKeyring.id
  )

  val strangerKeyring = consumerKeyring.copy(
    id = KeyringId("stranger-keyring"),
    team = strangerTeam.id,
    apiKey = OtoroshiApiKey(
      clientName = "stranger-client-name",
      clientId = "stranger-client-id",
      clientSecret = "stranger-secret"
    ),
    bearerToken = Some("stranger-bearer")
  )

  val strangerSubscription = consumerSubscription.copy(
    id = ApiSubscriptionId("stranger-subscription"),
    team = strangerTeam.id,
    keyring = strangerKeyring.id
  )

  val exposedPlan = automaticPlan.copy(
    integrationProcess = IntegrationProcess.ApiKey
  )

  val adminOnlyTeam = teamConsumer.copy(
    apiKeyVisibility = Some(TeamApiKeyVisibility.Administrator)
  )

  def setupSearchEnv(
      consumerTeam: Team = teamConsumer,
      plan: UsagePlan = automaticPlan
  ): Unit =
    setupEnvBlocking(
      tenants = Seq(tenant),
      users = Seq(daikokuAdmin, userAdmin, user),
      teams = Seq(teamOwner, consumerTeam, strangerTeam),
      usagePlans = Seq(plan),
      apis = Seq(
        defaultApi.api.copy(possibleUsagePlans = Seq(plan.id))
      ),
      subscriptions = Seq(consumerSubscription, strangerSubscription),
      keyrings = Seq(consumerKeyring, strangerKeyring)
    )

  def searchedSubscriptions(as: User, search: String): Seq[String] = {
    val session = loginWithBlocking(as, tenant)

    val resp = httpJsonCallBlocking(
      path = "/api/_search",
      method = "POST",
      body = Some(Json.obj("search" -> search))
    )(using tenant, session)

    resp.status mustBe 200

    val apiKeys = resp.json
      .as[JsArray]
      .value
      .find(group => (group \ "label").as[String] == "ApiKeys")

    apiKeys.isDefined mustBe true

    (apiKeys.get \ "options")
      .as[Seq[JsObject]]
      .map(option => (option \ "value").as[String])
  }

  def basicToken(clientId: String, clientSecret: String): String = {
    val credentials = s"$clientId:$clientSecret"

    Base64.getEncoder.encodeToString(
      credentials.getBytes(StandardCharsets.UTF_8)
    )
  }

  def searchAuditMessages(): Seq[String] =
    daikokuComponents.env.dataStore.auditTrailRepo
      .forTenant(tenant.id)
      .findAll()
      .futureValue
      .map(event => (event \ "message").as[String])
      .filter(_.contains("has searched"))

  "the global search" can {
    "only find the api keys of the user's teams" in {
      setupSearchEnv()

      searchedSubscriptions(user, "debugging") mustBe Seq(
        consumerSubscription.id.value
      )
    }

    "find every api key of the tenant for a daikoku admin" in {
      setupSearchEnv()

      searchedSubscriptions(daikokuAdmin, "debugging") must contain theSameElementsAs Seq(
        consumerSubscription.id.value,
        strangerSubscription.id.value
      )
    }

    "find an api key by its subscription tags and metadata" in {
      setupSearchEnv()

      val found = Seq(consumerSubscription.id.value)

      searchedSubscriptions(user, "payments") mustBe found
      searchedSubscriptions(user, "staging-eu") mustBe found
      searchedSubscriptions(user, "cc-4242") mustBe found
      searchedSubscriptions(user, "cost-center") mustBe found
      searchedSubscriptions(user, "unknown-metadata") mustBe empty
    }

    "find an api key by client id prefix only when its keyring is exposed" in {
      setupSearchEnv()

      searchedSubscriptions(userAdmin, "consumer-cli") mustBe Seq(
        consumerSubscription.id.value
      )

      searchedSubscriptions(user, "consumer-cli") mustBe empty
    }

    "find an api key by client id prefix on an exposed plan only when the team shows its keys" in {
      setupSearchEnv(plan = exposedPlan)

      searchedSubscriptions(user, "consumer-cli") mustBe Seq(
        consumerSubscription.id.value
      )

      setupSearchEnv(consumerTeam = adminOnlyTeam, plan = exposedPlan)

      searchedSubscriptions(user, "consumer-cli") mustBe empty

      searchedSubscriptions(userAdmin, "consumer-cli") mustBe Seq(
        consumerSubscription.id.value
      )
    }

    "find an api key by its pasted basic auth token" in {
      setupSearchEnv()

      val token = basicToken("consumer-client-id", "consumer-secret")
      val wrongToken = basicToken("consumer-client-id", "wrong-secret")

      searchedSubscriptions(user, token) mustBe Seq(
        consumerSubscription.id.value
      )

      searchedSubscriptions(user, s"basic $token") mustBe Seq(
        consumerSubscription.id.value
      )

      searchedSubscriptions(user, wrongToken) mustBe empty
    }

    "find an api key by its clear client credentials" in {
      setupSearchEnv()

      searchedSubscriptions(user, "consumer-client-id:consumer-secret") mustBe Seq(
        consumerSubscription.id.value
      )

      searchedSubscriptions(user, "consumer-client-id:wrong-secret") mustBe empty
    }

    "find an api key by its bearer token" in {
      setupSearchEnv()

      searchedSubscriptions(user, "consumer-bearer") mustBe Seq(
        consumerSubscription.id.value
      )

      searchedSubscriptions(user, "Bearer consumer-bearer") mustBe Seq(
        consumerSubscription.id.value
      )

      searchedSubscriptions(user, "stranger-bearer") mustBe empty
    }

    "not write a pasted secret in the audit trail" in {
      setupSearchEnv()

      val token = basicToken("consumer-client-id", "consumer-secret")
      val unknownToken = "otoapk_unknown_0123456789abcdef"
      val lastSearch = "audit-sentinel"

      searchedSubscriptions(user, token)
      searchedSubscriptions(user, "consumer-bearer")
      searchedSubscriptions(user, unknownToken) mustBe empty
      searchedSubscriptions(user, lastSearch) mustBe empty

      eventually {
        searchAuditMessages().exists(_.contains(lastSearch)) mustBe true
      }

      val messages = searchAuditMessages()

      messages.count(_.contains("<api-key-secret>")) must be >= 3
      messages.exists(_.contains(token)) mustBe false
      messages.exists(_.contains("consumer-bearer")) mustBe false
      messages.exists(_.contains(unknownToken)) mustBe false
    }
  }
}
