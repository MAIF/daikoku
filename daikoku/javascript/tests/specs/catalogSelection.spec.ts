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
      possibleUsagePlans: index === 19 ? [] : [plan],
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

test('toggles all selectable catalog rows and completes a partial selection', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);

  const selectAll = page.getByRole('checkbox', { name: 'Tout sélectionner', exact: true });
  const rows = page.getByRole('checkbox', { name: /^Sélectionner l'API Selection API / });
  const first = page.getByRole('checkbox', {
    name: "Sélectionner l'API Selection API 0",
    exact: true,
  });
  const disabled = page.getByRole('checkbox', {
    name: "Sélectionner l'API Selection API 19",
    exact: true,
  });
  await expect(disabled).toBeDisabled();

  await selectAll.click();
  await expect(selectAll).toBeChecked();
  await expect(rows.and(page.locator(':checked'))).toHaveCount(19);
  await expect(disabled).not.toBeChecked();

  await selectAll.click();
  await expect(selectAll).not.toBeChecked();
  await expect(rows.and(page.locator(':checked'))).toHaveCount(0);

  await first.check();
  await selectAll.click();
  await expect(rows.and(page.locator(':checked'))).toHaveCount(19);
  await expect(selectAll).toBeChecked();

  await page.getByRole('button', { name: 'Page 2', exact: true }).click();
  const offPage = page.getByRole('checkbox', {
    name: "Sélectionner l'API Selection API 20",
    exact: true,
  });
  await offPage.check();
  await page.getByRole('button', { name: 'Page 1', exact: true }).click();
  await expect(selectAll).toBeChecked();
  await selectAll.click();
  await expect(rows.and(page.locator(':checked'))).toHaveCount(0);
  await page.getByRole('button', { name: 'Page 2', exact: true }).click();
  await expect(offPage).toBeChecked();
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

test('shows assigned plans in the review table on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await page.getByRole('checkbox', { name: 'Tout sélectionner', exact: true }).check();
  await page.getByRole('button', { name: 'Souscrire aux APIs sélectionnées' }).click();
  await page
    .getByRole('dialog', { name: 'Sélectionner une équipe' })
    .getByRole('button', { name: MICHAEL.name, exact: true })
    .click();
  await page.getByRole('button', { name: "Préparer une clé d'API", exact: true }).click();
  await page.getByRole('textbox', { name: "Nom de la clé d'API", exact: true }).fill('Selection key');
  await page.getByRole('button', { name: 'Sélectionner les plans visibles', exact: true }).click();
  await page.getByRole('button', { name: 'Selection key', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Vérifier la demande', exact: true }).click();

  const review = page.getByRole('table');
  await expect(review.getByRole('columnheader', { name: 'Clé API' })).toBeVisible();
  await expect(review.getByRole('columnheader', { name: 'Plans' })).toBeVisible();
  const keyRow = review.getByRole('row').filter({ hasText: 'Selection key' });
  await expect(keyRow.getByText('Nouveau', { exact: true })).toBeVisible();
  await expect(keyRow.getByText('Selection plan', { exact: true })).toHaveCount(19);
  await expect(keyRow.getByText('Selection API 0', { exact: true })).toBeVisible();
  await expect(keyRow.getByText('Selection API 1', { exact: true })).toBeVisible();
  expect(await review.evaluate((table) => table.scrollWidth <= table.clientWidth)).toBe(true);

  const action = page.locator('.keyring-workspace__review-actions');
  const dimensions = await action.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      left: bounds.left,
      right: bounds.right,
      viewportWidth: window.innerWidth,
      borderWidth: getComputedStyle(element).borderTopWidth,
    };
  });
  expect(dimensions.left).toBe(0);
  expect(dimensions.right).toBe(dimensions.viewportWidth);
  expect(dimensions.borderWidth).not.toBe('0px');
  const visibility = await action.evaluate((element) => {
    let scroller = element.parentElement;
    while (
      scroller &&
      !(
        /(auto|scroll)/.test(getComputedStyle(scroller).overflowY) &&
        scroller.scrollHeight > scroller.clientHeight
      )
    ) {
      scroller = scroller.parentElement;
    }
    const scrollTarget = scroller ?? document.scrollingElement!;
    const scrollBounds = scroller?.getBoundingClientRect();
    const maxScroll = scrollTarget.scrollHeight - scrollTarget.clientHeight;
    return {
      maxScroll,
      visibleTop: Math.max(0, scrollBounds?.top ?? 0),
      visibleBottom: Math.min(window.innerHeight, scrollBounds?.bottom ?? window.innerHeight),
      positions: [0, maxScroll / 2, maxScroll].map((position) => {
        scrollTarget.scrollTop = position;
        const bounds = element.getBoundingClientRect();
        return { top: bounds.top, bottom: bounds.bottom };
      }),
    };
  });
  expect(visibility.maxScroll).toBeGreaterThan(0);
  for (const position of visibility.positions) {
    expect(position.top).toBeGreaterThanOrEqual(visibility.visibleTop);
    expect(position.bottom).toBeLessThanOrEqual(visibility.visibleBottom);
  }
  const lastPlan = keyRow.getByRole('listitem').last();
  const lastPlanBounds = await lastPlan.boundingBox();
  const actionBounds = await action.boundingBox();
  expect(lastPlanBounds!.y + lastPlanBounds!.height).toBeLessThanOrEqual(actionBounds!.y);

  await page.setViewportSize({ width: 1280, height: 800 });
  const desktopWidth = await action.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, viewportWidth: window.innerWidth };
  });
  expect(desktopWidth.left).toBe(0);
  expect(desktopWidth.right).toBe(desktopWidth.viewportWidth);
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
