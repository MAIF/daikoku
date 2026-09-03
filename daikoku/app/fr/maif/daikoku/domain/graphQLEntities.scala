package fr.maif.daikoku.domain

case class ApiSubscriptionAccessibleResource(
    apiSubscription: ApiSubscription,
    api: Api,
    usagePlan: UsagePlan
)

case class ApiSubscriptionDetail(
    apiSubscription: ApiSubscription,
    keyring: Option[Keyring],
    accessibleResources: Seq[ApiSubscriptionAccessibleResource]
)
