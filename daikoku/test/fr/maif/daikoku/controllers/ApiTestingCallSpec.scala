package fr.maif.daikoku.controllers

import cats.implicits.catsSyntaxOptionId
import fr.maif.daikoku.domain.*
import org.joda.time.DateTime
import play.api.libs.json.*

class ApiTestingCallSpec() extends ApiControllerSpecBase {

  private val strangerTeam = teamConsumer.copy(
    id = TeamId("stranger-team"),
    name = "Stranger Team",
    users = Set.empty
  )

  private def setup(
      allowSubscriberKeys: Boolean = true,
      subscribingTeam: TeamId = teamConsumerId,
      blockedBy: Set[SubscriptionBlockReason] = Set.empty
  ): ApiSubscription = {
    val keyring = Keyring(
      id = KeyringId("testing-keyring"),
      tenant = tenant.id,
      team = subscribingTeam,
      apiKey = OtoroshiApiKey("testing", "testing-id", "testing-secret"),
      otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
      createdAt = DateTime.now(),
      customName = "testing",
      integrationToken = "testing"
    )
    val subscription = ApiSubscription(
      id = ApiSubscriptionId("testing-subscription"),
      tenant = tenant.id,
      plan = UsagePlanId("1"),
      createdAt = DateTime.now(),
      team = subscribingTeam,
      api = defaultApi.api.id,
      by = userTeamAdminId,
      customName = None,
      keyring = keyring.id,
      blockedBy = blockedBy
    )

    setupEnvBlocking(
      tenants = Seq(tenant),
      users = Seq(userAdmin, user),
      teams = Seq(teamOwner, teamConsumer, strangerTeam),
      usagePlans = defaultApi.plans,
      apis = Seq(
        defaultApi.api.copy(
          testing = Testing(
            url = "http://localhost:1".some,
            enabled = true,
            username = "owner-key".some,
            password = "owner-secret".some,
            allowSubscriberKeys = allowSubscriberKeys
          ).some
        )
      ),
      subscriptions = Seq(subscription),
      keyrings = Seq(keyring)
    )

    subscription
  }

  private def callWith(subscription: ApiSubscription) = {
    val session = loginWithBlocking(userAdmin, tenant)
    httpJsonCallBlocking(
      path = s"/api/teams/${teamOwnerId.value}/testing/${defaultApi.api.id.value}/call",
      method = "POST",
      body = Json
        .obj(
          "url" -> "http://localhost/test",
          "method" -> "GET",
          "headers" -> Json.obj(),
          "subscription" -> subscription.id.value
        )
        .some
    )(using tenant, session)
  }

  "A test call with a subscriber key" must {
    "be refused when the api does not allow subscriber keys" in {
      val subscription = setup(allowSubscriberKeys = false)

      callWith(subscription).status mustBe 403
    }

    "be refused when the user is not a member of the subscribing team" in {
      val subscription = setup(subscribingTeam = strangerTeam.id)

      callWith(subscription).status mustBe 403
    }

    "be refused when the subscription is blocked" in {
      val subscription = setup(blockedBy = Set(SubscriptionBlockReason.Owner))

      callWith(subscription).status mustBe 403
    }

    "be forwarded to the testing url otherwise" in {
      val subscription = setup()

      callWith(subscription).status must not be 403
    }
  }

  "The testing credentials of an api" must {
    "be hidden from a simple member reading the root api" in {
      setup()

      val session = loginWithBlocking(user, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/apis/${defaultApi.api.humanReadableId}/_root"
      )(using tenant, session)

      resp.status mustBe 200
      (resp.json \ "testing" \ "username").asOpt[String] mustBe None
      (resp.json \ "testing" \ "password").asOpt[String] mustBe None
    }
  }

  "A testing apikey update" must {
    "be refused through a team which does not own the api" in {
      setup()

      val session = loginWithBlocking(userAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path = s"/api/teams/${teamConsumerId.value}/testing/apikeys",
        method = "PUT",
        body = Json
          .obj(
            "entity" -> Json.obj(
              "type" -> "api",
              "_id" -> defaultApi.api.id.value
            ),
            "otoroshiSettings" -> containerizedOtoroshi.value,
            "authorizedEntities" -> Json.obj(
              "groups" -> Json.arr(),
              "services" -> Json.arr(),
              "routes" -> Json.arr()
            ),
            "clientName" -> "testing",
            "tag" -> "testing"
          )
          .some
      )(using tenant, session)

      resp.status mustBe 404
    }
  }
}
