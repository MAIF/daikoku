import test, { expect } from '@playwright/test';
import { JIM, MICHAEL, PAM } from './users';
import { ACCUEIL, adminApikeyId, adminApikeySecret, EMAIL_UI, exposedPort, HOME, loginAs, otoroshiAdminApikeyId, otoroshiAdminApikeySecret } from './utils';
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

test.describe('Tenant privé', () => {
  const setTenantPrivate = async (isPrivate: boolean) =>
    fetch(`http://localhost:${exposedPort}/admin-api/tenants/default`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${btoa(adminApikeyId + ':' + adminApikeySecret)}`,
      },
      body: JSON.stringify([{ op: 'replace', path: '/isPrivate', value: isPrivate }]),
    });

  const setTenantAuthLocal = async () =>
    Promise.all([
      fetch(`http://localhost:${exposedPort}/admin-api/tenants/default`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${btoa(adminApikeyId + ':' + adminApikeySecret)}`,
        },
        body: JSON.stringify([{ op: 'replace', path: '/authProvider', value: 'Local' }]),
      }),
      fetch(`http://localhost:${exposedPort}/admin-api/users/${MICHAEL.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${btoa(adminApikeyId + ':' + adminApikeySecret)}`,
        },
        body: JSON.stringify([{ op: 'replace', path: '/password', value: '"$2a$10$/Vpj1lFN0AcCfbutd7FJwO0j1vU4X0fR6t.4vvWBqSEqtoUFFxfDG"' }]),
      }),
    ]);

  // test.afterEach(async () => {
  //   await setTenantPrivate(false);
  // });

  test('Un tenant privé redirige vers la page de login', async ({ page }) => {
    await setTenantPrivate(true);
    await page.goto(ACCUEIL);
    await expect(page).toHaveURL(/\/auth\/.*\/login/);
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  });

  test('Un user peut se connecter et se déconnecter sur un tenant privé', async ({ page }) => {
    await setTenantPrivate(true);
    await page.goto(ACCUEIL);
    await expect(page).toHaveURL(/\/auth\/.*\/login/);

    await page.locator('input[name="username"]').fill(JIM.email);
    await page.locator('input[name="password"]').fill('password');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByRole('link', { name: 'API papier' })).toBeVisible();

    await page.getByRole('img', { name: 'user menu' }).click();
    await page.getByRole('link', { name: 'Déconnexion' }).click();
    await expect(page).toHaveURL(/\/auth\/.*\/login/);
  });

  test('La page reset password est accessible sur un tenant privé avec auth locale', async ({ page }) => {
    await setTenantAuthLocal();
    await setTenantPrivate(true);

    await page.goto(ACCUEIL)
    await expect(page).toHaveURL(`http://localhost:${exposedPort}/auth/Local/login`)
    await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click();
    await page.getByRole('textbox', { name: 'Courriel' }).fill(MICHAEL.email);
    await page.getByRole('button', { name: 'Réinitialisation' }).click();
    await expect(page.getByText('Vous recevrez un courrier')).toBeVisible();
    await page.goto(EMAIL_UI);
    await page.locator('div').filter({ hasText: /^no-reply@dundermifflin\.com$/ }).click();
    const page4Promise = page.waitForEvent('popup');
    await page.getByRole('link', { name: 'Réinitialiser' }).click();
    const page4 = await page4Promise;
    await page4.getByRole('textbox', { name: 'Courriel' }).fill(MICHAEL.email);
    await page4.getByRole('textbox', { name: 'Courriel' }).press('Tab');
    const NEW_PASSWORD = 'Passw0rd!!!'
    await page4.locator('form').locator('#password').fill(NEW_PASSWORD);
    await page4.getByRole('textbox', { name: 'Confirmation de mot de passe' }).fill(NEW_PASSWORD);
    await page4.getByRole('button', { name: 'Réinitialisation' }).click();
    await expect(page4).toHaveURL(`${HOME}auth/Local/login`);
    await page4.locator('input[type="text"]').fill('michael.scott@dundermifflin.com');
    await page4.locator('form').locator('input[name="password"]').fill('Passw0rd!!!');
    await page4.getByRole('button', { name: 'Se connecter' }).click();
    await page4.getByRole('button', { name: 'user menu' }).click();
    await expect(page4.locator('#app')).toContainText(MICHAEL.email);
  });

  test('La page signup password est accessible sur un tenant privé avec auth locale', async ({ page }) => {
    await setTenantAuthLocal();
    await setTenantPrivate(true);

    const PASSWORD = 'Passw0rd!!!'
    const MAIL = 'erin.hannon@dundermifflin.com'

    await page.goto(`${ACCUEIL}`);

    await page.getByRole('link', { name: 'Créer un compte' }).click();
    await page.getByRole('textbox', { name: 'Nom' }).fill('Erin Hannon');
    await page.getByRole('textbox', { name: 'Courriel' }).fill(MAIL);
    await page.getByRole('textbox', { name: 'Mot de passe', exact: true }).fill(PASSWORD);
    await page.getByRole('textbox', { name: 'Confirmation du mot de passe' }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Création d\'un compte' }).click();
    await expect(page.getByRole('heading', { name: 'Confirmation de votre compte' })).toBeVisible();
    await page.goto(EMAIL_UI);
    await page.getByText('Confirmez votre adresse e-mail pour activer votre compte Dunder Mifflin', { exact: true }).click();
    const newPagePromise = page.waitForEvent('popup');
    await page.getByRole('link', { name: '👉 [Confirmer mon adresse e-mail' }).click();
    const page2 = await newPagePromise;
    await expect(page2.getByRole('heading', { name: 'Création de compte approuvée' })).toBeVisible();
    await page2.getByText('Revenir au catalogue d\'APIs').click();
    await page2.locator('input[name="username"]').fill(MAIL);
    await page2.locator('input[name="password"]').fill(PASSWORD);
    await page2.getByRole('button', { name: 'Se connecter' }).click();
    await page2.getByRole('button', { name: 'user menu' }).click();
    await expect(page2.getByText(MAIL)).toBeVisible();
  });

  test("L'impersonation fonctionne sur un tenant privé", async ({ page }) => {
    await setTenantPrivate(true);
    await page.goto(ACCUEIL);
    await expect(page).toHaveURL(/\/auth\/.*\/login/);

    await page.locator('input[name="username"]').fill(MICHAEL.email);
    await page.locator('input[name="password"]').fill('password');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByRole('link', { name: 'API papier' })).toBeVisible();

    await page.goto(`${HOME}settings/users`);
    const page1Promise = page.waitForEvent('popup');
    await page.getByLabel('Jim Halpert').getByRole('link').filter({ hasText: /^$/ }).click();
    const page1 = await page1Promise;
    await page1.getByRole('button', { name: 'user menu' }).click();
    await expect(page1.locator('#app')).toContainText(JIM.email);


    await page1.getByRole('link', { name: 'Quitter l\'impersonation' }).click();
    await expect(page.locator('#app')).toContainText(MICHAEL.email);
  });
});

