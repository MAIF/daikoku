package fr.maif.otoroshi.daikoku.domain

import play.api.libs.json.{Format, JsError, JsNull, JsResult, JsString, JsSuccess, JsValue, Json}


case class ApiSubscriptionAccessibleResource(
    apiSubscription: ApiSubscription,
    api: Api,
    usagePlan: UsagePlan)

case class ApiSubscriptionDetail(
    apiSubscription: ApiSubscription,
    parentSubscription: Option[ApiSubscription],
    accessibleResources: Seq[ApiSubscriptionAccessibleResource])