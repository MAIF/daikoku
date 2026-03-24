import test, { expect } from '@playwright/test';
import { JIM, PAM } from './users';
import { ACCUEIL, adminApikeyId, adminApikeySecret, exposedPort, HOME, loginAs, otoroshiAdminApikeyId, otoroshiAdminApikeySecret } from './utils';
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

test('Se connecter et se deconnecter depuis une page conserve la localisation', async ({ page }) => {
  await page.goto(`${HOME}api-division/api-papier/1.0.0/pricing`);
  await loginAs(JIM, page, false)
  await expect(page).toHaveURL(`${HOME}api-division/api-papier/1.0.0/pricing`)
  
  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();
  await expect(page).toHaveURL(`${HOME}api-division/api-papier/1.0.0/pricing`)
});

test('Se connecter depuis la modale de la page des plan de souscription conserve la localisation', async ({ page }) => {
  await page.goto(`${HOME}api-division/api-papier/1.0.0/pricing`);
  
  await page.getByLabel('dev').getByRole('button', { name: 'Obtenir une clé d\'API' }).click();
  await page.getByRole('link', { name: 'Se connecter' }).click();
  await page.locator('input[name="username"]').fill(JIM.email);
  await page.locator('input[name="password"]').fill('password');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(`${HOME}api-division/api-papier/1.0.0/pricing`)
});

