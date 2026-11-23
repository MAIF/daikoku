import test, { expect, Page } from '@playwright/test';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { nanoid } from 'nanoid';

import otoroshi_data from '../config/otoroshi/otoroshi-state-es.json';
import { generateApi, generatePlan, saveApi, savePlan } from './apis';
import { JIM, MICHAEL } from './users';
import {
  ACCUEIL,
  adminApi,
  apiDivision,
  loginAs,
  logout,
  openApiKeyCard,
  otoroshiAdminApikeyId,
  otoroshiAdminApikeySecret,
  paperApiCall,
  readSubscriptionApiKey,
  tenant,
  triggerTeamBillingSync,
  vendeurs,
} from './utils';
import {
  advanceTestClock,
  configureTenantStripe,
  createClockedCustomer,
  createTestClock,
  deleteStripeCustomersOf,
  deleteTestClock,
  deliverWebhook,
  findStripeCustomerId,
  findStripeSubscriptionId,
  invoicedForPrice,
  openStripeCheckout,
  setupStripePaymentOnPlan,
  stripe,
  stripeConfigured,
  stripeInvoice,
  stripeMeterTotal,
  stripeSubscription,
  subscribeViaStripeCheckout,
  updatePlanAsProducer,
} from './stripe';

/** A paid plan of API Division, subscribed by Vendeurs through the real
 * Checkout, on a Stripe customer attached to a fresh test clock: the billing
 * cycle can then be moved forward at will. */
const subscribeOnTestClock = async (page: Page, apiName: string) => {
  const settingsId = 'stripe-e2e';
  await configureTenantStripe(tenant, settingsId);

  await deleteStripeCustomersOf(vendeurs);
  const clockId = await createTestClock(new Date());
  const customerId = await createClockedCustomer(clockId, vendeurs, 'jim@daikoku.io');

  const planId = nanoid(32);
  const pricing = {
    costPerMonth: 5,
    costPerRequest: 0.01,
    includedRequestsPerMonth: 2,
  };
  // The tenant displays environments: a plan has to be named after one of them
  const plan = generatePlan({
    _id: planId,
    customName: 'prod',
    ...pricing,
    maxPerMonth: 10000,
  });
  const api = generateApi({
    name: apiName,
    team: apiDivision,
    possibleUsagePlans: [planId],
  });
  expect((await savePlan(plan)).ok).toBeTruthy();
  expect((await saveApi(api as any)).ok).toBeTruthy();

  await page.goto(ACCUEIL);
  await page
    .getByRole('img', { name: 'user menu' })
    .waitFor({ state: 'visible', timeout: 60_000 });
  await loginAs(MICHAEL, page);
  const meterId = await setupStripePaymentOnPlan(page, apiDivision, api, planId, plan, settingsId);
  const { priceIds } = (await adminApi(`/usage-plans/${planId}`).then((r) => r.json()))
    .paymentSettings;

  await logout(page);
  await loginAs(JIM, page);
  await subscribeViaStripeCheckout(page, {
    apiName: api.name,
    teamName: 'Vendeurs',
    settingsId,
  });

  const subscriptionId = await findStripeSubscriptionId(customerId);

  return {
    settingsId,
    clockId,
    customerId,
    subscriptionId,
    plan,
    pricing,
    api,
    meterId,
    priceIds,
  };
};

// Two hours past the end: Stripe keeps the renewal invoice as a draft for about an hour
const advancePastPeriodEnd = async (clockId: string, subscriptionId: string) => {
  const periodEnd: number = (await stripeSubscription(subscriptionId)).items.data[0]
    .current_period_end;

  await advanceTestClock(clockId, new Date((periodEnd + 2 * 3600) * 1000));
};

const openProducerSubscriptionRow = async (page: Page, apiName: string, teamName: string) => {
  await page.goto(ACCUEIL);
  await page.getByRole('link', { name: apiName }).click();
  await expect(page.locator('.api__header')).toBeAttached();
  await page.getByText('Souscriptions', { exact: true }).click();

  return page.locator('.table-row', { hasText: teamName });
};

const openPaymentRow = async (page: Page, apiName: string) => {
  await page.goto('/vendeurs/settings/payments');

  return page.locator('.table-row', { hasText: apiName });
};

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
    //     reuses this one and the whole billing cycle becomes controllable. The
    //     customers of earlier runs go first, or Daikoku could pick one of them.
    log('creating the stripe test clock and the clocked customer');
    await deleteStripeCustomersOf(vendeurs);
    const clockId = await createTestClock(new Date());
    await createClockedCustomer(clockId, vendeurs, 'jim@daikoku.io');

    // 2. Seed a pay-per-use plan + an API owned by the producer team (apiDivision).
    const planId = nanoid(32);
    // The tenant displays environments: a plan has to be named after one of them
    const plan = generatePlan({
      _id: planId,
      customName: 'prod',
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

    // 4b. The paid subscription shows on Consommation > Paiements, active on Stripe.
    log('reading the payment state of the subscription');
    await page.goto(`/vendeurs/settings/payments`);
    const paymentRow = page.locator('.table-row', { hasText: api.name });
    await expect(paymentRow).toContainText('Active', { timeout: 30_000 });
    await expect(paymentRow).toContainText('Prochain prélèvement');

    // 5. Read the subscription's Otoroshi key (prod_paper_route -> paper.oto.tools).
    log('reading the Otoroshi apikey of the subscription from the UI');
    const { clientId, clientSecret } = await readSubscriptionApiKey(
      page,
      'Vendeurs',
      api.name,
      plan.customName
    );

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

    // 9b. The consumer sees the estimated amount of its month on Consommation > Utilisation.
    await page.goto(`/vendeurs/settings/consumption`);
    const estimatedToDate = page.locator('.billing-kpi', { hasText: 'Estimé à date' });
    await expect(estimatedToDate.locator('.billing-kpi__value')).not.toHaveText(/^0,00/);

    // 10. The producer raises the price. New Stripe prices are built on the same
    //     product and the same meter, so usage keeps being reported to the counter
    //     that has been accumulating.
    log('logging back in as the producer and raising the price');
    // Logging out from a team page raises an "Unauthorized" toast over the user menu
    await logout(page);
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

    // 11. The flat fee of the subscriber moved at once, so next month is charged at
    //     the new amount; its usage of the running month stays on the old price.
    const subId = await findStripeSubscriptionId(cus);
    const priceIdsOnStripe = async () =>
      (await stripeSubscription(subId)).items.data.map((i: any) => i.price.id).sort();
    expect(await priceIdsOnStripe()).toEqual(
      [
        after.paymentSettings.priceIds.basePriceId,
        before.paymentSettings.priceIds.additionalPriceId,
      ].sort()
    );

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

    await deleteTestClock(clockId);
  });

  test('bills the usage of a closed month and shows the next period to the subscriber', async ({
    page,
    context,
  }) => {
    test.setTimeout(600_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const { clockId, customerId, subscriptionId, plan, pricing, api, meterId, priceIds } =
      await subscribeOnTestClock(page, 'Stripe monthly API');

    const { clientId, clientSecret } = await readSubscriptionApiKey(
      page,
      'Vendeurs',
      api.name,
      plan.customName
    );
    await expect
      .poll(async () => (await paperApiCall(page, clientId, clientSecret)).status(), {
        timeout: 30_000,
      })
      .toBe(200);

    const callsMade = 5;

    for (let call = 0; call < callsMade; call++) {
      const response = await paperApiCall(page, clientId, clientSecret);
      expect(response.ok(), `paper api call failed: ${await response.text()}`).toBeTruthy();
    }

    const syncAndReadMeter = async () => {
      await triggerTeamBillingSync(page, vendeurs);

      return stripeMeterTotal(meterId, customerId);
    };

    // The call that found the key live in Otoroshi went through too
    await expect
      .poll(syncAndReadMeter, { timeout: 180_000, intervals: [10_000] })
      .toBeGreaterThanOrEqual(callsMade + 1);
    await page.waitForTimeout(20_000);
    const reported = await syncAndReadMeter();

    await advancePastPeriodEnd(clockId, subscriptionId);

    const invoice = await stripeInvoice((await stripeSubscription(subscriptionId)).latest_invoice);
    expect(invoice.billing_reason).toBe('subscription_cycle');
    expect(invoice.status).toBe('paid');

    const toCents = (euros: number) => Math.round(euros * 100);
    const usage = invoicedForPrice(invoice, priceIds.additionalPriceId);
    expect(usage.quantity).toBe(reported);
    expect(usage.amount).toBe(
      toCents((reported - pricing.includedRequestsPerMonth) * pricing.costPerRequest)
    );
    expect(invoicedForPrice(invoice, priceIds.basePriceId).amount).toBe(
      toCents(pricing.costPerMonth)
    );

    const nextPeriodEnd: number = (await stripeSubscription(subscriptionId)).items.data[0]
      .current_period_end;
    const paymentRow = await openPaymentRow(page, api.name);
    await expect(paymentRow).toContainText('Active', { timeout: 30_000 });
    await expect(paymentRow).toContainText(
      format(new Date(nextPeriodEnd * 1000), 'dd MMM yyyy', { locale: fr })
    );

    // No clock cleanup: the next run deletes it with the customers of Vendeurs, and the
    // billed state stays in place meanwhile, to be looked at in the UI
  });

  test('ends a cancelled subscription at the end of its paid period', async ({ page }) => {
    test.setTimeout(600_000);

    const { settingsId, clockId, subscriptionId, plan, api } = await subscribeOnTestClock(
      page,
      'Stripe cancelled API'
    );

    const scheduleCancellation = async () => {
      const apiKeyCard = await openApiKeyCard(page, 'Vendeurs', api.name, plan.customName);

      // The subscriptions of a key are listed once its card is unfolded
      await apiKeyCard.getByRole('button', { name: "Contenu de la clé d'API" }).click();
      await apiKeyCard.getByRole('button', { name: 'Actions de la souscription' }).click();
      await apiKeyCard.getByRole('button', { name: "Résilier l'abonnement" }).click();
      await page.getByRole('button', { name: 'Résilier', exact: true }).click();
      await expect(
        page.getByText("L'abonnement prendra fin à l'issue de la période payée")
      ).toBeVisible();
    };

    const cancelsAtPeriodEnd = async () =>
      (await stripeSubscription(subscriptionId)).cancel_at_period_end;

    await scheduleCancellation();
    await expect.poll(cancelsAtPeriodEnd, { timeout: 30_000 }).toBe(true);

    const scheduledRow = await openPaymentRow(page, api.name);
    await expect(scheduledRow).toContainText('Résiliation programmée', { timeout: 30_000 });

    await scheduledRow.getByRole('button', { name: 'Conserver la souscription' }).click();
    await expect(scheduledRow).toContainText('Active', { timeout: 30_000 });
    await expect.poll(cancelsAtPeriodEnd, { timeout: 30_000 }).toBe(false);

    await scheduleCancellation();
    await expect.poll(cancelsAtPeriodEnd, { timeout: 30_000 }).toBe(true);

    await advancePastPeriodEnd(clockId, subscriptionId);
    const endedSubscription = await stripeSubscription(subscriptionId);
    expect(endedSubscription.status).toBe('canceled');

    // No `stripe listen` in the test stack: the end reaches Daikoku through its webhook
    const delivery = await deliverWebhook(
      settingsId,
      'customer.subscription.deleted',
      endedSubscription
    );
    expect(delivery.ok, `webhook refused: ${await delivery.text()}`).toBeTruthy();

    const endedRow = await openPaymentRow(page, api.name);
    await expect(endedRow).toContainText('Terminée', { timeout: 30_000 });
  });

  test('voids the invoice of a period blocked by the producer, then resumes billing', async ({
    page,
  }) => {
    test.setTimeout(600_000);

    const { clockId, subscriptionId, api } = await subscribeOnTestClock(page, 'Stripe blocked API');

    const collectionPause = async () =>
      (await stripeSubscription(subscriptionId)).pause_collection?.behavior ?? null;

    await logout(page);
    await loginAs(MICHAEL, page);
    const blockedRow = await openProducerSubscriptionRow(page, api.name, 'Vendeurs');
    await blockedRow.getByRole('button', { name: 'Actions de la souscription' }).click();
    await blockedRow.getByRole('button', { name: 'Désactiver la souscription' }).click();
    await page.getByLabel("Motif (facultatif), transmis à l'équipe abonnée").fill('Facture impayée');
    await page.getByRole('button', { name: 'Bloquer', exact: true }).click();
    await expect(blockedRow).toContainText('Bloquée');
    await expect.poll(collectionPause, { timeout: 30_000 }).toBe('void');

    await logout(page);
    await loginAs(JIM, page);
    const suspendedRow = await openPaymentRow(page, api.name);
    await expect(suspendedRow).toContainText('Suspendue', { timeout: 30_000 });

    await advancePastPeriodEnd(clockId, subscriptionId);
    const invoice = await stripeInvoice((await stripeSubscription(subscriptionId)).latest_invoice);
    expect(invoice.billing_reason).toBe('subscription_cycle');
    expect(invoice.status).toBe('void');

    await logout(page);
    await loginAs(MICHAEL, page);
    const unblockedRow = await openProducerSubscriptionRow(page, api.name, 'Vendeurs');
    await unblockedRow.getByRole('button', { name: 'Actions de la souscription' }).click();
    await unblockedRow.getByRole('button', { name: 'Activer la souscription' }).click();
    await expect(unblockedRow).toContainText('Activée');
    await expect.poll(collectionPause, { timeout: 30_000 }).toBeNull();
  });

  test('lets the subscriber resume an abandoned payment', async ({ page }) => {
    test.setTimeout(180_000);

    const settingsId = 'stripe-e2e';
    await configureTenantStripe(tenant, settingsId);

    const planId = nanoid(32);
    // The tenant displays environments: a plan has to be named after one of them
    const plan = generatePlan({
      _id: planId,
      customName: 'prod',
      costPerRequest: 0.01,
      costPerMonth: 5,
    });
    const api = generateApi({
      name: 'Stripe abandoned API',
      team: apiDivision,
      possibleUsagePlans: [planId],
    });
    expect((await savePlan(plan)).ok).toBeTruthy();
    expect((await saveApi(api as any)).ok).toBeTruthy();

    await page.goto(ACCUEIL);
    await page
      .getByRole('img', { name: 'user menu' })
      .waitFor({ state: 'visible', timeout: 60_000 });
    await loginAs(MICHAEL, page);
    await setupStripePaymentOnPlan(page, apiDivision, api, planId, plan, settingsId);

    await page.getByRole('img', { name: 'user menu' }).click();
    await page.getByRole('link', { name: 'Déconnexion' }).click();
    await loginAs(JIM, page);

    const firstSessionId = await openStripeCheckout(page, {
      apiName: api.name,
      teamName: 'Vendeurs',
    });
    const firstSession = await stripe(`/v1/checkout/sessions/${firstSessionId}`).then((r) =>
      r.json()
    );
    await page.goto(firstSession.cancel_url);

    await expect(page.getByRole('heading', { name: 'Paiement annulé' })).toBeVisible();
    await page.getByRole('button', { name: 'Reprendre le paiement' }).click();

    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
    const resumedSessionId = page.url().match(/cs_test_[A-Za-z0-9]+/)?.[0];
    expect(resumedSessionId).toBeTruthy();
    expect(resumedSessionId).not.toBe(firstSessionId);

    // The pending demands of the team offer the same way back to the payment
    await page.goto('/vendeurs/settings/dashboard');
    const pendingRow = page.getByRole('listitem', { name: `${api.name} - ${plan.customName}` });
    await expect(pendingRow).toContainText('Paiement en attente');
    await pendingRow.getByRole('button', { name: 'Reprendre le paiement' }).click();

    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
    const fromDashboardSessionId = page.url().match(/cs_test_[A-Za-z0-9]+/)?.[0];
    expect(fromDashboardSessionId).toBeTruthy();
    expect([firstSessionId, resumedSessionId]).not.toContain(fromDashboardSessionId);
  });
});
