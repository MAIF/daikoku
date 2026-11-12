import test, { expect } from '@playwright/test';
import otoroshi_data from '../config/otoroshi/otoroshi-state-es.json';
import { generateApi, generatePlan, saveApi, savePlan } from './apis';
import { JIM, MICHAEL } from './users';
import {
  ACCUEIL,
  adminApi,
  apiDivision,
  exposedPort,
  loginAs,
  logout,
  otoroshiAdminApikeyId,
  otoroshiAdminApikeySecret,
  paperApiCall,
  vendeurs,
} from './utils';

/**
 * Validates the consumption pipeline (no Stripe): Otoroshi writes gateway events to
 * ElasticSearch (data exporter), Daikoku reads them via /api/stats and records
 * consumption. Requires the local stack with the `elastic` service up.
 */

test.describe('Consumption sync via ElasticSearch', () => {
  test.beforeEach(async () => {
    await Promise.all([
      adminApi('/state/reset', { method: 'POST' }),
      fetch('http://localhost:1080/api/emails', { method: 'DELETE' }),
      fetch('http://otoroshi-api.oto.tools:8080/api/otoroshi.json', {
        method: 'POST',
        headers: {
          'Otoroshi-Client-Id': otoroshiAdminApikeyId,
          'Otoroshi-Client-Secret': otoroshiAdminApikeySecret,
          Host: 'otoroshi-api.oto.tools',
        },
        body: JSON.stringify(otoroshi_data),
      }),
    ]);
  });

  test('records API key consumption in Daikoku after Otoroshi calls', async ({ page, context }) => {
    test.setTimeout(120_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // 1. Seed a free plan + API owned by the producer team.
    const planId = nanoidLike();
    const plan = generatePlan({ _id: planId, customName: 'free' });
    const api = generateApi({
      name: 'Consumption API',
      team: apiDivision,
      possibleUsagePlans: [planId],
    });
    expect((await savePlan(plan)).ok).toBeTruthy();
    expect((await saveApi(api as any)).ok).toBeTruthy();

    // 2. Subscribe as a consumer (free, automatic process).
    await page.goto(ACCUEIL);
    await page
      .getByRole('img', { name: 'user menu' })
      .waitFor({ state: 'visible', timeout: 60_000 });
    await loginAs(JIM, page);
    await page.getByRole('link', { name: api.name }).click();
    await page.getByText('Environnements').click();
    await page.getByRole('button', { name: "Obtenir une clé d'API" }).click();
    await page.getByText('Vendeurs').click();
    // Copy the key in clientId:clientSecret format from the tooltip.
    await page.getByRole('button', { name: 'ClientId:ClientSecret' }).click();
    const [clientId, clientSecret] = (
      await page.evaluate(() => navigator.clipboard.readText())
    ).split(':', 2);
    await expect
      .poll(async () => (await paperApiCall(page, clientId, clientSecret)).status(), {
        timeout: 30_000,
      })
      .toBe(200);
    await paperApiCall(page, clientId, clientSecret);

    // 4. Retry the sync until Daikoku captures the hits. The sync reads Otoroshi/ES
    // live and writes to the local store; Otoroshi->ES ingestion is eventually
    // consistent, so the wait belongs here, not on the read. A targeted team sync is
    // used (no "already synced today" guard, unlike /api/jobs/stats/_sync).
    await expect
      .poll(
        async () => {
          const res = await page.request.post(
            `http://localhost:${exposedPort}/api/teams/${vendeurs}/billing/_sync`
          );
          if (!res.ok()) return 0;
          const arr = await res.json();
          return Array.isArray(arr) ? arr.reduce((a: number, c: any) => a + (c.hits || 0), 0) : 0;
        },
        { timeout: 60_000, intervals: [3_000] }
      )
      .toBeGreaterThan(0);

    // 5. The consumption is now recorded: read it back directly, once.
    const from = Date.now() - 3_600_000;
    const to = Date.now();
    const res = await page.request.get(
      `http://localhost:${exposedPort}/api/teams/${vendeurs}/consumptions?from=${from}&to=${to}`
    );
    const arr = await res.json();
    expect(arr.reduce((a: number, c: any) => a + (c.hits || 0), 0)).toBeGreaterThan(0);

    // 6. The consumer sees its calls on Consommation > Utilisation.
    await page.goto(`/vendeurs/settings/consumption`);
    const callsOfTheMonth = page.locator('.billing-kpi', { hasText: 'Appels du mois' });
    await expect(callsOfTheMonth.locator('.billing-kpi__value')).not.toHaveText('0');
    await expect(page.getByText('Aucune utilisation sur ce mois.')).not.toBeVisible();

    // 7. The producer sees the calls its api received, per api and per subscribed team.
    await logout(page);
    await loginAs(MICHAEL, page);
    await page.goto(`/api-division/settings/stats`);

    const hitsByApi = page.locator('.billing-charts', { hasText: 'Appels par API' });
    await expect(hitsByApi.getByText(api.name, { exact: true })).toBeVisible();

    const hitsByTeam = page.locator('.billing-charts', { hasText: 'Appels par équipe abonnée' });
    await expect(hitsByTeam.getByText('Vendeurs', { exact: true })).toBeVisible();

    const hitsByDay = page.locator('.billing-charts', { hasText: 'Appels par jour' });
    await expect(page.locator('.period-select')).toContainText('7 derniers jours');
    await expect(hitsByDay).toBeVisible();

    await page.locator('.period-select').click();
    await page.getByText("Aujourd'hui", { exact: true }).click();
    await expect(hitsByApi.getByText(api.name, { exact: true })).toBeVisible();
    await expect(hitsByDay).not.toBeVisible();
  });

  test('shows the estimated income of a priced plan to its owner as soon as a team subscribes', async ({ page }) => {
    const pricedPlan = generatePlan({
      costPerMonth: 10,
    });
    const pricedApi = generateApi({
      name: 'Priced API',
      team: apiDivision,
      possibleUsagePlans: [pricedPlan._id],
    });
    expect((await savePlan(pricedPlan)).ok).toBeTruthy();
    expect((await saveApi(pricedApi as any)).ok).toBeTruthy();

    await page.goto(ACCUEIL);
    await loginAs(JIM, page);
    await page.getByRole('link', { name: pricedApi.name }).click();
    await page.getByText('Environnements').click();
    await page.getByRole('button', { name: "Obtenir une clé d'API" }).click();
    await page.getByText('Vendeurs').click();

    const subscription = page.waitForResponse((response) => response.url().includes('/_subscribe'));
    await page.getByRole('button', { name: 'Envoyer' }).click();
    expect((await subscription).ok()).toBeTruthy();

    await logout(page);
    await loginAs(MICHAEL, page);
    await page.goto(`/api-division/settings/income`);

    const incomeRow = page.locator('.table-row', { hasText: pricedApi.name });
    await expect(incomeRow).toContainText('Vendeurs');
    await expect(incomeRow).toContainText('10,00 €');

    const totalRow = page.locator('.table-total');
    await expect(totalRow).toContainText('Total');
    await expect(totalRow).toContainText('10,00 €');
    await expect(page.getByText('Aucune de vos API ne propose encore de plan payant.')).not.toBeVisible();
  });
});

function nanoidLike(): string {
  // avoid an extra import; a 32-char id is enough for a test entity
  return Array.from({ length: 32 }, () =>
    'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]
  ).join('');
}
