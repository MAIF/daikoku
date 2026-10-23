import type {
  IApi,
  ISubscription,
  ISubscriptionDemand,
  ITeamSimple,
  ITenant,
  IUsagePlanGQL,
} from '../../../types';

type HelpTeam = Pick<ITeamSimple, '_id' | 'name' | 'type' | 'verified'> & {
  canAccessApiKey: boolean;
};

type HelpReason =
  | 'blocked'
  | 'unpublished'
  | 'target'
  | 'entities'
  | 'noTeams'
  | 'personal'
  | 'adminTeam'
  | 'apiAccess'
  | 'planAccess'
  | 'permission'
  | 'subscribed'
  | 'apiSubscribed'
  | 'pending'
  | 'apiPending'
  | 'verification'
  | 'adminOnly'
  | 'instance'
  | 'metadata'
  | 'metadataValidation';

export type SubscriptionHelpItem = {
  reason: HelpReason;
  teams: string[];
  details: string[];
};

export type SubscriptionHelp = {
  blockers: SubscriptionHelpItem[];
  warnings: SubscriptionHelpItem[];
  availableTeams: string[];
};

export function getVisibleSubscriptionBlockers(help: SubscriptionHelp): SubscriptionHelpItem[] {
  return help.blockers.filter(
    (item) => item.reason !== 'adminTeam' && item.reason !== 'subscribed'
  );
}

export function isSubscriptionDisabled(help: SubscriptionHelp): boolean {
  return (
    help.blockers.some((item) => item.teams.length === 0) ||
    (help.blockers.length > 0 && help.availableTeams.length === 0)
  );
}

export type SubscriptionHelpInput = {
  api: Pick<IApi, 'state' | 'visibility' | 'authorizedTeams'>;
  plan: Pick<
    IUsagePlanGQL,
    | 'otoroshiTarget'
    | 'visibility'
    | 'authorizedTeams'
    | 'allowMultipleKeys'
    | 'subscriptionProcess'
    | '_id'
  >;
  ownerTeamId: string;
  teams: HelpTeam[];
  subscriptions: Pick<ISubscription, 'plan' | 'team'>[];
  demands: Pick<ISubscriptionDemand, 'plan' | 'team'>[];
  tenant: Pick<ITenant, 'subscriptionSecurity' | 'otoroshiSettings'>;
  isGuest: boolean;
  isDaikokuAdmin: boolean;
  initialTeamsExhausted: boolean;
};

function addHelpReason(
  list: SubscriptionHelpItem[],
  reason: HelpReason,
  team?: HelpTeam,
  details: string[] = []
) {
  const existing = list.find((item) => item.reason === reason);
  if (existing && team) existing.teams.push(team.name);
  else if (!existing) list.push({ reason, teams: team ? [team.name] : [], details });
}

function addApiAvailabilityReasons(input: SubscriptionHelpInput, result: SubscriptionHelp) {
  if (input.isGuest) return;
  const { api } = input;
  if (api.state === 'blocked') addHelpReason(result.blockers, 'blocked');
  else if (api.state !== 'published' && api.state !== 'deprecated') {
    addHelpReason(result.blockers, 'unpublished');
  }
  if (api.visibility === 'AdminOnly' && !input.isDaikokuAdmin) {
    addHelpReason(result.warnings, 'adminOnly');
  }
}

function hasAuthorizedOtoroshiEntities(plan: SubscriptionHelpInput['plan']): boolean {
  const entities = plan.otoroshiTarget?.authorizedEntities;
  return (
    !!entities &&
    [entities.groups, entities.routes, entities.services].some((ids) => ids.length > 0)
  );
}

function addPlanConfigurationReasons(input: SubscriptionHelpInput, result: SubscriptionHelp) {
  const { api, plan, tenant, isGuest } = input;
  if (api.visibility === 'AdminOnly') return;
  const target = plan.otoroshiTarget;
  // Guests keep their login action even when the plan is not configured.
  const configurationIssues = isGuest ? result.warnings : result.blockers;
  if (!target) addHelpReason(configurationIssues, 'target');
  else {
    if (!hasAuthorizedOtoroshiEntities(plan)) {
      addHelpReason(configurationIssues, 'entities');
    }
    const hasExistingOtoroshiInstance = tenant.otoroshiSettings.some(
      (settings) => settings._id === target.otoroshiSettings
    );
    if (!target.otoroshiSettings || !hasExistingOtoroshiInstance) {
      addHelpReason(result.warnings, 'instance');
    }
  }
  const metadata = target?.apikeyCustomization?.customMetadata ?? [];
  if (metadata.length) {
    addHelpReason(
      result.warnings,
      plan.subscriptionProcess.length ? 'metadataValidation' : 'metadata',
      undefined,
      metadata.map((field) => field.key)
    );
  }
}

function canTeamAccessApi(input: SubscriptionHelpInput, team: HelpTeam): boolean {
  return (
    input.api.visibility === 'Public' ||
    team._id === input.ownerTeamId ||
    input.api.authorizedTeams.includes(team._id)
  );
}

function canTeamAccessPlan(input: SubscriptionHelpInput, team: HelpTeam): boolean {
  return (
    input.plan.visibility === 'Public' ||
    team._id === input.ownerTeamId ||
    input.plan.authorizedTeams.some((authorized) => authorized._id === team._id)
  );
}

function getTeamSubscriptionReasons(input: SubscriptionHelpInput, team: HelpTeam): HelpReason[] {
  const { plan, subscriptions, demands } = input;
  if (plan.allowMultipleKeys) return [];
  const reasons: HelpReason[] = [];
  const teamSubscriptions = subscriptions.filter((sub) => sub.team === team._id);
  const teamDemands = demands.filter((demand) => demand.team === team._id);

  if (teamSubscriptions.some((sub) => sub.plan === plan._id)) {
    reasons.push('subscribed');
  } else if (input.initialTeamsExhausted && teamSubscriptions.length > 0) {
    // The existing initial action excludes API subscriptions across plans.
    reasons.push('apiSubscribed');
  }
  if (teamDemands.some((demand) => demand.plan === plan._id)) {
    reasons.push('pending');
  } else if (teamDemands.length > 0) {
    reasons.push('apiPending');
  }
  const requiresVerifiedTeam = plan.subscriptionProcess.some((step) => step.type === 'payment');
  if (requiresVerifiedTeam && !team.verified) reasons.push('verification');
  return reasons;
}

function getTeamEligibilityReasons(input: SubscriptionHelpInput, team: HelpTeam): HelpReason[] {
  const reasons: HelpReason[] = [];
  if (input.tenant.subscriptionSecurity && team.type === 'Personal') reasons.push('personal');
  if (team.type === 'Admin' && input.api.visibility !== 'AdminOnly') reasons.push('adminTeam');
  if (!canTeamAccessApi(input, team)) reasons.push('apiAccess');
  if (!canTeamAccessPlan(input, team)) reasons.push('planAccess');
  if (!team.canAccessApiKey) reasons.push('permission');
  return [...reasons, ...getTeamSubscriptionReasons(input, team)];
}

export function getSubscriptionHelp(input: SubscriptionHelpInput): SubscriptionHelp {
  const result: SubscriptionHelp = { blockers: [], warnings: [], availableTeams: [] };
  addApiAvailabilityReasons(input, result);
  addPlanConfigurationReasons(input, result);

  if (input.isGuest) return result;
  if (!input.teams.length) addHelpReason(result.blockers, 'noTeams');
  for (const team of input.teams) {
    const reasons = getTeamEligibilityReasons(input, team);
    reasons.forEach((reason) => addHelpReason(result.blockers, reason, team));
    if (!reasons.length) result.availableTeams.push(team.name);
  }
  return result;
}
