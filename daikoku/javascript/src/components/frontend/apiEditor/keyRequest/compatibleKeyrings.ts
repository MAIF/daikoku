import { ISubscriptionWithApiInfo, ITenant, IUsagePlanGQL } from '../../../../types';

export type KeyringPlanGQL = {
  _id: string;
  customName: string;
  otoroshiTarget?: {
    otoroshiSettings?: string;
    apikeyCustomization?: { readOnly?: boolean };
  };
  aggregationApiKeysSecurity?: boolean;
  paymentSettings?: { thirdPartyPaymentSettingsId: string } | null;
};

export type KeyringApiGQL = {
  _id: string;
  name: string;
  possibleUsagePlans: Array<KeyringPlanGQL>;
};

export type CompatibleKeyring = {
  keyringId: string;
  label: string;
  subscription: ISubscriptionWithApiInfo;
};

type Member = { subscription: ISubscriptionWithApiInfo; plan?: KeyringPlanGQL };

export const canAggregate = (tenant: ITenant, plans: Array<IUsagePlanGQL>) =>
  !!tenant.aggregationApiKeysSecurity &&
  plans.every((plan) => plan.aggregationApiKeysSecurity && !plan.paymentSettings);

export const findCompatibleKeyrings = ({
  plans,
  tenant,
  subscriptions,
  apis,
}: {
  plans: Array<IUsagePlanGQL>;
  tenant: ITenant;
  subscriptions: Array<ISubscriptionWithApiInfo>;
  apis: Array<KeyringApiGQL>;
}): Array<CompatibleKeyring> => {
  const byKeyring = new Map<string, Array<Member>>();

  subscriptions.forEach((subscription) => {
    const keyringId = subscription.keyring?._id;
    const plan = apis
      .find((api) => api._id === subscription.api)
      ?.possibleUsagePlans.find((p) => p._id === subscription.plan);

    if (keyringId && plan) {
      byKeyring.set(keyringId, [...(byKeyring.get(keyringId) ?? []), { subscription, plan }]);
    }
  });

  const isCompatible = (member: Member, joining: IUsagePlanGQL) => {
    const memberReadOnly =
      member.subscription.customReadOnly ?? !!member.plan?.otoroshiTarget?.apikeyCustomization?.readOnly;
    const joiningReadOnly = !!joining.otoroshiTarget?.apikeyCustomization?.readOnly;

    return (
      !member.plan?.paymentSettings &&
      member.plan?.otoroshiTarget?.otoroshiSettings === joining.otoroshiTarget?.otoroshiSettings &&
      (!tenant.environmentAggregationApiKeysSecurity || member.subscription.planName === joining.customName) &&
      memberReadOnly === joiningReadOnly
    );
  };

  return [...byKeyring.entries()]
    .filter(([, members]) => members.every((member) => plans.every((plan) => isCompatible(member, plan))))
    .map(([keyringId, members]) => {
      const representative = members[0].subscription;
      const name =
        representative.keyring?.customName || `${representative.apiName} - ${representative.planName}`;

      return {
        keyringId,
        label: members.length > 1 ? `${name} (${members.length})` : name,
        subscription: representative,
      };
    });
};
