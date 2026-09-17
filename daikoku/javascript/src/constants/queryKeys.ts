export const QUERY_KEYS = {
  availableEnvsByApi: (apiId: string) => ['apiPricing', 'availableEnvs', apiId] as const,
  plansByApi: () => ['apiPricing', 'plans'] as const,
  apiSubscriptions: (apiId: string, teamId: string) => ['api-subscription', apiId, teamId],
  subscriptionDemand: (teamId: string, demandId: string) => ['subscription-demand', teamId, demandId] as const,
  visibleApiById: (apiId: string) => ['visible-api', apiId] as const,
  paymentEnabled: () => ['payment-enabled'] as const,
} as const;
