# Remote Catalogs — durcissement, validation CI, fédération

## Contexte

Les Remote Catalogs (portés d'Otoroshi, déjà sur master et dans `v19.0.0-rc.3`) synchronisent des entités Daikoku depuis
des fichiers YAML/JSON (file, http, github, gitlab). Le grill du 2026-09-18 a fait ressortir trois besoins :

1. **Sûreté** : aujourd'hui un YAML cassé, un doc sans `_id`/`kind` ou un fichier en 5xx est ignoré en `logger.warn`,
   son id manque dans `remoteIds`, et l'entité existante est **supprimée en dur avec cascade**
   (`RemoteCatalogEngine.scala:342-347`). Inacceptable : une entité ne doit jamais disparaître à cause d'un champ oublié.
2. **CI** : pouvoir valider les fichiers avant de les pousser, avec le contenu minimal par kind documenté, de façon
   maintenable et liée à l'`openapi.json` (aujourd'hui manuel, en 3.0.2, faux sur les `required`, 4 copies).
3. **Fédération et outillage** : un repo partagé par plusieurs équipes, un Resource Loader, des boutons Export, un form et
   un suivi de deploy corrects.

Résultat attendu : un moteur « tout ou rien » façon Pulumi, des schémas publiés et testés, des contraintes composables
pour la fédération, et une UI améliorée pas à pas, sans usine à gaz.

Règles de travail : éditions via `dev-bro`, specs Scala ET Playwright par lot, `QUERY_KEYS` centralisées, repo en anglais,
pas de trailer co-author. Légende : ⬜ à faire · 🔧 en cours · ✅ fait.

## Repères code

- Moteur : `daikoku/app/fr/maif/daikoku/services/catalog/RemoteCatalogEngine.scala`
- Parsing : `services/catalog/RemoteEntity.scala` ; listing / globs : `services/catalog/sources/SourceUtils.scala`
- Sources : `services/catalog/sources/CatalogSource{File,Http,Github,Gitlab}.scala`, registre `CatalogSources.scala`
- Upsert générique à réutiliser : `utils/admin.scala` (`reconcileUpsert`, l.273-312) ; `fromJson` / `validate` par kind dans
  `controllers/AdminApiController.scala` ; table kind → controller dans `RemoteCatalogEngine.scala:74-81`
- Entité : `domain/tenantEntities.scala:763-781`, Formats `domain/json.scala:5325-5406`
- Job : `jobs/RemoteCatalogJob.scala`, config `conf/base.conf:283-293`
- Routes : `conf/routes` 280-283 (UI), 327 (`_sync`), 373-377 (admin-api)
- Chiffrement existant : `utils/Cypher.scala` + `cypherSecret` ; YAML serveur : `utils/Yaml.scala`
- Front : `javascript/src/components/adminbackoffice/tenants/forms/RemoteCatalogsForm.tsx`, `src/constants/queryKeys.ts`,
  `CodeInput` de react-forms déjà utilisé (`TeamApiSwagger.tsx`), lib `yaml` déjà en dépendance
- OpenAPI : `daikoku/public/swaggers/admin-api-openapi.json`, servi par `AdminApiSwaggerController`
- Référence Otoroshi : `~/Documents/opensource/otoroshi` — `app/next/catalogs/`, `javascript/src/pages/ResourceLoaderPage.js`,
  `components/inputs/Table.js:645-687`
- Checklist d'ajout d'entité : skill `add-entity` (table dédiée du lot 2)

## Lot 1 — Moteur sûr

- ✅ Run en phases : 1 fetch + parse (sans base), 2 validation complète (lit la base, n'écrit jamais), 3 écriture.
  Toute erreur de phase 1 ou 2 → rien n'est appliqué. Les sources remontent une erreur au lieu de `Seq.empty` pour :
  fichier illisible, YAML cassé, doc sans `_id`/`kind`, sous-fetch en échec (listing tronqué → voir pagination).
  Moteur découpé en sections (Entry points / Phase 1 / Orchestration / Phase 2 / Phase 3 / Undeploy / Audit).
- ✅ Application séquentielle (`runOneByOne`) dans l'ordre des dépendances, écritures puis suppressions en ordre
  inverse. Première erreur → arrêt, aucune suppression, rapport `status: partial`. Pas de rollback.
- 🔧 `_id` requis ✅ ; `_tenant` requis et égal au tenant du catalog ⬜.
- ✅ Entité existante non possédée par le catalog → erreur de validation (`prepareWrite`).
- ✅ Références dans le run : `ReconcileFinalIds` = (base − suppressions) + run ; `validateForReconcile` / `ReadEntitiesFrom`
  sur api et api-subscription ; dry-run fiable. Validation = ~10 requêtes fixes (projection `_id`/`metadata` + `$in`).
- ✅ Erreurs accumulées sur tout le run. JsPath dans les erreurs `fromJson` → reporté au lot 3 (les `Format` écrits à la
  main aplatissent l'erreur en texte ; reformater côté controller jugé bancal, réécrire les `Reads` trop gros ici).
- ✅ `_tenant` requis et égal au tenant du catalog (`checkTenant`, phase 1).
- ✅ Metadata : `withCreatedByMetadata` garde tout le doc ; `readTextMetadata` (team, api, usage-plan, cms-page) garde les
  valeurs texte au lieu de tout jeter. Décisions : run `partial` = échec du job ; message « could not be read ».
- ✅ Pagination GitLab (arbre, dossier, projets de groupe) et GitHub (repos d'org) via `SourceUtils.fetchAllPages` ;
  arbre GitHub `truncated` et dossier ≥ 1000 entrées → erreur. Non couvert par des specs (pas de faux serveur).
- ✅ Orphelins nettoyés aussi quand un kind disparaît entièrement ; échecs de suppression remontés (`doDeleteById` →
  `Either`, `already-deleted` toléré).
- ✅ `withCreatedByMetadata` (ex-`enrichWithMetadata`) ne détruit plus les metadata existantes.
- ✅ Garde-fou `maxDeletionPercent` par catalog (défaut 30, -1 = illimité, ignoré sous 5 entités gérées). Dépassé → le
  run échoue en phase 2 avec l'erreur, rien n'est appliqué ; l'utilisateur ajuste et relance. **Pas de flux de
  confirmation** (décision du 2026-09-29). Champ dans le form UI + i18n.
- 🔧 Sécurité : ✅ `file` / `pre_command` désactivés par défaut (`daikoku.remoteCatalogJob.allowFileSource` /
  `allowPreCommand`, activés dans `test/resources/application.conf`) ; ✅ corps d'erreur distant non renvoyé ;
  ✅ allowlist d'hôtes (`allowedHosts`, liste HOCON ou CSV par env, `SourceUtils.checkHostAllowed` avant tout appel
  réseau dans http/GitHub/GitLab, spec 127.0.0.1 refusé) + fix du verrou `TrieMap` fuité sur exception synchrone
  (`Future.unit.flatMap`) ; ~~`maxFileSize` / `maxFiles`~~ abandonné le 2026-09-30 (pas de faille : le repo est
  déjà de confiance, risque d'accident mémoire seulement → idée non planifiée).
- ✅ Suppression de `args`, `deployArgs`, `testDeployArgs` (+ `webhookDeployExtractArgs`, `parse.json` des routes
  admin-api `_deploy` / `_test`). Anciennes clés en base ignorées à la lecture, effacées au prochain enregistrement.
- ⬜ Manuel (`manual/docs/02-usages/08-tenantusage/8-remote-catalogs.md`) et entrée dans `docs/DOMAIN.md` — reporté
  après la partie technique (2026-09-30). Écarts relevés : docs invalides « ignorés » (faux, le run échoue), exemples
  sans `_tenant`, rapport → tiroir, tout-ou-rien, `maxDeletionPercent`, dossier non récursif, flags
  `allowFileSource` / `allowPreCommand` / `allowedHosts`, historique 20 runs, admin-api CRUD + actions.
- Specs Scala : 23 unitaires + 23 intégration au vert (dont même run en dry-run, ref vers entité supprimée,
  non possédée, kind retiré, dossier avec un fichier invalide). ⬜ Playwright du lot 1.
- Points ouverts : run `partial` compté `succeeded` par le job (proposé : `failure`) ; message « could not be fetched »
  aussi pour un YAML cassé ; tenant relu en base par chaque `validate` ; cas API + plan retirés ensemble non testé.

## Lot 2 — Table dédiée, runs asynchrones, UI étape 1

- 🔧 `RemoteCatalog` en table dédiée tenant-scopée + CRUD (UI + admin-api). Pas de migration ni de legacy (personne
  n'utilise encore les catalogs, décision du 2026-09-30) : `tenant.remoteCatalogs` disparaît. Fait : `RemoteCatalogId`,
  `_id`/`_tenant` dans le JSON, table `remote_catalogs` (export/import, index), admin-api CRUD générique, routes UI
  list/create (id généré serveur, `_tenant` imposé)/update/delete, job et moteur sur le repo (`catalog.id.value`
  partout), form UI via API + `QUERY_KEYS`, erreurs d'enregistrement dans la modale (`FormModal` async) et bandeau
  fermable (`DismissibleError`), historique en panneau repliable mis en cache (⟳), `select` au lieu de `buttonsSelect`,
  specs existantes sur fixture `setupEnv(remoteCatalogs)`. Pas de `_deleted` (fin des suppressions logiques dans
  Daikoku) : `validate` refuse un id déjà pris dans n'importe quel tenant (409), `doDelete` toujours physique.
  Compile OK (back + `tsc`). `RemoteCatalogControllerSpec` : 7 specs CRUD admin-api + back-office. `testOnly` des 4
  specs catalogs : 36/36 (1 aléa du premier test au premier run, vert en relance seule). ⬜ Reste : Playwright.
- ✅ Runs persistés (décision du 2026-09-30, simplifiée ; 3 specs historique, 39/39 sur les 4 specs catalogs) : table `remote_catalog_runs`, une ligne par deploy / undeploy
  (pas de dry-run) : date, statut `completed` / `partial` / `failed` (failed = rien appliqué), compteurs créés / mis à
  jour / supprimés (ids), erreurs (fichier + message). Pas de phase. Rétention : 20 derniers runs par catalog. Le run dit
  ce qui s'est passé, l'audit dit qui l'a lancé : audit du moteur supprimé (plus de `pruneAudit`), controllers UI et
  admin-api (`_deploy` / `_test` / `_undeploy` ajoutés) auditent, le job audite chaque catalog lancé via
  `JobUtils.jobUser`. `history` (endpoint à part) lit la table ; la liste reste la liste des catalogs.
- ⬜ Verrou en base via le run en cours (remplace le `TrieMap`).
- ✅ UI S1 (réduite le 2026-09-30) : deploy / undeploy ouvrent le tiroir « Dernières exécutions » (tiroir partagé
  `RightPanel` corrigé : tailles en % pour react-resizable-panels v4) rechargé à l'ouverture puis toutes les 10 s ;
  dry-run renvoie la même forme qu'un run (non stocké, 400 si `failed`) affichée avec `HistoryRuns` ; undeploy
  confirmé ; plus aucun toast ; aide `path` avec exemples, aide `maxDeletionPercent` avertit des suppressions ; `select`
  simple / multi ; menu d'actions en `position: fixed` ; 5 clés i18n mortes supprimées. Écartés : sections du form,
  exemple de doc (→ manuel), token masqué, dernière synchro dans la liste.

## Lot 3 — Schémas et CI

- ✅ OpenAPI + garde-fous. Source unique `daikoku/public/swaggers/admin-api-openapi.yaml` en 3.1.0 (copiée vers
  `manual/static/openapi/` par `update-dev-manual.yml`, version = `BuildInfo.version`). `OpenApiContractSpec`
  (`networknt json-schema-validator` 3.0.7 en Test) : par kind (`Team`, `UsagePlan`, `Api`, `ApiSubscription`,
  `CmsPage`, `Keyring`, `RemoteCatalog`), entité complète → `toJson` valide avec `additionalProperties: false`, exemple
  minimal publié dans `examples` (= `required`) passe `fromJson`, chaque `required` retiré fait échouer `fromJson` ;
  garde-fou routes `/admin-api/*` ⇄ paths (47 paths). Test d'intégration : les exemples minimaux passent `_validate`.
  `/paymentSettings` laissé à la branche Stripe (`pendingDrifts`). Optionnel : convertir les 35 anciens paths au style
  factorisé (`components.responses` / `components.parameters.id`).
  ~~`CatalogSchema` (JSON Schema autonome des fichiers de catalog, pour ajv / éditeur)~~ abandonné le 2026-09-30 : un
  second validateur, plus faible que le moteur (structure seule), à garder aligné ; la CI appelle `_validate` avec le
  token du catalog → idée non planifiée.
- 🔧 `POST _validate` : entrée `{path, content}[]` = le catalog complet (comme un deploy) ; même contrôle qu'un dry-run
  (moteur factorisé), réponse = forme d'un run (400 si `failed`). Daikoku ne fetch jamais autre chose que sa branche
  configurée. Auth (décision du 2026-09-30) : token par catalog (généré à la création, régénérable, visible par
  l'admin du tenant), header `Bearer`, routes `/api/remote-catalogs/:id/_validate|_test|_deploy|_undeploy`, aucun
  accès à l'admin-api ; `_validate` aussi sur l'admin-api (pour le futur Resource Loader). Fait : moteur
  (`checkAndReconcile` factorisé, `validate`, `CatalogFile.readAll`), champ `token` (jamais pris du corps : forcé à la
  création, conservé à la mise à jour, côté UI et admin-api), `RemoteCatalogTokenController` (Bearer, comparaison à
  temps constant, audit `User.system`), `_regenerate-token` back-office, panneau « Token CI » (copie http/https via
  `copyToClipboard`, régénération confirmée, exemple curl), 6 specs (45/45). Piège trouvé : les routes token résolvent
  le tenant par le `Host`, la fixture `otherTenant` doit avoir son propre `domain`. ⬜ Reste : GraphQL — vérifier que
  `token` n'est exposé nulle part (aujourd'hui aucun type GraphQL pour RemoteCatalog).
- ⬜ Page du manuel : contenu minimal + complet par kind (repris des `examples` de l'OpenAPI), snippet CI
  `curl _validate` avec le token du catalog.
- ~~Vérifier le YAML multi-documents avec ajv / check-jsonschema~~ sans objet depuis l'abandon du schéma autonome
  (2026-09-30).
- Plus tard : `daikoku catalog validate` dans le CLI Rust.

## Lot 4 — Resource Loader et export

- ⬜ Resource Loader (menu utilisateur, hors réglages tenant) : drop / coller, liste des docs détectés (kind, nom, valide ou
  non, erreurs par chemin JSON). Même moteur que `_validate`. Structurel pour tout connecté, référentiel pour les admins.
- ⬜ Export YAML / JSON : enveloppe `apiVersion: daikoku.io/v1` / `kind` / `spec` pour les deux, générée côté serveur depuis
  le `toJson` de l'admin-api (un seul chemin d'écriture et de lecture). Test de contrat : tout export repasse par
  `_validate`. Visible par ceux qui peuvent éditer l'entité. Écrans d'édition de team, api, usage-plan, api-subscription,
  keyring, cms-page.
- Second temps : bouton d'import depuis le loader.

## Lot 5 — Fédération (contraintes composables, rien de codé en dur)

- ⬜ `recursive` sur le mode dossier ; listing confiné (pas de `../`, rien hors du `path` du catalog).
- ⬜ `allowedTeams` : toute entité doit appartenir à (ou être) une de ces teams. Un usage-plan est rattaché à la team de
  l'API qui le référence ; cms-page refusée dès qu'il y a une contrainte de team.
- ⬜ `folder_per_team` (config du catalog, pas dans le listing) : `<root>/<teamId>/**` impose `team == teamId` (un doc `team`
  doit avoir `_id == teamId`) ; pas de cms-page dans un dossier de team ; fichiers directement dans `<root>/` = niveau
  tenant, sans contrainte de team ; sous-dossier sans team correspondante → erreur.
- ⬜ `allow_deletions` (défaut true) : à false, une entité retirée du repo reste en vie, garde son tag, est listée comme
  orpheline dans le rapport ; suppression par les écrans habituels.
- ⬜ Kind `keyring`.

## Lot 6 — Reste

- ⬜ Webhook : URL par catalog + secret généré ; `X-Hub-Signature-256` (GitHub), `X-Gitlab-Token` (GitLab) ; déclenche
  uniquement un deploy de la branche configurée.
- ⬜ Suppression d'un catalog : proposer undeploy ou détachement (retrait du tag).
- ⬜ UI S2 : bloc CI (token de validation, URL + secret webhook, snippets) + « Tester la connexion ».
- Idées notées, non planifiées : page dédiée à onglets, vue des entités gérées / orphelins, flag `adopt_existing`,
  sources différées (s3, consulkv, bitbucket, gitea / forgejo / codeberg, git), limites `maxFileSize` / `maxFiles`
  (robustesse mémoire si un gros fichier est commité par erreur).

## Vérification

- Par lot : `mise run test:back` (specs Scala) et `mise run test:front:ldap` (Playwright), plus `npm run lint` et
  `npm run build` dans `daikoku/javascript`, `sbt compile` côté back.
- Lot 1, cas à couvrir en spec : YAML cassé / doc sans `_id` / fichier en échec dans un dossier → rien n'est créé, modifié
  ni supprimé ; `_tenant` étranger → erreur ; id d'une entité non possédée → erreur ; api + plan dans le même run en
  dry-run → pas de faux négatif ; dépassement du garde-fou → run bloqué ; listing GitLab > 100 fichiers.
- Lot 3 : le test de contrat casse si un Format change sans l'OpenAPI ; `check-jsonschema` sur les exemples du manuel.
- Lot 4 : un export de chaque kind repasse par `_validate` sans erreur.
- Manuel : `mise run dev`, configurer un catalog http sur les fixtures de `test/resources/remote-catalog-http-fixtures/`,
  casser un fichier, vérifier que rien ne bouge et que la modale de suivi montre le fichier et le chemin en erreur.

## Ménage à faire à l'approbation

Un doublon de ce plan a été écrit juste avant le passage en mode plan : `~/.claude/plans/remote-catalogs-hardening.md`,
et la note mémoire `remote-catalogs-hardening-plan.md` pointe dessus. À l'approbation : garder un seul fichier de plan et
faire pointer la mémoire (et `MEMORY.md`, pas encore mis à jour) dessus.
