import sortBy from 'lodash/sortBy';
import { useContext, useEffect } from 'react';

import { I18nContext, useTeamBackOffice } from '../../../contexts';
import * as Services from '../../../services';
import { isError } from '../../../types';
import { OtoroshiStatsVizualization, Spinner } from '../../utils';
import { toast } from 'sonner';

export const TeamConsumption = () => {
  const { translate } = useContext(I18nContext);
  const { isLoading, currentTeam, error } = useTeamBackOffice()


  useEffect(() => {
    if (currentTeam && !isError(currentTeam)) {
      document.title = `${currentTeam.name} - ${translate('Consumption')}`;
    }
  }, [currentTeam]);

  const mappers = [
    {
      type: 'DoubleRoundChart',
      label: translate('Hits by api/plan'),
      title: translate('Hits by api/plan'),
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

  if (isLoading) {
    return <Spinner />
  } else if (currentTeam && !isError(currentTeam)) {
    return (
      <div className="row">
        <div className="col">
          <h1>{translate('Global stats')}</h1>
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
  } else {
    toast.error(error?.message || currentTeam?.error)
    return <></>;
  }


};
