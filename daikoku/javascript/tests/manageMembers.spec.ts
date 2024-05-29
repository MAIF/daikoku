import { test, expect } from '@playwright/test';

const adminApikeyId = 'admin_key_client_id';
const adminApikeySecret = 'admin_key_client_secret';

test.beforeAll(async () => {
  console.log(`Running ${test.info().title}`);
  await fetch('http://localhost:9000/admin-api/state/reset', {
    method: 'POST',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  })
    .then(r => r.json())
    .then(r => console.log({ r }));
})

test('manage team as admin', async ({ page }) => {
  await page.goto('http://localhost:5173/apis');
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByPlaceholder('Email adress').fill('user@foo.bar');
  await page.getByPlaceholder('Password').fill('password');
  await page.getByPlaceholder('Password').press('Enter');
  await page.locator('div:nth-child(3) > .notification-link').first().click();
  await page.locator('span.block__entry__link').filter({ hasText: 'Team' }).first().click();
  await page.getByLabel('Name').fill('komainu');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('list')).toContainText('Team komainu created successfully');
  await page.locator('.navbar-panel-background').click();
  await page.getByText('komainu', { exact: true }).click();
  await page.getByText('Informations').click();
  await page.getByLabel('Description').fill('the komainu team');
  await page.getByLabel('Team contact').fill('komainu@daikoku.io');
  await page.getByRole('button', { name: ' Set avatar from Gravatar' }).click();
  await page.getByRole('button', { name: 'Administrator' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('list')).toContainText('Team komainu updated successfully');
  await page.getByText('Members').click();
  await expect(page.getByRole('main')).toContainText('User');
  await page.getByRole('button', { name: 'Invite a collaborator' }).click();
  await page.getByPlaceholder('Email').fill('fail_email');
  await expect(page.locator('form')).toContainText('Your mail must be a valid email address');
  await page.getByPlaceholder('Email').fill('tester@foo.bar');
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await page.getByText('Pending (1)').click();
  await expect(page.getByRole('main')).toContainText('Tester');
  await page.getByRole('button', { name: 'Invite a collaborator' }).click();
  await page.getByPlaceholder('Email').fill('other@foo.bar');
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByRole('main')).toContainText('other@foo.bar');
  await expect(page.locator('.onglets')).toContainText('Pending (2)');
});

// test('join a team as daikoku user', async ({ page }) => {
//   await page.goto('http://localhost:9000/apis');
//   await page.getByRole('img', { name: 'user menu' }).click();
//   await page.getByPlaceholder('Email adress').fill('tester@foo.bar');
//   await page.getByPlaceholder('Password').fill('password');
//   await page.getByPlaceholder('Password').press('Enter');
//   await page.waitForResponse(r => r.url().includes('/api/me/context') && r.status() === 200)
//   await page.getByRole('img', { name: 'user menu' }).click();
//   await expect(page.locator('.navbar-panel .blocks')).toContainText('tester@foo.bar');
//   // await page.locator('.navbar-panel-background').click();
//   await page.getByRole('link', { name: 'Access to the notifications' }).click();
//   // await page.waitForResponse(r => r.url().includes('/api/me/notifications/unread-count') && r.status() === 200)

//   await page.locator('h2').filter({ hasText: 'Personal' }).waitFor({ state: 'visible' })

//   await page.getByText('User, as admin of komainu, invite you in his team.komainu').click();
//   await page.locator('.alert.section')
//     .filter({ hasText: 'User, as admin of komainu, invite you in his team.' })
//     .locator('a.btn.btn-outline-success').click();
//   await page.getByRole('link', { name: 'Daikoku home' }).click();
//   await page.getByText('komainu').click();
//   await page.getByText('Members').click();
//   await expect(page.getByRole('main')).toContainText('Tester');
//   await expect(page.getByRole('list')).toContainText('Pending (1)');
// })