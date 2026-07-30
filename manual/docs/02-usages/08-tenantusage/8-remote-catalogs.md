# Remote catalogs

A **remote catalog** lets a tenant keep part of its content in sync with an external source of
truth: a file, an HTTP endpoint, a GitHub or a GitLab repository. Daikoku fetches the source,
compares it with what is already stored, and reconciles the tenant so that it matches the source —
creating, updating and removing entities as needed.

This is meant for an "everything as code" workflow: you describe teams, APIs, plans, subscriptions or
CMS pages in files, version them where you like, and let Daikoku apply them.

Go to `settings/Organizations settings` and click `Remote catalogs` on the left menu.

## How reconciliation works

The source is authoritative. On each run Daikoku:

- **creates** entities present in the source but missing in the tenant,
- **updates** entities whose content changed,
- **deletes** the entities it previously created from this catalog but that disappeared from the
  source (orphans).

Every entity Daikoku manages is tagged with a `created_by = remote_catalog=<catalog id>` metadata.
Only entities carrying that tag are ever updated or deleted by the catalog — content you created by
hand is never touched.

Some runtime fields are always preserved on update rather than overwritten by the source: an API's
`stars`, `issues`, `posts` and `issuesTags`, and creation/update timestamps. Documentation pages are
kept if the incoming source provides none.

:::note
Reconciliation is a direct persistence of the desired state: it writes the entities as described in
the source. It does **not** trigger the domain side effects that the interactive back office would
(for example, changing an API's lifecycle state through a catalog updates the stored state but does
not notify subscribers or block subscriptions). Keep this in mind when you move state-carrying
entities under a catalog.
:::

## Add a catalog

Click `Create` and fill in:

- **Name** — a human-readable label.
- **Enabled** — an enabled catalog can be deployed and, if scheduling is on, picked up by the
  background job. Disabled catalogs are ignored.
- **Source** — the kind of source and its configuration (see below).
- **Scheduling** — whether and how often the catalog is synced automatically (see
  [Automatic scheduling](#automatic-scheduling)).
- **Allowed kinds** — restricts which entity kinds this catalog may manage. Leave empty to allow all
  of them. Available kinds: `team`, `usage-plan`, `api`, `api-subscription`, `cms-page`.

### Source kinds

#### File

Reads from the local filesystem of the Daikoku server.

- **Path** — an entity file, a *listing* file (see [Listings and globs](#listings-and-globs)), or a
  directory. When it is a directory, every `.json`, `.yaml` and `.yml` file inside is read.

The file source can also run a *pre-command* before reading (for example to pull a repository into
place). Because it executes on the server, its use may be restricted by your administrator.

#### HTTP

Fetches a single URL.

- **URL** — the document to fetch. It may be an entity document or a listing.
- **Headers** — optional request headers (for example an `Authorization` header).
- **Timeout** — request timeout in milliseconds (default `30000`).

#### GitHub / GitLab

Reads entity files from a repository through the provider API.

- **Repo** — the repository, as `owner/name`.
- **Branch** — default `main`.
- **Path** — the folder inside the repository to read from (default: repository root).
- **Token** — a personal access token, required for private repositories and recommended to avoid
  rate limiting.
- **Base URL** — for self-hosted instances (default `https://api.github.com` for GitHub,
  `https://gitlab.com` for GitLab).
- **Repo patterns** — optional patterns to sync several repositories at once instead of a single
  `repo`.

## Source content

An entity is a JSON or YAML document carrying at least an `_id` and a `kind`. Both a *flat* form and
a *kube* form are accepted:

```yaml
# flat
kind: team
_id: team-weather
name: Weather
---
# kube-style
apiVersion: daikoku.io/v1
kind: cms-page
spec:
  _id: page-home
  name: Home
```

A single document, a JSON array of documents, or a multi-document YAML (`---` separated) are all
supported. Documents that are neither valid JSON nor valid YAML entities are ignored.

### Listings and globs

Instead of listing entities inline, a source can point to other files. A listing is either a plain
array of paths or a kube-style document:

```yaml
apiVersion: daikoku.io/v1
kind: RemoteCatalogListing
spec:
  catalog_listing:
    - teams/weather.json
    - apis/*.yaml
```

Paths are resolved relative to the listing (relative to the URL for HTTP, to the file for File, to
the configured path for GitHub/GitLab). Glob patterns are supported: `*` matches within a path
segment, `**` matches across segments, `?` matches a single character.

## Deploy, test, undeploy

Each catalog row exposes the following actions:

- **Deploy** — runs the reconciliation now and applies the changes. A report shows how many entities
  were created, updated and deleted per kind, along with any errors.
- **Test** — a dry run: it fetches and computes the exact same report **without writing anything**.
  Use it to preview what a deploy would do.
- **Undeploy** — removes every entity this catalog created (all entities carrying its
  `created_by` tag). The catalog configuration itself is kept.
- **History** — the recent runs of this catalog and their outcomes.

## Automatic scheduling

Instead of being deployed by hand, a catalog can be picked up automatically by a background job. In
the catalog's **Scheduling** section, toggle **Enable scheduling** to opt this catalog in.

A catalog is synced automatically only when it is **enabled** *and* its scheduling is enabled. How
often the sync happens is not set per catalog: it is governed by the instance-wide job cadence (see
below), which runs every eligible catalog on each pass.

:::note For operators
The background job is opt-in at the instance level and disabled by default. Enable it with
`daikoku.remoteCatalogJob.enabled = true` (or `DAIKOKU_REMOTE_CATALOG_JOB_ENABLED`). Its cadence —
shared by every scheduled catalog — is set with `daikoku.remoteCatalogJob.mode`, `.interval` and
`.cronExpression`.

A run can also be triggered on demand for a tenant:

```
POST /api/jobs/remote-catalog/_sync?key=<daikoku.remoteCatalogJob.key>
```

against that tenant's domain. Runs are single-flight per tenant: a run started while another is
still in progress is skipped.
:::
