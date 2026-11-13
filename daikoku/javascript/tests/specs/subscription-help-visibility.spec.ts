import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { generateApi, generatePlan } from './apis';
import { MICHAEL } from './users';
import { adminApikeyId, adminApikeySecret, apiDivision, loginAs } from './utils';
import type { IStateContext } from '../../src/types';

type Role = {
  isDaikokuAdmin: boolean;
  isTenantAdmin: boolean;
  permission: string;
  canManage: boolean;
};

type TargetConfiguration = 'missing target' | 'empty entities' | 'configured';

const checkSubscriptionHelp = async (
  page: Page,
  request: APIRequestContext,
  role: Role,
  configuration: TargetConfiguration
) => {
  const headers = {
    Authorization: `Basic ${Buffer.from(`${adminApikeyId}:${adminApikeySecret}`).toString('base64')}`,
  };
  const plan = generatePlan(configuration === 'missing target' ? { otoroshiTarget: null } : {});
  if (configuration === 'empty entities') {
    plan.otoroshiTarget.authorizedEntities = { groups: [], services: [], routes: [] };
  }

  const templateResponse = await request.get(`/admin-api/teams/${apiDivision}`, { headers });
  await expect(templateResponse).toBeOK();
  const ownerTeam = {
    ...(await templateResponse.json()),
    _id: plan._id,
    name: `Subscription owner ${plan._id}`,
    users: [{ userId: MICHAEL.id, teamPermission: role.permission }],
  };
  const api = generateApi({
    name: `Subscription help ${plan._id}`,
    team: ownerTeam._id,
    possibleUsagePlans: [plan._id],
  });

  await test.step('Create the test team, plan, and API', async () => {
    await expect(await request.post('/admin-api/teams', { headers, data: ownerTeam })).toBeOK();
    try {
      await expect(
        await request.post('/admin-api/usage-plans', { headers, data: plan })
      ).toBeOK();
      try {
        await expect(await request.post('/admin-api/apis', { headers, data: api })).toBeOK();
      } catch (error) {
        const response = await request.delete(`/admin-api/usage-plans/${plan._id}`, { headers });
        expect([200, 204, 404]).toContain(response.status());
        throw error;
      }
    } catch (error) {
      await request.delete(`/admin-api/teams/${ownerTeam._id}`, { headers });
      throw error;
    }
  });

  try {
    await test.step('Sign in and open the API plan', async () => {
      await page.goto('/apis');
      await loginAs(MICHAEL, page);
      await page.route('**/api/me/context', async (route) => {
        const response = await route.fetch();
        const context: IStateContext = await response.json();
        await route.fulfill({
          response,
          json: {
            ...context,
            isTenantAdmin: role.isTenantAdmin,
            connectedUser: { ...context.connectedUser, isDaikokuAdmin: role.isDaikokuAdmin },
          },
        });
      });
      await page.goto('/apis');
      await page.getByRole('link', { name: api.name, exact: true }).click();
      await page.getByText('Environnements', { exact: true }).click();
    });

    const row = page.getByRole('listitem', { name: 'dev', exact: true });
    const button = row.getByRole('button', { name: "Obtenir une clé d'API", exact: true });

    await test.step('Check the API-key button', async () => {
      if (configuration === 'configured') {
        await expect(button).toBeEnabled();
        return;
      }

      if (!role.canManage) {
        await expect(button).toHaveCount(0);
        return;
      }

      await expect(button).toBeDisabled();
      const buttonTooltip = button.locator('xpath=..');
      if (configuration === 'missing target') {
        await expect(buttonTooltip).toHaveAttribute('data-tooltip-id');
        await buttonTooltip.hover();
        const tooltipId = await buttonTooltip.getAttribute('data-tooltip-id');
        const tooltip = page.locator(`[role="tooltip"][id="${tooltipId}"]`);
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toContainText(
          "Aucune cible Otoroshi n'est configurée pour ce plan."
        );
      } else {
        await expect(buttonTooltip).not.toHaveAttribute('data-tooltip-id');
      }
    });

    await test.step('Check the Otoroshi target cell', async () => {
      const targetCell = row.locator('.otoroshi-cible-cell');
      if (!role.canManage) {
        await expect(targetCell).toHaveCount(0);
      } else if (configuration === 'configured') {
        await expect(targetCell.locator('[data-tooltip-id]')).toHaveCount(0);
        await expect(targetCell.locator('.bg-danger')).toHaveCount(0);
      } else {
        const label = targetCell.getByText('Aucun', { exact: true });
        await expect(label).toHaveClass(/bg-danger/);
        await label.hover();
        const tooltipId = await label.locator('xpath=..').getAttribute('data-tooltip-id');
        const tooltip = page.locator(`[role="tooltip"][id="${tooltipId}"]`);
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toContainText(
          configuration === 'missing target'
            ? "Aucune cible Otoroshi n'est configurée pour ce plan."
            : "La cible Otoroshi n'autorise aucun groupe ni route."
        );
        await expect(tooltip.locator('li')).toHaveCount(1);
      }

      await expect(row.locator('[data-tooltip-id]')).toHaveCount(
        !role.canManage || configuration === 'configured'
          ? 0
          : configuration === 'missing target' ? 2 : 1
      );
    });
  } finally {
    await request.delete(`/admin-api/apis/${api._id}`, { headers });
    await request.delete(`/admin-api/usage-plans/${plan._id}`, { headers });
    await request.delete(`/admin-api/teams/${ownerTeam._id}`, { headers });
  }
};

const daikokuAdministrator: Role = {
  isDaikokuAdmin: true,
  isTenantAdmin: false,
  permission: 'User',
  canManage: true,
};

const tenantAdministrator: Role = {
  isDaikokuAdmin: false,
  isTenantAdmin: true,
  permission: 'User',
  canManage: false,
};

const ownerTeamAdministrator: Role = {
  isDaikokuAdmin: false,
  isTenantAdmin: false,
  permission: 'Administrator',
  canManage: true,
};

const ownerApiEditor: Role = {
  isDaikokuAdmin: false,
  isTenantAdmin: false,
  permission: 'ApiEditor',
  canManage: true,
};

const consumer: Role = {
  isDaikokuAdmin: false,
  isTenantAdmin: false,
  permission: 'User',
  canManage: false,
};

test.describe('Daikoku administrator', () => {
  test('missing Otoroshi target', async ({ page, request }) => {
    await checkSubscriptionHelp(page, request, daikokuAdministrator, 'missing target');
  });
  test('empty authorized entities', async ({ page, request }) => {
    await checkSubscriptionHelp(page, request, daikokuAdministrator, 'empty entities');
  });
  test('configured target', async ({ page, request }) => {
    await checkSubscriptionHelp(page, request, daikokuAdministrator, 'configured');
  });
});

test.describe('Tenant administrator only', () => {
  test('missing Otoroshi target', async ({ page, request }) => {
    await checkSubscriptionHelp(page, request, tenantAdministrator, 'missing target');
  });
  test('empty authorized entities', async ({ page, request }) => {
    await checkSubscriptionHelp(page, request, tenantAdministrator, 'empty entities');
  });
  test('configured target', async ({ page, request }) => {
    await checkSubscriptionHelp(page, request, tenantAdministrator, 'configured');
  });
});

test.describe('Owner team administrator', () => {
  test('missing Otoroshi target', async ({ page, request }) => {
    await checkSubscriptionHelp(page, request, ownerTeamAdministrator, 'missing target');
  });
  test('empty authorized entities', async ({ page, request }) => {
    await checkSubscriptionHelp(page, request, ownerTeamAdministrator, 'empty entities');
  });
  test('configured target', async ({ page, request }) => {
    await checkSubscriptionHelp(page, request, ownerTeamAdministrator, 'configured');
  });
});

test.describe('Owner API editor', () => {
  test('missing Otoroshi target', async ({ page, request }) => {
    await checkSubscriptionHelp(page, request, ownerApiEditor, 'missing target');
  });
  test('empty authorized entities', async ({ page, request }) => {
    await checkSubscriptionHelp(page, request, ownerApiEditor, 'empty entities');
  });
  test('configured target', async ({ page, request }) => {
    await checkSubscriptionHelp(page, request, ownerApiEditor, 'configured');
  });
});

test.describe('Consumer', () => {
  test('missing Otoroshi target', async ({ page, request }) => {
    await checkSubscriptionHelp(page, request, consumer, 'missing target');
  });
  test('empty authorized entities', async ({ page, request }) => {
    await checkSubscriptionHelp(page, request, consumer, 'empty entities');
  });
  test('configured target', async ({ page, request }) => {
    await checkSubscriptionHelp(page, request, consumer, 'configured');
  });
});
