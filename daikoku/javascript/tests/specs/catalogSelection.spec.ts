import { expect, test } from '@playwright/test';
import type { ISubscriptionBatchSubmission } from '../../src/types/api';
import { generateApi, generatePlan } from './apis';
import { MICHAEL } from './users';
import { ACCUEIL, loginAs } from './utils';

test.beforeEach(async ({ page }) => {
  const plan = generatePlan({ customName: 'Selection plan', aggregationApiKeysSecurity: true });
  const apis = Array.from({ length: 21 }, (_, index) => ({
    api: generateApi({
      _id: `selection-api-${index}`,
      name: `Selection API ${index}`,
      team: { _id: 'producer', _humanReadableId: 'producer', name: 'Producer' },
      tags: [],
      possibleUsagePlans: [plan],
    }),
    authorizations: [],
    subscriptionCount: 0,
    subscriptionDemands: [],
  }));
  await page.route('**/api/search', async (route) => {
    const { query, variables } = route.request().postDataJSON();
    if (query.includes('visibleApis')) {
      await route.fulfill({
        json: {
          data: {
            visibleApis: {
              apis: apis.slice(variables.offset, variables.offset + variables.limit),
              total: apis.length,
              totalFiltered: apis.length,
              producers: [],
              tags: [],
            },
          },
        },
      });
    } else if (query.includes('plansByApi')) {
      await route.fulfill({ json: { data: { plansByApi: { plans: [plan], totalFiltered: 1 } } } });
    } else {
      await route.continue();
    }
  });
  await page.route(/\/api\/subscriptions\/teams\/[^/]+$/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/subscription\/team\/[^/]+\/pending-plans$/, (route) =>
    route.fulfill({ json: [] })
  );
});

test('keeps catalog selection when closing the team selector or leaving preparation', async ({
  page,
}) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);

  const first = page.getByRole('checkbox', {
    name: "Sélectionner l'API Selection API 0",
    exact: true,
  });
  const second = page.getByRole('checkbox', {
    name: "Sélectionner l'API Selection API 1",
    exact: true,
  });
  await first.check();
  await second.check();
  const subscribe = page.getByRole('button', { name: 'Souscrire aux APIs sélectionnées' });
  await subscribe.click();
  const dialog = page.getByRole('dialog', { name: 'Sélectionner une équipe' });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(first).toBeChecked();
  await expect(second).toBeChecked();

  await subscribe.click();
  await dialog.getByRole('button', { name: MICHAEL.name, exact: true }).click();
  await expect(page.getByRole('heading', { name: "Préparer vos clés d'API" })).toBeVisible();
  await page.getByRole('link', { name: 'Retour au catalogue' }).click();
  await expect(first).toBeChecked();
  await expect(second).toBeChecked();

  await subscribe.click();
  await dialog.getByRole('button', { name: MICHAEL.name, exact: true }).click();
  await page.goBack();
  await expect(first).toBeChecked();
  await expect(second).toBeChecked();
});

test('restores off-page APIs after a failed submission and clears selection only after success', async ({
  page,
}) => {
  const submissions: ISubscriptionBatchSubmission[] = [];
  await page.route(/\/api\/subscription\/team\/[^/]+\/batches$/, async (route) => {
    submissions.push(route.request().postDataJSON());
    await route.fulfill(
      submissions.length === 1
        ? { status: 500, json: { error: 'Selection submission failed' } }
        : {
            status: 201,
            json: { batch: { _id: 'selection-batch' }, state: 'Pending', replayed: false },
          }
    );
  });
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await page
    .getByRole('checkbox', { name: "Sélectionner l'API Selection API 0", exact: true })
    .check();
  await page.getByRole('button', { name: 'Page 2', exact: true }).click();
  await page
    .getByRole('checkbox', { name: "Sélectionner l'API Selection API 20", exact: true })
    .check();

  for (const attempt of [0, 1]) {
    await page.getByRole('button', { name: 'Souscrire aux APIs sélectionnées' }).click();
    await page
      .getByRole('dialog', { name: 'Sélectionner une équipe' })
      .getByRole('button', { name: MICHAEL.name, exact: true })
      .click();
    await page.getByRole('button', { name: "Préparer une clé d'API", exact: true }).click();
    await page
      .getByRole('textbox', { name: "Nom de la clé d'API", exact: true })
      .fill('Selection key');
    await page
      .getByRole('button', { name: 'Sélectionner les plans visibles', exact: true })
      .click();
    await page.getByRole('button', { name: 'Selection key', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Vérifier la demande', exact: true }).click();
    await page.getByRole('button', { name: 'Envoyer la demande groupée', exact: true }).click();
    if (attempt === 0) {
      await expect(page.getByText('Selection submission failed', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Modifier la préparation', exact: true }).click();
      await page.getByRole('link', { name: 'Retour au catalogue', exact: true }).click();
      await page
        .getByRole('button', { name: 'Quitter et perdre le brouillon', exact: true })
        .click();
      await expect(page.getByText('2 lignes sélectionnées', { exact: true })).toBeVisible();
      await expect(
        page.getByRole('checkbox', {
          name: "Sélectionner l'API Selection API 0",
          exact: true,
        })
      ).toBeChecked();
    }
  }
  await expect(page).toHaveURL(/\/apis$/);
  await expect(page.getByRole('button', { name: 'Souscrire aux APIs sélectionnées' })).toBeHidden();
  await expect(
    page.getByRole('checkbox', {
      name: "Sélectionner l'API Selection API 0",
      exact: true,
    })
  ).not.toBeChecked();
  expect(submissions).toHaveLength(2);
  for (const submission of submissions) {
    expect(submission.items.map(({ api }) => api).sort()).toEqual([
      'selection-api-0',
      'selection-api-20',
    ]);
  }
});
