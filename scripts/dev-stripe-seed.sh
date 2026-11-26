#!/usr/bin/env bash
# Fills the Stripe seed of `mise run dev --mode stripe` with your test keys. The versioned
# seed only holds placeholders; the filled copy goes to daikoku/target, which git ignores.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/daikoku/.env.stripe"
SOURCE_SEED="$ROOT_DIR/dev/config/daikoku_state_stripe.ndjson"
TARGET_SEED="$ROOT_DIR/daikoku/target/daikoku_state_stripe.ndjson"

if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: $ENV_FILE is missing, it must export STRIPE_TEST_SECRET_KEY and STRIPE_TEST_PUBLIC_KEY" >&2
    exit 1
fi
# shellcheck disable=SC1090
. "$ENV_FILE"

WEBHOOK_SECRET="$(stripe listen --api-key "$STRIPE_TEST_SECRET_KEY" --print-secret)"

mkdir -p "$(dirname "$TARGET_SEED")"
jq -c \
    --arg publicKey "$STRIPE_TEST_PUBLIC_KEY" \
    --arg secretKey "$STRIPE_TEST_SECRET_KEY" \
    --arg webhookSecret "$WEBHOOK_SECRET" \
    'if .type == "tenants"
     then .payload.thirdPartyPaymentSettings |= map(
       if ._id == "stripe-dev"
       then .publicKey = $publicKey | .secretKey = $secretKey | .webhookSecret = $webhookSecret
       else . end)
     else . end' \
    "$SOURCE_SEED" > "$TARGET_SEED"

echo "Stripe seed filled in $TARGET_SEED"
