# Deploying Daikoku on Kubernetes

Two **independent** ways to deploy Daikoku + an embedded PostgreSQL on Kubernetes. Pick one — they are not meant to be combined.

| | [`helm/`](./helm/daikoku) | [`kustomize/`](./kustomize) |
|---|---|---|
| Tooling | Helm 3 | `kubectl` (built-in Kustomize) |
| Customization | one `values.yaml` you override with `-f` / `--set` | a `base/` + copyable `overlays/example` |
| Best for | packaging, templating, releasing | GitOps, plain manifests, no extra CLI |

Both deploy the same stack:

```
Internet ──HTTPS──▶ Ingress ──▶ Service daikoku (:8080) ──▶ Deployment daikoku (replicas: 1)
                      ▲                                          │  config  ◀── ConfigMap (DAIKOKU_* non-secret)
        cert-manager ─┘ (TLS Secret)                            │  secrets ◀── Secret (crypto keys + admin pw)
                                                                ▼
                                   Service postgresql (:5432) ──▶ StatefulSet postgresql + PVC
```

## Prerequisites

- A Kubernetes cluster (tested concept: kind / minikube and managed clusters).
- An **Ingress controller** (e.g. [ingress-nginx](https://kubernetes.github.io/ingress-nginx/)).
- **[cert-manager](https://cert-manager.io/)** with a `ClusterIssuer` (e.g. `letsencrypt-prod`) if you want automatic TLS. Otherwise provide your own TLS Secret and drop the cert-manager annotation.
- A `StorageClass` for the PostgreSQL `PersistentVolumeClaim` (the cluster default is used when unset).

## Quickstart — Helm

```sh
helm install daikoku ./helm/daikoku \
  --namespace daikoku --create-namespace \
  --set ingress.host=daikoku.example.com \
  --set daikoku.initHost=daikoku.example.com
# Read the generated admin password:
kubectl -n daikoku get secret daikoku -o jsonpath='{.data.DAIKOKU_INIT_ADMIN_PASSWORD}' | base64 -d; echo
```

Point an external/managed database instead of the embedded one:

```sh
helm install daikoku ./helm/daikoku \
  --set postgresql.enabled=false \
  --set externalDatabase.host=my-pg.rds.amazonaws.com \
  --set externalDatabase.existingSecret=my-pg-secret
```

## Quickstart — Kustomize

```sh
# 1. Provide secrets (gitignored), starting from the committed examples:
cp kustomize/base/secrets.env.example  kustomize/base/secrets.env
cp kustomize/base/postgres.env.example kustomize/base/postgres.env
# edit both files...

# 2. Deploy the base as-is, or copy overlays/example for your own env:
kubectl apply -k kustomize/base
# or:  kubectl apply -k kustomize/overlays/example
```

## Good to know (Daikoku specifics)

- **`replicas: 1` by default.** Daikoku derives its Snowflake ID worker from `INSTANCE_NUMBER`; two pods sharing the same value can mint colliding IDs. Scaling out requires a unique `INSTANCE_NUMBER` per pod (StatefulSet ordinal) and a single Otoroshi sync master.
- **Tenant resolution is `Hostname` by default.** Daikoku matches the request `Host` against tenant domains, so the initial tenant host must be the hostname users hit. The chart keeps `daikoku.initHost` aligned with `ingress.host` automatically, and **injects a `Host: <initHost>` header into the HTTP probes** — kubelet otherwise probes with the pod IP, which matches no tenant and returns 404 (startup-probe crash loop). Set `daikoku.tenantProvider=local` for host-agnostic single-tenant access (e.g. plain port-forward).
- **Public URLs are derived from the ingress.** `DAIKOKU_EXPOSED_ON` and `DAIKOKU_SSL_ENABLED` are set from `ingress.tls` (443/https with TLS) so the links Daikoku generates point at the real external endpoint.
- **Serve over HTTPS** → keep `DAIKOKU_SESSION_SECURE=true` (default). Set it `false` only behind plain HTTP.
- Daikoku **creates its schema and tables on first boot** — no migration job. The target database must exist (the embedded Postgres creates it) and the DB user must have `CREATE`.
- TLS is terminated at the Ingress; do not set `HTTPS_PORT` / keystore variables.

## Seeding the default tenant (Otoroshi / S3 / mailer / auth / …)

The Helm chart can pre-configure the **default tenant** straight from `values.yaml`,
under `daikoku.initTenant`. These values are translated into `DAIKOKU_INIT_*`
environment variables and applied **only on the very first boot, when the
database is empty** (same lifecycle as `DAIKOKU_INIT_DATA_FROM`). Afterwards the
database is the source of truth and changing them has **no effect** — you then
edit the tenant from the Daikoku admin UI.

Everything is optional; leave a field empty (`""`) or `null` to skip it. Each
block is documented inline in [`values.yaml`](./helm/daikoku/values.yaml):

| Block | What it seeds |
|---|---|
| `initTenant.name/title/defaultLanguage/…` | tenant identity & locale |
| `initTenant.creationSecurity/…` | account / team / subscription security flags |
| `initTenant.otoroshi` | an Otoroshi instance (external; no bundled Otoroshi) |
| `initTenant.s3` | S3 bucket for asset storage |
| `initTenant.mailer` | mailer backend — `console` (default) / `mailgun` / `mailjet` / `smtpClient` / `sendgrid` |
| `initTenant.auth` | auth module — `Local` (default) / `Otoroshi` / `OAuth2` / `LDAP` |
| `initTenant.audit` | audit trail destinations (alert emails, Elasticsearch) |

Secret-bearing fields (mailer keys, S3 secret, client secrets, passwords) are
rendered into a dedicated `*-init-tenant` Secret, never the ConfigMap.

```sh
helm install daikoku ./helm/daikoku \
  --set ingress.host=daikoku.example.com \
  --set daikoku.initTenant.mailer.type=smtpClient \
  --set daikoku.initTenant.mailer.host=smtp.example.com \
  --set daikoku.initTenant.mailer.fromEmail=daikoku@example.com \
  --set daikoku.initTenant.s3.bucket=daikoku-assets \
  --set daikoku.initTenant.s3.endpoint=https://s3.eu-west-1.amazonaws.com \
  --set daikoku.initTenant.s3.access=AKIA... \
  --set daikoku.initTenant.s3.secret=...
```

### Referencing an existing Secret (GitOps)

The example above puts credentials in `values.yaml` (or on the command line),
which is a problem as soon as that file is committed. Any `DAIKOKU_INIT_*` value
can instead be injected from a Secret you own, through `daikoku.extraEnv`: leave
the field empty under `initTenant`, and declare the variable with a `secretKeyRef`.

```sh
kubectl -n daikoku create secret generic daikoku-credentials \
  --from-literal=otoroshi_client_id=admin-api-apikey-id \
  --from-literal=otoroshi_client_secret=... \
  --from-literal=s3_secret=... \
  --from-literal=mailer_password=...
```

```yaml
daikoku:
  initTenant:
    otoroshi:
      url: https://otoroshi-api.example.com   # non-secret, stays here
      host: otoroshi-api.example.com
      # clientId / clientSecret: left empty, injected below
    s3:
      bucket: daikoku-assets
      endpoint: https://s3.eu-west-1.amazonaws.com
      access: AKIAIOSFODNN7EXAMPLE
      # secret: left empty, injected below

  extraEnv:
    - name: DAIKOKU_INIT_OTOROSHI_CLIENT_ID
      valueFrom:
        secretKeyRef: { name: daikoku-credentials, key: otoroshi_client_id }
    - name: DAIKOKU_INIT_OTOROSHI_CLIENT_SECRET
      valueFrom:
        secretKeyRef: { name: daikoku-credentials, key: otoroshi_client_secret }
    - name: DAIKOKU_INIT_S3_SECRET
      valueFrom:
        secretKeyRef: { name: daikoku-credentials, key: s3_secret }
    - name: DAIKOKU_INIT_MAILER_PASSWORD
      valueFrom:
        secretKeyRef: { name: daikoku-credentials, key: mailer_password }
```

The variable to declare is spelled out next to every secret-bearing field in
[`values.yaml`](./helm/daikoku/values.yaml): `mailer.password` is marked
`[DAIKOKU_INIT_MAILER_PASSWORD]`. The **key names inside your Secret are free**,
since `secretKeyRef` maps them explicitly — which suits Secrets synced as-is from
an external store.

Leaving the matching field empty is what keeps the credential out of the cluster's
plain-text objects: an empty value renders no key at all, so nothing lands in the
ConfigMap, and the `*-init-tenant` Secret is not even created once no plain-text
credential is left. `extraEnv` entries land in `env:`, which takes precedence over
everything injected with `envFrom:`, so this works just as well for values the chart
does not classify as secret, such as `DAIKOKU_INIT_OTOROSHI_CLIENT_ID`.

The Secret must exist before the pod starts. Editing its *content* does not restart
the pods — use [Reloader](https://github.com/stakater/Reloader) or roll the
Deployment yourself.

### Optional in-cluster dependencies

For demos/dev you can bundle a backend instead of wiring an external one. Each is
**disabled by default**; when enabled it auto-fills the matching `initTenant.*`
fields so the tenant is seeded to use it (you don't repeat the coordinates):

| Toggle | Bundles | Seeds |
|---|---|---|
| `garage.enabled` | [Garage](https://garagehq.deuxfleurs.fr/) S3 (StatefulSet + a bootstrap Job that creates a bucket & access key) | `initTenant.s3.*` |
| `openldap.enabled` | OpenLDAP directory (osixia, ephemeral, seed users) | `initTenant.auth` → `LDAP` + `ldap.*` |
| `mailpit.enabled` | [Mailpit](https://mailpit.axllent.org/) dev SMTP sink + web UI | `initTenant.mailer` → `smtpClient` |

```sh
# Self-contained demo stack (Postgres + Garage + Mailpit), no external services:
helm install daikoku ./helm/daikoku \
  --set ingress.host=daikoku.example.com \
  --set garage.enabled=true \
  --set mailpit.enabled=true --set mailpit.ui.ingress=true
```

> These bundles are convenience/dev backends — for production prefer managed
> services. Garage's bootstrap Job (cluster layout + bucket + key creation via
> the Garage admin API, credentials stored in a `*-garage-keys` Secret) should be
> smoke-tested on your cluster; the Daikoku pod waits on that Secret before it
> can start when `garage.enabled=true`.
