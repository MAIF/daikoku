import type { IApiGQL } from '../types';
import type { ISubscriptionBatchSubmission, IUsagePlanGQL } from '../types/api';
import type { ITenant } from '../types/tenant';
import { findCompatibleKeyringsForGroup, isPlanSelectableForBatch } from './subscriptions';

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
