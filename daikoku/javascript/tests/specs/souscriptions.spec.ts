import test, { expect } from '@playwright/test';
import otoroshi_data from '../config/otoroshi/otoroshi-state.json';
import { generateApi, generatePlan, saveApi, savePlan } from './apis';
import { JIM, MICHAEL, IUser, DWIGHT } from './users';
import { ACCUEIL, adminApikeyId, adminApikeySecret, apiDivision, EMAIL_UI, exposedPort, findAndGoToTeam, HOME, loginAs, logistiqueCommandeProdApiKeyId, logout, otoroshiAdminApikeyId, otoroshiAdminApikeySecret, otoroshiDevCommandRouteId, otoroshiDevPaperRouteId, updateUserRightForTeam, vendeurs, vendeursPapierExtendedDevApiKeyId } from './utils';


test.beforeEach(async () => {
  await Promise.all([
    fetch(`http://localhost:${exposedPort}/admin-api/state/reset`, {
      method: 'POST',
      headers: {
        "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
      }
    }),
    fetch('http://localhost:1080/api/emails', {
      method: 'DELETE'
    }),
    fetch(`http://otoroshi-api.oto.tools:8080/api/otoroshi.json`, {
      method: 'POST',
      headers: {
        "Otoroshi-Client-Id": otoroshiAdminApikeyId,
        "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
        "Host": "otoroshi-api.oto.tools",
      },
      body: JSON.stringify(otoroshi_data)
    })
  ])
})

test('[ASOAPI-10160] - souscrire à une api', async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  await page.getByRole('link', { name: 'API papier' }).click();
  await page.getByText('Environnements').click();
  await page.getByRole('button', { name: 'Demander une clé d\'API' }).click();
  await page.getByText('Vendeurs').click();
  await page.getByRole('button', { name: 'Souscrire avec un nouveau trousseau' }).click();
  await page.getByLabel('motivation').click();
  await page.getByLabel('motivation').fill('please');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByRole('region', { name: 'Notifications' })).toContainText('La demande de clé d\'API au plan prod pour l\'équipe Vendeurs est en attente de validation');
  await page.getByLabel('Accès aux notifications').click();
  await expect(page.getByLabel('Notifications', { exact: true })).toContainText('0');
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();

  await loginAs(MICHAEL, page);

  //todo: acces aux mail et verifier le message
  await page.getByLabel('Accès aux notifications').click();
  await expect(page.getByLabel('Notifications', { exact: true })).toContainText('1');
  await expect(page.getByRole('listitem')).toContainText('Nouvelle demande de souscription pour l\'environnement prod.');
  await page.getByLabel('Accepter').click();
  await page.getByLabel('Nom personnalisé de la clé').fill('vendeurs - clé pour API papier');
  await page.getByRole('dialog', { name: 'Métadonnées de souscription' }).getByRole('button', { name: 'Accepter' }).click();
  await expect(page.getByLabel('Notifications', { exact: true })).toContainText('0');
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();

  await loginAs(JIM, page);

  //todo: acces aux notification et verifier la notification
  //todo: accepter la notification
  await findAndGoToTeam('Vendeurs', page);
  await page.getByText('Clés d\'API').click();
  await page.getByRole('row', { name: 'API papier' }).getByLabel('Voir les clés d\'API').click();
  await expect(page.locator('h1')).toContainText('API papier');
  await page.locator('.keyring-card', { hasText: 'prod' }).getByRole('button', { name: 'Copier le clientId et le clientSecret' }).click();
  const apikey = await page.evaluate(() => navigator.clipboard.readText());
  const [clientId, clientSecret] = apikey.split(":", 2)

  const maybeKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${clientId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  })
  await expect(maybeKey.status).toBe(200)
  const otoroshiKey = await maybeKey.json()

  await expect(otoroshiKey.clientId).toBe(clientId)
  await expect(otoroshiKey.clientSecret).toBe(clientSecret)
});

test('[ASOAPI-10163] - souscrire à une api avec refus', async ({ page, context }) => {
  test.setTimeout(60_000);

  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  await page.getByRole('link', { name: 'API papier' }).click();
  await page.getByText('Environnements').click();
  await page.getByRole('button', { name: 'Demander une clé d\'API' }).click();
  await page.getByText('Vendeurs').click();
  await page.getByRole('button', { name: 'Souscrire avec un nouveau trousseau' }).click();
  await page.getByLabel('motivation').click();
  await page.getByLabel('motivation').fill('please');
  await page.getByRole('button', { name: 'Envoyer' }).click(); //todo: ??? region ???
  await expect(page.getByRole('region', { name: 'Notifications' })).toContainText('La demande de clé d\'API au plan prod pour l\'équipe Vendeurs est en attente de validation');
  await page.getByLabel('Accès aux notifications').click();
  await expect(page.getByLabel('Notifications', { exact: true })).toContainText('0');
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();

  await loginAs(MICHAEL, page);
  await page.getByLabel('Accès aux notifications').click();
  await expect(page.getByLabel('Notifications', { exact: true })).toContainText('1');
  await expect(page.getByRole('listitem')).toContainText('Nouvelle demande de souscription pour l\'environnement prod.');
  await page.getByRole('article', { name: 'Nouvelle souscription par Jim Halpert' })
    .getByRole('button', { name: 'Rejeter' }).click();
  // await page.getByRole('dialog').locator('#message').click();
  await page.getByRole('dialog').locator('#message').fill('désolé');
  await page.getByRole('dialog').getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByLabel('Notifications', { exact: true })).toContainText('0');
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();

  await loginAs(JIM, page);

  const emailPage = await context.newPage();
  await emailPage.goto(EMAIL_UI);
  await expect(emailPage.locator('#root')).toContainText('Votre demande a été rejetée.');
  await emailPage.getByText('Votre demande a été rejetée.').first().click();
  await expect(emailPage.locator('#root')).toContainText('en raison de: désolé.');


  await page.goto(ACCUEIL);
  await findAndGoToTeam('Vendeurs', page);
  await page.getByText('Clés d\'API').click();
  await page.getByRole('row', { name: 'API papier' }).getByLabel('Voir les clés d\'API').click();
  await expect(page.locator('h1')).toContainText('API papier');
  await expect(page.locator('.keyring-card', { hasText: 'prod' })).toBeHidden();
  await page.getByLabel('Accès aux notifications').click();
  await expect(page.getByLabel('Notifications', { exact: true })).toContainText('1');
  await expect(page.getByRole('listitem')).toContainText('Votre demande de souscription (prod) a été refusée.');
  await page.getByRole('article', { name: 'Souscription refusée' })
    .getByRole('link', { name: 'Voir plus' }).click();
  await expect(page.getByRole('dialog')).toContainText('désolé');
  //todo: accepter la notification
});

test('[ASOAPI-10161] - Demander une extension d\'apikey - process automatique', async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  await page.getByRole('link', { name: 'API papier' }).click();
  await page.getByText('Environnements').click();
  await page.getByRole('button', { name: 'Obtenir une clé d\'API' }).click();
  await page.getByText('Logistique').click();
  await page.getByRole('button', { name: 'Souscrire en l\'ajoutant à un trousseau existant' }).click();
  await page.locator('.keyring-option', { hasText: 'dev' }).click();

  await page.goto(ACCUEIL);
  await findAndGoToTeam('Logistique', page);
  await page.getByText('Clés d\'API').click();
  await expect(page.locator('td', { 'hasText': 'APi Commande' })).toBeVisible();
  await expect(page.locator('td', { 'hasText': 'APi papier' })).toBeVisible();
  await page.locator('tr', { hasText: 'API papier' }).getByLabel('Voir les clés d\'API').click();
  await expect(page.getByRole('main')).toContainText('dev');
  await page.getByRole('button', { name: 'Copier le clientId' }).click();
  const apikey = await page.evaluate(() => navigator.clipboard.readText());
  const papierApiKey = apikey.split(":", 2);
  const [clientId, clientSecret] = papierApiKey;
  await page.getByText('Clés d\'API').click();
  await page.locator('tr', { hasText: 'API Commande' }).getByLabel('Voir les clés d\'API').click();
  await expect(page.getByRole('main')).toContainText('dev');
  await page.locator('.keyring-card', { hasText: 'dev' })
    .getByRole('button', { name: 'Copier le clientId' }).click();
  const _apikey = await page.evaluate(() => navigator.clipboard.readText());
  const commandeApiKey = _apikey.split(":", 2);

  await expect(commandeApiKey[0]).toBe(papierApiKey[0])
  await expect(commandeApiKey[1]).toBe(papierApiKey[1])

  const maybeKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${clientId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  })
  await expect(maybeKey.status).toBe(200)
  const otoroshiKey = await maybeKey.json()

  await expect(otoroshiKey.clientId).toBe(clientId)
  await expect(otoroshiKey.clientSecret).toBe(clientSecret)
});

test('[ASOAPI-10161] - Demander une extension d\'apikey - process manuel', async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  await page.getByRole('link', { name: 'API papier' }).click();
  await page.getByText('Environnements').click();
  await page.locator('.usage-plan__card', { hasText: 'prod' }).getByRole('button', { name: 'Demander une clé d\'API' }).click();
  await page.getByText('Logistique').click();
  await page.getByRole('button', { name: 'Souscrire en l\'ajoutant à un trousseau existant' }).click();
  await page.locator('.keyring-option', { hasText: 'prod' }).click();
  await page.getByLabel('motivation').fill('please');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await logout(page)

  await loginAs(MICHAEL, page);
  await page.getByLabel('Accès aux notifications').click();

  await expect(page.getByLabel('Notifications', { exact: true })).toContainText('1');
  await expect(page.getByRole('listitem')).toContainText('Nouvelle demande de souscription pour l\'environnement prod.');
  await page.getByRole('article', { name: 'Nouvelle souscription par Jim' })
    .getByRole('button', { name: 'Accepter' }).click();
  await page.getByLabel('Nom personnalisé de la clé').fill('veudeurs - clé pour API papier');
  await page.getByRole('dialog').getByRole('button', { name: 'Accepter' }).click();
  await expect(page.getByLabel('Notifications', { exact: true })).toContainText('1');
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();

  await loginAs(JIM, page);
  await page.goto(ACCUEIL);
  await findAndGoToTeam('Logistique', page);
  await page.getByText('Clés d\'API').click();
  await expect(page.locator('td', { 'hasText': 'API Commande' })).toBeVisible();
  await expect(page.locator('td', { 'hasText': 'API papier' })).toBeVisible();
  await page.locator('tr', { hasText: 'API papier' }).getByLabel('Voir les clés d\'API').click();
  await expect(page.getByRole('main')).toContainText('prod');
  await page.locator('.keyring-card', { hasText: 'prod' }).getByRole('button', { name: 'Copier le clientId' }).click();
  const apikey = await page.evaluate(() => navigator.clipboard.readText());
  const papierApiKey = apikey.split(":", 2);
  const [clientId, clientSecret] = papierApiKey;
  await page.getByText('Clés d\'API').click();
  await page.locator('tr', { hasText: 'API Commande' }).getByLabel('Voir les clés d\'API').click();
  await expect(page.getByRole('main')).toContainText('prod');
  await page.locator('.keyring-card', { hasText: 'prod' }).getByRole('button', { name: 'Copier le clientId' }).click();
  const _apikey = await page.evaluate(() => navigator.clipboard.readText());
  const commandeApiKey = _apikey.split(":", 2);

  await expect(commandeApiKey[0]).toBe(papierApiKey[0])
  await expect(commandeApiKey[1]).toBe(papierApiKey[1])



  const maybeKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${clientId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  })
  await expect(maybeKey.status).toBe(200)
  const otoroshiKey = await maybeKey.json()

  await expect(otoroshiKey.clientId).toBe(clientId)
  await expect(otoroshiKey.clientSecret).toBe(clientSecret)
});

// test('[ASOAPI-10691] - Demander une extension d\apikey - fast mode', async ({ page, context }) => {
//   await context.grantPermissions(["clipboard-read", "clipboard-write"]);

//   await page.goto(ACCUEIL);
//   await loginAs(JIM, page);
//   await page.getByRole('button', { name: "Afficher plus d'options" }).click();
//   await page.getByRole('link', { name: 'Accéder au mode rapide' }).click();
//   await page.locator('.reactSelect__input-container').click();
//   await page.getByRole('option', { name: 'Logistique' }).click();
//   await page.getByRole('button', { name: 'Obtenir une clé d\'API' }).click();
//   await page.getByRole('button', { name: 'Souscrire en l\'ajoutant à un trousseau existant' }).click();
//   await page.getByText('API Commande/dev').click();

//   await page.goto(ACCUEIL);
//   await page.getByText('Logistique').click();
//   await page.getByText('Clés d\'API').click();
//   await expect(page.locator('td', { 'hasText': 'APi Commande' })).toBeVisible();
//   await expect(page.locator('td', { 'hasText': 'APi papier' })).toBeVisible();
//   await page.locator('tr', { hasText: 'API papier' }).getByLabel('Voir les clés d\'API').click();
//   await expect(page.getByRole('main')).toContainText('dev');
//   await page.getByRole('button', { name: 'Copier le clientId' }).click();
//   const apikey = await page.evaluate(() => navigator.clipboard.readText());
//   const papierApiKey = apikey.split(":", 2);
//   const [clientId, clientSecret] = papierApiKey;
//   await page.getByText('Clés d\'API').click();
//   await page.locator('tr', { hasText: 'API Commande' }).getByLabel('Voir les clés d\'API').click();
//   await expect(page.getByRole('main')).toContainText('dev');
//   await page.locator('.keyring-card', { hasText: 'dev' })
//     .getByRole('button', { name: 'Copier le clientId' }).click();
//   const _apikey = await page.evaluate(() => navigator.clipboard.readText());
//   const commandeApiKey = _apikey.split(":", 2);

//   await expect(commandeApiKey[0]).toBe(papierApiKey[0])
//   await expect(commandeApiKey[1]).toBe(papierApiKey[1])

//   const maybeKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${clientId}`, {
//     method: 'GET',
//     headers: {
//       "Otoroshi-Client-Id": otoroshiAdminApikeyId,
//       "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
//     },
//   })
//   await expect(maybeKey.status).toBe(200)
//   const otoroshiKey = await maybeKey.json()

//   await expect(otoroshiKey.clientId).toBe(clientId)
//   await expect(otoroshiKey.clientSecret).toBe(clientSecret)
// });

test('[ASOAPI-10164] - Demander une extension d\'apikey - process manuel - refus', async ({ page, context }) => {
  test.setTimeout(90_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  await page.getByRole('link', { name: 'API papier' }).click();
  await page.getByText('Environnements').click();
  await page.locator('.usage-plan__card', { hasText: 'prod' }).getByRole('button', { name: 'Demander une clé d\'API' }).click();
  await page.getByText('Logistique').click();
  await page.getByRole('button', { name: 'Souscrire en l\'ajoutant à un trousseau existant' }).click();
  await page.locator('.keyring-option', { hasText: 'prod' }).click();
  await page.getByLabel('motivation').fill('please');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await logout(page);

  await loginAs(MICHAEL, page);
  await page.getByLabel('Accès aux notifications').click();
  await expect(page.getByLabel('Notifications', { exact: true })).toContainText('1');
  await expect(page.getByRole('listitem')).toContainText('Nouvelle demande de souscription pour l\'environnement prod.');
  await page.getByRole('article', { name: 'Nouvelle souscription par Jim Halpert' })
    .getByLabel('Rejeter').click();
  await page.locator('#message').fill('désolé');
  await page.getByRole('dialog').getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByLabel('Notifications', { exact: true })).toContainText('0');
  await logout(page);

  await loginAs(JIM, page);
  await page.goto(EMAIL_UI);
  await expect(page.locator('#root')).toContainText('Votre demande a été rejetée.');
  await page.getByText('Votre demande a été rejetée.').first().click();
  await expect(page.locator('#root')).toContainText('en raison de: désolé.');

  await page.goto(ACCUEIL);
  await findAndGoToTeam('Vendeurs', page);
  await page.getByText('Clés d\'API').click();
  await page.getByRole('row', { name: 'API papier' }).getByLabel('Voir les clés d\'API').click();
  await expect(page.locator('h1')).toContainText('API papier');
  await expect(page.locator('.keyring-card', { hasText: 'prod' })).toBeHidden();

  await page.getByLabel('Accès aux notifications').click();
  await expect(page.getByLabel('Notifications', { exact: true })).toContainText('1');
  await expect(page.getByRole('listitem')).toContainText('Votre demande de souscription (prod) a été refusée.');
  await page.getByRole('article', { name: 'Souscription refusée' })
    .getByRole('link', { name: 'Voir plus' }).click();
  await expect(page.getByRole('dialog')).toContainText('désolé');

  await page.goto(ACCUEIL);
  await findAndGoToTeam('Logistique', page);
  await page.getByText('Clés d\'API').click();
  await expect(page.locator('td', { 'hasText': 'API Commande' })).toBeVisible();
  await expect(page.locator('td', { 'hasText': 'API papier' })).not.toBeVisible();
  await page.locator('tr', { hasText: 'API Commande' }).getByLabel('Voir les clés d\'API').click();
  await expect(page.getByRole('main')).toContainText('prod');
  await page.locator('.keyring-card', { hasText: 'prod' }).getByRole('button', { name: 'Copier le clientId' }).click();
  const apikey = await page.evaluate(() => navigator.clipboard.readText());
  const [clientId, clientSecret] = apikey.split(":", 2);

  const maybeKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${clientId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  })
  await expect(maybeKey.status).toBe(200)
  const otoroshiKey = await maybeKey.json()

  await expect(otoroshiKey.clientId).toBe(clientId)
  await expect(otoroshiKey.clientSecret).toBe(clientSecret)
});


test('[ASOAPI-10421] - Renommer sa clé d\'api', async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  await findAndGoToTeam('Logistique', page);
  await page.getByText('Clés d\'API').click();
  await page.getByRole('row', { name: 'API Commande' }).getByLabel('Voir les clés d\'API').click();
  const card = page.locator('.keyring-card', { hasText: 'dev' });
  await card.getByLabel('Actions de la souscription').click();
  await card.getByText('Mettre à jour le nom perso.').click();
  await page.getByPlaceholder('Nom personnalisé').fill('logistique - api commande - environnement dev');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('region', { name: 'Notifications' })).toContainText('Le nom personnalisé de votre souscription a été mis à jour avec succès');
  await expect(page.getByRole('main')).toContainText('logistique - api commande - environnement dev');
})

test('[ASOAPI-10414] - [producteur] - Renommer une clé d\'api', async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await page.getByRole('link', { name: 'API Commande' }).click();
  await page.getByText('Souscriptions').click();
  const oldName = await page.locator('td', { hasText: 'commande-prod' }).innerText();
  await expect(page.locator('tbody')).toContainText('daikoku-api-key-api-commande-prod-logistique-1737463823426-1.0.0');
  await expect(page.locator('tbody')).toContainText(oldName);

  await page.getByRole('row', { name: 'commande-prod' }).getByRole('button', { name: 'Mettre à jour les métadonnées' }).click();
  await page.getByLabel('Nom personnalisé de la clé').fill('logistique-commande-dev');
  await page.getByRole('button', { name: 'Mettre à jour', exact: true }).click();
  await expect(page.locator('tbody')).toContainText('logistique-commande-dev');
  await expect(page.locator('tbody')).not.toContainText(oldName);
})

test('[ASOAPI-10398 ASOAPI-10399] - [producteur] - désactiver/activer une clé d\'api', async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await page.getByRole('link', { name: 'API Commande' }).click();
  await page.getByText('Souscriptions').click();
  await page.getByRole('row', { name: 'api-commande-prod' }).getByRole('switch', { name: 'Désactiver la souscription' }).click();
  //wait return of api
  await page.waitForResponse(r => r.url().includes('/_archiveByOwner?enabled=false') && r.status() === 200);
  //test in otoroshi
  const maybeKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${logistiqueCommandeProdApiKeyId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  });
  await expect(maybeKey.status).toBe(200);
  const apiKey = await maybeKey.json();
  await expect(apiKey.enabled).toBe(false);

  await page.waitForTimeout(500);
  await page.getByRole('row', { name: 'api-commande-prod' }).getByRole('switch', { name: 'Activer la souscription' }).click();

  //wait return of api
  const response = await page.waitForResponse(r => r.url().includes('/_archiveByOwner?enabled=true') && r.status() === 200);
  const r = await response.json()
  //test in otoroshi
  const maybeKey2 = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${logistiqueCommandeProdApiKeyId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  });
  await expect(maybeKey2.status).toBe(200);
  const apiKey2 = await maybeKey2.json();
  await expect(apiKey2.enabled).toBe(true);
})

test('[ASOAPI-10400] - [producteur] - supprimer definitivement une clé d\'api', async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await page.getByRole('link', { name: 'API Commande' }).click();
  await page.getByText('Souscriptions').click();
  await page.getByRole('row', { name: 'api-commande-prod' })
    .getByRole('button', { name: 'Supprimer la souscription' })
    .click();
  await expect(page.locator('h5')).toContainText('Suppression d\'une souscription');
  await page.getByRole('button', { name: 'Oui' }).click();
  await expect(page.getByRole('region', { name: 'Notifications' })).toContainText('Souscription supprimée.');
  //test in otoroshi
  const maybeKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${logistiqueCommandeProdApiKeyId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  });
  await expect(maybeKey.status).toBe(404);
})

test('[ASOAPI-10457 ASOAPI-10458] - [Consommateur] - desactiver/reactiver un clé', async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  await findAndGoToTeam('Logistique', page);
  await page.getByText('Clés d\'API').click();
  //Voir les clé d'api pour api Commande
  await page.getByRole('row', { name: 'API Commande' }).getByLabel('Voir les clés d\'API').click();
  // On va manipuler la clé pour l'environnement de prod
  //Vérifier que la clé est activé
  const card = page.locator('.keyring-card', { hasText: 'prod' });
  await expect(card.locator('.api-subscription__value__type')).toContainText('Activé');
  //desactiver la clé
  await card.getByLabel('Actions de la souscription').click();
  await card.getByText('Désactiver la souscription').click();
  //verifier que la clé est désactiver
  await expect(card.locator('.api-subscription__value__type')).toContainText('Désactivé');
  const maybeKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${logistiqueCommandeProdApiKeyId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  });
  await expect(maybeKey.status).toBe(200);
  const apikey = await maybeKey.json()
  await expect(apikey.enabled).toBe(false)

  //activer la clé
  await card.getByLabel('Actions de la souscription').click();
  await card.getByText('Activer la souscription').click();
  //verifier que la clé est réactivée
  await expect(card.locator('.api-subscription__value__type')).toContainText('Activé');
  const _maybeKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${logistiqueCommandeProdApiKeyId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  });
  await expect(_maybeKey.status).toBe(200);
  const _apikey = await _maybeKey.json()
  await expect(_apikey.enabled).toBe(true)
})

test('[ASOAPI-10600 ASOAPI-10601] - [Consommateur] - desactiver/reactiver un clé etendue', async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  const MaybeControlApiKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${vendeursPapierExtendedDevApiKeyId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  });
  await expect(MaybeControlApiKey.status).toBe(200);
  const controlApiKey = await MaybeControlApiKey.json()
  await expect(controlApiKey.enabled).toBe(true)
  await expect(controlApiKey.authorizedEntities.length).toBe(2)
  await expect(controlApiKey.authorizedEntities).toEqual(
    expect.arrayContaining([otoroshiDevPaperRouteId, otoroshiDevCommandRouteId])
  );

  await page.goto(ACCUEIL);
  await loginAs(JIM, page);

  await findAndGoToTeam('Vendeurs', page);
  await page.getByText('Clés d\'API').click();
  //Voir les clé d'api pour api Commande
  await page.getByRole('row', { name: 'API Commande' }).getByLabel('Voir les clés d\'API').click();
  // L'agrégat affiche une ligne par souscription du trousseau (API papier + API
  // Commande) ; on cible la ligne API Commande/dev.
  const row = page.locator('.keyring-card tbody tr', { hasText: 'API Commande' });
  // On va manipuler la souscription Commande/dev (faisant partie d'une aggregation)
  //Vérifier que la clé est activé
  await expect(row.locator('.api-subscription__value__type')).toContainText('Activé');
  //desactiver la clé
  await row.getByLabel('Actions de la souscription').click();
  await row.getByText('Désactiver la souscription').click();
  await page.waitForResponse(r => r.url().includes('/_archive?enabled=false') && r.status() === 200);

  //verifier que la clé est désactiver
  await expect(row.locator('.api-subscription__value__type')).toContainText('Désactivé');
  const maybeDeactivatedKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${vendeursPapierExtendedDevApiKeyId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  });
  await expect(maybeDeactivatedKey.status).toBe(200);
  const deactivatedApikey = await maybeDeactivatedKey.json()
  await expect(deactivatedApikey.enabled).toBe(true)
  await expect(deactivatedApikey.authorizedEntities.length).toBe(1)
  await expect(controlApiKey.authorizedEntities).toEqual(
    expect.arrayContaining([otoroshiDevPaperRouteId])
  );
  await page.waitForTimeout(500);

  //activer la clé
  await row.getByLabel('Actions de la souscription').click();
  await row.getByText('Activer la souscription').click();
  await page.waitForResponse(r => r.url().includes('/_archive?enabled=true') && r.status() === 200);

  //verifier que la clé est réactivée
  await expect(row.locator('.api-subscription__value__type')).toContainText('Activé');
  const maybeActivatedApiKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${vendeursPapierExtendedDevApiKeyId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  });
  await expect(maybeActivatedApiKey.status).toBe(200);
  const activatedApikey = await maybeActivatedApiKey.json()
  await expect(activatedApikey.enabled).toBe(true)
  await expect(activatedApikey.authorizedEntities.length).toBe(2)
  await expect(controlApiKey.authorizedEntities).toEqual(
    expect.arrayContaining([otoroshiDevPaperRouteId, otoroshiDevCommandRouteId])
  );
})

test('[ASOAPI-10602] - [Consommateur] - supprimer un extension de clé', async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  const MaybeControlApiKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${vendeursPapierExtendedDevApiKeyId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  });
  await expect(MaybeControlApiKey.status).toBe(200);
  const controlApiKey = await MaybeControlApiKey.json()
  await expect(controlApiKey.enabled).toBe(true)
  await expect(controlApiKey.authorizedEntities.length).toBe(2)
  await expect(controlApiKey.authorizedEntities).toEqual(
    expect.arrayContaining([otoroshiDevPaperRouteId, otoroshiDevCommandRouteId])
  );

  await page.goto(ACCUEIL);
  await loginAs(JIM, page);

  await findAndGoToTeam('Vendeurs', page);
  await page.getByText('Clés d\'API').click();
  //Voir les clé d'api pour api Commande
  await page.getByRole('row', { name: 'API Commande' }).getByLabel('Voir les clés d\'API').click();
  // Ligne API Commande/dev de l'agrégat (le trousseau porte aussi API papier/dev).
  const row = page.locator('.keyring-card tbody tr', { hasText: 'API Commande' });
  //Vérifier que la clé est activé
  await expect(row.locator('.api-subscription__value__type')).toContainText('Activé');
  //supprimer la souscription Commande/dev
  await row.getByLabel('Actions de la souscription').click();
  await row.getByText('Supprimer').click();
  await page.getByLabel('Pour confirmer la suppression').fill('API Commande/dev');
  await page.getByRole('button', { name: 'Confirmation' }).click();
  await page.waitForResponse(r => r.request().method() === 'DELETE' && r.status() === 200);

  // le trousseau ne porte plus de souscription API Commande -> plus de carte ici
  await expect(page.locator('.keyring-card')).toBeHidden();
  const maybeDeletedKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${vendeursPapierExtendedDevApiKeyId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  });
  await expect(maybeDeletedKey.status).toBe(200);
  const deletedApikey = await maybeDeletedKey.json()
  await expect(deletedApikey.enabled).toBe(true)
  await expect(deletedApikey.authorizedEntities.length).toBe(1)
})

test('[ASOAPI-10603] - [Consommateur] - supprimer une clé avec extension en cascade', async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  const MaybeControlApiKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${vendeursPapierExtendedDevApiKeyId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  });
  await expect(MaybeControlApiKey.status).toBe(200);
  const controlApiKey = await MaybeControlApiKey.json()
  await expect(controlApiKey.enabled).toBe(true)
  await expect(controlApiKey.authorizedEntities.length).toBe(2)
  await expect(controlApiKey.authorizedEntities).toEqual(
    expect.arrayContaining([otoroshiDevPaperRouteId, otoroshiDevCommandRouteId])
  );

  await page.goto(ACCUEIL);
  await loginAs(JIM, page);

  await findAndGoToTeam('Vendeurs', page);
  await page.getByText('Clés d\'API').click();
  //Voir les clé d'api pour api Commande
  await page.getByRole('row', { name: 'API Papier' }).getByLabel('Voir les clés d\'API').click();
  // Le nouveau modèle n'a plus de suppression « en cascade » : pour retirer toute
  // la clé Otoroshi, on supprime chaque souscription du trousseau. La carte de
  // l'agrégat liste ses deux souscriptions (API papier/dev + API Commande/dev).
  const card = page.locator('.keyring-card');
  // 1) supprimer la souscription API Commande/dev
  const commandeRow = card.locator('tbody tr', { hasText: 'API Commande' });
  await commandeRow.getByLabel('Actions de la souscription').click();
  await commandeRow.getByText('Supprimer').click();
  await page.getByLabel('Pour confirmer la suppression').fill('API Commande/dev');
  await page.getByRole('button', { name: 'Confirmation' }).click();
  await page.waitForResponse(r => r.request().method() === 'DELETE' && r.status() === 200);
  // 2) supprimer la dernière souscription (API papier/dev) -> trousseau vide -> le
  // backend supprime le trousseau et sa clé Otoroshi
  const papierRow = card.locator('tbody tr', { hasText: 'API papier' });
  await papierRow.getByLabel('Actions de la souscription').click();
  await papierRow.getByText('Supprimer').click();
  await page.getByLabel('Pour confirmer la suppression').fill('API papier/dev');
  await page.getByRole('button', { name: 'Confirmation' }).click();
  await page.waitForResponse(r => r.request().method() === 'DELETE' && r.status() === 200);

  //plus aucune carte -> trousseau supprimé
  await expect(page.locator('.keyring-card')).toBeHidden();
  const maybeDeletedKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${vendeursPapierExtendedDevApiKeyId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  });
  await expect(maybeDeletedKey.status).toBe(404);
})


test('[ASOAP-10604] - [Consommateur] - transférer une clé d\'api à une autre équipe', async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  await findAndGoToTeam('Logistique', page);
  await page.getByText('Clés d\'API').click();
  await page.getByRole('row', { name: 'API Commande' }).getByLabel('Voir les clés d\'API').click();
  const prodCard = page.locator('.keyring-card', { hasText: 'prod' });
  await prodCard.getByLabel('Actions de la souscription').click();
  await prodCard.getByText('Transférer la souscription').click();
  await page.getByRole('button', { name: 'Copier le lien' }).click();

  const link = await page.evaluate(() => navigator.clipboard.readText());
  await page.goto(link);
  await page.getByText('Vendeurs').click();
  await page.getByRole('button', { name: 'Confirmer le transfert' }).click();
  await page.getByRole('link', { name: 'API papier' }).isVisible();
  await page.goto(`${HOME}vendeurs/settings/dashboard`);
  await page.getByText('Clés d\'API').click();
  await page.getByRole('row', { name: 'API Commande' }).getByLabel('Voir les clés d\'API').click();
  await expect(page.locator('.keyring-card', { hasText: 'prod' })).toBeVisible();
})

test('[#1096] - visibilité du bouton de souscription selon la visibilité API/plan', async ({ page }) => {
  // JIM est membre de Vendeurs (équipe autorisée) mais pas de "API Division" (équipe non autorisée).
  // On construit 3 APIs (en mode environment, les plans s'appellent dev/preprod/prod) pour couvrir
  // toute la matrice : visibilité API x visibilité plan x autorisation de l'équipe, en un seul test.
  const publicApiPlans = [
    generatePlan({ customName: 'dev', visibility: 'Public' }),                                      // api pub + plan pub
    generatePlan({ customName: 'preprod', visibility: 'Private', authorizedTeams: [vendeurs] }),    // cas 1 : pub + privé + autorisé
    generatePlan({ customName: 'prod', visibility: 'Private', authorizedTeams: [apiDivision] }),    // cas 2 : pub + privé + non autorisé
  ];
  const privateAuthorizedPlans = [
    generatePlan({ customName: 'dev', visibility: 'Public' }),                                      // cas 3 : privé + plan pub + autorisé
    generatePlan({ customName: 'prod', visibility: 'Private', authorizedTeams: [vendeurs] }),       // cas 5 : privé + privé + autorisé
  ];
  const privateForbiddenPlans = [
    generatePlan({ customName: 'dev', visibility: 'Public' }),                                      // cas 4 & 6 : API privée non autorisée
  ];
  // API possédée par Vendeurs avec un plan ultra privé qui n'autorise QUE API Division :
  // JIM (membre de Vendeurs = proprio, non super-admin) ne le voit que via l'échappatoire ownerTeam.
  const ownerApiPlans = [
    generatePlan({ customName: 'prod', visibility: 'Private', authorizedTeams: [apiDivision] }),    // cas proprio : ultra privé
  ];

  await Promise.all(
    [...publicApiPlans, ...privateAuthorizedPlans, ...privateForbiddenPlans, ...ownerApiPlans].map(savePlan)
  );

  const apis = [
    generateApi({
      name: 'API test publique', _humanReadableId: 'api-test-publique',
      visibility: 'Public', possibleUsagePlans: publicApiPlans.map((p) => p._id),
    }),
    generateApi({
      name: 'API test privée autorisée', _humanReadableId: 'api-test-privee-autorisee',
      visibility: 'Private', authorizedTeams: [vendeurs], possibleUsagePlans: privateAuthorizedPlans.map((p) => p._id),
    }),
    generateApi({
      name: 'API test privée interdite', _humanReadableId: 'api-test-privee-interdite',
      visibility: 'Private', authorizedTeams: [apiDivision], possibleUsagePlans: privateForbiddenPlans.map((p) => p._id),
    }),
    generateApi({
      name: 'API test proprio', _humanReadableId: 'api-test-proprio',
      team: vendeurs, visibility: 'Public', possibleUsagePlans: ownerApiPlans.map((p) => p._id),
    }),
  ];
  await Promise.all(apis.map((a) => saveApi(a as any)));

  // process automatique (subscriptionProcess vide) => le bouton porte ce libellé
  const getKey = 'Obtenir une clé d\'API';

  await page.goto(ACCUEIL);
  await loginAs(JIM, page);

  // cas 4 & 6 : une API privée dont aucune équipe de JIM n'est autorisée n'apparaît pas du tout
  await expect(page.getByRole('link', { name: 'API test publique' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'API test privée autorisée' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'API test privée interdite' })).toBeHidden();

  // === API publique ===
  await page.getByRole('link', { name: 'API test publique' }).click();
  await page.getByText('Environnements').click();
  // api publique + plan public => bouton visible
  await expect(page.locator('[data-usage-plan="dev"]').getByRole('button', { name: getKey })).toBeVisible();
  // cas 1 : api publique + plan privé + équipe autorisée => bouton visible
  await expect(page.locator('[data-usage-plan="preprod"]').getByRole('button', { name: getKey })).toBeVisible();
  // cas 2 : api publique + plan privé + équipe non autorisée => la carte du plan n'est pas affichée
  await expect(page.locator('[data-usage-plan="prod"]')).toBeHidden();

  // === API privée autorisée ===
  await page.goto(ACCUEIL);
  await page.getByRole('link', { name: 'API test privée autorisée' }).click();
  await page.getByText('Environnements').click();
  // cas 3 : api privée + plan public + équipe autorisée => bouton visible
  await expect(page.locator('[data-usage-plan="dev"]').getByRole('button', { name: getKey })).toBeVisible();
  // cas 5 : api privée + plan privé + équipe autorisée => bouton visible
  await expect(page.locator('[data-usage-plan="prod"]').getByRole('button', { name: getKey })).toBeVisible();

  // === équipe propriétaire : accède à TOUS les plans, même ultra privés ===
  // "API test proprio" est possédée par Vendeurs. Son plan "prod" est privé et n'autorise
  // QUE API Division (ni Vendeurs ni Logistique). JIM est admin de Vendeurs mais n'est PAS
  // super-admin Daikoku : s'il voit ce plan, c'est uniquement via l'échappatoire ownerTeam.
  await page.goto(ACCUEIL);
  await page.getByRole('link', { name: 'API test proprio' }).click();
  await page.getByText('Environnements').click();
  await expect(page.locator('[data-usage-plan="prod"]').getByRole('button', { name: getKey })).toBeVisible();
})
test("[] - [Consommateur] - les actions d'administration des clés doivent être accessibles uniquement aux admins d'une équipe", async({page, context}) => {

  async function checkBurgerButtonVisibility(visible: Boolean) {
    const keyUrl = `${HOME}vendeurs/settings/apikeys/api-commande/1.0.0`
    const burgerLocator = page.locator('.api-subscription').first().locator('#dropdownMenuButton')
    await page.goto(keyUrl)

    if(visible) {
      await expect(burgerLocator).toBeVisible()
    } else {
      // Ensure that api key card is displayed before asserting on burger button absence
      await expect(page.getByRole("button", {name: "Copier le clientId et le clientSecret"})).toBeVisible()
      await expect(burgerLocator).not.toBeVisible()
    }
  }


  await page.goto(ACCUEIL);
  await loginAs(DWIGHT, page);
  await checkBurgerButtonVisibility(false);
  await logout(page)

  await updateUserRightForTeam({
      teamId: vendeurs,
      userId: DWIGHT.id!,
      right: "ApiEditor"
    });

  await loginAs(DWIGHT, page);
  await checkBurgerButtonVisibility(false);
  await logout(page)

  await updateUserRightForTeam({
      teamId: vendeurs,
      userId: DWIGHT.id!,
      right: "Administrator"
    });

  await loginAs(DWIGHT, page);
  await checkBurgerButtonVisibility(true);
})

