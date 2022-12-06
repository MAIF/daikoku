import React, { useContext } from 'react';
import find from 'lodash/find';
import difference from 'lodash/difference';
import { getApolloContext } from '@apollo/client';
import { type as formType, constraints, format } from '@maif/react-forms';

import { currencies } from '../../../services/currencies';
import { formatPlanType } from '../../utils/formatters';
import { ActionWithTeamSelector } from '../../utils/ActionWithTeamSelector';
import {
  Can,
  access,
  apikey,
  getCurrencySymbol,
  formatCurrency,
  manage,
  Option,
} from '../../utils';
import { openLoginOrRegisterModal, openApiKeySelectModal, I18nContext, openFormModal } from '../../../core';
import { connect, useDispatch } from 'react-redux';
import * as Services from '../../../services';
import { any } from 'cypress/types/bluebird';
import { placements } from '@popperjs/core';
import { IApi, isMiniFreeWithQuotas, isPayPerUse, isQuotasWitoutLimit, ISubscription, ITeamSimple, ITenant, IUsagePlan, IUsagePlanFreeWithQuotas, IUsagePlanPayPerUse, IUsagePlanQuotasWithLimits, IUsagePlanQuotasWitoutLimit, IUserSimple } from '../../../types';
import { INotification } from '../../../types/modal';

const Curreny = ({
  plan
}: any) => {
  const cur = find(currencies, (c) => c.code === plan.currency.code);
  return (
    <span>
      {' '}
      {cur?.name}({cur?.symbol})
    </span>
  );
};

const currency = (plan: any) => {
  const cur = find(currencies, (c) => c.code === plan.currency.code);
  return `${cur?.name}(${cur?.symbol})`;
};

type ApiPricingProps = {
  plan: IUsagePlan,
  api: IApi,
  askForApikeys: (x: {teams: Array<string>, plan: IUsagePlan, apiKey?: ISubscription, motivation?: string}) => void,
  openApiKeySelectModal?: (props: any) => void, //FIXME: not an optional props ==> use useSelector to get it from hook instead
  myTeams: Array<ITeamSimple>,
  tenant: ITenant,
  ownerTeam: ITeamSimple,
  subscriptions: Array<ISubscription>,
  pendingSubscriptions: Array<INotification>,
  connectedUser: IUserSimple,
  openLoginOrRegisterModal?: (props: any) => void //FIXME: not an optional props ==> use useSelector to get it from hook instead

}

const ApiPricingCardComponent = (props: ApiPricingProps) => {
  const { Translation } = useContext(I18nContext);
  const { client } = useContext(getApolloContext());

  const dispatch = useDispatch();

  const renderFreeWithoutQuotas = () => (
    <span>
      <Translation i18nkey="free.without.quotas.desc">
        You'll pay nothing and do whatever you want :)
      </Translation>
    </span>
  );

  const renderFreeWithQuotas = () => {
    const plan: IUsagePlanFreeWithQuotas = props.plan as IUsagePlanFreeWithQuotas
    return (
      <span>
        <Translation i18nkey="free.with.quotas.desc" replacements={[plan.maxPerMonth]}>
          You'll pay nothing but you'll have {plan.maxPerMonth} authorized requests per month
        </Translation>
      </span>
    )
  };

  const renderQuotasWithLimits = () => {
    const plan: IUsagePlanQuotasWithLimits = props.plan as IUsagePlanQuotasWithLimits;

    return (
      <span>
        <Translation
          i18nkey="quotas.with.limits.desc"
          replacements={[props.plan.costPerMonth, currency(props.plan), plan.maxPerMonth]}
        >
          You'll pay {props.plan.costPerMonth}
          <Curreny plan={props.plan} /> and you'll have {plan.maxPerMonth} authorized requests
          per month
        </Translation>
      </span>
    )
  };

  const renderQuotasWithoutLimits = () => {
    const plan: IUsagePlanQuotasWitoutLimit = props.plan as IUsagePlanQuotasWitoutLimit
    return (
      <span>
        <Translation
          i18nkey="quotas.without.limits.desc"
          replacements={[
            props.plan.costPerMonth,
            currency(props.plan),
            plan.maxPerMonth,
            plan.costPerAdditionalRequest,
            currency(props.plan),
          ]}
        >
          You'll pay {props.plan.costPerMonth}
          <Curreny plan={props.plan} /> for {plan.maxPerMonth} authorized requests per month and
          you'll be charged {plan.costPerAdditionalRequest}
          <Curreny plan={props.plan} /> per additional request
        </Translation>
      </span>
    )
  }

  const renderPayPerUse = () => {

    const plan: IUsagePlanPayPerUse = props.plan as IUsagePlanPayPerUse

    if (props.plan.costPerMonth === 0.0) {
      return (
        <span>
          <Translation
            i18nkey="pay.per.use.desc.default"
            replacements={[
              props.plan.costPerMonth,
              currency(props.plan),
              plan.costPerRequest,
              currency(props.plan),
            ]}
          >
            You'll pay {props.plan.costPerMonth}
            <Curreny plan={props.plan} /> per month and you'll be charged{' '}
            {plan.costPerRequest}
            <Curreny plan={props.plan} /> per request
          </Translation>
        </span>
      );
    } else {
      return (
        <span>
          <Translation
            i18nkey="pay.per.use.desc.default"
            replacements={[
              props.plan.costPerMonth,
              currency(props.plan),
              plan.costPerRequest,
              currency(props.plan),
            ]}
          >
            You'll be charged {plan.costPerRequest}
            <Curreny plan={props.plan} /> per request
          </Translation>
        </span>
      );
    }
  };

  const showApiKeySelectModal = (teams: Array<string>) => {
    const { plan } = props;

    //FIXME: not bwaaagh !!
    if (!client) {
      return;
    }

    const askForApikeys = (teams: Array<string>, plan: IUsagePlan, apiKey?: ISubscription) => {
      if (plan.subscriptionProcess === "Automatic") {
        props.askForApikeys({teams, plan: plan, apiKey})
      } else (
        dispatch(openFormModal<{motivation: string}>({
          title: translate('motivations.modal.title'),
          schema: {
            motivation: {
              type: formType.string,
              format: format.text,
              label: null,
              constraints: [
                constraints.required()
              ]
            }
          },
          onSubmit: ({motivation}) => props.askForApikeys({teams, plan, apiKey, motivation}),
          actionLabel: translate('Send')
        }))
      )
    }

    Services.getAllTeamSubscriptions(teams[0])
      .then((subscriptions) => client
        .query({
          query: Services.graphql.apisByIdsWithPlans,
          variables: { ids: [...new Set(subscriptions.map((s) => s.api))] },
        })
        .then(({ data }) => ({ apis: data.apis, subscriptions }))
      ).then(({ apis, subscriptions }) => {
        const filteredApiKeys = subscriptions
          .map((subscription) => {
            const api = apis.find((a) => a._id === subscription.api);
            const plan = Option(api?.possibleUsagePlans)
              .flatMap((plans: any) => Option(plans.find((plan: any) => plan._id === subscription.plan)))
              .getOrNull();
            return { subscription, api, plan };
          })
          .filter(
            (infos) => infos.plan?.otoroshiTarget?.otoroshiSettings ===
              plan?.otoroshiTarget?.otoroshiSettings && infos.plan.aggregationApiKeysSecurity
          )
          .map((infos) => infos.subscription);

        if (!plan.aggregationApiKeysSecurity || subscriptions.length <= 0) {
          askForApikeys(teams, plan);
        } else {
          props.openApiKeySelectModal && props.openApiKeySelectModal({
            plan,
            apiKeys: filteredApiKeys,
            onSubscribe: () => askForApikeys(teams, plan),
            extendApiKey: (apiKey: any) => askForApikeys(teams, plan, apiKey),
          });
        }
      });
  };

  const plan = props.plan;
  const type = plan.type;
  const customDescription = plan.customDescription;

  const authorizedTeams = props.myTeams
    .filter((t) => !props.tenant.subscriptionSecurity || t.type !== 'Personal')
    .filter((t) => props.api.visibility === 'Public' ||
      props.api.authorizedTeams.includes(t._id) ||
      t._id === props.ownerTeam._id
    );

  const allPossibleTeams = difference(
    authorizedTeams.map((t: any) => t._id),
    props.subscriptions
      .filter((_: any) => !plan.allowMultipleKeys)
      .filter((f: any) => !f._deleted)
      .map((s: any) => s.team)
  );

  const isPending = !difference(
    allPossibleTeams,
    props.pendingSubscriptions.map((s: any) => s.action.team)
  ).length;

  const isAccepted = !allPossibleTeams.length;

  const { translate } = useContext(I18nContext);

  let pricing = translate('Free');
  const req = translate('req.');
  const month = translate('month');
  if (isQuotasWitoutLimit(plan)) {
    pricing = `${formatCurrency(plan.costPerMonth)} ${getCurrencySymbol(
      plan.currency.code
    )}/${month} + ${formatCurrency(plan.costPerAdditionalRequest)} ${getCurrencySymbol(
      plan.currency.code
    )}/${req}`;
  } else if (isPayPerUse(plan)) {
    pricing = `${formatCurrency(plan.costPerRequest)} ${getCurrencySymbol(
      plan.currency.code
    )}/${req}`;
  } else if (plan.costPerMonth) {
    pricing = `${formatCurrency(plan.costPerMonth)} ${getCurrencySymbol(
      plan.currency.code
    )}/${month}`;
  }

  return (
    <div className="card mb-4 shadow-sm">
      <div className="card-img-top card-link card-skin" data-holder-rendered="true">
        <span>{plan.customName || formatPlanType(plan, translate)}</span>
      </div>
      <div className="card-body plan-body d-flex flex-column">
        <p className="card-text text-justify">
          {customDescription && <span>{customDescription}</span>}
          {!customDescription && type === 'FreeWithoutQuotas' && renderFreeWithoutQuotas()}
          {!customDescription && type === 'FreeWithQuotas' && renderFreeWithQuotas()}
          {!customDescription && type === 'QuotasWithLimits' && renderQuotasWithLimits()}
          {!customDescription && type === 'QuotasWithoutLimits' && renderQuotasWithoutLimits()}
          {!customDescription && type === 'PayPerUse' && renderPayPerUse()}
        </p>
        <div className="d-flex flex-column mb-2">
          <span className="plan-quotas">
            {!isMiniFreeWithQuotas(plan) && translate('plan.limits.unlimited')}
            {isMiniFreeWithQuotas(plan) && (
              <div>
                <div>
                  <Translation
                    i18nkey="plan.limits"
                    replacements={[plan.maxPerSecond, plan.maxPerMonth]}
                  >
                    Limits: {plan.maxPerSecond} req./sec, {plan.maxPerMonth} req./month
                  </Translation>
                </div>
              </div>
            )}
          </span>
          <span className="plan-pricing">
            <Translation i18nkey="plan.pricing" replacements={[pricing]}>
              pricing: {pricing}
            </Translation>
          </span>
        </div>
        <div className="d-flex justify-content-between align-items-center">
          {plan.otoroshiTarget && !isAccepted && isPending && (
            <button type="button" disabled className="btn btn-sm btn-access-negative col-12">
              <Translation i18nkey="Request in progress">Request in progress</Translation>
            </button>
          )}
          {(!isAccepted || props.api.visibility === 'AdminOnly') && props.api.published && (
            <Can
              I={access}
              a={apikey}
              teams={authorizedTeams.filter(
                (team) => plan.visibility === 'Public' || team._id === props.ownerTeam._id
              )}
            >
              {props.api.visibility !== 'AdminOnly' && (
                <Can
                  I={manage}
                  a={apikey}
                  teams={authorizedTeams.filter((team) => team._id === props.ownerTeam._id)}
                >
                  {!plan.otoroshiTarget && (
                    <span className="badge bg-danger">Missing otoroshi target</span>
                  )}
                </Can>
              )}
              {(props.api.visibility === 'AdminOnly' ||
                (plan.otoroshiTarget && !isAccepted && !isPending)) && (
                  <ActionWithTeamSelector
                    title={translate('team.selection.title')}
                    description={translate(
                      plan.subscriptionProcess === 'Automatic'
                        ? 'team.selection.desc.get'
                        : 'team.selection.desc.request')}
                    teams={authorizedTeams
                      .filter((t) => t.type !== 'Admin' || props.api.visibility === 'AdminOnly')
                      .filter((team) => plan.visibility === 'Public' || team._id === props.ownerTeam._id)
                      .filter((t) => !props.tenant.subscriptionSecurity || t.type !== 'Personal')}
                    pendingTeams={props.pendingSubscriptions.map((s) => s.action.team)}
                    authorizedTeams={props.subscriptions
                      .filter((f) => !f._deleted)
                      .map((subs) => subs.team)}
                    allowMultipleDemand={plan.allowMultipleKeys}
                    withAllTeamSelector={false}
                    action={(teams) => showApiKeySelectModal(teams)}
                    actionLabel={translate(plan.subscriptionProcess === 'Automatic' ? 'Get API key' : 'Request API key')}
                  >
                    <button type="button" className="btn btn-sm btn-access-negative col-12">
                      <Translation
                        i18nkey={
                          plan.subscriptionProcess === 'Automatic' ? 'Get API key' : 'Request API key'
                        }
                      >
                        {plan.subscriptionProcess === 'Automatic' ? 'Get API key' : 'Request API key'}
                      </Translation>
                    </button>
                  </ActionWithTeamSelector>
                )}
            </Can>
          )}
          {props.connectedUser.isGuest && (
            <button
              type="button"
              className="btn btn-sm btn-access-negative mx-auto mt-3"
              onClick={() => props.openLoginOrRegisterModal && props.openLoginOrRegisterModal({ ...props })}
            >
              <Translation i18nkey="Get API key">Get API key</Translation>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const mapStateToProps = (state: any) => ({
  ...state.context
});

const mapDispatchToProps = {
  openLoginOrRegisterModal: (modalProps: any) => openLoginOrRegisterModal(modalProps),
  openApiKeySelectModal: (modalProps: any) => openApiKeySelectModal(modalProps),
};

export const ApiPricingCard = connect(mapStateToProps, mapDispatchToProps)(ApiPricingCardComponent);

export function ApiPricing(props: any) {
  const api = props.api;
  if (!api) {
    return null;
  }

  const possibleUsagePlans = api.possibleUsagePlans.filter((plan: any) => {
    return plan.visibility === 'Public' ||
      props.myTeams.some((team: any) => team._id === props.ownerTeam._id) ||
      props.myTeams.some((team: any) => plan.authorizedTeams.includes(team._id));
  });

  return (
    <div className="d-flex col flex-column pricing-content">
      <div className="album">
        <div className="container">
          <div className="row">
            {possibleUsagePlans.map((plan: any) => <div key={plan._id} className="col-md-4">
              <ApiPricingCard
                api={api}
                key={plan._id}
                plan={plan}
                myTeams={props.myTeams}
                ownerTeam={props.ownerTeam}
                subscriptions={props.subscriptions.filter(
                  (subs: any) => subs.api === api._id && subs.plan === plan._id
                )}
                pendingSubscriptions={props.pendingSubscriptions.filter(
                  (subs: any) => subs.action.api === api._id && subs.action.plan === plan._id
                )}
                askForApikeys={props.askForApikeys}
                tenant={props.tenant}
                connectedUser={props.connectedUser}
              />
            </div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
