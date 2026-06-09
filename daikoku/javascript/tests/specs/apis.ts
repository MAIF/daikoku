import { nanoid } from "nanoid"
import { IApi } from "../../src/types"
import { adminApikeyId, adminApikeySecret, apiDivision, exposedPort, tenant } from "./utils"

export const saveApi = (api?: IApi): Promise<Response> => {
  if (!api) {
    return Promise.reject({ error: "no api" })
  }
  return fetch(`http://localhost:${exposedPort}/admin-api/apis`, {
    method: 'POST',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(api)
  })
}

export const generateApi = (overrides: Record<string, any> = {}) => ({
  _id: nanoid(32),
  _tenant: tenant,
  tenant: tenant,
  team: apiDivision,
  name: "New API",
  smallDescription: "A new API",
  description: "A new API",
  lastUpdate: Date.now(),
  documentation: {
    _id: nanoid(32),
    _tenant: tenant,
    lastModificationAt: Date.now(),
    pages: []
  },
  visibility: "Public",
  authorizedTeams: [],
  possibleUsagePlans: [],
  currentVersion: '1.0.0',
  state: 'published',
  isDefault: true,
  ...overrides
})

export const savePlan = (plan: Record<string, any>): Promise<Response> => {
  return fetch(`http://localhost:${exposedPort}/admin-api/usage-plans`, {
    method: 'POST',
    headers: {
      "Authorization": `Basic ${btoa(adminApikeyId + ":" + adminApikeySecret)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(plan)
  })
}

// minimal but complete usage plan, automatic process (empty subscriptionProcess)
// and a non-empty otoroshiTarget so the subscription button is rendered.
export const generatePlan = (overrides: Record<string, any> = {}) => ({
  _id: nanoid(32),
  _tenant: tenant,
  _deleted: false,
  customName: "dev",
  customDescription: null,
  visibility: "Public",
  authorizedTeams: [],
  maxPerSecond: 100,
  maxPerDay: 1000,
  maxPerMonth: 1000,
  currency: { code: "EUR" },
  billingDuration: { unit: "Month", value: 1 },
  trialPeriod: null,
  costPerMonth: null,
  costPerRequest: null,
  paymentSettings: null,
  allowMultipleKeys: false,
  autoRotation: false,
  rotation: false,
  integrationProcess: "ApiKey",
  subscriptionProcess: [],
  aggregationApiKeysSecurity: false,
  swagger: null,
  testing: null,
  documentation: null,
  otoroshiTarget: {
    otoroshiSettings: "5uPluRrc5wQFpCk6-VSgDvqCtckvInbF",
    authorizedEntities: {
      groups: [],
      routes: ["route_4e29a989-cef9-41d8-a64c-385374b1d44b"],
      services: []
    },
    apikeyCustomization: {
      tags: [],
      metadata: {},
      readOnly: false,
      clientIdOnly: false,
      restrictions: { allowed: [], enabled: false, notFound: [], allowLast: true, forbidden: [] },
      customMetadata: [],
      constrainedServicesOnly: false
    }
  },
  ...overrides
})