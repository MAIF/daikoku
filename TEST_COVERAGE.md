# Daikoku — Matrice de couverture de tests

> Croisement entre les fonctionnalités (déduites du domaine Scala) et les tests existants :
> - **Tests Scala** (`daikoku/test/...`) — ~738 cas, surtout intégration controller.
> - **Tests e2e Playwright** (`daikoku/javascript/tests/...`) — ~273 cas, parcours UI.
>
> Les pourcentages sont la **couverture de statements** issue de scoverage
> (`sbt clean coverage test coverageReport`), au niveau classe.
>
> **Couverture globale : 48,5 % statements · 35,3 % branches** (19 681 / 40 604 statements).

## Légende

| Symbole | Sens (couv. statements indicative) |
|---|---|
| ✅ | Suffisant — > ~55 % et flux clés couverts |
| 🟠 | Insuffisant — ~15-55 %, ou trous notables / e2e skippés |
| 🔴 | Quasi absent — < ~15 % |

**Source :** `S` = tests Scala · `P` = Playwright e2e · `S+P` = les deux · `—` = aucune.

> ⚠️ Une couverture Scala faible ne veut pas toujours dire « non testé » : certains flux
> (création de compte, OIDC, invitations) sont validés **uniquement** côté e2e Playwright et
> apparaissent donc à 0 % en couverture backend.

---

## 1. Authentification & Utilisateurs

| Fonctionnalité | Classe(s) clé(s) | Couv. | Verdict | Source |
|---|---|---|---|---|
| Login local | LocalLoginSupport 92% | 92% | ✅ | S+P |
| Login LDAP | LdapConfig 78%, LdapSupport 62% | ~70% | ✅ | S+P |
| Login OAuth2 (backend) | OAuth2Config 0%, OAuth2Support 0% | 0% | 🔴 | — |
| Login OIDC | (0% backend) | 0% S | 🟠 | P |
| Auth Otoroshi | OtoroshiIdentityFilter 0%, OtoroshiUser 0% | 0% | 🔴 | — |
| LoginController global (dont reset mdp) | LoginController 13,6% | 14% | 🔴 | S(partiel) |
| 2FA / TOTP / clés matérielles | (via LoginController, non couvert) | ~0% | 🔴 | — |
| Reset mot de passe | (chemins LoginController non couverts) | ~0% | 🔴 | — |
| Sessions (SessionController) | SessionController 2,6% | 3% | 🔴 | — |
| Création de compte (service) | AccountCreationService 0% | 0% | 🔴 | P only |
| Invitations utilisateur | (e2e) | n/a | ✅ | P |
| Users (gestion) | UsersController 34%, UserService 88% | mitigé | 🟠 | S+P |

## 2. Teams & Organisation

| Fonctionnalité | Classe(s) clé(s) | Couv. | Verdict | Source |
|---|---|---|---|---|
| CRUD teams | TeamController 54% | 54% | ✅ | S+P |
| Admin API team | TeamAdminApiController 84% | 84% | ✅ | S |
| Gestion membres & rôles | (TeamController + e2e) | — | ✅ | S+P |
| Vérification email (team) | — | — | 🟠 | — (skip P : lien mail) |

## 3. Gestion des APIs

| Fonctionnalité | Classe(s) clé(s) | Couv. | Verdict | Source |
|---|---|---|---|---|
| CRUD / cycle de vie API | ApiController 53%, ApiAdminApi 95% | 53% | ✅ | S+P |
| Logique métier API | ApiService 68% | 68% | ✅ | S |
| Documentation (CRUD backend) | ApiDocumentationPageAdminApi 76% | 76% | ✅ | S |
| Documentation (éditeur front) | — | — | 🟠 | — (skip P : CodeMirror) |
| Posts / News (CRUD backend) | PostsAdminApiController 76% | 76% | ✅ | S |
| Posts / News (front) | — | — | 🟠 | — (skip P) |
| Issues & tags (CRUD backend) | IssuesAdminApiController 80% | 80% | ✅ | S |
| Versions multiples / deprecation | (ApiController) | partiel | 🟠 | P (deprecation commentée) |
| Transfert de propriété d'API | — | faible | 🟠 | — |

## 4. Usage Plans

| Fonctionnalité | Classe(s) clé(s) | Couv. | Verdict | Source |
|---|---|---|---|---|
| CRUD / admin plans | UsagePlansAdminApiController 83% | 83% | ✅ | S |
| Process souscription multi-étapes | (souscriptions.spec) | — | ✅ | S+P |
| Deprecation / update lifecycle | — | faible | 🟠 | — |

## 5. Souscriptions & API Keys

| Fonctionnalité | Classe(s) clé(s) | Couv. | Verdict | Source |
|---|---|---|---|---|
| Souscription (admin API) | ApiSubscriptionAdminApi 88% | 88% | ✅ | S |
| Demandes de souscription | SubscriptionDemandsAdminApi 87% | 87% | ✅ | S+P |
| Workflow (email/admin/form/http) | (ApiController + souscriptions.spec) | — | ✅ | S+P |
| Étape paiement (Stripe) | PaymentClient 2,5% | 3% | 🔴 | — |
| Agrégation (parent/child, env) | (envMode) | — | ✅ | P |
| Rotation de clés (job) | ApiKeySecretRotationJob 1,4% | 1% | 🔴 | — |
| Transfert de souscription | — | faible | 🟠 | — |

## 6. Consommation & Billing

| Fonctionnalité | Classe(s) clé(s) | Couv. | Verdict | Source |
|---|---|---|---|---|
| Suivi de consommation | ConsumptionController 73% | 73% | ✅ | S |
| Stats d'API key (job) | ApiKeyStatsJob 70% | 70% | ✅ | S |
| Paiement / monétisation | PaymentClient 2,5% | 3% | 🔴 | — |
| Quotas — vérif en appel réel | — | — | 🟠 | — |

## 7. Tenants & Multi-tenancy

| Fonctionnalité | Classe(s) clé(s) | Couv. | Verdict | Source |
|---|---|---|---|---|
| CRUD tenant | TenantController 49%, TenantAdminApi 85% | 49% | ✅ | S+P |
| Otoroshi settings | OtoroshiSettingsController 18,5% | 18% | 🟠 | S |
| Import / export / reset d'état | StateController 6,3% | 6% | 🔴 | — |
| Mailer SMTP simple | (SimpleSMTPSenderSpec) | — | ✅ | S |
| Mailer Mailgun / Mailjet / SendGrid | — | — | 🔴 | — |
| Stockage S3 | (AssetsService 0%) | 0% | 🔴 | — |
| Customisation UI / style | (consultation.spec minimal) | — | 🟠 | P |
| Mode maintenance | (MaintenanceSpec) | — | ✅ | S+P |
| Mode d'affichage (environnements) | (EnvironmentDisplayMode, envMode) | — | ✅ | S+P |

## 8. Notifications & Messagerie

| Fonctionnalité | Classe(s) clé(s) | Couv. | Verdict | Source |
|---|---|---|---|---|
| Notifications | NotificationController 68% | 68% | ✅ | S+P |
| Messagerie / chat | MessageController 77% | 77% | ✅ | S |
| Messagerie SSE temps réel | — | — | 🟠 | — |

## 9. CMS & Contenu

| Fonctionnalité | Classe(s) clé(s) | Couv. | Verdict | Source |
|---|---|---|---|---|
| API CMS (CmsApiController) | CmsApiController 2,1% | 2% | 🔴 | — |
| Rendu CMS / fichiers | CmsFile 0%, CmsPage 45% | partiel | 🟠 | — |
| Pages CMS (admin) | CmsPagesAdminApiController 41% | 41% | 🟠 | S |
| Assets / upload / thumbnails | AssetsService 0%, asset ctrls ~3-5% | ~3% | 🔴 | — |

## 10. Traductions / i18n

| Fonctionnalité | Classe(s) clé(s) | Couv. | Verdict | Source |
|---|---|---|---|---|
| TranslationController | TranslationController 3,3% | 3% | 🔴 | — |
| TranslationsService | TranslationsService 0% | 0% | 🔴 | — |
| Admin API traductions | TranslationsAdminApiController 76% | 76% | ✅ | S |

## 11. Audit & Conformité

| Fonctionnalité | Classe(s) clé(s) | Couv. | Verdict | Source |
|---|---|---|---|---|
| Audit trail | AuditTrailController 83% | 83% | ✅ | S (indirect) |
| Audit events (admin API) | AuditEventAdminApiController 10% | 10% | 🟠 | — |
| Forward Kafka / Elastic / webhooks | (pkg audit ~28%) | ~28% | 🟠 | — |

## 12. Jobs & Tâches de fond

| Fonctionnalité | Classe(s) clé(s) | Couv. | Verdict | Source |
|---|---|---|---|---|
| OtoroshiSynchronizerJob | 70% | 70% | ✅ | S |
| ApiKeyStatsJob | 70% | 70% | ✅ | S |
| NotificationsPurgeJob | 99% | 99% | ✅ | S |
| AuditTrailPurgeJob | 37% | 37% | 🟠 | S |
| AnonymousReportingJob | 14,5% | 15% | 🔴 | — |
| ApiKeySecretRotationJob | 1,4% | 1% | 🔴 | — |
| OtoroshiEntitiesVerifierJob | 2,2% | 2% | 🔴 | — |
| JobsController (endpoint) | 21,7% | 22% | 🟠 | — |

## 13. Opérations & Admin

| Fonctionnalité | Classe(s) clé(s) | Couv. | Verdict | Source |
|---|---|---|---|---|
| Suppression en cascade | DeletionService 87% | 87% | ✅ | S |
| Admin users | UserAdminApiController 85% | 85% | ✅ | S+P |
| Loggers | LoggersController 1,8% | 2% | 🔴 | — |
| Maintenance / état système | (MaintenanceSpec) | — | ✅ | S+P |

## 14. Intégrations & Recherche

| Fonctionnalité | Classe(s) clé(s) | Couv. | Verdict | Source |
|---|---|---|---|---|
| Intégration Otoroshi (jobs/sync) | OtoroshiSynchronizerJob 70% | 70% | ✅ | S |
| IntegrationApiController | 0,4% | 0% | 🔴 | — |
| EntitiesController | 2,2% | 2% | 🔴 | — |
| GraphQL / recherche | GraphQLController 59% | 59% | ✅ | S |

---

## Top des risques (critique × peu couvert)

Priorité décroissante — code sensible avec couverture quasi nulle :

1. **`PaymentClient` (2,5 %)** — flux de paiement / monétisation Stripe.
2. **`OAuth2Support` / `OAuth2Config` (0 %)** — authentification OAuth2 backend.
3. **`ApiKeySecretRotationJob` (1,4 %)** — rotation des secrets de clés d'API.
4. **`SessionController` (2,6 %) + `LoginController` (13,6 %)** — sessions, reset mot de passe, 2FA.
5. **`AccountCreationService` (0 %)** — création de compte (validé e2e seulement).
6. **CMS / Assets / Traductions (≈ 0 %)** — `CmsApiController`, `AssetsService`, `TranslationsService`.
7. **`OtoroshiEntitiesVerifierJob` (2,2 %)** + **import/export d'état `StateController` (6,3 %)**.

## Notes méthodologiques

- Les `*AdminApiController` sont globalement bien couverts (76-95 %) grâce à `AdminApiControllerSpec`
  (193 tests) : la **CRUD** de la doc, posts, issues, plans, traductions, audit est testée même quand
  l'**UI** correspondante ne l'est pas (skips Playwright liés à l'éditeur CodeMirror).
- Les chemins **e2e** désactivés (éditeur CodeMirror, suivi de liens mail) sont des trous
  **structurels** côté front, indépendants de la couverture backend.
- Plusieurs flux à **0 % backend** (OIDC, création de compte, invitations) sont en réalité couverts
  **uniquement** par Playwright — ne pas conclure « non testé » sans regarder la colonne Source.
- Couverture régénérable via : `sbt clean coverage test coverageReport`
  → `daikoku/target/scala-3.8.2/scoverage-report/index.html`.
