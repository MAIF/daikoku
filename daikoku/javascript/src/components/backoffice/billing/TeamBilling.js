import React, { useContext, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import moment from 'moment';
import _ from 'lodash';

import { TeamBackOffice } from '../TeamBackOffice';
import * as Services from '../../../services';
import { MonthPicker } from '../../inputs/monthPicker';
import { formatCurrency, formatPlanType, Can, read, stat } from '../../utils';
import { ApiTotal, NoData, PriceCartridge, TheadBillingContainer } from './components';
import { I18nContext } from '../../../core';

function TeamBillingComponent(props) {
  const [state, setState] = useState({
    consumptions: [],
    consumptionsByApi: [],
    selectedApi: undefined,
    loading: false,
    date: moment(),
  });

  const { translateMethod, Translation } = useContext(I18nContext);

  useEffect(() => {
    getTeamBilling(props.currentTeam);
  }, []);

  const getTeamBilling = team => {
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
  }

  const getConsumptionsByApi = (consumptions) =>
    consumptions.reduce((acc, consumption) => {
      const api = acc.find((item) => item.api === consumption.api);
      const { hits, total } = api ? api.billing : { hits: 0, total: 0 };
      const billing = {
        hits: hits + consumption.billing.hits,
        total: total + consumption.billing.total,
      };
      const obj = { billing, api: consumption.api };

      return [...acc.filter((item) => item.api !== consumption.api), obj];
    }, []);

  const getBilling = (date) => {
    setState({ ...state, loading: true, selectedApi: undefined })
    Services.getTeamBillings(
      props.currentTeam._id,
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
    Services.syncTeamBilling(props.currentTeam._id)
      .then(() =>
        Services.getTeamBillings(
          props.currentTeam._id,
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

  const total = state.consumptions.reduce((acc, curr) => acc + curr.billing.total, 0);
  const mostRecentConsumption = _.maxBy(state.consumptions, (c) => c.to);
  const lastDate =
    mostRecentConsumption && moment(mostRecentConsumption.to).format('DD/MM/YYYY HH:mm');

  return (
    <TeamBackOffice
      tab="Billing"
      isLoading={state.loading}
      title={`${props.currentTeam.name} - ${translateMethod('Billing')}`}>
      <Can I={read} a={stat} team={props.currentTeam} dispatchError={true}>
        <div className="row">
          <div className="col">
            <h1>
              <Translation i18nkey="Billing">
                Billing
              </Translation>
            </h1>
            <div className="row">
              <div className="col apis">
                <div className="row month__and__total">
                  <div className="col-12 month__selector d-flex align-items-center">
                    <MonthPicker
                      updateDate={getBilling}
                      value={state.date}
                    />
                    <button className="btn btn-sm btn-access-negative" onClick={sync}>
                      <i className="fas fa-sync-alt ml-1" />
                    </button>
                    {lastDate && (
                      <i className="ml-1">
                        <Translation
                          i18nkey="date.update"

                          replacements={[lastDate]}>
                          upd. {lastDate}
                        </Translation>
                      </i>
                    )}
                  </div>
                </div>
                <div className="row api__billing__card__container section p-2">
                  <TheadBillingContainer

                    label={translateMethod('Subscribed Apis')}
                    total={formatCurrency(total)}
                  />
                  {!state.consumptionsByApi.length && (
                    <NoData />
                  )}
                  {state.consumptionsByApi
                    .sort((api1, api2) => api2.billing.total - api1.billing.total)
                    .map(({ api, billing }) => (
                      <ApiTotal
                        key={api}
                        handleClick={() =>
                          setState({
                            ...state,
                            selectedApi: state.apis.find((a) => a._id === api),
                          })
                        }
                        api={state.apis.find((a) => a._id === api)}
                        total={billing.total}
                      />
                    ))}
                  <TheadBillingContainer

                    label={translateMethod('Subscribed Apis')}
                    total={formatCurrency(total)}
                  />
                </div>
              </div>
              <div className="col apikeys">
                {state.selectedApi && (
                  <div className="api-plans-consumptions section p-2">
                    <div className="api__plans__consumption__header">
                      <h3 className="api__name">{state.selectedApi.name}</h3>
                      <i
                        className="far fa-times-circle quit"
                        onClick={() => setState({ ...state, selectedApi: undefined })}
                      />
                    </div>
                    {state.consumptions
                      .filter((c) => c.api === state.selectedApi._id)
                      .sort((c1, c2) => c2.billing.total - c1.billing.total)
                      .map(({ plan, billing }, idx) => {
                        const usagePlan = state.selectedApi.possibleUsagePlans.find(
                          (pp) => pp._id === plan
                        );
                        return (
                          <PriceCartridge
                            key={idx}
                            label={usagePlan.customName || formatPlanType(usagePlan, translateMethod)}
                            total={billing.total}
                            currency={usagePlan.currency}
                          />
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Can>
    </TeamBackOffice>
  );
}

const mapStateToProps = (state) => ({
  ...state.context,
});

export const TeamBilling = connect(mapStateToProps)(TeamBillingComponent);
