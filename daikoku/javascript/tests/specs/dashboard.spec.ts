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
    await page.getByRole('button', { name: 'Utiliser l\'interface précédente' }).click();
    await expect(
      page.getByRole('heading', { name: 'Choisir les plans et les trousseaux' })
    ).toBeVisible();
    const modal = page.getByRole('dialog');
    await modal.getByRole('button', { name: 'Sélectionner Batch UI plan sur les APIs' }).click();

    const keyringSelect = page.getByRole('combobox', { name: 'Trousseau pour Batch UI plan' });
    await expect(keyringSelect).toHaveCount(1);
    await expect(keyringSelect).toBeEnabled();
    const keyringName = page.getByRole('textbox', {
      name: 'Nom du nouveau trousseau pour Batch UI plan',
    });
    if (reuseExistingKeyring) {
      await keyringSelect.selectOption({ label: 'Existing environment keyring' });
      await expect(keyringName).toBeHidden();
    } else {
      await keyringName.fill('Shared batch UI keyring');
    }

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

    await modal.getByRole('button', { name: 'Envoyer la demande groupée' }).click();
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
  await page.getByRole('button', { name: 'Utiliser l\'interface précédente' }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByRole('checkbox', { name: 'Available dev', exact: true })).toHaveCount(2);
  await expect(modal.getByRole('checkbox', { name: 'Pending batch plan' })).toHaveCount(0);
  await expect(modal.getByRole('checkbox', { name: 'Unauthorized plan' })).toHaveCount(0);
  await modal.getByRole('button', { name: 'Sélectionner Available dev sur les APIs' }).click();
  let payload: ISubscriptionBatchSubmission | undefined;
  await page.route(/\/api\/subscription\/team\/[^/]+\/batches$/, (route) => {
    payload = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { batch: 'availability-test', state: 'pending', replayed: false } });
  });
  await modal.getByRole('button', { name: 'Envoyer la demande groupée' }).click();
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
    await expect(page.getByRole('heading', { name: 'Organiser vos trousseaux' })).toBeVisible();
    await expect(page.getByRole('region', { name: availableName })).toBeVisible();
  }

  async function createFolder(page: import('@playwright/test').Page, name: string) {
    await page.getByRole('button', { name: 'Créer un trousseau', exact: true }).click();
    await page.getByRole('textbox', { name: 'Nom du trousseau', exact: true }).last().fill(name);
    return page.getByRole('region', { name, exact: true });
  }

  async function moveSelection(page: import('@playwright/test').Page, destination: string) {
    await page.getByRole('combobox', { name: 'Trousseau de destination' }).selectOption({ label: destination });
    await page.getByRole('button', { name: 'Déplacer la sélection', exact: true }).click();
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

    const second = await createFolder(page, 'Separate workspace');
    await first.getByRole('checkbox', { name: `Sélectionner ${label(0)}`, exact: true }).check();
    await moveSelection(page, 'Separate workspace');
    await expect(first.getByRole('checkbox')).toHaveCount(1);
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
    await second.getByRole('button', { name: `Retirer ${label(0)} du trousseau`, exact: true }).click();
    await expect(available.getByRole('checkbox')).toHaveCount(2);
    await available.getByRole('checkbox', { name: `Sélectionner ${label(0)}`, exact: true }).check();
    await moveSelection(page, 'Separate workspace');
    await page.getByRole('button', { name: 'Retirer le dossier Separate workspace', exact: true }).click();
    await expect(available.getByRole('checkbox')).toHaveCount(2);
    await expect(second).toHaveCount(0);
    await createFolder(page, 'Empty omitted');
    await first.getByRole('textbox', { name: 'Nom du trousseau', exact: true }).fill('Renamed shared workspace');
    expect(submissions).toHaveLength(0);
    await page.getByRole('button', { name: submitName, exact: true }).click();
    await expect(page.getByText(/Votre demande groupée de souscription/)).toBeVisible();
    expect(submissions).toHaveLength(1);
    expect(submissions[0].newKeyrings).toEqual([{ _id: expect.any(String), customName: 'Renamed shared workspace' }]);
    expect(submissions[0].items).toEqual([{
      api: apis[1]._id,
      plan: plan._id,
      keyringChoice: { type: 'new', creation: submissions[0].newKeyrings[0]._id },
    }]);
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
    await page.getByRole('combobox', { name: 'Trousseau existant', exact: true }).selectOption('workspace-existing-keyring');
    await page.getByRole('button', { name: 'Importer le trousseau', exact: true }).click();
    const folder = page.getByRole('region', { name: 'Imported workspace', exact: true });
    await expect(folder.getByRole('textbox', { name: 'Nom du trousseau' })).toHaveCount(0);
    await page.getByRole('checkbox', { name: `Sélectionner ${apis[1].name} / ${plan.customName}`, exact: true }).check();
    await moveSelection(page, 'Imported workspace');
    await expect(folder.getByRole('checkbox')).toHaveCount(1);
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
        readonly: 'Les plans en lecture seule et en écriture ne peuvent pas partager ce trousseau.',
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
    await page.getByRole('button', { name: submitName, exact: true }).click();
    await expect(page.getByText(/Votre demande groupée de souscription/)).toBeVisible();
    expect(payloads).toHaveLength(2);
    expect(payloads[0].idempotencyKey).toEqual(expect.any(String));
    expect(payloads[1]).toEqual(payloads[0]);
  });

  test('direct URL without catalog selection offers a safe return', async ({ page }) => {
    await page.goto(ACCUEIL);
    await loginAs(MICHAEL, page);
    await page.goto(`http://localhost:${exposedPort}/apis/subscriptions/keyrings`);
    await expect(page.getByText('Choisissez des APIs et une équipe consommatrice depuis le catalogue pour organiser leurs trousseaux.')).toBeVisible();
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