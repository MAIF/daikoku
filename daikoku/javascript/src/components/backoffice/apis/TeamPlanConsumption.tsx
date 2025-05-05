import { getApolloContext } from "@apollo/client";
import { useQuery } from '@tanstack/react-query';
import { useContext, useEffect } from 'react';
import { useMatch } from 'react-router-dom';

import { I18nContext, useTeamBackOffice } from '../../../contexts';
import * as Services from '../../../services';
import { IApi, IGlobalInformations, ITeamSimple, isError } from '../../../types';
import { formatDate, OtoroshiStatsVizualization, Spinner } from '../../utils';
import { IgqlConsumption } from "./TeamApiConsumption";

type TeamPlanConsumptionProps = {
  apiGroup?: boolean,
  currentTeam: ITeamSimple,
  api: IApi
}
export const TeamPlanConsumption = (props: TeamPlanConsumptionProps) => {
  const { translate } = useContext(I18nContext);
  const { client } = useContext(getApolloContext());

  const urlMatching = !!props.apiGroup
    ? '/:teamId/settings/apigroups/:apiId/stats/plan/:planId'
    : '/:teamId/:apiId/:version/consumption/plan/:planId';
  const match = useMatch(urlMatching);

  const mappers = [
    {
      type: 'LineChart',
      label: (data: Array<IgqlConsumption>) => {
        const totalHits = data.reduce((acc: number, cons: IgqlConsumption) => acc + cons.globalInformations.hits, 0).toString();
        return translate({ key: 'data.in.plus.hits', replacements: [totalHits] });
      },
      title: translate('Data In'),
      formatter: (data: Array<IgqlConsumption>) => data.reduce<Array<{date: string, count: number}>>((acc, item: IgqlConsumption) => {
        const date = formatDate(item.to, translate('date.locale'), 'DD MMM.');
        const value = acc.find((a) => a.date === date) || { count: 0 };
        return [...acc.filter((a) => a.date !== date), { date, count: value.count + item.globalInformations.hits }];
      }, []),
      xAxis: 'date',
      yAxis: 'count',
    },
    {
      type: 'RoundChart',
      label: translate('Hits by apikey'),
      title: translate('Hits by apikey'),
      formatter: (data: Array<IgqlConsumption>) => data.reduce((acc: Array<{ clientId: string, name: string, count: number }>, item: IgqlConsumption) => {
        const value = acc.find((a) => a.name === item.clientId) || { count: 0 };


        return [
          ...acc.filter((a) => a.name !== item.clientId),
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

  const sumGlobalInformations = (data: Array<IgqlConsumption>) => {
    const globalInformations = data.map((d) => d.globalInformations);

    const value = globalInformations.reduce<IGlobalInformations>((acc, item: IGlobalInformations) => {
      Object.keys(item).forEach((key) => (acc[key] = (acc[key] ?? 0) + item[key]));
      return acc;
    }, {
      avgDuration: 0,
      avgOverhead: 0,
      dataIn: 0,
      dataOut: 0,
      hits: 0
    });

    const howManyDuration = globalInformations.filter((d) => !!d.avgDuration).length;
    const howManyOverhead = globalInformations.filter((d) => !!d.avgDuration).length;

    return {
      ...value,
      avgDuration: (value.avgDuration ?? 0) / howManyDuration,
      avgOverhead: (value.avgOverhead ?? 0) / howManyOverhead,
    };
  };

  useEffect(() => {
    document.title = `${props.currentTeam.name} - ${translate('Plan consumption')}`;
  }, [props.currentTeam]);

  return (
    <div>
      <div className="row">
        <div className="col">
          <PlanInformations
            api={props.api}
            version={match?.params.version!}
            planId={match?.params.planId!}
            currentTeam={props.currentTeam} />
        </div>
      </div>
      <OtoroshiStatsVizualization
        sync={() => Services.syncApiConsumption(match?.params.apiId, props.currentTeam._id)}
        fetchData={(from: Date, to: Date) =>
          client!.query<{ apiConsumptions: Array<IgqlConsumption> }>({
            query: Services.graphql.getApiConsumptions,
            fetchPolicy: "no-cache",
            variables: {
              apiId: match?.params.apiId,
              teamId: props.currentTeam._id,
              from: from.valueOf(),
              to: to.valueOf(),
              planId: match?.params.planId
            }
          }).then(({ data: { apiConsumptions } }) => {
            return apiConsumptions
          })
        }
        mappers={mappers}
      />
    </div>
  );
};

type PlanInformationsProps = {
  api: IApi
  version: string
  planId: string
  currentTeam: ITeamSimple
}

const PlanInformations = (props: PlanInformationsProps) => {
  const planRequest = useQuery({ 
    queryKey: ['plan'], 
    queryFn: () => Services.planOfApi(props.currentTeam._id, props.api._id, props.version, props.planId) })

  if (planRequest.isLoading) {
    return <Spinner width="50" height="50" />;
  } else if (planRequest.data && !isError(planRequest.data)) {
    const plan = planRequest.data

    return (<h3>
      {props.api.name} - {plan.customName}
    </h3>);
  } else {
    return <div>Error while fetching usage plan</div>
  }


};
