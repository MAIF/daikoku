import React from 'react';

import { AssetsList } from '../../../components';
import { useTenantBackOffice } from '../../../contexts';

export const TenantAssets = () => {
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  useTenantBackOffice();
  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return <AssetsList tenantMode={true} />;
};
