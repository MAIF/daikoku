import { expect, test } from '@playwright/test';
import {
  buildWorkspaceSubmission,
  getWorkspaceAssignmentError,
  workspacePlanKey,
  type TeamApiSubscriptions,
  type WorkspaceFolder,
  type WorkspacePlan,
  type WorkspaceTenant,
} from '../../src/services/keyringWorkspace';
import { UsagePlanVisibility, type IUsagePlanGQL } from '../../src/types/api';
import { Display, ThirdPartyPaymentType } from '../../src/types/tenant';

const tenant: WorkspaceTenant = {
  display: Display.environment,
  aggregationApiKeysSecurity: true,
  environmentAggregationApiKeysSecurity: true,
};
const emptySubscriptions: TeamApiSubscriptions = { apis: [], subscriptions: [] };
const item = (api = 'api', overrides: Partial<IUsagePlanGQL> = {}): WorkspacePlan => ({
  api: { _id: api, name: api },
  plan: {
    _id: 'dev',
    _tenant: 'tenant',
    customName: 'dev',
    authorizedTeams: [],
    integrationProcess: 'Automatic',
    rotation: false,
    visibility: UsagePlanVisibility.public,
    subscriptionProcess: [],
    subscriptionProcessChecksum: '',
    aggregationApiKeysSecurity: true,
    otoroshiTarget: { otoroshiSettings: 'otoroshi' },
    ...overrides,
  } satisfies IUsagePlanGQL,
});
const folder = (
  id = 'new-folder',
  items: WorkspacePlan[] = [],
  keyring?: WorkspaceFolder['keyring']
): WorkspaceFolder => ({ id, name: `Keys ${id}`, items, keyring });
const existingSubscriptions = (members: WorkspacePlan[]): TeamApiSubscriptions => ({
  apis: members.map(({ api, plan }) => ({ _id: api._id, possibleUsagePlans: [plan] })),
  subscriptions: members.map(({ api, plan }, index) => ({
    _id: `subscription-${index}`,
    api: api._id,
    apiName: api.name,
    plan: plan._id,
    planName: plan.customName,
    customName: null,
    keyring: { _id: 'existing', customName: 'Existing keys' },
  })),
});
const withReadOnly = (readOnly: boolean): IUsagePlanGQL['otoroshiTarget'] => ({
  otoroshiSettings: 'otoroshi',
  apikeyCustomization: {
    clientIdOnly: false,
    constrainedServicesOnly: false,
    readOnly,
    tags: [],
    metadata: {},
    customMetadata: [],
    restrictions: { enabled: false, allowLast: true, allowed: [], forbidden: [], notFound: [] },
  },
});
const error = (
  candidate: WorkspacePlan,
  target: WorkspaceFolder,
  folders = [target],
  settings = tenant,
  subscriptions = emptySubscriptions
) => getWorkspaceAssignmentError(candidate, target, folders, settings, subscriptions);
const incompatible = (kind: string) => `subscription.workspace.incompatible.${kind}`;

test('plan identity is API-scoped and collision-safe', () => {
  expect(workspacePlanKey(item('first'))).toBe(JSON.stringify(['first', 'dev']));
  expect(workspacePlanKey(item('first'))).not.toBe(workspacePlanKey(item('second')));
  expect(workspacePlanKey(item('a,b', { _id: 'c' }))).not.toBe(
    workspacePlanKey(item('a', { _id: 'b,c' }))
  );
});

test('groups cross-API plans by environment only when environment aggregation is enabled', () => {
  const target = folder('target', [item('first')]);
  expect(error(item('second'), target)).toBeUndefined();
  const production = item('second', { customName: 'prod' });
  expect(error(production, target)).toBe(incompatible('environment'));
  expect(
    error(production, target, [target], { ...tenant, display: Display.default })
  ).toBeUndefined();
  expect(
    error(production, target, [target], {
      ...tenant,
      environmentAggregationApiKeysSecurity: false,
    })
  ).toBeUndefined();
});

test('rejects different Otoroshi bindings and internal/Otoroshi mixtures but allows internal groups', () => {
  const target = folder('target', [item('first')]);
  expect(error(item('second', { otoroshiTarget: { otoroshiSettings: 'other' } }), target)).toBe(
    incompatible('binding')
  );
  expect(error(item('second', { otoroshiTarget: undefined }), target)).toBe(
    incompatible('binding')
  );
  expect(
    error(
      item('second', { otoroshiTarget: undefined }),
      folder('internal', [item('first', { otoroshiTarget: {} })])
    )
  ).toBeUndefined();
});

test('rejects mixed read-only modes and normalizes missing read-only to false', () => {
  const target = folder('target', [item('first')]);
  expect(error(item('second', { otoroshiTarget: withReadOnly(true) }), target)).toBe(
    incompatible('readonly')
  );
  expect(error(item('second', { otoroshiTarget: withReadOnly(false) }), target)).toBeUndefined();
  expect(
    error(
      item('second', { otoroshiTarget: withReadOnly(true) }),
      folder('readonly', [item('first', { otoroshiTarget: withReadOnly(true) })])
    )
  ).toBeUndefined();
});

test('tenant and every plan must allow aggregation for grouped or existing keyrings', () => {
  const target = folder('target', [item('first')]);
  const noAggregation = item('second', { aggregationApiKeysSecurity: false });
  expect(error(noAggregation, target)).toBe(incompatible('aggregation'));
  expect(error(item('first'), folder('target', [noAggregation]))).toBe(incompatible('aggregation'));
  expect(
    error(item('second'), target, [target], { ...tenant, aggregationApiKeysSecurity: false })
  ).toBe(incompatible('aggregation'));
  expect(error(noAggregation, folder())).toBeUndefined();
  expect(
    error(noAggregation, folder(), [], { ...tenant, aggregationApiKeysSecurity: false })
  ).toBeUndefined();
  const existing = folder('existing-folder', [], { _id: 'existing', customName: null });
  expect(error(noAggregation, existing)).toBe(incompatible('aggregation'));
  expect(
    error(item(), existing, [existing], { ...tenant, aggregationApiKeysSecurity: false })
  ).toBe(incompatible('aggregation'));
});

test('validates process compatibility globally across separate folders', () => {
  const processed = (api: string, checksum: string | null) =>
    item(api, {
      subscriptionProcess: [{ type: 'teamAdmin', id: 'admin', team: api }],
      subscriptionBatchProcessChecksum: checksum,
    });
  const target = folder('target');
  const other = folder('other', [processed('first', 'same')]);
  expect(error(processed('second', 'same'), target, [target, other])).toBeUndefined();
  expect(error(processed('second', 'different'), target, [target, other])).toBe(
    incompatible('process')
  );
  expect(error(processed('second', null), target)).toBe(incompatible('process'));
  expect(error(item('second'), target, [target, other])).toBeUndefined();
  const invalid = folder('invalid', [processed('third', 'different')]);
  expect(error(item('second'), target, [target, other, invalid])).toBe(incompatible('process'));
});

test('rejects payment settings and payment steps using batch eligibility', () => {
  const target = folder();
  for (const paid of [
    item('paid', {
      paymentSettings: {
        type: ThirdPartyPaymentType.stripe,
        thirdPartyPaymentSettingsId: 'stripe',
      },
    }),
    item('paid', {
      subscriptionProcess: [
        { type: 'payment', id: 'payment', thirdPartyPaymentSettingsId: 'stripe' },
      ],
      subscriptionBatchProcessChecksum: 'paid',
    }),
  ]) {
    expect(error(paid, target)).toBe(incompatible('process'));
    expect(error(item(), target, [target, folder('paid', [paid])])).toBe(incompatible('process'));
  }
});

test('moving an item excludes its old assignment and dropping it on its own folder is harmless', () => {
  const selected = item('first', { aggregationApiKeysSecurity: false });
  const source = folder('source', [selected]);
  const target = folder('target');
  const before = JSON.stringify([source, target]);
  expect(error(selected, source, [source, target])).toBeUndefined();
  expect(error(selected, target, [source, target])).toBeUndefined();
  expect(JSON.stringify([source, target])).toBe(before);
  const other = item('second');
  expect(error(other, source, [source, target])).toBe(incompatible('aggregation'));
});

test('existing keyrings validate all existing members, including effective read-only overrides', () => {
  const members = [item('member-a'), item('member-b')];
  const subscriptions = existingSubscriptions(members);
  const target = folder('existing-folder', [], { _id: 'existing', customName: null });
  expect(error(item(), target, [target], tenant, subscriptions)).toBeUndefined();
  const mismatches: TeamApiSubscriptions[] = [
    { ...subscriptions, apis: subscriptions.apis.slice(0, 1) },
    {
      ...subscriptions,
      subscriptions: [
        subscriptions.subscriptions[0],
        { ...subscriptions.subscriptions[1], customReadOnly: true },
      ],
    },
    existingSubscriptions([members[0], item('member-b', { otoroshiTarget: undefined })]),
    {
      ...subscriptions,
      subscriptions: [
        subscriptions.subscriptions[0],
        { ...subscriptions.subscriptions[1], planName: 'prod' },
      ],
    },
  ];
  for (const mismatch of mismatches) {
    expect(error(item(), target, [target], tenant, mismatch)).toBe(incompatible('existing'));
  }
  const override = existingSubscriptions([
    item('readonly', { otoroshiTarget: withReadOnly(true) }),
  ]);
  override.subscriptions[0].customReadOnly = false;
  expect(error(item(), target, [target], tenant, override)).toBeUndefined();
});

test('existing keyrings require an eligible member and validate every joining folder plan', () => {
  const target = folder('existing-folder', [item('first')], {
    _id: 'existing',
    customName: null,
  });
  expect(error(item('second'), target)).toBe(incompatible('existing'));
  const subscriptions = existingSubscriptions([item('member')]);
  expect(error(item('second'), target, [target], tenant, subscriptions)).toBeUndefined();
  expect(
    error(
      item('second'),
      { ...target, items: [item('first', { aggregationApiKeysSecurity: false })] },
      [target],
      tenant,
      subscriptions
    )
  ).toBe(incompatible('aggregation'));
  const nonAggregating = existingSubscriptions([
    item('member', { aggregationApiKeysSecurity: false }),
  ]);
  expect(error(item('second'), target, [target], tenant, nonAggregating)).toBe(
    incompatible('existing')
  );
});

test('existing keyring environment matching is disabled in default display mode', () => {
  const subscriptions = existingSubscriptions([item('member', { customName: 'prod' })]);
  const target = folder('existing-folder', [], { _id: 'existing', customName: null });
  expect(error(item(), target, [target], tenant, subscriptions)).toBe(incompatible('existing'));
  expect(
    error(item(), target, [target], { ...tenant, display: Display.default }, subscriptions)
  ).toBeUndefined();
});

test('builds mixed existing and new folders with stable IDs, trimmed names and no mutation', () => {
  const first = item('first');
  const second = item('second');
  const third = item('third');
  const folders = [
    { ...folder('new-a', [first, second]), name: '  Development keys  ' },
    { ...folder('import', [third], { _id: 'existing', customName: 'Existing' }), name: '' },
    folder('empty'),
  ];
  const subscriptions = existingSubscriptions([item('member')]);
  const before = JSON.stringify(folders);
  const expected = {
    newKeyrings: [{ _id: 'new-a', customName: 'Development keys' }],
    items: [
      { api: 'first', plan: 'dev', keyringChoice: { type: 'new', creation: 'new-a' } },
      { api: 'second', plan: 'dev', keyringChoice: { type: 'new', creation: 'new-a' } },
      { api: 'third', plan: 'dev', keyringChoice: { type: 'existing', keyring: 'existing' } },
    ],
  };
  expect(buildWorkspaceSubmission(folders, tenant, subscriptions)).toEqual(expected);
  expect(buildWorkspaceSubmission(folders, tenant, subscriptions)).toEqual(expected);
  expect(JSON.stringify(folders)).toBe(before);
});

test('allows multiple new folders for the same compatible environment', () => {
  const folders = [folder('new-a', [item('first')]), folder('new-b', [item('second')])];
  const payload = buildWorkspaceSubmission(folders, tenant, emptySubscriptions);
  expect(payload.newKeyrings.map(({ _id }) => _id)).toEqual(['new-a', 'new-b']);
  expect(payload.items.map(({ keyringChoice }) => keyringChoice)).toEqual([
    { type: 'new', creation: 'new-a' },
    { type: 'new', creation: 'new-b' },
  ]);
});

test('omits empty folders even with blank names or duplicate existing keyring choices', () => {
  const keyring = { _id: 'existing', customName: null };
  const folders = [
    { ...folder('empty'), name: ' ' },
    folder('empty-existing-a', [], keyring),
    folder('empty-existing-b', [], keyring),
  ];
  expect(buildWorkspaceSubmission(folders, tenant, emptySubscriptions)).toEqual({
    items: [],
    newKeyrings: [],
  });
});

test('rejects blank names for nonempty new folders', () => {
  expect(() =>
    buildWorkspaceSubmission(
      [{ ...folder('new', [item()]), name: ' \n ' }],
      tenant,
      emptySubscriptions
    )
  ).toThrow('subscription.workspace.name.required');
});

test('rejects duplicate plans within one folder or across folders without conflating different APIs', () => {
  const selected = item();
  for (const folders of [
    [folder('new', [selected, selected])],
    [folder('new-a', [selected]), folder('new-b', [selected])],
  ]) {
    expect(() => buildWorkspaceSubmission(folders, tenant, emptySubscriptions)).toThrow(
      'subscription.workspace.invalid'
    );
  }
  expect(() =>
    buildWorkspaceSubmission(
      [folder('new', [item('first'), item('second')])],
      tenant,
      emptySubscriptions
    )
  ).not.toThrow();
});

test('rejects duplicate existing keyrings and duplicate or blank creation IDs', () => {
  const keyring = { _id: 'existing', customName: null };
  const subscriptions = existingSubscriptions([item('member')]);
  for (const folders of [
    [folder('a', [item('first')], keyring), folder('b', [item('second')], keyring)],
    [folder('same', [item('first')]), folder('same', [item('second')])],
    [folder(' ', [item()])],
    [folder('existing', [item()], { _id: ' ', customName: null })],
  ]) {
    expect(() => buildWorkspaceSubmission(folders, tenant, subscriptions)).toThrow(
      'subscription.workspace.invalid'
    );
  }
});

test('submission revalidates assignment rules instead of trusting drag/drop checks', () => {
  const processed = (api: string, checksum: string) =>
    item(api, {
      subscriptionProcess: [{ type: 'teamAdmin', id: 'admin', team: 'producer' }],
      subscriptionBatchProcessChecksum: checksum,
    });
  const invalidWorkspaces: Array<{ folders: WorkspaceFolder[]; reason: string }> = [
    {
      folders: [folder('new', [item('first'), item('second', { customName: 'prod' })])],
      reason: 'environment',
    },
    {
      folders: [folder('new', [item('first'), item('second', { otoroshiTarget: undefined })])],
      reason: 'binding',
    },
    {
      folders: [
        folder('new', [item('first'), item('second', { otoroshiTarget: withReadOnly(true) })]),
      ],
      reason: 'readonly',
    },
    {
      folders: [
        folder('new', [item('first'), item('second', { aggregationApiKeysSecurity: false })]),
      ],
      reason: 'aggregation',
    },
    {
      folders: [
        folder('first', [processed('first', 'one')]),
        folder('second', [processed('second', 'two')]),
      ],
      reason: 'process',
    },
    {
      folders: [folder('import', [item()], { _id: 'unknown', customName: null })],
      reason: 'existing',
    },
  ];
  for (const { folders, reason } of invalidWorkspaces) {
    expect(() => buildWorkspaceSubmission(folders, tenant, emptySubscriptions)).toThrow(
      new Error(incompatible(reason))
    );
  }
  expect(() =>
    buildWorkspaceSubmission(
      [folder('new', [item('first'), item('second')])],
      { ...tenant, aggregationApiKeysSecurity: false },
      emptySubscriptions
    )
  ).toThrow(new Error(incompatible('aggregation')));
});
