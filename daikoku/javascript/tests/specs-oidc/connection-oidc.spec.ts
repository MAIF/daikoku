import test, { expect } from '@playwright/test';
import { PAM, JIM, MICHAEL, TOBY, IUser } from './users';
import { ACCUEIL, adminApikeyId, adminApikeySecret, exposedPort, loginOidcAs, logout, tenant } from './utils';
import { env } from 'process';

test.beforeEach(async () => {
  await fetch(`http://localhost:${exposedPort}/admin-api/state/reset`, {
    method: 'POST',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  })
    .then(r => r.json())
    .then(console.log);
});


test('Se connecter via OIDC en tant qu\'admin', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginOidcAs(MICHAEL, page);
  await page.getByRole('img', { name: 'user menu' }).click();
  await expect(page.locator('.navbar-top .dropdown-menu')).toContainText(MICHAEL.email);
  await expect(page.getByRole('link', { name: 'Paramètres Daikoku' })).toBeVisible();
});

test('Se connecter et se déconnecter via OIDC', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginOidcAs(JIM, page);
  await page.getByRole('img', { name: 'user menu' }).click();
  await expect(page.locator('.navbar-top .dropdown-menu')).toContainText(JIM.email);
  await expect(page.getByRole('link', { name: 'Paramètres Daikoku' })).toBeHidden();

  await page.getByRole('button', { name: 'user menu' }).click();
  await logout(page);
});

test('Se connecter avec un user sans role et un userRole defini', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginOidcAs(PAM, page);

  await page.getByRole('heading', { name: 'Une erreur est survenue' }).click();
  await page.getByText('User pam.beesly@dundermifflin').click();
});

test('Se connecter avec un user sans role et un userRole non defini', async ({ page }) => {

  await fetch(`http://localhost:${exposedPort}/admin-api/tenants/${tenant}`, {
    method: 'PATCH',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      {
        "op": "replace",
        "path": "/authProviderSettings/userRole",
        "value": null
      }
    ])
  })


  await page.goto(ACCUEIL);
  await loginOidcAs(PAM, page);

  await page.getByRole('img', { name: 'user menu' }).click();
  await expect(page.locator('.navbar-top .dropdown-menu')).toContainText(PAM.email);
  await expect(page.getByRole('link', { name: 'Mon profil' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Paramètres Daikoku' })).toBeHidden();
});

test('Se connecter avec un user inconnu', async ({ page }) => {

  await fetch(`http://localhost:${exposedPort}/admin-api/tenants/${tenant}`, {
    method: 'PATCH',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      {
        "op": "replace",
        "path": "/authProviderSettings/userRole",
        "value": null
      }
    ])
  })
  await page.goto(ACCUEIL);
  await loginOidcAs(TOBY, page);
  await expect(page.getByText('Error Invalid username or')).toBeVisible();
});


// Regression test for the personal-team creation race (#1114).
// A user that already exists WITHOUT a personal team (here created through the admin-api,
// like an imported/invited user) used to get several personal teams created at once on its
// first OIDC login: the login takes the `updateUser` path (no inline team), so the team is
// created by LoginFilter.findUserTeam, which runs on every request — and the SPA fires many
// requests in parallel, so several of them found no team and each created one.
test('[#1114] - Premier login d\'un user sans équipe perso ne crée qu\'une seule équipe', async ({ page }) => {
  const authHeader = `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`;
  const userId = MICHAEL.id!;

  const createUserResponse = await fetch(`http://localhost:${exposedPort}/admin-api/users`, {
    method: 'POST',
    headers: { "Authorization": authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({
      _id: userId,
      name: MICHAEL.name,
      email: MICHAEL.email,
      tenants: [tenant],
      origins: ["OAuth2"],
      isDaikokuAdmin: true
    })
  });
  expect(createUserResponse.ok).toBeTruthy();

  const personalTeamsOf = async (user: IUser) => {
    const teams = await fetch(`http://localhost:${exposedPort}/admin-api/teams`, {
      headers: { "Authorization": authHeader, "content-type": "application/json" }
    }).then(r => r.json());
    return teams.filter((t: any) =>
      t.type === 'Personal' && (t.users ?? []).some((u: any) => u.userId === user.id)
    );
  };

  expect(await personalTeamsOf(MICHAEL)).toHaveLength(0);

  await page.goto(ACCUEIL);
  await loginOidcAs(MICHAEL, page);

  // Hammer authenticated endpoints concurrently to widen the race window in findUserTeam.
  await Promise.all(
    Array.from({ length: 8 }).map(() =>
      page.request.get(`http://localhost:${exposedPort}/api/me/teams`)
    )
  );

  expect(await personalTeamsOf(MICHAEL)).toHaveLength(1);
});


test('Health check', async () => {
  const actualVersion = await (fetch(`http://localhost:${exposedPort}/api/versions/_daikoku`, {
    method: 'GET',
    headers: {
      "content-type": "application/json",
    }
  }).then(r => r.json()))


  const resultHealth = await (fetch(`http://localhost:${exposedPort}/health/details?access_key=secret`, {
    method: 'GET',
    headers: {
      "content-type": "application/json",
    }
  }).then(r => r.json()))

  const expected = {
      datastore: 'UP',
      'Dunder Mifflin': {
        tenantMode: 'Default',
        status: {
          mailer: 'UP',
          S3: 'ABSENT',
          // @ts-ignore
          otoroshi: process.env.CI ? [{"http://otoroshi:8080 (otoroshi-api.oto.tools)": "UP"}]: [{"http://localhost:8080 (otoroshi-api.oto.tools)": "UP"}]
        },
      },
      "status": "UP",
      "version": actualVersion.version
    };

  expect(resultHealth).toEqual(expected)
});

test("[#1121]: handle uppercase in user mail & [#1120]: connected user has no more invitation prop", async ({ page, browser }) => {
  await page.goto(ACCUEIL);
  await loginOidcAs(MICHAEL, page);

  await page.getByRole('button', { name: 'Mes équipes' }).click();
  await page.getByRole('button', { name: 'Créer une équipe' }).click();
  await page.getByRole('textbox', { name: 'Nom' }).fill('Vendeurs');
  await page.getByRole('button', { name: 'Créer', exact: true }).click();
  await page.getByRole('button', { name: 'Mes équipes' }).click();
  await page.getByRole('link', { name: 'Vendeurs' }).click();
  await page.getByText('Membres').click();
  await page.getByRole('button', { name: 'Inviter un collaborateur' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('andy.bernard@dundermifflin.com');
  await page.getByRole('button', { name: 'Envoyer l\'invitation' }).click();
  await page.getByText('En attente (1)').click();
  await expect(page.getByText('andy.bernard@dundermifflin.com', { exact: true })).toBeVisible();

  const andyContext = await browser.newContext();
  const andyPage = await andyContext.newPage();

  await andyPage.goto('http://localhost:1080/');
  await andyPage.getByText('Rejoindre l\'équipe Vendeurs').first().click();
  await andyPage.getByRole('link', { name: 'Cliquez pour rejoindre l\'é' }).click();
  await expect(andyPage.getByText('L\'équipe Vendeurs vous a invité')).toBeVisible();
  await andyPage.getByRole('link', { name: 'Accepter' }).click();
  await andyPage.getByRole('textbox', { name: 'Username' }).fill('andy.bernard@dundermifflin.com');
  await andyPage.getByRole('textbox', { name: 'Password' }).fill('password');
  await andyPage.getByRole('button', { name: 'Login' }).click();
  await andyPage.getByRole('link', { name: 'Accès aux notifications' }).click();
  await andyPage.getByRole('button', { name: 'Accepter' }).click();
  await andyPage.getByRole('button', { name: 'Mes équipes' }).click();
  await andyPage.getByRole('link', { name: 'Vendeurs' }).click();
  await expect(andyPage.getByRole('heading', { name: 'Vendeurs' })).toBeVisible();

  page.goto(ACCUEIL)
  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Paramètres Daikoku' }).click();
  await page.getByText('Utilisateurs', { exact: true }).click();
  await expect(page.getByText('Andy Bernard')).toBeVisible();
})

