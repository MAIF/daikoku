import test, { expect } from '@playwright/test';
import otoroshi_data from '../config/otoroshi/otoroshi-state.json';
import { JIM } from './users';
import { ACCUEIL, adminApikeyId, adminApikeySecret, exposedPort, loginAs, otoroshiAdminApikeyId, otoroshiAdminApikeySecret } from './utils';


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

test('[ASOAPI-10169] - anonyme - Consulter l\'offre API', async ({ page }) => {
  await page.goto(ACCUEIL);
  await expect(page.locator('h3').filter({ hasText: 'admin-api-tenant-default' })).not.toBeVisible();
  await expect(page.locator('h3').filter({ hasText: 'cms-api-tenant-default' })).not.toBeVisible();
  await expect(page.locator('h3').filter({ hasText: 'API papier' })).toBeVisible();
  await expect(page.locator('.top__container', { hasText: 'Vos équipes' })).not.toBeVisible();

  await page.getByPlaceholder('Rechercher une API...').fill('papier');
  await expect(page.getByLabel('API papier')).toBeVisible();
  await page.getByPlaceholder('Rechercher une API...').fill('paper');
  await expect(page.getByLabel('API papier')).toBeHidden();
  await expect(page.getByRole('main')).toContainText('0');
  await page.getByText('supprimer les filtres').click();
  await expect(page.getByLabel('API papier')).toBeVisible();
});

test('[ASOAPI-10151] - Consulter l\'offre API', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  await expect(page.getByLabel('admin-api-tenant-default')).not.toBeVisible();
  await expect(page.getByLabel('cms-api-tenant-default')).not.toBeVisible();
  await expect(page.getByLabel('API papier')).toBeVisible();

  await page.getByPlaceholder('Rechercher une API...').fill('papier');
  await expect(page.getByLabel('API papier')).toBeVisible();
  await page.getByPlaceholder('Rechercher une API...').fill('paper');
  await expect(page.getByRole('main')).toContainText('0');
  await expect(page.getByLabel('API papier')).toBeHidden();
  await page.getByText('supprimer les filtres').click();
  await expect(page.getByLabel('API papier')).toBeVisible();
});