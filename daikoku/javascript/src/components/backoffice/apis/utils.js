import {v4 as uuid} from 'uuid';

export function DefaultApi(tenant, teamId) {
  return {
    _id: uuid(),
    _tenant: tenant,
    team: teamId,
    lastUpdate: Date.now(),
    name: 'New Api',
    smallDescription: 'A new Api',
    description: '# New Api\n\nA very nice new Api',
    currentVersion: '1.0.0',
    supportedVersions: ['1.0.0'],
    published: true,
    testable: false,
    documentation: {
      _id: uuid(),
      _tenant: tenant,
      pages: [],
      lastModificationAt: Date.now(),
    },
    swagger: {
      url: 'http://newapi.foo.bar/swaggers.json',
      content: null,
      headers: {},
    },
    tags: [],
    visibility: 'Public',
    subscriptionProcess: 'Automatic',
    possibleUsagePlans: [
      {
        _id: '1',
        currency: {
          code: 'EUR',
        },
        billingDuration: {
          value: 1,
          unit: 'Month',
        },
        customName: null,
        customDescription: null,
        otoroshiTarget: null,
        type: 'FreeWithQuotas',
        maxPerSecond: 50,
        maxPerDay: 500,
        maxPerMonth: 50000,
      },
    ],
    defaultUsagePlan: '1',
    subscriptions: [],
    authorizedTeams: [],
  };
}
