package daikoku

import cats.implicits.catsSyntaxOptionId
import fr.maif.otoroshi.daikoku.domain.UsagePlan.FreeWithoutQuotas
import fr.maif.otoroshi.daikoku.domain.{
  BillingDuration,
  BillingTimeUnit,
  Currency,
  IntegrationProcess,
  OtoroshiTarget,
  TenantDisplay,
  UsagePlan,
  UsagePlanId
}
import fr.maif.otoroshi.daikoku.tests.utils.DaikokuSpecHelper
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import org.scalatest.concurrent.IntegrationPatience
import org.scalatestplus.play.PlaySpec
import play.api.libs.json.{JsArray, Json}

class EnvironmentDisplayMode()
    extends PlaySpec
    with DaikokuSpecHelper
    with IntegrationPatience {

  def createPlan(maybeName: Option[String]): UsagePlan = FreeWithoutQuotas(
    id = UsagePlanId(IdGenerator.token),
    tenant = tenant.id,
    billingDuration = BillingDuration(1, BillingTimeUnit.Month),
    currency = Currency("EUR"),
    customName = maybeName,
    customDescription = None,
    otoroshiTarget = None,
    allowMultipleKeys = Some(false),
    subscriptionProcess = Seq.empty,
    integrationProcess = IntegrationProcess.ApiKey,
    autoRotation = Some(false)
  )

  "a usage  plan" must {
    "have a custom name as an avalaible environment" in {

      val api = generateApi("0", tenant.id, teamOwnerId, Seq.empty).api
        .copy(possibleUsagePlans = Seq.empty)

      val t = tenant.copy(display = TenantDisplay.Environment,
                          environments = Set("dev", "prod"))

      setupEnvBlocking(
        tenants = Seq(t),
        teams = Seq(teamOwner),
        users = Seq(userAdmin),
        usagePlans = Seq(),
        apis = Seq(api)
      )

      val devPlan = createPlan("dev".some)
      val devPlan2 = createPlan("dev".some)
      val preprodplan = createPlan("preprod".some)
      val nonePlan = createPlan(None)

      val session = loginWithBlocking(userAdmin, tenant)

      // can create plan with avalaible env
      val respDev = httpJsonCallBlocking(
        s"/api/teams/${teamOwner.id.value}/apis/${api.id.value}/${api.currentVersion.value}/plan",
        method = "POST",
        body = devPlan.asJson.some)(tenant, session)
      respDev.status mustBe 201

      // can create plan with avalaible env
      val respDev2 = httpJsonCallBlocking(
        s"/api/teams/${teamOwner.id.value}/apis/${api.id.value}/${api.currentVersion.value}/plan",
        method = "POST",
        body = devPlan2.asJson.some)(tenant, session)
      respDev2.status mustBe 409

      // can't create plan with unknown env name
      val respPreprod = httpJsonCallBlocking(
        s"/api/teams/${teamOwner.id.value}/apis/${api.id.value}/${api.currentVersion.value}/plan",
        method = "POST",
        body = preprodplan.asJson.some)(tenant, session)
      respPreprod.status mustBe 409

      // can't create plan with no custom name
      val respNone = httpJsonCallBlocking(
        s"/api/teams/${teamOwner.id.value}/apis/${api.id.value}/${api.currentVersion.value}/plan",
        method = "POST",
        body = nonePlan.asJson.some)(tenant, session)
      respNone.status mustBe 409

    }

    "be deleted if associated env is deleted" in {

      val devPlan = createPlan("dev".some)
      val prodPlan = createPlan("prod".some)

      val api = generateApi("0", tenant.id, teamOwnerId, Seq.empty).api
        .copy(possibleUsagePlans = Seq(devPlan.id, prodPlan.id))

      val _tenant = tenant.copy(display = TenantDisplay.Environment,
                                environments = Set("dev", "prod"))
      setupEnvBlocking(
        tenants = Seq(_tenant),
        teams = Seq(teamOwner, defaultAdminTeam),
        users = Seq(tenantAdmin),
        usagePlans = Seq(devPlan, prodPlan),
        apis = Seq(api)
      )

      val session = loginWithBlocking(tenantAdmin, tenant)

      // can create plan with avalaible env
      val respUpdateTenant = httpJsonCallBlocking(
        s"/api/tenants/${tenant.id.value}",
        method = "PUT",
        body = _tenant.copy(environments = Set("prod")).asJson.some)(_tenant,
                                                                     session)
      respUpdateTenant.status mustBe 200

      val respVerif = httpJsonCallBlocking(
        s"/api/me/visible-apis/${api.id.value}")(tenant, session)
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
