import React, { useContext } from 'react';
import find from 'lodash/find';
import difference from 'lodash/difference';
import { getApolloContext } from '@apollo/client';

import { currencies } from '../../../services/currencies';
import { formatPlanType } from '../../utils/formatters';
// @ts-expect-error TS(6142): Module '../../utils/ActionWithTeamSelector' was re... Remove this comment to see the full error message
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
import { openLoginOrRegisterModal, openApiKeySelectModal, I18nContext } from '../../../core';
import { connect } from 'react-redux';
import * as Services from '../../../services';

const Curreny = ({
  plan
}: any) => {
  const cur = find(currencies, (c) => c.code === plan.currency.code);
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <span>
      {' '}
      {/* @ts-expect-error TS(2532): Object is possibly 'undefined'. */}
      {cur.name}({cur.symbol})
    </span>
  );
};

const currency = (plan: any) => {
  const cur = find(currencies, (c) => c.code === plan.currency.code);
  // @ts-expect-error TS(2532): Object is possibly 'undefined'.
  return `${cur.name}(${cur.symbol})`;
};

const ApiPricingCardComponent = (props: any) => {
  // @ts-expect-error TS(2339): Property 'Translation' does not exist on type 'unk... Remove this comment to see the full error message
  const { Translation } = useContext(I18nContext);
  const { client } = useContext(getApolloContext());

  const renderFreeWithoutQuotas = () => (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <span>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Translation i18nkey="free.without.quotas.desc">
        You'll pay nothing and do whatever you want :)
      </Translation>
    </span>
  );

  const renderFreeWithQuotas = () => (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <span>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Translation i18nkey="free.with.quotas.desc" replacements={[props.plan.maxPerMonth]}>
        You'll pay nothing but you'll have {props.plan.maxPerMonth} authorized requests per month
      </Translation>
    </span>
  );

  const renderQuotasWithLimits = () => (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <span>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Translation
        i18nkey="quotas.with.limits.desc"
        replacements={[props.plan.costPerMonth, currency(props.plan), props.plan.maxPerMonth]}
      >
        You'll pay {props.plan.costPerMonth}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Curreny plan={props.plan} /> and you'll have {props.plan.maxPerMonth} authorized requests
        per month
      </Translation>
    </span>
  );

  const renderQuotasWithoutLimits = () => (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <span>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Translation
        i18nkey="quotas.without.limits.desc"
        replacements={[
          props.plan.costPerMonth,
          currency(props.plan),
          props.plan.maxPerMonth,
          props.plan.costPerAdditionalRequest,
          currency(props.plan),
        ]}
      >
        You'll pay {props.plan.costPerMonth}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Curreny plan={props.plan} /> for {props.plan.maxPerMonth} authorized requests per month and
        you'll be charged {props.plan.costPerAdditionalRequest}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <Curreny plan={props.plan} /> per additional request
      </Translation>
    </span>
  );

  const renderPayPerUse = () => {
    if (props.plan.costPerMonth === 0.0) {
      return (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <span>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation
            i18nkey="pay.per.use.desc.default"
            replacements={[
              props.plan.costPerMonth,
              currency(props.plan),
              props.plan.costPerRequest,
              currency(props.plan),
            ]}
          >
            You'll pay {props.plan.costPerMonth}
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Curreny plan={props.plan} /> per month and you'll be charged{' '}
            {props.plan.costPerRequest}
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Curreny plan={props.plan} /> per request
          </Translation>
        </span>
      );
    } else {
      return (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <span>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation
            i18nkey="pay.per.use.desc.default"
            replacements={[
              props.plan.costPerMonth,
              currency(props.plan),
              props.plan.costPerRequest,
              currency(props.plan),
            ]}
          >
            You'll be charged {props.plan.costPerRequest}
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Curreny plan={props.plan} /> per request
          </Translation>
        </span>
      );
    }
  };

  const showApiKeySelectModal = (team: any) => {
    const { api, plan } = props;

    Services.getAllTeamSubscriptions(team)
      .then((subscriptions) =>
        // @ts-expect-error TS(2532): Object is possibly 'undefined'.
        client
          .query({
            query: Services.graphql.apisByIdsWithPlans,
            variables: { ids: [...new Set(subscriptions.map((s: any) => s.api))] },
          })
          .then(({ data }) => ({ apis: data.apis, subscriptions }))
      )
      .then(({ apis, subscriptions }) => {
        const filteredApiKeys = subscriptions
          .map((subscription: any) => {
            const api = apis.find((a: any) => a._id === subscription.api);
            const plan = Option(api?.possibleUsagePlans)
              .flatMap((plans: any) => Option(plans.find((plan: any) => plan._id === subscription.plan)))
              .getOrNull();
            return { subscription, api, plan };
          })
          .filter(
            (infos: any) => infos.plan?.otoroshiTarget?.otoroshiSettings ===
              plan?.otoroshiTarget?.otoroshiSettings && infos.plan.aggregationApiKeysSecurity
          )
          .map((infos: any) => infos.subscription);

        if (!plan.aggregationApiKeysSecurity || subscriptions.length <= 0) {
          props.askForApikeys(team, plan);
        } else {
          props.openApiKeySelectModal({
            plan,
            apiKeys: filteredApiKeys,
            onSubscribe: () => props.askForApikeys(team, plan),
            extendApiKey: (apiKey: any) => props.askForApikeys(team, plan, apiKey),
          });
        }
      });
  };

  const plan = props.plan;
  const type = plan.type;
  const customDescription = plan.customDescription;

  const authorizedTeams = props.myTeams
    .filter((t: any) => !props.tenant.subscriptionSecurity || t.type !== 'Personal')
    .filter(
      (t: any) => props.api.visibility === 'Public' ||
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

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  let pricing = translateMethod('Free');
  const req = translateMethod('req.');
  const month = translateMethod('month');
  if (plan.costPerMonth && plan.costPerAdditionalRequest) {
    pricing = `${formatCurrency(plan.costPerMonth)} ${getCurrencySymbol(
      plan.currency.code
    )}/${month} + ${formatCurrency(plan.costPerAdditionalRequest)} ${getCurrencySymbol(
      plan.currency.code
    )}/${req}`;
  } else if (plan.costPerMonth) {
    pricing = `${formatCurrency(plan.costPerMonth)} ${getCurrencySymbol(
      plan.currency.code
    )}/${month}`;
  } else if (plan.costPerRequest) {
    pricing = `${formatCurrency(plan.costPerRequest)} ${getCurrencySymbol(
      plan.currency.code
    )}/${req}`;
  }

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="card mb-4 shadow-sm">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="card-img-top card-link card-skin" data-holder-rendered="true">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <span>{plan.customName || formatPlanType(plan, translateMethod)}</span>
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="card-body plan-body d-flex flex-column">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <p className="card-text text-justify">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {customDescription && <span>{customDescription}</span>}
          {!customDescription && type === 'FreeWithoutQuotas' && renderFreeWithoutQuotas()}
          {!customDescription && type === 'FreeWithQuotas' && renderFreeWithQuotas()}
          {!customDescription && type === 'QuotasWithLimits' && renderQuotasWithLimits()}
          {!customDescription && type === 'QuotasWithoutLimits' && renderQuotasWithoutLimits()}
          {!customDescription && type === 'PayPerUse' && renderPayPerUse()}
        </p>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="d-flex flex-column mb-2">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span className="plan-quotas">
            {!plan.maxPerSecond && !plan.maxPerMonth && translateMethod('plan.limits.unlimited')}
            {!!plan.maxPerSecond && !!plan.maxPerMonth && (
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <div>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <div>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <span className="plan-pricing">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="plan.pricing" replacements={[pricing]}>
              pricing: {pricing}
            </Translation>
          </span>
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="d-flex justify-content-between align-items-center">
          {plan.otoroshiTarget && !isAccepted && isPending && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <button type="button" disabled className="btn btn-sm btn-access-negative col-12">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <Translation i18nkey="Request in progress">Request in progress</Translation>
            </button>
          )}
          {(!isAccepted || props.api.visibility === 'AdminOnly') && props.api.published && (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <Can
              I={access}
              a={apikey}
              // @ts-expect-error TS(2322): Type '{ children: any[]; I: number; a: string; tea... Remove this comment to see the full error message
              teams={authorizedTeams.filter(
                (team: any) => plan.visibility === 'Public' || team._id === props.ownerTeam._id
              )}
            >
              {props.api.visibility !== 'AdminOnly' && (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <Can
                  I={manage}
                  a={apikey}
                  // @ts-expect-error TS(2322): Type '{ children: false | Element; I: number; a: s... Remove this comment to see the full error message
                  teams={authorizedTeams.filter((team: any) => team._id === props.ownerTeam._id)}
                >
                  {!plan.otoroshiTarget && (
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <span className="badge bg-danger">Missing otoroshi target</span>
                  )}
                </Can>
              )}
              {(props.api.visibility === 'AdminOnly' ||
                (plan.otoroshiTarget && !isAccepted && !isPending)) && (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <ActionWithTeamSelector
                  title={translateMethod('team.selection.title', 'Select teams')}
                  description={translateMethod(
                    plan.subscriptionProcess === 'Automatic'
                      ? 'team.selection.desc.get'
                      : 'team.selection.desc.request',
                    false,
                    'You are going to get or request API keys. On which team do you want them for?'
                  )}
                  teams={authorizedTeams
                    .filter((t: any) => t.type !== 'Admin' || props.api.visibility === 'AdminOnly')
                    .filter(
                      (team: any) => plan.visibility === 'Public' || team._id === props.ownerTeam._id
                    )
                    .filter((t: any) => !props.tenant.subscriptionSecurity || t.type !== 'Personnal')}
                  pendingTeams={props.pendingSubscriptions.map((s: any) => s.action.team)}
                  authorizedTeams={props.subscriptions
                    .filter((f: any) => !f._deleted)
                    .map((subs: any) => subs.team)}
                  allowMultipleDemand={plan.allowMultipleKeys}
                  withAllTeamSelector={false}
                  action={(teams) => showApiKeySelectModal(teams)}
                >
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <button type="button" className="btn btn-sm btn-access-negative col-12">
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <button
              type="button"
              className="btn btn-sm btn-access-negative mx-auto mt-3"
              onClick={() => props.openLoginOrRegisterModal({ ...props })}
            >
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="d-flex col flex-column pricing-content">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="album">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="container">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="row">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            {possibleUsagePlans.map((plan: any) => <div key={plan._id} className="col-md-4">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <ApiPricingCard
                // @ts-expect-error TS(2322): Type '{ api: any; key: any; plan: any; myTeams: an... Remove this comment to see the full error message
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
