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
    .getByRole('dialog', { name: "Choisissez le nom de la clé d'API" })
    .getByRole('button', { name: 'Envoyer' })
    .click();

  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  const sessionId = page.url().match(/cs_test_[A-Za-z0-9]+/)?.[0];
  expect(sessionId, `no checkout session id in ${page.url()}`).toBeTruthy();

  return sessionId!;
};

const payClassicCheckout = async (page: Page) => {
  const cardNumber = page.locator('#cardNumber');

  // The card row can be folded behind a cover button that animates in, so it
  // is opened by its event rather than by a pointer click
  if (!(await cardNumber.isVisible())) {
    await page.getByTestId('card-accordion-item-button').dispatchEvent('click');
  }

  await cardNumber.fill('4242 4242 4242 4242');
  await page.locator('#cardExpiry').fill('02 / 42');
  await page.locator('#cardCvc').fill('123');
  await page.locator('#billingName').fill('Jim Halpert');
  await page.locator('#billingAddressLine1').fill('1 rue de la Paix');
  await page.locator('#billingPostalCode').fill('75002');
  await page.locator('#billingLocality').fill('Paris');
  await page.getByTestId('hosted-payment-submit-button').click();
};

const embeddedCheckoutForm = (page: Page) => page.locator('iframe').first().contentFrame();

const payEmbeddedCheckout = async (page: Page) => {
  const checkoutForm = embeddedCheckoutForm(page);
  const addressLine = checkoutForm.locator('#billingAddress-addressLine1Input');

  await checkoutForm.getByRole('button', { name: 'Carte bancaire' }).click();
  await checkoutForm.locator('#payment-numberInput').fill('4242 4242 4242 4242');
  await checkoutForm.locator('#payment-expiryInput').fill('02 / 42');
  await checkoutForm.locator('#payment-cvcInput').fill('123');
  await checkoutForm.locator('#billingAddress-nameInput').fill('Jim Halpert');
  await addressLine.fill('1 rue de la Paix');
  // Closes the address suggestions, which cover the next fields
  await addressLine.press('Escape');
  await checkoutForm.locator('#billingAddress-postalCodeInput').fill('75002');

  const locality = checkoutForm.locator('#billingAddress-localityInput');
  await locality.fill('Paris');
  // A click on the pay button sends no confirmation in this layout, Enter does
  await locality.press('Enter');
};

/** Stripe serves its Checkout in two layouts: the card fields in the page, or
 * a Payment Element holding the whole form in an iframe. */
const payStripeCheckout = async (page: Page) => {
  const classicCardFields = page.locator('#cardNumber, [data-testid="card-accordion-item-button"]');
  const embeddedCardTab = embeddedCheckoutForm(page).getByRole('button', {
    name: 'Carte bancaire',
  });

  await expect
    .poll(async () => (await classicCardFields.count()) + (await embeddedCardTab.count()), {
      timeout: 30_000,
    })
    .toBeGreaterThan(0);

  if (await classicCardFields.count()) {
    await payClassicCheckout(page);
  } else {
    await payEmbeddedCheckout(page);
  }
};

export const subscribeViaStripeCheckout = async (
  page: Page,
  opts: { apiName: string; teamName: string; settingsId: string }
) => {
  const sessionId = await openStripeCheckout(page, opts);

  await payStripeCheckout(page);
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

export const deleteTestClock = (clockId: string) =>
  stripe(`/v1/test_helpers/test_clocks/${clockId}`, { method: 'DELETE' });

const searchStripeCustomersOf = async (daikokuId: string): Promise<Array<any>> => {
  const query = `/v1/customers/search?query=${encodeURIComponent(
    `metadata['daikoku_id']:'${daikokuId}'`
  )}`;
  const result = await stripe(query).then((r) => r.json());

  return result.data ?? [];
};

/** Daikoku bills the first customer its search returns, and the state reset
 * keeps team ids, so customers left by earlier runs would take the
 * subscription off the test clock. Deleting a clock deletes its customers. */
export const deleteStripeCustomersOf = async (daikokuId: string) => {
  const customers = await searchStripeCustomersOf(daikokuId);

  await Promise.all(
    customers.map((customer) => {
      if (customer.test_clock) {
        return stripe(`/v1/test_helpers/test_clocks/${customer.test_clock}`, { method: 'DELETE' });
      }

      return stripe(`/v1/customers/${customer.id}`, { method: 'DELETE' });
    })
  );
};

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

  await expect
    .poll(async () => (await searchStripeCustomersOf(daikokuId)).map((found) => found.id), {
      timeout: 120_000,
      intervals: [3_000],
    })
    .toEqual([customer.id]);

  return customer.id;
};

const priceOfInvoiceLine = (line: any): string | undefined =>
  line.pricing?.price_details?.price ?? line.price?.id;

/** A graduated price (the included requests) is billed on one line per tier,
 * so the lines of the price are added up. */
export const invoicedForPrice = (invoice: any, priceId: string) => {
  const linesOfPrice = invoice.lines.data.filter(
    (line: any) => priceOfInvoiceLine(line) === priceId
  );

  return {
    quantity: linesOfPrice.reduce((total: number, line: any) => total + (line.quantity ?? 0), 0),
    amount: linesOfPrice.reduce((total: number, line: any) => total + line.amount, 0),
  };
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
