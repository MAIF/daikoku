import React from 'react';

import { AssetsList } from '../../../components';
import { useTenantBackOffice } from '../../../contexts';

export const TenantAssets = () => {

  useTenantBackOffice();
  return (
    <AssetsList tenantMode={true} />
  )
}