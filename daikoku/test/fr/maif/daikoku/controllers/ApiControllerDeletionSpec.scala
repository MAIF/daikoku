package fr.maif.daikoku.controllers

import cats.implicits.catsSyntaxOptionId
import com.dimafeng.testcontainers.GenericContainer.FileSystemBind
import com.dimafeng.testcontainers.{ForAllTestContainer, GenericContainer}
import fr.maif.daikoku.controllers.AppError
import fr.maif.daikoku.controllers.AppError.SubscriptionAggregationDisabled
import fr.maif.daikoku.domain.*
import fr.maif.daikoku.domain.NotificationAction.{
  ApiAccess,
  ApiSubscriptionDemand
}
import fr.maif.daikoku.domain.NotificationType.AcceptOrReject
import fr.maif.daikoku.domain.TeamPermission.Administrator
import fr.maif.daikoku.domain.UsagePlanVisibility.{Private, Public}
import fr.maif.daikoku.domain.json.{ApiFormat, SeqApiSubscriptionFormat}
import fr.maif.daikoku.testUtils.DaikokuSpecHelper
import fr.maif.daikoku.utils.IdGenerator
import fr.maif.daikoku.utils.LoggerImplicits.BetterLogger
import org.awaitility.scala.AwaitilitySupport
import org.joda.time.DateTime
import org.scalatest.BeforeAndAfter
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import org.testcontainers.containers.BindMode
import play.api.http.Status
import play.api.libs.json.*

import scala.concurrent.Await
import scala.concurrent.duration.*
import scala.jdk.DurationConverters.*
import scala.util.Random

class ApiControllerDeletionSpec() extends ApiControllerSpecBase {

  "a deletion of a plan" must {
    "delete all subscriptions" in {
      val plan = UsagePlan(
        id = UsagePlanId(IdGenerator.token),
        tenant = tenant.id,
        costPerMonth = BigDecimal(10.0).some,
        costPerRequest = BigDecimal(0.02).some,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month).some,
        trialPeriod = None,
        currency = Currency("EUR").some,
        customName = "PayPerUse",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))
            )
          )
        ),
        allowMultipleKeys = Some(false),
        visibility = Private,
        authorizedTeams = Seq(teamConsumerId),
        autoRotation = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey
      )
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "test-removal"
      )
      val payperUseSub = ApiSubscription(
        id = ApiSubscriptionId("test-removal"),
        tenant = tenant.id,
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = daikokuAdminId,
        customName = None,
        keyring = keyring.id
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(
          teamOwner,
          teamConsumer
        ),
        usagePlans = Seq(plan),
        apis = Seq(
          defaultApi.api.copy(
            possibleUsagePlans = Seq(plan.id)
          )
        ),
        subscriptions = Seq(payperUseSub),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val respGetSubsStart = httpJsonCallBlocking(path =
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(using tenant, session)
      respGetSubsStart.status mustBe 200
      val resultStart =
        fr.maif.daikoku.domain.json.SeqApiSubscriptionFormat
          .reads(respGetSubsStart.json)
      resultStart.isSuccess mustBe true
      resultStart.get.length mustBe 1

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/plan/${plan.id.value}",
        method = "DELETE"
      )(using tenant, session)

      resp.status mustBe 200

      val respGetSubs = httpJsonCallBlocking(path =
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(using tenant, session)
      respGetSubs.status mustBe 200
      val result = fr.maif.daikoku.domain.json.SeqApiSubscriptionFormat
        .reads(respGetSubs.json)
      result.isSuccess mustBe true
      result.get.length mustBe 0
    }
  }

  "a deletion of a api" must {
    "delete all subscriptions" in {
      val plan = UsagePlan(
        id = UsagePlanId(IdGenerator.token),
        tenant = tenant.id,
        costPerMonth = BigDecimal(10.0).some,
        costPerRequest = BigDecimal(0.02).some,
        billingDuration = BillingDuration(1, BillingTimeUnit.Month).some,
        trialPeriod = None,
        currency = Currency("EUR").some,
        customName = "PayPerUse",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))
            )
          )
        ),
        allowMultipleKeys = Some(false),
        visibility = Private,
        authorizedTeams = Seq(teamConsumerId),
        autoRotation = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey
      )
      val keyring = Keyring(
        id = KeyringId("test-keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "test-removal"
      )
      val payperUseSub = ApiSubscription(
        id = ApiSubscriptionId("test-removal"),
        tenant = tenant.id,
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = daikokuAdminId,
        customName = None,
        keyring = keyring.id
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(
          teamOwner,
          teamConsumer
        ),
        usagePlans = Seq(plan),
        apis = Seq(
          defaultApi.api.copy(
            possibleUsagePlans = Seq(plan.id)
          )
        ),
        subscriptions = Seq(payperUseSub),
        keyrings = Seq(keyring)
      )

      val session = loginWithBlocking(userAdmin, tenant)
      val respGetSubsStart = httpJsonCallBlocking(path =
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(using tenant, session)
      respGetSubsStart.status mustBe 200
      val resultStart =
        fr.maif.daikoku.domain.json.SeqApiSubscriptionFormat
          .reads(respGetSubsStart.json)
      resultStart.isSuccess mustBe true
      resultStart.get.length mustBe 1

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/apis/${defaultApi.api.id.value}",
        method = "DELETE",
        body = Json.obj().some
      )(using tenant, session)
      resp.status mustBe 200

      val respGetSubs = httpJsonCallBlocking(path =
        s"/api/apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/subscriptions/teams/${teamConsumerId.value}"
      )(using tenant, session)
      respGetSubs.status mustBe 404

      val respGetTeamSubs = httpJsonCallBlocking(
        path = s"/api/subscriptions/teams/${teamConsumerId.value}"
      )(using tenant, session)
      respGetTeamSubs.status mustBe 200
      respGetTeamSubs.json.as[JsArray].value.length mustBe 0
    }

    "clean other versions of the deleted version" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(teamOwner),
        usagePlans = defaultApi.plans,
        apis = Seq(
          defaultApi.api.copy(
            id = ApiId("123"),
            supportedVersions = Set(Version("1.0.0")),
            currentVersion = Version("1.0.0"),
            isDefault = false,
            parent = None
          ),
          defaultApi.api.copy(
            id = ApiId("345"),
            supportedVersions = Set(Version("2.0.0")),
            currentVersion = Version("2.0.0"),
            isDefault = false,
            parent = Some(ApiId("123"))
          ),
          defaultApi.api.copy(
            id = ApiId("678"),
            supportedVersions = Set(Version("3.0.0")),
            currentVersion = Version("3.0.0"),
            isDefault = true,
            parent = Some(ApiId("123"))
          )
        )
      )
      val session = loginWithBlocking(userAdmin, tenant)

      val respVersionsBefore = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/123/versions"
      )(using tenant, session)

      respVersionsBefore.status mustBe 200
      val versionsBefore = respVersionsBefore.json.as[Seq[String]]
      versionsBefore.length mustBe 3

      val respDefVersionBefore = httpJsonCallBlocking(
        path = s"/api/apis/api-vdefault/default_version"
      )(using tenant, session)
      respDefVersionBefore.status mustBe 200
      (respDefVersionBefore.json \ "defaultVersion").as[String] mustBe "3.0.0"

      val respDelete = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/678",
        method = "DELETE",
        body = Json.obj().some
      )(using tenant, session)

      respDelete.status mustBe 200

      val respVersionsAfter = httpJsonCallBlocking(
        path = s"/api/teams/${teamOwnerId.value}/apis/123/versions"
      )(using tenant, session)

      respVersionsAfter.status mustBe 200
      val versionsAfter = respVersionsAfter.json.as[Seq[String]]
      versionsAfter.length mustBe 2

      val respDefVersionAfter = httpJsonCallBlocking(
        path = s"/api/apis/api-vdefault/default_version"
      )(using tenant, session)
      respDefVersionAfter.status mustBe 200
      (respDefVersionAfter.json \ "defaultVersion").as[String] mustBe "1.0.0"
    }
  }

  "an admin api" must {
    "not be available for non daikoku admin user" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin, userAdmin),
        teams = Seq(defaultAdminTeam, teamConsumer),
        usagePlans = Seq(adminApiPlan),
        apis = Seq(adminApi)
      )
      val session = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${adminApi.id.value}/plan/admin/team/${teamConsumerId.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(using tenant, session)

      resp.status mustBe 401
      (resp.json \ "error")
        .as[String] mustBe AppError.ApiUnauthorized.getErrorMessage()
    }

    "be available for daikoku admin" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam),
        usagePlans = Seq(adminApiPlan),
        apis = Seq(adminApi)
      )
      val session = loginWithBlocking(daikokuAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/apis/${adminApi.id.value}/plan/admin/team/${defaultAdminTeam.id.value}/_subscribe",
        method = "POST",
        body = Json.obj().some
      )(using tenant, session)

      resp.status mustBe 200
    }

    "cannot be deleted" in {
      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${defaultAdminTeam.id.value}/apis/${adminApi.id.value}",
        method = "DELETE",
        body = Json.obj().some
      )(using tenant, session)
      resp.status mustBe 403
    }

    "not be updated except otoroshi target of admin plan" in {

      val updatedAdminPlan = adminApiPlan
        .copy(
          customName = "test",
          customDescription = Some("test"),
          otoroshiTarget = Some(
            OtoroshiTarget(
              otoroshiSettings = containerizedOtoroshi,
              authorizedEntities = Some(
                AuthorizedEntities(
                  groups = Set(OtoroshiServiceGroupId(serviceGroupAdmin))
                )
              )
            )
          )
        )

      setupEnvBlocking(
        tenants = Seq(
          tenant.copy(
            otoroshiSettings = Set(
              OtoroshiSettings(
                id = containerizedOtoroshi,
                url =
                  s"http://otoroshi.oto.tools:${container.mappedPort(8080)}",
                host = "otoroshi-api.oto.tools",
                clientSecret = otoroshiAdminApiKey.clientSecret,
                clientId = otoroshiAdminApiKey.clientId
              )
            )
          )
        ),
        users = Seq(daikokuAdmin),
        teams = Seq(defaultAdminTeam),
        usagePlans = Seq(adminApiPlan),
        apis = Seq(adminApi)
      )

      val session = loginWithBlocking(daikokuAdmin, tenant)
      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${defaultAdminTeam.id.value}/apis/${adminApi.id.value}/${adminApi.currentVersion.value}/plan/${adminApiPlan.id.value}",
        method = "PUT",
        body = Some(updatedAdminPlan.asJson)
      )(using tenant, session)

      resp.status mustBe 200
      val result =
        fr.maif.daikoku.domain.json.UsagePlanFormat.reads(resp.json)
      result.isSuccess mustBe true

      val adminPlan = result.get

      adminPlan.customName mustBe adminApiPlan.customName
      adminPlan.customDescription mustBe adminApiPlan.customDescription
      adminPlan.otoroshiTarget.isDefined mustBe true
      adminPlan.otoroshiTarget.get.otoroshiSettings mustBe containerizedOtoroshi
      adminPlan.otoroshiTarget.get.authorizedEntities.value.groups must contain(
        OtoroshiServiceGroupId(serviceGroupAdmin)
      )
    }
  }

  "a deletion of a key" must {
    "not remove team from authorized teams if plan is private" in {
      val plan = UsagePlan(
        id = UsagePlanId(IdGenerator.token),
        tenant = tenant.id,
        customName = "MyPrivatePlan",
        customDescription = None,
        otoroshiTarget = Some(
          OtoroshiTarget(
            OtoroshiSettingsId("default"),
            Some(
              AuthorizedEntities(groups = Set(OtoroshiServiceGroupId("12345")))
            )
          )
        ),
        allowMultipleKeys = Some(false),
        visibility = Private,
        authorizedTeams = Seq(teamConsumerId),
        autoRotation = Some(false),
        subscriptionProcess = Seq.empty,
        integrationProcess = IntegrationProcess.ApiKey
      )
      val keyring = Keyring(
        id = KeyringId("keyring"),
        tenant = tenant.id,
        team = teamConsumerId,
        apiKey = OtoroshiApiKey("name", "id", "secret"),
        otoroshiSettings =
          KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi),
        createdAt = DateTime.now(),
        integrationToken = "test-removal"
      )
      val payperUseSub = ApiSubscription(
        id = ApiSubscriptionId("test-removal"),
        tenant = tenant.id,
        plan = plan.id,
        createdAt = DateTime.now(),
        team = teamConsumerId,
        api = defaultApi.api.id,
        by = daikokuAdminId,
        customName = None,
        keyring = keyring.id
      )

      setupEnvBlocking(
        tenants = Seq(tenant),
        users = Seq(userAdmin),
        teams = Seq(
          teamOwner,
          teamConsumer
        ),
        usagePlans = Seq(plan),
        apis = Seq(
          defaultApi.api.copy(
            possibleUsagePlans = Seq(plan.id)
          )
        ),
        keyrings = Seq(keyring),
        subscriptions = Seq(payperUseSub)
      )

      val session = loginWithBlocking(userAdmin, tenant)

      val resp = httpJsonCallBlocking(
        path =
          s"/api/teams/${teamOwnerId.value}/subscriptions/${payperUseSub.id.value}?action=delete",
        method = "DELETE"
      )(using tenant, session)

      resp.status mustBe 200

      val planAuthorizedTeamCheck = httpJsonCallBlocking(
        path =
          s"/api/me/visible-apis/${defaultApi.api.id.value}/${defaultApi.api.currentVersion.value}/plans"
      )(using tenant, session)
      planAuthorizedTeamCheck.status mustBe 200

      val planJson = planAuthorizedTeamCheck.json
        .as[JsArray]
        .value
        .find(json => (json \ "customName").as[String] == "MyPrivatePlan")
        .get
      (planJson \ "authorizedTeams")
        .as[Seq[String]] must contain theSameElementsAs (Seq(
        teamConsumerId.value
      ))

    }
  }

}
