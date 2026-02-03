import test, { expect } from '@playwright/test';
import otoroshi_data from '../config/otoroshi/otoroshi-state.json';
import { DWIGHT, JIM, MICHAEL } from './users';
import { ACCUEIL, adminApikeyId, adminApikeySecret, exposedPort, loginAs, otoroshiAdminApikeyId, otoroshiAdminApikeySecret, tenant, tenantAdminTeam } from './utils';


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

test("un admin daikoku peut creer une équipe quelque soit la securité", async ({ page }) => {
  await fetch(`http://localhost:${exposedPort}/admin-api/tenants/${tenant}`, {
    method: 'PATCH',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      {
        "op": "add",
        "path": "/teamCreationSecurity",
        "value": true
      }
    ])
  })


  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);

  await page.getByRole('button', { name: 'Mes équipes' }).click();
  await expect(page.locator('.modal-footer').getByRole('button', { name: 'Créer une équipe' })).toBeHidden();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Réglage du tenant' }).click();
  await page.getByText('Équipes', { exact: true }).click();
  await page.getByRole('button', { name: 'Créer une nouvelle équipe' }).click();
  await page.getByRole('textbox', { name: 'Nom' }).fill('test created team');
  await page.getByRole('button', { name: 'Créer', exact: true }).click();
  await expect(page.getByText('L\'équipe test created team a')).toBeVisible();
  await expect(page.locator('.avatar-with-action', { hasText: 'test created team' })).toBeVisible();
});

test("un admin de tenant peut creer une équipe quelque soit la securité", async ({ page }) => {
    await fetch(`http://localhost:${exposedPort}/admin-api/tenants/${tenant}`, {
      method: 'PATCH',
      headers: {
        "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify([
        {
          "op": "add",
          "path": "/teamCreationSecurity",
          "value": true
        }
      ])
    })
    //add dwight as tenant admin
    await fetch(`http://localhost:${exposedPort}/admin-api/teams/${tenantAdminTeam}`, {
      method: 'PATCH',
      headers: {
        "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify([
        {
          "op": "add",
          "path": "/users/2",
          "value": {
            "userId": "1AJMQB27BOOSQJC9xeUEwgDJNC5xuUq4",
            "teamPermission": "Administrator"
          }
        }
      ])
    })

    await page.goto(ACCUEIL);
    await loginAs(DWIGHT, page);

    await page.getByRole('button', { name: 'Mes équipes' }).click();
    await expect(page.locator('.modal-footer').getByRole('button', { name: 'Créer une équipe' })).toBeHidden();
    await page.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Réglage du tenant' }).click();
    await page.getByText('Équipes', { exact: true }).click();
    await page.getByRole('button', { name: 'Créer une nouvelle équipe' }).click();
    await page.getByRole('textbox', { name: 'Nom' }).fill('test created team');
    await page.getByRole('button', { name: 'Créer', exact: true }).click();
    await expect(page.getByText('L\'équipe test created team a')).toBeVisible();
    await expect(page.locator('.avatar-with-action', { hasText: 'test created team' })).toBeVisible();
});

test("un utilisateur peut creer une équipe si la securité de creation d'équipe est desactivé", async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(JIM, page);

  await page.getByRole('button', { name: 'Mes équipes' }).click();
  await expect(page.locator('.modal-footer').getByRole('button', { name: 'Créer une équipe' })).toBeVisible();
  await page.locator('.modal-footer').getByRole('button', { name: 'Créer une équipe' }).click();
  await page.getByRole('textbox', { name: 'Nom' }).fill('test created team');
  await page.getByRole('button', { name: 'Créer', exact: true }).click();
  await expect(page.getByText('L\'équipe test created team a')).toBeVisible();
  await page.getByRole('button', { name: 'Mes équipes' }).click();
  await expect(page.getByRole('link', { name: 'test created team' })).toBeVisible();
});
test("un utilisateur peut creer une équipe si la securité de reation d'équipe est desactivé", async ({ page }) => {
  await fetch(`http://localhost:${exposedPort}/admin-api/tenants/${tenant}`, {
    method: 'PATCH',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      {
        "op": "add",
        "path": "/teamCreationSecurity",
        "value": true
      }
    ])
  })
  await page.goto(ACCUEIL);
  await loginAs(JIM, page);

  await page.getByRole('button', { name: 'Mes équipes' }).click();
  await expect(page.locator('.modal-footer').getByRole('button', { name: 'Créer une équipe' })).toBeHidden();
});