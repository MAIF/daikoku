---
name: keyring-migration
description: Dossier complet du refactor Daikoku migrant l'agrégation de clés api-key du modèle ApiSubscription.parent vers une entité Keyring (carte des fichiers, signatures, recettes — pour ne rien re-scanner)
metadata: 
  node_type: memory
  type: project
  originSessionId: ac0c6559-0d60-41e0-88a1-4ddb0c5f6892
---

# Migration Keyring (Daikoku) — dossier complet

**But** : remplacer le modèle d'agrégation `ApiSubscription.parent` par une entité **`Keyring`** (trousseau).
Plusieurs souscriptions partagent un même `Keyring` qui porte la clé Otoroshi ; la clé unique est
recalculée à la volée. Supprimer une souscription ne fait que retirer une référence (plus de
« promotion d'enfant en parent »). **TOUTE** souscription porte un `keyring: KeyringId` obligatoire
(admin incluse, avec `KeyringOtoroshiBinding.Internal`).

**Branche** : `feature/keyring-aggregation`.

**ÉTAT (2026-06-04)** : main **et** tests compilent. `cd daikoku && sbt -batch "Test / compile"` = success.
Migration des fixtures de tests **terminée** (voir plus bas). Reste hors-scope : exécuter la suite
(testcontainers/Otoroshi) pour valider le runtime — jamais lancée. Rien n'est commité.

## Carte des fichiers (pour ne pas re-scanner)
- `daikoku/app/fr/maif/daikoku/domain/apikeyEntities.scala`
  - L119 `enum KeyringOtoroshiBinding: case Otoroshi(id: OtoroshiSettingsId) / case Internal`
  - L123 `case class Keyring(...)` — champs **requis** (sans défaut) : `id: KeyringId, tenant: TenantId, team: TeamId, apiKey: OtoroshiApiKey, otoroshiSettings: KeyringOtoroshiBinding, createdAt: DateTime, integrationToken: String`. Défauts : `deleted=false, customName=None, rotation=None, bearerToken=None, thirdPartySubscriptionInformations=None`.
  - L78 `def asAuthorizedJson(keyring: Keyring, permission: TeamPermission, planIntegration: IntegrationProcess, isDaikokuAdmin: Boolean): JsValue`
  - L92 `def asSafeJson(keyring: Keyring): JsValue` (⚠️ prend le Keyring en argument maintenant)
  - `ApiSubscription` n'a plus `apiKey/bearerToken/integrationToken/rotation` ; porte `keyring: KeyringId` (obligatoire).
- `daikoku/app/fr/maif/daikoku/domain/entities.scala` L47 `case class KeyringId(value: String)`
- `daikoku/app/fr/maif/daikoku/domain/json.scala` : `KeyringIdFormat` (L342), `KeyringFormat`, `KeyringOtoroshiBindingFormat` (L2468). `ApiSubscriptionFormat` : read `keyring = (json \ "keyring").as(using KeyringIdFormat)` (L2394), write `"keyring" -> KeyringIdFormat.writes(o.keyring)` (L2460).
- `daikoku/app/fr/maif/daikoku/domain/teamEntities.scala` L300 `case class ApiKeyRefreshV2(keyring: KeyringId, message: Option[String] = None)` (⚠️ signature changée).
- `daikoku/app/fr/maif/daikoku/storage/api.scala` : L498 `trait KeyringRepo extends TenantCapableRepo[Keyring, KeyringId]`, L606 `def keyringRepo: KeyringRepo`. Postgres : table `"keyrings"` (PostgresDataStore.scala L1413/1682), `keyringRepo` L665.
- Route : `daikoku/conf/routes:144` `POST /api/teams/:teamId/keyrings/:id/_refresh -> ApiController.regenerateKeyringSecret(teamId, id)`. Service `ApiService.regenerateKeyringSecret` (L611), controller `ApiController.regenerateKeyringSecret` (L2162). Notif `ApiKeyRefreshV2.keyring`.
- `OtoroshiSynchronizerJob.SubscriptionForSync` n'a plus `apiKey` ; les méthodes du `Child` prennent `keyringApiKey`.

## Changements de code de prod déjà faits
- Step 1 : enum `KeyringOtoroshiBinding` (`Otoroshi(id)` / `Internal`).
- Step 2-3-5 : keyring obligatoire (non-Option) sur sub ; `apiKey`/`bearerToken`/`integrationToken` retirés de `ApiSubscription`, déplacés sur `Keyring`.
- Step 4 : `rotation` aussi déplacé sub → `Keyring`.
- Bonus : `Keyring.team: TeamId` (un keyring appartient à 1 team).
- `regenerateApiKeySecret` → `regenerateKeyringSecret(keyringId, team, user)`.
- Supprimés : `deleteApiKey` (legacy), `initSubscriptions`/`subscriptionsInit` ; `evolution_1840_c` neutralisé.

## Migration des tests (TERMINÉE) — fichiers
- `suites.scala` : `adminApiKeyring` (global, semé par défaut, utilisé via `getAdminApiHeader(adminApiKeyring)`). `setupEnvBlocking(...)` a un paramètre `keyrings = Seq(...)`.
- `AdminApiControllerSpec` : 24 keyrings, tous appariés (sessions précédentes).
- `ApiControllerSpec` : 34 fixtures + 3 `.asSafeJson(keyring)`.
- `TeamControllerSpec`, `ConsumptionControllerSpec` (keyring de classe `payperUserKeyring`), `NotificationControllerSpec` (format custom local `ApiSubscriptionSafeFormat` réaligné sur `keyring`), `UserControllerSpec`.
- `DeletionServiceSpec` : helper `makeAllNotifs(...)` a reçu un param `keyring: Keyring` ; `NotificationAction.ApiKeyRefreshV2(...)` recâblé en `ApiKeyRefreshV2(keyring.id)`.
- `OtoroshiSyncSpec`.

## Recettes de migration de fixture (réutilisables)
1. **Sub fixture (données inline)** : retirer `apiKey`/`integrationToken`/`bearerToken`/`rotation` ; créer un `val keyring = Keyring(id=KeyringId("test-keyring"), tenant=tenant.id, team=<sub.team>, apiKey=<valeur d'origine>, otoroshiSettings=KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi) [ou .Internal pour admin], createdAt=DateTime.now(), integrationToken=<valeur d'origine>)` juste avant la sub ; mettre `keyring = keyring.id` sur la sub ; **TOUJOURS** ajouter `keyrings = Seq(keyring)` dans le `setupEnvBlocking` (cf. [[feedback-keyring-fixtures]]).
2. **Sub runtime** (parsée d'une réponse JSON, ou fetchée du repo) : on ne peut pas faire `sub.apiKey` → fetcher le keyring : `Await.result(daikokuComponents.env.dataStore.keyringRepo.forTenant(tenant).findById(sub.keyring), 5.seconds).get` puis `.apiKey`.
3. **Agrégat** (parent + enfants) : UN seul `val keyring` partagé ; parent ET enfants pointent `keyring = keyring.id` ; le keyring porte l'apiKey + l'integrationToken **du parent** ; le token de l'enfant est subsumé (perdu, c'est voulu).
4. **`.asSafeJson` / `.asAuthorizedJson`** sur une sub → passer le keyring : `sub.asSafeJson(keyring)`.
5. **Récupérer les valeurs d'origine** d'une sub (apiKey/integrationToken/rotation perdus) : `git show 87332a1aa~1:<path>` = version juste avant le commit « needs to update all tests ». Matcher par nom de test / id de sub.

## Pièges rencontrés
- Des keyrings créés en session précédente (Deletion/OtoroshiSync) étaient **malformés** : `otoroshiSettings = containerizedOtoroshi` (un `OtoroshiSettingsId` brut au lieu de `KeyringOtoroshiBinding.Otoroshi(...)`), et `team` + `integrationToken` (requis) manquants. À corriger.
- La compilation **incrémentale** révèle les erreurs par vagues (corriger un fichier en débloque d'autres) : itérer `Test / compile` jusqu'à 0.
- Vérifs finales utiles : `grep -c "val keyring = Keyring"` == `grep -c "keyrings = Seq"` par fichier ; scanner les `setupEnvBlocking` ayant `subscriptions =` sans `keyrings =` (sauf subs runtime / keyring global `adminApiKeyring` / blocs commentés).

Voir [[keyring-fixture-migration-recipe]], [[feedback-keyring-fixtures]], [[daikoku-build]], [[working-style]].
