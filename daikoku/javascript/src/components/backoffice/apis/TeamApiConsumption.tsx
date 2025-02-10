import { getApolloContext } from "@apollo/client";
import classNames from 'classnames';
import moment, { Moment } from 'moment';
import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { I18nContext } from '../../../contexts';
import * as Services from '../../../services';
import { IApi, IGlobalInformations, isError, ITeamSimple, IUsagePlan } from '../../../types';
import { Can, GlobalDataConsumption, OtoroshiStatsVizualization, Spinner, formatPlanType, read, renderPlanInfo, stat } from '../../utils';
import { useQuery } from "@tanstack/react-query";


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
const sumGlobalInformations = (data: Array<IgqlConsumption>) => data
  .map((d) => d.globalInformations)
  .reduce((acc: any, item) => {
    Object.keys(item).forEach((key) => (acc[key] = (acc[key] || 0) + item[key]));
    return acc;
  }, {});

type TeamApiConsumptionProps = {
  api: IApi,
  apiGroup?: boolean,
  currentTeam: ITeamSimple
}
export const TeamApiConsumption = ({
  api,
  apiGroup,
  currentTeam
}: TeamApiConsumptionProps) => {
  const [state] = useState({
    consumptions: null,
    period: {
      from: moment().startOf('day'),
      to: moment().add(1, 'day').startOf('day'),
    },
  });
  const { client } = useContext(getApolloContext());

  const navigate = useNavigate();

  const { translate } = useContext(I18nContext);

  const usagePlansQuery = useQuery({
    queryKey: ['plans', api.currentVersion],
    queryFn: () =>
      Services.getVisiblePlans(api._id, api.currentVersion),
  });

  const mappers = (plans: IUsagePlan[]) => [
    {
      type: 'LineChart',
      label: (data: Array<IgqlConsumption>) => {
        const totalHits: string = data.reduce((acc: number, cons: IgqlConsumption) => acc + cons.globalInformations.hits, 0).toString();
        return translate({ key: 'data.in.plus.hits', replacements: [totalHits] });
      },
      title: translate('Data In'),
      formatter: (data: Array<IgqlConsumption>) => data.reduce((acc: Array<{ date: string, count: number }>, item: IgqlConsumption) => {
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
        const value = acc.find((a: any) => a.clientId === item.clientId) || { count: 0 };
        const name = `${item.team.name}/${item.plan.customName || item.plan.type}`;
        return [
          ...acc.filter((a: any) => a.name !== item.clientId),
          { clientId: item.clientId, name, count: value.count + item.globalInformations.hits },
        ];
      }, []),
      dataKey: 'count',
    },
    {
      type: 'Global',
      label: translate('Global informations'),
      formatter: (data: Array<IgqlConsumption>) => sumGlobalInformations(data),
    },
    {
      label: translate({ key: 'Plan', plural: true }),
      formatter: (data: Array<IgqlConsumption>) => <div className="row">
        {plans.map((plan: IUsagePlan) => <div key={plan._id} className="col-sm-4 col-lg-3">
          <PlanLightConsumption
            api={api}
            team={currentTeam}
            key={plan._id}
            plan={plan}
            data={sumGlobalInformations(data.filter((d: IgqlConsumption) => d.plan._id === plan._id))}
            period={state.period}
            handleClick={() =>
              !!apiGroup
                ? navigate(
                  `/${currentTeam._humanReadableId}/settings/apigroups/${api._humanReadableId}/stats/plan/${plan._id}`
                )
                : navigate(
                  `/${currentTeam._humanReadableId}/${api._humanReadableId}/${api.currentVersion}/consumption/plan/${plan._id}`
                )
            }
          />
        </div>)}
      </div>,
    },
  ];

  useEffect(() => {
    document.title = `${currentTeam.name} - ${translate('API consumption')}`;
  }, []);

  if (usagePlansQuery.isLoading) {
    return (<Spinner />)
  } else if (usagePlansQuery.data && !isError(usagePlansQuery.data)) {
    return (
      <Can I={read} a={stat} team={currentTeam} dispatchError={true}>
        {!!api && (
          <div className="d-flex col flex-column pricing-content">
            <div className="row">
              <div className="col section p-2">
                <OtoroshiStatsVizualization
                  sync={() => Services.syncApiConsumption(api._id, currentTeam._id)}
                  fetchData={(from: Moment, to: Moment) =>
                    client!.query<{ apiConsumptions: Array<IgqlConsumption> }>({
                      query: Services.graphql.getApiConsumptions,
                      fetchPolicy: "no-cache",
                      variables: {
                        apiId: api._id,
                        teamId: currentTeam._id,
                        from: from.valueOf(),
                        to: to.from.valueOf()
                      }
                    }).then(({ data: { apiConsumptions } }) => {
                      return apiConsumptions
                    })
                  }
                  mappers={mappers(usagePlansQuery.data as IUsagePlan[])}
                />
              </div>
            </div>
          </div>
        )}
      </Can>
    );
  }

};
type PlanLightConsumptionType = {
  api: IApi,
  team: ITeamSimple
  key: string
  plan: IUsagePlan,
  data: any
  period: {
    from: Moment
    to: Moment
  }
  handleClick: () => void
}
const PlanLightConsumption = (props: PlanLightConsumptionType) => {

  const { translate } = useContext(I18nContext);

  return (
    <div
      className={classNames('card mb-3 shadow-sm')}
    >
      <div className="card-img-top card-header" data-holder-rendered="true">
        <h3>{props.plan.customName}</h3>
      </div>
      <div className="card-body">
        <GlobalDataConsumption data={props.data} />
        <div className="mt-2 d-flex flex-row justify-content-center">
          <button
            aria-label={translate({ key: 'api.consumption.plan.btn.aria.label', replacements: [props.plan.customName] })}
            className="btn btn-outline-primary mx-auto"
            onClick={props.handleClick}>{translate("api.consumption.plan.btn.label")}</button>
        </div>
      </div>
    </div>
  );
};
