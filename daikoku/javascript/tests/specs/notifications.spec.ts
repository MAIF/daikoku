import { expect, test } from '@playwright/test';
import { MICHAEL, JIM, PAM } from './users';
import { ACCUEIL, adminApikeyId, adminApikeySecret, exposedPort, loginAs, otoroshiAdminApikeyId, otoroshiAdminApikeySecret, apiCommande, logistique, subCommandeProdLogistique, apiDivision } from './utils';
import otoroshi_data from '../config/otoroshi/otoroshi-state.json' with { type : "json" };
import { NotifProps, postNewNotif } from './notifications';

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

test('Voir ses notifications', async ({ page }) => {

  const senderCommande = {sender: JIM, api: apiCommande, subscription: subCommandeProdLogistique}
  const notifs: Array<NotifProps> = [
    { ...senderCommande, 
      type: "ApiAccess", 
      fromTeam: logistique , 
      team: apiDivision
    },
    { ...senderCommande, 
      type: "TransferApiOwnership", 
      team: apiDivision
    }
  ]

  await Promise.all(notifs.map(n => postNewNotif(n)))
  await page.goto(ACCUEIL);
  await loginAs(PAM, page)
  await page.getByRole('link', { name: 'API Commande' }).click();
  await page.getByText('Environnements').click();
  await page.getByRole('button', { name: 'Demander une clé d\'API' }).click();
  await page.getByText('Pam Beesly').click();
  await page.getByRole('textbox', { name: 'motivation' }).fill('motivation');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await page.getByRole('button', { name: 'Close toast' }).click();
  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();
  await loginAs(MICHAEL, page)
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  expect(page.getByRole('button', { name: 'Demandes à valider 3'})).toBeVisible
  await page.getByRole('button', { name: 'Demandes à valider' }).click();
  
  const parsedUrl = new URL(page.url());
  const params = parsedUrl.searchParams;
  const filter = JSON.parse(params.get('filter')!);
  const typeFilter = filter.find((f) => f.id === 'type');
  expect(typeFilter.value).toEqual(
    expect.arrayContaining([
      'ApiSubscription',
      'ApiAccess',
      'CheckoutForSubscription',
      'TransferApiOwnership',
      'ApiSubscriptionDemand',
    ])
  );
  expect( page.getByText('3 notifications')).toBeVisible
});
