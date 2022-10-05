import React, { useContext, useEffect, useState } from 'react';
import { Link, useMatch } from 'react-router-dom';
import moment from 'moment';
import { useSelector } from 'react-redux';

import * as Services from '../../../services';
import { OtoroshiStatsVizualization, Spinner } from '../../utils';
import { I18nContext } from '../../../core';
import { ITeamSimple } from '../../../types';

export const TeamPlanConsumption = ({
  apiGroup
}: any) => {
  const { currentTeam } = useSelector((state) => (state as any).context);

  const { translate } = useContext(I18nContext);
  const urlMatching = !!apiGroup
    ? '/:teamId/settings/apigroups/:apiId/stats/plan/:planId'
    : '/:teamId/settings/apis/:apiId/:version/stats/plan/:planId';
  const match = useMatch(urlMatching);

  const [teams, setTeams] = useState<Array<ITeamSimple>>([]);

  const mappers = [
    {
      type: 'LineChart',
      label: (data: any) => {
        const totalHits = data.reduce((acc: any, cons: any) => acc + cons.hits, 0);
        return translate({ key: 'data.in.plus.hits', replacements: [totalHits] });
      },
      title: translate('Data In'),
      formatter: (data: any) => data.reduce((acc: any, item: any) => {
        const date = moment(item.to).format('DD MMM.');
        const value = acc.find((a: any) => a.date === date) || { count: 0 };
        return [...acc.filter((a: any) => a.date !== date), { date, count: value.count + item.hits }];
      }, []),
      xAxis: 'date',
      yAxis: 'count',
    },
    {
      type: 'RoundChart',
      label: translate('Hits by apikey'),
      title: translate('Hits by apikey'),
      formatter: (data: any) => data.reduce((acc: any, item: any) => {
        const value = acc.find((a: any) => a.name === item.clientId) || { count: 0 };

        const team: any = teams.find((t: any) => t._id === item.team);
        const name = team?.name;

        return [
          ...acc.filter((a: any) => a.name !== item.clientId),
          { clientId: item.clientId, name, count: value.count + item.hits },
        ];
      }, []),
      dataKey: 'count',
    },
    {
      type: 'Global',
      label: translate('Global informations'),
      formatter: (data: any) => sumGlobalInformations(data),
    },
  ];

  const getPlanInformation = () => {
    return Services.teamApi(currentTeam._id, match?.params.apiId!, match?.params.version!).then(
      (api) => {
        if (api.error) {
          return null;
        }
        return {
          api,
          plan: api.possibleUsagePlans.find((pp: any) => pp._id === match?.params.planId),
        };
      }
    );
  };

  const sumGlobalInformations = (data: any) => {
    const globalInformations = data.map((d: any) => d.globalInformations);

    const value = globalInformations.reduce((acc: any, item: any) => {
      Object.keys(item).forEach((key) => (acc[key] = (acc[key] || 0) + item[key]));
      return acc;
    }, {});

    const howManyDuration = globalInformations.filter((d: any) => !!d.avgDuration).length;
    const howManyOverhead = globalInformations.filter((d: any) => !!d.avgDuration).length;

    return {
      ...value,
      avgDuration: value.avgDuration / howManyDuration,
      avgOverhead: value.avgOverhead / howManyOverhead,
    };
  };

  useEffect(() => {
    Services.teams().then(setTeams);

    document.title = `${currentTeam.name} - ${translate('Plan consumption')}`;
  }, []);

  return (
    <div>
      <div className="row">
        <div className="col">
          <h1>Api Consumption</h1>
          <PlanInformations fetchData={() => getPlanInformation()} />
        </div>
      </div>
      <OtoroshiStatsVizualization
        sync={() => Services.syncApiConsumption(match?.params.apiId, currentTeam._id)}
        fetchData={(from: any, to: any) => {
          return Services.apiConsumption(
            match?.params.apiId,
            match?.params.planId,
            currentTeam._id,
            from.valueOf(),
            to.valueOf()
          );
        }}
        mappers={mappers}
      />
    </div>
  );
};

const PlanInformations = (props: any) => {
  const [loading, setLoading] = useState(true);
  const [informations, setInformations] = useState();

  useEffect(() => {
    props.fetchData().then((informations: any) => {
      setInformations(informations);
      setLoading(false);
    });
  }, []);

  if (loading) return <Spinner width="50" height="50" />;

  if (!informations) {
    return null;
  }

  return (<h3>
    {(informations as any).api.name} - {(informations as any).plan.customName || (informations as any).plan.type}
  </h3>);
};
