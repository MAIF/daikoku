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
| `docker-compose-light.yml` | Otoroshi | simplest daikoku setup |
| `docker-compose-pg.yml` | Postgres | Postgres with configured database either for dev or tes, you can leave this running all the time |

Volumes reference the shared fixtures under
`daikoku/javascript/tests/config/` via relative paths, so run these from the `dev/`
directory:

```bash
docker compose -f dev/docker-compose-ldap.yml up
```

## Seed data

Init states (under `config/`) used when running Daikoku locally
(via `-Ddaikoku.init.data.from=...`), **not** by CI (CI states live in
`daikoku/javascript/tests/config/daikoku/`):

| File | Auth provider | Pairs with |
|---|---|---|
| `config/daikoku_state_light.ndjson` | Local | `docker-compose-light.yml` |
| `config/daikoku_state_ldap.ndjson` | LDAP | `docker-compose-ldap.yml` |
| `config/daikoku_state_oidc.ndjson` | OAuth2 | `docker-compose-oidc.yml` |

Example (from the `daikoku/` directory):

```sbt
~run -Dconfig.resource=local.conf -Ddaikoku.init.data.from=../dev/config/daikoku_state_light.ndjson
```
