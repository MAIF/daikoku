import { nanoid } from 'nanoid';
import type { IApiGQL } from '../types';
import type { ISubscriptionBatchSubmission, IUsagePlanGQL } from '../types/api';
import type { ITenant } from '../types/tenant';
import {
  findCompatibleKeyringsForGroup,
  groupBatchPlansByKeyring,
  isPlanSelectableForBatch,
} from './subscriptions';

export type WorkspacePlan = {
  api: Pick<IApiGQL, '_id' | 'name'>;
  plan: IUsagePlanGQL;
};

export type WorkspaceFolder = {
  id: string;
  name: string;
  keyring?: { _id: string; customName: string | null };
  items: WorkspacePlan[];
};

export type WorkspaceTenant = Pick<
  ITenant,
  'display' | 'aggregationApiKeysSecurity' | 'environmentAggregationApiKeysSecurity'
>;

export type TeamApiSubscriptions = Parameters<typeof findCompatibleKeyringsForGroup>[2];

export type WorkspaceProposalGroup = {
  key: string;
  environment: string;
  items: WorkspacePlan[];
  destination:
    | { type: 'new'; name: string }
    | { type: 'folder'; folderId: string }
    | { type: 'choice'; folderIds: string[] };
};

export type WorkspaceProposal = {
  groups: WorkspaceProposalGroup[];
  errors: Array<{ reason: string; items: WorkspacePlan[] }>;
};

export function workspacePlanKey(item: WorkspacePlan): string {
  return JSON.stringify([item.api._id, item.plan._id]);
}

export function getWorkspaceAssignmentError(
  item: WorkspacePlan,
  target: WorkspaceFolder,
  folders: WorkspaceFolder[],
  tenant: WorkspaceTenant,
  subscriptions: TeamApiSubscriptions
): string | undefined {
  const key = workspacePlanKey(item);
  const assigned = folders.flatMap((folder) =>
    folder.items.filter((candidate) => workspacePlanKey(candidate) !== key)
  );
  if (
    !isPlanSelectableForBatch(
      item.plan,
      assigned.map(({ plan }) => plan)
    )
  ) {
    return 'subscription.workspace.incompatible.process';
  }

  const others = target.items.filter((candidate) => workspacePlanKey(candidate) !== key);
  const items = [item, ...others];
  if (
    (others.length > 0 || target.keyring) &&
    (!tenant.aggregationApiKeysSecurity ||
      items.some(({ plan }) => !plan.aggregationApiKeysSecurity))
  ) {
    return 'subscription.workspace.incompatible.aggregation';
  }
  if (
    others.some(
      ({ plan }) =>
        plan.otoroshiTarget?.otoroshiSettings !== item.plan.otoroshiTarget?.otoroshiSettings
    )
  ) {
    return 'subscription.workspace.incompatible.binding';
  }
  if (
    others.some(
      ({ plan }) =>
        (plan.otoroshiTarget?.apikeyCustomization?.readOnly ?? false) !==
        (item.plan.otoroshiTarget?.apikeyCustomization?.readOnly ?? false)
    )
  ) {
    return 'subscription.workspace.incompatible.readonly';
  }
  const environmentAggregationApiKeysSecurity =
    tenant.display === 'environment' && tenant.environmentAggregationApiKeysSecurity;
  if (
    environmentAggregationApiKeysSecurity &&
    others.some(({ plan }) => plan.customName !== item.plan.customName)
  ) {
    return 'subscription.workspace.incompatible.environment';
  }
  if (
    target.keyring &&
    !items.every((candidate) =>
      findCompatibleKeyringsForGroup(
        {
          key: target.id,
          name: target.name,
          items: [candidate, ...items.filter((other) => other !== candidate)],
        },
        { environmentAggregationApiKeysSecurity },
        subscriptions
      ).some((keyring) => keyring._id === target.keyring?._id)
    )
  ) {
    return 'subscription.workspace.incompatible.existing';
  }
  return undefined;
}

export function proposeWorkspaceKeyrings(
  plans: WorkspacePlan[],
  folders: WorkspaceFolder[],
  tenant: WorkspaceTenant,
  subscriptions: TeamApiSubscriptions,
  choices: Record<string, string> = {}
): WorkspaceProposal {
  const assigned = folders.flatMap((folder) => folder.items);
  const assignedKeys = new Set(assigned.map(workspacePlanKey));
  const unassigned = [
    ...new Map(plans.map((item) => [workspacePlanKey(item), item])).values(),
  ].filter((item) => !assignedKeys.has(workspacePlanKey(item)));
  const proposal: WorkspaceProposal = { groups: [], errors: [] };
  if (unassigned.length === 0) return proposal;
  const batch = [...assigned, ...unassigned];
  if (
    !isPlanSelectableForBatch(
      batch[0].plan,
      batch.slice(1).map(({ plan }) => plan)
    )
  ) {
    proposal.errors.push({ reason: 'subscription.workspace.incompatible.process', items: batch });
    return proposal;
  }

  const workspace = folders.map((folder) => ({ ...folder, items: [...folder.items] }));
  const assignmentError = (items: WorkspacePlan[], target: WorkspaceFolder) => {
    const candidate = { ...target, items: [...target.items] };
    const context = [...workspace.filter((folder) => folder.id !== candidate.id), candidate];
    for (const item of items) {
      const reason = getWorkspaceAssignmentError(item, candidate, context, tenant, subscriptions);
      if (reason) return reason;
      candidate.items.push(item);
    }
    return undefined;
  };

  for (const group of groupBatchPlansByKeyring(unassigned)) {
    const partitions: WorkspacePlan[][] = [];
    for (const item of group.items) {
      const partition = partitions.at(-1);
      if (partition && !assignmentError([item], { id: '', name: group.name, items: partition })) {
        partition.push(item);
      } else {
        partitions.push([item]);
      }
    }
    for (const items of partitions) {
      const key = JSON.stringify(items.map(workspacePlanKey));
      const compatible = workspace.filter((folder) => !assignmentError(items, folder));
      const imported = compatible.filter((folder) => folder.keyring);
      const candidates = imported.length > 0 ? imported : compatible;
      const choice = choices[key];
      const selected =
        choice !== undefined
          ? candidates.find((folder) => folder.id === choice)
          : candidates.length === 1
            ? candidates[0]
            : undefined;
      let destination: WorkspaceProposalGroup['destination'];
      if (choice !== undefined && !selected) {
        proposal.errors.push({ reason: 'subscription.workspace.invalid', items });
        destination = { type: 'choice', folderIds: candidates.map((folder) => folder.id) };
      } else if (selected) {
        destination = { type: 'folder', folderId: selected.id };
        selected.items.push(...items);
      } else if (candidates.length > 1) {
        destination = { type: 'choice', folderIds: candidates.map((folder) => folder.id) };
      } else {
        destination = { type: 'new', name: group.name };
      }
      proposal.groups.push({ key, environment: group.name, items: [...items], destination });
    }
  }
  return proposal;
}

export function buildWorkspaceProposalDraft(
  proposal: WorkspaceProposal,
  folders: WorkspaceFolder[],
  tenant: WorkspaceTenant,
  subscriptions: TeamApiSubscriptions,
  names: Record<string, string> = {}
): WorkspaceFolder[] {
  if (proposal.errors.length > 0) throw new Error('subscription.workspace.invalid');
  const next = folders.map((folder) => ({ ...folder, items: [...folder.items] }));
  const assignedKeys = new Set(next.flatMap(({ items }) => items.map(workspacePlanKey)));
  for (const group of proposal.groups) {
    if (group.destination.type === 'choice') throw new Error('subscription.workspace.invalid');
    const destination = group.destination;
    let target: WorkspaceFolder | undefined;
    if (destination.type === 'new') {
      target = {
        id: nanoid(),
        name: (names[group.key] ?? destination.name).trim(),
        items: [],
      };
      if (!target.name) throw new Error('subscription.workspace.name.required');
      next.push(target);
    } else {
      target = next.find((folder) => folder.id === destination.folderId);
    }
    if (!target) throw new Error('subscription.workspace.invalid');
    for (const item of group.items) {
      const key = workspacePlanKey(item);
      if (assignedKeys.has(key)) throw new Error('subscription.workspace.invalid');
      const reason = getWorkspaceAssignmentError(item, target, next, tenant, subscriptions);
      if (reason) throw new Error(reason);
      target.items.push(item);
      assignedKeys.add(key);
    }
  }
  buildWorkspaceSubmission(next, tenant, subscriptions);
  return next;
}

/** Validate the workspace again at submission; folder IDs are stable creation IDs across retries. */
export function buildWorkspaceSubmission(
  folders: WorkspaceFolder[],
  tenant: WorkspaceTenant,
  subscriptions: TeamApiSubscriptions
): Pick<ISubscriptionBatchSubmission, 'items' | 'newKeyrings'> {
  const result: Pick<ISubscriptionBatchSubmission, 'items' | 'newKeyrings'> = {
    items: [],
    newKeyrings: [],
  };
  const planKeys = new Set<string>();
  const folderIds = new Set<string>();
  const keyringIds = new Set<string>();
  for (const folder of folders.filter(({ items }) => items.length > 0)) {
    if (!folder.id.trim() || folderIds.has(folder.id)) {
      throw new Error('subscription.workspace.invalid');
    }
    folderIds.add(folder.id);
    if (folder.keyring) {
      if (!folder.keyring._id.trim() || keyringIds.has(folder.keyring._id)) {
        throw new Error('subscription.workspace.invalid');
      }
      keyringIds.add(folder.keyring._id);
    } else {
      const customName = folder.name.trim();
      if (!customName) throw new Error('subscription.workspace.name.required');
      result.newKeyrings.push({ _id: folder.id, customName });
    }
    for (const item of folder.items) {
      const key = workspacePlanKey(item);
      if (planKeys.has(key)) throw new Error('subscription.workspace.invalid');
      planKeys.add(key);
      const error = getWorkspaceAssignmentError(item, folder, folders, tenant, subscriptions);
      if (error) throw new Error(error);
      result.items.push({
        api: item.api._id,
        plan: item.plan._id,
        keyringChoice: folder.keyring
          ? { type: 'existing', keyring: folder.keyring._id }
          : { type: 'new', creation: folder.id },
      });
    }
  }
  return result;
}
