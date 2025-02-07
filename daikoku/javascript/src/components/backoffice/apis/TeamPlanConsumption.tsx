import { getApolloContext } from "@apollo/client";
import { useQuery } from '@tanstack/react-query';
import moment from 'moment';
import { Moment } from "moment/moment";
import { useContext, useEffect } from 'react';
import { useMatch } from 'react-router-dom';

import { I18nContext, useTeamBackOffice } from '../../../contexts';
import * as Services from '../../../services';
import { IApi, ITeamSimple, isError } from '../../../types';
import { OtoroshiStatsVizualization, Spinner } from '../../utils';

type IGlobalInformations = {
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
    : '/:teamId/settings/apis/:apiId/:version/stats/plan/:planId';
  const match = useMatch(urlMatching);

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

    const value = globalInformations.reduce((acc: any, item: any) => {
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
    document.title = `${props.currentTeam.name} - ${translate('Plan consumption')}`;
  }, [props.currentTeam]);

  return (
    <div>
      <div className="row">
        <div className="col">
          <h1>Api Consumption</h1>
          <PlanInformations
            api={props.api}
            version={match?.params.version!}
            planId={match?.params.planId!}
            currentTeam={props.currentTeam} />
        </div>
      </div>
      <OtoroshiStatsVizualization
        sync={() => Services.syncApiConsumption(match?.params.apiId, props.currentTeam._id)}
        fetchData={(from: Moment, to: Moment) =>
          client!.query<{ apiConsumptions: Array<IgqlConsumption> }>({
            query: Services.graphql.getApiConsumptions,
            fetchPolicy: "no-cache",
            variables: {
              apiId: match?.params.apiId,
              teamId: props.currentTeam._id,
              from: from.valueOf(),
              to: to.from.valueOf(),
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
  const planRequest = useQuery({ queryKey: ['plan'], queryFn: () => Services.planOfApi(props.currentTeam._id, props.api._id, props.version, props.planId) })

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
