---
name: working-style
description: How the user wants code changes made on the Daikoku project — review cadence and idioms
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ac0c6559-0d60-41e0-88a1-4ddb0c5f6892
---

L'utilisateur revoit **chaque modification** et n'est pas autonome : il valide/refuse les
edits un par un.

**Why:** il veut garder la main sur un gros refactor et comprendre chaque changement.

**How to apply:**
- **TOUJOURS** donner 1-2 lignes d'explication AVANT chaque modification (ce qu'on
  change et pourquoi). Pas d'Edit silencieux, même pour les petits patches. Le user
  a corrigé plusieurs fois sur ce point.
- **Découper les changements** en petits edits ciblés ; ne pas grouper plusieurs
  changements logiques dans un seul gros edit (ex. ne pas mêler predicate + SQL).
- Code Scala 3 idiomatique : préférer `enum` à `sealed trait` + objets.
- Pas de valeur par défaut arbitraire pour masquer un cas non géré : si une valeur
  d'enum est inconnue au parsing JSON, renvoyer un `JsError`, pas un `getOrElse` au pif.
- Pas de `.asOpt[Long].getOrElse(0L)` quand la valeur est toujours présente : `.as[Long]`.
- Avancer étape par étape, compiler et faire valider avant de passer à la suite.

Voir [[keyring-migration]].
