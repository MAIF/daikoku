import React, { useContext, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import moment from 'moment';
import _ from 'lodash';

import * as Services from '../../../services';
import { MonthPicker } from '../../inputs/monthPicker';
import { ApiTotal, NoData, PriceCartridge, TheadBillingContainer } from './components';
import { formatCurrency, formatPlanType, Spinner, Can, read, api } from '../../utils';
import { I18nContext, setError } from '../../../core';
import { getApolloContext } from '@apollo/client';

function TeamIncomeComponent(props) {
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
    getBillingData(props.currentTeam);

    document.title = `${props.currentTeam.name} - ${translateMethod('Income')}`;
  }, []);

  const { client } = useContext(getApolloContext());

  const getBillingData = (team) => {
    setState({ ...state, loading: true });
    Promise.all([
      Services.getTeamIncome(
        team._id,
        state.date.startOf('month').valueOf(),
        state.date.endOf('month').valueOf()
      ),
      client.query({
        query: Services.graphql.myVisibleApisOfTeam(team._id),
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
          apis: visibleApis.map(({ api }) => api),
          teams,
          loading: false,
        });
      }
    );
  };

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

  const sync = () => {
    setState({ ...state, loading: true });
    Services.syncTeamIncome(props.currentTeam._id).then(() => getBillingData(props.currentTeam));
  };

  if (props.tenant.creationSecurity && !props.currentTeam.apisCreationPermission) {
    props.setError({ error: { status: 403, message: 'Creation security enabled' } });
  }

  const total = state.consumptions.reduce((acc, curr) => acc + curr.billing.total, 0);
  const mostRecentConsumption = _.maxBy(state.consumptions, (c) => c.to);
  const lastDate =
    mostRecentConsumption && moment(mostRecentConsumption.to).format('DD/MM/YYYY HH:mm');

  return (
    <Can I={read} a={api} team={props.currentTeam} dispatchError={true}>
      <div className="row">
        <div className="col">
          <h1>
            <Translation i18nkey="Team Income">Income</Translation>
          </h1>
          {state.loading && <Spinner />}
          {!state.loading && (
            <div className="row">
              <div className="col apis">
                <div className="row month__and__total">
                  <div className="col-12 month__selector d-flex align-items-center">
                    <MonthPicker
                      updateDate={(date) => {
                        setState({ ...state, date });
                        getBillingData(props.currentTeam);
                      }}
                      value={state.date}
                    />
                    <button className="btn btn-sm btn-access-negative" onClick={sync}>
                      <i className="fas fa-sync-alt" />
                    </button>
                    {lastDate && (
                      <i className="ml-1">
                        <Translation i18nkey="date.update" replacements={[lastDate]}>
                          upd. {lastDate}
                        </Translation>
                      </i>
                    )}
                  </div>
                </div>
                <div className="row api__billing__card__container section p-2">
                  <TheadBillingContainer
                    label={translateMethod('Apis')}
                    total={formatCurrency(total)}
                  />
                  {!state.consumptionsByApi.length && <NoData />}
                  {state.consumptionsByApi
                    .sort((api1, api2) => api2.billing.total - api1.billing.total)
                    .map(({ api, billing }) => (
                      <ApiTotal
                        key={api}
                        handleClick={() =>
                          setState({
                            ...state,
                            selectedPlan: undefined,
                            selectedApi: state.apis.find((a) => a._id === api),
                          })
                        }
                        api={state.apis.find((a) => a._id === api)}
                        total={billing.total}
                      />
                    ))}
                  <TheadBillingContainer
                    label={translateMethod('Apis')}
                    total={formatCurrency(total)}
                  />
                </div>
              </div>
              <div className="col apikeys">
                {state.selectedApi && !state.selectedPlan && (
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
                      .reduce((agg, consumption) => {
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
                        } else {
                          return [...agg, consumption];
                        }
                      }, [])
                      .sort((c1, c2) => c2.billing.total - c1.billing.total)
                      .map(({ plan, billing }, idx) => {
                        const usagePlan = state.selectedApi.possibleUsagePlans.find(
                          (pp) => pp._id === plan
                        );
                        return (
                          <PriceCartridge
                            key={idx}
                            label={
                              usagePlan.customName || formatPlanType(usagePlan, translateMethod)
                            }
                            total={billing.total}
                            currency={usagePlan.currency}
                            handleClick={() => setState({ ...state, selectedPlan: usagePlan })}
                          />
                        );
                      })}
                  </div>
                )}
                {state.selectedPlan && (
                  <div>
                    <div className="api__plans__consumption__header">
                      <h3 className="api__name">
                        {state.selectedApi.name} -{' '}
                        {state.selectedPlan.customName ||
                          formatPlanType(state.selectedPlan, translateMethod)}
                      </h3>
                      <i
                        className="far fa-arrow-alt-circle-left quit"
                        onClick={() => setState({ ...state, selectedPlan: undefined })}
                      />
                    </div>
                    {state.consumptions
                      .filter(
                        (c) => c.api === state.selectedApi._id && c.plan === state.selectedPlan._id
                      )
                      .map((c, idx) => {
                        const team = state.teams.find((t) => t._id === c.team);
                        return (
                          <PriceCartridge
                            key={idx}
                            label={team.name}
                            total={c.billing.total}
                            currency={state.selectedPlan.currency}
                          />
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Can>
  );
}

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  setError: (error) => setError(error),
};

export const TeamIncome = connect(mapStateToProps, mapDispatchToProps)(TeamIncomeComponent);
