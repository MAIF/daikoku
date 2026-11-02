import { expect, test } from '@playwright/test';
import {
  getOtoroshiTargetReason,
  getSubscriptionHelp,
  getVisibleSubscriptionBlockers,
  isSubscriptionDisabled,
  type SubscriptionHelpInput,
} from '../../src/components/frontend/api/subscriptionHelpReasons';
import en from '../../src/locales/en/translation.json' with { type: 'json' };
import fr from '../../src/locales/fr/translation.json' with { type: 'json' };

function input(): SubscriptionHelpInput {
  return {
    api: { state: 'published', visibility: 'Public' },
    plan: {
      otoroshiTarget: {
        otoroshiSettings: 'gateway',
        authorizedEntities: { groups: [], services: [], routes: ['route'] },
      },
    },
    isGuest: false,
  };
}

test('configured published and deprecated plans have no blockers', () => {
  const data = input();
  for (const state of ['published', 'deprecated'] as const) {
    data.api.state = state;
    expect(getSubscriptionHelp(data)).toEqual({ blockers: [] });
    expect(isSubscriptionDisabled(getSubscriptionHelp(data))).toBe(false);
  }
});

test('reports API lifecycle on the button and Otoroshi configuration separately', () => {
  const data = input();
  data.api.state = 'blocked';
  data.plan.otoroshiTarget = undefined;
  const help = getSubscriptionHelp(data);
  expect(help.blockers).toEqual([{ reason: 'blocked' }, { reason: 'target' }]);
  expect(isSubscriptionDisabled(help)).toBe(true);
  expect(getVisibleSubscriptionBlockers(help)).toEqual([{ reason: 'blocked' }]);
  expect(getOtoroshiTargetReason(data.api, data.plan)).toEqual({ reason: 'target' });
  data.api.state = 'created';
  expect(getVisibleSubscriptionBlockers(getSubscriptionHelp(data))).toEqual([
    { reason: 'unpublished' },
  ]);
});

test('missing target disables subscription without a button explanation', () => {
  const data = input();
  data.plan.otoroshiTarget = undefined;
  const help = getSubscriptionHelp(data);
  expect(isSubscriptionDisabled(help)).toBe(true);
  expect(getVisibleSubscriptionBlockers(help)).toEqual([]);
});

test('empty or missing authorized entities are Otoroshi configuration blockers', () => {
  const data = input();
  for (const authorizedEntities of [undefined, { groups: [], services: [], routes: [] }]) {
    data.plan.otoroshiTarget = { otoroshiSettings: 'gateway', authorizedEntities };
    expect(getOtoroshiTargetReason(data.api, data.plan)).toEqual({ reason: 'entities' });
    expect(isSubscriptionDisabled(getSubscriptionHelp(data))).toBe(true);
    expect(getVisibleSubscriptionBlockers(getSubscriptionHelp(data))).toEqual([]);
  }
});

for (const entity of ['groups', 'services', 'routes'] as const) {
  test(`one authorized ${entity} entity is sufficient`, () => {
    const data = input();
    data.plan.otoroshiTarget = {
      otoroshiSettings: 'gateway',
      authorizedEntities: { groups: [], services: [], routes: [], [entity]: ['entity'] },
    };
    expect(getOtoroshiTargetReason(data.api, data.plan)).toBeUndefined();
    expect(getSubscriptionHelp(data).blockers).toEqual([]);
  });
}

test('AdminOnly plans are exempt from gateway configuration', () => {
  const data = input();
  data.api.visibility = 'AdminOnly';
  data.plan.otoroshiTarget = undefined;
  expect(getOtoroshiTargetReason(data.api, data.plan)).toBeUndefined();
  expect(isSubscriptionDisabled(getSubscriptionHelp(data))).toBe(false);
  data.api.state = 'blocked';
  expect(getSubscriptionHelp(data).blockers).toEqual([{ reason: 'blocked' }]);
});

test('guest login is not disabled by lifecycle or configuration', () => {
  const data = input();
  data.isGuest = true;
  data.api.state = 'blocked';
  data.plan.otoroshiTarget = undefined;
  expect(getSubscriptionHelp(data)).toEqual({ blockers: [] });
  expect(isSubscriptionDisabled(getSubscriptionHelp(data))).toBe(false);
});

test('team eligibility, demands, subscriptions and instance checks no longer disable the button', () => {
  const data = {
    ...input(),
    teams: [],
    subscriptions: [{ team: 'team', plan: 'plan' }],
    demands: [{ team: 'team', plan: 'plan' }],
    tenant: { subscriptionSecurity: true, otoroshiSettings: [] },
    initialTeamsExhausted: true,
  };
  expect(getSubscriptionHelp(data)).toEqual({ blockers: [] });
  expect(isSubscriptionDisabled(getSubscriptionHelp(data))).toBe(false);
});

test('only retained help reasons are translated in English and French', () => {
  const expected = ['blocked', 'entities', 'target', 'unpublished'];
  for (const translations of [en, fr]) {
    const reasons = Object.keys(translations)
      .filter((key) => key.startsWith('subscription.help.reason.'))
      .map((key) => key.replace('subscription.help.reason.', ''));
    expect(reasons.sort()).toEqual(expected);
    for (const reason of expected) {
      expect(Reflect.get(translations, `subscription.help.reason.${reason}`)).toBeTruthy();
    }
  }
});
