import { expect, Page, test } from '@playwright/test';
import otoroshi_data from '../config/otoroshi/otoroshi-state.json';
import { DWIGHT, JIM, MICHAEL } from './users';
import {
  ACCUEIL, adminApikeyId, adminApikeySecret, exposedPort, loginAs, logout, otoroshiAdminApikeyId, otoroshiAdminApikeySecret
} from './utils';



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

type ApiLifeCycleStates = "Brouillon" | "Publiée" | "Dépréciée" | "Bloquée"


const updateApiLifeCycle = async (page: Page, apiName: string, state: ApiLifeCycleStates, assertResult: boolean = true) => {
  await page.goto("/api-division/api-commande/1.0.0/description");
  // await page.getByRole('link', { name: `API ${apiName}` }).click();
  await page.getByRole('button', { name: 'Configurer' }).click();
  await page.getByRole('menuitem', { name: 'Configurer' }).click();
  await page.getByRole('button', { name: state }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  if (assertResult) {
    await expect(page.locator('.api__header').getByText(state)).toBeVisible();
  }
  await page.goto(ACCUEIL);
}

const passAPIToDraft = async ({ page }, apiName: string, assertResult: boolean = true) => {
  await page.goto(ACCUEIL);
  await page.getByRole('link', { name: `API ${apiName}` }).click();
  await page.getByRole('button', { name: 'Configurer' }).click();
  await page.getByRole('menuitem', { name: 'Configurer' }).click();
  await page.getByRole('button', { name: 'Brouillon' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  if (assertResult) {
    await expect(page.getByText('Brouillon')).toBeVisible();
  }
  await page.goto(ACCUEIL);
}

const passAPIToPublished = async ({ page }, apiName: string, assertResult: boolean = true) => {
  await page.goto(ACCUEIL);
  await page.getByRole('link', { name: `API ${apiName}` }).click();
  await page.getByRole('button', { name: 'Configurer' }).click();
  await page.getByRole('menuitem', { name: 'Configurer' }).click();
  await page.getByRole('button', { name: 'Publiée' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  if (assertResult) {
    await expect(page.getByText('Publiée')).toBeVisible();
  }
  await page.goto(ACCUEIL);
}

const passAPIToDeprecated = async ({ page }, apiName: string, assertResult: boolean = true) => {
  await page.getByRole('link', { name: `API ${apiName}` }).click();
  await page.getByRole('button', { name: 'Configurer' }).click();
  await page.getByRole('menuitem', { name: 'Configurer' }).click();
  await page.getByRole('button', { name: 'Dépréciée' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  if (assertResult) {
    await expect(page.getByText('Dépréciée')).toBeVisible();
  }
}

const passAPIToBlocked = async ({ page }, apiName: string, assertResult: boolean = true) => {
  await page.getByRole('link', { name: `API ${apiName}` }).click();
  await page.getByRole('button', { name: 'Configurer' }).click();
  await page.getByRole('menuitem', { name: 'Configurer' }).click();
  await page.getByRole('button', { name: 'Bloquée' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { name: 'Attention' })).toBeVisible();
  await page.getByRole('textbox', { name: `Saisissez API ${apiName}` }).fill(`API ${apiName}`);
  await page.getByRole('button', { name: 'Confirmation' }).click();
  if (assertResult) {
    await expect(page.getByText('Bloquée')).toBeVisible();
  }
}

test('full Api LifeCycle', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToPublished({ page }, 'Commande')
  await page.goto(ACCUEIL);
  await passAPIToDeprecated({ page }, 'Commande')
  await page.goto(ACCUEIL);
  await passAPIToBlocked({ page }, 'Commande')
});

test('full Api Backward LifeCycle', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToBlocked({ page }, 'Commande')
  await expect(page.locator(".api__header").getByText('Bloquée')).toBeVisible();
  await page.goto(ACCUEIL);
  await passAPIToDeprecated({ page }, 'Commande')
  await expect(page.locator(".api__header").getByText('Dépréciée')).toBeVisible();
  await page.goto(ACCUEIL);
  await passAPIToPublished({ page }, 'Commande')
});

test('Pass Published to Blocked', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToPublished({ page }, 'Commande')
  await passAPIToBlocked({ page }, 'Commande')
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  const api = page.getByRole('listitem').filter({ hasText: 'API Commande' });
  await expect(api.getByText('Bloquée')).toBeVisible();
});

test('Pass Published to Deprecated', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToDeprecated({ page }, 'Commande')
  await page.goto(ACCUEIL);
  const api = page.getByRole('listitem').filter({ hasText: 'API Commande' });
  await expect(api.getByText('Dépréciée')).toBeVisible();
});

test('Cannot pass Draft to Blocked', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);

  await page.getByRole('button', { name: 'Créer une API' }).click();
  await page.getByRole('listitem', { name: 'API Division' }).click();
  await page.getByRole('textbox', { name: 'Nom' }).fill('test API');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByRole('button', { name: 'Configurer' }).click();
  await page.getByRole('menuitem', { name: 'Configurer' }).click();
  await expect(page.getByRole('button', { name: 'Brouillon' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Bloquée' })).toBeDisabled();
});

test('Draft is disabled in the config form when the API has subscriptions', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  // 'API Commande' is published and already has subscriptions in the seed, so
  // the subscription guard must forbid moving it (back) to draft: the client
  // disables the 'Brouillon' option (the backend 409 is covered by the Scala
  // ApiLifeCycleSpec). Requires @maif/react-forms to honor per-option `disabled`.
  await page.getByRole('link', { name: 'API Commande' }).click();
  await page.getByRole('button', { name: 'Configurer' }).click();
  await page.getByRole('menuitem', { name: 'Configurer' }).click();
  await expect(page.getByRole('button', { name: 'Brouillon' })).toBeDisabled();
});

test('When API pass to Blocked, team mates should not have the API in their dashboard', async ({ page, browser }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToBlocked({ page }, 'Commande')
  await logout(page)

  await page.goto(ACCUEIL);
  await loginAs(DWIGHT, page)

  await expect(page.getByRole('link', { name: 'API papier' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'API commande' })).not.toBeVisible();
});

test('Mail has been received by admin for Api deprecated', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToPublished({ page }, 'Commande')
  await passAPIToDeprecated({ page }, 'Commande')
  const context = page.context();
  const pageMail = await context.newPage();
  await pageMail.goto("http://localhost:1080")
  await pageMail.getByText('l\'API API Commande a été dépr').first().click();

  await expect(pageMail.locator('#root'))
    .toContainText('Bonjour Jim Halpert, En tant qu\'administrateur de l\'équipe Logistique, nous vous informons que l\'API API Commandea été dépréciée.');
});

test('Mail has been received by whole team for Api deprecated', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToDeprecated({ page }, 'papier')
  const context = page.context();
  const pageMail = await context.newPage();
  await pageMail.goto("http://localhost:1080")
  await pageMail.locator('div').filter({ hasText: /^dwight\.schrute@dundermifflin\.com$/ }).click();
  await expect(pageMail.getByText('Bonjour Dwight Schrute, En')).toBeVisible();
  await pageMail.locator('div').filter({ hasText: /^jim\.halpert@dundermifflin\.com$/ }).click();
  await expect(pageMail.getByText('Bonjour Jim Halpert, En tant')).toBeVisible();
});

test('Mail has been received by admin for API blocked', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToPublished({ page }, 'Commande')
  await passAPIToBlocked({ page }, 'Commande')
  const context = page.context();
  const pageMail = await context.newPage();
  await pageMail.goto("http://localhost:1080")
  await pageMail.getByText('l\'API API Commande a été').first().click();

  await expect(pageMail.locator('#root'))
    .toContainText('Bonjour Jim Halpert, En tant qu\'administrateur de l\'équipe Logistique, nous vous informons que l\'API API Commandea été bloquée.');
});

test('Mail has been received by whole team API blocked', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToPublished({ page }, 'papier')
  await passAPIToBlocked({ page }, 'papier')
  const context = page.context();
  const pageMail = await context.newPage();
  await pageMail.goto("http://localhost:1080")
  await pageMail.locator('div').filter({ hasText: /^dwight\.schrute@dundermifflin\.com$/ }).click();
  await expect(pageMail.getByText('Bonjour Dwight Schrute, En')).toBeVisible();
  await pageMail.locator('div').filter({ hasText: /^jim\.halpert@dundermifflin\.com$/ }).click();
  await expect(pageMail.getByText('Bonjour Jim Halpert, En tant')).toBeVisible();
});

test('Blocked sub by API owner action display a blocked state to consumer', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);

  await passAPIToBlocked({ page }, 'Commande', true);
  await page.getByText('Souscriptions').click();
  const rows = page.getByRole('row', { name: 'daikoku-api-key' })
  for (const row of await rows.all()) {
    await expect(row.getByText('Bloquée')).toBeVisible();
  }
  await page.getByText('Clés d\'API').click();
  await expect(page.locator('.keyring-card__subscriptions').first()).toContainText('Bloquée');
})
