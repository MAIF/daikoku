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

test('join a team as external user', async ({ page }) => {
  await page.goto('http://localhost:5173/apis');
  await expect(page.getByRole('heading', { name: 'public with permissions API' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'admin-api-tenant-default' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'test API' })).toBeVisible();
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByPlaceholder('Email adress').fill('admin@foo.bar');
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
  await page.getByPlaceholder('Email adress').fill('bob@foo.bar');
  await page.getByPlaceholder('Password').fill('Pa$$w0rd');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('heading', { name: 'public with permissions API' })).toBeVisible();
  await page.getByRole('link', { name: 'Access to the notifications' }).click();
  await expect(page.getByText('Admin, as admin of Consumers')).toBeVisible();
  await page.getByRole('link', { name: '' }).click();
  await page.getByRole('link', { name: 'Daikoku home' }).click();
  await expect(page.getByText('Consumers')).toBeVisible();
})

//anonymous user - private tenant
//can't see API
//automatically redirect to login page
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

  await page.goto('http://localhost:5173/apis');
  await page.waitForURL("http://localhost:5173/auth/Local/login");
  await expect(page.getByRole('heading', { name: 'Login to Evil Corp.' })).toBeVisible();

})