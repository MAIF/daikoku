import test, { expect } from '@playwright/test';
import otoroshi_data from '../config/otoroshi/otoroshi-state.json';
import { JIM, MICHAEL } from './users';
import { ACCUEIL, adminApikeyId, adminApikeySecret, EMAIL_UI, exposedPort, findAndGoToTeam, HOME, loginAs, logistiqueCommandeProdApiKeyId, otoroshiAdminApikeyId, otoroshiAdminApikeySecret, otoroshiDevCommandRouteId, otoroshiDevPaperRouteId, vendeursPapierExtendedDevApiKeyId } from './utils';
import type { ActualOtoroshiApiKey } from './utils';

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
  await page.getByRole('button', { name: 'Souscrire avec une nouvelle' }).click();
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
  await page.locator('.api-subscription', { hasText: 'prod' }).getByRole('button', { name: 'Copier le clientId et le clientSecret' }).click();
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
  await page.getByRole('button', { name: 'Souscrire avec une nouvelle' }).click();
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
  await expect(page.locator('.api-subscription', { hasText: 'prod' })).toBeHidden();
  await page.getByLabel('Accès aux notifications').click();
  await expect(page.getByLabel('Notifications', { exact: true })).toContainText('1');
  await expect(page.getByRole('listitem')).toContainText('Votre demande de souscription (prod) a été refusée.');
  await page.getByRole('article', { name: 'Souscription refusée' })
    .getByRole('link', { name: 'Voir plus' }).click();
  await expect(page.getByRole('dialog')).toContainText('désolé');
  //todo: accepter la notification
});

test('[ASOAPI-10161] - Demander une extension d\apikey - process automatique', async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  await page.getByRole('link', { name: 'API papier' }).click();
  await page.getByText('Environnements').click();
  await page.getByRole('button', { name: 'Obtenir une clé d\'API' }).click();
  await page.getByText('Logistique').click();
  await page.getByRole('button', { name: 'Souscrire en étendant' }).click();
  await page.getByText('API Commande/dev').click();

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
  await page.locator('.api-subscription', { hasText: 'dev' })
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

test('[ASOAPI-10161] - Demander une extension d\apikey - process manuel', async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  await page.getByRole('link', { name: 'API papier' }).click();
  await page.getByText('Environnements').click();
  await page.locator('.usage-plan__card', { hasText: 'prod' }).getByRole('button', { name: 'Demander une clé d\'API' }).click();
  await page.getByText('Logistique').click();
  await page.getByRole('button', { name: 'Souscrire en étendant' }).click();
  await page.getByText('API Commande/prod').click();
  await page.getByLabel('motivation').fill('please');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();

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
  await page.locator('.api-subscription', { hasText: 'prod' }).getByRole('button', { name: 'Copier le clientId' }).click();
  const apikey = await page.evaluate(() => navigator.clipboard.readText());
  const papierApiKey = apikey.split(":", 2);
  const [clientId, clientSecret] = papierApiKey;
  await page.getByText('Clés d\'API').click();
  await page.locator('tr', { hasText: 'API Commande' }).getByLabel('Voir les clés d\'API').click();
  await expect(page.getByRole('main')).toContainText('prod');
  await page.locator('.api-subscription', { hasText: 'prod' }).getByRole('button', { name: 'Copier le clientId' }).click();
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
//   await page.getByRole('button', { name: 'Souscrire en étendant' }).click();
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
//   await page.locator('.api-subscription', { hasText: 'dev' })
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

test('[ASOAPI-10164] - Demander une extension d\apikey - process manuel - refus', async ({ page, context }) => {
  test.setTimeout(90_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  await page.getByRole('link', { name: 'API papier' }).click();
  await page.getByText('Environnements').click();
  await page.locator('.usage-plan__card', { hasText: 'prod' }).getByRole('button', { name: 'Demander une clé d\'API' }).click();
  await page.getByText('Logistique').click();
  await page.getByRole('button', { name: 'Souscrire en étendant' }).click();
  await page.getByText('API Commande/prod').click();
  await page.getByLabel('motivation').fill('please');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();

  await loginAs(MICHAEL, page);
  await page.getByLabel('Accès aux notifications').click();
  await expect(page.getByLabel('Notifications', { exact: true })).toContainText('1');
  await expect(page.getByRole('listitem')).toContainText('Nouvelle demande de souscription pour l\'environnement prod.');
  await page.getByRole('article', { name: 'Nouvelle souscription par Jim Halpert' })
    .getByLabel('Rejeter').click();
  await page.locator('#message').fill('désolé');
  await page.getByRole('dialog').getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByLabel('Notifications', { exact: true })).toContainText('0');
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();

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
  await expect(page.locator('.api-subscription', { hasText: 'prod' })).toBeHidden();

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
  await page.locator('.api-subscription', { hasText: 'prod' }).getByRole('button', { name: 'Copier le clientId' }).click();
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
  await page.getByLabel('Voir les clés d\'API').click();
  await page.locator('#dropdownMenuButton').nth(1).click();
  await page.getByText('Mettre à jour le nom perso.').nth(1).click();
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
  const card = await page.locator('.api-subscription', { hasText: 'prod' });
  await expect(card.locator('.api-subscription__value__type')).toContainText('Activé');
  //desactiver la clé
  await card.locator('#dropdownMenuButton').click();
  await card.getByText('Désactiver la souscription').click();
  //verifier que la clé est désactiver
  await expect(page.locator('.api-subscription', { hasText: 'prod' })
    .locator('.api-subscription__value__type')).toContainText('Désactivé');
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
  await page.locator('.api-subscription', { hasText: 'prod' })
    .locator('#dropdownMenuButton').click();
  await page.locator('.api-subscription', { hasText: 'prod' })
    .getByText('Activer la souscription').click();
  //verifier que la clé est désactiver
  await expect(page.locator('.api-subscription', { hasText: 'prod' })
    .locator('.api-subscription__value__type')).toContainText('Activé');
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
  // On va manipuler la clé pour l'environnement de dev (faisaint parie d'une aggregation)
  //Vérifier que la clé est activé
  await expect(page.locator('.api-subscription', { hasText: 'dev' })
    .locator('.api-subscription__value__type')).toContainText('Activé');
  //desactiver la clé
  await page.locator('.api-subscription', { hasText: 'dev' })
    .locator('#dropdownMenuButton').click();
  await page.locator('.api-subscription', { hasText: 'dev' }).getByText('Désactiver la souscription').click();
  await page.waitForResponse(r => r.url().includes('/_archive?enabled=false') && r.status() === 200);

  //verifier que la clé est désactiver
  await expect(page.locator('.api-subscription', { hasText: 'dev' })
    .locator('.api-subscription__value__type')).toContainText('Désactivé');
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
  await page.locator('.api-subscription', { hasText: 'dev' })
    .locator('#dropdownMenuButton').click();
  await page.locator('.api-subscription', { hasText: 'dev' })
    .getByText('Activer la souscription').click();
  await page.waitForResponse(r => r.url().includes('/_archive?enabled=true') && r.status() === 200);

  //verifier que la clé est désactiver
  await expect(page.locator('.api-subscription', { hasText: 'dev' })
    .locator('.api-subscription__value__type')).toContainText('Activé');
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
  // On va manipuler la clé pour l'environnement de dev (faisaint parie d'une aggregation)
  //Vérifier que la clé est activé
  await expect(page.locator('.api-subscription', { hasText: 'dev' })
    .locator('.api-subscription__value__type')).toContainText('Activé');
  //desactiver la clé
  await page.locator('.api-subscription', { hasText: 'dev' })
    .locator('#dropdownMenuButton').click();
  await page.locator('.api-subscription', { hasText: 'dev' }).getByText('Supprimer').click();
  await page.getByLabel('Pour confirmer la suppression').fill('API Commande/dev');
  await page.getByRole('button', { name: 'Confirmation' }).click();
  await page.waitForResponse(r => r.request().method() === 'DELETE' && r.status() === 200);

  //verifier que la clé est désactiver
  await expect(page.locator('.api-subscription')).toBeHidden();
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
  // On va manipuler la clé pour l'environnement de dev (faisaint parie d'une aggregation)
  //Vérifier que la clé est activé
  await expect(page.locator('.api-subscription', { hasText: 'dev' })
    .locator('.api-subscription__value__type')).toContainText('Activé');
  //desactiver la clé
  await page.locator('.api-subscription', { hasText: 'dev' })
    .locator('#dropdownMenuButton').click();
  await page.locator('.api-subscription', { hasText: 'dev' }).getByText('Supprimer').click();
  await page.getByRole('button', { name: 'Supprimer définitivement la souscription et tous ses enfants' }).click();
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await page.getByLabel('Pour confirmer la suppression').fill('API papier/dev');
  await page.getByRole('button', { name: 'Confirmation' }).click();
  await page.waitForResponse(r => r.request().method() === 'DELETE' && r.status() === 200);

  //verifier que la clé est désactiver
  await expect(page.locator('.api-subscription')).toBeHidden();
  const maybeDeletedKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${vendeursPapierExtendedDevApiKeyId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  });
  await expect(maybeDeletedKey.status).toBe(404);
})

test('[] - [Consommateur] - supprimer une clé avec extension avec promotion des enfants', async ({ page, context }) => {
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
  // On va manipuler la clé pour l'environnement de dev (faisaint parie d'une aggregation)
  //Vérifier que la clé est activé
  await expect(page.locator('.api-subscription', { hasText: 'dev' })
    .locator('.api-subscription__value__type')).toContainText('Activé');
  //desactiver la clé
  await page.locator('.api-subscription', { hasText: 'dev' })
    .locator('#dropdownMenuButton').click();
  await page.locator('.api-subscription', { hasText: 'dev' }).getByText('Supprimer').click();
  await page.getByRole('button', { name: 'Choisir un enfant de la souscription qui sera promu' }).click();
  await page.locator('.react-form-select__input-container').click();
  await page.locator('.react-form-select__option', { hasText: 'API Commande/dev' }).click();
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await page.getByLabel('Pour confirmer la suppression').fill('API papier/dev');
  await page.getByRole('button', { name: 'Confirmation' }).click();
  await page.waitForResponse(r => r.request().method() === 'DELETE' && r.status() === 200);

  //verifier que la clé ,'est pas supprimé mais n'acced plus qu'a commande
  await expect(page.locator('.api-subscription')).toBeHidden();
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
  await expect(controlApiKey.authorizedEntities).toEqual(
    expect.arrayContaining([otoroshiDevCommandRouteId])
  );
})

test('[] - [Consommateur] - supprimer une clé avec extension avec extraction des enfants', async ({ page, context }) => {
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
  // On va manipuler la clé pour l'environnement de dev (faisaint parie d'une aggregation)
  //Vérifier que la clé est activé
  await expect(page.locator('.api-subscription', { hasText: 'dev' })
    .locator('.api-subscription__value__type')).toContainText('Activé');
  //desactiver la clé
  await page.locator('.api-subscription', { hasText: 'dev' })
    .locator('#dropdownMenuButton').click();
  await page.locator('.api-subscription', { hasText: 'dev' }).getByText('Supprimer').click();
  await page.getByRole('button', { name: 'Chaque enfant sera extrait' }).click();
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await page.getByLabel('Pour confirmer la suppression').fill('API papier/dev');
  await page.getByRole('button', { name: 'Confirmation' }).click();
  await page.waitForResponse(r => r.request().method() === 'DELETE' && r.status() === 200);

  //verifier que la clé ,'est pas supprimé mais n'acced plus qu'a commande
  await expect(page.locator('.api-subscription')).toBeHidden();
  const maybeDeletedKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${vendeursPapierExtendedDevApiKeyId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  });
  await expect(maybeDeletedKey.status).toBe(404);
  await page.getByText('Clés d\'API').click();
  await page.getByRole('row', { name: 'API Commande' }).getByLabel('Voir les clés d\'API').click();
  await page.getByRole('button', { name: 'Copier le clientId' }).click();
  const apikey = await page.evaluate(() => navigator.clipboard.readText());
  const [clientId, clientSecret] = apikey.split(":", 2);

  const maybeNewKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${clientId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  });
  await expect(maybeNewKey.status).toBe(200);
  const newApiKey = await maybeNewKey.json();

  await expect(newApiKey.enabled).toBe(true)
  await expect(newApiKey.authorizedEntities.length).toBe(1)
  await expect(newApiKey.authorizedEntities).toEqual(
    expect.arrayContaining([otoroshiDevCommandRouteId])
  );
  await page.getByLabel('Accès aux notifications').click();
  await expect(page.getByLabel('Notifications', { exact: true })).toContainText('1');
  await expect(page.getByRole('article')).toContainText(`Votre clé d\'API a été supprimée`);
  await page.getByRole('article', { name: 'Suppression de clé d\'API' })
    .getByRole('button', { name: 'marquer comme lu' }).click();
  await expect(page.getByLabel('Notifications', { exact: true })).toContainText('0');

})

test('[ASOAP-10604] - [Consommateur] - transférer une clé d\'api à une autre équipe', async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  await findAndGoToTeam('Logistique', page);
  await page.getByText('Clés d\'API').click();
  await page.getByLabel('Voir les clés d\'API').click();
  await page.locator('div.api-subscription', { hasText: 'prod' }).locator('#dropdownMenuButton').click();
  await page.locator('div.api-subscription', { hasText: 'prod' }).getByText('Transférer la souscription').click();
  await page.getByRole('button', { name: 'Copier le lien' }).click();

  const link = await page.evaluate(() => navigator.clipboard.readText());
  await page.goto(link);
  await page.getByText('Vendeurs').click();
  await page.getByRole('button', { name: 'Confirmer le transfert' }).click();
  await page.getByRole('link', { name: 'API papier' }).isVisible();
  await page.goto(`${HOME}vendeurs/settings/dashboard`);
  await page.getByText('Clés d\'API').click();
  await page.getByRole('row', { name: 'API Commande' }).getByLabel('Voir les clés d\'API').click();
  await expect(page.locator('.api-subscription', { hasText: 'prod' })).toBeVisible();
})