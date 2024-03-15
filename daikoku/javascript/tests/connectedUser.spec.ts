import { test, expect } from '@playwright/test';

const adminApikeyId = 'admin_key_client_id';
const adminApikeySecret = 'admin_key_client_secret';

test.beforeEach(async () => {
  console.log(`Running ${test.info().title}`);
  await fetch('http://localhost:9000/admin-api/state/reset', {
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
  
  await page.locator('div').filter({ hasText: /^validation@foo\.bar$/ }).waitFor({state: 'visible'})
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
  
  await expect(page.locator('.card-header').filter({hasText: 'public & automatic'})).toBeVisible()
})

/**
 * activate aggregation mode on tenant and API
 * subscribe on first api
 * subreibe on second API and aggregate it
 * delete a key
 */
test('aggregation mode', async ({ page, request }) => {
  

})

/**
 * - delete an team -> api -> plan -> subscriptions
 *             |-> subscriptions
 * delete an APi -> plans -> subscription
 * delete a plan -> subscriptions
 */
test('Cascading deletion', async ({ page, request }) => {
  

})