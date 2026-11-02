import { expect, test } from '@playwright/test';
import { generateApi, generatePlan } from './apis';
import { MICHAEL } from './users';
import { adminApikeyId, adminApikeySecret, apiDivision, loginAs } from './utils';
import type { IStateContext } from '../../src/types';

const roles = [
  {
    name: 'Daikoku administrator',
    isDaikokuAdmin: true,
    isTenantAdmin: false,
    permission: 'User',
    canManage: true,
  },
  {
    name: 'tenant administrator only',
    isDaikokuAdmin: false,
    isTenantAdmin: true,
    permission: 'User',
    canManage: false,
  },
  {
    name: 'owner team administrator',
    isDaikokuAdmin: false,
    isTenantAdmin: false,
    permission: 'Administrator',
    canManage: true,
  },
  {
    name: 'owner API editor',
    isDaikokuAdmin: false,
    isTenantAdmin: false,
    permission: 'ApiEditor',
    canManage: true,
  },
  {
    name: 'consumer',
    isDaikokuAdmin: false,
    isTenantAdmin: false,
    permission: 'User',
    canManage: false,
  },
];

for (const role of roles) {
  for (const configuration of ['missing target', 'empty entities', 'configured'] as const) {
    test(`${role.name}: ${configuration}`, async ({ page, request }) => {
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
      await expect(await request.post('/admin-api/teams', { headers, data: ownerTeam })).toBeOK();
      try {
        await expect(
          await request.post('/admin-api/usage-plans', { headers, data: plan })
        ).toBeOK();
        try {
          await expect(await request.post('/admin-api/apis', { headers, data: api })).toBeOK();
          try {
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

            const row = page.getByRole('listitem', { name: 'dev', exact: true });
            const button = row.getByRole('button', { name: "Obtenir une clé d'API", exact: true });
            if (configuration === 'configured') {
              await expect(button).toBeEnabled();
            } else if (role.canManage) {
              await expect(button).toBeDisabled();
              await expect(button.locator('xpath=..')).not.toHaveAttribute('data-tooltip-id');
            } else {
              await expect(button).toHaveCount(0);
            }

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
              const tooltip = page.getByRole('tooltip');
              await expect(tooltip).toBeVisible();
              await expect(tooltip).toContainText(
                configuration === 'missing target'
                  ? "Aucune cible Otoroshi n'est configurée pour ce plan."
                  : "La cible Otoroshi n'autorise aucun groupe ni route."
              );
              await expect(tooltip.locator('li')).toHaveCount(1);
            }
            await expect(row.locator('[data-tooltip-id]')).toHaveCount(
              role.canManage && configuration !== 'configured' ? 1 : 0
            );
          } finally {
            await expect(await request.delete(`/admin-api/apis/${api._id}`, { headers })).toBeOK();
          }
        } finally {
          const response = await request.delete(`/admin-api/usage-plans/${plan._id}`, { headers });
          expect([200, 204, 404]).toContain(response.status());
        }
      } finally {
        await expect(
          await request.delete(`/admin-api/teams/${ownerTeam._id}`, { headers })
        ).toBeOK();
      }
    });
  }
}
