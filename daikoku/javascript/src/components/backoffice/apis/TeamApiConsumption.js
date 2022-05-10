import React, { useContext, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import moment from 'moment';
import { useParams, useNavigate } from 'react-router-dom';
import classNames from 'classnames';
import _ from 'lodash';

import * as Services from '../../../services';

import { OtoroshiStatsVizualization } from '../..';
import { currencies } from '../../../services/currencies';
import { GlobalDataConsumption, Can, read, stat, formatPlanType } from '../../utils';
import { I18nContext } from '../../../core';

const Currency = ({ plan }) => {
  const cur = _.find(currencies, (c) => c.code === plan.currency.code);
  return (
    <span>
      {' '}
      {cur.name}({cur.symbol})
    </span>
  );
};

const sumGlobalInformations = (data) =>
  data
    .map((d) => d.globalInformations)
    .reduce((acc, item) => {
      Object.keys(item).forEach((key) => (acc[key] = (acc[key] || 0) + item[key]));
      return acc;
    }, {});

export const TeamApiConsumption = ({ api, apiGroup }) => {
  const [teams, setTeams] = useState([]);
  const [state, setState] = useState({
    consumptions: null,
    period: {
      from: moment().startOf('day'),
      to: moment().add(1, 'day').startOf('day'),
    },
    viewByPlan: true,
  });

  const {currentTeam} = useSelector(state => state.context);

  const navigate = useNavigate();
  const params = useParams();

  const { translateMethod, Translation } = useContext(I18nContext);

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
          const value = acc.find((a) => a.clientId === item.clientId) || { count: 0 };

          const team = teams.find((t) => t._id === item.team);
          const plan = api.possibleUsagePlans.find((p) => p._id == item.plan);

          const name = `${team.name}/${plan.customName || plan.type}`;

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
    {
      label: translateMethod('Plans', true),
      formatter: (data) => (
        <div className="row">
          {api.possibleUsagePlans.map((plan) => (
            <div key={plan._id} className="col-sm-4 col-lg-3">
              <PlanLightConsumption
                api={api}
                team={currentTeam}
                key={plan._id}
                plan={plan}
                data={sumGlobalInformations(data.filter((d) => d.plan === plan._id))}
                period={state.period}
                handleClick={() =>
                  !!apiGroup ?
                  navigate(`/${currentTeam._humanReadableId}/settings/apigroups/${api._humanReadableId}/stats/plan/${plan._id}`) :
                  navigate(`/${currentTeam._humanReadableId}/settings/apis/${api._humanReadableId}/${api.currentVersion}/stats/plan/${plan._id}`)
                }
              />
            </div>
          ))}
        </div>
      ),
    },
  ];

  useEffect(() => {
    Services.teams()
      .then(setTeams);

    document.title = `${currentTeam.name} - ${translateMethod('API consumption')}`;
  }, []);

  return (
    <Can I={read} a={stat} team={currentTeam} dispatchError={true}>
      {!!api && (
        <div className="d-flex col flex-column pricing-content">
          <div className="row">
            <div className="col section p-2">
              <OtoroshiStatsVizualization
                sync={() => Services.syncApiConsumption(api._id, currentTeam._id)}
                fetchData={(from, to) =>
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
}

const PlanLightConsumption = (props) => {
  const { translateMethod } = useContext(I18nContext);

  const renderFreeWithoutQuotas = () => <span>You'll pay nothing and do whatever you want :)</span>;

  const renderFreeWithQuotas = () => (
    <span>
      You'll pay nothing but you'll have {props.plan.maxPerMonth} authorized requests per month
    </span>
  );

  const renderQuotasWithLimits = () => (
    <span>
      You'll pay {props.plan.costPerMonth}
      <Currency plan={props.plan} /> and you'll have {props.plan.maxPerMonth} authorized requests
      per month
    </span>
  );

  const renderQuotasWithoutLimits = () => (
    <span>
      You'll pay {props.plan.costPerMonth}
      <Currency plan={props.plan} /> for {props.plan.maxPerMonth} authorized requests per month and
      you'll be charged {props.plan.costPerAdditionalRequest}
      <Currency plan={props.plan} /> per additional request
    </span>
  );

  const renderPayPerUse = () => {
    if (props.plan.costPerMonth === 0.0) {
      return (
        <span>
          You'll pay {props.plan.costPerMonth}
          <Currency plan={props.plan} /> per month and you'll be charged {props.plan.costPerRequest}
          <Currency plan={props.plan} /> per request
        </span>
      );
    } else {
      return (
        <span>
          You'll be charged {props.plan.costPerRequest}
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
    <div
      className={classNames('card mb-3 shadow-sm consumptions-plan')}
      onClick={props.handleClick}
    >
      <div className="card-img-top card-data" data-holder-rendered="true">
        <GlobalDataConsumption data={props.data} />
      </div>
      <div className="card-body">
        {customName && <h3>{customName}</h3>}
        {!customName && <h3>{formatPlanType(plan, translateMethod)}</h3>}
        <p className="card-text text-justify">
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
}
