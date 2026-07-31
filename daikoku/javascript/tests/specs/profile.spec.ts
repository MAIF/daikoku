import test, { expect } from '@playwright/test';
import { JIM } from './users';
import { adminApikeyId, adminApikeySecret, exposedPort, HOME, loginAs, otoroshiAdminApikeyId, otoroshiAdminApikeySecret } from './utils';
import otoroshi_data from '../config/otoroshi/otoroshi-state.json' with { type : "json" };

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

test("Changer la langue par défaut du profil recharge la page en anglais", async ({ page }) => {
  // Le tenant a "Fr" comme langue par défaut : l'UI démarre donc en français.
  await page.goto(HOME);
  await loginAs(JIM, page);

  await page.goto(`${HOME}me`);

  await expect(page.getByText('Langue par défaut')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeVisible();

  await page.locator('.react-form-select__input-container').click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Default language')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();

  await page.locator('.react-form-select__input-container').click();
  await page.getByRole('option', { name: 'Français', exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Langue par défaut')).toBeVisible();
});
