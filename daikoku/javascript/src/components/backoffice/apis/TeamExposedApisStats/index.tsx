import { useContext, useEffect } from 'react';
import { toast } from 'sonner';

import { I18nContext, useTeamBackOffice } from '../../../../contexts';
import * as Services from '../../../../services';
import { isError } from '../../../../types';
import { OtoroshiStatsVizualization, Period, Spinner } from '../../../utils';
import { ConsumptionHits, HitsBreakdown } from './HitsBreakdown';

export const TeamExposedApisStats = () => {
  const { translate } = useContext(I18nContext);
  const { isLoading, currentTeam, error } = useTeamBackOffice();

  useEffect(() => {
    if (currentTeam && !isError(currentTeam)) {
      document.title = `${currentTeam.name} - ${translate('Global stats')}`;
    }
  }, [currentTeam]);

  const mappers = [
    {
      formatter: (consumptions: Array<ConsumptionHits>, period: Period) => (
        <HitsBreakdown consumptions={consumptions} from={period.from} to={period.to} />
      ),
    },
  ];

  if (isLoading) {
    return <Spinner />;
  }

  if (!currentTeam || isError(currentTeam)) {
    toast.error(error?.message || currentTeam?.error);
    return <></>;
  }

  return (
    <div className="row">
      <div className="col">
        <h1>{translate('Global stats')}</h1>
        <OtoroshiStatsVizualization
          sync={() => Services.syncTeamIncome(currentTeam._id)}
          fetchData={(from, to) =>
            Services.getTeamExposedConsumptions(currentTeam._id, from.getTime(), to.getTime())
          }
          mappers={mappers}
        />
      </div>
    </div>
  );
};
