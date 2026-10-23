import { expect, test } from '../fixtures/subscriptionProcess';

test('email and HTTP cards open their own editing forms', async ({
  page,
  openProcessEditor,
  readSavedProcess,
  saveProcess,
}) => {
  await openProcessEditor();
  const editor = page.getByRole('region', { name: 'Éditeur de processus' });

  await test.step('Update the email recipient', async () => {
    await editor
      .getByRole('article', { name: 'Courriel', exact: true })
      .getByRole('button', { name: 'Modifier', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').first().fill('updated@example.org');
    await dialog.getByRole('button', { name: 'Mettre à jour', exact: true }).click();
    await expect(editor).toContainText('updated@example.org');
  });

  await test.step('Update the HTTP endpoint', async () => {
    await editor
      .getByRole('article', { name: 'Requête HTTP', exact: true })
      .getByRole('button', { name: 'Modifier', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByRole('textbox', { name: 'url', exact: true })
      .fill('https://example.org/updated');
    await dialog.getByRole('button', { name: 'Mettre à jour', exact: true }).click();
    await expect(editor).toContainText('https://example.org/updated');
  });

  await saveProcess();
  await expect
    .poll(async () => (await readSavedProcess()).find((step) => step.type === 'email'))
    .toMatchObject({ emails: ['updated@example.org'] });
  await expect
    .poll(async () => (await readSavedProcess()).find((step) => step.type === 'httpRequest'))
    .toMatchObject({ url: 'https://example.org/updated', headers: { 'X-Source': 'portal' } });
});

test('form cards open the motivation form editor', async ({ page, openProcessEditor }) => {
  await openProcessEditor();
  await page
    .getByRole('article', { name: 'Formulaire', exact: true })
    .getByRole('button', { name: 'Modifier', exact: true })
    .click();

  const dialog = page.getByRole('dialog', { name: 'Paramétrage du formulaire de motivation' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('[[motivation]]', { exact: true }).first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
});

test('moving a card changes the order saved in the process', async ({
  page,
  openProcessEditor,
  saveProcess,
  readSavedProcess,
}) => {
  await openProcessEditor();
  const editor = page.getByRole('region', { name: 'Éditeur de processus' });
  const email = editor.getByRole('article', { name: 'Courriel', exact: true });

  await email
    .getByRole('img', { name: 'Déplacer la carte 1', exact: true })
    .dragTo(editor.locator('.flow-editor__slot').nth(2));

  await expect(editor.getByRole('article').first()).toHaveAccessibleName('Requête HTTP');
  await saveProcess();
  await expect
    .poll(async () => (await readSavedProcess()).map((step) => step.id))
    .toEqual(['http', 'email', 'form', 'admin', 'payment']);
});

test('removing administrator approval makes that type available again', async ({
  page,
  openProcessEditor,
  saveProcess,
  readSavedProcess,
}) => {
  await openProcessEditor();
  const editor = page.getByRole('region', { name: 'Éditeur de processus' });
  const palette = editor.getByRole('group', { name: 'Étapes disponibles' });
  await expect(palette.getByRole('button', { name: 'Admin. équipe', exact: true })).toBeDisabled();

  await editor
    .getByRole('article', { name: 'Admin. équipe', exact: true })
    .getByRole('button', { name: /Supprimer la carte/ })
    .click();

  await expect(palette.getByRole('button', { name: 'Admin. équipe', exact: true })).toBeEnabled();
  await expect(editor.getByRole('article')).toHaveCount(4);
  await saveProcess();
  await expect
    .poll(async () => (await readSavedProcess()).map((step) => step.type))
    .toEqual(['email', 'httpRequest', 'form', 'payment']);
});

test('form cards cannot be moved or removed, and payment cards cannot be edited', async ({
  page,
  openProcessEditor,
}) => {
  await openProcessEditor();
  const editor = page.getByRole('region', { name: 'Éditeur de processus' });
  const form = editor.getByRole('article', { name: 'Formulaire', exact: true });
  const payment = editor.getByRole('article', { name: 'Paiement', exact: true });

  await expect(form.getByRole('img', { name: /Déplacer la carte/ })).toHaveAttribute(
    'draggable',
    'false'
  );
  await expect(form.getByRole('button', { name: /Supprimer la carte/ })).toBeDisabled();
  await expect(payment.getByRole('button', { name: 'Modifier', exact: true })).toBeDisabled();
});
