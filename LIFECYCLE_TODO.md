# Reste à faire — gestion du cycle de vie des API (post-merge keyrings)

## Contexte

La branche `feat#800/api-lifecycle-management` (fusionnée) a introduit le cycle de vie des API
(`ApiState`: `Created → Published → Deprecated → Blocked`) avec transitions gardées, notifications
et mails de dépréciation/blocage. Elle a été **écrite avant la feature keyring** : à l'époque chaque
`ApiSubscription` portait sa propre clé Otoroshi (`apiKey`). Depuis, la clé technique a migré sur le
`Keyring` (clé unique partagée par N souscriptions). Résultat : le service de cycle de vie ne
compile plus contre le modèle actuel et n'intègre pas du tout les keyrings.

Design retenu (validé) : **bloquer une API = discard des droits de ses souscriptions sur le
keyring, sans supprimer la souscription** (rollback possible). Le levier est un **état intermédiaire
par souscription** (`ApiSubscriptionState` : `Active`/`Blocked`), modifiable par les admins de l'API
souscrite, et réutilisable pour toggler une souscription depuis l'UI de visualisation des
souscriptions.

Fichier cœur : `daikoku/app/fr/maif/daikoku/services/ApiLifeCycleService.scala` (432 lignes).

---

## A. Correctness backend — bloquant, à faire en premier

1. **Compile cassé** — `ApiLifeCycleService.scala:419` : `subs.map(_.apiKey.clientId)`. Le champ
   `apiKey` n'existe plus sur `ApiSubscription` (déplacé sur `Keyring`,
   `apikeyEntities.scala:127-157`). Ce fichier ne compile pas → **vérifier avec `sbt Test/compile`
   dans `daikoku/`**, la CI est probablement rouge. La correction découle de la section B (on ne
   patche plus Otoroshi en direct).
2. **Bug type** — `ApiLifeCycleService.scala:78` (`handleApiDeblocking`) : `"enabled" -> api.state.name`
   écrit la **String** `"published"` dans le champ **booléen** `enabled`. À supprimer (le déblocage
   passe désormais par `state = Active` + resync, cf. B).
3. **Match non exhaustif** — `json.scala:2654-2658` : `ApiSubscriptionStateFormat.reads` ne gère que
   `"active"`/`"blocked"` → `MatchError` sur toute autre valeur (aujourd'hui masqué par un `Try`
   englobant). Ajouter un cas par défaut (fallback `Active` ou `JsError`).

## B. Intégration keyring (le vrai trou fonctionnel)

Principe : `ApiLifeCycleService` ne doit plus toucher Otoroshi lui-même. Il mute l'état des
souscriptions puis laisse `otoroshiSynchronisator.run(api.id, tenant)` (déjà appelé juste après
`handleApiLifeCycle` dans `ApiController.updateApi:3113-3114`) recalculer les clés des keyrings.

1. **`state` devient le filtre de contribution au keyring.** Dans
   `ApiService.computeApiKeyFromSubscriptions` (~`ApiService.scala:482-613`), le merge ne retient
   aujourd'hui que `subscriptions.filter(_.subscription.enabled)` (l.595). Ajouter la condition
   `state == ApiSubscriptionState.Active` : une souscription `Blocked` ne contribue plus ses
   droits/quotas/metadata à la clé partagée → droits « discardés » sans suppression.
   - Bien vérifier la sémantique **keyring partagé** : un keyring peut agréger des souscriptions de
     **plusieurs** API. Bloquer une API ne doit retirer que la contribution de SES souscriptions ;
     les souscriptions d'autres API encore `Active` gardent leurs droits. Le filtrage par
     souscription (et non `keyring.enabled` global) garantit ça.
   - Cas keyring vidé : si toutes les souscriptions d'un keyring deviennent `Blocked`, la clé
     recalculée se retrouve sans droits → l'accès est coupé. Vérifier que le synchronizer gère la
     clé « vide » (désactivation) proprement. **Ne pas** supprimer le keyring (contrairement à
     `DeletionService.deleteSubscriptions` → `deleteKeyringIfEmpty`) : la souscription reste, donc le
     keyring reste.
2. **`handleApiBlocking`** (`:162-229`) : garder le `$set state = "blocked"` sur les souscriptions de
   l'API, **supprimer** le bloc `disableOtoroshiApiKey`/`_.apiKey.clientId` (l.410-431 + appel l.226)
   et les `AppLogger.warn` de secours (l.214-225). Garder `manageApiDefaultVersion`, les
   notifications et mails. Retirer le TODO l.188.
3. **`handleApiDeblocking`** (`:61-124`) : `$set state = "active"` uniquement (retirer `enabled`),
   supprimer tout le bloc Otoroshi commenté (l.90-121). Le resync post-updateApi ré-inclut les
   souscriptions `Active`.
4. **Honorer `KeyringOtoroshiBinding.Internal`** (`apikeyEntities.scala:123-125`) : pas d'appel
   Otoroshi pour ces keyrings — déjà géré par le synchronizer/`toggleKeyringState`, donc automatique
   si on délègue au synchronizer.

## C. Câbler `ApiSubscriptionState` de bout en bout

Aujourd'hui `state` (`apikeyEntities.scala:76`) est écrit en raw `$set` mais : absent de
`ApiSubscriptionFormat.writes` (`json.scala:2448-2497`) → **réécrasé à `Active` au prochain
`save()`** ; absent de GraphQL ; absent des types TS.

1. **JSON** : ajouter `"state" -> state.name` dans `ApiSubscriptionFormat.writes`, et lecture déjà
   présente (`json.scala:2437-2439`). Sans ça, tout le mécanisme de blocage est volatile.
2. **GraphQL** : exposer `state` sur `ApiSubscriptionType` (`SchemaDefinition.scala:1694-1791`).
3. **Frontend types** : ajouter `state: 'active' | 'blocked'` à `IBaseSubscription`
   (`daikoku/javascript/src/types/api.ts:360-381`) — hérité par `ISubscription`/`ISafeSubscription`/etc.
4. **UI** : badge d'état par souscription. Décommenter/finir les tags par souscription dans
   `ApiList.tsx:132-147` et/ou afficher le badge dans la vue de gestion des souscriptions.

## D. Toggle d'une souscription par l'admin de l'API (nouvelle capacité)

Réutiliser `ApiSubscriptionState` comme levier manuel :

1. **Endpoint backend** : nouvelle route + action (`ApiController`) pour basculer `state` d'une
   souscription (`Active`↔`Blocked`), puis `otoroshiSynchronisator.run`. S'inspirer de
   `toggleKeyringState` (`ApiService.scala:655-693`) / `toggleKeyring`
   (`ApiController.scala:2394-2406`) et de `toggleApiKeyRotation` (`:2342-2373`).
2. **Autorisation** : accessible uniquement aux **admins de l'API souscrite** (équipe productrice),
   pas au consommateur — reprendre le pattern d'autorisation existant sur les endpoints d'API.
3. **UI** : bouton toggle dans la vue de visualisation des souscriptions, branché sur l'endpoint.
4. **Relation `enabled` vs `state`** : à clarifier à l'implémentation — `enabled` est le toggle
   existant (côté consommateur), `state` le levier producteur/lifecycle. Le merge (B.1) doit
   considérer une souscription contributive ssi `enabled && state == Active`. Éviter d'introduire
   deux sources de vérité contradictoires ; documenter la règle retenue.

## E. Nettoyage & tests

1. **Fichiers fantômes vides, git-trackés à un mauvais chemin** (0 octet, à supprimer) :
   - `daikoku/test/daikoku/ApiLifeCycleSpec.scala`
   - `daikoku/app/services/ApiLifeCycleService.scala` (le vrai est
     `daikoku/app/fr/maif/daikoku/services/ApiLifeCycleService.scala`)
2. **Playwright cassé** — `daikoku/javascript/tests/specs/api_lifecycle.spec.ts` : ~17 assertions
   écrites `expect(...).toBeVisible;` (accès propriété, `()` manquants) → **no-op, n'assertent rien**
   (l.68, 82, 85, 113, 123, 130, 132, 157, 192-239 ; certaines `;;`). Corriger en `.toBeVisible()`.
   Corriger aussi le titre typo/dupliqué l.252 (« pass vdvto Blocked ») et le vocabulaire « Draft »
   (aucun état `draft` dans `ApiState`).
3. **Tests Scala** : dans `daikoku/test/fr/maif/daikoku/usages/ApiLifeCycleSpec.scala`, décommenter /
   écrire le cas `"when blocking aggregated ApiKey"` (l.293) — **le porter sur le modèle keyring** :
   vérifier que bloquer une API discard bien la contribution au keyring partagé sans supprimer la
   souscription, et que le déblocage la restaure (rollback). Ajouter un test du toggle par souscription
   (section D) et de son autorisation.
4. **`TEST_COVERAGE.md`** : mettre à jour les lignes deprecation/lifecycle (§3, §4, §5) et référencer
   `ApiLifeCycleService` / `ApiLifeCycleSpec`.

## Points à confirmer pendant l'implémentation

- Comportement exact d'une clé de keyring dont toutes les souscriptions deviennent `Blocked` (clé
  désactivée vs supprimée côté Otoroshi) — vérifier le chemin synchronizer.
- Règle finale `enabled` × `state` (D.4).

---

## Vérification (end-to-end)

1. `cd daikoku && sbt Test/compile` — doit repasser au vert (valide A.1).
2. `cd daikoku/javascript && npm run build` (tsc) — valide le type TS `state` (C.3).
3. `mise run test:back` — exécute `ApiLifeCycleSpec` (transitions + blocage keyring + toggle).
4. `mise run test:front:ldap` (ou oidc) — Playwright `api_lifecycle.spec.ts` avec assertions
   réellement actives.
5. Manuel (`mise run dev`) : souscrire 2 équipes à une API via un même keyring, bloquer l'API →
   vérifier que la clé Otoroshi partagée perd les droits des souscriptions bloquées mais reste pour
   les autres API du keyring ; débloquer → droits restaurés. Tester le toggle par souscription depuis
   l'UI en tant qu'admin de l'API.
