# Remote Catalogs — local demo (`file` source)

A `file` source reads every `.yaml`/`.json` in this folder. `catalog.yaml` declares a team,
a usage-plan and a cms-page, each with its `kind`.

## Run

```bash
mise run dev:back:empty            # backend only, empty data
# tests:
mise run test:back:containers
cd daikoku && sbt clean "testOnly fr.maif.daikoku.controllers.RemoteCatalogSpec"
mise run test:back:clean
```

## Attach the catalog to the tenant

```bash
BASE=http://localhost:9000
HOST=localhost
ADMIN_KEY="Basic <base64(clientId:clientSecret)>"
CATALOG_DIR="<absolute path to this folder>"

curl -X PATCH "$BASE/admin-api/tenants/default" \
  -H "Authorization: $ADMIN_KEY" -H "Host: $HOST" -H "Content-Type: application/json" \
  -d "{\"remoteCatalogs\":[{\"id\":\"demo-file\",\"name\":\"Demo (file)\",\"enabled\":true,\"source\":{\"kind\":\"file\",\"config\":{\"path\":\"$CATALOG_DIR\"}},\"scheduling\":{\"enabled\":false,\"mode\":\"interval\"},\"allowedKinds\":[],\"testDeployArgs\":{}}]}"
```

## Deploy / test / undeploy

```bash
curl -X POST "$BASE/admin-api/remote-catalogs/demo-file/_test"     -H "Authorization: $ADMIN_KEY" -H "Host: $HOST" -H "Content-Type: application/json" -d '{}'
curl -X POST "$BASE/admin-api/remote-catalogs/demo-file/_deploy"   -H "Authorization: $ADMIN_KEY" -H "Host: $HOST" -H "Content-Type: application/json" -d '{}'
curl         "$BASE/admin-api/teams/team-weather"                  -H "Authorization: $ADMIN_KEY" -H "Host: $HOST"
curl -X POST "$BASE/admin-api/remote-catalogs/demo-file/_undeploy" -H "Authorization: $ADMIN_KEY" -H "Host: $HOST" -H "Content-Type: application/json" -d '{}'
```

`_deploy` returns `{ catalog_id, tenant, results: [{kind, created, updated, deleted, errors}], timestamp }`.

## Other kinds

Deployable: `team`, `usage-plan`, `api`, `api-subscription`, `cms-page`. To get a valid body for
a kind, GET an existing entity from the admin-api, add `kind:`, drop the file here. Styles: flat
(`kind` next to fields) or kube (`apiVersion: daikoku.io/v1` + `kind` + `spec:`); multi-docs split
on a `---` line at column 0.
