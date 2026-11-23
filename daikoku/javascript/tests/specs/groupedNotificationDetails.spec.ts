import { expect, test } from '@playwright/test';
import { JIM } from './users';
import { ACCUEIL, HOME, loginAs } from './utils';

test('shows the requesting team and motivation in grouped notification details', async ({ page }) => {
  const notification = (id: string, motivation: string | null) => ({
    _id: id,
    tenant: { id: 'default' },
    team: { _id: 'producer', name: 'Producer team' },
    sender: { id: 'requester', name: 'Requesting user' },
    action: {
      __typename: 'ApiSubscriptionBatch',
      api: { _id: 'api', _humanReadableId: 'api', name: 'Example API', currentVersion: '1.0.0' },
      team: { _id: 'consumer', name: 'Consumer team' },
      phase: 0,
      motivation,
      items: [
        { item: 'one', demand: 'demand-one', step: 'step-one', plan: { _id: 'one', customName: 'Development' } },
        { item: 'two', demand: 'demand-two', step: 'step-two', plan: { _id: 'two', customName: 'Production' } },
      ],
    },
    date: Date.now(),
    notificationType: { value: 'AcceptOrReject' },
    status: { status: 'Pending' },
  });
  await page.route('**/api/search', async route => {
    const { query } = route.request().postDataJSON();
    if (!query.includes('query getMyNotifications')) return route.continue();
    expect(query).toMatch(/\.\.\. on ApiSubscriptionBatch\s*\{[\s\S]*?\bmotivation\b/);
    await route.fulfill({
      json: {
        data: {
          myNotifications: {
            notifications: [
              notification('with-motivation', JSON.stringify({ motivation: 'Access for testing', project: 'My project' })),
              notification('without-motivation', null),
              notification('legacy-motivation', 'Free text'),
              notification('empty-motivation', '{}'),
            ],
            total: 4,
            totalFiltered: 4,
            totalSelectable: 0,
            totalByTypes: [],
            totalByNotificationTypes: [],
            totalByTeams: [],
            totalByApis: [],
          },
        },
      },
    });
  });
  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  await page.goto(`${HOME}notifications`);

  const rows = page.getByRole('list', { name: 'notifications' }).getByRole('listitem');
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toContainText('Consumer team');
  await expect(rows.first()).toContainText('Example API');
  await expect(rows.first()).toContainText('Development, Production');
  await rows.nth(0).getByRole('link', { name: 'Voir les détails de la demande de souscription' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Consumer team');
  await expect(dialog).toContainText('Requesting user');
  await expect(dialog).toContainText('Access for testing');
  await expect(dialog).toContainText('My project');
  await dialog.getByRole('button', { name: 'Fermer' }).click();

  await rows.nth(1).getByRole('link', { name: 'Voir les détails de la demande de souscription' }).click();
  await expect(dialog).toContainText('Aucune motivation renseignée.');
  await dialog.getByRole('button', { name: 'Fermer' }).click();

  await rows.nth(2).getByRole('link', { name: 'Voir les détails de la demande de souscription' }).click();
  await expect(dialog).toContainText('Free text');
  await dialog.getByRole('button', { name: 'Fermer' }).click();
  await rows.nth(3).getByRole('link', { name: 'Voir les détails de la demande de souscription' }).click();
  await expect(dialog).toContainText('Aucune motivation renseignée.');
});
