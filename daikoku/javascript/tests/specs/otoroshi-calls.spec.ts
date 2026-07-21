import { expect, Page, test } from "@playwright/test";
import {
  ACCUEIL,
  adminApikeyId,
  adminApikeySecret,
  exposedPort,
  loginAs,
  logistiqueCommandeDevApiKeyId,
  logistiqueCommandeDevApiKeySecret,
  otoroshiAdminApikeyId,
  otoroshiAdminApikeySecret,
} from "./utils";
import { MICHAEL } from "./users";
import otoroshi_data from "../config/otoroshi/otoroshi-state.json";

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await Promise.all([
    fetch(`http://localhost:${exposedPort}/admin-api/state/reset`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
      },
    }),
    fetch("http://localhost:1080/api/emails", {
      method: "DELETE",
    }),
    fetch(`http://otoroshi-api.oto.tools:8080/api/otoroshi.json`, {
      method: "POST",
      headers: {
        "Otoroshi-Client-Id": otoroshiAdminApikeyId,
        "Otoroshi-Client-Secret": otoroshiAdminApikeySecret,
        Host: "otoroshi-api.oto.tools",
      },
      body: JSON.stringify(otoroshi_data),
    }),
  ]);
});

function basicAuthHeader(env: "dev" | "prod"): string {
  if (env === "dev") {
    return (
      "Basic " +
      btoa(
        `${logistiqueCommandeDevApiKeyId}:${logistiqueCommandeDevApiKeySecret}`,
      )
    );
  } else {
    return (
      "Basic " +
      btoa(
        `${logistiqueCommandeDevApiKeyId}:${logistiqueCommandeDevApiKeySecret}`,
      )
    );
  }
}

async function extendCommandDevKeyringToPapierDev(page: Page) {
  const authHeader = basicAuthHeader("dev");
  // Wait for o potential otoroshi / daikoku desync to end
  await checkOtoroshiCall({
    api: "paper",
    env: "dev",
    authHeader: authHeader,
    status: 400,
  });
  await page.goto("/api-division/api-papier/1.0.0/pricing");
  await page
    .getByRole("button", { name: "Obtenir une clé d'API" })
    .nth(0)
    .click();
  await page.getByText("Logistique").click();
  await page
    .getByRole("button", { name: "Souscrire en l'ajoutant à un" })
    .click();
  await page.getByRole("button", { name: "dev API Commande · dev" }).click();
  await expect(
    page.getByText("Votre souscription a été créée avec succès"),
  ).toBeVisible();
}

test("Daikoku API key should allow to call associated route", async ({
  page,
}) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  const authHeader = basicAuthHeader("dev");
  await checkOtoroshiCall({
    api: "command",
    env: "dev",
    authHeader: authHeader,
  });
});

test("Daikoku API key should prevent calling unassociated route", async ({
  page,
}) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  const authHeader = basicAuthHeader("dev");
  await checkOtoroshiCall({
    api: "command",
    env: "prod",
    authHeader: authHeader,
    status: 400,
  });
});

test("Keyring with 2 keys should be able to call both routes", async ({
  page,
}) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await extendCommandDevKeyringToPapierDev(page);
  const authHeader = basicAuthHeader("dev");
  await checkOtoroshiCall({
    api: "paper",
    env: "dev",
    authHeader: authHeader,
    status: 200,
  });
  await checkOtoroshiCall({
    api: "command",
    env: "dev",
    authHeader: authHeader,
    status: 200,
  });
});

test("Disabling one key from keyring should prevent keyring to call associated route", async ({
  page,
}) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  await extendCommandDevKeyringToPapierDev(page);
  const authHeader = basicAuthHeader("dev");
  await checkOtoroshiCall({
    api: "paper",
    env: "dev",
    authHeader: authHeader,
    status: 200,
  });
  await page.goto("/logistique/settings/apikeys/api-commande/1.0.0");
  await page
    .getByRole("row", { name: "Activé dev API Commande:1.0.0" })
    .getByLabel("Actions de la souscription")
    .click();
  await page
    .getByRole("button", { name: "Désactiver la souscription" })
    .click();
  await expect(page.getByText("Votre souscription a été dé")).toBeVisible();

  await checkOtoroshiCall({
    api: "command",
    env: "dev",
    status: 400,
    authHeader,
  });
  await checkOtoroshiCall({
    api: "paper",
    env: "dev",
    status: 200,
    authHeader,
  });

  await page
    .getByRole("row", { name: "Désactivé dev API Commande:1." })
    .getByLabel("Actions de la souscription")
    .click();
  await page.getByRole("button", { name: "Activer la souscription" }).click();
  await expect(
    page.getByText("Votre souscription a été activée"),
  ).toBeVisible();
  await checkOtoroshiCall({
    api: "command",
    env: "dev",
    status: 200,
    authHeader,
  });
  await checkOtoroshiCall({
    api: "paper",
    env: "dev",
    status: 200,
    authHeader,
  });
});

test("Removing one key from keyring should prevent keyring to call associated route", async ({
  page,
}) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);

  const authHeader = basicAuthHeader("dev");
  await extendCommandDevKeyringToPapierDev(page);
  await checkOtoroshiCall({
    api: "paper",
    env: "dev",
    authHeader,
    status: 200,
  });
  await page.goto("logistique/settings/apikeys/api-commande/1.0.0");

  await page
    .getByRole("row", { name: "Activé dev API Commande:1.0.0" })
    .getByLabel("Actions de la souscription")
    .click();
  await page.getByRole("button", { name: "Détacher du trousseau" }).click();
  await page
    .getByRole("textbox", { name: "Pour confirmer la suppression" })
    .fill("API Commande/dev");
  await page.getByRole("button", { name: "Confirmation" }).click();
  await expect(
    page.getByText(
      "La clé d'API a correctement été détachée de son trousseau.",
    ),
  ).toBeVisible();
  await checkOtoroshiCall({
    api: "command",
    env: "dev",
    authHeader,
    status: 400,
  });
  await checkOtoroshiCall({
    api: "paper",
    env: "dev",
    authHeader,
    status: 200,
  });
});

test("Disabling keyring should prevent calling all associated routes", async ({
  page,
}) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  const authHeader = basicAuthHeader("dev");
  await extendCommandDevKeyringToPapierDev(page);
  await checkOtoroshiCall({
    api: "paper",
    env: "dev",
    authHeader,
    status: 200,
  });
  await page.goto("logistique/settings/apikeys/api-commande/1.0.0");

  await page
    .locator("button")
    .filter({
      hasText:
        "Renommer le trousseauDésactiver le trousseauRéinit. le secretSupprimer le",
    })
    .click();
  await page.getByRole("button", { name: "Désactiver le trousseau" }).click();
  await expect(page.getByText("Trousseau désactivé")).toBeVisible();
  await checkOtoroshiCall({
    api: "paper",
    env: "dev",
    authHeader,
    status: 401,
  });
  await checkOtoroshiCall({
    api: "command",
    env: "dev",
    authHeader,
    status: 401,
  });
  await page
    .locator("button")
    .filter({ hasText: "Renommer le trousseauActiver" })
    .click();
  await page.getByRole("button", { name: "Activer le trousseau" }).click();
  await expect(page.getByText("Trousseau activé")).toBeVisible();
  await checkOtoroshiCall({
    api: "paper",
    env: "dev",
    authHeader,
    status: 200,
  });
  await checkOtoroshiCall({
    api: "command",
    env: "dev",
    authHeader,
    status: 200,
  });
});

test("Removing a key from keyring should prevent calling associated route with keyring", async ({
  page,
}) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  const authHeader = basicAuthHeader("dev");
  await extendCommandDevKeyringToPapierDev(page);
  await checkOtoroshiCall({
    api: "paper",
    env: "dev",
    authHeader,
    status: 200,
  });
  await page.goto("logistique/settings/apikeys/api-commande/1.0.0");

  await page
    .getByRole("row", { name: "Activé dev API Commande:1.0.0" })
    .getByLabel("Actions de la souscription")
    .click();
  await page.getByRole("button", { name: "Détacher du trousseau" }).click();
  await page
    .getByRole("textbox", { name: "Pour confirmer la suppression" })
    .click();
  await page
    .getByRole("textbox", { name: "Pour confirmer la suppression" })
    .fill("API Commande/dev");
  await page.getByRole("button", { name: "Confirmation" }).click();
  await expect(page.getByText("La clé d'API a correctement é")).toBeVisible();
  await checkOtoroshiCall({
    api: "command",
    env: "dev",
    authHeader,
    status: 400,
  });

  await checkOtoroshiCall({
    api: "paper",
    env: "dev",
    authHeader,
    status: 200,
  });

  await page
    .getByRole("button", { name: "Copier les secrets encodés en" })
    .first()
    .click();
  const handle = await page.evaluateHandle(() =>
    navigator.clipboard.readText(),
  );
  const detachedKeyAuthHeader = await handle.jsonValue();
  await checkOtoroshiCall({
    api: "command",
    env: "dev",
    authHeader: detachedKeyAuthHeader,
    status: 200,
  });
});

test("Deleting a key from keyring should prevent calling associated route with keyring", async ({
  page,
}) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  const authHeader = basicAuthHeader("dev");
  await extendCommandDevKeyringToPapierDev(page);
  await checkOtoroshiCall({
    api: "paper",
    env: "dev",
    authHeader,
    status: 200,
  });
  await page.goto("logistique/settings/apikeys/api-commande/1.0.0");

  await page
    .getByRole("row", { name: "Activé dev API Commande:1.0.0" })
    .getByLabel("Actions de la souscription")
    .click();
  await page.getByRole("button", { name: "Supprimer" }).click();
  await page
    .getByRole("textbox", { name: "Pour confirmer la suppression" })
    .click();
  await page
    .getByRole("textbox", { name: "Pour confirmer la suppression" })
    .fill("API Commande/dev");
  await page.getByRole("button", { name: "Confirmation" }).click();
  await expect(
    page.getByText("La souscription a été correctement supprimée"),
  ).toBeVisible();
  await checkOtoroshiCall({
    api: "command",
    env: "dev",
    authHeader,
    status: 400,
  });

  await checkOtoroshiCall({
    api: "paper",
    env: "dev",
    authHeader,
    status: 200,
  });
});

test("Deleting a keyring should prevent all call using its key", async ({
  page,
}) => {
  await page.goto(ACCUEIL);
  await loginAs(MICHAEL, page);
  const authHeader = basicAuthHeader("dev");
  await extendCommandDevKeyringToPapierDev(page);
  await checkOtoroshiCall({
    api: "paper",
    env: "dev",
    authHeader,
    status: 200,
  });
  await page.goto("logistique/settings/apikeys/api-commande/1.0.0");
  await page
    .locator("button")
    .filter({
      hasText:
        "Renommer le trousseauDésactiver le trousseauRéinit. le secretSupprimer le",
    })
    .click();
  await page.getByRole("button", { name: "Supprimer le trousseau" }).click();
  await page
    .getByRole("textbox", { name: "Pour confirmer la suppression" })
    .fill("daikoku-api-key-api-commande-dev-logistique-1737452599960-1.0.0");
  await page.getByRole("button", { name: "Confirmation" }).click();
  await expect(page.getByText("Le trousseau a été supprimé")).toBeVisible();
  await checkOtoroshiCall({
    api: "command",
    env: "dev",
    authHeader,
    status: 400,
  });
  await checkOtoroshiCall({
    api: "paper",
    env: "dev",
    authHeader,
    status: 400,
  });
});

async function checkOtoroshiCall({
  api,
  env,
  status,
  authHeader,
  message,
  timeout,
}: {
  api: "command" | "paper";
  env: "dev" | "prod";
  authHeader: string;
  status?: number;
  timeout?: number;
  message?: string;
}) {
  const expectedStatus = status || 200;
  const url = `http://${env}.${api}.oto.tools:8080`;
  await expect
    .poll(
      async () => {
        const callResult = await fetch(url, {
          headers: {
            Authorization: authHeader,
          },
        });
        return callResult.status;
      },
      {
        message: message ?? `Call to ${url} did not respond ${expectedStatus}`,
        timeout: timeout ?? 20_000,
      },
    )
    .toBe(expectedStatus);
}
