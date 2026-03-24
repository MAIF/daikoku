import test, { expect } from '@playwright/test';
import { JIM, MICHAEL } from './users';
import { ACCUEIL, adminApikeyId, adminApikeySecret, exposedPort, loginOidcAs } from './utils';

test.beforeEach(async () => {
  await fetch(`http://localhost:${exposedPort}/admin-api/state/reset`, {
    method: 'POST',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  })
    .then(r => r.json())
});

test('Récupérer les metadatas claims "name" et "birthdate" uniquement de OIDC', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginOidcAs(MICHAEL, page)

  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Dunder Mifflin' }).click();
  await page.getByText('Authentification').click();
  await page.getByRole('textbox', { name: 'Metadata choisies' }).fill('name,  birthdate');
  await page.getByRole('button', { name: 'Save' }).click();

  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();
  await page.goto(ACCUEIL);
  await loginOidcAs(JIM, page)
  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();
  await page.goto(ACCUEIL);
  await loginOidcAs(MICHAEL, page)

  const users = await fetch(`http://localhost:${exposedPort}/admin-api/users`, {
    method: 'GET',
    headers: {
      "content-type": "application/json",
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  }).then(r => r.json())

  const michael = users[1]
  const jim = users[2]
  const metadatasMichael = await fetch(`http://localhost:${exposedPort}/admin-api/users/${michael._id}`, {
    method: 'GET',
    headers: {
      "content-type": "application/json",
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  }).then(r => r.json())
  const metadatasJim = await fetch(`http://localhost:${exposedPort}/admin-api/users/${jim._id}`, {
    method: 'GET',
    headers: {
      "content-type": "application/json",
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  }).then(r => r.json())

  await expect(metadatasMichael.metadata?.name === 'Michael Scott').toBeTruthy
  await expect(metadatasMichael.metadata?.birthdate).toBeFalsy
  await expect(metadatasJim.metadata?.name === 'Jim Halpert').toBeTruthy
  await expect(metadatasJim.metadata?.birthdate === '1978/10/01').toBeTruthy
});

test('Ne récupérer aucune metadatas claims d\'OIDC', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginOidcAs(MICHAEL, page)

  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Dunder Mifflin' }).click();
  await page.getByText('Authentification').click();
  await page.getByRole('textbox', { name: 'Metadata choisies' }).fill('');
  await page.getByRole('button', { name: 'Save' }).click();

  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();
  await page.goto(ACCUEIL);
  await loginOidcAs(JIM, page)
  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();
  await page.goto(ACCUEIL);
  await loginOidcAs(MICHAEL, page)

  const users = await fetch(`http://localhost:${exposedPort}/admin-api/users`, {
    method: 'GET',
    headers: {
      "content-type": "application/json",
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  }).then(r => r.json())

  const michael = users[1]
  const jim = users[2]
  const metadatasMichael = await fetch(`http://localhost:${exposedPort}/admin-api/users/${michael._id}`, {
    method: 'GET',
    headers: {
      "content-type": "application/json",
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  }).then(r => r.json())
  const metadatasJim = await fetch(`http://localhost:${exposedPort}/admin-api/users/${jim._id}`, {
    method: 'GET',
    headers: {
      "content-type": "application/json",
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  }).then(r => r.json())

  expect(Object.keys(metadatasMichael.metadata).length).toEqual(0)
  expect(Object.keys(metadatasJim.metadata).length).toEqual(0)
});

test('Récupérer toutes les metadatas claims que d\'OIDC', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginOidcAs(MICHAEL, page)

  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Dunder Mifflin' }).click();
  await page.getByText('Authentification').click();
  await page.getByRole('textbox', { name: 'Metadata choisies' }).fill('*');
  await page.getByRole('button', { name: 'Save' }).click();

  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();
  await page.goto(ACCUEIL);
  await loginOidcAs(JIM, page)
  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();
  await page.goto(ACCUEIL);
  await loginOidcAs(MICHAEL, page)

  const users = await fetch(`http://localhost:${exposedPort}/admin-api/users`, {
    method: 'GET',
    headers: {
      "content-type": "application/json",
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  }).then(r => r.json())

  const michael = users[1]
  const jim = users[2]
  const metadatasMichael = await fetch(`http://localhost:${exposedPort}/admin-api/users/${michael._id}`, {
    method: 'GET',
    headers: {
      "content-type": "application/json",
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  }).then(r => r.json())
  const metadatasJim = await fetch(`http://localhost:${exposedPort}/admin-api/users/${jim._id}`, {
    method: 'GET',
    headers: {
      "content-type": "application/json",
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  }).then(r => r.json())

  expect(metadatasMichael.metadata).toEqual(
    {
      sub: '1',
      name: 'Michael Scott',
      role: 'admin',
      email: 'michael.scott@dundermifflin.com'
    })
  expect(metadatasJim.metadata).toEqual(
    {
      name: 'Jim Halpert',
      birthdate: '1978/10/01',
      sub: '2',
      email: 'jim.halpert@dundermifflin.com',
      role: '["user","manager","saler"]'
    }
  )
});

test('Récupérer les metadatas claims d\'OIDC "name", puis "birthdate"', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginOidcAs(MICHAEL, page)

  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Dunder Mifflin' }).click();
  await page.getByText('Authentification').click();
  await page.getByRole('textbox', { name: 'Metadata choisies' }).fill('name');
  await page.getByRole('button', { name: 'Save' }).click();

  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();
  await page.goto(ACCUEIL);
  await loginOidcAs(JIM, page)
  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();
  await page.goto(ACCUEIL);
  await loginOidcAs(MICHAEL, page)

  const users = await fetch(`http://localhost:${exposedPort}/admin-api/users`, {
    method: 'GET',
    headers: {
      "content-type": "application/json",
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  }).then(r => r.json())

  const michael = users.filter( u => u.name === "Michael Scott")[0]
  const jim = users.filter( u => u.name === "Jim Halpert")[0]

  console.log(michael)
  console.log(jim)

  const metadatasMichael = await fetch(`http://localhost:${exposedPort}/admin-api/users/${michael._id}`, {
    method: 'GET',
    headers: {
      "content-type": "application/json",
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  }).then(r => r.json())
  const metadatasJim = await fetch(`http://localhost:${exposedPort}/admin-api/users/${jim._id}`, {
    method: 'GET',
    headers: {
      "content-type": "application/json",
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  }).then(r => r.json())
  
  expect(metadatasMichael.metadata).toEqual(
    {
      name: 'Michael Scott'
    })
  expect(metadatasJim.metadata).toEqual(
    {
      name: 'Jim Halpert'
    }
  )

  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();
  await page.goto(ACCUEIL);
  await loginOidcAs(MICHAEL, page)

  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Dunder Mifflin' }).click();
  await page.getByText('Authentification').click();
  await page.getByRole('textbox', { name: 'Metadata choisies' }).fill('birthdate');
  await page.getByRole('button', { name: 'Save' }).click();

  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();
  await page.goto(ACCUEIL);
  await loginOidcAs(JIM, page)
  await page.getByRole('button', { name: 'user menu' }).click();
  await page.getByRole('link', { name: 'Déconnexion' }).click();
  await page.goto(ACCUEIL);
  await loginOidcAs(MICHAEL, page)

  const userBis = await fetch(`http://localhost:${exposedPort}/admin-api/users`, {
    method: 'GET',
    headers: {
      "content-type": "application/json",
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  }).then(r => r.json())
  const michaelBis = userBis.filter( u => u.name === "Michael Scott")[0]
  const jimBis = userBis.filter( u => u.name === "Jim Halpert")[0]
  const metadatasMichaelBis = await (fetch(`http://localhost:${exposedPort}/admin-api/users/${michaelBis._id}`, {
    method: 'GET',
    headers: {
      "content-type": "application/json",
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  }).then(r => r.json()))

  const metadatasJimBis = await (fetch(`http://localhost:${exposedPort}/admin-api/users/${jimBis._id}`, {
    method: 'GET',
    headers: {
      "content-type": "application/json",
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  }).then(r => r.json()))
  expect(metadatasMichaelBis.metadata).toEqual(
    {
      name: 'Michael Scott'
    })
  expect(metadatasJimBis.metadata).toEqual(
    {
      name: 'Jim Halpert',
      birthdate: '1978/10/01'
    }
  )
});
