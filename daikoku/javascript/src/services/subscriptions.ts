import { nanoid } from 'nanoid';
import type { ISubscriptionBatchSubmission, IUsagePlanGQL } from '../types/api';
import type { IApiGQL, ISubscriptionWithApiInfo } from '../types';
import type { ITenant } from '../types/tenant';

type BatchPlan = Pick<
  IUsagePlanGQL,
  'paymentSettings' | 'subscriptionProcess' | 'subscriptionBatchProcessChecksum'
>;

export function isBatchPlanAvailable({
  apiId,
  plan,
  ownerTeamId,
  teamId,
  subscriptions,
  pendingPlans,
}: {
  apiId: string;
  plan: BatchPlan &
    Pick<IUsagePlanGQL, '_id' | 'visibility' | 'authorizedTeams' | 'allowMultipleKeys'>;
  ownerTeamId: string;
  teamId: string;
  subscriptions: Array<{ api: string; plan: string }>;
  pendingPlans: Array<{ api: string; plan: string }>;
}): boolean {
  return (
    (ownerTeamId === teamId ||
      plan.visibility !== 'Private' ||
      plan.authorizedTeams.some((team) => team._id === teamId)) &&
    (plan.allowMultipleKeys === true ||
      !subscriptions.some(
        (subscription) => subscription.api === apiId && subscription.plan === plan._id
      )) &&
    !pendingPlans.some((pending) => pending.api === apiId && pending.plan === plan._id) &&
    isPlanSelectableForBatch(plan, [])
  );
}
type CompatiblePlan = Pick<IUsagePlanGQL, '_id' | 'customName' | 'aggregationApiKeysSecurity'> & {
  otoroshiTarget?: {
    otoroshiSettings?: string;
    apikeyCustomization?: { readOnly?: boolean };
  };
};
type ExistingPlan = {
  _id: string;
  aggregationApiKeysSecurity?: boolean;
  otoroshiTarget?: {
    otoroshiSettings?: string;
    apikeyCustomization?: { readOnly?: boolean };
  };
};
type CompatibleSubscription = Pick<
  ISubscriptionWithApiInfo,
  '_id' | 'api' | 'plan' | 'planName' | 'apiName' | 'customName' | 'customReadOnly'
> & {
  keyring: { _id: string; customName: string | null } | null;
};
type TeamApiSubscriptions = {
  apis: Array<Pick<IApiGQL, '_id'> & { possibleUsagePlans: ExistingPlan[] }>;
  subscriptions: CompatibleSubscription[];
};

type KeyringPlanSelection = {
  api: Pick<IApiGQL, '_id' | 'name'>;
  plan: CompatiblePlan;
};

export type BatchKeyringGroup<T extends KeyringPlanSelection = KeyringPlanSelection> = {
  key: string;
  name: string;
  items: [T, ...T[]];
};

export function groupBatchPlansByKeyring<T extends KeyringPlanSelection>(
  items: T[]
): BatchKeyringGroup<T>[] {
  const groups = new Map<string, BatchKeyringGroup<T>>();
  for (const item of items) {
    const { api, plan } = item;
    const key = JSON.stringify([
      plan.customName,
      plan.otoroshiTarget?.otoroshiSettings ?? null,
      plan.otoroshiTarget?.apikeyCustomization?.readOnly ?? false,
      plan.aggregationApiKeysSecurity ? null : [api._id, plan._id],
    ]);
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { key, name: plan.customName, items: [item] });
  }
  return [...groups.values()];
}

export function findCompatibleKeyringsForGroup(
  group: BatchKeyringGroup,
  tenant: Pick<ITenant, 'environmentAggregationApiKeysSecurity'>,
  teamApiSubscriptions: TeamApiSubscriptions
): Array<{ _id: string; customName: string | null }> {
  if (group.items.some(({ plan }) => !plan.aggregationApiKeysSecurity)) return [];
  const { plan } = group.items[0];
  const candidates = findCompatibleSubscriptionsForPlans({
    plans: [plan],
    tenant,
    teamApiSubscriptions,
  })[0].subscriptions;
  const keyrings = new Map<string, { _id: string; customName: string | null }>();
  for (const candidate of candidates) {
    if (!candidate.keyring) continue;
    const members = teamApiSubscriptions.subscriptions.filter(
      (subscription) => subscription.keyring?._id === candidate.keyring?._id
    );
    const compatible = members.every((member) => {
      const memberPlan = teamApiSubscriptions.apis
        .find((api) => api._id === member.api)
        ?.possibleUsagePlans.find((existing) => existing._id === member.plan);
      return (
        !!memberPlan &&
        memberPlan.otoroshiTarget?.otoroshiSettings === plan.otoroshiTarget?.otoroshiSettings &&
        (!tenant.environmentAggregationApiKeysSecurity || member.planName === plan.customName) &&
        (member.customReadOnly ??
          memberPlan.otoroshiTarget?.apikeyCustomization?.readOnly ??
          false) === (plan.otoroshiTarget?.apikeyCustomization?.readOnly ?? false)
      );
    });
    if (compatible) keyrings.set(candidate.keyring._id, candidate.keyring);
  }
  return [...keyrings.values()];
}

export function buildBatchKeyringSelection(
  groups: BatchKeyringGroup[],
  choices: Record<string, string>,
  names: Record<string, string>,
  teamName: string
): Pick<ISubscriptionBatchSubmission, 'items' | 'newKeyrings'> {
  const selection: Pick<ISubscriptionBatchSubmission, 'items' | 'newKeyrings'> = {
    items: [],
    newKeyrings: [],
  };
  for (const group of groups) {
    const existingKeyring = choices[group.key];
    const keyringChoice = existingKeyring
      ? { type: 'existing' as const, keyring: existingKeyring }
      : { type: 'new' as const, creation: nanoid() };
    if (keyringChoice.type === 'new') {
      selection.newKeyrings.push({
        _id: keyringChoice.creation,
        customName: names[group.key]?.trim() || `${teamName} - ${group.name}`,
      });
    }
    selection.items.push(
      ...group.items.map(({ api, plan }) => ({
        api: api._id,
        plan: plan._id,
        keyringChoice,
      }))
    );
  }
  return selection;
}

export function isPlanSelectableForBatch(plan: BatchPlan, selectedPlans: BatchPlan[]): boolean {
  const plans = [...selectedPlans, plan];
  if (
    plans.some(
      (candidate) =>
        candidate.paymentSettings ||
        candidate.subscriptionProcess.some((step) => step.type === 'payment')
    )
  ) {
    return false;
  }

  const processes = plans.filter((candidate) => candidate.subscriptionProcess.length > 0);
  if (processes.length === 0) return true;

  const checksum = processes[0].subscriptionBatchProcessChecksum;
  return (
    typeof checksum === 'string' &&
    checksum.length > 0 &&
    processes.every((candidate) => candidate.subscriptionBatchProcessChecksum === checksum)
  );
}

export function findCompatibleSubscriptionsForPlans<TPlan extends CompatiblePlan>({
  plans,
  tenant,
  teamApiSubscriptions,
}: {
  plans: TPlan[];
  tenant: Pick<ITenant, 'environmentAggregationApiKeysSecurity'>;
  teamApiSubscriptions: TeamApiSubscriptions;
}): Array<{ plan: TPlan; subscriptions: CompatibleSubscription[] }> {
  const { apis, subscriptions } = teamApiSubscriptions;
  const subscriptionPlans = subscriptions.map((subscription) => {
    const api = apis.find((candidate) => candidate._id === subscription.api);
    const plan = api?.possibleUsagePlans.find((candidate) => candidate._id === subscription.plan);
    return { subscription, plan };
  });

  return plans.map((plan) => ({
    plan,
    subscriptions: subscriptionPlans
      .filter(
        ({ plan: existingPlan }) =>
          existingPlan?.otoroshiTarget?.otoroshiSettings ===
            plan.otoroshiTarget?.otoroshiSettings && existingPlan?.aggregationApiKeysSecurity
      )
      .filter(
        ({ subscription }) =>
          !tenant.environmentAggregationApiKeysSecurity || subscription.planName === plan.customName
      )
      .map(({ subscription }) => subscription),
  }));
}
