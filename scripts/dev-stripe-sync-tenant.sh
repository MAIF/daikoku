#!/usr/bin/env bash
# Pushes the Stripe test keys and the `stripe listen` signing secret to the tenant of
# `mise run dev --mode stripe`. The seed only applies to an empty database, so a reused one
# would otherwise keep a stale webhook secret and reject every event forwarded by the CLI.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/daikoku/.env.stripe"
ADMIN_API="http://localhost:9000/admin-api"
ADMIN_CREDENTIALS="admin_key_client_id:admin_key_client_secret"

# shellcheck disable=SC1090
. "$ENV_FILE"

WEBHOOK_SECRET="$(stripe listen --api-key "$STRIPE_TEST_SECRET_KEY" --print-secret)"

curl -sf -u "$ADMIN_CREDENTIALS" -H "Host: localhost" "$ADMIN_API/tenants/default" |
  jq -c \
    --arg publicKey "$STRIPE_TEST_PUBLIC_KEY" \
    --arg secretKey "$STRIPE_TEST_SECRET_KEY" \
    --arg webhookSecret "$WEBHOOK_SECRET" \
    '.thirdPartyPaymentSettings |= map(
       if ._id == "stripe-dev"
       then .publicKey = $publicKey | .secretKey = $secretKey | .webhookSecret = $webhookSecret
       else . end)' |
  curl -sf -u "$ADMIN_CREDENTIALS" -H "Host: localhost" -H "Content-Type: application/json" \
    -X PUT --data @- "$ADMIN_API/tenants/default" > /dev/null

echo "Stripe settings of tenant default synced with stripe listen"
