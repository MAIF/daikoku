# Dev docker-compose helpers

These compose files spin up the **infrastructure** needed to run a Daikoku instance
**locally** during development (from your IDE or `sbt run`). They are *not* tied to a
connection mode and are *not* used by CI — the CI suites live in
`daikoku/javascript/tests/docker-compose-{ldap,oidc,local}.yml`.

In every file the `daikoku` service is commented out on purpose: you run Daikoku
yourself and point it at the containers started here.

| File | What it starts | Typical use |
|---|---|---|
| `docker-compose-ldap.yml` | OpenLDAP, SMTP, Redis, Otoroshi | dev against an LDAP tenant |
| `docker-compose-oidc.yml` | OIDC mock, SMTP, Redis, Otoroshi, faker | dev against an OAuth2/OIDC tenant |
| `docker-compose-local.yml` | Otoroshi, SMTP | dev against local auth |
| `docker-compose-s3.yml` | Garage (S3) and its bootstrap | assets, added to every mode by `mise run dev` |

The local S3 bucket settings are: bucket `daikoku`, URL `http://daikoku.s3.oto.tools:3910`,
region `garage`, access key and secret as in `config/garage-init.sh`. The local seed already
uses them.

Volumes reference the shared fixtures under
`daikoku/javascript/tests/config/` via relative paths, so run these from the `dev/`
directory:

```bash
docker compose -f dev/docker-compose-ldap.yml up
```

LDAP uses the same pinned `osixia/openldap:1.5.0` image as the test stack; its
`--copy-service` startup option is not supported by newer `latest` images.

Consumption and estimated-income tests also require Elasticsearch. Use
`mise run test:consumption` for that stack rather than the LDAP-only stack.
They live in `daikoku/javascript/tests/specs-consumption` and use
`playwright.consumption.config.js`, separately from the standard LDAP suite.
The ES-enabled paper route calls the local `faker` service (`/types`) so gateway
calls do not depend on an external upstream.

Deletion assertions poll Otoroshi for up to 45 seconds: the backend's default
deletion queue interval is 30 seconds, although the CI stack configures one second.

## Seed data

Init states (under `config/`) used when running Daikoku locally
(via `-Ddaikoku.init.data.from=...`), **not** by CI (CI states live in
`daikoku/javascript/tests/config/daikoku/`):

| File | Auth provider | Pairs with |
|---|---|---|
| `config/daikoku_state_local.ndjson` | Local | `docker-compose-local.yml` |
| `config/daikoku_state_ldap.ndjson` | LDAP | `docker-compose-ldap.yml` |
| `config/daikoku_state_oidc.ndjson` | OAuth2 | `docker-compose-oidc.yml` |

Example (from the `daikoku/` directory):

```sbt
~run -Dconfig.resource=local.conf -Ddaikoku.init.data.from=../dev/config/daikoku_state_local.ndjson
```

### Manual batch-subscription scenarios

`config/daikoku_state_ldap_full_apis_environment.ndjson` and
`config/daikoku_state_ldap_full_apis_default.ndjson` extend the LDAP seed with comparable
scenarios. Both keep `subscriptionSecurity` disabled. In environment mode, plan names are limited
to the configured environments (`dev`, `preprod`, `prod`), and each API has at most one plan per
environment. Plan descriptions identify the scenarios.

Use the LDAP infrastructure and an **empty, isolated** PostgreSQL database. The seed is imported
only when the datastore is empty; changing the path on an existing database does not reload it.
For example, start the backend from `daikoku/` with:

```bash
DAIKOKU_INIT_DATA_FROM=../dev/config/daikoku_state_ldap_full_apis_environment.ndjson sbt run -Dconfig.resource=local.conf
```

Replace `environment` with `default` for the other display mode. The normal
`mise run dev --mode ldap` backend selects the standard LDAP seed instead of these files.

Sign in as Jim Halpert to test the catalog: Jim belongs to Vendeurs, Logistique and his personal
team. Sign in as Michael Scott to test the API Division owner and administrator views. The added
APIs are tagged `manual-batch` and start with `Manual -`.

| API / scenario | Expected behavior |
|---|---|
| Public mixed plans | All eligible teams can select the API. Its plans include public, Vendeurs-only and Logistique-only choices. In default mode it also has an owner-only plan; in environment mode that plan is on the separate Public owner-only plan API. |
| Public no seller plans | Vendeurs can select the API but has no authorized plan; Logistique can use its private plan. |
| Auth no teams | Jim can see the API but cannot select it; API Division can select it as owner. |
| Auth sellers / Auth logistics | Jim can select each individually, but there is no eligible team common to both. |
| Auth sellers and logistics | Both organizations are eligible; its private plan is restricted to Vendeurs. Combine it with either preceding API to test a common team. |
| Auth Jim personal | Only Jim's personal team is authorized. Enable the tenant's subscription security to exclude that team and disable selection. |
| Private sellers / Private owner only | Vendeurs can access the first; Jim cannot see the owner-only API. API Division can access both as owner. |
| Public no plans / Public deprecated / Public blocked | Test no plans, a selectable deprecated API and a blocked API. The blocked API is hidden from regular consumers. |
| Public compatible | `dev` can share a key with other compatible `dev` plans. The isolated plan (`preprod` in environment mode) disallows sharing; the read-only plan (`prod` in environment mode) requires a separate key from read-write plans. |
| Public pending sellers | Vendeurs has a pending request for `prod`, so that plan is unavailable in batch selection; `dev` remains available. |
| Existing API papier and API Commande | Their existing Vendeurs `dev` subscriptions and shared keyring allow testing already-subscribed plans and key import. |
| Existing admin-only APIs | Visible to administrators but unavailable for batch selection. |

Plan availability is checked after the team is selected. API owners retain access to their own
private plans even without an explicit plan authorization. The pre-existing subscriptions and
pending demand are test data; use an isolated environment before submitting or approving requests.
