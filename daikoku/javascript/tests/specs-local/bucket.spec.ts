import { expect, Page, test } from '@playwright/test';
import { IUser } from './users';
import { resetState } from './utils';

const ADMIN: IUser = { email: 'admin@foo.bar', name: 'Admin' };

const GARAGE = {
  bucket: 'daikoku',
  endpoint: 'http://daikoku.s3.oto.tools:3910',
  region: 'garage',
  access: 'GK0123456789abcdef01234567',
  secret: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
};

const STEPS = {
  write: "Écriture d'un fichier de test",
  read: 'Relecture du fichier de test',
  list: 'Listing du bucket',
  delete: 'Suppression du fichier de test',
};

test.beforeEach(async () => {
  await resetState();
});

const openBucketSettings = async (page: Page) => {
  await page.goto('/auth/Local/login');
  await page.locator('input[name="username"]:visible').fill(ADMIN.email);
  await page.locator('input[name="password"]:visible').fill('password');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'));
  await page.goto('/settings/settings/bucket');
};

const fillBucketForm = async (page: Page, settings: Record<string, string>) => {
  for (const [name, value] of Object.entries(settings)) {
    await page.locator(`input[name="${name}"]`).fill(value);
  }
};

const runBucketTest = (page: Page) =>
  page.getByRole('button', { name: 'Tester la configuration' }).click();

const expectStep = (page: Page, step: string, status: string) =>
  expect(page.getByRole('listitem').filter({ hasText: step })).toContainText(status);

test('Tester la configuration du bucket avant de la sauvegarder', async ({ page }) => {
  await openBucketSettings(page);

  await fillBucketForm(page, GARAGE);
  await runBucketTest(page);
  for (const step of Object.values(STEPS)) {
    await expectStep(page, step, 'Succès');
  }

  await fillBucketForm(page, { secret: 'wrong-secret' });
  await runBucketTest(page);
  await expectStep(page, STEPS.write, 'Échec');
  for (const step of [STEPS.read, STEPS.list, STEPS.delete]) {
    await expectStep(page, step, 'Non exécuté');
  }
});
