import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import { useTenantBackOffice } from '../../../contexts';
import { openInvitationTeamModal } from '../../../core';

import * as Services from '../../../services';
import { ITeamFull } from '../../../types';
import { TeamMembersSimpleComponent } from '../../backoffice';
import { Can, manage, tenant } from '../../utils';

export const TeamMembersForAdmin = () => {
  useTenantBackOffice();

  const connectedUser = useSelector((s) => (s as any).context.connectedUser);
  const dispatch = useDispatch();

  const [team, setTeam] = useState<ITeamFull>();
  const params = useParams();

  useEffect(() => {
    Services.teamFull(params.teamSettingId!)
      .then(setTeam);
  }, []);

  if (!team) {
    return null;
  }

  return (
    <Can I={manage} a={tenant} dispatchError>
      <TeamMembersSimpleComponent
        currentTeam={team}
        connectedUser={connectedUser}
        updateTeam={(team: any) => Promise.resolve(setTeam(team))}
        openInvitationModal={(p: any) => openInvitationTeamModal(p)(dispatch)}
      />
    </Can>
  );
};
