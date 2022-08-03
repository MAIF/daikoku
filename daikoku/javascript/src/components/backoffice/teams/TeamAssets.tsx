import React from 'react';
import { useSelector } from 'react-redux';

import { AssetsList } from '../';
import { useTeamBackOffice } from '../../../contexts';

export const TeamAssets = () => {
  const { currentTeam } = useSelector((state) => (state as any).context);

  useTeamBackOffice(currentTeam);

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return <AssetsList tenantMode={false} />;
};
