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

### UsagePlan
A subscription plan attached to an API. An API has N plans, and it is a **plan** that gets
subscribed, not the API directly. A plan carries pricing (`BillingDuration`, `Currency`,
`PaymentSettings` / Stripe), quotas, visibility and Otoroshi configuration.

### ApiSubscription
The link between a consumer team and an `(API, plan)`. Since the keyring change, a subscription
**always points to a `Keyring`** (`keyring: KeyringId`) and only holds the values needed to *compute*
the API key: custom metadata, custom quotas (`customMaxPerSecond/Day/Month`), `customReadOnly`, tags,
custom name. The technical Otoroshi values no longer live here — they live on the keyring.

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

### Notification
Domain events with a Pending / Accepted / Rejected status: API access requests, team invitations,
subscription accept/reject, Otoroshi sync errors, API key rotation, new posts/issues, etc.

### CMS page
Editable pages of the public portal (`HomeController`, CMS API), tied to the tenant theming.

## Otoroshi integration

Daikoku drives Otoroshi. Subscribing provisions an API key on the Otoroshi side (via the keyring),
and background jobs reconcile the two systems: `OtoroshiSynchronizerJob`,
`OtoroshiEntitiesVerifierJob`, plus apikey secret rotation and subscription expiration jobs. Otoroshi
enforces quotas/routing; Daikoku is the portal/system of record.
</content>
