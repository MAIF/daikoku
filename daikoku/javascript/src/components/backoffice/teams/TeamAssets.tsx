import React from 'react';
import { useSelector } from 'react-redux';

import { AssetsList } from '../';
import { useTeamBackOffice } from '../../../contexts';

export const TeamAssets = () => {
  const { currentTeam } = useSelector((state) => (state as any).context);

  useTeamBackOffice(currentTeam);

    return <AssetsList tenantMode={false} />;
};
