import { expect, Page } from '@playwright/test';
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

export const configureTenantStripe = async (tenantId: string, settingsId: string) => {
  const tenantData: any = await adminApi(`/tenants/${tenantId}`).then((r) => r.json());
  tenantData.thirdPartyPaymentSettings = [
    {
      _id: settingsId,
      type: 'Stripe',
      name: settingsId,
      publicKey: STRIPE_PUBLIC_KEY,
      secretKey: STRIPE_KEY,
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

export const subscribeViaStripeCheckout = async (
  page: Page,
  opts: { apiName: string; teamName: string }
) => {
  await page.goto(ACCUEIL);
  await page.getByRole('link', { name: opts.apiName }).click();
  await page.getByText('Environnements').click();
  await page.getByRole('button', { name: "Demander une clé d'API" }).click();
  await page.getByText(opts.teamName).click();

  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
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
