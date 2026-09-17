export const QUERY_KEYS = {
  availableEnvsByApi: (apiId: string) => ['apiPricing', 'availableEnvs', apiId] as const,
  plansByApi: () => ['apiPricing', 'plans'] as const,
  apiSubscriptions: (apiId: string, teamId: string) => ['api-subscription', apiId, teamId],
  keyringSubscriptions: (keyringId: string) => ['keyring-subscription', keyringId],
} as const;
