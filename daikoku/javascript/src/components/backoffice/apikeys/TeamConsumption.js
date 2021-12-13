import React, { useContext, useEffect } from 'react';
import { connect } from 'react-redux';
import * as _ from 'lodash';

import { OtoroshiStatsVizualization } from '../../utils';
import * as Services from '../../../services';
import { I18nContext } from '../../../core';

const TeamConsumptionComponent = ({ currentTeam }) => {
  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    document.title = `${currentTeam.name} - ${translateMethod('Consumption')}`
  }, [])

  const mappers = [
    {
      type: 'DoubleRoundChart',
      label: translateMethod('Hits by api/plan'),
      title: translateMethod('Hits by api/plan'),
      formatter: (data) =>
        _.sortBy(
          data.reduce((acc, item) => {
            const value = acc.find((a) => a.name === item.apiName) || { count: 0 };
            return [
              ...acc.filter((a) => a.name !== item.apiName),
              { name: item.apiName, count: value.count + item.hits },
            ];
          }, []),
          ['name']
        ),
      formatter2: (data) =>
        _.sortBy(
          data.reduce((acc, item) => {
            const plan = `${item.apiName} - ${item.plan}`;
            const value = acc.find((a) => a.name === plan) || { count: 0 };
            return [
              ...acc.filter((a) => a.name !== plan),
              { name: plan, api: item.apiName, count: value.count + item.hits },
            ];
          }, []),
          ['api']
        ),
      dataKey: 'count',
      parentKey: 'api',
    },
  ];

  return (
    <div className="row">
      <div className="col">
        <h1>Consumption</h1>
        <OtoroshiStatsVizualization
          sync={() => Services.syncTeamBilling(currentTeam._id)}
          fetchData={(from, to) =>
            Services.getTeamConsumptions(currentTeam._id, from.valueOf(), to.valueOf())
          }
          mappers={mappers}
        />
      </div>
    </div>
  );
};

const mapStateToProps = (state) => ({
  ...state.context,
});

export const TeamConsumption = connect(mapStateToProps)(TeamConsumptionComponent);
