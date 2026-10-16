import test, { expect } from '@playwright/test';
import { addDays } from 'date-fns';
import { IApi } from '../../src/types';
import type { ISubscriptionBatchSubmission } from '../../src/types/api';
import otoroshi_data from '../config/otoroshi/otoroshi-state.json' with { type : "json" };
import { generateApi, generatePlan, saveApi, savePlan } from './apis';
import { DWIGHT, JIM, MICHAEL } from './users';
import { ACCUEIL, adminApikeyId, adminApikeySecret, apiCommande, apiDivision, apiPapier, dwightPaperSubscriptionId, exposedPort, loginAs, logout, otoroshiAdminApikeyId, otoroshiAdminApikeySecret } from './utils';


test.beforeEach(async () => {
  await Promise.all([
    fetch(`http://localhost:${exposedPort}/admin-api/state/reset`, {
      method: 'POST',
      headers: {
        "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
      }
    }),
    fetch('http://localhost:1080/api/emails', {
      method: 'DELETE'
    }),
    fetch(`http://otoroshi-api.oto.tools:8080/api/otoroshi.json`, {
      method: 'POST',
      headers: {
        "Otoroshi-Client-Id": otoroshiAdminApikeyId,
        "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
        "Host": "otoroshi-api.oto.tools",
      },
      body: JSON.stringify(otoroshi_data)
    })
  ])
})


test('Guest user can access to the dashboard', async ({ page }) => {
  await page.goto(ACCUEIL);

  await expect(page.getByRole('button', { name: 'Créer une API' })).toBeHidden();

  await expect(page.getByRole('link', { name: 'API Commande' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'API Papier' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'admin-api-tenant-default' })).toBeHidden();

  await expect(page.locator('.dashboard-tile', { hasText: 'Mes APIs' })).toBeHidden();
  await expect(page.locator('.dashboard-tile', { hasText: 'Mes clé d\'API' })).toBeHidden();
  await expect(page.locator('.dashboard-tile', { hasText: 'Demandes à valider' })).toBeHidden();
});

test('User non producer can access to the dashboard', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(DWIGHT, page)

  await expect(page.getByRole('button', { name: 'Créer une API' })).toBeVisible();

  await expect(page.getByRole('link', { name: 'API Commande' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'API Papier' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'admin-api-tenant-default' })).toBeHidden();
  await expect(page.getByRole('listitem', { name: 'API papier' }).locator('.status')).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'API papier' })).toContainText('2 souscriptions');

});

test('User producer can access to the dashboard', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(JIM, page)

  await page.getByRole('link', { name: 'API papier' }).click();
  await page.getByText('Environnements').click();
  page.getByRole('listitem', { name: 'prod' }).getByRole('button', { name: 'Demander une clé d\'API' }).click()
  await page.getByText('Vendeurs').click();
  await page.getByRole('button', { name: 'Souscrire avec un nouveau trousseau' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('textbox', { name: 'motivation' }).fill('I want it !!!');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByText('La demande de clé d\'API au')).toBeVisible();
  await logout(page)

  await loginAs(MICHAEL, page)

  await expect(page.getByRole('button', { name: 'Créer une API' })).toBeVisible();

  await expect(page.getByRole('link', { name: 'API Commande' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'API Papier' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'admin-api-tenant-default' })).toBeVisible();

  await expect(page.getByRole('listitem', { name: 'admin-api-tenant-default' }).locator('.status')).toBeVisible();
  //await expect(page.getByRole('listitem', { name: 'admin-api-tenant-default' }).locator('.status')).toContainText('1 clé active');

});

test('api list status', async ({ page }) => {

  const patchDwightKey = [
    {
      "op": "replace",
      "path": "/validUntil",
      "value": addDays(new Date(), 1).getTime()
    }
  ]

  await fetch(`http://localhost:${exposedPort}/admin-api/subscriptions/${dwightPaperSubscriptionId}`, {
    method: 'PATCH',
    headers: {
      "content-type": "application/json",
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    },
    body: JSON.stringify(patchDwightKey)
  })


  await page.goto(ACCUEIL);
  await loginAs(DWIGHT, page)


  await page.getByRole('link', { name: 'API papier' }).click();
  await page.getByText('Environnements').click();
  await page.getByRole('listitem', { name: 'prod' }).getByRole('button', { name: 'Demander une clé d\'API' }).click()
  await page.getByText('Dwight Schrute').click();
  await page.getByRole('button', { name: 'Souscrire avec un nouveau trousseau' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('textbox', { name: 'motivation' }).fill('i want it !!!!!!!');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByText('La demande de clé d\'API au')).toBeVisible();

  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();


  //  await expect(page.getByRole('listitem', { name: 'API Commande' }).locator('.status')).toContainText('1 clé active');
  //  await expect(page.getByRole('listitem', { name: 'API Papier' }).locator('.status')).toContainText('2 clés actives');
  //  await expect(page.getByRole('listitem', { name: 'API Papier' }).locator('.status')).toContainText('1 expire bientôt');
  //  await expect(page.getByRole('listitem', { name: 'API Papier' }).locator('.status')).toContainText('1 demande en attente');
});

test('api list favorite', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page)


  await page.getByRole('listitem', { name: 'admin-api-tenant-default' }).getByLabel('Ajouter cette API aux favoris').click();
  await expect(page.getByRole('listitem', { name: 'admin-api-tenant-default' })
    .getByRole('button', { name: 'retirer cette API des favoris' })).toBeVisible();

  await page.reload();

  await expect(page.getByRole('listitem').first()).toContainText('admin-api-tenant-default');
});

test('apilist pagination', async ({ page }) => {
  const apis = Array.from({ length: 25 })
    .map((_, idx) => idx.toString().padStart(2, "0"))
    .map(idx => {
      const api = generateApi()
      const updatedApi = { ...api, _tenant: api.tenant, team: apiDivision, name: `${api.name}-${idx}`, description: `${api.description}-${idx}`, smallDescription: `${api.smallDescription}-${idx}` }
      return updatedApi
    })//@ts-ignore
    .map(a => saveApi(a).then(r => r.json()))

  await Promise.all(apis)

  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page)

  await page.getByRole('button', { name: 'Page 2' }).click();
  await expect(page.getByRole('listitem', { name: 'New API-24' })).toBeVisible();
  // await page.getByRole('button', { name: 'Page 3' }).click();
  // await expect(page.getByRole('article', { name: 'New API-12' })).toBeVisible();
});

for (const reuseExistingKeyring of [false, true]) {
  test(`submits a batch using APIs selected across pages (${reuseExistingKeyring ? 'existing' : 'new'} keyring)`, async ({
    page,
  }) => {
    const plan = generatePlan({
      customName: 'Batch UI plan',
      aggregationApiKeysSecurity: true,
      allowMultipleKeys: reuseExistingKeyring,
    });
    const planResponse = await savePlan(plan);
    expect(planResponse.ok).toBeTruthy();

    const apis = Array.from({ length: 21 }, (_, idx) =>
      generateApi({
        name: `Batch UI API-${String(idx).padStart(2, '0')}`,
        smallDescription: 'API used by the batch selection UI test',
        description: 'API used by the batch selection UI test',
        possibleUsagePlans: [plan._id],
      })
    );
    const apiResponses = await Promise.all(apis.map((api) => saveApi(api)));
    expect(apiResponses.every((response) => response.ok)).toBeTruthy();

    if (reuseExistingKeyring) {
      await page.route(/\/api\/subscriptions\/teams\/[^/]+$/, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              _id: 'existing-batch-subscription',
              api: apis[0]._id,
              apiName: apis[0].name,
              plan: plan._id,
              planName: plan.customName,
              customName: null,
              keyring: {
                _id: 'existing-batch-keyring',
                customName: 'Existing environment keyring',
              },
            },
          ]),
        });
      });
    }

    await page.goto(ACCUEIL);
    await loginAs(MICHAEL, page);

    const firstPageCheckbox = page
      .getByRole('checkbox', { name: /Sélectionner l'API Batch UI API-/ })
      .first();
    await expect(firstPageCheckbox).toBeVisible();
    const firstApiLabel = await firstPageCheckbox.getAttribute('aria-label');
    await firstPageCheckbox.check();
    await expect(page.getByText('1 ligne sélectionnée', { exact: true })).toBeVisible();
    const firstApiIndex = Number(firstApiLabel?.match(/Batch UI API-(\d+)/)?.[1]);

    await page.getByRole('button', { name: 'Page 2' }).click();
    const secondPageCheckbox = page
      .getByRole('checkbox', { name: /Sélectionner l'API Batch UI API-/ })
      .first();
    await expect(secondPageCheckbox).toBeVisible();
    await expect(page.getByText('1 ligne sélectionnée', { exact: true })).toBeVisible();
    const secondApiLabel = await secondPageCheckbox.getAttribute('aria-label');
    expect(secondApiLabel).not.toBe(firstApiLabel);
    await secondPageCheckbox.check();
    await expect(page.getByText('2 lignes sélectionnées', { exact: true })).toBeVisible();
    const secondApiIndex = Number(secondApiLabel?.match(/Batch UI API-(\d+)/)?.[1]);

    await page.getByRole('button', { name: 'Souscrire aux APIs sélectionnées' }).click();
    await expect(page.getByRole('heading', { name: 'Sélectionner une équipe' })).toBeVisible();
    await page.getByRole('button', { name: MICHAEL.name, exact: true }).click();
    await expect(page.getByRole('heading', { name: "Préparer vos clés d'API" })).toBeVisible();
    const keyringName = reuseExistingKeyring ? 'Existing environment keyring' : 'Shared batch UI keyring';
    if (reuseExistingKeyring) {
      await page.getByRole('button', { name: "Importer des clés d'API", exact: true }).click();
      const importer = page.getByRole('dialog', { name: "Importer des clés d'API", exact: true });
      await importer.getByRole('checkbox', { name: 'Sélectionner la clé Existing environment keyring', exact: true }).check();
      await importer.getByRole('button', { name: 'Importer la sélection (1)', exact: true }).click();
    } else {
      await page.getByRole('button', { name: "Préparer une clé d'API", exact: true }).click();
      await page.getByRole('textbox', { name: "Nom de la clé d'API", exact: true }).fill(keyringName);
    }
    await page.getByRole('button', { name: 'Sélectionner les plans visibles', exact: true }).click();
    await page.getByRole('button', { name: keyringName, exact: true }).press('Enter');

    let submittedPayload: ISubscriptionBatchSubmission | undefined;
    await page.route(/\/api\/subscription\/team\/[^/]+\/batches$/, async (route) => {
      submittedPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          batch: { _id: 'batch-ui-test' },
          state: 'Pending',
          replayed: false,
        }),
      });
    });

    await page.getByRole('button', { name: 'Envoyer la demande groupée' }).click();
    await expect(page.getByText(/Votre demande groupée de souscription/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Souscrire aux APIs sélectionnées' })
    ).toBeHidden();
    expect(submittedPayload?.items).toHaveLength(2);
    expect(submittedPayload?.items.map((item) => item.plan)).toEqual([plan._id, plan._id]);
    expect(submittedPayload?.items.map((item) => item.api)).toEqual(
      expect.arrayContaining([apis[firstApiIndex]._id, apis[secondApiIndex]._id])
    );
    if (reuseExistingKeyring) {
      expect(submittedPayload?.newKeyrings).toEqual([]);
      expect(submittedPayload?.items.map((item) => item.keyringChoice)).toEqual([
        { type: 'existing', keyring: 'existing-batch-keyring' },
        { type: 'existing', keyring: 'existing-batch-keyring' },
      ]);
    } else {
      expect(submittedPayload?.newKeyrings).toEqual([
        { _id: expect.any(String), customName: 'Shared batch UI keyring' },
      ]);
      expect(submittedPayload?.items.map((item) => item.keyringChoice)).toEqual([
        { type: 'new', creation: submittedPayload?.newKeyrings[0]._id },
        { type: 'new', creation: submittedPayload?.newKeyrings[0]._id },
      ]);
    }
  });
}

test('only selects available plans when subscribing to an environment across APIs', async ({ page }) => {
  const dev = generatePlan({ customName: 'Available dev', aggregationApiKeysSecurity: true });
  const pending = generatePlan({ customName: 'Pending batch plan' });
  const privatePlan = generatePlan({ customName: 'Unauthorized plan', visibility: 'Private' });
  const planResponses = await Promise.all([dev, pending, privatePlan].map(savePlan));
  expect(planResponses.every((response) => response.ok)).toBe(true);
  const apis = Array.from({ length: 3 }, (_, index) => generateApi({
    name: `Plan eligibility API-${index}`,
    possibleUsagePlans: [dev._id, pending._id, privatePlan._id],
  }));
  const apiResponses = await Promise.all(apis.map(saveApi));
  expect(apiResponses.every((response) => response.ok)).toBe(true);

  await page.route(/\/api\/subscriptions\/teams\/[^/]+$/, (route) => route.fulfill({
    json: [{
      _id: 'already-subscribed',
      api: apis[0]._id,
      apiName: apis[0].name,
      plan: dev._id,
      planName: dev.customName,
      customName: null,
      keyring: { _id: 'existing-dev-keyring', customName: 'Dev keyring' },
    }],
  }));
  await page.route(/\/api\/subscription\/team\/[^/]+\/pending-plans$/, (route) => route.fulfill({
    json: apis.map((api) => ({ api: api._id, plan: pending._id })),
  }));
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  for (const api of apis) {
    await page.getByRole('checkbox', { name: `Sélectionner l'API ${api.name}`, exact: true }).check();
  }
  await page.getByRole('button', { name: 'Souscrire aux APIs sélectionnées' }).click();
  await page.getByRole('button', { name: MICHAEL.name, exact: true }).click();
  const available = page.getByRole('region', { name: 'Plans non affectés', exact: true });
  await expect(available.getByRole('checkbox', { name: /\/ Available dev$/ })).toHaveCount(2);
  await expect(available.getByRole('checkbox', { name: /Pending batch plan/ })).toHaveCount(0);
  await expect(available.getByRole('checkbox', { name: /Unauthorized plan/ })).toHaveCount(0);
  await page.getByRole('button', { name: "Préparer une clé d'API", exact: true }).click();
  await page.getByRole('textbox', { name: "Nom de la clé d'API", exact: true }).fill('Available dev');
  await available.getByRole('button', { name: 'Sélectionner les plans visibles', exact: true }).click();
  await page.getByRole('button', { name: 'Available dev', exact: true }).press('Enter');
  let payload: ISubscriptionBatchSubmission | undefined;
  await page.route(/\/api\/subscription\/team\/[^/]+\/batches$/, (route) => {
    payload = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { batch: 'availability-test', state: 'pending', replayed: false } });
  });
  await page.getByRole('button', { name: 'Envoyer la demande groupée' }).click();
  await expect(page.getByText(/Votre demande groupée de souscription/)).toBeVisible();
  expect(payload?.items.map(({ api }) => api).sort()).toEqual([apis[1]._id, apis[2]._id].sort());
  expect(payload?.items.every(({ plan }) => plan === dev._id)).toBe(true);
  expect(payload?.newKeyrings).toHaveLength(1);
});

// These browser tests exercise the workspace UI against real catalog fixtures,
// but intercept batch submission: they do not verify backend batch execution.
test.describe('keyring workspace UI', () => {
  const availableName = 'Plans non affectés';
  const submitName = 'Envoyer la demande groupée';
  const batchEndpoint = /\/api\/subscription\/team\/[^/]+\/batches$/;

  async function seedWorkspace() {
    const plan = generatePlan({
      customName: 'Workspace dev',
      aggregationApiKeysSecurity: true,
      allowMultipleKeys: true,
    });
    expect((await savePlan(plan)).ok).toBe(true);
    const apis = ['Alpha', 'Beta', 'Gamma'].map((name) => generateApi({
      name: `Workspace ${name}`,
      possibleUsagePlans: [plan._id],
    }));
    expect((await Promise.all(apis.map(saveApi))).every((response) => response.ok)).toBe(true);
    return { apis, plan };
  }

  async function openWorkspace(
    page: import('@playwright/test').Page,
    apis: ReturnType<typeof generateApi>[]
  ) {
    await page.goto(ACCUEIL);
    await loginAs(MICHAEL, page);
    for (const api of apis) {
      await page.getByRole('checkbox', { name: `Sélectionner l'API ${api.name}`, exact: true }).check();
    }
    await page.getByRole('button', { name: 'Souscrire aux APIs sélectionnées' }).click();
    await page.getByRole('button', { name: MICHAEL.name, exact: true }).click();
    await expect(page).toHaveURL(/\/apis\/subscriptions\/keyrings$/);
    await expect(page.getByRole('heading', { name: "Préparer vos clés d'API" })).toBeVisible();
    await expect(page.getByRole('region', { name: availableName })).toBeVisible();
    await expect(page.getByRole('button', { name: "Utiliser l'interface précédente", exact: true })).toHaveCount(0);
    await expect(page.getByText('Interface expérimentale', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: "Clé d'API de destination", exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Déplacer la sélection', exact: true })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: "Clé d'API existante", exact: true })).toHaveCount(0);
  }

  async function createFolder(page: import('@playwright/test').Page, name: string) {
    await page.getByRole('button', { name: "Préparer une clé d'API", exact: true }).click();
    await page.getByRole('textbox', { name: "Nom de la clé d'API", exact: true }).last().fill(name);
    return page.getByRole('region', { name, exact: true });
  }

  async function moveSelection(page: import('@playwright/test').Page, destination: string) {
    const target = page.getByRole('button', { name: destination, exact: true });
    await target.focus();
    await expect(target).toBeFocused();
    await target.press('Enter');
  }

  test('empty workspace leaves without a warning', async ({ page }) => {
    const { apis } = await seedWorkspace();
    await openWorkspace(page, apis);
    await page.getByRole('link', { name: 'Retour au catalogue', exact: true }).click();
    await expect(page).toHaveURL(/\/apis$/);
    await expect(page.getByRole('dialog', { name: 'Quitter la préparation ?', exact: true })).toHaveCount(0);
  });

  test('protects a prepared draft on internal navigation until leaving is confirmed', async ({ page }) => {
    const { apis } = await seedWorkspace();
    await openWorkspace(page, apis);
    const folder = await createFolder(page, 'Unsaved draft');
    const confirmation = page.getByRole('dialog', { name: 'Quitter la préparation ?', exact: true });
    await page.getByRole('link', { name: 'Retour au catalogue', exact: true }).click();
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByRole('button', { name: 'Rester', exact: true })).toBeFocused();
    await expect(confirmation.locator('.modal-content')).toHaveCount(1);
    await expect(page.locator('dialog')).toHaveCount(0);
    await confirmation.getByRole('button', { name: 'Rester', exact: true }).press('Enter');
    await expect(confirmation).toHaveCount(0);
    await expect(folder.getByRole('textbox', { name: "Nom de la clé d'API", exact: true })).toHaveValue('Unsaved draft');
    await page.getByRole('link', { name: 'Retour au catalogue', exact: true }).click();
    await confirmation.locator('.btn-close').click();
    await expect(confirmation).toHaveCount(0);
    await page.getByRole('link', { name: 'Retour au catalogue', exact: true }).click();
    await page.locator('.modal-backdrop').click({ position: { x: 5, y: 5 } });
    await expect(confirmation).toHaveCount(0);
    await expect(folder.getByRole('textbox', { name: "Nom de la clé d'API", exact: true })).toHaveValue('Unsaved draft');
    await page.getByRole('link', { name: 'Retour au catalogue', exact: true }).click();
    await confirmation.getByRole('button', { name: 'Quitter et perdre le brouillon', exact: true }).click();
    await expect(page).toHaveURL(/\/apis$/);
  });

  test('browser back can be cancelled without losing the draft', async ({ page }) => {
    const { apis } = await seedWorkspace();
    await openWorkspace(page, apis);
    await createFolder(page, 'Back navigation draft');
    await page.goBack();
    const confirmation = page.getByRole('dialog', { name: 'Quitter la préparation ?', exact: true });
    await expect(confirmation).toBeVisible();
    await confirmation.press('Escape');
    await expect(confirmation).toHaveCount(0);
    await expect(page).toHaveURL(/\/apis\/subscriptions\/keyrings$/);
    await expect(page.getByRole('textbox', { name: "Nom de la clé d'API", exact: true })).toHaveValue('Back navigation draft');
    await page.goBack();
    await confirmation.getByRole('button', { name: 'Quitter et perdre le brouillon', exact: true }).click();
    await expect(page).toHaveURL(/\/apis$/);
  });

  test('reload warns natively and cancelling keeps the draft', async ({ page }) => {
    const { apis } = await seedWorkspace();
    await openWorkspace(page, apis);
    await createFolder(page, 'Reload draft');
    const dialogPromise = page.waitForEvent('dialog');
    const reload = page.reload().catch(() => undefined);
    const dialog = await dialogPromise;
    expect(dialog.type()).toBe('beforeunload');
    await dialog.dismiss();
    await reload;
    await expect(page.getByRole('textbox', { name: "Nom de la clé d'API", exact: true })).toHaveValue('Reload draft');
  });

  test('wand applies immediately and undo restores the draft without server writes', async ({ page }) => {
    const { apis, plan } = await seedWorkspace();
    await openWorkspace(page, apis);
    const available = page.getByRole('region', { name: availableName, exact: true });
    const selected = available.getByRole('checkbox', {
      name: `Sélectionner ${apis[0].name} / ${plan.customName}`, exact: true,
    });
    await selected.check();
    const writes: string[] = [];
    page.on('request', (request) => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) &&
          /\/api\/(?:keyrings|subscription(?:\/|s\/))/.test(request.url())) writes.push(request.url());
    });
    await page.getByRole('button', { name: 'Répartir par environnement', exact: true }).click();
    const target = page.getByRole('region', { name: plan.customName, exact: true });
    await expect(target.getByRole('checkbox')).toHaveCount(3);
    await expect(available.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Choix nécessaires à la répartition', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Appliquer au brouillon', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Annuler la répartition', exact: true }).click();
    await expect(target).toHaveCount(0);
    await expect(available.getByRole('checkbox')).toHaveCount(3);
    await expect(selected).toBeChecked();
    await page.getByRole('button', { name: 'Répartir par environnement', exact: true }).click();
    await target.getByRole('textbox', { name: "Nom de la clé d'API", exact: true }).fill('Manually renamed');
    await expect(page.getByRole('button', { name: 'Annuler la répartition', exact: true })).toHaveCount(0);
    expect(writes).toEqual([]);
  });

  test('wand requests an inline destination only when compatible keys are ambiguous', async ({ page }) => {
    const { apis } = await seedWorkspace();
    await openWorkspace(page, apis);
    await createFolder(page, 'First destination');
    await createFolder(page, 'Second destination');
    const available = page.getByRole('region', { name: availableName, exact: true });
    await page.getByRole('button', { name: 'Répartir par environnement', exact: true }).click();
    const resolution = page.getByRole('region', { name: 'Choix nécessaires à la répartition', exact: true });
    await expect(resolution).toBeVisible();
    await expect(available.getByRole('checkbox')).toHaveCount(3);
    await resolution.getByRole('combobox', { name: 'Destination pour Workspace dev', exact: true }).selectOption({ label: 'First destination' });
    await resolution.getByRole('button', { name: 'Répartir les plans', exact: true }).click();
    await expect(resolution).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'First destination', exact: true }).getByRole('checkbox')).toHaveCount(3);
    await page.getByRole('button', { name: 'Annuler la répartition', exact: true }).click();
    await expect(available.getByRole('checkbox')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'First destination', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Second destination', exact: true })).toBeVisible();
  });

  for (const display of ['environment', 'default'] as const) {
    test(`groups available plans only in environment display: ${display}`, async ({ page }) => {
      const { apis, plan } = await seedWorkspace();
      const production = generatePlan({
        ...plan,
        _id: `${plan._id}-prod`,
        customName: 'Workspace prod',
      });
      expect((await savePlan(production)).ok).toBe(true);
      expect((await Promise.all(apis.map((api) => saveApi({
        ...api, possibleUsagePlans: [plan._id, production._id],
      })))).every((response) => response.ok)).toBe(true);
      const response = await fetch(`http://localhost:${exposedPort}/admin-api/tenants/default`, {
        method: 'PATCH',
        headers: {
          Authorization: `Basic ${btoa(adminApikeyId + ':' + adminApikeySecret)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{ op: 'replace', path: '/display', value: display }]),
      });
      expect(response.ok).toBe(true);
      await openWorkspace(page, apis);
      const available = page.getByRole('region', { name: availableName, exact: true });
      await expect(available.getByRole('checkbox')).toHaveCount(6);
      await expect(available.locator('[data-environment]')).toHaveCount(display === 'environment' ? 2 : 0);
      const environmentOrder = await available.locator('[data-environment]').evaluateAll(
        (groups) => groups.map((group) => group.getAttribute('data-environment'))
      );
      if (display === 'environment') {
        await expect(available.getByRole('heading', { name: 'Workspace dev (3)', exact: true })).toBeVisible();
        await expect(available.getByRole('heading', { name: 'Workspace prod (3)', exact: true })).toBeVisible();
      }
      const search = available.getByRole('searchbox', { name: 'Rechercher une API ou un plan' });
      await expect(available.getByRole('button', { name: /^Sélectionner Workspace .* sur les APIs$/ })).toHaveCount(0);
      if (display === 'environment') {
        const selectDev = available.getByRole('button', {
          name: 'Sélectionner tous les plans visibles de Workspace dev', exact: true,
        });
        const selectProd = available.getByRole('button', {
          name: 'Sélectionner tous les plans visibles de Workspace prod', exact: true,
        });
        await search.fill('Workspace Alpha');
        await selectDev.click();
        await expect(available.getByRole('checkbox', { checked: true })).toHaveCount(1);
        await expect(selectDev).toBeDisabled();
        await search.fill('Workspace Beta');
        await selectDev.click();
        await selectProd.click();
        await expect(page.getByText('3 plans sélectionnés', { exact: true })).toBeVisible();
        await search.clear();
        await expect(available.getByRole('checkbox', { checked: true })).toHaveCount(3);
        await selectDev.click();
        await expect(available.getByRole('checkbox', { checked: true })).toHaveCount(4);
        await selectProd.click();
        await expect(available.getByRole('checkbox', { checked: true })).toHaveCount(6);
        await page.getByRole('button', { name: 'Vider la sélection', exact: true }).click();
      } else {
        await expect(available.getByRole('button', { name: /^Sélectionner tous les plans visibles de / })).toHaveCount(0);
      }
      await search.fill('Workspace Alpha');
      await expect(available.getByRole('checkbox')).toHaveCount(2);
      if (display === 'environment') {
        await expect(available.getByRole('heading', { name: 'Workspace dev (1)', exact: true })).toBeVisible();
        await expect(available.getByRole('heading', { name: 'Workspace prod (1)', exact: true })).toBeVisible();
      }
      await available.getByRole('button', { name: 'Sélectionner les plans visibles', exact: true }).click();
      await search.fill('Workspace Beta');
      await expect(available.getByRole('checkbox', { checked: true })).toHaveCount(0);
      await expect(page.getByText('2 plans sélectionnés', { exact: true })).toBeVisible();
      await search.clear();
      await expect(available.getByRole('checkbox')).toHaveCount(6);
      await expect(available.getByRole('checkbox', { checked: true })).toHaveCount(2);
      await page.getByRole('button', { name: 'Vider la sélection', exact: true }).click();
      await createFolder(page, 'Environment order');
      await available.getByRole('checkbox', {
        name: `Sélectionner ${apis[0].name} / ${plan.customName}`, exact: true,
      }).check();
      await moveSelection(page, 'Environment order');
      expect(await available.locator('[data-environment]').evaluateAll(
        (groups) => groups.map((group) => group.getAttribute('data-environment'))
      )).toEqual(environmentOrder);
    });
  }

  test('drag, shared assignments, separate same-environment folders and reversibility', async ({ page }, testInfo) => {
    const { apis, plan } = await seedWorkspace();
    const submissions: ISubscriptionBatchSubmission[] = [];
    await page.route(batchEndpoint, async (route) => {
      submissions.push(route.request().postDataJSON());
      await route.fulfill({ status: 201, json: { batch: { _id: 'workspace-ui' }, state: 'Pending', replayed: false } });
    });
    await openWorkspace(page, apis);
    await page.reload();
    const available = page.getByRole('region', { name: availableName });
    await expect(available.getByRole('checkbox')).toHaveCount(3);
    const first = await createFolder(page, 'Shared workspace');
    const label = (index: number) => `${apis[index].name} / ${plan.customName}`;

    const handle = available.getByRole('button', { name: `Déplacer ${label(0)}`, exact: true });
    await handle.scrollIntoViewIfNeeded();
    const source = await handle.boundingBox();
    const target = await first.boundingBox();
    expect(source).not.toBeNull();
    expect(target).not.toBeNull();
    await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
    await page.mouse.down();
    await page.mouse.move(source!.x + source!.width / 2 + 12, source!.y + source!.height / 2, { steps: 3 });
    await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 20 });
    await page.mouse.up();
    await expect(first.getByRole('checkbox', { name: `Sélectionner ${label(0)}`, exact: true })).toBeVisible();
    const nextPlan = available.getByRole('checkbox', { name: `Sélectionner ${label(1)}`, exact: true });
    await nextPlan.focus();
    // PointerSensor suppresses clicks for 50ms after release; use a real-length
    // keyboard press so its synthetic click occurs after that cleanup.
    await nextPlan.press('Space', { delay: 75 });
    await expect(page.getByText('1 plans sélectionnés', { exact: true })).toBeVisible();
    await moveSelection(page, 'Shared workspace');
    await expect(first.getByRole('checkbox')).toHaveCount(2);
    await expect(first.getByText('Nouvelle clé demandée · 2 plans demandés', { exact: true })).toBeVisible();

    const second = await createFolder(page, 'Separate workspace');
    await expect(first).toHaveCount(0);
    await page.getByRole('button', { name: 'Shared workspace', exact: true }).click();
    await expect(first).toBeVisible();
    await expect(second).toHaveCount(0);
    await first.getByRole('checkbox', { name: `Sélectionner ${label(0)}`, exact: true }).check();
    await moveSelection(page, 'Separate workspace');
    await expect(second.getByRole('checkbox')).toHaveCount(1);
    await page.getByRole('button', { name: 'Shared workspace', exact: true }).click();
    await expect(first.getByRole('checkbox')).toHaveCount(1);
    await page.getByRole('button', { name: 'Separate workspace', exact: true }).click();
    await expect(second.getByRole('checkbox')).toHaveCount(1);
    const layout = await page.evaluate(() => {
      const heading = document.querySelector('.keyring-workspace h1')!;
      const ancestors: { className: string; scrollTop: number }[] = [];
      for (let element = heading.parentElement; element; element = element.parentElement) {
        element.scrollTop = 0;
        ancestors.push({ className: element.className, scrollTop: element.scrollTop });
      }
      window.scrollTo(0, 0);
      let navbar = document.querySelector('img[alt="user menu"]')?.parentElement;
      while (navbar && getComputedStyle(navbar).position !== 'fixed') {
        navbar = navbar.parentElement;
      }
      return {
        headingTop: heading.getBoundingClientRect().top,
        navbarBottom: navbar?.getBoundingClientRect().bottom,
        ancestors,
      };
    });
    console.log('Workspace layout at scroll origin:', JSON.stringify(layout));
    await page.screenshot({
      path: process.env.KEYRING_WORKSPACE_SCREENSHOT || testInfo.outputPath('keyring-workspace-populated.png'),
      fullPage: true,
    });
    await second.getByRole('button', { name: `Retirer ${label(0)} de la clé d'API`, exact: true }).click();
    await expect(available.getByRole('checkbox')).toHaveCount(2);
    await available.getByRole('checkbox', { name: `Sélectionner ${label(0)}`, exact: true }).check();
    await moveSelection(page, 'Separate workspace');
    await page.getByRole('button', { name: 'Retirer Separate workspace du brouillon', exact: true }).click();
    await expect(available.getByRole('checkbox')).toHaveCount(2);
    await expect(second).toHaveCount(0);
    await createFolder(page, 'Empty omitted');
    await page.getByRole('button', { name: 'Shared workspace', exact: true }).click();
    await first.getByRole('textbox', { name: "Nom de la clé d'API", exact: true }).fill('Renamed shared workspace');
    expect(submissions).toHaveLength(0);
    await page.getByRole('button', { name: submitName, exact: true }).click();
    await expect(page.getByText(/Votre demande groupée de souscription/)).toBeVisible();
    await expect(page).toHaveURL(/\/apis$/);
    expect(submissions).toHaveLength(1);
    expect(submissions[0].newKeyrings).toEqual([{ _id: expect.any(String), customName: 'Renamed shared workspace' }]);
    expect(submissions[0].items).toEqual([{
      api: apis[1]._id,
      plan: plan._id,
      keyringChoice: { type: 'new', creation: submissions[0].newKeyrings[0]._id },
    }]);
  });

  test('drops multiple selected plans onto a keyring row without opening it first', async ({ page }) => {
    const { apis, plan } = await seedWorkspace();
    await openWorkspace(page, apis);
    const target = await createFolder(page, 'Drop target');
    const other = await createFolder(page, 'Other workspace');
    await expect(target).toHaveCount(0);
    await expect(other).toBeVisible();
    const available = page.getByRole('region', { name: availableName });
    for (const api of apis.slice(0, 2)) {
      await available.getByRole('checkbox', {
        name: `Sélectionner ${api.name} / ${plan.customName}`, exact: true,
      }).check();
    }
    const handle = available.getByRole('button', {
      name: `Déplacer ${apis[0].name} / ${plan.customName}`, exact: true,
    });
    const row = page.getByRole('region', { name: 'Destination : Drop target', exact: true });
    await handle.scrollIntoViewIfNeeded();
    await row.scrollIntoViewIfNeeded();
    const source = await handle.boundingBox();
    const destination = await row.boundingBox();
    expect(source).not.toBeNull();
    expect(destination).not.toBeNull();
    await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
    await page.mouse.down();
    await page.mouse.move(source!.x + source!.width / 2 + 12, source!.y + source!.height / 2, { steps: 3 });
    await page.mouse.move(destination!.x + destination!.width / 2, destination!.y + destination!.height / 2, { steps: 20 });
    await page.mouse.up();
    await expect(target.getByRole('checkbox')).toHaveCount(2);
    await expect(other).toHaveCount(0);
    await expect(available.getByRole('checkbox')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Drop target', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('0 plans sélectionnés', { exact: true })).toBeVisible();
  });

  test('hides the import action when the team has no existing keys', async ({ page }) => {
    const { apis } = await seedWorkspace();
    await page.route(/\/api\/subscriptions\/teams\/[^/]+$/, (route) => route.fulfill({ json: [] }));
    await openWorkspace(page, apis);
    await expect(page.getByRole('button', { name: "Importer des clés d'API", exact: true })).toHaveCount(0);
  });

  test('imports several keys with searchable selection, cancellation and no server writes', async ({ page }) => {
    const { apis, plan } = await seedWorkspace();
    const names = ['Development keys', 'Production keys', 'Remaining keys'];
    await page.route(/\/api\/subscriptions\/teams\/[^/]+$/, (route) => route.fulfill({
      json: names.map((name, index) => ({
        _id: `import-member-${index}`,
        api: apis[index]._id,
        apiName: apis[index].name,
        plan: plan._id,
        planName: plan.customName,
        customName: null,
        keyring: { _id: `import-key-${index}`, customName: name },
      })),
    }));
    await openWorkspace(page, apis);
    const writes: string[] = [];
    page.on('request', (request) => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) &&
          /\/api\/(?:keyrings|subscription(?:\/|s\/))/.test(request.url())) writes.push(request.url());
    });
    const open = page.getByRole('button', { name: "Importer des clés d'API", exact: true });
    const modal = page.getByRole('dialog', { name: "Importer des clés d'API", exact: true });
    await open.click();
    await expect(modal.getByRole('button', { name: 'Importer la sélection (0)', exact: true })).toBeDisabled();
    await modal.getByRole('checkbox', { name: 'Sélectionner la clé Development keys', exact: true }).check();
    await modal.getByRole('searchbox').fill('Production');
    await expect(modal.getByRole('checkbox')).toHaveCount(1);
    await modal.getByRole('checkbox', { name: 'Sélectionner la clé Production keys', exact: true }).check();
    await modal.getByRole('searchbox').fill('No matching key');
    await expect(modal.getByRole('status')).toHaveText('Aucune clé ne correspond à cette recherche.');
    await expect(modal.getByRole('button', { name: 'Importer la sélection (2)', exact: true })).toBeEnabled();
    await modal.getByRole('button', { name: 'Annuler', exact: true }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.locator('.keyring-workspace__folder-select')).toHaveCount(0);
    await open.click();
    await expect(modal.getByRole('checkbox', { checked: true })).toHaveCount(0);
    await modal.getByRole('checkbox', { name: 'Sélectionner la clé Development keys', exact: true }).check();
    await modal.getByRole('searchbox').fill('Production');
    await modal.getByRole('checkbox', { name: 'Sélectionner la clé Production keys', exact: true }).check();
    await modal.getByRole('button', { name: 'Importer la sélection (2)', exact: true }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.locator('.keyring-workspace__folder-select')).toHaveCount(2);
    await open.click();
    await expect(modal.getByRole('checkbox')).toHaveCount(1);
    await modal.getByRole('checkbox', { name: 'Sélectionner la clé Remaining keys', exact: true }).check();
    await modal.getByRole('button', { name: 'Importer la sélection (1)', exact: true }).click();
    await expect(page.locator('.keyring-workspace__folder-select')).toHaveCount(3);
    await expect(open).toHaveCount(0);
    await page.getByRole('button', { name: 'Retirer Remaining keys du brouillon', exact: true }).click();
    await expect(open).toBeVisible();
    expect(writes).toEqual([]);
  });

  test('imports an existing keyring without creating or modifying it before submit', async ({ page }) => {
    const { apis, plan } = await seedWorkspace();
    await page.route(/\/api\/subscriptions\/teams\/[^/]+$/, (route) => route.fulfill({
      json: [{
        _id: 'workspace-existing-subscription',
        api: apis[0]._id,
        apiName: apis[0].name,
        plan: plan._id,
        planName: plan.customName,
        customName: null,
        keyring: { _id: 'workspace-existing-keyring', customName: 'Imported workspace' },
      }],
    }));
    const writes: string[] = [];
    page.on('request', (request) => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) &&
          /\/api\/(?:keyrings|subscription(?:\/|s\/))/.test(request.url())) writes.push(request.url());
    });
    let payload: ISubscriptionBatchSubmission | undefined;
    await page.route(batchEndpoint, (route) => {
      payload = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { batch: { _id: 'workspace-import' }, state: 'Pending', replayed: false } });
    });
    await openWorkspace(page, apis);
    await page.getByRole('button', { name: "Importer des clés d'API", exact: true }).click();
    const importer = page.getByRole('dialog', { name: "Importer des clés d'API", exact: true });
    await importer.getByRole('checkbox', { name: 'Sélectionner la clé Imported workspace', exact: true }).check();
    await importer.getByRole('button', { name: 'Importer la sélection (1)', exact: true }).click();
    const folder = page.getByRole('region', { name: 'Imported workspace', exact: true });
    await expect(folder.getByRole('textbox', { name: "Nom de la clé d'API" })).toHaveCount(0);
    await expect(folder.getByText(/^Ajouts à une clé existante ·/)).toBeVisible();
    const existingAccess = folder.locator('details');
    await expect(existingAccess.locator('summary')).toHaveText('Accès existants (1)');
    await expect(existingAccess).not.toHaveAttribute('open');
    await existingAccess.locator('summary').click();
    await expect(existingAccess.getByText(apis[0].name, { exact: true })).toBeVisible();
    await expect(existingAccess.getByText(plan.customName, { exact: true })).toBeVisible();
    await expect(existingAccess.getByRole('checkbox')).toHaveCount(0);
    await expect(existingAccess.getByRole('button')).toHaveCount(0);
    await expect(existingAccess.locator('.keyring-workspace__plan')).toHaveCount(1);
    await expect(existingAccess.locator('[data-testid="workspace-plan"]')).toHaveCount(0);
    await expect(folder.getByRole('heading', { name: 'Nouveaux accès demandés (0)', exact: true })).toBeVisible();
    await page.getByRole('checkbox', { name: `Sélectionner ${apis[1].name} / ${plan.customName}`, exact: true }).check();
    await moveSelection(page, 'Imported workspace');
    await expect(folder.getByRole('checkbox')).toHaveCount(1);
    await expect(existingAccess.locator('li')).toHaveCount(1);
    await expect(folder.getByRole('heading', { name: 'Nouveaux accès demandés (1)', exact: true })).toBeVisible();
    expect(writes).toEqual([]);
    await page.getByRole('button', { name: submitName, exact: true }).click();
    await expect(page.getByText(/Votre demande groupée de souscription/)).toBeVisible();
    expect(payload?.newKeyrings).toEqual([]);
    expect(payload?.items).toEqual([{
      api: apis[1]._id, plan: plan._id,
      keyringChoice: { type: 'existing', keyring: 'workspace-existing-keyring' },
    }]);
    expect(writes).toHaveLength(1);
  });

  for (const incompatibility of ['binding', 'readonly', 'environment'] as const) {
    test(`rejects incompatible ${incompatibility} atomically`, async ({ page }) => {
      const { apis, plan } = await seedWorkspace();
      if (incompatibility === 'binding') {
        const headers = {
          Authorization: `Basic ${btoa(adminApikeyId + ':' + adminApikeySecret)}`,
          'Content-Type': 'application/json',
        };
        const tenantResponse = await fetch(`http://localhost:${exposedPort}/admin-api/tenants/default`, { headers });
        expect(tenantResponse.ok).toBe(true);
        const tenantData = await tenantResponse.json();
        const response = await fetch(`http://localhost:${exposedPort}/admin-api/tenants/default`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify([{
            op: 'add', path: '/otoroshiSettings/-',
            value: { ...tenantData.otoroshiSettings[0], _id: 'workspace-other-otoroshi' },
          }]),
        });
        expect(response.ok).toBe(true);
      }
      if (incompatibility === 'environment') {
        const response = await fetch(`http://localhost:${exposedPort}/admin-api/tenants/default`, {
          method: 'PATCH',
          headers: {
            Authorization: `Basic ${btoa(adminApikeyId + ':' + adminApikeySecret)}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([{ op: 'replace', path: '/environmentAggregationApiKeysSecurity', value: true }]),
        });
        expect(response.ok).toBe(true);
      }
      const incompatible = generatePlan({
        ...plan,
        _id: `${plan._id}-other`,
        customName: incompatibility === 'environment' ? 'Workspace prod' : plan.customName,
        otoroshiTarget: {
          ...plan.otoroshiTarget,
          otoroshiSettings: incompatibility === 'binding' ? 'workspace-other-otoroshi' : plan.otoroshiTarget.otoroshiSettings,
          apikeyCustomization: { ...plan.otoroshiTarget.apikeyCustomization, readOnly: incompatibility === 'readonly' },
        },
      });
      expect((await savePlan(incompatible)).ok).toBe(true);
      const otherApi = generateApi({ name: 'Workspace incompatible', possibleUsagePlans: [incompatible._id] });
      expect((await saveApi(otherApi)).ok).toBe(true);
      await openWorkspace(page, [apis[0], apis[1], otherApi]);
      const folder = await createFolder(page, 'Compatible only');
      await page.getByRole('checkbox', { name: `Sélectionner ${apis[0].name} / ${plan.customName}`, exact: true }).check();
      await moveSelection(page, 'Compatible only');
      const compatibleCheckbox = page.getByRole('checkbox', { name: `Sélectionner ${apis[1].name} / ${plan.customName}`, exact: true });
      const incompatibleCheckbox = page.getByRole('checkbox', { name: `Sélectionner ${otherApi.name} / ${incompatible.customName}`, exact: true });
      await compatibleCheckbox.check();
      await incompatibleCheckbox.check();
      await moveSelection(page, 'Compatible only');
      const reasons = {
        binding: 'Ces plans ciblent des instances Otoroshi différentes.',
        readonly: "Les plans en lecture seule et en écriture ne peuvent pas partager cette clé d'API.",
        environment: 'Ces plans appartiennent à des environnements différents.',
      };
      await expect(page.getByRole('alert')).toHaveText(reasons[incompatibility]);
      await expect(folder.getByRole('checkbox')).toHaveCount(1);
      await expect(page.getByRole('region', { name: availableName }).getByRole('checkbox')).toHaveCount(2);
      await expect(compatibleCheckbox).toBeChecked();
      await expect(incompatibleCheckbox).toBeChecked();
    });
  }

  test('retries an unchanged draft with the same idempotency and folder IDs', async ({ page }) => {
    const { apis, plan } = await seedWorkspace();
    const payloads: ISubscriptionBatchSubmission[] = [];
    await page.route(batchEndpoint, async (route) => {
      payloads.push(route.request().postDataJSON());
      await route.fulfill(payloads.length === 1
        ? { status: 500, json: { error: 'Workspace temporary failure' } }
        : { status: 201, json: { batch: { _id: 'workspace-retry' }, state: 'Pending', replayed: false } });
    });
    await openWorkspace(page, apis);
    const folder = await createFolder(page, 'Retry workspace');
    await page.getByRole('checkbox', { name: `Sélectionner ${apis[0].name} / ${plan.customName}`, exact: true }).check();
    await moveSelection(page, 'Retry workspace');
    await page.getByRole('button', { name: submitName, exact: true }).click();
    await expect(page.getByText('Workspace temporary failure', { exact: true })).toBeVisible();
    await expect(folder.getByRole('checkbox')).toHaveCount(1);
    await page.getByRole('link', { name: 'Retour au catalogue', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Quitter la préparation ?', exact: true });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Rester', exact: true }).click();
    await page.getByRole('button', { name: submitName, exact: true }).click();
    await expect(page.getByText(/Votre demande groupée de souscription/)).toBeVisible();
    await expect(page).toHaveURL(/\/apis$/);
    expect(payloads).toHaveLength(2);
    expect(payloads[0].idempotencyKey).toEqual(expect.any(String));
    expect(payloads[1]).toEqual(payloads[0]);
  });

  test('direct URL without catalog selection offers a safe return', async ({ page }) => {
    await page.goto(ACCUEIL);
    await loginAs(MICHAEL, page);
    await page.goto(`http://localhost:${exposedPort}/apis/subscriptions/keyrings`);
    await expect(page.getByText("Choisissez des APIs et une équipe consommatrice depuis le catalogue pour préparer leurs clés d'API.")).toBeVisible();
    await page.getByRole('link', { name: 'Retour au catalogue', exact: true }).click();
    await expect(page).toHaveURL(/\/apis$/);
    await expect(page.getByRole('link', { name: 'API papier', exact: true })).toBeVisible();
  });
});

test.fixme('apilist display specials api', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page)

  //todo: display icon for group, admin & private/pwa

});

test('apilist display apigroups & apigroups display apilist', async ({ page }) => {

  const api = generateApi()
  const apiGroup: IApi = {
    ...api,
    _tenant: api.tenant,
    _humanReadableId: 'apigroup',
    team: apiDivision,
    name: 'apigroup',
    description: 'a brand new apigroup',
    smallDescription: `a brand new apigroup`,
    tags: [],
    categories: [],
    supportedVersions: ['1.0.0'],
    isDefault: true,
    posts: [],
    authorizedTeams: [],
    issues: [],
    issuesTags: [],
    stars: 0,
    visibility: 'Public',
    state: 'published',
    apis: [apiCommande, apiPapier],
  }
  await saveApi(apiGroup)

  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page)


  await page.getByRole('link', { name: 'apigroup' }).click();
  await expect(page.getByText('2 APIs')).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'API Commande' })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'API Papier' })).toBeVisible();
  await page.getByRole('link', { name: 'API Commande' }).click();
  await expect(page.locator('h3').filter({ hasText: 'API Commande' })).toBeVisible();

});

test('create new team', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(JIM, page)


  await page.getByRole('button', { name: 'Mes équipes' }).click();
  await expect(page.getByRole('heading', { name: 'Mes équipes' })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('link')).toHaveCount(3);
  await page.getByRole('button', { name: 'Créer une équipe' }).click();
  await page.getByRole('textbox', { name: 'Nom' }).fill('Athlead');
  await page.getByRole('textbox', { name: 'Description' }).fill('Athlead\'s team');
  await page.getByRole('textbox', { name: 'Contact de l\'équipe' }).fill('contact@athlead.com');
  await page.getByRole('button', { name: 'Créer', exact: true }).click();
  await expect(page.getByText("L'équipe Athlead a été créée avec succès")).toBeVisible();
  await page.getByRole('button', { name: 'Mes équipes' }).click();
  await expect(page.getByRole('dialog')).toContainText('Athlead');
  await page.getByRole('link', { name: 'Athlead' }).click();
  await expect(page.getByRole('heading', { name: 'Athlead' })).toBeVisible();

});