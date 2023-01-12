import { nanoid } from 'nanoid';
import { IUsagePlanFreeWithQuotas } from '../../types';

export const newPossibleUsagePlan = (customName: string): IUsagePlanFreeWithQuotas => ({
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
    unit: 'Month',
  },

  visibility: 'Public',
  subscriptionProcess: 'Automatic',
  integrationProcess: 'ApiKey',
  rotation: false,
  authorizedTeams: [],
  otoroshiTarget: {
    otoroshiSettings: undefined,
    authorizedEntities: { groups: [], services: [], routes: [] },
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
  },
});
