import { test, expect } from '@playwright/test';
import newApi from './resources/test_api_2.json';
import newApiUsagePlan from './resources/test_api_2_usage_plan.json';

const adminApikeyId = 'admin_key_client_id';
const adminApikeySecret = 'admin_key_client_secret';

test.beforeEach(async ({page}) => {
  console.log(`Running ${test.info().title}`);
  await fetch('http://localhost:9000/admin-api/state/reset', {
    method: 'POST',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  })
  .then(r => r.json())
  .then(r => console.log({r}));
})

/**
  - create API
  - create plans
    - public & automatic
    - public & manual (admin validation)
      - wih a cistom form
    - private
  - update API
  - subscribe with another team (for each plans)
  - expect private plan just the admin team
  - go notif
    - expect notif for manual plan
  - accept/decline
  - see the notifs
  - go to see apikey
 */
test('Create & manage API', async ({ page }) => {
  await page.setViewportSize({
    width: 1920,
    height: 1080,
  });
  //connection with admin
  await page.goto('http://localhost:9000/apis');
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByPlaceholder('Email adress').fill('admin@foo.bar');
  await page.getByPlaceholder('Password').fill('password');
  await page.getByPlaceholder('Password').press('Enter');
  //create new API
  await page.locator('div:nth-child(3) > .notification-link').first().click();
  await page.locator('span').filter({ hasText: 'API' }).first().click();
  await page.locator('#portal-root div').filter({ hasText: /^Testers$/ }).click();
  await page.getByRole('button', { name: 'Published' }).click();
  await page.getByPlaceholder('New Api').fill('test API');
  await expect(page.getByText('API with this name already')).toBeVisible();
  await page.getByPlaceholder('New Api').fill('test API 2');
  await page.getByLabel('Small desc.').fill('real test API');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('label').filter({ hasText: 'Description' }).waitFor({ state: 'visible' })
  await page.getByRole('textbox').fill('a real test API');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('API test API 2 created')).toBeVisible();
  //create first plan (public & auto)
  await page.getByText('Plans').click();
  await expect(page.locator('.ml-sm-auto > div > div:nth-child(2)')).toBeVisible();
  await page.getByRole('button', { name: 'Add plan' }).click();
  await page.getByPlaceholder('Plan name').fill('public & automatic ');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('.react-form-select__input-container').click();
  await page.getByText('http://127.0.0.1:9000/fakeotoroshi', { exact: true }).click();
  await page.locator('#input-label > .reactSelect__control > .reactSelect__value-container > .reactSelect__input-container').click();
  await page.getByRole('option', { name: 'nice-route', exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByPlaceholder('Max. requests per second').fill('1000');
  await page.getByPlaceholder('Max. requests per day').fill('1000');
  await page.getByPlaceholder('Max. requests per month').fill('1000');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Plans').click();
  await expect(page.getByText('public & automatic')).toBeVisible();

  //create second plan (public & manual)
  await page.getByRole('button', { name: 'Add plan' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Add plan' }).click();
  await page.getByPlaceholder('Plan name').fill('public & manual');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('.react-form-select__input-container').click();
  await page.getByText('http://127.0.0.1:9000/fakeotoroshi', { exact: true }).click();
  await page.locator('#input-label > .reactSelect__control > .reactSelect__value-container > .reactSelect__input-container').click();
  await page.getByRole('option', { name: 'nice-route', exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByPlaceholder('Max. requests per second').fill('1000');
  await page.getByPlaceholder('Max. requests per day').fill('1000');
  await page.getByPlaceholder('Max. requests per month').fill('1000');
  await page.getByRole('button', { name: 'Save' }).click();
  //FIXME
  await page.getByRole('main').locator('i').click();
  await page.locator('#dropdownMenuButton').nth(1).click();
  await page.getByText('Edit plan').nth(1).click();
  await page.getByText('Process').click();
  await page.getByRole('button', { name: 'Add a first validation step' }).click();
  await page.getByRole('button', { name: 'Team admin' }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  await page.locator('.sortable-item__draggable-container').filter({ hasText: 'ADMIN' }).hover()

  await page.getByRole('listitem').getByRole('button').first().click();
  await page.getByText('"motivation"').click();
  await page.getByText('{ "motivation": { "type": "').dblclick();
  await page.locator('.cm-content > div:nth-child(6)').dblclick();
  // await page.getByText('"motivation"').click();
  // await page.getByText('{ "motivation": { "type": "').fill('{\n  "why ": {\n    "type": "string",\n    "format": "textarea",\n    "constraints": [\n      {\n        "type": "required"\n      }\n    ]\n  }\n}');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('application').getByRole('button').nth(1).click();
  await page.getByRole('button', { name: 'Email' }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('button', { name: 'Add' }).click();
  await page.locator('input[name="emails\\.0\\.value"]').click();
  await page.locator('input[name="emails\\.0\\.value"]').fill('validation@foo.bar');
  await page.getByLabel('message').fill('somebody wants an apikey...is it ok ?');
  await page.getByRole('button', { name: 'Create' }).click();

  //create last plan (private)
  await page.getByText('Plans').click();
  await page.getByRole('button', { name: 'Add plan' }).click();
  await page.locator('.react-form-select__input-container').click();
  await page.getByPlaceholder('Plan name').fill('private & automatic');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('.react-form-select__input-container').click();
  await page.getByText('http://127.0.0.1:9000/fakeotoroshi', { exact: true }).click();
  await page.locator('#input-label > .reactSelect__control > .reactSelect__value-container > .reactSelect__input-container').click();
  await page.getByRole('option', { name: 'nice-route', exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByPlaceholder('Max. requests per second').fill('1000');
  await page.getByPlaceholder('Max. requests per day').fill('1000');
  await page.getByPlaceholder('Max. requests per month').fill('1000');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('main').locator('i').click();
  await page.locator('#dropdownMenuButton').first().click();
  await page.getByText('Make it private').first().click();
  //FIXME -> wants to see locker
  await expect(page.getByRole('main').locator('i').first()).toBeVisible();

  //subscribe to plans
  await page.getByRole('link', { name: 'View this API' }).click();
  await page.getByText('Plans').click();
  await expect(page.getByText('public & automatic')).toBeVisible();
  await page.locator('#usage-plans__list div').filter({ hasText: 'public & automatic Free plan' }).getByRole('button').click();
  await expect(page.getByText('Consumers')).toBeVisible();
  await expect(page.locator('div').filter({ hasText: /^Testers$/ })).toBeVisible();
  await page.getByText('Consumers').click();
  await expect(page.getByText('API key to plan Free with')).toBeVisible();
  await expect(page.getByText('public & manual')).toBeVisible();
  await page.getByRole('button', { name: 'Request API key' }).click();
  await expect(page.locator('div.team-selection').filter({ hasText: /^Consumers$/ })).toBeVisible();
  await expect(page.locator('div.team-selection').filter({ hasText: /^Testers$/ })).toBeVisible();
  await page.locator('div.team-selection').filter({ hasText: /^Consumers$/ }).click();
  await expect(page.getByText('motivation')).toBeVisible();
  // await expect(page.getByText('why')).toBeVisible();
  // await page.getByLabel('why').fill('because');
  await page.getByLabel('motivation').fill('because');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('The API key request for Free')).toBeVisible();
  await expect(page.getByText('private & automatic')).toBeVisible();
  await page.locator('#usage-plans__list div').filter({ hasText: 'private & automaticFree plan' }).getByRole('button').click();
  await expect(page.locator('div.team-selection').filter({ hasText: /^Testers$/ })).toBeVisible();
  await expect(page.locator('div.team-selection').filter({ hasText: /^Consumers$/ })).toBeHidden();
  await page.locator('div.team-selection').filter({ hasText: /^Testers$/ }).click();
  await expect(page.getByText('API key to plan Free with')).toBeVisible();
  await page.getByRole('link', { name: 'Access to the notifications' }).click();
  await expect(page.getByText('Request subscription to test API 2 for plan')).toBeVisible();
  await page.getByRole('link', { name: '' }).nth(1).click();
  await expect(page.getByRole('textbox').nth(1)).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.waitForResponse(r => r.url().includes('/accept') && r.status() === 200)
  // await page.goto('http://localhost:9000/notifications#');
  //FIXME ???
  await page.goto('http://localhost:1080/');

  await page.locator('div').filter({ hasText: /^validation@foo\.bar$/ }).waitFor({ state: 'visible' })
  // await expect(page.locator('div').filter({ hasText: /^validation@foo\.bar$/ })).toBeVisible();
  await page.getByText('Validate a subscription', { exact: true }).click();
  await page.getByRole('link', { name: 'Accept' }).click();
  await page.getByRole('link', { name: 'Access to the notifications' }).click();
  await page.getByRole('link', { name: 'Daikoku home' }).click();
  await page.getByText('Consumers').click();
  await page.getByText('API keys').click();
  await page.getByRole('row', { name: 'test API 2 1.0.0  API keys' }).getByRole('link').click();
  //FIXME
  // await expect(page.locator('#tooltip-TwFQ')).toBeVisible();
  //FIXME: due to small viewport``

  await expect(page.locator('.card-header').filter({ hasText: 'public & automatic' })).toBeVisible()
})

/**
 * activate aggregation mode on tenant and API
 * subscribe on first api
 * subscribe on second API and aggregate it
 * delete a key
 */
test('aggregation mode', async ({ page, request }) => {
  await request.post('http://localhost:9000/admin-api/usage-plans', {
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    },
    data: newApiUsagePlan
  })


  await request.post('http://localhost:9000/admin-api/apis', {
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    },
    data: newApi
  })

  await request.patch('http://localhost:9000/admin-api/tenants/default', {
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
  })

  await request.patch('http://localhost:9000/admin-api/usage-plans/lhsc79x9s0p4drv8j3ebapwrbnqhu1oo', {
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
  })

  //login
  await page.goto('http://localhost:9000/apis');
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByPlaceholder('Email adress').fill('admin@foo.bar');
  await page.getByPlaceholder('Password').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();

  //subscribe first API
  await page.getByRole('heading', { name: 'test API', exact: true }).click();
  await page.getByText('Plans').click();
  await page.locator('.usage-plan__card').filter({ hasText: 'not test plan' }).getByRole('button').click();
  await page.locator('div').filter({ hasText: /^Consumers$/ }).click();
  await page.getByRole('button', { name: '+ Subscribe with a new api key' }).click();
  await page.getByRole('link', { name: 'Daikoku home' }).click();

  //subscribe second api with aggregation
  await page.getByRole('heading', { name: 'test API 2' }).click();
  await page.getByText('Plans').click();
  await page.getByRole('button', { name: 'Get API key' }).click();
  await page.locator('.team-selection').filter({ hasText: 'Consumer' }).click();
  await page.getByRole('button', { name: ' Subscribe using an existing' }).click();
  await page.getByText('test API/not test plan').click();

  //go to subscriptions
  await page.getByRole('link', { name: 'Daikoku home' }).click();
  await page.locator('.top__container').filter({ hasText: 'Your teams' })
    .getByText('Consumers').click()
  // await page.getByLabel('Notifications alt+T').getByRole('button').click();
  await page.getByText('API keys', { exact: true }).click();
  await page.getByRole('row', { name: 'test API 2 1.0.0  API keys' }).getByRole('link').click();

  //get the client id value to check
  const clientId = await page.getByLabel('Client Id').inputValue()

  await page.getByText('API keys', { exact: true }).click();
  await page.getByRole('row', { name: 'test API 2.0.0  API keys' }).getByRole('link').click();
  await expect(page.getByLabel('Client Id').first()).toHaveValue(clientId);
  await page.getByRole('button', { name: 'Show aggregate subscriptions' }).click();
  await expect(page.getByRole('link', { name: 'test API 2/test plan' })).toBeVisible();
  await page.getByText('API keys', { exact: true }).click();
  await page.getByRole('row', { name: 'test API 2 1.0.0  API keys' }).getByRole('link').click();
  await page.getByRole('button', { name: 'make unique' }).click();
  await expect(page.getByRole('paragraph')).toContainText('Are you sure to make this API key unique and separate from his parent plan?');
  await page.getByRole('button', { name: 'Ok' }).click();
  await expect(page.getByLabel('Client Id').first()).not.toHaveValue(clientId);

  //test archive apikey & clean archive apikeys
  await page.getByRole('button', { name: 'disable' }).click();
  await expect(page.getByRole('button', { name: 'enable' })).toBeVisible();
  await page.getByText('API keys', { exact: true }).click();
  await page.getByRole('button', { name: 'clean archived API keys' }).click();
  await expect(page.getByRole('paragraph')).toContainText('Are you sure you want to clean archived API keys?');
  await page.getByRole('button', { name: 'Ok' }).click();
  await expect(page.locator('tbody')).not.toContainText('test API 2')



})

/**
 * - delete an team -> api -> plan -> subscriptions
 *             |-> subscriptions
 * delete an APi -> plans -> subscription
 * delete a plan -> subscriptions
 */
test('Cascading deletion', async ({ page, request }) => {


})

/**
 * update profil
 */

/**
 *  follow research link
 */
test('do search', async ({ page, request }) => {
  //login
  await page.goto('http://localhost:9000/apis');
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByPlaceholder('Email adress').fill('admin@foo.bar');
  await page.getByPlaceholder('Password').fill('password');
  await page.getByPlaceholder('Password').press('Enter');
  await page.waitForResponse(r => r.url().includes('/api/me/context') && r.status() === 200)

  //search a team
  await page.locator('.notification-link').first().click();
  await page.getByPlaceholder('Search for API, team and more').fill('testers');
  await page.waitForResponse(r => r.url().includes('/api/_search') && r.status() === 200)
  await expect(page.locator('.navbar-panel.opened .block__entry__link')).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Testers' })).toBeVisible();
  await page.getByRole('link', { name: 'Testers' }).click();
  await expect(page.getByRole('heading', { name: 'In progress demands' })).toBeVisible();

  //search an API
  await page.locator('.notification-link').first().click();
  await page.getByPlaceholder('Search for API, team and more').fill('test API');
  await page.waitForResponse(r => r.url().includes('/api/_search') && r.status() === 200)
  // await expect(page.getByRole('link').count()).toBe(2)
  await expect(page.getByRole('link', { name: 'test API - 1.0.0' })).toBeVisible();
  await page.getByRole('link', { name: 'test API - 2.0.0' }).click();
  await expect(page.getByRole('heading', { name: 'test API 2.0.0' })).toBeVisible();
  await page.locator('.notification-link').first().click();

  //go to profile page
  await page.getByPlaceholder('Search for API, team and more').fill('');
  await page.waitForResponse(r => r.url().includes('/api/_search') && r.status() === 200)
  await page.getByRole('link', { name: 'My profile' }).click();
  await expect(page.getByLabel('Name')).toHaveValue("Admin"); // expect = admin
  await page.locator('.notification-link').first().click();

  //go to daikoku settings
  await page.getByRole('link', { name: 'Daikoku settings' }).click();
  await page.locator('div').filter({ hasText: /^Evil Corp\.$/ }).first().click();
});