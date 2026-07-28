---
name: daikoku-build
description: How to build the Daikoku Scala project (sbt location and command)
metadata: 
  node_type: memory
  type: reference
  originSessionId: ac0c6559-0d60-41e0-88a1-4ddb0c5f6892
---

Le projet sbt Daikoku est dans le **sous-dossier `daikoku/`** du repo, pas à la racine
(`/Users/79966B/Documents/opensource/daikoku/daikoku/build.sbt`). Lancer sbt depuis là :
`cd /Users/79966B/Documents/opensource/daikoku/daikoku && sbt -batch "Compile / compile"`.
Lancé depuis la racine, sbt prend un projet vide et "compile" en 0 s sans rien faire.

Scala 3.8.2, Play 3.0.10, Java 17. Un compile complet propre dure ~45-50 s. Voir
[[keyring-migration]].
