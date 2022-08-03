import React, { useContext, useEffect, useState } from 'react';
import { Progress } from 'antd';
import moment from 'moment';
import { useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';

import * as Services from '../../../services';
import { OtoroshiStatsVizualization } from '../..';
import { Spinner, Can, read, stat } from '../../utils';
import { I18nContext } from '../../../core';
import { useTeamBackOffice } from '../../../contexts';

export const TeamApiKeyConsumption = () => {
  const { currentTeam } = useSelector((state) => (state as any).context);
  useTeamBackOffice(currentTeam);
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod, Translation } = useContext(I18nContext);
  const params = useParams();

  const mappers = [
    {
      type: 'LineChart',
      label: (data: any, max: any) => getLabelForDataIn(data, max),
      title: translateMethod('Data In'),
      formatter: (data: any) => data.map((item: any) => ({
        date: moment(item.from).format('DD MMM.'),
        count: item.hits
      })),
      xAxis: 'date',
      yAxis: 'count',
    },
    {
      type: 'Global',
      label: translateMethod('Global informations'),
      formatter: (data: any) => data.length ? data[data.length - 1].globalInformations : [],
    },
  ];

  useEffect(() => {
    // @ts-expect-error TS(2304): Cannot find name 'props'.
    document.title = `${props.currentTeam.name} - ${translateMethod('API key consumption')}`;
  }, []);

  const getLabelForDataIn = (datas: any, max: any) => {
    let hits = datas.length ? datas.reduce((acc: any, data: any) => acc + data.hits, 0) : 0;

    return (
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Usage">Usage</Translation>
        </div>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div>
          {hits /*.prettify()*/}{' '}
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <Translation i18nkey="Hit" isPlural={hits > 1}>
            hits
          </Translation>
        </div>
        {!!max && (
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <div>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <Progress
              status="normal"
              percent={(hits / max) * 100}
              // @ts-expect-error TS(2769): No overload matches this call.
              default={'default'}
              showInfo={false}
            />
          </div>
        )}
      </div>
    );
  };

  const getInformations = () => {
    // @ts-expect-error TS(2304): Cannot find name 'props'.
    return Services.getSubscriptionInformations(params.subscription, props.currentTeam._id);
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Can I={read} a={stat} team={props.currentTeam} dispatchError>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="d-flex col flex-column pricing-content">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <div className="row">
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="col-12">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <h1>Api Consumption</h1>
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <PlanInformations fetchData={() => getInformations()} />
          </div>
          {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
          <div className="col section p-2">
            {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
            <OtoroshiStatsVizualization
              sync={() =>
                // @ts-expect-error TS(2304): Cannot find name 'props'.
                Services.syncSubscriptionConsumption(params.subscription, props.currentTeam._id)
              }
              fetchData={(from: any, to: any) =>
                Services.subscriptionConsumption(
                  params.subscription,
                  // @ts-expect-error TS(2304): Cannot find name 'props'.
                  props.currentTeam._id,
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
};

const PlanInformations = (props: any) => {
  const [state, setState] = useState({
    loading: true,
    informations: null,
  });

  useEffect(() => {
    props.fetchData().then((informations: any) => setState({ ...state, informations, loading: false }));
  }, []);

  if (state.loading) {
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return <Spinner width="50" height="50" />;
  }

  if (!state.informations || !(state.informations as any).api) {
    return null;
  }

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<h3>
      {(state.informations as any).api.name} -{' '}
      {(state.informations as any).plan.customName || (state.informations as any).plan.type}
    </h3>);
};
