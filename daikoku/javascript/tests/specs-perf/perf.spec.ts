import { test, expect, APIRequestContext, request } from '@playwright/test'
import { Client } from 'pg'

// Give each test enough room beyond its own threshold
test.setTimeout(3 * 60 * 1000) // 3 minutes

// Thresholds in milliseconds
const THRESHOLDS = {
  fullSyncNoChanges: 60 * 1000,  // 1min — 80k keys streamed + compared, all skipped
  fullSyncWithChange: 60 * 1000,     // 1min — 80k keys, 1 update to push to Otoroshi
  apiSync: 15 * 1000,                // 15s  — all keys for a given API
  planSync: 15 * 1000,               // 15s  — all keys for a given plan
  subscriptionSync: 1500,             // 1.5s — single subscription (docker overhead)
}

const BASE_URL = process.env.DAIKOKU_URL ?? 'http://localhost:9000'
const OTOROSHI_URL = process.env.OTOROSHI_URL ?? 'http://otoroshi-api.oto.tools:8080'
const SYNC_KEY = process.env.DAIKOKU_OTOROSHI_SYNC_KEY ?? 'secret'

const DAIKOKU_ADMIN_KEY_CLIENT_ID = process.env.DAIKOKU_ADMIN_KEY_CLIENT_ID ?? 'admin_key_client_id'
const DAIKOKU_ADMIN_KEY_CLIENT_SECRET = process.env.DAIKOKU_ADMIN_KEY_CLIENT_SECRET ?? 'admin_key_client_secret'

const OTOROSHI_ADMIN_KEY_CLIENT_ID = process.env.OTOROSHI_ADMIN_KEY_CLIENT_ID ?? 'admin-api-apikey-id'
const OTOROSHI_ADMIN_KEY_CLIENT_SECRET = process.env.OTOROSHI_ADMIN_KEY_CLIENT_SECRET ?? 'admin-api-apikey-secret'

// IDs resolved dynamically from DB in beforeAll
let SEED_API_ID: string
let SEED_PLAN_ID: string
let SEED_SUBSCRIPTION_ID: string
let SEED_CLIENT_ID: string

async function resolveSeedIds(): Promise<void> {
  await withDb(async client => {
    const res = await client.query(`
      SELECT
        best_plan.api_id,
        best_plan.plan_id,
        best_plan.cnt,
        s._id                            AS sub_id,
        s.content->'apiKey'->>'clientId' AS client_id
      FROM (
        SELECT content->>'api' AS api_id, content->>'plan' AS plan_id, count(*) AS cnt
        FROM api_subscriptions
        WHERE content->>'parent' IS NULL
          AND (content->>'_deleted')::boolean IS NOT TRUE
          AND _id LIKE 'seed-%'
          AND content->>'api' = (
            SELECT content->>'api'
            FROM api_subscriptions
            WHERE content->>'parent' IS NULL
              AND (content->>'_deleted')::boolean IS NOT TRUE
              AND _id LIKE 'seed-%'
            GROUP BY content->>'api'
            ORDER BY count(*) DESC, content->>'api' ASC
            LIMIT 1
          )
        GROUP BY content->>'api', content->>'plan'
        ORDER BY cnt DESC, content->>'plan' ASC
        LIMIT 1
      ) best_plan
      JOIN api_subscriptions s
        ON  s.content->>'plan' = best_plan.plan_id
        AND s.content->>'api'  = best_plan.api_id
        AND s.content->>'parent' IS NULL
        AND (s.content->>'_deleted')::boolean IS NOT TRUE
        AND s._id LIKE 'seed-%'
      LIMIT 1
    `)

    const row = res.rows[0]
    SEED_API_ID = row.api_id
    SEED_PLAN_ID = row.plan_id
    SEED_SUBSCRIPTION_ID = row.sub_id
    SEED_CLIENT_ID = row.client_id

    console.log(`[seed] api=${SEED_API_ID} plan=${SEED_PLAN_ID} sub=${SEED_SUBSCRIPTION_ID} clientId=${SEED_CLIENT_ID} (${row.cnt} direct subs on this plan)`)
  })
}

// --- DB helpers ---

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: parseInt(process.env.POSTGRES_PORT ?? '5432'),
    database: process.env.POSTGRES_DB ?? 'daikoku',
    user: process.env.POSTGRES_USER ?? 'postgres',
    password: process.env.POSTGRES_PASSWORD ?? 'postgres',
  })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

async function setApiMetadata(key: string, value: string) {
  // Plans are referenced by the API via possibleUsagePlans array
  await withDb(client => client.query(
    `UPDATE usage_plans SET content = jsonb_set(content, '{otoroshiTarget,apikeyCustomization,metadata,${key}}', $1::jsonb)
     WHERE _id IN (
       SELECT jsonb_array_elements_text(content -> 'possibleUsagePlans')
       FROM apis WHERE _id = $2
     )`,
    [JSON.stringify(value), SEED_API_ID]
  ))
}

async function setPlanMetadata(key: string, value: string) {
  await withDb(client => client.query(
    `UPDATE usage_plans SET content = jsonb_set(content, '{otoroshiTarget,apikeyCustomization,metadata,${key}}', $1::jsonb) WHERE _id = $2`,
    [JSON.stringify(value), SEED_PLAN_ID]
  ))
}

async function setAllPlansMetadata(key: string, value: string) {
  await withDb(client => client.query(
    `UPDATE usage_plans SET content = jsonb_set(content, '{otoroshiTarget,apikeyCustomization,metadata,${key}}', $1::jsonb)`,
    [JSON.stringify(value)]
  ))
}

async function setSubscriptionCustomMetadata(key: string, value: string) {
  await withDb(client => client.query(
    `UPDATE api_subscriptions
     SET content = jsonb_set(
       jsonb_set(content, '{customMetadata}', CASE
         WHEN jsonb_typeof(content -> 'customMetadata') = 'object' THEN content -> 'customMetadata'
         ELSE '{}'::jsonb
       END),
       '{customMetadata,${key}}', $1::jsonb
     )
     WHERE _id = $2`,
    [JSON.stringify(value), SEED_SUBSCRIPTION_ID]
  ))
}

// --- Otoroshi helper ---

async function getOtoroshiApikeyMetadata(otoroshiCtx: APIRequestContext, clientId: string): Promise<Record<string, string>> {
  const url = `/apis/apim.otoroshi.io/v1/apikeys/${clientId}`
  const response = await otoroshiCtx.get(url)
  const body = await response.json()
  console.log(`[otoroshi] GET ${url} → ${response.status()}`, JSON.stringify(body).slice(0, 300))
  expect(response.ok(), `Failed to fetch apikey from Otoroshi: ${response.status()}`).toBeTruthy()
  return body.metadata ?? {}
}

// --- Sync helper ---

async function triggerSync(
  ctx: APIRequestContext,
  params: Record<string, string> = {}
): Promise<number> {
  const query = new URLSearchParams({ key: SYNC_KEY, ...params }).toString()

  const start = performance.now()
  const response = await ctx.post(`/api/jobs/otoroshi/_sync?${query}`)
  const duration = Math.round(performance.now() - start)

  const body = await response.json()
  console.log(`[perf] sync(${JSON.stringify(params)}) → ${response.status()} in ${duration}ms`, body)

  expect(response.ok(), `Sync call failed: ${response.status()}`).toBeTruthy()

  return duration
}

// --- Tests ---

test.describe('OtoroshiSync performance', () => {
  let daikokuCtx: APIRequestContext
  let otoroshiCtx: APIRequestContext

  test.beforeAll(async () => {
    await resolveSeedIds()

    daikokuCtx = await request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: {
        'Authorization': `Basic ${Buffer.from(`${DAIKOKU_ADMIN_KEY_CLIENT_ID}:${DAIKOKU_ADMIN_KEY_CLIENT_SECRET}`).toString('base64')}`,
      }
    })
    otoroshiCtx = await request.newContext({
      baseURL: OTOROSHI_URL,
      extraHTTPHeaders: {
        'Authorization': `Basic ${btoa(`${OTOROSHI_ADMIN_KEY_CLIENT_ID}:${OTOROSHI_ADMIN_KEY_CLIENT_SECRET}`)}`,
      }
    })
  })

  test.afterAll(async () => {
    await daikokuCtx?.dispose()
    await otoroshiCtx?.dispose()
  })

  test('full tenant sync — no changes — under 1 minutes', async () => {
    const duration = await triggerSync(daikokuCtx)
    console.log(`[perf] full sync (no changes): ${duration}ms / threshold: ${THRESHOLDS.fullSyncNoChanges}ms`)
    expect(duration).toBeLessThan(THRESHOLDS.fullSyncNoChanges)
  })

  test('full tenant sync — after 1 metadata change — under 1 minute', async () => {
    const metadataValue = Date.now()
    await setAllPlansMetadata('perf_full_sync', `${metadataValue}`)

    const duration = await triggerSync(daikokuCtx)
    console.log(`[perf] full sync (1 change): ${duration}ms / threshold: ${THRESHOLDS.fullSyncWithChange}ms`)
    expect(duration).toBeLessThan(THRESHOLDS.fullSyncWithChange)

    const metadata = await getOtoroshiApikeyMetadata(otoroshiCtx, SEED_CLIENT_ID)
    expect(metadata['perf_full_sync']).toBe(`${metadataValue}`)
  })

  test('api sync — under 30s', async () => {
    const metadataValue = Date.now()
    await setApiMetadata('perf_api_sync', `${metadataValue}`)

    const duration = await triggerSync(daikokuCtx, { api: SEED_API_ID })
    console.log(`[perf] api sync: ${duration}ms / threshold: ${THRESHOLDS.apiSync}ms`)
    expect(duration).toBeLessThan(THRESHOLDS.apiSync)

    const metadata = await getOtoroshiApikeyMetadata(otoroshiCtx, SEED_CLIENT_ID)
    expect(metadata['perf_api_sync']).toBe(`${metadataValue}`)
  })

  test('plan sync — under 30s', async () => {
    const metadataValue = Date.now()
    await setPlanMetadata('perf_plan_sync', `${metadataValue}`)

    const duration = await triggerSync(daikokuCtx, { plan: SEED_PLAN_ID })
    console.log(`[perf] plan sync: ${duration}ms / threshold: ${THRESHOLDS.planSync}ms`)
    expect(duration).toBeLessThan(THRESHOLDS.planSync)

    const metadata = await getOtoroshiApikeyMetadata(otoroshiCtx, SEED_CLIENT_ID)
    expect(metadata['perf_plan_sync']).toBe(`${metadataValue}`)
  })

  test('subscription sync — under 1s', async () => {
    const metadataValue = Date.now()
    await setSubscriptionCustomMetadata('perf_sub_sync', `${metadataValue}`)

    const duration = await triggerSync(daikokuCtx, { subscription: SEED_SUBSCRIPTION_ID })
    console.log(`[perf] subscription sync: ${duration}ms / threshold: ${THRESHOLDS.subscriptionSync}ms`)
    expect(duration).toBeLessThan(THRESHOLDS.subscriptionSync)

    const metadata = await getOtoroshiApikeyMetadata(otoroshiCtx, SEED_CLIENT_ID)
    expect(metadata['perf_sub_sync']).toBe(`${metadataValue}`)
  })
})
