# CI and webhooks

## The catalog token

Each catalog has a token, shown in its **CI & webhook** panel. It is generated with the catalog and can
be regenerated: the previous one stops working at once. It only gives access to the routes below, for
this catalog, on the tenant domain. It gives no access to the admin API.

| Route | Effect |
|---|---|
| `POST /api/remote-catalogs/<id>/_validate` | Validates the files sent in the body, without writing. Daikoku does not read the source. |
| `POST /api/remote-catalogs/<id>/_test` | Reads the source and runs without writing. |
| `POST /api/remote-catalogs/<id>/_deploy` | Reads the source and applies. |
| `POST /api/remote-catalogs/<id>/_undeploy` | Removes the entities of the catalog. |

All take `Authorization: Bearer <token>`. `_validate` expects the **whole** catalog, as it would be
deployed. The simplest is a zip made from the catalog root (`cd catalog && zip -qr catalog.zip .`),
sent with `Content-Type: application/zip`: Daikoku reads its `.json`, `.yaml` and `.yml` files and
ignores the rest. The body can also be a JSON array of files, relative to the catalog root:

```json
[
  { "path": "teams/team-weather/team.yaml", "content": "kind: team\n_id: team-weather\n..." },
  { "path": "pages/home.yaml", "content": "..." }
]
```

The body is limited to 20 MB, and a zip to 100 MB once unzipped. The answer is a run: `status`,
`created`, `updated`, `deleted`, `detached`, `errors`. A run that applies nothing (`failed`) answers
`400`, like a body that cannot be read.

In the answer of `_validate`, `_test` and `_deploy`, each updated entity also lists its `changes`:
the JSON Patch from the entity in Daikoku to the one the files describe, with the value in Daikoku in
`old`. The history keeps the entities only.

```json
{ "op": "replace", "path": "/description", "old": "Forecasts", "value": "Forecasts and observations" }
```

## Example: GitHub Actions

Validate every pull request, deploy after a merge on `main`:

```yaml
name: daikoku-catalog
on:
  pull_request:
  push:
    branches: [main]

env:
  DAIKOKU_URL: https://apis.example.com
  CATALOG_ID: my-catalog
  DAIKOKU_CATALOG_TOKEN: ${{ secrets.DAIKOKU_CATALOG_TOKEN }}

jobs:
  catalog:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Zip the catalog
        working-directory: catalog # the catalog root
        run: zip -qr "$RUNNER_TEMP/catalog.zip" .

      - name: Validate
        run: |
          curl --fail-with-body -X POST "$DAIKOKU_URL/api/remote-catalogs/$CATALOG_ID/_validate" \
            -H "Authorization: Bearer $DAIKOKU_CATALOG_TOKEN" \
            -H "Content-Type: application/zip" \
            --data-binary @"$RUNNER_TEMP/catalog.zip"

      - name: Deploy
        if: github.event_name == 'push'
        run: |
          curl --fail-with-body -X POST "$DAIKOKU_URL/api/remote-catalogs/$CATALOG_ID/_deploy" \
            -H "Authorization: Bearer $DAIKOKU_CATALOG_TOKEN"
```

`_deploy` reads the branch configured on the catalog, not the files of the job. A webhook does the
same deploy without any workflow.

## Webhooks

A GitHub or GitLab catalog can be deployed on every push. The webhook URL is in the **CI & webhook**
panel:

```
https://<tenant domain>/api/remote-catalogs/<id>/_webhook
```

Daikoku must be reachable from GitHub or GitLab.

**GitHub**: repository `Settings` → `Webhooks` → `Add webhook`.

- Payload URL: the webhook URL.
- Content type: `application/json`.
- Secret: the catalog token. Required.
- Events: `Just the push event`.

GitHub signs each delivery with the secret (`X-Hub-Signature-256`); Daikoku checks the signature.

**GitLab**: project `Settings` → `Webhooks` → `Add new webhook`.

- URL: the webhook URL.
- Secret token: the catalog token. Required.
- Trigger: `Push events`.

GitLab sends the token in `X-Gitlab-Token`; Daikoku compares it with the catalog token.

| Delivery | Answer |
|---|---|
| Push on the repository and branch of the catalog | `202`, the deploy starts in the background. Its outcome is in the history. |
| Push on another branch, or another event (`ping`…) | `202`, ignored. |
| Not JSON | `400`. |
| Missing or wrong signature / token | `401`. |
| Source other than GitHub / GitLab | `400`. |

Daikoku answers at once: GitHub expects an answer within 10 seconds. A push arriving while another
run is in progress is not deployed; the next push, a manual deploy or the scheduled job catches up.

:::warning
Regenerating the token breaks the CI and the webhook until their secret is updated.
:::
