import React, { useContext, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { getApolloContext } from '@apollo/client';
import maxBy from 'lodash/maxBy';

import * as Services from '../../../services';
import { MonthPicker } from '../../inputs/monthPicker';
import { ApiTotal, NoData, PriceCartridge, TheadBillingContainer } from './components';
import { formatCurrency, formatPlanType, Spinner, Can, read, api } from '../../utils';
import { I18nContext } from '../../../core';
import { useTeamBackOffice } from '../../../contexts';
import dayjs from 'dayjs';

export const TeamIncome = () => {
  const { currentTeam } = useSelector((state) => (state as any).context);
  useTeamBackOffice(currentTeam);

  const { translate, Translation } = useContext(I18nContext);

  const [state, setState] = useState<any>({
    consumptions: [],
    consumptionsByApi: [],
    selectedApi: undefined,
    selectedPlan: undefined,
    teams: [],
    loading: false,
    apis: [],
  });

  const [date, setDate] = useState(dayjs())

  useEffect(() => {
    getBillingData(date);
    document.title = `${currentTeam.name} - ${translate('Income')}`;
  }, []);

  const { client } = useContext(getApolloContext());

  const getBillingData = (date: dayjs.Dayjs) => {
    if (!client) {
      return;
    }
    setState({ ...state, loading: true });
    Promise.all([
      Services.getTeamIncome(
        currentTeam._id,
        date.startOf('month').valueOf(),
        date.endOf('month').valueOf()
      ),
      client.query({
        query: Services.graphql.myVisibleApis,
        variables: { teamId: currentTeam._id },
      }),
      Services.teams(),
    ]).then(
      ([
        consumptions,
        {
          data: { visibleApis: { apis } },
        },
        teams,
      ]) => {
        const consumptionsByApi = getConsumptionsByApi(consumptions);
        setState({
          ...state,
          consumptions,
          consumptionsByApi,
          apis: apis.map(({
            api
          }: any) => api),
          teams,
          loading: false,
        });
      }
    );
  };

  const getConsumptionsByApi = (consumptions: any) => consumptions.reduce((acc: any, consumption: any) => {
    const api = acc.find((item: any) => item.api === consumption.api);
    const { hits, total } = api ? api.billing : { hits: 0, total: 0 };
    const billing = {
      hits: hits + consumption.billing.hits,
      total: total + consumption.billing.total,
    };
    const obj = { billing, api: consumption.api };

    return [...acc.filter((item: any) => item.api !== consumption.api), obj];
  }, []);

  const sync = () => {
    setState({ ...state, loading: true });
    Services.syncTeamIncome(currentTeam._id).then(() => getBillingData(date));
  };

  const total = state.consumptions
    .reduce((acc: number, curr: any) => acc + curr.billing.total, 0);
  const mostRecentConsumption = maxBy(state.consumptions, (c) => (c as any).to);
  const lastDate = mostRecentConsumption && dayjs((mostRecentConsumption as any).to).format('DD/MM/YYYY HH:mm');

  return (<Can I={read} a={api} team={currentTeam} dispatchError={true}>
    <div className="row">
      <div className="col">
        <h1>
          <Translation i18nkey="Team Income">Income</Translation>
        </h1>
        {state.loading && <Spinner />}
        {!state.loading && (<div className="row">
          <div className="col apis">
            <div className="row month__and__total">
              <div className="col-12 month__selector d-flex align-items-center">
                <MonthPicker updateDate={(date: dayjs.Dayjs) => {
                  console.debug({date})
                  setDate(date);
                  getBillingData(date);
                }} value={date} />
                <button className="btn btn-sm btn-access-negative" onClick={sync}>
                  <i className="fas fa-sync-alt" />
                </button>
                {lastDate ? (<i className="ms-1">
                  <Translation i18nkey="date.update" replacements={[lastDate]}>
                    upd. {lastDate}
                  </Translation>
                </i>) : <></>}
              </div>
            </div>
            <div className="row api__billing__card__container section p-2">
              <TheadBillingContainer label={translate('Apis')} total={formatCurrency(total)} />
              {!state.consumptionsByApi.length && <NoData />}
              {state.consumptionsByApi
                .sort((api1: any, api2: any) => api2.billing.total - api1.billing.total)
                .map(({ api, billing }: any) => (<ApiTotal key={api} handleClick={() => setState({
                  ...state,
                  selectedPlan: undefined,
                  selectedApi: state.apis.find((a: any) => a._id === api),
                })} api={state.apis.find((a: any) => a._id === api)} total={billing.total} />))}
              <TheadBillingContainer label={translate('Apis')} total={formatCurrency(total)} />
            </div>
          </div>
          <div className="col apikeys">
            {state.selectedApi && !state.selectedPlan && (<div className="api-plans-consumptions section p-2">
              <div className="api__plans__consumption__header">
                <h3 className="api__name">{state.selectedApi.name}</h3>
                <i className="far fa-times-circle quit" onClick={() => setState({ ...state, selectedApi: undefined })} />
              </div>
              {(state.consumptions
                .filter((c: any) => c.api === state.selectedApi._id)
                .reduce((agg: Array<any>, consumption: any) => {
                  const maybeAggCons = agg.find((c) => c.plan === consumption.plan);
                  if (maybeAggCons) {
                    return [
                      ...agg.filter((x) => x.plan !== consumption.plan),
                      {
                        ...maybeAggCons,
                        billing: {
                          hits: maybeAggCons.billing.hits + consumption.billing.hits,
                          total: maybeAggCons.billing.total + consumption.billing.total,
                        },
                      },
                    ];
                  }
                  else {
                    return [...agg, consumption];
                  }
                }, []) as any).sort((c1: any, c2: any) => c2.billing.total - c1.billing.total)
                .map(({ plan, billing }: any, idx: any) => {
                  const usagePlan = state.selectedApi.possibleUsagePlans.find((pp: any) => pp._id === plan);
                  return (<PriceCartridge key={idx} label={usagePlan.customName || formatPlanType(usagePlan, translate)} total={billing.total} currency={usagePlan.currency} handleClick={() => setState({ ...state, selectedPlan: usagePlan })} />);
                })}
            </div>)}
            {state.selectedPlan && (<div>
              <div className="api__plans__consumption__header">
                <h3 className="api__name">
                  {state.selectedApi.name} -{' '}
                  {(state.selectedPlan as any).customName ||
                    formatPlanType(state.selectedPlan, translate)}
                </h3>
                <i className="far fa-arrow-alt-circle-left quit" onClick={() => setState({ ...state, selectedPlan: undefined })} />
              </div>
              {state.consumptions
                .filter((c: any) => c.api === state.selectedApi._id && c.plan === state.selectedPlan._id)
                .map((c: any, idx: number) => {
                  const team = state.teams.find((t: any) => t._id === c.team);
                  return (<PriceCartridge key={idx} label={team.name} total={c.billing.total} currency={state.selectedPlan.currency} />);
                })}
            </div>)}
          </div>
        </div>)}
      </div>
    </div>
  </Can>);
};
