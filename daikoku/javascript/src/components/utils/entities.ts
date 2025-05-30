import { nanoid } from 'nanoid';
import { ITenant, IUsagePlan, UsagePlanVisibility } from '../../types';

export const newPossibleUsagePlan = (customName: string, tenant: ITenant): IUsagePlan => ({
  _id: nanoid(32),
  _tenant: tenant._id,
  _deleted: false,
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
  visibility: UsagePlanVisibility.public,
  subscriptionProcess: [],
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
