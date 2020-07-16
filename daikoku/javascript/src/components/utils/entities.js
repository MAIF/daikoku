import faker from 'faker';

export const newPossibleUsagePlan = (customName) => ({
  _id: faker.random.alphaNumeric(32),
  type: 'FreeWithQuotas',
  currency: { code: 'EUR' },
  customName,
  customDescription: null,
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
    serviceGroup: null,
    apikeyCustomization: {
      dynamicPrefix: 'daikoku_',
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
