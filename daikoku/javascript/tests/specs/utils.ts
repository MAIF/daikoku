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

export const dwightPaperSubscriptionId = 'vk6QRoGrc8JyRiZfgcifwjzNES9l9ygQ'
export const dwightPaperApiKeyId = "6kI1ngU9hEaF4m6aUYTgS5JWIP2mhtGq"
export const dwightPaperApiKeySecret = "7X5BWD7ruYDLG9ho8stB1y8gdM9rWaZw6rLSaYnypP778apwDw09Yp8FBKy0z6Ke"

export const otoroshiDevPaperRouteId = "route_route_dcb7d20c1-ea44-480c-9dd5-5a4d32760b3a"
export const otoroshiProdPaperRouteId = "route_route_4e29a989-cef9-41d8-a64c-385374b1d44b"
export const otoroshiDevCommandRouteId = "route_route_3fdac0cf-ae98-4802-9729-1b4b06de32bc"
export const otoroshiProdCommandRouteId = "route_route_cf6f8d3e-8c11-4b6f-b080-64fbd1b8a3ec"

export const exposedPort = process.env.EXPOSED_PORT || 5173;
export const EMAIL_UI = "http://localhost:1080";
export const ACCUEIL = `http://localhost:${exposedPort}/apis`
export const HOME = `http://localhost:${exposedPort}/`

// ---------- pg state ------------------------------
export const tenant = 'default';

export const apiPapier = "qVJzX6DLRkHIEWHqPHgrM4gqMVyGXeDj"
export const apiCommande = "G12uGyXcKMr7cWsTidiIOmzUvrxvlkrJ"

export const tenantAdminTeam = "0k7D3RIkcDwsZJQ36ml6A6qjC1PdeiY4U0pBRQDX3uyBsdkYJYdDaBc0E1YnKQFC"
export const apiDivision = "pP61PigzFffXTu4TX3BmvAB6iUIHY9oj"
export const vendeurs = "c9NB4pklW4QxJ3mLcxQAwqu4RvquHYv4"
export const logistique = "jGVkVifJgKFdOq4PeoMU2XKWzEjejUfI"
export const teamJim = "4Z9ss4YZDFCxBuLwMX4RkXi3W1JOw7kj"
export const teamMichael = "bUM1LJH3LE4c5tanG78QnQKkMoc7fxq2"
export const teamDwight = "3Msxj2b5tIdyCDEd9yvkaWfqfZqcEiXm"

export const papierProdPlan = "D5gZYeWoq18w5GRdKFLwrbtARZ7c9I2o";
export const papierDevPlan = "lNnh8Hkr2hX6MCf4BHrq2W4UPtW7DqaZ";
export const commandeDevPlan = "AQuzATL1d2MBujVRsjzpQWaGuoD0uiDK";
export const commandeProdPlan = "96JAG4xax2z3fpr1l9kDlldiZRZ6uxoL";

export const demandCommandeProdForLogistique = 'X3DtdDY0Z20BdptJjtzGuxCRhrEnNWdr'

export const subPapierDevDwight = 'vk6QRoGrc8JyRiZfgcifwjzNES9l9ygQ';
export const subCommandeDevLogistique = '22T3RsirZpz5afBi4MsC8U71gtc12MxK';
export const subCommandeProdLogistique = 'iXaRzJPRKsP0XTYUCRmYeltG3sifYdfF';
export const subCommandeDevVendeurs = 'mRVlHMttmN0JMytFGkd4uVm4UWzI3Qwq';
export const subPapierdevVedeurs = '4EGnOUDSp7eaC8J2d26TfO95rwUxfz9H';
// -------------------------------------------

export const loginAs = async (user: IUser, page: Page, basicUsage: boolean = true) => {
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Se connecter' }).click();
  const input = page.locator('input[name="username"]');
  await input.waitFor({ state: 'visible' });
  await input.fill(user.email);
  // await page.locator('input[name="username"]').fill(user.email);
  await page.locator('input[name="password"]').fill('password');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  if (basicUsage) {
    await page.getByRole('link', { name: 'API papier' }).waitFor({ state: 'visible' });
  }
}

export const loginLocalAs = async (user: IUser, page: Page) => {
  await page.getByRole('img', { name: 'user menu' }).click();
  const input = page.locator('input[name="username"]');
  await input.fill(user.email);
  // await page.locator('input[name="username"]').fill(user.email);
  await page.locator('input[name="password"]').fill(user.password ?? 'password');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByRole('link', { name: 'API papier' }).waitFor({ state: 'visible' });
}

export const logout = async (page: Page) => {
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();
  await page.getByRole('link', { name: 'API papier' }).waitFor({ state: 'visible' });
}

export const findAndGoToTeam = async (team: string, page: Page) => {
  await page.getByRole('button', { name: 'Taper / pour rechercher' }).click();
  await page.getByRole('textbox', { name: 'Rechercher une API, équipe,' }).fill(team);
  await page.locator('#portal-root').getByRole('link', { name: team }).click();
}