import test, { expect, Page } from '@playwright/test';
import { nanoid } from 'nanoid';

import { generateApi, generatePlan, saveApi, savePlan } from './apis';
import { JIM, MICHAEL } from './users';
import { ACCUEIL, adminApi, apiDivision, exposedPort, loginAs, logout, vendeurs } from './utils';

test.beforeEach(async () => {
  await adminApi('/state/reset', { method: 'POST' });
});

/** A plan of API Division waiting for the validation of its administrators,
 * and the demand Vendeurs made on it, through the route the frontend calls. */
const demandAwaitingValidation = async (page: Page) => {
  const planId = nanoid(32);
  // The tenant displays environments: a plan has to be named after one of them
  const plan = generatePlan({
    _id: planId,
    customName: 'prod',
    // A validation by administrators reads the motivation of a form filled before it
    subscriptionProcess: [
      {
        type: 'form',
        id: 'motivation',
        title: 'Motivation',
      },
      {
        type: 'teamAdmin',
        id: 'api-division-validation',
        team: apiDivision,
        title: 'Validation par API Division',
      },
    ],
  });
  const api = generateApi({
    name: 'Pending demands API',
    team: apiDivision,
    possibleUsagePlans: [planId],
  });
  expect((await savePlan(plan)).ok).toBeTruthy();
  expect((await saveApi(api as any)).ok).toBeTruthy();

  const demand = await page.request.post(
    `http://localhost:${exposedPort}/api/apis/${api._id}/plan/${planId}/team/${vendeurs}/_subscribe`,
    {
      data: {
        motivation: {
          motivation: 'Pour suivre les commandes de Vendeurs',
        },
        keyringCustomName: `${api.name} - ${plan.customName}`,
      },
    }
  );
  expect(demand.ok(), `subscription request refused: ${await demand.text()}`).toBeTruthy();

  return {
    api,
    plan,
  };
};

test("Mes demandes en cours montre ce qu'attend une demande et l'annule seulement après confirmation", async ({
  page,
}) => {
  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  const { api, plan } = await demandAwaitingValidation(page);

  await page.goto('/vendeurs/settings/dashboard');
  const demandRow = page.getByRole('listitem', { name: `${api.name} - ${plan.customName}` });
  await expect(demandRow).toContainText('En attente de validation');
  await expect(demandRow.getByRole('button', { name: 'Reprendre le paiement' })).toHaveCount(0);

  await demandRow.getByRole('button', { name: 'Annuler' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();
  await expect(demandRow).toBeVisible();

  await demandRow.getByRole('button', { name: 'Annuler' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ok' }).click();
  await expect(demandRow).toHaveCount(0);
  await expect(page.getByText('Aucune demande en cours. Vos demandes de souscription')).toBeVisible();
});

test("Demandes en cours côté producteur montre l'étape attendue et la relance", async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  const { api, plan } = await demandAwaitingValidation(page);
  await logout(page);
  await loginAs(MICHAEL, page);

  await page.goto('/api-division/settings/dashboard');
  await page.getByRole('button', { name: 'Producteur' }).click();
  const receivedRow = page.getByRole('listitem', {
    name: `Vendeurs - ${api.name} - ${plan.customName}`,
  });
  await expect(receivedRow).toContainText('Validation par API Division');

  await receivedRow.getByRole('button', { name: "Relancer l'étape" }).click();
  await expect(page.getByText("L'étape a été relancée.")).toBeVisible();
});
