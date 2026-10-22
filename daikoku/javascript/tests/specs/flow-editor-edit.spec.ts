import { expect, test } from '@playwright/test';

test('card-specific editors take precedence, with an optional global fallback', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const load = (path: string) => import(path);
    const reactModule = await load('/node_modules/.vite/deps/react.js');
    const React = reactModule.default ?? reactModule;
    const domModule = await load('/node_modules/.vite/deps/react-dom_client.js');
    const { createRoot } = domModule.default ?? domModule;
    const { FlowEditor } = await load('/src/modules/flow-editor/FlowEditor.tsx');
    const host = document.createElement('div');
    host.id = 'flow-edit-test';
    host.style.cssText = 'position:fixed;inset:0;background:white;z-index:10000;overflow:auto';
    document.body.append(host);
    const record = (kind: string, data: { title: string }, id: string) => {
      const output = document.createElement('output');
      output.textContent = `${kind}:${id}:${data.title}`;
      host.append(output);
    };
    const definition = {
      label: 'Mail',
      Content: ({ data }: { data: { title: string } }) =>
        React.createElement('p', null, data.title),
    };
    const root = createRoot(host);
    root.render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(FlowEditor, {
          value: [
            { id: 'mail', type: 'Mail', title: 'Existing mail' },
            { id: 'fallback', type: 'Fallback', title: 'Fallback mail' },
          ],
          onChange: () => {},
          onAdd: (type: string, index: number) => record('add', { title: type }, String(index)),
          onEdit: (card: { id: string; title: string }) => record('global', card, card.id),
          cardTypes: {
            Mail: {
              ...definition,
              onEdit: (card: { id: string; title: string }) => record('mail', card, card.id),
            },
            Fallback: { ...definition, label: 'Fallback' },
          },
          start: 'Start',
          end: 'End',
        }),
        React.createElement(FlowEditor, {
          value: [{ id: 'readonly', type: 'Mail', title: 'No editor' }],
          onChange: () => {},
          onAdd: () => {},
          cardTypes: { Mail: definition },
          start: 'Start',
          end: 'End',
        })
      )
    );
  });

  const host = page.locator('#flow-edit-test');
  const editors = host.locator('.flow-editor');
  await editors.first().getByRole('button', { name: 'Modifier', exact: true }).first().click();
  await expect(host.locator('output')).toHaveText(['mail:mail:Existing mail']);
  await editors.first().getByRole('button', { name: 'Modifier', exact: true }).nth(1).click();
  await expect(host.locator('output')).toHaveText([
    'mail:mail:Existing mail',
    'global:fallback:Fallback mail',
  ]);
  await expect(
    editors.nth(1).getByRole('button', { name: 'Modifier', exact: true })
  ).toBeDisabled();

  await editors
    .first()
    .getByRole('button', { name: 'Ajouter une carte en position 1', exact: true })
    .click();
  await editors.first().getByRole('button', { name: 'Mail', exact: true }).click();
  await expect(host.locator('output').last()).toHaveText('add:0:Mail');
  await expect(editors.first().locator('.flow-editor__card')).toHaveCount(2);
  await expect(host.locator('output')).toHaveCount(3);
});
