package fr.maif.otoroshi.daikoku.domain

case class ApiSubscriptionAccessibleResource(
    apiSubscription: ApiSubscription,
    api: Api,
    usagePlan: UsagePlan
)

case class ApiSubscriptionDetail(
    apiSubscription: ApiSubscription,
    parentSubscription: Option[ApiSubscription],
    accessibleResources: Seq[ApiSubscriptionAccessibleResource]
)
