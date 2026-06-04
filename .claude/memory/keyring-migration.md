---
name: keyring-migration
description: In-progress refactor migrating Daikoku api-key aggregation from the parent-subscription model to a new Keyring entity
metadata: 
  node_type: memory
  type: project
  originSessionId: ac0c6559-0d60-41e0-88a1-4ddb0c5f6892
---

Daikoku migration : remplacer le modèle d'agrégation de clés `ApiSubscription.parent`
par une entité **`Keyring`** (trousseau). Plusieurs souscriptions partagent un même `Keyring`
qui porte la clé Otoroshi ; la clé unique est recalculée à la volée. Supprimer une souscription
ne fait que retirer une référence — plus de « promotion d'enfant en parent ». **TOUTE** souscription
porte un `keyring: KeyringId` obligatoire (admin incluse, avec `KeyringOtoroshiBinding.Internal`).

**Branche** : `feature/keyring-aggregation`.

**Étapes effectuées (main code compile au 2026-06-04)** :
- Step 1 ✅ : enum `KeyringOtoroshiBinding` (`Otoroshi(id)` / `Internal`)
- Step 2-3-5 ✅ : keyring obligatoire (non-Option) sur sub, suppression de `apiKey` / `bearerToken` / `integrationToken` de `ApiSubscription` (migrés sur `Keyring`)
- Step 4 ✅ : `rotation` aussi déplacé de sub vers `Keyring`
- Bonus ✅ : ajout `Keyring.team: TeamId` (un keyring appartient à 1 team)
- `asAuthorizedJson(keyring, ...)` et `asSafeJson(keyring)` adaptés pour exposer le keyring dans le JSON
- `regenerateApiKeySecret` → `regenerateKeyringSecret(keyringId, team, user)` ; route `/api/teams/:teamId/keyrings/:id/_refresh` ; notif `ApiKeyRefreshV2.keyring`
- `OtoroshiSynchronizerJob.SubscriptionForSync` perd son `apiKey` ; les méthodes du `Child` prennent `keyringApiKey`
- `deleteApiKey` (legacy) supprimé ; `initSubscriptions` / `subscriptionsInit` supprimés ; `evolution_1840_c` neutralisé

**EN COURS (au 2026-06-04, ~1589 erreurs de test)** : adaptation des fixtures de tests.
- ✅ `suites.scala` : `adminApiKeyring` ajouté à côté de `adminApiSubscription`
- ✅ `AdminApiControllerSpec.scala` : toutes fixtures migrées (compile OK)
- 🚧 `ApiControllerSpec.scala` : ~1589 erreurs restantes. Bulk déjà appliqués : suppression `apiKey = parentApiKey,` / `apiKey = parentApiKeyWith2childs,` / `apiKey = OtoroshiApiKey("name", "id", "secret"),` / `rotation = None,` / `integrationToken = "child_token",` / `integrationToken = "parent_owner_token",` des subs. Migration faite sur la plupart des Keyring(...) existants pour ajouter `team`, `integrationToken`, wrap `otoroshiSettings`.
- **À FINIR sur ApiControllerSpec** : virer les `integrationToken = "parent_token",` / `integrationToken = "test",` (avec virgule, dans les subs) — ils sont déjà migrés sur les keyrings ; verifier les sub-only fixtures restantes ; corriger les utilisations `parentSub.apiKey` qui pointent vers `keyring.apiKey` quand le scope local le permet (déjà bulk replacé).

Voir [[keyring-fixture-migration-recipe]] pour la recette de migration de fixture.
Voir [[feedback-keyring-fixtures]] pour le rappel du pairing `val keyring` + `keyrings = Seq(...)`.

Voir [[daikoku-build]] et [[working-style]].
