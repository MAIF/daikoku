import { expect, test } from '@playwright/test';
import { JIM } from './users';
import { ACCUEIL, loginAs, papierProdPlan, vendeurs } from './utils';

test('shows pending request counts per plan', async ({ page }) => {
  let requests = [
    { _id: 'waiting', plan: papierProdPlan, state: 'waiting', team: vendeurs },
    { _id: 'in-progress', plan: papierProdPlan, state: 'inProgress', team: vendeurs },
    { _id: 'refused', plan: papierProdPlan, state: 'refused', team: vendeurs },
  ];
  await page.route('**/api/me/subscriptions/*/1.0.0', async route => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, requests } });
  });
  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  await page.getByRole('link', { name: 'API papier' }).click();
  await page.getByText('Environnements').click();

  const prodTag = page.getByRole('listitem', { name: 'prod' }).locator('.tag.--warning');
  await expect(prodTag).toHaveText('2 demandes en cours');
  await expect(page.getByRole('listitem', { name: 'dev' }).locator('.tag.--warning')).toHaveCount(0);

  requests = requests.filter(request => request.state === 'inProgress');
  await page.reload();
  await expect(prodTag).toHaveText('1 demande en cours');
  requests = [];
  await page.reload();
  await expect(prodTag).toHaveCount(0);
});
