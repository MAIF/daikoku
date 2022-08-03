import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import { useTenantBackOffice } from '../../../contexts';
import { openInvitationTeamModal } from '../../../core';

import * as Services from '../../../services';
import { TeamMembersSimpleComponent } from '../../backoffice';
import { Can, manage, tenant } from '../../utils';

export const TeamMembersForAdmin = () => {
  // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
  useTenantBackOffice();

  const connectedUser = useSelector((s) => (s as any).context.connectedUser);
  const dispatch = useDispatch();

  const [team, setTeam] = useState();
  const params = useParams();

  useEffect(() => {
    Services.teamFull(params.teamSettingId).then(setTeam);
  }, []);

  if (!team) {
    return null;
  }

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Can I={manage} a={tenant} dispatchError>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <TeamMembersSimpleComponent
        currentTeam={team}
        connectedUser={connectedUser}
        updateTeam={(team: any) => Promise.resolve(setTeam(team))}
        openInvitationModal={(p: any) => openInvitationTeamModal(p)(dispatch)}
      />
    </Can>
  );
};
