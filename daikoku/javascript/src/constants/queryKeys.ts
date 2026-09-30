export const QUERY_KEYS = {
  availableEnvsByApi: (apiId: string) => ['apiPricing', 'availableEnvs', apiId] as const,
  plansByApi: () => ['apiPricing', 'plans'] as const,
  apiSubscriptions: (apiId: string, teamId: string) => ['api-subscription', apiId, teamId],
  remoteCatalogs: (tenantId: string) => ['remote-catalogs', tenantId],
  remoteCatalogHistory: (tenantId: string, catalogId: string) => [
    'remote-catalog-history',
    tenantId,
    catalogId,
  ],
  keyringSubscriptions: (keyringId: string) => ['keyring-subscription', keyringId],
  apiKeyrings: (teamId: string, apiId: string) => ['keyrings', teamId, apiId],
} as const;
