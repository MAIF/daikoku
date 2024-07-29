import { test, expect } from '@playwright/test';

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

const exposedPort = process.env.EXPOSED_PORT || 5173

test('test a complete user journey', async ({ page }) => {
  //connection
  await page.goto(`http://localhost:${exposedPort}/apis`);
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.getByPlaceholder('Email adress').fill('user@foo.bar');
  await page.getByPlaceholder('Password').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForResponse(response => response.url().includes('/auth/Local/callback') && response.status() === 303)
  await page.waitForSelector("section.organisation__header")
  // FIXME: find the fine selector to check user is connected

  //create a new team
  await page.locator('div:nth-child(3) > .notification-link').first().click();
  await page.getByRole('button', { name: '' }).first().click();
  await page.getByLabel('Name').fill('The A team');
  await page.getByLabel('Description').fill('the A team');
  await page.getByLabel('Team contact').fill('user@foo.bar');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('list')).toContainText('Team The A team created successfully');
  await page.locator('.navbar-panel-background').click();

  //create a new API
  await page.locator('div:nth-child(3) > .notification-link').first().click();
  await page.locator('span').filter({ hasText: 'API' }).first().click();
  await page.locator('div').filter({ hasText: /^The A team$/ }).click();

  await page.getByRole('button', { name: 'Published' }).click();
  await page.getByPlaceholder('New Api').fill('Test API');
  await expect(page.locator('form')).toContainText('API with this name already exists');
  await page.getByPlaceholder('New Api').fill('second test api');
  await page.getByLabel('Small desc.').click();
  await page.getByLabel('Small desc.').fill('A new test API');
  await page.locator('.mrf-collapse_label').filter({ hasText: 'Basic informations' }).click();
  await page.locator('.mrf-collapse_label').filter({ hasText: 'Description' }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.type('# A new test API');
  await page.keyboard.press('Enter');
  await page.keyboard.type('description...');
  await page.getByRole('button', { name: 'Save' }).click();

  //create a simple plan
  await page.getByText('Plans').click();
  await page.getByRole('button', { name: 'Add plan' }).click();
  await page.locator('.react-form-select__input-container').click();
  await page.getByText('Free without quotas', { exact: true }).click();
  await page.getByPlaceholder('Plan name').fill('dev plan');
  await page.getByPlaceholder('Plan description').fill('a dev plan to test the API with unlimited usage');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('.react-form-select__input-container').click();
  await page.getByText('http://127.0.0.1:9000/fakeotoroshi', { exact: true }).click();
  await page.locator('#input-label > .reactSelect__control > .reactSelect__value-container > .reactSelect__input-container').click();
  await page.getByRole('option', { name: 'nice-route', exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('div').filter({ hasText: /^Automatic API key metadata$/ }).getByRole('button').click();
  await page.getByRole('textbox').first().fill('foo');
  await page.getByRole('textbox').nth(1).fill('bar');
  await page.getByRole('button', { name: 'Next' }).click();
  //-----------------------------------------------
  //-----------------------------------------------
  // documentaiton work weirdly cause by editor

  // await expect(page.getByRole('status')).toContainText('The plan has been successfully modified');
  // await page.getByText('Documentation').click();
  // await page.getByRole('button', { name: 'Add page' }).click();
  // await page.getByLabel('Page title').fill('Usage');
  // await page.getByText('New page', { exact: true }).click();
  // await page.getByText('.cm-content').fill('# Intruction\n\n\nA new page');
  // await page.getByText('# IntrodcA new page').fill('# Usage\n\n\nA new page');
  // await page.getByText('# Usageto use').fill('# Usage\n\n\nto use our API just do it');
  // await page.getByLabel('Long Lorem Ipsum').click();
  // await page.getByRole('button', { name: 'Save' }).click();

  //-----------------------------------------------
  //-----------------------------------------------


  //-----------------------------------------------
  //-----------------------------------------------
  // news work weirdly cause by editor

  // await page.getByText('News').click();
  // await page.getByRole('button', { name: 'Create news' }).click();
  // await page.getByLabel('Title of news').fill('Our API is alive');
  // await page.locator('div').filter({ hasText: /^WritePreview91›$/ }).getByRole('textbox').locator('div').click();
  // await page.locator('div').filter({ hasText: /^WritePreview91›$/ }).getByRole('textbox').fill('please ');
  // await page.getByText('please').click();
  // await page.locator('div').filter({ hasText: /^91›let me introduce our new api$/ }).nth(1).click();
  // await page.getByText('let me introduce our new api').click();
  // await page.locator('div').filter({ hasText: /^WritePreview91›let me introduce our new api$/ }).getByRole('textbox').fill('let me introduce our new api : """');
  // await page.locator('div').filter({ hasText: /^WritePreview91›let me introduce our new api : "Second "$/ }).getByRole('textbox').fill('let me introduce our new api : "Second test API"');
  // await page.getByRole('button', { name: 'Publish news' }).click();
  //-----------------------------------------------
  //-----------------------------------------------

  //subscribe
  await page.getByText('Subscriptions').click();
  await expect(page.getByRole('main')).toContainText('0 Result');
  await page.getByRole('link', { name: 'Go home' }).click();
  await expect(page.getByRole('main')).toContainText('second test api');

  
  await page.locator('div').filter({ hasText: /^second test api/ }).getByLabel('star').click();
  await expect(page.locator('div').filter({ hasText: /^second test api/ }).locator('.star-button')).toContainText('1')
  await page.locator('div').filter({ hasText: /^second test api/ }).getByLabel('star').click();
  await expect(page.locator('div').filter({ hasText: /^second test api/ }).locator('.star-button')).toContainText('0')

  await page.getByRole('heading', { name: 'second test api' }).click();
  await expect(page.locator('h1.jumbotron-heading')).toContainText('second test api');
  await expect(page.locator('.lead')).toContainText('A new test API');
  await page.getByText('Plans').click();
  await expect(page.locator('#usage-plans__list')).toContainText('dev plan');
  await page.getByRole('button', { name: 'Get API key' }).click();
  await page.locator('.team-selection__team:has-text("The A team")').click();
  //todo: wait subscription ok
  await page.waitForResponse(r => r.url().includes('/_subscribe') && r.status() === 200)
 
  await page.goto(`http://localhost:${exposedPort}/apis`);
  await page.getByRole('heading', { name: 'second test api' }).click();
  // await page.getByText('Documentation').click();
  // await expect(page.getByRole('listitem')).toContainText('Usage');
  // await expect(page.getByRole('main')).toContainText('Lorem ipsum');
  // await page.getByText('News').click();
  // await expect(page.getByRole('main')).toContainText('Our API is alive');
  await page.getByRole('link', { name: 'Go home' }).click();
  await page.locator('span').filter({ hasText: 'The A team' }).click();
  await page.getByText('API keys').click();
  await expect(page.getByRole('main')).toContainText('1 Result');
  await page.getByRole('link', { name: ' API keys' }).click();
  await expect(page.locator('.card-header')).toContainText('dev plan');
});