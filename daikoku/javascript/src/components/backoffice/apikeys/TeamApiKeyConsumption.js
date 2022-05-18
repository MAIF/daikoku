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
  const { currentTeam } = useSelector((state) => state.context);
  useTeamBackOffice(currentTeam);
  const { translateMethod, Translation } = useContext(I18nContext);
  const params = useParams();

  const mappers = [
    {
      type: 'LineChart',
      label: (data, max) => getLabelForDataIn(data, max),
      title: translateMethod('Data In'),
      formatter: (data) =>
        data.map((item) => ({
          date: moment(item.from).format('DD MMM.'),
          count: item.hits,
        })),
      xAxis: 'date',
      yAxis: 'count',
    },
    {
      type: 'Global',
      label: translateMethod('Global informations'),
      formatter: (data) => (data.length ? data[data.length - 1].globalInformations : []),
    },
  ];

  useEffect(() => {
    document.title = `${props.currentTeam.name} - ${translateMethod('API key consumption')}`;
  }, []);

  const getLabelForDataIn = (datas, max) => {
    let hits = datas.length ? datas.reduce((acc, data) => acc + data.hits, 0) : 0;

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
              default={'default'}
              showInfo={false}
            />
          </div>
        )}
      </div>
    );
  };

  const getInformations = () => {
    return Services.getSubscriptionInformations(params.subscription, props.currentTeam._id);
  };

  return (
    <Can I={read} a={stat} team={props.currentTeam} dispatchError>
      <div className="d-flex col flex-column pricing-content">
        <div className="row">
          <div className="col-12">
            <h1>Api Consumption</h1>
            <PlanInformations fetchData={() => getInformations()} />
          </div>
          <div className="col section p-2">
            <OtoroshiStatsVizualization
              sync={() =>
                Services.syncSubscriptionConsumption(params.subscription, props.currentTeam._id)
              }
              fetchData={(from, to) =>
                Services.subscriptionConsumption(
                  params.subscription,
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

const PlanInformations = (props) => {
  const [state, setState] = useState({
    loading: true,
    informations: null,
  });

  useEffect(() => {
    props.fetchData().then((informations) => setState({ ...state, informations, loading: false }));
  }, []);

  if (state.loading) {
    return <Spinner width="50" height="50" />;
  }

  if (!state.informations || !state.informations.api) {
    return null;
  }

  return (
    <h3>
      {state.informations.api.name} -{' '}
      {state.informations.plan.customName || state.informations.plan.type}
    </h3>
  );
};
