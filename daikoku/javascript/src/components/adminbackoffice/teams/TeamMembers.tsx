import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import { useTenantBackOffice } from '../../../contexts';

import { updateTeam } from '../../../core/';
import * as Services from '../../../services';
import { isError, IState, ITeamSimple } from '../../../types';
import { TeamMembersSimpleComponent } from '../../backoffice';
import { Can, manage, tenant } from '../../utils';

export const TeamMembersForAdmin = () => {
  useTenantBackOffice();

  const currentTeam = useSelector<IState, ITeamSimple>(s => s.context.currentTeam)

  const queryTeam = useQuery({
    queryKey: ['team-infos'], 
    queryFn: () => Services.teamFull(params.teamSettingId!)
  });
  const params = useParams();

  const dispatch = useDispatch();

  useEffect(() => {
    if(queryTeam.data && !isError(queryTeam.data)) {
      dispatch(updateTeam(queryTeam.data))
    }
  }, [queryTeam]);

  if (!currentTeam) {
    return (
      <div>loading</div>
    );
  }

  return (
    <Can I={manage} a={tenant} dispatchError>
      <TeamMembersSimpleComponent />
    </Can>
  );
};
