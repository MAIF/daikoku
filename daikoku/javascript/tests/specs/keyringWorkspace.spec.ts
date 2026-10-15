import { expect, test } from '@playwright/test';
import {
  buildWorkspaceSubmission,
  buildWorkspaceProposalDraft,
  getWorkspaceAssignmentError,
  proposeWorkspaceKeyrings,
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

test('proposal prefers imported keys and leaves the draft and subscription data unchanged', () => {
  const assigned = item('assigned');
  const joining = item('joining');
  const subscriptions = existingSubscriptions([item('member')]);
  const folders = [
    folder('prepared', [assigned]),
    folder('imported', [], { _id: 'existing', customName: 'Existing keys' }),
  ];
  const before = JSON.stringify({ plans: [assigned, joining], folders, subscriptions });
  const proposal = proposeWorkspaceKeyrings([assigned, joining], folders, tenant, subscriptions);
  expect(proposal.errors).toEqual([]);
  expect(proposal.groups).toEqual([
    {
      key: expect.any(String),
      environment: 'dev',
      items: [joining],
      destination: { type: 'folder', folderId: 'imported' },
    },
  ]);
  expect(JSON.stringify({ plans: [assigned, joining], folders, subscriptions })).toBe(before);
});

test('proposal reuses a prepared key when no imported key is compatible', () => {
  const subscriptions = existingSubscriptions([item('member')]);
  subscriptions.subscriptions[0].customReadOnly = true;
  const folders = [
    folder('imported', [], { _id: 'existing', customName: null }),
    folder('prepared', [item('assigned')]),
  ];
  const proposal = proposeWorkspaceKeyrings([item('joining')], folders, tenant, subscriptions);
  expect(proposal.errors).toEqual([]);
  expect(proposal.groups[0].destination).toEqual({ type: 'folder', folderId: 'prepared' });
});

test('proposal asks between compatible imported keys and accepts an explicit choice', () => {
  const subscriptions = existingSubscriptions([item('member-a'), item('member-b')]);
  const secondKeyring = { _id: 'second-existing', customName: 'Second existing keys' };
  subscriptions.subscriptions[1].keyring = secondKeyring;
  const folders = [
    folder('prepared'),
    folder('import-a', [], { _id: 'existing', customName: null }),
    folder('import-b', [], secondKeyring),
  ];
  const plans = [item('joining-a'), item('joining-b')];
  const proposal = proposeWorkspaceKeyrings(plans, folders, tenant, subscriptions);
  expect(proposal.errors).toEqual([]);
  expect(proposal.groups[0].destination).toEqual({
    type: 'choice',
    folderIds: ['import-a', 'import-b'],
  });
  const resolved = proposeWorkspaceKeyrings(plans, folders, tenant, subscriptions, {
    [proposal.groups[0].key]: 'import-b',
  });
  expect(resolved.groups[0].destination).toEqual({ type: 'folder', folderId: 'import-b' });
  expect(resolved.errors).toEqual([]);
  expect(folders.every((target) => target.items.length === 0)).toBe(true);
});

test('proposal asks between prepared keys and revalidates competing choices', () => {
  const plans = [item('development'), item('production', { _id: 'prod', customName: 'prod' })];
  const folders = [folder('first'), folder('second')];
  const proposal = proposeWorkspaceKeyrings(plans, folders, tenant, emptySubscriptions);
  expect(proposal.groups.map(({ destination }) => destination)).toEqual([
    { type: 'choice', folderIds: ['first', 'second'] },
    { type: 'choice', folderIds: ['first', 'second'] },
  ]);
  const choices = {
    [proposal.groups[0].key]: 'first',
    [proposal.groups[1].key]: 'first',
  };
  const conflicting = proposeWorkspaceKeyrings(plans, folders, tenant, emptySubscriptions, choices);
  expect(conflicting.errors).toEqual([
    {
      reason: 'subscription.workspace.invalid',
      items: [plans[1]],
    },
  ]);
  expect(conflicting.groups[1].destination).toEqual({ type: 'choice', folderIds: ['second'] });
  const resolved = proposeWorkspaceKeyrings(plans, folders, tenant, emptySubscriptions, {
    ...choices,
    [proposal.groups[1].key]: 'second',
  });
  expect(resolved.errors).toEqual([]);
  expect(resolved.groups.map(({ destination }) => destination)).toEqual([
    { type: 'folder', folderId: 'first' },
    { type: 'folder', folderId: 'second' },
  ]);
});

test('proposal does not promise an empty prepared key to incompatible environments', () => {
  const plans = [item('development'), item('production', { _id: 'prod', customName: 'prod' })];
  const folders = [folder('prepared')];
  const proposal = proposeWorkspaceKeyrings(plans, folders, tenant, emptySubscriptions);
  expect(proposal.errors).toEqual([]);
  expect(proposal.groups.map(({ destination }) => destination)).toEqual([
    { type: 'folder', folderId: 'prepared' },
    { type: 'new', name: 'prod' },
  ]);
  expect(folders[0].items).toEqual([]);
});

test('proposal creates separate keys for bindings, read-only modes and aggregation restrictions', () => {
  const cases: Array<{ plans: WorkspacePlan[]; settings: WorkspaceTenant }> = [
    {
      plans: [item('first'), item('second', { otoroshiTarget: { otoroshiSettings: 'other' } })],
      settings: tenant,
    },
    {
      plans: [item('first'), item('second', { otoroshiTarget: withReadOnly(true) })],
      settings: tenant,
    },
    {
      plans: [item('first'), item('second', { aggregationApiKeysSecurity: false })],
      settings: tenant,
    },
    {
      plans: [item('first'), item('second')],
      settings: { ...tenant, aggregationApiKeysSecurity: false },
    },
  ];
  for (const { plans, settings } of cases) {
    const proposal = proposeWorkspaceKeyrings(plans, [], settings, emptySubscriptions);
    expect(proposal.errors).toEqual([]);
    expect(proposal.groups).toHaveLength(2);
    expect(
      proposal.groups.every(
        ({ items, destination }) => items.length === 1 && destination.type === 'new'
      )
    ).toBe(true);
  }
});

test('proposal keeps exact environment groups even when environment separation is not mandatory', () => {
  const plans = [item('first'), item('second', { customName: 'DEV' })];
  const proposal = proposeWorkspaceKeyrings(
    plans,
    [],
    {
      ...tenant,
      environmentAggregationApiKeysSecurity: false,
    },
    emptySubscriptions
  );
  expect(proposal.groups.map(({ environment }) => environment)).toEqual(['dev', 'DEV']);
  expect(proposal.groups.map(({ destination }) => destination)).toEqual([
    { type: 'new', name: 'dev' },
    { type: 'new', name: 'DEV' },
  ]);
});

test('proposal reports global process conflicts without choosing a subset', () => {
  const processed = (api: string, checksum: string | null) =>
    item(api, {
      subscriptionProcess: [{ type: 'teamAdmin', id: 'admin', team: 'producer' }],
      subscriptionBatchProcessChecksum: checksum,
    });
  const first = processed('first', 'first-process');
  const second = processed('second', 'second-process');
  const neutral = item('neutral');
  for (const folders of [[], [folder('assigned', [first])]]) {
    const proposal = proposeWorkspaceKeyrings(
      [first, second, neutral],
      folders,
      tenant,
      emptySubscriptions
    );
    expect(proposal.groups).toEqual([]);
    expect(proposal.errors).toEqual([
      {
        reason: incompatible('process'),
        items: [first, second, neutral],
      },
    ]);
  }
  const invalid = processed('invalid', null);
  expect(proposeWorkspaceKeyrings([invalid], [], tenant, emptySubscriptions).errors).toEqual([
    {
      reason: incompatible('process'),
      items: [invalid],
    },
  ]);
});

test('proposal deduplicates candidates and ignores every already assigned plan', () => {
  const assigned = item('assigned');
  const joining = item('joining');
  const folders = [folder('prepared', [assigned])];
  const proposal = proposeWorkspaceKeyrings(
    [assigned, joining, joining],
    folders,
    tenant,
    emptySubscriptions
  );
  expect(proposal.groups).toHaveLength(1);
  expect(proposal.groups[0].items).toEqual([joining]);
  expect(proposeWorkspaceKeyrings([assigned], folders, tenant, emptySubscriptions)).toEqual({
    groups: [],
    errors: [],
  });
});

test('proposal never imports team keys itself or silently accepts a stale destination choice', () => {
  const subscriptions = existingSubscriptions([item('member')]);
  const plans = [item('joining')];
  const proposal = proposeWorkspaceKeyrings(plans, [], tenant, subscriptions);
  expect(proposal.groups[0].destination).toEqual({ type: 'new', name: 'dev' });
  const stale = proposeWorkspaceKeyrings(plans, [], tenant, subscriptions, {
    [proposal.groups[0].key]: 'removed-folder',
  });
  expect(stale.errors).toEqual([{ reason: 'subscription.workspace.invalid', items: plans }]);
  expect(stale.groups[0].destination).toEqual({ type: 'choice', folderIds: [] });
});

test('proposal refuses payment settings and payment steps before assigning any plans', () => {
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
    const proposal = proposeWorkspaceKeyrings([paid], [], tenant, emptySubscriptions);
    expect(proposal.groups).toEqual([]);
    expect(proposal.errors).toEqual([{ reason: incompatible('process'), items: [paid] }]);
  }
});

test('proposal organizes 250 plans into ten environment keys and produces a valid submission', () => {
  const plans = Array.from({ length: 25 }, (_, apiIndex) =>
    Array.from({ length: 10 }, (_, environmentIndex) =>
      item(`api-${apiIndex}`, {
        _id: `plan-${environmentIndex}`,
        customName: `environment-${environmentIndex}`,
      })
    )
  ).flat();
  const before = JSON.stringify(plans);
  const proposal = proposeWorkspaceKeyrings(plans, [], tenant, emptySubscriptions);
  expect(proposal.errors).toEqual([]);
  expect(proposal.groups).toHaveLength(10);
  expect(proposal.groups.every(({ items }) => items.length === 25)).toBe(true);
  expect(new Set(proposal.groups.flatMap(({ items }) => items.map(workspacePlanKey))).size).toBe(
    250
  );
  const folders = proposal.groups.map((group, index) => ({
    id: `proposed-${index}`,
    name: group.environment,
    items: group.items,
  }));
  const payload = buildWorkspaceSubmission(folders, tenant, emptySubscriptions);
  expect(payload.items).toHaveLength(250);
  expect(payload.newKeyrings).toHaveLength(10);
  expect(proposeWorkspaceKeyrings(plans, [], tenant, emptySubscriptions)).toEqual(proposal);
  expect(JSON.stringify(plans)).toBe(before);
});

test('applying a proposal builds a renamed local draft without changing existing assignments', () => {
  const assigned = item('assigned');
  const joining = item('joining');
  const production = item('production', { _id: 'prod', customName: 'prod' });
  const folders = [folder('prepared', [assigned])];
  const proposal = proposeWorkspaceKeyrings(
    [assigned, joining, production],
    folders,
    tenant,
    emptySubscriptions
  );
  const before = JSON.stringify(folders);
  const productionGroup = proposal.groups.find(({ environment }) => environment === 'prod')!;
  const next = buildWorkspaceProposalDraft(proposal, folders, tenant, emptySubscriptions, {
    [productionGroup.key]: '  Production access  ',
  });
  expect(JSON.stringify(folders)).toBe(before);
  expect(next[0].items).toEqual([assigned, joining]);
  expect(next[1]).toEqual({
    id: expect.any(String),
    name: 'Production access',
    items: [production],
  });
  expect(buildWorkspaceSubmission(next, tenant, emptySubscriptions).items).toHaveLength(3);
});

test('applying a proposal rejects unresolved, stale or duplicate assignments atomically', () => {
  const plans = [item('joining')];
  const folders = [folder('first'), folder('second')];
  const proposal = proposeWorkspaceKeyrings(plans, folders, tenant, emptySubscriptions);
  const before = JSON.stringify(folders);
  expect(() => buildWorkspaceProposalDraft(proposal, folders, tenant, emptySubscriptions)).toThrow(
    'subscription.workspace.invalid'
  );
  const resolved = proposeWorkspaceKeyrings(plans, folders, tenant, emptySubscriptions, {
    [proposal.groups[0].key]: 'first',
  });
  expect(() => buildWorkspaceProposalDraft(resolved, [], tenant, emptySubscriptions)).toThrow(
    'subscription.workspace.invalid'
  );
  expect(() =>
    buildWorkspaceProposalDraft(resolved, [folder('first', plans)], tenant, emptySubscriptions)
  ).toThrow('subscription.workspace.invalid');
  expect(JSON.stringify(folders)).toBe(before);
  const newKey = proposeWorkspaceKeyrings(plans, [], tenant, emptySubscriptions);
  expect(() =>
    buildWorkspaceProposalDraft(newKey, [], tenant, emptySubscriptions, {
      [newKey.groups[0].key]: ' ',
    })
  ).toThrow('subscription.workspace.name.required');
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
