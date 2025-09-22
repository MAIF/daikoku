package fr.maif.otoroshi.daikoku.domain

import org.joda.time.DateTime
import play.api.libs.json._

trait CanJson[A] {
  def asJson: JsValue
}

sealed trait ValueType {
  def value: String
}
case class OtoroshiServiceId(value: String)
    extends ValueType
    with CanJson[OtoroshiServiceId] {
  def asJson: JsValue = JsString(value)
}
case class OtoroshiRouteId(value: String)
    extends ValueType
    with CanJson[OtoroshiRouteId] {
  def asJson: JsValue = JsString(value)
}
case class OtoroshiSettingsId(value: String)
    extends ValueType
    with CanJson[OtoroshiSettingsId] {
  def asJson: JsValue = JsString(value)
}
case class UsagePlanId(value: String)
    extends ValueType
    with CanJson[UsagePlanId] {
  def asJson: JsValue = JsString(value)
}
case class UserId(value: String) extends ValueType with CanJson[UserId] {
  def asJson: JsValue = JsString(value)
}
case class TeamId(value: String) extends ValueType with CanJson[TeamId] {
  def asJson: JsValue = JsString(value)
}
case class ApiId(value: String) extends ValueType with CanJson[ApiId] {
  def asJson: JsValue = JsString(value)
}
case class ApiSubscriptionId(value: String)
    extends ValueType
    with CanJson[ApiSubscriptionId] {
  def asJson: JsValue = JsString(value)
}
case class ApiDocumentationId(value: String)
    extends ValueType
    with CanJson[ApiDocumentationId] {
  def asJson: JsValue = JsString(value)
}
case class ApiDocumentationPageId(value: String)
    extends ValueType
    with CanJson[ApiDocumentationPageId] {
  def asJson: JsValue = JsString(value)
}
case class Version(value: String) extends ValueType with CanJson[Version] {
  def asJson: JsValue = JsString(value)
}
case class TenantId(value: String) extends ValueType with CanJson[TenantId] {
  def asJson: JsValue = JsString(value)
}

case class OtoroshiGroup(value: String)
    extends ValueType
    with CanJson[OtoroshiGroup] {
  def asJson: JsValue = JsString(value)
}
case class OtoroshiServiceGroupId(value: String)
    extends ValueType
    with CanJson[OtoroshiServiceGroupId] {
  def asJson: JsValue = JsString(value)
}
case class NotificationId(value: String)
    extends ValueType
    with CanJson[NotificationId] {
  def asJson: JsValue = JsString(value)
}
case class UserSessionId(value: String)
    extends ValueType
    with CanJson[UserSessionId] {
  def asJson: JsValue = JsString(value)
}
case class DatastoreId(value: String)
    extends ValueType
    with CanJson[DatastoreId] {
  def asJson: JsValue = JsString(value)
}
case class ChatId(value: String) extends ValueType with CanJson[ChatId] {
  def asJson: JsValue = JsString(value)
}
case class ApiPostId(value: String) extends ValueType with CanJson[ApiPostId] {
  def asJson: JsValue = JsString(value)
}
case class ApiIssueId(value: String)
    extends ValueType
    with CanJson[ApiIssueId] {
  def asJson: JsValue = JsString(value)
}
case class ApiIssueTagId(value: String)
    extends ValueType
    with CanJson[ApiIssueTagId] {
  def asJson: JsValue = JsString(value)
}

case class CmsPageId(value: String) extends ValueType with CanJson[CmsPageId] {
  def asJson: JsValue = JsString(value)
}

case class AssetId(value: String) extends ValueType with CanJson[AssetId] {
  def asJson: JsValue = JsString(value)
}

case class ThirdPartyPaymentSettingsId(value: String)
    extends ValueType
    with CanJson[CmsPageId] {
  def asJson: JsValue = JsString(value)
}

case class DemandId(value: String)
    extends ValueType
    with CanJson[DemandId] {
  def asJson: JsValue = JsString(value)
}

case class SubscriptionDemandStepId(value: String)
    extends ValueType
    with CanJson[SubscriptionDemandStepId] {
  def asJson: JsValue = JsString(value)
}

case class Translation(
    id: DatastoreId,
    tenant: TenantId,
    language: String,
    key: String,
    value: String,
    lastModificationAt: Option[DateTime] = None
) extends CanJson[Translation] {
  override def asJson: JsValue = json.TranslationFormat.writes(this)
  def asUiTranslationJson: JsValue = {
    Json.obj(
      key -> value
    )
  }
}

case class IntlTranslation(
    id: String,
    translations: Seq[Translation],
    content: String
)

case class Evolution(
    id: DatastoreId,
    version: String,
    applied: Boolean,
    date: DateTime = new DateTime()
) extends CanJson[Evolution] {
  override def asJson: JsValue = json.EvolutionFormat.writes(this)
}

case class ReportsInfo(
    id: DatastoreId,
    activated: Boolean,
    date: Option[Long] = None
) extends CanJson[ReportsInfo] {
  override def asJson: JsValue = json.ReportsInfoFormat.writes(this)
}
