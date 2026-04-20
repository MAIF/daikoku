import test, { expect } from '@playwright/test';
import { MICHAEL } from './users';
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

const passInModeMaintenance = async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page)
  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByText('En maintenance').click();
  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();
}

test('Passe en mode maintenance', async ({ page }) => {
  await passInModeMaintenance({ page })
  await expect(page.getByRole('heading', { name: 'Daikoku est en maintenance' })).toBeVisible();
});

test('Se connecter en maintenance avec admin', async ({ page }) => {
  await passInModeMaintenance({ page })
  const input = page.locator('input[name="username"]');
  await input.fill(MICHAEL.email);
  await page.locator('input[name="password"]').fill('password');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();
  const inputPass = page.locator('input[name="username"]');
  await inputPass.fill('admin@foo.bar');
  await page.locator('input[name="password"]').fill('password');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();
  await expect(page.getByRole('heading', { name: 'Daikoku est en maintenance' })).toBeVisible();
});

test('redirection par l\'url retourne page maintenance', async ({ page }) => {
  await passInModeMaintenance({ page })
  await page.goto(`http://localhost:${exposedPort}/apis`)
  await expect(page.getByRole('heading', { name: 'Daikoku est en maintenance' })).toBeVisible();
});



