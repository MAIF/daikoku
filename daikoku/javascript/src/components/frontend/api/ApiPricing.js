import React, { useContext } from 'react';
import { PropTypes } from 'prop-types';
import _ from 'lodash';
import { currencies } from '../../../services/currencies';

import { formatPlanType } from '../../utils/formatters';
import { ActionWithTeamSelector } from '../../utils/ActionWithTeamSelector';
import { Can, access, apikey, getCurrencySymbol, formatCurrency, manage } from '../../utils';
import { openLoginOrRegisterModal, openApiKeySelectModal, I18nContext } from '../../../core';
import { connect } from 'react-redux';
import * as Services from '../../../services';

const Curreny = ({ plan }) => {
  const cur = _.find(currencies, (c) => c.code === plan.currency.code);
  return (
    <span>
      {' '}
      {cur.name}({cur.symbol})
    </span>
  );
};

const currency = (plan) => {
  const cur = _.find(currencies, (c) => c.code === plan.currency.code);
  return `${cur.name}(${cur.symbol})`;
};

function ApiPricingCardComponent(props) {
  const { Translation } = useContext(I18nContext);

  const renderFreeWithoutQuotas = () => (
    <span>
      <Translation i18nkey="free.without.quotas.desc">
        You'll pay nothing and do whatever you want :)
      </Translation>
    </span>
  );

  const renderFreeWithQuotas = () => (
    <span>
      <Translation i18nkey="free.with.quotas.desc" replacements={[props.plan.maxPerMonth]}>
        You'll pay nothing but you'll have {props.plan.maxPerMonth} authorized requests per month
      </Translation>
    </span>
  );

  const renderQuotasWithLimits = () => (
    <span>
      <Translation
        i18nkey="quotas.with.limits.desc"
        replacements={[props.plan.costPerMonth, currency(props.plan), props.plan.maxPerMonth]}>
        You'll pay {props.plan.costPerMonth}
        <Curreny plan={props.plan} /> and you'll have {props.plan.maxPerMonth} authorized requests
        per month
      </Translation>
    </span>
  );

  const renderQuotasWithoutLimits = () => (
    <span>
      <Translation
        i18nkey="quotas.without.limits.desc"
        replacements={[
          props.plan.costPerMonth,
          currency(props.plan),
          props.plan.maxPerMonth,
          props.plan.costPerAdditionalRequest,
          currency(props.plan),
        ]}>
        You'll pay {props.plan.costPerMonth}
        <Curreny plan={props.plan} /> for {props.plan.maxPerMonth} authorized requests per month and
        you'll be charged {props.plan.costPerAdditionalRequest}
        <Curreny plan={props.plan} /> per additional request
      </Translation>
    </span>
  );

  const renderPayPerUse = () => {
    if (props.plan.costPerMonth === 0.0) {
      return (
        <span>
          <Translation
            i18nkey="pay.per.use.desc.default"
            replacements={[
              props.plan.costPerMonth,
              currency(props.plan),
              props.plan.costPerRequest,
              currency(props.plan),
            ]}>
            You'll pay {props.plan.costPerMonth}
            <Curreny plan={props.plan} /> per month and you'll be charged{' '}
            {props.plan.costPerRequest}
            <Curreny plan={props.plan} /> per request
          </Translation>
        </span>
      );
    } else {
      return (
        <span>
          <Translation
            i18nkey="pay.per.use.desc.default"
            replacements={[props.plan.costPerRequest, currency(props.plan)]}>
            You'll be charged {props.plan.costPerRequest}
            <Curreny plan={props.plan} /> per request
          </Translation>
        </span>
      );
    }
  };

  const showApiKeySelectModal = (team) => {
    const { api, plan } = props;

    Services.getAllTeamSubscriptions(team).then((apiKeys) => {
      if (!plan.aggregationApiKeysSecurity || apiKeys.length <= 0) props.askForApikeys(team, plan);
      else
        props.openApiKeySelectModal({
          plan,
          apiKeys,
          onSubscribe: () => props.askForApikeys(team, plan),
          extendApiKey: (apiKey) => props.askForApikeys(team, plan, apiKey),
        });
    });
  };

  const plan = props.plan;
  const type = plan.type;
  const customDescription = plan.customDescription;
  const authorizedTeams = props.myTeams
    .filter((t) => !props.tenant.subscriptionSecurity || t.type !== 'Personal')
    .filter(
      (t) =>
        props.api.visibility === 'Public' ||
        props.api.authorizedTeams.includes(t._id) ||
        t._id === props.ownerTeam._id
    );

  const allPossibleTeams = _.difference(
    authorizedTeams.map((t) => t._id),
    props.subscriptions
      .filter(() => !plan.allowMultipleKey)
      .filter((f) => !f._deleted)
      .map((s) => s.team)
  );

  const isPending = !_.difference(
    allPossibleTeams,
    props.pendingSubscriptions.map((s) => s.action.team)
  ).length;

  const isAccepted = !allPossibleTeams.length;

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
    <div className="card mb-4 shadow-sm">
      <div className="card-img-top card-link card-skin" data-holder-rendered="true">
        <span>{plan.customName || formatPlanType(plan, translateMethod)}</span>
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
            {!plan.maxPerSecond && !plan.maxPerMonth && translateMethod('plan.limits.unlimited')}
            {!!plan.maxPerSecond && !!plan.maxPerMonth && (
              <div>
                <div>
                  <Translation
                    i18nkey="plan.limits"
                    replacements={[plan.maxPerSecond, plan.maxPerMonth]}>
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
              )}>
              {props.api.visibility !== 'AdminOnly' && (
                <Can
                  I={manage}
                  a={apikey}
                  teams={authorizedTeams.filter((team) => team._id === props.ownerTeam._id)}>
                  {!plan.otoroshiTarget && (
                    <span className="badge badge-danger">Missing otoroshi target</span>
                  )}
                </Can>
              )}
              {(props.api.visibility === 'AdminOnly' ||
                (plan.otoroshiTarget && !isAccepted && !isPending)) && (
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
                    .filter((t) => t.type !== 'Admin' || props.api.visibility === 'AdminOnly')
                    .filter(
                      (team) => plan.visibility === 'Public' || team._id === props.ownerTeam._id
                    )
                    .filter((t) => !props.tenant.subscriptionSecurity || t.type !== 'Personnal')}
                  pendingTeams={props.pendingSubscriptions.map((s) => s.action.team)}
                  authorizedTeams={props.subscriptions
                    .filter((f) => !f._deleted)
                    .map((subs) => subs.team)}
                  allowMultipleDemand={plan.allowMultipleKeys}
                  withAllTeamSelector={false}
                  action={(teams) => showApiKeySelectModal(teams)}>
                  <button type="button" className="btn btn-sm btn-access-negative col-12">
                    <Translation
                      i18nkey={
                        plan.subscriptionProcess === 'Automatic' ? 'Get API key' : 'Request API key'
                      }>
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
              onClick={() => props.openLoginOrRegisterModal({ ...props })}>
              <Translation i18nkey="Get API key">Get API key</Translation>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  openLoginOrRegisterModal: (modalProps) => openLoginOrRegisterModal(modalProps),
  openApiKeySelectModal: (modalProps) => openApiKeySelectModal(modalProps),
};

export const ApiPricingCard = connect(mapStateToProps, mapDispatchToProps)(ApiPricingCardComponent);

ApiPricingCard.propTypes = {
  api: PropTypes.object.isRequired,
  plan: PropTypes.object.isRequired,
  myTeams: PropTypes.array.isRequired,
  subscriptions: PropTypes.array.isRequired,
  pendingSubscriptions: PropTypes.array.isRequired,
  askForApikeys: PropTypes.func.isRequired,
  updateSubscriptions: PropTypes.func.isRequired,
  ownerTeam: PropTypes.object.isRequired,
};

export function ApiPricing(props) {
  const api = props.api;
  if (!api) {
    return null;
  }

  const possibleUsagePlans = api.possibleUsagePlans.filter((plan) => {
    return (
      plan.visibility === 'Public' ||
      props.myTeams.some((team) => team._id === props.ownerTeam._id) ||
      props.myTeams.some((team) => plan.authorizedTeams.includes(team._id))
    );
  });

  return (
    <div className="d-flex col flex-column pricing-content">
      <div className="album">
        <div className="container">
          <div className="row">
            {possibleUsagePlans.map((plan) => (
              <div key={plan._id} className="col-md-4">
                <ApiPricingCard
                  api={api}
                  key={plan._id}
                  plan={plan}
                  myTeams={props.myTeams}
                  ownerTeam={props.ownerTeam}
                  subscriptions={props.subscriptions.filter(
                    (subs) => subs.api === api._id && subs.plan === plan._id
                  )}
                  pendingSubscriptions={props.pendingSubscriptions.filter(
                    (subs) => subs.action.api === api._id && subs.action.plan === plan._id
                  )}
                  askForApikeys={props.askForApikeys}
                  updateSubscriptions={props.updateSubscriptions}
                  tenant={props.tenant}
                  connectedUser={props.connectedUser}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

ApiPricing.propTypes = {
  api: PropTypes.object.isRequired,
  myTeams: PropTypes.array.isRequired,
  ownerTeam: PropTypes.object.isRequired,
  subscriptions: PropTypes.array.isRequired,
  pendingSubscriptions: PropTypes.array.isRequired,
  updateSubscriptions: PropTypes.func.isRequired,
};
