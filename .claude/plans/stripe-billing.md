# Stripe billing: finish the branch

Branch: `stripe` · Base: `0a0ea16c0` · Created on 2026-10-16

## Goal

The `stripe` branch applies every decision of the October grill: unpaid invoices are left to Stripe,
a subscription cancelled in Stripe ends with the `Ended` block reason, Stripe bills only while a
subscription carries no block reason, and no legacy or trial code is left. The branch is up to date
with master and the PR is open.

## Decisions

- **D1** · Daikoku no longer reads, announces or acts on unpaid invoices. Removed: `UnpaidInvoice`,
  `unpaidInvoiceOf`, the reconciliation job's `handleUnpaid` / `cutForUnpaid`,
  `BillingNotificationService.paymentFailed` / `keyDisabled`, the `SubscriptionPaymentFailed` /
  `SubscriptionKeyDisabled` notifications (domain, JSON, GraphQL, front, mails, i18n),
  `StripeSettings.cutOnUnpaid` (domain, JSON, tenant form), `unpaid` / `cutAt` in `BillingStatus` and
  on the billing screen, the `invoice.paid` webhook handler, and the matching manual sections. The
  reconciliation job keeps usage reconciliation and price alignment only. The tenant handles
  dunning, mails and the final decision in its own Stripe.
- **D2** · New `SubscriptionBlockReason.Ended` (`"ended"`), set only by the
  `customer.subscription.deleted` webhook. It is terminal: no code path removes it (owner unblock,
  lifecycle unblock, admin API). The key stops through `blockedBy`; `enabled` is left untouched. The
  webhook keeps sending `cancellationScheduled` dated of the day.
- **D3** · `controlDemand` (`ApiService`) ignores subscriptions carrying `Ended`: a team can
  subscribe again to the same plan.
- **D4** · Stripe bills if and only if `blockedBy` is empty, otherwise
  `pause_collection[behavior]=void`. A single function in `PaymentClient` aligns the Stripe pause
  with `blockedBy` and does nothing on an `Ended` subscription (the Stripe subscription is gone). It
  replaces `toggleStateThirdPartySubscription` and is called wherever `blockedBy` changes: owner
  block / unblock (`archiveApiKey` with `byOwner`), the admin API, and the subscriptions returned by
  the lifecycle SQL in `ApiLifeCycleService`. The reconciliation job does not touch it.
- **D5** · `enabled` only concerns the key: changing it makes no Stripe call.
- **D6** · `StripeSubscriptionInformations.customerId` is a mandatory `String`. The legacy branch is
  removed: the `legacy` billing state, the `Option` matches on `customerId` in `PaymentClient`, the
  `billing.state.legacy*` translations. Nobody runs Stripe billing in production, so there is no
  transition.
- **D7** · Billing screen badges, by priority: unavailable (error) > ended (`Ended`) > suspended
  (any other block reason, billing paused) > cancellation scheduled > active. The screen no longer
  reads `enabled`; the cut, unpaid and legacy badges are gone. The billing state API exposes
  `blockedBy`.
- **D8** · No trace of a trial period is left: the `Trial*` translation keys, `trialPeriod` in the
  test seeds, `trial_period_days` in `StripeWebhookSpec`. The no-trial guard of `StripeBillingSpec`
  stays.
- **D9** · `daikoku/.env.stripe.example` is committed through a `.gitignore` exception; the real
  `.env.stripe` stays ignored.
- **D10** · `origin/master` is merged into `stripe` (merge, no rebase, history left as is), after D1
  is in place.
- **D11** · GitHub: #1227 and #1228 are closed as not planned with a comment (unpaid invoices left to
  Stripe); the bodies of #1218 and of the epic #1217 are updated; the PR closes #1148, #1149, #1152,
  #1153 and every other sub-issue of #1217, #1220 included (covered by #1231).

## Out of scope

- A Playwright spec for the `/settings/billing` screen.
- Any new issue: everything lands on `stripe`.
- Any migration of existing subscriptions.
- Rewriting the branch history.

## Steps

### E1 · Remove unpaid handling

- Intent: Daikoku stops reading, announcing and cutting on unpaid invoices (D1).
- Zones: `jobs/StripeReconciliationJob.scala`, `controllers/PaymentClient.scala`,
  `controllers/ConsumptionController.scala`, `services/BillingNotificationService.scala`,
  `services/StripeWebhookService.scala`, `domain/teamEntities.scala`, `domain/tenantEntities.scala`,
  `domain/json.scala`, `domain/SchemaDefinition.scala`, `conf/messages.*`,
  `javascript/src/components/backoffice/notifications/NotificationList.tsx`,
  `javascript/src/components/adminbackoffice/tenants/forms/ThirdPartyPaymentForm.tsx`,
  `javascript/src/components/backoffice/billing/SubscriptionBillingStates.tsx`,
  `javascript/src/services/index.ts`, `javascript/src/types/api.ts`, `javascript/src/locales/*`,
  Stripe specs, `BillingNotificationServiceSpec`, `NotificationActionSpec`, `stripe_billing.spec.ts`,
  `manual/docs/01-getstarted/05-firstrun/configfile.mdx`.
- Done when: `grep -rniE 'unpaid|cutOnUnpaid|PaymentFailed|KeyDisabled|invoice\.paid|mail\.billing\.(payment|key)'`
  over `daikoku/app daikoku/conf daikoku/javascript/src daikoku/javascript/tests daikoku/test manual/docs`
  returns nothing; `sbt Test/compile` and `npm run build` pass.
- Status: todo

### E2 · `Ended` block reason

- Intent: a subscription cancelled in Stripe ends for good, and the team can subscribe again (D2, D3).
- Zones: `domain/apikeyEntities.scala`, `domain/json.scala`, `services/StripeWebhookService.scala`,
  `services/ApiService.scala` (`controlDemand`), `StripeWebhookSpec`, a subscription spec.
- Done when: a `StripeWebhookSpec` case shows `customer.subscription.deleted` leaves `blockedBy`
  containing `ended` with `enabled` unchanged; a spec shows a team subscribes again to a plan whose
  previous subscription is `Ended`.
- Status: todo

### E3 · Billing follows `blockedBy`

- Intent: Stripe stops billing a blocked subscription and resumes when it is unblocked, and the key
  toggle no longer reaches Stripe (D4, D5).
- Zones: `controllers/PaymentClient.scala`, `services/ApiService.scala` (`archiveApiKey`),
  `controllers/AdminApiController.scala`, `services/ApiLifeCycleService.scala`, Stripe specs.
- Done when: `toggleStateThirdPartySubscription` no longer exists; specs show an owner block pauses
  the Stripe subscription, an owner unblock resumes it, an API lifecycle block pauses every Stripe
  subscription of the API, and `enabled = false` makes no Stripe call.
- Status: todo

### E4 · Mandatory `customerId`, no legacy

- Intent: every Stripe subscription knows its customer and the legacy branch disappears (D6).
- Zones: `domain/apikeyEntities.scala`, `domain/json.scala`, `controllers/PaymentClient.scala`,
  `controllers/ConsumptionController.scala`, Stripe specs.
- Done when: `customerId: String` in `StripeSubscriptionInformations`; `grep -rn legacy` over
  `ConsumptionController.scala` and `PaymentClient.scala` returns nothing; `sbt Test/compile` passes.
- Status: todo

### E5 · Billing screen badges

- Intent: the screen tells where the money stands, not the key toggle (D7).
- Zones: `controllers/ConsumptionController.scala` (billing state), `javascript/src/types/api.ts`,
  `javascript/src/components/backoffice/billing/SubscriptionBillingStates.tsx`,
  `javascript/src/locales/*`.
- Done when: the billing state JSON carries `blockedBy`; `SubscriptionBillingStates.tsx` no longer
  reads `enabled`; `grep -rnE 'billing\.state\.(legacy|unpaid|cut)'` over `daikoku/javascript/src`
  returns nothing; `billing.state.ended` and `billing.state.suspended` exist in en and fr;
  `npm run build` passes.
- Status: todo

### E6 · Trial traces and `.env.stripe.example`

- Intent: nothing mentions a trial anymore and the Stripe dev setup is documented by an example file
  (D8, D9).
- Zones: `javascript/src/locales/*`, `javascript/tests/config/daikoku/*.ndjson`, `StripeWebhookSpec`,
  `.gitignore`, `daikoku/.env.stripe.example`.
- Done when: `grep -rni trial` over `daikoku/app daikoku/javascript/src daikoku/javascript/tests daikoku/test`
  only returns the no-trial guard of `StripeBillingSpec`; `git ls-files daikoku/.env.stripe.example`
  lists the file; `git check-ignore daikoku/.env.stripe` still matches.
- Status: todo

### E7 · Merge master

- Intent: the branch is up to date with master before the PR (D10).
- Zones: whole repository (conflict resolution only).
- Done when: a merge commit of `origin/master` sits on `stripe`;
  `git rev-list --count stripe..origin/master` returns 0; `sbt Test/compile` and `npm run build` pass.
- Status: todo

### E8 · Green runs and PR

- Intent: the branch is proven against Stripe and handed over for review (D11).
- Zones: specs only (fixes found by the runs), GitHub.
- Done when: `mise run test:back` is green Stripe specs included; `mise run test:stripe` is green;
  #1227 and #1228 are closed as not planned; #1218 and #1217 are updated; the PR from `stripe` to
  `master` is open with the `Closes` list of D11.
- Status: todo

## Validated deviations

- none yet
