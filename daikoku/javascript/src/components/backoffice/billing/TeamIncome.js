import React, { Component } from 'react';
import { connect } from 'react-redux';
import moment from 'moment';
import _ from 'lodash';

import { TeamBackOffice } from '../TeamBackOffice';
import * as Services from '../../../services';
import { MonthPicker } from '../../inputs/monthPicker';
import { ApiTotal, NoData, PriceCartridge, TheadBillingContainer } from './components';
import { formatCurrency, formatPlanType, Spinner, Can, read, stat } from '../../utils';
import { t, Translation } from '../../../locales';

class TeamIncomeComponent extends Component {
  state = {
    consumptions: [],
    consumptionsByApi: [],
    selectedApi: undefined,
    selectedPlan: undefined,
    teams: [],
    loading: false,
    date: moment(),
  };

  componentDidMount() {
    this.getBillingData(this.props.currentTeam);
  }

  getBillingData = team => {
    this.setState({ loading: true }, () => {
      Promise.all([
        Services.getTeamIncome(
          team._id,
          this.state.date.startOf('month').valueOf(),
          this.state.date.endOf('month').valueOf()
        ),
        Services.myVisibleApis(team._id),
        Services.teams(),
      ]).then(([consumptions, apis, teams]) => {
        const consumptionsByApi = this.getConsumptionsByApi(consumptions);
        this.setState({ consumptions, consumptionsByApi, apis, teams, loading: false });
      });
    });
  };

  getConsumptionsByApi = consumptions =>
    consumptions.reduce((acc, consumption) => {
      const api = acc.find(item => item.api === consumption.api);
      const { hits, total } = api ? api.billing : { hits: 0, total: 0 };
      const billing = {
        hits: hits + consumption.billing.hits,
        total: total + consumption.billing.total,
      };
      const obj = { billing, api: consumption.api };

      return [...acc.filter(item => item.api !== consumption.api), obj];
    }, []);

  sync = () => {
    this.setState({ loading: true }, () => {
      Services.syncTeamIncome(this.props.currentTeam._id).then(() =>
        this.getBillingData(this.props.currentTeam)
      );
    });
  };

  render() {
    const total = this.state.consumptions.reduce((acc, curr) => acc + curr.billing.total, 0);
    const mostRecentConsumption = _.maxBy(this.state.consumptions, c => c.to);
    const lastDate =
      mostRecentConsumption && moment(mostRecentConsumption.to).format('DD/MM/YYYY HH:mm');
    return (
      <TeamBackOffice tab="Income">
        <Can I={read} a={stat} team={this.props.currentTeam} dispatchError={true}>
          <div className="row">
            <div className="col">
              <h1>
                <Translation i18nkey="Income" language={this.props.currentLanguage}>
                  Income
                </Translation>
              </h1>
              {this.state.loading && <Spinner />}
              {!this.state.loading && (
                <div className="row">
                  <div className="col apis">
                    <div className="row month__and__total">
                      <div className="col-12 month__selector d-flex align-items-center">
                        <MonthPicker
                          updateDate={date =>
                            this.setState({ date }, () =>
                              this.getBillingData(this.props.currentTeam)
                            )
                          }
                          value={this.state.date}
                        />
                        <button className="btn btn-sm btn-access-negative" onClick={this.sync}>
                          <i className="fas fa-sync-alt" />
                        </button>
                        {lastDate && (
                          <i className="ml-1">
                            <Translation
                              i18nkey="date.update"
                              language={this.props.currentLanguage}
                              replacements={[lastDate]}>
                              upd. {lastDate}
                            </Translation>
                          </i>
                        )}
                      </div>
                    </div>
                    <div className="row api__billing__card__container section p-2">
                      <TheadBillingContainer
                        language={this.props.currentLanguage}
                        label={t('Apis', this.props.currentLanguage)}
                        total={formatCurrency(total)}
                      />
                      {!this.state.consumptionsByApi.length && (
                        <NoData language={this.props.currentLanguage} />
                      )}
                      {this.state.consumptionsByApi
                        .sort((api1, api2) => api2.billing.total - api1.billing.total)
                        .map(({ api, billing }) => (
                          <ApiTotal
                            key={api}
                            handleClick={() =>
                              this.setState({
                                selectedPlan: undefined,
                                selectedApi: this.state.apis.find(a => a._id === api),
                              })
                            }
                            api={this.state.apis.find(a => a._id === api)}
                            total={billing.total}
                          />
                        ))}
                      <TheadBillingContainer
                        language={this.props.currentLanguage}
                        label={t('Apis', this.props.currentLanguage)}
                        total={formatCurrency(total)}
                      />
                    </div>
                  </div>
                  <div className="col apikeys">
                    {this.state.selectedApi && !this.state.selectedPlan && (
                      <div className="api-plans-consumptions section p-2">
                        <div className="api__plans__consumption__header">
                          <h3 className="api__name">{this.state.selectedApi.name}</h3>
                          <i
                            className="far fa-times-circle quit"
                            onClick={() => this.setState({ selectedApi: undefined })}
                          />
                        </div>
                        {this.state.consumptions
                          .filter(c => c.api === this.state.selectedApi._id)
                          .reduce((agg, consumption) => {
                            const maybeAggCons = agg.find(c => c.plan === consumption.plan);
                            if (maybeAggCons) {
                              return [
                                ...agg.filter(x => x.plan !== consumption.plan),
                                {
                                  ...maybeAggCons,
                                  billing: {
                                    hits: maybeAggCons.billing.hits + consumption.billing.hits,
                                    total: maybeAggCons.billing.total + consumption.billing.total,
                                  },
                                },
                              ];
                            } else {
                              return [...agg, consumption];
                            }
                          }, [])
                          .sort((c1, c2) => c2.billing.total - c1.billing.total)
                          .map(({ plan, billing }, idx) => {
                            const usagePlan = this.state.selectedApi.possibleUsagePlans.find(
                              pp => pp._id === plan
                            );
                            return (
                              <PriceCartridge
                                key={idx}
                                label={formatPlanType(usagePlan)}
                                total={billing.total}
                                currency={usagePlan.currency}
                                handleClick={() => this.setState({ selectedPlan: usagePlan })}
                              />
                            );
                          })}
                      </div>
                    )}
                    {this.state.selectedPlan && (
                      <div>
                        <div className="api__plans__consumption__header">
                          <h3 className="api__name">
                            {this.state.selectedApi.name} -{' '}
                            {formatPlanType(this.state.selectedPlan)}
                          </h3>
                          <i
                            className="far fa-arrow-alt-circle-left quit"
                            onClick={() => this.setState({ selectedPlan: undefined })}
                          />
                        </div>
                        {this.state.consumptions
                          .filter(
                            c =>
                              c.api === this.state.selectedApi._id &&
                              c.plan === this.state.selectedPlan._id
                          )
                          .map((c, idx) => {
                            const team = this.state.teams.find(t => t._id === c.team);
                            return (
                              <PriceCartridge
                                key={idx}
                                label={team.name}
                                total={c.billing.total}
                                currency={this.state.selectedPlan.currency}
                              />
                            );
                          })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Can>
      </TeamBackOffice>
    );
  }
}

const mapStateToProps = state => ({
  ...state.context,
});

export const TeamIncome = connect(mapStateToProps)(TeamIncomeComponent);
