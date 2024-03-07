import { test, expect } from '@playwright/test';

const adminApikeyId = 'admin_key_client_id';
const adminApikeySecret = 'admin_key_client_secret';

test.beforeEach(async ({page}) => {
  console.log(`Running ${test.info().title}`);
  await fetch('http://localhost:9000/admin-api/state/reset', {
    method: 'POST',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  })
  .then(r => r.json())
  .then(r => console.log({r}));
})

test('join a team as external user', async ({ page }) => {
  // inviter un utilisateur
  //se connecter en tant que
  //valider la demande et la création du compte
  //verifier qu'on a acces a l'équipe
})