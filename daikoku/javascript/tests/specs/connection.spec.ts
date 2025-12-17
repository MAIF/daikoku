import test, { expect } from '@playwright/test';
import { JIM, PAM } from './users';
import { ACCUEIL, adminApikeyId, adminApikeySecret, exposedPort, loginAs, otoroshiAdminApikeyId, otoroshiAdminApikeySecret } from './utils';
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

test('[ASOAPI-10358] - Se connecter pour la première fois', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(PAM, page)
  // await expect(page.getByText(PAM.name)).toBeVisible();
  await page.getByRole('img', { name: 'user menu' }).click();
  await expect(page.locator('#app')).toContainText(PAM.email);
  await page.getByRole('button', { name: 'Taper / pour rechercher' }).click();
  await expect(page.getByRole('link', { name: PAM.name })).toBeVisible();
});
test('[ASOAPI-10359] - Se connecter pour la première fois en tant qu\'administrateur d\'équipe', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(JIM, page)
  await page.getByRole('button', { name: 'Taper / pour rechercher' }).click();
  await expect(page.getByRole('link', { name: JIM.name })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Vendeurs' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Logistique' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Rechercher une API, équipe,' }).press('Escape');
  await page.getByRole('img', { name: 'user menu' }).click();
  await expect(page.locator('#app')).toContainText(JIM.email);
});

