# Daikoku domain glossary

Business vocabulary and relationships between the core entities. Definitions map to the Scala model
under `daikoku/app/fr/maif/daikoku/domain`. This is reference material — read it before reasoning
about a feature, do not treat it as a spec.

## Big picture

Daikoku is a developer portal in front of [Otoroshi](https://maif.github.io/otoroshi) (the API
gateway). Daikoku is where humans publish APIs, request access, and manage subscriptions; Otoroshi
is where the resulting API keys actually apply quotas and routing. Most write operations in Daikoku
are eventually **synchronized to Otoroshi** by background jobs.

## Core entities

### Tenant
An isolated portal. A single Daikoku deployment hosts several independent tenants, resolved by
hostname (or another provider strategy). A tenant owns its style/theme (`DaikokuStyle`), auth mode,
mailer settings, Otoroshi settings and payment settings.

### Team
Owner of APIs and/or consumer of APIs. `TeamType` distinguishes three roles:
- **Personal** — mirrors a single user (same idea as a GitHub personal account: the "team" is just
  the reflection of one user).
- **Organization** — a real, multi-member team.
- **Admin** — the tenant's administration team. There is no separate "tenant admin" flag: holding
  tenant-admin rights *is* being a member of this team.

Members hold a `TeamPermission` (Administrator / ApiEditor / User).

### User
An account, attached to one or more teams. May be a Daikoku super-admin, a guest (`GuestUser`), and
may use 2FA.

### Api
An API published by a producer team. Versioned (`Version`), has an `ApiState`
(created/published/blocked/deprecated), a visibility (`ApiVisibility`: Public / PublicWithAuth /
Private), plus documentation, posts and issues.

The `ApiState` follows a guarded lifecycle (transitions enforced by `ApiState.checkPreviousState`):

- **Created** — draft: not listed in the catalog, not subscribable.
- **Published** — live: listed and subscribable.
- **Deprecated** — still listed and **still subscribable**; existing keys keep working. Consumers are
  simply warned (a confirmation prompt before subscribing, plus an optional deprecation
  notification/mail from the producer) that the API is on its way out.
- **Blocked** — hidden from the catalog, `401` on the API page, subscribing is refused, and every key
  derived from its subscriptions is cut (see *API lifecycle & subscription blocking* below).

Only `published`/`deprecated` APIs are surfaced to consumers (`ApiState.publishedJsonFilter`).

### UsagePlan
A subscription plan attached to an API. An API has N plans, and it is a **plan** that gets
subscribed, not the API directly. A plan carries pricing (`BillingDuration`, `Currency`,
`PaymentSettings` / Stripe), quotas, visibility and Otoroshi configuration.

### ApiSubscription
The link between a consumer team and an `(API, plan)`. Since the keyring change, a subscription
**always points to a `Keyring`** (`keyring: KeyringId`) and only holds the values needed to *compute*
the API key: custom metadata, custom quotas (`customMaxPerSecond/Day/Month`), `customReadOnly`, tags,
custom name. The technical Otoroshi values no longer live here — they live on the keyring.

It also carries its blocking status as `blockedBy: Set[SubscriptionBlockReason]`, where a reason is
`Owner` (the API producer blocked this individual subscription) and/or `Lifecycle` (the whole API is
blocked). The subscription's `state` (`active` / `blocked`) is **derived** from it — blocked as soon
as `blockedBy` is non-empty — so `blockedBy` is the single source of truth. A subscription
contributes its rights to the keyring key only when `enabled && blockedBy.isEmpty`, where `enabled`
is the consumer-side archive toggle and `blockedBy` is the producer/lifecycle side.

### Keyring
The entity that actually carries the technical Otoroshi credentials (introduced to replace the old
aggregation model). A keyring holds:
- `apiKey: OtoroshiApiKey` — the real clientId / clientSecret / clientName,
- `otoroshiSettings: KeyringOtoroshiBinding` — either `Otoroshi(settingsId)` (bound to an Otoroshi
  instance) or `Internal`,
- `integrationToken`, optional `bearerToken`, optional rotation, and third-party (Stripe) info.

Think of it as a **keyring / key holder** (final wording TBD). Because an Otoroshi API key can be
authorized on as many entities as you want, **multiple subscriptions can point to the same keyring**;
Daikoku then computes a *merged* value from all of them. This is exactly what the previous
**aggregation** feature did — aggregation is now expressed through a shared keyring.

### SubscriptionDemand
The workflow for requesting a subscription, made of `ValidationStep`s (Form / Email / TeamAdmin /
Payment / HttpRequest) and tracked by a `SubscriptionDemandState`.

### SubscriptionBatchDemand
A durable parent for a multi-plan request by one consumer team. Each item snapshots its API, plan,
process and existing/shared-new-keyring choice. Classic `SubscriptionDemand` children are created
at submission, with a unique `(tenant, batch, item)` identity; creating a child and linking its parent
is transactional. The parent summary is derived from independent item outcomes, so a refusal does
not close other unfinished items.

The multi-API consumer flow first reuses the team-selection modal, then opens the API key
preparation workspace at `/apis/subscriptions/keyrings`. The UI presents keyrings as API keys,
with a destination list and a detail panel. Consumers can prepare multiple named new keys or
search and import several existing team keys. Existing access is shown separately from requested
additions and cannot be removed from this workspace. Individual or selected plans can be dragged
onto a destination; checkboxes and Enter on a destination provide a non-drag alternative.
Removing a key from the draft returns its requested plans to the unassigned list without deleting
the existing keyring or subscriptions.

In environment mode, unassigned plans are grouped by environment. "Arrange by environment"
preserves existing assignments and reuses compatible draft destinations, preferring imported keys,
or prepares new keys. Ambiguous destinations and incompatible process sets require consumer
choices; excluded plans remain unassigned. The arrangement can be undone until a subsequent
change to the keys or assignments.

The review screen separates new keys, additions to existing keys and unassigned plans, and warns
about deprecated APIs. Consumers can return to editing before submission. Only assigned plans
are submitted; keys without additions are ignored. No server-side creation occurs before the final
submission and any required motivation form.

The preparation remains a local, unsaved draft. Navigation is guarded once a key is in the draft,
and reload/close uses a browser warning. Confirming departure discards the draft. Reloading retains
the initial APIs and team from navigation history but resets keys and assignments. Opening the URL
without a selection displays a catalog link rather than creating a request.

The plan picker excludes existing subscriptions when multiple keys are forbidden, pending unit
requests and open batch items (even before child materialization), unauthorized plans and plans
unsupported by the batch workflow. Environment shortcuts operate on remaining eligible plans only.
Different Otoroshi bindings or read-only modes require separate keys. Plans that disallow
aggregation keep an individual keyring. A shared creation is sent once in `newKeyrings`, with every
item in its group referencing the same creation ID. Manual assignments allow grouping and splitting
within the compatibility rules. Assignments enforce compatible
subscription processes, tenant/plan aggregation permissions, Otoroshi bindings and read-only modes;
environment names must also match when environment aggregation security is enabled. Imports check
all existing keyring members. Invalid moves are rejected atomically with an explanation.

Submission idempotency is scoped to tenant, consumer team and requester. Parent mutations use a
revision guard and row locks for operations spanning children. Item reservations retain an operation
token and expiration; expiration does not authorize replaying an external effect. An expired
reservation is retained with an explicit error until its outcome can be reconciled.

Progression is part of the action that changes the workflow: submission, grouped approval or
refusal, form/email validation, cancellation, resource deletion, explicit failure reconciliation or
resume. Each action prepares the selected batch's shared keyrings, creates all eligible children and advances every
executable child until it needs human input or a callback, or reaches a terminal state. HTTP steps
remain individual and are executed sequentially. Phase barriers are reconsidered within the same
action when another child unblocks them. There is no batch scheduler, periodic scan or slice size.
After a server interruption, the explicit resume action continues persisted work; uncertain external
effects require reconciliation before they can be retried.

The persistence layer includes batch import/export, optional keyring-shell provenance (source batch,
shared creation, pending items and activation date), and managed-empty-group identity in each
tenant's Otoroshi configuration. Batch preparation allocates and saves this managed-empty-group
identity if missing, then creates or verifies the Otoroshi group before provisioning the disabled
shell key.

Evolution `19.0.0_f` provisions the managed empty groups required by batch keyring shells for every
existing tenant's Otoroshi configuration. Like other registered evolutions, it runs automatically
at startup when not already applied; administrators should plan the deployment before using batch
requests with new Otoroshi keyrings. It persists missing group identities before contacting Otoroshi,
preserves existing identities, and verifies ownership and emptiness. An unavailable instance or
invalid group fails the evolution; after correcting the configuration, rerun it to reuse the
reserved identities and verify previously provisioned groups. Pending batches can then be resumed
explicitly. Run the evolution during a maintenance window without concurrent tenant
configuration changes, and ensure every configured Otoroshi instance is reachable with valid
administrative credentials.

### Notification
Domain events with a Pending / Accepted / Rejected status: API access requests, team invitations,
subscription accept/reject, Otoroshi sync errors, API key rotation, new posts/issues, etc.

### CMS page
Editable pages of the public portal (`HomeController`, CMS API), tied to the tenant theming.

## API lifecycle & subscription blocking

Blocking is expressed on subscriptions (via `blockedBy`) and reconciled through keyrings; the
lifecycle service (`ApiLifeCycleService`) never patches Otoroshi keys directly — it mutates
`blockedBy` and lets `OtoroshiSynchronizerJob` recompute the keys.

- **Blocking an API** (`published`/`deprecated` → `blocked`) adds the `Lifecycle` reason to every
  subscription of that API, then runs the synchronizer.
- **Deblocking** (`blocked` → `published`/`deprecated`) removes **only** the `Lifecycle` reason. A
  subscription the producer had blocked by hand keeps its `Owner` reason and stays blocked — a
  block/deblock cycle never silently re-enables it.
- **Blocking a single subscription** (producer action, `PUT .../_archiveByOwner`) toggles the `Owner`
  reason on that one subscription. It is reserved to editors of the *producing* team and is refused
  while the whole API is already blocked.

Because a keyring can aggregate subscriptions from **several** APIs, the synchronizer recomputes each
keyring key from its still-active members only (`enabled && blockedBy.isEmpty`): a shared keyring
stays alive for the other APIs, and a key whose members are all blocked is **disabled, not deleted**
— the subscriptions are kept so the block can be rolled back. `KeyringOtoroshiBinding.Internal`
keyrings have no Otoroshi key to reconcile and are skipped.

## Otoroshi integration

Daikoku drives Otoroshi. Subscribing provisions an API key on the Otoroshi side (via the keyring),
and background jobs reconcile the two systems: `OtoroshiSynchronizerJob`,
`OtoroshiEntitiesVerifierJob`, plus apikey secret rotation and subscription expiration jobs. Otoroshi
enforces quotas/routing; Daikoku is the portal/system of record.
</content>
