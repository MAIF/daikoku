#!/usr/bin/env node
/**
 * Fast seed script for CI — bypasses Daikoku HTTP API entirely.
 * - Daikoku data (teams, plans, apis, keyrings, subscriptions) → direct SQL bulk inserts
 * - Otoroshi data (routes, apikeys) → bulk import via /api/import
 *
 * Data model note (keyring aggregation):
 *   Since the keyring change, an ApiSubscription no longer carries the Otoroshi
 *   credentials nor a `parent` link. It points to a Keyring (`keyring: KeyringId`),
 *   and the Keyring holds the real apiKey / otoroshiSettings / integrationToken.
 *   The old aggregation (one Otoroshi apikey shared by a parent + its children) is
 *   now expressed as N subscriptions sharing a single keyring.
 *
 * Runs in ~30s instead of ~14min.
 */

import pg from "pg";

/////////////////////////////////////////////
// CONFIG
/////////////////////////////////////////////

const PG_HOST = process.env.PG_HOST ?? "localhost";
const PG_PORT = parseInt(process.env.PG_PORT ?? "5442");
const PG_USER = process.env.PG_USER ?? "postgres";
const PG_PASS = process.env.PG_PASS ?? "postgres";
const PG_DB = process.env.PG_DB ?? "daikoku_demo_komainu";

const OTOROSHI_URL = process.env.OTOROSHI_URL ?? "http://otoroshi-api.oto.tools:8080";
const OTOROSHI_USER = process.env.OTOROSHI_USER ?? "admin-api-apikey-id";
const OTOROSHI_PASS = process.env.OTOROSHI_PASS ?? "admin-api-apikey-secret";

const TENANT_ID = "default";
let OTOROSHI_SETTINGS_ID = "seed-otoroshi"; // overridden below from tenant config

// --- Dimensions prod-like ---
const NB_TEAMS = 660;
const NB_APIS = 220;
const PLANS_PER_API = 10;     // avg entre 5 et 30
const TARGET_PARENTS = 3900;

// --- Distribution des enfants par parent (bimodale, calquée sur prod) ---
const CHILDREN_DISTRIBUTION = [
  { weight: 12, min: 1, max: 1 },
  { weight: 10, min: 2, max: 3 },
  { weight: 12, min: 4, max: 5 },
  { weight: 8, min: 6, max: 7 },
  { weight: 10, min: 8, max: 10 },
  { weight: 8, min: 11, max: 13 },
  { weight: 5, min: 14, max: 15 },
  { weight: 5, min: 16, max: 20 },
  { weight: 5, min: 21, max: 25 },
  { weight: 3, min: 26, max: 30 },
  { weight: 3, min: 31, max: 43 },
  { weight: 5, min: 66, max: 80 },
  { weight: 2, min: 80, max: 106 },
];

/////////////////////////////////////////////

const OTO_AUTH = `Basic ${Buffer.from(`${OTOROSHI_USER}:${OTOROSHI_PASS}`).toString("base64")}`;

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickChildrenCount() {
  const totalWeight = CHILDREN_DISTRIBUTION.reduce((s, b) => s + b.weight, 0);
  let r = Math.random() * totalWeight;
  for (const bucket of CHILDREN_DISTRIBUTION) {
    r -= bucket.weight;
    if (r <= 0) return randInt(bucket.min, bucket.max);
  }
  return 1;
}

async function otoCall(method, path, body) {
  const res = await fetch(`${OTOROSHI_URL}${path}`, {
    method,
    headers: {
      Authorization: OTO_AUTH,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`[otoroshi] ${method} ${path} → ${res.status} ${txt}`);
  }
  return res.json().catch(() => null);
}

// Bulk insert rows into a table (id, content jsonb)
async function bulkInsert(client, table, rows) {
  if (rows.length === 0) return;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk.map((_, idx) => `($${idx * 3 + 1}, $${idx * 3 + 2}::jsonb, $${idx * 3 + 3})`).join(", ");
    const params = chunk.flatMap(r => [r.id, JSON.stringify(r.content), false]);
    await client.query(
      `INSERT INTO ${table} (_id, content, _deleted) VALUES ${values} ON CONFLICT (_id) DO NOTHING`,
      params
    );
  }
}

/////////////////////////////////////////////
console.log("\n=== Fast CI seed (direct SQL + Otoroshi bulk import) ===\n");

// 1. Check Otoroshi
try {
  await otoCall("GET", "/api/live");
  console.log("✓ Otoroshi reachable");
} catch (e) {
  console.error(`✗ Otoroshi unreachable: ${e.message}`);
  process.exit(1);
}

// 2. Connect to Postgres
const client = new pg.Client({ host: PG_HOST, port: PG_PORT, user: PG_USER, password: PG_PASS, database: PG_DB });
await client.connect();
console.log("✓ Postgres connected");

// 3. Wipe existing seed data
await client.query(`DELETE FROM teams             WHERE _id LIKE 'seed-%'`);
await client.query(`DELETE FROM usage_plans       WHERE _id LIKE 'seed-%'`);
await client.query(`DELETE FROM apis              WHERE _id LIKE 'seed-%'`);
await client.query(`DELETE FROM api_subscriptions WHERE _id LIKE 'seed-%'`);
await client.query(`DELETE FROM keyrings          WHERE _id LIKE 'seed-%'`);
console.log("✓ Previous seed data cleared");

// 4. Fetch admin user id from DB
const USER_ID = "asFpYYNvJmQRVq3irA6p9cnILhTMLQMC"; //MICHAEL SCOTT

// 5. Resolve Otoroshi settings ID from existing tenant config
const tenantRow = await client.query(`SELECT content FROM tenants WHERE _id = $1`, [TENANT_ID]);
if (tenantRow.rows.length === 0) {
  console.error(`✗ Tenant '${TENANT_ID}' not found in DB`);
  process.exit(1);
}
const tenantContent = tenantRow.rows[0].content;
const existingSettings = tenantContent.otoroshiSettings ?? [];
if (existingSettings.length === 0) {
  console.error(`✗ No Otoroshi settings found in tenant '${TENANT_ID}' — configure them in Daikoku first`);
  process.exit(1);
}
// Use the first existing settings entry (the one Daikoku already uses successfully)
OTOROSHI_SETTINGS_ID = existingSettings[0]._id;
console.log(`✓ Using existing OtoroshiSettings: ${OTOROSHI_SETTINGS_ID}`);

// 6. Generate teams
const teamRows = Array.from({ length: NB_TEAMS }, (_, i) => ({
  id: `seed-team-${i}`,
  content: {
    _id: `seed-team-${i}`,
    _humanReadableId: `seed-team-${i}`,
    _tenant: TENANT_ID,
    _deleted: false,
    type: "Organization",
    name: `Seed Team ${i}`,
    description: "",
    avatar: "/assets/images/daikoku.svg",
    users: [{ userId: USER_ID, teamPermission: "Administrator" }],
    authorizedOtoroshiEntities: [],
    contact: "",
    metadata: {},
    apisCreationPermission: true,
    verified: true,
  }
}));
await bulkInsert(client, "teams", teamRows);
console.log(`✓ ${NB_TEAMS} teams inserted`);

// 7. Generate plans + apis
const planRows = [];
const apiRows = [];
// { apiId, planIds: string[], routeId: string (one per plan) }
const apiData = [];
const allRoutes = []; // for Otoroshi import
const allApikeys = []; // for Otoroshi import

for (let i = 0; i < NB_APIS; i++) {
  const apiId = `seed-api-${i}`;
  const planIds = [];

  for (let p = 0; p < PLANS_PER_API; p++) {
    const planId = `seed-plan-${i}-${p}`;
    const routeId = `seed-route-${i}-${p}`;
    planIds.push({ planId, routeId });

    allRoutes.push({
      id: routeId,
      name: `Seed route ${routeId}`,
      _loc: { tenant: "default", teams: ["default"] },
      frontend: { domains: [`${routeId}.oto.tools`], strip_path: true, exact: false, headers: {}, query: {}, methods: [] },
      backend: {
        targets: [{ id: "target_1", hostname: "mirror.otoroshi.io", port: 443, tls: true }],
        root: "/",
        rewrite: false,
        load_balancing: { type: "RoundRobin", ratio: 0.0 },
        health_check: null
      },
      backend_ref: null,
      plugins: []
    });

    planRows.push({
      id: planId,
      content: {
        _id: planId,
        _tenant: TENANT_ID,
        _deleted: false,
        customName: `plan-${p}`,
        customDescription: "",
        otoroshiTarget: {
          otoroshiSettings: OTOROSHI_SETTINGS_ID,
          authorizedEntities: { groups: [], services: [], routes: [routeId] },
          apikeyCustomization: {
            clientIdOnly: false,
            constrainedServicesOnly: false,
            readOnly: false,
            metadata: {},
            tags: [],
            restrictions: { enabled: false, allowLast: true, allowed: [], forbidden: [], notFound: [] }
          }
        },
        allowMultipleKeys: false,
        subscriptionProcess: [],
        integrationProcess: "ApiKey",
        autoRotation: false,
        aggregationApiKeysSecurity: true,
        type: "QuotasWithLimits",
        maxPerSecond: 1000,
        maxPerDay: 1000000,
        maxPerMonth: 10000000,
      }
    });
  }

  apiRows.push({
    id: apiId,
    content: {
      _id: apiId,
      _humanReadableId: apiId,
      _tenant: TENANT_ID,
      _deleted: false,
      team: teamRows[i % NB_TEAMS].id,
      name: `Seed API ${i}`,
      smallDescription: "",
      description: "",
      lastUpdate: Date.now(),
      createdAt: Date.now(),
      currentVersion: "1.0.0",
      supportedVersions: ["1.0.0"],
      isDefault: true,
      tags: [],
      categories: [],
      visibility: "Public",
      possibleUsagePlans: planIds.map(e => e.planId),
      defaultUsagePlan: planIds[0].planId,
      state: "published",
      stars: 0,
      documentation: {
        _id: `doc-${apiId}`,
        _tenant: TENANT_ID,
        pages: [],
        lastModificationAt: Date.now(),
      },
    }
  });

  apiData.push({ apiId, planEntries: planIds });
}

await bulkInsert(client, "usage_plans", planRows);
console.log(`✓ ${planRows.length} plans inserted`);
await bulkInsert(client, "apis", apiRows);
console.log(`✓ ${NB_APIS} APIs inserted`);

// 8. Generate keyrings + subscriptions
//
// A "group" replaces the old parent/children aggregation: one Keyring (carrying
// the shared Otoroshi apikey) + N subscriptions all pointing to that keyring.
// TARGET_PARENTS is therefore the number of keyring groups; `pickChildrenCount`
// gives the number of *extra* subscriptions on top of the first one in the group.
const keyringRows = [];
const subRows = [];
let subCounter = 0;
let keyringCounter = 0;
const groupsPerTeam = Math.ceil(TARGET_PARENTS / NB_TEAMS);

for (let t = 0; t < NB_TEAMS; t++) {
  const teamId = teamRows[t].id;
  const nbGroups = t === 0
    ? TARGET_PARENTS - groupsPerTeam * (NB_TEAMS - 1)  // last team gets remainder
    : groupsPerTeam;

  for (let g = 0; g < Math.max(1, nbGroups); g++) {
    const now = Date.now();
    const keyringId = `seed-keyring-${++keyringCounter}`;
    const clientId = `cid-${keyringId}`;
    const clientSecret = `sec-${keyringId}`;

    // First subscription of the group.
    const firstApiIdx = randInt(0, apiData.length - 1);
    const firstPlanEntry = apiData[firstApiIdx].planEntries[randInt(0, apiData[firstApiIdx].planEntries.length - 1)];

    const apikeyRouteIds = [firstPlanEntry.routeId];
    const groupSubs = [{ apiId: apiData[firstApiIdx].apiId, planEntry: firstPlanEntry }];

    // Extra subscriptions sharing the same keyring (the "aggregated" ones).
    const nbExtra = pickChildrenCount();
    for (let c = 0; c < nbExtra; c++) {
      const extraApiIdx = randInt(0, apiData.length - 1);
      const extraPlanEntry = apiData[extraApiIdx].planEntries[randInt(0, apiData[extraApiIdx].planEntries.length - 1)];
      apikeyRouteIds.push(extraPlanEntry.routeId);
      groupSubs.push({ apiId: apiData[extraApiIdx].apiId, planEntry: extraPlanEntry });
    }

    // The keyring holds the real Otoroshi credentials + settings binding.
    keyringRows.push({
      id: keyringId,
      content: {
        _id: keyringId,
        _tenant: TENANT_ID,
        team: teamId,
        _deleted: false,
        customName: `Keyring ${keyringId}`,
        apiKey: { clientName: `Key ${keyringId}`, clientId, clientSecret },
        otoroshiSettings: { type: "Otoroshi", id: OTOROSHI_SETTINGS_ID },
        createdAt: now,
        rotation: null,
        integrationToken: `integ-${keyringId}`,
        bearerToken: null,
        thirdPartySubscriptionInformations: null,
        enabled: true,
      }
    });

    // Subscriptions only carry the values needed to compute the key; the
    // technical Otoroshi values live on the keyring.
    for (const { apiId, planEntry } of groupSubs) {
      const subId = `seed-sub-${++subCounter}`;
      subRows.push({
        id: subId,
        content: {
          _id: subId,
          _tenant: TENANT_ID,
          _deleted: false,
          api: apiId,
          plan: planEntry.planId,
          team: teamId,
          by: USER_ID,
          keyring: keyringId,
          enabled: true,
          createdAt: now,
          validUntil: null,
          customName: `Sub ${subId}`,
          adminCustomName: null,
          metadata: {},
          customMetadata: null,
          tags: [],
          customMaxPerSecond: null,
          customMaxPerDay: null,
          customMaxPerMonth: null,
          customReadOnly: null,
          thirdPartySubscriptionInformations: null,
        }
      });
    }

    // One Otoroshi apikey per keyring, authorized on every route of the group.
    allApikeys.push({
      clientId,
      clientSecret,
      clientName: `Key ${keyringId}`,
      _loc: { tenant: "default", teams: ["default"] },
      authorizedEntities: apikeyRouteIds.map(r => `route_${r}`),
      authorizations: apikeyRouteIds.map(r => ({ kind: "route", id: r })),
      enabled: true,
      readOnly: false,
      allowClientIdOnly: false,
      throttlingQuota: 10000,
      dailyQuota: 10000000,
      monthlyQuota: 100000000,
      metadata: {},
      tags: [],
    });
  }
}

await bulkInsert(client, "keyrings", keyringRows);
console.log(`✓ ${keyringRows.length} keyrings inserted`);
await bulkInsert(client, "api_subscriptions", subRows);
await client.end();
const nbKeyrings = keyringRows.length;
console.log(`✓ ${subRows.length} subscriptions inserted (across ${nbKeyrings} keyrings)`);

// 9. Otoroshi bulk import (routes + apikeys)
// We use /api/import which accepts a full state patch
// Otoroshi doesn't have a true bulk-create, so we batch via individual calls
// but do it in parallel (much faster than sequential)
console.log(`\nImporting ${allRoutes.length} routes + ${allApikeys.length} apikeys into Otoroshi...`);

const PARALLEL = 50;
async function runInParallel(items, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += PARALLEL) {
    const batch = items.slice(i, i + PARALLEL);
    await Promise.all(batch.map(fn));
    results.push(...batch);
  }
  return results;
}

let otoErrors = 0;
await runInParallel(allRoutes, async (route) => {
  try {
    await otoCall("POST", "/apis/proxy.otoroshi.io/v1/routes", route);
  } catch (e) {
    if (!e.message.includes("409")) otoErrors++;
  }
});
console.log(`✓ ${allRoutes.length} routes imported`);

await runInParallel(allApikeys, async (apk) => {
  try {
    await otoCall("POST", "/apis/apim.otoroshi.io/v1/apikeys", apk);
  } catch (e) {
    if (!e.message.includes("409")) otoErrors++;
  }
});
console.log(`✓ ${allApikeys.length} apikeys imported`);

console.log(`\n=== Fast seed completed ===`);
console.log(`Teams:         ${NB_TEAMS}`);
console.log(`APIs:          ${NB_APIS}`);
console.log(`Plans:         ${planRows.length}`);
console.log(`Oto Routes:    ${allRoutes.length}`);
console.log(`Keyrings:      ${nbKeyrings}`);
console.log(`Oto Apikeys:   ${allApikeys.length}`);
console.log(`Subscriptions: ${subRows.length} (across ${nbKeyrings} keyrings)`);
if (otoErrors > 0) console.warn(`Otoroshi errors: ${otoErrors}`);
console.log();
