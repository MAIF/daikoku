import { toast } from 'sonner';
import { AssetsList } from '../';
import { useTeamBackOffice } from '../../../contexts/navContext';
import { isError } from '../../../types/api';
import { Spinner } from '../../utils/Spinner';

export const TeamAssets = () => {
  const { isLoading, currentTeam, error } = useTeamBackOffice()


  if (isLoading) {
    return <Spinner />
  } else if (currentTeam && !isError(currentTeam)) {
    return <AssetsList currentTeam={currentTeam} />;
  } else {
    toast.error(error?.message || currentTeam?.error)
    return <></>;
  }


};
