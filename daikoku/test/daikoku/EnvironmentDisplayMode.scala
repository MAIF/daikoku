package daikoku

import cats.implicits.catsSyntaxOptionId
import fr.maif.domain.{
  IntegrationProcess,
  Tenant,
  TenantDisplay,
  UsagePlan,
  UsagePlanId
}
import fr.maif.tests.utils.DaikokuSpecHelper
import fr.maif.utils.IdGenerator
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.{JsArray, Json}

import scala.concurrent.duration.{FiniteDuration, _}

class EnvironmentDisplayMode()
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience {

  def createPlan(name: String, tenant: Tenant): UsagePlan =
    UsagePlan(
      id = UsagePlanId(IdGenerator.token),
      tenant = tenant.id,
      customName = name,
      customDescription = None,
      otoroshiTarget = None,
      allowMultipleKeys = Some(false),
      subscriptionProcess = Seq.empty,
      integrationProcess = IntegrationProcess.ApiKey,
      autoRotation = Some(false)
    )

  "a usage  plan" must {
    "run" in {
      await(5 second)
    }
    "have a custom name as an avalaible environment" in {

      val api = generateApi("0", tenant.id, teamOwnerId, Seq.empty).api
        .copy(possibleUsagePlans = Seq.empty)

      val t = tenant2.copy(
        display = TenantDisplay.Environment,
        environments = Set("dev", "prod")
      )

      setupEnvBlocking(
        tenants = Seq(t, tenant),
        teams = Seq(teamOwner.copy(tenant = t.id)),
        users = Seq(userAdmin),
        usagePlans = Seq(),
        apis = Seq(api.copy(tenant = t.id))
      )

      val devPlan = createPlan("dev", t)
      val devPlan2 = createPlan("dev", t)
      val preprodplan = createPlan("preprod", t)
      val nonePlan = createPlan("None", t)

      val session = loginWithBlocking(userAdmin, t)

      // can create plan with avalaible env
      val respDev = httpJsonCallBlocking(
        s"/api/teams/${teamOwner.id.value}/apis/${api.id.value}/${api.currentVersion.value}/plan",
        method = "POST",
        body = devPlan.asJson.some
      )(t, session)
      respDev.status mustBe 201
      // can create plan with avalaible env
      val respDev2 = httpJsonCallBlocking(
        s"/api/teams/${teamOwner.id.value}/apis/${api.id.value}/${api.currentVersion.value}/plan",
        method = "POST",
        body = devPlan2.asJson.some
      )(t, session)
      respDev2.status mustBe 409

      // can't create plan with unknown env name
      val respPreprod = httpJsonCallBlocking(
        s"/api/teams/${teamOwner.id.value}/apis/${api.id.value}/${api.currentVersion.value}/plan",
        method = "POST",
        body = preprodplan.asJson.some
      )(t, session)
      respPreprod.status mustBe 409

      // can't create plan with no custom name
      val respNone = httpJsonCallBlocking(
        s"/api/teams/${teamOwner.id.value}/apis/${api.id.value}/${api.currentVersion.value}/plan",
        method = "POST",
        body = nonePlan.asJson.some
      )(t, session)
      respNone.status mustBe 409

    }

    "be deleted if associated env is deleted" in {
      val t = tenant2.copy(
        display = TenantDisplay.Environment,
        environments = Set("dev", "prod")
      )

      val devPlan = createPlan("dev", t)
      val prodPlan = createPlan("prod", t)

      val api = generateApi("0", t.id, teamOwnerId, Seq.empty).api
        .copy(possibleUsagePlans = Seq(devPlan.id, prodPlan.id))

      setupEnvBlocking(
        tenants = Seq(t),
        teams = Seq(teamOwner, defaultAdminTeam, tenant2AdminTeam),
        users = Seq(tenantAdmin, user),
        usagePlans = Seq(devPlan, prodPlan),
        apis = Seq(api)
      )

      // user is admin for tenant2
      val session = loginWithBlocking(user, t)

      // can create plan with avalaible env
      val respUpdateTenant = httpJsonCallBlocking(
        s"/api/tenants/${t.id.value}",
        method = "PUT",
        body = t.copy(environments = Set("prod")).asJson.some
      )(t, session)
      respUpdateTenant.status mustBe 200

      val respVerif = httpJsonCallBlocking(
        s"/api/me/visible-apis/${api.id.value}"
      )(t, session)
      respVerif.status mustBe 200
      (respVerif.json \ "possibleUsagePlans").as[JsArray].value.size mustBe 1
      val uniqPlan = (respVerif.json \ "possibleUsagePlans")
        .as[JsArray]
        .value
        .head
        .as[String]
      uniqPlan mustBe prodPlan.id.value
    }
  }
}
