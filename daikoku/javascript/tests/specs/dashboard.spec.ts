import test, { expect } from '@playwright/test';
import { addDays } from 'date-fns';
import { IApi } from '../../src/types';
import otoroshi_data from '../config/otoroshi/otoroshi-state.json';
import { generateApi, saveApi } from './apis';
import { DWIGHT, JIM, MICHAEL } from './users';
import { ACCUEIL, adminApikeyId, adminApikeySecret, apiCommande, apiDivision, apiPapier, dwightPaperSubscriptionId, exposedPort, loginAs, logout, otoroshiAdminApikeyId, otoroshiAdminApikeySecret } from './utils';


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


test('Guest user can access to the dashboard', async ({ page }) => {
  await page.goto(ACCUEIL);

  await expect(page.getByRole('button', { name: 'Créer une API' })).toBeHidden();

  await expect(page.getByRole('link', { name: 'API Commande' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'API Papier' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'admin-api-tenant-default' })).toBeHidden();

  await expect(page.locator('.dashboard-tile', { hasText: 'Mes APIs' })).toBeHidden();
  await expect(page.locator('.dashboard-tile', { hasText: 'Mes clé d\'API' })).toBeHidden();
  await expect(page.locator('.dashboard-tile', { hasText: 'Demandes à valider' })).toBeHidden();
});

test('User non producer can access to the dashboard', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(DWIGHT, page)

  await expect(page.getByRole('button', { name: 'Créer une API' })).toBeVisible();

  await expect(page.getByRole('link', { name: 'API Commande' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'API Papier' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'admin-api-tenant-default' })).toBeHidden();

  await expect(page.locator('.dashboard-tile', { hasText: 'Mes APIs' })).toBeVisible();
  await expect(page.locator('.dashboard-tile', { hasText: 'Mes clé d\'API' })).toBeVisible();
  await expect(page.locator('.dashboard-tile', { hasText: 'Demandes à valider' })).toBeVisible(); //todo: maybe better hidden

  await expect(page.getByRole('listitem', { name: 'API papier' }).locator('.status')).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'API papier' }).locator('.status')).toContainText('2 clés actives');

});

test('User producer can access to the dashboard', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(JIM, page)

  await page.getByRole('link', { name: 'API papier' }).click();
  await page.getByText('Environnements').click();
  await page.getByRole('button', { name: 'Demander une clé d\'API' }).click();
  await page.getByText('Vendeurs').click();
  await page.getByRole('button', { name: 'Souscrire avec une nouvelle' }).click();
  await page.getByRole('textbox', { name: 'motivation' }).fill('I want it !!!');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByText('La demande de clé d\'API au')).toBeVisible();
  await logout(page)

  await loginAs(MICHAEL, page)

  await expect(page.getByRole('button', { name: 'Créer une API' })).toBeVisible();

  await expect(page.getByRole('link', { name: 'API Commande' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'API Papier' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'admin-api-tenant-default' })).toBeVisible();

  await expect(page.locator('.dashboard-tile', { hasText: 'Mes APIs' })).toBeVisible();
  await expect(page.locator('.dashboard-tile', { hasText: 'Mes clé d\'API' })).toBeVisible();
  await expect(page.locator('.dashboard-tile', { hasText: 'Demandes à valider' })).toBeVisible();

  await expect(page.getByRole('listitem', { name: 'admin-api-tenant-default' }).locator('.status')).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'admin-api-tenant-default' }).locator('.status')).toContainText('1 clé active');

});

test('api list status', async ({ page }) => {

  const patchDwightKey = [
    {
      "op": "replace",
      "path": "/validUntil",
      "value": addDays(new Date(), 1).getTime()
    }
  ]

  await fetch(`http://localhost:${exposedPort}/admin-api/subscriptions/${dwightPaperSubscriptionId}`, {
    method: 'PATCH',
    headers: {
      "content-type": "application/json",
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    },
    body: JSON.stringify(patchDwightKey)
  })


  await page.goto(ACCUEIL);
  await loginAs(DWIGHT, page)


  await page.getByRole('link', { name: 'API papier' }).click();
  await page.getByText('Environnements').click();
  await page.getByRole('button', { name: 'Demander une clé d\'API' }).click();
  await page.getByText('Dwight Schrute').click();
  await page.getByRole('button', { name: 'Souscrire avec une nouvelle' }).click();
  await page.getByRole('textbox', { name: 'motivation' }).fill('i want it !!!!!!!');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByText('La demande de clé d\'API au')).toBeVisible();

  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();


  await expect(page.getByRole('listitem', { name: 'API Commande' }).locator('.status')).toContainText('1 clé active');
  await expect(page.getByRole('listitem', { name: 'API Papier' }).locator('.status')).toContainText('2 clés actives');
  await expect(page.getByRole('listitem', { name: 'API Papier' }).locator('.status')).toContainText('1 expire bientôt');
  await expect(page.getByRole('listitem', { name: 'API Papier' }).locator('.status')).toContainText('1 demande en attente');
});

test('api list favorite', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page)


  await page.getByRole('article', { name: 'admin-api-tenant-default' }).getByLabel('Ajouter cette API aux favoris').click();
  await expect(page.getByRole('article', { name: 'admin-api-tenant-default' })
    .getByRole('button', { name: 'retirer cette API des favoris' })).toBeVisible();

  await page.reload();

  await expect(page.getByRole('article').first()).toContainText('admin-api-tenant-default');
});

test('apilist infinite pagination', async ({ page }) => {
  const apis = Array.from({ length: 25 })
    .map((_, idx) => idx.toString().padStart(2, "0"))
    .map(idx => {
      const api = generateApi()
      const updatedApi = { ...api, _tenant: api.tenant, team: apiDivision, name: `${api.name}-${idx}`, description: `${api.description}-${idx}`, smallDescription: `${api.smallDescription}-${idx}` }
      return updatedApi
    })//@ts-ignore
    .map(a => saveApi(a).then(r => r.json()))

  await Promise.all(apis)

  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page)


  await page.getByText('29 APIs').click();
  await expect(page.getByRole('article')).toHaveCount(15);
  await page.getByRole('button', {name: 'afficher plus d\'APIs' }).click();
  await expect(page.getByRole('article')).toHaveCount(29);
  await expect(page.getByRole('article', { name: 'cms-api-tenant-default' })).toBeVisible();
  await expect(page.getByRole('button', {name: 'afficher plus d\'APIs' })).toBeHidden();
  await page.getByRole('button', { name: 'API souscrite seulement' }).click();
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(page.getByText('3 APIs')).toBeVisible();
  await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click();
  await expect(page.getByText('29 APIs')).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(15);

});

test('apilist display specials api', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page)

  //todo: display icon for group, admin & private/pwa

});

test('apilist display apigroups & apigroups display apilist', async ({ page }) => {

  const api = generateApi()
  const apiGroup: IApi = { 
    ...api, 
    _tenant: api.tenant, 
    _deleted: false,
    _humanReadableId: 'apigroup',
    team: apiDivision, 
    name: 'apigroup', 
    description: 'a brand new apigroup', 
    smallDescription: `a brand new apigroup`,
    tags: [],
    categories: [],
    supportedVersions: ['1.0.0'],
    isDefault: true,
    posts: [],
    authorizedTeams: [],
    issues: [],
    issuesTags: [],
    stars: 0,
    visibility: 'Public',
    state: 'published',
    apis: [apiCommande, apiPapier],
  }
  await saveApi(apiGroup)

  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page)


  await page.getByRole('link', { name: 'apigroup' }).click();
  await expect(page.getByRole('heading', { name: 'Liste des APIs' })).toBeVisible();
  await expect(page.getByText('2 APIs')).toBeVisible();
  await expect(page.getByRole('article', { name: 'API Commande' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'API Papier' })).toBeVisible();
  await page.getByRole('link', { name: 'API Commande' }).click();
  await expect(page.locator('h3').filter({ hasText: 'API Commande' })).toBeVisible();

});

test('create new team', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(JIM, page)

  
  await page.getByRole('button', { name: 'Mes équipes' }).click();
  await expect(page.getByRole('heading', { name: 'Mes équipes' })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('link')).toHaveCount(3);
  await page.getByRole('button', { name: 'Créer une équipe' }).click();
  await page.getByRole('textbox', { name: 'Nom' }).fill('Athlead');
  await page.getByRole('textbox', { name: 'Description' }).fill('Athlead\'s team');
  await page.getByRole('textbox', { name: 'Contact de l\'équipe' }).fill('contact@athlead.com');
  await page.getByRole('button', { name: 'Créer', exact: true }).click();
  await expect(page.getByText("L'équipe Athlead a été créée avec succès")).toBeVisible();
  await page.getByRole('button', { name: 'Mes équipes' }).click();
  await expect(page.getByRole('dialog')).toContainText('Athlead');
  await page.getByRole('link', { name: 'Athlead' }).click();
  await expect(page.getByRole('heading', { name: 'Athlead' })).toBeVisible();

});