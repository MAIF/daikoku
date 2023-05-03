import React, { useContext, useEffect, useState } from 'react';
import { Link, useMatch } from 'react-router-dom';
import moment from 'moment';
import { useSelector } from 'react-redux';

import * as Services from '../../../services';
import { OtoroshiStatsVizualization, Spinner } from '../../utils';
import { I18nContext } from '../../../core';
import { isError, ITeamSimple } from '../../../types';
import {Moment} from "moment/moment";
import {getApolloContext} from "@apollo/client";

type IGlobalInformations= {
  avgDuration?: number,
  avgOverhead?: number,
  dataIn: number,
  dataOut: number,
  hits: number
}
type IgqlConsumption = {
  globalInformations: IGlobalInformations,
  api: {
    _id: string
  }
  clientId: string

  billing: {
    hits: number,
    total: number
  }
  from: Moment
  plan: {
    _id: string
    customName: string
    type: string
  }

  team: {
    name: string
  }
  tenant: {
    _id: string
  }
  to: Moment
  _id: string


}
export const TeamPlanConsumption = ({
  apiGroup
}: any) => {
  const { currentTeam } = useSelector((state) => (state as any).context);

  const { translate } = useContext(I18nContext);

  const { client } = useContext(getApolloContext());

  const urlMatching = !!apiGroup
    ? '/:teamId/settings/apigroups/:apiId/stats/plan/:planId'
    : '/:teamId/settings/apis/:apiId/:version/stats/plan/:planId';
  const match = useMatch(urlMatching);

  const [teams, setTeams] = useState<Array<ITeamSimple>>([]);

  const mappers = [
    {
      type: 'LineChart',
      label: (data: Array<IgqlConsumption>) => {
        const totalHits = data.reduce((acc: number, cons: IgqlConsumption) => acc + cons.globalInformations.hits, 0).toString();
        return translate({ key: 'data.in.plus.hits', replacements: [totalHits] });
      },
      title: translate('Data In'),
      formatter: (data: Array<IgqlConsumption>) => data.reduce((acc: any, item: IgqlConsumption) => {
        const date = moment(item.to).format('DD MMM.');
        const value = acc.find((a: any) => a.date === date) || { count: 0 };
        return [...acc.filter((a: any) => a.date !== date), { date, count: value.count + item.globalInformations.hits }];
      }, []),
      xAxis: 'date',
      yAxis: 'count',
    },
    {
      type: 'RoundChart',
      label: translate('Hits by apikey'),
      title: translate('Hits by apikey'),
      formatter: (data: Array<IgqlConsumption>) => data.reduce((acc: Array<{clientId: string, name: string, count: number}> , item: IgqlConsumption) => {
        const value = acc.find((a: any) => a.name === item.clientId) || { count: 0 };


        return [
          ...acc.filter((a: any) => a.name !== item.clientId),
          { clientId: item.clientId, name: item.team.name, count: value.count + item.globalInformations.hits },
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
        if (isError(api)) {
          return null;
        }
        return {
          api,
          plan: api.possibleUsagePlans.find((pp) => pp._id === match?.params.planId),
        };
      }
    );
  };

  const sumGlobalInformations = (data: Array<IgqlConsumption>) => {
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
        fetchData={(from: Moment , to: Moment ) =>
          client!.query<{ apiConsumptions: Array<IgqlConsumption>}>({
            query: Services.graphql.getApiConsumptions,
            fetchPolicy: "no-cache",
            variables: {
              apiId: match?.params.apiId,
              teamId: currentTeam._id,
              from: from.valueOf(),
              to: to.from.valueOf(),
              planId: match?.params.planId
            }
          }).then(({data: {apiConsumptions}}) => {
            return apiConsumptions
          })
        }
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
