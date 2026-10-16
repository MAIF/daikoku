# Reference

A complete document for each kind, with the fields a catalog usually sets. A field left out takes its
default value. Together, these documents form a valid catalog: the Daikoku build checks that every
field is read back as written, and that the whole catalog passes `_validate`.

They use the tenant `default`, the Otoroshi settings `otoroshi-prod` and the user `user-admin`:
replace them with yours. Dates are epoch milliseconds. The minimal documents are in
[Catalog files](./1-files.md#minimal-documents).

## Team

```yaml
kind: team
_id: team-weather
_tenant: default
type: Organization
name: Weather
description: Forecasts and observations for every city
contact: weather@acme.io
avatar: https://cdn.acme.io/teams/weather.png
verified: true
users:
  - userId: user-admin
    teamPermission: Administrator
apiKeyVisibility: User
apisCreationPermission: true
authorizedOtoroshiEntities:
  - otoroshiSettingsId: otoroshi-prod
    authorizedEntities:
      groups: []
      services: []
      routes: [route_weather]
metadata:
  cost-center: weather-42
```

- `type`: `Organization` for the teams you declare. Daikoku creates the `Personal` and `Admin` teams
  itself.
- `users`: the members, each with `Administrator`, `ApiEditor` or `User`. Every user must exist.
- `apiKeyVisibility`: who sees the API keys of the team: `Administrator`, `ApiEditor` or `User` and
  above.
- `apisCreationPermission`: lets the team create APIs when the tenant restricts API creation.
- `authorizedOtoroshiEntities`: the Otoroshi groups, services and routes the team may use in its
  plans, per Otoroshi settings. Left out: all of them.

## Usage plan

```yaml
kind: usage-plan
_id: plan-weather-gold
_tenant: default
customName: Gold
customDescription: For production apps
visibility: Private
authorizedTeams: [team-weather]
maxPerSecond: 10
maxPerDay: 10000
maxPerMonth: 300000
costPerMonth: 49
costPerRequest: 0.001
currency:
  code: EUR
billingDuration:
  value: 1
  unit: Month
trialPeriod:
  value: 14
  unit: Day
allowMultipleKeys: false
autoRotation: false
integrationProcess: ApiKey
otoroshiTarget:
  otoroshiSettings: otoroshi-prod
  authorizedEntities:
    groups: []
    services: []
    routes: [route_weather]
  apikeyCustomization:
    clientIdOnly: false
    readOnly: false
    constrainedServicesOnly: false
    metadata:
      plan: gold
    customMetadata:
      - key: environment
        possibleValues: [staging, production]
    tags: [weather, gold]
    restrictions:
      enabled: true
      allowLast: true
      allowed:
        - method: GET
          path: /forecasts/.*
      forbidden: []
      notFound: []
subscriptionProcess:
  steps:
    - type: form
      id: project
      title: Your project
      schema:
        project:
          type: string
          format: textarea
          label: What will you build with this API?
          constraints:
            - type: required
      formatter: "[[project]]"
      formKeysToMetadata: [project]
    - type: teamAdmin
      id: weather-approval
      team: team-weather
      title: Approval by the Weather team
metadata:
  sla: "99.9"
```

- `visibility`: `Public`, or `Private` to show the plan to the `authorizedTeams` only.
- `maxPerSecond`, `maxPerDay`, `maxPerMonth`: the quotas of the API keys.
- `costPerMonth`, `costPerRequest`, `currency`, `billingDuration`, `trialPeriod`: the price shown with
  the plan. Units: `Hour`, `Day`, `Month`, `Year`.
- `integrationProcess`: `ApiKey` shows the API key to every member of the consumer team, `Automatic`
  to its administrators only.
- `otoroshiTarget`: where the API keys are created: the Otoroshi settings, the groups, services and
  routes the keys may call, and the customization of the keys: `metadata` and `tags` set on every
  key, `customMetadata` to fill when a subscription is accepted, `restrictions` on methods and paths.
- `subscriptionProcess.steps`: the steps a subscription goes through, in order. Empty: a
  subscription is accepted at once.

| `type` | Fields | Effect |
|---|---|---|
| `form` | `schema`, `formatter`, `formKeysToMetadata` | The subscriber fills a form, described by a [react-forms](https://github.com/MAIF/react-forms) schema. `formatter` turns the answers into the text shown to the validators, `[[key]]` standing for an answer. `formKeysToMetadata` copies answers into the metadata of the subscription. |
| `teamAdmin` | `team` | An administrator of `team` accepts or refuses. Put a `form` step before it. |
| `email` | `emails`, `message` | Each address receives a link to accept or refuse. |
| `httpRequest` | `url`, `headers` | Daikoku posts the demand to `url`. The answer `{"accept": true}` accepts it, and may set quotas, metadata or tags. `false` refuses it. |
| `payment` | `thirdPartyPaymentSettingsId` | The subscriber pays, through the payment settings of the tenant. |

Every step also needs an `id`, unique in the plan, and a `title`.

## API

```yaml
kind: api
_id: api-weather
_tenant: default
team: team-weather
name: Weather API
smallDescription: Forecasts and observations for every city
description: |
  # Weather API

  Forecasts for the next ten days and observations of the last 24 hours.
currentVersion: 2.1.0
supportedVersions: [2.1.0]
isDefault: true
state: published
visibility: Public
tags: [weather, forecast]
categories: [Data]
image: https://cdn.acme.io/apis/weather.png
possibleUsagePlans: [plan-weather-gold]
defaultUsagePlan: plan-weather-gold
documentation:
  _id: doc-weather
  _tenant: default
  lastModificationAt: 1759190400000
  pages:
    - id: page-weather-start
      title: Getting started
      children: []
swagger:
  url: https://weather.acme.io/openapi.json
  headers: {}
metadata:
  domain: weather
```

- `state`: `created` (not published yet), `published`, `deprecated` or `blocked`.
- `visibility`: `Public`, `PublicWithAuthorizations`, `Private` or `AdminOnly`. The last three use
  `authorizedTeams`.
- `possibleUsagePlans`: the plans of the API, declared in the run or already in Daikoku.
  `defaultUsagePlan` is one of them.
- `swagger`: where Daikoku reads the OpenAPI document of the API, from `url` (with `headers`) or
  inline in `content`.
- Versions: a new version is another `api` document with the same `name`, its own `_id` and
  `currentVersion`, and `parent` set to the first version. `isDefault` marks the version shown first.
  Quote a version that YAML would read as a number, like `"2.0"`.
- `documentation.pages`: the tree of the API pages, each with its `id`, `title` and `children`. Each
  page is an [`api-documentation-page`](#documentation-page), declared in the run or already in
  Daikoku, children included. Left out, the pages of the API are kept.

## Documentation page

```yaml
kind: api-documentation-page
_id: page-weather-start
_tenant: default
title: Getting started
contentType: text/markdown
content: |
  # Getting started

  Subscribe to a plan, then call the API with the key of your keyring.
lastModificationAt: 1759190400000
metadata:
  section: weather
```

- A page of the documentation of an API or of a plan, listed by its `id` in their
  `documentation.pages` tree.
- `contentType`: the format of the page, for example `text/markdown`, `text/html`, `text/asciidoc`
  or `application/pdf`.
- `content`: the page itself, inline. For a binary format (PDF, image, video), set
  `remoteContentEnabled: true` and `remoteContentUrl` instead, with `remoteContentHeaders` when the
  URL needs them.
- `contentType: cms/page` shows the CMS page set in `cmsPage`, declared in the run or already in
  Daikoku: `content` is then not needed.
- A link to a Daikoku asset (`/api/teams/.../assets/...` or `/tenant-assets/...`) only works on the
  Daikoku that stores the asset: host the file elsewhere to share a catalog between instances.
- `lastModificationAt`: left out, it takes the time of the run, and the page counts as updated at
  every run.
- With `folderPerTeam`, a page under `teams/<team>/` must be used by an API or a plan of that team
  declared in the run.

## Keyring

```yaml
kind: keyring
_id: keyring-weather
_tenant: default
team: team-weather
customName: Weather mobile app
otoroshiSettings:
  type: Otoroshi
  id: otoroshi-prod
apiKey:
  clientName: weather-mobile-app
  clientId: weather-mobile-app-client-id
  clientSecret: weather-mobile-app-client-secret
integrationToken: weather-mobile-app-integration-token
enabled: true
createdAt: 1759190400000
rotation:
  enabled: true
  rotationEvery: 744
  gracePeriod: 168
  pendingRotation: false
metadata:
  app: weather-mobile
```

- A keyring holds one API key for its team, the consumer team. Its subscriptions share that key.
- `otoroshiSettings`: the Otoroshi instance that holds the key. With `type: Internal`, the key is
  only known to Daikoku.
- `apiKey` and `integrationToken` are required and stored as written: Daikoku generates nothing.
  With `type: Otoroshi`, the key must already exist in that instance with the same `clientId` and
  `clientSecret`: Daikoku does not create it, and the synchronization of the keyring fails until it
  exists. `bearerToken` is optional.
- `createdAt`: left out, a new keyring takes the time of the run. An update always keeps the date
  already in Daikoku.
- `rotation`: `rotationEvery` and `gracePeriod` are in hours.
- These fields are credentials, and an export writes them: keep the catalog files somewhere safe.

## API subscription

```yaml
kind: api-subscription
_id: subscription-weather
_tenant: default
api: api-weather
plan: plan-weather-gold
team: team-weather
keyring: keyring-weather
by: user-admin
createdAt: 1759190400000
validUntil: 1790726400000
customName: Weather for the mobile app
enabled: true
tags: [mobile]
metadata:
  app: weather-mobile
customMetadata:
  environment: production
customMaxPerSecond: 20
customMaxPerDay: 20000
customMaxPerMonth: 600000
customReadOnly: false
```

- `team` is the consumer team, `keyring` one of its keyrings: the subscription uses its API key.
- `by`: the user recorded as the subscriber. It must exist.
- `validUntil`: the date the subscription ends.
- `customMetadata`, `customMaxPerSecond`, `customMaxPerDay`, `customMaxPerMonth`, `customReadOnly`:
  override the plan for this subscription.
- `api`, `plan`, `team`, `keyring` and `by` cannot change: a run that changes them stops with the
  status `partial`. Give the subscription a new `_id` instead: the old one is removed and the new one
  created.

## CMS page

```yaml
kind: cms-page
_id: page-weather-home
_tenant: default
name: Weather home
path: /weather
exact: true
visible: true
authenticated: false
contentType: text/html
tags: [weather]
body: |
  <h1>Weather</h1>
  <p>Forecasts and observations for every city.</p>
metadata:
  section: weather
```

- `path`: where the page answers in the portal. With `exact`, this path only; otherwise the paths
  below it too.
- `visible: false` hides the page. `authenticated: true` sends anonymous visitors to the login page.
- `contentType`: what the page serves, for example `text/html`, `text/css` or `text/javascript`.
- `body`: a Handlebars template.
- `forwardRef`: the `_id` of another page, rendered in place of this one.
