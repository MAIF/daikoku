import React, { Component } from 'react';
import { connect } from 'react-redux';
import moment from 'moment';
import _ from 'lodash';

import { TeamBackOffice } from '../TeamBackOffice';
import * as Services from '../../../services';
import { MonthPicker } from '../../inputs/monthPicker';
import { formatCurrency, formatPlanType, Can, read, stat } from '../../utils';
import { ApiTotal, NoData, PriceCartridge, TheadBillingContainer } from './components';
import { t, Translation } from "../../../locales";

import './teamBilling.scss';

class TeamBillingComponent extends Component {
  state = {
    consumptions: [],
    consumptionsByApi: [],
    selectedApi: undefined,
    loading: false,
    date: moment(),
  };

  componentDidMount() {
    this.getTeamBilling(this.props.currentTeam);
  }

  getTeamBilling(team) {
    this.setState({ loading: true }, () => {
      Promise.all([
        Services.getTeamBillings(
          team._id,
          moment()
            .startOf('month')
            .valueOf(),
          moment()
            .endOf('month')
            .valueOf()
        ),
        Services.subscribedApis(team._id),
      ]).then(([consumptions, apis]) => {
        const consumptionsByApi = this.getConsumptionsByApi(consumptions);
        this.setState({ consumptions, consumptionsByApi, apis, loading: false });
      });
    });
  }

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

  getBilling = date => {
    this.setState({ loading: true, selectedApi: undefined }, () => {
      Services.getTeamBillings(
        this.props.currentTeam._id,
        date.startOf('month').valueOf(),
        date.endOf('month').valueOf()
      ).then(consumptions =>
        this.setState({
          date,
          consumptions,
          consumptionsByApi: this.getConsumptionsByApi(consumptions),
          loading: false,
        })
      );
    });
  };

  sync = () => {
    this.setState({ loading: true}, () => {
      Services.syncTeamBilling(this.props.currentTeam._id)
      .then(() => Services.getTeamBillings(
        this.props.currentTeam._id,
        this.state.date.startOf('month').valueOf(),
        this.state.date.endOf('month').valueOf()))
      .then(consumptions =>
        this.setState({
          consumptions,
          consumptionsByApi: this.getConsumptionsByApi(consumptions),
          loading: false,
        })
      )
    })
  }

  render() {
    const total = this.state.consumptions.reduce((acc, curr) => acc + curr.billing.total, 0);
    const mostRecentConsumption = _.maxBy(this.state.consumptions, c => c.to)
    const lastDate = mostRecentConsumption && moment(mostRecentConsumption.to).format('DD/MM/YYYY HH:mm')
    
    return (
      <TeamBackOffice tab="Billing" isLoading={this.state.loading}>
        <Can I={read} a={stat} team={this.props.currentTeam} dispatchError={true}>
          <div className="row">
            <div className="col">
              <h1><Translation i18nkey="Billing" language={this.props.currentLanguage}>
                Billing
              </Translation></h1>
              <div className="row">
                <div className="col apis">
                  <div className="row month__and__total">
                    <div className="col-12 month__selector d-flex align-items-center">
                      <MonthPicker updateDate={this.getBilling} value={this.state.date} />
                      <button className="btn btn-access-negative" onClick={this.sync}>
                        <i className="fas fa-sync-alt ml-1" />
                      </button>
                      {lastDate && <i className="ml-1">
                        <Translation i18nkey="date.update" language={this.props.currentLanguage} replacements={[lastDate]}>
                          upd. {lastDate}
                        </Translation></i>}
                    </div>
                  </div>
                  <div className="row api__billing__card__container">
                    <TheadBillingContainer language={this.props.currentLanguage} label={t("Subscribed Apis", this.props.currentLanguage)} total={formatCurrency(total)} />
                    {!this.state.consumptionsByApi.length && <NoData language={this.props.currentLanguage}/>}
                    {this.state.consumptionsByApi
                      .sort((api1, api2) => api2.billing.total - api1.billing.total)
                      .map(({ api, billing }) => (
                        <ApiTotal
                          key={api}
                          handleClick={() =>
                            this.setState({ selectedApi: this.state.apis.find(a => a._id === api) })
                          }
                          api={this.state.apis.find(a => a._id === api)}
                          total={billing.total}
                        />
                      ))}
                    <TheadBillingContainer language={this.props.currentLanguage} label={t("Subscribed Apis", this.props.currentLanguage)} total={formatCurrency(total)} />
                  </div>
                </div>
                <div className="col apikeys">
                  {this.state.selectedApi && (
                    <div className="api-plans-consumptions">
                      <div className="api__plans__consumption__header">
                        <h3 className="api__name">{this.state.selectedApi.name}</h3>
                        <i
                          className="far fa-times-circle quit"
                          onClick={() => this.setState({ selectedApi: undefined })}
                        />
                      </div>
                      {this.state.consumptions
                        .filter(c => c.api === this.state.selectedApi._id)
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
                            />
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
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

export const TeamBilling = connect(
  mapStateToProps
)(TeamBillingComponent);
