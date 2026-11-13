import type { IApi, IUsagePlanGQL } from '../../../types';

type HelpReason = 'blocked' | 'unpublished' | 'target' | 'entities';

export type SubscriptionHelpItem = {
  reason: HelpReason;
};

export type SubscriptionHelp = {
  blockers: SubscriptionHelpItem[];
};

export function getVisibleSubscriptionBlockers(help: SubscriptionHelp): SubscriptionHelpItem[] {
  return help.blockers.filter((item) =>
    item.reason === 'blocked' ||
    item.reason === 'unpublished' ||
    item.reason === 'target'
  );
}

export function isSubscriptionDisabled(help: SubscriptionHelp): boolean {
  return help.blockers.length > 0;
}

export type SubscriptionHelpInput = {
  api: Pick<IApi, 'state' | 'visibility'>;
  plan: Pick<IUsagePlanGQL, 'otoroshiTarget'>;
  isGuest: boolean;
};

export function getOtoroshiTargetReason(
  api: SubscriptionHelpInput['api'],
  plan: SubscriptionHelpInput['plan']
): SubscriptionHelpItem | undefined {
  if (api.visibility === 'AdminOnly') return;
  if (!plan.otoroshiTarget) return { reason: 'target' };
  const entities = plan.otoroshiTarget?.authorizedEntities;
  if (
    !entities ||
    ![entities.groups, entities.routes, entities.services].some((ids) => ids.length > 0)
  ) {
    return { reason: 'entities' };
  }
}

export function getSubscriptionHelp({
  api,
  plan,
  isGuest,
}: SubscriptionHelpInput): SubscriptionHelp {
  const blockers: SubscriptionHelpItem[] = [];
  if (isGuest) return { blockers };
  if (api.state === 'blocked') blockers.push({ reason: 'blocked' });
  else if (api.state !== 'published' && api.state !== 'deprecated') {
    blockers.push({ reason: 'unpublished' });
  }
  const targetReason = getOtoroshiTargetReason(api, plan);
  if (targetReason) blockers.push(targetReason);
  return { blockers };
}
