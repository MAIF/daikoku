import { Page } from "@playwright/test";
import { IUser } from "./users";

export const adminApikeyId = 'admin_key_client_id';
export const adminApikeySecret = 'admin_key_client_secret';

export const otoroshiAdminApikeyId = 'admin-api-apikey-id';
export const otoroshiAdminApikeySecret = 'admin-api-apikey-secret';

export const logistiqueCommandeProdApiKeyId = 'lBHBZFjUbWx5CEShf1NYe1gO0N0vtWVQ'
export const logistiqueCommandeProdApiKeySecret = 'YwbzNgYSup3eCdxBIRa9HqM22tGoHI02v8AfZM2glyNV9OsGVOI9mciE62y9s1Bj'

export const vendeursPapierExtendedDevApiKeyId = 'BdGLTEAxmFsTg7NnlumBPzyX75Vre3al'
export const vendeursPapierExtendedDevApiKeySecret = 'jmEX0x62DRmqAwL92YdF5VugN6iV3FOQuPq7idgwXTELpcQgaIBSU4sBxebapLQW'

export const dwhightPaperApiKeyId = "6kI1ngU9hEaF4m6aUYTgS5JWIP2mhtGq"
export const dwightPaperApiKeySecret = "7X5BWD7ruYDLG9ho8stB1y8gdM9rWaZw6rLSaYnypP778apwDw09Yp8FBKy0z6Ke"

export const otoroshiDevPaperRouteId = "route_route_dcb7d20c1-ea44-480c-9dd5-5a4d32760b3a"
export const otoroshiProdPaperRouteId = "route_route_4e29a989-cef9-41d8-a64c-385374b1d44b"
export const otoroshiDevCommandRouteId = "route_route_3fdac0cf-ae98-4802-9729-1b4b06de32bc"
export const otoroshiProdCommandRouteId = "route_route_cf6f8d3e-8c11-4b6f-b080-64fbd1b8a3ec"

export const exposedPort = process.env.EXPOSED_PORT || 5173;
export const EMAIL_UI = "http://localhost:1080";
export const ACCUEIL = `http://localhost:${exposedPort}/apis`
export const HOME = `http://localhost:${exposedPort}/`

export const loginAs = async (user: IUser, page: Page) => {
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Se connecter' }).click();
  await page.locator('input[name="username"]').fill(user.email);
  await page.locator('input[name="password"]').fill('password');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByLabel('API papier').waitFor({ state: 'visible' });
}

export const logout = async (page: Page) => {
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.locator('.block__entry__link').filter({ hasText: 'Déconnexion' }).click();
  await page.getByLabel('API papier').waitFor({ state: 'visible' });
}