import React, { useContext, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { getApolloContext } from '@apollo/client';
import moment from 'moment';
import maxBy from 'lodash/maxBy';

import * as Services from '../../../services';
// @ts-expect-error TS(6142): Module '../../inputs/monthPicker' was resolved to ... Remove this comment to see the full error message
import { MonthPicker } from '../../inputs/monthPicker';
// @ts-expect-error TS(6142): Module './components' was resolved to '/Users/qaub... Remove this comment to see the full error message
import { ApiTotal, NoData, PriceCartridge, TheadBillingContainer } from './components';
import { formatCurrency, formatPlanType, Spinner, Can, read, api } from '../../utils';
import { I18nContext } from '../../../core';
import { useTeamBackOffice } from '../../../contexts';

export const TeamIncome = () => {
  const { currentTeam } = useSelector((state) => (state as any).context);
  useTeamBackOffice(currentTeam);

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);

  const [state, setState] = useState({
    consumptions: [],
    consumptionsByApi: [],
    selectedApi: undefined,
    selectedPlan: undefined,
    teams: [],
    loading: false,
    date: moment(),
    apis: [],
  });

  useEffect(() => {
    getBillingData(currentTeam);

    document.title = `${currentTeam.name} - ${translateMethod('Income')}`;
  }, []);

  const { client } = useContext(getApolloContext());

  const getBillingData = (team: any) => {
    setState({ ...state, loading: true });
    Promise.all([
      Services.getTeamIncome(
        team._id,
        state.date.startOf('month').valueOf(),
        state.date.endOf('month').valueOf()
      ),
      // @ts-expect-error TS(2532): Object is possibly 'undefined'.
      client.query({
        query: Services.graphql.myVisibleApis,
        variables: { teamId: team._id },
      }),
      Services.teams(),
    ]).then(
      ([
        consumptions,
        {
          data: { visibleApis },
        },
        teams,
      ]) => {
        const consumptionsByApi = getConsumptionsByApi(consumptions);
        setState({
          ...state,
          consumptions,
          consumptionsByApi,
          apis: visibleApis.map(({
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
    Services.syncTeamIncome(currentTeam._id).then(() => getBillingData(currentTeam));
  };

  const total = state.consumptions.reduce((acc, curr) => acc + (curr as any).billing.total, 0);
  const mostRecentConsumption = maxBy(state.consumptions, (c) => (c as any).to);
  const lastDate = mostRecentConsumption && moment((mostRecentConsumption as any).to).format('DD/MM/YYYY HH:mm');

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<Can I={read} a={api} team={currentTeam} dispatchError={true}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="row">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="col">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <h1>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="Team Income">Income</Translation>
          </h1>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {state.loading && <Spinner />}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          {!state.loading && (<div className="row">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="col apis">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <div className="row month__and__total">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <div className="col-12 month__selector d-flex align-items-center">
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <MonthPicker updateDate={(date: any) => {
            setState({ ...state, date });
            getBillingData(currentTeam);
        }} value={state.date}/>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <button className="btn btn-sm btn-access-negative" onClick={sync}>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <i className="fas fa-sync-alt"/>
                    </button>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    {lastDate && (<i className="ms-1">
                        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                        <Translation i18nkey="date.update" replacements={[lastDate]}>
                          upd. {lastDate}
                        </Translation>
                      </i>)}
                  </div>
                </div>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <div className="row api__billing__card__container section p-2">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <TheadBillingContainer label={translateMethod('Apis')} total={formatCurrency(total)}/>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  {!state.consumptionsByApi.length && <NoData />}
                  {state.consumptionsByApi
            .sort((api1, api2) => (api2 as any).billing.total - (api1 as any).billing.total)
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            .map(({ api, billing }) => (<ApiTotal key={api} handleClick={() => setState({
                ...state,
                selectedPlan: undefined,
                selectedApi: state.apis.find((a) => (a as any)._id === api),
            })} api={state.apis.find((a) => (a as any)._id === api)} total={(billing as any).total}/>))}
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <TheadBillingContainer label={translateMethod('Apis')} total={formatCurrency(total)}/>
                </div>
              </div>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="col apikeys">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                {state.selectedApi && !state.selectedPlan && (<div className="api-plans-consumptions section p-2">
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <div className="api__plans__consumption__header">
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <h3 className="api__name">{(state.selectedApi as any).name}</h3>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <i className="far fa-times-circle quit" onClick={() => setState({ ...state, selectedApi: undefined })}/>
                    </div>
                    {(state.consumptions
                // @ts-expect-error TS(2532): Object is possibly 'undefined'.
                .filter((c) => (c as any).api === state.selectedApi._id)
                // @ts-expect-error TS(2769): No overload matches this call.
                .reduce((agg, consumption) => {
                // @ts-expect-error TS(2339): Property 'plan' does not exist on type 'never'.
                const maybeAggCons = agg.find((c) => c.plan === consumption.plan);
                if (maybeAggCons) {
                    return [
                        // @ts-expect-error TS(2339): Property 'plan' does not exist on type 'never'.
                        ...agg.filter((x) => x.plan !== consumption.plan),
                        {
                            // @ts-expect-error TS(2698): Spread types may only be created from object types... Remove this comment to see the full error message
                            ...maybeAggCons,
                            billing: {
                                // @ts-expect-error TS(2339): Property 'billing' does not exist on type 'never'.
                                hits: maybeAggCons.billing.hits + consumption.billing.hits,
                                // @ts-expect-error TS(2339): Property 'billing' does not exist on type 'never'.
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
                // @ts-expect-error TS(2532): Object is possibly 'undefined'.
                const usagePlan = state.selectedApi.possibleUsagePlans.find((pp: any) => pp._id === plan);
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                return (<PriceCartridge key={idx} label={usagePlan.customName || formatPlanType(usagePlan, translateMethod)} total={billing.total} currency={usagePlan.currency} handleClick={() => setState({ ...state, selectedPlan: usagePlan })}/>);
            })}
                  </div>)}
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                {state.selectedPlan && (<div>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <div className="api__plans__consumption__header">
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <h3 className="api__name">
                        {/* @ts-expect-error TS(2532): Object is possibly 'undefined'. */}
                        {state.selectedApi.name} -{' '}
                        {(state.selectedPlan as any).customName ||
                formatPlanType(state.selectedPlan, translateMethod)}
                      </h3>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <i className="far fa-arrow-alt-circle-left quit" onClick={() => setState({ ...state, selectedPlan: undefined })}/>
                    </div>
                    {state.consumptions
                // @ts-expect-error TS(2532): Object is possibly 'undefined'.
                .filter((c) => (c as any).api === state.selectedApi._id && (c as any).plan === state.selectedPlan._id)
                .map((c, idx) => {
                // @ts-expect-error TS(2339): Property '_id' does not exist on type 'never'.
                const team = state.teams.find((t) => t._id === c.team);
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                return (<PriceCartridge key={idx} label={team.name} total={c.billing.total} currency={state.selectedPlan.currency}/>);
            })}
                  </div>)}
              </div>
            </div>)}
        </div>
      </div>
    </Can>);
                        // @ts-expect-error TS(2304): Cannot find name 'agg'.
                        const maybeAggCons = agg.find((c) => (c as any).plan === (consumption as any).plan);
                        if (maybeAggCons) {
                          return [
    // @ts-expect-error TS(2304): Cannot find name 'agg'.
    ...agg.filter((x) => (x as any).plan !== (consumption as any).plan),
    {
        ...maybeAggCons,
        billing: {
            // @ts-expect-error TS(2304): Cannot find name 'consumption'.
            hits: (maybeAggCons as any).billing.hits + (consumption as any).billing.hits,
            // @ts-expect-error TS(2304): Cannot find name 'consumption'.
            total: (maybeAggCons as any).billing.total + (consumption as any).billing.total,
        },
    },
];
                        } else {
                          // @ts-expect-error TS(2304): Cannot find name 'agg'.
                          return [...agg, consumption];
                        }
                      }, [])
                      // @ts-expect-error TS(2304): Cannot find name 'sort'.
                      .sort((c1: any, c2: any) => c2.billing.total - c1.billing.total)
                      .map(({
                      plan,
                      billing
                    }: any, idx: any) => {
                        // @ts-expect-error TS(2304): Cannot find name 'state'.
                        const usagePlan = state.selectedApi.possibleUsagePlans.find(
                          (pp: any) => pp._id === plan
                        );
                        return (
                          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                          <PriceCartridge
                            key={idx}
                            label={
                              // @ts-expect-error TS(2304): Cannot find name 'translateMethod'.
                              usagePlan.customName || formatPlanType(usagePlan, translateMethod)
                            }
                            total={billing.total}
                            currency={usagePlan.currency}
                            // @ts-expect-error TS(2304): Cannot find name 'setState'.
                            handleClick={() => setState({ ...state, selectedPlan: usagePlan })}
                          />
                        );
                      })}
                  // @ts-expect-error TS(2304): Cannot find name 'div'.
                  </div>
                )}
                // @ts-expect-error TS(2304): Cannot find name 'state'.
                {state.selectedPlan && (
                  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  <div>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <div className="api__plans__consumption__header">
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <h3 className="api__name">
                        {/* @ts-expect-error TS(2304): Cannot find name 'state'. */}
                        {state.selectedApi.name} -{' '}
                        {/* @ts-expect-error TS(2304): Cannot find name 'state'. */}
                        {state.selectedPlan.customName ||
                          // @ts-expect-error TS(2304): Cannot find name 'state'.
                          formatPlanType(state.selectedPlan, translateMethod)}
                      </h3>
                      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                      <i
                        className="far fa-arrow-alt-circle-left quit"
                        // @ts-expect-error TS(2304): Cannot find name 'setState'.
                        onClick={() => setState({ ...state, selectedPlan: undefined })}
                      />
                    </div>
                    {/* @ts-expect-error TS(2304): Cannot find name 'state'. */}
                    {state.consumptions
                      .filter(
                        // @ts-expect-error TS(7006): Parameter 'c' implicitly has an 'any' type.
                        (c) => c.api === state.selectedApi._id && c.plan === state.selectedPlan._id
                      )
                      // @ts-expect-error TS(7006): Parameter 'c' implicitly has an 'any' type.
                      .map((c, idx) => {
                        // @ts-expect-error TS(2304): Cannot find name 'state'.
                        const team = state.teams.find((t) => (t as any)._id === (c as any).team);
                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        return (<PriceCartridge key={idx} label={team.name} total={(c as any).billing.total} currency={state.selectedPlan.currency}/>);
                      })}
                  </div>
                )}
              // @ts-expect-error TS(2304): Cannot find name 'div'.
              </div>
            // @ts-expect-error TS(2304): Cannot find name 'div'.
            </div>
          )}
        // @ts-expect-error TS(2304): Cannot find name 'div'.
        </div>
      // @ts-expect-error TS(2304): Cannot find name 'div'.
      </div>
    </Can>
  );
};
