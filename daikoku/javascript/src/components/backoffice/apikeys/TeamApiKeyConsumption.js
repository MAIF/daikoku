import React, { Component } from 'react';
import { Progress } from 'antd';
import moment from 'moment';
import { connect } from 'react-redux';

import * as Services from '../../../services';
import { OtoroshiStatsVizualization, TeamBackOffice } from '../..';
import { Spinner, Can, read, stat } from '../../utils';
import { t, Translation } from '../../../locales';

class TeamApiKeyConsumptionComponent extends Component {
  state = {
    plan: null,
  };

  mappers = [
    {
      type: 'LineChart',
      label: (data, max) => this.getLabelForDataIn(data, max),
      title: t('Data In', this.props.currentLanguage),
      formatter: (data) =>
        data.map((item) => ({
          date: moment(item.from).format('DD MMM.'),
          count: item.hits,
        })),
      xAxis: 'date',
      yAxis: 'count',
    },
    {
      type: 'Global',
      label: t('Global informations', this.props.currentLanguage),
      formatter: (data) => (data.length ? data[data.length - 1].globalInformations : []),
    },
  ];

  getLabelForDataIn = (datas, max) => {
    let hits = datas.length ? datas.reduce((acc, data) => acc + data.hits, 0) : 0;

    return (
      <div>
        <div>
          <Translation i18nkey="Usage">
            Usage
          </Translation>
        </div>
        <div>
          {hits.prettify()}{' '}
          <Translation i18nkey="Hit" isPlural={hits > 1}>
            hits
          </Translation>
        </div>
        {!!max && (
          <div>
            <Progress
              status="normal"
              percent={(hits / max) * 100}
              default={'default'}
              showInfo={false}
            />
          </div>
        )}
      </div>
    );
  };

  getInformations = () => {
    return Services.getSubscriptionInformations(
      this.props.match.params.subscription,
      this.props.currentTeam._id
    );
  };

  render() {
    return (
      <TeamBackOffice
        tab="ApiKeys"
        title={`${this.props.currentTeam.name} - ${t(
          'API key consumption',
          this.props.currentLanguage
        )}`}>
        <Can I={read} a={stat} team={this.props.currentTeam} dispatchError>
          <div className="d-flex col flex-column pricing-content">
            <div className="row">
              <div className="col-12">
                <h1>Api Consumption</h1>
                <PlanInformations fetchData={() => this.getInformations()} />
              </div>
              <div className="col section p-2">
                <OtoroshiStatsVizualization
                  sync={() =>
                    Services.syncSubscriptionConsumption(
                      this.props.match.params.subscription,
                      this.props.currentTeam._id
                    )
                  }
                  fetchData={(from, to) =>
                    Services.subscriptionConsumption(
                      this.props.match.params.subscription,
                      this.props.currentTeam._id,
                      from.valueOf(),
                      to.valueOf()
                    ).then((c) => c.consumptions)
                  }
                  mappers={this.mappers}
                  currentLanguage={this.props.currentLanguage}
                  forConsumer={true}
                />
              </div>
            </div>
          </div>
        </Can>
      </TeamBackOffice>
    );
  }
}

class PlanInformations extends Component {
  state = {
    loading: true,
    informations: null,
  };

  componentDidMount() {
    this.props.fetchData().then((informations) => this.setState({ informations, loading: false }));
  }

  render() {
    if (this.state.loading) {
      return <Spinner width="50" height="50" />;
    }

    if (!this.state.informations || !this.state.informations.api) {
      return null;
    }

    return (
      <h3>
        {this.state.informations.api.name} -{' '}
        {this.state.informations.plan.customName || this.state.informations.plan.type}
      </h3>
    );
  }
}

const mapStateToProps = (state) => ({
  ...state.context,
});

export const TeamApiKeyConsumption = connect(mapStateToProps)(TeamApiKeyConsumptionComponent);
