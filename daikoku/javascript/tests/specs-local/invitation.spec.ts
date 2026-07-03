import { expect, test } from '@playwright/test';
import { MICHAEL, ROBERT } from './users';
import {
  EMAIL_UI, adminApikeyId, adminApikeySecret, exposedPort,
  findAndGoToTeam, loginLocalAs, resetState, tenant
} from './utils';

/**
 * Regression test for #1073.
 *
 * Same scenario as the "[Local]" test in specs/gestion_membres.spec.ts, but on a
 * **private** Local tenant (daikoku_state_local.ndjson has `isPrivate: true`).
 *
 * An unknown-of-Daikoku user is invited to a team and receives a mail with a
 * `/informations?invitation-token=...` link. The page validates the token via
 * `POST /api/me/invitation/_check` (an unauthenticated endpoint). Before #1073
 * that endpoint used `DaikokuActionMaybeWithGuest`, which answered
 * "This tenant is private, bye bye." on a private tenant — the invited user could
 * never reach the join/sign-up UI. It now uses `DaikokuUnauthenticatedAction` and
 * the flow goes through.
 */
test.beforeEach(async () => {
  await resetState();
});

test("[#1073] Inviter un inconnu dans une équipe d'un tenant local privé", async ({ page, browser }) => {
  // Configure the account-creation (sign-up) workflow and give the inviting admin
  // a local password (the seeded user comes from an LDAP origin in the state).
  await fetch(`http://localhost:${exposedPort}/admin-api/tenants/${tenant}`, {
    method: 'PATCH',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      {
        "op": "replace",
        "path": "/accountCreationProcess",
        "value": [
          {
            "id": "09SAW0n8fKWl7BQB17iGw8IlYRjupWcp",
            "type": "form",
            "title": "form",
            "schema": {
              "name": {
                "type": "string",
                "label": "Name",
                "constraints": [
                  { "type": "required", "message": "Your name is required" }
                ]
              },
              "email": {
                "type": "string",
                "label": "Email",
                "constraints": [
                  { "type": "required", "message": "Your email is required" },
                  { "type": "email", "message": "Your email needs to be an email" }
                ]
              },
              "password": {
                "type": "string",
                "label": "Password",
                "format": "password",
                "name": "signup_password",
                "constraints": [
                  { "type": "required", "message": "Your password is required" },
                  {
                    "type": "matches",
                    "regexp": "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[#$^+=!*()@%&]).{8,1000}$",
                    "message": "Votre mot de passe doit avoir 8 lettres min. et contenir au moins une lettre capitale, un nombre et un caractère spécial (#$^+=!*()@%&)."
                  }
                ]
              },
              "confirmPassword": {
                "type": "string",
                "label": "Confirm password",
                "format": "password",
                "name": "signup_confrim_password",
                "constraints": [
                  { "type": "required", "message": "a confirm password is required" },
                  {
                    "type": "oneOf",
                    "message": "confirm password and password must be equal",
                    "arrayOfValues": [{ "ref": "password" }]
                  }
                ]
              }
            },
            "formatter": ""
          },
          {
            "id": "pd9mRGdDlhLSjFTEQSPPsxWKnrQEl6To",
            "type": "email",
            "title": "confirmation email",
            "emails": ["${form.email}"],
            "message": "confirm"
          }
        ]
      }
    ])
  });

  await fetch(`http://localhost:${exposedPort}/admin-api/users/${MICHAEL.id}`, {
    method: 'PATCH',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      { "op": "replace", "path": "/password", "value": "$2a$10$/Vpj1lFN0AcCfbutd7FJwO0j1vU4X0fR6t.4vvWBqSEqtoUFFxfDG" },
      { "op": "replace", "path": "/origins/0", "value": "LOCAL" }
    ])
  });

  // The inviting admin sends an invitation to an unknown email.
  await loginLocalAs(MICHAEL, page);
  await findAndGoToTeam('API Division', page);
  await page.getByText('Membres').click();
  await page.getByRole('button', { name: 'Inviter un collaborateur' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill(ROBERT.email);
  await page.getByRole('button', { name: "Envoyer l'invitation" }).click();
  await expect(page.getByText('En attente (1)')).toBeVisible();

  // Logout, then open the invitation mail.
  const robertContext = await browser.newContext();
  const robertPage = await robertContext.newPage();

  // await page.getByRole('img', { name: 'user menu' }).click();
  // await page.getByRole('link', { name: 'Déconnexion' }).click();
  await robertPage.goto(EMAIL_UI);
  await expect(robertPage.locator('div').filter({ hasText: /^robert\.california@dundermifflin\.com$/ })).toBeVisible();
  await robertPage.getByText("Rejoindre l'équipe API Division", { exact: true }).click();

  // following the token link must reach the join modal (not "bye bye" on a private tenant).
  await robertPage.getByRole('link', { name: "Cliquez pour rejoindre l'équipe" }).click();
  await expect(robertPage.getByRole('heading', { name: 'team invitation' })).toBeVisible();
  await robertPage.getByRole('button', { name: 'Accepter' }).click();

  // Sign-up form.
  await expect(robertPage.getByRole('heading', { name: 'Inscription à Dunder Mifflin' })).toBeVisible();
  await robertPage.getByRole('textbox', { name: 'Nom' }).fill(ROBERT.name);
  await robertPage.getByRole('textbox', { name: 'Email' }).fill(ROBERT.email);
  await robertPage.getByRole('textbox', { name: 'Mot de passe', exact: true }).fill(ROBERT.password!);
  await robertPage.getByRole('textbox', { name: 'Confirmation de mot de passe' }).fill(ROBERT.password!);
  await robertPage.getByRole('button', { name: "Création d'un compte" }).click();
  await expect(robertPage.getByRole('heading', { name: 'Confirmation de votre compte' })).toBeVisible();

  // Confirm the account via the confirmation mail.
  await robertPage.goto(EMAIL_UI);
  await robertPage.getByText('Confirmez votre adresse e-mail pour activer votre compte Dunder Mifflin', { exact: true }).click();
  const page2Promise = robertPage.waitForEvent('popup');
  await robertPage.getByRole('link', { name: '👉 [Confirmer mon adresse e-' }).click();
  const page2 = await page2Promise;
  await expect(page2.getByRole('heading', { name: 'Adresse email confirmée' })).toBeVisible();

  // The new user logs in and accepts the team invitation.
  await loginLocalAs(ROBERT, page2);
  await page2.getByRole('link', { name: 'Accès aux notifications' }).click();
  await expect(page2.getByText('Vous avez été invité•e à')).toBeVisible();
  await page2.getByRole('button', { name: 'Accepter' }).click();
  await page2.getByRole('link', { name: 'Liste des APIs' }).click();
  await findAndGoToTeam('API Division', page2);
  await expect(page2.getByRole('heading', { name: 'API Division' })).toBeVisible();
});
