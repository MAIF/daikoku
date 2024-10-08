import { test, expect } from '@playwright/test';

const adminApikeyId = 'admin_key_client_id';
const adminApikeySecret = 'admin_key_client_secret';

const exposedPort = process.env.EXPOSED_PORT || 5173

test.beforeEach(async () => {
  console.log(`Running ${test.info().title}`);
  await fetch('http://localhost:9000/admin-api/state/reset?path=./javascript/tests/resources/daikoku-test-env-mode-export.ndjson', {
    method: 'POST',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  })
    .then(r => r.json())
    .then(r => console.log({ r }))
    .then(() => fetch('http://localhost:1080/api/emails', {
      method: 'DELETE'
    }))
}) 

/**
 * activate aggregation security for env mode on tenant
 * subscribe on parent api
 * subscribe on child API and aggregate it for dev ==> can't extends
 * subscribe on child API and aggregate it for prod ==> can extends
 */
test('aggregation security works', async ({ page, request }) => {
  await request.patch('http://localhost:9000/admin-api/tenants/default', {
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    },
    data: [
      {
        "op": "replace",
        "path": "/environmentAggregationApiKeysSecurity",
        "value": true
      },
      {
        "op": "replace",
        "path": "/aggregationApiKeysSecurity",
        "value": true
      }
    ]
  })

  const plans = ["H3XqSP94Mfp6tahdOsPKL9vuBQRGv5JP", "8iRnqVwtDZt9hTJatQ3QgRXZNo2jgrOe", "ukpVuDA2d4TqoiGEGAM3IrX8NJ9SvpHF"]

  await Promise.all(plans.map(plan => request.patch(`http://localhost:9000/admin-api/usage-plans/${plan}`, {
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    },
    data: [
      {
        "op": "replace",
        "path": "/aggregationApiKeysSecurity",
        "value": true
      }
    ]
  })))

  //login
  await page.goto(`http://localhost:${exposedPort}/apis`);
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByPlaceholder('Email address').fill('tester@foo.bar');
  await page.getByPlaceholder('Password').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();

  await page.getByRole('heading', { name: 'Parent API' }).click();
  await page.getByText('Environments').click();
  await page.locator('.usage-plan__card').filter({ hasText: 'prod' }).getByRole('button').click();
  await page.getByText('Consumers').click();
  await page.getByLabel('APIs list').click();

  await page.getByRole('heading', { name: 'Child API' }).click();
  await page.getByText('Environments').click();
  await page.locator('.usage-plan__card').filter({ hasText: 'dev' }).getByRole('button').click();
  await page.locator('.team-selection').filter({ hasText: 'Consumers' }).click();
  // await expect(page.getByText('API key to plan Free without')).toBeVisible();


  await page.locator('.usage-plan__card').filter({ hasText: 'prod' }).getByRole('button').click();
  await page.locator('.team-selection').filter({ hasText: 'Consumers' }).click();
  await expect(page.getByRole('button', { name: '+ Subscribe with a new api key' })).toBeVisible();
  await expect(page.getByRole('button', { name: ' Subscribe using an existing' })).toBeVisible();
  await page.getByRole('button', { name: ' Subscribe using an existing' }).click();
  await expect(page.getByText('Parent API/prod')).toBeVisible();
  await page.getByText('Parent API/prod').click();
  // await expect(page.getByText('API key to plan Free without')).toBeVisible();

  await page.getByLabel('APIs list').click();
  await page.getByText('Consumers', { exact: true }).click();
  await page.getByText('API keys').click();
  await expect(page.getByRole('cell', { name: 'Child API' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Parent API' })).toBeVisible();
  await page.getByRole('row', { name: 'Parent API 1.0.0 View API' }).getByLabel('View APIkeys').click();
  // await expect(page.getByText('prod')).toBeVisible();
  await expect(page.locator('.api-subscription__infos__name')).toHaveText('prod')
  await page.getByText('API keys', { exact: true }).click();
  await page.getByRole('cell', { name: 'Child API' }).click();
  await page.getByRole('row', { name: 'Child API 1.0.0 View API View' }).getByLabel('View APIkeys').click();
  
  const apiKeys = await page.locator('.api-subscription__infos__name');
  expect(apiKeys).toHaveCount(2);
  expect(apiKeys.nth(0)).toHaveText('dev');
  expect(apiKeys.nth(1)).toHaveText('prod');
})