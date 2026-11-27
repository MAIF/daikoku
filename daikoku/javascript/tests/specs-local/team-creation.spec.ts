import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { JIM, MICHAEL } from '../specs/users';
import { adminApikeyId, adminApikeySecret, tenant } from './utils';

const targetUrl = process.env.TEAM_WORKFLOW_E2E_URL;
const smtpUrl = process.env.TEAM_WORKFLOW_SMTP_URL;
const headers = {
  Authorization: `Basic ${Buffer.from(`${adminApikeyId}:${adminApikeySecret}`).toString('base64')}`,
};

test.use({ baseURL: targetUrl ?? 'http://localhost:13200' });
test.skip(
  !targetUrl || !smtpUrl,
  'Set TEAM_WORKFLOW_E2E_URL and TEAM_WORKFLOW_SMTP_URL to isolated test services.'
);

async function signIn(page: Page, email: string) {
  await page.goto('/apis');
  await page.getByRole('img', { name: 'user menu' }).click();
  await page.locator('input[name="username"]').fill(email);
  await page.locator('input[name="password"]').fill('password');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mes équipes', exact: true })).toBeVisible();
}

async function prepareWorkflow(request: APIRequestContext, email: boolean) {
  const teamsResponse = await request.get('/admin-api/teams', { headers });
  await expect(teamsResponse).toBeOK();
  const teams = await teamsResponse.json();
  const adminTeam = teams.find((team: { type: string }) => team.type === 'Admin');
  expect(adminTeam).toBeTruthy();
  const workflowSteps = [
    {
      id: 'team-form',
      type: 'form',
      title: 'Team information',
      formatter: '[[name]] - [[contact]]',
    },
    { id: 'team-admin', type: 'teamAdmin', title: 'Team approval', team: adminTeam._id },
    ...(email
      ? [
          {
            id: 'team-email',
            type: 'email',
            title: 'Team validation',
            emails: ['${form.email}'],
            message: 'Please validate the new team.',
          },
        ]
      : []),
  ];
  await expect(
    await request.patch(`/admin-api/tenants/${tenant}`, {
      headers,
      data: [
        { op: 'add', path: '/teamCreationSecurity', value: false },
        { op: 'add', path: '/teamCreationProcess', value: workflowSteps },
        {
          op: 'add',
          path: '/mailerSettings',
          value: {
            type: 'smtpClient',
            host: 'localhost',
            port: Number(process.env.TEAM_WORKFLOW_SMTP_PORT ?? 11025),
            fromTitle: 'Team workflow test',
            fromEmail: 'workflow@foo.test',
            starttls: false,
            ssl: false,
          },
        },
      ],
    })
  ).toBeOK();
  for (const user of [JIM, MICHAEL]) {
    await expect(
      await request.patch(`/admin-api/users/${user.id}`, {
        headers,
        data: [
          {
            op: 'add',
            path: '/password',
            value: '$2a$10$/Vpj1lFN0AcCfbutd7FJwO0j1vU4X0fR6t.4vvWBqSEqtoUFFxfDG',
          },
          { op: 'add', path: '/origins', value: ['LOCAL'] },
        ],
      })
    ).toBeOK();
  }
}

async function requestTeam(page: Page, name: string, contact: string) {
  await signIn(page, JIM.email);
  await page.getByRole('button', { name: 'Mes équipes', exact: true }).click();
  await page.getByRole('button', { name: 'Créer une équipe', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Créer une nouvelle équipe' });
  await form.getByRole('textbox', { name: 'Nom', exact: true }).fill(name);
  await form.getByRole('textbox', { name: "Contact de l'équipe", exact: true }).fill(contact);
  const submitted = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/teams' && response.request().method() === 'POST',
    { timeout: 30_000 }
  );
  await form.getByRole('button', { name: 'Créer', exact: true }).click();
  const response = await submitted;
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ creation: 'waiting' });
}

async function expectNoTeam(request: APIRequestContext, name: string) {
  const response = await request.get('/admin-api/teams', { headers });
  await expect(response).toBeOK();
  expect(
    (await response.json()).filter((team: { name: string }) => team.name === name)
  ).toHaveLength(0);
}

test('creates a team only after administrator approval and email validation', async ({
  page,
  browser,
  request,
}) => {
  await prepareWorkflow(request, true);
  const name = `Approved workflow team ${Date.now()}`;
  const contact = `approved-${Date.now()}@foo.test`;
  await requestTeam(page, name, contact);
  await expectNoTeam(request, name);

  const adminContext = await browser.newContext({ baseURL: targetUrl });
  try {
    const adminPage = await adminContext.newPage();
    await signIn(adminPage, MICHAEL.email);
    await adminPage.goto('/notifications');
    const notification = adminPage.getByRole('listitem').filter({ hasText: name });
    await notification.getByRole('link', { name: 'Voir plus', exact: true }).click();
    const details = adminPage.getByRole('dialog');
    await expect(details).toContainText(name);
    await expect(details).toContainText(contact);
    await details.getByRole('button', { name: 'Fermer', exact: true }).click();
    const accepted = adminPage.waitForResponse(
      (response) => response.url().endsWith('/accept') && response.request().method() === 'PUT',
      { timeout: 30_000 }
    );
    await notification.getByRole('button', { name: 'Accepter', exact: true }).click();
    expect((await accepted).ok()).toBe(true);
    await expectNoTeam(request, name);

    await page.goto(smtpUrl!);
    await page
      .getByText('Nouvelle équipe à valider sur Dunder Mifflin', { exact: true })
      .first()
      .click();
    await expect(page.getByText(contact, { exact: false }).first()).toBeVisible();
    const confirmation = page.waitForEvent('popup');
    await page.getByRole('link', { name: 'accepter', exact: true }).click();
    const confirmationPage = await confirmation;
    await expect(confirmationPage).toHaveURL(/\/informations\?message=team-creation-accept/);

    await page.goto('/apis');
    await page.getByRole('button', { name: 'Mes équipes', exact: true }).click();
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    const teams = await request.get('/admin-api/teams', { headers });
    const created = (await teams.json()).filter((team: { name: string }) => team.name === name);
    expect(created).toHaveLength(1);
    expect(created[0].users).toContainEqual({ userId: JIM.id, teamPermission: 'Administrator' });
  } finally {
    await adminContext.close();
  }
});

test('rejects a team request with a reason without creating the team', async ({
  page,
  browser,
  request,
}) => {
  await prepareWorkflow(request, false);
  const name = `Rejected workflow team ${Date.now()}`;
  await requestTeam(page, name, `rejected-${Date.now()}@foo.test`);
  const adminContext = await browser.newContext({ baseURL: targetUrl });
  try {
    const adminPage = await adminContext.newPage();
    await signIn(adminPage, MICHAEL.email);
    await adminPage.goto('/notifications');
    const notification = adminPage.getByRole('listitem').filter({ hasText: name });
    await notification.getByRole('button', { name: 'Rejeter', exact: true }).click();
    const form = adminPage.getByRole('dialog');
    await expect(
      form,
      'Rejecting a team request must allow the administrator to enter a reason.'
    ).toBeVisible();
    const reason = 'An existing team already covers this need.';
    await form.locator('#message').fill(reason);
    const rejected = adminPage.waitForResponse(
      (response) => response.url().endsWith('/reject') && response.request().method() === 'PUT'
    );
    await form.getByRole('button', { name: 'Envoyer', exact: true }).click();
    const response = await rejected;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON()).toMatchObject({ message: reason });
    await expect(notification).toContainText('Rejetée');
    await expectNoTeam(request, name);
    await page.goto('/apis');
    await page.getByRole('button', { name: 'Mes équipes', exact: true }).click();
    await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
  } finally {
    await adminContext.close();
  }
});
