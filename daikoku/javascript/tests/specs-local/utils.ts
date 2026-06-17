import { Page } from "@playwright/test";
import { IUser } from "./users";

export const adminApikeyId = 'admin_key_client_id';
export const adminApikeySecret = 'admin_key_client_secret';

export const exposedPort = process.env.EXPOSED_PORT || 5173;
export const EMAIL_UI = "http://localhost:1080";
export const ACCUEIL = `http://localhost:${exposedPort}/apis`;
export const HOME = `http://localhost:${exposedPort}/`;

export const tenant = 'default';

/**
 * Reset Daikoku state and clear the fake-SMTP inbox.
 */
export const resetState = async () => {
  await fetch(`http://localhost:${exposedPort}/admin-api/state/reset`, {
    method: 'POST',
    headers: { "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}` }
  });
  await fetch(`${EMAIL_UI}/api/emails`, { method: 'DELETE' });
};

/**
 * Login on a **private local** tenant: any page redirects an anonymous user
 * straight to the local login form (`/auth/Local/login`), so we fill it directly —
 * there is no guest landing page with a "Se connecter" menu entry (unlike the
 * ldap/oidc suites where the tenant is public).
 */
export const loginLocalAs = async (user: IUser, page: Page) => {
  await page.goto(ACCUEIL);
  const username = page.locator('input[name="username"]');
  await username.waitFor({ state: 'visible' });
  await username.fill(user.email);
  await page.locator('input[name="password"]').fill(user.password ?? 'password');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByRole('link', { name: 'API papier' }).waitFor({ state: 'visible' });
};

export const findAndGoToTeam = async (team: string, page: Page) => {
  await page.getByRole('button', { name: 'Taper / pour rechercher' }).click();
  await page.getByRole('textbox', { name: 'Rechercher une API, équipe,' }).fill(team);
  await page.locator('#portal-root').getByRole('link', { name: team }).click();
};
