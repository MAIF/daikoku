import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTenantBackOffice } from '../../../contexts';

import * as Services from '../../../services';
import { isError } from '../../../types';
import { TeamMembersSimpleComponent } from '../../backoffice';
import { Can, manage, Spinner, tenant } from '../../utils';

export const TeamMembersForAdmin = () => {
  useTenantBackOffice();

  const queryClient = useQueryClient();
  const queryTeam = useQuery({
    queryKey: ['team-infos'],
    queryFn: () => Services.teamFull(params.teamSettingId!)
  });
  const params = useParams();

  if (queryTeam.isLoading) {
    return <Spinner />
  } else if (queryTeam.data && !isError(queryTeam.data)) {
    return (
      <Can I={manage} a={tenant} dispatchError>
        <TeamMembersSimpleComponent currentTeam={queryTeam.data} reloadCurrentTeam={() => queryClient.invalidateQueries({ queryKey: ['team-infos']})}/>
      </Can>
    );
  } else {
    return <div>Error while fetching team</div>
  }

};
