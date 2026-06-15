
export const QUERY_KEYS = {
  availableEnvsByApi : (apiId: string) => ['apiPricing','availableEnvs', apiId] as const,
  plansByApi : () => ['apiPricing', "plans"] as const
} as const
