---
name: keyring-frontend-and-tests
description: État de la migration Keyring côté frontend (vue conso keyring-centrique, modal, notifs, renommage) + bugs backend résiduels corrigés + CE QUI RESTE (surtout réécriture des tests e2e souscriptions au modèle keyring). Contexte complet pour reprendre sur un autre poste.
metadata:
  type: project
---

# Migration Keyring — Frontend + Tests (reprise)

**Branche** : `feature/keyring-aggregation`. Voir aussi [[keyring-migration]] (dossier backend/tests初), [[working-style]].

Contexte modèle : l'agrégation de clés se fait via une entité **`Keyring`** (trousseau). Une `ApiSubscription` porte `keyring: KeyringId` ; plusieurs subs partagent un keyring qui porte `apiKey`/`integrationToken`/`bearerToken`/`rotation`. Plus de `parent`/`aggregated` sur la sub. "Agrégé" = keyring partagé par > 1 sub (`subscriptionsCount > 1`).

## ÉTAT (session courante) — compile OK, testé en partie en live
- Backend `cd daikoku && sbt compile` = OK. Frontend `cd daikoku/javascript && npx tsc --noEmit` = 0 erreur (hors erreur préexistante `pg` dans `tests/specs-perf/perf.spec.ts`).
- **Rien n'est commité** au moment d'écrire (tout le travail de session est dans le working tree).
- Validé en live par l'utilisateur via l'app qui tourne : query `keyrings`, query producteur `apiApiSubscriptions`, notif refresh, notif accept.

## Bugs backend RÉSIDUELS de migration corrigés cette session
1. **`keyringsFetcher` non enregistré** dans `DeferredResolver.fetchers(...)` (`SchemaDefinition.scala` ~L4547) → toute résolution `keyring` plantait. Ajouté.
2. **`controlSubscriptionExtension`** (`services/ApiService.scala` ~L1946) comparait `plan.otoroshiTarget.otoroshiSettings` (Option[OtoroshiSettingsId]) avec `keyring.otoroshiSettings` (`KeyringOtoroshiBinding`) → toujours faux → `SubscriptionAggregationOtoroshiConflict` à CHAQUE join. Fix : déballer le binding (`case Otoroshi(id) => Some(id) / Internal => None`) puis comparer.
3. **`CommonServices.getApiSubscriptions`** (vue producteur) : SQL filtrait/triait sur `s.content -> 'apiKey' ->> 'clientName'`/`'clientId'` (apiKey retiré de la sub) → `COALESCE(adminCustomName, NULL) ~* ''` = NULL → **0 souscription remontée**. Fix : `LEFT JOIN keyrings k ON k._id = s.content ->> 'keyring'` (count + data) et `s.content -> 'apiKey'` → `k.content -> 'apiKey'`.
4. **`getOtoroshiUsage`** (`SchemaDefinition.scala` ~L1790) : Future en échec (Otoroshi injoignable) → "Internal server error" sur le champ `lastUsage`. Fix : `.recover { case _ => None }`.

## Ajouts backend cette session
- **Query racine GraphQL `keyrings`** (`SchemaDefinition.scala`) : `keyrings(id, teamId, version, filterTable, sortingTable, limit, offset)` → `KeyringListType { keyrings, total }`. Resolver `CommonServices.getApiKeyrings` = **une seule** requête SQL `queryRawMapped` (col `content` jsonb + `count(*) OVER()` pour total, `EXISTS` sur api_subscriptions). Auth `_TeamMemberOnly`.
- **`KeyringType` enrichi** : `integrationToken`, `subscriptions` (relation inverse via repo), `subscriptionsCount` (Int). (apiKey/rotation/bearerToken/otoroshiSettings/customName étaient déjà là.)
- **Renommage trousseau** : route `PUT /api/teams/:teamId/keyrings/:id/name` → `ApiController.updateKeyringCustomName(teamId, id)` (auth `TeamApiKeyAction`, trouve par `_id`+`team`, set `customName`, save, renvoie `keyring.asJson`).
- `ApiKeyRefreshV2` GraphQL : type keyring-based (expose `keyring` + `message`, PAS subscription/api/plan). `ApiKeyRotationInProgressV2`/`EndedV2` ont toujours `subscription` (avec `keyring` dedans).
- Note : `keyringSubscriptionsCount` avait été ajouté puis RETIRÉ de `ApiSubscriptionType` (doublon de `keyring.subscriptionsCount`).

## Frontend — état
- **Vue conso `TeamApiKeysForApi.tsx`** réécrite **keyring-centrique** : query GraphQL `getApiKeyrings` (plus de REST `getTeamSubscriptions`, plus de `detailQuery` par sub). Composant `KeyringCard` = **carte par keyring, pleine largeur** : en-tête (icône, nom = `customName ?? apiKey.clientName`, nb souscriptions, boutons credentials icônes, menu keyring) + **table** des souscriptions. Types locaux `IKeyringForApiGql` / `IKeyringSubscriptionGql` (exportés).
- **Service** `regenerateApiKeySecret(teamId, keyringId)` → `POST /keyrings/:id/_refresh` (keyring-based). Nouveau `updateKeyringCustomName(teamId, keyringId, customName)` → `PUT /keyrings/:id/name`. Nouveau `graphql.getApiKeyrings`.
- **Vue producteur `TeamApiSubscriptions.tsx`** : lit `row.keyring?.apiKey.clientName` + agrégé via `(sub.keyring?.subscriptionsCount ?? 0) > 1` ; regenerate via `sub.keyring!._id`. Badge "A" → icône `fa-link`.
- **Modal de souscription/agrégation renommée** : `ApiKeySelectModal` → **`KeyringSelectModal.tsx`** (`IKeyringSelectModalProps`, `openKeyringSelectModal`, type `IKeyringOption`). Affiche une carte par trousseau joignable (`.keyring-option`, CSS dans `style/components/modal.scss`) avec "Rejoindre ce trousseau". Le **filtrage des trousseaux joignables** est dans `ApiPricing.tsx` (`showKeyringSelectModal`) : groupé par keyring, gardé seulement si TOUS les membres compatibles (mêmes règles que backend `controlSubscriptionExtension` : même otoroshiSettings, même customName si env-security, readOnly uniforme). Query `apisByIdsWithPlans` enrichie de `otoroshiTarget.apikeyCustomization.readOnly`.
- **Souscription OK (`ApiHome.tsx` askForApikeys)** : sur `isCreationDone` → toast `subscription.created.success` + `navigate(/{teamConso}/{api}/{version}/apikeys)` (la route accepte une team arbitraire en 1er segment, cf `linkToChildren`). Plus de right panel.
- **Types `api.ts`** : `ISubscription.keyring` est maintenant l'OBJET `IKeyring` imbriqué (via `Omit<IBaseSubscription,'keyring'>`) car le REST `asAuthorizedJson` embarque le keyring. Retirés de la sub : `apiKey/integrationToken/bearerToken/rotation/aggregated`. Ajouté `IKeyring` + `apikeyCustomization.readOnly?`.
- **Notifications `NotificationList.tsx`** : fragments `getMyNotifications` (services) corrigés (refresh keyring-based ; rotation via `subscription.keyring`). Notif **`ApiKeyRefreshV2`** : description = message nommé (`notif.apikey.refresh` avec `%s`), **flèche dans la colonne action** (`actionFormatter`) → lien vers `/{team}/{api}/{version}/apikeys` (via `keyring.subscriptions[0]`) + croix (lire). Notif **`ApiSubscriptionAccept`** : pareil, **flèche en colonne action** vers la clé + croix (fragment enrichi des `_humanReadableId`). `SimpleApiKeyCard` lit via `subscription.keyring`.
- **Terminologie** nettoyée (fr+en) : modal ("Souscrire en l'ajoutant à un trousseau existant", "Aucun trousseau disponible", titre "Souscrire à l'API"), `subscription.extract.button.label` = "Détacher du trousseau" (avant "Extraire de l'agrégat"), `aggregated.apikey.badge.title` = "Clé partagée dans un trousseau". Clés ajoutées : `keyring.*` (rename/custom.name/actions.aria), `keyring_select_modal.{join,keys_count}`, `notif.apikey.refresh.see_keyring`, `notif.api.demand.accept.see_key`, `subscription.created.success`, `Valid until`, `subscription.actions.aria.label`.

## ⏳ CE QUI RESTE À FAIRE — surtout les tests e2e

### 1. Réécrire les tests e2e conso `daikoku/javascript/tests/specs/souscriptions.spec.ts`
Les tests conso supposent **une carte DOM par souscription** (sélecteurs `#dropdownMenuButton`, `.api-subscription` hasText 'prod'/'dev' = une sous, enfant agrégé = carte séparée). **Le nouveau modèle = une carte par keyring** avec les souscriptions dans une **table**. Donc à réécrire.

**Nouveau DOM `KeyringCard`** (pour écrire les sélecteurs) :
- Carte : `.api-subscription.keyring-card` (pleine largeur).
- En-tête : `.api-subscription__infos__name` (titre keyring) ; boutons credentials = icônes (aria-labels `subscription.copy.*.aria.label`) ; **menu keyring** = `<i class="dropdown-menu-button" id="keyring-dropdown-${keyring._id}">` → items : "Renommer le trousseau", "ApiKey rotation" (si `!aggregated && !disableRotation`), "Réinitialiser le secret".
- **Table** `.keyring-card__subscriptions` (`<thead>` Enabled/Subscription/Created at/Valid until/Tags) ; chaque souscription = `<tr>` :
  - statut : `.api-subscription__value__type` (point + "Activé"/"Désactivé").
  - nom `<strong>` + `<Link>` `{api.name}:{version}/{plan.customName}`.
  - **menu par sub** = `<i class="dropdown-menu-button" id="dropdown-${sub._id}">` → items : "Mettre à jour le nom perso.", "Transférer la souscription", "Activer/Désactiver la souscription", "Détacher du trousseau" (si agrégé), "Supprimer".

**Recette de migration des sélecteurs** (par test) :
- Carte : `page.locator('.keyring-card', { hasText: <clientName ou plan> })`.
- Sous-ligne : `card.locator('tbody tr', { hasText: 'dev' })` (au lieu de `.api-subscription` hasText 'dev').
- Statut : `row.locator('.api-subscription__value__type')` toContainText 'Activé'/'Désactivé'.
- Menu d'une sub : `row.locator('.dropdown-menu-button').click()` puis `row.getByText('Désactiver la souscription')` etc. (PLUS de `#dropdownMenuButton` ; 2 `.dropdown-menu-button` par carte : 1 en-tête keyring + 1 par sub → bien scoper à la `row` ou au header).
- Renommer keyring : menu en-tête → "Renommer le trousseau" → champ "Nom du trousseau".

**Tests concernés** (statut probable) :
- `ASOAPI-10421` renommer sa clé (conso) → cible `#dropdownMenuButton` + "Mettre à jour le nom perso." → à repointer sur la row.
- `ASOAPI-10457/10458` activer/désactiver (conso) → idem.
- `ASOAPI-10600/10601` activer/désactiver clé étendue → l'enfant 'dev' n'est plus une carte séparée mais une **row** de la carte keyring. À réécrire.
- `ASOAPI-10602` supprimer une extension → row 'dev' → menu → Supprimer. Le confirm (`Pour confirmer la suppression` = `API Commande/dev`, bouton `Confirmation`) est conservé (cf `confirmationSchema`).
- `ASOAPI-10603` supprimer clé avec extension en cascade → **ATTENTION** : la suppression conso est désormais une suppression simple par sub (le backend supprime le keyring quand vide). Le bouton "Supprimer définitivement la souscription et tous ses enfants" n'existe peut-être plus côté conso. Revoir le sens du test.
- `ASOAPI-10604` transférer (conso) → row 'prod' → menu → "Transférer la souscription".
- Tests **producteur** (`ASOAPI-10414/10398/10399/10400`) : table inchangée structurellement (badge "A"→icône) → devraient passer quasi tels quels, vérifier.
- Tests **souscrire/étendre** (`ASOAPI-10160/10161/10163/10164`) : la modal est renommée (`KeyringSelectModal`) et les libellés des boutons ont changé ("Souscrire avec un nouveau trousseau" / "Souscrire en l'ajoutant à un trousseau existant") + on liste des **trousseaux** ("Rejoindre ce trousseau"). À vérifier/réaligner. Le flux succès navigue vers `/{team}/{api}/{version}/apikeys` (plus de right panel) → adapter les assertions.
- `tests/specs/notifications.ts` : vérifier les notifs refresh/accept (flèche en colonne action maintenant).

### 2. Lancer la suite e2e
`cd daikoku/javascript && npm test` (playwright). Le stack est démarré via `tests/docker-compose-local.yml` (redis/openldap/smtp/otoroshi/postgres). **Gotcha rencontré** : `Error: ports are not available: ... 0.0.0.0:8080: address already in use` alors que `lsof` (sans sudo) ne montre rien — `netstat -an -p tcp | grep '\.8080 '` montrait `tcp46 *.8080 LISTEN` (process **root / hors-docker**, ex. un Otoroshi lancé à la main). Le trouver : `sudo lsof -nP -iTCP:8080 -sTCP:LISTEN`, le tuer, ou `docker compose -f tests/docker-compose-local.yml down --remove-orphans` pour repartir propre (un conteneur `tests-otoroshi-1` restait en état `Created`).

### 3. Divers / dette restante
- Reformulations terminologiques restantes (optionnel) : `apikeys.delete.choice.label` ("parent d'un agrégat"), `apikeys.delete.choice.extraction` ("Chaque enfant…"), `aggregation.api_key.security.notification` ("clé d'API parente et ses clés agrégées"), `subscription.show.aggregate.label` ("Voir l'agrégat"), `team_apikey_aggregatePlans_title` ("Clés d'API agrégées").
- `SubscriptionMetadataModal.tsx` L124 : `props.subscription?.["parent"]` (champ disparu, toujours undefined → `validUntil` toujours éditable). Comportement acceptable pour le nouveau modèle mais à clarifier si besoin.
- `types/team.ts` `IFastApiSubscription` garde `apiKey/integrationToken` mais n'a plus de lecteur (mort) — peut être nettoyé.
- Pré-filtre des trousseaux joignables (ApiPricing) : marche SI le consommateur reçoit bien `otoroshiSettings`/`readOnly` des plans. Si un trousseau incompatible apparaît encore, basculer le filtrage côté backend (réutiliser `controlSubscriptionExtension`).
- `getApiKeyrings` / requêtes : `lastUsage` retiré de la query keyrings conso (resolver corrigé depuis, ré-ajoutable si besoin d'afficher l'usage par sub dans la carte).
