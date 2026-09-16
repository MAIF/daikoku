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
  triggerStripeReconciliation,
  triggerTeamBillingSync,
  vendeurs,
} from './utils';
import {
  advanceTestClock,
  configureTenantStripe,
  createClockedCustomer,
  createTestClock,
  deleteTestClock,
  deliverWebhook,
  findStripeCustomerId,
  findStripeSubscriptionId,
  openInvoiceOf,
  payInvoice,
  setupStripePaymentOnPlan,
  stripeConfigured,
  stripeInvoice,
  stripeMeterTotal,
  stripeSubscription,
  subscribeViaStripeCheckout,
  testClockNow,
  updatePlanAsProducer,
  useCard,
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

    // 1b. A test clock, and the consumer team's customer attached to it. A clock
    //     can only be attached at customer creation, and Daikoku looks a customer
    //     up by metadata['daikoku_id'] before creating one, so the checkout below
    //     reuses this one and the whole billing cycle becomes controllable.
    log('creating the stripe test clock and the clocked customer');
    const clockId = await createTestClock(new Date());
    await createClockedCustomer(clockId, vendeurs, 'jim@daikoku.io');

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
    await subscribeViaStripeCheckout(page, {
      apiName: api.name,
      teamName: 'Vendeurs',
      settingsId,
    });

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

    // 10. The producer raises the price. New Stripe prices are built on the same
    //     product and the same meter, so usage keeps being reported to the counter
    //     that has been accumulating.
    log('logging back in as the producer and raising the price');
    await page.getByRole('img', { name: 'user menu' }).click();
    await page.getByRole('link', { name: 'Déconnexion' }).click();
    await loginAs(MICHAEL, page);

    const before: any = await adminApi(`/usage-plans/${planId}`).then((r) => r.json());
    const raise = await updatePlanAsProducer(page, apiDivision, api, planId, {
      ...before,
      costPerMonth: 9,
      costPerRequest: 0.05,
    });
    expect(raise.ok(), `raising the price failed: ${await raise.text()}`).toBeTruthy();

    const after: any = await adminApi(`/usage-plans/${planId}`).then((r) => r.json());
    expect(after.paymentSettings.productId).toBe(before.paymentSettings.productId);
    expect(after.paymentSettings.priceIds.meterId).toBe(meterId);
    expect(after.paymentSettings.priceIds.basePriceId).not.toBe(
      before.paymentSettings.priceIds.basePriceId
    );
    log(`plan now priced by ${after.paymentSettings.priceIds.basePriceId}`);

    // 11. The subscriber has not moved: their items still carry the old prices.
    const subId = await findStripeSubscriptionId(cus);
    const priceIdsOnStripe = async () =>
      (await stripeSubscription(subId)).items.data.map((i: any) => i.price.id).sort();
    expect(await priceIdsOnStripe()).toContain(before.paymentSettings.priceIds.basePriceId);

    // 12. Advance the clock past the end of the period: Stripe really closes it,
    //     aggregates the meter, issues the invoice and finalises it.
    const periodEnd: number = (await stripeSubscription(subId)).items.data[0]
      .current_period_end;
    log(`advancing the test clock past the period end (${periodEnd})`);
    await advanceTestClock(clockId, new Date((periodEnd + 2 * 3600) * 1000));

    const invoice = await stripeInvoice((await stripeSubscription(subId)).latest_invoice);
    log(`invoice ${invoice.id} is ${invoice.status}, total ${invoice.total}`);
    expect(invoice.status).not.toBe('draft');
    expect(invoice.total).toBeGreaterThan(0);

    // 13. The finalised invoice is what allows the swap. Delivering the real event
    //     must move the items in place: a second item on the same meter would have
    //     Stripe bill the same usage twice.
    log('delivering a signed invoice.finalized to the local webhook');
    const delivery = await deliverWebhook(settingsId, 'invoice.finalized', invoice);
    expect(delivery.ok, `webhook refused: ${await delivery.text()}`).toBeTruthy();

    await expect
      .poll(priceIdsOnStripe, { timeout: 60_000, intervals: [3_000] })
      .toEqual(
        [
          after.paymentSettings.priceIds.basePriceId,
          after.paymentSettings.priceIds.additionalPriceId,
        ].sort()
      );

    // 14. Unpaid: the card stops paying, so the next invoice is left open.
    log('switching the customer to a card that never pays');
    await useCard(cus, 'tok_chargeCustomerFail');

    const nextPeriodEnd: number = (await stripeSubscription(subId)).items.data[0]
      .current_period_end;
    log('advancing past the next period, whose invoice will fail');
    await advanceTestClock(clockId, new Date((nextPeriodEnd + 2 * 3600) * 1000));

    const unpaid = await openInvoiceOf(subId);
    expect(unpaid, 'no open invoice after the failed charge').toBeTruthy();
    log(`invoice ${unpaid.id} left open, ${unpaid.amount_due} due`);

    // 15. Thirty days later the key stops passing. The pass is measured against the
    //     clock, which is the time Stripe dated that invoice with.
    log('advancing thirty more days, then running the reconciliation pass');
    await advanceTestClock(clockId, new Date((unpaid.created + 31 * 86_400) * 1000));
    await triggerStripeReconciliation(page, await testClockNow(clockId));

    await expect
      .poll(async () => (await paperApiCall(page, clientId, clientSecret)).status(), {
        timeout: 120_000,
        intervals: [5_000],
      })
      .not.toBe(200);
    log('the api key no longer passes');

    // 16. Paying brings back the very same credentials.
    log('paying the invoice, then delivering invoice.paid');
    await useCard(cus, 'tok_visa');
    const paid = await payInvoice(unpaid.id);
    expect(paid.status, `paying the invoice failed: ${JSON.stringify(paid)}`).toBe('paid');

    const paidDelivery = await deliverWebhook(settingsId, 'invoice.paid', paid);
    expect(paidDelivery.ok, `webhook refused: ${await paidDelivery.text()}`).toBeTruthy();

    await expect
      .poll(async () => (await paperApiCall(page, clientId, clientSecret)).status(), {
        timeout: 120_000,
        intervals: [5_000],
      })
      .toBe(200);
    log('the api key passes again, with the same credentials');

    await deleteTestClock(clockId);
  });
});
