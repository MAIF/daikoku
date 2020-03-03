import React, { Component } from 'react';
import { PropTypes } from 'prop-types';
import _ from 'lodash';
import { currencies } from '../../../services/currencies';

import { formatPlanType } from '../../utils/formatters';
import { ActionWithTeamSelector } from '../../utils/ActionWithTeamSelector';
import { t, Translation } from '../../../locales';
import { Can, access, apikey } from '../../utils';

const Curreny = ({ plan }) => {
  const cur = _.find(currencies, c => c.code === plan.currency.code);
  return (
    <span>
      {' '}
      {cur.name}({cur.symbol})
    </span>
  );
};

const currency = plan => {
  const cur = _.find(currencies, c => c.code === plan.currency.code);
  return `${cur.name}(${cur.symbol})`;
};

export class ApiPricingCard extends Component {
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
    const authorizedTeams = this.props.myTeams.filter(
      t =>
        this.props.api.visibility === 'Public' ||
        this.props.api.authorizedTeams.includes(t._id) ||
        t._id === this.props.ownerTeam._id
    );

    const allPossibleTeams = _.difference(
      authorizedTeams.map(t => t._id),
      this.props.subscriptions.map(s => s.team)
    );
    const isPending = !_.difference(
      allPossibleTeams,
      this.props.pendingSubscriptions.map(s => s.action.team)
    ).length;
    const isAccepted = !allPossibleTeams.length;

    return (
      <div className="card mb-4 shadow-sm">
        <div className="card-img-top card-link card-skin" data-holder-rendered="true">
          <span>{formatPlanType(plan)}</span>
        </div>
        <div className="card-body plan-body">
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
          <div className="d-flex justify-content-between align-items-center">
            <div className="btn-group">
              {plan.otoroshiTarget && !isAccepted && isPending && (
                <button type="button" className="btn btn-sm btn-access-negative">
                  {' '}
                  Request in progress{' '}
                </button>
              )}
              {this.props.api.published && (
                <Can
                  I={access}
                  a={apikey}
                  teams={authorizedTeams.filter(
                    team => plan.visibility === 'Public' || team._id === this.props.ownerTeam._id
                  )}>
                  {(this.props.api.visibility === 'AdminOnly' || (plan.otoroshiTarget && !isAccepted && !isPending)) && (
                    <ActionWithTeamSelector
                      title={t(
                        'team.selection.title',
                        this.props.currentLanguage,
                        'Select the team of the subscription'
                      )}
                      description={t(
                        'team.selection.desc',
                        this.props.currentLanguage,
                        'You are going to subscribe to the api. On which team do you want to make this subscriptions ?'
                      )}
                      currentLanguage={this.props.currentLanguage}
                      teams={
                        authorizedTeams.filter(
                          team =>
                            plan.visibility === 'Public' || team._id === this.props.ownerTeam._id
                        )
                      }
                      pendingTeams={this.props.pendingSubscriptions.map(s => s.action.team)}
                      authorizedTeams={this.props.subscriptions.map(subs => subs.team)}
                      allowMultipleDemand={plan.allowMultipleKeys}
                      action={teams => this.props.askForApikeys(teams)}
                      withAllTeamSelector={true}>
                      <button type="button" className="btn btn-sm btn-access-negative">
                        <Translation i18nkey="Subscribe" language={this.props.currentLanguage}>
                          Subscribe
                        </Translation>
                      </button>
                    </ActionWithTeamSelector>
                  )}
                </Can>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

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

    const possibleUsagePlans = api.possibleUsagePlans.filter(plan => {
      return (
        plan.visibility === 'Public' ||
        this.props.myTeams.some(team => team._id === this.props.ownerTeam._id) ||
        this.props.myTeams.some(team => plan.authorizedTeams.includes(team._id))
      );
    });

    return (
      <div className="d-flex col flex-column pricing-content">
        <div className="album">
          <div className="container">
            <div className="row">
              {possibleUsagePlans.map(plan => (
                <div key={plan._id} className="col-md-4">
                  <ApiPricingCard
                    api={api}
                    key={plan._id}
                    plan={plan}
                    myTeams={this.props.myTeams}
                    ownerTeam={this.props.ownerTeam}
                    subscriptions={this.props.subscriptions.filter(
                      subs => subs.api === api._id && subs.plan === plan._id
                    )}
                    pendingSubscriptions={this.props.pendingSubscriptions.filter(
                      subs => subs.action.api === api._id && subs.action.plan === plan._id
                    )}
                    askForApikeys={teams => this.props.askForApikeys(teams, plan)}
                    updateSubscriptions={this.props.updateSubscriptions}
                    currentLanguage={this.props.currentLanguage}
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
