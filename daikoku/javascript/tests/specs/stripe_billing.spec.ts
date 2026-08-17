import test, { expect } from '@playwright/test';
import { nanoid } from 'nanoid';

import otoroshi_data from '../config/otoroshi/otoroshi-state-es.json';
import { generateApi, generatePlan, saveApi, savePlan } from './apis';
import { JIM, MICHAEL } from './users';
import {
  ACCUEIL,
  adminApi,
  apiDivision,
  findAndGoToTeam,
  loginAs,
  otoroshiAdminApikeyId,
  otoroshiAdminApikeySecret,
  paperApiCall,
  tenant,
  triggerTeamBillingSync,
  vendeurs,
} from './utils';
import {
  configureTenantStripe,
  findStripeCustomerId,
  setupStripePaymentOnPlan,
  stripeConfigured,
  stripeMeterTotal,
  subscribeViaStripeCheckout,
} from './stripe';

test.describe('Stripe metered billing (dev only, real Stripe test mode)', () => {
  test.skip(!stripeConfigured(), 'set STRIPE_TEST_SECRET_KEY to run this test');

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

  test('reports usage to the Stripe meter for the subscriber', async ({ page, context }) => {
    test.setTimeout(360_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // 1. Configure the tenant with our Stripe test key.
    const settingsId = 'stripe-e2e';
    await configureTenantStripe(tenant, settingsId);

    // 2. Seed a pay-per-use plan + an API owned by the producer team (apiDivision).
    const planId = nanoid(32);
    const plan = generatePlan({
      _id: planId,
      customName: 'metered',
      costPerRequest: 0.01,
      costPerMonth: 5,
      maxPerMonth: 10000,
    });
    const api = generateApi({
      name: 'Stripe metered API',
      team: apiDivision,
      possibleUsagePlans: [planId],
    });
    expect((await savePlan(plan)).ok).toBeTruthy();
    expect((await saveApi(api as any)).ok).toBeTruthy();

    // 3. As the producer admin, set up payment on the plan -> creates the Stripe
    //    product + meter + metered price. Proves #1149 creation against real Stripe.
    await page.goto(ACCUEIL);
    // Cold sbt backend on the first navigation: wait for the SPA to render before login.
    await page
      .getByRole('img', { name: 'user menu' })
      .waitFor({ state: 'visible', timeout: 60_000 });
    // basicUsage=true waits for the post-login page to render → session is ready
    // before page.request carries the cookie.
    await loginAs(MICHAEL, page);
    const meterId = await setupStripePaymentOnPlan(
      page,
      apiDivision,
      api,
      planId,
      plan,
      settingsId
    );

    // 4. As a consumer, subscribe to the paid plan -> Stripe Checkout -> pay with the
    //    test card -> back on Daikoku.
    // TODO(selectors): confirm the subscribe path and the Stripe Checkout fields
    //    against your running UI — hosted-checkout markup changes over time.
    await page.getByRole('img', { name: 'user menu' }).click();
    await page.getByRole('link', { name: 'Déconnexion' }).click();
    await loginAs(JIM, page);

    await subscribeViaStripeCheckout(page, { apiName: api.name, teamName: 'Vendeurs' });

    // 5. Read the subscription's Otoroshi key (prod_paper_route -> paper.oto.tools).
    await findAndGoToTeam('Vendeurs', page);
    await page.getByText("Clés d'API").click();
    await page.getByRole('row', { name: api.name }).getByLabel("Voir les clés d'API").click();
    await page
      .locator('.api-subscription', { hasText: 'metered' })
      .getByRole('button', { name: 'Copier le clientId et le clientSecret' })
      .click();
    const apikey = await page.evaluate(() => navigator.clipboard.readText());
    const [clientId, clientSecret] = apikey.split(':', 2);

    const makeCalls = async (n: number) => {
      for (let i = 0; i < n; i++) {
        const call = await paperApiCall(page, clientId, clientSecret);
        expect(call.ok(), `paper api call failed: ${await call.text()}`).toBeTruthy();
      }
    };

    // 6. Wait for the apikey to be active in Otoroshi, then resolve the Stripe customer.
    await expect
      .poll(async () => (await paperApiCall(page, clientId, clientSecret)).status(), {
        timeout: 30_000,
      })
      .toBe(200);
    const cus = await findStripeCustomerId(vendeurs);
    const meterTotal = () => stripeMeterTotal(meterId, cus);

    // 7. Usage is reported: calls + sync, let it settle, snapshot the total.
    await makeCalls(3);
    await triggerTeamBillingSync(page, vendeurs);
    await expect.poll(meterTotal, { timeout: 120_000, intervals: [5_000] }).toBeGreaterThan(0);
    await page.waitForTimeout(20_000);
    const reported = await meterTotal();

    // 8. Idempotency: a no-op re-sync must not move the total.
    await triggerTeamBillingSync(page, vendeurs);
    await page.waitForTimeout(20_000);
    expect(await meterTotal()).toBe(reported);

    // 9. Incremental: more calls + sync grows the meter past the snapshot.
    await makeCalls(2);
    await triggerTeamBillingSync(page, vendeurs);
    await expect.poll(meterTotal, { timeout: 120_000, intervals: [5_000] }).toBeGreaterThan(reported);
  });
});
