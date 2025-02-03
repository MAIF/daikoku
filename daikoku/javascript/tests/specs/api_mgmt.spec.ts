import { test, expect } from '@playwright/test';
import { ACCUEIL, adminApikeyId, adminApikeySecret, dwhightPaperApiKeyId, exposedPort, loginAs, logout, otoroshiAdminApikeyId, otoroshiAdminApikeySecret, otoroshiDevCommandRouteId, otoroshiDevPaperRouteId, vendeursPapierExtendedDevApiKeyId } from './utils';
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
  await page.getByRole('button', { name: 'Ouvrir le menu de création' }).click();
  await page.locator('span').filter({ hasText: 'API' }).first().click();
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
  await page.getByLabel('Accueil Daikoku').click();
  await expect(page.getByRole('heading', { name: 'API Betterave' })).toBeVisible();
  await logout(page);
  await expect(page.getByRole('heading', { name: 'API Betterave' })).toBeHidden();

  await loginAs(JIM, page);
  await page.locator('div.row.py-4', { hasText: 'API Betterave' }).getByLabel('paramètres').click();
  await page.getByRole('button', { name: 'Publiée' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByLabel('Accueil Daikoku').click();
  await expect(page.getByRole('heading', { name: 'API Betterave' })).toBeVisible();
  await logout(page);
  await expect(page.getByRole('heading', { name: 'API Betterave' })).toBeVisible();
  await loginAs(JIM, page);
  await page.locator('div.row.py-4', { hasText: 'API Betterave' }).getByLabel('paramètres').click();
  //todo: wait for better API lifecycle to test deprected
  // await page.getByRole('button', { name: 'Dépréciée' }).click();
  // await page.getByRole('button', { name: 'Enregistrer' }).click();
  // await page.getByLabel('Liste des APIs').click();
  // await page.getByRole('heading', { name: 'API Betterave' }).click();
  // await page.getByLabel('Liste des APIs').click();
  // await page.locator('div.row.py-4', { hasText: 'API Betterave' }).getByLabel('paramètres').click();
  await page.getByRole('button', { name: 'Bloquée' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByLabel('Liste des APIs').click();
  await expect(page.getByRole('heading', { name: 'API Betterave' })).toBeVisible();
  await logout(page);
  await expect(page.getByRole('heading', { name: 'API Betterave' })).toBeHidden();
});

test('[ASOAPI-10597] [ASOAPI-10599] - créer/supprimer une version d\'une API', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await page.locator('div.row.py-4', { hasText: 'API papier' }).getByLabel('paramètres').click();
  await page.locator('.navbar-companion .btn').first().click();
  await page.getByPlaceholder('Numéro de version').fill('2.0.0');
  await page.getByRole('button', { name: 'Créer' }).click();
  await expect(page.getByRole('status')).toContainText('La nouvelle version de l\'API a été créée avec succès');
  await page.getByLabel('Desc. courte').fill('Le catalogue de Papier de Dunder Mifflin dans sa deuxieme version');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.waitForResponse(r => r.request().url().includes('/apis/api-papier/2.0.0') && r.status() === 200)
  await page.getByLabel('Accueil Daikoku').click();
  await expect(page.locator('div.row.py-4', { hasText: 'API papier' }).locator('.lead'))
    .toHaveText('Le catalogue de Papier de Dunder Mifflin dans sa deuxieme version')
  await page.getByRole('heading', { name: 'API papier' }).click();
  await expect(page.url()).toContain('api-papier/2.0.0');

  //supprimer la version
  await page.getByRole('link', { name: 'Configurer l\'API' }).click();
  await page.getByText('Paramètres').click();
  await page.getByRole('button', { name: 'Supprimer' }).click();
  await page.getByLabel('Saisissez API papier pour').click();
  await page.getByLabel('Saisissez API papier pour').fill('API papier');
  await page.getByRole('button', { name: 'Confirmation' }).click();
  await page.waitForTimeout(500); //todo: maybe better way
  const statuses = await page.getByRole('status').all();
  const statusTexts = await Promise.all(statuses.map(status => status.textContent()));
  await expect(statusTexts.some(text => text?.includes('Supprimé avec succès'))).toBeTruthy();

  await expect(page.getByText('API papier - (1.0.0)')).toBeVisible();
  await page.getByLabel('Liste des APIs').click();
});

test('[ASOAPI-10599] - supprimer une API', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await page.getByLabel('API papier').getByLabel('paramètres').click();
  await page.getByText('Paramètres').click();
  await page.getByRole('button', { name: 'Supprimer' }).click();
  await page.getByLabel('Saisissez API papier pour').click();
  await page.getByLabel('Saisissez API papier pour').fill('API papier');
  await page.getByRole('button', { name: 'Confirmation' }).click();
  await expect(page.getByRole('status')).toContainText('Supprimé avec succès');
  await expect(page.getByRole('row', { name: 'API papier' })).toBeHidden();

  await page.getByLabel('Liste des APIs').click();
  await expect(page.getByRole('heading', { name: 'API Papier' })).toBeHidden();

  await page.getByPlaceholder('Trouver une équipe').click();
  await page.getByPlaceholder('Trouver une équipe').fill('vendeur');
  await page.getByText('Vendeurs').click();
  await page.getByText('Clés d\'API').click();
  await expect(page.getByRole('row', { name: 'API papier' })).toBeHidden();

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


  const MaybeDwightApiKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${dwhightPaperApiKeyId}`, {
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

