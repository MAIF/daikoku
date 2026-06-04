# Memory index

- [Keyring migration](keyring-migration.md) — refactor en cours : agrégation de clés `parent` → entité `Keyring`, étapes 1-5/10 faites au 2026-05-19
- [Daikoku build](daikoku-build.md) — le projet sbt est dans le sous-dossier `daikoku/`, lancer sbt depuis là
- [Working style](working-style.md) — l'utilisateur revoit chaque edit : expliquer avant, découper petit, idiomes Scala 3
- [Keyring fixtures pairing](feedback-keyring-fixtures.md) — un `val keyring` local doit toujours être suivi de `keyrings = Seq(keyring)` dans `setupEnvBlocking`
- [Keyring fixture migration recipe](keyring-fixture-migration-recipe.md) — recette : virer apiKey/integrationToken/bearerToken/rotation des subs et les migrer sur un keyring local
