# Memory index

- [Keyring frontend & tests](keyring-frontend-and-tests.md) — État frontend keyring-centrique (vue conso `KeyringCard`, `KeyringSelectModal`, notifs, renommage trousseau) + bugs backend résiduels corrigés + RESTE À FAIRE = réécrire les tests e2e `souscriptions.spec.ts` au modèle keyring (DOM/sélecteurs fournis). Reprise sur autre poste.
- [Keyring migration](keyring-migration.md) — dossier complet du refactor `ApiSubscription.parent` → entité `Keyring` : carte des fichiers, signatures (`asSafeJson(keyring)`, `ApiKeyRefreshV2`), recettes de fixtures. Code prod + tests compilent (2026-06-04) ; reste à exécuter la suite
- [Daikoku build](daikoku-build.md) — le projet sbt est dans le sous-dossier `daikoku/`, lancer sbt depuis là
- [Working style](working-style.md) — l'utilisateur revoit chaque edit : expliquer avant, découper petit, idiomes Scala 3
- [Keyring fixtures pairing](feedback-keyring-fixtures.md) — un `val keyring` local doit toujours être suivi de `keyrings = Seq(keyring)` dans `setupEnvBlocking`
- [Keyring fixture migration recipe](keyring-fixture-migration-recipe.md) — recette : virer apiKey/integrationToken/bearerToken/rotation des subs et les migrer sur un keyring local
