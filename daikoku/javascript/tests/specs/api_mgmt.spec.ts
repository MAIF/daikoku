import { test, expect, Locator } from '@playwright/test';
import { ACCUEIL, adminApikeyId, adminApikeySecret, chooseApiSettingsAction, createApi, dwightPaperApiKeyId, exposedPort, loginAs, logout, otoroshiAdminApikeyId, otoroshiAdminApikeySecret, otoroshiDevCommandRouteId, vendeursPapierExtendedDevApiKeyId } from './utils';
import { JIM, MICHAEL } from './users';
import otoroshi_data from '../config/otoroshi/otoroshi-state.json' with { type: "json" };


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

  await createApi(page, {
    team: 'Vendeurs',
    expert: true,
    name: 'API Betterave',
    smallDescription: "Ce n'est pas une blague Dwight. Jim ❤️",
    tags: ['prod', 'important'],
    state: 'Brouillon',
  });
  await expect(page.locator('h1')).toContainText('API Betterave');
  await page.getByLabel('Accueil Daikoku').click();
  await expect(page.getByRole('link', { name: 'API Betterave' })).toBeAttached();
  await logout(page);
  await expect(page.getByRole('link', { name: 'API Betterave' })).toBeHidden();

  await loginAs(JIM, page);
  await page.getByRole('link', { name: 'API Betterave' }).click();
  await chooseApiSettingsAction(page, 'Modifier');
  await page.getByRole('radio', { name: 'Publiée' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  await page.getByRole('tab', { name: 'Environnements' }).click();
  await page.getByRole('button', { name: 'Créer un environnement' }).click();
  const creationSheet = page.getByRole('dialog', { name: 'Créer un environnement' });
  await creationSheet.getByRole('combobox', { name: 'Quel environnement voulez-vous créer ?' }).click();
  await page.getByRole('option', { name: 'dev', exact: true }).click();
  await creationSheet.getByRole('tab', { name: 'Général' }).click();
  await creationSheet.getByRole('textbox', { name: 'Description' }).fill('environnement de developpement');
  await creationSheet.getByRole('button', { name: 'Enregistrer' }).click();
  const dev = page.getByRole('listitem', { name: 'dev' });
  await expect(dev).toBeVisible();
  await expect(dev.getByText('environnement de developpement')).toBeVisible();

  await page.getByLabel('Accueil Daikoku').click();
  await expect(page.getByRole('link', { name: 'API Betterave' })).toBeVisible();
  await logout(page);
  await expect(page.getByRole('link', { name: 'API Betterave' })).toBeVisible();
  await loginAs(JIM, page);
  await page.getByRole('link', { name: 'API Betterave' }).click();
  //todo: wait for better API lifecycle to test deprected
  // await page.getByRole('radio', { name: 'Dépréciée' }).click();
  // await page.getByRole('button', { name: 'Enregistrer' }).click();
  // await page.getByLabel('Liste des APIs').click();
  // await page.getByRole('heading', { name: 'API Betterave' }).click();
  // await page.getByLabel('Liste des APIs').click();
  // await page.locator('div.row.py-4', { hasText: 'API Betterave' }).getByLabel('paramètres').click();
  await chooseApiSettingsAction(page, 'Modifier');
  await page.getByRole('radio', { name: 'Bloquée' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByRole('textbox', { name: 'Saisissez API Betterave pour' }).fill('API Betterave');
  await page.getByRole('button', { name: 'Confirmation' }).click();
  await expect(page.getByText("API succesfully updated")).toBeVisible();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByLabel('Liste des APIs').click();
  await expect(page.getByRole('link', { name: 'API Betterave' })).toBeVisible();
  await logout(page);
  await expect(page.getByRole('link', { name: 'API Betterave' })).toBeHidden();
});

test('[ASOAPI-10597] [ASOAPI-10599] - créer/supprimer une version d\'une API', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await page.getByRole('link', { name: 'API papier' }).click();
  await chooseApiSettingsAction(page, 'Créer une nouvelle version');
  await page.getByPlaceholder('Numéro de version').fill('2.0.0');
  await page.getByRole('button', { name: 'Créer' }).click();
  await expect(page).toHaveURL(`http://localhost:${exposedPort}/pP61PigzFffXTu4TX3BmvAB6iUIHY9oj/api-papier/2.0.0/description`)

  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);

  await chooseApiSettingsAction(page, 'Modifier');
  await page.getByLabel('Desc. courte').fill('Le catalogue de Papier de Dunder Mifflin dans sa deuxieme version');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.waitForResponse(r => r.request().url().includes('/apis/api-papier/2.0.0') && r.status() === 200)
  await page.goto(`http://localhost:${exposedPort}/apis`)
  // await expect(page.getByRole('listitem', { name: 'API papier' }).locator('.lead'))
  //   .toHaveText('Le catalogue de Papier de Dunder Mifflin dans sa deuxieme version')
  await page.getByRole('link', { name: 'API papier' }).click();
  await expect(page.url()).toContain('api-papier/2.0.0');
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);

  //supprimer la version
  // await page.getByRole('link', { name: 'Configurer l\'API' }).click();
  // await page.getByText('Paramètres').click();
  await chooseApiSettingsAction(page, 'Supprimer');
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
  await chooseApiSettingsAction(page, 'Supprimer');
  await page.getByLabel('Saisissez API papier pour').click();
  await page.getByLabel('Saisissez API papier pour').fill('API papier');
  await page.getByRole('button', { name: 'Confirmation' }).click();
  await expect(page.getByText("Supprimé avec succès")).toBeVisible()

  await page.getByRole('button', { name: 'Taper / pour rechercher' }).click();
  await page.getByRole('textbox', { name: 'Rechercher une API, équipe,' }).fill('vendeurs');
  await page.getByRole('link', { name: 'Vendeurs' }).click();
  await page.getByText('Clés d\'API').click();
  await expect(page.getByRole("listitem", { name: "API Commande" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "API papier" })).toBeHidden();

  //verifier dans oto que les clé sont plus dispo
  // La suppression est propagée à Otoroshi de façon asynchrone : on poll Otoroshi
  // jusqu'à l'état attendu au lieu d'attendre un délai fixe (source de flakiness).

  // la clé Vendeurs est conservée mais la route papier doit être retirée des authorizedEntities ;
  // on capture la clé lors du poll pour asserter dessus sans refaire d'appel.
  let vendeurApiKey: any;
  await expect.poll(async () => {
    const res = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${vendeursPapierExtendedDevApiKeyId}`, {
      method: 'GET',
      headers: {
        "Otoroshi-Client-Id": otoroshiAdminApikeyId,
        "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
      },
    });
    if (res.status !== 200) return null;
    vendeurApiKey = await res.json();
    return vendeurApiKey.authorizedEntities as string[];
  }, { timeout: 45000 }).toEqual([otoroshiDevCommandRouteId]);

  await expect(vendeurApiKey.enabled).toBe(true)
  await expect(vendeurApiKey.authorizedEntities.length).toBe(1)
  await expect(vendeurApiKey.authorizedEntities).toEqual(
    expect.arrayContaining([otoroshiDevCommandRouteId])
  );


  // la clé Dwight doit finir par être supprimée d'Otoroshi (404)
  await expect.poll(async () => {
    const res = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${dwightPaperApiKeyId}`, {
      method: 'GET',
      headers: {
        "Otoroshi-Client-Id": otoroshiAdminApikeyId,
        "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
      },
    });
    return res.status;
  }, { timeout: 45000 }).toBe(404);
});

test('sécuriser la création d\'API à l\'aide de la securité de tenant associé', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await createApi(page, { team: 'Vendeurs', name: 'Vente de papier API', state: 'Publiée' });
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
  await page.getByLabel('Sélectionner une équipe pour cette API').click();
  await expect(page.getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('option', { name: 'API Division' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Vendeurs' })).toBeHidden();

  await page.keyboard.press('Escape');
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();
  await logout(page);

  await loginAs(JIM, page);
  await expect(page.getByRole('button', { name: 'Créer une API' })).toBeHidden();
});

test('[ASOAPI-10597] - créer un groupe d\'API', async ({ page }) => {
  const apiGroupName = 'Dunder mifflin suite';

  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);


  await createApi(page, {
    team: 'API Division',
    group: true,
    expert: true,
    name: apiGroupName,
    smallDescription: 'Un groupe, Un parcours, une suite ❤️',
    apis: ['API papier - 1.0.0', 'API Commande - 1.0.0'],
    state: 'Publiée',
  });
  await expect(page.getByRole('heading', { name: apiGroupName }).first()).toBeVisible();
  await page.getByLabel('Accueil Daikoku').click();
  await page.getByRole('link', { name: apiGroupName }).click();


  await page.getByText('APIs', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'API papier' })).toBeVisible();
  await page.getByRole('link', { name: 'API papier' }).click();
  await expect(page.locator('h1')).toBeVisible();
});

const chooseEnvironmentAction = async (environment: Locator, actionName: string) => {
  await environment.getByRole('button', { name: "Configurer l'environnement" }).click();
  await environment.getByRole('menuitem', { name: actionName }).click();
};

test('configurer un environnement', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);

  await page.getByRole('link', { name: 'API papier' }).click();
  await page.getByRole('tab', { name: 'Environnements' }).click();

  const prod = page.getByRole('listitem', { name: 'prod' });
  const dev = page.getByRole('listitem', { name: 'dev' });
  const environmentSheet = page.getByRole('dialog', { name: "Modifier l'environnement" });

  //global config
  await chooseEnvironmentAction(prod, 'Editer');
  await environmentSheet.getByRole('tab', { name: 'Général' }).click();
  await environmentSheet.getByRole('textbox', { name: 'Description' }).fill('nouvelle description de l\'environnement');
  await environmentSheet.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Le plan a été mis à jour avec succès')).toBeVisible();
  await expect(prod.getByText('nouvelle description de l\'environnement')).toBeVisible();

  //quotas config
  await expect(prod.getByText('100 req./sec · 1000 req./jour · 1000 req./mois')).toBeVisible();
  await chooseEnvironmentAction(prod, 'Editer');
  await environmentSheet.getByRole('spinbutton', { name: 'Max. par seconde' }).fill('10');
  await environmentSheet.getByRole('spinbutton', { name: 'Max. par jour' }).fill('20');
  await environmentSheet.getByRole('spinbutton', { name: 'Max. par mois' }).clear();
  await environmentSheet.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(prod.getByText('10 req./sec · 20 req./jour · ∞ req./mois')).toBeVisible();

  //process config
  await expect(dev.getByText('Aucun')).toBeVisible();
  await chooseEnvironmentAction(dev, 'Modifier le process');
  await environmentSheet.getByRole('button', { name: 'Admin. équipe' }).click();
  await environmentSheet.getByRole('button', { name: 'Insérer en position 1' }).click();
  await environmentSheet.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dev.getByText('2 étapes')).toBeVisible();
})
