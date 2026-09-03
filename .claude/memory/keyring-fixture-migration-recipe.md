---
name: keyring-fixture-migration-recipe
description: "Recette de migration d'une fixture de test ApiSubscription vers le modèle Keyring (champs apiKey/integrationToken/bearerToken déplacés)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ac0c6559-0d60-41e0-88a1-4ddb0c5f6892
---

Pour chaque fixture de test backend qui construit un `ApiSubscription(...)` :

1. **Vire de la sub** les champs `apiKey`, `integrationToken`, `bearerToken`, `rotation` (ils n'existent plus sur `ApiSubscription`).
2. **Si la sub n'a pas de keyring déjà associé dans la fixture**, créer un `val keyring = Keyring(...)` JUSTE AVANT la sub, en y mettant les valeurs qu'avaient les champs supprimés (apiKey, integrationToken, rotation, bearerToken). Le keyring a aussi besoin de `team` (= sub.team), `tenant`, `otoroshiSettings` (`KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi)` ou `.Internal` pour les API admin), `createdAt`.
3. **Sur la sub**, ajouter `keyring = keyring.id` (le champ `keyring: KeyringId` de `ApiSubscription` est obligatoire).
4. **Dans le `setupEnvBlocking` qui suit**, ajouter le keyring à `keyrings = Seq(...)` (cf. [[feedback-keyring-fixtures]]).

**Why:** Steps 2+3+4 de la [[keyring-migration]] ont déplacé `apiKey`/`integrationToken`/`bearerToken`/`rotation` de la sub vers le `Keyring`. La sub porte un `keyring: KeyringId` obligatoire. Les valeurs d'origine ne doivent pas être perdues — elles vivent maintenant sur le keyring.

**How to apply:** À appliquer SYSTÉMATIQUEMENT sur chaque fixture des specs de tests. Ne pas faire de `replace_all` qui supprime sans recréer le keyring. Si une fixture a déjà un `val keyring = Keyring(...)` local (cas des agrégats déjà migrés), juste s'assurer qu'il a `team`, `integrationToken` et `rotation` correctement définis.

**Pattern pour les anciens keyrings d'agrégat à compléter** :
- `team = <parentSub.team>` (souvent `teamConsumerId`)
- `integrationToken = "<parentSub_integrationToken>"` (typiquement `"parent_token"`)
- `otoroshiSettings = KeyringOtoroshiBinding.Otoroshi(containerizedOtoroshi)` (wrap au lieu de la valeur brute)

**Correspondance des champs à migrer** (3 champs sub → 3 champs keyring + rotation) :
- `sub.apiKey` → `keyring.apiKey`
- `sub.integrationToken` → `keyring.integrationToken`
- `sub.bearerToken` → `keyring.bearerToken`
- `sub.rotation` → `keyring.rotation`

Quand on enlève un de ces champs d'une sub dans une fixture, la valeur DOIT apparaître sur le keyring associé. Si elle n'est pas là, on ne supprime pas — on la met d'abord sur le keyring.

Pour les agrégats 4-sub avec consumerKeyring + ownerKeyring :
- `consumerKeyring.team = teamConsumerId` + `integrationToken = "parent_token"` (parent consumer)
- `ownerKeyring.team = teamOwnerId` + `integrationToken = "parent_owner_token"` (parent owner)

ATTENTION : ne JAMAIS faire de `replace_all` qui supprime des `apiKey/integrationToken/rotation = ...` lignes sans s'être assuré que la valeur est portée par le keyring associé. C'est de la migration de données, pas de la suppression.

**Attention sur `keyring.id` sur la sub** : ce n'est PAS un champ "keyring" sur le Keyring (la `Keyring` case class n'a pas de champ keyring). C'est le FK `keyring: KeyringId` SUR `ApiSubscription` qui pointe vers la Keyring.
