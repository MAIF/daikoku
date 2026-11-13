# Facturation Stripe : vérifications manuelles

Branche `stripe` · 2026-11-12 · Complète [stripe-billing.md](stripe-billing.md)

Les libellés de l'UI sont cités tels que la locale française du tenant de dev les affiche.

## Mise en place

- Lancer `mise run dev --mode stripe`. Il faut `daikoku/.env.stripe` et la CLI Stripe. Son `stripe listen`
  transmet tous les webhooks Stripe au Daikoku local.
- Utilisateurs, tous avec le mot de passe `password` :
  - Michael Scott (`michael.scott@dundermifflin.com`) : producteur, administrateur d'API Division.
  - Jim Halpert (`jim.halpert@dundermifflin.com`) : consommateur, administrateur de Vendeurs et de Logistique.
  - Dwight Schrute : simple membre de Vendeurs.
- Les mails arrivent sur http://localhost:1080.
- Les écrans de consommation n'affichent que ce que Daikoku a enregistré. Le job de stats le récupère
  d'Otoroshi 10 s après le démarrage du backend, puis toutes les heures. Le bouton de rafraîchissement à
  côté de la date le récupère tout de suite. Un refresh du navigateur ne fait que relire les données
  enregistrées.

## Couverture automatisée

### Couvert par Playwright

[stripe_billing.spec.ts](../../daikoku/javascript/tests/specs/stripe_billing.spec.ts) contient deux scénarios :

- Une souscription via le vrai Checkout, jusqu'à « Souscription active ». Le scénario vérifie aussi le
  compteur Stripe (pas de double comptage, incréments), une hausse de prix, l'avance de l'horloge et la
  bascule des prix sur `invoice.finalized`.
- Un paiement abandonné, puis « Reprendre le paiement ».

[consumption_sync.spec.ts](../../daikoku/javascript/tests/specs/consumption_sync.spec.ts) couvre la
consommation d'Otoroshi vers Daikoku.

### Flows UI sans scénario Playwright

Ces flows sont couverts au mieux par les specs Scala :

1. Rendre un plan payant et changer son prix depuis l'éditeur de plan. L'e2e passe par l'API.
2. Un plan à étapes (formulaire, puis validation), suivi du paiement.
3. Un paiement en attente, repris depuis sa notification.
4. « Résilier l'abonnement », puis « Conserver la souscription ».
5. Une fin côté Stripe : la souscription passe « Terminée », puis l'équipe souscrit de nouveau.
6. Un blocage par le producteur avec un motif (notification et mail), l'état « Suspendue », puis le
   déblocage.
7. Les écrans Facturation, Consommation et Revenus. Le plan du 16/10 n'excluait que `/settings/billing`,
   avant la refonte du 10/11.
8. La notification de changement de tarif et son lien vers le plan.

L'e2e vérifie seulement `invoice.total > 0`
([stripe_billing.spec.ts:237-238](../../daikoku/javascript/tests/specs/stripe_billing.spec.ts#L237-L238)).
Le forfait suffit à le rendre vrai, donc rien ne prouve que la consommation arrive sur la facture.

### Exécutions

L'étape E8 du plan est toujours `todo`. En local, le dernier run Playwright est un `stripe_billing` en
échec du 17/09, et les rapports Scala Stripe datent de septembre.

```bash
# Specs hors-ligne. Sans clé, StripeE2ESpec et les cas réels de StripeWebhookSpec sont annulés.
mise run test:back

# Specs Scala contre le vrai Stripe, avec un Postgres sur 5432 (mise run pg)
source daikoku/.env.stripe && cd daikoku && sbt "testOnly fr.maif.daikoku.controllers.StripeE2ESpec fr.maif.daikoku.controllers.StripeWebhookSpec"

# E2E Playwright de facturation contre Stripe en mode test
mise run test:stripe
```

Ne pas sourcer `.env.stripe` avant `mise run test:back`. `DAIKOKU_STRIPE_URL` remplacerait l'URL WireMock
de [application.conf](../../daikoku/test/resources/application.conf#L22-L25), et `StripeBillingSpec`
appellerait le vrai Stripe.

## Checklist UI

### Producteur (Michael)

- [x] Passer le plan « dev » d'API papier en payant. Vérifier la modale « Facturer ce plan via Stripe ? »,
      le message d'attente et le champ « Compte de paiement ». Aucun choix de devise n'apparaît. Le
      message « ne peut plus redevenir gratuit » s'affiche ensuite.
- [x] « Requêtes incluses par mois » refuse une valeur au-delà de la limite mensuelle. L'onglet quotas
      refuse une limite inférieure aux requêtes incluses.
- [x] Sur le plan « prod » (formulaire, puis validation), l'étape paiement arrive en dernier et ne peut
      pas être déplacée.
- [x] Sur la page de l'API, le texte du tarif dit « dès la première requête » ou « au-delà de N requêtes
      par mois », selon le plan.
- [x] Changer le prix affiche « Création des nouveaux prix… ». Jim reçoit « Changement de tarif à
      venir » et un mail, et « Voir le nouveau tarif » ouvre le plan.
- [x] Bloquer une souscription ouvre une modale avec un motif facultatif. Jim reçoit une notification et
      un mail avec le motif, et sa clé ne passe plus. Au déblocage, il reçoit une notification et un mail
      « rétablie ».
- [x] Une souscription « Terminée » ne peut pas être réactivée.
- [ ] L'écran Revenus affiche une ligne par équipe abonnée, avec des montants marqués comme estimés.

### Consommateur (Jim)

- [x] Sur un plan à étapes, Jim remplit le formulaire et Michael valide. Jim reçoit « attend votre
      paiement » et un mail, paie, puis arrive sur « Souscription active ».
- [x] Ouvrir le Checkout, puis fermer l'onglet sans payer. La notification permet de reprendre le
      paiement.
- [x] L'écran Facturation affiche les badges Active, Résiliation programmée, Suspendue et Terminée. Il
      affiche « Prochain prélèvement … (estimé) le … », et « Nouveau tarif à partir du … » après un
      changement de prix. « Voir les factures » ouvre le portail Stripe.
- [x] Avec une mauvaise clé secrète sur le tenant, le badge passe à « Indisponible ». Le lien des
      factures affiche l'erreur au lieu d'ouvrir `/undefined`.
- [x] L'écran Consommation affiche les indicateurs, les onglets Évolution, Par jour et Par plan, le
      filtre par API et le bouton de synchro.
- [ ] Dans Clés d'API, « Résilier l'abonnement » demande une confirmation et affiche un toast, puis
      « Résiliation programmée, prend fin le … ». « Conserver la souscription » annule la résiliation.
      Jim reçoit « Résiliation enregistrée » et un mail.
- [ ] Ajouter un plan payant à un trousseau qui contient déjà une souscription est refusé avec un
      message lisible. L'inverse aussi.

### Tenant

- [x] Le formulaire Stripe affiche l'URL du webhook et l'aide sur le secret.
- [x] En `mise run dev` (mode local, jobs coupés), l'admin du tenant voit les variables à activer.
      Michael voit « Le paiement n'est pas disponible sur ce tenant ».

## Cycle mensuel avec une horloge de test Stripe

Le principe : créer une horloge de test et un client Stripe pour Vendeurs avant la souscription. Daikoku
retrouve le client d'une équipe par `metadata.daikoku_id` et prend le premier résultat
([PaymentClient.scala:1271-1292](../../daikoku/app/fr/maif/daikoku/controllers/PaymentClient.scala#L1271-L1292)),
donc l'abonnement suit l'horloge. On avance ensuite l'horloge au-delà de la fin de période, puis on lit
la facture.

Toutes les commandes se lancent depuis la racine du repo, avec `mise run dev --mode stripe` démarré.

### Helpers

```bash
source daikoku/.env.stripe

sapi() {
  curl -s -u "$STRIPE_TEST_SECRET_KEY:" -H "Stripe-Version: 2026-07-29.dahlia" "$@"
}

TEAM=c9NB4pklW4QxJ3mLcxQAwqu4RvquHYv4   # Vendeurs (Logistique : jGVkVifJgKFdOq4PeoMU2XKWzEjejUfI)
```

### 1. Un client sur une horloge

```bash
# Clients Stripe de l'équipe : il ne doit rester que celui de l'horloge
sapi -G https://api.stripe.com/v1/customers/search \
  --data-urlencode "query=metadata['daikoku_id']:'$TEAM'" \
  | jq '.data[] | {id, test_clock}'

CLOCK=$(sapi https://api.stripe.com/v1/test_helpers/test_clocks -d frozen_time=$(date +%s) | jq -r .id)

CUS=$(sapi https://api.stripe.com/v1/customers \
  -d test_clock=$CLOCK \
  -d name=Vendeurs \
  -d email=vendeurs@dundermifflin.com \
  -d "metadata[daikoku_id]=$TEAM" \
  | jq -r .id)
```

Relancer la recherche jusqu'à ce qu'elle renvoie `$CUS`, car la recherche Stripe peut avoir jusqu'à une
minute de retard. Si elle renvoie d'anciens clients, les supprimer avec
`sapi -X DELETE https://api.stripe.com/v1/customers/cus_…`, ou prendre Logistique. Supprimer un client
résilie ses abonnements, donc les souscriptions Daikoku liées passent « Terminée ».

### 2. Souscrire dans l'UI

Michael rend un plan payant, par exemple 5 € par mois, 0,01 € par requête et 2 requêtes incluses. Jim
souscrit avec Vendeurs et paie avec la carte 4242 4242 4242 4242.

### 3. Abonnement, compteur et fin de période

```bash
SUB=$(sapi -G https://api.stripe.com/v1/subscriptions -d customer=$CUS | jq -r '.data[0].id')

METER=$(sapi https://api.stripe.com/v1/subscriptions/$SUB | jq -r '.items.data[].price.recurring.meter // empty')

sapi https://api.stripe.com/v1/subscriptions/$SUB \
  | jq '{status, cancel_at_period_end, pause_collection, items: [.items.data[] | {price: .price.id, end: (.current_period_end | todate)}]}'
```

### 4. Appels avec la clé

Copier la clé depuis « Clés d'API ». Le plan dev répond sur `dev.paper.oto.tools`, le plan prod sur
`paper.oto.tools`.

```bash
KEY='clientId:clientSecret'

for i in {1..5}
do
  curl -s -o /dev/null -w "%{http_code}\n" http://dev.paper.oto.tools:8080/ \
    -H "Otoroshi-Client-Id: ${KEY%%:*}" \
    -H "Otoroshi-Client-Secret: ${KEY#*:}"
done
```

### 5. Synchro, puis total du compteur

Le bouton de l'écran Consommation déclenche la même synchro. Si le total vaut 0, attendre 30 s et
resynchroniser, car Otoroshi envoie ses événements à Elasticsearch de façon asynchrone. Une nouvelle
synchro sans nouveaux appels ne doit pas changer le total.

```bash
curl -s -X POST -H "Host: localhost" "http://localhost:9000/api/jobs/stats/_sync?key=secret"

NOW=$(date +%s)

sapi -G https://api.stripe.com/v1/billing/meters/$METER/event_summaries \
  -d customer=$CUS \
  -d start_time=$(( (NOW - 86400) / 60 * 60 )) \
  -d end_time=$(( (NOW / 60 + 5) * 60 )) \
  | jq '[.data[].aggregated_value] | add'
```

### 6. La prochaine facture vue par Stripe

À comparer avec « Prochain prélèvement » sur Facturation et « Estimé à date » sur Consommation.

```bash
sapi https://api.stripe.com/v1/invoices/create_preview -d subscription=$SUB \
  | jq '{total, lines: [.lines.data[] | {description, quantity, amount}]}'
```

### 7. Passer la fin de période

L'horloge va deux heures au-delà de la fin, parce que Stripe garde la facture de renouvellement en
brouillon pendant environ une heure.

```bash
END=$(sapi https://api.stripe.com/v1/subscriptions/$SUB | jq '.items.data[0].current_period_end')

sapi https://api.stripe.com/v1/test_helpers/test_clocks/$CLOCK/advance -d frozen_time=$(( END + 7200 )) > /dev/null

until [ "$(sapi https://api.stripe.com/v1/test_helpers/test_clocks/$CLOCK | jq -r .status)" = "ready" ]
do
  sleep 5
done
```

### 8. Factures

```bash
sapi -G https://api.stripe.com/v1/invoices -d customer=$CUS \
  | jq '.data[] | {id, billing_reason, status, total, amount_paid, lines: [.lines.data[] | {description, quantity, amount}]}'
```

### Résultat attendu

- [ ] Une facture `subscription_create`, avec le forfait au prorata jusqu'au 1er et sans consommation.
- [ ] Une facture `subscription_cycle` au statut `paid`, avec le forfait du mois qui commence et une
      ligne de consommation pour la période close : les 2 requêtes incluses à 0, puis 0,01 € chacune.
- [ ] `invoice.finalized [200]` dans le terminal `stripe listen`.
- [ ] La nouvelle échéance sur l'écran Facturation.

### Variantes

Chaque variante rejoue les étapes 7 et 8.

- [ ] **Changement de prix.** Michael change le prix avant l'avance. Après l'avance, l'étape 3 montre
      les nouveaux prix. Une deuxième avance montre le nouveau forfait sur la facture. Stripe accepte au
      plus deux mois par avance.
- [ ] **Blocage.** `pause_collection.behavior` vaut `void`, et la facture du cycle est `void`. Après le
      déblocage, `pause_collection` revient à `null`.
- [ ] **Résiliation.** `cancel_at_period_end` passe à `true`. Après l'avance, une facture de clôture
      porte la consommation, puis `customer.subscription.deleted` fait passer la souscription
      « Terminée ». Jim peut souscrire de nouveau.
- [ ] **Impayé.** Lancer les deux commandes ci-dessous, puis avancer. La facture reste impayée et
      Daikoku ne fait rien, comme décidé (D1). Si les relances du compte Stripe finissent par une
      résiliation, la souscription passe « Terminée ».

```bash
PM=$(sapi https://api.stripe.com/v1/payment_methods/pm_card_chargeCustomerFail/attach -d customer=$CUS | jq -r .id)

sapi https://api.stripe.com/v1/subscriptions/$SUB -d default_payment_method=$PM > /dev/null
```

### Limites et nettoyage

- Faire les appels et la synchro avant d'avancer l'horloge. Daikoku date les événements du compteur à
  l'heure réelle ([PaymentClient.scala:791](../../daikoku/app/fr/maif/daikoku/controllers/PaymentClient.scala#L791)),
  donc après une avance ils tomberaient dans une période que l'horloge a déjà close.
- Pour nettoyer, supprimer l'horloge : `sapi -X DELETE https://api.stripe.com/v1/test_helpers/test_clocks/$CLOCK`.

## Repéré, non corrigé

1. **Prix par requête sous le centime.** `toStripeAmount` tronque au centime
   ([PaymentClient.scala:147-156](../../daikoku/app/fr/maif/daikoku/controllers/PaymentClient.scala#L147-L156)).
   À 0,001 €, Stripe reçoit `unit_amount=0` : la consommation est facturée 0, alors que Daikoku affiche
   et estime 0,001 €. La correction passerait par `unit_amount_decimal`.
2. **Date annoncée d'un changement de prix.** La notification et le mail annoncent le 1er du mois
   suivant ([UsagePlanService.scala:230-234](../../daikoku/app/fr/maif/daikoku/services/UsagePlanService.scala#L230-L234)).
   Mais le forfait de ce mois est facturé d'avance, avant la bascule des prix, qui attend la finalisation
   de la facture ([PaymentClient.scala:992-1026](../../daikoku/app/fr/maif/daikoku/controllers/PaymentClient.scala#L992-L1026)).
   Le nouveau forfait devrait apparaître un mois plus tard qu'annoncé. La variante « changement de prix »
   le confirmera.
3. **`POST /api/jobs/stripe/_reconcile` sans clé.** Contrairement aux autres jobs, la route ne vérifie
   que le flag du cron ([JobsController.scala:129-138](../../daikoku/app/fr/maif/daikoku/controllers/JobsController.scala#L129-L138)).
   Dès que le cron est activé, n'importe qui peut la déclencher.
4. **Écran de consommation vide tant qu'aucune synchro n'est passée.** Sans données enregistrées,
   l'écran dit seulement qu'il n'y a pas de données, sans date ni indication sur le bouton. Deux options :
   un intervalle d'une minute pour le job de stats en mode dev stripe
   (`DAIKOKU_APIKEYS_STATS_JOB_INTERVAL=60000`), et une phrase dans l'état vide.

## Sources

- [Billing Meter Events](https://docs.stripe.com/api/billing/meter-event)
- [Test clocks, API and advanced usage](https://docs.stripe.com/billing/testing/test-clocks/api-advanced-usage)
- [Advance a test clock](https://docs.stripe.com/api/test_clocks/advance)
