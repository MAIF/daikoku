import { test, expect } from '@playwright/test';

const newApi = {
  "_id": "Sn3qHxAzKHTgWstL5FatDAu8",
  "_humanReadableId": "test-api-2",
  "_tenant": "default",
  "team": "5ffd5d30260100461a3cc730",
  "_deleted": false,
  "lastUpdate": 1610440269091,
  "name": "test API 2",
  "smallDescription": "A new test API for test",
  "header": null,
  "image": null,
  "description": "# Title\n\n## subtitle\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Phasellus gravida convallis leo et aliquet. Aenean venenatis, elit et dignissim scelerisque, urna dui mollis nunc, id eleifend velit sem et ante. Quisque pharetra sed tellus id finibus. In quis porta libero. Nunc egestas eros elementum lacinia blandit. Donec nisi lacus, tristique vel blandit in, sodales eget lacus. Phasellus ultrices magna vel odio vestibulum, a rhoncus nunc ornare. Sed laoreet finibus arcu vitae aliquam. Aliquam quis ex dui.",
  "currentVersion": "1.0.0",
  "supportedVersions": [
    "1.0.0"
  ],
  "testing": {
    "enabled": true,
    "auth": "Basic",
    "name": "test auth",
    "username": "client-id",
    "password": "client-secret",
    "config": null
  },
  "documentation": {
    "_id": "5ffd5e4d260100461a3cc7b7",
    "_tenant": "default",
    "pages": [],
    "lastModificationAt": 1610440269091
  },
  "swagger": {
    "url": "/assets/swaggers/petstore.json",
    "content": null,
    "headers": {},
    "additionalConf": null
  },
  "tags": [
    "test"
  ],
  "categories": [
    "internal"
  ],
  "visibility": "Public",
  "possibleUsagePlans": [
    "CXssdGGN875vZzpHLgkpaQ8v"
  ],
  "defaultUsagePlan": "CXssdGGN875vZzpHLgkpaQ8v",
  "authorizedTeams": [],
  "posts": [],
  "issues": [],
  "issuesTags": [],
  "stars": 0,
  "parent": null,
  "isDefault": true,
  "apis": null,
  "state": "published"
}

const newApiUsagePlan = {
  "_id": "CXssdGGN875vZzpHLgkpaQ8v",
  "_tenant": "default",
  "_deleted": false,
  "maxPerSecond": 10,
  "maxPerDay": 500,
  "maxPerMonth": 10000,
  "currency": {
    "code": "EUR"
  },
  "billingDuration": {
    "value": 1,
    "unit": "Month"
  },
  "customName": "test plan",
  "customDescription": "Free plan with limited number of calls per day and per month",
  "otoroshiTarget": {
    "otoroshiSettings": "default",
    "authorizedEntities": {
      "groups": [],
      "services": [],
      "routes": ["r_12346"]
    },
    "apikeyCustomization": {
      "clientIdOnly": false,
      "constrainedServicesOnly": false,
      "readOnly": false,
      "metadata": {},
      "customMetadata": [],
      "tags": [],
      "restrictions": {
        "enabled": false,
        "allowLast": true,
        "allowed": [],
        "forbidden": [],
        "notFound": []
      }
    }
  },
  "allowMultipleKeys": false,
  "visibility": "Public",
  "authorizedTeams": [],
  "autoRotation": false,
  "subscriptionProcess": [],
  "integrationProcess": "ApiKey",
  "aggregationApiKeysSecurity": true,
  "testing": {
    "enabled": false,
    "auth": "Basic",
    "name": null,
    "username": null,
    "password": null,
    "config": null
  },
  "documentation": null,
  "swagger": {
    "url": null,
    "content": null,
    "headers": {},
    "additionalConf": null
  },
  "type": "FreeWithQuotas"
}

const exposedPort = process.env.EXPOSED_PORT || 5173

const adminApikeyId = 'admin_key_client_id';
const adminApikeySecret = 'admin_key_client_secret';

test.beforeEach(async ({ page }) => {
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
    }));
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
  await page.goto(`http://localhost:${exposedPort}/apis`);
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByPlaceholder('Email address').fill('tester@foo.bar');
  await page.getByPlaceholder('Password').fill('password');
  await page.getByPlaceholder('Password').press('Enter');
  //create new API
  await page.locator('div:nth-child(4) > .notification-link').first().click();
  await page.locator('span').filter({ hasText: 'API' }).first().click();
  await page.locator('#portal-root div').filter({ hasText: /^Testers$/ }).click();
  await page.getByRole('button', { name: 'Published' }).click();
  await page.getByPlaceholder('New Api').fill('test API');
  await expect(page.getByText('API with this name already')).toBeVisible();
  await page.getByPlaceholder('New Api').fill('test API 2');
  await page.getByLabel('Small desc.').fill('real test API');
  // await page.getByRole('button', { name: 'Next' }).click();
  // await page.locator('label').filter({ hasText: 'Description' }).waitFor({ state: 'visible' })
  // await page.getByRole('textbox').fill('a real test API');
  // await page.getByRole('button', { name: 'Next' }).click();
  // await page.getByRole('button', { name: 'Next' }).click();
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
  await expect(page.locator('.card-header').filter({ hasText: 'private & automatic' })).toBeVisible()
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
  await page.waitForResponse(r => r.url().includes('/_subscribe') && r.status() === 200)
  await expect(page.getByText('The API key request for Free')).toBeVisible();
  await expect(page.getByText('private & automatic')).toBeVisible();
  await page.locator('#usage-plans__list div').filter({ hasText: 'private & automaticFree plan' }).getByRole('button').click();
  await expect(page.locator('div.team-selection').filter({ hasText: /^Testers$/ })).toBeVisible();
  await expect(page.locator('div.team-selection').filter({ hasText: /^Consumers$/ })).toBeHidden();
  await page.locator('div.team-selection').filter({ hasText: /^Testers$/ }).click();
  await expect(page.getByText('API key to plan Free with')).toBeVisible();
  await page.getByRole('link', { name: 'Access to the notifications' }).click();
  await expect(page.getByText('Request subscription to test API 2 for plan')).toBeVisible();
  await page.getByRole('link', { name: 'Accept' }).nth(1).click();
  await expect(page.getByRole('textbox').nth(1)).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.waitForResponse(r => r.url().includes('/accept') && r.status() === 200)
  // await page.goto('http://localhost:9000/notifications#');
  await page.goto('http://localhost:1080/');

  await page.locator('div').filter({ hasText: /^validation@foo\.bar$/ }).waitFor({ state: 'visible' })
  // await expect(page.locator('div').filter({ hasText: /^validation@foo\.bar$/ })).toBeVisible();
  await page.getByText('Validate a subscription', { exact: true }).click();
  await page.getByRole('link', { name: 'Accept' }).click();
  await page.getByRole('link', { name: 'Access to the notifications' }).click();
  await page.getByRole('link', { name: 'APIs list' }).click();
  await page.getByText('Consumers').click();
  await page.getByText('API keys').click();
  await page.getByRole('row', { name: 'test API 2 1.0.0' }).getByLabel('View APIkeys').click();
  //FIXME
  // await expect(page.locator('#tooltip-TwFQ')).toBeVisible();
  //FIXME: due to small viewport``

  await expect(page.locator('.api-subscription__infos__name').filter({ hasText: 'public & automatic' })).toBeVisible()
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
  await page.goto(`http://localhost:${exposedPort}/apis`);
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByPlaceholder('Email address').fill('tester@foo.bar');
  await page.getByPlaceholder('Password').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();

  //subscribe first API
  await page.getByRole('heading', { name: 'test API', exact: true }).click();
  await page.getByText('Plans').click();
  await page.locator('.usage-plan__card').filter({ hasText: 'not test plan' }).getByRole('button').click();
  await page.locator('div').filter({ hasText: /^Consumers$/ }).click();
  // await page.getByRole('button', { name: 'Subscribe with a new api key' }).click();
  await page.getByRole('link', { name: 'APIs list' }).click();

  //subscribe second api with aggregation
  await page.getByRole('heading', { name: 'test API 2' }).click();
  await page.getByText('Plans').click();
  await page.getByRole('button', { name: 'Get API key' }).click();
  await page.locator('.team-selection').filter({ hasText: 'Consumer' }).click();
  await page.getByRole('button', { name: ' Subscribe using an existing' }).click();
  await page.getByText('test API/not test plan').click();

  //go to subscriptions
  await page.getByRole('link', { name: 'APIs list' }).click();
  await page.locator('.top__container').filter({ hasText: 'Your teams' })
    .getByText('Consumers').click()
  // await page.getByLabel('Notifications alt+T').getByRole('button').click();
  await page.getByText('API keys', { exact: true }).click();
  await page.getByRole('row', { name: 'test API 2 1.0.0' }).getByLabel('View APIkeys').click();

  //get the client id value to check
  const apikey = await page.locator('.api-subscription__infos__value').innerText()

  await page.getByText('API keys', { exact: true }).click();
  await page.getByRole('row', { name: 'test API 2.0.0' }).getByLabel('view APikey').click();
  await expect(page.locator('.api-subscription__infos__value').first()).toHaveText(apikey);
  await page.locator('.api-subscription').locator('.dropdown').click();
  await page.getByText('Show aggregate').click();
  await expect(page.getByRole('link', { name: 'test API 2/test plan' })).toBeVisible();
  await page.locator('.right-panel-background.opened').click();
  await page.getByText('API keys', { exact: true }).click();
  await page.getByRole('row', { name: 'test API 2 1.0.0' }).getByLabel('view APikey').click();
  await page.locator('.api-subscription').locator('.dropdown').click();
  await page.getByText('Extract from aggregate').click();
  // await page.getByRole('button', { name: 'make unique' }).click();
  await expect(page.getByRole('paragraph')).toContainText('Are you sure to make this API key unique and separate from his parent plan?');
  await page.getByRole('button', { name: 'Ok', exact: true }).click();
  await expect(page.locator('.api-subscription__infos__value').first()).not.toHaveText(apikey);

  // //test archive apikey & clean archive apikeys
  await page.locator('.api-subscription').locator('.dropdown').click();
  await page.getByText('Disable subscription').click();
  await expect(page.locator('.api-subscription__value__type')).toHaveText('Disabled')
  // await expect(page.getByRole('button', { name: 'Enable subscription' })).toBeVisible();

  await page.locator('.api-subscription').locator('.dropdown').click();
  await page.getByText('Delete').click();
  await expect(page.locator('h5')).toContainText('Confirm the deletion');
  await page.getByLabel('To confirm the deletion,').fill('test API 2/test plan');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await page.getByText('API keys', { exact: true }).click();
  await expect(page.getByRole('row', { name: 'test API 2 1.0.0' })).toBeHidden



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
  await page.goto(`http://localhost:${exposedPort}/apis`);
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByPlaceholder('Email address').fill('tester@foo.bar');
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
  await expect(page.getByRole('heading', { name: 'My pending requests' })).toBeVisible();

  //search an API
  await page.locator('.notification-link').first().click();
  await page.getByPlaceholder('Search for API, team and more').fill('test API');
  await page.waitForResponse(r => r.url().includes('/api/_search') && r.status() === 200)
  // await expect(page.getByRole('link').count()).toBe(2)
  await expect(page.getByRole('link', { name: 'test API - 1.0.0' })).toBeVisible();
  await page.getByRole('link', { name: 'test API - 2.0.0' }).click();
  await expect(page.getByRole('heading', { name: 'test API 2.0.0' })).toBeVisible();
});

test('API admin can transfer his own API ownership', async ({ page }) => {
  await page.goto(`http://localhost:${exposedPort}/apis`);
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByPlaceholder('Email address').fill('tester@foo.bar');
  await page.getByPlaceholder('Password').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.getByRole('heading', { name: 'test API' }).click();
  await page.getByRole('link', { name: 'Configure API' }).click();
  await page.getByText('Settings').click();
  await page.locator('.react-form-select__input-container').click();
  await page.getByText('Consumers', { exact: true }).click();
  await page.getByLabel('Please type test API to').fill('test API');
  await page.getByRole('button', { name: 'Transfer' }).click();
  await expect(page.getByRole('status')).toContainText('Team has been notified. please wait until acceptation');
  await page.getByRole('link', { name: 'Access to the notifications' }).click();
  await expect(page.locator('#app')).toContainText('Consumersrequest to transfer the ownership of test APITestera few seconds');
  await page.getByRole('link', { name: 'Accept' }).nth(1).click();
  await page.getByRole('link', { name: 'APIs list' }).click();
  await page.locator('h3').filter({ hasText: 'test API' }).waitFor({ state: 'visible' })
  const consumerSelector = page.locator('small').filter({ hasText: 'Consumers' })
  // console.log(consumerSelector)
  await consumerSelector.click();
  await expect(page.locator('h3')).toContainText('test API');
});

test('Filter API List', async ({ page, request }) => {
  await request.post('http://localhost:9000/admin-api/usage-plans', {
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    },
    data: newApiUsagePlan
  })
    .then(r => r.json())
    .then(r => console.log({ r }));


  await request.post('http://localhost:9000/admin-api/apis', {
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    },
    data: { ...newApi, team: "5ffd5f7e260100461a3cc845", tags: ["dev"], categories: ["external"] }
  })
    .then(r => r.json())
    .then(r => console.log({ r }));

  await page.goto(`http://localhost:${exposedPort}/apis`);
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByPlaceholder('Email address').fill('tester@foo.bar');
  await page.getByPlaceholder('Password').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForResponse(r => r.url().includes('/api/me/context') && r.status() === 200)
  // await page.waitForResponse(r => r.url().includes('/api/search') && r.status() === 200)
  await page.waitForSelector('.apis__pagination')
  await page.locator('small').filter({ hasText: 'Consumers' }).click();
  await expect(page.locator('.preview')).toContainText('1 result produced by Consumers');

  await expect(page.getByRole('heading', { name: 'test API' })).toBeVisible(); //FIXME: verifier qu'il n'y a qu'une seul API dans la liste

  await page.getByText('result produced by Consumers').click();
  await expect(page.locator('.preview')).toContainText('1 result produced by Consumers');
  await page.getByText('clear filter').click();
  await page.waitForSelector('.apis__pagination')

  await page.locator('.team__selector > .reactSelect__control > .reactSelect__value-container > .reactSelect__input-container').click();
  await page.getByRole('option', { name: 'Testers' }).click();
  await expect(page.locator('.preview')).toContainText('2 results produced by Testers');
  await page.getByText('clear filter').click();
  await page.locator('.tag__selector > .reactSelect__control > .reactSelect__value-container > .reactSelect__input-container').click();
  await page.getByRole('option', { name: 'test' }).click();
  await expect(page.locator('.preview')).toContainText('2 results tagged test');
  await page.getByText('clear filter').click();
  await page.locator('.category__selector > .reactSelect__control > .reactSelect__value-container > .reactSelect__input-container').click();
  await page.getByRole('option', { name: 'external' }).click();
  await expect(page.locator('.preview')).toContainText('1 result categorized in external');
  await page.getByText('clear filter').click();
  await page.getByPlaceholder('Search your API').fill('test');
  await expect(page.locator('.preview')).toContainText('2 results matching test');
  await page.locator('.reactSelect__indicator').first().click();
  await page.getByRole('option', { name: 'Testers' }).click();
  await page.locator('.reactSelect__control').nth(1).locator('svg').click()
  // await page.locator('div').filter({ hasText: /^option Testers, selected\.By tagBy category$/ }).locator('svg').nth(2).click();
  await page.getByRole('option', { name: 'test' }).click();
  await page.locator('.reactSelect__control').nth(2).locator('svg').click()
  // await page.locator('div').filter({ hasText: /^Testersoption test, selected\.testBy category$/ }).locator('svg').nth(4).click();
  await page.getByRole('option', { name: 'internal' }).click();
  await expect(page.locator('.preview')).toContainText('1 result matching test categorized in internal tagged test produced by Testers');
  await page.locator('.category__selector > .reactSelect__control > .reactSelect__value-container > .reactSelect__input-container').click();
  await page.getByRole('option', { name: 'external' }).click();
  await expect(page.locator('.preview')).toContainText('0 result matching test categorized in external tagged test produced by Testers');
  await page.getByText('clear filter').click();
  await page.getByText('test', { exact: true }).nth(2).click();
  await expect(page.locator('.preview')).toContainText('2 results tagged test');
  await page.getByText('clear filter').click();
  await page.locator('span').filter({ hasText: 'external' }).click();
  await expect(page.locator('.preview')).toContainText('1 result categorized in external');
  await page.getByText('clear filter').click();
  await page.getByText('test', { exact: true }).first().click();
  await expect(page.locator('.preview')).toContainText('2 results tagged test');
  await page.getByText('clear filter').click();
  await page.locator('small').filter({ hasText: 'external' }).click();
  await expect(page.locator('.preview')).toContainText('1 result categorized in external');
})


test('transfer an api subscription', async ({ page }) => {
  await page.goto('http://localhost:5173/apis');
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByPlaceholder('Email address').fill('tester@foo.bar');
  await page.getByPlaceholder('Password').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForResponse(r => r.url().includes('/api/me/context') && r.status() === 200)
  await page.waitForSelector('.apis__pagination')
  await page.getByRole('heading', { name: 'test API' }).click();

  //tester l'url pour verifier que c'est bien la v2
  await page.getByText('Plans').click();

  await page.locator('div').filter({ hasText: /^fake prod plan/ }).getByRole('button').click();
  await page.getByText('Consumers').click();
  await page.getByLabel('Notifications').getByRole('img').nth(1).click();
  const apikey = await page.locator('.api-subscription__infos__value').innerText();



  await page.locator('#dropdownMenuButton').click();
  await page.getByText('Transfer subscription').click();
  await page.getByText('Display link').click();
  const link = await page.locator('.api-susbcription__display-link').innerText();



  await page.goto(link);
  await page.getByText('Testers').click();
  await page.getByRole('button', { name: 'Confirm transfer' }).click();

  await page.locator('.top__container').filter({hasText: 'Your teams'}).getByText('Testers').click();
  await page.getByText('API keys').click();
  await page.getByRole('row', { name: 'test API 2.0.0 View API View' }).getByLabel('View APIkeys').click();
  expect(page.locator('.api-subscription__infos__value')).toHaveText(apikey)
});