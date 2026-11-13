# Stripe fixtures

These `*.json` files are the responses WireMock serves to `StripeBillingSpec` in CI,
**offline**: `daikoku.stripe.url` points at WireMock, so the spec drives the real Daikoku
routes (make a plan payable → subscribe → pay the checkout → run the stats job) and asserts
**what Daikoku sends**, never these responses. The seeded fixtures only have to be
plausible enough for the flow to move forward.

What the spec guards:

- the meter definition — `default_aggregation[formula]=sum`, `customer_mapping[type]=by_id`,
  the payload keys usage and customer are read from;
- `recurring[meter]` on the metered price, and `aggregate_usage` (removed by Stripe in
  `2025-03-31.basil`) never coming back;
- the Stripe customer travelling from the checkout session to the `ApiSubscription`;
- the **delta** arithmetic: 250 then 400 hits must report 250 then 150, because the meter
  sums what it receives — reporting the running total would double-bill;
- one idempotent `identifier` per delta, no call at all when nothing new was consumed;
- `/v1/subscription_items/.../usage_records` never called;
- the `Stripe-Version` header on every call.

One file per endpoint, named after its path: `meters.json`, `prices.json`, `products.json`,
`meter_events.json`, `customers_search.json`, `checkout_sessions.json` (POST, creation),
`checkout_session.json` (GET, after payment), `subscription.json`.

## Check / refresh against real Stripe (optional)

With the [Stripe CLI](https://docs.stripe.com/stripe-cli) and a test key (`stripe login`).
This talks to the real Stripe → **not offline** (only to check or regenerate fixtures).

```bash
# check that the Billing Meters API is accepted on the account
stripe post /v1/billing/meters \
  -d "display_name=test" -d "event_name=daikoku_test" \
  -d "default_aggregation[formula]=sum"

# regenerate a fixture with a real response
stripe post /v1/billing/meters -d ... > meters.json
```

The CLI handles the key and auth; never commit your key. The captured IDs (`cus_…`,
`price_…`, `mtr_…`) are test-mode data, harmless to commit.

## Full flow against real Stripe

For an automated dev-only run against real Stripe test mode (create product/meter/price,
report a meter event, then clean up), see `StripeE2ESpec`. Create a gitignored
`daikoku/.env.stripe` (matched by `.env.stripe*` in `.gitignore`) with your test key:

```bash
export STRIPE_TEST_SECRET_KEY=sk_test_...
export DAIKOKU_STRIPE_URL=https://api.stripe.com
```

then:

```bash
source daikoku/.env.stripe && sbt "testOnly fr.maif.daikoku.controllers.StripeE2ESpec"
```
