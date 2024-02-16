
import { AssetsList } from '../';
import { useTeamBackOffice } from '../../../contexts';
import { isError } from '../../../types';
import { Spinner } from '../../utils/Spinner';

export const TeamAssets = () => {

  const { isLoading, currentTeam } = useTeamBackOffice();

  if (isLoading) {
    return <Spinner />
  } else if (currentTeam && !isError(currentTeam)) {
    return <AssetsList currentTeam={currentTeam} />;
  } else {
    return <div>Error while fetching team</div>
  }

};
