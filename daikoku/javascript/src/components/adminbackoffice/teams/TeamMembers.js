import React, { Component } from 'react';
import { connect } from 'react-redux';
import { openInvitationTeamModal } from '../../../core';

import * as Services from '../../../services';
import { UserBackOffice, TeamMembersSimpleComponent } from '../../backoffice';
import { Can, manage, tenant } from '../../utils';

class TeamMembersComponent extends Component {
  state = {
    team: null,
  };

  componentDidMount() {
    this.updateMembers();
  }

  updateMembers = () => {
    Services.teamFull(this.props.match.params.teamSettingId).then((team) => {
      this.setState({
        team,
      });
    });
  };

  render() {
    if (!this.state.team) {
      return null;
    }

    return (
      <UserBackOffice tab="Teams">
        <Can I={manage} a={tenant} dispatchError>
          <TeamMembersSimpleComponent
            currentLanguage={this.props.currentLanguage}
            currentTeam={this.state.team}
            connectedUser={this.props.connectedUser}
            updateTeam={(team) => Promise.resolve(this.setState({ team }))}
            openInvitationModal={this.props.openInvitationModal}
          />
        </Can>
      </UserBackOffice>
    );
  }
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
