import React, { useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { useParams } from 'react-router-dom';
import { openInvitationTeamModal } from '../../../core';

import * as Services from '../../../services';
import { UserBackOffice, TeamMembersSimpleComponent } from '../../backoffice';
import { Can, manage, tenant } from '../../utils';

const TeamMembersComponent = (props) => {
  const [team, setTeam] = useState()
  const params = useParams()

  useEffect(() => {
    Services.teamFull(params.teamSettingId)
      .then(setTeam);
  }, [])

  if (!team) {
    return null;
  }

  return (
    <UserBackOffice tab="Teams">
      <Can I={manage} a={tenant} dispatchError>
        <TeamMembersSimpleComponent
          currentTeam={team}
          connectedUser={props.connectedUser}
          updateTeam={(team) => Promise.resolve(setTeam(team))}
          openInvitationModal={props.openInvitationModal}
        />
      </Can>
    </UserBackOffice>
  );
}

const mapStateToProps = (state) => ({
  ...state.context,
});

const mapDispatchToProps = {
  openInvitationModal: (modalProps) => openInvitationTeamModal(modalProps),
};

export const TeamMembersForAdmin = connect(
  mapStateToProps,
  mapDispatchToProps
)(TeamMembersComponent);
