---
name: feedback-keyring-fixtures
description: "Pour chaque test qui déclare un val keyring local, toujours le passer aussi à setupEnvBlocking via keyrings = Seq(keyring)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ac0c6559-0d60-41e0-88a1-4ddb0c5f6892
---

Quand un test déclare un `val keyring = Keyring(...)` local, **toujours** ajouter `keyrings = Seq(keyring)` dans l'appel à `setupEnvBlocking` du même test. Les deux vont ensemble — déclarer le keyring sans le persister via setupEnvBlocking laisse les `keyring = keyring.id.some` des souscriptions pointer sur une entité absente du repo.

**Why:** lors de la migration des fixtures vers le modèle [[keyring-migration]], j'ai oublié `keyrings = Seq(keyring)` après avoir ajouté le `val keyring` ; le user a réagi « non non ca va pas je vois pas le keyring dans setupEnvBlocking » puis « faut toujours associer les deux ».

**How to apply:** dès que tu écris/édites un fixture de test backend pour daikoku qui crée un keyring, vérifie en relisant le fixture entier que `keyrings = Seq(keyring)` figure dans le `setupEnvBlocking` correspondant. Si tu modifies plusieurs fixtures en batch (replace_all), fais un grep `keyrings = Seq(keyring)` à la fin pour valider que le compte correspond au nombre de `val keyring = Keyring(`.
