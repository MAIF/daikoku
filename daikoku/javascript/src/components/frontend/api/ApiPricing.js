import React, { Component } from 'react';
import { PropTypes } from 'prop-types';
import _ from 'lodash';
import { currencies } from '../../../services/currencies';

import { formatPlanType } from '../../utils/formatters';
import { ActionWithTeamSelector } from '../../utils/ActionWithTeamSelector';
import { t, Translation } from '../../../locales';
import {
  Can,
  access,
  apikey,
  getCurrencySymbol,
  formatCurrency
} from '../../utils';
import { openLoginOrRegisterModal } from '../../../core';
import { connect } from 'react-redux';

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


class ApiPricingCardComponent extends Component {
  renderFreeWithoutQuotas = () => (
    <span>
      <Translation i18nkey="free.without.quotas.desc" language={this.props.currentLanguage}>
        You'll pay nothing and do whatever you want :)
      </Translation>
    </span>
  );

  renderFreeWithQuotas = () => (
    <span>
      <Translation
        i18nkey="free.with.quotas.desc"
        language={this.props.currentLanguage}
        replacements={[this.props.plan.maxPerMonth]}>
        You'll pay nothing but you'll have {this.props.plan.maxPerMonth} authorized requests per
        month
      </Translation>
    </span>
  );

  renderQuotasWithLimits = () => (
    <span>
      <Translation
        i18nkey="quotas.with.limits.desc"
        language={this.props.currentLanguage}
        replacements={[
          this.props.plan.costPerMonth,
          currency(this.props.plan),
          this.props.plan.maxPerMonth,
        ]}>
        You'll pay {this.props.plan.costPerMonth}
        <Curreny plan={this.props.plan} /> and you'll have {this.props.plan.maxPerMonth} authorized
        requests per month
      </Translation>
    </span>
  );

  renderQuotasWithoutLimits = () => (
    <span>
      <Translation
        i18nkey="quotas.without.limits.desc"
        language={this.props.currentLanguage}
        replacements={[
          this.props.plan.costPerMonth,
          currency(this.props.plan),
          this.props.plan.maxPerMonth,
          this.props.plan.costPerAdditionalRequest,
          currency(this.props.plan),
        ]}>
        You'll pay {this.props.plan.costPerMonth}
        <Curreny plan={this.props.plan} /> for {this.props.plan.maxPerMonth} authorized requests per
        month and you'll be charged {this.props.plan.costPerAdditionalRequest}
        <Curreny plan={this.props.plan} /> per additional request
      </Translation>
    </span>
  );

  renderPayPerUse = () => {
    if (this.props.plan.costPerMonth === 0.0) {
      return (
        <span>
          <Translation
            i18nkey="pay.per.use.desc.default"
            language={this.props.currentLanguage}
            replacements={[
              this.props.plan.costPerMonth,
              currency(this.props.plan),
              this.props.plan.costPerRequest,
              currency(this.props.plan),
            ]}>
            You'll pay {this.props.plan.costPerMonth}
            <Curreny plan={this.props.plan} /> per month and you'll be charged{' '}
            {this.props.plan.costPerRequest}
            <Curreny plan={this.props.plan} /> per request
          </Translation>
        </span>
      );
    } else {
      return (
        <span>
          <Translation
            i18nkey="pay.per.use.desc.default"
            language={this.props.currentLanguage}
            replacements={[this.props.plan.costPerRequest, currency(this.props.plan)]}>
            You'll be charged {this.props.plan.costPerRequest}
            <Curreny plan={this.props.plan} /> per request
          </Translation>
        </span>
      );
    }
  };

  render() {
    const plan = this.props.plan;
    const type = plan.type;
    const customDescription = plan.customDescription;
    const authorizedTeams = this.props.myTeams
      .filter((t) => !this.props.tenant.subscriptionSecurity || t.type === 'Organization')
      .filter(
        (t) =>
          this.props.api.visibility === 'Public' ||
          this.props.api.authorizedTeams.includes(t._id) ||
          t._id === this.props.ownerTeam._id
      );

    const allPossibleTeams = _.difference(
      authorizedTeams.map((t) => t._id),
      this.props.subscriptions.map((s) => s.team)
    );
    const isPending = !_.difference(
      allPossibleTeams,
      this.props.pendingSubscriptions.map((s) => s.action.team)
    ).length;
    const isAccepted = !allPossibleTeams.length;

    let pricing = t('Free', this.props.currentLanguage);
    const req = t('req.', this.props.currentLanguage);
    const month = t('month', this.props.currentLanguage);
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
          <span>{plan.customName || formatPlanType(plan)}</span>
        </div>
        <div className="card-body plan-body d-flex flex-column">
          <p className="card-text text-justify">
            {customDescription && <span>{customDescription}</span>}
            {!customDescription && type === 'FreeWithoutQuotas' && this.renderFreeWithoutQuotas()}
            {!customDescription && type === 'FreeWithQuotas' && this.renderFreeWithQuotas()}
            {!customDescription && type === 'QuotasWithLimits' && this.renderQuotasWithLimits()}
            {!customDescription &&
              type === 'QuotasWithoutLimits' &&
              this.renderQuotasWithoutLimits()}
            {!customDescription && type === 'PayPerUse' && this.renderPayPerUse()}
          </p>
          <div className="d-flex flex-column mb-2">
            <span className="plan-quotas">
              {!plan.maxPerSecond &&
                !plan.maxPerMonth &&
                t('plan.limits.unlimited', this.props.currentLanguage)}
              {!!plan.maxPerSecond && !!plan.maxPerMonth && (
                <div>
                  <div>
                    <Translation
                      i18nkey="plan.limits"
                      language={this.props.currentLanguage}
                      replacements={[plan.maxPerSecond, plan.maxPerMonth]}>
                      Limits: {plan.maxPerSecond} req./sec, {plan.maxPerMonth} req./month
                    </Translation>
                  </div>
                </div>
              )}
            </span>
            <span className="plan-pricing">
              <Translation
                i18nkey="plan.pricing"
                language={this.props.currentLanguage}
                replacements={[pricing]}>
                pricing: {pricing}
              </Translation>
            </span>
          </div>
          <div className="d-flex justify-content-between align-items-center">
            {plan.otoroshiTarget && !isAccepted && isPending && (
              <button type="button" disabled className="btn btn-sm btn-access-negative col-12">
                <Translation i18nkey="Request in progress" language={this.props.currentLanguage}>
                  Request in progress
                </Translation>
              </button>
            )}
            {!isAccepted && this.props.api.published && (
              <Can
                I={access}
                a={apikey}
                teams={authorizedTeams.filter(
                  (team) => plan.visibility === 'Public' || team._id === this.props.ownerTeam._id
                )}>
                {(this.props.api.visibility === 'AdminOnly' ||
                  (plan.otoroshiTarget && !isAccepted && !isPending)) && (
                    <ActionWithTeamSelector
                      title={t('team.selection.title', this.props.currentLanguage, 'Select teams')}
                      description={t(
                        plan.subscriptionProcess === 'Automatic'
                          ? 'team.selection.desc.get'
                          : 'team.selection.desc.request',
                        this.props.currentLanguage,
                        'You are going to get or request API keys. On which team do you want them for?'
                      )}
                      currentLanguage={this.props.currentLanguage}
                      teams={authorizedTeams
                        .filter((t) => t.type !== 'Admin')
                        .filter(
                          (team) =>
                            plan.visibility === 'Public' || team._id === this.props.ownerTeam._id
                        )
                        .filter(
                          (t) => !this.props.tenant.subscriptionSecurity || t.type === 'Organization'
                        )}
                      pendingTeams={this.props.pendingSubscriptions.map((s) => s.action.team)}
                      authorizedTeams={this.props.subscriptions.map((subs) => subs.team)}
                      allowMultipleDemand={plan.allowMultipleKeys}
                      action={(teams) => this.props.askForApikeys(teams)}
                      withAllTeamSelector={true}>
                      <button type="button" className="btn btn-sm btn-access-negative col-12">
                        <Translation
                          i18nkey={
                            plan.subscriptionProcess === 'Automatic'
                              ? 'Get API key'
                              : 'Request API key'
                          }
                          language={this.props.currentLanguage}>
                          {plan.subscriptionProcess === 'Automatic'
                            ? 'Get API key'
                            : 'Request API key'}
                        </Translation>
                      </button>
                    </ActionWithTeamSelector>
                  )}
              </Can>
            )}
            {
              this.props.connectedUser.isGuest &&
              <button
                type="button"
                className="btn btn-sm btn-access-negative mx-auto mt-3"
                onClick={() => this.props.openLoginOrRegisterModal({ ...this.props })}>
                <Translation i18nkey="Get API key" language={this.props.currentLanguage}>
                  Get API key
                </Translation>
              </button>
            }
          </div>
        </div>
      </div>
    );
  }
}

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  openLoginOrRegisterModal: (modalProps) => openLoginOrRegisterModal(modalProps)
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

export class ApiPricing extends Component {
  render() {
    const api = this.props.api;
    if (!api) {
      return null;
    }

    const possibleUsagePlans = api.possibleUsagePlans.filter((plan) => {
      return (
        plan.visibility === 'Public' ||
        this.props.myTeams.some((team) => team._id === this.props.ownerTeam._id) ||
        this.props.myTeams.some((team) => plan.authorizedTeams.includes(team._id))
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
                    myTeams={this.props.myTeams}
                    ownerTeam={this.props.ownerTeam}
                    subscriptions={this.props.subscriptions.filter(
                      (subs) => subs.api === api._id && subs.plan === plan._id
                    )}
                    pendingSubscriptions={this.props.pendingSubscriptions.filter(
                      (subs) => subs.action.api === api._id && subs.action.plan === plan._id
                    )}
                    askForApikeys={(teams) => this.props.askForApikeys(teams, plan)}
                    updateSubscriptions={this.props.updateSubscriptions}
                    currentLanguage={this.props.currentLanguage}
                    tenant={this.props.tenant}
                    connectedUser={this.props.connectedUser}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

ApiPricing.propTypes = {
  userIsTenantAdmin: PropTypes.bool.isRequired,
  api: PropTypes.object.isRequired,
  myTeams: PropTypes.array.isRequired,
  ownerTeam: PropTypes.object.isRequired,
  subscriptions: PropTypes.array.isRequired,
  pendingSubscriptions: PropTypes.array.isRequired,
  updateSubscriptions: PropTypes.func.isRequired,
};
