import React, { useContext, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import moment from 'moment';
import maxBy from 'lodash/maxBy';

import * as Services from '../../../services';
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
import { ApiTotal, NoData, PriceCartridge, TheadBillingContainer } from './components';
import { I18nContext } from '../../../core';
import { useTeamBackOffice } from '../../../contexts';

export const TeamBilling = () => {
  const [state, setState] = useState<any>({
    consumptions: [],
    consumptionsByApi: [],
    selectedApi: undefined,
    loading: false,
    date: moment(),
  });

  const { currentTeam } = useSelector((state) => (state as any).context);

  const { translate, Translation } = useContext(I18nContext);

  useTeamBackOffice(currentTeam);

  useEffect(() => {
    getTeamBilling(currentTeam);

    document.title = `${currentTeam.name} - ${translate('Billing')}`;
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

  const total = state.consumptions.reduce((acc: number, curr: any) => acc + (curr as any).billing.total, 0);
  const mostRecentConsumption = maxBy(state.consumptions, (c) => (c as any).to);
  const lastDate = mostRecentConsumption && moment((mostRecentConsumption as any).to).format('DD/MM/YYYY HH:mm');

  return (<Can I={read} a={stat} team={currentTeam} dispatchError={true}>
    <div className="row">
      <div className="col">
        <h1>
          <Translation i18nkey="Billing">Billing</Translation>
        </h1>
        <div className="row">
          <div className="col apis">
            <div className="row month__and__total">
              <div className="col-12 month__selector d-flex align-items-center">
                <MonthPicker updateDate={getBilling} value={state.date} />
                <button className="btn btn-sm btn-access-negative" onClick={sync}>
                  <i className="fas fa-sync-alt ms-1" />
                </button>
                {lastDate ? (<i className="ms-1">
                  <Translation i18nkey="date.update" replacements={[lastDate]}>
                    upd. {lastDate}
                  </Translation>
                </i>) : <></>}
              </div>
            </div>
            <div className="row api__billing__card__container section p-2">
              <TheadBillingContainer label={translate('Subscribed Apis')} total={formatCurrency(total)} />
              {!state.consumptionsByApi.length && <NoData />}
              {state.consumptionsByApi
                .sort((api1: any, api2: any) => api2.billing.total - api1.billing.total)
                .map(({ api, billing }: any) => (<ApiTotal key={api} handleClick={() => setState({
                  ...state,
                  selectedApi: (state as any).apis.find((a: any) => a._id === api),
                })} api={(state as any).apis.find((a: any) => a._id === api)} total={(billing as any).total} />))}
              <TheadBillingContainer label={translate('Subscribed Apis')} total={formatCurrency(total)} />
            </div>
          </div>
          <div className="col apikeys">
            {state.selectedApi && (<div className="api-plans-consumptions section p-2">
              <div className="api__plans__consumption__header">
                <h3 className="api__name">{(state.selectedApi as any).name}</h3>
                <i className="far fa-times-circle quit" onClick={() => setState({ ...state, selectedApi: undefined })} />
              </div>
              {state.consumptions
                .filter((c: any) => c.api === state.selectedApi._id)
                .sort((c1: any, c2: any) => c2.billing.total - c1.billing.total)
                .map(({ plan, billing }: any, idx: number) => {
                  const usagePlan = state.selectedApi.possibleUsagePlans.find((pp: any) => pp._id === plan);
                  return (<PriceCartridge key={idx} label={usagePlan.customName || formatPlanType(usagePlan, translate)} total={billing.total} currency={usagePlan.currency} />);
                })}
            </div>)}
          </div>
        </div>
      </div>
    </div>
  </Can>);
};
