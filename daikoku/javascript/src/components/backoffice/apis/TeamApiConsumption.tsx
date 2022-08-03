import React, { useContext, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import moment from 'moment';
import { useParams, useNavigate } from 'react-router-dom';
import classNames from 'classnames';
import find from 'lodash/find';

import * as Services from '../../../services';

import { OtoroshiStatsVizualization } from '../..';
import { currencies } from '../../../services/currencies';
import { GlobalDataConsumption, Can, read, stat, formatPlanType } from '../../utils';
import { I18nContext } from '../../../core';

const Currency = ({
  plan
}: any) => {
  const cur = find(currencies, (c) => c.code === plan.currency.code);
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <span>
      {' '}
      {/* @ts-expect-error TS(2532): Object is possibly 'undefined'. */}
      {cur.name}({cur.symbol})
    </span>
  );
};

const sumGlobalInformations = (data: any) => data
  .map((d: any) => d.globalInformations)
  .reduce((acc: any, item: any) => {
    Object.keys(item).forEach((key) => (acc[key] = (acc[key] || 0) + item[key]));
    return acc;
  }, {});

export const TeamApiConsumption = ({
  api,
  apiGroup
}: any) => {
  const [teams, setTeams] = useState([]);
  const [state, setState] = useState({
    consumptions: null,
    period: {
      from: moment().startOf('day'),
      to: moment().add(1, 'day').startOf('day'),
    },
    viewByPlan: true,
  });

  const { currentTeam } = useSelector((state) => (state as any).context);

  const navigate = useNavigate();
  const params = useParams();

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);

  const mappers = [
    {
      type: 'LineChart',
      label: (data: any) => {
        const totalHits = data.reduce((acc: any, cons: any) => acc + cons.hits, 0);
        return translateMethod('data.in.plus.hits', false, `Data In (${totalHits})`, totalHits);
      },
      title: translateMethod('Data In'),
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
      label: translateMethod('Hits by apikey'),
      title: translateMethod('Hits by apikey'),
      formatter: (data: any) => data.reduce((acc: any, item: any) => {
        const value = acc.find((a: any) => a.clientId === item.clientId) || { count: 0 };

        const team = teams.find((t) => (t as any)._id === item.team);
        const plan = api.possibleUsagePlans.find((p: any) => p._id == item.plan);

        // @ts-expect-error TS(2532): Object is possibly 'undefined'.
        const name = `${team.name}/${plan.customName || plan.type}`;

        return [
          ...acc.filter((a: any) => a.name !== item.clientId),
          { clientId: item.clientId, name, count: value.count + item.hits },
        ];
      }, []),
      dataKey: 'count',
    },
    {
      type: 'Global',
      label: translateMethod('Global informations'),
      formatter: (data: any) => sumGlobalInformations(data),
    },
    {
      label: translateMethod('Plans', true),
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      formatter: (data: any) => <div className="row">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {api.possibleUsagePlans.map((plan: any) => <div key={plan._id} className="col-sm-4 col-lg-3">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <PlanLightConsumption
            api={api}
            team={currentTeam}
            key={plan._id}
            plan={plan}
            data={sumGlobalInformations(data.filter((d: any) => d.plan === plan._id))}
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
    Services.teams().then(setTeams);

    document.title = `${currentTeam.name} - ${translateMethod('API consumption')}`;
  }, []);

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Can I={read} a={stat} team={currentTeam} dispatchError={true}>
      {!!api && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <div className="d-flex col flex-column pricing-content">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="row">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="col section p-2">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <OtoroshiStatsVizualization
                sync={() => Services.syncApiConsumption(api._id, currentTeam._id)}
                fetchData={(from: any, to: any) =>
                  Services.apiGlobalConsumption(
                    api._id,
                    currentTeam._id,
                    from.valueOf(),
                    to.valueOf()
                  )
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

const PlanLightConsumption = (props: any) => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  const renderFreeWithoutQuotas = () => <span>You'll pay nothing and do whatever you want :)</span>;

  const renderFreeWithQuotas = () => (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <span>
      You'll pay nothing but you'll have {props.plan.maxPerMonth} authorized requests per month
    </span>
  );

  const renderQuotasWithLimits = () => (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <span>
      You'll pay {props.plan.costPerMonth}
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Currency plan={props.plan} /> and you'll have {props.plan.maxPerMonth} authorized requests
      per month
    </span>
  );

  const renderQuotasWithoutLimits = () => (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <span>
      You'll pay {props.plan.costPerMonth}
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Currency plan={props.plan} /> for {props.plan.maxPerMonth} authorized requests per month and
      you'll be charged {props.plan.costPerAdditionalRequest}
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <Currency plan={props.plan} /> per additional request
    </span>
  );

  const renderPayPerUse = () => {
    if (props.plan.costPerMonth === 0.0) {
      return (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <span>
          You'll pay {props.plan.costPerMonth}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Currency plan={props.plan} /> per month and you'll be charged {props.plan.costPerRequest}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Currency plan={props.plan} /> per request
        </span>
      );
    } else {
      return (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <span>
          You'll be charged {props.plan.costPerRequest}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Currency plan={props.plan} /> per request
        </span>
      );
    }
  };

  const plan = props.plan;
  const type = plan.type;
  const customName = plan.customName;
  const customDescription = plan.customDescription;
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div
      className={classNames('card mb-3 shadow-sm consumptions-plan')}
      onClick={props.handleClick}
    >
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="card-img-top card-data" data-holder-rendered="true">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <GlobalDataConsumption data={props.data} />
      </div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="card-body">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {customName && <h3>{customName}</h3>}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {!customName && <h3>{formatPlanType(plan, translateMethod)}</h3>}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <p className="card-text text-justify">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {customDescription && <span>{customDescription}</span>}
          {!customDescription && type === 'FreeWithoutQuotas' && renderFreeWithoutQuotas()}
          {!customDescription && type === 'FreeWithQuotas' && renderFreeWithQuotas()}
          {!customDescription && type === 'QuotasWithLimits' && renderQuotasWithLimits()}
          {!customDescription && type === 'QuotasWithoutLimits' && renderQuotasWithoutLimits()}
          {!customDescription && type === 'PayPerUse' && renderPayPerUse()}
        </p>
      </div>
    </div>
  );
};
