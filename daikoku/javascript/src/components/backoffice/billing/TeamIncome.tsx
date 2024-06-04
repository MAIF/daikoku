import React, { useContext, useEffect, useState } from 'react';
import { getApolloContext } from '@apollo/client';
import maxBy from 'lodash/maxBy';

import * as Services from '../../../services';
import { MonthPicker } from '../../inputs/monthPicker';
import { ApiTotal, NoData, PriceCartridge, TheadBillingContainer } from './components';
import { formatCurrency, formatPlanType, Spinner, Can, read, api } from '../../utils';
import { I18nContext } from '../../../contexts';
import { useTeamBackOffice } from '../../../contexts';
import dayjs from 'dayjs';
import { ITeamSimple, isError } from '../../../types';
import { toast } from 'sonner';


type TeamIncomeGql = {
  api: {
    _id: string
  }
  plan: {
    _id: string
  }
  team: {
    name: string
  }
  billing: {
    hits: number,
    total: number
  }
  to: any
  from: any

}
export const TeamIncome = () => {
  const { isLoading, currentTeam, error } = useTeamBackOffice();
  const { translate, Translation } = useContext(I18nContext);

  const [state, setState] = useState<{
    consumptions: Array<TeamIncomeGql>,
    consumptionsByApi: Array<any>,
    selectedApi: any,
    selectedPlan: any,
    loading: boolean,
    apis: Array<any>,
  }>
    ({
      consumptions: [],
      consumptionsByApi: [],
      selectedApi: undefined,
      selectedPlan: undefined,
      loading: false,
      apis: [],
    });

  const [date, setDate] = useState(dayjs())

  useEffect(() => {
    if (currentTeam && !isError(currentTeam)) {
      getBillingData(date);
      document.title = `${currentTeam.name} - ${translate('Income')}`;
    }
  }, [currentTeam]);

  const { client } = useContext(getApolloContext());

  const getBillingData = (date: dayjs.Dayjs) => {
    if (!client) {
      return;
    }
    setState({ ...state, loading: true });
    Promise.all([
      client!.query<{ teamIncomes: Array<TeamIncomeGql> }>({
        query: Services.graphql.getTeamIncome,
        fetchPolicy: "no-cache",
        variables: {
          teamId: (currentTeam as ITeamSimple)._id,
          from: date.startOf('month').valueOf(),
          to: date.endOf('month').valueOf()
        }
      }).then(({ data: { teamIncomes } }) => {
        return teamIncomes
      }),
      client.query({
        query: Services.graphql.myVisibleApis,
        variables: { teamId: (currentTeam as ITeamSimple)._id },
      }),
    ]).then(
      ([
        consumptions,
        {
          data: { visibleApis: { apis } },
        },
      ]) => {
        const consumptionsByApi = getConsumptionsByApi(consumptions);
        setState({
          ...state,
          consumptions,
          consumptionsByApi,
          apis: apis.map(({
            api
          }: any) => api),
          loading: false,
        });
      }
    );
  };

  const getConsumptionsByApi = (consumptions: Array<TeamIncomeGql>) => consumptions.reduce((acc: any, consumption: TeamIncomeGql) => {
    const api = acc.find((item: any) => item.api._id === consumption.api._id);
    const { hits, total } = api ? api.billing : { hits: 0, total: 0 };
    const billing = {
      hits: hits + consumption.billing.hits,
      total: total + consumption.billing.total,
    };
    const obj = { billing, api: consumption.api };

    return [...acc.filter((item: any) => item.api._id !== consumption.api._id), obj];
  }, []);



  const total = state.consumptions
    .reduce((acc: number, curr: any) => acc + curr.billing.total, 0);
  const mostRecentConsumption = maxBy(state.consumptions, (c) => c.to);
  const lastDate = mostRecentConsumption && dayjs((mostRecentConsumption as any).to).format('DD/MM/YYYY HH:mm');

  if (isLoading) {
    return <Spinner />
  } else if (currentTeam && !isError(currentTeam)) {
    const sync = () => {
      setState({ ...state, loading: true });
      Services.syncTeamIncome(currentTeam._id).then(() => getBillingData(date));
    };


    return (
      <Can I={read} a={api} team={currentTeam} dispatchError={true}>
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
                      setDate(date);
                      getBillingData(date);
                    }} value={date} />
                    <button className="btn btn-sm btn-outline-primary ms-1" onClick={sync}>
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
                    .map(({ api, billing }: any) => (<ApiTotal key={api._id} handleClick={() => setState({
                      ...state,
                      selectedPlan: undefined,
                      selectedApi: state.apis.find((a: any) => a._id === api._id),
                    })} api={state.apis.find((a: any) => a._id === api._id)} total={billing.total} />))}
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
                    .filter((c: TeamIncomeGql) => c.api._id === state.selectedApi._id)
                    .reduce((agg: Array<any>, consumption: TeamIncomeGql) => {
                      const maybeAggCons = agg.find((c) => c.plan._id === consumption.plan._id);
                      if (maybeAggCons) {
                        return [
                          ...agg.filter((x) => x.plan._id !== consumption.plan._id),
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
                      const usagePlan = state.selectedApi.possibleUsagePlans.find((pp: any) => pp._id === plan._id);
                      return (
                        <PriceCartridge
                          key={idx}
                          label={usagePlan.customName || formatPlanType(usagePlan, translate)}
                          total={billing.total}
                          currency={usagePlan.currency}
                          handleClick={() => setState({ ...state, selectedPlan: usagePlan })} />
                      );
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
                    .filter((c: TeamIncomeGql) => c.api._id === state.selectedApi._id && c.plan._id === state.selectedPlan._id)
                    .map((c: any, idx: number) => {
                      return (
                        <PriceCartridge
                          key={idx}
                          label={c.team.name}
                          total={c.billing.total}
                          currency={state.selectedPlan.currency} />
                      );
                    })}
                </div>)}
              </div>
            </div>)}
          </div>
        </div>
      </Can>
    );
  } else {
    toast.error(error?.message || currentTeam?.error)
    return <></>;
  }

};
