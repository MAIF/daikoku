import { test, expect } from '@playwright/test';
import { ACCUEIL, adminApikeyId, adminApikeySecret, exposedPort, loginAs, otoroshiAdminApikeyId, otoroshiAdminApikeySecret } from './utils';
import { MICHAEL } from './users';
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

const passAPIToDraft = async ({page}, apiName: String) => {
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: `API ${apiName}` }).click();
  await page.getByRole('button', { name: 'Configurer' }).click();
  await page.getByRole('menuitem', { name: 'Configurer' }).click();
  await page.getByRole('button', { name: 'Créée' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
}

const passAPIToPublished = async ({page}, apiName: String) => {
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

const passAPIToDeprecated = async ({page}, apiName: String) => {
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: `API ${apiName}` }).click();
  await page.getByRole('button', { name: 'Configurer' }).click();
  await page.getByRole('menuitem', { name: 'Configurer' }).click();
  await page.getByRole('button', { name: 'Dépréciée' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  expect(page.getByText('Dépréciée')).toBeVisible;
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
}

const passAPIToBlocked = async ({page}, apiName: String) => {
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await page.getByRole('link', { name: `API ${apiName}` }).click();
  await page.getByRole('button', { name: 'Configurer' }).click();
  await page.getByRole('menuitem', { name: 'Configurer' }).click();
  await page.getByRole('button', { name: 'Bloquée' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  expect(page.getByRole('heading', { name: 'Attention' })).toBeVisible;
  await page.getByRole('textbox', { name: `Saisissez API ${apiName}` }).fill(`API ${apiName}`);
  await page.getByRole('button', { name: 'Confirmation' }).click();
  expect(page.getByText('Api bloquée')).toBeVisible;
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
}

test('full Api LifeCycle', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToPublished({page}, 'Commande')
  await passAPIToDeprecated({page}, 'Commande')
  await passAPIToBlocked({page}, 'Commande')
});

test('full Api Backward LifeCycle', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToPublished({page}, 'Commande')
  await passAPIToBlocked({page}, 'Commande')
  await passAPIToDeprecated({page}, 'Commande')
  await passAPIToPublished({page}, 'Commande')
});

test('Pass Published to Blocked', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToPublished({page}, 'Commande')
  await passAPIToBlocked({page}, 'Commande')
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  const api = page.getByRole('listitem').filter({ hasText: 'API Commande' });
  expect(api.getByRole('article').getByRole('article').getByText('Api bloquée')).toBeVisible;
});

test('Pass Published to Deprecated', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToPublished({page}, 'Commande')
  await passAPIToDeprecated({page}, 'Commande')
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  const api = page.getByRole('listitem').filter({ hasText: 'API Commande' });
  expect(api.getByRole('article').getByRole('article').getByText('Api dépréciée')).toBeVisible;
});

test('Cannot pass Draft to Blocked', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToBlocked({page}, 'Commande')
  expect(page.getByText('Conflict with api state')).toBeVisible;
  const api = page.getByRole('listitem').filter({ hasText: 'API Commande' });
  expect(api.getByRole('article').getByRole('article').getByText('Api dépréciée')).toBeVisible;
});

test('Should not be possible to pass to draft if there is subscriptions', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToBlocked({page}, 'Commande')
  await passAPIToDraft({page}, 'Commande')
  expect(page.getByText('Conflict with api state')).toBeVisible;
});

test('When API pass to Blocked, team mates should not have the API in their dashboard', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToBlocked({page}, 'papier')

  await page.getByRole('button', { name: 'user menu' }).click();
  const context = page.context();
  const pageLogin =  await context.newPage();
  pageLogin.goto("http://localhost:5173/auth/LDAP/login")

  await pageLogin.locator('input[name="username"]').fill('dwight.schrute@dundermifflin.com');
  await pageLogin.locator('input[name="password"]').fill('password');
  await pageLogin.getByRole('button', { name: 'Se connecter' }).click();
  const pageDwight = pageLogin;
  expect( pageDwight.getByRole('link', { name: 'API papier' })).not.toBeVisible;
});

test('When API pass to Blocked, team mates should not have access to API page description', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToBlocked({page}, 'papier')

  await page.getByRole('button', { name: 'user menu' }).click();
  const context = page.context();
  const pageLogin =  await context.newPage();
  await pageLogin.goto("http://localhost:5173/auth/LDAP/login")

  await pageLogin.locator('input[name="username"]').fill('dwight.schrute@dundermifflin.com');
  await pageLogin.locator('input[name="password"]').fill('password');
  await pageLogin.getByRole('button', { name: 'Se connecter' }).click();
  const pageDwight = pageLogin;

  const contextDwight = pageDwight.context();
  const pageDescApi =  await contextDwight.newPage();
  const responsePromise = pageDescApi.waitForResponse('http://localhost:5173/api/me/visible-apis/api-papier/1.0.0');
  await pageDescApi.goto('http://localhost:5173/api-division/api-papier/1.0.0/description');
  const response = await responsePromise;
  expect(response.status()).toBe(401)
});

test('Mail has been received by admin for Api deprecated', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToPublished({page}, 'Commande')
  await passAPIToDeprecated({page}, 'Commande')
  const context = page.context();
  const pageMail = await context.newPage();
  pageMail.goto("http://localhost:1080")
  await pageMail.getByText('l\'API API Commande a été dépr').first().click();
  expect(pageMail.getByText('Bonjour Jim Halpert, En tant qu\'administrateur de l\'équipe Vendeurs, nous vous')).toBeVisible;;
  await pageMail.getByText('l\'API API Commande a été dépr').nth(2).click();
  expect(pageMail.getByText('Bonjour Jim Halpert, En tant qu\'administrateur de l\'équipe Logistique, nous')).toBeVisible;;
  await context.close();
});

test('Mail has been received by whole team for Api deprecated', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToPublished({page}, 'papier')
  await passAPIToDeprecated({page}, 'papier')
  const context = page.context();
  const pageMail = await context.newPage();
  pageMail.goto("http://localhost:1080")
  await pageMail.locator('div').filter({ hasText: /^dwight\.schrute@dundermifflin\.com$/ }).click();
  expect(pageMail.getByText('Bonjour Dwight Schrute, En')).toBeVisible;;
  await pageMail.locator('div').filter({ hasText: /^jim\.halpert@dundermifflin\.com$/ }).click();
  expect(pageMail.getByText('Bonjour Jim Halpert, En tant')).toBeVisible;;
  await context.close();
});

test('Mail has been received by admin for API blocked', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToPublished({page}, 'Commande')
  await passAPIToBlocked({page}, 'Commande')
  const context = page.context();
  const pageMail = await context.newPage();
  pageMail.goto("http://localhost:1080")
  await pageMail.getByText('l\'API API Commande a été').first().click();
  expect(pageMail.getByText('Bonjour Jim Halpert, En tant qu\'administrateur de l\'équipe')).toBeVisible;;
  await pageMail.getByText('l\'API API Commande a été').nth(2).click();
  expect(pageMail.getByText('Bonjour Jim Halpert, En tant qu\'administrateur de l\'équipe')).toBeVisible;;
  await context.close();
});

test('Mail has been received by whole team API blocked', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToPublished({page}, 'papier')
  await passAPIToBlocked({page}, 'papier')
  const context = page.context();
  const pageMail = await context.newPage();
  pageMail.goto("http://localhost:1080")
  await pageMail.locator('div').filter({ hasText: /^dwight\.schrute@dundermifflin\.com$/ }).click();
  expect(await pageMail.getByText('Bonjour Dwight Schrute, En')).toBeVisible;;
  await pageMail.locator('div').filter({ hasText: /^jim\.halpert@dundermifflin\.com$/ }).click();
  expect(await pageMail.getByText('Bonjour Jim Halpert, En tant')).toBeVisible;;
  await context.close();
});

test('When API pass to Blocked, check if shared subscription that Oto ApiKey still enabled ', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await passAPIToPublished({page}, 'papier')
  await passAPIToBlocked({page}, 'papier')
  

})


//Verifier par un autre test au blocage (qui ne fonctionnera pas pour le moment) 
// que les souscriptions soient bloquées, et vérifier que la souscription partagée 
// cible une clé d'api Oto qui soit toujours enabled
