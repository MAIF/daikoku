import { AssetsList } from '../../../components';
import { useTenantBackOffice } from '../../../contexts';

export const TenantAssets = () => {
    useTenantBackOffice();
    
    return <AssetsList />;
};
