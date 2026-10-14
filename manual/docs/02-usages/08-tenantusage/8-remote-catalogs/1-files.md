# Catalog files

## Documents

A file holds one document, a JSON array of documents, or several YAML documents separated by `---`.
A document is either flat or wrapped in an envelope:

```yaml
# flat
kind: team
_id: team-weather
_tenant: default
name: Weather
---  
# envelope, the format of the export
apiVersion: daikoku.io/v1
kind: team
spec:
  _id: team-weather
  _tenant: default
  name: Weather
```

Every document needs `kind`, `_id` and `_tenant`, the latter equal to the tenant of the catalog.
The other fields are those of the entity in the [admin API](/openapi):
each schema there lists the required fields and publishes a minimal example. The
[reference](./4-reference.md) shows a complete document for each kind.

## Minimal documents

```yaml
kind: team
_id: team-weather
_tenant: default
type: Organization
name: Weather
contact: weather@acme.io
verified: true
---
kind: usage-plan
_id: plan-weather-free
_tenant: default
customName: Free
subscriptionProcess:
  steps: []
---
kind: api
_id: api-weather
_tenant: default
team: team-weather
name: Weather API
possibleUsagePlans: [plan-weather-free]
---
kind: keyring
_id: keyring-weather
_tenant: default
team: team-weather
otoroshiSettings:
  type: Otoroshi
  id: otoroshi-prod       # an Otoroshi settings id of the tenant
apiKey:                   # an existing key of that Otoroshi instance
  clientName: weather-mobile-app
  clientId: weather-mobile-app-client-id
  clientSecret: weather-mobile-app-client-secret
integrationToken: weather-mobile-app-integration-token
createdAt: 1759190400000
---
kind: api-subscription
_id: subscription-weather
_tenant: default
api: api-weather
plan: plan-weather-free
team: team-weather        # the consumer team
keyring: keyring-weather
by: user-admin            # an existing user
createdAt: 1759190400000
---
kind: cms-page
_id: page-weather-home
_tenant: default
name: Weather home
---
kind: api-documentation-page
_id: page-weather-start
_tenant: default
title: Getting started
content: Subscribe to a plan, then call the API with the key of your keyring.
```

A keyring carries its credentials, `apiKey` and `integrationToken`, stored as written: Daikoku
generates nothing. The key must already exist in the Otoroshi instance of the keyring, with the
same `clientId` and `clientSecret`: Daikoku does not create it.

## Folders and listings

The `path` of a source points to:

- **a file**: its documents, or a listing;
- **a folder** (`file`, `github`, `gitlab`): every `.json`, `.yaml` and `.yml` file directly in it,
  or in all its subfolders with `recursive`.

A listing names the files to read, relative to the listing itself:

```yaml
apiVersion: daikoku.io/v1
kind: RemoteCatalogListing
spec:
  catalog_listing:
    - teams/weather.yaml
    - apis/**/*.yaml
```

A plain array of paths works too. `*` matches within a path segment, `**` across segments, `?` one
character. Absolute paths and `..` are refused: a listing cannot read outside its folder.

## Team folders

With **One folder per team** (GitHub and GitLab sources), a repository is shared by several teams.
The folder `teams/<team id>/` may only declare the entities of that team:

| Kind | Allowed in `teams/<team id>/` when |
|---|---|
| `team` | its `_id` is the team id |
| `api`, `keyring` | its `team` is the team id |
| `api-subscription` | its `team`, the **consumer** team, is the team id |
| `usage-plan` | it is referenced by an API of the team, in the run or in Daikoku |
| `api-documentation-page` | it is used by an API or a plan of the team declared in the run |
| `cms-page` | never |

A folder that matches no team is an error. Everything outside `teams/` is tenant level and is not
checked. Subfolders are always read.

```
pages/home.yaml                     tenant level
teams/team-weather/team.yaml
teams/team-weather/apis/weather.yaml
teams/team-mobile/keyring.yaml
teams/team-mobile/subscriptions/weather.yaml   team: team-mobile, api: api-weather
```

Daikoku checks what each folder declares, not who wrote it: use the repository permissions (for
example `CODEOWNERS` on GitHub) to give each team its own folder.
