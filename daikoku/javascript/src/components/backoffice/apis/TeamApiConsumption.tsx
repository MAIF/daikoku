import React, { useContext, useEffect, useState } from 'react';
import { useSelector} from 'react-redux';
import moment, {Moment} from 'moment';
import { useNavigate } from 'react-router-dom';
import classNames from 'classnames';

import * as Services from '../../../services';
import {OtoroshiStatsVizualization, renderPlanInfo} from '../../utils';
import { GlobalDataConsumption, Can, read, stat, formatPlanType } from '../../utils';
import { I18nContext } from '../../../core';
import {IApi, ITeamSimple, IUsagePlan} from '../../../types';
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
const sumGlobalInformations = (data: Array<IgqlConsumption>) => data
  .map((d: IgqlConsumption) => d.globalInformations)
  .reduce((acc: any, item: IGlobalInformations) => {
    Object.keys(item).forEach((key) => (acc[key] = (acc[key] || 0) + item[key]));
    return acc;
  }, {});

export const TeamApiConsumption = ({
  api,
  apiGroup
}: any) => {
  const [state, setState] = useState({
    consumptions: null,
    period: {
      from: moment().startOf('day'),
      to: moment().add(1, 'day').startOf('day'),
    },
  });
  const { client } = useContext(getApolloContext());

  const { currentTeam } = useSelector((state) => (state as any).context);
  const navigate = useNavigate();

  const { translate } = useContext(I18nContext);

  const mappers = [
    {
      type: 'LineChart',
      label: (data: Array<IgqlConsumption>) => {
        const totalHits: string = data.reduce((acc: number, cons: IgqlConsumption) => acc + cons.globalInformations.hits, 0).toString();
        return translate({ key: 'data.in.plus.hits', replacements: [totalHits] });
      },
      title: translate('Data In'),
      formatter: (data: Array<IgqlConsumption>) => data.reduce((acc:Array<{date: string, count: number}>, item: IgqlConsumption) => {
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
      formatter: (data: Array<IgqlConsumption>) => data.reduce((acc: Array<{clientId: string, name: string, count: number}>, item: IgqlConsumption) => {
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
        {api.possibleUsagePlans.map((plan: any) => <div key={plan._id} className="col-sm-4 col-lg-3">
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
                  `/${currentTeam._humanReadableId}/settings/apis/${api._humanReadableId}/${api.currentVersion}/stats/plan/${plan._id}`
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

  return (
    <Can I={read} a={stat} team={currentTeam} dispatchError={true}>
      {!!api && (
        <div className="d-flex col flex-column pricing-content">
          <div className="row">
            <div className="col section p-2">
              <OtoroshiStatsVizualization
                sync={() => Services.syncApiConsumption(api._id, currentTeam._id)}
                fetchData={(from: Moment , to: Moment ) =>
                  client!.query<{ apiConsumptions: Array<IgqlConsumption>}>({
                  query: Services.graphql.getApiConsumptions,
                  fetchPolicy: "no-cache",
                  variables: {
                    apiId: api._id,
                    teamId: currentTeam._id,
                    from: from.valueOf(),
                    to: to.from.valueOf()
                  }
                }).then(({data: {apiConsumptions}}) => {
                  return apiConsumptions
                })
                }
                mappers={mappers}
              />
            </div>
          </div>
        </div>
      )}
    </Can>
  );
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


  const plan = props.plan;
  const customName = plan.customName;
  const customDescription = plan.customDescription;
  return (
    <div
      className={classNames('card mb-3 shadow-sm consumptions-plan')}
      onClick={props.handleClick}
    >
      <div className="card-img-top card-data" data-holder-rendered="true">
        <GlobalDataConsumption data={props.data} />
      </div>
      <div className="card-body">
        {customName && <h3>{customName}</h3>}
        {!customName && <h3>{formatPlanType(plan, translate)}</h3>}
        <p className="card-text text-justify">
          {customDescription && <span>{customDescription}</span>}
          {!customDescription && renderPlanInfo(plan)}
        </p>
      </div>
    </div>
  );
};
