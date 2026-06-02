{{/*
Chart name (optionally overridden).
*/}}
{{- define "daikoku.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fully qualified app name: "<release>-<chart>", deduplicated and ≤63 chars.
*/}}
{{- define "daikoku.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "daikoku.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels (Daikoku app).
*/}}
{{- define "daikoku.labels" -}}
helm.sh/chart: {{ include "daikoku.chart" . }}
{{ include "daikoku.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: daikoku
{{- end }}

{{/*
Selector labels — MUST stay stable: the Service selector and the Pod labels
are both rendered from this, so they always match.
*/}}
{{- define "daikoku.selectorLabels" -}}
app.kubernetes.io/name: {{ include "daikoku.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: daikoku
{{- end }}

{{/*
PostgreSQL names / labels.
*/}}
{{- define "daikoku.postgresql.fullname" -}}
{{- printf "%s-postgresql" (include "daikoku.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "daikoku.postgresql.selectorLabels" -}}
app.kubernetes.io/name: {{ include "daikoku.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: postgresql
{{- end }}

{{- define "daikoku.postgresql.labels" -}}
helm.sh/chart: {{ include "daikoku.chart" . }}
{{ include "daikoku.postgresql.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: daikoku
{{- end }}

{{/*
ServiceAccount name.
*/}}
{{- define "daikoku.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "daikoku.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Container image "repository:tag" (tag defaults to the chart's appVersion).
*/}}
{{- define "daikoku.image" -}}
{{- printf "%s:%s" .Values.image.repository (.Values.image.tag | default .Chart.AppVersion) }}
{{- end }}

{{/*
Initial tenant host — defaults to the ingress host so the two never drift.
With tenantProvider=Hostname the initial tenant's domain MUST match the hostname
users hit, otherwise tenant resolution (and login) fails.
*/}}
{{- define "daikoku.initHost" -}}
{{- .Values.daikoku.initHost | default .Values.ingress.host -}}
{{- end }}

{{/*
External port Daikoku advertises in absolute URLs — it ALWAYS appends ":<exposedOn>"
(env.scala). Defaults to the ingress external port (443 with TLS, 80 without), else the
Service port. Override with daikoku.exposedOn for a non-standard port.
*/}}
{{- define "daikoku.exposedPort" -}}
{{- if .Values.daikoku.exposedOn -}}
{{- .Values.daikoku.exposedOn -}}
{{- else if and .Values.ingress.enabled .Values.ingress.tls.enabled -}}
443
{{- else if .Values.ingress.enabled -}}
80
{{- else -}}
{{- .Values.service.port -}}
{{- end -}}
{{- end }}

{{/*
Whether Daikoku builds https:// URLs (TLS terminated at the ingress).
*/}}
{{- define "daikoku.sslEnabled" -}}
{{- if and .Values.ingress.enabled .Values.ingress.tls.enabled -}}true{{- else -}}false{{- end -}}
{{- end }}

{{/*
Render a probe, injecting an HTTP "Host" header (= initHost) into httpGet probes.
kubelet sends the pod IP as Host by default; with tenantProvider=Hostname Daikoku would
reject that (tenant-not-found -> 404 -> probe fails). tcpSocket/exec probes pass through,
and an explicit httpHeaders in values is preserved.
Call with: (dict "probe" <probeSpec> "host" <initHost>)
*/}}
{{- define "daikoku.probe" -}}
{{- $probe := deepCopy .probe -}}
{{- if hasKey $probe "httpGet" -}}
{{- if not (hasKey $probe.httpGet "httpHeaders") -}}
{{- $_ := set $probe.httpGet "httpHeaders" (list (dict "name" "Host" "value" .host)) -}}
{{- end -}}
{{- end -}}
{{- toYaml $probe -}}
{{- end }}

{{/*
Secret holding Daikoku application secrets (crypto keys + admin password).
Falls back to a user-provided existing Secret.
*/}}
{{- define "daikoku.secretName" -}}
{{- default (include "daikoku.fullname" .) .Values.secrets.existingSecret }}
{{- end }}

{{/*
Secret holding the PostgreSQL password.
- embedded Postgres  -> the Secret this chart creates
- external database  -> the user-provided existing Secret
*/}}
{{- define "daikoku.postgresSecretName" -}}
{{- if .Values.postgresql.enabled }}
{{- include "daikoku.postgresql.fullname" . }}
{{- else }}
{{- required "externalDatabase.existingSecret is required when postgresql.enabled=false" .Values.externalDatabase.existingSecret }}
{{- end }}
{{- end }}

{{/*
Database connection coordinates — resolved from the embedded Postgres or the external DB.
*/}}
{{- define "daikoku.database.host" -}}
{{- if .Values.postgresql.enabled }}{{ include "daikoku.postgresql.fullname" . }}{{ else }}{{ required "externalDatabase.host is required when postgresql.enabled=false" .Values.externalDatabase.host }}{{ end }}
{{- end }}

{{- define "daikoku.database.port" -}}
{{- if .Values.postgresql.enabled }}5432{{ else }}{{ .Values.externalDatabase.port }}{{ end }}
{{- end }}

{{- define "daikoku.database.name" -}}
{{- if .Values.postgresql.enabled }}{{ .Values.postgresql.auth.database }}{{ else }}{{ .Values.externalDatabase.database }}{{ end }}
{{- end }}

{{- define "daikoku.database.user" -}}
{{- if .Values.postgresql.enabled }}{{ .Values.postgresql.auth.username }}{{ else }}{{ .Values.externalDatabase.username }}{{ end }}
{{- end }}

{{- define "daikoku.database.passwordKey" -}}
{{- if .Values.postgresql.enabled }}postgres-password{{ else }}{{ .Values.externalDatabase.passwordKey | default "postgres-password" }}{{ end }}
{{- end }}

{{/*
Resolve a secret value with "generate-if-absent" semantics, so re-installs never
rotate a secret (rotating DAIKOKU_CYPHER_SECRET would make stored data unreadable,
rotating PLAY_CRYPTO_SECRET would log everyone out):
    provided value  ->  value already stored in the live Secret  ->  freshly generated
Call with: (dict "ctx" $ "secret" <secretName> "key" <dataKey> "provided" <value> "length" <int>)
Note: `lookup` returns empty during `helm template`/dry-run, so values regenerate there (harmless).
*/}}
{{- define "daikoku.resolveSecret" -}}
{{- $ctx := .ctx -}}
{{- $obj := (lookup "v1" "Secret" $ctx.Release.Namespace .secret) | default dict -}}
{{- $data := (get $obj "data") | default dict -}}
{{- $current := get $data .key | b64dec -}}
{{- .provided | default $current | default (randAlphaNum (int .length)) -}}
{{- end }}
