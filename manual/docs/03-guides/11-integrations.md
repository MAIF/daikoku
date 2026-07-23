# Integration API (removed)

:::warning Removed in Daikoku 19
The **Integration API** (all `/integration-api/*` endpoints) has been **removed**.

It used to expose a read-only, tenant-admin JSON view of the published/public APIs of a tenant,
so an external UI (a portal that was not Daikoku itself) could list and display them.

This need is now fully covered by the **Admin API** and the **GraphQL API**, which are richer,
better maintained and consistently secured. If you were consuming `/integration-api/*`, migrate to
one of the options below.
:::

## What was removed

| Old endpoint | Purpose |
| --- | --- |
| `GET /integration-api/apis` | List the visible/public APIs of the tenant |
| `GET /integration-api/:teamId` | List the visible/public APIs of a team |
| `GET /integration-api/:teamId/:apiId` | Get a single API |
| `GET /integration-api/:teamId/:apiId/complete` | Get an API with all its details |
| `GET /integration-api/:teamId/:apiId/description` | Get the API description |
| `GET /integration-api/:teamId/:apiId/plans` | Get the API usage plans |
| `GET /integration-api/:teamId/:apiId/documentation` | Get the API documentation |
| `GET /integration-api/:teamId/:apiId/apidoc` | Get the API OpenAPI/Swagger definition |

## Migrate to the Admin API (REST)

The [Admin API](./12-apis.md) is a fully featured REST API that can perform almost every operation
available in the Daikoku dashboard, including reading teams, APIs, plans, documentation and
subscriptions.

- OpenAPI descriptor: `http://<your-daikoku>/admin-api/openapi.json`
- Human-friendly Swagger UI: https://maif.github.io/daikoku/openapi/

See the [Admin API guide](./12-apis.md) for details.

## Migrate to the GraphQL API

Daikoku also exposes a GraphQL endpoint, which is the most flexible way to fetch exactly the data an
external UI needs (APIs, teams, plans, tags, categories, versions…) in a single request.

- Query endpoint: `POST /api/search`
- Schema (SDL): `GET /api/render-schema`

The GraphQL schema is also browsable from the Daikoku dashboard.
