package fr.maif.otoroshi.daikoku.domain

import cats.data.EitherT
import cats.implicits.catsSyntaxOptionId
import controllers.AppError
import fr.maif.otoroshi.daikoku.domain.TeamPermission.Administrator
import fr.maif.otoroshi.daikoku.utils.IdGenerator
import org.joda.time.DateTime
import play.api.libs.json._
import cats.implicits._

import javax.crypto.Cipher
import javax.crypto.spec.SecretKeySpec
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

case class CustomMetadata(key: String, possibleValues: Set[String] = Set.empty)
    extends CanJson[CustomMetadata] {
  def asJson: JsValue = json.CustomMetadataFormat.writes(this)
}
case class ApikeyCustomization(
    clientIdOnly: Boolean = false,
    readOnly: Boolean = false,
    constrainedServicesOnly: Boolean = false,
    metadata: JsObject = play.api.libs.json.Json.obj(),
    customMetadata: Seq[CustomMetadata] = Seq.empty,
    tags: JsArray = play.api.libs.json.Json.arr(),
    restrictions: ApiKeyRestrictions = ApiKeyRestrictions()
) extends CanJson[ApikeyCustomization] {
  def asJson: JsValue = json.ApikeyCustomizationFormat.writes(this)
}

case class ApiKeyRotation(
    enabled: Boolean = true,
    rotationEvery: Long = 31 * 24,
    gracePeriod: Long = 7 * 24,
    nextSecret: Option[String] = None
)

case class ApiSubscriptionRotation(
    enabled: Boolean = true,
    rotationEvery: Long = 31 * 24,
    gracePeriod: Long = 7 * 24,
    pendingRotation: Boolean = false
) {
  def toApiKeyRotation: ApiKeyRotation = {
    ApiKeyRotation(
      enabled = enabled,
      rotationEvery = rotationEvery,
      gracePeriod = gracePeriod
    )
  }
}

case class ApiSubscription(
    id: ApiSubscriptionId,
    tenant: TenantId,
    deleted: Boolean = false,
    apiKey: OtoroshiApiKey, // TODO: add the actual plan at the time of the subscription
    plan: UsagePlanId,
    createdAt: DateTime,
    validUntil: Option[DateTime] = None,
    team: TeamId,
    api: ApiId,
    by: UserId,
    customName: Option[String],
    adminCustomName: Option[String] = None,
    enabled: Boolean = true,
    rotation: Option[ApiSubscriptionRotation],
    integrationToken: String,
    customMetadata: Option[JsObject] = None,
    metadata: Option[JsObject] = None,
    tags: Option[Set[String]] = None,
    customMaxPerSecond: Option[Long] = None,
    customMaxPerDay: Option[Long] = None,
    customMaxPerMonth: Option[Long] = None,
    customReadOnly: Option[Boolean] = None,
    parent: Option[ApiSubscriptionId] = None,
    thirdPartySubscriptionInformations: Option[
      ThirdPartySubscriptionInformations
    ] = None
) extends CanJson[ApiSubscription] {
  override def asJson: JsValue = json.ApiSubscriptionFormat.writes(this)
  def asAuthorizedJson(
      permission: TeamPermission,
      planIntegration: IntegrationProcess,
      isDaikokuAdmin: Boolean
  ): JsValue =
    (permission, planIntegration) match {
      case (_, _) if isDaikokuAdmin => json.ApiSubscriptionFormat.writes(this)
      case (Administrator, _)       => json.ApiSubscriptionFormat.writes(this)
      case (_, IntegrationProcess.ApiKey) =>
        json.ApiSubscriptionFormat.writes(this)
      case (_, IntegrationProcess.Automatic) =>
        json.ApiSubscriptionFormat.writes(this).as[JsObject] - "apiKey"
    }
  def asSafeJson: JsValue =
    json.ApiSubscriptionFormat
      .writes(this)
      .as[JsObject] - "apiKey" - "integrationToken" ++ Json.obj(
      "apiKey" -> Json.obj("clientName" -> apiKey.clientName)
    )
  def asSimpleJson: JsValue =
    Json.obj(
      "_id" -> json.ApiSubscriptionIdFormat.writes(id),
      "_tenant" -> json.TenantIdFormat.writes(tenant),
      "_deleted" -> deleted,
      "plan" -> json.UsagePlanIdFormat.writes(plan),
      "team" -> json.TeamIdFormat.writes(team),
      "api" -> json.ApiIdFormat.writes(api),
      "createdAt" -> json.DateTimeFormat.writes(createdAt),
      "validUntil" -> validUntil
        .map(json.DateTimeFormat.writes)
        .getOrElse(JsNull)
        .as[JsValue],
      "customName" -> customName
        .map(id => JsString(id))
        .getOrElse(JsNull)
        .as[JsValue],
      "enabled" -> JsBoolean(enabled)
    )
}

object RemainingQuotas {
  val MaxValue: Long = Int.MaxValue
}

case class ActualOtoroshiApiKey(
    clientId: String = IdGenerator.token(16),
    clientSecret: String = IdGenerator.token(64),
    clientName: String,
    authorizedEntities: AuthorizedEntities,
    enabled: Boolean = true,
    allowClientIdOnly: Boolean = false,
    readOnly: Boolean = false,
    constrainedServicesOnly: Boolean = false,
    throttlingQuota: Long = RemainingQuotas.MaxValue,
    dailyQuota: Long = RemainingQuotas.MaxValue,
    monthlyQuota: Long = RemainingQuotas.MaxValue,
    tags: Set[String] = Set.empty[String],
    metadata: Map[String, String] = Map.empty[String, String],
    restrictions: ApiKeyRestrictions = ApiKeyRestrictions(),
    rotation: Option[ApiKeyRotation],
    validUntil: Option[Long] = None
) extends CanJson[OtoroshiApiKey] {
  override def asJson: JsValue = json.ActualOtoroshiApiKeyFormat.writes(this)
  def asOtoroshiApiKey: OtoroshiApiKey =
    OtoroshiApiKey(
      clientName = clientName,
      clientId = clientId,
      clientSecret = clientSecret
    )
}

sealed trait ApiKeyConsumptionState {
  def name: String
}

object ApiKeyConsumptionState {
  case object Completed extends ApiKeyConsumptionState {
    def name: String = "completed"
  }
  case object InProgress extends ApiKeyConsumptionState {
    def name: String = "inProgress"
  }
}

case class ApiKeyConsumption(
    id: DatastoreId,
    deleted: Boolean = false,
    tenant: TenantId,
    team: TeamId,
    api: ApiId,
    plan: UsagePlanId,
    clientId: String,
    hits: Long,
    globalInformations: ApiKeyGlobalConsumptionInformations,
    quotas: ApiKeyQuotas,
    billing: ApiKeyBilling,
    from: DateTime,
    to: DateTime,
    state: ApiKeyConsumptionState
) extends CanJson[ApiKeyConsumption] {
  override def asJson: JsValue = json.ConsumptionFormat.writes(this)
  def isComplete = state == ApiKeyConsumptionState.Completed
}

case class ApiKeyGlobalConsumptionInformations(
    hits: Long,
    dataIn: Long,
    dataOut: Long,
    avgDuration: Option[Double],
    avgOverhead: Option[Double]
) extends CanJson[ApiKeyGlobalConsumptionInformations] {
  override def asJson: JsValue =
    json.GlobalConsumptionInformationsFormat.writes(this)
}

case class ApiKeyQuotas(
    authorizedCallsPerSec: Long,
    currentCallsPerSec: Long,
    remainingCallsPerSec: Long,
    authorizedCallsPerDay: Long,
    currentCallsPerDay: Long,
    remainingCallsPerDay: Long,
    authorizedCallsPerMonth: Long,
    currentCallsPerMonth: Long,
    remainingCallsPerMonth: Long
) extends CanJson[ApiKeyQuotas] {
  override def asJson: JsValue = json.ApiKeyQuotasFormat.writes(this)
}

case class ApiKeyBilling(hits: Long, total: BigDecimal)
    extends CanJson[ApiKeyBilling] {
  override def asJson: JsValue = json.ApiKeyBillingFormat.writes(this)
}

sealed trait ThirdPartySubscriptionInformations {
  def asJson: JsValue =
    json.ThirdPartySubscriptionInformationsFormat.writes(this)
}

object ThirdPartySubscriptionInformations {
  case class StripeSubscriptionInformations(
      subscriptionId: String,
      primaryElementId: Option[String],
      meteredElementId: Option[String]
  ) extends ThirdPartySubscriptionInformations {}
}

sealed trait SubscriptionDemandState {
  def name: String
  def isClosed: Boolean
}

object SubscriptionDemandState {
  case object Accepted extends SubscriptionDemandState {
    def name: String = "accepted"
    def isClosed: Boolean = true
  }
  case object Refused extends SubscriptionDemandState {
    def name: String = "refused"
    def isClosed: Boolean = true
  }
  case object Canceled extends SubscriptionDemandState {
    def name: String = "canceled"
    def isClosed: Boolean = true
  }
  case object InProgress extends SubscriptionDemandState {
    def name: String = "inProgress"
    def isClosed: Boolean = false
  }
  case object Waiting extends SubscriptionDemandState {
    def name: String = "waiting"
    def isClosed: Boolean = false
  }
  case object Blocked extends SubscriptionDemandState {
    def name: String = "blocked"
    def isClosed: Boolean = true
  }

  val values: Seq[SubscriptionDemandState] =
    Seq(Accepted, Refused, Canceled, InProgress)

  def merge(states: Seq[SubscriptionDemandState]): SubscriptionDemandState = {
    if (states.exists(_.name === InProgress.name)) {
      InProgress
    } else if (states.forall(_.name === Accepted.name)) {
      Accepted
    } else if (states.exists(_.name === Refused.name)) {
      Refused
    } else if (states.exists(_.name === Canceled.name)) {
      Canceled
    } else if (states.exists(_.name === Blocked.name)) {
      Blocked
    } else {
      Waiting
    }
  }

  def apply(name: String): Option[SubscriptionDemandState] =
    name match {
      case "accepted"   => Accepted.some
      case "refused"    => Refused.some
      case "canceled"   => Canceled.some
      case "inProgress" => InProgress.some
      case "waiting"    => Waiting.some
      case _            => None
    }
}

case class SubscriptionDemand(
    id: SubscriptionDemandId,
    tenant: TenantId,
    deleted: Boolean = false,
    api: ApiId,
    plan: UsagePlanId,
    steps: Seq[SubscriptionDemandStep],
    state: SubscriptionDemandState = SubscriptionDemandState.Waiting,
    team: TeamId,
    from: UserId,
    date: DateTime = DateTime.now,
    motivation: Option[JsObject] = None,
    parentSubscriptionId: Option[ApiSubscriptionId] = None,
    customReadOnly: Option[Boolean] = None,
    customMetadata: Option[JsObject] = None,
    customMaxPerSecond: Option[Long] = None,
    customMaxPerDay: Option[Long] = None,
    customMaxPerMonth: Option[Long] = None,
    adminCustomName: Option[String] = None,
    customName: Option[String] = None,
    tags: Option[Set[String]] = None
) extends CanJson[SubscriptionDemand] {
  override def asJson: JsValue = json.SubscriptionDemandFormat.writes(this)
}

case class SubscriptionDemandStep(
    id: SubscriptionDemandStepId,
    state: SubscriptionDemandState,
    step: ValidationStep,
    metadata: JsObject = Json.obj()
) extends CanJson[SubscriptionDemandStep] {
  override def asJson: JsValue = json.SubscriptionDemandStepFormat.writes(this)
  def check(): EitherT[Future, AppError, Unit] = {
    state match {
      case SubscriptionDemandState.InProgress |
          SubscriptionDemandState.Waiting =>
        EitherT.pure[Future, AppError](())
      case _ =>
        EitherT.leftT[Future, Unit](
          AppError.EntityConflict("Subscription demand state")
        )
    }
  }
}

case class StepValidator(
    id: DatastoreId,
    tenant: TenantId,
    deleted: Boolean = false,
    token: String,
    step: SubscriptionDemandStepId,
    subscriptionDemand: SubscriptionDemandId,
    metadata: JsObject = Json.obj()
) extends CanJson[StepValidator] {
  override def asJson: JsValue = json.StepValidatorFormat.writes(this)
}

case class ApiSubscriptionTransfer(
    id: DatastoreId,
    tenant: TenantId,
    deleted: Boolean = false,
    token: String,
    subscription: ApiSubscriptionId,
    date: DateTime,
    by: UserId
) extends CanJson[ApiSubscriptionTransfer] {
  override def asJson: JsValue = json.ApiSubscriptionTransferFormat.writes(this)
}
