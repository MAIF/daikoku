{{/*
================================================================================
Init-tenant env vars (first-boot seeding of the default tenant).

Two named templates render the DAIKOKU_INIT_* variables from
.Values.daikoku.initTenant, splitting non-secret (-> ConfigMap) from secret
(-> Secret). When a bundled dependency is enabled (Garage / OpenLDAP / Mailpit)
the matching coordinates are auto-filled here, overriding the user values.

Bundle-GENERATED credentials (Garage access/secret keys, OpenLDAP admin
password) are NOT rendered here — they are wired in the Deployment via
secretKeyRef against the dependency's own Secret. Only user-provided plaintext
secrets land in the init-tenant Secret.

Both templates are called with the root context `.`.
================================================================================
*/}}

{{/* Non-secret DAIKOKU_INIT_* vars as `KEY: "value"` lines (for the ConfigMap). */}}
{{- define "daikoku.initTenant.config" -}}
{{- $it := .Values.daikoku.initTenant -}}

{{/* ---- bundle-aware effective values ---- */}}
{{- $s3Bucket := $it.s3.bucket -}}
{{- $s3Endpoint := $it.s3.endpoint -}}
{{- $s3Region := $it.s3.region -}}
{{- $s3Access := $it.s3.access -}}
{{- if .Values.garage.enabled -}}
{{-   $s3Bucket = .Values.garage.bucket -}}
{{-   $s3Endpoint = printf "http://%s-s3:3900" (include "daikoku.garage.fullname" .) -}}
{{-   $s3Region = "garage" -}}
{{/*   access/secret come from the Garage-generated Secret (Deployment env) */}}
{{-   $s3Access = "" -}}
{{- end -}}

{{- $mailerType := $it.mailer.type -}}
{{- $mailerHost := $it.mailer.host -}}
{{- $mailerPort := $it.mailer.port -}}
{{- if .Values.mailpit.enabled -}}
{{-   $mailerType = "smtpClient" -}}
{{-   $mailerHost = include "daikoku.mailpit.fullname" . -}}
{{-   $mailerPort = .Values.mailpit.smtpPort | toString -}}
{{- end -}}

{{- $authProvider := $it.auth.provider -}}
{{- $ldapServerUrls := $it.auth.ldap.serverUrls -}}
{{- $ldapSearchBase := $it.auth.ldap.searchBase -}}
{{- $ldapUserBase := $it.auth.ldap.userBase -}}
{{- $ldapAdminUsername := $it.auth.ldap.adminUsername -}}
{{- if .Values.openldap.enabled -}}
{{-   $base := include "daikoku.openldap.baseDN" . -}}
{{-   if not $authProvider }}{{ $authProvider = "LDAP" }}{{ end -}}
{{-   $ldapServerUrls = printf "ldap://%s:389" (include "daikoku.openldap.fullname" .) -}}
{{-   $ldapSearchBase = $base -}}
{{-   $ldapUserBase = "ou=users" -}}
{{-   $ldapAdminUsername = printf "cn=admin,%s" $base -}}
{{- end -}}

{{/* ---- string vars (emitted only when non-empty) ---- */}}
{{- $s := dict
  "DAIKOKU_INIT_TENANT_NAME" $it.name
  "DAIKOKU_INIT_TENANT_TITLE" $it.title
  "DAIKOKU_INIT_TENANT_DEFAULT_LANGUAGE" $it.defaultLanguage
  "DAIKOKU_INIT_TENANT_DEFAULT_MESSAGE" $it.defaultMessage
  "DAIKOKU_INIT_OTOROSHI_URL" $it.otoroshi.url
  "DAIKOKU_INIT_OTOROSHI_HOST" $it.otoroshi.host
  "DAIKOKU_INIT_OTOROSHI_CLIENT_ID" $it.otoroshi.clientId
  "DAIKOKU_INIT_S3_BUCKET" $s3Bucket
  "DAIKOKU_INIT_S3_ENDPOINT" $s3Endpoint
  "DAIKOKU_INIT_S3_REGION" $s3Region
  "DAIKOKU_INIT_S3_ACCESS" $s3Access
  "DAIKOKU_INIT_MAILER_TYPE" $mailerType
  "DAIKOKU_INIT_MAILER_FROM_TITLE" $it.mailer.fromTitle
  "DAIKOKU_INIT_MAILER_FROM_EMAIL" $it.mailer.fromEmail
  "DAIKOKU_INIT_MAILER_DOMAIN" $it.mailer.domain
  "DAIKOKU_INIT_MAILER_API_KEY_PUBLIC" $it.mailer.apiKeyPublic
  "DAIKOKU_INIT_MAILER_HOST" $mailerHost
  "DAIKOKU_INIT_MAILER_PORT" $mailerPort
  "DAIKOKU_INIT_MAILER_USERNAME" $it.mailer.username
  "DAIKOKU_INIT_AUTH_PROVIDER" $authProvider
  "DAIKOKU_INIT_AUTH_OAUTH2_CLIENT_ID" $it.auth.oauth2.clientId
  "DAIKOKU_INIT_AUTH_OAUTH2_TOKEN_URL" $it.auth.oauth2.tokenUrl
  "DAIKOKU_INIT_AUTH_OAUTH2_AUTHORIZE_URL" $it.auth.oauth2.authorizeUrl
  "DAIKOKU_INIT_AUTH_OAUTH2_USERINFO_URL" $it.auth.oauth2.userInfoUrl
  "DAIKOKU_INIT_AUTH_OAUTH2_LOGIN_URL" $it.auth.oauth2.loginUrl
  "DAIKOKU_INIT_AUTH_OAUTH2_LOGOUT_URL" $it.auth.oauth2.logoutUrl
  "DAIKOKU_INIT_AUTH_OAUTH2_CALLBACK_URL" $it.auth.oauth2.callbackUrl
  "DAIKOKU_INIT_AUTH_OAUTH2_SCOPE" $it.auth.oauth2.scope
  "DAIKOKU_INIT_AUTH_OAUTH2_NAME_FIELD" $it.auth.oauth2.nameField
  "DAIKOKU_INIT_AUTH_OAUTH2_EMAIL_FIELD" $it.auth.oauth2.emailField
  "DAIKOKU_INIT_AUTH_OAUTH2_PICTURE_FIELD" $it.auth.oauth2.pictureField
  "DAIKOKU_INIT_AUTH_OAUTH2_ROLE_CLAIM" $it.auth.oauth2.roleClaim
  "DAIKOKU_INIT_AUTH_OAUTH2_ADMIN_ROLE" $it.auth.oauth2.adminRole
  "DAIKOKU_INIT_AUTH_OAUTH2_USER_ROLE" $it.auth.oauth2.userRole
  "DAIKOKU_INIT_AUTH_LDAP_SERVER_URLS" $ldapServerUrls
  "DAIKOKU_INIT_AUTH_LDAP_SEARCH_BASE" $ldapSearchBase
  "DAIKOKU_INIT_AUTH_LDAP_USER_BASE" $ldapUserBase
  "DAIKOKU_INIT_AUTH_LDAP_SEARCH_FILTER" $it.auth.ldap.searchFilter
  "DAIKOKU_INIT_AUTH_LDAP_ADMIN_USERNAME" $ldapAdminUsername
  "DAIKOKU_INIT_AUTH_LDAP_NAME_FIELDS" $it.auth.ldap.nameFields
  "DAIKOKU_INIT_AUTH_LDAP_EMAIL_FIELD" $it.auth.ldap.emailField
  "DAIKOKU_INIT_AUTH_LDAP_GROUP_FILTER" $it.auth.ldap.groupFilter
  "DAIKOKU_INIT_AUTH_LDAP_ADMIN_GROUP_FILTER" $it.auth.ldap.adminGroupFilter
  "DAIKOKU_INIT_AUDIT_ALERTS_EMAILS" $it.audit.alertsEmails
  "DAIKOKU_INIT_AUDIT_ELASTIC_CLUSTER_URI" $it.audit.elastic.clusterUri
  "DAIKOKU_INIT_AUDIT_ELASTIC_INDEX" $it.audit.elastic.index
  "DAIKOKU_INIT_AUDIT_ELASTIC_TYPE" $it.audit.elastic.type
  "DAIKOKU_INIT_AUDIT_ELASTIC_USER" $it.audit.elastic.user
-}}
{{- range $k, $v := $s }}
{{- if $v }}
{{ $k }}: {{ $v | quote }}
{{- end }}
{{- end }}

{{/* ---- bool/int vars (emitted only when not null) ---- */}}
{{- $tri := dict
  "DAIKOKU_INIT_TENANT_IS_PRIVATE" $it.isPrivate
  "DAIKOKU_INIT_TENANT_CREATION_SECURITY" $it.creationSecurity
  "DAIKOKU_INIT_TENANT_TEAM_CREATION_SECURITY" $it.teamCreationSecurity
  "DAIKOKU_INIT_TENANT_SUBSCRIPTION_SECURITY" $it.subscriptionSecurity
  "DAIKOKU_INIT_TENANT_AGGREGATION_APIKEYS_SECURITY" $it.aggregationApiKeysSecurity
  "DAIKOKU_INIT_S3_CHUNK_SIZE" $it.s3.chunkSize
  "DAIKOKU_INIT_S3_V4AUTH" $it.s3.v4auth
  "DAIKOKU_INIT_MAILER_EU" $it.mailer.eu
  "DAIKOKU_INIT_AUTH_LDAP_USE_SSL" $it.auth.ldap.useSsl
-}}
{{- range $k, $v := $tri }}
{{- if not (kindIs "invalid" $v) }}
{{ $k }}: {{ $v | quote }}
{{- end }}
{{- end }}
{{- end -}}


{{/* User-provided secret DAIKOKU_INIT_* vars as `KEY: "value"` lines (for the Secret). */}}
{{- define "daikoku.initTenant.secretData" -}}
{{- $it := .Values.daikoku.initTenant -}}
{{- $sec := dict
  "DAIKOKU_INIT_OTOROSHI_CLIENT_SECRET" $it.otoroshi.clientSecret
  "DAIKOKU_INIT_MAILER_KEY" $it.mailer.key
  "DAIKOKU_INIT_MAILER_API_KEY_PRIVATE" $it.mailer.apiKeyPrivate
  "DAIKOKU_INIT_MAILER_PASSWORD" $it.mailer.password
  "DAIKOKU_INIT_MAILER_SENDGRID_APIKEY" $it.mailer.sendgridApiKey
  "DAIKOKU_INIT_AUTH_OAUTH2_CLIENT_SECRET" $it.auth.oauth2.clientSecret
  "DAIKOKU_INIT_AUDIT_ELASTIC_PASSWORD" $it.audit.elastic.password
-}}
{{/* LDAP admin password is only user-provided when the bundled OpenLDAP is OFF
     (otherwise it comes from the OpenLDAP Secret, wired in the Deployment). */}}
{{- if not .Values.openldap.enabled -}}
{{- $_ := set $sec "DAIKOKU_INIT_AUTH_LDAP_ADMIN_PASSWORD" $it.auth.ldap.adminPassword -}}
{{- end -}}
{{/* S3 secret comes from the Garage-generated Secret when the bundle is on. */}}
{{- if not .Values.garage.enabled -}}
{{- $_ := set $sec "DAIKOKU_INIT_S3_SECRET" $it.s3.secret -}}
{{- end -}}
{{- range $k, $v := $sec }}
{{- if $v }}
{{ $k }}: {{ $v | quote }}
{{- end }}
{{- end }}
{{- end -}}


{{/* True when the init-tenant Secret will hold at least one key. */}}
{{- define "daikoku.initTenant.hasSecrets" -}}
{{- $rendered := include "daikoku.initTenant.secretData" . -}}
{{- if regexMatch "[A-Z]" $rendered }}true{{- end -}}
{{- end -}}
