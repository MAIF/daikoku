import React, { useContext, useEffect } from 'react';
import { useSelector } from 'react-redux';
import sortBy from 'lodash/sortBy';

import { OtoroshiStatsVizualization } from '../../utils';
import * as Services from '../../../services';
import { I18nContext } from '../../../core';
import { useTeamBackOffice } from '../../../contexts';

export const TeamConsumption = () => {
  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

  const { currentTeam } = useSelector((state) => (state as any).context);
  useTeamBackOffice(currentTeam);

  useEffect(() => {
    document.title = `${currentTeam.name} - ${translateMethod('Consumption')}`;
  }, []);

  const mappers = [
    {
      type: 'DoubleRoundChart',
      label: translateMethod('Hits by api/plan'),
      title: translateMethod('Hits by api/plan'),
      formatter: (data: any) => sortBy(
        data.reduce((acc: any, item: any) => {
          const value = acc.find((a: any) => a.name === item.apiName) || { count: 0 };
          return [
            ...acc.filter((a: any) => a.name !== item.apiName),
            { name: item.apiName, count: value.count + item.hits },
          ];
        }, []),
        ['name']
      ),
      formatter2: (data: any) => sortBy(
        data.reduce((acc: any, item: any) => {
          const plan = `${item.apiName} - ${item.plan}`;
          const value = acc.find((a: any) => a.name === plan) || { count: 0 };
          return [
            ...acc.filter((a: any) => a.name !== plan),
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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <div className="row">
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="col">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <h1>Consumption</h1>
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        <OtoroshiStatsVizualization
          sync={() => Services.syncTeamBilling(currentTeam._id)}
          fetchData={(from: any, to: any) =>
            Services.getTeamConsumptions(currentTeam._id, from.valueOf(), to.valueOf())
          }
          mappers={mappers}
        />
      </div>
    </div>
  );
};
