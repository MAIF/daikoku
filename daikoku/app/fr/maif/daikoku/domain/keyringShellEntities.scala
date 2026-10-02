package fr.maif.daikoku.domain

import org.joda.time.DateTime

/** Provenance remains after activation; pending references protect shell cleanup. */
case class KeyringShellProvenance(
    batch: SubscriptionBatchDemandId,
    creation: SubscriptionBatchKeyringId,
    pendingItems: Seq[SubscriptionBatchReference],
    activatedAt: Option[DateTime] = None
)

/** One managed empty group per tenant Otoroshi configuration, never per keyring. */
case class KeyringEmptyGroup(
    id: String,
    ownershipToken: String
)
