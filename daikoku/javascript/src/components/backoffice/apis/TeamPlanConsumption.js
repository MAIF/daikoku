import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import moment from 'moment';
import { connect } from 'react-redux';

import * as Services from '../../../services';
import { TeamBackOffice } from '../..';
import { OtoroshiStatsVizualization, Spinner } from '../../utils';
import { I18nContext } from '../../../core';

function TeamPlanConsumptionComponent(props) {
  const { translateMethod } = useContext(I18nContext);

  const [state, setState] = useState({
    api: null,
  });

  const mappers = [
    {
      type: 'LineChart',
      label: (data) => {
        const totalHits = data.reduce((acc, cons) => acc + cons.hits, 0);
        return translateMethod('data.in.plus.hits', false, `Data In (${totalHits})`, totalHits);
      },
      title: translateMethod('Data In'),
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
      label: translateMethod('Hits by apikey'),
      title: translateMethod('Hits by apikey'),
      formatter: (data) =>
        data.reduce((acc, item) => {
          const value = acc.find((a) => a.name === item.clientId) || { count: 0 };

          const team = state.teams.find((t) => t._id === item.team);
          const name = team.name;

          return [
            ...acc.filter((a) => a.name !== item.clientId),
            { clientId: item.clientId, name, count: value.count + item.hits },
          ];
        }, []),
      dataKey: 'count',
    },
    {
      type: 'Global',
      label: translateMethod('Global informations'),
      formatter: (data) => sumGlobalInformations(data),
    },
  ];

  const getPlanInformation = () => {
    return Services.teamApi(
      props.currentTeam._id,
      props.match.params.apiId,
      props.match.params.versionId
    ).then((api) => {
      if (api.error) {
        return null;
      }
      return {
        api,
        plan: api.possibleUsagePlans.find((pp) => pp._id === props.match.params.planId),
      };
    });
  };

  const sumGlobalInformations = (data) => {
    const globalInformations = data.map((d) => d.globalInformations);

    const value = globalInformations.reduce((acc, item) => {
      Object.keys(item).forEach((key) => (acc[key] = (acc[key] || 0) + item[key]));
      return acc;
    }, {});

    const howManyDuration = globalInformations.filter((d) => !!d.avgDuration).length;
    const howManyOverhead = globalInformations.filter((d) => !!d.avgDuration).length;

    return {
      ...value,
      avgDuration: value.avgDuration / howManyDuration,
      avgOverhead: value.avgOverhead / howManyOverhead,
    };
  };

  useEffect(() => {
    Services.teams().then((teams) => setState({ ...state, teams }));
  }, []);

  return (
    <TeamBackOffice
      tab="Apis"
      title={`${props.currentTeam.name} - ${translateMethod('Plan consumption')}`}>
      <div>
        <div className="row">
          <div className="col">
            <h1>Api Consumption</h1>
            <PlanInformations fetchData={() => getPlanInformation()} />
          </div>
          <p className="col">
            <Link
              to={`/${props.currentTeam._humanReadableId}/settings/consumptions/apis/${props.match.params.apiId}/${props.match.params.versionId}`}
              className="btn my-2 btn-access-negative">
              <i className="fas fa-angle-left" /> Back to plans
            </Link>
          </p>
        </div>
        <OtoroshiStatsVizualization
          sync={() => Services.syncApiConsumption(props.match.params.apiId, props.currentTeam._id)}
          fetchData={(from, to) =>
            Services.apiConsumption(
              props.match.params.apiId,
              props.match.params.planId,
              props.currentTeam._id,
              from.valueOf(),
              to.valueOf()
            )
          }
          mappers={mappers}
        />
      </div>
    </TeamBackOffice>
  );
}

const mapStateToProps = (state) => ({
  ...state.context,
});

export const TeamPlanConsumption = connect(mapStateToProps)(TeamPlanConsumptionComponent);

function PlanInformations(props) {
  const [loading, setLoading] = useState(true);
  const [informations, setInformations] = useState();

  useEffect(() => {
    props.fetchData().then((informations) => {
      setInformations(informations);
      setLoading(false);
    });
  }, []);

  if (loading) return <Spinner width="50" height="50" />;

  if (!informations) {
    return null;
  }

  return (
    <h3>
      {informations.api.name} - {informations.plan.customName || informations.plan.type}
    </h3>
  );
}
