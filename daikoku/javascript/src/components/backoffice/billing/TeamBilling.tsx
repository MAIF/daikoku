import React, { useContext, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import moment from 'moment';
import maxBy from 'lodash/maxBy';

import * as Services from '../../../services';
// @ts-expect-error TS(6142): Module '../../inputs/monthPicker' was resolved to ... Remove this comment to see the full error message
import { MonthPicker } from '../../inputs/monthPicker';
import {
  formatCurrency,
  formatPlanType,
  Can,
  read,
  stat,
  api as API,
  CanIDoAction,
} from '../../utils';
// @ts-expect-error TS(6142): Module './components' was resolved to '/Users/qaub... Remove this comment to see the full error message
import { ApiTotal, NoData, PriceCartridge, TheadBillingContainer } from './components';
import { I18nContext } from '../../../core';
import { useTeamBackOffice } from '../../../contexts';

export const TeamBilling = (props: any) => {
  const [state, setState] = useState({
    consumptions: [],
    consumptionsByApi: [],
    selectedApi: undefined,
    loading: false,
    date: moment(),
  });

  const { currentTeam } = useSelector((state) => (state as any).context);

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);

  useTeamBackOffice(currentTeam);

  useEffect(() => {
    getTeamBilling(currentTeam);

    document.title = `${currentTeam.name} - ${translateMethod('Billing')}`;
  }, []);

  const getTeamBilling = (team: any) => {
    setState({ ...state, loading: true });
    Promise.all([
      Services.getTeamBillings(
        team._id,
        moment().startOf('month').valueOf(),
        moment().endOf('month').valueOf()
      ),
      Services.subscribedApis(team._id),
    ]).then(([consumptions, apis]) => {
      const consumptionsByApi = getConsumptionsByApi(consumptions);
      // @ts-expect-error TS(2345): Argument of type '{ consumptions: any; consumption... Remove this comment to see the full error message
      setState({ ...state, consumptions, consumptionsByApi, apis, loading: false });
    });
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

  const getBilling = (date: any) => {
    setState({ ...state, loading: true, selectedApi: undefined });
    Services.getTeamBillings(
      currentTeam._id,
      date.startOf('month').valueOf(),
      date.endOf('month').valueOf()
    ).then((consumptions) =>
      setState({
        ...state,
        date,
        consumptions,
        consumptionsByApi: getConsumptionsByApi(consumptions),
        loading: false,
      })
    );
  };

  const sync = () => {
    setState({ ...state, loading: true });
    Services.syncTeamBilling(currentTeam._id)
      .then(() =>
        Services.getTeamBillings(
          currentTeam._id,
          state.date.startOf('month').valueOf(),
          state.date.endOf('month').valueOf()
        )
      )
      .then((consumptions) =>
        setState({
          ...state,
          consumptions,
          consumptionsByApi: getConsumptionsByApi(consumptions),
          loading: false,
        })
      );
  };

  const total = state.consumptions.reduce((acc, curr) => acc + (curr as any).billing.total, 0);
  const mostRecentConsumption = maxBy(state.consumptions, (c) => (c as any).to);
  const lastDate = mostRecentConsumption && moment((mostRecentConsumption as any).to).format('DD/MM/YYYY HH:mm');

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<Can I={read} a={stat} team={currentTeam} dispatchError={true}>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="row">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="col">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <h1>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Translation i18nkey="Billing">Billing</Translation>
          </h1>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="row">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="col apis">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="row month__and__total">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <div className="col-12 month__selector d-flex align-items-center">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <MonthPicker updateDate={getBilling} value={state.date}/>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <button className="btn btn-sm btn-access-negative" onClick={sync}>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <i className="fas fa-sync-alt ms-1"/>
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
                <TheadBillingContainer label={translateMethod('Subscribed Apis')} total={formatCurrency(total)}/>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                {!state.consumptionsByApi.length && <NoData />}
                {state.consumptionsByApi
        .sort((api1, api2) => (api2 as any).billing.total - (api1 as any).billing.total)
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        .map(({ api, billing }) => (<ApiTotal key={api} handleClick={() => setState({
            ...state,
            selectedApi: (state as any).apis.find((a: any) => a._id === api),
        })} api={(state as any).apis.find((a: any) => a._id === api)} total={(billing as any).total}/>))}
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <TheadBillingContainer label={translateMethod('Subscribed Apis')} total={formatCurrency(total)}/>
              </div>
            </div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <div className="col apikeys">
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              {state.selectedApi && (<div className="api-plans-consumptions section p-2">
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <div className="api__plans__consumption__header">
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <h3 className="api__name">{(state.selectedApi as any).name}</h3>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <i className="far fa-times-circle quit" onClick={() => setState({ ...state, selectedApi: undefined })}/>
                  </div>
                  {state.consumptions
            // @ts-expect-error TS(2532): Object is possibly 'undefined'.
            .filter((c) => (c as any).api === state.selectedApi._id)
            .sort((c1, c2) => (c2 as any).billing.total - (c1 as any).billing.total)
            .map(({ plan, billing }, idx) => {
            // @ts-expect-error TS(2532): Object is possibly 'undefined'.
            const usagePlan = state.selectedApi.possibleUsagePlans.find((pp: any) => pp._id === plan);
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            return (<PriceCartridge key={idx} label={usagePlan.customName || formatPlanType(usagePlan, translateMethod)} total={billing.total} currency={usagePlan.currency}/>);
        })}
                </div>)}
            </div>
          </div>
        </div>
      </div>
    </Can>);
                      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                      return (<PriceCartridge key={idx} label={usagePlan.customName || formatPlanType(usagePlan, translateMethod)} total={(billing as any).total} currency={usagePlan.currency}/>);
                    })}
                // @ts-expect-error TS(2304): Cannot find name 'div'.
                </div>
              )}
            // @ts-expect-error TS(2304): Cannot find name 'div'.
            </div>
          // @ts-expect-error TS(2304): Cannot find name 'div'.
          </div>
        // @ts-expect-error TS(2304): Cannot find name 'div'.
        </div>
      // @ts-expect-error TS(2304): Cannot find name 'div'.
      </div>
    </Can>
  );
};
