import { approvalProcess, expect, test } from '../fixtures/subscriptionProcess';

test('the palette explains unavailable steps without allowing duplicates', async ({
  page,
  openProcessEditor,
}) => {
  await openProcessEditor();
  const palette = page.getByRole('group', { name: 'Étapes disponibles' });

  await expect(palette.getByRole('button', { name: 'Courriel', exact: true })).toBeEnabled();
  await expect(palette.getByRole('button', { name: 'Requête HTTP', exact: true })).toBeEnabled();
  await expect(palette.getByRole('button', { name: 'Formulaire', exact: true })).toBeDisabled();
  await expect(palette.getByRole('button', { name: 'Admin. équipe', exact: true })).toBeDisabled();
  await expect(palette.getByRole('button', { name: 'Paiement', exact: true })).toBeDisabled();
  await expect(palette.getByTitle(/Une seule étape formulaire est autorisée/)).toBeVisible();
  await expect(palette.getByTitle(/configuration de facturation du plan/)).toBeVisible();
});

test('selecting a step shows insertion points and clicking elsewhere cancels', async ({
  page,
  openProcessEditor,
}) => {
  await openProcessEditor();
  const editor = page.getByRole('region', { name: 'Éditeur de processus' });
  const palette = editor.getByRole('group', { name: 'Étapes disponibles' });
  const email = palette.getByRole('button', { name: 'Courriel', exact: true });
  const insertionPoints = editor.getByRole('button', { name: /Insérer en position/ });

  await email.click();
  await expect(email).toHaveAttribute('aria-pressed', 'true');
  await expect(insertionPoints).toHaveCount(6);

  await palette.getByText('Glissez une étape', { exact: false }).click();

  await expect(email).toHaveAttribute('aria-pressed', 'false');
  await expect(insertionPoints).toHaveCount(0);
  await expect(editor.getByRole('article')).toHaveCount(5);
});

test.describe('creating a process from scratch', () => {
  test.use({ initialProcess: [] });

  test('cancelling email creation leaves the process empty', async ({
    page,
    openProcessEditor,
  }) => {
    await openProcessEditor();
    const editor = page.getByRole('region', { name: 'Éditeur de processus' });
    await editor.getByRole('button', { name: 'Courriel', exact: true }).click();
    await editor.getByRole('button', { name: 'Insérer en position 1', exact: true }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Annuler', exact: true }).click();

    await expect(editor.getByRole('article')).toHaveCount(0);
  });

  test('email creation can require approval from each recipient', async ({
    page,
    openProcessEditor,
    saveProcess,
    readSavedProcess,
  }) => {
    await openProcessEditor();
    const editor = page.getByRole('region', { name: 'Éditeur de processus' });
    await editor.getByRole('button', { name: 'Courriel', exact: true }).click();
    await editor.getByRole('button', { name: 'Insérer en position 1', exact: true }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Sujet', exact: true }).fill('Review the request');
    await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await dialog.getByRole('textbox').nth(1).fill('first@example.org');
    await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await dialog.getByRole('textbox').nth(2).fill('second@example.org');
    await dialog.getByRole('button', { name: 'all', exact: true }).click();
    await dialog.getByRole('button', { name: 'Créer', exact: true }).click();

    await expect(editor.getByRole('article')).toHaveCount(2);
    await expect(editor).toContainText('first@example.org');
    await expect(editor).toContainText('second@example.org');
    await saveProcess();
    await expect
      .poll(async () =>
        (await readSavedProcess())
          .filter((step) => step.type === 'email')
          .map((step) => step.emails)
      )
      .toEqual([['second@example.org'], ['first@example.org']]);
  });

  test('adding administrator approval also adds its required form', async ({
    page,
    openProcessEditor,
    readSavedProcess,
    saveProcess,
  }) => {
    await openProcessEditor();
    const editor = page.getByRole('region', { name: 'Éditeur de processus' });
    await editor.getByRole('button', { name: 'Admin. équipe', exact: true }).click();
    await editor.getByRole('button', { name: 'Insérer en position 1', exact: true }).click();

    await expect(editor.getByRole('article')).toHaveCount(2);
    await expect(editor.getByRole('article').nth(0)).toHaveAccessibleName('Formulaire');
    await expect(editor.getByRole('article').nth(1)).toHaveAccessibleName('Admin. équipe');
    await saveProcess();
    await expect
      .poll(async () => (await readSavedProcess()).map((step) => step.type))
      .toEqual(['form', 'teamAdmin']);
  });

  test('dragging a form from the palette inserts it after an existing HTTP step', async ({
    page,
    openProcessEditor,
    saveProcess,
    readSavedProcess,
  }) => {
    await openProcessEditor();
    const editor = page.getByRole('region', { name: 'Éditeur de processus' });

    await test.step('Create an HTTP approval step', async () => {
      await editor.getByRole('button', { name: 'Requête HTTP', exact: true }).click();
      await editor.getByRole('button', { name: 'Insérer en position 1', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('textbox', { name: 'title', exact: true }).fill('Check the request');
      await dialog
        .getByRole('textbox', { name: 'url', exact: true })
        .fill('https://example.org/check');
      await dialog.getByRole('button', { name: 'Créer', exact: true }).click();
    });

    await editor
      .getByRole('button', { name: 'Formulaire', exact: true })
      .dragTo(editor.locator('.flow-editor__slot').last());

    await expect(editor.getByRole('article')).toHaveCount(2);
    await expect(editor.getByRole('article').last()).toHaveAccessibleName('Formulaire');
    await saveProcess();
    await expect
      .poll(async () => (await readSavedProcess()).map((step) => step.type))
      .toEqual(['httpRequest', 'form']);
  });
});
