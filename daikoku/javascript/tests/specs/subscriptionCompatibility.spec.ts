import { expect, test } from '@playwright/test';
import {
  findCompatibleSubscriptionsForPlans,
  buildBatchKeyringSelection,
  findCompatibleKeyringsForGroup,
  groupBatchPlansByKeyring,
  isPlanSelectableForBatch,
  isBatchPlanAvailable,
} from '../../src/services/subscriptions';
import type { IUsagePlanGQL } from '../../src/types/api';
import { ThirdPartyPaymentType } from '../../src/types/tenant';

type BatchPlan = Parameters<typeof isPlanSelectableForBatch>[0];

const empty: BatchPlan = { subscriptionProcess: [] };

test('filters team-specific unavailable plans without hiding other API or team plans', () => {
  const plan = {
    _id: 'dev',
    customName: 'dev',
    visibility: 'Public' as IUsagePlanGQL['visibility'],
    authorizedTeams: [],
    subscriptionProcess: [],
    allowMultipleKeys: false,
  };
  const selection = {
    apiId: 'catalogue',
    ownerTeamId: 'producer',
    teamId: 'consumer',
    plan,
    subscriptions: [],
    pendingPlans: [],
  };
  expect(isBatchPlanAvailable(selection)).toBe(true);
  expect(
    isBatchPlanAvailable({
      ...selection,
      subscriptions: [{ api: 'catalogue', plan: 'dev' }],
    })
  ).toBe(false);
  expect(
    isBatchPlanAvailable({
      ...selection,
      plan: { ...plan, allowMultipleKeys: true },
      subscriptions: [{ api: 'catalogue', plan: 'dev' }],
    })
  ).toBe(true);
  expect(
    isBatchPlanAvailable({
      ...selection,
      pendingPlans: [{ api: 'catalogue', plan: 'dev' }],
      plan: { ...plan, allowMultipleKeys: true },
    })
  ).toBe(false);
  expect(
    isBatchPlanAvailable({
      ...selection,
      subscriptions: [{ api: 'billing', plan: 'dev' }],
      pendingPlans: [{ api: 'billing', plan: 'dev' }],
    })
  ).toBe(true);
  expect(
    isBatchPlanAvailable({
      ...selection,
      plan: { ...plan, visibility: 'Private' as IUsagePlanGQL['visibility'] },
    })
  ).toBe(false);
  expect(
    isBatchPlanAvailable({
      ...selection,
      plan: {
        ...plan,
        visibility: 'Private' as IUsagePlanGQL['visibility'],
        authorizedTeams: [{ _id: 'consumer', name: 'Consumer' }],
      },
    })
  ).toBe(true);
  expect(
    isBatchPlanAvailable({
      ...selection,
      plan: {
        ...plan,
        paymentSettings: {
          type: ThirdPartyPaymentType.stripe,
          thirdPartyPaymentSettingsId: 'stripe',
        },
      },
    })
  ).toBe(false);
});

const withProcess = (checksum: string | null | undefined): BatchPlan => ({
  subscriptionProcess: [{ type: 'teamAdmin', id: 'admin', team: 'producer' }],
  subscriptionBatchProcessChecksum: checksum,
});

test('allows empty processes and matching batch signatures', () => {
  expect(isPlanSelectableForBatch(empty, [])).toBe(true);
  expect(isPlanSelectableForBatch(empty, [empty])).toBe(true);
  expect(isPlanSelectableForBatch(withProcess('same'), [])).toBe(true);
  expect(isPlanSelectableForBatch(withProcess('same'), [empty, withProcess('same')])).toBe(true);
  expect(isPlanSelectableForBatch(empty, [withProcess('same')])).toBe(true);
});

test('allows different approver teams when the backend signatures match', () => {
  const other: BatchPlan = {
    ...withProcess('same'),
    subscriptionProcess: [{ type: 'teamAdmin', id: 'other-admin', team: 'other-producer' }],
  };

  expect(isPlanSelectableForBatch(other, [withProcess('same')])).toBe(true);
});

test('rejects different processes even when an empty process is selected', () => {
  expect(isPlanSelectableForBatch(withProcess('different'), [empty, withProcess('same')])).toBe(
    false
  );
  expect(isPlanSelectableForBatch(withProcess('different'), [withProcess('same'), empty])).toBe(
    false
  );
  expect(isPlanSelectableForBatch(empty, [withProcess('same'), withProcess('different')])).toBe(
    false
  );
});

test('does not treat missing signatures as matching nonempty processes', () => {
  for (const checksum of [undefined, null, '']) {
    expect(isPlanSelectableForBatch(withProcess(checksum), [])).toBe(false);
    expect(isPlanSelectableForBatch(withProcess(checksum), [withProcess(checksum)])).toBe(false);
    expect(isPlanSelectableForBatch(empty, [withProcess(checksum)])).toBe(false);
  }
});

test('excludes payment steps even without payment settings', () => {
  const paid: BatchPlan = {
    subscriptionProcess: [
      {
        type: 'payment',
        id: 'payment',
        thirdPartyPaymentSettingsId: 'stripe',
      },
    ],
    subscriptionBatchProcessChecksum: 'payment',
  };

  expect(isPlanSelectableForBatch(paid, [])).toBe(false);
  expect(isPlanSelectableForBatch(empty, [paid])).toBe(false);
});

test('excludes plans with payment settings even without a payment step', () => {
  const paymentSettings: NonNullable<IUsagePlanGQL['paymentSettings']> = {
    type: ThirdPartyPaymentType.stripe,
    thirdPartyPaymentSettingsId: 'stripe',
  };
  const paid: BatchPlan = { ...empty, paymentSettings };

  expect(isPlanSelectableForBatch(paid, [])).toBe(false);
  expect(isPlanSelectableForBatch(empty, [paid])).toBe(false);
});

test('only offers an existing keyring when its Otoroshi binding matches', () => {
  const currentPlan = {
    _id: 'current-plan',
    customName: 'Current plan',
    aggregationApiKeysSecurity: true,
    otoroshiTarget: { otoroshiSettings: 'otoroshi-current' },
  };
  const otherPlan = {
    _id: 'other-plan',
    customName: 'Other plan',
    aggregationApiKeysSecurity: true,
    otoroshiTarget: { otoroshiSettings: 'otoroshi-other' },
  };
  const subscription = {
    _id: 'subscription',
    api: 'other-api',
    plan: otherPlan._id,
    planName: otherPlan.customName,
    apiName: 'Other API',
    customName: null,
    keyring: { _id: 'other-keyring', customName: 'Other keyring' },
  };
  const teamApiSubscriptions = {
    apis: [{ _id: 'other-api', possibleUsagePlans: [otherPlan] }],
    subscriptions: [subscription],
  };
  const tenant = { environmentAggregationApiKeysSecurity: false };

  const incompatible = findCompatibleSubscriptionsForPlans({
    plans: [currentPlan],
    tenant,
    teamApiSubscriptions,
  });
  expect(incompatible[0].subscriptions).toEqual([]);

  const compatible = findCompatibleSubscriptionsForPlans({
    plans: [otherPlan],
    tenant,
    teamApiSubscriptions,
  });
  expect(compatible[0].subscriptions).toEqual([subscription]);
});

const selectedPlan = (
  apiId: string,
  name = 'dev',
  settings = 'otoroshi',
  readOnly = false,
  aggregation = true
) => ({
  api: { _id: apiId, name: apiId },
  plan: {
    _id: `${apiId}-${name}`,
    customName: name,
    aggregationApiKeysSecurity: aggregation,
    otoroshiTarget: {
      otoroshiSettings: settings,
      apikeyCustomization: { readOnly },
    },
  },
});

test('shares one new keyring across APIs in each environment', () => {
  const selections = [
    selectedPlan('catalogue'),
    selectedPlan('billing'),
    selectedPlan('catalogue', 'prod'),
    selectedPlan('billing', 'prod'),
  ];
  const groups = groupBatchPlansByKeyring(selections);
  expect(groups.map(({ name, items }) => [name, items.length])).toEqual([
    ['dev', 2],
    ['prod', 2],
  ]);
  const payload = buildBatchKeyringSelection(groups, {}, {}, 'Consumers');
  expect(payload.newKeyrings.map(({ customName }) => customName)).toEqual([
    'Consumers - dev',
    'Consumers - prod',
  ]);
  expect(payload.items.map(({ keyringChoice }) => keyringChoice)).toEqual([
    { type: 'new', creation: payload.newKeyrings[0]._id },
    { type: 'new', creation: payload.newKeyrings[0]._id },
    { type: 'new', creation: payload.newKeyrings[1]._id },
    { type: 'new', creation: payload.newKeyrings[1]._id },
  ]);
});

test('separates incompatible bindings, read-only modes and non-aggregating plans', () => {
  const groups = groupBatchPlansByKeyring([
    selectedPlan('first'),
    selectedPlan('second', 'dev', 'other-otoroshi'),
    selectedPlan('third', 'dev', 'otoroshi', true),
    selectedPlan('fourth', 'dev', 'otoroshi', false, false),
    selectedPlan('fifth', 'dev', 'otoroshi', false, false),
  ]);
  expect(groups).toHaveLength(5);
  expect(buildBatchKeyringSelection(groups, {}, {}, 'Consumers').newKeyrings).toHaveLength(5);
});

test('keeps a group choice when its selected APIs change', () => {
  const before = groupBatchPlansByKeyring([selectedPlan('first')]);
  const after = groupBatchPlansByKeyring([selectedPlan('first'), selectedPlan('second')]);
  expect(after[0].key).toBe(before[0].key);
  const payload = buildBatchKeyringSelection(
    after,
    { [before[0].key]: 'existing-keyring' },
    {},
    'Consumers'
  );
  expect(payload.newKeyrings).toEqual([]);
  expect(payload.items.map(({ keyringChoice }) => keyringChoice)).toEqual([
    { type: 'existing', keyring: 'existing-keyring' },
    { type: 'existing', keyring: 'existing-keyring' },
  ]);
});

test('allows a mix of an existing keyring for dev and a named new keyring for prod', () => {
  const groups = groupBatchPlansByKeyring([
    selectedPlan('first'),
    selectedPlan('second'),
    selectedPlan('first', 'prod'),
    selectedPlan('second', 'prod'),
  ]);
  const payload = buildBatchKeyringSelection(
    groups,
    { [groups[0].key]: 'existing-dev' },
    { [groups[1].key]: ' Production keys ' },
    'Consumers'
  );
  expect(payload.newKeyrings).toEqual([{ _id: expect.any(String), customName: 'Production keys' }]);
  expect(payload.items.slice(0, 2).map(({ keyringChoice }) => keyringChoice)).toEqual([
    { type: 'existing', keyring: 'existing-dev' },
    { type: 'existing', keyring: 'existing-dev' },
  ]);
  expect(payload.items.slice(2).map(({ keyringChoice }) => keyringChoice)).toEqual([
    { type: 'new', creation: payload.newKeyrings[0]._id },
    { type: 'new', creation: payload.newKeyrings[0]._id },
  ]);
});

test('deduplicates compatible existing keyrings and checks every member', () => {
  const first = selectedPlan('first');
  const second = selectedPlan('second');
  const group = groupBatchPlansByKeyring([first, second])[0];
  const subscription = (item: typeof first) => ({
    _id: `subscription-${item.api._id}`,
    api: item.api._id,
    apiName: item.api.name,
    plan: item.plan._id,
    planName: item.plan.customName,
    customName: null,
    keyring: { _id: 'shared-keyring', customName: 'Dev keys' },
  });
  const existing = {
    apis: [first, second].map(({ api, plan }) => ({
      _id: api._id,
      possibleUsagePlans: [plan],
    })),
    subscriptions: [subscription(first), subscription(second)],
  };
  const tenant = { environmentAggregationApiKeysSecurity: true };
  expect(findCompatibleKeyringsForGroup(group, tenant, existing)).toEqual([
    { _id: 'shared-keyring', customName: 'Dev keys' },
  ]);
  expect(
    findCompatibleKeyringsForGroup(group, tenant, {
      ...existing,
      subscriptions: [
        existing.subscriptions[0],
        { ...existing.subscriptions[1], customReadOnly: true },
      ],
    })
  ).toEqual([]);
  expect(
    findCompatibleKeyringsForGroup(group, tenant, {
      ...existing,
      subscriptions: [
        existing.subscriptions[0],
        { ...existing.subscriptions[1], planName: 'prod' },
      ],
    })
  ).toEqual([]);
  expect(
    findCompatibleKeyringsForGroup(group, tenant, {
      ...existing,
      apis: existing.apis.slice(0, 1),
    })
  ).toEqual([]);
});

test('does not offer existing keyrings for plans that disallow aggregation', () => {
  const item = selectedPlan('first', 'dev', 'otoroshi', false, false);
  const group = groupBatchPlansByKeyring([item])[0];
  expect(
    findCompatibleKeyringsForGroup(
      group,
      {
        environmentAggregationApiKeysSecurity: false,
      },
      { apis: [], subscriptions: [] }
    )
  ).toEqual([]);
});
