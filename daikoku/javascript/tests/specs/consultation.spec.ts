import test, { expect } from '@playwright/test';
import otoroshi_data from '../config/otoroshi/otoroshi-state.json';
import { JIM } from './users';
import { ACCUEIL, adminApikeyId, adminApikeySecret, exposedPort, HOME, loginAs, otoroshiAdminApikeyId, otoroshiAdminApikeySecret } from './utils';


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

test('CMS home page', async ({ page }) => {
  await page.goto(HOME);
  await (expect(page).toHaveURL(ACCUEIL))
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await (expect(page).toHaveURL(ACCUEIL))
  await page.getByRole('link', { name: 'Liste des APIs' }).click();
  await (expect(page).toHaveURL(ACCUEIL))

  const cmspage = {
    "_id": "-",
      "body": "\n\n<!DOCTYPE html>\n<html lang=\"en\">\n\n<head>\n    <meta charset=\"UTF-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n    <meta http-equiv=\"X-UA-Compatible\" content=\"ie=edge\">\n    <title>My CMS</title>\n    <link rel=\"stylesheet\" href=\"./style.css\">\n</head>\n\n<body>\n    <main>\n        <h1>Welcome to your CMS</h1>\n    </main>\n</body>\n\n</html>",
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

  await (fetch(`http://localhost:${exposedPort}/admin-api/cms-pages`, {
    method: 'POST',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(cmspage)
  }))


  await (fetch(`http://localhost:${exposedPort}/admin-api/tenants/default`, {
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
  }))

  await page.goto(HOME);
  await (expect(page).toHaveURL(HOME))
  await page.goto(ACCUEIL);
  await page.getByRole('link', { name: 'Accueil Daikoku' }).click();
  await (expect(page).toHaveURL(HOME))
  await page.goto(ACCUEIL);
  await page.getByRole('link', { name: 'Liste des APIs' }).click();
  await (expect(page).toHaveURL(ACCUEIL))


  //2 - with cms page
  //go to / => display cms page
  // in /apis => clik to logo => redirect to cms page
  // in a page ==> click apilist button => redirect to list
})

test('api props', ({ page }) => {
  //vertifier quoi est dispo pour un user normal
  //user "normal" -> si pas de [doc, swagger, test] -> lien non dispo
  //user "admin" -> si pas de [doc, swagger, test] -> lien dispo
  //
})