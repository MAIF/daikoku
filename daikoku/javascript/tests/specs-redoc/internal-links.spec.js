import { expect, test } from '@playwright/test';

test('an internal OpenAPI link scrolls to the target operation', async ({ page }) => {
  await page.goto('/tests/fixtures/redoc/index.html');

  const target = page.locator('[id="operation/listUsersV2"]').first();
  await expect(target).toBeVisible();
  await page.getByRole('link', { name: 'the new operation' }).click();

  await expect(page).toHaveURL(/#operation\/listUsersV2$/);
  await expect
    .poll(() => target.evaluate((element) => element.getBoundingClientRect().top))
    .toBeLessThan(150);

  await page.getByRole('link', { name: 'the old operation' }).click();
  await expect(page).toHaveURL(/#operation\/listUsers$/);
  const oldTarget = page.locator('[id="operation/listUsers"]').first();
  await expect
    .poll(() => oldTarget.evaluate((element) => element.getBoundingClientRect().top))
    .toBeLessThan(150);

  await page.getByRole('link', { name: 'the new operation' }).click();
  await expect(page).toHaveURL(/#operation\/listUsersV2$/);
  await expect
    .poll(() => target.evaluate((element) => element.getBoundingClientRect().top))
    .toBeLessThan(150);
});
