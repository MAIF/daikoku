import React, { Component } from 'react';
import { connect } from 'react-redux';
import moment from 'moment';
import classNames from 'classnames';
import _ from 'lodash';

import * as Services from '../../../services';

import { OtoroshiStatsVizualization, TeamBackOffice } from '../..';
import { currencies } from '../../../services/currencies';
import { GlobalDataConsumption, Spinner, Can, read, stat, formatPlanType } from '../../utils';
import { t, Translation } from '../../../locales';

const Currency = ({ plan }) => {
  const cur = _.find(currencies, (c) => c.code === plan.currency.code);
  return (
    <span>
      {' '}
      {cur.name}({cur.symbol})
    </span>
  );
};

const sumGlobalInformations = (data) =>
  data
    .map((d) => d.globalInformations)
    .reduce((acc, item) => {
      Object.keys(item).forEach((key) => (acc[key] = (acc[key] || 0) + item[key]));
      return acc;
    }, {});

class TeamApiConsumptionComponent extends Component {
  state = {
    api: null,
    consumptions: null,
    period: {
      from: moment().startOf('day'),
      to: moment().add(1, 'day').startOf('day'),
    },
    viewByPlan: true,
  };

  mappers = [
    {
      type: 'LineChart',
      label: (data) => {
        const totalHits = data.reduce((acc, cons) => acc + cons.hits, 0);
        return t(
          'data.in.plus.hits',
          this.props.currentLanguage,
          false,
          `Data In (${totalHits})`,
          totalHits
        );
      },
      title: t('Data In', this.props.currentLanguage),
      formatter: (data) =>
        data.reduce((acc, item) => {
          const date = moment(item.to).format('DD MMM.');
          const value = acc.find((a) => a.date === date) || { count: 0 };
          return [...acc.filter((a) => a.date !== date), { date, count: value.count + item.hits }];
        }, []),
      xAxis: 'date',
      yAxis: 'count',
    },
    {
      type: 'RoundChart',
      label: t('Hits by apikey', this.props.currentLanguage),
      title: t('Hits by apikey', this.props.currentLanguage),
      formatter: (data) =>
        data.reduce((acc, item) => {
          const value = acc.find((a) => a.clientId === item.clientId) || { count: 0 };

          const team = this.state.teams.find((t) => t._id === item.team);
          const plan = this.state.api.possibleUsagePlans.find((p) => p._id == item.plan);

          const name = `${team.name}/${plan.customName || plan.type}`;

          return [
            ...acc.filter((a) => a.name !== item.clientId),
            { clientId: item.clientId, name, count: value.count + item.hits },
          ];
        }, []),
      dataKey: 'count',
    },
    {
      type: 'Global',
      label: t('Global informations', this.props.currentLanguage),
      formatter: (data) => sumGlobalInformations(data),
    },
    {
      label: t('Plans', this.props.currentLanguage, true),
      formatter: (data) => (
        <div className="row">
          {this.state.api.possibleUsagePlans.map((plan) => (
            <div key={plan._id} className="col-sm-4 col-lg-3">
              <PlanLightConsumption
                api={this.state.api}
                team={this.props.currentTeam}
                key={plan._id}
                plan={plan}
                data={sumGlobalInformations(data.filter((d) => d.plan === plan._id))}
                period={this.state.period}
                handleClick={() =>
                  this.props.history.push(
                    `/${this.props.currentTeam._humanReadableId}/settings/consumptions/apis/${this.state.api._humanReadableId}/${this.state.api.currentVersion}/plan/${plan._id}`
                  )
                }
                currentLanguage={this.props.currentLanguage}
              />
            </div>
          ))}
        </div>
      ),
    },
  ];

  componentDidMount() {
    Promise.all([
      Services.teams(),
      Services.teamApi(this.props.currentTeam._id, this.props.match.params.apiId),
    ]).then(([teams, api]) => this.setState({ teams, api }));
  }

  render() {
    return (
      <TeamBackOffice
        tab="Apis"
        isLoading={!this.state.api}
        title={`${this.props.currentTeam.name} - ${t(
          'API consumption',
          this.props.currentLanguage
        )}`}>
        <Can I={read} a={stat} team={this.props.currentTeam} dispatchError={true}>
          {!!this.state.api && (
            <div className="d-flex col flex-column pricing-content">
              <div className="row">
                <div className="col-12">
                  <h1>
                    <Translation
                      i18nkey="api.consumption.title"
                      language={this.props.currentLanguage}
                      replacements={[this.state.api.name]}>
                      Api Consumption - {this.state.api.name}
                    </Translation>
                  </h1>
                </div>
                <div className="col section p-2">
                  <OtoroshiStatsVizualization
                    sync={() =>
                      Services.syncApiConsumption(
                        this.props.match.params.apiId,
                        this.props.currentTeam._id
                      )
                    }
                    fetchData={(from, to) =>
                      Services.apiGlobalConsumption(
                        this.props.match.params.apiId,
                        this.props.currentTeam._id,
                        from.valueOf(),
                        to.valueOf()
                      )
                    }
                    currentLanguage={this.props.currentLanguage}
                    mappers={this.mappers}
                  />
                </div>
              </div>
            </div>
          )}
        </Can>
      </TeamBackOffice>
    );
  }
}

const mapStateToProps = (state) => ({
  ...state.context,
});

export const TeamApiConsumption = connect(mapStateToProps)(TeamApiConsumptionComponent);

class PlanLightConsumption extends Component {
  state = {
    loading: false,
    error: false,
  };

  renderFreeWithoutQuotas = () => <span>You'll pay nothing and do whatever you want :)</span>;

  renderFreeWithQuotas = () => (
    <span>
      You'll pay nothing but you'll have {this.props.plan.maxPerMonth} authorized requests per month
    </span>
  );

  renderQuotasWithLimits = () => (
    <span>
      You'll pay {this.props.plan.costPerMonth}
      <Currency plan={this.props.plan} /> and you'll have {this.props.plan.maxPerMonth} authorized
      requests per month
    </span>
  );

  renderQuotasWithoutLimits = () => (
    <span>
      You'll pay {this.props.plan.costPerMonth}
      <Currency plan={this.props.plan} /> for {this.props.plan.maxPerMonth} authorized requests per
      month and you'll be charged {this.props.plan.costPerAdditionalRequest}
      <Currency plan={this.props.plan} /> per additional request
    </span>
  );

  renderPayPerUse = () => {
    if (this.props.plan.costPerMonth === 0.0) {
      return (
        <span>
          You'll pay {this.props.plan.costPerMonth}
          <Currency plan={this.props.plan} /> per month and you'll be charged{' '}
          {this.props.plan.costPerRequest}
          <Currency plan={this.props.plan} /> per request
        </span>
      );
    } else {
      return (
        <span>
          You'll be charged {this.props.plan.costPerRequest}
          <Currency plan={this.props.plan} /> per request
        </span>
      );
    }
  };

  render() {
    const plan = this.props.plan;
    const type = plan.type;
    const customName = plan.customName;
    const customDescription = plan.customDescription;
    return (
      <div
        className={classNames('card mb-3 shadow-sm consumptions-plan', {
          'no-redirect': this.state.loading || this.state.error,
        })}
        onClick={this.props.handleClick}>
        <div className="card-img-top card-data" data-holder-rendered="true">
          {this.state.loading && <Spinner />}
          {!this.state.loading && !this.state.error && (
            <GlobalDataConsumption data={this.props.data} />
          )}
        </div>
        <div className="card-body">
          {customName && <h3>{customName}</h3>}
          {!customName && <h3>{formatPlanType(plan, this.props.currentLanguage)}</h3>}
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
        </div>
      </div>
    );
  }
}
