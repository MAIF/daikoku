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

export const generateApi = () => ({
  _id: nanoid(32),
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
  possibleUsagePlans: [],
  currentVersion: '1.0.0',
  state: 'published',
  isDefault: true
})