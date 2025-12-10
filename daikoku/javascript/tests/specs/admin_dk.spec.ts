import test, { expect, Locator } from '@playwright/test';
import otoroshi_data from '../config/otoroshi/otoroshi-state.json';
import { DWIGHT, IUser, JIM, MICHAEL } from './users';
import { ACCUEIL, adminApikeyId, adminApikeySecret, dwhightPaperApiKeyId, exposedPort, loginAs, otoroshiAdminApikeyId, otoroshiAdminApikeySecret } from './utils';


test.beforeEach(async () => {
  console.log(`Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`)
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


test('[ASOAPI-10396] - Se connecter en étant membre du groupe AD Managers (maif ==> M_GRG_Gateway_API_Interne)', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page)
  await expect(page.getByRole('link', { name: 'admin-api-tenant-default' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'cms-api-tenant-default' })).toBeVisible();
  await page.getByRole('button', { name: 'Taper / pour rechercher' }).click();
  await page.getByRole('textbox', { name: 'Rechercher une API, équipe,' }).fill('dunder');
  await expect(page.locator('#portal-root').getByRole('link', { name: 'dunder-mifflin-admin-team' })).toBeVisible();
});

test('[ASOAPI-10506] - Supprimer définitivement un utilisateur ', async ({ page }) => {
  const getAvatar = (user: IUser): Locator => {
    return page.locator(".avatar-with-action__infos", { hasText: user.name })
  }

  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page)
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Paramètres Daikoku' }).click();
  await page.getByText('Utilisateurs', { exact: true }).click();
  await getAvatar(JIM).isVisible();
  await expect(getAvatar(JIM).locator("i.fa-shield-alt")).not.toBeVisible();

  await page.locator('.avatar-with-action', { hasText: new RegExp(JIM.name) })
    .locator(".container")
    .hover();

  await page.locator('.avatar-with-action', { hasText: new RegExp(JIM.name) })
    .locator('span.avatar-with-action__action[data-tooltip-content="Supprimer l\'utilisateur"]')
    .click();

  await expect(page.locator('.modal h5')).toContainText('Confirmation');
  await page.getByLabel('Saisissez ').fill('test');
  await expect(page.locator('form')).toContainText(`Veuillez saisir ${JIM.name} pour valider le transfert`);
  await page.getByLabel('Saisissez ').fill(JIM.name);
  await page.getByRole('button', { name: 'Confirmation' }).click();
  await page.waitForResponse(response => response.url().includes('/api/admin/users/') && response.status() === 200)
  await expect(getAvatar(JIM)).toBeHidden();
});

test('[ASOAPI-10506] - Supprimer définitivement un utilisateur (cas particulier d\'utilisateur avec APIkey active)', async ({ page }) => {
  //l'utilisateur qui a deja une clé d'api est dwight
  const getDwightAvatar = (): Locator => {
    return page.locator(".avatar-with-action__infos", { hasText: DWIGHT.name })
  }

  const beginningKey = await fetch(`http://otoroshi-api.oto.tools:8080/apis/apim.otoroshi.io/v1/apikeys/${dwhightPaperApiKeyId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  })
  await expect(beginningKey.status).toBe(200)

  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page)
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Paramètres Daikoku' }).click();
  await page.getByText('Utilisateurs', { exact: true }).click();
  await getDwightAvatar().isVisible();
  await expect(getDwightAvatar().locator("i.fa-shield-alt")).not.toBeVisible();

  await page.locator('.avatar-with-action', { hasText: new RegExp(DWIGHT.name) })
    .locator(".container")
    .hover();

  await page.locator('.avatar-with-action', { hasText: new RegExp(DWIGHT.name) })
    .locator('span.avatar-with-action__action[data-tooltip-content="Supprimer l\'utilisateur"]')
    .click();

  await expect(page.locator('.modal h5')).toContainText('Confirmation');
  await page.getByLabel('Saisissez Dwight Schrute').fill(DWIGHT.name);
  await page.getByRole('button', { name: 'Confirmation' }).click();
  await page.waitForResponse(response => response.url().includes('/api/admin/users/1AJMQB27BOOSQJC9xeUEwgDJNC5xuUq4') && response.status() === 200)
  await expect(getDwightAvatar()).not.toBeVisible();

  const maybeKey = await fetch(`http://otoroshi-api.oto.tools:8080/api/apikeys/${dwhightPaperApiKeyId}`, {
    method: 'GET',
    headers: {
      "Otoroshi-Client-Id": otoroshiAdminApikeyId,
      "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
    },
  })
  await expect (maybeKey.status).toBe(404)
});