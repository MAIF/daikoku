import { expect, test as base } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { IValidationStep } from '../../src/types/api';
import { generateApi, generatePlan } from '../specs/apis';
import { MICHAEL } from '../specs/users';
import { adminApikeyId, adminApikeySecret, apiDivision, loginAs } from '../specs/utils';

export const approvalProcess: IValidationStep[] = [
  {
    id: 'email',
    type: 'email',
    title: 'Email approval',
    emails: ['reviewer@example.org'],
    message: 'Please review this request.',
  },
  {
    id: 'http',
    type: 'httpRequest',
    title: 'HTTP approval',
    url: 'https://example.org/approve',
    headers: { 'X-Source': 'portal' },
  },
  {
    id: 'form',
    type: 'form',
    title: 'Motivation',
    schema: { motivation: { type: 'string' } },
    formatter: '[[motivation]]',
    formKeysToMetadata: ['motivation'],
    info: 'Explain your request.',
  },
  { id: 'admin', type: 'teamAdmin', title: 'Team approval', team: apiDivision },
  { id: 'payment', type: 'payment', title: 'Billing', thirdPartyPaymentSettingsId: 'billing' },
];

export const test = base.extend<{
  initialProcess: IValidationStep[];
  processApiName: string;
  openProcessEditor: () => Promise<void>;
  readSavedProcess: () => Promise<IValidationStep[]>;
  saveProcess: () => Promise<void>;
}>({
  initialProcess: [approvalProcess, { option: true }],
  processApiName: `Process editor ${randomUUID()}`,
  readSavedProcess: async ({ request, initialProcess, processApiName }, use) => {
    const headers = {
      Authorization: `Basic ${Buffer.from(`${adminApikeyId}:${adminApikeySecret}`).toString('base64')}`,
    };
    const plan = generatePlan({ subscriptionProcess: initialProcess });
    const api = generateApi({
      name: processApiName,
      possibleUsagePlans: [plan._id],
    });
    const planResponse = await request.post('/admin-api/usage-plans', { headers, data: plan });
    await expect(planResponse).toBeOK();
    try {
      const apiResponse = await request.post('/admin-api/apis', { headers, data: api });
      await expect(apiResponse).toBeOK();
      try {
        await use(async () => {
          const response = await request.get(`/admin-api/usage-plans/${plan._id}`, { headers });
          await expect(response).toBeOK();
          const saved: { subscriptionProcess: { steps: IValidationStep[] } } =
            await response.json();
          return saved.subscriptionProcess.steps;
        });
      } finally {
        const response = await request.delete(`/admin-api/apis/${api._id}`, { headers });
        await expect(response).toBeOK();
      }
    } finally {
      const response = await request.delete(`/admin-api/usage-plans/${plan._id}`, { headers });
      expect([200, 204, 404]).toContain(response.status());
    }
  },
  openProcessEditor: async ({ page, readSavedProcess, processApiName }, use) => {
    await readSavedProcess();
    await page.goto('/apis');
    await loginAs(MICHAEL, page);
    await page.getByRole('link', { name: processApiName, exact: true }).click();
    await page.getByText('Environnements', { exact: true }).click();
    await use(async () => {
      await page.getByRole('button', { name: "Configurer l'environnement", exact: true }).click();
      await page.getByRole('button', { name: 'Modifier le process', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Éditeur de processus' })).toBeVisible();
    });
  },
  saveProcess: async ({ page }, use) => {
    await use(async () => {
      const saved = page.waitForResponse(
        (response) => response.request().method() === 'PUT' && response.url().includes('/plan/')
      );
      await page.getByRole('button', { name: 'save', exact: true }).click();
      expect((await saved).ok()).toBe(true);
      await expect(page.getByRole('region', { name: 'Éditeur de processus' })).toBeHidden();
    });
  },
});

export { expect } from '@playwright/test';
