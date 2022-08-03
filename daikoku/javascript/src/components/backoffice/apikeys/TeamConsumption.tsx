import React, { useContext, useEffect } from 'react';
import { useSelector } from 'react-redux';
import sortBy from 'lodash/sortBy';

import { OtoroshiStatsVizualization } from '../../utils';
import * as Services from '../../../services';
import { I18nContext } from '../../../core';
import { useTeamBackOffice } from '../../../contexts';

export const TeamConsumption = () => {
  const { translateMethod } = useContext(I18nContext);

  const { currentTeam } = useSelector((state) => state.context);
  useTeamBackOffice(currentTeam);

  useEffect(() => {
    document.title = `${currentTeam.name} - ${translateMethod('Consumption')}`;
  }, []);

  const mappers = [
    {
      type: 'DoubleRoundChart',
      label: translateMethod('Hits by api/plan'),
      title: translateMethod('Hits by api/plan'),
      formatter: (data) =>
        sortBy(
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
        sortBy(
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
