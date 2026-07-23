# CLAUDE.md

Guidance for working in this repository. Written for onboarding a contributor (human or agent) quickly.

## What Daikoku is

Daikoku is the developer portal for [Otoroshi](https://maif.github.io/otoroshi): a self-service
platform where API producers publish APIs and consumers subscribe to them (plans, quotas, API keys,
billing). It is written in Scala (Play/Pekko) with a React single-page frontend, developed by the
MAIF team and released under Apache 2.

Current version: `19.0.0-dev` (see `daikoku/version.sbt`).

## Tech stack

- **Backend**: Scala 3.8.2, Play Framework on Pekko (HTTP/2), PostgreSQL storage, GraphQL, sbt build.
- **Frontend**: React 19 + TypeScript, Vite, TanStack Query + TanStack Table, antd, Bootstrap 5,
  `@maif/react-forms`. Lives in `daikoku/javascript`.
- **CLI**: separate Rust project in `cli/` (Cargo).
- **Docs**: Docusaurus site in `manual/`.
- **Tooling**: [`mise`](https://mise.jdx.dev) pins toolchain (Java 21, sbt 1.12, Node 24,
  process-compose) and defines every task. [`process-compose`] orchestrates multi-process dev/test
  runs, backed by docker-compose files under `dev/`.

## Repository layout

```
daikoku/              # main app
  app/fr/maif/daikoku # Scala backend sources
  conf/               # Play config (application.conf, base.conf, local.conf), routes, i18n messages
  javascript/         # React frontend (src/), Playwright tests (tests/), Vite config
  public/             # built frontend assets, served by Play (generated — do not hand-edit)
  test/               # Scala backend tests
cli/                  # Rust CLI (Cargo)
manual/               # Docusaurus documentation site
dev/                  # docker-compose + process-compose files, seed data (config/*.ndjson)
scripts/              # helper scripts (e.g. update-seeds.sh)
mise.toml             # source of truth for toolchain + every dev/test/build task
```

## Getting started

Everything goes through `mise`. Install the toolchain and all dependencies:

```bash
mise install            # provisions Java 21, sbt, Node 24, process-compose
mise run install        # front deps + Playwright chromium + doc deps + back compile & docker pull
```

## Common commands

Run these via `mise run <task>` (see `mise.toml` for the full list).

### Dev

- `mise run dev` — **primary dev entry point.** Starts backend + frontend + containers via
  process-compose, seeded with the "light" dataset. Dashboard on port 9999.
- `mise run dev:empty` — same, but with an empty database.
- `mise run dev:back` / `mise run dev:front` — run only one side (two terminals) for finer control.
  Backend runs with JVM debug on port 5005 and sbt `~run` (hot reload).
- `mise run doc` — serve the Docusaurus docs locally.

### Tests

- `mise run test:back` — **canonical backend test run.** Spins the required containers and runs the
  Scala test suite via process-compose. Use this to run/verify backend tests.
- `mise run test:front:ldap` / `mise run test:front:oidc` — full Playwright front suites (backend +
  containers + Playwright, each auth mode) via process-compose.
- `mise run test:front:report` — open the last Playwright HTML report.
- `mise run tests` — front + back.

### Build & quality

- Frontend: in `daikoku/javascript` — `npm run build` (tsc + vite build, copies output into
  `daikoku/public`), `npm run lint` (oxlint), `npm run prettier`.
- Backend: `sbt compile` / `sbt "Test/compile"` from `daikoku/`. Formatting via scalafmt
  (`.scalafmt.conf`).

## Domain model

The business vocabulary (tenant, team, API, usage plan, subscription, **keyring**, Otoroshi sync, …)
and how the entities relate is documented in [`docs/DOMAIN.md`](docs/DOMAIN.md). Read it before
reasoning about a feature — several concepts (multi-tenancy, keyring-based key aggregation) are not
obvious from the code alone.

## Backend architecture (`daikoku/app/fr/maif/daikoku`)

- `controllers/` — Play controllers, one per domain area (`ApiController`, `TeamController`,
  `TenantController`, `NotificationController`, `GraphQLController`, `HomeController` for CMS, …).
  Routes are declared in `daikoku/conf/routes`. `AppError.scala` centralizes error types.
- `services/` — business logic (`ApiService`, `UserService`, `KeyringService`, `DeletionService`,
  `CmsRenderer`, …).
- `domain/` — the model: `entities.scala`, `apiEntities.scala`, `teamEntities.scala`,
  `tenantEntities.scala`, `userEntities.scala`, JSON codecs (`json.scala`), GraphQL schema
  (`SchemaDefinition.scala`, `graphQLEntities.scala`).
- `storage/` — persistence abstraction (`api.scala`) with a PostgreSQL driver under
  `storage/drivers/postgres` and GraphQL storage helpers.
- `login/` — auth modules: `local`, `ldap`, `oauth`, `otoroshi`.
- `jobs/` — scheduled jobs (Otoroshi sync, apikey secret rotation, purges, anonymous reporting,
  keyring subscription expiration, …).
- `audit/`, `env/`, `actions/`, `modules/`, `messages/`, `utils/` — cross-cutting concerns.

Multi-tenancy is a core concept: most entities are tenant-scoped, and the tenant is resolved by
hostname or another provider strategy.

## Frontend architecture (`daikoku/javascript/src`)

- `apps/` — top-level app shells: `DaikokuApp.tsx` (back office) and `DaikokuHomeApp.tsx` (public
  portal).
- `components/` — split into `adminbackoffice/`, `backoffice/`, `frontend/`, `inputs/`, `utils/`.
- `contexts/` — React contexts: global state, i18n, modals, navigation.
- `services/` — API client and helpers (currencies, messages, markdown via showdown, …).
- `locales/`, `types/`, `style/`.

Data fetching uses TanStack Query; forms use `@maif/react-forms`. The built bundle is copied into
`daikoku/public` and served by Play, so a production-like run needs a frontend build.

## Conventions

- **English only.** Daikoku is open source; all repo content — code, comments, docs, commit
  messages, issues, PRs — is in English, regardless of the language used while chatting.
- **Formatting**: scalafmt for Scala (`.scalafmt.conf`), prettier + oxlint for the frontend. Format
  before committing.
- **Commits**: Conventional-Commits style (`fix:`, `chore:`, `feat:`, …), matching the existing
  history.
- **Theming**: colors are driven by a CMS-page `:root`, seeded by `default.css`, with a fallback
  chain in `variables.scss`. Only reference primitives that already exist. (See the color-theme note
  in agent memory for detail.)
- **PR workflow**: see `.github/CONTRIBUTING.md`.

## Gotchas

- `daikoku/public/` is generated by the frontend build — never hand-edit it.
- Most dev/test flows depend on Docker containers (PostgreSQL, and per-mode LDAP/OIDC). Make sure
  Docker is running before `mise run dev` / `mise run test:*`.
- The all-in-one process-compose runs (`dev`, `test:back`, …) bind port 9999 for the dashboard.
- The backend dev task exposes a JVM debugger on port 5005.
</content>
</invoke>
