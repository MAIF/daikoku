import React, { useContext, useEffect, useState } from 'react';
import { Progress } from 'antd';
import moment from 'moment';
import { useParams } from 'react-router-dom';

import * as Services from '../../../services';
import { BeautifulTitle, OtoroshiStatsVizualization } from '../..';
import { Spinner, Can, read, stat } from '../../utils';
import { I18nContext } from '../../../contexts';
import { useTeamBackOffice } from '../../../contexts';
import { useQuery } from "@tanstack/react-query";
import { IState, ITeamSimple, ResponseError, isError } from "../../../types";
import { toast } from 'sonner';

type QuotasProps = {
  currentTeam?: ITeamSimple | ResponseError,
  typePlan: string

}
const Quotas = (props: QuotasProps) => {
  const params = useParams()
  const queryQuotas = useQuery({
    queryKey: ['quotas'],
    queryFn: () => Services.getConsummedQuotasWithSubscriptionId((props.currentTeam as ITeamSimple)._id, params.subscription!),
    enabled: props.currentTeam && !isError(props.currentTeam)
  })

  const { translate } = useContext(I18nContext);

  if (queryQuotas.isLoading) {
    return <Spinner />
  } else if (queryQuotas.data) {
    let colorDaily
    const percentDaily = ((queryQuotas.data.authorizedCallsPerDay - queryQuotas.data.remainingCallsPerDay) / queryQuotas.data.authorizedCallsPerDay) * 100
    let colorMonthly
    const percentMontly = ((queryQuotas.data.authorizedCallsPerMonth - queryQuotas.data.remainingCallsPerMonth) / queryQuotas.data.authorizedCallsPerMonth) * 100

    if (percentDaily <= 33) {
      colorDaily = "var(--success-color, #4F8A10)"
    } else if (33 < percentDaily && percentDaily <= 66) {
      colorDaily = "var(--warning-color, #ffc107)"
    } else {
      colorDaily = "var(--danger-color, #dc3545)"
    }
    if (percentMontly <= 33) {
      colorMonthly = "var(--success-color, #4F8A10)"
    } else if (33 < percentMontly && percentMontly <= 66) {
      colorMonthly = "var(--warning-color, #ffc107)"
    } else {
      colorMonthly = "var(--danger-color, #dc3545)"
    }
    return (
      <div className="col-12">
        <h5>{translate('Daily quotas consumed')}</h5>
        <BeautifulTitle
          title={translate({
            key: "daily.quotas.consumed.title",
            replacements: [(queryQuotas.data.authorizedCallsPerDay - queryQuotas.data.remainingCallsPerDay).toString(), queryQuotas.data.authorizedCallsPerDay.toString()]
          })}>
          <Progress
            strokeColor={colorDaily}
            percent={Math.round(percentDaily)}
            status="active"
          />
        </BeautifulTitle>
        <h5>
          {translate("Monthly quotas consumed")}
        </h5>
        <BeautifulTitle
          title={translate({
            key: "monthly.quotas.consumed.title",
            replacements: [(queryQuotas.data.authorizedCallsPerMonth - queryQuotas.data.remainingCallsPerMonth).toString(), queryQuotas.data.authorizedCallsPerMonth.toString()]
          })}>
          <Progress
            strokeColor={colorMonthly}
            percent={Math.round(percentMontly)}
            status="active"
          />
        </BeautifulTitle>
      </div>
    )
  } else {
    return <div>Error while searching quotas.</div>
  }
}
export const TeamApiKeyConsumption = () => {
  const { isLoading, currentTeam, error } = useTeamBackOffice();

  const { translate, Translation } = useContext(I18nContext);
  const params = useParams();

  const getInformations = (team: ITeamSimple) => {
    return Services.getSubscriptionInformations(params.subscription!, team._id);
  };
  const subInf = useQuery({
    queryKey: ['subInf'],
    queryFn: () => getInformations((currentTeam as ITeamSimple)),
    enabled: currentTeam && !isError(currentTeam)
  });

  let mappers = [
    {
      type: 'LineChart',
      label: (data: any, max: any) => getLabelForDataIn(data, max),
      title: translate('Data In'),
      formatter: (data: any) => data.map((item: any) => ({
        date: moment(item.from).format('DD MMM.'),
        count: item.hits
      })),
      xAxis: 'date',
      yAxis: 'count',
    },
    {
      type: 'Global',
      label: translate('Global informations'),
      formatter: (data: any) => data.length ? data[data.length - 1].globalInformations : [],
    },
  ];;

  switch (subInf.data?.plan.type) {
    case 'FreeWithQuotas':
    case 'QuotasWithLimits':
    case 'QuotasWithoutLimits':
      mappers = [
        ...mappers,
        {
          type: 'Custom',
          label: translate('Quotas consumptions'),
          formatter: () => <Quotas currentTeam={currentTeam} typePlan={subInf.data!.plan.type} />,
        },
      ];
  }

  useEffect(() => {
    if (currentTeam && !isError(currentTeam))
      document.title = `${currentTeam.name} - ${translate('API key consumption')}`;
  }, [currentTeam]);

  const getLabelForDataIn = (datas: any, max: any) => {
    let hits = datas.length ? datas.reduce((acc: any, data: any) => acc + data.hits, 0) : 0;

    return (
      <div>
        <div>
          <Translation i18nkey="Usage">Usage</Translation>
        </div>
        <div>
          {hits /*.prettify()*/}{' '}
          <Translation i18nkey="Hit" isPlural={hits > 1}>
            hits
          </Translation>
        </div>
        {!!max && (
          <div>
            <Progress
              status="normal"
              percent={(hits / max) * 100}
              showInfo={false}
            />
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return <Spinner />
  } else if (currentTeam && !isError(currentTeam)) {
    return (
      <Can I={read} a={stat} team={currentTeam} dispatchError>
        <div className="d-flex col flex-column pricing-content">
          <div className="row">
            <div className="col-12">
              <h1>Api Consumption</h1>
              <PlanInformations fetchData={() => getInformations(currentTeam)} />
            </div>
            <div className="col section p-2">
              <OtoroshiStatsVizualization
                sync={() =>
                  Services.syncSubscriptionConsumption(params.subscription, currentTeam._id)
                }
                fetchData={(from: any, to: any) =>
                  Services.subscriptionConsumption(
                    params.subscription,
                    currentTeam._id,
                    from.valueOf(),
                    to.valueOf()
                  ).then((c) => c.consumptions)
                }
                mappers={mappers}
                forConsumer={true}
              />
            </div>
          </div>
        </div>
      </Can>
    );
  } else {
    toast.error(error?.message || currentTeam?.error)
    return <></>;
  }

  
}

const PlanInformations = (props: any) => {
  const [state, setState] = useState({
    loading: true,
    informations: null,
  });

  useEffect(() => {
    props.fetchData().then((informations: any) => setState({ ...state, informations, loading: false }));
  }, []);

  if (state.loading) {
    return <Spinner width="50" height="50" />;
  }

  if (!state.informations || !(state.informations as any).api) {
    return null;
  }

  return (<h3>
    {(state.informations as any).api.name} -{' '}
    {(state.informations as any).plan.customName || (state.informations as any).plan.type}

  </h3>);
};
