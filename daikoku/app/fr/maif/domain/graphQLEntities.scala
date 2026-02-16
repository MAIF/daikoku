package fr.maif.domain

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
