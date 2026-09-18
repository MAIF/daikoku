import { expect, Page } from '@playwright/test';
import { createHmac } from 'node:crypto';

import { ACCUEIL, adminApi, exposedPort } from './utils';

const STRIPE_KEY = process.env.STRIPE_TEST_SECRET_KEY;
const STRIPE_PUBLIC_KEY = process.env.STRIPE_TEST_PUBLIC_KEY ?? 'pk_test';
const STRIPE_VERSION = process.env.STRIPE_API_VERSION ?? '2026-07-29.dahlia';

export const stripeConfigured = () => !!STRIPE_KEY;

export const stripe = (path: string, init: RequestInit = {}) =>
  fetch(`https://api.stripe.com${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${btoa(STRIPE_KEY + ':')}`,
      'Stripe-Version': STRIPE_VERSION,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(init.headers ?? {}),
    },
  });

/** Stripe cannot reach a local Daikoku, so the tests sign the deliveries
 * themselves with this secret. It is the same one the endpoint verifies. */
export const WEBHOOK_SECRET = 'whsec_daikoku_e2e';

export const configureTenantStripe = async (tenantId: string, settingsId: string) => {
  const tenantData: any = await adminApi(`/tenants/${tenantId}`).then((r) => r.json());
  tenantData.thirdPartyPaymentSettings = [
    {
      _id: settingsId,
      type: 'Stripe',
      name: settingsId,
      publicKey: STRIPE_PUBLIC_KEY,
      secretKey: STRIPE_KEY,
      webhookSecret: WEBHOOK_SECRET,
    },
  ];
  const res = await adminApi(`/tenants/${tenantId}`, {
    method: 'PUT',
    body: JSON.stringify(tenantData),
  });
  expect(res.ok, 'configure tenant stripe failed').toBeTruthy();
};

export const setupStripePaymentOnPlan = async (
  page: Page,
  teamId: string,
  api: any,
  planId: string,
  plan: any,
  settingsId: string
): Promise<string> => {
  const setup = await page.request.put(
    `http://localhost:${exposedPort}/api/teams/${teamId}/apis/${api._id}/${api.currentVersion}/plan/${planId}/_payment`,
    {
      data: {
        ...plan,
        paymentSettings: { type: 'Stripe', thirdPartyPaymentSettingsId: settingsId },
      },
    }
  );
  expect(setup.ok(), `setupPayment failed: ${await setup.text()}`).toBeTruthy();
  const planAfter: any = await adminApi(`/usage-plans/${planId}`).then((r) => r.json());
  const meterId: string = planAfter.paymentSettings.priceIds.meterId;
  expect(meterId).toBeTruthy();
  return meterId;
};

/** Goes through the real producer route, so the amounts are rebuilt into new
 * Stripe prices exactly as they would be in production. */
export const updatePlanAsProducer = async (
  page: Page,
  teamId: string,
  api: any,
  planId: string,
  plan: any
) =>
  page.request.put(
    `http://localhost:${exposedPort}/api/teams/${teamId}/apis/${api._id}/${api.currentVersion}/plan/${planId}`,
    { data: plan }
  );

/** Stripe cannot reach a local Daikoku, so once the card is accepted the test
 * delivers checkout.session.completed itself: that event, not the redirect,
 * is what materialises the subscription. */
export const openStripeCheckout = async (
  page: Page,
  opts: { apiName: string; teamName: string }
): Promise<string> => {
  await page.goto(ACCUEIL);
  await page.getByRole('link', { name: opts.apiName }).click();
  await page.getByText('Environnements').click();
  await page.getByRole('button', { name: "Demander une clé d'API" }).click();
  await page.getByText(opts.teamName).click();
  await page
    .getByRole('dialog', { name: 'Choisissez le nom du trousseau' })
    .getByRole('button', { name: 'Envoyer' })
    .click();

  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  const sessionId = page.url().match(/cs_test_[A-Za-z0-9]+/)?.[0];
  expect(sessionId, `no checkout session id in ${page.url()}`).toBeTruthy();

  return sessionId!;
};

export const subscribeViaStripeCheckout = async (
  page: Page,
  opts: { apiName: string; teamName: string; settingsId: string }
) => {
  const sessionId = await openStripeCheckout(page, opts);

  await page.getByRole('radio', { name: 'Carte' }).check({ force: true });
  await page.locator('#cardNumber').fill('4242 4242 4242 4242');
  await page.locator('#cardExpiry').fill('02 / 42');
  await page.locator('#cardCvc').fill('123');
  await page.locator('#billingName').fill('Jim Halpert');
  await page.locator('#billingAddressLine1').fill('1 rue de la Paix');
  await page.locator('#billingPostalCode').fill('75002');
  await page.locator('#billingLocality').fill('Paris');
  await page.getByTestId('hosted-payment-submit-button').click();
  await page.waitForURL(new RegExp(`localhost:${exposedPort}`), { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Paiement reçu' })).toBeVisible();

  const session = await stripe(`/v1/checkout/sessions/${sessionId}`).then((r) => r.json());
  expect(session.status, `checkout session not complete: ${JSON.stringify(session)}`).toBe(
    'complete'
  );
  const delivery = await deliverWebhook(opts.settingsId, 'checkout.session.completed', session);
  expect(delivery.ok, `webhook refused: ${await delivery.text()}`).toBeTruthy();

  await expect(page.getByRole('heading', { name: 'Souscription active' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('button', { name: "Voir ma clé d'API" })).toBeVisible();
};

const form = (data: Record<string, string>) =>
  new URLSearchParams(data).toString();

/** A test clock lets Stripe really close a billing period: it aggregates the
 * meter, issues the invoice and finalises it. Without it the cycle turn is
 * unobservable short of waiting a month. */
export const createTestClock = async (frozenAt: Date): Promise<string> => {
  const res = await stripe('/v1/test_helpers/test_clocks', {
    method: 'POST',
    body: form({ frozen_time: String(Math.floor(frozenAt.getTime() / 1000)) }),
  });
  const clock = await res.json();
  expect(res.ok, `create test clock failed: ${JSON.stringify(clock)}`).toBeTruthy();
  return clock.id;
};

export const advanceTestClock = async (clockId: string, to: Date): Promise<void> => {
  const res = await stripe(`/v1/test_helpers/test_clocks/${clockId}/advance`, {
    method: 'POST',
    body: form({ frozen_time: String(Math.floor(to.getTime() / 1000)) }),
  });
  expect(res.ok, `advance test clock failed: ${await res.text()}`).toBeTruthy();

  await expect
    .poll(
      async () =>
        (await stripe(`/v1/test_helpers/test_clocks/${clockId}`).then((r) => r.json()))
          .status,
      { timeout: 300_000, intervals: [5_000] }
    )
    .toBe('ready');
};

/** The clock's own time, which is what Stripe dated the invoices with. The
 * reconciliation pass is run against it rather than the machine clock. */
export const testClockNow = async (clockId: string): Promise<number> => {
  const clock = await stripe(`/v1/test_helpers/test_clocks/${clockId}`).then((r) =>
    r.json()
  );
  return clock.frozen_time * 1000;
};

/** `tok_visa` pays, `tok_chargeCustomerFail` attaches but never pays, which is
 * how an invoice is left open without touching the subscription itself. */
export const useCard = async (customerId: string, token: string): Promise<void> => {
  const method = await stripe('/v1/payment_methods', {
    method: 'POST',
    body: form({ type: 'card', 'card[token]': token }),
  }).then((r) => r.json());
  expect(method.id, `create payment method failed: ${JSON.stringify(method)}`).toBeTruthy();

  await stripe(`/v1/payment_methods/${method.id}/attach`, {
    method: 'POST',
    body: form({ customer: customerId }),
  });
  await stripe(`/v1/customers/${customerId}`, {
    method: 'POST',
    body: form({ 'invoice_settings[default_payment_method]': method.id }),
  });
};

export const openInvoiceOf = async (subscriptionId: string): Promise<any | undefined> => {
  const res = await stripe(
    `/v1/invoices?subscription=${subscriptionId}&status=open&limit=100`
  ).then((r) => r.json());
  return (res.data ?? []).sort((a: any, b: any) => a.created - b.created)[0];
};

export const payInvoice = (invoiceId: string) =>
  stripe(`/v1/invoices/${invoiceId}/pay`, { method: 'POST' }).then((r) => r.json());

export const deleteTestClock = (clockId: string) =>
  stripe(`/v1/test_helpers/test_clocks/${clockId}`, { method: 'DELETE' });

/** Created before the checkout, carrying the metadata Daikoku searches on, so
 * the subscription flow reuses this customer instead of creating a clock-less
 * one. A clock can only be attached at customer creation. */
export const createClockedCustomer = async (
  clockId: string,
  daikokuId: string,
  email: string
): Promise<string> => {
  const res = await stripe('/v1/customers', {
    method: 'POST',
    body: form({
      email,
      test_clock: clockId,
      'metadata[daikoku_id]': daikokuId,
    }),
  });
  const customer = await res.json();
  expect(res.ok, `create clocked customer failed: ${JSON.stringify(customer)}`).toBeTruthy();
  return customer.id;
};

export const stripeSubscription = (subscriptionId: string) =>
  stripe(`/v1/subscriptions/${subscriptionId}`).then((r) => r.json());

export const stripeInvoice = (invoiceId: string) =>
  stripe(`/v1/invoices/${invoiceId}`).then((r) => r.json());

export const findStripeSubscriptionId = async (customerId: string): Promise<string> => {
  const res = await stripe(`/v1/subscriptions?customer=${customerId}&limit=1`).then((r) =>
    r.json()
  );
  expect(res.data?.length, 'no stripe subscription for that customer').toBeGreaterThan(0);
  return res.data[0].id;
};

export const findStripeCustomerId = async (daikokuId: string): Promise<string> => {
  const query = `/v1/customers/search?query=${encodeURIComponent(
    `metadata['daikoku_id']:'${daikokuId}'`
  )}`;
  await expect
    .poll(async () => (await stripe(query).then((r) => r.json())).data?.length ?? 0, {
      timeout: 30_000,
      intervals: [2_000],
    })
    .toBeGreaterThan(0);
  return (await stripe(query).then((r) => r.json())).data[0].id;
};

/** Signs and posts an event the way Stripe would: HMAC-SHA256 over
 * "<timestamp>.<raw body>", carried in Stripe-Signature. */
export const deliverWebhook = async (
  settingsId: string,
  type: string,
  object: any
): Promise<Response> => {
  const body = JSON.stringify({
    id: `evt_${Date.now()}`,
    type,
    data: { object },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  return fetch(`http://localhost:${exposedPort}/api/payment/${settingsId}/_webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': `t=${timestamp},v1=${signature}`,
    },
    body,
  });
};

export const stripeMeterTotal = async (
  meterId: string,
  customerId: string
): Promise<number> => {
  const nowSec = Math.floor(Date.now() / 1000);
  const startTime = Math.floor((nowSec - 3600) / 60) * 60;
  const endTime = (Math.floor(nowSec / 60) + 5) * 60;
  const res = await stripe(
    `/v1/billing/meters/${meterId}/event_summaries?customer=${customerId}&start_time=${startTime}&end_time=${endTime}`
  ).then((r) => r.json());
  return (res.data ?? []).reduce(
    (acc: number, d: any) => acc + Number(d.aggregated_value ?? 0),
    0
  );
};
