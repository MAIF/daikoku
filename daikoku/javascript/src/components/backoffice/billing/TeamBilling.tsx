import maxBy from 'lodash/maxBy';
import { useContext, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import dayjs from 'dayjs';

import { useTeamBackOffice } from '../../../contexts';
import { I18nContext } from '../../../core';
import * as Services from '../../../services';
import { MonthPicker } from '../../inputs/monthPicker';
import {
  Can,
  Spinner,
  formatCurrency,
  formatPlanType,
  read,
  stat
} from '../../utils';
import { ApiTotal, NoData, PriceCartridge, TheadBillingContainer } from './components';
import { IApi, IConsumption, IState, ITeamSimple, isError } from '../../../types';
import { useQuery, useQueryClient } from '@tanstack/react-query';

type IConsumptionByApi = {
  billing: { hits: number, total: number },
  api: string
}

export const TeamBilling = () => {
  const currentTeam = useSelector<IState, ITeamSimple>((state) => state.context.currentTeam);
  useTeamBackOffice(currentTeam);

  const { translate, Translation } = useContext(I18nContext);

  const [selectedApi, setSelectedApi] = useState<IApi>();
  const [date, setDate] = useState(dayjs());

  const queryClient = useQueryClient();
  const queryBillings = useQuery({
    queryKey: ['billings', date],
    queryFn: () => Services.getTeamBillings(
      currentTeam._id,
      date.startOf('month').valueOf(),
      date.endOf('month').valueOf()
    )
  });
  const queryApis = useQuery({ queryKey: ['apis'], queryFn: () => Services.subscribedApis(currentTeam._id) })

  useEffect(() => {
    document.title = `${currentTeam.name} - ${translate('Billing')}`;
  }, []);

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['billings'] })
  }, [date])

  const getConsumptionsByApi = (consumptions: Array<IConsumption>) => consumptions.reduce((acc: Array<IConsumptionByApi>, consumption) => {
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
    Services.syncTeamBilling(currentTeam._id)
      .then(() => queryClient.invalidateQueries({ queryKey: ['billings'] }))
  };


  const drawApis = () => {
    if (queryApis.isLoading && queryBillings.isLoading) {
      return (
        <div className="row api__billing__card__container section p-2">
          <Spinner />
        </div>
      )
    } else if (queryApis.data && queryBillings.data) {
      if (isError(queryApis.data)) {
        return (
          <div>{queryApis.data.error}</div>
        )
      } else if (isError(queryBillings.data)) {
        return (
          <div>{queryBillings.data.error}</div>
        )
      } else {
        const consumptions = queryBillings.data;
        const apis = queryApis.data;
        const consumptionsByApi = getConsumptionsByApi(consumptions)
        const total = consumptions.reduce((acc: number, curr) => acc + curr.billing.total, 0);

        return (
          <div className="row api__billing__card__container section p-2">
            <TheadBillingContainer label={translate('Subscribed Apis')} total={formatCurrency(total)} />
            {!consumptionsByApi.length && <NoData />}
            {consumptionsByApi
              .sort((api1, api2) => api2.billing.total - api1.billing.total)
              .map((consumption) => {
                const api = apis.find((a) => a._id === consumption.api)
                return <ApiTotal
                  key={consumption.api}
                  handleClick={() => setSelectedApi(api)}
                  api={api}
                  total={consumption.billing.total} />
              })}
            <TheadBillingContainer label={translate('Subscribed Apis')} total={formatCurrency(total)} />
          </div>
        )
      }
    }
  }

  const drawApiConsumption = () => {

    if (!selectedApi) {
      return null
    }

    if (queryApis.isLoading && queryBillings.isLoading) {
      return (
        <div className="row api__billing__card__container section p-2">
          <Spinner />
        </div>
      )
    } else if (queryApis.data && queryBillings.data) {
      if (isError(queryApis.data)) {
        return (
          <div>{queryApis.data.error}</div>
        )
      } else if (isError(queryBillings.data)) {
        return (
          <div>{queryBillings.data.error}</div>
        )
      } else {
        const consumptions = queryBillings.data;

        return (
          <div className="api-plans-consumptions section p-2">
            <div className="api__plans__consumption__header">
              <h3 className="api__name">{selectedApi.name}</h3>
              <i className="far fa-times-circle quit" onClick={() => setSelectedApi(undefined)} />
            </div>
            {consumptions
              .filter((c) => c.api === selectedApi._id)
              .sort((c1, c2) => c2.billing.total - c1.billing.total)
              .map(({ plan, billing }, idx: number) => {
                return (
                  <BillingCartridge
                    key={idx}
                    api={selectedApi}
                    planId={plan}
                    total={billing.total} />
                )
              })}
          </div>
        )
      }
    }
  }

  const BillingCartridge = (props: { api: IApi, planId: string, total: number }) => {
    const planQuery = useQuery({ queryKey: ['plan'], queryFn: () => Services.planOfApi(props.api.team, props.api._id, props.api.currentVersion, props.planId) })

    if (planQuery.isLoading) {
      return <Spinner />
    } else if (planQuery.data && !isError(planQuery.data)) {
      const usagePlan = planQuery.data;
      return (
        <PriceCartridge
          label={usagePlan.customName || formatPlanType(usagePlan, translate)}
          total={props.total}
          currency={usagePlan.currency}
          fetchInvoices={() => Services.fetchInvoices(currentTeam._id, props.api._id, usagePlan._id, window.location.href)
            .then(({ url }) => window.location.href = url)} />
      );
    } else {
      return (<div>error while fetching usage plan</div>)
    }
  }

  const getLastDate = () => {
    if (queryBillings.data && !isError(queryBillings.data)) {
      const consumptions = queryBillings.data
      const mostRecentConsumption = maxBy(consumptions, (c) => c.to);
      const lastDate = mostRecentConsumption && dayjs(mostRecentConsumption.to).format('DD/MM/YYYY HH:mm');

      return (
        <i className="ms-1">
          <Translation i18nkey="date.update" replacements={[lastDate]}>
            upd. {lastDate}
          </Translation>
        </i>
      )
    } else {
      return <></>
    }
  }

  return (
    <Can I={read} a={stat} team={currentTeam} dispatchError={true}>
      <div className="row">
        <div className="col">
          <h1>
            <Translation i18nkey="Billing">Billing</Translation>
          </h1>
          <div className="row">
            <div className="col apis">
              <div className="row month__and__total">
                <div className="col-12 month__selector d-flex align-items-center">
                  <MonthPicker updateDate={setDate} value={date} />
                  <button className="btn btn-sm btn-access-negative ms-1" onClick={sync}>
                    <i className="fas fa-sync-alt" />
                  </button>
                  {getLastDate()}
                </div>
              </div>
              {drawApis()}
            </div>
            <div className="col apikeys">
              {drawApiConsumption()}
            </div>
          </div>
        </div>
      </div>
    </Can>
  )
};
