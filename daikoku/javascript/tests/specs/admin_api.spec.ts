import test, { expect, Locator } from '@playwright/test';
import otoroshi_data from '../config/otoroshi/otoroshi-state.json';
import { DWIGHT, IUser, JIM, MICHAEL } from './users';
import { ACCUEIL, adminApikeyId, adminApikeySecret, exposedPort, loginAs, otoroshiAdminApikeyId, otoroshiAdminApikeySecret } from './utils';


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


test('[ASOAPI-10396] - Se connecter en étant membre du groupe AD Managers (maif ==> M_GRG_Gateway_API_Interne)', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page)
  
});