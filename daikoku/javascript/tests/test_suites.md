# LDAP

## Organisation : dundermifflin.com

### Groupes et utilisateurs

#### Groupe : Managers
- **Utilisateur :** Michael Scott  
  **Mail :** michael.scott@dundermifflin.com  

#### Groupe : Employees
- **Utilisateur :** Dwight Schrute  
  **Mail :** dwight.schrute@dundermifflin.com  
- **Utilisateur :** Jim Halpert  
  **Mail :** jim.halpert@dundermifflin.com  
- **Utilisateur :** Pam Beesly  
  **Mail :** pam.beesly@dundermifflin.com
- **Utilisateur :** Andy Bernard  
  **Mail :** ANDY.BERNARD@dundermifflin.com

# Daikoku

## Utilisateurs
  - Michael Scott
  - Jim Halpert
  - Dwight Shrute (1 apikey for paper API)
## Non Utilisateurs
  - Andy Bernard (son mail contient des majuscules)
  - Pam Beesly

## Équipes

- **API Division**
  - **admins** : 
    - Michael Scott

- **Vendeurs**
  - **apikeys**
    - API papier dev (aggregat)
    - |-> API Commande dev (extension)
  - **admins** : 
    - Jim Halpert
  - **users**:
    - Dwight Schrute

- **Logistiques**
  - **apikeys**
    - API Commande/prod
    - API Commande/dev
  - **admins** : 
    - Jim Halpert

# Otoroshi
## Routes
  - dev_paper_route
    - |=> 1 apikey for daikoku user Dwight Shrute daikoku-api-key-api-papier-dev-dwight-schrute-1736523399426-1.0.0
  - prod_paper_route
  - dev_command_route
    - |=> 1 apikey for logistique daikoku-api-key-api-commande-dev-logistique-1737452599960-1.0.0
  - prod_command_route
    - |=> 1 apikey for logistique daikoku-api-key-api-commande-prod-logistique-1737463823426-1.0.0

# Tests Daikoku

- [x] **(ASOAPI-10358)** => Administrateur - Se connecter pour la première fois  
  **Summary:** Vérifier que l'administrateur peut se connecter pour la première fois et qu'un compte est automatiquement créé pour son équipe.  
  **Expected result:** Un compte Daikoku et une équipe sont créés après la première connexion.  

- [x] **(ASOAPI-10359)** => Administrateur - Se connecter en étant membre d'une équipe  
  **Summary:** Valider que l'administrateur peut accéder à son compte et visualiser les équipes où il est membre.  
  **Expected result:** L'utilisateur voit son équipe et toutes les équipes où il est membre.  

- [x] **(ASOAPI-10364)** => Administrateur - Consulter les membres d'une équipe en tant que membre de l'équipe  
  **Summary:** S'assurer que les membres d'une équipe sont visibles lorsqu'on consulte la composition de cette équipe.  
  **Expected result:** Les membres de l'équipe sont visibles après consultation.  

- [x] **(ASOAPI-10361)** => Administrateur - Consulter les membres d'une équipe en tant qu'administrateur de l'équipe
   **Summary:** S'assurer que les membres d'une équipe sont visibles lorsqu'on consulte la composition de cette équipe.  
  **Expected result:** Les membres de l'équipe sont visibles après consultation.

- [x] **(ASOAPI-10360)** => Administrateur - Ajouter une personne n'ayant pas de compte Daikoku à une équipe  
  **Summary:** Vérifier l'ajout d'une personne non inscrite à une équipe, et vérifier l'invitation envoyée.  
  **Expected result:** Une invitation est envoyée à la personne et elle doit s'inscrire pour rejoindre l'équipe.  

- [x] **(ASOAPI-10363)** => Administrateur - Ajouter une personne ayant un compte Daikoku à une équipe - Cas particulier email avec MAJUSCULE  
  **Summary:** Tester l'ajout d'un utilisateur avec un email contenant des majuscules à une équipe existante.  
  **Expected result:** L'invitation est envoyée et acceptée, la personne devient membre de l'équipe.  

- [x] **(ASOAPI-10362)** => Administrateur - Ajouter une personne ayant un compte Daikoku à une équipe  
  **Summary:** Tester l'ajout d'un utilisateur à une équipe existante.  
  **Expected result:** L'invitation est envoyée et acceptée, la personne devient membre de l'équipe. 

- [x] **(ASOAPI-10365)** => Administrateur - Modifier les droits d'un membre de l'équipe - ajout droit admin  
  **Summary:** Vérifier que l'administrateur peut ajouter les droits d'admin un membre de l'équipe.  
  **Expected result:** Le membre est admin.

- [x] **(ASOAPI-10367)** => Administrateur - Modifier les droits d'un membre de l'équipe - retrait droit admin  
  **Summary:** Vérifier que l'administrateur peut supprimer les droits d'admin un membre de l'équipe.  
  **Expected result:** L'équipe est supprimée et n'apparaît plus dans la liste des équipes.  

- [x] **(ASOAPI-10366)** => Administrateur - Supprimer un membre d'une équipe  
  **Summary:** Vérifier que l'administrateur peut supprimer un membre d'une équipe.  
  **Expected result:** L'utilisateur n'est plus membre de l'équipe.  

- [x] **(ASOAPI-10396)** => Administrateur - Se connecter en étant membre du groupe AD M_GRG_Gateway_API_Interne  
  **Summary:** Vérifier qu'un utilisateur peut se connecter à son compte Daikoku et est bien admin de tenant.  
  **Expected result:** L'utilisateur peut voir l'api d'admin daikoku.  

- [x] **(ASOAPI-10506)** => Administrateur DKK - Supprimer définitivement un utilisateur 
  **Summary:** Tester la suppression d'un compte utilisateur.  
  **Expected result:** L'utilisateur est bien supprimé  

- [x] **(ASOAPI-10613)** => Administrateur DKK - Supprimer définitivement un utilisateur (cas particulier d'utilisateur avec APIkey active)
  **Summary:** Tester la suppression d'un compte utilisateur.  
  **Expected result:** L'utilisateur est bien supprimé et ses clé aussi 

- [x] **(ASOAPI-10169)** => Anonyme - Consulter l'offre API  
  **Summary:** Tester la consultation de l'offre API en tant qu'utilisateur anonyme.  
  **Expected result:** L'utilisateur peut consulter l'offre API avec succès. (faire une recherche, filtrer)  

- [x] **(ASOAPI-10151)** => Consommateur - Consulter l'offre API  
  **Summary:** Tester la consultation de l'offre API en tant que consommateur connecté.  
  **Expected result:** L'utilisateur connecté peut consulter l'offre API avec succès. (faire une recherche, filtrer) 

- [x] **(ASOAPI-10160)** => TNR - Demander et obtenir une clé d'API
  **Summary:** Tester la demande et l'obtention de l'accès initial à une API.  
  **Expected result:** L'utilisateur obtient sa premiere apikey à une API avec succès. (trouver sa clé depuis l'UI et verifier sa presence dans otoroshi)  

- [x] **(ASOAPI-10163)** => TNR - Demander accès initial et obtenir un refus  
  **Summary:** Tester la demande d'accès initial refusée à une API.  
  **Expected result:** L'utilisateur reçoit un refus pour sa demande d'accès initial.

- [x] **(ASOAPI-10161)** => TNR - Demander étendre accès et obtenir l'accès  
  **Summary:** Tester la demande d'extension d'accès réussie à une API.  
  **Expected result:** L'utilisateur obtient l'extension d'accès à une API avec succès.  

- [x] **(ASOAPI-10164)** => TNR - Demander étendre accès et obtenir un refus  
  **Summary:** Tester la demande d'extension d'accès refusée à une API.  
  **Expected result:** L'utilisateur reçoit un refus pour sa demande d'extension d'accès. 
  
- [ ] **(ASOAPI-10387)** => Consommateur - Tester une API via swagger (avec API Key générée) 
  **Summary:** Tester une API via swagger avec une API Key générée pour un consommateur.  
  **Expected result:** L'API est testée avec succès après avoir renseigné les bons paramètres.  

- [x] **(ASOAPI-10388)** => Producteur - Consulter les API Key générées de ses API (pas la peine de tester)
  **Summary:** Consulter les API Key générées pour ses API en tant que producteur.  
  **Expected result:** Visualisation des API Key générées pour les API d’un producteur.  

- [x] **(ASOAPI-10421)** => Consommateur - Renommer l'API Key  
  **Summary:** Renommer l'API Key d'un consommateur.  
  **Expected result:** L'API Key est renommée avec succès.  

- [x] **(ASOAPI-10414)** => Producteur - Renommer le nom personnalisé de l'API Key  
  **Summary:** Renommer le nom personnalisé d'une API Key pour un producteur.  
  **Expected result:** Le nom personnalisé de l'API Key est modifié avec succès.  

- [x] **(ASOAPI-10398)(ASOAPI-10399)** => Producteur - Désactiver/activer temporairement une API Key  
  **Summary:** Désactiver temporairement une API Key en tant que producteur.  
  **Expected result:** L'API Key est désactivée temporairement. 

- [x] **(ASOAPI-10400)** => Producteur - Supprimer définitivement une API Key  
  **Summary:** Supprimer définitivement une API Key en tant que producteur.  
  **Expected result:** L'API Key est supprimée définitivement.  

- [x] **(ASOAPI-10457 ASOAPI-10458)** => Consommateur - Désactiver/reactiver une API Key  
  **Summary:** Désactiver/reactiver une API Key pour un consommateur.  
  **Expected result:** L'API Key est désactivée/reactiver avec succès. 

- [x] **(ASOAPI-10604)** => Consommateur - Transférer une API Key à une autre équipe  
  **Summary:** Transférer une API Key à une autre équipe en tant que consommateur.  
  **Expected result:** L'API Key est transférée avec succès à l’autre équipe.  

- [x] **(ASOAPI-10600)(ASOAPI-10601)** => Consommateur - Désactiver/Réactiver une extension d'API key  
  **Summary:** Désactiver une extension d'API Key en tant que consommateur.  
  **Expected result:** L'extension de l'API Key est désactivée avec succès.

- [x] **(ASOAPI-10602)** => Consommateur - Supprimer une extension d'API key  
  **Summary:** Supprimer une extension d'API Key en tant que consommateur.  
  **Expected result:** L'extension de l'API Key est supprimée avec succès.

- [x] **(ASOAPI-10603)** => Consommateur - Supprimer une extension d'API key en cascade  
  **Summary:** Supprimer une extension d'API Key en cascade en tant que consommateur.  
  **Expected result:** L'extension de l'API Key est définitivement supprimée en cascade.

- [x] **()** => Consommateur - Supprimer une extension d'API key avec promotion  
  **Summary:** Supprimer une extension d'API Key avec promotion d'un enfant en tant que consommateur.  
  **Expected result:** L'extension de l'API Key est définitivement supprimée.

- [x] **()** => Consommateur - Supprimer une extension d'API key avec extraction  
  **Summary:** Supprimer une extension d'API Key avec extraction d'un enfant en tant que consommateur.  
  **Expected result:** L'extension de l'API Key est définitivement supprimée.

- [x] **(ASOAPI-10597)** => Producteur - Ajouter une nouvelle version d'API ou une nouvelle API  
  **Summary:** Ajouter une nouvelle version d'API ou une nouvelle API en tant que producteur.  
  **Expected result:** La nouvelle API ou version est ajoutée avec succès.

- [x] **(ASOAPI-10599)** => Producteur - Supprimer une version d'API ou une API  
  **Summary:** Supprimer une version d'API ou une API en tant que producteur.  
  **Expected result:** La version d'API ou l'API est supprimée avec succès.

- [ ] **(ASOAPI-10692)** => Producteur - Désactiver une version d'API ou une API  
  **Summary:** Désactiver une version d'API ou une API en tant que producteur.  
  **Expected result:** La version d'API ou l'API est désactivée avec succès. 
  
- [x] **(ASOAPI-10691)** => Consommateur - Demander étendre mes accès - en mode rapide  
  **Summary:** Demander une extension d'accès en mode rapide pour un consommateur.  
  **Expected result:** La demande d'extension est envoyée et consultée avec succès.

- [x] **???** => Admin - Modification seulement du plan d'une admin-api
- [x] **???** => Admin - transfert impossible d'une admin-api
- [x] **???** => Admin - Modification seulement du plan d'une cms-api
- [x] **???** => Login - login by another way than ldap (local, otoroshi)