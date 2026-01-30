import test, { expect } from '@playwright/test';
import { PAM, JIM, MICHAEL, TOBY } from './users';
import { ACCUEIL, adminApikeyId, adminApikeySecret, exposedPort, loginOidcAs, logout, tenant } from './utils';

test.beforeEach(async () => {
  await fetch(`http://localhost:${exposedPort}/admin-api/state/reset`, {
    method: 'POST',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  });
  await fetch('http://localhost:1080/api/emails', {
    method: 'DELETE'
  });
});


test('Se connecter via OIDC en tant qu\'admin', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginOidcAs(MICHAEL, page);
  await page.getByRole('img', { name: 'user menu' }).click();
  await expect(page.locator('.dropdown-menu')).toContainText(MICHAEL.email);
  await expect(page.getByRole('link', { name: 'Paramètres Daikoku' })).toBeVisible();
});

test('Se connecter et se déconnecter via OIDC', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginOidcAs(JIM, page);
  await page.getByRole('img', { name: 'user menu' }).click();
  await expect(page.locator('.dropdown-menu')).toContainText(JIM.email);
  await expect(page.getByRole('link', { name: 'Paramètres Daikoku' })).toBeHidden();


  //todo: tester pas daikokua dmin
  await page.getByRole('button', { name: 'user menu' }).click();
  await logout(page);
  await page.getByRole('img', { name: 'user menu' }).click();
  await expect(page.locator('.dropdown-menu')).not.toContainText(JIM.email);
  await expect(page.getByRole('link', { name: 'Paramètres Daikoku' })).toBeHidden();
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
  await expect(page.locator('#app')).toContainText(PAM.email);
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