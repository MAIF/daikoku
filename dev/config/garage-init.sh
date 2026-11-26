#!/bin/sh
set -e

apk add --no-cache curl jq >/dev/null

API="http://garage:3903/v1"
AUTH="Authorization: Bearer daikoku-dev-admin-token"
BUCKET="daikoku"
ACCESS_KEY="GK0123456789abcdef01234567"
SECRET_KEY="fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210"

echo "waiting for garage ..."
until curl -sf -H "$AUTH" "$API/status" >/dev/null; do sleep 1; done

if [ "$(curl -sf -H "$AUTH" "$API/layout" | jq '.roles | length')" = "0" ]; then
  NODE=$(curl -sf -H "$AUTH" "$API/status" | jq -r '.nodes[0].id')
  curl -sf -H "$AUTH" -X POST "$API/layout" \
    -d "[{\"id\":\"$NODE\",\"zone\":\"dc1\",\"capacity\":1000000000,\"tags\":[]}]" >/dev/null
  VERSION=$(curl -sf -H "$AUTH" "$API/layout" | jq '.version')
  curl -sf -H "$AUTH" -X POST "$API/layout/apply" -d "{\"version\":$((VERSION + 1))}" >/dev/null
fi

until curl -sf -H "$AUTH" "$API/bucket?globalAlias=$BUCKET" >/dev/null; do
  curl -s -H "$AUTH" -X POST "$API/bucket" -d "{\"globalAlias\":\"$BUCKET\"}" >/dev/null
  sleep 1
done
BUCKET_ID=$(curl -sf -H "$AUTH" "$API/bucket?globalAlias=$BUCKET" | jq -r '.id')

if ! curl -sf -H "$AUTH" "$API/key?id=$ACCESS_KEY" >/dev/null; then
  curl -sf -H "$AUTH" -X POST "$API/key/import" \
    -d "{\"name\":\"daikoku\",\"accessKeyId\":\"$ACCESS_KEY\",\"secretAccessKey\":\"$SECRET_KEY\"}" >/dev/null
fi

curl -sf -H "$AUTH" -X POST "$API/bucket/allow" \
  -d "{\"bucketId\":\"$BUCKET_ID\",\"accessKeyId\":\"$ACCESS_KEY\",\"permissions\":{\"read\":true,\"write\":true,\"owner\":true}}" >/dev/null

echo "garage ready: bucket $BUCKET, access key $ACCESS_KEY"
