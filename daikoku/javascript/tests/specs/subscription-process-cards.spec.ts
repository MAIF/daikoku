import { expect, test } from '@playwright/test';
import type { IValidationStep } from '../../src/types/api';

const process: IValidationStep[] = [
  {
    id: 'mail',
    type: 'email',
    title: 'Approval',
    emails: ['reviewer@example.org'],
    message: 'Review',
  },
  {
    id: 'http',
    type: 'httpRequest',
    title: 'Check',
    url: 'https://example.org/check',
    headers: { 'X-Source': 'portal' },
  },
  {
    id: 'form',
    type: 'form',
    title: 'Motivation',
    schema: { motivation: { type: 'string' } },
    formatter: '[[motivation]]',
    formKeysToMetadata: ['motivation'],
    info: 'Explain your request',
  },
  { id: 'admin', type: 'teamAdmin', title: 'Team approval', team: 'owner' },
  { id: 'payment', type: 'payment', title: 'Billing', thirdPartyPaymentSettingsId: 'billing' },
];

test('process input drives display, editors, reordering, deletion and saving', async ({ page }) => {
  await page.setViewportSize({ width: 2400, height: 1100 });
  await page.goto('/');
  await page.evaluate(async (steps) => {
    const load = (path: string) => import(path);
    const reactModule = await load('/node_modules/.vite/deps/react.js');
    const React = reactModule.default ?? reactModule;
    const domModule = await load('/node_modules/.vite/deps/react-dom_client.js');
    const { createRoot } = domModule.default ?? domModule;
    const { SubscriptionProcessEditor } = await load(
      '/src/components/backoffice/apis/SubscriptionProcessEditor.tsx'
    );
    const source = await (
      await fetch('/src/components/backoffice/apis/SubscriptionProcessEditor.tsx')
    ).text();
    const contextUrl = source.match(/from "([^"]*\/i18n-context\.tsx[^"]*)"/)?.[1];
    if (!contextUrl) throw new Error('Cannot resolve the editor translation context');
    const { I18nContext } = await load(contextUrl);
    const { ModalContext } = await load('/src/contexts/modalContextInstance.ts');
    const host = document.createElement('div');
    host.id = 'process-cards-test';
    host.style.cssText = 'position:fixed;inset:0;background:white;z-index:10000;overflow:auto';
    const saved = document.createElement('output');
    saved.id = 'saved-process';
    document.body.append(host, saved);
    const modal = {
      close: () => {},
      openFormModal: (config: {
        value?: IValidationStep;
        onSubmit: (data: IValidationStep & { option?: string }) => void;
      }) => {
        const value = config.value;
        if (!value) {
          config.onSubmit({
            id: 'new-mail',
            type: 'email',
            title: 'New approval',
            emails: ['new@example.org'],
            message: 'New request',
            option: 'oneOf',
          });
          return;
        }
        if (value.type === 'email') config.onSubmit({ ...value, emails: ['updated@example.org'] });
        else if (value.type === 'httpRequest')
          config.onSubmit({ ...value, url: 'https://example.org/updated' });
        else throw new Error(`Unexpected editor: ${value.type}`);
      },
      openCustomModal: (config: {
        content: { props: { saveMotivation: (data: object) => void } };
      }) => {
        config.content.props.saveMotivation({
          schema: { useCase: { type: 'string' } },
          formatter: '[[useCase]]',
          formKeysToMetadata: ['useCase'],
          info: 'Updated form',
        });
      },
    };
    createRoot(host).render(
      React.createElement(
        I18nContext.Provider,
        {
          value: { translate: (key: string) => key },
        },
        React.createElement(
          ModalContext.Provider,
          { value: modal },
          React.createElement(SubscriptionProcessEditor, {
            process: steps,
            team: 'owner',
            tenant: {
              thirdPartyPaymentSettings: [
                { _id: 'billing', name: 'Stripe billing', type: 'Stripe' },
              ],
            },
            save: async (value: IValidationStep[]) => {
              saved.textContent = JSON.stringify(value);
            },
          })
        )
      )
    );
  }, process);

  const editor = page.locator('#process-cards-test .flow-editor');
  const cards = editor.locator('.flow-editor__card');
  await expect(cards).toHaveCount(5);
  await expect(editor).toContainText('reviewer@example.org');
  await expect(editor).toContainText('https://example.org/check');
  await expect(editor).toContainText('Explain your request');
  await expect(editor).toContainText('Stripe billing');
  await expect(cards.nth(2).locator('.flow-editor__handle')).toHaveAttribute('draggable', 'false');
  await expect(cards.nth(2).getByRole('button', { name: /Supprimer/ })).toBeDisabled();
  await expect(cards.nth(4).getByRole('button', { name: 'Modifier', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'save', exact: true }).click();
  await expect(page.locator('#saved-process')).toHaveText(JSON.stringify(process));

  await cards.nth(0).getByRole('button', { name: 'Modifier', exact: true }).click();
  await expect(editor).toContainText('updated@example.org');
  await cards.nth(1).getByRole('button', { name: 'Modifier', exact: true }).click();
  await expect(editor).toContainText('https://example.org/updated');
  await cards.nth(2).getByRole('button', { name: 'Modifier', exact: true }).click();
  await expect(editor).toContainText('Updated form');

  await editor
    .locator('.flow-editor__handle')
    .first()
    .dragTo(editor.locator('.flow-editor__slot').nth(2));
  await expect(cards.first()).toContainText('https://example.org/updated');
  await cards
    .nth(1)
    .getByRole('button', { name: /Supprimer/ })
    .click();
  await expect(cards).toHaveCount(4);
  await page.getByRole('button', { name: 'save', exact: true }).click();
  const saved = JSON.parse(await page.locator('#saved-process').innerText()) as IValidationStep[];
  expect(saved.map((step) => step.id)).toEqual(['http', 'form', 'admin', 'payment']);
  expect(saved[0]).toEqual({ ...process[1], url: 'https://example.org/updated' });
  expect(saved[1]).toEqual({
    ...process[2],
    schema: { useCase: { type: 'string' } },
    formatter: '[[useCase]]',
    formKeysToMetadata: ['useCase'],
    info: 'Updated form',
  });
  expect(saved[3]).toEqual(process[4]);

  await editor
    .getByRole('button', { name: 'Ajouter une carte en position 1', exact: true })
    .click();
  const picker = editor.locator('.flow-editor__picker');
  await expect(
    picker.getByRole('button', { name: 'subscription.process.form', exact: true })
  ).toHaveCount(0);
  await expect(
    picker.getByRole('button', { name: 'subscription.process.team.admin', exact: true })
  ).toHaveCount(0);
  await expect(picker.getByRole('button', { name: 'Payment', exact: true })).toHaveCount(0);
  await picker.getByRole('button', { name: 'subscription.process.email', exact: true }).click();
  await expect(cards).toHaveCount(5);
  await expect(cards.first()).toContainText('new@example.org');
  await page.getByRole('button', { name: 'save', exact: true }).click();
  const withNewStep = JSON.parse(
    await page.locator('#saved-process').innerText()
  ) as IValidationStep[];
  expect(withNewStep[0]).toMatchObject({
    type: 'email',
    title: 'New approval',
    emails: ['new@example.org'],
    message: 'New request',
  });
  expect(withNewStep[0].id).toBeTruthy();
  expect(withNewStep.slice(1)).toEqual(saved);

  await cards
    .last()
    .locator('.flow-editor__handle')
    .dragTo(editor.locator('.flow-editor__slot').first());
  await expect(cards.first()).toContainText('Stripe billing');
  await cards
    .first()
    .getByRole('button', { name: /Supprimer/ })
    .click();
  await expect(cards).toHaveCount(4);
  await expect(editor).not.toContainText('Stripe billing');
});

test('creation preserves cancellation, email splitting and the administrator form dependency', async ({
  page,
}) => {
  await page.setViewportSize({ width: 2400, height: 1100 });
  await page.goto('/');
  await page.evaluate(async () => {
    const load = (path: string) => import(path);
    const reactModule = await load('/node_modules/.vite/deps/react.js');
    const React = reactModule.default ?? reactModule;
    const domModule = await load('/node_modules/.vite/deps/react-dom_client.js');
    const { createRoot } = domModule.default ?? domModule;
    const editorPath = '/src/components/backoffice/apis/SubscriptionProcessEditor.tsx';
    const { SubscriptionProcessEditor } = await load(editorPath);
    const source = await (await fetch(editorPath)).text();
    const contextUrl = source.match(/from "([^"]*\/i18n-context\.tsx[^"]*)"/)?.[1];
    if (!contextUrl) throw new Error('Cannot resolve the editor translation context');
    const { I18nContext } = await load(contextUrl);
    const { ModalContext } = await load('/src/contexts/modalContextInstance.ts');
    const host = document.createElement('div');
    host.id = 'process-creation-test';
    host.style.cssText = 'position:fixed;inset:0;background:white;z-index:10000;overflow:auto';
    const mount = document.createElement('div');
    const saved = document.createElement('output');
    saved.id = 'created-process';
    type PendingForm = {
      value?: IValidationStep;
      schema: Record<string, unknown>;
      onSubmit: (step: IValidationStep & { option?: string }) => void;
    };
    let pending: PendingForm | undefined;
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel pending creation';
    cancel.onclick = () => {
      pending = undefined;
    };
    const submit = document.createElement('button');
    submit.textContent = 'Submit pending creation';
    submit.onclick = () => {
      if (!pending) throw new Error('No pending creation');
      if (pending.value?.type === 'httpRequest') {
        if (!('headers' in pending.schema) || 'Headers' in pending.schema)
          throw new Error('HTTP forms must use the business headers property');
        pending.onSubmit({
          ...pending.value,
          title: 'Webhook',
          url: 'https://example.org/hook',
          headers: { 'X-Webhook': 'approval' },
        });
      } else {
        pending.onSubmit({
          type: 'email',
          id: 'ignored',
          title: 'Individual approval',
          emails: ['first@example.org', 'second@example.org'],
          message: 'Please approve',
          option: 'all',
        });
      }
      pending = undefined;
    };
    host.append(mount, saved, cancel, submit);
    document.body.append(host);
    createRoot(mount).render(
      React.createElement(
        I18nContext.Provider,
        { value: { translate: (key: string) => key } },
        React.createElement(
          ModalContext.Provider,
          {
            value: {
              close: () => {
                pending = undefined;
              },
              openFormModal: (config: PendingForm) => {
                pending = config;
              },
            },
          },
          React.createElement(SubscriptionProcessEditor, {
            process: [],
            team: 'owner',
            tenant: {},
            documentation: ({
              updateProcess,
            }: {
              updateProcess: (steps: IValidationStep[]) => void;
            }) =>
              React.createElement(
                'button',
                {
                  onClick: () =>
                    updateProcess([
                      {
                        type: 'email',
                        id: 'documented',
                        title: 'Documented process',
                        emails: ['documented@example.org'],
                        message: 'From documentation',
                      },
                    ]),
                },
                'Use documented process'
              ),
            save: async (steps: IValidationStep[]) => {
              saved.textContent = JSON.stringify(steps);
            },
          })
        )
      )
    );
  });
  const host = page.locator('#process-creation-test');
  const editor = host.locator('.flow-editor');
  const cards = editor.locator('.flow-editor__card');
  const add = async (type: string, index = 0) => {
    await editor
      .getByRole('button', { name: `Ajouter une carte en position ${index + 1}`, exact: true })
      .click();
    await editor
      .locator('.flow-editor__picker')
      .getByRole('button', { name: type, exact: true })
      .click();
  };
  await expect(cards).toHaveCount(0);
  await add('subscription.process.email');
  await expect(cards).toHaveCount(0);
  await host.getByRole('button', { name: 'Cancel pending creation' }).click();
  await expect(cards).toHaveCount(0);
  await add('subscription.process.httpRequest');
  await host.getByRole('button', { name: 'Cancel pending creation' }).click();
  await expect(cards).toHaveCount(0);

  await add('subscription.process.email');
  await host.getByRole('button', { name: 'Submit pending creation' }).click();
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('second@example.org');
  await expect(cards.nth(1)).toContainText('first@example.org');
  await add('subscription.process.httpRequest', 1);
  await expect(cards).toHaveCount(2);
  await host.getByRole('button', { name: 'Submit pending creation' }).click();
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(1)).toContainText('https://example.org/hook');

  await add('subscription.process.team.admin', 3);
  await expect(cards).toHaveCount(5);
  await expect(cards.nth(0).locator('.flow-editor__handle')).toHaveAttribute('draggable', 'false');
  await expect(cards.nth(1)).toContainText('owner');
  await expect(cards.nth(1).getByRole('button', { name: 'Modifier', exact: true })).toBeDisabled();
  await cards
    .nth(1)
    .getByRole('button', { name: /Supprimer/ })
    .click();
  await add('subscription.process.team.admin', 4);
  await expect(cards).toHaveCount(5);
  await expect(cards.nth(0)).toContainText('owner');

  await host.getByRole('button', { name: 'save', exact: true }).click();
  const saved = JSON.parse(await host.locator('#created-process').innerText()) as IValidationStep[];
  expect(saved.map((step) => step.type)).toEqual([
    'teamAdmin',
    'form',
    'email',
    'httpRequest',
    'email',
  ]);
  expect(new Set(saved.map((step) => step.id)).size).toBe(5);
  expect(saved.some((step) => 'data' in step)).toBe(false);
  expect(saved[3]).toMatchObject({ headers: { 'X-Webhook': 'approval' } });

  await host
    .getByRole('button', {
      name: 'tenant.security.account.creation.process.doc.open.aria',
      exact: true,
    })
    .click();
  await host.getByRole('button', { name: 'Use documented process' }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('documented@example.org');
});
