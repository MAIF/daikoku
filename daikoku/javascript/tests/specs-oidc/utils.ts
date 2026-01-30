import { expect, Page } from "@playwright/test";
import { IUser } from "./users";

export const adminApikeyId = 'admin_key_client_id';
export const adminApikeySecret = 'admin_key_client_secret';

export const otoroshiAdminApikeyId = 'admin-api-apikey-id';
export const otoroshiAdminApikeySecret = 'admin-api-apikey-secret';

export const exposedPort = process.env.EXPOSED_PORT || 5173;
export const EMAIL_UI = "http://localhost:1080";
export const ACCUEIL = `http://localhost:${exposedPort}/apis`;
export const HOME = `http://localhost:${exposedPort}/`;

export const tenant = 'default';

/**
 * Login via OIDC flow.
 * Daikoku redirects to the OIDC server login page,
 * where we fill in credentials and submit.
 */
export const loginOidcAs = async (user: IUser, page: Page, waitForHome: boolean = true) => {
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Se connecter' }).click();

  // The OIDC server login page
  await page.getByRole('textbox', { name: 'Username' }).fill(user.email);
  await page.getByRole('textbox', { name: 'Password' }).fill(user.password ?? 'password');
  await page.getByRole('button', { name: 'Login' }).click();

  if (waitForHome) {
  await page.getByRole('heading', { name: 'Dunder Mifflin' }).isVisible()
  }
};

export const logout = async (page: Page) => {
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();
};
