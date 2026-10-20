import { expect, test } from '@playwright/test';
import {
  getSubscriptionHelp,
  getVisibleSubscriptionBlockers,
  isSubscriptionDisabled,
  type SubscriptionHelpInput,
} from '../../src/components/frontend/api/subscriptionHelpReasons';
import { UsagePlanVisibility } from '../../src/types/api';
import en from '../../src/locales/en/translation.json' with { type: 'json' };
import fr from '../../src/locales/fr/translation.json' with { type: 'json' };

function input(): SubscriptionHelpInput {
  return {
    api: { state: 'published', visibility: 'Public', authorizedTeams: [] },
    plan: {
      _id: 'plan',
      visibility: UsagePlanVisibility.public,
      authorizedTeams: [],
      subscriptionProcess: [],
      otoroshiTarget: {
        otoroshiSettings: 'gateway',
        authorizedEntities: { groups: [], services: [], routes: ['route'] },
      },
    },
    teams: [
      {
        _id: 'team',
        name: 'Consumers',
        type: 'Organization',
        verified: true,
        canAccessApiKey: true,
      },
    ],
    ownerTeamId: 'owner',
    subscriptions: [],
    demands: [],
    tenant: {
      subscriptionSecurity: true,
      otoroshiSettings: [{ _id: 'gateway', url: 'https://gateway', host: 'gateway' }],
    },
    isGuest: false,
    isDaikokuAdmin: false,
    initialTeamsExhausted: false,
  };
}

test('disables subscription for global blockers even with an eligible team', () => {
  const data = input();
  data.plan.otoroshiTarget = undefined;
  const help = getSubscriptionHelp(data);
  expect(help.availableTeams).toEqual(['Consumers']);
  expect(isSubscriptionDisabled(help)).toBe(true);
});

test('disables subscription when every team is blocked', () => {
  const data = input();
  data.teams[0].canAccessApiKey = false;
  expect(isSubscriptionDisabled(getSubscriptionHelp(data))).toBe(true);
  data.teams = [];
  expect(isSubscriptionDisabled(getSubscriptionHelp(data))).toBe(true);
});

test('keeps subscription enabled when another team is eligible', () => {
  const data = input();
  data.teams.push({
    _id: 'personal',
    name: 'Personal',
    type: 'Personal',
    verified: true,
    canAccessApiKey: true,
  });
  const help = getSubscriptionHelp(data);
  expect(help.blockers).toHaveLength(1);
  expect(isSubscriptionDisabled(help)).toBe(false);
});

test('warnings alone do not disable subscription or guest login', () => {
  const data = input();
  data.tenant.otoroshiSettings = [];
  expect(getSubscriptionHelp(data).warnings).toHaveLength(1);
  expect(isSubscriptionDisabled(getSubscriptionHelp(data))).toBe(false);
  data.isGuest = true;
  data.teams = [];
  data.plan.otoroshiTarget = undefined;
  expect(isSubscriptionDisabled(getSubscriptionHelp(data))).toBe(false);
});

test('configured published and deprecated plans have no spurious help', () => {
  const data = input();
  for (const state of ['published', 'deprecated'] as const) {
    data.api.state = state;
    expect(getSubscriptionHelp(data)).toEqual({
      blockers: [],
      warnings: [],
      availableTeams: ['Consumers'],
    });
  }
});

test('reports API lifecycle and missing target independently', () => {
  const data = input();
  data.api.state = 'blocked';
  data.plan.otoroshiTarget = undefined;
  expect(getSubscriptionHelp(data).blockers.map((item) => item.reason)).toEqual([
    'blocked',
    'target',
  ]);
  data.api.state = 'created';
  expect(getSubscriptionHelp(data).blockers[0].reason).toBe('unpublished');
});

test('distinguishes empty authorized entities from an unresolved Otoroshi instance', () => {
  const data = input();
  data.plan.otoroshiTarget = {
    otoroshiSettings: 'deleted-instance',
    authorizedEntities: { groups: [], services: [], routes: [] },
  };
  const help = getSubscriptionHelp(data);
  expect(help.blockers.map((item) => item.reason)).toEqual(['entities']);
  expect(help.warnings.map((item) => item.reason)).toEqual(['instance']);
  expect(JSON.stringify(help)).not.toContain('deleted-instance');
});

test('missing authorized entity configuration is a blocker', () => {
  const data = input();
  data.plan.otoroshiTarget = { otoroshiSettings: 'gateway' };
  expect(getSubscriptionHelp(data).blockers.map((item) => item.reason)).toEqual(['entities']);
});

for (const entity of ['groups', 'services', 'routes'] as const) {
  test(`one authorized ${entity} entity is sufficient`, () => {
    const data = input();
    data.plan.otoroshiTarget = {
      otoroshiSettings: 'gateway',
      authorizedEntities: { groups: [], services: [], routes: [], [entity]: ['entity'] },
    };
    expect(getSubscriptionHelp(data).blockers).toEqual([]);
  });
}

test('AdminOnly plans are exempt from gateway configuration', () => {
  const data = input();
  data.api.visibility = 'AdminOnly';
  data.api.authorizedTeams = ['team'];
  data.plan.otoroshiTarget = undefined;
  expect(getSubscriptionHelp(data).warnings.map((item) => item.reason)).toEqual(['adminOnly']);
  data.isDaikokuAdmin = true;
  expect(getSubscriptionHelp(data).warnings).toEqual([]);
  expect(getSubscriptionHelp(data).blockers).toEqual([]);
});

test('guests only receive configuration warnings, never team blockers', () => {
  const data = input();
  data.isGuest = true;
  data.teams = [];
  data.api.state = 'blocked';
  data.plan.otoroshiTarget = undefined;
  expect(getSubscriptionHelp(data)).toEqual({
    blockers: [],
    warnings: [{ reason: 'target', teams: [], details: [] }],
    availableTeams: [],
  });
});

test('groups affected teams by reason while keeping eligible teams visible', () => {
  const data = input();
  data.teams.push(
    {
      _id: 'personal-1',
      name: 'Personal A',
      type: 'Personal',
      verified: true,
      canAccessApiKey: true,
    },
    {
      _id: 'personal-2',
      name: 'Personal B',
      type: 'Personal',
      verified: true,
      canAccessApiKey: true,
    }
  );
  const help = getSubscriptionHelp(data);
  expect(help.blockers).toEqual([
    { reason: 'personal', teams: ['Personal A', 'Personal B'], details: [] },
  ]);
  expect(help.availableTeams).toEqual(['Consumers']);
  data.tenant.subscriptionSecurity = false;
  expect(getSubscriptionHelp(data).blockers).toEqual([]);
});

test('reports missing teams and team API key permissions', () => {
  const data = input();
  data.teams[0].canAccessApiKey = false;
  expect(getSubscriptionHelp(data).blockers[0].reason).toBe('permission');
  data.teams = [];
  expect(getSubscriptionHelp(data).blockers[0].reason).toBe('noTeams');
});

test('API and plan authorizations are separate and owner teams bypass them', () => {
  const data = input();
  data.api.visibility = 'Private';
  data.plan.visibility = UsagePlanVisibility.private;
  expect(getSubscriptionHelp(data).blockers.map((item) => item.reason)).toEqual([
    'apiAccess',
    'planAccess',
  ]);
  data.api.authorizedTeams = ['team'];
  expect(getSubscriptionHelp(data).blockers.map((item) => item.reason)).toEqual(['planAccess']);
  data.plan.authorizedTeams = [{ _id: 'team', name: 'Consumers' }];
  expect(getSubscriptionHelp(data).blockers).toEqual([]);
  data.api.authorizedTeams = [];
  data.plan.authorizedTeams = [];
  data.ownerTeamId = 'team';
  expect(getSubscriptionHelp(data).blockers).toEqual([]);
});

test('administration teams are only excluded from non-AdminOnly APIs', () => {
  const data = input();
  data.teams[0].type = 'Admin';
  expect(getSubscriptionHelp(data).blockers[0].reason).toBe('adminTeam');
  data.api.visibility = 'AdminOnly';
  data.api.authorizedTeams = ['team'];
  expect(getSubscriptionHelp(data).blockers).toEqual([]);
});

test('distinguishes current-plan demands from the existing cross-plan pending-request filter', () => {
  const data = input();
  data.demands = [{ team: 'team', plan: 'other-plan' }];
  expect(getSubscriptionHelp(data).blockers[0].reason).toBe('apiPending');
  data.demands.push({ team: 'team', plan: 'plan' });
  expect(getSubscriptionHelp(data).blockers[0].reason).toBe('pending');
});

test('explains existing subscription filtering without claiming another plan is this plan', () => {
  const data = input();
  data.subscriptions = [{ team: 'team', plan: 'other-plan' }];
  expect(getSubscriptionHelp(data).blockers).toEqual([]);
  data.initialTeamsExhausted = true;
  expect(getSubscriptionHelp(data).blockers[0].reason).toBe('apiSubscribed');
  data.subscriptions[0].plan = 'plan';
  expect(getSubscriptionHelp(data).blockers[0].reason).toBe('subscribed');
});

test('multiple keys preserve the selector bypass for duplicates, pending requests and verification', () => {
  const data = input();
  data.teams[0].verified = false;
  data.plan.subscriptionProcess = [
    { type: 'payment', id: 'payment', thirdPartyPaymentSettingsId: 'billing' },
  ];
  data.subscriptions = [{ team: 'team', plan: 'plan' }];
  data.demands = [{ team: 'team', plan: 'plan' }];
  expect(getSubscriptionHelp(data).blockers.map((item) => item.reason)).toEqual([
    'subscribed',
    'pending',
    'verification',
  ]);
  data.plan.allowMultipleKeys = true;
  expect(getSubscriptionHelp(data).blockers).toEqual([]);
});

test('required metadata is a prerequisite, not a claim that values are already missing', () => {
  const data = input();
  data.plan.otoroshiTarget = {
    ...data.plan.otoroshiTarget,
    apikeyCustomization: {
      clientIdOnly: false,
      constrainedServicesOnly: false,
      tags: [],
      metadata: {},
      customMetadata: [{ key: 'department', possibleValues: [] }],
      restrictions: { enabled: false, allowLast: false, allowed: [], forbidden: [], notFound: [] },
    },
  };
  const help = getSubscriptionHelp(data);
  expect(help.blockers).toEqual([]);
  expect(help.warnings).toEqual([{ reason: 'metadata', teams: [], details: ['department'] }]);
  data.plan.subscriptionProcess = [{ type: 'teamAdmin', id: 'validation', team: 'owner' }];
  expect(getSubscriptionHelp(data).warnings[0].reason).toBe('metadataValidation');
});

test('hides admin-team and existing-plan-subscription messages without changing eligibility', () => {
  const data = input();
  data.teams[0].type = 'Admin';
  data.subscriptions = [{ team: 'team', plan: 'plan' }];
  const help = getSubscriptionHelp(data);
  expect(help.blockers.map((item) => item.reason)).toEqual(['adminTeam', 'subscribed']);
  expect(getVisibleSubscriptionBlockers(help)).toEqual([]);
  expect(isSubscriptionDisabled(help)).toBe(true);
  data.plan.otoroshiTarget = undefined;
  expect(
    getVisibleSubscriptionBlockers(getSubscriptionHelp(data)).map((item) => item.reason)
  ).toEqual(['target']);
});

test('every displayed help reason and UI label is translated in English and French', () => {
  const keys = Object.keys(en).filter((key) => key.startsWith('subscription.help.'));
  expect(keys.length).toBe(21);
  expect(Object.keys(fr).filter((key) => key.startsWith('subscription.help.'))).toEqual(keys);
  for (const translations of [en, fr]) {
    for (const key of keys) {
      expect(Reflect.get(translations, key)).toBeTruthy();
    }
  }
});
