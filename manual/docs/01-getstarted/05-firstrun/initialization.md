---
sidebar_position: 3
---

# Initialize Daikoku

Daikoku can create its initial administrator and default tenant from configuration, without manual setup in the UI. This page lists the `DAIKOKU_INIT_*` environment variables and their corresponding configuration keys.

## Initialization is not synchronization

At startup, Daikoku checks whether its datastore is empty:

1. **Empty datastore, with `DAIKOKU_INIT_DATA_FROM` set:** Daikoku imports the supplied export instead of generating the default tenant and administrator. The other initialization settings do not override the imported entities.
2. **Empty datastore, without an import:** Daikoku generates the default tenant, administrator, teams and supporting entities using the settings below.
3. **Non-empty datastore:** Daikoku keeps the existing entities. Initialization settings do not update them.

:::warning First initialization only
These settings are bootstrap inputs, not runtime overrides of tenant settings. Changing an environment variable, restarting a pod or running `helm upgrade` does **not** update an existing tenant or reset its administrator's password.

After initialization, use the administration UI or the [admin API](../../03-guides/12-apis.md) to update existing entities. You do not need to recreate the instance or delete its database.
:::

The tenant settings below apply only to the generated **default tenant**, not to every tenant hosted by the instance.

## How to provide settings

Use environment variables, or their equivalent keys in a [configuration file](./configfile.mdx). Each reference table gives a configuration prefix; append the key in the second column to that prefix. For example, `host` under `daikoku.init.mailer` means `daikoku.init.mailer.host`.

- Use `true` or `false` for booleans.
- Leave optional environment variables **unset** when they are not needed. An empty string is not generally equivalent to an absent value.
- Comma-separated lists are trimmed and empty entries are ignored.
- The defaults below are application defaults. A deployment chart can supply different values.
- Keep passwords and API keys out of committed configuration files. On Kubernetes, inject them from Secrets.

## Initial administrator and import

Configuration prefix: `daikoku.init`.

| Environment variable | Configuration key | Default | Description |
| --- | --- | --- | --- |
| `DAIKOKU_INIT_HOST` | `host` | `localhost` | Default tenant's domain. With hostname-based tenant resolution, use the hostname users will access. |
| `DAIKOKU_INIT_ADMIN_NAME` | `admin.name` | `Daikoku admin` | Initial Daikoku administrator's display name. |
| `DAIKOKU_INIT_ADMIN_EMAIL` | `admin.email` | `admin@daikoku.io` | Initial administrator's email/login. |
| `DAIKOKU_INIT_ADMIN_PASSWORD` | `admin.password` | Generated | Initial administrator's password. If unset, a random password is generated and the initial credentials are logged during bootstrap. |
| `DAIKOKU_INIT_DATA_FROM` | `data.from` | Unset | File path or HTTP(S) URL of an NDJSON export to import into an empty datastore. Replaces generated initial data. |

For HTTP import headers, use `daikoku.init.data.headers` in the configuration file (a map of header names to values, empty by default). There is no dedicated environment variable for this map. See [Import initial state](./initialstate.md).

## Default tenant identity and security

Configuration prefix: `daikoku.init.tenant`.

| Environment variable | Configuration key | Default | Description |
| --- | --- | --- | --- |
| `DAIKOKU_INIT_TENANT_NAME` | `name` | `Daikoku Default Tenant` | Tenant name. |
| `DAIKOKU_INIT_TENANT_TITLE` | `title` | `Daikoku Default Tenant` | Portal title, independent of the tenant name. |
| `DAIKOKU_INIT_TENANT_DEFAULT_LANGUAGE` | `defaultLanguage` | `En` | Default language identifier, such as `En`, `Fr` or `Es`. |
| `DAIKOKU_INIT_TENANT_DEFAULT_MESSAGE` | `defaultMessage` | Unset | Default message displayed to users. |
| `DAIKOKU_INIT_TENANT_IS_PRIVATE` | `isPrivate` | `true` | Require authentication to browse the portal. |
| `DAIKOKU_INIT_TENANT_CREATION_SECURITY` | `creationSecurity` | Unset | When `true`, only teams with API creation permission can create APIs. |
| `DAIKOKU_INIT_TENANT_TEAM_CREATION_SECURITY` | `teamCreationSecurity` | Unset | When `true`, restrict team creation to tenant administrators and Daikoku administrators. |
| `DAIKOKU_INIT_TENANT_SUBSCRIPTION_SECURITY` | `subscriptionSecurity` | Unset | When `true`, prevent personal teams from subscribing to APIs. |
| `DAIKOKU_INIT_TENANT_AGGREGATION_APIKEYS_SECURITY` | `aggregationApiKeysSecurity` | Unset | When `true`, allow plans to enable API key aggregation. |

The four optional security flags are stored as unset when omitted; they are not all equivalent to `false`. See [tenant security settings](../../02-usages/07-adminusage/1-tenants.md#security) for more context.

## Mail delivery

Configuration prefix: `daikoku.init.mailer`.

Choose a mailer with `DAIKOKU_INIT_MAILER_TYPE`, then configure the matching provider. If no type is supplied, the generated tenant uses the console mailer: messages are logged, not delivered.

### Common settings

| Environment variable | Configuration key | Default | Description |
| --- | --- | --- | --- |
| `DAIKOKU_INIT_MAILER_TYPE` | `type` | `console` | `console`, `mailgun`, `mailjet`, `smtpClient` (alias: `smtp`) or `sendgrid`. |
| `DAIKOKU_INIT_MAILER_FROM_TITLE` | `fromTitle` | `Daikoku` | Sender display name for non-console mailers. |
| `DAIKOKU_INIT_MAILER_FROM_EMAIL` | `fromEmail` | `daikoku@foo.bar` | Sender email address for non-console mailers. Set a real sender address for production. |

### SMTP

Use `DAIKOKU_INIT_MAILER_TYPE=smtpClient`.

| Environment variable | Configuration key | Default | Description |
| --- | --- | --- | --- |
| `DAIKOKU_INIT_MAILER_HOST` | `host` | `localhost` | SMTP server hostname. |
| `DAIKOKU_INIT_MAILER_PORT` | `port` | `"25"` | SMTP port, configured as a string. |
| `DAIKOKU_INIT_MAILER_USERNAME` | `username` | Unset | SMTP authentication username. The variable is `USERNAME`, not `USER`. |
| `DAIKOKU_INIT_MAILER_PASSWORD` | `password` | Unset | SMTP authentication password. Supply both username and password when authentication is required. |
| `DAIKOKU_INIT_MAILER_STARTTLS` | `starttls` | Inferred from port | If unset, enabled on port `587`, disabled on other ports. Explicit `true` or `false` overrides inference. When enabled, STARTTLS is required. |
| `DAIKOKU_INIT_MAILER_SSL` | `ssl` | Inferred from port | If unset, implicit SSL/TLS is enabled on port `465`, disabled on other ports. Explicit `true` or `false` overrides inference. |

STARTTLS upgrades an SMTP connection to TLS; implicit SSL/TLS starts the connection with TLS. Choose the mode required by your provider, rather than enabling both.

For a provider using authenticated SMTP with STARTTLS on port 587:

```sh
export DAIKOKU_INIT_MAILER_TYPE=smtpClient
export DAIKOKU_INIT_MAILER_HOST=smtp.example.com
export DAIKOKU_INIT_MAILER_PORT=587
export DAIKOKU_INIT_MAILER_FROM_EMAIL=portal@example.com
export DAIKOKU_INIT_MAILER_USERNAME=portal@example.com
export DAIKOKU_INIT_MAILER_STARTTLS=true
export DAIKOKU_INIT_MAILER_SSL=false
```

Provide `DAIKOKU_INIT_MAILER_PASSWORD` through your deployment's secret mechanism before starting Daikoku.

### Mailgun, Mailjet and SendGrid

| Environment variable | Configuration key | Default | Applies to |
| --- | --- | --- | --- |
| `DAIKOKU_INIT_MAILER_DOMAIN` | `domain` | Empty string | Mailgun sending domain. |
| `DAIKOKU_INIT_MAILER_EU` | `eu` | `false` | Mailgun: use the EU region when `true`. |
| `DAIKOKU_INIT_MAILER_KEY` | `key` | Empty string | Mailgun private API key. |
| `DAIKOKU_INIT_MAILER_API_KEY_PUBLIC` | `apiKeyPublic` | Empty string | Mailjet public API key. |
| `DAIKOKU_INIT_MAILER_API_KEY_PRIVATE` | `apiKeyPrivate` | Empty string | Mailjet private API key. |
| `DAIKOKU_INIT_MAILER_SENDGRID_APIKEY` | `sendgridApiKey` | Empty string | SendGrid API key. |

Empty defaults do not provide working credentials. Supply the fields required by the selected provider.

## Otoroshi connection

Configuration prefix: `daikoku.init.otoroshi`.

An Otoroshi connection is attached to the default tenant only when `DAIKOKU_INIT_OTOROSHI_URL` is set. This does not deploy an Otoroshi instance.

| Environment variable | Configuration key | Default | Description |
| --- | --- | --- | --- |
| `DAIKOKU_INIT_OTOROSHI_URL` | `url` | Unset | Otoroshi admin API URL. Enables connection seeding. |
| `DAIKOKU_INIT_OTOROSHI_HOST` | `host` | Empty string | Host header for Otoroshi requests. |
| `DAIKOKU_INIT_OTOROSHI_CLIENT_ID` | `clientId` | `admin-api-apikey-id` | Admin API client ID. |
| `DAIKOKU_INIT_OTOROSHI_CLIENT_SECRET` | `clientSecret` | `admin-api-apikey-secret` | Admin API client secret. Replace the default for production. |

## S3 asset storage

Configuration prefix: `daikoku.init.s3`.

S3 settings are attached only when `DAIKOKU_INIT_S3_BUCKET` is set. The bucket must already exist and be accessible with the supplied credentials.

Asset listing supports S3-compatible providers returning XML as either `application/xml` or `text/xml`.
Use a bucket-scoped endpoint URL (a `{bucket}` placeholder is also supported); Daikoku does not append the bucket name to this URL.

| Environment variable | Configuration key | Default | Description |
| --- | --- | --- | --- |
| `DAIKOKU_INIT_S3_BUCKET` | `bucket` | Unset | Bucket name. Enables S3 configuration seeding. |
| `DAIKOKU_INIT_S3_ENDPOINT` | `endpoint` | Empty string | Bucket endpoint URL. |
| `DAIKOKU_INIT_S3_REGION` | `region` | `us-east-1` | S3 region. |
| `DAIKOKU_INIT_S3_ACCESS` | `access` | Empty string | Access key ID. |
| `DAIKOKU_INIT_S3_SECRET` | `secret` | Empty string | Secret access key. |
| `DAIKOKU_INIT_S3_CHUNK_SIZE` | `chunkSize` | `8388608` | Multipart chunk size in bytes (8 MiB). |
| `DAIKOKU_INIT_S3_V4AUTH` | `v4auth` | `true` | Use AWS Signature Version 4; `false` selects legacy authentication. |

## Authentication

Configuration prefix: `daikoku.init.authProvider`.

| Environment variable | Configuration key | Default | Description |
| --- | --- | --- | --- |
| `DAIKOKU_INIT_AUTH_PROVIDER` | `default` | `Local` | Login provider: `Local`, `Otoroshi`, `OAuth2` or `LDAP`. |

`Local` uses Daikoku-managed accounts. `Otoroshi` delegates authentication to Otoroshi. The following groups configure `OAuth2` and `LDAP` only when the corresponding provider is selected.

### OAuth2

Configuration prefix: `daikoku.init.authProvider.oauth2`.

The localhost defaults are development placeholders. Set the endpoints and callback URL for your actual identity provider and public Daikoku URL.

| Environment variable | Configuration key | Default | Description |
| --- | --- | --- | --- |
| `DAIKOKU_INIT_AUTH_OAUTH2_CLIENT_ID` | `client-id` | `client` | OAuth2 client ID. |
| `DAIKOKU_INIT_AUTH_OAUTH2_CLIENT_SECRET` | `client-secret` | Unset | OAuth2 client secret. |
| `DAIKOKU_INIT_AUTH_OAUTH2_TOKEN_URL` | `token-url` | `http://localhost:8082/oauth/token` | Token endpoint. |
| `DAIKOKU_INIT_AUTH_OAUTH2_AUTHORIZE_URL` | `authorized-url` | `http://localhost:8082/oauth/authorize` | Authorization endpoint. Note the configuration key spelling: `authorized-url`. |
| `DAIKOKU_INIT_AUTH_OAUTH2_USERINFO_URL` | `user-info-url` | `http://localhost:8082/userinfo` | User info endpoint. |
| `DAIKOKU_INIT_AUTH_OAUTH2_LOGIN_URL` | `login-url` | `http://localhost:8082/login` | Login URL. |
| `DAIKOKU_INIT_AUTH_OAUTH2_LOGOUT_URL` | `logout-url` | Unset | Logout URL. |
| `DAIKOKU_INIT_AUTH_OAUTH2_CALLBACK_URL` | `callback-url` | `http://localhost:8080/auth/oauth2/callback` | Daikoku callback URL registered with the identity provider. |
| `DAIKOKU_INIT_AUTH_OAUTH2_SCOPE` | `scope` | `openid profile email name` | Requested scopes, separated by spaces. |
| `DAIKOKU_INIT_AUTH_OAUTH2_NAME_FIELD` | `name-field` | `name` | Display name field. |
| `DAIKOKU_INIT_AUTH_OAUTH2_EMAIL_FIELD` | `email-field` | `email` | Email field. |
| `DAIKOKU_INIT_AUTH_OAUTH2_PICTURE_FIELD` | `picture-field` | `picture` | Profile picture field. |
| `DAIKOKU_INIT_AUTH_OAUTH2_ROLE_CLAIM` | `role-claim` | Unset | Claim used for role mapping. |
| `DAIKOKU_INIT_AUTH_OAUTH2_ADMIN_ROLE` | `admin-role` | Unset | Administrator role mapping. |
| `DAIKOKU_INIT_AUTH_OAUTH2_USER_ROLE` | `user-role` | Unset | User role mapping. |

### LDAP

Configuration prefix: `daikoku.init.authProvider.ldap`.

LDAP configuration is seeded only when the provider is `LDAP` **and** `DAIKOKU_INIT_AUTH_LDAP_SEARCH_BASE` is set. Supply server URLs and the search base for a usable configuration.

| Environment variable | Configuration key | Default | Description |
| --- | --- | --- | --- |
| `DAIKOKU_INIT_AUTH_LDAP_SERVER_URLS` | `server-urls` | Empty list | Comma-separated LDAP server URLs. |
| `DAIKOKU_INIT_AUTH_LDAP_SEARCH_BASE` | `search-base` | Unset | Search base DN. Required to seed LDAP settings. |
| `DAIKOKU_INIT_AUTH_LDAP_USER_BASE` | `user-base` | Unset | User base DN. |
| `DAIKOKU_INIT_AUTH_LDAP_SEARCH_FILTER` | `search-filter` | `(mail=${username})` | User lookup filter. Preserve the literal `${username}` placeholder. |
| `DAIKOKU_INIT_AUTH_LDAP_ADMIN_USERNAME` | `admin-username` | Unset | Bind username. |
| `DAIKOKU_INIT_AUTH_LDAP_ADMIN_PASSWORD` | `admin-password` | Unset | Bind password. |
| `DAIKOKU_INIT_AUTH_LDAP_NAME_FIELDS` | `name-fields` | `cn` | Comma-separated display name fields. |
| `DAIKOKU_INIT_AUTH_LDAP_EMAIL_FIELD` | `email-field` | `mail` | Email attribute. |
| `DAIKOKU_INIT_AUTH_LDAP_GROUP_FILTER` | `group-filter` | Unset | Group lookup filter. |
| `DAIKOKU_INIT_AUTH_LDAP_ADMIN_GROUP_FILTER` | `admin-group-filter` | Unset | Administrator group filter. |
| `DAIKOKU_INIT_AUTH_LDAP_USE_SSL` | `use-ssl` | Unset | Optional LDAP SSL setting. |

See the [authentication guide](../../03-guides/14-authentication.mdx) for authentication concepts.

## Audit destinations

Configuration prefix: `daikoku.init.audit`.

Audit configuration is seeded when the alert email list is non-empty or an Elasticsearch cluster URI is supplied.

| Environment variable | Configuration key | Default | Description |
| --- | --- | --- | --- |
| `DAIKOKU_INIT_AUDIT_ALERTS_EMAILS` | `alertsEmails` | Empty list | Comma-separated alert recipients. |
| `DAIKOKU_INIT_AUDIT_ELASTIC_CLUSTER_URI` | `elastic.clusterUri` | Unset | Elasticsearch cluster URI. Enables Elasticsearch configuration seeding. |
| `DAIKOKU_INIT_AUDIT_ELASTIC_INDEX` | `elastic.index` | Unset | Elasticsearch index. |
| `DAIKOKU_INIT_AUDIT_ELASTIC_TYPE` | `elastic.type` | Unset | Elasticsearch document type. |
| `DAIKOKU_INIT_AUDIT_ELASTIC_USER` | `elastic.user` | Unset | Elasticsearch username. |
| `DAIKOKU_INIT_AUDIT_ELASTIC_PASSWORD` | `elastic.password` | Unset | Elasticsearch password. |

## Helm and GitOps

The [Helm chart](../../05-kubernetes/index.mdx#initialize-the-default-tenant) exposes tenant bootstrap settings under `daikoku.initTenant`. It also accepts raw environment variables through `daikoku.extraEnv`, including `valueFrom.secretKeyRef` references.

In chart values, optional boolean fields use `null` to mean "do not set"; an explicit `false` is rendered and overrides the application's default or inference.

Helm manages Kubernetes resources, not the tenant records in Daikoku's database. Once the database is initialized:

- Updating `initTenant` values or the referenced Secrets does not change the stored tenant settings, including SMTP credentials.
- Restarting Daikoku does not reapply those bootstrap values.
- An upgrade or rollback of the Helm release does not synchronize or roll back tenant settings.

For ongoing declarative management, your automation must explicitly update the existing tenant through the admin API. The chart does not provide a tenant reconciliation mechanism. Define which fields automation owns to avoid conflicts with changes made in the UI.
