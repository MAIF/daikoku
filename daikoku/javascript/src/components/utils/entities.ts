import { nanoid } from 'nanoid';

export const newPossibleUsagePlan = (customName: any) => ({
  _id: nanoid(32),
  type: 'FreeWithQuotas',
  currency: { code: 'EUR' },
  customName,
  customDescription: 'Free plan with limited number of calls per day and per month',
  maxPerSecond: 10,
  maxPerDay: 1000,
  maxPerMonth: 1000,

  billingDuration: {
    value: 1,
    unit: 'month',
  },

  visibility: 'Public',
  subscriptionProcess: 'Automatic',
  integrationProcess: 'ApiKey',
  rotation: false,

  otoroshiTarget: {
    otoroshiSettings: null,
    authorizedEntities: { groups: [], services: [] },
    apikeyCustomization: {
      clientIdOnly: false,
      constrainedServicesOnly: false,
      tags: [],
      metadata: {},
      customMetadata: [],
      restrictions: {
        enabled: false,
        allowLast: true,
        allowed: [],
        forbidden: [],
        notFound: [],
      },
    },
  }
});
