import { test, expect } from '@playwright/test';

const adminApikeyId = 'admin_key_client_id';
const adminApikeySecret = 'admin_key_client_secret';

const exposedPort = process.env.EXPOSED_PORT || 5173

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

test('[public tenant] - external user can join a team', async ({ page }) => {
  await page.goto(`http://localhost:${exposedPort}/apis`);
  await expect(page.getByRole('heading', { name: 'public with permissions API' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'admin-api-tenant-default' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'test API' })).toBeVisible();
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByPlaceholder('Email address').fill('admin@foo.bar');
  await page.getByPlaceholder('Password').fill('password');
  await page.getByPlaceholder('Password').press('Enter');
  await page.getByText('Consumers').click();
  await page.getByText('Members').click();
  await page.getByRole('button', { name: 'Invite a collaborator' }).click();
  await page.getByPlaceholder('Email').fill('bob@foo.bar');
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await page.getByText('Pending (1)').click();
  await expect(page.getByText('bob@foo.bar')).toBeVisible();
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Logout' }).click();
  await page.goto('http://localhost:1080/');
  await expect(page.getByText('bob@foo.bar').first()).toBeVisible();
  await page.getByText('Join Consumers', { exact: true }).click();
  await page.getByRole('link', { name: 'Click to join the team' }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.getByLabel('Name').fill('bob');
  await page.getByLabel('Email address').fill('bob@foo.bar');
  await page.getByLabel('Password', { exact: true }).fill('password');
  await expect(page.getByText('Your password must have 8')).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill('Pa$$w0rd');
  await page.getByLabel('Confirm password').fill('password');
  await expect(page.getByText('confirm and password must be')).toBeVisible();
  await page.getByLabel('Confirm password').fill('Pa$$w0rd');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('You will receive an email at bob@foo.bar to finish your account creation process. ')).toBeVisible();
  await page.goto('http://localhost:1080/');
  await page.locator('div.px-2').filter({ hasText: 'Validate your Evil Corp. account' }).waitFor({ state: 'visible' })
  await page.getByText('Validate your Evil Corp.').first().click();
  await page.getByRole('link', { name: 'Confirm' }).click();
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByPlaceholder('Email address').fill('bob@foo.bar');
  await page.getByPlaceholder('Password').fill('Pa$$w0rd');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('heading', { name: 'public with permissions API' })).toBeVisible();
  await page.getByRole('link', { name: 'Access to the notifications' }).click();
  await expect(page.getByText('Admin, as admin of Consumers')).toBeVisible();
  await page.getByRole('link', { name: 'Accept' }).click();
  await page.getByRole('link', { name: 'APIs list' }).click();
  await expect(page.getByText('Consumers')).toBeVisible();
})

test('[private tenant] - external user can join a team', async ({ page, request }) => {
  await request.patch('http://localhost:9000/admin-api/tenants/default', {
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    },
    data: [
      {
        "op": "replace",
        "path": "/isPrivate",
        "value": true
      }
    ]
  }) 

  await page.goto(`http://localhost:${exposedPort}/auth/Local/login`);
  await page.locator('input[name="username"]').fill('admin@foo.bar');
  await page.locator('input[name="password"]').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.getByText('Consumers').click();
  await page.getByText('Members').click();
  await page.getByRole('button', { name: 'Invite a collaborator' }).click();
  await page.getByPlaceholder('Email').fill('bob@foo.bar');
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await page.getByText('Pending (1)').click();
  await expect(page.getByText('bob@foo.bar')).toBeVisible();
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Logout' }).click();
  await page.goto('http://localhost:1080/');
  await expect(page.getByText('bob@foo.bar').first()).toBeVisible();
  await page.getByText('Join Consumers', { exact: true }).click();
  await page.getByRole('link', { name: 'Click to join the team' }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.getByLabel('Name').fill('bob');
  await page.getByLabel('Email address').fill('bob@foo.bar');
  await page.getByLabel('Password', { exact: true }).fill('password');
  await expect(page.getByText('Your password must have 8')).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill('Pa$$w0rd');
  await page.getByLabel('Confirm password').fill('password');
  await expect(page.getByText('confirm and password must be')).toBeVisible();
  await page.getByLabel('Confirm password').fill('Pa$$w0rd');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('You will receive an email at bob@foo.bar to finish your account creation process. ')).toBeVisible();
  await page.goto('http://localhost:1080/');
  await page.locator('div.px-2').filter({ hasText: 'Validate your Evil Corp. account' }).waitFor({ state: 'visible' })
  await page.getByText('Validate your Evil Corp.').first().click();
  await page.getByRole('link', { name: 'Confirm' }).click();
  await page.goto(`http://localhost:${exposedPort}/auth/Local/login`);
  await page.locator('input[name="username"]').fill('bob@foo.bar');
  await page.locator('input[name="password"]').fill('Pa$$w0rd');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('heading', { name: 'public with permissions API' })).toBeVisible();
  await page.getByRole('link', { name: 'Access to the notifications' }).click();
  await expect(page.getByText('Admin, as admin of Consumers')).toBeVisible();
  await page.getByRole('link', { name: 'Accept' }).click();
  await page.getByRole('link', { name: 'APIs list' }).click();
  await expect(page.getByText('Consumers')).toBeVisible();
})

test('[Private tenant] - anonymous user automatically redirected', async ({ page, request }) => {
  await request.patch('http://localhost:9000/admin-api/tenants/default', {
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    },
    data: [
      {
        "op": "replace",
        "path": "/isPrivate",
        "value": true
      }
    ]
  })

  await page.goto(`http://localhost:${exposedPort}/apis`);
  await page.waitForURL(`http://localhost:${exposedPort}/auth/Local/login`);
  await expect(page.getByRole('heading', { name: 'Login to Evil Corp.' })).toBeVisible();

})

test('[private tenant] - external user can signup', async ({page, request}) => {
  await request.patch('http://localhost:9000/admin-api/tenants/default', {
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    },
    data: [
      {
        "op": "replace",
        "path": "/isPrivate",
        "value": true
      }
    ]
  })

  await page.goto(`http://localhost:${exposedPort}/auth/Local/login`);
  await page.getByRole('link', { name: 'Create your account' }).click();
  await page.getByLabel('Name').fill('fifou');
  await page.getByLabel('Email address').fill('fifou@foo.bar');
  await page.getByLabel('Password', { exact: true }).fill('Pa$$w0rd');
  await page.getByLabel('Confirm password').fill('Pa$$w0rd');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('paragraph')).toContainText('You will receive an email at fifou@foo.bar');
  await page.goto('http://localhost:1080');
  await page.getByText('Validate your Evil Corp. account', { exact: true }).click();
  await page.getByRole('link', { name: 'Confirm' }).click();
  await page.locator('input[name="username"]').fill('fifou@foo.bar');
  await page.locator('input[name="password"]').fill('Pa$$w0rd');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('heading', { name: 'public with permissions API' })).toBeHidden();
})

//anonymous user - private tenant
// can signup
test('[public tenant] - external user can signup', async ({ page }) => {
  await page.goto(`http://localhost:${exposedPort}/`);
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByLabel('Name').fill('fifou');
  await page.locator(".signup-form").getByLabel('Email address').fill('fifou@foo.bar');
  await page.locator('form.signup-form input[name="password"]').fill('Pa$$w0rd');
  await page.getByLabel('Confirm password').fill('Pa$$w0rd');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('paragraph')).toContainText('You will receive an email at fifou@foo.bar');
  await page.goto('http://localhost:1080');
  await page.getByText('Validate your Evil Corp. account', { exact: true }).click();
  await page.getByRole('link', { name: 'Confirm' }).click();
  await page.locator('h1.jumbotron-heading').filter({ hasText: 'Evil Corp.' }).waitFor({ state: 'visible' })
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByPlaceholder('Email address').fill('fifou@foo.bar');
  await page.getByPlaceholder('Password').fill('Pa$$w0rd');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForResponse(response => response.url().includes('/auth/Local/callback') && response.status() === 303)
  await page.waitForSelector("section.organisation__header")
  await expect(page.getByRole('heading', { name: 'public with permissions API' })).toBeVisible();
})

test('[private tenant] - unlogged user can accept subscription demand', async ({ page, request}) => {
  await request.patch('http://localhost:9000/admin-api/tenants/default', {
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    },
    data: [
      {
        "op": "replace",
        "path": "/isPrivate",
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
        "op": "add",
        "path": "/subscriptionProcess/0",
        "value": {
          "id": "xmvkSDiXhIgS-ucS5Aqa4qCTF3gfGEAZ",
          "type": "email",
          "title": "validate demand",
          "emails": [
            "validator@foo.bar"
          ],
          "message": null
        }
      },
    ]
  })

  await page.goto(`http://localhost:${exposedPort}/auth/Local/login`);
  await page.locator('input[name="username"]').fill('admin@foo.bar');
  await page.locator('input[name="password"]').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.getByRole('heading', { name: 'test API' }).click();
  await page.getByText('Plans').click();
  await page.getByRole('button', { name: 'Request API key' }).click();
  await page.getByText('Consumers').click();
  await expect(page.getByRole('status')).toContainText('The API key request for Free with quotas plan and the team Consumers is pending acceptance');
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Logout' }).click();
  await page.goto('http://localhost:1080')
  await page.getByText('Validate a subscription', { exact: true }).click();
  await page.getByRole('link', { name: 'Accept' }).click();
  await expect(page.getByRole('alert')).toContainText('Thank you for your response');
  await page.getByRole('link', { name: 'Go back' }).click();
  await page.locator('input[name="username"]').fill('admin@foo.bar');
  await page.locator('input[name="password"]').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.getByText('Consumers').click();
  await page.getByText('API keys').click();
  await page.getByRole('row', { name: 'test API 2.0.0' }).getByLabel('View APIkeys').click();
  await expect(page.locator('.api-subscription__infos__name')).toContainText('not test plan');
})
//anonymous user can accept demand
test('[public tenant] - unlogged user can accept subscription demand', async ({ page, request}) => {
  await request.patch('http://localhost:9000/admin-api/usage-plans/lhsc79x9s0p4drv8j3ebapwrbnqhu1oo', {
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    },
    data: [
      {
        "op": "add",
        "path": "/subscriptionProcess/0",
        "value": {
          "id": "xmvkSDiXhIgS-ucS5Aqa4qCTF3gfGEAZ",
          "type": "email",
          "title": "validate demand",
          "emails": [
            "validator@foo.bar"
          ],
          "message": null
        }
      },
    ]
  })

  await page.goto(`http://localhost:${exposedPort}/auth/Local/login`);
  await page.locator('input[name="username"]').fill('admin@foo.bar');
  await page.locator('input[name="password"]').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.getByRole('heading', { name: 'test API' }).click();
  await page.getByText('Plans').click();
  await page.getByRole('button', { name: 'Request API key' }).click();
  await page.getByText('Consumers').click();
  await expect(page.getByRole('status')).toContainText('The API key request for Free with quotas plan and the team Consumers is pending acceptance');
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Logout' }).click();
  await page.goto('http://localhost:1080')
  await page.getByText('Validate a subscription', { exact: true }).click();
  await page.getByRole('link', { name: 'Accept' }).click();
  // await expect(page.getByRole('alert')).toContainText('Thank you for your response');
  // await page.getByRole('link', { name: 'Go back' }).click();
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByPlaceholder('Email address').fill('admin@foo.bar');
  await page.getByPlaceholder('Password').fill('password');
  await page.getByPlaceholder('Password').press('Enter');
  await page.getByText('Consumers').click();
  await page.getByText('API keys').click();
  await page.getByRole('row', { name: 'test API 2.0.0' }).getByLabel('View APIkeys').click();
  await expect(page.locator('.api-subscription__infos__name')).toContainText('not test plan');
})