import { expect, Locator, test } from '@playwright/test';
import { ANDY, DWIGHT, JIM, MICHAEL, PAM, ROBERT } from './users';
import { ACCUEIL, adminApikeyId, adminApikeySecret, apiCommande, apiPapier, commandeDevPlan, EMAIL_UI, exposedPort, loginAs, loginLocalAs, findAndGoToTeam, logistique, logout, subCommandeDevVendeurs, teamJim, tenant, vendeurs } from './utils';
import { NotifProps, postNewNotif } from './notifications';


test.beforeEach(async () => {
  await fetch(`http://localhost:${exposedPort}/admin-api/state/reset`, {
    method: 'POST',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  })
    .then(() => fetch('http://localhost:1080/api/emails', {
      method: 'DELETE'
    }))
})

test("[ASOAPI-10364] - Consulter les membres d'une équipe en tant que membre de l'équipe", async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(DWIGHT, page);
  await findAndGoToTeam('Vendeurs', page);
  await page.getByText('Membres').click();
  await expect(page.getByRole('main')).toContainText(JIM.name);
  await expect(page.getByRole('main')).toContainText(DWIGHT.name);
});
test("[ASOAPI-10361] - Consulter les membres d'une équipe en tant qu'administrateur de l'équipe", async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  await findAndGoToTeam('Vendeurs', page);
  await page.getByText('Membres').click();
  await expect(page.getByRole('main')).toContainText(JIM.name);
  await expect(page.getByRole('main')).toContainText(DWIGHT.name)
});

test("[ASOAPI-10360] - Ajouter une personne n'ayant pas de compte Daikoku à une équipe", async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(JIM, page)
  await findAndGoToTeam('Vendeurs', page);
  await page.getByText('Membres').click();
  await page.getByRole('button', { name: 'Inviter un collaborateur' }).click();
  await page.getByPlaceholder('Email').fill(PAM.email);
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click(); //todo: warning "Rechercher" is a bad label maybe change in the newer version
  await page.getByText('En attente (1)').click();
  await expect(page.getByRole('main')).toContainText(PAM.name);
  await logout(page);
  await page.goto(EMAIL_UI);
  await expect(page.getByText(PAM.email).first()).toBeVisible();
  await page.getByText('Quelqu\'un vous invite à rejoindre son équipe', { exact: true }).click();
  // todo: Why following link in mail is breaking tests
  // await page.getByRole('link', { name: 'accepter ou rejeter cette demande' }).click();
  // await page.locator('h1').filter({ hasText: 'Notifications (0)' }).waitFor({ state: 'visible' });
  await page.goto(ACCUEIL);
  await loginAs(PAM, page)
  await expect(page.getByText('Vendeurs')).not.toBeVisible();
  await page.getByRole('link', { name: 'Accès aux notifications' }).click();
  await expect(page.getByText('Vous avez été invité•e à rejoindre l\'équipe Vendeurs.')).toBeVisible();
  await page.getByRole('listitem').filter({ hasText: 'Invitation dans une équipe' })
    .getByRole('button', { name: 'Accepter' }).click();
  await page.getByRole('link', { name: 'Liste des APIs' }).click();
  await page.getByRole('button', { name: 'Taper / pour rechercher' }).click();
  await page.getByRole('textbox', { name: 'Rechercher une API, équipe,' }).fill('vendeurs');
  await expect(page.getByRole('link', { name: 'Vendeurs' })).toBeVisible();
});

test("[ASOAPI-10363] - Ajouter une personne n'ayant pas de compte Daikoku à une équipe", async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(JIM, page)
  await findAndGoToTeam('Vendeurs', page);
  await page.getByText('Membres').click();
  await page.getByRole('button', { name: 'Inviter un collaborateur' }).click();
  await page.getByPlaceholder('Email').fill(ANDY.email);
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click(); //todo: warning "Rechercher" is a bad label maybe change in the newer version
  await page.getByText('En attente (1)').click();
  await expect(page.getByRole('main')).toContainText(ANDY.name);
  await logout(page);
  await page.goto(EMAIL_UI);
  await expect(page.getByText(ANDY.email).first()).toBeVisible();
  await page.getByText('Quelqu\'un vous invite à rejoindre son équipe', { exact: true }).click();
  // todo: Why following link in mail is breaking tests
  // await page.getByRole('link', { name: 'accepter ou rejeter cette demande' }).click();
  // await page.locator('h1').filter({ hasText: 'Notifications (0)' }).waitFor({ state: 'visible' });
  await page.goto(ACCUEIL);
  await loginAs(ANDY, page)
  await expect(page.getByText('Vendeurs')).not.toBeVisible();
  await page.getByRole('link', { name: 'Accès aux notifications' }).click();
  await expect(page.getByText('Vous avez été invité•e à rejoindre l\'équipe Vendeurs.')).toBeVisible();
  await page.getByRole('listitem').filter({ hasText: 'Invitation dans une équipe' })
    .getByRole('button', { name: 'Accepter' }).click();
  await page.getByRole('link', { name: 'Liste des APIs' }).click();
  await page.getByRole('button', { name: 'Taper / pour rechercher' }).click();
  await expect(page.getByRole('link', { name: 'Vendeurs' })).toBeVisible();
});

test("[ASOAPI-10362] - Ajouter une personne ayant un compte Daikoku à une équipe", async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(JIM, page)
  await findAndGoToTeam('Logistique', page);
  await page.getByText('Membres').click();
  await page.getByRole('button', { name: 'Inviter un collaborateur' }).click();
  await page.getByPlaceholder('Email').fill(DWIGHT.email);
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click(); //todo: warning "Rechercher" is a bad label maybe change in the newer version
  await page.getByText('En attente (1)').click();
  await expect(page.getByRole('main')).toContainText(DWIGHT.name);
  await logout(page);
  await page.goto(EMAIL_UI);
  await expect(page.getByText(DWIGHT.email).first()).toBeVisible();
  await page.getByText('Quelqu\'un vous invite à rejoindre son équipe', { exact: true }).click();
  // todo: Why following link in mail is breaking tests
  // await page.getByRole('link', { name: 'accepter ou rejeter cette demande' }).click();
  // await page.locator('h1').filter({ hasText: 'Notifications (0)' }).waitFor({ state: 'visible' });
  await page.goto(ACCUEIL);
  await loginAs(DWIGHT, page)
  await expect(page.getByText('Logistique')).not.toBeVisible();
  await page.getByRole('link', { name: 'Accès aux notifications' }).click();
  await expect(page.getByText('Vous avez été invité•e à rejoindre l\'équipe Logistique.')).toBeVisible();
  await page.getByRole('listitem').filter({ hasText: 'Invitation dans une équipe' })
    .getByRole('button', { name: 'Accepter' }).click();
  await page.getByRole('link', { name: 'Liste des APIs' }).click();
  await await page.getByRole('button', { name: 'Taper / pour rechercher' }).click();
  await expect(page.getByRole('link', { name: 'Logistique' })).toBeVisible();
});

test("[ASOAPI-10365/10367] - Modifier les droits d'un utilisateur", async ({ page }) => {
  const getDwightAvatar = (): Locator => {
    return page.locator(".avatar-with-action__infos", { hasText: DWIGHT.name })
  }

  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  await findAndGoToTeam('Vendeurs', page);
  await page.getByText('Membres').click();
  await expect(page.getByRole('main')).toContainText(DWIGHT.name);

  await getDwightAvatar().isVisible();
  await expect(getDwightAvatar().locator("i.fa-shield-alt")).not.toBeVisible();

  await page.locator('.avatar-with-action', { hasText: new RegExp(DWIGHT.name) })
    .locator(".container")
    .hover();

  await page.locator('.avatar-with-action', { hasText: new RegExp(DWIGHT.name) })
    .locator('span.avatar-with-action__action[data-tooltip-content="Gérer les autorisations"]')
    .click();
  await page.locator('.avatar-with-action', { hasText: new RegExp(DWIGHT.name) })
    .locator('span.avatar-with-action__action[data-tooltip-content="Ajouter les droits d\'admin."]')
    .click();

  await getDwightAvatar().isVisible();
  await expect(getDwightAvatar().locator("i.fa-shield-alt")).toBeVisible();

  //todo: tester avec l'api d'admin ?

  await page.locator('.avatar-with-action', { hasText: new RegExp(DWIGHT.name) })
    .locator(".container")
    .hover();

  await page.locator('.avatar-with-action', { hasText: new RegExp(DWIGHT.name) })
    .locator('span.avatar-with-action__action[data-tooltip-content="Gérer les autorisations"]')
    .click();
  await page.locator('.avatar-with-action', { hasText: new RegExp(DWIGHT.name) })
    .locator('span.avatar-with-action__action[data-tooltip-content="Supprimer les droits d\'admin."]')
    .click();

  await getDwightAvatar().isVisible();
  await expect(getDwightAvatar().locator("i.fa-shield-alt")).not.toBeVisible();
});

test("[ASOAPI-10366] - Supprimer un membre d'une équipe", async ({ page }) => {
  // const getDwightAvatar = (): Locator =>  {
  //   return page.locator(".avatar-with-action__infos", { hasText: DWIGHT.name });
  // }

  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  await findAndGoToTeam('Vendeurs', page);
  await page.getByText('Membres').click();
  await expect(page.getByRole('main')).toContainText(DWIGHT.name);

  await page.locator(".avatar-with-action__infos", { hasText: DWIGHT.name }).isVisible();
  await expect(page.locator(".avatar-with-action__infos", { hasText: DWIGHT.name }).locator("i.fa-shield-alt")).not.toBeVisible();

  await page.locator('.avatar-with-action', { hasText: new RegExp(DWIGHT.name) })
    .locator(".container")
    .hover();

  await page.locator('.avatar-with-action', { hasText: new RegExp(DWIGHT.name) })
    .locator('span.avatar-with-action__action[data-tooltip-content="Supprimer le membre"]')
    .click();

  await expect(page.locator('.modal h5')).toContainText('Confirmation');
  await page.getByRole('button', { name: 'Ok' }).click();
  await page.waitForResponse(response => response.url().includes('/members/1AJMQB27BOOSQJC9xeUEwgDJNC5xuUq4') && response.status() === 200)

  await expect(page.locator(".avatar-with-action__infos", { hasText: DWIGHT.name })).toBeHidden();

  //todo: testere  aussi vie l'api d'admin ?
});

test('Voir ses notifications', async ({ page }) => {

  const notifs: Array<NotifProps> = [
    { type: "ApiAccess", sender: JIM, api: apiCommande, team: vendeurs },
    { type: "ApiAccess", sender: JIM, api: apiCommande, team: logistique },
    { type: "ApiAccess", sender: JIM, api: apiCommande, team: teamJim },
    { type: "ApiAccess", sender: JIM, api: apiPapier, team: vendeurs },
    { type: "ApiAccess", sender: JIM, api: apiPapier, team: logistique },
    { type: "ApiAccess", sender: JIM, api: apiPapier, team: teamJim },
    { type: "TransferApiOwnership", sender: MICHAEL, api: apiPapier, team: vendeurs },
    { type: "TransferApiOwnership", sender: MICHAEL, api: apiCommande, team: vendeurs },
    { type: "ApiKeyDeletionInformation", sender: MICHAEL, api: apiCommande, clientId: "apikey 1", team: vendeurs },
    { type: "ApiKeyDeletionInformation", sender: MICHAEL, api: apiCommande, clientId: "apikey 2", team: vendeurs },
    { type: "ApiKeyDeletionInformation", sender: MICHAEL, api: apiCommande, clientId: "apikey 3", team: vendeurs },
    { type: "ApiKeyDeletionInformation", sender: MICHAEL, api: apiCommande, clientId: "apikey 4", team: vendeurs },
    { type: "ApiKeyDeletionInformation", sender: MICHAEL, api: apiCommande, clientId: "apikey 5", team: vendeurs },
    { type: "ApiKeyDeletionInformation", sender: MICHAEL, api: apiCommande, clientId: "apikey 6", team: vendeurs },
    { type: "ApiKeyDeletionInformation", sender: MICHAEL, api: apiCommande, clientId: "apikey 7", team: vendeurs },
    { type: "ApiKeyDeletionInformation", sender: MICHAEL, api: apiCommande, clientId: "apikey 8", team: vendeurs },
    { type: "ApiKeyDeletionInformation", sender: MICHAEL, api: apiCommande, clientId: "apikey 9", team: vendeurs },
    { type: "ApiKeyDeletionInformation", sender: MICHAEL, api: apiCommande, clientId: "apikey 10", team: vendeurs },
    { type: "ApiKeyDeletionInformation", sender: MICHAEL, api: apiCommande, clientId: "apikey 11", team: vendeurs },
    { type: "ApiKeyDeletionInformation", sender: MICHAEL, api: apiCommande, clientId: "apikey 12", team: vendeurs },
    { type: "ApiKeyDeletionInformation", sender: MICHAEL, api: apiCommande, clientId: "apikey 13", team: vendeurs },
    { type: "ApiKeyDeletionInformation", sender: MICHAEL, api: apiCommande, clientId: "apikey 14", team: vendeurs },
    { type: "ApiKeyDeletionInformation", sender: MICHAEL, api: apiCommande, clientId: "apikey 15", team: vendeurs },
    { type: "ApiKeyDeletionInformation", sender: MICHAEL, api: apiCommande, clientId: "apikey 16", team: vendeurs },
    { type: "ApiKeyDeletionInformation", sender: MICHAEL, api: apiCommande, clientId: "apikey 17", team: vendeurs },
    { type: "ApiKeyDeletionInformation", sender: MICHAEL, api: apiCommande, clientId: "apikey 18", team: vendeurs },
    { type: "ApiKeyDeletionInformation", sender: MICHAEL, api: apiCommande, clientId: "apikey 19", team: vendeurs },
    { type: "ApiKeyDeletionInformation", sender: MICHAEL, api: apiCommande, clientId: "apikey 20", team: vendeurs },
    { type: "ApiKeyRefresh", sender: MICHAEL, api: apiCommande, plan: commandeDevPlan, team: vendeurs, subscription: subCommandeDevVendeurs },
    { type: "ApiKeyRefresh", sender: MICHAEL, api: apiCommande, plan: commandeDevPlan, team: vendeurs, subscription: subCommandeDevVendeurs },
    { type: "ApiKeyRefresh", sender: MICHAEL, api: apiCommande, plan: commandeDevPlan, team: vendeurs, subscription: subCommandeDevVendeurs },
    { type: "ApiKeyRefresh", sender: MICHAEL, api: apiCommande, plan: commandeDevPlan, team: vendeurs, subscription: subCommandeDevVendeurs },
    { type: "ApiKeyRefresh", sender: MICHAEL, api: apiCommande, plan: commandeDevPlan, team: vendeurs, subscription: subCommandeDevVendeurs },
    { type: "ApiKeyRefresh", sender: MICHAEL, api: apiCommande, plan: commandeDevPlan, team: vendeurs, subscription: subCommandeDevVendeurs },
    { type: "ApiKeyRefresh", sender: MICHAEL, api: apiCommande, plan: commandeDevPlan, team: vendeurs, subscription: subCommandeDevVendeurs },
    { type: "ApiKeyRefresh", sender: MICHAEL, api: apiCommande, plan: commandeDevPlan, team: vendeurs, subscription: subCommandeDevVendeurs },
    { type: "ApiKeyRefresh", sender: MICHAEL, api: apiCommande, plan: commandeDevPlan, team: vendeurs, subscription: subCommandeDevVendeurs },
    { type: "ApiKeyRefresh", sender: MICHAEL, api: apiCommande, plan: commandeDevPlan, team: vendeurs, subscription: subCommandeDevVendeurs },
    { type: "ApiKeyRefresh", sender: MICHAEL, api: apiCommande, plan: commandeDevPlan, team: vendeurs, subscription: subCommandeDevVendeurs },
    { type: "ApiKeyRefresh", sender: MICHAEL, api: apiCommande, plan: commandeDevPlan, team: vendeurs, subscription: subCommandeDevVendeurs },
    { type: "ApiKeyRefresh", sender: MICHAEL, api: apiCommande, plan: commandeDevPlan, team: vendeurs, subscription: subCommandeDevVendeurs },
    { type: "ApiKeyRefresh", sender: MICHAEL, api: apiCommande, plan: commandeDevPlan, team: vendeurs, subscription: subCommandeDevVendeurs },
    { type: "ApiKeyRefresh", sender: MICHAEL, api: apiCommande, plan: commandeDevPlan, team: vendeurs, subscription: subCommandeDevVendeurs },
    { type: "ApiKeyRefresh", sender: MICHAEL, api: apiCommande, plan: commandeDevPlan, team: vendeurs, subscription: subCommandeDevVendeurs },
  ]


  await Promise.all(notifs.map(n => postNewNotif(n)))

  await page.goto(ACCUEIL);
  await loginAs(JIM, page)
});

test('Se créer un compte avec un process de souscription local', async ({ page }) => {
  // update auth to local and setup account creation workflow
  await fetch(`http://localhost:${exposedPort}/admin-api/tenants/${tenant}`, {
    method: 'PATCH',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      {
        "op": "replace",
        "path": "/accountCreationProcess",
        "value": [
          {
            "id": "09SAW0n8fKWl7BQB17iGw8IlYRjupWcp",
            "type": "form",
            "title": "form",
            "schema": {
              "name": {
                "type": "string",
                "label": "Name",
                "constraints": [
                  {
                    "type": "required",
                    "message": "Your name is required"
                  }
                ]
              },
              "email": {
                "type": "string",
                "label": "Email",
                "constraints": [
                  {
                    "type": "required",
                    "message": "Your email is required"
                  },
                  {
                    "type": "email",
                    "message": "Your email needs to be an email"
                  }
                ]
              },
              "password": {
                "type": "string",
                "label": "Password",
                "format": "password",
                "name": "signup_password",
                "constraints": [
                  {
                    "type": "required",
                    "message": "Your password is required"
                  },
                  {
                    "type": "matches",
                    "regexp": "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[#$^+=!*()@%&]).{8,1000}$",
                    "message": "Votre mot de passe doit avoir 8 lettres min. et contenir au moins une lettre capitale, un nombre et un caractère spécial (#$^+=!*()@%&)."
                  }
                ]
              },
              "confirmPassword": {
                "type": "string",
                "label": "Confirm password",
                "format": "password",
                "name": "signup_confrim_password",
                "constraints": [
                  {
                    "type": "required",
                    "message": "a confirm password is required"
                  },
                  {
                    "type": "oneOf",
                    "message": "confirm password and password must be equal",
                    "arrayOfValues": [
                      {
                        "ref": "password"
                      }
                    ]
                  }
                ]
              }
            },
            "formatter": ""
          },
          {
            "id": "pd9mRGdDlhLSjFTEQSPPsxWKnrQEl6To",
            "type": "email",
            "title": "confirmation email",
            "emails": [
              "${form.email}"
            ],
            "message": ""
          },
          {
            "id": "GYeRKPcjnm2bGSSQQIZI5",
            "team": "0k7D3RIkcDwsZJQ36ml6A6qjC1PdeiY4U0pBRQDX3uyBsdkYJYdDaBc0E1YnKQFC",
            "type": "teamAdmin",
            "title": "admin validation"
          }
        ]
      },
      {
        "op": "replace",
        "path": "/authProviderSettings/authProvider",
        "value": "Local"
      },
      {
        "op": "replace",
        "path": "/authProvider",
        "value": "Local"
      }
    ])
  })

  await fetch(`http://localhost:${exposedPort}/admin-api/users/${MICHAEL.id}`, {
    method: 'PATCH',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      {
        "op": "replace",
        "path": "/password",
        "value": "$2a$10$/Vpj1lFN0AcCfbutd7FJwO0j1vU4X0fR6t.4vvWBqSEqtoUFFxfDG"
      },
      {
        "op": "replace",
        "path": "/origins/0",
        "value": "LOCAL"
      }
    ])
  })

  //patch micheal scott as local user

  //create new account
  await page.goto(ACCUEIL);
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Créer un compte' }).click();
  await page.getByRole('textbox', { name: 'Nom' }).fill(PAM.name);
  await page.getByRole('textbox', { name: 'Email' }).fill(PAM.email);
  await page.locator('#signup_password').fill("Passw0rd!");
  await page.getByRole('textbox', { name: 'Confirmation de mot de passe' }).fill("Passw0rd!");
  await page.getByRole('button', { name: 'Création d\'un compte' }).click();
  await expect(page.getByRole('heading', { name: 'Confirmation de votre compte' })).toBeVisible();
  await page.getByRole('heading', { name: 'Confirmation de votre compte' }).click();
  await page.goto(EMAIL_UI);
  await page.getByText('Confirmez votre adresse e-mail pour activer votre compte Dunder Mifflin', { exact: true }).click();
  const page2Promise = page.waitForEvent('popup');
  await page.getByRole('link', { name: '👉 [Confirmer mon adresse e-mail' }).click();
  const page2 = await page2Promise;
  await expect(page2.getByText('Merci pour votre réponse')).toBeVisible();
  await page.goto(ACCUEIL);
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('textbox', { name: 'Courriel' }).fill(MICHAEL.email);
  await page.getByRole('textbox', { name: 'Mot de passe' }).fill('password');
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await page.getByRole('link', { name: 'Accès aux notifications' }).click();
  await expect(page.getByRole('article', { name: 'Demande de création de compte' })).toContainText('Pam Beesly');
  await page.getByRole('article', { name: 'Demande de création de compte' }).getByRole('button', { name: 'Accepter' }).click();
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('textbox', { name: 'Courriel' }).fill(PAM.email);
  await page.getByRole('textbox', { name: 'Mot de passe' }).fill('Passw0rd!');
  await page.getByRole('button', { name: 'Se connecter' }).click();

  // await page.getByRole('heading', {name: 'Vos équipes'}).waitFor({ state: 'visible' });
  await page.getByRole('img', { name: 'user menu' }).click();
  await expect(page.locator('#app')).toContainText(PAM.email);
})


test('[Local] - Ajouter une personne n\'ayant pas de compte Daikoku à une équipe', async ({ page }) => {
  // update auth to local and setup account creation workflow
  await fetch(`http://localhost:${exposedPort}/admin-api/tenants/${tenant}`, {
    method: 'PATCH',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      {
        "op": "replace",
        "path": "/accountCreationProcess",
        "value": [
          {
            "id": "09SAW0n8fKWl7BQB17iGw8IlYRjupWcp",
            "type": "form",
            "title": "form",
            "schema": {
              "name": {
                "type": "string",
                "label": "Name",
                "constraints": [
                  {
                    "type": "required",
                    "message": "Your name is required"
                  }
                ]
              },
              "email": {
                "type": "string",
                "label": "Email",
                "constraints": [
                  {
                    "type": "required",
                    "message": "Your email is required"
                  },
                  {
                    "type": "email",
                    "message": "Your email needs to be an email"
                  }
                ]
              },
              "password": {
                "type": "string",
                "label": "Password",
                "format": "password",
                "name": "signup_password",
                "constraints": [
                  {
                    "type": "required",
                    "message": "Your password is required"
                  },
                  {
                    "type": "matches",
                    "regexp": "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[#$^+=!*()@%&]).{8,1000}$",
                    "message": "Votre mot de passe doit avoir 8 lettres min. et contenir au moins une lettre capitale, un nombre et un caractère spécial (#$^+=!*()@%&)."
                  }
                ]
              },
              "confirmPassword": {
                "type": "string",
                "label": "Confirm password",
                "format": "password",
                "name": "signup_confrim_password",
                "constraints": [
                  {
                    "type": "required",
                    "message": "a confirm password is required"
                  },
                  {
                    "type": "oneOf",
                    "message": "confirm password and password must be equal",
                    "arrayOfValues": [
                      {
                        "ref": "password"
                      }
                    ]
                  }
                ]
              }
            },
            "formatter": ""
          },
          {
            "id": "pd9mRGdDlhLSjFTEQSPPsxWKnrQEl6To",
            "type": "email",
            "title": "confirmation email",
            "emails": [
              "${form.email}"
            ],
            "message": "confirm"
          }
        ]
      },
      {
        "op": "replace",
        "path": "/authProviderSettings/authProvider",
        "value": "Local"
      },
      {
        "op": "replace",
        "path": "/authProvider",
        "value": "Local"
      }
    ])
  })

  await fetch(`http://localhost:${exposedPort}/admin-api/users/${MICHAEL.id}`, {
    method: 'PATCH',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      {
        "op": "replace",
        "path": "/password",
        "value": "$2a$10$/Vpj1lFN0AcCfbutd7FJwO0j1vU4X0fR6t.4vvWBqSEqtoUFFxfDG"
      },
      {
        "op": "replace",
        "path": "/origins/0",
        "value": "LOCAL"
      }
    ])
  })

  //create new account
  await page.goto(ACCUEIL);
  await loginLocalAs(MICHAEL, page);

  await page.locator('span').filter({ hasText: 'API Division' }).click();
  await page.getByText('Membres').click();
  await page.getByRole('button', { name: 'Inviter un collaborateur' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill(ROBERT.email);
  await page.getByRole('button', { name: 'Envoyer l\'invitation' }).click();
  await expect(page.getByText('En attente (1)')).toBeVisible();
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();
  await page.goto('http://localhost:1080/');
  await expect(page.locator('div').filter({ hasText: /^robert\.california@dundermifflin\.com$/ })).toBeVisible();
  await page.getByText('Rejoindre l\'équipe API Division', { exact: true }).click();
  await page.getByRole('link', { name: 'Cliquez pour rejoindre l\'é' }).click();
  await expect(page.getByRole('heading', { name: 'team invitation' })).toBeVisible();
  await page.getByRole('button', { name: 'Accepter' }).click();
  await expect(page.getByRole('heading', { name: 'Inscription à Dunder Mifflin' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Nom' }).fill(ROBERT.name);
  await page.getByRole('textbox', { name: 'Email' }).fill(ROBERT.email);
  await page.getByRole('textbox', { name: 'Mot de passe', exact: true }).fill(ROBERT.password!);
  await page.getByRole('textbox', { name: 'Confirmation de mot de passe' }).fill(ROBERT.password!);
  await page.getByRole('button', { name: 'Création d\'un compte' }).click();

  await expect(page.getByRole('heading', { name: 'Confirmation de votre compte' })).toBeVisible();

  await page.goto('http://localhost:1080/');
  await page.getByText('Confirmez votre adresse e-mail pour activer votre compte Dunder Mifflin', { exact: true }).click();

  const page2Promise = page.waitForEvent('popup');
  await page.getByRole('link', { name: '👉 [Confirmer mon adresse e-' }).click();
  const page2 = await page2Promise;

  await expect(page2.getByRole('heading', { name: 'Adresse email confirmée' })).toBeVisible();

  await loginLocalAs(ROBERT, page2);

  await page2.getByRole('link', { name: 'Accès aux notifications' }).click();
  await expect(page2.getByText('Vous avez été invité•e à')).toBeVisible();
  await page2.getByRole('button', { name: 'Accepter' }).click();
  await page2.getByRole('link', { name: 'Liste des APIs' }).click();
  await expect(page2.locator('span').filter({ hasText: 'API Division' })).toBeVisible();
})

test('[Local] - Valider la creation d\'un compte avec un process de souscription local', async ({ page }) => {
  // update auth to local and setup account creation workflow
  await fetch(`http://localhost:${exposedPort}/admin-api/tenants/${tenant}`, {
    method: 'PATCH',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      {
        "op": "replace",
        "path": "/accountCreationProcess",
        "value": [
          {
            "id": "09SAW0n8fKWl7BQB17iGw8IlYRjupWcp",
            "type": "form",
            "title": "form",
            "schema": {
              "name": {
                "type": "string",
                "label": "Name",
                "constraints": [
                  {
                    "type": "required",
                    "message": "Your name is required"
                  }
                ]
              },
              "email": {
                "type": "string",
                "label": "Email",
                "constraints": [
                  {
                    "type": "required",
                    "message": "Your email is required"
                  },
                  {
                    "type": "email",
                    "message": "Your email needs to be an email"
                  }
                ]
              },
              "password": {
                "type": "string",
                "label": "Password",
                "format": "password",
                "name": "signup_password",
                "constraints": [
                  {
                    "type": "required",
                    "message": "Your password is required"
                  },
                  {
                    "type": "matches",
                    "regexp": "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[#$^+=!*()@%&]).{8,1000}$",
                    "message": "Votre mot de passe doit avoir 8 lettres min. et contenir au moins une lettre capitale, un nombre et un caractère spécial (#$^+=!*()@%&)."
                  }
                ]
              },
              "confirmPassword": {
                "type": "string",
                "label": "Confirm password",
                "format": "password",
                "name": "signup_confrim_password",
                "constraints": [
                  {
                    "type": "required",
                    "message": "a confirm password is required"
                  },
                  {
                    "type": "oneOf",
                    "message": "confirm password and password must be equal",
                    "arrayOfValues": [
                      {
                        "ref": "password"
                      }
                    ]
                  }
                ]
              }
            },
            "formatter": ""
          },
          {
            "id": "pd9mRGdDlhLSjFTEQSPPsxWKnrQEl6To",
            "type": "email",
            "title": "account creation validation",
            "emails": [
              "confirmation@foo.bar"
            ],
            "message": "confirm ?"
          }
        ]
      },
      {
        "op": "replace",
        "path": "/authProviderSettings/authProvider",
        "value": "Local"
      },
      {
        "op": "replace",
        "path": "/authProvider",
        "value": "Local"
      }
    ])
  })

  await fetch(`http://localhost:${exposedPort}/admin-api/users/${MICHAEL.id}`, {
    method: 'PATCH',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      {
        "op": "replace",
        "path": "/password",
        "value": "$2a$10$/Vpj1lFN0AcCfbutd7FJwO0j1vU4X0fR6t.4vvWBqSEqtoUFFxfDG"
      },
      {
        "op": "replace",
        "path": "/origins/0",
        "value": "LOCAL"
      }
    ])
  })

  //create new account
  await page.goto(`http://localhost:${exposedPort}/signup`);

  await expect(page.getByRole('heading', { name: 'Inscription à Dunder Mifflin' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Nom' }).fill(ROBERT.name);
  await page.getByRole('textbox', { name: 'Email' }).fill(ROBERT.email);
  await page.getByRole('textbox', { name: 'Mot de passe', exact: true }).fill(ROBERT.password!);
  await page.getByRole('textbox', { name: 'Confirmation de mot de passe' }).fill(ROBERT.password!);
  await page.getByRole('button', { name: 'Création d\'un compte' }).click();

  await expect(page.getByRole('heading', { name: 'Confirmation de votre compte' })).toBeVisible();

  await page.goto('http://localhost:1080/');

  await page.getByText('Nouvelle inscription à valider sur Dunder Mifflin', { exact: true }).click();

  const page2Promise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'accepter' }).click();
  const page2 = await page2Promise;

  await expect(page2.getByRole('heading', { name: 'Création de compte approuvée' })).toBeVisible();

  await loginLocalAs(ROBERT, page2)
  await expect(page2.getByRole('listitem', {name: 'API papier'})).toBeVisible();
})
