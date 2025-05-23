import test, { expect } from '@playwright/test';
import otoroshi_data from '../config/otoroshi/otoroshi-state.json';
import { JIM, MICHAEL } from './users';
import { ACCUEIL, adminApikeyId, adminApikeySecret, exposedPort, HOME, loginAs, logout, otoroshiAdminApikeyId, otoroshiAdminApikeySecret } from './utils';


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

test('[ASOAPI-10169] - anonyme - Consulter l\'offre API', async ({ page }) => {
  await page.goto(ACCUEIL);
  await expect(page.locator('h3').filter({ hasText: 'admin-api-tenant-default' })).not.toBeVisible();
  await expect(page.locator('h3').filter({ hasText: 'cms-api-tenant-default' })).not.toBeVisible();
  await expect(page.locator('h3').filter({ hasText: 'API papier' })).toBeVisible();
  await expect(page.locator('.top__container', { hasText: 'Vos équipes' })).not.toBeVisible();

  await page.getByPlaceholder('Rechercher une API...').fill('papier');
  await expect(page.getByLabel('API papier')).toBeVisible();
  await page.getByPlaceholder('Rechercher une API...').fill('paper');
  await expect(page.getByLabel('API papier')).toBeHidden();
  await expect(page.getByRole('main')).toContainText('0');
  await page.getByText('supprimer les filtres').click();
  await expect(page.getByLabel('API papier')).toBeVisible();
});

test('[ASOAPI-10151] - Consulter l\'offre API', async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  await expect(page.getByLabel('admin-api-tenant-default')).not.toBeVisible();
  await expect(page.getByLabel('cms-api-tenant-default')).not.toBeVisible();
  await expect(page.getByLabel('API papier')).toBeVisible();

  await page.getByPlaceholder('Rechercher une API...').fill('papier');
  await expect(page.getByLabel('API papier')).toBeVisible();
  await page.getByPlaceholder('Rechercher une API...').fill('paper');
  await expect(page.getByRole('main')).toContainText('0');
  await expect(page.getByLabel('API papier')).toBeHidden();
  await page.getByText('supprimer les filtres').click();
  await expect(page.getByLabel('API papier')).toBeVisible();
});

test('Utiliser les liens de redirection vers la page d\'accueil', async ({ page }) => {
  await page.goto(HOME);
  await expect(page).toHaveURL(ACCUEIL)
  await page.getByRole('heading', { name: 'API papier' }).click();
  await expect(page).not.toHaveURL(ACCUEIL)
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await expect(page).toHaveURL(ACCUEIL)
  await page.getByRole('heading', { name: 'API papier' }).click();
  await expect(page).not.toHaveURL(ACCUEIL)
  await page.getByRole('link', { name: 'Liste des APIs' }).click();
  await expect(page).toHaveURL(ACCUEIL)

  const cmspage = {
    "_id": "-",
    "body": "\n\n<!DOCTYPE html>\n<html lang=\"en\">\n\n<head>\n    <meta charset=\"UTF-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n    <meta http-equiv=\"X-UA-Compatible\" content=\"ie=edge\">\n    <title>My CMS</title>\n    <link rel=\"stylesheet\" href=\"./style.css\">\n</head>\n\n<body>\n    <main>\n        <h1>Welcome to your CMS</h1><div><a href=\"/apis\">voir les apis</a></div>\n    </main>\n</body>\n\n</html>",
    "name": "page.html",
    "path": "/",
    "tags": [],
    "exact": true,
    "_tenant": "default",
    "picture": null,
    "visible": true,
    "_deleted": false,
    "metadata": {
      "from": "cli",
      "_name": "page.html",
      "_path": "/",
      "_exact": "true",
      "_content_type": "text/html",
      "_authenticated": "false"
    },
    "forwardRef": null,
    "contentType": "text/html",
    "authenticated": false,
    "lastPublishedDate": null
  }

  await fetch(`http://localhost:${exposedPort}/admin-api/cms-pages`, {
    method: 'POST',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(cmspage)
  })


  await fetch(`http://localhost:${exposedPort}/admin-api/tenants/default`, {
    method: 'PATCH',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      {
        "op": "replace",
        "path": "/style/homePageVisible",
        "value": true
      },
      {
        "op": "replace",
        "path": "/style/homeCmsPage",
        "value": "-"
      }
    ])
  })

  await page.goto(HOME);
  await page.reload();
  await expect(page).toHaveURL(HOME)
  await page.getByRole('link', { name: 'voir les apis' }).click();
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await expect(page).toHaveURL(HOME)
  await page.getByRole('link', { name: 'voir les apis' }).click();
  await expect(page).toHaveURL(ACCUEIL)
  await page.getByRole('heading', { name: 'API papier' }).click();
  await expect(page).not.toHaveURL(HOME)
  await page.getByRole('link', { name: 'Liste des APIs' }).click();
  await expect(page).toHaveURL(ACCUEIL)
})

test('Utiliser le page d\'affichage d\'une API ', async ({ page }) => {
  //vertifier quoi est dispo pour un user normal
  //user guest
  await page.goto(HOME);
  await page.getByRole('heading', { name: 'API papier' }).click();
  await page.getByRole('navigation').getByText('Description').click();
  await expect(page.getByText('Une API pour avoir du papier')).toBeVisible();
  await page.getByRole('navigation').getByText('Environnements').click();
  await page.getByRole('listitem', { name: 'dev' }).getByRole('button', { name: 'Obtenir une clé d\'API' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Accédez à l\'API' })).toBeVisible();
  await page.getByRole('alertdialog', { name: 'Accédez à l\'API' }).getByRole('button', { name: 'Fermer' }).click();
  await page.getByRole('navigation').getByText('Questions').click();
  await expect(page.getByText('Aucun problème correspondant')).toBeVisible();

  await expect(page.getByRole('navigation').getByText('Documentation')).toBeHidden();
  await expect(page.getByRole('navigation').getByText('Spécification')).toBeHidden();
  await expect(page.getByRole('navigation').getByText('Test')).toBeHidden();
  await expect(page.getByRole('navigation').getByText('Actualités')).toBeHidden();
  await expect(page.getByRole('navigation').getByText('Souscriptions')).toBeHidden();
  await expect(page.getByRole('navigation').getByText('Clés d\'API')).toBeHidden();

  //user simple user
  await loginAs(JIM, page)
  await page.getByRole('heading', { name: 'API papier' }).click();
  await page.getByRole('navigation').getByText('Description').click();
  await expect(page.getByText('Une API pour avoir du papier')).toBeVisible();
  await page.getByRole('navigation').getByText('Environnements').click();
  await expect(page.getByRole('listitem', { name: 'dev' })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'prod' })).toBeVisible();
  await page.getByRole('navigation').getByText('Questions').click();
  await expect(page.getByText('Aucun problème correspondant')).toBeVisible();
  await page.getByRole('navigation').getByText('Clés d\'API').click();
  await expect(page.locator('.api-subscription')).toBeVisible();
  await expect(page.getByRole('navigation').getByText('Documentation')).toBeHidden();
  await expect(page.getByRole('navigation').getByText('Spécification')).toBeHidden();
  await expect(page.getByRole('navigation').getByText('Test')).toBeHidden();
  await expect(page.getByRole('navigation').getByText('Actualités')).toBeHidden();
  await expect(page.getByRole('navigation').getByText('Souscriptions')).toBeHidden();
  await logout(page)

  //user admin
  await loginAs(MICHAEL, page)
  await page.getByRole('heading', { name: 'API papier' }).click();
  await page.getByRole('navigation').getByText('Description').click();
  await expect(page.getByText('Une API pour avoir du papier')).toBeVisible();
  await page.getByRole('navigation').getByText('Environnements').click();
  await expect(page.getByRole('listitem', { name: 'dev' })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'prod' })).toBeVisible();
  await page.getByRole('navigation').getByText('Questions').click();
  await expect(page.getByText('Aucun problème correspondant')).toBeVisible();
  await page.getByRole('navigation').getByText('Clés d\'API').click();
  await expect(page.locator('.api-subscription')).toBeVisible();

  await expect(page.getByRole('navigation').getByText('Documentation')).toBeVisible();
  await expect(page.getByRole('navigation').getByText('Spécification')).toBeVisible();
  await expect(page.getByRole('navigation').getByText('Test')).toBeVisible();
  await expect(page.getByRole('navigation').getByText('Actualités')).toBeVisible();
  await expect(page.getByRole('navigation').getByText('Souscriptions')).toBeVisible();
  await logout(page);


  //=> update api to have 1swagger, 1 test & 1 doc
  await (
    fetch(`http://localhost:${exposedPort}/admin-api/pages`, {
      method: 'POST',
      headers: {
        "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "_id": "2IEVCDQZqY4uA7V7tnvEGG1qUqglZMTJ",
        "title": "New page",
        "_tenant": "default",
        "cmsPage": null,
        "content": "# PROD",
        "_deleted": false,
        "contentType": "text/markdown",
        "_humanReadableId": "2IEVCDQZqY4uA7V7tnvEGG1qUqglZMTJ",
        "remoteContentUrl": null,
        "lastModificationAt": 1743760454564,
        "remoteContentEnabled": false,
        "remoteContentHeaders": {}
      })
    })
      .then(() => fetch(`http://localhost:${exposedPort}/admin-api/posts`, {
        method: 'POST',
        headers: {
          "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          "_id": "txJnYZkHvLVedi8bji8DxxkihO1fkjo2",
          "title": "premiere publication",
          "_tenant": "default",
          "content": "salut",
          "_deleted": false,
          "_humanReadableId": "premiere-publication",
          "lastModificationAt": 1744018849171
        })
      }))
      .then(() => fetch(`http://localhost:${exposedPort}/admin-api/apis/qVJzX6DLRkHIEWHqPHgrM4gqMVyGXeDj`, {
        method: 'PATCH',
        headers: {
          "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify([
          {
            "op": "add",
            "path": "/posts/0",
            "value": "txJnYZkHvLVedi8bji8DxxkihO1fkjo2"
          }
        ])
      }))
      .then(() => fetch(`http://localhost:${exposedPort}/admin-api/usage-plans/D5gZYeWoq18w5GRdKFLwrbtARZ7c9I2o`, {
        method: 'PATCH',
        headers: {
          "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify([
          {
            "op": "replace",
            "path": "/documentation",
            "value": {
              "_id": "4ydFn5WJQQr5Ot3oCc1mME0Oe77Ipfcw",
              "pages": [
                {
                  "id": "2IEVCDQZqY4uA7V7tnvEGG1qUqglZMTJ",
                  "title": "New page",
                  "children": []
                }
              ],
              "_tenant": "default",
              "lastModificationAt": 1743760457651
            }
          },
          {
            "op": "replace",
            "path": "/testing",
            "value": {
              "auth": "Basic",
              "name": "bar",
              "config": null,
              "enabled": true,
              "password": "foo",
              "username": "bar"
            }
          },
          {
            "op": "replace",
            "path": "/swagger",
            "value": {
              "url": null,
              "content": "openapi: 3.0.3\ninfo:\n  title: API Papier - prod\n  version: 1.0.0\n  description: Liste des types de papier disponibles à l’achat\n\npaths:\n  /paper-types:\n    get:\n      summary: Liste les types de papier disponibles\n      responses:\n        '200':\n          description: Liste des papiers\n          content:\n            application/json:\n              schema:\n                type: array\n                items:\n                  type: object\n                  properties:\n                    id:\n                      type: string\n                      example: \"papier_recycle\"\n                    name:\n                      type: string\n                      example: \"Papier recyclé 90g\"\n                    price:\n                      type: number\n                      format: float\n                      example: 0.12\n                    description:\n                      type: string\n                      example: Papier écologique adapté à l’impression N&B\n        '500':\n          description: Erreur serveur\n",
              "headers": {},
              "additionalConf": null,
              "specificationType": "openapi"
            }
          }
        ])
      }))
  ); 

//user guest
await page.goto(HOME);
await page.getByRole('heading', { name: 'API papier' }).click();
await expect(page.getByRole('navigation').getByText('Description')).toBeVisible();
await expect(page.getByRole('navigation').getByText('Environnements')).toBeVisible();
await expect(page.getByRole('navigation').getByText('Documentation')).toBeHidden();
await expect(page.getByRole('navigation').getByText('Spécification')).toBeHidden();
await expect(page.getByRole('navigation').getByText('Test')).toBeHidden();
await expect(page.getByRole('navigation').getByText('Actualités')).toBeHidden();
await expect(page.getByRole('navigation').getByText('Questions')).toBeVisible();
await expect(page.getByRole('navigation').getByText('Souscriptions')).toBeHidden();
await expect(page.getByRole('navigation').getByText('Consommation')).toBeHidden();
await expect(page.getByRole('navigation').getByText('Clés d\'API')).toBeHidden();

//user simple user
await loginAs(JIM, page)
await page.getByRole('heading', { name: 'API papier' }).click();
await expect(page.getByRole('navigation').getByText('Description')).toBeVisible();
await expect(page.getByRole('navigation').getByText('Environnements')).toBeVisible();
await expect(page.getByRole('navigation').getByText('Documentation')).toBeVisible();
await expect(page.getByRole('navigation').getByText('Spécification')).toBeVisible();
await expect(page.getByRole('navigation').getByText('Test')).toBeVisible();
await expect(page.getByRole('navigation').getByText('Actualités')).toBeVisible();
await expect(page.getByRole('navigation').getByText('Questions')).toBeVisible();
await expect(page.getByRole('navigation').getByText('Souscriptions')).toBeHidden();
await expect(page.getByRole('navigation').getByText('Clés d\'API')).toBeVisible();
await logout(page)

//user admin
await loginAs(MICHAEL, page)
await page.getByRole('heading', { name: 'API papier' }).click();
await expect(page.getByRole('navigation').getByText('Description')).toBeVisible();
await expect(page.getByRole('navigation').getByText('Environnements')).toBeVisible();
await expect(page.getByRole('navigation').getByText('Documentation')).toBeVisible();
await expect(page.getByRole('navigation').getByText('Spécification')).toBeVisible();
await expect(page.getByRole('navigation').getByText('Test')).toBeVisible();
await expect(page.getByRole('navigation').getByText('Actualités')).toBeVisible();
await expect(page.getByRole('navigation').getByText('Questions')).toBeVisible();
await expect(page.getByRole('navigation').getByText('Souscriptions')).toBeVisible();
await expect(page.getByRole('navigation').getByText('Clés d\'API')).toBeVisible();
})