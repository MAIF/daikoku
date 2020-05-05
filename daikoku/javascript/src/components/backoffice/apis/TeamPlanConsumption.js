import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import moment from 'moment';
import { connect } from 'react-redux';

import * as Services from '../../../services';
import { TeamBackOffice } from '../..';
import { OtoroshiStatsVizualization, Spinner } from '../../utils';

class TeamPlanConsumptionComponent extends Component {
  state = {
    api: null,
  };

  mappers = [
    {
      type: 'LineChart',
      label: data => {
        const totalHits = data.reduce((acc, cons) => acc + cons.hits, 0);
        return `Data In (${totalHits})`;
      },
      title: 'Data In',
      formatter: data =>
        data.reduce((acc, item) => {
          const date = moment(item.to).format('DD MMM.');
          const value = acc.find(a => a.date === date) || { count: 0 };
          return [...acc.filter(a => a.date !== date), { date, count: value.count + item.hits }];
        }, []),
      xAxis: 'date',
      yAxis: 'count',
    },
    {
      type: 'RoundChart',
      label: 'Hits by apikeys',
      title: 'Hits by apikey',
      formatter: data =>
        data.reduce((acc, item) => {
          const value = acc.find(a => a.name === item.clientId) || { count: 0 };

          const team = this.state.teams.find(t => t._id === item.team);
          const name = team.name;

          return [
            ...acc.filter(a => a.name !== item.clientId),
            { clientId: item.clientId, name, count: value.count + item.hits },
          ];
        }, []),
      dataKey: 'count',
    },
    {
      type: 'Global',
      label: 'Global informations',
      formatter: data => this.sumGlobalInformations(data),
    },
  ];

  getPlanInformation = () => {
    return Services.teamApi(this.props.currentTeam._id, this.props.match.params.apiId).then(api => {
      if (api.error) {
        return null;
      }
      return {
        api,
        plan: api.possibleUsagePlans.find(pp => pp._id === this.props.match.params.planId),
      };
    });
  };

  sumGlobalInformations = data => {
    const globalInformations = data.map(d => d.globalInformations);

    const value = globalInformations.reduce((acc, item) => {
      Object.keys(item).forEach(key => (acc[key] = (acc[key] || 0) + item[key]));
      return acc;
    }, {});

    const howManyDuration = globalInformations.filter(d => !!d.avgDuration).length;
    const howManyOverhead = globalInformations.filter(d => !!d.avgDuration).length;

    return {
      ...value,
      avgDuration: value.avgDuration / howManyDuration,
      avgOverhead: value.avgOverhead / howManyOverhead,
    };
  };

  componentDidMount() {
    Services.teams()
      .then(teams =>
        this.setState({ teams })
      );
  }

  render() {
    return (
      <TeamBackOffice tab="Apis">
        <div>
          <div className="row">
            <div className="col">
              <h1>Api Consumption</h1>
              <PlanInformations fetchData={() => this.getPlanInformation()} />
            </div>
            <p className="col">
              <Link
                to={`/${this.props.currentTeam._humanReadableId}/settings/consumptions/apis/${this.props.match.params.apiId}`}
                className="btn my-2 btn-access-negative">
                <i className="fas fa-angle-left" /> Back to plans
              </Link>
            </p>
          </div>
          <OtoroshiStatsVizualization
            sync={() =>
              Services.syncApiConsumption(this.props.match.params.apiId, this.props.currentTeam._id)
            }
            fetchData={(from, to) =>
              Services.apiConsumption(
                this.props.match.params.apiId,
                this.props.match.params.planId,
                this.props.currentTeam._id,
                from.valueOf(),
                to.valueOf()
              )
            }
            mappers={this.mappers}
          />
        </div>
      </TeamBackOffice>
    );
  }
}

const mapStateToProps = state => ({
  ...state.context,
});

export const TeamPlanConsumption = connect(mapStateToProps)(TeamPlanConsumptionComponent);

class PlanInformations extends Component {
  state = {
    loading: true,
    informations: null,
  };

  componentDidMount() {
    this.props.fetchData().then(informations => this.setState({ informations, loading: false }));
  }

  render() {
    if (this.state.loading) {
      return <Spinner width="50" height="50" />;
    }

    if (!this.state.informations) {
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
