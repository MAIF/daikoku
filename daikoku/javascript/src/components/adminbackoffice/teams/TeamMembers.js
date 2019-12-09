import React, { Component } from 'react';
import { connect } from 'react-redux';

import * as Services from '../../../services';
import { UserBackOffice, TeamMembersSimpleComponent } from '../../backoffice';
import { Can, manage, daikoku } from '../../utils';

class TeamMembersComponent extends Component {
  state = {
    team: null,
  };

  componentDidMount() {
    this.updateMembers();
  }

  updateMembers = () => {
    Services.teamFull(this.props.match.params.teamSettingId).then(team => {
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
        <Can I={manage} a={daikoku} dispatchError>
          <TeamMembersSimpleComponent
            currentTeam={this.state.team}
            connectedUser={this.props.connectedUser}
            updateTeam={team => Promise.resolve(this.setState({ team }))}
          />
        </Can>
      </UserBackOffice>
    );
  }
}

const mapStateToProps = state => ({
  ...state.context,
});

export const TeamMembersForAdmin = connect(mapStateToProps)(TeamMembersComponent);
