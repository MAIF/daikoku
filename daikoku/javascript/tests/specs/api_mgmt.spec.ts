import { test, expect } from '@playwright/test';
import { ACCUEIL, adminApikeyId, adminApikeySecret, dwightPaperApiKeyId, exposedPort, loginAs, logout, otoroshiAdminApikeyId, otoroshiAdminApikeySecret, otoroshiDevCommandRouteId, otoroshiDevPaperRouteId, vendeursPapierExtendedDevApiKeyId,loginLocalAs } from './utils';
import { JIM, MICHAEL } from './users';
import otoroshi_data from '../config/otoroshi/otoroshi-state.json';


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

test('[ASOAPI-10597] - créer une API', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(JIM, page);

  await page.getByRole('button', { name: 'Créer une API' }).click();
  await page.locator('#portal-root').getByText('Vendeurs').click();
  await page.getByRole('button', { name: 'Mode expert' }).click();
  await page.getByRole('button', { name: 'Créée' }).click();
  await page.getByPlaceholder('New Api').fill('API Betterave');
  await page.getByLabel('Desc. courte').fill("Ce n'est pas une blague Dwight. Jim ❤️");
  await page.getByText('Versions et tags').click();
  await page.locator('div.mrf-mt_10').filter({ hasText: "Tags" }).getByRole('button', { name: "Add" }).click();
  await page.locator('input[name="tags\\.0\\.value"]').fill('prod');
  await page.locator('div.mrf-mt_10').filter({ hasText: "Tags" }).getByRole('button', { name: "Add" }).click();
  await page.locator('input[name="tags\\.1\\.value"]').fill('important');
  //todo: find a way to fill description by playwright
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('h1')).toContainText('API Betterave');
  await page.getByLabel('Accueil Daikoku').click();
  await expect(page.getByRole('link', { name: 'API Betterave' })).toBeAttached();
  await logout(page);
  await expect(page.getByRole('link', { name: 'API Betterave' })).toBeHidden();

  await loginAs(JIM, page);
  await page.getByRole('link', { name: 'API Betterave' }).click();
  await page.getByRole('button', { name: 'Configurer' }).click();
  await page.getByRole('menu', { name: 'Configurer' }).getByRole('menuitem', { name: 'Configurer' }).click();
  await page.getByRole('button', { name: 'Publiée' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  await page.getByText('Environnements').click();
  await page.getByRole('list', { name: 'Liste des environnements' }).locator('div').click();
  await page.locator('div').filter({ hasText: /^new usage plan$/ }).nth(2).click();
  await page.getByText('dev', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Description' }).fill('environnement de developpement');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('listitem', { name: 'dev' })).toBeVisible();

  await page.getByLabel('Accueil Daikoku').click();
  await expect(page.getByRole('link', { name: 'API Betterave' })).toBeVisible();
  await logout(page);
  await expect(page.getByRole('link', { name: 'API Betterave' })).toBeVisible();
  await loginAs(JIM, page);
  await page.getByRole('link', { name: 'API Betterave' }).click();
  //todo: wait for better API lifecycle to test deprected
  // await page.getByRole('button', { name: 'Dépréciée' }).click();
  // await page.getByRole('button', { name: 'Enregistrer' }).click();
  // await page.getByLabel('Liste des APIs').click();
  // await page.getByRole('heading', { name: 'API Betterave' }).click();
  // await page.getByLabel('Liste des APIs').click();
  // await page.locator('div.row.py-4', { hasText: 'API Betterave' }).getByLabel('paramètres').click();
  await page.getByRole('button', { name: 'Configurer' }).click();
  await page.getByRole('menu', { name: 'Configurer' }).getByRole('menuitem', { name: 'Configurer' }).click();
  await page.getByRole('button', { name: 'Bloquée' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByLabel('Liste des APIs').click();
  await expect(page.getByRole('link', { name: 'API Betterave' })).toBeVisible();
  await logout(page);
  await expect(page.getByRole('link', { name: 'API Betterave' })).toBeHidden();
});

test('[ASOAPI-10597] [ASOAPI-10599] - créer/supprimer une version d\'une API', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await page.getByRole('link', { name: 'API papier' }).click();
  await page.getByRole('button', { name: 'Configurer' }).click();
  await page.getByRole('menu', { name: 'Configurer' }).getByRole('menuitem', { name: 'Créer une nouvelle version' }).click();
  await page.getByPlaceholder('Numéro de version').fill('2.0.0');
  await page.getByRole('button', { name: 'Créer' }).click();
  await expect(page).toHaveURL(`http://localhost:${exposedPort}/pP61PigzFffXTu4TX3BmvAB6iUIHY9oj/api-papier/2.0.0/description`)

  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);

  await page.getByRole('button', { name: "Configurer" }).click({ force: true });
  await page.getByRole('menu', { name: 'Configurer' }).getByRole('menuitem', { name: 'Configurer' }).click({ force: true });
  await page.getByLabel('Desc. courte').fill('Le catalogue de Papier de Dunder Mifflin dans sa deuxieme version');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.waitForResponse(r => r.request().url().includes('/apis/api-papier/2.0.0') && r.status() === 200)
  await page.getByLabel('Accueil Daikoku').click();
  // await expect(page.getByRole('listitem', { name: 'API papier' }).locator('.lead'))
  //   .toHaveText('Le catalogue de Papier de Dunder Mifflin dans sa deuxieme version')
  await page.getByRole('link', { name: 'API papier' }).click();
  await expect(page.url()).toContain('api-papier/2.0.0');
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);

  //supprimer la version
  await page.getByRole('button', { name: 'Configurer' }).click();
  // await page.getByRole('link', { name: 'Configurer l\'API' }).click();
  // await page.getByText('Paramètres').click();
  await page.getByRole('menu', { name: 'Configurer' }).getByRole('menuitem', { name: 'Supprimer' }).click();
  await page.getByLabel('Saisissez API papier pour').click();
  await page.getByLabel('Saisissez API papier pour').fill('API papier');
  await page.getByRole('button', { name: 'Confirmation' }).click();
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);

  await expect(page.getByRole('link', { name: 'API papier' })).toBeVisible();
  await page.getByRole('link', { name: 'API papier' }).click()
  await expect(page.url()).toContain('1.0.0');
});

test('[ASOAPI-10599] - supprimer une API', async ({ page }) => {
  //todo: update sub pour setup date to today

  await fetch(`http://localhost:${exposedPort}/admin-api/subscriptions/vk6QRoGrc8JyRiZfgcifwjzNES9l9ygQ`, {
    method: 'PATCH',
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    },
    body: JSON.stringify([
      {
        op: "replace",
        path: "/createdAt",
        value: Date.now()
      }
    ])
  })
  await fetch(`http://localhost:${exposedPort}/admin-api/subscriptions/4EGnOUDSp7eaC8J2d26TfO95rwUxfz9H`, {
    method: 'PATCH',
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    },
    body: JSON.stringify([
      {
        op: "replace",
        path: "/createdAt",
        value: Date.now()
      }
    ])
  })


  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await page.getByRole('link', { name: 'API papier' }).click();
  await page.getByRole('button', { name: "Configurer" }).click();
  await page.getByRole('menu', { name: 'Configurer' }).getByRole('menuitem', { name: 'Supprimer' }).click();
  await page.getByLabel('Saisissez API papier pour').click();
  await page.getByLabel('Saisissez API papier pour').fill('API papier');
  await page.getByRole('button', { name: 'Confirmation' }).click();
  await expect(page.getByRole('listitem', { name: 'API papier' })).toBeHidden();

  await page.getByRole('button', { name: 'Taper / pour rechercher' }).click();
  await page.getByRole('textbox', { name: 'Rechercher une API, équipe,' }).fill('vendeurs');
  await page.getByRole('link', { name: 'Vendeurs' }).click();
  await page.getByText('Clés d\'API').click();
  await expect(page.getByRole('link', { name: 'API papier' })).toBeHidden();
  await page.waitForTimeout(1000);

  //verifier dans oto que les clé sont plus dispo
  const MaybeVendeurApiKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${vendeursPapierExtendedDevApiKeyId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  });
  await expect(MaybeVendeurApiKey.status).toBe(200);
  const vendeurApiKey = await MaybeVendeurApiKey.json()
  await expect(vendeurApiKey.enabled).toBe(true)
  await expect(vendeurApiKey.authorizedEntities.length).toBe(1)
  await expect(vendeurApiKey.authorizedEntities).toEqual(
    expect.not.arrayContaining([otoroshiDevPaperRouteId])
  );
  await expect(vendeurApiKey.authorizedEntities).toEqual(
    expect.arrayContaining([otoroshiDevCommandRouteId])
  );


  const MaybeDwightApiKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${dwightPaperApiKeyId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  });
  await expect(MaybeDwightApiKey.status).toBe(404);
});

test('[ASOAPI-10692] - désactiver une API', async ({ page }) => {
  //todo: wait #800 (https://github.com/MAIF/daikoku/issues/800)
});

test('sécuriser la création d\'API à l\'aide de la securité de tenant associé', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await page.getByRole('button', { name: 'Créer une API' }).click();
  await page.getByRole('dialog').getByRole('listitem', { name: 'Vendeurs' }).click();
  await page.getByRole('button', { name: 'Publiée' }).click();
  await page.getByRole('textbox', { name: 'Nom' }).fill('Vente de papier API');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('h1')).toContainText('Vente de papier API');
  await page.getByLabel('Accueil Daikoku').click();
  await expect(page.getByRole('link', { name: 'Vente de papier API' })).toBeVisible();
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Dunder Mifflin' }).click();
  await page.getByText('Sécurité').click();
  await page.locator('form div').filter({ hasText: 'Sécurité - création d\'API' })
    .getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Équipes', { exact: true }).click();
  await page.getByRole('listitem', { name: 'API Division' }).hover();
  await page.getByRole('listitem', { name: 'API Division' })
    .getByLabel('Modifier l\'équipe').click();
  await page.locator('div').filter({ hasText: /^Autorisation de création d'APIs$/ })
    .getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Mettre à jour' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('button', { name: 'Créer une API' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('dialog').getByRole('listitem', { name: 'API Division' })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('listitem', { name: 'Vendeurs' })).toBeHidden();

  await page.getByRole('dialog').locator('.modal-footer').getByRole('button', { name: 'Fermer' }).first().click();
  await logout(page);

  await loginAs(JIM, page);
  await expect(page.getByRole('button', { name: 'Créer une API' })).toBeHidden();
});

test('[ASOAPI-10597] - créer un groupe d\'API', async ({ page }) => {
  const apiGroupName = 'Dunder mifflin suite';

  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);


  await page.getByRole('button', { name: 'Plus d\'options de création' }).click();
  await page.getByRole('link', { name: 'groupe d\'APIs' }).click();

  await page.locator('#portal-root').getByText('API division').click();
  await page.getByRole('button', { name: 'Mode expert' }).click();
  await page.getByRole('button', { name: 'Publiée' }).click();
  await page.getByPlaceholder('New Api').fill(apiGroupName);
  await page.getByLabel('Desc. courte').fill("Un groupe, Un parcours, une suite ❤️");


  await page.locator('.react-form-select__indicator').first().click();
  await page.getByText('API papier - 1.0.0', { exact: true }).click();

  await page.locator('.react-form-select__indicator.react-form-select__dropdown-indicator').first().click();
  await page.getByText('API Commande - 1.0.0', { exact: true }).click();


  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { name: apiGroupName }).first()).toBeVisible();
  await page.getByLabel('Accueil Daikoku').click();
  await page.getByRole('link', { name: apiGroupName }).click();


  await page.getByText('APIs', {exact: true}).click();
  await expect(page.getByRole('heading', { name: 'Liste des APIs' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'API papier' })).toBeVisible();
  await page.getByRole('link', { name: 'API papier' }).click();
  await expect(page.locator('h1')).toBeVisible();


});

const createAPILifeCycleTest = async ({page}) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await page.getByRole('button', { name: 'Créer une API' }).click();
  await page.getByRole('listitem', { name: 'API Division' }).click();
  await page.getByRole('textbox', { name: 'Nom' }).fill('ApiLifeCycleTest');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByRole('main').locator('div').filter({ hasText: /^ApiLifeCycleTest$/ }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
}

const passAPILifeCycleTestToPublished = async ({page}) => {
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'ApiLifeCycleTest' }).click();
  await page.getByRole('button', { name: 'Configurer' }).click();
  await page.getByRole('menuitem', { name: 'Configurer' }).click();
  await page.getByRole('button', { name: 'Publiée' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();

}

const passAPILifeCycleTestToDeprecated= async ({page}) => {
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'ApiLifeCycleTest' }).click();
  await page.getByRole('button', { name: 'Configurer' }).click();
  await page.getByRole('menuitem', { name: 'Configurer' }).click();
  await page.getByRole('button', { name: 'Dépréciée' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  expect(page.getByText('Dépréciée')).toBeVisible;
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
}

const passAPILifeCycleTestToBlocked = async ({page}) => {
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'ApiLifeCycleTest' }).click();
  await page.getByRole('button', { name: 'Configurer' }).click();
  await page.getByRole('menuitem', { name: 'Configurer' }).click();
  await page.getByRole('button', { name: 'Bloquée' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  expect(page.getByRole('heading', { name: 'Attention' })).toBeVisible;
  await page.getByRole('textbox', { name: 'Saisissez ApiLifeCycleTest' }).fill('ApiLifeCycleTest');
  await page.getByRole('button', { name: 'Confirmation' }).click();
  expect(page.getByText('Api bloquée')).toBeVisible;
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
}

const deleteAPILifeCycleTest = async ({page}) => {
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'ApiLifeCycleTest' }).click();
  await page.getByRole('button', { name: 'Configurer' }).click();
  await page.getByRole('menuitem', { name: 'Supprimer' }).click();
  await page.getByRole('textbox', { name: 'Saisissez ApiLifeCycleTest' }).click();
  await page.getByRole('textbox', { name: 'Saisissez ApiLifeCycleTest' }).fill('ApiLifeCycleTest');
  await page.getByRole('button', { name: 'Confirmation' }).click();
  expect(page.getByText('Supprimé avec succès')).toBeVisible;
}

test('full Api LifeCycle', async ({ page }) => {
  await createAPILifeCycleTest({page})
  await passAPILifeCycleTestToPublished({page})
  await passAPILifeCycleTestToDeprecated({page})
  await passAPILifeCycleTestToBlocked({page})
  await deleteAPILifeCycleTest({page})
});

test('full Api Backward LifeCycle', async ({ page }) => {
  await createAPILifeCycleTest({page})
  await passAPILifeCycleTestToPublished({page})
  await passAPILifeCycleTestToBlocked({page})
  await passAPILifeCycleTestToDeprecated({page})
  await passAPILifeCycleTestToPublished({page})
  await deleteAPILifeCycleTest({page})
});

test('Pass Published to Blocked', async ({ page }) => {
  await createAPILifeCycleTest({page})
  await passAPILifeCycleTestToPublished({page})
  await passAPILifeCycleTestToBlocked({page})
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  const api = page.getByRole('listitem').filter({ hasText: 'ApiLifeCycleTest' });
  expect(api.getByRole('article').getByRole('article').getByText('Api bloquée')).toBeVisible;
  await deleteAPILifeCycleTest({page})
});

test('Pass Published to deprecated', async ({ page }) => {
  await createAPILifeCycleTest({page})
  await passAPILifeCycleTestToPublished({page})
  await passAPILifeCycleTestToDeprecated({page})
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  const api = page.getByRole('listitem').filter({ hasText: 'ApiLifeCycleTest' });
  expect(api.getByRole('article').getByRole('article').getByText('Api dépréciée')).toBeVisible;
  await deleteAPILifeCycleTest({page})
});

test('Cannot pass Draft to Blocked', async ({ page }) => {
  await createAPILifeCycleTest({page})
  await passAPILifeCycleTestToBlocked({page})
  expect(page.getByText('Conflict with api state')).toBeVisible;
  const api = page.getByRole('listitem').filter({ hasText: 'ApiLifeCycleTest' });
  expect(api.getByRole('article').getByRole('article').getByText('Api dépréciée')).toBeVisible;
  await deleteAPILifeCycleTest({page})
});

test('Check Mail has been received', async ({ page }) => {
  //await page.goto(ACCUEIL);
  //await loginAs(MICHAEL, page);

  await createAPILifeCycleTest({page})
  await passAPILifeCycleTestToPublished({page})
  await passAPILifeCycleTestToBlocked({page})
  const context = page.context();
  const pageMail = await context.newPage();
  pageMail.goto("http://localhost:1080")

  //await context.close();
  //await browser.close();

  //await createAPILifeCycleTest({page})
  //await passAPILifeCycleTestToBlocked({page})
  //await deleteAPILifeCycleTest({page})
});


const testMail = async () => {
  // Setup



  // Votre code va ici

  // Teardown
  //await context.close();
  //await browser.close();
};

//Faire une nouvelle page avec un autre user -> equipe reçois bien l'api

//Interdire d'aller vers draft si des souscriptions sont existantes --> plus tard en back

//Vérifier mail envoyé par personne

//Vérifier si user essaye de rentre dans l'url de l'api bloquée, il ne doit pas y parvenir

//deprecié vers bloqué utiliser Commande (ou celle qui a le plus de souscripteurs)

//Verifier par un autre test au blocage (qui ne fonctionnera pas pour le moment)
// que les souscriptions soient bloquées, et vérifier que la souscription partagée
// cible une clé d'api Oto qui soit toujours enabled
