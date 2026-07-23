import { expect, test } from '@playwright/test';
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

const passAPIToDraft = async ({ page }, apiName: string) => {
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: `API ${apiName}` }).click();
  await page.getByRole('button', { name: 'Configurer' }).click();
  await page.getByRole('menuitem', { name: 'Configurer' }).click();
  await page.getByRole('button', { name: 'Brouillon' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
}

const passAPIToPublished = async ({ page }, apiName: string) => {
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: `API ${apiName}` }).click();
  await page.getByRole('button', { name: 'Configurer' }).click();
  await page.getByRole('menuitem', { name: 'Configurer' }).click();
  await page.getByRole('button', { name: 'Publiée' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
}

const passAPIToDeprecated = async ({ page }, apiName: string) => {
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: `API ${apiName}` }).click();
  await page.getByRole('button', { name: 'Configurer' }).click();
  await page.getByRole('menuitem', { name: 'Configurer' }).click();
  await page.getByRole('button', { name: 'Dépréciée' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Dépréciée')).toBeVisible();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
}

const passAPIToBlocked = async ({ page }, apiName: string, test: boolean = true) => {
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: `API ${apiName}` }).click();
  await page.getByRole('button', { name: 'Configurer' }).click();
  await page.getByRole('menuitem', { name: 'Configurer' }).click();
  await page.getByRole('button', { name: 'Bloquée' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { name: 'Attention' })).toBeVisible();
  await page.getByRole('textbox', { name: `Saisissez API ${apiName}` }).fill(`API ${apiName}`);
  await page.getByRole('button', { name: 'Confirmation' }).click();
  if (test) {
    await expect(page.getByText('Bloquée')).toBeVisible();
  }
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
}

test('full Api LifeCycle', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToPublished({ page }, 'Commande')
  await passAPIToDeprecated({ page }, 'Commande')
  await passAPIToBlocked({ page }, 'Commande')
});

test('full Api Backward LifeCycle', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToPublished({ page }, 'Commande')
  await passAPIToBlocked({ page }, 'Commande')
  await passAPIToDeprecated({ page }, 'Commande')
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
  await passAPIToPublished({ page }, 'Commande')
  await passAPIToDeprecated({ page }, 'Commande')
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  const api = page.getByRole('listitem').filter({ hasText: 'API Commande' });
  await expect(api.getByText('Dépréciée')).toBeVisible();
});

test('Cannot pass Draft to Blocked', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToDraft({ page }, 'Commande')
  await passAPIToBlocked({ page }, 'Commande', false)
  await expect(page.getByText('Conflict with api state')).toBeVisible();
  const api = page.getByRole('listitem').filter({ hasText: 'API Commande' });
  await expect(api.getByText('Brouillon')).toBeVisible();
});

test('Should not be possible to pass to draft if there is subscriptions', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToBlocked({ page }, 'Commande')
  await passAPIToDraft({ page }, 'Commande')
  await expect(page.getByText('Conflict with api state')).toBeVisible();
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
  await passAPIToPublished({ page }, 'papier')
  await passAPIToDeprecated({ page }, 'papier')
  const context = page.context();
  const pageMail = await context.newPage();
  pageMail.goto("http://localhost:1080")
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
  await expect(await pageMail.getByText('Bonjour Dwight Schrute, En')).toBeVisible();
  await pageMail.locator('div').filter({ hasText: /^jim\.halpert@dundermifflin\.com$/ }).click();
  await expect(await pageMail.getByText('Bonjour Jim Halpert, En tant')).toBeVisible();
});

test('When API pass to Blocked, check if shared subscription that Oto ApiKey still enabled ', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToPublished({ page }, 'papier')
  await passAPIToBlocked({ page }, 'papier')


})

test('When API pass vdvto Blocked, check if shared subscription that Oto ApiKey still enabled ', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(JIM, page);


})
