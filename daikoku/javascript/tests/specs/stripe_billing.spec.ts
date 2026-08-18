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

    const startedAt = Date.now();
    const log = (message: string) =>
      console.log(
        `[${String(Math.round((Date.now() - startedAt) / 1000)).padStart(3)}s] ${message}`
      );

    // 1. Configure the tenant with our Stripe test key.
    const settingsId = 'stripe-e2e';
    log('configuring the tenant with the Stripe test key');
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
    log('seeding the pay-per-use plan and the api');
    expect((await savePlan(plan)).ok).toBeTruthy();
    expect((await saveApi(api as any)).ok).toBeTruthy();

    // 3. As the producer admin, set up payment on the plan -> creates the Stripe
    //    product + meter + metered price. Proves #1149 creation against real Stripe.
    log('logging in as the producer admin (cold backend, can take a minute)');
    await page.goto(ACCUEIL);
    // Cold sbt backend on the first navigation: wait for the SPA to render before login.
    await page
      .getByRole('img', { name: 'user menu' })
      .waitFor({ state: 'visible', timeout: 60_000 });
    // basicUsage=true waits for the post-login page to render → session is ready
    // before page.request carries the cookie.
    await loginAs(MICHAEL, page);
    log('setting payment up on the plan -> creating product, meter and prices on Stripe');
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
    await page.getByRole('img', { name: 'user menu' }).click();
    await page.getByRole('link', { name: 'Déconnexion' }).click();
    await loginAs(JIM, page);

    log('subscribing as the consumer -> real Stripe Checkout, paying with the test card');
    await subscribeViaStripeCheckout(page, { apiName: api.name, teamName: 'Vendeurs' });

    // 5. Read the subscription's Otoroshi key (prod_paper_route -> paper.oto.tools).
    log('reading the Otoroshi apikey of the subscription from the UI');
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
    log('waiting for the apikey to be live in Otoroshi');
    await expect
      .poll(async () => (await paperApiCall(page, clientId, clientSecret)).status(), {
        timeout: 30_000,
      })
      .toBe(200);
    const cus = await findStripeCustomerId(vendeurs);
    log(`stripe customer ${cus}, meter ${meterId}`);
    const meterTotal = () => stripeMeterTotal(meterId, cus);

    // Otoroshi ships its events to ElasticSearch asynchronously, so a single sync
    // right after the calls can read a consumption that has not caught up yet and
    // report nothing. Re-trigger it on every poll instead of assuming a delay —
    // syncing again is a no-op once the delta has been reported (step 8 asserts it).
    const syncAndReadMeter = async () => {
      await triggerTeamBillingSync(page, vendeurs);
      const total = await meterTotal();
      log(`billing sync triggered, stripe meter total = ${total}`);
      return total;
    };

    // 7. Usage is reported: calls + sync, let it settle, snapshot the total.
    log('making 3 real api calls through Otoroshi, then syncing until Stripe counts them');
    await makeCalls(3);
    await expect
      .poll(syncAndReadMeter, { timeout: 180_000, intervals: [10_000] })
      .toBeGreaterThan(0);
    await page.waitForTimeout(20_000);
    const reported = await meterTotal();
    log(`snapshot of what Stripe counted: ${reported}`);

    // 8. Idempotency: a no-op re-sync must not move the total.
    log('re-syncing without new calls: the total must not move');
    await triggerTeamBillingSync(page, vendeurs);
    await page.waitForTimeout(20_000);
    expect(await meterTotal()).toBe(reported);

    // 9. Incremental: more calls + sync grows the meter past the snapshot.
    log('making 2 more calls, then syncing until Stripe counts the increment');
    await makeCalls(2);
    await expect
      .poll(syncAndReadMeter, { timeout: 180_000, intervals: [10_000] })
      .toBeGreaterThan(reported);
  });
});
