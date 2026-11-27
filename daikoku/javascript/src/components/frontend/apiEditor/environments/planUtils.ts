import {
  IApi,
  ISubscription,
  ISubscriptionDemand,
  ITeamSimple,
  ITenant,
  IUsagePlan,
  IUsagePlanGQL,
  IValidationStep,
} from '../../../../types';

export const toUsagePlan = (plan: IUsagePlanGQL): IUsagePlan => ({
  ...plan,
  authorizedTeams: plan.authorizedTeams.map((team) => team._id),
});

type RestUsagePlan = Omit<IUsagePlan, 'subscriptionProcess'> & {
  subscriptionProcess: {
    steps: Array<IValidationStep>;
  };
};

export const fromRestPlan = (plan: IUsagePlan | IUsagePlanGQL): IUsagePlan => {
  const rest = plan as unknown as RestUsagePlan;

  return {
    ...rest,
    subscriptionProcess: rest.subscriptionProcess.steps,
  };
};

const planAllowsTeam = (plan: IUsagePlanGQL, team: ITeamSimple, ownerTeam: ITeamSimple) =>
  plan.visibility === 'Public' || team._id === ownerTeam._id || plan.authorizedTeams.some((t) => t._id === team._id);

const apiAllowsTeam = (api: IApi, team: ITeamSimple, ownerTeam: ITeamSimple) =>
  api.visibility === 'Public' || api.authorizedTeams.includes(team._id) || team._id === ownerTeam._id;

export type AccessContext = {
  api: IApi;
  ownerTeam: ITeamSimple;
  tenant: ITenant;
  myTeams: Array<ITeamSimple>;
  subscriptions: Array<ISubscription>;
};

export const candidateTeams = ({ api, ownerTeam, tenant, myTeams }: AccessContext) =>
  myTeams
    .filter((team) => !tenant.subscriptionSecurity || team.type !== 'Personal')
    .filter((team) => team.type !== 'Admin' || api.visibility === 'AdminOnly')
    .filter((team) => apiAllowsTeam(api, team, ownerTeam))
    .sort((a, b) => a.name.localeCompare(b.name));

export const teamsAllowedFor = (plan: IUsagePlanGQL, context: AccessContext) =>
  candidateTeams(context).filter((team) => planAllowsTeam(plan, team, context.ownerTeam));

export const hasTeamLeftToSubscribe = (plan: IUsagePlanGQL, context: AccessContext) => {
  const { api, subscriptions } = context;

  if (api.visibility === 'AdminOnly') {
    return true;
  }

  const teamsNotSubscribedYet = teamsAllowedFor(plan, context).filter(
    (team) => plan.allowMultipleKeys || !subscriptions.some((s) => s.team === team._id && s.plan === plan._id)
  );

  return teamsNotSubscribedYet.length > 0;
};

export type TeamRestrictionContext = AccessContext & {
  pendingDemands: Array<ISubscriptionDemand>;
};

export const teamRestriction = (
  team: ITeamSimple,
  plans: Array<IUsagePlanGQL>,
  context: TeamRestrictionContext
): string | undefined => {
  const { ownerTeam, subscriptions, pendingDemands } = context;

  const notAllowed = plans.filter((plan) => !planAllowsTeam(plan, team, ownerTeam));
  if (notAllowed.length) {
    return 'api.editor.key.request.team.not.allowed';
  }

  const alreadySubscribed = plans.filter(
    (plan) => !plan.allowMultipleKeys && subscriptions.some((s) => s.plan === plan._id && s.team === team._id)
  );
  if (alreadySubscribed.length) {
    return 'api.editor.key.request.team.already.subscribed';
  }

  const pending = plans.filter(
    (plan) => !plan.allowMultipleKeys && pendingDemands.some((d) => d.plan === plan._id && d.team === team._id)
  );
  if (pending.length) {
    return 'Request in progress';
  }

  const needsPayment = plans.some((plan) => plan.subscriptionProcess.some((step) => step.type === 'payment'));
  if (needsPayment && !team.verified) {
    return 'Email not verified';
  }

  return undefined;
};
