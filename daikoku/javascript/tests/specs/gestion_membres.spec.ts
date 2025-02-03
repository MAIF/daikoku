import { expect, Locator, test } from '@playwright/test';
import { ANDY, DWIGHT, JIM, PAM } from './users';
import { ACCUEIL, adminApikeyId, adminApikeySecret, EMAIL_UI, exposedPort, loginAs, logout } from './utils';


test.beforeEach(async () => {
  await fetch(`http://localhost:${exposedPort}/admin-api/state/reset`, {
    method: 'POST',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`
    }
  })
    .then(r => r.json())
    .then(r => console.log({ r }))
    .then(() => fetch('http://localhost:1080/api/emails', {
      method: 'DELETE'
    }))
})

test("[ASOAPI-10364] - Consulter les membres d'une équipe en tant que membre de l'équipe", async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(DWIGHT, page);
  await expect(page.getByText('Vendeurs')).toBeVisible();
  await page.getByText('Vendeurs').click();
  await page.getByText('Membres').click();
  await expect(page.getByRole('main')).toContainText(JIM.name);
  await expect(page.getByRole('main')).toContainText(DWIGHT.name);
});
test("[ASOAPI-10361] - Consulter les membres d'une équipe en tant qu'administrateur de l'équipe", async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(JIM, page)
  await expect(page.getByText('Vendeurs')).toBeVisible();
  await page.getByText('Vendeurs').click();
  await page.getByText('Membres').click();
  await expect(page.getByRole('main')).toContainText(JIM.name);
  await expect(page.getByRole('main')).toContainText(DWIGHT.name)
});

test("[ASOAPI-10360] - Ajouter une personne n'ayant pas de compte Daikoku à une équipe", async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(JIM, page)
  await expect(page.getByText('Vendeurs')).toBeVisible();
  await page.getByText('Vendeurs').click();
  await page.getByText('Membres').click();
  await page.getByRole('button', { name: 'Inviter un collaborateur' }).click();
  await page.getByPlaceholder('Email').fill(PAM.email);
  await page.getByRole('button', { name: 'Rechercher' }).click(); //todo: warning "Rechercher" is a bad label maybe change in the newer version
  await page.getByText('En attente (1)').click();
  await expect(page.getByRole('main')).toContainText(PAM.name);
  await logout(page);
  await page.goto(EMAIL_UI);
  await expect(page.getByText(PAM.email).first()).toBeVisible();
  await page.getByText('Quelqu\'un vous invite à rejoindre son équipe', { exact: true }).click();
  // todo: Why following link in mail is breaking tests
  // await page.getByRole('link', { name: 'accepter ou rejeter cette demande' }).click();
  // await page.locator('h1').filter({ hasText: 'Notifications (0)' }).waitFor({ state: 'visible' });
  await page.goto(ACCUEIL);
  await loginAs(PAM, page)
  await expect(page.getByText('Vendeurs')).not.toBeVisible();
  await page.getByRole('link', { name: 'Accès aux notifications' }).click();
  await expect(page.getByText('Jim Halpert, administrateur de Vendeurs, vous a invité a rejoindre son équipe.')).toBeVisible();
  await page.locator('.alert').filter({ hasText: 'Jim Halpert' })
    .getByLabel('Accepter').click();
  await page.getByRole('link', { name: 'Liste des APIs' }).click();
  await expect(page.getByText('Vendeurs')).toBeVisible();
});

test("[ASOAPI-10363] - Ajouter une personne n'ayant pas de compte Daikoku à une équipe", async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(JIM, page)
  await expect(page.getByText('Vendeurs')).toBeVisible();
  await page.getByText('Vendeurs').click();
  await page.getByText('Membres').click();
  await page.getByRole('button', { name: 'Inviter un collaborateur' }).click();
  await page.getByPlaceholder('Email').fill(ANDY.email);
  await page.getByRole('button', { name: 'Rechercher' }).click(); //todo: warning "Rechercher" is a bad label maybe change in the newer version
  await page.getByText('En attente (1)').click();
  await expect(page.getByRole('main')).toContainText(ANDY.name);
  await logout(page);
  await page.goto(EMAIL_UI);
  await expect(page.getByText(ANDY.email).first()).toBeVisible();
  await page.getByText('Quelqu\'un vous invite à rejoindre son équipe', { exact: true }).click();
  // todo: Why following link in mail is breaking tests
  // await page.getByRole('link', { name: 'accepter ou rejeter cette demande' }).click();
  // await page.locator('h1').filter({ hasText: 'Notifications (0)' }).waitFor({ state: 'visible' });
  await page.goto(ACCUEIL);
  await loginAs(ANDY, page)
  await expect(page.getByText('Vendeurs')).not.toBeVisible();
  await page.getByRole('link', { name: 'Accès aux notifications' }).click();
  await expect(page.getByText('Jim Halpert, administrateur de Vendeurs, vous a invité a rejoindre son équipe.')).toBeVisible();
  await page.locator('.alert').filter({ hasText: 'Jim Halpert' })
    .getByLabel('Accepter').click();
  await page.getByRole('link', { name: 'Liste des APIs' }).click();
  await expect(page.getByText('Vendeurs')).toBeVisible();
});

test("[ASOAPI-10362] - Ajouter une personne ayant un compte Daikoku à une équipe", async ({ page }) => {
  await page.goto(ACCUEIL);
  await loginAs(JIM, page)
  await expect(page.getByText('Vendeurs')).toBeVisible();
  await page.getByText('Logistique').click();
  await page.getByText('Membres').click();
  await page.getByRole('button', { name: 'Inviter un collaborateur' }).click();
  await page.getByPlaceholder('Email').fill(DWIGHT.email);
  await page.getByRole('button', { name: 'Rechercher' }).click(); //todo: warning "Rechercher" is a bad label maybe change in the newer version
  await page.getByText('En attente (1)').click();
  await expect(page.getByRole('main')).toContainText(DWIGHT.name);
  await logout(page);
  await page.goto(EMAIL_UI);
  await expect(page.getByText(DWIGHT.email).first()).toBeVisible();
  await page.getByText('Quelqu\'un vous invite à rejoindre son équipe', { exact: true }).click();
  // todo: Why following link in mail is breaking tests
  // await page.getByRole('link', { name: 'accepter ou rejeter cette demande' }).click();
  // await page.locator('h1').filter({ hasText: 'Notifications (0)' }).waitFor({ state: 'visible' });
  await page.goto(ACCUEIL);
  await loginAs(DWIGHT, page)
  await expect(page.getByText('Logistique')).not.toBeVisible();
  await page.getByRole('link', { name: 'Accès aux notifications' }).click();
  await expect(page.getByText('Jim Halpert, administrateur de Logistique, vous a invité a rejoindre son équipe.')).toBeVisible();
  await page.locator('.alert').filter({ hasText: 'Jim Halpert' })
    .getByLabel('Accepter').click();
  await page.getByRole('link', { name: 'Liste des APIs' }).click();
  await expect(page.getByText('Logistique')).toBeVisible();
});

test("[ASOAPI-10365/10367] - Modifier les droits d'un utilisateur", async ({ page }) => {
  const getDwightAvatar = (): Locator => {
    return page.locator(".avatar-with-action__infos", { hasText: DWIGHT.name })
  }

  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  await expect(page.getByText('Vendeurs')).toBeVisible();
  await page.getByText('Vendeurs').click();
  await page.getByText('Membres').click();
  await expect(page.getByRole('main')).toContainText(DWIGHT.name);

  await getDwightAvatar().isVisible();
  await expect(getDwightAvatar().locator("i.fa-shield-alt")).not.toBeVisible();

  await page.locator('.avatar-with-action', { hasText: new RegExp(DWIGHT.name) })
    .locator(".container")
    .hover();

  await page.locator('.avatar-with-action', { hasText: new RegExp(DWIGHT.name) })
    .locator('span.avatar-with-action__action[data-tooltip-content="Gérer les autorisations"]')
    .click();
  await page.locator('.avatar-with-action', { hasText: new RegExp(DWIGHT.name) })
    .locator('span.avatar-with-action__action[data-tooltip-content="Ajouter les droits d\'admin."]')
    .click();

  await getDwightAvatar().isVisible();
  await expect(getDwightAvatar().locator("i.fa-shield-alt")).toBeVisible();

  //todo: tester avec l'api d'admin ?

  await page.locator('.avatar-with-action', { hasText: new RegExp(DWIGHT.name) })
    .locator(".container")
    .hover();

  await page.locator('.avatar-with-action', { hasText: new RegExp(DWIGHT.name) })
    .locator('span.avatar-with-action__action[data-tooltip-content="Gérer les autorisations"]')
    .click();
  await page.locator('.avatar-with-action', { hasText: new RegExp(DWIGHT.name) })
    .locator('span.avatar-with-action__action[data-tooltip-content="Supprimer les droits d\'admin."]')
    .click();

  await getDwightAvatar().isVisible();
  await expect(getDwightAvatar().locator("i.fa-shield-alt")).not.toBeVisible();
});

test("[ASOAPI-10366] - Supprimer un membre d'une équipe", async ({ page }) => {
  // const getDwightAvatar = (): Locator =>  {
  //   return page.locator(".avatar-with-action__infos", { hasText: DWIGHT.name });
  // }

  await page.goto(ACCUEIL);
  await loginAs(JIM, page);
  await expect(page.getByText('Vendeurs')).toBeVisible();
  await page.getByText('Vendeurs').click();
  await page.getByText('Membres').click();
  await expect(page.getByRole('main')).toContainText(DWIGHT.name);

  await page.locator(".avatar-with-action__infos", { hasText: DWIGHT.name }).isVisible();
  await expect(page.locator(".avatar-with-action__infos", { hasText: DWIGHT.name }).locator("i.fa-shield-alt")).not.toBeVisible();

  await page.locator('.avatar-with-action', { hasText: new RegExp(DWIGHT.name) })
    .locator(".container")
    .hover();

  await page.locator('.avatar-with-action', { hasText: new RegExp(DWIGHT.name) })
    .locator('span.avatar-with-action__action[data-tooltip-content="Supprimer le membre"]')
    .click();

  await expect(page.locator('.modal h5')).toContainText('Confirmation');
  await page.getByRole('button', { name: 'Ok' }).click();
  await page.waitForResponse(response => response.url().includes('/members/1AJMQB27BOOSQJC9xeUEwgDJNC5xuUq4') && response.status() === 200)

  await expect(page.locator(".avatar-with-action__infos", { hasText: DWIGHT.name })).toBeHidden();

  //todo: testere  aussi vie l'api d'admin ?
});
