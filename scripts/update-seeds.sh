#!/usr/bin/env bash
set -euo pipefail

DAIKOKU_URL="${1:-http://localhost:9000}"
ADMIN_USERNAME="${2:-admin@foo.bar}"
ADMIN_PASS="${3:-password}"
TENANT_ID="${4:-default}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

SEED_FILES=(
    "dev/config/daikoku_state_light.ndjson"
    "dev/config/daikoku_state_ldap.ndjson"
    "dev/config/daikoku_state_oidc.ndjson"
    "daikoku/javascript/tests/config/daikoku/daikoku_state.ndjson"
    "daikoku/javascript/tests/config/daikoku/daikoku_state_local.ndjson"
    "daikoku/javascript/tests/config/daikoku/daikoku_state_local_test.ndjson"
    "daikoku/javascript/tests/config/daikoku/daikoku_state_ldap_local.ndjson"
    "daikoku/javascript/tests/config/daikoku/daikoku_state_oidc.ndjson"
)

COOKIE_JAR="$(mktemp)"
EXPORT_TMP="$(mktemp)"

cleanup() {
    rm -f "$COOKIE_JAR" "$EXPORT_TMP"
}
trap cleanup EXIT

wait_for_health() {
    echo "  Waiting for Daikoku..."
    local retries=30
    while [ $retries -gt 0 ]; do
        if curl -sf "$DAIKOKU_URL/health" | grep -q '"ready"'; then
            echo "  Ready."
            return 0
        fi
        retries=$((retries - 1))
        sleep 2
    done
    echo "ERROR: Daikoku did not become ready in time" >&2
    exit 1
}

login() {
    echo "  Authenticating as $ADMIN_USERNAME..."
    rm -f "$COOKIE_JAR"
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
        -L \
        -X POST "$DAIKOKU_URL/auth/Local/callback" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        --data-urlencode "username=$ADMIN_USERNAME" \
        --data-urlencode "password=$ADMIN_PASS")

    if ! grep -q "daikoku-session" "$COOKIE_JAR" 2>/dev/null; then
        echo "  ERROR: Login failed (HTTP $http_code) — no session cookie" >&2
        exit 1
    fi
    echo "  Authenticated (HTTP $http_code)."
}

echo "=== Daikoku seed updater ==="
echo "URL: $DAIKOKU_URL"
echo ""

wait_for_health
login

for rel_path in "${SEED_FILES[@]}"; do
    seed_file="$ROOT_DIR/$rel_path"

    if [ ! -f "$seed_file" ]; then
        echo "--- Skipping $rel_path (not found)"
        continue
    fi

    echo ""
    echo "--- $rel_path"

    echo "  Importing seed..."
    import_status=$(curl -s -o /dev/null -w "%{http_code}" \
        -b "$COOKIE_JAR" \
        -X POST "$DAIKOKU_URL/api/state/import" \
        -H "Content-Type: application/x-ndjson" \
        --data-binary @"$seed_file")
    echo "  Import: HTTP $import_status"

    if [ "$import_status" != "200" ]; then
        echo "  ERROR: import failed" >&2
        exit 1
    fi

    wait_for_health
    login

    echo "  Resetting color theme..."
    reset_status=$(curl -s -o /dev/null -w "%{http_code}" \
        -b "$COOKIE_JAR" \
        -X PUT "$DAIKOKU_URL/api/tenants/$TENANT_ID/color-theme/_reset")
    echo "  Reset: HTTP $reset_status"

    echo "  Exporting state..."
    export_status=$(curl -sf -w "%{http_code}" \
        -b "$COOKIE_JAR" \
        "$DAIKOKU_URL/api/state/export" \
        -o "$EXPORT_TMP")

    if [ "${export_status: -3}" != "200" ] || [ ! -s "$EXPORT_TMP" ]; then
        echo "  ERROR: export failed (HTTP ${export_status: -3})" >&2
        exit 1
    fi

    mv "$EXPORT_TMP" "$seed_file"
    EXPORT_TMP="$(mktemp)"
    echo "  Updated."
done

echo ""
echo "=== Done ==="
